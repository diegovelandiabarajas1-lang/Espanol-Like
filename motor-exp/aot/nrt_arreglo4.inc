/* ============================================================================
 *  (motor-exp A7) Arreglos, cuarta tanda: la transformada de Fourier (Cooley-Tukey para potencias de dos, Bluestein para el resto), el espectro,
 *  las frecuencias y la convolución. Las mismas cuentas, en el mismo orden, que src/11-edsl-numerico.js.
 * ========================================================================== */
static double js_hypot2(double a, double b) {   /* Math.hypot(a, b) de V8: infinito gana a NaN; si no, escala por el mayor y suma con compensación */
  double x = fabs(a), y = fabs(b);
  if (isinf(x) || isinf(y)) return INFINITY;
  if (isnan(x) || isnan(y)) return NAN;
  double mx = x > y ? x : y;
  if (mx == 0) return 0;
  double s = 0, c = 0, v[2] = { a, b };
  for (int i = 0; i < 2; i++) { double r = v[i] / mx, yy = r * r - c, t = s + yy; c = (t - s) - yy; s = t; }
  return sqrt(s) * mx;
}
static void ar4_tabla(int64_t n, double* re, double* im) {
  int64_t mitad = n >> 1;
  for (int64_t k = 0; k < mitad; k++) { double ang = (-2 * 3.141592653589793 * (double)k) / (double)n; re[k] = fd_cos(ang); im[k] = fd_sin(ang); }
}
static void ar4_fft2(double* d, int64_t n, int signo) {
  if (n == 1) return;
  for (int64_t i = 1, j = 0; i < n; i++) {
    int64_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { double t = d[2 * i]; d[2 * i] = d[2 * j]; d[2 * j] = t; t = d[2 * i + 1]; d[2 * i + 1] = d[2 * j + 1]; d[2 * j + 1] = t; }
  }
  int64_t mh = n >> 1; double* tre = (double*)n_mem(sizeof(double) * (size_t)(mh ? mh : 1)); double* tim = (double*)n_mem(sizeof(double) * (size_t)(mh ? mh : 1));
  ar4_tabla(n, tre, tim);
  for (int64_t largo = 2; largo <= n; largo <<= 1) {
    int64_t mitad = largo >> 1, salto = n / largo;
    for (int64_t i = 0; i < n; i += largo) {
      for (int64_t k = 0; k < mitad; k++) {
        int64_t w = k * salto; double wr = tre[w], wi = signo < 0 ? tim[w] : -tim[w];
        int64_t p = i + k, q = p + mitad;
        double qr = d[2 * q], qi = d[2 * q + 1];
        double vr = qr * wr - qi * wi, vi = qr * wi + qi * wr;
        double ur = d[2 * p], ui = d[2 * p + 1];
        d[2 * p] = ur + vr; d[2 * p + 1] = ui + vi;
        d[2 * q] = ur - vr; d[2 * q + 1] = ui - vi;
      }
    }
  }
  free(tre); free(tim);
}
static void ar4_bluestein(double* d, int64_t n, int signo) {
  int64_t t = (int64_t)1 << (int)ceil(fd_log2((double)(2 * n - 1)));
  double* A = (double*)n_mem(sizeof(double) * (size_t)(2 * t)); double* B = (double*)n_mem(sizeof(double) * (size_t)(2 * t));
  memset(A, 0, sizeof(double) * (size_t)(2 * t)); memset(B, 0, sizeof(double) * (size_t)(2 * t));
  double* cr = (double*)n_mem(sizeof(double) * (size_t)n); double* ci = (double*)n_mem(sizeof(double) * (size_t)n);
  for (int64_t j = 0; j < n; j++) {
    double m = fmod((double)j * (double)j, (double)(2 * n));
    double ang = ((double)signo * 3.141592653589793 * m) / (double)n;
    cr[j] = fd_cos(ang); ci[j] = fd_sin(ang);
    double xr = d[2 * j], xi = d[2 * j + 1];
    A[2 * j] = xr * cr[j] - xi * ci[j]; A[2 * j + 1] = xr * ci[j] + xi * cr[j];
    B[2 * j] = cr[j]; B[2 * j + 1] = -ci[j];
    if (j > 0) { B[2 * (t - j)] = cr[j]; B[2 * (t - j) + 1] = -ci[j]; }
  }
  ar4_fft2(A, t, -1); ar4_fft2(B, t, -1);
  for (int64_t i = 0; i < t; i++) { double ar_ = A[2 * i], ai = A[2 * i + 1], br = B[2 * i], bi = B[2 * i + 1]; A[2 * i] = ar_ * br - ai * bi; A[2 * i + 1] = ar_ * bi + ai * br; }
  ar4_fft2(A, t, 1);
  for (int64_t k = 0; k < n; k++) { double vr = A[2 * k] / (double)t, vi = A[2 * k + 1] / (double)t; d[2 * k] = vr * cr[k] - vi * ci[k]; d[2 * k + 1] = vr * ci[k] + vi * cr[k]; }
  free(A); free(B); free(cr); free(ci);
}
static void ar4_transformar(double* d, int64_t n, int signo) { if ((n & (n - 1)) == 0) ar4_fft2(d, n, signo); else ar4_bluestein(d, n, signo); }
/* los números de un arreglo —real o complejo— en un vector de 2n */
static double* ar4_plano(NArr* x, int64_t* n) {
  *n = ar_tam(x); double* d = (double*)n_mem(sizeof(double) * (size_t)(2 * (*n ? *n : 1))); ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  if (x->tipo == AR_COMPLEJO) { const double* s = (const double*)x->buf->d; while (ari_sig(&it, &p)) { d[2 * i] = s[2 * p]; d[2 * i + 1] = s[2 * p + 1]; i++; } }
  else while (ari_sig(&it, &p)) { d[2 * i] = ar_leer(x, p); d[2 * i + 1] = 0; i++; }
  return d;
}
static NV ar4_de_plano(double* d, const NArr* x) {
  NV out = ar_nuevo(x->forma, x->nd, AR_COMPLEJO); if (N_FALLO(out)) return out;
  memcpy(AR(out)->buf->d, d, sizeof(double) * (size_t)(2 * ar_tam(AR(out)))); return out;
}
NAT(ar4_fourier) {
  (void)n; (void)extra; ARRC_(a[0], 1, "fourier"); NArr* x = AR(a[0]);
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("fourier", x->tipo);
  if (x->nd != 1) return ERRP(n_texto_utf8("saca la fila o la columna con fila(a, i) o trozoVarios, y transfórmala"), "«fourier» trabaja sobre una dimensión y llegó un arreglo de %d", (long long)x->nd);
  if (ar_tam(x) < 1) return n_error("«fourier» de un arreglo vacío", NULL);
  int64_t nn; double* d = ar4_plano(x, &nn); ar4_transformar(d, nn, -1);
  NV r = ar4_de_plano(d, x); free(d); return r;
}
NAT(ar4_fourierInversa) {
  (void)n; (void)extra; ARRC_(a[0], 1, "fourierInversa"); NArr* x = AR(a[0]);
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("fourierInversa", x->tipo);
  if (x->nd != 1) return ERR("«fourierInversa» trabaja sobre una dimensión y llegó un arreglo de %d", (long long)x->nd);
  if (ar_tam(x) < 1) return n_error("«fourierInversa» de un arreglo vacío", NULL);
  int64_t nn; double* d = ar4_plano(x, &nn); ar4_transformar(d, nn, 1);
  for (int64_t i = 0; i < 2 * nn; i++) d[i] /= (double)nn;
  NV r = ar4_de_plano(d, x); free(d); return r;
}
NAT(ar4_espectro) {
  (void)n; (void)extra; ARRC_(a[0], 1, "espectro"); NArr* x = AR(a[0]);
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("espectro", x->tipo);
  if (x->nd != 1) return n_error("«espectro» trabaja sobre una dimensión", NULL);
  int64_t nn; double* d = ar4_plano(x, &nn); ar4_transformar(d, nn, -1);
  int64_t f[1] = { nn }; NV out = ar_nuevo(f, 1, AR_REAL);
  if (!N_FALLO(out)) for (int64_t i = 0; i < nn; i++) ((double*)AR(out)->buf->d)[i] = js_hypot2(d[2 * i], d[2 * i + 1]);
  free(d); return out;
}
NAT(ar4_frecuencias) {
  (void)extra;
  if (n < 1 || n > 2) return n_error("«frecuencias» toma cuántos datos hay y, si quieres, cada cuánto se tomaron", NULL);
  NUM(a[0], 1, "frecuencias"); double nn = trunc(a[0].u.n); double paso = 1;
  if (nn < 1) return n_error("«frecuencias» necesita al menos 1", NULL);
  if (n == 2) { NUM(a[1], 2, "frecuencias"); paso = a[1].u.n; }
  if (paso == 0) return n_error("«frecuencias»: el paso de muestreo no puede ser 0", NULL);
  int64_t f[1] = { (int64_t)nn }; NV out = ar_nuevo(f, 1, AR_REAL); if (N_FALLO(out)) return out;
  double* o = (double*)AR(out)->buf->d; int64_t mitad = (int64_t)floor((nn - 1) / 2) + 1;
  for (int64_t i = 0; i < mitad; i++) o[i] = (double)i / (nn * paso);
  for (int64_t i = mitad; i < f[0]; i++) o[i] = (double)(i - f[0]) / (nn * paso);
  return out;
}
NAT(ar4_convolucion) {
  (void)n; (void)extra; ARR_(a[0], 1, "convolucion"); ARR_(a[1], 2, "convolucion");
  NArr *x = AR(a[0]), *y = AR(a[1]);
  if (x->nd != 1 || y->nd != 1) return n_error("«convolucion» toma dos arreglos de una dimensión", NULL);
  int64_t nx = ar_tam(x), ny = ar_tam(y);
  if (nx < 1 || ny < 1) return n_error("«convolucion» de un arreglo vacío", NULL);
  int64_t largo = nx + ny - 1, t = (int64_t)1 << (int)ceil(fd_log2((double)largo));
  double* A = (double*)n_mem(sizeof(double) * (size_t)(2 * t)); double* B = (double*)n_mem(sizeof(double) * (size_t)(2 * t));
  memset(A, 0, sizeof(double) * (size_t)(2 * t)); memset(B, 0, sizeof(double) * (size_t)(2 * t));
  int64_t na, nb; double* vx = ar_valores(x, &na); double* vy = ar_valores(y, &nb);
  for (int64_t i = 0; i < nx; i++) A[2 * i] = vx[i];
  for (int64_t i = 0; i < ny; i++) B[2 * i] = vy[i];
  ar4_fft2(A, t, -1); ar4_fft2(B, t, -1);
  for (int64_t i = 0; i < t; i++) { double ar_ = A[2 * i], ai = A[2 * i + 1], br = B[2 * i], bi = B[2 * i + 1]; A[2 * i] = ar_ * br - ai * bi; A[2 * i + 1] = ar_ * bi + ai * br; }
  ar4_fft2(A, t, 1);
  int64_t f[1] = { largo }; NV out = ar_nuevo(f, 1, AR_REAL);
  if (!N_FALLO(out)) for (int64_t i = 0; i < largo; i++) ((double*)AR(out)->buf->d)[i] = A[2 * i] / (double)t;
  free(A); free(B); free(vx); free(vy); return out;
}

#define NAT_ARREGLO4 \
  { "numerico/fourier", 1, ar4_fourier }, { "numerico/fourierInversa", 1, ar4_fourierInversa }, { "numerico/espectro", 1, ar4_espectro }, \
  { "numerico/frecuencias", -1, ar4_frecuencias }, { "numerico/convolucion", 2, ar4_convolucion },
