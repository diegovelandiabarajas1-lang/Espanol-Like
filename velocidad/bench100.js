// bench100.js — generado por gen100/gen.js: no editar a mano. Uso: node bench100.js [nombre]
'use strict';
class Nodo { constructor(v, w, i, d) { this.v = v; this.w = w; this.i = i; this.d = d; } }
const sel = process.argv[2];
function a01_arbol_masivo_construir(d) {
  if ((d === 0 ? 1 : 0)) {
    return null;
  }
  return new Nodo(d, 0, a01_arbol_masivo_construir((d - 1)), a01_arbol_masivo_construir((d - 1)));
}
function a01_arbol_masivo_suma(n) {
  if ((n === null ? 1 : 0)) {
    return 0;
  }
  return ((n.v + a01_arbol_masivo_suma(n.i)) + a01_arbol_masivo_suma(n.d));
}
function a01_arbol_masivo_soltar(n) {
  if ((n === null ? 1 : 0)) {
    return;
  }
  a01_arbol_masivo_soltar(n.i);
  a01_arbol_masivo_soltar(n.d);
  0;
}
function a01_arbol_masivo_run() {
  let t = 0;
  for (let r = 0; r < 3; r++) {
    let a = a01_arbol_masivo_construir(20);
    t = (t + a01_arbol_masivo_suma(a));
    a01_arbol_masivo_soltar(a);
  }
  return t;
}
function a02_ciclos_anillo(n) {
  let h = new Nodo(0, 0, null, null);
  let c = h;
  for (let k = 1; k < n; k++) {
    let x = new Nodo(k, 0, null, null);
    c.i = x;
    c = x;
  }
  c.i = h;
  return h;
}
function a02_ciclos_suma(h, n) {
  let s = 0;
  let c = h;
  for (let k = 0; k < n; k++) {
    s = (s + c.v);
    c = c.i;
  }
  return s;
}
function a02_ciclos_libera(h, n) {
  let c = h;
  for (let k = 0; k < n; k++) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function a02_ciclos_run() {
  let t = 0;
  for (let r = 0; r < 60; r++) {
    let h = a02_ciclos_anillo(50000);
    t = (t + a02_ciclos_suma(h, 50000));
    a02_ciclos_libera(h, 50000);
  }
  return t;
}
function a03_grafo_social_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function a03_grafo_social_run() {
  let n = 100000;
  let m = 600000;
  let ady = new Array(n).fill(null);
  let x = 12345;
  for (let e = 0; e < m; e++) {
    x = a03_grafo_social_lcg(x);
    let a = (x % n);
    x = a03_grafo_social_lcg(x);
    let b = (x % n);
    ady[a] = new Nodo(b, 0, ady[a], null);
    ady[b] = new Nodo(a, 0, ady[b], null);
  }
  let vis = new Float64Array(n);
  let cola = new Float64Array(n);
  let h = 0;
  let t = 1;
  cola[0] = 0;
  vis[0] = 1;
  let suma = 0;
  while ((h < t ? 1 : 0)) {
    let u = cola[h];
    h = (h + 1);
    suma = (suma + u);
    let ed = ady[u];
    while ((ed !== null ? 1 : 0)) {
      let w = ed.v;
      if ((vis[w] === 0 ? 1 : 0)) {
        vis[w] = 1;
        cola[t] = w;
        t = (t + 1);
      }
      ed = ed.i;
    }
  }
  for (let u = 0; u < n; u++) {
    let ed2 = ady[u];
    while ((ed2 !== null ? 1 : 0)) {
      let sig = ed2.i;
      0;
      ed2 = sig;
    }
  }
  return (((suma % 1000003) * 1000) + (t % 1000));
}
function a04_vida_corta_run() {
  let s = 0;
  for (let i = 0; i < 20000000; i++) {
    let ob = new Nodo(i, 0, null, null);
    s = (s + (ob.v % 7));
    0;
  }
  return s;
}
function a05_vida_larga_run() {
  let n = 1000000;
  let g = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    g[i] = new Nodo(i, 0, null, null);
  }
  let s = 0;
  for (let r = 0; r < 2000000; r++) {
    let ob = new Nodo(r, 0, g[(r % n)], null);
    s = (s + (ob.i.v % 5));
    0;
  }
  for (let i = 0; i < n; i++) {
    s = (s + (g[i].v % 3));
    0;
  }
  return s;
}
function a06_asignar_soltar_run() {
  let a = new Float64Array(2000);
  let s = 0;
  for (let i = 0; i < 150000; i++) {
    0;
    a = new Float64Array(2000);
    a[(i % 2000)] = i;
    s = (s + a[((i * 7) % 2000)]);
  }
  0;
  return s;
}
function a07_listas_anidadas_fila(n, base) {
  let h = null;
  for (let k = 0; k < n; k++) {
    h = new Nodo((base + k), 0, h, null);
  }
  return h;
}
function a07_listas_anidadas_suelta(h) {
  let c = h;
  while ((c !== null ? 1 : 0)) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function a07_listas_anidadas_suma(h) {
  let s = 0;
  let c = h;
  while ((c !== null ? 1 : 0)) {
    s = (s + (c.v % 11));
    c = c.i;
  }
  return s;
}
function a07_listas_anidadas_run() {
  let filas = new Array(500).fill(null);
  let t = 0;
  for (let r = 0; r < 4000; r++) {
    let j = (r % 500);
    a07_listas_anidadas_suelta(filas[j]);
    filas[j] = a07_listas_anidadas_fila(500, r);
    t = (t + a07_listas_anidadas_suma(filas[j]));
  }
  for (let j = 0; j < 500; j++) {
    a07_listas_anidadas_suelta(filas[j]);
  }
  return t;
}
function a08_cache_desalojo_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function a08_cache_desalojo_run() {
  let tam = 50000;
  let c = new Array(tam).fill(null);
  let x = 777;
  let ac = 0;
  for (let op = 0; op < 3000000; op++) {
    x = a08_cache_desalojo_lcg(x);
    let k = (x % 200000);
    let slot = (k % tam);
    let e = c[slot];
    if (((e !== null ? 1 : 0) && (e.v === k ? 1 : 0) ? 1 : 0)) {
      ac = (ac + 1);
    } else {
      if ((e !== null ? 1 : 0)) {
        0;
      }
      c[slot] = new Nodo(k, 0, null, null);
    }
  }
  return ac;
}
function a10_persistente_run() {
  let n = 1500000;
  let vers = new Array(800).fill(null);
  let cur = null;
  let s = 0;
  for (let i = 0; i < n; i++) {
    cur = new Nodo(i, 0, cur, null);
    if (((i % 2000) === 0 ? 1 : 0)) {
      vers[Math.floor((i) / (2000))] = cur;
    }
  }
  for (let k = 0; k < 200; k++) {
    let c = vers[k];
    let m = 0;
    while (((c !== null ? 1 : 0) && (m < 200 ? 1 : 0) ? 1 : 0)) {
      s = (s + (c.v % 3));
      c = c.i;
      m = (m + 1);
    }
  }
  return s;
}
function a13_matriz_dispersa_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function a13_matriz_dispersa_run() {
  let n = 20000;
  let filas = new Array(n).fill(null);
  let x = 99;
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < 20; k++) {
      x = a13_matriz_dispersa_lcg(x);
      filas[r] = new Nodo((x % n), (x % 100), filas[r], null);
    }
  }
  let vec = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    vec[j] = (j % 13);
  }
  let t = 0;
  for (let rep = 0; rep < 10; rep++) {
    for (let r = 0; r < n; r++) {
      let c = filas[r];
      let s = 0;
      while ((c !== null ? 1 : 0)) {
        s = (s + (c.w * vec[c.v]));
        c = c.i;
      }
      t = (t + (s % 1000));
    }
  }
  for (let r = 0; r < n; r++) {
    let c2 = filas[r];
    while ((c2 !== null ? 1 : 0)) {
      let sig = c2.i;
      0;
      c2 = sig;
    }
  }
  return t;
}
function a14_churn_puro_run() {
  let s = 0;
  for (let i = 0; i < 20000000; i++) {
    let a = new Nodo(i, 0, null, null);
    let b = new Nodo((i + 1), 0, a, null);
    let c = new Nodo((i + 2), 0, b, null);
    s = (s + (c.i.i.v % 5));
    0;
    0;
    0;
  }
  return s;
}
function a15_ast_compilador_construir(d, s) {
  if ((d === 0 ? 1 : 0)) {
    return new Nodo(0, (s % 10), null, null);
  }
  return new Nodo((1 + (s % 3)), 0, a15_ast_compilador_construir((d - 1), (((s * 7) + 1) % 1000003)), a15_ast_compilador_construir((d - 1), (((s * 13) + 5) % 1000003)));
}
function a15_ast_compilador_evalua(n) {
  if ((n.v === 0 ? 1 : 0)) {
    return n.w;
  }
  let a = a15_ast_compilador_evalua(n.i);
  let b = a15_ast_compilador_evalua(n.d);
  if ((n.v === 1 ? 1 : 0)) {
    return ((a + b) % 1000003);
  }
  if ((n.v === 2 ? 1 : 0)) {
    return ((a * b) % 1000003);
  }
  return (((a + 1000003) - b) % 1000003);
}
function a15_ast_compilador_soltar(n) {
  if ((n === null ? 1 : 0)) {
    return;
  }
  a15_ast_compilador_soltar(n.i);
  a15_ast_compilador_soltar(n.d);
  0;
}
function a15_ast_compilador_run() {
  let t = 0;
  for (let r = 0; r < 5; r++) {
    let a = a15_ast_compilador_construir(17, (r + 1));
    t = (t + a15_ast_compilador_evalua(a));
    a15_ast_compilador_soltar(a);
  }
  return t;
}
function a18_heap_suelta(h) {
  let c = h;
  while ((c !== null ? 1 : 0)) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function a18_heap_run() {
  let t = 0;
  for (let r = 0; r < 2; r++) {
    let h = null;
    for (let i = 0; i < 3000000; i++) {
      h = new Nodo(i, 0, h, null);
    }
    let c = h;
    while ((c !== null ? 1 : 0)) {
      t = (t + (c.v % 3));
      c = c.i;
    }
    a18_heap_suelta(h);
  }
  return t;
}
function a18_arena_run() {
  let n = 3000000;
  let val = new Float64Array(n);
  let nxt = new Float64Array(n);
  let t = 0;
  for (let r = 0; r < 2; r++) {
    let h = (0 - 1);
    for (let i = 0; i < n; i++) {
      val[i] = i;
      nxt[i] = h;
      h = i;
    }
    let c = h;
    while ((c >= 0 ? 1 : 0)) {
      t = (t + (val[c] % 3));
      c = nxt[c];
    }
  }
  return t;
}
function a20_soltar_heap_suelta(h) {
  let c = h;
  while ((c !== null ? 1 : 0)) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function a20_soltar_heap_run() {
  let h = null;
  for (let i = 0; i < 300000; i++) {
    h = new Nodo(i, 0, h, null);
  }
  let t0 = Math.floor(performance.now() * 1000);
  a20_soltar_heap_suelta(h);
  h = null;
  return (Math.floor(performance.now() * 1000) - t0);
}
function b21_fib36_fib(n) {
  if ((n < 2 ? 1 : 0)) {
    return n;
  }
  return (b21_fib36_fib((n - 1)) + b21_fib36_fib((n - 2)));
}
function b21_fib36_run() {
  return b21_fib36_fib(36);
}
function b22_ackermann_6_ack(m, n) {
  if ((m === 0 ? 1 : 0)) {
    return (n + 1);
  }
  if ((n === 0 ? 1 : 0)) {
    return b22_ackermann_6_ack((m - 1), 1);
  }
  return b22_ackermann_6_ack((m - 1), b22_ackermann_6_ack(m, (n - 1)));
}
function b22_ackermann_6_run() {
  let t = 0;
  for (let r = 0; r < 300; r++) {
    t = (t + b22_ackermann_6_ack(3, 6));
  }
  return t;
}
function b22_ackermann_8_ack(m, n) {
  if ((m === 0 ? 1 : 0)) {
    return (n + 1);
  }
  if ((n === 0 ? 1 : 0)) {
    return b22_ackermann_8_ack((m - 1), 1);
  }
  return b22_ackermann_8_ack((m - 1), b22_ackermann_8_ack(m, (n - 1)));
}
function b22_ackermann_8_run() {
  return b22_ackermann_8_ack(3, 8);
}
function b23_hanoi27_mueve(n, a) {
  if ((n === 0 ? 1 : 0)) {
    return (a % 2);
  }
  return ((b23_hanoi27_mueve((n - 1), (a + 1)) + b23_hanoi27_mueve((n - 1), (a + 2))) + 1);
}
function b23_hanoi27_run() {
  return b23_hanoi27_mueve(27, 0);
}
function b24_arbol_perfecto_construir(d) {
  if ((d === 0 ? 1 : 0)) {
    return null;
  }
  return new Nodo(d, 0, b24_arbol_perfecto_construir((d - 1)), b24_arbol_perfecto_construir((d - 1)));
}
function b24_arbol_perfecto_suma(n) {
  if ((n === null ? 1 : 0)) {
    return 0;
  }
  return ((n.v + b24_arbol_perfecto_suma(n.i)) + b24_arbol_perfecto_suma(n.d));
}
function b24_arbol_perfecto_soltar(n) {
  if ((n === null ? 1 : 0)) {
    return;
  }
  b24_arbol_perfecto_soltar(n.i);
  b24_arbol_perfecto_soltar(n.d);
  0;
}
function b24_arbol_perfecto_run() {
  let a = b24_arbol_perfecto_construir(18);
  let t = 0;
  for (let r = 0; r < 40; r++) {
    t = (t + b24_arbol_perfecto_suma(a));
  }
  b24_arbol_perfecto_soltar(a);
  return t;
}
function b25_quicksort_ordenado_part(a, lo, hi) {
  let p = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if ((a[j] < p ? 1 : 0)) {
      let t = a[i];
      a[i] = a[j];
      a[j] = t;
      i = (i + 1);
    }
  }
  let t2 = a[i];
  a[i] = a[hi];
  a[hi] = t2;
  return i;
}
function b25_quicksort_ordenado_qs(a, lo, hi) {
  if ((lo < hi ? 1 : 0)) {
    let p = b25_quicksort_ordenado_part(a, lo, hi);
    b25_quicksort_ordenado_qs(a, lo, (p - 1));
    b25_quicksort_ordenado_qs(a, (p + 1), hi);
  }
}
function b25_quicksort_ordenado_run() {
  let n = 5000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = i;
  }
  b25_quicksort_ordenado_qs(a, 0, (n - 1));
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + (a[i] * (i % 7)));
  }
  return s;
}
function b26_recursion_mutua_par(n) {
  if ((n === 0 ? 1 : 0)) {
    return 1;
  }
  return b26_recursion_mutua_impar((n - 1));
}
function b26_recursion_mutua_impar(n) {
  if ((n === 0 ? 1 : 0)) {
    return 0;
  }
  return b26_recursion_mutua_par((n - 1));
}
function b26_recursion_mutua_run() {
  let s = 0;
  for (let r = 0; r < 300000; r++) {
    s = (s + b26_recursion_mutua_par((700 + (r % 2))));
  }
  return s;
}
function b27_nreinas_pon(f, n, cols, d1, d2) {
  if ((f === n ? 1 : 0)) {
    return 1;
  }
  let c = 0;
  for (let k = 0; k < n; k++) {
    if ((((cols[k] === 0 ? 1 : 0) && (d1[(f + k)] === 0 ? 1 : 0) ? 1 : 0) && (d2[((f + n) - k)] === 0 ? 1 : 0) ? 1 : 0)) {
      cols[k] = 1;
      d1[(f + k)] = 1;
      d2[((f + n) - k)] = 1;
      c = (c + b27_nreinas_pon((f + 1), n, cols, d1, d2));
      cols[k] = 0;
      d1[(f + k)] = 0;
      d2[((f + n) - k)] = 0;
    }
  }
  return c;
}
function b27_nreinas_run() {
  let n = 11;
  return b27_nreinas_pon(0, n, new Float64Array(n), new Float64Array((2 * n)), new Float64Array(((2 * n) + 1)));
}
function b28_acumulador_suma(n, acc) {
  if ((n === 0 ? 1 : 0)) {
    return acc;
  }
  return b28_acumulador_suma((n - 1), (acc + n));
}
function b28_acumulador_run() {
  let s = 0;
  for (let r = 0; r < 50000; r++) {
    s = (s + (b28_acumulador_suma(800, r) % 1000));
  }
  return s;
}
function b30_lista_recursiva_largo(n) {
  if ((n === null ? 1 : 0)) {
    return 0;
  }
  return (1 + b30_lista_recursiva_largo(n.i));
}
function b30_lista_recursiva_suelta(h) {
  let c = h;
  while ((c !== null ? 1 : 0)) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function b30_lista_recursiva_run() {
  let h = null;
  for (let i = 0; i < 100000; i++) {
    h = new Nodo(i, 0, h, null);
  }
  let t = b30_lista_recursiva_largo(h);
  b30_lista_recursiva_suelta(h);
  return t;
}
function b31_fib_recursivo30_fib(n) {
  if ((n < 2 ? 1 : 0)) {
    return n;
  }
  return (b31_fib_recursivo30_fib((n - 1)) + b31_fib_recursivo30_fib((n - 2)));
}
function b31_fib_recursivo30_run() {
  let s = 0;
  for (let r = 0; r < 30; r++) {
    s = (s + (b31_fib_recursivo30_fib(30) % 1000));
  }
  return s;
}
function b31_fib_iterativo_fib(n) {
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    let t = ((a + b) % 1000003);
    a = b;
    b = t;
  }
  return a;
}
function b31_fib_iterativo_run() {
  let s = 0;
  for (let r = 0; r < 600000; r++) {
    s = (s + (b31_fib_iterativo_fib(30) % 1000));
  }
  return s;
}
function b32_muchas_locales_f(n, a) {
  if ((n === 0 ? 1 : 0)) {
    return a;
  }
  let b1 = (a + 1);
  let b2 = ((b1 * 3) % 1009);
  let b3 = (b2 + b1);
  let b4 = ((b3 * 5) % 1013);
  let b5 = (b4 + b2);
  let b6 = ((b5 * 7) % 1019);
  let b7 = (b6 + b3);
  let b8 = ((b7 * 11) % 1021);
  let b9 = (b8 + b5);
  let b10 = ((b9 * 13) % 1031);
  return ((b32_muchas_locales_f((n - 1), b10) + b32_muchas_locales_f((n - 1), (b7 + b4))) % 1000003);
}
function b32_muchas_locales_run() {
  return b32_muchas_locales_f(22, 5);
}
function b33_retorna_estructuras_gen(d) {
  if ((d === 0 ? 1 : 0)) {
    let a = new Float64Array(8);
    for (let k = 0; k < 8; k++) {
      a[k] = (k + 1);
    }
    return a;
  }
  let x = b33_retorna_estructuras_gen((d - 1));
  let ys = b33_retorna_estructuras_gen((d - 1));
  let r = new Float64Array(8);
  for (let k = 0; k < 8; k++) {
    r[k] = ((x[k] + ys[((k + 1) % 8)]) % 1000003);
  }
  0;
  0;
  return r;
}
function b33_retorna_estructuras_run() {
  let a = b33_retorna_estructuras_gen(21);
  let s = 0;
  for (let k = 0; k < 8; k++) {
    s = (s + a[k]);
  }
  return s;
}
function b35_descenso_recursivo_gen(t, p, d, s) {
  if ((d === 0 ? 1 : 0)) {
    t[p[0]] = ((s % 9) + 1);
    p[0] = (p[0] + 1);
    return;
  }
  if (((s % 3) === 0 ? 1 : 0)) {
    t[p[0]] = (0 - 1);
    p[0] = (p[0] + 1);
    b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 7) + 1) % 10007));
    t[p[0]] = (0 - 2);
    p[0] = (p[0] + 1);
    return;
  }
  b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 13) + 5) % 10007));
  if (((s % 2) === 0 ? 1 : 0)) {
    t[p[0]] = (0 - 3);
  } else {
    t[p[0]] = (0 - 4);
  }
  p[0] = (p[0] + 1);
  b35_descenso_recursivo_gen(t, p, (d - 1), (((s * 11) + 3) % 10007));
}
function b35_descenso_recursivo_factor(t, p) {
  let k = t[p[0]];
  if ((k === (0 - 1) ? 1 : 0)) {
    p[0] = (p[0] + 1);
    let v = b35_descenso_recursivo_expr(t, p);
    p[0] = (p[0] + 1);
    return v;
  }
  p[0] = (p[0] + 1);
  return k;
}
function b35_descenso_recursivo_term(t, p) {
  let v = b35_descenso_recursivo_factor(t, p);
  while ((t[p[0]] === (0 - 4) ? 1 : 0)) {
    p[0] = (p[0] + 1);
    v = ((v * b35_descenso_recursivo_factor(t, p)) % 1000003);
  }
  return v;
}
function b35_descenso_recursivo_expr(t, p) {
  let v = b35_descenso_recursivo_term(t, p);
  while ((t[p[0]] === (0 - 3) ? 1 : 0)) {
    p[0] = (p[0] + 1);
    v = ((v + b35_descenso_recursivo_term(t, p)) % 1000003);
  }
  return v;
}
function b35_descenso_recursivo_run() {
  let t = new Float64Array(1000000);
  let p = new Float64Array(1);
  b35_descenso_recursivo_gen(t, p, 15, 5);
  t[p[0]] = (0 - 9);
  let s = 0;
  for (let r = 0; r < 20; r++) {
    p[0] = 0;
    s = (s + b35_descenso_recursivo_expr(t, p));
  }
  return (s + p[0]);
}
function b37_catalan_cat(n) {
  if ((n <= 1 ? 1 : 0)) {
    return 1;
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + (b37_catalan_cat(i) * b37_catalan_cat(((n - 1) - i))));
  }
  return s;
}
function b37_catalan_run() {
  return b37_catalan_cat(15);
}
function b38_catalan_memo_cat(n, m) {
  if ((n <= 1 ? 1 : 0)) {
    return 1;
  }
  if ((m[n] !== 0 ? 1 : 0)) {
    return m[n];
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = ((s + (b38_catalan_memo_cat(i, m) * b38_catalan_memo_cat(((n - 1) - i), m))) % 1000003);
  }
  m[n] = (s + 1);
  return m[n];
}
function b38_catalan_memo_run() {
  let t = 0;
  for (let r = 0; r < 100; r++) {
    let m = new Float64Array(701);
    t = (t + (b38_catalan_memo_cat(700, m) % 1000));
  }
  return t;
}
function b39_dfs_profundo_dfs(u, n, vis) {
  vis[u] = 1;
  let s = u;
  if ((((u + 1) < n ? 1 : 0) && (vis[(u + 1)] === 0 ? 1 : 0) ? 1 : 0)) {
    s = (s + b39_dfs_profundo_dfs((u + 1), n, vis));
  }
  return (s % 1000003);
}
function b39_dfs_profundo_run() {
  let t = 0;
  for (let r = 0; r < 3000; r++) {
    let vis = new Float64Array(800);
    t = (t + b39_dfs_profundo_dfs(0, 800, vis));
  }
  return t;
}
function b39_dfs_cadena_larga_dfs(u, n, vis) {
  vis[u] = 1;
  let s = u;
  if ((((u + 1) < n ? 1 : 0) && (vis[(u + 1)] === 0 ? 1 : 0) ? 1 : 0)) {
    s = (s + b39_dfs_cadena_larga_dfs((u + 1), n, vis));
  }
  return (s % 1000003);
}
function b39_dfs_cadena_larga_run() {
  let vis = new Float64Array(20000);
  return b39_dfs_cadena_larga_dfs(0, 20000, vis);
}
function b40_sobrecoste_llamada_f1(x) {
  return (x + 1);
}
function b40_sobrecoste_llamada_f2(x) {
  return ((b40_sobrecoste_llamada_f1(x) * 3) % 1000003);
}
function b40_sobrecoste_llamada_f3(x) {
  return (b40_sobrecoste_llamada_f2(x) + b40_sobrecoste_llamada_f1(x));
}
function b40_sobrecoste_llamada_run() {
  let a = 1;
  for (let i = 0; i < 15000000; i++) {
    a = (b40_sobrecoste_llamada_f3(a) % 1000003);
  }
  return a;
}
function c41_matmul500_run() {
  let n = 500;
  let a = new Float64Array((n * n));
  let b = new Float64Array((n * n));
  let c = new Float64Array((n * n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      a[((i * n) + j)] = (((((i * 7) + (j * 3)) % 10)) / 10.0);
      b[((i * n) + j)] = (((((i * 5) + (j * 11)) % 10)) / 10.0);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0.0;
      for (let k = 0; k < n; k++) {
        s = (s + (a[((i * n) + k)] * b[((k * n) + j)]));
      }
      c[((i * n) + j)] = s;
    }
  }
  let t = 0.0;
  for (let i = 0; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return Math.trunc((t * 1000.0));
}
function c42_lcs6000_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c42_lcs6000_run() {
  let n = 6000;
  let s = new Float64Array(n);
  let t = new Float64Array(n);
  let x = 777;
  for (let i = 0; i < n; i++) {
    x = c42_lcs6000_lcg(x);
    s[i] = (x % 4);
    x = c42_lcs6000_lcg(x);
    t[i] = (x % 4);
  }
  let prev = new Float64Array((n + 1));
  let cur = new Float64Array((n + 1));
  for (let i = 1; i < (n + 1); i++) {
    for (let j = 1; j < (n + 1); j++) {
      if ((s[(i - 1)] === t[(j - 1)] ? 1 : 0)) {
        cur[j] = (prev[(j - 1)] + 1);
      } else {
        if ((prev[j] > cur[(j - 1)] ? 1 : 0)) {
          cur[j] = prev[j];
        } else {
          cur[j] = cur[(j - 1)];
        }
      }
    }
    for (let j = 0; j < (n + 1); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
function c43_editdist5000_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c43_editdist5000_run() {
  let n = 5000;
  let s = new Float64Array(n);
  let t = new Float64Array(n);
  let x = 31;
  for (let i = 0; i < n; i++) {
    x = c43_editdist5000_lcg(x);
    s[i] = (x % 4);
    x = c43_editdist5000_lcg(x);
    t[i] = (x % 4);
  }
  let prev = new Float64Array((n + 1));
  let cur = new Float64Array((n + 1));
  for (let j = 0; j < (n + 1); j++) {
    prev[j] = j;
  }
  for (let i = 1; i < (n + 1); i++) {
    cur[0] = i;
    for (let j = 1; j < (n + 1); j++) {
      let costo = 1;
      if ((s[(i - 1)] === t[(j - 1)] ? 1 : 0)) {
        costo = 0;
      }
      let mejor = (prev[(j - 1)] + costo);
      if (((prev[j] + 1) < mejor ? 1 : 0)) {
        mejor = (prev[j] + 1);
      }
      if (((cur[(j - 1)] + 1) < mejor ? 1 : 0)) {
        mejor = (cur[(j - 1)] + 1);
      }
      cur[j] = mejor;
    }
    for (let j = 0; j < (n + 1); j++) {
      prev[j] = cur[j];
    }
  }
  return prev[n];
}
function c44_floyd400_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c44_floyd400_run() {
  let n = 400;
  let d = new Float64Array((n * n));
  let x = 5;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x = c44_floyd400_lcg(x);
      d[((i * n) + j)] = ((x % 100) + 1);
    }
    d[((i * n) + i)] = 0;
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let v = (d[((i * n) + k)] + d[((k * n) + j)]);
        if ((v < d[((i * n) + j)] ? 1 : 0)) {
          d[((i * n) + j)] = v;
        }
      }
    }
  }
  let s = 0;
  for (let i = 0; i < (n * n); i++) {
    s = (s + d[i]);
  }
  return s;
}
function c45_mochila3000_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c45_mochila3000_run() {
  let n = 3000;
  let cap = 20000;
  let w = new Float64Array(n);
  let v = new Float64Array(n);
  let x = 31;
  for (let i = 0; i < n; i++) {
    x = c45_mochila3000_lcg(x);
    w[i] = (1 + (x % 50));
    x = c45_mochila3000_lcg(x);
    v[i] = (x % 100);
  }
  let dp = new Float64Array((cap + 1));
  for (let i = 0; i < n; i++) {
    let c = cap;
    while ((c >= w[i] ? 1 : 0)) {
      let cand = (dp[(c - w[i])] + v[i]);
      if ((cand > dp[c] ? 1 : 0)) {
        dp[c] = cand;
      }
      c = (c - 1);
    }
  }
  return dp[cap];
}
function c46_columnas_run() {
  let n = 3000;
  let a = new Float64Array((n * n));
  for (let i = 0; i < (n * n); i++) {
    a[i] = (i % 17);
  }
  let s = 0;
  for (let r = 0; r < 4; r++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        s = (s + a[((i * n) + j)]);
      }
    }
  }
  return s;
}
function c47_acceso_aleatorio_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c47_acceso_aleatorio_run() {
  let n = 16777216;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 1000);
  }
  let x = 1;
  let s = 0;
  for (let k = 0; k < 8000000; k++) {
    x = c47_acceso_aleatorio_lcg(x);
    s = (s + a[(x % n)]);
  }
  return s;
}
function c48_busqueda_binaria_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c48_busqueda_binaria_run() {
  let n = 4194304;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i * 3);
  }
  let x = 9;
  let hallados = 0;
  for (let q = 0; q < 300000; q++) {
    x = c48_busqueda_binaria_lcg(x);
    let clave = (x % (n * 3));
    let lo = 0;
    let hi = (n - 1);
    while ((lo <= hi ? 1 : 0)) {
      let mid = Math.floor(((lo + hi)) / (2));
      if ((a[mid] === clave ? 1 : 0)) {
        hallados = (hallados + 1);
        lo = (hi + 1);
      } else {
        if ((a[mid] < clave ? 1 : 0)) {
          lo = (mid + 1);
        } else {
          hi = (mid - 1);
        }
      }
    }
  }
  return hallados;
}
function c49_ventana_run() {
  let n = 10000000;
  let w = 1000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 31);
  }
  let s = 0;
  for (let i = 0; i < w; i++) {
    s = (s + a[i]);
  }
  let mx = s;
  for (let i = w; i < n; i++) {
    s = ((s + a[i]) - a[(i - w)]);
    if ((s > mx ? 1 : 0)) {
      mx = s;
    }
  }
  return mx;
}
function c50_spmv_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c50_spmv_run() {
  let n = 200000;
  let k = 10;
  let col = new Float64Array((n * k));
  let val = new Float64Array((n * k));
  let x = 3;
  for (let i = 0; i < (n * k); i++) {
    x = c50_spmv_lcg(x);
    col[i] = (x % n);
    val[i] = (x % 7);
  }
  let v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = (i % 5);
  }
  let ys = new Float64Array(n);
  let t = 0;
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) {
        s = (s + (val[((i * k) + j)] * v[col[((i * k) + j)]]));
      }
      ys[i] = s;
    }
    t = (t + ys[(r * 7)]);
  }
  return t;
}
function c51_aos_run() {
  let n = 2000000;
  let p = new Float64Array((n * 4));
  for (let i = 0; i < n; i++) {
    p[(i * 4)] = (i % 10);
    p[((i * 4) + 1)] = (i % 7);
    p[((i * 4) + 2)] = (i % 5);
    p[((i * 4) + 3)] = 1;
  }
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < n; i++) {
      p[(i * 4)] = ((p[(i * 4)] + p[((i * 4) + 3)]) % 1000);
      p[((i * 4) + 1)] = ((p[((i * 4) + 1)] + p[(i * 4)]) % 1000);
    }
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + p[((i * 4) + 1)]);
  }
  return s;
}
function c51_soa_run() {
  let n = 2000000;
  let x = new Float64Array(n);
  let ys = new Float64Array(n);
  let z = new Float64Array(n);
  let m = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = (i % 10);
    ys[i] = (i % 7);
    z[i] = (i % 5);
    m[i] = 1;
  }
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < n; i++) {
      x[i] = ((x[i] + m[i]) % 1000);
      ys[i] = ((ys[i] + x[i]) % 1000);
    }
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + ys[i]);
  }
  return s;
}
function c52_indices_calculados_run() {
  let n = 8000000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 100);
  }
  let s = 0;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < n; i++) {
      s = (s + a[(((i * 7919) + 13) % n)]);
    }
  }
  return s;
}
function c53_sin_comprobar_a_run() {
  let n = 4000000;
  let a = new Float64Array(n);
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < n; i++) {
      a[i] = (a[i] + (i % 5));
    }
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + a[i]);
  }
  return s;
}
function c53_sin_comprobar_b_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function c53_sin_comprobar_b_run() {
  let n = 4000000;
  let a = new Float64Array(n);
  let b = new Float64Array(n);
  let x = 4;
  for (let i = 0; i < n; i++) {
    x = c53_sin_comprobar_b_lcg(x);
    b[i] = (x % n);
    a[i] = (i % 9);
  }
  let s = 0;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < n; i++) {
      s = (s + a[b[i]]);
    }
  }
  return s;
}
function c55_aritmetica_saturada_run() {
  let tope = 4000000000000000;
  let s = 3999999999000000;
  for (let i = 0; i < 40000000; i++) {
    s = (s + (i % 97));
    if ((s > tope ? 1 : 0)) {
      s = (tope - (i % 1000));
    }
  }
  return s;
}
function c56_div_mod_run() {
  let m = 1000003;
  let s = 0;
  let b = 2;
  for (let i = 1; i < 8000000; i++) {
    b = (((b * 31) + i) % m);
    s = ((s + Math.floor((b) / (7))) + (b % 13));
  }
  return s;
}
function c57_conversiones_run() {
  let s = 0;
  for (let i = 0; i < 30000000; i++) {
    let r = ((i) * 0.5);
    s = (s + (Math.trunc(r) % 3));
  }
  return s;
}
function c59_criba10M_run() {
  let n = 10000000;
  let m = new Float64Array((n + 1));
  for (let i = 2; i < (n + 1); i++) {
    m[i] = 1;
  }
  let i = 2;
  while (((i * i) <= n ? 1 : 0)) {
    if ((m[i] === 1 ? 1 : 0)) {
      let j = (i * i);
      while ((j <= n ? 1 : 0)) {
        m[j] = 0;
        j = (j + i);
      }
    }
    i = (i + 1);
  }
  let c = 0;
  for (let k = 2; k < (n + 1); k++) {
    c = (c + m[k]);
  }
  return c;
}
function c60_alias_run() {
  let n = 10000000;
  let a = new Float64Array(n);
  let b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 5);
    b[i] = (i % 3);
  }
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < n; i++) {
      a[i] = ((a[i] + (3 * b[i])) % 1000);
    }
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + a[i]);
  }
  return s;
}
function e76_directo_run() {
  let n = 16000000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 7);
  }
  let s = 0;
  for (let r = 0; r < 6; r++) {
    for (let i = 0; i < n; i++) {
      s = (s + a[i]);
    }
  }
  return s;
}
function e76_inverso_run() {
  let n = 16000000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 7);
  }
  let s = 0;
  for (let r = 0; r < 6; r++) {
    for (let i = 0; i < n; i++) {
      s = (s + a[((n - 1) - i)]);
    }
  }
  return s;
}
function e77_matmul_bloques_run() {
  let n = 480;
  let bs = 48;
  let a = new Float64Array((n * n));
  let b = new Float64Array((n * n));
  let c = new Float64Array((n * n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      a[((i * n) + j)] = (((((i * 7) + (j * 3)) % 10)) / 10.0);
      b[((i * n) + j)] = (((((i * 5) + (j * 11)) % 10)) / 10.0);
    }
  }
  for (let ii = 0; ii < Math.floor((n) / (bs)); ii++) {
    for (let kk = 0; kk < Math.floor((n) / (bs)); kk++) {
      for (let jj = 0; jj < Math.floor((n) / (bs)); jj++) {
        for (let i = (ii * bs); i < ((ii + 1) * bs); i++) {
          for (let k = (kk * bs); k < ((kk + 1) * bs); k++) {
            let aik = a[((i * n) + k)];
            for (let j = (jj * bs); j < ((jj + 1) * bs); j++) {
              c[((i * n) + j)] = (c[((i * n) + j)] + (aik * b[((k * n) + j)]));
            }
          }
        }
      }
    }
  }
  let t = 0.0;
  for (let i = 0; i < (n * n); i++) {
    t = (t + c[i]);
  }
  return Math.trunc((t * 1000.0));
}
function e78_lista_nodos_suelta(h) {
  let c = h;
  while ((c !== null ? 1 : 0)) {
    let sig = c.i;
    0;
    c = sig;
  }
}
function e78_lista_nodos_run() {
  let h = null;
  for (let i = 0; i < 5000000; i++) {
    h = new Nodo((i % 11), 0, h, null);
  }
  let s = 0;
  for (let r = 0; r < 4; r++) {
    let c = h;
    while ((c !== null ? 1 : 0)) {
      s = (s + c.v);
      c = c.i;
    }
  }
  e78_lista_nodos_suelta(h);
  return s;
}
function e78_array_run() {
  let n = 5000000;
  let a = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[((n - 1) - i)] = (i % 11);
  }
  let s = 0;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < n; i++) {
      s = (s + a[i]);
    }
  }
  return s;
}
function e80_hash_colisiones_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function e80_hash_colisiones_run() {
  let tam = 4194304;
  let claves = new Float64Array(tam);
  let vals = new Float64Array(tam);
  let x = 11;
  let hallados = 0;
  for (let i = 0; i < 2000000; i++) {
    x = e80_hash_colisiones_lcg(x);
    let k = (x + 1);
    let h = ((k * 40503) % tam);
    while (((claves[h] !== 0 ? 1 : 0) && (claves[h] !== k ? 1 : 0) ? 1 : 0)) {
      h = ((h + 1) % tam);
    }
    claves[h] = k;
    vals[h] = i;
  }
  x = 11;
  for (let i = 0; i < 2000000; i++) {
    x = e80_hash_colisiones_lcg(x);
    let k = (x + 1);
    let h = ((k * 40503) % tam);
    while (((claves[h] !== 0 ? 1 : 0) && (claves[h] !== k ? 1 : 0) ? 1 : 0)) {
      h = ((h + 1) % tam);
    }
    if ((claves[h] === k ? 1 : 0)) {
      hallados = (hallados + (vals[h] % 7));
    }
  }
  return hallados;
}
function e81_copia_memoria_run() {
  let n = 8000000;
  let a = new Float64Array(n);
  let b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (i % 13);
  }
  for (let r = 0; r < 20; r++) {
    for (let i = 0; i < n; i++) {
      b[i] = a[i];
    }
    a[r] = b[(r + 1)];
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + b[i]);
  }
  return s;
}
function e82_pointer_chasing_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function e82_pointer_chasing_run() {
  let n = 4194304;
  let p = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    p[i] = i;
  }
  let x = 17;
  for (let i = 1; i < n; i++) {
    x = e82_pointer_chasing_lcg(x);
    let j = (x % (i + 1));
    let t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  let c = 0;
  let s = 0;
  for (let k = 0; k < 3000000; k++) {
    c = p[c];
    s = (s + (c % 3));
  }
  return s;
}
function e82_pointer_chasing_nodos_lcg(x) {
  return ((x * 16807) % 2147483647);
}
function e82_pointer_chasing_nodos_run() {
  let n = 1000000;
  let g = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    g[i] = new Nodo(i, 0, null, null);
  }
  let x = 17;
  let ord = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ord[i] = i;
  }
  for (let i = 1; i < n; i++) {
    x = e82_pointer_chasing_nodos_lcg(x);
    let j = (x % (i + 1));
    let t = ord[i];
    ord[i] = ord[j];
    ord[j] = t;
  }
  for (let i = 0; i < n; i++) {
    g[ord[i]].i = g[ord[((i + 1) % n)]];
  }
  let c = g[0];
  let s = 0;
  for (let k = 0; k < 2000000; k++) {
    c = c.i;
    s = (s + (c.v % 3));
  }
  for (let i = 0; i < n; i++) {
    0;
  }
  return s;
}
function e85_primer_acceso_run() {
  let n = 33554432;
  let a = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    a[i] = i;
  }
  for (let i = 0; i < n; i++) {
    s = (s + (a[i] % 5));
  }
  return s;
}
if (!sel || sel === "a01_arbol_masivo") { const t0 = performance.now(); const r = a01_arbol_masivo_run(); console.log(`a01_arbol_masivo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a02_ciclos") { const t0 = performance.now(); const r = a02_ciclos_run(); console.log(`a02_ciclos = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a03_grafo_social") { const t0 = performance.now(); const r = a03_grafo_social_run(); console.log(`a03_grafo_social = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a04_vida_corta") { const t0 = performance.now(); const r = a04_vida_corta_run(); console.log(`a04_vida_corta = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a05_vida_larga") { const t0 = performance.now(); const r = a05_vida_larga_run(); console.log(`a05_vida_larga = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a06_asignar_soltar") { const t0 = performance.now(); const r = a06_asignar_soltar_run(); console.log(`a06_asignar_soltar = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a07_listas_anidadas") { const t0 = performance.now(); const r = a07_listas_anidadas_run(); console.log(`a07_listas_anidadas = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a08_cache_desalojo") { const t0 = performance.now(); const r = a08_cache_desalojo_run(); console.log(`a08_cache_desalojo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a10_persistente") { const t0 = performance.now(); const r = a10_persistente_run(); console.log(`a10_persistente = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a13_matriz_dispersa") { const t0 = performance.now(); const r = a13_matriz_dispersa_run(); console.log(`a13_matriz_dispersa = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a14_churn_puro") { const t0 = performance.now(); const r = a14_churn_puro_run(); console.log(`a14_churn_puro = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a15_ast_compilador") { const t0 = performance.now(); const r = a15_ast_compilador_run(); console.log(`a15_ast_compilador = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a18_heap") { const t0 = performance.now(); const r = a18_heap_run(); console.log(`a18_heap = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a18_arena") { const t0 = performance.now(); const r = a18_arena_run(); console.log(`a18_arena = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "a20_soltar_heap") { const t0 = performance.now(); const r = a20_soltar_heap_run(); console.log(`a20_soltar_heap = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b21_fib36") { const t0 = performance.now(); const r = b21_fib36_run(); console.log(`b21_fib36 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b22_ackermann_6") { const t0 = performance.now(); const r = b22_ackermann_6_run(); console.log(`b22_ackermann_6 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b22_ackermann_8") { const t0 = performance.now(); const r = b22_ackermann_8_run(); console.log(`b22_ackermann_8 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b23_hanoi27") { const t0 = performance.now(); const r = b23_hanoi27_run(); console.log(`b23_hanoi27 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b24_arbol_perfecto") { const t0 = performance.now(); const r = b24_arbol_perfecto_run(); console.log(`b24_arbol_perfecto = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b25_quicksort_ordenado") { const t0 = performance.now(); const r = b25_quicksort_ordenado_run(); console.log(`b25_quicksort_ordenado = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b26_recursion_mutua") { const t0 = performance.now(); const r = b26_recursion_mutua_run(); console.log(`b26_recursion_mutua = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b27_nreinas") { const t0 = performance.now(); const r = b27_nreinas_run(); console.log(`b27_nreinas = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b28_acumulador") { const t0 = performance.now(); const r = b28_acumulador_run(); console.log(`b28_acumulador = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b30_lista_recursiva") { const t0 = performance.now(); const r = b30_lista_recursiva_run(); console.log(`b30_lista_recursiva = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b31_fib_recursivo30") { const t0 = performance.now(); const r = b31_fib_recursivo30_run(); console.log(`b31_fib_recursivo30 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b31_fib_iterativo") { const t0 = performance.now(); const r = b31_fib_iterativo_run(); console.log(`b31_fib_iterativo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b32_muchas_locales") { const t0 = performance.now(); const r = b32_muchas_locales_run(); console.log(`b32_muchas_locales = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b33_retorna_estructuras") { const t0 = performance.now(); const r = b33_retorna_estructuras_run(); console.log(`b33_retorna_estructuras = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b35_descenso_recursivo") { const t0 = performance.now(); const r = b35_descenso_recursivo_run(); console.log(`b35_descenso_recursivo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b37_catalan") { const t0 = performance.now(); const r = b37_catalan_run(); console.log(`b37_catalan = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b38_catalan_memo") { const t0 = performance.now(); const r = b38_catalan_memo_run(); console.log(`b38_catalan_memo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b39_dfs_profundo") { const t0 = performance.now(); const r = b39_dfs_profundo_run(); console.log(`b39_dfs_profundo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b39_dfs_cadena_larga") { const t0 = performance.now(); const r = b39_dfs_cadena_larga_run(); console.log(`b39_dfs_cadena_larga = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "b40_sobrecoste_llamada") { const t0 = performance.now(); const r = b40_sobrecoste_llamada_run(); console.log(`b40_sobrecoste_llamada = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c41_matmul500") { const t0 = performance.now(); const r = c41_matmul500_run(); console.log(`c41_matmul500 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c42_lcs6000") { const t0 = performance.now(); const r = c42_lcs6000_run(); console.log(`c42_lcs6000 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c43_editdist5000") { const t0 = performance.now(); const r = c43_editdist5000_run(); console.log(`c43_editdist5000 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c44_floyd400") { const t0 = performance.now(); const r = c44_floyd400_run(); console.log(`c44_floyd400 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c45_mochila3000") { const t0 = performance.now(); const r = c45_mochila3000_run(); console.log(`c45_mochila3000 = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c46_columnas") { const t0 = performance.now(); const r = c46_columnas_run(); console.log(`c46_columnas = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c47_acceso_aleatorio") { const t0 = performance.now(); const r = c47_acceso_aleatorio_run(); console.log(`c47_acceso_aleatorio = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c48_busqueda_binaria") { const t0 = performance.now(); const r = c48_busqueda_binaria_run(); console.log(`c48_busqueda_binaria = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c49_ventana") { const t0 = performance.now(); const r = c49_ventana_run(); console.log(`c49_ventana = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c50_spmv") { const t0 = performance.now(); const r = c50_spmv_run(); console.log(`c50_spmv = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c51_aos") { const t0 = performance.now(); const r = c51_aos_run(); console.log(`c51_aos = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c51_soa") { const t0 = performance.now(); const r = c51_soa_run(); console.log(`c51_soa = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c52_indices_calculados") { const t0 = performance.now(); const r = c52_indices_calculados_run(); console.log(`c52_indices_calculados = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c53_sin_comprobar_a") { const t0 = performance.now(); const r = c53_sin_comprobar_a_run(); console.log(`c53_sin_comprobar_a = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c53_sin_comprobar_b") { const t0 = performance.now(); const r = c53_sin_comprobar_b_run(); console.log(`c53_sin_comprobar_b = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c55_aritmetica_saturada") { const t0 = performance.now(); const r = c55_aritmetica_saturada_run(); console.log(`c55_aritmetica_saturada = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c56_div_mod") { const t0 = performance.now(); const r = c56_div_mod_run(); console.log(`c56_div_mod = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c57_conversiones") { const t0 = performance.now(); const r = c57_conversiones_run(); console.log(`c57_conversiones = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c59_criba10M") { const t0 = performance.now(); const r = c59_criba10M_run(); console.log(`c59_criba10M = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "c60_alias") { const t0 = performance.now(); const r = c60_alias_run(); console.log(`c60_alias = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e76_directo") { const t0 = performance.now(); const r = e76_directo_run(); console.log(`e76_directo = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e76_inverso") { const t0 = performance.now(); const r = e76_inverso_run(); console.log(`e76_inverso = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e77_matmul_bloques") { const t0 = performance.now(); const r = e77_matmul_bloques_run(); console.log(`e77_matmul_bloques = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e78_lista_nodos") { const t0 = performance.now(); const r = e78_lista_nodos_run(); console.log(`e78_lista_nodos = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e78_array") { const t0 = performance.now(); const r = e78_array_run(); console.log(`e78_array = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e80_hash_colisiones") { const t0 = performance.now(); const r = e80_hash_colisiones_run(); console.log(`e80_hash_colisiones = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e81_copia_memoria") { const t0 = performance.now(); const r = e81_copia_memoria_run(); console.log(`e81_copia_memoria = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e82_pointer_chasing") { const t0 = performance.now(); const r = e82_pointer_chasing_run(); console.log(`e82_pointer_chasing = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e82_pointer_chasing_nodos") { const t0 = performance.now(); const r = e82_pointer_chasing_nodos_run(); console.log(`e82_pointer_chasing_nodos = ${r} en ${Math.round(performance.now() - t0)} ms`); }
if (!sel || sel === "e85_primer_acceso") { const t0 = performance.now(); const r = e85_primer_acceso_run(); console.log(`e85_primer_acceso = ${r} en ${Math.round(performance.now() - t0)} ms`); }
