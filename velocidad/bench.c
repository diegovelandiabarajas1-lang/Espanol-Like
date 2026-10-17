#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static double reloj(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
long fib(long n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
long criba(long n) {
  char *marca = malloc(n + 1); for (long i = 0; i <= n; i++) marca[i] = 1;
  marca[0] = 0; marca[1] = 0;
  for (long i = 2; i * i <= n; i++) if (marca[i]) for (long j = i * i; j <= n; j += i) marca[j] = 0;
  long c = 0; for (long k = 0; k <= n; k++) c += marca[k];
  free(marca); return c;
}
long mandelbrot(int ancho, int alto, int maxIter) {
  long dentro = 0;
  for (int py = 0; py < alto; py++) for (int px = 0; px < ancho; px++) {
    double cr = ((double)px / ancho) * 3.5 - 2.5, ci = ((double)py / alto) * 2.0 - 1.0;
    double zr = 0, zi = 0; int k = 0;
    while (k < maxIter && zr * zr + zi * zi <= 4.0) { double t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; k++; }
    if (k == maxIter) dentro++;
  }
  return dentro;
}
int main(void) {
  double t0; long r;
  t0 = reloj(); r = fib(30); printf("fib(30) = %ld en %.0f ms\n", r, reloj() - t0);
  t0 = reloj(); r = criba(2000000); printf("criba(2000000) = %ld en %.0f ms\n", r, reloj() - t0);
  t0 = reloj(); r = mandelbrot(400, 300, 200); printf("mandelbrot(400x300x200) = %ld en %.0f ms\n", r, reloj() - t0);
  return 0;
}
