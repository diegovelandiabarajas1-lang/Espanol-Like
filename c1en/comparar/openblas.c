/* comparar/openblas.c — las pruebas con C y OpenBLAS (CPU).
 *   gcc -O3 -march=native -fopenmp openblas.c -o openblas -lopenblas -lm && ./openblas [chica]
 * OpenBLAS es una biblioteca de álgebra lineal: hace el producto de matrices
 * (cblas_dgemm). Lo demás (seno, x*2+1, suma, softmax) son bucles de C con
 * OpenMP, que es lo que se escribe en C con OpenBLAS. No trae FFT: esa prueba
 * no está. */
#include <cblas.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static double ahora(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e3 + t.tv_nsec / 1e6; }
#define MEDIR(prueba, tam, CUERPO, HUELLA) do { \
    CUERPO; double mejor = 1e300; \
    for (int k_ = 0; k_ < 3; k_++) { double t0 = ahora(); CUERPO; double t = ahora() - t0; if (t < mejor) mejor = t; } \
    printf("RES,%s,%s,cpu,%.6f,%.17g,f64\n", prueba, tam, mejor, (double)(HUELLA)); fflush(stdout); } while (0)

static double sumar(const double *v, long n) { double s = 0; for (long i = 0; i < n; i++) s += v[i]; return s; }

int main(int argc, char **argv) {
  int chica = argc > 1 && strcmp(argv[1], "chica") == 0;
  int ns[2] = { chica ? 128 : 1024, chica ? 256 : 2048 };
  long nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024;
  char tam[64];
  for (int q = 0; q < 2; q++) {
    int n = ns[q];
    double *A = malloc(sizeof(double) * n * n), *B = malloc(sizeof(double) * n * n), *C = malloc(sizeof(double) * n * n);
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
      A[(long)i * n + j] = ((i * 7 + j * 3) % 13) / 13.0 - 0.5;
      B[(long)i * n + j] = ((i * 5 + j * 11) % 17) / 17.0 - 0.5;
    }
    snprintf(tam, sizeof tam, "%d", n);
    MEDIR("matmul", tam, cblas_dgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans, n, n, n, 1.0, A, n, B, n, 0.0, C, n), sumar(C, (long)n * n));
    free(A); free(B); free(C);
  }
  double *x = malloc(sizeof(double) * nv), *y = malloc(sizeof(double) * nv);
  for (long i = 0; i < nv; i++) x[i] = (i % 1000) / 1000.0;
  snprintf(tam, sizeof tam, "%ld", nv);
  MEDIR("seno", tam, ({ _Pragma("omp parallel for") for (long i = 0; i < nv; i++) y[i] = sin(x[i]); }), sumar(y, nv));
  MEDIR("x*2+1", tam, ({ _Pragma("omp parallel for") for (long i = 0; i < nv; i++) y[i] = x[i] * 2.0 + 1.0; }), sumar(y, nv));
  double s = 0;
  MEDIR("suma", tam, ({ double t_ = 0; _Pragma("omp parallel for reduction(+:t_)") for (long i = 0; i < nv; i++) t_ += x[i]; s = t_; }), s);
  double *S = malloc(sizeof(double) * sm * sk), *Y = malloc(sizeof(double) * sm * sk);
  for (long i = 0; i < sm; i++) for (long j = 0; j < sk; j++) S[i * sk + j] = ((i * 3 + j) % 50) / 10.0;
  snprintf(tam, sizeof tam, "%ldx%ld", sm, sk);
  MEDIR("softmax", tam, ({
    _Pragma("omp parallel for") for (long i = 0; i < sm; i++) {
      const double *f = S + i * sk; double *o = Y + i * sk; double m = f[0];
      for (long j = 1; j < sk; j++) if (f[j] > m) m = f[j];
      double t = 0; for (long j = 0; j < sk; j++) { o[j] = exp(f[j] - m); t += o[j]; }
      for (long j = 0; j < sk; j++) o[j] /= t;
    } }), ({ double q_ = 0; for (long i = 0; i < sm * sk; i++) q_ += Y[i] * Y[i]; q_; }));
  return 0;
}
