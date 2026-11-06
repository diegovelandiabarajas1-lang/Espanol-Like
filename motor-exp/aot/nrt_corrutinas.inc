/* ============================================================================
 *  (motor-exp A6) Generadores, funciones asíncronas, promesas y el bucle de eventos.
 *
 *  Cómo se hace sin la VM. En la VM una corrutina guarda su trozo de pila y sus
 *  marcos aparte. Aquí cada corrutina tiene su PROPIA PILA DE C (1 MB reservado,
 *  sin gastar hasta que se usa): «producir» y «esperar» cambian de pila y
 *  vuelven a quien la había reanudado; todo lo de dentro (variables, marcos,
 *  «capturar» abiertos) se queda donde está. El código generado no cambia: un
 *  generador es una función normal que de vez en cuando llama a « producir».
 *
 *  La semántica es la de la VM (src/03-vm-jit.js, «corrutinas»):
 *    · llamar a un generador no corre nada: da el generador; «para … en», siguiente
 *      y recoger lo reanudan hasta el siguiente «producir».
 *    · llamar a una asíncrona corre YA hasta su primer «esperar» sobre algo pendiente
 *      y devuelve su promesa; cuando lo esperado se cumple, sigue (dentro de ese
 *      mismo cumplir, sin cola de microtareas: igual que la VM).
 *    · una promesa fallida hace que el «esperar» lance el error en la asíncrona.
 *    · lo que viene de fuera (un temporizador) es un turno nuevo: si falla se
 *      imprime y el programa sigue; el código de salida queda en 1.
 *
 *  Linux/macOS: ucontext. Windows: fibras. N_CORRUTINA_PILA cambia el tamaño.
 * ========================================================================== */
#if defined(_WIN32)
/* windows.h ya está incluido arriba */
#else
#include <ucontext.h>
#include <sys/mman.h>
#endif
#ifndef N_CORRUTINA_PILA
#define N_CORRUTINA_PILA ((size_t)1 << 20)
#endif

typedef struct NGen NGen;
typedef struct NProm NProm;
typedef struct NTodas { NProm* p; NV* res; int faltan, n, refs; } NTodas;
enum { CW_GEN = 1, CW_TODAS, CW_CB };
typedef struct { int tipo; NGen* g; NTodas* t; int i; void (*f)(int ok, NV v, void* d); void* d; } NEsp;
struct NProm { NObj h; uint8_t estado, vista; NV valor; NEsp* w; int nw, cw; };   /* estado: 0 pendiente · 1 cumplida · 2 fallida */
/* Linux/x86-64: el cambio de pila a mano (guarda los 6 registros que el llamado debe conservar y cambia rsp): ucontext hace una llamada al sistema
   (sigprocmask) en cada cambio, y un producir son dos cambios. Windows: fibras. Lo demás: ucontext. */
#if defined(__linux__) && defined(__x86_64__)
#define N_CO_ASM 1
#endif
typedef struct {
#if defined(_WIN32)
  LPVOID f, res;
#elif defined(N_CO_ASM)
  void* sp; void* res_sp;
#else
  ucontext_t c, res;
#endif
} CoCtx;
struct NGen {
  NObj h;
  uint8_t asinc, estado;                 /* estado: 0 nuevo · 1 suspendido · 2 corriendo · 3 terminado */
  NV cierre; NV* args; int nargs;
  NV actual;                             /* lo último que produjo (para «para … en») */
  NV promesa;                            /* la de una asíncrona */
  NV in_v; int in_lanzar;                /* lo que recibe al reanudarse */
  NV out_v;                              /* lo que da al pausarse */
  NV ret; int ret_err;                   /* cómo acabó */
  CoCtx cx; void* pila;
  /* un generador hecho en C (leerLineas): no hay pila, solo una función que da el siguiente valor */
  NV (*nativo)(void* e, int* fin); void (*cierra)(void* e); void* nat_e; const char* nombre_nat;
};
typedef struct { NObj h; NGen* g; } NLongGen;

static NGen* co_actual = NULL;           /* la corrutina que corre ahora (la de dentro) */

/* ── cambiar de pila ─────────────────────────────────────────────────────── */
static void co_cuerpo(NGen* g);
#if defined(_WIN32)
static LPVOID co_principal = NULL;
static VOID CALLBACK co_fibra(LPVOID p) { co_cuerpo((NGen*)p); }
static int co_crear(NGen* g) {
  if (!co_principal) { co_principal = ConvertThreadToFiberEx(NULL, FIBER_FLAG_FLOAT_SWITCH); if (!co_principal) co_principal = GetCurrentFiber(); }
  g->cx.f = CreateFiberEx(0, N_CORRUTINA_PILA, FIBER_FLAG_FLOAT_SWITCH, co_fibra, g);
  return g->cx.f != NULL;
}
static void co_ir(NGen* g) { g->cx.res = GetCurrentFiber(); SwitchToFiber(g->cx.f); }
static void co_volver(NGen* g) { SwitchToFiber(g->cx.res); }
static void co_soltar_pila(NGen* g) { if (g->cx.f) { DeleteFiber(g->cx.f); g->cx.f = NULL; } g->pila = NULL; }
#else
static void* co_pilas[32]; static int co_npilas;
static void* co_pila_pedir(void) {
  if (co_npilas) return co_pilas[--co_npilas];
  void* p = mmap(NULL, N_CORRUTINA_PILA, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_NORESERVE, -1, 0);
  if (p == MAP_FAILED) return NULL;
  mprotect(p, 4096, PROT_NONE);          /* página de guarda: pasarse de pila es un fallo claro, no una corrupción */
  return p;
}
static NGen* co_arrancando = NULL;
#if defined(N_CO_ASM)
void n_co_swap(void** de_sp, void* a_sp);
__asm__(".text\n"
  ".globl n_co_swap\n"
  ".hidden n_co_swap\n"
  ".type n_co_swap,@function\n"
  "n_co_swap:\n"
  "  pushq %rbp\n  pushq %rbx\n  pushq %r12\n  pushq %r13\n  pushq %r14\n  pushq %r15\n"
  "  movq %rsp, (%rdi)\n  movq %rsi, %rsp\n"
  "  popq %r15\n  popq %r14\n  popq %r13\n  popq %r12\n  popq %rbx\n  popq %rbp\n  ret\n"
  ".size n_co_swap, .-n_co_swap\n");
static void co_tramp(void) { co_cuerpo(co_arrancando); }
static int co_crear(NGen* g) {
  g->pila = co_pila_pedir();
  if (!g->pila) return 0;
  uintptr_t top = ((uintptr_t)g->pila + N_CORRUTINA_PILA) & ~(uintptr_t)15;
  void** sp = (void**)top;
  *--sp = NULL;                          /* dirección de retorno falsa de co_tramp */
  *--sp = (void*)co_tramp;               /* a donde salta el primer «ret» */
  for (int i = 0; i < 6; i++) *--sp = NULL;   /* rbp, rbx, r12–r15 */
  g->cx.sp = sp;
  co_arrancando = g;
  return 1;
}
static void co_ir(NGen* g) { n_co_swap(&g->cx.res_sp, g->cx.sp); }
static void co_volver(NGen* g) { n_co_swap(&g->cx.sp, g->cx.res_sp); }
#else
static void co_tramp(void) { co_cuerpo(co_arrancando); }
static int co_crear(NGen* g) {
  g->pila = co_pila_pedir();
  if (!g->pila) return 0;
  getcontext(&g->cx.c);
  g->cx.c.uc_stack.ss_sp = g->pila; g->cx.c.uc_stack.ss_size = N_CORRUTINA_PILA; g->cx.c.uc_link = NULL;
  makecontext(&g->cx.c, (void (*)(void))co_tramp, 0);
  co_arrancando = g;
  return 1;
}
static void co_ir(NGen* g) { swapcontext(&g->cx.res, &g->cx.c); }
static void co_volver(NGen* g) { swapcontext(&g->cx.c, &g->cx.res); }
#endif
static void co_soltar_pila(NGen* g) {
  if (!g->pila) return;
  if (co_npilas < 32) co_pilas[co_npilas++] = g->pila; else munmap(g->pila, N_CORRUTINA_PILA);
  g->pila = NULL;
}
#endif

/* lo que corre dentro de la pila nueva: la función del generador, y al acabar vuelve para siempre */
static void co_cuerpo(NGen* g) {
  NCierre* c = (NCierre*)g->cierre.u.o;
  NV r = c->fn->f(c, g->args, g->nargs);
  if (N_FALLO(r)) g->ret_err = 1; else g->ret = r;
  g->estado = 3;
  co_volver(g);
  abort();   /* una corrutina terminada no se reanuda */
}

/* ── promesas ────────────────────────────────────────────────────────────── */
static NProm* prom_nueva(void) {
  NProm* p = (NProm*)n_objeto(sizeof(NProm), NC_PROMESA);
  p->estado = 0; p->vista = 0; p->valor = n_nulo(); p->w = NULL; p->nw = p->cw = 0;
  return p;
}
static void prom_agregar(NProm* p, NEsp e) {
  if (p->nw == p->cw) { p->cw = p->cw ? p->cw * 2 : 2; p->w = (NEsp*)n_remem(p->w, sizeof(NEsp) * (size_t)p->cw); }
  p->w[p->nw++] = e;
}
static int co_conducir(NGen* g, NV valor, int fallo, int inicial);
static int prom_cumplir(NProm* p, NV valor, int ok);
static int esp_llamar(NEsp* e, int ok, NV v) {
  switch (e->tipo) {
    case CW_GEN: { NGen* g = e->g; int st = co_conducir(g, v, !ok, 0); n_dec(n_obj(g)); return st; }
    case CW_TODAS: {
      NTodas* t = e->t; int st = 0;
      if (t->p->estado == 0) {
        if (!ok) st = prom_cumplir(t->p, v, 0);
        else {
          t->res[e->i] = n_inc(v);
          if (--t->faltan == 0) {
            NV l = n_lista_nueva(t->n);
            for (int i = 0; i < t->n; i++) n_lista_agregar(LS(l), n_inc(t->res[i]));
            st = prom_cumplir(t->p, l, 1);
            n_dec(l);
          }
        }
      }
      if (--t->refs == 0) { for (int i = 0; i < t->n; i++) n_dec(t->res[i]); free(t->res); n_dec(n_obj(t->p)); free(t); }
      return st;
    }
    case CW_CB: e->f(ok, v, e->d); return 0;
  }
  return 0;
}
/* cumplir (ok=1) o fallar (ok=0) una promesa: lo que esperaban sigue AHORA, en esta misma pila, como en la VM */
static int prom_cumplir(NProm* p, NV valor, int ok) {
  if (p->estado != 0) return 0;
  p->estado = ok ? 1 : 2; p->valor = n_inc(valor);
  NEsp* w = p->w; int nw = p->nw; p->w = NULL; p->nw = p->cw = 0;
  N_RC_MAS(&p->h);
  int st = 0, i = 0;
  for (; i < nw; i++) { if (esp_llamar(&w[i], ok, p->valor) < 0) { st = -1; i++; break; } }
  for (; i < nw; i++) { if (w[i].tipo == CW_GEN) n_dec(n_obj(w[i].g)); }   /* si una falló, el resto no se llama (como un throw en la VM) */
  free(w);
  n_dec(n_obj(p));
  return st;
}

/* ── reanudar una corrutina ─────────────────────────────────────────────── */
static const char* co_nombre(NGen* g) { return g->cierre.t == N_OBJ ? ((NCierre*)g->cierre.u.o)->fn->nombre : g->nombre_nat; }
/* → 0 bien (*fin dice si acabó; *val es de quien llama), -1 error pendiente */
static int co_reanudar(NGen* g, NV enviado, int lanzar, NV* val, int* fin) {
  *val = n_nulo(); *fin = 0;
  if (g->estado == 3) { *fin = 1; return 0; }
  if (g->nativo) {
    int f2 = 0;
    NV x = g->nativo(g->nat_e, &f2);
    if (N_FALLO(x)) { g->estado = 3; if (g->cierra) { g->cierra(g->nat_e); g->cierra = NULL; } return -1; }
    if (f2) { g->estado = 3; if (g->cierra) { g->cierra(g->nat_e); g->cierra = NULL; } *fin = 1; return 0; }
    g->estado = 1; *val = x; return 0;
  }
  if (g->estado == 2) { n_errorf("«%s» ya está corriendo: una corrutina no puede pedirse a sí misma el siguiente valor", co_nombre(g)); return -1; }
  int prof = n_hilo.profundidad;
  if (g->estado == 0) {
    if (!co_crear(g)) { n_error("no queda memoria para otra corrutina", NULL); return -1; }
  }
  n_dec(g->in_v); g->in_v = n_inc(enviado); g->in_lanzar = lanzar;
  g->estado = 2;
  NGen* prev = co_actual; co_actual = g;
  N_RC_MAS(&g->h);                       /* vivo mientras corre aunque el programa suelte todas sus referencias */
  co_ir(g);
  co_actual = prev; n_hilo.profundidad = prof;
  int st = 0;
  if (g->estado == 3) {
    co_soltar_pila(g);
    for (int i = 0; i < g->nargs; i++) n_dec(g->args[i]);
    free(g->args); g->args = NULL; g->nargs = 0;
    if (g->ret_err) { g->ret_err = 0; st = -1; }
    else { *fin = 1; *val = g->ret; g->ret = n_nulo(); }
  } else {
    g->estado = 1;
    *val = g->out_v; g->out_v = n_nulo();
  }
  n_dec(n_obj(g));
  return st;
}
/* un paso de un generador (para «para … en», siguiente y recoger): 1 hay valor (en g->actual), 0 no hay más, -1 error */
static int co_avanzar(NGen* g) {
  if (g->asinc) { n_error("una tarea asíncrona no se recorre: se espera con «esperar»", NULL); return -1; }
  NV v; int fin;
  if (co_reanudar(g, n_nulo(), 0, &v, &fin) < 0) return -1;
  n_dec(g->actual);
  if (fin) { n_dec(v); g->actual = n_nulo(); return 0; }
  g->actual = v;
  return 1;
}
/* el motor de una asíncrona: la reanuda, y si se pausa en un «esperar» de una promesa pendiente se apunta a ella para seguir después */
static int co_conducir(NGen* g, NV valor, int fallo, int inicial) {
  N_RC_MAS(&g->h);
  NV v = n_inc(valor);
  int resultado = 0;
  for (;;) {
    NV r; int fin;
    int st = co_reanudar(g, v, fallo, &r, &fin);
    n_dec(v); v = n_nulo();
    NProm* pr = (NProm*)g->promesa.u.o;
    if (st < 0) {
      if (!n_hilo.fatal) {
        NV ev = n_error_como_valor();
        prom_cumplir(pr, ev, 0);
        n_dec(ev);
        /* nadie la espera: que se vea. En el primer tramo (aún dentro de la llamada) todavía no ha podido nadie tomar la promesa:
           el fallo queda guardado para quien la espere */
        if (!pr->vista && !inicial) resultado = -1; else err_limpiar();
      } else resultado = -1;
      break;
    }
    if (fin) { prom_cumplir(pr, r, 1); n_dec(r); break; }
    if (n_es(r, NC_PROMESA)) {
      NProm* p = (NProm*)r.u.o;
      p->vista = 1;
      if (p->estado == 0) {
        NEsp e; memset(&e, 0, sizeof e); e.tipo = CW_GEN; e.g = g; N_RC_MAS(&g->h);
        prom_agregar(p, e);
        n_dec(r);
        break;
      }
      v = n_inc(p->valor); fallo = p->estado == 2;
      n_dec(r);
    } else { v = r; fallo = 0; }
  }
  n_dec(v);
  n_dec(n_obj(g));
  return resultado;
}

/* ── crear ───────────────────────────────────────────────────────────────── */
static NGen* gen_nuevo(int asinc) {
  NGen* g = (NGen*)n_objeto(sizeof(NGen), NC_GENERADOR);
  memset((char*)g + sizeof(NObj), 0, sizeof(NGen) - sizeof(NObj));
  g->asinc = (uint8_t)asinc; g->estado = 0;
  g->cierre = g->actual = g->promesa = g->in_v = g->out_v = g->ret = n_nulo();
  return g;
}
static NV co_nueva(NCierre* c, NV* args, int n) {
  NGen* g = gen_nuevo(c->fn->corrutina == 2);
  g->cierre = n_inc(n_obj(c));
  g->nargs = n; g->args = (NV*)n_mem(sizeof(NV) * (size_t)(n ? n : 1));
  for (int i = 0; i < n; i++) g->args[i] = n_inc(args[i]);
  if (!g->asinc) return n_obj(g);
  /* una asíncrona empieza YA y corre hasta su primer «esperar»; lo que devuelve quien la llama es su promesa */
  NProm* p = prom_nueva();
  g->promesa = n_obj(p);
  NV r = n_obj(p); n_inc(r);
  int st = co_conducir(g, n_nulo(), 0, 1);
  n_dec(n_obj(g));
  if (st < 0) { n_dec(r); return N_ERR; }
  return r;
}
/* un generador hecho en C: cada llamada a «sig» da el siguiente valor (*fin = 1 cuando no hay más); «cierra» se llama al acabar o al soltarlo */
static NV co_gen_nativo(const char* nombre, NV (*sig)(void*, int*), void (*cierra)(void*), void* e) {
  NGen* g = gen_nuevo(0);
  g->nativo = sig; g->cierra = cierra; g->nat_e = e; g->nombre_nat = nombre;
  return n_obj(g);
}

/* ── lo que el resto del runtime pide ───────────────────────────────────── */
static void co_liberar(NObj* o) {
  if (o->clase == NC_GENERADOR) {
    NGen* g = (NGen*)o;
    if (g->cierra) { g->cierra(g->nat_e); g->cierra = NULL; }
    co_soltar_pila(g);
    n_dec(g->cierre); n_dec(g->actual); n_dec(g->promesa); n_dec(g->in_v); n_dec(g->out_v); n_dec(g->ret);
    for (int i = 0; i < g->nargs; i++) n_dec(g->args[i]);
    free(g->args);
  } else if (o->clase == NC_PROMESA) {
    NProm* p = (NProm*)o;
    n_dec(p->valor);
    for (int i = 0; i < p->nw; i++) if (p->w[i].tipo == CW_GEN) n_dec(n_obj(p->w[i].g));
    free(p->w);
  } else if (o->clase == NC_LONGGEN) {
    n_dec(n_obj(((NLongGen*)o)->g));
  }
}
static const char* co_tipo_de(NV v) {
  if (v.u.o->clase == NC_PROMESA) return "promesa";
  return ((NGen*)v.u.o)->asinc ? "tarea" : "generador";
}
static void co_repr(NBuf* b, NV v) {
  if (v.u.o->clase == NC_PROMESA) {
    static const char* e[] = { "pendiente", "cumplida", "fallida" };
    b_utf8(b, "<promesa "); b_utf8(b, e[((NProm*)v.u.o)->estado]); b_c(b, '>');
    return;
  }
  if (v.u.o->clase == NC_GENERADOR) {
    NGen* g = (NGen*)v.u.o;
    b_c(b, '<'); b_utf8(b, g->asinc ? "tarea" : "generador"); b_c(b, ' '); b_utf8(b, co_nombre(g));
    if (g->estado == 3) b_utf8(b, " \xC2\xB7 terminado");
    b_c(b, '>');
    return;
  }
  b_utf8(b, "<objeto>");
}
/* la «longitud» de un generador dentro de un «para»: al compararse (i < longitud) avanza el generador y dice si hay otro valor */
static NV co_len(NV o) {
  NLongGen* l = (NLongGen*)n_objeto(sizeof(NLongGen), NC_LONGGEN);
  l->g = (NGen*)o.u.o; N_RC_MAS(&l->g->h);
  return n_obj(l);
}
static NV co_actual_de(NV o) { return n_inc(((NGen*)o.u.o)->actual); }
static NV co_cmp(NV a, NV b, int op) {
  int r = co_avanzar(((NLongGen*)b.u.o)->g);
  if (r < 0) return N_ERR;
  double x = a.u.n, y = r ? INFINITY : -INFINITY;
  return n_bool(op == 0 ? x < y : op == 1 ? x <= y : op == 2 ? x > y : x >= y);
}

/* ── « producir» y « esperar»: las llama el compilador, no el programa ──── */
NAT(nat_producir) {
  (void)n; (void)extra;
  NGen* g = co_actual;
  if (!g || g->asinc) return n_error("«producir» solo funciona dentro de un generador que alguien esté recorriendo", NULL);
  n_dec(g->out_v); g->out_v = n_inc(a[0]);
  co_volver(g);
  return n_nulo();
}
NAT(nat_esperar) {
  (void)n; (void)extra;
  NGen* g = co_actual;
  if (!g || !g->asinc) return n_error("«esperar» solo funciona dentro de una función asíncrona", NULL);
  n_dec(g->out_v); g->out_v = n_inc(a[0]);
  co_volver(g);
  if (g->in_lanzar) {
    NV v = g->in_v;
    NV e = n_lanzar(v);
    if (!n_es(v, NC_ERROR)) {   /* la VM dice «lo esperado falló: …» cuando lo que falló no es un error */
      NV rv = n_repr(v, 0); NV m = msg("lo esperado falló: %v", rv); n_dec(rv);
      n_dec(n_hilo.mensaje); n_hilo.mensaje = m;
    }
    return e;
  }
  return n_inc(g->in_v);
}

/* ── el eDSL «corrutinas»: siguiente, terminado, recoger, dormir, todas ─── */
static int exige_gen(NV v, int k, const char* f, NV* e) {
  if (!n_es(v, NC_GENERADOR) || ((NGen*)v.u.o)->asinc) { *e = ERR("«%s»: el argumento %d debe ser un generador y es %s", f, (long long)k, n_tipo_de(v)); return 0; }
  return 1;
}
NAT(nat_siguiente) {
  (void)extra;
  if (n < 1 || n > 2) return n_error("«siguiente» acepta el generador y, si quieres, el valor para cuando se acabe", NULL);
  NV e; if (!exige_gen(a[0], 1, "siguiente", &e)) return e;
  NGen* g = (NGen*)a[0].u.o;
  int r = co_avanzar(g);
  if (r < 0) return N_ERR;
  if (r) return n_inc(g->actual);
  return n > 1 ? n_inc(a[1]) : n_nulo();
}
NAT(nat_terminado) {
  (void)n; (void)extra;
  if (n_es(a[0], NC_GENERADOR)) return n_bool(((NGen*)a[0].u.o)->estado == 3);
  if (n_es(a[0], NC_PROMESA)) return n_bool(((NProm*)a[0].u.o)->estado != 0);
  return ERR("«terminado»: necesita un generador o una promesa y recibió %s", n_tipo_de(a[0]));
}
NAT(nat_recoger) {
  (void)n; (void)extra;
  NV e; if (!exige_gen(a[0], 1, "recoger", &e)) return e;
  NGen* g = (NGen*)a[0].u.o;
  NV l = n_lista_nueva(0);
  for (;;) {
    int r = co_avanzar(g);
    if (r < 0) { n_dec(l); return N_ERR; }
    if (!r) break;
    n_lista_agregar(LS(l), n_inc(g->actual));
  }
  return l;
}

/* ── temporizadores y el bucle de eventos ───────────────────────────────── */
typedef struct NTemp { double due; uint64_t seq; NProm* p; void (*f)(void*); void* d; struct NTemp* sig; } NTemp;
static NTemp* temps = NULL; static uint64_t temp_seq = 0;
/* como setTimeout: menos de 1 ms (o algo que no es un tiempo) es 1 ms */
static void temp_poner(double ms, NProm* p, void (*f)(void*), void* d) {
  if (!(ms >= 1 && ms <= 2147483647.0)) ms = 1;
  NTemp* t = (NTemp*)n_mem(sizeof(NTemp));
  t->due = reloj_ms() + floor(ms); t->seq = temp_seq++; t->p = p; t->f = f; t->d = d; t->sig = NULL;
  NTemp** pp = &temps;
  while (*pp && (*pp)->due <= t->due) pp = &(*pp)->sig;
  t->sig = *pp; *pp = t;
}
static void dormir_ms(double ms) {
  if (ms <= 0) return;
#if defined(_WIN32)
  Sleep((DWORD)ceil(ms));
#else
  struct timespec ts; ts.tv_sec = (time_t)(ms / 1000.0); ts.tv_nsec = (long)((ms - (double)ts.tv_sec * 1000.0) * 1e6);
  nanosleep(&ts, NULL);
#endif
}
NAT(nat_dormir) {
  (void)n; (void)extra; NUM(a[0], 1, "dormir");
  NProm* p = prom_nueva();
  N_RC_MAS(&p->h);                       /* una referencia la guarda el temporizador */
  temp_poner(a[0].u.n, p, NULL, NULL);
  return n_obj(p);
}
NAT(nat_todas) {
  (void)n; (void)extra;
  if (!n_es(a[0], NC_LISTA)) return ERR("«todas»: el argumento 1 debe ser una lista y es %s", n_tipo_de(a[0]));
  NLista* l = LS(a[0]);
  NProm* p = prom_nueva();
  int cnt = (int)l->n;
  if (!cnt) { NV vacia = n_lista_nueva(0); prom_cumplir(p, vacia, 1); n_dec(vacia); return n_obj(p); }
  NTodas* t = (NTodas*)n_mem(sizeof(NTodas));
  t->p = p; N_RC_MAS(&p->h); t->n = t->faltan = cnt; t->refs = cnt;
  t->res = (NV*)n_mem(sizeof(NV) * (size_t)cnt);
  for (int i = 0; i < cnt; i++) t->res[i] = n_nulo();
  NV res = n_obj(p);
  for (int i = 0; i < cnt; i++) {
    NV x = n_lista_leer(l, i);
    NEsp e; memset(&e, 0, sizeof e); e.tipo = CW_TODAS; e.t = t; e.i = i;
    if (n_es(x, NC_PROMESA)) {
      NProm* q = (NProm*)x.u.o; q->vista = 1;
      if (q->estado == 0) { prom_agregar(q, e); n_dec(x); continue; }
      int st = esp_llamar(&e, q->estado == 1, q->valor);
      n_dec(x);
      if (st < 0) { n_dec(res); return N_ERR; }
    } else {
      int st = esp_llamar(&e, 1, x);
      n_dec(x);
      if (st < 0) { n_dec(res); return N_ERR; }
    }
  }
  return res;
}

#define NAT_CORRUTINAS \
  { " producir", 1, nat_producir }, { " esperar", 1, nat_esperar }, \
  { "corrutinas/siguiente", -1, nat_siguiente }, { "corrutinas/terminado", 1, nat_terminado }, { "corrutinas/recoger", 1, nat_recoger }, \
  { "corrutinas/dormir", 1, nat_dormir }, { "corrutinas/todas", 1, nat_todas },
