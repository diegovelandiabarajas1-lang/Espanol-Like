// motor-exp · N4.2 «Precisión simple y media»: real32 y real16.
//
// La promesa: cada operación sobre un real32 (o real16) se hace en 64 bits y
// se redondea UNA vez a su tipo, y eso es exactamente la aritmética de 32 (o
// 16) bits de verdad; el producto de matrices suma con fmaf en el orden de
// siempre, y da los mismos bits en jit, nativo y GPU. Aquí se comprueba contra
// C de verdad (float, _Float16 y fmaf de gcc, cargados con koffi), contra
// NumPy si está, y entre los tres dispositivos de C1EÑ (la GPU, simulada).
//
//   node motor-exp/pruebas/exp-precision.js          (--gpu: la GPU de verdad)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const R = require('../rutas.js');
require(R.bundle);
const NEN = require(R.src('17-nen-tensores.js'));

const GPU_REAL = process.argv.includes('--gpu');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
let pasan = 0, fallan = 0, saltadas = 0;
const fallos = [];
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre); console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${detalle}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = null;
try { koffi = require('koffi'); } catch (_) { /* sin koffi */ }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-precision-'));

// Las piezas de la VM (están en el bundle, que las deja a la vista de las pruebas).
const VM = require(R.src('03-vm-jit.js'));
const { redondear16, bitsDe16, deBits16 } = VM;
const nenFmaf = (() => {   // la emulación exacta de fmaf que usa el núcleo en jit
  const src = fs.readFileSync(R.src('17-nen-tensores.js'), 'utf8');
  const ini = src.indexOf('const NEN_FMA_F'), f = src.indexOf('function nenFmaf'), fin = src.indexOf('function nenFmaPartir');
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(ini, src.indexOf('\n', ini)) + '\n' + src.slice(f, fin) + '\nreturn nenFmaf;')();
})();

// ── azar con semilla ────────────────────────────────────────────────────────
let sem = 20261020;
const azar = () => { sem = (sem + 0x6D2B79F5) >>> 0; let t = sem; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const f32 = new Float32Array(1), b32 = new Uint32Array(f32.buffer);
const floatAlAzar = (emin, emax) => {            // bits de float al azar, en un rango de exponentes
  const e = emin + Math.floor(azar() * (emax - emin + 1));
  b32[0] = ((azar() < 0.5 ? 1 : 0) << 31) | ((e + 127) << 23) | Math.floor(azar() * 8388608);
  return f32[0];
};
const doubleAlAzar = (emin, emax) => {
  const e = emin + Math.floor(azar() * (emax - emin + 1));
  u32[1] = ((azar() < 0.5 ? 1 : 0) << 31) | ((e + 1023) << 20) | Math.floor(azar() * 1048576);
  u32[0] = Math.floor(azar() * 4294967296);
  return f64[0];
};

// ── 1. contra C: _Float16, float y fmaf de gcc ────────────────────────────────
let C = null;
if (!koffi) { saltadas++; console.log('  (sin koffi: no se compara con C)'); }
else if (!hay('gcc')) { saltadas++; console.log('  (sin gcc: no se compara con C)'); }
else {
  const fuente = `#include <math.h>
double c_f16(double x) { return (double)(_Float16)x; }
/* (Windows) el fmaf de la biblioteca de mingw no es exacto en los desbordes:
   fmaf(3.4e38, 2, -3.4e38) le da infinito, y la respuesta es 3.4e38. Ahí la
   referencia es la instrucción del procesador (vfmadd, exacta por definición),
   que tienen todos los x86 desde 2013. Sin ella, la comparación se salta. */
#if defined(_WIN32)
__attribute__((target("fma"))) static float fma_hw(float a, float b, float c) { return __builtin_fmaf(a, b, c); }
int c_fma_fiable(void) { __builtin_cpu_init(); return __builtin_cpu_supports("fma"); }
__attribute__((target("fma"))) void c_fmafv(const float* a, const float* b, const float* c, float* y, long long n) { for (long long i = 0; i < n; i++) y[i] = fma_hw(a[i], b[i], c[i]); }
#else
int c_fma_fiable(void) { return 1; }
void c_fmafv(const float* a, const float* b, const float* c, float* y, long long n) { for (long long i = 0; i < n; i++) y[i] = fmaf(a[i], b[i], c[i]); }
#endif
float c_fmaf(float a, float b, float c) { return fmaf(a, b, c); }
void c_f16v(const double* x, double* y, long long n) { for (long long i = 0; i < n; i++) y[i] = (double)(_Float16)x[i]; }
void c_ops32(int op, const float* a, const float* b, float* y, long long n) {
  for (long long i = 0; i < n; i++) { float x = a[i], z = b[i];
    y[i] = op == 0 ? x + z : op == 1 ? x - z : op == 2 ? x * z : op == 3 ? x / z : sqrtf(fabsf(x)); }
}
void c_ops16(int op, const float* a, const float* b, float* y, long long n) {
  for (long long i = 0; i < n; i++) { _Float16 x = (_Float16)a[i], z = (_Float16)b[i], r;
    if (op == 0) r = x + z; else if (op == 1) r = x - z; else if (op == 2) r = x * z; else if (op == 3) r = x / z; else r = (_Float16)sqrtf(fabsf((float)x));
    y[i] = (float)r; }
}
`;
  const archC = path.join(tmp, 'p.c'), archSo = path.join(tmp, process.platform === 'win32' ? 'p.dll' : 'p.so');
  fs.writeFileSync(archC, fuente);
  try {
    execFileSync('gcc', ['-O2', '-std=gnu11', '-ffp-contract=off', '-fno-fast-math', '-shared', '-fPIC', '-o', archSo, archC, '-lm'], { stdio: 'pipe' });
    const lib = koffi.load(archSo);
    C = {
      f16v: lib.func('void c_f16v(const double *x, _Out_ double *y, int64_t n)'),
      fmafv: lib.func('void c_fmafv(const float *a, const float *b, const float *c, _Out_ float *y, int64_t n)'),
      fmaFiable: lib.func('int c_fma_fiable(void)'),
      ops32: lib.func('void c_ops32(int op, const float *a, const float *b, _Out_ float *y, int64_t n)'),
      ops16: lib.func('void c_ops16(int op, const float *a, const float *b, _Out_ float *y, int64_t n)'),
      lib,
    };
  } catch (e) { saltadas++; console.log('  (gcc no compiló _Float16: ' + String(e.stderr || e.message).split('\n')[0] + ')'); }
}
const distintos = (x, y) => { for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i]) && !(x[i] !== x[i] && y[i] !== y[i])) return i; return -1; };

console.log('── redondear a 16 bits');
{
  // los 63.488 halves finitos y sus puntos medios (los empates), y un poco a cada lado
  const casos = [];
  for (let h = 0; h < 0x7c00; h++) {
    const v = deBits16(h), w = deBits16(h + 1), m = (v + w) / 2;
    casos.push(v, -v, m, -m);
    f64[0] = m; u32[0] += 1; casos.push(f64[0]); f64[0] = m; u32[0] -= 1; casos.push(f64[0]);
  }
  for (let i = 0; i < 400000; i++) casos.push(doubleAlAzar(-30, 17));
  casos.push(65504, 65519.99999, 65520, 65536, 1e300, -1e300, Infinity, -Infinity, NaN, 0, -0, 2 ** -24, 2 ** -25, 2 ** -25 * 1.0000001, 2 ** -26, 5e-324);
  const x = Float64Array.from(casos), mio = x.map(redondear16);
  let rt = -1;
  for (let h = 0; h < 0x10000; h++) { const v = deBits16(h); if (v === v && bitsDe16(v) !== h) { rt = h; break; } }
  comprobar(`bits ↔ half: los 65.536 patrones van y vuelven (salvo NaN)`, rt < 0, `falla el patrón 0x${rt.toString(16)}`);
  if (C) {
    const y = new Float64Array(x.length); C.f16v(x, y, x.length);
    const j = distintos(mio, y);
    comprobar(`redondear16 = (_Float16) de gcc en ${x.length.toLocaleString('es')} casos (todos los halves, sus empates, ±1 ulp, al azar, bordes)`, j < 0,
      j >= 0 ? `x = ${x[j]}: Ñ ${mio[j]}, C ${y[j]}` : '');
  }
}

console.log('── fmaf exacta en JavaScript');
if (C && !C.fmaFiable()) { saltadas++; console.log('  (este procesador no tiene FMA y el fmaf de la biblioteca de C no es exacto: no hay con qué comparar)'); }
else if (C) {
  const N = 3000000, a = new Float32Array(N), b = new Float32Array(N), c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = i % 6;
    if (k === 0) { a[i] = floatAlAzar(-20, 20); b[i] = floatAlAzar(-20, 20); c[i] = floatAlAzar(-40, 40); }
    else if (k === 1) { a[i] = floatAlAzar(-60, 60); b[i] = floatAlAzar(-60, 60); c[i] = -Math.fround(a[i] * b[i]); }   // cancelación
    else if (k === 2) { a[i] = floatAlAzar(-5, 5); b[i] = floatAlAzar(-5, 5); f32[0] = a[i] * b[i]; b32[0] += (azar() < 0.5 ? 1 : -1); c[i] = -f32[0]; }
    else if (k === 3) { a[i] = Math.floor(azar() * 4096) + 1; b[i] = Math.floor(azar() * 4096) + 1; c[i] = (azar() < 0.5 ? 0.5 : -0.5) * 2 ** Math.floor(azar() * 4); }   // empates
    else if (k === 4) { a[i] = floatAlAzar(-70, -60); b[i] = floatAlAzar(-70, -60); c[i] = floatAlAzar(-149, -126); }   // resultados subnormales
    else { a[i] = floatAlAzar(60, 64); b[i] = floatAlAzar(60, 64); c[i] = floatAlAzar(100, 127); }                       // cerca del desbordamiento
  }
  a[0] = 0; b[0] = -1; c[0] = 0; a[1] = Infinity; b[1] = 0; c[1] = 1; a[2] = NaN; a[3] = 3.4e38; b[3] = 2; c[3] = -3.4e38;
  const y = new Float32Array(N); C.fmafv(a, b, c, y, N);
  const mio = new Float32Array(N); for (let i = 0; i < N; i++) mio[i] = nenFmaf(a[i], b[i], c[i]);
  const j = distintos(mio, y);
  comprobar(`nenFmaf = fmaf() de C en ${N.toLocaleString('es')} casos (cancelaciones, empates, subnormales, desbordes)`, j < 0,
    j >= 0 ? `fmaf(${a[j]}, ${b[j]}, ${c[j]}): Ñ ${mio[j]}, C ${y[j]}` : '');
}

// ── 2. la VM: lo que calcula un programa de Ñ, contra C y entre dispositivos ──
function correrN(src, args, env) {
  const f = path.join(tmp, `prog${Math.floor(azar() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const r = spawnSync(process.execPath, [N_NODE, f, ...(args || [])], { encoding: 'utf8', cwd: tmp, env: Object.assign({}, process.env, env || {}), maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
// (con su desplazamiento: Node puede devolver un Buffer que es un trozo de un
// bloque compartido, y leer «.buffer» entero da los bytes de otro archivo)
const leer32 = f => { const b = fs.readFileSync(path.join(tmp, f)); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const leer16 = f => { const b = fs.readFileSync(path.join(tmp, f)); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

console.log('── aritmética de arreglos en la VM, contra float y _Float16 de C');
{
  const N = 200000, A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    A[i] = i % 3 ? floatAlAzar(-12, 12) : Math.fround(redondear16(doubleAlAzar(-12, 12)));
    B[i] = i % 5 ? floatAlAzar(-12, 12) : Math.fround(redondear16(doubleAlAzar(-12, 12)));
    if (i % 7 === 0) A[i] = Math.abs(A[i]);
  }
  fs.writeFileSync(path.join(tmp, 'a.bin'), Buffer.from(A.buffer)); fs.writeFileSync(path.join(tmp, 'b.bin'), Buffer.from(B.buffer));
  const prog = `usar aTipo, tipoArreglo, raiz, absoluto de "numerico"
fijo a = leerArregloBinario("a.bin", "real32", [${N}])
fijo b = leerArregloBinario("b.bin", "real32", [${N}])
escribirArregloBinario("s32.bin", a + b)
escribirArregloBinario("r32.bin", a - b)
escribirArregloBinario("m32.bin", a * b)
escribirArregloBinario("d32.bin", a / b)
escribirArregloBinario("q32.bin", raiz(absoluto(a)))
fijo h = aTipo(a, "real16")
fijo g = aTipo(b, "real16")
escribirArregloBinario("s16.bin", h + g)
escribirArregloBinario("r16.bin", h - g)
escribirArregloBinario("m16.bin", h * g)
escribirArregloBinario("d16.bin", h / g)
escribirArregloBinario("q16.bin", raiz(absoluto(h)))
escribirArregloBinario("h.bin", h)
imprimir(tipoArreglo(a + b), tipoArreglo(h * g), tipoArreglo(a * h), tipoArreglo(h * 2.5), tipoArreglo(a + aTipo(a, "real")), tipoArreglo(aTipo(a, "entero") * h), tipoArreglo(aTipo(a, "entero") / 2))
`;
  const r = correrN(prog);
  if (!r.ok) comprobar('el programa de aritmética corre', false, (r.out + r.err).split('\n').slice(-5).join(' · '));
  else {
    comprobar('los tipos: real32+real32 → real32, real16·real16 → real16, real32·real16 → real32, real16·2.5 → real16, real32+real → real, entero·real16 → real16, entero/2 → real',
      r.out === 'real32 real16 real32 real16 real real16 real', r.out);
    if (C) {
      const nombres = ['s', 'r', 'm', 'd', 'q'], ops = ['+', '−', '×', '÷', 'raíz'];
      for (let op = 0; op < 5; op++) {
        const y = new Float32Array(N); C.ops32(op, A, B, y, N);
        const mio = leer32(nombres[op] + '32.bin');
        const j = distintos(mio, y);
        comprobar(`real32 ${ops[op]}: igual al float de C en ${N.toLocaleString('es')} pares`, j < 0, j >= 0 ? `[${j}] ${A[j]} ${ops[op]} ${B[j]}: Ñ ${mio[j]}, C ${y[j]}` : '');
      }
      const h = Float32Array.from(leer16('h.bin'), deBits16);
      const hb = Float32Array.from(B, x => redondear16(x));
      for (let op = 0; op < 5; op++) {
        const y = new Float32Array(N); C.ops16(op, h, hb, y, N);
        const mio = Float32Array.from(leer16(nombres[op] + '16.bin'), deBits16);
        const j = distintos(mio, y);
        comprobar(`real16 ${ops[op]}: igual al _Float16 de C en ${N.toLocaleString('es')} pares (y los archivos de 2 bytes)`, j < 0, j >= 0 ? `[${j}] ${h[j]} ${ops[op]} ${hb[j]}: Ñ ${mio[j]}, C ${y[j]}` : '');
      }
    }
  }
}

// ── 3. el producto de matrices en los tres dispositivos ───────────────────────
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
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador';
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim };
  }
}
console.log('── por(A, B) en real32 y real16: jit, nativo y GPU' + (GPU_REAL ? '' : ' (simulada)'));
{
  const m = 70, K = 300, p = 53;
  const A = new Float32Array(m * K), B = new Float32Array(K * p);
  for (let i = 0; i < A.length; i++) A[i] = floatAlAzar(-3, 3) * (i % 9 === 0 ? 4096 : 1);
  for (let i = 0; i < B.length; i++) B[i] = floatAlAzar(-3, 3) * (i % 7 === 0 ? 1 / 4096 : 1);
  fs.writeFileSync(path.join(tmp, 'A.bin'), Buffer.from(A.buffer)); fs.writeFileSync(path.join(tmp, 'B.bin'), Buffer.from(B.buffer));
  const prog = `usar por, aTipo, tipoArreglo de "numerico"
usar usarDispositivo, paralelo de "nen"
fijo D = argumentos()[0]
usarDispositivo(D)
fijo A = leerArregloBinario("A.bin", "real32", [${m}, ${K}])
fijo B = leerArregloBinario("B.bin", "real32", [${K}, ${p}])
fijo C = por(A, B)
escribirArregloBinario("C32-" + D + ".bin", C)
escribirArregloBinario("C16-" + D + ".bin", por(aTipo(A, "real16"), aTipo(B, "real16")))
# paralelo sobre un real32: lee float, calcula en double, guarda float
fijo y = aTipo(A, "real32")
fn paso(i: entero, x, s: real) { x[i] = x[i] * s + 0.1 }
paralelo(${m * K}, paso, y, 1.37)
escribirArregloBinario("P32-" + D + ".bin", y)
imprimir(tipoArreglo(C), "fin en " + D)
`;
  // la referencia: el respaldo del núcleo, directamente
  const ref32 = new Float32Array(m * p); NEN.NEN_T_NUCLEOS.nen_sgemm.js(1, m, K, p, A, B, ref32);
  const A16 = Float32Array.from(A, redondear16), B16 = Float32Array.from(B, redondear16);
  const ref16t = new Float32Array(m * p); NEN.NEN_T_NUCLEOS.nen_sgemm.js(1, m, K, p, A16, B16, ref16t);
  const ref16 = Uint16Array.from(ref16t, x => bitsDe16(redondear16(x)));
  const refP = Float32Array.from(A, x => x * 1.37 + 0.1);
  const dispositivos = [['jit', {}]];
  if (koffi && hay('gcc')) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }
  if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
  for (const [d, env] of dispositivos) {
    const r = correrN(prog, [d], Object.assign({ C1EN_DISPOSITIVO: d }, env));
    if (!r.ok || !r.out.includes('fin en ' + d)) { comprobar(`${d}: el programa corre`, false, (r.out + '\n' + r.err).split('\n').slice(-5).join(' · ')); continue; }
    const c32 = leer32(`C32-${d}.bin`), c16 = leer16(`C16-${d}.bin`), p32 = leer32(`P32-${d}.bin`);
    const j1 = distintos(c32, ref32), j2 = distintos(c16, ref16), j3 = distintos(p32, refP);
    comprobar(`${d}: por en real32 = el SGEMM de referencia al bit (${m}×${K}·${K}×${p})`, j1 < 0, j1 >= 0 ? `casilla ${j1}: ${c32[j1]} y ${ref32[j1]}` : '');
    comprobar(`${d}: por en real16 = SGEMM y redondeo a 16 al final, al bit`, j2 < 0, j2 >= 0 ? `casilla ${j2}` : '');
    comprobar(`${d}: paralelo sobre un real32 = x·s + 0.1 en double y guardado en float, al bit`, j3 < 0, j3 >= 0 ? `[${j3}] ${p32[j3]} y ${refP[j3]}` : '');
  }
}

// ── 3b. el SGEMM de la GPU, compilado a PTX de verdad (clang, sm_75) ─────────
console.log('── nen_sgemm en PTX (clang -x cuda, sm_75)');
{
  const tieneNvptx = hay('clang++') && /nvptx/.test(spawnSync('clang++', ['-print-targets'], { encoding: 'utf8' }).stdout || '');
  if (!tieneNvptx) { saltadas++; console.log('  (sin clang con el destino nvptx64)'); }
  else {
    const EL = globalThis.EspanolLike;
    const m = EL.crearMotor({ salida: () => {} });
    const k = m.vm.c1en.kernel(NEN.NEN_T_NUCLEOS.nen_sgemm);
    const f = path.join(tmp, 's.cu'), ptxF = path.join(tmp, 's.ptx');
    fs.writeFileSync(f, m.vm.c1en.fuenteKernel(k, 'cuda'));
    const r = spawnSync('clang++', ['-x', 'cuda', '--cuda-device-only', '--cuda-gpu-arch=sm_75', '-nocudainc', '-nocudalib',
      '-O2', '-ffp-contract=off', '-std=c++17', '-Wno-unknown-cuda-version', '-include', path.join(__dirname, 'c1en-sim', 'cuda-clang.h'),
      '-S', f, '-o', ptxF], { encoding: 'utf8' });
    comprobar('compila a PTX', r.status === 0, (r.stderr || '').split('\n').slice(0, 4).join(' · '));
    if (r.status === 0) {
      const ptx = fs.readFileSync(ptxF, 'utf8');
      const nf = (ptx.match(/fma\.rn\.f32/g) || []).length, nd = (ptx.match(/fma\.rn\.f64/g) || []).length;
      const nb = (ptx.match(/bar\.sync/g) || []).length;
      comprobar(`el SGEMM es FFMA en simple: ${nf} fma.rn.f32, 0 en doble, ${nb} barreras`, nf >= 256 && nd === 0 && nb >= 2, `f32 ${nf}, f64 ${nd}, barreras ${nb}`);
    }
  }
}

// ── 4. NumPy, si está: el mismo half y el mismo float que el de Python ───────
console.log('── contra NumPy');
{
  const py = spawnSync('python3', ['-c', 'import numpy; print(numpy.__version__)'], { encoding: 'utf8' });
  if (py.status !== 0) { saltadas++; console.log('  (sin NumPy)'); }
  else {
    const x = new Float64Array(300000);
    for (let i = 0; i < x.length; i++) x[i] = doubleAlAzar(-28, 16);
    fs.writeFileSync(path.join(tmp, 'x64.bin'), Buffer.from(x.buffer));
    const r = spawnSync('python3', ['-c', `import numpy as np, sys
x = np.fromfile(sys.argv[1], dtype=np.float64)
x.astype(np.float16).tofile(sys.argv[2])
a = x.astype(np.float32); b = a[::-1].copy()
(a * b + a).tofile(sys.argv[3])`, path.join(tmp, 'x64.bin'), path.join(tmp, 'x16.bin'), path.join(tmp, 'x32.bin')], { encoding: 'utf8' });
    if (r.status !== 0) comprobar('NumPy corre', false, r.stderr.split('\n').slice(-3).join(' · '));
    else {
      const h = leer16('x16.bin'), mio = Uint16Array.from(x, v => bitsDe16(redondear16(v)));
      const j = distintos(mio, h);
      comprobar(`redondear16 = astype(float16) de NumPy ${py.stdout.trim()} en ${x.length.toLocaleString('es')} casos`, j < 0, j >= 0 ? `x = ${x[j]}` : '');
      const a = Float32Array.from(x), b = Float32Array.from(a).reverse(), y = leer32('x32.bin');
      const z = new Float32Array(a.length); for (let i = 0; i < a.length; i++) z[i] = Math.fround(a[i] * b[i]) + a[i];
      const k = distintos(z, y);
      comprobar('a·b + a en float32 = lo de NumPy (dos redondeos, sin FMA)', k < 0, k >= 0 ? `[${k}]` : '');
    }
  }
}

// ── 5. lo que se ve: imprimir, errores y mensajes ─────────────────────────────
console.log('── imprimir y errores');
{
  const r = correrN(`usar arreglo, aTipo, ceros, lleno, unos, tipoArreglo, elemento, donde, concatenar, apilar, mayorQue de "numerico"
fijo a = arreglo([0.1, 0.2, 1.5, 3], "real32")
imprimir(a)
imprimir(arreglo([0.1, 1000.7, 65519, 65520, -1e-8, 3.0e-5], "real16"))
imprimir(lleno(3, 0.1, "real16"), tipoArreglo(unos([2, 2], "real16")), tipoArreglo(ceros(2, "real32")))
imprimir(elemento(a, 0), tipoArreglo(concatenar(a, aTipo(a, "real16"))), tipoArreglo(apilar(a, a)), tipoArreglo(donde(mayorQue(a, 1), a, 0)))
fijo h = aTipo(a, "real16")
h[0] = 0.3
imprimir(h, h[0])
intentar { aTipo(a, "real8") } capturar (e) { imprimir(e.mensaje) }
`);
  const esperado = [
    'arreglo 4 de real32',
    '[0.1, 0.2, 1.5, 3]',
    'arreglo 6 de real16',
    '[0.1, 1000.5, 65504, infinito, 0, 0.00003]',
  ];
  comprobar('real32 y real16 se imprimen con sus dígitos más cortos (0.1 y no 0.100000001490116)',
    r.ok && esperado.every(l => r.out.split('\n').includes(l)), r.out.split('\n').slice(0, 6).join(' ⏎ ') + r.err);
  comprobar('lleno/unos/ceros con tipo, concatenar, apilar y donde conservan real32/real16',
    r.ok && r.out.includes('real16 real32') && r.out.includes('0.100000001490116 real32 real32 real32'), r.out);
  comprobar('a[i] = v en un real16 redondea a 16 bits (0.3 → 0.300048828125)', r.ok && r.out.includes('0.300048828125'), r.out);
  comprobar('un tipo que no existe lo dice, con la lista nueva', r.ok && r.out.includes('"real32", "real16", "i8"') && r.out.includes('"u64" y llegó «real8»'), r.out);
  const q = correrN(`usar arreglo, aTipo de "numerico"
usar paralelo de "nen"
fn f(i: entero, x) { x[i] = 1.0 }
paralelo(3, f, aTipo(arreglo([1, 2, 3]), "real16"))
`);
  comprobar('paralelo con un real16 dice que todavía no, y qué hacer', !q.ok && /real16, y en «paralelo» todavía no entran/.test(q.out), q.out);
}

if (C) { try { C.lib.unload(); } catch (_) { /* nada */ } }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas por falta de herramientas` : ''));
process.exit(fallan ? 1 : 0);
