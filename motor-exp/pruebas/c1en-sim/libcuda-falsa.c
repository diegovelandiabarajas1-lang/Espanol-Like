/* libcuda falsa: la Driver API de CUDA, imitada en la CPU, para probar
 * util/c1en-cuda.js de punta a punta sin una GPU.
 *
 * Exporta los MISMOS símbolos y con las MISMAS firmas que libcuda.so.1 (los
 * nombres _v2 incluidos), así que c1en-cuda.js la carga con C1EN_CUDA_LIB sin
 * cambiar una línea. La «memoria del dispositivo» es memoria del proceso, el
 * «PTX» es la ruta de un .so que fabrica la libnvrtc falsa, y cuLaunchKernel
 * llama al envoltorio c1en_emul_<núcleo> con la cuadrícula y con el MISMO
 * arreglo void **kernelParams que recibiría el driver: si c1en-cuda.js arma mal
 * los punteros a los parámetros, aquí se lee basura y la prueba falla.
 *
 * (motor-exp N4.3) COLAS Y EVENTOS. Cada cola (CUstream; NULL es la de siempre)
 * es una lista de operaciones: núcleos, copias, marcas de eventos y esperas a
 * eventos de otras colas. Con C1EN_SIM_PEREZOSO=1 NO se ejecuta nada hasta que
 * alguien lo necesita —sincronizar la cola, el contexto o un evento, preguntar
 * por ellos, o copiar de forma síncrona en la cola de siempre—, y entonces se
 * ejecuta en orden y respetando las esperas entre colas. Es la forma de que una
 * sincronización que falte se note en las pruebas: en una GPU de verdad el
 * núcleo acabaría «a tiempo» casi siempre y el fallo saldría una vez de cada
 * mil. Sin PEREZOSO todo corre en cuanto se pide, como antes.
 * Las colas creadas son no bloqueantes (CU_STREAM_NON_BLOCKING): la de siempre
 * no las espera, igual que en CUDA.
 *
 * Cuántas GPU finge: C1EN_SIM_GPUS (por defecto 2, como Kaggle).
 */
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>

typedef int CUresult;
typedef int CUdevice;
typedef unsigned long long CUdeviceptr;
typedef void (*c1en_emul)(unsigned int, unsigned int, void**);
typedef struct { void* so; } modulo_falso;
typedef struct { c1en_emul f; } funcion_falsa;

static int iniciado = 0;
static int ctx_actual = -1;
static int contextos[16];
static long long lanzamientos = 0;
static long long reservas_vivas = 0;
static long long ops_diferidas = 0;   /* cuántas operaciones esperaron en una cola */

static int num_gpus(void) { const char* s = getenv("C1EN_SIM_GPUS"); return s ? atoi(s) : 2; }
static int perezoso(void) { const char* s = getenv("C1EN_SIM_PEREZOSO"); return s && *s && *s != '0'; }
static double ahora_ms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e3 + t.tv_nsec / 1e6; }

/* ── colas, operaciones y eventos ─────────────────────────────────────────── */
#define MAX_PARAMS 64
struct cola_falsa; struct evento_falso;
typedef struct op_falsa {
  int tipo;                       /* 0 núcleo, 1 copia a la «GPU», 2 marcar evento, 3 esperar evento */
  funcion_falsa* f; unsigned int gx, bx;
  uint64_t vals[MAX_PARAMS]; void* ptrs[MAX_PARAMS + 1];
  void* dst; void* src; size_t n;
  struct evento_falso* ev; long long version;
  struct op_falsa* sig;
} op_falsa;
typedef struct cola_falsa { op_falsa *cab, *fin; int no_bloqueante; struct cola_falsa* sig_cola; } cola_falsa;
typedef struct evento_falso {
  cola_falsa* c; op_falsa* op;    /* la marca pendiente (si la hay) */
  long long version, hecha;       /* cada «marcar» es una versión nueva; «hecha» es la última que se alcanzó */
  double t;
} evento_falso;
static cola_falsa legado;            /* la cola de siempre (CUstream NULL) */
static cola_falsa* colas = NULL;     /* las creadas, para sincronizar el contexto */
static cola_falsa* cola_de(void* s) { return s ? (cola_falsa*)s : &legado; }

static void drenar(cola_falsa* c, op_falsa* hasta);
static void ejecutar(op_falsa* o) {
  switch (o->tipo) {
    case 0: lanzamientos++; o->f->f(o->gx, o->bx, o->ptrs); break;
    case 1: memcpy(o->dst, o->src, o->n); free(o->src); break;
    case 2: o->ev->t = ahora_ms(); if (o->version > o->ev->hecha) o->ev->hecha = o->version; if (o->ev->op == o) o->ev->op = NULL; break;
    case 3: /* esperar: lo que marcaba el evento en SU cola tiene que estar hecho */
      if (o->ev->hecha < o->version && o->ev->op) drenar(o->ev->c, o->ev->op);
      break;
  }
}
/* Ejecuta en orden lo que hay en la cola; con «hasta», solo hasta esa operación. */
static void drenar(cola_falsa* c, op_falsa* hasta) {
  while (c->cab) {
    op_falsa* o = c->cab;
    c->cab = o->sig; if (!c->cab) c->fin = NULL;
    ejecutar(o);
    int era = o == hasta;
    free(o);
    if (era) return;
  }
}
static void drenar_todo(void) { drenar(&legado, NULL); for (cola_falsa* c = colas; c; c = c->sig_cola) drenar(c, NULL); }
static void encolar(cola_falsa* c, op_falsa* o) {
  o->sig = NULL;
  if (c->fin) c->fin->sig = o; else c->cab = o;
  c->fin = o;
  if (!perezoso()) drenar(c, NULL); else ops_diferidas++;
}
/* lo que la cola de siempre espera antes de una operación síncrona: ella misma
   y las colas bloqueantes (las nuestras no lo son) */
static void drenar_legado(void) {
  drenar(&legado, NULL);
  for (cola_falsa* c = colas; c; c = c->sig_cola) if (!c->no_bloqueante) drenar(c, NULL);
}

CUresult cuInit(unsigned int flags) { if (flags != 0) return 1; iniciado = 1; return 0; }
CUresult cuDriverGetVersion(int* v) { *v = 12040; return 0; }
CUresult cuDeviceGetCount(int* n) { if (!iniciado) return 3; *n = num_gpus(); return 0; }
CUresult cuDeviceGet(CUdevice* d, int ord) { if (ord < 0 || ord >= num_gpus()) return 101; *d = ord; return 0; }
CUresult cuDeviceGetName(char* name, int len, CUdevice dev) { snprintf(name, (size_t)len, "Simulador C1EN %d", dev); return 0; }
CUresult cuDeviceGetAttribute(int* pi, int attrib, CUdevice dev) {
  (void)dev;
  if (attrib == 75) { *pi = 7; return 0; }   /* COMPUTE_CAPABILITY_MAJOR */
  if (attrib == 76) { *pi = 5; return 0; }   /* COMPUTE_CAPABILITY_MINOR */
  return 1;
}
CUresult cuDeviceTotalMem_v2(size_t* b, CUdevice d) { (void)d; *b = (size_t)16 << 30; return 0; }
CUresult cuDevicePrimaryCtxRetain(void** pctx, CUdevice dev) {
  if (dev < 0 || dev >= num_gpus() || dev >= 16) return 101;
  *pctx = &contextos[dev];
  return 0;
}
CUresult cuCtxSetCurrent(void* ctx) { ctx_actual = (int)((int*)ctx - contextos); return 0; }
CUresult cuCtxSynchronize(void) { if (ctx_actual < 0) return 201; drenar_todo(); return 0; }

CUresult cuModuleLoadData(void** module, const void* image) {
  const char* s = (const char*)image;
  if (ctx_actual < 0) return 201;                      /* CUDA_ERROR_INVALID_CONTEXT */
  if (strncmp(s, "C1EN-SIM:", 9) != 0) return 218;     /* CUDA_ERROR_INVALID_PTX */
  void* so = dlopen(s + 9, RTLD_NOW | RTLD_LOCAL);
  if (!so) { fprintf(stderr, "libcuda falsa: %s\n", dlerror()); return 200; }
  modulo_falso* m = (modulo_falso*)malloc(sizeof *m);
  m->so = so;
  *module = m;
  return 0;
}
CUresult cuModuleGetFunction(void** hfunc, void* hmod, const char* name) {
  char sim[512];
  snprintf(sim, sizeof sim, "c1en_emul_%s", name);
  void* f = dlsym(((modulo_falso*)hmod)->so, sim);
  if (!f) return 500;                                  /* CUDA_ERROR_NOT_FOUND */
  funcion_falsa* ff = (funcion_falsa*)malloc(sizeof *ff);
  ff->f = (c1en_emul)f;
  *hfunc = ff;
  return 0;
}
CUresult cuMemAlloc_v2(CUdeviceptr* d, size_t n) {
  if (ctx_actual < 0) return 201;
  void* p = malloc(n ? n : 1);
  if (!p) return 2;                                    /* CUDA_ERROR_OUT_OF_MEMORY */
  /* Basura a propósito: la memoria nueva de una GPU no está a cero, y un
     núcleo que lo dé por supuesto tiene que fallar aquí también. */
  memset(p, 0xA5, n);
  reservas_vivas++;
  *d = (CUdeviceptr)(uintptr_t)p;
  return 0;
}
/* Liberar memoria que un núcleo en cola todavía usa sería un fallo de quien
   llama; el simulador termina antes lo pendiente, como hace el driver. */
CUresult cuMemFree_v2(CUdeviceptr d) { drenar_todo(); free((void*)(uintptr_t)d); reservas_vivas--; return 0; }
CUresult cuMemcpyHtoD_v2(CUdeviceptr dst, const void* src, size_t n) { drenar_legado(); memcpy((void*)(uintptr_t)dst, src, n); return 0; }
CUresult cuMemcpyDtoH_v2(void* dst, CUdeviceptr src, size_t n) { drenar_legado(); memcpy(dst, (const void*)(uintptr_t)src, n); return 0; }
/* Desde memoria normal, la copia asíncrona se lleva los bytes YA (a la zona
   intermedia del driver) y llega al dispositivo en orden dentro de la cola. */
CUresult cuMemcpyHtoDAsync_v2(CUdeviceptr dst, const void* src, size_t n, void* s) {
  op_falsa* o = (op_falsa*)calloc(1, sizeof *o);
  o->tipo = 1; o->dst = (void*)(uintptr_t)dst; o->n = n; o->src = malloc(n ? n : 1); memcpy(o->src, src, n);
  encolar(cola_de(s), o);
  return 0;
}
/* Hacia memoria normal, CUDA vuelve cuando la copia terminó. */
CUresult cuMemcpyDtoHAsync_v2(void* dst, CUdeviceptr src, size_t n, void* s) {
  drenar(cola_de(s), NULL);
  memcpy(dst, (const void*)(uintptr_t)src, n);
  return 0;
}
CUresult cuLaunchKernel(void* f, unsigned int gx, unsigned int gy, unsigned int gz,
                        unsigned int bx, unsigned int by, unsigned int bz, unsigned int shmem,
                        void* stream, void** params, void** extra) {
  if (ctx_actual < 0) return 201;
  if (gy != 1 || gz != 1 || by != 1 || bz != 1 || shmem != 0 || extra != NULL) return 1;
  if (bx == 0 || bx > 1024 || gx == 0) return 1;       /* CUDA_ERROR_INVALID_VALUE */
  op_falsa* o = (op_falsa*)calloc(1, sizeof *o);
  o->tipo = 0; o->f = (funcion_falsa*)f; o->gx = gx; o->bx = bx;
  /* El driver copia los VALORES de los parámetros al lanzar (quien llama suelta
     su memoria en cuanto vuelve), así que en cola se guardan aquí. c1en-cuda.js
     acaba la lista con un NULL; cada valor ocupa 8 bytes. */
  int k = 0;
  if (params) for (; k < MAX_PARAMS && params[k]; k++) { memcpy(&o->vals[k], params[k], 8); o->ptrs[k] = &o->vals[k]; }
  o->ptrs[k] = NULL;
  encolar(cola_de(stream), o);
  return 0;
}

CUresult cuStreamCreate(void** ps, unsigned int flags) {
  cola_falsa* c = (cola_falsa*)calloc(1, sizeof *c);
  c->no_bloqueante = (flags & 1) != 0;
  c->sig_cola = colas; colas = c;
  *ps = c;
  return 0;
}
CUresult cuStreamDestroy_v2(void* s) {
  cola_falsa* c = (cola_falsa*)s;
  drenar(c, NULL);   /* CUDA termina lo que quedaba antes de soltarla */
  for (cola_falsa** p = &colas; *p; p = &(*p)->sig_cola) if (*p == c) { *p = c->sig_cola; break; }
  free(c);
  return 0;
}
CUresult cuStreamSynchronize(void* s) { drenar(cola_de(s), NULL); return 0; }
/* Preguntar no espera: si hay algo pendiente, la primera vez dice «no listo»
   (600) y aprovecha para avanzar; así un bucle que pregunta termina. */
CUresult cuStreamQuery(void* s) {
  cola_falsa* c = cola_de(s);
  if (!c->cab) return 0;
  drenar(c, NULL);
  return 600;
}
CUresult cuEventCreate(void** pe, unsigned int flags) {
  (void)flags;
  evento_falso* e = (evento_falso*)calloc(1, sizeof *e);
  *pe = e;
  return 0;
}
CUresult cuEventDestroy_v2(void* e) { (void)e; /* puede quedar una marca en cola: se deja (memoria del simulador) */ return 0; }
CUresult cuEventRecord(void* pe, void* s) {
  evento_falso* e = (evento_falso*)pe;
  op_falsa* o = (op_falsa*)calloc(1, sizeof *o);
  o->tipo = 2; o->ev = e; o->version = ++e->version;
  e->c = cola_de(s); e->op = o;
  encolar(e->c, o);
  return 0;
}
CUresult cuStreamWaitEvent(void* s, void* pe, unsigned int flags) {
  (void)flags;
  evento_falso* e = (evento_falso*)pe;
  if (e->hecha >= e->version) return 0;                /* ya pasó: nada que esperar */
  op_falsa* o = (op_falsa*)calloc(1, sizeof *o);
  o->tipo = 3; o->ev = e; o->version = e->version;
  encolar(cola_de(s), o);
  return 0;
}
CUresult cuEventSynchronize(void* pe) {
  evento_falso* e = (evento_falso*)pe;
  if (e->hecha < e->version && e->op) drenar(e->c, e->op);
  return 0;
}
CUresult cuEventQuery(void* pe) {
  evento_falso* e = (evento_falso*)pe;
  if (e->hecha >= e->version) return 0;
  if (e->op) drenar(e->c, e->op);
  return 600;
}
CUresult cuEventElapsedTime(float* ms, void* a, void* b) {
  evento_falso *x = (evento_falso*)a, *y = (evento_falso*)b;
  if (x->hecha < x->version || y->hecha < y->version) return 600;
  *ms = (float)(y->t - x->t);
  return 0;
}

CUresult cuGetErrorName(CUresult e, const char** s) {
  switch (e) {
    case 0: *s = "CUDA_SUCCESS"; break;
    case 1: *s = "CUDA_ERROR_INVALID_VALUE"; break;
    case 201: *s = "CUDA_ERROR_INVALID_CONTEXT"; break;
    case 218: *s = "CUDA_ERROR_INVALID_PTX"; break;
    case 500: *s = "CUDA_ERROR_NOT_FOUND"; break;
    case 600: *s = "CUDA_ERROR_NOT_READY"; break;
    default: *s = "CUDA_ERROR_UNKNOWN"; break;
  }
  return 0;
}
/* Solo del simulador, para que las pruebas vean cuántos lanzamientos hubo y
   que no se queda memoria sin liberar. */
long long c1en_sim_lanzamientos(void) { return lanzamientos; }
long long c1en_sim_reservas_vivas(void) { return reservas_vivas; }
long long c1en_sim_diferidas(void) { return ops_diferidas; }
