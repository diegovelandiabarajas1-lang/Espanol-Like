/* ============================================================================
 *  Ñ sin runtime — el eDSL «texto» (src/10-edsl-texto.js), en C.
 *  Se incluye desde nrt.c (comparte sus piezas internas). Cada función hace lo
 *  mismo que la de JavaScript: los mismos cortes, las mismas mayúsculas, los
 *  mismos mensajes.
 * ========================================================================== */

/* ── mayúsculas y minúsculas: lo que hacen toUpperCase/toLowerCase en latín,
   griego y cirílico (los casos especiales de JavaScript incluidos: ß → SS,
   İ → i̇, ŉ → ʼN) ── */
static int may_un(uint32_t c, uint32_t* o) {   /* devuelve cuántas unidades (1 o 2) */
  if (c >= 'a' && c <= 'z') { o[0] = c - 32; return 1; }
  if (c < 0x80) { o[0] = c; return 1; }
  if (c == 0xB5) { o[0] = 0x39C; return 1; }
  if (c == 0xDF) { o[0] = 'S'; o[1] = 'S'; return 2; }
  if (c >= 0xE0 && c <= 0xFE && c != 0xF7) { o[0] = c - 32; return 1; }
  if (c == 0xFF) { o[0] = 0x178; return 1; }
  if (c >= 0x100 && c <= 0x17F) {
    if (c == 0x131) { o[0] = 'I'; return 1; }
    if (c == 0x149) { o[0] = 0x2BC; o[1] = 'N'; return 2; }
    if (c == 0x17F) { o[0] = 'S'; return 1; }
    if (c == 0x138 || c == 0x130) { o[0] = c; return 1; }
    int par = (c >= 0x139 && c <= 0x148) || (c >= 0x179 && c <= 0x17E);   /* aquí la mayúscula es impar */
    if (par) { o[0] = (c & 1) ? c : c - 1; return 1; }
    o[0] = (c & 1) ? c - 1 : c; return 1;
  }
  if (c >= 0x3B1 && c <= 0x3C9 && c != 0x3C2) { o[0] = c - 32; return 1; }
  if (c == 0x3C2) { o[0] = 0x3A3; return 1; }
  if (c == 0x3AC) { o[0] = 0x386; return 1; }
  if (c >= 0x3AD && c <= 0x3AF) { o[0] = c - 37; return 1; }
  if (c == 0x3CC) { o[0] = 0x38C; return 1; }
  if (c == 0x3CD || c == 0x3CE) { o[0] = c - 63; return 1; }
  if (c >= 0x430 && c <= 0x44F) { o[0] = c - 32; return 1; }
  if (c >= 0x450 && c <= 0x45F) { o[0] = c - 80; return 1; }
  o[0] = c; return 1;
}
static int min_un(uint32_t c, uint32_t* o) {
  if (c >= 'A' && c <= 'Z') { o[0] = c + 32; return 1; }
  if (c < 0x80) { o[0] = c; return 1; }
  if (c >= 0xC0 && c <= 0xDE && c != 0xD7) { o[0] = c + 32; return 1; }
  if (c >= 0x100 && c <= 0x17F) {
    if (c == 0x130) { o[0] = 'i'; o[1] = 0x307; return 2; }
    if (c == 0x178) { o[0] = 0xFF; return 1; }
    if (c == 0x131 || c == 0x138 || c == 0x149 || c == 0x17F) { o[0] = c; return 1; }
    int par = (c >= 0x139 && c <= 0x148) || (c >= 0x179 && c <= 0x17E);
    if (par) { o[0] = (c & 1) ? c + 1 : c; return 1; }
    o[0] = (c & 1) ? c : c + 1; return 1;
  }
  if (c >= 0x391 && c <= 0x3A9 && c != 0x3A2) { o[0] = c + 32; return 1; }
  if (c == 0x386) { o[0] = 0x3AC; return 1; }
  if (c >= 0x388 && c <= 0x38A) { o[0] = c + 37; return 1; }
  if (c == 0x38C) { o[0] = 0x3CC; return 1; }
  if (c == 0x38E || c == 0x38F) { o[0] = c + 63; return 1; }
  if (c >= 0x410 && c <= 0x42F) { o[0] = c + 32; return 1; }
  if (c >= 0x400 && c <= 0x40F) { o[0] = c + 80; return 1; }
  o[0] = c; return 1;
}
static NV caja(NV s, int mayus) {
  NTexto* t = TX(s); NBuf b = {0};
  for (int64_t i = 0; i < t->n; i++) {
    uint32_t o[2]; int k = mayus ? may_un(t->s[i], o) : min_un(t->s[i], o);
    /* sigma final: JavaScript pone ς al final de una palabra */
    if (!mayus && t->s[i] == 0x3A3) {
      int letraAntes = i > 0 && ((t->s[i - 1] >= 'A' && t->s[i - 1] <= 'z') || t->s[i - 1] >= 0xC0);
      int letraDespues = i + 1 < t->n && ((t->s[i + 1] >= 'A' && t->s[i + 1] <= 'z') || t->s[i + 1] >= 0xC0);
      if (letraAntes && !letraDespues) o[0] = 0x3C2;
    }
    for (int q = 0; q < k; q++) b_c(&b, (uint16_t)o[q]);
  }
  return b_texto(&b);
}
static NV mayusculas(NV s) { return caja(s, 1); }
static NV minusculas(NV s) { return caja(s, 0); }

/* ── piezas ─────────────────────────────────────────────────────────────── */
static NV sub16(NV s, int64_t i, int64_t j) {          /* s.slice(i, j) ya recortado */
  if (j < i) j = i;
  return n_texto_utf16(TX(s)->s + i, j - i);
}
static NV slice_js(NV s, double di, double dj) {      /* String.prototype.slice */
  int64_t n = TX(s)->n;
  return sub16(s, corte_js(di, n), corte_js(dj, n));
}
static int64_t ultimo_indice(NV h, NV q) {
  NTexto *x = TX(h), *y = TX(q);
  for (int64_t i = x->n - y->n; i >= 0; i--) if (y->n == 0 || memcmp(x->s + i, y->s, sizeof(uint16_t) * (size_t)y->n) == 0) return i;
  return -1;
}
static int empieza(NV s, NV p) { NTexto *x = TX(s), *y = TX(p); return y->n <= x->n && memcmp(x->s, y->s, sizeof(uint16_t) * (size_t)y->n) == 0; }
static int termina(NV s, NV p) { NTexto *x = TX(s), *y = TX(p); return y->n <= x->n && memcmp(x->s + x->n - y->n, y->s, sizeof(uint16_t) * (size_t)y->n) == 0; }
static NV recortar_js(NV s, int izq, int der) {
  NTexto* t = TX(s); int64_t i = 0, j = t->n;
  if (izq) while (i < j && es_esp_js(t->s[i])) i++;
  if (der) while (j > i && es_esp_js(t->s[j - 1])) j--;
  return sub16(s, i, j);
}
static NV split_js(NV s, NV sep) {                    /* String.prototype.split(texto) */
  NTexto *x = TX(s), *y = TX(sep);
  NV r = n_lista_nueva(4);
  if (y->n == 0) { for (int64_t i = 0; i < x->n; i++) n_lista_agregar(LS(r), sub16(s, i, i + 1)); return r; }
  int64_t i = 0;
  for (;;) { int64_t j = texto_buscar(s, sep, i); if (j < 0) break; n_lista_agregar(LS(r), sub16(s, i, j)); i = j + y->n; }
  n_lista_agregar(LS(r), sub16(s, i, x->n));
  return r;
}
static NV unir_lista(NV l, NV sep) {
  NBuf b = {0}; NLista* xs = LS(l);
  for (int64_t i = 0; i < xs->n; i++) { if (i) b_txt(&b, sep); if (n_es(n_lv(xs)[i], NC_TEXTO)) b_txt(&b, n_lv(xs)[i]); else repr_en(&b, n_lv(xs)[i], 1); }
  return b_texto(&b);
}
static NV reemplazar_todo(NV s, NV d, NV c) { NV p = split_js(s, d); NV r = unir_lista(p, c); n_dec(p); return r; }
static NV lineas_de(NV s) {                           /* split(/\r\n|\r|\n/) */
  NTexto* x = TX(s); NV r = n_lista_nueva(4); int64_t i = 0;
  for (int64_t k = 0; k < x->n; k++) {
    if (x->s[k] == '\r' || x->s[k] == '\n') {
      n_lista_agregar(LS(r), sub16(s, i, k));
      if (x->s[k] == '\r' && k + 1 < x->n && x->s[k + 1] == '\n') k++;
      i = k + 1;
    }
  }
  n_lista_agregar(LS(r), sub16(s, i, x->n));
  return r;
}
static NV palabras_de(NV s) {                         /* split(/\s+/).filter(x => x !== '') */
  NTexto* x = TX(s); NV r = n_lista_nueva(4); int64_t i = 0;
  while (i < x->n) {
    while (i < x->n && es_esp_js(x->s[i])) i++;
    int64_t j = i; while (j < x->n && !es_esp_js(x->s[j])) j++;
    if (j > i) n_lista_agregar(LS(r), sub16(s, i, j));
    i = j;
  }
  return r;
}
static int64_t pc_siguiente(NTexto* t, int64_t i) {   /* fin del punto de código que empieza en i */
  if (t->s[i] >= 0xD800 && t->s[i] <= 0xDBFF && i + 1 < t->n && t->s[i + 1] >= 0xDC00 && t->s[i + 1] <= 0xDFFF) return i + 2;
  return i + 1;
}
static uint16_t sin_tilde(uint16_t c) {
  static const uint16_t de[] = { 0xE1,0xE0,0xE4,0xE2,0xC1,0xC0,0xC4,0xC2, 0xE9,0xE8,0xEB,0xEA,0xC9,0xC8,0xCB,0xCA,
    0xED,0xEC,0xEF,0xEE,0xCD,0xCC,0xCF,0xCE, 0xF3,0xF2,0xF6,0xF4,0xD3,0xD2,0xD6,0xD4, 0xFA,0xF9,0xFC,0xFB,0xDA,0xD9,0xDC,0xDB, 0xE7,0xC7 };
  static const char a[] = "aaaaAAAAeeeeEEEEiiiiIIIIooooOOOOuuuuUUUUcC";
  for (int i = 0; i < 42; i++) if (de[i] == c) return (uint16_t)a[i];
  return c;
}
static NV sin_tildes(NV s) {
  NTexto* t = TX(s); NV r = n_texto_utf16(t->s, t->n);
  for (int64_t i = 0; i < t->n; i++) TX(r)->s[i] = sin_tilde(t->s[i]);
  return r;
}
static int64_t levenshtein(NTexto* x, NTexto* y) {
  if (x->n == y->n && (x->n == 0 || memcmp(x->s, y->s, sizeof(uint16_t) * (size_t)x->n) == 0)) return 0;
  if (!x->n) return y->n;
  if (!y->n) return x->n;
  int64_t* f = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(y->n + 1));
  for (int64_t j = 0; j <= y->n; j++) f[j] = j;
  for (int64_t i = 1; i <= x->n; i++) {
    int64_t ant = f[0]; f[0] = i;
    for (int64_t j = 1; j <= y->n; j++) {
      int64_t g = f[j], m = f[j] + 1;
      if (f[j - 1] + 1 < m) m = f[j - 1] + 1;
      int64_t c = ant + (x->s[i - 1] == y->s[j - 1] ? 0 : 1);
      if (c < m) m = c;
      f[j] = m; ant = g;
    }
  }
  int64_t r = f[y->n]; free(f);
  return r;
}
static int es_letra_es(uint16_t c) {
  if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) return 1;
  static const uint16_t l[] = { 0xC1,0xC9,0xCD,0xD3,0xDA,0xDC,0xD1,0xE1,0xE9,0xED,0xF3,0xFA,0xFC,0xF1 };
  for (int i = 0; i < 14; i++) if (l[i] == c) return 1;
  return 0;
}
static int es_vocal_es(uint16_t c) {
  static const char* v = "aeiouAEIOU";
  for (const char* p = v; *p; p++) if (*p == c) return 1;
  static const uint16_t l[] = { 0xE1,0xE9,0xED,0xF3,0xFA,0xFC,0xC1,0xC9,0xCD,0xD3,0xDA,0xDC };
  for (int i = 0; i < 12; i++) if (l[i] == c) return 1;
  return 0;
}
/* el orden del español (claveEs): letra, luego tilde, luego mayúscula */
static NV clave_es(NV s) {
  static const char* ALFA = "abcdefghijklmn\x01opqrstuvwxyz";   /* \x01 es la ñ */
  NTexto* t = TX(s); NBuf le = {0}, ti = {0}, ca = {0};
  for (int64_t i = 0; i < t->n;) {
    int64_t j = pc_siguiente(t, i);
    uint32_t c = t->s[i], cp = c;
    if (j - i == 2) cp = 0x10000 + ((c - 0xD800) << 10) + (t->s[i + 1] - 0xDC00);
    uint32_t bajo[2]; int k = min_un(c, bajo); uint32_t b0 = k == 1 ? bajo[0] : c;
    uint32_t base = b0 < 0x10000 ? sin_tilde((uint16_t)b0) : b0;
    int pos = -1;
    if (base == 0xF1) pos = 14;
    else if (base >= 'a' && base <= 'z') { for (int q = 0; q < 27; q++) if ((unsigned char)ALFA[q] == base) { pos = q; break; } }
    b_c(&le, pos >= 0 ? (uint16_t)(0x100 + pos) : (uint16_t)(cp < 0xFF ? cp : 0xFF));
    b_c(&ti, (base != b0) ? '1' : '0');
    b_c(&ca, (j - i == 1 && b0 == c) ? '0' : '1');
    i = j;
  }
  b_c(&le, 0); b_u16(&le, ti.s, ti.n); b_c(&le, 0); b_u16(&le, ca.s, ca.n);
  free(ti.s); free(ca.s);
  return b_texto(&le);
}

/* ── las funciones ─────────────────────────────────────────────────────── */
#define TXN(k, f) TXT(a[k], (k) + 1, f)
static int ent_de(NV v, int k, const char* f, double* o, NV* err) { if (!exige_num(v, k, f, err)) return 0; *o = trunc(v.u.n); return 1; }
#define ENT(var, k, f) double var; do { NV e_; if (!ent_de(a[k], (k) + 1, f, &var, &e_)) return e_; } while (0)

NAT(tx_mayusculas) { (void)n; (void)extra; TXN(0, "mayusculas"); return mayusculas(a[0]); }
NAT(tx_minusculas) { (void)n; (void)extra; TXN(0, "minusculas"); return minusculas(a[0]); }
NAT(tx_recortar) { (void)n; (void)extra; TXN(0, "recortar"); return recortar_js(a[0], 1, 1); }
NAT(tx_dividir) {
  (void)extra; TXN(0, "dividir");
  if (n > 1) { TXN(1, "dividir"); return split_js(a[0], a[1]); }
  NV sp = n_texto_utf8(" "); NV r = split_js(a[0], sp); n_dec(sp); return r;
}
NAT(tx_unir) { (void)n; (void)extra; LST(a[0], 1, "unir"); TXN(1, "unir"); return unir_lista(a[0], a[1]); }
NAT(tx_reemplazar) { (void)n; (void)extra; TXN(0, "reemplazar"); TXN(1, "reemplazar"); TXN(2, "reemplazar"); return reemplazar_todo(a[0], a[1], a[2]); }
NAT(tx_empiezaCon) { (void)n; (void)extra; TXN(0, "empiezaCon"); TXN(1, "empiezaCon"); return n_bool(empieza(a[0], a[1])); }
NAT(tx_terminaCon) { (void)n; (void)extra; TXN(0, "terminaCon"); TXN(1, "terminaCon"); return n_bool(termina(a[0], a[1])); }
NAT(tx_subtexto) { (void)n; (void)extra; TXN(0, "subtexto"); NUM(a[1], 2, "subtexto"); NUM(a[2], 3, "subtexto"); return slice_js(a[0], a[1].u.n, a[2].u.n); }
NAT(tx_indiceDe) {
  (void)extra; TXN(0, "indiceDe"); TXN(1, "indiceDe");
  int64_t desde = 0;
  if (n > 2) { ENT(d, 2, "indiceDe"); desde = d < 0 ? 0 : (d > (double)TX(a[0])->n ? TX(a[0])->n : (int64_t)d); }
  return n_num((double)texto_buscar(a[0], a[1], desde));
}
NAT(tx_ultimoIndiceDe) { (void)n; (void)extra; TXN(0, "ultimoIndiceDe"); TXN(1, "ultimoIndiceDe"); return n_num((double)ultimo_indice(a[0], a[1])); }
NAT(tx_cuantasVeces) {
  (void)n; (void)extra; TXN(0, "cuantasVeces"); TXN(1, "cuantasVeces");
  if (!TX(a[1])->n) return n_error("«cuantasVeces»: el trozo que se busca no puede estar vacío", NULL);
  int64_t c = 0, i = 0; for (;;) { int64_t j = texto_buscar(a[0], a[1], i); if (j < 0) break; c++; i = j + TX(a[1])->n; }
  return n_num((double)c);
}
NAT(tx_izquierda) { (void)n; (void)extra; ENT(k, 1, "izquierda"); if (k <= 0) return n_texto_utf8(""); TXN(0, "izquierda"); return slice_js(a[0], 0, k); }
NAT(tx_derecha) { (void)n; (void)extra; ENT(k, 1, "derecha"); if (k <= 0) return n_texto_utf8(""); TXN(0, "derecha"); return slice_js(a[0], -k, (double)TX(a[0])->n); }
NAT(tx_entre) {
  (void)n; (void)extra; TXN(0, "entre"); TXN(1, "entre"); TXN(2, "entre");
  int64_t i = texto_buscar(a[0], a[1], 0); if (i < 0) return n_texto_utf8("");
  int64_t j = texto_buscar(a[0], a[2], i + TX(a[1])->n); if (j < 0) return n_texto_utf8("");
  return sub16(a[0], i + TX(a[1])->n, j);
}
NAT(tx_antesDe) { (void)n; (void)extra; TXN(0, "antesDe"); TXN(1, "antesDe"); int64_t i = texto_buscar(a[0], a[1], 0); return i < 0 ? n_inc(a[0]) : sub16(a[0], 0, i); }
NAT(tx_despuesDe) { (void)n; (void)extra; TXN(0, "despuesDe"); TXN(1, "despuesDe"); int64_t i = texto_buscar(a[0], a[1], 0); return i < 0 ? n_texto_utf8("") : sub16(a[0], i + TX(a[1])->n, TX(a[0])->n); }
NAT(tx_recortarIzq) { (void)n; (void)extra; TXN(0, "recortarIzq"); return recortar_js(a[0], 1, 0); }
NAT(tx_recortarDer) { (void)n; (void)extra; TXN(0, "recortarDer"); return recortar_js(a[0], 0, 1); }
NAT(tx_quitarPrefijo) { (void)n; (void)extra; TXN(0, "quitarPrefijo"); TXN(1, "quitarPrefijo"); return TX(a[1])->n && empieza(a[0], a[1]) ? sub16(a[0], TX(a[1])->n, TX(a[0])->n) : n_inc(a[0]); }
NAT(tx_quitarSufijo) { (void)n; (void)extra; TXN(0, "quitarSufijo"); TXN(1, "quitarSufijo"); return TX(a[1])->n && termina(a[0], a[1]) ? sub16(a[0], 0, TX(a[0])->n - TX(a[1])->n) : n_inc(a[0]); }
NAT(tx_capitalizar) {
  (void)n; (void)extra; TXN(0, "capitalizar");
  if (!TX(a[0])->n) return n_inc(a[0]);
  NV p = sub16(a[0], 0, 1), r = sub16(a[0], 1, TX(a[0])->n);
  NV P = mayusculas(p), Rm = minusculas(r); NV s = n_sumar(P, Rm);
  n_dec(p); n_dec(r); n_dec(P); n_dec(Rm); return s;
}
NAT(tx_titular) {
  (void)n; (void)extra; TXN(0, "titular");
  static const char* chicas[] = { "de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "a", "al", "en", "con", "por", "para", "sin", "un", "una", NULL };
  NV m = minusculas(a[0]); NTexto* t = TX(m); NBuf b = {0}; int primera = 1;
  int64_t i = 0;
  while (i < t->n) {
    int64_t j = i;
    if (es_esp_js(t->s[i])) { while (j < t->n && es_esp_js(t->s[j])) j++; b_u16(&b, t->s + i, j - i); i = j; continue; }
    while (j < t->n && !es_esp_js(t->s[j])) j++;
    NV p = sub16(m, i, j); int chica = 0;
    for (int q = 0; chicas[q]; q++) { NV c = n_texto_utf8(chicas[q]); if (texto_igual(c, p)) chica = 1; n_dec(c); }
    if (primera || !chica) {
      uint32_t o[2]; int k = may_un(t->s[i], o); for (int q = 0; q < k; q++) b_c(&b, (uint16_t)o[q]);
      b_u16(&b, t->s + i + 1, j - i - 1);
    } else b_u16(&b, t->s + i, j - i);
    primera = 0; n_dec(p); i = j;
  }
  n_dec(m);
  return b_texto(&b);
}
NAT(tx_reemplazarPrimero) {
  (void)n; (void)extra; TXN(0, "reemplazarPrimero"); TXN(1, "reemplazarPrimero"); TXN(2, "reemplazarPrimero");
  int64_t i = texto_buscar(a[0], a[1], 0); if (i < 0) return n_inc(a[0]);
  NBuf b = {0}; b_u16(&b, TX(a[0])->s, i); b_txt(&b, a[2]); b_u16(&b, TX(a[0])->s + i + TX(a[1])->n, TX(a[0])->n - i - TX(a[1])->n);
  return b_texto(&b);
}
NAT(tx_repetirTexto) {
  (void)n; (void)extra; ENT(k, 1, "repetirTexto");
  if (k < 0) return n_error("«repetirTexto»: no se puede repetir menos de 0 veces", NULL);
  TXN(0, "repetirTexto");
  if ((double)TX(a[0])->n * k > 1e7) return n_error("«repetirTexto»: el resultado sería demasiado grande", NULL);
  NBuf b = {0}; for (int64_t q = 0; q < (int64_t)k; q++) b_txt(&b, a[0]);
  return b_texto(&b);
}
NAT(tx_invertirTexto) {
  (void)n; (void)extra; TXN(0, "invertirTexto");
  NTexto* t = TX(a[0]); NV r = n_texto_nuevo(t->n); int64_t o = t->n;
  for (int64_t i = 0; i < t->n;) { int64_t j = pc_siguiente(t, i); o -= j - i; memcpy(TX(r)->s + o, t->s + i, sizeof(uint16_t) * (size_t)(j - i)); i = j; }
  return r;
}
NAT(tx_lineas) { (void)n; (void)extra; TXN(0, "lineas"); return lineas_de(a[0]); }
NAT(tx_palabras) { (void)n; (void)extra; TXN(0, "palabras"); return palabras_de(a[0]); }
NAT(tx_caracteres) {
  (void)n; (void)extra; TXN(0, "caracteres"); NTexto* t = TX(a[0]); NV r = n_lista_nueva(t->n);
  for (int64_t i = 0; i < t->n;) { int64_t j = pc_siguiente(t, i); n_lista_agregar(LS(r), sub16(a[0], i, j)); i = j; }
  return r;
}
NAT(tx_envolver) {
  (void)n; (void)extra; TXN(0, "envolver"); ENT(w, 1, "envolver");
  if (w < 1) return n_error("«envolver»: el ancho tiene que ser 1 o más", NULL);
  NV out = n_lista_nueva(4), ps = lineas_de(a[0]);
  for (int64_t q = 0; q < LS(ps)->n; q++) {
    NV pal = palabras_de(n_lv(LS(ps))[q]); NBuf linea = {0}; int hay = 0;
    for (int64_t k = 0; k < LS(pal)->n; k++) {
      NV p = n_lv(LS(pal))[k];
      if (!hay) { b_txt(&linea, p); hay = 1; continue; }
      if ((double)(linea.n + 1 + TX(p)->n) <= w) { b_c(&linea, ' '); b_txt(&linea, p); continue; }
      n_lista_agregar(LS(out), b_texto(&linea)); b_txt(&linea, p);
    }
    n_lista_agregar(LS(out), b_texto(&linea));
    n_dec(pal);
  }
  n_dec(ps);
  return out;
}
NAT(tx_sangrar) {
  (void)extra; TXN(0, "sangrar"); ENT(k, 1, "sangrar");
  NV c; if (n > 2) { TXN(2, "sangrar"); c = n_inc(a[2]); } else c = n_texto_utf8(" ");
  NBuf pb = {0}; for (int64_t q = 0; q < (int64_t)(k > 0 ? k : 0); q++) b_txt(&pb, c);
  n_dec(c);
  NV p = b_texto(&pb), nl = n_texto_utf8("\n"), ls = split_js(a[0], nl);
  NBuf b = {0};
  for (int64_t q = 0; q < LS(ls)->n; q++) { if (q) b_c(&b, '\n'); if (TX(n_lv(LS(ls))[q])->n) b_txt(&b, p); b_txt(&b, n_lv(LS(ls))[q]); }
  n_dec(p); n_dec(nl); n_dec(ls);
  return b_texto(&b);
}
NAT(tx_desangrar) {
  (void)n; (void)extra; TXN(0, "desangrar");
  NV nl = n_texto_utf8("\n"), ls = split_js(a[0], nl); n_dec(nl);
  int64_t min = -1;
  for (int64_t q = 0; q < LS(ls)->n; q++) {
    NTexto* l = TX(n_lv(LS(ls))[q]); int64_t i = 0; while (i < l->n && es_esp_js(l->s[i])) i++;
    if (i == l->n) continue;
    if (min < 0 || i < min) min = i;
  }
  NBuf b = {0};
  for (int64_t q = 0; q < LS(ls)->n; q++) {
    if (q) b_c(&b, '\n');
    NTexto* l = TX(n_lv(LS(ls))[q]); int64_t i = 0; while (i < l->n && es_esp_js(l->s[i])) i++;
    if (min > 0 && i < l->n) b_u16(&b, l->s + min, l->n - min); else b_u16(&b, l->s, l->n);
  }
  n_dec(ls);
  return b_texto(&b);
}
NAT(tx_sinAcentos) { (void)n; (void)extra; TXN(0, "sinAcentos"); return sin_tildes(a[0]); }
NAT(tx_igualSinAcentos) {
  (void)n; (void)extra; TXN(0, "igualSinAcentos"); TXN(1, "igualSinAcentos");
  NV x = sin_tildes(a[0]), y = sin_tildes(a[1]), X = minusculas(x), Y = minusculas(y);
  int r = texto_igual(X, Y); n_dec(x); n_dec(y); n_dec(X); n_dec(Y); return n_bool(r);
}
static NV* ord_claves;
static int cmp_es_idx(const void* p, const void* q) {
  int64_t i = *(const int64_t*)p, j = *(const int64_t*)q;
  int c = texto_cmp(ord_claves[i], ord_claves[j]);
  return c ? c : (i < j ? -1 : 1);      /* estable */
}
NAT(tx_ordenAlfabetico) {
  (void)n; (void)extra; LST(a[0], 1, "ordenAlfabetico"); NLista* l = LS(a[0]);
  NV* xs = (NV*)n_mem(sizeof(NV) * (size_t)(l->n + 1)); NV* ks = (NV*)n_mem(sizeof(NV) * (size_t)(l->n + 1));
  int64_t* ix = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(l->n + 1));
  for (int64_t i = 0; i < l->n; i++) { xs[i] = n_texto_de(n_lv(l)[i]); ks[i] = clave_es(xs[i]); ix[i] = i; }
  ord_claves = ks; qsort(ix, (size_t)l->n, sizeof(int64_t), cmp_es_idx);
  NV r = n_lista_nueva(l->n);
  for (int64_t i = 0; i < l->n; i++) n_lista_agregar(LS(r), n_inc(xs[ix[i]]));
  for (int64_t i = 0; i < l->n; i++) { n_dec(xs[i]); n_dec(ks[i]); }
  free(xs); free(ks); free(ix);
  return r;
}
NAT(tx_distancia) {
  (void)n; (void)extra; TXN(0, "distancia"); TXN(1, "distancia");
  if ((double)TX(a[0])->n * (double)TX(a[1])->n > 4e6) return n_error("«distancia»: los textos son demasiado largos", NULL);
  return n_num((double)levenshtein(TX(a[0]), TX(a[1])));
}
NAT(tx_parecido) {
  (void)n; (void)extra; TXN(0, "parecido"); TXN(1, "parecido");
  NV x0 = sin_tildes(a[0]), y0 = sin_tildes(a[1]), x = minusculas(x0), y = minusculas(y0); n_dec(x0); n_dec(y0);
  NV r;
  if (!TX(x)->n && !TX(y)->n) r = n_num(1);
  else if ((double)TX(x)->n * (double)TX(y)->n > 4e6) r = n_error("«parecido»: los textos son demasiado largos", NULL);
  else { double m = (double)(TX(x)->n > TX(y)->n ? TX(x)->n : TX(y)->n); r = n_num(1 - (double)levenshtein(TX(x), TX(y)) / m); }
  n_dec(x); n_dec(y); return r;
}
NAT(tx_aUrl) {
  (void)n; (void)extra; TXN(0, "aUrl");
  NV s0 = sin_tildes(a[0]), s = minusculas(s0); n_dec(s0);
  NTexto* t = TX(s); NBuf b = {0}; int guion = 0;
  for (int64_t i = 0; i < t->n; i++) {
    uint16_t c = t->s[i]; if (c == 0xF1) c = 'n';
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { if (guion && b.n) b_c(&b, '-'); guion = 0; b_c(&b, c); }
    else guion = 1;
  }
  n_dec(s);
  return b_texto(&b);
}
NAT(tx_aIdentificador) {
  (void)n; (void)extra; TXN(0, "aIdentificador");
  NV s = recortar_js(a[0], 1, 1); NTexto* t = TX(s); NBuf b = {0};
  for (int64_t i = 0; i < t->n;) {
    if (es_esp_js(t->s[i])) { while (i < t->n && es_esp_js(t->s[i])) i++; b_c(&b, '_'); continue; }
    uint16_t c = t->s[i++];
    if (es_letra_es(c) || (c >= '0' && c <= '9') || c == '_') b_c(&b, c);
  }
  n_dec(s);
  if (!b.n) { free(b.s); return n_error("«aIdentificador»: no queda nada que pueda ser un nombre", NULL); }
  if (b.s[0] >= '0' && b.s[0] <= '9') { b_crecer(&b, 1); memmove(b.s + 1, b.s, sizeof(uint16_t) * (size_t)b.n); b.s[0] = '_'; b.n++; }
  return b_texto(&b);
}
NAT(tx_codigo) {
  (void)n; (void)extra; TXN(0, "codigo"); NTexto* t = TX(a[0]);
  if (!t->n) return n_error("«codigo» de un texto vacío", NULL);
  uint32_t c = t->s[0];
  if (pc_siguiente(t, 0) == 2) c = 0x10000 + ((c - 0xD800) << 10) + (t->s[1] - 0xDC00);
  return n_num(c);
}
NAT(tx_deCodigo) {
  (void)n; (void)extra; ENT(k, 0, "deCodigo");
  if (k < 0 || k > 0x10FFFF) return ERR("«deCodigo»: %j no es un carácter", k);
  uint32_t c = (uint32_t)k; uint16_t u[2];
  if (c >= 0x10000) { c -= 0x10000; u[0] = (uint16_t)(0xD800 + (c >> 10)); u[1] = (uint16_t)(0xDC00 + (c & 0x3FF)); return n_texto_utf16(u, 2); }
  u[0] = (uint16_t)c; return n_texto_utf16(u, 1);
}
static NV clase_txt(NV* a, const char* f, int (*es)(uint16_t)) {
  TXT(a[0], 1, f); NTexto* t = TX(a[0]);
  if (!t->n) return n_bool(0);
  for (int64_t i = 0; i < t->n; i++) if (!es(t->s[i])) return n_bool(0);
  return n_bool(1);
}
static int es_dig(uint16_t c) { return c >= '0' && c <= '9'; }
static int es_esp(uint16_t c) { return es_esp_js(c); }
NAT(tx_esLetra) { (void)n; (void)extra; return clase_txt(a, "esLetra", es_letra_es); }
NAT(tx_esDigito) { (void)n; (void)extra; return clase_txt(a, "esDigito", es_dig); }
NAT(tx_esEspacio) { (void)n; (void)extra; return clase_txt(a, "esEspacio", es_esp); }
NAT(tx_esVocal) { (void)n; (void)extra; return clase_txt(a, "esVocal", es_vocal_es); }
NAT(tx_esMayuscula) {
  (void)n; (void)extra; TXN(0, "esMayuscula"); NTexto* t = TX(a[0]); int hay = 0;
  for (int64_t i = 0; i < t->n; i++) if (es_letra_es(t->s[i])) hay = 1;
  if (!hay) return n_bool(0);
  NV m = mayusculas(a[0]); int r = texto_igual(m, a[0]); n_dec(m); return n_bool(r);
}
NAT(tx_plantilla) {
  (void)n; (void)extra; TXN(0, "plantilla");
  if (!n_es(a[1], NC_DIC)) return n_error("«plantilla»: el argumento 2 debe ser un diccionario", NULL);
  NTexto* t = TX(a[0]); NBuf b = {0};
  for (int64_t i = 0; i < t->n;) {
    if (t->s[i] == '{') {
      int64_t j = i + 1; while (j < t->n && t->s[j] != '{' && t->s[j] != '}') j++;
      if (j < t->n && t->s[j] == '}') {
        NV k0 = sub16(a[0], i + 1, j), k = recortar_js(k0, 1, 1); n_dec(k0);
        NV v;
        if (!n_dic_buscar(DC(a[1]), k, &v)) {
          NDic* d = DC(a[1]); NV pista;
          if (d->n) { NBuf kb = {0}; int pr = 1; for (int64_t q = 0; q < d->usados; q++) if (d->e[q].vivo) { if (!pr) b_utf8(&kb, ", "); pr = 0; if (n_es(d->e[q].k, NC_TEXTO)) b_txt(&kb, d->e[q].k); else repr_en(&kb, d->e[q].k, 0); }
            NV ks = b_texto(&kb); pista = msg("el diccionario trae: %v", ks); n_dec(ks); }
          else pista = n_texto_utf8("el diccionario está vacío");
          free(b.s); NV r = ERRP(pista, "«plantilla»: falta «%v»", k); n_dec(k); return r;
        }
        if (n_es(v, NC_TEXTO)) b_txt(&b, v); else repr_en(&b, v, 1);
        n_dec(k); i = j + 1; continue;
      }
    }
    b_c(&b, t->s[i]); i++;
  }
  return b_texto(&b);
}
NAT(tx_escaparHtml) {
  (void)n; (void)extra; TXN(0, "escaparHtml"); NTexto* t = TX(a[0]); NBuf b = {0};
  for (int64_t i = 0; i < t->n; i++) {
    uint16_t c = t->s[i];
    if (c == '&') b_utf8(&b, "&amp;"); else if (c == '<') b_utf8(&b, "&lt;"); else if (c == '>') b_utf8(&b, "&gt;");
    else if (c == '"') b_utf8(&b, "&quot;"); else if (c == '\'') b_utf8(&b, "&#39;"); else b_c(&b, c);
  }
  return b_texto(&b);
}
NAT(tx_escaparCsv) {
  (void)n; (void)extra; TXN(0, "escaparCsv"); NTexto* t = TX(a[0]); int hace = 0;
  for (int64_t i = 0; i < t->n; i++) { uint16_t c = t->s[i]; if (c == '"' || c == ',' || c == '\n' || c == '\r' || c == ';') hace = 1; }
  if (!hace) return n_inc(a[0]);
  NBuf b = {0}; b_c(&b, '"');
  for (int64_t i = 0; i < t->n; i++) { if (t->s[i] == '"') b_c(&b, '"'); b_c(&b, t->s[i]); }
  b_c(&b, '"');
  return b_texto(&b);
}
#define NAT_TEXTO \
  { "texto/mayusculas", 1, tx_mayusculas }, { "texto/minusculas", 1, tx_minusculas }, { "texto/recortar", 1, tx_recortar }, \
  { "texto/dividir", -1, tx_dividir }, { "texto/unir", 2, tx_unir }, { "texto/reemplazar", 3, tx_reemplazar }, \
  { "texto/empiezaCon", 2, tx_empiezaCon }, { "texto/terminaCon", 2, tx_terminaCon }, { "texto/subtexto", 3, tx_subtexto }, \
  { "texto/indiceDe", -1, tx_indiceDe }, { "texto/ultimoIndiceDe", 2, tx_ultimoIndiceDe }, { "texto/cuantasVeces", 2, tx_cuantasVeces }, \
  { "texto/izquierda", 2, tx_izquierda }, { "texto/derecha", 2, tx_derecha }, { "texto/entre", 3, tx_entre }, \
  { "texto/antesDe", 2, tx_antesDe }, { "texto/despuesDe", 2, tx_despuesDe }, { "texto/recortarIzq", 1, tx_recortarIzq }, \
  { "texto/recortarDer", 1, tx_recortarDer }, { "texto/quitarPrefijo", 2, tx_quitarPrefijo }, { "texto/quitarSufijo", 2, tx_quitarSufijo }, \
  { "texto/capitalizar", 1, tx_capitalizar }, { "texto/titular", 1, tx_titular }, { "texto/reemplazarPrimero", 3, tx_reemplazarPrimero }, \
  { "texto/repetirTexto", 2, tx_repetirTexto }, { "texto/invertirTexto", 1, tx_invertirTexto }, { "texto/lineas", 1, tx_lineas }, \
  { "texto/palabras", 1, tx_palabras }, { "texto/caracteres", 1, tx_caracteres }, { "texto/envolver", 2, tx_envolver }, \
  { "texto/sangrar", -1, tx_sangrar }, { "texto/desangrar", 1, tx_desangrar }, { "texto/sinAcentos", 1, tx_sinAcentos }, \
  { "texto/igualSinAcentos", 2, tx_igualSinAcentos }, { "texto/ordenAlfabetico", 1, tx_ordenAlfabetico }, { "texto/distancia", 2, tx_distancia }, \
  { "texto/parecido", 2, tx_parecido }, { "texto/aUrl", 1, tx_aUrl }, { "texto/aIdentificador", 1, tx_aIdentificador }, \
  { "texto/codigo", 1, tx_codigo }, { "texto/deCodigo", 1, tx_deCodigo }, { "texto/esLetra", 1, tx_esLetra }, \
  { "texto/esDigito", 1, tx_esDigito }, { "texto/esEspacio", 1, tx_esEspacio }, { "texto/esVocal", 1, tx_esVocal }, \
  { "texto/esMayuscula", 1, tx_esMayuscula }, { "texto/plantilla", 2, tx_plantilla }, { "texto/escaparHtml", 1, tx_escaparHtml }, \
  { "texto/escaparCsv", 1, tx_escaparCsv },
