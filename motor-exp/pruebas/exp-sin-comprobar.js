// motor-exp · N4.11 «Quitar la seguridad donde uno quiere»: sinComprobar { … }.
//
// La ley 7, la puerta de atrás con nombre propio: explícita (un bloque que se
// escribe a propósito), visible (el verificador avisa con la línea, y n-node y
// n-compilar lo dicen siempre) y nunca por defecto. Dentro del bloque:
//  · la VM y C1EÑ en jit SIGUEN comprobando (son donde se depura): un índice
//    fuera de rango sigue siendo un error con su línea;
//  · C1EÑ en nativo y en la GPU quita las comprobaciones de índices, divisiones,
//    raíz/log, piso y bits (el compilador de C recibe __builtin_unreachable y
//    borra la comprobación entera); las barreras, las esperas y el tope de
//    vueltas se quedan, porque sin ellas un fallo es un cuelgue;
//  · el ejecutable de n-compilar indexa las listas directo a su casilla y divide
//    sin mirar el cero.
// Un programa correcto da LO MISMO con y sin el bloque, en todos los sitios.
//
//   node motor-exp/pruebas/exp-sin-comprobar.js          (--gpu: la GPU de verdad)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GPU_REAL = process.argv.includes('--gpu');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
const N_COMPILAR = path.join(__dirname, '..', 'util', 'n-compilar.js');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 8).join('\n      ')}` : '')); }
};
const saltar = (n, por) => { saltadas++; console.log(`  – ${n}: saltada (${por})`); };
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-sin-comprobar-'));

let envGpu = null, motivoSinGpu = null;
if (GPU_REAL) envGpu = {};
else if (!koffi) motivoSinGpu = 'no hay koffi';
else if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para el simulador';
else {
  const SIM = path.join(__dirname, 'c1en-sim');
  const dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  fs.mkdirSync(dirSim, { recursive: true });
  const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
  const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA].concat(process.platform === 'win32' ? [] : ['-ldl']), { encoding: 'utf8' });
  const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim };
  }
}
const escribir = (n, s) => { const f = path.join(tmp, n); fs.writeFileSync(f, s); return f; };
function correr(src, dispositivo, extra) {
  const f = escribir(`p${Math.floor(Math.random() * 1e9)}.esl`, src);
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo });
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const corto = r => (r.ok ? r.out : r.out + '\n' + r.err).split('\n').filter(l => !l.startsWith('aviso')).slice(-6).join('\n');

const CAB = `usar paralelo, paraleloBloques, hilos, codigoC, codigoCuda, barrera, compartido, cerrarCandado, barreraHilos de "nen"
usar ceros, aListaA, suma, raiz de "numerico"
`;

// ── 1. lo que se escribe y lo que se avisa ──────────────────────────────────
console.log('· la puerta de atrás: explícita, visible, nunca por defecto');
{
  const r = correr(CAB + `
fijo l = [1, 2, 3]
var s = 0
sinComprobar {
  para i en rango(3) { s = s + l[i] }
}
imprimir(s)
`, 'jit');
  comprobar('corre, y el aviso sale con su línea (por la salida de errores)', r.ok && r.out === '6' &&
    /aviso: \[seguridad\] línea 6:1 — «sinComprobar»: aquí, en el ejecutable \(n-compilar\) y en los núcleos de C1EÑ en nativo y en la GPU, un índice fuera de rango o una división entre cero NO se dicen/.test(r.err), r.out + '\n' + r.err);
  const v = correr('var sinComprobar = 2\nimprimir(sinComprobar + 1)\n', 'jit');
  comprobar('«sinComprobar» no es palabra reservada: var sinComprobar = 2 sigue valiendo, sin aviso', v.ok && v.out === '3' && !v.err.includes('aviso'), v.out + v.err);
  const vm = correr(CAB + `
fijo l = [1, 2, 3]
sinComprobar {
  intentar { imprimir(l[7]) } capturar (e) { imprimir("la VM lo dice:", e.mensaje) }
  intentar { imprimir(1 / 0) } capturar (e) { imprimir("la VM lo dice:", e.mensaje) }
}
`, 'jit');
  comprobar('dentro del bloque, la VM sigue comprobando (es donde se depura)', vm.ok &&
    vm.out === 'la VM lo dice: índice 7 fuera de rango (la lista tiene 3 elemento(s))\nla VM lo dice: división entre cero', vm.out + vm.err);
}

// ── 2. C1EÑ: jit comprueba, nativo y GPU no ─────────────────────────────────
console.log('· en los núcleos de C1EÑ');
const NUCLEO = CAB + `
fn vecinos(i, a, b, n) {
  sinComprobar {
    var s = 0
    para k en rango(-2, 3) { s = s + a[(i + k + n) % n] }
    b[i] = s / 5 + raiz(a[i]) + (i // 3) % 4
  }
}
fn fuera(i, a, b, n) {
  var s = 0
  para k en rango(-2, 3) { s = s + a[(i + k + n) % n] }
  b[i] = s / 5 + raiz(a[i]) + (i // 3) % 4
}
fijo N = 5000
fijo a = ceros(N)
para i en rango(N) { a[i] = (i * 7) % 13 }
fijo b = ceros(N)
fijo c = ceros(N)
paralelo(N, vecinos, a, b, N)
paralelo(N, fuera, a, c, N)
var iguales = verdadero
para i en rango(N) { si b[i] != c[i] { iguales = falso } }
imprimir(suma(b), iguales)
`;
const ref = correr(NUCLEO, 'jit');
comprobar('jit: un programa correcto da lo mismo con y sin el bloque', ref.ok && / cierto$/.test(ref.out), corto(ref));
const dispositivos = [];
if (koffi && hay('gcc')) dispositivos.push(['nativo', null]); else saltar('nativo', 'no hay gcc o koffi');
if (envGpu) dispositivos.push(['gpu', envGpu]); else saltar('gpu', motivoSinGpu);
for (const [d, env] of dispositivos) {
  const r = correr(NUCLEO, d, env);
  comprobar(`${d}: lo mismo que jit, al bit`, r.ok && r.out === ref.out, corto(r) + '\n  esperado: ' + ref.out);
}
{
  const r = correr(CAB + `
fn vecinos(i, a, b) {
  sinComprobar { b[i] = a[i + 1] / a[i] }
  b[i] = b[i] + a[i]
}
imprimir(codigoC(vecinos, ceros(4), ceros(4)))
imprimir("=====")
imprimir(codigoCuda(vecinos, ceros(4), ceros(4)))
`, 'jit');
  const [cc, cu] = r.out.split('=====');
  const cuerpoC = (cc || '').slice((cc || '').indexOf('c1en_cuerpo('));
  // dentro: lectura de a[i+1], a[i], la división y la escritura de b[i]: sin c1en_falla; fuera: con
  comprobar('codigoC: dentro, las comprobaciones son __builtin_unreachable; fuera, siguen', r.ok &&
    (cuerpoC.match(/__builtin_unreachable/g) || []).length >= 4 && /c1en_falla/.test(cuerpoC), cuerpoC.slice(0, 1500));
  comprobar('codigoCuda: lo mismo en la GPU', r.ok && /__builtin_unreachable/.test(cu || ''), (cu || '').slice(0, 300));
}
{
  const r = correr(CAB + `
fn g(i, a) { sinComprobar { a[i + 100] = 1 } }
intentar { paralelo(8, g, ceros(8)) } capturar (e) { imprimir(e.mensaje) }
`, 'jit');
  comprobar('jit sigue diciendo el índice fuera, con su línea', r.ok && r.out === '«paralelo»: el hilo i = 0 falló en la línea 4: el índice se sale del arreglo «a»', r.out + r.err);
}
// las barreras y las esperas se quedan
if (koffi && hay('gcc')) {
  const r = correr(CAB + `
fn mal(t, c) {
  sinComprobar {
    cerrarCandado(c, t)
    barreraHilos()
    cerrarCandado(c, 1 - t)
  }
}
intentar { hilos(2, mal, ceros(2, "entero")) } capturar (e) { imprimir(e.mensaje) }
`, 'nativo', { C1EN_HILOS_ESPERA_S: '2' });
  comprobar('nativo: un interbloqueo dentro del bloque se sigue cazando (las esperas no se quitan)',
    r.ok && /^«hilos»: el hilo t = 0 falló en la línea 8: todos los hilos se quedaron esperando: un interbloqueo/.test(r.out), r.out + r.err);
}
// lo que gana (informativo)
if (koffi && hay('gcc')) {
  const pesa = (con) => CAB + `
fn f(i, a, b, n) {
  ${con ? 'sinComprobar {' : '{'}
    var s = 0
    para k in rango(0, 64) { s = s + a[i * 64 + k] }
    b[i] = s
  }
}
fijo N = 200000
fijo a = ceros(N * 64, "entero")
fn llenar(i, a) { a[i] = i % 17 }
paralelo(N * 64, llenar, a)
fijo b = ceros(N, "entero")
paralelo(N, f, a, b, N)
fijo t0 = reloj()
para r en rango(5) { paralelo(N, f, a, b, N) }
imprimir(reloj() - t0)
`.replace('para k in', 'para k en');
  const con = correr(pesa(true), 'nativo'), sin = correr(pesa(false), 'nativo');
  if (con.ok && sin.ok) console.log(`    (nativo, 200.000 hilos × 64 lecturas seguidas de un arreglo entero, 5 veces: ${Number(sin.out).toFixed(0)} ms comprobando, ${Number(con.out).toFixed(0)} ms con sinComprobar)`);
}

// ── 3. el ejecutable de n-compilar ───────────────────────────────────────────
console.log('· en el ejecutable (n-compilar)');
if (!hay('gcc')) saltar('el ejecutable', 'no hay gcc');
else {
  const PROG = `fijo l = []
para i en rango(1000) { agregar(l, (i * 37) % 101) }
var s: real = 0
sinComprobar {
  para i en rango(1000) { s = s + l[i] * l[-1 - (i % 10)] / (1 + l[i] % 7) + l[i] // 3 }
  l[0] = 5
  l[-1] = 6
}
imprimir(s, l[0], l[999])
`;
  const f = escribir('lista.esl', PROG);
  const c = spawnSync(process.execPath, [N_COMPILAR, f, '--c', path.join(tmp, 'lista.c')], { encoding: 'utf8', cwd: tmp });
  comprobar('n-compilar avisa', c.status === 0 && /\[aviso\] \[seguridad\] línea 4:1 — «sinComprobar»/.test(c.stdout), c.stdout + c.stderr);
  if (c.status === 0) {
    const a = spawnSync(path.join(tmp, 'lista'), [], { encoding: 'utf8' });
    const v = correr(PROG, 'jit');
    comprobar('un programa correcto: lo mismo que la VM, letra por letra', a.status === 0 && a.stdout.trim() === v.out, `ejecutable: ${a.stdout}\nVM: ${v.out}`);
    const fuente = fs.readFileSync(path.join(tmp, 'lista.c'), 'utf8');
    comprobar('el C indexa la lista directo a su casilla y divide sin mirar el cero', /NLista\* l_ = \(NLista\*\)/.test(fuente) &&
      /\.u\.n = floor\(/.test(fuente), '');
  }
  const DIV = `var x: real = 0
sinComprobar { x = 1 / 0 }
imprimir(x > 1000)
intentar { imprimir(1 / 0) } capturar (e) { imprimir("fuera del bloque:", e.mensaje) }
`;
  const f2 = escribir('div.esl', DIV);
  const c2 = spawnSync(process.execPath, [N_COMPILAR, f2], { encoding: 'utf8', cwd: tmp });
  const a2 = c2.status === 0 ? spawnSync(path.join(tmp, 'div'), [], { encoding: 'utf8' }) : { stdout: c2.stdout };
  comprobar('dentro, 1 / 0 no es un error (da infinito, como en C); fuera, sí', (a2.stdout || '').trim() === 'cierto\nfuera del bloque: división entre cero', a2.stdout);
}

console.log(`\n${pasan} pasan, ${fallan} fallan${saltadas ? `, ${saltadas} saltadas` : ''}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
process.exit(fallan ? 1 : 0);
