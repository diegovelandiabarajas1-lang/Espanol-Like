/* ============================================================================
 *  (motor-exp A7) Arreglos, segunda tanda: producto matricial, matrices especiales, vistas de forma, máscaras, estadística y acumulados.
 *  Cada función hace lo mismo que su par de src/11-edsl-numerico.js (mismos tipos de resultado, mismo orden de cuentas, mismos mensajes).
 * ========================================================================== */
static int ar_mat2(NV v, int k, const char* f, NV* err) {
  if (!ar_puerta(v, k, f, err, 0)) return 0;
  NArr* x = AR(v);
  if (x->nd != 2) {
    NV pista = x->nd == 1 ? n_texto_utf8("pásala a matriz con expandir(a, 0) o expandir(a, 1)") : n_nulo();
    *err = n_errorT(msg("«%s»: se esperaba una matriz (2 dimensiones) y llegó una de %d", f, (long long)x->nd), pista); return 0;
  }
  return 1;
}

/* ── producto matricial y matrices ── */
NAT(ar2_por) {
  (void)n; (void)extra; ARR_(a[0], 1, "por"); ARR_(a[1], 2, "por");
  NArr *A = AR(a[0]), *B = AR(a[1]);
  if (A->nd != 2 || B->nd != 2)
    return ERRP(n_texto_utf8("para un vector, pásalo a matriz con expandir(v, 0) o expandir(v, 1)"), "«por» multiplica dos matrices, y llegaron de %d y %d dimensiones", (long long)A->nd, (long long)B->nd);
  if (A->forma[1] != B->forma[0]) {
    NV fa = ar_formas_txt(A->forma, A->nd), fb = ar_formas_txt(B->forma, B->nd);
    NV e = ERRP(msg("las columnas del primero (%d) tienen que ser las filas del segundo (%d)", (long long)A->forma[1], (long long)B->forma[0]), "«por»: no se puede multiplicar %v por %v", fa, fb);
    n_dec(fa); n_dec(fb); return e;
  }
  int64_t nf = A->forma[0], nm = A->forma[1], nc = B->forma[1], f[2] = { nf, nc };
  /* igual que la VM con NEÑ: nen_dgemm, k de 0 a K−1 desde +0, con FMA (sin saltar ceros); en precisión simple o media, nen_sgemm (acumula en 32 bits) */
  int tA = A->tipo == AR_BOOL ? AR_REAL : A->tipo, tB = B->tipo == AR_BOOL ? AR_REAL : B->tipo;
  int t = ar_tipo_arit(tA, tB, OP_MULT, 1, 1);
  int simple = t == AR_REAL32 || t == AR_REAL16;
  NV out = ar_nuevo(f, 2, simple ? t : AR_REAL); if (N_FALLO(out)) return out;
  int64_t na, nb; double* va = ar_valores(A, &na); double* vb = ar_valores(B, &nb);
  for (int64_t i = 0; i < nf; i++) for (int64_t j = 0; j < nc; j++) {
    if (simple) {
      float acc = 0.0f;
      for (int64_t k = 0; k < nm; k++) acc = fmaf((float)va[i * nm + k], (float)vb[k * nc + j], acc);
      ((float*)AR(out)->buf->d)[i * nc + j] = t == AR_REAL16 ? (float)ar_r16((double)acc) : acc;
    } else {
      double acc = 0.0;
      for (int64_t k = 0; k < nm; k++) acc = fma(va[i * nm + k], vb[k * nc + j], acc);
      ((double*)AR(out)->buf->d)[i * nc + j] = acc;
    }
  }
  free(va); free(vb);
  return out;
}
NAT(ar2_productoPunto) {
  (void)n; (void)extra; ARR_(a[0], 1, "productoPunto"); ARR_(a[1], 2, "productoPunto");
  NArr *x = AR(a[0]), *y = AR(a[1]);
  if (ar_tam(x) != ar_tam(y)) return ERR("«productoPunto»: uno tiene %d valores y el otro %d", (long long)ar_tam(x), (long long)ar_tam(y));
  int64_t nx, ny; double* vx = ar_valores(x, &nx); double* vy = ar_valores(y, &ny);
  double s = 0; for (int64_t i = 0; i < nx; i++) s += vx[i] * vy[i];
  free(vx); free(vy); return n_num(s);
}
NAT(ar2_identidadA) {
  (void)n; (void)extra; NUM(a[0], 1, "identidadA");
  double t = a[0].u.n;
  if (t != trunc(t) || t < 1) return n_error("«identidadA»: el tamaño debe ser un entero de 1 o más", NULL);
  int64_t f[2] = { (int64_t)t, (int64_t)t };
  NV out = ar_nuevo(f, 2, AR_REAL); if (N_FALLO(out)) return out;
  for (int64_t i = 0; i < f[0]; i++) ((double*)AR(out)->buf->d)[i * f[0] + i] = 1;
  return out;
}
NAT(ar2_diagonal) {
  (void)n; (void)extra; ARR_(a[0], 1, "diagonal");
  NArr* x = AR(a[0]); int64_t nv; double* v = ar_valores(x, &nv);
  if (x->nd == 1) {
    int64_t f[2] = { nv, nv }; NV out = ar_nuevo(f, 2, x->tipo == AR_BOOL ? AR_REAL : x->tipo);
    if (N_FALLO(out)) { free(v); return out; }
    for (int64_t i = 0; i < nv; i++) ar_escribir(AR(out), i * nv + i, v[i]);
    free(v); return out;
  }
  if (x->nd != 2) { free(v); return ERR("«diagonal»: se esperaba un vector o una matriz y llegó algo de %d dimensiones", (long long)x->nd); }
  int64_t nf = x->forma[0], nc = x->forma[1], m = nf < nc ? nf : nc, f[1] = { m };
  NV out = ar_nuevo(f, 1, x->tipo); if (N_FALLO(out)) { free(v); return out; }
  for (int64_t i = 0; i < m; i++) ar_escribir(AR(out), i, v[i * nc + i]);
  free(v); return out;
}
static NV ar2_triangular(NV* a, int n, const char* nombre, int arriba) {
  if (n < 1 || n > 2) return ERR("«%s» toma la matriz y, si quieres, cuántas diagonales desplazarla", nombre);
  NV err; if (!ar_mat2(a[0], 1, nombre, &err)) return err;
  NArr* x = AR(a[0]); int64_t nf = x->forma[0], nc = x->forma[1]; double k = 0;
  if (n == 2) { NUM(a[1], 2, nombre); k = a[1].u.n; }
  int64_t nv; double* v = ar_valores(x, &nv); int64_t f[2] = { nf, nc };
  NV out = ar_nuevo(f, 2, x->tipo); if (N_FALLO(out)) { free(v); return out; }
  for (int64_t i = 0; i < nf; i++) for (int64_t j = 0; j < nc; j++) {
    double d = (double)(j - i);
    if (arriba ? d >= k : d <= k) ar_escribir(AR(out), i * nc + j, v[i * nc + j]);
  }
  free(v); return out;
}
NAT(ar2_triangularSuperior) { (void)extra; return ar2_triangular(a, n, "triangularSuperior", 1); }
NAT(ar2_triangularInferior) { (void)extra; return ar2_triangular(a, n, "triangularInferior", 0); }
NAT(ar2_externo) {
  (void)n; (void)extra; ARR_(a[0], 1, "externo"); ARR_(a[1], 2, "externo");
  NArr *x = AR(a[0]), *y = AR(a[1]);
  if (x->nd != 1 || y->nd != 1) return n_error("«externo» toma dos vectores", NULL);
  int64_t nx, ny; double* vx = ar_valores(x, &nx); double* vy = ar_valores(y, &ny); int64_t f[2] = { nx, ny };
  NV out = ar_nuevo(f, 2, AR_REAL); if (N_FALLO(out)) { free(vx); free(vy); return out; }
  double* o = (double*)AR(out)->buf->d;
  for (int64_t i = 0; i < nx; i++) for (int64_t j = 0; j < ny; j++) o[i * ny + j] = vx[i] * vy[j];
  free(vx); free(vy); return out;
}
NAT(ar2_kronecker) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "kronecker", &err)) return err; if (!ar_mat2(a[1], 2, "kronecker", &err)) return err;
  NArr *A = AR(a[0]), *B = AR(a[1]); int64_t pa = A->forma[0], qa = A->forma[1], pb = B->forma[0], qb = B->forma[1];
  int64_t na, nb; double* va = ar_valores(A, &na); double* vb = ar_valores(B, &nb);
  int64_t nc = qa * qb, f[2] = { pa * pb, nc };
  NV out = ar_nuevo(f, 2, AR_REAL); if (N_FALLO(out)) { free(va); free(vb); return out; }
  double* o = (double*)AR(out)->buf->d;
  for (int64_t i = 0; i < pa; i++) for (int64_t j = 0; j < qa; j++) {
    double fa = va[i * qa + j]; if (fa == 0) continue;
    for (int64_t k = 0; k < pb; k++) { int64_t off = (i * pb + k) * nc + j * qb; for (int64_t l = 0; l < qb; l++) o[off + l] = fa * vb[k * qb + l]; }
  }
  free(va); free(vb); return out;
}
NAT(ar2_esSimetrica) {
  (void)n; (void)extra; NV err; if (!ar_mat2(a[0], 1, "esSimetrica", &err)) return err;
  NArr* A = AR(a[0]); if (A->forma[0] != A->forma[1]) return n_bool(0);
  int64_t nv, N = A->forma[0]; double* d = ar_valores(A, &nv); int ok = 1;
  for (int64_t i = 0; i < N && ok; i++) for (int64_t j = i + 1; j < N; j++) if (fabs(d[i * N + j] - d[j * N + i]) > 1e-9 * (1 + fabs(d[i * N + j]))) { ok = 0; break; }
  free(d); return n_bool(ok);
}

/* ── forma y ejes ── */
NAT(ar2_aplanarA) {
  (void)n; (void)extra; ARR_(a[0], 1, "aplanarA"); NArr* x = AR(a[0]); int64_t tn = ar_tam(x), f[1] = { tn }, z[1] = { 1 };
  if (ar_seguida(x)) return ar_vista(x, f, z, 1, 0);
  NV y = ar_nuevo(f, 1, x->tipo); if (N_FALLO(y)) return y;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x); while (ari_sig(&it, &p)) ar_escribir(AR(y), i++, ar_leer(x, p));
  return y;
}
NAT(ar2_expandir) {
  (void)n; (void)extra; ARR_(a[0], 1, "expandir"); NUM(a[1], 2, "expandir");
  NArr* x = AR(a[0]); double e = trunc(a[1].u.n); double raw = a[1].u.n;
  if (e < 0) e += (double)(x->nd + 1);
  if (e < 0 || e > (double)x->nd) { NV fx = ar_formas_txt(x->forma, x->nd); NV r = ERRP(msg("puede ir de 0 a %d", (long long)x->nd), "«expandir»: el eje %n no cabe en un arreglo de %v", raw, fx); n_dec(fx); return r; }
  if (x->nd + 1 > AR_MAXND) return n_error("«expandir»: como mucho 8 dimensiones", NULL);
  int64_t f[AR_MAXND], z[AR_MAXND]; int ee = (int)e, k = 0;
  for (int i = 0; i <= x->nd; i++) { if (i == ee) { f[i] = 1; z[i] = 0; } else { f[i] = x->forma[k]; z[i] = x->zanc[k]; k++; } }
  return ar_vista(x, f, z, x->nd + 1, x->desp);
}
NAT(ar2_apretar) {
  (void)n; (void)extra; ARR_(a[0], 1, "apretar"); NArr* x = AR(a[0]); int64_t f[AR_MAXND], z[AR_MAXND]; int nf = 0;
  for (int i = 0; i < x->nd; i++) if (x->forma[i] != 1) { f[nf] = x->forma[i]; z[nf] = x->zanc[i]; nf++; }
  if (!nf) { f[0] = 1; z[0] = 1; nf = 1; }
  return ar_vista(x, f, z, nf, x->desp);
}
NAT(ar2_difundirA) {
  (void)n; (void)extra; ARR_(a[0], 1, "difundirA"); NArr* x = AR(a[0]); int64_t f[AR_MAXND]; int nd; NV err;
  if (!ar_forma_de(a[1], "difundirA", f, &nd, &err)) return err;
  int64_t c[AR_MAXND]; int nc; int ok = ar_difundir(x->forma, x->nd, f, nd, c, &nc) && nc == nd;
  for (int i = 0; ok && i < nd; i++) if (c[i] != f[i]) ok = 0;
  if (!ok) { NV fx = ar_formas_txt(x->forma, x->nd), fy = ar_formas_txt(f, nd); NV r = ERRP(n_texto_utf8("cada eje tiene que ser igual o medir 1 en el original"), "«difundirA»: %v no se puede estirar a %v", fx, fy); n_dec(fx); n_dec(fy); return r; }
  int64_t z[AR_MAXND]; ar_zanc_dif(x, f, nd, z);
  return ar_vista(x, f, z, nd, x->desp);
}

/* ── elegir y enmascarar ── */
NAT(ar2_donde) {
  (void)n; (void)extra; ARR_(a[0], 1, "donde");
  NArr* m = AR(a[0]); NV si = a[1], no = a[2];
  if (!n_es(si, NC_ARREGLO) && si.t != N_NUM) return ERR("«donde»: el argumento 2 debe ser un arreglo o un número y es %s", n_tipo_de(si));
  if (!n_es(no, NC_ARREGLO) && no.t != N_NUM) return ERR("«donde»: el argumento 3 debe ser un arreglo o un número y es %s", n_tipo_de(no));
  int64_t f[AR_MAXND]; int nf = m->nd; for (int i = 0; i < nf; i++) f[i] = m->forma[i];
  NArr* extras[2] = { n_es(si, NC_ARREGLO) ? AR(si) : NULL, n_es(no, NC_ARREGLO) ? AR(no) : NULL };
  for (int q = 0; q < 2; q++) if (extras[q]) {
    int64_t g[AR_MAXND]; int ng;
    if (!ar_difundir(f, nf, extras[q]->forma, extras[q]->nd, g, &ng)) {
      NArr tmp; memset(&tmp, 0, sizeof tmp); tmp.nd = nf; for (int i = 0; i < nf; i++) tmp.forma[i] = f[i];
      return ar_error_difundir("donde", &tmp, extras[q]);
    }
    nf = ng; for (int i = 0; i < ng; i++) f[i] = g[i];
  }
  int esS = extras[0] != NULL, esN = extras[1] != NULL;
  int tS = esS ? extras[0]->tipo : (si.u.n == trunc(si.u.n) && isfinite(si.u.n) ? AR_ENTERO : AR_REAL);
  int tN = esN ? extras[1]->tipo : (no.u.n == trunc(no.u.n) && isfinite(no.u.n) ? AR_ENTERO : AR_REAL);
  int tipo = ar_tipo_arit(tS, tN, OP_SUMA, esS, esN);
  if (tipo == AR_I64 || tipo == AR_U64) return ERR("«donde»: el resultado sería %s, y los arreglos de 64 bits todavía no están en el ejecutable nativo", AR_NOMBRE[tipo]);
  NV out = ar_nuevo(f, nf, tipo); if (N_FALLO(out)) return out;
  NArr* O = AR(out); int64_t cnt = ar_tam(O);
  int64_t zm[AR_MAXND], zs[AR_MAXND] = {0}, zn[AR_MAXND] = {0}, ix[AR_MAXND] = {0};
  ar_zanc_dif(m, f, nf, zm); if (esS) ar_zanc_dif(extras[0], f, nf, zs); if (esN) ar_zanc_dif(extras[1], f, nf, zn);
  for (int64_t k = 0; k < cnt; k++) {
    int64_t pm = m->desp, ps = esS ? extras[0]->desp : 0, pn = esN ? extras[1]->desp : 0;
    for (int q = 0; q < nf; q++) { pm += ix[q] * zm[q]; if (esS) ps += ix[q] * zs[q]; if (esN) pn += ix[q] * zn[q]; }
    double v = ar_leer(m, pm) != 0 ? (esS ? ar_leer(extras[0], ps) : si.u.n) : (esN ? ar_leer(extras[1], pn) : no.u.n);
    if (tipo == AR_REAL16) ((float*)O->buf->d)[k] = (float)ar_r16((double)(float)v); else ar_escribir(O, k, v);
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}
NAT(ar2_enMascara) {
  (void)n; (void)extra; ARR_(a[0], 1, "enMascara"); ARR_(a[1], 2, "enMascara");
  NArr *x = AR(a[0]), *m = AR(a[1]);
  if (ar_tam(m) != ar_tam(x)) return ERR("«enMascara»: la máscara tiene %d valores y el arreglo %d", (long long)ar_tam(m), (long long)ar_tam(x));
  int64_t nx, nm; double* vx = ar_valores(x, &nx); double* vm_ = ar_valores(m, &nm); int64_t cnt = 0;
  for (int64_t i = 0; i < nx; i++) if (vm_[i] != 0) cnt++;
  int64_t f[1] = { cnt }; NV y = ar_nuevo(f, 1, x->tipo); if (N_FALLO(y)) { free(vx); free(vm_); return y; }
  int64_t j = 0; for (int64_t i = 0; i < nx; i++) if (vm_[i] != 0) ar_escribir(AR(y), j++, vx[i]);
  free(vx); free(vm_); return y;
}
NAT(ar2_ponerEnMascara) {
  (void)n; (void)extra; ARR_(a[0], 1, "ponerEnMascara"); ARR_(a[1], 2, "ponerEnMascara");
  NArr *x = AR(a[0]), *m = AR(a[1]); NV v = a[2];
  if (ar_tam(m) != ar_tam(x)) return ERR("«ponerEnMascara»: la máscara tiene %d valores y el arreglo %d", (long long)ar_tam(m), (long long)ar_tam(x));
  int esArr = n_es(v, NC_ARREGLO);
  if (!esArr && v.t != N_NUM) return ERR("«ponerEnMascara»: el valor debe ser un número o un arreglo y es %s", n_tipo_de(v));
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("ponerEnMascara", x->tipo);
  int64_t nv_ = 0; double* vv = NULL; if (esArr) { NV e2; if (!ar_puerta(v, 3, "ponerEnMascara", &e2, 0)) return e2; vv = ar_valores(AR(v), &nv_); }
  int64_t nm; double* vm_ = ar_valores(m, &nm); ArIt it; int64_t p, i = 0, j = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) { if (vm_[i]) ar_escribir(x, p, esArr ? vv[j++ % nv_] : v.u.n); i++; }
  free(vm_); free(vv); return n_inc(a[0]);
}
/* contexto de las funciones de un número a un número con parámetros */
static double ar_c1, ar_c2;
static NV fx_recortar(double v, double* r) { *r = v < ar_c1 ? ar_c1 : v > ar_c2 ? ar_c2 : v; return n_nulo(); }
static NV fx_acero(double v, double* r) { *r = isnan(v) ? ar_c1 : v == INFINITY ? ar_c2 : v == -INFINITY ? -ar_c2 : v; return n_nulo(); }
static NV fx_max_k(double v, double* r) { *r = v > ar_c1 ? v : ar_c1; return n_nulo(); }
static NV fx_min_k(double v, double* r) { *r = v < ar_c1 ? v : ar_c1; return n_nulo(); }
NAT(ar2_recortar) {
  (void)n; (void)extra; ARR_(a[0], 1, "recortar"); NUM(a[1], 2, "recortar"); NUM(a[2], 3, "recortar");
  double lo = a[1].u.n, hi = a[2].u.n;
  if (lo > hi) return ERR("«recortar»: el mínimo %n es mayor que el máximo %n", lo, hi);
  ar_c1 = lo; ar_c2 = hi; return ar_unaria(AR(a[0]), fx_recortar, -1);
}
NAT(ar2_aCero) {
  (void)extra; ARR_(a[0], 1, "aCero"); double k = 0, gr = 1.7976931348623157e308;
  if (n > 1) { NUM(a[1], 2, "aCero"); k = a[1].u.n; } if (n > 2) { NUM(a[2], 3, "aCero"); gr = a[2].u.n; }
  ar_c1 = k; ar_c2 = gr; return ar_unaria(AR(a[0]), fx_acero, -1);
}
static NV ar2_dos_a_dos(NV* a, const char* nombre, int es_max) {
  ARR_(a[0], 1, nombre); NArr* x = AR(a[0]);
  if (n_es(a[1], NC_ARREGLO)) {
    NArr* y = AR(a[1]); int64_t f[AR_MAXND]; int nf;
    if (!ar_difundir(x->forma, x->nd, y->forma, y->nd, f, &nf)) return ar_error_difundir(nombre, x, y);
    int tipo = ar_tipo_arit(x->tipo, y->tipo, OP_SUMA, 1, 1);
    if (tipo == AR_I64 || tipo == AR_U64 || y->tipo == AR_COMPLEJO) return ar_error_i64(nombre, tipo == AR_COMPLEJO ? AR_COMPLEJO : tipo);
    NV out = ar_nuevo(f, nf, tipo); if (N_FALLO(out)) return out;
    int64_t cnt = ar_tam(AR(out)), zx[AR_MAXND], zy[AR_MAXND], ix[AR_MAXND] = {0}; ar_zanc_dif(x, f, nf, zx); ar_zanc_dif(y, f, nf, zy);
    for (int64_t k = 0; k < cnt; k++) {
      int64_t px = x->desp, py = y->desp; for (int q = 0; q < nf; q++) { px += ix[q] * zx[q]; py += ix[q] * zy[q]; }
      double p = ar_leer(x, px), q2 = ar_leer(y, py), r = es_max ? (p > q2 ? p : q2) : (p < q2 ? p : q2);
      if (tipo == AR_REAL16) ((float*)AR(out)->buf->d)[k] = (float)ar_r16((double)(float)r); else ar_escribir(AR(out), k, r);
      for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
    }
    return out;
  }
  NUM(a[1], 2, nombre);
  ar_c1 = a[1].u.n; return ar_unaria(x, es_max ? fx_max_k : fx_min_k, -1);
}
NAT(ar2_maximoDe) { (void)n; (void)extra; return ar2_dos_a_dos(a, "maximoDe", 1); }
NAT(ar2_minimoDe) { (void)n; (void)extra; return ar2_dos_a_dos(a, "minimoDe", 0); }

/* ── estadística ── */
static int ar_cmp_num(const void* p, const void* q) { double a = *(const double*)p, b = *(const double*)q; return a < b ? -1 : a > b ? 1 : 0; }
NAT(ar2_cuantil) {
  (void)n; (void)extra; ARR_(a[0], 1, "cuantil"); NUM(a[1], 2, "cuantil");
  double q = a[1].u.n;
  if (q < 0 || q > 1) return ERRP(msg("llegó %n · para percentiles divide por 100", q), "«cuantil»: el cuantil va de 0 a 1");
  int64_t nv; double* v = ar_valores(AR(a[0]), &nv); qsort(v, (size_t)nv, sizeof(double), ar_cmp_num);
  if (!nv) { free(v); return n_error("«cuantil»: el arreglo está vacío", NULL); }
  double pos = q * (double)(nv - 1), lo = floor(pos), hi = ceil(pos), r;
  r = lo == hi ? v[(int64_t)lo] : v[(int64_t)lo] + (v[(int64_t)hi] - v[(int64_t)lo]) * (pos - lo);
  free(v); return n_num(r);
}
NAT(ar2_normaVector) {
  (void)extra; ARR_(a[0], 1, "normaVector"); double o = 2;
  if (n > 1) { NUM(a[1], 2, "normaVector"); o = a[1].u.n; }
  NArr* x = AR(a[0]); double s = 0; ArIt it; int64_t p; ari_ini(&it, x);
  while (ari_sig(&it, &p)) { double v = fabs(ar_leer(x, p)); if (o == INFINITY) { if (v > s) s = v; } else if (o == 1) s += v; else s += pow_js(v, o); }
  return n_num(o == INFINITY || o == 1 ? s : pow_js(s, 1 / o));
}
static NV fx_estandar(double y, double* r) { *r = (y - ar_c1) / ar_c2; return n_nulo(); }
NAT(ar2_estandarizar) {
  (void)n; (void)extra; ARR_(a[0], 1, "estandarizar");
  NArr* x = AR(a[0]); int64_t nv; double* v = ar_valores(x, &nv);
  if (nv < 2) { free(v); return n_error("«estandarizar» necesita al menos dos valores", NULL); }
  double m = 0; for (int64_t i = 0; i < nv; i++) m += v[i]; m /= (double)nv;
  double s2 = 0; for (int64_t i = 0; i < nv; i++) s2 += (v[i] - m) * (v[i] - m);
  double s = sqrt(s2 / (double)(nv - 1)); free(v);
  if (s == 0) return n_error("«estandarizar»: todos los valores son iguales, así que la desviación es 0", NULL);
  ar_c1 = m; ar_c2 = s; return ar_unaria(x, fx_estandar, -2);
}
NAT(ar2_mediaMovil) {
  (void)n; (void)extra; ARR_(a[0], 1, "mediaMovil"); NUM(a[1], 2, "mediaMovil");
  NArr* x = AR(a[0]); double w = trunc(a[1].u.n);
  if (x->nd != 1) return n_error("«mediaMovil» trabaja sobre un arreglo de una dimensión", NULL);
  if (w < 1) return ERRP(msg("llegó %n", w), "«mediaMovil»: la ventana tiene que ser al menos 1");
  int64_t nv; double* v = ar_valores(x, &nv); int64_t W = (int64_t)w;
  if (W > nv) { free(v); return ERR("«mediaMovil»: la ventana es %n y el arreglo tiene %d valores", w, (long long)nv); }
  int64_t f[1] = { nv - W + 1 }; NV out = ar_nuevo(f, 1, AR_REAL); if (N_FALLO(out)) { free(v); return out; }
  double* o = (double*)AR(out)->buf->d; double s = 0;
  for (int64_t i = 0; i < W; i++) s += v[i];
  o[0] = s / (double)W;
  for (int64_t i = W; i < nv; i++) { s += v[i] - v[i - W]; o[i - W + 1] = s / (double)W; }
  free(v); return out;
}
static NV ar2_sin_nan(NV* a, const char* nombre, int que) {
  ARR_(a[0], 1, nombre); NArr* x = AR(a[0]); int64_t cnt = 0; double s = 0, mn = 0, mx = 0; ArIt it; int64_t p; ari_ini(&it, x);
  while (ari_sig(&it, &p)) {
    double y = ar_leer(x, p); if (isnan(y)) continue;
    if (cnt == 0) { mn = mx = y; } else { mn = js_min2(mn, y); mx = js_max2(mx, y); }
    s += y; cnt++;
  }
  if (!cnt) return ERR("«%s»: todos los valores son huecos", nombre);
  return n_num(que == 0 ? s : que == 1 ? s / (double)cnt : que == 2 ? mn : mx);
}
NAT(ar2_sumaSinNaN) { (void)n; (void)extra; return ar2_sin_nan(a, "sumaSinNaN", 0); }
NAT(ar2_mediaSinNaN) { (void)n; (void)extra; return ar2_sin_nan(a, "mediaSinNaN", 1); }
NAT(ar2_minimoSinNaN) { (void)n; (void)extra; return ar2_sin_nan(a, "minimoSinNaN", 2); }
NAT(ar2_maximoSinNaN) { (void)n; (void)extra; return ar2_sin_nan(a, "maximoSinNaN", 3); }

/* ── a lo largo de un eje: argMaximo/argMinimo y los acumulados ── */
static int ar_eje(NArr* x, double eje, const char* quien, int* e, NV* err) {
  double t = trunc(eje); if (t < 0) t += (double)x->nd;
  if (t < 0 || t >= (double)x->nd || isnan(t)) {
    NV fx = ar_formas_txt(x->forma, x->nd);
    NV pista = x->nd == 1 ? n_texto_utf8("este arreglo tiene un solo eje, el 0") : msg("los ejes van de 0 a %d, y −1 es el último", (long long)(x->nd - 1));
    *err = ERRP(pista, "«%s»: el eje %n no existe en un arreglo de %v", quien, eje, fx); n_dec(fx); return 0;
  }
  *e = (int)t; return 1;
}
static NV ar2_arg(NV* a, int n, const char* nombre, int es_max) {
  ARR_(a[0], 1, nombre); NArr* x = AR(a[0]);
  if (n > 1) {
    NUM(a[1], 2, nombre); int e; NV err; if (!ar_eje(x, a[1].u.n, "reducir", &e, &err)) return err;
    int64_t f[AR_MAXND], zr[AR_MAXND]; int nf = 0;
    for (int i = 0; i < x->nd; i++) if (i != e) { f[nf] = x->forma[i]; zr[nf] = x->zanc[i]; nf++; }
    int64_t uno[1] = { 1 };
    NV out = ar_nuevo(nf ? f : uno, nf ? nf : 1, AR_ENTERO); if (N_FALLO(out)) return out;
    int64_t largo = x->forma[e], zEje = x->zanc[e], total = ar_tam(AR(out)), ix[AR_MAXND] = {0};
    for (int64_t k = 0; k < total; k++) {
      int64_t base = x->desp; for (int q = 0; q < nf; q++) base += ix[q] * zr[q];
      int hay = 0; double mejor = 0; int64_t im = 0;
      for (int64_t j = 0; j < largo; j++) { double v = ar_leer(x, base + j * zEje); if (!hay || (es_max ? v > mejor : v < mejor)) { mejor = v; im = j; hay = 1; } }
      ar_escribir(AR(out), k, (double)im);
      for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
    }
    if (!nf) { double r = ar_leer(AR(out), 0); n_dec(out); return n_num(r); }
    return out;
  }
  int hay = 0; double mejor = 0; int64_t im = -1, i = 0; ArIt it; int64_t p; ari_ini(&it, x);
  while (ari_sig(&it, &p)) { double v = ar_leer(x, p); if (!hay || (es_max ? v > mejor : v < mejor)) { mejor = v; im = i; hay = 1; } i++; }
  return n_num((double)im);
}
NAT(ar2_argMaximo) { (void)extra; return ar2_arg(a, n, "argMaximo", 1); }
NAT(ar2_argMinimo) { (void)extra; return ar2_arg(a, n, "argMinimo", 0); }
static NV ar2_acum(NV* a, int n, const char* nombre, int que /* 0 suma 1 producto 2 máximo 3 mínimo */) {
  ARR_(a[0], 1, nombre); NArr* x = AR(a[0]);
  NV out = ar_nuevo(x->forma, x->nd, x->tipo == AR_BOOL ? AR_ENTERO : x->tipo); if (N_FALLO(out)) return out;
  double ini = que == 0 ? 0 : que == 1 ? 1 : que == 2 ? -INFINITY : INFINITY;
#define AR_PASO(acc, v) (que == 0 ? (acc) + (v) : que == 1 ? (acc) * (v) : que == 2 ? ((v) > (acc) ? (v) : (acc)) : ((v) < (acc) ? (v) : (acc)))
  if (n > 1) {
    NUM(a[1], 2, nombre); int e; NV err; if (!ar_eje(x, a[1].u.n, nombre, &e, &err)) { n_dec(out); return err; }
    NArr* O = AR(out); int64_t largo = x->forma[e], zEje = x->zanc[e], zOut = O->zanc[e];
    int64_t fr[AR_MAXND], zr[AR_MAXND], zo[AR_MAXND]; int nd = 0;
    for (int i = 0; i < x->nd; i++) if (i != e) { fr[nd] = x->forma[i]; zr[nd] = x->zanc[i]; zo[nd] = O->zanc[i]; nd++; }
    int64_t total = 1; for (int i = 0; i < nd; i++) total *= fr[i];
    int64_t ix[AR_MAXND] = {0};
    for (int64_t k = 0; k < total; k++) {
      int64_t base = x->desp, ob = 0; for (int q = 0; q < nd; q++) { base += ix[q] * zr[q]; ob += ix[q] * zo[q]; }
      double acc = ini;
      for (int64_t j = 0; j < largo; j++) { double v = ar_leer(x, base + j * zEje); acc = AR_PASO(acc, v); ar_escribir(O, ob + j * zOut, acc); }
      for (int q = nd - 1; q >= 0; q--) { if (++ix[q] < fr[q]) break; ix[q] = 0; }
    }
    return out;
  }
  double acc = ini; ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) { double v = ar_leer(x, p); acc = AR_PASO(acc, v); ar_escribir(AR(out), i++, acc); }
#undef AR_PASO
  return out;
}
NAT(ar2_acumSuma) { (void)extra; return ar2_acum(a, n, "acumSuma", 0); }
NAT(ar2_acumProducto) { (void)extra; return ar2_acum(a, n, "acumProducto", 1); }
NAT(ar2_acumMaximo) { (void)extra; return ar2_acum(a, n, "acumMaximo", 2); }
NAT(ar2_acumMinimo) { (void)extra; return ar2_acum(a, n, "acumMinimo", 3); }
NAT(ar2_diferencias) {
  (void)n; (void)extra; ARR_(a[0], 1, "diferencias"); NArr* x = AR(a[0]);
  if (x->nd != 1) return ERRP(msg("este tiene %d", (long long)x->nd), "«diferencias» trabaja sobre un arreglo de una dimensión");
  int64_t nv; double* v = ar_valores(x, &nv); int64_t f[1] = { nv < 2 ? 0 : nv - 1 };
  NV out = ar_nuevo(f, 1, x->tipo); if (N_FALLO(out)) { free(v); return out; }
  for (int64_t i = 0; i < f[0]; i++) ar_escribir(AR(out), i, v[i + 1] - v[i]);
  free(v); return out;
}

#define NAT_ARREGLO2 \
  { "numerico/por", 2, ar2_por }, { "numerico/productoPunto", 2, ar2_productoPunto }, { "numerico/identidadA", 1, ar2_identidadA }, { "numerico/diagonal", 1, ar2_diagonal }, \
  { "numerico/triangularSuperior", -1, ar2_triangularSuperior }, { "numerico/triangularInferior", -1, ar2_triangularInferior }, { "numerico/externo", 2, ar2_externo }, \
  { "numerico/kronecker", 2, ar2_kronecker }, { "numerico/esSimetrica", 1, ar2_esSimetrica }, { "numerico/aplanarA", 1, ar2_aplanarA }, { "numerico/expandir", 2, ar2_expandir }, \
  { "numerico/apretar", -1, ar2_apretar }, { "numerico/difundirA", 2, ar2_difundirA }, { "numerico/donde", -1, ar2_donde }, { "numerico/enMascara", 2, ar2_enMascara }, \
  { "numerico/ponerEnMascara", -1, ar2_ponerEnMascara }, { "numerico/recortar", -1, ar2_recortar }, { "numerico/aCero", -1, ar2_aCero }, { "numerico/maximoDe", -1, ar2_maximoDe }, \
  { "numerico/minimoDe", -1, ar2_minimoDe }, { "numerico/cuantil", -1, ar2_cuantil }, { "numerico/normaVector", -1, ar2_normaVector }, { "numerico/estandarizar", 1, ar2_estandarizar }, \
  { "numerico/mediaMovil", -1, ar2_mediaMovil }, { "numerico/sumaSinNaN", -1, ar2_sumaSinNaN }, { "numerico/mediaSinNaN", -1, ar2_mediaSinNaN }, \
  { "numerico/minimoSinNaN", -1, ar2_minimoSinNaN }, { "numerico/maximoSinNaN", -1, ar2_maximoSinNaN }, { "numerico/argMaximo", -1, ar2_argMaximo }, { "numerico/argMinimo", -1, ar2_argMinimo }, \
  { "numerico/acumSuma", -1, ar2_acumSuma }, { "numerico/acumProducto", -1, ar2_acumProducto }, { "numerico/acumMaximo", -1, ar2_acumMaximo }, { "numerico/acumMinimo", -1, ar2_acumMinimo }, \
  { "numerico/diferencias", -1, ar2_diferencias },
