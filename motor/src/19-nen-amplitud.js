// ============================================================================
//  Ñ v4 — NEÑ: más funciones (motor-exp, fase N1, primera tanda)
//  Parte 19.
//
//  La comparativa con NumPy/SciPy y mpmath dejó a NEÑ corto en funciones
//  especiales, distribuciones y muestreo. Esta es la PRIMERA tanda; cada
//  función está comprobada contra SciPy 1.18 en una rejilla de valores
//  (pruebas/exp-nen.js) y lleva su ejemplo en la referencia.
//
//  ESPECIALES   lambertW, integralExponencial (Ei), integralExponencialE1 (E₁),
//               integralSeno (Si), integralCoseno (Ci), fresnelS, fresnelC,
//               elipticaK, elipticaE, dilogaritmo (Li₂), hipergeometrica (₂F₁),
//               besselI, trigamma, poligamma, sinc
//  DISTRIBUC.   densidad y acumulada de gamma, beta, Weibull, lognormal,
//               Cauchy y logística; densidad de la exponencial, la t, la χ² y
//               la F; probabilidad geométrica, binomial negativa e
//               hipergeométrica
//  MUESTREO     azarExponencial, azarGamma, azarBeta, azarChiCuadrado,
//               azarTStudent, azarPoisson, azarBinomial, azarLogNormal,
//               azarWeibull, azarCauchy — con el azar SEMBRADO de numerico
//               (semilla(7) los repite), y con cantidad devuelven una lista.
//
//  Las siguientes tandas (pendientes, en EXPERIMENTAL.md): Bessel Y y K y de
//  orden real, Airy, funciones de Struve y de Kelvin, la ₁F₁, polilogaritmos de
//  orden s, zeta de Hurwitz, más distribuciones (Pareto, Gumbel, Rayleigh,
//  von Mises, multinomial, Dirichlet), y versiones «…A» sobre arreglos.
// ============================================================================
'use strict';

const NA_EULER = 0.57721566490153286061;
const NA_EPS = 2.220446049250313e-16;

function instalarNenAmplitud(vm, def) {
  const de = (edsl, n) => vm.globals.get(nombreGlobalModulo(claveEdsl(edsl), n));
  const llamar = (edsl, n, args) => de(edsl, n).fn(args, vm);
  const lnGamma = x => llamar('nen', 'lnGamma', [x]);
  const gammaP = (a, x) => llamar('nen', 'gammaIncompleta', [a, x]);
  const betaI = (a, b, x) => llamar('nen', 'betaIncompleta', [a, b, x]);
  const erfc = x => llamar('nen', 'erfc', [x]);
  const digamma = x => llamar('nen', 'digamma', [x]);
  const uniforme = () => llamar('numerico', 'azar', []);
  const normalE = () => llamar('numerico', 'azarNormal', [0, 1]);

  const num = (v, k, quien) => {
    if (typeof v !== 'number') vm.error(`«${quien}»: el argumento ${k} debe ser un número y es ${tipoDe(v)}`);
    return v;
  };
  const ent = (v, k, quien) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) vm.error(`«${quien}»: el argumento ${k} debe ser un entero y es ${repr(v, 1)}`);
    return v;
  };
  const positivo = (v, k, quien, nombre) => {
    num(v, k, quien);
    if (!(v > 0)) vm.error(`«${quien}»: ${nombre || 'el argumento ' + k} debe ser positivo y es ${repr(v, 1)}`);
    return v;
  };
  const prob = (v, k, quien) => {
    num(v, k, quien);
    if (!(v >= 0 && v <= 1)) vm.error(`«${quien}»: la probabilidad debe estar entre 0 y 1 y es ${repr(v, 1)}`);
    return v;
  };
  const real1 = (nombre, fn, doc) => def(nombre, 'real -> real', a => fn(num(a[0], 1, nombre)), doc);

  // ─────────────────────────────────────────────── funciones especiales
  // W de Lambert: la w con w·eʷ = x. Rama 0 (principal, w ≥ −1) o −1 (w ≤ −1).
  def('lambertW', '... -> real', a => {
    const x = num(a[0], 1, 'lambertW');
    const rama = a.length > 1 ? ent(a[1], 2, 'lambertW') : 0;
    if (rama !== 0 && rama !== -1) vm.error('«lambertW»: la rama es 0 (la principal) o −1');
    const minimo = -1 / Math.E;
    if (x < minimo - 1e-15) vm.error(`«lambertW»: W(x) solo es real para x ≥ −1/e (−0,3679…), y llegó ${repr(x, 1)}`);
    if (rama === -1 && x >= 0) vm.error('«lambertW»: la rama −1 solo existe para −1/e ≤ x < 0');
    if (Math.abs(x - minimo) < 1e-15) return -1;
    if (x === 0) return 0;
    let w;
    if (rama === 0) {
      if (x < -0.3) { const p = Math.sqrt(2 * (Math.E * x + 1)); w = -1 + p - p * p / 3 + 11 * p * p * p / 72; }
      else if (x < 3) w = Math.log1p(x) * 0.8;
      else { const L1 = Math.log(x), L2 = Math.log(L1); w = L1 - L2 + L2 / L1; }
    } else {
      if (x < -0.3) { const p = -Math.sqrt(2 * (Math.E * x + 1)); w = -1 + p - p * p / 3 + 11 * p * p * p / 72; }
      else { const L1 = Math.log(-x), L2 = Math.log(-L1); w = L1 - L2 + L2 / L1; }
    }
    for (let i = 0; i < 100; i++) {
      const ew = Math.exp(w), f = w * ew - x;
      const d = ew * (w + 1) - (w + 2) * f / (2 * w + 2);
      const dw = f / d;
      w -= dw;
      if (Math.abs(dw) <= 1e-15 * (1 + Math.abs(w))) break;
    }
    return w;
  }, 'lambertW(x, rama?) — la w con w·eʷ = x · rama 0 (principal) o −1 · lambertW(1) = 0,5671… (la omega)');

  // E₁(x) = ∫ₓ^∞ e^(−t)/t dt, x > 0
  const E1 = x => {
    if (x <= 0) return NaN;
    if (x <= 1) {
      let s = 0, t = 1;
      for (let k = 1; k < 200; k++) { t *= -x / k; const d = t / k; s += d; if (Math.abs(d) < NA_EPS * Math.abs(s)) break; }
      return -NA_EULER - Math.log(x) - s;
    }
    // fracción continua (Lentz)
    let b = x + 1, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * i; b += 2;
      d = 1 / (an * d + b); c = b + an / c;
      const del = c * d; h *= del;
      if (Math.abs(del - 1) < NA_EPS) break;
    }
    return h * Math.exp(-x);
  };
  // Ei(x) = −PV∫₋ₓ^∞ e^(−t)/t dt
  const Ei = x => {
    if (x === 0) return -Infinity;
    if (x < 0) return -E1(-x);
    if (x < 40) {
      let s = 0, t = 1;
      for (let k = 1; k < 500; k++) { t *= x / k; const d = t / k; s += d; if (d < NA_EPS * s) break; }
      return NA_EULER + Math.log(x) + s;
    }
    let s = 1, t = 1;
    for (let k = 1; k < 40; k++) { const t2 = t * k / x; if (t2 > t) break; t = t2; s += t; if (t < NA_EPS) break; }
    return Math.exp(x) / x * s;
  };
  real1('integralExponencial', Ei, 'integralExponencial(x) — Ei(x) = −VP ∫₋ₓ^∞ e^(−t)/t dt · Ei(1) = 1,8951…');
  def('integralExponencialE1', 'real -> real', a => {
    const x = num(a[0], 1, 'integralExponencialE1');
    if (!(x > 0)) vm.error('«integralExponencialE1»: E₁(x) se define para x > 0');
    return E1(x);
  }, 'integralExponencialE1(x) — E₁(x) = ∫ₓ^∞ e^(−t)/t dt, para x > 0 · la caída de una fuente en un pozo, la teoría de Theis');

  // Si y Ci (Numerical Recipes, «cisi»)
  const cisi = x => {
    const t = Math.abs(x);
    if (t === 0) return [0, -Infinity];
    let si, ci;
    if (t > 2) {
      // fracción continua compleja para E₁(it)
      let br = 1, bi = t, cr = 1 / 1e-300, ci2 = 0;
      let dr, di; { const m = br * br + bi * bi; dr = br / m; di = -bi / m; }
      let hr = dr, hi = di;
      for (let i = 2; i < 200; i++) {
        const a = -(i - 1) * (i - 1);
        br += 2;
        // d = 1/(a·d + b)
        let xr = a * dr + br, xi = a * di + bi;
        { const m = xr * xr + xi * xi; dr = xr / m; di = -xi / m; }
        // c = b + a/c
        { const m = cr * cr + ci2 * ci2; const qr = a * cr / m, qi = -a * ci2 / m; cr = br + qr; ci2 = bi + qi; }
        const delr = cr * dr - ci2 * di, deli = cr * di + ci2 * dr;
        const nr = hr * delr - hi * deli, ni = hr * deli + hi * delr;
        hr = nr; hi = ni;
        if (Math.abs(delr - 1) + Math.abs(deli) < NA_EPS) break;
      }
      // h · (cos t − i sen t)
      const co = Math.cos(t), se = Math.sin(t);
      const rr = co * hr + se * hi, ri = co * hi - se * hr;
      ci = -rr;
      si = Math.PI / 2 + ri;
    } else {
      // series: uₖ = tᵏ/k!; las impares van a Si y las pares a Ci, con signo alterno
      let u = 1, sumS = 0, sumC = 0;
      for (let k = 1; k < 200; k++) {
        u *= t / k;
        const term = u / k;
        if (k % 2 === 1) sumS += ((k - 1) / 2 % 2 === 0 ? 1 : -1) * term;
        else sumC += (k / 2 % 2 === 0 ? 1 : -1) * term;
        if (term < NA_EPS * 1e-2 * Math.max(Math.abs(sumS), 1e-300)) break;
      }
      si = sumS; ci = NA_EULER + Math.log(t) + sumC;
    }
    if (x < 0) si = -si;
    return [si, ci];
  };
  real1('integralSeno', x => cisi(x)[0], 'integralSeno(x) — Si(x) = ∫₀ˣ sen(t)/t dt · Si(∞) = π/2');
  def('integralCoseno', 'real -> real', a => {
    const x = num(a[0], 1, 'integralCoseno');
    if (!(x > 0)) vm.error('«integralCoseno»: Ci(x) se define para x > 0');
    return cisi(x)[1];
  }, 'integralCoseno(x) — Ci(x) = γ + ln x + ∫₀ˣ (cos t − 1)/t dt, para x > 0');

  // Fresnel, con la convención de SciPy: S(x) = ∫₀ˣ sen(πt²/2) dt
  const fresnel = x => {
    const ax = Math.abs(x);
    let s, c;
    if (ax < 1e-150) return [x, x];
    if (ax < 1.5) {
      // series: uₖ = x·(πx²/2)ᵏ/k!; las pares van a C y las impares a S
      const w = Math.PI * ax * ax / 2;
      let u = ax, sumS = 0, sumC = ax;
      for (let k = 1; k < 200; k++) {
        u *= w / k;
        const term = u / (2 * k + 1);
        if (k % 2 === 1) sumS += ((k - 1) / 2 % 2 === 0 ? 1 : -1) * term;
        else sumC += (k / 2 % 2 === 0 ? 1 : -1) * term;
        if (term < NA_EPS * 1e-2 * Math.max(Math.abs(sumS), Math.abs(sumC))) break;
      }
      s = sumS; c = sumC;
    } else {
      // fracción continua compleja (NR «frenel»)
      const pix2 = Math.PI * ax * ax;
      let br = 1, bi = -pix2, cr = 1 / 1e-300, ci = 0;
      let dr, di, hr, hi;
      { const m = br * br + bi * bi; dr = br / m; di = -bi / m; hr = dr; hi = di; }
      let n = -1;
      for (let k = 2; k < 200; k++) {
        n += 2;
        const a = -n * (n + 1);
        br += 4;
        let xr = a * dr + br, xi = a * di + bi;
        { const m = xr * xr + xi * xi; dr = xr / m; di = -xi / m; }
        { const m = cr * cr + ci * ci; const qr = a * cr / m, qi = -a * ci / m; cr = br + qr; ci = bi + qi; }
        const delr = cr * dr - ci * di, deli = cr * di + ci * dr;
        const nr = hr * delr - hi * deli, ni = hr * deli + hi * delr;
        hr = nr; hi = ni;
        if (Math.abs(delr - 1) + Math.abs(deli) < NA_EPS) break;
      }
      // h · (ax − i·ax) → h' = h·(ax, −ax)
      let h2r = hr * ax + hi * ax, h2i = hi * ax - hr * ax;
      const co = Math.cos(0.5 * pix2), se = Math.sin(0.5 * pix2);
      // cs = (1+i)/2 · (1 − (cos + i sen)·h')
      const pr = co * h2r - se * h2i, pi = co * h2i + se * h2r;
      const ur = 1 - pr, ui = -pi;
      c = 0.5 * (ur - ui);
      s = 0.5 * (ur + ui);
    }
    if (x < 0) { s = -s; c = -c; }
    return [s, c];
  };
  real1('fresnelS', x => fresnel(x)[0], 'fresnelS(x) — S(x) = ∫₀ˣ sen(πt²/2) dt, la integral de Fresnel (la clotoide de las carreteras)');
  real1('fresnelC', x => fresnel(x)[1], 'fresnelC(x) — C(x) = ∫₀ˣ cos(πt²/2) dt');

  // elípticas completas, con el parámetro m = k² (como SciPy)
  const agm = m => {
    let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m), suma = m / 2, pot = 0.5;
    for (let i = 0; i < 60; i++) {
      const a1 = (a + b) / 2, b1 = Math.sqrt(a * b), c1 = (a - b) / 2;
      pot *= 2;
      suma += pot * c1 * c1;
      a = a1; b = b1; c = c1;
      if (Math.abs(c) < 1e-17 * a) break;
    }
    return [Math.PI / (2 * a), suma];
  };
  def('elipticaK', 'real -> real', a => {
    const m = num(a[0], 1, 'elipticaK');
    if (m > 1) vm.error('«elipticaK»: el parámetro m = k² debe ser como mucho 1');
    if (m === 1) return Infinity;
    return agm(m)[0];
  }, 'elipticaK(m) — la integral elíptica completa de primera especie K(m), m = k² · el periodo del péndulo grande');
  def('elipticaE', 'real -> real', a => {
    const m = num(a[0], 1, 'elipticaE');
    if (m > 1) vm.error('«elipticaE»: el parámetro m = k² debe ser como mucho 1');
    if (m === 1) return 1;
    const [K, s] = agm(m);
    return K * (1 - s);
  }, 'elipticaE(m) — la integral elíptica completa de segunda especie E(m) · el perímetro de una elipse es 4a·E(e²)');

  // dilogaritmo real, Li₂(x) = −∫₀ˣ ln(1−t)/t dt, x ≤ 1
  const li2 = x => {
    if (x === 0) return 0;
    if (x === 1) return Math.PI * Math.PI / 6;
    if (x < 0) { const l = Math.log1p(-x); return -li2(x / (x - 1)) - 0.5 * l * l; }
    if (x > 0.5) return Math.PI * Math.PI / 6 - Math.log(x) * Math.log1p(-x) - li2(1 - x);
    let s = 0, p = x;
    for (let k = 1; k < 200; k++) { const t = p / (k * k); s += t; if (t < NA_EPS * s) break; p *= x; }
    return s;
  };
  def('dilogaritmo', 'real -> real', a => {
    const x = num(a[0], 1, 'dilogaritmo');
    if (x > 1) vm.error('«dilogaritmo»: para x > 1 el dilogaritmo es complejo');
    return li2(x);
  }, 'dilogaritmo(x) — Li₂(x) = Σ xᵏ/k², para x ≤ 1 · dilogaritmo(1) = π²/6');

  // ₂F₁(a, b; c; z), z < 1
  const f21serie = (a, b, c, z) => {
    let s = 1, t = 1;
    for (let k = 0; k < 200000; k++) {
      t *= (a + k) * (b + k) / ((c + k) * (k + 1)) * z;
      s += t;
      if (Math.abs(t) < NA_EPS * Math.abs(s)) break;
      if (t === 0) break;
    }
    return s;
  };
  def('hipergeometrica', 'real, real, real, real -> real', a => {
    const A = num(a[0], 1, 'hipergeometrica'), B = num(a[1], 2, 'hipergeometrica'), C = num(a[2], 3, 'hipergeometrica'), z = num(a[3], 4, 'hipergeometrica');
    if (C <= 0 && Number.isInteger(C)) vm.error('«hipergeometrica»: c no puede ser 0 ni un entero negativo');
    if (z === 1) {
      if (C - A - B <= 0) vm.error('«hipergeometrica»: en z = 1 la serie converge solo si c − a − b > 0');
      return Math.exp(lnGamma(C) + lnGamma(C - A - B) - lnGamma(C - A) - lnGamma(C - B));
    }
    if (z > 1) vm.error('«hipergeometrica»: para z > 1 el resultado es complejo (está definida para z < 1)');
    if (z < 0) return Math.pow(1 - z, -A) * f21serie(A, C - B, C, z / (z - 1));     // Pfaff
    return f21serie(A, B, C, z);
  }, 'hipergeometrica(a, b, c, z) — la ₂F₁ de Gauss, para z < 1 · hipergeometrica(1, 1, 2, z) = −ln(1−z)/z');

  // Bessel I de orden entero
  def('besselI', 'entero, real -> real', a => {
    const n = Math.abs(ent(a[0], 1, 'besselI')), x = num(a[1], 2, 'besselI');
    const ax = Math.abs(x);
    let r;
    if (ax <= 30 + n) {
      const h = ax / 2;
      let t = Math.exp(n * Math.log(h || 1e-300) - lnGamma(n + 1));
      if (ax === 0) return n === 0 ? 1 : 0;
      let s = t;
      for (let k = 1; k < 1000; k++) { t *= h * h / (k * (k + n)); s += t; if (t < NA_EPS * s) break; }
      r = s;
    } else {
      const mu = 4 * n * n;
      let s = 1, t = 1;
      for (let k = 1; k < 30; k++) {
        const t2 = -t * (mu - (2 * k - 1) * (2 * k - 1)) / (k * 8 * ax);
        if (Math.abs(t2) > Math.abs(t)) break;
        t = t2; s += t;
        if (Math.abs(t) < NA_EPS * Math.abs(s)) break;
      }
      r = Math.exp(ax) / Math.sqrt(2 * Math.PI * ax) * s;
    }
    return (x < 0 && n % 2 === 1) ? -r : r;
  }, 'besselI(n, x) — la Bessel modificada de primera especie Iₙ(x), de orden entero · la distribución de von Mises, el calor en un cilindro');

  // poligamma ψ⁽ⁿ⁾(x), x > 0
  const B2k = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330];
  const fact = n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  const poligamma = (n, x) => {
    if (n === 0) return digamma(x);
    let acc = 0;
    const sg = (n % 2 === 1) ? 1 : -1;            // (−1)^(n+1)
    const nf = fact(n);
    while (x < 15) { acc += sg * nf / Math.pow(x, n + 1); x += 1; }
    let s = fact(n - 1) / Math.pow(x, n) + nf / (2 * Math.pow(x, n + 1));
    for (let k = 1; k <= B2k.length; k++) {
      const t = B2k[k - 1] * fact(2 * k + n - 1) / (fact(2 * k) * Math.pow(x, 2 * k + n));
      s += t;
      if (Math.abs(t) < NA_EPS * Math.abs(s)) break;
    }
    return acc + sg * s;
  };
  def('trigamma', 'real -> real', a => {
    const x = num(a[0], 1, 'trigamma');
    if (!(x > 0)) vm.error('«trigamma»: está implementada para x > 0');
    return poligamma(1, x);
  }, 'trigamma(x) — ψ′(x), la derivada de digamma · trigamma(1) = π²/6');
  def('poligamma', 'entero, real -> real', a => {
    const n = ent(a[0], 1, 'poligamma'), x = num(a[1], 2, 'poligamma');
    if (n < 0) vm.error('«poligamma»: el orden debe ser 0 o más');
    if (n > 20) vm.error('«poligamma»: el orden máximo es 20');
    if (!(x > 0)) vm.error('«poligamma»: está implementada para x > 0');
    return poligamma(n, x);
  }, 'poligamma(n, x) — ψ⁽ⁿ⁾(x), la n-ésima derivada de digamma (n = 0 es digamma)');
  real1('sinc', x => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x),
    'sinc(x) — sen(πx)/(πx), la normalizada (como NumPy) · la respuesta de un filtro ideal');

  // ─────────────────────────────────────────────── distribuciones
  const lnBeta = (p, q) => lnGamma(p) + lnGamma(q) - lnGamma(p + q);
  const d3 = (nombre, doc, f) => def(nombre, 'real, real, real -> real', a => f(...a.map((v, i) => num(v, i + 1, nombre))), doc);
  d3('gammaDensidad', 'gammaDensidad(x, forma, escala) — la densidad de una gamma(k, θ) · media kθ', (x, k, th) => {
    positivo(k, 2, 'gammaDensidad', 'la forma'); positivo(th, 3, 'gammaDensidad', 'la escala');
    if (x < 0) return 0;
    if (x === 0) return k < 1 ? Infinity : (k === 1 ? 1 / th : 0);
    return Math.exp((k - 1) * Math.log(x) - x / th - lnGamma(k) - k * Math.log(th));
  });
  d3('gammaAcumulada', 'gammaAcumulada(x, forma, escala) — P(X ≤ x) de una gamma(k, θ)', (x, k, th) => {
    positivo(k, 2, 'gammaAcumulada', 'la forma'); positivo(th, 3, 'gammaAcumulada', 'la escala');
    return x <= 0 ? 0 : gammaP(k, x / th);
  });
  d3('betaDensidad', 'betaDensidad(x, a, b) — la densidad de una beta(a, b) en [0, 1] · una proporción incierta', (x, p, q) => {
    positivo(p, 2, 'betaDensidad', 'a'); positivo(q, 3, 'betaDensidad', 'b');
    if (x < 0 || x > 1) return 0;
    if (x === 0) return p < 1 ? Infinity : (p === 1 ? Math.exp(-lnBeta(p, q)) : 0);
    if (x === 1) return q < 1 ? Infinity : (q === 1 ? Math.exp(-lnBeta(p, q)) : 0);
    return Math.exp((p - 1) * Math.log(x) + (q - 1) * Math.log1p(-x) - lnBeta(p, q));
  });
  d3('betaAcumulada', 'betaAcumulada(x, a, b) — P(X ≤ x) de una beta(a, b)', (x, p, q) => {
    positivo(p, 2, 'betaAcumulada', 'a'); positivo(q, 3, 'betaAcumulada', 'b');
    if (x <= 0) return 0; if (x >= 1) return 1;
    return betaI(p, q, x);
  });
  d3('weibullDensidad', 'weibullDensidad(x, forma, escala) — la densidad de una Weibull(k, λ) · la vida de una pieza', (x, k, l) => {
    positivo(k, 2, 'weibullDensidad', 'la forma'); positivo(l, 3, 'weibullDensidad', 'la escala');
    if (x < 0) return 0;
    const z = x / l;
    return k / l * Math.pow(z, k - 1) * Math.exp(-Math.pow(z, k));
  });
  d3('weibullAcumulada', 'weibullAcumulada(x, forma, escala) — P(X ≤ x) = 1 − e^(−(x/λ)ᵏ)', (x, k, l) => {
    positivo(k, 2, 'weibullAcumulada', 'la forma'); positivo(l, 3, 'weibullAcumulada', 'la escala');
    return x <= 0 ? 0 : -Math.expm1(-Math.pow(x / l, k));
  });
  d3('lognormalDensidad', 'lognormalDensidad(x, mu, sigma) — la densidad de una lognormal (ln X es normal(μ, σ)) · ingresos, tamaños', (x, mu, s) => {
    positivo(s, 3, 'lognormalDensidad', 'sigma');
    if (x <= 0) return 0;
    const z = (Math.log(x) - mu) / s;
    return Math.exp(-0.5 * z * z) / (x * s * Math.sqrt(2 * Math.PI));
  });
  d3('lognormalAcumulada', 'lognormalAcumulada(x, mu, sigma) — P(X ≤ x) de una lognormal', (x, mu, s) => {
    positivo(s, 3, 'lognormalAcumulada', 'sigma');
    if (x <= 0) return 0;
    return 0.5 * erfc(-(Math.log(x) - mu) / (s * Math.SQRT2));
  });
  d3('cauchyDensidad', 'cauchyDensidad(x, x0, gamma) — la densidad de Cauchy (sin media ni varianza) · una resonancia', (x, x0, g) => {
    positivo(g, 3, 'cauchyDensidad', 'gamma');
    const z = (x - x0) / g;
    return 1 / (Math.PI * g * (1 + z * z));
  });
  d3('cauchyAcumulada', 'cauchyAcumulada(x, x0, gamma) — P(X ≤ x) = 1/2 + arctan((x − x0)/γ)/π', (x, x0, g) => {
    positivo(g, 3, 'cauchyAcumulada', 'gamma');
    return 0.5 + Math.atan((x - x0) / g) / Math.PI;
  });
  d3('logisticaDensidad', 'logisticaDensidad(x, mu, s) — la densidad logística · el crecimiento con techo', (x, mu, s) => {
    positivo(s, 3, 'logisticaDensidad', 's');
    const z = -Math.abs(x - mu) / s, e = Math.exp(z);
    return e / (s * (1 + e) * (1 + e));
  });
  d3('logisticaAcumulada', 'logisticaAcumulada(x, mu, s) — P(X ≤ x) = 1/(1 + e^(−(x−μ)/s))', (x, mu, s) => {
    positivo(s, 3, 'logisticaAcumulada', 's');
    const z = (x - mu) / s;
    return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  });
  def('exponencialDensidad', 'real, real -> real', a => {
    const x = num(a[0], 1, 'exponencialDensidad'), l = positivo(a[1], 2, 'exponencialDensidad', 'lambda');
    return x < 0 ? 0 : l * Math.exp(-l * x);
  }, 'exponencialDensidad(x, lambda) — λe^(−λx) · el tiempo entre llegadas');
  def('tStudentDensidad', 'real, real -> real', a => {
    const t = num(a[0], 1, 'tStudentDensidad'), v = positivo(a[1], 2, 'tStudentDensidad', 'los grados de libertad');
    return Math.exp(lnGamma((v + 1) / 2) - lnGamma(v / 2) - 0.5 * Math.log(v * Math.PI) - (v + 1) / 2 * Math.log1p(t * t / v));
  }, 'tStudentDensidad(t, gl) — la densidad de la t de Student');
  def('chiCuadradoDensidad', 'real, real -> real', a => {
    const x = num(a[0], 1, 'chiCuadradoDensidad'), k = positivo(a[1], 2, 'chiCuadradoDensidad', 'los grados de libertad');
    if (x < 0) return 0;
    if (x === 0) return k < 2 ? Infinity : (k === 2 ? 0.5 : 0);
    return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - lnGamma(k / 2) - (k / 2) * Math.LN2);
  }, 'chiCuadradoDensidad(x, gl) — la densidad de la χ²');
  d3('fisherDensidad', 'fisherDensidad(x, gl1, gl2) — la densidad de la F de Fisher–Snedecor', (x, d1, d2) => {
    positivo(d1, 2, 'fisherDensidad', 'gl1'); positivo(d2, 3, 'fisherDensidad', 'gl2');
    if (x < 0) return 0;
    if (x === 0) return d1 < 2 ? Infinity : (d1 === 2 ? 1 : 0);
    return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - lnBeta(d1 / 2, d2 / 2));
  });
  def('geometricaProb', 'entero, real -> real', a => {
    const k = ent(a[0], 1, 'geometricaProb'), p = prob(a[1], 2, 'geometricaProb');
    if (k < 1) return 0;
    return Math.exp((k - 1) * Math.log1p(-p) + Math.log(p));
  }, 'geometricaProb(k, p) — P(el primer éxito llega en el intento k), k ≥ 1');
  def('binomialNegativaProb', 'entero, real, real -> real', a => {
    const k = ent(a[0], 1, 'binomialNegativaProb'), r = positivo(a[1], 2, 'binomialNegativaProb', 'r'), p = prob(a[2], 3, 'binomialNegativaProb');
    if (k < 0) return 0;
    return Math.exp(lnGamma(k + r) - lnGamma(r) - lnGamma(k + 1) + r * Math.log(p) + k * Math.log1p(-p));
  }, 'binomialNegativaProb(k, r, p) — P(k fracasos antes del éxito número r) · conteos con más dispersión que una Poisson');
  def('hipergeometricaProb', 'entero, entero, entero, entero -> real', a => {
    const k = ent(a[0], 1, 'hipergeometricaProb'), N = ent(a[1], 2, 'hipergeometricaProb'), K = ent(a[2], 3, 'hipergeometricaProb'), n = ent(a[3], 4, 'hipergeometricaProb');
    if (N < 0 || K < 0 || n < 0 || K > N || n > N) vm.error('«hipergeometricaProb»: hace falta 0 ≤ K ≤ N y 0 ≤ n ≤ N');
    if (k < Math.max(0, n + K - N) || k > Math.min(n, K)) return 0;
    const lc = (m, j) => lnGamma(m + 1) - lnGamma(j + 1) - lnGamma(m - j + 1);
    return Math.exp(lc(K, k) + lc(N - K, n - k) - lc(N, n));
  }, 'hipergeometricaProb(k, N, K, n) — P(k aciertos al sacar n sin devolver, de N con K buenos) · el control de calidad por lotes');

  // ─────────────────────────────────────────────── muestreo con el azar sembrado de numerico
  const muestra = (nombre, firmaN, doc, generar) => def(nombre, '... -> cualquiera', a => {
    const params = a.slice(0, firmaN);
    if (params.length < firmaN) vm.error(`«${nombre}» necesita ${firmaN} parámetro(s)`);
    const g = generar(params);
    if (a.length > firmaN) {
      const n = ent(a[firmaN], firmaN + 1, nombre);
      if (n < 0) vm.error(`«${nombre}»: la cantidad no puede ser negativa`);
      vm.cobrar(n);
      const out = [];
      for (let i = 0; i < n; i++) out.push(g());
      return vm.nuevaLista(out);
    }
    return g();
  }, doc);
  const gammaMT = k => {
    if (k < 1) { const u = uniforme(); return gammaMT(k + 1) * Math.pow(u || 1e-300, 1 / k); }
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normalE(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = uniforme();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  muestra('azarExponencial', 1, 'azarExponencial(lambda, cantidad?) — un tiempo de espera de media 1/λ · con cantidad, una lista', ([l]) => {
    positivo(l, 1, 'azarExponencial', 'lambda');
    return () => -Math.log1p(-uniforme()) / l;
  });
  muestra('azarGamma', 2, 'azarGamma(forma, escala, cantidad?) — una gamma(k, θ) (Marsaglia–Tsang)', ([k, th]) => {
    positivo(k, 1, 'azarGamma', 'la forma'); positivo(th, 2, 'azarGamma', 'la escala');
    return () => gammaMT(k) * th;
  });
  muestra('azarBeta', 2, 'azarBeta(a, b, cantidad?) — una beta(a, b): una proporción al azar', ([p, q]) => {
    positivo(p, 1, 'azarBeta', 'a'); positivo(q, 2, 'azarBeta', 'b');
    return () => { const x = gammaMT(p), y = gammaMT(q); return x / (x + y); };
  });
  muestra('azarChiCuadrado', 1, 'azarChiCuadrado(gl, cantidad?) — una χ² con gl grados de libertad', ([k]) => {
    positivo(k, 1, 'azarChiCuadrado', 'los grados de libertad');
    return () => 2 * gammaMT(k / 2);
  });
  muestra('azarTStudent', 1, 'azarTStudent(gl, cantidad?) — una t de Student', ([v]) => {
    positivo(v, 1, 'azarTStudent', 'los grados de libertad');
    return () => normalE() / Math.sqrt(2 * gammaMT(v / 2) / v);
  });
  muestra('azarPoisson', 1, 'azarPoisson(lambda, cantidad?) — cuántas llegadas en un intervalo de media λ (Knuth hasta 30; PTRS después)', ([l]) => {
    num(l, 1, 'azarPoisson');
    if (l < 0) vm.error('«azarPoisson»: lambda no puede ser negativa');
    if (l === 0) return () => 0;
    if (l < 30) {
      const L = Math.exp(-l);
      return () => { let k = 0, p = 1; for (;;) { p *= uniforme(); if (p <= L) return k; k++; } };
    }
    // PTRS (Hörmann 1993)
    const slam = Math.sqrt(l), loglam = Math.log(l);
    const b = 0.931 + 2.53 * slam, aa = -0.059 + 0.02483 * b, invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2);
    return () => {
      for (;;) {
        const U = uniforme() - 0.5, V = uniforme(), us = 0.5 - Math.abs(U);
        const k = Math.floor((2 * aa / us + b) * U + l + 0.43);
        if (us >= 0.07 && V <= vr) return k;
        if (k < 0 || (us < 0.013 && V > us)) continue;
        if (Math.log(V) + Math.log(invalpha) - Math.log(aa / (us * us) + b) <= -l + k * loglam - lnGamma(k + 1)) return k;
      }
    };
  });
  muestra('azarBinomial', 2, 'azarBinomial(n, p, cantidad?) — cuántos éxitos en n intentos (inversión o BTRS)', ([n, p]) => {
    ent(n, 1, 'azarBinomial'); prob(p, 2, 'azarBinomial');
    if (n < 0) vm.error('«azarBinomial»: n no puede ser negativo');
    const voltear = p > 0.5, pp = voltear ? 1 - p : p;
    const ajustar = k => voltear ? n - k : k;
    if (pp === 0) return () => ajustar(0);
    if (n * pp < 10) {
      // inversión: recorre la probabilidad acumulada
      const q = 1 - pp, s = pp / q, a0 = (n + 1) * s, r0 = Math.pow(q, n);
      return () => {
        let r = r0, u = uniforme(), x = 0;
        while (u > r) { u -= r; x++; if (x > n) { x = n; break; } r *= (a0 / x - s); }
        return ajustar(x);
      };
    }
    // BTRS (Hörmann 1993)
    const q = 1 - pp, spq = Math.sqrt(n * pp * q);
    const b = 1.15 + 2.53 * spq, aa = -0.0873 + 0.0248 * b + 0.01 * pp, c = n * pp + 0.5, vr = 0.92 - 4.2 / b;
    const alpha = (2.83 + 5.1 / b) * spq, lpq = Math.log(pp / q), m = Math.floor((n + 1) * pp);
    const h = lnGamma(m + 1) + lnGamma(n - m + 1);
    return () => {
      for (;;) {
        const u = uniforme() - 0.5, v0 = uniforme(), us = 0.5 - Math.abs(u);
        const k = Math.floor((2 * aa / us + b) * u + c);
        if (k < 0 || k > n) continue;
        if (us >= 0.07 && v0 <= vr) return ajustar(k);
        const v = Math.log(v0 * alpha / (aa / (us * us) + b));
        if (v <= h - lnGamma(k + 1) - lnGamma(n - k + 1) + (k - m) * lpq) return ajustar(k);
      }
    };
  });
  muestra('azarLogNormal', 2, 'azarLogNormal(mu, sigma, cantidad?) — e^(μ + σZ)', ([mu, s]) => {
    num(mu, 1, 'azarLogNormal'); positivo(s, 2, 'azarLogNormal', 'sigma');
    return () => Math.exp(mu + s * normalE());
  });
  muestra('azarWeibull', 2, 'azarWeibull(forma, escala, cantidad?) — una Weibull(k, λ)', ([k, l]) => {
    positivo(k, 1, 'azarWeibull', 'la forma'); positivo(l, 2, 'azarWeibull', 'la escala');
    return () => l * Math.pow(-Math.log1p(-uniforme()), 1 / k);
  });
  muestra('azarCauchy', 2, 'azarCauchy(x0, gamma, cantidad?) — una Cauchy (colas pesadas: la media no converge)', ([x0, g]) => {
    num(x0, 1, 'azarCauchy'); positivo(g, 2, 'azarCauchy', 'gamma');
    return () => x0 + g * Math.tan(Math.PI * (uniforme() - 0.5));
  });
}

if (typeof module !== 'undefined') module.exports = { instalarNenAmplitud };
