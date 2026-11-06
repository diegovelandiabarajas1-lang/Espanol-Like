# bench100.py — generado por gen100/gen.js: no editar a mano. Uso: python3 bench100.py [nombre]
import math, sys, time, threading
sys.setrecursionlimit(1000000)
class Nodo:
    __slots__ = ("v", "w", "i", "d")
    def __init__(self, v, w, i, d):
        self.v = v; self.w = w; self.i = i; self.d = d
sel = sys.argv[1] if len(sys.argv) > 1 else None
def a01_arbol_masivo_construir(d):
    if (1 if d == 0 else 0):
        return None
    return Nodo(d, 0, a01_arbol_masivo_construir((d - 1)), a01_arbol_masivo_construir((d - 1)))
def a01_arbol_masivo_suma(n):
    if (1 if n == None else 0):
        return 0
    return ((n.v + a01_arbol_masivo_suma(n.i)) + a01_arbol_masivo_suma(n.d))
def a01_arbol_masivo_soltar(n):
    if (1 if n == None else 0):
        return
    a01_arbol_masivo_soltar(n.i)
    a01_arbol_masivo_soltar(n.d)
    0
def a01_arbol_masivo_run():
    t = 0
    for r in range(0, 3):
        a = a01_arbol_masivo_construir(20)
        t = (t + a01_arbol_masivo_suma(a))
        a01_arbol_masivo_soltar(a)
    return t
def a02_ciclos_anillo(n):
    h = Nodo(0, 0, None, None)
    c = h
    for k in range(1, n):
        x = Nodo(k, 0, None, None)
        c.i = x
        c = x
    c.i = h
    return h
def a02_ciclos_suma(h, n):
    s = 0
    c = h
    for k in range(0, n):
        s = (s + c.v)
        c = c.i
    return s
def a02_ciclos_libera(h, n):
    c = h
    for k in range(0, n):
        sig = c.i
        0
        c = sig
def a02_ciclos_run():
    t = 0
    for r in range(0, 60):
        h = a02_ciclos_anillo(50000)
        t = (t + a02_ciclos_suma(h, 50000))
        a02_ciclos_libera(h, 50000)
    return t
def a03_grafo_social_lcg(x):
    return ((x * 16807) % 2147483647)
def a03_grafo_social_run():
    n = 100000
    m = 600000
    ady = [None] * (n)
    x = 12345
    for e in range(0, m):
        x = a03_grafo_social_lcg(x)
        a = (x % n)
        x = a03_grafo_social_lcg(x)
        b = (x % n)
        ady[a] = Nodo(b, 0, ady[a], None)
        ady[b] = Nodo(a, 0, ady[b], None)
    vis = [0] * (n)
    cola = [0] * (n)
    h = 0
    t = 1
    cola[0] = 0
    vis[0] = 1
    suma = 0
    while (1 if h < t else 0):
        u = cola[h]
        h = (h + 1)
        suma = (suma + u)
        ed = ady[u]
        while (1 if ed != None else 0):
            w = ed.v
            if (1 if vis[w] == 0 else 0):
                vis[w] = 1
                cola[t] = w
                t = (t + 1)
            ed = ed.i
    for u in range(0, n):
        ed2 = ady[u]
        while (1 if ed2 != None else 0):
            sig = ed2.i
            0
            ed2 = sig
    return (((suma % 1000003) * 1000) + (t % 1000))
def a04_vida_corta_run():
    s = 0
    for i in range(0, 20000000):
        ob = Nodo(i, 0, None, None)
        s = (s + (ob.v % 7))
        0
    return s
def a05_vida_larga_run():
    n = 1000000
    g = [None] * (n)
    for i in range(0, n):
        g[i] = Nodo(i, 0, None, None)
    s = 0
    for r in range(0, 2000000):
        ob = Nodo(r, 0, g[(r % n)], None)
        s = (s + (ob.i.v % 5))
        0
    for i in range(0, n):
        s = (s + (g[i].v % 3))
        0
    return s
def a06_asignar_soltar_run():
    a = [0] * (2000)
    s = 0
    for i in range(0, 150000):
        0
        a = [0] * (2000)
        a[(i % 2000)] = i
        s = (s + a[((i * 7) % 2000)])
    0
    return s
def a07_listas_anidadas_fila(n, base):
    h = None
    for k in range(0, n):
        h = Nodo((base + k), 0, h, None)
    return h
def a07_listas_anidadas_suelta(h):
    c = h
    while (1 if c != None else 0):
        sig = c.i
        0
        c = sig
def a07_listas_anidadas_suma(h):
    s = 0
    c = h
    while (1 if c != None else 0):
        s = (s + (c.v % 11))
        c = c.i
    return s
def a07_listas_anidadas_run():
    filas = [None] * (500)
    t = 0
    for r in range(0, 4000):
        j = (r % 500)
        a07_listas_anidadas_suelta(filas[j])
        filas[j] = a07_listas_anidadas_fila(500, r)
        t = (t + a07_listas_anidadas_suma(filas[j]))
    for j in range(0, 500):
        a07_listas_anidadas_suelta(filas[j])
    return t
def a08_cache_desalojo_lcg(x):
    return ((x * 16807) % 2147483647)
def a08_cache_desalojo_run():
    tam = 50000
    c = [None] * (tam)
    x = 777
    ac = 0
    for op in range(0, 3000000):
        x = a08_cache_desalojo_lcg(x)
        k = (x % 200000)
        slot = (k % tam)
        e = c[slot]
        if (1 if ((1 if e != None else 0) and (1 if e.v == k else 0)) else 0):
            ac = (ac + 1)
        else:
            if (1 if e != None else 0):
                0
            c[slot] = Nodo(k, 0, None, None)
    return ac
def a10_persistente_run():
    n = 1500000
    vers = [None] * (800)
    cur = None
    s = 0
    for i in range(0, n):
        cur = Nodo(i, 0, cur, None)
        if (1 if (i % 2000) == 0 else 0):
            vers[((i) // (2000))] = cur
    for k in range(0, 200):
        c = vers[k]
        m = 0
        while (1 if ((1 if c != None else 0) and (1 if m < 200 else 0)) else 0):
            s = (s + (c.v % 3))
            c = c.i
            m = (m + 1)
    return s
def a13_matriz_dispersa_lcg(x):
    return ((x * 16807) % 2147483647)
def a13_matriz_dispersa_run():
    n = 20000
    filas = [None] * (n)
    x = 99
    for r in range(0, n):
        for k in range(0, 20):
            x = a13_matriz_dispersa_lcg(x)
            filas[r] = Nodo((x % n), (x % 100), filas[r], None)
    vec = [0] * (n)
    for j in range(0, n):
        vec[j] = (j % 13)
    t = 0
    for rep in range(0, 10):
        for r in range(0, n):
            c = filas[r]
            s = 0
            while (1 if c != None else 0):
                s = (s + (c.w * vec[c.v]))
                c = c.i
            t = (t + (s % 1000))
    for r in range(0, n):
        c2 = filas[r]
        while (1 if c2 != None else 0):
            sig = c2.i
            0
            c2 = sig
    return t
def a14_churn_puro_run():
    s = 0
    for i in range(0, 20000000):
        a = Nodo(i, 0, None, None)
        b = Nodo((i + 1), 0, a, None)
        c = Nodo((i + 2), 0, b, None)
        s = (s + (c.i.i.v % 5))
        0
        0
        0
    return s
def a15_ast_compilador_construir(d, s):
    if (1 if d == 0 else 0):
        return Nodo(0, (s % 10), None, None)
    return Nodo((1 + (s % 3)), 0, a15_ast_compilador_construir((d - 1), (((s * 7) + 1) % 1000003)), a15_ast_compilador_construir((d - 1), (((s * 13) + 5) % 1000003)))
def a15_ast_compilador_evalua(n):
    if (1 if n.v == 0 else 0):
        return n.w
    a = a15_ast_compilador_evalua(n.i)
    b = a15_ast_compilador_evalua(n.d)
    if (1 if n.v == 1 else 0):
        return ((a + b) % 1000003)
    if (1 if n.v == 2 else 0):
        return ((a * b) % 1000003)
    return (((a + 1000003) - b) % 1000003)
def a15_ast_compilador_soltar(n):
    if (1 if n == None else 0):
        return
    a15_ast_compilador_soltar(n.i)
    a15_ast_compilador_soltar(n.d)
    0
def a15_ast_compilador_run():
    t = 0
    for r in range(0, 5):
        a = a15_ast_compilador_construir(17, (r + 1))
        t = (t + a15_ast_compilador_evalua(a))
        a15_ast_compilador_soltar(a)
    return t
def a18_heap_suelta(h):
    c = h
    while (1 if c != None else 0):
        sig = c.i
        0
        c = sig
def a18_heap_run():
    t = 0
    for r in range(0, 2):
        h = None
        for i in range(0, 3000000):
            h = Nodo(i, 0, h, None)
        c = h
        while (1 if c != None else 0):
            t = (t + (c.v % 3))
            c = c.i
        a18_heap_suelta(h)
    return t
def a18_arena_run():
    n = 3000000
    val = [0] * (n)
    nxt = [0] * (n)
    t = 0
    for r in range(0, 2):
        h = (0 - 1)
        for i in range(0, n):
            val[i] = i
            nxt[i] = h
            h = i
        c = h
        while (1 if c >= 0 else 0):
            t = (t + (val[c] % 3))
            c = nxt[c]
    return t
def a20_soltar_heap_suelta(h):
    c = h
    while (1 if c != None else 0):
        sig = c.i
        0
        c = sig
def a20_soltar_heap_run():
    h = None
    for i in range(0, 300000):
        h = Nodo(i, 0, h, None)
    t0 = int(time.perf_counter() * 1e6)
    a20_soltar_heap_suelta(h)
    h = None
    return (int(time.perf_counter() * 1e6) - t0)
def b21_fib36_fib(n):
    if (1 if n < 2 else 0):
        return n
    return (b21_fib36_fib((n - 1)) + b21_fib36_fib((n - 2)))
def b21_fib36_run():
    return b21_fib36_fib(36)
def b22_ackermann_6_ack(m, n):
    if (1 if m == 0 else 0):
        return (n + 1)
    if (1 if n == 0 else 0):
        return b22_ackermann_6_ack((m - 1), 1)
    return b22_ackermann_6_ack((m - 1), b22_ackermann_6_ack(m, (n - 1)))
def b22_ackermann_6_run():
    t = 0
    for r in range(0, 300):
        t = (t + b22_ackermann_6_ack(3, 6))
    return t
def b22_ackermann_8_ack(m, n):
    if (1 if m == 0 else 0):
        return (n + 1)
    if (1 if n == 0 else 0):
        return b22_ackermann_8_ack((m - 1), 1)
    return b22_ackermann_8_ack((m - 1), b22_ackermann_8_ack(m, (n - 1)))
def b22_ackermann_8_run():
    return b22_ackermann_8_ack(3, 8)
def b23_hanoi27_mueve(n, a):
    if (1 if n == 0 else 0):
        return (a % 2)
    return ((b23_hanoi27_mueve((n - 1), (a + 1)) + b23_hanoi27_mueve((n - 1), (a + 2))) + 1)
def b23_hanoi27_run():
    return b23_hanoi27_mueve(27, 0)
def b24_arbol_perfecto_construir(d):
    if (1 if d == 0 else 0):
        return None
    return Nodo(d, 0, b24_arbol_perfecto_construir((d - 1)), b24_arbol_perfecto_construir((d - 1)))
def b24_arbol_perfecto_suma(n):
    if (1 if n == None else 0):
        return 0
    return ((n.v + b24_arbol_perfecto_suma(n.i)) + b24_arbol_perfecto_suma(n.d))
def b24_arbol_perfecto_soltar(n):
    if (1 if n == None else 0):
        return
    b24_arbol_perfecto_soltar(n.i)
    b24_arbol_perfecto_soltar(n.d)
    0
def b24_arbol_perfecto_run():
    a = b24_arbol_perfecto_construir(18)
    t = 0
    for r in range(0, 40):
        t = (t + b24_arbol_perfecto_suma(a))
    b24_arbol_perfecto_soltar(a)
    return t
def b25_quicksort_ordenado_part(a, lo, hi):
    p = a[hi]
    i = lo
    for j in range(lo, hi):
        if (1 if a[j] < p else 0):
            t = a[i]
            a[i] = a[j]
            a[j] = t
            i = (i + 1)
    t2 = a[i]
    a[i] = a[hi]
    a[hi] = t2
    return i
def b25_quicksort_ordenado_qs(a, lo, hi):
    if (1 if lo < hi else 0):
        p = b25_quicksort_ordenado_part(a, lo, hi)
        b25_quicksort_ordenado_qs(a, lo, (p - 1))
        b25_quicksort_ordenado_qs(a, (p + 1), hi)
def b25_quicksort_ordenado_run():
    n = 5000
    a = [0] * (n)
    for i in range(0, n):
        a[i] = i
    b25_quicksort_ordenado_qs(a, 0, (n - 1))
    s = 0
    for i in range(0, n):
        s = (s + (a[i] * (i % 7)))
    return s
def b26_recursion_mutua_par(n):
    if (1 if n == 0 else 0):
        return 1
    return b26_recursion_mutua_impar((n - 1))
def b26_recursion_mutua_impar(n):
    if (1 if n == 0 else 0):
        return 0
    return b26_recursion_mutua_par((n - 1))
def b26_recursion_mutua_run():
    s = 0
    for r in range(0, 300000):
        s = (s + b26_recursion_mutua_par((700 + (r % 2))))
    return s
def b27_nreinas_pon(f, n, cols, d1, d2):
    if (1 if f == n else 0):
        return 1
    c = 0
    for k in range(0, n):
        if (1 if ((1 if ((1 if cols[k] == 0 else 0) and (1 if d1[(f + k)] == 0 else 0)) else 0) and (1 if d2[((f + n) - k)] == 0 else 0)) else 0):
            cols[k] = 1
            d1[(f + k)] = 1
            d2[((f + n) - k)] = 1
            c = (c + b27_nreinas_pon((f + 1), n, cols, d1, d2))
            cols[k] = 0
            d1[(f + k)] = 0
            d2[((f + n) - k)] = 0
    return c
def b27_nreinas_run():
    n = 11
    return b27_nreinas_pon(0, n, [0] * (n), [0] * ((2 * n)), [0] * (((2 * n) + 1)))
def b28_acumulador_suma(n, acc):
    if (1 if n == 0 else 0):
        return acc
    return b28_acumulador_suma((n - 1), (acc + n))
def b28_acumulador_run():
    s = 0
    for r in range(0, 50000):
        s = (s + (b28_acumulador_suma(800, r) % 1000))
    return s
def b30_lista_recursiva_largo(n):
    if (1 if n == None else 0):
        return 0
    return (1 + b30_lista_recursiva_largo(n.i))
def b30_lista_recursiva_suelta(h):
    c = h
    while (1 if c != None else 0):
        sig = c.i
        0
        c = sig
def b30_lista_recursiva_run():
    h = None
    for i in range(0, 100000):
        h = Nodo(i, 0, h, None)
    t = b30_lista_recursiva_largo(h)
    b30_lista_recursiva_suelta(h)
    return t
def b31_fib_recursivo30_fib(n):
    if (1 if n < 2 else 0):
        return n
    return (b31_fib_recursivo30_fib((n - 1)) + b31_fib_recursivo30_fib((n - 2)))
def b31_fib_recursivo30_run():
    s = 0
    for r in range(0, 30):
        s = (s + (b31_fib_recursivo30_fib(30) % 1000))
    return s
def b31_fib_iterativo_fib(n):
    a = 0
    b = 1
    for i in range(0, n):
        t = ((a + b) % 1000003)
        a = b
        b = t
    return a
def b31_fib_iterativo_run():
    s = 0
    for r in range(0, 600000):
        s = (s + (b31_fib_iterativo_fib(30) % 1000))
    return s
def b32_muchas_locales_f(n, a):
    if (1 if n == 0 else 0):
        return a
    b1 = (a + 1)
    b2 = ((b1 * 3) % 1009)
    b3 = (b2 + b1)
    b4 = ((b3 * 5) % 1013)
    b5 = (b4 + b2)
    b6 = ((b5 * 7) % 1019)
    b7 = (b6 + b3)
    b8 = ((b7 * 11) % 1021)
    b9 = (b8 + b5)
    b10 = ((b9 * 13) % 1031)
    return ((b32_muchas_locales_f((n - 1), b10) + b32_muchas_locales_f((n - 1), (b7 + b4))) % 1000003)
def b32_muchas_locales_run():
    return b32_muchas_locales_f(22, 5)
def b33_retorna_estructuras_gen(d):
    if (1 if d == 0 else 0):
        a = [0] * (8)
        for k in range(0, 8):
            a[k] = (k + 1)
        return a
    x = b33_retorna_estructuras_gen((d - 1))
    ys = b33_retorna_estructuras_gen((d - 1))
    r = [0] * (8)
    for k in range(0, 8):
        r[k] = ((x[k] + ys[((k + 1) % 8)]) % 1000003)
    0
    0
    return r
def b33_retorna_estructuras_run():
    a = b33_retorna_estructuras_gen(21)
    s = 0
    for k in range(0, 8):
        s = (s + a[k])
    return s
def b35_descenso_recursivo_gen(t, p, d, s):
    if (1 if d == 0 else 0):
        t[p[0]] = ((s % 9) + 1)
        p[0] = (p[0] + 1)
        return
    if (1 if (s % 3) == 0 else 0):
        t[p[0]] = (0 - 1)
        p[0] = (p[0] + 1)
        b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 7) + 1) % 10007))
        t[p[0]] = (0 - 2)
        p[0] = (p[0] + 1)
        return
    b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 13) + 5) % 10007))
    if (1 if (s % 2) == 0 else 0):
        t[p[0]] = (0 - 3)
    else:
        t[p[0]] = (0 - 4)
    p[0] = (p[0] + 1)
    b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 11) + 3) % 10007))
def b35_descenso_recursivo_factor(t, p):
    k = t[p[0]]
    if (1 if k == (0 - 1) else 0):
        p[0] = (p[0] + 1)
        v = b35_descenso_recursivo_expr(t, p)
        p[0] = (p[0] + 1)
        return v
    p[0] = (p[0] + 1)
    return k
def b35_descenso_recursivo_term(t, p):
    v = b35_descenso_recursivo_factor(t, p)
    while (1 if t[p[0]] == (0 - 4) else 0):
        p[0] = (p[0] + 1)
        v = ((v * b35_descenso_recursivo_factor(t, p)) % 1000003)
    return v
def b35_descenso_recursivo_expr(t, p):
    v = b35_descenso_recursivo_term(t, p)
    while (1 if t[p[0]] == (0 - 3) else 0):
        p[0] = (p[0] + 1)
        v = ((v + b35_descenso_recursivo_term(t, p)) % 1000003)
    return v
def b35_descenso_recursivo_run():
    t = [0] * (1000000)
    p = [0] * (1)
    b35_descenso_recursivo_gen(t, p, 15, 5)
    t[p[0]] = (0 - 9)
    s = 0
    for r in range(0, 20):
        p[0] = 0
        s = (s + b35_descenso_recursivo_expr(t, p))
    return (s + p[0])
def b37_catalan_cat(n):
    if (1 if n <= 1 else 0):
        return 1
    s = 0
    for i in range(0, n):
        s = (s + (b37_catalan_cat(i) * b37_catalan_cat(((n - 1) - i))))
    return s
def b37_catalan_run():
    return b37_catalan_cat(15)
def b38_catalan_memo_cat(n, m):
    if (1 if n <= 1 else 0):
        return 1
    if (1 if m[n] != 0 else 0):
        return m[n]
    s = 0
    for i in range(0, n):
        s = ((s + (b38_catalan_memo_cat(i, m) * b38_catalan_memo_cat(((n - 1) - i), m))) % 1000003)
    m[n] = (s + 1)
    return m[n]
def b38_catalan_memo_run():
    t = 0
    for r in range(0, 100):
        m = [0] * (701)
        t = (t + (b38_catalan_memo_cat(700, m) % 1000))
    return t
def b39_dfs_profundo_dfs(u, n, vis):
    vis[u] = 1
    s = u
    if (1 if ((1 if (u + 1) < n else 0) and (1 if vis[(u + 1)] == 0 else 0)) else 0):
        s = (s + b39_dfs_profundo_dfs((u + 1), n, vis))
    return (s % 1000003)
def b39_dfs_profundo_run():
    t = 0
    for r in range(0, 3000):
        vis = [0] * (800)
        t = (t + b39_dfs_profundo_dfs(0, 800, vis))
    return t
def b39_dfs_cadena_larga_dfs(u, n, vis):
    vis[u] = 1
    s = u
    if (1 if ((1 if (u + 1) < n else 0) and (1 if vis[(u + 1)] == 0 else 0)) else 0):
        s = (s + b39_dfs_cadena_larga_dfs((u + 1), n, vis))
    return (s % 1000003)
def b39_dfs_cadena_larga_run():
    vis = [0] * (20000)
    return b39_dfs_cadena_larga_dfs(0, 20000, vis)
def b40_sobrecoste_llamada_f1(x):
    return (x + 1)
def b40_sobrecoste_llamada_f2(x):
    return ((b40_sobrecoste_llamada_f1(x) * 3) % 1000003)
def b40_sobrecoste_llamada_f3(x):
    return (b40_sobrecoste_llamada_f2(x) + b40_sobrecoste_llamada_f1(x))
def b40_sobrecoste_llamada_run():
    a = 1
    for i in range(0, 15000000):
        a = (b40_sobrecoste_llamada_f3(a) % 1000003)
    return a
def c41_matmul500_run():
    n = 500
    a = [0.0] * ((n * n))
    b = [0.0] * ((n * n))
    c = [0.0] * ((n * n))
    for i in range(0, n):
        for j in range(0, n):
            a[((i * n) + j)] = (float((((i * 7) + (j * 3)) % 10)) / 10.0)
            b[((i * n) + j)] = (float((((i * 5) + (j * 11)) % 10)) / 10.0)
    for i in range(0, n):
        for j in range(0, n):
            s = 0.0
            for k in range(0, n):
                s = (s + (a[((i * n) + k)] * b[((k * n) + j)]))
            c[((i * n) + j)] = s
    t = 0.0
    for i in range(0, (n * n)):
        t = (t + c[i])
    return int((t * 1000.0))
def c42_lcs6000_lcg(x):
    return ((x * 16807) % 2147483647)
def c42_lcs6000_run():
    n = 6000
    s = [0] * (n)
    t = [0] * (n)
    x = 777
    for i in range(0, n):
        x = c42_lcs6000_lcg(x)
        s[i] = (x % 4)
        x = c42_lcs6000_lcg(x)
        t[i] = (x % 4)
    prev = [0] * ((n + 1))
    cur = [0] * ((n + 1))
    for i in range(1, (n + 1)):
        for j in range(1, (n + 1)):
            if (1 if s[(i - 1)] == t[(j - 1)] else 0):
                cur[j] = (prev[(j - 1)] + 1)
            else:
                if (1 if prev[j] > cur[(j - 1)] else 0):
                    cur[j] = prev[j]
                else:
                    cur[j] = cur[(j - 1)]
        for j in range(0, (n + 1)):
            prev[j] = cur[j]
    return prev[n]
def c43_editdist5000_lcg(x):
    return ((x * 16807) % 2147483647)
def c43_editdist5000_run():
    n = 5000
    s = [0] * (n)
    t = [0] * (n)
    x = 31
    for i in range(0, n):
        x = c43_editdist5000_lcg(x)
        s[i] = (x % 4)
        x = c43_editdist5000_lcg(x)
        t[i] = (x % 4)
    prev = [0] * ((n + 1))
    cur = [0] * ((n + 1))
    for j in range(0, (n + 1)):
        prev[j] = j
    for i in range(1, (n + 1)):
        cur[0] = i
        for j in range(1, (n + 1)):
            costo = 1
            if (1 if s[(i - 1)] == t[(j - 1)] else 0):
                costo = 0
            mejor = (prev[(j - 1)] + costo)
            if (1 if (prev[j] + 1) < mejor else 0):
                mejor = (prev[j] + 1)
            if (1 if (cur[(j - 1)] + 1) < mejor else 0):
                mejor = (cur[(j - 1)] + 1)
            cur[j] = mejor
        for j in range(0, (n + 1)):
            prev[j] = cur[j]
    return prev[n]
def c44_floyd400_lcg(x):
    return ((x * 16807) % 2147483647)
def c44_floyd400_run():
    n = 400
    d = [0] * ((n * n))
    x = 5
    for i in range(0, n):
        for j in range(0, n):
            x = c44_floyd400_lcg(x)
            d[((i * n) + j)] = ((x % 100) + 1)
        d[((i * n) + i)] = 0
    for k in range(0, n):
        for i in range(0, n):
            for j in range(0, n):
                v = (d[((i * n) + k)] + d[((k * n) + j)])
                if (1 if v < d[((i * n) + j)] else 0):
                    d[((i * n) + j)] = v
    s = 0
    for i in range(0, (n * n)):
        s = (s + d[i])
    return s
def c45_mochila3000_lcg(x):
    return ((x * 16807) % 2147483647)
def c45_mochila3000_run():
    n = 3000
    cap = 20000
    w = [0] * (n)
    v = [0] * (n)
    x = 31
    for i in range(0, n):
        x = c45_mochila3000_lcg(x)
        w[i] = (1 + (x % 50))
        x = c45_mochila3000_lcg(x)
        v[i] = (x % 100)
    dp = [0] * ((cap + 1))
    for i in range(0, n):
        c = cap
        while (1 if c >= w[i] else 0):
            cand = (dp[(c - w[i])] + v[i])
            if (1 if cand > dp[c] else 0):
                dp[c] = cand
            c = (c - 1)
    return dp[cap]
def c46_columnas_run():
    n = 3000
    a = [0] * ((n * n))
    for i in range(0, (n * n)):
        a[i] = (i % 17)
    s = 0
    for r in range(0, 4):
        for j in range(0, n):
            for i in range(0, n):
                s = (s + a[((i * n) + j)])
    return s
def c47_acceso_aleatorio_lcg(x):
    return ((x * 16807) % 2147483647)
def c47_acceso_aleatorio_run():
    n = 16777216
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 1000)
    x = 1
    s = 0
    for k in range(0, 8000000):
        x = c47_acceso_aleatorio_lcg(x)
        s = (s + a[(x % n)])
    return s
def c48_busqueda_binaria_lcg(x):
    return ((x * 16807) % 2147483647)
def c48_busqueda_binaria_run():
    n = 4194304
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i * 3)
    x = 9
    hallados = 0
    for q in range(0, 300000):
        x = c48_busqueda_binaria_lcg(x)
        clave = (x % (n * 3))
        lo = 0
        hi = (n - 1)
        while (1 if lo <= hi else 0):
            mid = (((lo + hi)) // (2))
            if (1 if a[mid] == clave else 0):
                hallados = (hallados + 1)
                lo = (hi + 1)
            else:
                if (1 if a[mid] < clave else 0):
                    lo = (mid + 1)
                else:
                    hi = (mid - 1)
    return hallados
def c49_ventana_run():
    n = 10000000
    w = 1000
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 31)
    s = 0
    for i in range(0, w):
        s = (s + a[i])
    mx = s
    for i in range(w, n):
        s = ((s + a[i]) - a[(i - w)])
        if (1 if s > mx else 0):
            mx = s
    return mx
def c50_spmv_lcg(x):
    return ((x * 16807) % 2147483647)
def c50_spmv_run():
    n = 200000
    k = 10
    col = [0] * ((n * k))
    val = [0] * ((n * k))
    x = 3
    for i in range(0, (n * k)):
        x = c50_spmv_lcg(x)
        col[i] = (x % n)
        val[i] = (x % 7)
    v = [0] * (n)
    for i in range(0, n):
        v[i] = (i % 5)
    ys = [0] * (n)
    t = 0
    for r in range(0, 10):
        for i in range(0, n):
            s = 0
            for j in range(0, k):
                s = (s + (val[((i * k) + j)] * v[col[((i * k) + j)]]))
            ys[i] = s
        t = (t + ys[(r * 7)])
    return t
def c51_aos_run():
    n = 2000000
    p = [0] * ((n * 4))
    for i in range(0, n):
        p[(i * 4)] = (i % 10)
        p[((i * 4) + 1)] = (i % 7)
        p[((i * 4) + 2)] = (i % 5)
        p[((i * 4) + 3)] = 1
    for r in range(0, 10):
        for i in range(0, n):
            p[(i * 4)] = ((p[(i * 4)] + p[((i * 4) + 3)]) % 1000)
            p[((i * 4) + 1)] = ((p[((i * 4) + 1)] + p[(i * 4)]) % 1000)
    s = 0
    for i in range(0, n):
        s = (s + p[((i * 4) + 1)])
    return s
def c51_soa_run():
    n = 2000000
    x = [0] * (n)
    ys = [0] * (n)
    z = [0] * (n)
    m = [0] * (n)
    for i in range(0, n):
        x[i] = (i % 10)
        ys[i] = (i % 7)
        z[i] = (i % 5)
        m[i] = 1
    for r in range(0, 10):
        for i in range(0, n):
            x[i] = ((x[i] + m[i]) % 1000)
            ys[i] = ((ys[i] + x[i]) % 1000)
    s = 0
    for i in range(0, n):
        s = (s + ys[i])
    return s
def c52_indices_calculados_run():
    n = 8000000
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 100)
    s = 0
    for r in range(0, 3):
        for i in range(0, n):
            s = (s + a[(((i * 7919) + 13) % n)])
    return s
def c53_sin_comprobar_a_run():
    n = 4000000
    a = [0] * (n)
    for r in range(0, 10):
        for i in range(0, n):
            a[i] = (a[i] + (i % 5))
    s = 0
    for i in range(0, n):
        s = (s + a[i])
    return s
def c53_sin_comprobar_b_lcg(x):
    return ((x * 16807) % 2147483647)
def c53_sin_comprobar_b_run():
    n = 4000000
    a = [0] * (n)
    b = [0] * (n)
    x = 4
    for i in range(0, n):
        x = c53_sin_comprobar_b_lcg(x)
        b[i] = (x % n)
        a[i] = (i % 9)
    s = 0
    for r in range(0, 4):
        for i in range(0, n):
            s = (s + a[b[i]])
    return s
def c55_aritmetica_saturada_run():
    tope = 4000000000000000
    s = 3999999999000000
    for i in range(0, 40000000):
        s = (s + (i % 97))
        if (1 if s > tope else 0):
            s = (tope - (i % 1000))
    return s
def c56_div_mod_run():
    m = 1000003
    s = 0
    b = 2
    for i in range(1, 8000000):
        b = (((b * 31) + i) % m)
        s = ((s + ((b) // (7))) + (b % 13))
    return s
def c57_conversiones_run():
    s = 0
    for i in range(0, 30000000):
        r = (float(i) * 0.5)
        s = (s + (int(r) % 3))
    return s
def c59_criba10M_run():
    n = 10000000
    m = [0] * ((n + 1))
    for i in range(2, (n + 1)):
        m[i] = 1
    i = 2
    while (1 if (i * i) <= n else 0):
        if (1 if m[i] == 1 else 0):
            j = (i * i)
            while (1 if j <= n else 0):
                m[j] = 0
                j = (j + i)
        i = (i + 1)
    c = 0
    for k in range(2, (n + 1)):
        c = (c + m[k])
    return c
def c60_alias_run():
    n = 10000000
    a = [0] * (n)
    b = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 5)
        b[i] = (i % 3)
    for r in range(0, 10):
        for i in range(0, n):
            a[i] = ((a[i] + (3 * b[i])) % 1000)
    s = 0
    for i in range(0, n):
        s = (s + a[i])
    return s
def e76_directo_run():
    n = 16000000
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 7)
    s = 0
    for r in range(0, 6):
        for i in range(0, n):
            s = (s + a[i])
    return s
def e76_inverso_run():
    n = 16000000
    a = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 7)
    s = 0
    for r in range(0, 6):
        for i in range(0, n):
            s = (s + a[((n - 1) - i)])
    return s
def e77_matmul_bloques_run():
    n = 480
    bs = 48
    a = [0.0] * ((n * n))
    b = [0.0] * ((n * n))
    c = [0.0] * ((n * n))
    for i in range(0, n):
        for j in range(0, n):
            a[((i * n) + j)] = (float((((i * 7) + (j * 3)) % 10)) / 10.0)
            b[((i * n) + j)] = (float((((i * 5) + (j * 11)) % 10)) / 10.0)
    for ii in range(0, ((n) // (bs))):
        for kk in range(0, ((n) // (bs))):
            for jj in range(0, ((n) // (bs))):
                for i in range((ii * bs), ((ii + 1) * bs)):
                    for k in range((kk * bs), ((kk + 1) * bs)):
                        aik = a[((i * n) + k)]
                        for j in range((jj * bs), ((jj + 1) * bs)):
                            c[((i * n) + j)] = (c[((i * n) + j)] + (aik * b[((k * n) + j)]))
    t = 0.0
    for i in range(0, (n * n)):
        t = (t + c[i])
    return int((t * 1000.0))
def e78_lista_nodos_suelta(h):
    c = h
    while (1 if c != None else 0):
        sig = c.i
        0
        c = sig
def e78_lista_nodos_run():
    h = None
    for i in range(0, 5000000):
        h = Nodo((i % 11), 0, h, None)
    s = 0
    for r in range(0, 4):
        c = h
        while (1 if c != None else 0):
            s = (s + c.v)
            c = c.i
    e78_lista_nodos_suelta(h)
    return s
def e78_array_run():
    n = 5000000
    a = [0] * (n)
    for i in range(0, n):
        a[((n - 1) - i)] = (i % 11)
    s = 0
    for r in range(0, 4):
        for i in range(0, n):
            s = (s + a[i])
    return s
def e80_hash_colisiones_lcg(x):
    return ((x * 16807) % 2147483647)
def e80_hash_colisiones_run():
    tam = 4194304
    claves = [0] * (tam)
    vals = [0] * (tam)
    x = 11
    hallados = 0
    for i in range(0, 2000000):
        x = e80_hash_colisiones_lcg(x)
        k = (x + 1)
        h = ((k * 40503) % tam)
        while (1 if ((1 if claves[h] != 0 else 0) and (1 if claves[h] != k else 0)) else 0):
            h = ((h + 1) % tam)
        claves[h] = k
        vals[h] = i
    x = 11
    for i in range(0, 2000000):
        x = e80_hash_colisiones_lcg(x)
        k = (x + 1)
        h = ((k * 40503) % tam)
        while (1 if ((1 if claves[h] != 0 else 0) and (1 if claves[h] != k else 0)) else 0):
            h = ((h + 1) % tam)
        if (1 if claves[h] == k else 0):
            hallados = (hallados + (vals[h] % 7))
    return hallados
def e81_copia_memoria_run():
    n = 8000000
    a = [0] * (n)
    b = [0] * (n)
    for i in range(0, n):
        a[i] = (i % 13)
    for r in range(0, 20):
        for i in range(0, n):
            b[i] = a[i]
        a[r] = b[(r + 1)]
    s = 0
    for i in range(0, n):
        s = (s + b[i])
    return s
def e82_pointer_chasing_lcg(x):
    return ((x * 16807) % 2147483647)
def e82_pointer_chasing_run():
    n = 4194304
    p = [0] * (n)
    for i in range(0, n):
        p[i] = i
    x = 17
    for i in range(1, n):
        x = e82_pointer_chasing_lcg(x)
        j = (x % (i + 1))
        t = p[i]
        p[i] = p[j]
        p[j] = t
    c = 0
    s = 0
    for k in range(0, 3000000):
        c = p[c]
        s = (s + (c % 3))
    return s
def e82_pointer_chasing_nodos_lcg(x):
    return ((x * 16807) % 2147483647)
def e82_pointer_chasing_nodos_run():
    n = 1000000
    g = [None] * (n)
    for i in range(0, n):
        g[i] = Nodo(i, 0, None, None)
    x = 17
    ord = [0] * (n)
    for i in range(0, n):
        ord[i] = i
    for i in range(1, n):
        x = e82_pointer_chasing_nodos_lcg(x)
        j = (x % (i + 1))
        t = ord[i]
        ord[i] = ord[j]
        ord[j] = t
    for i in range(0, n):
        g[ord[i]].i = g[ord[((i + 1) % n)]]
    c = g[0]
    s = 0
    for k in range(0, 2000000):
        c = c.i
        s = (s + (c.v % 3))
    for i in range(0, n):
        0
    return s
def e85_primer_acceso_run():
    n = 33554432
    a = [0] * (n)
    s = 0
    for i in range(0, n):
        a[i] = i
    for i in range(0, n):
        s = (s + (a[i] % 5))
    return s
def principal():
    if sel is None or sel == "a01_arbol_masivo":
        t0 = time.perf_counter(); r = a01_arbol_masivo_run(); print("a01_arbol_masivo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a02_ciclos":
        t0 = time.perf_counter(); r = a02_ciclos_run(); print("a02_ciclos = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a03_grafo_social":
        t0 = time.perf_counter(); r = a03_grafo_social_run(); print("a03_grafo_social = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a04_vida_corta":
        t0 = time.perf_counter(); r = a04_vida_corta_run(); print("a04_vida_corta = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a05_vida_larga":
        t0 = time.perf_counter(); r = a05_vida_larga_run(); print("a05_vida_larga = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a06_asignar_soltar":
        t0 = time.perf_counter(); r = a06_asignar_soltar_run(); print("a06_asignar_soltar = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a07_listas_anidadas":
        t0 = time.perf_counter(); r = a07_listas_anidadas_run(); print("a07_listas_anidadas = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a08_cache_desalojo":
        t0 = time.perf_counter(); r = a08_cache_desalojo_run(); print("a08_cache_desalojo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a10_persistente":
        t0 = time.perf_counter(); r = a10_persistente_run(); print("a10_persistente = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a13_matriz_dispersa":
        t0 = time.perf_counter(); r = a13_matriz_dispersa_run(); print("a13_matriz_dispersa = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a14_churn_puro":
        t0 = time.perf_counter(); r = a14_churn_puro_run(); print("a14_churn_puro = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a15_ast_compilador":
        t0 = time.perf_counter(); r = a15_ast_compilador_run(); print("a15_ast_compilador = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a18_heap":
        t0 = time.perf_counter(); r = a18_heap_run(); print("a18_heap = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a18_arena":
        t0 = time.perf_counter(); r = a18_arena_run(); print("a18_arena = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "a20_soltar_heap":
        t0 = time.perf_counter(); r = a20_soltar_heap_run(); print("a20_soltar_heap = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b21_fib36":
        t0 = time.perf_counter(); r = b21_fib36_run(); print("b21_fib36 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b22_ackermann_6":
        t0 = time.perf_counter(); r = b22_ackermann_6_run(); print("b22_ackermann_6 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b22_ackermann_8":
        t0 = time.perf_counter(); r = b22_ackermann_8_run(); print("b22_ackermann_8 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b23_hanoi27":
        t0 = time.perf_counter(); r = b23_hanoi27_run(); print("b23_hanoi27 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b24_arbol_perfecto":
        t0 = time.perf_counter(); r = b24_arbol_perfecto_run(); print("b24_arbol_perfecto = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b25_quicksort_ordenado":
        t0 = time.perf_counter(); r = b25_quicksort_ordenado_run(); print("b25_quicksort_ordenado = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b26_recursion_mutua":
        t0 = time.perf_counter(); r = b26_recursion_mutua_run(); print("b26_recursion_mutua = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b27_nreinas":
        t0 = time.perf_counter(); r = b27_nreinas_run(); print("b27_nreinas = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b28_acumulador":
        t0 = time.perf_counter(); r = b28_acumulador_run(); print("b28_acumulador = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b30_lista_recursiva":
        t0 = time.perf_counter(); r = b30_lista_recursiva_run(); print("b30_lista_recursiva = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b31_fib_recursivo30":
        t0 = time.perf_counter(); r = b31_fib_recursivo30_run(); print("b31_fib_recursivo30 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b31_fib_iterativo":
        t0 = time.perf_counter(); r = b31_fib_iterativo_run(); print("b31_fib_iterativo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b32_muchas_locales":
        t0 = time.perf_counter(); r = b32_muchas_locales_run(); print("b32_muchas_locales = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b33_retorna_estructuras":
        t0 = time.perf_counter(); r = b33_retorna_estructuras_run(); print("b33_retorna_estructuras = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b35_descenso_recursivo":
        t0 = time.perf_counter(); r = b35_descenso_recursivo_run(); print("b35_descenso_recursivo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b37_catalan":
        t0 = time.perf_counter(); r = b37_catalan_run(); print("b37_catalan = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b38_catalan_memo":
        t0 = time.perf_counter(); r = b38_catalan_memo_run(); print("b38_catalan_memo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b39_dfs_profundo":
        t0 = time.perf_counter(); r = b39_dfs_profundo_run(); print("b39_dfs_profundo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b39_dfs_cadena_larga":
        t0 = time.perf_counter(); r = b39_dfs_cadena_larga_run(); print("b39_dfs_cadena_larga = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "b40_sobrecoste_llamada":
        t0 = time.perf_counter(); r = b40_sobrecoste_llamada_run(); print("b40_sobrecoste_llamada = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c41_matmul500":
        t0 = time.perf_counter(); r = c41_matmul500_run(); print("c41_matmul500 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c42_lcs6000":
        t0 = time.perf_counter(); r = c42_lcs6000_run(); print("c42_lcs6000 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c43_editdist5000":
        t0 = time.perf_counter(); r = c43_editdist5000_run(); print("c43_editdist5000 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c44_floyd400":
        t0 = time.perf_counter(); r = c44_floyd400_run(); print("c44_floyd400 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c45_mochila3000":
        t0 = time.perf_counter(); r = c45_mochila3000_run(); print("c45_mochila3000 = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c46_columnas":
        t0 = time.perf_counter(); r = c46_columnas_run(); print("c46_columnas = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c47_acceso_aleatorio":
        t0 = time.perf_counter(); r = c47_acceso_aleatorio_run(); print("c47_acceso_aleatorio = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c48_busqueda_binaria":
        t0 = time.perf_counter(); r = c48_busqueda_binaria_run(); print("c48_busqueda_binaria = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c49_ventana":
        t0 = time.perf_counter(); r = c49_ventana_run(); print("c49_ventana = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c50_spmv":
        t0 = time.perf_counter(); r = c50_spmv_run(); print("c50_spmv = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c51_aos":
        t0 = time.perf_counter(); r = c51_aos_run(); print("c51_aos = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c51_soa":
        t0 = time.perf_counter(); r = c51_soa_run(); print("c51_soa = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c52_indices_calculados":
        t0 = time.perf_counter(); r = c52_indices_calculados_run(); print("c52_indices_calculados = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c53_sin_comprobar_a":
        t0 = time.perf_counter(); r = c53_sin_comprobar_a_run(); print("c53_sin_comprobar_a = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c53_sin_comprobar_b":
        t0 = time.perf_counter(); r = c53_sin_comprobar_b_run(); print("c53_sin_comprobar_b = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c55_aritmetica_saturada":
        t0 = time.perf_counter(); r = c55_aritmetica_saturada_run(); print("c55_aritmetica_saturada = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c56_div_mod":
        t0 = time.perf_counter(); r = c56_div_mod_run(); print("c56_div_mod = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c57_conversiones":
        t0 = time.perf_counter(); r = c57_conversiones_run(); print("c57_conversiones = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c59_criba10M":
        t0 = time.perf_counter(); r = c59_criba10M_run(); print("c59_criba10M = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "c60_alias":
        t0 = time.perf_counter(); r = c60_alias_run(); print("c60_alias = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e76_directo":
        t0 = time.perf_counter(); r = e76_directo_run(); print("e76_directo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e76_inverso":
        t0 = time.perf_counter(); r = e76_inverso_run(); print("e76_inverso = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e77_matmul_bloques":
        t0 = time.perf_counter(); r = e77_matmul_bloques_run(); print("e77_matmul_bloques = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e78_lista_nodos":
        t0 = time.perf_counter(); r = e78_lista_nodos_run(); print("e78_lista_nodos = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e78_array":
        t0 = time.perf_counter(); r = e78_array_run(); print("e78_array = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e80_hash_colisiones":
        t0 = time.perf_counter(); r = e80_hash_colisiones_run(); print("e80_hash_colisiones = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e81_copia_memoria":
        t0 = time.perf_counter(); r = e81_copia_memoria_run(); print("e81_copia_memoria = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e82_pointer_chasing":
        t0 = time.perf_counter(); r = e82_pointer_chasing_run(); print("e82_pointer_chasing = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e82_pointer_chasing_nodos":
        t0 = time.perf_counter(); r = e82_pointer_chasing_nodos_run(); print("e82_pointer_chasing_nodos = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
    if sel is None or sel == "e85_primer_acceso":
        t0 = time.perf_counter(); r = e85_primer_acceso_run(); print("e85_primer_acceso = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
threading.stack_size(512 * 1024 * 1024)
h = threading.Thread(target=principal)
h.start()
h.join()
