# motor-exp — el clon experimental de E8

> **Regla (Diego, 16-oct-2026):** se experimenta aquí. `motor/` es el **LTS** y no se toca. Un cambio pasa al LTS
> solo si funciona, no rompe nada **y Diego dice que se haga**.

> **17-oct-2026: ascendido.** Diego lo pidió («traspasa las funciones experimentales del motor-exp al LTS») y todo
> lo de R1, P1, X1–X4, S1–S2 y W1 está ahora en `motor/` como **4.1**. Qué entró, qué cambia para un programa de la
> 4.0 y qué se comprobó: `docs/CAMBIOS-4.1.md`. Este clon sigue siendo el sitio de lo que viene (R2, D1, S3, P2–P5):
> desde hoy parte de la 4.1, así que las comparaciones con `util/banco.js` miden clon contra 4.1, no contra la 4.0.

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

- **`potencia` fuera de tolerancia** (`pruebas/nen-nucleos.js`): la biblioteca matemática de mingw (la de `msvcrt`)
  redondea peor que glibc. Primero dio 10 ulp; con el tope subido a 16 dio 19 en otro dato: subir el tope a ojo no
  sirve. En Windows el tope pasa a ser **lo que C1EÑ promete** para las trascendentes, diferencia relativa < 1e-14
  (45 ulp); si un núcleo pasa de ahí, ya es un fallo y no redondeo. En Linux sigue en 8. Los núcleos sin
  trascendentes se siguen exigiendo bit a bit en todas partes.
- **EPERM al terminar** (misma prueba): Windows no deja borrar una DLL cargada. Ahora se suelta (`lib.unload()`) antes
  de borrar la carpeta, y si aun así no se puede, se avisa en una línea en vez de tumbar la suite.
- **`errorC` daba 0** (`pruebas/exp-sistema.js`): en Windows no hay un `errno`, hay uno por biblioteca de C
  (`msvcrt.dll`, `ucrtbase.dll`…), y `errorC` ve el que ve koffi. La prueba usaba `msvcrt.dll`; en Windows ahora usa
  `ucrtbase.dll` (la de Windows 10 y 11). Si tampoco se ve, la prueba se **salta diciendo por qué** (límite de la
  plataforma), en vez de fallar. **Resultado en el PC de Diego: saltada** — koffi tampoco ve el `errno` de
  `ucrtbase.dll`. Así que en Windows `errorC` no es fiable con funciones de las DLL del sistema. En Linux, la prueba de
  siempre, igual.

**Batería en el PC de Diego después de W1: 23 de 25** (antes 19). C1EÑ nativo funciona en Windows por primera vez
(`C1EÑ (jit, nativo, gpu simulada)`, 79 pasan; `en Ñ` 792). Quedaban `ecosim5` (la de siempre) y `potencia` a 19 ulp,
que llevó al tope de 1e-14 de arriba.
- Lo que hay que saber al usar `errorC` en Windows: solo sirve con funciones de la biblioteca de C que comparte koffi;
  una DLL compilada con otra (por ejemplo, con `msvcrt`) tiene su propio `errno` y `errorC` no lo ve.

## Fase N1 · NEÑ: precisión y tipos, amplitud, volumen, y numerico + datos dentro (19-oct-2026)

Pedido de Diego: «Mejora NEÑ en Precisión y tipos, Amplitud de Funciones Gradualmente, Rendimiento en Volumen, y dame
el Notebook para medir la Velocidad de C1EÑ en GPU, y de paso integra todas las Funciones de Numérico y Datos a NEÑ».

### 1. numerico y datos dentro de «nen»

`usar … de "nen"` trae ahora **los 190 nombres de numerico y los 51 de datos**, además de los suyos: un programa
científico necesita un solo `usar`. No son copias: `reexportarEnNen` (18-nen-precision.js) registra **el mismo objeto**
con el nombre de nen, así que `usar media de "numerico"` y `usar suma de "nen"` en el mismo programa no chocan, y la
referencia documenta cada función una sola vez, donde nació (`util/referencia.js` salta los alias y no los cuenta dos
veces en la portada).

Tres nombres existen en los dos (`fila`, `donde`, `apilar`). En nen eligen por el tipo del primer argumento (`despacha`):
con una tabla hacen lo de datos, con un arreglo lo de numerico. `abrirEdsls` (el perfil C1EÑ, que abre numerico y nen
sin `usar`) ya no se queja de «ya lo trae abierto numerico» cuando es el mismo objeto, y deja la versión que despacha.

### 2. Precisión y tipos: el tipo `grande` y los enteros exactos (src/18-nen-precision.js, nuevo)

- **`grande`** es un decimal de precisión arbitraria (mantisa BigInt × 10^e). De un entero o de un texto sin coma es
  **exacto** (nunca se redondea al sumar, restar o multiplicar); de una división o una función, lleva sus cifras (50 por
  defecto, `cifrasGrande(n)` lo cambia para lo que se cree después). `+ − * /` y `raizGrande` con **redondeo correcto**
  (al par); exp, ln, sen, cos, tan, arcos y potencias con 12 cifras de guarda; π por Chudnovsky.
- Es un tipo del lenguaje, no una función más: está en el verificador (`T.grande`; `grande + real → grande`,
  comparaciones, `-g`), la VM (`+ − * / ** //`, `== < <= > >=` también en el JIT, verdad, repr, `real(g)`, `entero(g)`)
  y `probar` (comparar grandes). `grande("0.1") + grande("0.2") == grande("0.3")` es `cierto`. Con un real se mezcla
  por su decimal más corto (0.1 es «0.1»); `grandeExactoDe(0.1)` enseña el binario de verdad.
- 27 funciones: `grande, cifrasGrande, cifrasDe, esExacto, grandeExactoDe, redondearGrande, decimalesGrande, aReal,
  raizGrande, expGrande, logGrande, senoGrande, cosenoGrande, tangenteGrande, arcotangenteGrande, arcosenoGrande,
  arcocosenoGrande, potenciaGrande, piGrande, eGrande, factorialExacto, potenciaExacta, combinacionesExactas,
  fibonacciExacto, mcdExacto, esPrimoExacto, cifrasExactas`.
- `numerico.factorial(171)` dice ahora «no cabe en un número real (el más grande que cabe es 170!)» con la pista
  `factorialExacto`. `lleno` y los arreglos enteros miran que el valor quepa en 32 bits.
- **Cambio a propósito:** `arreglo([1.0, 2.0])` era «de entero» (1.0 es entero por su valor y el tipo se deducía de los
  valores); ahora un literal real escrito con punto hace el arreglo real, como se escribió.

### 3. Amplitud, primera tanda (src/19-nen-amplitud.js, nuevo)

43 funciones: especiales (`lambertW` con las dos ramas, `integralExponencial`, `integralExponencialE1`, `integralSeno`,
`integralCoseno`, `fresnelS`, `fresnelC`, `elipticaK`, `elipticaE`, `dilogaritmo`, `hipergeometrica` ₂F₁, `besselI`,
`trigamma`, `poligamma`, `sinc`); densidades y acumuladas (gamma, beta, Weibull, lognormal, Cauchy, logística,
exponencial, t, χ², F, geométrica, binomial negativa, hipergeométrica); muestreo (`azarExponencial, azarGamma`
Marsaglia–Tsang, `azarBeta, azarChiCuadrado, azarTStudent, azarPoisson` Knuth/PTRS, `azarBinomial` inversión/BTRS,
`azarLogNormal, azarWeibull, azarCauchy`), todas con `semilla`.

### 4. Rendimiento en volumen

- `senoA`, `expA` y las demás unarias trabajan sobre los datos del arreglo (subarray) y escriben en uno nuevo, sin
  listas de paso.
- `suma, media, varianza, desviacion` de un arreglo seguido leen sus datos sin copiarlos a una lista. La suma va en el
  mismo orden (de izquierda a derecha desde 0): **el resultado es idéntico al de antes**, al bit (la suite lo exige).
- La aritmética de arreglos (`x * 2`, `x + y`) usa una copia de la función por cada combinación de tipos
  (`opMonomorfa`): una sola función para Float64Array e Int32Array era 2× más lenta en V8. Respeta la CSP (sin
  `new Function` si la página no lo deja).
- `por` (matrices) en la CPU usa un núcleo nuevo, **`nen_matmul_filas`**: bloques de 4 filas × 8 columnas y trozos de
  K de 256. En la GPU sigue `nen_matmul` (una celda por hilo). Los dos suman cada celda en el mismo orden de k: **dan el
  mismo número** (comprobado en `pruebas/nen-nucleos.js`: C contra JS y los dos núcleos entre sí, con m y p que no son
  múltiplos del bloque y K > 256). `multMatriz` y `por` de numerico usan este camino.
- `C1EN_OPT` (variable de entorno) cambia el `-O2` de gcc para el dispositivo nativo (p. ej. `C1EN_OPT="-O3
  -march=native"`), separado por espacios.

Medido en la nube (2 vCPU), mejor de 7, LTS → motor-exp:

| prueba | jit | nativo |
|---|---|---|
| `x * 2 + 1` (1 M) | 9,1 → 9,7 ms | 9,5 → 9,9 ms (igual: ya era rápido) |
| `senoA` (1 M) | 14,5 → 8,9 ms | 12,6 → 6,5 ms |
| `expA` (1 M) | 31,0 → 22,9 ms | 7,8 → 4,5 ms |
| `suma` (1 M) | 45,9 → **1,3 ms** | 45,3 → **1,4 ms** |
| `media` / `varianza` / `desviacion` (1 M) | 44 / 56 / 57 → 1,3 / 2,6 / 2,5 ms | igual |
| `por` 300×300 | 46,0 → 23,8 ms | 53,8 → **8,8 ms** |
| `por` 1000×1000 | 1.435 → 1.001 ms | 1.559 → **339 ms** (≈ 5,9 GFLOP/s; NumPy con BLAS ≈ 17 ms) |

### 5. El cuaderno de velocidad en GPU

- `c1en/velocidad-c1en.esl` — el programa de medida: núcleos de `paralelo` (saxpy, π, mandelbrot, n-cuerpos,
  histograma con `sumarAtomico`), NEÑ en volumen (`senoA, expA, softmax, sumaEje, por, fourier`) y aritmética de la VM.
  `DISPOSITIVO ESCALA [REPETICIONES] [PRESUPUESTO_MS]`; mide aparte la primera vez (compilar) y salta los tamaños
  mayores si una prueba se pasa del presupuesto. Corre igual en el LTS y en motor-exp.
- `c1en/kaggle-c1en-velocidad.ipynb` — en Kaggle (T4 ×2): jit · nativo · gpu de uno o los dos motores, ECOSIM-G v3.1
  en ms por tick y por mundo (restando una corrida de 60 ticks a una de 600, para no contar la compilación), NumPy y
  CuPy con los mismos tamaños (CuPy con y sin copia a la GPU), tabla, comprobación de la huella (las pruebas sin
  trascendentes tienen que dar lo mismo en los tres dispositivos), gráficas y tres archivos para descargar.
- Probado aquí con la GPU **simulada** y escala `chica`, los dos motores, de punta a punta: todas las huellas iguales
  en jit, nativo y gpu-sim. Los tiempos de la T4 de verdad solo los da Kaggle.

### Qué se probó

- **Suite nueva `pruebas/exp-nen.js` (35):** la unión (cada nombre de numerico y datos está en nen y es el mismo
  objeto; las tres que despachan); **34 valores de `grande` contra mpmath** cifra a cifra
  (`pruebas/datos-nen/precision-mpmath.json`); operadores, comparaciones, checker, `cifrasGrande`, errores; enteros
  exactos contra BigInt (200!, 2^1000, C(300,150), F(1500)), Miller–Rabin; **257 valores de 34 funciones contra SciPy a
  1e-11** (`pruebas/datos-nen/amplitud-scipy.json`; el peor 3e-13); 11 distribuciones con media y varianza de la
  teoría y reproducibles con semilla; reducciones y `por` iguales al bit que antes; con y sin JIT iguales.
- `pruebas/nen-nucleos.js`: 4 casos de `nen_matmul_filas` y la comparación cruzada con `nen_matmul` (51 casos, 0 fallan).
- Ejemplos para el libro de las 74 funciones nuevas (`util/ejemplos-nen-precision.js`); la referencia se genera
  (867 entradas = 96 globales + 771 en 11 eDSL).
- **Batería completa: 22 de 23 en verde**; la roja es la de siempre, `apps` → `ecosim5.esl` («ventas.csv» no es un
  número: `util/correr-ejemplos.js` le pasa un nombre de archivo a un programa que espera un número; también en el
  LTS, no es de esta fase).

### Qué se rompió o cambió por el camino

- `util/ejemplos-biblioteca.js` y `util/referencia.js` de motor-exp se habían quedado atrás del LTS 4.1 (sin los
  ejemplos de corrutinas, nativo y sistema, ni su anfitrión de mentira): la referencia de motor-exp no se generaba. Se
  tomaron los del LTS y se les añadió lo de N1.
- `arreglo([1.0, 2.0])` es ahora real (arriba). Un programa que dependiera de que saliera entero cambia.

### Lo que viene en NEÑ (tandas siguientes)

- Amplitud 2: Bessel Y/K y de orden real, Airy, zeta de Hurwitz, funciones de Struve, distribuciones multivariantes
  (normal multivariante, Dirichlet, multinomial), cuasi-azar (Sobol, Halton).
- Precisión 2: `complejoGrande`, intervalos (`intervalo(a, b)` con redondeo hacia afuera), racionales exactos.
- Volumen 2: `x * 2 + 1` sin temporales (fusionar las operaciones de una expresión en un solo bucle o núcleo de
  C1EÑ), FFT de radix 4 en la CPU, y lo que diga el cuaderno de la T4.

## Fase N2 · NEÑ en la GPU de verdad: residencia, FFT, matrices y aritmética (19-oct-2026)

La medida de la T4 en Kaggle (cuaderno `c1en/kaggle-c1en-velocidad.ipynb`, commit `e7d13a7`) dejó tres problemas
claros, y Diego pidió arreglarlos y que **todo NEÑ corra en la GPU si la hay, o en la CPU (C con OpenMP) si no**:

| en la T4 (N1) | qué pasaba | causa, en el código |
|---|---|---|
| `senoA` 16 M: GPU 352 ms, nativo 166, CuPy con copia 89 | la GPU era más lenta que la CPU | `vm.c1en.kernel()` (el camino de NEÑ) reservaba, subía **todos** los arreglos, bajaba **todos** y liberaba en cada llamada; no usaba la residencia que sí tenía `paralelo` |
| `fourier` 4 M: 1,4 s en jit, nativo y GPU | el dispositivo no cambiaba nada | `fourier` de numerico era JavaScript puro; y los núcleos de FFT de NEÑ hacían divisiones de 64 bits por mariposa (en la GPU se emulan) |
| `por` 2048: GPU 45 GFLOP/s, nativo 1,8 | lejos de CuPy (250) y de NumPy | GPU: una casilla por hilo; CPU: cada grupo de filas leía b entero de la memoria |

### 1. Residencia para los núcleos de NEÑ (src/14-c1en.js)

- `lanzarKernel` (lo que usa `vm.c1en.kernel`) trata un arreglo de Ñ seguido y dueño de su memoria igual que
  `paralelo`: **residente**. Se sube una vez; el resultado se queda en la GPU; baja solo cuando alguien lo lee desde la
  CPU (el `get datos()` de siempre). Una cadena como `suma(expA(senoA(x)) * 2 + 1)` sube `x` y baja un número.
- Cada núcleo dice qué arreglos **solo lee** (`spec.lee`: no se bajan) y cuáles **escribe enteros** (`spec.escribe`: no
  se suben). Todos los núcleos de NEÑ lo declaran.
- **Memoria reutilizable**: lo que se suelta se guarda por tamaño y GPU (hasta `C1EN_POOL_MB`, 1024 por defecto) y se
  vuelve a dar sin `cuMemAlloc`/`cuMemFree`. Si la GPU dice que no hay memoria: se vacía la reserva, se libera lo
  pendiente, y si aún no cabe se bajan a la CPU los residentes que no están en uso (sus datos vuelven, no se pierden).
  `liberarResidentes()` deja la GPU limpia del todo, reserva incluida.
- Medido en la GPU simulada con `C1EN_ESTADISTICAS=1`: la cadena de arriba con 2^20 números, **8 MB subidos y 0 bajados**;
  `por(por(A, A), A)` sube A una vez; `fourier` de 2^20, una subida de datos y una bajada (antes, 2 por etapa).

### 2. Todo el volumen de NEÑ por el dispositivo (src/17, 11, 03)

- Las unarias (`senoA`…), `redondearA`, `potenciaA`, `anguloA`, `softmax` (eje último), las reducciones por eje y
  `multLotes` pasan el arreglo **tal cual** al núcleo y devuelven el arreglo nuevo residente. Antes copiaban a un
  Float64Array (y eso obligaba a bajar de la GPU).
- **La aritmética de arreglos de la VM** (`x * 2 + 1`, `a / b`): con más de 32.768 números y dispositivo nativo o GPU va
  por dos núcleos nuevos (`nen_op_aa`, `nen_op_ae`). Solo `+ − * /` con reales (exactos en IEEE: el mismo número en todas
  partes), dos arreglos seguidos de la misma forma o arreglo con número; dividir entre cero sigue siendo el error de
  siempre (el núcleo levanta una bandera). Difusión, vistas, enteros, `%`, `//`, `**` siguen en la VM.
- **`suma`, `media`, `varianza`, `desviacion` de numerico** para arreglos reales: por la reducción de NEÑ, **por trozos
  de 4096 en orden**, igual en jit, nativo y GPU. Con 4096 números o menos es exactamente la suma de izquierda a derecha
  de antes; con más, los trozos se suman entre sí: el resultado cambia en las últimas cifras respecto a N1 (y suma con
  menos error). **Es el único cambio de resultados de la fase.** Las listas y los arreglos enteros, como antes.
- `por` de numerico usa `vm.nenPor`: sin copiar los arreglos y con el resultado residente.
- Por debajo de 32.768 números todo sigue en JavaScript (lanzar un núcleo cuesta más que hacerlo).

### 3. Fourier por los núcleos (src/17, 11)

- `fourier`, `fourierInversa`, `espectro` y `convolucion` de numerico transforman con `vm.nenFFT` (los núcleos de FFT de
  NEÑ), con los datos residentes entre la permutación y las log₂ n etapas, y la división de la inversa hecha allí.
  **Dan los mismos números que antes, al bit** (mismas tablas, mismas mariposas, mismo Bluestein): comprobado contra el
  LTS.
- `nen_fft_permutar` y `nen_fft_etapa` reciben log₂ N y log₂ largo y calculan los índices con desplazamientos y
  máscaras: sin divisiones de 64 bits (en la GPU se emulan; en la CPU, 40 ciclos cada una).

### 4. Multiplicar matrices (src/17)

- **CPU, `nen_matmul_bloques`** (sustituye a `nen_matmul_filas` de N1): cada hilo hace 4 filas × 32 columnas, y los
  hilos vecinos comparten las mismas 32 columnas de b, que se quedan en la caché del núcleo. Micronúcleo 4×8 en
  registros, k por trozos de 256.
- **GPU, `nen_matmul_4x4`**: 16 casillas por hilo en registros (4 lecturas de a y 4 de b por 16 productos, cuatro veces
  más cuenta por lectura), lecturas de b seguidas dentro de un warp. Sin memoria compartida ni `__syncthreads`, para
  que corra igual en C, en el simulador y en la T4.
- Los tres productos (`nen_matmul`, bloques y 4×4) suman cada casilla en el mismo orden: **mismos bits**
  (pruebas/nen-nucleos.js los compara entre sí). Nota honesta: C1EÑ no usa FMA (para dar los mismos bits que la CPU), así
  que su techo en la T4 es la mitad del de cuBLAS (≈ 125 frente a 250 GFLOP/s en doble).

### Medido aquí (nube, 2 vCPU, nativo; LTS → N2)

| prueba | LTS | N2 |
|---|---|---|
| `x * 2 + 1` (1 M) | 10,4 ms | 5,3 ms |
| `senoA` (1 M) | 11,4 ms | 4,8 ms |
| `suma` / `varianza` (1 M) | 45 / 60 ms | 1,3 / 2,6 ms |
| `suma(expA(senoA(x)) * 2 + 1)` (1 M) | 74 ms | 22 ms |
| `fourier` 2^20 | 162 ms | 92 ms |
| `por` 300 / 1000 / 2048 | 40 ms / 1,49 s / 14,3 s | 7,4 ms / 173 ms / **2,2 s** |

Los tiempos de la T4 los da el cuaderno de Kaggle (ahora con `senoA+copia` y `cadena` para comparar con CuPy con y sin
copia, calentamiento antes de medir ECOSIM-G y la huella calculada fuera del tiempo medido).

### Qué se probó

- **Suite nueva `pruebas/exp-nen-gpu.js` (12):** `pruebas/datos-nen/dispositivos.esl` calcula 29 operaciones de NEÑ
  en jit y en el dispositivo (aritmética, reducciones, `por`, `multLotes`, Fourier de potencia de dos y no, convolución,
  unarias, softmax, una cadena) y las compara: exactas al bit, seno/exp a 1e-14. En **nativo** y en la **GPU
  simulada**: 29 de 29. Leer y escribir desde la CPU un resultado residente, y dividir entre cero, también. La
  residencia se comprueba contando el tráfico (tres casos). Y `fourier`, `fourierInversa`, `espectro`, `convolucion`,
  `por` y `x * 2 + 1` dan **los mismos números que el LTS** en jit, nativo y GPU simulada. Con `--gpu` usa la GPU de
  verdad.
- `pruebas/exp-nen.js` (37): la reducción por trozos rehecha en JavaScript, al bit; con ≤ 4096, igual que la lista.
- `pruebas/nen-nucleos.js`: 38 núcleos, 70 casos; los nuevos (`nen_matmul_bloques`, `nen_matmul_4x4`, `nen_op_aa`,
  `nen_op_ae`) bit a bit contra su JavaScript, y los tres productos entre sí.
- `pruebas/c1en.js`: 95 de 95 (incluida la de que al soltar los residentes no queda memoria en la GPU).
- ECOSIM-G v3.1 (4 mundos, 400 ticks): el CSV de mundos es idéntico byte a byte en el LTS y en N2, en jit, nativo y GPU
  simulada.
- **Batería: 23 de 24**; la roja es la de siempre (`apps` → `ecosim5.esl`).

### Qué se rompió o cambió

- `suma`/`media`/`varianza`/`desviacion` de arreglos reales de más de 4096 números: últimas cifras distintas que en N1
  (por trozos). Ver arriba.
- `nen_matmul_filas` (de N1, nunca llegó al LTS) ya no existe: lo sustituye `nen_matmul_bloques`.
- Los núcleos `nen_fft_permutar` y `nen_fft_etapa` cambiaron de parámetros (log₂).
- Por el camino apareció y se arregló un fallo propio de la fase: la reserva redondeaba el tamaño de los arreglos de
  menos de 8 bytes y la residencia creía que habían cambiado de tamaño, y los soltaba sin bajarlos (dos pruebas de
  `pruebas/c1en.js` lo vieron).

## Fase N3 · El BLAS propio de C1EÑ: DGEMM con FMA en GPU y CPU, y una FFT de pocas pasadas (20-oct-2026)

En la comparación de Kaggle (`c1en/kaggle-comparar-lenguajes.ipynb`), PyTorch y torch para R le ganaban a Ñ de lejos en
`matmul` (los dos usan cuBLAS en la GPU y MKL/oneDNN en la CPU) y en `fft` (cuFFT). Diego pidió **nuestro propio
cuBLAS** —sin depender de las bibliotecas de NVIDIA— y **un núcleo propio en la CPU**, también sin bibliotecas.

| en Kaggle (N2) | Ñ | el mejor | por qué |
|---|---|---|---|
| matmul 2048, T4 | 163,6 ms (≈105 GFLOP/s) | PyTorch 69,7 (≈247 = el pico de la T4 en doble) | **sin FMA**: C1EÑ compila con `--fmad=false` para dar los mismos bits que JavaScript, y la DFMA es la mitad del pico (sin ella la T4 no pasa de ~127) |
| matmul 2048, CPU | 2941 ms (≈6 GFLOP/s) | PyTorch 311 (≈55) | sin FMA y sin AVX: gcc `-O2` sin `-march` solo usa SSE2 (2 números por instrucción) |
| fft 2^20, T4 | 80,2 ms | 0,85 | la entrada se pasaba a complejos en la CPU, subía, y el resultado bajaba en cada llamada; y 21 pasadas por la memoria |
| fft 2^20, CPU | 113,9 ms | 30,9 | 21 pasadas por la memoria, de a una etapa |

### 1. La FMA en los tres dispositivos, con los mismos bits

La regla de C1EÑ es que jit, nativo y GPU dan **el mismo número al bit**. Por eso no había FMA: gcc con
`-ffp-contract=off`, NVRTC con `--fmad=false`, porque JavaScript no la tiene. La salida no es renunciar a la regla sino
**darle FMA a JavaScript**: `nenFma(a, b, c)` en `src/17-nen-tensores.js` la emula **exacta** (un solo redondeo).

- Camino rápido: a·b = p + e exacto (Dekker con el partido de Veltkamp), c + p = th + tl exacto (TwoSum), v = tl + e
  **redondeado a impar** y el resultado th + v al más cercano: el algoritmo de Boldo y Melquiond (IEEE TC 2008), probado
  formalmente. Camino lento para los extremos (cerca del desbordamiento o de los subnormales): exacto con BigInt.
- Comprobada contra la `fma` de C (glibc) en **16 millones de casos** (bits al azar, mantisas cortas con empates y
  cancelaciones, exponentes extremos, c = −a·b ± 2 ulp, valores de matmul): **0 diferencias**, en los dos caminos.
- En el producto de matrices, `nenFmaFila` hace una fila con b ya partido. Cuesta: **jit `por` es unas 4–5 veces más
  lento que antes** (1024: 8,1 s aquí). Es el precio de que jit dé los mismos bits que la GPU con FMA.
- Solo el producto de matrices usa FMA. El resto de los núcleos (y todo `paralelo`, ECOSIM incluido) sigue sin FMA.

### 2. `nen_dgemm`, el DGEMM de C1EÑ (src/17)

`por`, `multMatriz`, `multLotes` y todo lo que multiplica matrices en NEÑ y numerico va por un solo núcleo, `nen_dgemm`,
con una versión escrita a mano para cada dispositivo. Cada casilla: s = +0; para k de 0 a K−1, s = fma(a, b, s). Mismo
orden y FMA exacta → **los mismos bits en jit, nativo (con o sin AVX) y GPU**.

- **GPU**: mosaico de 64×64 de C por bloque de 256 hilos, 4×4 casillas por hilo (filas ty+16i, columnas tx+16j), trozos de
  16 en k por **memoria compartida** con `__syncthreads`, A traspuesta y con una columna de relleno para no chocar en los
  bancos. 16 DFMA por cada 8 lecturas de memoria compartida: lo que manda es la DFMA, como en cuBLAS. Pasado por clang a
  PTX de sm_75: 272 `fma.rn.f64`, 2 barreras.
- **CPU**: B en paneles de 8 columnas y A en paneles de 6 filas, contiguos en k, por trozos de 256; micronúcleo AVX2 de
  6×8 con **12 registros de suma** y `_mm256_fmadd_pd`; OpenMP por bloques de 96 filas. Se elige en tiempo de ejecución
  (`__builtin_cpu_supports("avx2")` y `"fma"`, con `__attribute__((target))`: no hace falta compilar todo con
  `-march`); sin AVX2 (o con `C1EN_SIN_AVX=1`) el mismo con `fma()` de C. Entre trozos de k la suma parcial se guarda y
  se retoma: el orden de cada casilla no cambia.
- Medido aquí (2 vCPU Xeon 2,8 GHz con AVX2): **2048 en 279 ms = 61,5 GFLOP/s** (N2: ~2,2 s), 1024 en 41 ms. En Kaggle
  (2,2 GHz) debería quedar cerca de PyTorch (311 ms).
- `nen_matmul`, `nen_matmul_4x4` y `nen_matmul_bloques` (N2, sin FMA) siguen en la lista como referencia.

### 3. Núcleos con fuente propia en C1EÑ (src/14-c1en.js)

`vm.c1en.kernel(spec)` acepta ahora, además del cuerpo por índice:

- `cFuente`: la función de C entera (reparte el trabajo como quiera), y `cudaFuente`: el `__global__` entero, que puede
  usar `__shared__` y `__syncthreads`, con `lanzamiento(...args) → { bloques, hilos }`;
- `coop: true`: en el simulador, cada hilo del bloque es una **corrutina** (`ucontext`) y `__syncthreads` cede el turno
  (pruebas/c1en-sim/cuda-falsa.h). Así el DGEMM y la FFT de memoria compartida se prueban sin GPU;
- `minParalelo`: desde cuántos índices se reparte entre los hilos de la CPU (1 para núcleos de índices pesados);
- los parámetros `f64*` de estos núcleos aceptan **arreglos complejos** (sus 2n reales entrelazados), y un complejo puede
  quedarse **residente** en la GPU. `paralelo` sigue sin aceptarlos.

### 4. La FFT de pocas pasadas, residente (src/17, 11)

- `nen_fft_cargar_real`: el real se carga ya permutado como complejo, **en el dispositivo** (antes se copiaba a complejos
  en la CPU y subía el doble).
- `nen_fft_bloque`: las primeras etapas (largo 2…2048) de un trozo de 2048 números, todas de una vez: en la GPU un bloque
  lo carga en **memoria compartida** (32 KB) y hace las 11 etapas con barreras; en la CPU, un hilo por trozo (cabe en la
  caché).
- `nen_fft_r8`: las demás etapas **de tres en tres** (cada hilo, los 8 números que esas tres mezclan, 12 mariposas en
  registros).
- 2^20: **5 pasadas** (cargar, trozos, 3 de r8) en vez de 21, y `fourier`/`fourierInversa` de un vector seguido de largo
  potencia de dos devuelven el complejo **hecho por los núcleos y residente**: no baja hasta que alguien lo lee.
- Las mismas mariposas (misma tabla, misma aritmética) en el mismo orden por casilla: **los mismos bits** que etapa a
  etapa y que el LTS.
- Medido aquí, nativo: fft 2^20 **43,8 ms** (N2: ~92). En la GPU simulada: 5 lanzamientos, 20 MB subidos (entrada y
  tablas), 0 bajados.

### Qué se probó

- `pruebas/nen-nucleos.js`: 42 núcleos, 96 casos, 0 fallan; `nen_dgemm` al bit contra su respaldo en jit con AVX2 y sin
  AVX (`C1EN_SIN_AVX=1`), con números de escalas muy dispares para que FMA y a·b + c no coincidan por casualidad; la FFT
  por trozos + r8 igual al bit a etapa por etapa (N de 64 a 16384, varias filas, las dos direcciones).
- `pruebas/exp-nen-gpu.js`: 18 pasan. `por` da los mismos bits en jit, nativo y GPU simulada, y queda a menos de 1e-14
  relativo del LTS (sin FMA); fourier, inversa, espectro y convolución, **iguales al LTS al bit**; residencia de fourier.
- `pruebas/c1en.js`: 95/95. Batería entera: 23 de 24 (la de siempre: `apps/ecosim5`).
- `c1en/comparar/n.esl`: las huellas siguen iguales a NumPy (1e-9).

### Qué cambió

- `por` (y todo producto de matrices) **cambia en el último bit** respecto al LTS y a N2: ahora es con FMA, casi siempre
  más cerca del valor exacto. Entre dispositivos sigue igual al bit.
- `por` en jit, unas 4–5 veces más lento. En `c1en/comparar/n.esl` jit solo mide matmul 1024 (2048 serían minutos).
- `c1en/kaggle-comparar-lenguajes.ipynb`: en la sesión de GPU corre antes `exp-nen-gpu.js --gpu` (los mismos bits en la
  T4) y dice el resultado.

## Fase N4.1 · Cero runtime: el programa de Ñ como ejecutable nativo (20-oct-2026)

Diego pidió diez cosas para N4 y marcó una como la primera y la de más peso (30 %): **«Cero runtime»**, hecha de modo
que las otras nueve no obliguen a rehacerla. Decisiones suyas: memoria por **conteo de referencias**, y el primer alcance
es **el núcleo del lenguaje** (los eDSL van entrando tanda por tanda).

```
node motor-exp/util/n-compilar.js programa.esl              # → ./programa  (programa.exe en Windows)
node motor-exp/util/n-compilar.js programa.esl -o salida --c programa.c --ejecutar arg1 arg2
```

El ejecutable no necesita **nada** instalado: ni Node, ni la VM, ni el JIT, ni un recolector. En Linux enlaza solo con
libc y libm. El compilador de C (gcc, clang o mingw; `--cc` o `C1EN_CC`) hace falta solo al construir.

### Cómo funciona

1. **El mismo análisis que la VM.** `n-compilar` pasa el programa por `crearMotor().analizar` (con el mismo cargador
   de módulos que `n-node`): los errores de sintaxis, de tipos y de módulos salen igual, dichos igual. Un programa que
   no pasa el verificador no llega a C.
2. **Del bytecode a C** (`aot/compilador.js`). El bytecode verificado de cada función (y de cada módulo) se descodifica
   y se analiza: profundidad de la pila en cada instrucción y manejadores de `intentar` activos (la base del IR para
   lo que viene: ranuras con tipo, tipos de máquina). Cada función de Ñ es una función de C; cada ranura de la pila,
   una variable local de C (`s0…sN`). Las ranuras que nunca se reasignan ni se capturan (`yo`, los parámetros) son
   **prestadas**: no se cuentan.
3. **Errores al estilo de CPython, sin `setjmp`.** Una operación que falla devuelve `N_ERR` y deja el error pendiente en
   `n_hilo` (local a cada hilo). Quien llama mira `N_FALLO` y salta a su **escalera de limpieza** (`L<manejador>_<prof>`):
   suelta lo que tenía en la pila y sigue en el `capturar` que toque, o sube. Los marcos de sombra (900 como máximo,
   igual que la VM) dan la traza `en f (línea L)` idéntica.
4. **La biblioteca de apoyo** (`aot/nrt.h`, `aot/nrt.c` y los `nrt_*.inc`, ~7.600 líneas): valores de 16 bytes con
   etiqueta (`NV`), textos en UTF-16 como JavaScript, listas, diccionarios con orden de inserción, cierres con upvalues
   abiertos y cerrados, registros con métodos, errores, módulos (cada uno corre una vez), y **295 funciones nativas**.
   Se compila una vez y se guarda en `os.tmpdir()/n-aot-cache` por la huella de todos sus archivos, del compilador y de
   las banderas: compilar un programa es compilar solo su C (~0,3 s).

### Lo que trae el ejecutable

| | funciones | notas |
|---|---|---|
| biblioteca | 45 | imprimir, texto, entero, real, rango, listas, diccionarios, ordenar (estable), mapear/filtrar/reducir, error, archivos de texto, leerLinea, argumentos, entorno, salir, reloj… |
| `texto` | 49 | mayúsculas y minúsculas con las reglas de JavaScript (ß→SS, İ, ŉ, sigma final), orden del español, distancia, plantilla… |
| `numerico` (escalar y listas) | 73 | estadística, azar (mulberry32, la misma serie que la VM), primos, finanzas, matrices de listas (`multMatriz` con FMA en el orden de `nen_dgemm`) |
| `formato` | 41 | todo menos `rangoFechas`; `toFixed` **exacto** (la mitad hacia arriba sobre el valor exacto del double, con un entero grande propio) |
| `probar` | 35 | todo: pruebas, grupos, ganchos, espías, `soloEsta`, semilla (xorshift32 como la VM), resumen |
| `fecha` | 52 | todo, con el tipo `fecha` en el núcleo (repr ISO, `==` por valor, `<` entre fechas, ordenar, máximo); Date.UTC hecho a mano con las reglas del estándar (años 0–99 → 1900–1999, TimeClip) |

**Igual al bit que la VM.** Los números se imprimen con el algoritmo de JavaScript (dígitos más cortos y sus reglas de
exponente); `Math.sin`, `exp`, `log`, `pow`, `atan2`, `cbrt`… son **el fdlibm de V8 12.4 (el de Node 22) pasado a C**
(`nrt_fdlibm.inc`, con su licencia de Sun): 200.000 casos al azar por función, 0 diferencias; `hypot` con el algoritmo de
Kahan de V8. Se compila con `-O2 -ffp-contract=off -fno-fast-math`, como C1EÑ.

### Medido (nube, 2 vCPU)

| | VM (Node 22, con JIT) | ejecutable |
|---|---|---|
| arrancar e imprimir «hola» | 162 ms | **2 ms** |
| tamaño | Node + bundle | **300 KB** (285 KB sin símbolos), solo libc y libm |
| fib(30) | 26 ms | 35 ms |
| bucle `mientras` 10⁷ | 3.987 ms | **112 ms** |
| listas (agregar y leer) | 1.105 ms | **114 ms** |
| diccionario | 177 ms | 285 ms |

Lo que falta para pasar a la VM en todo es el IR con tipos (números sin caja dentro de una función), que es justo lo
que piden «tipos de máquina» y «precisión simple y media»: está previsto, no se rehace nada.

### Pensado para el resto de N4 sin rehacerlo

| lo que viene | dónde ya tiene sitio |
|---|---|
| precisión simple y media · tipos de máquina | la etiqueta de `NV` es de 8 bits y tiene reservados `N_I8…N_U64, N_F16, N_F32` junto a `N_NUM`; el análisis de pila del compilador es la base del IR con tipos |
| hilos y memoria compartida | `n_hilo` es `_Thread_local`; el conteo de referencias tiene el gancho `N_RC_ATOMICO`; no hay estado global en el camino de un error |
| ser la lengua franca · interoperabilidad directa | una función de Ñ ya es una función de C (`NFnC`) y un error es un valor de retorno, no un `longjmp`: exportarla con la ABI de C es envolverla |
| trabajo asíncrono / varias GPU / el modelo de la GPU / plantillas en los núcleos | las nativas son una tabla (`NNatDef`): C1EÑ y NEÑ entran como un `nrt_*.inc` más, igual que entraron texto, formato, fecha… |
| quitar la seguridad donde uno quiere | las comprobaciones (tipos, índices, conteo) las emite el compilador en sitios conocidos; una zona sin ellas es otra forma de emitir, no otra biblioteca |

### Qué no entra todavía (y lo dice al compilar)

`[ejecutable] todavía no están en el ejecutable nativo: «arreglo» de "numerico", …` — sin fallar en silencio. Faltan:
**arreglos** (`ObjArreglo`, NEÑ y C1EÑ: la siguiente tanda, que además es el cimiento de precisión simple/media y de la
GPU), `datos` (tablas), `estilo` y la página (`pintar`, `etiqueta`: son del navegador), y **generadores y asíncronas**
(se rechazan al compilar; irán como corrutinas con pila propia).

### Qué se probó

- `pruebas/exp-aot.js`: cada programa en la VM y como ejecutable, y la salida tiene que ser **igual letra por letra**,
  código de salida incluido (errores sin capturar con su traza). Los de `aot/pruebas/` (11, escritos para esto:
  básico, números, textos, funciones y cierres, errores, registros, módulos, numerico, formato, probar, fecha) y los 608
  ejemplos de la referencia. **307 iguales · 0 distintos · 0 no compilan · 312 sin soporte todavía** (arreglos, página,
  datos, estilo).
- `pruebas/todas.js` corre la rápida (`exp-aot.js --rapida`, los 11, ~25 s). Batería entera: 24 de 25 (la de siempre:
  `apps/ecosim5`).
- AddressSanitizer y UBSan sobre los 11: sin accesos fuera de sitio, sin comportamiento indefinido, sin fugas.
- Windows: la biblioteca y un programa compilan en cruzado con mingw-w64 (gcc 13) sin avisos; el `.exe` enlaza solo
  `KERNEL32.dll` y `msvcrt.dll`. **No se corrió allí** (sin Wine): falta confirmarlo en el PC de Diego.

### Qué cambió o se arregló por el camino

- `aot/` es nuevo; `util/n-compilar.js` y `pruebas/exp-aot.js` también; `pruebas/todas.js` suma la suite (y acepta
  opciones por suite). **No se tocó `src/`**: la VM es la referencia.
- Dos fugas del ejecutable (el nombre de un método atado y el de un espía), un desborde en `correrPruebas` y un
  `memcpy` con puntero nulo en `iguales`, encontrados con ASan/UBSan antes de entregar.
- La caché de `nrt.o` miraba solo `nrt.c` y `nrt.h`: cambiar un `nrt_*.inc` enlazaba el objeto viejo. Ahora la huella
  lleva todos.

## Fase N4.2 · Precisión simple y media: `real32` y `real16` (20-oct-2026)

Dos tipos de arreglo nuevos, junto a `real` (64 bits), `entero`, `bool` y `complejo`:

| tipo | qué es | bits de mantisa | hasta | memoria en la VM | en archivo y GPU |
|---|---|---|---|---|---|
| `real32` | el `float` de C, el de las GPU | 24 | 3,4·10³⁸ | 4 bytes (`Float32Array`) | 4 bytes |
| `real16` | el half (IEEE binary16) | 11 | 65504 | 4 bytes (Node 22 no trae `Float16Array`) | 2 bytes en archivo; 4 en la GPU por ahora |

```
fijo a = arreglo([[1, 2], [3, 4]], "real32")       # o aTipo(x, "real32"), ceros(n, "real16"), lleno(f, v, "real32")…
fijo h = aTipo(a, "real16")
imprimir(a * 0.1)          # [[0.1, 0.2], [0.3, 0.4]] — los dígitos más cortos DEL TIPO, como NumPy
imprimir(por(a, a))        # el SGEMM de C1EÑ: GPU, AVX2 de 8 floats o jit, los mismos bits
```

### La regla (la misma en jit, nativo y GPU)

**Cada operación se hace en 64 bits y el resultado se redondea UNA vez al tipo del arreglo.** Para + − × ÷ y la raíz
eso es exactamente la aritmética de 32 (o de 16) bits de verdad, porque 53 ≥ 2·24 + 2: redondear dos veces no cambia
nada (comprobado abajo contra `float` y `_Float16` de gcc). En las demás (seno, exp…) es «calcular en doble y guardar en
simple», que es determinista y más exacto que la `sinf` de cualquier biblioteca.

- **Tipos como en PyTorch:** un número suelto no ensancha (`x32 * 2.5` sigue en real32), `entero · real16` da real16,
  y entre dos de coma flotante gana el más ancho (`real32 · real16` → real32, `real32 + real` → real). `/` nunca da
  entero. Lo mismo al pegar (`concatenar`, `apilar`) y al elegir (`donde`).
- **Se conservan** en la aritmética, las comparaciones (dan `bool`), las 13 unarias de numerico (`seno(a32)` es real32),
  `recortar`, las vistas (`trozo`, `transpuesta`, `redimensionar`, `copia`), `aTipo`, crear con tipo, `a[i] = v` y
  `ponerElemento` (redondean al guardar), y `por`.
- **Devuelven `real`** (se calculan en 64): las reducciones (`suma`, `media`, `varianza`… dan un número de 64 bits) y lo
  avanzado (descomposiciones, Fourier, estadística de NEÑ). Para volver: `aTipo(r, "real32")`.
- `leerArregloBinario` / `escribirArregloBinario` con `"real32"` (float32) y `"real16"` (**2 bytes por número**,
  float16 de NumPy).

### El producto de matrices en simple: `nen_sgemm` (src/17)

El de `nen_dgemm` (N3) con floats: cada casilla, s = +0 y s = fmaf(a, b, s) con k de 0 a K−1.

- **GPU:** mosaicos de 64×64 por bloque de 256 hilos, 4×4 casillas por hilo, trozos de 16 en k por memoria compartida.
  Compilado a PTX de sm_75 con clang: 272 `fma.rn.f32`, 0 en doble, 2 barreras. En una T4 la simple tiene 32 veces el
  pico de la doble (8,1 contra 0,25 TFLOP/s).
- **CPU:** paneles de 6×16 y micronúcleo AVX2 de 8 floats con 12 registros de suma (`_mm256_fmadd_ps`); sin AVX2,
  `fmaf()`.
- **jit:** `nenFmaf`, la fmaf **exacta** en JavaScript: a·b de dos floats es exacto en un double, c + p = s + e exacto
  (TwoSum), s se lleva a impar con e y se redondea a float (Boldo y Melquiond: 53 ≥ 24 + 2).
- **real16:** entra en el mismo SGEMM (en la VM ya vive en floats) y se redondea a 16 bits al final: acumular en 32 y
  guardar en 16, que es lo que hacen los núcleos de media precisión de las GPU.

Medido aquí (2 vCPU AVX2, nativo): 1024² `real` 57 ms → `real32` **26 ms**; 2048² 446 → **223 ms** (el doble de
números por instrucción). `real16` 2048² 1,05 s, casi todo en pasar los dos operandos a 16 bits en JavaScript.

### C1EÑ con floats (src/14)

- `vm.c1en.kernel`: tipo de parámetro nuevo **`f32*`** (`float*` en C y CUDA, `Float32Array` en jit); acepta arreglos
  `real32` y `real16`.
- **`paralelo` sobre un `real32`:** el núcleo lee float, calcula en double y guarda redondeado a float. Los tres
  dispositivos dan los mismos bits (probado). La mitad de memoria y de tráfico por el PCIe. `real16` en `paralelo`
  todavía no (lo dice y explica cómo pasar a real32 y volver). `sumarAtomico` acepta real32.
- La aritmética de arreglos por los núcleos de NEÑ (N2) sigue siendo solo para `real`; real32/real16 van por la VM.

### Qué se probó (`pruebas/exp-precision.js`, 32 pruebas, en `todas.js`)

- `redondear16` = `(_Float16)` de gcc en **590.480** casos: los 63.488 halves finitos, todos sus puntos medios (los
  empates), ±1 ulp de cada medio, 400.000 al azar y los bordes (65504, 65520, subnormales, 2⁻²⁵…); y = `astype(float16)`
  de NumPy 2.5 en 300.000 más. Los 65.536 patrones de 16 bits van y vuelven.
- `nenFmaf` = `fmaf()` de C en **3 millones** de casos (cancelaciones, empates, resultados subnormales, desbordes).
- La aritmética de la VM (+ − × ÷ raíz) sobre 200.000 pares, **igual al bit** al `float` de C en real32 y al
  `_Float16` de C en real16, pasando por los archivos binarios de 4 y 2 bytes.
- `por` en real32 y real16 y `paralelo` sobre real32: **los mismos bits en jit, nativo y GPU (simulada)**, iguales a la
  referencia. `pruebas/nen-nucleos.js`: `nen_sgemm` bit a bit contra su respaldo, con AVX2 y sin AVX.
- Los tipos que salen de cada mezcla, la impresión, `a[i] = v` en real16, y los mensajes de error.
- Batería entera: 25 de 26 (la de siempre: `apps/ecosim5`).

### Qué cambió

- El mensaje de `leerArregloBinario` con un tipo que no existe nombra los cuatro tipos (`pruebas/fuera.js` lo sigue).
- `c1en/comparar` gana la prueba **`matmul32`** (Ñ nativo y gpu, y PyTorch en CPU y GPU; `referencia.py` le da su
  huella, con la tolerancia de float32 que el cuaderno ya tenía), y el cuaderno de Kaggle corre además
  `exp-precision.js --gpu` en la T4 antes de medir: es lo que confirma los bits en la GPU de verdad.
- El simulador de GPU (`pruebas/c1en-sim`) declara `fmaf`, `sqrtf` y `fabsf`.
- El ejecutable sin runtime (N4.1) todavía no trae arreglos: entran con los tipos de máquina (N4.5).

## Fase N4.3 · Trabajo asíncrono en la GPU: colas, eventos y lanzar sin esperar (20-oct-2026)

Hasta N4.2 cada núcleo hacía `cuLaunchKernel` y en seguida `cuCtxSynchronize`: la CPU esperaba a la GPU tras cada
operación, aunque el resultado se quedara en la GPU. Ahora:

### 1. Sin esperar tras cada núcleo (para todos los programas, sin cambiar nada)

Los núcleos se encolan y la CPU sigue. Solo espera cuando de verdad tiene que hacerlo: cuando lee un arreglo que está en
la GPU, cuando un argumento no podía quedarse en la GPU (una vista) y hay que bajarlo, o cuando un núcleo de `paralelo`
puede fallar y el error tiene que salir en su línea. Una cadena de NEÑ sobre lo residente (`y = senoA(y) * 2.0 + 1.0`
seis veces) son 21 lanzamientos, **3 subidas y 2 bajadas** en total; antes cada `* 2.0` subía y bajaba la marca de
«división entre cero», que ahora solo se mira al dividir.

### 2. Colas para el programa (eDSL `nen`)

```
fijo a = colaGpu()
fijo b = colaGpu()
enCola(a, fn() { paralelo(N, masUno, x, y) })      # a: y = x + 1
enCola(b, fn() { paralelo(N, doble, y, z) })       # b: z = 2y — espera a «a» sola, sin parar a la CPU
enCola(b, fn() { subirGpu(siguiente) })            # copiar mientras «a» calcula
esperarCola(a)                                     # aquí sale el error de un núcleo de «a», si lo hubo
```

| función | qué hace |
|---|---|
| `colaGpu()` | una cola nueva (un `CUstream` no bloqueante) |
| `enCola(c, fn)` | lo que `fn` lance en la GPU va a `c`; devuelve lo que devuelva `fn` |
| `esperarCola(c)` · `colaLista(c)` · `soltarCola(c)` | esperar, preguntar sin esperar, y liberarla |
| `promesaCola(c)` | una promesa que se cumple cuando `c` termina: `esperar promesaCola(c)` dentro de una función asíncrona deja correr lo demás |
| `subirGpu(a)` | sube el arreglo ya, en la cola actual, sin esperar (un «prefetch») |
| `medirGpu(fn)` | los milisegundos de GPU de lo que `fn` lanza, con eventos de CUDA (en jit y nativo, el reloj) |

- **El orden entre colas lo pone C1EÑ, no el programa.** Cada arreglo residente recuerda qué cola lo escribió por
  última vez y qué colas lo leen; un núcleo en otra cola espera a esas con un evento (`cuStreamWaitEvent`) antes de leer
  (lectura tras escritura) o de escribir (escritura tras lectura). La memoria que se reutiliza de la reserva también
  espera a la cola que la usó. Mientras el programa no crea colas, nada de esto cuesta: todo va por la cola de siempre.
- **Los errores de un núcleo en una cola salen al esperarla**, con la línea del núcleo (como en CUDA). En jit y nativo
  las colas existen igual (todo corre en el acto) y el error se guarda para `esperarCola` también: el mismo programa
  dice lo mismo en el mismo sitio en los tres dispositivos.
- En `util/c1en-cuda.js`: colas, eventos y copias asíncronas de la Driver API (`cuStreamCreate`, `cuStreamWaitEvent`,
  `cuEventRecord`, `cuEventElapsedTime`, `cuMemcpyHtoDAsync_v2`…). Si el driver no los trae, todo sigue por la cola de
  siempre.

### 3. El simulador de GPU, perezoso (`pruebas/c1en-sim/libcuda-falsa.c`)

Ahora tiene colas, eventos y copias asíncronas, y con `C1EN_SIM_PEREZOSO=1` **no ejecuta nada hasta que alguien lo
necesita** (sincronizar, preguntar por una cola o un evento, o una copia síncrona en la cola de siempre); entonces lo
ejecuta en orden y respetando las esperas entre colas. Las colas son no bloqueantes, como en CUDA. Es lo que hace que
una sincronización o una espera que falte se note SIEMPRE en las pruebas (en una GPU de verdad saldría una vez de cada
mil). `c1en.js`, `exp-nen-gpu.js` y `exp-precision.js` pasan también con el simulador perezoso.

### Qué se probó (`pruebas/exp-asincrono.js`, 15 pruebas, en `todas.js`)

En jit, nativo y GPU simulada perezosa: dos colas con las dos dependencias (lectura tras escritura y escritura tras
lectura) sin que el programa diga nada; la cadena de NEÑ (al bit igual en los tres, y en la GPU 3 subidas y 2 bajadas);
un fallo en una cola sale al esperarla con su línea y en la cola de siempre en el acto; `promesaCola` en una asíncrona
mientras la CPU sigue (mismo orden de salida en los tres), `subirGpu`, `medirGpu`, `colaLista` y `soltarCola`.
Batería entera: 26 de 27 (`apps/ecosim5`, la de siempre). El cuaderno de Kaggle corre `exp-asincrono.js --gpu` en la T4.

### Qué cambió

- `paralelo` en la cola de siempre se comporta igual que antes (el error sale en su línea). Lo nuevo solo cambia
  cuándo espera la CPU, no los resultados.
- `liberarResidentes` y vaciar la reserva sincronizan el contexto si hay colas.

## Fase N4.4 · El modelo de la GPU en manos del programa: `paraleloBloques` (20-oct-2026)

`paralelo(n, f, …)` le daba a cada hilo un índice `i` y escondía la cuadrícula. Ahora el programa puede verla, como en
CUDA: bloques, hilos dentro del bloque, memoria compartida del bloque y barreras.

```
fn sumaBloque(b, t, x, parciales) {
  fijo s = compartido(256)                 # memoria del bloque: la ven sus 256 hilos (empieza a cero)
  fijo g = b * hilosPorBloque() + t
  si g < longitud(x) { s[t] = x[g] }
  barrera()                                # __syncthreads
  var paso = hilosPorBloque() // 2
  mientras paso > 0 {
    si t < paso { s[t] = s[t] + s[t + paso] }
    barrera()
    paso = paso // 2
  }
  si t == 0 { parciales[b] = s[0] }
}
paraleloBloques((N + 255) // 256, 256, sumaBloque, x, parciales)
```

| dentro de un núcleo de bloques | qué es |
|---|---|
| `b`, `t` (los dos primeros parámetros) | `blockIdx.x`, `threadIdx.x` |
| `hilosPorBloque()`, `numeroBloques()` | `blockDim.x`, `gridDim.x` |
| `fijo s = compartido(256)` · `compartidoEntero(256)` | `__shared__ double s[256]` (o `int`): al principio del núcleo, con el tamaño escrito; hasta 48 KB por bloque |
| `barrera()` | `__syncthreads()` (también dentro de un `mientras`) |
| `sumarAtomico(s, k, 1)` | `atomicAdd`, también sobre la compartida |

### Los tres dispositivos, los mismos bits

- **GPU:** tal cual (`__shared__`, `__syncthreads`), un bloque de CUDA por bloque. Compilado a PTX de sm_75 con clang:
  `bar.sync`, `.shared`, sin FMA. La compartida se pone a cero al empezar (como en jit y nativo).
- **jit:** cada hilo es un **generador** de JavaScript y la barrera es `yield`; el bloque corre por rondas.
- **nativo:** lo mismo con **corrutinas** (ucontext en Linux y macOS, fibras en Windows —compila con mingw—); cada
  bloque en un hilo del sistema y los bloques repartidos con OpenMP.

**Vigila las barreras (jit y nativo).** Si un hilo termina mientras otros esperan en una barrera, o dos hilos esperan en
barreras distintas —lo que en una GPU se cuelga o da basura—, el núcleo falla con la línea de la barrera y el hilo:
«el hilo 4 del bloque 0 falló en la línea 6: no todos los hilos del bloque llegaron a esta barrera». Los demás fallos
también dicen bloque e hilo. Funciona dentro de una cola (`enCola`, N4.3), y `codigoCuda`/`codigoC` reconocen un núcleo
de bloques solos.

### Qué se probó (`pruebas/exp-bloques.js`, 34 pruebas, en `todas.js`)

Una reducción en árbol (391 bloques), una traspuesta por mosaicos de 16×17, una suma prefija Hillis-Steele y un
histograma con atómicos en la compartida: **jit = nativo = GPU (simulada, cooperativa y perezosa) al bit**, y los
resultados contra JavaScript plano. El fallo de índice en la compartida, igual en los tres; las dos barreras mal puestas,
cazadas en jit y nativo; seis usos indebidos dichos al compilar; el PTX. El C de un núcleo de bloques compila para
Windows con mingw. Batería entera: 27 de 28 (`apps/ecosim5`). El cuaderno de Kaggle corre `exp-bloques.js --gpu`.

### Qué cambió

- `paralelo` no cambia. `codigoCuda`/`codigoC` saben de los núcleos de bloques.
- En la GPU de verdad una barrera mal puesta no se puede detectar (se cuelga o da basura): por eso conviene probar
  antes en jit o nativo.

## Fase N4.5 · Tipos de máquina: `i8` `u8` `i16` `u16` `u32` `i64` `u64` (20-oct-2026)

Los enteros de C, con su tamaño, como arreglos (los dtypes de NumPy). Guardar en uno **envuelve** —200 en un `i8` es
−56—, que es lo que hace el hardware y lo que hacen C, CUDA y NumPy. `entero` sigue siendo el de siempre (32 bits con
signo) y ahora también se escribe `i32`; `f64`, `f32` y `f16` son otros nombres de `real`, `real32` y `real16`.

```
fijo pix = ceros([480, 640], "u8")                    # una imagen: un byte por punto
fijo a = arreglo([100, 120, -128], "i8")
imprimir(a + a)                                        # [-56, -16, 0]: envuelve en 8 bits
imprimir(tipoArreglo(a + arreglo([200, 1, 2], "u8")))  # i16: el que cabe los dos, como NumPy
fijo h = unos(3, "i64") * desplazarIzq(1, 62)         # exacto en 64 bits (BigInt64Array)
imprimir(suma(h))                                      # 13835058055282163712, exacto (un grande)
imprimir(bitsXor(arreglo([12], "u8"), 10), bitsNo(5), desplazarIzq(1, 70))   # [6] · −6 · 2^70 exacto
```

### La regla

| caso | resultado |
|---|---|
| dos enteros del mismo signo | el más ancho (`i8 + i16 → i16`) |
| con y sin signo | el con signo que cabe los dos (`i8 + u8 → i16`, `i32 + u32 → i64`); `i64` con `u64` no cabe: `real` |
| un número suelto entero | el tipo del arreglo (`u8 * 3 → u8`); uno con decimales da `real` |
| con un arreglo de coma flotante | ese (`i8 * real16 → real16`, `i64 + real32 → real32`): la regla de N4.2 para `entero` (la de PyTorch), igual para todos |
| `/` y `**` | `real` |
| `//` y `%` | hacia abajo, como siempre en Ñ (`−7 // 2 = −4`); entre cero es un error de Ñ, no un 0 |

La cuenta es **exacta** y luego se envuelve: hasta 16 bits en un double (es exacto), el `*` de 32 bits con `Math.imul`, y
los de 64 con BigInt. Los bits salen iguales a NumPy (ver abajo). Lo único en que se aparta: con un arreglo de coma
flotante, NumPy ensancha el real según el entero (`i16 + f16 → f32`) y Ñ se queda en el real del arreglo.

**De 64 bits.** Un elemento se lee como un número si cabe exacto (±2^53) y si no como un **grande exacto**; un grande
entero se puede guardar (`g[0] = desplazarIzq(1, 64) - 1`) y operar con el arreglo. `suma` es exacta. Las funciones que
todavía no saben de ellos lo dicen, con la salida: «`media` todavía no trabaja con arreglos i64 — pásalo antes con
aTipo(a, "real")».

**Conversiones.** `aTipo(a, "u8")` desde un real trunca y envuelve (`300.7 → 44`, `−1.5 → 255`), como el `(uint8_t)` de
un `int64_t` en C; NaN e infinito no caben y se dice. `leerArregloBinario` / `escribirArregloBinario` leen y escriben
todos los tipos (int8 … uint64, el formato `.tofile()` de NumPy).

### Bits (`numerico`)

`bitsY`, `bitsO`, `bitsXor`, `bitsNo`, `desplazarIzq`, `desplazarDer`, `contarBits`. Con **números sueltos** son
enteros de verdad, como en Python: complemento a dos con infinitos unos a la izquierda (`bitsNo(5) = −6`,
`desplazarIzq(1, 70)` es 2^70 exacto). Con **arreglos**, en su tipo, como C: lo que sale por la izquierda se pierde, y
`desplazarDer` es aritmético en los tipos con signo y lógico en los sin signo.

### En los núcleos de C1EÑ

`paralelo` y `paraleloBloques` aceptan arreglos `i8 u8 i16 u16 u32` (`int8_t*` … `uint32_t*` en C, `unsigned char*` …
en CUDA): leen como el entero de 64 bits del núcleo y escriben envolviendo, igual en jit, nativo y GPU. `sumarAtomico`
sobre un `u32` sí (hay `atomicAdd` de `unsigned int`); en 8 y 16 bits no, y se dice al compilar. Dentro del núcleo
también están las funciones de bits, sobre enteros de 64 bits: el resultado tiene que caber exacto en un número de Ñ
(si no, el núcleo falla con su línea; así jit, nativo y GPU dan siempre lo mismo) y un desplazamiento va de 0 a 63. Los
de 64 bits todavía no entran en un núcleo: se dice, con la salida.

```
fn mezcla(i, x, y) {                          # x, y: u32
  var h = x[i] * 40503 + i
  h = bitsXor(h, desplazarDer(h, 13))
  y[i] = bitsY(h, 4294967295)                 # los 32 bits de abajo
}
```

### Medido (nube, 2 vCPU, un millón de elementos)

`i8 + i8` 3 ms · `entero * entero` 6 ms (la LTS: 6 ms, pero daba bits mal al pasarse de 2^53) · `u32 * u32` 11 ms ·
`bitsXor` de u32 5 ms · `i64 + i64` 59 ms (BigInt: exacto, no rápido).

### Qué se probó (`pruebas/exp-tipos.js`, 27 pruebas, en `todas.js`)

- **Contra NumPy, al bit:** 848 operaciones (`+ − * // % /`, los bits y los desplazamientos, con números sueltos, con
  real16/real32/real y `aTipo` entre todos) entre los 8 enteros, con datos al azar y los extremos de cada tipo. Los
  datos llegan por `leerArregloBinario` y los resultados vuelven por `escribirArregloBinario`, y se comparan los bytes y
  el tipo. Las únicas excluidas: `//` y `%` con `u64` y un entero con signo (ahí el resultado es real y son los de los
  reales de Ñ).
- Lo exacto de 64 bits (suma por encima de 2^63, 2^64 − 1 en un u64, el grande al leer), `aTipo` truncando y
  envolviendo, los nombres de NumPy.
- Un núcleo con u32, i8 y u16 y las funciones de bits en **jit, nativo y GPU (simulada): lo mismo que BigInt**;
  `sumarAtomico` en u32 envolviendo; los fallos (desplazamiento fuera, resultado sin caber) con su línea; lo que se
  rechaza al compilar. El C del núcleo compila para Windows con mingw.
- Batería entera: 27 de 29 en verde (`apps/ecosim5`, la de siempre; las saltadas por falta de herramientas).

### Qué cambió

- **`entero * entero` ahora envuelve bien** al pasarse de 32 bits (antes se multiplicaba en double y, por encima de
  2^53, los bits de abajo salían mal). Es lo único que cambia para los programas que ya había; `+` y `−` no cambian.
- Los mensajes de «el tipo es …» listan los tipos nuevos (`pruebas/fuera.js` y `exp-precision.js` actualizadas).
- El simulador de GPU (`cuda-falsa.h`) tiene `atomicAdd` de `float` y `unsigned int`, como CUDA.
- Pendiente: los de 64 bits en los núcleos; `contarBits` y los bits de arreglos en NEÑ (GPU); y en el ejecutable sin
  runtime (N4.1), que todavía no trae arreglos.

## Fase N4.6 · Ser la lengua franca: Ñ como biblioteca de C (21-oct-2026)

Un programa de Ñ se compila a una **biblioteca compartida** con sus funciones `publico` y la ABI de
C, y desde ahí la llama cualquier lenguaje: C, C++, Rust, Go, Python, C#, Julia, Zig…

```
publico fn hipotenusa(a: real, b: real): real { devolver raiz(a * a + b * b) }
publico fn resumen(xs: lista<real>) { … devolver {"suma": s, "media": s / longitud(xs)} }
```
```
node motor-exp/util/n-compilar.js mates.esl --biblioteca [-o carpeta] [--prefijo p_] [--cc gcc]
   → libmates.so (mates.dll, libmates.dylib) · mates.h · mates.py
```
```c
#include "mates.h"
double h = mates_hipotenusa(3, 4);                 /* 5 */
if (mates_error()) puts(mates_error());            /* NULL si fue bien */
```
```python
import mates
mates.resumen([1, 2, 3.5])      # {'suma': 6.5, 'media': 2.1666…}  — una lista de Ñ llega como list y un dic como dict
f = mates.sumador(2.5); f(1)    # 3.5 — una función de Ñ se llama desde Python
```

### La ABI

| Ñ | C |
|---|---|
| `real` | `double` |
| `entero` | `int64_t` (±2^53 exacto; uno más grande es un error, no un redondeo) |
| `bool` | `int` |
| `texto` | `const char*` en UTF-8. El que devuelve una función es de quien llama: `<p>liberar` |
| `nulo` (retorno) | `void` |
| lo demás (listas, dic, registros, funciones, sin anotar) | `<p>valor*`, un **asa** opaca |

Con las asas se mira (`valor_tipo/real/bool/texto/repr/largo/en/clave/de/reales/copiar/soltar`),
se construye (`nuevo_nulo/bool/real/texto/lista/lista_reales/dic`, `lista_agregar`, `dic_poner`)
y se llama a una función de Ñ que llegó en un asa (`<p>llamar`): un cierre que devolvió Ñ se puede
llamar desde C. Las asas que te da la biblioteca son tuyas y se sueltan con `valor_soltar`.

**Errores, como errno.** Una llamada que falla devuelve 0, NaN o NULL, y `<p>error()` da el
mensaje de la VM, con la pista y la línea. Una llamada que va bien lo deja en NULL. El puntero vale
hasta la siguiente llamada, y el error es por hilo. Es la razón de que N4.1 no usara setjmp:
ningún error salta por encima de quien llama.

**El arranque.** Lo de nivel superior del programa corre una vez, en la primera llamada o en
`<p>iniciar()`, sin tocar la salida ni la consola del anfitrión. Si falla, cada llamada lo dice.
`salir()` dentro de una biblioteca es un error: no cierra el programa que la usa.

**Varias en un proceso.** La biblioteca se compila con `-fvisibility=hidden` y solo exporta lo que
lleva su prefijo, así que tres bibliotecas de Ñ conviven en el mismo proceso, cada una con lo
suyo. En Windows se exporta con `__declspec(dllexport)` y se enlaza con `-static-libgcc`, y la DLL
solo depende de KERNEL32 y msvcrt.

**Se dice al compilar**: si no hay ningún `publico`, si un nombre chocaría con la API, o si se
intenta exportar un generador.

**Un hilo a la vez**: el conteo de referencias todavía no es atómico. Eso es N4.7.

### Arreglos de Windows que salieron de las pruebas de Claude Code en el PC

- **`paraleloBloques` en nativo tumbaba el proceso sin mensaje.** Cada núcleo es su propia DLL con
  su propio `c1en_plan`, y el segundo núcleo encontraba el hilo ya convertido en fibra por el
  primero: `ConvertThreadToFiber` daba NULL y `SwitchToFiber(NULL)` tumbaba todo. Ahora se
  pregunta antes (`IsThreadAFiber`/`GetCurrentFiber`), y el hilo vuelve a ser hilo al terminar si
  lo convirtió ese núcleo. También pasó a `CreateFiberEx`, con la pila reservada justa. Arreglado
  sin poderlo correr en Windows desde aquí: **está por confirmar en el PC.**
- **El SGEMM en real32 «daba −1,18e21» en jit y en nativo.** No era el SGEMM, era la prueba:
  `leer32` leía `buffer` entero sin su desplazamiento, y el Node del PC devuelve el archivo como un
  trozo de un bloque compartido. Arreglado como ya estaba `leer16`.
- **`nenFmaf` contra el `fmaf()` de C.** El `fmaf` de la biblioteca de mingw no es exacto:
  `fmaf(3.4e38, 2, −3.4e38)` le da infinito, y la respuesta es 3.4e38. Ñ tenía razón. La prueba
  compara ahora en Windows contra la instrucción del procesador (`vfmadd`, exacta). Y de paso, los
  núcleos de CPU sin AVX2 ya no dependen de la libm: la FMA de simple se hace exacta en C, con el
  mismo método que `nenFmaf`, y la de doble usa la instrucción cuando el procesador la tiene.
- `salida/` no va en git, así que en un clon recién hecho no existe. `construir-ide.js` y
  `referencia.js` ahora la crean, y `pruebas/todas.js` construye el IDE si falta: antes `nativo.js`
  caía con un ENOENT que no decía qué faltaba.

### Qué se probó (`pruebas/exp-lengua-franca.js`, 18 pruebas, en `todas.js`)

- Desde **C**: números, enteros, textos UTF-8, bools, listas, dic, cierres de ida y vuelta y la
  API de asas, con los mensajes de error exactos. **valgrind**: ni una fuga ni un acceso inválido.
- Desde **C++**: tres bibliotecas a la vez, una con un módulo propio y otra cuyo nivel superior
  falla.
- Desde **Python** (el `.py` generado), **Rust** (`extern "C"`) y **Go** (cgo).
- Lo que da la biblioteca es lo que da la VM.
- La DLL de Windows compilada con mingw: exporta solo lo suyo y enlaza con la cabecera generada.
- La prueba corre también **en Windows**: la DLL de verdad, con objdump, el Python de Windows y
  UTF-8. En Windows no prueba Rust, que necesita el enlazador de MSVC.
- `exp-aot.js` completo sigue en 307 iguales.
- Batería entera: **29 de 30 suites en verde** (solo `apps/ecosim5`, la de siempre).

### Qué cambió

- Para los programas no cambia nada: `n-compilar` sin `--biblioteca` hace lo de siempre.
- `nrt.c` gana `nrt_biblioteca.inc` (el arranque, el último error y las asas).
- Pendiente: pasar `lista<real>` como `(const double*, n)` sin asas, y los arreglos de Ñ por la
  ABI. Para eso faltan los arreglos en el AOT.

## Fase N4.7 · Hilos y memoria compartida con control fino (21-oct-2026)

`paralelo` reparte millones de índices sin prometer que estén vivos a la vez, y por eso dentro
de un `paralelo` nadie puede esperar a nadie. Ahora hay además **`hilos(n, f)`**: n hilos de la
CPU (hasta 256) que **existen a la vez**, con lo necesario para coordinarse: barreras, candados,
esperas y atómicos.

```
usar hilos, barreraHilos, cerrarCandado, abrirCandado, esperarMientras, atomicoSumar, atomicoLeer de "nen"
fn contar(t, cuenta, fase) {
  para k en rango(1000) { atomicoSumar(cuenta, 0, 1) }     # sin carreras
  barreraHilos()                                            # todos esperan a todos
  fase[t] = atomicoLeer(cuenta, 0)                          # y aquí ya ven el total: 4000
}
hilos(4, contar, cuenta, fase)
```

| dentro de un núcleo | qué es | dónde |
|---|---|---|
| `atomicoLeer(a, i)` · `atomicoEscribir(a, i, v)` | leer y escribir de una vez | cualquier núcleo |
| `atomicoSumar(a, i, v)` · `atomicoCambiar(a, i, v)` | `a[i] += v` y `a[i] = v`; devuelven lo que había | cualquier núcleo |
| `atomicoComparar(a, i, esperado, nuevo)` | el CAS: pone `nuevo` solo si había `esperado`; devuelve lo que había | cualquier núcleo |
| `vallaMemoria()` | lo escrito antes lo ven los demás antes que lo de después | cualquier núcleo |
| `barreraHilos()` · `numeroHilos()` | todos esperan a todos · cuántos son | `hilos` |
| `cerrarCandado(c, k)` · `abrirCandado(c, k)` | un candado en `c[k]` (0 abierto, 1 cerrado) | `hilos` |
| `esperarMientras(a, i, v)` · `despertar(a, i)` | esperar a que `a[i]` deje de valer `v` · avisar (opcional) | `hilos` |

Los atómicos trabajan sobre arreglos enteros de 32 bits (`entero` o `u32`, que envuelve). Lo que
espera solo vale en `hilos`, y se dice al compilar: en `paralelo` o en la GPU esperar a otro hilo
puede no acabar nunca.

### Los dispositivos

- **jit**: cada hilo es un generador y se turnan en orden fijo. Lo que espera cede el turno. Si en
  una ronda nadie avanza, es un **interbloqueo**, y se dice con la línea y el hilo más bajo de los
  que esperan. También se caza una barrera a la que no llegan todos. Da siempre lo mismo: es la
  referencia.
- **nativo**: n **hilos del sistema de verdad** (pthreads, o `CreateThread` en Windows). Atómicos
  `__atomic` secuencialmente consistentes, esperas activas que ceden el procesador
  (`sched_yield`/`SwitchToThread`), y una barrera propia que sabe si alguien terminó o se fue a
  otra. Si un hilo falla, los demás lo ven y salen. Una espera que dura más de
  `C1EN_HILOS_ESPERA_S` segundos (60 por defecto) se da por interbloqueo y se nombra el mismo hilo
  que en jit.
- **gpu**: `hilos` corre en la CPU (nativo, o jit si no hay compilador de C), porque una GPU no
  tiene hilos que se esperen. Los **atómicos** sí van a la GPU dentro de `paralelo` y
  `paraleloBloques` (`atomicAdd`, `atomicExch`, `atomicCAS`, `__threadfence`). El simulador y la
  cabecera de clang los traen, y el PTX es `atom.global.add` de verdad.

### Y la biblioteca de N4.6, desde varios hilos

La biblioteca que hace `n-compilar --biblioteca` ya se puede llamar desde varios hilos. Cada
llamada entra de una en una por un cerrojo (SRWLOCK en Windows, pthread_mutex en los demás), así
que el conteo de referencias no necesita ser atómico, y el error sigue siendo de cada hilo.
Probado con 8 hilos y 48.000 llamadas.

### Qué se probó (`pruebas/exp-hilos.js`, 16 pruebas, en `todas.js`)

- En **jit y nativo, con salidas idénticas**: un contador atómico con barrera, un candado que
  protege una suma que no es atómica (8 hilos × 500), productor y consumidor con
  `esperarMientras`, un CAS que gana uno solo, 10 fases con barreras entre 6 hilos y un u32 que
  envuelve.
- Los errores con su línea: el interbloqueo, la barrera a la que no llegan todos, el índice fuera,
  y lo que no vale (esperar en `paralelo`, un atómico sobre un real, 1000 hilos).
- **Atómicos en `paralelo`** en jit, nativo y GPU (simulada): 50.000 índices sacan turno con
  `atomicoSumar` (cada turno una vez), el máximo con un bucle de CAS y un intercambio.
- `codigoC` de un núcleo de hilos compila para Windows. El atómico de la GPU es `atom.global.add`
  en el PTX de clang.
- `exp-lengua-franca.js`: 8 hilos llamando a la misma biblioteca.

### Qué cambió

- `paralelo` y `paraleloBloques` no cambian; ganan los atómicos.
- Pendiente: los atómicos de 64 bits y de coma flotante (`atomicAdd` de real ya está como
  `sumarAtomico`), y la memoria compartida del bloque con atómicos.

## Fase N4.8 · Varias GPU desde un solo programa (21-oct-2026)

Hasta aquí, con dos GPU (las dos T4 de Kaggle) había que elegir una con
`usarDispositivo("gpu", k)` o lanzar un proceso por GPU. Ahora un solo programa usa las dos a la
vez, de tres formas:

```
usar paralelo, paraleloRepartido, numeroGpus, enGpu, colaGpu, enCola, esperarCola de "nen"
paraleloRepartido(N, cuadrado, x, y)      # los N índices, la mitad en cada GPU; lo mismo que paralelo, al bit
fijo q1 = colaGpu(1)                       # una cola de la GPU 1
enCola(q1, fn() { paralelo(N, llenar, a) })            # va a la GPU 1, sin esperar
enGpu(1, fn() { paralelo(N, masUno, b, a) })           # lo de dentro va a la GPU 1; al salir, la de antes
imprimir(numeroGpus())                     # 2
```

| función | qué hace |
|---|---|
| `numeroGpus()` | cuántas GPU hay (0 si ninguna), se esté usando la GPU o no |
| `colaGpu(k)` | una cola de la GPU k (`colaGpu()` sigue siendo de la actual). Lo que se lanza en ella con `enCola` va a **su** GPU, sea cual sea la actual |
| `enGpu(k, f)` | corre `f` con la GPU k como la actual y deja la de antes al salir; devuelve lo que devuelva `f`. En jit y nativo solo corre `f` |
| `paraleloRepartido(n, f, …)` | como `paralelo`, con los n índices repartidos en tramos seguidos entre todas las GPU; espera a que acaben todas |

### Un arreglo pasa de una GPU a otra sin pasar por Node

La residencia de N2 ya recordaba en qué GPU estaba cada arreglo. Si un núcleo de la GPU 0 usa un
arreglo cuya copia buena está en la GPU 1, antes se bajaba a la CPU y se volvía a subir. Ahora va
**de GPU a GPU** con `cuMemcpyPeer`: se espera a lo que la GPU 1 tenía pendiente, se copia y la
memoria vieja vuelve a la reserva de la GPU 1. La primera vez que se copia entre dos GPU se
enciende el **acceso directo** (`cuCtxEnablePeerAccess`) si el par lo admite. Si no lo admite, el
driver hace pasar la copia por su propia memoria, y los bytes son los mismos.

### `paraleloRepartido`: lo mismo que `paralelo`, al bit

Cada GPU corre su tramo `[desde, hasta)` con el mismo núcleo, que ahora trae una segunda entrada
(`c1en_tramo`) donde la `i` es la global. Así el cuerpo, los fallos y su clave son los de
siempre. Cada GPU recibe una copia **entera** de los arreglos, porque el cuerpo puede leer
cualquier elemento. De vuelta, el análisis de C1EÑ ya sabe quién escribe dónde:

- un arreglo que el núcleo escribe solo en `a[i]` (con la `i` del hilo, sin reasignarla) baja de
  cada GPU **solo su tramo**;
- uno que se escribe en otros sitios (`z[n - 1 - i]`, `w[piso(i / 2)]`, o con la `i` reasignada)
  baja entero de cada GPU, y se queda **lo que cada una cambió**, elemento a elemento, comparando
  los bits con lo que había. Es lo mismo que `paralelo` mientras dos hilos no escriban el mismo
  elemento, y esa ya es la regla de `paralelo`;
- uno que no se escribe no baja.

El fallo que se dice es el del hilo de índice más bajo de **todas** las GPU, como en `paralelo`.

**Con atómicos o vallas no se reparte**, porque cada GPU tendría su propio contador. Es un error
en los tres dispositivos, para que un programa no valga en jit y falle con dos GPU. La pista dice
cómo hacerlo a mano: `enGpu(k, …)` con un arreglo de resultados por GPU, y sumarlos al final.

`paraleloRepartido` no va en colas. Con una sola GPU, o en jit y nativo, es un `paralelo` normal.

### El simulador, ahora con GPU que no se mezclan

`libcuda-falsa.c` ya fingía dos GPU (`C1EN_SIM_GPUS`), pero todas compartían la memoria. Ahora
recuerda de qué GPU es cada reserva y es **más estricto que el driver**. Un núcleo que recibe
memoria de otra GPU falla (`CUDA_ERROR_ILLEGAL_ADDRESS`), y una copia con el contexto equivocado
también. Así se caza cualquier sitio donde C1EÑ olvide cambiar de GPU. Las 95 pruebas de
`c1en.js` y las de colas, bloques, tipos, hilos y NEÑ pasan con el simulador estricto. Trae
además `cuMemcpyPeer`, el acceso directo (`C1EN_SIM_PEER=0` lo apaga) y, con
`C1EN_SIM_INFORME=1`, al salir dice cuántos núcleos corrió cada GPU y cuántas copias hubo entre
ellas.

### Qué se probó (`pruebas/exp-varias-gpu.js`, 24 pruebas, en `todas.js`)

- `paraleloRepartido` en jit, nativo y GPU simulada con 1, 2 y 3 GPU: **la misma salida, al bit**.
  Hay arreglos de bajada por tramo y de mezcla de cambios, la `i` reasignada, real, real32 y
  entero, N = 100.003 (no múltiplo de 256), y en el mismo programa se compara con `paralelo`. Se
  comprueba que hubo núcleos en todas las GPU.
- El fallo del hilo más bajo cuando está en la segunda GPU y cuando hay uno en cada una: el mismo
  mensaje que jit.
- `atomicoSumar` y `sumarAtomico` en `paraleloRepartido`: error en jit y en GPU.
- `colaGpu(1)` y `colaGpu(0)` a la vez, un arreglo que pasa de la 1 a la 0 y otro de la 0 a la 1
  dentro de `enGpu(1, …)`. Da lo mismo que jit, en el acto y en **modo perezoso** (si faltara una
  espera, saldría basura), con y sin acceso directo, y con copias de GPU a GPU de verdad (sin
  pasar por Node).
- `enGpu(5, …)`: «no hay GPU 5» con dos GPU, y en jit solo corre la función.
- Con `--gpu` corre en las GPU que haya. El cuaderno de Kaggle (`c1en/kaggle-comparar-lenguajes`)
  la lanza en las dos T4, junto con `exp-hilos.js`.

### Qué cambió

- `src/14-c1en.js`: `numeroGpus`, `enGpu`, `paraleloRepartido`, `colaGpu(k)`; `enCola` cambia a
  la GPU de su cola; las copias de GPU a GPU en la residencia; el análisis marca qué arreglos se
  escriben y dónde, y si hay atómicos; el núcleo de CUDA trae `c1en_tramo`.
- `util/c1en-cuda.js`: `copiarEntre` (`cuMemcpyPeer`), `accesoDirecto`, y un módulo que busca sus
  funciones cuando alguien las pide (antes, la primera lista de nombres era la única).
- `pruebas/c1en-sim/libcuda-falsa.c`: memoria por GPU, la comprobación estricta, `cuMemcpyPeer`,
  el acceso directo y el informe.
- Pendiente: repartir `paraleloBloques` (por bloques, sería lo mismo), repartir según lo rápida que
  sea cada GPU (ahora es a partes iguales), y la copia entre GPU asíncrona
  (`cuMemcpyPeerAsync` en la cola de destino; ahora la copia espera). **Por medir en las dos T4.**

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
| N1 | NEÑ: numerico y datos dentro, tipo `grande` y enteros exactos, 43 funciones de amplitud, volumen (reducciones, `por` por bloques), cuaderno de velocidad en GPU | verificador, VM, JIT, NEÑ, C1EÑ | **hecha** (tiempos de la T4 por medir en Kaggle) |
| N2 | NEÑ en la GPU de verdad: residencia y entrada/salida en `kernel()`, memoria reutilizable, aritmética de arreglos y suma/media/varianza por C1EÑ, `fourier` por los núcleos (sin divisiones), `por` 4×4 en GPU y por bloques en CPU | C1EÑ, NEÑ, numerico, VM | **hecha** (tiempos de la T4 por medir) |
| N3 | BLAS propio: `nen_dgemm` con FMA (GPU memoria compartida, CPU AVX2 empaquetado), FMA exacta en JS, núcleos con fuente propia y barreras (simulador cooperativo), FFT de 5 pasadas residente | C1EÑ, NEÑ, numerico, simulador | **hecha** (tiempos de la T4 por medir) |
| N4.1 | **Cero runtime**: `n-compilar` → ejecutable nativo sin Node ni VM (bytecode → C + `aot/nrt`), conteo de referencias, errores sin `setjmp`, igual al bit que la VM; núcleo + texto, numerico (escalar), formato, probar, fecha | `aot/` (nuevo), util, pruebas | **primera tanda hecha** · faltan arreglos (siguiente), datos, generadores |
| N4.2 | **precisión simple y media**: arreglos `real32` y `real16` (una operación, un redondeo), `nen_sgemm` con FFMA en GPU/AVX2/jit, `f32*` y `paralelo` sobre real32, archivos float32/float16 | VM, numerico, NEÑ, C1EÑ, stdlib | **hecha** (bits en la T4 por confirmar en Kaggle) |
| N4.3 | **trabajo asíncrono en la GPU**: lanzar sin esperar, `colaGpu`/`enCola`/`esperarCola`/`promesaCola`/`subirGpu`/`medirGpu`, dependencias entre colas automáticas con eventos, errores al esperar, simulador perezoso | C1EÑ, puente CUDA, simulador | **hecha** (por confirmar en la T4) |
| N4.4 | **el modelo de la GPU en manos del programa**: `paraleloBloques(bloques, hilos, f(b, t, …))`, `compartido`, `barrera`, `hilosPorBloque`, `numeroBloques`; jit con generadores, nativo con corrutinas, GPU tal cual; barreras vigiladas | C1EÑ | **hecha** (por confirmar en la T4) |
| N4.5 | **tipos de máquina**: arreglos `i8 u8 i16 u16 u32 i64 u64` (envuelven como C; promoción de NumPy; 64 bits exactos con BigInt), alias `i32 f64 f32 f16`, bits (`bitsY`… `desplazarDer`, `contarBits`), E/S binaria de todos, núcleos de C1EÑ con enteros de 8–32 bits y bits | VM, numerico, stdlib, C1EÑ | **hecha** (al bit contra NumPy) |
| N4.6 | **ser la lengua franca**: `n-compilar --biblioteca` → `.so`/`.dll`/`.dylib` + `.h` + `.py`, ABI de C con asas para lo que no es escalar, errores como errno, varias bibliotecas por proceso; probado desde C, C++, Python, Rust y Go | AOT, util | **hecha** (por confirmar en Windows) |
| N4.7 | **hilos y memoria compartida con control fino**: `hilos(n, f)` con barreras, candados, esperas y atómicos (jit con interbloqueos cazados = nativo con hilos del sistema); atómicos en `paralelo` hasta la GPU; la biblioteca de N4.6 desde varios hilos | C1EÑ, AOT | **hecha** (por confirmar en Windows) |
| N4.8 | **varias GPU desde un solo programa**: `paraleloRepartido` (igual a `paralelo` al bit, con bajada por tramos o mezcla de cambios), `colaGpu(k)`, `enGpu(k, f)`, `numeroGpus()`, copias de GPU a GPU con `cuMemcpyPeer`; simulador con memoria por GPU y estricto | C1EÑ, puente CUDA, simulador | **hecha** (por medir en las dos T4) |
| N4.9 | plantillas (genéricos) en los núcleos | C1EÑ, verificador | pendiente |
| N4.10 | interoperabilidad directa (C y C++ sin capa) | AOT, FFI | pendiente |
| N4.11 | quitar la seguridad donde uno quiere (zonas sin comprobaciones) | AOT, verificador | pendiente |

Cada fase deja su sección en este archivo: qué se tocó, qué se probó, qué se rompió.
