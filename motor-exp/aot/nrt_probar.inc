/* ============================================================================
 *  Ñ sin runtime — el eDSL «probar» (src/09-edsl-probar.js), en C.
 *  Se incluye desde nrt.c, después de nrt_formato.inc (usa toprecision_js).
 *
 *  Lo delicado en la VM es correr una prueba que falla sin tumbar el programa:
 *  hay que desenrollar marcos, pila y upvalues desde fuera. Aquí no: un error
 *  es un valor que vuelve (N_ERR) y cada función ya limpió lo suyo al salir,
 *  así que «aislado» es llamar, mirar si falló y recoger el mensaje.
 * ========================================================================== */

typedef struct { NV nombre, fn, grupo; int saltada, solo; } PrCaso;
static PrCaso* pr_casos; static int64_t pr_n, pr_cap;
static NV pr_pila, pr_antesTodo, pr_despuesTodo, pr_antesCada, pr_despuesCada;
static int pr_listo, pr_corriendo, pr_soloFallos, pr_haySemilla, pr_nespias;
static double pr_semilla, pr_afirmaciones;
static double pr_pasan, pr_fallan, pr_saltadas; static NV pr_fallos;
static void pr_iniciar(void) {
  if (pr_listo) return;
  pr_listo = 1;
  pr_pila = n_lista_nueva(4); pr_antesTodo = n_lista_nueva(2); pr_despuesTodo = n_lista_nueva(2);
  pr_antesCada = n_lista_nueva(2); pr_despuesCada = n_lista_nueva(2); pr_fallos = n_lista_nueva(2);
}
static int es_funcion(NV v) { return n_es(v, NC_CIERRE) || n_es(v, NC_NATIVA); }
static int exige_fn(NV v, int k, const char* f, NV* err) {
  if (es_funcion(v)) return 1;
  *err = ERR("«%s»: el argumento %d debe ser una función y es %s", f, (long long)k, n_tipo_de(v)); return 0;
}
#define FNC(v, k, f) do { NV e_; if (!exige_fn((v), (k), (f), &e_)) return e_; } while (0)

/* Corre f sin argumentos. Si falló, devuelve 1 y deja en *m el mensaje (y en
   *p la pista, o nulo); el error ya no queda pendiente. */
static int pr_aislado(NV f, NV* m, NV* p) {
  NV r = n_llamar(f, NULL, 0);
  if (!N_FALLO(r)) { n_dec(r); return 0; }
  *m = n_inc(n_hilo.mensaje);
  *p = n_inc(n_hilo.pista);
  err_limpiar();
  return 1;
}
static NV pr_mensajeDe(NV m, NV p) {   /* el mensaje y, si hay, «↳ pista» debajo */
  if (p.t != N_OBJ) return n_inc(m);
  NBuf b = {0}; b_txt(&b, m); b_utf8(&b, "\n      ↳ "); b_txt(&b, p); return b_texto(&b);
}

/* ── estructura ──────────────────────────────────────────────────────────── */
static NV pr_grupo_actual(void) {
  NBuf b = {0}; NLista* l = LS(pr_pila);
  for (int64_t i = 0; i < l->n; i++) { if (i) b_utf8(&b, " › "); b_txt(&b, n_lv(l)[i]); }
  return b_texto(&b);
}
static NV pr_registra(NV* a, const char* f, int saltada, int solo) {
  pr_iniciar(); TXT(a[0], 1, f); FNC(a[1], 2, f);
  if (pr_n == pr_cap) { pr_cap = pr_cap ? pr_cap * 2 : 16; pr_casos = (PrCaso*)n_remem(pr_casos, sizeof(PrCaso) * (size_t)pr_cap); }
  PrCaso* c = &pr_casos[pr_n++];
  c->nombre = n_inc(a[0]); c->fn = n_inc(a[1]); c->grupo = pr_grupo_actual(); c->saltada = saltada; c->solo = solo;
  return n_nulo();
}
NAT(pr_probar) { (void)n; (void)extra; return pr_registra(a, "probar", 0, 0); }
NAT(pr_saltar) { (void)n; (void)extra; return pr_registra(a, "saltar", 1, 0); }
NAT(pr_soloEsta) { (void)n; (void)extra; return pr_registra(a, "soloEsta", 0, 1); }
NAT(pr_grupo) {
  (void)n; (void)extra; pr_iniciar(); TXT(a[0], 1, "grupo");
  n_lista_agregar(LS(pr_pila), n_inc(a[0]));
  NV r, e_;
  if (!exige_fn(a[1], 2, "grupo", &e_)) r = e_;
  else r = n_llamar(a[1], NULL, 0);
  NLista* l = LS(pr_pila); n_dec(n_lv(l)[--l->n]);
  if (N_FALLO(r)) return r;
  n_dec(r);
  return n_nulo();
}
static NV pr_gancho(NV* a, NV lista, const char* f) {
  FNC(a[0], 1, f); n_lista_agregar(LS(lista), n_inc(a[0])); return n_nulo();
}
NAT(pr_antesDeTodo) { (void)n; (void)extra; pr_iniciar(); return pr_gancho(a, pr_antesTodo, "antesDeTodo"); }
NAT(pr_despuesDeTodo) { (void)n; (void)extra; pr_iniciar(); return pr_gancho(a, pr_despuesTodo, "despuesDeTodo"); }
NAT(pr_antesDeCada) { (void)n; (void)extra; pr_iniciar(); return pr_gancho(a, pr_antesCada, "antesDeCada"); }
NAT(pr_despuesDeCada) { (void)n; (void)extra; pr_iniciar(); return pr_gancho(a, pr_despuesCada, "despuesDeCada"); }

/* ── afirmaciones ────────────────────────────────────────────────────────── */
#define CUENTA (pr_afirmaciones++)
NAT(pr_debeSer) {
  (void)n; (void)extra; CUENTA;
  if (n_iguales(a[0], a[1])) return n_nulo();
  NV x = R1(a[0]), y = R1(a[1]);
  int mismo = texto_igual(x, y) && a[0].t == N_NUM && a[1].t == N_NUM;
  NV r;
  if (mismo) {
    char p0[64], p1[64]; toprecision_js(a[0].u.n, 17, p0); toprecision_js(a[1].u.n, 17, p1);
    r = ERRP(T("con decimales, «debeSerCerca» es lo que se quiere casi siempre"),
      "los dos se imprimen «%v» pero no son el mismo número: llegó %s y se esperaba %s", x, p0, p1);
  } else r = ERR("se esperaba %v y llegó %v", y, x);
  n_dec(x); n_dec(y);
  return r;
}
NAT(pr_noDebeSer) { (void)n; (void)extra; CUENTA; if (n_iguales(a[0], a[1])) return ERR("no se esperaba %r, y es lo que llegó", a[1]); return n_nulo(); }
NAT(pr_debeSerCierto) { (void)n; (void)extra; CUENTA; if (!n_verdad(a[0])) return ERR("se esperaba algo cierto y llegó %r", a[0]); return n_nulo(); }
NAT(pr_debeSerFalso) { (void)n; (void)extra; CUENTA; if (n_verdad(a[0])) return ERR("se esperaba algo falso y llegó %r", a[0]); return n_nulo(); }
NAT(pr_debeSerCerca) {
  (void)extra; CUENTA;
  FNUM(x, 0, "debeSerCerca"); FNUM(y, 1, "debeSerCerca");
  double tol = 1e-9;
  if (n > 2) { FNUM(t, 2, "debeSerCerca"); tol = t; }
  if (fabs(x - y) > tol) return ERR("%j no está a menos de %j de %j", x, tol, y);
  return n_nulo();
}
static NV pr_comparar(NV* a, const char* f, int op, const char* texto) {
  CUENTA;
  int ok = (a[0].t == N_NUM && a[1].t == N_NUM) || (n_es(a[0], NC_TEXTO) && n_es(a[1], NC_TEXTO)) || (n_es(a[0], NC_FECHA) && n_es(a[1], NC_FECHA));
  if (!ok) {
    if (n_es(a[0], NC_FECHA) || n_es(a[1], NC_FECHA))
      return ERRP(T("una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)"), "no se pueden comparar %s y %s con «%s»", n_tipo_de(a[0]), n_tipo_de(a[1]), f);
    return ERR("no se pueden comparar %s y %s con «%s»", n_tipo_de(a[0]), n_tipo_de(a[1]), f);
  }
  NV c = n_cmp(a[0], a[1], op);
  if (!c.u.b) return ERR("%r no es %s %r", a[0], texto, a[1]);
  return n_nulo();
}
NAT(pr_debeSerMayor) { (void)n; (void)extra; return pr_comparar(a, "debeSerMayor", 2, "mayor que"); }
NAT(pr_debeSerMenor) { (void)n; (void)extra; return pr_comparar(a, "debeSerMenor", 0, "menor que"); }
NAT(pr_debeSerAlMenos) { (void)n; (void)extra; return pr_comparar(a, "debeSerAlMenos", 3, "al menos"); }
NAT(pr_debeSerComoMucho) { (void)n; (void)extra; return pr_comparar(a, "debeSerComoMucho", 1, "como mucho"); }
NAT(pr_debeContener) {
  (void)n; (void)extra; CUENTA;
  NV c = contiene(a[0], a[1], "contiene"); if (N_FALLO(c)) return c;
  if (!c.u.b) return ERR("%r no contiene %r", a[0], a[1]);
  return n_nulo();
}
NAT(pr_noDebeContener) {
  (void)n; (void)extra; CUENTA;
  NV c = contiene(a[0], a[1], "contiene"); if (N_FALLO(c)) return c;
  if (c.u.b) return ERR("%r contiene %r, y no debía", a[0], a[1]);
  return n_nulo();
}
NAT(pr_debeEmpezarCon) {
  (void)n; (void)extra; CUENTA; TXT(a[0], 1, "debeEmpezarCon"); TXT(a[1], 2, "debeEmpezarCon");
  if (!empieza(a[0], a[1])) return ERR("%r no empieza con %r", a[0], a[1]);
  return n_nulo();
}
NAT(pr_debeTerminarCon) {
  (void)n; (void)extra; CUENTA; TXT(a[0], 1, "debeTerminarCon"); TXT(a[1], 2, "debeTerminarCon");
  if (!termina(a[0], a[1])) return ERR("%r no termina con %r", a[0], a[1]);
  return n_nulo();
}
NAT(pr_debeEstarVacio) {
  (void)n; (void)extra; CUENTA;
  NV l = n_len(a[0]); if (N_FALLO(l)) return l;
  if (l.u.n != 0) return ERR("%r no está vacío", a[0]);
  return n_nulo();
}
NAT(pr_debeTener) {
  (void)n; (void)extra; CUENTA;
  NV l = n_len(a[0]); if (N_FALLO(l)) return l;
  NUM(a[1], 2, "debeTener");
  if (l.u.n != a[1].u.n) return ERR("se esperaban %j elementos y hay %j", a[1].u.n, l.u.n);
  return n_nulo();
}
NAT(pr_debeSerTipo) {
  (void)n; (void)extra; CUENTA;
  const char* t = n_tipo_de(a[0]); TXT(a[1], 2, "debeSerTipo");
  NV tt = T(t); int ig = texto_igual(tt, a[1]); n_dec(tt);
  if (!ig) return ERR("se esperaba un valor de tipo %v y llegó %s", a[1], t);
  return n_nulo();
}

/* ── errores ─────────────────────────────────────────────────────────────── */
NAT(pr_debeFallar) {
  (void)n; (void)extra; CUENTA; FNC(a[0], 1, "debeFallar");
  NV m, p;
  if (!pr_aislado(a[0], &m, &p)) return n_error("se esperaba un fallo y no falló", NULL);
  n_dec(p); return m;
}
NAT(pr_noDebeFallar) {
  (void)n; (void)extra; CUENTA; FNC(a[0], 1, "noDebeFallar");
  NV m, p;
  if (!pr_aislado(a[0], &m, &p)) return n_nulo();
  NV r = ERR("no debía fallar y falló: %v", m); n_dec(m); n_dec(p); return r;
}
NAT(pr_debeFallarCon) {
  (void)n; (void)extra; CUENTA; TXT(a[1], 2, "debeFallarCon"); FNC(a[0], 1, "debeFallarCon");
  NV m, p;
  if (!pr_aislado(a[0], &m, &p)) return ERR("se esperaba un fallo con «%v» y no falló", a[1]);
  n_dec(p);
  NV r = n_nulo();
  if (texto_buscar(m, a[1], 0) < 0) r = ERR("el fallo dice «%v» y se esperaba que dijera «%v»", m, a[1]);
  n_dec(m); return r;
}

/* ── dobles: el espía ────────────────────────────────────────────────────── */
static NV pr_espia_nat(NV* a, int n, void* extra) {   /* extraV = [original, llamadas] */
  NNativa* yo = (NNativa*)extra; NLista* par = LS(yo->extraV);
  n_lista_agregar(LS(n_lv(par)[1]), n_lista_de(a, n));
  return n_llamar(n_lv(par)[0], a, n);
}
NAT(pr_espia) {
  (void)n; (void)extra; FNC(a[0], 1, "espia");
  NV ll = n_lista_nueva(4); NV par[2] = { a[0], ll };
  NV ex = n_lista_de(par, 2); n_dec(ll);
  char nombre[32]; snprintf(nombre, sizeof nombre, " espia%d", pr_nespias++);
  NV r = nativa_con(nombre, -1, pr_espia_nat, ex); n_dec(ex);
  return r;
}
static NLista* pr_llamadas(NV f) {
  if (!n_es(f, NC_NATIVA) || ((NNativa*)f.u.o)->f != pr_espia_nat) return NULL;
  return LS(n_lv(LS(((NNativa*)f.u.o)->extraV))[1]);
}
NAT(pr_llamadasDe) {
  (void)n; (void)extra; NLista* l = pr_llamadas(a[0]);
  if (!l) return n_error("«llamadasDe»: eso no es un espía", "envuélvelo antes con espia(f)");
  return n_lista_de(n_lv(l), (int)l->n);
}
NAT(pr_vecesLlamada) {
  (void)n; (void)extra; NLista* l = pr_llamadas(a[0]);
  if (!l) return n_error("«vecesLlamada»: eso no es un espía", "envuélvelo antes con espia(f)");
  return n_num((double)l->n);
}

/* ── correr ─────────────────────────────────────────────────────────────── */
NAT(pr_soloFallosF) { (void)n; (void)extra; pr_soloFallos = n_verdad(a[0]); return n_nulo(); }
NAT(pr_semillaPruebas) { (void)n; (void)extra; NUM(a[0], 1, "semillaPruebas"); pr_semilla = a[0].u.n; pr_haySemilla = 1; return n_nulo(); }
NAT(pr_afirmacionesF) { SIN_USO; return n_num(pr_afirmaciones); }
static uint32_t a_uint32(double d) {   /* ToUint32 */
  if (!isfinite(d)) return 0;
  d = trunc(d); d = fmod(d, 4294967296.0); if (d < 0) d += 4294967296.0;
  return (uint32_t)d;
}
static void pr_salida(const char* a, NV x, const char* b, NV y) {   /* a + x + b + y, como una línea */
  NBuf q = {0}; b_utf8(&q, a); if (x.t == N_OBJ) b_txt(&q, x); if (b) b_utf8(&q, b); if (y.t == N_OBJ) b_txt(&q, y);
  NV t = b_texto(&q); n_salida(t); n_dec(t);
}
static void pr_fallo(NV donde, NV m, NV p) {   /* apunta el fallo y lo imprime */
  NV md = pr_mensajeDe(m, p);
  NBuf q = {0}; b_txt(&q, donde); b_utf8(&q, ": "); b_txt(&q, md);
  n_lista_agregar(LS(pr_fallos), b_texto(&q));
  pr_salida("  ✗ ", donde, "\n      → ", md);
  n_dec(md);
}
static void pr_correr_ganchos(NV lista, const char* donde) {
  NLista* l = LS(lista);
  for (int64_t i = 0; i < l->n; i++) {
    NV m, p;
    if (pr_aislado(n_lv(l)[i], &m, &p)) { pr_fallan++; NV d = T(donde); pr_fallo(d, m, p); n_dec(d); n_dec(m); n_dec(p); }
  }
}
NAT(pr_correrPruebas) {
  SIN_USO; pr_iniciar();
  if (pr_corriendo) return n_error("«correrPruebas» ya está corriendo", "no se puede llamar desde dentro de una prueba");
  pr_corriendo = 1;
  int haySolo = 0; for (int64_t i = 0; i < pr_n; i++) if (pr_casos[i].solo) haySolo = 1;
  int64_t nc = pr_n; PrCaso* casos = (PrCaso*)n_mem(sizeof(PrCaso) * (size_t)(nc + 1));
  memcpy(casos, pr_casos, sizeof(PrCaso) * (size_t)nc);
  pr_n = 0;
  if (pr_haySemilla) {
    uint32_t s = a_uint32(pr_semilla); if (!s) s = 1;
    for (int64_t i = nc - 1; i > 0; i--) {
      s ^= s << 13; s ^= s >> 17; s ^= s << 5;
      int64_t j = (int64_t)floor((double)s / 4294967296.0 * (double)(i + 1));
      PrCaso t = casos[i]; casos[i] = casos[j]; casos[j] = t;
    }
  }
  pr_pasan = pr_fallan = pr_saltadas = 0;
  n_dec(pr_fallos); pr_fallos = n_lista_nueva(4);
  pr_correr_ganchos(pr_antesTodo, "antesDeTodo");
  NV grupoActual = n_nulo();
  for (int64_t i = 0; i < nc; i++) {
    PrCaso* c = &casos[i];
    if (grupoActual.t == N_NULO || !texto_igual(c->grupo, grupoActual)) {
      n_dec(grupoActual); grupoActual = n_inc(c->grupo);
      if (TX(grupoActual)->n && !pr_soloFallos) pr_salida("\n── ", grupoActual, NULL, n_nulo());
    }
    if (c->saltada || (haySolo && !c->solo)) {
      pr_saltadas++;
      if (!pr_soloFallos) pr_salida("  · ", c->nombre, " (saltada)", n_nulo());
      continue;
    }
    pr_correr_ganchos(pr_antesCada, "antesDeCada");
    NV m, p; int fallo = pr_aislado(c->fn, &m, &p);
    pr_correr_ganchos(pr_despuesCada, "despuesDeCada");
    if (fallo) {
      pr_fallan++;
      NV md = pr_mensajeDe(m, p);
      NBuf q = {0};
      if (TX(c->grupo)->n) { b_txt(&q, c->grupo); b_utf8(&q, " › "); }
      b_txt(&q, c->nombre); b_utf8(&q, ": "); b_txt(&q, md);
      n_lista_agregar(LS(pr_fallos), b_texto(&q));
      pr_salida("  ✗ ", c->nombre, "\n      → ", md);
      n_dec(md); n_dec(m); n_dec(p);
    } else {
      pr_pasan++;
      if (!pr_soloFallos) pr_salida("  ✓ ", c->nombre, NULL, n_nulo());
    }
  }
  n_dec(grupoActual);
  pr_correr_ganchos(pr_despuesTodo, "despuesDeTodo");
  pr_corriendo = 0;
  /* Las ya corridas se descartan —y, como en la VM, también las que se
     registraron mientras corrían—: llamar dos veces no las repite. */
  for (int64_t i = 0; i < nc; i++) { n_dec(casos[i].nombre); n_dec(casos[i].fn); n_dec(casos[i].grupo); }
  for (int64_t i = 0; i < pr_n; i++) { n_dec(pr_casos[i].nombre); n_dec(pr_casos[i].fn); n_dec(pr_casos[i].grupo); }
  pr_n = 0;
  free(casos);
  NV kv[6] = { T("pasan"), n_num(pr_pasan), T("fallan"), n_num(pr_fallan), T("saltadas"), n_num(pr_saltadas) };
  NV d = n_dic_de(kv, 3);
  n_dec(kv[0]); n_dec(kv[2]); n_dec(kv[4]);
  return d;
}
NAT(pr_resumenPruebas) {
  SIN_USO; pr_iniciar();
  NBuf b = {0}; char s[64];
  num_js(pr_pasan, s); b_utf8(&b, s); b_utf8(&b, " pasan, "); num_js(pr_fallan, s); b_utf8(&b, s); b_utf8(&b, " fallan");
  if (pr_saltadas) { b_utf8(&b, ", "); num_js(pr_saltadas, s); b_utf8(&b, s); b_utf8(&b, " saltadas"); }
  b_utf8(&b, " · "); num_js(pr_afirmaciones, s); b_utf8(&b, s); b_utf8(&b, " afirmaciones");
  NLista* f = LS(pr_fallos);
  if (f->n) { b_c(&b, '\n'); for (int64_t i = 0; i < f->n; i++) { b_utf8(&b, "\n  ✗ "); b_txt(&b, n_lv(f)[i]); } }
  return b_texto(&b);
}

#define NAT_PROBAR \
  { "probar/probar", 2, pr_probar }, { "probar/saltar", 2, pr_saltar }, { "probar/soloEsta", 2, pr_soloEsta }, \
  { "probar/grupo", 2, pr_grupo }, { "probar/antesDeTodo", 1, pr_antesDeTodo }, { "probar/despuesDeTodo", 1, pr_despuesDeTodo }, \
  { "probar/antesDeCada", 1, pr_antesDeCada }, { "probar/despuesDeCada", 1, pr_despuesDeCada }, \
  { "probar/debeSer", 2, pr_debeSer }, { "probar/noDebeSer", 2, pr_noDebeSer }, { "probar/debeSerCierto", 1, pr_debeSerCierto }, \
  { "probar/debeSerFalso", 1, pr_debeSerFalso }, { "probar/debeSerCerca", -1, pr_debeSerCerca }, \
  { "probar/debeSerMayor", 2, pr_debeSerMayor }, { "probar/debeSerMenor", 2, pr_debeSerMenor }, \
  { "probar/debeSerAlMenos", 2, pr_debeSerAlMenos }, { "probar/debeSerComoMucho", 2, pr_debeSerComoMucho }, \
  { "probar/debeContener", 2, pr_debeContener }, { "probar/noDebeContener", 2, pr_noDebeContener }, \
  { "probar/debeEmpezarCon", 2, pr_debeEmpezarCon }, { "probar/debeTerminarCon", 2, pr_debeTerminarCon }, \
  { "probar/debeEstarVacio", 1, pr_debeEstarVacio }, { "probar/debeTener", 2, pr_debeTener }, { "probar/debeSerTipo", 2, pr_debeSerTipo }, \
  { "probar/debeFallar", 1, pr_debeFallar }, { "probar/noDebeFallar", 1, pr_noDebeFallar }, { "probar/debeFallarCon", 2, pr_debeFallarCon }, \
  { "probar/espia", 1, pr_espia }, { "probar/llamadasDe", 1, pr_llamadasDe }, { "probar/vecesLlamada", 1, pr_vecesLlamada }, \
  { "probar/soloFallos", 1, pr_soloFallosF }, { "probar/semillaPruebas", 1, pr_semillaPruebas }, \
  { "probar/afirmaciones", 0, pr_afirmacionesF }, { "probar/correrPruebas", 0, pr_correrPruebas }, \
  { "probar/resumenPruebas", 0, pr_resumenPruebas },
