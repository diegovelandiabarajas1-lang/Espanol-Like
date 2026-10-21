/* geo.h — la biblioteca de prueba de N4.10 (pruebas/exp-interop.js): lo que trae una cabecera
   de verdad — macros de exportación, extern "C", enum, estructuras anidadas y con arreglos,
   un tipo opaco, un puntero a función, una variádica, una global y una inline. */
#ifndef GEO_H
#define GEO_H
#include <stdint.h>
#ifdef _WIN32
#define GEO_API __declspec(dllexport)
#else
#define GEO_API __attribute__((visibility("default")))
#endif
#define GEO_VERSION 3
#define GEO_MAX (1 << 4)
#define GEO_PI 3.14159
#define GEO_MAS (GEO_MAX - 1)
#define GEO_NOMBRE "geo"
#define CUADRADO(x) ((x) * (x))
#ifdef __cplusplus
extern "C" {
#endif

typedef enum { GEO_ROJO, GEO_VERDE = 5, GEO_AZUL } GeoColor;
typedef struct { double x, y; } GeoPunto;
typedef struct GeoCaja { GeoPunto min; GeoPunto max; int32_t color; double pesos[3]; } GeoCaja;
typedef struct geo_lista geo_lista;
typedef double geo_real;
typedef int (*GeoCmp)(int a, int b);
struct GeoPar { int a; int b; };

GEO_API double geo_hipotenusa(double a, double b);
GEO_API GeoPunto geo_medio(GeoPunto a, GeoPunto b);
GEO_API double geo_area(const GeoCaja *c);
GEO_API void geo_mover(GeoPunto *p, double dx, double dy);
GEO_API int64_t geo_suma(const int32_t *v, int32_t n);
GEO_API const char *geo_nombre(void);
GEO_API geo_lista *geo_lista_nueva(void);
GEO_API void geo_lista_poner(geo_lista *l, geo_real v);
GEO_API double geo_lista_suma(geo_lista *l);
GEO_API void geo_ordenar(int *v, int n, GeoCmp cmp);
GEO_API int geo_printf(const char *fmt, ...);
GEO_API int geo_par(struct GeoPar p);
GEO_API uint8_t geo_u8(uint8_t x);
GEO_API int geo_es_par(int x);
GEO_API int64_t geo_grande(void);
GEO_API double geo_falta(double x);    /* la declara la cabecera y la biblioteca no la trae */
extern int geo_contador;
static inline int geo_doble(int x) { return 2 * x; }

#ifdef __cplusplus
}
#endif
#endif
