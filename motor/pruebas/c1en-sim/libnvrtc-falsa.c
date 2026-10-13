/* libnvrtc falsa: «compila» el CUDA C de C1EÑ con g++ en vez de con NVRTC.
 *
 * Mismas firmas que libnvrtc.so. nvrtcCompileProgram exige las opciones que
 * C1EÑ promete pasar (--fmad=false y -arch=compute_XX): si un día alguien las
 * quita de c1en-cuda.js, la prueba lo ve. Después escribe el fuente a un
 * archivo y lo compila con
 *     g++ -O2 -ffp-contract=off -std=c++17 -shared -fPIC -DC1EN_EMULAR -include cuda-falsa.h
 * y el «PTX» que devuelve es la cadena "C1EN-SIM:<ruta del .so>", que la
 * libcuda falsa sabe cargar.
 *
 * C1EN_SIM_CABECERA dice dónde está cuda-falsa.h; C1EN_SIM_DIR, dónde dejar
 * los archivos.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct { char* src; char ptx[1024]; char log[4096]; } prog_falso;
static int cuenta = 0;

int nvrtcVersion(int* mayor, int* menor) { *mayor = 12; *menor = 4; return 0; }
const char* nvrtcGetErrorString(int r) {
  switch (r) {
    case 0: return "NVRTC_SUCCESS";
    case 3: return "NVRTC_ERROR_INVALID_INPUT";
    case 5: return "NVRTC_ERROR_INVALID_OPTION";
    case 6: return "NVRTC_ERROR_COMPILATION";
    default: return "NVRTC_ERROR_INTERNAL_ERROR";
  }
}
int nvrtcCreateProgram(void** prog, const char* src, const char* name, int nh, const char* const* h, const char* const* hn) {
  (void)name; (void)h; (void)hn;
  if (!src || nh != 0) return 3;
  prog_falso* p = (prog_falso*)calloc(1, sizeof *p);
  p->src = strdup(src);
  *prog = p;
  return 0;
}
int nvrtcCompileProgram(void* prog, int n, const char* const* opts) {
  prog_falso* p = (prog_falso*)prog;
  int fmad = 0, arch = 0;
  for (int i = 0; i < n; i++) {
    if (strcmp(opts[i], "--fmad=false") == 0) fmad = 1;
    if (strncmp(opts[i], "-arch=compute_", 14) == 0) arch = 1;
    if (strstr(opts[i], "fast-math") || strcmp(opts[i], "--fmad=true") == 0) {
      snprintf(p->log, sizeof p->log, "opción prohibida por C1EÑ: %s", opts[i]);
      return 5;
    }
  }
  if (!fmad || !arch) {
    snprintf(p->log, sizeof p->log, "faltan --fmad=false o -arch=compute_XX");
    return 5;
  }
  const char* dir = getenv("C1EN_SIM_DIR") ? getenv("C1EN_SIM_DIR") : "/tmp";
  const char* cab = getenv("C1EN_SIM_CABECERA");
  if (!cab) { snprintf(p->log, sizeof p->log, "falta C1EN_SIM_CABECERA"); return 7; }
  char cu[700], so[700], orden[3000], errf[700];
  /* Caché por huella del fuente (FNV-1a de 64 bits): el fuzz compila cientos
     de núcleos, y la segunda vez que se pasan las pruebas ya están hechos. */
  unsigned long long h = 0xcbf29ce484222325ULL;
  for (const char* c = p->src; *c; c++) { h ^= (unsigned char)*c; h *= 0x100000001b3ULL; }
  for (const char* c = cab; *c; c++) { h ^= (unsigned char)*c; h *= 0x100000001b3ULL; }
  snprintf(so, sizeof so, "%s/sim-%016llx.so", dir, h);
  if (access(so, R_OK) == 0) { snprintf(p->ptx, sizeof p->ptx, "C1EN-SIM:%s", so); return 0; }
  int k = cuenta++;
  snprintf(cu, sizeof cu, "%s/sim-%d-%d.cu", dir, (int)getpid(), k);
  snprintf(errf, sizeof errf, "%s/sim-%d-%d.err", dir, (int)getpid(), k);
  char tmp[760];
  snprintf(tmp, sizeof tmp, "%s/sim-%d-%d.tmp.so", dir, (int)getpid(), k);
  FILE* f = fopen(cu, "w");
  if (!f) return 7;
  fputs(p->src, f);
  fclose(f);
  snprintf(orden, sizeof orden,
           "g++ -O2 -ffp-contract=off -fno-fast-math -std=c++17 -Wall -Wno-unused -shared -fPIC -DC1EN_EMULAR "
           "-include '%s' -x c++ '%s' -o '%s' -lm 2> '%s'", cab, cu, tmp, errf);
  if (system(orden) != 0) {
    FILE* e = fopen(errf, "r");
    size_t m = e ? fread(p->log, 1, sizeof p->log - 1, e) : 0;
    p->log[m] = 0;
    if (e) fclose(e);
    return 6;
  }
  rename(tmp, so);
  unlink(cu); unlink(errf);
  snprintf(p->ptx, sizeof p->ptx, "C1EN-SIM:%s", so);
  return 0;
}
int nvrtcGetProgramLogSize(void* prog, size_t* n) { *n = strlen(((prog_falso*)prog)->log) + 1; return 0; }
int nvrtcGetProgramLog(void* prog, char* log) { strcpy(log, ((prog_falso*)prog)->log); return 0; }
int nvrtcGetPTXSize(void* prog, size_t* n) { *n = strlen(((prog_falso*)prog)->ptx) + 1; return 0; }
int nvrtcGetPTX(void* prog, char* ptx) { strcpy(ptx, ((prog_falso*)prog)->ptx); return 0; }
int nvrtcDestroyProgram(void** prog) {
  prog_falso* p = (prog_falso*)*prog;
  if (!p) return 3;
  free(p->src);
  free(p);
  *prog = NULL;
  return 0;
}
