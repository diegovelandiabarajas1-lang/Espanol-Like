# Ñ

Un lenguaje de programación en español, con verificador de tipos, máquina
virtual de bytecode y un JIT que traduce a JavaScript. Antes se llamaba
Español-Like; el motor y los archivos conservan ese nombre en algunos sitios.

**Versión 4.1** (LTS, 17-oct-2026): registros con métodos, `si … entonces … sino`
como expresión, `??` y `?.`, desestructurar, `segun`, parámetros por defecto y con
nombre, genéricos, generadores y asíncronas, una página que se reconcilia en vez
de reconstruirse, FFI con firmas de C y retrollamadas, y en la consola reloj,
servidor HTTP, rutas y entrada interactiva. Qué cambió y qué puede notar un
programa de la 4.0: [`docs/CAMBIOS-4.1.md`](docs/CAMBIOS-4.1.md). Los `.elb` de la
4.0 siguen valiendo.

## Para usarlo ahora mismo

Abre **`espanol-like-v4.html`** en el navegador. Es un solo archivo, sin
instalar nada y sin conexión: editor con comprobación de tipos en vivo,
consola, lienzo, página dinámica y tres paneles para ver por dentro el
bytecode, el JIT y la memoria. Trece ejemplos en el desplegable; «Una
aplicación de verdad» enseña de una vez lo que hace falta para escribir una:
eventos, memoria que sobrevive a cerrar la página y un repintado que no borra
lo que estabas escribiendo.

### C1EÑ, el mismo motor para quien hace matemáticas

**`c1en.html`** es el mismo entorno con otro perfil: los eDSL `numerico` y `nen`
—cálculo, fórmulas, tensores y la ejecución en paralelo— están **abiertos en el
ámbito global**, así que `derivar`, `einstein` o `paralelo` se escriben sin
ningún `usar`, como `imprimir`. No es otro motor: `bundle-c1en.js` sale de las
mismas fuentes que `bundle.js` y solo cambia una constante al principio; un
programa con `usar … de "nen"` corre igual en los dos. Desde la consola:

```
node motor/util/n-node.js --c1en programa.esl      # o N_PERFIL=c1en
```

En la consola C1EÑ corre en el mejor dispositivo que haya —GPU por CUDA, CPU
nativa con gcc, o el JIT—; en el navegador, en el JIT.

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

La biblioteca no está toda en el ámbito global. Diez grupos de funciones viven
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
| `corrutinas` | generadores y asíncronas: `siguiente`, `recoger`, `dormir`, `todas` (4.1) |
| `nativo`   | lo fino del FFI: tipos de C, retrollamadas, memoria, llamadas en otro hilo (4.1) |
| `sistema`  | servidor HTTP, archivos línea a línea, rutas, procesos en fondo (4.1) |

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
c1en.html                el mismo entorno con numerico y nen abiertos (perfil C1EÑ)
c1en/                    el cuaderno de Kaggle para correr C1EÑ en las T4
referencia-stdlib.html   el libro: las 793 entradas de la biblioteca, cada una con su
                         firma y la salida REAL de su ejemplo · se regenera
auditoria-motor.html     la auditoría del motor y su plan de trabajo
auditoria-web.html       la auditoría de la parte web y su plan por fases
index.html               la versión 3.0 original, intacta, como referencia
ejemplos/                programas de ejemplo (.esl), incluido uno de consola
ejemplos/ventas.esl      una aplicación pequeña y completa: pega un CSV y sale
                         el total por ciudad · también está en el selector del IDE
ejemplos/lib/            los módulos que usa ejemplos/resumen.esl
ejemplos/sistema/        un servidor de tareas y un orden hecho en C (4.1, consola)
motor/                   el código (el LTS, 4.1)
motor-exp/               el clon experimental: lo que viene se prueba allí primero
docs/CAMBIOS-4.1.md      qué cambió de la 4.0 a la 4.1
```

Dentro de `motor/`:

```
rutas.js         de dónde sale cada ruta; todo se resuelve desde aquí
bundle.js        las trece fuentes empaquetadas  (se genera)
inventario.ñdatos la línea base: los 793 nombres con su firma, en el formato
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
  construir.js         src/*.js              → bundle.js y bundle-c1en.js
  construir-ide.js     bundle + ide/         → espanol-like-v4.html  (--c1en → c1en.html)
  construir-app.js     un .esl               → una aplicación de un solo archivo
  construir-binario.js el motor              → n.exe, sin dependencias
  referencia.js        el motor + los ejemplos → referencia-stdlib.html
  ejemplos-biblioteca.js  un ejemplo ejecutable por cada cosa de la biblioteca
  mudar.js             añade los «usar» que faltan, guiado por los errores del
                       compilador · córrelo hasta que diga 0
  n.js                 intérprete de línea de órdenes, para QuickJS
  n-node.js            el mismo, para Node (también corre .elb y paquetes .elb)
  elb.js               un .esl → .elb; con módulos, un paquete con todos dentro
  paquete-elb.js       el formato del paquete (ESLP): armar, leer y verificar

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
  elb-varios.js         42 · el .elb de varios archivos: portable, verificado entero

archivo/         cosas de la auditoría; pueden no correr con el árbol de hoy
```

## Cómo se construye

```
node motor/util/construir.js        # empaqueta las fuentes
node motor/util/construir-ide.js    # arma el entorno
node motor/util/referencia.js       # regenera el libro y dice qué cambió
node motor/pruebas/todas.js         # unas 2.300 pruebas, 25 suites (4.1)
```

### El libro y su línea base

`referencia-stdlib.html` se regenera en cada construcción y se sobrescribe, así
que él solo no puede decir qué había antes. Al lado va **`motor/inventario.ñdatos`**,
que sí se guarda: los 793 nombres con su ámbito, su clase y su firma, en el
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
que hace falta un anfitrión con módulos y por dónde se prueba. Lo que sí entra
es un programa de varios archivos **ya compilado** en un solo `.elb` (abajo).

### Varios archivos en un solo `.elb`

```
node motor/util/elb.js ejemplos/resumen.esl          # → ejemplos/resumen.elb
node motor/util/n-node.js ejemplos/resumen.elb       # lo corre, sin los .esl
node motor/util/elb.js --ver ejemplos/resumen.elb    # qué lleva dentro
```

Si el programa no importa archivos sale el `.elb` de siempre (`ESLB`). Si los
importa sale un **paquete** (`ESLP`): el principal y cada módulo, cada uno un
`.elb` normal, con su ruta delante. Las rutas van **relativas a la carpeta del
programa principal** (`lib/tabla.esl`, `../comun/x.esl`), así que el archivo no
lleva nada de tu máquina y sale byte a byte igual compilado en cualquier carpeta.

Al cargarlo se verifica **todo** antes de correr nada: cada `.elb` de dentro con
sus seis comprobaciones, y las rutas (ni absolutas, ni con `\`, ni con `..` en
medio, ni repetidas). Un módulo estropeado no deja que empiece ni el principal.
Corre con `n-node.js` y también en el IDE —panel Bytecode, «Importar y
ejecutar»—, donde no hay disco: los módulos ya vienen dentro. `--texto` lo
escribe en base64 (`.elb.txt`) para cuando solo se puede mover texto.

Lo que cuesta: un `.elb` corre **sin JIT**, siempre —es la regla del formato:
lo que viene de un archivo no trae árbol sintáctico y el JIT no puede tocarlo—.
El ARCADE de escritorio pasa de 1,6 a 2,4 ms por cuadro (medido sin GPU); un cálculo largo nota
más la diferencia. El intérprete de QuickJS (`n.js`) todavía no carga paquetes.

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

## Una app como un solo ejecutable (con ventana, sin terminal)

Lo de arriba es el *intérprete* como binario: le pasas el `.esl` por fuera y no
tiene FFI. Lo otro es una *app*: tu programa, sus módulos y el motor cosidos en
un ejecutable que se abre con doble clic:

```
node motor/util/empaquetar.js --ventana ejemplos/app/principal.esl
# → dist/principal/principal.exe   (en Linux, dist/principal/principal)
```

El motor analiza el programa sin ejecutarlo para saber qué archivos entran (los
`usar`, verificados cruzando archivos), los mete como texto en un programa de
arranque junto con el bundle y un anfitrión igual al de `n-node.js`, y Node lo
cose dentro de una copia de sí mismo (una «aplicación de un solo ejecutable»).
La carpeta `dist/<nombre>/` entera es la app: el ejecutable, `lib/` con koffi
(el FFI, que es un módulo nativo y no se puede coser), y las `.dll`/`.so` que
hubiera junto al programa (raylib). El ejecutable trabaja en su propia carpeta,
así que `leerTexto("datos.csv")` y `nativa("./raylib.dll", …)` encuentran lo que
está al lado, se abra desde donde se abra.

`--ventana` es para apps que abren su propia ventana y no quieren una consola
negra detrás: en Windows el `.exe` se marca como aplicación gráfica, lo que
`imprimir` escriba va a `<nombre>.log` junto al ejecutable, y un error se
muestra en un cuadro de diálogo. `--con=archivo` añade datos a la carpeta;
`--c1en` mete el bundle de C1EÑ.

El ejemplo `ejemplos/app/` es una app de ventana en tres archivos:
`principal.esl` (el bucle de cuadros, los botones, el dibujo), `lib/contador.esl`
(el modelo, sin ventana, probable aparte) y `../lib/ventana.esl` (raylib
envuelto en español, con ratón y teclado). Hace falta `raylib.dll` junto al
programa: [raylib.com](https://www.raylib.com), la versión *win64 msvc* trae
`raylib.dll` en `lib/`.

Lo que cuesta: ~120 MB por app (es Node entero), y la firma de `node.exe` deja
de valer al coserle el programa, así que SmartScreen puede avisar la primera
vez. Se empaqueta para la plataforma en la que se empaqueta: un `.exe` se hace
en Windows.

## Llamar a C

```
fijo cos = nativa("libm.so.6", "cos", "real", ["real"])
imprimir(cos(0.0))                      # 1
fijo seno = nativa("libm.so.6", "double sin(double)")   # 4.1: la firma tal como está en el .h
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
| memoria | sí | no | no |
| temporizadores, `dormir`, asíncronas | sí | **sí** (4.1) | no |
| red (`pedir`) | sí | **sí** | no |
| servidor (`servir`) | no | **sí** (4.1) | no |
| archivos, procesos, módulos | no | sí | sí |
| código nativo (FFI) | no | sí, con koffi | no |

Lo que no está **lo dice**: `pintar()` en la consola no se queda callado, avisa de
que ahí no hay página. Construir nodos y estilos sí se puede en cualquier sitio;
lo que necesita anfitrión es pintarlos.

## Lo que falta

Desde la 4.1 Ñ ya llama a C con firmas de verdad y retrollamadas, sirve HTTP y
tiene reloj en la consola: puede escribir un servicio pequeño
(`ejemplos/sistema/servidor-tareas.esl`). Faltan hilos de Ñ (`enFondo` solo manda
una llamada de C a otro hilo), sockets crudos, el puente a npm y FFI en QuickJS.

De los módulos falta lo de grado: no hay forma de renombrar lo que se importa
(`… como otro nombre` por nombre suelto), ni de importar solo por su efecto. Un
programa de varios archivos ya se guarda como un solo `.elb` (`util/elb.js`); el
empaquetador todavía lleva los módulos como texto, y `n.js` (QuickJS) aún no
carga paquetes. Del FFI faltan las funciones variádicas (`printf`), que se
rechazan diciendo por qué.

Dentro del navegador ya no falta lo básico: hay eventos, controles con estilo,
memoria entre ejecuciones y temporizadores. Lo que queda es de grado, no de
existencia. Desde la 4.1 el repintado se reconcilia: solo cambia lo distinto, un
repintado sin cambios no toca el DOM, y lo escrito en un control que desaparece
vuelve con él. Lo que sigue en el motor experimental (`motor-exp/EXPERIMENTAL.md`):
`a[i]` de arreglo dentro del JIT, `bytes`/`conjunto`/`patron`, PWA e instalador.
