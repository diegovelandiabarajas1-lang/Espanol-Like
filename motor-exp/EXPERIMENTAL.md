# motor-exp — el clon experimental de E8

> **Regla (Diego, 16-oct-2026):** se experimenta aquí. `motor/` es el **LTS** y no se toca. Un cambio pasa al LTS
> solo si funciona, no rompe nada **y Diego dice que se haga**.

## Qué es esta carpeta

Una copia de `motor/` del 16-oct (versión 4.0, 19 de 20 suites en verde) con su propia versión: **`4.1-exp`**.

- **Construye en `motor-exp/salida/`**, nunca en la raíz: el IDE, la referencia, el contexto, el binario `n` y los
  `.exe` de `empaquetar`. Así no pisa lo que publica el LTS. Lo que **lee** (`ejemplos/`, `PSeInt/`, `raylib.dll`)
  sigue saliendo de la raíz, que es compartida.
- **No comparte nada en tiempo de ejecución con `motor/`**: cada uno carga su propio `bundle.js`.
- Una excepción: la prueba de `c1en.py` (suite `fuera`) lanza el motor que encuentra `c1en.py`, que es el LTS.

```
node motor-exp/util/construir.js        # bundle.js y bundle-c1en.js del clon
node motor-exp/util/construir-ide.js    # motor-exp/salida/espanol-like-v4.html
node motor-exp/pruebas/todas.js         # las 20 suites del LTS + las del clon
node motor-exp/util/n-node.js programa.esl
```

---

## Fase R1 · rendimiento (16-oct-2026)

### Lo que se tocó

| archivo | cambio |
|---|---|
| `src/03-vm-jit.js` | `a[i]` y `a[i] = v` en arreglos (`indiceObtener`, `indiceAsignar`, `arrIndice`, `arrFila`); `longitud(arreglo)`; `prepararRango` (validación de `rango` compartida con el JIT); JIT: rango sin lista, `a[i]` rápido en listas, `agregar` en línea, `para x en lista` sin `idxg`, autollamada directa |
| `src/02-check-compile.js` | el verificador acepta `a[i]` y `para x en a` sobre un `arreglo` |
| `src/04-stdlib.js` | `rango` usa `vm.prepararRango`; `rango` y `agregar` llevan la marca `puro` |
| `rutas.js`, `util/construir*.js`, `util/empaquetar.js`, `pruebas/fuera.js` | salidas a `motor-exp/salida/`; versión `4.1-exp` |
| `pruebas/exp-rendimiento.js` (nueva) | 50 pruebas, entre ellas 2.000 programas al azar |
| `pruebas/todas.js` | suma las suites nuevas (`exp-rendimiento`, `exp-pagina`) |
| `util/banco.js` (nuevo) | LTS contra clon contra JavaScript, cada prueba en su proceso |
| `CAMBIOS-R1.diff` | el diff completo contra `motor/`, para revisarlo antes de decidir |

**Ningún opcode nuevo**: la huella de los `.elb` es la misma que en el LTS, así que los archivos se cargan en los dos.

### Lo nuevo en el lenguaje: `a[i]` en arreglos

```
usar arreglo de "numerico"
var a = arreglo([10, 20, 30])
a[0] = 5                       # escribe, como ponerElemento
imprimir(a[-1])                # 30: los negativos cuentan desde el final
fijo m = arreglo([[1, 2], [3, 4]])
imprimir(m[1][0])              # 3: m[1] es una VISTA de la fila
para fila en m { … }           # recorre el primer eje
longitud(m)                    # 2: el primer eje, como len() de NumPy
```

- En N dimensiones, `a[i]` es una **vista**: escribir en ella escribe en el original (como `trozo` y como NumPy).
- `a[i] = v` solo vale en 1 dimensión; en más, el error pide bajar hasta el número (`a[i][j] = v`).
- Un arreglo `entero` trunca al escribir, igual que `ponerElemento`. Uno `complejo` todavía no se indexa (lo dice).
- Un arreglo `bool` devuelve 0 o 1, igual que `elemento`. Coherente con lo que había, aunque discutible.
- `a[i]` es **3,2× más rápido** que `elemento(a, i)` (1 millón de lecturas: 26 contra 83 ms).

### Lo que hace el JIT ahora

1. **`para i en rango(…)` no construye la lista.** Antes `rango(2000000)` llenaba 2 millones de casillas para
   recorrerlas una vez. Los argumentos pasan por la misma `prepararRango` de la nativa: mismos errores, mismo tope de
   5 millones. Con 1 o 2 argumentos sale un `for` de JavaScript normal. Si un programa tapa `rango` con su propio `fn`,
   no se toma el atajo (hay prueba).
2. **`l[i]` y `l[i] = v` en listas** van directos a `items[i]` cuando el índice es un entero dentro de rango. Todo lo
   demás —negativos, textos, diccionarios, arreglos, errores— sigue por `idxg`/`idxs`, el código del intérprete. El
   orden de evaluación al escribir (objeto, índice, valor) no cambió; hay prueba.
3. **`agregar(l, x)`** con dos argumentos es un `push`. Si `l` no es lista, la nativa de siempre da el error de siempre.
4. **`para x en lista`** lee `items[i]` directo mientras la lista no se acorte.
5. **Autollamada directa**: `fib` llamándose a sí misma va derecho a su propio código, sin guardia de `jit` ni `yaN`.
   El control de profundidad sigue (el error de Ñ, no el de JavaScript). Solo en funciones sin capturas: con capturas,
   el global podría ser otra instancia del mismo prototipo.

### Medido (nube, cada prueba en su propio proceso, mejor de 5)

| | LTS | **exp** | JavaScript | exp contra JS |
|---|---|---|---|---|
| fib(30) | 20–24 ms | **13–17 ms** | 7 ms | 1,9–2,3× |
| criba(2000000) | 246–262 ms | **115–124 ms** | 81–90 ms | **1,4×** |
| mandelbrot 400×300×200 | 26–29 ms | 27–28 ms | 16–21 ms | 1,3–1,7× |

(Tres corridas de `util/banco.js`; el rango es lo que varía la máquina de la nube entre corridas.)

- **La criba bajó a la mitad.** Ahí estaban los dos `rango(n + 1)` de 2 millones y el `idxg` de cada `marca[i]`.
- **fib bajó un tercio.** Lo que queda son las guardas de tipo de `n < 2` y `n - 1` y el contador de profundidad.
- **El mandelbrot no cambia, y no tenía por qué**: ya estaba en 1,4× de JS. Ojo con un engaño que salió al medir: en
  `bench.esl`, que corre las tres pruebas seguidas, el mandelbrot del clon parecía **más lento** (45–55 ms). Con
  `--trace-gc` se ve que es la recolección de la basura de la criba, que cae justo en el mandelbrot. Corriendo cada
  prueba en su proceso, empata. `node motor-exp/util/banco.js` hace eso.
- Probado y descartado: leer `rt.vm` una vez por función en vez de en cada autollamada. Sin diferencia medible; no
  se dejó.

### Las pruebas

- **Batería completa del clon: 20 de 21 en verde**, las mismas que el LTS más la nueva. La única roja es la de
  siempre (`apps` → `ecosim5.esl`, el anfitrión de la prueba le pasa «ventas.csv» como número). Aislado 108/108 y
  ejemplos 17/17 en Chromium.
- **`exp-rendimiento.js`: 50 de 50.** Casi todo se corre con y sin JIT y la salida —o el error— tiene que ser
  idéntica; si el JIT no compiló, falla. Incluye 2.000 programas al azar con listas, índices, rangos (también con paso
  negativo y fraccionario), `romper`, y listas que crecen mientras se recorren: **1.915 iguales, 0 distintos**.

### Dos cosas del LTS que salieron por el camino (no son de esta fase)

1. **Con JIT, la traza de un error pierde las funciones compiladas.** El mensaje es el mismo, pero sin JIT sale
   `en f (línea 2) · en principal (línea 4)` y con JIT solo `en principal (línea 4)`: la función compilada no deja
   marco en la pila de la VM. Comprobado con el mismo programa sobre el LTS. La suite compara sin la traza.
2. **El presupuesto de instrucciones no mide lo mismo con y sin JIT.** El intérprete cobra cada instrucción y el
   código compilado una por vuelta de bucle, así que un programa puede agotarlo sin JIT y terminar con JIT. En los
   2.000 programas al azar pasa en 85, y **los mismos 35 casos de divergencia salen igual en el LTS**. La suite los
   aparta y los cuenta.

Ninguna de las dos se arregló: tocan el diseño del JIT y merecen su propia fase.

---

## Fase P1 · la página (16-oct-2026)

Pedido de Diego: dos fallos del HTML que genera Ñ.

1. **Cada cambio repintaba todo.** `limpiarPagina()` hacía `innerHTML = ''` y `pintar()` volvía a crear cada elemento.
2. **Lo que se deja de pintar se olvida.** La foto de «lo que el usuario tenía puesto» duraba un solo repintado. Si
   un panel se cerraba y se volvía a abrir, lo escrito en sus cajas desaparecía. Y como la identidad de un control
   era su POSICIÓN, quitar un trozo de arriba hacía que cada caja de abajo recibiera el texto de otra.

### Lo que se tocó

Solo el anfitrión (`ide/anfitrion.js`) y dos líneas en `ide/hijo.html` y `ide/app.html` (llaman a `anf.volcar()` al
acabar el programa). **El motor no cambió en esta fase**: `pintar()` y todo el eDSL web son los mismos.

| antes (LTS) | ahora (clon) |
|---|---|
| `abrir`/`texto`/`control` creaban nodos del DOM al instante | describen un **modelo** de la página |
| `limpiarPagina()` borraba el DOM | empieza un modelo nuevo |
| foto antes, devolver después (foco, texto, cursor, scroll) | **volcar** compara modelo y DOM y cambia solo lo distinto; un elemento que sigue ahí ES el mismo y lo conserva todo |
| identidad del control: su posición (`r:1.4.2`) | **qué es y cómo se llama** (`entrada:Nombre#0`) dentro del ancestro con clave más cercano |
| lo escrito en un control que desaparece: perdido | **memoria** de hasta 500 controles: si vuelve, lo recupera |
| reordenar una lista con clave: se recreaba | se **mueven** los elementos, y lo mínimo (subsecuencia creciente más larga): rotar 300 filas un puesto mueve 1 nodo |
| la hoja de clases se borraba y se reescribía en cada repintado | se reescribe solo si cambió |

Se conservan, porque eran decisiones con historia: el Enter que confirma aunque el reloj repinte, el `change`
ignorado mientras se desmonta, el `<select>` que se elige por propiedad, el control gobernado (si el programa declara
el valor, manda el programa), y que `crudo()` no ejecuta `<script>`.

La memoria se vacía al ejecutar un programa nuevo: lo escrito en otro programa no es de este.

**Lo que conviene saber**: dos controles con la misma forma y el mismo rótulo dentro del mismo ámbito (una lista de
cajas «Cantidad») se distinguen por orden, así que quitar una de en medio sigue confundiendo a las de detrás. Para eso
está `{"clave": …}`, igual que antes.

### Las pruebas

- **`pruebas/exp-pagina.js`: 23 de 23**, en Chromium. Mira por dentro: que un repintado sin cambios hace **0
  mutaciones** del DOM (el LTS quita y pone más de 50 nodos), que cambiar un texto entre 51 nodos es **1**, que rotar
  una lista con clave mueve **1** nodo, que el foco y lo tecleado sobreviven a un reloj, que botones y atributos
  reutilizados llaman a la función de ahora, que los gobernados siguen mandando, que lo que sobra se quita y lo que
  falta se añade. Y **los dos fallos que pediste, en el clon y en el LTS**: en el LTS se reproducen (cerrar y abrir el
  panel pierde lo escrito y la casilla; quitar lo de arriba mueve los textos de caja) y en el clon no.
- **`aislado.js`** (el IDE entero en Chromium): **108 de 108**, sin cambiar ninguna prueba. **Ejemplos del IDE: 17 de 17.**
- **Batería completa del clon: 21 de 22.** La roja es la de siempre (`apps` → `ecosim5.esl`).

---

## Comparación LTS contra clon: 57 pruebas de rendimiento (16-oct-2026)

`node motor-exp/pruebas/comparar/comparar.js --rondas 10` · deja `salida/comparacion-lts-exp.md` y `.json`.

- **37 de CPU** (`comparar/cpu.js`): recursión, bucles, listas, diccionarios, texto, cierres, ordenar, matrices,
  `numerico`, `texto`. Cada muestra es un proceso nuevo y mide solo el trabajo. **Los dos motores tienen que dar el
  mismo resultado** o la prueba no cuenta (las 57 dieron el mismo).
- **20 de página** (`comparar/dom.js`): listas, tablas, formularios, relojes, claves que rotan, estilos, botones,
  crudo, casillas, desplegables. Cada muestra son 30 repintados como turnos de verdad, con reflujo forzado.
- 10 muestras por motor y prueba, **intercaladas**. Veredicto con la U de Mann–Whitney: «mejor» solo si p < 0,01 y
  la diferencia pasa del 5 %.

**Resultado: el clon es mejor en 42, el LTS en 0, empate en 15.** Prueba de signos: p = 4,5·10⁻¹³ (si fueran iguales,
que uno ganara 42 a 0 sería prácticamente imposible). Media geométrica de LTS ÷ clon: **CPU ×1,64 · página ×3,48.**

| # | tipo | prueba | LTS (mediana) | exp (mediana) | LTS ÷ exp | p | veredicto |
|---|---|---|---|---|---|---|---|
| 1 | CPU | fib(27) recursivo | 9,03 ms | 6,75 ms | ×1,34 | <0,001 | exp mejor |
| 2 | CPU | fib iterativo ×20000 | 35,4 ms | 7,11 ms | ×4,98 | <0,001 | exp mejor |
| 3 | CPU | criba(1000000) | 146,4 ms | 58,2 ms | ×2,51 | <0,001 | exp mejor |
| 4 | CPU | mandelbrot 300×200×150 | 25,4 ms | 19,1 ms | ×1,33 | <0,001 | exp mejor |
| 5 | CPU | suma de rango 3M | 81,3 ms | 22,1 ms | ×3,68 | <0,001 | exp mejor |
| 6 | CPU | rango con paso | 23,4 ms | 9,15 ms | ×2,56 | <0,001 | exp mejor |
| 7 | CPU | rango hacia atrás | 41,5 ms | 13,7 ms | ×3,03 | <0,001 | exp mejor |
| 8 | CPU | mientras con contador | 18,3 ms | 18,5 ms | ×0,99 | 0,307 | empate |
| 9 | CPU | repetir N | 11,5 ms | 11,6 ms | ×1,00 | 0,473 | empate |
| 10 | CPU | agregar 1M | 94,1 ms | 29,9 ms | ×3,14 | <0,001 | exp mejor |
| 11 | CPU | leer lista por índice | 102,1 ms | 41,5 ms | ×2,46 | <0,001 | exp mejor |
| 12 | CPU | escribir lista por índice | 93,7 ms | 30,2 ms | ×3,11 | <0,001 | exp mejor |
| 13 | CPU | para x en lista | 55,8 ms | 40,3 ms | ×1,38 | 0,002 | exp mejor |
| 14 | CPU | índice negativo | 39,7 ms | 24,1 ms | ×1,65 | <0,001 | exp mejor |
| 15 | CPU | burbuja 1200 | 49,4 ms | 17,7 ms | ×2,78 | <0,001 | exp mejor |
| 16 | CPU | ordenar nativo 200k | 100,3 ms | 80,0 ms | ×1,25 | 0,001 | exp mejor |
| 17 | CPU | mapear con cierre | 48,4 ms | 51,0 ms | ×0,95 | 0,273 | empate |
| 18 | CPU | filtrar | 84,7 ms | 78,0 ms | ×1,09 | 0,140 | empate |
| 19 | CPU | reducir | 30,2 ms | 31,6 ms | ×0,96 | 0,427 | empate |
| 20 | CPU | diccionario: contar | 33,4 ms | 30,6 ms | ×1,09 | 0,345 | empate |
| 21 | CPU | diccionario con texto | 30,3 ms | 24,1 ms | ×1,26 | <0,001 | exp mejor |
| 22 | CPU | concatenar texto | 14,9 ms | 8,99 ms | ×1,66 | <0,001 | exp mejor |
| 23 | CPU | interpolación | 36,0 ms | 37,1 ms | ×0,97 | 0,850 | empate |
| 24 | CPU | recursión mutua | 9,28 ms | 8,97 ms | ×1,03 | 0,076 | empate |
| 25 | CPU | ackermann(2, n) | 29,6 ms | 22,3 ms | ×1,32 | 0,006 | exp mejor |
| 26 | CPU | collatz | 197,0 ms | 189,8 ms | ×1,04 | 0,007 | empate |
| 27 | CPU | primos por división | 43,9 ms | 36,8 ms | ×1,19 | <0,001 | exp mejor |
| 28 | CPU | matriz 120×120 con listas | 95,4 ms | 27,0 ms | ×3,53 | <0,001 | exp mejor |
| 29 | CPU | lista de listas: suma | 24,6 ms | 21,7 ms | ×1,13 | 0,045 | empate |
| 30 | CPU | cierre contador | 20,3 ms | 20,5 ms | ×0,99 | 0,678 | empate |
| 31 | CPU | llamadas cortas | 55,6 ms | 29,2 ms | ×1,90 | <0,001 | exp mejor |
| 32 | CPU | booleans y lógica | 50,7 ms | 19,5 ms | ×2,60 | <0,001 | exp mejor |
| 33 | CPU | reales y división | 50,0 ms | 17,8 ms | ×2,80 | <0,001 | exp mejor |
| 34 | CPU | numerico: elemento | 58,8 ms | 49,9 ms | ×1,18 | 0,014 | empate |
| 35 | CPU | numerico: estadística | 119,4 ms | 99,4 ms | ×1,20 | 0,002 | exp mejor |
| 36 | CPU | texto eDSL: sinAcentos | 26,9 ms | 23,0 ms | ×1,17 | 0,021 | empate |
| 37 | CPU | quicksort recursivo | 256,1 ms | 105,9 ms | ×2,42 | <0,001 | exp mejor |
| 38 | página | lista de 100, sin cambios | 1,89 ms | 0,42 ms | ×4,51 | <0,001 | exp mejor |
| 39 | página | lista de 1000, sin cambios | 14,6 ms | 3,55 ms | ×4,11 | <0,001 | exp mejor |
| 40 | página | lista de 1000, cambia una fila | 15,5 ms | 4,52 ms | ×3,43 | <0,001 | exp mejor |
| 41 | página | lista de 1000, cambian todas | 15,9 ms | 9,30 ms | ×1,71 | <0,001 | exp mejor |
| 42 | página | tabla 100×10, sin cambios | 8,92 ms | 3,12 ms | ×2,86 | <0,001 | exp mejor |
| 43 | página | tabla 100×10, cambia una celda | 9,27 ms | 3,98 ms | ×2,33 | <0,001 | exp mejor |
| 44 | página | formulario de 30 cajas, sin cambios | 0,70 ms | 0,08 ms | ×8,89 | <0,001 | exp mejor |
| 45 | página | formulario de 30 cajas con reloj | 0,72 ms | 0,14 ms | ×5,01 | <0,001 | exp mejor |
| 46 | página | lista con clave de 300 que rota | 4,71 ms | 1,28 ms | ×3,68 | <0,001 | exp mejor |
| 47 | página | lista que crece | 11,3 ms | 3,06 ms | ×3,71 | <0,001 | exp mejor |
| 48 | página | lista que encoge | 4,48 ms | 1,19 ms | ×3,75 | <0,001 | exp mejor |
| 49 | página | anidado de 50 niveles | 0,30 ms | 0,31 ms | ×0,96 | 0,273 | empate |
| 50 | página | 20 secciones × 20 párrafos | 2,80 ms | 1,71 ms | ×1,63 | <0,001 | exp mejor |
| 51 | página | 200 nodos con estilo fijo | 3,22 ms | 0,88 ms | ×3,67 | <0,001 | exp mejor |
| 52 | página | estilo que cambia cada turno | 3,20 ms | 1,17 ms | ×2,73 | <0,001 | exp mejor |
| 53 | página | 200 botones | 1,76 ms | 0,52 ms | ×3,38 | <0,001 | exp mejor |
| 54 | página | 100 bloques de HTML crudo | 1,22 ms | 0,25 ms | ×4,85 | <0,001 | exp mejor |
| 55 | página | panel de 50 cajas que se abre y cierra | 0,55 ms | 0,55 ms | ×1,01 | 0,677 | empate |
| 56 | página | 200 casillas gobernadas | 2,87 ms | 0,81 ms | ×3,54 | <0,001 | exp mejor |
| 57 | página | 50 desplegables de 20 opciones | 12,6 ms | 0,28 ms | ×45,51 | <0,001 | exp mejor |


**Cómo leerla.**
- Los empates son los casos que esta fase no tocó: `mientras` y `repetir` (ya eran rápidos), `mapear`/`filtrar`/
  `reducir` (el trabajo está en la nativa), los cierres, `collatz` (divisiones), y en la página el anidado de 50 y el
  panel que se abre y cierra, donde de verdad hay que crear y quitar 50 cajas cada vez.
- El ×45 de los desplegables es real pero tramposo: el LTS rehacía las 20 opciones de cada `<select>` en cada
  repintado; el clon no las toca si no cambiaron. Sin ese caso, la media de página sería ×3,0.
- Una prueba de página salió degenerada en la primera corrida («lista que encoge» acababa vacía por un fallo mío en el
  escenario). Se arregló y **se repitió la corrida entera**; la tabla es la segunda.

## Fase X1 · expresividad (16-oct-2026)

Seis cosas nuevas en el lenguaje. **Ningún opcode nuevo**: la huella del `.elb` es la misma que en el LTS, y un
programa con todo esto viaja en `.elb` y corre igual (hay prueba).

### 1. Registros con métodos

```
tipo Punto {
  x: real
  y: real
}
fn Punto.distancia(otro: Punto): real {
  devolver raiz((yo.x - otro.x) ** 2 + (yo.y - otro.y) ** 2)
}
fn Punto.mover(dx: real, dy: real) { yo.x = yo.x + dx
  yo.y = yo.y + dy }

var p = Punto(0.0, 0.0)          # el constructor: los campos en orden
p.mover(3.0, 4.0)
imprimir(p, p.distancia(Punto(0.0, 0.0)), tipo(p))   # Punto{x: 3, y: 4} 5 Punto
```

- **El verificador conoce los campos.** `c.nombr` se para antes de correr con «¿querías decir «nombre»?»; el
  constructor comprueba cuántos campos y de qué tipo; `p.x = "uno"` se rechaza si `x` es `real`; un `Punto` no vale
  donde se espera un `Color`; los métodos se comprueban como funciones.
- **Sin el tipo a la vista** (un parámetro sin anotar) el error sale al correr, con la lista de campos. Un registro
  tiene los campos que dice su `tipo` y ni uno más: escribir uno que no existe es un error, no un campo nuevo.
- `yo` es el registro sobre el que se llama, y es fijo. `p.distancia` sin llamar es una función que ya lleva su `yo`.
- `==` compara campos **y** tipo: `A(1) == B(1)` es falso, y un registro no es igual a un diccionario. `copiar`
  conserva el tipo. Se imprime `Punto{x: 3, y: 4}`.
- Sin herencia, como elegiste. El constructor y los métodos se pueden usar antes de su declaración, como las funciones.
- **Por dentro**: un registro es un diccionario con su tipo colgado; `tipo` compila a una llamada a una nativa interna
  (` registro`, con espacio: el programa no puede escribirla) que devuelve el constructor. Los métodos son funciones
  llamadas `Punto.distancia` con `yo` delante. El JIT los compila como cualquier función.
- **Límites de esta versión**: un registro no se exporta todavía con `publico` a otro archivo; `guardar`/`aJson` lo
  guardan como diccionario (pierde el tipo); no hay valores por defecto en los campos.

### 2. `si … entonces … sino …` como expresión

```
fijo palabra = si n == 1 entonces "caja" sino "cajas"
imprimir("hay {n} {si n == 1 entonces "caja" sino "cajas"}")     # también dentro de un texto
fn signo(n) { devolver si n > 0 entonces "+" sino si n < 0 entonces "-" sino "0" }
```

Solo se evalúa la rama que toca. Como sentencia, `si` sigue siendo el de siempre. El `? :` de C sigue sin existir a
propósito, y la forma con llaves (`var x = si c { 1 } sino { 2 }`) sigue siendo un error, ahora con un mensaje que
enseña la buena. **Esto cambió una prueba del LTS** (`motor.js`, «no hay ternario con si/sino»): seguía esperando el
mensaje viejo; ahora espera que el error mencione `entonces`.

### 3. `??` y `?.`

```
fijo correo = cliente?.correo ?? "sin correo"
```

`a ?? b` es `a`, salvo que sea nulo (no vale para `0`, `falso` ni `""`: solo nulo). `a?.b` es nulo si `a` es nulo.
`?.` vale para ESE paso: `a?.b.c` no se salta el `.c`.

### 4. Desestructurar

```
var [a, b] = [1, 2]
fijo {x, y} = punto              # un registro o un diccionario, por nombre
fijo [n: entero, t: texto] = par
```

La expresión se evalúa una vez. Con anotación, el tipo se comprueba.

### 5. `segun`

```
segun dia {
  caso 1, 7 { … }
  caso 2    { … }
  otro      { … }
}
```

Compara con `==`, varios valores por caso, sin caída de un caso al siguiente (el fallo clásico del `switch` de C).
`romper` dentro sale del bucle de fuera.

### Lo que se tocó

`src/01-front.js` (léxico `??`/`?.`, parser: `tipo`, métodos, desestructurar, `segun`, `si` expresión, el texto entre
llaves como una sola expresión), `src/02-check-compile.js` (verificador de registros y de las formas nuevas; el
compilador las traduce a opcodes que ya existían), `src/03-vm-jit.js` (campos, métodos atados, `repr`, `==`; el JIT
de `SiExpr`, `??` y `?.`), `src/04-stdlib.js` (` registro`, `tipo()`, `copiar`), `src/06-modulos.js` (un `tipo`
cuenta como declaración del archivo). El diff completo del motor contra el LTS —R1 más X1— está en
`CAMBIOS-MOTOR.diff`.

### 6. Los nombres siguen libres

`tipo`, `segun`, `caso`, `otro`, `entonces` y `yo` **no son palabras reservadas**: solo cuentan con su forma, como
`usar`. `var segun = 1`, `fn otro(x)` y la función `tipo(x)` siguen funcionando, y hay pruebas de eso.

### Las pruebas

- **`pruebas/exp-expresividad.js`: 60 de 60.** Cada cosa: que funciona, que el verificador para los errores antes de
  correr (y antes de imprimir nada), que el mensaje enseña la forma buena, que con y sin JIT da lo mismo (y que el JIT
  de verdad compiló esas funciones), y el viaje por `.elb`.
- **Batería completa del clon: 22 de 23.** La roja es la de siempre (`apps` → `ecosim5.esl`).
- **La comparación de 57 pruebas, repetida con todo esto dentro: el clon mejor en 43, el LTS en 0, empate en 14**
  (p = 2,3·10⁻¹³; CPU ×1,65, página ×3,69). Los registros no le cuestan nada a lo que ya había.

## Fases X2–X4 · lo que le faltaba a la expresividad (17-oct-2026)

Con esto queda cerrada la lista de expresividad. Igual que en X1: **ningún opcode nuevo** (el `.elb` sigue
reconociendo su huella), y lo nuevo viaja en el `.elb` como marcas en las constantes (` minimos:N`,
` corrutina:generador|asincrona`), que un nombre de programa no puede escribir porque empiezan por espacio.

### X2 · valores por defecto, argumentos con nombre, campos por defecto, `publico tipo`, `a?.m()`

```
fn saludar(nombre: texto, saludo: texto = "Hola", signo: texto = "!"): texto { … }
saludar("Ana")                      // Hola, Ana!
saludar(signo: "?", nombre: "Luis") // con nombre, en cualquier orden
saludar("Eva", signo: ".")          // saltarse el del medio

tipo Config {
  nombre: texto
  puerto: entero = 8080
  depurar: bool = falso
}
Config("api", depurar: cierto)

usar Punto de "./geo.esl"           // «publico tipo Punto { … }» en geo.esl: viaja con campos y métodos
a?.doble()                          // nulo si a es nulo, sin llamar
```

- El defecto **se evalúa en cada llamada** (no hay la trampa de Python de una lista compartida) y puede usar los
  parámetros de antes (`fn caja(ancho, alto = ancho)`). `f(nulo)` NO usa el defecto: solo un argumento que falta.
- El verificador resuelve los nombres antes de correr: nombre que no existe (con sugerencia), el mismo dos veces,
  falta el obligatorio, demasiados («entre 1 y 3»), posicional después de uno con nombre, defectos que no van al
  final, y el tipo del defecto. Una función con defectos pasada a `mapear` también funciona (la VM rellena).
- `publico fn Punto.m()` se acepta aunque sobra: los métodos van dentro de cada valor.

### X3 · genéricos

```
fn primero<T>(l: lista, defecto: T): T { … }
fijo n: entero = mismo(3)          // T = entero sale de la llamada
par(1, "dos")                      // error: T no puede ser entero y texto a la vez
```

Solo verificador: dentro de la función `T` es compatible con todo; en cada llamada se unifica con lo que llega y el
resultado se sustituye. No hay `lista<T>` todavía (el verificador no tiene listas con tipo de elemento).

### X4 · corrutinas: generadores y asíncronas

```
fn contar(desde, hasta) {          // una función con «producir» es un generador
  var i = desde
  mientras i <= hasta { producir i
    i = i + 1 }
}
para x en contar(1, 4) { … }       // también infinitos, cortados con romper

usar siguiente, recoger, terminado, dormir, todas de "corrutinas"
siguiente(g, "fin")   recoger(g)   terminado(g)

fn tarea(nombre, ms) {             // una función con «esperar» es asíncrona
  esperar dormir(ms)
  devolver nombre + "!"
}
fn principal() {
  fijo r = esperar todas([tarea("B", 50), tarea("C", 20)])
  fijo resp = esperar pedir("https://…")      // pedir sin función devuelve una promesa
  intentar { esperar falla() } capturar (e) { … }
}
```

- **Cómo va por dentro:** la VM pausa la corrutina guardando su trozo de pila y sus marcos (con bases relativas) y
  los vuelve a poner al reanudar. Corre en el intérprete (el JIT no compila el cuerpo de una corrutina), pero el
  código con JIT que la *recorre* sí va compilado: `para x en gen` funciona con el mismo bucle de siempre.
- Una asíncrona empieza ya, en la misma llamada, hasta su primer `esperar`; lo que devuelve es una `promesa`. El
  resto llega como un turno más del anfitrión (como un clic o un `luego`), así que en el IDE la página se repinta sola.
- Los errores cruzan la frontera: un `lanzar` sin capturar dentro de un generador se captura en quien lo recorre;
  el de una asíncrona rechaza su promesa y se captura en quien la espera, aunque falle antes de su primer `esperar`.
  Si nadie la espera y falla más tarde, sale en la consola como cualquier error de un temporizador.
- `producir` y `esperar` **no son palabras reservadas** (`var producir = 2` sigue valiendo), y los ayudantes van en
  el eDSL `"corrutinas"` y no en el ámbito global — la primera versión los puso globales y rompió dos programas que
  ya existían (`todas` en `20-contador-palabras.txt`, `siguiente` en `28-dias-habiles.txt`). Eso se cazó con la
  batería y se corrigió.
- **Límites conocidos (errores claros, no fallos silenciosos):** una función declarada *dentro* de una corrutina no
  puede usar las variables de esa corrutina («pásasela como argumento»); una función no puede tener `producir` y
  `esperar` a la vez; un generador no tiene `longitud`; `dormir` necesita un anfitrión con reloj (IDE y apps
  exportadas sí; `n-node` no).

### Lo que se tocó

`01-front.js` (`?.` en llamadas, defectos y nombres en el parser, `<T>`, `producir`/`esperar` sin reservar),
`02-check-compile.js` (resolución de nombres y defectos, unificación de genéricos, marcas en el `.elb`, el error de
captura en corrutinas), `03-vm-jit.js` (relleno de argumentos que faltan, `ObjGenerador`/`ObjPromesa`, pausa y
reanudación, los errores que cruzan la frontera, el JIT rechaza corrutinas), `04-stdlib.js` (` producir`, ` esperar`,
el eDSL `corrutinas`, `pedir` sin función), `05-serial.js` (lee las marcas), `06-modulos.js` (`publico tipo` exporta
campos y métodos). Pruebas: `pruebas/exp-expresividad2.js` (nueva) y un cambio en `pruebas/interaccion.js`: la prueba
«pedir sin función es un error» pasa a ser «pedir sin función devuelve una promesa» — **es un cambio de
comportamiento** frente al LTS (algo que antes fallaba ahora vale; nada que antes valía falla).

### Las pruebas

- **`pruebas/exp-expresividad2.js`: 60 de 60** — cada forma, sus errores antes de correr, con/sin JIT, el viaje por
  `.elb` de un generador con defectos, y que `siguiente`, `todas`, `dormir`, `producir`, `esperar` siguen libres.
- `exp-expresividad.js` (X1) sigue en 60 de 60; `motor.js` 232; `interaccion.js` 60; `edsl.js` 116.
- **Batería completa del clon: 23 de 24 suites** (una más que antes: la nueva). La roja es la de siempre (`apps` →
  `ecosim5.esl`). La primera pasada dio otras dos rojas, las dos mías y las dos corregidas: los nombres globales que
  chocaban (arriba) y `edsl.js` «ninguna nativa sin firma» por el ` faltante` de X2, que ya lleva firma.
- **Rendimiento:** la primera medida con X4 dentro mostró `mapear con cierre` un 18 % más lento que el LTS: las
  comprobaciones nuevas (defectos, corrutinas) iban delante del camino rápido de `invocar`, el que usan `mapear`,
  `filtrar` y los eventos. Se puso el camino rápido primero y quedó igual que el LTS (31 ms contra 32). Comparación
  de 57 pruebas, 10 rondas, repetida después: **clon mejor en 39, LTS en 0, empate en 18** (p = 3,6·10⁻¹²;
  CPU ×1,60, página ×3,71).

## Fases S1–S2 · acceso al sistema y FFI (17-oct-2026)

Lo de siempre: **ningún opcode nuevo**, el navegador sigue sin ver nada de esto (el anfitrión del IDE no ofrece
archivos, procesos, puertos ni código nativo), y los nombres nuevos van en dos eDSL —`"nativo"` y `"sistema"`— y no
en el ámbito global, para no quitarle nombres a ningún programa (la lección de X4). Todo funciona en el intérprete
de Node (`util/n-node.js`); el de QuickJS no lo ofrece y lo dice.

### S1 · FFI

```
fijo cos = nativa("libm.so.6", "double cos(double)")          # la firma tal como está en el .h

fijo suma = nativa(LIB, "double suma(const double *a, int n)")
suma(a, 4)                         # un arreglo de Ñ va SIN COPIAR: C lee sus números…
duplicar(a, 4)                     # …y lo que C escribe se ve en el arreglo

fijo d = nativa(LIB, "int dividir(int a, int b, _Out_ int *q, _Out_ int *r)")
fijo [ok, q, r] = d(17, 5)         # _Out_ no se pasa: se devuelve. _Inout_ entra y sale.

usar tipoNativo, retrollamada, enFondo, reservarMemoria, leerMemoria de "nativo"
tipoNativo("int Cmp(int, int)")    # un tipo de función…
fijo ord = nativa(LIB, "void ordenar(int *a, int n, Cmp *cmp)")
ord(e, 4, funcion(x, y) { devolver y - x })    # …y C llama a una función de Ñ

tipoNativo("Nodo")                 # un tipo opaco: sus punteros se guardan y se devuelven a C
fijo r = esperar enFondo(lento, 300)           # en otro hilo, como promesa (X4)
```

- **Lo que se comprueba antes de que nada cruce:** un arreglo solo va a un puntero de *su* tipo de número —koffi
  deja pasar un arreglo de enteros a un `double *` y C lee basura (se vio en la prueba: 6,9·10⁻³¹⁰); ahora es un error
  que nombra los dos tipos—; una vista con huecos (la columna de una transpuesta) se rechaza y dice «pásale
  `copia(a)`»; las variádicas (`printf`) se rechazan diciendo por qué; un tipo desconocido dice cómo declararlo; leer
  de un puntero nulo, o más allá de lo reservado, se para antes de tumbar el proceso.
- **Retrollamadas sin agujeros:** un error dentro de una función de Ñ que llama C **no se lanza a través de C** (eso
  rompe el proceso): se guarda, la retrollamada devuelve un valor neutro, y la llamada nativa, al volver, lo lanza
  como un error de Ñ normal que se captura con `intentar`. Igual con las registradas (`retrollamada(fn, "Tipo")`,
  que C guarda para luego): si C la dispara dentro de una llamada, el error es de esa llamada; si la dispara él solo,
  sale en la consola. `soltarRetrollamada` la suelta, y pasar una soltada es un error, no un salto a ninguna parte.
- **Punteros sin aritmética:** un puntero de C es un valor `puntero` (no un entero): se guarda, se compara y se
  devuelve a C, pero `p + 1` es un error. La forma vieja de `nativa` (con tipos en español y `"puntero"` como
  entero) sigue igual —la suite del LTS pasa entera— y además entiende `"arreglo real"`, `"arreglo entero"`,
  `"memoria"` y los tipos de `tipoNativo`.
- **`enFondo(f, args…)`** llama en otro hilo y devuelve una promesa: dos llamadas de 300 ms tardan ~300 ms, no 600.
  No acepta retrollamadas (C las llamaría desde otro hilo y Ñ corre en uno).
- `reservarMemoria(n)`, `textoDeMemoria`, `leerMemoria`, `escribirMemoria`, `tamanoNativo`, `direccion` y `errorC`
  (el `errno`). La de memoria se llama `reservarMemoria` porque `memoria()` ya existe en el LTS (estadísticas de la VM).

### S2 · sistema

```
usar servir, respuesta, leerLineas, unirRuta, ejecutarEnFondo de "sistema"
servir(8080, fn(p) {               # p: metodo, ruta, consulta, cabeceras, cuerpo, ip
  si p["ruta"] == "/hola" { devolver "hola " + obtener(p["consulta"], "nombre", "mundo") }
  si p["ruta"] == "/datos" { devolver {"a": 1} }               # un dic o una lista: JSON
  devolver respuesta(404, "no está")                          # estado y cabeceras: respuesta()
})
para l en leerLineas("enorme.csv") { … }                      # línea a línea, sin cargarlo entero
ejecutar("git", ["status"], {"carpeta": "repo", "espera": 5000})   # entrada, carpeta, entorno, espera
fijo r = esperar ejecutarEnFondo("make", [])
```

- **El reloj en la consola.** En el LTS `luego`, `cada` —y en el clon `dormir`, `esperar` y todo X4— solo
  funcionaban en el IDE: la consola no tenía reloj. Ahora sí, y un error en un temporizador se dice y el proceso
  acaba con código 1 sin tumbar lo demás.
- **`servir`**: el manejador puede ser asíncrono (devuelve una promesa y se responde cuando esté). Por defecto
  escucha **solo en este equipo** (`127.0.0.1`); abrirlo a la red se escribe: `{"anfitrion": "0.0.0.0"}`. Un error
  en el manejador es un **500 que no cuenta qué falló** a quien pidió —podría ser cualquiera en la red—, y en la
  consola sale entero. Cabeceras con salto de línea, estados fuera de 100–599 u opciones mal escritas son errores.
  Un dic de datos que tenga claves `estado` o `cuerpo` **sigue siendo JSON** (la primera versión lo tomaba por una
  respuesta; por eso existe `respuesta()`). Puerto 0 elige uno libre; `esperar s["listo"]` dice cuál, o falla con
  «el puerto … ya está en uso».
- **Archivos:** `leerLineas` (generador nativo, quita el `\r` de Windows; si se corta con `romper`, el archivo se
  cierra cuando el recolector suelta el generador), `copiarArchivo`, `moverArchivo`, `infoArchivo` (fechas de Ñ),
  `carpetaActual`, `cambiarCarpeta`, `infoSistema`.
- **Rutas:** `unirRuta`, `nombreArchivo`, `extension`, `sinExtension`, `carpetaDe`, `normalizarRuta`,
  `esRutaAbsoluta` con el separador del sistema; sin anfitrión (el IDE) funcionan igual con `/`. `rutaAbsoluta` y
  `rutaRelativa` necesitan la consola.
- **Procesos:** `ejecutar` acepta opciones (`entrada`, `carpeta`, `entorno`, `espera` en ms; una mal escrita es
  error, no se ignora), y `ejecutarEnFondo` lo mismo como promesa.
- **La entrada, de verdad interactiva.** En el LTS `leerLinea` leía la entrada **entera** antes de devolver la
  primera línea: en una terminal, un programa que pregunta «¿Nombre?» no contestaba hasta el Ctrl+D. Se comprobó con
  una pseudoterminal en los dos motores; ahora contesta a cada línea, y la pregunta queda en la misma línea que la
  respuesta.

### Un fallo del LTS que salió por el camino

Un `lanzar` dentro de una función pasada a `mapear`, `filtrar` (o a C como retrollamada) **no lo capturaba ningún
`intentar`** en el LTS: `intentar { mapear([1], funcion(x) { lanzar "a" }) } capturar (e) { … }` terminaba el
programa con «error sin capturar». Es la misma causa que en X4 (el error quedaba «fatal» al cruzar la llamada
nativa) y se arregló en el mismo sitio, `invocar`. Probado con y sin JIT.

### Lo que se tocó

`03-vm-jit.js` (`ObjOpaco` para punteros, memoria y retrollamadas; generadores nativos; el `lanzar` que cruza
`invocar`; cerrar un `leerLineas` abandonado en el recolector), `04-stdlib.js` (la llamada nativa con descripción
de parámetros, los eDSL `"nativo"` y `"sistema"`, opciones de `ejecutar`, la pregunta de `leerLinea`),
`util/nativo-koffi.js` (firmas de C, descriptores de tipos, `tipoC`, registrar, memoria, `enFondo`),
`util/n-node.js` (reloj, servidor, entrada línea a línea, procesos con opciones y en fondo, archivos, rutas, errores
de turno). Ejemplos nuevos en `ejemplos-exp/`: `servidor-tareas.esl` (una API de tareas guardada en JSON) y
`ffi-ordenar.esl` + `.c` (estadísticas y orden en C sobre un arreglo de Ñ, con el criterio escrito en Ñ).

### Las pruebas

- **`pruebas/exp-sistema.js`: 80 de 80**, lanzando el intérprete de verdad y una biblioteca de C que la propia
  prueba compila con gcc (sin gcc o sin koffi, esas se saltan y se dice): firmas, arreglos (y el tipo equivocado,
  y la vista con huecos), salidas, estructuras, opacos, retrollamadas (y sus errores), memoria, `enFondo` en
  paralelo, reloj, archivos, rutas, procesos, el servidor por un puerto de verdad (texto, JSON, HTML, asíncrono,
  204, 404, 500 sin fugas, POST, puerto ocupado), la entrada por tubería y en una pseudoterminal, los nombres que
  siguen libres, y el `lanzar` dentro de `mapear` con y sin JIT.
- `nativo.js` (la del LTS) 58 de 58 · `fuera.js` 33 · `motor.js` 232 · `interaccion.js` 60 · `edsl.js` 116 ·
  `exp-expresividad*` 60 + 60.
- **Batería completa del clon: 24 de 25 suites** (una más: la nueva). La roja es la de siempre (`ecosim5.esl`).
- **Comparación de 57 pruebas, 10 rondas, con todo esto dentro: clon mejor en 41, LTS en 0, empate en 16**
  (p = 9,1·10⁻¹³; CPU ×1,61, página ×3,70). El FFI y el sistema no le cuestan nada a lo demás.

## Fase W1 · Windows (17-oct-2026)

La primera vez que la batería del clon corrió en el PC de Diego (Windows, Node 24.19, gcc de w64devkit, Edge como
navegador de pruebas): **19 de 25**. Todo lo nuevo (R1, P1, X1–X4, S1–S2) pasó; el IDE entero, 108 de 108. Las rojas
eran de Windows y casi todas también están en el LTS, porque **la batería nunca se había corrido en Windows**. Diego
pidió arreglar dos:

### 1. C1EÑ nativo nunca había funcionado en Windows (`en Ñ` 7 fallos, `C1EÑ` se caía)

**Causa:** `util/c1en-nativo.js` le pasaba a gcc `-Wl,-z,nodelete`, una opción del enlazador de Linux (ELF). El de
Windows (PE) no la conoce y no enlaza nada: `unrecognized option '-z'` → `ld returned 1 exit status`. Reproducido en la
nube con un gcc para Windows (`x86_64-w64-mingw32-gcc`). Y el mensaje filtraba las líneas con «error», así que de la
causa solo se veía «ld returned 1». Peor que no tener gcc: con gcc en el PATH, `paralelo` **fallaba** en vez de usar el
JIT.

**Arreglo (solo `util/c1en-nativo.js`, el motor no se tocó):**
- `banderasPara(plataforma)`: en Windows no van `-Wl,-z,nodelete` ni `-fPIC`. La primera no hace falta allí (Windows
  termina los hilos antes de descargar las DLL, así que el fallo de libgomp que evita en Linux no ocurre); la segunda
  gcc la ignora en Windows con un aviso. En Linux, las mismas de siempre. Las de redondeo (`-ffp-contract=off`,
  `-fno-fast-math`, `-fwrapv`) van en las dos.
- **Sonda**: antes de ofrecer «nativo» se compila una vez una biblioteca mínima. Si no enlaza, «nativo» no se ofrece
  y C1EÑ usa el JIT diciendo por qué (`gcc … está, pero no compila una biblioteca con las banderas de C1EÑ: …`). Lo
  aprendido se guarda en la caché (`sonda-<huella>.json`, solo si salió bien) para no pagar compilaciones de prueba
  en cada programa.
- El mensaje de un núcleo que no compila trae las líneas que importan (`unrecognized`, `cannot find`, `undefined
  reference`…), no solo las que dicen «error».

**Probado:** `pruebas/c1en.js` 88 → **95** (siete nuevas: las banderas de Windows y de Linux; un núcleo que enlaza como
DLL de Windows con las nuevas y que NO enlaza con `-z nodelete`, si hay `x86_64-w64-mingw32-gcc`; un gcc falso que no
enlaza → «nativo» no se ofrece y el motivo trae la causa). Además, los **336 núcleos reales** que genera la suite
compilan y enlazan como DLL de Windows con las banderas nuevas (y `-fopenmp`). La prueba de reducciones ya no se cae con
un volcado de pila: si un dispositivo no puede reducir, es un fallo con su mensaje.

### 2. `fuera`: 5 fallos en «arreglos en binario»

**Causa:** la prueba metía la ruta del archivo (`C:\Users\Gamer\AppData\…`) dentro de un texto de Ñ. Cada `\`
seguido de una letra se leía como escape y **desaparecía sin aviso**: `"C:\Users\Gamer"` imprime `C:UsersGamer`.
Era de la prueba, no del motor; la de archivos de más arriba ya escribía la ruta con `/`.

**Arreglo:** la ruta va con `/` dentro del programa (Windows la entiende igual). `pruebas/fuera.js`, 4 líneas.

**Visto y NO tocado (es del motor y es una decisión):** que un escape desconocido (`\U`, `\G`…) se trague la barra
en silencio es exactamente la clase de error que Ñ existe para quitar. Lo coherente sería un error de léxico con pista
(«escribe `\\` o usa `/` en las rutas»). Queda para una fase con su prueba.

### La batería después

En la nube (Linux, Chromium): **24 de 25**, la roja la de siempre (`apps` → `ecosim5.esl`). `bundle.js` idéntico byte a
byte: el motor no cambió. **El LTS tiene los dos fallos arreglados aquí** (las mismas banderas, la misma prueba): no se
tocó, por la regla.

### 3. Núcleos NEÑ y `errorC` (pedidos después, el mismo día)

- **`potencia` a 10 ulp** (`pruebas/nen-nucleos.js`): la biblioteca matemática de mingw redondea peor que glibc. El
  tope de los núcleos que usan la biblioteca matemática pasa a 16 ulp **solo en Windows** (en Linux sigue en 8). Es un
  error relativo del orden de 2·10⁻¹⁵: lo que se vigila es que no se dispare, no que dos bibliotecas de C redondeen
  igual. Los núcleos sin trascendentes siguen exigiéndose bit a bit.
- **EPERM al terminar** (misma prueba): Windows no deja borrar una DLL cargada. Ahora se suelta (`lib.unload()`) antes
  de borrar la carpeta, y si aun así no se puede, se avisa en una línea en vez de tumbar la suite.
- **`errorC` daba 0** (`pruebas/exp-sistema.js`): en Windows no hay un `errno`, hay uno por biblioteca de C
  (`msvcrt.dll`, `ucrtbase.dll`…), y `errorC` ve el que ve koffi. La prueba usaba `msvcrt.dll`; en Windows ahora usa
  `ucrtbase.dll` (la de Windows 10 y 11). Si tampoco se ve, la prueba se **salta diciendo por qué** (límite de la
  plataforma), en vez de fallar. **Sin probar en Windows todavía**: la próxima batería en el PC de Diego dirá cuál de
  las dos pasa. En Linux, la prueba de siempre, igual.
- Lo que hay que saber al usar `errorC` en Windows: solo sirve con funciones de la biblioteca de C que comparte koffi;
  una DLL compilada con otra (por ejemplo, con `msvcrt`) tiene su propio `errno` y `errorC` no lo ve.

## Lo que viene (en este clon, en este orden)

| fase | qué | toca | estado |
|---|---|---|---|
| R1 | rango sin lista, `a[i]` rápido, autollamada, `arreglo[i]` | JIT, VM | **hecha** |
| P1 | la página se reconcilia y recuerda | anfitrión | **hecha** |
| X1 | registros + métodos, `si` expresión, `??`, `?.`, desestructurar, `segun` | parser, verificador, compilador, VM, JIT | **hecha** |
| X2 | parámetros por defecto y con nombre, `publico tipo` entre archivos, valores por defecto en campos, `a?.m()` | parser, verificador, VM (aridad) | **hecha** |
| X3 | genéricos de usuario (`fn primero<T>(x: T): T`; `lista<T>` aún no) | verificador | **hecha** |
| X4 | corrutinas al estilo Lua: generadores (`producir`) y asincronía (`esperar`) | VM | **hecha** |
| R2 | `a[i]` de arreglo dentro del JIT; JIT para los bucles del nivel superior | JIT | pendiente |
| D1 | `bytes`, `conjunto`, `patron`, archivos grandes línea a línea, `unir`/`pivotar` | VM, eDSL | pendiente |
| S1–S2 | FFI con firmas de C, arreglos sin copiar, salidas, retrollamadas, memoria, en fondo; reloj en consola, `servir`, archivos, rutas, procesos, entrada interactiva | VM, biblioteca, anfitrión de Node | **hecha** |
| S3 | puente a npm (`usar x de "npm:paquete"`), FFI en QuickJS, variádicas | anfitrión | pendiente |
| P2–P5 | PWA, servidor desplegable, ventana web de escritorio, instalador | anfitrión | pendiente |
| W1 | Windows: C1EÑ nativo enlaza (sin `-z nodelete`), sonda del compilador, rutas en `fuera`, tolerancia y limpieza de NEÑ, `errorC` con `ucrtbase.dll` | anfitrión de Node, pruebas | **hecha** (`errorC` por confirmar en Windows) |

Cada fase deja su sección en este archivo: qué se tocó, qué se probó, qué se rompió.
