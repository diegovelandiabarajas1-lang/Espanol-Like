// motor-exp · N4.4 «El modelo de la GPU en manos del usuario»: paraleloBloques.
//
// Un núcleo de bloques ve la cuadrícula de la GPU: el bloque «b», el hilo «t»
// dentro del bloque, memoria compartida del bloque (compartido) y barreras.
// Aquí se comprueba que jit (generadores), nativo (corrutinas) y GPU (simulada
// perezosa, la cooperativa de pruebas/c1en-sim) dan los MISMOS bits en una
// reducción en árbol, una traspuesta por mosaicos, una suma prefija y un
// histograma con atómicos en compartida; que los errores salen igual, con el
// hilo y el bloque; que jit y nativo cazan las barreras mal puestas; y que el
// núcleo compila a PTX de verdad (clang, sm_75) con bar.sync y memoria .shared.
//
//   node motor-exp/pruebas/exp-bloques.js          (--gpu: la GPU de verdad)
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
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 10).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-bloques-'));
const SIM = path.join(__dirname, 'c1en-sim');

let envGpu = null, motivoSinGpu = null;
if (GPU_REAL) envGpu = {};
else if (!koffi) motivoSinGpu = 'no hay koffi';
else if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para el simulador';
else {
  const dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  fs.mkdirSync(dirSim, { recursive: true });
  const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
  const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA].concat(process.platform === 'win32' ? [] : ['-ldl']), { encoding: 'utf8' });
  const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim, C1EN_SIM_PEREZOSO: '1' };
  }
}
function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo });
  const r = spawnSync(process.execPath, [N_NODE, f, dispositivo], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const bytes = f => { try { return fs.readFileSync(path.join(tmp, f)); } catch (_) { return null; } };

const CAB = `usar paraleloBloques, barrera, hilosPorBloque, numeroBloques, compartido, compartidoEntero, paralelo, sumarAtomico de "nen"
usar ceros, suma, aListaA, aTipo, piso, colaGpu, enCola, esperarCola de "nen"
fijo D = argumentos()[0]
`;
const PROGRAMA = CAB + `
fn llenar(i, x) { x[i] = ((i * 7919) % 1000) / 999.0 - 0.37 }
# 1. reducción en árbol: la suma de cada bloque
fn sumaBloque(b, t, x, parciales) {
  fijo s = compartido(256)
  fijo g = b * hilosPorBloque() + t
  si g < longitud(x) { s[t] = x[g] }
  barrera()
  var paso = hilosPorBloque() // 2
  mientras paso > 0 {
    si t < paso { s[t] = s[t] + s[t + paso] }
    barrera()
    paso = paso // 2
  }
  si t == 0 { parciales[b] = s[0] }
}
# 2. traspuesta por mosaicos de 16×16 (un bloque por mosaico, 256 hilos)
fn traspuesta(b, t, a, r, filas, cols) {
  fijo tile = compartido(272)              # 16 × 17: una columna de relleno
  fijo mt = (cols + 15) // 16
  fijo bi = b // mt
  fijo bj = b % mt
  fijo ti = t // 16
  fijo tj = t % 16
  fijo i = bi * 16 + ti
  fijo j = bj * 16 + tj
  si i < filas y j < cols { tile[ti * 17 + tj] = a[i * cols + j] }
  barrera()
  fijo i2 = bj * 16 + ti
  fijo j2 = bi * 16 + tj
  si i2 < cols y j2 < filas { r[i2 * filas + j2] = tile[tj * 17 + ti] }
}
# 3. suma prefija de cada bloque (Hillis-Steele, con dos mitades que se alternan)
fn prefija(b, t, x, y) {
  fijo s = compartido(512)
  fijo n = hilosPorBloque()
  fijo g = b * n + t
  si g < longitud(x) { s[t] = x[g] }
  barrera()
  var entra = 0
  var sale = n
  var d = 1
  mientras d < n {
    var v = s[entra + t]
    si t >= d { v = v + s[entra + t - d] }
    s[sale + t] = v
    barrera()
    fijo q = entra
    entra = sale
    sale = q
    d = d * 2
  }
  si g < longitud(x) { y[g] = s[entra + t] }
}
# 4. histograma: atómicos de enteros en la compartida, y luego a la global
fn histograma(b, t, x, h) {
  fijo c = compartidoEntero(16)
  fijo g = b * hilosPorBloque() + t
  si g < longitud(x) {
    fijo k = entero(piso((x[g] + 0.37) * 15.99))
    sumarAtomico(c, k, 1)
  }
  barrera()
  si t < 16 { sumarAtomico(h, t, c[t]) }
}
fn cuadricula(b, t, r) { r[b * hilosPorBloque() + t] = numeroBloques() * 1000 + hilosPorBloque() }

fijo N = 100000
fijo x = ceros(N)
paralelo(N, llenar, x)
fijo nb = (N + 255) // 256
fijo p = ceros(nb)
paraleloBloques(nb, 256, sumaBloque, x, p)
escribirArregloBinario("suma-" + D + ".bin", p)
fijo F = 45
fijo C = 70
fijo a = ceros(F * C)
paralelo(F * C, llenar, a)
fijo r = ceros(F * C)
paraleloBloques(((F + 15) // 16) * ((C + 15) // 16), 256, traspuesta, a, r, F, C)
escribirArregloBinario("tras-" + D + ".bin", r)
fijo y = ceros(N)
paraleloBloques(nb, 256, prefija, x, y)
escribirArregloBinario("pref-" + D + ".bin", y)
fijo h = aTipo(ceros(16), "entero")
paraleloBloques(nb, 256, histograma, x, h)
imprimir("histograma", aListaA(h), suma(h))
fijo q = ceros(3 * 64)
paraleloBloques(3, 64, cuadricula, q)
imprimir("cuadricula", q[0], q[191])
# 5. lo mismo dentro de una cola
fijo c2 = colaGpu()
fijo p2 = ceros(nb)
enCola(c2, fn() { paraleloBloques(nb, 256, sumaBloque, x, p2) })
esperarCola(c2)
imprimir("en cola igual", aListaA(p2) == aListaA(p))
imprimir("fin en " + D)
`;
// un fallo: índice fuera de la compartida en el hilo 3 del bloque 1
const FALLO = CAB + `
fn malo(b, t, x) {
  fijo s = compartido(8)
  si b == 1 y t >= 3 { s[t + 5] = 1.0 }
  barrera()
  x[b * hilosPorBloque() + t] = s[0]
}
fijo x = ceros(32)
paraleloBloques(4, 8, malo, x)
`;
// barreras mal puestas (en una GPU: se cuelga o da basura); jit y nativo lo dicen
const DIVERGE = CAB + `
fn mitad(b, t, x) {
  si t < 4 { barrera() }
  x[t] = 1.0
}
fijo x = ceros(8)
paraleloBloques(1, 8, mitad, x)
`;
const SALE_ANTES = CAB + `
fn sale(b, t, x) {
  si t == 5 { devolver }
  barrera()
  x[t] = 1.0
}
fijo x = ceros(8)
paraleloBloques(1, 8, sale, x)
`;

const dispositivos = [['jit', {}]];
if (koffi && hay('gcc')) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }
if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
const salidas = {};
for (const [d, env] of dispositivos) {
  console.log(`── ${d}${d === 'gpu' && !GPU_REAL ? ' (simulada, cooperativa y perezosa)' : ''}`);
  const r = correr(PROGRAMA, d, env);
  salidas[d] = r;
  if (!r.ok || !r.out.includes('fin en ' + d)) { comprobar(`${d}: el programa corre`, false, r.out + '\n' + r.err); continue; }
  const lin = r.out.split('\n');
  comprobar(`${d}: histograma con atómicos en compartidaEntero: 100.000 cuentas`, lin[0].startsWith('histograma [') && lin[0].endsWith(' 100000'), lin[0]);
  comprobar(`${d}: numeroBloques() y hilosPorBloque() dentro del núcleo`, lin[1] === 'cuadricula 3064 3064', lin[1]);
  comprobar(`${d}: lo mismo dentro de una cola (enCola)`, lin[2] === 'en cola igual cierto', lin[2]);
  const f = correr(FALLO, d, env);
  comprobar(`${d}: un índice fuera de la compartida: «el hilo 3 del bloque 1 falló en la línea 7»`,
    !f.ok && /«paraleloBloques»: el hilo 3 del bloque 1 falló en la línea 7: el índice se sale del arreglo «s»/.test(f.out), f.out + f.err);
  if (d !== 'gpu') {
    const v = correr(DIVERGE, d, env), w = correr(SALE_ANTES, d, env);
    comprobar(`${d}: una barrera dentro de un «si» que no todos toman se caza, con su línea`,
      !v.ok && /el hilo 4 del bloque 0 falló en la línea 6: no todos los hilos del bloque llegaron a esta barrera/.test(v.out), v.out + v.err);
    comprobar(`${d}: un hilo que sale antes de la barrera se caza`,
      !w.ok && /el hilo 5 del bloque 0 falló en la línea 7: no todos los hilos del bloque llegaron a esta barrera/.test(w.out), w.out + w.err);
  }
}
// los mismos bits en los tres
const ref = 'jit';
for (const [d] of dispositivos) {
  if (d === ref || !salidas[d] || !salidas[d].ok) continue;
  for (const [arch, que] of [['suma', 'la reducción en árbol (391 bloques)'], ['tras', 'la traspuesta por mosaicos'], ['pref', 'la suma prefija por bloques']]) {
    const A = bytes(`${arch}-${ref}.bin`), B = bytes(`${arch}-${d}.bin`);
    comprobar(`${d} = jit al bit: ${que}`, A && B && A.equals(B));
  }
  comprobar(`${d} = jit: el histograma`, salidas[d].out.split('\n')[0] === salidas[ref].out.split('\n')[0]);
}
// y que los resultados son los buenos (contra JavaScript plano)
{
  const N = 100000, x = Float64Array.from({ length: N }, (_, i) => ((i * 7919) % 1000) / 999.0 - 0.37);
  const A = bytes('tras-jit.bin');
  if (A) {
    const r = new Float64Array(A.buffer.slice(A.byteOffset, A.byteOffset + A.byteLength));
    const F = 45, C = 70; let ok = true;
    for (let i = 0; i < F; i++) for (let j = 0; j < C; j++) if (r[j * F + i] !== ((i * C + j) * 7919 % 1000) / 999.0 - 0.37) ok = false;
    comprobar('la traspuesta es la traspuesta', ok);
  }
  const P = bytes('pref-jit.bin');
  if (P) {
    const y = new Float64Array(P.buffer.slice(P.byteOffset, P.byteOffset + P.byteLength));
    let ok = true;
    for (let b = 0; b < Math.ceil(N / 256) && ok; b++) {
      let s = 0;
      for (let t = 0; t < 256 && b * 256 + t < N; t++) { s += x[b * 256 + t]; if (Math.abs(y[b * 256 + t] - s) > 1e-9) ok = false; }
    }
    comprobar('la suma prefija es la suma prefija (a 1e-9: el árbol suma en otro orden)', ok);
  }
}
// lo que no se puede, dicho al compilar
{
  const errs = [
    ['barrera() en un núcleo de paralelo', CAB + 'fn f(i, x) { barrera()\n x[i] = 1.0 }\nparalelo(4, f, ceros(4))', /«barrera\(\)» solo existe en los núcleos de paraleloBloques/],
    ['compartido dentro de un «si»', CAB + 'fn f(b, t, x) { si t > 0 { fijo s = compartido(4)\n s[0] = 1.0 } }\nparaleloBloques(1, 4, f, ceros(4))', /se declara al principio del núcleo/],
    ['compartido con un tamaño que no es un número escrito', CAB + 'fn f(b, t, x) { fijo s = compartido(hilosPorBloque())\n x[t] = 1.0 }\nparaleloBloques(1, 4, f, ceros(4))', /el tamaño escrito como un entero positivo/],
    ['más de 48 KB de compartida', CAB + 'fn f(b, t, x) { fijo s = compartido(7000)\n x[t] = s[t] }\nparaleloBloques(1, 4, f, ceros(4))', /pasa de 48 KB/],
    ['más de 1024 hilos por bloque', CAB + 'fn f(b, t, x) { x[t] = 1.0 }\nparaleloBloques(1, 2048, f, ceros(4))', /van de 1 a 1024/],
    ['barrera() fuera de un núcleo', CAB + 'barrera()', /solo tiene sentido dentro de un núcleo de paraleloBloques/],
  ];
  for (const [nombre, src, re] of errs) { const r = correr(src, 'jit'); comprobar(`dice que no: ${nombre}`, !r.ok && re.test(r.out), r.out + r.err); }
}
// PTX de verdad
{
  const tieneNvptx = hay('clang++') && /nvptx/.test(spawnSync('clang++', ['-print-targets'], { encoding: 'utf8' }).stdout || '');
  if (!tieneNvptx) { saltadas++; console.log('  (sin clang con nvptx64: no se mira el PTX)'); }
  else {
    const r = correr(CAB + `usar codigoCuda de "nen"
fn sumaBloque(b, t, x, p) {
  fijo s = compartido(256)
  s[t] = x[b * hilosPorBloque() + t]
  barrera()
  si t == 0 { p[b] = s[0] + s[255] }
}
escribirTexto("k.cu", codigoCuda(sumaBloque, ceros(512), ceros(2)))
`, 'jit');
    const fuente = r.ok ? fs.readFileSync(path.join(tmp, 'k.cu'), 'utf8') : '';
    const c = spawnSync('clang++', ['-x', 'cuda', '--cuda-device-only', '--cuda-gpu-arch=sm_75', '-nocudainc', '-nocudalib',
      '-O2', '-ffp-contract=off', '-std=c++17', '-Wno-unknown-cuda-version', '-include', path.join(SIM, 'cuda-clang.h'),
      '-S', path.join(tmp, 'k.cu'), '-o', path.join(tmp, 'k.ptx')], { encoding: 'utf8' });
    comprobar('el núcleo de bloques compila a PTX de sm_75', c.status === 0 && fuente, (c.stderr || 'sin fuente').split('\n').slice(0, 5).join(' · '));
    if (c.status === 0) {
      const ptx = fs.readFileSync(path.join(tmp, 'k.ptx'), 'utf8');
      comprobar('con __syncthreads de verdad (bar.sync) y la compartida en .shared, sin FMA',
        /bar\.sync/.test(ptx) && /\.shared/.test(ptx) && !/\bfma\./.test(ptx), ptx.slice(0, 200));
    }
  }
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas por falta de herramientas` : '') + (envGpu && !GPU_REAL ? ' · GPU simulada' : ''));
process.exit(fallan ? 1 : 0);
