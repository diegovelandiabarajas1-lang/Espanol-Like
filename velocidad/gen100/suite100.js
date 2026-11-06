// suite100.js — los benchmarks "para romper un lenguaje", escritos una vez en el mini-lenguaje de gen.js.
// Reglas (las mismas de gen22): ints < 2^53, % e idiv solo con no negativos, de los reales solo + − × ÷ y raíz; cada benchmark devuelve un int.
// Nuevo: nodo (campos v, w: int · i, d: nodo), nulo, nuevo(v, w, i, d), liberar(nodo), arr_nodo / newnodo(n), liberar_arr(a), us() (reloj en µs).
// En C, liberar/liberar_arr liberan de verdad; en los lenguajes con memoria automática no hacen nada.
'use strict';
const SUITE = [];
const P = (nombre, grupo, desc, src, meta) => SUITE.push(Object.assign({ nombre, grupo, desc, src }, meta || {}));
const LCG = 'fn lcg(x: int): int { return (x * 16807) % 2147483647; }';
const SOLTAR_ARBOL = 'fn soltar(n: nodo) { if (n == nulo) { return; } soltar(n.i); soltar(n.d); liberar(n); }';
const SOLTAR_LISTA = 'fn suelta(h: nodo) { let c: nodo = h; while (c != nulo) { let sig: nodo = c.i; liberar(c); c = sig; } }';

// ═══════════════ Grupo A · memoria y objetos ═══════════════
P('a01_arbol_masivo', 'A', 'árbol binario de 1M de nodos: construir, sumar, destruir (×3)', `
fn construir(d: int): nodo { if (d == 0) { return nulo; } return nuevo(d, 0, construir(d - 1), construir(d - 1)); }
fn suma(n: nodo): int { if (n == nulo) { return 0; } return n.v + suma(n.i) + suma(n.d); }
${SOLTAR_ARBOL}
fn run(): int { let t: int = 0; for r in 0..3 { let a: nodo = construir(20); t = t + suma(a); soltar(a); } return t; }`);

P('a02_ciclos', 'A', 'anillos de 50k nodos creados y abandonados (×60): un conteo de referencias no los libera', `
fn anillo(n: int): nodo { let h: nodo = nuevo(0, 0, nulo, nulo); let c: nodo = h; for k in 1..n { let x: nodo = nuevo(k, 0, nulo, nulo); c.i = x; c = x; } c.i = h; return h; }
fn suma(h: nodo, n: int): int { let s: int = 0; let c: nodo = h; for k in 0..n { s = s + c.v; c = c.i; } return s; }
fn libera(h: nodo, n: int) { let c: nodo = h; for k in 0..n { let sig: nodo = c.i; liberar(c); c = sig; } }
fn run(): int { let t: int = 0; for r in 0..60 { let h: nodo = anillo(50000); t = t + suma(h, 50000); libera(h, 50000); } return t; }`);

P('a03_grafo_social', 'A', 'grafo de 100k nodos y 600k aristas (listas de adyacencia en nodos) + BFS', `
${LCG}
fn run(): int {
  let n: int = 100000; let m: int = 600000; let ady: arr_nodo = newnodo(n); let x: int = 12345;
  for e in 0..m { x = lcg(x); let a: int = x % n; x = lcg(x); let b: int = x % n; ady[a] = nuevo(b, 0, ady[a], nulo); ady[b] = nuevo(a, 0, ady[b], nulo); }
  let vis: arr_int = newint(n); let cola: arr_int = newint(n); let h: int = 0; let t: int = 1; cola[0] = 0; vis[0] = 1; let suma: int = 0;
  while (h < t) { let u: int = cola[h]; h = h + 1; suma = suma + u; let ed: nodo = ady[u]; while (ed != nulo) { let w: int = ed.v; if (vis[w] == 0) { vis[w] = 1; cola[t] = w; t = t + 1; } ed = ed.i; } }
  for u in 0..n { let ed2: nodo = ady[u]; while (ed2 != nulo) { let sig: nodo = ed2.i; liberar(ed2); ed2 = sig; } }
  return suma % 1000003 * 1000 + t % 1000;
}`);

P('a04_vida_corta', 'A', '20M de objetos pequeños de vida corta (nacen y mueren en la iteración)', `
fn run(): int { let s: int = 0; for i in 0..20000000 { let ob: nodo = nuevo(i, 0, nulo, nulo); s = s + ob.v % 7; liberar(ob); } return s; }`);

P('a05_vida_larga', 'A', '1M de objetos retenidos todo el tiempo + 2M de objetos efímeros que apuntan a ellos', `
fn run(): int {
  let n: int = 1000000; let g: arr_nodo = newnodo(n);
  for i in 0..n { g[i] = nuevo(i, 0, nulo, nulo); }
  let s: int = 0;
  for r in 0..2000000 { let ob: nodo = nuevo(r, 0, g[r % n], nulo); s = s + ob.i.v % 5; liberar(ob); }
  for i in 0..n { s = s + g[i].v % 3; liberar(g[i]); }
  return s;
}`);

P('a06_asignar_soltar', 'A', 'asignar un arreglo de 2000 enteros, soltarlo y asignar otro (×150k)', `
fn run(): int { let a: arr_int = newint(2000); let s: int = 0; for i in 0..150000 { liberar_arr(a); a = newint(2000); a[i % 2000] = i; s = s + a[(i * 7) % 2000]; } liberar_arr(a); return s; }`);

P('a07_listas_anidadas', 'A', '500 filas de 500 nodos que se reconstruyen sin parar (listas de listas)', `
fn fila(n: int, base: int): nodo { let h: nodo = nulo; for k in 0..n { h = nuevo(base + k, 0, h, nulo); } return h; }
${SOLTAR_LISTA}
fn suma(h: nodo): int { let s: int = 0; let c: nodo = h; while (c != nulo) { s = s + c.v % 11; c = c.i; } return s; }
fn run(): int { let filas: arr_nodo = newnodo(500); let t: int = 0; for r in 0..4000 { let j: int = r % 500; suelta(filas[j]); filas[j] = fila(500, r); t = t + suma(filas[j]); } for j in 0..500 { suelta(filas[j]); } return t; }`);

P('a08_cache_desalojo', 'A', 'caché de 50k ranuras con desalojo: 3M de operaciones, los objetos mueren y nacen', `
${LCG}
fn run(): int {
  let tam: int = 50000; let c: arr_nodo = newnodo(tam); let x: int = 777; let ac: int = 0;
  for op in 0..3000000 {
    x = lcg(x); let k: int = x % 200000; let slot: int = k % tam; let e: nodo = c[slot];
    if (e != nulo && e.v == k) { ac = ac + 1; } else { if (e != nulo) { liberar(e); } c[slot] = nuevo(k, 0, nulo, nulo); }
  }
  return ac;
}`);

P('a10_persistente', 'A', 'lista persistente (copy-on-write): 1.5M versiones que comparten cola', `
fn run(): int {
  let n: int = 1500000; let vers: arr_nodo = newnodo(800); let cur: nodo = nulo; let s: int = 0;
  for i in 0..n { cur = nuevo(i, 0, cur, nulo); if (i % 2000 == 0) { vers[idiv(i, 2000)] = cur; } }
  for k in 0..200 { let c: nodo = vers[k]; let m: int = 0; while (c != nulo && m < 200) { s = s + c.v % 3; c = c.i; m = m + 1; } }
  return s;
}`);

P('a13_matriz_dispersa', 'A', 'matriz dispersa de 20k filas con celdas asignadas dinámicamente (listas por fila) × 10 productos', `
${LCG}
fn run(): int {
  let n: int = 20000; let filas: arr_nodo = newnodo(n); let x: int = 99;
  for r in 0..n { for k in 0..20 { x = lcg(x); filas[r] = nuevo(x % n, x % 100, filas[r], nulo); } }
  let vec: arr_int = newint(n); for j in 0..n { vec[j] = j % 13; }
  let t: int = 0;
  for rep in 0..10 { for r in 0..n { let c: nodo = filas[r]; let s: int = 0; while (c != nulo) { s = s + c.w * vec[c.v]; c = c.i; } t = t + s % 1000; } }
  for r in 0..n { let c2: nodo = filas[r]; while (c2 != nulo) { let sig: nodo = c2.i; liberar(c2); c2 = sig; } }
  return t;
}`);

P('a14_churn_puro', 'A', 'crear y destruir una cadena de 3 objetos en el mismo bucle (20M veces)', `
fn run(): int { let s: int = 0; for i in 0..20000000 { let a: nodo = nuevo(i, 0, nulo, nulo); let b: nodo = nuevo(i + 1, 0, a, nulo); let c: nodo = nuevo(i + 2, 0, b, nulo); s = s + c.i.i.v % 5; liberar(a); liberar(b); liberar(c); } return s; }`);

P('a15_ast_compilador', 'A', 'AST de 262k nodos: construir, evaluar y destruir (×5)', `
fn construir(d: int, s: int): nodo { if (d == 0) { return nuevo(0, s % 10, nulo, nulo); } return nuevo(1 + s % 3, 0, construir(d - 1, (s * 7 + 1) % 1000003), construir(d - 1, (s * 13 + 5) % 1000003)); }
fn evalua(n: nodo): int { if (n.v == 0) { return n.w; } let a: int = evalua(n.i); let b: int = evalua(n.d); if (n.v == 1) { return (a + b) % 1000003; } if (n.v == 2) { return (a * b) % 1000003; } return (a + 1000003 - b) % 1000003; }
${SOLTAR_ARBOL}
fn run(): int { let t: int = 0; for r in 0..5 { let a: nodo = construir(17, r + 1); t = t + evalua(a); soltar(a); } return t; }`);

P('a18_heap', 'A', 'lista enlazada de 3M de nodos en el heap: construir, sumar, soltar (×2)', `
${SOLTAR_LISTA}
fn run(): int { let t: int = 0; for r in 0..2 { let h: nodo = nulo; for i in 0..3000000 { h = nuevo(i, 0, h, nulo); } let c: nodo = h; while (c != nulo) { t = t + c.v % 3; c = c.i; } suelta(h); } return t; }`);

P('a18_arena', 'A', 'la misma lista enlazada en una arena (arreglos de índices), sin asignar objetos', `
fn run(): int { let n: int = 3000000; let val: arr_int = newint(n); let nxt: arr_int = newint(n); let t: int = 0;
  for r in 0..2 { let h: int = 0 - 1; for i in 0..n { val[i] = i; nxt[i] = h; h = i; } let c: int = h; while (c >= 0) { t = t + val[c] % 3; c = nxt[c]; } }
  return t; }`);

P('a20_soltar_heap', 'A', 'proxy de la pausa: tiempo (µs) de soltar de golpe una lista de 300k nodos', `
${SOLTAR_LISTA}
fn run(): int { let h: nodo = nulo; for i in 0..300000 { h = nuevo(i, 0, h, nulo); } let t0: int = us(); suelta(h); h = nulo; return us() - t0; }`, { nodet: true });

// ═══════════════ Grupo B · recursión ═══════════════
P('b21_fib36', 'B', 'fib(36) recursivo puro', `
fn fib(n: int): int { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
fn run(): int { return fib(36); }`);

P('b22_ackermann_6', 'B', 'Ackermann(3, 6) × 300 (profundidad ~510)', `
fn ack(m: int, n: int): int { if (m == 0) { return n + 1; } if (n == 0) { return ack(m - 1, 1); } return ack(m - 1, ack(m, n - 1)); }
fn run(): int { let t: int = 0; for r in 0..300 { t = t + ack(3, 6); } return t; }`);

P('b22_ackermann_8', 'B', 'Ackermann(3, 8) (profundidad ~2050: pasa del límite de Ñ)', `
fn ack(m: int, n: int): int { if (m == 0) { return n + 1; } if (n == 0) { return ack(m - 1, 1); } return ack(m - 1, ack(m, n - 1)); }
fn run(): int { return ack(3, 8); }`);

P('b23_hanoi27', 'B', 'torres de Hanoi con 27 discos (134M de llamadas)', `
fn mueve(n: int, a: int): int { if (n == 0) { return a % 2; } return mueve(n - 1, a + 1) + mueve(n - 1, a + 2) + 1; }
fn run(): int { return mueve(27, 0); }`);

P('b24_arbol_perfecto', 'B', 'árbol perfecto de 18 niveles recorrido 40 veces (recursivo)', `
fn construir(d: int): nodo { if (d == 0) { return nulo; } return nuevo(d, 0, construir(d - 1), construir(d - 1)); }
fn suma(n: nodo): int { if (n == nulo) { return 0; } return n.v + suma(n.i) + suma(n.d); }
${SOLTAR_ARBOL}
fn run(): int { let a: nodo = construir(18); let t: int = 0; for r in 0..40 { t = t + suma(a); } soltar(a); return t; }`);

P('b25_quicksort_ordenado', 'B', 'quicksort recursivo (pivote al final) sobre 5000 elementos ya ordenados: profundidad 5000', `
fn part(a: arr_int, lo: int, hi: int): int { let p: int = a[hi]; let i: int = lo; for j in lo..hi { if (a[j] < p) { let t: int = a[i]; a[i] = a[j]; a[j] = t; i = i + 1; } } let t2: int = a[i]; a[i] = a[hi]; a[hi] = t2; return i; }
fn qs(a: arr_int, lo: int, hi: int) { if (lo < hi) { let p: int = part(a, lo, hi); qs(a, lo, p - 1); qs(a, p + 1, hi); } }
fn run(): int { let n: int = 5000; let a: arr_int = newint(n); for i in 0..n { a[i] = i; } qs(a, 0, n - 1); let s: int = 0; for i in 0..n { s = s + a[i] * (i % 7); } return s; }`);

P('b26_recursion_mutua', 'B', 'es_par / es_impar mutuamente recursivas, profundidad 700, 300000 veces', `
fn par(n: int): int { if (n == 0) { return 1; } return impar(n - 1); }
fn impar(n: int): int { if (n == 0) { return 0; } return par(n - 1); }
fn run(): int { let s: int = 0; for r in 0..300000 { s = s + par(700 + r % 2); } return s; }`);

P('b27_nreinas', 'B', 'N-Reinas 11 con retroceso recursivo', `
fn pon(f: int, n: int, cols: arr_int, d1: arr_int, d2: arr_int): int {
  if (f == n) { return 1; }
  let c: int = 0;
  for k in 0..n { if (cols[k] == 0 && d1[f + k] == 0 && d2[f + n - k] == 0) { cols[k] = 1; d1[f + k] = 1; d2[f + n - k] = 1; c = c + pon(f + 1, n, cols, d1, d2); cols[k] = 0; d1[f + k] = 0; d2[f + n - k] = 0; } }
  return c;
}
fn run(): int { let n: int = 11; return pon(0, n, newint(n), newint(2 * n), newint(2 * n + 1)); }`);

P('b28_acumulador', 'B', 'recursión con acumulador (estilo cola) de profundidad 800, 50000 veces', `
fn suma(n: int, acc: int): int { if (n == 0) { return acc; } return suma(n - 1, acc + n); }
fn run(): int { let s: int = 0; for r in 0..50000 { s = s + suma(800, r) % 1000; } return s; }`);

P('b30_lista_recursiva', 'B', 'recorrer recursivamente una lista enlazada de 100k nodos (profundidad 100k)', `
fn largo(n: nodo): int { if (n == nulo) { return 0; } return 1 + largo(n.i); }
${SOLTAR_LISTA}
fn run(): int { let h: nodo = nulo; for i in 0..100000 { h = nuevo(i, 0, h, nulo); } let t: int = largo(h); suelta(h); return t; }`);

P('b31_fib_recursivo30', 'B', 'fib(30) recursivo × 30 (para comparar con la versión iterativa)', `
fn fib(n: int): int { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
fn run(): int { let s: int = 0; for r in 0..30 { s = s + fib(30) % 1000; } return s; }`);

P('b31_fib_iterativo', 'B', 'fib(30) iterativo × 600k (mismo cálculo sin recursión)', `
fn fib(n: int): int { let a: int = 0; let b: int = 1; for i in 0..n { let t: int = (a + b) % 1000003; a = b; b = t; } return a; }
fn run(): int { let s: int = 0; for r in 0..600000 { s = s + fib(30) % 1000; } return s; }`);

P('b32_muchas_locales', 'B', 'recursión de 22 niveles (ramificación 2) con 10 variables locales por marco', `
fn f(n: int, a: int): int {
  if (n == 0) { return a; }
  let b1: int = a + 1; let b2: int = b1 * 3 % 1009; let b3: int = b2 + b1; let b4: int = b3 * 5 % 1013; let b5: int = b4 + b2; let b6: int = b5 * 7 % 1019;
  let b7: int = b6 + b3; let b8: int = b7 * 11 % 1021; let b9: int = b8 + b5; let b10: int = b9 * 13 % 1031;
  return (f(n - 1, b10) + f(n - 1, b7 + b4)) % 1000003;
}
fn run(): int { return f(22, 5); }`);

P('b33_retorna_estructuras', 'B', 'cada llamada devuelve un arreglo de 8 enteros (recursión de 21 niveles)', `
fn gen(d: int): arr_int {
  if (d == 0) { let a: arr_int = newint(8); for k in 0..8 { a[k] = k + 1; } return a; }
  let x: arr_int = gen(d - 1); let ys: arr_int = gen(d - 1); let r: arr_int = newint(8);
  for k in 0..8 { r[k] = (x[k] + ys[(k + 1) % 8]) % 1000003; }
  liberar_arr(x); liberar_arr(ys); return r;
}
fn run(): int { let a: arr_int = gen(21); let s: int = 0; for k in 0..8 { s = s + a[k]; } return s; }`);

P('b35_descenso_recursivo', 'B', 'analizador de descenso recursivo sobre una expresión de ~100k tokens (×20)', `
fn gen(t: arr_int, p: arr_int, d: int, s: int) {
  if (d == 0) { t[p[0]] = s % 9 + 1; p[0] = p[0] + 1; return; }
  if (s % 3 == 0) { t[p[0]] = 0 - 1; p[0] = p[0] + 1; gen(t, p, d - 1, (s * 7 + 1) % 10007); t[p[0]] = 0 - 2; p[0] = p[0] + 1; return; }
  gen(t, p, d - 1, (s * 13 + 5) % 10007);
  if (s % 2 == 0) { t[p[0]] = 0 - 3; } else { t[p[0]] = 0 - 4; }
  p[0] = p[0] + 1;
  gen(t, p, d - 1, (s * 11 + 3) % 10007);
}
fn factor(t: arr_int, p: arr_int): int { let k: int = t[p[0]]; if (k == 0 - 1) { p[0] = p[0] + 1; let v: int = expr(t, p); p[0] = p[0] + 1; return v; } p[0] = p[0] + 1; return k; }
fn term(t: arr_int, p: arr_int): int { let v: int = factor(t, p); while (t[p[0]] == 0 - 4) { p[0] = p[0] + 1; v = v * factor(t, p) % 1000003; } return v; }
fn expr(t: arr_int, p: arr_int): int { let v: int = term(t, p); while (t[p[0]] == 0 - 3) { p[0] = p[0] + 1; v = (v + term(t, p)) % 1000003; } return v; }
fn run(): int { let t: arr_int = newint(1000000); let p: arr_int = newint(1); gen(t, p, 15, 5); t[p[0]] = 0 - 9; let s: int = 0; for r in 0..20 { p[0] = 0; s = s + expr(t, p); } return s + p[0]; }`);

P('b37_catalan', 'B', 'números de Catalan por recursión doble (Cat(15), sin memoria)', `
fn cat(n: int): int { if (n <= 1) { return 1; } let s: int = 0; for i in 0..n { s = s + cat(i) * cat(n - 1 - i); } return s; }
fn run(): int { return cat(15); }`);

P('b38_catalan_memo', 'B', 'Catalan con memoización recursiva (n=700, ×100)', `
fn cat(n: int, m: arr_int): int { if (n <= 1) { return 1; } if (m[n] != 0) { return m[n]; } let s: int = 0; for i in 0..n { s = (s + cat(i, m) * cat(n - 1 - i, m)) % 1000003; } m[n] = s + 1; return m[n]; }
fn run(): int { let t: int = 0; for r in 0..100 { let m: arr_int = newint(701); t = t + cat(700, m) % 1000; } return t; }`);

P('b39_dfs_profundo', 'B', 'DFS recursivo sobre una cadena de 800 nodos (×3000)', `
fn dfs(u: int, n: int, vis: arr_int): int { vis[u] = 1; let s: int = u; if (u + 1 < n && vis[u + 1] == 0) { s = s + dfs(u + 1, n, vis); } return s % 1000003; }
fn run(): int { let t: int = 0; for r in 0..3000 { let vis: arr_int = newint(800); t = t + dfs(0, 800, vis); } return t; }`);

P('b39_dfs_cadena_larga', 'B', 'DFS recursivo sobre una cadena de 20000 nodos (pasa del límite de Ñ)', `
fn dfs(u: int, n: int, vis: arr_int): int { vis[u] = 1; let s: int = u; if (u + 1 < n && vis[u + 1] == 0) { s = s + dfs(u + 1, n, vis); } return s % 1000003; }
fn run(): int { let vis: arr_int = newint(20000); return dfs(0, 20000, vis); }`);

P('b40_sobrecoste_llamada', 'B', 'llamadas a funciones pequeñas encadenadas 15M de veces', `
fn f1(x: int): int { return x + 1; }
fn f2(x: int): int { return f1(x) * 3 % 1000003; }
fn f3(x: int): int { return f2(x) + f1(x); }
fn run(): int { let a: int = 1; for i in 0..15000000 { a = f3(a) % 1000003; } return a; }`);

// ═══════════════ Grupo C · comprobaciones de índice ═══════════════
P('c41_matmul500', 'C', 'multiplicación de matrices 500×500', `
fn run(): int {
  let n: int = 500; let a: arr_real = newreal(n * n); let b: arr_real = newreal(n * n); let c: arr_real = newreal(n * n);
  for i in 0..n { for j in 0..n { a[i * n + j] = real((i * 7 + j * 3) % 10) / 10.0; b[i * n + j] = real((i * 5 + j * 11) % 10) / 10.0; } }
  for i in 0..n { for j in 0..n { let s: real = 0.0; for k in 0..n { s = s + a[i * n + k] * b[k * n + j]; } c[i * n + j] = s; } }
  let t: real = 0.0; for i in 0..n * n { t = t + c[i]; } return int(t * 1000.0);
}`);

P('c42_lcs6000', 'C', 'subsecuencia común más larga, cadenas de 6000', `
${LCG}
fn run(): int {
  let n: int = 6000; let s: arr_int = newint(n); let t: arr_int = newint(n); let x: int = 777;
  for i in 0..n { x = lcg(x); s[i] = x % 4; x = lcg(x); t[i] = x % 4; }
  let prev: arr_int = newint(n + 1); let cur: arr_int = newint(n + 1);
  for i in 1..n + 1 { for j in 1..n + 1 { if (s[i - 1] == t[j - 1]) { cur[j] = prev[j - 1] + 1; } else { if (prev[j] > cur[j - 1]) { cur[j] = prev[j]; } else { cur[j] = cur[j - 1]; } } } for j in 0..n + 1 { prev[j] = cur[j]; } }
  return prev[n];
}`);

P('c43_editdist5000', 'C', 'distancia de edición (Levenshtein), cadenas de 5000', `
${LCG}
fn run(): int {
  let n: int = 5000; let s: arr_int = newint(n); let t: arr_int = newint(n); let x: int = 31;
  for i in 0..n { x = lcg(x); s[i] = x % 4; x = lcg(x); t[i] = x % 4; }
  let prev: arr_int = newint(n + 1); let cur: arr_int = newint(n + 1);
  for j in 0..n + 1 { prev[j] = j; }
  for i in 1..n + 1 { cur[0] = i; for j in 1..n + 1 { let costo: int = 1; if (s[i - 1] == t[j - 1]) { costo = 0; } let mejor: int = prev[j - 1] + costo; if (prev[j] + 1 < mejor) { mejor = prev[j] + 1; } if (cur[j - 1] + 1 < mejor) { mejor = cur[j - 1] + 1; } cur[j] = mejor; } for j in 0..n + 1 { prev[j] = cur[j]; } }
  return prev[n];
}`);

P('c44_floyd400', 'C', 'Floyd–Warshall en un grafo denso de 400 nodos', `
${LCG}
fn run(): int {
  let n: int = 400; let d: arr_int = newint(n * n); let x: int = 5;
  for i in 0..n { for j in 0..n { x = lcg(x); d[i * n + j] = x % 100 + 1; } d[i * n + i] = 0; }
  for k in 0..n { for i in 0..n { for j in 0..n { let v: int = d[i * n + k] + d[k * n + j]; if (v < d[i * n + j]) { d[i * n + j] = v; } } } }
  let s: int = 0; for i in 0..n * n { s = s + d[i]; } return s;
}`);

P('c45_mochila3000', 'C', 'mochila: 3000 ítems, capacidad 20000', `
${LCG}
fn run(): int {
  let n: int = 3000; let cap: int = 20000; let w: arr_int = newint(n); let v: arr_int = newint(n); let x: int = 31;
  for i in 0..n { x = lcg(x); w[i] = 1 + x % 50; x = lcg(x); v[i] = x % 100; }
  let dp: arr_int = newint(cap + 1);
  for i in 0..n { let c: int = cap; while (c >= w[i]) { let cand: int = dp[c - w[i]] + v[i]; if (cand > dp[c]) { dp[c] = cand; } c = c - 1; } }
  return dp[cap];
}`);

P('c46_columnas', 'C', 'sumar una matriz de 3000×3000 por columnas (acceso no secuencial) × 4', `
fn run(): int { let n: int = 3000; let a: arr_int = newint(n * n); for i in 0..n * n { a[i] = i % 17; } let s: int = 0;
  for r in 0..4 { for j in 0..n { for i in 0..n { s = s + a[i * n + j]; } } } return s; }`);

P('c47_acceso_aleatorio', 'C', 'acceso aleatorio a un arreglo de 16M de enteros (128 MB): 8M lecturas', `
${LCG}
fn run(): int { let n: int = 16777216; let a: arr_int = newint(n); for i in 0..n { a[i] = i % 1000; } let x: int = 1; let s: int = 0;
  for k in 0..8000000 { x = lcg(x); s = s + a[x % n]; } return s; }`);

P('c48_busqueda_binaria', 'C', 'búsqueda binaria en 4M enteros ordenados: 300k búsquedas', `
${LCG}
fn run(): int { let n: int = 4194304; let a: arr_int = newint(n); for i in 0..n { a[i] = i * 3; } let x: int = 9; let hallados: int = 0;
  for q in 0..300000 { x = lcg(x); let clave: int = x % (n * 3); let lo: int = 0; let hi: int = n - 1;
    while (lo <= hi) { let mid: int = idiv(lo + hi, 2); if (a[mid] == clave) { hallados = hallados + 1; lo = hi + 1; } else { if (a[mid] < clave) { lo = mid + 1; } else { hi = mid - 1; } } } }
  return hallados; }`);

P('c49_ventana', 'C', 'ventana deslizante de 1000 sobre 10M de enteros', `
fn run(): int { let n: int = 10000000; let w: int = 1000; let a: arr_int = newint(n); for i in 0..n { a[i] = i % 31; }
  let s: int = 0; for i in 0..w { s = s + a[i]; } let mx: int = s;
  for i in w..n { s = s + a[i] - a[i - w]; if (s > mx) { mx = s; } } return mx; }`);

P('c50_spmv', 'C', 'producto matriz dispersa (CSR, 2M elementos) por vector × 10: acceso indirecto', `
${LCG}
fn run(): int {
  let n: int = 200000; let k: int = 10; let col: arr_int = newint(n * k); let val: arr_int = newint(n * k); let x: int = 3;
  for i in 0..n * k { x = lcg(x); col[i] = x % n; val[i] = x % 7; }
  let v: arr_int = newint(n); for i in 0..n { v[i] = i % 5; } let ys: arr_int = newint(n); let t: int = 0;
  for r in 0..10 { for i in 0..n { let s: int = 0; for j in 0..k { s = s + val[i * k + j] * v[col[i * k + j]]; } ys[i] = s; } t = t + ys[r * 7]; }
  return t;
}`);

P('c51_aos', 'C', 'array de structs (x,y,z,m intercalados) · 2M partículas × 10 pasadas', `
fn run(): int { let n: int = 2000000; let p: arr_int = newint(n * 4); for i in 0..n { p[i * 4] = i % 10; p[i * 4 + 1] = i % 7; p[i * 4 + 2] = i % 5; p[i * 4 + 3] = 1; }
  for r in 0..10 { for i in 0..n { p[i * 4] = (p[i * 4] + p[i * 4 + 3]) % 1000; p[i * 4 + 1] = (p[i * 4 + 1] + p[i * 4]) % 1000; } }
  let s: int = 0; for i in 0..n { s = s + p[i * 4 + 1]; } return s; }`);

P('c51_soa', 'C', 'struct de arrays (x, ys, z, m separados) · 2M partículas × 10 pasadas', `
fn run(): int { let n: int = 2000000; let x: arr_int = newint(n); let ys: arr_int = newint(n); let z: arr_int = newint(n); let m: arr_int = newint(n);
  for i in 0..n { x[i] = i % 10; ys[i] = i % 7; z[i] = i % 5; m[i] = 1; }
  for r in 0..10 { for i in 0..n { x[i] = (x[i] + m[i]) % 1000; ys[i] = (ys[i] + x[i]) % 1000; } }
  let s: int = 0; for i in 0..n { s = s + ys[i]; } return s; }`);

P('c52_indices_calculados', 'C', 'índices calculados a[(i*7919+13) % n] (no es un simple i++) en 8M elementos × 3', `
fn run(): int { let n: int = 8000000; let a: arr_int = newint(n); for i in 0..n { a[i] = i % 100; } let s: int = 0;
  for r in 0..3 { for i in 0..n { s = s + a[(i * 7919 + 13) % n]; } } return s; }`);

P('c53_sin_comprobar_a', 'C', 'recorrido simple con índice de bucle (las comprobaciones se pueden demostrar innecesarias)', `
fn run(): int { let n: int = 4000000; let a: arr_int = newint(n); for r in 0..10 { for i in 0..n { a[i] = a[i] + i % 5; } } let s: int = 0; for i in 0..n { s = s + a[i]; } return s; }`);

P('c53_sin_comprobar_b', 'C', 'recolección a[b[i]] con índices que salen de otro arreglo (no se pueden demostrar)', `
${LCG}
fn run(): int { let n: int = 4000000; let a: arr_int = newint(n); let b: arr_int = newint(n); let x: int = 4; for i in 0..n { x = lcg(x); b[i] = x % n; a[i] = i % 9; }
  let s: int = 0; for r in 0..4 { for i in 0..n { s = s + a[b[i]]; } } return s; }`);

P('c55_aritmetica_saturada', 'C', 'acumulador con tope (saturación) y sumas cerca del límite de 2^53 · 40M iteraciones', `
fn run(): int { let tope: int = 4000000000000000; let s: int = 3999999999000000; for i in 0..40000000 { s = s + i % 97; if (s > tope) { s = tope - i % 1000; } } return s; }`);

P('c56_div_mod', 'C', 'división y resto en un bucle cerrado (cálculo de potencias modulares) · 8M', `
fn run(): int { let m: int = 1000003; let s: int = 0; let b: int = 2; for i in 1..8000000 { b = (b * 31 + i) % m; s = s + idiv(b, 7) + b % 13; } return s; }`);

P('c57_conversiones', 'C', 'int → real → int en un bucle (comprobaciones de rango) · 30M', `
fn run(): int { let s: int = 0; for i in 0..30000000 { let r: real = real(i) * 0.5; s = s + int(r) % 3; } return s; }`);

P('c59_criba10M', 'C', 'criba de Eratóstenes hasta 10M (arreglo de marcas)', `
fn run(): int { let n: int = 10000000; let m: arr_int = newint(n + 1); for i in 2..n + 1 { m[i] = 1; } let i: int = 2;
  while (i * i <= n) { if (m[i] == 1) { let j: int = i * i; while (j <= n) { m[j] = 0; j = j + i; } } i = i + 1; }
  let c: int = 0; for k in 2..n + 1 { c = c + m[k]; } return c; }`);

P('c60_alias', 'C', 'a[i] = a[i] + 3*b[i] con dos arreglos que podrían solaparse · 10M × 10', `
fn run(): int { let n: int = 10000000; let a: arr_int = newint(n); let b: arr_int = newint(n); for i in 0..n { a[i] = i % 5; b[i] = i % 3; }
  for r in 0..10 { for i in 0..n { a[i] = (a[i] + 3 * b[i]) % 1000; } } let s: int = 0; for i in 0..n { s = s + a[i]; } return s; }`);

// ═══════════════ Grupo E · memoria, caché y diseño ═══════════════
P('e76_directo', 'E', 'sumar 16M enteros en orden directo × 6', `
fn run(): int { let n: int = 16000000; let a: arr_int = newint(n); for i in 0..n { a[i] = i % 7; } let s: int = 0; for r in 0..6 { for i in 0..n { s = s + a[i]; } } return s; }`);

P('e76_inverso', 'E', 'sumar 16M enteros en orden inverso × 6', `
fn run(): int { let n: int = 16000000; let a: arr_int = newint(n); for i in 0..n { a[i] = i % 7; } let s: int = 0; for r in 0..6 { for i in 0..n { s = s + a[n - 1 - i]; } } return s; }`);

P('e77_matmul_bloques', 'E', 'matmul 480×480 por bloques de 48 (cache blocking)', `
fn run(): int {
  let n: int = 480; let bs: int = 48; let a: arr_real = newreal(n * n); let b: arr_real = newreal(n * n); let c: arr_real = newreal(n * n);
  for i in 0..n { for j in 0..n { a[i * n + j] = real((i * 7 + j * 3) % 10) / 10.0; b[i * n + j] = real((i * 5 + j * 11) % 10) / 10.0; } }
  for ii in 0..idiv(n, bs) { for kk in 0..idiv(n, bs) { for jj in 0..idiv(n, bs) {
    for i in ii * bs..(ii + 1) * bs { for k in kk * bs..(kk + 1) * bs { let aik: real = a[i * n + k]; for j in jj * bs..(jj + 1) * bs { c[i * n + j] = c[i * n + j] + aik * b[k * n + j]; } } } } } }
  let t: real = 0.0; for i in 0..n * n { t = t + c[i]; } return int(t * 1000.0);
}`);

P('e78_lista_nodos', 'E', 'recorrer una lista enlazada de 5M nodos × 4', `
${SOLTAR_LISTA}
fn run(): int { let h: nodo = nulo; for i in 0..5000000 { h = nuevo(i % 11, 0, h, nulo); } let s: int = 0; for r in 0..4 { let c: nodo = h; while (c != nulo) { s = s + c.v; c = c.i; } } suelta(h); return s; }`);

P('e78_array', 'E', 'recorrer un arreglo de 5M enteros × 4 (lo mismo que la lista)', `
fn run(): int { let n: int = 5000000; let a: arr_int = newint(n); for i in 0..n { a[n - 1 - i] = i % 11; } let s: int = 0; for r in 0..4 { for i in 0..n { s = s + a[i]; } } return s; }`);

P('e80_hash_colisiones', 'E', 'tabla hash abierta de 4M ranuras: 2M inserciones y 2M búsquedas (colisiones, memoria dispersa)', `
${LCG}
fn run(): int { let tam: int = 4194304; let claves: arr_int = newint(tam); let vals: arr_int = newint(tam); let x: int = 11; let hallados: int = 0;
  for i in 0..2000000 { x = lcg(x); let k: int = x + 1; let h: int = k * 40503 % tam; while (claves[h] != 0 && claves[h] != k) { h = (h + 1) % tam; } claves[h] = k; vals[h] = i; }
  x = 11;
  for i in 0..2000000 { x = lcg(x); let k: int = x + 1; let h: int = k * 40503 % tam; while (claves[h] != 0 && claves[h] != k) { h = (h + 1) % tam; } if (claves[h] == k) { hallados = hallados + vals[h] % 7; } }
  return hallados; }`);

P('e81_copia_memoria', 'E', 'copiar un arreglo de 8M enteros (64 MB) × 20 (ancho de banda)', `
fn run(): int { let n: int = 8000000; let a: arr_int = newint(n); let b: arr_int = newint(n); for i in 0..n { a[i] = i % 13; } for r in 0..20 { for i in 0..n { b[i] = a[i]; } a[r] = b[r + 1]; } let s: int = 0; for i in 0..n { s = s + b[i]; } return s; }`);

P('e82_pointer_chasing', 'E', 'seguir una permutación aleatoria de 4M elementos (3M saltos): latencia de memoria', `
${LCG}
fn run(): int { let n: int = 4194304; let p: arr_int = newint(n); for i in 0..n { p[i] = i; } let x: int = 17;
  for i in 1..n { x = lcg(x); let j: int = x % (i + 1); let t: int = p[i]; p[i] = p[j]; p[j] = t; }
  let c: int = 0; let s: int = 0; for k in 0..3000000 { c = p[c]; s = s + c % 3; } return s; }`);

P('e82_pointer_chasing_nodos', 'E', 'seguir 2M de saltos por 1M de nodos enlazados en orden aleatorio (objetos)', `
${LCG}
fn run(): int { let n: int = 1000000; let g: arr_nodo = newnodo(n); for i in 0..n { g[i] = nuevo(i, 0, nulo, nulo); }
  let x: int = 17; let ord: arr_int = newint(n); for i in 0..n { ord[i] = i; }
  for i in 1..n { x = lcg(x); let j: int = x % (i + 1); let t: int = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  for i in 0..n { g[ord[i]].i = g[ord[(i + 1) % n]]; }
  let c: nodo = g[0]; let s: int = 0; for k in 0..2000000 { c = c.i; s = s + c.v % 3; }
  for i in 0..n { liberar(g[i]); } return s; }`);

P('e85_primer_acceso', 'E', 'reservar 32M enteros (256 MB) y tocarlos por primera vez (fallos de página)', `
fn run(): int { let n: int = 33554432; let a: arr_int = newint(n); let s: int = 0; for i in 0..n { a[i] = i; } for i in 0..n { s = s + a[i] % 5; } return s; }`);

module.exports = { SUITE };
