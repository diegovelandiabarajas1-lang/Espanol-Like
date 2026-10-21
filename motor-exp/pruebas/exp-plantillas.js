// motor-exp · N4.9 «Plantillas en los núcleos».
//
// Un núcleo de C1EÑ ya era uno por cada firma de tipos con que se lanza. Ahora
// además se puede escribir GENÉRICO, como una plantilla:
//  · fn f<T>(i, a: arreglo<T>, b: arreglo<T>, k: T): a y b con números del mismo
//    tipo, y k de ese tipo (entero si T es entero, real si es real o real32);
//  · fn f(i, a: arreglo<real32>): el tipo pedido, comprobado al lanzar;
//  · dentro, tipoArreglo(a), epsilonTipo, minimoTipo y maximoTipo son constantes
//    del núcleo, y un «si» con una condición constante solo compila la rama que
//    toca (la otra puede no valer para ese tipo), como el «if constexpr» de C++.
// Se compara jit = nativo = GPU (simulada) al bit, y con la misma función
// llamada fuera de un núcleo (la VM), que tiene que dar lo mismo.
//
//   node motor-exp/pruebas/exp-plantillas.js          (--gpu: la GPU de verdad)
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-plantillas-'));

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
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim, C1EN_SIM_GPUS: '1' };
  }
}
function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo, C1EN_ESTADISTICAS: '1' });
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: ((r.stderr || '') + '\n' + (r.stdout || '')).trim() };
}


const CAB = `usar paralelo, paraleloBloques, hilos, codigoC, codigoCuda, barrera, compartido de "nen"
usar ceros, aTipo, tipoArreglo, epsilonTipo, maximoTipo, minimoTipo, piso, aListaA, bitsY, suma de "numerico"
`;
const corto = r => (r.ok ? r.out : r.err).split('\n').filter(l => !l.startsWith('[c1en')).slice(-6).join('\n');

// 1. Un núcleo genérico, con una rama por tipo que en el otro tipo no compilaría:
//    bitsY solo vale con enteros, y guardar a[i] * 0,5 en un arreglo entero tampoco.
const GENERICO = CAB + `
fn escalar<T>(i, a: arreglo<T>, b: arreglo<T>, k: T) {
  si tipoArreglo(a) == "entero" o tipoArreglo(a) == "u8" {
    b[i] = maximo(bitsY(a[i] * k, maximoTipo(a)), -maximoTipo(a))
  } sino si tipoArreglo(a) == "real32" {
    b[i] = a[i] * k + epsilonTipo(a)
  } sino {
    b[i] = maximo(a[i] * k * 0.5 - epsilonTipo(a), minimoTipo(a))    # un negativo constante
  }
}
fn llenar(i, a) { a[i] = (i * 37) % 251 }
fijo N = 1000
fijo r = ceros(N)
paralelo(N, llenar, r)
fijo e = aTipo(r, "entero")
fijo u = aTipo(r, "u8")
fijo f = aTipo(r, "real32")
fijo r2 = ceros(N)
fijo e2 = ceros(N, "entero")
fijo u2 = ceros(N, "u8")
fijo f2 = ceros(N, "real32")
paralelo(N, escalar, r, r2, 3)
paralelo(N, escalar, e, e2, 3)
paralelo(N, escalar, u, u2, 3)
paralelo(N, escalar, f, f2, 3)
imprimir(suma(r2), suma(e2), suma(u2), suma(f2))
imprimir(r2[5], e2[5], u2[5], f2[5])
# y la misma función llamada fuera de un núcleo, en la VM
fijo r3 = ceros(N)
fijo e3 = ceros(N, "entero")
para i en rango(N) { escalar(i, r, r3, 3) }
para i en rango(N) { escalar(i, e, e3, 3) }
imprimir(suma(r3) == suma(r2), suma(e3) == suma(e2))
`;
const MIRAR_RAMAS = CAB + `
fn escalar<T>(i, a: arreglo<T>, b: arreglo<T>) {
  si tipoArreglo(a) == "entero" { b[i] = bitsY(a[i], 255) } sino { b[i] = a[i] * 0.5 }
}
imprimir(codigoC(escalar, ceros(2, "entero"), ceros(2, "entero")))
`;

// 2. Lo que se comprueba al lanzar
const MAL = (cuerpo) => CAB + `
fn g<T>(i, a: arreglo<T>, b: arreglo<T>, k: T) { b[i] = a[i] * k }
fn h(i, a: arreglo<real32>) { a[i] = 1 }
fn m<T>(i, a: T, b: T) { b[i] = a[i] }
${cuerpo}
`;
const ERRORES = [
  ['dos arreglos de tipos distintos en la misma T', MAL('paralelo(4, g, ceros(4), ceros(4, "entero"), 2)'), 'T no puede ser a la vez números real (por «a») y números entero (por «b»)'],
  ['un real en una T que es entero', MAL('paralelo(4, g, ceros(4, "entero"), ceros(4, "entero"), 2.5)'), '«k» es T = entero (el tipo de «a») y llegó 2.5'],
  ['arreglo<real32> con un arreglo real', MAL('paralelo(4, h, ceros(4))'), '«a» está anotado como arreglo<real32> y llegó un arreglo real'],
  ['arreglo<…> con un número', MAL('paralelo(4, h, 3)'), '«a» está anotado como arreglo<real32> y llegó un número'],
  ['T = arreglo real y arreglo u8', MAL('paralelo(4, m, ceros(4), ceros(4, "u8"))'), 'T no puede ser a la vez arreglo real (por «a») y arreglo u8 (por «b»)'],
  ['T = arreglo y número', MAL('paralelo(4, m, ceros(4), 3)'), 'T no puede ser a la vez arreglo real (por «a») y un número (por «b»)'],
  ['tipoArreglo fuera de una comparación', CAB + `
fn f(i, a) { si tipoArreglo(a) { a[i] = 1 } }
paralelo(4, f, ceros(4))
`, '«tipoArreglo» dentro de un núcleo solo se compara con un texto'],
  ['la rama que sí toca tiene que valer', CAB + `
fn f(i, a) { si tipoArreglo(a) == "entero" { a[i] = a[i] * 0.5 } }
paralelo(4, f, ceros(4, "entero"))
`, 'se guarda un real en el arreglo entero «a»'],
];

// 3. En los núcleos de bloques y de hilos también
const BLOQUES_HILOS = CAB + `
fn sumaBloque<T>(b, t, a: arreglo<T>, r: arreglo<T>) {
  fijo s = compartido(64)
  s[t] = a[b * 64 + t]
  barrera()
  si t == 0 {
    var acc = 0
    para j en rango(64) { acc = acc + s[j] }
    si tipoArreglo(r) == "entero" { r[b] = bitsY(entero(acc), maximoTipo(r)) } sino { r[b] = acc + epsilonTipo(r) }
  }
}
fn porHilo<T>(t, a: arreglo<T>, k: T) {
  para j en rango(10) { a[t * 10 + j] = (t + j) * k }
}
fijo a = ceros(256)
para i en rango(256) { a[i] = i % 13 }
fijo ae = aTipo(a, "entero")
fijo r = ceros(4)
fijo re = ceros(4, "entero")
paraleloBloques(4, 64, sumaBloque, a, r)
paraleloBloques(4, 64, sumaBloque, ae, re)
imprimir(aListaA(r), aListaA(re))
fijo h = ceros(40, "entero")
hilos(4, porHilo, h, 3)
imprimir(suma(h))
`;

console.log('· un núcleo genérico, una rama por tipo');
const ref = correr(GENERICO, 'jit');
comprobar('jit: corre, y la VM da lo mismo que el núcleo', ref.ok && ref.out.split('\n')[2] === 'cierto cierto', corto(ref));
if (hay('gcc')) {
  const r = correr(GENERICO, 'nativo');
  comprobar('nativo: lo mismo que jit, al bit', r.ok && r.out === ref.out, corto(r) + '\n  esperado: ' + ref.out);
} else { saltadas++; console.log('  – nativo: saltada (no hay gcc)'); }
if (envGpu) {
  const r = correr(GENERICO, 'gpu', envGpu);
  comprobar('gpu: lo mismo que jit, al bit', r.ok && r.out === ref.out, corto(r) + '\n  esperado: ' + ref.out);
} else { saltadas++; console.log(`  – gpu: saltada (${motivoSinGpu})`); }
const ramas = correr(MIRAR_RAMAS, 'jit');
comprobar('codigoC de la versión entera: solo la rama del entero', ramas.ok && /c1en_bits|&/.test(ramas.out) && !/0\.5/.test(ramas.out), corto(ramas));

console.log('· lo que se comprueba al lanzar');
for (const [nombre, src, msg] of ERRORES) {
  const r = correr(src, 'jit');
  comprobar(nombre, !r.ok && r.err.includes(msg), corto(r));
}

console.log('· en paraleloBloques y en hilos');
const refB = correr(BLOQUES_HILOS, 'jit');
comprobar('jit: corre', refB.ok && refB.out.split('\n').length === 2, corto(refB));
for (const [d, extra] of [['nativo', null], ['gpu', envGpu]]) {
  if (d === 'nativo' && !hay('gcc')) continue;
  if (d === 'gpu' && !envGpu) continue;
  const r = correr(BLOQUES_HILOS, d, extra);
  comprobar(`${d}: lo mismo que jit`, r.ok && r.out === refB.out, corto(r) + '\n  esperado: ' + refB.out);
}

console.log(`\n${pasan} pasan, ${fallan} fallan${saltadas ? `, ${saltadas} saltadas` : ''}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
process.exit(fallan ? 1 : 0);
