/* ============================================================================
 *  Ñ sin runtime (motor-exp N4.1) — la biblioteca de apoyo del ejecutable.
 *
 *  Lo que sale de «n-compilar» es C normal que se enlaza con esto y nada más:
 *  ni Node, ni la VM, ni el JIT, ni un recolector de basura. Esto es lo que
 *  la libc es para C: valores, textos, listas, diccionarios, registros,
 *  cierres, errores con su línea, y las funciones de la biblioteca de Ñ.
 *
 *  MEMORIA: conteo de referencias (decisión de Diego, 20-oct-2026). Cada
 *  objeto se libera en el instante en que nadie lo usa: sin pausas, determinista.
 *  Un ciclo (A apunta a B y B a A) no se libera solo; se rompe a mano.
 *
 *  ERRORES: al estilo de CPython, sin setjmp. Una operación que falla devuelve
 *  N_ERR y deja el error pendiente en n_hilo (por hilo); quien llama mira
 *  N_FALLO y salta a su limpieza. Así no se pierde ninguna referencia en el
 *  camino del error, funciona igual con hilos, y una función exportada a C
 *  puede devolver un código de error en vez de hacer un longjmp por encima de
 *  quien la llamó.
 *
 *  Pensado para lo que viene en N4 sin rehacerlo:
 *    · N_HILO_LOCAL y N_RC_ATOMICO: el estado por hilo y el conteo atómico
 *      (para «hilos y memoria compartida»).
 *    · NV lleva una etiqueta de 8 bits con sitio para los tipos de máquina
 *      (i8…u64, f16, f32) junto a NUM (el «real» de Ñ, f64).
 *    · las funciones exportadas con la ABI de C usan n_llamar y miran N_FALLO.
 * ========================================================================== */
#ifndef NRT_H
#define NRT_H
/* En Windows (mingw), el printf/strtod de la propia mingw y no los de msvcrt:
   los de msvcrt no dan los dígitos exactos y los números saldrían distintos. */
#if defined(_WIN32) && !defined(__USE_MINGW_ANSI_STDIO)
#define __USE_MINGW_ANSI_STDIO 1
#endif
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include <stdio.h>

#if defined(_MSC_VER)
#define N_HILO_LOCAL __declspec(thread)
#else
#define N_HILO_LOCAL _Thread_local
#endif

/* ── los valores ─────────────────────────────────────────────────────────── */
typedef enum {
  N_NULO = 0, N_BOOL, N_NUM, N_OBJ,
  /* reservado para N4 (tipos de máquina): N_I8, N_I16, N_I32, N_I64, N_U8, N_U16, N_U32, N_U64, N_F16, N_F32 */
} NEtiqueta;

typedef enum {
  NC_TEXTO = 1, NC_LISTA, NC_DIC, NC_CIERRE, NC_NATIVA, NC_ERROR, NC_UP, NC_REGDESC, NC_FALTANTE, NC_FECHA,
} NClase;

typedef struct NObj { int64_t rc; uint8_t clase; uint8_t inmortal; } NObj;
typedef struct NV { uint8_t t; union { double n; int b; NObj* o; } u; } NV;

#define N_INMORTAL_RC ((int64_t)1 << 60)

static inline NV n_nulo(void) { NV v; v.t = N_NULO; v.u.o = NULL; return v; }
static inline NV n_bool(int b) { NV v; v.t = N_BOOL; v.u.b = b ? 1 : 0; return v; }
static inline NV n_num(double d) { NV v; v.t = N_NUM; v.u.n = d; return v; }
static inline NV n_obj(void* o) { NV v; v.t = N_OBJ; v.u.o = (NObj*)o; return v; }
static inline int n_es(NV v, NClase c) { return v.t == N_OBJ && v.u.o->clase == c; }

void n_liberar(NObj* o);
#ifdef N_RC_ATOMICO
#define N_RC_MAS(o) __atomic_add_fetch(&(o)->rc, 1, __ATOMIC_RELAXED)
#define N_RC_MENOS(o) __atomic_sub_fetch(&(o)->rc, 1, __ATOMIC_ACQ_REL)
#else
#define N_RC_MAS(o) (++(o)->rc)
#define N_RC_MENOS(o) (--(o)->rc)
#endif
static inline NV n_inc(NV v) { if (v.t == N_OBJ) N_RC_MAS(v.u.o); return v; }
static inline void n_dec(NV v) { if (v.t == N_OBJ && N_RC_MENOS(v.u.o) == 0) n_liberar(v.u.o); }
static inline void n_asignar(NV* d, NV v) { NV viejo = *d; *d = n_inc(v); n_dec(viejo); }

/* ── los objetos ─────────────────────────────────────────────────────────── */
/* Texto en UTF-16, como el texto de JavaScript: longitud, índices y comparar
   dan lo mismo que en la VM. Se escribe en UTF-8 al salir. */
typedef struct { NObj h; int64_t n; uint32_t hash; uint16_t s[]; } NTexto;
typedef struct { NObj h; int64_t n, cap; NV* v; } NLista;
typedef struct NRegDesc NRegDesc;
/* Diccionario con orden de inserción (como el Map de JavaScript). */
typedef struct { NV k, v; int vivo; } NEntrada;
typedef struct { NObj h; int64_t n, usados, cap; NEntrada* e; int64_t* tabla; int64_t ntabla; NRegDesc* reg; } NDic;
typedef struct NCierre NCierre;
typedef NV (*NFnC)(NCierre* yo, NV* args, int n);
typedef struct { const char* nombre; int aridad; int minimos; int nup; int corrutina; NFnC f; } NFn;
typedef struct NUp { NObj h; NV* p; NV cerrado; int slot; struct NUp* sig; } NUp;
struct NCierre { NObj h; const NFn* fn; int nup; NUp* up[]; };
typedef NV (*NNatC)(NV* args, int n, void* extra);
typedef struct { NObj h; const char* nombre; int aridad; NNatC f; void* extra; NV extraV; NRegDesc* registro; } NNativa;
typedef struct { NObj h; NV tipo, mensaje; double linea; } NError;
/* Una fecha: milisegundos desde 1970 que SIEMPRE se leen en UTC (sin zona horaria, como en la VM). */
typedef struct { NObj h; double ms; } NFecha;
struct NRegDesc { NObj h; NV nombre; NV campos; NV metodos; };

/* ── errores ─────────────────────────────────────────────────────────────── */
typedef struct { const char* nombre; int linea; } NMarco;
#define N_MAX_MARCOS 900
#define N_MAX_TRAZA 64
typedef struct {
  int hay;              /* hay un error pendiente */
  int lanzado;          /* vino de «lanzar» (valor) o del motor (mensaje) */
  int fatal;            /* ya no se puede capturar */
  NV valor;             /* lo lanzado */
  NV mensaje, pista, tipo;
  int linea;
  int ntraza; NMarco traza[N_MAX_TRAZA];
  NMarco marcos[N_MAX_MARCOS]; int nmarcos;
  int profundidad;
} NHilo;
extern N_HILO_LOCAL NHilo n_hilo;
#define N_ERR (n_err_valor())
static inline NV n_err_valor(void) { NV v; v.t = 255; v.u.o = NULL; return v; }
#define N_FALLO(v) ((v).t == 255)
#define N_HAY_ERROR (n_hilo.hay)

NV n_error(const char* msg, const char* pista);                 /* de la biblioteca (UTF-8) */
NV n_errorT(NV msg, NV pista);                                  /* mensaje ya en texto de Ñ */
NV n_errorf(const char* fmt, ...);
NV n_lanzar(NV v);
NV n_error_capturado(void);                                      /* convierte lo pendiente en valor y lo limpia */
void n_fallo_final(void);                                        /* imprime como la VM y sale con 1 */
static inline int n_marco_entrar(const char* nombre, int linea) {
  if (n_hilo.nmarcos >= N_MAX_MARCOS) return 0;
  n_hilo.marcos[n_hilo.nmarcos].nombre = nombre; n_hilo.marcos[n_hilo.nmarcos].linea = linea; n_hilo.nmarcos++;
  return 1;
}
static inline void n_marco_salir(void) { n_hilo.nmarcos--; }
#define N_LINEA(l) (n_hilo.marcos[n_hilo.nmarcos - 1].linea = (l))
/* El camino corto de una llamada: un cierre con los argumentos justos va
   directo a su función de C; todo lo demás (defectos, nativas, errores) pasa
   por n_llamar, que dice lo mismo que la VM. */
NV n_llamar(NV f, NV* args, int n);
static inline NV n_llamar_r(NV f, NV* a, int n) {
  if (f.t == N_OBJ && f.u.o->clase == NC_CIERRE) {
    NCierre* c = (NCierre*)f.u.o; const NFn* fn = c->fn;
    if (fn->aridad == n && !fn->corrutina && n_hilo.nmarcos < N_MAX_MARCOS) return fn->f(c, a, n);
  }
  return n_llamar(f, a, n);
}

/* ── textos ──────────────────────────────────────────────────────────────── */
NV n_texto_utf8(const char* s);
NV n_texto_utf16(const uint16_t* s, int64_t n);
NV n_texto_nuevo(int64_t n);                                     /* sin llenar */
char* n_a_utf8(NV t, int64_t* largo);                            /* malloc */
NV n_texto_inmortal_utf16(const uint16_t* s, int64_t n);

/* ── lo que hace cada instrucción ───────────────────────────────────────── */
int n_verdad(NV v);
#define N_VERDAD(v) ((v).t == N_BOOL ? (v).u.b : n_verdad(v))
int n_iguales(NV a, NV b);
NV n_sumar(NV a, NV b);
NV n_restar(NV a, NV b);
NV n_mult(NV a, NV b);
NV n_div(NV a, NV b);
NV n_idiv(NV a, NV b);
NV n_mod(NV a, NV b);
NV n_pot(NV a, NV b);
NV n_neg(NV a);
NV n_cmp(NV a, NV b, int op);       /* 0 <, 1 <=, 2 >, 3 >= */
NV n_lista_de(NV* v, int n);        /* pone referencias nuevas */
NV n_lista_tomar(NV* v, int n);     /* se queda con las de v */
NV n_dic_de(NV* kv, int n);
NV n_idx_get(NV o, NV i);
NV n_idx_set(NV o, NV i, NV v);     /* devuelve nulo o N_ERR */
NV n_prop_get(NV o, NV nombre);
NV n_concat(NV* v, int n);
NV n_len(NV o);
NV n_cierre_nuevo(const NFn* fn);
NUp* n_up_capturar(NUp** abiertas, NV* slot, int idx);
void n_up_cerrar(NUp** abiertas, int desde);
NV n_global_no_definida(const char* nombre);
NV n_repr(NV v, int prof);
NV n_texto_de(NV v);
const char* n_tipo_de(NV v);

/* ── diccionarios y listas, para la biblioteca ──────────────────────────── */
NV n_lista_nueva(int64_t cap);
void n_lista_agregar(NLista* l, NV v);   /* toma la referencia */
NV n_dic_nuevo(void);
int n_dic_poner(NDic* d, NV k, NV v);    /* inc a los dos */
int n_dic_buscar(NDic* d, NV k, NV* v);  /* sin inc */
int n_dic_borrar(NDic* d, NV k);

/* ── el programa ─────────────────────────────────────────────────────────── */
typedef struct { const char* nombre; int aridad; NNatC f; } NNatDef;
NV n_nativa_nueva(const char* nombre, int aridad, NNatC f, void* extra);
NV n_buscar_nativa(const char* nombre);           /* nulo si no está */
void n_iniciar(int argc, char** argv);
void n_registrar_modulos(const char* const* claves, const NFn* const* fns, int n);
void n_salida(NV texto);                          /* una línea */
extern NV n_faltante;
extern NV n_nativa_registro;

/* ── (motor-exp N4.6) Ñ como biblioteca de C: ver nrt_biblioteca.inc ─────── */
void n_iniciar_biblioteca(void);
void n_api_limpiar_error(void);
void n_api_guardar_error(void);
void n_api_poner_error(const char* msg);
const char* n_api_error(void);
int n_api_de_entero(int64_t x, NV* v);
int n_api_de_texto(const char* s, NV* v);
int n_api_a_real(NV r, double* x, const char* quien);
int n_api_a_entero(NV r, int64_t* x, const char* quien);
int n_api_a_bool(NV r, int* x, const char* quien);
int n_api_a_texto(NV r, char** x, const char* quien);
void* n_api_asa(NV v);
NV n_api_valor(const void* a);
void n_api_soltar(void* a);
const char* n_api_tipo(const void* a);
double n_api_real(const void* a);
int n_api_bool(const void* a);
char* n_api_texto(const void* a);
char* n_api_repr(const void* a);
int64_t n_api_largo(const void* a);
void* n_api_en(const void* a, int64_t i);
void* n_api_clave(const void* a, int64_t i);
void* n_api_valor_en(const void* a, int64_t i);
void* n_api_lista(void);
void* n_api_lista_reales(const double* x, int64_t n);
int64_t n_api_copiar_reales(const void* a, double* out, int64_t n);
int n_api_agregar(void* l, const void* x);
void* n_api_dic(void);
int n_api_poner(void* d, const void* k, const void* x);
void* n_api_llamar(const void* f, const void* const* args, int n);
#endif
