// motor-exp · N4.8 «Varias GPU desde un solo programa».
//
// Lo que se prueba, con la GPU SIMULADA de dos dispositivos (C1EN_SIM_GPUS=2):
//  · paraleloRepartido da lo mismo, al bit, que paralelo en jit y en nativo: con
//    arreglos que se escriben en a[i] (baja cada tramo), en otros sitios (baja
//    todo y se mezclan los cambios), con la i reasignada, y con real, real32 y
//    entero; y el trabajo se reparte de verdad (núcleos en las dos GPU);
//  · el fallo que se dice es el del hilo de índice más bajo, como en paralelo,
//    aunque esté en la segunda GPU;
//  · con atómicos o vallas no se reparte, y es un error en los tres dispositivos;
//  · colaGpu(k) y enGpu(k, f) mandan el trabajo a la GPU k, y un arreglo que
//    está en una GPU pasa a la otra con una copia directa (cuMemcpyPeer), sin
//    pasar por Node; también en modo perezoso (si faltara una espera, saldría);
//  · con una sola GPU, paraleloRepartido es paralelo.
// El simulador es más estricto que el driver: un núcleo que recibe memoria de
// otra GPU, o una copia con el contexto equivocado, falla. Así se cazan los
// olvidos de cambiar de GPU.
//
//   node motor/pruebas/exp-varias-gpu.js          (--gpu: las GPU de verdad, p. ej. las 2 T4 de Kaggle)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GPU_REAL = process.argv.includes('--gpu');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 8).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-varias-gpu-'));

let envGpu = null, motivoSinGpu = null;
if (GPU_REAL) envGpu = {};
else if (!koffi) motivoSinGpu = 'no hay koffi';
else if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para el simulador';
else {
  const SIM = path.join(__dirname, 'c1en-sim');
  const dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  fs.mkdirSync(dirSim, { recursive: true });
  const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
  const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA, '-ldl'], { encoding: 'utf8' });
  const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim, C1EN_SIM_GPUS: '2', C1EN_SIM_INFORME: '1' };
  }
}
function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo, C1EN_ESTADISTICAS: '1' });
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  const m = /\[c1en sim\] por GPU: ([\d ]+) · entre GPU: (\d+)/.exec(r.stderr || '');
  const e = /(\d+) entre GPU/.exec(r.stderr || '');
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: ((r.stderr || '') + '\n' + (r.stdout || '')).trim(),
    porGpu: m ? m[1].trim().split(' ').map(Number) : null, peer: m ? +m[2] : (e ? +e[1] : 0) };
}
const corto = r => (r.ok ? r.out : r.err).split('\n').filter(l => !l.startsWith('[c1en')).slice(-6).join('\n');

const CAB = `usar paralelo, paraleloRepartido, numeroGpus, enGpu, colaGpu, enCola, esperarCola, soltarCola, dispositivo, sumarAtomico, atomicoSumar, vallaMemoria de "nen"
usar ceros, piso de "numerico"
`;
// Una huella del arreglo: no depende del orden de nada (se recorre en la CPU)
const HUELLA = `
fn huella(a) {
  var h = 0
  para k en rango(longitud(a)) { h = h + a[k] * (k % 7 + 1) }
  devolver h
}
`;

// 1. Lo mismo que paralelo, al bit, con los tres modos de bajada
const REPARTO = CAB + HUELLA + `
fijo N = 100003
fn cuadrado(i, x, y) { y[i] = x[i] * x[i] + i / 3 }                 # y: solo en y[i] → baja el tramo
fn alReves(i, x, z) { z[longitud(z) - 1 - i] = x[i] * 2 }                     # z: en otro sitio → mezcla de cambios
fn pares(i, w) { si i % 2 == 0 { w[piso(i / 2)] = i + 0.5 } }             # w: la mitad, en otro sitio
fn reasigna(i, v) { i = longitud(v) - 1 - i
  v[i] = i * 1.25 }                                                 # la i reasignada → mezcla de cambios
fn enteros(i, e, f) { e[i] = i * 3 - 7
  f[(i * 7) % longitud(f)] = i * 0.5 }                                        # entero en e[i]; real32 en otro sitio
fijo x = ceros(N)
para k en rango(N) { x[k] = (k % 1000) / 7 }
fijo y = ceros(N)
fijo z = ceros(N)
fijo w = ceros(N)
fijo v = ceros(N)
fijo e = ceros(N, "entero")
fijo f = ceros(N, "real32")
paraleloRepartido(N, cuadrado, x, y)
paraleloRepartido(N, alReves, x, z)
paraleloRepartido(N, pares, w)
paraleloRepartido(N, reasigna, v)
paraleloRepartido(N, enteros, e, f)
imprimir(huella(x), huella(y), huella(z), huella(w), huella(v), huella(e), huella(f))
imprimir(y[0], y[N - 1], z[0], z[N - 1], w[piso(N / 2) - 1], v[7], e[N - 1], f[1])
# y lo mismo con paralelo, para comparar dentro del mismo programa
fijo y2 = ceros(N)
paralelo(N, cuadrado, x, y2)
var iguales = verdadero
para k en rango(N) { si y[k] != y2[k] { iguales = falso } }
imprimir(iguales)
`;

// 2. El fallo es el del hilo más bajo, aunque esté en la segunda GPU
const FALLO_ARRIBA = CAB + `
fijo N = 100000
fn f(i, a) { si i == 95000 o i == 90000 { a[i + longitud(a)] = 1 } sino { a[i] = 2 } }
fijo a = ceros(N)
paraleloRepartido(N, f, a)
`;
const FALLO_ABAJO = CAB + `
fijo N = 100000
fn f(i, a) { si i == 95000 o i == 30000 { a[i + longitud(a)] = 1 } sino { a[i] = 2 } }
fijo a = ceros(N)
paraleloRepartido(N, f, a)
`;

// 3. Con atómicos no se reparte
const ATOMICOS = CAB + `
fn f(i, c) { atomicoSumar(c, 0, 1) }
fijo c = ceros(1, "entero")
paraleloRepartido(1000, f, c)
`;
const SUMAR_ATOMICO = CAB + `
fn f(i, c) { sumarAtomico(c, 0, 1.0) }
fijo c = ceros(1)
paraleloRepartido(1000, f, c)
`;

// 4. Una cola por GPU, enGpu, y arreglos que pasan de una GPU a la otra
const DOS_GPU = CAB + HUELLA + `
fijo N = 50000
fn llenar(i, x, k) { x[i] = i * k }
fn masUno(i, x, y) { y[i] = x[i] + 1 }
imprimir(numeroGpus())
fijo a = ceros(N)
fijo b = ceros(N)
fijo c = ceros(N)
fijo q1 = colaGpu(1)
fijo q0 = colaGpu(0)
enCola(q1, fn() { paralelo(N, llenar, a, 2) })         # a se llena en la GPU 1
enCola(q0, fn() { paralelo(N, llenar, b, 3) })         # b en la GPU 0, a la vez
esperarCola(q1)
esperarCola(q0)
paralelo(N, masUno, a, c)                              # en la GPU 0: a viene de la 1, de GPU a GPU
imprimir(dispositivo())
fijo d = enGpu(1, fn() {
  paralelo(N, masUno, b, a)                            # en la GPU 1: b viene de la 0
  devolver dispositivo()
})
imprimir(d, dispositivo())
imprimir(huella(a), huella(b), huella(c))
soltarCola(q0)
soltarCola(q1)
`;
const GPU_QUE_NO_HAY = CAB + `
imprimir(enGpu(5, fn() { devolver 1 }))
`;

const salidaEsperada = {};
const dispositivos = ['jit', 'nativo'];
const nativoHay = hay('gcc');

console.log('· paraleloRepartido da lo mismo que paralelo');
const ref = correr(REPARTO, 'jit');
comprobar('jit: corre', ref.ok && ref.out.split('\n')[2] === 'cierto', corto(ref));
if (nativoHay) {
  const r = correr(REPARTO, 'nativo');
  comprobar('nativo: lo mismo que jit', r.ok && r.out === ref.out, corto(r));
}
if (envGpu) {
  const r = correr(REPARTO, 'gpu', envGpu);
  comprobar('gpu (2): lo mismo que jit, al bit (tramos, mezcla de cambios, i reasignada, real32 y entero)', r.ok && r.out === ref.out, corto(r) + '\n  esperado: ' + ref.out);
  if (!GPU_REAL) {
    comprobar('gpu (2): el trabajo se reparte (núcleos en las dos GPU)', r.porGpu && r.porGpu[0] >= 5 && r.porGpu[1] >= 5, r.err.split('\n').slice(-3).join(' | '));
    const r1 = correr(REPARTO, 'gpu', Object.assign({}, envGpu, { C1EN_SIM_GPUS: '1' }));
    comprobar('gpu (1): con una sola GPU es paralelo, y da lo mismo', r1.ok && r1.out === ref.out, corto(r1));
    const r3 = correr(REPARTO, 'gpu', Object.assign({}, envGpu, { C1EN_SIM_GPUS: '3' }));
    comprobar('gpu (3): con tres GPU, lo mismo', r3.ok && r3.out === ref.out && r3.porGpu && r3.porGpu.every(k => k > 0), corto(r3) + ' ' + JSON.stringify(r3.porGpu));
  }
} else { saltadas++; console.log(`  – gpu: saltada (${motivoSinGpu})`); }

console.log('· el fallo del hilo más bajo, venga de la GPU que venga');
for (const [nombre, src, i] of [['en la segunda GPU', FALLO_ARRIBA, 90000], ['uno en cada GPU', FALLO_ABAJO, 30000]]) {
  const quiero = `el hilo i = ${i} falló en la línea ${src.split('\n').findIndex(l => l.startsWith('fn f(')) + 1}`;
  const j = correr(src, 'jit');
  comprobar(`${nombre}: jit dice i = ${i}`, !j.ok && j.err.includes(quiero), corto(j));
  if (envGpu) {
    const g = correr(src, 'gpu', envGpu);
    comprobar(`${nombre}: gpu (2) dice lo mismo`, !g.ok && g.err.includes(quiero), corto(g));
  }
}

console.log('· con atómicos no se reparte');
for (const [nombre, src] of [['atomicoSumar', ATOMICOS], ['sumarAtomico', SUMAR_ATOMICO]]) {
  for (const disp of ['jit'].concat(envGpu ? ['gpu'] : [])) {
    const r = correr(src, disp, disp === 'gpu' ? envGpu : null);
    comprobar(`${nombre} en ${disp}: error`, !r.ok && r.err.includes('atómicos o vallas, y esos no cruzan de una GPU a otra'), corto(r));
  }
}

console.log('· colaGpu(k), enGpu(k, f) y copias de GPU a GPU');
const refDos = correr(DOS_GPU, 'jit');
comprobar('jit: corre (numeroGpus() = 0, enGpu solo corre la función)', refDos.ok && refDos.out.split('\n')[0] === '0', corto(refDos));
// con las GPU de verdad, esta parte necesita dos
let cuantas = 2;
if (envGpu && GPU_REAL) {
  const r = correr(CAB + 'imprimir(numeroGpus())\n', 'gpu', envGpu);
  cuantas = r.ok ? Number(r.out) : 0;
  if (cuantas < 2) { saltadas++; console.log(`  – colaGpu(1) y enGpu(1): saltadas (hay ${cuantas} GPU)`); }
}
if (envGpu && cuantas >= 2) {
  for (const [modo, extra] of [['en el acto', {}], ['perezoso', { C1EN_SIM_PEREZOSO: '1' }]]) {
    const r = correr(DOS_GPU, 'gpu', Object.assign({}, envGpu, extra));
    const l = r.out.split('\n');
    comprobar(`gpu (2, ${modo}): los mismos números que jit`, r.ok && l[3] === refDos.out.split('\n')[3], corto(r) + '\n  esperado: ' + refDos.out);
    if (!GPU_REAL) {
      comprobar(`gpu (2, ${modo}): numeroGpus() = 2, enGpu(1) corre en la 1 y vuelve a la 0`,
        r.ok && l[0] === '2' && /\(0\)$/.test(l[1]) && / \(1\) gpu: .*\(0\)$/.test(l[2]), r.out);
      comprobar(`gpu (2, ${modo}): núcleos en las dos GPU y copias directas entre ellas`,
        r.ok && r.porGpu && r.porGpu[0] > 0 && r.porGpu[1] > 0 && r.peer >= 2, r.err.split('\n').slice(-3).join(' | '));
    }
  }
  if (!GPU_REAL) {
    const r = correr(DOS_GPU, 'gpu', Object.assign({}, envGpu, { C1EN_SIM_PEER: '0' }));
    comprobar('gpu (2) sin acceso directo entre las dos: lo mismo (el driver copia por su cuenta)', r.ok && r.out.split('\n')[3] === refDos.out.split('\n')[3], corto(r));
  }
  const n = correr(GPU_QUE_NO_HAY, 'gpu', envGpu);
  comprobar('enGpu(5, …) con dos GPU: «no hay GPU 5»', !n.ok && n.err.includes('no hay GPU 5'), corto(n));
}
const nj = correr(GPU_QUE_NO_HAY, 'jit');
comprobar('enGpu(5, …) en jit: solo corre la función', nj.ok && nj.out === '1', corto(nj));

console.log(`\n${pasan} pasan, ${fallan} fallan${saltadas ? `, ${saltadas} saltadas` : ''}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
process.exit(fallan ? 1 : 0);
