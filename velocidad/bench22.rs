// bench22.rs — generado por gen22/gen.js: no editar a mano. rustc -O
#![allow(non_snake_case, dead_code)]
use std::time::Instant;
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn matmul_run() -> i64 {
  let mut n: i64 = 440i64;
  let mut a: Vec<f64> = vec![0f64; ((n * n)) as usize];
  let mut b: Vec<f64> = vec![0f64; ((n * n)) as usize];
  let mut c: Vec<f64> = vec![0f64; ((n * n)) as usize];
  for i in (0i64)..(n) {
    for j in (0i64)..(n) {
      a[(((i * n) + j)) as usize] = ((((((i * 7i64) + (j * 3i64)) % 10i64)) as f64) / 10.0);
      b[(((i * n) + j)) as usize] = ((((((i * 5i64) + (j * 11i64)) % 10i64)) as f64) / 10.0);
    }
  }
  for i in (0i64)..(n) {
    for j in (0i64)..(n) {
      let mut s: f64 = 0.0;
      for k in (0i64)..(n) {
        s = (s + (a[(((i * n) + k)) as usize] * b[(((k * n) + j)) as usize]));
      }
      c[(((i * n) + j)) as usize] = s;
    }
  }
  let mut t: f64 = 0.0;
  for i in (0i64)..((n * n)) {
    t = (t + c[(i) as usize]);
  }
  return (((t * 1000.0)) as i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn nbody_avanza(mut n: i64, xs: &mut [f64], ys: &mut [f64], zs: &mut [f64], vx: &mut [f64], vy: &mut [f64], vz: &mut [f64], m: &mut [f64], mut dt: f64) {
  for i in (0i64)..(n) {
    for j in ((i + 1i64))..(n) {
      let mut dx: f64 = (xs[(i) as usize] - xs[(j) as usize]);
      let mut dy: f64 = (ys[(i) as usize] - ys[(j) as usize]);
      let mut dz: f64 = (zs[(i) as usize] - zs[(j) as usize]);
      let mut d2: f64 = (((dx * dx) + (dy * dy)) + (dz * dz));
      let mut mag: f64 = (dt / (d2 * (d2).sqrt()));
      vx[(i) as usize] = (vx[(i) as usize] - ((dx * m[(j) as usize]) * mag));
      vy[(i) as usize] = (vy[(i) as usize] - ((dy * m[(j) as usize]) * mag));
      vz[(i) as usize] = (vz[(i) as usize] - ((dz * m[(j) as usize]) * mag));
      vx[(j) as usize] = (vx[(j) as usize] + ((dx * m[(i) as usize]) * mag));
      vy[(j) as usize] = (vy[(j) as usize] + ((dy * m[(i) as usize]) * mag));
      vz[(j) as usize] = (vz[(j) as usize] + ((dz * m[(i) as usize]) * mag));
    }
  }
  for i in (0i64)..(n) {
    xs[(i) as usize] = (xs[(i) as usize] + (dt * vx[(i) as usize]));
    ys[(i) as usize] = (ys[(i) as usize] + (dt * vy[(i) as usize]));
    zs[(i) as usize] = (zs[(i) as usize] + (dt * vz[(i) as usize]));
  }
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn nbody_run() -> i64 {
  let mut n: i64 = 5i64;
  let mut xs: Vec<f64> = vec![0f64; (n) as usize];
  let mut ys: Vec<f64> = vec![0f64; (n) as usize];
  let mut zs: Vec<f64> = vec![0f64; (n) as usize];
  let mut vx: Vec<f64> = vec![0f64; (n) as usize];
  let mut vy: Vec<f64> = vec![0f64; (n) as usize];
  let mut vz: Vec<f64> = vec![0f64; (n) as usize];
  let mut m: Vec<f64> = vec![0f64; (n) as usize];
  for i in (0i64)..(n) {
    xs[(i) as usize] = ((((i) as f64) * 1.5) + 0.1);
    ys[(i) as usize] = (((((i * i)) as f64) * 0.7) - 1.0);
    zs[(i) as usize] = (((((i * 3i64) % 4i64)) as f64) - 0.5);
    vx[(i) as usize] = (((i) as f64) * 0.01);
    vy[(i) as usize] = (0.02 - (((i) as f64) * 0.005));
    vz[(i) as usize] = (0.001 * ((i) as f64));
    m[(i) as usize] = (1.0 + (((i) as f64) * 0.5));
  }
  for s in (0i64)..(800000i64) {
    nbody_avanza(n, &mut xs, &mut ys, &mut zs, &mut vx, &mut vy, &mut vz, &mut m, 0.001);
  }
  let mut t: f64 = 0.0;
  for i in (0i64)..(n) {
    t = (((t + xs[(i) as usize]) + ys[(i) as usize]) + zs[(i) as usize]);
  }
  return (((t * 1000000.0)) as i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn spectral_aij(mut i: i64, mut j: i64) -> f64 {
  return (1.0 / ((((((((i + j) * ((i + j) + 1i64))) / (2i64)) + i) + 1i64)) as f64));
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn spectral_mulAv(mut n: i64, v: &mut [f64], av: &mut [f64]) {
  for i in (0i64)..(n) {
    let mut s: f64 = 0.0;
    for j in (0i64)..(n) {
      s = (s + (spectral_aij(i, j) * v[(j) as usize]));
    }
    av[(i) as usize] = s;
  }
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn spectral_mulAtv(mut n: i64, v: &mut [f64], atv: &mut [f64]) {
  for i in (0i64)..(n) {
    let mut s: f64 = 0.0;
    for j in (0i64)..(n) {
      s = (s + (spectral_aij(j, i) * v[(j) as usize]));
    }
    atv[(i) as usize] = s;
  }
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn spectral_run() -> i64 {
  let mut n: i64 = 800i64;
  let mut u: Vec<f64> = vec![0f64; (n) as usize];
  let mut v: Vec<f64> = vec![0f64; (n) as usize];
  let mut tmp: Vec<f64> = vec![0f64; (n) as usize];
  for i in (0i64)..(n) {
    u[(i) as usize] = 1.0;
  }
  for it in (0i64)..(10i64) {
    spectral_mulAv(n, &mut u, &mut tmp);
    spectral_mulAtv(n, &mut tmp, &mut v);
    spectral_mulAv(n, &mut v, &mut tmp);
    spectral_mulAtv(n, &mut tmp, &mut u);
  }
  let mut vbv: f64 = 0.0;
  let mut vv: f64 = 0.0;
  for i in (0i64)..(n) {
    vbv = (vbv + (u[(i) as usize] * v[(i) as usize]));
    vv = (vv + (v[(i) as usize] * v[(i) as usize]));
  }
  return (((((vbv / vv)).sqrt() * 1000000000.0)) as i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn fannkuch_run() -> i64 {
  let mut n: i64 = 9i64;
  let mut perm1: Vec<i64> = vec![0i64; (n) as usize];
  let mut perm: Vec<i64> = vec![0i64; (n) as usize];
  let mut count: Vec<i64> = vec![0i64; (n) as usize];
  for i in (0i64)..(n) {
    perm1[(i) as usize] = i;
  }
  let mut maxFlips: i64 = 0i64;
  let mut checksum: i64 = 0i64;
  let mut permCount: i64 = 0i64;
  let mut r: i64 = n;
  while 1i64 == 1i64 {
    while r != 1i64 {
      count[((r - 1i64)) as usize] = r;
      r = (r - 1i64);
    }
    for i in (0i64)..(n) {
      perm[(i) as usize] = perm1[(i) as usize];
    }
    let mut flips: i64 = 0i64;
    let mut k: i64 = perm[(0i64) as usize];
    while k != 0i64 {
      let mut i: i64 = 0i64;
      let mut j: i64 = k;
      while i < j {
        let mut t: i64 = perm[(i) as usize];
        perm[(i) as usize] = perm[(j) as usize];
        perm[(j) as usize] = t;
        i = (i + 1i64);
        j = (j - 1i64);
      }
      flips = (flips + 1i64);
      k = perm[(0i64) as usize];
    }
    if flips > maxFlips {
      maxFlips = flips;
    }
    if (permCount % 2i64) == 0i64 {
      checksum = (checksum + flips);
    } else {
      checksum = (checksum - flips);
    }
    let mut seguir: i64 = 1i64;
    while seguir == 1i64 {
      if r == n {
        return ((checksum * 1000i64) + maxFlips);
      }
      let mut p0: i64 = perm1[(0i64) as usize];
      let mut q: i64 = 0i64;
      while q < r {
        perm1[(q) as usize] = perm1[((q + 1i64)) as usize];
        q = (q + 1i64);
      }
      perm1[(r) as usize] = p0;
      count[(r) as usize] = (count[(r) as usize] - 1i64);
      if count[(r) as usize] > 0i64 {
        seguir = 0i64;
      } else {
        r = (r + 1i64);
      }
    }
    permCount = (permCount + 1i64);
  }
  return 0i64;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn collatz_run() -> i64 {
  let mut mejor: i64 = 0i64;
  let mut mejorPasos: i64 = 0i64;
  for s in (1i64)..(400000i64) {
    let mut x: i64 = s;
    let mut pasos: i64 = 1i64;
    while x != 1i64 {
      if (x % 2i64) == 0i64 {
        x = ((x) / (2i64));
      } else {
        x = ((3i64 * x) + 1i64);
      }
      pasos = (pasos + 1i64);
    }
    if pasos > mejorPasos {
      mejorPasos = pasos;
      mejor = s;
    }
  }
  return ((mejor * 1000i64) + mejorPasos);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn nqueens_coloca(mut n: i64, mut fila: i64, cols: &mut [i64], d1: &mut [i64], d2: &mut [i64]) -> i64 {
  if fila == n {
    return 1i64;
  }
  let mut total: i64 = 0i64;
  for c in (0i64)..(n) {
    if ((cols[(c) as usize] == 0i64) && (d1[((fila + c)) as usize] == 0i64)) && (d2[((((fila - c) + n) - 1i64)) as usize] == 0i64) {
      cols[(c) as usize] = 1i64;
      d1[((fila + c)) as usize] = 1i64;
      d2[((((fila - c) + n) - 1i64)) as usize] = 1i64;
      total = (total + nqueens_coloca(n, (fila + 1i64), cols, d1, d2));
      cols[(c) as usize] = 0i64;
      d1[((fila + c)) as usize] = 0i64;
      d2[((((fila - c) + n) - 1i64)) as usize] = 0i64;
    }
  }
  return total;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn nqueens_run() -> i64 {
  let mut n: i64 = 12i64;
  return nqueens_coloca(n, 0i64, &mut vec![0i64; (n) as usize], &mut vec![0i64; ((2i64 * n)) as usize], &mut vec![0i64; ((2i64 * n)) as usize]);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn quicksort_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn quicksort_qsort(a: &mut [i64], mut lo: i64, mut hi: i64) {
  if lo < hi {
    let mut p: i64 = a[((((lo + hi)) / (2i64))) as usize];
    let mut i: i64 = lo;
    let mut j: i64 = hi;
    while i <= j {
      while a[(i) as usize] < p {
        i = (i + 1i64);
      }
      while a[(j) as usize] > p {
        j = (j - 1i64);
      }
      if i <= j {
        let mut t: i64 = a[(i) as usize];
        a[(i) as usize] = a[(j) as usize];
        a[(j) as usize] = t;
        i = (i + 1i64);
        j = (j - 1i64);
      }
    }
    quicksort_qsort(a, lo, j);
    quicksort_qsort(a, i, hi);
  }
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn quicksort_run() -> i64 {
  let mut n: i64 = 400000i64;
  let mut a: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 42i64;
  for i in (0i64)..(n) {
    x = quicksort_lcg(x);
    a[(i) as usize] = x;
  }
  quicksort_qsort(&mut a, 0i64, (n - 1i64));
  let mut c: i64 = 0i64;
  for i in (0i64)..(n) {
    c = ((c + ((a[(i) as usize] % 1000003i64) * ((i % 13i64) + 1i64))) % 1000000007i64);
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn heapsort_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn heapsort_hunde(a: &mut [i64], mut ini: i64, mut fin: i64) {
  let mut raiz: i64 = ini;
  while ((raiz * 2i64) + 1i64) <= fin {
    let mut hijo: i64 = ((raiz * 2i64) + 1i64);
    let mut cambio: i64 = raiz;
    if a[(cambio) as usize] < a[(hijo) as usize] {
      cambio = hijo;
    }
    if ((hijo + 1i64) <= fin) && (a[(cambio) as usize] < a[((hijo + 1i64)) as usize]) {
      cambio = (hijo + 1i64);
    }
    if cambio == raiz {
      return;
    }
    let mut t: i64 = a[(raiz) as usize];
    a[(raiz) as usize] = a[(cambio) as usize];
    a[(cambio) as usize] = t;
    raiz = cambio;
  }
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn heapsort_run() -> i64 {
  let mut n: i64 = 300000i64;
  let mut a: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 7i64;
  for i in (0i64)..(n) {
    x = heapsort_lcg(x);
    a[(i) as usize] = x;
  }
  let mut ini: i64 = (((n - 2i64)) / (2i64));
  while ini >= 0i64 {
    heapsort_hunde(&mut a, ini, (n - 1i64));
    ini = (ini - 1i64);
  }
  let mut fin: i64 = (n - 1i64);
  while fin > 0i64 {
    let mut t: i64 = a[(fin) as usize];
    a[(fin) as usize] = a[(0i64) as usize];
    a[(0i64) as usize] = t;
    fin = (fin - 1i64);
    heapsort_hunde(&mut a, 0i64, fin);
  }
  let mut c: i64 = 0i64;
  for i in (0i64)..(n) {
    c = ((c + ((a[(i) as usize] % 1000003i64) * ((i % 13i64) + 1i64))) % 1000000007i64);
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn bubble_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn bubble_run() -> i64 {
  let mut n: i64 = 9000i64;
  let mut a: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 99i64;
  for i in (0i64)..(n) {
    x = bubble_lcg(x);
    a[(i) as usize] = (x % 100000i64);
  }
  for i in (0i64)..((n - 1i64)) {
    for j in (0i64)..(((n - 1i64) - i)) {
      if a[(j) as usize] > a[((j + 1i64)) as usize] {
        let mut t: i64 = a[(j) as usize];
        a[(j) as usize] = a[((j + 1i64)) as usize];
        a[((j + 1i64)) as usize] = t;
      }
    }
  }
  let mut c: i64 = 0i64;
  for i in (0i64)..(n) {
    c = ((c + (a[(i) as usize] * ((i % 7i64) + 1i64))) % 1000000007i64);
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn fibmod_run() -> i64 {
  let mut a: i64 = 0i64;
  let mut b: i64 = 1i64;
  for i in (0i64)..(15000000i64) {
    let mut t: i64 = ((a + b) % 1000000007i64);
    a = b;
    b = t;
  }
  return b;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn primos_esPrimo(mut n: i64) -> i64 {
  if n < 2i64 {
    return 0i64;
  }
  let mut d: i64 = 2i64;
  while (d * d) <= n {
    if (n % d) == 0i64 {
      return 0i64;
    }
    d = (d + 1i64);
  }
  return 1i64;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn primos_run() -> i64 {
  let mut cuenta: i64 = 0i64;
  for n in (0i64)..(200000i64) {
    cuenta = (cuenta + primos_esPrimo(n));
  }
  return cuenta;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn mcd_mcd(mut a: i64, mut b: i64) -> i64 {
  while b != 0i64 {
    let mut t: i64 = (a % b);
    a = b;
    b = t;
  }
  return a;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn mcd_run() -> i64 {
  let mut s: i64 = 0i64;
  for i in (1i64)..(1500i64) {
    for j in (1i64)..(1500i64) {
      s = (s + mcd_mcd(i, j));
    }
  }
  return s;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn leibniz_run() -> i64 {
  let mut s: f64 = 0.0;
  let mut signo: f64 = 1.0;
  for k in (0i64)..(20000000i64) {
    s = (s + (signo / ((((2i64 * k) + 1i64)) as f64)));
    signo = (-signo);
  }
  return ((((s * 4.0) * 1000000000.0)) as i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn montecarlo_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn montecarlo_run() -> i64 {
  let mut x: i64 = 2024i64;
  let mut dentro: i64 = 0i64;
  for i in (0i64)..(5000000i64) {
    x = montecarlo_lcg(x);
    let mut u: f64 = (((x) as f64) / 2147483647.0);
    x = montecarlo_lcg(x);
    let mut v: f64 = (((x) as f64) / 2147483647.0);
    if ((u * u) + (v * v)) <= 1.0 {
      dentro = (dentro + 1i64);
    }
  }
  return dentro;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn saxpy_run() -> i64 {
  let mut n: i64 = 1000000i64;
  let mut xs: Vec<f64> = vec![0f64; (n) as usize];
  let mut ys: Vec<f64> = vec![0f64; (n) as usize];
  for i in (0i64)..(n) {
    xs[(i) as usize] = ((((i % 100i64)) as f64) * 0.01);
    ys[(i) as usize] = ((((i % 37i64)) as f64) * 0.5);
  }
  for rep in (0i64)..(20i64) {
    for i in (0i64)..(n) {
      ys[(i) as usize] = ((0.5 * xs[(i) as usize]) + ys[(i) as usize]);
    }
  }
  let mut t: f64 = 0.0;
  for i in (0i64)..(n) {
    t = (t + ys[(i) as usize]);
  }
  return (((t * 1000.0)) as i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn histograma_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn histograma_run() -> i64 {
  let mut h: Vec<i64> = vec![0i64; (1000i64) as usize];
  let mut x: i64 = 5i64;
  for i in (0i64)..(6000000i64) {
    x = histograma_lcg(x);
    let mut b: i64 = (x % 1000i64);
    h[(b) as usize] = (h[(b) as usize] + 1i64);
  }
  let mut c: i64 = 0i64;
  for i in (0i64)..(1000i64) {
    c = ((c + (h[(i) as usize] * (i + 1i64))) % 1000000007i64);
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn editdist_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn editdist_run() -> i64 {
  let mut n: i64 = 5000i64;
  let mut s: Vec<i64> = vec![0i64; (n) as usize];
  let mut t: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 12345i64;
  for i in (0i64)..(n) {
    x = editdist_lcg(x);
    s[(i) as usize] = (x % 4i64);
    x = editdist_lcg(x);
    t[(i) as usize] = (x % 4i64);
  }
  let mut prev: Vec<i64> = vec![0i64; ((n + 1i64)) as usize];
  let mut cur: Vec<i64> = vec![0i64; ((n + 1i64)) as usize];
  for j in (0i64)..((n + 1i64)) {
    prev[(j) as usize] = j;
  }
  for i in (1i64)..((n + 1i64)) {
    cur[(0i64) as usize] = i;
    for j in (1i64)..((n + 1i64)) {
      let mut costo: i64 = 1i64;
      if s[((i - 1i64)) as usize] == t[((j - 1i64)) as usize] {
        costo = 0i64;
      }
      let mut mejor: i64 = (prev[((j - 1i64)) as usize] + costo);
      if (prev[(j) as usize] + 1i64) < mejor {
        mejor = (prev[(j) as usize] + 1i64);
      }
      if (cur[((j - 1i64)) as usize] + 1i64) < mejor {
        mejor = (cur[((j - 1i64)) as usize] + 1i64);
      }
      cur[(j) as usize] = mejor;
    }
    for j in (0i64)..((n + 1i64)) {
      prev[(j) as usize] = cur[(j) as usize];
    }
  }
  return prev[(n) as usize];
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn lcs_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn lcs_run() -> i64 {
  let mut n: i64 = 5000i64;
  let mut s: Vec<i64> = vec![0i64; (n) as usize];
  let mut t: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 777i64;
  for i in (0i64)..(n) {
    x = lcs_lcg(x);
    s[(i) as usize] = (x % 4i64);
    x = lcs_lcg(x);
    t[(i) as usize] = (x % 4i64);
  }
  let mut prev: Vec<i64> = vec![0i64; ((n + 1i64)) as usize];
  let mut cur: Vec<i64> = vec![0i64; ((n + 1i64)) as usize];
  for i in (1i64)..((n + 1i64)) {
    for j in (1i64)..((n + 1i64)) {
      if s[((i - 1i64)) as usize] == t[((j - 1i64)) as usize] {
        cur[(j) as usize] = (prev[((j - 1i64)) as usize] + 1i64);
      } else {
        if prev[(j) as usize] > cur[((j - 1i64)) as usize] {
          cur[(j) as usize] = prev[(j) as usize];
        } else {
          cur[(j) as usize] = cur[((j - 1i64)) as usize];
        }
      }
    }
    for j in (0i64)..((n + 1i64)) {
      prev[(j) as usize] = cur[(j) as usize];
    }
  }
  return prev[(n) as usize];
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn mochila_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn mochila_run() -> i64 {
  let mut n: i64 = 1500i64;
  let mut cap: i64 = 20000i64;
  let mut w: Vec<i64> = vec![0i64; (n) as usize];
  let mut v: Vec<i64> = vec![0i64; (n) as usize];
  let mut x: i64 = 31i64;
  for i in (0i64)..(n) {
    x = mochila_lcg(x);
    w[(i) as usize] = (1i64 + (x % 50i64));
    x = mochila_lcg(x);
    v[(i) as usize] = (x % 100i64);
  }
  let mut dp: Vec<i64> = vec![0i64; ((cap + 1i64)) as usize];
  for i in (0i64)..(n) {
    let mut c: i64 = cap;
    while c >= w[(i) as usize] {
      let mut cand: i64 = (dp[((c - w[(i) as usize])) as usize] + v[(i) as usize]);
      if cand > dp[(c) as usize] {
        dp[(c) as usize] = cand;
      }
      c = (c - 1i64);
    }
  }
  return dp[(cap) as usize];
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn floyd_lcg(mut x: i64) -> i64 {
  return ((x * 16807i64) % 2147483647i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn floyd_run() -> i64 {
  let mut n: i64 = 350i64;
  let mut d: Vec<i64> = vec![0i64; ((n * n)) as usize];
  let mut x: i64 = 11i64;
  for i in (0i64)..(n) {
    for j in (0i64)..(n) {
      x = floyd_lcg(x);
      d[(((i * n) + j)) as usize] = (1i64 + (x % 1000i64));
      if i == j {
        d[(((i * n) + j)) as usize] = 0i64;
      }
    }
  }
  for k in (0i64)..(n) {
    for i in (0i64)..(n) {
      for j in (0i64)..(n) {
        let mut cand: i64 = (d[(((i * n) + k)) as usize] + d[(((k * n) + j)) as usize]);
        if cand < d[(((i * n) + j)) as usize] {
          d[(((i * n) + j)) as usize] = cand;
        }
      }
    }
  }
  let mut c: i64 = 0i64;
  for i in (0i64)..((n * n)) {
    c = ((c + d[(i) as usize]) % 1000000007i64);
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn tak_tak(mut a: i64, mut b: i64, mut c: i64) -> i64 {
  if b < a {
    return tak_tak(tak_tak((a - 1i64), b, c), tak_tak((b - 1i64), c, a), tak_tak((c - 1i64), a, b));
  }
  return c;
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn tak_run() -> i64 {
  return tak_tak(30i64, 20i64, 10i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn hanoi_mueve(mut n: i64, mut a: i64) -> i64 {
  if n == 0i64 {
    return (a % 2i64);
  }
  return ((hanoi_mueve((n - 1i64), (a + 1i64)) + hanoi_mueve((n - 1i64), (a + 2i64))) + 1i64);
}
#[allow(unused_mut, unused_parens, unused_variables, unused_assignments)]
fn hanoi_run() -> i64 {
  return hanoi_mueve(25i64, 0i64);
}
fn main() {
    let t0 = Instant::now(); let r = matmul_run(); println!("matmul = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = nbody_run(); println!("nbody = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = spectral_run(); println!("spectral = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = fannkuch_run(); println!("fannkuch = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = collatz_run(); println!("collatz = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = nqueens_run(); println!("nqueens = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = quicksort_run(); println!("quicksort = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = heapsort_run(); println!("heapsort = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = bubble_run(); println!("bubble = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = fibmod_run(); println!("fibmod = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = primos_run(); println!("primos = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = mcd_run(); println!("mcd = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = leibniz_run(); println!("leibniz = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = montecarlo_run(); println!("montecarlo = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = saxpy_run(); println!("saxpy = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = histograma_run(); println!("histograma = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = editdist_run(); println!("editdist = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = lcs_run(); println!("lcs = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = mochila_run(); println!("mochila = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = floyd_run(); println!("floyd = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = tak_run(); println!("tak = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
    let t0 = Instant::now(); let r = hanoi_run(); println!("hanoi = {} en {} ms", r, (t0.elapsed().as_secs_f64() * 1000.0).round());
}
