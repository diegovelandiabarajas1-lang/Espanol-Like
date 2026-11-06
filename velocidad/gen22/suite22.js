// suite22.js — los 22 benchmarks nuevos, escritos una vez en el mini-lenguaje de gen.js.
// Cada uno define «fn run(): int» y devuelve una suma de comprobación entera: todos los lenguajes tienen que dar el mismo número.
// Los tamaños (N_*) se ajustan para que C tarde entre 50 y 300 ms.
'use strict';
const P = (nombre, src) => ({ nombre, src });
const LCG = 'fn lcg(x: int): int { return (x * 16807) % 2147483647; }\n';

const SUITE = [

P('matmul', `
fn run(): int {
  let n: int = 440;
  let a: arr_real = newreal(n * n);
  let b: arr_real = newreal(n * n);
  let c: arr_real = newreal(n * n);
  for i in 0..n {
    for j in 0..n {
      a[i * n + j] = real((i * 7 + j * 3) % 10) / 10.0;
      b[i * n + j] = real((i * 5 + j * 11) % 10) / 10.0;
    }
  }
  for i in 0..n {
    for j in 0..n {
      let s: real = 0.0;
      for k in 0..n { s = s + a[i * n + k] * b[k * n + j]; }
      c[i * n + j] = s;
    }
  }
  let t: real = 0.0;
  for i in 0..n * n { t = t + c[i]; }
  return int(t * 1000.0);
}`),

P('nbody', `
fn avanza(n: int, xs: arr_real, ys: arr_real, zs: arr_real, vx: arr_real, vy: arr_real, vz: arr_real, m: arr_real, dt: real) {
  for i in 0..n {
    for j in i + 1..n {
      let dx: real = xs[i] - xs[j];
      let dy: real = ys[i] - ys[j];
      let dz: real = zs[i] - zs[j];
      let d2: real = dx * dx + dy * dy + dz * dz;
      let mag: real = dt / (d2 * sqrt(d2));
      vx[i] = vx[i] - dx * m[j] * mag;
      vy[i] = vy[i] - dy * m[j] * mag;
      vz[i] = vz[i] - dz * m[j] * mag;
      vx[j] = vx[j] + dx * m[i] * mag;
      vy[j] = vy[j] + dy * m[i] * mag;
      vz[j] = vz[j] + dz * m[i] * mag;
    }
  }
  for i in 0..n {
    xs[i] = xs[i] + dt * vx[i];
    ys[i] = ys[i] + dt * vy[i];
    zs[i] = zs[i] + dt * vz[i];
  }
}
fn run(): int {
  let n: int = 5;
  let xs: arr_real = newreal(n);
  let ys: arr_real = newreal(n);
  let zs: arr_real = newreal(n);
  let vx: arr_real = newreal(n);
  let vy: arr_real = newreal(n);
  let vz: arr_real = newreal(n);
  let m: arr_real = newreal(n);
  for i in 0..n {
    xs[i] = real(i) * 1.5 + 0.1;
    ys[i] = real(i * i) * 0.7 - 1.0;
    zs[i] = real(i * 3 % 4) - 0.5;
    vx[i] = real(i) * 0.01;
    vy[i] = 0.02 - real(i) * 0.005;
    vz[i] = 0.001 * real(i);
    m[i] = 1.0 + real(i) * 0.5;
  }
  for s in 0..800000 { avanza(n, xs, ys, zs, vx, vy, vz, m, 0.001); }
  let t: real = 0.0;
  for i in 0..n { t = t + xs[i] + ys[i] + zs[i]; }
  return int(t * 1000000.0);
}`),

P('spectral', `
fn aij(i: int, j: int): real { return 1.0 / real(idiv((i + j) * (i + j + 1), 2) + i + 1); }
fn mulAv(n: int, v: arr_real, av: arr_real) {
  for i in 0..n {
    let s: real = 0.0;
    for j in 0..n { s = s + aij(i, j) * v[j]; }
    av[i] = s;
  }
}
fn mulAtv(n: int, v: arr_real, atv: arr_real) {
  for i in 0..n {
    let s: real = 0.0;
    for j in 0..n { s = s + aij(j, i) * v[j]; }
    atv[i] = s;
  }
}
fn run(): int {
  let n: int = 800;
  let u: arr_real = newreal(n);
  let v: arr_real = newreal(n);
  let tmp: arr_real = newreal(n);
  for i in 0..n { u[i] = 1.0; }
  for it in 0..10 {
    mulAv(n, u, tmp); mulAtv(n, tmp, v);
    mulAv(n, v, tmp); mulAtv(n, tmp, u);
  }
  let vbv: real = 0.0;
  let vv: real = 0.0;
  for i in 0..n { vbv = vbv + u[i] * v[i]; vv = vv + v[i] * v[i]; }
  return int(sqrt(vbv / vv) * 1000000000.0);
}`),

P('fannkuch', `
fn run(): int {
  let n: int = 9;
  let perm1: arr_int = newint(n);
  let perm: arr_int = newint(n);
  let count: arr_int = newint(n);
  for i in 0..n { perm1[i] = i; }
  let maxFlips: int = 0;
  let checksum: int = 0;
  let permCount: int = 0;
  let r: int = n;
  while (1 == 1) {
    while (r != 1) { count[r - 1] = r; r = r - 1; }
    for i in 0..n { perm[i] = perm1[i]; }
    let flips: int = 0;
    let k: int = perm[0];
    while (k != 0) {
      let i: int = 0;
      let j: int = k;
      while (i < j) {
        let t: int = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
        i = i + 1;
        j = j - 1;
      }
      flips = flips + 1;
      k = perm[0];
    }
    if (flips > maxFlips) { maxFlips = flips; }
    if (permCount % 2 == 0) { checksum = checksum + flips; } else { checksum = checksum - flips; }
    let seguir: int = 1;
    while (seguir == 1) {
      if (r == n) { return checksum * 1000 + maxFlips; }
      let p0: int = perm1[0];
      let q: int = 0;
      while (q < r) { perm1[q] = perm1[q + 1]; q = q + 1; }
      perm1[r] = p0;
      count[r] = count[r] - 1;
      if (count[r] > 0) { seguir = 0; } else { r = r + 1; }
    }
    permCount = permCount + 1;
  }
  return 0;
}`),

P('collatz', `
fn run(): int {
  let mejor: int = 0;
  let mejorPasos: int = 0;
  for s in 1..400000 {
    let x: int = s;
    let pasos: int = 1;
    while (x != 1) {
      if (x % 2 == 0) { x = idiv(x, 2); } else { x = 3 * x + 1; }
      pasos = pasos + 1;
    }
    if (pasos > mejorPasos) { mejorPasos = pasos; mejor = s; }
  }
  return mejor * 1000 + mejorPasos;
}`),

P('nqueens', `
fn coloca(n: int, fila: int, cols: arr_int, d1: arr_int, d2: arr_int): int {
  if (fila == n) { return 1; }
  let total: int = 0;
  for c in 0..n {
    if (cols[c] == 0 && d1[fila + c] == 0 && d2[fila - c + n - 1] == 0) {
      cols[c] = 1; d1[fila + c] = 1; d2[fila - c + n - 1] = 1;
      total = total + coloca(n, fila + 1, cols, d1, d2);
      cols[c] = 0; d1[fila + c] = 0; d2[fila - c + n - 1] = 0;
    }
  }
  return total;
}
fn run(): int {
  let n: int = 12;
  return coloca(n, 0, newint(n), newint(2 * n), newint(2 * n));
}`),

P('quicksort', LCG + `
fn qsort(a: arr_int, lo: int, hi: int) {
  if (lo < hi) {
    let p: int = a[idiv(lo + hi, 2)];
    let i: int = lo;
    let j: int = hi;
    while (i <= j) {
      while (a[i] < p) { i = i + 1; }
      while (a[j] > p) { j = j - 1; }
      if (i <= j) {
        let t: int = a[i];
        a[i] = a[j];
        a[j] = t;
        i = i + 1;
        j = j - 1;
      }
    }
    qsort(a, lo, j);
    qsort(a, i, hi);
  }
}
fn run(): int {
  let n: int = 400000;
  let a: arr_int = newint(n);
  let x: int = 42;
  for i in 0..n { x = lcg(x); a[i] = x; }
  qsort(a, 0, n - 1);
  let c: int = 0;
  for i in 0..n { c = (c + a[i] % 1000003 * (i % 13 + 1)) % 1000000007; }
  return c;
}`),

P('heapsort', LCG + `
fn hunde(a: arr_int, ini: int, fin: int) {
  let raiz: int = ini;
  while (raiz * 2 + 1 <= fin) {
    let hijo: int = raiz * 2 + 1;
    let cambio: int = raiz;
    if (a[cambio] < a[hijo]) { cambio = hijo; }
    if (hijo + 1 <= fin && a[cambio] < a[hijo + 1]) { cambio = hijo + 1; }
    if (cambio == raiz) { return; }
    let t: int = a[raiz];
    a[raiz] = a[cambio];
    a[cambio] = t;
    raiz = cambio;
  }
}
fn run(): int {
  let n: int = 300000;
  let a: arr_int = newint(n);
  let x: int = 7;
  for i in 0..n { x = lcg(x); a[i] = x; }
  let ini: int = idiv(n - 2, 2);
  while (ini >= 0) { hunde(a, ini, n - 1); ini = ini - 1; }
  let fin: int = n - 1;
  while (fin > 0) {
    let t: int = a[fin];
    a[fin] = a[0];
    a[0] = t;
    fin = fin - 1;
    hunde(a, 0, fin);
  }
  let c: int = 0;
  for i in 0..n { c = (c + a[i] % 1000003 * (i % 13 + 1)) % 1000000007; }
  return c;
}`),

P('bubble', LCG + `
fn run(): int {
  let n: int = 9000;
  let a: arr_int = newint(n);
  let x: int = 99;
  for i in 0..n { x = lcg(x); a[i] = x % 100000; }
  for i in 0..n - 1 {
    for j in 0..n - 1 - i {
      if (a[j] > a[j + 1]) {
        let t: int = a[j];
        a[j] = a[j + 1];
        a[j + 1] = t;
      }
    }
  }
  let c: int = 0;
  for i in 0..n { c = (c + a[i] * (i % 7 + 1)) % 1000000007; }
  return c;
}`),

P('fibmod', `
fn run(): int {
  let a: int = 0;
  let b: int = 1;
  for i in 0..15000000 {
    let t: int = (a + b) % 1000000007;
    a = b;
    b = t;
  }
  return b;
}`),

P('primos', `
fn esPrimo(n: int): int {
  if (n < 2) { return 0; }
  let d: int = 2;
  while (d * d <= n) {
    if (n % d == 0) { return 0; }
    d = d + 1;
  }
  return 1;
}
fn run(): int {
  let cuenta: int = 0;
  for n in 0..200000 { cuenta = cuenta + esPrimo(n); }
  return cuenta;
}`),

P('mcd', `
fn mcd(a: int, b: int): int {
  while (b != 0) {
    let t: int = a % b;
    a = b;
    b = t;
  }
  return a;
}
fn run(): int {
  let s: int = 0;
  for i in 1..1500 {
    for j in 1..1500 { s = s + mcd(i, j); }
  }
  return s;
}`),

P('leibniz', `
fn run(): int {
  let s: real = 0.0;
  let signo: real = 1.0;
  for k in 0..20000000 {
    s = s + signo / real(2 * k + 1);
    signo = -signo;
  }
  return int(s * 4.0 * 1000000000.0);
}`),

P('montecarlo', LCG + `
fn run(): int {
  let x: int = 2024;
  let dentro: int = 0;
  for i in 0..5000000 {
    x = lcg(x);
    let u: real = real(x) / 2147483647.0;
    x = lcg(x);
    let v: real = real(x) / 2147483647.0;
    if (u * u + v * v <= 1.0) { dentro = dentro + 1; }
  }
  return dentro;
}`),

P('saxpy', `
fn run(): int {
  let n: int = 1000000;
  let xs: arr_real = newreal(n);
  let ys: arr_real = newreal(n);
  for i in 0..n { xs[i] = real(i % 100) * 0.01; ys[i] = real(i % 37) * 0.5; }
  for rep in 0..20 {
    for i in 0..n { ys[i] = 0.5 * xs[i] + ys[i]; }
  }
  let t: real = 0.0;
  for i in 0..n { t = t + ys[i]; }
  return int(t * 1000.0);
}`),

P('histograma', LCG + `
fn run(): int {
  let h: arr_int = newint(1000);
  let x: int = 5;
  for i in 0..6000000 {
    x = lcg(x);
    let b: int = x % 1000;
    h[b] = h[b] + 1;
  }
  let c: int = 0;
  for i in 0..1000 { c = (c + h[i] * (i + 1)) % 1000000007; }
  return c;
}`),

P('editdist', LCG + `
fn run(): int {
  let n: int = 5000;
  let s: arr_int = newint(n);
  let t: arr_int = newint(n);
  let x: int = 12345;
  for i in 0..n {
    x = lcg(x); s[i] = x % 4;
    x = lcg(x); t[i] = x % 4;
  }
  let prev: arr_int = newint(n + 1);
  let cur: arr_int = newint(n + 1);
  for j in 0..n + 1 { prev[j] = j; }
  for i in 1..n + 1 {
    cur[0] = i;
    for j in 1..n + 1 {
      let costo: int = 1;
      if (s[i - 1] == t[j - 1]) { costo = 0; }
      let mejor: int = prev[j - 1] + costo;
      if (prev[j] + 1 < mejor) { mejor = prev[j] + 1; }
      if (cur[j - 1] + 1 < mejor) { mejor = cur[j - 1] + 1; }
      cur[j] = mejor;
    }
    for j in 0..n + 1 { prev[j] = cur[j]; }
  }
  return prev[n];
}`),

P('lcs', LCG + `
fn run(): int {
  let n: int = 5000;
  let s: arr_int = newint(n);
  let t: arr_int = newint(n);
  let x: int = 777;
  for i in 0..n {
    x = lcg(x); s[i] = x % 4;
    x = lcg(x); t[i] = x % 4;
  }
  let prev: arr_int = newint(n + 1);
  let cur: arr_int = newint(n + 1);
  for i in 1..n + 1 {
    for j in 1..n + 1 {
      if (s[i - 1] == t[j - 1]) { cur[j] = prev[j - 1] + 1; }
      else {
        if (prev[j] > cur[j - 1]) { cur[j] = prev[j]; } else { cur[j] = cur[j - 1]; }
      }
    }
    for j in 0..n + 1 { prev[j] = cur[j]; }
  }
  return prev[n];
}`),

P('mochila', LCG + `
fn run(): int {
  let n: int = 1500;
  let cap: int = 20000;
  let w: arr_int = newint(n);
  let v: arr_int = newint(n);
  let x: int = 31;
  for i in 0..n {
    x = lcg(x); w[i] = 1 + x % 50;
    x = lcg(x); v[i] = x % 100;
  }
  let dp: arr_int = newint(cap + 1);
  for i in 0..n {
    let c: int = cap;
    while (c >= w[i]) {
      let cand: int = dp[c - w[i]] + v[i];
      if (cand > dp[c]) { dp[c] = cand; }
      c = c - 1;
    }
  }
  return dp[cap];
}`),

P('floyd', LCG + `
fn run(): int {
  let n: int = 350;
  let d: arr_int = newint(n * n);
  let x: int = 11;
  for i in 0..n {
    for j in 0..n {
      x = lcg(x);
      d[i * n + j] = 1 + x % 1000;
      if (i == j) { d[i * n + j] = 0; }
    }
  }
  for k in 0..n {
    for i in 0..n {
      for j in 0..n {
        let cand: int = d[i * n + k] + d[k * n + j];
        if (cand < d[i * n + j]) { d[i * n + j] = cand; }
      }
    }
  }
  let c: int = 0;
  for i in 0..n * n { c = (c + d[i]) % 1000000007; }
  return c;
}`),

P('tak', `
fn tak(a: int, b: int, c: int): int {
  if (b < a) { return tak(tak(a - 1, b, c), tak(b - 1, c, a), tak(c - 1, a, b)); }
  return c;
}
fn run(): int { return tak(30, 20, 10); }`),

P('hanoi', `
fn mueve(n: int, a: int): int {
  if (n == 0) { return a % 2; }
  return mueve(n - 1, a + 1) + mueve(n - 1, a + 2) + 1;
}
fn run(): int { return mueve(25, 0); }`),

];
module.exports = { SUITE };
