/* ============================================================================
 *  (motor-exp A7) Arreglos, quinta tanda: álgebra lineal. LU con pivoteo, QR de Householder, SVD de Jacobi de un lado, valores propios de Jacobi,
 *  y lo que se construye con ellas. Las mismas cuentas, en el mismo orden, que src/11-edsl-numerico.js.
 * ========================================================================== */
static int ar5_cuadrada(NV v, int k, const char* f, NV* err) {
  if (!ar_mat2(v, k, f, err)) return 0;
  NArr* x = AR(v);
  if (x->forma[0] != x->forma[1]) { NV fx = ar_formas_txt(x->forma, x->nd); *err = ERR("«%s» necesita una matriz cuadrada y llegó una de %v", f, fx); n_dec(fx); return 0; }
  return 1;
}
static NV ar5_matriz(const double* d, int64_t nf, int64_t nc) {
  int64_t f[2] = { nf, nc }; NV o = ar_nuevo(f, 2, AR_REAL); if (N_FALLO(o)) return o;
  memcpy(AR(o)->buf->d, d, sizeof(double) * (size_t)(nf * nc)); return o;
}
static NV ar5_vector(const double* d, int64_t n) {
  int64_t f[1] = { n }; NV o = ar_nuevo(f, 1, AR_REAL); if (N_FALLO(o)) return o;
  memcpy(AR(o)->buf->d, d, sizeof(double) * (size_t)n); return o;
}
static int ar5_simetrica(const double* d, int64_t n) {
  for (int64_t i = 0; i < n; i++) for (int64_t j = i + 1; j < n; j++) if (fabs(d[i * n + j] - d[j * n + i]) > 1e-9 * (1 + fabs(d[i * n + j]))) return 0;
  return 1;
}
static double ar5_sign(double x) { return x > 0 ? 1 : x < 0 ? -1 : x; }
static int ar5_cmp_desc(void* c, int64_t x, int64_t y) { const double* v = (const double*)c; double d = v[y] - v[x]; return d < 0 ? -1 : d > 0 ? 1 : 0; }

/* LU con pivoteo parcial: lu (n*n) y piv (n) a cargo de quien llama; devuelve la columna singular o -1 */
static int ar5_lu(const double* a, int64_t n, double* lu, int32_t* piv, int* signo) {
  memcpy(lu, a, sizeof(double) * (size_t)(n * n));
  for (int64_t i = 0; i < n; i++) piv[i] = (int32_t)i;
  *signo = 1;
  for (int64_t k = 0; k < n; k++) {
    int64_t p = k; double mx = fabs(lu[k * n + k]);
    for (int64_t i = k + 1; i < n; i++) { double v = fabs(lu[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (mx == 0) return (int)k;
    if (p != k) {
      for (int64_t j = 0; j < n; j++) { double t = lu[k * n + j]; lu[k * n + j] = lu[p * n + j]; lu[p * n + j] = t; }
      int32_t t = piv[k]; piv[k] = piv[p]; piv[p] = t; *signo = -*signo;
    }
    double d = lu[k * n + k];
    for (int64_t i = k + 1; i < n; i++) {
      double f = lu[i * n + k] / d; lu[i * n + k] = f;
      if (f == 0) continue;
      for (int64_t j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
    }
  }
  return -1;
}
static void ar5_lu_resolver(const double* lu, const int32_t* piv, int64_t n, const double* b, double* x) {
  for (int64_t i = 0; i < n; i++) x[i] = b[piv[i]];
  for (int64_t i = 1; i < n; i++) { double s = x[i]; for (int64_t j = 0; j < i; j++) s -= lu[i * n + j] * x[j]; x[i] = s; }
  for (int64_t i = n - 1; i >= 0; i--) { double s = x[i]; for (int64_t j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j]; x[i] = s / lu[i * n + i]; }
}
/* QR por reflexiones de Householder: Q (nf*nf) y R (nf*nc) a cargo de quien llama */
static void ar5_qr(const double* a, int64_t nf, int64_t nc, double* Q, double* R) {
  memcpy(R, a, sizeof(double) * (size_t)(nf * nc));
  memset(Q, 0, sizeof(double) * (size_t)(nf * nf));
  for (int64_t i = 0; i < nf; i++) Q[i * nf + i] = 1;
  int64_t pasos = (nf - 1) < nc ? (nf - 1) : nc;
  double* v = (double*)n_mem(sizeof(double) * (size_t)(nf ? nf : 1)); memset(v, 0, sizeof(double) * (size_t)(nf ? nf : 1));
  for (int64_t k = 0; k < pasos; k++) {
    double norma = 0;
    for (int64_t i = k; i < nf; i++) norma += R[i * nc + k] * R[i * nc + k];
    norma = sqrt(norma);
    if (norma == 0) continue;
    double alfa = R[k * nc + k] >= 0 ? -norma : norma;
    for (int64_t i = k; i < nf; i++) v[i] = R[i * nc + k];
    v[k] -= alfa;
    double vv = 0; for (int64_t i = k; i < nf; i++) vv += v[i] * v[i];
    if (vv == 0) continue;
    for (int64_t j = 0; j < nc; j++) { double s = 0; for (int64_t i = k; i < nf; i++) s += v[i] * R[i * nc + j]; s = (2 * s) / vv; for (int64_t i = k; i < nf; i++) R[i * nc + j] -= s * v[i]; }
    for (int64_t i = 0; i < nf; i++) { double s = 0; for (int64_t j = k; j < nf; j++) s += Q[i * nf + j] * v[j]; s = (2 * s) / vv; for (int64_t j = k; j < nf; j++) Q[i * nf + j] -= s * v[j]; }
  }
  free(v);
}
/* SVD por Jacobi de un lado: U (nf*nc), S (nc), V (nc*nc) a cargo de quien llama */
static void ar5_svd(const double* a, int64_t nf, int64_t nc, double* U2, double* S2, double* V2) {
  double* Ut = (double*)n_mem(sizeof(double) * (size_t)(nc * nf + 1)); double* Vt = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
  for (int64_t i = 0; i < nf; i++) for (int64_t j = 0; j < nc; j++) Ut[j * nf + i] = a[i * nc + j];
  memset(Vt, 0, sizeof(double) * (size_t)(nc * nc)); for (int64_t i = 0; i < nc; i++) Vt[i * nc + i] = 1;
  const double EPS = 1e-14;
  for (int vuelta = 0; vuelta < 60; vuelta++) {
    double fuera = 0;
    for (int64_t p = 0; p < nc - 1; p++) {
      int64_t op = p * nf, oq0 = p * nc;
      for (int64_t q = p + 1; q < nc; q++) {
        int64_t oq = q * nf; double app = 0, aqq = 0, apq = 0;
        for (int64_t i = 0; i < nf; i++) { double x = Ut[op + i], y = Ut[oq + i]; app += x * x; aqq += y * y; apq += x * y; }
        if (fabs(apq) <= EPS * sqrt(app * aqq)) continue;
        double prod = app * aqq, den = (prod == 0 || isnan(prod)) ? 1 : prod;
        fuera = js_max2(fuera, fabs(apq) / sqrt(den));
        double tau = (aqq - app) / (2 * apq);
        double t = ar5_sign((tau == 0 || isnan(tau)) ? 1 : tau) / (fabs(tau) + sqrt(1 + tau * tau));
        double c = 1 / sqrt(1 + t * t), sn = c * t;
        for (int64_t i = 0; i < nf; i++) { double x = Ut[op + i], y = Ut[oq + i]; Ut[op + i] = c * x - sn * y; Ut[oq + i] = sn * x + c * y; }
        int64_t ovq = q * nc;
        for (int64_t i = 0; i < nc; i++) { double x = Vt[oq0 + i], y = Vt[ovq + i]; Vt[oq0 + i] = c * x - sn * y; Vt[ovq + i] = sn * x + c * y; }
      }
    }
    if (fuera < EPS) break;
  }
  double* sv = (double*)n_mem(sizeof(double) * (size_t)(nc ? nc : 1));
  for (int64_t j = 0; j < nc; j++) { double s = 0; int64_t o = j * nf; for (int64_t i = 0; i < nf; i++) s += Ut[o + i] * Ut[o + i]; sv[j] = sqrt(s); }
  int64_t* orden = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nc ? nc : 1)); int64_t* tmp = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nc ? nc : 1));
  for (int64_t i = 0; i < nc; i++) orden[i] = i;
  td_mezcla(orden, tmp, nc, ar5_cmp_desc, sv);
  for (int64_t j = 0; j < nc; j++) {
    int64_t o = orden[j]; S2[j] = sv[o]; double inv = sv[o] > 0 ? 1 / sv[o] : 0;
    for (int64_t i = 0; i < nf; i++) U2[i * nc + j] = Ut[o * nf + i] * inv;
    for (int64_t i = 0; i < nc; i++) V2[i * nc + j] = Vt[o * nc + i];
  }
  free(Ut); free(Vt); free(sv); free(orden); free(tmp);
}
/* valores y vectores propios de una matriz simétrica, por rotaciones de Jacobi */
static void ar5_eig(const double* a, int64_t n, double* val2, double* V2) {
  double* A = (double*)n_mem(sizeof(double) * (size_t)(n * n + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(n * n + 1));
  memcpy(A, a, sizeof(double) * (size_t)(n * n)); memset(V, 0, sizeof(double) * (size_t)(n * n));
  for (int64_t i = 0; i < n; i++) V[i * n + i] = 1;
  for (int vuelta = 0; vuelta < 100; vuelta++) {
    double fuera = 0, dentro = 0;
    for (int64_t i = 0; i < n; i++) { dentro += A[i * n + i] * A[i * n + i]; for (int64_t j = i + 1; j < n; j++) fuera += A[i * n + j] * A[i * n + j]; }
    if (fuera <= 1e-30 * (dentro == 0 || isnan(dentro) ? 1 : dentro)) break;
    for (int64_t p = 0; p < n - 1; p++) for (int64_t q = p + 1; q < n; q++) {
      double apq = A[p * n + q];
      if (fabs(apq) <= 1e-17 * (fabs(A[p * n + p]) + fabs(A[q * n + q]))) continue;
      if (fabs(apq) < 1e-300) continue;
      double theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      double t = ar5_sign((theta == 0 || isnan(theta)) ? 1 : theta) / (fabs(theta) + sqrt(theta * theta + 1));
      double c = 1 / sqrt(t * t + 1), sn = c * t;
      for (int64_t k = 0; k < n; k++) { double akp = A[k * n + p], akq = A[k * n + q]; A[k * n + p] = c * akp - sn * akq; A[k * n + q] = sn * akp + c * akq; }
      for (int64_t k = 0; k < n; k++) { double apk = A[p * n + k], aqk = A[q * n + k]; A[p * n + k] = c * apk - sn * aqk; A[q * n + k] = sn * apk + c * aqk; }
      int64_t op = p * n, oq = q * n;
      for (int64_t k = 0; k < n; k++) { double vkp = V[op + k], vkq = V[oq + k]; V[op + k] = c * vkp - sn * vkq; V[oq + k] = sn * vkp + c * vkq; }
    }
  }
  double* val = (double*)n_mem(sizeof(double) * (size_t)(n ? n : 1));
  for (int64_t i = 0; i < n; i++) val[i] = A[i * n + i];
  int64_t* orden = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(n ? n : 1)); int64_t* tmp = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(n ? n : 1));
  for (int64_t i = 0; i < n; i++) orden[i] = i;
  td_mezcla(orden, tmp, n, ar5_cmp_desc, val);
  for (int64_t j = 0; j < n; j++) { val2[j] = val[orden[j]]; if (V2) for (int64_t i = 0; i < n; i++) V2[i * n + j] = V[orden[j] * n + i]; }
  free(A); free(V); free(val); free(orden); free(tmp);
}

static NV ar_traza(NV v) {   /* traza(A) con un arreglo: la suma de la diagonal */
  NArr* x = AR(v);
  if (x->nd != 2 || x->forma[0] != x->forma[1]) { NV fx = ar_formas_txt(x->forma, x->nd); NV e = ERR("«traza»: la matriz tiene que ser cuadrada y esta es %v", fx); n_dec(fx); return e; }
  int64_t N = x->forma[0], nv; double* d = ar_valores(x, &nv), t = 0;
  for (int64_t i = 0; i < N; i++) t += d[i * N + i];
  free(d); return n_num(t);
}
NAT(ar5_factorLU) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "factorLU", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  double* lu = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); int32_t* piv = (int32_t*)n_mem(sizeof(int32_t) * (size_t)(N + 1)); int signo;
  int sing = ar5_lu(d, N, lu, piv, &signo); free(d);
  if (sing >= 0) { free(lu); free(piv); return ERRP(n_texto_utf8("una matriz singular no tiene LU; si querías resolver de todos modos, usa minimosCuadrados"), "«factorLU»: la matriz es singular (la columna %d se quedó sin pivote)", (long long)sing); }
  double* L = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); double* U = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1));
  memset(L, 0, sizeof(double) * (size_t)(N * N)); memset(U, 0, sizeof(double) * (size_t)(N * N));
  for (int64_t i = 0; i < N; i++) { L[i * N + i] = 1; for (int64_t j = 0; j < i; j++) L[i * N + j] = lu[i * N + j]; for (int64_t j = i; j < N; j++) U[i * N + j] = lu[i * N + j]; }
  int64_t f[1] = { N }; NV P = ar_nuevo(f, 1, AR_ENTERO);
  for (int64_t i = 0; i < N; i++) ar_escribir(AR(P), i, piv[i]);
  NV r = n_dic_nuevo(); dic_pon(r, "L", ar5_matriz(L, N, N)); dic_pon(r, "U", ar5_matriz(U, N, N)); dic_pon(r, "P", P);
  free(lu); free(piv); free(L); free(U); return r;
}
NAT(ar5_factorQR) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "factorQR", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1], nv; double* d = ar_valores(A, &nv);
  double* Q = (double*)n_mem(sizeof(double) * (size_t)(nf * nf + 1)); double* R = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1));
  ar5_qr(d, nf, nc, Q, R); free(d);
  for (int64_t i = 1; i < nf; i++) for (int64_t j = 0; j < (i < nc ? i : nc); j++) R[i * nc + j] = 0;
  NV r = n_dic_nuevo(); dic_pon(r, "Q", ar5_matriz(Q, nf, nf)); dic_pon(r, "R", ar5_matriz(R, nf, nc));
  free(Q); free(R); return r;
}
NAT(ar5_factorCholesky) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "factorCholesky", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  if (!ar5_simetrica(d, N)) { free(d); return n_error("«factorCholesky» necesita una matriz simétrica", NULL); }
  double* L = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); memset(L, 0, sizeof(double) * (size_t)(N * N));
  for (int64_t i = 0; i < N; i++) for (int64_t j = 0; j <= i; j++) {
    double s = d[i * N + j];
    for (int64_t k = 0; k < j; k++) s -= L[i * N + k] * L[j * N + k];
    if (i == j) {
      if (s <= 0) { free(d); free(L); return ERRP(n_texto_utf8("pruébala antes con esDefinidaPositiva, o usa factorLU, que no lo exige"), "«factorCholesky»: la matriz no es definida positiva (se torció en la fila %d)", (long long)i); }
      L[i * N + i] = sqrt(s);
    } else L[i * N + j] = s / L[j * N + j];
  }
  NV r = ar5_matriz(L, N, N); free(d); free(L); return r;
}
NAT(ar5_descomponerSVD) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "descomponerSVD", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1], nv; double* d = ar_valores(A, &nv);
  double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
  ar5_svd(d, nf, nc, U, S, V); free(d);
  NV r = n_dic_nuevo(); dic_pon(r, "U", ar5_matriz(U, nf, nc)); dic_pon(r, "S", ar5_vector(S, nc)); dic_pon(r, "V", ar5_matriz(V, nc, nc));
  free(U); free(S); free(V); return r;
}
NAT(ar5_valoresSingulares) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "valoresSingulares", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1], nv; double* d = ar_valores(A, &nv);
  double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
  ar5_svd(d, nf, nc, U, S, V);
  NV r = ar5_vector(S, nc); free(d); free(U); free(S); free(V); return r;
}
NAT(ar5_resolverA) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "resolverA", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0];
  ARR_(a[1], 2, "resolverA"); NArr* B = AR(a[1]);
  if (B->forma[0] != N) return ERR("«resolverA»: la matriz es %d×%d y el lado derecho tiene %d filas", (long long)N, (long long)N, (long long)B->forma[0]);
  int64_t nv; double* d = ar_valores(A, &nv); double* lu = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); int32_t* piv = (int32_t*)n_mem(sizeof(int32_t) * (size_t)(N + 1)); int signo;
  int sing = ar5_lu(d, N, lu, piv, &signo); free(d);
  if (sing >= 0) { free(lu); free(piv); return ERRP(n_texto_utf8("usa minimosCuadrados, que da la mejor solución aunque no haya una exacta"), "«resolverA»: la matriz es singular, el sistema no tiene solución única"); }
  int64_t nb; double* db = ar_valores(B, &nb); NV r;
  if (B->nd == 1) { double* x = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); ar5_lu_resolver(lu, piv, N, db, x); r = ar5_vector(x, N); free(x); }
  else {
    int64_t nc = B->forma[1]; double* out = (double*)n_mem(sizeof(double) * (size_t)(N * nc + 1)); double* col = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); double* x = (double*)n_mem(sizeof(double) * (size_t)(N + 1));
    for (int64_t j = 0; j < nc; j++) { for (int64_t i = 0; i < N; i++) col[i] = db[i * nc + j]; ar5_lu_resolver(lu, piv, N, col, x); for (int64_t i = 0; i < N; i++) out[i * nc + j] = x[i]; }
    r = ar5_matriz(out, N, nc); free(out); free(col); free(x);
  }
  free(lu); free(piv); free(db); return r;
}
NAT(ar5_resolverTriangular) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "resolverTriangular", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0]; ARR_(a[1], 2, "resolverTriangular"); NArr* b = AR(a[1]);
  if (b->nd != 1) return n_error("«resolverTriangular»: el lado derecho debe ser un vector", NULL);
  if (ar_tam(b) != N) return ERR("«resolverTriangular»: la matriz es %d×%d y el vector tiene %d", (long long)N, (long long)N, (long long)ar_tam(b));
  int64_t nv, nb; double* d = ar_valores(A, &nv); double* x = ar_valores(b, &nb);
  int arriba = 0, abajo = 0;
  for (int64_t i = 0; i < N; i++) for (int64_t j = 0; j < N; j++) { if (d[i * N + j] == 0) continue; if (j > i) arriba = 1; else if (j < i) abajo = 1; }
  if (arriba && abajo) { free(d); free(x); return ERRP(n_texto_utf8("usa resolverA, que vale para cualquiera; esta solo existe para ahorrarse el trabajo cuando ya es triangular"), "«resolverTriangular»: la matriz no es triangular, tiene números a los dos lados de la diagonal"); }
  for (int64_t p = 0; p < N; p++) {
    int64_t i = arriba ? N - 1 - p : p; double s = x[i];
    if (arriba) for (int64_t j = i + 1; j < N; j++) s -= d[i * N + j] * x[j]; else for (int64_t j = 0; j < i; j++) s -= d[i * N + j] * x[j];
    if (d[i * N + i] == 0) { free(d); free(x); return ERR("«resolverTriangular»: hay un 0 en la diagonal (fila %d) y el sistema no tiene solución única", (long long)i); }
    x[i] = s / d[i * N + i];
  }
  NV r = ar5_vector(x, N); free(d); free(x); return r;
}
NAT(ar5_minimosCuadrados) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "minimosCuadrados", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1]; ARR_(a[1], 2, "minimosCuadrados"); NArr* b = AR(a[1]);
  if (b->nd != 1) return n_error("«minimosCuadrados»: el lado derecho debe ser un vector", NULL);
  if (ar_tam(b) != nf) return ERR("«minimosCuadrados»: la matriz tiene %d filas y el vector %d", (long long)nf, (long long)ar_tam(b));
  int64_t nv, nb; double* d = ar_valores(A, &nv); double* db = ar_valores(b, &nb);
  double* x = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); memset(x, 0, sizeof(double) * (size_t)(nc + 1));
  if (nf < nc) {
    double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
    ar5_svd(d, nf, nc, U, S, V);
    double tol = (S[0] == 0 || isnan(S[0]) ? 0 : S[0]) * 1e-12;
    for (int64_t k = 0; k < nc; k++) {
      if (S[k] <= tol) continue;
      double ub = 0; for (int64_t i = 0; i < nf; i++) ub += U[i * nc + k] * db[i];
      ub /= S[k];
      for (int64_t j = 0; j < nc; j++) x[j] += V[j * nc + k] * ub;
    }
    free(U); free(S); free(V);
  } else {
    double* Q = (double*)n_mem(sizeof(double) * (size_t)(nf * nf + 1)); double* R = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1));
    ar5_qr(d, nf, nc, Q, R); double* qb = (double*)n_mem(sizeof(double) * (size_t)(nc + 1));
    for (int64_t j = 0; j < nc; j++) { double s = 0; for (int64_t i = 0; i < nf; i++) s += Q[i * nf + j] * db[i]; qb[j] = s; }
    for (int64_t i = nc - 1; i >= 0; i--) {
      double s = qb[i]; for (int64_t j = i + 1; j < nc; j++) s -= R[i * nc + j] * x[j];
      if (fabs(R[i * nc + i]) < 1e-13) { free(Q); free(R); free(qb); free(d); free(db); free(x); return ERRP(n_texto_utf8("quita la columna repetida, o usa pseudoInversa, que aguanta la dependencia"), "«minimosCuadrados»: las columnas de la matriz son dependientes (la %d no aporta nada que no esté ya)", (long long)i); }
      x[i] = s / R[i * nc + i];
    }
    free(Q); free(R); free(qb);
  }
  NV r = ar5_vector(x, nc); free(d); free(db); free(x); return r;
}
NAT(ar5_pseudoInversa) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "pseudoInversa", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1], nv; double* d = ar_valores(A, &nv);
  double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
  ar5_svd(d, nf, nc, U, S, V); free(d);
  double tol = (S[0] == 0 || isnan(S[0]) ? 0 : S[0]) * 1e-12; double* out = (double*)n_mem(sizeof(double) * (size_t)(nc * nf + 1)); memset(out, 0, sizeof(double) * (size_t)(nc * nf));
  for (int64_t k = 0; k < nc; k++) {
    if (S[k] <= tol) continue;
    double inv = 1 / S[k];
    for (int64_t i = 0; i < nc; i++) { double vi = V[i * nc + k] * inv; if (vi == 0) continue; for (int64_t j = 0; j < nf; j++) out[i * nf + j] += vi * U[j * nc + k]; }
  }
  NV r = ar5_matriz(out, nc, nf); free(U); free(S); free(V); free(out); return r;
}
NAT(ar5_determinanteA) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "determinanteA", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  double* lu = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); int32_t* piv = (int32_t*)n_mem(sizeof(int32_t) * (size_t)(N + 1)); int signo;
  int sing = ar5_lu(d, N, lu, piv, &signo); free(d);
  double det = signo; if (sing >= 0) det = 0; else for (int64_t i = 0; i < N; i++) det *= lu[i * N + i];
  free(lu); free(piv); return n_num(det);
}
NAT(ar5_inversaA) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "inversaA", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  double* lu = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); int32_t* piv = (int32_t*)n_mem(sizeof(int32_t) * (size_t)(N + 1)); int signo;
  int sing = ar5_lu(d, N, lu, piv, &signo); free(d);
  if (sing >= 0) { free(lu); free(piv); return ERRP(n_texto_utf8("usa pseudoInversa; y si lo que querías era resolver un sistema, resolverA en vez de multiplicar por la inversa"), "«inversaA»: la matriz es singular y no tiene inversa"); }
  double* out = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); double* e = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); double* x = (double*)n_mem(sizeof(double) * (size_t)(N + 1));
  for (int64_t j = 0; j < N; j++) { for (int64_t i = 0; i < N; i++) e[i] = 0; e[j] = 1; ar5_lu_resolver(lu, piv, N, e, x); for (int64_t i = 0; i < N; i++) out[i * N + j] = x[i]; }
  NV r = ar5_matriz(out, N, N); free(lu); free(piv); free(out); free(e); free(x); return r;
}
static double* ar5_sv_de(NV v, const char* f, NV* err, int64_t* ns, int64_t* nf_, int64_t* nc_) {
  if (!ar_mat2(v, 1, f, err)) return NULL;
  NArr* A = AR(v); int64_t nf = A->forma[0], nc = A->forma[1], nv; double* d = ar_valores(A, &nv);
  double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
  ar5_svd(d, nf, nc, U, S, V); free(d); free(U); free(V);
  *ns = nc; if (nf_) *nf_ = nf; if (nc_) *nc_ = nc; return S;
}
NAT(ar5_rangoMatriz) {
  (void)n; (void)extra; NV err; int64_t ns, nf, nc; double* S = ar5_sv_de(a[0], "rangoMatriz", &err, &ns, &nf, &nc); if (!S) return err;
  double s0 = (ns && !(S[0] == 0 || isnan(S[0]))) ? S[0] : 0; double tol = s0 * (double)(nf > nc ? nf : nc) * 2.220446049250313e-16; int64_t r = 0;
  for (int64_t i = 0; i < ns; i++) if (S[i] > tol) r++;
  free(S); return n_num((double)r);
}
NAT(ar5_condicion) {
  (void)n; (void)extra; NV err; int64_t ns; double* S = ar5_sv_de(a[0], "condicion", &err, &ns, NULL, NULL); if (!S) return err;
  double ult = ns ? S[ns - 1] : NAN, r = ult == 0 ? INFINITY : S[0] / ult; free(S); return n_num(r);
}
NAT(ar5_normaMatriz) {
  (void)extra;
  if (n < 1 || n > 2) return n_error("«normaMatriz» toma la matriz y, si quieres, qué norma", NULL);
  NV err; if (!ar_mat2(a[0], 1, "normaMatriz", &err)) return err;
  NArr* A = AR(a[0]); int64_t nf = A->forma[0], nc = A->forma[1];
  NV clase = n_texto_utf8("frobenius");
  if (n == 2) { n_dec(clase); if (!n_es(a[1], NC_TEXTO)) return ERR("«normaMatriz»: el argumento 2 debe ser texto y es %s", n_tipo_de(a[1])); clase = n_inc(a[1]); }
  int64_t nv; double* d = ar_valores(A, &nv); double r = 0;
  if (tx_c(clase, "frobenius")) { double s = 0; for (int64_t i = 0; i < nv; i++) s += d[i] * d[i]; r = sqrt(s); }
  else if (tx_c(clase, "uno")) { double mx = 0; for (int64_t j = 0; j < nc; j++) { double s = 0; for (int64_t i = 0; i < nf; i++) s += fabs(d[i * nc + j]); if (s > mx) mx = s; } r = mx; }
  else if (tx_c(clase, "infinito")) { double mx = 0; for (int64_t i = 0; i < nf; i++) { double s = 0; for (int64_t j = 0; j < nc; j++) s += fabs(d[i * nc + j]); if (s > mx) mx = s; } r = mx; }
  else if (tx_c(clase, "espectral") || tx_c(clase, "nuclear")) {
    double* U = (double*)n_mem(sizeof(double) * (size_t)(nf * nc + 1)); double* S = (double*)n_mem(sizeof(double) * (size_t)(nc + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(nc * nc + 1));
    ar5_svd(d, nf, nc, U, S, V);
    if (tx_c(clase, "espectral")) r = nc ? S[0] : NAN; else { double s = 0; for (int64_t i = 0; i < nc; i++) s += S[i]; r = s; }
    free(U); free(S); free(V);
  } else { free(d); NV e = ERRP(n_texto_utf8("son \"frobenius\", \"uno\", \"infinito\", \"espectral\" y \"nuclear\""), "«normaMatriz»: no conozco la norma «%v»", clase); n_dec(clase); return e; }
  free(d); n_dec(clase); return n_num(r);
}
static void ar5_mul(const double* X, const double* Y, double* Z, int64_t n) {
  memset(Z, 0, sizeof(double) * (size_t)(n * n));
  for (int64_t i = 0; i < n; i++) for (int64_t p = 0; p < n; p++) { double x = X[i * n + p]; if (x == 0) continue; for (int64_t j = 0; j < n; j++) Z[i * n + j] += x * Y[p * n + j]; }
}
NAT(ar5_potenciaMatriz) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "potenciaMatriz", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0]; NUM(a[1], 2, "potenciaMatriz");
  double kd = a[1].u.n; if (kd != trunc(kd) || !isfinite(kd)) return n_error("«potenciaMatriz»: el exponente debe ser entero", NULL);
  int64_t nv; double* base = ar_valores(A, &nv);
  double* t1 = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); double* t2 = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); double* res = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1));
  if (kd < 0) {
    double* lu = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); int32_t* piv = (int32_t*)n_mem(sizeof(int32_t) * (size_t)(N + 1)); int signo;
    int sing = ar5_lu(base, N, lu, piv, &signo);
    if (sing >= 0) { free(lu); free(piv); free(base); free(t1); free(t2); free(res); return n_error("«potenciaMatriz»: exponente negativo de una matriz singular, que no tiene inversa", NULL); }
    double* inv = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); double* e = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); double* x = (double*)n_mem(sizeof(double) * (size_t)(N + 1));
    for (int64_t j = 0; j < N; j++) { for (int64_t i = 0; i < N; i++) e[i] = 0; e[j] = 1; ar5_lu_resolver(lu, piv, N, e, x); for (int64_t i = 0; i < N; i++) inv[i * N + j] = x[i]; }
    free(base); base = inv; kd = -kd; free(lu); free(piv); free(e); free(x);
  }
  int32_t k = (int32_t)ar_touint32(kd);
  memset(res, 0, sizeof(double) * (size_t)(N * N)); for (int64_t i = 0; i < N; i++) res[i * N + i] = 1;
  while (k > 0) {
    if (k & 1) { ar5_mul(res, base, t1, N); memcpy(res, t1, sizeof(double) * (size_t)(N * N)); }
    ar5_mul(base, base, t2, N); memcpy(base, t2, sizeof(double) * (size_t)(N * N)); k >>= 1;
  }
  NV r = ar5_matriz(res, N, N); free(base); free(t1); free(t2); free(res); return r;
}
NAT(ar5_autoSimetrica) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "autoSimetrica", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  if (!ar5_simetrica(d, N)) { free(d); return ERRP(n_texto_utf8("si la tuya no lo es, de momento Ñ no sabe sacarle los valores propios; para una matriz de datos prueba con descomponerSVD, que sirve para lo mismo en casi todos los casos"), "«autoSimetrica» necesita una matriz simétrica"); }
  double* val = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1));
  ar5_eig(d, N, val, V);
  NV r = n_dic_nuevo(); dic_pon(r, "valores", ar5_vector(val, N)); dic_pon(r, "vectores", ar5_matriz(V, N, N));
  free(d); free(val); free(V); return r;
}
NAT(ar5_autovalores) {
  (void)n; (void)extra; NV err; if (!ar5_cuadrada(a[0], 1, "autovalores", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0], nv; double* d = ar_valores(A, &nv);
  if (!ar5_simetrica(d, N)) { free(d); return ERRP(n_texto_utf8("para una no simétrica usa valoresSingulares, que existe siempre y mide lo mismo en la mayoría de los usos"), "«autovalores» solo sabe hacerlo con matrices simétricas"); }
  double* val = (double*)n_mem(sizeof(double) * (size_t)(N + 1)); double* V = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1));
  ar5_eig(d, N, val, V);
  NV r = ar5_vector(val, N); free(d); free(val); free(V); return r;
}
NAT(ar5_esDefinidaPositiva) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "esDefinidaPositiva", &err)) return err;
  NArr* A = AR(a[0]); int64_t N = A->forma[0]; if (A->forma[0] != A->forma[1]) return n_bool(0);
  int64_t nv; double* d = ar_valores(A, &nv);
  if (!ar5_simetrica(d, N)) { free(d); return n_bool(0); }
  double* L = (double*)n_mem(sizeof(double) * (size_t)(N * N + 1)); memset(L, 0, sizeof(double) * (size_t)(N * N)); int ok = 1;
  for (int64_t i = 0; i < N && ok; i++) for (int64_t j = 0; j <= i; j++) {
    double s = d[i * N + j]; for (int64_t k = 0; k < j; k++) s -= L[i * N + k] * L[j * N + k];
    if (i == j) { if (s <= 0) { ok = 0; break; } L[i * N + i] = sqrt(s); } else L[i * N + j] = s / L[j * N + j];
  }
  free(d); free(L); return n_bool(ok);
}

#define NAT_ARREGLO5 \
  { "numerico/factorLU", 1, ar5_factorLU }, { "numerico/factorQR", 1, ar5_factorQR }, { "numerico/factorCholesky", 1, ar5_factorCholesky }, \
  { "numerico/descomponerSVD", 1, ar5_descomponerSVD }, { "numerico/valoresSingulares", 1, ar5_valoresSingulares }, { "numerico/resolverA", 2, ar5_resolverA }, \
  { "numerico/resolverTriangular", 2, ar5_resolverTriangular }, { "numerico/minimosCuadrados", 2, ar5_minimosCuadrados }, { "numerico/pseudoInversa", 1, ar5_pseudoInversa }, \
  { "numerico/determinanteA", 1, ar5_determinanteA }, { "numerico/inversaA", 1, ar5_inversaA }, { "numerico/rangoMatriz", 1, ar5_rangoMatriz }, { "numerico/condicion", 1, ar5_condicion }, \
  { "numerico/normaMatriz", -1, ar5_normaMatriz }, { "numerico/potenciaMatriz", 2, ar5_potenciaMatriz }, { "numerico/autoSimetrica", 1, ar5_autoSimetrica }, \
  { "numerico/autovalores", 1, ar5_autovalores }, { "numerico/esDefinidaPositiva", 1, ar5_esDefinidaPositiva },
