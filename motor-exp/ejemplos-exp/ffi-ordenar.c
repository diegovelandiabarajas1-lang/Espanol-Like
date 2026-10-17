// Compílalo:  gcc -shared -fPIC -O2 -o libordenar.so ffi-ordenar.c
//   (en Windows:  gcc -shared -O2 -o ordenar.dll ffi-ordenar.c)
#ifdef _WIN32
#define EXPORTA __declspec(dllexport)
#else
#define EXPORTA
#endif
// Media y desviación de un arreglo de reales, en una sola pasada.
EXPORTA void estadisticas(const double *a, int n, double *media, double *desv) {
  double s = 0, s2 = 0;
  for (int i = 0; i < n; i++) { s += a[i]; s2 += a[i] * a[i]; }
  *media = s / n; *desv = n > 1 ? __builtin_sqrt((s2 - s * s / n) / (n - 1)) : 0;
}
// Ordena con un criterio que le pasa quien llama.
EXPORTA void ordenar(double *a, int n, int (*antes)(double, double)) {
  for (int i = 1; i < n; i++) { double x = a[i]; int j = i - 1;
    while (j >= 0 && antes(x, a[j])) { a[j + 1] = a[j]; j--; } a[j + 1] = x; }
}
