/* ============================================================================
 *  (motor-exp A6) El eDSL «datos» en el ejecutable: tablas con columnas, tipos y esquema.
 *  Cada función hace lo mismo que su par de src/12-edsl-datos.js: mismas reglas de tipos, mismo orden de filas y grupos, mismos mensajes.
 *  Una tabla guarda cada columna como una lista de Ñ; las operaciones devuelven tablas nuevas (las columnas no se comparten).
 * ========================================================================== */
typedef struct { NObj h; int ncol; NV* nombre; NV* tipo; NV* col; } NTabla;
#define TB(v) ((NTabla*)(v).u.o)

static NV tb_nueva(int ncol) {
  NTabla* t = (NTabla*)n_objeto(sizeof(NTabla), NC_TABLA);
  t->ncol = ncol;
  t->nombre = (NV*)n_mem(sizeof(NV) * (size_t)(ncol ? ncol : 1)); t->tipo = (NV*)n_mem(sizeof(NV) * (size_t)(ncol ? ncol : 1)); t->col = (NV*)n_mem(sizeof(NV) * (size_t)(ncol ? ncol : 1));
  for (int i = 0; i < ncol; i++) t->nombre[i] = t->tipo[i] = t->col[i] = n_nulo();
  return n_obj(t);
}
static void tb_liberar(NObj* o) {
  NTabla* t = (NTabla*)o;
  for (int i = 0; i < t->ncol; i++) { n_dec(t->nombre[i]); n_dec(t->tipo[i]); n_dec(t->col[i]); }
  free(t->nombre); free(t->tipo); free(t->col);
}
static int64_t tb_filas(NTabla* t) { return t->ncol ? LS(t->col[0])->n : 0; }
#define CELDA(t, c, f) (n_lv(LS((t)->col[c]))[f])

static int tx_c(NV t, const char* s) {   /* un texto de Ñ contra un literal ASCII */
  NTexto* x = TX(t); int64_t i = 0;
  for (; s[i]; i++) if (i >= x->n || x->s[i] != (uint16_t)(unsigned char)s[i]) return 0;
  return i == x->n;
}
static int es_nulo_celda(NV v) { return v.t == N_NULO || (n_es(v, NC_TEXTO) && TX(v)->n == 0); }   /* nulo(v) de la biblioteca: nulo o texto vacío */

/* String(v) de JavaScript */
static NV js_string(NV v) {
  if (n_es(v, NC_TEXTO)) return n_inc(v);
  if (v.t == N_NUM) { char b[64]; num_js(v.u.n, b); return n_texto_utf8(b); }
  if (v.t == N_BOOL) return n_texto_utf8(v.u.b ? "true" : "false");
  if (v.t == N_NULO) return n_texto_utf8("null");
  return n_texto_utf8("[object Object]");
}
/* la clave con la que la biblioteca compara valores: typeof + ':' + String(v), y 'f' + ms para una fecha */
static char* td_clave(NV v) {
  char b[96];
  if (n_es(v, NC_FECHA)) { char n[64]; num_js(((NFecha*)v.u.o)->ms, n); snprintf(b, sizeof b, "f%s", n); return sx_dup(b); }
  if (v.t == N_NUM) { char n[64]; num_js(v.u.n, n); snprintf(b, sizeof b, "number:%s", n); return sx_dup(b); }
  if (v.t == N_BOOL) return sx_dup(v.u.b ? "boolean:true" : "boolean:false");
  if (v.t == N_NULO) return sx_dup("object:null");
  if (n_es(v, NC_TEXTO)) { char* s = n_a_utf8(v, NULL); char* r = sx_cat("string:", s); free(s); return r; }
  return sx_dup("object:[object Object]");
}
/* un mapa con el orden de inserción, de textos a números (el Map de la biblioteca) */
typedef struct { char** k; int* v; int n, cap; int* tab; int ntab; } TdMapa;
static unsigned td_hash(const char* s) { unsigned h = 2166136261u; while (*s) { h ^= (unsigned char)*s++; h *= 16777619u; } return h; }
static void tdm_iniciar(TdMapa* m) { memset(m, 0, sizeof *m); m->ntab = 64; m->tab = (int*)n_mem(sizeof(int) * 64); for (int i = 0; i < 64; i++) m->tab[i] = -1; }
static void tdm_liberar(TdMapa* m) { for (int i = 0; i < m->n; i++) free(m->k[i]); free(m->k); free(m->v); free(m->tab); }
static int tdm_buscar(TdMapa* m, const char* k) {
  unsigned h = td_hash(k) & (unsigned)(m->ntab - 1);
  while (m->tab[h] >= 0) { if (!strcmp(m->k[m->tab[h]], k)) return m->tab[h]; h = (h + 1) & (unsigned)(m->ntab - 1); }
  return -1;
}
static int tdm_poner(TdMapa* m, char* k, int v, int* nuevo) {   /* toma k; devuelve el índice */
  int i = tdm_buscar(m, k);
  if (i >= 0) { free(k); if (nuevo) *nuevo = 0; return i; }
  if (m->n == m->cap) { m->cap = m->cap ? m->cap * 2 : 16; m->k = (char**)n_remem(m->k, sizeof(char*) * (size_t)m->cap); m->v = (int*)n_remem(m->v, sizeof(int) * (size_t)m->cap); }
  if ((m->n + 1) * 2 > m->ntab) {
    int nt = m->ntab * 2; free(m->tab); m->tab = (int*)n_mem(sizeof(int) * (size_t)nt); for (int j = 0; j < nt; j++) m->tab[j] = -1; m->ntab = nt;
    for (int j = 0; j < m->n; j++) { unsigned h = td_hash(m->k[j]) & (unsigned)(nt - 1); while (m->tab[h] >= 0) h = (h + 1) & (unsigned)(nt - 1); m->tab[h] = j; }
  }
  m->k[m->n] = k; m->v[m->n] = v;
  unsigned h = td_hash(k) & (unsigned)(m->ntab - 1); while (m->tab[h] >= 0) h = (h + 1) & (unsigned)(m->ntab - 1); m->tab[h] = m->n;
  if (nuevo) *nuevo = 1;
  return m->n++;
}
typedef struct { int64_t* v; int64_t n, cap; } TdIdx;
static void tdi_push(TdIdx* l, int64_t x) { if (l->n == l->cap) { l->cap = l->cap ? l->cap * 2 : 8; l->v = (int64_t*)n_remem(l->v, sizeof(int64_t) * (size_t)l->cap); } l->v[l->n++] = x; }

/* inferirTipo de la biblioteca */
static const char* td_inferir(NLista* l) {
  int hay = 0, todoEnt = 1, todoNum = 1, todoBool = 1, todoFecha = 1;
  NV* v = n_lv(l);
  for (int64_t i = 0; i < l->n; i++) {
    NV x = v[i];
    if (x.t == N_NULO) continue;
    hay = 1;
    if (x.t == N_NUM) { todoBool = 0; todoFecha = 0; if (x.u.n != trunc(x.u.n) || !isfinite(x.u.n)) todoEnt = 0; continue; }
    todoEnt = 0; todoNum = 0;
    if (x.t == N_BOOL) { todoFecha = 0; continue; }
    todoBool = 0;
    if (!n_es(x, NC_FECHA)) todoFecha = 0;
  }
  if (!hay) return "cualquiera";
  if (todoEnt) return "entero";
  if (todoNum) return "real";
  if (todoBool) return "bool";
  if (todoFecha) return "fecha";
  return "texto";
}
static const char* const TD_TIPOS[] = { "entero", "real", "texto", "bool", "fecha", "cualquiera", NULL };
static int td_tipo_valido(NV t) { if (!n_es(t, NC_TEXTO)) return 0; for (int i = 0; TD_TIPOS[i]; i++) if (tx_c(t, TD_TIPOS[i])) return 1; return 0; }

#define TD_TABLA(v, k, f) do { if (!n_es((v), NC_TABLA)) return ERR("«%s»: el argumento %d debe ser una tabla y es %s", (f), (long long)(k), n_tipo_de(v)); } while (0)
static int td_ent(NV v, int k, const char* f, double* out, NV* err) {   /* exigeEnt: un número, truncado */
  if (v.t != N_NUM) { *err = ERR("«%s»: el argumento %d debe ser un número y es %s", f, (long long)k, n_tipo_de(v)); return 0; }
  *out = trunc(v.u.n); return 1;
}
static int td_fn(NV v, int k, const char* f, NV* err) {
  if (!n_es(v, NC_CIERRE) && !n_es(v, NC_NATIVA)) { *err = ERR("«%s»: el argumento %d debe ser una función y es %s", f, (long long)k, n_tipo_de(v)); return 0; }
  return 1;
}
/* el índice de una columna, o el error que dice las que hay */
static int td_icol(NTabla* t, NV nombre, const char* f, NV* err) {
  for (int i = 0; i < t->ncol; i++) if (texto_igual(t->nombre[i], nombre)) return i;
  NBuf b = {0};
  if (t->ncol) { b_utf8(&b, "tiene: "); for (int i = 0; i < t->ncol; i++) { if (i) b_utf8(&b, ", "); b_txt(&b, t->nombre[i]); } }
  NV pista = t->ncol ? b_texto(&b) : n_texto_utf8("la tabla no tiene columnas");
  *err = ERRP(pista, "«%s»: la tabla no tiene una columna «%v»", f, nombre);
  return -1;
}
static int td_hay_col(NTabla* t, NV nombre) { for (int i = 0; i < t->ncol; i++) if (texto_igual(t->nombre[i], nombre)) return 1; return 0; }
static NV td_lista_copia(NV l) { NLista* x = LS(l); NV r = n_lista_nueva(x->n); for (int64_t i = 0; i < x->n; i++) n_lista_agregar(LS(r), n_lista_leer(x, i)); return r; }
/* una tabla nueva con las columnas c[0..n) de t (copias), en ese orden */
static NV td_eligir(NTabla* t, const int* idx, int n) {
  NV r = tb_nueva(n);
  for (int i = 0; i < n; i++) { TB(r)->nombre[i] = n_inc(t->nombre[idx[i]]); TB(r)->tipo[i] = n_inc(t->tipo[idx[i]]); TB(r)->col[i] = td_lista_copia(t->col[idx[i]]); }
  return r;
}
/* porFilas: las filas idx[0..n) de t */
static NV td_por_filas(NTabla* t, const int64_t* idx, int64_t n) {
  NV r = tb_nueva(t->ncol);
  for (int c = 0; c < t->ncol; c++) {
    TB(r)->nombre[c] = n_inc(t->nombre[c]); TB(r)->tipo[c] = n_inc(t->tipo[c]);
    NV l = n_lista_nueva(n); NV* v = n_lv(LS(t->col[c]));
    for (int64_t i = 0; i < n; i++) n_lista_agregar(LS(l), n_inc(v[idx[i]]));
    TB(r)->col[c] = l;
  }
  return r;
}
static NV td_fila_dic(NTabla* t, int64_t f) { NV d = n_dic_nuevo(); for (int c = 0; c < t->ncol; c++) n_dic_poner(DC(d), t->nombre[c], CELDA(t, c, f)); return d; }
static void td_poner_col(NV tb, int i, NV nombre, const char* tipo, NV lista) {   /* toma «lista»; copia «nombre» */
  TB(tb)->nombre[i] = n_inc(nombre); TB(tb)->tipo[i] = n_texto_utf8(tipo); TB(tb)->col[i] = lista;
}
static void td_poner_col_c(NV tb, int i, const char* nombre, const char* tipo, NV lista) {
  TB(tb)->nombre[i] = n_texto_utf8(nombre); TB(tb)->tipo[i] = n_texto_utf8(tipo); TB(tb)->col[i] = lista;
}
static void td_fijar_tipo(NV tb, int i) { n_dec(TB(tb)->tipo[i]); TB(tb)->tipo[i] = n_texto_utf8(td_inferir(LS(TB(tb)->col[i]))); }

/* ── comparar como lo hace JavaScript con «<» y «>» (para ordenar y para min/max) ── */
static int js_espacio(uint16_t c) { return c == 9 || c == 10 || c == 11 || c == 12 || c == 13 || c == 32 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF; }
static NV js_trim(NV t) {
  NTexto* x = TX(t); int64_t a = 0, b = x->n;
  while (a < b && js_espacio(x->s[a])) a++;
  while (b > a && js_espacio(x->s[b - 1])) b--;
  return n_texto_utf16(x->s + a, b - a);
}
static double js_a_numero_texto(NV t) {   /* Number("…") */
  NV r = js_trim(t); NTexto* x = TX(r);
  if (x->n == 0) { n_dec(r); return 0; }
  char buf[128]; if (x->n >= 127) { n_dec(r); return NAN; }
  for (int64_t i = 0; i < x->n; i++) { if (x->s[i] > 127) { n_dec(r); return NAN; } buf[i] = (char)x->s[i]; }
  buf[x->n] = 0; n_dec(r);
  if (!strcmp(buf, "Infinity") || !strcmp(buf, "+Infinity")) return INFINITY;
  if (!strcmp(buf, "-Infinity")) return -INFINITY;
  if (buf[0] == '0' && (buf[1] == 'x' || buf[1] == 'X') && buf[2]) { char* e; double v = (double)strtoull(buf + 2, &e, 16); return *e ? NAN : v; }
  for (char* p = buf; *p; p++) if (!((*p >= '0' && *p <= '9') || *p == '.' || *p == '-' || *p == '+' || *p == 'e' || *p == 'E')) return NAN;
  char* e; double v = strtod(buf, &e); return *e ? NAN : v;
}
/* clave de orden: una fecha es su marca de tiempo */
static NV td_ord(NV v) { if (n_es(v, NC_FECHA)) return n_num(((NFecha*)v.u.o)->ms); return v; }
static int td_cmp(NV p, NV q) {   /* -1 si p < q, 1 si p > q, 0 si ninguna */
  p = td_ord(p); q = td_ord(q);
  if (n_es(p, NC_TEXTO) && n_es(q, NC_TEXTO)) { int c = texto_cmp(p, q); return c < 0 ? -1 : c > 0 ? 1 : 0; }
  double x, y;
  if (p.t == N_NUM) x = p.u.n; else if (p.t == N_BOOL) x = p.u.b; else if (p.t == N_NULO) x = 0; else if (n_es(p, NC_TEXTO)) x = js_a_numero_texto(p); else x = NAN;
  if (q.t == N_NUM) y = q.u.n; else if (q.t == N_BOOL) y = q.u.b; else if (q.t == N_NULO) y = 0; else if (n_es(q, NC_TEXTO)) y = js_a_numero_texto(q); else y = NAN;
  return x < y ? -1 : x > y ? 1 : 0;
}
static int td_ord_igual(NV a, NV b) {   /* k(a) !== k(b) del min/max, para valores simples */
  a = td_ord(a); b = td_ord(b);
  if (a.t != b.t) return 0;
  if (a.t == N_NUM) return a.u.n == b.u.n;
  if (a.t == N_BOOL) return a.u.b == b.u.b;
  if (a.t == N_NULO) return 1;
  if (n_es(a, NC_TEXTO) && n_es(b, NC_TEXTO)) return texto_igual(a, b);
  return a.u.o == b.u.o;
}
/* ordenación estable por mezcla */
typedef int (*TdCmp)(void*, int64_t, int64_t);
static void td_mezcla(int64_t* v, int64_t* t, int64_t n, TdCmp cmp, void* ctx) {
  if (n < 2) return;
  int64_t m = n / 2;
  td_mezcla(v, t, m, cmp, ctx); td_mezcla(v + m, t, n - m, cmp, ctx);
  int64_t i = 0, j = m, k = 0;
  while (i < m && j < n) t[k++] = cmp(ctx, v[j], v[i]) < 0 ? v[j++] : v[i++];   /* a igualdad, sale primero el de la izquierda */
  while (i < m) t[k++] = v[i++];
  while (j < n) t[k++] = v[j++];
  memcpy(v, t, sizeof(int64_t) * (size_t)n);
}

/* ═══════════════════════════════════════════════════════════ entrar */
static NV td_de_cols(int n, NV* nombres, NV* cols) {   /* nombres[i] (se copia), cols[i] (se toma); tipos inferidos */
  NV r = tb_nueva(n);
  for (int i = 0; i < n; i++) td_poner_col(r, i, nombres[i], td_inferir(LS(cols[i])), cols[i]);
  return r;
}
NAT(td_deRegistros) {
  (void)n; (void)extra; LST(a[0], 1, "deRegistros");
  NLista* l = LS(a[0]);
  if (l->n == 0) return tb_nueva(0);
  NV p = n_lista_leer(l, 0);
  if (!n_es(p, NC_DIC)) { n_dec(p); return n_error("«deRegistros»: se esperaba una lista de diccionarios", NULL); }
  NDic* pd = DC(p); int nc = 0; NV* nombres = (NV*)n_mem(sizeof(NV) * (size_t)(pd->n ? pd->n : 1));
  for (int64_t i = 0; i < pd->usados; i++) if (pd->e[i].vivo) nombres[nc++] = js_string(pd->e[i].k);
  n_dec(p);
  NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(nc ? nc : 1)); for (int i = 0; i < nc; i++) cols[i] = n_lista_nueva(l->n);
  NV err = n_nulo(); int fallo = 0;
  for (int64_t f = 0; f < l->n && !fallo; f++) {
    NV r = n_lista_leer(l, f);
    if (!n_es(r, NC_DIC)) { err = ERR("«deRegistros»: el elemento %d no es un diccionario", (long long)(f + 1)); n_dec(r); fallo = 1; break; }
    NDic* rd = DC(r);
    for (int64_t i = 0; i < rd->usados && !fallo; i++) if (rd->e[i].vivo) {
      NV ks = js_string(rd->e[i].k); int esta = 0;
      for (int c = 0; c < nc; c++) if (texto_igual(nombres[c], ks)) esta = 1;
      if (!esta) {
        NBuf b = {0}; b_utf8(&b, "todos los registros tienen que traer las mismas claves: ");
        for (int c = 0; c < nc; c++) { if (c) b_utf8(&b, ", "); b_txt(&b, nombres[c]); }
        err = ERRP(b_texto(&b), "«deRegistros»: el registro %d trae «%v», que no está en el primero", (long long)(f + 1), ks); fallo = 1;
      }
      n_dec(ks);
    }
    if (!fallo) for (int c = 0; c < nc; c++) { NV v; if (n_dic_buscar(rd, nombres[c], &v)) n_lista_agregar(LS(cols[c]), n_inc(v)); else n_lista_agregar(LS(cols[c]), n_nulo()); }
    n_dec(r);
  }
  NV res;
  if (fallo) { for (int i = 0; i < nc; i++) n_dec(cols[i]); res = err; }
  else res = td_de_cols(nc, nombres, cols);
  for (int i = 0; i < nc; i++) n_dec(nombres[i]);
  free(nombres); free(cols);
  return res;
}
NAT(td_deColumnas) {
  (void)n; (void)extra;
  if (!n_es(a[0], NC_DIC)) return ERR("«deColumnas»: el argumento 1 debe ser un diccionario y es %s", n_tipo_de(a[0]));
  NDic* d = DC(a[0]); int nc = 0; int64_t filas = -1;
  NV* nombres = (NV*)n_mem(sizeof(NV) * (size_t)(d->n ? d->n : 1)); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(d->n ? d->n : 1));
  NV err = n_nulo(); int fallo = 0;
  for (int64_t i = 0; i < d->usados && !fallo; i++) if (d->e[i].vivo) {
    NV k = js_string(d->e[i].k); NV v = d->e[i].v;
    if (!n_es(v, NC_LISTA)) { err = ERR("«deColumnas»: «%v» no es una lista", k); fallo = 1; n_dec(k); break; }
    if (filas < 0) filas = LS(v)->n;
    else if (LS(v)->n != filas) { err = ERR("«deColumnas»: «%v» trae %d valores y las otras %d", k, (long long)LS(v)->n, (long long)filas); fallo = 1; n_dec(k); break; }
    nombres[nc] = k; cols[nc] = td_lista_copia(v); nc++;
  }
  NV res;
  if (fallo) { for (int i = 0; i < nc; i++) { n_dec(nombres[i]); n_dec(cols[i]); } res = err; }
  else { res = td_de_cols(nc, nombres, cols); for (int i = 0; i < nc; i++) n_dec(nombres[i]); }
  free(nombres); free(cols);
  return res;
}
NAT(td_deLista) {
  (void)n; (void)extra; LST(a[0], 1, "deLista"); LST(a[1], 2, "deLista");
  NLista *fs = LS(a[0]), *ns = LS(a[1]); int nc = (int)ns->n;
  NV* nombres = (NV*)n_mem(sizeof(NV) * (size_t)(nc ? nc : 1)); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(nc ? nc : 1));
  for (int i = 0; i < nc; i++) { NV x = n_lista_leer(ns, i); nombres[i] = js_string(x); n_dec(x); cols[i] = n_lista_nueva(fs->n); }
  NV err = n_nulo(); int fallo = 0;
  for (int64_t f = 0; f < fs->n && !fallo; f++) {
    NV r = n_lista_leer(fs, f);
    if (!n_es(r, NC_LISTA)) { err = ERR("«deLista»: la fila %d no es una lista", (long long)(f + 1)); fallo = 1; }
    else if (LS(r)->n != nc) { err = ERR("«deLista»: la fila %d trae %d valores y hay %d columnas", (long long)(f + 1), (long long)LS(r)->n, (long long)nc); fallo = 1; }
    else for (int c = 0; c < nc; c++) n_lista_agregar(LS(cols[c]), n_lista_leer(LS(r), c));
    n_dec(r);
  }
  NV res;
  if (fallo) { for (int i = 0; i < nc; i++) n_dec(cols[i]); res = err; } else res = td_de_cols(nc, nombres, cols);
  for (int i = 0; i < nc; i++) n_dec(nombres[i]);
  free(nombres); free(cols);
  return res;
}

/* ── CSV ── */
typedef struct { NV* c; int n, cap; } TdFila;
static void tdf_push(TdFila* f, NV x) { if (f->n == f->cap) { f->cap = f->cap ? f->cap * 2 : 8; f->c = (NV*)n_remem(f->c, sizeof(NV) * (size_t)f->cap); } f->c[f->n++] = x; }
static TdFila* td_filas_csv(NV texto, uint16_t sep, int* nf) {
  NTexto* x = TX(texto); int64_t n = x->n, i = 0;
  TdFila* filas = NULL; int cnt = 0, cap = 0; TdFila fila = {0}; NBuf campo = {0}; int en_com = 0;
#define TDF_CERRAR() do { if (cnt == cap) { cap = cap ? cap * 2 : 16; filas = (TdFila*)n_remem(filas, sizeof(TdFila) * (size_t)cap); } filas[cnt++] = fila; memset(&fila, 0, sizeof fila); } while (0)
  while (i < n) {
    uint16_t c = x->s[i];
    if (en_com) {
      if (c == '"') { if (i + 1 < n && x->s[i + 1] == '"') { b_c(&campo, '"'); i += 2; continue; } en_com = 0; i++; continue; }
      b_c(&campo, c); i++; continue;
    }
    if (c == '"' && campo.n == 0) { en_com = 1; i++; continue; }
    if (c == sep) { tdf_push(&fila, b_texto(&campo)); i++; continue; }
    if (c == '\r') { i++; continue; }
    if (c == '\n') { tdf_push(&fila, b_texto(&campo)); TDF_CERRAR(); i++; continue; }
    b_c(&campo, c); i++;
  }
  if (campo.n != 0 || fila.n) { tdf_push(&fila, b_texto(&campo)); TDF_CERRAR(); }
  free(campo.s); free(fila.c);
#undef TDF_CERRAR
  *nf = cnt; return filas;
}
static int dig(uint16_t c) { return c >= '0' && c <= '9'; }
static int td_pal(const uint16_t* p, int64_t n, const char* lit) {   /* el texto es esa palabra ASCII, sin distinguir mayúsculas */
  int64_t i = 0;
  for (; lit[i]; i++) { if (i >= n) return 0; uint16_t c = p[i]; if (c >= 'A' && c <= 'Z') c = (uint16_t)(c + 32); if (c != (uint16_t)(unsigned char)lit[i]) return 0; }
  return i == n;
}
/* parseFloat de JavaScript sobre un texto de Ñ: el prefijo decimal más largo (o NaN) */
static double td_parse_float(NV t) {
  NV r = js_trim(t); NTexto* x = TX(r); int64_t n = x->n, i = 0; char buf[200];
  if (n > 190) n = 190;
  if (i < n && (x->s[i] == '+' || x->s[i] == '-')) i++;
  int64_t ini_dig = i, nd = 0;
  if (n - i >= 8) { int ok = 1; for (int k = 0; k < 8; k++) if (x->s[i + k] != (uint16_t)"Infinity"[k]) ok = 0; if (ok) { double v = (x->s[0] == '-') ? -INFINITY : INFINITY; n_dec(r); return v; } }
  while (i < n && dig(x->s[i])) { i++; nd++; }
  if (i < n && x->s[i] == '.') { int64_t j = i + 1, nf = 0; while (j < n && dig(x->s[j])) { j++; nf++; } if (nd || nf) { i = j; nd += nf; } }
  if (!nd) { n_dec(r); return NAN; }
  if (i < n && (x->s[i] == 'e' || x->s[i] == 'E')) { int64_t j = i + 1; if (j < n && (x->s[j] == '+' || x->s[j] == '-')) j++; if (j < n && dig(x->s[j])) { while (j < n && dig(x->s[j])) j++; i = j; } }
  (void)ini_dig;
  for (int64_t k = 0; k < i; k++) buf[k] = (char)x->s[k];
  buf[i] = 0; n_dec(r);
  return strtod(buf, NULL);
}
/* leerCampo: adivina el tipo de un campo de texto. Devuelve un valor nuevo (o el propio texto) */
static NV td_leer_campo(NV s) {
  NV t = js_trim(s); NTexto* x = TX(t); int64_t n = x->n;
  if (n == 0) { n_dec(t); return n_nulo(); }
  const uint16_t* p = x->s; int64_t i = 0;
  if (p[0] == '-') i = 1;
  int64_t d0 = i; while (i < n && dig(p[i])) i++;
  int64_t nd = i - d0;
  if (nd > 0 && i == n) {   /* ^-?\d+$ */
    char b[64]; int64_t k = n < 63 ? n : 63; for (int64_t q = 0; q < k; q++) b[q] = (char)p[q]; b[k] = 0;
    double v = strtod(b, NULL);
    if (n < 63 && fabs(v) <= 9007199254740991.0) { n_dec(t); return n_num(v); }
  }
  if (nd > 0 && i < n && (p[i] == '.' || p[i] == ',')) {   /* ^-?\d+[.,]\d+$ */
    int64_t j = i + 1; int64_t f0 = j; while (j < n && dig(p[j])) j++;
    if (j > f0 && j == n) {
      char b[96]; int64_t k = n < 95 ? n : 95; for (int64_t q = 0; q < k; q++) b[q] = p[q] == ',' ? '.' : (char)p[q]; b[k] = 0;
      n_dec(t); return n_num(strtod(b, NULL));
    }
  }
  /* cierto|verdadero|si|sí|true / falso|no|false, sin distinguir mayúsculas */
  { static const uint16_t SI_TILDE[2] = { 's', 0xED };
    if (td_pal(p, n, "cierto") || td_pal(p, n, "verdadero") || td_pal(p, n, "si") || td_pal(p, n, "true") || (n == 2 && (p[0] | 32) == 's' && (p[1] == 0xED || p[1] == 0xCD) && SI_TILDE[1])) { n_dec(t); return n_bool(1); }
    if (td_pal(p, n, "falso") || td_pal(p, n, "no") || td_pal(p, n, "false")) { n_dec(t); return n_bool(0); }
  }
  /* fecha: ^(\d{4})-(\d{1,2})-(\d{1,2})$ y ^(\d{1,2})\/(\d{1,2})\/(\d{4})$ */
  { int64_t j = 0; int64_t a1 = 0, b1 = 0, c1 = 0; int ok = 0;
    while (j < n && dig(p[j]) && j < 4) { a1 = a1 * 10 + (p[j] - '0'); j++; }
    if (j == 4 && j < n && p[j] == '-') {
      j++; int64_t q = j; while (j < n && dig(p[j]) && j - q < 2) { b1 = b1 * 10 + (p[j] - '0'); j++; }
      if (j > q && j < n && p[j] == '-') { j++; q = j; while (j < n && dig(p[j]) && j - q < 2) { c1 = c1 * 10 + (p[j] - '0'); j++; } if (j > q && j == n) ok = 1; }
    }
    if (ok) { double y = (double)a1; if (y <= 99) y += 1900; n_dec(t); return n_fecha(fe_msDe3(y, (double)(b1 - 1), (double)c1)); }
    j = 0; a1 = b1 = c1 = 0; ok = 0;
    int64_t q = 0; while (j < n && dig(p[j]) && j - q < 2) { a1 = a1 * 10 + (p[j] - '0'); j++; }
    if (j > q && j < n && p[j] == '/') {
      j++; q = j; while (j < n && dig(p[j]) && j - q < 2) { b1 = b1 * 10 + (p[j] - '0'); j++; }
      if (j > q && j < n && p[j] == '/') { j++; q = j; while (j < n && dig(p[j]) && j - q < 4) { c1 = c1 * 10 + (p[j] - '0'); j++; } if (j - q == 4 && j == n) ok = 1; }
    }
    if (ok) { double y = (double)c1; if (y <= 99) y += 1900; n_dec(t); return n_fecha(fe_msDe3(y, (double)(b1 - 1), (double)a1)); }
  }
  n_dec(t);
  return n_inc(s);
}
NAT(td_deCsv) {
  (void)extra; TXT(a[0], 1, "deCsv");
  uint16_t sep;
  if (n > 1) { TXT(a[1], 2, "deCsv"); sep = TX(a[1])->n ? TX(a[1])->s[0] : 0xFFFF; if (TX(a[1])->n != 1) sep = 0xFFFF; }
  else { NTexto* x = TX(a[0]); int64_t k = 0; int pc = 0; while (k < x->n && x->s[k] != '\n') { if (x->s[k] == ';') pc = 1; k++; } sep = pc ? ';' : ','; }
  int nf; TdFila* fs = td_filas_csv(a[0], sep, &nf);
  /* se descarta UNA sola línea final vacía: el salto con el que acaba todo archivo de texto */
  if (nf && fs[nf - 1].n == 1) { NV u = js_trim(fs[nf - 1].c[0]); int vacia = TX(u)->n == 0; n_dec(u); if (vacia) { n_dec(fs[nf - 1].c[0]); free(fs[nf - 1].c); nf--; } }
  NV res;
  if (!nf) res = tb_nueva(0);
  else {
    int nc = fs[0].n;
    NV* nombres = (NV*)n_mem(sizeof(NV) * (size_t)(nc ? nc : 1)); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(nc ? nc : 1));
    for (int c = 0; c < nc; c++) { nombres[c] = js_trim(fs[0].c[c]); cols[c] = n_lista_nueva(nf); }
    for (int f = 1; f < nf; f++) for (int c = 0; c < nc; c++) n_lista_agregar(LS(cols[c]), c < fs[f].n ? td_leer_campo(fs[f].c[c]) : n_nulo());
    res = td_de_cols(nc, nombres, cols);
    for (int c = 0; c < nc; c++) n_dec(nombres[c]);
    free(nombres); free(cols);
  }
  for (int f = 0; f < nf; f++) { for (int c = 0; c < fs[f].n; c++) n_dec(fs[f].c[c]); free(fs[f].c); }
  free(fs);
  return res;
}

/* deDatos: el formato .ñdatos */
static const char* js_typeof(NV v) { return v.t == N_NUM ? "number" : v.t == N_BOOL ? "boolean" : n_es(v, NC_TEXTO) ? "string" : "object"; }
static int js_a_numero(NV v, double* out) {   /* Number(v) para los valores que trae un JSON */
  if (v.t == N_NUM) { *out = v.u.n; return 1; }
  if (v.t == N_BOOL) { *out = v.u.b; return 1; }
  if (v.t == N_NULO) { *out = 0; return 1; }
  if (n_es(v, NC_TEXTO)) { *out = js_a_numero_texto(v); return 1; }
  *out = NAN; return 1;
}
static int d2(const uint16_t* p) { return (p[0] - '0') * 10 + (p[1] - '0'); }
/* la fecha de un campo «2026-09-29» o «2026-09-29 14:30:00(.123)»; 0 si no encaja */
static int td_fecha_datos(NV s, double* ms) {
  NTexto* x = TX(s); const uint16_t* p = x->s; int64_t n = x->n;
  if (n < 10) return 0;
  for (int i = 0; i < 10; i++) { if (i == 4 || i == 7) { if (p[i] != '-') return 0; } else if (!dig(p[i])) return 0; }
  double y = (p[0] - '0') * 1000 + (p[1] - '0') * 100 + (p[2] - '0') * 10 + (p[3] - '0'), mo = d2(p + 5), d = d2(p + 8);
  double h = 0, mi = 0, se = 0, ml = 0;
  if (n > 10) {
    if ((p[10] != 'T' && p[10] != ' ') || n < 16 || !dig(p[11]) || !dig(p[12]) || p[13] != ':' || !dig(p[14]) || !dig(p[15])) return 0;
    h = d2(p + 11); mi = d2(p + 14);
    if (n > 16) {
      if (n < 19 || p[16] != ':' || !dig(p[17]) || !dig(p[18])) return 0;
      se = d2(p + 17);
      if (n > 19) {
        if (p[19] != '.' || n < 21 || n > 23) return 0;
        double v = 0; int k = 0; for (int64_t i = 20; i < n; i++) { if (!dig(p[i])) return 0; v = v * 10 + (p[i] - '0'); k++; }
        while (k < 3) { v *= 10; k++; }
        ml = v;
      }
    }
  }
  if (y <= 99) y += 1900;
  *ms = fe_utc(y, mo - 1, d, h, mi, se, ml);
  return 1;
}
NAT(td_deDatos) {
  (void)n; (void)extra; TXT(a[0], 1, "deDatos");
  char* s = n_a_utf8(a[0], NULL);
  JsP p = { s, strlen(s), 0, 0, 0 }; NV j = n_nulo(), ep = n_nulo();
  int r = js_valor(&p, &j, 0, &ep);
  if (r == -1) { free(s); return ep; }
  if (r == 1) { js_ws(&p); if (p.i < p.n) { n_dec(j); r = js_falla(&p, JE_NOWS, p.i); } }
  if (r != 1) { char m[600]; js_mensaje(&p, m, sizeof m); free(s); return n_errorT(n_texto_utf8("«deDatos»: el texto no es JSON válido"), n_texto_utf8(m)); }
  free(s);
  NV res = n_nulo();
#define DD_ERR(...) do { res = ERR(__VA_ARGS__); goto fin; } while (0)
#define DD_ERRP(pista, ...) do { res = ERRP(pista, __VA_ARGS__); goto fin; } while (0)
  if (!n_es(j, NC_DIC)) DD_ERRP(n_texto_utf8("tiene que ser un objeto con «ñdatos», «columnas» y «datos»"), "«deDatos»: el JSON no es un documento .ñdatos");
  NDic* jd = DC(j); NV ver, cols, datos, filasv; NV kk;
  kk = n_texto_utf8("ñdatos"); int hay_ver = n_dic_buscar(jd, kk, &ver); n_dec(kk);
  if (!hay_ver) DD_ERRP(n_texto_utf8("esto no parece un archivo del formato; si es un CSV, usa «deCsv»"), "«deDatos»: falta la marca «ñdatos»");
  { double vn; js_a_numero(ver, &vn); if (vn > 1) { NV vs = js_string(ver); res = ERR("«deDatos»: el archivo es del formato versión %v y este motor entiende hasta la 1", vs); n_dec(vs); goto fin; } }
  kk = n_texto_utf8("columnas"); int hc = n_dic_buscar(jd, kk, &cols); n_dec(kk);
  kk = n_texto_utf8("datos"); int hd = n_dic_buscar(jd, kk, &datos); n_dec(kk);
  if (!hc || !hd || !n_es(cols, NC_LISTA) || !n_es(datos, NC_LISTA)) DD_ERR("«deDatos»: «columnas» y «datos» tienen que ser listas");
  NLista *cl = LS(cols), *dl = LS(datos);
  if (cl->n != dl->n) DD_ERR("«deDatos»: hay %d columnas declaradas y %d listas de datos", (long long)cl->n, (long long)dl->n);
  int nc = (int)cl->n;
  NV t = tb_nueva(nc);
  for (int i = 0; i < nc; i++) {
    NV c = n_lista_leer(cl, i); NV nom = n_nulo(), tip = n_nulo(); int hn = 0, ht = 0;
    if (n_es(c, NC_DIC)) { NV k1 = n_texto_utf8("nombre"), k2 = n_texto_utf8("tipo"); hn = n_dic_buscar(DC(c), k1, &nom); ht = n_dic_buscar(DC(c), k2, &tip); n_dec(k1); n_dec(k2); }
    if (!hn || !n_es(nom, NC_TEXTO)) { n_dec(c); n_dec(t); DD_ERR("«deDatos»: la columna %d no trae nombre", (long long)(i + 1)); }
    NV tipo = ht ? tip : n_texto_utf8("cualquiera");
    if (!td_tipo_valido(tipo)) {
      NBuf b = {0}; b_utf8(&b, "los tipos son: "); for (int q = 0; TD_TIPOS[q]; q++) { if (q) b_utf8(&b, ", "); b_utf8(&b, TD_TIPOS[q]); }
      NV ts = js_string(tipo); NV pista = b_texto(&b);
      if (!ht) n_dec(tipo);
      n_dec(c); n_dec(t); res = ERRP(pista, "«deDatos»: «%v» no es un tipo de columna", ts); n_dec(ts); goto fin;
    }
    TB(t)->nombre[i] = n_inc(nom); TB(t)->tipo[i] = ht ? n_inc(tip) : tipo; n_dec(c);
  }
  int64_t filas = 0;
  if (dl->n) { NV c0 = n_lista_leer(dl, 0); filas = n_es(c0, NC_LISTA) ? LS(c0)->n : 0; n_dec(c0); }
  for (int i = 0; i < nc; i++) {
    NV col = n_lista_leer(dl, i);
    if (!n_es(col, NC_LISTA)) { n_dec(col); NV nm = TB(t)->nombre[i]; res = ERR("«deDatos»: los datos de «%v» no son una lista", nm); n_dec(t); goto fin; }
    if (LS(col)->n != filas) { res = ERR("«deDatos»: «%v» trae %d valores y «%v» trae %d", TB(t)->nombre[i], (long long)LS(col)->n, TB(t)->nombre[0], (long long)filas); n_dec(col); n_dec(t); goto fin; }
    n_dec(col);
  }
  kk = n_texto_utf8("filas"); int hf = n_dic_buscar(jd, kk, &filasv); n_dec(kk);
  if (hf && !(filasv.t == N_NUM && filasv.u.n == (double)filas)) {
    NV fs = js_string(filasv); res = ERR("«deDatos»: el archivo dice %v filas y trae %d", fs, (long long)filas); n_dec(fs); n_dec(t); goto fin;
  }
  for (int i = 0; i < nc; i++) {
    NV col = n_lista_leer(dl, i); NV nl = n_lista_nueva(filas);
    NV tipo = TB(t)->tipo[i];
    for (int64_t f = 0; f < filas; f++) {
      NV v = n_lista_leer(LS(col), f); NV out = n_nulo();
      if (v.t == N_NULO) { n_lista_agregar(LS(nl), n_nulo()); continue; }
      if (tx_c(tipo, "fecha")) {
        double ms;
        if (!n_es(v, NC_TEXTO)) { res = ERR("«deDatos»: la columna «%v», fila %d, debía traer una fecha", TB(t)->nombre[i], (long long)(f + 1)); n_dec(v); n_dec(nl); n_dec(col); n_dec(t); goto fin; }
        if (!td_fecha_datos(v, &ms)) { res = ERRP(n_texto_utf8("el formato guarda las fechas como 2026-09-29 o 2026-09-29 14:30:00"), "«deDatos»: «%v» no es una fecha en la columna «%v», fila %d", v, TB(t)->nombre[i], (long long)(f + 1)); n_dec(v); n_dec(nl); n_dec(col); n_dec(t); goto fin; }
        out = n_fecha(ms); n_dec(v);
      } else if (tx_c(tipo, "entero") || tx_c(tipo, "real")) {
        if (v.t != N_NUM) { res = ERR("«deDatos»: la columna «%v», fila %d, debía traer un número y trae %s", TB(t)->nombre[i], (long long)(f + 1), js_typeof(v)); n_dec(v); n_dec(nl); n_dec(col); n_dec(t); goto fin; }
        out = tx_c(tipo, "entero") ? n_num(trunc(v.u.n)) : v;
      } else if (tx_c(tipo, "bool")) {
        if (v.t != N_BOOL) { res = ERR("«deDatos»: la columna «%v», fila %d, debía traer verdadero o falso", TB(t)->nombre[i], (long long)(f + 1)); n_dec(v); n_dec(nl); n_dec(col); n_dec(t); goto fin; }
        out = v;
      } else if (tx_c(tipo, "texto")) { out = n_es(v, NC_TEXTO) ? v : js_string(v); if (!n_es(v, NC_TEXTO)) n_dec(v); }
      else out = v;
      n_lista_agregar(LS(nl), out);
    }
    TB(t)->col[i] = nl; n_dec(col);
  }
  res = t;
fin:
  n_dec(j);
#undef DD_ERR
#undef DD_ERRP
  return res;
}

/* ═══════════════════════════════════════════════════════════ salir */
/* aJsonValor de la biblioteca: lo que se guarda de una celda */
static NV td_a_json_valor(NV v, NV tipo) {
  if (v.t == N_NULO) return n_nulo();
  if (tx_c(tipo, "fecha")) { if (!n_es(v, NC_FECHA)) return n_nulo(); NBuf b = {0}; iso_de_fecha(&b, ((NFecha*)v.u.o)->ms); return b_texto(&b); }
  if (v.t == N_NUM || v.t == N_BOOL || n_es(v, NC_TEXTO)) return n_inc(v);
  return n_repr(v, 1);
}
NAT(td_aDatos) {
  (void)extra; TD_TABLA(a[0], 1, "aDatos");
  NTabla* t = TB(a[0]); int bonito = n > 1 && n_verdad(a[1]);
  NV doc = n_dic_nuevo();
  dic_pon(doc, "ñdatos", n_num(1));
  NV cs = n_lista_nueva(t->ncol);
  for (int c = 0; c < t->ncol; c++) { NV d = n_dic_nuevo(); dic_pon(d, "nombre", n_inc(t->nombre[c])); dic_pon(d, "tipo", n_inc(t->tipo[c])); n_lista_agregar(LS(cs), d); }
  dic_pon(doc, "columnas", cs);
  int64_t filas = tb_filas(t);
  dic_pon(doc, "filas", n_num((double)filas));
  NV ds = n_lista_nueva(t->ncol);
  for (int c = 0; c < t->ncol; c++) {
    NV l = n_lista_nueva(filas);
    for (int64_t f = 0; f < filas; f++) n_lista_agregar(LS(l), td_a_json_valor(CELDA(t, c, f), t->tipo[c]));
    n_lista_agregar(LS(ds), l);
  }
  dic_pon(doc, "datos", ds);
  NBuf b = {0}; NV err;
  /* ojo: un diccionario con «ñdatos» no tiene claves de índice, así que el orden es el de inserción */
  int ok = js_escribir(&b, doc, 0, bonito, 0, &err);
  n_dec(doc);
  if (!ok) { free(b.s); return err; }
  return b_texto(&b);
}
static int td_csv_necesita_comillas(NV s, NV sep) {
  NTexto* x = TX(s); NTexto* y = TX(sep);
  for (int64_t i = 0; i < x->n; i++) {
    uint16_t c = x->s[i];
    if (c == '"' || c == '\n' || c == '\r') return 1;
    for (int64_t k = 0; k < y->n; k++) if (c == y->s[k]) return 1;
  }
  return 0;
}
static void td_csv_campo(NBuf* b, NV v, NV sep) {
  if (v.t == N_NULO) return;
  NV s;
  if (n_es(v, NC_FECHA)) { NBuf f = {0}; iso_de_fecha(&f, ((NFecha*)v.u.o)->ms); s = b_texto(&f); }
  else if (n_es(v, NC_TEXTO)) s = n_inc(v);
  else if (v.t == N_BOOL) s = n_texto_utf8(v.u.b ? "cierto" : "falso");
  else s = n_repr(v, 1);
  if (td_csv_necesita_comillas(s, sep)) {
    b_c(b, '"'); NTexto* x = TX(s);
    for (int64_t i = 0; i < x->n; i++) { if (x->s[i] == '"') b_c(b, '"'); b_c(b, x->s[i]); }
    b_c(b, '"');
  } else b_txt(b, s);
  n_dec(s);
}
NAT(td_aCsv) {
  (void)extra; TD_TABLA(a[0], 1, "aCsv");
  NTabla* t = TB(a[0]); NV sep;
  if (n > 1) { TXT(a[1], 2, "aCsv"); sep = n_inc(a[1]); } else sep = n_texto_utf8(",");
  NBuf b = {0}; int64_t filas = tb_filas(t);
  for (int c = 0; c < t->ncol; c++) { if (c) b_txt(&b, sep); td_csv_campo(&b, t->nombre[c], sep); }
  for (int64_t f = 0; f < filas; f++) { b_c(&b, '\n'); for (int c = 0; c < t->ncol; c++) { if (c) b_txt(&b, sep); td_csv_campo(&b, CELDA(t, c, f), sep); } }
  n_dec(sep);
  return b_texto(&b);
}
NAT(td_aLista) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "aLista");
  NTabla* t = TB(a[0]); int64_t filas = tb_filas(t);
  NV out = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) { NV r = n_lista_nueva(t->ncol); for (int c = 0; c < t->ncol; c++) n_lista_agregar(LS(r), n_inc(CELDA(t, c, f))); n_lista_agregar(LS(out), r); }
  return out;
}
NAT(td_aRegistros) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "aRegistros");
  NTabla* t = TB(a[0]); int64_t filas = tb_filas(t);
  NV out = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) n_lista_agregar(LS(out), td_fila_dic(t, f));
  return out;
}
NAT(td_aColumnas) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "aColumnas");
  NTabla* t = TB(a[0]); NV d = n_dic_nuevo();
  for (int c = 0; c < t->ncol; c++) { NV l = td_lista_copia(t->col[c]); n_dic_poner(DC(d), t->nombre[c], l); n_dec(l); }
  return d;
}

/* ═══════════════════════════════════════════════ mirar antes de tocar */
NAT(td_columnas) { (void)n; (void)extra; TD_TABLA(a[0], 1, "columnas"); NTabla* t = TB(a[0]); NV l = n_lista_nueva(t->ncol); for (int c = 0; c < t->ncol; c++) n_lista_agregar(LS(l), n_inc(t->nombre[c])); return l; }
NAT(td_tipos) { (void)n; (void)extra; TD_TABLA(a[0], 1, "tipos"); NTabla* t = TB(a[0]); NV d = n_dic_nuevo(); for (int c = 0; c < t->ncol; c++) n_dic_poner(DC(d), t->nombre[c], t->tipo[c]); return d; }
static NV td_extremo(NV* a, int n, const char* f, int primeras) {
  TD_TABLA(a[0], 1, f);
  NTabla* t = TB(a[0]); double k = 5; NV err;
  if (n > 1 && !td_ent(a[1], 2, f, &k, &err)) return err;
  int64_t filas = tb_filas(t); TdIdx idx = {0};
  if (primeras) { double m = k < 0 ? 0 : k; if (m > (double)filas) m = (double)filas; for (int64_t i = 0; i < (int64_t)m; i++) tdi_push(&idx, i); }
  else { double ini = (double)filas - (k < 0 ? 0 : k); if (ini < 0) ini = 0; for (int64_t i = (int64_t)ini; i < filas; i++) tdi_push(&idx, i); }
  NV r = td_por_filas(t, idx.v, idx.n); free(idx.v); return r;
}
NAT(td_primeras) { (void)extra; return td_extremo(a, n, "primeras", 1); }
NAT(td_ultimas) { (void)extra; return td_extremo(a, n, "ultimas", 0); }
NAT(td_vacios) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "vacios");
  NTabla* t = TB(a[0]); NV d = n_dic_nuevo(); int64_t filas = tb_filas(t);
  for (int c = 0; c < t->ncol; c++) { int64_t k = 0; for (int64_t f = 0; f < filas; f++) if (es_nulo_celda(CELDA(t, c, f))) k++; NV v = n_num((double)k); n_dic_poner(DC(d), t->nombre[c], v); }
  return d;
}
NAT(td_describir) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "describir");
  NTabla* t = TB(a[0]); int64_t filas = tb_filas(t);
  NV cn = n_lista_nueva(t->ncol), ct = n_lista_nueva(t->ncol), cv = n_lista_nueva(t->ncol), cu = n_lista_nueva(t->ncol), cmin = n_lista_nueva(t->ncol), cmax = n_lista_nueva(t->ncol), cmed = n_lista_nueva(t->ncol);
  for (int c = 0; c < t->ncol; c++) {
    int64_t nvs = 0, nn = 0; TdMapa m; tdm_iniciar(&m);
    for (int64_t f = 0; f < filas; f++) { NV v = CELDA(t, c, f); if (es_nulo_celda(v)) continue; nvs++; if (v.t == N_NUM) nn++; tdm_poner(&m, td_clave(v), 0, NULL); }
    n_lista_agregar(LS(cn), n_inc(t->nombre[c])); n_lista_agregar(LS(ct), n_inc(t->tipo[c]));
    n_lista_agregar(LS(cv), n_num((double)(filas - nvs))); n_lista_agregar(LS(cu), n_num((double)m.n)); tdm_liberar(&m);
    if (nn == nvs && nn) {
      double mn = INFINITY, mx = -INFINITY, s = 0; int nan = 0;
      for (int64_t f = 0; f < filas; f++) { NV v = CELDA(t, c, f); if (es_nulo_celda(v)) continue; double x = v.u.n; if (isnan(x)) nan = 1; if (x < mn) mn = x; if (x > mx) mx = x; s += x; }
      if (nan) { mn = mx = NAN; }
      n_lista_agregar(LS(cmin), n_num(mn)); n_lista_agregar(LS(cmax), n_num(mx)); n_lista_agregar(LS(cmed), n_num(s / (double)nn));
    } else { n_lista_agregar(LS(cmin), n_nulo()); n_lista_agregar(LS(cmax), n_nulo()); n_lista_agregar(LS(cmed), n_nulo()); }
  }
  NV r = tb_nueva(7);
  td_poner_col_c(r, 0, "columna", "texto", cn); td_poner_col_c(r, 1, "tipo", "texto", ct); td_poner_col_c(r, 2, "vacios", "entero", cv); td_poner_col_c(r, 3, "distintos", "entero", cu);
  td_poner_col_c(r, 4, "minimo", "real", cmin); td_poner_col_c(r, 5, "maximo", "real", cmax); td_poner_col_c(r, 6, "media", "real", cmed);
  return r;
}
NAT(td_vistazo) {
  (void)extra; TD_TABLA(a[0], 1, "vistazo");
  NTabla* t = TB(a[0]); double nmax = 10; NV err;
  if (n > 1 && !td_ent(a[1], 2, "vistazo", &nmax, &err)) return err;
  int64_t filas = tb_filas(t); int64_t nf = (int64_t)(nmax < (double)filas ? nmax : (double)filas); if (nf < 0) nf = 0;
  int nc = t->ncol;
  NV* cel = (NV*)n_mem(sizeof(NV) * (size_t)(nf * nc + 1));
  for (int64_t f = 0; f < nf; f++) for (int c = 0; c < nc; c++) {
    NV v = CELDA(t, c, f);
    if (v.t == N_NULO) cel[f * nc + c] = n_texto_utf8("\xC2\xB7");
    else if (n_es(v, NC_FECHA)) { NBuf b = {0}; iso_de_fecha(&b, ((NFecha*)v.u.o)->ms); cel[f * nc + c] = b_texto(&b); }
    else if (n_es(v, NC_TEXTO)) cel[f * nc + c] = n_inc(v);
    else cel[f * nc + c] = n_repr(v, 1);
  }
  int64_t* an = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(nc ? nc : 1)); int* num = (int*)n_mem(sizeof(int) * (size_t)(nc ? nc : 1));
  for (int c = 0; c < nc; c++) {
    int64_t w = TX(t->nombre[c])->n; if (TX(t->tipo[c])->n > w) w = TX(t->tipo[c])->n;
    for (int64_t f = 0; f < nf; f++) if (TX(cel[f * nc + c])->n > w) w = TX(cel[f * nc + c])->n;
    an[c] = w; num[c] = tx_c(t->tipo[c], "entero") || tx_c(t->tipo[c], "real");
  }
#define TD_PAD(b, s, i) do { int64_t rel = an[i] - TX(s)->n; if (num[i]) { for (int64_t q = 0; q < rel; q++) b_c(&(b), ' '); b_txt(&(b), s); } else { b_txt(&(b), s); for (int64_t q = 0; q < rel; q++) b_c(&(b), ' '); } } while (0)
  { NBuf b = {0}; for (int c = 0; c < nc; c++) { if (c) b_utf8(&b, "  "); TD_PAD(b, t->nombre[c], c); } NV l = b_texto(&b); n_salida(l); n_dec(l); }
  { NBuf b = {0}; for (int c = 0; c < nc; c++) { if (c) b_utf8(&b, "  "); TD_PAD(b, t->tipo[c], c); } NV l = b_texto(&b); n_salida(l); n_dec(l); }
  { NBuf b = {0}; for (int c = 0; c < nc; c++) { if (c) b_utf8(&b, "  "); for (int64_t q = 0; q < an[c]; q++) b_c(&b, 0x2500); } NV l = b_texto(&b); n_salida(l); n_dec(l); }
  for (int64_t f = 0; f < nf; f++) { NBuf b = {0}; for (int c = 0; c < nc; c++) { if (c) b_utf8(&b, "  "); TD_PAD(b, cel[f * nc + c], c); } NV l = b_texto(&b); n_salida(l); n_dec(l); }
#undef TD_PAD
  if ((double)filas > nmax) { char m[200]; snprintf(m, sizeof m, "\xE2\x80\xA6 y %.0f filas m\xC3\xA1s (%lld en total)", (double)filas - nmax, (long long)filas); NV l = n_texto_utf8(m); n_salida(l); n_dec(l); }
  for (int64_t i = 0; i < nf * nc; i++) n_dec(cel[i]);
  free(cel); free(an); free(num);
  return n_nulo();
}

/* ═════════════════════════════════════════════════════════ seleccionar */
NAT(td_columna) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "columna"); TXT(a[1], 2, "columna");
  NV err; int c = td_icol(TB(a[0]), a[1], "columna", &err); if (c < 0) return err;
  return td_lista_copia(TB(a[0])->col[c]);
}
NAT(td_celda) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "celda");
  NTabla* t = TB(a[0]); double f; NV err; if (!td_ent(a[1], 2, "celda", &f, &err)) return err;
  int64_t filas = tb_filas(t);
  if (f < 0 || f >= (double)filas) return ERR("«celda»: la fila %n no existe · la tabla tiene %d", f, (long long)filas);
  TXT(a[2], 3, "celda");
  int c = td_icol(t, a[2], "celda", &err); if (c < 0) return err;
  return n_inc(CELDA(t, c, (int64_t)f));
}
NAT(td_fila) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "fila");
  NTabla* t = TB(a[0]); double f; NV err; if (!td_ent(a[1], 2, "fila", &f, &err)) return err;
  int64_t filas = tb_filas(t);
  if (f < 0 || f >= (double)filas) return ERR("«fila»: la fila %n no existe · la tabla tiene %d", f, (long long)filas);
  return td_fila_dic(t, (int64_t)f);
}
NAT(td_soloColumnas) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "soloColumnas"); LST(a[1], 2, "soloColumnas");
  NTabla* t = TB(a[0]); NLista* ns = LS(a[1]); int* idx = (int*)n_mem(sizeof(int) * (size_t)(ns->n ? ns->n : 1)); NV err;
  for (int64_t i = 0; i < ns->n; i++) {
    NV x = n_lista_leer(ns, i); NV s = js_string(x); n_dec(x);
    idx[i] = td_icol(t, s, "soloColumnas", &err); n_dec(s);
    if (idx[i] < 0) { free(idx); return err; }
  }
  NV r = td_eligir(t, idx, (int)ns->n); free(idx); return r;
}
NAT(td_sinColumna) {
  (void)extra; TD_TABLA(a[0], 1, "sinColumna");
  NTabla* t = TB(a[0]); int* fuera = (int*)n_mem(sizeof(int) * (size_t)n); NV err;
  for (int i = 1; i < n; i++) {
    if (!n_es(a[i], NC_TEXTO)) { free(fuera); return ERR("«sinColumna»: el argumento %d debe ser texto y es %s", (long long)(i + 1), n_tipo_de(a[i])); }
    fuera[i - 1] = td_icol(t, a[i], "sinColumna", &err); if (fuera[i - 1] < 0) { free(fuera); return err; }
  }
  int* quedan = (int*)n_mem(sizeof(int) * (size_t)(t->ncol ? t->ncol : 1)); int nq = 0;
  for (int c = 0; c < t->ncol; c++) { int f = 0; for (int i = 0; i < n - 1; i++) if (fuera[i] == c) f = 1; if (!f) quedan[nq++] = c; }
  NV r = td_eligir(t, quedan, nq); free(quedan); free(fuera); return r;
}
NAT(td_renombrar) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "renombrar"); TXT(a[1], 2, "renombrar"); TXT(a[2], 3, "renombrar");
  NTabla* t = TB(a[0]); NV err; int i = td_icol(t, a[1], "renombrar", &err); if (i < 0) return err;
  if (!texto_igual(a[2], a[1]) && td_hay_col(t, a[2])) return ERR("«renombrar»: ya hay una columna «%v»", a[2]);
  int* idx = (int*)n_mem(sizeof(int) * (size_t)(t->ncol ? t->ncol : 1)); for (int c = 0; c < t->ncol; c++) idx[c] = c;
  NV r = td_eligir(t, idx, t->ncol); free(idx);
  n_dec(TB(r)->nombre[i]); TB(r)->nombre[i] = n_inc(a[2]);
  return r;
}
NAT(td_reordenar) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "reordenar"); LST(a[1], 2, "reordenar");
  NTabla* t = TB(a[0]); NLista* ns = LS(a[1]); int cap = (int)ns->n + t->ncol + 1; int* idx = (int*)n_mem(sizeof(int) * (size_t)cap); int ni = 0; NV err;
  for (int64_t i = 0; i < ns->n; i++) { NV x = n_lista_leer(ns, i); NV s = js_string(x); n_dec(x); idx[ni] = td_icol(t, s, "reordenar", &err); n_dec(s); if (idx[ni] < 0) { free(idx); return err; } ni++; }
  for (int c = 0; c < t->ncol; c++) { int esta = 0; for (int i = 0; i < ni; i++) if (idx[i] == c) esta = 1; if (!esta) idx[ni++] = c; }
  NV r = td_eligir(t, idx, ni); free(idx); return r;
}

/* ═══════════════════════════════════════════════ filtrar y ordenar */
NAT(td_donde) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "donde"); NV err; if (!td_fn(a[1], 2, "donde", &err)) return err;
  NTabla* t = TB(a[0]); N_RC_MAS(&t->h); int64_t filas = tb_filas(t); TdIdx idx = {0};
  for (int64_t f = 0; f < filas; f++) {
    NV d = td_fila_dic(t, f); NV r = n_llamar(a[1], &d, 1); n_dec(d);
    if (N_FALLO(r)) { free(idx.v); n_dec(n_obj(t)); return r; }
    if (n_verdad(r)) tdi_push(&idx, f);
    n_dec(r);
  }
  NV r = td_por_filas(t, idx.v, idx.n); free(idx.v); n_dec(n_obj(t)); return r;
}
typedef struct { NV* col; int desc; } TdOrd;
static int td_ord_cmp(void* c, int64_t x, int64_t y) {
  TdOrd* o = (TdOrd*)c; NV p = o->col[x], q = o->col[y];
  int np = es_nulo_celda(p), nq = es_nulo_celda(q);
  if (np && nq) return x < y ? -1 : 1;
  if (np) return 1;
  if (nq) return -1;
  int r = td_cmp(p, q);
  if (o->desc) r = -r;
  if (r) return r;
  return x < y ? -1 : 1;
}
NAT(td_ordenarPor) {
  (void)extra; TD_TABLA(a[0], 1, "ordenarPor"); TXT(a[1], 2, "ordenarPor");
  NTabla* t = TB(a[0]); NV err; int c = td_icol(t, a[1], "ordenarPor", &err); if (c < 0) return err;
  int desc = n > 2 && n_verdad(a[2]); int64_t filas = tb_filas(t);
  int64_t* idx = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(filas ? filas : 1)); int64_t* tmp = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(filas ? filas : 1));
  for (int64_t i = 0; i < filas; i++) idx[i] = i;
  TdOrd o = { n_lv(LS(t->col[c])), desc };
  td_mezcla(idx, tmp, filas, td_ord_cmp, &o);
  NV r = td_por_filas(t, idx, filas); free(idx); free(tmp); return r;
}
NAT(td_unicas) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "unicas"); TXT(a[1], 2, "unicas");
  NTabla* t = TB(a[0]); NV err; int c = td_icol(t, a[1], "unicas", &err); if (c < 0) return err;
  TdMapa m; tdm_iniciar(&m); NV out = n_lista_nueva(0); int64_t filas = tb_filas(t);
  for (int64_t f = 0; f < filas; f++) { NV v = CELDA(t, c, f); int nuevo; tdm_poner(&m, td_clave(v), 0, &nuevo); if (nuevo) n_lista_agregar(LS(out), n_inc(v)); }
  tdm_liberar(&m); return out;
}
static int td_cols_de(NTabla* t, NV* a, int n, int pos, const char* f, int** out, int* nout, NV* err) {   /* [] si no hay lista; si no, los índices */
  if (n <= pos) { *nout = t->ncol; *out = (int*)n_mem(sizeof(int) * (size_t)(t->ncol ? t->ncol : 1)); for (int c = 0; c < t->ncol; c++) (*out)[c] = c; return 1; }
  if (!n_es(a[pos], NC_LISTA)) { *err = ERR("«%s»: el argumento %d debe ser una lista y es %s", f, (long long)(pos + 1), n_tipo_de(a[pos])); return 0; }
  NLista* l = LS(a[pos]); *nout = (int)l->n; *out = (int*)n_mem(sizeof(int) * (size_t)(l->n ? l->n : 1));
  for (int64_t i = 0; i < l->n; i++) { NV x = n_lista_leer(l, i); NV s = js_string(x); n_dec(x); (*out)[i] = td_icol(t, s, f, err); n_dec(s); if ((*out)[i] < 0) { free(*out); return 0; } }
  return 1;
}
static char* td_clave_fila(NTabla* t, const int* cs, int ncs, int64_t f) {
  char* k = sx_dup("");
  for (int i = 0; i < ncs; i++) { char* c = td_clave(CELDA(t, cs[i], f)); char* k2 = i ? sx_cat(k, "\x01") : sx_dup(k); free(k); k = sx_cat(k2, c); free(k2); free(c); }
  return k;
}
NAT(td_sinRepetir) {
  (void)extra; TD_TABLA(a[0], 1, "sinRepetir");
  NTabla* t = TB(a[0]); int* cs; int ncs; NV err; if (!td_cols_de(t, a, n, 1, "sinRepetir", &cs, &ncs, &err)) return err;
  TdMapa m; tdm_iniciar(&m); TdIdx idx = {0}; int64_t filas = tb_filas(t);
  for (int64_t f = 0; f < filas; f++) { int nuevo; tdm_poner(&m, td_clave_fila(t, cs, ncs, f), 0, &nuevo); if (nuevo) tdi_push(&idx, f); }
  tdm_liberar(&m); free(cs);
  NV r = td_por_filas(t, idx.v, idx.n); free(idx.v); return r;
}
NAT(td_quitarVacios) {
  (void)extra; TD_TABLA(a[0], 1, "quitarVacios");
  NTabla* t = TB(a[0]); int* cs; int ncs; NV err; if (!td_cols_de(t, a, n, 1, "quitarVacios", &cs, &ncs, &err)) return err;
  TdIdx idx = {0}; int64_t filas = tb_filas(t);
  for (int64_t f = 0; f < filas; f++) { int hay = 0; for (int i = 0; i < ncs; i++) if (es_nulo_celda(CELDA(t, cs[i], f))) hay = 1; if (!hay) tdi_push(&idx, f); }
  free(cs); NV r = td_por_filas(t, idx.v, idx.n); free(idx.v); return r;
}

/* ═══════════════════════════════════════════════════════════ derivar */
NAT(td_conColumna) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "conColumna"); TXT(a[1], 2, "conColumna"); NV err; if (!td_fn(a[2], 3, "conColumna", &err)) return err;
  NTabla* t = TB(a[0]); N_RC_MAS(&t->h); int64_t filas = tb_filas(t); NV vals = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) {
    NV d = td_fila_dic(t, f); NV r = n_llamar(a[2], &d, 1); n_dec(d);
    if (N_FALLO(r)) { n_dec(vals); n_dec(n_obj(t)); return r; }
    n_lista_agregar(LS(vals), r);
  }
  int i = -1; for (int c = 0; c < t->ncol; c++) if (texto_igual(t->nombre[c], a[1])) { i = c; break; }
  int nc = t->ncol + (i < 0 ? 1 : 0);
  NV res = tb_nueva(nc);
  for (int c = 0; c < t->ncol; c++) {
    TB(res)->nombre[c] = n_inc(t->nombre[c]);
    if (c == i) { TB(res)->tipo[c] = n_texto_utf8(td_inferir(LS(vals))); TB(res)->col[c] = n_inc(vals); }
    else { TB(res)->tipo[c] = n_inc(t->tipo[c]); TB(res)->col[c] = td_lista_copia(t->col[c]); }
  }
  if (i < 0) { TB(res)->nombre[nc - 1] = n_inc(a[1]); TB(res)->tipo[nc - 1] = n_texto_utf8(td_inferir(LS(vals))); TB(res)->col[nc - 1] = n_inc(vals); }
  n_dec(vals); n_dec(n_obj(t));
  return res;
}
NAT(td_convertir) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "convertir"); TXT(a[1], 2, "convertir"); TXT(a[2], 3, "convertir");
  NTabla* t = TB(a[0]);
  if (!td_tipo_valido(a[2])) {
    NBuf b = {0}; b_utf8(&b, "los tipos son: "); for (int q = 0; TD_TIPOS[q]; q++) { if (q) b_utf8(&b, ", "); b_utf8(&b, TD_TIPOS[q]); }
    return ERRP(b_texto(&b), "«convertir»: «%v» no es un tipo de columna", a[2]);
  }
  NV err; int c = td_icol(t, a[1], "convertir", &err); if (c < 0) return err;
  int64_t filas = tb_filas(t); NV nl = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) {
    NV v = CELDA(t, c, f); NV out;
    if (es_nulo_celda(v)) { n_lista_agregar(LS(nl), n_nulo()); continue; }
    if (tx_c(a[2], "entero") || tx_c(a[2], "real")) {
      double x;
      if (v.t == N_NUM) x = v.u.n;
      else {
        NV s = js_string(v); NTexto* sx = TX(s); NBuf b = {0}; int hecho = 0;
        for (int64_t i = 0; i < sx->n; i++) { if (!hecho && sx->s[i] == ',') { b_c(&b, '.'); hecho = 1; } else b_c(&b, sx->s[i]); }
        NV s2 = b_texto(&b); n_dec(s);
        x = td_parse_float(s2); n_dec(s2);
      }
      if (isnan(x)) { NV r = n_repr(v, 1); NV e = ERR("«convertir»: «%v» de «%v» no es un número", r, a[1]); n_dec(r); n_dec(nl); return e; }
      out = n_num(tx_c(a[2], "entero") ? trunc(x) : x);
    } else if (tx_c(a[2], "texto")) {
      if (n_es(v, NC_FECHA)) { NBuf b = {0}; iso_de_fecha(&b, ((NFecha*)v.u.o)->ms); out = b_texto(&b); }
      else if (n_es(v, NC_TEXTO)) out = n_inc(v); else out = n_repr(v, 1);
    } else if (tx_c(a[2], "bool")) out = n_bool(n_verdad(v));
    else if (tx_c(a[2], "fecha")) {
      if (n_es(v, NC_FECHA)) out = n_inc(v);
      else {
        NV s = js_string(v); NV x = td_leer_campo(s); n_dec(s);
        if (!n_es(x, NC_FECHA)) { NV r = n_repr(v, 1); NV e = ERRP(n_texto_utf8("se leen 2026-09-29 y 29/09/2026"), "«convertir»: «%v» de «%v» no es una fecha", r, a[1]); n_dec(r); n_dec(x); n_dec(nl); return e; }
        out = x;
      }
    } else out = n_inc(v);
    n_lista_agregar(LS(nl), out);
  }
  NV res = tb_nueva(t->ncol);
  for (int i = 0; i < t->ncol; i++) {
    TB(res)->nombre[i] = n_inc(t->nombre[i]);
    if (i == c) { TB(res)->tipo[i] = n_inc(a[2]); TB(res)->col[i] = n_inc(nl); } else { TB(res)->tipo[i] = n_inc(t->tipo[i]); TB(res)->col[i] = td_lista_copia(t->col[i]); }
  }
  n_dec(nl); return res;
}
NAT(td_aplicarA) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "aplicarA"); TXT(a[1], 2, "aplicarA"); NV err; if (!td_fn(a[2], 3, "aplicarA", &err)) return err;
  NTabla* t = TB(a[0]); N_RC_MAS(&t->h); int c = td_icol(t, a[1], "aplicarA", &err); if (c < 0) { n_dec(n_obj(t)); return err; }
  int64_t filas = tb_filas(t); NV vals = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) {
    NV v = n_inc(CELDA(t, c, f)); NV r = n_llamar(a[2], &v, 1); n_dec(v);
    if (N_FALLO(r)) { n_dec(vals); n_dec(n_obj(t)); return r; }
    n_lista_agregar(LS(vals), r);
  }
  NV res = tb_nueva(t->ncol);
  for (int i = 0; i < t->ncol; i++) {
    TB(res)->nombre[i] = n_inc(t->nombre[i]);
    if (i == c) { TB(res)->tipo[i] = n_texto_utf8(td_inferir(LS(vals))); TB(res)->col[i] = n_inc(vals); } else { TB(res)->tipo[i] = n_inc(t->tipo[i]); TB(res)->col[i] = td_lista_copia(t->col[i]); }
  }
  n_dec(vals); n_dec(n_obj(t)); return res;
}
NAT(td_rellenarVacios) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "rellenarVacios"); TXT(a[1], 2, "rellenarVacios");
  NTabla* t = TB(a[0]); NV err; int c = td_icol(t, a[1], "rellenarVacios", &err); if (c < 0) return err;
  int64_t filas = tb_filas(t); NV nl = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) { NV v = CELDA(t, c, f); n_lista_agregar(LS(nl), n_inc(es_nulo_celda(v) ? a[2] : v)); }
  NV res = tb_nueva(t->ncol);
  for (int i = 0; i < t->ncol; i++) {
    TB(res)->nombre[i] = n_inc(t->nombre[i]);
    if (i == c) { TB(res)->tipo[i] = n_texto_utf8(td_inferir(LS(nl))); TB(res)->col[i] = n_inc(nl); } else { TB(res)->tipo[i] = n_inc(t->tipo[i]); TB(res)->col[i] = td_lista_copia(t->col[i]); }
  }
  n_dec(nl); return res;
}
NAT(td_numerar) {
  (void)extra; TD_TABLA(a[0], 1, "numerar");
  NTabla* t = TB(a[0]); NV nom; NV err; double desde = 1;
  if (n > 1) { TXT(a[1], 2, "numerar"); nom = n_inc(a[1]); } else nom = n_texto_utf8("n");
  if (n > 2 && !td_ent(a[2], 3, "numerar", &desde, &err)) { n_dec(nom); return err; }
  if (td_hay_col(t, nom)) { NV e = ERR("«numerar»: ya hay una columna «%v»", nom); n_dec(nom); return e; }
  int64_t filas = tb_filas(t); NV vals = n_lista_nueva(filas);
  for (int64_t f = 0; f < filas; f++) n_lista_agregar(LS(vals), n_num(desde + (double)f));
  NV res = tb_nueva(t->ncol + 1);
  for (int i = 0; i < t->ncol; i++) { TB(res)->nombre[i] = n_inc(t->nombre[i]); TB(res)->tipo[i] = n_inc(t->tipo[i]); TB(res)->col[i] = td_lista_copia(t->col[i]); }
  TB(res)->nombre[t->ncol] = nom; TB(res)->tipo[t->ncol] = n_texto_utf8("entero"); TB(res)->col[t->ncol] = vals;
  return res;
}

/* ═══════════════════════════════════════════════ agrupar y resumir */
/* una receta: el diccionario {agregado, columna?, separador?} que devuelven sumaCol, promedioCol… marcado con marca = 2 */
static NV td_receta(const char* clase, NV col, NV sep) {
  NV d = n_dic_nuevo();
  dic_pon(d, "agregado", n_texto_utf8(clase));
  if (col.t != N_NULO) dic_pon(d, "columna", n_inc(col));
  if (sep.t != N_NULO) dic_pon(d, "separador", n_inc(sep));
  d.u.o->marca = 2;
  return d;
}
#define TD_AGREGADO(nombre, quien, clase) NAT(nombre) { (void)extra; NV col = n_nulo(); if (n) { TXT(a[0], 1, quien); col = a[0]; } return td_receta(clase, col, n_nulo()); }
TD_AGREGADO(td_sumaCol, "sumaCol", "suma") TD_AGREGADO(td_promedioCol, "promedioCol", "promedio") TD_AGREGADO(td_minCol, "minCol", "min") TD_AGREGADO(td_maxCol, "maxCol", "max")
TD_AGREGADO(td_primeroCol, "primeroCol", "primero") TD_AGREGADO(td_ultimoCol, "ultimoCol", "ultimo") TD_AGREGADO(td_contarCol, "contarCol", "contar")
NAT(td_juntarCol) {
  (void)extra; if (n < 1) return n_error("«juntarCol»: el argumento 1 debe ser texto y es nulo", NULL);
  TXT(a[0], 1, "juntarCol"); NV sep;
  if (n > 1) { TXT(a[1], 2, "juntarCol"); sep = n_inc(a[1]); } else sep = n_texto_utf8(", ");
  NV r = td_receta("juntar", a[0], sep); n_dec(sep); return r;
}
typedef struct { NV nombre; char clase[16]; NV col; NV sep; } TdRec;
static NV td_dic_get(NV d, const char* k) { NV kk = n_texto_utf8(k), v = n_nulo(); int h = n_dic_buscar(DC(d), kk, &v); n_dec(kk); return h ? v : n_nulo(); }
static int td_leer_recetas(NV d, const char* quien, TdRec** out, int* nout, NV* err) {
  NDic* dd = DC(d); int cap = (int)dd->n; TdRec* rs = (TdRec*)n_mem(sizeof(TdRec) * (size_t)(cap ? cap : 1)); int nr = 0;
  for (int64_t i = 0; i < dd->usados; i++) if (dd->e[i].vivo) {
    NV v = dd->e[i].v;
    if (!n_es(v, NC_DIC) || v.u.o->marca != 2) {
      NV k = js_string(dd->e[i].k);
      *err = ERRP(n_texto_utf8("los agregados son sumaCol, promedioCol, minCol, maxCol, primeroCol, ultimoCol, contarCol y juntarCol"), "«%s»: «%v» no es un agregado", quien, k);
      n_dec(k); for (int j = 0; j < nr; j++) n_dec(rs[j].nombre); free(rs); return 0;
    }
    NV cl = td_dic_get(v, "agregado"); char* c = n_a_utf8(cl, NULL);
    snprintf(rs[nr].clase, sizeof rs[nr].clase, "%s", c); free(c);
    rs[nr].nombre = js_string(dd->e[i].k); rs[nr].col = td_dic_get(v, "columna"); rs[nr].sep = td_dic_get(v, "separador"); nr++;
  }
  if (!nr) { *err = ERR("«%s»: no se pidió ningún resumen", quien); free(rs); return 0; }
  *out = rs; *nout = nr; return 1;
}
static void td_liberar_recetas(TdRec* rs, int n) { for (int i = 0; i < n; i++) n_dec(rs[i].nombre); free(rs); }
/* aplicarReceta: el valor del agregado sobre las filas idx[0..n) — NV nuevo; N_ERR con el error pendiente */
static NV td_aplicar(NTabla* t, const TdRec* r, const int64_t* idx, int64_t ni) {
  if (!strcmp(r->clase, "contar")) {
    if (r->col.t == N_NULO) return n_num((double)ni);
    NV err; int c = td_icol(t, r->col, "contarCol", &err); if (c < 0) return err;
    int64_t k = 0; for (int64_t i = 0; i < ni; i++) if (!es_nulo_celda(CELDA(t, c, idx[i]))) k++;
    return n_num((double)k);
  }
  char quien[40]; snprintf(quien, sizeof quien, "%sCol", r->clase);
  NV err; int c = td_icol(t, r->col, quien, &err); if (c < 0) return err;
  int64_t nv = 0; NV* vals = (NV*)n_mem(sizeof(NV) * (size_t)(ni ? ni : 1));
  for (int64_t i = 0; i < ni; i++) { NV v = CELDA(t, c, idx[i]); if (!es_nulo_celda(v)) vals[nv++] = v; }
  NV res = n_nulo();
  if (!strcmp(r->clase, "suma") || !strcmp(r->clase, "promedio")) {
    int64_t nn = 0; for (int64_t i = 0; i < nv; i++) if (vals[i].t == N_NUM) nn++;
    if (nn != nv) {
      char* tp = n_a_utf8(t->tipo[c], NULL); NV pista = msg("es de tipo %s; con «convertir» se puede cambiar", tp); free(tp);
      res = ERRP(pista, "«%s»: la columna «%v» no es de números", !strcmp(r->clase, "suma") ? "sumaCol" : "promedioCol", r->col); free(vals); return res;
    }
    if (!nn) { free(vals); return n_nulo(); }
    double s = 0; for (int64_t i = 0; i < nv; i++) s += vals[i].u.n;
    res = n_num(!strcmp(r->clase, "suma") ? s : s / (double)nn);
  } else if (!strcmp(r->clase, "min") || !strcmp(r->clase, "max")) {
    if (!nv) { free(vals); return n_nulo(); }
    int esmin = !strcmp(r->clase, "min"); NV mejor = vals[0];
    for (int64_t i = 0; i < nv; i++) {
      NV v = vals[i]; int cmp = td_cmp(v, mejor) < 0;
      if (esmin ? cmp : (!cmp && !td_ord_igual(v, mejor))) mejor = v;
    }
    res = n_inc(mejor);
  } else if (!strcmp(r->clase, "primero")) res = nv ? n_inc(vals[0]) : n_nulo();
  else if (!strcmp(r->clase, "ultimo")) res = nv ? n_inc(vals[nv - 1]) : n_nulo();
  else if (!strcmp(r->clase, "juntar")) {
    NV sep = (r->sep.t == N_NULO || (n_es(r->sep, NC_TEXTO) && TX(r->sep)->n == 0)) ? n_texto_utf8(", ") : n_inc(r->sep);
    NBuf b = {0};
    for (int64_t i = 0; i < nv; i++) { if (i) b_txt(&b, sep); if (n_es(vals[i], NC_TEXTO)) b_txt(&b, vals[i]); else { NV s = n_repr(vals[i], 1); b_txt(&b, s); n_dec(s); } }
    res = b_texto(&b); n_dec(sep);
  } else res = ERR("agregado desconocido: %s", r->clase);
  free(vals); return res;
}
NAT(td_agrupar) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "agrupar"); LST(a[1], 2, "agrupar");
  NTabla* t = TB(a[0]); NLista* cl = LS(a[1]); int nk = (int)cl->n; int* ic = (int*)n_mem(sizeof(int) * (size_t)(nk ? nk : 1)); NV err;
  for (int i = 0; i < nk; i++) { NV x = n_lista_leer(cl, i); NV s = js_string(x); n_dec(x); ic[i] = td_icol(t, s, "agrupar", &err); n_dec(s); if (ic[i] < 0) { free(ic); return err; } }
  if (!n_es(a[2], NC_DIC)) { free(ic); return ERR("«agrupar»: el argumento 3 debe ser un diccionario y es %s", n_tipo_de(a[2])); }
  TdRec* rs; int nr; if (!td_leer_recetas(a[2], "agrupar", &rs, &nr, &err)) { free(ic); return err; }
  int64_t filas = tb_filas(t); TdMapa m; tdm_iniciar(&m); TdIdx* grupos = NULL; int ng = 0, gcap = 0;
  for (int64_t f = 0; f < filas; f++) {
    int nuevo; int g = tdm_poner(&m, td_clave_fila(t, ic, nk, f), ng, &nuevo);
    if (nuevo) { if (ng == gcap) { gcap = gcap ? gcap * 2 : 8; grupos = (TdIdx*)n_remem(grupos, sizeof(TdIdx) * (size_t)gcap); } memset(&grupos[ng], 0, sizeof(TdIdx)); ng++; }
    tdi_push(&grupos[g], f);
  }
  tdm_liberar(&m);
  NV res = tb_nueva(nk + nr); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(nk + nr));
  for (int i = 0; i < nk + nr; i++) cols[i] = n_lista_nueva(ng);
  int fallo = 0;
  for (int g = 0; g < ng && !fallo; g++) {
    for (int i = 0; i < nk; i++) n_lista_agregar(LS(cols[i]), n_inc(CELDA(t, ic[i], grupos[g].v[0])));
    for (int i = 0; i < nr; i++) { NV v = td_aplicar(t, &rs[i], grupos[g].v, grupos[g].n); if (N_FALLO(v)) { fallo = 1; break; } n_lista_agregar(LS(cols[nk + i]), v); }
  }
  for (int g = 0; g < ng; g++) free(grupos[g].v);
  free(grupos);
  if (fallo) { for (int i = 0; i < nk + nr; i++) n_dec(cols[i]); n_dec(res); free(cols); free(ic); td_liberar_recetas(rs, nr); return N_ERR; }
  for (int i = 0; i < nk; i++) { TB(res)->nombre[i] = n_inc(t->nombre[ic[i]]); TB(res)->tipo[i] = n_inc(t->tipo[ic[i]]); TB(res)->col[i] = cols[i]; }
  for (int i = 0; i < nr; i++) { TB(res)->nombre[nk + i] = n_inc(rs[i].nombre); TB(res)->tipo[nk + i] = n_texto_utf8(td_inferir(LS(cols[nk + i]))); TB(res)->col[nk + i] = cols[nk + i]; }
  free(cols); free(ic); td_liberar_recetas(rs, nr);
  return res;
}
NAT(td_resumir) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "resumir");
  if (!n_es(a[1], NC_DIC)) return ERR("«resumir»: el argumento 2 debe ser un diccionario y es %s", n_tipo_de(a[1]));
  NTabla* t = TB(a[0]); TdRec* rs; int nr; NV err; if (!td_leer_recetas(a[1], "resumir", &rs, &nr, &err)) return err;
  int64_t filas = tb_filas(t); int64_t* idx = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(filas ? filas : 1)); for (int64_t f = 0; f < filas; f++) idx[f] = f;
  NV res = tb_nueva(nr);
  for (int i = 0; i < nr; i++) {
    NV v = td_aplicar(t, &rs[i], idx, filas);
    if (N_FALLO(v)) { n_dec(res); free(idx); td_liberar_recetas(rs, nr); return N_ERR; }
    NV l = n_lista_nueva(1); n_lista_agregar(LS(l), v);
    TB(res)->nombre[i] = n_inc(rs[i].nombre); TB(res)->tipo[i] = n_texto_utf8(td_inferir(LS(l))); TB(res)->col[i] = l;
  }
  free(idx); td_liberar_recetas(rs, nr); return res;
}
NAT(td_contarPor) {
  (void)extra; TD_TABLA(a[0], 1, "contarPor");
  NTabla* t = TB(a[0]); int* ic = (int*)n_mem(sizeof(int) * (size_t)(n ? n : 1)); int nk = 0; NV err;
  for (int i = 1; i < n; i++) { if (!n_es(a[i], NC_TEXTO)) { free(ic); return ERR("«contarPor»: el argumento %d debe ser texto y es %s", (long long)(i + 1), n_tipo_de(a[i])); } }
  if (n < 2) { free(ic); return n_error("«contarPor» necesita al menos una columna", NULL); }
  for (int i = 1; i < n; i++) { ic[nk] = td_icol(t, a[i], "contarPor", &err); if (ic[nk] < 0) { free(ic); return err; } nk++; }
  int64_t filas = tb_filas(t); TdMapa m; tdm_iniciar(&m); TdIdx primeras = {0}; double* cuentas = (double*)n_mem(sizeof(double) * (size_t)(filas ? filas : 1)); int ng = 0;
  for (int64_t f = 0; f < filas; f++) { int nuevo; int g = tdm_poner(&m, td_clave_fila(t, ic, nk, f), ng, &nuevo); if (nuevo) { cuentas[ng] = 0; tdi_push(&primeras, f); ng++; } cuentas[g] += 1; }
  tdm_liberar(&m);
  NV res = tb_nueva(nk + 1);
  for (int i = 0; i < nk; i++) { NV l = n_lista_nueva(ng); for (int g = 0; g < ng; g++) n_lista_agregar(LS(l), n_inc(CELDA(t, ic[i], primeras.v[g]))); TB(res)->nombre[i] = n_inc(t->nombre[ic[i]]); TB(res)->tipo[i] = n_inc(t->tipo[ic[i]]); TB(res)->col[i] = l; }
  { NV l = n_lista_nueva(ng); for (int g = 0; g < ng; g++) n_lista_agregar(LS(l), n_num(cuentas[g])); td_poner_col_c(res, nk, "cuantas", "entero", l); }
  free(ic); free(cuentas); free(primeras.v); return res;
}
NAT(td_pivotar) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "pivotar"); TXT(a[1], 2, "pivotar"); TXT(a[2], 3, "pivotar");
  if (!n_es(a[3], NC_DIC)) return ERR("«pivotar»: el argumento 4 debe ser un diccionario y es %s", n_tipo_de(a[3]));
  NTabla* t = TB(a[0]); TdRec* rs; int nr; NV err; if (!td_leer_recetas(a[3], "pivotar", &rs, &nr, &err)) return err;
  if (nr != 1) { td_liberar_recetas(rs, nr); return n_errorT(n_texto_utf8("«pivotar»: se pide un solo agregado"), n_texto_utf8("una tabla cruzada tiene un valor por celda")); }
  int iF = td_icol(t, a[1], "pivotar", &err); if (iF < 0) { td_liberar_recetas(rs, nr); return err; }
  int iC = td_icol(t, a[2], "pivotar", &err); if (iC < 0) { td_liberar_recetas(rs, nr); return err; }
  int64_t filas = tb_filas(t);
  TdMapa mf, mc; tdm_iniciar(&mf); tdm_iniciar(&mc);
  TdIdx* celdas = NULL; int ncel = 0, ccap = 0;      /* celdas[fi * stride + ci] — se arma después */
  int* gf = (int*)n_mem(sizeof(int) * (size_t)(filas ? filas : 1)); int* gc = (int*)n_mem(sizeof(int) * (size_t)(filas ? filas : 1));
  TdIdx vf = {0}, vc = {0};   /* la primera fila de cada valor de fila y de columna */
  for (int64_t f = 0; f < filas; f++) {
    int nf, nc2;
    gf[f] = tdm_poner(&mf, td_clave(CELDA(t, iF, f)), 0, &nf); if (nf) tdi_push(&vf, f);
    gc[f] = tdm_poner(&mc, td_clave(CELDA(t, iC, f)), 0, &nc2); if (nc2) tdi_push(&vc, f);
  }
  int NF = mf.n, NC = mc.n; (void)ncel; (void)ccap;
  celdas = (TdIdx*)n_mem(sizeof(TdIdx) * (size_t)(NF * NC > 0 ? NF * NC : 1)); memset(celdas, 0, sizeof(TdIdx) * (size_t)(NF * NC > 0 ? NF * NC : 1));
  for (int64_t f = 0; f < filas; f++) tdi_push(&celdas[gf[f] * NC + gc[f]], f);
  NV res = tb_nueva(1 + NC); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(1 + NC));
  for (int i = 0; i < 1 + NC; i++) cols[i] = n_lista_nueva(NF);
  int fallo = 0;
  for (int g = 0; g < NF && !fallo; g++) {
    n_lista_agregar(LS(cols[0]), n_inc(CELDA(t, iF, vf.v[g])));
    for (int c = 0; c < NC; c++) {
      TdIdx* ce = &celdas[g * NC + c];
      if (!ce->n) { n_lista_agregar(LS(cols[1 + c]), n_nulo()); continue; }
      NV v = td_aplicar(t, &rs[0], ce->v, ce->n); if (N_FALLO(v)) { fallo = 1; break; }
      n_lista_agregar(LS(cols[1 + c]), v);
    }
  }
  for (int i = 0; i < NF * NC; i++) free(celdas[i].v);
  free(celdas); free(gf); free(gc); tdm_liberar(&mf); tdm_liberar(&mc);
  if (fallo) { for (int i = 0; i < 1 + NC; i++) n_dec(cols[i]); n_dec(res); free(cols); free(vf.v); free(vc.v); td_liberar_recetas(rs, nr); return N_ERR; }
  TB(res)->nombre[0] = n_inc(t->nombre[iF]); TB(res)->tipo[0] = n_inc(t->tipo[iF]); TB(res)->col[0] = cols[0];
  for (int c = 0; c < NC; c++) {
    NV v = CELDA(t, iC, vc.v[c]); NV nm;
    if (v.t == N_NULO) nm = n_texto_utf8("(vac\xC3\xADo)");
    else if (n_es(v, NC_FECHA)) { NBuf b = {0}; iso_de_fecha(&b, ((NFecha*)v.u.o)->ms); nm = b_texto(&b); }
    else if (n_es(v, NC_TEXTO)) nm = n_inc(v); else nm = n_repr(v, 1);
    TB(res)->nombre[1 + c] = nm; TB(res)->tipo[1 + c] = n_texto_utf8(td_inferir(LS(cols[1 + c]))); TB(res)->col[1 + c] = cols[1 + c];
  }
  free(cols); free(vf.v); free(vc.v); td_liberar_recetas(rs, nr);
  return res;
}
NAT(td_despivotar) {
  (void)extra; TD_TABLA(a[0], 1, "despivotar"); LST(a[1], 2, "despivotar");
  NTabla* t = TB(a[0]); NLista* fl = LS(a[1]); int nf = (int)fl->n; int* fijas = (int*)n_mem(sizeof(int) * (size_t)(nf ? nf : 1)); NV err;
  NV nomVar, nomVal;
  for (int i = 0; i < nf; i++) { NV x = n_lista_leer(fl, i); NV s = js_string(x); n_dec(x); fijas[i] = td_icol(t, s, "despivotar", &err); n_dec(s); if (fijas[i] < 0) { free(fijas); return err; } }
  if (n > 2) { if (!n_es(a[2], NC_TEXTO)) { free(fijas); return ERR("«despivotar»: el argumento 3 debe ser texto y es %s", n_tipo_de(a[2])); } nomVar = n_inc(a[2]); } else nomVar = n_texto_utf8("variable");
  if (n > 3) { if (!n_es(a[3], NC_TEXTO)) { free(fijas); n_dec(nomVar); return ERR("«despivotar»: el argumento 4 debe ser texto y es %s", n_tipo_de(a[3])); } nomVal = n_inc(a[3]); } else nomVal = n_texto_utf8("valor");
  int* mover = (int*)n_mem(sizeof(int) * (size_t)(t->ncol ? t->ncol : 1)); int nm = 0;
  for (int c = 0; c < t->ncol; c++) { int esf = 0; for (int i = 0; i < nf; i++) if (fijas[i] == c) esf = 1; if (!esf) mover[nm++] = c; }
  if (!nm) { free(fijas); free(mover); n_dec(nomVar); n_dec(nomVal); return n_error("«despivotar»: no queda ninguna columna que mover", NULL); }
  int64_t filas = tb_filas(t); NV res = tb_nueva(nf + 2); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(nf + 2));
  for (int i = 0; i < nf + 2; i++) cols[i] = n_lista_nueva(filas * nm);
  for (int64_t f = 0; f < filas; f++) for (int k = 0; k < nm; k++) {
    for (int i = 0; i < nf; i++) n_lista_agregar(LS(cols[i]), n_inc(CELDA(t, fijas[i], f)));
    n_lista_agregar(LS(cols[nf]), n_inc(t->nombre[mover[k]]));
    n_lista_agregar(LS(cols[nf + 1]), n_inc(CELDA(t, mover[k], f)));
  }
  for (int i = 0; i < nf; i++) { TB(res)->nombre[i] = n_inc(t->nombre[fijas[i]]); TB(res)->tipo[i] = n_inc(t->tipo[fijas[i]]); TB(res)->col[i] = cols[i]; }
  TB(res)->nombre[nf] = nomVar; TB(res)->tipo[nf] = n_texto_utf8("texto"); TB(res)->col[nf] = cols[nf];
  TB(res)->nombre[nf + 1] = nomVal; TB(res)->tipo[nf + 1] = n_texto_utf8(td_inferir(LS(cols[nf + 1]))); TB(res)->col[nf + 1] = cols[nf + 1];
  free(cols); free(fijas); free(mover);
  return res;
}

/* ═══════════════════════════════════════════════════════════ combinar */
NAT(td_cruzar) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "cruzar"); TD_TABLA(a[1], 2, "cruzar"); TXT(a[2], 3, "cruzar");
  NTabla *x = TB(a[0]), *y = TB(a[1]); NV err;
  int ix = td_icol(x, a[2], "cruzar", &err); if (ix < 0) return err;
  int iy = td_icol(y, a[2], "cruzar", &err); if (iy < 0) return err;
  int64_t fx = tb_filas(x), fy = tb_filas(y);
  TdMapa m; tdm_iniciar(&m); TdIdx* ls = NULL; int nl = 0, lcap = 0;
  for (int64_t f = 0; f < fy; f++) {
    int nuevo; int g = tdm_poner(&m, td_clave(CELDA(y, iy, f)), nl, &nuevo);
    if (nuevo) { if (nl == lcap) { lcap = lcap ? lcap * 2 : 8; ls = (TdIdx*)n_remem(ls, sizeof(TdIdx) * (size_t)lcap); } memset(&ls[nl], 0, sizeof(TdIdx)); nl++; }
    tdi_push(&ls[g], f);
  }
  int* colsY = (int*)n_mem(sizeof(int) * (size_t)(y->ncol ? y->ncol : 1)); int ny = 0;
  for (int c = 0; c < y->ncol; c++) if (c != iy) colsY[ny++] = c;
  NV res = tb_nueva(x->ncol + ny); NV* cols = (NV*)n_mem(sizeof(NV) * (size_t)(x->ncol + ny + 1));
  for (int i = 0; i < x->ncol + ny; i++) cols[i] = n_lista_nueva(0);
  for (int64_t f = 0; f < fx; f++) {
    char* k = td_clave(CELDA(x, ix, f)); int g = tdm_buscar(&m, k); free(k);
    if (g < 0) continue;
    int gi = m.v[g];
    for (int64_t q = 0; q < ls[gi].n; q++) {
      for (int c = 0; c < x->ncol; c++) n_lista_agregar(LS(cols[c]), n_inc(CELDA(x, c, f)));
      for (int j = 0; j < ny; j++) n_lista_agregar(LS(cols[x->ncol + j]), n_inc(CELDA(y, colsY[j], ls[gi].v[q])));
    }
  }
  for (int c = 0; c < x->ncol; c++) { TB(res)->nombre[c] = n_inc(x->nombre[c]); TB(res)->tipo[c] = n_inc(x->tipo[c]); TB(res)->col[c] = cols[c]; }
  for (int j = 0; j < ny; j++) {
    NV nm = n_inc(y->nombre[colsY[j]]);
    if (td_hay_col(x, nm)) { NV suf = n_texto_utf8("_2"); NV z[2] = { nm, suf }; NV cat = n_concat(z, 2); n_dec(nm); n_dec(suf); nm = cat; }
    TB(res)->nombre[x->ncol + j] = nm; TB(res)->tipo[x->ncol + j] = n_inc(y->tipo[colsY[j]]); TB(res)->col[x->ncol + j] = cols[x->ncol + j];
  }
  for (int g = 0; g < nl; g++) free(ls[g].v);
  free(ls); free(colsY); free(cols); tdm_liberar(&m);
  return res;
}
NAT(td_apilar) {
  (void)extra;
  for (int i = 0; i < n; i++) TD_TABLA(a[i], i + 1, "apilar");
  if (!n) return n_error("«apilar» necesita al menos una tabla", NULL);
  NTabla* base = TB(a[0]);
  for (int i = 1; i < n; i++) {
    NTabla* o = TB(a[i]); int dif = o->ncol != base->ncol;
    for (int c = 0; !dif && c < o->ncol; c++) if (!texto_igual(o->nombre[c], base->nombre[c])) dif = 1;
    if (dif) {
      NBuf b1 = {0}, b2 = {0};
      for (int c = 0; c < base->ncol; c++) { if (c) b_utf8(&b1, ", "); b_txt(&b1, base->nombre[c]); }
      for (int c = 0; c < o->ncol; c++) { if (c) b_utf8(&b2, ", "); b_txt(&b2, o->nombre[c]); }
      NV s1 = b_texto(&b1), s2 = b_texto(&b2);
      NV pista = msg("la primera: %v · la %d: %v", s1, (long long)(i + 1), s2);
      NV e = ERRP(pista, "«apilar»: la tabla %d tiene otras columnas", (long long)(i + 1)); n_dec(s1); n_dec(s2); return e;
    }
  }
  NV res = tb_nueva(base->ncol);
  for (int c = 0; c < base->ncol; c++) {
    NV l = n_lista_nueva(0);
    for (int i = 0; i < n; i++) { NLista* src = LS(TB(a[i])->col[c]); for (int64_t f = 0; f < src->n; f++) n_lista_agregar(LS(l), n_lista_leer(src, f)); }
    TB(res)->nombre[c] = n_inc(base->nombre[c]); TB(res)->tipo[c] = n_texto_utf8(td_inferir(LS(l))); TB(res)->col[c] = l;
  }
  return res;
}
NAT(td_juntarColumnas) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "juntarColumnas"); TD_TABLA(a[1], 2, "juntarColumnas");
  NTabla *x = TB(a[0]), *y = TB(a[1]); int64_t fx = tb_filas(x), fy = tb_filas(y);
  if (fx != fy) return ERRP(n_texto_utf8("para juntar por una columna común usa «cruzar»"), "«juntarColumnas»: una tiene %d filas y la otra %d", (long long)fx, (long long)fy);
  for (int c = 0; c < y->ncol; c++) if (td_hay_col(x, y->nombre[c])) return ERR("«juntarColumnas»: las dos tienen una columna «%v»", y->nombre[c]);
  NV res = tb_nueva(x->ncol + y->ncol);
  for (int c = 0; c < x->ncol; c++) { TB(res)->nombre[c] = n_inc(x->nombre[c]); TB(res)->tipo[c] = n_inc(x->tipo[c]); TB(res)->col[c] = td_lista_copia(x->col[c]); }
  for (int c = 0; c < y->ncol; c++) { TB(res)->nombre[x->ncol + c] = n_inc(y->nombre[c]); TB(res)->tipo[x->ncol + c] = n_inc(y->tipo[c]); TB(res)->col[x->ncol + c] = td_lista_copia(y->col[c]); }
  return res;
}
NAT(td_diferencia) {
  (void)n; (void)extra; TD_TABLA(a[0], 1, "diferencia"); TD_TABLA(a[1], 2, "diferencia"); TXT(a[2], 3, "diferencia");
  NTabla *x = TB(a[0]), *y = TB(a[1]); NV err;
  int ix = td_icol(x, a[2], "diferencia", &err); if (ix < 0) return err;
  int iy = td_icol(y, a[2], "diferencia", &err); if (iy < 0) return err;
  TdMapa m; tdm_iniciar(&m); int64_t fy = tb_filas(y), fx = tb_filas(x);
  for (int64_t f = 0; f < fy; f++) tdm_poner(&m, td_clave(CELDA(y, iy, f)), 0, NULL);
  TdIdx idx = {0};
  for (int64_t f = 0; f < fx; f++) { char* k = td_clave(CELDA(x, ix, f)); if (tdm_buscar(&m, k) < 0) tdi_push(&idx, f); free(k); }
  tdm_liberar(&m);
  NV r = td_por_filas(x, idx.v, idx.n); free(idx.v); return r;
}

/* las tablas dentro del resto del runtime */
static NV td_len(NV o) { return n_num((double)tb_filas(TB(o))); }
static int td_iguales(NV a, NV b, int (*eq)(NV, NV, NPar*, int), NPar* vis, int nv) {
  NTabla *x = TB(a), *y = TB(b);
  if (x->ncol != y->ncol || tb_filas(x) != tb_filas(y)) return 0;
  int64_t filas = tb_filas(x);
  for (int c = 0; c < x->ncol; c++) {
    if (!texto_igual(x->nombre[c], y->nombre[c]) || !texto_igual(x->tipo[c], y->tipo[c])) return 0;
    for (int64_t f = 0; f < filas; f++) if (!eq(CELDA(x, c, f), CELDA(y, c, f), vis, nv)) return 0;
  }
  return 1;
}
static void td_repr(NBuf* b, NV v) {
  NTabla* t = TB(v); char nb[64]; snprintf(nb, sizeof nb, "<tabla %lld\xC3\x97%d: ", (long long)tb_filas(t), t->ncol);
  b_utf8(b, nb);
  for (int c = 0; c < t->ncol; c++) { if (c) b_utf8(b, ", "); b_txt(b, t->nombre[c]); }
  b_c(b, '>');
}

/* formato/rangoFechas: «del 3 al 7 de octubre de 2026» (vive aquí porque nrt_formato.inc se incluye antes que las fechas completas) */
NAT(fo_rangoFechas) {
  (void)n; (void)extra; FCH(ms1, 0, "rangoFechas"); FCH(ms2, 1, "rangoFechas");
  static const char* const M[] = { "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre" };
  FePartes A = fe_partes(ms1), B = fe_partes(ms2);
  char o[200]; int ia = (int)A.m, ib = (int)B.m;
  if (A.a == B.a && A.m == B.m && A.d == B.d) snprintf(o, sizeof o, "%.0f de %s de %.0f", A.d, M[ia], A.a);
  else if (A.a == B.a && A.m == B.m) snprintf(o, sizeof o, "del %.0f al %.0f de %s de %.0f", A.d, B.d, M[ia], A.a);
  else if (A.a == B.a) snprintf(o, sizeof o, "del %.0f de %s al %.0f de %s de %.0f", A.d, M[ia], B.d, M[ib], A.a);
  else snprintf(o, sizeof o, "del %.0f de %s de %.0f al %.0f de %s de %.0f", A.d, M[ia], A.a, B.d, M[ib], B.a);
  return n_texto_utf8(o);
}

#define NAT_DATOS \
  { "formato/rangoFechas", 2, fo_rangoFechas }, \
  { "datos/deRegistros", 1, td_deRegistros }, { "datos/deColumnas", 1, td_deColumnas }, { "datos/deLista", 2, td_deLista }, { "datos/deCsv", -1, td_deCsv }, \
  { "datos/deDatos", 1, td_deDatos }, { "datos/aDatos", -1, td_aDatos }, { "datos/aCsv", -1, td_aCsv }, { "datos/aLista", 1, td_aLista }, \
  { "datos/aRegistros", 1, td_aRegistros }, { "datos/aColumnas", 1, td_aColumnas }, { "datos/columnas", 1, td_columnas }, { "datos/tipos", 1, td_tipos }, \
  { "datos/primeras", -1, td_primeras }, { "datos/ultimas", -1, td_ultimas }, { "datos/vacios", 1, td_vacios }, { "datos/describir", 1, td_describir }, \
  { "datos/vistazo", -1, td_vistazo }, { "datos/columna", 2, td_columna }, { "datos/celda", 3, td_celda }, { "datos/fila", 2, td_fila }, \
  { "datos/soloColumnas", 2, td_soloColumnas }, { "datos/sinColumna", -1, td_sinColumna }, { "datos/renombrar", 3, td_renombrar }, { "datos/reordenar", 2, td_reordenar }, \
  { "datos/donde", 2, td_donde }, { "datos/ordenarPor", -1, td_ordenarPor }, { "datos/unicas", 2, td_unicas }, { "datos/sinRepetir", -1, td_sinRepetir }, \
  { "datos/quitarVacios", -1, td_quitarVacios }, { "datos/conColumna", 3, td_conColumna }, { "datos/convertir", 3, td_convertir }, { "datos/aplicarA", 3, td_aplicarA }, \
  { "datos/rellenarVacios", 3, td_rellenarVacios }, { "datos/numerar", -1, td_numerar }, { "datos/sumaCol", -1, td_sumaCol }, { "datos/promedioCol", -1, td_promedioCol }, \
  { "datos/minCol", -1, td_minCol }, { "datos/maxCol", -1, td_maxCol }, { "datos/primeroCol", -1, td_primeroCol }, { "datos/ultimoCol", -1, td_ultimoCol }, \
  { "datos/contarCol", -1, td_contarCol }, { "datos/juntarCol", -1, td_juntarCol }, { "datos/agrupar", 3, td_agrupar }, { "datos/resumir", 2, td_resumir }, \
  { "datos/contarPor", -1, td_contarPor }, { "datos/pivotar", 4, td_pivotar }, { "datos/despivotar", -1, td_despivotar }, { "datos/cruzar", -1, td_cruzar }, \
  { "datos/apilar", -1, td_apilar }, { "datos/juntarColumnas", -1, td_juntarColumnas }, { "datos/diferencia", 3, td_diferencia },
