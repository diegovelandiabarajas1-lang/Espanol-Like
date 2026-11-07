/* ============================================================================
 *  (motor-exp A7) El tipo «arreglo» en el ejecutable: memoria contigua de un solo tipo, forma, zancadas y vistas (src/03-vm-jit.js ObjArreglo,
 *  src/11-edsl-numerico.js). Primera tanda: los tipos real, entero, bool, complejo, real32, real16, i8, u8, i16, u16 y u32; creación, forma y vistas,
 *  aritmética con difusión (+ − × ÷ // % ** y el signo), comparaciones y lógica, índices (a[i], a[i] = v, para x en a), complejos básicos,
 *  y las funciones de números que ya existían, que ahora aceptan arreglos. Cada resultado es el que da la VM (mismos tipos, mismos mensajes).
 *  Los arreglos i64/u64 (que en la VM son BigInt) todavía no: piden aTipo a otro tipo y lo dicen.
 * ========================================================================== */
static double js_hypot2(double a, double b);   /* nrt_arreglo4.inc */
enum { AR_REAL = 0, AR_ENTERO, AR_BOOL, AR_COMPLEJO, AR_REAL32, AR_REAL16, AR_I8, AR_U8, AR_I16, AR_U16, AR_U32, AR_I64, AR_U64, AR_NTIPOS };
static const char* const AR_NOMBRE[AR_NTIPOS] = { "real", "entero", "bool", "complejo", "real32", "real16", "i8", "u8", "i16", "u16", "u32", "i64", "u64" };
typedef struct { int64_t rc; void* d; } ArBuf;
#define AR_MAXND 8
typedef struct { NObj h; uint8_t tipo, vista; int nd; int64_t forma[AR_MAXND], zanc[AR_MAXND]; int64_t desp; ArBuf* buf; } NArr;
#define AR(v) ((NArr*)(v).u.o)
#define AR_MAX_ELEMS 1000000000LL     /* el tope de n-node (N_MAX_ARREGLO) */

static int ar_ent_maquina(int t) { return t == AR_ENTERO || (t >= AR_I8 && t <= AR_U64); }
static int ar_flot(int t) { return t == AR_REAL || t == AR_REAL32 || t == AR_REAL16; }
static int ar_bits(int t) { switch (t) { case AR_I8: case AR_U8: return 8; case AR_I16: case AR_U16: return 16; case AR_ENTERO: case AR_U32: return 32; default: return 64; } }
static int ar_con_signo(int t) { return !(t == AR_U8 || t == AR_U16 || t == AR_U32 || t == AR_U64); }
static int ar_ent_de(int bits, int signo) {
  if (bits == 8) return signo ? AR_I8 : AR_U8;
  if (bits == 16) return signo ? AR_I16 : AR_U16;
  if (bits == 32) return signo ? AR_ENTERO : AR_U32;
  return signo ? AR_I64 : AR_U64;
}
static int ar_tipo_de_nombre(NV t) {   /* con los alias de NumPy y de C; -1 si no existe */
  if (!n_es(t, NC_TEXTO)) return -1;
  if (tx_c(t, "f64")) return AR_REAL; if (tx_c(t, "i32")) return AR_ENTERO; if (tx_c(t, "f32")) return AR_REAL32; if (tx_c(t, "f16")) return AR_REAL16;
  for (int i = 0; i < AR_NTIPOS; i++) if (tx_c(t, AR_NOMBRE[i])) return i;
  return -1;
}

/* ── redondear a half (binary16), con los mismos bits que la VM ── */
static double ar_r16(double x) {
  if (x != x || x == 0) return x;
  int e; frexp(x, &e); int E = e - 1;            /* x = m * 2^E con 1 <= |m| < 2 */
  if (E >= 16) return x > 0 ? INFINITY : -INFINITY;
  if (E < -25) return x > 0 ? 0.0 : -0.0;
  double a = x < 0 ? -x : x;
  if (a >= 65520) return x > 0 ? INFINITY : -INFINITY;
  int k = E + 25; double q = ldexp(1.0, (k - 25 - 10) > -24 ? (k - 25 - 10) : -24);
  double y = a / q, r = floor(y), f = y - r;
  if (f > 0.5 || (f == 0.5 && fmod(r, 2) == 1)) r += 1;
  double v = r * q;
  return x < 0 ? -v : v;
}
/* ToInt32 / ToUint32 de JavaScript */
static uint32_t ar_touint32(double x) {
  if (!isfinite(x)) return 0;
  double t = trunc(x), m = fmod(t, 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return (uint32_t)m;
}

/* ── crear y leer ── */
static void ar_buf_soltar(ArBuf* b) { if (b && --b->rc == 0) { free(b->d); free(b); } }
static size_t ar_ancho(int t) { switch (t) { case AR_REAL: return 8; case AR_COMPLEJO: return 16; case AR_ENTERO: case AR_U32: case AR_REAL32: case AR_REAL16: return 4; case AR_I16: case AR_U16: return 2; default: return 1; } }
static int64_t ar_tam(const NArr* a) { int64_t n = 1; for (int i = 0; i < a->nd; i++) n *= a->forma[i]; return n; }
static void ar_zancadas_de(const int64_t* forma, int nd, int64_t* z) { int64_t acc = 1; for (int i = nd - 1; i >= 0; i--) { z[i] = acc; acc *= forma[i]; } }
static int ar_seguida(const NArr* a) {
  if (a->desp != 0) return 0;
  int64_t z[AR_MAXND]; ar_zancadas_de(a->forma, a->nd, z);
  for (int i = 0; i < a->nd; i++) if (z[i] != a->zanc[i]) return 0;
  return 1;
}
static NV ar_formas_txt(const int64_t* f, int nd) {
  NBuf b = {0};
  for (int i = 0; i < nd; i++) { if (i) b_utf8(&b, "\xC3\x97"); char nb[32]; snprintf(nb, sizeof nb, "%lld", (long long)f[i]); b_utf8(&b, nb); }
  return b_texto(&b);
}
/* un arreglo nuevo con memoria propia, a ceros */
static NV ar_nuevo(const int64_t* forma, int nd, int tipo) {
  if (tipo == AR_I64 || tipo == AR_U64) return ERR("los arreglos %s todavía no están en el ejecutable nativo", AR_NOMBRE[tipo]);
  int64_t n = 1; for (int i = 0; i < nd; i++) n *= forma[i];
  if (n > AR_MAX_ELEMS) {
    NV f = ar_formas_txt(forma, nd);
    NV e = ERRP(n_texto_utf8("si de verdad necesitas más, hazlo por trozos · o sube el máximo con la variable de entorno N_MAX_ARREGLO"),
      "un arreglo de %v son %d números y el máximo son 1.000.000.000", f, (long long)n);
    n_dec(f); return e;
  }
  NArr* a = (NArr*)n_objeto(sizeof(NArr), NC_ARREGLO);
  a->tipo = (uint8_t)tipo; a->vista = 0; a->nd = nd; a->desp = 0;
  for (int i = 0; i < nd; i++) a->forma[i] = forma[i];
  ar_zancadas_de(forma, nd, a->zanc);
  a->buf = (ArBuf*)n_mem(sizeof(ArBuf)); a->buf->rc = 1;
  size_t bytes = (size_t)(n ? n : 1) * ar_ancho(tipo);
  a->buf->d = calloc(1, bytes);
  if (!a->buf->d) { free(a->buf); free(a); NV f = ar_formas_txt(forma, nd); NV e = ERRP(n_texto_utf8("prueba con menos elementos, un tipo más pequeño (\"real32\", \"u8\") o hazlo por trozos"), "no hay memoria para un arreglo de %v (%d números)", f, (long long)n); n_dec(f); return e; }
  return n_obj(a);
}
/* una vista: la misma memoria con otra forma y otras zancadas */
static NV ar_vista(NArr* base, const int64_t* forma, const int64_t* zanc, int nd, int64_t desp) {
  NArr* a = (NArr*)n_objeto(sizeof(NArr), NC_ARREGLO);
  a->tipo = base->tipo; a->vista = 1; a->nd = nd; a->desp = desp;
  for (int i = 0; i < nd; i++) { a->forma[i] = forma[i]; a->zanc[i] = zanc[i]; }
  a->buf = base->buf; a->buf->rc++;
  return n_obj(a);
}
static void ar_liberar(NObj* o) { ar_buf_soltar(((NArr*)o)->buf); }

static double ar_leer(const NArr* a, int64_t p) {   /* un número que no es complejo */
  const char* d = (const char*)a->buf->d;
  switch (a->tipo) {
    case AR_REAL: return ((const double*)d)[p];
    case AR_ENTERO: return (double)((const int32_t*)d)[p];
    case AR_BOOL: case AR_U8: return (double)((const uint8_t*)d)[p];
    case AR_REAL32: case AR_REAL16: return (double)((const float*)d)[p];
    case AR_I8: return (double)((const int8_t*)d)[p];
    case AR_I16: return (double)((const int16_t*)d)[p];
    case AR_U16: return (double)((const uint16_t*)d)[p];
    case AR_U32: return (double)((const uint32_t*)d)[p];
    case AR_COMPLEJO: return ((const double*)d)[p];     /* como la VM sin querer: la parte real del "índice" p (ver iguales) */
    default: return 0;
  }
}
/* escribir lo que hace una TypedArray de JavaScript al asignar */
static void ar_escribir(NArr* a, int64_t p, double x) {
  char* d = (char*)a->buf->d;
  switch (a->tipo) {
    case AR_REAL: ((double*)d)[p] = x; break;
    case AR_ENTERO: ((int32_t*)d)[p] = (int32_t)ar_touint32(x); break;
    case AR_BOOL: case AR_U8: ((uint8_t*)d)[p] = (uint8_t)ar_touint32(x); break;
    case AR_REAL32: ((float*)d)[p] = (float)x; break;
    case AR_REAL16: ((float*)d)[p] = (float)ar_r16(x); break;
    case AR_I8: ((int8_t*)d)[p] = (int8_t)ar_touint32(x); break;
    case AR_I16: ((int16_t*)d)[p] = (int16_t)ar_touint32(x); break;
    case AR_U16: ((uint16_t*)d)[p] = (uint16_t)ar_touint32(x); break;
    case AR_U32: ((uint32_t*)d)[p] = ar_touint32(x); break;
    default: break;
  }
}
/* los números de un arreglo seguido o no, en orden lógico */
typedef struct { const NArr* a; int64_t ix[AR_MAXND]; int64_t p; int64_t quedan; } ArIt;
static void ari_ini(ArIt* it, const NArr* a) { it->a = a; for (int i = 0; i < AR_MAXND; i++) it->ix[i] = 0; it->p = a->desp; it->quedan = ar_tam(a); }
static int ari_sig(ArIt* it, int64_t* p) {
  if (it->quedan <= 0) return 0;
  *p = it->p; it->quedan--;
  const NArr* a = it->a;
  for (int q = a->nd - 1; q >= 0; q--) {
    if (++it->ix[q] < a->forma[q]) { it->p += a->zanc[q]; break; }
    it->p -= (a->forma[q] - 1) * a->zanc[q]; it->ix[q] = 0;
  }
  return 1;
}

/* ── mensajes comunes ── */
static NV ar_error_i64(const char* f, int tipo) {
  return ERRP(n_texto_utf8("pásalo antes con aTipo(a, \"real\") —exacto hasta 2^53— o a un entero más pequeño"), "«%s» todavía no trabaja con arreglos %s", f, AR_NOMBRE[tipo]);
}
static int ar_puerta(NV v, int k, const char* f, NV* err, int permite_complejo) {
  if (!n_es(v, NC_ARREGLO)) { *err = ERR("«%s»: el argumento %d debe ser un arreglo y es %s", f, (long long)k, n_tipo_de(v)); return 0; }
  if (AR(v)->tipo == AR_COMPLEJO && !permite_complejo) {
    *err = ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada"), "«%s» todavía no sabe trabajar con arreglos complejos", f);
    return 0;
  }
  return 1;
}
#define ARR_(v, k, f) do { NV e_; if (!ar_puerta((v), (k), (f), &e_, 0)) return e_; } while (0)
#define ARRC_(v, k, f) do { NV e_; if (!ar_puerta((v), (k), (f), &e_, 1)) return e_; } while (0)

/* ── difusión ── */
static int ar_difundir(const int64_t* fa, int na, const int64_t* fb, int nb, int64_t* out, int* nout) {
  int n = na > nb ? na : nb;
  for (int i = 0; i < n; i++) {
    int64_t x = (na - n + i) >= 0 ? fa[na - n + i] : 1, y = (nb - n + i) >= 0 ? fb[nb - n + i] : 1;
    if (x != y && x != 1 && y != 1) return 0;
    out[i] = x > y ? x : y;
  }
  *nout = n; return 1;
}
static void ar_zanc_dif(const NArr* v, const int64_t* f, int nf, int64_t* z) {
  int d = nf - v->nd;
  for (int i = 0; i < nf; i++) z[i] = 0;
  for (int i = 0; i < v->nd; i++) z[d + i] = v->forma[i] == 1 ? 0 : v->zanc[i];
}
static NV ar_error_difundir(const char* op, const NArr* a, const NArr* b) {
  NV fa = ar_formas_txt(a->forma, a->nd), fb = ar_formas_txt(b->forma, b->nd);
  NV e = ERRP(n_texto_utf8("de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1"), "«%s»: las formas %v y %v no se pueden difundir", op, fa, fb);
  n_dec(fa); n_dec(fb); return e;
}

/* ── el tipo de una operación ── */
enum { OP_SUMA = 0, OP_RESTA, OP_MULT, OP_DIV, OP_IDIV, OP_MOD, OP_POT };
static const char* const OP_NOMBRE[] = { "+", "-", "*", "/", "//", "%", "**" };
static int ar_tipo_arit(int tA, int tB, int op, int esA, int esB) {
  int mA = esA && ar_ent_maquina(tA) && tA != AR_ENTERO, mB = esB && ar_ent_maquina(tB) && tB != AR_ENTERO;
  if (mA || mB) {
    int flA = esA && ar_flot(tA), flB = esB && ar_flot(tB);
    if (flA || flB) return flA ? tA : tB;
    if (op == OP_DIV || op == OP_POT) return AR_REAL;
    int ia = esA && ar_ent_maquina(tA), ib = esB && ar_ent_maquina(tB);
    if (!esA || !esB) { int s = esA ? (tB == AR_ENTERO ? AR_ENTERO : AR_REAL) : (tA == AR_ENTERO ? AR_ENTERO : AR_REAL); if (s == AR_REAL) return AR_REAL; return mA ? tA : tB; }
    if (!ia || !ib) return AR_REAL;
    if (ar_con_signo(tA) == ar_con_signo(tB)) { int ba = ar_bits(tA), bb = ar_bits(tB); return ar_ent_de(ba > bb ? ba : bb, ar_con_signo(tA)); }
    int bs = ar_con_signo(tA) ? ar_bits(tA) : ar_bits(tB), bu = ar_con_signo(tA) ? ar_bits(tB) : ar_bits(tA);
    if (bs > bu) return ar_ent_de(bs, 1);
    if (bu == 64) return AR_REAL;
    return ar_ent_de(bu * 2, 1);
  }
  int fA = esA && ar_flot(tA) ? tA : -1, fB = esB && ar_flot(tB) ? tB : -1;
  if (fA >= 0 || fB >= 0) { static const int orden[] = { AR_REAL, AR_REAL32, AR_REAL16 }; for (int i = 0; i < 3; i++) if (fA == orden[i] || fB == orden[i]) return orden[i]; }
  int entero = tA == AR_ENTERO && tB == AR_ENTERO && op != OP_DIV && op != OP_POT;
  return entero ? AR_ENTERO : AR_REAL;
}
static int32_t ar_imul(double x, double y) { return (int32_t)((uint32_t)ar_touint32(x) * (uint32_t)ar_touint32(y)); }

/* opC: aritmética compleja (la división es el método de Smith) */
static int ar_op_c(int op, double ar_, double ai, double br, double bi, double* rr, double* ri, NV* err) {
  switch (op) {
    case OP_SUMA: *rr = ar_ + br; *ri = ai + bi; return 1;
    case OP_RESTA: *rr = ar_ - br; *ri = ai - bi; return 1;
    case OP_MULT: *rr = ar_ * br - ai * bi; *ri = ar_ * bi + ai * br; return 1;
    case OP_DIV: {
      if (br == 0 && bi == 0) { *err = n_error("división entre cero", NULL); return 0; }
      if (fabs(br) >= fabs(bi)) { double r = bi / br, den = br + bi * r; *rr = (ar_ + ai * r) / den; *ri = (ai - ar_ * r) / den; }
      else { double r = br / bi, den = br * r + bi; *rr = (ar_ * r + ai) / den; *ri = (ai * r - ar_) / den; }
      return 1;
    }
    default:
      *err = ERRP(n_texto_utf8("los complejos no se ordenan ni se dividen a lo entero: suma, resta, multiplica y divide, y para lo demás pasa a reales con absoluto o parteReal"), "«%s» no está definida para números complejos", OP_NOMBRE[op]);
      return 0;
  }
}

/* arreglo (o escalar) contra arreglo (o escalar): a y b pueden ser NV de arreglo o número */
static NV ar_arit(NV a, NV b, int op) {
  int esA = n_es(a, NC_ARREGLO), esB = n_es(b, NC_ARREGLO);
  const char* opn = OP_NOMBRE[op];
  if (esA && !esB && b.t != N_NUM) return ERR("«%s»: un arreglo se opera con otro arreglo o con un número, y llegó %s", opn, n_tipo_de(b));
  if (esB && !esA && a.t != N_NUM) return ERR("«%s»: un arreglo se opera con otro arreglo o con un número, y llegó %s", opn, n_tipo_de(a));
  NArr *A = esA ? AR(a) : NULL, *B = esB ? AR(b) : NULL;
  int64_t f[AR_MAXND]; int nf = 0;
  if (esA && esB) { if (!ar_difundir(A->forma, A->nd, B->forma, B->nd, f, &nf)) return ar_error_difundir(opn, A, B); }
  else { NArr* X = esA ? A : B; nf = X->nd; for (int i = 0; i < nf; i++) f[i] = X->forma[i]; }
  int64_t za[AR_MAXND] = {0}, zb[AR_MAXND] = {0};
  if (esA) ar_zanc_dif(A, f, nf, za);
  if (esB) ar_zanc_dif(B, f, nf, zb);
  int cplx = (esA && A->tipo == AR_COMPLEJO) || (esB && B->tipo == AR_COMPLEJO);
  int tA = esA ? A->tipo : (a.u.n == trunc(a.u.n) && isfinite(a.u.n) ? AR_ENTERO : AR_REAL);
  int tB = esB ? B->tipo : (b.u.n == trunc(b.u.n) && isfinite(b.u.n) ? AR_ENTERO : AR_REAL);
  if (!cplx) {
    if ((esA && (A->tipo == AR_I64 || A->tipo == AR_U64)) || (esB && (B->tipo == AR_I64 || B->tipo == AR_U64))) return ar_error_i64(opn, esA ? A->tipo : B->tipo);
  }
  int tipo = cplx ? AR_COMPLEJO : ar_tipo_arit(tA, tB, op, esA, esB);
  if (tipo == AR_I64 || tipo == AR_U64) return ERR("«%s»: el resultado sería %s, y los arreglos de 64 bits todavía no están en el ejecutable nativo", opn, AR_NOMBRE[tipo]);
  int entmaq_ent = !cplx && ar_ent_maquina(tipo) && (tipo != AR_ENTERO || op == OP_MULT);
  if (!cplx && ar_ent_maquina(tipo) && tipo != AR_ENTERO && !(ar_bits(tipo) == 32 && op == OP_MULT)) {
    if (!esA && a.u.n != trunc(a.u.n)) return ERR("«%s»: un arreglo %s se opera con enteros y llegó %n", opn, AR_NOMBRE[tipo], a.u.n);
    if (!esB && b.u.n != trunc(b.u.n)) return ERR("«%s»: un arreglo %s se opera con enteros y llegó %n", opn, AR_NOMBRE[tipo], b.u.n);
    entmaq_ent = 0;   /* va por la aritmética de reales y se envuelve al guardar */
  }
  NV out = ar_nuevo(f, nf, tipo);
  if (N_FALLO(out)) return out;
  NArr* O = AR(out); int64_t n = ar_tam(O);
  if (entmaq_ent) {
    if (!esA && a.u.n != trunc(a.u.n)) { n_dec(out); return ERR("«%s»: un arreglo %s se opera con enteros y llegó %n", opn, AR_NOMBRE[tipo], a.u.n); }
    if (!esB && b.u.n != trunc(b.u.n)) { n_dec(out); return ERR("«%s»: un arreglo %s se opera con enteros y llegó %n", opn, AR_NOMBRE[tipo], b.u.n); }
  }
  int64_t ix[AR_MAXND] = {0};
  int bits = ar_bits(tipo);
  for (int64_t k = 0; k < n; k++) {
    int64_t pa = esA ? A->desp : 0, pb = esB ? B->desp : 0;
    for (int q = 0; q < nf; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
    if (cplx) {
      double ar_ = esA ? (A->tipo == AR_COMPLEJO ? ((double*)A->buf->d)[2 * pa] : ar_leer(A, pa)) : a.u.n, ai = esA && A->tipo == AR_COMPLEJO ? ((double*)A->buf->d)[2 * pa + 1] : 0;
      double br = esB ? (B->tipo == AR_COMPLEJO ? ((double*)B->buf->d)[2 * pb] : ar_leer(B, pb)) : b.u.n, bi = esB && B->tipo == AR_COMPLEJO ? ((double*)B->buf->d)[2 * pb + 1] : 0;
      double rr, ri; NV err = n_nulo();
      if (!ar_op_c(op, ar_, ai, br, bi, &rr, &ri, &err)) { n_dec(out); return err; }
      ((double*)O->buf->d)[2 * k] = rr; ((double*)O->buf->d)[2 * k + 1] = ri;
    } else {
      double x = esA ? ar_leer(A, pa) : a.u.n, y = esB ? ar_leer(B, pb) : b.u.n, r;
      if (entmaq_ent) {
        switch (op) {
          case OP_SUMA: r = x + y; break;
          case OP_RESTA: r = x - y; break;
          case OP_MULT: r = bits == 32 ? (double)ar_imul(x, y) : x * y; break;
          case OP_IDIV: if (y == 0) { n_dec(out); return n_error("división entre cero", NULL); } r = floor(x / y); break;
          case OP_MOD: if (y == 0) { n_dec(out); return n_error("módulo entre cero", NULL); } r = x - y * floor(x / y); break;
          default: n_dec(out); return ERR("«%s» no se puede aplicar a un arreglo %s", opn, AR_NOMBRE[tipo]);
        }
      } else {
        switch (op) {
          case OP_SUMA: r = x + y; break;
          case OP_RESTA: r = x - y; break;
          case OP_MULT: r = x * y; break;
          case OP_DIV: if (y == 0) { n_dec(out); return n_error("división entre cero", NULL); } r = x / y; break;
          case OP_IDIV: if (y == 0) { n_dec(out); return n_error("división entre cero", NULL); } r = floor(x / y); break;
          case OP_MOD: if (y == 0) { n_dec(out); return n_error("módulo entre cero", NULL); } r = fmod(fmod(x, y) + y, y); break;
          default: r = pow_js(x, y); break;
        }
      }
      if (tipo == AR_REAL16) ((float*)O->buf->d)[k] = (float)ar_r16((double)(float)r);   /* real32 al guardar y luego a 16 bits, como la VM */
      else ar_escribir(O, k, r);
    }
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}
static NV ar_escalar(double x) { return n_num(x); }

/* ── comparar: de arreglo a máscara ── */
static NV ar_comparar(NV a, NV b, int op /* 0 > 1 < 2 >= 3 <= 4 == 5 != */) {
  static const char* const nom[] = { ">", "<", ">=", "<=", "==", "!=" };
  int esA = n_es(a, NC_ARREGLO), esB = n_es(b, NC_ARREGLO);
  if (!esA && !esB) return ERR("«%s» sobre arreglos necesita al menos un arreglo", nom[op]);
  if ((esA && !esB && b.t != N_NUM) || (esB && !esA && a.t != N_NUM)) return ERR("«%s»: un arreglo se compara con otro arreglo o con un número", nom[op]);
  NArr *A = esA ? AR(a) : NULL, *B = esB ? AR(b) : NULL;
  int64_t f[AR_MAXND]; int nf = 0;
  if (esA && esB) { if (!ar_difundir(A->forma, A->nd, B->forma, B->nd, f, &nf)) return ar_error_difundir(nom[op], A, B); }
  else { NArr* X = esA ? A : B; nf = X->nd; for (int i = 0; i < nf; i++) f[i] = X->forma[i]; }
  int cplx = (esA && A->tipo == AR_COMPLEJO) || (esB && B->tipo == AR_COMPLEJO);
  if (cplx && op != 4 && op != 5)
    return ERRP(n_texto_utf8("compara los módulos con absoluto(a), o usa «==» y «!=», que sí tienen sentido"), "«%s» no vale entre complejos: en el plano no hay «menor»", nom[op]);
  if ((esA && (A->tipo == AR_I64 || A->tipo == AR_U64)) || (esB && (B->tipo == AR_I64 || B->tipo == AR_U64))) return ar_error_i64("comparar", esA ? A->tipo : B->tipo);
  int64_t za[AR_MAXND] = {0}, zb[AR_MAXND] = {0};
  if (esA) ar_zanc_dif(A, f, nf, za);
  if (esB) ar_zanc_dif(B, f, nf, zb);
  NV out = ar_nuevo(f, nf, AR_BOOL); if (N_FALLO(out)) return out;
  NArr* O = AR(out); int64_t n = ar_tam(O); int64_t ix[AR_MAXND] = {0};
  for (int64_t k = 0; k < n; k++) {
    int64_t pa = esA ? A->desp : 0, pb = esB ? B->desp : 0;
    for (int q = 0; q < nf; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
    int r;
    if (cplx) {
      double xr = esA ? (A->tipo == AR_COMPLEJO ? ((double*)A->buf->d)[2 * pa] : ar_leer(A, pa)) : a.u.n, xi = esA && A->tipo == AR_COMPLEJO ? ((double*)A->buf->d)[2 * pa + 1] : 0;
      double yr = esB ? (B->tipo == AR_COMPLEJO ? ((double*)B->buf->d)[2 * pb] : ar_leer(B, pb)) : b.u.n, yi = esB && B->tipo == AR_COMPLEJO ? ((double*)B->buf->d)[2 * pb + 1] : 0;
      int ig = xr == yr && xi == yi; r = op == 4 ? ig : !ig;
    } else {
      double x = esA ? ar_leer(A, pa) : a.u.n, y = esB ? ar_leer(B, pb) : b.u.n;
      switch (op) { case 0: r = x > y; break; case 1: r = x < y; break; case 2: r = x >= y; break; case 3: r = x <= y; break; case 4: r = x == y; break; default: r = x != y; }
    }
    ((uint8_t*)O->buf->d)[k] = (uint8_t)r;
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}

/* ── una función de un número a un número, aplicada a todo (arrUnaria) ── */
static int ar_tipo_flotante(int t) { return t == AR_REAL32 || t == AR_REAL16 ? t : AR_REAL; }
static NV ar_unaria(NArr* x, NV (*fx)(double, double*), int tipo /* -1: el de x (bool→real); -2: el flotante de x; si no, el pedido */) {
  int t = tipo == -2 ? ar_tipo_flotante(x->tipo) : tipo == -1 ? (x->tipo == AR_BOOL ? AR_REAL : x->tipo) : tipo;
  NV out = ar_nuevo(x->forma, x->nd, t); if (N_FALLO(out)) return out;
  NArr* O = AR(out); ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) {
    double r;
    NV e = fx(ar_leer(x, p), &r);
    if (N_FALLO(e)) { n_dec(out); return e; }
    if (t == AR_REAL16) ((float*)O->buf->d)[i] = (float)ar_r16((double)(float)r); else ar_escribir(O, i, r);
    i++;
  }
  return out;
}
/* los números de un arreglo (no complejo) en un vector nuevo, en orden lógico */
static double* ar_valores(const NArr* x, int64_t* n) {
  *n = ar_tam(x);
  double* v = (double*)n_mem(sizeof(double) * (size_t)(*n ? *n : 1));
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) v[i++] = ar_leer(x, p);
  return v;
}

/* ═════════════════════════════════════════════ construir */
static int ar_forma_de(NV v, const char* f, int64_t* forma, int* nd, NV* err) {
  int64_t un[1]; NV* xs; int64_t cnt;
  NV tmp[1];
  if (v.t == N_NUM) { tmp[0] = v; xs = tmp; cnt = 1; }
  else if (n_es(v, NC_LISTA)) { cnt = LS(v)->n; xs = n_lv(LS(v)); }
  else { *err = ERR("«%s»: el argumento 1 debe ser una lista y es %s", f, n_tipo_de(v)); return 0; }
  (void)un;
  for (int64_t i = 0; i < cnt && i <= AR_MAXND; i++) {
    NV x = xs[i];
    if (x.t != N_NUM || x.u.n != trunc(x.u.n) || x.u.n < 0 || !isfinite(x.u.n)) { NV r = n_repr(x, 1); *err = ERR("«%s»: la forma son enteros no negativos y llegó %v", f, r); n_dec(r); return 0; }
  }
  if (cnt == 0) { *err = ERR("«%s»: la forma no puede estar vacía", f); return 0; }
  if (cnt > AR_MAXND) { *err = ERR("«%s»: como mucho 8 dimensiones", f); return 0; }
  for (int64_t i = 0; i < cnt; i++) forma[i] = (int64_t)xs[i].u.n;
  *nd = (int)cnt; return 1;
}
static int ar_tipo_arg(NV v, int dado, const char* f, int* t, NV* err) {
  if (!dado || v.t == N_NULO) { *t = AR_REAL; return 1; }
  if (!n_es(v, NC_TEXTO)) { *err = ERR("«%s»: se esperaba un texto y llegó %s", f, n_tipo_de(v)); return 0; }
  int k = ar_tipo_de_nombre(v);
  if (k < 0 || k == AR_COMPLEJO) {
    NBuf b = {0}; static const int ok[] = { AR_REAL, AR_ENTERO, AR_BOOL, AR_REAL32, AR_REAL16, AR_I8, AR_U8, AR_I16, AR_U16, AR_U32, AR_I64, AR_U64 };
    for (int i = 0; i < 12; i++) { if (i) b_utf8(&b, ", "); b_c(&b, '"'); b_utf8(&b, AR_NOMBRE[ok[i]]); b_c(&b, '"'); }
    NV lista = b_texto(&b);
    *err = ERRP(n_texto_utf8("los complejos no se piden así: se hacen con complejo(re, im)"), "«%s»: el tipo es %v y llegó «%v»", f, lista, v);
    n_dec(lista); return 0;
  }
  *t = k; return 1;
}
static int ar_todo_entero(const double* xs, int64_t n) { for (int64_t i = 0; i < n; i++) if (!(xs[i] == trunc(xs[i]) && isfinite(xs[i]) && xs[i] >= -2147483648.0 && xs[i] <= 2147483647.0)) return 0; return 1; }
/* De una lista —posiblemente anidada— a forma + números, comprobando que sea rectangular */
static int ar_desde_lista(NV l, const char* f, int64_t* forma, int* nd, double** plano, int64_t* n, NV* err) {
  *nd = 0; NV nivel = l;
  while (n_es(nivel, NC_LISTA)) {
    forma[(*nd)++] = LS(nivel)->n;
    nivel = LS(nivel)->n ? n_lv(LS(nivel))[0] : n_nulo();
    if (*nd > AR_MAXND) { *err = ERR("«%s»: como mucho 8 dimensiones", f); return 0; }
  }
  int64_t total = 1; for (int i = 0; i < *nd; i++) total *= forma[i];
  double* out = (double*)n_mem(sizeof(double) * (size_t)(total ? total : 1)); int64_t pos = 0;
  /* recorrido en profundidad con una pila explícita (como mucho 8 niveles) */
  NV pila[AR_MAXND + 1]; int64_t idx[AR_MAXND + 1]; int d = 0; pila[0] = l; idx[0] = 0;
  if (*nd == 0) { *err = ERR("«%s»: todos los elementos tienen que ser números y hay %s", f, n_tipo_de(l)); free(out); return 0; }
  while (d >= 0) {
    NV x = pila[d];
    if (idx[d] >= LS(x)->n) { d--; if (d >= 0) idx[d]++; continue; }
    NV y = n_lv(LS(x))[idx[d]];
    if (d + 1 == *nd) {
      if (y.t != N_NUM) { *err = ERR("«%s»: todos los elementos tienen que ser números y hay %s", f, n_tipo_de(y)); free(out); return 0; }
      out[pos++] = y.u.n; idx[d]++;
    } else {
      if (!n_es(y, NC_LISTA)) { *err = ERRP(msg("en el nivel %d se esperaba una lista de %d y llegó %s", (long long)(d + 2), (long long)forma[d + 1], n_tipo_de(y)), "«%s»: la anidación no es rectangular", f); free(out); return 0; }
      if (LS(y)->n != forma[d + 1]) { *err = ERRP(msg("una fila tiene %d elementos y otra %d", (long long)LS(y)->n, (long long)forma[d + 1]), "«%s»: la anidación no es rectangular", f); free(out); return 0; }
      d++; pila[d] = y; idx[d] = 0;
    }
  }
  *plano = out; *n = pos; return 1;
}
NAT(ar_arreglo) {
  (void)extra; LST(a[0], 1, "arreglo");
  int64_t forma[AR_MAXND]; int nd; double* plano; int64_t cnt; NV err;
  if (!ar_desde_lista(a[0], "arreglo", forma, &nd, &plano, &cnt, &err)) return err;
  int tipo;
  if (n > 1) { if (!ar_tipo_arg(a[1], 1, "arreglo", &tipo, &err)) { free(plano); return err; } }
  else tipo = ar_todo_entero(plano, cnt) ? AR_ENTERO : AR_REAL;
  NV out = ar_nuevo(forma, nd, tipo);
  if (N_FALLO(out)) { free(plano); return out; }
  NArr* O = AR(out);
  for (int64_t i = 0; i < cnt; i++) { if (tipo == AR_REAL16) ((float*)O->buf->d)[i] = (float)ar_r16((double)(float)plano[i]); else ar_escribir(O, i, plano[i]); }
  free(plano); return out;
}
NAT(ar_ceros) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; int tipo;
  if (!ar_forma_de(a[0], "ceros", f, &nd, &err)) return err;
  if (!ar_tipo_arg(n > 1 ? a[1] : n_nulo(), n > 1, "ceros", &tipo, &err)) return err;
  return ar_nuevo(f, nd, tipo);
}
NAT(ar_vacio) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; int tipo;
  if (!ar_forma_de(a[0], "vacio", f, &nd, &err)) return err;
  if (!ar_tipo_arg(n > 1 ? a[1] : n_nulo(), n > 1, "vacio", &tipo, &err)) return err;
  return ar_nuevo(f, nd, tipo);
}
static void ar_rellenar(NArr* x, double v) {
  int64_t n = ar_tam(x);
  if (x->tipo == AR_COMPLEJO) { for (int64_t i = 0; i < n; i++) { ((double*)x->buf->d)[2 * i] = v; } return; }
  for (int64_t i = 0; i < n; i++) ar_escribir(x, i, v);
}
NAT(ar_unos) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; int tipo;
  if (!ar_forma_de(a[0], "unos", f, &nd, &err)) return err;
  if (!ar_tipo_arg(n > 1 ? a[1] : n_nulo(), n > 1, "unos", &tipo, &err)) return err;
  NV x = ar_nuevo(f, nd, tipo); if (N_FALLO(x)) return x;
  ar_rellenar(AR(x), 1); return x;
}
NAT(ar_lleno) {
  (void)extra; int64_t f[AR_MAXND]; int nd; NV err; int tipo;
  if (!ar_forma_de(a[0], "lleno", f, &nd, &err)) return err;
  NUM(a[1], 2, "lleno");
  double v = a[1].u.n;
  if (n > 2) { if (!ar_tipo_arg(a[2], 1, "lleno", &tipo, &err)) return err; }
  else tipo = (v == trunc(v) && isfinite(v) && v >= -2147483648.0 && v <= 2147483647.0) ? AR_ENTERO : AR_REAL;
  NV x = ar_nuevo(f, nd, tipo); if (N_FALLO(x)) return x;
  ar_rellenar(AR(x), v); return x;
}
NAT(ar_secuencia) {
  (void)extra; double desde = 0, hasta, paso = 1;
  if (n == 1) { NUM(a[0], 1, "secuencia"); hasta = a[0].u.n; }
  else { NUM(a[0], 1, "secuencia"); NUM(a[1], 2, "secuencia"); desde = a[0].u.n; hasta = a[1].u.n; if (n > 2) { NUM(a[2], 3, "secuencia"); paso = a[2].u.n; } }
  if (paso == 0) return n_error("«secuencia»: el paso no puede ser 0", NULL);
  double cnt = ceil((hasta - desde) / paso); if (!(cnt > 0)) cnt = 0;
  int64_t f[1] = { (int64_t)cnt };
  int tipo = (desde == trunc(desde) && isfinite(desde) && paso == trunc(paso) && isfinite(paso)) ? AR_ENTERO : AR_REAL;
  NV x = ar_nuevo(f, 1, tipo); if (N_FALLO(x)) return x;
  for (int64_t i = 0; i < f[0]; i++) ar_escribir(AR(x), i, desde + (double)i * paso);
  return x;
}
NAT(ar_reparto) {
  (void)extra; NUM(a[0], 1, "reparto"); NUM(a[1], 2, "reparto");
  double d = a[0].u.n, h = a[1].u.n, cnt = 50;
  if (n > 2) { NUM(a[2], 3, "reparto"); cnt = trunc(a[2].u.n); }
  if (cnt < 1) return ERRP(msg("pediste %n", cnt), "«reparto»: hacen falta al menos 1 punto");
  int64_t f[1] = { (int64_t)cnt };
  NV x = ar_nuevo(f, 1, AR_REAL); if (N_FALLO(x)) return x;
  double* v = (double*)AR(x)->buf->d;
  if (f[0] == 1) { v[0] = d; return x; }
  double paso = (h - d) / (double)(f[0] - 1);
  for (int64_t i = 0; i < f[0]; i++) v[i] = d + (double)i * paso;
  v[f[0] - 1] = h;
  return x;
}
NAT(ar_azarArreglo) {
  (void)n; (void)extra; int64_t f[AR_MAXND]; int nd; NV err;
  if (!ar_forma_de(a[0], "azarArreglo", f, &nd, &err)) return err;
  NV x = ar_nuevo(f, nd, AR_REAL); if (N_FALLO(x)) return x;
  int64_t cnt = ar_tam(AR(x)); double* v = (double*)AR(x)->buf->d;
  for (int64_t i = 0; i < cnt; i++) v[i] = az_sig();
  return x;
}

/* ═════════════════════════════════════════════ mirar */
NAT(ar_forma) {
  (void)n; (void)extra; ARRC_(a[0], 1, "forma");
  NArr* x = AR(a[0]); NV l = n_lista_nueva(x->nd);
  for (int i = 0; i < x->nd; i++) n_lista_agregar(LS(l), n_num((double)x->forma[i]));
  return l;
}
NAT(ar_dimensiones) { (void)n; (void)extra; ARRC_(a[0], 1, "dimensiones"); return n_num((double)AR(a[0])->nd); }
NAT(ar_tamano) { (void)n; (void)extra; ARRC_(a[0], 1, "tamano"); return n_num((double)ar_tam(AR(a[0]))); }
NAT(ar_tipoArreglo) { (void)n; (void)extra; ARRC_(a[0], 1, "tipoArreglo"); return n_texto_utf8(AR_NOMBRE[AR(a[0])->tipo]); }
NAT(ar_esVista) { (void)n; (void)extra; ARRC_(a[0], 1, "esVista"); return n_bool(AR(a[0])->vista); }
NAT(ar_esComplejo) { (void)n; (void)extra; ARRC_(a[0], 1, "esComplejo"); return n_bool(AR(a[0])->tipo == AR_COMPLEJO); }
static NV ar_limite(NV* a, int k, const char* f) {
  int t;
  if (n_es(a[0], NC_ARREGLO)) t = AR(a[0])->tipo;
  else if (n_es(a[0], NC_TEXTO)) { t = ar_tipo_de_nombre(a[0]); if (t < 0) { NBuf b = {0}; for (int i = 0; i < AR_NTIPOS; i++) { if (i == AR_COMPLEJO) continue; if (b.n) b_utf8(&b, ", "); b_utf8(&b, AR_NOMBRE[i]); } NV ls = b_texto(&b); NV e = ERRP(msg("los que hay: %v", ls), "«%s»: no conozco el tipo «%v»", f, a[0]); n_dec(ls); return e; } }
  else { NV pista = msg("%s(a) · %s(\"real32\")", f, f); return ERRP(pista, "«%s»: el argumento 1 debe ser un arreglo o el nombre de un tipo y es %s", f, n_tipo_de(a[0])); }
  if (t == AR_COMPLEJO) return ERRP(msg("los que hay: real, real32, real16, entero, i8, u8, i16, u16, u32, i64, u64, bool"), "«%s»: los complejos no tienen un orden", f);
  /* épsilon, mínimo, máximo */
  static const double L[AR_NTIPOS][3] = {
    [AR_REAL] = { 2.220446049250313e-16, -1.7976931348623157e308, 1.7976931348623157e308 },
    [AR_REAL32] = { 1.1920928955078125e-07, -3.4028234663852886e38, 3.4028234663852886e38 },
    [AR_REAL16] = { 0.0009765625, -65504, 65504 },
    [AR_ENTERO] = { 1, -2147483648.0, 2147483647.0 }, [AR_I8] = { 1, -128, 127 }, [AR_U8] = { 1, 0, 255 },
    [AR_I16] = { 1, -32768, 32767 }, [AR_U16] = { 1, 0, 65535 }, [AR_U32] = { 1, 0, 4294967295.0 }, [AR_BOOL] = { 1, 0, 1 },
  };
  if (t == AR_I64 || t == AR_U64) return ERR("«%s»: los tipos de 64 bits todavía no están en el ejecutable nativo", f);
  return n_num(L[t][k]);
}
NAT(ar_epsilonTipo) { (void)n; (void)extra; return ar_limite(a, 0, "epsilonTipo"); }
NAT(ar_minimoTipo) { (void)n; (void)extra; return ar_limite(a, 1, "minimoTipo"); }
NAT(ar_maximoTipo) { (void)n; (void)extra; return ar_limite(a, 2, "maximoTipo"); }

/* ═════════════════════════════════════════════ forma y vistas */
NAT(ar_redimensionar) {
  (void)n; (void)extra; ARR_(a[0], 1, "redimensionar");
  NArr* x = AR(a[0]); int64_t f[AR_MAXND]; int nd; NV err;
  if (!ar_forma_de(a[1], "redimensionar", f, &nd, &err)) return err;
  int64_t tn = 1; for (int i = 0; i < nd; i++) tn *= f[i];
  if (tn != ar_tam(x)) {
    NV fx = ar_formas_txt(x->forma, x->nd), fy = ar_formas_txt(f, nd);
    NV e = ERRP(n_texto_utf8("la cuenta de números tiene que ser la misma"), "«redimensionar»: %v son %d números y %v son %d", fx, (long long)ar_tam(x), fy, (long long)tn);
    n_dec(fx); n_dec(fy); return e;
  }
  if (ar_seguida(x)) { int64_t z[AR_MAXND]; ar_zancadas_de(f, nd, z); return ar_vista(x, f, z, nd, 0); }
  NV y = ar_nuevo(f, nd, x->tipo); if (N_FALLO(y)) return y;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) ar_escribir(AR(y), i++, ar_leer(x, p));
  return y;
}
NAT(ar_transpuesta) {
  (void)n; (void)extra; ARRC_(a[0], 1, "transpuesta");
  NArr* x = AR(a[0]); int64_t f[AR_MAXND], z[AR_MAXND];
  for (int i = 0; i < x->nd; i++) { f[i] = x->forma[x->nd - 1 - i]; z[i] = x->zanc[x->nd - 1 - i]; }
  return ar_vista(x, f, z, x->nd, x->desp);
}
NAT(ar_fila) {
  (void)n; (void)extra; ARR_(a[0], 1, "fila"); NUM(a[1], 2, "fila");
  NArr* x = AR(a[0]); double i = trunc(a[1].u.n);
  if (x->nd < 2) return ERRP(msg("este tiene %d", (long long)x->nd), "«fila» necesita un arreglo de 2 dimensiones o más");
  if (i < 0 || i >= (double)x->forma[0]) { NV fx = ar_formas_txt(x->forma, x->nd); NV e = ERR("«fila»: no hay fila %n en un arreglo de %v", i, fx); n_dec(fx); return e; }
  return ar_vista(x, x->forma + 1, x->zanc + 1, x->nd - 1, x->desp + (int64_t)i * x->zanc[0]);
}
NAT(ar_copia) {
  (void)n; (void)extra; ARRC_(a[0], 1, "copia");
  NArr* x = AR(a[0]); NV y = ar_nuevo(x->forma, x->nd, x->tipo); if (N_FALLO(y)) return y;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  if (x->tipo == AR_COMPLEJO) { while (ari_sig(&it, &p)) { ((double*)AR(y)->buf->d)[2 * i] = ((double*)x->buf->d)[2 * p]; ((double*)AR(y)->buf->d)[2 * i + 1] = ((double*)x->buf->d)[2 * p + 1]; i++; } }
  else while (ari_sig(&it, &p)) ar_escribir(AR(y), i++, ar_leer(x, p));
  return y;
}
static NV ar_lista_rec(NArr* x, int d, int64_t base) {
  int64_t cnt = x->forma[d]; NV l = n_lista_nueva(cnt);
  for (int64_t i = 0; i < cnt; i++) {
    if (d == x->nd - 1) n_lista_agregar(LS(l), n_num(ar_leer(x, base + i * x->zanc[d])));
    else n_lista_agregar(LS(l), ar_lista_rec(x, d + 1, base + i * x->zanc[d]));
  }
  return l;
}
NAT(ar_aListaA) {
  (void)n; (void)extra; ARR_(a[0], 1, "aListaA");
  NArr* x = AR(a[0]);
  if (x->nd == 0) return n_lista_nueva(0);
  return ar_lista_rec(x, 0, x->desp);
}
static int ar_indices(NV* a, int n, int desde, int hasta, NArr* x, const char* f, int64_t* pos, NV* err) {
  int cnt = hasta - desde;
  double ix[AR_MAXND + 1];
  for (int k = desde; k < hasta; k++) {
    if (a[k].t != N_NUM) { *err = ERR("«%s»: el argumento %d debe ser un número y es %s", f, (long long)(k + 1), n_tipo_de(a[k])); return 0; }
    if (k - desde < AR_MAXND) ix[k - desde] = trunc(a[k].u.n);
  }
  if (cnt != x->nd) { NV fx = ar_formas_txt(x->forma, x->nd); *err = ERRP(msg("su forma es %v", fx), "«%s»: el arreglo tiene %d dimensiones y llegaron %d índices", f, (long long)x->nd, (long long)cnt); n_dec(fx); return 0; }
  int64_t p = x->desp;
  for (int d = 0; d < cnt; d++) {
    if (ix[d] < 0 || ix[d] >= (double)x->forma[d]) { *err = ERR("«%s»: el índice %n se sale del eje %d, que mide %d", f, ix[d], (long long)d, (long long)x->forma[d]); return 0; }
    p += (int64_t)ix[d] * x->zanc[d];
  }
  (void)n; *pos = p; return 1;
}
NAT(ar_elemento) {
  (void)extra; ARRC_(a[0], 1, "elemento");
  NArr* x = AR(a[0]); int64_t p; NV err;
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("elemento", x->tipo);
  if (!ar_indices(a, n, 1, n, x, "elemento", &p, &err)) return err;
  return n_num(ar_leer(x, p));
}
NAT(ar_ponerElemento) {
  (void)extra; ARRC_(a[0], 1, "ponerElemento");
  NArr* x = AR(a[0]); NV ult = a[n - 1];
  if (ult.t != N_NUM) return ERR("«ponerElemento»: el argumento %d debe ser un número y es %s", (long long)n, n_tipo_de(ult));
  int64_t p; NV err;
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("ponerElemento", x->tipo);
  if (!ar_indices(a, n, 1, n - 1, x, "ponerElemento", &p, &err)) return err;
  if (x->tipo == AR_COMPLEJO) ((double*)x->buf->d)[2 * p] = ult.u.n; else ar_escribir(x, p, ult.u.n);
  return n_inc(a[0]);
}
NAT(ar_aTipo) {
  (void)n; (void)extra; ARRC_(a[0], 1, "aTipo");
  NArr* x = AR(a[0]); int t; NV err;
  if (!ar_tipo_arg(a[1], 1, "aTipo", &t, &err)) return err;
  if (x->tipo == AR_COMPLEJO) return ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada"), "«aTipo» todavía no sabe trabajar con arreglos complejos");
  if (x->tipo == AR_I64 || x->tipo == AR_U64 || t == AR_I64 || t == AR_U64) return ar_error_i64("aTipo", x->tipo == AR_I64 || x->tipo == AR_U64 ? x->tipo : t);
  NV y = ar_nuevo(x->forma, x->nd, t); if (N_FALLO(y)) return y;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  int a_ent = ar_ent_maquina(t) && t != AR_ENTERO && !ar_ent_maquina(x->tipo) && x->tipo != AR_BOOL;
  while (ari_sig(&it, &p)) {
    double v = ar_leer(x, p);
    if (a_ent && !isfinite(v)) { NV r = n_repr(n_num(v), 1); NV e = ERR("«aTipo»: %v no cabe en un %s", r, AR_NOMBRE[t]); n_dec(r); n_dec(y); return e; }
    if (t == AR_REAL16) ((float*)AR(y)->buf->d)[i] = (float)ar_r16((double)(float)v); else ar_escribir(AR(y), i, v);
    i++;
  }
  return y;
}

/* ═════════════════════════════════════════════ comparar y lógica */
#define AR_COMP(nombre, op) NAT(ar_##nombre) { (void)n; (void)extra; return ar_comparar(a[0], a[1], op); }
AR_COMP(mayorQue, 0) AR_COMP(menorQue, 1) AR_COMP(mayorIgualQue, 2) AR_COMP(menorIgualQue, 3) AR_COMP(igualA, 4) AR_COMP(distintoA, 5)
static NV ar_combinar(NArr* x, NV y, int es_y, const char* nombre, int es_o) {
  int64_t f[AR_MAXND]; int nf = 0;
  NArr* Y = es_y ? AR(y) : NULL;
  if (es_y) { if (!ar_difundir(x->forma, x->nd, Y->forma, Y->nd, f, &nf)) return ar_error_difundir(nombre, x, Y); }
  else { nf = x->nd; for (int i = 0; i < nf; i++) f[i] = x->forma[i]; }
  NV out = ar_nuevo(f, nf, AR_BOOL); if (N_FALLO(out)) return out;
  NArr* O = AR(out); int64_t cnt = ar_tam(O);
  if (!es_y) { int k = n_verdad(y); ArIt it; int64_t p, i = 0; ari_ini(&it, x); while (ari_sig(&it, &p)) { int v = ar_leer(x, p) != 0 && 1; ((uint8_t*)O->buf->d)[i++] = (uint8_t)(es_o ? (v || k) : (v && k)); } return out; }
  int64_t zx[AR_MAXND], zy[AR_MAXND]; ar_zanc_dif(x, f, nf, zx); ar_zanc_dif(Y, f, nf, zy);
  int64_t ix[AR_MAXND] = {0};
  for (int64_t k = 0; k < cnt; k++) {
    int64_t px = x->desp, py = Y->desp;
    for (int q = 0; q < nf; q++) { px += ix[q] * zx[q]; py += ix[q] * zy[q]; }
    int u = ar_leer(x, px) != 0, v = ar_leer(Y, py) != 0;
    ((uint8_t*)O->buf->d)[k] = (uint8_t)(es_o ? (u || v) : (u && v));
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}
NAT(ar_yA) { (void)n; (void)extra; ARR_(a[0], 1, "yA"); return ar_combinar(AR(a[0]), a[1], n_es(a[1], NC_ARREGLO), "yA", 0); }
NAT(ar_oA) { (void)n; (void)extra; ARR_(a[0], 1, "oA"); return ar_combinar(AR(a[0]), a[1], n_es(a[1], NC_ARREGLO), "oA", 1); }
static NV fx_no(double x, double* r) { *r = x != 0 ? 0 : 1; return n_nulo(); }
static NV fx_esnan(double x, double* r) { *r = isnan(x) ? 1 : 0; return n_nulo(); }
static NV fx_esfin(double x, double* r) { *r = isfinite(x) ? 1 : 0; return n_nulo(); }
NAT(ar_noA) { (void)n; (void)extra; ARR_(a[0], 1, "noA"); return ar_unaria(AR(a[0]), fx_no, AR_BOOL); }
NAT(ar_esNaN) { (void)n; (void)extra; ARR_(a[0], 1, "esNaN"); return ar_unaria(AR(a[0]), fx_esnan, AR_BOOL); }
NAT(ar_esFinito) { (void)n; (void)extra; ARR_(a[0], 1, "esFinito"); return ar_unaria(AR(a[0]), fx_esfin, AR_BOOL); }
NAT(ar_todos) { (void)n; (void)extra; ARR_(a[0], 1, "todos"); NArr* x = AR(a[0]); ArIt it; int64_t p; ari_ini(&it, x); while (ari_sig(&it, &p)) if (!ar_leer(x, p)) return n_bool(0); return n_bool(1); }
NAT(ar_alguno) { (void)n; (void)extra; ARR_(a[0], 1, "alguno"); NArr* x = AR(a[0]); ArIt it; int64_t p; ari_ini(&it, x); while (ari_sig(&it, &p)) if (ar_leer(x, p)) return n_bool(1); return n_bool(0); }
static NV ar_reducir(NArr* x, double eje_d, int media);
NAT(ar_contarCiertos) {
  (void)extra; ARR_(a[0], 1, "contarCiertos");
  NArr* x = AR(a[0]);
  if (n > 1) { NUM(a[1], 2, "contarCiertos"); if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("contarCiertos", x->tipo); return ar_reducir(x, trunc(a[1].u.n), 2); }
  int64_t c = 0; ArIt it; int64_t p; ari_ini(&it, x); while (ari_sig(&it, &p)) if (ar_leer(x, p)) c++;
  return n_num((double)c);
}

/* ═════════════════════════════════════════════ complejos */
NAT(ar_complejo) {
  (void)extra;
  if (n < 1 || n > 2) return n_error("«complejo» toma la parte real y, si quieres, la imaginaria", NULL);
  NArr* partes[2] = { NULL, NULL }; NV tmp[2] = { n_nulo(), n_nulo() };
  for (int k = 0; k < n; k++) {
    if (n_es(a[k], NC_ARREGLO)) {
      if (AR(a[k])->tipo == AR_COMPLEJO) { for (int j = 0; j < k; j++) n_dec(tmp[j]); return ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada"), "«complejo» todavía no sabe trabajar con arreglos complejos"); }
      partes[k] = AR(a[k]);
    } else {
      if (a[k].t != N_NUM) { NV e = ERR("«complejo»: el argumento %d debe ser un número y es %s", (long long)(k + 1), n_tipo_de(a[k])); for (int j = 0; j < k; j++) n_dec(tmp[j]); return e; }
      int64_t f1[1] = { 1 }; tmp[k] = ar_nuevo(f1, 1, AR_REAL); ((double*)AR(tmp[k])->buf->d)[0] = a[k].u.n; partes[k] = AR(tmp[k]);
    }
  }
  /* re + 0i  [+ im * i], con difusión */
  NArr* re = partes[0]; NArr* im = n > 1 ? partes[1] : NULL;
  int64_t f[AR_MAXND]; int nf;
  if (im) { if (!ar_difundir(re->forma, re->nd, im->forma, im->nd, f, &nf)) { NV e = ar_error_difundir("*", re, im); for (int j = 0; j < n; j++) n_dec(tmp[j]); return e; } }
  else { nf = re->nd; for (int i = 0; i < nf; i++) f[i] = re->forma[i]; }
  NV out = ar_nuevo(f, nf, AR_COMPLEJO);
  if (N_FALLO(out)) { for (int j = 0; j < n; j++) n_dec(tmp[j]); return out; }
  NArr* O = AR(out); int64_t cnt = ar_tam(O); int64_t zr[AR_MAXND], zi[AR_MAXND] = {0}; ar_zanc_dif(re, f, nf, zr); if (im) ar_zanc_dif(im, f, nf, zi);
  int64_t ix[AR_MAXND] = {0}; double* d = (double*)O->buf->d;
  for (int64_t k = 0; k < cnt; k++) {
    int64_t pr = re->desp, pi_ = im ? im->desp : 0;
    for (int q = 0; q < nf; q++) { pr += ix[q] * zr[q]; if (im) pi_ += ix[q] * zi[q]; }
    double r = ar_leer(re, pr), m = im ? ar_leer(im, pi_) : 0;
    /* (r + 0i) + (m + 0i)(0 + 1i) = (r + (m*0 - 0*1)) + (0 + (m*1 + 0*0))i */
    if (im) { double rr = m * 0 - 0 * 1, ii = m * 1 + 0 * 0; d[2 * k] = r + rr; d[2 * k + 1] = 0 + ii; }
    else { d[2 * k] = r + 0; d[2 * k + 1] = 0 + 0; }
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  for (int j = 0; j < n; j++) n_dec(tmp[j]);
  return out;
}
static NV ar_de_complejo(NArr* x, int que /* 0 re 1 im 2 fase 3 módulo */) {
  NV out = ar_nuevo(x->forma, x->nd, AR_REAL); if (N_FALLO(out)) return out;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x); double* d = (double*)AR(out)->buf->d; const double* s = (const double*)x->buf->d;
  while (ari_sig(&it, &p)) { double re = s[2 * p], im = s[2 * p + 1]; d[i++] = que == 0 ? re : que == 1 ? im : que == 2 ? atan2(im, re) : js_hypot2(re, im); }
  return out;
}
static NV fx_copia(double x, double* r) { *r = x; return n_nulo(); }
NAT(ar_parteReal) {
  (void)n; (void)extra; ARRC_(a[0], 1, "parteReal"); NArr* x = AR(a[0]);
  if (x->tipo != AR_COMPLEJO) return ar_unaria(x, fx_copia, -2);
  return ar_de_complejo(x, 0);
}
NAT(ar_parteImaginaria) {
  (void)n; (void)extra; ARRC_(a[0], 1, "parteImaginaria"); NArr* x = AR(a[0]);
  if (x->tipo != AR_COMPLEJO) return ar_nuevo(x->forma, x->nd, AR_REAL);
  return ar_de_complejo(x, 1);
}
NAT(ar_conjugado) {
  (void)n; (void)extra; ARRC_(a[0], 1, "conjugado"); NArr* x = AR(a[0]);
  if (x->tipo != AR_COMPLEJO) return ERRP(n_texto_utf8("conviértelo con complejo(a)"), "«conjugado» necesita un arreglo complejo");
  NV out = ar_nuevo(x->forma, x->nd, AR_COMPLEJO); if (N_FALLO(out)) return out;
  ArIt it; int64_t p, i = 0; ari_ini(&it, x); double* d = (double*)AR(out)->buf->d; const double* s = (const double*)x->buf->d;
  while (ari_sig(&it, &p)) { d[2 * i] = s[2 * p]; d[2 * i + 1] = -s[2 * p + 1]; i++; }
  return out;
}
NAT(ar_fase) {
  (void)n; (void)extra; ARRC_(a[0], 1, "fase"); NArr* x = AR(a[0]);
  if (x->tipo != AR_COMPLEJO) return ERRP(n_texto_utf8("conviértelo con complejo(a)"), "«fase» necesita un arreglo complejo");
  return ar_de_complejo(x, 2);
}
NAT(ar_desdePolar) {
  (void)n; (void)extra; ARR_(a[0], 1, "desdePolar"); ARR_(a[1], 2, "desdePolar");
  NArr *m = AR(a[0]), *fa = AR(a[1]); int64_t f[AR_MAXND]; int nf;
  if (!ar_difundir(m->forma, m->nd, fa->forma, fa->nd, f, &nf)) return ar_error_difundir("desdePolar", m, fa);
  NV out = ar_nuevo(f, nf, AR_COMPLEJO); if (N_FALLO(out)) return out;
  int64_t cnt = ar_tam(AR(out)), zm[AR_MAXND], zf[AR_MAXND], ix[AR_MAXND] = {0}; ar_zanc_dif(m, f, nf, zm); ar_zanc_dif(fa, f, nf, zf);
  double* d = (double*)AR(out)->buf->d;
  for (int64_t k = 0; k < cnt; k++) {
    int64_t pm = m->desp, pf = fa->desp;
    for (int q = 0; q < nf; q++) { pm += ix[q] * zm[q]; pf += ix[q] * zf[q]; }
    double mo = ar_leer(m, pm), ang = ar_leer(fa, pf);
    d[2 * k] = mo * fd_cos(ang); d[2 * k + 1] = mo * fd_sin(ang);
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  return out;
}

/* ═════════════════════════════════════════════ el arreglo dentro del resto del runtime */
/* Number(x.toPrecision(p)): JavaScript redondea los empates exactos hacia arriba y printf al par */
static double ar_to_precision(double x, int p) {
  char b[128]; snprintf(b, sizeof b, "%.40e", x);
  int neg = b[0] == '-'; const char* q = b + neg; char dig[64] = {0}; int nd = 0;
  for (; *q && *q != 'e'; q++) if (*q != '.') dig[nd++] = *q;
  int e10 = atoi(q + 1);
  if (nd > p) {
    int arriba = dig[p] >= '5'; nd = p;
    if (arriba) {
      int i = p - 1;
      while (i >= 0 && dig[i] == '9') { dig[i] = '0'; i--; }
      if (i < 0) { dig[0] = '1'; for (int k = 1; k < p; k++) dig[k] = '0'; e10++; } else dig[i]++;
    }
  }
  char s2[128]; int o = 0;
  if (neg) s2[o++] = '-';
  s2[o++] = dig[0]; if (nd > 1) { s2[o++] = '.'; for (int k = 1; k < nd; k++) s2[o++] = dig[k]; }
  snprintf(s2 + o, sizeof s2 - (size_t)o, "e%d", e10);
  return strtod(s2, NULL);
}
static NV ar_cmp_corto(double x, int tipo) {   /* el número con los dígitos más cortos que vuelven al mismo valor EN ESE TIPO */
  if (!isfinite(x) || x == trunc(x)) return n_num(x);
  int hasta = tipo == AR_REAL16 ? 5 : 9;
  for (int p = 1; p <= hasta; p++) {
    double v = ar_to_precision(x, p);
    double r = tipo == AR_REAL16 ? ar_r16(v) : (double)(float)v;
    if (r == x) return n_num(v);
  }
  return n_num(x);
}
static void ar_repr_num(NBuf* b, NArr* x, int64_t p) {
  if (x->tipo == AR_COMPLEJO) {
    double re = ((double*)x->buf->d)[2 * p], im = ((double*)x->buf->d)[2 * p + 1];
    NV a1 = n_repr(n_num(re), 1); b_txt(b, a1); n_dec(a1);
    b_c(b, im < 0 ? '-' : '+');
    NV a2 = n_repr(n_num(fabs(im)), 1); b_txt(b, a2); n_dec(a2); b_c(b, 'i'); return;
  }
  double v = ar_leer(x, p);
  if (x->tipo == AR_BOOL) { b_utf8(b, v ? "cierto" : "falso"); return; }
  if (x->tipo == AR_REAL32 || x->tipo == AR_REAL16) { NV c = ar_cmp_corto(v, x->tipo); NV r = n_repr(c, 1); b_txt(b, r); n_dec(r); return; }
  if (ar_ent_maquina(x->tipo)) { char nb[64]; num_js(v, nb); b_utf8(b, nb); return; }
  NV r = n_repr(n_num(v), 1); b_txt(b, r); n_dec(r);
}
static void ar_repr_eje(NBuf* b, NArr* x, int d, int64_t base) {
  int64_t n = x->forma[d], z = x->zanc[d]; const int BORDE = 3;
  int ultimo = d == x->nd - 1; const char* sep = ultimo ? ", " : ",\n ";
  b_c(b, '[');
  if (n <= BORDE * 2 + 1) {
    for (int64_t i = 0; i < n; i++) { if (i) b_utf8(b, sep); if (ultimo) ar_repr_num(b, x, base + i * z); else ar_repr_eje(b, x, d + 1, base + i * z); }
  } else {
    for (int64_t i = 0; i < BORDE; i++) { if (i) b_utf8(b, sep); if (ultimo) ar_repr_num(b, x, base + i * z); else ar_repr_eje(b, x, d + 1, base + i * z); }
    b_utf8(b, sep); b_c(b, 0x2026);
    for (int64_t i = n - BORDE; i < n; i++) { b_utf8(b, sep); if (ultimo) ar_repr_num(b, x, base + i * z); else ar_repr_eje(b, x, d + 1, base + i * z); }
  }
  b_c(b, ']');
}
static void ar_repr(NBuf* b, NV v, int prof) {
  NArr* x = AR(v);
  NBuf cab = {0}; b_utf8(&cab, "arreglo "); NV f = ar_formas_txt(x->forma, x->nd); b_txt(&cab, f); n_dec(f); b_utf8(&cab, " de "); b_utf8(&cab, AR_NOMBRE[x->tipo]);
  if (ar_tam(x) == 0) { b_c(b, '<'); for (int64_t i = 0; i < cab.n; i++) b_c(b, cab.s[i]); b_utf8(b, ", vacío>"); free(cab.s); return; }
  if (prof > 3) { b_c(b, '<'); for (int64_t i = 0; i < cab.n; i++) b_c(b, cab.s[i]); b_c(b, '>'); free(cab.s); return; }
  for (int64_t i = 0; i < cab.n; i++) b_c(b, cab.s[i]);
  free(cab.s);
  b_c(b, 10);
  ar_repr_eje(b, x, 0, x->desp);
}
static NV ar_len(NV o) {
  NArr* x = AR(o);
  if (x->nd == 0) return ERRP(n_texto_utf8("es un solo número: sácalo con elemento(a)"), "un arreglo de 0 dimensiones no tiene longitud");
  return n_num((double)x->forma[0]);
}
static int ar_iguales(NV a, NV b) {
  NArr *x = AR(a), *y = AR(b);
  if (x->nd != y->nd) return 0;
  for (int i = 0; i < x->nd; i++) if (x->forma[i] != y->forma[i]) return 0;
  ArIt i1, i2; int64_t p, q; ari_ini(&i1, x); ari_ini(&i2, y);
  while (ari_sig(&i1, &p) && ari_sig(&i2, &q)) if (ar_leer(x, p) != ar_leer(y, q)) return 0;   /* un NaN nunca es igual a otro */
  return 1;
}
static int ar_indice(NArr* x, NV i, int64_t* k, NV* err) {
  if (i.t != N_NUM || i.u.n != trunc(i.u.n) || !isfinite(i.u.n)) { *err = i.t == N_NUM ? ERR("el índice de un arreglo debe ser un entero y es %j", i.u.n) : ERR("el índice de un arreglo debe ser un entero y es %s", n_tipo_de(i)); return 0; }
  if (x->tipo == AR_COMPLEJO) { *err = ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto"), "a[i] todavía no sabe trabajar con arreglos complejos"); return 0; }
  if (x->nd == 0) { *err = ERRP(n_texto_utf8("es un solo número: sácalo con elemento(a)"), "un arreglo de 0 dimensiones no se indexa"); return 0; }
  int64_t n = x->forma[0]; double kk = i.u.n < 0 ? (double)n + i.u.n : i.u.n;
  if (kk < 0 || kk >= (double)n) {
    NV pista = n ? msg("los índices válidos van de 0 a %d, o de -1 a -%d", (long long)(n - 1), (long long)n) : n_texto_utf8("el arreglo está vacío");
    *err = ERRP(pista, "índice %n fuera de rango (el eje 0 del arreglo mide %d)", i.u.n, (long long)n); return 0;
  }
  *k = (int64_t)kk; return 1;
}
static NV ar_idx_get(NV o, NV i) {
  NArr* x = AR(o); int64_t k; NV err;
  if (!ar_indice(x, i, &k, &err)) return err;
  if (x->nd == 1) { if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("a[i]", x->tipo); return n_num(ar_leer(x, x->desp + k * x->zanc[0])); }
  return ar_vista(x, x->forma + 1, x->zanc + 1, x->nd - 1, x->desp + k * x->zanc[0]);
}
static NV ar_idx_set(NV o, NV i, NV v) {
  NArr* x = AR(o); int64_t k; NV err;
  if (!ar_indice(x, i, &k, &err)) return err;
  if (x->nd != 1) return ERRP(n_texto_utf8("baja hasta el número: a[i][j] = v"), "a[%n] = … solo vale en un arreglo de 1 dimensión y este tiene %d", i.u.n, (long long)x->nd);
  double val;
  if (v.t == N_BOOL && x->tipo == AR_BOOL) val = v.u.b ? 1 : 0;
  else if (v.t == N_NUM) val = v.u.n;
  else return ERR("«a[i] =»: el argumento 2 debe ser un número y es %s", n_tipo_de(v));
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ar_error_i64("a[i] =", x->tipo);
  ar_escribir(x, x->desp + k * x->zanc[0], val);
  return n_nulo();
}

/* ═════════════════════════════════════════════ las funciones de números que ya existían, ahora con arreglos */
/* una lista nueva con los números de un arreglo, para las que trabajan con listas (exigeNums) */
static NV ar_a_lista_nums(NArr* x) {
  NV l = n_lista_nueva(ar_tam(x)); ArIt it; int64_t p; ari_ini(&it, x);
  while (ari_sig(&it, &p)) n_lista_agregar(LS(l), n_num(ar_leer(x, p)));
  return l;
}
static NV ar_ring[64]; static int ar_ring_n = 0;
/* a[k] pasa a ser una lista si era un arreglo (la lista vive unas cuantas llamadas más, y luego se suelta) */
static int ar_nums_puerta(NV* slot, int k, const char* f, NV* err) {
  if (n_es(*slot, NC_ARREGLO)) {
    NArr* x = AR(*slot);
    if (x->tipo == AR_I64 || x->tipo == AR_U64) { *err = ar_error_i64(f, x->tipo); return 0; }
    if (x->tipo == AR_COMPLEJO) { *err = ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada"), "«%s» todavía no sabe trabajar con arreglos complejos", f); return 0; }
    NV l = ar_a_lista_nums(x);
    n_dec(ar_ring[ar_ring_n]); ar_ring[ar_ring_n] = l; ar_ring_n = (ar_ring_n + 1) & 63;
    *slot = l;
  }
  return exige_nums(*slot, k, f, err);
}

/* ── una función de números aplicada a todo el arreglo (m1 de numerico: seno, raiz, piso…) ── */
static double (*ar_fx_actual)(double);
static int ar_dom_actual;           /* 0 sin dominio · 1 error si x < 0 (raíz) · 2 error si x <= 0 (log) */
static const char* ar_msg_actual;
static NV ar_fx_adapt(double x, double* r) {
  if (ar_dom_actual == 1 && x < 0) return n_error(ar_msg_actual, NULL);
  if (ar_dom_actual == 2 && x <= 0) return n_error(ar_msg_actual, NULL);
  *r = ar_fx_actual(x); return n_nulo();
}
static NV ar_nada_de_complejos(NArr* x) {   /* nadaDeComplejos(x, null) de la VM */
  if (x->tipo == AR_I64 || x->tipo == AR_U64) return ERRP(n_texto_utf8("pásalo antes con aTipo(a, \"real\") —exacto hasta 2^53— o a un entero más pequeño"), "esta operación todavía no trabaja con arreglos %s", AR_NOMBRE[x->tipo]);
  return ERRP(n_texto_utf8("pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada"), "esta operación todavía no sabe trabajar con arreglos complejos");
}
static NV ar_lift(NV xv, double (*fx)(double), int ret_ent, int dominio, const char* msgdom, int mod_complejo) {
  NArr* x = AR(xv);
  if (x->tipo == AR_COMPLEJO && mod_complejo) return ar_de_complejo(x, 3);
  if (x->tipo == AR_COMPLEJO || x->tipo == AR_I64 || x->tipo == AR_U64) return ar_nada_de_complejos(x);
  ar_fx_actual = fx; ar_dom_actual = dominio; ar_msg_actual = msgdom;
  return ar_unaria(x, ar_fx_adapt, ret_ent ? AR_ENTERO : -2);
}

/* ── reducir a lo largo de un eje (suma(a, eje), media(a, eje)) ── */
static NV ar_reducir(NArr* x, double eje_d, int media) {
  double e = trunc(eje_d); if (e < 0) e += (double)x->nd;
  if (e < 0 || e >= (double)x->nd || isnan(e)) {
    NV fx = ar_formas_txt(x->forma, x->nd);
    NV pista = x->nd == 1 ? n_texto_utf8("este arreglo tiene un solo eje, el 0") : msg("los ejes van de 0 a %d, y −1 es el último", (long long)(x->nd - 1));
    NV r = ERRP(pista, "«reducir»: el eje %n no existe en un arreglo de %v", eje_d, fx); n_dec(fx); return r;
  }
  int ee = (int)e; int64_t f[AR_MAXND]; int64_t zr[AR_MAXND]; int nf = 0;
  for (int i = 0; i < x->nd; i++) if (i != ee) { f[nf] = x->forma[i]; zr[nf] = x->zanc[i]; nf++; }
  int tipo = media == 2 ? AR_ENTERO : media ? AR_REAL : (x->tipo == AR_ENTERO ? AR_ENTERO : AR_REAL);
  int64_t uno[1] = { 1 };
  NV out = ar_nuevo(nf ? f : uno, nf ? nf : 1, tipo); if (N_FALLO(out)) return out;
  int64_t largo = x->forma[ee], zEje = x->zanc[ee], total = ar_tam(AR(out)); int64_t ix[AR_MAXND] = {0};
  for (int64_t k = 0; k < total; k++) {
    int64_t base = x->desp;
    if (nf) for (int q = 0; q < nf; q++) base += ix[q] * zr[q];
    double acc = 0;
    if (media == 2) { for (int64_t j = 0; j < largo; j++) { double v = ar_leer(x, base + j * zEje); if (v != 0 && v == v) acc += 1; } }   /* contarCiertos(mascara, eje) */
    else for (int64_t j = 0; j < largo; j++) acc += ar_leer(x, base + j * zEje);
    ar_escribir(AR(out), k, media == 1 ? acc / (double)largo : acc);
    for (int q = nf - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
  }
  if (!nf) { double r = ar_leer(AR(out), 0); n_dec(out); return n_num(r); }
  return out;
}

static NV ar_reducir_pub(NV x, double eje, int media) {
  NV e; if (!ar_puerta(x, 1, media ? "media" : "suma", &e, 0)) return e;
  if (AR(x)->tipo == AR_I64 || AR(x)->tipo == AR_U64) return ar_error_i64(media ? "media" : "suma", AR(x)->tipo);
  return ar_reducir(AR(x), eje, media);
}

#define NAT_ARREGLO \
  { "numerico/arreglo", -1, ar_arreglo }, { "numerico/ceros", -1, ar_ceros }, { "numerico/unos", -1, ar_unos }, { "numerico/lleno", -1, ar_lleno }, \
  { "numerico/secuencia", -1, ar_secuencia }, { "numerico/reparto", -1, ar_reparto }, { "numerico/azarArreglo", -1, ar_azarArreglo }, \
  { "numerico/forma", 1, ar_forma }, { "numerico/dimensiones", 1, ar_dimensiones }, { "numerico/tamano", 1, ar_tamano }, { "numerico/tipoArreglo", 1, ar_tipoArreglo }, \
  { "numerico/epsilonTipo", 1, ar_epsilonTipo }, { "numerico/minimoTipo", 1, ar_minimoTipo }, { "numerico/maximoTipo", 1, ar_maximoTipo }, { "numerico/esVista", 1, ar_esVista }, \
  { "numerico/redimensionar", -1, ar_redimensionar }, { "numerico/transpuesta", 1, ar_transpuesta }, { "numerico/fila", 2, ar_fila }, { "numerico/copia", 1, ar_copia }, \
  { "numerico/aListaA", 1, ar_aListaA }, { "numerico/elemento", -1, ar_elemento }, { "numerico/ponerElemento", -1, ar_ponerElemento }, { "numerico/aTipo", 2, ar_aTipo }, \
  { "numerico/mayorQue", 2, ar_mayorQue }, { "numerico/menorQue", 2, ar_menorQue }, { "numerico/mayorIgualQue", 2, ar_mayorIgualQue }, { "numerico/menorIgualQue", 2, ar_menorIgualQue }, \
  { "numerico/igualA", 2, ar_igualA }, { "numerico/distintoA", 2, ar_distintoA }, { "numerico/yA", -1, ar_yA }, { "numerico/oA", -1, ar_oA }, { "numerico/noA", 1, ar_noA }, \
  { "numerico/esNaN", 1, ar_esNaN }, { "numerico/esFinito", 1, ar_esFinito }, { "numerico/todos", -1, ar_todos }, { "numerico/alguno", -1, ar_alguno }, \
  { "numerico/contarCiertos", -1, ar_contarCiertos }, { "numerico/vacio", -1, ar_vacio }, { "numerico/complejo", -1, ar_complejo }, { "numerico/parteReal", 1, ar_parteReal }, \
  { "numerico/parteImaginaria", 1, ar_parteImaginaria }, { "numerico/conjugado", 1, ar_conjugado }, { "numerico/fase", 1, ar_fase }, { "numerico/desdePolar", 2, ar_desdePolar }, \
  { "numerico/esComplejo", 1, ar_esComplejo },
