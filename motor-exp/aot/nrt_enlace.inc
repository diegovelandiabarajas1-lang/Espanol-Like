/* ============================================================================
 *  (motor-exp N4.10) C llamado DIRECTAMENTE desde el ejecutable de Ñ.
 *
 *  En la VM, nativa(lib, "double cos(double)") y cabeceraNativa(lib, "geo.h")
 *  pasan por koffi: abren la biblioteca al correr y arman cada llamada. En el
 *  ejecutable de n-compilar no hay capa: el compilador lee la firma (o la
 *  cabecera entera) AL COMPILAR, escribe para cada función un envoltorio de C
 *  que convierte los valores de Ñ y llama al símbolo de verdad, y el enlazador
 *  pone la biblioteca (.so, .dll, .a, .o) en el ejecutable. Llamar a cos desde
 *  Ñ cuesta lo que una llamada de C.
 *
 *  Las conversiones son las de la VM (koffi):
 *    · un número a un entero de C se trunca hacia cero y envuelve como un molde
 *      de C (3e10 en un int da lo mismo que en koffi); NaN da 0;
 *    · un bool solo entra en un bool de C; un texto, en char* (UTF-8; nulo es NULL);
 *    · un entero de 64 bits que vuelve y no cabe en 2^53 es un error, con las
 *      mismas palabras que la VM.
 * ========================================================================== */

int n_c_numero(NV v, double* x, const char* f, int i) {
  if (v.t == N_NUM) { *x = v.u.n; return 1; }
  ERR("«%s»: el argumento %d es %s y C espera un número", f, (long long)i, n_tipo_de(v));
  return 0;
}
int n_c_entero(NV v, int64_t* x, const char* f, int i) {
  if (v.t != N_NUM) { ERR("«%s»: el argumento %d es %s y C espera un número", f, (long long)i, n_tipo_de(v)); return 0; }
  double d = v.u.n;
  if (!isfinite(d)) { *x = 0; return 1; }
  d = trunc(d);
  if (fabs(d) >= 9223372036854775808.0) {          /* envuelve en 64 bits, como un molde */
    double m = fmod(d, 18446744073709551616.0);
    if (m < 0) m += 18446744073709551616.0;
    *x = (int64_t)(uint64_t)m;
    return 1;
  }
  *x = (int64_t)d;
  return 1;
}
int n_c_bool(NV v, int* x, const char* f, int i) {
  if (v.t == N_BOOL) { *x = v.u.b; return 1; }
  ERR("«%s»: el argumento %d es %s y C espera un bool", f, (long long)i, n_tipo_de(v));
  return 0;
}
int n_c_texto(NV v, char** x, const char* f, int i) {
  if (v.t == N_NULO) { *x = NULL; return 1; }
  if (n_es(v, NC_TEXTO)) { *x = n_a_utf8(v, NULL); return 1; }
  ERR("«%s»: el argumento %d es %s y C espera un texto (char *)", f, (long long)i, n_tipo_de(v));
  return 0;
}
NV n_c_de_entero(int64_t r, const char* f) {
  if (r > 9007199254740991LL || r < -9007199254740991LL)
    return ERRP(n_texto_utf8("Ñ maneja enteros exactos hasta 9.007.199.254.740.991; para valores mayores declara el tipo «texto» y conviértelo en C"),
      "«%s»: devolvió %d y eso no cabe en un número de Ñ", f, (long long)r);
  return n_num((double)r);
}
NV n_c_de_natural(uint64_t r, const char* f) {
  if (r > 9007199254740991ULL) {
    char nb[32]; snprintf(nb, sizeof nb, "%llu", (unsigned long long)r);
    return ERRP(n_texto_utf8("Ñ maneja enteros exactos hasta 9.007.199.254.740.991; para valores mayores declara el tipo «texto» y conviértelo en C"),
      "«%s»: devolvió %s y eso no cabe en un número de Ñ", f, nb);
  }
  return n_num((double)r);
}
NV n_c_de_texto(const char* s) { return s ? n_texto_utf8(s) : n_nulo(); }

/* Una función que la cabecera trae pero que el ejecutable todavía no sabe
   llamar (estructuras, punteros, retrollamadas): está en el diccionario, y al
   llamarla dice por qué. */
static NV nat_enlace_no(NV* a, int n, void* extra) {
  (void)a; (void)n;
  const NEnlaceFun* e = (const NEnlaceFun*)extra;
  return ERRP(n_texto_utf8("en la VM (node motor-exp/util/n-node.js) sí se puede: allí la llamada pasa por koffi"),
    "«%s»: en el ejecutable nativo todavía no: %s", e->nombre, e->por);
}

static int texto_es(NV v, const char* c) {
  if (!n_es(v, NC_TEXTO)) return 0;
  char* s = n_a_utf8(v, NULL);
  int r = strcmp(s, c) == 0;
  free(s);
  return r;
}
/* nativa(biblioteca, firma): la que el compilador ya dejó enlazada */
NV n_c_nativa(NV* a, int n, const NEnlace* t, int nt) {
  if (n != 2) return ERR("«nativa»: en el ejecutable nativo se escribe nativa(biblioteca, \"double cos(double)\"), con la firma de C");
  for (int k = 0; k < nt; k++)
    if (texto_es(a[1], t[k].proto) && texto_es(a[0], t[k].biblioteca)) {
      if (!t[k].sim) return ERR("«nativa»: «%s» no está en la biblioteca «%s»", t[k].nombre, t[k].biblioteca);
      return n_nativa_nueva(t[k].nombre, t[k].aridad, t[k].f, NULL);
    }
  return ERRP(n_texto_utf8("el compilador enlaza cada función al compilar: escribe la biblioteca y la firma tal cual, entre comillas, en la llamada a «nativa»"),
    "«nativa»: en el ejecutable nativo no está enlazada %r de %r", a[1], a[0]);
}
/* cabeceraNativa(biblioteca, "geo.h"): el diccionario que el compilador armó leyendo la cabecera */
NV n_c_cabecera(NV* a, int n, const NCabecera* t, int nt) {
  if (n != 2) return ERR("«cabeceraNativa» espera 2 argumento(s) y recibió %d", (long long)n);
  for (int k = 0; k < nt; k++) {
    const NCabecera* c = &t[k];
    if (!texto_es(a[1], c->ruta) || !texto_es(a[0], c->biblioteca)) continue;
    NV d = n_dic_nuevo();
    NDic* D = (NDic*)d.u.o;
    for (int j = 0; j < c->nconst; j++) {
      NV kk = n_texto_utf8(c->consts[j].nombre);
      NV v = c->consts[j].texto ? n_texto_utf8(c->consts[j].texto) : n_num(c->consts[j].num);
      n_dic_poner(D, kk, v); n_dec(kk); n_dec(v);
    }
    NV l = n_lista_nueva(c->nomit);
    for (int j = 0; j < c->nomit; j++) n_lista_agregar((NLista*)l.u.o, n_texto_utf8(c->omitidas[j]));
    for (int j = 0; j < c->nfun; j++) {
      const NEnlaceFun* e = &c->funs[j];
      if (e->f && !e->sim) {                 /* la cabecera la declara y la biblioteca no la trae */
        NV m = msg("%s: no está en la biblioteca «%s»", e->nombre, c->biblioteca);
        n_lista_agregar((NLista*)l.u.o, m);
        continue;
      }
      NV kk = n_texto_utf8(e->nombre);
      NV v = e->f ? n_nativa_nueva(e->nombre, e->aridad, e->f, NULL) : n_nativa_nueva(e->nombre, -1, nat_enlace_no, (void*)e);
      n_dic_poner(D, kk, v); n_dec(kk); n_dec(v);
    }
    NV kk = n_texto_utf8("_omitidas");
    n_dic_poner(D, kk, l); n_dec(kk); n_dec(l);
    return d;
  }
  return ERRP(n_texto_utf8("el compilador lee la cabecera al compilar: escribe la biblioteca y la ruta del .h tal cual, entre comillas, en la llamada"),
    "«cabeceraNativa»: en el ejecutable nativo no se leyó %r de %r", a[1], a[0]);
}
