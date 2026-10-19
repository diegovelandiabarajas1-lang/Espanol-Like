// ============================================================================
//  Ñ v4 — NEÑ: tensores, álgebra lineal avanzada y Fourier
//  Parte 17.
//
//  Se importa con:  usar "nen"     (o  usar einstein, fourier2D de "nen")
//
//  AMPLÍA, NO REPITE. «numerico» ya tiene los arreglos, LU, QR, Cholesky, SVD,
//  los valores propios simétricos, «fourier» en una dimensión y la convolución.
//  Lo de aquí es lo que faltaba encima: operar sobre tensores enteros (por eje,
//  con Einstein, contrayendo), el caso GENERAL de los valores propios, las
//  funciones de matrices (exponencial, raíz, logaritmo) y Fourier en dos
//  dimensiones y para señales. Cuando algo ya existe en «numerico» se LLAMA a
//  la nativa de allí (ver «deNumerico»), no se copia: una SVD escrita dos veces
//  son dos SVD que algún día dirán cosas distintas.
//
//  LOS NÚCLEOS. Lo que pesa —elemento a elemento, reducciones, el producto de
//  matrices, las etapas de la FFT, la convolución 2D— se escribe como un núcleo
//  de C1EÑ: un cuerpo en C que corre una vez por índice «i» y un respaldo en
//  JavaScript que hace EXACTAMENTE las mismas cuentas en el mismo orden. Las
//  tablas de senos y cosenos de la FFT se calculan en JavaScript y se le pasan
//  al núcleo, de modo que la FFT en GPU no usa ni una función trascendente y da
//  el mismo número, bit a bit, que en CPU. Los únicos núcleos que pueden
//  diferir en la última cifra son los que llaman a sin, exp, log, pow… porque
//  cada biblioteca matemática las redondea a su manera (ver NEN_T_ULP).
//
//  El umbral: por debajo de NEN_T_UMBRAL números se corre el respaldo de
//  JavaScript directamente —mandar 100 números a la GPU cuesta más que
//  sumarlos—; por encima se pasa por «vm.c1en.kernel» si C1EÑ está instalado.
//  Como el respaldo y el núcleo son la misma cuenta, el resultado no depende
//  del camino.
// ============================================================================
'use strict';

// A partir de cuántos números (o de cuánto trabajo) un núcleo se manda a C1EÑ.
// 2¹⁵: con menos, copiar a la GPU y volver tarda más que hacerlo aquí.
const NEN_T_UMBRAL = 1 << 15;
// Cada trozo de una reducción larga. La suma por trozos fija el ORDEN de las
// sumas según el largo y no según el dispositivo (así GPU y CPU coinciden), y
// de paso suma con menos error que de un tirón: 4096 números de cada vez.
const NEN_T_TROZO = 4096;

// Los núcleos que usan funciones de la biblioteca matemática de C. Ahí la GPU,
// glibc y V8 pueden diferir en el último bit; el arnés de pruebas los compara
// con tolerancia de unos pocos ulp y todos los demás bit a bit.
const NEN_T_ULP = new Set(['nen_seno', 'nen_coseno', 'nen_tangente', 'nen_arcotangente', 'nen_angulo',
  'nen_senoh', 'nen_cosenoh', 'nen_tangenteh', 'nen_exp', 'nen_log', 'nen_potencia', 'nen_sigmoide',
  'nen_softmax']);

// ── los núcleos ─────────────────────────────────────────────────────────────
// Un núcleo de una entrada y una salida, elemento a elemento. El cuerpo en C y
// la función de JavaScript son la misma expresión escrita dos veces.
function nenUnario(nombre, cuerpo, f) {
  return {
    nombre,
    params: [['n', 'i64'], ['x', 'f64*'], ['y', 'f64*']],
    cuerpo,
    js: (n, x, y) => { for (let i = 0; i < n; i++) y[i] = f(x[i]); },
  };
}
// El seno hiperbólico, sin «sinh» de C (la interfaz común no la garantiza):
// cerca de 0, (eˣ − e⁻ˣ)/2 resta dos números casi iguales y pierde todas las
// cifras, así que ahí va la serie de Taylor hasta x¹³ (el término siguiente
// pesa 10⁻²¹ con |x| < 0.25); lejos de 0, la fórmula con la exponencial.
const NEN_T_SENOH_C =
  'double v = x[i]; double a = fabs(v); double r; ' +
  'if (a < 0.25) { double v2 = v * v; r = v * (1.0 + v2 / 6.0 * (1.0 + v2 / 20.0 * (1.0 + v2 / 42.0 * (1.0 + v2 / 72.0 * (1.0 + v2 / 110.0 * (1.0 + v2 / 156.0)))))); } ' +
  'else { double e = exp(a); r = 0.5 * (e - 1.0 / e); if (v < 0.0) r = -r; } y[i] = r;';
function nenSenoh(v) {
  const a = Math.abs(v);
  let r;
  if (a < 0.25) { const v2 = v * v; r = v * (1.0 + v2 / 6.0 * (1.0 + v2 / 20.0 * (1.0 + v2 / 42.0 * (1.0 + v2 / 72.0 * (1.0 + v2 / 110.0 * (1.0 + v2 / 156.0)))))); }
  else { const e = Math.exp(a); r = 0.5 * (e - 1.0 / e); if (v < 0.0) r = -r; }
  return r;
}
// La tangente hiperbólica: con |x| grande, (1 − e^{−2|x|})/(1 + e^{−2|x|}) no
// se desborda nunca (e^{−2|x|} va a 0 y queda ±1); cerca de 0, seno entre
// coseno con la serie de arriba.
const NEN_T_TANH_C =
  'double v = x[i]; double a = fabs(v); double r; ' +
  'if (a < 0.25) { double a2 = a * a; double s = a * (1.0 + a2 / 6.0 * (1.0 + a2 / 20.0 * (1.0 + a2 / 42.0 * (1.0 + a2 / 72.0 * (1.0 + a2 / 110.0 * (1.0 + a2 / 156.0)))))); r = s / sqrt(1.0 + s * s); } ' +
  'else { double t = exp(-2.0 * a); r = (1.0 - t) / (1.0 + t); } ' +
  'if (v < 0.0) r = -r; y[i] = r;';
function nenTanh(v) {
  const a = Math.abs(v);
  let r;
  if (a < 0.25) { const a2 = a * a; const s = a * (1.0 + a2 / 6.0 * (1.0 + a2 / 20.0 * (1.0 + a2 / 42.0 * (1.0 + a2 / 72.0 * (1.0 + a2 / 110.0 * (1.0 + a2 / 156.0)))))); r = s / Math.sqrt(1.0 + s * s); }
  else { const t = Math.exp(-2.0 * a); r = (1.0 - t) / (1.0 + t); }
  if (v < 0.0) r = -r;
  return r;
}

// Las reducciones por trozos. Cada hilo «i» reduce un trozo de una fila:
// fila = i / nb, trozo = i % nb, y el trozo va de t·B a min(t·B + B, K). Con
// nb = 1 y B = K es la reducción de toda la fila de una vez.
function nenReduccion(nombre, inicio, paso, pasoJs, conMu) {
  const params = [['n', 'i64'], ['K', 'i64'], ['B', 'i64'], ['nb', 'i64'], ['x', 'f64*']];
  if (conMu) params.push(['mu', 'f64*']);
  params.push(['y', 'f64*']);
  const cab = 'long long f = i / nb; long long t = i % nb; long long ini = t * B; long long fin = ini + B; ' +
    'if (fin > K) fin = K; ';
  const cuerpo = cab + `double s = ${inicio}; ` +
    `for (long long k = ${inicio === 'x[f * K + ini]' ? 'ini + 1' : 'ini'}; k < fin; k++) { double v = x[f * K + k]; ${paso} } y[i] = s;`;
  const desdeElPrimero = inicio === 'x[f * K + ini]';
  const js = conMu
    ? (n, K, B, nb, x, mu, y) => {
      for (let i = 0; i < n; i++) {
        const f = Math.floor(i / nb), t = i % nb, ini = t * B;
        let fin = ini + B; if (fin > K) fin = K;
        let s = 0.0;
        for (let k = ini; k < fin; k++) s = pasoJs(s, x[f * K + k], mu[f]);
        y[i] = s;
      }
    }
    : (n, K, B, nb, x, y) => {
      for (let i = 0; i < n; i++) {
        const f = Math.floor(i / nb), t = i % nb, ini = t * B;
        let fin = ini + B; if (fin > K) fin = K;
        let s = desdeElPrimero ? x[f * K + ini] : +inicio;
        for (let k = desdeElPrimero ? ini + 1 : ini; k < fin; k++) s = pasoJs(s, x[f * K + k]);
        y[i] = s;
      }
    };
  return { nombre, params, cuerpo, js };
}

const NEN_T_NUCLEOS = {};
for (const k of [
  nenUnario('nen_seno', 'y[i] = sin(x[i]);', Math.sin),
  nenUnario('nen_coseno', 'y[i] = cos(x[i]);', Math.cos),
  nenUnario('nen_tangente', 'y[i] = tan(x[i]);', Math.tan),
  // atan2(x, 1) y no «atan»: es la que está en la lista común de C1EÑ.
  nenUnario('nen_arcotangente', 'y[i] = atan2(x[i], 1.0);', v => Math.atan2(v, 1.0)),
  nenUnario('nen_senoh', NEN_T_SENOH_C, nenSenoh),
  nenUnario('nen_cosenoh', 'double e = exp(fabs(x[i])); y[i] = 0.5 * (e + 1.0 / e);',
    v => { const e = Math.exp(Math.abs(v)); return 0.5 * (e + 1.0 / e); }),
  nenUnario('nen_tangenteh', NEN_T_TANH_C, nenTanh),
  nenUnario('nen_exp', 'y[i] = exp(x[i]);', Math.exp),
  nenUnario('nen_log', 'y[i] = log(x[i]);', Math.log),
  nenUnario('nen_raiz', 'y[i] = sqrt(x[i]);', Math.sqrt),
  nenUnario('nen_absoluto', 'y[i] = fabs(x[i]);', Math.abs),
  // El signo deja pasar el cero con su signo y el NaN: v > 0 y v < 0 son
  // falsos para los dos, y entonces se devuelve v tal cual.
  nenUnario('nen_signo', 'double v = x[i]; y[i] = v > 0.0 ? 1.0 : (v < 0.0 ? -1.0 : v);',
    v => (v > 0.0 ? 1.0 : (v < 0.0 ? -1.0 : v))),
  nenUnario('nen_piso', 'y[i] = floor(x[i]);', Math.floor),
  nenUnario('nen_techo', 'y[i] = ceil(x[i]);', Math.ceil),
  // La sigmoide por dos caminos según el signo: 1/(1+e⁻ˣ) con x muy negativo
  // calcula e^{+grande}, que se desborda; eˣ/(1+eˣ) ahí no.
  nenUnario('nen_sigmoide', 'double v = x[i]; if (v >= 0.0) { y[i] = 1.0 / (1.0 + exp(-v)); } else { double e = exp(v); y[i] = e / (1.0 + e); }',
    v => { if (v >= 0.0) return 1.0 / (1.0 + Math.exp(-v)); const e = Math.exp(v); return e / (1.0 + e); }),
  // ReLU que conserva el NaN: un hueco sigue siendo un hueco.
  nenUnario('nen_relu', 'double v = x[i]; y[i] = v > 0.0 ? v : (v == v ? 0.0 : v);',
    v => (v > 0.0 ? v : (v === v ? 0.0 : v))),
  {
    // Redondeo «a la mitad hacia arriba», el mismo de Math.round: floor más
    // mirar el resto. «floor(v + 0.5)» falla con 0.49999999999999994, que al
    // sumarle 0.5 ya redondea a 1. v − floor(v) es exacto, así que esto no.
    nombre: 'nen_redondear',
    params: [['n', 'i64'], ['f', 'f64'], ['x', 'f64*'], ['y', 'f64*']],
    cuerpo: 'double v = x[i] * f; double r = floor(v); if (v - r >= 0.5) r = r + 1.0; y[i] = r / f;',
    js: (n, f, x, y) => { for (let i = 0; i < n; i++) { const v = x[i] * f; let r = Math.floor(v); if (v - r >= 0.5) r = r + 1.0; y[i] = r / f; } },
  },
  {
    nombre: 'nen_potencia',
    params: [['n', 'i64'], ['x', 'f64*'], ['p', 'f64*'], ['y', 'f64*']],
    cuerpo: 'y[i] = pow(x[i], p[i]);',
    js: (n, x, p, y) => { for (let i = 0; i < n; i++) y[i] = Math.pow(x[i], p[i]); },
  },
  {
    nombre: 'nen_angulo',
    params: [['n', 'i64'], ['a', 'f64*'], ['b', 'f64*'], ['y', 'f64*']],
    cuerpo: 'y[i] = atan2(a[i], b[i]);',
    js: (n, a, b, y) => { for (let i = 0; i < n; i++) y[i] = Math.atan2(a[i], b[i]); },
  },
  {
    // Softmax de una fila por hilo: el máximo primero, para que exp no se
    // desborde (exp(1000) es infinito y exp(1000 − 1000) es 1), y la suma en
    // orden fijo.
    nombre: 'nen_softmax',
    params: [['n', 'i64'], ['K', 'i64'], ['x', 'f64*'], ['y', 'f64*']],
    cuerpo: 'long long o = i * K; double m = x[o]; for (long long k = 1; k < K; k++) { if (x[o + k] > m) m = x[o + k]; } ' +
      'double s = 0.0; for (long long k = 0; k < K; k++) { double e = exp(x[o + k] - m); y[o + k] = e; s += e; } ' +
      'for (long long k = 0; k < K; k++) y[o + k] = y[o + k] / s;',
    js: (n, K, x, y) => {
      for (let i = 0; i < n; i++) {
        const o = i * K;
        let m = x[o];
        for (let k = 1; k < K; k++) if (x[o + k] > m) m = x[o + k];
        let s = 0.0;
        for (let k = 0; k < K; k++) { const e = Math.exp(x[o + k] - m); y[o + k] = e; s += e; }
        for (let k = 0; k < K; k++) y[o + k] = y[o + k] / s;
      }
    },
  },
  nenReduccion('nen_red_suma', '0.0', 's += v;', (s, v) => s + v),
  nenReduccion('nen_red_producto', '1.0', 's *= v;', (s, v) => s * v),
  // El máximo y el mínimo arrastran el NaN: si hay un hueco, el resultado lo
  // es, como en «+». Esconderlo daría un máximo que no lo es.
  nenReduccion('nen_red_maximo', 'x[f * K + ini]', 'if (v > s || v != v) s = v;', (s, v) => ((v > s || v !== v) ? v : s)),
  nenReduccion('nen_red_minimo', 'x[f * K + ini]', 'if (v < s || v != v) s = v;', (s, v) => ((v < s || v !== v) ? v : s)),
  nenReduccion('nen_red_suma2', '0.0', 's += v * v;', (s, v) => s + v * v),
  nenReduccion('nen_red_sumaabs', '0.0', 's += fabs(v);', (s, v) => s + Math.abs(v)),
  nenReduccion('nen_red_maxabs', '0.0', 'double a = fabs(v); if (a > s || a != a) s = a;',
    (s, v) => { const a = Math.abs(v); return (a > s || a !== a) ? a : s; }),
  {
    // La suma de las desviaciones al cuadrado respecto a la media de su fila.
    // Es la segunda pasada de la varianza: restar la media antes de elevar es
    // lo que evita la cancelación de la fórmula Σx² − n·m².
    nombre: 'nen_red_desv2',
    params: [['n', 'i64'], ['K', 'i64'], ['B', 'i64'], ['nb', 'i64'], ['x', 'f64*'], ['mu', 'f64*'], ['y', 'f64*']],
    cuerpo: 'long long f = i / nb; long long t = i % nb; long long ini = t * B; long long fin = ini + B; ' +
      'if (fin > K) fin = K; double m = mu[f]; double s = 0.0; ' +
      'for (long long k = ini; k < fin; k++) { double d = x[f * K + k] - m; s += d * d; } y[i] = s;',
    js: (n, K, B, nb, x, mu, y) => {
      for (let i = 0; i < n; i++) {
        const f = Math.floor(i / nb), t = i % nb, ini = t * B;
        let fin = ini + B; if (fin > K) fin = K;
        const m = mu[f];
        let s = 0.0;
        for (let k = ini; k < fin; k++) { const d = x[f * K + k] - m; s += d * d; }
        y[i] = s;
      }
    },
  },
  {
    // El producto de matrices, por lotes: un hilo por número de la salida,
    // i = lote·m·p + fila·p + columna, y la suma en el orden de k de siempre.
    // No es el algoritmo más rápido de GPU (sin memoria compartida), pero da
    // EXACTAMENTE lo mismo que la CPU, que aquí pesa más.
    nombre: 'nen_matmul',
    // (motor-exp N1) ver «nen_matmul_filas» para la CPU
    params: [['n', 'i64'], ['m', 'i64'], ['K', 'i64'], ['p', 'i64'], ['a', 'f64*'], ['b', 'f64*'], ['c', 'f64*']],
    cuerpo: 'long long mp = m * p; long long l = i / mp; long long r = i % mp; long long f = r / p; long long col = r % p; ' +
      'long long oa = l * m * K + f * K; long long ob = l * K * p + col; double s = 0.0; ' +
      'for (long long k = 0; k < K; k++) s += a[oa + k] * b[ob + k * p]; c[i] = s;',
    js: (n, m, K, p, a, b, c) => {
      const mp = m * p;
      for (let i = 0; i < n; i++) {
        const l = Math.floor(i / mp), r = i % mp, f = Math.floor(r / p), col = r % p;
        const oa = l * m * K + f * K, ob = l * K * p + col;
        let s = 0.0;
        for (let k = 0; k < K; k++) s += a[oa + k] * b[ob + k * p];
        c[i] = s;
      }
    },
  },
  {
    // (motor-exp N1) El mismo producto para la CPU, con un micronúcleo de 4×8:
    // el hilo i hace un grupo de 4 filas de UN lote, y va por trozos de 256 en k
    // y de 8 en j guardando las 32 sumas en variables (registros) en vez de leer
    // y escribir c en cada paso. Cada casilla se sigue sumando en el mismo orden
    // que en nen_matmul (k de 0 a K−1, empezando en 0): el resultado es idéntico
    // al bit. n = lotes × ⌈m/4⌉.
    nombre: 'nen_matmul_filas',
    params: [['n', 'i64'], ['m', 'i64'], ['K', 'i64'], ['p', 'i64'], ['a', 'f64*'], ['b', 'f64*'], ['c', 'f64*']],
    cuerpo:
      'long long gpl = (m + 3) / 4; long long l = i / gpl; long long r0 = l * m + (i % gpl) * 4; long long r1 = r0 + 4; ' +
      'if (r1 > l * m + m) r1 = l * m + m; const double * bl = b + l * K * p; ' +
      'for (long long r = r0; r < r1; r++) for (long long j = 0; j < p; j++) c[r * p + j] = 0.0; ' +
      'for (long long kb = 0; kb < K; kb += 256) { long long ke = kb + 256; if (ke > K) ke = K; ' +
      '  long long jb = 0; ' +
      '  if (r1 - r0 == 4) { const double * A0 = a + r0 * K; const double * A1 = A0 + K; const double * A2 = A1 + K; const double * A3 = A2 + K; ' +
      '    for (; jb + 8 <= p; jb += 8) { double s0[8], s1[8], s2[8], s3[8]; ' +
      '      for (int q = 0; q < 8; q++) { s0[q] = c[r0 * p + jb + q]; s1[q] = c[(r0 + 1) * p + jb + q]; s2[q] = c[(r0 + 2) * p + jb + q]; s3[q] = c[(r0 + 3) * p + jb + q]; } ' +
      '      for (long long k = kb; k < ke; k++) { const double * bk = bl + k * p + jb; double x0 = A0[k], x1 = A1[k], x2 = A2[k], x3 = A3[k]; ' +
      '        for (int q = 0; q < 8; q++) { double bv = bk[q]; s0[q] = s0[q] + x0 * bv; s1[q] = s1[q] + x1 * bv; s2[q] = s2[q] + x2 * bv; s3[q] = s3[q] + x3 * bv; } } ' +
      '      for (int q = 0; q < 8; q++) { c[r0 * p + jb + q] = s0[q]; c[(r0 + 1) * p + jb + q] = s1[q]; c[(r0 + 2) * p + jb + q] = s2[q]; c[(r0 + 3) * p + jb + q] = s3[q]; } } } ' +
      '  for (long long r = r0; r < r1; r++) { const double * ar = a + r * K; for (long long k = kb; k < ke; k++) { double aik = ar[k]; const double * bk = bl + k * p; ' +
      '    for (long long j = jb; j < p; j++) c[r * p + j] = c[r * p + j] + aik * bk[j]; } } ' +
      '}',
    js: (n, m, K, p, a, b, c) => {
      const s0 = new Float64Array(8), s1 = new Float64Array(8), s2 = new Float64Array(8), s3 = new Float64Array(8);
      const gpl = Math.floor((m + 3) / 4);
      for (let i = 0; i < n; i++) {
        const l = Math.floor(i / gpl), r0 = l * m + (i % gpl) * 4, r1 = Math.min(r0 + 4, l * m + m), bl = l * K * p;
        for (let r = r0; r < r1; r++) for (let j = 0; j < p; j++) c[r * p + j] = 0.0;
        for (let kb = 0; kb < K; kb += 256) {
          const ke = Math.min(kb + 256, K);
          let jb = 0;
          if (r1 - r0 === 4) {
            const A0 = r0 * K, A1 = A0 + K, A2 = A1 + K, A3 = A2 + K;
            for (; jb + 8 <= p; jb += 8) {
              for (let q = 0; q < 8; q++) { s0[q] = c[r0 * p + jb + q]; s1[q] = c[(r0 + 1) * p + jb + q]; s2[q] = c[(r0 + 2) * p + jb + q]; s3[q] = c[(r0 + 3) * p + jb + q]; }
              for (let k = kb; k < ke; k++) {
                const bk = bl + k * p + jb, x0 = a[A0 + k], x1 = a[A1 + k], x2 = a[A2 + k], x3 = a[A3 + k];
                for (let q = 0; q < 8; q++) { const bv = b[bk + q]; s0[q] = s0[q] + x0 * bv; s1[q] = s1[q] + x1 * bv; s2[q] = s2[q] + x2 * bv; s3[q] = s3[q] + x3 * bv; }
              }
              for (let q = 0; q < 8; q++) { c[r0 * p + jb + q] = s0[q]; c[(r0 + 1) * p + jb + q] = s1[q]; c[(r0 + 2) * p + jb + q] = s2[q]; c[(r0 + 3) * p + jb + q] = s3[q]; }
            }
          }
          for (let r = r0; r < r1; r++) {
            const ar = r * K;
            for (let k = kb; k < ke; k++) {
              const aik = a[ar + k], bk = bl + k * p;
              for (let j = jb; j < p; j++) c[r * p + j] = c[r * p + j] + aik * b[bk + j];
            }
          }
        }
      }
    },
  },
  {
    // FFT, pasada 1: la permutación por inversión de bits, fuera de sitio
    // (en el sitio, dos hilos se pisarían al intercambiar). Por filas: la
    // misma pasada transforma todas las filas de una matriz a la vez.
    nombre: 'nen_fft_permutar',
    params: [['n', 'i64'], ['N', 'i64'], ['rev', 'i32*'], ['x', 'f64*'], ['y', 'f64*']],
    cuerpo: 'long long f = i / N; long long j = i % N; long long o = f * 2 * N; long long d = o + 2 * (long long)rev[j]; ' +
      'y[d] = x[o + 2 * j]; y[d + 1] = x[o + 2 * j + 1];',
    js: (n, N, rev, x, y) => {
      for (let i = 0; i < n; i++) {
        const f = Math.floor(i / N), j = i % N, o = f * 2 * N, d = o + 2 * rev[j];
        y[d] = x[o + 2 * j]; y[d + 1] = x[o + 2 * j + 1];
      }
    },
  },
  {
    // FFT, pasadas 2…log₂(N)+1: una etapa de mariposas de Cooley-Tukey. Un
    // hilo por mariposa (N/2 por fila). Las raíces de la unidad llegan en una
    // tabla calculada en JavaScript con coseno y seno de verdad —la misma que
    // usa «fourier» de numerico—, y «conj» vale +1 o −1 (la directa o la
    // inversa): multiplicar por ±1 es exacto, así que no hay trascendentes en
    // la GPU y el resultado es el de la CPU bit a bit.
    nombre: 'nen_fft_etapa',
    params: [['n', 'i64'], ['N', 'i64'], ['largo', 'i64'], ['conj', 'f64'], ['twr', 'f64*'], ['twi', 'f64*'], ['d', 'f64*']],
    cuerpo: 'long long h = N / 2; long long f = i / h; long long j = i % h; long long mitad = largo / 2; ' +
      'long long g = j / mitad; long long k = j % mitad; long long o = f * 2 * N; ' +
      'long long p = g * largo + k; long long q = p + mitad; long long w = k * (N / largo); ' +
      'double wr = twr[w]; double wi = conj * twi[w]; double qr = d[o + 2 * q]; double qi = d[o + 2 * q + 1]; ' +
      'double vr = qr * wr - qi * wi; double vi = qr * wi + qi * wr; double ur = d[o + 2 * p]; double ui = d[o + 2 * p + 1]; ' +
      'd[o + 2 * p] = ur + vr; d[o + 2 * p + 1] = ui + vi; d[o + 2 * q] = ur - vr; d[o + 2 * q + 1] = ui - vi;',
    js: (n, N, largo, conj, twr, twi, d) => {
      const h = N / 2, mitad = largo / 2, salto = N / largo;
      for (let i = 0; i < n; i++) {
        const f = Math.floor(i / h), j = i % h, g = Math.floor(j / mitad), k = j % mitad, o = f * 2 * N;
        const p = g * largo + k, q = p + mitad, w = k * salto;
        const wr = twr[w], wi = conj * twi[w];
        const qr = d[o + 2 * q], qi = d[o + 2 * q + 1];
        const vr = qr * wr - qi * wi, vi = qr * wi + qi * wr;
        const ur = d[o + 2 * p], ui = d[o + 2 * p + 1];
        d[o + 2 * p] = ur + vr; d[o + 2 * p + 1] = ui + vi;
        d[o + 2 * q] = ur - vr; d[o + 2 * q + 1] = ui - vi;
      }
    },
  },
  {
    // Multiplicar cada fila compleja por la misma fila «b» (Bluestein, filtros).
    nombre: 'nen_cmul_filas',
    params: [['n', 'i64'], ['N', 'i64'], ['a', 'f64*'], ['b', 'f64*']],
    cuerpo: 'long long j = i % N; double ar = a[2 * i]; double ai = a[2 * i + 1]; double br = b[2 * j]; double bi = b[2 * j + 1]; ' +
      'a[2 * i] = ar * br - ai * bi; a[2 * i + 1] = ar * bi + ai * br;',
    js: (n, N, a, b) => {
      for (let i = 0; i < n; i++) {
        const j = i % N, ar = a[2 * i], ai = a[2 * i + 1], br = b[2 * j], bi = b[2 * j + 1];
        a[2 * i] = ar * br - ai * bi; a[2 * i + 1] = ar * bi + ai * br;
      }
    },
  },
  {
    nombre: 'nen_dividir',
    params: [['n', 'i64'], ['s', 'f64'], ['d', 'f64*']],
    cuerpo: 'd[i] = d[i] / s;',
    js: (n, s, d) => { for (let i = 0; i < n; i++) d[i] = d[i] / s; },
  },
  {
    // Convolución 2D directa, un hilo por número de la salida. «oM, oN» es
    // dónde empieza la salida pedida dentro de la convolución completa: así
    // los tres modos («completa», «misma», «valida») son el mismo núcleo.
    nombre: 'nen_conv2d',
    params: [['n', 'i64'], ['Ma', 'i64'], ['Na', 'i64'], ['Mb', 'i64'], ['Nb', 'i64'], ['No', 'i64'], ['oM', 'i64'], ['oN', 'i64'],
      ['a', 'f64*'], ['b', 'f64*'], ['y', 'f64*']],
    cuerpo: 'long long fi = i / No + oM; long long fj = i % No + oN; double s = 0.0; ' +
      'for (long long p = 0; p < Mb; p++) { long long ai = fi - p; if (ai < 0 || ai >= Ma) continue; ' +
      'for (long long q = 0; q < Nb; q++) { long long aj = fj - q; if (aj < 0 || aj >= Na) continue; ' +
      's += a[ai * Na + aj] * b[p * Nb + q]; } } y[i] = s;',
    js: (n, Ma, Na, Mb, Nb, No, oM, oN, a, b, y) => {
      for (let i = 0; i < n; i++) {
        const fi = Math.floor(i / No) + oM, fj = i % No + oN;
        let s = 0.0;
        for (let p = 0; p < Mb; p++) {
          const ai = fi - p;
          if (ai < 0 || ai >= Ma) continue;
          for (let q = 0; q < Nb; q++) {
            const aj = fj - q;
            if (aj < 0 || aj >= Na) continue;
            s += a[ai * Na + aj] * b[p * Nb + q];
          }
        }
        y[i] = s;
      }
    },
  },
]) NEN_T_NUCLEOS[k.nombre] = k;

// ============================================================================
function instalarNenTensores(vm, def) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const EPS = 2.220446049250313e-16;

  // ── lanzar un núcleo ──────────────────────────────────────────────────────
  // Grande y con C1EÑ: por el motor (que decide jit, nativo o GPU). Si no, el
  // respaldo directamente. Los Float64Array internos se envuelven en un
  // ObjArreglo sin registrar: son temporales y nadie más los ve.
  const cacheNucleos = new Map();
  const envolver = a => (a instanceof Float64Array ? new ObjArreglo(a, [a.length], 'real')
    : a instanceof Int32Array ? new ObjArreglo(a, [a.length], 'entero') : a);
  function correr(nombre, trabajo, ...args) {
    const spec = NEN_T_NUCLEOS[nombre];
    vm.cobrar(trabajo);
    if (trabajo >= NEN_T_UMBRAL && vm.c1en && typeof vm.c1en.kernel === 'function') {
      let k = cacheNucleos.get(nombre);
      if (!k) { k = vm.c1en.kernel(spec); cacheNucleos.set(nombre, k); }
      return k(...args.map(envolver));
    }
    return spec.js(...args);
  }

  // ── llamar a lo que ya existe en «numerico» ───────────────────────────────
  function deNumerico(nombre, args) {
    const g = vm.globals.get(nombreGlobalModulo(claveEdsl('numerico'), nombre));
    if (!g) vm.error(`NEÑ necesita «${nombre}» de numerico y no está instalado`);
    return g.fn(args, vm);
  }

  // ── entrar: arreglos, listas y números ────────────────────────────────────
  function aArr(v, n, f) {
    if (v instanceof ObjArreglo) return v;
    if (v instanceof ObjLista) return deNumerico('arreglo', [v]);
    return vm.error(`«${f}»: el argumento ${n} debe ser un arreglo (o una lista de números) y es ${tipoDe(v)}`);
  }
  const real = (v, n, f) => { const x = aArr(v, n, f); vm.nadaDeComplejos(x, f); return x; };
  const esC = x => x instanceof ObjArreglo && x.tipo === 'complejo';
  const iguales = (p, q) => p.length === q.length && p.every((v, i) => v === q[i]);

  // Los números de un arreglo, en orden lógico y en un Float64Array seguido
  // (de 2n si es complejo). Recorre por zancadas con un odómetro y no con el
  // generador «posiciones», que es diez veces más lento en arreglos grandes.
  function planoDe(x) {
    const n = x.tamano, w = x.tipo === 'complejo' ? 2 : 1, out = new Float64Array(n * w);
    vm.cobrar(n);
    if (n === 0) return out;
    if (x.seguida) { out.set(x.datos.subarray(0, n * w)); return out; }
    const nd = x.forma.length, ix = new Array(nd).fill(0), f = x.forma, z = x.zancadas, d = x.datos;
    let p = x.desp;
    for (let k = 0; k < n; k++) {
      if (w === 1) out[k] = d[p]; else { out[2 * k] = d[2 * p]; out[2 * k + 1] = d[2 * p + 1]; }
      for (let q = nd - 1; q >= 0; q--) {
        if (++ix[q] < f[q]) { p += z[q]; break; }
        p -= (f[q] - 1) * z[q]; ix[q] = 0;
      }
    }
    return out;
  }
  // Una vista temporal (sin registrar) con otra forma y otras zancadas.
  const vistaT = (x, forma, zancadas, desp) => new ObjArreglo(x.datos, forma, x.tipo, zancadas, desp, x.base || x);
  const permutadaT = (x, perm) => vistaT(x, perm.map(e => x.forma[e]), perm.map(e => x.zancadas[e]), x.desp);
  const difundidaT = (x, f) => vistaT(x, f.slice(), zancadasDifundidas(x, f), x.desp);
  // Y de vuelta a arreglos de Ñ.
  const deReales = (forma, d) => { const o = vm.arrNuevo(forma, 'real'); o.datos.set(d.subarray(0, o.tamano)); return o; };
  const deComplejos = (forma, d) => vm.arrDesdePlanosC(d, forma);
  const mat2 = (v, n, f) => {
    const x = real(v, n, f);
    if (x.dimensiones !== 2) vm.error(`«${f}»: se esperaba una matriz (2 dimensiones) y llegó un arreglo de ${x.dimensiones}`,
      x.dimensiones === 1 ? 'pásalo a matriz con expandir(v, 0) o expandir(v, 1)' : null);
    return x;
  };
  const cuadrada = (v, n, f) => {
    const x = mat2(v, n, f);
    if (x.forma[0] !== x.forma[1]) vm.error(`«${f}» necesita una matriz cuadrada y llegó una de ${x.forma.join('×')}`);
    return x;
  };
  const vector = (v, n, f) => {
    const x = aArr(v, n, f);
    if (x.dimensiones !== 1) vm.error(`«${f}»: el argumento ${n} debe ser un vector (1 dimensión) y tiene ${x.dimensiones}`,
      'aplánalo con aplanarA o saca una fila con fila(a, i)');
    return x;
  };
  const textoDe = (v, n, f) => vm.exigeTexto(v, n, f);
  const listaEnteros = (v, n, f) => {
    if (typeof v === 'number') return [Math.trunc(v)];
    return vm.exigeLista(v, n, f).items.map((x, i) => {
      if (typeof x !== 'number' || !Number.isInteger(x)) vm.error(`«${f}»: el elemento ${i} del argumento ${n} debe ser un entero y es ${repr(x, 1)}`);
      return x;
    });
  };

  // ── el producto de matrices, por el núcleo ────────────────────────────────
  // (lotes × m × K) · (lotes × K × p) → (lotes × m × p), todo plano.
  // (motor-exp N1) En la GPU, un hilo por casilla (nen_matmul: las lecturas de
  // b van seguidas entre hilos vecinos). En la CPU, un hilo por FILA con el
  // orden i-k-j (nen_matmul_filas), que recorre b y c de seguido y no a saltos
  // de p: 300×300 bajó de 51 a unos pocos ms. Las dos suman cada casilla en el
  // mismo orden (k de 0 a K−1, empezando en 0), así que dan los mismos bits.
  function mm(a, b, m, K, p, lotes) {
    lotes = lotes || 1;
    const c = new Float64Array(lotes * m * p);
    const trabajo = lotes * m * K * p;
    const enGpu = trabajo >= NEN_T_UMBRAL && vm.c1en && typeof vm.c1en.describir === 'function' && /^gpu/.test(vm.c1en.describir());
    if (enGpu) correr('nen_matmul', trabajo, lotes * m * p, m, K, p, a, b, c);
    else correr('nen_matmul_filas', trabajo, lotes * Math.ceil(m / 4), m, K, p, a, b, c);
    return c;
  }
  // numerico (por, multMatriz) multiplica con esto mismo
  vm.nenMatmul = (a, b, m, K, p) => mm(a, b, m, K, p, 1);
  const identidadP = n => { const I = new Float64Array(n * n); for (let i = 0; i < n; i++) I[i * n + i] = 1; return I; };
  const norma1 = (A, n) => { let mx = 0; for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(A[i * n + j]); if (s > mx) mx = s; } return mx; };
  const normaF = A => { let s = 0; for (let i = 0; i < A.length; i++) s += A[i] * A[i]; return Math.sqrt(s); };
  // Resolver A·X = B (B de n×m) con la LU de numerico, sin copiarla.
  const resolverP = (A, B, n, m) => {
    const r = deNumerico('resolverA', [deReales([n, n], A), deReales([n, m], B)]);
    return r.datos;
  };
  // La inversa por la LU de numerico. Si sale singular, el error se dice en
  // nombre de quien la pidió: «inversaA» no le suena a quien llamó a raizMatriz.
  const inversaP = (A, n, quien) => {
    try { return deNumerico('inversaA', [deReales([n, n], A)]).datos; }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion && !e.fatal && /singular/.test(e.message))
        vm.error(`«${quien}»: por el camino salió una matriz singular`, 'la matriz tiene un valor propio en 0, o está demasiado mal condicionada');
      throw e;
    }
  };

  // ── Fourier por núcleos ───────────────────────────────────────────────────
  // Las tablas: las mismas cuentas que «fourier» de numerico, para que una FFT
  // de potencia de dos dé aquí exactamente lo mismo que allí.
  const tablas = new Map();
  function tablaDe(n) {
    let t = tablas.get(n);
    if (t) return t;
    const mitad = n >> 1, re = new Float64Array(Math.max(1, mitad)), im = new Float64Array(Math.max(1, mitad));
    for (let k = 0; k < mitad; k++) { const ang = (-2 * Math.PI * k) / n; re[k] = Math.cos(ang); im[k] = Math.sin(ang); }
    const rev = new Int32Array(n);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
    t = { re, im, rev };
    if (tablas.size > 16) tablas.clear();
    tablas.set(n, t);
    return t;
  }
  const potenciaDeDos = n => (n & (n - 1)) === 0;
  // Transforma «filas» filas de largo n, guardadas seguidas y entrelazadas
  // (re, im). Devuelve un arreglo NUEVO. signo −1 directa, +1 inversa (sin
  // dividir entre n: lo hace quien llama).
  function fftFilas(d, filas, n, signo) {
    if (n === 1) return Float64Array.from(d);
    if (potenciaDeDos(n)) {
      const t = tablaDe(n), y = new Float64Array(filas * 2 * n);
      const trabajo = filas * n;
      correr('nen_fft_permutar', trabajo, filas * n, n, t.rev, d, y);
      for (let largo = 2; largo <= n; largo <<= 1)
        correr('nen_fft_etapa', trabajo, filas * (n >> 1), n, largo, -signo, t.re, t.im, y);
      return y;
    }
    // Bluestein: las longitudes que no son potencia de dos se convierten en una
    // convolución de largo potencia de dos y se resuelven con las etapas de
    // arriba. Así ningún tamaño es O(n²). Es la misma idea que «fourier».
    const T = 1 << Math.ceil(Math.log2(2 * n - 1));
    const A = new Float64Array(filas * 2 * T), B = new Float64Array(2 * T);
    const cr = new Float64Array(n), ci = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const m = (j * j) % (2 * n);
      const ang = (signo * Math.PI * m) / n;
      cr[j] = Math.cos(ang); ci[j] = Math.sin(ang);
      B[2 * j] = cr[j]; B[2 * j + 1] = -ci[j];
      if (j > 0) { B[2 * (T - j)] = cr[j]; B[2 * (T - j) + 1] = -ci[j]; }
    }
    for (let f = 0; f < filas; f++) {
      const o = f * 2 * n, oA = f * 2 * T;
      for (let j = 0; j < n; j++) {
        const xr = d[o + 2 * j], xi = d[o + 2 * j + 1];
        A[oA + 2 * j] = xr * cr[j] - xi * ci[j];
        A[oA + 2 * j + 1] = xr * ci[j] + xi * cr[j];
      }
    }
    const FA = fftFilas(A, filas, T, -1), FB = fftFilas(B, 1, T, -1);
    correr('nen_cmul_filas', filas * T, filas * T, T, FA, FB);
    const R = fftFilas(FA, filas, T, 1);
    const out = new Float64Array(filas * 2 * n);
    for (let f = 0; f < filas; f++) {
      const o = f * 2 * n, oR = f * 2 * T;
      for (let k = 0; k < n; k++) {
        const vr = R[oR + 2 * k] / T, vi = R[oR + 2 * k + 1] / T;
        out[o + 2 * k] = vr * cr[k] - vi * ci[k];
        out[o + 2 * k + 1] = vr * ci[k] + vi * cr[k];
      }
    }
    vm.cobrar(filas * n);
    return out;
  }
  // Complejo entrelazado desde reales.
  const aComplejo = re => { const d = new Float64Array(2 * re.length); for (let i = 0; i < re.length; i++) d[2 * i] = re[i]; return d; };
  const planoC = x => (esC(x) ? planoDe(x) : aComplejo(planoDe(x)));
  // Transponer filas×cols complejos.
  function transponerC(d, filas, cols) {
    const o = new Float64Array(d.length);
    for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) {
      o[2 * (j * filas + i)] = d[2 * (i * cols + j)];
      o[2 * (j * filas + i) + 1] = d[2 * (i * cols + j) + 1];
    }
    vm.cobrar(filas * cols);
    return o;
  }
  function fft2D(d, M, N, signo) {
    let r = fftFilas(d, M, N, signo);          // las filas
    r = transponerC(r, M, N);
    r = fftFilas(r, N, M, signo);              // las columnas, como filas
    return transponerC(r, N, M);
  }
  const dividirTodo = (d, s) => { correr('nen_dividir', d.length, d.length, s, d); return d; };

  // ════════════════════════════════════════════ elemento a elemento
  // «seno(arreglo)» ya funciona en numerico para reales. Estas añaden tres
  // cosas que allí no hay: los COMPLEJOS, las listas como entrada, y el núcleo
  // de C1EÑ cuando el arreglo es grande. Los nombres llevan la «A» de las
  // versiones de arreglo de numerico (inversaA, resolverA…).
  // Funciones complejas: cada una recibe (re, im) y devuelve [re, im].
  const cExp = (a, b) => { const e = Math.exp(a); return [e * Math.cos(b), e * Math.sin(b)]; };
  const cLog = (a, b) => [Math.log(Math.hypot(a, b)), Math.atan2(b, a)];
  const cDiv = (a, b, c, d) => {
    // División de Smith: sin desbordes intermedios al elevar al cuadrado.
    if (Math.abs(c) >= Math.abs(d)) { const r = d / c, t = c + d * r; return [(a + b * r) / t, (b - a * r) / t]; }
    const r = c / d, t = c * r + d; return [(a * r + b) / t, (b * r - a) / t];
  };
  const cRaiz = (a, b) => {
    if (a === 0 && b === 0) return [0, 0];
    const r = Math.hypot(a, b);
    if (a >= 0) { const t = Math.sqrt((r + a) / 2); return [t, b / (2 * t)]; }
    const t = Math.sqrt((r - a) / 2);
    return [Math.abs(b) / (2 * t), b < 0 || Object.is(b, -0) ? -t : t];
  };
  const COMPLEJAS = {
    senoA: (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)],
    cosenoA: (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)],
    // tan z = (sen 2a + i·senh 2b)/(cos 2a + cosh 2b): una sola división y sin
    // restar dos infinitos cuando la parte imaginaria es grande.
    tangenteA: (a, b) => { const d = Math.cos(2 * a) + Math.cosh(2 * b); return [Math.sin(2 * a) / d, Math.sinh(2 * b) / d]; },
    senoHiperbolicoA: (a, b) => [Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)],
    cosenoHiperbolicoA: (a, b) => [Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)],
    tangenteHiperbolicaA: (a, b) => { const d = Math.cosh(2 * a) + Math.cos(2 * b); return [Math.sinh(2 * a) / d, Math.sin(2 * b) / d]; },
    expA: cExp,
    logA: cLog,
    raizA: cRaiz,
    signoA: (a, b) => { const r = Math.hypot(a, b); return r === 0 ? [0, 0] : [a / r, b / r]; },
  };
  // El dominio real: lo que se sale da NaN en silencio, y aquí se dice.
  const DOMINIO = {
    logA: v => v < 0, raizA: v => v < 0,
  };
  function unaria(nombre, nucleo, doc, opciones) {
    opciones = opciones || {};
    def(nombre, 'real|arreglo|lista -> cualquiera', a => {
      const v = a[0];
      if (typeof v === 'number') {
        if (DOMINIO[nombre] && DOMINIO[nombre](v))
          vm.error(`«${nombre}» de un número negativo (${v}) no es un número real`, 'pásalo a complejo con complejo(x) si quieres el resultado complejo');
        const y = new Float64Array(1);
        NEN_T_NUCLEOS[nucleo].js(1, Float64Array.of(v), y);
        return y[0];
      }
      const x = aArr(v, 1, nombre);
      if (esC(x)) {
        if (nombre === 'absolutoA') return vm.arrDeComplejoA(x, (re, im) => Math.hypot(re, im));
        const fc = COMPLEJAS[nombre];
        if (!fc) vm.error(`«${nombre}» no está definida para complejos`, 'usa parteReal, parteImaginaria o absoluto primero');
        return vm.arrComplejoA(x, fc);
      }
      // (motor-exp N1) un arreglo real seguido entra tal cual y la salida se
      // escribe directamente en el arreglo nuevo: dos copias de menos
      const d = (x.seguida && x.tipo === 'real') ? x.datos.subarray(0, x.tamano) : planoDe(x), n = d.length;
      if (DOMINIO[nombre]) for (let i = 0; i < n; i++) if (DOMINIO[nombre](d[i]))
        vm.error(`«${nombre}»: hay un valor negativo (${d[i]}, en la posición ${i}) y su resultado no es un número real`,
          'pásalo a complejo con complejo(a) si quieres los resultados complejos');
      const o = vm.arrNuevo(x.forma.slice(), 'real');
      correr(nucleo, n, n, d, o.datos);
      return o;
    }, doc);
  }
  unaria('senoA', 'nen_seno', 'senoA(a) — el seno de cada número · también de complejos y de listas · en la GPU si el arreglo es grande');
  unaria('cosenoA', 'nen_coseno', 'cosenoA(a) — el coseno de cada número, real o complejo');
  unaria('tangenteA', 'nen_tangente', 'tangenteA(a) — la tangente de cada número, real o complejo');
  unaria('arcotangenteA', 'nen_arcotangente', 'arcotangenteA(a) — el arco cuya tangente es cada número, entre −π/2 y π/2');
  unaria('senoHiperbolicoA', 'nen_senoh', 'senoHiperbolicoA(a) — (eˣ − e⁻ˣ)/2 de cada número, sin perder cifras cerca de 0 · también complejos');
  unaria('cosenoHiperbolicoA', 'nen_cosenoh', 'cosenoHiperbolicoA(a) — (eˣ + e⁻ˣ)/2 de cada número · también complejos');
  unaria('tangenteHiperbolicaA', 'nen_tangenteh', 'tangenteHiperbolicaA(a) — seno entre coseno hiperbólicos, sin desbordarse con números grandes · también complejos');
  unaria('expA', 'nen_exp', 'expA(a) — eˣ de cada número · de un complejo, e^a·(cos b + i·sen b)');
  unaria('logA', 'nen_log', 'logA(a) — el logaritmo natural de cada número · un negativo es un error salvo que lo pases a complejo · log(0) da −|INFINITO');
  unaria('raizA', 'nen_raiz', 'raizA(a) — la raíz cuadrada de cada número · con complejos, la raíz principal');
  unaria('absolutoA', 'nen_absoluto', 'absolutoA(a) — el valor absoluto de cada número · de un complejo, su módulo');
  unaria('signoA', 'nen_signo', 'signoA(a) — −1, 0 o 1 según el signo · de un complejo, z/|z|');
  unaria('pisoA', 'nen_piso', 'pisoA(a) — redondea hacia abajo y devuelve REALES, para no desbordar enteros de 32 bits');
  unaria('techoA', 'nen_techo', 'techoA(a) — redondea hacia arriba, devolviendo reales');
  unaria('sigmoideA', 'nen_sigmoide', 'sigmoideA(a) — 1/(1 + e⁻ˣ) de cada número, sin desbordarse con x muy negativo');
  unaria('reluA', 'nen_relu', 'reluA(a) — max(x, 0) de cada número · un NaN sigue siendo NaN');

  def('redondearA', '... -> cualquiera', a => {
    if (a.length < 1 || a.length > 2) vm.error('«redondearA» toma el arreglo y, si quieres, cuántos decimales');
    const dec = a.length > 1 ? ent(a[1], 2, 'redondearA') : 0;
    const f = Math.pow(10, dec);
    if (typeof a[0] === 'number') { const y = new Float64Array(1); NEN_T_NUCLEOS.nen_redondear.js(1, f, Float64Array.of(a[0]), y); return y[0]; }
    const x = real(a[0], 1, 'redondearA'), d = planoDe(x), y = new Float64Array(d.length);
    correr('nen_redondear', d.length, d.length, f, d, y);
    return deReales(x.forma, y);
  }, 'redondearA(a, decimales?) — redondea cada número, la mitad hacia arriba como «redondear»');

  // Dos arreglos (o arreglo y número) a la misma forma por difusión, en planos.
  function dosPlanos(p, q, quien) {
    const ap = typeof p === 'number' ? null : aArr(p, 1, quien), aq = typeof q === 'number' ? null : aArr(q, 2, quien);
    if (!ap && !aq) return null;
    let f;
    if (ap && aq) {
      f = difundir(ap.forma, aq.forma);
      if (f === null) vm.error(`«${quien}»: las formas ${ap.forma.join('×')} y ${aq.forma.join('×')} no se pueden difundir`,
        'de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1');
    } else f = (ap || aq).forma.slice();
    const complejo = esC(ap) || esC(aq);
    const plano = (x, v) => {
      if (!x) { const n = tamanoDe(f); const d = new Float64Array(complejo ? 2 * n : n); for (let i = 0; i < n; i++) d[complejo ? 2 * i : i] = v; return d; }
      const d = planoDe(difundidaT(x, f));
      return complejo && !esC(x) ? aComplejo(d) : d;
    };
    return { forma: f, complejo, x: plano(ap, p), y: plano(aq, q) };
  }
  def('potenciaA', 'real|arreglo|lista, real|arreglo|lista -> cualquiera', a => {
    if (typeof a[0] === 'number' && typeof a[1] === 'number') return Math.pow(a[0], a[1]);
    const t = dosPlanos(a[0], a[1], 'potenciaA'), n = tamanoDe(t.forma);
    if (t.complejo) {
      // z^w = exp(w·log z), con 0^w = 0 cuando la parte real de w es positiva.
      const out = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        const zr = t.x[2 * i], zi = t.x[2 * i + 1], wr = t.y[2 * i], wi = t.y[2 * i + 1];
        if (zr === 0 && zi === 0) { out[2 * i] = (wr === 0 && wi === 0) ? 1 : 0; continue; }
        const [lr, li] = cLog(zr, zi);
        const [er, ei] = cExp(wr * lr - wi * li, wr * li + wi * lr);
        out[2 * i] = er; out[2 * i + 1] = ei;
      }
      vm.cobrar(n);
      return deComplejos(t.forma, out);
    }
    for (let i = 0; i < n; i++)
      if (t.x[i] < 0 && !Number.isInteger(t.y[i]))
        vm.error(`«potenciaA»: ${t.x[i]} elevado a ${t.y[i]} no es un número real (posición ${i})`,
          'una base negativa solo admite exponentes enteros; pásala a complejo con complejo(a) para el resultado complejo');
    const y = new Float64Array(n);
    correr('nen_potencia', n, n, t.x, t.y, y);
    return deReales(t.forma, y);
  }, 'potenciaA(a, b) — a elevado a b elemento a elemento, con difusión · bases negativas solo con exponente entero, salvo en complejos');
  def('anguloA', 'real|arreglo|lista, real|arreglo|lista -> cualquiera', a => {
    if (typeof a[0] === 'number' && typeof a[1] === 'number') return Math.atan2(a[0], a[1]);
    const t = dosPlanos(a[0], a[1], 'anguloA');
    if (t.complejo) vm.error('«anguloA» es para reales: el ángulo de un complejo es fase(z)');
    const n = tamanoDe(t.forma), y = new Float64Array(n);
    correr('nen_angulo', n, n, t.x, t.y, y);
    return deReales(t.forma, y);
  }, 'anguloA(y, x) — el ángulo de cada punto (x, y) entre −π y π, sabiendo el cuadrante · la «angulo» de numerico, por arreglos');

  // Mover un eje al final y volver: lo usan softmax y las reducciones.
  const ejeAlFinal = (x, e) => { const p = []; for (let i = 0; i < x.dimensiones; i++) if (i !== e) p.push(i); p.push(e); return p; };
  const inversaPerm = p => { const q = new Array(p.length); p.forEach((v, i) => { q[v] = i; }); return q; };
  def('softmax', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«softmax» toma el arreglo y, si quieres, el eje (el último por omisión)');
    const x = real(a[0], 1, 'softmax');
    const e = vm.arrEje(x, a.length > 1 ? ent(a[1], 2, 'softmax') : -1, 'softmax');
    const perm = ejeAlFinal(x, e), K = x.forma[e], M = x.tamano / (K || 1);
    if (K === 0) return deReales(x.forma, new Float64Array(0));
    const d = planoDe(permutadaT(x, perm)), y = new Float64Array(d.length);
    correr('nen_softmax', d.length, M, K, d, y);
    const pf = perm.map(i => x.forma[i]);
    const tmp = new ObjArreglo(y, pf, 'real');
    return deReales(x.forma, planoDe(permutadaT(tmp, inversaPerm(perm))));
  }, 'softmax(a, eje?) — exp(x)/Σexp(x) a lo largo del eje (el último), restando el máximo para no desbordarse · cada fila suma 1');
  def('mapearA', 'arreglo|lista, funcion -> arreglo', a => {
    const x = real(a[0], 1, 'mapearA');
    const f = vm.exigeFuncion(a[1], 2, 'mapearA');
    const d = planoDe(x), y = new Float64Array(d.length);
    for (let i = 0; i < d.length; i++) {
      const r = vm.invocar(f, [d[i]]);
      if (typeof r !== 'number') vm.error(`«mapearA»: la función tiene que devolver un número y con ${d[i]} devolvió ${tipoDe(r)}`);
      y[i] = r;
    }
    return deReales(x.forma, y);
  }, 'mapearA(a, fn(x) { … }) — aplica una función de Ñ a cada número y devuelve un arreglo de la misma forma');

  // ════════════════════════════════════════════ reducciones por eje
  // «suma(a, eje)» de numerico reduce UN eje de un arreglo real. Estas reducen
  // uno, varios (lista) o todos, aceptan «mantener» para conservar los ejes con
  // tamaño 1 (y así difundir el resultado contra el original), y van por el
  // núcleo de reducción por trozos.
  function ejesDe(x, v, f) {
    if (v === undefined || v === null) return x.forma.map((_, i) => i);
    const lista = typeof v === 'number' ? [v] : listaEnteros(v, 2, f);
    const s = new Set();
    for (const e of lista) {
      const k = vm.arrEje(x, e, f);
      if (s.has(k)) vm.error(`«${f}»: el eje ${k} está repetido`);
      s.add(k);
    }
    return [...s].sort((p, q) => p - q);
  }
  // Deja los ejes reducidos al final y da el plano (M filas de K).
  function prepararReduccion(x, ejesArg, mantener, f) {
    const ejes = ejesDe(x, ejesArg, f);
    const libres = x.forma.map((_, i) => i).filter(i => !ejes.includes(i));
    const perm = libres.concat(ejes);
    const M = libres.reduce((p, i) => p * x.forma[i], 1), K = ejes.reduce((p, i) => p * x.forma[i], 1);
    const formaOut = mantener ? x.forma.map((v, i) => (ejes.includes(i) ? 1 : v)) : libres.map(i => x.forma[i]);
    return { d: planoDe(permutadaT(x, perm)), M, K, formaOut };
  }
  // Reducir M filas de K por trozos; si quedan varios trozos por fila, se
  // reducen otra vez (con la operación que los combina).
  const COMBINA = { nen_red_suma: 'nen_red_suma', nen_red_producto: 'nen_red_producto', nen_red_maximo: 'nen_red_maximo',
    nen_red_minimo: 'nen_red_minimo', nen_red_suma2: 'nen_red_suma', nen_red_sumaabs: 'nen_red_suma',
    nen_red_maxabs: 'nen_red_maximo', nen_red_desv2: 'nen_red_suma' };
  function reducirFilas(op, x, M, K, mu) {
    if (K <= NEN_T_TROZO) {
      const y = new Float64Array(M);
      if (mu) correr(op, M * K, M, K, K, 1, x, mu, y); else correr(op, M * K, M, K, K, 1, x, y);
      return y;
    }
    const nb = Math.ceil(K / NEN_T_TROZO), y = new Float64Array(M * nb);
    if (mu) correr(op, M * K, M * nb, K, NEN_T_TROZO, nb, x, mu, y); else correr(op, M * K, M * nb, K, NEN_T_TROZO, nb, x, y);
    return reducirFilas(COMBINA[op], y, M, nb, null);
  }
  const salida = (forma, y) => (forma.length ? deReales(forma, y) : y[0]);
  // Los argumentos de todas: (a, eje?, mantener?). «eje» puede ser nulo para
  // decir «todos» y aun así pasar «mantener».
  const argsRed = (a, f) => {
    if (a.length < 1 || a.length > 3) vm.error(`«${f}» toma el arreglo, el eje (un entero, una lista o nulo) y si quieres mantener los ejes`);
    return { x: aArr(a[0], 1, f), eje: a[1], mantener: a.length > 2 ? !!a[2] : false };
  };
  // Las de complejos, en JavaScript: suma y producto de pares (re, im).
  function reducirC(x, eje, mantener, f, producto) {
    const r = prepararReduccion(x, eje, mantener, f), out = new Float64Array(2 * r.M);
    for (let i = 0; i < r.M; i++) {
      let sr = producto ? 1 : 0, si = 0;
      for (let k = 0; k < r.K; k++) {
        const vr = r.d[2 * (i * r.K + k)], vi = r.d[2 * (i * r.K + k) + 1];
        if (producto) { const t = sr * vr - si * vi; si = sr * vi + si * vr; sr = t; } else { sr += vr; si += vi; }
      }
      out[2 * i] = sr; out[2 * i + 1] = si;
    }
    return { forma: r.formaOut.length ? r.formaOut : [1], d: out, K: r.K };
  }
  def('sumaEje', '... -> cualquiera', a => {
    const { x, eje, mantener } = argsRed(a, 'sumaEje');
    if (esC(x)) { const r = reducirC(x, eje, mantener, 'sumaEje', false); return deComplejos(r.forma, r.d); }
    const r = prepararReduccion(x, eje, mantener, 'sumaEje');
    return salida(r.formaOut, reducirFilas('nen_red_suma', r.d, r.M, r.K));
  }, 'sumaEje(a, eje?, mantener?) — suma por uno, varios ([0, 2]) o todos los ejes · por trozos, que suma con menos error · complejos también');
  def('productoEje', '... -> cualquiera', a => {
    const { x, eje, mantener } = argsRed(a, 'productoEje');
    if (esC(x)) { const r = reducirC(x, eje, mantener, 'productoEje', true); return deComplejos(r.forma, r.d); }
    const r = prepararReduccion(x, eje, mantener, 'productoEje');
    return salida(r.formaOut, reducirFilas('nen_red_producto', r.d, r.M, r.K));
  }, 'productoEje(a, eje?, mantener?) — multiplica a lo largo de los ejes · complejos también');
  def('mediaEje', '... -> cualquiera', a => {
    const { x, eje, mantener } = argsRed(a, 'mediaEje');
    if (esC(x)) {
      const r = reducirC(x, eje, mantener, 'mediaEje', false);
      if (r.K === 0) vm.error('«mediaEje» de un eje vacío');
      for (let i = 0; i < r.d.length; i++) r.d[i] /= r.K;
      return deComplejos(r.forma, r.d);
    }
    const r = prepararReduccion(x, eje, mantener, 'mediaEje');
    if (r.K === 0) vm.error('«mediaEje» de un eje vacío');
    const y = reducirFilas('nen_red_suma', r.d, r.M, r.K);
    for (let i = 0; i < y.length; i++) y[i] /= r.K;
    return salida(r.formaOut, y);
  }, 'mediaEje(a, eje?, mantener?) — la media por eje · con mantener verdadero, a − mediaEje(a, 0, verdadero) centra cada columna');
  function varianza(a, f, raiz) {
    const { x, eje, mantener } = argsRed(a, f);
    vm.nadaDeComplejos(x, f);
    const r = prepararReduccion(x, eje, mantener, f);
    if (r.K < 2) vm.error(`«${f}» necesita al menos 2 datos por grupo y hay ${r.K}`);
    // Dos pasadas: la media y después las desviaciones. La de una pasada,
    // Σx²/n − media², resta dos números grandes y casi iguales y puede dar
    // varianzas negativas con datos de magnitud grande.
    const mu = reducirFilas('nen_red_suma', r.d, r.M, r.K);
    for (let i = 0; i < mu.length; i++) mu[i] /= r.K;
    const y = reducirFilas('nen_red_desv2', r.d, r.M, r.K, mu);
    for (let i = 0; i < y.length; i++) { y[i] /= (r.K - 1); if (raiz) y[i] = Math.sqrt(y[i]); }
    return salida(r.formaOut, y);
  }
  def('varianzaEje', '... -> cualquiera', a => varianza(a, 'varianzaEje', false),
    'varianzaEje(a, eje?, mantener?) — varianza muestral (entre n−1, como «varianza») por eje, en dos pasadas');
  def('desviacionEje', '... -> cualquiera', a => varianza(a, 'desviacionEje', true),
    'desviacionEje(a, eje?, mantener?) — desviación muestral por eje');
  const extremo = (nombre, op, doc) => def(nombre, '... -> cualquiera', a => {
    const { x, eje, mantener } = argsRed(a, nombre);
    vm.nadaDeComplejos(x, nombre);
    const r = prepararReduccion(x, eje, mantener, nombre);
    if (r.K === 0) vm.error(`«${nombre}» de un eje vacío: no hay ningún número del que sacarlo`);
    return salida(r.formaOut, reducirFilas(op, r.d, r.M, r.K));
  }, doc);
  extremo('maximoEje', 'nen_red_maximo', 'maximoEje(a, eje?, mantener?) — el mayor por eje · un NaN en el grupo da NaN');
  extremo('minimoEje', 'nen_red_minimo', 'minimoEje(a, eje?, mantener?) — el menor por eje');
  def('normaEje', '... -> cualquiera', a => {
    if (a.length < 1 || a.length > 4) vm.error('«normaEje» toma el arreglo, el eje, el orden (2, 1 o |INFINITO) y si quieres mantener los ejes');
    let x = aArr(a[0], 1, 'normaEje');
    const orden = a.length > 2 && a[2] !== null ? num(a[2], 3, 'normaEje') : 2;
    if (orden !== 1 && orden !== 2 && orden !== Infinity)
      vm.error(`«normaEje»: el orden ${orden} no está`, 'son 2 (la euclídea, por omisión), 1 y |INFINITO');
    if (esC(x)) x = vm.arrDeComplejoA(x, (re, im) => Math.hypot(re, im));
    const r = prepararReduccion(x, a[1], a.length > 3 ? !!a[3] : false, 'normaEje');
    let y;
    if (orden === 2) {
      // El escalado de la norma: sin él, un vector de números de 1e200 da
      // infinito al elevar al cuadrado. Se divide entre el mayor, se suma y se
      // vuelve a multiplicar.
      const mx = reducirFilas('nen_red_maxabs', r.d, r.M, r.K);
      const esc = new Float64Array(r.d.length);
      for (let i = 0; i < r.M; i++) { const s = mx[i] || 1; for (let k = 0; k < r.K; k++) esc[i * r.K + k] = r.d[i * r.K + k] / s; }
      y = reducirFilas('nen_red_suma2', esc, r.M, r.K);
      for (let i = 0; i < y.length; i++) y[i] = mx[i] === 0 || !Number.isFinite(mx[i]) ? mx[i] : mx[i] * Math.sqrt(y[i]);
    } else y = reducirFilas(orden === 1 ? 'nen_red_sumaabs' : 'nen_red_maxabs', r.d, r.M, r.K);
    return salida(r.formaOut, y);
  }, 'normaEje(a, eje?, orden?, mantener?) — la longitud de cada fila o columna · orden 2, 1 o |INFINITO · complejos por su módulo');
  const logica = (nombre, op, doc) => def(nombre, '... -> cualquiera', a => {
    const { x, eje, mantener } = argsRed(a, nombre);
    vm.nadaDeComplejos(x, nombre);
    const r = prepararReduccion(x, eje, mantener, nombre);
    for (let i = 0; i < r.d.length; i++) r.d[i] = r.d[i] ? 1 : 0;
    if (r.K === 0) { const y = new Float64Array(r.M).fill(op === 'nen_red_minimo' ? 1 : 0); return r.formaOut.length ? aBool(r.formaOut, y) : !!y[0]; }
    const y = reducirFilas(op, r.d, r.M, r.K);
    return r.formaOut.length ? aBool(r.formaOut, y) : !!y[0];
  }, doc);
  const aBool = (forma, y) => { const o = vm.arrNuevo(forma, 'bool'); for (let i = 0; i < y.length; i++) o.datos[i] = y[i] ? 1 : 0; return o; };
  logica('todosEje', 'nen_red_minimo', 'todosEje(mascara, eje?, mantener?) — ¿todos ciertos? por eje · da una máscara, o un bool si reduce todo');
  logica('algunoEje', 'nen_red_maximo', 'algunoEje(mascara, eje?, mantener?) — ¿alguno cierto? por eje');

  // ════════════════════════════════════════════ álgebra de tensores
  def('permutarEjes', '... -> arreglo', a => {
    const x = aArr(a[0], 1, 'permutarEjes');
    const nd = x.dimensiones;
    const p = a.length > 1 ? listaEnteros(a[1], 2, 'permutarEjes').map(e => vm.arrEje(x, e, 'permutarEjes'))
      : x.forma.map((_, i) => nd - 1 - i);
    if (p.length !== nd || new Set(p).size !== nd)
      vm.error(`«permutarEjes»: el orden tiene que nombrar cada uno de los ${nd} ejes una vez y llegó [${p.join(', ')}]`);
    // Como «transpuesta»: cambiar el orden de los ejes es cambiar el orden de
    // las zancadas. Una VISTA, sin copiar nada.
    return vm.nuevoArreglo(x.datos, p.map(e => x.forma[e]), x.tipo, p.map(e => x.zancadas[e]), x.desp, x.base || x);
  }, 'permutarEjes(a, orden?) — una VISTA con los ejes en otro orden: permutarEjes(t, [2, 0, 1]) · sin orden, los invierte');
  def('voltear', '... -> arreglo', a => {
    const x = aArr(a[0], 1, 'voltear');
    const ejes = a.length > 1 && a[1] !== null ? ejesDe(x, a[1], 'voltear') : x.forma.map((_, i) => i);
    const z = x.zancadas.slice();
    let desp = x.desp;
    for (const e of ejes) { if (x.forma[e] > 0) desp += (x.forma[e] - 1) * z[e]; z[e] = -z[e]; }
    return vm.nuevoArreglo(x.datos, x.forma.slice(), x.tipo, z, desp, x.base || x);
  }, 'voltear(a, eje?) — una VISTA al revés por ese eje (o ejes, o todos) · zancada negativa, sin copiar');
  // Rodar copia: cada eje se reparte en dos trozos que cambian de sitio.
  function rodarPlano(x, k, e) {
    const w = esC(x) ? 2 : 1, d = planoDe(x), f = x.forma, n = f[e];
    if (n === 0) return d;
    const despl = ((k % n) + n) % n;
    const dentro = f.slice(e + 1).reduce((p, q) => p * q, 1), fuera = f.slice(0, e).reduce((p, q) => p * q, 1);
    const out = new Float64Array(d.length);
    for (let o = 0; o < fuera; o++) for (let j = 0; j < n; j++) {
      const de = (o * n + j) * dentro * w, a2 = (o * n + (j + despl) % n) * dentro * w;
      out.set(d.subarray(de, de + dentro * w), a2);
    }
    return out;
  }
  const deTipo = (x, forma, d) => (esC(x) ? deComplejos(forma, d) : x.tipo === 'entero' ? aEntero(forma, d) : deReales(forma, d));
  const aEntero = (forma, d) => { const o = vm.arrNuevo(forma, 'entero'); for (let i = 0; i < o.tamano; i++) o.datos[i] = d[i]; return o; };
  def('rodar', '... -> arreglo', a => {
    if (a.length < 2 || a.length > 3) vm.error('«rodar» toma el arreglo, cuántos puestos y, si quieres, el eje');
    const x = aArr(a[0], 1, 'rodar'), k = ent(a[1], 2, 'rodar');
    if (a.length === 3) { const e = vm.arrEje(x, ent(a[2], 3, 'rodar'), 'rodar'); return deTipo(x, x.forma, rodarPlano(x, k, e)); }
    const plano = new ObjArreglo(planoDe(x), [x.tamano], x.tipo === 'complejo' ? 'complejo' : 'real');
    return deTipo(x, x.forma, rodarPlano(plano, k, 0));
  }, 'rodar(a, k, eje?) — desplaza k puestos en círculo: lo que sale por un lado entra por el otro · sin eje, sobre el arreglo aplanado');
  def('rejilla', '... -> lista', a => {
    if (a.length < 2) vm.error('«rejilla» necesita al menos dos vectores (x, y)');
    const vs = a.map((v, i) => planoDe(vector(v, i + 1, 'rejilla')));
    // El orden de un plano: con dos vectores, las FILAS van por «y» y las
    // COLUMNAS por «x», como en un dibujo (es el «meshgrid» de NumPy). Con más,
    // el resto de ejes va detrás en su orden.
    const largos = vs.map(v => v.length);
    const forma = [largos[1], largos[0]].concat(largos.slice(2));
    const ejeDe = i => (i === 0 ? 1 : i === 1 ? 0 : i);
    const total = tamanoDe(forma);
    vm.cobrar(total * vs.length);
    return L(vs.map((v, i) => {
      const e = ejeDe(i), o = vm.arrNuevo(forma, 'real');
      const dentro = forma.slice(e + 1).reduce((p, q) => p * q, 1);
      for (let k = 0; k < total; k++) o.datos[k] = v[Math.floor(k / dentro) % forma[e]];
      return o;
    }));
  }, 'rejilla(x, y, …) — la lista [X, Y, …] de una cuadrícula: X[i][j] = x[j] e Y[i][j] = y[i] · para evaluar f(x, y) en todo el plano de una vez');
  def('repetirA', '... -> arreglo', a => {
    if (a.length < 2 || a.length > 3) vm.error('«repetirA» toma el arreglo, cuántas veces y, si quieres, el eje');
    let x = aArr(a[0], 1, 'repetirA');
    const veces = ent(a[1], 2, 'repetirA');
    if (veces < 0) vm.error('«repetirA»: las veces no pueden ser negativas');
    if (a.length < 3) x = new ObjArreglo(planoDe(x), [x.tamano], x.tipo === 'complejo' ? 'complejo' : 'real');
    const e = a.length === 3 ? vm.arrEje(x, ent(a[2], 3, 'repetirA'), 'repetirA') : 0;
    const w = esC(x) ? 2 : 1, d = planoDe(x), f = x.forma;
    const dentro = f.slice(e + 1).reduce((p, q) => p * q, 1) * w, fuera = f.slice(0, e).reduce((p, q) => p * q, 1);
    const f2 = f.slice(); f2[e] = f[e] * veces;
    const out = new Float64Array(tamanoDe(f2) * w);
    let o = 0;
    for (let i = 0; i < fuera; i++) for (let j = 0; j < f[e]; j++) {
      const de = (i * f[e] + j) * dentro;
      for (let v = 0; v < veces; v++) { out.set(d.subarray(de, de + dentro), o); o += dentro; }
    }
    vm.cobrar(out.length);
    return deTipo(a[0] instanceof ObjArreglo ? a[0] : x, f2, out);
  }, 'repetirA(a, veces, eje?) — repite CADA elemento seguido: [1, 2] dos veces es [1, 1, 2, 2] · sin eje, aplanado');
  def('mosaico', 'arreglo|lista, entero|lista -> arreglo', a => {
    const x = aArr(a[0], 1, 'mosaico');
    let reps = listaEnteros(a[1], 2, 'mosaico');
    if (reps.some(r => r < 0)) vm.error('«mosaico»: las repeticiones no pueden ser negativas');
    // Como «tile» de NumPy: si hay más repeticiones que ejes, se añaden ejes de
    // 1 por delante; si hay menos, las que faltan valen 1.
    let f = x.forma.slice();
    while (f.length < reps.length) f.unshift(1);
    while (reps.length < f.length) reps.unshift(1);
    const w = esC(x) ? 2 : 1, d = planoDe(x), f2 = f.map((v, i) => v * reps[i]), nd = f.length;
    const out = new Float64Array(tamanoDe(f2) * w);
    const zs = zancadasDe(f), ix = new Array(nd).fill(0), total = tamanoDe(f2);
    for (let k = 0; k < total; k++) {
      let p = 0;
      for (let q = 0; q < nd; q++) p += (ix[q] % f[q]) * zs[q];
      if (w === 1) out[k] = d[p]; else { out[2 * k] = d[2 * p]; out[2 * k + 1] = d[2 * p + 1]; }
      for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < f2[q]) break; ix[q] = 0; }
    }
    vm.cobrar(total);
    return deTipo(x, f2, out);
  }, 'mosaico(a, repeticiones) — repite el arreglo ENTERO como baldosas: mosaico(m, [2, 3]) pone 2 por 3 copias');
  def('diagonalDe', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«diagonalDe» toma el arreglo y, si quieres, qué diagonal (0 la principal, 1 la de encima, −1 la de debajo)');
    const x = aArr(a[0], 1, 'diagonalDe'), k = a.length > 1 ? ent(a[1], 2, 'diagonalDe') : 0;
    vm.nadaDeComplejos(x, 'diagonalDe');
    const d = planoDe(x);
    if (x.dimensiones === 1) {
      const n = x.tamano + Math.abs(k), out = new Float64Array(n * n);
      for (let i = 0; i < x.tamano; i++) { const f = k >= 0 ? i : i - k, c = k >= 0 ? i + k : i; out[f * n + c] = d[i]; }
      return deReales([n, n], out);
    }
    if (x.dimensiones !== 2) vm.error(`«diagonalDe»: se esperaba un vector o una matriz y llegó un arreglo de ${x.dimensiones} dimensiones`);
    const nf = x.forma[0], nc = x.forma[1];
    const f0 = k >= 0 ? 0 : -k, c0 = k >= 0 ? k : 0;
    const n = Math.max(0, Math.min(nf - f0, nc - c0)), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = d[(f0 + i) * nc + c0 + i];
    return deReales([n], out);
  }, 'diagonalDe(a, k?) — la k-ésima diagonal de una matriz, o la matriz con el vector en su k-ésima diagonal · «diagonal» de numerico es k = 0');
  def('productoCruz', 'arreglo|lista, arreglo|lista -> arreglo', a => {
    const x = real(a[0], 1, 'productoCruz'), y = real(a[1], 2, 'productoCruz');
    if (x.forma[x.dimensiones - 1] !== 3 || y.forma[y.dimensiones - 1] !== 3)
      vm.error(`«productoCruz» es para vectores de 3 componentes y llegaron de ${x.forma.join('×')} y ${y.forma.join('×')}`,
        'el último eje tiene que medir 3; en el plano, añade un 0 como tercera componente');
    const t = dosPlanos(x, y, 'productoCruz'), n = tamanoDe(t.forma) / 3, out = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const o = 3 * i, a1 = t.x[o], a2 = t.x[o + 1], a3 = t.x[o + 2], b1 = t.y[o], b2 = t.y[o + 1], b3 = t.y[o + 2];
      out[o] = a2 * b3 - a3 * b2; out[o + 1] = a3 * b1 - a1 * b3; out[o + 2] = a1 * b2 - a2 * b1;
    }
    return deReales(t.forma, out);
  }, 'productoCruz(a, b) — el vector perpendicular a los dos, de largo el área del paralelogramo · sobre el último eje, con difusión');
  def('normaTensor', '... -> real', a => {
    const x = aArr(a[0], 1, 'normaTensor');
    const orden = a.length > 1 ? num(a[1], 2, 'normaTensor') : 2;
    const d = planoDe(esC(x) ? vm.arrDeComplejoA(x, (re, im) => Math.hypot(re, im)) : x);
    if (orden === Infinity) return reducirFilas('nen_red_maxabs', d, 1, d.length)[0];
    if (orden === 1) return reducirFilas('nen_red_sumaabs', d, 1, d.length)[0];
    if (orden !== 2) vm.error(`«normaTensor»: el orden ${orden} no está`, 'son 2 (Frobenius, por omisión), 1 y |INFINITO');
    const mx = reducirFilas('nen_red_maxabs', d, 1, d.length)[0];
    if (mx === 0 || !Number.isFinite(mx)) return mx;
    for (let i = 0; i < d.length; i++) d[i] /= mx;
    return mx * Math.sqrt(reducirFilas('nen_red_suma2', d, 1, d.length)[0]);
  }, 'normaTensor(t, orden?) — el tamaño de un tensor de cualquier forma: √Σ|x|² (Frobenius) · 1 o |INFINITO · complejos por su módulo · escalada para no desbordarse');

  // contraer = tensordot: los ejes de «a» y de «b» que se suman se ponen al
  // final de «a» y al principio de «b», y entonces es un producto de matrices
  // de (libres de a) × (sumados) por (sumados) × (libres de b). Toda la
  // contracción es UN núcleo de producto de matrices.
  function contraerP(x, y, ea, eb, quien) {
    if (ea.length !== eb.length) vm.error(`«${quien}»: hay ${ea.length} ejes de un lado y ${eb.length} del otro`);
    for (let i = 0; i < ea.length; i++)
      if (x.forma[ea[i]] !== y.forma[eb[i]])
        vm.error(`«${quien}»: el eje ${ea[i]} del primero mide ${x.forma[ea[i]]} y el ${eb[i]} del segundo mide ${y.forma[eb[i]]}`,
          'los ejes que se contraen tienen que medir lo mismo');
    if (new Set(ea).size !== ea.length || new Set(eb).size !== eb.length) vm.error(`«${quien}»: un eje está repetido`);
    const la = x.forma.map((_, i) => i).filter(i => !ea.includes(i));
    const lb = y.forma.map((_, i) => i).filter(i => !eb.includes(i));
    const M = la.reduce((p, i) => p * x.forma[i], 1), N = lb.reduce((p, i) => p * y.forma[i], 1);
    const K = ea.reduce((p, i) => p * x.forma[i], 1);
    const A = planoDe(permutadaT(x, la.concat(ea))), B = planoDe(permutadaT(y, eb.concat(lb)));
    return { d: mm(A, B, M, K, N), forma: la.map(i => x.forma[i]).concat(lb.map(i => y.forma[i])) };
  }
  def('contraer', '... -> cualquiera', a => {
    if (a.length < 2 || a.length > 4) vm.error('«contraer» toma dos arreglos y los ejes: contraer(a, b, k) o contraer(a, b, ejesA, ejesB)');
    const x = real(a[0], 1, 'contraer'), y = real(a[1], 2, 'contraer');
    let ea, eb;
    if (a.length === 4) {
      ea = listaEnteros(a[2], 3, 'contraer').map(e => vm.arrEje(x, e, 'contraer'));
      eb = listaEnteros(a[3], 4, 'contraer').map(e => vm.arrEje(y, e, 'contraer'));
    } else {
      const k = a.length === 3 ? ent(a[2], 3, 'contraer') : 2;
      if (k < 0 || k > x.dimensiones || k > y.dimensiones)
        vm.error(`«contraer»: no se pueden contraer ${k} ejes entre arreglos de ${x.dimensiones} y ${y.dimensiones} dimensiones`);
      ea = []; eb = [];
      for (let i = 0; i < k; i++) { ea.push(x.dimensiones - k + i); eb.push(i); }
    }
    const r = contraerP(x, y, ea, eb, 'contraer');
    return r.forma.length ? deReales(r.forma, r.d) : r.d[0];
  }, 'contraer(a, b, ejesA, ejesB) — suma los productos a lo largo de esos ejes (tensordot) · contraer(a, b, 1) es el producto de matrices · un solo núcleo de GPU');

  // ── einstein ──────────────────────────────────────────────────────────────
  // La notación de Einstein: cada letra es un eje, las letras que se repiten
  // entre entradas y no salen se suman. «ij,jk->ik» es el producto de
  // matrices, «ii->» la traza, «ii->i» la diagonal, «ij->ji» la transpuesta.
  function leerEinstein(spec, n) {
    const limpio = spec.replace(/\s+/g, '');
    if (limpio.includes('...'))
      vm.error('«einstein»: los puntos suspensivos («...») no están soportados', 'escribe una letra por cada eje');
    const partes = limpio.split('->');
    if (partes.length > 2) vm.error(`«einstein»: «${spec}» tiene más de una flecha`);
    const entradas = partes[0].split(',');
    if (entradas.length !== n)
      vm.error(`«einstein»: «${spec}» describe ${entradas.length} entrada${entradas.length === 1 ? '' : 's'} y llegaron ${n} arreglo${n === 1 ? '' : 's'}`,
        'una lista de letras por arreglo, separadas por comas');
    for (const e of entradas.concat(partes.length === 2 ? [partes[1]] : []))
      for (const c of e) if (!/[a-zA-Z]/.test(c))
        vm.error(`«einstein»: «${c}» no vale como índice en «${spec}»`, 'cada eje se nombra con una letra: «ij,jk->ik»');
    let salida;
    if (partes.length === 2) {
      salida = partes[1];
      if (new Set(salida).size !== salida.length) vm.error(`«einstein»: la salida «${salida}» repite una letra`);
      const todas = new Set(entradas.join(''));
      for (const c of salida) if (!todas.has(c)) vm.error(`«einstein»: la letra «${c}» de la salida no está en ninguna entrada`);
    } else {
      // Modo implícito, como NumPy: salen las letras que aparecen UNA vez, en
      // orden alfabético; las repetidas se suman.
      const cuenta = new Map();
      for (const c of entradas.join('')) cuenta.set(c, (cuenta.get(c) || 0) + 1);
      salida = [...cuenta.keys()].filter(c => cuenta.get(c) === 1).sort().join('');
    }
    return { entradas, salida };
  }
  def('einstein', '... -> cualquiera', a => {
    if (a.length < 2) vm.error('«einstein» toma la descripción y al menos un arreglo: einstein("ij,jk->ik", a, b)');
    const spec = textoDe(a[0], 1, 'einstein');
    const xs = a.slice(1).map((v, i) => real(v, i + 2, 'einstein'));
    const { entradas, salida } = leerEinstein(spec, xs.length);
    const tam = new Map();
    entradas.forEach((e, k) => {
      if (e.length !== xs[k].dimensiones)
        vm.error(`«einstein»: la entrada ${k + 1} se describe con ${e.length} letra${e.length === 1 ? '' : 's'} («${e}») y tiene ${xs[k].dimensiones} dimensiones`,
          `su forma es ${xs[k].forma.join('×')}`);
      for (let i = 0; i < e.length; i++) {
        const c = e[i], v = xs[k].forma[i];
        if (tam.has(c) && tam.get(c) !== v)
          vm.error(`«einstein»: la letra «${c}» mide ${tam.get(c)} en un sitio y ${v} en otro`, 'los ejes con la misma letra tienen que medir lo mismo');
        tam.set(c, v);
      }
    });
    const formaSal = [...salida].map(c => tam.get(c));
    // El camino rápido: dos entradas sin letras repetidas dentro de una misma
    // entrada y sin «lotes» (letras en las dos entradas Y en la salida). Eso
    // es exactamente una contracción, y va por el núcleo de producto de matrices.
    if (xs.length === 2) {
      const [ea, eb] = entradas;
      const sinRep = new Set(ea).size === ea.length && new Set(eb).size === eb.length;
      const comunes = [...ea].filter(c => eb.includes(c));
      const sinLotes = comunes.every(c => !salida.includes(c));
      const todasSalen = [...ea, ...eb].every(c => comunes.includes(c) || salida.includes(c));
      if (sinRep && sinLotes && todasSalen) {
        const r = contraerP(xs[0], xs[1], comunes.map(c => ea.indexOf(c)), comunes.map(c => eb.indexOf(c)), 'einstein');
        const orden = [...ea].filter(c => !comunes.includes(c)).concat([...eb].filter(c => !comunes.includes(c)));
        if (!orden.length) return r.d[0];
        const t = new ObjArreglo(r.d, r.forma, 'real');
        return deReales(formaSal, planoDe(permutadaT(t, [...salida].map(c => orden.indexOf(c)))));
      }
    }
    // El camino general: un odómetro sobre todas las letras (primero las de la
    // salida, después las sumadas), con la zancada de cada letra en cada
    // entrada. Una letra repetida en una entrada suma sus zancadas, y eso es
    // justo recorrer la diagonal.
    const letras = [...salida].concat([...tam.keys()].filter(c => !salida.includes(c)));
    const nl = letras.length, lim = letras.map(c => tam.get(c));
    const zs = xs.map((x, k) => letras.map(c => {
      let z = 0;
      for (let i = 0; i < entradas[k].length; i++) if (entradas[k][i] === c) z += x.zancadas[i];
      return z;
    }));
    const datos = xs.map(x => x.datos), desp = xs.map(x => x.desp);
    const nSal = salida.length, totalSal = tamanoDe(formaSal), totalSum = tamanoDe(lim.slice(nSal));
    vm.cobrar(totalSal * totalSum * xs.length);
    const out = new Float64Array(totalSal), ix = new Array(nl).fill(0), pos = desp.slice();
    if (totalSal * totalSum > 0) {
      for (let s = 0; s < totalSal; s++) {
        let acc = 0;
        for (let t = 0; t < totalSum; t++) {
          let pr = 1;
          for (let k = 0; k < xs.length; k++) pr *= datos[k][pos[k]];
          acc += pr;
          // Avanzar el odómetro de las letras sumadas.
          for (let q = nl - 1; q >= nSal; q--) {
            if (++ix[q] < lim[q]) { for (let k = 0; k < xs.length; k++) pos[k] += zs[k][q]; break; }
            for (let k = 0; k < xs.length; k++) pos[k] -= (lim[q] - 1) * zs[k][q];
            ix[q] = 0;
          }
        }
        out[s] = acc;
        for (let q = nSal - 1; q >= 0; q--) {
          if (++ix[q] < lim[q]) { for (let k = 0; k < xs.length; k++) pos[k] += zs[k][q]; break; }
          for (let k = 0; k < xs.length; k++) pos[k] -= (lim[q] - 1) * zs[k][q];
          ix[q] = 0;
        }
      }
    }
    return nSal ? deReales(formaSal, out) : out[0];
  }, 'einstein("ij,jk->ik", a, b) — sumas de productos con la notación de Einstein: producto de matrices, traza («ii->»), diagonal («ii->i»), transpuesta («ij->ji»), externo («i,j->ij») · sin «->» salen las letras que aparecen una vez');

  def('multLotes', 'arreglo|lista, arreglo|lista -> arreglo', a => {
    let x = real(a[0], 1, 'multLotes'), y = real(a[1], 2, 'multLotes');
    // Como «matmul» de NumPy: los dos últimos ejes son la matriz y los de
    // delante son lotes que se difunden. Un vector se trata como fila (si va
    // primero) o columna (si va segundo) y ese eje se quita al final.
    const v1 = x.dimensiones === 1, v2 = y.dimensiones === 1;
    if (v1) x = vistaT(x, [1, x.forma[0]], [0, x.zancadas[0]], x.desp);
    if (v2) y = vistaT(y, [y.forma[0], 1], [y.zancadas[0], 0], y.desp);
    const m = x.forma[x.dimensiones - 2], K = x.forma[x.dimensiones - 1], K2 = y.forma[y.dimensiones - 2], p = y.forma[y.dimensiones - 1];
    if (K !== K2) vm.error(`«multLotes»: no se puede multiplicar …×${m}×${K} por …×${K2}×${p}`,
      `las columnas del primero (${K}) tienen que ser las filas del segundo (${K2})`);
    const la = x.forma.slice(0, -2), lb = y.forma.slice(0, -2), fl = difundir(la, lb);
    if (fl === null) vm.error(`«multLotes»: los lotes ${la.join('×')} y ${lb.join('×')} no se pueden difundir`);
    const lotes = tamanoDe(fl);
    const A = planoDe(difundidaT(x, fl.concat([m, K]))), B = planoDe(difundidaT(y, fl.concat([K, p])));
    const C = mm(A, B, m, K, p, lotes);
    let forma = fl.concat([m, p]);
    if (v1) forma.splice(forma.length - 2, 1);
    if (v2) forma.splice(forma.length - 1, 1);
    if (!forma.length) return C[0];
    return deReales(forma, C);
  }, 'multLotes(A, B) — producto de matrices por lotes: los dos últimos ejes son la matriz y los de delante se difunden · como «por» pero para pilas de matrices, en la GPU si es grande');

  // ════════════════════════════════════════════ álgebra lineal avanzada
  // Valores propios GENERALES. Es el algoritmo de EISPACK (orthes + hqr2) en
  // la forma en que lo publicó JAMA: reducción a Hessenberg con reflexiones de
  // Householder y después QR con el doble desplazamiento de Francis, que es lo
  // que deja trabajar en reales y aun así encontrar los pares complejos (un
  // bloque de 2×2 por par). Es el método de los libros y el de LAPACK en
  // espíritu; «autoSimetrica» de numerico sigue siendo mejor para simétricas.
  function hessenbergDe(A, n) {
    const H = [], V = [];
    for (let i = 0; i < n; i++) { H.push(Float64Array.from(A.subarray(i * n, i * n + n))); V.push(new Float64Array(n)); }
    const ort = new Float64Array(n), low = 0, high = n - 1;
    for (let m = low + 1; m <= high - 1; m++) {
      let escala = 0;
      for (let i = m; i <= high; i++) escala += Math.abs(H[i][m - 1]);
      if (escala === 0) continue;
      let h = 0;
      for (let i = high; i >= m; i--) { ort[i] = H[i][m - 1] / escala; h += ort[i] * ort[i]; }
      let g = Math.sqrt(h);
      if (ort[m] > 0) g = -g;
      h -= ort[m] * g;
      ort[m] -= g;
      for (let j = m; j < n; j++) {
        let f = 0;
        for (let i = high; i >= m; i--) f += ort[i] * H[i][j];
        f /= h;
        for (let i = m; i <= high; i++) H[i][j] -= f * ort[i];
      }
      for (let i = 0; i <= high; i++) {
        let f = 0;
        for (let j = high; j >= m; j--) f += ort[j] * H[i][j];
        f /= h;
        for (let j = m; j <= high; j++) H[i][j] -= f * ort[j];
      }
      ort[m] *= escala;
      H[m][m - 1] = escala * g;
    }
    for (let i = 0; i < n; i++) V[i][i] = 1;
    for (let m = high - 1; m >= low + 1; m--) {
      if (H[m][m - 1] === 0) continue;
      for (let i = m + 1; i <= high; i++) ort[i] = H[i][m - 1];
      for (let j = m; j <= high; j++) {
        let g = 0;
        for (let i = m; i <= high; i++) g += ort[i] * V[i][j];
        g = (g / ort[m]) / H[m][m - 1];       // dos divisiones: así no se desborda por abajo
        for (let i = m; i <= high; i++) V[i][j] += g * ort[i];
      }
    }
    // Lo de debajo de la subdiagonal guardaba los vectores de Householder; ya
    // se usaron y en H tienen que ser ceros.
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) H[i][j] = 0;
    vm.cobrar(n * n * n);
    return { H, V };
  }
  function cdiv(xr, xi, yr, yi) {
    if (Math.abs(yr) > Math.abs(yi)) { const r = yi / yr, d = yr + r * yi; return [(xr + r * xi) / d, (xi - r * xr) / d]; }
    const r = yr / yi, d = yi + r * yr;
    return [(r * xr + xi) / d, (r * xi - xr) / d];
  }
  // QR de Francis sobre la Hessenberg. Con «vectores» hace además la
  // sustitución hacia atrás y deja en V los vectores propios (los de un par
  // complejo, como parte real e imaginaria en dos columnas seguidas). Sin
  // ella, H queda en forma de Schur real y V es la Q de Schur.
  function francis(H, V, n, vectores, quien) {
    const d = new Float64Array(n), e = new Float64Array(n);
    const eps = Math.pow(2, -52), low = 0, high = n - 1, nn = n;
    let exshift = 0, p = 0, q = 0, r = 0, s = 0, z = 0, t, w, x, y;
    let norma = 0;
    for (let i = 0; i < nn; i++) for (let j = Math.max(i - 1, 0); j < nn; j++) norma += Math.abs(H[i][j]);
    let iter = 0, total = 0;
    n = nn - 1;
    while (n >= low) {
      let l = n;
      while (l > low) {
        s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
        if (s === 0) s = norma;
        if (Math.abs(H[l][l - 1]) < eps * s) break;
        l--;
      }
      if (l === n) {                                   // una raíz
        H[n][n] += exshift; d[n] = H[n][n]; e[n] = 0; n--; iter = 0;
      } else if (l === n - 1) {                        // dos raíces
        w = H[n][n - 1] * H[n - 1][n];
        p = (H[n - 1][n - 1] - H[n][n]) / 2;
        q = p * p + w;
        z = Math.sqrt(Math.abs(q));
        H[n][n] += exshift; H[n - 1][n - 1] += exshift;
        x = H[n][n];
        if (q >= 0) {                                  // par real: se separa con una rotación
          z = p >= 0 ? p + z : p - z;
          d[n - 1] = x + z; d[n] = d[n - 1];
          if (z !== 0) d[n] = x - w / z;
          e[n - 1] = 0; e[n] = 0;
          x = H[n][n - 1];
          s = Math.abs(x) + Math.abs(z);
          p = x / s; q = z / s;
          r = Math.sqrt(p * p + q * q);
          p /= r; q /= r;
          for (let j = n - 1; j < nn; j++) { z = H[n - 1][j]; H[n - 1][j] = q * z + p * H[n][j]; H[n][j] = q * H[n][j] - p * z; }
          for (let i = 0; i <= n; i++) { z = H[i][n - 1]; H[i][n - 1] = q * z + p * H[i][n]; H[i][n] = q * H[i][n] - p * z; }
          for (let i = low; i <= high; i++) { z = V[i][n - 1]; V[i][n - 1] = q * z + p * V[i][n]; V[i][n] = q * V[i][n] - p * z; }
        } else {                                       // par complejo conjugado
          d[n - 1] = x + p; d[n] = x + p; e[n - 1] = z; e[n] = -z;
        }
        n -= 2; iter = 0;
      } else {                                         // todavía no: un paso doble
        x = H[n][n]; y = 0; w = 0;
        if (l < n) { y = H[n - 1][n - 1]; w = H[n][n - 1] * H[n - 1][n]; }
        // Los desplazamientos excepcionales (el de Wilkinson a las 10 vueltas
        // y el de MATLAB a las 30) rompen los ciclos en los que el QR de
        // Francis puede quedarse dando vueltas sin converger.
        if (iter === 10) {
          exshift += x;
          for (let i = low; i <= n; i++) H[i][i] -= x;
          s = Math.abs(H[n][n - 1]) + Math.abs(H[n - 1][n - 2]);
          x = y = 0.75 * s;
          w = -0.4375 * s * s;
        }
        if (iter === 30) {
          s = (y - x) / 2;
          s = s * s + w;
          if (s > 0) {
            s = Math.sqrt(s);
            if (y < x) s = -s;
            s = x - w / ((y - x) / 2 + s);
            for (let i = low; i <= n; i++) H[i][i] -= s;
            exshift += s;
            x = y = w = 0.964;
          }
        }
        iter++; total++;
        if (iter > 200 || total > 100 * nn + 1000)
          vm.error(`«${quien}»: el QR de Francis no converge después de ${total} pasos`,
            'pasa con matrices muy mal escaladas; prueba a dividir la matriz entre su norma, o comprueba que no tenga NaN o infinitos');
        let m = n - 2;
        while (m >= l) {
          z = H[m][m];
          r = x - z; s = y - z;
          p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
          q = H[m + 1][m + 1] - z - r - s;
          r = H[m + 2][m + 1];
          s = Math.abs(p) + Math.abs(q) + Math.abs(r);
          p /= s; q /= s; r /= s;
          if (m === l) break;
          if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) <
              eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) break;
          m--;
        }
        for (let i = m + 2; i <= n; i++) { H[i][i - 2] = 0; if (i > m + 2) H[i][i - 3] = 0; }
        for (let k = m; k <= n - 1; k++) {
          const notlast = k !== n - 1;
          if (k !== m) {
            p = H[k][k - 1]; q = H[k + 1][k - 1]; r = notlast ? H[k + 2][k - 1] : 0;
            x = Math.abs(p) + Math.abs(q) + Math.abs(r);
            if (x === 0) continue;
            p /= x; q /= x; r /= x;
          }
          s = Math.sqrt(p * p + q * q + r * r);
          if (p < 0) s = -s;
          if (s !== 0) {
            if (k !== m) H[k][k - 1] = -s * x;
            else if (l !== m) H[k][k - 1] = -H[k][k - 1];
            p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
            for (let j = k; j < nn; j++) {
              p = H[k][j] + q * H[k + 1][j];
              if (notlast) { p += r * H[k + 2][j]; H[k + 2][j] -= p * z; }
              H[k][j] -= p * x; H[k + 1][j] -= p * y;
            }
            for (let i = 0; i <= Math.min(n, k + 3); i++) {
              p = x * H[i][k] + y * H[i][k + 1];
              if (notlast) { p += z * H[i][k + 2]; H[i][k + 2] -= p * r; }
              H[i][k] -= p; H[i][k + 1] -= p * q;
            }
            for (let i = low; i <= high; i++) {
              p = x * V[i][k] + y * V[i][k + 1];
              if (notlast) { p += z * V[i][k + 2]; V[i][k + 2] -= p * r; }
              V[i][k] -= p; V[i][k + 1] -= p * q;
            }
          }
        }
      }
    }
    vm.cobrar(total * nn * nn);
    if (!vectores || norma === 0) return { d, e };
    // Sustitución hacia atrás sobre la forma triangular (por bloques).
    for (n = nn - 1; n >= 0; n--) {
      p = d[n]; q = e[n];
      if (q === 0) {
        let l = n;
        H[n][n] = 1;
        for (let i = n - 1; i >= 0; i--) {
          w = H[i][i] - p; r = 0;
          for (let j = l; j <= n; j++) r += H[i][j] * H[j][n];
          if (e[i] < 0) { z = w; s = r; }
          else {
            l = i;
            if (e[i] === 0) H[i][n] = w !== 0 ? -r / w : -r / (eps * norma);
            else {
              x = H[i][i + 1]; y = H[i + 1][i];
              q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
              t = (x * s - z * r) / q;
              H[i][n] = t;
              H[i + 1][n] = Math.abs(x) > Math.abs(z) ? (-r - w * t) / x : (-s - y * t) / z;
            }
            t = Math.abs(H[i][n]);
            if ((eps * t) * t > 1) for (let j = i; j <= n; j++) H[j][n] /= t;
          }
        }
      } else if (q < 0) {
        let l = n - 1;
        if (Math.abs(H[n][n - 1]) > Math.abs(H[n - 1][n])) {
          H[n - 1][n - 1] = q / H[n][n - 1];
          H[n - 1][n] = -(H[n][n] - p) / H[n][n - 1];
        } else {
          const c = cdiv(0, -H[n - 1][n], H[n - 1][n - 1] - p, q);
          H[n - 1][n - 1] = c[0]; H[n - 1][n] = c[1];
        }
        H[n][n - 1] = 0; H[n][n] = 1;
        for (let i = n - 2; i >= 0; i--) {
          let ra = 0, sa = 0;
          for (let j = l; j <= n; j++) { ra += H[i][j] * H[j][n - 1]; sa += H[i][j] * H[j][n]; }
          w = H[i][i] - p;
          if (e[i] < 0) { z = w; r = ra; s = sa; }
          else {
            l = i;
            if (e[i] === 0) { const c = cdiv(-ra, -sa, w, q); H[i][n - 1] = c[0]; H[i][n] = c[1]; }
            else {
              x = H[i][i + 1]; y = H[i + 1][i];
              let vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
              const vi = (d[i] - p) * 2 * q;
              if (vr === 0 && vi === 0) vr = eps * norma * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
              const c = cdiv(x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi);
              H[i][n - 1] = c[0]; H[i][n] = c[1];
              if (Math.abs(x) > Math.abs(z) + Math.abs(q)) {
                H[i + 1][n - 1] = (-ra - w * H[i][n - 1] + q * H[i][n]) / x;
                H[i + 1][n] = (-sa - w * H[i][n] - q * H[i][n - 1]) / x;
              } else {
                const c2 = cdiv(-r - y * H[i][n - 1], -s - y * H[i][n], z, q);
                H[i + 1][n - 1] = c2[0]; H[i + 1][n] = c2[1];
              }
            }
            t = Math.max(Math.abs(H[i][n - 1]), Math.abs(H[i][n]));
            if ((eps * t) * t > 1) for (let j = i; j <= n; j++) { H[j][n - 1] /= t; H[j][n] /= t; }
          }
        }
      }
    }
    for (let j = nn - 1; j >= low; j--)
      for (let i = low; i <= high; i++) {
        z = 0;
        for (let k = low; k <= Math.min(j, high); k++) z += V[i][k] * H[k][j];
        V[i][j] = z;
      }
    return { d, e };
  }
  const aFilas = (M, n) => { const o = new Float64Array(n * n); for (let i = 0; i < n; i++) o.set(M[i], i * n); return o; };
  const sinNoFinitos = (d, quien) => {
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i]))
      vm.error(`«${quien}»: la matriz tiene un ${Number.isNaN(d[i]) ? 'NaN' : 'infinito'} en la posición ${i}`, 'límpiala antes con aCero');
  };
  // El orden: de mayor a menor parte real, y en un par conjugado primero el de
  // parte imaginaria positiva. Así el resultado no depende del orden en que el
  // QR fue encontrando los valores.
  function propiosDe(A, n, quien, conVectores) {
    sinNoFinitos(A, quien);
    const { H, V } = hessenbergDe(A, n);
    const { d, e } = francis(H, V, n, conVectores, quien);
    const orden = Array.from({ length: n }, (_, i) => i).sort((p, q) => (d[q] - d[p]) || (e[q] - e[p]) || (p - q));
    return { d, e, V, orden };
  }
  def('formaHessenberg', 'arreglo|lista -> dic', a => {
    const A = cuadrada(a[0], 1, 'formaHessenberg'), n = A.forma[0], d0 = planoDe(A);
    sinNoFinitos(d0, 'formaHessenberg');
    const { H, V } = hessenbergDe(d0, n);
    const r = D();
    r.mapa.set('H', deReales([n, n], aFilas(H, n))); r.mapa.set('Q', deReales([n, n], aFilas(V, n)));
    return r;
  }, 'formaHessenberg(A) — {"H","Q"} con A = Q·H·Qᵀ, Q ortogonal y H con ceros debajo de la subdiagonal · el primer paso de los valores propios');
  def('factorSchur', 'arreglo|lista -> dic', a => {
    const A = cuadrada(a[0], 1, 'factorSchur'), n = A.forma[0], d0 = planoDe(A);
    sinNoFinitos(d0, 'factorSchur');
    const { H, V } = hessenbergDe(d0, n);
    const { e } = francis(H, V, n, false, 'factorSchur');
    // Los restos diminutos de la subdiagonal se ponen a cero salvo en los
    // bloques 2×2 de los pares complejos, que son parte de la forma.
    for (let i = 1; i < n; i++) if (!(e[i - 1] > 0 && e[i] < 0)) H[i][i - 1] = 0;
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) H[i][j] = 0;
    const r = D();
    r.mapa.set('T', deReales([n, n], aFilas(H, n))); r.mapa.set('Q', deReales([n, n], aFilas(V, n)));
    return r;
  }, 'factorSchur(A) — {"T","Q"} con A = Q·T·Qᵀ: T casi triangular (un bloque 2×2 por cada par de valores propios complejos) · la forma estable de la que salen los valores propios');
  function valoresC(d, e, orden) {
    const n = d.length, complejos = orden.some(i => e[i] !== 0);
    if (!complejos) { const o = new Float64Array(n); orden.forEach((i, k) => { o[k] = d[i]; }); return deReales([n], o); }
    const o = new Float64Array(2 * n);
    orden.forEach((i, k) => { o[2 * k] = d[i]; o[2 * k + 1] = e[i]; });
    return deComplejos([n], o);
  }
  def('autovaloresGeneral', 'arreglo|lista -> arreglo', a => {
    const A = cuadrada(a[0], 1, 'autovaloresGeneral'), n = A.forma[0];
    const { d, e, orden } = propiosDe(planoDe(A), n, 'autovaloresGeneral', false);
    return valoresC(d, e, orden);
  }, 'autovaloresGeneral(A) — los valores propios de CUALQUIER matriz cuadrada, por Hessenberg y QR de Francis · reales si todos lo son, complejos si hay pares conjugados (una rotación da ±i)');
  def('autovectoresGeneral', 'arreglo|lista -> dic', a => {
    const A = cuadrada(a[0], 1, 'autovectoresGeneral'), n = A.forma[0];
    const { d, e, V, orden } = propiosDe(planoDe(A), n, 'autovectoresGeneral', true);
    const complejos = orden.some(i => e[i] !== 0);
    // Cada vector propio, normalizado a largo 1. En un par complejo, el de
    // parte imaginaria positiva es V[:,j] + i·V[:,j+1] y su pareja el conjugado.
    const col = new Float64Array(2 * n * n);
    for (let j = 0; j < n; j++) {
      let vr, vi;
      if (e[j] === 0) { vr = V.map(f => f[j]); vi = new Array(n).fill(0); }
      else if (e[j] > 0) { vr = V.map(f => f[j]); vi = V.map(f => f[j + 1]); }
      else { vr = V.map(f => f[j - 1]); vi = V.map(f => -f[j]); }
      let s = 0;
      for (let i = 0; i < n; i++) s += vr[i] * vr[i] + vi[i] * vi[i];
      s = Math.sqrt(s) || 1;
      for (let i = 0; i < n; i++) { col[2 * (j * n + i)] = vr[i] / s; col[2 * (j * n + i) + 1] = vi[i] / s; }
    }
    const out = new Float64Array((complejos ? 2 : 1) * n * n);
    orden.forEach((j, k) => {
      for (let i = 0; i < n; i++) {
        if (complejos) { out[2 * (i * n + k)] = col[2 * (j * n + i)]; out[2 * (i * n + k) + 1] = col[2 * (j * n + i) + 1]; }
        else out[i * n + k] = col[2 * (j * n + i)];
      }
    });
    const r = D();
    r.mapa.set('valores', valoresC(d, e, orden));
    r.mapa.set('vectores', complejos ? deComplejos([n, n], out) : deReales([n, n], out));
    return r;
  }, 'autovectoresGeneral(A) — {"valores","vectores"}: cada COLUMNA de vectores cumple A·v = λ·v y tiene largo 1 · complejos cuando hace falta · en matrices defectuosas los vectores de un valor repetido salen casi paralelos');
  def('radioEspectral', 'arreglo|lista -> real', a => {
    const A = cuadrada(a[0], 1, 'radioEspectral'), n = A.forma[0];
    const { d, e } = propiosDe(planoDe(A), n, 'radioEspectral', false);
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(d[i], e[i]));
    return r;
  }, 'radioEspectral(A) — el mayor módulo de sus valores propios · menor que 1 quiere decir que A^k tiende a cero y que Jacobi o Gauss-Seidel con esa matriz de iteración convergen');

  // exp(A) por Padé de grado 13 con escalado y cuadratura (Higham 2005, el
  // método de «expm» de MATLAB y de SciPy). Se divide A entre 2^s hasta que
  // su norma es pequeña, ahí el aproximante de Padé es exacto a precisión de
  // máquina, y luego se eleva al cuadrado s veces. Las series de Taylor a
  // secas pierden todas las cifras con matrices de norma grande.
  const PADE13 = [64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000,
    10559470521600, 670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1];
  function expP(A0, n) {
    const nrm = norma1(A0, n);
    const s = nrm > 5.371920351148152 ? Math.ceil(Math.log2(nrm / 5.371920351148152)) : 0;
    const A = A0.map(v => v / Math.pow(2, s));
    const I = identidadP(n), b = PADE13;
    const A2 = mm(A, A, n, n, n), A4 = mm(A2, A2, n, n, n), A6 = mm(A4, A2, n, n, n);
    const comb = (c6, c4, c2, c0) => { const o = new Float64Array(n * n); for (let i = 0; i < n * n; i++) o[i] = c6 * A6[i] + c4 * A4[i] + c2 * A2[i] + c0 * I[i]; return o; };
    const t1 = mm(A6, comb(b[13], b[11], b[9], 0), n, n, n), t2 = comb(b[7], b[5], b[3], b[1]);
    for (let i = 0; i < n * n; i++) t1[i] += t2[i];
    const U = mm(A, t1, n, n, n);
    const v1 = mm(A6, comb(b[12], b[10], b[8], 0), n, n, n), v2 = comb(b[6], b[4], b[2], b[0]);
    for (let i = 0; i < n * n; i++) v1[i] += v2[i];
    const P = new Float64Array(n * n), Q = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) { P[i] = v1[i] + U[i]; Q[i] = v1[i] - U[i]; }
    let R = resolverP(Q, P, n, n);
    for (let k = 0; k < s; k++) R = mm(R, R, n, n, n);
    return R;
  }
  def('exponencialMatriz', 'arreglo|lista -> arreglo', a => {
    const A = cuadrada(a[0], 1, 'exponencialMatriz'), n = A.forma[0], d = planoDe(A);
    sinNoFinitos(d, 'exponencialMatriz');
    return deReales([n, n], expP(d, n));
  }, 'exponencialMatriz(A) — e^A = I + A + A²/2! + … por Padé 13 con escalado y cuadratura · la solución de x\' = A·x es exponencialMatriz(A·t)·x₀');

  // Antes de una raíz o un logaritmo se miran los valores propios: con uno
  // real negativo (o cero) no hay raíz ni logaritmo reales, y los métodos
  // iterativos dan vueltas sin converger o devuelven basura.
  function sinNegativos(d0, n, quien, que) {
    const { d, e } = propiosDe(d0, n, quien, false);
    const escala = Math.max(1e-300, ...Array.from(d).map(Math.abs));
    for (let i = 0; i < n; i++) {
      if (Math.abs(e[i]) > 1e-12 * escala) continue;
      if (d[i] < 0) vm.error(`«${quien}»: la matriz tiene el valor propio real negativo ${d[i]}, y ${que} no es real`,
        'el resultado complejo existe, pero Ñ todavía no hace funciones de matrices complejas');
      if (Math.abs(d[i]) <= 1e-14 * escala) vm.error(`«${quien}»: la matriz es singular (tiene un valor propio en 0) y ${que} no está definida`);
    }
  }
  // Denman–Beavers con escalado por el determinante: Y → √A y Z → √A⁻¹ a la
  // vez. Es la iteración de Newton reescrita para que sea estable (la de
  // Newton a secas amplifica los errores de redondeo y diverge).
  function raizP(A, n, quien) {
    let Y = Float64Array.from(A), Z = identidadP(n);
    for (let k = 0; k < 100; k++) {
      const Yi = inversaP(Y, n, quien), Zi = inversaP(Z, n, quien);
      // El escalado solo en las primeras vueltas: acelera muchísimo cuando la
      // matriz está lejos de la identidad, y cerca del final estorbaría.
      let mu = 1;
      if (k < 10) {
        const dy = deNumerico('determinanteA', [deReales([n, n], Y)]), dz = deNumerico('determinanteA', [deReales([n, n], Z)]);
        const pr = Math.abs(dy * dz);
        if (pr > 0 && Number.isFinite(pr)) mu = Math.pow(pr, -1 / (2 * n));
      }
      const Y2 = new Float64Array(n * n), Z2 = new Float64Array(n * n);
      for (let i = 0; i < n * n; i++) { Y2[i] = 0.5 * (mu * Y[i] + Zi[i] / mu); Z2[i] = 0.5 * (mu * Z[i] + Yi[i] / mu); }
      let dif = 0;
      for (let i = 0; i < n * n; i++) dif += (Y2[i] - Y[i]) * (Y2[i] - Y[i]);
      Y = Y2; Z = Z2;
      if (Math.sqrt(dif) <= 1e-14 * normaF(Y) && mu === 1) return Y;
      if (Math.sqrt(dif) <= 1e-15 * normaF(Y)) return Y;
    }
    return vm.error(`«${quien}»: la iteración de Denman–Beavers no converge en 100 pasos`,
      'suele pasar con matrices casi singulares o con valores propios muy cerca del eje real negativo');
  }
  def('raizMatriz', 'arreglo|lista -> arreglo', a => {
    const A = cuadrada(a[0], 1, 'raizMatriz'), n = A.forma[0], d = planoDe(A);
    sinNoFinitos(d, 'raizMatriz');
    sinNegativos(d, n, 'raizMatriz', 'su raíz');
    return deReales([n, n], raizP(d, n, 'raizMatriz'));
  }, 'raizMatriz(A) — la raíz principal X con X·X = A, por Denman–Beavers · exige que A no tenga valores propios reales negativos ni nulos');
  def('logaritmoMatriz', 'arreglo|lista -> arreglo', a => {
    const A = cuadrada(a[0], 1, 'logaritmoMatriz'), n = A.forma[0];
    let X = planoDe(A);
    sinNoFinitos(X, 'logaritmoMatriz');
    sinNegativos(X, n, 'logaritmoMatriz', 'su logaritmo');
    // Escalado inverso y cuadratura: raíces sucesivas hasta que X está cerca
    // de I (log de X^(1/2^k) = log(X)/2^k), y ahí la serie de artanh,
    // log X = 2·Σ Z^(2j+1)/(2j+1) con Z = (X − I)(X + I)⁻¹, converge rápido.
    const I = identidadP(n);
    let k = 0;
    const dist = M => { const D2 = new Float64Array(n * n); for (let i = 0; i < n * n; i++) D2[i] = M[i] - I[i]; return norma1(D2, n); };
    while (dist(X) > 0.25 && k < 60) { X = raizP(X, n, 'logaritmoMatriz'); k++; }
    const Xm = new Float64Array(n * n), Xp = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) { Xm[i] = X[i] - I[i]; Xp[i] = X[i] + I[i]; }
    const Z = resolverP(Xp, Xm, n, n);           // (X+I) y (X−I) conmutan
    const Z2 = mm(Z, Z, n, n, n);
    const suma = Float64Array.from(Z);
    let P = Z;
    for (let j = 1; j < 60; j++) {
      P = mm(P, Z2, n, n, n);
      let nt = 0;
      for (let i = 0; i < n * n; i++) { const t = P[i] / (2 * j + 1); suma[i] += t; nt += t * t; }
      if (Math.sqrt(nt) <= 1e-17 * (normaF(suma) || 1)) break;
    }
    const f = 2 * Math.pow(2, k);
    for (let i = 0; i < n * n; i++) suma[i] *= f;
    return deReales([n, n], suma);
  }, 'logaritmoMatriz(A) — el logaritmo principal L con exponencialMatriz(L) = A, por escalado inverso y cuadratura · exige que A no tenga valores propios reales negativos ni nulos');

  // Núcleo e imagen: por la SVD de numerico. Es la única forma fiable de
  // decidir qué es «cero» con números con coma: los valores singulares por
  // debajo de la tolerancia cuentan como cero.
  function svdTol(a, quien) {
    const A = mat2(a[0], 1, quien);
    const r = deNumerico('descomponerSVD', [A]);
    const S = r.mapa.get('S').datos, nf = A.forma[0], nc = A.forma[1];
    const tol = a.length > 1 ? num(a[1], 2, quien) : Math.max(nf, nc) * EPS * (S[0] || 0);
    return { U: r.mapa.get('U').datos, S, V: r.mapa.get('V').datos, nf, nc, tol };
  }
  def('nucleoMatriz', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«nucleoMatriz» toma la matriz y, si quieres, la tolerancia');
    const { S, V, nc, tol } = svdTol(a, 'nucleoMatriz');
    const cols = [];
    for (let k = 0; k < nc; k++) if (!(S[k] > tol)) cols.push(k);
    const out = new Float64Array(nc * cols.length);
    for (let i = 0; i < nc; i++) cols.forEach((k, j) => { out[i * cols.length + j] = V[i * nc + k]; });
    return deReales([nc, cols.length], out);
  }, 'nucleoMatriz(A, tol?) — una base ortonormal (en columnas) de los x con A·x = 0, por SVD · sin columnas si solo el 0 lo cumple');
  def('imagenMatriz', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«imagenMatriz» toma la matriz y, si quieres, la tolerancia');
    const { U, S, nf, nc, tol } = svdTol(a, 'imagenMatriz');
    const cols = [];
    for (let k = 0; k < nc; k++) if (S[k] > tol) cols.push(k);
    const out = new Float64Array(nf * cols.length);
    for (let i = 0; i < nf; i++) cols.forEach((k, j) => { out[i * cols.length + j] = U[i * nc + k]; });
    return deReales([nf, cols.length], out);
  }, 'imagenMatriz(A, tol?) — una base ortonormal (en columnas) del espacio que generan las columnas de A · tantas columnas como el rango');
  def('gramSchmidt', 'arreglo|lista -> dic', a => {
    const A = mat2(a[0], 1, 'gramSchmidt'), nf = A.forma[0], nc = A.forma[1], d = planoDe(A);
    if (nc > nf) vm.error(`«gramSchmidt»: hay ${nc} columnas en un espacio de ${nf} dimensiones, así que no pueden ser independientes`);
    // Gram-Schmidt MODIFICADO: cada proyección se resta en cuanto se calcula,
    // sobre el vector ya corregido. El clásico calcula todas contra el
    // original y pierde la ortogonalidad cuando las columnas se parecen.
    const Q = new Float64Array(nf * nc), R = new Float64Array(nc * nc), v = new Float64Array(nf);
    for (let j = 0; j < nc; j++) {
      let n0 = 0;
      for (let i = 0; i < nf; i++) { v[i] = d[i * nc + j]; n0 += v[i] * v[i]; }
      n0 = Math.sqrt(n0);
      for (let k = 0; k < j; k++) {
        let s = 0;
        for (let i = 0; i < nf; i++) s += Q[i * nc + k] * v[i];
        R[k * nc + j] = s;
        for (let i = 0; i < nf; i++) v[i] -= s * Q[i * nc + k];
      }
      let nv = 0;
      for (let i = 0; i < nf; i++) nv += v[i] * v[i];
      nv = Math.sqrt(nv);
      if (nv <= 1e-12 * (n0 || 1))
        vm.error(`«gramSchmidt»: la columna ${j} depende de las anteriores`, 'quítala, o usa imagenMatriz, que aguanta columnas dependientes');
      R[j * nc + j] = nv;
      for (let i = 0; i < nf; i++) Q[i * nc + j] = v[i] / nv;
    }
    vm.cobrar(nf * nc * nc);
    const r = D();
    r.mapa.set('Q', deReales([nf, nc], Q)); r.mapa.set('R', deReales([nc, nc], R));
    return r;
  }, 'gramSchmidt(A) — {"Q","R"}: Q con columnas ortonormales que generan lo mismo que las de A, y A = Q·R · Gram-Schmidt modificado');
  const simetricaP = (d, n) => { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(d[i * n + j] - d[j * n + i]) > 1e-9 * (1 + Math.abs(d[i * n + j]))) return false; return true; };
  def('factorLDL', 'arreglo|lista -> dic', a => {
    const A = cuadrada(a[0], 1, 'factorLDL'), n = A.forma[0], d = planoDe(A);
    if (!simetricaP(d, n)) vm.error('«factorLDL» necesita una matriz simétrica', 'para una cualquiera usa factorLU');
    // Como Cholesky pero sin raíces: vale también para simétricas que no son
    // definidas positivas (D puede tener negativos). Sin pivoteo, así que un
    // cero en D lo para.
    const Lm = new Float64Array(n * n), Dv = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let s = d[j * n + j];
      for (let k = 0; k < j; k++) s -= Lm[j * n + k] * Lm[j * n + k] * Dv[k];
      Dv[j] = s;
      Lm[j * n + j] = 1;
      if (Math.abs(s) <= 1e-14 * (1 + Math.abs(d[j * n + j])))
        vm.error(`«factorLDL»: el pivote ${j} es cero y LDLᵀ sin pivoteo no existe para esta matriz`, 'usa factorLU, que pivota');
      for (let i = j + 1; i < n; i++) {
        let t = d[i * n + j];
        for (let k = 0; k < j; k++) t -= Lm[i * n + k] * Lm[j * n + k] * Dv[k];
        Lm[i * n + j] = t / s;
      }
    }
    vm.cobrar(n * n * n);
    const r = D();
    r.mapa.set('L', deReales([n, n], Lm)); r.mapa.set('D', deReales([n], Dv));
    return r;
  }, 'factorLDL(A) — {"L","D"} con A = L·diagonal(D)·Lᵀ y L con unos en la diagonal · como Cholesky pero sin raíces, y vale para simétricas indefinidas');

  // Los iterativos. Sirven cuando A es grande y casi toda ceros, o cuando
  // basta una solución aproximada: cada paso es un producto matriz-vector.
  function argsIterativo(a, quien) {
    if (a.length < 2 || a.length > 4) vm.error(`«${quien}» toma A, b y, si quieres, la tolerancia y el máximo de iteraciones`);
    const A = cuadrada(a[0], 1, quien), n = A.forma[0], b = vector(a[1], 2, quien);
    if (b.tamano !== n) vm.error(`«${quien}»: la matriz es ${n}×${n} y el vector tiene ${b.tamano}`);
    const tol = a.length > 2 ? num(a[2], 3, quien) : 1e-10;
    const maxIt = a.length > 3 ? ent(a[3], 4, quien) : Math.max(1000, 10 * n);
    const bd = planoDe(b);
    let nb = 0;
    for (let i = 0; i < n; i++) nb += bd[i] * bd[i];
    return { A: planoDe(A), n, b: bd, tol, maxIt, nb: Math.sqrt(nb) };
  }
  def('resolverGradienteConjugado', '... -> arreglo', a => {
    const { A, n, b, tol, maxIt, nb } = argsIterativo(a, 'resolverGradienteConjugado');
    if (!simetricaP(A, n)) vm.error('«resolverGradienteConjugado» necesita una matriz simétrica', 'para una cualquiera usa resolverA o resolverGaussSeidel');
    const x = new Float64Array(n), r = Float64Array.from(b), p = Float64Array.from(b);
    let rr = 0;
    for (let i = 0; i < n; i++) rr += r[i] * r[i];
    if (nb === 0) return deReales([n], x);
    for (let it = 0; it < maxIt; it++) {
      if (Math.sqrt(rr) <= tol * nb) return deReales([n], x);
      const Ap = mm(A, p, n, n, 1);
      let pAp = 0;
      for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
      if (!(pAp > 0)) vm.error('«resolverGradienteConjugado»: la matriz no es definida positiva (pᵀ·A·p ≤ 0)',
        'el gradiente conjugado solo vale para simétricas definidas positivas; usa resolverA');
      const alfa = rr / pAp;
      let rr2 = 0;
      for (let i = 0; i < n; i++) { x[i] += alfa * p[i]; r[i] -= alfa * Ap[i]; rr2 += r[i] * r[i]; }
      const beta = rr2 / rr;
      for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
      rr = rr2;
    }
    if (Math.sqrt(rr) <= tol * nb) return deReales([n], x);
    return vm.error(`«resolverGradienteConjugado»: no converge en ${maxIt} iteraciones (el residuo relativo es ${(Math.sqrt(rr) / nb).toExponential(2)})`,
      'sube el máximo de iteraciones (cuarto argumento) o afloja la tolerancia (tercero); una matriz muy mal condicionada converge muy despacio');
  }, 'resolverGradienteConjugado(A, b, tol?, maxIter?) — la x de A·x = b para A simétrica definida positiva, iterando · en exacto acaba en n pasos · avisa si no converge');
  function iterarClasico(a, quien, seidel) {
    const { A, n, b, tol, maxIt, nb } = argsIterativo(a, quien);
    for (let i = 0; i < n; i++) if (A[i * n + i] === 0)
      vm.error(`«${quien}»: hay un 0 en la diagonal (fila ${i}) y el método divide entre ella`, 'reordena las filas para que la diagonal no tenga ceros');
    let x = new Float64Array(n);
    for (let it = 1; it <= maxIt; it++) {
      const nuevo = seidel ? x : new Float64Array(n);
      let dif = 0, tam = 0;
      for (let i = 0; i < n; i++) {
        let s = b[i];
        for (let j = 0; j < n; j++) if (j !== i) s -= A[i * n + j] * x[j];
        const v = s / A[i * n + i];
        dif = Math.max(dif, Math.abs(v - x[i])); tam = Math.max(tam, Math.abs(v));
        nuevo[i] = v;
      }
      x = nuevo;
      vm.cobrar(n * n);
      if (!Number.isFinite(dif)) break;
      if (dif <= tol * (tam || 1)) {
        let rr = 0;
        for (let i = 0; i < n; i++) { let s = -b[i]; for (let j = 0; j < n; j++) s += A[i * n + j] * x[j]; rr += s * s; }
        if (Math.sqrt(rr) <= Math.max(tol, 1e-12) * (nb || 1) * 1e3) return deReales([n], x);
      }
    }
    return vm.error(`«${quien}»: no converge en ${maxIt} iteraciones`,
      'converge seguro si la matriz es diagonalmente dominante (cada |aᵢᵢ| mayor que la suma del resto de su fila)' +
      (seidel ? ' o simétrica definida positiva' : '') + '; si no, usa resolverA');
  }
  def('resolverGaussSeidel', '... -> arreglo', a => iterarClasico(a, 'resolverGaussSeidel', true),
    'resolverGaussSeidel(A, b, tol?, maxIter?) — la x de A·x = b iterando y usando cada valor nuevo en cuanto se calcula · converge con A diagonalmente dominante o simétrica definida positiva · avisa si no');
  def('resolverJacobi', '... -> arreglo', a => iterarClasico(a, 'resolverJacobi', false),
    'resolverJacobi(A, b, tol?, maxIter?) — como Gauss-Seidel pero cada vuelta usa solo los valores de la anterior: más lento, y cada fila es independiente (paralelizable)');

  // Matrices con nombre propio.
  def('vandermonde', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«vandermonde» toma los puntos y, si quieres, cuántas columnas');
    const x = planoDe(real(vector(a[0], 1, 'vandermonde'), 1, 'vandermonde'));
    const m = a.length > 1 ? ent(a[1], 2, 'vandermonde') : x.length;
    if (m < 0) vm.error('«vandermonde»: las columnas no pueden ser negativas');
    const out = new Float64Array(x.length * m);
    for (let i = 0; i < x.length; i++) { let p = 1; for (let j = 0; j < m; j++) { out[i * m + j] = p; p *= x[i]; } }
    return deReales([x.length, m], out);
  }, 'vandermonde(x, columnas?) — la matriz de potencias CRECIENTES [1, x, x², …] por fila · resolverA(vandermonde(x), y) da el polinomio que pasa por los puntos, de menor a mayor grado');
  def('toeplitz', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«toeplitz» toma la primera columna y, si quieres, la primera fila');
    const c = planoDe(real(vector(a[0], 1, 'toeplitz'), 1, 'toeplitz'));
    const r = a.length > 1 ? planoDe(real(vector(a[1], 2, 'toeplitz'), 2, 'toeplitz')) : c;
    // Como en SciPy: el primer número de la fila se ignora; manda el de la columna.
    const nf = c.length, nc = r.length, out = new Float64Array(nf * nc);
    for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) out[i * nc + j] = i >= j ? c[i - j] : r[j - i];
    return deReales([nf, nc], out);
  }, 'toeplitz(columna, fila?) — la matriz constante a lo largo de cada diagonal · sin fila, simétrica · la de una convolución o una autocorrelación');
  def('hilbert', 'entero -> arreglo', a => {
    const n = ent(a[0], 1, 'hilbert');
    if (n < 1) vm.error('«hilbert»: el tamaño tiene que ser 1 o más');
    const out = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = 1 / (i + j + 1);
    return deReales([n, n], out);
  }, 'hilbert(n) — H[i][j] = 1/(i+j+1) · la matriz mal condicionada de los ejemplos: con n = 12 se pierden 16 cifras al resolver');
  def('matrizRotacion', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«matrizRotacion» toma el ángulo y, para 3D, el eje ("x", "y", "z" o un vector)');
    const t = num(a[0], 1, 'matrizRotacion'), c = Math.cos(t), s = Math.sin(t);
    if (a.length === 1) return deReales([2, 2], Float64Array.of(c, -s, s, c));
    let u;
    if (typeof a[1] === 'string') {
      const ejes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
      u = ejes[a[1]];
      if (!u) vm.error(`«matrizRotacion»: el eje «${a[1]}» no existe`, 'son "x", "y", "z", o un vector de 3 componentes');
    } else {
      u = Array.from(planoDe(real(vector(a[1], 2, 'matrizRotacion'), 2, 'matrizRotacion')));
      if (u.length !== 3) vm.error('«matrizRotacion»: el eje tiene que ser un vector de 3 componentes');
      const nu = Math.hypot(u[0], u[1], u[2]);
      if (nu === 0) vm.error('«matrizRotacion»: el eje no puede ser el vector cero');
      u = u.map(v => v / nu);
    }
    // Rodrigues: R = cos·I + sen·[u]× + (1 − cos)·u·uᵀ.
    const [x, y, z] = u, k = 1 - c;
    return deReales([3, 3], Float64Array.of(
      c + x * x * k, x * y * k - z * s, x * z * k + y * s,
      y * x * k + z * s, c + y * y * k, y * z * k - x * s,
      z * x * k - y * s, z * y * k + x * s, c + z * z * k));
  }, 'matrizRotacion(angulo) — la de 2×2 · matrizRotacion(angulo, "z") o (angulo, [ux, uy, uz]) — la de 3×3 alrededor de ese eje (Rodrigues), en sentido antihorario');

  // ════════════════════════════════════════════ Fourier y señales
  const fourier2DArg = (v, quien) => {
    const x = aArr(v, 1, quien);
    if (x.dimensiones !== 2) vm.error(`«${quien}» trabaja sobre matrices (2 dimensiones) y llegó un arreglo de ${x.dimensiones}`,
      'para una dimensión usa fourier de numerico');
    if (x.tamano === 0) vm.error(`«${quien}» de un arreglo vacío`);
    return x;
  };
  def('fourier2D', 'arreglo|lista -> arreglo', a => {
    const x = fourier2DArg(a[0], 'fourier2D'), M = x.forma[0], N = x.forma[1];
    return deComplejos([M, N], fft2D(planoC(x), M, N, -1));
  }, 'fourier2D(m) — la transformada de una imagen o una matriz: por filas y después por columnas · real o complejo, devuelve complejos · cualquier tamaño');
  def('fourierInversa2D', 'arreglo|lista -> arreglo', a => {
    const x = fourier2DArg(a[0], 'fourierInversa2D'), M = x.forma[0], N = x.forma[1];
    return deComplejos([M, N], dividirTodo(fft2D(planoC(x), M, N, 1), M * N));
  }, 'fourierInversa2D(F) — el camino de vuelta, ya dividido entre el número de datos · fourierInversa2D(fourier2D(m)) devuelve m');
  const senal = (v, n, quien) => {
    const x = vector(v, n, quien);
    if (x.tamano === 0) vm.error(`«${quien}» de una señal vacía`);
    return x;
  };
  def('fourierReal', 'arreglo|lista -> arreglo', a => {
    const x = real(senal(a[0], 1, 'fourierReal'), 1, 'fourierReal'), n = x.tamano;
    const F = fftFilas(aComplejo(planoDe(x)), 1, n, -1), m = Math.floor(n / 2) + 1;
    return deComplejos([m], F.subarray(0, 2 * m));
  }, 'fourierReal(x) — de una señal REAL, solo las frecuencias no negativas: n/2+1 números · las otras son sus conjugadas y no aportan nada');
  def('fourierRealInversa', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«fourierRealInversa» toma el medio espectro y, si quieres, el largo de la señal');
    const X = senal(a[0], 1, 'fourierRealInversa'), m = X.tamano;
    const n = a.length > 1 ? ent(a[1], 2, 'fourierRealInversa') : 2 * (m - 1);
    if (n < 1) vm.error('«fourierRealInversa»: el largo tiene que ser 1 o más');
    if (Math.floor(n / 2) + 1 > m) vm.error(`«fourierRealInversa»: para ${n} datos hacen falta ${Math.floor(n / 2) + 1} frecuencias y hay ${m}`);
    const h = planoC(X), d = new Float64Array(2 * n);
    // Se reconstruye el espectro entero con la simetría de una señal real:
    // X[n−k] = conjugado(X[k]). La parte imaginaria de X[0] (y de X[n/2] si n
    // es par) se ignora, porque en una señal real tiene que ser cero.
    for (let k = 0; k <= Math.floor(n / 2); k++) { d[2 * k] = h[2 * k]; d[2 * k + 1] = h[2 * k + 1]; }
    d[1] = 0;
    if (n % 2 === 0) d[n + 1] = 0;
    for (let k = 1; k < n - Math.floor(n / 2); k++) { d[2 * (n - k)] = h[2 * k]; d[2 * (n - k) + 1] = -h[2 * k + 1]; }
    const y = fftFilas(d, 1, n, 1), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = y[2 * i] / n;
    return deReales([n], out);
  }, 'fourierRealInversa(X, n?) — de vuelta desde fourierReal a una señal real de n datos (por omisión 2·(largo−1), es decir, n par)');
  def('frecuenciasReal', '... -> arreglo', a => {
    if (a.length < 1 || a.length > 2) vm.error('«frecuenciasReal» toma cuántos datos y, si quieres, el paso de muestreo');
    const n = ent(a[0], 1, 'frecuenciasReal'), paso = a.length > 1 ? num(a[1], 2, 'frecuenciasReal') : 1;
    if (n < 1) vm.error('«frecuenciasReal» necesita al menos 1 dato');
    if (paso === 0) vm.error('«frecuenciasReal»: el paso de muestreo no puede ser 0');
    const m = Math.floor(n / 2) + 1, out = new Float64Array(m);
    for (let i = 0; i < m; i++) out[i] = i / (n * paso);
    return deReales([m], out);
  }, 'frecuenciasReal(n, paso?) — el eje de frecuencias de fourierReal: 0, 1/(n·paso), … hasta la de Nyquist');
  function centrar(a, quien, signo) {
    const x = aArr(a[0], 1, quien);
    const ejes = a.length > 1 && a[1] !== null ? ejesDe(x, a[1], quien) : x.forma.map((_, i) => i);
    let t = x;
    for (const e of ejes) {
      const k = signo > 0 ? Math.floor(t.forma[e] / 2) : -Math.floor(t.forma[e] / 2);
      t = new ObjArreglo(rodarPlano(t, k, e), t.forma.slice(), esC(x) ? 'complejo' : 'real');
    }
    return deTipo(x, x.forma, planoDe(t));
  }
  def('centrarFrecuencias', '... -> arreglo', a => centrar(a, 'centrarFrecuencias', 1),
    'centrarFrecuencias(F, eje?) — pone la frecuencia 0 en el centro (fftshift) para dibujar el espectro · en todos los ejes si no dices cuál');
  def('descentrarFrecuencias', '... -> arreglo', a => centrar(a, 'descentrarFrecuencias', -1),
    'descentrarFrecuencias(F, eje?) — deshace centrarFrecuencias (ifftshift), también con largos impares');
  function ventanaDe(tipo, n, simetrica, quien) {
    const w = new Float64Array(n);
    if (n === 1) { w[0] = 1; return w; }
    // Periódica por omisión (denominador n): es la que se quiere para análisis
    // espectral, porque encaja exacta con la FFT. La simétrica (n − 1) es la
    // de diseñar filtros.
    const N = simetrica ? n - 1 : n;
    const c = { hann: [0.5, 0.5, 0], hamming: [0.54, 0.46, 0], blackman: [0.42, 0.5, 0.08] }[tipo];
    for (let i = 0; i < n; i++) {
      if (tipo === 'rectangular') w[i] = 1;
      else if (tipo === 'bartlett') w[i] = 1 - Math.abs((2 * i - N) / N);
      else if (c) w[i] = c[0] - c[1] * Math.cos(2 * Math.PI * i / N) + c[2] * Math.cos(4 * Math.PI * i / N);
      else vm.error(`«${quien}»: la ventana «${tipo}» no existe`, 'son "hann", "hamming", "blackman", "bartlett" y "rectangular"');
    }
    return w;
  }
  def('ventana', '... -> arreglo', a => {
    if (a.length < 2 || a.length > 3) vm.error('«ventana» toma el tipo, el tamaño y, si quieres, si es simétrica');
    const tipo = textoDe(a[0], 1, 'ventana'), n = ent(a[1], 2, 'ventana');
    if (n < 1) vm.error('«ventana»: el tamaño tiene que ser 1 o más');
    return deReales([n], ventanaDe(tipo, n, a.length > 2 && !!a[2], 'ventana'));
  }, 'ventana(tipo, n, simetrica?) — "hann", "hamming", "blackman", "bartlett" o "rectangular" · periódica por omisión (la del análisis espectral); simétrica con verdadero');
  // Los cuadros de una señal, ya multiplicados por la ventana, transformados
  // todos a la vez (una fila cada uno).
  function cuadros(x, tamano, salto, w, quitarMedia) {
    const n = x.length, k = 1 + Math.floor((n - tamano) / salto), d = new Float64Array(k * 2 * tamano);
    for (let f = 0; f < k; f++) {
      let m = 0;
      if (quitarMedia) { for (let i = 0; i < tamano; i++) m += x[f * salto + i]; m /= tamano; }
      for (let i = 0; i < tamano; i++) d[f * 2 * tamano + 2 * i] = (x[f * salto + i] - m) * w[i];
    }
    return { F: fftFilas(d, k, tamano, -1), k };
  }
  def('espectrograma', '... -> arreglo', a => {
    if (a.length < 3 || a.length > 4) vm.error('«espectrograma» toma la señal, el tamaño de cada cuadro, el salto y, si quieres, la ventana');
    const x = planoDe(real(senal(a[0], 1, 'espectrograma'), 1, 'espectrograma'));
    const tam = ent(a[1], 2, 'espectrograma'), salto = ent(a[2], 3, 'espectrograma');
    if (tam < 1 || salto < 1) vm.error('«espectrograma»: el tamaño y el salto tienen que ser 1 o más');
    if (tam > x.length) vm.error(`«espectrograma»: el cuadro (${tam}) es más largo que la señal (${x.length})`);
    const w = ventanaDe(a.length > 3 ? textoDe(a[3], 4, 'espectrograma') : 'hann', tam, false, 'espectrograma');
    const { F, k } = cuadros(x, tam, salto, w, false), m = Math.floor(tam / 2) + 1, out = new Float64Array(k * m);
    for (let f = 0; f < k; f++) for (let j = 0; j < m; j++)
      out[f * m + j] = Math.hypot(F[f * 2 * tam + 2 * j], F[f * 2 * tam + 2 * j + 1]);
    return deReales([k, m], out);
  }, 'espectrograma(senal, tamano, salto, ventana?) — una fila por cuadro y una columna por frecuencia (0 a n/2), con el MÓDULO de su transformada · cómo cambia el espectro con el tiempo');
  def('potenciaEspectral', '... -> dic', a => {
    if (a.length < 1 || a.length > 3) vm.error('«potenciaEspectral» toma la señal y, si quieres, el tamaño de los trozos y la frecuencia de muestreo');
    const x = planoDe(real(senal(a[0], 1, 'potenciaEspectral'), 1, 'potenciaEspectral'));
    const tam = Math.min(a.length > 1 && a[1] !== null ? ent(a[1], 2, 'potenciaEspectral') : 256, x.length);
    const fs = a.length > 2 ? num(a[2], 3, 'potenciaEspectral') : 1;
    if (tam < 1) vm.error('«potenciaEspectral»: el tamaño de los trozos tiene que ser 1 o más');
    if (!(fs > 0)) vm.error('«potenciaEspectral»: la frecuencia de muestreo tiene que ser positiva');
    // Welch: trozos solapados a la mitad, cada uno sin su media y con ventana
    // de Hann, y la media de sus periodogramas. Promediar es lo que quita el
    // ruido que tiene el periodograma de la señal entera, que no mejora por
    // muchos datos que haya. Mismas convenciones que scipy.signal.welch.
    const w = ventanaDe('hann', tam, false, 'potenciaEspectral');
    const salto = tam - Math.floor(tam / 2);
    const { F, k } = cuadros(x, tam, salto, w, true), m = Math.floor(tam / 2) + 1;
    let sw = 0;
    for (let i = 0; i < tam; i++) sw += w[i] * w[i];
    const P = new Float64Array(m), fr = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let f = 0; f < k; f++) { const re = F[f * 2 * tam + 2 * j], im = F[f * 2 * tam + 2 * j + 1]; s += re * re + im * im; }
      const doble = j > 0 && !(tam % 2 === 0 && j === m - 1) ? 2 : 1;
      P[j] = doble * s / k / (fs * sw);
      fr[j] = j * fs / tam;
    }
    const r = D();
    r.mapa.set('frecuencias', deReales([m], fr)); r.mapa.set('potencia', deReales([m], P));
    return r;
  }, 'potenciaEspectral(senal, tamano?, fs?) — {"frecuencias","potencia"}: la densidad espectral por el método de Welch (trozos de 256 solapados a la mitad, Hann) · dónde está la energía de una señal con ruido');
  // Convolución lineal de dos señales complejas por FFT, de largo n+m−1.
  function convolucionC(p, q, n, m) {
    const largo = n + m - 1, T = 1 << Math.ceil(Math.log2(Math.max(1, largo)));
    const A = new Float64Array(2 * T), B = new Float64Array(2 * T);
    A.set(p.subarray(0, 2 * n)); B.set(q.subarray(0, 2 * m));
    const FA = fftFilas(A, 1, T, -1), FB = fftFilas(B, 1, T, -1);
    correr('nen_cmul_filas', T, T, T, FA, FB);
    const R = fftFilas(FA, 1, T, 1);
    return dividirTodo(R.slice(0, 2 * largo), T);
  }
  def('correlacionCruzada', 'arreglo|lista, arreglo|lista -> arreglo', a => {
    const x = senal(a[0], 1, 'correlacionCruzada'), y = senal(a[1], 2, 'correlacionCruzada');
    const n = x.tamano, m = y.tamano, py = planoC(y), rev = new Float64Array(2 * m);
    // Correlar es convolucionar con la otra al revés y conjugada.
    for (let i = 0; i < m; i++) { rev[2 * i] = py[2 * (m - 1 - i)]; rev[2 * i + 1] = -py[2 * (m - 1 - i) + 1]; }
    const c = convolucionC(planoC(x), rev, n, m);
    if (esC(x) || esC(y)) return deComplejos([n + m - 1], c);
    const out = new Float64Array(n + m - 1);
    for (let i = 0; i < out.length; i++) out[i] = c[2 * i];
    return deReales([n + m - 1], out);
  }, 'correlacionCruzada(a, b) — Σ a[n+k]·conj(b[n]) para cada desfase k, de −(largo(b)−1) a largo(a)−1 (n+m−1 números, como NumPy) · dónde se parece más una señal a la otra');
  def('autocorrelacion', 'arreglo|lista -> arreglo', a => {
    const x = planoDe(real(senal(a[0], 1, 'autocorrelacion'), 1, 'autocorrelacion')), n = x.length;
    let m = 0;
    for (let i = 0; i < n; i++) m += x[i];
    m /= n;
    const c = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) c[2 * i] = x[i] - m;
    const rev = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) rev[2 * i] = c[2 * (n - 1 - i)];
    const r = convolucionC(c, rev, n, n), out = new Float64Array(n), r0 = r[2 * (n - 1)];
    if (!(r0 > 0)) vm.error('«autocorrelacion»: la señal es constante y no tiene variación que comparar');
    for (let k = 0; k < n; k++) out[k] = r[2 * (n - 1 + k)] / r0;
    return deReales([n], out);
  }, 'autocorrelacion(x) — cuánto se parece la serie (sin su media) a sí misma desplazada k pasos, de k = 0 (vale 1) a n−1 · los picos son sus periodos');
  // DCT-II ortonormal por una sola FFT de largo n (Makhoul 1980): se reordena
  // x con los pares delante y los impares al revés detrás, y la DCT sale de
  // girar la FFT por e^(−iπk/2n). Ortonormal = la inversa es la transpuesta y
  // se conserva la energía, como en JPEG y en scipy con norm="ortho".
  function dctII(x) {
    const n = x.length, v = new Float64Array(2 * n);
    for (let k = 0; k < Math.ceil(n / 2); k++) v[2 * k] = x[2 * k];
    for (let k = 0; k < Math.floor(n / 2); k++) v[2 * (n - 1 - k)] = x[2 * k + 1];
    const V = fftFilas(v, 1, n, -1), out = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI * k / (2 * n);
      const re = V[2 * k] * Math.cos(ang) - V[2 * k + 1] * Math.sin(ang);
      out[k] = 2 * re * (k === 0 ? Math.sqrt(1 / (4 * n)) : Math.sqrt(1 / (2 * n)));
    }
    return out;
  }
  function dctIII(X) {
    const n = X.length, y = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) y[k] = X[k] / (k === 0 ? Math.sqrt(1 / (4 * n)) : Math.sqrt(1 / (2 * n)));
    // De la DCT sin normalizar a la FFT de la señal reordenada:
    // V[k] = e^(iπk/2n)·(y[k] − i·y[n−k])/2, con y[n] = 0.
    const V = new Float64Array(2 * n);
    for (let k = 0; k < n; k++) {
      const ar = y[k] / 2, ai = k === 0 ? 0 : -y[n - k] / 2, ang = Math.PI * k / (2 * n), c = Math.cos(ang), s = Math.sin(ang);
      V[2 * k] = ar * c - ai * s; V[2 * k + 1] = ar * s + ai * c;
    }
    const v = fftFilas(V, 1, n, 1), out = new Float64Array(n);
    for (let k = 0; k < Math.ceil(n / 2); k++) out[2 * k] = v[2 * k] / n;
    for (let k = 0; k < Math.floor(n / 2); k++) out[2 * k + 1] = v[2 * (n - 1 - k)] / n;
    return out;
  }
  def('transformadaCoseno', 'arreglo|lista -> arreglo', a => {
    const x = real(senal(a[0], 1, 'transformadaCoseno'), 1, 'transformadaCoseno');
    return deReales([x.tamano], dctII(planoDe(x)));
  }, 'transformadaCoseno(x) — la DCT-II ortonormal (la de JPEG y MP3): solo cosenos, sin complejos · concentra la energía en los primeros números');
  def('transformadaCosenoInversa', 'arreglo|lista -> arreglo', a => {
    const X = real(senal(a[0], 1, 'transformadaCosenoInversa'), 1, 'transformadaCosenoInversa');
    return deReales([X.tamano], dctIII(planoDe(X)));
  }, 'transformadaCosenoInversa(X) — la DCT-III ortonormal: transformadaCosenoInversa(transformadaCoseno(x)) devuelve x');
  def('filtrarFrecuencias', '... -> arreglo', a => {
    if (a.length < 3 || a.length > 4) vm.error('«filtrarFrecuencias» toma la señal, el tipo y uno o dos cortes',
      'filtrarFrecuencias(x, "bajos", 0.1) · filtrarFrecuencias(x, "banda", 0.05, 0.2)');
    const x = real(senal(a[0], 1, 'filtrarFrecuencias'), 1, 'filtrarFrecuencias'), n = x.tamano;
    const tipo = textoDe(a[1], 2, 'filtrarFrecuencias');
    const c1 = num(a[2], 3, 'filtrarFrecuencias'), c2 = a.length > 3 ? num(a[3], 4, 'filtrarFrecuencias') : null;
    const doble = tipo === 'banda' || tipo === 'rechazaBanda';
    if (!['bajos', 'altos', 'banda', 'rechazaBanda'].includes(tipo))
      vm.error(`«filtrarFrecuencias»: el tipo «${tipo}» no existe`, 'son "bajos", "altos", "banda" y "rechazaBanda"');
    if (doble && c2 === null) vm.error(`«filtrarFrecuencias»: un filtro «${tipo}» necesita dos cortes (desde y hasta)`);
    if (!doble && c2 !== null) vm.error(`«filtrarFrecuencias»: un filtro «${tipo}» lleva un solo corte`);
    for (const c of [c1, c2]) if (c !== null && (c < 0 || c > 0.5))
      vm.error(`«filtrarFrecuencias»: el corte ${c} se sale de 0 a 0.5`,
        'los cortes van en ciclos por muestra: si mediste en Hz, divide entre la frecuencia de muestreo (0.5 es la de Nyquist)');
    // Un filtro ideal: la transformada, poner a cero lo que no pasa y volver.
    // Es exacto en frecuencia y sencillo de entender; a cambio, en el tiempo
    // produce ondulaciones cerca de los saltos bruscos (el fenómeno de Gibbs).
    const F = fftFilas(aComplejo(planoDe(x)), 1, n, -1);
    for (let k = 0; k < n; k++) {
      const f = Math.abs(k <= (n - 1) / 2 ? k / n : (k - n) / n);
      const pasa = tipo === 'bajos' ? f <= c1 : tipo === 'altos' ? f >= c1
        : tipo === 'banda' ? f >= c1 && f <= c2 : !(f >= c1 && f <= c2);
      if (!pasa) { F[2 * k] = 0; F[2 * k + 1] = 0; }
    }
    const y = fftFilas(F, 1, n, 1), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = y[2 * i] / n;
    return deReales([n], out);
  }, 'filtrarFrecuencias(x, tipo, corte, corte2?) — filtro ideal por Fourier: "bajos", "altos", "banda" o "rechazaBanda", con los cortes en ciclos por muestra (0 a 0.5)');
  def('convolucion2D', '... -> arreglo', a => {
    if (a.length < 2 || a.length > 3) vm.error('«convolucion2D» toma la imagen, el núcleo y, si quieres, el modo');
    const A = mat2(a[0], 1, 'convolucion2D'), B = mat2(a[1], 2, 'convolucion2D');
    const modo = a.length > 2 ? textoDe(a[2], 3, 'convolucion2D') : 'completa';
    const [Ma, Na] = A.forma, [Mb, Nb] = B.forma;
    let Mo, No, oM, oN;
    if (modo === 'completa') { Mo = Ma + Mb - 1; No = Na + Nb - 1; oM = 0; oN = 0; }
    else if (modo === 'misma') { Mo = Ma; No = Na; oM = Math.floor((Mb - 1) / 2); oN = Math.floor((Nb - 1) / 2); }
    else if (modo === 'valida') {
      Mo = Ma - Mb + 1; No = Na - Nb + 1; oM = Mb - 1; oN = Nb - 1;
      if (Mo < 1 || No < 1) vm.error(`«convolucion2D»: en modo "valida" el núcleo (${Mb}×${Nb}) no cabe en la imagen (${Ma}×${Na})`);
    } else vm.error(`«convolucion2D»: el modo «${modo}» no existe`, 'son "completa" (por omisión), "misma" y "valida", como en SciPy');
    if (Ma * Na === 0 || Mb * Nb === 0) vm.error('«convolucion2D» de una matriz vacía');
    const y = new Float64Array(Mo * No);
    correr('nen_conv2d', Mo * No * Mb * Nb, Mo * No, Ma, Na, Mb, Nb, No, oM, oN, planoDe(A), planoDe(B), y);
    return deReales([Mo, No], y);
  }, 'convolucion2D(imagen, nucleo, modo?) — desenfocar, detectar bordes, suavizar una malla · modos "completa", "misma" (del tamaño de la imagen) y "valida" · un hilo de GPU por píxel');
  function analitica(x) {
    const n = x.length, F = fftFilas(aComplejo(x), 1, n, -1);
    // El filtro de Hilbert en frecuencia: dobla las positivas y anula las
    // negativas. Lo que queda es la señal con su versión desfasada 90° como
    // parte imaginaria.
    for (let k = 0; k < n; k++) {
      let h;
      if (k === 0 || (n % 2 === 0 && k === n / 2)) h = 1;
      else if (k < n / 2) h = 2;
      else h = 0;
      F[2 * k] *= h; F[2 * k + 1] *= h;
    }
    return dividirTodo(fftFilas(F, 1, n, 1), n);
  }
  def('senalAnalitica', 'arreglo|lista -> arreglo', a => {
    const x = real(senal(a[0], 1, 'senalAnalitica'), 1, 'senalAnalitica');
    return deComplejos([x.tamano], analitica(planoDe(x)));
  }, 'senalAnalitica(x) — x + i·H(x), con H la transformada de Hilbert · su módulo es la envolvente y su fase la fase instantánea');
  def('envolvente', 'arreglo|lista -> arreglo', a => {
    const x = real(senal(a[0], 1, 'envolvente'), 1, 'envolvente'), d = analitica(planoDe(x)), n = x.tamano, out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.hypot(d[2 * i], d[2 * i + 1]);
    return deReales([n], out);
  }, 'envolvente(x) — el contorno de una señal que oscila: el módulo de su señal analítica · el volumen de un sonido, la amplitud de una vibración');
}

if (typeof module !== 'undefined') module.exports = { instalarNenTensores, NEN_T_NUCLEOS, NEN_T_ULP, NEN_T_UMBRAL, NEN_T_TROZO };
