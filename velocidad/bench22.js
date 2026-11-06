// bench22.js — generado por gen22/gen.js: no editar a mano.
'use strict';
function matmul_run() {
  let n = 440;
  let a = new Float64Array((n * n));
  let b = new Float64Array((n * n));
  let c = new Float64Array((n * n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      a[((i * n) + j)] = (((((i * 7) + (j * 3)) % 10)) / 10.0);
      b[((i * n) + j)] = (((((i * 5) + (j * 11)) % 10)) / 10.0);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0.0;
      for (let k = 0; k < n; k++) {
        s = (s + (a[((i * n) + k)] * b[((k * n) + j)]));
      }
      c[((i * n) + j)] = s;
    }
  }
  let t = 0.0;
  for (let i = 0; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return Math.trunc((t * 1000.0));
}
function nbody_avanza(n, xs, ys, zs, vx, vy, vz, m, dt) {
  for (let i = 0; i < n; i++) {
    for (let j = (i + 1); j < n; j++) {
      let dx = (xs[i] - xs[j]);
      let dy = (ys[i] - ys[j]);
      let dz = (zs[i] - zs[j]);
      let d2 = (((dx * dx) + (dy * dy)) + (dz * dz));
      let mag = (dt / (d2 * Math.sqrt(d2)));
      vx[i] = (vx[i] - ((dx * m[j]) * mag));
      vy[i] = (vy[i] - ((dy * m[j]) * mag));
      vz[i] = (vz[i] - ((dz * m[j]) * mag));
      vx[j] = (vx[j] + ((dx * m[i]) * mag));
      vy[j] = (vy[j] + ((dy * m[i]) * mag));
      vz[j] = (vz[j] + ((dz * m[i]) * mag));
    }
  }
  for (let i = 0; i < n; i++) {
    xs[i] = (xs[i] + (dt * vx[i]));
    ys[i] = (ys[i] + (dt * vy[i]));
    zs[i] = (zs[i] + (dt * vz[i]));
  }
}
function nbody_run() {
  let n = 5;
  let xs = new Float64Array(n);
  let ys = new Float64Array(n);
  let zs = new Float64Array(n);
  let vx = new Float64Array(n);
  let vy = new Float64Array(n);
  let vz = new Float64Array(n);
  let m = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (((i) * 1.5) + 0.1);
    ys[i] = ((((i * i)) * 0.7) - 1.0);
    zs[i] = ((((i * 3) % 4)) - 0.5);
    vx[i] = ((i) * 0.01);
    vy[i] = (0.02 - ((i) * 0.005));
    vz[i] = (0.001 * (i));
    m[i] = (1.0 + ((i) * 0.5));
  }
  for (let s = 0; s < 800000; s++) {
    nbody_avanza(n, xs, ys, zs, vx, vy, vz, m, 0.001);
  }
  let t = 0.0;
  for (let i = 0; i < n; i++) {
    t = (((t + xs[i]) + ys[i]) + zs[i]);
  }
  return Math.trunc((t * 1000000.0));
}
function spectral_aij(i, j) {
  return (1.0 / (((Math.floor((((i + j) * ((i + j) + 1))) / (2)) + i) + 1)));
}
function spectral_mulAv(n, v, av) {
  for (let i = 0; i < n; i++) {
    let s = 0.0;
    for (let j = 0; j < n; j++) {
      s = (s + (spectral_aij(i, j) * v[j]));
    }
    av[i] = s;
  }
}
function spectral_mulAtv(n, v, atv) {
  for (let i = 0; i < n; i++) {
    let s = 0.0;
    for (let j = 0; j < n; j++) {
      s = (s + (spectral_aij(j, i) * v[j]));
    }
    atv[i] = s;
  }
}
function spectral_run() {
  let n = 800;
  let u = new Float64Array(n);
  let v = new Float64Array(n);
  let tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = 1.0;
  }
  for (let it = 0; it < 10; it++) {
    spectral_mulAv(n, u, tmp);
    spectral_mulAtv(n, tmp, v);
    spectral_mulAv(n, v, tmp);
    spectral_mulAtv(n, tmp, u);
  }
  let vbv = 0.0;
  let vv = 0.0;
  for (let i = 0; i < n; i++) {
    vbv = (vbv + (u[i] * v[i]));
    vv = (vv + (v[i] * v[i]));
  }
  return Math.trunc((Math.sqrt((vbv / vv)) * 1000000000.0));
}
function fannkuch_run() {
  let n = 9;
  let perm1 = new Float64Array(n);
  let perm = new Float64Array(n);
  let count = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    perm1[i] = i;
  }
  let maxFlips = 0;
  let checksum = 0;
  let permCount = 0;
  let r = n;
  while ((1 === 1 ? 1 : 0)) {
    while ((r !== 1 ? 1 : 0)) {
      count[(r - 1)] = r;
      r = (r - 1);
    }
    for (let i = 0; i < n; i++) {
      perm[i] = perm1[i];
    }
    let flips = 0;
    let k = perm[0];
    while ((k !== 0 ? 1 : 0)) {
      let i = 0;
      let j = k;
      while ((i < j ? 1 : 0)) {
        let t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
        i = (i + 1);
        j = (j - 1);
      }
      flips = (flips + 1);
      k = perm[0];
    }
    if ((flips > maxFlips ? 1 : 0)) {
      maxFlips = flips;
    }
    if (((permCount % 2) === 0 ? 1 : 0)) {
      checksum = (checksum + flips);
    } else {
      checksum = (checksum - flips);
    }
    let seguir = 1;
    while ((seguir === 1 ? 1 : 0)) {
      if ((r === n ? 1 : 0)) {
        return ((checksum * 1000) + maxFlips);
      }
      let p0 = perm1[0];
      let q = 0;
      while ((q < r ? 1 : 0)) {
        perm1[q] = perm1[(q + 1)];
        q = (q + 1);
      }
      perm1[r] = p0;
      count[r] = (count[r] - 1);
      if ((count[r] > 0 ? 1 : 0)) {
        seguir = 0;
      } else {
        r = (r + 1);
      }
    }
    permCount = (permCount + 1);
  }
  return 0;
}
function collatz_run() {
  let mejor = 0;
  let mejorPasos = 0;
  for (let s = 1; s < 400000; s++) {
    let x = s;
    let pasos = 1;
    while ((x !== 1 ? 1 : 0)) {
      if (((x % 2) === 0 ? 1 : 0)) {
        x = Math.floor((x) / (2));
      } else {
        x = ((3 * x) + 1);
      }
      pasos = (pasos + 1);
    }
    if ((pasos > mejorPasos ? 1 : 0)) {
      mejorPasos = pasos;
      mejor = s;
    }
  }
  return ((mejor * 1000) + mejorPasos);
}
function nqueens_coloca(n, fila, cols, d1, d2) {
  if ((fila === n ? 1 : 0)) {
    return 1;
  }
  let total = 0;
  for (let c = 0; c < n; c++) {
    if ((((cols[c] === 0 ? 1 : 0) && (d1[(fila + c)] === 0 ? 1 : 0) ? 1 : 0) && (d2[(((fila - c) + n) - 1)] === 0 ? 1 : 0) ? 1 : 0)) {
      cols[c] = 1;
      d1[(fila + c)] = 1;
      d2[(((fila - c) + n) - 1)] = 1;
      total = (total + nqueens_coloca(n, (fila + 1), cols, d1, d2));
      cols[c] = 0;
      d1[(fila + c)] = 0;
      d2[(((fila - c) + n) - 1)] = 0;
    }
  }
  return total;
}
function nqueens_run() {
  let n = 12;
  return nqueens_coloca(n, 0, new Float64Array(n), new Float64Array((2 * n)), new Float64Array((2 * n)));
}
function quicksort_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function quicksort_qsort(a, lo, hi) {
  if ((lo < hi ? 1 : 0)) {
    let p = a[Math.floor(((lo + hi)) / (2))];
    let i = lo;
    let j = hi;
    while ((i <= j ? 1 : 0)) {
      while ((a[i] < p ? 1 : 0)) {
        i = (i + 1);
      }
      while ((a[j] > p ? 1 : 0)) {
        j = (j - 1);
      }
      if ((i <= j ? 1 : 0)) {
        let t = a[i];
        a[i] = a[j];
        a[j] = t;
        i = (i + 1);
        j = (j - 1);
      }
    }
    quicksort_qsort(a, lo, j);
    quicksort_qsort(a, i, hi);
  }
}
function quicksort_run() {
  let n = 400000;
  let a = new Float64Array(n);
  let x = 42;
  for (let i = 0; i < n; i++) {
    x = quicksort_lcg(x);
    a[i] = x;
  }
  quicksort_qsort(a, 0, (n - 1));
  let c = 0;
  for (let i = 0; i < n; i++) {
    c = ((c + ((a[i] % 1000003) * ((i % 13) + 1))) % 1000000007);
  }
  return c;
}
function heapsort_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function heapsort_hunde(a, ini, fin) {
  let raiz = ini;
  while ((((raiz * 2) + 1) <= fin ? 1 : 0)) {
    let hijo = ((raiz * 2) + 1);
    let cambio = raiz;
    if ((a[cambio] < a[hijo] ? 1 : 0)) {
      cambio = hijo;
    }
    if ((((hijo + 1) <= fin ? 1 : 0) && (a[cambio] < a[(hijo + 1)] ? 1 : 0) ? 1 : 0)) {
      cambio = (hijo + 1);
    }
    if ((cambio === raiz ? 1 : 0)) {
      return;
    }
    let t = a[raiz];
    a[raiz] = a[cambio];
    a[cambio] = t;
    raiz = cambio;
  }
}
function heapsort_run() {
  let n = 300000;
  let a = new Float64Array(n);
  let x = 7;
  for (let i = 0; i < n; i++) {
    x = heapsort_lcg(x);
    a[i] = x;
  }
  let ini = Math.floor(((n - 2)) / (2));
  while ((ini >= 0 ? 1 : 0)) {
    heapsort_hunde(a, ini, (n - 1));
    ini = (ini - 1);
  }
  let fin = (n - 1);
  while ((fin > 0 ? 1 : 0)) {
    let t = a[fin];
    a[fin] = a[0];
    a[0] = t;
    fin = (fin - 1);
    heapsort_hunde(a, 0, fin);
  }
  let c = 0;
  for (let i = 0; i < n; i++) {
    c = ((c + ((a[i] % 1000003) * ((i % 13) + 1))) % 1000000007);
  }
  return c;
}
function bubble_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function bubble_run() {
  let n = 9000;
  let a = new Float64Array(n);
  let x = 99;
  for (let i = 0; i < n; i++) {
    x = bubble_lcg(x);
    a[i] = (x % 100000);
  }
  for (let i = 0; i < (n - 1); i++) {
    for (let j = 0; j < ((n - 1) - i); j++) {
      if ((a[j] > a[(j + 1)] ? 1 : 0)) {
        let t = a[j];
        a[j] = a[(j + 1)];
        a[(j + 1)] = t;
      }
    }
  }
  let c = 0;
  for (let i = 0; i < n; i++) {
    c = ((c + (a[i] * ((i % 7) + 1))) % 1000000007);
  }
  return c;
}
function fibmod_run() {
  let a = 0;
  let b = 1;
  for (let i = 0; i < 15000000; i++) {
    let t = ((a + b) % 1000000007);
    a = b;
    b = t;
  }
  return b;
}
function primos_esPrimo(n) {
  if ((n < 2 ? 1 : 0)) {
    return 0;
  }
  let d = 2;
  while (((d * d) <= n ? 1 : 0)) {
    if (((n % d) === 0 ? 1 : 0)) {
      return 0;
    }
    d = (d + 1);
  }
  return 1;
}
function primos_run() {
  let cuenta = 0;
  for (let n = 0; n < 200000; n++) {
    cuenta = (cuenta + primos_esPrimo(n));
  }
  return cuenta;
}
function mcd_mcd(a, b) {
  while ((b !== 0 ? 1 : 0)) {
    let t = (a % b);
    a = b;
    b = t;
  }
  return a;
}
function mcd_run() {
  let s = 0;
  for (let i = 1; i < 1500; i++) {
    for (let j = 1; j < 1500; j++) {
      s = (s + mcd_mcd(i, j));
    }
  }
  return s;
}
function leibniz_run() {
  let s = 0.0;
  let signo = 1.0;
  for (let k = 0; k < 20000000; k++) {
    s = (s + (signo / (((2 * k) + 1))));
    signo = (-signo);
  }
  return Math.trunc(((s * 4.0) * 1000000000.0));
}
function montecarlo_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function montecarlo_run() {
  let x = 2024;
  let dentro = 0;
  for (let i = 0; i < 5000000; i++) {
    x = montecarlo_lcg(x);
    let u = ((x) / 2147483647.0);
    x = montecarlo_lcg(x);
    let v = ((x) / 2147483647.0);
    if ((((u * u) + (v * v)) <= 1.0 ? 1 : 0)) {
      dentro = (dentro + 1);
    }
  }
  return dentro;
}
function saxpy_run() {
  let n = 1000000;
  let xs = new Float64Array(n);
  let ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (((i % 100)) * 0.01);
    ys[i] = (((i % 37)) * 0.5);
  }
  for (let rep = 0; rep < 20; rep++) {
    for (let i = 0; i < n; i++) {
      ys[i] = ((0.5 * xs[i]) + ys[i]);
    }
  }
  let t = 0.0;
  for (let i = 0; i < n; i++) {
    t = (t + ys[i]);
  }
  return Math.trunc((t * 1000.0));
}
function histograma_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function histograma_run() {
  let h = new Float64Array(1000);
  let x = 5;
  for (let i = 0; i < 6000000; i++) {
    x = histograma_lcg(x);
    let b = (x % 1000);
    h[b] = (h[b] + 1);
  }
  let c = 0;
  for (let i = 0; i < 1000; i++) {
    c = ((c + (h[i] * (i + 1))) % 1000000007);
  }
  return c;
}
function editdist_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function editdist_run() {
  let n = 5000;
  let s = new Float64Array(n);
  let t = new Float64Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = editdist_lcg(x);
    s[i] = (x % 4);
    x = editdist_lcg(x);
    t[i] = (x % 4);
  }
  let prev = new Float64Array((n + 1));
  let cur = new Float64Array((n + 1));
  for (let j = 0; j < (n + 1); j++) {
    prev[j] = j;
  }
  for (let i = 1; i < (n + 1); i++) {
    cur[0] = i;
    for (let j = 1; j < (n + 1); j++) {
      let costo = 1;
      if ((s[(i - 1)] === t[(j - 1)] ? 1 : 0)) {
        costo = 0;
      }
      let mejor = (prev[(j - 1)] + costo);
      if (((prev[j] + 1) < mejor ? 1 : 0)) {
        mejor = (prev[j] + 1);
      }
      if (((cur[(j - 1)] + 1) < mejor ? 1 : 0)) {
        mejor = (cur[(j - 1)] + 1);
      }
      cur[j] = mejor;
    }
    for (let j = 0; j < (n + 1); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
function lcs_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function lcs_run() {
  let n = 5000;
  let s = new Float64Array(n);
  let t = new Float64Array(n);
  let x = 777;
  for (let i = 0; i < n; i++) {
    x = lcs_lcg(x);
    s[i] = (x % 4);
    x = lcs_lcg(x);
    t[i] = (x % 4);
  }
  let prev = new Float64Array((n + 1));
  let cur = new Float64Array((n + 1));
  for (let i = 1; i < (n + 1); i++) {
    for (let j = 1; j < (n + 1); j++) {
      if ((s[(i - 1)] === t[(j - 1)] ? 1 : 0)) {
        cur[j] = (prev[(j - 1)] + 1);
      } else {
        if ((prev[j] > cur[(j - 1)] ? 1 : 0)) {
          cur[j] = prev[j];
        } else {
          cur[j] = cur[(j - 1)];
        }
      }
    }
    for (let j = 0; j < (n + 1); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
function mochila_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function mochila_run() {
  let n = 1500;
  let cap = 20000;
  let w = new Float64Array(n);
  let v = new Float64Array(n);
  let x = 31;
  for (let i = 0; i < n; i++) {
    x = mochila_lcg(x);
    w[i] = (1 + (x % 50));
    x = mochila_lcg(x);
    v[i] = (x % 100);
  }
  let dp = new Float64Array((cap + 1));
  for (let i = 0; i < n; i++) {
    let c = cap;
    while ((c >= w[i] ? 1 : 0)) {
      let cand = (dp[(c - w[i])] + v[i]);
      if ((cand > dp[c] ? 1 : 0)) {
        dp[c] = cand;
      }
      c = (c - 1);
    }
  }
  return dp[cap];
}
function floyd_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function floyd_run() {
  let n = 350;
  let d = new Float64Array((n * n));
  let x = 11;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x = floyd_lcg(x);
      d[((i * n) + j)] = (1 + (x % 1000));
      if ((i === j ? 1 : 0)) {
        d[((i * n) + j)] = 0;
      }
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let cand = (d[((i * n) + k)] + d[((k * n) + j)]);
        if ((cand < d[((i * n) + j)] ? 1 : 0)) {
          d[((i * n) + j)] = cand;
        }
      }
    }
  }
  let c = 0;
  for (let i = 0; i < (n * n); i++) {
    c = ((c + d[i]) % 1000000007);
  }
  return c;
}
function tak_tak(a, b, c) {
  if ((b < a ? 1 : 0)) {
    return tak_tak(tak_tak((a - 1), b, c), tak_tak((b - 1), c, a), tak_tak((c - 1), a, b));
  }
  return c;
}
function tak_run() {
  return tak_tak(30, 20, 10);
}
function hanoi_mueve(n, a) {
  if ((n === 0 ? 1 : 0)) {
    return (a % 2);
  }
  return ((hanoi_mueve((n - 1), (a + 1)) + hanoi_mueve((n - 1), (a + 2))) + 1);
}
function hanoi_run() {
  return hanoi_mueve(25, 0);
}
{ const t0 = performance.now(); const r = matmul_run(); console.log(`matmul = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = nbody_run(); console.log(`nbody = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = spectral_run(); console.log(`spectral = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = fannkuch_run(); console.log(`fannkuch = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = collatz_run(); console.log(`collatz = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = nqueens_run(); console.log(`nqueens = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = quicksort_run(); console.log(`quicksort = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = heapsort_run(); console.log(`heapsort = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = bubble_run(); console.log(`bubble = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = fibmod_run(); console.log(`fibmod = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = primos_run(); console.log(`primos = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = mcd_run(); console.log(`mcd = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = leibniz_run(); console.log(`leibniz = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = montecarlo_run(); console.log(`montecarlo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = saxpy_run(); console.log(`saxpy = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = histograma_run(); console.log(`histograma = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = editdist_run(); console.log(`editdist = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = lcs_run(); console.log(`lcs = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = mochila_run(); console.log(`mochila = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = floyd_run(); console.log(`floyd = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = tak_run(); console.log(`tak = ${r} en ${Math.round(performance.now() - t0)} ms`); }
{ const t0 = performance.now(); const r = hanoi_run(); console.log(`hanoi = ${r} en ${Math.round(performance.now() - t0)} ms`); }
