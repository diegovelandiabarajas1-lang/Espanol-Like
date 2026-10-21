/* ============================================================================
 *  (motor-exp N4.6) Ser la lengua franca: Ñ como biblioteca de C.
 *
 *  «n-compilar programa.esl --biblioteca» saca una biblioteca compartida (.so,
 *  .dll, .dylib) con las funciones «publico» del programa y la ABI de C, más su
 *  cabecera (.h) y un módulo de Python. Lo de aquí es lo que comparten todas:
 *  arrancar sin tocar la salida del anfitrión, el último error como texto, y
 *  los VALORES de Ñ como asas opacas para lo que no es un número, un bool o un
 *  texto (listas, diccionarios, registros, funciones).
 *
 *  Todo esto se compila con -fvisibility=hidden: de la biblioteca solo se ven
 *  las funciones que el compilador genera con su prefijo (ver compilador.js),
 *  así que dos bibliotecas de Ñ en el mismo proceso no se pisan.
 *
 *  Errores: como errno o GetLastError. Una llamada que falla devuelve 0, NaN,
 *  NULL o nada, y «<prefijo>error()» da el mensaje (UTF-8, el mismo que la VM:
 *  mensaje, pista y traza); una llamada que va bien lo deja en NULL. El error
 *  es por hilo.
 *
 *  Hilos: un hilo a la vez en esta primera versión (el conteo de referencias
 *  no es atómico): eso es N4.7.
 * ========================================================================== */
int n_en_biblioteca = 0;
static N_HILO_LOCAL char* api_error = NULL;

void n_iniciar_biblioteca(void) {
  /* lo de n_iniciar, sin tocar la salida ni la consola del anfitrión */
  n_en_biblioteca = 1;
  n_argc = 0; n_argv = NULL;
  reloj_0 = reloj_ms();
  az_iniciar();
  n_faltante = n_nativa_nueva(" faltante", 0, nat_faltante, NULL);
  n_hilo.valor = n_hilo.mensaje = n_hilo.pista = n_hilo.tipo = n_nulo();
}
/* el error pendiente, como texto UTF-8 (lo que imprimiría la VM, sin «[ejecución] »), y se limpia */
static char* error_utf8_y_limpiar(void) {
  NBuf b = {0};
  if (n_hilo.mensaje.t == N_OBJ) b_txt(&b, n_hilo.mensaje); else b_utf8(&b, "error");
  if (n_hilo.pista.t == N_OBJ) { b_utf8(&b, "\n   \xE2\x86\xB3 "); b_txt(&b, n_hilo.pista); }
  for (int i = 0; i < n_hilo.ntraza; i++) {
    char l[256]; snprintf(l, sizeof l, "\n   en %s (línea %d)", n_hilo.traza[i].nombre, n_hilo.traza[i].linea);
    b_utf8(&b, l);
  }
  NV t = b_texto(&b);
  char* s = n_a_utf8(t, NULL);
  n_dec(t);
  err_limpiar();
  return s;
}
void n_api_limpiar_error(void) { free(api_error); api_error = NULL; }
/* lo pendiente pasa a ser «el último error» */
void n_api_guardar_error(void) { free(api_error); api_error = error_utf8_y_limpiar(); }
void n_api_poner_error(const char* msg) { free(api_error); api_error = strdup(msg); }
const char* n_api_error(void) { return api_error; }

/* ── de C a Ñ y de vuelta (devuelven 0 y dejan el error si no se puede) ─── */
int n_api_de_entero(int64_t x, NV* v) {
  if (x > 9007199254740992LL || x < -9007199254740992LL) { n_errorf("el entero %lld no cabe exacto en un número de Ñ (más de 2^53)", (long long)x); return 0; }
  *v = n_num((double)x); return 1;
}
int n_api_de_texto(const char* s, NV* v) {
  if (!s) { *v = n_nulo(); return 1; }
  *v = n_texto_utf8(s); return 1;
}
static int api_tipo_mal(NV r, const char* quiere, const char* quien) {
  n_errorf("«%s» tenía que devolver %s y devolvió %s", quien, quiere, n_tipo_de(r));
  return 0;
}
int n_api_a_real(NV r, double* x, const char* quien) {
  if (r.t != N_NUM) return api_tipo_mal(r, "un real", quien);
  *x = r.u.n; return 1;
}
int n_api_a_entero(NV r, int64_t* x, const char* quien) {
  if (r.t != N_NUM || !es_entero(r.u.n)) return api_tipo_mal(r, "un entero", quien);
  *x = (int64_t)r.u.n; return 1;
}
int n_api_a_bool(NV r, int* x, const char* quien) {
  if (r.t != N_BOOL) return api_tipo_mal(r, "un bool", quien);
  *x = r.u.b; return 1;
}
int n_api_a_texto(NV r, char** x, const char* quien) {
  if (r.t == N_NULO) { *x = NULL; return 1; }
  if (!n_es(r, NC_TEXTO)) return api_tipo_mal(r, "un texto", quien);
  *x = n_a_utf8(r, NULL); return 1;
}

/* ── las asas: un valor de Ñ en una caja que el anfitrión suelta ──────── */
typedef struct { NV v; } NAsa;
void* n_api_asa(NV v) { NAsa* a = (NAsa*)malloc(sizeof(NAsa)); if (!a) return NULL; a->v = v; return a; }   /* toma la referencia */
NV n_api_valor(const void* a) { return a ? ((const NAsa*)a)->v : n_nulo(); }
void n_api_soltar(void* a) { if (a) { n_dec(((NAsa*)a)->v); free(a); } }
const char* n_api_tipo(const void* a) {
  NV v = n_api_valor(a);
  if (v.t == N_OBJ && v.u.o->clase == NC_DIC && DC(v)->reg) return "registro";
  return n_tipo_de(v);
}
double n_api_real(const void* a) { NV v = n_api_valor(a); return v.t == N_NUM ? v.u.n : (v.t == N_BOOL ? v.u.b : NAN); }
int n_api_bool(const void* a) { return n_verdad(n_api_valor(a)); }
char* n_api_texto(const void* a) { NV v = n_api_valor(a); return n_es(v, NC_TEXTO) ? n_a_utf8(v, NULL) : NULL; }
char* n_api_repr(const void* a) {
  NV v = n_api_valor(a);
  NV t = n_es(v, NC_TEXTO) ? n_inc(v) : n_repr(v, 0);
  if (N_FALLO(t)) { err_limpiar(); return strdup("?"); }
  char* s = n_a_utf8(t, NULL); n_dec(t); return s;
}
int64_t n_api_largo(const void* a) {
  NV v = n_api_valor(a);
  if (n_es(v, NC_LISTA)) return LS(v)->n;
  if (n_es(v, NC_DIC)) return DC(v)->n;
  if (n_es(v, NC_TEXTO)) return TX(v)->n;
  return -1;
}
void* n_api_en(const void* a, int64_t i) {
  NV v = n_api_valor(a);
  if (!n_es(v, NC_LISTA) || i < 0 || i >= LS(v)->n) return NULL;
  return n_api_asa(n_inc(LS(v)->v[i]));
}
/* la i-ésima entrada de un diccionario, en orden de inserción */
static NEntrada* api_entrada(NV v, int64_t i) {
  if (!n_es(v, NC_DIC) || i < 0) return NULL;
  NDic* d = DC(v);
  for (int64_t k = 0, j = 0; k < d->usados; k++) if (d->e[k].vivo) { if (j == i) return &d->e[k]; j++; }
  return NULL;
}
void* n_api_clave(const void* a, int64_t i) { NEntrada* e = api_entrada(n_api_valor(a), i); return e ? n_api_asa(n_inc(e->k)) : NULL; }
void* n_api_valor_en(const void* a, int64_t i) { NEntrada* e = api_entrada(n_api_valor(a), i); return e ? n_api_asa(n_inc(e->v)) : NULL; }
void* n_api_lista(void) { return n_api_asa(n_lista_nueva(4)); }
int n_api_agregar(void* l, const void* x) {
  NV v = n_api_valor(l);
  if (!n_es(v, NC_LISTA)) return 0;
  n_lista_agregar(LS(v), n_inc(n_api_valor(x)));
  return 1;
}
void* n_api_lista_reales(const double* x, int64_t n) {
  NV l = n_lista_nueva(n > 4 ? n : 4);
  for (int64_t i = 0; i < n; i++) n_lista_agregar(LS(l), n_num(x[i]));
  return n_api_asa(l);
}
/* copia a «out» los números de una lista (hasta n); devuelve cuántos tiene la lista, o −1 si no es una lista de números */
int64_t n_api_copiar_reales(const void* a, double* out, int64_t n) {
  NV v = n_api_valor(a);
  if (!n_es(v, NC_LISTA)) return -1;
  NLista* l = LS(v);
  for (int64_t i = 0; i < l->n; i++) if (l->v[i].t != N_NUM) return -1;
  for (int64_t i = 0; i < l->n && i < n; i++) out[i] = l->v[i].u.n;
  return l->n;
}
void* n_api_dic(void) { return n_api_asa(n_dic_nuevo()); }
int n_api_poner(void* d, const void* k, const void* x) {
  NV v = n_api_valor(d);
  if (!n_es(v, NC_DIC)) return 0;
  n_dic_poner(DC(v), n_api_valor(k), n_api_valor(x));
  return 1;
}
/* llamar a una función de Ñ que llegó en un asa (un cierre devuelto, por ejemplo) */
void* n_api_llamar(const void* f, const void* const* args, int n) {
  NV a[64];
  if (n < 0 || n > 64) { n_error("una llamada desde fuera lleva como mucho 64 argumentos", NULL); n_api_guardar_error(); return NULL; }
  for (int i = 0; i < n; i++) a[i] = n_api_valor(args[i]);
  NV r = n_llamar(n_api_valor(f), a, n);
  fflush(stdout);
  if (N_FALLO(r)) { n_api_guardar_error(); return NULL; }
  return n_api_asa(r);
}
