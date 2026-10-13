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
 * Los hilos corren de uno en uno, así que __syncthreads no se puede emular:
 * C1EÑ no lo usa (sus reducciones son una pasada por nivel).
 */
/* Sin <math.h> ni <string.h>: en C++ arrastran <cmath> y compilar cada núcleo
 * costaba un cuarto de segundo, que con cientos de núcleos en el fuzz se nota.
 * Basta con declarar lo que el código generado usa: son las mismas funciones
 * de la libm de C, enlazadas igual. */
extern "C" {
double sqrt(double); double exp(double); double log(double); double log10(double);
double sin(double); double cos(double); double tan(double); double asin(double);
double acos(double); double atan(double); double atan2(double, double); double pow(double, double);
double fabs(double); double floor(double); double ceil(double); double fmod(double, double);
}

struct c1en_dim3 { unsigned int x, y, z; };
static c1en_dim3 blockIdx, threadIdx, blockDim, gridDim;

#define __global__
#define __device__
#define __host__
#define __forceinline__ inline

static inline int atomicAdd(int* p, int v) { int o = *p; *p = (int)((unsigned int)o + (unsigned int)v); return o; }
static inline double atomicAdd(double* p, double v) { double o = *p; *p = o + v; return o; }
static inline unsigned long long atomicMin(unsigned long long* p, unsigned long long v) {
  unsigned long long o = *p; if (v < o) *p = v; return o;
}
static inline double __longlong_as_double(long long x) { double d; __builtin_memcpy(&d, &x, 8); return d; }
