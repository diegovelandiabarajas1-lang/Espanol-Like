# Velocidad en el PC de Diego — 5 de noviembre de 2026

> **Corrección:** la primera versión de este informe midió Ñ solo con JIT. Se añadió el AOT (ejecutable nativo de `n-compilar`) por petición de Diego.

Los mismos tres programas de siempre (`fib` recursivo, criba de Eratóstenes, Mandelbrot), el mismo algoritmo en cada lenguaje, corridos en
este PC con la máquina en reposo. Cada programa comprueba su resultado; **todos calcularon lo mismo**.

**La máquina:** Intel Core i3-1115G4 @ 3,0 GHz (2 núcleos, 4 hilos), 15,8 GB de RAM, Windows 11. Un solo hilo en todos los lenguajes
(no hay paralelismo en estas pruebas).

**Las herramientas:** C y C++ con `gcc`/`g++` 16.2.0 (w64devkit portátil) `-O2` · Rust 1.99.0 `-O` (toolchain GNU) · Python 3.13.14 ·
JavaScript en Node 24.19.0 · Ñ 4.2 **en sus dos modos**: JIT (por Node, `motor/util/n-node.js`) y **AOT** (`motor/util/n-compilar.js`: un ejecutable nativo "sin runtime" de unos 480 KB, compilado con el mismo gcc). Se toma el MEJOR tiempo de las corridas (5 en la pequeña,
3 en la grande).

## Prueba grande (la que vale)

fib(38) · criba hasta 20 000 000 · Mandelbrot 1200×900 con 400 iteraciones.

| lenguaje | fib(38) | criba(20·10⁶) | mandelbrot |
|---|---|---|---|
| C (gcc -O2) | 52 ms | 141 ms | 323 ms |
| C++ (g++ -O2, **en WSL**, ver nota 1) | 55 ms | 161 ms | 324 ms |
| Rust (-O) | 93 ms (×1,8) | 144 ms (×1,0) | 319 ms (×1,0) |
| JavaScript (Node 24) | 358 ms (×6,9) | 577 ms (×4,1) | 334 ms (×1,0) |
| Ñ (JIT) | 598 ms (×12) | 1090 ms (×7,7) | 365 ms (×1,1) |
| **Ñ (AOT, ejecutable nativo, tras la fase A3)** | **107 ms (×2,1)** | **487 ms (×3,5)** | **318 ms (×1,0)** |
| *Ñ (AOT) antes de la fase A3 (ver nota 6)* | *306 ms (×5,9)* | *556 ms (×3,9)* | *331 ms (×1,0)* |
| Python 3.13 | 4689 ms (×90) | 2710 ms (×19) | 10707 ms (×33) |
| *C en WSL (para calibrar, ver nota 1)* | 56 ms | 161 ms | 324 ms |

## Prueba pequeña (la de siempre: fib(30), criba 2·10⁶, mandelbrot 400×300×200)

| lenguaje | fib(30) | criba(2·10⁶) | mandelbrot |
|---|---|---|---|
| C | 1 ms | 3 ms | 19 ms |
| C++ | 1 ms | 3 ms | 19 ms |
| Rust | 2 ms | 4 ms | 18 ms |
| JavaScript | 8 ms | 62 ms | 22 ms |
| Ñ (JIT) | 15 ms | 121 ms | 27 ms |
| Python | 100 ms | 240 ms | 619 ms |
| *C (en WSL, ver nota 7)* | *1 ms* | *4 ms* | *19 ms* |
| *Ñ (AOT, en WSL, tras la fase A3, ver nota 7)* | *2 ms* | *34 ms* | *19 ms* |

**Los cocientes de C, C++ y Rust en esta tabla no valen**: el programa imprime milisegundos enteros y esos tres tardan 1–4 ms. Por eso
existe la prueba grande.

## Qué se ve
- **Mandelbrot** (puro cálculo de reales): C, Rust, JavaScript y Ñ quedan a menos de un 15 % entre sí. Ñ (JIT) y JavaScript compilan bien
  los bucles numéricos.
- **fib recursivo**: C -O2 gana por mucho (gcc 16 optimiza la recursión; 52 ms para 39 millones de llamadas), Rust ×1,8, JavaScript ×7,
  Ñ ×12, Python ×90.
- **Criba** (memoria): Rust iguala a C; JavaScript ×4 y Ñ ×7,7 (en Ñ la criba usa una lista, no un arreglo tipado, y eso pesa).
- **Python es de 19 a 90 veces más lento que C.** Ñ con JIT, de 1,1 a 12 veces; **Ñ con AOT, de 1,0 a 3,5 veces** (antes de la fase A3, de 1,0 a 5,9): el ejecutable nativo va 5,6 veces más rápido que el JIT en `fib`, 2,2 en la criba, y empata en Mandelbrot, donde ya va a la velocidad de C. `fib` es lo que más ganó: de ×5,9 a ×2,1 de C.

## Notas y límites de esta prueba
1. **El C++ de Windows no se pudo medir en la prueba grande.** Windows bloqueó el ejecutable recién compilado con *«Una directiva de
   Control de aplicaciones bloqueó este archivo»* (también se lo hizo un momento al C la primera vez). Es una protección del sistema y no
   se ha tocado. Se midió el C++ en el WSL (g++ 15.2). Para saber cuánto cambia el entorno, el C de WSL da 56/161/324 ms contra los
   52/141/323 de Windows: la diferencia es pequeña, pero no nula (la criba va un 14 % más lenta en WSL).
2. **Rust**: el enlazado con el `gcc` de w64devkit falla por falta de `libgcc_eh`; se compiló con una biblioteca vacía de relleno
   (`-C link-arg=-L<carpeta con libgcc_eh.a vacía>`). No afecta al cálculo, pero es un apaño y está dicho.
3. **Ñ, la criba grande**: `para i en rango(n + 1)` no admite más de 5 millones de elementos en una función que el JIT aún no ha compilado
   (por lo que se ve, una sola llamada larga no pasa de la VM al JIT; no lo he investigado más). En `bench-g.esl` esos dos bucles se escribieron con `mientras`; es el mismo algoritmo.
4. Julia no está instalada en este PC y no se midió.
   El AOT no cambia nada en la criba grande respecto al JIT salvo la velocidad: usa la misma lista de Ñ (por eso sigue ×3,9).
5. Es una máquina y una tanda de corridas: los números dan proporciones, no verdades universales.
6. **Fase A3 (AOT, `motor-exp`): qué cambió y de dónde sale la mejora de `fib`.** Dos cosas: (1) los ejecutables se compilan con `-DN_SIN_TLS` (el
   estado del hilo deja de ser `_Thread_local`; las bibliotecas no, porque las puede llamar el anfitrión desde varios hilos): fib 306 → 247 ms;
   (2) las **funciones numéricas puras** (parámetros y resultado números, solo cuentas, comparaciones y llamadas a otras puras) se emiten como
   funciones de C de verdad, sin cajas, sin cierre y sin mirar el error tras cada llamada, y se compilan con `-O3` solo ellas: 247 → 107 ms.
   `-flto`, `-O3` global y `-march=native` se probaron y no aportaron (≤ 5 %); LTO no está en el gcc de w64devkit. Comprobado con la suite
   `exp-aot` completa (619 programas, Linux, tipos supuestos comprobados en caliente: 307 iguales a la VM, 1 distinto —el de siempre—, 0 no
   compilan, 311 sin soporte: igual que antes del cambio) y con `exp-aot-puras` (31 pruebas). **Límites:** una pura no puede dividir, ni usar
   `%`, `**`, listas ni texto; una llamada hacia una función definida más abajo no cuenta; el rastro de un desbordamiento de pila dentro de
   una pura repite el nombre de la función que lo causó y la línea de su primera llamada (el tamaño y las líneas de cabecera son las de antes).
7. **La fila «en WSL» de la prueba pequeña:** Windows bloqueó (Control de aplicaciones) el ejecutable nuevo de esa prueba en cuatro intentos, así que
   se midió en WSL (gcc 15) junto con su propio C. Se puede comparar con ese C (1/4/19 ms), no con el de la columna de Windows.

Cómo repetirlo: `velocidad\correr.bat` (pequeña) y, a mano, `bench-g.*` con `comparar-g.js` (grande). Los resultados crudos están en
`velocidad\resultados\` y `velocidad\resultados-g\`.
