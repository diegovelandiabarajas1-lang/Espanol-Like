/* ============================================================================
 *  Ñ sin runtime (motor-exp N4.1) — la biblioteca de apoyo. Ver nrt.h.
 *
 *  Cada función de aquí hace LO MISMO que su par de la VM (src/03-vm-jit.js y
 *  src/04-stdlib.js): los mismos resultados y los mismos mensajes de error,
 *  letra por letra. pruebas/exp-aot.js lo comprueba corriendo cada programa
 *  en la VM y como ejecutable y comparando lo que imprimen.
 * ========================================================================== */
#include "nrt.h"
#include "nrt_fdlibm.inc"      /* Math.sin, Math.pow… de V8: los mismos bits que la VM */
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <time.h>
#if defined(_WIN32)
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#else
#include <unistd.h>
#include <sys/time.h>
#endif

N_HILO_LOCAL NHilo n_hilo;
static int n_argc; static char** n_argv;

/* ════════════════════════════════════════════════════════════ memoria */
static void* n_mem(size_t b) {
  void* p = malloc(b ? b : 1);
  if (!p) { fputs("[ejecución] no queda memoria\n", stdout); fflush(stdout); exit(1); }
  return p;
}
static void* n_remem(void* p, size_t b) {
  void* q = realloc(p, b ? b : 1);
  if (!q) { fputs("[ejecución] no queda memoria\n", stdout); fflush(stdout); exit(1); }
  return q;
}
static void* n_objeto(size_t b, NClase c) {
  NObj* o = (NObj*)n_mem(b);
  o->rc = 1; o->clase = (uint8_t)c; o->inmortal = 0;
  return o;
}
void n_liberar(NObj* o) {
  if (o->inmortal) { o->rc = N_INMORTAL_RC; return; }
  switch (o->clase) {
    case NC_TEXTO: break;
    case NC_LISTA: { NLista* l = (NLista*)o; for (int64_t i = 0; i < l->n; i++) n_dec(l->v[i]); free(l->v); break; }
    case NC_DIC: {
      NDic* d = (NDic*)o;
      for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) { n_dec(d->e[i].k); n_dec(d->e[i].v); }
      free(d->e); free(d->tabla);
      if (d->reg) n_dec(n_obj(d->reg));
      break;
    }
    case NC_CIERRE: { NCierre* c = (NCierre*)o; for (int i = 0; i < c->nup; i++) if (c->up[i]) n_dec(n_obj(c->up[i])); break; }
    case NC_NATIVA: { NNativa* f = (NNativa*)o; n_dec(f->extraV); if (f->registro) n_dec(n_obj(f->registro)); free((char*)f->nombre); break; }   /* solo se liberan las de nativa_con, que copian su nombre */
    case NC_ERROR: { NError* e = (NError*)o; n_dec(e->tipo); n_dec(e->mensaje); break; }
    case NC_UP: { NUp* u = (NUp*)o; if (u->p == &u->cerrado) n_dec(u->cerrado); break; }
    case NC_REGDESC: { NRegDesc* r = (NRegDesc*)o; n_dec(r->nombre); n_dec(r->campos); n_dec(r->metodos); break; }
    default: break;
  }
  free(o);
}

/* ════════════════════════════════════════════════════════════ textos */
NV n_texto_nuevo(int64_t n) {
  NTexto* t = (NTexto*)n_objeto(sizeof(NTexto) + sizeof(uint16_t) * (size_t)(n ? n : 1), NC_TEXTO);
  t->n = n; t->hash = 0;
  return n_obj(t);
}
NV n_texto_utf16(const uint16_t* s, int64_t n) {
  NV v = n_texto_nuevo(n);
  if (n) memcpy(((NTexto*)v.u.o)->s, s, sizeof(uint16_t) * (size_t)n);
  return v;
}
NV n_texto_inmortal_utf16(const uint16_t* s, int64_t n) {
  NV v = n_texto_utf16(s, n);
  v.u.o->inmortal = 1; v.u.o->rc = N_INMORTAL_RC;
  return v;
}
/* UTF-8 → UTF-16, como hace Node al leer un texto (lo inválido, U+FFFD) */
static int64_t utf8_a_16(const unsigned char* s, int64_t n, uint16_t* out) {
  int64_t o = 0;
  for (int64_t i = 0; i < n;) {
    uint32_t c = s[i], cp; int extra;
    if (c < 0x80) { cp = c; extra = 0; }
    else if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; extra = 1; }
    else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; extra = 2; }
    else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; extra = 3; }
    else { if (out) out[o] = 0xFFFD; o++; i++; continue; }
    int ok = 1;
    for (int k = 1; k <= extra; k++) { if (i + k >= n || (s[i + k] & 0xC0) != 0x80) { ok = 0; break; } cp = (cp << 6) | (s[i + k] & 0x3F); }
    if (!ok) { if (out) out[o] = 0xFFFD; o++; i++; continue; }
    i += extra + 1;
    if (cp >= 0x10000) { cp -= 0x10000; if (out) { out[o] = (uint16_t)(0xD800 + (cp >> 10)); out[o + 1] = (uint16_t)(0xDC00 + (cp & 0x3FF)); } o += 2; }
    else { if (out) out[o] = (uint16_t)cp; o++; }
  }
  return o;
}
NV n_texto_utf8(const char* s) {
  int64_t n = (int64_t)strlen(s);
  int64_t m = utf8_a_16((const unsigned char*)s, n, NULL);
  NV v = n_texto_nuevo(m);
  utf8_a_16((const unsigned char*)s, n, ((NTexto*)v.u.o)->s);
  return v;
}
NV n_texto_utf8n(const char* s, int64_t n) {
  int64_t m = utf8_a_16((const unsigned char*)s, n, NULL);
  NV v = n_texto_nuevo(m);
  utf8_a_16((const unsigned char*)s, n, ((NTexto*)v.u.o)->s);
  return v;
}
/* UTF-16 → UTF-8; un sustituto suelto sale como U+FFFD (como Node) */
char* n_a_utf8(NV v, int64_t* largo) {
  NTexto* t = (NTexto*)v.u.o;
  char* out = (char*)n_mem((size_t)t->n * 3 + 1);
  int64_t o = 0;
  for (int64_t i = 0; i < t->n; i++) {
    uint32_t c = t->s[i];
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t->n && t->s[i + 1] >= 0xDC00 && t->s[i + 1] <= 0xDFFF) {
      c = 0x10000 + ((c - 0xD800) << 10) + (t->s[i + 1] - 0xDC00); i++;
    } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
    if (c < 0x80) out[o++] = (char)c;
    else if (c < 0x800) { out[o++] = (char)(0xC0 | (c >> 6)); out[o++] = (char)(0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { out[o++] = (char)(0xE0 | (c >> 12)); out[o++] = (char)(0x80 | ((c >> 6) & 0x3F)); out[o++] = (char)(0x80 | (c & 0x3F)); }
    else { out[o++] = (char)(0xF0 | (c >> 18)); out[o++] = (char)(0x80 | ((c >> 12) & 0x3F)); out[o++] = (char)(0x80 | ((c >> 6) & 0x3F)); out[o++] = (char)(0x80 | (c & 0x3F)); }
  }
  out[o] = 0;
  if (largo) *largo = o;
  return out;
}
#define TX(v) ((NTexto*)(v).u.o)
static int texto_igual(NV a, NV b) {
  NTexto *x = TX(a), *y = TX(b);
  return x->n == y->n && (x->n == 0 || memcmp(x->s, y->s, sizeof(uint16_t) * (size_t)x->n) == 0);
}
static int texto_cmp(NV a, NV b) {   /* por unidades de UTF-16, como JavaScript */
  NTexto *x = TX(a), *y = TX(b);
  int64_t n = x->n < y->n ? x->n : y->n;
  for (int64_t i = 0; i < n; i++) if (x->s[i] != y->s[i]) return x->s[i] < y->s[i] ? -1 : 1;
  return x->n < y->n ? -1 : (x->n > y->n ? 1 : 0);
}
static uint32_t texto_hash(NV v) {
  NTexto* t = TX(v);
  if (t->hash) return t->hash;
  uint32_t h = 2166136261u;
  for (int64_t i = 0; i < t->n; i++) { h ^= t->s[i]; h *= 16777619u; }
  if (!h) h = 1;
  t->hash = h;
  return h;
}

/* Un búfer de UTF-16 que crece: con él se arman repr, texto y los mensajes. */
typedef struct { uint16_t* s; int64_t n, cap; } NBuf;
static void b_crecer(NBuf* b, int64_t mas) {
  if (b->n + mas <= b->cap) return;
  int64_t c = b->cap ? b->cap * 2 : 64;
  while (c < b->n + mas) c *= 2;
  b->s = (uint16_t*)n_remem(b->s, sizeof(uint16_t) * (size_t)c); b->cap = c;
}
static void b_u16(NBuf* b, const uint16_t* s, int64_t n) { b_crecer(b, n); if (n) memcpy(b->s + b->n, s, sizeof(uint16_t) * (size_t)n); b->n += n; }
static void b_txt(NBuf* b, NV t) { b_u16(b, TX(t)->s, TX(t)->n); }
static void b_c(NBuf* b, uint16_t c) { b_crecer(b, 1); b->s[b->n++] = c; }
static void b_utf8(NBuf* b, const char* s) {
  int64_t n = (int64_t)strlen(s), m = utf8_a_16((const unsigned char*)s, n, NULL);
  b_crecer(b, m); utf8_a_16((const unsigned char*)s, n, b->s + b->n); b->n += m;
}
static NV b_texto(NBuf* b) { NV v = n_texto_utf16(b->s, b->n); free(b->s); b->s = NULL; b->n = b->cap = 0; return v; }

/* ════════════════════════════════════════════════════════════ números */
/* Number.prototype.toString de JavaScript: los dígitos más cortos que vuelven
   al mismo número, y la forma (con exponente o sin él) que elige JavaScript. */
static void num_js(double x, char* out) {
  if (x == 0) { strcpy(out, "0"); return; }
  if (isnan(x)) { strcpy(out, "NaN"); return; }
  if (isinf(x)) { strcpy(out, x > 0 ? "Infinity" : "-Infinity"); return; }
  char buf[40], dig[24]; int k = 0, e10 = 0;
  for (int p = 1; p <= 17; p++) {
    snprintf(buf, sizeof buf, "%.*e", p - 1, x);
    if (strtod(buf, NULL) == x) break;
  }
  const char* s = buf; int neg = 0;
  if (*s == '-') { neg = 1; s++; }
  for (; *s && *s != 'e'; s++) if (*s >= '0' && *s <= '9') dig[k++] = *s;
  if (*s == 'e') e10 = atoi(s + 1);
  while (k > 1 && dig[k - 1] == '0') k--;
  dig[k] = 0;
  int n = e10 + 1;
  char* o = out;
  if (neg) *o++ = '-';
  if (k <= n && n <= 21) { memcpy(o, dig, (size_t)k); o += k; for (int i = 0; i < n - k; i++) *o++ = '0'; *o = 0; }
  else if (0 < n && n <= 21) { memcpy(o, dig, (size_t)n); o += n; *o++ = '.'; memcpy(o, dig + n, (size_t)(k - n)); o += k - n; *o = 0; }
  else if (-6 < n && n <= 0) { *o++ = '0'; *o++ = '.'; for (int i = 0; i < -n; i++) *o++ = '0'; memcpy(o, dig, (size_t)k); o += k; *o = 0; }
  else {
    int e = n - 1;
    *o++ = dig[0];
    if (k > 1) { *o++ = '.'; memcpy(o, dig + 1, (size_t)(k - 1)); o += k - 1; }
    sprintf(o, "e%c%d", e < 0 ? '-' : '+', e < 0 ? -e : e);
  }
}
/* Cómo imprime un número la VM: entero tal cual; real con 15 cifras. */
static void num_repr(double v, char* out) {
  if (v == INFINITY) { strcpy(out, "infinito"); return; }
  if (v == -INFINITY) { strcpy(out, "-infinito"); return; }
  if (isnan(v)) { strcpy(out, "no es un número"); return; }
  if (v == trunc(v)) { num_js(v, out); return; }
  char b[40]; snprintf(b, sizeof b, "%.14e", v);
  num_js(strtod(b, NULL), out);
}
static int es_entero(double v) { return isfinite(v) && v == trunc(v); }

/* ════════════════════════════════════════════════════════════ errores */
static NV T(const char* s) { return n_texto_utf8(s); }
static void err_limpiar(void) {
  if (!n_hilo.hay) return;
  n_dec(n_hilo.valor); n_dec(n_hilo.mensaje); n_dec(n_hilo.pista); n_dec(n_hilo.tipo);
  n_hilo.valor = n_hilo.mensaje = n_hilo.pista = n_hilo.tipo = n_nulo();
  n_hilo.hay = 0; n_hilo.lanzado = 0; n_hilo.fatal = 0; n_hilo.ntraza = 0;
}
NV n_errorT(NV msg, NV pista) {
  err_limpiar();
  n_hilo.hay = 1; n_hilo.lanzado = 0;
  n_hilo.mensaje = msg; n_hilo.pista = pista; n_hilo.tipo = n_nulo(); n_hilo.valor = n_nulo();
  n_hilo.linea = n_hilo.nmarcos ? n_hilo.marcos[n_hilo.nmarcos - 1].linea : 0;
  n_hilo.ntraza = 0;
  for (int i = n_hilo.nmarcos - 1; i >= 0 && n_hilo.ntraza < N_MAX_TRAZA; i--) n_hilo.traza[n_hilo.ntraza++] = n_hilo.marcos[i];
  return N_ERR;
}
NV n_error(const char* msg, const char* pista) { return n_errorT(T(msg), pista ? T(pista) : n_nulo()); }
NV n_errorf(const char* fmt, ...) {
  char b[2048]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  return n_error(b, NULL);
}
static NV error_obj(NV tipo, NV mensaje, double linea) {
  NError* e = (NError*)n_objeto(sizeof(NError), NC_ERROR);
  e->tipo = tipo; e->mensaje = mensaje; e->linea = linea;
  return n_obj(e);
}
NV n_lanzar(NV v) {
  NV msg;
  if (n_es(v, NC_ERROR)) msg = n_inc(((NError*)v.u.o)->mensaje);
  else { NBuf b = {0}; b_utf8(&b, "error sin capturar: "); NV r = n_repr(v, 1); b_txt(&b, r); n_dec(r); msg = b_texto(&b); }
  err_limpiar();
  n_hilo.hay = 1; n_hilo.lanzado = 1; n_hilo.valor = n_inc(v);
  n_hilo.mensaje = msg; n_hilo.pista = n_nulo(); n_hilo.tipo = n_nulo();
  n_hilo.linea = n_hilo.nmarcos ? n_hilo.marcos[n_hilo.nmarcos - 1].linea : 0;
  n_hilo.ntraza = 0;
  return N_ERR;
}
/* Lo que recibe «capturar (e)»: lo lanzado tal cual, o un error del motor. */
NV n_error_capturado(void) {
  NV r;
  if (n_hilo.lanzado) r = n_inc(n_hilo.valor);
  else r = error_obj(n_hilo.tipo.t == N_NULO ? T("motor") : n_inc(n_hilo.tipo), n_inc(n_hilo.mensaje), n_hilo.linea);
  err_limpiar();
  return r;
}
void n_salida(NV t) {
  int64_t n; char* s = n_a_utf8(t, &n);
  fwrite(s, 1, (size_t)n, stdout); fputc('\n', stdout);
  free(s);
}
void n_fallo_final(void) {
  NBuf b = {0};
  b_utf8(&b, "[ejecución] "); b_txt(&b, n_hilo.mensaje);
  if (n_hilo.pista.t == N_OBJ) { b_utf8(&b, "\n   \xE2\x86\xB3 "); b_txt(&b, n_hilo.pista); }
  for (int i = 0; i < n_hilo.ntraza; i++) {
    char l[256]; snprintf(l, sizeof l, "\n   en %s (línea %d)", n_hilo.traza[i].nombre, n_hilo.traza[i].linea);
    b_utf8(&b, l);
  }
  NV t = b_texto(&b); n_salida(t); n_dec(t);
  fflush(stdout);
  exit(1);
}
NV n_global_no_definida(const char* nombre) {
  /* mensajeNoDefinida de src/06-modulos.js (sin módulos todavía) */
  char b[512]; snprintf(b, sizeof b, "«%s» no está definida", nombre);
  return n_error(b, NULL);
}

/* ════════════════════════════════════════════════════════════ tipos */
const char* n_tipo_de(NV v) {
  switch (v.t) {
    case N_NULO: return "nulo";
    case N_BOOL: return "bool";
    case N_NUM: return es_entero(v.u.n) ? "entero" : "real";
    default: break;
  }
  switch (v.u.o->clase) {
    case NC_TEXTO: return "texto";
    case NC_LISTA: return "lista";
    case NC_DIC: return "dic";
    case NC_ERROR: return "error";
    case NC_FECHA: return "fecha";
    default: return "funcion";
  }
}
int n_verdad(NV v) {
  switch (v.t) {
    case N_NULO: return 0;
    case N_BOOL: return v.u.b;
    case N_NUM: return v.u.n != 0;          /* NaN es verdad, como en JavaScript */
    default: break;
  }
  if (v.u.o->clase == NC_TEXTO) return TX(v)->n != 0;
  if (v.u.o->clase == NC_LISTA) return ((NLista*)v.u.o)->n != 0;
  return 1;
}

/* ════════════════════════════════════════════════════════════ listas */
NV n_lista_nueva(int64_t cap) {
  NLista* l = (NLista*)n_objeto(sizeof(NLista), NC_LISTA);
  l->n = 0; l->cap = cap > 4 ? cap : 4;
  l->v = (NV*)n_mem(sizeof(NV) * (size_t)l->cap);
  return n_obj(l);
}
void n_lista_agregar(NLista* l, NV v) {
  if (l->n == l->cap) { l->cap *= 2; l->v = (NV*)n_remem(l->v, sizeof(NV) * (size_t)l->cap); }
  l->v[l->n++] = v;
}
NV n_lista_de(NV* v, int n) {
  NV r = n_lista_nueva(n);
  NLista* l = (NLista*)r.u.o;
  for (int i = 0; i < n; i++) l->v[i] = n_inc(v[i]);
  l->n = n;
  return r;
}
#define LS(v) ((NLista*)(v).u.o)
NV n_lista_tomar(NV* v, int n) {      /* se queda con las referencias de v */
  NV r = n_lista_nueva(n);
  NLista* l = LS(r);
  for (int i = 0; i < n; i++) l->v[i] = v[i];
  l->n = n;
  return r;
}

/* ════════════════════════════════════════════════════════════ diccionarios */
/* El Map de JavaScript: orden de inserción y claves por SameValueZero (NaN es
   igual a NaN, 0 es igual a −0, un texto por su contenido, un objeto por quién es). */
static uint32_t clave_hash(NV k) {
  switch (k.t) {
    case N_NULO: return 7;
    case N_BOOL: return k.u.b ? 11 : 13;
    case N_NUM: {
      double d = k.u.n;
      if (d == 0) d = 0;
      if (isnan(d)) return 17;
      uint64_t b; memcpy(&b, &d, 8); b ^= b >> 33; b *= 0xff51afd7ed558ccdULL; b ^= b >> 33;
      return (uint32_t)b;
    }
    default: break;
  }
  if (k.u.o->clase == NC_TEXTO) return texto_hash(k);
  uintptr_t p = (uintptr_t)k.u.o; p ^= p >> 17; p *= 0x9E3779B97F4A7C15ULL;
  return (uint32_t)(p >> 32);
}
static int clave_igual(NV a, NV b) {
  if (a.t != b.t) return 0;
  switch (a.t) {
    case N_NULO: return 1;
    case N_BOOL: return a.u.b == b.u.b;
    case N_NUM: return a.u.n == b.u.n || (isnan(a.u.n) && isnan(b.u.n));
    default: break;
  }
  if (a.u.o == b.u.o) return 1;
  if (a.u.o->clase == NC_TEXTO && b.u.o->clase == NC_TEXTO) return texto_igual(a, b);
  return 0;
}
NV n_dic_nuevo(void) {
  NDic* d = (NDic*)n_objeto(sizeof(NDic), NC_DIC);
  d->n = d->usados = 0; d->cap = 8; d->e = (NEntrada*)n_mem(sizeof(NEntrada) * 8);
  d->ntabla = 16; d->tabla = (int64_t*)n_mem(sizeof(int64_t) * 16);
  for (int i = 0; i < 16; i++) d->tabla[i] = -1;
  d->reg = NULL;
  return n_obj(d);
}
static int64_t dic_hueco(NDic* d, NV k) {
  uint64_t m = (uint64_t)d->ntabla - 1, i = clave_hash(k) & m;
  for (;;) {
    int64_t j = d->tabla[i];
    if (j == -1) return -(int64_t)i - 1;
    if (j >= 0 && d->e[j].vivo && clave_igual(d->e[j].k, k)) return j;
    i = (i + 1) & m;
  }
}
static void dic_rehacer(NDic* d) {
  /* compacta las entradas (sin las borradas) y rehace la tabla */
  int64_t o = 0;
  for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) d->e[o++] = d->e[i];
  d->usados = o;
  while (d->ntabla < (d->n + 1) * 2) d->ntabla *= 2;
  d->tabla = (int64_t*)n_remem(d->tabla, sizeof(int64_t) * (size_t)d->ntabla);
  for (int64_t i = 0; i < d->ntabla; i++) d->tabla[i] = -1;
  uint64_t m = (uint64_t)d->ntabla - 1;
  for (int64_t j = 0; j < d->usados; j++) {
    uint64_t i = clave_hash(d->e[j].k) & m;
    while (d->tabla[i] != -1) i = (i + 1) & m;
    d->tabla[i] = j;
  }
}
int n_dic_buscar(NDic* d, NV k, NV* v) {
  int64_t j = dic_hueco(d, k);
  if (j < 0) return 0;
  if (v) *v = d->e[j].v;
  return 1;
}
int n_dic_poner(NDic* d, NV k, NV v) {
  int64_t j = dic_hueco(d, k);
  if (j >= 0) { n_asignar(&d->e[j].v, v); return 0; }
  if (d->usados == d->cap) { d->cap *= 2; d->e = (NEntrada*)n_remem(d->e, sizeof(NEntrada) * (size_t)d->cap); }
  if ((d->usados + 1) * 2 > d->ntabla) { dic_rehacer(d); j = dic_hueco(d, k); }
  int64_t slot = -j - 1;
  d->e[d->usados].k = n_inc(k); d->e[d->usados].v = n_inc(v); d->e[d->usados].vivo = 1;
  d->tabla[slot] = d->usados;
  d->usados++; d->n++;
  return 1;
}
int n_dic_borrar(NDic* d, NV k) {
  int64_t j = dic_hueco(d, k);
  if (j < 0) return 0;
  d->e[j].vivo = 0; n_dec(d->e[j].k); n_dec(d->e[j].v); d->n--;
  dic_rehacer(d);
  return 1;
}
#define DC(v) ((NDic*)(v).u.o)
NV n_dic_de(NV* kv, int n) {
  NV r = n_dic_nuevo();
  for (int i = 0; i < n; i++) n_dic_poner(DC(r), kv[2 * i], kv[2 * i + 1]);
  return r;
}

/* ════════════════════════════════════════════════════════════ repr */
static void repr_en(NBuf* b, NV v, int prof);
static void iso_de_fecha(NBuf* b, double ms);   /* en nrt_fecha.inc */
static void json_texto(NBuf* b, NV t) {
  NTexto* x = TX(t);
  b_c(b, '"');
  for (int64_t i = 0; i < x->n; i++) {
    uint16_t c = x->s[i];
    if (c == '"') { b_c(b, '\\'); b_c(b, '"'); }
    else if (c == '\\') { b_c(b, '\\'); b_c(b, '\\'); }
    else if (c == '\b') { b_c(b, '\\'); b_c(b, 'b'); }
    else if (c == '\f') { b_c(b, '\\'); b_c(b, 'f'); }
    else if (c == '\n') { b_c(b, '\\'); b_c(b, 'n'); }
    else if (c == '\r') { b_c(b, '\\'); b_c(b, 'r'); }
    else if (c == '\t') { b_c(b, '\\'); b_c(b, 't'); }
    else if (c < 0x20 || (c >= 0xD800 && c <= 0xDFFF &&
             !((c <= 0xDBFF && i + 1 < x->n && x->s[i + 1] >= 0xDC00 && x->s[i + 1] <= 0xDFFF) ||
               (c >= 0xDC00 && i > 0 && x->s[i - 1] >= 0xD800 && x->s[i - 1] <= 0xDBFF)))) {
      char h[8]; snprintf(h, sizeof h, "\\u%04x", c); b_utf8(b, h);
    } else b_c(b, c);
  }
  b_c(b, '"');
}
static int parece_numero(NV t) {   /* /^-?\d+(\.\d+)?$/ o vacío */
  NTexto* x = TX(t); int64_t i = 0, n = x->n;
  if (n == 0) return 1;
  if (x->s[0] == '-') i++;
  int64_t d0 = i; while (i < n && x->s[i] >= '0' && x->s[i] <= '9') i++;
  if (i == d0) return 0;
  if (i == n) return 1;
  if (x->s[i] != '.') return 0;
  i++; int64_t d1 = i; while (i < n && x->s[i] >= '0' && x->s[i] <= '9') i++;
  return i > d1 && i == n;
}
static void repr_en(NBuf* b, NV v, int prof) {
  char nb[64];
  switch (v.t) {
    case N_NULO: b_utf8(b, "nulo"); return;
    case N_BOOL: b_utf8(b, v.u.b ? "cierto" : "falso"); return;
    case N_NUM: num_repr(v.u.n, nb); b_utf8(b, nb); return;
    default: break;
  }
  switch (v.u.o->clase) {
    case NC_TEXTO: if (prof == 0) b_txt(b, v); else json_texto(b, v); return;
    case NC_LISTA: {
      if (prof > 4) { b_utf8(b, "[\xE2\x80\xA6]"); return; }
      b_c(b, '[');
      NLista* l = LS(v);
      for (int64_t i = 0; i < l->n; i++) { if (i) { b_c(b, ','); b_c(b, ' '); } repr_en(b, l->v[i], prof + 1); }
      b_c(b, ']'); return;
    }
    case NC_DIC: {
      NDic* d = DC(v);
      if (d->reg) {
        b_txt(b, d->reg->nombre);
        if (prof > 4) { b_utf8(b, "{\xE2\x80\xA6}"); return; }
        b_c(b, '{'); int pr = 1;
        for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) {
          if (!pr) { b_c(b, ','); b_c(b, ' '); } pr = 0;
          if (d->e[i].k.t == N_OBJ && d->e[i].k.u.o->clase == NC_TEXTO) b_txt(b, d->e[i].k); else repr_en(b, d->e[i].k, 0);
          b_c(b, ':'); b_c(b, ' '); repr_en(b, d->e[i].v, prof + 1);
        }
        b_c(b, '}'); return;
      }
      if (prof > 4) { b_utf8(b, "{\xE2\x80\xA6}"); return; }
      b_c(b, '{'); int pr = 1;
      for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) {
        if (!pr) { b_c(b, ','); b_c(b, ' '); } pr = 0;
        NV k = d->e[i].k;
        if (k.t == N_OBJ && k.u.o->clase == NC_TEXTO) { if (parece_numero(k)) json_texto(b, k); else b_txt(b, k); }
        else repr_en(b, k, prof + 1);
        b_c(b, ':'); b_c(b, ' '); repr_en(b, d->e[i].v, prof + 1);
      }
      b_c(b, '}'); return;
    }
    case NC_ERROR: {
      NError* e = (NError*)v.u.o;
      b_utf8(b, "<error "); b_txt(b, e->tipo); b_c(b, ':'); b_c(b, ' '); b_txt(b, e->mensaje); b_c(b, '>'); return;
    }
    case NC_CIERRE: {
      NCierre* c = (NCierre*)v.u.o;
      snprintf(nb, sizeof nb, "/%d>", c->fn->aridad);
      b_utf8(b, "<funcion "); b_utf8(b, c->fn->nombre); b_utf8(b, nb); return;
    }
    case NC_NATIVA: b_utf8(b, "<nativa "); b_utf8(b, ((NNativa*)v.u.o)->nombre); b_c(b, '>'); return;
    case NC_FECHA: iso_de_fecha(b, ((NFecha*)v.u.o)->ms); return;
    default: b_utf8(b, "<objeto>"); return;
  }
}
NV n_repr(NV v, int prof) { NBuf b = {0}; repr_en(&b, v, prof); return b_texto(&b); }
NV n_texto_de(NV v) {
  if (n_es(v, NC_TEXTO)) return n_inc(v);
  return n_repr(v, 1);
}
static NV R1(NV v) { return n_repr(v, 1); }   /* para los mensajes: repr(x, 1) */

/* Un mensaje armado con trozos UTF-8 y valores: «%s» es UTF-8, «%v» es un NV
   tal cual (texto) y «%r» es repr(v, 1). */
static NV msg(const char* fmt, ...) {
  NBuf b = {0}; va_list ap; va_start(ap, fmt);
  for (const char* p = fmt; *p; p++) {
    if (*p != '%') { const char* q = p; while (*q && *q != '%') q++;
      char tmp[1024]; size_t n = (size_t)(q - p); if (n > sizeof tmp - 1) n = sizeof tmp - 1; memcpy(tmp, p, n); tmp[n] = 0; b_utf8(&b, tmp); p = q - 1; continue; }
    p++;
    if (*p == 's') b_utf8(&b, va_arg(ap, const char*));
    else if (*p == 'v') { NV t = va_arg(ap, NV); b_txt(&b, t); }
    else if (*p == 'r') { NV t = R1(va_arg(ap, NV)); b_txt(&b, t); n_dec(t); }
    else if (*p == 'n') { char nb[64]; num_repr(va_arg(ap, double), nb); b_utf8(&b, nb); }
    else if (*p == 'j') { char nb[64]; num_js(va_arg(ap, double), nb); b_utf8(&b, nb); }   /* String(x) de JavaScript */
    else if (*p == 'd') { char nb[32]; snprintf(nb, sizeof nb, "%lld", (long long)va_arg(ap, long long)); b_utf8(&b, nb); }
    else if (*p == '%') b_c(&b, '%');
  }
  va_end(ap);
  return b_texto(&b);
}
#define ERR(...) n_errorT(msg(__VA_ARGS__), n_nulo())
#define ERRP(pista, ...) n_errorT(msg(__VA_ARGS__), (pista))

/* ════════════════════════════════════════════════════════════ iguales */
typedef struct { NObj *a, *b; } NPar;
static int iguales_rec(NV a, NV b, NPar* vistos, int nv) {
  if (a.t != b.t) return 0;
  switch (a.t) {
    case N_NULO: return 1;
    case N_BOOL: return a.u.b == b.u.b;
    case N_NUM: return a.u.n == b.u.n;
    default: break;
  }
  if (a.u.o == b.u.o) return 1;
  int ca = a.u.o->clase, cb = b.u.o->clase;
  if (ca == NC_TEXTO && cb == NC_TEXTO) return texto_igual(a, b);
  /* una fecha es un valor, no una identidad: dos que marcan el mismo instante son iguales */
  if (ca == NC_FECHA || cb == NC_FECHA) return ca == cb && ((NFecha*)a.u.o)->ms == ((NFecha*)b.u.o)->ms;
  if (ca == NC_DIC && cb == NC_DIC && DC(a)->reg != DC(b)->reg) return 0;
  int dosListas = ca == NC_LISTA && cb == NC_LISTA, dosDics = ca == NC_DIC && cb == NC_DIC;
  if (!dosListas && !dosDics) return 0;
  for (int i = 0; i < nv; i++) if (vistos[i].a == a.u.o && vistos[i].b == b.u.o) return 1;
  NPar* v2 = vistos; int nv2 = nv;
  NPar loc[64];
  if (nv < 64) { if (nv) memcpy(loc, vistos, sizeof(NPar) * (size_t)nv); v2 = loc; }
  if (nv2 < 64) { v2[nv2].a = a.u.o; v2[nv2].b = b.u.o; nv2++; }
  if (dosListas) {
    NLista *x = LS(a), *y = LS(b);
    if (x->n != y->n) return 0;
    for (int64_t i = 0; i < x->n; i++) if (!iguales_rec(x->v[i], y->v[i], v2, nv2)) return 0;
    return 1;
  }
  NDic *x = DC(a), *y = DC(b);
  if (x->n != y->n) return 0;
  for (int64_t i = 0; i < x->usados; i++) if (x->e[i].vivo) {
    NV w;
    if (!n_dic_buscar(y, x->e[i].k, &w)) return 0;
    if (!iguales_rec(x->e[i].v, w, v2, nv2)) return 0;
  }
  return 1;
}
int n_iguales(NV a, NV b) { return iguales_rec(a, b, NULL, 0); }

/* ════════════════════════════════════════════════════════════ aritmética */
NV n_sumar(NV a, NV b) {
  if (a.t == N_NUM && b.t == N_NUM) return n_num(a.u.n + b.u.n);
  if (n_es(a, NC_TEXTO) && n_es(b, NC_TEXTO)) {
    NV r = n_texto_nuevo(TX(a)->n + TX(b)->n);
    if (TX(a)->n) memcpy(TX(r)->s, TX(a)->s, sizeof(uint16_t) * (size_t)TX(a)->n);
    if (TX(b)->n) memcpy(TX(r)->s + TX(a)->n, TX(b)->s, sizeof(uint16_t) * (size_t)TX(b)->n);
    return r;
  }
  if (n_es(a, NC_LISTA) && n_es(b, NC_LISTA)) {
    NV r = n_lista_nueva(LS(a)->n + LS(b)->n);
    for (int64_t i = 0; i < LS(a)->n; i++) n_lista_agregar(LS(r), n_inc(LS(a)->v[i]));
    for (int64_t i = 0; i < LS(b)->n; i++) n_lista_agregar(LS(r), n_inc(LS(b)->v[i]));
    return r;
  }
  if (n_es(a, NC_TEXTO) || n_es(b, NC_TEXTO)) {
    NV otro = n_es(a, NC_TEXTO) ? b : a;
    return ERRP(msg("convierte con texto(...): por ejemplo \"total: \" + texto(%r)", otro),
      "no se puede sumar %s y %s", n_tipo_de(a), n_tipo_de(b));
  }
  return ERR("no se puede sumar %s y %s", n_tipo_de(a), n_tipo_de(b));
}
static NV otro_op(NV a, NV b, const char* op) {
  if (strcmp(op, "+") == 0) return n_sumar(a, b);
  return ERR("«%s» necesita dos números y recibió %s y %s", op, n_tipo_de(a), n_tipo_de(b));
}
NV n_restar(NV a, NV b) { if (a.t == N_NUM && b.t == N_NUM) return n_num(a.u.n - b.u.n); return otro_op(a, b, "-"); }
NV n_mult(NV a, NV b) { if (a.t == N_NUM && b.t == N_NUM) return n_num(a.u.n * b.u.n); return otro_op(a, b, "*"); }
NV n_div(NV a, NV b) {
  if (a.t != N_NUM || b.t != N_NUM) return otro_op(a, b, "/");
  if (b.u.n == 0) return n_error("división entre cero", "comprueba el divisor antes de dividir");
  return n_num(a.u.n / b.u.n);
}
NV n_idiv(NV a, NV b) {
  if (a.t != N_NUM || b.t != N_NUM) return otro_op(a, b, "//");
  if (b.u.n == 0) return n_error("división entre cero", NULL);
  return n_num(floor(a.u.n / b.u.n));
}
NV n_mod(NV a, NV b) {
  if (a.t != N_NUM || b.t != N_NUM) return otro_op(a, b, "%");
  if (b.u.n == 0) return n_error("módulo entre cero", NULL);
  return n_num(fmod(fmod(a.u.n, b.u.n) + b.u.n, b.u.n));
}
/* Math.pow: (±1)^±∞ y x^NaN dan NaN; lo demás depende de la plataforma, porque V8 también:
   - Linux (y la nube): V8 usa su fdlibm -> fd_pow da los mismos bits (307 programas iguales).
   - Windows: V8 usa el pow de UCRT, el CRT de Node. Medido con 16.934 pares: Math.pow coincide con
     el pow de ucrtbase.dll en todos menos 1, y con fd_pow difiere en 1.544 (1 ulp). El ejecutable
     de mingw enlaza msvcrt, cuyo pow difiere en 5.143: por eso se toma el de ucrtbase.dll (está en
     todo Windows 10+); si no estuviera, fd_pow. */
#if defined(_WIN32)
static double (*n_pow_crt)(double, double) = NULL;
static int n_pow_buscado = 0;
#endif
static double pow_js(double a, double b) {
  if (isnan(b)) return NAN;
  if (isinf(b) && fabs(a) == 1) return NAN;
#if defined(_WIN32)
  if (!n_pow_buscado) {
    HMODULE m = LoadLibraryA("ucrtbase.dll");
    if (m) n_pow_crt = (double (*)(double, double))(void*)GetProcAddress(m, "pow");
    n_pow_buscado = 1;
  }
  if (n_pow_crt) return n_pow_crt(a, b);
#endif
  return fd_pow(a, b);
}
NV n_pot(NV a, NV b) { if (a.t == N_NUM && b.t == N_NUM) return n_num(pow_js(a.u.n, b.u.n)); return otro_op(a, b, "**"); }
NV n_neg(NV a) {
  if (a.t != N_NUM) return ERR("«-» necesita un número y recibió %s", n_tipo_de(a));
  return n_num(-a.u.n);
}
NV n_cmp(NV a, NV b, int op) {
  static const char* ops[] = { "<", "<=", ">", ">=" };
  if (a.t == N_NUM && b.t == N_NUM) {
    double x = a.u.n, y = b.u.n;
    return n_bool(op == 0 ? x < y : op == 1 ? x <= y : op == 2 ? x > y : x >= y);
  }
  if (n_es(a, NC_TEXTO) && n_es(b, NC_TEXTO)) {
    int c = texto_cmp(a, b);
    return n_bool(op == 0 ? c < 0 : op == 1 ? c <= 0 : op == 2 ? c > 0 : c >= 0);
  }
  if (n_es(a, NC_FECHA) && n_es(b, NC_FECHA)) {
    double x = ((NFecha*)a.u.o)->ms, y = ((NFecha*)b.u.o)->ms;
    return n_bool(op == 0 ? x < y : op == 1 ? x <= y : op == 2 ? x > y : x >= y);
  }
  if (n_es(a, NC_FECHA) || n_es(b, NC_FECHA))
    return ERRP(T("una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)"),
      "no se pueden comparar %s y %s con «%s»", n_tipo_de(a), n_tipo_de(b), ops[op]);
  return ERR("no se pueden comparar %s y %s con «%s»", n_tipo_de(a), n_tipo_de(b), ops[op]);
}

/* ════════════════════════════════════════════════════════════ índices */
static NV nativa_con(const char* nombre, int aridad, NNatC f, NV extraV);
static NV nat_metodo_atado(NV* a, int n, void* extra);
NV n_idx_get(NV o, NV i) {
  if (o.t == N_OBJ) switch (o.u.o->clase) {
    case NC_ERROR: {
      NError* e = (NError*)o.u.o;
      if (n_es(i, NC_TEXTO)) {
        NV t = n_texto_utf8("tipo"), m = n_texto_utf8("mensaje"), l = n_texto_utf8("linea"); NV r = n_nulo(); int hay = 1;
        if (texto_igual(i, t)) r = n_inc(e->tipo); else if (texto_igual(i, m)) r = n_inc(e->mensaje); else if (texto_igual(i, l)) r = n_num(e->linea); else hay = 0;
        n_dec(t); n_dec(m); n_dec(l);
        if (hay) return r;
      }
      NV s = n_repr(i, 0); NV r = ERRP(n_texto_utf8("sus campos son tipo, mensaje y linea"), "un error no tiene «%v»", s); n_dec(s); return r;
    }
    case NC_LISTA: {
      NLista* l = LS(o);
      if (i.t != N_NUM) return ERR("el índice de una lista debe ser un número y es %s", n_tipo_de(i));
      double k = i.u.n < 0 ? (double)l->n + i.u.n : i.u.n;
      if (k < 0 || k >= (double)l->n || k != trunc(k)) {
        NV pista = l->n ? msg("los índices válidos van de 0 a %d, o de -1 a -%d", (long long)(l->n - 1), (long long)l->n) : n_texto_utf8("la lista está vacía");
        return ERRP(pista, "índice %j fuera de rango (la lista tiene %d elemento(s))", i.u.n, (long long)l->n);
      }
      return n_inc(l->v[(int64_t)k]);
    }
    case NC_TEXTO: {
      NTexto* s = TX(o);
      if (i.t != N_NUM) { NV r = n_repr(i, 0); NV e = ERR("índice %v fuera del texto (longitud %d)", r, (long long)s->n); n_dec(r); return e; }
      double k = i.u.n < 0 ? (double)s->n + i.u.n : i.u.n;
      if (k < 0 || k >= (double)s->n) return ERR("índice %j fuera del texto (longitud %d)", i.u.n, (long long)s->n);
      if (k != trunc(k)) return n_nulo();       /* JavaScript: o[1.5] es undefined */
      return n_texto_utf16(&s->s[(int64_t)k], 1);
    }
    case NC_DIC: {
      NDic* d = DC(o); NV v;
      if (n_dic_buscar(d, i, &v)) return n_inc(v);
      if (d->reg) {
        NV m;
        if (n_dic_buscar(DC(d->reg->metodos), i, &m)) {
          NV par[2] = { o, m };
          NV extra = n_lista_de(par, 2);
          NV nm = msg("%v.%v", d->reg->nombre, i);
          char* nm8 = n_a_utf8(nm, NULL); n_dec(nm);
          int ar = n_es(m, NC_CIERRE) ? ((NCierre*)m.u.o)->fn->aridad - 1 : -1;
          NV f = nativa_con(nm8, ar, nat_metodo_atado, extra);   /* copia el nombre */
          free(nm8); n_dec(extra);
          return f;
        }
        NBuf b = {0}; NLista* c = LS(d->reg->campos); int pr = 1;
        for (int64_t k = 0; k < c->n; k++) { if (!pr) b_utf8(&b, ", "); pr = 0; b_txt(&b, c->v[k]); }
        NDic* md = DC(d->reg->metodos);
        for (int64_t k = 0; k < md->usados; k++) if (md->e[k].vivo) { if (!pr) b_utf8(&b, ", "); pr = 0; b_txt(&b, md->e[k].k); }
        NV tiene = b_texto(&b); NV pista = msg("tiene: %v", tiene); n_dec(tiene);
        NV s = n_repr(i, 0); NV r = ERRP(pista, "«%v» no tiene «%v»", d->reg->nombre, s); n_dec(s); return r;
      }
      NV pista;
      if (d->n) {
        NBuf b = {0}; int c = 0;
        for (int64_t k = 0; k < d->usados && c < 6; k++) if (d->e[k].vivo) { if (c) b_utf8(&b, ", "); NV r = R1(d->e[k].k); b_txt(&b, r); n_dec(r); c++; }
        NV ks = b_texto(&b); pista = msg("claves disponibles: %v", ks); n_dec(ks);
      } else pista = n_texto_utf8("el diccionario está vacío");
      return ERRP(pista, "la clave %r no existe en el diccionario", i);
    }
    default: break;
  }
  return ERR("no se puede indexar un valor de tipo %s", n_tipo_de(o));
}
NV n_idx_set(NV o, NV i, NV v) {
  if (n_es(o, NC_LISTA)) {
    NLista* l = LS(o);
    if (i.t != N_NUM) return ERR("el índice de una lista debe ser un número y es %s", n_tipo_de(i));
    double k = i.u.n < 0 ? (double)l->n + i.u.n : i.u.n;
    if (k < 0 || k >= (double)l->n) return ERR("índice %j fuera de rango (longitud %d)", i.u.n, (long long)l->n);
    if (k != trunc(k)) return n_nulo();
    n_asignar(&l->v[(int64_t)k], v);
    return n_nulo();
  }
  if (n_es(o, NC_DIC)) {
    NDic* d = DC(o);
    if (d->reg && !n_dic_buscar(d, i, NULL)) {
      NBuf b = {0}; NLista* c = LS(d->reg->campos);
      for (int64_t k = 0; k < c->n; k++) { if (k) b_utf8(&b, ", "); b_txt(&b, c->v[k]); }
      NV cs = b_texto(&b); NV pista = msg("sus campos son: %v", cs); n_dec(cs);
      NV s = n_repr(i, 0); NV r = ERRP(pista, "«%v» no tiene el campo «%v»", d->reg->nombre, s); n_dec(s); return r;
    }
    n_dic_poner(d, i, v);
    return n_nulo();
  }
  return ERR("no se puede asignar por índice en un valor de tipo %s", n_tipo_de(o));
}
NV n_prop_get(NV o, NV nombre) { return n_idx_get(o, nombre); }
NV n_len(NV o) {
  if (o.t == N_OBJ) switch (o.u.o->clase) {
    case NC_TEXTO: return n_num((double)TX(o)->n);
    case NC_LISTA: return n_num((double)LS(o)->n);
    case NC_DIC: return n_num((double)DC(o)->n);
    default: break;
  }
  return ERR("no se puede recorrer ni medir un valor de tipo %s", n_tipo_de(o));
}
NV n_concat(NV* v, int n) {
  NBuf b = {0};
  for (int i = 0; i < n; i++) {
    if (n_es(v[i], NC_TEXTO)) b_txt(&b, v[i]);
    else repr_en(&b, v[i], 1);
  }
  return b_texto(&b);
}

/* ════════════════════════════════════════════════════════════ funciones */
NV n_faltante;
NV n_cierre_nuevo(const NFn* fn) {
  NCierre* c = (NCierre*)n_objeto(sizeof(NCierre) + sizeof(NUp*) * (size_t)(fn->nup ? fn->nup : 1), NC_CIERRE);
  c->fn = fn; c->nup = fn->nup;
  for (int i = 0; i < fn->nup; i++) c->up[i] = NULL;
  return n_obj(c);
}
/* Las capturas abiertas de un marco: apuntan a su casilla mientras el marco
   vive y se «cierran» (copian el valor) al salir de su ámbito, como en la VM. */
NUp* n_up_capturar(NUp** abiertas, NV* slot, int idx) {
  for (NUp* u = *abiertas; u; u = u->sig) if (u->slot == idx) { N_RC_MAS(&u->h); return u; }
  NUp* u = (NUp*)n_objeto(sizeof(NUp), NC_UP);
  u->p = slot; u->cerrado = n_nulo(); u->slot = idx; u->sig = *abiertas;
  u->h.rc = 2;                       /* una para la lista de abiertas, otra para quien la pidió */
  *abiertas = u;
  return u;
}
void n_up_cerrar(NUp** abiertas, int desde) {
  NUp** pp = abiertas;
  while (*pp) {
    NUp* u = *pp;
    if (u->slot >= desde) {
      u->cerrado = n_inc(*u->p); u->p = &u->cerrado;
      *pp = u->sig; u->sig = NULL;
      n_dec(n_obj(u));
    } else pp = &u->sig;
  }
}
static NV nativa_con(const char* nombre, int aridad, NNatC f, NV extraV) {
  NNativa* x = (NNativa*)n_objeto(sizeof(NNativa), NC_NATIVA);
  size_t ln = strlen(nombre); char* cp = (char*)n_mem(ln + 1); memcpy(cp, nombre, ln + 1);
  x->nombre = cp; x->aridad = aridad; x->f = f; x->extra = NULL; x->extraV = n_inc(extraV); x->registro = NULL;
  return n_obj(x);
}
NV n_nativa_nueva(const char* nombre, int aridad, NNatC f, void* extra) {
  NNativa* x = (NNativa*)n_objeto(sizeof(NNativa), NC_NATIVA);
  x->nombre = nombre; x->aridad = aridad; x->f = f; x->extra = extra; x->extraV = n_nulo(); x->registro = NULL;
  x->h.inmortal = 1; x->h.rc = N_INMORTAL_RC;
  return n_obj(x);
}
static NV aridad_txt(const NFn* fn) {
  if (fn->minimos >= 0 && fn->minimos < fn->aridad) return msg("entre %d y %d", (long long)fn->minimos, (long long)fn->aridad);
  return msg("%d", (long long)fn->aridad);
}
NV n_llamar(NV f, NV* args, int n) {
  if (n_es(f, NC_CIERRE)) {
    NCierre* c = (NCierre*)f.u.o; const NFn* fn = c->fn;
    if (fn->corrutina) return n_error("los generadores y las funciones asíncronas todavía no están en el ejecutable nativo", "corre este programa con n-node");
    NV tmp[64];
    if (fn->aridad != n) {
      if (fn->minimos >= 0 && n >= fn->minimos && n < fn->aridad && fn->aridad <= 64) {
        for (int i = 0; i < n; i++) tmp[i] = args[i];
        for (int i = n; i < fn->aridad; i++) tmp[i] = n_faltante;
        args = tmp; n = fn->aridad;
      } else { NV a = aridad_txt(fn); NV r = ERR("«%s» espera %v argumento(s) y recibió %d", fn->nombre, a, (long long)n); n_dec(a); return r; }
    }
    if (n_hilo.nmarcos >= N_MAX_MARCOS)
      return n_error("desbordamiento de pila: demasiadas llamadas anidadas", "suele indicar una recursión sin caso base");
    return fn->f(c, args, n);
  }
  if (n_es(f, NC_NATIVA)) {
    NNativa* x = (NNativa*)f.u.o;
    if (x->aridad >= 0 && x->aridad != n) return ERR("«%s» espera %d argumento(s) y recibió %d", x->nombre, (long long)x->aridad, (long long)n);
    return x->f(args, n, x->extra ? x->extra : (void*)x);
  }
  if (f.t == N_NULO) return ERRP(n_texto_utf8("el valor es nulo — ¿olvidaste definirlo?"), "%s no es una función; no se puede llamar", n_tipo_de(f));
  return ERR("%s no es una función; no se puede llamar", n_tipo_de(f));
}
static NV nat_metodo_atado(NV* a, int n, void* extra) {
  NNativa* yo = (NNativa*)extra; NLista* par = LS(yo->extraV);
  NV args[65];
  if (n > 64) return n_error("demasiados argumentos", NULL);
  args[0] = par->v[0];
  for (int i = 0; i < n; i++) args[i + 1] = a[i];
  return n_llamar(par->v[1], args, n + 1);
}

/* ════════════════════════════════════════════════════════════ registros */
static NV nat_hacer_registro(NV* a, int n, void* extra) {
  NNativa* yo = (NNativa*)extra; NRegDesc* r = yo->registro;
  NV d = n_dic_nuevo();
  DC(d)->reg = r; N_RC_MAS(&r->h);
  NLista* c = LS(r->campos);
  for (int i = 0; i < n && i < c->n; i++) n_dic_poner(DC(d), c->v[i], a[i]);
  return d;
}
static NV nat_registro(NV* a, int n, void* extra) {
  (void)n; (void)extra;
  NRegDesc* r = (NRegDesc*)n_objeto(sizeof(NRegDesc), NC_REGDESC);
  r->nombre = n_inc(a[0]);
  r->campos = n_lista_de(LS(a[1])->v, (int)LS(a[1])->n);
  r->metodos = n_dic_nuevo();
  NDic* m = DC(a[2]);
  for (int64_t i = 0; i < m->usados; i++) if (m->e[i].vivo) n_dic_poner(DC(r->metodos), m->e[i].k, m->e[i].v);
  char* nm = n_a_utf8(r->nombre, NULL);
  NV f = nativa_con(nm, (int)LS(r->campos)->n, nat_hacer_registro, n_nulo());
  free(nm);
  ((NNativa*)f.u.o)->registro = r;
  return f;
}

/* ════════════════════════════════════════════════════════════ la biblioteca */
/* Cada una, como su «def» de src/04-stdlib.js. */
#define NAT(nombre) static NV nombre(NV* a, int n, void* extra)
#define SIN_USO (void)a; (void)n; (void)extra
static NV error_tipo(const char* tipo, NV mensaje) {   /* vm.error(…, tipo) */
  NV r = n_errorT(mensaje, n_nulo());
  n_hilo.tipo = n_texto_utf8(tipo);
  return r;
}
static int exige_texto(NV v, int k, const char* f, NV* err) {
  if (n_es(v, NC_TEXTO)) return 1;
  *err = ERR("«%s»: el argumento %d debe ser texto y es %s", f, (long long)k, n_tipo_de(v)); return 0;
}
static int exige_lista(NV v, int k, const char* f, NV* err) {
  if (n_es(v, NC_LISTA)) return 1;
  *err = ERR("«%s»: el argumento %d debe ser una lista y es %s", f, (long long)k, n_tipo_de(v)); return 0;
}
static int exige_num(NV v, int k, const char* f, NV* err) {
  if (v.t == N_NUM) return 1;
  *err = ERR("«%s»: el argumento %d debe ser un número y es %s", f, (long long)k, n_tipo_de(v)); return 0;
}
#define TXT(v, k, f) do { NV e_; if (!exige_texto((v), (k), (f), &e_)) return e_; } while (0)
#define LST(v, k, f) do { NV e_; if (!exige_lista((v), (k), (f), &e_)) return e_; } while (0)
#define NUM(v, k, f) do { NV e_; if (!exige_num((v), (k), (f), &e_)) return e_; } while (0)

NAT(nat_imprimir) {
  (void)extra;
  NBuf b = {0};
  for (int i = 0; i < n; i++) { if (i) b_c(&b, ' '); repr_en(&b, a[i], 0); }
  NV t = b_texto(&b); n_salida(t); n_dec(t);
  return n_nulo();
}
NAT(nat_texto) { (void)n; (void)extra; return n_texto_de(a[0]); }
NAT(nat_entero) {
  (void)n; (void)extra; NV v = a[0];
  if (v.t == N_NUM) return n_num(trunc(v.u.n));
  if (v.t == N_BOOL) return n_num(v.u.b ? 1 : 0);
  if (n_es(v, NC_TEXTO)) {
    /* parseInt(v.trim(), 10) */
    char* s = n_a_utf8(v, NULL); char* p = s;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r' || *p == '\f' || *p == '\v') p++;
    int neg = 0; if (*p == '+' || *p == '-') { neg = *p == '-'; p++; }
    if (!(*p >= '0' && *p <= '9')) { free(s); return ERR("«entero»: «%v» no es un número", v); }
    double r = 0; while (*p >= '0' && *p <= '9') { r = r * 10 + (*p - '0'); p++; }
    free(s);
    return n_num(neg ? -r : r);
  }
  return ERR("«entero»: no se puede convertir %s", n_tipo_de(v));
}
static int es_esp_js(uint16_t c) {   /* lo que quita String.prototype.trim */
  return c == 9 || c == 10 || c == 11 || c == 12 || c == 13 || c == 32 || c == 0xA0 || c == 0x1680 ||
         (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
}
NAT(nat_real) {
  (void)n; (void)extra; NV v = a[0];
  if (v.t == N_NUM) return v;
  if (v.t == N_BOOL) return n_num(v.u.b ? 1 : 0);
  if (n_es(v, NC_TEXTO)) {
    /* parseFloat(v.trim()): el prefijo más largo que es un número */
    NTexto* t = TX(v); int64_t i = 0;
    while (i < t->n && es_esp_js(t->s[i])) i++;
    char b[512]; int k = 0;
    if (i < t->n && (t->s[i] == '+' || t->s[i] == '-')) b[k++] = (char)t->s[i++];
    const char* inf = "Infinity"; int64_t j = 0;
    while (j < 8 && i + j < t->n && t->s[i + j] == (uint16_t)inf[j]) j++;
    if (j == 8) { b[k] = 0; return n_num(b[0] == '-' ? -INFINITY : INFINITY); }
    int dig = 0, punto = 0;
    while (i < t->n && k < 500) {
      uint16_t c = t->s[i];
      if (c >= '0' && c <= '9') { b[k++] = (char)c; dig = 1; i++; }
      else if (c == '.' && !punto) { b[k++] = '.'; punto = 1; i++; }
      else break;
    }
    if (dig && i < t->n && (t->s[i] == 'e' || t->s[i] == 'E')) {
      int64_t i2 = i + 1; int k2 = k; char b2[16]; int m = 0;
      if (i2 < t->n && (t->s[i2] == '+' || t->s[i2] == '-')) b2[m++] = (char)t->s[i2++];
      int d2 = 0; while (i2 < t->n && t->s[i2] >= '0' && t->s[i2] <= '9' && m < 12) { b2[m++] = (char)t->s[i2++]; d2 = 1; }
      if (d2) { b[k2++] = 'e'; memcpy(b + k2, b2, (size_t)m); k = k2 + m; }
    }
    b[k] = 0;
    if (!dig) return ERR("«real»: «%v» no es un número", v);
    return n_num(strtod(b, NULL));
  }
  return ERR("«real»: no se puede convertir %s", n_tipo_de(v));
}
NAT(nat_bool) { (void)n; (void)extra; return n_bool(n_verdad(a[0])); }
NAT(nat_tipo) {
  (void)n; (void)extra;
  if (n_es(a[0], NC_DIC) && DC(a[0])->reg) return n_inc(DC(a[0])->reg->nombre);
  return n_texto_utf8(n_tipo_de(a[0]));
}
NAT(nat_longitud) { (void)n; (void)extra; return n_len(a[0]); }
NAT(nat_rango) {
  (void)extra;
  double ini = 0, fin = 0, paso = 1;
  if (n == 1) { NUM(a[0], 1, "rango"); fin = a[0].u.n; }
  else if (n == 2) { NUM(a[0], 1, "rango"); NUM(a[1], 2, "rango"); ini = a[0].u.n; fin = a[1].u.n; }
  else if (n == 3) { NUM(a[0], 1, "rango"); NUM(a[1], 2, "rango"); NUM(a[2], 3, "rango"); ini = a[0].u.n; fin = a[1].u.n; paso = a[2].u.n; }
  else return n_error("«rango» acepta 1, 2 o 3 argumentos", NULL);
  if (paso == 0) return n_error("«rango»: el paso no puede ser 0", NULL);
  double c = ceil((fin - ini) / paso); if (!(c > 0)) c = 0;
  if (c > 5e6) {
    /* toLocaleString('es'): separador de miles «.» */
    char d[64], s[96]; snprintf(d, sizeof d, "%.0f", c); int L = (int)strlen(d), o = 0;
    for (int i = 0; i < L; i++) { s[o++] = d[i]; if ((L - i - 1) % 3 == 0 && i < L - 1) s[o++] = '.'; }
    s[o] = 0;
    return ERRP(n_texto_utf8("si solo quieres contar, usa «repetir n { … }», que no construye la lista"),
      "«rango» generaría %s elementos y el tope son 5 millones", s);
  }
  NV r = n_lista_nueva((int64_t)c);
  if (paso > 0) for (double i = ini; i < fin; i += paso) n_lista_agregar(LS(r), n_num(i));
  else for (double i = ini; i > fin; i += paso) n_lista_agregar(LS(r), n_num(i));
  return r;
}
NAT(nat_afirmar) {
  (void)extra;
  if (!n_verdad(n ? a[0] : n_nulo())) {
    if (n > 1) return n_errorT(n_repr(a[1], 0), n_nulo());
    return n_error("la afirmación resultó falsa", NULL);
  }
  return n_nulo();
}
/* Una fecha se compara por sus milisegundos (en la VM, por su valueOf). */
static int como_num_js(NV v, double* x) {
  if (v.t == N_NUM) { *x = v.u.n; return 1; }
  if (n_es(v, NC_FECHA)) { *x = ((NFecha*)v.u.o)->ms; return 1; }
  return 0;
}
static int mayor_js(NV c, NV p) {   /* c > p con las reglas de JavaScript para números, fechas y textos */
  double x, y;
  if (como_num_js(c, &x) && como_num_js(p, &y)) return x > y;
  if (n_es(c, NC_TEXTO) && n_es(p, NC_TEXTO)) return texto_cmp(c, p) > 0;
  return 0;
}
static int menor_js(NV c, NV p) {
  double x, y;
  if (como_num_js(c, &x) && como_num_js(p, &y)) return x < y;
  if (n_es(c, NC_TEXTO) && n_es(p, NC_TEXTO)) return texto_cmp(c, p) < 0;
  return 0;
}
static int clase_ord(NV x) { return x.t == N_NUM ? 1 : n_es(x, NC_TEXTO) ? 2 : n_es(x, NC_FECHA) ? 3 : 0; }
static NV max_min(NV* a, int n, const char* quien, int esMax) {
  NV* xs = a; int64_t m = n;
  if (n == 1 && n_es(a[0], NC_LISTA)) {
    NLista* l = LS(a[0]); xs = l->v; m = l->n;
    int c0 = m ? clase_ord(xs[0]) : 1;
    for (int64_t i = 0; i < m; i++) if (clase_ord(xs[i]) != c0 || !clase_ord(xs[i]))
      return ERR("«%s»: la lista tiene que ser toda de números, toda de texto o toda de fechas", quien);
  }
  if (!m) return ERR("«%s» de una lista vacía", quien);
  NV p = xs[0];
  for (int64_t i = 1; i < m; i++) if (esMax ? mayor_js(xs[i], p) : menor_js(xs[i], p)) p = xs[i];
  return n_inc(p);
}
NAT(nat_maximo) { (void)extra; return max_min(a, n, "maximo", 1); }
NAT(nat_minimo) { (void)extra; return max_min(a, n, "minimo", 0); }
static int64_t texto_buscar(NV h, NV aguja, int64_t desde) {
  NTexto *x = TX(h), *y = TX(aguja);
  if (y->n == 0) return desde <= x->n ? desde : -1;
  for (int64_t i = desde; i + y->n <= x->n; i++) if (memcmp(x->s + i, y->s, sizeof(uint16_t) * (size_t)y->n) == 0) return i;
  return -1;
}
static NV contiene(NV o, NV x, const char* quien) {
  if (n_es(o, NC_TEXTO)) {
    if (!n_es(x, NC_TEXTO)) return ERR("«%s»: dentro de un texto se busca texto y llegó %s", quien, n_tipo_de(x));
    return n_bool(texto_buscar(o, x, 0) >= 0);
  }
  if (n_es(o, NC_LISTA)) { NLista* l = LS(o); for (int64_t i = 0; i < l->n; i++) if (n_iguales(l->v[i], x)) return n_bool(1); return n_bool(0); }
  if (n_es(o, NC_DIC)) return n_bool(n_dic_buscar(DC(o), x, NULL));
  return ERR("«%s»: no se puede buscar dentro de %s", quien, n_tipo_de(o));
}
NAT(nat_contiene) { (void)n; (void)extra; return contiene(a[0], a[1], "contiene"); }
NAT(nat_agregar) {
  (void)extra;
  if (n < 1) return ERR("«agregar»: el argumento 1 debe ser una lista y es nulo");
  LST(a[0], 1, "agregar");
  for (int i = 1; i < n; i++) n_lista_agregar(LS(a[0]), n_inc(a[i]));
  return n_inc(a[0]);
}
NAT(nat_quitar) {
  (void)n; (void)extra; LST(a[0], 1, "quitar"); NLista* l = LS(a[0]);
  for (int64_t i = 0; i < l->n; i++) if (n_iguales(l->v[i], a[1])) {
    n_dec(l->v[i]); memmove(l->v + i, l->v + i + 1, sizeof(NV) * (size_t)(l->n - i - 1)); l->n--;
    return n_inc(a[0]);
  }
  return ERR("«quitar»: %r no está en la lista", a[1]);
}
NAT(nat_quitarEn) {
  (void)n; (void)extra; LST(a[0], 1, "quitarEn"); NUM(a[1], 2, "quitarEn");
  NLista* l = LS(a[0]); double i = a[1].u.n;
  if (i < 0 || i >= (double)l->n) return ERR("«quitarEn»: índice %j fuera de rango", i);
  int64_t k = (int64_t)i; NV r = l->v[k];
  memmove(l->v + k, l->v + k + 1, sizeof(NV) * (size_t)(l->n - k - 1)); l->n--;
  return r;
}
NAT(nat_insertar) {
  (void)n; (void)extra; LST(a[0], 1, "insertar"); NUM(a[1], 2, "insertar");
  NLista* l = LS(a[0]);
  /* splice(i, 0, v): i negativo cuenta desde el final; se recorta a [0, n] */
  double d = trunc(a[1].u.n); int64_t k = d < 0 ? (int64_t)((double)l->n + d) : (int64_t)d;
  if (k < 0) k = 0;
  if (k > l->n) k = l->n;
  n_lista_agregar(l, n_nulo());
  memmove(l->v + k + 1, l->v + k, sizeof(NV) * (size_t)(l->n - 1 - k));
  l->v[k] = n_inc(a[2]);
  return n_inc(a[0]);
}
NAT(nat_indice) {
  (void)n; (void)extra; LST(a[0], 1, "indice"); NLista* l = LS(a[0]);
  for (int64_t i = 0; i < l->n; i++) if (n_iguales(l->v[i], a[1])) return n_num((double)i);
  return n_num(-1);
}
NAT(nat_contar) {
  (void)n; (void)extra; LST(a[0], 1, "contar"); NLista* l = LS(a[0]); int64_t c = 0;
  for (int64_t i = 0; i < l->n; i++) if (n_iguales(l->v[i], a[1])) c++;
  return n_num((double)c);
}
NAT(nat_invertir) {
  (void)n; (void)extra; LST(a[0], 1, "invertir"); NLista* l = LS(a[0]);
  NV r = n_lista_nueva(l->n);
  for (int64_t i = l->n - 1; i >= 0; i--) n_lista_agregar(LS(r), n_inc(l->v[i]));
  return r;
}
NAT(nat_copiar) {
  (void)n; (void)extra; NV v = a[0];
  if (n_es(v, NC_LISTA)) return n_lista_de(LS(v)->v, (int)LS(v)->n);
  if (n_es(v, NC_DIC)) {
    NV d = n_dic_nuevo(); NDic* s = DC(v);
    for (int64_t i = 0; i < s->usados; i++) if (s->e[i].vivo) n_dic_poner(DC(d), s->e[i].k, s->e[i].v);
    if (s->reg) { DC(d)->reg = s->reg; N_RC_MAS(&s->reg->h); }
    return d;
  }
  return n_inc(v);
}
static int cmp_js(NV x, NV y) { return menor_js(x, y) ? -1 : (mayor_js(x, y) ? 1 : 0); }
static void orden_mezcla(NV* v, NV* k, NV* tv, NV* tk, int64_t n) {   /* estable, como el sort de V8 */
  if (n < 2) return;
  int64_t m = n / 2;
  orden_mezcla(v, k, tv, tk, m); orden_mezcla(v + m, k + m, tv, tk, n - m);
  int64_t i = 0, j = m, o = 0;
  while (i < m && j < n) { if (cmp_js(k[j], k[i]) < 0) { tv[o] = v[j]; tk[o++] = k[j++]; } else { tv[o] = v[i]; tk[o++] = k[i++]; } }
  while (i < m) { tv[o] = v[i]; tk[o++] = k[i++]; }
  while (j < n) { tv[o] = v[j]; tk[o++] = k[j++]; }
  memcpy(v, tv, sizeof(NV) * (size_t)n); memcpy(k, tk, sizeof(NV) * (size_t)n);
}
NAT(nat_ordenar) {
  (void)extra; LST(a[0], 1, "ordenar"); NLista* l = LS(a[0]);
  NV r = n_lista_de(l->v, (int)l->n); NLista* c = LS(r);
  NV* claves = (NV*)n_mem(sizeof(NV) * (size_t)(c->n + 1));
  for (int64_t i = 0; i < c->n; i++) {
    if (n > 1) { NV kx = n_llamar(a[1], &c->v[i], 1); if (N_FALLO(kx)) { for (int64_t j = 0; j < i; j++) n_dec(claves[j]); free(claves); n_dec(r); return N_ERR; } claves[i] = kx; }
    else claves[i] = n_inc(c->v[i]);
  }
  NV* tv = (NV*)n_mem(sizeof(NV) * (size_t)(c->n + 1)); NV* tk = (NV*)n_mem(sizeof(NV) * (size_t)(c->n + 1));
  orden_mezcla(c->v, claves, tv, tk, c->n);
  for (int64_t i = 0; i < c->n; i++) n_dec(claves[i]);
  free(claves); free(tv); free(tk);
  return r;
}
NAT(nat_mapear) {
  (void)n; (void)extra; LST(a[0], 1, "mapear"); NLista* l = LS(a[0]);
  NV r = n_lista_nueva(l->n);
  for (int64_t i = 0; i < l->n; i++) { NV x = n_llamar(a[1], &l->v[i], 1); if (N_FALLO(x)) { n_dec(r); return N_ERR; } n_lista_agregar(LS(r), x); }
  return r;
}
NAT(nat_filtrar) {
  (void)n; (void)extra; LST(a[0], 1, "filtrar"); NLista* l = LS(a[0]);
  NV r = n_lista_nueva(4);
  for (int64_t i = 0; i < l->n; i++) {
    NV x = n_llamar(a[1], &l->v[i], 1); if (N_FALLO(x)) { n_dec(r); return N_ERR; }
    int ok = n_verdad(x); n_dec(x);
    if (ok) n_lista_agregar(LS(r), n_inc(l->v[i]));
  }
  return r;
}
NAT(nat_reducir) {
  (void)n; (void)extra; LST(a[0], 1, "reducir"); NLista* l = LS(a[0]);
  NV acc = n_inc(a[2]);
  for (int64_t i = 0; i < l->n; i++) {
    NV par[2] = { acc, l->v[i] };
    NV x = n_llamar(a[1], par, 2); n_dec(acc);
    if (N_FALLO(x)) return N_ERR;
    acc = x;
  }
  return acc;
}
static int64_t corte_js(double d, int64_t n) {   /* como los índices de Array.prototype.slice */
  if (isnan(d)) return 0;
  d = trunc(d);
  if (d < 0) { d += (double)n; return d < 0 ? 0 : (int64_t)d; }
  return d > (double)n ? n : (int64_t)d;
}
NAT(nat_rebanar) {
  (void)extra; LST(a[0], 1, "rebanar"); NLista* l = LS(a[0]);
  int64_t i = 0, j = l->n;
  if (n > 1) { NUM(a[1], 2, "rebanar"); i = corte_js(a[1].u.n, l->n); }
  if (n > 2) { NUM(a[2], 3, "rebanar"); j = corte_js(a[2].u.n, l->n); }
  NV r = n_lista_nueva(j > i ? j - i : 0);
  for (int64_t k = i; k < j; k++) n_lista_agregar(LS(r), n_inc(l->v[k]));
  return r;
}
static void aplanar_en(NLista* d, NLista* s) {
  for (int64_t i = 0; i < s->n; i++) { if (n_es(s->v[i], NC_LISTA)) aplanar_en(d, LS(s->v[i])); else n_lista_agregar(d, n_inc(s->v[i])); }
}
NAT(nat_aplanar) { (void)n; (void)extra; LST(a[0], 1, "aplanar"); NV r = n_lista_nueva(4); aplanar_en(LS(r), LS(a[0])); return r; }
#define DIC_O_ERR(v, quien) do { if (!n_es((v), NC_DIC)) return n_error("«" quien "» necesita un diccionario", NULL); } while (0)
NAT(nat_claves) { (void)n; (void)extra; DIC_O_ERR(a[0], "claves"); NDic* d = DC(a[0]); NV r = n_lista_nueva(d->n);
  for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) n_lista_agregar(LS(r), n_inc(d->e[i].k));
  return r; }
NAT(nat_valores) { (void)n; (void)extra; DIC_O_ERR(a[0], "valores"); NDic* d = DC(a[0]); NV r = n_lista_nueva(d->n);
  for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) n_lista_agregar(LS(r), n_inc(d->e[i].v));
  return r; }
NAT(nat_pares) { (void)n; (void)extra; DIC_O_ERR(a[0], "pares"); NDic* d = DC(a[0]); NV r = n_lista_nueva(d->n);
  for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) { NV par[2] = { d->e[i].k, d->e[i].v }; n_lista_agregar(LS(r), n_lista_de(par, 2)); }
  return r; }
NAT(nat_obtener) { (void)n; (void)extra; DIC_O_ERR(a[0], "obtener"); NV v; if (n_dic_buscar(DC(a[0]), a[1], &v)) return n_inc(v); return n_inc(a[2]); }
NAT(nat_borrar) { (void)n; (void)extra; DIC_O_ERR(a[0], "borrar"); n_dic_borrar(DC(a[0]), a[1]); return n_inc(a[0]); }
NAT(nat_error) {
  (void)extra;
  NV m = n ? n_repr(a[0], 0) : n_texto_utf8("");
  NV t;
  if (n > 1) { if (!n_es(a[1], NC_TEXTO)) { n_dec(m); return ERR("«error»: el argumento 2 debe ser texto y es %s", n_tipo_de(a[1])); } t = n_inc(a[1]); }
  else t = n_texto_utf8("programa");
  return error_obj(t, m, n_hilo.nmarcos ? n_hilo.marcos[n_hilo.nmarcos - 1].linea : 0);
}
static double ms_epoca(void) {
#if defined(_WIN32)
  FILETIME ft; GetSystemTimeAsFileTime(&ft);
  uint64_t t = ((uint64_t)ft.dwHighDateTime << 32) | ft.dwLowDateTime;
  return floor((double)(t - 116444736000000000ULL) / 10000.0);
#else
  struct timeval tv; gettimeofday(&tv, NULL);
  return floor((double)tv.tv_sec * 1000.0 + (double)tv.tv_usec / 1000.0);
#endif
}
static double reloj_ms(void) {
#if defined(_WIN32)
  static LARGE_INTEGER f; LARGE_INTEGER c; if (!f.QuadPart) QueryPerformanceFrequency(&f); QueryPerformanceCounter(&c);
  return (double)c.QuadPart * 1000.0 / (double)f.QuadPart;
#else
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
#endif
}
static double reloj_0;
NAT(nat_ahora) { SIN_USO; return n_num(ms_epoca()); }
NAT(nat_reloj) { SIN_USO; return n_num(reloj_ms() - reloj_0); }
NAT(nat_argumentos) {
  SIN_USO;
  NV r = n_lista_nueva(n_argc);
  for (int i = 1; i < n_argc; i++) n_lista_agregar(LS(r), n_texto_utf8(n_argv[i]));
  return r;
}
NAT(nat_entorno) {
  (void)extra; if (n < 1) return ERR("«entorno»: el argumento 1 debe ser texto y es nulo");
  TXT(a[0], 1, "entorno");
  char* nm = n_a_utf8(a[0], NULL); const char* v = getenv(nm); free(nm);
  if (!v) return n > 1 ? n_inc(a[1]) : n_nulo();
  return n_texto_utf8(v);
}
NAT(nat_salir) {
  (void)extra; int c = 0;
  if (n) { NUM(a[0], 1, "salir"); c = (int)(int32_t)(int64_t)a[0].u.n; }
  /* (motor-exp N4.6) una biblioteca no cierra el programa que la usa */
  { extern int n_en_biblioteca; if (n_en_biblioteca) return ERR("«salir» dentro de una biblioteca: el programa que la usa es el que decide cuándo terminar"); }
  fflush(stdout); exit(c);
  return n_nulo();
}
NAT(nat_leerLinea) {
  (void)extra;
  if (n && a[0].t != N_NULO) { NV t = n_repr(a[0], 0); int64_t L; char* s = n_a_utf8(t, &L); fwrite(s, 1, (size_t)L, stdout); free(s); n_dec(t); }
  fflush(stdout);
  size_t cap = 256, len = 0; char* b = (char*)n_mem(cap); int c, alguno = 0;
  while ((c = fgetc(stdin)) != EOF) { alguno = 1; if (c == '\n') break; if (len + 1 >= cap) { cap *= 2; b = (char*)n_remem(b, cap); } b[len++] = (char)c; }
  if (!alguno) { free(b); return n_nulo(); }
  if (len && b[len - 1] == '\r') len--;
  NV r = n_texto_utf8n(b, (int64_t)len); free(b);
  return r;
}
/* archivos: los mismos mensajes que util/n-node.js («no se pudo leer RUTA (ENOENT)») */
static NV err_arch(const char* quien, const char* que, NV ruta) {
  return error_tipo("archivo", msg("«%s»: %s %v (ENOENT)", quien, que, ruta));
}
static FILE* abrir_ruta(NV ruta, const char* modo) {
  char* r = n_a_utf8(ruta, NULL);
#if defined(_WIN32)
  wchar_t wr[4096], wm[8]; MultiByteToWideChar(CP_UTF8, 0, r, -1, wr, 4096); MultiByteToWideChar(CP_UTF8, 0, modo, -1, wm, 8);
  FILE* f = _wfopen(wr, wm);
#else
  FILE* f = fopen(r, modo);
#endif
  free(r);
  return f;
}
NAT(nat_leerTexto) {
  (void)n; (void)extra; TXT(a[0], 1, "leerTexto");
  FILE* f = abrir_ruta(a[0], "rb"); if (!f) return err_arch("leerTexto", "no se pudo leer", a[0]);
  size_t cap = 4096, len = 0, k; char* b = (char*)n_mem(cap);
  while ((k = fread(b + len, 1, cap - len, f)) > 0) { len += k; if (len == cap) { cap *= 2; b = (char*)n_remem(b, cap); } }
  fclose(f);
  const char* s = b; size_t L = len;
  if (L >= 3 && (unsigned char)s[0] == 0xEF && (unsigned char)s[1] == 0xBB && (unsigned char)s[2] == 0xBF) { s += 3; L -= 3; }  /* Node quita el BOM al leer como utf8 */
  NV r = n_texto_utf8n(s, (int64_t)L); free(b);
  return r;
}
static NV escribir(NV* a, const char* quien, const char* modo, const char* que) {
  TXT(a[0], 1, quien); TXT(a[1], 2, quien);
  FILE* f = abrir_ruta(a[0], modo); if (!f) return err_arch(quien, que, a[0]);
  int64_t L; char* s = n_a_utf8(a[1], &L); fwrite(s, 1, (size_t)L, f); free(s); fclose(f);
  return n_nulo();
}
NAT(nat_escribirTexto) { (void)n; (void)extra; return escribir(a, "escribirTexto", "wb", "no se pudo escribir"); }
NAT(nat_agregarTexto) { (void)n; (void)extra; return escribir(a, "agregarTexto", "ab", "no se pudo abrir"); }
NAT(nat_existeArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "existeArchivo");
  FILE* f = abrir_ruta(a[0], "rb"); if (f) { fclose(f); return n_bool(1); }
  return n_bool(0);
}
NAT(nat_borrarArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "borrarArchivo");
  char* r = n_a_utf8(a[0], NULL); int ok = remove(r) == 0; free(r);
  return n_bool(ok);
}

#include "nrt_texto.inc"
#include "nrt_numerico.inc"
#include "nrt_formato.inc"
#include "nrt_fecha.inc"
#include "nrt_probar.inc"

/* ── «usar»: un eDSL no hace nada al ejecutarse (sus funciones ya están); un
   módulo se ejecuta UNA vez, y si está a medio cargar (un ciclo) se sigue,
   como en la VM (src/04-stdlib.js, « usar») ── */
static const char* const* mod_claves; static const NFn* const* mod_fns; static int mod_n; static int* mod_estado;
void n_registrar_modulos(const char* const* claves, const NFn* const* fns, int n) {
  mod_claves = claves; mod_fns = fns; mod_n = n;
  mod_estado = (int*)n_mem(sizeof(int) * (size_t)(n ? n : 1));
  for (int i = 0; i < n; i++) mod_estado[i] = 0;
}
NAT(nat_usar) {
  (void)n; (void)extra;
  if (!n_es(a[0], NC_TEXTO)) return n_nulo();
  char* c = n_a_utf8(a[0], NULL);
  if (strncmp(c, "\xC3\xB1:", 3) == 0) { free(c); return n_nulo(); }      /* «ñ:…»: un eDSL */
  for (int i = 0; i < mod_n; i++) if (strcmp(mod_claves[i], c) == 0) {
    free(c);
    if (mod_estado[i] != 0) return n_nulo();
    mod_estado[i] = 1;
    NV cl = n_cierre_nuevo(mod_fns[i]);
    NV r = n_llamar(cl, NULL, 0);
    n_dec(cl);
    if (N_FALLO(r)) return r;
    n_dec(r);
    mod_estado[i] = 2;
    return n_nulo();
  }
  const char* corta = c; for (const char* p = c; *p; p++) if (*p == '/' || *p == '\\') corta = p + 1;
  NV r = ERRP(n_texto_utf8("un .elb no lleva dentro los módulos que importaba: vuelve a ejecutarlo desde el código fuente"),
    "no hay módulo compilado para «%s»", *corta ? corta : c);
  free(c);
  return r;
}

static const NNatDef NATIVAS[] = {
  NAT_TEXTO
  NAT_NUMERICO
  NAT_FORMATO
  NAT_PROBAR
  NAT_FECHA
  { " usar", 1, nat_usar },
  { "imprimir", -1, nat_imprimir }, { "texto", 1, nat_texto }, { "entero", 1, nat_entero }, { "real", 1, nat_real },
  { "bool", 1, nat_bool }, { "tipo", 1, nat_tipo }, { "longitud", 1, nat_longitud }, { "rango", -1, nat_rango },
  { "afirmar", -1, nat_afirmar }, { "maximo", -1, nat_maximo }, { "minimo", -1, nat_minimo }, { "contiene", 2, nat_contiene },
  { "agregar", -1, nat_agregar }, { "quitar", 2, nat_quitar }, { "quitarEn", 2, nat_quitarEn }, { "insertar", 3, nat_insertar },
  { "indice", 2, nat_indice }, { "contar", 2, nat_contar }, { "invertir", 1, nat_invertir }, { "copiar", 1, nat_copiar },
  { "ordenar", -1, nat_ordenar }, { "mapear", 2, nat_mapear }, { "filtrar", 2, nat_filtrar }, { "reducir", 3, nat_reducir },
  { "rebanar", -1, nat_rebanar }, { "aplanar", 1, nat_aplanar }, { "claves", 1, nat_claves }, { "valores", 1, nat_valores },
  { "pares", 1, nat_pares }, { "obtener", 3, nat_obtener }, { "borrar", 2, nat_borrar }, { "error", -1, nat_error },
  { "ahora", 0, nat_ahora }, { "reloj", 0, nat_reloj }, { "argumentos", 0, nat_argumentos }, { "entorno", -1, nat_entorno },
  { "salir", -1, nat_salir }, { "leerLinea", -1, nat_leerLinea }, { "leerTexto", 1, nat_leerTexto },
  { "escribirTexto", 2, nat_escribirTexto }, { "agregarTexto", 2, nat_agregarTexto }, { "existeArchivo", 1, nat_existeArchivo },
  { "borrarArchivo", 1, nat_borrarArchivo }, { " registro", 3, nat_registro },
  { NULL, 0, NULL }
};
NV n_buscar_nativa(const char* nombre) {
  for (int i = 0; NATIVAS[i].nombre; i++) if (strcmp(NATIVAS[i].nombre, nombre) == 0)
    return n_nativa_nueva(NATIVAS[i].nombre, NATIVAS[i].aridad, NATIVAS[i].f, NULL);
  return n_nulo();
}
static NV nat_faltante(NV* a, int n, void* extra) { SIN_USO; return n_nulo(); }
void n_iniciar(int argc, char** argv) {
  n_argc = argc; n_argv = argv;
  reloj_0 = reloj_ms();
  az_iniciar();
  n_faltante = n_nativa_nueva(" faltante", 0, nat_faltante, NULL);
#if defined(_WIN32)
  SetConsoleOutputCP(CP_UTF8);
  /* en modo texto, Windows escribe CR LF por cada LF: en binario el ejecutable
     escribe lo mismo que la VM, letra por letra (es lo que compara exp-aot) */
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stderr), _O_BINARY);
#endif
  static char bufsal[1 << 16];
  setvbuf(stdout, bufsal, _IOFBF, sizeof bufsal);
  n_hilo.valor = n_hilo.mensaje = n_hilo.pista = n_hilo.tipo = n_nulo();
}

#include "nrt_biblioteca.inc"    /* (motor-exp N4.6) Ñ como biblioteca de C */
#include "nrt_enlace.inc"        /* (motor-exp N4.10) C llamado directamente, sin capa */
