/* ============================================================================
 *  (motor-exp A7) Arreglos, tercera tanda: pegar y rebanar, «como», ordenar y elegir, azar.
 * ========================================================================== */
static int ar_tipo_comun(const int* ts, int n) {   /* tipoComunDe */
  int acc = -1;
  for (int i = 0; i < n; i++) { if (acc < 0) acc = ts[i]; else if (acc != ts[i]) acc = ar_tipo_arit(acc, ts[i], OP_SUMA, 1, 1); }
  return acc;
}
static int ar_ultimo_numero(NV* a, int n, double* eje, int* hasta) {
  *eje = 0; *hasta = n;
  if (n > 0 && a[n - 1].t == N_NUM) { *eje = trunc(a[n - 1].u.n); *hasta = n - 1; return 1; }
  return 0;
}
NAT(ar3_concatenar) {
  (void)extra; double eje; int hasta; ar_ultimo_numero(a, n, &eje, &hasta);
  for (int i = 0; i < hasta; i++) ARR_(a[i], i + 1, "concatenar");
  if (!hasta) return n_error("«concatenar» necesita al menos un arreglo", NULL);
  NArr* x0 = AR(a[0]); int e; NV err;
  if (!ar_eje(x0, eje, "concatenar", &e, &err)) return err;
  for (int i = 0; i < hasta; i++) {
    NArr* x = AR(a[i]);
    if (x->nd != x0->nd) return ERR("«concatenar»: uno tiene %d dimensiones y otro %d", (long long)x->nd, (long long)x0->nd);
    for (int d = 0; d < x->nd; d++) if (d != e && x->forma[d] != x0->forma[d]) {
      NV f0 = ar_formas_txt(x0->forma, x0->nd), f1 = ar_formas_txt(x->forma, x->nd);
      NV r = ERR("«concatenar»: las formas %v y %v solo pueden diferir en el eje %d", f0, f1, (long long)e); n_dec(f0); n_dec(f1); return r;
    }
  }
  int64_t f[AR_MAXND]; for (int i = 0; i < x0->nd; i++) f[i] = x0->forma[i];
  f[e] = 0; for (int i = 0; i < hasta; i++) f[e] += AR(a[i])->forma[e];
  int ts[64], todos_bool = 1; if (hasta > 64) return n_error("«concatenar»: demasiados arreglos", NULL);
  for (int i = 0; i < hasta; i++) { int t = AR(a[i])->tipo; if (t != AR_BOOL) todos_bool = 0; ts[i] = t == AR_BOOL ? AR_REAL : t; }
  int tipo = todos_bool ? AR_BOOL : ar_tipo_comun(ts, hasta);
  if (tipo == AR_I64 || tipo == AR_U64) return ERR("«concatenar»: el resultado sería %s, y los arreglos de 64 bits todavía no están en el ejecutable nativo", AR_NOMBRE[tipo]);
  NV out = ar_nuevo(f, x0->nd, tipo); if (N_FALLO(out)) return out;
  NArr* O = AR(out); int64_t off = 0;
  for (int i = 0; i < hasta; i++) {
    NArr* x = AR(a[i]); int64_t nv; double* v = ar_valores(x, &nv); int64_t ix[AR_MAXND] = {0}, k = 0;
    for (int64_t c = 0; c < nv; c++) {
      int64_t pos = 0; for (int q = 0; q < O->nd; q++) pos += (q == e ? ix[q] + off : ix[q]) * O->zanc[q];
      ar_escribir(O, pos, v[k++]);
      for (int q = O->nd - 1; q >= 0; q--) { if (++ix[q] < x->forma[q]) break; ix[q] = 0; }
    }
    free(v); off += x->forma[e];
  }
  return out;
}
NAT(ar3_apilar) {
  (void)extra; double eje; int hasta; ar_ultimo_numero(a, n, &eje, &hasta);
  for (int i = 0; i < hasta; i++) ARR_(a[i], i + 1, "apilar");
  if (!hasta) return n_error("«apilar» necesita al menos un arreglo", NULL);
  NArr* x0 = AR(a[0]);
  for (int i = 0; i < hasta; i++) {
    NArr* x = AR(a[i]); int dif = x->nd != x0->nd;
    for (int d = 0; !dif && d < x->nd; d++) if (x->forma[d] != x0->forma[d]) dif = 1;
    if (dif) { NV f0 = ar_formas_txt(x0->forma, x0->nd), f1 = ar_formas_txt(x->forma, x->nd); NV r = ERRP(n_texto_utf8("para pegar formas distintas a lo largo de un eje que ya existe, usa concatenar"), "«apilar»: todos tienen que tener la MISMA forma, y hay %v y %v", f0, f1); n_dec(f0); n_dec(f1); return r; }
  }
  if (eje < 0) eje += (double)(x0->nd + 1);
  if (eje < 0 || eje > (double)x0->nd) return ERR("«apilar»: el eje no cabe · puede ir de 0 a %d", (long long)x0->nd);
  int ee = (int)eje; int nd = x0->nd + 1; if (nd > AR_MAXND) return n_error("«apilar»: como mucho 8 dimensiones", NULL);
  int64_t f[AR_MAXND]; for (int i = 0, k = 0; i < nd; i++) f[i] = i == ee ? hasta : x0->forma[k++];
  int ts[64]; if (hasta > 64) return n_error("«apilar»: demasiados arreglos", NULL);
  for (int i = 0; i < hasta; i++) { int t = AR(a[i])->tipo; ts[i] = t == AR_BOOL ? AR_REAL : t; }
  int tipo = ar_tipo_comun(ts, hasta);
  if (tipo == AR_I64 || tipo == AR_U64) return ERR("«apilar»: el resultado sería %s, y los arreglos de 64 bits todavía no están en el ejecutable nativo", AR_NOMBRE[tipo]);
  NV out = ar_nuevo(f, nd, tipo); if (N_FALLO(out)) return out;
  NArr* O = AR(out);
  for (int i = 0; i < hasta; i++) {
    NArr* x = AR(a[i]); int64_t nv; double* v = ar_valores(x, &nv); int64_t ix[AR_MAXND] = {0}, k = 0;
    for (int64_t c = 0; c < nv; c++) {
      int64_t pos = 0; int q2 = 0; for (int q = 0; q < nd; q++) pos += (q == ee ? i : ix[q2++]) * O->zanc[q];
      ar_escribir(O, pos, v[k++]);
      for (int q = x->nd - 1; q >= 0; q--) { if (++ix[q] < x->forma[q]) break; ix[q] = 0; }
    }
    free(v);
  }
  return out;
}

/* rebanar, sin copiar */
static int ar3_ent(NV v, int k, const char* f, double* out, NV* err) { if (v.t != N_NUM) { *err = ERR("«%s»: el argumento %d debe ser un número y es %s", f, (long long)k, n_tipo_de(v)); return 0; } *out = trunc(v.u.n); return 1; }
NAT(ar3_trozo) {
  (void)extra; ARRC_(a[0], 1, "trozo"); NArr* x = AR(a[0]); NV err; double ev, d = 0, h;
  if (!ar3_ent(a[1], 2, "trozo", &ev, &err)) return err;
  int e; if (!ar_eje(x, ev, "trozo", &e, &err)) return err;
  double largo = (double)x->forma[e]; h = largo;
  if (n > 2 && !ar3_ent(a[2], 3, "trozo", &d, &err)) return err;
  if (n > 3 && !ar3_ent(a[3], 4, "trozo", &h, &err)) return err;
  if (d < 0) d += largo; if (h < 0) h += largo;
  d = fmax(0, fmin(largo, d)); h = fmax(d, fmin(largo, h));
  int64_t f[AR_MAXND]; for (int i = 0; i < x->nd; i++) f[i] = x->forma[i];
  f[e] = (int64_t)(h - d);
  return ar_vista(x, f, x->zanc, x->nd, x->desp + (int64_t)d * x->zanc[e]);
}
NAT(ar3_trozoPaso) {
  (void)n; (void)extra; ARRC_(a[0], 1, "trozoPaso"); NArr* x = AR(a[0]); NV err; double ev, paso;
  if (!ar3_ent(a[1], 2, "trozoPaso", &ev, &err)) return err;
  int e; if (!ar_eje(x, ev, "trozoPaso", &e, &err)) return err;
  if (!ar3_ent(a[2], 3, "trozoPaso", &paso, &err)) return err;
  if (paso == 0) return n_error("«trozoPaso»: el paso no puede ser 0", NULL);
  double largo = (double)x->forma[e]; int64_t f[AR_MAXND], z[AR_MAXND], desp = x->desp;
  for (int i = 0; i < x->nd; i++) { f[i] = x->forma[i]; z[i] = x->zanc[i]; }
  if (paso > 0) f[e] = (int64_t)ceil(largo / paso); else { f[e] = (int64_t)ceil(largo / -paso); desp += (int64_t)(largo - 1) * x->zanc[e]; }
  z[e] = x->zanc[e] * (int64_t)paso;
  return ar_vista(x, f, z, x->nd, desp);
}
NAT(ar3_trozoVarios) {
  (void)n; (void)extra; ARRC_(a[0], 1, "trozoVarios"); LST(a[1], 2, "trozoVarios");
  NArr* x = AR(a[0]); NLista* cortes = LS(a[1]);
  if (cortes->n > x->nd) return ERRP(n_texto_utf8("los ejes que no nombres se quedan enteros, así que sobran cortes, no faltan"), "«trozoVarios»: el arreglo tiene %d dimensiones y le pasaste %d cortes", (long long)x->nd, (long long)cortes->n);
  int64_t f[AR_MAXND], z[AR_MAXND], desp = x->desp;
  for (int i = 0; i < x->nd; i++) { f[i] = x->forma[i]; z[i] = x->zanc[i]; }
  for (int e = 0; e < cortes->n; e++) {
    NV c = n_lv(cortes)[e];
    if (!n_es(c, NC_LISTA)) return ERRP(n_texto_utf8("cada corte es [], [desde], [desde, hasta] o [desde, hasta, paso]"), "«trozoVarios»: el corte del eje %d debe ser una lista y es %s", (long long)e, n_tipo_de(c));
    NLista* q = LS(c);
    if (q->n > 3) return ERR("«trozoVarios»: el corte del eje %d tiene %d números y como máximo son 3 ([desde, hasta, paso])", (long long)e, (long long)q->n);
    double largo = (double)x->forma[e], d = 0, h = largo, paso = 1; NV err; NV* qv = n_lv(q);
    if (q->n > 0 && !ar3_ent(qv[0], 1, "trozoVarios", &d, &err)) return err;
    if (q->n > 1 && !ar3_ent(qv[1], 2, "trozoVarios", &h, &err)) return err;
    if (q->n > 2 && !ar3_ent(qv[2], 3, "trozoVarios", &paso, &err)) return err;
    if (paso == 0) return ERR("«trozoVarios»: el paso del eje %d no puede ser 0", (long long)e);
    if (d < 0) d += largo; if (h < 0) h += largo;
    d = fmax(0, fmin(largo, d)); h = fmax(d, fmin(largo, h));
    double cuantos = h - d;
    if (paso > 0) { f[e] = (int64_t)ceil(cuantos / paso); desp += (int64_t)d * x->zanc[e]; }
    else { f[e] = (int64_t)ceil(cuantos / -paso); desp += (int64_t)(cuantos > 0 ? h - 1 : d) * x->zanc[e]; }
    z[e] = x->zanc[e] * (int64_t)paso;
  }
  return ar_vista(x, f, z, x->nd, desp);
}

/* cerosComo, unosComo, vacioComo */
static NV ar3_como(NV* a, int n, const char* nombre, int llenar /* -1 nada */) {
  ARR_(a[0], 1, nombre); NArr* x = AR(a[0]); int tipo = x->tipo; NV err;
  if (n > 1) { if (!ar_tipo_arg(a[1], 1, nombre, &tipo, &err)) return err; }
  NV y = ar_nuevo(x->forma, x->nd, tipo); if (N_FALLO(y)) return y;
  if (llenar >= 0 && llenar != 0) {
    NArr* Y = AR(y); int64_t cnt = ar_tam(Y) * (Y->tipo == AR_COMPLEJO ? 2 : 1);
    if (Y->tipo == AR_COMPLEJO) for (int64_t i = 0; i < cnt; i++) ((double*)Y->buf->d)[i] = llenar;
    else for (int64_t i = 0; i < cnt; i++) ar_escribir(Y, i, llenar);
  }
  return y;
}
NAT(ar3_cerosComo) { (void)extra; return ar3_como(a, n, "cerosComo", 0); }
NAT(ar3_unosComo) { (void)extra; return ar3_como(a, n, "unosComo", 1); }
NAT(ar3_vacioComo) { (void)extra; return ar3_como(a, n, "vacioComo", -1); }

/* ordenar y elegir */
static int ar3_cmp_val(void* c, int64_t x, int64_t y) {
  const double* v = (const double*)c; double d = v[x] - v[y];
  if (d < 0) return -1; if (d > 0) return 1; return 0;
}
static int ar3_cmp_idx(void* c, int64_t x, int64_t y) {
  const double* v = (const double*)c; double d = v[x] - v[y];
  if (d < 0) return -1; if (d > 0) return 1; return x < y ? -1 : x > y ? 1 : 0;
}
NAT(ar3_ordenarA) {
  (void)n; (void)extra; ARR_(a[0], 1, "ordenarA"); NArr* x = AR(a[0]); int64_t nv; double* v = ar_valores(x, &nv);
  int64_t* ix = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1)); int64_t* t = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1));
  for (int64_t i = 0; i < nv; i++) ix[i] = i;
  td_mezcla(ix, t, nv, ar3_cmp_val, v);
  int64_t f[1] = { nv }; NV out = ar_nuevo(f, 1, x->tipo);
  if (!N_FALLO(out)) for (int64_t i = 0; i < nv; i++) ar_escribir(AR(out), i, v[ix[i]]);
  free(ix); free(t); free(v); return out;
}
NAT(ar3_argOrdenar) {
  (void)n; (void)extra; ARR_(a[0], 1, "argOrdenar"); NArr* x = AR(a[0]); int64_t nv; double* v = ar_valores(x, &nv);
  int64_t* ix = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1)); int64_t* t = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1));
  for (int64_t i = 0; i < nv; i++) ix[i] = i;
  td_mezcla(ix, t, nv, ar3_cmp_idx, v);
  int64_t f[1] = { nv }; NV out = ar_nuevo(f, 1, AR_ENTERO);
  if (!N_FALLO(out)) for (int64_t i = 0; i < nv; i++) ar_escribir(AR(out), i, (double)ix[i]);
  free(ix); free(t); free(v); return out;
}
NAT(ar3_tomar) {
  (void)n; (void)extra; ARR_(a[0], 1, "tomar"); ARR_(a[1], 2, "tomar");
  NArr *x = AR(a[0]), *ixa = AR(a[1]); int64_t nx, ni; double* vx = ar_valores(x, &nx); double* vi = ar_valores(ixa, &ni);
  int64_t f[1] = { ni }; NV out = ar_nuevo(f, 1, x->tipo); if (N_FALLO(out)) { free(vx); free(vi); return out; }
  for (int64_t i = 0; i < ni; i++) {
    double k = trunc(vi[i]); if (k < 0) k += (double)nx;
    if (k < 0 || k >= (double)nx || isnan(k)) { NV e = ERR("«tomar»: el índice %n se sale de un arreglo de %d valores", vi[i], (long long)nx); n_dec(out); free(vx); free(vi); return e; }
    ar_escribir(AR(out), i, vx[(int64_t)k]);
  }
  free(vx); free(vi); return out;
}
NAT(ar3_unicosConCuentas) {
  (void)n; (void)extra; ARR_(a[0], 1, "unicosConCuentas"); NArr* x = AR(a[0]); int64_t nv; double* v = ar_valores(x, &nv);
  int64_t* ix = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1)); int64_t* t = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nv ? nv : 1));
  for (int64_t i = 0; i < nv; i++) ix[i] = i;
  td_mezcla(ix, t, nv, ar3_cmp_val, v);
  /* agrupar iguales (el primero en aparecer da el valor, como el Map) */
  int64_t ng = 0; double* vals = (double*)n_mem(sizeof(double) * (size_t)(nv ? nv : 1)); double* cuentas = (double*)n_mem(sizeof(double) * (size_t)(nv ? nv : 1));
  for (int64_t i = 0; i < nv; ) {
    int64_t j = i; double cuantos = 0; int64_t primero = ix[i];
    while (j < nv && (v[ix[j]] == v[ix[i]] || (isnan(v[ix[j]]) && isnan(v[ix[i]])))) { if (ix[j] < primero) primero = ix[j]; cuantos++; j++; }
    vals[ng] = v[primero]; cuentas[ng] = cuantos; ng++; i = j;
  }
  int64_t f[1] = { ng }; NV va = ar_nuevo(f, 1, x->tipo), cu = ar_nuevo(f, 1, AR_ENTERO);
  for (int64_t i = 0; i < ng; i++) { ar_escribir(AR(va), i, vals[i]); ar_escribir(AR(cu), i, cuentas[i]); }
  NV d = n_dic_nuevo(); dic_pon(d, "valores", va); dic_pon(d, "cuantas", cu);
  free(ix); free(t); free(v); free(vals); free(cuentas); return d;
}
static int ar3_cmp_dbl(const void* p, const void* q) { double a = *(const double*)p, b = *(const double*)q; return a < b ? -1 : a > b ? 1 : 0; }
static double* ar3_y_ordenado; static int64_t ar3_ny; static int ar3_hay_nan;
static NV fx_esta(double v, double* r) {
  if (isnan(v)) { *r = ar3_hay_nan ? 1 : 0; return n_nulo(); }
  int64_t lo = 0, hi = ar3_ny - 1; int hay = 0;
  while (lo <= hi) { int64_t m = (lo + hi) >> 1; if (ar3_y_ordenado[m] == v) { hay = 1; break; } if (ar3_y_ordenado[m] < v) lo = m + 1; else hi = m - 1; }
  *r = hay; return n_nulo();
}
NAT(ar3_estaEn) {
  (void)n; (void)extra; ARR_(a[0], 1, "estaEn"); ARR_(a[1], 2, "estaEn");
  int64_t ny; double* vy = ar_valores(AR(a[1]), &ny); int64_t m = 0; int nan = 0;
  for (int64_t i = 0; i < ny; i++) { if (isnan(vy[i])) nan = 1; else vy[m++] = vy[i]; }
  qsort(vy, (size_t)m, sizeof(double), ar3_cmp_dbl);
  ar3_y_ordenado = vy; ar3_ny = m; ar3_hay_nan = nan;
  NV r = ar_unaria(AR(a[0]), fx_esta, AR_BOOL);
  free(vy); return r;
}

/* azar */
NAT(ar3_uniformes) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; double lo = 0, hi = 1;
  if (!ar_forma_de(a[0], "uniformes", f, &nd, &err)) return err;
  if (n > 1) { NUM(a[1], 2, "uniformes"); lo = a[1].u.n; } if (n > 2) { NUM(a[2], 3, "uniformes"); hi = a[2].u.n; }
  NV x = ar_nuevo(f, nd, AR_REAL); if (N_FALLO(x)) return x;
  int64_t cnt = ar_tam(AR(x)); double* d = (double*)AR(x)->buf->d;
  for (int64_t i = 0; i < cnt; i++) d[i] = lo + az_sig() * (hi - lo);
  return x;
}
NAT(ar3_normales) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; double m = 0, s = 1;
  if (!ar_forma_de(a[0], "normales", f, &nd, &err)) return err;
  if (n > 1) { NUM(a[1], 2, "normales"); m = a[1].u.n; } if (n > 2) { NUM(a[2], 3, "normales"); s = a[2].u.n; }
  NV x = ar_nuevo(f, nd, AR_REAL); if (N_FALLO(x)) return x;
  int64_t cnt = ar_tam(AR(x)); double* d = (double*)AR(x)->buf->d;
  for (int64_t i = 0; i < cnt; i++) d[i] = m + s * az_normal();
  return x;
}
NAT(ar3_enteros) {
  (void)n; (void)extra; int64_t f[AR_MAXND]; int nd; NV err;
  if (!ar_forma_de(a[0], "enteros", f, &nd, &err)) return err;
  NUM(a[1], 2, "enteros"); NUM(a[2], 3, "enteros");
  double lo = trunc(a[1].u.n), hi = trunc(a[2].u.n);
  if (hi <= lo) return ERR("«enteros»: el máximo (%n) tiene que ser mayor que el mínimo (%n)", hi, lo);
  NV x = ar_nuevo(f, nd, AR_ENTERO); if (N_FALLO(x)) return x;
  int64_t cnt = ar_tam(AR(x));
  for (int64_t i = 0; i < cnt; i++) ar_escribir(AR(x), i, lo + floor(az_sig() * (hi - lo)));
  return x;
}
NAT(ar3_barajarJuntos) {
  (void)extra;
  for (int i = 0; i < n; i++) ARR_(a[i], i + 1, "barajarJuntos");
  if (!n) return n_error("«barajarJuntos» necesita al menos un arreglo", NULL);
  int64_t filas = AR(a[0])->forma[0];
  for (int i = 0; i < n; i++) if (AR(a[i])->forma[0] != filas) return ERRP(n_texto_utf8("se barajan por el primer eje, así que tienen que medir lo mismo ahí"), "«barajarJuntos»: uno tiene %d filas y otro %d", (long long)filas, (long long)AR(a[i])->forma[0]);
  int64_t* orden = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(filas ? filas : 1)); for (int64_t i = 0; i < filas; i++) orden[i] = i;
  for (int64_t i = filas - 1; i > 0; i--) { int64_t j = (int64_t)floor(az_sig() * (double)(i + 1)); int64_t t = orden[i]; orden[i] = orden[j]; orden[j] = t; }
  NV lista = n_lista_nueva(n);
  for (int k = 0; k < n; k++) {
    NArr* x = AR(a[k]); NV y = ar_nuevo(x->forma, x->nd, x->tipo); if (N_FALLO(y)) { n_dec(lista); free(orden); return y; }
    int64_t nv; double* vx = ar_valores(x, &nv); int64_t por_fila = filas ? nv / filas : 0;
    for (int64_t i = 0; i < filas; i++) for (int64_t q = 0; q < por_fila; q++) ar_escribir(AR(y), i * por_fila + q, vx[orden[i] * por_fila + q]);
    free(vx); n_lista_agregar(LS(lista), y);
  }
  free(orden); return lista;
}

#define NAT_ARREGLO3 \
  { "numerico/concatenar", -1, ar3_concatenar }, { "numerico/apilar", -1, ar3_apilar }, { "numerico/trozo", -1, ar3_trozo }, { "numerico/trozoPaso", -1, ar3_trozoPaso }, \
  { "numerico/trozoVarios", 2, ar3_trozoVarios }, { "numerico/cerosComo", -1, ar3_cerosComo }, { "numerico/unosComo", -1, ar3_unosComo }, { "numerico/vacioComo", -1, ar3_vacioComo }, \
  { "numerico/ordenarA", -1, ar3_ordenarA }, { "numerico/argOrdenar", 1, ar3_argOrdenar }, { "numerico/tomar", 2, ar3_tomar }, { "numerico/unicosConCuentas", 1, ar3_unicosConCuentas }, \
  { "numerico/estaEn", 2, ar3_estaEn }, { "numerico/uniformes", -1, ar3_uniformes }, { "numerico/normales", -1, ar3_normales }, { "numerico/enteros", -1, ar3_enteros }, \
  { "numerico/barajarJuntos", -1, ar3_barajarJuntos },
