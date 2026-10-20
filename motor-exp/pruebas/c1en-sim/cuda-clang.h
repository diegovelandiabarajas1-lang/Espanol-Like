/* Cabecera mínima para compilar el CUDA C de C1EÑ con clang a PTX de verdad
 * (clang++ -x cuda --cuda-device-only --cuda-gpu-arch=sm_75 -nocudainc
 * -nocudalib), sin tener instalado el toolkit de CUDA. Comprueba que el texto
 * pasa por un front-end de CUDA de verdad —el de clang, no el de NVRTC— y deja
 * mirar el PTX: con -ffp-contract=off no tiene que aparecer ni una «fma».
 * Las trascendentes quedan como llamadas externas a libdevice (no se enlaza:
 * solo se mira que compile).
 */
#define __device__ __attribute__((device))
#define __global__ __attribute__((global))
#define __host__ __attribute__((host))
#define __forceinline__ __inline__ __attribute__((always_inline))
#define __shared__ __attribute__((shared))
#include <__clang_cuda_builtin_vars.h>
__device__ inline double sqrt(double x) { return __nvvm_sqrt_rn_d(x); }
__device__ inline double floor(double x) { return __nvvm_floor_d(x); }
__device__ inline double ceil(double x) { return __nvvm_ceil_d(x); }
__device__ inline double trunc(double x) { return __nvvm_trunc_d(x); }
__device__ inline double fabs(double x) { return __nvvm_fabs_d(x); }
__device__ inline double fma(double a, double b, double c) { return __nvvm_fma_rn_d(a, b, c); }
__device__ inline float fmaf(float a, float b, float c) { return __nvvm_fma_rn_f(a, b, c); }   /* (motor-exp N4.2) */
extern "C" __device__ double __nv_exp(double); __device__ inline double exp(double x) { return __nv_exp(x); }
extern "C" __device__ double __nv_log(double); __device__ inline double log(double x) { return __nv_log(x); }
extern "C" __device__ double __nv_log10(double); __device__ inline double log10(double x) { return __nv_log10(x); }
extern "C" __device__ double __nv_sin(double); __device__ inline double sin(double x) { return __nv_sin(x); }
extern "C" __device__ double __nv_cos(double); __device__ inline double cos(double x) { return __nv_cos(x); }
extern "C" __device__ double __nv_tan(double); __device__ inline double tan(double x) { return __nv_tan(x); }
extern "C" __device__ double __nv_asin(double); __device__ inline double asin(double x) { return __nv_asin(x); }
extern "C" __device__ double __nv_acos(double); __device__ inline double acos(double x) { return __nv_acos(x); }
extern "C" __device__ double __nv_atan(double); __device__ inline double atan(double x) { return __nv_atan(x); }
extern "C" __device__ double __nv_atan2(double, double); __device__ inline double atan2(double y, double x) { return __nv_atan2(y, x); }
extern "C" __device__ double __nv_pow(double, double); __device__ inline double pow(double x, double y) { return __nv_pow(x, y); }
extern "C" __device__ double __nv_fmod(double, double); __device__ inline double fmod(double x, double y) { return __nv_fmod(x, y); }
__device__ inline double __longlong_as_double(long long x) { return __builtin_bit_cast(double, x); }
__device__ inline int atomicAdd(int* p, int v) { return __nvvm_atom_add_gen_i(p, v); }
__device__ inline double atomicAdd(double* p, double v) { return __nvvm_atom_add_gen_d(p, v); }
__device__ inline unsigned long long atomicMin(unsigned long long* p, unsigned long long v) { return __nvvm_atom_min_gen_ull(p, v); }
