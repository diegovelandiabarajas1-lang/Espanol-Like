/* ============================================================================
 *  Ñ sin runtime — el eDSL «numerico» (src/11-edsl-numerico.js), la parte de
 *  números y listas. Los arreglos (arreglo, ceros, aListaA…) son otra tanda.
 *  Se incluye desde nrt.c.
 * ========================================================================== */

/* ── las validaciones de numerico: «nums» (lista de solo números) ── */
static int exige_nums(NV v, int k, const char* f, NV* err) {
  if (!exige_lista(v, k, f, err)) return 0;
  NLista* l = LS(v);
  for (int64_t i = 0; i < l->n; i++) if (l->v[i].t != N_NUM) { *err = ERR("«%s»: la lista debe contener solo números", f); return 0; }
  return 1;
}
#define NUMS(k, f) do { NV e_; if (!exige_nums(a[k], (k) + 1, (f), &e_)) return e_; } while (0)
static double* nums_de(NV v) {   /* copia de los números, para ordenar */
  NLista* l = LS(v); double* x = (double*)n_mem(sizeof(double) * (size_t)(l->n + 1));
  for (int64_t i = 0; i < l->n; i++) x[i] = l->v[i].u.n;
  return x;
}
static int cmp_dbl(const void* p, const void* q) { double a = *(const double*)p, b = *(const double*)q; return a < b ? -1 : a > b ? 1 : 0; }
static double suma_de(NLista* l) { double s = 0; for (int64_t i = 0; i < l->n; i++) s += l->v[i].u.n; return s; }
static double suma_cuad(NLista* l, double m) { double s = 0; for (int64_t i = 0; i < l->n; i++) { double d = l->v[i].u.n - m; s += d * d; } return s; }
static double round_js(double x) {   /* Math.round: el medio va hacia +∞ */
  if (!isfinite(x)) return x;
  double r = floor(x);
  if (x - r >= 0.5) r += 1;
  if (r == 0 && (x < 0 || (x == 0 && signbit(x)))) return -0.0;
  return r;
}
static double sign_js(double x) { if (isnan(x)) return x; if (x > 0) return 1; if (x < 0) return -1; return x; }

/* ── las de un número ── */
static NV m1(NV* a, const char* f, double (*fx)(double)) { NUM(a[0], 1, f); return n_num(fx(a[0].u.n)); }
#define M1(nombre, fx) NAT(nu_##nombre) { (void)n; (void)extra; return m1(a, #nombre, fx); }
M1(absoluto, fabs) M1(piso, floor) M1(techo, ceil) M1(seno, fd_sin) M1(coseno, fd_cos) M1(tangente, fd_tan)
M1(arcoseno, fd_asin) M1(arcocoseno, fd_acos) M1(arcotangente, fd_atan) M1(exp, fd_exp) M1(signo, sign_js)
NAT(nu_raiz) { (void)n; (void)extra; NUM(a[0], 1, "raiz"); if (a[0].u.n < 0) return n_error("«raiz» de un número negativo", NULL); return n_num(sqrt(a[0].u.n)); }
NAT(nu_log) { (void)n; (void)extra; NUM(a[0], 1, "log"); if (a[0].u.n <= 0) return n_error("«log» necesita un número positivo", NULL); return n_num(fd_log(a[0].u.n)); }
NAT(nu_log10) { (void)n; (void)extra; NUM(a[0], 1, "log10"); if (a[0].u.n <= 0) return n_error("«log10» necesita un número positivo", NULL); return n_num(fd_log10(a[0].u.n)); }
NAT(nu_log2) { (void)n; (void)extra; NUM(a[0], 1, "log2"); if (a[0].u.n <= 0) return n_error("«log2» necesita un número positivo", NULL); return n_num(fd_log2(a[0].u.n)); }
NAT(nu_redondear) {
  (void)extra; NUM(a[0], 1, "redondear"); double d = 0;
  if (n > 1) { NUM(a[1], 2, "redondear"); d = a[1].u.n; }
  double f = pow_js(10, d);
  return n_num(round_js(a[0].u.n * f) / f);
}
NAT(nu_truncar) {
  (void)extra; NUM(a[0], 1, "truncar");
  if (n < 2) return n_num(trunc(a[0].u.n));
  ENT(dd, 1, "truncar"); double f = pow_js(10, dd);
  return n_num(trunc(a[0].u.n * f) / f);
}
NAT(nu_potencia) { (void)n; (void)extra; NUM(a[0], 1, "potencia"); NUM(a[1], 2, "potencia"); return n_num(pow_js(a[0].u.n, a[1].u.n)); }
NAT(nu_acotar) {
  (void)n; (void)extra; NUM(a[0], 1, "acotar"); NUM(a[1], 2, "acotar"); NUM(a[2], 3, "acotar");
  double x = a[0].u.n, lo = a[1].u.n, hi = a[2].u.n;
  if (lo > hi) return n_error("«acotar»: el mínimo es mayor que el máximo", NULL);
  double m = x > lo ? x : lo; if (isnan(x) || isnan(lo)) m = NAN;
  return n_num(isnan(m) || isnan(hi) ? NAN : (hi < m ? hi : m));
}
NAT(nu_entre) {
  (void)n; (void)extra; NUM(a[0], 1, "entre"); NUM(a[1], 2, "entre"); NUM(a[2], 3, "entre");
  double x = a[0].u.n, lo = a[1].u.n, hi = a[2].u.n, mn = lo < hi ? lo : hi, mx = lo < hi ? hi : lo;
  return n_bool(x >= mn && x <= mx);
}
NAT(nu_casiIgual) {
  (void)extra; NUM(a[0], 1, "casiIgual"); NUM(a[1], 2, "casiIgual");
  double x = a[0].u.n, y = a[1].u.n;
  if (x == y) return n_bool(1);
  double tol = 1e-9; if (n > 2) { NUM(a[2], 3, "casiIgual"); tol = a[2].u.n; }
  double e = 1; if (fabs(x) > e) e = fabs(x); if (fabs(y) > e) e = fabs(y);
  return n_bool(fabs(x - y) <= tol * e);
}
NAT(nu_raizN) {
  (void)n; (void)extra; NUM(a[0], 1, "raizN"); NUM(a[1], 2, "raizN");
  double x = a[0].u.n, k = a[1].u.n;
  if (k == 0) return n_error("«raizN»: el índice no puede ser 0", NULL);
  if (x < 0) { if (fabs(fmod(k, 2)) != 1) return n_error("«raizN»: la raíz par de un negativo no es un número real", NULL); return n_num(-pow_js(-x, 1 / k)); }
  return n_num(pow_js(x, 1 / k));
}
NAT(nu_angulo) { (void)n; (void)extra; NUM(a[0], 1, "angulo"); NUM(a[1], 2, "angulo"); return n_num(fd_atan2(a[0].u.n, a[1].u.n)); }
NAT(nu_grados) { (void)n; (void)extra; NUM(a[0], 1, "grados"); return n_num(a[0].u.n * 180 / 3.141592653589793); }
NAT(nu_radianes) { (void)n; (void)extra; NUM(a[0], 1, "radianes"); return n_num(a[0].u.n * 3.141592653589793 / 180); }
NAT(nu_hipotenusa) {
  (void)extra;
  for (int i = 0; i < n; i++) NUM(a[i], i + 1, "hipotenusa");
  if (!n) return n_error("«hipotenusa» necesita al menos un lado", NULL);
  /* Math.hypot: infinito gana a NaN; si no, escala por el mayor */
  double mx = 0; int nan = 0;
  for (int i = 0; i < n; i++) { double v = fabs(a[i].u.n); if (isinf(v)) return n_num(INFINITY); if (isnan(v)) nan = 1; if (v > mx) mx = v; }
  if (nan) return n_num(NAN);
  if (mx == 0) return n_num(0);
  double s = 0, c = 0;
  for (int i = 0; i < n; i++) { double r = a[i].u.n / mx, y = r * r - c, t = s + y; c = (t - s) - y; s = t; }
  return n_num(sqrt(s) * mx);
}

/* ── las de una lista ── */
NAT(nu_suma) { (void)n; (void)extra; NUMS(0, "suma"); return n_num(suma_de(LS(a[0]))); }
NAT(nu_media) { (void)n; (void)extra; NUMS(0, "media"); if (!LS(a[0])->n) return n_error("«media» de una lista vacía", NULL); return n_num(suma_de(LS(a[0])) / (double)LS(a[0])->n); }
NAT(nu_mediana) {
  (void)n; (void)extra; NUMS(0, "mediana"); NLista* l = LS(a[0]);
  if (!l->n) return n_error("«mediana» de una lista vacía", NULL);
  double* x = nums_de(a[0]); qsort(x, (size_t)l->n, sizeof(double), cmp_dbl);
  int64_t m = l->n >> 1; double r = l->n % 2 ? x[m] : (x[m - 1] + x[m]) / 2; free(x);
  return n_num(r);
}
NAT(nu_moda) {
  (void)n; (void)extra; NUMS(0, "moda"); NLista* l = LS(a[0]);
  if (!l->n) return n_error("«moda» de una lista vacía", NULL);
  NV c = n_dic_nuevo(); double mejor = l->v[0].u.n; double mc = 0;
  for (int64_t i = 0; i < l->n; i++) {
    NV v; double k = 1; if (n_dic_buscar(DC(c), l->v[i], &v)) k = v.u.n + 1;
    n_dic_poner(DC(c), l->v[i], n_num(k));
    if (k > mc) { mc = k; mejor = l->v[i].u.n; }
  }
  n_dec(c);
  return n_num(mejor);
}
NAT(nu_varianza) {
  (void)n; (void)extra; NUMS(0, "varianza"); NLista* l = LS(a[0]);
  if (l->n < 2) return n_error("«varianza» necesita al menos 2 datos", NULL);
  double m = suma_de(l) / (double)l->n; return n_num(suma_cuad(l, m) / (double)(l->n - 1));
}
NAT(nu_desviacion) {
  (void)n; (void)extra; NUMS(0, "desviacion"); NLista* l = LS(a[0]);
  if (l->n < 2) return n_error("«desviacion» necesita al menos 2 datos", NULL);
  double m = suma_de(l) / (double)l->n; return n_num(sqrt(suma_cuad(l, m) / (double)(l->n - 1)));
}
NAT(nu_percentil) {
  (void)n; (void)extra; NUMS(0, "percentil"); NUM(a[1], 2, "percentil"); NLista* l = LS(a[0]); double p = a[1].u.n;
  if (!l->n) return n_error("«percentil» de una lista vacía", NULL);
  if (p < 0 || p > 100) return n_error("«percentil»: el percentil debe ir de 0 a 100", NULL);
  double* x = nums_de(a[0]); qsort(x, (size_t)l->n, sizeof(double), cmp_dbl);
  double pos = (p / 100) * (double)(l->n - 1), lo = floor(pos), hi = ceil(pos);
  double r = lo == hi ? x[(int64_t)lo] : x[(int64_t)lo] + (pos - lo) * (x[(int64_t)hi] - x[(int64_t)lo]);
  free(x); return n_num(r);
}
static double media_l(NLista* l) { return suma_de(l) / (double)l->n; }
NAT(nu_correlacion) {
  (void)n; (void)extra; NUMS(0, "correlacion"); NUMS(1, "correlacion"); NLista *x = LS(a[0]), *y = LS(a[1]);
  if (x->n != y->n) return n_error("«correlacion»: las dos listas deben tener el mismo tamaño", NULL);
  if (x->n < 2) return n_error("«correlacion» necesita al menos 2 puntos", NULL);
  double mx = media_l(x), my = media_l(y), sxy = 0, sxx = 0, syy = 0;
  for (int64_t i = 0; i < x->n; i++) { double dx = x->v[i].u.n - mx, dy = y->v[i].u.n - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx == 0 || syy == 0) return n_error("«correlacion»: una de las listas no varía", NULL);
  return n_num(sxy / sqrt(sxx * syy));
}
NAT(nu_regresion) {
  (void)n; (void)extra; NUMS(0, "regresion"); NUMS(1, "regresion"); NLista *x = LS(a[0]), *y = LS(a[1]);
  if (x->n != y->n) return n_error("«regresion»: las dos listas deben tener el mismo tamaño", NULL);
  if (x->n < 2) return n_error("«regresion» necesita al menos 2 puntos", NULL);
  double mx = media_l(x), my = media_l(y), sxy = 0, sxx = 0;
  for (int64_t i = 0; i < x->n; i++) { sxy += (x->v[i].u.n - mx) * (y->v[i].u.n - my); sxx += pow_js(x->v[i].u.n - mx, 2); }
  if (sxx == 0) return n_error("«regresion»: todos los x son iguales", NULL);
  double m = sxy / sxx, b = my - m * mx, sr = 0, st = 0;
  for (int64_t i = 0; i < x->n; i++) { sr += pow_js(y->v[i].u.n - (m * x->v[i].u.n + b), 2); st += pow_js(y->v[i].u.n - my, 2); }
  NV d = n_dic_nuevo(); NV k;
  k = n_texto_utf8("pendiente"); n_dic_poner(DC(d), k, n_num(m)); n_dec(k);
  k = n_texto_utf8("intercepto"); n_dic_poner(DC(d), k, n_num(b)); n_dec(k);
  k = n_texto_utf8("r2"); n_dic_poner(DC(d), k, n_num(st == 0 ? 1 : 1 - sr / st)); n_dec(k);
  return d;
}
static double min_js(NLista* l) { double m = INFINITY; for (int64_t i = 0; i < l->n; i++) { double v = l->v[i].u.n; if (isnan(v)) return NAN; if (v < m || (v == 0 && m == 0 && signbit(v))) m = v; } return m; }
static double max_js(NLista* l) { double m = -INFINITY; for (int64_t i = 0; i < l->n; i++) { double v = l->v[i].u.n; if (isnan(v)) return NAN; if (v > m || (v == 0 && m == 0 && !signbit(v))) m = v; } return m; }
NAT(nu_normalizar) {
  (void)n; (void)extra; NUMS(0, "normalizar"); NLista* l = LS(a[0]);
  double lo = min_js(l), hi = max_js(l); NV r = n_lista_nueva(l->n);
  for (int64_t i = 0; i < l->n; i++) n_lista_agregar(LS(r), n_num(hi == lo ? 0 : (l->v[i].u.n - lo) / (hi - lo)));
  return r;
}
NAT(nu_histograma) {
  (void)n; (void)extra; NUMS(0, "histograma"); NUM(a[1], 2, "histograma"); NLista* l = LS(a[0]); double k = a[1].u.n;
  if (k < 1) return n_error("«histograma»: el número de cajas debe ser ≥ 1", NULL);
  double lo = min_js(l), hi = max_js(l), w = (hi - lo) / k; if (w == 0 || isnan(w)) w = 1;
  int64_t K = (int64_t)k; double* c = (double*)calloc((size_t)K, sizeof(double));
  for (int64_t q = 0; q < l->n; q++) { double i = floor((l->v[q].u.n - lo) / w); if (i >= k) i = k - 1; if (i < 0) i = 0; c[(int64_t)i]++; }
  NV r = n_lista_nueva(K); for (int64_t q = 0; q < K; q++) n_lista_agregar(LS(r), n_num(c[q])); free(c);
  return r;
}
NAT(nu_producto) { (void)n; (void)extra; NUMS(0, "producto"); NLista* l = LS(a[0]); double p = 1; for (int64_t i = 0; i < l->n; i++) p *= l->v[i].u.n; return n_num(p); }
NAT(nu_amplitud) { (void)n; (void)extra; NUMS(0, "amplitud"); NLista* l = LS(a[0]); if (!l->n) return n_error("«amplitud» de una lista vacía", NULL); return n_num(max_js(l) - min_js(l)); }
NAT(nu_cuartiles) {
  (void)n; (void)extra; NUMS(0, "cuartiles"); NLista* l = LS(a[0]);
  if (!l->n) return n_error("«cuartiles» de una lista vacía", NULL);
  double* x = nums_de(a[0]); qsort(x, (size_t)l->n, sizeof(double), cmp_dbl);
  #define Q(p) ({ double i_ = (double)(l->n - 1) * (p) / 100; double b_ = floor(i_), r_ = i_ - b_; (int64_t)b_ + 1 < l->n ? x[(int64_t)b_] + (x[(int64_t)b_ + 1] - x[(int64_t)b_]) * r_ : x[(int64_t)b_]; })
  NV d = n_dic_nuevo(); NV k;
  k = n_texto_utf8("minimo"); n_dic_poner(DC(d), k, n_num(x[0])); n_dec(k);
  k = n_texto_utf8("q1"); n_dic_poner(DC(d), k, n_num(Q(25))); n_dec(k);
  k = n_texto_utf8("mediana"); n_dic_poner(DC(d), k, n_num(Q(50))); n_dec(k);
  k = n_texto_utf8("q3"); n_dic_poner(DC(d), k, n_num(Q(75))); n_dec(k);
  k = n_texto_utf8("maximo"); n_dic_poner(DC(d), k, n_num(x[l->n - 1])); n_dec(k);
  #undef Q
  free(x); return d;
}
NAT(nu_acumulado) { (void)n; (void)extra; NUMS(0, "acumulado"); NLista* l = LS(a[0]); NV r = n_lista_nueva(l->n); double t = 0; for (int64_t i = 0; i < l->n; i++) { t += l->v[i].u.n; n_lista_agregar(LS(r), n_num(t)); } return r; }
NAT(nu_covarianza) {
  (void)n; (void)extra; NUMS(0, "covarianza"); NUMS(1, "covarianza"); NLista *x = LS(a[0]), *y = LS(a[1]);
  if (x->n != y->n) return n_error("«covarianza»: las dos listas tienen que medir lo mismo", NULL);
  if (x->n < 2) return n_error("«covarianza» necesita al menos 2 pares", NULL);
  double mx = media_l(x), my = media_l(y), s = 0;
  for (int64_t i = 0; i < x->n; i++) s += (x->v[i].u.n - mx) * (y->v[i].u.n - my);
  return n_num(s / (double)(x->n - 1));
}
NAT(nu_tendencia) {
  (void)n; (void)extra; NUMS(0, "tendencia"); NLista* y = LS(a[0]);
  if (y->n < 2) return n_error("«tendencia» necesita al menos 2 datos", NULL);
  double N = (double)y->n, mx = (N - 1) / 2, my = media_l(y), sxy = 0, sxx = 0;
  for (int64_t i = 0; i < y->n; i++) { sxy += ((double)i - mx) * (y->v[i].u.n - my); sxx += ((double)i - mx) * ((double)i - mx); }
  return n_num(sxy / sxx);
}
NAT(nu_tipificar) {
  (void)n; (void)extra; NUMS(0, "tipificar"); NLista* x = LS(a[0]);
  if (x->n < 2) return n_error("«tipificar» necesita al menos 2 datos", NULL);
  double m = media_l(x), q = 0; for (int64_t i = 0; i < x->n; i++) q = q + (x->v[i].u.n - m) * (x->v[i].u.n - m);
  double s = sqrt(q / (double)(x->n - 1));
  if (s == 0) return n_error("«tipificar»: todos los datos son iguales, no hay desviación", NULL);
  NV r = n_lista_nueva(x->n); for (int64_t i = 0; i < x->n; i++) n_lista_agregar(LS(r), n_num((x->v[i].u.n - m) / s));
  return r;
}

/* ── el azar: mulberry32, la misma secuencia que la VM con la misma semilla ── */
static uint32_t az_sem; static int az_hay_guardada; static double az_guardada;
static void az_iniciar(void) { az_sem = (uint32_t)((uint64_t)ms_epoca() ^ (uint64_t)rand() * 2654435761u); }
static double az_sig(void) {
  az_sem += 0x6D2B79F5u;
  uint32_t t = az_sem;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
static double az_normal(void) {
  if (az_hay_guardada) { az_hay_guardada = 0; return az_guardada; }
  double u = 0; while (u == 0) u = az_sig();
  double v = az_sig(), r = sqrt(-2 * fd_log(u));
  az_guardada = r * fd_sin(2 * 3.141592653589793 * v); az_hay_guardada = 1;
  return r * fd_cos(2 * 3.141592653589793 * v);
}
NAT(nu_azar) { SIN_USO; return n_num(az_sig()); }
NAT(nu_azarEntre) {
  (void)n; (void)extra; ENT(lo, 0, "azarEntre"); ENT(hi, 1, "azarEntre");
  if (lo > hi) return n_error("«azarEntre»: el mínimo es mayor que el máximo", NULL);
  return n_num(lo + floor(az_sig() * (hi - lo + 1)));
}
NAT(nu_azarNormal) {
  (void)extra; double m = 0, s = 1;
  if (n > 0) { NUM(a[0], 1, "azarNormal"); m = a[0].u.n; }
  if (n > 1) { NUM(a[1], 2, "azarNormal"); s = a[1].u.n; }
  if (s < 0) return n_error("«azarNormal»: la desviación no puede ser negativa", NULL);
  return n_num(m + s * az_normal());
}
NAT(nu_elegir) { (void)n; (void)extra; LST(a[0], 1, "elegir"); NLista* l = LS(a[0]); if (!l->n) return n_error("«elegir» de una lista vacía", NULL); return n_inc(l->v[(int64_t)floor(az_sig() * (double)l->n)]); }
NAT(nu_elegirVarios) {
  (void)n; (void)extra; LST(a[0], 1, "elegirVarios"); ENT(k, 1, "elegirVarios"); NLista* l = LS(a[0]);
  if (k < 0) return n_error("«elegirVarios»: no se pueden elegir menos de 0", NULL);
  if (k > (double)l->n) return ERRP(n_texto_utf8("son SIN repetir; para permitir repetidos, llama a «elegir» varias veces"), "«elegirVarios»: se piden %j de una lista de %d", k, (long long)l->n);
  NV* c = (NV*)n_mem(sizeof(NV) * (size_t)(l->n + 1)); memcpy(c, l->v, sizeof(NV) * (size_t)l->n);
  for (int64_t i = 0; i < (int64_t)k; i++) { int64_t j = i + (int64_t)floor(az_sig() * (double)(l->n - i)); NV t = c[i]; c[i] = c[j]; c[j] = t; }
  NV r = n_lista_de(c, (int)k); free(c); return r;
}
NAT(nu_barajar) {
  (void)n; (void)extra; LST(a[0], 1, "barajar"); NLista* l = LS(a[0]);
  NV r = n_lista_de(l->v, (int)l->n); NLista* c = LS(r);
  for (int64_t i = c->n - 1; i > 0; i--) { int64_t j = (int64_t)floor(az_sig() * (double)(i + 1)); NV t = c->v[i]; c->v[i] = c->v[j]; c->v[j] = t; }
  return r;
}
NAT(nu_semilla) { (void)n; (void)extra; ENT(s, 0, "semilla"); az_sem = (uint32_t)(uint64_t)(int64_t)s; az_hay_guardada = 0; return n_nulo(); }

/* ── enteros ── */
NAT(nu_esPrimo) {
  (void)n; (void)extra; ENT(k, 0, "esPrimo");
  if (k < 2) return n_bool(0);
  if (fmod(k, 2) == 0) return n_bool(k == 2);
  for (double d = 3; d * d <= k; d += 2) if (fmod(k, d) == 0) return n_bool(0);
  return n_bool(1);
}
NAT(nu_primos) {
  (void)n; (void)extra; ENT(k, 0, "primos");
  if (k > 5e6) {
    char d[64], s[96]; snprintf(d, sizeof d, "%.0f", k); int L = (int)strlen(d), o = 0;
    for (int i = 0; i < L; i++) { s[o++] = d[i]; if ((L - i - 1) % 3 == 0 && i < L - 1) s[o++] = '.'; }
    s[o] = 0;
    return ERRP(n_texto_utf8("el tope son 5 millones"), "«primos»: hasta %s son demasiados", s);
  }
  if (k < 2) return n_lista_nueva(0);
  int64_t N = (int64_t)k; unsigned char* cr = (unsigned char*)calloc((size_t)N + 1, 1); NV r = n_lista_nueva(16);
  for (int64_t i = 2; i <= N; i++) { if (cr[i]) continue; n_lista_agregar(LS(r), n_num((double)i)); for (int64_t j = i * i; j <= N; j += i) cr[j] = 1; }
  free(cr); return r;
}
NAT(nu_mcd) {
  (void)extra; if (n < 2) return n_error("«mcd» necesita al menos dos números", NULL);
  ENT(g0, 0, "mcd"); double g = fabs(g0);
  for (int i = 1; i < n; i++) { NV e_; double b; if (!ent_de(a[i], i + 1, "mcd", &b, &e_)) return e_; b = fabs(b); while (b) { double t = fmod(g, b); g = b; b = t; } }
  return n_num(g);
}
NAT(nu_mcm) {
  (void)extra; if (n < 2) return n_error("«mcm» necesita al menos dos números", NULL);
  ENT(m0, 0, "mcm"); double m = fabs(m0);
  for (int i = 1; i < n; i++) {
    NV e_; double b; if (!ent_de(a[i], i + 1, "mcm", &b, &e_)) return e_; b = fabs(b);
    if (m == 0 || b == 0) return n_num(0);
    double x = m, y = b; while (y) { double t = fmod(x, y); x = y; y = t; }
    m = m / x * b;
    if (!isfinite(m)) return n_error("«mcm»: el resultado es demasiado grande", NULL);
  }
  return n_num(m);
}
NAT(nu_factorial) {
  (void)n; (void)extra; ENT(k, 0, "factorial");
  if (k < 0) return n_error("«factorial» de un negativo no existe", NULL);
  if (k > 170) return ERRP(n_texto_utf8("para el número exacto, con todas sus cifras: factorialExacto(n) de \"nen\""), "«factorial»: %j! no cabe en un número real (el más grande que cabe es 170!)", k);
  double r = 1; for (double i = 2; i <= k; i++) r *= i;
  return n_num(r);
}
NAT(nu_combinaciones) {
  (void)n; (void)extra; ENT(N, 0, "combinaciones"); ENT(k, 1, "combinaciones");
  if (N < 0 || k < 0) return n_error("«combinaciones» no admite negativos", NULL);
  if (k > N) return n_num(0);
  double r = 1, m = k < N - k ? k : N - k;
  for (double i = 1; i <= m; i++) r = r * (N - m + i) / i;
  return n_num(round_js(r));
}
NAT(nu_permutaciones) {
  (void)n; (void)extra; ENT(N, 0, "permutaciones"); ENT(k, 1, "permutaciones");
  if (N < 0 || k < 0) return n_error("«permutaciones» no admite negativos", NULL);
  if (k > N) return n_num(0);
  double r = 1; for (double i = 0; i < k; i++) r *= N - i;
  if (!isfinite(r)) return n_error("«permutaciones»: el resultado no cabe en un número", NULL);
  return n_num(r);
}
NAT(nu_divisores) {
  (void)n; (void)extra; ENT(k0, 0, "divisores"); double k = fabs(k0);
  if (k == 0) return n_error("«divisores» de 0: todos lo dividen", NULL);
  NV ch = n_lista_nueva(8), gr = n_lista_nueva(8);
  for (double d = 1; d * d <= k; d++) { if (fmod(k, d)) continue; n_lista_agregar(LS(ch), n_num(d)); if (d != k / d) n_lista_agregar(LS(gr), n_num(k / d)); }
  for (int64_t i = LS(gr)->n - 1; i >= 0; i--) n_lista_agregar(LS(ch), LS(gr)->v[i]);
  LS(gr)->n = 0; n_dec(gr);
  return ch;
}

/* ── dinero en el tiempo ── */
static int tasa_de(NV v, int k, const char* f, double* t, NV* err) {
  if (!exige_num(v, k, f, err)) return 0;
  *t = v.u.n;
  if (*t > 1) { *err = ERRP(n_texto_utf8("la tasa va como fracción del periodo: 0.019 para el 1,9 % mensual"), "«%s»: una tasa de %j es el %j %%", f, *t, *t * 100); return 0; }
  if (*t <= -1) { *err = ERR("«%s»: una tasa de %j no tiene sentido", f, *t); return 0; }
  return 1;
}
#define TASA(var, k, f) double var; do { NV e_; if (!tasa_de(a[k], (k) + 1, f, &var, &e_)) return e_; } while (0)
NAT(nu_valorFuturo) { (void)n; (void)extra; NUM(a[0], 1, "valorFuturo"); TASA(t, 1, "valorFuturo"); ENT(p, 2, "valorFuturo"); return n_num(a[0].u.n * pow_js(1 + t, p)); }
NAT(nu_valorPresente) { (void)n; (void)extra; NUM(a[0], 1, "valorPresente"); TASA(t, 1, "valorPresente"); ENT(p, 2, "valorPresente"); return n_num(a[0].u.n / pow_js(1 + t, p)); }
NAT(nu_interesCompuesto) {
  (void)extra; NUM(a[0], 1, "interesCompuesto"); TASA(t, 1, "interesCompuesto"); ENT(p, 2, "interesCompuesto");
  double veces = 1; if (n > 3) { NV e_; if (!ent_de(a[3], 4, "interesCompuesto", &veces, &e_)) return e_; }
  if (veces < 1) return n_error("«interesCompuesto»: las capitalizaciones por periodo son 1 o más", NULL);
  return n_num(a[0].u.n * pow_js(1 + t / veces, p * veces));
}
NAT(nu_tasaEfectiva) { (void)n; (void)extra; TASA(t, 0, "tasaEfectiva"); ENT(m, 1, "tasaEfectiva"); if (m < 1) return n_error("«tasaEfectiva»: los periodos por año son 1 o más", NULL); return n_num(pow_js(1 + t / m, m) - 1); }
NAT(nu_cuota) {
  (void)n; (void)extra; NUM(a[0], 1, "cuota"); TASA(t, 1, "cuota"); ENT(p, 2, "cuota");
  if (p < 1) return n_error("«cuota»: los periodos tienen que ser 1 o más", NULL);
  if (t == 0) return n_num(a[0].u.n / p);
  return n_num(a[0].u.n * t / (1 - pow_js(1 + t, -p)));
}
NAT(nu_amortizacion) {
  (void)n; (void)extra; NUM(a[0], 1, "amortizacion"); TASA(t, 1, "amortizacion"); ENT(p, 2, "amortizacion");
  double c = a[0].u.n;
  if (p < 1) return n_error("«amortizacion»: los periodos tienen que ser 1 o más", NULL);
  if (p > 2000) return ERRP(n_texto_utf8("el tope son 2000 filas"), "«amortizacion»: %j periodos son demasiados", p);
  double q = t == 0 ? c / p : c * t / (1 - pow_js(1 + t, -p)), saldo = c;
  NV filas = n_lista_nueva((int64_t)p);
  const char* nk[] = { "periodo", "cuota", "interes", "abono", "saldo" };
  for (double i = 1; i <= p; i++) {
    double interes = saldo * t, abono = i == p ? saldo : q - interes, pago = i == p ? saldo + interes : q;
    saldo = i == p ? 0 : saldo - abono;
    double vs[5] = { i, pago, interes, abono, saldo };
    NV d = n_dic_nuevo();
    for (int k = 0; k < 5; k++) { NV kk = n_texto_utf8(nk[k]); n_dic_poner(DC(d), kk, n_num(vs[k])); n_dec(kk); }
    n_lista_agregar(LS(filas), d);
  }
  return filas;
}

/* ── matrices como listas de listas ── */
static int filas_de(NV m, const char* f, NV* err) {
  if (!exige_lista(m, 1, f, err)) return 0;
  NLista* l = LS(m);
  for (int64_t i = 0; i < l->n; i++) if (!n_es(l->v[i], NC_LISTA)) { *err = ERR("«%s»: se esperaba una matriz (lista de listas)", f); return 0; }
  return 1;
}
#define FILAS(k, f) do { NV e_; if (!filas_de(a[k], f, &e_)) return e_; } while (0)
#define F_(m, i) LS(LS(m)->v[i])
static double num0(NV v) { return v.t == N_NUM ? v.u.n : (v.t == N_BOOL ? v.u.b : (v.t == N_NULO ? 0 : NAN)); }
NAT(nu_matriz) {
  (void)n; (void)extra; NUM(a[0], 1, "matriz"); NUM(a[1], 2, "matriz");
  double f = a[0].u.n, c = a[1].u.n;
  if (f < 0 || c < 0) return n_error("«matriz»: las dimensiones no pueden ser negativas", NULL);
  NV r = n_lista_nueva((int64_t)f);
  for (int64_t i = 0; i < (int64_t)f; i++) { NV fl = n_lista_nueva((int64_t)c); for (int64_t j = 0; j < (int64_t)c; j++) n_lista_agregar(LS(fl), n_inc(a[2])); n_lista_agregar(LS(r), fl); }
  return r;
}
NAT(nu_transponer) {
  (void)n; (void)extra; FILAS(0, "transponer"); NLista* m = LS(a[0]);
  if (!m->n) return n_lista_nueva(0);
  int64_t nc = F_(a[0], 0)->n; NV r = n_lista_nueva(nc);
  for (int64_t j = 0; j < nc; j++) { NV fl = n_lista_nueva(m->n); for (int64_t i = 0; i < m->n; i++) { NLista* fi = F_(a[0], i); n_lista_agregar(LS(fl), j < fi->n ? n_inc(fi->v[j]) : n_nulo()); } n_lista_agregar(LS(r), fl); }
  return r;
}
NAT(nu_multMatriz) {
  /* como en la VM de motor-exp: por el producto de NEÑ (nen_dgemm), con FMA y k en orden */
  (void)n; (void)extra; FILAS(0, "multMatriz"); FILAS(1, "multMatriz");
  NLista *A = LS(a[0]), *B = LS(a[1]);
  if (!A->n || !B->n) return n_error("«multMatriz»: matriz vacía", NULL);
  int64_t nf = A->n, nm = B->n, nc = F_(a[1], 0)->n;
  if (F_(a[0], 0)->n != nm) return ERR("«multMatriz»: no se pueden multiplicar %d×%d por %d×%d", (long long)nf, (long long)F_(a[0], 0)->n, (long long)nm, (long long)nc);
  NV r = n_lista_nueva(nf);
  double* fila = (double*)n_mem(sizeof(double) * (size_t)(nc + 1));
  for (int64_t i = 0; i < nf; i++) {
    for (int64_t j = 0; j < nc; j++) fila[j] = 0.0;
    NLista* Ai = F_(a[0], i);
    for (int64_t k = 0; k < nm; k++) {
      double x = k < Ai->n ? num0(Ai->v[k]) : NAN; NLista* Bk = F_(a[1], k);
      for (int64_t j = 0; j < nc; j++) fila[j] = fma(x, j < Bk->n ? num0(Bk->v[j]) : NAN, fila[j]);
    }
    NV fl = n_lista_nueva(nc); for (int64_t j = 0; j < nc; j++) n_lista_agregar(LS(fl), n_num(fila[j]));
    n_lista_agregar(LS(r), fl);
  }
  free(fila);
  return r;
}
static double* matriz_plana(NV m, int64_t* n, int64_t* c) {
  NLista* l = LS(m); *n = l->n; *c = l->n ? F_(m, 0)->n : 0;
  double* x = (double*)n_mem(sizeof(double) * (size_t)((*n) * (*c) + 1));
  for (int64_t i = 0; i < *n; i++) { NLista* f = F_(m, i); for (int64_t j = 0; j < *c; j++) x[i * *c + j] = j < f->n ? num0(f->v[j]) : NAN; }
  return x;
}
NAT(nu_determinante) {
  (void)n; (void)extra; FILAS(0, "determinante"); NLista* l = LS(a[0]); int64_t N = l->n;
  for (int64_t i = 0; i < N; i++) if (F_(a[0], i)->n != N) return n_error("«determinante» necesita una matriz cuadrada", NULL);
  if (!N) return n_error("«determinante» necesita una matriz cuadrada", NULL);
  int64_t nn, cc; double* m = matriz_plana(a[0], &nn, &cc); double det = 1;
  int64_t* fi = (int64_t*)n_mem(sizeof(int64_t) * (size_t)N); for (int64_t i = 0; i < N; i++) fi[i] = i;
  #define M(i, j) m[fi[i] * N + (j)]
  for (int64_t i = 0; i < N; i++) {
    int64_t p = i;
    for (int64_t k = i + 1; k < N; k++) if (fabs(M(k, i)) > fabs(M(p, i))) p = k;
    if (fabs(M(p, i)) < 1e-12) { free(m); free(fi); return n_num(0); }
    if (p != i) { int64_t t = fi[p]; fi[p] = fi[i]; fi[i] = t; det = -det; }
    det *= M(i, i);
    for (int64_t k = i + 1; k < N; k++) { double f = M(k, i) / M(i, i); for (int64_t j = i; j < N; j++) M(k, j) -= f * M(i, j); }
  }
  #undef M
  free(m); free(fi);
  return n_num(det);
}
NAT(nu_resolver) {
  (void)n; (void)extra; FILAS(0, "resolver"); NUMS(1, "resolver");
  NLista* l = LS(a[0]); int64_t N = l->n;
  int ok = LS(a[1])->n == N; for (int64_t i = 0; i < N; i++) if (F_(a[0], i)->n != N) ok = 0;
  if (!ok) return n_error("«resolverSistema»: dimensiones incompatibles", NULL);
  int64_t nn, cc; double* A = matriz_plana(a[0], &nn, &cc); double* b = nums_de(a[1]);
  int64_t* fi = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(N + 1)); for (int64_t i = 0; i < N; i++) fi[i] = i;
  #define M(i, j) A[fi[i] * N + (j)]
  for (int64_t i = 0; i < N; i++) {
    int64_t p = i;
    for (int64_t k = i + 1; k < N; k++) if (fabs(M(k, i)) > fabs(M(p, i))) p = k;
    if (fabs(M(p, i)) < 1e-12) { free(A); free(b); free(fi); return n_error("«resolverSistema»: el sistema no tiene solución única", NULL); }
    if (p != i) { int64_t t = fi[p]; fi[p] = fi[i]; fi[i] = t; double tb = b[p]; b[p] = b[i]; b[i] = tb; }
    for (int64_t k = i + 1; k < N; k++) { double f = M(k, i) / M(i, i); b[k] -= f * b[i]; for (int64_t j = i; j < N; j++) M(k, j) -= f * M(i, j); }
  }
  double* x = (double*)calloc((size_t)(N + 1), sizeof(double));
  for (int64_t i = N - 1; i >= 0; i--) { double s = b[i]; for (int64_t j = i + 1; j < N; j++) s -= M(i, j) * x[j]; x[i] = s / M(i, i); }
  #undef M
  NV r = n_lista_nueva(N); for (int64_t i = 0; i < N; i++) n_lista_agregar(LS(r), n_num(x[i]));
  free(A); free(b); free(fi); free(x);
  return r;
}
NAT(nu_identidad) {
  (void)n; (void)extra; ENT(k, 0, "identidad");
  if (k < 1) return n_error("«identidad»: el tamaño tiene que ser 1 o más", NULL);
  int64_t N = (int64_t)k; NV r = n_lista_nueva(N);
  for (int64_t i = 0; i < N; i++) { NV fl = n_lista_nueva(N); for (int64_t j = 0; j < N; j++) n_lista_agregar(LS(fl), n_num(i == j ? 1 : 0)); n_lista_agregar(LS(r), fl); }
  return r;
}
NAT(nu_traza) {
  (void)n; (void)extra; FILAS(0, "traza"); NLista* m = LS(a[0]);
  if (!m->n || m->n != F_(a[0], 0)->n) return n_error("«traza»: la matriz tiene que ser cuadrada", NULL);
  double t = 0; for (int64_t i = 0; i < m->n; i++) { NLista* f = F_(a[0], i); t += i < f->n ? num0(f->v[i]) : NAN; }
  return n_num(t);
}
NAT(nu_inversa) {
  (void)n; (void)extra; FILAS(0, "inversa"); NLista* l = LS(a[0]); int64_t N = l->n;
  if (!N || N != F_(a[0], 0)->n) return n_error("«inversa»: la matriz tiene que ser cuadrada", NULL);
  int64_t W = 2 * N; double* A = (double*)n_mem(sizeof(double) * (size_t)(N * W));
  for (int64_t i = 0; i < N; i++) { NLista* f = F_(a[0], i); for (int64_t j = 0; j < N; j++) A[i * W + j] = j < f->n ? num0(f->v[j]) : NAN; for (int64_t j = 0; j < N; j++) A[i * W + N + j] = i == j ? 1 : 0; }
  int64_t* fi = (int64_t*)n_mem(sizeof(int64_t) * (size_t)N); for (int64_t i = 0; i < N; i++) fi[i] = i;
  #define M(i, j) A[fi[i] * W + (j)]
  for (int64_t c = 0; c < N; c++) {
    int64_t mejor = c;
    for (int64_t r = c + 1; r < N; r++) if (fabs(M(r, c)) > fabs(M(mejor, c))) mejor = r;
    if (fabs(M(mejor, c)) < 1e-12) { free(A); free(fi); return n_error("«inversa»: la matriz no tiene inversa", "su determinante es cero (sus filas no son independientes)"); }
    int64_t t = fi[c]; fi[c] = fi[mejor]; fi[mejor] = t;
    double piv = M(c, c);
    for (int64_t j = 0; j < W; j++) M(c, j) /= piv;
    for (int64_t r = 0; r < N; r++) { if (r == c) continue; double f = M(r, c); if (f == 0) continue; for (int64_t j = 0; j < W; j++) M(r, j) -= f * M(c, j); }
  }
  NV res = n_lista_nueva(N);
  for (int64_t i = 0; i < N; i++) { NV fl = n_lista_nueva(N); for (int64_t j = 0; j < N; j++) n_lista_agregar(LS(fl), n_num(M(i, N + j))); n_lista_agregar(LS(res), fl); }
  #undef M
  free(A); free(fi);
  return res;
}

#define NAT_NUMERICO \
  { "numerico/raiz", 1, nu_raiz }, { "numerico/absoluto", 1, nu_absoluto }, { "numerico/piso", 1, nu_piso }, { "numerico/techo", 1, nu_techo }, \
  { "numerico/seno", 1, nu_seno }, { "numerico/coseno", 1, nu_coseno }, { "numerico/tangente", 1, nu_tangente }, \
  { "numerico/arcoseno", 1, nu_arcoseno }, { "numerico/arcocoseno", 1, nu_arcocoseno }, { "numerico/arcotangente", 1, nu_arcotangente }, \
  { "numerico/exp", 1, nu_exp }, { "numerico/log", 1, nu_log }, { "numerico/log10", 1, nu_log10 }, { "numerico/log2", 1, nu_log2 }, \
  { "numerico/signo", 1, nu_signo }, { "numerico/redondear", -1, nu_redondear }, { "numerico/truncar", -1, nu_truncar }, \
  { "numerico/potencia", 2, nu_potencia }, { "numerico/acotar", 3, nu_acotar }, { "numerico/entre", 3, nu_entre }, \
  { "numerico/casiIgual", -1, nu_casiIgual }, { "numerico/raizN", 2, nu_raizN }, { "numerico/angulo", 2, nu_angulo }, \
  { "numerico/grados", 1, nu_grados }, { "numerico/radianes", 1, nu_radianes }, { "numerico/hipotenusa", -1, nu_hipotenusa }, \
  { "numerico/suma", -1, nu_suma }, { "numerico/media", -1, nu_media }, { "numerico/mediana", 1, nu_mediana }, { "numerico/moda", 1, nu_moda }, \
  { "numerico/varianza", 1, nu_varianza }, { "numerico/desviacion", 1, nu_desviacion }, { "numerico/percentil", 2, nu_percentil }, \
  { "numerico/correlacion", 2, nu_correlacion }, { "numerico/regresion", 2, nu_regresion }, { "numerico/normalizar", 1, nu_normalizar }, \
  { "numerico/histograma", 2, nu_histograma }, { "numerico/producto", 1, nu_producto }, { "numerico/amplitud", 1, nu_amplitud }, \
  { "numerico/cuartiles", 1, nu_cuartiles }, { "numerico/acumulado", 1, nu_acumulado }, { "numerico/covarianza", 2, nu_covarianza }, \
  { "numerico/tendencia", 1, nu_tendencia }, { "numerico/tipificar", 1, nu_tipificar }, { "numerico/azar", 0, nu_azar }, \
  { "numerico/azarEntre", 2, nu_azarEntre }, { "numerico/azarNormal", -1, nu_azarNormal }, { "numerico/elegir", 1, nu_elegir }, \
  { "numerico/elegirVarios", 2, nu_elegirVarios }, { "numerico/barajar", 1, nu_barajar }, { "numerico/semilla", 1, nu_semilla }, \
  { "numerico/esPrimo", 1, nu_esPrimo }, { "numerico/primos", 1, nu_primos }, { "numerico/mcd", -1, nu_mcd }, { "numerico/mcm", -1, nu_mcm }, \
  { "numerico/factorial", 1, nu_factorial }, { "numerico/combinaciones", 2, nu_combinaciones }, { "numerico/permutaciones", 2, nu_permutaciones }, \
  { "numerico/divisores", 1, nu_divisores }, { "numerico/valorFuturo", 3, nu_valorFuturo }, { "numerico/valorPresente", 3, nu_valorPresente }, \
  { "numerico/interesCompuesto", -1, nu_interesCompuesto }, { "numerico/tasaEfectiva", 2, nu_tasaEfectiva }, { "numerico/cuota", 3, nu_cuota }, \
  { "numerico/amortizacion", 3, nu_amortizacion }, { "numerico/matriz", 3, nu_matriz }, { "numerico/transponer", 1, nu_transponer }, \
  { "numerico/multMatriz", 2, nu_multMatriz }, { "numerico/determinante", 1, nu_determinante }, { "numerico/resolver", 2, nu_resolver }, \
  { "numerico/identidad", 1, nu_identidad }, { "numerico/traza", 1, nu_traza }, { "numerico/inversa", 1, nu_inversa },
