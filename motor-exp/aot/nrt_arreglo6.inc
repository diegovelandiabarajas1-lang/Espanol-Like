/* ============================================================================
 *  (motor-exp A7) Arreglos, sexta tanda: las operaciones de bits (bitsY, bitsO, bitsXor, bitsNo, desplazarIzq, desplazarDer, contarBits).
 *  Mismas cuentas y mismos mensajes que src/11-edsl-numerico.js. UNA diferencia declarada: con números sueltos la VM usa BigInt y devuelve un
 *  «grande» exacto si el resultado pasa de 2^53; el ejecutable no trae ese tipo todavía y lo dice con un error (los enteros de más de 63 bits
 *  tampoco entran). Con arreglos —los de 32 bits o menos— es idéntico.
 * ========================================================================== */
#define AR6_DESPL_MAX 65536
#define AR6_MAX53 9007199254740992.0

static int ar6_aent(NV v, int k, const char* f, int64_t* out, NV* err) {
  if (v.t != N_NUM) { *err = ERR("«%s»: el argumento %d tiene que ser un entero y es %s", f, (long long)k, n_tipo_de(v)); return 0; }
  double d = v.u.n;
  if (!(d == floor(d)) || isinf(d)) { *err = ERR("«%s»: el argumento %d tiene que ser un entero y es %j", f, (long long)k, d); return 0; }
  if (fabs(d) >= 9223372036854775808.0) {
    *err = ERRP(n_texto_utf8("el tipo «grande» todavía no está en el ejecutable; con el motor de siempre (n-node) sí funciona"), "«%s»: el argumento %d necesita más de 63 bits", f, (long long)k); return 0;
  }
  *out = (int64_t)d; return 1;
}
static int ar6_despl(NV v, int k, const char* f, int64_t* out, NV* err) {
  { NV e_; if (!exige_num(v, k, f, &e_)) { *err = e_; return 0; } }
  double d = v.u.n;
  if (!(d == floor(d)) || isinf(d) || d < 0) { *err = ERR("«%s»: el desplazamiento es un entero no negativo y llegó %j", f, d); return 0; }
  if (d > AR6_DESPL_MAX) { *err = ERR("«%s»: el desplazamiento llega como mucho a %d", f, (long long)AR6_DESPL_MAX); return 0; }
  *out = (int64_t)d; return 1;
}
static NV ar6_res(__int128 r, const char* f) {
  if (r >= -(__int128)AR6_MAX53 && r <= (__int128)AR6_MAX53) return n_num((double)r);
  return ERRP(n_texto_utf8("el tipo «grande» todavía no está en el ejecutable; con el motor de siempre (n-node) sí funciona"), "«%s»: el resultado no cabe en un número exacto (pasa de 2^53)", f);
}
static int ar6_arr_ent(const NArr* x, int k, const char* f, NV* err) {
  if (!ar_ent_maquina(x->tipo)) {
    *err = ERRP(n_texto_utf8("pásalo antes con aTipo(a, \"i32\") o al entero que toque"), "«%s»: las operaciones de bits son de arreglos ENTEROS y el argumento %d es %s", f, (long long)k, AR_NOMBRE[x->tipo]); return 0;
  }
  if (x->tipo == AR_I64 || x->tipo == AR_U64) { *err = ar_error_i64(f, x->tipo); return 0; }
  return 1;
}
static double ar6_el(int op, double x, double y) {
  switch (op) {
    case 0: return (double)((int32_t)ar_touint32(x) & (int32_t)ar_touint32(y));
    case 1: return (double)((int32_t)ar_touint32(x) | (int32_t)ar_touint32(y));
    case 2: return (double)((int32_t)ar_touint32(x) ^ (int32_t)ar_touint32(y));
    case 3: return x * pow(2, y < 1100 ? y : 1100);
    default: return floor(x / pow(2, y < 1100 ? y : 1100));
  }
}
static NV ar6_dos(NV* a, int n, const char* nombre, int op) {
  int despl = op >= 3; NV nulo = n_nulo(); NV X = n > 0 ? a[0] : nulo, Y = n > 1 ? a[1] : nulo; NV err;
  int ax = n_es(X, NC_ARREGLO), ay = n_es(Y, NC_ARREGLO);
  if (!ax && !ay) {
    int64_t bx, by;
    if (!ar6_aent(X, 1, nombre, &bx, &err)) return err;
    if (despl) {
      if (!ar6_despl(Y, 2, nombre, &by, &err)) return err;
      if (op == 3) {
        if (bx == 0) return n_num(0);
        if (by > 62) return ERRP(n_texto_utf8("el tipo «grande» todavía no está en el ejecutable; con el motor de siempre (n-node) sí funciona"), "«%s»: el resultado no cabe en un número exacto (pasa de 2^53)", nombre);
        return ar6_res((__int128)bx << by, nombre);
      }
      if (by > 63) by = 63;
      return n_num((double)(bx >= 0 ? (bx >> by) : ~((~bx) >> by)));
    }
    if (!ar6_aent(Y, 2, nombre, &by, &err)) return err;
    return n_num((double)(op == 0 ? (bx & by) : op == 1 ? (bx | by) : (bx ^ by)));
  }
  if (!ax) return ERRP(msg("%s(arreglo, número) o %s(arreglo, arreglo)", nombre, nombre), "«%s»: si hay un arreglo, va primero", nombre);
  NArr* x = AR(X);
  if (!ar6_arr_ent(x, 1, nombre, &err)) return err;
  if (ay && !ar6_arr_ent(AR(Y), 2, nombre, &err)) return err;
  double ys = 0;
  if (!ay) {
    if (despl) { int64_t k; if (!ar6_despl(Y, 2, nombre, &k, &err)) return err; ys = (double)k; }
    else {
      if (Y.t != N_NUM || !(Y.u.n == floor(Y.u.n)) || isinf(Y.u.n)) return ERR("«%s»: el argumento 2 tiene que ser un entero o un arreglo entero", nombre);
      ys = Y.u.n;
    }
  }
  NArr* y = ay ? AR(Y) : NULL;
  int tipo = despl ? x->tipo : (ay ? ar_tipo_arit(x->tipo, y->tipo, OP_SUMA, 1, 1) : x->tipo);
  if (!ar_ent_maquina(tipo)) return ERRP(n_texto_utf8("pásalos a un mismo tipo con aTipo"), "«%s»: %s con %s no tiene un entero común", nombre, AR_NOMBRE[x->tipo], AR_NOMBRE[y->tipo]);
  int64_t f[AR_MAXND]; int nf;
  if (ay) { if (!ar_difundir(x->forma, x->nd, y->forma, y->nd, f, &nf)) { NV fa = ar_formas_txt(x->forma, x->nd), fb = ar_formas_txt(y->forma, y->nd); NV e = ERR("«%s»: las formas %v y %v no se pueden difundir", nombre, fa, fb); n_dec(fa); n_dec(fb); return e; } }
  else { nf = x->nd; for (int i = 0; i < nf; i++) f[i] = x->forma[i]; }
  NV out = ar_nuevo(f, nf, tipo); if (N_FALLO(out)) return out;
  int64_t cnt = ar_tam(AR(out)), zx[AR_MAXND], zy[AR_MAXND], ix[AR_MAXND] = {0};
  ar_zanc_dif(x, f, nf, zx); if (ay) ar_zanc_dif(y, f, nf, zy);
  for (int64_t k = 0; k < cnt; k++) {
    int64_t px = x->desp, py = ay ? y->desp : 0;
    for (int q = 0; q < nf; q++) { px += ix[q] * zx[q]; if (ay) py += ix[q] * zy[q]; }
    double u = ar_leer(x, px), w = ay ? ar_leer(y, py) : ys;
    if (despl && ay && (w < 0 || w > AR6_DESPL_MAX)) { n_dec(out); return ERR("«%s»: el desplazamiento es un entero de 0 a %d y llegó %j", nombre, (long long)AR6_DESPL_MAX, w); }
    ar_escribir(AR(out), k, ar6_el(op, u, w));
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}
NAT(ar6_bitsY) { (void)extra; return ar6_dos(a, n, "bitsY", 0); }
NAT(ar6_bitsO) { (void)extra; return ar6_dos(a, n, "bitsO", 1); }
NAT(ar6_bitsXor) { (void)extra; return ar6_dos(a, n, "bitsXor", 2); }
NAT(ar6_desplazarIzq) { (void)extra; return ar6_dos(a, n, "desplazarIzq", 3); }
NAT(ar6_desplazarDer) { (void)extra; return ar6_dos(a, n, "desplazarDer", 4); }
NAT(ar6_bitsNo) {
  (void)extra; NV nulo = n_nulo(), X = n > 0 ? a[0] : nulo, err;
  if (!n_es(X, NC_ARREGLO)) { int64_t b; if (!ar6_aent(X, 1, "bitsNo", &b, &err)) return err; return ar6_res((__int128)(~b), "bitsNo"); }
  NArr* x = AR(X); if (!ar6_arr_ent(x, 1, "bitsNo", &err)) return err;
  NV out = ar_nuevo(x->forma, x->nd, x->tipo); if (N_FALLO(out)) return out;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) ar_escribir(AR(out), i++, (double)(~(int32_t)ar_touint32(ar_leer(x, p))));
  return out;
}
NAT(ar6_contarBits) {
  (void)extra; NV nulo = n_nulo(), X = n > 0 ? a[0] : nulo, err;
  if (!n_es(X, NC_ARREGLO)) {
    int64_t b; if (!ar6_aent(X, 1, "contarBits", &b, &err)) return err;
    if (b < 0) return ERRP(n_texto_utf8("pásalo a un arreglo de su tipo, o usa bitsY con una máscara"), "«contarBits» de un negativo suelto no tiene fin");
    return n_num((double)__builtin_popcountll((unsigned long long)b));
  }
  NArr* x = AR(X); if (!ar6_arr_ent(x, 1, "contarBits", &err)) return err;
  int bits = ar_bits(x->tipo); uint64_t mascara = bits == 64 ? ~(uint64_t)0 : (((uint64_t)1 << bits) - 1);
  int64_t f[1]; NV out = ar_nuevo(x->forma, x->nd, AR_ENTERO); (void)f; if (N_FALLO(out)) return out;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) ar_escribir(AR(out), i++, (double)__builtin_popcountll((unsigned long long)(((uint64_t)(int64_t)ar_leer(x, p)) & mascara)));
  return out;
}

#define NAT_ARREGLO6 \
  { "numerico/bitsY", -1, ar6_bitsY }, { "numerico/bitsO", -1, ar6_bitsO }, { "numerico/bitsXor", -1, ar6_bitsXor }, { "numerico/bitsNo", -1, ar6_bitsNo }, \
  { "numerico/desplazarIzq", -1, ar6_desplazarIzq }, { "numerico/desplazarDer", -1, ar6_desplazarDer }, { "numerico/contarBits", -1, ar6_contarBits },
