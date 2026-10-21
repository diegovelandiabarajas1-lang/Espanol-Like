// motor-exp · fase P1: la página se reconcilia en vez de repintarse, y los
// controles recuerdan lo que el usuario escribió aunque dejen de pintarse.
// En Chromium de verdad. Cada prueba corre en el clon; las dos que arreglan un
// fallo del LTS corren ADEMÁS en el LTS, para dejar escrito que allí falla.
const path = require('path');
const R = require('../rutas.js');
const { montar, correr, turno } = require('./comparar/pagina-comun.js');
const abrirNavegador = require('./navegador.js');

const CLON = R.motor;
const LTS = path.join(R.proyecto, 'motor');

let pasan = 0, fallan = 0;
const fallos = [];
const comprobar = (n, c, extra) => {
  if (c) { pasan++; return; }
  fallan++; fallos.push(`✗ ${n}` + (extra !== undefined ? `\n    → ${String(extra).slice(0, 300)}` : ''));
};

(async () => {
  const nav = await abrirNavegador(`0 pasan, 0 fallan · saltada entera`);
  const page = await nav.newPage();
  const ev = f => page.evaluate(f);

  async function programa(src, dir = CLON) {
    await montar(page, dir);
    const r = await correr(page, src);
    if (!r.ok) throw new Error('el programa falló: ' + r.errores.join(' | '));
  }
  // Escribir de verdad: foco y teclas, como una persona.
  async function teclear(selector, texto) { await page.focus(selector); await page.keyboard.type(texto); }

  try {
    // ══════════════════════ 1. reconciliar: el mismo elemento sigue ahí
    const LISTA = `
var n = 0
fn repintar(k) {
  limpiarPagina()
  var filas = []
  para i en rango(50) { agregar(filas, etiqueta("li", "fila " + texto(i))) }
  pintar(etiqueta("h1", "Título " + texto(k)), etiqueta("ul", filas))
}
repintar(0)`;
    await programa(LISTA);
    await ev(() => { document.querySelector('#pagina h1').__marca = 1; document.querySelector('#pagina li').__marca = 2; });
    await turno(page, 'repintar', [1]);
    comprobar('repintar con la misma forma reutiliza los mismos elementos',
      await ev(() => document.querySelector('#pagina h1').__marca === 1 && document.querySelector('#pagina li').__marca === 2));
    comprobar('y el texto que cambió sí cambió', (await ev(() => document.querySelector('#pagina h1').textContent)) === 'Título 1');
    const muts = await ev(() => new Promise(res => {
      let n = 0;
      const o = new MutationObserver(m => { n += m.length; });
      o.observe(document.querySelector('#pagina'), { subtree: true, childList: true, attributes: true, characterData: true });
      const { anf, motor } = window.__n;
      anf.turno(motor.vm, motor.vm.globals.get('repintar'), [1]);
      setTimeout(() => { o.disconnect(); res(n); }, 0);
    }));
    comprobar('un repintado que no cambia nada no toca el DOM (0 mutaciones)', muts === 0, muts);
    const muts1 = await ev(() => new Promise(res => {
      let n = 0;
      const o = new MutationObserver(m => { n += m.length; });
      o.observe(document.querySelector('#pagina'), { subtree: true, childList: true, attributes: true, characterData: true });
      const { anf, motor } = window.__n;
      anf.turno(motor.vm, motor.vm.globals.get('repintar'), [2]);
      setTimeout(() => { o.disconnect(); res(n); }, 0);
    }));
    comprobar('cambiar un texto entre 51 nodos es UNA mutación', muts1 === 1, muts1);
    // En el LTS, el mismo repintado vacío reconstruye todo.
    await programa(LISTA, LTS);
    const mutsLTS = await ev(() => new Promise(res => {
      let n = 0;
      const o = new MutationObserver(m => { for (const x of m) n += x.addedNodes.length + x.removedNodes.length; });
      o.observe(document.querySelector('#pagina'), { subtree: true, childList: true });
      const { anf, motor } = window.__n;
      anf.turno(motor.vm, motor.vm.globals.get('repintar'), [0]);
      setTimeout(() => { o.disconnect(); res(n); }, 0);
    }));
    comprobar('(LTS, para que conste) el mismo repintado vacío quita y pone nodos', mutsLTS > 50, mutsLTS);

    // ══════════════════════ 2. lo escrito sobrevive al repintado (ya pasaba) y al reloj
    const RELOJ = `
var t = 0
fn tic() { t = t + 1
  repintar() }
fn repintar() {
  limpiarPagina()
  pintar(etiqueta("p", "t=" + texto(t)), entrada("Nombre"), entrada("Correo"))
}
repintar()`;
    await programa(RELOJ);
    await teclear('#pagina input', 'Diego');
    for (let i = 0; i < 5; i++) await turno(page, 'tic');
    await page.keyboard.type(' V');
    const v = await ev(() => [...document.querySelectorAll('#pagina input')].map(x => x.value));
    comprobar('lo tecleado y el foco sobreviven a 5 repintados', v[0] === 'Diego V' && v[1] === '', v);
    comprobar('el foco sigue en la misma caja', await ev(() => document.activeElement === document.querySelector('#pagina input')));

    // ══════════════════════ 3. EL FALLO 2: un control que deja de pintarse lo recuerda
    const PANEL = `
var abierto = cierto
fn alternar() { abierto = no abierto
  repintar() }
fn repintar() {
  limpiarPagina()
  si abierto { pintar(etiqueta("div", entrada("Observaciones"), casilla("Urgente"))) }
  pintar(boton("alternar", alternar))
}
repintar()`;
    for (const [quien, dir] of [['clon', CLON], ['LTS', LTS]]) {
      await programa(PANEL, dir);
      await teclear('#pagina input[type=text], #pagina input:not([type])', 'llamar el lunes');
      await page.click('#pagina input[type=checkbox]');
      await turno(page, 'alternar');   // se cierra el panel
      await turno(page, 'alternar');   // se vuelve a abrir
      const r = await ev(() => ({ t: document.querySelector('#pagina input:not([type=checkbox])').value, c: document.querySelector('#pagina input[type=checkbox]').checked }));
      if (quien === 'clon') comprobar('clon: cerrar y abrir el panel conserva lo escrito y la casilla', r.t === 'llamar el lunes' && r.c === true, JSON.stringify(r));
      else comprobar('(LTS, para que conste) cerrar y abrir el panel lo pierde', r.t === '' && r.c === false, JSON.stringify(r));
    }

    // ══════════════════════ 4. EL FALLO 2b: quitar un trozo de DELANTE no desplaza la identidad
    const DESPLAZA = `
var aviso = cierto
fn quitarAviso() { aviso = falso
  repintar() }
fn repintar() {
  limpiarPagina()
  si aviso { pintar(etiqueta("p", "Bienvenido"), entrada("Buscar")) }
  pintar(entrada("Nombre"), entrada("Ciudad"))
}
repintar()`;
    for (const [quien, dir] of [['clon', CLON], ['LTS', LTS]]) {
      await programa(DESPLAZA, dir);
      const ins = 'xpath=//*[@id="pagina"]//label[span[text()="Nombre"]]/input';
      await page.focus(ins); await page.keyboard.type('Ana');
      await page.focus('xpath=//*[@id="pagina"]//label[span[text()="Ciudad"]]/input'); await page.keyboard.type('Girón');
      await page.evaluate(() => document.activeElement.blur());
      await turno(page, 'quitarAviso');
      const r = await ev(() => Object.fromEntries([...document.querySelectorAll('#pagina label')].map(l => [l.querySelector('span').textContent, l.querySelector('input').value])));
      if (quien === 'clon') comprobar('clon: quitar lo de arriba deja cada texto en SU caja', r.Nombre === 'Ana' && r['Ciudad'] === 'Girón', JSON.stringify(r));
      else comprobar('(LTS, para que conste) quitar lo de arriba mueve o pierde los textos', !(r.Nombre === 'Ana' && r['Ciudad'] === 'Girón'), JSON.stringify(r));
    }

    // ══════════════════════ 5. lo demás sigue igual
    await programa(`
var cuenta = 0
var etiqueta1 = "uno"
fn mas() { cuenta = cuenta + 1
  etiqueta1 = "dos"
  repintar() }
fn repintar() { limpiarPagina()
  pintar(etiqueta("span", texto(cuenta), {"clase": "c" + texto(cuenta)}), boton(etiqueta1, mas)) }
repintar()`);
    await page.click('#pagina button'); await page.click('#pagina button');
    const r5 = await ev(() => ({ s: document.querySelector('#pagina span').textContent, cl: document.querySelector('#pagina span').className, b: document.querySelector('#pagina button').textContent }));
    comprobar('un botón reutilizado llama a la función de ahora y cambia su rótulo', r5.s === '2' && r5.b === 'dos', JSON.stringify(r5));
    comprobar('los atributos que cambian se actualizan', r5.cl === 'c2', r5.cl);

    await programa(`
var orden = [1, 2, 3, 4]
fn invertir1() { orden = invertir(orden)
  repintar() }
fn repintar() { limpiarPagina()
  var lis = []
  para x en orden { agregar(lis, etiqueta("li", {"clave": "f" + texto(x)}, "fila " + texto(x))) }
  pintar(etiqueta("ul", lis)) }
repintar()`);
    await ev(() => { for (const li of document.querySelectorAll('#pagina li')) li.__soy = li.textContent; });
    await turno(page, 'invertir1');
    const r6 = await ev(() => [...document.querySelectorAll('#pagina li')].map(li => li.__soy + '=' + li.textContent));
    comprobar('con clave, reordenar MUEVE los mismos elementos', r6.join(',') === 'fila 4=fila 4,fila 3=fila 3,fila 2=fila 2,fila 1=fila 1', r6);

    await programa(`
fn repintar(k) { limpiarPagina()
  var lis = []
  para j en rango(300) { fijo i = (j + k) % 300
    agregar(lis, etiqueta("li", {"clave": "f" + texto(i)}, texto(i))) }
  pintar(etiqueta("ul", lis)) }
repintar(0)`);
    const movidos = await ev(() => new Promise(res => {
      let n = 0;
      const o = new MutationObserver(m => { for (const x of m) n += x.addedNodes.length; });
      o.observe(document.querySelector('#pagina ul'), { childList: true });
      const { anf, motor } = window.__n;
      anf.turno(motor.vm, motor.vm.globals.get('repintar'), [1]);
      setTimeout(() => { o.disconnect(); res(n); }, 0);
    }));
    comprobar('rotar una lista con clave un puesto mueve UN nodo, no 300', movidos === 1, movidos);
    comprobar('y queda en el orden bueno', (await ev(() => [...document.querySelectorAll('#pagina li')].slice(0, 3).map(l => l.textContent).join(',') + '…' + document.querySelector('#pagina li:last-child').textContent)) === '1,2,3…0');

    await programa(`
var v = "a"
fn cambiar() { v = "b"
  repintar() }
fn repintar() { limpiarPagina()
  pintar(entrada("Fijo", {"valor": v}), desplegable([["a", "A"], ["b", "B"]], {"valor": v})) }
repintar()`);
    await teclear('#pagina input', 'zzz');
    await turno(page, 'cambiar');
    const r7 = await ev(() => [document.querySelector('#pagina input').value, document.querySelector('#pagina select').value]);
    comprobar('un control gobernado: manda el programa', r7[0] === 'b' && r7[1] === 'b', r7);

    await programa(`
fn repintar(k) { limpiarPagina()
  pintar(crudo("<b>fijo</b><i>dos</i>"), etiqueta("p", texto(k))) }
repintar(0)`);
    await ev(() => { document.querySelector('#pagina b').__m = 1; });
    await turno(page, 'repintar', [1]);
    comprobar('un crudo con el mismo HTML se reutiliza', await ev(() => document.querySelector('#pagina b').__m === 1 && document.querySelectorAll('#pagina b').length === 1));

    await programa(`
fn repintar(n) { limpiarPagina()
  var cosas = []
  para i en rango(n) { agregar(cosas, etiqueta("p", texto(i))) }
  pintar(etiqueta("div", cosas)) }
repintar(10)`);
    await turno(page, 'repintar', [3]);
    comprobar('lo que sobra se quita', (await ev(() => document.querySelectorAll('#pagina p').length)) === 3);
    await turno(page, 'repintar', [6]);
    comprobar('y lo que falta se añade', (await ev(() => [...document.querySelectorAll('#pagina p')].map(p => p.textContent).join(''))) === '012345');

    await programa(`usar estilo de "estilo"
fijo rojo = estilo({"color": "rgb(200, 0, 0)"})
fn repintar(k) { limpiarPagina()
  pintar(etiqueta("p", "x", rojo)) }
repintar(0)`);
    await ev(() => { window.__hoja = document.getElementById('clases-n'); window.__txt = window.__hoja.textContent; });
    await turno(page, 'repintar', [1]);
    comprobar('los estilos siguen aplicándose y la hoja no se reescribe si no cambió',
      await ev(() => getComputedStyle(document.querySelector('#pagina p')).color === 'rgb(200, 0, 0)' && document.getElementById('clases-n') === window.__hoja && window.__hoja.textContent === window.__txt));

    await programa(PANEL);
    await teclear('#pagina input:not([type=checkbox])', 'de otro programa');
    await turno(page, 'alternar');
    await programa(PANEL);
    comprobar('un programa nuevo no hereda la memoria del anterior', (await ev(() => document.querySelector('#pagina input:not([type=checkbox])').value)) === '');

    await programa(`pintar(etiqueta("p", "uno"))
pintar(etiqueta("p", "dos"))`);
    comprobar('pintar sin limpiar sigue añadiendo, como antes', (await ev(() => document.querySelectorAll('#pagina p').length)) === 2);
  } catch (e) {
    fallan++; fallos.push('✗ la prueba reventó: ' + (e && e.stack || e));
  } finally {
    await nav.close();
  }
  console.log('');
  for (const f of fallos) console.log(f);
  console.log(`\n  ${pasan} pasan, ${fallan} fallan\n`);
  process.exit(fallan ? 1 : 0);
})();
