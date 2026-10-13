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
 * Cuántas GPU finge: C1EN_SIM_GPUS (por defecto 2, como Kaggle).
 */
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

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

static int num_gpus(void) { const char* s = getenv("C1EN_SIM_GPUS"); return s ? atoi(s) : 2; }

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
CUresult cuCtxSynchronize(void) { return ctx_actual < 0 ? 201 : 0; }

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
CUresult cuMemFree_v2(CUdeviceptr d) { free((void*)(uintptr_t)d); reservas_vivas--; return 0; }
CUresult cuMemcpyHtoD_v2(CUdeviceptr dst, const void* src, size_t n) { memcpy((void*)(uintptr_t)dst, src, n); return 0; }
CUresult cuMemcpyDtoH_v2(void* dst, CUdeviceptr src, size_t n) { memcpy(dst, (const void*)(uintptr_t)src, n); return 0; }
CUresult cuLaunchKernel(void* f, unsigned int gx, unsigned int gy, unsigned int gz,
                        unsigned int bx, unsigned int by, unsigned int bz, unsigned int shmem,
                        void* stream, void** params, void** extra) {
  (void)stream;
  if (ctx_actual < 0) return 201;
  if (gy != 1 || gz != 1 || by != 1 || bz != 1 || shmem != 0 || extra != NULL) return 1;
  if (bx == 0 || bx > 1024 || gx == 0) return 1;       /* CUDA_ERROR_INVALID_VALUE */
  lanzamientos++;
  ((funcion_falsa*)f)->f(gx, bx, params);
  return 0;
}
CUresult cuGetErrorName(CUresult e, const char** s) {
  switch (e) {
    case 0: *s = "CUDA_SUCCESS"; break;
    case 1: *s = "CUDA_ERROR_INVALID_VALUE"; break;
    case 201: *s = "CUDA_ERROR_INVALID_CONTEXT"; break;
    case 218: *s = "CUDA_ERROR_INVALID_PTX"; break;
    case 500: *s = "CUDA_ERROR_NOT_FOUND"; break;
    default: *s = "CUDA_ERROR_UNKNOWN"; break;
  }
  return 0;
}
/* Solo del simulador, para que las pruebas vean cuántos lanzamientos hubo y
   que no se queda memoria sin liberar. */
long long c1en_sim_lanzamientos(void) { return lanzamientos; }
long long c1en_sim_reservas_vivas(void) { return reservas_vivas; }
