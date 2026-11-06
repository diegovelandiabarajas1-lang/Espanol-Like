/* bench100.c — generado por gen100/gen.js: no editar a mano. gcc -O2. Uso: bench100 [nombre] */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
typedef struct Nodo { long long v, w; struct Nodo *i, *d; } Nodo;
static Nodo* nuevo_nodo(long long v, long long w, Nodo* i, Nodo* d) { Nodo* n = (Nodo*)malloc(sizeof(Nodo)); n->v = v; n->w = w; n->i = i; n->d = d; return n; }
static double reloj(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
static long long reloj_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (long long)t.tv_sec * 1000000LL + t.tv_nsec / 1000; }
static Nodo* a01_arbol_masivo_construir(long long d);
static long long a01_arbol_masivo_suma(Nodo* n);
static void a01_arbol_masivo_soltar(Nodo* n);
static long long a01_arbol_masivo_run(void);
static Nodo* a02_ciclos_anillo(long long n);
static long long a02_ciclos_suma(Nodo* h, long long n);
static void a02_ciclos_libera(Nodo* h, long long n);
static long long a02_ciclos_run(void);
static long long a03_grafo_social_lcg(long long x);
static long long a03_grafo_social_run(void);
static long long a04_vida_corta_run(void);
static long long a05_vida_larga_run(void);
static long long a06_asignar_soltar_run(void);
static Nodo* a07_listas_anidadas_fila(long long n, long long base);
static void a07_listas_anidadas_suelta(Nodo* h);
static long long a07_listas_anidadas_suma(Nodo* h);
static long long a07_listas_anidadas_run(void);
static long long a08_cache_desalojo_lcg(long long x);
static long long a08_cache_desalojo_run(void);
static long long a10_persistente_run(void);
static long long a13_matriz_dispersa_lcg(long long x);
static long long a13_matriz_dispersa_run(void);
static long long a14_churn_puro_run(void);
static Nodo* a15_ast_compilador_construir(long long d, long long s);
static long long a15_ast_compilador_evalua(Nodo* n);
static void a15_ast_compilador_soltar(Nodo* n);
static long long a15_ast_compilador_run(void);
static void a18_heap_suelta(Nodo* h);
static long long a18_heap_run(void);
static long long a18_arena_run(void);
static void a20_soltar_heap_suelta(Nodo* h);
static long long a20_soltar_heap_run(void);
static long long b21_fib36_fib(long long n);
static long long b21_fib36_run(void);
static long long b22_ackermann_6_ack(long long m, long long n);
static long long b22_ackermann_6_run(void);
static long long b22_ackermann_8_ack(long long m, long long n);
static long long b22_ackermann_8_run(void);
static long long b23_hanoi27_mueve(long long n, long long a);
static long long b23_hanoi27_run(void);
static Nodo* b24_arbol_perfecto_construir(long long d);
static long long b24_arbol_perfecto_suma(Nodo* n);
static void b24_arbol_perfecto_soltar(Nodo* n);
static long long b24_arbol_perfecto_run(void);
static long long b25_quicksort_ordenado_part(long long* a, long long lo, long long hi);
static void b25_quicksort_ordenado_qs(long long* a, long long lo, long long hi);
static long long b25_quicksort_ordenado_run(void);
static long long b26_recursion_mutua_par(long long n);
static long long b26_recursion_mutua_impar(long long n);
static long long b26_recursion_mutua_run(void);
static long long b27_nreinas_pon(long long f, long long n, long long* cols, long long* d1, long long* d2);
static long long b27_nreinas_run(void);
static long long b28_acumulador_suma(long long n, long long acc);
static long long b28_acumulador_run(void);
static long long b30_lista_recursiva_largo(Nodo* n);
static void b30_lista_recursiva_suelta(Nodo* h);
static long long b30_lista_recursiva_run(void);
static long long b31_fib_recursivo30_fib(long long n);
static long long b31_fib_recursivo30_run(void);
static long long b31_fib_iterativo_fib(long long n);
static long long b31_fib_iterativo_run(void);
static long long b32_muchas_locales_f(long long n, long long a);
static long long b32_muchas_locales_run(void);
static long long* b33_retorna_estructuras_gen(long long d);
static long long b33_retorna_estructuras_run(void);
static void b35_descenso_recursivo_gen(long long* t, long long* p, long long d, long long s);
static long long b35_descenso_recursivo_factor(long long* t, long long* p);
static long long b35_descenso_recursivo_term(long long* t, long long* p);
static long long b35_descenso_recursivo_expr(long long* t, long long* p);
static long long b35_descenso_recursivo_run(void);
static long long b37_catalan_cat(long long n);
static long long b37_catalan_run(void);
static long long b38_catalan_memo_cat(long long n, long long* m);
static long long b38_catalan_memo_run(void);
static long long b39_dfs_profundo_dfs(long long u, long long n, long long* vis);
static long long b39_dfs_profundo_run(void);
static long long b39_dfs_cadena_larga_dfs(long long u, long long n, long long* vis);
static long long b39_dfs_cadena_larga_run(void);
static long long b40_sobrecoste_llamada_f1(long long x);
static long long b40_sobrecoste_llamada_f2(long long x);
static long long b40_sobrecoste_llamada_f3(long long x);
static long long b40_sobrecoste_llamada_run(void);
static long long c41_matmul500_run(void);
static long long c42_lcs6000_lcg(long long x);
static long long c42_lcs6000_run(void);
static long long c43_editdist5000_lcg(long long x);
static long long c43_editdist5000_run(void);
static long long c44_floyd400_lcg(long long x);
static long long c44_floyd400_run(void);
static long long c45_mochila3000_lcg(long long x);
static long long c45_mochila3000_run(void);
static long long c46_columnas_run(void);
static long long c47_acceso_aleatorio_lcg(long long x);
static long long c47_acceso_aleatorio_run(void);
static long long c48_busqueda_binaria_lcg(long long x);
static long long c48_busqueda_binaria_run(void);
static long long c49_ventana_run(void);
static long long c50_spmv_lcg(long long x);
static long long c50_spmv_run(void);
static long long c51_aos_run(void);
static long long c51_soa_run(void);
static long long c52_indices_calculados_run(void);
static long long c53_sin_comprobar_a_run(void);
static long long c53_sin_comprobar_b_lcg(long long x);
static long long c53_sin_comprobar_b_run(void);
static long long c55_aritmetica_saturada_run(void);
static long long c56_div_mod_run(void);
static long long c57_conversiones_run(void);
static long long c59_criba10M_run(void);
static long long c60_alias_run(void);
static long long e76_directo_run(void);
static long long e76_inverso_run(void);
static long long e77_matmul_bloques_run(void);
static void e78_lista_nodos_suelta(Nodo* h);
static long long e78_lista_nodos_run(void);
static long long e78_array_run(void);
static long long e80_hash_colisiones_lcg(long long x);
static long long e80_hash_colisiones_run(void);
static long long e81_copia_memoria_run(void);
static long long e82_pointer_chasing_lcg(long long x);
static long long e82_pointer_chasing_run(void);
static long long e82_pointer_chasing_nodos_lcg(long long x);
static long long e82_pointer_chasing_nodos_run(void);
static long long e85_primer_acceso_run(void);
static Nodo* a01_arbol_masivo_construir(long long d) {
  if ((d == 0LL)) {
    return NULL;
  }
  return nuevo_nodo(d, 0LL, a01_arbol_masivo_construir((d - 1LL)), a01_arbol_masivo_construir((d - 1LL)));
}
static long long a01_arbol_masivo_suma(Nodo* n) {
  if ((n == NULL)) {
    return 0LL;
  }
  return (((n)->v + a01_arbol_masivo_suma((n)->i)) + a01_arbol_masivo_suma((n)->d));
}
static void a01_arbol_masivo_soltar(Nodo* n) {
  if ((n == NULL)) {
    return;
  }
  a01_arbol_masivo_soltar((n)->i);
  a01_arbol_masivo_soltar((n)->d);
  free((void*)(n));
}
static long long a01_arbol_masivo_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 3LL; r++) {
    Nodo* a = a01_arbol_masivo_construir(20LL);
    t = (t + a01_arbol_masivo_suma(a));
    a01_arbol_masivo_soltar(a);
  }
  return t;
}
static Nodo* a02_ciclos_anillo(long long n) {
  Nodo* h = nuevo_nodo(0LL, 0LL, NULL, NULL);
  Nodo* c = h;
  for (long long k = 1LL; k < n; k++) {
    Nodo* x = nuevo_nodo(k, 0LL, NULL, NULL);
    (c)->i = x;
    c = x;
  }
  (c)->i = h;
  return h;
}
static long long a02_ciclos_suma(Nodo* h, long long n) {
  long long s = 0LL;
  Nodo* c = h;
  for (long long k = 0LL; k < n; k++) {
    s = (s + (c)->v);
    c = (c)->i;
  }
  return s;
}
static void a02_ciclos_libera(Nodo* h, long long n) {
  Nodo* c = h;
  for (long long k = 0LL; k < n; k++) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long a02_ciclos_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 60LL; r++) {
    Nodo* h = a02_ciclos_anillo(50000LL);
    t = (t + a02_ciclos_suma(h, 50000LL));
    a02_ciclos_libera(h, 50000LL);
  }
  return t;
}
static long long a03_grafo_social_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long a03_grafo_social_run(void) {
  long long n = 100000LL;
  long long m = 600000LL;
  Nodo** ady = ((Nodo**)calloc((size_t)(n), 8));
  long long x = 12345LL;
  for (long long e = 0LL; e < m; e++) {
    x = a03_grafo_social_lcg(x);
    long long a = (x % n);
    x = a03_grafo_social_lcg(x);
    long long b = (x % n);
    ady[a] = nuevo_nodo(b, 0LL, ady[a], NULL);
    ady[b] = nuevo_nodo(a, 0LL, ady[b], NULL);
  }
  long long* vis = ((long long*)calloc((size_t)(n), 8));
  long long* cola = ((long long*)calloc((size_t)(n), 8));
  long long h = 0LL;
  long long t = 1LL;
  cola[0LL] = 0LL;
  vis[0LL] = 1LL;
  long long suma = 0LL;
  while ((h < t)) {
    long long u = cola[h];
    h = (h + 1LL);
    suma = (suma + u);
    Nodo* ed = ady[u];
    while ((ed != NULL)) {
      long long w = (ed)->v;
      if ((vis[w] == 0LL)) {
        vis[w] = 1LL;
        cola[t] = w;
        t = (t + 1LL);
      }
      ed = (ed)->i;
    }
  }
  for (long long u = 0LL; u < n; u++) {
    Nodo* ed2 = ady[u];
    while ((ed2 != NULL)) {
      Nodo* sig = (ed2)->i;
      free((void*)(ed2));
      ed2 = sig;
    }
  }
  return (((suma % 1000003LL) * 1000LL) + (t % 1000LL));
}
static long long a04_vida_corta_run(void) {
  long long s = 0LL;
  for (long long i = 0LL; i < 20000000LL; i++) {
    Nodo* ob = nuevo_nodo(i, 0LL, NULL, NULL);
    s = (s + ((ob)->v % 7LL));
    free((void*)(ob));
  }
  return s;
}
static long long a05_vida_larga_run(void) {
  long long n = 1000000LL;
  Nodo** g = ((Nodo**)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    g[i] = nuevo_nodo(i, 0LL, NULL, NULL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 2000000LL; r++) {
    Nodo* ob = nuevo_nodo(r, 0LL, g[(r % n)], NULL);
    s = (s + (((ob)->i)->v % 5LL));
    free((void*)(ob));
  }
  for (long long i = 0LL; i < n; i++) {
    s = (s + ((g[i])->v % 3LL));
    free((void*)(g[i]));
  }
  return s;
}
static long long a06_asignar_soltar_run(void) {
  long long* a = ((long long*)calloc((size_t)(2000LL), 8));
  long long s = 0LL;
  for (long long i = 0LL; i < 150000LL; i++) {
    free((void*)(a));
    a = ((long long*)calloc((size_t)(2000LL), 8));
    a[(i % 2000LL)] = i;
    s = (s + a[((i * 7LL) % 2000LL)]);
  }
  free((void*)(a));
  return s;
}
static Nodo* a07_listas_anidadas_fila(long long n, long long base) {
  Nodo* h = NULL;
  for (long long k = 0LL; k < n; k++) {
    h = nuevo_nodo((base + k), 0LL, h, NULL);
  }
  return h;
}
static void a07_listas_anidadas_suelta(Nodo* h) {
  Nodo* c = h;
  while ((c != NULL)) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long a07_listas_anidadas_suma(Nodo* h) {
  long long s = 0LL;
  Nodo* c = h;
  while ((c != NULL)) {
    s = (s + ((c)->v % 11LL));
    c = (c)->i;
  }
  return s;
}
static long long a07_listas_anidadas_run(void) {
  Nodo** filas = ((Nodo**)calloc((size_t)(500LL), 8));
  long long t = 0LL;
  for (long long r = 0LL; r < 4000LL; r++) {
    long long j = (r % 500LL);
    a07_listas_anidadas_suelta(filas[j]);
    filas[j] = a07_listas_anidadas_fila(500LL, r);
    t = (t + a07_listas_anidadas_suma(filas[j]));
  }
  for (long long j = 0LL; j < 500LL; j++) {
    a07_listas_anidadas_suelta(filas[j]);
  }
  return t;
}
static long long a08_cache_desalojo_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long a08_cache_desalojo_run(void) {
  long long tam = 50000LL;
  Nodo** c = ((Nodo**)calloc((size_t)(tam), 8));
  long long x = 777LL;
  long long ac = 0LL;
  for (long long op = 0LL; op < 3000000LL; op++) {
    x = a08_cache_desalojo_lcg(x);
    long long k = (x % 200000LL);
    long long slot = (k % tam);
    Nodo* e = c[slot];
    if (((e != NULL) && ((e)->v == k))) {
      ac = (ac + 1LL);
    } else {
      if ((e != NULL)) {
        free((void*)(e));
      }
      c[slot] = nuevo_nodo(k, 0LL, NULL, NULL);
    }
  }
  return ac;
}
static long long a10_persistente_run(void) {
  long long n = 1500000LL;
  Nodo** vers = ((Nodo**)calloc((size_t)(800LL), 8));
  Nodo* cur = NULL;
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    cur = nuevo_nodo(i, 0LL, cur, NULL);
    if (((i % 2000LL) == 0LL)) {
      vers[((i) / (2000LL))] = cur;
    }
  }
  for (long long k = 0LL; k < 200LL; k++) {
    Nodo* c = vers[k];
    long long m = 0LL;
    while (((c != NULL) && (m < 200LL))) {
      s = (s + ((c)->v % 3LL));
      c = (c)->i;
      m = (m + 1LL);
    }
  }
  return s;
}
static long long a13_matriz_dispersa_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long a13_matriz_dispersa_run(void) {
  long long n = 20000LL;
  Nodo** filas = ((Nodo**)calloc((size_t)(n), 8));
  long long x = 99LL;
  for (long long r = 0LL; r < n; r++) {
    for (long long k = 0LL; k < 20LL; k++) {
      x = a13_matriz_dispersa_lcg(x);
      filas[r] = nuevo_nodo((x % n), (x % 100LL), filas[r], NULL);
    }
  }
  long long* vec = ((long long*)calloc((size_t)(n), 8));
  for (long long j = 0LL; j < n; j++) {
    vec[j] = (j % 13LL);
  }
  long long t = 0LL;
  for (long long rep = 0LL; rep < 10LL; rep++) {
    for (long long r = 0LL; r < n; r++) {
      Nodo* c = filas[r];
      long long s = 0LL;
      while ((c != NULL)) {
        s = (s + ((c)->w * vec[(c)->v]));
        c = (c)->i;
      }
      t = (t + (s % 1000LL));
    }
  }
  for (long long r = 0LL; r < n; r++) {
    Nodo* c2 = filas[r];
    while ((c2 != NULL)) {
      Nodo* sig = (c2)->i;
      free((void*)(c2));
      c2 = sig;
    }
  }
  return t;
}
static long long a14_churn_puro_run(void) {
  long long s = 0LL;
  for (long long i = 0LL; i < 20000000LL; i++) {
    Nodo* a = nuevo_nodo(i, 0LL, NULL, NULL);
    Nodo* b = nuevo_nodo((i + 1LL), 0LL, a, NULL);
    Nodo* c = nuevo_nodo((i + 2LL), 0LL, b, NULL);
    s = (s + ((((c)->i)->i)->v % 5LL));
    free((void*)(a));
    free((void*)(b));
    free((void*)(c));
  }
  return s;
}
static Nodo* a15_ast_compilador_construir(long long d, long long s) {
  if ((d == 0LL)) {
    return nuevo_nodo(0LL, (s % 10LL), NULL, NULL);
  }
  return nuevo_nodo((1LL + (s % 3LL)), 0LL, a15_ast_compilador_construir((d - 1LL), (((s * 7LL) + 1LL) % 1000003LL)), a15_ast_compilador_construir((d - 1LL), (((s * 13LL) + 5LL) % 1000003LL)));
}
static long long a15_ast_compilador_evalua(Nodo* n) {
  if (((n)->v == 0LL)) {
    return (n)->w;
  }
  long long a = a15_ast_compilador_evalua((n)->i);
  long long b = a15_ast_compilador_evalua((n)->d);
  if (((n)->v == 1LL)) {
    return ((a + b) % 1000003LL);
  }
  if (((n)->v == 2LL)) {
    return ((a * b) % 1000003LL);
  }
  return (((a + 1000003LL) - b) % 1000003LL);
}
static void a15_ast_compilador_soltar(Nodo* n) {
  if ((n == NULL)) {
    return;
  }
  a15_ast_compilador_soltar((n)->i);
  a15_ast_compilador_soltar((n)->d);
  free((void*)(n));
}
static long long a15_ast_compilador_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 5LL; r++) {
    Nodo* a = a15_ast_compilador_construir(17LL, (r + 1LL));
    t = (t + a15_ast_compilador_evalua(a));
    a15_ast_compilador_soltar(a);
  }
  return t;
}
static void a18_heap_suelta(Nodo* h) {
  Nodo* c = h;
  while ((c != NULL)) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long a18_heap_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 2LL; r++) {
    Nodo* h = NULL;
    for (long long i = 0LL; i < 3000000LL; i++) {
      h = nuevo_nodo(i, 0LL, h, NULL);
    }
    Nodo* c = h;
    while ((c != NULL)) {
      t = (t + ((c)->v % 3LL));
      c = (c)->i;
    }
    a18_heap_suelta(h);
  }
  return t;
}
static long long a18_arena_run(void) {
  long long n = 3000000LL;
  long long* val = ((long long*)calloc((size_t)(n), 8));
  long long* nxt = ((long long*)calloc((size_t)(n), 8));
  long long t = 0LL;
  for (long long r = 0LL; r < 2LL; r++) {
    long long h = (0LL - 1LL);
    for (long long i = 0LL; i < n; i++) {
      val[i] = i;
      nxt[i] = h;
      h = i;
    }
    long long c = h;
    while ((c >= 0LL)) {
      t = (t + (val[c] % 3LL));
      c = nxt[c];
    }
  }
  return t;
}
static void a20_soltar_heap_suelta(Nodo* h) {
  Nodo* c = h;
  while ((c != NULL)) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long a20_soltar_heap_run(void) {
  Nodo* h = NULL;
  for (long long i = 0LL; i < 300000LL; i++) {
    h = nuevo_nodo(i, 0LL, h, NULL);
  }
  long long t0 = reloj_us();
  a20_soltar_heap_suelta(h);
  h = NULL;
  return (reloj_us() - t0);
}
static long long b21_fib36_fib(long long n) {
  if ((n < 2LL)) {
    return n;
  }
  return (b21_fib36_fib((n - 1LL)) + b21_fib36_fib((n - 2LL)));
}
static long long b21_fib36_run(void) {
  return b21_fib36_fib(36LL);
}
static long long b22_ackermann_6_ack(long long m, long long n) {
  if ((m == 0LL)) {
    return (n + 1LL);
  }
  if ((n == 0LL)) {
    return b22_ackermann_6_ack((m - 1LL), 1LL);
  }
  return b22_ackermann_6_ack((m - 1LL), b22_ackermann_6_ack(m, (n - 1LL)));
}
static long long b22_ackermann_6_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 300LL; r++) {
    t = (t + b22_ackermann_6_ack(3LL, 6LL));
  }
  return t;
}
static long long b22_ackermann_8_ack(long long m, long long n) {
  if ((m == 0LL)) {
    return (n + 1LL);
  }
  if ((n == 0LL)) {
    return b22_ackermann_8_ack((m - 1LL), 1LL);
  }
  return b22_ackermann_8_ack((m - 1LL), b22_ackermann_8_ack(m, (n - 1LL)));
}
static long long b22_ackermann_8_run(void) {
  return b22_ackermann_8_ack(3LL, 8LL);
}
static long long b23_hanoi27_mueve(long long n, long long a) {
  if ((n == 0LL)) {
    return (a % 2LL);
  }
  return ((b23_hanoi27_mueve((n - 1LL), (a + 1LL)) + b23_hanoi27_mueve((n - 1LL), (a + 2LL))) + 1LL);
}
static long long b23_hanoi27_run(void) {
  return b23_hanoi27_mueve(27LL, 0LL);
}
static Nodo* b24_arbol_perfecto_construir(long long d) {
  if ((d == 0LL)) {
    return NULL;
  }
  return nuevo_nodo(d, 0LL, b24_arbol_perfecto_construir((d - 1LL)), b24_arbol_perfecto_construir((d - 1LL)));
}
static long long b24_arbol_perfecto_suma(Nodo* n) {
  if ((n == NULL)) {
    return 0LL;
  }
  return (((n)->v + b24_arbol_perfecto_suma((n)->i)) + b24_arbol_perfecto_suma((n)->d));
}
static void b24_arbol_perfecto_soltar(Nodo* n) {
  if ((n == NULL)) {
    return;
  }
  b24_arbol_perfecto_soltar((n)->i);
  b24_arbol_perfecto_soltar((n)->d);
  free((void*)(n));
}
static long long b24_arbol_perfecto_run(void) {
  Nodo* a = b24_arbol_perfecto_construir(18LL);
  long long t = 0LL;
  for (long long r = 0LL; r < 40LL; r++) {
    t = (t + b24_arbol_perfecto_suma(a));
  }
  b24_arbol_perfecto_soltar(a);
  return t;
}
static long long b25_quicksort_ordenado_part(long long* a, long long lo, long long hi) {
  long long p = a[hi];
  long long i = lo;
  for (long long j = lo; j < hi; j++) {
    if ((a[j] < p)) {
      long long t = a[i];
      a[i] = a[j];
      a[j] = t;
      i = (i + 1LL);
    }
  }
  long long t2 = a[i];
  a[i] = a[hi];
  a[hi] = t2;
  return i;
}
static void b25_quicksort_ordenado_qs(long long* a, long long lo, long long hi) {
  if ((lo < hi)) {
    long long p = b25_quicksort_ordenado_part(a, lo, hi);
    b25_quicksort_ordenado_qs(a, lo, (p - 1LL));
    b25_quicksort_ordenado_qs(a, (p + 1LL), hi);
  }
}
static long long b25_quicksort_ordenado_run(void) {
  long long n = 5000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = i;
  }
  b25_quicksort_ordenado_qs(a, 0LL, (n - 1LL));
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + (a[i] * (i % 7LL)));
  }
  return s;
}
static long long b26_recursion_mutua_par(long long n) {
  if ((n == 0LL)) {
    return 1LL;
  }
  return b26_recursion_mutua_impar((n - 1LL));
}
static long long b26_recursion_mutua_impar(long long n) {
  if ((n == 0LL)) {
    return 0LL;
  }
  return b26_recursion_mutua_par((n - 1LL));
}
static long long b26_recursion_mutua_run(void) {
  long long s = 0LL;
  for (long long r = 0LL; r < 300000LL; r++) {
    s = (s + b26_recursion_mutua_par((700LL + (r % 2LL))));
  }
  return s;
}
static long long b27_nreinas_pon(long long f, long long n, long long* cols, long long* d1, long long* d2) {
  if ((f == n)) {
    return 1LL;
  }
  long long c = 0LL;
  for (long long k = 0LL; k < n; k++) {
    if ((((cols[k] == 0LL) && (d1[(f + k)] == 0LL)) && (d2[((f + n) - k)] == 0LL))) {
      cols[k] = 1LL;
      d1[(f + k)] = 1LL;
      d2[((f + n) - k)] = 1LL;
      c = (c + b27_nreinas_pon((f + 1LL), n, cols, d1, d2));
      cols[k] = 0LL;
      d1[(f + k)] = 0LL;
      d2[((f + n) - k)] = 0LL;
    }
  }
  return c;
}
static long long b27_nreinas_run(void) {
  long long n = 11LL;
  return b27_nreinas_pon(0LL, n, ((long long*)calloc((size_t)(n), 8)), ((long long*)calloc((size_t)((2LL * n)), 8)), ((long long*)calloc((size_t)(((2LL * n) + 1LL)), 8)));
}
static long long b28_acumulador_suma(long long n, long long acc) {
  if ((n == 0LL)) {
    return acc;
  }
  return b28_acumulador_suma((n - 1LL), (acc + n));
}
static long long b28_acumulador_run(void) {
  long long s = 0LL;
  for (long long r = 0LL; r < 50000LL; r++) {
    s = (s + (b28_acumulador_suma(800LL, r) % 1000LL));
  }
  return s;
}
static long long b30_lista_recursiva_largo(Nodo* n) {
  if ((n == NULL)) {
    return 0LL;
  }
  return (1LL + b30_lista_recursiva_largo((n)->i));
}
static void b30_lista_recursiva_suelta(Nodo* h) {
  Nodo* c = h;
  while ((c != NULL)) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long b30_lista_recursiva_run(void) {
  Nodo* h = NULL;
  for (long long i = 0LL; i < 100000LL; i++) {
    h = nuevo_nodo(i, 0LL, h, NULL);
  }
  long long t = b30_lista_recursiva_largo(h);
  b30_lista_recursiva_suelta(h);
  return t;
}
static long long b31_fib_recursivo30_fib(long long n) {
  if ((n < 2LL)) {
    return n;
  }
  return (b31_fib_recursivo30_fib((n - 1LL)) + b31_fib_recursivo30_fib((n - 2LL)));
}
static long long b31_fib_recursivo30_run(void) {
  long long s = 0LL;
  for (long long r = 0LL; r < 30LL; r++) {
    s = (s + (b31_fib_recursivo30_fib(30LL) % 1000LL));
  }
  return s;
}
static long long b31_fib_iterativo_fib(long long n) {
  long long a = 0LL;
  long long b = 1LL;
  for (long long i = 0LL; i < n; i++) {
    long long t = ((a + b) % 1000003LL);
    a = b;
    b = t;
  }
  return a;
}
static long long b31_fib_iterativo_run(void) {
  long long s = 0LL;
  for (long long r = 0LL; r < 600000LL; r++) {
    s = (s + (b31_fib_iterativo_fib(30LL) % 1000LL));
  }
  return s;
}
static long long b32_muchas_locales_f(long long n, long long a) {
  if ((n == 0LL)) {
    return a;
  }
  long long b1 = (a + 1LL);
  long long b2 = ((b1 * 3LL) % 1009LL);
  long long b3 = (b2 + b1);
  long long b4 = ((b3 * 5LL) % 1013LL);
  long long b5 = (b4 + b2);
  long long b6 = ((b5 * 7LL) % 1019LL);
  long long b7 = (b6 + b3);
  long long b8 = ((b7 * 11LL) % 1021LL);
  long long b9 = (b8 + b5);
  long long b10 = ((b9 * 13LL) % 1031LL);
  return ((b32_muchas_locales_f((n - 1LL), b10) + b32_muchas_locales_f((n - 1LL), (b7 + b4))) % 1000003LL);
}
static long long b32_muchas_locales_run(void) {
  return b32_muchas_locales_f(22LL, 5LL);
}
static long long* b33_retorna_estructuras_gen(long long d) {
  if ((d == 0LL)) {
    long long* a = ((long long*)calloc((size_t)(8LL), 8));
    for (long long k = 0LL; k < 8LL; k++) {
      a[k] = (k + 1LL);
    }
    return a;
  }
  long long* x = b33_retorna_estructuras_gen((d - 1LL));
  long long* ys = b33_retorna_estructuras_gen((d - 1LL));
  long long* r = ((long long*)calloc((size_t)(8LL), 8));
  for (long long k = 0LL; k < 8LL; k++) {
    r[k] = ((x[k] + ys[((k + 1LL) % 8LL)]) % 1000003LL);
  }
  free((void*)(x));
  free((void*)(ys));
  return r;
}
static long long b33_retorna_estructuras_run(void) {
  long long* a = b33_retorna_estructuras_gen(21LL);
  long long s = 0LL;
  for (long long k = 0LL; k < 8LL; k++) {
    s = (s + a[k]);
  }
  return s;
}
static void b35_descenso_recursivo_gen(long long* t, long long* p, long long d, long long s) {
  if ((d == 0LL)) {
    t[p[0LL]] = ((s % 9LL) + 1LL);
    p[0LL] = (p[0LL] + 1LL);
    return;
  }
  if (((s % 3LL) == 0LL)) {
    t[p[0LL]] = (0LL - 1LL);
    p[0LL] = (p[0LL] + 1LL);
    b35_descenso_recursivo_gen(t, p, (d - 1LL), (((s * 7LL) + 1LL) % 10007LL));
    t[p[0LL]] = (0LL - 2LL);
    p[0LL] = (p[0LL] + 1LL);
    return;
  }
  b35_descenso_recursivo_gen(t, p, (d - 1LL), (((s * 13LL) + 5LL) % 10007LL));
  if (((s % 2LL) == 0LL)) {
    t[p[0LL]] = (0LL - 3LL);
  } else {
    t[p[0LL]] = (0LL - 4LL);
  }
  p[0LL] = (p[0LL] + 1LL);
  b35_descenso_recursivo_gen(t, p, (d - 1LL), (((s * 11LL) + 3LL) % 10007LL));
}
static long long b35_descenso_recursivo_factor(long long* t, long long* p) {
  long long k = t[p[0LL]];
  if ((k == (0LL - 1LL))) {
    p[0LL] = (p[0LL] + 1LL);
    long long v = b35_descenso_recursivo_expr(t, p);
    p[0LL] = (p[0LL] + 1LL);
    return v;
  }
  p[0LL] = (p[0LL] + 1LL);
  return k;
}
static long long b35_descenso_recursivo_term(long long* t, long long* p) {
  long long v = b35_descenso_recursivo_factor(t, p);
  while ((t[p[0LL]] == (0LL - 4LL))) {
    p[0LL] = (p[0LL] + 1LL);
    v = ((v * b35_descenso_recursivo_factor(t, p)) % 1000003LL);
  }
  return v;
}
static long long b35_descenso_recursivo_expr(long long* t, long long* p) {
  long long v = b35_descenso_recursivo_term(t, p);
  while ((t[p[0LL]] == (0LL - 3LL))) {
    p[0LL] = (p[0LL] + 1LL);
    v = ((v + b35_descenso_recursivo_term(t, p)) % 1000003LL);
  }
  return v;
}
static long long b35_descenso_recursivo_run(void) {
  long long* t = ((long long*)calloc((size_t)(1000000LL), 8));
  long long* p = ((long long*)calloc((size_t)(1LL), 8));
  b35_descenso_recursivo_gen(t, p, 15LL, 5LL);
  t[p[0LL]] = (0LL - 9LL);
  long long s = 0LL;
  for (long long r = 0LL; r < 20LL; r++) {
    p[0LL] = 0LL;
    s = (s + b35_descenso_recursivo_expr(t, p));
  }
  return (s + p[0LL]);
}
static long long b37_catalan_cat(long long n) {
  if ((n <= 1LL)) {
    return 1LL;
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + (b37_catalan_cat(i) * b37_catalan_cat(((n - 1LL) - i))));
  }
  return s;
}
static long long b37_catalan_run(void) {
  return b37_catalan_cat(15LL);
}
static long long b38_catalan_memo_cat(long long n, long long* m) {
  if ((n <= 1LL)) {
    return 1LL;
  }
  if ((m[n] != 0LL)) {
    return m[n];
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = ((s + (b38_catalan_memo_cat(i, m) * b38_catalan_memo_cat(((n - 1LL) - i), m))) % 1000003LL);
  }
  m[n] = (s + 1LL);
  return m[n];
}
static long long b38_catalan_memo_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 100LL; r++) {
    long long* m = ((long long*)calloc((size_t)(701LL), 8));
    t = (t + (b38_catalan_memo_cat(700LL, m) % 1000LL));
  }
  return t;
}
static long long b39_dfs_profundo_dfs(long long u, long long n, long long* vis) {
  vis[u] = 1LL;
  long long s = u;
  if ((((u + 1LL) < n) && (vis[(u + 1LL)] == 0LL))) {
    s = (s + b39_dfs_profundo_dfs((u + 1LL), n, vis));
  }
  return (s % 1000003LL);
}
static long long b39_dfs_profundo_run(void) {
  long long t = 0LL;
  for (long long r = 0LL; r < 3000LL; r++) {
    long long* vis = ((long long*)calloc((size_t)(800LL), 8));
    t = (t + b39_dfs_profundo_dfs(0LL, 800LL, vis));
  }
  return t;
}
static long long b39_dfs_cadena_larga_dfs(long long u, long long n, long long* vis) {
  vis[u] = 1LL;
  long long s = u;
  if ((((u + 1LL) < n) && (vis[(u + 1LL)] == 0LL))) {
    s = (s + b39_dfs_cadena_larga_dfs((u + 1LL), n, vis));
  }
  return (s % 1000003LL);
}
static long long b39_dfs_cadena_larga_run(void) {
  long long* vis = ((long long*)calloc((size_t)(20000LL), 8));
  return b39_dfs_cadena_larga_dfs(0LL, 20000LL, vis);
}
static long long b40_sobrecoste_llamada_f1(long long x) {
  return (x + 1LL);
}
static long long b40_sobrecoste_llamada_f2(long long x) {
  return ((b40_sobrecoste_llamada_f1(x) * 3LL) % 1000003LL);
}
static long long b40_sobrecoste_llamada_f3(long long x) {
  return (b40_sobrecoste_llamada_f2(x) + b40_sobrecoste_llamada_f1(x));
}
static long long b40_sobrecoste_llamada_run(void) {
  long long a = 1LL;
  for (long long i = 0LL; i < 15000000LL; i++) {
    a = (b40_sobrecoste_llamada_f3(a) % 1000003LL);
  }
  return a;
}
static long long c41_matmul500_run(void) {
  long long n = 500LL;
  double* a = ((double*)calloc((size_t)((n * n)), 8));
  double* b = ((double*)calloc((size_t)((n * n)), 8));
  double* c = ((double*)calloc((size_t)((n * n)), 8));
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      a[((i * n) + j)] = (((double)((((i * 7LL) + (j * 3LL)) % 10LL))) / 10.0);
      b[((i * n) + j)] = (((double)((((i * 5LL) + (j * 11LL)) % 10LL))) / 10.0);
    }
  }
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      double s = 0.0;
      for (long long k = 0LL; k < n; k++) {
        s = (s + (a[((i * n) + k)] * b[((k * n) + j)]));
      }
      c[((i * n) + j)] = s;
    }
  }
  double t = 0.0;
  for (long long i = 0LL; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return ((long long)((t * 1000.0)));
}
static long long c42_lcs6000_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c42_lcs6000_run(void) {
  long long n = 6000LL;
  long long* s = ((long long*)calloc((size_t)(n), 8));
  long long* t = ((long long*)calloc((size_t)(n), 8));
  long long x = 777LL;
  for (long long i = 0LL; i < n; i++) {
    x = c42_lcs6000_lcg(x);
    s[i] = (x % 4LL);
    x = c42_lcs6000_lcg(x);
    t[i] = (x % 4LL);
  }
  long long* prev = ((long long*)calloc((size_t)((n + 1LL)), 8));
  long long* cur = ((long long*)calloc((size_t)((n + 1LL)), 8));
  for (long long i = 1LL; i < (n + 1LL); i++) {
    for (long long j = 1LL; j < (n + 1LL); j++) {
      if ((s[(i - 1LL)] == t[(j - 1LL)])) {
        cur[j] = (prev[(j - 1LL)] + 1LL);
      } else {
        if ((prev[j] > cur[(j - 1LL)])) {
          cur[j] = prev[j];
        } else {
          cur[j] = cur[(j - 1LL)];
        }
      }
    }
    for (long long j = 0LL; j < (n + 1LL); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
static long long c43_editdist5000_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c43_editdist5000_run(void) {
  long long n = 5000LL;
  long long* s = ((long long*)calloc((size_t)(n), 8));
  long long* t = ((long long*)calloc((size_t)(n), 8));
  long long x = 31LL;
  for (long long i = 0LL; i < n; i++) {
    x = c43_editdist5000_lcg(x);
    s[i] = (x % 4LL);
    x = c43_editdist5000_lcg(x);
    t[i] = (x % 4LL);
  }
  long long* prev = ((long long*)calloc((size_t)((n + 1LL)), 8));
  long long* cur = ((long long*)calloc((size_t)((n + 1LL)), 8));
  for (long long j = 0LL; j < (n + 1LL); j++) {
    prev[j] = j;
  }
  for (long long i = 1LL; i < (n + 1LL); i++) {
    cur[0LL] = i;
    for (long long j = 1LL; j < (n + 1LL); j++) {
      long long costo = 1LL;
      if ((s[(i - 1LL)] == t[(j - 1LL)])) {
        costo = 0LL;
      }
      long long mejor = (prev[(j - 1LL)] + costo);
      if (((prev[j] + 1LL) < mejor)) {
        mejor = (prev[j] + 1LL);
      }
      if (((cur[(j - 1LL)] + 1LL) < mejor)) {
        mejor = (cur[(j - 1LL)] + 1LL);
      }
      cur[j] = mejor;
    }
    for (long long j = 0LL; j < (n + 1LL); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
static long long c44_floyd400_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c44_floyd400_run(void) {
  long long n = 400LL;
  long long* d = ((long long*)calloc((size_t)((n * n)), 8));
  long long x = 5LL;
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      x = c44_floyd400_lcg(x);
      d[((i * n) + j)] = ((x % 100LL) + 1LL);
    }
    d[((i * n) + i)] = 0LL;
  }
  for (long long k = 0LL; k < n; k++) {
    for (long long i = 0LL; i < n; i++) {
      for (long long j = 0LL; j < n; j++) {
        long long v = (d[((i * n) + k)] + d[((k * n) + j)]);
        if ((v < d[((i * n) + j)])) {
          d[((i * n) + j)] = v;
        }
      }
    }
  }
  long long s = 0LL;
  for (long long i = 0LL; i < (n * n); i++) {
    s = (s + d[i]);
  }
  return s;
}
static long long c45_mochila3000_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c45_mochila3000_run(void) {
  long long n = 3000LL;
  long long cap = 20000LL;
  long long* w = ((long long*)calloc((size_t)(n), 8));
  long long* v = ((long long*)calloc((size_t)(n), 8));
  long long x = 31LL;
  for (long long i = 0LL; i < n; i++) {
    x = c45_mochila3000_lcg(x);
    w[i] = (1LL + (x % 50LL));
    x = c45_mochila3000_lcg(x);
    v[i] = (x % 100LL);
  }
  long long* dp = ((long long*)calloc((size_t)((cap + 1LL)), 8));
  for (long long i = 0LL; i < n; i++) {
    long long c = cap;
    while ((c >= w[i])) {
      long long cand = (dp[(c - w[i])] + v[i]);
      if ((cand > dp[c])) {
        dp[c] = cand;
      }
      c = (c - 1LL);
    }
  }
  return dp[cap];
}
static long long c46_columnas_run(void) {
  long long n = 3000LL;
  long long* a = ((long long*)calloc((size_t)((n * n)), 8));
  for (long long i = 0LL; i < (n * n); i++) {
    a[i] = (i % 17LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 4LL; r++) {
    for (long long j = 0LL; j < n; j++) {
      for (long long i = 0LL; i < n; i++) {
        s = (s + a[((i * n) + j)]);
      }
    }
  }
  return s;
}
static long long c47_acceso_aleatorio_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c47_acceso_aleatorio_run(void) {
  long long n = 16777216LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 1000LL);
  }
  long long x = 1LL;
  long long s = 0LL;
  for (long long k = 0LL; k < 8000000LL; k++) {
    x = c47_acceso_aleatorio_lcg(x);
    s = (s + a[(x % n)]);
  }
  return s;
}
static long long c48_busqueda_binaria_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c48_busqueda_binaria_run(void) {
  long long n = 4194304LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i * 3LL);
  }
  long long x = 9LL;
  long long hallados = 0LL;
  for (long long q = 0LL; q < 300000LL; q++) {
    x = c48_busqueda_binaria_lcg(x);
    long long clave = (x % (n * 3LL));
    long long lo = 0LL;
    long long hi = (n - 1LL);
    while ((lo <= hi)) {
      long long mid = (((lo + hi)) / (2LL));
      if ((a[mid] == clave)) {
        hallados = (hallados + 1LL);
        lo = (hi + 1LL);
      } else {
        if ((a[mid] < clave)) {
          lo = (mid + 1LL);
        } else {
          hi = (mid - 1LL);
        }
      }
    }
  }
  return hallados;
}
static long long c49_ventana_run(void) {
  long long n = 10000000LL;
  long long w = 1000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 31LL);
  }
  long long s = 0LL;
  for (long long i = 0LL; i < w; i++) {
    s = (s + a[i]);
  }
  long long mx = s;
  for (long long i = w; i < n; i++) {
    s = ((s + a[i]) - a[(i - w)]);
    if ((s > mx)) {
      mx = s;
    }
  }
  return mx;
}
static long long c50_spmv_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c50_spmv_run(void) {
  long long n = 200000LL;
  long long k = 10LL;
  long long* col = ((long long*)calloc((size_t)((n * k)), 8));
  long long* val = ((long long*)calloc((size_t)((n * k)), 8));
  long long x = 3LL;
  for (long long i = 0LL; i < (n * k); i++) {
    x = c50_spmv_lcg(x);
    col[i] = (x % n);
    val[i] = (x % 7LL);
  }
  long long* v = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    v[i] = (i % 5LL);
  }
  long long* ys = ((long long*)calloc((size_t)(n), 8));
  long long t = 0LL;
  for (long long r = 0LL; r < 10LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      long long s = 0LL;
      for (long long j = 0LL; j < k; j++) {
        s = (s + (val[((i * k) + j)] * v[col[((i * k) + j)]]));
      }
      ys[i] = s;
    }
    t = (t + ys[(r * 7LL)]);
  }
  return t;
}
static long long c51_aos_run(void) {
  long long n = 2000000LL;
  long long* p = ((long long*)calloc((size_t)((n * 4LL)), 8));
  for (long long i = 0LL; i < n; i++) {
    p[(i * 4LL)] = (i % 10LL);
    p[((i * 4LL) + 1LL)] = (i % 7LL);
    p[((i * 4LL) + 2LL)] = (i % 5LL);
    p[((i * 4LL) + 3LL)] = 1LL;
  }
  for (long long r = 0LL; r < 10LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      p[(i * 4LL)] = ((p[(i * 4LL)] + p[((i * 4LL) + 3LL)]) % 1000LL);
      p[((i * 4LL) + 1LL)] = ((p[((i * 4LL) + 1LL)] + p[(i * 4LL)]) % 1000LL);
    }
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + p[((i * 4LL) + 1LL)]);
  }
  return s;
}
static long long c51_soa_run(void) {
  long long n = 2000000LL;
  long long* x = ((long long*)calloc((size_t)(n), 8));
  long long* ys = ((long long*)calloc((size_t)(n), 8));
  long long* z = ((long long*)calloc((size_t)(n), 8));
  long long* m = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    x[i] = (i % 10LL);
    ys[i] = (i % 7LL);
    z[i] = (i % 5LL);
    m[i] = 1LL;
  }
  for (long long r = 0LL; r < 10LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      x[i] = ((x[i] + m[i]) % 1000LL);
      ys[i] = ((ys[i] + x[i]) % 1000LL);
    }
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + ys[i]);
  }
  return s;
}
static long long c52_indices_calculados_run(void) {
  long long n = 8000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 100LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 3LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      s = (s + a[(((i * 7919LL) + 13LL) % n)]);
    }
  }
  return s;
}
static long long c53_sin_comprobar_a_run(void) {
  long long n = 4000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long r = 0LL; r < 10LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      a[i] = (a[i] + (i % 5LL));
    }
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + a[i]);
  }
  return s;
}
static long long c53_sin_comprobar_b_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long c53_sin_comprobar_b_run(void) {
  long long n = 4000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long* b = ((long long*)calloc((size_t)(n), 8));
  long long x = 4LL;
  for (long long i = 0LL; i < n; i++) {
    x = c53_sin_comprobar_b_lcg(x);
    b[i] = (x % n);
    a[i] = (i % 9LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 4LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      s = (s + a[b[i]]);
    }
  }
  return s;
}
static long long c55_aritmetica_saturada_run(void) {
  long long tope = 4000000000000000LL;
  long long s = 3999999999000000LL;
  for (long long i = 0LL; i < 40000000LL; i++) {
    s = (s + (i % 97LL));
    if ((s > tope)) {
      s = (tope - (i % 1000LL));
    }
  }
  return s;
}
static long long c56_div_mod_run(void) {
  long long m = 1000003LL;
  long long s = 0LL;
  long long b = 2LL;
  for (long long i = 1LL; i < 8000000LL; i++) {
    b = (((b * 31LL) + i) % m);
    s = ((s + ((b) / (7LL))) + (b % 13LL));
  }
  return s;
}
static long long c57_conversiones_run(void) {
  long long s = 0LL;
  for (long long i = 0LL; i < 30000000LL; i++) {
    double r = (((double)(i)) * 0.5);
    s = (s + (((long long)(r)) % 3LL));
  }
  return s;
}
static long long c59_criba10M_run(void) {
  long long n = 10000000LL;
  long long* m = ((long long*)calloc((size_t)((n + 1LL)), 8));
  for (long long i = 2LL; i < (n + 1LL); i++) {
    m[i] = 1LL;
  }
  long long i = 2LL;
  while (((i * i) <= n)) {
    if ((m[i] == 1LL)) {
      long long j = (i * i);
      while ((j <= n)) {
        m[j] = 0LL;
        j = (j + i);
      }
    }
    i = (i + 1LL);
  }
  long long c = 0LL;
  for (long long k = 2LL; k < (n + 1LL); k++) {
    c = (c + m[k]);
  }
  return c;
}
static long long c60_alias_run(void) {
  long long n = 10000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long* b = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 5LL);
    b[i] = (i % 3LL);
  }
  for (long long r = 0LL; r < 10LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      a[i] = ((a[i] + (3LL * b[i])) % 1000LL);
    }
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + a[i]);
  }
  return s;
}
static long long e76_directo_run(void) {
  long long n = 16000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 7LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 6LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      s = (s + a[i]);
    }
  }
  return s;
}
static long long e76_inverso_run(void) {
  long long n = 16000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 7LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 6LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      s = (s + a[((n - 1LL) - i)]);
    }
  }
  return s;
}
static long long e77_matmul_bloques_run(void) {
  long long n = 480LL;
  long long bs = 48LL;
  double* a = ((double*)calloc((size_t)((n * n)), 8));
  double* b = ((double*)calloc((size_t)((n * n)), 8));
  double* c = ((double*)calloc((size_t)((n * n)), 8));
  for (long long i = 0LL; i < n; i++) {
    for (long long j = 0LL; j < n; j++) {
      a[((i * n) + j)] = (((double)((((i * 7LL) + (j * 3LL)) % 10LL))) / 10.0);
      b[((i * n) + j)] = (((double)((((i * 5LL) + (j * 11LL)) % 10LL))) / 10.0);
    }
  }
  for (long long ii = 0LL; ii < ((n) / (bs)); ii++) {
    for (long long kk = 0LL; kk < ((n) / (bs)); kk++) {
      for (long long jj = 0LL; jj < ((n) / (bs)); jj++) {
        for (long long i = (ii * bs); i < ((ii + 1LL) * bs); i++) {
          for (long long k = (kk * bs); k < ((kk + 1LL) * bs); k++) {
            double aik = a[((i * n) + k)];
            for (long long j = (jj * bs); j < ((jj + 1LL) * bs); j++) {
              c[((i * n) + j)] = (c[((i * n) + j)] + (aik * b[((k * n) + j)]));
            }
          }
        }
      }
    }
  }
  double t = 0.0;
  for (long long i = 0LL; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return ((long long)((t * 1000.0)));
}
static void e78_lista_nodos_suelta(Nodo* h) {
  Nodo* c = h;
  while ((c != NULL)) {
    Nodo* sig = (c)->i;
    free((void*)(c));
    c = sig;
  }
}
static long long e78_lista_nodos_run(void) {
  Nodo* h = NULL;
  for (long long i = 0LL; i < 5000000LL; i++) {
    h = nuevo_nodo((i % 11LL), 0LL, h, NULL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 4LL; r++) {
    Nodo* c = h;
    while ((c != NULL)) {
      s = (s + (c)->v);
      c = (c)->i;
    }
  }
  e78_lista_nodos_suelta(h);
  return s;
}
static long long e78_array_run(void) {
  long long n = 5000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[((n - 1LL) - i)] = (i % 11LL);
  }
  long long s = 0LL;
  for (long long r = 0LL; r < 4LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      s = (s + a[i]);
    }
  }
  return s;
}
static long long e80_hash_colisiones_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long e80_hash_colisiones_run(void) {
  long long tam = 4194304LL;
  long long* claves = ((long long*)calloc((size_t)(tam), 8));
  long long* vals = ((long long*)calloc((size_t)(tam), 8));
  long long x = 11LL;
  long long hallados = 0LL;
  for (long long i = 0LL; i < 2000000LL; i++) {
    x = e80_hash_colisiones_lcg(x);
    long long k = (x + 1LL);
    long long h = ((k * 40503LL) % tam);
    while (((claves[h] != 0LL) && (claves[h] != k))) {
      h = ((h + 1LL) % tam);
    }
    claves[h] = k;
    vals[h] = i;
  }
  x = 11LL;
  for (long long i = 0LL; i < 2000000LL; i++) {
    x = e80_hash_colisiones_lcg(x);
    long long k = (x + 1LL);
    long long h = ((k * 40503LL) % tam);
    while (((claves[h] != 0LL) && (claves[h] != k))) {
      h = ((h + 1LL) % tam);
    }
    if ((claves[h] == k)) {
      hallados = (hallados + (vals[h] % 7LL));
    }
  }
  return hallados;
}
static long long e81_copia_memoria_run(void) {
  long long n = 8000000LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long* b = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    a[i] = (i % 13LL);
  }
  for (long long r = 0LL; r < 20LL; r++) {
    for (long long i = 0LL; i < n; i++) {
      b[i] = a[i];
    }
    a[r] = b[(r + 1LL)];
  }
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    s = (s + b[i]);
  }
  return s;
}
static long long e82_pointer_chasing_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long e82_pointer_chasing_run(void) {
  long long n = 4194304LL;
  long long* p = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    p[i] = i;
  }
  long long x = 17LL;
  for (long long i = 1LL; i < n; i++) {
    x = e82_pointer_chasing_lcg(x);
    long long j = (x % (i + 1LL));
    long long t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  long long c = 0LL;
  long long s = 0LL;
  for (long long k = 0LL; k < 3000000LL; k++) {
    c = p[c];
    s = (s + (c % 3LL));
  }
  return s;
}
static long long e82_pointer_chasing_nodos_lcg(long long x) {
  return ((x * 16807LL) % 2147483647LL);
}
static long long e82_pointer_chasing_nodos_run(void) {
  long long n = 1000000LL;
  Nodo** g = ((Nodo**)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    g[i] = nuevo_nodo(i, 0LL, NULL, NULL);
  }
  long long x = 17LL;
  long long* ord = ((long long*)calloc((size_t)(n), 8));
  for (long long i = 0LL; i < n; i++) {
    ord[i] = i;
  }
  for (long long i = 1LL; i < n; i++) {
    x = e82_pointer_chasing_nodos_lcg(x);
    long long j = (x % (i + 1LL));
    long long t = ord[i];
    ord[i] = ord[j];
    ord[j] = t;
  }
  for (long long i = 0LL; i < n; i++) {
    (g[ord[i]])->i = g[ord[((i + 1LL) % n)]];
  }
  Nodo* c = g[0LL];
  long long s = 0LL;
  for (long long k = 0LL; k < 2000000LL; k++) {
    c = (c)->i;
    s = (s + ((c)->v % 3LL));
  }
  for (long long i = 0LL; i < n; i++) {
    free((void*)(g[i]));
  }
  return s;
}
static long long e85_primer_acceso_run(void) {
  long long n = 33554432LL;
  long long* a = ((long long*)calloc((size_t)(n), 8));
  long long s = 0LL;
  for (long long i = 0LL; i < n; i++) {
    a[i] = i;
  }
  for (long long i = 0LL; i < n; i++) {
    s = (s + (a[i] % 5LL));
  }
  return s;
}
int main(int argc, char** argv) {
  double t0; long long r; const char* sel = argc > 1 ? argv[1] : NULL;
  if (!sel || !strcmp(sel, "a01_arbol_masivo")) { t0 = reloj(); r = a01_arbol_masivo_run(); printf("a01_arbol_masivo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a02_ciclos")) { t0 = reloj(); r = a02_ciclos_run(); printf("a02_ciclos = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a03_grafo_social")) { t0 = reloj(); r = a03_grafo_social_run(); printf("a03_grafo_social = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a04_vida_corta")) { t0 = reloj(); r = a04_vida_corta_run(); printf("a04_vida_corta = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a05_vida_larga")) { t0 = reloj(); r = a05_vida_larga_run(); printf("a05_vida_larga = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a06_asignar_soltar")) { t0 = reloj(); r = a06_asignar_soltar_run(); printf("a06_asignar_soltar = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a07_listas_anidadas")) { t0 = reloj(); r = a07_listas_anidadas_run(); printf("a07_listas_anidadas = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a08_cache_desalojo")) { t0 = reloj(); r = a08_cache_desalojo_run(); printf("a08_cache_desalojo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a10_persistente")) { t0 = reloj(); r = a10_persistente_run(); printf("a10_persistente = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a13_matriz_dispersa")) { t0 = reloj(); r = a13_matriz_dispersa_run(); printf("a13_matriz_dispersa = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a14_churn_puro")) { t0 = reloj(); r = a14_churn_puro_run(); printf("a14_churn_puro = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a15_ast_compilador")) { t0 = reloj(); r = a15_ast_compilador_run(); printf("a15_ast_compilador = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a18_heap")) { t0 = reloj(); r = a18_heap_run(); printf("a18_heap = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a18_arena")) { t0 = reloj(); r = a18_arena_run(); printf("a18_arena = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "a20_soltar_heap")) { t0 = reloj(); r = a20_soltar_heap_run(); printf("a20_soltar_heap = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b21_fib36")) { t0 = reloj(); r = b21_fib36_run(); printf("b21_fib36 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b22_ackermann_6")) { t0 = reloj(); r = b22_ackermann_6_run(); printf("b22_ackermann_6 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b22_ackermann_8")) { t0 = reloj(); r = b22_ackermann_8_run(); printf("b22_ackermann_8 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b23_hanoi27")) { t0 = reloj(); r = b23_hanoi27_run(); printf("b23_hanoi27 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b24_arbol_perfecto")) { t0 = reloj(); r = b24_arbol_perfecto_run(); printf("b24_arbol_perfecto = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b25_quicksort_ordenado")) { t0 = reloj(); r = b25_quicksort_ordenado_run(); printf("b25_quicksort_ordenado = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b26_recursion_mutua")) { t0 = reloj(); r = b26_recursion_mutua_run(); printf("b26_recursion_mutua = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b27_nreinas")) { t0 = reloj(); r = b27_nreinas_run(); printf("b27_nreinas = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b28_acumulador")) { t0 = reloj(); r = b28_acumulador_run(); printf("b28_acumulador = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b30_lista_recursiva")) { t0 = reloj(); r = b30_lista_recursiva_run(); printf("b30_lista_recursiva = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b31_fib_recursivo30")) { t0 = reloj(); r = b31_fib_recursivo30_run(); printf("b31_fib_recursivo30 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b31_fib_iterativo")) { t0 = reloj(); r = b31_fib_iterativo_run(); printf("b31_fib_iterativo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b32_muchas_locales")) { t0 = reloj(); r = b32_muchas_locales_run(); printf("b32_muchas_locales = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b33_retorna_estructuras")) { t0 = reloj(); r = b33_retorna_estructuras_run(); printf("b33_retorna_estructuras = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b35_descenso_recursivo")) { t0 = reloj(); r = b35_descenso_recursivo_run(); printf("b35_descenso_recursivo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b37_catalan")) { t0 = reloj(); r = b37_catalan_run(); printf("b37_catalan = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b38_catalan_memo")) { t0 = reloj(); r = b38_catalan_memo_run(); printf("b38_catalan_memo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b39_dfs_profundo")) { t0 = reloj(); r = b39_dfs_profundo_run(); printf("b39_dfs_profundo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b39_dfs_cadena_larga")) { t0 = reloj(); r = b39_dfs_cadena_larga_run(); printf("b39_dfs_cadena_larga = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "b40_sobrecoste_llamada")) { t0 = reloj(); r = b40_sobrecoste_llamada_run(); printf("b40_sobrecoste_llamada = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c41_matmul500")) { t0 = reloj(); r = c41_matmul500_run(); printf("c41_matmul500 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c42_lcs6000")) { t0 = reloj(); r = c42_lcs6000_run(); printf("c42_lcs6000 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c43_editdist5000")) { t0 = reloj(); r = c43_editdist5000_run(); printf("c43_editdist5000 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c44_floyd400")) { t0 = reloj(); r = c44_floyd400_run(); printf("c44_floyd400 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c45_mochila3000")) { t0 = reloj(); r = c45_mochila3000_run(); printf("c45_mochila3000 = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c46_columnas")) { t0 = reloj(); r = c46_columnas_run(); printf("c46_columnas = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c47_acceso_aleatorio")) { t0 = reloj(); r = c47_acceso_aleatorio_run(); printf("c47_acceso_aleatorio = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c48_busqueda_binaria")) { t0 = reloj(); r = c48_busqueda_binaria_run(); printf("c48_busqueda_binaria = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c49_ventana")) { t0 = reloj(); r = c49_ventana_run(); printf("c49_ventana = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c50_spmv")) { t0 = reloj(); r = c50_spmv_run(); printf("c50_spmv = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c51_aos")) { t0 = reloj(); r = c51_aos_run(); printf("c51_aos = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c51_soa")) { t0 = reloj(); r = c51_soa_run(); printf("c51_soa = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c52_indices_calculados")) { t0 = reloj(); r = c52_indices_calculados_run(); printf("c52_indices_calculados = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c53_sin_comprobar_a")) { t0 = reloj(); r = c53_sin_comprobar_a_run(); printf("c53_sin_comprobar_a = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c53_sin_comprobar_b")) { t0 = reloj(); r = c53_sin_comprobar_b_run(); printf("c53_sin_comprobar_b = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c55_aritmetica_saturada")) { t0 = reloj(); r = c55_aritmetica_saturada_run(); printf("c55_aritmetica_saturada = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c56_div_mod")) { t0 = reloj(); r = c56_div_mod_run(); printf("c56_div_mod = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c57_conversiones")) { t0 = reloj(); r = c57_conversiones_run(); printf("c57_conversiones = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c59_criba10M")) { t0 = reloj(); r = c59_criba10M_run(); printf("c59_criba10M = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "c60_alias")) { t0 = reloj(); r = c60_alias_run(); printf("c60_alias = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e76_directo")) { t0 = reloj(); r = e76_directo_run(); printf("e76_directo = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e76_inverso")) { t0 = reloj(); r = e76_inverso_run(); printf("e76_inverso = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e77_matmul_bloques")) { t0 = reloj(); r = e77_matmul_bloques_run(); printf("e77_matmul_bloques = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e78_lista_nodos")) { t0 = reloj(); r = e78_lista_nodos_run(); printf("e78_lista_nodos = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e78_array")) { t0 = reloj(); r = e78_array_run(); printf("e78_array = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e80_hash_colisiones")) { t0 = reloj(); r = e80_hash_colisiones_run(); printf("e80_hash_colisiones = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e81_copia_memoria")) { t0 = reloj(); r = e81_copia_memoria_run(); printf("e81_copia_memoria = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e82_pointer_chasing")) { t0 = reloj(); r = e82_pointer_chasing_run(); printf("e82_pointer_chasing = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e82_pointer_chasing_nodos")) { t0 = reloj(); r = e82_pointer_chasing_nodos_run(); printf("e82_pointer_chasing_nodos = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  if (!sel || !strcmp(sel, "e85_primer_acceso")) { t0 = reloj(); r = e85_primer_acceso_run(); printf("e85_primer_acceso = %lld en %.0f ms\n", r, reloj() - t0); fflush(stdout); }
  return 0;
}
