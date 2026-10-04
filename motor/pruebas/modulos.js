// Módulos: «usar», «publico», el ámbito de cada archivo, la ejecución única,
// los ciclos y la resolución de rutas.
//
// Casi todo se prueba lanzando los intérpretes de verdad —el de Node siempre, el
// de QuickJS si el binario está—, como en `fuera.js`, porque un módulo es un
// archivo en un disco y el cargador es del anfitrión: probarlo con un anfitrión
// de mentira sería probar el de mentira. Lo que sí se prueba en proceso es lo
// contrario: que sin anfitrión de módulos —dentro del navegador— «usar» no
// exista y lo diga.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 400) : ''); }
};

const hayQjs = spawnSync('qjs', ['--help'], { encoding: 'utf8' }).status !== null;
const motores = ['node'].concat(hayQjs ? ['qjs'] : []);
console.log(hayQjs ? '  (se prueban Node y QuickJS)' : '  (QuickJS no está aquí: solo se prueba Node)');

const taller = fs.mkdtempSync(path.join(os.tmpdir(), 'n-modulos-'));
function escribir(rel, texto) {
  const f = path.join(taller, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, texto, 'utf8');
  return f;
}

// Lanza un archivo ya escrito por el intérprete que se diga.
function correr(motor, archivo, args) {
  const r = motor === 'node'
    ? spawnSync(process.execPath, [R.util('n-node.js'), archivo].concat(args || []), { encoding: 'utf8' })
    : spawnSync('qjs', ['--std', R.util('n.js'), archivo].concat(args || []), { encoding: 'utf8' });
  return { salida: (r.stdout || '').trim(), error: (r.stderr || '').trim(), codigo: r.status };
}

// Cada caso corre por todos los intérpretes y tiene que dar lo mismo en todos.
// Lo segundo importa tanto como lo primero: un cargador de módulos escrito dos
// veces se separa en cuanto nadie compara las dos.
function enTodos(nombre, archivo, esperado, args) {
  const vistos = motores.map(m => [m, correr(m, archivo, args)]);
  for (const [m, r] of vistos) {
    const bien = typeof esperado === 'function' ? esperado(r) : r.salida === esperado;
    comprobar(`${nombre} · ${m}`, bien, `salida: ${r.salida}\n      error: ${r.error}\n      código: ${r.codigo}`);
  }
  if (vistos.length > 1) {
    const igual = t => t.replace(/ \([A-Z]{2,}\)/g, '');
    comprobar(`${nombre} · los dos dicen lo mismo`,
      igual(vistos[0][1].salida) === igual(vistos[1][1].salida) && vistos[0][1].codigo === vistos[1][1].codigo,
      vistos.map(([m, r]) => m + ': ' + r.salida).join('\n      '));
  }
}

// ===========================================================================
console.log('\n── 1. importar y usar ──');

escribir('mates.esl', `
# Lo que no lleva «publico» no sale de aquí.
fijo SEMILLA = 41
fn interno(x: entero) -> entero { devolver x * 2 }

publico fijo VERSION: texto = "1.0"
publico fn sumar(a: entero, b: entero) -> entero { devolver a + b }
publico fn doble(x: entero) -> entero { devolver interno(x) }
publico fn semilla() -> entero { devolver SEMILLA }
`);

enTodos('espacio de nombres: usar "…" como m', escribir('uno.esl', `
usar "mates.esl" como mates
imprimir(mates.VERSION, mates.sumar(2, 3), mates.doble(7), mates.semilla())
`), '1.0 5 14 41');

enTodos('nombres sueltos: usar a, b de "…"', escribir('dos.esl', `
usar sumar, doble de "mates.esl"
imprimir(sumar(2, 3), doble(7))
`), '5 14');

enTodos('las dos formas conviven sobre el mismo módulo', escribir('tres.esl', `
usar "mates.esl" como m
usar sumar de "mates.esl"
imprimir(sumar(1, 1) == m.sumar(1, 1))
`), 'cierto');

escribir('capa1.esl', `
usar adornar de "capa2.esl"
publico fn saludo(n: texto) -> texto { devolver adornar("hola " + n) }
`);
escribir('capa2.esl', `
publico fn adornar(t: texto) -> texto { devolver t + "!" }
`);
enTodos('un módulo puede importar otro (cadena de tres)', escribir('cadena.esl', `
usar saludo de "capa1.esl"
imprimir(saludo("Ana"))
`), 'hola Ana!');

enTodos('el tipo anotado en el módulo se comprueba en quien lo usa', escribir('tipos-mal.esl', `
usar sumar de "mates.esl"
imprimir(sumar("a", "b"))
`), r => r.codigo === 1 && r.salida.includes('se esperaba entero y llegó texto'));

enTodos('y por el espacio de nombres también', escribir('tipos-mal2.esl', `
usar "mates.esl" como m
var x: entero = m.VERSION
`), r => r.codigo === 1 && r.salida.includes('se declaró como entero pero recibe texto'));

// ===========================================================================
console.log('\n── 2. cada archivo, su ámbito ──');

enTodos('lo no marcado no existe fuera, ni por su nombre', escribir('priv1.esl', `
usar "mates.esl" como mates
imprimir(SEMILLA)
`), r => r.codigo === 1 && r.salida.includes('«SEMILLA» no está definida'));

enTodos('ni pidiéndolo por su nombre en el «usar»', escribir('priv2.esl', `
usar interno de "mates.esl"
`), r => r.codigo === 1 && r.salida.includes('no exporta «interno»') && r.salida.includes('exporta: VERSION, sumar, doble, semilla'));

enTodos('ni a través del espacio de nombres', escribir('priv3.esl', `
usar "mates.esl" como mates
imprimir(mates.interno(2))
`), r => r.codigo === 1 && r.salida.includes('no exporta «interno»'));

// Dos módulos que usan el mismo nombre para cosas distintas. Si los ámbitos se
// mezclaran, uno pisaría al otro y el segundo ganaría por orden de carga.
escribir('rojo.esl', `
fijo matiz = "rojo"
publico fn dime() -> texto { devolver matiz }
`);
escribir('azul.esl', `
fijo matiz = "azul"
publico fn dime() -> texto { devolver matiz }
`);
enTodos('dos módulos con el mismo nombre dentro no se pisan', escribir('colores.esl', `
usar "rojo.esl" como r
usar "azul.esl" como a
fijo matiz = "verde"
imprimir(r.dime(), a.dime(), matiz)
`), 'rojo azul verde');

// Y al revés: un módulo no ve lo del programa que lo importa.
escribir('curioso.esl', `
publico fn mira() -> texto { devolver DEL_PRINCIPAL }
`);
enTodos('un módulo no ve las variables del programa principal', escribir('curiosear.esl', `
usar mira de "curioso.esl"
fijo DEL_PRINCIPAL = "no deberías verme"
imprimir(mira())
`), r => r.codigo === 1 && r.salida.includes('«DEL_PRINCIPAL» no está definida'));

escribir('usabiblio.esl', `
publico fn cuenta(l: lista) -> entero { devolver longitud(ordenar(l)) }
`);
enTodos('la biblioteca sí la ven todos', escribir('biblio.esl', `
usar cuenta de "usabiblio.esl"
imprimir(cuenta([3, 1, 2]))
`), '3');

// ===========================================================================
console.log('\n── 3. una sola vez, aunque lo importen varios ──');

escribir('ruidoso.esl', `
imprimir("ruidoso se ejecuta")
var cuantas = 0
publico fn marcar() -> entero { cuantas = cuantas + 1  devolver cuantas }
`);
escribir('pasa1.esl', `
usar marcar de "ruidoso.esl"
publico fn a() -> entero { devolver marcar() }
`);
escribir('pasa2.esl', `
usar marcar de "ruidoso.esl"
publico fn b() -> entero { devolver marcar() }
`);
enTodos('el cuerpo del módulo corre una vez y el estado es compartido', escribir('unavez.esl', `
usar a de "pasa1.esl"
usar b de "pasa2.esl"
usar marcar de "ruidoso.esl"
imprimir(a(), b(), marcar(), marcar())
`), 'ruidoso se ejecuta\n1 2 3 4');

enTodos('importar el mismo módulo dos veces en el mismo archivo tampoco lo repite',
  escribir('dosveces.esl', `
usar "ruidoso.esl" como r1
usar marcar de "ruidoso.esl"
imprimir(r1.marcar(), marcar())
`), 'ruidoso se ejecuta\n1 2');

// ===========================================================================
console.log('\n── 4. ciclos ──');

// a importa b, b importa a, y las dos funciones se llaman entre sí. Funciona
// porque el compilador eleva las funciones del archivo antes de los «usar»:
// cuando b empieza, las de a ya están definidas.
escribir('par.esl', `
usar "impar.esl" como impar
publico fn par(n: entero) -> bool {
  si n == 0 { devolver verdadero }
  devolver impar.impar(n - 1)
}
`);
escribir('impar.esl', `
usar "par.esl" como par
publico fn impar(n: entero) -> bool {
  si n == 0 { devolver falso }
  devolver par.par(n - 1)
}
`);
enTodos('un ciclo de dos con funciones mutuas funciona', escribir('ciclo2.esl', `
usar "par.esl" como p
usar "impar.esl" como i
imprimir(p.par(10), i.impar(10), p.par(7), i.impar(7))
`), 'cierto falso falso cierto');

// Tres en círculo, para que no sea un caso especial de dos.
escribir('c-a.esl', `
usar "c-b.esl" como b
publico fn paso(n: entero) -> entero { si n <= 0 { devolver 0 } devolver 1 + b.paso(n - 1) }
`);
escribir('c-b.esl', `
usar "c-c.esl" como c
publico fn paso(n: entero) -> entero { si n <= 0 { devolver 0 } devolver 1 + c.paso(n - 1) }
`);
escribir('c-c.esl', `
usar "c-a.esl" como a
publico fn paso(n: entero) -> entero { si n <= 0 { devolver 0 } devolver 1 + a.paso(n - 1) }
`);
enTodos('un ciclo de tres también', escribir('ciclo3.esl', `
usar "c-a.esl" como a
imprimir(a.paso(9))
`), '9');

// Lo que un ciclo NO puede hacer: leer un valor de nivel superior del otro
// antes de que lo calcule. Eso se dice, con el nombre del módulo y su traza,
// y no es un desbordamiento de pila.
escribir('v-a.esl', `
usar "v-b.esl" como b
publico fijo NOMBRE = "v-a"
imprimir("v-a ve " + b.NOMBRE)
`);
escribir('v-b.esl', `
usar "v-a.esl" como a
publico fijo NOMBRE = "v-b"
imprimir("v-b ve " + a.NOMBRE)
`);
enTodos('un valor leído demasiado pronto en un ciclo se explica, no desborda',
  escribir('cicloval.esl', `
usar "v-a.esl" como a
imprimir(a.NOMBRE)
`), r => r.codigo === 1
    && r.salida.includes('«NOMBRE» de «v-a.esl» todavía no está definida')
    && r.salida.includes('ciclo de importación')
    && !r.salida.includes('desbordamiento')
    && r.salida.includes('en v-b.esl'));

escribir('solo.esl', `
usar "solo.esl" como yo
publico fn hola() -> texto { devolver "hola" }
`);
enTodos('un archivo que se importa a sí mismo no se cuelga', escribir('yo.esl', `
usar "solo.esl" como s
imprimir(s.hola())
`), 'hola');

// ===========================================================================
console.log('\n── 5. rutas ──');

// Relativas al archivo que importa, no al directorio desde el que se lanzó.
escribir('lib/hondo.esl', `
usar vecino de "./al-lado.esl"
publico fn valor() -> entero { devolver vecino() + 1 }
`);
escribir('lib/al-lado.esl', `
publico fn vecino() -> entero { devolver 10 }
`);
enTodos('las rutas son relativas al archivo que importa', escribir('subcarpeta.esl', `
usar valor de "lib/hondo.esl"
imprimir(valor())
`), '11');

escribir('lib/sube.esl', `
usar sumar de "../mates.esl"
publico fn tres() -> entero { devolver sumar(1, 2) }
`);
enTodos('y «..» sale de la carpeta del módulo', escribir('subir.esl', `
usar tres de "lib/sube.esl"
imprimir(tres())
`), '3');

// Dos caminos al mismo archivo son el mismo módulo: la clave es la ruta real.
escribir('lib/apunta.esl', `
usar marcar de "../ruidoso.esl"
publico fn dale() -> entero { devolver marcar() }
`);
enTodos('dos rutas distintas al mismo archivo son un solo módulo', escribir('mismo.esl', `
usar dale de "lib/apunta.esl"
usar marcar de "./ruidoso.esl"
imprimir(dale(), marcar())
`), 'ruidoso se ejecuta\n1 2');

enTodos('una ruta que no existe se dice al analizar, con dónde se buscó',
  escribir('falta.esl', `
usar "no-existe-jamas.esl" como x
imprimir(x.a)
`), r => r.codigo === 1
    && r.salida.includes('[módulos]')
    && r.salida.includes('no existe el módulo «no-existe-jamas.esl»')
    && r.salida.includes('no-existe-jamas.esl)'));

enTodos('una carpeta no es un módulo', escribir('carpeta.esl', `
usar "lib" como x
imprimir(x.a)
`), r => r.codigo === 1 && r.salida.includes('no es un archivo'));

escribir('vuelve.esl', `
usar algo de "raiz.esl"
publico fn vuelta() -> entero { devolver algo() }
`);
enTodos('el programa principal no es un módulo de nadie', escribir('raiz.esl', `
usar vuelta de "vuelve.esl"
publico fn algo() -> entero { devolver 1 }
imprimir(vuelta())
`), r => r.codigo === 1 && r.salida.includes('el programa principal no es un módulo'));

escribir('malo.esl', `
publico fn algo() -> entero {
  devolver 1 +
}
`);
enTodos('un error de sintaxis del módulo se atribuye al módulo', escribir('roto.esl', `
usar algo de "malo.esl"
imprimir(algo())
`), r => r.codigo === 1 && r.salida.includes('[sintaxis] malo.esl línea'));

escribir('malot.esl', `
publico fn algo() -> entero { devolver "no soy entero" }
`);
enTodos('y un error de tipos del módulo, también', escribir('rotot.esl', `
usar algo de 'malot.esl'
imprimir(algo())
`), r => r.codigo === 1 && r.salida.includes('malot.esl línea 2') && r.salida.includes('[tipos]'));

// ===========================================================================
console.log('\n── 6. lo que no se permite, y cómo se dice ──');

const rechaza = (nombre, fuente, trozo) =>
  enTodos(nombre, escribir('r-' + Math.random().toString(36).slice(2) + '.esl', fuente),
    r => r.codigo === 1 && r.salida.includes(trozo));

rechaza('«usar» dentro de una función', 'fn f() { usar "mates.esl" como m }',
  'solo puede ir en el nivel superior');
rechaza('«usar» dentro de un bloque', 'si verdadero { usar "mates.esl" como m }',
  'solo puede ir en el nivel superior');
rechaza('«publico» dentro de una función', 'fn f() { publico fijo x = 1 }',
  'solo puede marcar algo del nivel superior');
rechaza('una ruta con interpolación', 'fijo d = "x"\nusar "{d}/mates.esl" como m',
  'no puede llevar interpolación');
rechaza('«usar» sin «como»', 'usar "mates.esl" m', 'se esperaba «como»');
rechaza('«usar» con nombres y sin «de»', 'usar sumar, doble "mates.esl"', 'falta «de» y la ruta del módulo');
rechaza('un alias repetido', 'usar "mates.esl" como m\nusar "rojo.esl" como m',
  '«m» ya está usado en este archivo');
rechaza('un nombre importado que choca con uno propio',
  'usar sumar de "mates.esl"\nfn sumar(a, b) { devolver 0 }', '«sumar» ya está usado en este archivo');
rechaza('asignar a un nombre importado',
  'usar sumar de "mates.esl"\nsumar = 3', 'no se puede cambiar desde aquí');
rechaza('asignar a un miembro de un módulo',
  'usar "mates.esl" como m\nm.VERSION = "2"', 'no se puede cambiar desde aquí');
rechaza('usar el alias como valor',
  'usar "mates.esl" como m\nfijo x = m', 'es un módulo, no un valor');
rechaza('pasar el alias a una función',
  'usar "mates.esl" como m\nimprimir(m)', 'es un módulo, no un valor');

// Un nombre local con el mismo nombre que un alias manda sobre el alias: si no,
// «fn f(m) { devolver m["x"] }» dejaría de funcionar en cuanto alguien importase
// un módulo llamado «m» en el mismo archivo.
enTodos('un parámetro con el nombre del alias manda sobre el alias',
  escribir('tapa.esl', `
usar "mates.esl" como m
fn f(m: dic) -> entero { devolver m["n"] }
imprimir(f({"n": 7}), m.sumar(1, 1))
`), '7 2');

escribir('tapador.esl', `
publico fn texto(n: entero) -> texto { devolver "nueve" }
`);
enTodos('importar un nombre de la biblioteca es un aviso, no un error',
  escribir('tapabiblio.esl', `
usar texto de "tapador.esl"
imprimir(texto(9))
`), r => r.codigo === 0 && r.salida.includes('nueve'));

// ===========================================================================
console.log('\n── 7. «usar», «como», «de» y «publico» siguen siendo nombres ──');

// No son palabras reservadas: reservar «de» o «como» rompería cualquier programa
// que las use como nombre. Se reconocen solo por la forma de la sentencia.
enTodos('los cuatro valen como variables y como parámetros', escribir('palabras.esl', `
usar sumar de "mates.esl"
var de = 1
var como = 2
var usar = 3
var publico = 4
fn junta(de: entero, como: entero) -> entero { devolver de * 10 + como }
imprimir(de + como + usar + publico, junta(4, 2), sumar(1, 1))
`), '10 42 2');

escribir('orden.esl', `
fijo K = 3
publico fn escala(x: entero) -> entero { devolver x * K }
publico fn impar(x: entero) -> bool { devolver x % 2 == 1 }
`);
enTodos('una función de módulo pasada a mapear, filtrar o reducir', escribir('orden-usa.esl', `
usar escala, impar de "orden.esl"
imprimir(mapear([1, 2, 3, 4], escala), filtrar(rango(10), impar))
imprimir(reducir([1, 2, 3, 4], fn (a, b) { devolver a + escala(b) }, 0))
`), '[3, 6, 9, 12] [1, 3, 5, 7, 9]\n30');

escribir('rompe.esl', `
publico fijo X = 1
imprimir("el módulo empieza")
fijo y = 1 / 0
`);
enTodos('un módulo que falla al cargarse corta el programa y dice dónde',
  escribir('usa-rompe.esl', `
usar "rompe.esl" como r
intentar { imprimir(r.X) } capturar (e) { imprimir("esto no se alcanza") }
`), r => r.codigo === 1
    && r.salida.includes('el módulo empieza')
    && r.salida.includes('división entre cero')
    && r.salida.includes('en rompe.esl')
    && !r.salida.includes('esto no se alcanza'));

// Los «usar» se elevan por delante del resto del archivo: un módulo se carga
// antes de que corra la primera sentencia del programa, así que un «intentar»
// del programa no puede envolverlo. Es a propósito, y esta prueba lo fija.
escribir('cierres.esl', `
publico var clics = 0
publico fn alClic() { clics = clics + 1 }
publico fn cuantos() -> entero { devolver clics }
`);

// ===========================================================================
console.log('\n── 8. el JIT no cambia el resultado ──');

// Una función de un módulo que se llama muchas veces pasa por el JIT, y el JIT
// traduce desde el árbol sintáctico, donde los nombres están sin enlazar. Si el
// JIT y el compilador de bytecode no enlazaran igual, esto daría un resultado
// distinto a partir de la llamada cuarenta.
escribir('calor.esl', `
publico fijo FACTOR = 3
fn interno(x: entero) -> entero { devolver x + FACTOR }
publico fn calc(x: entero) -> entero {
  var s = 0
  var i = 0
  mientras i < 20 { s = s + interno(i) + x  i = i + 1 }
  devolver s
}
`);
enTodos('una función de módulo compilada por el JIT da lo mismo', escribir('jit.esl', `
usar "calor.esl" como c
usar calc de "calor.esl"
var t = 0
var k = 0
mientras k < 300 { t = t + calc(k) + c.calc(k)  k = k + 1 }
imprimir(t, c.FACTOR)
`), '1944000 3');

{
  require(R.bundle);
  const { crearMotor } = globalThis.EspanolLike;
  const modulos = {
    resolver: (espec, desde) => fs.realpathSync(path.resolve(desde ? path.dirname(desde) : taller, espec)),
    leer: clave => fs.readFileSync(clave, 'utf8'),
  };
  const fuente = fs.readFileSync(path.join(taller, 'jit.esl'), 'utf8');
  const clave = fs.realpathSync(path.join(taller, 'jit.esl'));
  const dale = jit => {
    const out = [];
    const m = crearMotor({ salida: s => out.push(s), host: { modulos }, limiteInstr: 4e8, jit });
    const r = m.ejecutar(fuente, clave);
    return { r, out, stats: m.vm.stats };
  };
  const con = dale(true), sin = dale(false);
  comprobar('el JIT se activa de verdad dentro del módulo', con.stats.jitCompiladas > 0 && con.stats.jitFallidas === 0,
    JSON.stringify(con.stats));
  comprobar('y con JIT y sin JIT sale lo mismo', con.r.ok && sin.r.ok && con.out.join('|') === sin.out.join('|'),
    con.out.join('|') + ' ≠ ' + sin.out.join('|'));
}

{
  // Como en interaccion.js: un anfitrión de mentira para poder pulsar el botón
  // a mano. Lo que se comprueba es que el estado del módulo sobrevive a los
  // turnos de interacción —el manejador es de otro archivo— y que una segunda
  // ejecución lo reinicia, porque «una sola vez» es por programa, no por motor.
  require(R.bundle);
  const { crearMotor } = globalThis.EspanolLike;
  const modulos = {
    resolver: (espec, desde) => fs.realpathSync(path.resolve(desde ? path.dirname(desde) : taller, espec)),
    leer: clave => fs.readFileSync(clave, 'utf8'),
  };
  const controles = [];
  const web = {
    abrir() {}, cerrar() {}, texto() {}, eco() {}, asegurarClase() {}, estilo() {},
    control(d, vm) { controles.push({ d, vm }); },
    limpiar() { controles.length = 0; },
  };
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), host: { web, modulos } });
  const app = escribir('app.esl', `
usar "cierres.esl" como v
pintar(boton("dale", v.alClic))
`);
  const r = m.ejecutar(fs.readFileSync(app, 'utf8'), fs.realpathSync(app));
  comprobar('un manejador de eventos puede vivir en un módulo', r.ok && controles.length === 1,
    (r.errores || []).map(e => e.message).join(';'));
  if (controles.length) {
    const c = controles[0];
    for (let i = 0; i < 3; i++) { c.vm.nuevoTurno(); c.vm.invocar(c.d.accion, []); }
  }
  const dos = escribir('app-lee.esl', `
usar cuantos de "cierres.esl"
imprimir(cuantos())
`);
  // La misma corrida no se puede consultar dos veces desde fuera, así que se
  // mira el global del módulo por dentro: es la prueba de que los turnos
  // escribieron en el estado del módulo y no en una copia.
  const clave = fs.realpathSync(escribir('cierres.esl', fs.readFileSync(path.join(taller, 'cierres.esl'), 'utf8')));
  comprobar('y su estado sobrevive a los turnos', m.vm.globals.get(clave + '\u0000clics') === 3,
    String(m.vm.globals.get(clave + '\u0000clics')));
  const r2 = m.ejecutar(fs.readFileSync(dos, 'utf8'), fs.realpathSync(dos));
  comprobar('una ejecución nueva vuelve a correr el módulo desde cero',
    r2.ok && out[out.length - 1] === '0', out.join('|'));
}

// ===========================================================================
console.log('\n── 9. el ejemplo de varios archivos ──');

// Como en fuera.js con informe.esl: el ejemplo que el LEEME enseña tiene que
// correr de verdad, y por los dos intérpretes.
{
  const ej = R.proyecto + '/ejemplos/resumen.esl';
  for (const m of motores) {
    const r = correr(m, ej);
    comprobar(`resumen.esl corre desde otra carpeta · ${m}`,
      r.codigo === 0 && r.salida.includes('media') && r.salida.includes('16.33'),
      r.salida + '\n      ' + r.error);
  }
}

// ===========================================================================
console.log('\n── 10. dentro del navegador no hay módulos, y se dice ──');

{
  require(R.bundle);
  const { crearMotor } = globalThis.EspanolLike;
  // El anfitrión de la zona aislada ofrece página, almacén y tiempo. No ofrece
  // archivos, y por lo mismo no puede ofrecer módulos: no hay disco que leer y
  // el origen es opaco. Traerlos por la red sería el «cargar()» que este
  // proyecto decidió no tener.
  const m = crearMotor({ salida: () => {}, host: { web: {} } });
  const r = m.ejecutar('usar "mates.esl" como m\nimprimir(m.sumar(1, 1))');
  comprobar('sin anfitrión de módulos, «usar» no existe',
    !r.ok && r.errores[0].message.includes('necesita un anfitrión con módulos'),
    (r.errores || []).map(e => e.message).join(';'));
  comprobar('y el mensaje dice dónde sí funcionan',
    !r.ok && /n-node\.js|qjs/.test(r.errores[0].pista || ''), r.errores[0] && r.errores[0].pista);
  comprobar('es un error de la fase «módulos», no un fallo raro de ejecución',
    !r.ok && r.errores[0].fase === 'módulos', r.errores[0] && r.errores[0].fase);
  const limpio = m.ejecutar('imprimir(1 + 1)');
  comprobar('y un programa de un solo archivo sigue corriendo igual sin cargador', limpio.ok,
    (limpio.errores || []).map(e => e.message).join(';'));

  // Un anfitrión que sí los ofrece, pero cuyo cargador se niega: el error tiene
  // que llegar como error de módulos, no como excepción de JavaScript.
  const gruñon = crearMotor({
    salida: () => {},
    host: { modulos: { resolver() { throw new Error('aquí no'); }, leer() { return ''; } } },
  });
  const rg = gruñon.ejecutar('usar "x.esl" como x\nimprimir(x.a)', '/sitio/p.esl');
  comprobar('un cargador que se niega da un error de módulos, no una excepción',
    !rg.ok && rg.errores[0].fase === 'módulos' && rg.errores[0].message.includes('aquí no'),
    (rg.errores || []).map(e => e.fase + ':' + e.message).join(';'));
}

// ===========================================================================
console.log('\n── 11. el .elb y la tabla de instrucciones ──');

{
  require(R.bundle);
  const { crearMotor, OP_NOMBRE, desensamblar } = globalThis.EspanolLike;
  const modulos = {
    resolver: (espec, desde) => fs.realpathSync(path.resolve(desde ? path.dirname(desde) : taller, espec)),
    leer: clave => fs.readFileSync(clave, 'utf8'),
  };
  const m = crearMotor({ salida: () => {}, host: { modulos } });
  // Los módulos no añadieron ni un opcode: «usar» se compila a una llamada a una
  // nativa cuyo nombre el léxico no puede escribir. Por eso los .elb de antes
  // siguen valiendo, y por eso esto sigue funcionando igual que siempre.
  const s1 = m.serializar('fn f(x) { devolver x + 1 }\nimprimir(f(1))');
  comprobar('un programa de un solo archivo se sigue serializando', s1.ok,
    (s1.errores || []).map(e => e.message).join(';'));
  const r1 = m.ejecutarBytecode(s1.bytes);
  comprobar('y su bytecode se sigue ejecutando', r1.ok, (r1.errores || []).map(e => e.message).join(';'));
  // Un programa con «usar» son varios archivos, y el formato guarda uno.
  const s2 = m.serializar(fs.readFileSync(path.join(taller, 'uno.esl'), 'utf8'),
    fs.realpathSync(path.join(taller, 'uno.esl')));
  comprobar('un programa con «usar» no se serializa, y lo dice',
    !s2.ok && s2.errores[0].message.includes('no se puede guardar como .elb'),
    (s2.errores || []).map(e => e.message).join(';'));
  // La huella del .elb se calcula de la tabla de instrucciones. Los módulos no
  // añadieron ninguna: «usar» se compila a una llamada a una nativa cuyo nombre
  // el léxico no puede escribir. Estas tres comprobaciones son las que fijan esa
  // decisión, porque es de lo que depende que los .elb viejos sigan valiendo.
  comprobar('los módulos no añadieron ningún opcode',
    !OP_NOMBRE.some(n => /USAR|MODUL|IMPORT/i.test(n)), OP_NOMBRE.join(','));
  const a = m.analizar(fs.readFileSync(path.join(taller, 'uno.esl'), 'utf8'),
    fs.realpathSync(path.join(taller, 'uno.esl')));
  const texto = desensamblar(a.fn).map(l => l.texto).join('\n');
  comprobar('«usar» se compila a un GET_GLOBAL de « usar» y un CALL',
    a.ok && /GET_GLOBAL.*; " usar"/.test(texto) && /CALL/.test(texto), texto.slice(0, 300));
  const alcance = m.ejecutar('imprimir(usar)');
  comprobar('y ningún programa puede nombrar esa nativa',
    !alcance.ok && alcance.errores[0].message.includes('«usar» no está definida'),
    (alcance.errores || []).map(e => e.message).join(';'));
}

// ===========================================================================
fs.rmSync(taller, { recursive: true, force: true });
// ── el modo es POR ARCHIVO ──────────────────────────────────────────────────
// La propiedad que hace que mudar nombres a un eDSL no parta el ecosistema en
// dos. Si el modo fuera del programa entero, una biblioteca escrita a la vieja
// no serviría en un programa escrito a la nueva y habría que migrar el mundo de
// golpe. Siendo del archivo, cada uno elige y las dos mitades se mezclan.
console.log('\n── el modo de nombres es por archivo ──');
{
  escribir('mezcla/lib-vieja.esl',
    'usar "clasico"\n\npublico fn saludoViejo(n: texto): texto {\n' +
    '    devolver "Hola, " + mayusculas(recortar(n)) + " (vieja)"\n}\n');
  escribir('mezcla/lib-nueva.esl',
    'usar mayusculas, recortar de "texto"\n\npublico fn gritar(n: texto): texto {\n' +
    '    devolver mayusculas(recortar(n)) + "!"\n}\n');
  const nuevoUsaVieja = escribir('mezcla/nuevo.esl',
    'usar mayusculas de "texto"\nusar saludoViejo de "./lib-vieja.esl"\n' +
    'imprimir(mayusculas("prog nuevo"))\nimprimir(saludoViejo(" ana "))\n');
  const viejoUsaNueva = escribir('mezcla/viejo.esl',
    'usar "clasico"\nusar gritar de "./lib-nueva.esl"\n' +
    'imprimir(mayusculas("prog viejo"))\nimprimir(gritar(" ana "))\n');
  for (const m of motores) {
    const a = correr(m, nuevoUsaVieja);
    comprobar(`un programa nuevo usa una biblioteca vieja · ${m}`,
      a.salida === 'PROG NUEVO\nHola, ANA (vieja)', a.salida + ' ' + a.error);
    const b = correr(m, viejoUsaNueva);
    comprobar(`un programa viejo usa una biblioteca nueva · ${m}`,
      b.salida === 'PROG VIEJO\nANA!', b.salida + ' ' + b.error);
  }
  // Y el interruptor de un archivo no se filtra al de al lado.
  const aislado = escribir('mezcla/sin-interruptor.esl',
    'usar saludoViejo de "./lib-vieja.esl"\nimprimir(mayusculas("x"))\n');
  for (const m of motores) {
    const r = correr(m, aislado);
    comprobar(`el «clasico» de la biblioteca no alcanza a quien la importa · ${m}`,
      r.codigo !== 0 && /«mayusculas» no está definida/.test(r.salida + r.error),
      r.salida + ' ' + r.error);
  }
}

// Igual que en fuera.js: la mitad de esta suite corre cada caso por los DOS
// intérpretes. Sin QuickJS son 64 en vez de 156, y sin decirlo aquí parece que
// la suite encogió sola.
console.log(`\n${ok} pasan, ${mal} fallan${hayQjs ? '' : ' · solo Node, QuickJS no está aquí'}\n`);
process.exit(mal ? 1 : 0);
