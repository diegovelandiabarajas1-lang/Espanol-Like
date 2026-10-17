#include <cstdio>
#include <vector>
#include <chrono>
static double reloj() { using namespace std::chrono; return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count(); }
long fib(long n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
long criba(long n) {
  std::vector<char> marca(n + 1, 1); marca[0] = 0; marca[1] = 0;
  for (long i = 2; i * i <= n; i++) if (marca[i]) for (long j = i * i; j <= n; j += i) marca[j] = 0;
  long c = 0; for (long k = 0; k <= n; k++) c += marca[k];
  return c;
}
long mandelbrot(int ancho, int alto, int maxIter) {
  long dentro = 0;
  for (int py = 0; py < alto; py++) for (int px = 0; px < ancho; px++) {
    double cr = (double(px) / ancho) * 3.5 - 2.5, ci = (double(py) / alto) * 2.0 - 1.0;
    double zr = 0, zi = 0; int k = 0;
    while (k < maxIter && zr * zr + zi * zi <= 4.0) { double t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; k++; }
    if (k == maxIter) dentro++;
  }
  return dentro;
}
int main() {
  double t0; long r;
  t0 = reloj(); r = fib(30); std::printf("fib(30) = %ld en %.0f ms\n", r, reloj() - t0);
  t0 = reloj(); r = criba(2000000); std::printf("criba(2000000) = %ld en %.0f ms\n", r, reloj() - t0);
  t0 = reloj(); r = mandelbrot(400, 300, 200); std::printf("mandelbrot(400x300x200) = %ld en %.0f ms\n", r, reloj() - t0);
}
