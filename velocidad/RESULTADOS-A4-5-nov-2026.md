# Los 22 benchmarks — Ñ AOT con el nivel tipado (A4) · 5 nov 2026

Todo medido en **WSL** (Ubuntu, gcc 15.2 `-O2`, Node 22, Python 3.14), en el mismo equipo (i3-1115G4), mejor de 5 corridas (JS 3, Ñ JIT 2, Python 1).
Windows bloquea los ejecutables nuevos, así que la medición honesta de AOT se hizo aquí. **Rust no está en WSL**: su columna es la relación Rust/C de la
corrida de Windows aplicada al C de WSL (`rust-reescalado.js`), no una medición directa. Los 22 resultados son idénticos en todos los lenguajes.

- **Ñ AOT** = lo que sale por defecto: con todas las comprobaciones (índices, división por cero, cuentas de enteros dentro de ±2^53).
- **Ñ AOT sin comprobar** = `n-compilar --sin-comprobar`: como C, sin comprobar el rango de los índices ni el de las cuentas. Un índice fuera de rango
  deja de ser un error de Ñ (memoria ajena) y una cuenta que pasa de 2^53 deja de redondear como real. Solo para código ya probado.

| benchmark | C | C++ | Rust | JavaScript | Ñ AOT | Ñ AOT sin comprobar | Ñ JIT | Python |
|---|---|---|---|---|---|---|---|---|
| matmul | 43 ms (×1.0) | 43 ms (×1.0) | 79 ms (×1.8) | 163 ms (×3.8) | 84 ms (×2.0) | 80 ms (×1.9) | 448 ms (×10.4) | 5967 ms (×138.8) |
| nbody | 45 ms (×1.0) | 44 ms (×1.0) | 48 ms (×1.1) | 91 ms (×2.0) | 43 ms (×1.0) | 44 ms (×1.0) | 254 ms (×5.6) | 3144 ms (×69.9) |
| spectral | 25 ms (×1.0) | 25 ms (×1.0) | 26 ms (×1.0) | 64 ms (×2.6) | 31 ms (×1.2) | 28 ms (×1.1) | 332 ms (×13.3) | 3280 ms (×131.2) |
| fannkuch | 15 ms (×1.0) | 15 ms (×1.0) | 13 ms (×0.9) | 31 ms (×2.1) | 15 ms (×1.0) | 13 ms (×0.9) | 66 ms (×4.4) | 470 ms (×31.3) |
| collatz | 67 ms (×1.0) | 68 ms (×1.0) | 53 ms (×0.8) | 388 ms (×5.8) | 84 ms (×1.3) | 58 ms (×0.9) | 751 ms (×11.2) | 2559 ms (×38.2) |
| nqueens | 39 ms (×1.0) | 39 ms (×1.0) | 39 ms (×1.0) | 73 ms (×1.9) | 46 ms (×1.2) | 38 ms (×1.0) | 135 ms (×3.5) | 501 ms (×12.8) |
| quicksort | 30 ms (×1.0) | 30 ms (×1.0) | 31 ms (×1.0) | 68 ms (×2.3) | 34 ms (×1.1) | 31 ms (×1.0) | 115 ms (×3.8) | 686 ms (×22.9) |
| heapsort | 30 ms (×1.0) | 30 ms (×1.0) | 34 ms (×1.1) | 52 ms (×1.7) | 36 ms (×1.2) | 20 ms (×0.7) | 108 ms (×3.6) | 1205 ms (×40.2) |
| bubble | 142 ms (×1.0) | 142 ms (×1.0) | 116 ms (×0.8) | 62 ms (×0.4) | 134 ms (×0.9) | 130 ms (×0.9) | 153 ms (×1.1) | 2270 ms (×16.0) |
| fibmod | 48 ms (×1.0) | 48 ms (×1.0) | 57 ms (×1.2) | 58 ms (×1.2) | 48 ms (×1.0) | 48 ms (×1.0) | 123 ms (×2.6) | 690 ms (×14.4) |
| primos | 18 ms (×1.0) | 18 ms (×1.0) | 11 ms (×0.6) | 15 ms (×0.8) | 18 ms (×1.0) | 18 ms (×1.0) | 120 ms (×6.7) | 286 ms (×15.9) |
| mcd | 62 ms (×1.0) | 62 ms (×1.0) | 56 ms (×0.9) | 65 ms (×1.0) | 62 ms (×1.0) | 63 ms (×1.0) | 391 ms (×6.3) | 461 ms (×7.4) |
| leibniz | 20 ms (×1.0) | 20 ms (×1.0) | 20 ms (×1.0) | 37 ms (×1.9) | 20 ms (×1.0) | 20 ms (×1.0) | 145 ms (×7.3) | 1455 ms (×72.8) |
| montecarlo | 39 ms (×1.0) | 39 ms (×1.0) | 37 ms (×0.9) | 129 ms (×3.3) | 57 ms (×1.5) | 40 ms (×1.0) | 323 ms (×8.3) | 1681 ms (×43.1) |
| saxpy | 27 ms (×1.0) | 27 ms (×1.0) | 27 ms (×1.0) | 43 ms (×1.6) | 32 ms (×1.2) | 31 ms (×1.1) | 171 ms (×6.3) | 825 ms (×30.6) |
| histograma | 27 ms (×1.0) | 27 ms (×1.0) | 30 ms (×1.1) | 94 ms (×3.5) | 25 ms (×0.9) | 24 ms (×0.9) | 291 ms (×10.8) | 907 ms (×33.6) |
| editdist | 35 ms (×1.0) | 35 ms (×1.0) | 26 ms (×0.7) | 185 ms (×5.3) | 73 ms (×2.1) | 35 ms (×1.0) | 472 ms (×13.5) | 3829 ms (×109.4) |
| lcs | 42 ms (×1.0) | 42 ms (×1.0) | 80 ms (×1.9) | 160 ms (×3.8) | 106 ms (×2.5) | 47 ms (×1.1) | 434 ms (×10.3) | 2539 ms (×60.5) |
| mochila | 12 ms (×1.0) | 12 ms (×1.0) | 17 ms (×1.4) | 73 ms (×6.1) | 27 ms (×2.3) | 19 ms (×1.6) | 279 ms (×23.3) | 2208 ms (×184.0) |
| floyd | 32 ms (×1.0) | 32 ms (×1.0) | 25 ms (×0.8) | 87 ms (×2.7) | 41 ms (×1.3) | 31 ms (×1.0) | 217 ms (×6.8) | 3363 ms (×105.1) |
| tak | 117 ms (×1.0) | 117 ms (×1.0) | 112 ms (×1.0) | 290 ms (×2.5) | 95 ms (×0.8) | 95 ms (×0.8) | 535 ms (×4.6) | 2681 ms (×22.9) |
| hanoi | 32 ms (×1.0) | 32 ms (×1.0) | 68 ms (×2.1) | 229 ms (×7.2) | 87 ms (×2.7) | 61 ms (×1.9) | 1030 ms (×32.2) | 2890 ms (×90.3) |
| **media geométrica frente a C** | **×1.00** | **×1.00** | **×1.05** | **×2.36** | **×1.28** | **×1.05** | **×6.90** | **×41.59** |

Más rápido en: C 9 · C++ 0 · Rust 7 · JavaScript 1 · Ñ AOT 2 · Ñ AOT sin comprobar 3 · Ñ JIT 0 · Python 0

Todos los lenguajes calcularon lo mismo en los 22 benchmarks.

## Qué cambió (de ×7.4 a ×1.28 frente a C, por defecto)

1. **Nivel tipado** (`aot/tipado.js`): inferencia de tipos por unificación; las funciones con listas de números/bool y `/ // %` salen como C sin cajas. Si algo se sale
   de lo esperado, la función se repite con la versión general (mismo error de siempre).
2. **Enteros de 64 bits** y listas de enteros (`NL_INT`), con el tamaño y los datos de cada lista en variables locales.
3. **Análisis de intervalos** (nuevo): cada entero lleva un intervalo [lo, hi]; se refina con las comparaciones de los saltos (`i < n` ⇒ `i+1 ≤ 2^53`), los
   elementos de una lista valen lo que se escribe en ella, y el resto por un divisor positivo cae en [0, b-1]. Solo se comprueba la cuenta que puede salirse de ±2^53.
   División y resto por potencia de dos constante: desplazamiento y máscara. Los límites se deciden con BigInt (un fallo en el borde exacto de 2^53 lo encontró
   la revisión y tiene prueba).
4. **Instancias por sitio** de las funciones que construyen listas (`nueva(n)`).
5. `--sin-comprobar` (opt-in): sin comprobar índices ni rango. Media ×1.05.

## Lo que queda por encima de ×1.5 (modo por defecto)

lcs ×2.5 · hanoi ×2.7 · mochila ×2.3 · editdist ×2.1 · matmul ×2.0 · montecarlo ×1.5. Son las comprobaciones de índice (≈1 ciclo cada una; lcs tiene 7 por vuelta) y la
recursión de hanoi. Sin comprobar quedan en ×1.0–1.9. Siguiente paso posible: relacionar los índices con el largo de las listas para quitar comprobaciones.

## Validación

`exp-aot-tipado` 54/54 (con bordes de ±2^53), `exp-aot-puras` 31/31, suite completa de AOT en WSL: ver el final de este archivo.
