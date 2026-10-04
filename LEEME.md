# Ñ

Un lenguaje de programación en español, con verificador de tipos, máquina
virtual de bytecode y un JIT que traduce a JavaScript. Antes se llamaba
Español-Like; el motor y los archivos conservan ese nombre en algunos sitios.

## Para usarlo ahora mismo

Abre **`espanol-like-v4.html`** en el navegador. Es un solo archivo, sin
instalar nada y sin conexión: editor con comprobación de tipos en vivo,
consola, lienzo, página dinámica y tres paneles para ver por dentro el
bytecode, el JIT y la memoria. Trece ejemplos en el desplegable; «Una
aplicación de verdad» enseña de una vez lo que hace falta para escribir una:
eventos, memoria que sobrevive a cerrar la página y un repintado que no borra
lo que estabas escribiendo.

Fuera del navegador hay dos intérpretes de línea de órdenes, con el mismo motor
y el mismo anfitrión de archivos y procesos:

```
node motor/util/n-node.js ejemplos/informe.esl ventas.csv
qjs --std motor/util/n.js  ejemplos/informe.esl ventas.csv
```

El de Node está donde ya trabajas; el de [QuickJS](https://bellard.org/quickjs/)
pesa 1 MB entero y sirve para llevárselo a cualquier sitio.

### En Windows

Lo mismo, con las barras al revés (y las de antes también valen: Node las
entiende en Windows). **Desde la carpeta del proyecto**, que es lo que se olvida:

```
cd D:\ProyectosJS
node motor\util\n-node.js ejemplos\ventas.esl
node motor\pruebas\todas.js
```

Si no quieres moverte, la ruta entera funciona igual desde cualquier sitio,
porque `motor/rutas.js` resuelve todo desde su propia posición y no desde donde
se lanzó la orden:

```
node D:\ProyectosJS\motor\pruebas\todas.js
```

Un «Cannot find module» que nombra una ruta que empieza por tu carpeta de
usuario —`C:\Users\…\motor\…`— es esto y nada más: Node buscó el archivo
donde estabas parado. No es del motor.

No hace falta instalar nada más que Node. Las rutas del proyecto salen todas de
`motor/rutas.js`, que las arma con `path.join`, y las de los `usar` se resuelven
con `path.resolve` contra el archivo que importa, así que las dos formas de barra
funcionan. Dos suites piden extras y lo dicen: `aislado` necesita Playwright
(`npm i -D playwright && npx playwright install chromium`) y `nativo` necesita
`koffi`; sin ellos se saltan o fallan por eso, no por el motor.

## Los eDSL

La biblioteca no está toda en el ámbito global. Siete grupos de funciones viven
en módulos que trae el motor dentro, y hay que pedirlos:

```
usar deCsv, agrupar, sumaCol de "datos"
usar moneda, porciento de "formato"
usar tema, color, enFila de "estilo"
```

| eDSL | qué trae |
|---|---|
| `numerico` | estadística, matrices, primos, trigonometría, dinero en el tiempo |
| `texto`    | el español en serio: acentos, eñes, orden alfabético, parecido |
| `fecha`    | el tipo `fecha` y su aritmética, sin zonas horarias |
| `formato`  | números y texto para que los lea una persona, con coma decimal |
| `datos`    | el tipo `tabla`, leer CSV, agrupar y sumar, y el formato `.ñdatos` |
| `estilo`   | CSS como valores, anidamiento y tokens de diseño |
| `probar`   | Ñ probándose con Ñ |

La razón es la de siempre en este proyecto: si haces cuentas no tienes por qué
saber el vocabulario de la web, ni al contrario. Un eDSL se gana el sitio cuando
quita una clase de error, no cuando ahorra teclas.

Tres constantes están siempre, sin ningún `usar`, y llevan un sigilo delante para
que ningún programa pueda declararlas ni taparlas: `|PI`, `|E`, `|INFINITO`.

Y para lo de antes: **`usar "clasico"`** en la primera línea devuelve al ámbito
global los 62 nombres que lo eran. Es por archivo, así que una biblioteca vieja
funciona dentro de un programa nuevo y al contrario. Para arreglar los `usar` de
un programa que ya tienes escrito:

```
node motor/util/mudar.js              # dice qué hace falta, sin tocar nada
node motor/util/mudar.js --escribir   # lo escribe · córrelo hasta que diga 0
```

## Qué hay en cada sitio

```
espanol-like-v4.html     el entorno completo, listo para abrir
referencia-stdlib.html   el libro: las 452 entradas de la biblioteca, cada una con su
                         firma y la salida REAL de su ejemplo · se regenera
auditoria-motor.html     la auditoría del motor y su plan de trabajo
auditoria-web.html       la auditoría de la parte web y su plan por fases
index.html               la versión 3.0 original, intacta, como referencia
ejemplos/                programas de ejemplo (.esl), incluido uno de consola
ejemplos/ventas.esl      una aplicación pequeña y completa: pega un CSV y sale
                         el total por ciudad · también está en el selector del IDE
ejemplos/lib/            los módulos que usa ejemplos/resumen.esl
motor/                   el código
```

Dentro de `motor/`:

```
rutas.js         de dónde sale cada ruta; todo se resuelve desde aquí
bundle.js        las trece fuentes empaquetadas  (se genera)
inventario.ñdatos la línea base: los 452 nombres con su firma, en el formato
                 del eDSL «datos» · SE GUARDA, no se regenera solo
publicar-*.html  las versiones sin esqueleto, para publicar  (se generan)

src/             el motor, en el orden en que trabaja
  01-front.js          léxico, gramática y sistema de tipos
  02-check-compile.js  verificador de tipos y compilador a bytecode
  03-vm-jit.js         máquina virtual, recolector de basura y JIT
  04-stdlib.js         biblioteca estándar y fachada del motor
  05-serial.js         el formato .elb: serializar y verificar bytecode
  06-modulos.js        «usar» y «publico»: resolver, enlazar y ejecutar módulos
  07-edsl-formato.js   formato   42 · números y texto para que los lea una persona
  08-edsl-fecha.js     fecha     52 · el tipo «fecha» y su aritmética
  09-edsl-probar.js    probar    35 · Ñ probándose con Ñ
  10-edsl-texto.js     texto     49 · el español en serio: acentos, eñes, orden
  11-edsl-numerico.js  numerico  73 · estadística, matrices, primos, dinero
  12-edsl-datos.js     datos     51 · el tipo «tabla» y el formato .ñdatos
  13-edsl-estilo.js    estilo    57 · CSS como valores, con tokens de diseño

ide/             el entorno, partido en dos documentos
  padre.html           editor y paneles; no contiene nada del motor
  hijo.html            el motor, dentro de un marco aislado
  anfitrion.js         la página, el lienzo y el tiempo; lo comparten el IDE
                       y las aplicaciones exportadas, para que no se separen
  app.html             la plantilla de una aplicación exportada

util/            herramientas
  construir.js         src/*.js              → bundle.js
  construir-ide.js     bundle + ide/         → espanol-like-v4.html
  construir-app.js     un .esl               → una aplicación de un solo archivo
  construir-binario.js el motor              → n.exe, sin dependencias
  referencia.js        el motor + los ejemplos → referencia-stdlib.html
  ejemplos-biblioteca.js  un ejemplo ejecutable por cada cosa de la biblioteca
  mudar.js             añade los «usar» que faltan, guiado por los errores del
                       compilador · córrelo hasta que diga 0
  n.js                 intérprete de línea de órdenes, para QuickJS
  n-node.js            el mismo, para Node

pruebas/
  todas.js             pasa las 13 suites y resume
  motor.js             146 · el lenguaje, la máquina, el GC y el JIT
  excepciones.js        48 · intentar / capturar / finalmente / lanzar
  web.js                42 · el árbol de nodos de la página
  estilos.js            99 · el tipo estilo, los tokens y el CSL que sale
  interaccion.js        60 · eventos, identidad, memoria y temporizadores
  serial.js             59 · el formato .elb y su verificación
  fuera.js              65 · archivos, procesos y entrada, en Node y en QuickJS
  nativo.js             14 · llamar a código compilado desde Ñ
  modulos.js           156 · usar, publico, ámbito, ciclos y rutas, por los dos
  edsl.js              116 · el mecanismo de los eDSL nativos, desde dentro
  en-n.js              255 · las suites escritas en Ñ, con el eDSL «probar»
  en-n/*.esl           esas suites: fecha, texto, numerico, datos, estilo, probar
  aislado.js            92 · el IDE entero en un navegador de verdad
  ejemplos-ide.js       16 · los ejemplos del selector, uno por uno
  hostil.esl           un programa que intenta salirse del aislamiento

archivo/         cosas de la auditoría; pueden no correr con el árbol de hoy
```

## Cómo se construye

```
node motor/util/construir.js        # empaqueta las fuentes
node motor/util/construir-ide.js    # arma el entorno
node motor/util/referencia.js       # regenera el libro y dice qué cambió
node motor/pruebas/todas.js         # 1.152 pruebas, 13 suites
```

### El libro y su línea base

`referencia-stdlib.html` se regenera en cada construcción y se sobrescribe, así
que él solo no puede decir qué había antes. Al lado va **`motor/inventario.ñdatos`**,
que sí se guarda: los 452 nombres con su ámbito, su clase y su firma, en el
formato del eDSL `datos` —JSON con esquema y por columnas—. Así que no es solo un
archivo de control: se abre con `deDatos` y se consulta desde un programa en Ñ.

```
usar deDatos, contarPor, ordenarPor, vistazo de "datos"
fijo inv: tabla = deDatos(leerTexto("motor/inventario.ñdatos"))
vistazo(ordenarPor(contarPor(inv, "ambito"), "cuantas", cierto))
```

Cada vez que se genera el libro, se compara contra esa base y dice qué entró, qué
se fue y a qué función le cambió la firma —eso último importa: un argumento que
cambia de tipo no es un nombre nuevo, pero rompe programas igual—. Sale en la
consola y en la propia página.

Sellar la base es **deliberado**, nunca automático:

```
node motor/util/referencia.js --sellar
```

Si se sellara en cada construcción, la comparación saldría siempre vacía y no
serviría para nada. El sello se pone cuando se termina un paso, no cuando se
compila.

Los scripts resuelven sus rutas desde `motor/rutas.js`, así que se pueden
ejecutar desde cualquier carpeta y el proyecto entero se puede mover de sitio.

## Cómo está hecho por dentro

En `motor/ARQUITECTURA.md`: los dos documentos y la frontera de seguridad, el
formato `.elb` y las seis comprobaciones al cargarlo, el DSL de la página como
árbol de valores, el estilo como valores con clases locales, las excepciones,
y cómo sobreviven el foco y lo tecleado a un repintado completo.

## Salir con la app puesta

Dos caminos para lo mismo, y dan el mismo archivo:

```
node motor/util/construir-app.js ejemplos/ventas.esl "Panel de ventas"
```

o el botón **⤓ Exportar app** del IDE. Sale un solo archivo HTML de unos 470 KB:
el motor, el anfitrión y tu programa, sin editor y sin marco aislado. Se abre con
doble clic en cualquier navegador, guarda en su propio `localStorage` y no
necesita nada más. El de la línea de órdenes existe porque una aplicación no se
construye a mano cada vez: se construye desde un script, junto al resto.

Ninguno de los dos exporta un programa que no compile, ni uno que importe
archivos con `usar … de "x.esl"`: esos módulos se resuelven en el disco al
ejecutar, y dentro de la aplicación no hay disco. Los eDSL del motor sí viajan,
porque van dentro del motor.

Para que parezca una aplicación de escritorio y no una pestaña, en Windows:

```
chrome.exe --app=file:///D:/ProyectosJS/ejemplos/ventas.html
```

Eso abre una ventana sin barra de direcciones ni pestañas. Con un acceso directo
a esa orden ya se comporta como cualquier programa del menú de inicio.

El marco aislado no va dentro a propósito: existe para proteger *al editor* del
programa que se está editando, y en una aplicación exportada no hay editor que
proteger —el programa ES la aplicación—, así que corre directo y gana un origen
de verdad.

## Hablar con el mundo

`pedir(url, funcion)` trae datos de la red. No devuelve la respuesta, la
entrega: la máquina es síncrona y no hay hilos, así que la respuesta llega a una
función como llega un clic. `deJson` y `aJson` traducen en las dos direcciones.

El permiso no lo da el programa: lo da quien está delante, una vez por sitio y
antes de que salga nada. Desde el IDE la zona tiene origen opaco, así que solo
responden los servicios que mandan `Access-Control-Allow-Origin: *`; una
aplicación exportada tiene origen propio y se comporta como cualquier página.

En el intérprete de Node también funciona, y ahí **no se pide permiso**: no es un
descuido, es que en la consola el programa es uno que tú decidiste ejecutar y que
ya puede leer tus archivos y lanzar procesos. Pedir permiso para una petición
HTTP cuando `ejecutar` no lo pide sería teatro. QuickJS no trae `fetch`, así que
ahí `pedir` dice que falta el anfitrión.

## Partir el programa en archivos

```
# lib/tabla.esl — solo sale lo marcado con «publico»
fijo RELLENO = 10                                  # privado: no existe fuera
fn columna(t: texto) -> texto { devolver rellenar(t, RELLENO, " ") }
publico fn fila(celdas: lista) -> texto { … }
```

```
# resumen.esl
usar "lib/tabla.esl" como tabla        # espacio de nombres:  tabla.fila(…)
usar resumen de "lib/numeros.esl"      # nombres sueltos:     resumen(…)

imprimir(tabla.regla(40))
imprimir(resumen([12, 7, 31, 4]))
```

`usar`, `publico`, `como` y `de` **no son palabras reservadas**: se reconocen
solo por la forma de la sentencia, igual que `y` y `o` son operadores o nombres
según el contexto. Reservar `de` o `como` habría roto cualquier programa que las
use de nombre, y son dos de las palabras más comunes del idioma.

Las rutas son relativas **al archivo que escribe el `usar`**, no al directorio
desde el que se lanzó el programa: así una carpeta de módulos se mueve de sitio
sin reescribir lo que dice dentro. Cada archivo tiene su ámbito —lo que no lleva
`publico` no existe fuera— y cada módulo se ejecuta una sola vez aunque lo
importen diez. Los ciclos funcionan para las funciones y se explican para los
valores; el por qué está en `motor/ARQUITECTURA.md`.

Y un límite que no es un descuido: **dentro del navegador no hay módulos**.
La zona aislada no tiene sistema de archivos que leer, y traerlos por la red
sería el `cargar()` que este proyecto decidió no tener. Un `usar` en el IDE dice
que hace falta un anfitrión con módulos y por dónde se prueba.

## Fuera del navegador

`leerTexto`, `escribirTexto`, `listar`, `crearCarpeta`, `argumentos`, `entorno`,
`ejecutar`, `leerLinea`, `salir`, y los módulos. Nada de esto existe dentro de
una página, y es a propósito: las ofrece el anfitrión, y el de la zona aislada
no las tiene.

Las órdenes se lanzan sin shell —la orden y sus argumentos van por separado—, así
que un dato con espacios o comillas no se convierte en otra orden.

## El motor como ejecutable

El motor está escrito en JavaScript, así que hasta ahora necesitaba algo debajo:
un navegador, Node o el intérprete `qjs`. Eso no tiene nada que ver con HTML —el
motor no sabe qué es un `<div>`— pero sí es una dependencia real.

`qjsc`, que viene con QuickJS, compila JavaScript a bytecode y lo enlaza con la
máquina virtual de QuickJS escrita en C. El resultado es un binario nativo:

```
node motor/util/construir-binario.js     # → n   (o n.exe en Windows)
./n programa.esl
```

**1,14 MB, sin dependencias** más que la libc del sistema. Ejecuta `.esl` con
archivos, procesos, módulos y argumentos; no necesita Node, ni navegador, ni
nada instalado.

Lo que se gana y lo que se pierde, medido:

| | binario `n` | Node |
|---|---|---|
| tamaño | **1,14 MB** | 119 MB |
| arranque (20 ejecuciones) | **0,09 s** | 1,15 s |
| leer y sumar un CSV de 20.000 filas | 461 ms | **76 ms** |
| mandelbrot 600×400×200 | 12,5 s | **92 ms** |

QuickJS no tiene JIT, así que el JIT de Ñ no sirve de nada ahí: emite JavaScript
que QuickJS vuelve a interpretar. Para una herramienta de consola —que arranca,
mueve texto y termina— el binario gana; para cálculo sostenido, Node gana por
mucho. Elige según lo que hagas, no por la etiqueta.

En Windows hace falta un `qjsc.exe`. Las releases oficiales de quickjs-ng
publican `qjs` pero **no** `qjsc`; hay compilaciones de la comunidad que traen
los dos.

## Llamar a C

```
fijo cos = nativa("libm.so.6", "cos", "real", ["real"])
imprimir(cos(0.0))                      # 1
```

Se abre una biblioteca compilada por su nombre, se declara la firma de una
función —qué devuelve y qué recibe, con los tipos escritos en español— y sale
una función de Ñ normal, que se guarda en una variable y se pasa a `mapear` como
cualquier otra. Pasan enteros, reales, textos, booleanos, punteros (que en Ñ son
enteros) y estructuras por valor, que van y vienen como diccionarios.

Esto es un agujero en la caja **a propósito**: ejecuta código que nadie ha
verificado dentro de este mismo proceso. Por eso vive donde viven los archivos
—solo existe cuando el anfitrión lo ofrece, nunca dentro de una página— y por eso
está `hayNativo()`, para preguntar antes. Lo que salga mal llega como error de Ñ
con tipo `nativo` y se captura con `intentar`; lo que no se puede evitar es que
un puntero mal puesto tumbe el proceso, porque eso ya no es Ñ.

Hoy lo ofrece **solo el intérprete de Node**, con [koffi](https://koffi.dev)
instalado:

```
npm install koffi
node motor/util/n-node.js ejemplos/ventana.esl raylib.dll
```

koffi trae su binario ya compilado —también para Windows x64—, así que no hace
falta compilador de C, ni Visual Studio, ni node-gyp. Sin koffi todo lo demás
funciona igual y `nativa` dice que falta el anfitrión.

**QuickJS no puede.** No es un descuido: solo carga módulos nativos compilados
contra sus propias cabeceras, así que darle FFI exige justo el compilador que se
quería evitar. Ahí `hayNativo()` dice `falso`, y el mismo programa lo ve.

`ejemplos/ventana.esl` abre una ventana con [raylib](https://www.raylib.com) y
dibuja dentro. En Windows es un `raylib.dll` de 1,9 MB que no importa más que
`kernel32`, `user32`, `gdi32`, `shell32` y `winmm`: se baja, se deja al lado del
proyecto y ya está.

## Lo que el FFI no puede proteger

Al otro lado de una llamada nativa no hay red. Si la firma que declaras no es la
de verdad, o llamas a algo cuando la biblioteca no está en condiciones, el
proceso entero muere sin error de Ñ que capturar. Lo comprobé: `medir()` después
de cerrar la ventana de raylib es `Segmentation fault` y punto.

Lo que sí se comprueba antes de cruzar: número de argumentos, tipos, biblioteca y
símbolo que existan, y que la biblioteca siga cargada. Eso llega como error
normal de Ñ y se captura con `intentar`.

## Lo que no existe en cada sitio, y se dice

Ñ no es el mismo lenguaje en los tres sitios donde corre, y eso ahora se nota en
voz alta en vez de fallar en silencio:

| | IDE y app exportada | consola (Node) | consola (QuickJS) |
|---|---|---|---|
| página, estilo, eventos | sí | no | no |
| lienzo | sí | no | no |
| memoria y temporizadores | sí | no | no |
| red (`pedir`) | sí | **sí** | no |
| archivos, procesos, módulos | no | sí | sí |
| código nativo (FFI) | no | sí, con koffi | no |

Lo que no está **lo dice**: `pintar()` en la consola no se queda callado, avisa de
que ahí no hay página. Construir nodos y estilos sí se puede en cualquier sitio;
lo que necesita anfitrión es pintarlos.

## Lo que falta

Una forma de llamar a C, hilos, y sockets en vez de solo peticiones HTTP. Eso es
lo que separa a Ñ de poder escribir un servicio, y es el camino hacia la idea de
usarlo como userland.

De los módulos falta lo de grado: no hay forma de renombrar lo que se importa
(`… como otro nombre` por nombre suelto), ni de importar solo por su efecto, ni
de guardar un programa de varios archivos como un solo `.elb`.

Dentro del navegador ya no falta lo básico: hay eventos, controles con estilo,
memoria entre ejecuciones y temporizadores. Lo que queda es de grado, no de
existencia: el repintado sigue siendo completo —se reconstruye toda la página y
luego se repone el foco, lo tecleado y el desplazamiento— y eso aguanta bien
hasta unos cuantos miles de nodos. La identidad de nodo (`{"clave": …}`) ya está
puesta, que es lo que haría falta para reconciliar en vez de reconstruir si
alguna vez hace falta.
