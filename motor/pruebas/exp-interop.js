// motor-exp · N4.10 «Interoperabilidad directa: C sin capa».
//
//  · cabeceraNativa(biblioteca, "geo.h") en la VM: toda la cabecera de una vez
//    (funciones, #define, enum, estructuras por valor y por puntero —lo que C
//    escribe se ve en el diccionario—, arreglos fijos dentro, un tipo opaco, un
//    puntero a función de typedef como retrollamada) y lo que no se puede, con
//    su porqué (una variádica, una global, una inline, una que la biblioteca no trae);
//  · el ejecutable de n-compilar llama a C DIRECTAMENTE: nativa(…) y
//    cabeceraNativa(…) se leen al compilar, cada función lleva un envoltorio de
//    C y la biblioteca va al enlazador (ldd la ve; no hay koffi ni dlopen). Da lo
//    mismo que la VM, letra por letra;
//  · lo que el ejecutable todavía no sabe pasar (punteros, estructuras,
//    retrollamadas) está en el diccionario y lo dice al llamarlo; en nativa(…)
//    se dice al compilar;
//  · Ñ → C → Ñ: una biblioteca de n-compilar --biblioteca, leída por su .h
//    desde otro programa de Ñ, en la VM y en el ejecutable;
//  · para Windows (si hay mingw): el .exe importa de geo.dll sus funciones.
//
//   node motor/pruebas/exp-interop.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
const N_COMPILAR = path.join(__dirname, '..', 'util', 'n-compilar.js');
const FIX = path.join(__dirname, 'interop');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 10).join('\n      ')}` : '')); }
};
const saltar = (n, por) => { saltadas++; console.log(`  – ${n}: saltada (${por})`); };
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const linux = process.platform === 'linux';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-interop-'));
for (const f of ['geo.h', 'geo.c']) fs.copyFileSync(path.join(FIX, f), path.join(tmp, f));

const sh = (cmd, args, opts) => spawnSync(cmd, args, Object.assign({ encoding: 'utf8', cwd: tmp, maxBuffer: 1 << 26 }, opts || {}));
const escribir = (n, s) => fs.writeFileSync(path.join(tmp, n), s);
const vm = n => { const r = sh(process.execPath, [N_NODE, n]); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: ((r.stderr || '') + (r.stdout || '')).replace(/^.*DeprecationWarning.*$\n?/gm, '').replace(/^\(Use `node --trace.*$\n?/gm, '').trim() }; };
const compilar = (n, extra) => { const r = sh(process.execPath, [N_COMPILAR, n].concat(extra || [])); return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() }; };
const correr = n => { const r = sh(path.join(tmp, n), []); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: ((r.stderr || '') + (r.stdout || '')).trim() }; };

// ── 1. el lector de cabeceras, sin compilar nada ─────────────────────────────
console.log('· leer la cabecera');
{
  const { leerCabecera } = require('../util/cabecera-c.js');
  const h = leerCabecera(fs.readFileSync(path.join(FIX, 'geo.h'), 'utf8'));
  const nombres = h.funciones.map(f => f.nombre);
  comprobar('las funciones, con su firma limpia (sin GEO_API, sin struct)',
    nombres.length === 15 && h.funciones.find(f => f.nombre === 'geo_par').proto === 'int geo_par(GeoPar p)' &&
    h.funciones.find(f => f.nombre === 'geo_nombre').proto === 'const char * geo_nombre()', nombres.join(', '));
  const cs = Object.fromEntries(h.constantes);
  comprobar('#define con cuentas, de texto, y los enum', cs.GEO_MAX === 16 && cs.GEO_MAS === 15 && cs.GEO_PI === 3.14159 &&
    cs.GEO_NOMBRE === 'geo' && cs.GEO_ROJO === 0 && cs.GEO_VERDE === 5 && cs.GEO_AZUL === 6 && !('CUADRADO' in cs), JSON.stringify(h.constantes));
  const caja = h.estructuras.find(e => e.nombre === 'GeoCaja');
  comprobar('estructuras anidadas y con arreglos; el opaco; el puntero a función',
    caja && JSON.stringify(caja.campos) === '[["min","GeoPunto"],["max","GeoPunto"],["color","int32_t"],["pesos","double[3]"]]' &&
    h.opacos.includes('geo_lista') && h.tiposFuncion[0].proto === 'int GeoCmp(int a, int b)', JSON.stringify(h.estructuras) + JSON.stringify(h.tiposFuncion));
  comprobar('lo que no se puede, con su porqué', h.omitidas.map(o => o[0]).join() === 'geo_printf,geo_contador,geo_doble', JSON.stringify(h.omitidas));
}

if (!hay('gcc')) { saltar('todo lo demás', 'no hay gcc'); fin(); }
const lib = sh('gcc', ['-shared', '-fPIC', '-O1', 'geo.c', '-o', 'libgeo.so', '-lm']);
if (lib.status !== 0) { comprobar('libgeo.so compila', false, lib.stderr); fin(); }

// ── 2. la VM: toda la cabecera ───────────────────────────────────────────────
const TODO = `usar cabeceraNativa de "nativo"
usar arreglo de "numerico"
fijo g = cabeceraNativa("./libgeo.so", "geo.h")
imprimir(g.GEO_VERSION, g.GEO_MAX, g.GEO_MAS, g.GEO_VERDE, g.GEO_PI, g.GEO_NOMBRE)
imprimir(g.geo_hipotenusa(3, 4))
fijo m = g.geo_medio({x: 0, y: 0}, {x: 2, y: 4})
imprimir(m.x, m.y)
fijo p = {x: 1, y: 2}
g.geo_mover(p, 10, 20)
imprimir(p.x, p.y)
imprimir(g.geo_area({min: {x: 0, y: 0}, max: {x: 2, y: 3}, color: 1, pesos: [0, 2, 0]}))
imprimir(g.geo_suma(arreglo([1, 2, 3, 4], "entero"), 4))
fijo l = g.geo_lista_nueva()
g.geo_lista_poner(l, 2.5)
g.geo_lista_poner(l, 4)
imprimir(g.geo_lista_suma(l))
fijo w = arreglo([5, 1, 4, 2], "entero")
g.geo_ordenar(w, 4, funcion(a, b) { devolver a - b })
imprimir(w[0], w[1], w[2], w[3])
imprimir(g.geo_par({a: 3, b: 4}), g.geo_u8(255), g.geo_nombre())
para o en g._omitidas { imprimir(o) }
`;
console.log('· cabeceraNativa en la VM');
if (!koffi) saltar('la VM', 'no hay koffi');
else {
  escribir('todo.esl', TODO);
  const r = vm('todo.esl');
  const l = r.out.split('\n');
  comprobar('constantes y una función de números', r.ok && l[0] === '3 16 15 5 3.14159 geo' && l[1] === '5', r.err);
  comprobar('una estructura por valor, ida y vuelta', r.ok && l[2] === '1 2', r.out);
  comprobar('un puntero a estructura: lo que C escribe se ve en el diccionario', r.ok && l[3] === '11 22', r.out);
  comprobar('estructuras anidadas con un arreglo fijo dentro', r.ok && l[4] === '13', r.out);
  comprobar('un arreglo de Ñ a un int32_t * (sin copiar)', r.ok && l[5] === '10', r.out);
  comprobar('un tipo opaco: el puntero se guarda y vuelve a C', r.ok && l[6] === '6.5', r.out);
  comprobar('el puntero a función del typedef: C llama a una función de Ñ', r.ok && l[7] === '1 2 4 5', r.out);
  comprobar('una estructura con «struct GeoPar», un uint8_t que envuelve, y un texto', r.ok && l[8] === '34 0 geo ñ', r.out);
  comprobar('lo omitido, y la que la biblioteca no trae', r.ok && /^geo_printf: tiene «...»/.test(l[9]) && l[12] === 'geo_falta: no está en la biblioteca «./libgeo.so»', l.slice(9).join('\n'));
}

// ── 3. el ejecutable: C sin capa ─────────────────────────────────────────────
const DIRECTO = `usar cabeceraNativa de "nativo"
fijo g = cabeceraNativa("./libgeo.so", "geo.h")
imprimir(g.GEO_VERSION, g.GEO_MAX, g.GEO_MAS, g.GEO_VERDE, g.GEO_AZUL, g.GEO_PI, g.GEO_NOMBRE)
imprimir(g.geo_hipotenusa(3, 4), g.geo_u8(255), g.geo_u8(300), g.geo_es_par(7), g.geo_nombre())
fijo cos = nativa("libm.so.6", "double cos(double)")
fijo pot = nativa("libm.so.6", "double pow(double x, double y)")
fijo abs = nativa("libc.so.6", "int abs(int)")
imprimir(cos(0), pot(2, 10), abs(-7), abs(2.9), abs(-2.9))
var s = 0
para i en rango(1000) { s = s + pot(i, 0.5) }
imprimir(s)
para o en g._omitidas { imprimir(o) }
intentar { g.geo_grande() } capturar (e) { imprimir(e.mensaje) }
intentar { cos("x") } capturar (e) { imprimir("error al pasar un texto") }
`;
console.log('· el ejecutable llama a C directamente');
if (!linux) saltar('el ejecutable', 'las bibliotecas del sistema de la prueba son las de Linux');
else {
  escribir('directo.esl', DIRECTO);
  const c = compilar('directo.esl', ['--c', path.join(tmp, 'directo.c')]);
  comprobar('compila y enlaza', c.ok, c.out);
  if (c.ok) {
    const a = correr('directo');
    const ldd = sh('ldd', [path.join(tmp, 'directo')]).stdout || '';
    const fuente = fs.readFileSync(path.join(tmp, 'directo.c'), 'utf8');
    comprobar('la biblioteca va enlazada (ldd la ve) y la llamada es de C (sin dlopen)',
      /libgeo\.so/.test(ldd) && /__asm__\(N_SIM\("geo_hipotenusa"\)\)/.test(fuente) && !/dlopen/.test(fuente), ldd);
    if (koffi) {
      const v = vm('directo.esl');
      comprobar('da lo mismo que la VM, letra por letra (constantes, enteros que envuelven, texto, libm y libc, lo omitido, el error de 64 bits)',
        a.ok && v.ok && a.out === v.out, `ejecutable:\n${a.out || a.err}\nVM:\n${v.out || v.err}`);
    } else comprobar('corre', a.ok, a.err);
    comprobar('un int64_t que no cabe en 2^53 es un error, como en la VM', a.ok && a.out.includes('«geo_grande»: devolvió 1152921504606846976 y eso no cabe en un número de Ñ'), a.out);
  }
  // lo que el ejecutable todavía no sabe pasar
  escribir('no.esl', `usar cabeceraNativa de "nativo"
fijo g = cabeceraNativa("./libgeo.so", "geo.h")
intentar { g.geo_area({}) } capturar (e) { imprimir(e.mensaje) }
intentar { g.geo_medio({x: 1, y: 1}, {x: 1, y: 1}) } capturar (e) { imprimir(e.mensaje) }
intentar { g.geo_ordenar(nulo, 0, nulo) } capturar (e) { imprimir(e.mensaje) }
`);
  const c2 = compilar('no.esl');
  const a2 = c2.ok ? correr('no') : { ok: false, out: c2.out };
  const l2 = a2.out.split('\n');
  comprobar('punteros, estructuras y retrollamadas: están, y al llamarlas dicen por qué',
    a2.ok && l2[0] === '«geo_area»: en el ejecutable nativo todavía no: pasa un puntero (const GeoCaja *)' &&
    l2[1] === '«geo_medio»: en el ejecutable nativo todavía no: devuelve una estructura (GeoPunto) por valor' &&
    l2[2] === '«geo_ordenar»: en el ejecutable nativo todavía no: pasa un puntero (int *)', a2.out);
  escribir('mal.esl', 'fijo f = nativa("libm.so.6", "double frexp(double x, int *e)")\nimprimir(f(1))\n');
  const c3 = compilar('mal.esl');
  comprobar('nativa(…) con un puntero: se dice al compilar', !c3.ok && c3.out.includes('«frexp» pasa un puntero (int *): en el ejecutable, todavía no (en la VM sí)'), c3.out);
  escribir('otra.esl', 'fijo firma = "double cos(double)"\nfijo f = nativa("libm.so.6", firma)\nimprimir(f(0))\n');
  const c4 = compilar('otra.esl');
  const a4 = c4.ok ? correr('otra') : { out: c4.out };
  comprobar('una firma que no está escrita en la llamada: error claro al correr', !a4.ok && a4.err.includes('«nativa»: en el ejecutable nativo no está enlazada'), a4.err || a4.out);
}

// ── 4. Ñ → C → Ñ ─────────────────────────────────────────────────────────────
console.log('· Ñ como biblioteca de C, leída desde Ñ por su .h');
if (!linux) saltar('Ñ → C → Ñ', 'solo en Linux');
else {
  escribir('mates.esl', `usar raiz de "numerico"
publico fn hipotenusa(a: real, b: real): real { devolver raiz(a * a + b * b) }
publico fn saludo(nombre: texto): texto { devolver "hola, " + nombre }
publico fn medio(a: real, b: real): real {
  si a > b { lanzar "a no puede ser mayor que b" }
  devolver (a + b) / 2
}
`);
  const b = compilar('mates.esl', ['--biblioteca']);
  comprobar('n-compilar --biblioteca', b.ok, b.out);
  escribir('usa.esl', `usar cabeceraNativa de "nativo"
fijo m = cabeceraNativa("./libmates.so", "mates.h")
imprimir(m.mates_hipotenusa(3, 4), m.mates_saludo("Diego"), m.mates_error())
imprimir(m.mates_medio(1, 3), m.mates_error())
fijo raro = m.mates_medio(5, 3)
imprimir(m.mates_error())
`);
  const c = compilar('usa.esl');
  const a = c.ok ? correr('usa') : { ok: false, out: c.out };
  comprobar('desde el ejecutable: los números, el texto y el error de Ñ como errno', a.ok &&
    a.out === '5 hola, Diego nulo\n2 nulo\nerror sin capturar: "a no puede ser mayor que b"', a.out || a.err);
  if (koffi) { const v = vm('usa.esl'); comprobar('desde la VM: lo mismo', v.ok && v.out === a.out, v.out || v.err); }
}

// ── 5. para Windows ──────────────────────────────────────────────────────────
console.log('· para Windows (mingw)');
if (!hay('x86_64-w64-mingw32-gcc')) saltar('Windows', 'no hay x86_64-w64-mingw32-gcc');
else {
  const d = sh('x86_64-w64-mingw32-gcc', ['-shared', '-O1', 'geo.c', '-o', 'geo.dll']);
  const aWin = s => s.replace(/"\.\/libgeo\.so"/g, '"geo.dll"').replace(/"libm\.so\.6"/g, '"msvcrt.dll"').replace(/"libc\.so\.6"/g, '"msvcrt.dll"');
  // en Windows no hay enlace débil: una cabecera con una función que la DLL no trae no enlaza
  escribir('geo-win.h', fs.readFileSync(path.join(tmp, 'geo.h'), 'utf8').replace(/^.*geo_falta.*$/m, ''));
  escribir('win.esl', aWin(DIRECTO).replace(/"geo\.h"/g, '"geo-win.h"'));
  const c = d.status === 0 ? compilar('win.esl', ['--cc', 'x86_64-w64-mingw32-gcc']) : { ok: false, out: d.stderr };
  const imp = c.ok ? (sh('x86_64-w64-mingw32-objdump', ['-p', path.join(tmp, 'win.exe')]).stdout || '') : '';
  comprobar('win.exe enlaza e importa geo_hipotenusa de geo.dll y cos de msvcrt.dll',
    c.ok && /DLL Name: geo\.dll[\s\S]*geo_hipotenusa/.test(imp) && /DLL Name: msvcrt\.dll[\s\S]*\bcos\b/.test(imp), c.out);
  escribir('win2.esl', aWin(DIRECTO));
  const c2 = compilar('win2.esl', ['--cc', 'x86_64-w64-mingw32-gcc']);
  comprobar('con la función que falta: se dice al enlazar, con su nombre', !c2.ok && c2.out.includes('«geo_falta»: lo declara la cabecera'), c2.out);
}
fin();

function fin() {
  console.log(`\n${pasan} pasan, ${fallan} fallan${saltadas ? `, ${saltadas} saltadas` : ''}`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
  process.exit(fallan ? 1 : 0);
}
