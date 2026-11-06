# Los benchmarks "para romper un lenguaje" · Ñ frente a C, JavaScript y Python

Medido en WSL (Ubuntu, gcc 15 `-O2`, Node 22, Python 3.14) en el mismo equipo (i3-1115G4, 4 hilos). Cada benchmark corre en su **propio proceso**, en cada lenguaje;
el tiempo es el que imprime el propio programa (mejor de 3 para C, JavaScript y Ñ AOT; 1 corrida para Python y Ñ JIT). `×N` = veces el tiempo de C. `✗ pila` = el
programa murió por desbordamiento de pila. `>45 s` = tiempo agotado. Rust y C++ no están en esta tabla: Rust no está instalado en WSL y C++ es el mismo C.

## Grupo A · memoria y objetos

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| a01_arbol_masivo | árbol binario de 1M de nodos: construir, sumar, destruir (×3) | 103 ms (×1.0) | 99 ms (×1.0) | 103 ms (×1.0) | 324 ms (×3.1) | 2785 ms (×27.0) | 1335 ms (×13.0) |
| a02_ciclos | anillos de 50k nodos creados y abandonados (×60): un conteo de referencias no los libera | 66 ms (×1.0) | 56 ms (×0.8) | 55 ms (×0.8) | 115 ms (×1.7) | 1624 ms (×24.6) | 908 ms (×13.8) |
| a03_grafo_social | grafo de 100k nodos y 600k aristas (listas de adyacencia en nodos) + BFS | 298 ms (×1.0) | 347 ms (×1.2) | 325 ms (×1.1) | 402 ms (×1.3) | 1836 ms (×6.2) | 1618 ms (×5.4) |
| a04_vida_corta | 20M de objetos pequeños de vida corta (nacen y mueren en la iteración) | 23 ms (×1.0) | 44 ms (×1.9) | 45 ms (×2.0) | 49 ms (×2.1) | 4126 ms (×179.4) | 2444 ms (×106.3) |
| a05_vida_larga | 1M de objetos retenidos todo el tiempo + 2M de objetos efímeros que apuntan a ellos | 42 ms (×1.0) | 37 ms (×0.9) | 36 ms (×0.9) | 132 ms (×3.1) | 1104 ms (×26.3) | 507 ms (×12.1) |
| a06_asignar_soltar | asignar un arreglo de 2000 enteros, soltarlo y asignar otro (×150k) | 13 ms (×1.0) | 15 ms (×1.2) | 15 ms (×1.2) | 355 ms (×27.3) | 4342 ms (×334.0) | 186 ms (×14.3) |
| a07_listas_anidadas | 500 filas de 500 nodos que se reconstruyen sin parar (listas de listas) | 51 ms (×1.0) | 28 ms (×0.5) | 28 ms (×0.5) | 216 ms (×4.2) | 1648 ms (×32.3) | 433 ms (×8.5) |
| a08_cache_desalojo | caché de 50k ranuras con desalojo: 3M de operaciones, los objetos mueren y nacen | 52 ms (×1.0) | 48 ms (×0.9) | 47 ms (×0.9) | 337 ms (×6.5) | 2692 ms (×51.8) | 1244 ms (×23.9) |
| a10_persistente | lista persistente (copy-on-write): 1.5M versiones que comparten cola | 31 ms (×1.0) | 27 ms (×0.9) | 27 ms (×0.9) | 209 ms (×6.7) | 750 ms (×24.2) | 443 ms (×14.3) |
| a13_matriz_dispersa | matriz dispersa de 20k filas con celdas asignadas dinámicamente (listas por fila) × 10 productos | 43 ms (×1.0) | 44 ms (×1.0) | 47 ms (×1.1) | 113 ms (×2.6) | 841 ms (×19.6) | 462 ms (×10.7) |
| a14_churn_puro | crear y destruir una cadena de 3 objetos en el mismo bucle (20M veces) | 22 ms (×1.0) | 43 ms (×2.0) | 42 ms (×1.9) | 55 ms (×2.5) | 11588 ms (×526.7) | 6286 ms (×285.7) |
| a15_ast_compilador | AST de 262k nodos: construir, evaluar y destruir (×5) | 44 ms (×1.0) | 38 ms (×0.9) | 39 ms (×0.9) | 133 ms (×3.0) | 990 ms (×22.5) | 565 ms (×12.8) |
| a18_heap | lista enlazada de 3M de nodos en el heap: construir, sumar, soltar (×2) | 184 ms (×1.0) | 133 ms (×0.7) | 132 ms (×0.7) | 651 ms (×3.5) | 4859 ms (×26.4) | 2418 ms (×13.1) |
| a18_arena | la misma lista enlazada en una arena (arreglos de índices), sin asignar objetos | 28 ms (×1.0) | 37 ms (×1.3) | 37 ms (×1.3) | 79 ms (×2.8) | 226 ms (×8.1) | 424 ms (×15.1) |
| a20_soltar_heap | proxy de la pausa: tiempo (µs) de soltar de golpe una lista de 300k nodos | 9 ms (×1.0) | 5 ms (×0.6) | 5 ms (×0.6) | 42 ms (×4.7) | 336 ms (×37.3) | 83 ms (×9.2) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.02** (14) | **×1.02** (14) | **×3.55** (14) | **×37.96** (14) | **×18.10** (14) |

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
| b21_fib36 | fib(36) recursivo puro | 20 ms (×1.0) | 43 ms (×2.1) | 43 ms (×2.1) | 135 ms (×6.8) | 233 ms (×11.7) | 1449 ms (×72.5) |
| b22_ackermann_6 | Ackermann(3, 6) × 300 (profundidad ~510) | 32 ms (×1.0) | 67 ms (×2.1) | 66 ms (×2.1) | 322 ms (×10.1) | ✗ pila | 2971 ms (×92.8) |
| b22_ackermann_8 | Ackermann(3, 8) (profundidad ~2050: pasa del límite de Ñ) | 2 ms (×1.0) | ✗ pila | ✗ pila | 19 ms (×9.5) | ✗ pila | 212 ms (×106.0) |
| b23_hanoi27 | torres de Hanoi con 27 discos (134M de llamadas) | 128 ms (×1.0) | 259 ms (×2.0) | 163 ms (×1.3) | 905 ms (×7.1) | 1541 ms (×12.0) | 11395 ms (×89.0) |
| b24_arbol_perfecto | árbol perfecto de 18 niveles recorrido 40 veces (recursivo) | 48 ms (×1.0) | 85 ms (×1.8) | 84 ms (×1.8) | 161 ms (×3.4) | 1675 ms (×34.9) | 1022 ms (×21.3) |
| b25_quicksort_ordenado | quicksort recursivo (pivote al final) sobre 5000 elementos ya ordenados: profundidad 5000 | 6 ms (×1.0) | ✗ pila | ✗ pila | 36 ms (×6.0) | ✗ pila | 652 ms (×108.7) |
| b26_recursion_mutua | es_par / es_impar mutuamente recursivas, profundidad 700, 300000 veces | 31 ms (×1.0) | 82 ms (×2.6) | 54 ms (×1.7) | 144 ms (×4.6) | 2420 ms (×78.1) | 16574 ms (×534.6) |
| b27_nreinas | N-Reinas 11 con retroceso recursivo | 7 ms (×1.0) | 8 ms (×1.1) | 7 ms (×1.0) | 16 ms (×2.3) | 32 ms (×4.6) | 89 ms (×12.7) |
| b28_acumulador | recursión con acumulador (estilo cola) de profundidad 800, 50000 veces | 0 ms | 22 ms | 11 ms | 336 ms | 422 ms | 4166 ms |
| b30_lista_recursiva | recorrer recursivamente una lista enlazada de 100k nodos (profundidad 100k) | 4 ms (×1.0) | ✗ pila | ✗ pila | ✗ pila | ✗ pila | 40 ms (×10.0) |
| b31_fib_recursivo30 | fib(30) recursivo × 30 (para comparar con la versión iterativa) | 37 ms (×1.0) | 71 ms (×1.9) | 69 ms (×1.9) | 227 ms (×6.1) | 401 ms (×10.8) | 2321 ms (×62.7) |
| b31_fib_iterativo | fib(30) iterativo × 600k (mismo cálculo sin recursión) | 52 ms (×1.0) | 56 ms (×1.1) | 55 ms (×1.1) | 58 ms (×1.1) | 136 ms (×2.6) | 594 ms (×11.4) |
| b32_muchas_locales | recursión de 22 niveles (ramificación 2) con 10 variables locales por marco | 56 ms (×1.0) | 76 ms (×1.4) | 62 ms (×1.1) | 100 ms (×1.8) | 186 ms (×3.3) | 1452 ms (×25.9) |
| b33_retorna_estructuras | cada llamada devuelve un arreglo de 8 enteros (recursión de 21 niveles) | 45 ms (×1.0) | 94 ms (×2.1) | 96 ms (×2.1) | 253 ms (×5.6) | 527 ms (×11.7) | 2065 ms (×45.9) |
| b35_descenso_recursivo | analizador de descenso recursivo sobre una expresión de ~100k tokens (×20) | 1 ms (×1.0) | 4 ms (×4.0) | 4 ms (×4.0) | 16 ms (×16.0) | 59 ms (×59.0) | 21 ms (×21.0) |
| b37_catalan | números de Catalan por recursión doble (Cat(15), sin memoria) | 6 ms (×1.0) | 8 ms (×1.3) | 8 ms (×1.3) | 24 ms (×4.0) | 46 ms (×7.7) | 369 ms (×61.5) |
| b38_catalan_memo | Catalan con memoización recursiva (n=700, ×100) | 94 ms (×1.0) | 91 ms (×1.0) | 94 ms (×1.0) | 412 ms (×4.4) | 814 ms (×8.7) | 3980 ms (×42.3) |
| b39_dfs_profundo | DFS recursivo sobre una cadena de 800 nodos (×3000) | 15 ms (×1.0) | 10 ms (×0.7) | 10 ms (×0.7) | 40 ms (×2.7) | 87 ms (×5.8) | 410 ms (×27.3) |
| b39_dfs_cadena_larga | DFS recursivo sobre una cadena de 20000 nodos (pasa del límite de Ñ) | 0 ms | ✗ pila | ✗ pila | ✗ pila | ✗ pila | 4 ms |
| b40_sobrecoste_llamada | llamadas a funciones pequeñas encadenadas 15M de veces | 105 ms (×1.0) | 105 ms (×1.0) | 106 ms (×1.0) | 127 ms (×1.2) | 482 ms (×4.6) | 1811 ms (×17.2) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.87** (16) | **×1.65** (16) | **×5.49** (18) | **×13.44** (15) | **×47.66** (20) |

## Grupo C · comprobaciones de índice y seguridad

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| c41_matmul500 | multiplicación de matrices 500×500 | 64 ms (×1.0) | 121 ms (×1.9) | 119 ms (×1.9) | 240 ms (×3.8) | 707 ms (×11.0) | 13046 ms (×203.8) |
| c42_lcs6000 | subsecuencia común más larga, cadenas de 6000 | 63 ms (×1.0) | 75 ms (×1.2) | 76 ms (×1.2) | 227 ms (×3.6) | 685 ms (×10.9) | 3752 ms (×59.6) |
| c43_editdist5000 | distancia de edición (Levenshtein), cadenas de 5000 | 35 ms (×1.0) | 40 ms (×1.1) | 36 ms (×1.0) | 189 ms (×5.4) | 498 ms (×14.2) | 3972 ms (×113.5) |
| c44_floyd400 | Floyd–Warshall en un grafo denso de 400 nodos | 41 ms (×1.0) | 41 ms (×1.0) | 43 ms (×1.0) | 123 ms (×3.0) | 320 ms (×7.8) | 4758 ms (×116.0) |
| c45_mochila3000 | mochila: 3000 ítems, capacidad 20000 | 24 ms (×1.0) | 46 ms (×1.9) | 39 ms (×1.6) | 141 ms (×5.9) | 567 ms (×23.6) | 4771 ms (×198.8) |
| c46_columnas | sumar una matriz de 3000×3000 por columnas (acceso no secuencial) × 4 | 184 ms (×1.0) | 284 ms (×1.5) | 55 ms (×0.3) | 286 ms (×1.6) | 515 ms (×2.8) | 2102 ms (×11.4) |
| c47_acceso_aleatorio | acceso aleatorio a un arreglo de 16M de enteros (128 MB): 8M lecturas | 158 ms (×1.0) | 173 ms (×1.1) | 167 ms (×1.1) | 425 ms (×2.7) | 1724 ms (×10.9) | 4559 ms (×28.9) |
| c48_busqueda_binaria | búsqueda binaria en 4M enteros ordenados: 300k búsquedas | 176 ms (×1.0) | 183 ms (×1.0) | 182 ms (×1.0) | 228 ms (×1.3) | 385 ms (×2.2) | 1300 ms (×7.4) |
| c49_ventana | ventana deslizante de 1000 sobre 10M de enteros | 39 ms (×1.0) | 50 ms (×1.3) | 51 ms (×1.3) | 69 ms (×1.8) | 468 ms (×12.0) | 714 ms (×18.3) |
| c50_spmv | producto matriz dispersa (CSR, 2M elementos) por vector × 10: acceso indirecto | 47 ms (×1.0) | 54 ms (×1.1) | 53 ms (×1.1) | 122 ms (×2.6) | 528 ms (×11.2) | 1841 ms (×39.2) |
| c51_aos | array de structs (x,y,z,m intercalados) · 2M partículas × 10 pasadas | 92 ms (×1.0) | 91 ms (×1.0) | 89 ms (×1.0) | 376 ms (×4.1) | 444 ms (×4.8) | 2914 ms (×31.7) |
| c51_soa | struct de arrays (x, ys, z, m separados) · 2M partículas × 10 pasadas | 71 ms (×1.0) | 88 ms (×1.2) | 89 ms (×1.3) | 358 ms (×5.0) | 518 ms (×7.3) | 1295 ms (×18.2) |
| c52_indices_calculados | índices calculados a[(i*7919+13) % n] (no es un simple i++) en 8M elementos × 3 | 255 ms (×1.0) | 257 ms (×1.0) | 263 ms (×1.0) | 524 ms (×2.1) | 1170 ms (×4.6) | 3354 ms (×13.2) |
| c53_sin_comprobar_a | recorrido simple con índice de bucle (las comprobaciones se pueden demostrar innecesarias) | 56 ms (×1.0) | 31 ms (×0.6) | 18 ms (×0.3) | 116 ms (×2.1) | 312 ms (×5.6) | 1240 ms (×22.1) |
| c53_sin_comprobar_b | recolección a[b[i]] con índices que salen de otro arreglo (no se pueden demostrar) | 182 ms (×1.0) | 195 ms (×1.1) | 199 ms (×1.1) | 262 ms (×1.4) | 1193 ms (×6.6) | 2656 ms (×14.6) |
| c55_aritmetica_saturada | acumulador con tope (saturación) y sumas cerca del límite de 2^53 · 40M iteraciones | 72 ms (×1.0) | 70 ms (×1.0) | 72 ms (×1.0) | 119 ms (×1.7) | 367 ms (×5.1) | 1994 ms (×27.7) |
| c56_div_mod | división y resto en un bucle cerrado (cálculo de potencias modulares) · 8M | 42 ms (×1.0) | 43 ms (×1.0) | 39 ms (×0.9) | 58 ms (×1.4) | 123 ms (×2.9) | 713 ms (×17.0) |
| c57_conversiones | int → real → int en un bucle (comprobaciones de rango) · 30M | 42 ms (×1.0) | 107 ms (×2.5) | 107 ms (×2.5) | 87 ms (×2.1) | 248 ms (×5.9) | 2143 ms (×51.0) |
| c59_criba10M | criba de Eratóstenes hasta 10M (arreglo de marcas) | 183 ms (×1.0) | 201 ms (×1.1) | 201 ms (×1.1) | 203 ms (×1.1) | 656 ms (×3.6) | 1405 ms (×7.7) |
| c60_alias | a[i] = a[i] + 3*b[i] con dos arreglos que podrían solaparse · 10M × 10 | 203 ms (×1.0) | 243 ms (×1.2) | 244 ms (×1.2) | 1062 ms (×5.2) | 1376 ms (×6.8) | 4594 ms (×22.6) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.19** (20) | **×1.05** (20) | **×2.52** (20) | **×6.73** (20) | **×30.74** (20) |

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
| c53_sin_comprobar_a | 32 | 34 | 97 | 46 |
| c53_sin_comprobar_b | 63 | 64 | 128 | 198 |
| c55_aritmetica_saturada | 10 | 10 | 66 | 16 |
| c56_div_mod | 10 | 10 | 66 | 16 |
| c57_conversiones | 10 | 10 | 65 | 16 |
| c59_criba10M | 78 | 79 | 142 | 92 |
| c60_alias | 155 | 156 | 220 | 168 |

## Grupo E · memoria, caché y diseño

| benchmark | qué hace | C | Ñ AOT | Ñ AOT sin comprobar | JavaScript | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|
| e76_directo | sumar 16M enteros en orden directo × 6 | 78 ms (×1.0) | 127 ms (×1.6) | 75 ms (×1.0) | 178 ms (×2.3) | 889 ms (×11.4) | 2826 ms (×36.2) |
| e76_inverso | sumar 16M enteros en orden inverso × 6 | 80 ms (×1.0) | 133 ms (×1.7) | 77 ms (×1.0) | 210 ms (×2.6) | 941 ms (×11.8) | 4298 ms (×53.7) |
| e77_matmul_bloques | matmul 480×480 por bloques de 48 (cache blocking) | 26 ms (×1.0) | 45 ms (×1.7) | 26 ms (×1.0) | 213 ms (×8.2) | 714 ms (×27.5) | 9428 ms (×362.6) |
| e78_lista_nodos | recorrer una lista enlazada de 5M nodos × 4 | 249 ms (×1.0) | 202 ms (×0.8) | 200 ms (×0.8) | 599 ms (×2.4) | 5592 ms (×22.5) | 2211 ms (×8.9) |
| e78_array | recorrer un arreglo de 5M enteros × 4 (lo mismo que la lista) | 19 ms (×1.0) | 32 ms (×1.7) | 23 ms (×1.2) | 60 ms (×3.2) | 238 ms (×12.5) | 866 ms (×45.6) |
| e80_hash_colisiones | tabla hash abierta de 4M ranuras: 2M inserciones y 2M búsquedas (colisiones, memoria dispersa) | 168 ms (×1.0) | 163 ms (×1.0) | 156 ms (×0.9) | 445 ms (×2.6) | 1013 ms (×6.0) | 2577 ms (×15.3) |
| e81_copia_memoria | copiar un arreglo de 8M enteros (64 MB) × 20 (ancho de banda) | 170 ms (×1.0) | 248 ms (×1.5) | 251 ms (×1.5) | 277 ms (×1.6) | 1392 ms (×8.2) | 3179 ms (×18.7) |
| e82_pointer_chasing | seguir una permutación aleatoria de 4M elementos (3M saltos): latencia de memoria | 379 ms (×1.0) | 369 ms (×1.0) | 368 ms (×1.0) | 481 ms (×1.3) | 884 ms (×2.3) | 2991 ms (×7.9) |
| e82_pointer_chasing_nodos | seguir 2M de saltos por 1M de nodos enlazados en orden aleatorio (objetos) | 279 ms (×1.0) | 272 ms (×1.0) | 272 ms (×1.0) | 489 ms (×1.8) | 2246 ms (×8.1) | 1568 ms (×5.6) |
| e85_primer_acceso | reservar 32M enteros (256 MB) y tocarlos por primera vez (fallos de página) | 113 ms (×1.0) | 176 ms (×1.6) | 175 ms (×1.5) | 367 ms (×3.2) | 1016 ms (×9.0) | 2405 ms (×21.3) |
| **media geométrica** | (sobre los que terminan) | ×1.00 | **×1.30** (10) | **×1.06** (10) | **×2.55** (10) | **×9.85** (10) | **×24.48** (10) |

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

