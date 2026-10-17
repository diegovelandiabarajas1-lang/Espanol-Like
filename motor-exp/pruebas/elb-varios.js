// El .elb de varios archivos (paquete ESLP): un programa con sus módulos en un
// solo archivo, compilado con util/elb.js y corrido con util/n-node.js.
//
// Casi todo lanza los programas de verdad, como modulos.js: un módulo es un
// archivo en un disco y lo que se quiere probar es justo que el paquete ya no
// lo necesite. Lo de integridad (cabecera, claves, truncados, mutaciones) se
// prueba en proceso, contra el lector.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');

require(R.bundle);
const EL = globalThis.EspanolLike;
const P = require(R.util('paquete-elb.js')).crear(EL);

let pasan = 0, fallan = 0;
const comprobar = (n, ok, det) => {
  if (ok) { pasan++; console.log('  ✓ ' + n); }
  else { fallan++; console.log('  ✗ ' + n + (det !== undefined ? '\n      → ' + String(det).slice(0, 400) : '')); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n-elb-varios-'));
const escribir = (dir, archivos) => {
  for (const [r, t] of Object.entries(archivos)) {
    const f = path.join(dir, r);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, t, 'utf8');
  }
};
const node = (args, opts) => spawnSync(process.execPath, args, Object.assign({ encoding: 'utf8' }, opts));
const correr = (prog, extra, opts) => node([R.util('n-node.js'), prog].concat(extra || []), opts);
const compilar = (prog, salida, extra) => node([R.util('elb.js'), prog].concat(salida ? [salida] : []).concat(extra || []));

// Un programa de tres archivos: el principal importa saludo y mates; saludo
// importa mates también, así que mates tiene que cargarse UNA vez.
const TRES = {
  'principal.esl':
    'usar "lib/saludo.esl" como s\n' +
    'usar "lib/mates.esl" como m\n' +
    'imprimir(s.saludar("Diego"))\n' +
    'imprimir("cubo " + texto(m.cuadrado(3) * 3))\n' +
    'imprimir("args " + texto(argumentos()))\n',
  'lib/mates.esl':
    'publico fn cuadrado(x: entero): entero { devolver x * x }\n' +
    'publico fijo VERSION = "1.0"\n' +
    'imprimir("mates cargado")\n',
  'lib/saludo.esl':
    'usar "mates.esl" como m\n' +
    'usar mayusculas de "texto"\n' +
    'publico fn saludar(n: texto): texto { devolver "hola " + mayusculas(n) + " " + texto(m.cuadrado(7)) + " v" + m.VERSION }\n',
};

// ─────────────────────────────────────────────────────────────── 1. ida y vuelta
console.log('\n── compilar y correr');
const a = path.join(tmp, 'a');
escribir(a, TRES);
const desdeFuente = correr(path.join(a, 'principal.esl'), ['x', 'y']);
let r = compilar(path.join(a, 'principal.esl'));
const elbA = path.join(a, 'principal.elb');
comprobar('util/elb.js compila un programa de tres archivos', r.status === 0 && fs.existsSync(elbA), r.stdout + r.stderr);
const bytesA = fs.existsSync(elbA) ? fs.readFileSync(elbA) : Buffer.alloc(0);
comprobar('sale un paquete (marca ESLP)', bytesA.subarray(0, 4).toString('latin1') === 'ESLP', bytesA.subarray(0, 4).toString('latin1'));
comprobar('dice qué módulos lleva', /2 módulo/.test(r.stdout) && /lib\/mates\.esl/.test(r.stdout) && /lib\/saludo\.esl/.test(r.stdout), r.stdout);
r = correr(elbA, ['x', 'y']);
comprobar('n-node lo corre y la salida es la misma que desde el fuente', r.status === 0 && r.stdout === desdeFuente.stdout,
  'fuente:\n' + desdeFuente.stdout + '\nelb:\n' + r.stdout + r.stderr);
comprobar('cada módulo se ejecuta una sola vez', (r.stdout.match(/mates cargado/g) || []).length === 1, r.stdout);
comprobar('los argumentos llegan al programa', /args \["x", "y"\]/.test(r.stdout), r.stdout);
comprobar('un eDSL dentro de un módulo funciona (y no viaja como módulo)', /hola DIEGO 49 v1\.0/.test(r.stdout), r.stdout);

// ─────────────────────────────────────────────────────────────── 2. portable
console.log('\n── un solo archivo, portable');
const lejos = path.join(tmp, 'lejos');
fs.mkdirSync(lejos);
fs.copyFileSync(elbA, path.join(lejos, 'programa.elb'));
const b = path.join(tmp, 'b', 'otra', 'carpeta');
escribir(b, TRES);
fs.rmSync(a, { recursive: true, force: true });        // sin los fuentes
r = correr(path.join(lejos, 'programa.elb'), ['x', 'y'], { cwd: os.tmpdir() });
comprobar('corre sin los .esl, desde otra carpeta', r.status === 0 && r.stdout === desdeFuente.stdout, r.stdout + r.stderr);
comprobar('no lleva rutas de esta máquina dentro', bytesA.indexOf(Buffer.from(tmp)) < 0 && bytesA.indexOf(Buffer.from(os.tmpdir())) < 0);
r = compilar(path.join(b, 'principal.esl'));
const bytesB = fs.readFileSync(path.join(b, 'principal.elb'));
comprobar('compilado en otra carpeta da EXACTAMENTE los mismos bytes', Buffer.compare(bytesA, bytesB) === 0,
  `${bytesA.length} contra ${bytesB.length} bytes`);
r = node([R.util('elb.js'), '--ver', path.join(lejos, 'programa.elb')]);
comprobar('--ver lo verifica y lista lo que lleva', r.status === 0 && /verificado/.test(r.stdout) && /lib\/saludo\.esl/.test(r.stdout), r.stdout);

// ─────────────────────────────────────────────────────────────── 3. formas
console.log('\n── formas de módulos');
const c = path.join(tmp, 'c');
escribir(c, {
  'app/principal.esl': 'usar "../comun/util.esl" como u\nimprimir(u.doble(21))\n',
  'comun/util.esl': 'publico fn doble(x: entero): entero { devolver x * 2 }\n',
});
r = compilar(path.join(c, 'app', 'principal.esl'));
comprobar('un módulo fuera de la carpeta del principal («../comun»)', r.status === 0 && /\.\.\/comun\/util\.esl/.test(r.stdout), r.stdout + r.stderr);
r = correr(path.join(c, 'app', 'principal.elb'));
comprobar('… y corre', r.status === 0 && r.stdout.trim() === '42', r.stdout + r.stderr);

const d = path.join(tmp, 'd');
escribir(d, {
  'principal.esl': 'usar "a.esl" como a\nimprimir(a.desdeA(3))\n',
  'a.esl': 'usar "b.esl" como b\npublico fn desdeA(n: entero): entero { si n <= 0 { devolver 0 }\n  devolver 1 + b.desdeB(n - 1) }\n',
  'b.esl': 'usar "a.esl" como a\npublico fn desdeB(n: entero): entero { si n <= 0 { devolver 0 }\n  devolver 10 + a.desdeA(n - 1) }\n',
});
const cicloFuente = correr(path.join(d, 'principal.esl'));
compilar(path.join(d, 'principal.esl'));
r = correr(path.join(d, 'principal.elb'));
comprobar('un ciclo de importación (a ↔ b) da lo mismo que desde el fuente', r.status === 0 && r.stdout === cicloFuente.stdout && r.stdout.trim() === '12',
  cicloFuente.stdout + ' | ' + r.stdout + r.stderr);

const e = path.join(tmp, 'e');
escribir(e, { 'solo.esl': 'usar mayusculas de "texto"\nimprimir(mayusculas("sin módulos"))\n' });
r = compilar(path.join(e, 'solo.esl'));
const bytesSolo = fs.readFileSync(path.join(e, 'solo.elb'));
comprobar('sin módulos de archivo sale un .elb de siempre (ESLB)', bytesSolo.subarray(0, 4).toString('latin1') === 'ESLB' && /un archivo/.test(r.stdout), r.stdout);
r = correr(path.join(e, 'solo.elb'));
comprobar('… y n-node también lo corre', r.status === 0 && r.stdout.trim() === 'SIN MÓDULOS', r.stdout + r.stderr);

r = compilar(path.join(b, 'principal.esl'), path.join(tmp, 'texto.elb'), ['--texto']);
const enTexto = path.join(tmp, 'texto.elb.txt');
comprobar('--texto lo escribe en base64', r.status === 0 && fs.existsSync(enTexto) && /^[A-Za-z0-9+/=\n]+$/.test(fs.readFileSync(enTexto, 'utf8')), r.stdout + r.stderr);
r = correr(enTexto, ['x', 'y']);
comprobar('… y se corre igual', r.status === 0 && r.stdout === desdeFuente.stdout, r.stdout + r.stderr);

// ─────────────────────────────────────────────────────────────── 4. errores
console.log('\n── errores con nombre de archivo');
const f = path.join(tmp, 'f');
escribir(f, {
  'principal.esl': 'usar "lib/cuentas.esl" como k\nimprimir(k.elemento3([1, 2]))\n',
  'lib/cuentas.esl': 'publico fn elemento3(l: lista<entero>): entero {\n  devolver l[3]\n}\n',
});
const errFuente = correr(path.join(f, 'principal.esl'));
compilar(path.join(f, 'principal.esl'));
r = correr(path.join(f, 'principal.elb'));
// La traza nombra funciones y líneas, no archivos —también desde el fuente; eso
// es del motor y no cambia aquí—. Lo que se pide es que el .elb diga LO MISMO.
comprobar('un error en tiempo de ejecución dentro de un módulo da el mismo mensaje y la misma traza que desde el fuente',
  r.status === 1 && /fuera de rango/.test(r.stdout) && /en elemento3 \(línea 2\)/.test(r.stdout) && r.stdout === errFuente.stdout,
  'fuente:\n' + errFuente.stdout + '\nelb:\n' + r.stdout + r.stderr);
escribir(f, { 'lib/malo.esl': 'publico fn roto(): entero { devolver "texto" }\n', 'malo.esl': 'usar "lib/malo.esl" como m\nimprimir(m.roto())\n' });
r = compilar(path.join(f, 'malo.esl'));
comprobar('un error de tipos en un módulo no deja compilar, y dice dónde',
  r.status === 1 && /malo\.esl/.test(r.stdout) && !fs.existsSync(path.join(f, 'malo.elb')), r.stdout + r.stderr);

// ─────────────────────────────────────────────────────────────── 5. integridad
console.log('\n── integridad: todo se verifica antes de correr');
const bueno = bytesB;
const esErrBc = x => x && x.name === 'ErrorBytecode';
const leerFalla = bytes => { try { P.leer(bytes); return null; } catch (x) { return x; } };
let x = leerFalla(bueno);
comprobar('el paquete bueno se lee', x === null, x && x.message);
const p0 = P.leer(bueno);
comprobar('ninguna función del paquete trae árbol sintáctico (no hay JIT para lo que viene de un archivo)',
  [p0.fn].concat(p0.modulos.map(m => m.fn)).every(fn => fn.ast === null && fn.deDisco === true));

// Un módulo estropeado: no corre nada, ni el principal.
const roto = Buffer.from(bueno);
const iMod = roto.indexOf(Buffer.from('ESLB', 'latin1'));
roto[iMod + 3] = 0x41;
fs.writeFileSync(path.join(tmp, 'roto.elb'), roto);
r = correr(path.join(tmp, 'roto.elb'));
comprobar('un módulo roto: se rechaza el paquete entero y no se ejecuta ni una línea',
  r.status === 1 && /\[bytecode\]/.test(r.stdout) && /en el módulo/.test(r.stdout) && !/mates cargado|hola/.test(r.stdout), r.stdout);

// Todos los prefijos: ninguno se acepta y todos fallan con un error de bytecode.
let prefijosMal = 0, prefijosRaros = 0;
for (let n = 0; n < bueno.length; n++) {
  const e2 = leerFalla(bueno.subarray(0, n));
  if (e2 === null) prefijosMal++;
  else if (!esErrBc(e2)) prefijosRaros++;
}
comprobar(`los ${bueno.length} prefijos truncados se rechazan, todos con error de bytecode`, prefijosMal === 0 && prefijosRaros === 0,
  `${prefijosMal} aceptados, ${prefijosRaros} con otro tipo de error`);
x = leerFalla(Buffer.concat([bueno, Buffer.from([0])]));
comprobar('un byte de más al final se rechaza', esErrBc(x) && /sobran/.test(x.message), x && x.message);

// Mutaciones al azar (semilla fija): cada una se rechaza con error de bytecode
// o se acepta; nunca un error interno. Cambiar una letra de un texto o un
// número de línea sigue dando un archivo válido, igual que en el .elb de siempre.
let semilla = 20261016;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
let aceptados = 0, rechazados = 0, internos = 0, ejemplo = '';
for (let i = 0; i < 3000; i++) {
  const m = Buffer.from(bueno);
  const cuantos = 1 + Math.floor(azar() * 4);
  for (let j = 0; j < cuantos; j++) m[Math.floor(azar() * m.length)] = Math.floor(azar() * 256);
  const e2 = leerFalla(m);
  if (e2 === null) aceptados++;
  else if (esErrBc(e2)) rechazados++;
  else { internos++; if (!ejemplo) ejemplo = String(e2 && e2.stack || e2); }
}
comprobar(`3.000 paquetes mutados: ${rechazados} rechazados, ${aceptados} aceptados, 0 errores internos`, internos === 0, ejemplo);

// Paquetes hechos a mano, con lo que el lector tiene que rechazar.
const huella = bueno.readUInt32LE(5);
const varint = v => { const o = []; do { const c = v % 128; v = Math.floor(v / 128); o.push(v ? c + 128 : c); } while (v); return Buffer.from(o); };
const unElb = bytesSolo;                                // un .elb verdadero, de un archivo
const aMano = (claves, opts) => {
  opts = opts || {};
  const trozos = [Buffer.from('ESLP', 'latin1'), Buffer.from([opts.version || 1])];
  const h = Buffer.alloc(4); h.writeUInt32LE(opts.huella === undefined ? huella : opts.huella); trozos.push(h);
  trozos.push(varint(claves.length));
  for (const k of claves) {
    const kb = Buffer.from(k, 'utf8');
    trozos.push(varint(kb.length), kb, varint(unElb.length), unElb);
  }
  trozos.push(varint(unElb.length), unElb);
  return Buffer.concat(trozos);
};
comprobar('uno hecho a mano y bien formado se acepta', leerFalla(aMano(['lib/x.esl', '../y.esl'])) === null);
const malas = [
  ['/abs/x.esl', 'ruta absoluta'], ['C:/x.esl', 'unidad de Windows'], ['lib\\x.esl', 'barra invertida'],
  ['lib/../x.esl', '«..» en medio'], ['./x.esl', 'tramo «.»'], ['lib//x.esl', 'tramo vacío'], ['', 'clave vacía'],
  ['ñ:texto', 'clave de eDSL'], ['a\u0000b.esl', 'byte cero'], ['..', 'no nombra archivo'],
];
for (const [k, que] of malas) {
  const e2 = leerFalla(aMano([k]));
  comprobar(`se rechaza una clave con ${que}`, esErrBc(e2) && /clave/.test(e2.message), e2 && e2.message);
}
x = leerFalla(aMano(['lib/x.esl', 'lib/x.esl']));
comprobar('se rechaza un módulo repetido', esErrBc(x) && /dos veces/.test(x.message), x && x.message);
x = leerFalla(aMano([]));
comprobar('se rechaza un paquete sin módulos', esErrBc(x) && /sin módulos/.test(x.message), x && x.message);
x = leerFalla(aMano(['lib/x.esl'], { huella: (huella + 1) >>> 0 }));
comprobar('otra tabla de instrucciones: se dice que hay que recompilar', esErrBc(x) && /vuelve a compilarlo/.test(x.message), x && x.message);
x = leerFalla(aMano(['lib/x.esl'], { version: 9 }));
comprobar('otra versión de paquete se rechaza con su número', esErrBc(x) && /versión 9/.test(x.message), x && x.message);
x = leerFalla(unElb);
comprobar('un .elb de un archivo no se toma por paquete (y se dice)', esErrBc(x) && /un solo archivo/.test(x.message), x && x.message);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pasan} pasan, ${fallan} fallan · .elb de varios archivos`);
process.exit(fallan ? 1 : 0);
