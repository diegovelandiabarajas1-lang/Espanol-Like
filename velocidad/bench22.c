/* bench22.c — generado por gen22/gen.js: no editar a mano. Se compila con gcc -O2 y, tal cual, con g++ -O2 -x c++. */
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>
static double reloj(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
static long long matmul_run(void) {
  long long n = 440LL;
  double* a = ((double*)calloc((size_t)((n * n)), 8));
  double* b = ((double*)calloc((size_t)((n * n)), 8));
  double* c = ((double*)calloc((size_t)((n * n)), 8));
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      a[((i * n) + j)] = (((double)((((i * 7LL) + (j * 3LL)) % 10LL))) / 10.0);
      b[((i * n) + j)] = (((double)((((i * 5LL) + (j * 11LL)) % 10LL))) / 10.0);
    }
  }
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      double s = 0.0;
      for (long long k = 0LL; k < n; k++) {
        s = (s + (a[((i * n) + k)] * b[((k * n) + j)]));
      }
      c[((i * n) + j)] = s;
    }
  }
  double t = 0.0;
  for (long long i = 0LL; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return ((long long)((t * 1000.0)));
}
static void nbody_avanza(long long n, double* xs, double* ys, double* zs, double* vx, double* vy, double* vz, double* m, double dt) {
  for (long long i = 0LL; i < n; i++) {
    for (long long j = (i + 1LL); j < n; j++) {
      double dx = (xs[i] - xs[j]);
      double dy = (ys[i] - ys[j]);
      double dz = (zs[i] - zs[j]);
      double d2 = (((dx * dx) + (dy * dy)) + (dz * dz));
      double mag = (dt / (d2 * sqrt(d2)));
      vx[i] = (vx[i] - ((dx * m[j]) * mag));
      vy[i] = (vy[i] - ((dy * m[j]) * mag));
      vz[i] = (vz[i] - ((dz * m[j]) * mag));
      vx[j] = (vx[j] + ((dx * m[i]) * mag));
      vy[j] = (vy[j] + ((dy * m[i]) * mag));
      vz[j] = (vz[j] + ((dz * m[i]) * mag));
    }
  }
  for (long long i = 0LL; i < n; i++) {
    xs[i] = (xs[i] + (dt * vx[i]));
    ys[i] = (ys[i] + (dt * vy[i]));
    zs[i] = (zs[i] + (dt * vz[i]));
  }
}
static long long nbody_run(void) {
  long long n = 5LL;
  double* xs = ((double*)calloc((size_t)(n), 8));
  double* ys = ((double*)calloc((size_t)(n), 8));
  double* zs = ((double*)calloc((size_t)(n), 8));
  double* vx = ((double*)calloc((size_t)(n), 8));
  double* vy = ((double*)calloc((size_t)(n), 8));
  double* vz = ((double*)calloc((size_t)(n), 8));
  double* m = ((double*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    xs[i] = ((((double)(i)) * 1.5) + 0.1);
    ys[i] = ((((double)((i * i))) * 0.7) - 1.0);
    zs[i] = (((double)(((i * 3LL) % 4LL))) - 0.5);
    vx[i] = (((double)(i)) * 0.01);
    vy[i] = (0.02 - (((double)(i)) * 0.005));
    vz[i] = (0.001 * ((double)(i)));
    m[i] = (1.0 + (((double)(i)) * 0.5));
  }
  for (long long s = 0LL; s < 800000LL; s++) {
    nbody_avanza(n, xs, ys, zs, vx, vy, vz, m, 0.001);
  }
  double t = 0.0;
  for (long long i = 0LL; i < n; i++) {
    t = (((t + xs[i]) + ys[i]) + zs[i]);
  }
  return ((long long)((t * 1000000.0)));
}
static double spectral_aij(long long i, long long j) {
  return (1.0 / ((double)(((((((i + j) * ((i + j) + 1LL))) / (2LL)) + i) + 1LL))));
}
static void spectral_mulAv(long long n, double* v, double* av) {
  for (long long i = 0LL; i < n; i++) {
    double s = 0.0;
    for (long long j = 0LL; j < n; j++) {
      s = (s + (spectral_aij(i, j) * v[j]));
    }
    av[i] = s;
  }
}
static void spectral_mulAtv(long long n, double* v, double* atv) {
  for (long long i = 0LL; i < n; i++) {
    double s = 0.0;
    for (long long j = 0LL; j < n; j++) {
      s = (s + (spectral_aij(j, i) * v[j]));
    }
    atv[i] = s;
  }
}
static long long spectral_run(void) {
  long long n = 800LL;
  double* u = ((double*)calloc((size_t)(n), 8));
  double* v = ((double*)calloc((size_t)(n), 8));
  double* tmp = ((double*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    u[i] = 1.0;
  }
  for (long long it = 0LL; it < 10LL; it++) {
    spectral_mulAv(n, u, tmp);
    spectral_mulAtv(n, tmp, v);
    spectral_mulAv(n, v, tmp);
    spectral_mulAtv(n, tmp, u);
  }
  double vbv = 0.0;
  double vv = 0.0;
  for (long long i = 0LL; i < n; i++) {
    vbv = (vbv + (u[i] * v[i]));
    vv = (vv + (v[i] * v[i]));
  }
  return ((long long)((sqrt((vbv / vv)) * 1000000000.0)));
}
static long long fannkuch_run(void) {
  long long n = 9LL;
  long long* perm1 = ((long long*)calloc((size_t)(n), 8));
  long long* perm = ((long long*)calloc((size_t)(n), 8));
  long long* count = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    perm1[i] = i;
  }
  long long maxFlips = 0LL;
  long long checksum = 0LL;
  long long permCount = 0LL;
  long long r = n;
  while ((1LL == 1LL)) {
    while ((r != 1LL)) {
      count[(r - 1LL)] = r;
      r = (r - 1LL);
    }
    for (long long i = 0LL; i < n; i++) {
      perm[i] = perm1[i];
    }
    long long flips = 0LL;
    long long k = perm[0LL];
    while ((k != 0LL)) {
      long long i = 0LL;
      long long j = k;
      while ((i < j)) {
        long long t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
        i = (i + 1LL);
        j = (j - 1LL);
      }
      flips = (flips + 1LL);
      k = perm[0LL];
    }
    if ((flips > maxFlips)) {
      maxFlips = flips;
    }
    if (((permCount % 2LL) == 0LL)) {
      checksum = (checksum + flips);
    } else {
      checksum = (checksum - flips);
    }
    long long seguir = 1LL;
    while ((seguir == 1LL)) {
      if ((r == n)) {
        return ((checksum * 1000LL) + maxFlips);
      }
      long long p0 = perm1[0LL];
      long long q = 0LL;
      while ((q < r)) {
        perm1[q] = perm1[(q + 1LL)];
        q = (q + 1LL);
      }
      perm1[r] = p0;
      count[r] = (count[r] - 1LL);
      if ((count[r] > 0LL)) {
        seguir = 0LL;
      } else {
        r = (r + 1LL);
      }
    }
    permCount = (permCount + 1LL);
  }
  return 0LL;
}
static long long collatz_run(void) {
  long long mejor = 0LL;
  long long mejorPasos = 0LL;
  for (long long s = 1LL; s < 400000LL; s++) {
    long long x = s;
    long long pasos = 1LL;
    while ((x != 1LL)) {
      if (((x % 2LL) == 0LL)) {
        x = ((x) / (2LL));
      } else {
        x = ((3LL * x) + 1LL);
      }
      pasos = (pasos + 1LL);
    }
    if ((pasos > mejorPasos)) {
      mejorPasos = pasos;
      mejor = s;
    }
  }
  return ((mejor * 1000LL) + mejorPasos);
}
static long long nqueens_coloca(long long n, long long fila, long long* cols, long long* d1, long long* d2) {
  if ((fila == n)) {
    return 1LL;
  }
  long long total = 0LL;
  for (long long c = 0LL; c < n; c++) {
    if ((((cols[c] == 0LL) && (d1[(fila + c)] == 0LL)) && (d2[(((fila - c) + n) - 1LL)] == 0LL))) {
      cols[c] = 1LL;
      d1[(fila + c)] = 1LL;
      d2[(((fila - c) + n) - 1LL)] = 1LL;
      total = (total + nqueens_coloca(n, (fila + 1LL), cols, d1, d2));
      cols[c] = 0LL;
      d1[(fila + c)] = 0LL;
      d2[(((fila - c) + n) - 1LL)] = 0LL;
    }
  }
  return total;
}
static long long nqueens_run(void) {
  long long n = 12LL;
  return nqueens_coloca(n, 0LL, ((long long*)calloc((size_t)(n), 8)), ((long long*)calloc((size_t)((2LL * n)), 8)), ((long long*)calloc((size_t)((2LL * n)), 8)));
}
static long long quicksort_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static void quicksort_qsort(long long* a, long long lo, long long hi) {
  if ((lo < hi)) {
    long long p = a[(((lo + hi)) / (2LL))];
    long long i = lo;
    long long j = hi;
    while ((i <= j)) {
      while ((a[i] < p)) {
        i = (i + 1LL);
      }
      while ((a[j] > p)) {
        j = (j - 1LL);
      }
      if ((i <= j)) {
        long long t = a[i];
        a[i] = a[j];
        a[j] = t;
        i = (i + 1LL);
        j = (j - 1LL);
      }
    }
    quicksort_qsort(a, lo, j);
    quicksort_qsort(a, i, hi);
  }
}
static long long quicksort_run(void) {
  long long n = 400000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long x = 42LL;
  for (long long i = 0LL; i < n; i++) {
    x = quicksort_lcg(x);
    a[i] = x;
  }
  quicksort_qsort(a, 0LL, (n - 1LL));
  long long c = 0LL;
  for (long long i = 0LL; i < n; i++) {
    c = ((c + ((a[i] % 1000003LL) * ((i % 13LL) + 1LL))) % 1000000007LL);
  }
  return c;
}
static long long heapsort_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static void heapsort_hunde(long long* a, long long ini, long long fin) {
  long long raiz = ini;
  while ((((raiz * 2LL) + 1LL) <= fin)) {
    long long hijo = ((raiz * 2LL) + 1LL);
    long long cambio = raiz;
    if ((a[cambio] < a[hijo])) {
      cambio = hijo;
    }
    if ((((hijo + 1LL) <= fin) && (a[cambio] < a[(hijo + 1LL)]))) {
      cambio = (hijo + 1LL);
    }
    if ((cambio == raiz)) {
      return;
    }
    long long t = a[raiz];
    a[raiz] = a[cambio];
    a[cambio] = t;
    raiz = cambio;
  }
}
static long long heapsort_run(void) {
  long long n = 300000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long x = 7LL;
  for (long long i = 0LL; i < n; i++) {
    x = heapsort_lcg(x);
    a[i] = x;
  }
  long long ini = (((n - 2LL)) / (2LL));
  while ((ini >= 0LL)) {
    heapsort_hunde(a, ini, (n - 1LL));
    ini = (ini - 1LL);
  }
  long long fin = (n - 1LL);
  while ((fin > 0LL)) {
    long long t = a[fin];
    a[fin] = a[0LL];
    a[0LL] = t;
    fin = (fin - 1LL);
    heapsort_hunde(a, 0LL, fin);
  }
  long long c = 0LL;
  for (long long i = 0LL; i < n; i++) {
    c = ((c + ((a[i] % 1000003LL) * ((i % 13LL) + 1LL))) % 1000000007LL);
  }
  return c;
}
static long long bubble_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long bubble_run(void) {
  long long n = 9000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long x = 99LL;
  for (long long i = 0LL; i < n; i++) {
    x = bubble_lcg(x);
    a[i] = (x % 100000LL);
  }
  for (long long i = 0LL; i < (n - 1LL); i++) {
    for (long long j = 0LL; j < ((n - 1LL) - i); j++) {
      if ((a[j] > a[(j + 1LL)])) {
        long long t = a[j];
        a[j] = a[(j + 1LL)];
        a[(j + 1LL)] = t;
      }
    }
  }
  long long c = 0LL;
  for (long long i = 0LL; i < n; i++) {
    c = ((c + (a[i] * ((i % 7LL) + 1LL))) % 1000000007LL);
  }
  return c;
}
static long long fibmod_run(void) {
  long long a = 0LL;
  long long b = 1LL;
  for (long long i = 0LL; i < 15000000LL; i++) {
    long long t = ((a + b) % 1000000007LL);
    a = b;
    b = t;
  }
  return b;
}
static long long primos_esPrimo(long long n) {
  if ((n < 2LL)) {
    return 0LL;
  }
  long long d = 2LL;
  while (((d * d) <= n)) {
    if (((n % d) == 0LL)) {
      return 0LL;
    }
    d = (d + 1LL);
  }
  return 1LL;
}
static long long primos_run(void) {
  long long cuenta = 0LL;
  for (long long n = 0LL; n < 200000LL; n++) {
    cuenta = (cuenta + primos_esPrimo(n));
  }
  return cuenta;
}
static long long mcd_mcd(long long a, long long b) {
  while ((b != 0LL)) {
    long long t = (a % b);
    a = b;
    b = t;
  }
  return a;
}
static long long mcd_run(void) {
  long long s = 0LL;
  for (long long i = 1LL; i < 1500LL; i++) {
    for (long long j = 1LL; j < 1500LL; j++) {
      s = (s + mcd_mcd(i, j));
    }
  }
  return s;
}
static long long leibniz_run(void) {
  double s = 0.0;
  double signo = 1.0;
  for (long long k = 0LL; k < 20000000LL; k++) {
    s = (s + (signo / ((double)(((2LL * k) + 1LL)))));
    signo = (-signo);
  }
  return ((long long)(((s * 4.0) * 1000000000.0)));
}
static long long montecarlo_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long montecarlo_run(void) {
  long long x = 2024LL;
  long long dentro = 0LL;
  for (long long i = 0LL; i < 5000000LL; i++) {
    x = montecarlo_lcg(x);
    double u = (((double)(x)) / 2147483647.0);
    x = montecarlo_lcg(x);
    double v = (((double)(x)) / 2147483647.0);
    if ((((u * u) + (v * v)) <= 1.0)) {
      dentro = (dentro + 1LL);
    }
  }
  return dentro;
}
static long long saxpy_run(void) {
  long long n = 1000000LL;
  double* xs = ((double*)calloc((size_t)(n), 8));
  double* ys = ((double*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    xs[i] = (((double)((i % 100LL))) * 0.01);
    ys[i] = (((double)((i % 37LL))) * 0.5);
  }
  for (long long rep = 0LL; rep < 20LL; rep++) {
    for (long long i = 0LL; i < n; i++) {
      ys[i] = ((0.5 * xs[i]) + ys[i]);
    }
  }
  double t = 0.0;
  for (long long i = 0LL; i < n; i++) {
    t = (t + ys[i]);
  }
  return ((long long)((t * 1000.0)));
}
static long long histograma_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long histograma_run(void) {
  long long* h = ((long long*)calloc((size_t)(1000LL), 8));
  long long x = 5LL;
  for (long long i = 0LL; i < 6000000LL; i++) {
    x = histograma_lcg(x);
    long long b = (x % 1000LL);
    h[b] = (h[b] + 1LL);
  }
  long long c = 0LL;
  for (long long i = 0LL; i < 1000LL; i++) {
    c = ((c + (h[i] * (i + 1LL))) % 1000000007LL);
  }
  return c;
}
static long long editdist_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long editdist_run(void) {
  long long n = 5000LL;
  long long* s = ((long long*)calloc((size_t)(n), 8));
  long long* t = ((long long*)calloc((size_t)(n), 8));
  long long x = 12345LL;
  for (long long i = 0LL; i < n; i++) {
    x = editdist_lcg(x);
    s[i] = (x % 4LL);
    x = editdist_lcg(x);
    t[i] = (x % 4LL);
  }
  long long* prev = ((long long*)calloc((size_t)((n + 1LL)), 8));
  long long* cur = ((long long*)calloc((size_t)((n + 1LL)), 8));
  for (long long j = 0LL; j < (n + 1LL); j++) {
    prev[j] = j;
  }
  for (long long i = 1LL; i < (n + 1LL); i++) {
    cur[0LL] = i;
    for (long long j = 1LL; j < (n + 1LL); j++) {
      long long costo = 1LL;
      if ((s[(i - 1LL)] == t[(j - 1LL)])) {
        costo = 0LL;
      }
      long long mejor = (prev[(j - 1LL)] + costo);
      if (((prev[j] + 1LL) < mejor)) {
        mejor = (prev[j] + 1LL);
      }
      if (((cur[(j - 1LL)] + 1LL) < mejor)) {
        mejor = (cur[(j - 1LL)] + 1LL);
      }
      cur[j] = mejor;
    }
    for (long long j = 0LL; j < (n + 1LL); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
static long long lcs_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long lcs_run(void) {
  long long n = 5000LL;
  long long* s = ((long long*)calloc((size_t)(n), 8));
  long long* t = ((long long*)calloc((size_t)(n), 8));
  long long x = 777LL;
  for (long long i = 0LL; i < n; i++) {
    x = lcs_lcg(x);
    s[i] = (x % 4LL);
    x = lcs_lcg(x);
    t[i] = (x % 4LL);
  }
  long long* prev = ((long long*)calloc((size_t)((n + 1LL)), 8));
  long long* cur = ((long long*)calloc((size_t)((n + 1LL)), 8));
  for (long long i = 1LL; i < (n + 1LL); i++) {
    for (long long j = 1LL; j < (n + 1LL); j++) {
      if ((s[(i - 1LL)] == t[(j - 1LL)])) {
        cur[j] = (prev[(j - 1LL)] + 1LL);
      } else {
        if ((prev[j] > cur[(j - 1LL)])) {
          cur[j] = prev[j];
        } else {
          cur[j] = cur[(j - 1LL)];
        }
      }
    }
    for (long long j = 0LL; j < (n + 1LL); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
static long long mochila_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long mochila_run(void) {
  long long n = 1500LL;
  long long cap = 20000LL;
  long long* w = ((long long*)calloc((size_t)(n), 8));
  long long* v = ((long long*)calloc((size_t)(n), 8));
  long long x = 31LL;
  for (long long i = 0LL; i < n; i++) {
    x = mochila_lcg(x);
    w[i] = (1LL + (x % 50LL));
    x = mochila_lcg(x);
    v[i] = (x % 100LL);
  }
  long long* dp = ((long long*)calloc((size_t)((cap + 1LL)), 8));
  for (long long i = 0LL; i < n; i++) {
    long long c = cap;
    while ((c >= w[i])) {
      long long cand = (dp[(c - w[i])] + v[i]);
      if ((cand > dp[c])) {
        dp[c] = cand;
      }
      c = (c - 1LL);
    }
  }
  return dp[cap];
}
static long long floyd_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long floyd_run(void) {
  long long n = 350LL;
  long long* d = ((long long*)calloc((size_t)((n * n)), 8));
  long long x = 11LL;
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      x = floyd_lcg(x);
      d[((i * n) + j)] = (1LL + (x % 1000LL));
      if ((i == j)) {
        d[((i * n) + j)] = 0LL;
      }
    }
  }
  for (long long k = 0LL; k < n; k++) {
    for (long long i = 0LL; i < n; i++) {
      for (long long j = 0LL; j < n; j++) {
        long long cand = (d[((i * n) + k)] + d[((k * n) + j)]);
        if ((cand < d[((i * n) + j)])) {
          d[((i * n) + j)] = cand;
        }
      }
    }
  }
  long long c = 0LL;
  for (long long i = 0LL; i < (n * n); i++) {
    c = ((c + d[i]) % 1000000007LL);
  }
  return c;
}
static long long tak_tak(long long a, long long b, long long c) {
  if ((b < a)) {
    return tak_tak(tak_tak((a - 1LL), b, c), tak_tak((b - 1LL), c, a), tak_tak((c - 1LL), a, b));
  }
  return c;
}
static long long tak_run(void) {
  return tak_tak(30LL, 20LL, 10LL);
}
static long long hanoi_mueve(long long n, long long a) {
  if ((n == 0LL)) {
    return (a % 2LL);
  }
  return ((hanoi_mueve((n - 1LL), (a + 1LL)) + hanoi_mueve((n - 1LL), (a + 2LL))) + 1LL);
}
static long long hanoi_run(void) {
  return hanoi_mueve(25LL, 0LL);
}
int main(void) {
  double t0; long long r;
  t0 = reloj(); r = matmul_run(); printf("matmul = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = nbody_run(); printf("nbody = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = spectral_run(); printf("spectral = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = fannkuch_run(); printf("fannkuch = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = collatz_run(); printf("collatz = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = nqueens_run(); printf("nqueens = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = quicksort_run(); printf("quicksort = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = heapsort_run(); printf("heapsort = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = bubble_run(); printf("bubble = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = fibmod_run(); printf("fibmod = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = primos_run(); printf("primos = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = mcd_run(); printf("mcd = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = leibniz_run(); printf("leibniz = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = montecarlo_run(); printf("montecarlo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = saxpy_run(); printf("saxpy = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = histograma_run(); printf("histograma = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = editdist_run(); printf("editdist = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = lcs_run(); printf("lcs = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = mochila_run(); printf("mochila = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = floyd_run(); printf("floyd = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = tak_run(); printf("tak = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  t0 = reloj(); r = hanoi_run(); printf("hanoi = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout);
  return 0;
}
