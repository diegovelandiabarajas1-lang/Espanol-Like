/* Cabecera falsa de CUDA para el simulador de C1EÑ.
 *
 * Con esto, el CUDA C que genera C1EÑ se compila con g++ como C++ normal y se
 * ejecuta en la CPU recorriendo la cuadrícula bloque a bloque e hilo a hilo
 * (lo hace el envoltorio c1en_emul_<núcleo>, que C1EÑ emite bajo
 * #ifdef C1EN_EMULAR). Sirve para dos cosas sin tener una GPU:
 *   1. comprobar que el texto es C++ válido con la sintaxis de CUDA
 *      (extern "C" __global__, __device__, blockIdx…);
 *   2. comprobar que el núcleo CUDA da LOS MISMOS BITS que jit y nativo.
 *
 * Lo que NO puede comprobar: que NVRTC acepte el texto (su front-end es EDG, no
 * g++), ni la aritmética de la GPU de verdad. Las dos cosas las mide el
 * cuaderno de Kaggle.
 *
 * Los hilos corren de uno en uno. Los núcleos generados no usan __syncthreads
 * (sus reducciones son una pasada por nivel); los de biblioteca que sí lo usan
 * (motor-exp N3: el DGEMM y la FFT con memoria compartida) se emulan en modo
 * COOPERATIVO: cada hilo del bloque es una corrutina (ucontext) con su pila, y
 * __syncthreads le cede el turno al siguiente; cuando todos llegaron a la
 * barrera, siguen todos. Es la semántica de CUDA, y determinista.
 */
#include <ucontext.h>
#include <stdlib.h>
/* Sin <math.h> ni <string.h>: en C++ arrastran <cmath> y compilar cada núcleo
 * costaba un cuarto de segundo, que con cientos de núcleos en el fuzz se nota.
 * Basta con declarar lo que el código generado usa: son las mismas funciones
 * de la libm de C, enlazadas igual. */
extern "C" {
double sqrt(double); double exp(double); double log(double); double log10(double);
double sin(double); double cos(double); double tan(double); double asin(double);
double acos(double); double atan(double); double atan2(double, double); double pow(double, double);
double fabs(double); double fma(double, double, double); double floor(double); double ceil(double); double trunc(double); double fmod(double, double);
/* (motor-exp N4.2) los de precisión simple */
float fmaf(float, float, float); float sqrtf(float); float fabsf(float);
}

struct c1en_dim3 { unsigned int x, y, z; };
static c1en_dim3 blockIdx, threadIdx, blockDim, gridDim;

#define __global__
#define __device__
#define __host__
#define __forceinline__ inline
#define __shared__ static            /* los bloques corren de uno en uno: una copia basta */

/* ── modo cooperativo (motor-exp N3) ─────────────────────────────────────── */
struct c1en_hilo { ucontext_t ctx; unsigned t; int vivo; char* pila; };
static ucontext_t c1en_coop_principal;
static c1en_hilo* c1en_coop_h = 0;
static unsigned c1en_coop_actual = 0;
static int c1en_coop_activo = 0;
static void (*c1en_coop_f)(void**) = 0;
static void** c1en_coop_p = 0;
static void c1en_coop_entrada() { c1en_coop_f(c1en_coop_p); c1en_coop_h[c1en_coop_actual].vivo = 0; }
static void c1en_coop_correr(unsigned gx, unsigned bx, void (*f)(void**), void** p);

static inline int atomicAdd(int* p, int v) { int o = *p; *p = (int)((unsigned int)o + (unsigned int)v); return o; }
static inline double atomicAdd(double* p, double v) { double o = *p; *p = o + v; return o; }
/* (motor-exp N4.5) los de float y unsigned int, que CUDA también tiene */
static inline float atomicAdd(float* p, float v) { float o = *p; *p = o + v; return o; }
static inline unsigned int atomicAdd(unsigned int* p, unsigned int v) { unsigned int o = *p; *p = o + v; return o; }
static inline unsigned long long atomicMin(unsigned long long* p, unsigned long long v) {
  unsigned long long o = *p; if (v < o) *p = v; return o;
}
static inline double __longlong_as_double(long long x) { double d; __builtin_memcpy(&d, &x, 8); return d; }

/* __syncthreads: en modo cooperativo cede el turno; fuera de él no hace nada
   (un núcleo sin barreras corre igual hilo a hilo). */
static inline void __syncthreads() {
  if (!c1en_coop_activo) return;
  unsigned yo = c1en_coop_actual;
  swapcontext(&c1en_coop_h[yo].ctx, &c1en_coop_principal);
}
static void c1en_coop_correr(unsigned gx, unsigned bx, void (*f)(void**), void** p) {
  const size_t PILA = 128 * 1024;
  gridDim.x = gx; blockDim.x = bx; c1en_coop_f = f; c1en_coop_p = p;
  c1en_hilo* h = (c1en_hilo*)calloc(bx, sizeof(c1en_hilo));
  for (unsigned t = 0; t < bx; t++) h[t].pila = (char*)malloc(PILA);
  c1en_coop_h = h; c1en_coop_activo = 1;
  for (unsigned b = 0; b < gx; b++) {
    blockIdx.x = b;
    for (unsigned t = 0; t < bx; t++) {
      getcontext(&h[t].ctx);
      h[t].ctx.uc_stack.ss_sp = h[t].pila; h[t].ctx.uc_stack.ss_size = PILA;
      h[t].ctx.uc_link = &c1en_coop_principal;
      makecontext(&h[t].ctx, (void (*)())c1en_coop_entrada, 0);
      h[t].vivo = 1; h[t].t = t;
    }
    unsigned quedan = bx;
    while (quedan) {
      quedan = 0;
      for (unsigned t = 0; t < bx; t++) {
        if (!h[t].vivo) continue;
        c1en_coop_actual = t; threadIdx.x = t;
        swapcontext(&c1en_coop_principal, &h[t].ctx);
        if (h[t].vivo) quedan++;
      }
    }
  }
  for (unsigned t = 0; t < bx; t++) free(h[t].pila);
  free(h); c1en_coop_h = 0; c1en_coop_activo = 0;
}
