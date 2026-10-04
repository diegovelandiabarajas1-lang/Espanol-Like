// Pruebas del IDE aislado: que todo siga funcionando a través del puente y que
// la frontera aguante programas hostiles.
// playwright es una dependencia de desarrollo y es opcional a propósito: abre un
// Chromium de verdad y pesa cientos de megas. Si no está, esta suite se SALTA en
// vez de reventar — igual que «fuera» cuando no encuentra QuickJS y «nativo»
// cuando no encuentra koffi. Reventar con un volcado de pila hace que quien
// acaba de clonar el proyecto crea que el motor está roto, cuando lo único que
// pasa es que no corrió «npm install».
const abrirNavegador = require('./navegador.js');
const path = require('path');
const URL_IDE = 'file://' + require('../rutas.js').entrega('espanol-like-v4.html');

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
};

(async () => {
  const nav = await abrirNavegador('0 pasan, 0 fallan');
  const ctx = await nav.newContext({ acceptDownloads: true });
  const pag = await ctx.newPage();
  const errosConsola = [];
  pag.on('pageerror', e => errosConsola.push('padre: ' + e.message));
  await pag.goto(URL_IDE);

  const zona = () => pag.frames().find(f => f !== pag.mainFrame());
  const esperarFin = () => pag.waitForFunction(
    () => !document.querySelector('#bRun').disabled && document.querySelector('#estado').textContent.trim() !== '',
    null, { timeout: 25000 });

  const correr = async src => {
    await pag.fill('#editor', src);
    await pag.evaluate(() => document.querySelector('#estado').innerHTML = '');
    await pag.click('#bRun');
    await esperarFin();
    return {
      estado: await pag.textContent('#estado'),
      salida: await zona().$eval('#consola', n => n.innerText).catch(() => ''),
      pagina: await zona().$eval('#pagina', n => n.innerHTML).catch(() => ''),
    };
  };

  console.log('\n── 1. el puente funciona ──');
  await esperarFin();
  comprobar('el marco aislado está montado', !!zona());
  comprobar('el ejemplo inicial corrió', (await pag.textContent('#estado')).includes('terminó'),
    await pag.textContent('#estado'));
  const bienvenida = await zona().$eval('#consola', n => n.innerText);
  comprobar('su salida está dentro de la zona, no en el padre', bienvenida.length > 20, bienvenida.slice(0, 80));
  comprobar('el padre no tiene consola propia', await pag.$('#consola') === null);

  console.log('\n── 2. el motor no vive en el padre ──');
  const enPadre = await pag.evaluate(() => ({
    motor: typeof globalThis.EspanolLike,
    crear: typeof globalThis.crearMotor,
  }));
  comprobar('EspanolLike no está definido en el padre', enPadre.motor === 'undefined', enPadre);
  const enHijo = await zona().evaluate(() => typeof globalThis.EspanolLike);
  comprobar('EspanolLike sí está en la zona', enHijo === 'object', enHijo);

  console.log('\n── 3. la frontera aguanta ──');
  const asalto = await zona().evaluate(() => {
    const r = {};
    const probar = (k, f) => { try { r[k] = 'ALCANZÓ: ' + String(f()).slice(0, 60); } catch (e) { r[k] = 'bloqueado (' + e.name + ')'; } };
    probar('origen', () => location.origin);
    probar('padre.document', () => parent.document.body.innerHTML.length);
    probar('padre.localStorage', () => parent.localStorage.length);
    probar('editor del padre', () => parent.document.querySelector('#editor').value);
    probar('localStorage propio', () => localStorage.length);
    probar('cookies', () => { document.cookie = 'x=1'; return document.cookie; });
    probar('top.location', () => top.location.href);
    return r;
  });
  for (const [k, v] of Object.entries(asalto)) console.log('    ', k.padEnd(18), v);
  comprobar('origen opaco', /: (null|)$/.test(asalto.origen), asalto.origen);
  comprobar('el DOM del padre es inalcanzable', asalto['padre.document'].startsWith('bloqueado'), asalto['padre.document']);
  comprobar('el editor del padre es inalcanzable', asalto['editor del padre'].startsWith('bloqueado'));
  comprobar('el localStorage del padre es inalcanzable', asalto['padre.localStorage'].startsWith('bloqueado'));
  comprobar('sin almacenamiento propio', asalto['localStorage propio'].startsWith('bloqueado'));
  comprobar('sin cookies', asalto.cookies.startsWith('bloqueado') || asalto.cookies === 'ALCANZÓ: ');

  console.log('\n── 4. un programa hostil desde el lenguaje ──');
  const srcHostil = require('fs').readFileSync(require('path').join(__dirname, 'hostil.esl'), 'utf8');
  const hostil = await correr(srcHostil);
  await pag.waitForTimeout(400);
  const editorIntacto = await pag.inputValue('#editor');
  comprobar('el programa terminó', hostil.salida.includes('el programa terminó'), hostil.salida.slice(0, 120));
  comprobar('el editor del padre no fue tocado', editorIntacto === srcHostil, editorIntacto.slice(0, 60));
  comprobar('el HTML hostil se quedó en la zona', hostil.pagina.includes('onerror'), hostil.pagina.slice(0, 80));
  comprobar('el título del padre está intacto', (await pag.title()) !== 'PWNED');

  console.log('\n── 5. todo lo de siempre sigue andando ──');
  const r5 = await correr(`
funcion fib(n: entero) -> entero {
  si n < 2 { devolver n }
  devolver fib(n - 1) + fib(n - 2)
}
imprimir("fib(24) = " + texto(fib(24)))
var xs: lista<entero> = []
para i en rango(1, 41) { agregar(xs, i * i) }
imprimir("suma = " + texto(reducir(xs, funcion(a: entero, b: entero) -> entero { devolver a + b }, 0)))
lienzo(400, 200)
barras([3, 9, 4, 7], ["a", "b", "c", "d"], "prueba")
eco("<h2>hola</h2>")`);
  comprobar('fib recursivo', r5.salida.includes('fib(24) = 46368'), r5.salida.slice(0, 160));
  comprobar('listas y reducir', r5.salida.includes('suma = 22140'), r5.salida.slice(0, 160));
  comprobar('el JIT compiló algo', r5.estado.includes('JIT'), r5.estado);
  comprobar('el lienzo dibujó', await zona().$eval('canvas', c => c.width) === 400);
  comprobar('la página recibió HTML', r5.pagina.includes('<h2>hola</h2>'), r5.pagina.slice(0, 80));

  console.log('\n── 6. los paneles se pintan desde el retrato ──');
  await pag.click('.tab[data-v="bytecode"]');
  const bc = await pag.textContent('#bytecode');
  comprobar('bytecode con instrucciones', bc.includes('fib/1') && bc.includes('CALL'), bc.slice(0, 120));
  comprobar('contador de bytecode', (await pag.textContent('#ptBc')).length > 0);
  await pag.click('.tab[data-v="jit"]');
  const jit = await pag.textContent('#jit');
  comprobar('panel JIT con funciones', jit.includes('fib/1') && jit.includes('compilada'), jit.slice(0, 160));
  await pag.click('.tab[data-v="memoria"]');
  const mem = await pag.textContent('#memoria');
  comprobar('panel de memoria', mem.includes('objetos vivos ahora'), mem.slice(0, 120));

  console.log('\n── 7. verificación en vivo y errores ──');
  await pag.fill('#editor', 'var x: entero = "hola"');
  await pag.waitForFunction(() => document.querySelector('#problemas').children.length > 0, null, { timeout: 5000 });
  const prob = await pag.textContent('#problemas');
  comprobar('el análisis viaja por el puente', prob.includes('entero') && prob.includes('texto'), prob.slice(0, 160));
  comprobar('el chip avisa del error', (await pag.textContent('#estadoTipos')).includes('error'));
  const rerr = await correr('imprimir(1 / 0)');
  comprobar('los errores de ejecución llegan con formato', rerr.salida.toLowerCase().includes('cero'), rerr.salida.slice(0, 160));
  comprobar('el estado marca el fallo', rerr.estado.includes('falló'), rerr.estado);

  console.log('\n── 8. medir velocidad ──');
  await pag.fill('#editor', `
funcion trabajo(n: entero) -> entero {
  var s: entero = 0
  para i en rango(1, n + 1) { s = s + i * i }
  devolver s
}
imprimir(texto(trabajo(300000)))`);
  await pag.click('#bBench');
  await pag.waitForFunction(() => !document.querySelector('#bBench').disabled &&
    document.querySelector('#estado').textContent.includes('×'), null, { timeout: 40000 });
  const est8 = await pag.textContent('#estado');
  const cons8 = await zona().$eval('#consola', n => n.innerText);
  comprobar('mejora medida', /×[\d.]+ más rápido/.test(est8), est8);
  comprobar('tabla comparativa en la zona', cons8.includes('solo intérprete') && cons8.includes('con JIT'), cons8.slice(0, 200));
  comprobar('mismo resultado con y sin JIT', cons8.includes('mismo resultado'), cons8.slice(0, 300));

  console.log('\n── 9. programa desbocado ──');
  // Medición incómoda pero importante: el marco aislado comparte hilo con el
  // padre, así que mientras el programa corre la interfaz se congela. El
  // aislamiento protege la frontera, no la capacidad de respuesta. Se mide
  // para que quede constancia y no se prometa lo que no hay.
  await pag.fill('#editor', 'mientras verdadero { }');
  await pag.waitForTimeout(400);
  const cong = await pag.evaluate(() => new Promise(res => {
    const t = [];
    const iv = setInterval(() => t.push(performance.now()), 20);
    setTimeout(() => {
      document.querySelector('#bRun').click();
      setTimeout(() => {
        clearInterval(iv);
        let hueco = 0;
        for (let i = 1; i < t.length; i++) hueco = Math.max(hueco, t[i] - t[i - 1]);
        res({ hueco: Math.round(hueco), estado: document.querySelector('#estado').textContent.trim() });
      }, 7000);
    }, 200);
  }));
  console.log(`     (el hilo del padre se detuvo ${cong.hueco} ms mientras corría el programa)`);
  comprobar('el presupuesto de instrucciones corta el bucle infinito',
    /falló/.test(cong.estado) && /400\.000\.00/.test(cong.estado), cong.estado);
  comprobar('la congelación sigue siendo la conocida, no algo peor',
    cong.hueco < 6000, cong.hueco);
  const r9 = await correr('imprimir("vivo después del desbocado")');
  comprobar('la zona sobrevive y vuelve a ejecutar', r9.salida.includes('vivo después'), r9.salida.slice(0, 120));

  console.log('\n── 10. el árbol de la página, dentro de la zona ──');
  const r10 = await correr(
    'funcion saludar() {\n' +
    '  pintar(etiqueta("p", {"class": "eco"}, "pulsado"))\n' +
    '  imprimir("me llamaron desde el botón")\n' +
    '}\n' +
    'pintar(etiqueta("div", {"class": "caja"},\n' +
    '  etiqueta("h3", "Título"),\n' +
    '  etiqueta("p", "<b>esto es un dato</b>"),\n' +
    '  boton("Púlsame", saludar)))');
  comprobar('el árbol se pintó anidado',
    /<div class="caja"><h3>Título<\/h3>/.test(r10.pagina), r10.pagina.slice(0, 140));
  comprobar('el botón quedó DENTRO del div, no suelto',
    /<div class="caja">[\s\S]*<button type="button">Púlsame<\/button>[\s\S]*<\/div>/.test(r10.pagina), r10.pagina.slice(0, 200));
  comprobar('el dato con signos no se volvió marcado',
    r10.pagina.includes('&lt;b&gt;esto es un dato&lt;/b&gt;') && !r10.pagina.includes('<b>esto es un dato'),
    r10.pagina.slice(0, 200));
  await zona().click('#pagina button');
  await pag.waitForTimeout(300);
  const trasClic = await zona().$eval('#consola', n => n.innerText);
  comprobar('el clic entró al intérprete', trasClic.includes('me llamaron desde el botón'), trasClic.slice(0, 120));
  comprobar('y lo nuevo se pintó en la página',
    (await zona().$eval('#pagina', n => n.innerHTML)).includes('class="eco"'));
  const r10b = await correr('pintar(etiqueta("p", crudo("<i>a propósito</i>")))');
  comprobar('crudo() sigue metiendo HTML cuando se pide', r10b.pagina.includes('<i>a propósito</i>'), r10b.pagina.slice(0, 120));

  console.log('\n── 11. exportar e importar bytecode ──');
  const fsx = require('fs'), os = require('os'), pth = require('path');
  const prog = 'funcion doble(x: entero) -> entero { devolver x * 2 }\nimprimir("bytecode dice " + texto(doble(21)))';
  await pag.fill('#editor', prog);
  await pag.waitForTimeout(400);
  await pag.click('.tab[data-v="bytecode"]');
  const [descarga] = await Promise.all([
    pag.waitForEvent('download', { timeout: 15000 }),
    pag.click('#bExportar'),
  ]);
  const ruta = pth.join(os.tmpdir(), 'prueba-' + Date.now() + '.elb');
  await descarga.saveAs(ruta);
  const crudo = fsx.readFileSync(ruta);
  comprobar('el archivo se llama .elb', descarga.suggestedFilename().endsWith('.elb'), descarga.suggestedFilename());
  comprobar('empieza por la marca ESLB', crudo.subarray(0, 4).toString('latin1') === 'ESLB', crudo.subarray(0, 8).toString('hex'));
  comprobar('el estado dice el tamaño', (await pag.textContent('#estadoBc')).includes('bytes'), await pag.textContent('#estadoBc'));

  // Se cambia el editor a otra cosa para que quede claro que lo que corre es el
  // archivo y no lo que hay escrito.
  await pag.fill('#editor', 'imprimir("esto NO debería salir")');
  await pag.waitForTimeout(400);
  await pag.setInputFiles('#fBytecode', ruta);
  await pag.waitForFunction(() => document.querySelector('#estado').textContent.includes('terminó'), null, { timeout: 15000 });
  const salBc = await zona().$eval('#consola', n2 => n2.innerText);
  comprobar('corrió el bytecode, no el editor', salBc.includes('bytecode dice 42') && !salBc.includes('NO debería'), salBc.slice(0, 120));
  comprobar('el estado nombra el archivo', (await pag.textContent('#estado')).includes('.elb'), await pag.textContent('#estado'));
  const bcTexto = await pag.textContent('#bytecode');
  comprobar('el panel avisa de que vino de un archivo', bcTexto.includes('cargó desde un archivo'), bcTexto.slice(0, 100));

  // El mismo programa en base64 dentro de un .txt: es lo que se descarga en la
  // versión publicada, donde el navegador no deja bajar un .elb suelto.
  const rutaTxt = ruta.replace('.elb', '.elb.txt');
  fsx.writeFileSync(rutaTxt, crudo.toString('base64').replace(/(.{76})/g, '$1\n'));
  await pag.click('#bLimpiar');
  await pag.setInputFiles('#fBytecode', rutaTxt);
  await pag.waitForFunction(() => document.querySelector('#estado').textContent.includes('terminó'), null, { timeout: 15000 });
  const salTxt = await zona().$eval('#consola', n2 => n2.innerText);
  comprobar('un .txt en base64 se carga igual', salTxt.includes('bytecode dice 42'), salTxt.slice(0, 120));

  // Un archivo estropeado tiene que rebotar con un mensaje, no romper nada.
  const roto = Buffer.from(crudo); roto[20] = (roto[20] + 97) & 255; roto[21] = (roto[21] + 53) & 255;
  const rutaRota = ruta.replace('.elb', '-roto.elb');
  fsx.writeFileSync(rutaRota, roto);
  await pag.setInputFiles('#fBytecode', rutaRota);
  await pag.waitForTimeout(1500);
  const estBc = await pag.textContent('#estadoBc');
  const estGen = await pag.textContent('#estado');
  comprobar('un .elb estropeado se rechaza o se ejecuta, pero nunca rompe',
    /falló|terminó/.test(estGen) && estBc.length > 0, `${estGen} | ${estBc}`);
  const r11 = await correr('imprimir("sigo viva")');
  comprobar('la zona sigue funcionando después', r11.salida.includes('sigo viva'), r11.salida.slice(0, 80));
  fsx.unlinkSync(ruta); fsx.unlinkSync(rutaRota); fsx.unlinkSync(rutaTxt);

  console.log('\n── 11b. una aplicación no pierde lo que el usuario hace ──');
  {
    // Éste era el hallazgo A-1: cada repintado borraba la página entera, así
    // que el foco, lo escrito a medias, el cursor y el desplazamiento se iban
    // con ella. Se mide en el navegador de verdad porque es lo único que lo
    // demuestra.
    await correr(`
usar estilo de "estilo"

var tareas = []
funcion agregarTarea() { agregar(tareas, "tarea " + texto(longitud(tareas) + 1)) ; ver() }
funcion ver() {
  limpiarPagina()
  fijo altas = estilo({"alto": 900})
  pintar(etiqueta("div",
    entrada("Escribe aquí", nulo, {"clave": "campo"}),
    boton("Añadir", agregarTarea, {"clave": "boton"}),
    etiqueta("div", altas, mapear(tareas, funcion(t) { devolver etiqueta("p", t) }))))
}
ver()`);
    const z = zona();
    await z.click('input');
    await z.type('input', 'hola que tal');
    await z.evaluate(() => { document.querySelector('input').setSelectionRange(4, 4); });
    await z.evaluate(() => { document.querySelector('#pagina').scrollTop = 400; });
    const antes = await z.evaluate(() => ({
      activo: document.activeElement.tagName,
      valor: document.querySelector('input').value,
      caret: document.querySelector('input').selectionStart,
      scroll: document.querySelector('#pagina').scrollTop,
    }));
    await z.click('button');
    await pag.waitForTimeout(150);
    const despues = await z.evaluate(() => ({
      activo: document.activeElement.tagName,
      valor: document.querySelector('input').value,
      caret: document.querySelector('input').selectionStart,
      scroll: document.querySelector('#pagina').scrollTop,
      parrafos: document.querySelectorAll('#pagina p').length,
    }));
    console.log('     antes  ', JSON.stringify(antes));
    console.log('     después', JSON.stringify(despues));
    comprobar('el repintado ocurrió de verdad', despues.parrafos === 1, despues);
    // Al pulsar, el foco pasa al botón: eso es lo correcto. Lo que antes pasaba
    // es que tras el repintado no quedaba en ningún sitio (BODY).
    comprobar('el foco se queda donde el usuario lo puso', despues.activo === 'BUTTON', despues.activo);
    comprobar('lo tecleado sigue ahí', despues.valor === 'hola que tal', despues.valor);
    comprobar('el desplazamiento no volvió al principio', despues.scroll === antes.scroll, [antes.scroll, despues.scroll]);
  }
  {
    // El caso que de verdad duele: filtrar una lista mientras se escribe. Cada
    // tecla repinta la página entera, así que si el foco o el cursor no
    // sobreviven, no se puede ni escribir la segunda letra.
    await correr(`
usar minusculas de "texto"

fijo nombres = ["Ana", "Antonio", "Beatriz", "Carlos"]
var filtro = ""
funcion alTeclear(ev) {
  filtro = obtener(ev, "valor", "")
  ver()
}
funcion ver() {
  limpiarPagina()
  fijo vistos = filtrar(nombres, funcion(n) { devolver contiene(minusculas(n), minusculas(filtro)) })
  pintar(etiqueta("div",
    entrada("Buscar", nulo, {"clave": "buscador", "alEscribir": alTeclear}),
    etiqueta("ul", mapear(vistos, funcion(n) { devolver etiqueta("li", n) }))))
}
ver()`);
    const z = zona();
    await z.click('input');
    await z.type('input', 'an', { delay: 40 });
    await pag.waitForTimeout(150);
    const est = await z.evaluate(() => ({
      activo: document.activeElement.tagName,
      valor: document.querySelector('input').value,
      caret: document.querySelector('input').selectionStart,
      items: [...document.querySelectorAll('#pagina li')].map(n => n.textContent),
    }));
    console.log('     tecleando', JSON.stringify(est));
    comprobar('se puede escribir aunque cada tecla repinte', est.valor === 'an', est.valor);
    comprobar('el foco no se cae de la caja', est.activo === 'INPUT', est.activo);
    comprobar('el cursor queda al final de lo escrito', est.caret === 2, est.caret);
    comprobar('y la lista se filtró de verdad', JSON.stringify(est.items) === '["Ana","Antonio"]', est.items);
  }
  {
    // Si el programa cambia de opinión sobre el valor, manda el programa.
    await correr(`
var n = 0
funcion vaciar() { n = n + 1 ; ver() }
funcion ver() {
  limpiarPagina()
  pintar(etiqueta("div",
    entrada("x", nulo, {"clave": "c", "valor": "puesto " + texto(n)}),
    boton("Cambiar", vaciar)))
}
ver()`);
    const z = zona();
    await z.fill('input', 'escrito a mano');
    await z.click('button');
    await pag.waitForTimeout(120);
    comprobar('si el programa declara otro valor, gana el programa',
      (await z.inputValue('input')) === 'puesto 1', await z.inputValue('input'));
  }

  {
    // B-1: el HTML de crudo() lo reequilibra el navegador. Conviene que esté
    // probado y no solo escrito en un comentario.
    const r = await correr('pintar(etiqueta("div", {"id": "c"}, crudo("<span>abre"), etiqueta("b", "hermano")))');
    const forma = await zona().$eval('#c', n => n.innerHTML);
    comprobar('lo que crudo() abre, crudo() lo cierra', forma === '<span>abre</span><b>hermano</b>', forma);
  }

  console.log('\n── 11c. eventos, temporizadores y memoria ──');
  {
    const r = await correr(`
var n = 0
var id = 0
funcion tic() {
  n = n + 1
  si n >= 3 { detener(id) }
  ver()
}
funcion ver() { limpiarPagina() ; pintar(etiqueta("p", {"clave": "n"}, "van " + texto(n))) }
id = cada(30, tic)
ver()`);
    await pag.waitForTimeout(600);
    const txt = await zona().$eval('#pagina', n => n.innerText);
    comprobar('cada() repinta solo y detener() lo para', txt.trim() === 'van 3', txt.trim());
  }
  {
    await correr(`
var pulsos = 0
funcion sube(ev) { pulsos = pulsos + 1 ; ver() }
funcion ver() { limpiarPagina() ; pintar(etiqueta("div", {"alHacerClic": sube, "id": "zona"}, "pulsos: " + texto(pulsos))) }
ver()`);
    const z = zona();
    await z.click('#zona'); await z.click('#zona');
    await pag.waitForTimeout(120);
    comprobar('alHacerClic en un div corriente funciona',
      (await z.$eval('#zona', n => n.innerText)).includes('pulsos: 2'), await z.$eval('#zona', n => n.innerText));
    const marcado = await z.$eval('#zona', n => n.getAttribute('onclick'));
    comprobar('y no deja un onclick en el marcado', marcado === null, marcado);
  }
  {
    const clave = 'prueba-' + Date.now();
    await correr(`guardar("${clave}", {"visitas": 1, "quien": "Diego"})\nimprimir("guardado")`);
    const r2 = await correr(`fijo d = recuperar("${clave}", {})\nimprimir(d["visitas"], d["quien"])`);
    comprobar('lo guardado sobrevive a otra ejecución', r2.salida.includes('1 Diego'), r2.salida.slice(0, 120));
    const enPadre = await pag.evaluate(k => localStorage.getItem('n:alm:' + k), clave);
    comprobar('y vive en el padre, que es quien tiene origen de verdad', typeof enPadre === 'string', enPadre);
    const enZona = await zona().evaluate(() => { try { return 'ALCANZÓ ' + localStorage.length; } catch (e) { return 'bloqueado'; } });
    comprobar('la zona sigue sin poder tocar localStorage', enZona === 'bloqueado', enZona);
    await correr(`olvidar("${clave}")`);
  }
  {
    const r = await correr(`
fijo temporizadores = mapear(rango(80), funcion(i) { devolver 1 })
para i en rango(80) { cada(20, funcion() { }) }
imprimir("no debería llegar")`);
    comprobar('pasarse de temporizadores se para con un error, no cuelga la pestaña',
      !r.salida.includes('no debería llegar') && /falló|error/i.test(r.estado + r.salida), r.estado + ' | ' + r.salida.slice(0, 120));
  }
  await correr('imprimir("limpio")');

  console.log('\n── 11d. exportar como aplicación ──');
  {
    // La prueba de que «se pueden crear apps» no es que el IDE la pinte: es que
    // el archivo que sale de aquí se abra solo, en otra pestaña sin IDE
    // ninguno, y siga funcionando después de recargar.
    await pag.selectOption('#selEj', 'Una aplicación de verdad');
    const destino = require('path').join(require('os').tmpdir(), 'app-exportada-prueba.html');
    let dl = null;
    try {
      [dl] = await Promise.all([pag.waitForEvent('download', { timeout: 20000 }), pag.click('#bApp')]);
      await dl.saveAs(destino);
    } catch (e) { comprobar('el IDE entrega el archivo', false, String(e.message).slice(0, 120)); }
    if (dl) {
      const tam = require('fs').statSync(destino).size;
      // Contra el tamaño del motor, no contra un número fijo: la aplicación
      // exportada lleva UNA copia del motor más el programa, así que crece
      // cuando el motor crece. Un límite absoluto se rompe cada vez que se
      // añade un eDSL, y lo que se quiere comprobar no es el peso sino que no
      // sea un esqueleto (falta el motor) ni lleve el IDE dentro (443 KB más).
      const tamMotor = require('fs').statSync(require('path').join(__dirname, '..', 'bundle.js')).size;
      comprobar('sale un solo archivo, y no es un esqueleto',
        tam > tamMotor * 0.9 && tam < tamMotor + 80 * 1024, `${tam} con un motor de ${tamMotor}`);
      comprobar('con el nombre del programa', /^una-aplicacion-de-verdad\.html$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      const texto = require('fs').readFileSync(destino, 'utf8');
      comprobar('no lleva el editor dentro', !texto.includes('id="editor"') && !texto.includes('<iframe'), texto.length);

      const app = await pag.context().newPage();
      const malApp = [];
      app.on('pageerror', e => malApp.push(String(e.message)));
      await app.goto('file://' + destino);
      await app.waitForTimeout(700);
      const texto1 = await app.$eval('#pagina', n => n.innerText);
      comprobar('la aplicación corre sola, sin IDE', texto1.includes('Tareas'), texto1.slice(0, 80));
      const campo = t => `#pagina label.el-campo:has(span.el-rotulo:text-is("${t}")) input`;
      await app.click(campo('Nueva tarea'));
      await app.type(campo('Nueva tarea'), 'desde la app', { delay: 10 });
      await app.press(campo('Nueva tarea'), 'Enter');
      await app.waitForTimeout(300);
      comprobar('y se puede usar', (await app.$eval('#pagina', n => n.innerText)).includes('desde la app'),
        await app.$eval('#pagina', n => n.innerText));
      const guardado = await app.evaluate(() => localStorage.getItem('n:app:tareas'));
      comprobar('guarda en su propio localStorage, sin puente', typeof guardado === 'string' && guardado.includes('desde la app'), guardado);
      await app.reload();
      await app.waitForTimeout(600);
      comprobar('y lo guardado sobrevive a recargar',
        (await app.$eval('#pagina', n => n.innerText)).includes('desde la app'),
        await app.$eval('#pagina', n => n.innerText));
      comprobar('sin un solo error suelto en la aplicación', malApp.length === 0, malApp);
      await app.close();
      require('fs').unlinkSync(destino);
    }
    await correr('imprimir("sigo aquí")');
  }

  {
    // Escribir despacio mientras un reloj repinta cada segundo. Aquí salieron
    // dos fallos de verdad: el elemento se reemplazaba a media palabra, y
    // quitarlo del DOM disparaba un «change» que llamaba al manejador del
    // programa en mitad del repintado.
    // Tras abrir y cerrar la pestaña de la aplicación exportada, esta página
    // deja de ser la de delante y las teclas no llegan igual.
    await pag.bringToFront();
    const frases = ['Comprar café para la casa', 'Llamar a Ana el miércoles'];
    await correr(`
usar recortar de "texto"

var tareas = []
var borrador = ""
var pulso = 0
var latido = 0
fn escribiendo(ev) { borrador = obtener(ev, "valor", "") }
fn anotar() {
    si recortar(borrador) == "" { devolver }
    agregar(tareas, borrador)
    borrador = ""
    ver()
}
fn ver() {
    limpiarPagina()
    pintar(etiqueta("div",
        etiqueta("p", "reloj: " + texto(pulso)),
        entrada("Nueva", nulo, {"clave": "n", "valor": borrador,
            "alEscribir": escribiendo, "alCambiar": fn(ev) { anotar() }}),
        etiqueta("ul", mapear(tareas, fn(t) { devolver etiqueta("li", t) }))))
}
latido = cada(300, fn() { pulso = pulso + 1  ver() })
ver()`);
    const z = zona();
    const caja = 'label.el-campo input';
    const vistos = [];
    for (const t of frases) {
      await z.click(caja);
      await z.type(caja, t, { delay: 45 });
      // Esperar a que la caja tenga la frase ENTERA antes del Enter. Es lo que
      // esta prueba dice medir —que el repintado no se coma una letra—, y si se
      // comió una, esta espera falla y la prueba falla por lo que debe. Pulsar
      // el Enter sin esperar medía además otra cosa: que confirmar justo en el
      // milisegundo de un repintado funcione. Eso es un fallo de verdad y
      // distinto (el repintado le escribe el valor a la caja y con eso el
      // navegador deja de considerarla cambiada, así que se traga el «change»),
      // está arreglado en el anfitrión con un Enter propio, y mezclarlo aquí
      // hacía que esta prueba fallara dos veces de cada tres sin decir por qué.
      await z.waitForFunction(
        esperado => document.querySelector('label.el-campo input').value === esperado,
        t, { timeout: 8000 }).catch(() => {});
      await z.press(caja, 'Enter');
      // Esperar a que la tarea aparezca, no un tiempo fijo: con un reloj
      // repintando por debajo, un número de milisegundos es una moneda al aire.
      const n = vistos.length + 1;
      await z.waitForFunction(k => document.querySelectorAll('#pagina li').length >= k, n, { timeout: 8000 })
        .catch(() => {});
      vistos.push(await z.$$eval('#pagina li', ns => ns.map(x => x.textContent)));
    }
    const items = vistos[vistos.length - 1];
    comprobar('teclear mientras un reloj repinta no pierde ni una letra',
      JSON.stringify(items) === JSON.stringify(frases), items);
    const vacia = await z.inputValue(caja);
    comprobar('y la caja gobernada se vacía sola al añadir', vacia === '', JSON.stringify(vacia));
    await correr('imprimir("fin")');
  }

  {
    // El estilo que escribe el programa tiene que ganarle a la hoja base. Con
    // «#pagina button» no ganaba: id+elemento le gana a una clase, así que el
    // botón salía morado dijera lo que dijera el programa.
    await correr(`
usar estilo de "estilo"

fijo mio = estilo({"fondo": "transparente", "color": "rojo", "borde": "ninguno"})
fijo caja = estilo({"fondo": "amarillo", "relleno": 20})
pintar(etiqueta("div", caja, boton("x", nulo, mio), entrada("y", nulo, mio)))`);
    const v = await zona().evaluate(() => {
      const g = s => {
        const e = document.querySelector(s);
        if (!e) return { falta: s };
        const c = getComputedStyle(e);
        return { fondo: c.backgroundColor, color: c.color, borde: c.borderTopWidth };
      };
      return { boton: g('#pagina button'), campo: g('#pagina input') };
    });
    comprobar('el estilo del programa le gana a la hoja base en un botón',
      v.boton.fondo === 'rgba(0, 0, 0, 0)' && v.boton.color === 'rgb(255, 0, 0)' && v.boton.borde === '0px', v.boton);
    comprobar('y también en una caja de texto',
      v.campo.fondo === 'rgba(0, 0, 0, 0)' && v.campo.borde === '0px', v.campo);
  }
  {
    // Y los valores en español tienen que llegar traducidos al navegador.
    await correr(`usar estilo de "estilo"
pintar(etiqueta("p", estilo({"color": "verde", "alinear": "centro", "grosor": "negrita"}), "x"))`);
    const v = await zona().evaluate(() => {
      const c = getComputedStyle(document.querySelector('#pagina p'));
      return { color: c.color, alinear: c.textAlign, grosor: c.fontWeight };
    });
    comprobar('«verde», «centro» y «negrita» llegan al navegador como CSS de verdad',
      v.color === 'rgb(0, 128, 0)' && v.alinear === 'center' && v.grosor === '700', v);
  }

  console.log('\n── 11e. red, con permiso ──');
  {
    // Un servidor de verdad en local. La zona tiene origen opaco, así que sin
    // «Access-Control-Allow-Origin: *» no habría respuesta: eso también se
    // comprueba, porque es la limitación real de pedir() desde el IDE.
    const http = require('http');
    const srv = http.createServer((req, res) => {
      let cuerpo = '';
      req.on('data', c => cuerpo += c);
      req.on('end', () => {
        const cab = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json;charset=utf-8' };
        if (req.url === '/saluda') { res.writeHead(200, cab); res.end(JSON.stringify({ hola: 'Diego', lista: [1, 2, 3] })); return; }
        if (req.url === '/eco') { res.writeHead(200, cab); res.end(JSON.stringify({ metodo: req.method, recibido: cuerpo })); return; }
        if (req.url === '/roto') { res.writeHead(500, cab); res.end('no'); return; }
        if (req.url === '/cerrado') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('sin CORS'); return; }
        res.writeHead(404, cab); res.end('{}');
      });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + srv.address().port;
    const z0 = () => zona();

    const conPermiso = async (src, aceptar) => {
      await pag.fill('#editor', src);
      await pag.click('#bRun');
      await pag.waitForTimeout(400);
      const z = z0();
      const caja = await z.$('.n-permiso');
      if (caja) await z.click(aceptar === false ? '.n-permiso .n-no' : '.n-permiso .n-si');
      await pag.waitForTimeout(900);
      return (await z.$eval('#consola', n => n.innerText)).trim();
    };

    const r1 = await conPermiso(`
usar suma de "numerico"
fn llego(r) {
    si r["ok"] {
        fijo d = deJson(r["cuerpo"])
        imprimir("saludo a " + d["hola"] + " suma " + texto(suma(d["lista"])) + " tipo " + r["tipo"])
    } sino { imprimir("falló: " + r["error"]) }
}
pedir("${base}/saluda", llego)
imprimir("sigue corriendo")`);
    comprobar('el programa no se queda esperando la respuesta',
      r1.split('\n')[0].includes('sigue corriendo'), r1.slice(0, 120));
    comprobar('la respuesta llega como un turno y deJson la abre',
      r1.includes('saludo a Diego suma 6 tipo application/json'), r1);

    const r2 = await conPermiso(`
pedir("${base}/eco", {"metodo": "POST", "cuerpo": aJson({"n": 7})}, fn(r) {
    fijo d = deJson(r["cuerpo"])
    imprimir(d["metodo"] + " · " + d["recibido"])
})`);
    comprobar('se puede mandar un POST con cuerpo', r2.includes('POST · {"n":7}'), r2);

    const r3 = await conPermiso(`pedir("${base}/roto", fn(r) { imprimir(texto(r["ok"]) + " " + texto(r["estado"])) })`);
    comprobar('un 500 llega como respuesta, no como fallo del motor', r3.includes('falso 500'), r3);

    const r4 = await conPermiso(`pedir("${base}/cerrado", fn(r) { imprimir(texto(r["ok"]) + " | " + r["error"]) })`);
    comprobar('sin cabecera de CORS la petición no pasa, y se dice', /^falso \|/.test(r4) && r4.length > 8, r4);

    // El permiso se recuerda dentro de la sesión: la segunda vez no pregunta.
    await pag.fill('#editor', `pedir("${base}/saluda", fn(r) { imprimir("segunda: " + texto(r["ok"])) })`);
    await pag.click('#bRun');
    await pag.waitForTimeout(900);
    const z = z0();
    comprobar('no vuelve a preguntar por el mismo sitio', (await z.$('.n-permiso')) === null);
    comprobar('y la segunda petición pasa sola',
      (await z.$eval('#consola', n => n.innerText)).includes('segunda: cierto'),
      await z.$eval('#consola', n => n.innerText));

    // Decir que no tiene que significar que no.
    const r5 = await conPermiso(`pedir("http://otro.invalido.test/x", fn(r) { imprimir("resp: " + texto(r["ok"]) + " " + r["error"]) })`, false);
    comprobar('decir que no corta la petición antes de salir', r5.includes('sin permiso para http://otro.invalido.test'), r5);

    const r6 = await correr('pedir("ftp://x/y", fn(r) { })');
    comprobar('solo http y https', /http:\/\/ o https:\/\//.test(r6.salida), r6.salida.slice(0, 120));
    const r7 = await correr('pedir("' + base + '/x", {"cabeceras": {"X-Malo": "a\nb"}}, fn(r) { })');
    comprobar('una cabecera con salto de línea se rechaza', /salto de línea/.test(r7.salida), r7.salida.slice(0, 120));

    srv.close();
  }

  console.log('\n── 12. sin errores sueltos ──');
  const frontera = errosConsola.filter(e => /cross-origin|Blocked a frame|SecurityError/i.test(e));
  const otros = errosConsola.filter(e => !frontera.includes(e));
  console.log(`     (${frontera.length} error(es) de origen cruzado: son los intentos del programa hostil rebotando)`);
  comprobar('los intentos hostiles rebotaron en la frontera', frontera.length >= 2, frontera.length);
  comprobar('ningún otro error suelto', otros.length === 0, otros);

  await nav.close();
  console.log(`\n${ok} pasan, ${mal} fallan\n`);
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('la prueba reventó:', e); process.exit(1); });
