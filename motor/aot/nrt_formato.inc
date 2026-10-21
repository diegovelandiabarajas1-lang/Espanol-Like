/* ============================================================================
 *  Ñ sin runtime — el eDSL «formato» (src/07-edsl-formato.js), en C.
 *  Se incluye desde nrt.c, después de nrt_texto.inc y nrt_numerico.inc (usa
 *  sus piezas: sub16, split_js, mayusculas, recortar_js, round_js…).
 *
 *  Lo delicado es Number.prototype.toFixed: JavaScript redondea el valor EXACTO
 *  del double y, si cae justo en la mitad, hacia arriba (0.5 → «1», 2.5 → «3»,
 *  0.125 con 2 → «0.13»); printf de C redondea la mitad a par y en Windows ni
 *  siquiera ve el valor exacto. Así que aquí se hace a mano con un entero
 *  grande pequeño: m·10^f·2^e, exacto, y se redondea con el bit de la mitad.
 * ========================================================================== */

#include <ctype.h>

/* ── toFixed exacto ─────────────────────────────────────────────────────── */
#define FX_L 96   /* 3072 bits: m·10^100·2^70 y m·5^1074 caben de sobra */
typedef struct { uint32_t d[FX_L]; int n; } FxBig;   /* binario, menos significativo primero */
static void fx_mul(FxBig* x, uint32_t k) {
  uint64_t c = 0;
  for (int i = 0; i < x->n; i++) { uint64_t t = (uint64_t)x->d[i] * k + c; x->d[i] = (uint32_t)t; c = t >> 32; }
  if (c && x->n < FX_L) x->d[x->n++] = (uint32_t)c;
}
static void fx_shl(FxBig* x, int k) {
  int w = k / 32, b = k % 32;
  if (w) { for (int i = x->n - 1; i >= 0; i--) if (i + w < FX_L) x->d[i + w] = x->d[i]; for (int i = 0; i < w && i < FX_L; i++) x->d[i] = 0; x->n += w; if (x->n > FX_L) x->n = FX_L; }
  if (b) { uint32_t c = 0; for (int i = 0; i < x->n; i++) { uint32_t t = x->d[i]; x->d[i] = (t << b) | c; c = t >> (32 - b); } if (c && x->n < FX_L) x->d[x->n++] = c; }
}
static int fx_bit(const FxBig* x, int k) { int w = k / 32; return w < x->n ? (int)((x->d[w] >> (k % 32)) & 1) : 0; }
static void fx_shr(FxBig* x, int k) {
  int w = k / 32, b = k % 32;
  if (w >= x->n) { x->n = 0; return; }
  for (int i = 0; i + w < x->n; i++) x->d[i] = x->d[i + w];
  x->n -= w;
  if (b) { for (int i = 0; i < x->n; i++) x->d[i] = (x->d[i] >> b) | (i + 1 < x->n ? x->d[i + 1] << (32 - b) : 0); }
  while (x->n && !x->d[x->n - 1]) x->n--;
}
static void fx_inc(FxBig* x) {
  for (int i = 0; i < x->n; i++) { if (++x->d[i]) return; }
  if (x->n < FX_L) x->d[x->n++] = 1;
}
static uint32_t fx_divmod(FxBig* x, uint32_t k) {   /* x /= k, devuelve el resto */
  uint64_t r = 0;
  for (int i = x->n - 1; i >= 0; i--) { uint64_t t = (r << 32) | x->d[i]; x->d[i] = (uint32_t)(t / k); r = t % k; }
  while (x->n && !x->d[x->n - 1]) x->n--;
  return (uint32_t)r;
}
static int fx_digitos(double dec) {   /* ToIntegerOrInfinity, y el tope de toFixed */
  if (isnan(dec)) return 0;
  dec = trunc(dec);
  if (dec < 0) return 0;
  if (dec > 100) return 100;
  return (int)dec;
}
/* Number.prototype.toFixed(f). Devuelve memoria que hay que liberar. */
static char* tofixed_js(double x, int f) {
  char* o = (char*)n_mem(160);
  if (!isfinite(x) || fabs(x) >= 1e21) { num_js(x, o); return o; }
  char* p = o;
  if (x < 0) { *p++ = '-'; x = -x; }
  int e2 = 0; double fr = frexp(x, &e2);
  uint64_t m = x == 0 ? 0 : (uint64_t)ldexp(fr, 53);
  int e = e2 - 53;
  FxBig N; memset(&N, 0, sizeof N);
  N.d[0] = (uint32_t)m; N.d[1] = (uint32_t)(m >> 32); N.n = N.d[1] ? 2 : (N.d[0] ? 1 : 0);
  for (int i = 0; i < f; i++) fx_mul(&N, 10);
  if (e >= 0) fx_shl(&N, e);
  else { int arriba = fx_bit(&N, -e - 1); fx_shr(&N, -e); if (arriba) fx_inc(&N); }
  char dig[200]; int k = 0;
  while (N.n) { uint32_t r = fx_divmod(&N, 1000000000u); for (int i = 0; i < 9; i++) { dig[k++] = (char)('0' + r % 10); r /= 10; } }
  while (k > 0 && dig[k - 1] == '0') k--;
  while (k < f + 1) dig[k++] = '0';
  for (int i = k - 1; i >= 0; i--) { if (i == f - 1) *p++ = '.'; *p++ = dig[i]; }
  *p = 0;
  return o;
}

/* Los dígitos EXACTOS de un double finito y positivo: x = D · 10^P, con D
   entero sin ceros delante (m·2^e; si e < 0, m·5^-e · 10^e). Devuelve cuántos. */
static int exactos_js(double x, char* dig, int* P) {
  int e2 = 0; double fr = frexp(x, &e2);
  uint64_t m = (uint64_t)ldexp(fr, 53); int e = e2 - 53;
  FxBig N; memset(&N, 0, sizeof N);
  N.d[0] = (uint32_t)m; N.d[1] = (uint32_t)(m >> 32); N.n = N.d[1] ? 2 : (N.d[0] ? 1 : 0);
  if (e >= 0) { fx_shl(&N, e); *P = 0; } else { for (int i = 0; i < -e; i++) fx_mul(&N, 5); *P = e; }
  char tmp[900]; int k = 0;
  while (N.n) { uint32_t r = fx_divmod(&N, 1000000000u); for (int i = 0; i < 9; i++) { tmp[k++] = (char)('0' + r % 10); r /= 10; } }
  while (k > 1 && tmp[k - 1] == '0') k--;
  for (int i = 0; i < k; i++) dig[i] = tmp[k - 1 - i];
  dig[k] = 0;
  return k;
}
/* Number.prototype.toPrecision(p), 1 ≤ p ≤ 100: la mitad, hacia arriba. */
static void toprecision_js(double x, int p, char* out) {
  if (!isfinite(x)) { num_js(x, out); return; }
  char* o = out;
  if (x < 0) { *o++ = '-'; x = -x; }
  char a[128]; int e;
  if (x == 0) { for (int i = 0; i < p; i++) a[i] = '0'; e = 0; }
  else {
    char d[900]; int P, k = exactos_js(x, d, &P);
    e = k - 1 + P;
    if (k > p) {
      int sube = d[p] >= '5';
      for (int i = 0; i < p; i++) a[i] = d[i];
      if (sube) {
        int i = p - 1;
        while (i >= 0 && a[i] == '9') a[i--] = '0';
        if (i >= 0) a[i]++; else { a[0] = '1'; for (int j = 1; j < p; j++) a[j] = '0'; e++; }
      }
    } else { for (int i = 0; i < k; i++) a[i] = d[i]; for (int i = k; i < p; i++) a[i] = '0'; }
  }
  a[p] = 0;
  if (e < -6 || e >= p) {
    *o++ = a[0];
    if (p > 1) { *o++ = '.'; memcpy(o, a + 1, (size_t)(p - 1)); o += p - 1; }
    sprintf(o, "e%c%d", e >= 0 ? '+' : '-', e >= 0 ? e : -e);
    return;
  }
  if (e == p - 1) { memcpy(o, a, (size_t)p); o[p] = 0; return; }
  if (e >= 0) { memcpy(o, a, (size_t)(e + 1)); o += e + 1; *o++ = '.'; memcpy(o, a + e + 1, (size_t)(p - e - 1)); o[p - e - 1] = 0; return; }
  *o++ = '0'; *o++ = '.';
  for (int i = 0; i < -(e + 1); i++) *o++ = '0';
  memcpy(o, a, (size_t)p); o[p] = 0;
}

/* ── los ajustes: separador de miles, coma decimal y moneda ─────────────── */
static NV fo_miles, fo_decimal, fo_moneda; static int fo_listo;
static void fo_conf(void) {
  if (fo_listo) return;
  fo_listo = 1; fo_miles = T("."); fo_decimal = T(","); fo_moneda = T("$");
}
static double js_max2(double a, double b) { if (isnan(a) || isnan(b)) return NAN; if (a == 0 && b == 0) return signbit(a) ? b : a; return a > b ? a : b; }
static double js_min2(double a, double b) { if (isnan(a) || isnan(b)) return NAN; if (a == 0 && b == 0) return signbit(a) ? a : b; return a < b ? a : b; }
static int js_si(double x) { return x != 0 && !isnan(x); }          /* un número como condición */
static int js_es_entero(double x) { return isfinite(x) && x == trunc(x); }   /* Number.isInteger */

/* fmt(x, dec): agrupa la parte entera y pone la coma decimal */
static void fo_fmt_en(NBuf* b, double x, double dec) {
  fo_conf();
  int neg = x < 0 || (x == 0 && signbit(x));
  char* s = tofixed_js(fabs(x), fx_digitos(dec));
  char* pt = strchr(s, '.');
  size_t ne = pt ? (size_t)(pt - s) : strlen(s);
  if (neg) b_c(b, '-');
  size_t pri = ne > 3 ? ((ne - 1) % 3) + 1 : ne;
  for (size_t i = 0; i < pri; i++) b_c(b, (uint16_t)(unsigned char)s[i]);
  for (size_t i = pri; i < ne; i += 3) { b_txt(b, fo_miles); for (size_t j = i; j < i + 3; j++) b_c(b, (uint16_t)(unsigned char)s[j]); }
  if (pt && pt[1]) { b_txt(b, fo_decimal); b_utf8(b, pt + 1); }
  free(s);
}
static NV fo_fmt(double x, double dec) { NBuf b = {0}; fo_fmt_en(&b, x, dec); return b_texto(&b); }
/* decNat: los decimales que el número ya tiene (hasta 6) */
static double fo_decnat(double x) {
  if (js_es_entero(x)) return 0;
  char s[64]; num_js(x, s);
  char* p = strchr(s, '.');
  if (!p) return 0;
  double k = (double)strlen(p + 1);
  return k < 6 ? k : 6;
}
/* String(v) de JavaScript para los valores de Ñ */
static NV fo_string(NV v) {
  if (n_es(v, NC_TEXTO)) return n_inc(v);
  char s[64];
  if (v.t == N_NUM) { num_js(v.u.n, s); return T(s); }
  if (v.t == N_BOOL) return T(v.u.b ? "true" : "false");
  if (v.t == N_NULO) return T("null");
  return T("[object Object]");
}

/* ── el ancho visible: sin los códigos de color ANSI (\x1b[…m) ──────────── */
static int64_t ansi_en(const NTexto* t, int64_t i) {   /* fin del código que empieza en i, o -1 */
  if (t->s[i] != 0x1B || i + 1 >= t->n || t->s[i + 1] != '[') return -1;
  int64_t k = i + 2;
  while (k < t->n && ((t->s[k] >= '0' && t->s[k] <= '9') || t->s[k] == ';')) k++;
  return k < t->n && t->s[k] == 'm' ? k + 1 : -1;
}
static NV sin_ansi(NV s) {
  NTexto* t = TX(s); NBuf b = {0};
  for (int64_t i = 0; i < t->n;) { int64_t j = ansi_en(t, i); if (j > 0) { i = j; continue; } b_c(&b, t->s[i]); i++; }
  return b_texto(&b);
}
static int tiene_ansi(NV s) { NTexto* t = TX(s); for (int64_t i = 0; i < t->n; i++) if (ansi_en(t, i) > 0) return 1; return 0; }
static int64_t ancho_vis(NV s) {
  NTexto* t = TX(s); int64_t w = 0;
  for (int64_t i = 0; i < t->n;) { int64_t j = ansi_en(t, i); if (j > 0) { i = j; continue; } w++; i++; }
  return w;
}
static void b_rep(NBuf* b, uint16_t c, double k) { if (!(k > 0)) return; if (k > 1e8) k = 1e8; for (int64_t i = 0; i < (int64_t)k; i++) b_c(b, c); }
static void b_ciclo(NBuf* b, NV c, double k) {   /* c.repeat(…).slice(0, k): las primeras k unidades */
  NTexto* t = TX(c); if (!(k > 0) || !t->n) return; if (k > 1e8) k = 1e8;
  for (int64_t i = 0; i < (int64_t)k; i++) b_c(b, t->s[i % t->n]);
}
static void b_rellenar(NBuf* b, NV s, double n) { b_rep(b, ' ', n - (double)ancho_vis(s)); }
static NV fo_como_texto(NV v) { return n_texto_de(v); }   /* el texto tal cual; lo demás, repr(v, 1) */
#define FA(k) ((k) < n ? a[k] : n_nulo())
#define FNUM(var, k, f) double var; do { NV v_ = FA(k), e_; if (!exige_num(v_, (k) + 1, f, &e_)) return e_; var = v_.u.n; } while (0)
#define FENT(var, k, f) FNUM(var, k, f); var = trunc(var)
#define FTXT(k, f) do { NV v_ = FA(k), e_; if (!exige_texto(v_, (k) + 1, f, &e_)) return e_; } while (0)

/* ── en letras ───────────────────────────────────────────────────────────── */
static const char* const UNO_15[] = { "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince" };
static const char* const DIECI[] = { "dieciséis", "diecisiete", "dieciocho", "diecinueve" };
static const char* const VEINTI[] = { "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
  "veintiséis", "veintisiete", "veintiocho", "veintinueve" };
static const char* const DECENAS[] = { "", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa" };
static const char* const CIENTOS[] = { "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos" };
static int fin_con(const char* s, const char* f) { size_t a = strlen(s), b = strlen(f); return a >= b && strcmp(s + a - b, f) == 0; }
static void centenas_letras(int n, int apocope, char* out) {
  if (n == 100) { strcpy(out, "cien"); return; }
  out[0] = 0;
  int c = n / 100, r = n % 100;
  if (c) strcpy(out, CIENTOS[c]);
  if (r) {
    char t[80];
    if (r <= 15) strcpy(t, UNO_15[r]);
    else if (r <= 19) strcpy(t, DIECI[r - 16]);
    else if (r <= 29) strcpy(t, VEINTI[r - 20]);
    else { strcpy(t, DECENAS[r / 10]); if (r % 10) { strcat(t, " y "); strcat(t, UNO_15[r % 10]); } }
    if (apocope) {
      if (fin_con(t, "veintiuno")) strcpy(t + strlen(t) - 9, "veintiún");
      size_t L = strlen(t);
      if (fin_con(t, "uno") && (L == 3 || !(isalnum((unsigned char)t[L - 4]) || t[L - 4] == '_'))) t[L - 1] = 0;
    }
    if (out[0]) strcat(out, " ");
    strcat(out, t);
  }
}
static void entero_letras(double n, char* out);
static void centenas_largo(double n, int apocope, char* out) { if (n <= 999) centenas_letras((int)n, apocope, out); else entero_letras(n, out); }
static void entero_letras(double n, char* out) {
  if (n == 0) { strcpy(out, "cero"); return; }
  if (n < 0) { strcpy(out, "menos "); entero_letras(-n, out + 6); return; }
  double bill = floor(n / 1e12); n = fmod(n, 1e12);
  double mill = floor(n / 1e6); n = fmod(n, 1e6);
  double mil = floor(n / 1e3); n = fmod(n, 1e3);
  char t[400]; out[0] = 0;
#define FO_PARTE(s) do { if (out[0]) strcat(out, " "); strcat(out, s); } while (0)
  if (js_si(bill)) { if (bill == 1) FO_PARTE("un billón"); else { entero_letras(bill, t); strcat(t, " billones"); FO_PARTE(t); } }
  if (js_si(mill)) { if (mill == 1) FO_PARTE("un millón"); else { centenas_largo(mill, 1, t); strcat(t, " millones"); FO_PARTE(t); } }
  if (js_si(mil)) { if (mil == 1) FO_PARTE("mil"); else { centenas_largo(mil, 1, t); strcat(t, " mil"); FO_PARTE(t); } }
  if (js_si(n)) { centenas_letras((int)n, 0, t); FO_PARTE(t); }
#undef FO_PARTE
}

/* ── las funciones ─────────────────────────────────────────────────────── */
NAT(fo_numero) { (void)n; (void)extra; NUM(a[0], 1, "numero"); return fo_fmt(a[0].u.n, fo_decnat(a[0].u.n)); }
NAT(fo_decimales) {
  (void)n; (void)extra; NUM(a[0], 1, "decimales"); FENT(d, 1, "decimales");
  return fo_fmt(a[0].u.n, js_max2(0, js_min2(20, d)));
}
NAT(fo_moneda_f) {
  (void)extra; fo_conf();
  if (!n) return n_error("«moneda» necesita al menos el número", NULL);
  FNUM(x, 0, "moneda");
  NV sim = fo_moneda;
  if (n > 1) { FTXT(1, "moneda"); sim = a[1]; }
  double d;
  if (n > 2) { FENT(k, 2, "moneda"); d = js_max2(0, k); } else d = js_es_entero(x) ? 0 : 2;
  NBuf b = {0}; b_txt(&b, sim); b_c(&b, ' '); fo_fmt_en(&b, x, d); return b_texto(&b);
}
NAT(fo_porciento) {
  (void)extra; FNUM(x, 0, "porciento"); x = x * 100;
  double d;
  if (n > 1) { FENT(k, 1, "porciento"); d = js_max2(0, k); } else d = js_es_entero(x) ? 0 : 1;
  NBuf b = {0}; fo_fmt_en(&b, x, d); b_utf8(&b, " %"); return b_texto(&b);
}
NAT(fo_porcientoCambio) {
  (void)extra; FNUM(antes, 0, "porcientoCambio"); FNUM(ahora, 1, "porcientoCambio");
  if (antes == 0) return T(ahora == 0 ? "0 %" : "nuevo");
  double p = (ahora - antes) / fabs(antes) * 100;
  double d = 1;
  if (n > 2) { FENT(k, 2, "porcientoCambio"); d = js_max2(0, k); }
  NBuf b = {0}; if (p > 0) b_c(&b, '+'); fo_fmt_en(&b, p, d); b_utf8(&b, " %"); return b_texto(&b);
}
NAT(fo_signoMas) {
  (void)extra; FNUM(x, 0, "signoMas");
  double d;
  if (n > 1) { FENT(k, 1, "signoMas"); d = js_max2(0, k); } else d = fo_decnat(x);
  NBuf b = {0}; if (x > 0) b_c(&b, '+'); fo_fmt_en(&b, x, d); return b_texto(&b);
}
static NV fo_uno(double nn, double v, const char* s) {
  NBuf b = {0}; if (nn < 0) b_c(&b, '-');
  fo_fmt_en(&b, v, v < 10 && !js_es_entero(v) ? 1 : 0); b_utf8(&b, s); return b_texto(&b);
}
NAT(fo_abreviar) {
  (void)n; (void)extra; NUM(a[0], 1, "abreviar");
  double x0 = a[0].u.n, x = fabs(x0);
  if (x < 1e3) return fo_fmt(x0, fo_decnat(x0));
  if (x < 1e6) return fo_uno(x0, x / 1e3, " mil");
  if (x < 1e12) return fo_uno(x0, x / 1e6, " M");
  return fo_uno(x0, x / 1e12, " B");
}
NAT(fo_ordinal) {
  (void)extra; FENT(k, 0, "ordinal");
  int fem = n > 1 && n_verdad(a[1]);
  NBuf b = {0}; fo_fmt_en(&b, k, 0); b_utf8(&b, fem ? ".ª" : ".º"); return b_texto(&b);
}
NAT(fo_enLetras) {
  (void)n; (void)extra; FENT(k, 0, "enLetras");
  if (fabs(k) >= 1e15) return n_error("«enLetras»: el número es demasiado grande", NULL);
  char out[1024]; entero_letras(k, out); return T(out);
}
NAT(fo_romano) {
  (void)n; (void)extra; FENT(k, 0, "romano");
  if (k < 1 || k > 3999) return n_error("«romano»: solo de 1 a 3999", NULL);
  static const int V[] = { 1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1 };
  static const char* const S[] = { "M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I" };
  char out[64]; out[0] = 0;
  for (int i = 0; i < 13; i++) while (k >= V[i]) { strcat(out, S[i]); k -= V[i]; }
  return T(out);
}
NAT(fo_intervalo) {
  (void)extra;
  double d = NAN; int hayD = 0;
  if (n > 2) { FENT(k, 2, "intervalo"); d = js_max2(0, k); hayD = 1; }
  NBuf b = {0};
  for (int i = 0; i < 2; i++) {
    NV v = FA(i), e_;
    if (!exige_num(v, 1, "intervalo", &e_)) { free(b.s); return e_; }
    if (i) b_utf8(&b, " – ");
    fo_fmt_en(&b, v.u.n, hayD ? d : fo_decnat(v.u.n));
  }
  return b_texto(&b);
}
static int vocal_plural(uint16_t c) {
  static const uint16_t v[] = { 'a','e','i','o','u','A','E','I','O','U', 0xE1,0xE9,0xED,0xF3,0xFA, 0xC1,0xC9,0xCD,0xD3,0xDA };
  for (int i = 0; i < 20; i++) if (v[i] == c) return 1;
  return 0;
}
NAT(fo_plural) {
  (void)extra; FNUM(x, 0, "plural"); FTXT(1, "plural");
  NV s = a[1]; NTexto* t = TX(s);
  NBuf b = {0};
  if (fabs(x) == 1) { fo_fmt_en(&b, x, 0); b_c(&b, ' '); b_txt(&b, s); return b_texto(&b); }
  NV p;
  if (n > 2) { FTXT(2, "plural"); p = n_inc(a[2]); }
  else if (t->n && vocal_plural(t->s[t->n - 1])) { NBuf q = {0}; b_txt(&q, s); b_c(&q, 's'); p = b_texto(&q); }
  else if (t->n && (t->s[t->n - 1] == 'z' || t->s[t->n - 1] == 'Z')) { NBuf q = {0}; b_u16(&q, t->s, t->n - 1); b_utf8(&q, "ces"); p = b_texto(&q); }
  else { NBuf q = {0}; b_txt(&q, s); b_utf8(&q, "es"); p = b_texto(&q); }
  fo_fmt_en(&b, x, fo_decnat(x)); b_c(&b, ' '); b_txt(&b, p); n_dec(p);
  return b_texto(&b);
}
NAT(fo_listaLegible) {
  (void)extra;
  if (!n_es(FA(0), NC_LISTA)) return n_error("«listaLegible»: el argumento 1 debe ser una lista", NULL);
  NLista* l = LS(a[0]);
  NV* xs = (NV*)n_mem(sizeof(NV) * (size_t)(l->n + 1)); int64_t k = 0;
  for (int64_t i = 0; i < l->n; i++) { NV t = fo_como_texto(l->v[i]); if (TX(t)->n) xs[k++] = t; else n_dec(t); }
  NV r;
  if (!k) r = T("");
  else if (k == 1) r = n_inc(xs[0]);
  else {
    NV ult = xs[k - 1]; NTexto* u = TX(ult); NV conj;
    if (n > 1) { NV e_; if (!exige_texto(a[1], 2, "listaLegible", &e_)) { for (int64_t i = 0; i < k; i++) n_dec(xs[i]); free(xs); return e_; } conj = n_inc(a[1]); }
    else {
      int e = u->n && (u->s[0] == 'i' || u->s[0] == 'I');
      if (!e && u->n >= 2 && (u->s[0] == 'h' || u->s[0] == 'H') && (u->s[1] == 'i' || u->s[1] == 'I'))
        e = !(u->n >= 3 && (u->s[2] == 'a' || u->s[2] == 'e' || u->s[2] == 'A' || u->s[2] == 'E'));
      conj = T(e ? "e" : "y");
    }
    NBuf b = {0};
    for (int64_t i = 0; i < k - 1; i++) { if (i) b_utf8(&b, ", "); b_txt(&b, xs[i]); }
    b_c(&b, ' '); b_txt(&b, conj); b_c(&b, ' '); b_txt(&b, ult);
    n_dec(conj); r = b_texto(&b);
  }
  for (int64_t i = 0; i < k; i++) n_dec(xs[i]);
  free(xs);
  return r;
}
NAT(fo_mayusculaInicial) {
  (void)n; (void)extra; TXT(a[0], 1, "mayusculaInicial");
  if (!TX(a[0])->n) return n_inc(a[0]);
  NV p = sub16(a[0], 0, 1), r = sub16(a[0], 1, TX(a[0])->n), P = mayusculas(p);
  NV s = n_sumar(P, r); n_dec(p); n_dec(r); n_dec(P); return s;
}
NAT(fo_acortar) {
  (void)extra; FTXT(0, "acortar"); FENT(k, 1, "acortar");
  NV fin; if (n > 2) { FTXT(2, "acortar"); fin = n_inc(a[2]); } else fin = T("…");
  NV s = a[0];
  if (k <= 0) { n_dec(fin); return T(""); }
  if ((double)TX(s)->n <= k) { n_dec(fin); return n_inc(s); }
  NV c = slice_js(s, 0, js_max2(0, k - (double)TX(fin)->n)), c2 = recortar_js(c, 0, 1);
  NV r = n_sumar(c2, fin); n_dec(c); n_dec(c2); n_dec(fin); return r;
}
NAT(fo_elipsis) {
  (void)n; (void)extra; FTXT(0, "elipsis"); FENT(k, 1, "elipsis");
  NV s = a[0]; double L = (double)TX(s)->n;
  if (L <= k || k <= 1) return L <= k ? n_inc(s) : slice_js(s, 0, js_max2(0, k));
  double izq = ceil((k - 1) / 2), der = k - 1 - izq;
  NV x = slice_js(s, 0, izq); NBuf b = {0}; b_txt(&b, x); n_dec(x); b_utf8(&b, "…");
  if (js_si(der)) { NV y = slice_js(s, -der, L); b_txt(&b, y); n_dec(y); }
  return b_texto(&b);
}
static NV alinear(NV* a, int n, const char* f, int der) {
  NV s = fo_como_texto(FA(0));
  NV v1 = FA(1), e_;
  if (!exige_num(v1, 2, f, &e_)) { n_dec(s); return e_; }
  double k = trunc(v1.u.n);
  NV c;
  if (n > 2) { if (!exige_texto(a[2], 3, f, &e_)) { n_dec(s); return e_; } c = TX(a[2])->n ? n_inc(a[2]) : T(" "); }
  else c = T(" ");
  double falta = k - (double)ancho_vis(s);
  if (!(falta > 0)) { n_dec(c); return s; }
  NBuf b = {0};
  if (der) { b_ciclo(&b, c, falta); b_txt(&b, s); } else { b_txt(&b, s); b_ciclo(&b, c, falta); }
  n_dec(c); n_dec(s); return b_texto(&b);
}
NAT(fo_alinearIzq) { (void)extra; return alinear(a, n, "alinearIzq", 0); }
NAT(fo_alinearDer) { (void)extra; return alinear(a, n, "alinearDer", 1); }
NAT(fo_centrar) {
  (void)extra; NV s = fo_como_texto(FA(0));
  NV v1 = FA(1), e_;
  if (!exige_num(v1, 2, "centrar", &e_)) { n_dec(s); return e_; }
  double k = trunc(v1.u.n), w = (double)ancho_vis(s);
  if (w >= k || isnan(k)) return s;
  double izq = floor((k - w) / 2);
  NBuf b = {0}; b_rep(&b, ' ', izq); b_txt(&b, s); b_rep(&b, ' ', k - w - izq);
  n_dec(s); return b_texto(&b);
}
NAT(fo_aAncho) {
  (void)extra; NV s = fo_como_texto(FA(0));
  NV v1 = FA(1), e_;
  if (!exige_num(v1, 2, "aAncho", &e_)) { n_dec(s); return e_; }
  double k = trunc(v1.u.n);
  if (k <= 0) { n_dec(s); return T(""); }
  int der = 0;
  if (n > 2) {
    if (!exige_texto(a[2], 3, "aAncho", &e_)) { n_dec(s); return e_; }
    NV d = T("der"); der = texto_igual(a[2], d); n_dec(d);
  }
  double w = (double)ancho_vis(s);
  if (w > k) {
    if (tiene_ansi(s)) return s;
    NV c = slice_js(s, 0, js_max2(0, k - 1)); NBuf b = {0}; b_txt(&b, c); n_dec(c); b_utf8(&b, "…"); n_dec(s); return b_texto(&b);
  }
  NBuf b = {0};
  if (der) { b_rep(&b, ' ', js_max2(0, k - w)); b_txt(&b, s); } else { b_txt(&b, s); b_rep(&b, ' ', js_max2(0, k - w)); }
  n_dec(s); return b_texto(&b);
}
NAT(fo_tamanoLegible) {
  (void)n; (void)extra; NUM(a[0], 1, "tamanoLegible");
  double x = a[0].u.n; int neg = x < 0; x = fabs(x);
  static const char* const U[] = { "B", "KB", "MB", "GB", "TB", "PB" };
  int i = 0;
  while (x >= 1024 && i < 5) { x /= 1024; i++; }
  NBuf b = {0}; if (neg) b_c(&b, '-');
  fo_fmt_en(&b, x, i == 0 ? 0 : (x < 10 ? 1 : 0)); b_c(&b, ' '); b_utf8(&b, U[i]);
  return b_texto(&b);
}
static void b_num(NBuf* b, double x) { char s[64]; num_js(x, s); b_utf8(b, s); }
NAT(fo_duracionLegible) {
  (void)n; (void)extra; NUM(a[0], 1, "duracionLegible");
  double ms = fabs(a[0].u.n);
  NBuf b = {0};
  if (ms < 1000) { fo_fmt_en(&b, round_js(ms), 0); b_utf8(&b, " ms"); return b_texto(&b); }
  double s = floor(ms / 1000);
  double d = floor(s / 86400), h = floor(fmod(s, 86400) / 3600), m = floor(fmod(s, 3600) / 60), sg = fmod(s, 60);
  int hay = 0;
#define FO_P(x, u) do { if (hay) b_c(&b, ' '); b_num(&b, x); b_utf8(&b, u); hay = 1; } while (0)
  if (js_si(d)) FO_P(d, " d");
  if (js_si(h)) FO_P(h, " h");
  if (js_si(m) && !js_si(d)) FO_P(m, " min");
  if (js_si(sg) && !js_si(d) && !js_si(h)) FO_P(sg, " s");
#undef FO_P
  if (!hay) b_utf8(&b, "0 s");
  return b_texto(&b);
}
NAT(fo_tiempoReloj) {
  (void)n; (void)extra; NUM(a[0], 1, "tiempoReloj");
  double t = js_max2(0, floor(a[0].u.n / 1000));
  double h = floor(t / 3600), m = floor(fmod(t, 3600) / 60), s = fmod(t, 60);
  NBuf b = {0};
  if (js_si(h)) { b_num(&b, h); b_c(&b, ':'); }
  if (m < 10) b_c(&b, '0');
  b_num(&b, m); b_c(&b, ':');
  if (s < 10) b_c(&b, '0');
  b_num(&b, s);
  return b_texto(&b);
}
NAT(fo_tiempoRelativo) {
  (void)n; (void)extra; NUM(a[0], 1, "tiempoRelativo");
  double ms = a[0].u.n; int fut = ms < 0; double x = fabs(ms);
  double s = round_js(x / 1000), k; const char *u1, *u2;
  if (s < 45) return T(fut ? "en un momento" : "hace un momento");
  else if (s < 5400) { k = round_js(s / 60); u1 = "minuto"; u2 = "minutos"; }
  else if (s < 79200) { k = round_js(s / 3600); u1 = "hora"; u2 = "horas"; }
  else if (s < 2246400) { k = round_js(s / 86400); u1 = "día"; u2 = "días"; }
  else if (s < 28512000) { k = round_js(s / 2592000); u1 = "mes"; u2 = "meses"; }
  else { k = round_js(s / 31536000); u1 = "año"; u2 = "años"; }
  NBuf b = {0}; b_utf8(&b, fut ? "en " : "hace "); b_num(&b, k); b_c(&b, ' '); b_utf8(&b, k == 1 ? u1 : u2);
  return b_texto(&b);
}
NAT(fo_regla) {
  (void)extra; double k = 40;
  if (n) { FENT(q, 0, "regla"); k = q; }
  NV c;
  if (n > 1) { FTXT(1, "regla"); c = TX(a[1])->n ? n_inc(a[1]) : T("─"); } else c = T("─");
  if (k <= 0) { n_dec(c); return T(""); }
  NBuf b = {0}; b_ciclo(&b, c, k); n_dec(c); return b_texto(&b);
}
NAT(fo_barraTexto) {
  (void)extra; FNUM(v, 0, "barraTexto"); FNUM(mx, 1, "barraTexto");
  double an = 20;
  if (n > 2) { FENT(q, 2, "barraTexto"); an = js_max2(1, q); }
  double p = mx == 0 ? 0 : js_max2(0, js_min2(1, v / mx));
  double lleno = round_js(p * an);
  NBuf b = {0}; b_rep(&b, 0x2588, lleno); b_rep(&b, 0x2591, an - lleno); return b_texto(&b);
}
NAT(fo_minigrafico) {
  (void)n; (void)extra;
  if (!n_es(a[0], NC_LISTA)) return n_error("«minigrafico»: el argumento 1 debe ser una lista", NULL);
  NLista* l = LS(a[0]);
  for (int64_t i = 0; i < l->n; i++) NUM(l->v[i], (int)(i + 1), "minigrafico");
  if (!l->n) return T("");
  double lo = INFINITY, hi = -INFINITY;
  for (int64_t i = 0; i < l->n; i++) { lo = js_min2(lo, l->v[i].u.n); hi = js_max2(hi, l->v[i].u.n); }
  NBuf b = {0};
  if (hi == lo) { b_rep(&b, 0x2584, (double)l->n); return b_texto(&b); }
  for (int64_t i = 0; i < l->n; i++) {
    double k = round_js((l->v[i].u.n - lo) / (hi - lo) * 7);
    if (k >= 0 && k <= 7) b_c(&b, (uint16_t)(0x2581 + (int)k));
  }
  return b_texto(&b);
}
NAT(fo_marco) {
  (void)extra; FTXT(0, "marco");
  NV tit; if (n > 1) { FTXT(1, "marco"); tit = n_inc(a[1]); } else tit = T("");
  NV nl = T("\n"); NV ls = split_js(a[0], nl); n_dec(nl);
  NLista* L = LS(ls);
  double an = (double)ancho_vis(tit) + 2;
  for (int64_t i = 0; i < L->n; i++) an = js_max2(an, (double)ancho_vis(L->v[i]));
  NBuf b = {0};
  if (TX(tit)->n) { b_utf8(&b, "┌─ "); b_txt(&b, tit); b_c(&b, ' '); b_rep(&b, 0x2500, js_max2(0, an - (double)ancho_vis(tit) - 1)); b_utf8(&b, "┐"); }
  else { b_utf8(&b, "┌"); b_rep(&b, 0x2500, an + 2); b_utf8(&b, "┐"); }
  for (int64_t i = 0; i < L->n; i++) { b_c(&b, '\n'); b_utf8(&b, "│ "); b_txt(&b, L->v[i]); b_rellenar(&b, L->v[i], an); b_utf8(&b, " │"); }
  b_c(&b, '\n'); b_utf8(&b, "└"); b_rep(&b, 0x2500, an + 2); b_utf8(&b, "┘");
  n_dec(ls); n_dec(tit);
  return b_texto(&b);
}
static NV fo_celda(NV f, NV c) {
  NV v;
  if (!n_es(f, NC_DIC) || !n_dic_buscar(DC(f), c, &v) || v.t == N_NULO) return T("");
  if (v.t == N_NUM) return fo_fmt(v.u.n, fo_decnat(v.u.n));
  return fo_como_texto(v);
}
NAT(fo_tablaTexto) {
  (void)extra;
  if (!n_es(FA(0), NC_LISTA)) return n_error("«tablaTexto»: el argumento 1 debe ser una lista de diccionarios", NULL);
  NLista* filas = LS(a[0]);
  if (!filas->n) return T("");
  NV cols = n_lista_nueva(8);
  if (n > 1 && n_es(a[1], NC_LISTA)) { NLista* q = LS(a[1]); for (int64_t i = 0; i < q->n; i++) n_lista_agregar(LS(cols), fo_string(q->v[i])); }
  else {
    for (int64_t i = 0; i < filas->n; i++) if (n_es(filas->v[i], NC_DIC)) {
      NDic* d = DC(filas->v[i]);
      for (int64_t j = 0; j < d->usados; j++) if (d->e[j].vivo) {
        NV s = fo_string(d->e[j].k); int ya = 0;
        for (int64_t q = 0; q < LS(cols)->n; q++) if (texto_igual(LS(cols)->v[q], s)) { ya = 1; break; }
        if (ya) n_dec(s); else n_lista_agregar(LS(cols), s);
      }
    }
  }
  for (int64_t i = 0; i < filas->n; i++) if (!n_es(filas->v[i], NC_DIC)) {
    n_dec(cols);
    return ERRP(T("las claves son los títulos de las columnas: [{\"ciudad\": \"Girón\", \"ventas\": 1200}] · de una tabla salen con aRegistros(t)"),
      "«tablaTexto»: la fila %d es %s y tiene que ser un diccionario", (long long)(i + 1), n_tipo_de(filas->v[i]));
  }
  NLista* C = LS(cols); int64_t nc = C->n, nf = filas->n;
  NV* cel = (NV*)n_mem(sizeof(NV) * (size_t)(nc * nf + 1));
  int* numerica = (int*)n_mem(sizeof(int) * (size_t)(nc + 1));
  double* an = (double*)n_mem(sizeof(double) * (size_t)(nc + 1));
  for (int64_t j = 0; j < nc; j++) {
    numerica[j] = 1; an[j] = (double)ancho_vis(C->v[j]);
    for (int64_t i = 0; i < nf; i++) {
      NV v; if (n_dic_buscar(DC(filas->v[i]), C->v[j], &v) && v.t != N_NULO && v.t != N_NUM) numerica[j] = 0;
      cel[i * nc + j] = fo_celda(filas->v[i], C->v[j]);
      an[j] = js_max2(an[j], (double)ancho_vis(cel[i * nc + j]));
    }
  }
  NBuf b = {0};
#define FO_CELDA(s, j) do { if (j) b_utf8(&b, "  "); if (numerica[j]) { b_rellenar(&b, s, an[j]); b_txt(&b, s); } else { b_txt(&b, s); b_rellenar(&b, s, an[j]); } } while (0)
  for (int64_t j = 0; j < nc; j++) FO_CELDA(C->v[j], j);
  b_c(&b, '\n');
  for (int64_t j = 0; j < nc; j++) { if (j) b_utf8(&b, "  "); b_rep(&b, 0x2500, an[j]); }
  for (int64_t i = 0; i < nf; i++) { b_c(&b, '\n'); for (int64_t j = 0; j < nc; j++) FO_CELDA(cel[i * nc + j], j); }
#undef FO_CELDA
  for (int64_t i = 0; i < nc * nf; i++) n_dec(cel[i]);
  free(cel); free(numerica); free(an); n_dec(cols);
  return b_texto(&b);
}
NAT(fo_columnas) {
  (void)extra;
  if (!n_es(FA(0), NC_LISTA)) return n_error("«columnas»: el argumento 1 debe ser una lista", NULL);
  NLista* l = LS(a[0]);
  double k = 3;
  if (n > 1) { FENT(q, 1, "columnas"); k = js_max2(1, q); }
  if (!l->n) return T("");
  NV* xs = (NV*)n_mem(sizeof(NV) * (size_t)l->n);
  double an = -INFINITY;
  for (int64_t i = 0; i < l->n; i++) { xs[i] = fo_como_texto(l->v[i]); an = js_max2(an, (double)ancho_vis(xs[i])); }
  an += 2;
  double alto = ceil((double)l->n / k);
  NBuf b = {0};
  for (double f = 0; f < alto; f++) {
    if (f > 0) b_c(&b, '\n');
    NBuf fila = {0};
    for (double c = 0; c < k; c++) {
      double ix = c * alto + f;
      if (ix < (double)l->n) { b_txt(&fila, xs[(int64_t)ix]); b_rellenar(&fila, xs[(int64_t)ix], an); }
      else if (!isfinite(k)) break;
    }
    NV t = b_texto(&fila), r = recortar_js(t, 0, 1); b_txt(&b, r); n_dec(t); n_dec(r);
  }
  for (int64_t i = 0; i < l->n; i++) n_dec(xs[i]);
  free(xs);
  return b_texto(&b);
}
static NV fo_ansi(NV* a, const char* f, const char* cod) {
  TXT(a[0], 1, f);
  NBuf b = {0}; b_c(&b, 0x1B); b_c(&b, '['); b_utf8(&b, cod); b_c(&b, 'm'); b_txt(&b, a[0]); b_c(&b, 0x1B); b_utf8(&b, "[0m");
  return b_texto(&b);
}
#define FO_ANSI(nombre, cod) NAT(fo_##nombre) { (void)n; (void)extra; return fo_ansi(a, #nombre, cod); }
FO_ANSI(enRojo, "31") FO_ANSI(enVerde, "32") FO_ANSI(enAmarillo, "33") FO_ANSI(enAzul, "34")
FO_ANSI(enGris, "90") FO_ANSI(enNegrita, "1") FO_ANSI(enTenue, "2") FO_ANSI(enSubrayado, "4")
NAT(fo_sinColor) { (void)n; (void)extra; TXT(a[0], 1, "sinColor"); return sin_ansi(a[0]); }
NAT(fo_separadores) {
  (void)extra; fo_conf();
  NV m = n > 0 ? fo_string(a[0]) : T("."), d = n > 1 ? fo_string(a[1]) : T(",");
  n_dec(fo_miles); n_dec(fo_decimal); fo_miles = m; fo_decimal = d;
  return n_nulo();
}
NAT(fo_monedaPorDefecto) {
  (void)n; (void)extra; fo_conf(); TXT(a[0], 1, "monedaPorDefecto");
  n_dec(fo_moneda); fo_moneda = n_inc(a[0]);
  return n_nulo();
}

#define NAT_FORMATO \
  { "formato/numero", 1, fo_numero }, { "formato/decimales", 2, fo_decimales }, { "formato/moneda", -1, fo_moneda_f }, \
  { "formato/porciento", -1, fo_porciento }, { "formato/porcientoCambio", -1, fo_porcientoCambio }, \
  { "formato/signoMas", -1, fo_signoMas }, { "formato/abreviar", 1, fo_abreviar }, { "formato/ordinal", -1, fo_ordinal }, \
  { "formato/enLetras", 1, fo_enLetras }, { "formato/romano", 1, fo_romano }, { "formato/intervalo", -1, fo_intervalo }, \
  { "formato/plural", -1, fo_plural }, { "formato/listaLegible", -1, fo_listaLegible }, \
  { "formato/mayusculaInicial", 1, fo_mayusculaInicial }, { "formato/acortar", -1, fo_acortar }, \
  { "formato/elipsis", -1, fo_elipsis }, { "formato/alinearIzq", -1, fo_alinearIzq }, { "formato/alinearDer", -1, fo_alinearDer }, \
  { "formato/centrar", -1, fo_centrar }, { "formato/aAncho", -1, fo_aAncho }, \
  { "formato/tamanoLegible", 1, fo_tamanoLegible }, { "formato/duracionLegible", 1, fo_duracionLegible }, \
  { "formato/tiempoReloj", 1, fo_tiempoReloj }, { "formato/tiempoRelativo", 1, fo_tiempoRelativo }, \
  { "formato/regla", -1, fo_regla }, { "formato/barraTexto", -1, fo_barraTexto }, { "formato/minigrafico", 1, fo_minigrafico }, \
  { "formato/marco", -1, fo_marco }, { "formato/tablaTexto", -1, fo_tablaTexto }, { "formato/columnas", -1, fo_columnas }, \
  { "formato/enRojo", 1, fo_enRojo }, { "formato/enVerde", 1, fo_enVerde }, { "formato/enAmarillo", 1, fo_enAmarillo }, \
  { "formato/enAzul", 1, fo_enAzul }, { "formato/enGris", 1, fo_enGris }, { "formato/enNegrita", 1, fo_enNegrita }, \
  { "formato/enTenue", 1, fo_enTenue }, { "formato/enSubrayado", 1, fo_enSubrayado }, { "formato/sinColor", 1, fo_sinColor }, \
  { "formato/separadores", -1, fo_separadores }, { "formato/monedaPorDefecto", 1, fo_monedaPorDefecto },
