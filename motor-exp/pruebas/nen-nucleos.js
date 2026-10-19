// ============================================================================
//  Los núcleos de NEÑ (tensores y Fourier), compilados en C de verdad.
//
//  Cada núcleo de motor/src/17-nen-tensores.js tiene dos caras: un cuerpo en C
//  que C1EÑ lanza en la GPU (o compila a nativo) y un respaldo en JavaScript.
//  La promesa es que dan LO MISMO. Esta prueba la comprueba sin GPU: envuelve
//  cada cuerpo en
//
//      void k(long long n, …) { for (long long i = 0; i < n; i++) { CUERPO } }
//
//  lo compila con gcc (-ffp-contract=off: sin FMA, que cambia el redondeo de
//  a·b + c y es justo lo que NVCC hace por omisión si no se le pide
//  --fmad=false), lo carga con koffi y compara bit a bit con el respaldo sobre
//  datos al azar con semilla fija.
//
//  Los que llaman a funciones trascendentes (sin, exp, log, pow…) se comparan
//  con unos pocos ulp de tolerancia: glibc y V8 no redondean igual esas
//  funciones y no hay forma de que lo hagan. Todos los demás, bit a bit.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('./../rutas.js');
const { NEN_T_NUCLEOS, NEN_T_ULP } = require(R.src('17-nen-tensores.js'));

const saltar = motivo => { console.log(`  (${motivo})`); console.log('nen-nucleos: saltada entera'); process.exit(0); };
let koffi;
try { koffi = require('koffi'); } catch (_) { saltar('no hay koffi'); }
try { execFileSync('gcc', ['--version'], { stdio: 'ignore' }); } catch (_) { saltar('no hay gcc'); }

// ── el C ─────────────────────────────────────────────────────────────────────
const TIPO_C = { i64: 'long long', f64: 'double', i32: 'int', 'f64*': 'double *', 'i32*': 'int *' };
const TIPO_K = { i64: 'int64_t', f64: 'double', i32: 'int32_t', 'f64*': 'double *', 'i32*': 'int32_t *' };
const PROLOGO = `#include <math.h>
/* Los ayudantes de la interfaz común de C1EÑ: división y resto como Python. */
static long long c1en_div_piso(long long a, long long b) { long long q = a / b; if ((a % b != 0) && ((a < 0) != (b < 0))) q--; return q; }
static long long c1en_mod(long long a, long long b) { long long r = a % b; if (r != 0 && ((r < 0) != (b < 0))) r += b; return r; }
`;
const nombres = Object.keys(NEN_T_NUCLEOS);
let fuente = PROLOGO;
for (const n of nombres) {
  const k = NEN_T_NUCLEOS[n];
  if (k.params[0][0] !== 'n' || k.params[0][1] !== 'i64') throw new Error(`${n}: el primer parámetro tiene que ser n i64`);
  fuente += `void ${n}(${k.params.map(([p, t]) => `${TIPO_C[t]} ${p}`).join(', ')}) {\n` +
    `  for (long long i = 0; i < n; i++) { ${k.cuerpo} }\n}\n`;
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nen-nucleos-'));
const archC = path.join(dir, 'nucleos.c'), archSo = path.join(dir, 'nucleos.so');
fs.writeFileSync(archC, fuente);
try {
  execFileSync('gcc', ['-O2', '-std=c99', '-Wall', '-Werror=implicit-function-declaration', '-ffp-contract=off', '-fno-fast-math',
    '-shared', '-fPIC', '-o', archSo, archC, '-lm'], { stdio: 'pipe' });
} catch (e) {
  console.log('  ✗ los cuerpos en C no compilan');
  console.log(String(e.stderr || e.message).split('\n').slice(0, 30).map(l => '      ' + l).join('\n'));
  process.exit(1);
}
const lib = koffi.load(archSo);

// ── los datos ────────────────────────────────────────────────────────────────
let sem = 12345;
const azar = () => { sem = (sem + 0x6D2B79F5) >>> 0; let t = sem; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const unif = (n, lo, hi) => Float64Array.from({ length: n }, () => lo + (hi - lo) * azar());
// Con casos de borde mezclados: ceros con signo, enteros y medios exactos
// (los que deciden un redondeo), y números muy pequeños.
const conBordes = (x, extra) => { const b = [0, -0, 0.5, -0.5, 1.5, 2.5, -2.5, 1e-300, -1e-12, 3].concat(extra || []); b.forEach((v, i) => { if (i < x.length) x[i] = v; }); return x; };
const bitrev = N => { const b = Math.round(Math.log2(N)), r = new Int32Array(N); for (let i = 0; i < N; i++) { let v = 0; for (let k = 0; k < b; k++) if (i & (1 << k)) v |= 1 << (b - 1 - k); r[i] = v; } return r; };
const tabla = N => { const re = new Float64Array(N / 2), im = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) { re[k] = Math.cos(-2 * Math.PI * k / N); im[k] = Math.sin(-2 * Math.PI * k / N); } return [re, im]; };

const n = 2000;
const unario = (lo, hi, extra) => () => [n, conBordes(unif(n, lo, hi), extra), new Float64Array(n)];
// Una reducción con varios trozos por fila: M = 5 filas de K = 10 000, en
// trozos de 4096 (el último más corto).
const red = (mu) => () => {
  const M = 5, K = 10000, B = 4096, nb = 3;
  const x = conBordes(unif(M * K, -3, 3));
  return mu ? [M * nb, K, B, nb, x, unif(M, -1, 1), new Float64Array(M * nb)] : [M * nb, K, B, nb, x, new Float64Array(M * nb)];
};
const CASOS = {
  nen_seno: [unario(-50, 50)], nen_coseno: [unario(-50, 50)], nen_tangente: [unario(-3, 3)],
  nen_arcotangente: [unario(-1e3, 1e3)],
  nen_senoh: [unario(-0.3, 0.3), unario(-30, 30)], nen_cosenoh: [unario(-30, 30)],
  nen_tangenteh: [unario(-0.3, 0.3), unario(-30, 30, [800, -800])],
  nen_exp: [unario(-700, 700)], nen_log: [() => { const x = unif(n, 1e-6, 1e6); x[0] = 0; x[1] = 1; return [n, x, new Float64Array(n)]; }],
  nen_raiz: [() => [n, unif(n, 0, 1e6), new Float64Array(n)]],
  nen_absoluto: [unario(-10, 10)], nen_signo: [unario(-10, 10, [NaN])], nen_piso: [unario(-1e6, 1e6)], nen_techo: [unario(-1e6, 1e6)],
  nen_sigmoide: [unario(-800, 800)], nen_relu: [unario(-10, 10, [NaN])],
  nen_redondear: [() => [n, 1, conBordes(unif(n, -1e3, 1e3), [0.49999999999999994]), new Float64Array(n)],
    () => [n, 100, unif(n, -10, 10), new Float64Array(n)]],
  nen_potencia: [() => [n, unif(n, 1e-3, 20), unif(n, -8, 8), new Float64Array(n)],
    () => [n, unif(n, -5, 5), Float64Array.from({ length: n }, () => Math.floor(azar() * 9) - 4), new Float64Array(n)]],
  nen_angulo: [() => [n, conBordes(unif(n, -5, 5)), unif(n, -5, 5), new Float64Array(n)]],
  nen_softmax: [() => { const M = 50, K = 37; return [M, K, unif(M * K, -40, 40), new Float64Array(M * K)]; }],
  nen_red_suma: [red()], nen_red_producto: [() => { const M = 5, K = 10000, B = 4096, nb = 3; return [M * nb, K, B, nb, unif(M * K, 0.9999, 1.0001), new Float64Array(M * nb)]; }],
  nen_red_maximo: [red()], nen_red_minimo: [red()], nen_red_suma2: [red()], nen_red_sumaabs: [red()], nen_red_maxabs: [red()],
  nen_red_desv2: [red(true)],
  nen_matmul: [() => { const L = 3, m = 7, K = 13, p = 5; return [L * m * p, m, K, p, unif(L * m * K, -2, 2), unif(L * K * p, -2, 2), new Float64Array(L * m * p)]; }],
  // (motor-exp N2) la CPU (bloques de 4 filas × 32 columnas) y la GPU (4×4 por
  // hilo): m y p que no son múltiplos del bloque, K de más de 256, lotes.
  nen_matmul_bloques: [[3, 7, 13, 5], [2, 9, 300, 19], [1, 4, 257, 8], [1, 1, 1, 1], [2, 5, 40, 70]].map(([L, m, K, p]) => () =>
    [L * Math.ceil(p / 32) * Math.ceil(m / 4), m, K, p, unif(L * m * K, -2, 2), unif(L * K * p, -2, 2), new Float64Array(L * m * p)]),
  nen_matmul_4x4: [[3, 7, 13, 5], [2, 9, 300, 19], [1, 4, 257, 8], [1, 1, 1, 1], [2, 5, 40, 70]].map(([L, m, K, p]) => () =>
    [L * Math.ceil(m / 4) * Math.ceil(p / 4), m, K, p, unif(L * m * K, -2, 2), unif(L * K * p, -2, 2), new Float64Array(L * m * p)]),
  nen_op_aa: [0, 1, 2, 3].map(op => () => { const b = unif(n, -3, 3); if (op === 3) b[5] = 0; return [n, op, unif(n, -3, 3), b, new Float64Array(n), new Int32Array(1)]; }),
  nen_op_ae: [0, 1, 2, 3].flatMap(op => [0, 1].map(rev => () => { const a = unif(n, -3, 3); if (op === 3 && rev) a[7] = 0; return [n, op, rev, 1.7, a, new Float64Array(n), new Int32Array(1)]; })),
  nen_fft_permutar: [() => { const N = 64, F = 3; return [F * N, N, 6, bitrev(N), unif(F * 2 * N, -1, 1), new Float64Array(F * 2 * N)]; }],
  nen_fft_etapa: [1, -1].flatMap(conj => [2, 8, 64].map(largo => () => {
    const N = 64, F = 3, [re, im] = tabla(N);
    return [F * N / 2, N, 6, largo, Math.log2(largo), conj, re, im, unif(F * 2 * N, -1, 1)];
  })),
  nen_cmul_filas: [() => { const N = 16, F = 4; return [F * N, N, unif(F * 2 * N, -3, 3), unif(2 * N, -3, 3)]; }],
  nen_dividir: [() => [n, 7.3, unif(n, -100, 100)]],
  nen_conv2d: [
    () => { const Ma = 9, Na = 11, Mb = 3, Nb = 4; return [11 * 14, Ma, Na, Mb, Nb, 14, 0, 0, unif(Ma * Na, -1, 1), unif(Mb * Nb, -1, 1), new Float64Array(11 * 14)]; },
    () => { const Ma = 9, Na = 11, Mb = 3, Nb = 4; return [Ma * Na, Ma, Na, Mb, Nb, Na, 1, 1, unif(Ma * Na, -1, 1), unif(Mb * Nb, -1, 1), new Float64Array(Ma * Na)]; },
  ],
};

// ── comparar ─────────────────────────────────────────────────────────────────
const copiar = v => (v instanceof Float64Array ? Float64Array.from(v) : v instanceof Int32Array ? Int32Array.from(v) : v);
const bits = x => { const b = new BigInt64Array(1); new Float64Array(b.buffer)[0] = x; return b[0]; };
// La distancia en ulp entre dos reales: con el orden de los enteros que tienen
// los mismos bits, que es monótono en cada signo.
const ulp = (a, b) => {
  if (Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b))) return 0n;
  if (Number.isNaN(a) || Number.isNaN(b)) return 1n << 62n;
  const o = x => { const v = bits(x); return v < 0n ? -(v & 0x7fffffffffffffffn) : v; };
  const d = o(a) - o(b);
  return d < 0n ? -d : d;
};
// 8 ulp con glibc (Linux). En Windows la biblioteca matemática de mingw (la de
// msvcrt) redondea peor: «pow» dio 10 ulp y luego 19 en el PC de Diego (fase W1),
// así que subir el tope a ojo no sirve. En Windows el tope es el que C1EÑ
// promete para las funciones trascendentes: diferencia relativa menor que 1e-14,
// que son 45 ulp (1e-14 / 2⁻⁵²). Si un núcleo pasa de ahí, ya no es redondeo de
// la plataforma: es un fallo y se dice. Los núcleos sin trascendentes siguen
// exigiéndose bit a bit en todas partes.
const MAX_ULP = process.platform === 'win32' ? 45n : 8n;
let exactos = 0, conUlp = 0, fallos = 0, casos = 0;
for (const nombre of nombres) {
  const k = NEN_T_NUCLEOS[nombre];
  const gens = CASOS[nombre];
  if (!gens) { console.log(`  ✗ ${nombre}: no tiene datos de prueba en el arnés`); fallos++; continue; }
  const fn = lib.func(`void ${nombre}(${k.params.map(([p, t]) => `${TIPO_K[t]} ${p}`).join(', ')})`);
  let peor = 0n, mal = null;
  for (const gen of gens) {
    casos++;
    const args = gen();
    if (args.length !== k.params.length) { mal = `el caso tiene ${args.length} argumentos y el núcleo ${k.params.length}`; break; }
    const aJs = args.map(copiar), aC = args.map(copiar);
    k.js(...aJs);
    fn(...aC);
    for (let p = 0; p < args.length; p++) {
      const x = aJs[p], y = aC[p];
      if (!(x instanceof Float64Array) && !(x instanceof Int32Array)) continue;
      for (let i = 0; i < x.length; i++) {
        if (x instanceof Int32Array) { if (x[i] !== y[i]) { mal = `${k.params[p][0]}[${i}]: js ${x[i]} y C ${y[i]}`; break; } continue; }
        const u = ulp(x[i], y[i]);
        if (u > peor) peor = u;
        if (u > 0n && !NEN_T_ULP.has(nombre)) { mal = `${k.params[p][0]}[${i}]: js ${x[i]} y C ${y[i]} (no son el mismo número)`; break; }
        if (u > MAX_ULP) { mal = `${k.params[p][0]}[${i}]: js ${x[i]} y C ${y[i]} difieren ${u} ulp`; break; }
      }
      if (mal) break;
    }
    if (mal) break;
  }
  if (mal) { fallos++; console.log(`  ✗ ${nombre}: ${mal}`); continue; }
  if (peor === 0n) { exactos++; console.log(`  ✓ ${nombre.padEnd(18)} bit a bit`); }
  else { conUlp++; console.log(`  ✓ ${nombre.padEnd(18)} a ${peor} ulp como mucho (usa la biblioteca matemática)`); }
}
// (motor-exp N2) Las tres multiplicaciones de matrices (una celda por hilo, la
// de 4×4 de la GPU y la de bloques de la CPU) tienen que dar EL MISMO número:
// cada celda es la suma de a·b en el orden de k de 0 a K−1 en las tres.
for (const [L, m, K, p] of [[3, 7, 13, 5], [2, 9, 300, 19], [1, 33, 520, 41], [1, 70, 600, 67]]) {
  casos++;
  const A = unif(L * m * K, -2, 2), B = unif(L * K * p, -2, 2);
  const c1 = new Float64Array(L * m * p), c2 = new Float64Array(L * m * p), c3 = new Float64Array(L * m * p);
  NEN_T_NUCLEOS.nen_matmul.js(L * m * p, m, K, p, A, B, c1);
  NEN_T_NUCLEOS.nen_matmul_bloques.js(L * Math.ceil(p / 32) * Math.ceil(m / 4), m, K, p, A, B, c2);
  NEN_T_NUCLEOS.nen_matmul_4x4.js(L * Math.ceil(m / 4) * Math.ceil(p / 4), m, K, p, A, B, c3);
  const i2 = c1.findIndex((x, j) => !Object.is(x, c2[j])), i3 = c1.findIndex((x, j) => !Object.is(x, c3[j]));
  if (i2 >= 0 || i3 >= 0) { fallos++; console.log(`  ✗ los tres productos no dan lo mismo (${L}×${m}×${K}×${p}, celda ${i2 >= 0 ? i2 : i3})`); }
  else console.log(`  ✓ matmul = bloques = 4×4  ${L}×${m}×${K}×${p} bit a bit`);
}
// Primero se suelta la biblioteca: Windows no deja borrar una DLL cargada (la
// prueba terminaba con EPERM al limpiar, fase W1). Y si aun así no se puede
// borrar, es basura en la carpeta temporal, no un fallo de los núcleos.
try { lib.unload(); } catch (_) { /* koffi viejo o ya suelta */ }
try { fs.rmSync(dir, { recursive: true, force: true }); }
catch (e) { console.log(`  · no se pudo borrar ${dir} (${e.code}); bórrala a mano si molesta`); }
console.log(`\n${nombres.length} núcleos compilados con gcc -ffp-contract=off · ${casos} casos · ` +
  `${exactos} iguales bit a bit, ${conUlp} a pocos ulp, ${fallos} fallan`);
process.exit(fallos ? 1 : 0);
