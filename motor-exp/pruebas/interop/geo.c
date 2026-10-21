/* geo.c — la biblioteca de prueba de N4.10 (ver geo.h). */
#include "geo.h"
#include <math.h>
#include <stdlib.h>
double geo_hipotenusa(double a, double b) { return sqrt(a*a + b*b); }
GeoPunto geo_medio(GeoPunto a, GeoPunto b) { GeoPunto r = { (a.x+b.x)/2, (a.y+b.y)/2 }; return r; }
double geo_area(const GeoCaja *c) { return (c->max.x - c->min.x) * (c->max.y - c->min.y) * c->pesos[1] + c->color; }
void geo_mover(GeoPunto *p, double dx, double dy) { p->x += dx; p->y += dy; }
int64_t geo_suma(const int32_t *v, int32_t n) { int64_t s = 0; for (int i = 0; i < n; i++) s += v[i]; return s; }
const char *geo_nombre(void) { return "geo ñ"; }
struct geo_lista { double v[100]; int n; };
geo_lista *geo_lista_nueva(void) { geo_lista *l = calloc(1, sizeof *l); return l; }
void geo_lista_poner(geo_lista *l, geo_real v) { l->v[l->n++] = v; }
double geo_lista_suma(geo_lista *l) { double s = 0; for (int i = 0; i < l->n; i++) s += l->v[i]; return s; }
void geo_ordenar(int *v, int n, GeoCmp cmp) { for (int i=0;i<n;i++) for (int j=i+1;j<n;j++) if (cmp(v[i], v[j]) > 0) { int t=v[i]; v[i]=v[j]; v[j]=t; } }
int geo_printf(const char *fmt, ...) { return 0; }
int geo_par(struct GeoPar p) { return p.a * 10 + p.b; }
int geo_contador = 0;
uint8_t geo_u8(uint8_t x) { return (uint8_t)(x + 1); }
int geo_es_par(int x) { return x % 2 == 0; }
int64_t geo_grande(void) { return (int64_t)1 << 60; }
