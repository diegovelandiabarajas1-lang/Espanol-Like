# Velocidad: el mismo programa en Ñ, JavaScript, C, C++, Rust, Python y Julia

Tres pruebas clásicas con el MISMO algoritmo en cada lenguaje, sin librerías ni trucos:
fib(30) recursivo · criba de Eratóstenes hasta 2.000.000 · Mandelbrot 400×300 con 200 iteraciones.
Cada programa imprime el resultado (para comprobar que calcularon lo mismo) y los milisegundos.

## El camino corto (Windows)

1. `instalar.bat` — instala lo que falte: Python (winget), gcc/g++ (w64devkit portable, 64 MB, se descomprime en `herramientas\`), Rust (rustup con la cadena GNU, sin Visual Studio, ~250 MB) y Julia (juliaup por winget). Node ya lo tienes. Cierra la consola al terminar.
2. `correr.bat` — en una consola nueva. Compila C, C++ y Rust, corre los siete lenguajes 3 veces cada uno (o `correr.bat 5`), guarda las salidas en `resultados\` y `comparar.js` imprime la tabla con el mejor tiempo de cada uno y comprueba que todos dieron el mismo resultado. La tabla queda en `resultados\tabla.md`.

Lo que no esté instalado se salta con aviso; la tabla se arma con lo que haya.

## Cómo correr cada uno a mano (Windows)

| Lenguaje | Orden | Necesita |
|---|---|---|
| Ñ (consola) | `node ..\motor\util\n-node.js bench.esl` | Node (ya lo tienes) |
| Ñ (navegador) | pega `bench.esl` en el IDE (`espanol-like-v4.html`) y pulsa Ejecutar | nada |
| JavaScript | `node bench.js` | Node |
| Python | `python bench.py` | Python 3 (python.org) |
| C | `gcc -O2 -o bench_c bench.c && bench_c` | gcc: instala w64devkit o MSYS2 |
| C++ | `g++ -O2 -o bench_cpp bench.cpp && bench_cpp` | el mismo gcc |
| Rust | `rustc -O -o bench_rs bench.rs && bench_rs` | rustup.rs |
| Julia | `julia bench.jl` | julialang.org |

Reglas para que la comparación sea justa:
- Siempre con optimización: `-O2` en C/C++, `-O` en Rust. Sin eso C puede salir MÁS LENTO que Ñ.
- Corre cada uno dos o tres veces y toma el mejor tiempo; la primera suele pagar arranques.
- En Ñ todo el trabajo va dentro de funciones a propósito: el JIT solo compila funciones.
- En Julia la función se llama una vez antes de medir, porque la primera llamada compila.
- Compara en la misma máquina. Los números de otra máquina solo sirven para ver proporciones.

## Lo que salió en la máquina donde se escribió esto (2 vCPU, Linux, 14-oct-2026)

| | fib(30) | criba(2·10⁶) | mandelbrot |
|---|---|---|---|
| C (gcc -O2) | 2 ms | 6 ms | 24 ms |
| C++ (g++ -O2) | 2 ms | 6 ms | 24 ms |
| Rust (-O) | 2 ms | 6 ms | 27 ms |
| JavaScript (Node 22) | 11–15 ms | 78–92 ms | 26–45 ms |
| **Ñ (JIT, Node 22)** | **26–29 ms** | **322–346 ms** | **36–39 ms** |
| Python 3.13 | 120 ms | 382 ms | 838 ms |
| Julia | sin medir aquí (no estaba instalado) | | |

Lectura honesta: en Mandelbrot, que es aritmética pura de reales, Ñ queda a 1,5× de C y empata con JavaScript.
En fib, que son llamadas, Ñ paga ~2× sobre JavaScript y ~13× sobre C (gcc además optimiza la recursión).
En la criba, Ñ está a 4× de JavaScript y a 55× de C: la lista de Ñ se llena con `agregar` uno a uno y guarda
valores etiquetados, mientras C usa un byte por casilla. Es el punto más flojo y el más fácil de mejorar
(un arreglo de `numerico` en vez de una lista bajaría mucho ese número).

## Qué puede correr en el navegador

Solo Ñ y JavaScript corren tal cual en una página. C, C++ y Rust pueden llegar al navegador compilados a
WebAssembly (emscripten / wasm-pack), pero eso es otra cadena de herramientas y mide otra cosa.
Python en el navegador existe (Pyodide) y es más lento que el nativo. Julia no corre en el navegador.
Así que la comparación justa es: Ñ y JS en el navegador entre sí, y todos contra todos en la consola.
