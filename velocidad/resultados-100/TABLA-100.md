# Los benchmarks "para romper un lenguaje" · Ñ frente a C, JavaScript y Python

Medido en WSL (Ubuntu, gcc 15 `-O2`, Node 22, Python 3.14) en el mismo equipo (i3-1115G4, 4 hilos). Cada benchmark corre en su **propio proceso**, en cada lenguaje;
el tiempo es el que imprime el propio programa (mejor de 3 para C, JavaScript y Ñ AOT; 1 corrida para Python y Ñ JIT). `×N` = veces el tiempo de C. `✗ pila` = el
programa murió por desbordamiento de pila. `>45 s` = tiempo agotado. Rust y C++ no están en esta tabla: Rust no está instalado en WSL y C++ es el mismo C.

## Grupo A · memoria y objetos

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| a01_arbol_masivo | árbol binario de 1M de nodos: construir, sumar, destruir (×3) | 108 ms (×1.0) | 105 ms (×1.0) | 100 ms (×0.9) | 324 ms (×3.0) | 2785 ms (×25.8) | 1335 ms (×12.4) |
| a02_ciclos | anillos de 50k nodos creados y abandonados (×60): un conteo de referencias no los libera | 69 ms (×1.0) | 57 ms (×0.8) | 57 ms (×0.8) | 115 ms (×1.7) | 1624 ms (×23.5) | 908 ms (×13.2) |
| a03_grafo_social | grafo de 100k nodos y 600k aristas (listas de adyacencia en nodos) + BFS | 304 ms (×1.0) | 340 ms (×1.1) | 351 ms (×1.2) | 402 ms (×1.3) | 1836 ms (×6.0) | 1618 ms (×5.3) |
| a04_vida_corta | 20M de objetos pequeños de vida corta (nacen y mueren en la iteración) | 23 ms (×1.0) | 46 ms (×2.0) | 45 ms (×2.0) | 49 ms (×2.1) | 4126 ms (×179.4) | 2444 ms (×106.3) |
| a05_vida_larga | 1M de objetos retenidos todo el tiempo + 2M de objetos efímeros que apuntan a ellos | 42 ms (×1.0) | 38 ms (×0.9) | 38 ms (×0.9) | 132 ms (×3.1) | 1104 ms (×26.3) | 507 ms (×12.1) |
| a06_asignar_soltar | asignar un arreglo de 2000 enteros, soltarlo y asignar otro (×150k) | 13 ms (×1.0) | 15 ms (×1.2) | 15 ms (×1.2) | 355 ms (×27.3) | 4342 ms (×334.0) | 186 ms (×14.3) |
| a07_listas_anidadas | 500 filas de 500 nodos que se reconstruyen sin parar (listas de listas) | 51 ms (×1.0) | 30 ms (×0.6) | 30 ms (×0.6) | 216 ms (×4.2) | 1648 ms (×32.3) | 433 ms (×8.5) |
| a08_cache_desalojo | caché de 50k ranuras con desalojo: 3M de operaciones, los objetos mueren y nacen | 52 ms (×1.0) | 49 ms (×0.9) | 47 ms (×0.9) | 337 ms (×6.5) | 2692 ms (×51.8) | 1244 ms (×23.9) |
| a10_persistente | lista persistente (copy-on-write): 1.5M versiones que comparten cola | 32 ms (×1.0) | 27 ms (×0.8) | 28 ms (×0.9) | 209 ms (×6.5) | 750 ms (×23.4) | 443 ms (×13.8) |
| a13_matriz_dispersa | matriz dispersa de 20k filas con celdas asignadas dinámicamente (listas por fila) × 10 productos | 41 ms (×1.0) | 43 ms (×1.0) | 44 ms (×1.1) | 113 ms (×2.8) | 841 ms (×20.5) | 462 ms (×11.3) |
| a14_churn_puro | crear y destruir una cadena de 3 objetos en el mismo bucle (20M veces) | 22 ms (×1.0) | 42 ms (×1.9) | 53 ms (×2.4) | 55 ms (×2.5) | 11588 ms (×526.7) | 6286 ms (×285.7) |
| a15_ast_compilador | AST de 262k nodos: construir, evaluar y destruir (×5) | 45 ms (×1.0) | 40 ms (×0.9) | 39 ms (×0.9) | 133 ms (×3.0) | 990 ms (×22.0) | 565 ms (×12.6) |
| a18_heap | lista enlazada de 3M de nodos en el heap: construir, sumar, soltar (×2) | 188 ms (×1.0) | 142 ms (×0.8) | 141 ms (×0.8) | 651 ms (×3.5) | 4859 ms (×25.8) | 2418 ms (×12.9) |
| a18_arena | la misma lista enlazada en una arena (arreglos de índices), sin asignar objetos | 30 ms (×1.0) | 39 ms (×1.3) | 39 ms (×1.3) | 79 ms (×2.6) | 226 ms (×7.5) | 424 ms (×14.1) |
| a20_soltar_heap | proxy de la pausa: tiempo (µs) de soltar de golpe una lista de 300k nodos | 10 ms (×1.0) | 5 ms (×0.5) | 5 ms (×0.5) | 42 ms (×4.2) | 336 ms (×33.6) | 83 ms (×8.3) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.03** (14) | **×1.04** (14) | **×3.49** (14) | **×37.40** (14) | **×17.83** (14) |

Memoria pico (MB) — memoria y objetos

| benchmark | C | Ñ AOT | JavaScript | Python |
|---|---|---|---|---|
| a01_arbol_masivo | 50 | 44 | 255 | 144 |
| a02_ciclos | 10 | 118 | 106 | 62 |
| a03_grafo_social | 59 | 51 | 173 | 127 |
| a04_vida_corta | 10 | 10 | 66 | 16 |
| a05_vida_larga | 56 | 49 | 155 | 115 |
| a06_asignar_soltar | 10 | 10 | 119 | 16 |
| a07_listas_anidadas | 14 | 13 | 167 | 38 |
| a08_cache_desalojo | 10 | 10 | 101 | 20 |
| a10_persistente | 71 | 61 | 174 | 153 |
| a13_matriz_dispersa | 21 | 19 | 128 | 52 |
| a14_churn_puro | 10 | 10 | 66 | 16 |
| a15_ast_compilador | 14 | 13 | 158 | 47 |
| a18_heap | 139 | 118 | 413 | 803 |
| a18_arena | 48 | 49 | 112 | 153 |
| a20_soltar_heap | 16 | 15 | 93 | 102 |

## Grupo B · recursión y pila

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| b21_fib36 | fib(36) recursivo puro | 21 ms (×1.0) | 43 ms (×2.0) | 44 ms (×2.1) | 135 ms (×6.4) | 233 ms (×11.1) | 1449 ms (×69.0) |
| b22_ackermann_6 | Ackermann(3, 6) × 300 (profundidad ~510) | 32 ms (×1.0) | 69 ms (×2.2) | 67 ms (×2.1) | 322 ms (×10.1) | ✗ pila | 2971 ms (×92.8) |
| b22_ackermann_8 | Ackermann(3, 8) (profundidad ~2050: pasa del límite de Ñ) | 2 ms (×1.0) | ✗ pila | ✗ pila | 19 ms (×9.5) | ✗ pila | 212 ms (×106.0) |
| b23_hanoi27 | torres de Hanoi con 27 discos (134M de llamadas) | 185 ms (×1.0) | 266 ms (×1.4) | 169 ms (×0.9) | 905 ms (×4.9) | 1541 ms (×8.3) | 11395 ms (×61.6) |
| b24_arbol_perfecto | árbol perfecto de 18 niveles recorrido 40 veces (recursivo) | 55 ms (×1.0) | 90 ms (×1.6) | 198 ms (×3.6) | 161 ms (×2.9) | 1675 ms (×30.5) | 1022 ms (×18.6) |
| b25_quicksort_ordenado | quicksort recursivo (pivote al final) sobre 5000 elementos ya ordenados: profundidad 5000 | 10 ms (×1.0) | ✗ pila | ✗ pila | 36 ms (×3.6) | ✗ pila | 652 ms (×65.2) |
| b26_recursion_mutua | es_par / es_impar mutuamente recursivas, profundidad 700, 300000 veces | 45 ms (×1.0) | 118 ms (×2.6) | 76 ms (×1.7) | 144 ms (×3.2) | 2420 ms (×53.8) | 16574 ms (×368.3) |
| b27_nreinas | N-Reinas 11 con retroceso recursivo | 13 ms (×1.0) | 10 ms (×0.8) | 9 ms (×0.7) | 16 ms (×1.2) | 32 ms (×2.5) | 89 ms (×6.8) |
| b28_acumulador | recursión con acumulador (estilo cola) de profundidad 800, 50000 veces | 0 ms | 28 ms | 15 ms | 336 ms | 422 ms | 4166 ms |
| b30_lista_recursiva | recorrer recursivamente una lista enlazada de 100k nodos (profundidad 100k) | 5 ms (×1.0) | ✗ pila | ✗ pila | ✗ pila | ✗ pila | 40 ms (×8.0) |
| b31_fib_recursivo30 | fib(30) recursivo × 30 (para comparar con la versión iterativa) | 54 ms (×1.0) | 104 ms (×1.9) | 90 ms (×1.7) | 227 ms (×4.2) | 401 ms (×7.4) | 2321 ms (×43.0) |
| b31_fib_iterativo | fib(30) iterativo × 600k (mismo cálculo sin recursión) | 61 ms (×1.0) | 66 ms (×1.1) | 67 ms (×1.1) | 58 ms (×1.0) | 136 ms (×2.2) | 594 ms (×9.7) |
| b32_muchas_locales | recursión de 22 niveles (ramificación 2) con 10 variables locales por marco | 70 ms (×1.0) | 102 ms (×1.5) | 83 ms (×1.2) | 100 ms (×1.4) | 186 ms (×2.7) | 1452 ms (×20.7) |
| b33_retorna_estructuras | cada llamada devuelve un arreglo de 8 enteros (recursión de 21 niveles) | 71 ms (×1.0) | 121 ms (×1.7) | 120 ms (×1.7) | 253 ms (×3.6) | 527 ms (×7.4) | 2065 ms (×29.1) |
| b35_descenso_recursivo | analizador de descenso recursivo sobre una expresión de ~100k tokens (×20) | 1 ms (×1.0) | 6 ms (×6.0) | 5 ms (×5.0) | 16 ms (×16.0) | 59 ms (×59.0) | 21 ms (×21.0) |
| b37_catalan | números de Catalan por recursión doble (Cat(15), sin memoria) | 9 ms (×1.0) | 10 ms (×1.1) | 12 ms (×1.3) | 24 ms (×2.7) | 46 ms (×5.1) | 369 ms (×41.0) |
| b38_catalan_memo | Catalan con memoización recursiva (n=700, ×100) | 153 ms (×1.0) | 130 ms (×0.8) | 140 ms (×0.9) | 412 ms (×2.7) | 814 ms (×5.3) | 3980 ms (×26.0) |
| b39_dfs_profundo | DFS recursivo sobre una cadena de 800 nodos (×3000) | 30 ms (×1.0) | 22 ms (×0.7) | 13 ms (×0.4) | 40 ms (×1.3) | 87 ms (×2.9) | 410 ms (×13.7) |
| b39_dfs_cadena_larga | DFS recursivo sobre una cadena de 20000 nodos (pasa del límite de Ñ) | 0 ms | ✗ pila | ✗ pila | ✗ pila | ✗ pila | 4 ms |
| b40_sobrecoste_llamada | llamadas a funciones pequeñas encadenadas 15M de veces | 120 ms (×1.0) | 124 ms (×1.0) | 121 ms (×1.0) | 127 ms (×1.1) | 482 ms (×4.0) | 1811 ms (×15.1) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.81** (16) | **×1.63** (16) | **×4.16** (18) | **×9.97** (15) | **×36.72** (20) |

## Grupo C · comprobaciones de índice y seguridad

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| c41_matmul500 | multiplicación de matrices 500×500 | 95 ms (×1.0) | 196 ms (×2.1) | 135 ms (×1.4) | 240 ms (×2.5) | 707 ms (×7.4) | 13046 ms (×137.3) |
| c42_lcs6000 | subsecuencia común más larga, cadenas de 6000 | 67 ms (×1.0) | 79 ms (×1.2) | 86 ms (×1.3) | 227 ms (×3.4) | 685 ms (×10.2) | 3752 ms (×56.0) |
| c43_editdist5000 | distancia de edición (Levenshtein), cadenas de 5000 | 38 ms (×1.0) | 47 ms (×1.2) | 39 ms (×1.0) | 189 ms (×5.0) | 498 ms (×13.1) | 3972 ms (×104.5) |
| c44_floyd400 | Floyd–Warshall en un grafo denso de 400 nodos | 48 ms (×1.0) | 64 ms (×1.3) | 49 ms (×1.0) | 123 ms (×2.6) | 320 ms (×6.7) | 4758 ms (×99.1) |
| c45_mochila3000 | mochila: 3000 ítems, capacidad 20000 | 27 ms (×1.0) | 48 ms (×1.8) | 41 ms (×1.5) | 141 ms (×5.2) | 567 ms (×21.0) | 4771 ms (×176.7) |
| c46_columnas | sumar una matriz de 3000×3000 por columnas (acceso no secuencial) × 4 | 215 ms (×1.0) | 329 ms (×1.5) | 64 ms (×0.3) | 286 ms (×1.3) | 515 ms (×2.4) | 2102 ms (×9.8) |
| c47_acceso_aleatorio | acceso aleatorio a un arreglo de 16M de enteros (128 MB): 8M lecturas | 174 ms (×1.0) | 248 ms (×1.4) | 223 ms (×1.3) | 425 ms (×2.4) | 1724 ms (×9.9) | 4559 ms (×26.2) |
| c48_busqueda_binaria | búsqueda binaria en 4M enteros ordenados: 300k búsquedas | 209 ms (×1.0) | 226 ms (×1.1) | 200 ms (×1.0) | 228 ms (×1.1) | 385 ms (×1.8) | 1300 ms (×6.2) |
| c49_ventana | ventana deslizante de 1000 sobre 10M de enteros | 43 ms (×1.0) | 56 ms (×1.3) | 60 ms (×1.4) | 69 ms (×1.6) | 468 ms (×10.9) | 714 ms (×16.6) |
| c50_spmv | producto matriz dispersa (CSR, 2M elementos) por vector × 10: acceso indirecto | 57 ms (×1.0) | 83 ms (×1.5) | 69 ms (×1.2) | 122 ms (×2.1) | 528 ms (×9.3) | 1841 ms (×32.3) |
| c51_aos | array de structs (x,y,z,m intercalados) · 2M partículas × 10 pasadas | 116 ms (×1.0) | 141 ms (×1.2) | 108 ms (×0.9) | 376 ms (×3.2) | 444 ms (×3.8) | 2914 ms (×25.1) |
| c51_soa | struct de arrays (x, ys, z, m separados) · 2M partículas × 10 pasadas | 92 ms (×1.0) | 105 ms (×1.1) | 108 ms (×1.2) | 358 ms (×3.9) | 518 ms (×5.6) | 1295 ms (×14.1) |
| c52_indices_calculados | índices calculados a[(i*7919+13) % n] (no es un simple i++) en 8M elementos × 3 | 307 ms (×1.0) | 360 ms (×1.2) | 380 ms (×1.2) | 524 ms (×1.7) | 1170 ms (×3.8) | 3354 ms (×10.9) |
| c53_sin_comprobar_a | recorrido simple con índice de bucle (las comprobaciones se pueden demostrar innecesarias) | 70 ms (×1.0) | 34 ms (×0.5) | 20 ms (×0.3) | 116 ms (×1.7) | 312 ms (×4.5) | 1240 ms (×17.7) |
| c53_sin_comprobar_b | recolección a[b[i]] con índices que salen de otro arreglo (no se pueden demostrar) | 192 ms (×1.0) | 219 ms (×1.1) | 213 ms (×1.1) | 262 ms (×1.4) | 1193 ms (×6.2) | 2656 ms (×13.8) |
| c55_aritmetica_saturada | acumulador con tope (saturación) y sumas cerca del límite de 2^53 · 40M iteraciones | 77 ms (×1.0) | 78 ms (×1.0) | 75 ms (×1.0) | 119 ms (×1.5) | 367 ms (×4.8) | 1994 ms (×25.9) |
| c56_div_mod | división y resto en un bucle cerrado (cálculo de potencias modulares) · 8M | 43 ms (×1.0) | 43 ms (×1.0) | 39 ms (×0.9) | 58 ms (×1.3) | 123 ms (×2.9) | 713 ms (×16.6) |
| c57_conversiones | int → real → int en un bucle (comprobaciones de rango) · 30M | 42 ms (×1.0) | 118 ms (×2.8) | 114 ms (×2.7) | 87 ms (×2.1) | 248 ms (×5.9) | 2143 ms (×51.0) |
| c59_criba10M | criba de Eratóstenes hasta 10M (arreglo de marcas) | 200 ms (×1.0) | 217 ms (×1.1) | 213 ms (×1.1) | 203 ms (×1.0) | 656 ms (×3.3) | 1405 ms (×7.0) |
| c60_alias | a[i] = a[i] + 3*b[i] con dos arreglos que podrían solaparse · 10M × 10 | 237 ms (×1.0) | 259 ms (×1.1) | 277 ms (×1.2) | 1062 ms (×4.5) | 1376 ms (×5.8) | 4594 ms (×19.4) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.26** (20) | **×1.04** (20) | **×2.19** (20) | **×5.84** (20) | **×26.70** (20) |

Memoria pico (MB) — comprobaciones de índice y seguridad

| benchmark | C | Ñ AOT | JavaScript | Python |
|---|---|---|---|---|
| c41_matmul500 | 10 | 10 | 73 | 44 |
| c42_lcs6000 | 10 | 10 | 68 | 16 |
| c43_editdist5000 | 10 | 10 | 68 | 16 |
| c44_floyd400 | 10 | 10 | 69 | 17 |
| c45_mochila3000 | 10 | 10 | 68 | 16 |
| c46_columnas | 71 | 72 | 136 | 84 |
| c47_acceso_aleatorio | 130 | 131 | 193 | 525 |
| c48_busqueda_binaria | 34 | 35 | 97 | 176 |
| c49_ventana | 78 | 79 | 144 | 92 |
| c50_spmv | 36 | 37 | 101 | 110 |
| c51_aos | 63 | 64 | 128 | 77 |
| c51_soa | 63 | 64 | 126 | 77 |
| c52_indices_calculados | 63 | 64 | 128 | 77 |
| c53_sin_comprobar_a | 32 | 33 | 97 | 46 |
| c53_sin_comprobar_b | 63 | 64 | 128 | 198 |
| c55_aritmetica_saturada | 10 | 10 | 66 | 16 |
| c56_div_mod | 10 | 10 | 66 | 16 |
| c57_conversiones | 10 | 10 | 65 | 16 |
| c59_criba10M | 78 | 79 | 142 | 92 |
| c60_alias | 155 | 156 | 220 | 168 |

## Grupo E · memoria, caché y diseño

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| e76_directo | sumar 16M enteros en orden directo × 6 | 121 ms (×1.0) | 146 ms (×1.2) | 78 ms (×0.6) | 178 ms (×1.5) | 889 ms (×7.3) | 2826 ms (×23.4) |
| e76_inverso | sumar 16M enteros en orden inverso × 6 | 83 ms (×1.0) | 140 ms (×1.7) | 79 ms (×1.0) | 210 ms (×2.5) | 941 ms (×11.3) | 4298 ms (×51.8) |
| e77_matmul_bloques | matmul 480×480 por bloques de 48 (cache blocking) | 38 ms (×1.0) | 103 ms (×2.7) | 26 ms (×0.7) | 213 ms (×5.6) | 714 ms (×18.8) | 9428 ms (×248.1) |
| e78_lista_nodos | recorrer una lista enlazada de 5M nodos × 4 | 253 ms (×1.0) | 210 ms (×0.8) | 206 ms (×0.8) | 599 ms (×2.4) | 5592 ms (×22.1) | 2211 ms (×8.7) |
| e78_array | recorrer un arreglo de 5M enteros × 4 (lo mismo que la lista) | 20 ms (×1.0) | 32 ms (×1.6) | 22 ms (×1.1) | 60 ms (×3.0) | 238 ms (×11.9) | 866 ms (×43.3) |
| e80_hash_colisiones | tabla hash abierta de 4M ranuras: 2M inserciones y 2M búsquedas (colisiones, memoria dispersa) | 175 ms (×1.0) | 166 ms (×0.9) | 162 ms (×0.9) | 445 ms (×2.5) | 1013 ms (×5.8) | 2577 ms (×14.7) |
| e81_copia_memoria | copiar un arreglo de 8M enteros (64 MB) × 20 (ancho de banda) | 172 ms (×1.0) | 260 ms (×1.5) | 256 ms (×1.5) | 277 ms (×1.6) | 1392 ms (×8.1) | 3179 ms (×18.5) |
| e82_pointer_chasing | seguir una permutación aleatoria de 4M elementos (3M saltos): latencia de memoria | 379 ms (×1.0) | 366 ms (×1.0) | 376 ms (×1.0) | 481 ms (×1.3) | 884 ms (×2.3) | 2991 ms (×7.9) |
| e82_pointer_chasing_nodos | seguir 2M de saltos por 1M de nodos enlazados en orden aleatorio (objetos) | 290 ms (×1.0) | 282 ms (×1.0) | 285 ms (×1.0) | 489 ms (×1.7) | 2246 ms (×7.7) | 1568 ms (×5.4) |
| e85_primer_acceso | reservar 32M enteros (256 MB) y tocarlos por primera vez (fallos de página) | 113 ms (×1.0) | 174 ms (×1.5) | 172 ms (×1.5) | 367 ms (×3.2) | 1016 ms (×9.0) | 2405 ms (×21.3) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.31** (10) | **×0.97** (10) | **×2.30** (10) | **×8.90** (10) | **×22.12** (10) |

Memoria pico (MB) — memoria, caché y diseño

| benchmark | C | Ñ AOT | JavaScript | Python |
|---|---|---|---|---|
| e76_directo | 124 | 125 | 189 | 138 |
| e76_inverso | 124 | 125 | 189 | 138 |
| e77_matmul_bloques | 10 | 10 | 74 | 41 |
| e78_lista_nodos | 231 | 194 | 353 | 833 |
| e78_array | 40 | 41 | 105 | 54 |
| e80_hash_colisiones | 66 | 67 | 131 | 217 |
| e81_copia_memoria | 124 | 125 | 189 | 138 |
| e82_pointer_chasing | 34 | 35 | 98 | 176 |
| e82_pointer_chasing_nodos | 63 | 57 | 164 | 153 |
| e85_primer_acceso | 258 | 259 | 321 | 1299 |

## Grupo F · arranque, archivos y casos reales

Cada programa se mide como **proceso completo** (incluye el arranque). Tiempo de pared y memoria pico.

| benchmark | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|
| f86_hola | 2 ms (×1.0) · 10 MB | 2 ms (×1.0) · 10 MB | 2 ms (×1.0) · 10 MB | 89 ms (×44.5) · 58 MB | 182 ms (×91.0) · 77 MB | 12 ms (×6.0) · 10 MB |
| f87_arranque_estructura | 35 ms (×1.0) · 78 MB | 54 ms (×1.5) · 79 MB | 53 ms (×1.5) · 79 MB | 210 ms (×6.0) · 141 MB | 748 ms (×21.4) · 411 MB | 1778 ms (×50.8) · 392 MB |
| f88_escribir_archivo | 156 ms (×1.0) · 10 MB | 4315 ms (×27.7) · 10 MB | 4343 ms (×27.8) · 10 MB | 235 ms (×1.5) · 94 MB | 711 ms (×4.6) · 199 MB | 382 ms (×2.4) · 10 MB |
| f89_leer_archivo | 71 ms (×1.0) · 10 MB | 253 ms (×3.6) · 10 MB | 259 ms (×3.6) · 10 MB | 712 ms (×10.0) · 236 MB | 1241 ms (×17.5) · 85 MB | 463 ms (×6.5) · 10 MB |
| f90_csv | 28 ms (×1.0) · 10 MB | 237 ms (×8.5) · 10 MB | 237 ms (×8.5) · 10 MB | 597 ms (×21.3) · 168 MB | 1004 ms (×35.9) · 93 MB | 273 ms (×9.8) · 10 MB |
| f93_json_serializar | 12 ms (×1.0) · 10 MB | 375 ms (×31.2) · 34 MB | 379 ms (×31.6) · 33 MB | 106 ms (×8.8) · 76 MB | 254 ms (×21.2) · 108 MB | 41 ms (×3.4) · 24 MB |
| f100_mixto | 32 ms (×1.0) · 10 MB | 564 ms (×17.6) · 20 MB | 566 ms (×17.7) · 20 MB | 197 ms (×6.2) · 84 MB | 408 ms (×12.8) · 99 MB | 1700 ms (×53.1) · 23 MB |

### Tiempo de compilación (los 22 benchmarks de bench22)

- C (gcc -O2): 397 ms
- Ñ AOT: 10247 ms
- Ñ AOT (2.ª vez, con la biblioteca ya compilada): 10962 ms

### Tamaño del binario

- C hola: 16 KB
- Ñ AOT hola: 387 KB
- C bench22 (22 benchmarks): 24 KB
- Ñ AOT bench22 (22 benchmarks): 820 KB

## Profundidad de recursión (B9 y B14)

Función `f(n) = 1 + f(n-1)` (sin cola, sin optimizar) llamada con profundidad creciente; se anota la mayor que termina bien y cómo falla la siguiente.

| lenguaje | mayor profundidad que termina | la siguiente falla así |
|---|---|---|
| C (pila de 8 MB) | 100,000 | 500,000: rc=-11 |
| JavaScript (Node 22) | 5,000 | 10,000: /home/gamer/fdat/prof/p.js:1 |
| Python (límite por defecto, 1000) | 900 | 1,000: Traceback (most recent call last): |
| Python (límite subido a 10M) | 5,000,000 | 20,000,000: Traceback (most recent call last): |
| Ñ AOT | 800 | 900: [ejecución] desbordamiento de pila: demasiadas llamadas anidadas |
| Ñ JIT | 900 | 1,000: [ejecución] desbordamiento de pila: demasiadas llamadas anidadas |

## Lo que no se midió, y por qué

**Ñ no tiene** (en el ejecutable nativo): hilos ni paralelismo general (el grupo D completo, 15 benchmarks), referencias débiles (A16), finalizadores (A17), JSON nativo (A9, F), regex (F), red/HTTP (F), SIMD explícito (E84), objetos en la pila (E83), control de relleno de estructuras (E79).
**No medido por exigir otro arnés:** latencia p99.9 con carga mixta (A11) y pausa de «stop-the-world» (A20 se midió solo como el tiempo de soltar un heap grande de golpe), arranque en contenedor sin caché de disco (F99), cierres/lambdas recursivos (B16), `string indexing` (C58).
**Medidos de otra forma:** B9 y B14 (profundidad máxima) → sección «Profundidad de recursión»; C54 (con y sin `--sin-comprobar`) → son las columnas «Ñ AOT» y «Ñ AOT sin comprobar» de todo el grupo C; A19 (pico vs. promedio de memoria) → tablas de memoria pico.

