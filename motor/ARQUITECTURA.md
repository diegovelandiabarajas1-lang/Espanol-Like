# Español-Like v4 — cómo está montado el entorno

## Dos documentos, una frontera

Hasta ahora el IDE era un solo archivo: editor, motor, consola y paneles
compartían página, ventana y origen. Eso significaba que cualquier programa
escrito en Español-Like corría con los mismos permisos que el propio IDE.
Con `eco()` insertando HTML sin filtrar y un JIT que llama a `new Function`,
un programa hostil podía reescribir el editor, leer `localStorage` o navegar
la pestaña.

Ahora son dos:

```
padre.html      el anfitrión: editor, gutter, panel de problemas,
                pestañas y los paneles Bytecode / JIT / Memoria.
                NO contiene ni una línea del motor.

  └─ <iframe sandbox="allow-scripts" srcdoc="…">
       hijo.html   el motor entero (análisis, compilador, VM, JIT,
                   biblioteca), más la consola, el lienzo y la página
                   dinámica: todo lo que el programa del usuario toca.
```

Sin `allow-same-origin`, el marco recibe un **origen opaco**. En la práctica,
medido con el navegador de verdad (`prueba-aislado.js`, apartado 3):

| intento desde el programa | resultado |
|---|---|
| `location.origin` | `"null"` |
| `parent.document` | `SecurityError` |
| `parent.localStorage` | `SecurityError` |
| el `<textarea>` del editor | `SecurityError` |
| `localStorage` propio | `SecurityError` |
| `document.cookie` | `SecurityError` |
| `top.location` | `SecurityError` |

`eco()` sigue sin filtrar el HTML, y eso ya no es un agujero: es una decisión.
Lo peor que puede hacer un `<img onerror>` es estropear la zona de dibujo del
propio programa.

## El puente

Solo cruzan datos, nunca funciones ni objetos del motor. `postMessage` usa
clonado estructurado, así que los errores viajan aplanados a
`{fase, msg, linea, col, pista, traza}` —los prototipos no sobreviven al
clonado— y los paneles se pintan desde un retrato: listas de instrucciones,
contadores y cadenas.

| del padre al hijo | del hijo al padre |
|---|---|
| `analizar` · `ejecutar` · `medir` | `analisis` · `fin` · `medicion` |
| `vista` · `tema` · `limpiar` | `listo` · `vista` · `paneles` · `interno` |

El padre solo escucha a `ev.source === marco.contentWindow`; el hijo responde
al `id` de cada petición, y las respuestas tardías del analizador se descartan
por número de generación.

## Lo que la frontera NO arregla

**El marco comparte hilo con el padre.** Llegué a poner un botón «Detener» y a
escribir que la interfaz ya no se congelaba. Lo medí y era falso: con
`mientras verdadero { }` el temporizador del padre se queda sin latir 3,2–4,2
segundos, exactamente mientras corre el programa. Chrome no le da proceso
propio a este marco, así que el clic en Detener no se atiende hasta que el
programa ya terminó. Quité el botón. Lo que corta de verdad un programa
desbocado sigue siendo el presupuesto de instrucciones del motor —400
millones, unos 2,5 s— igual que antes del aislamiento. No es una regresión:
antes el motor corría en esta misma página y congelaba igual. Simplemente no
es una mejora, y no conviene venderla como tal.

Darle capacidad de respuesta de verdad exigiría o un `Worker` (y entonces el
lienzo y la página dinámica habría que atravesarlos con `OffscreenCanvas` y
un proxy de DOM) o un intérprete reanudable que ceda el hilo cada N
instrucciones —y ni así se podría interrumpir una función ya compilada por el
JIT, que corre hasta el final como JavaScript nativo.


**`srcdoc` hereda la política de seguridad del padre.** Comprobado. Si la
página que sirve el IDE trae una CSP sin `unsafe-eval`, el JIT muere dentro
del marco igual que moría fuera. El aviso de la Fase 0 —el canario que prueba
`new Function` al arrancar y lo cuenta en el panel JIT— sigue siendo
necesario, y el texto del panel ahora lo dice.

Si la política llega a prohibir el marco entero, el padre lo detecta a los
5 segundos y lo explica en pantalla en vez de quedarse muerto.

## El bytecode como archivo

`05-serial.js` vuelca un programa compilado a bytes y los vuelve a leer. La
extensión es `.elb` y el archivo empieza por `ESLB`.

```
ESLB · versión de formato (1) · huella de la tabla de opcodes (uint32)
  función:
    nombre · aridad · nº de capturas · tamaño del marco
    pool de constantes   (texto | entero zigzag | real f64 | función anidada)
    código               (varints)
    tabla de líneas      (varints zigzag, en deltas)
```

Dos cosas gobiernan el diseño:

**El AST no se serializa nunca.** El JIT compila desde el AST, así que una
función que llega por archivo no puede alcanzarlo: no hay nada que compilar.
Se comprueba por partida doble —bandera `deDisco` y ausencia de AST— y hay una
prueba que lo fija: el mismo programa compila 1 función desde fuente y 0 desde
bytecode, dando el mismo resultado. Es la única razón por la que cargar
bytecode ajeno no equivale a hacerle `new Function` a un texto ajeno.

**Las funciones anidadas van en árbol**, colgando del pool de quien las
declara, como los prototipos de Lua. No hay referencias cruzadas ni ciclos, y
por tanto no hace falta una tabla de objetos ya vistos —justo donde `.pyc`
necesita su `FLAG_REF` y por donde se cuelan los ciclos maliciosos.

La huella de la tabla de opcodes se calcula sola a partir de los nombres y del
número de operandos de cada instrucción. Si mañana se añade, se quita o se
reordena un opcode, la huella cambia y los archivos viejos se rechazan con un
mensaje claro en vez de ejecutar otra cosa. No hay un número de versión que
actualizar a mano y olvidar.

### Lo que se verifica al cargar

Todo lo que entra se verifica; **no hay modo «confiable»** que salte las
comprobaciones. Costaban un recorrido lineal, y la alternativa era una bandera
que algún día alguien pone en verdadero por comodidad. Seis comprobaciones, en
una sola pasada por el código:

1. Cabecera: marca, versión de formato y huella de la tabla de instrucciones.
2. Cada instrucción existe y sus operandos caben dentro del chunk.
3. Los índices al pool apuntan dentro y a algo del tipo correcto: `CLOSURE` a
   una función, `GET_GLOBAL` y compañía a un texto, `CONST` a lo que no sea una
   función.
4. `GET_LOCAL`/`SET_LOCAL` caben en el marco que la función declara (para eso
   el compilador ahora anota `maxSlots`), y `GET_UP`/`SET_UP` en sus capturas.
5. Cada `CLOSURE` trae exactamente los descriptores de captura que su función
   declara, y cada uno apunta a una local o a una captura que existe.
6. Todo salto cae en el **principio** de una instrucción de la misma función, y
   el código termina en `RET`. Esta es la que más importa: saltar a mitad de una
   instrucción desincroniza el descodificador, y a partir de ahí los operandos
   se ejecutan como si fueran opcodes.

Probado con catorce archivos falsificados a mano —uno por cada cosa que las
comprobaciones buscan—, con todos los prefijos truncados posibles, y con 48.000
archivos a los que se les cambiaron de uno a cuatro bytes al azar: 42.808
rechazados, 5.192 aceptados (cambiar un número de línea o una letra de un
nombre sigue dando un archivo válido), **cero errores internos** y ningún
cuelgue. El descodificador de UTF-8 tuvo que hacerse estricto por esto: una
secuencia corrupta hacía saltar un `RangeError` de JavaScript por encima del
error de bytecode.

### Tamaño

El bytecode de los diez ejemplos ocupa un 108 % de su código fuente. No
comprime: guarda nombres, líneas y constantes, y el fuente de este lenguaje es
muy compacto. El formato es para portar y para cargar sin volver a compilar, no
para ahorrar espacio.

### En el IDE

El panel Bytecode tiene **Exportar .elb** e **Importar y ejecutar**. Compilar y
cargar ocurren dentro de la zona aislada; el anfitrión solo maneja el archivo y
mueve texto en base64 que nunca interpreta. Un programa cargado desde archivo
se anuncia en el panel y en la barra de estado, porque no tiene código fuente
detrás y corre solo en el intérprete.

Lo que **no** se ha hecho, a propósito: el lenguaje no tiene `cargar()` ni nada
que lea archivos. Serializar y cargar son operaciones del anfitrión, no del
programa. Darle a un programa la capacidad de fabricarse bytecode y cargarlo
sería devolverle por la puerta de atrás justo lo que el aislamiento le quitó.

## El estilo, también por valores

La página se construye con nodos que son valores; el estilo sigue la misma
regla. `estilo(...)` devuelve un valor de tipo **`estilo`** que se compone, se
guarda en variables y se pasa a `etiqueta()`.

```
fijo azul = "#4F3FD4"

fn caja(ancho: entero) -> estilo {
  devolver estilo({"fondo": "#fff", "borde": "1px solid #E1E0EB",
                   "redondeo": 10, "relleno": 16, "anchoMax": ancho})
}

fijo tarjeta = estilo(caja(640),
  dentro("h3", {"margen": [0, 0, 8, 0], "color": azul}),
  alPasar({"borde": "1px solid " + azul}),
  enPantalla(600, {"relleno": 24}))
```

sale como

```css
.s1lnshgo{background:#fff;border:1px solid #E1E0EB;border-radius:10px;padding:16px;max-width:640px}
.s1lnshgo h3{margin:0 0 8px 0;color:#4F3FD4}
.s1lnshgo:hover{border:1px solid #4F3FD4}
@media (min-width: 600px){.s1lnshgo{padding:24px}}
```

**Por qué una biblioteca y no un lenguaje aparte.** Un SCSS para Ñ sería un
segundo léxico, una segunda gramática, un segundo informe de errores y una
segunda numeración de líneas. Ya sabemos lo que cuesta eso: la fase 2 destapó
que las expresiones dentro de una interpolación —un sublenguaje de *una
expresión*— salían numeradas desde su propia línea 1. Aquí no hay sintaxis
nueva: las variables de SCSS son variables de Ñ, los mixins son funciones que
devuelven `estilo`, y el anidamiento con `&` lo hacen `dentro`, `alPasar` y
compañía.

El motor solo aporta una cosa: **el tipo**. Sin él esto sería ambiguo, porque
`etiqueta()` ya recibe un diccionario para los atributos:

```
etiqueta("div", {"fondo": "#fff"})     ¿atributo o estilo?
```

### Clases locales, como CSS Modules

De cada estilo distinto sale **una clase con el nombre derivado de su
contenido** (`s` + huella FNV-1a), emitida una sola vez. Dos estilos iguales
comparten clase; repintar mil veces no añade una regla. Y el nombre de la clase
ya no vive en dos sitios que nada mantiene sincronizados: no se escribe nunca.
`estiloGlobal("body", …)` es la salida deliberada de ese ámbito, el `:global`
de CSS Modules.

### Composición sin cascada

Al componer **gana el de la derecha**, resuelto al fusionar y no por la
especificidad del CSS. Es el modelo de Plumeria y StyleX, y evita la clase de
error en que dos reglas «ganan» según dónde acabaron en la hoja.

### Lo que se traduce y lo que pasa tal cual

Unas sesenta propiedades tienen nombre en español (`fondo`, `relleno`,
`redondeo`); cualquier otra pasa con su nombre de CSS, y `fontSize` se convierte
en `font-size`. Sin esa puerta, el primer `grid-template-areas` te deja fuera.
Los números se vuelven píxeles salvo donde no llevan unidad (`opacidad`,
`capa`, `interlineado`, `grosor`), una lista se junta con espacios, y lo que
empieza por `--` es una variable de CSS.

### Un valor no puede romper la hoja

Es el mismo principio que en el árbol de la página: los datos no son marcado.
Un valor que contenga `{`, `}`, `;` o `</` se rechaza al construir el estilo, no
al pintarlo, así que un dato del programa no puede cerrar su regla ni salirse
de la etiqueta `<style>`. Para CSS escrito a mano está `cssCrudo("…")`, que es a
`estilo()` lo que `crudo()` es a `etiqueta()`.

41 pruebas en `pruebas/estilos.js`.

## Fase 2 — excepciones

```
intentar {
  var n = entero(entrada)
  si n < 0 { lanzar error("no puede ser negativa", "validacion") }
  devolver n
} capturar (e) {
  imprimir(e.tipo + ": " + e.mensaje + " (línea " + texto(e.linea) + ")")
  devolver 0
} finalmente {
  imprimir("revisado")
}
```

`lanzar` admite **cualquier valor**, como en Lua. Los fallos del propio motor
—dividir entre cero, índice fuera de rango, llamar a algo que es nulo, una
nativa que protesta— llegan envueltos en un valor de tipo **`error`**, con
`tipo`, `mensaje` y `linea`. Es un tipo del motor, no un `dic` disfrazado, así
que `tipo(e)` dice `error` y se puede anotar.

### Cómo está hecho

Tres instrucciones nuevas y una pila de manejadores por marco de llamada, que
es el diseño de CPython hasta la 3.10 (la tabla de rangos de la 3.11 vendría
después, y solo si el coste de apilar llega a notarse):

| instrucción | qué hace |
|---|---|
| `TRY <salto>` | apila un manejador que apunta al bloque que recoge, y anota el tope de pila |
| `FIN_TRY` | lo quita al salir bien |
| `LANZAR` | desenrolla hasta encontrar uno |

Al lanzar se recorren los marcos hacia afuera; en cada uno se mira su pila de
manejadores. Al encontrar uno se cierran las variables capturadas por encima de
su tope, se restaura la pila, se empuja el valor y se salta. Si no hay ninguno,
el error sale como antes.

El bucle de despacho va **envuelto en un `try` de JavaScript**, y ahí es donde
un error del motor se convierte en un valor capturable. Sin ese envoltorio, los
fallos del intérprete serían opacos para el programa y la mitad de la
funcionalidad no existiría.

**`finalmente` se emite dos veces**, una por cada camino de salida, como hace
CPython desde la 3.11. Así la máquina no tiene que llevar «acciones
pendientes». Cuando se sale del bloque protegido por `devolver`, `romper` o
`continuar`, el compilador emite ahí mismo una copia del `finalmente` y los
`FIN_TRY` que hagan falta: si no, los manejadores se quedarían apilados y un
fallo posterior saltaría a un sitio que ya no existe. Hay una prueba
específicamente para eso.

### Lo que no se puede capturar

El **límite de instrucciones**. Si fuera capturable, bastaría un `intentar`
dentro de un bucle infinito para desactivar la única red que corta un programa
desbocado. Va marcado como fatal y atraviesa todos los manejadores. El
desbordamiento de pila sí se captura.

### El JIT se aparta

Traduce a JavaScript desde el árbol sintáctico y no cubre el desenrollado, así
que rechaza las funciones que llevan `intentar` o `lanzar` y se quedan en el
intérprete. Mismo resultado, más despacio. Si una función es el punto caliente,
conviene dejar el `intentar` fuera de ella.

### El bytecode viejo deja de valer, y está bien

Añadir tres instrucciones cambia la tabla de opcodes, y la huella se calcula de
ella: los `.elb` de antes se rechazan con «se compiló con otra tabla de
instrucciones; vuelve a compilar desde el código fuente». Es el mecanismo de la
fase 1 haciendo exactamente su trabajo.

### Probado

48 pruebas dirigidas (`prueba-excepciones.js`) más **1.600 programas generados
al azar** con `intentar`, `capturar`, `finalmente`, bucles, `romper`,
`continuar` y `devolver` anidados hasta tres niveles: ninguno dejó la pila o
los marcos sucios, y ninguno dejó escapar un error interno.

De paso salió un defecto viejo: una expresión dentro de una interpolación
—`"{100 / d}"`— se analiza por separado y salía numerada desde su propia línea
1, así que los errores de ahí dentro se reportaban en la línea 1 del programa.
Corregido, con prueba.

## Fase 3 — lo que hace falta para una aplicación

Hasta aquí se podían pintar páginas. Lo que faltaba para *usarlas* eran cuatro
cosas, y las cuatro se resolvieron sin tocar la frontera.

### El repintado no borra lo que el usuario hizo

`limpiarPagina()` + `pintar()` reconstruye la página entera. Con eso se va el
foco, el texto a medio escribir, el cursor y el desplazamiento: escribir en una
caja que filtra una lista era imposible, porque la segunda tecla ya no
encontraba dónde escribir.

No se reconcilia el árbol: se guarda y se repone. El anfitrión sella cada nodo
que pinta con una identidad —el camino de índices desde la raíz, o la `clave`
que declare el programa— y un *turno* de interacción es:

```
guardar el estado  →  el programa repinta  →  reponer el estado
```

El turno lo abre el anfitrión en cada clic, cada cambio y cada temporizador, y
la instantánea se toma dentro de `limpiar()`, justo antes de destruir el DOM.
Es síncrono: cuando el manejador devuelve, la página ya está repuesta.

Qué se repone y qué no lo decide quién gobierna el control:

- si el nodo **declara** su valor —`entrada(…, {"valor": borrador})`, o una
  `casilla` con su booleano— manda el programa, siempre. Es el modelo de los
  campos controlados, y es lo que permite vaciar la caja al añadir la tarea.
- si **no** lo declara, lo que hay escrito es del usuario y sobrevive al
  repintado.

El foco, la selección y el desplazamiento se reponen en los dos casos.

### Eventos

Once eventos con lista blanca, pasados como función dentro del diccionario de
atributos: `{"alHacerClic": miFuncion}`. El atributo `on…` sigue prohibido y el
nombre desconocido se rechaza al construir el nodo, así que no hay forma de que
algo que vino de los datos acabe siendo código. El manejador recibe un
diccionario con `tipo`, `valor`, `marcada`, `tecla`, `x` e `y`.

### Memoria entre ejecuciones

Aquí dentro `localStorage` lanza `SecurityError`, y eso es el aislamiento
funcionando, no un fallo. Así que el almacén vive en el padre —bajo el prefijo
`n:alm:`, para no pisar los ajustes del IDE— y en la zona queda un espejo en
memoria que el padre rellena al arrancar. El programa ve una API síncrona
(`guardar`, `recuperar`, `olvidar`, `guardados`); lo que cruza el puente es solo
la copia persistente.

Los valores no viajan como JSON pelado sino etiquetados (`{l:[…]}`, `{d:[[k,v]…]}`),
porque una lista tiene que volver siendo lista y un diccionario tiene que
conservar el tipo de sus claves. Lo que no se puede guardar —funciones, nodos,
estilos, errores— se rechaza al guardar, no al leer.

### Temporizadores

`luego(ms, fn)` y `cada(ms, fn)`, con `detener(id)`. Los límites no son adorno:
64 temporizadores vivos, 15 ms de intervalo mínimo, y todos se paran al empezar
la siguiente ejecución. Sin eso, un `cada(0, …)` deja la pestaña inservible y no
hay botón que lo arregle, porque el marco comparte hilo con el padre.

Y una cosa que hacía falta desde antes: **el presupuesto de instrucciones se
renueva en cada turno**. Antes se acumulaba desde el arranque, así que una
aplicación abierta un rato se moría por el límite sin haber hecho nada raro. El
límite sigue protegiendo dentro del turno, que es donde hace falta.

### Variables de CSS por nodo

Un valor que viene de los datos —el ancho de una barra de progreso— no debe
fabricar una clase nueva en cada pintado. Una clave `--x` en los atributos del
nodo sale como propiedad personalizada en su atributo `style`, y la clase, que
es lo que se comparte, no cambia: trescientas barras distintas, una sola regla.

### Tapar un nombre de la biblioteca

Declarar `fn texto(…)` tapa a la `texto` de Ñ para el resto del programa. No es
un error —puede ser aposta— pero sí un aviso. Con una variable sí es error, y
el mensaje lo dice con esas palabras en vez del inútil «ya estaba declarada».

## Salir del IDE, hablar con el mundo, y salir del navegador

### La aplicación exportada

«⤓ Exportar app» entrega un solo HTML de unos 200 KB. No lleva marco aislado, y
eso no es un descuido: el marco existe para proteger *al editor* del programa
que se está editando. En una aplicación exportada no hay editor que proteger —el
programa ES la aplicación—, así que corre directo y gana un origen de verdad,
con su propio `localStorage`.

La arma la propia zona aislada con las piezas que ya tiene dentro: el motor y el
anfitrión salen de sus propios `<script>` leídos como texto, y el programa entra
en base64. Así no hay una segunda copia del motor esperando en el padre por si
algún día alguien exporta, y lo que se entrega es exactamente lo que acaba de
correr. Coste: +6 KB en el IDE.

El anfitrión —la página, el lienzo y el tiempo— vive en `ide/anfitrion.js`,
aparte, porque lo comparten los dos documentos. Con dos copias, la lógica
delicada de guardar y reponer lo que el usuario tenía puesto se habría separado
en cuanto se tocara una de ellas.

### Dos fallos que solo se ven usando la aplicación

Escribiendo tres tareas seguidas con un reloj repintando cada segundo salieron
dos cosas que ninguna prueba de unidad habría encontrado:

1. **El elemento se reemplazaba a media palabra.** Reponer el valor y el cursor
   no basta: mientras el elemento se cambia por otro, lo que se teclea cae en el
   viejo. Ahora el control que tiene el foco no se destruye, se aparta y se
   vuelve a colocar. Como los oyentes leerían funciones de un pintado anterior,
   no se quedan con la función: se quedan con el elemento y leen `__nD`, el
   descriptor del último pintado.
2. **Quitarlo del DOM disparaba `change`.** Es el blur implícito, y ese `change`
   llamaba al manejador del programa en mitad del repintado: se añadía una tarea
   a medio escribir y la caja se vaciaba sola. Un evento que nace de que estamos
   desmontando la página no es una acción del usuario, así que durante el
   desmontaje los turnos se ignoran.

### La red

`pedir(url, opciones?, funcion)` no devuelve la respuesta, la entrega. La máquina
es síncrona y no hay hilos, así que la respuesta llega como un turno más, igual
que un clic o un temporizador; no hizo falta inventar promesas en el lenguaje.

El permiso lo da quien está delante, una vez por sitio, en un cartel que se pone
fuera de `#pagina` —para que `limpiarPagina()` no se lo lleve por delante— y que
se recuerda: en el IDE durante la sesión, en una aplicación exportada bajo
`n:perm:`, prefijo que el programa no alcanza porque solo escribe en `n:app:`.
Los límites: cuatro peticiones a la vez, 15 s, 2 MB, `credentials: 'omit'`, y
cabeceras con salto de línea rechazadas al construir.

Desde el IDE la zona tiene origen opaco, así que solo responden los servicios con
`Access-Control-Allow-Origin: *`. Es la limitación real y está probada como tal.

### Fuera del navegador

`util/n.js` (QuickJS) y `util/n-node.js` (Node) son el mismo intérprete con dos
anfitriones: archivos, procesos, argumentos, entorno y entrada. Los dos dicen los
mismos mensajes en español, y la suite `pruebas/fuera.js` corre cada caso por los
dos y compara — que es la única forma de que no se separen.

Las órdenes se lanzan **sin shell**: la orden y sus argumentos van por separado,
así que un dato con espacios o comillas no se convierte en otra orden. Hay una
prueba que lo intenta.

Nada de esto existe dentro de una página. Lo ofrece el anfitrión, y el de la zona
aislada no lo tiene; un programa en el IDE que llame a `leerTexto` oye que no hay
anfitrión de archivos, y eso también está probado.

Un detalle del motor que hizo falta: los errores del mundo de fuera llegan como
valores `error` de tipo `archivo` o `sistema`, no `motor`, para poder
distinguirlos al capturarlos. `vm.error` acepta ahora ese tipo.

## Módulos: partir el programa en archivos

Hasta aquí un programa era un archivo. Una función escrita en `a1.esl`
simplemente no existía en `a2.esl`, y eso es lo que impedía que el lenguaje
creciera más allá de lo que cabe en un archivo legible.

```
# lib/tabla.esl
fijo RELLENO = 10                                  # privado
fn columna(t: texto) -> texto { … }                # privado
publico fn fila(celdas: lista) -> texto { … }      # esto sí sale

# resumen.esl
usar "lib/tabla.esl" como tabla        # espacio de nombres
usar resumen de "lib/numeros.esl"      # nombres sueltos
```

### El cargador es del anfitrión, y por eso en el navegador no hay módulos

El motor no sabe leer nada: los archivos los ofrece `host.archivos`, los procesos
`host.sistema`, y los módulos `host.modulos`, con dos funciones y ninguna más:

```
resolver(especificador, desdeClave) → clave canónica
leer(clave)                        → el texto del módulo
```

Dentro del IDE eso **no existe**, y no es una laguna que quede por tapar. La zona
aislada tiene origen opaco y no hay disco al que llegar; darle un cargador que
trajera código por la red sería exactamente el `cargar()` que la fase 1 decidió
no tener —«darle a un programa la capacidad de fabricarse bytecode y cargarlo
sería devolverle por la puerta de atrás justo lo que el aislamiento le quitó».
Un `usar` en el IDE dice, en la fase «módulos»:

```
[módulos] línea 1:1 — «usar» necesita un anfitrión con módulos
   ↳ aquí dentro no hay sistema de archivos que leer; los módulos funcionan
     fuera del navegador: node motor/util/n-node.js programa.esl, o
     qjs --std motor/util/n.js programa.esl
```

La otra salida —un cargador de otra clase, con los módulos en pestañas del
editor— habría querido decir un editor de varios archivos, o sea rehacer
`ide/padre.html`. Se descartó por eso y porque el trato con el anfitrión ya
queda montado: el día que el IDE tenga varias pestañas, le basta con ofrecer
`host.modulos` y aquí no hay que cambiar nada.

### La sintaxis no reserva ninguna palabra nueva

`usar`, `publico`, `como` y `de` **no son palabras clave**. No están en
`PALABRAS`: se reconocen por la forma de la sentencia, al principio de una
sentencia del nivel superior. `usar` seguido de un texto, o de una lista de
nombres que acaba en `de`; `publico` seguido de `fn`, `fijo` o `var`. Fuera de
ahí siguen siendo identificadores normales, y `var de = 1` sigue compilando.

El precedente es de la propia gramática: `y` y `o` son a la vez operadores y
nombres válidos, porque reservarlas rompería programas. `de` y `como` son dos de
las palabras más comunes del español y el argumento es el mismo, con más fuerza.
El coste es una mirada hacia adelante de unos pocos tokens y un caso que hay que
cuidar: `usar a, b "ruta.esl"` no es un `usar` bien formado, pero tampoco puede
ser otra cosa, así que en vez de dejarlo caer en «no se esperaba «,» aquí» se
dice que falta el `de`.

### Solo sale lo marcado

Se exporta lo que lleva `publico`, no todo el nivel superior. Un módulo suele ser
más ayudantes que interfaz, y uno que exporta todo no tiene interfaz. Además es
lo que permite decir, al compilar, «`tabla.esl` no exporta `columna`» y listar lo
que sí exporta: con exportación implícita no habría nada que listar.

Y lo que exporta un archivo se sabe **sin mirar los cuerpos**: son sus
declaraciones marcadas, con el tipo de su anotación. Eso es lo que hace que un
ciclo no sea un problema al analizar —para saber qué exporta `a.esl` no hay que
analizar `a.esl`, basta con haberlo leído— y de paso el verificador de tipos
cruza archivos: `sumar("a", "b")` con `publico fn sumar(a: entero, b: entero)`
al otro lado es un error de tipos, no una sorpresa en ejecución.

### Las dos formas de nombrar, y por qué el alias no es un valor

```
usar "mates.esl" como m        →   m.sumar(1, 2)
usar sumar de "mates.esl"      →   sumar(1, 2)
```

La primera dice en cada llamada de dónde viene la función y nunca tapa nada; la
segunda es la que hace legible el código que usa una función veinte veces. Con
solo una de las dos, o se escribe `m.` por todas partes o se pierde de vista de
dónde salió cada nombre.

`m` **no es un valor**: no se puede guardar, ni pasar, ni comparar. Solo sirve
para `m.algo`, que se resuelve al compilar. Convertirlo en un diccionario sería
cómodo para explorar, y traería de vuelta el problema de los ciclos —el
diccionario solo podría existir cuando el módulo hubiera terminado de
ejecutarse— así que usarlo como valor es un error de tipos con esas palabras. Un
local o un parámetro con el mismo nombre manda sobre el alias: `fn f(m: dic)` no
deja de funcionar porque alguien importe un módulo llamado `m` más arriba.

### El enlace es de compilación, y por eso no hay ni un opcode nuevo

Cada nombre de nivel superior de un módulo es un global cuyo nombre lleva delante
su clave y un `\0`. `mates.sumar` se compila a `GET_GLOBAL "…/mates.esl\0sumar"`.
`\0` es deliberado: el léxico solo acepta letras, dígitos y `_` en un
identificador, así que ningún programa puede escribir uno de esos nombres.

Las alternativas eran peores. Un `Map` de globales por módulo obliga a tocar el
bucle de despacho, el recolector, el panel de memoria y el puente del JIT.
Envolver cada módulo en una función —lo que hace CommonJS— sale gratis en el
compilador pero convierte cada función de nivel superior en un local, y entonces
una función que llama a su vecina captura una variable de fuera: `generarJS`
rechaza las funciones con capturas, así que **mover código a un módulo habría
apagado el JIT en silencio**. Con el prefijo no: sigue habiendo una sola tabla de
globales, `DEF_GLOBAL` sigue siendo `DEF_GLOBAL`, y el JIT compila dentro de un
módulo igual que fuera.

El precio es que el compilador de bytecode y el JIT tienen que traducir los
nombres **igual**. El JIT parte del árbol sintáctico, donde los nombres están sin
enlazar, así que cada `FuncionCompilada` lleva su `enlace` y las dos rutas llaman
a la misma `globalDeEnlace`. Si se separasen, una función de un módulo daría un
resultado distinto a partir de su llamada cuarenta, que es cuando entra el JIT —
la clase de fallo que este proyecto ya ha pagado una vez.

Y el `usar` en sí **no es un opcode**: es una llamada a una nativa que se llama
` usar`, con un espacio delante, otro carácter que el léxico no puede poner en un
identificador. Así la tabla de instrucciones no cambia, la huella del `.elb` no
cambia, y **los `.elb` de antes siguen valiendo**. La fase 2 rechazó los de la
fase 1 porque añadió tres instrucciones y eso era el mecanismo funcionando; aquí
no hacía falta añadir ninguna, y no añadirla es mejor que rechazarlos.

Lo que sí se dice en voz alta: un programa con `usar` **no se puede guardar como
`.elb`**. El formato guarda una función y su árbol de funciones anidadas; esto
son varios archivos que se resuelven contra un disco, y meterlos dentro querría
decir cambiar el formato —y con él la huella— para guardar rutas absolutas que en
otra máquina no valen. `serializar` lo dice y no lo hace.

### El programa principal no lleva prefijo

Sus globales se compilan con el nombre que ponen, como siempre. No es una
excepción por comodidad: es lo que mantiene su bytecode libre de rutas absolutas,
y por tanto un `.elb` portable. Como consecuencia, el programa principal no es un
módulo de nadie: si un módulo lo importa, se dice con esas palabras en vez de
cargar una segunda copia que volvería a imprimir todo.

### Los ciclos los resuelve la elevación que ya había

El compilador ya emitía las funciones del nivel superior antes que el resto del
archivo, para poder llamarlas desde arriba. Los `usar` se emiten **justo
después**, y de ahí sale todo:

```
A:  definir sus funciones  →  cargar B  →  el resto de A
B:  definir sus funciones  →  cargar A (ya está cargando: se sigue)  →  el resto de B
```

Cuando B empieza, las funciones de A ya están definidas, así que B las ve.
Recursión mutua entre dos archivos, o entre tres en círculo, funciona sin más. El
registro lleva tres estados —`nuevo`, `cargando`, `listo`— y encontrarse un
`cargando` es justo el ciclo: se sigue, y eso es lo que evita la recursión
infinita sin tener que detectar nada.

Lo que un ciclo no puede hacer es leer un **valor** de nivel superior del otro
antes de que lo calcule, y eso se dice:

```
[ejecución] «NOMBRE» de «v-a.esl» todavía no está definida
   ↳ suele ser un ciclo de importación: el valor se usa antes de que su módulo
     llegue a calcularlo — las funciones sí se ven, los valores de nivel
     superior no
   en v-b.esl (línea 3)
   en v-a.esl (línea 1)
   en principal (línea 1)
```

Ese mensaje existe porque el nombre real del global es
`/tmp/v-a.esl\0NOMBRE`, y decirlo tal cual no ayudaba a nadie. La traza nombra
los archivos porque el chunk de un módulo se llama como él.

### Las rutas, relativas a quien importa

`usar "./al-lado.esl"` desde `lib/hondo.esl` busca en `lib/`, no en el directorio
desde el que se lanzó el programa. Es la única opción que deja mover una carpeta
de módulos sin reescribir lo que dice dentro. Un `usar` del programa principal se
resuelve contra el propio programa, no contra el directorio de trabajo —lo
segundo funciona mientras se lance desde la carpeta del programa y falla en
cuanto no, y así fallaba la primera versión de esto.

La clave es la **ruta real** (`realpath`): `./m.esl` y `../lib/m.esl` desde otro
sitio dan la misma clave, y por tanto el mismo módulo, ejecutado una sola vez.
Los dos anfitriones la calculan igual —`fs.realpathSync` y `os.realpath`— y
QuickJS, que no tiene `path`, normaliza a mano para que el texto del error
coincida carácter por carácter con el de Node; `pruebas/modulos.js` compara las
dos salidas en cada caso, que es la única forma de que no se separen.

### Una sola vez es por programa, no por motor

El registro de ejecución se rehace en cada `correr`. El estado de un módulo es de
esta corrida: el `contador` de un módulo sobrevive a los clics y a los
temporizadores —los turnos escriben en el global del módulo, que es el mismo
para todos— y vuelve a cero cuando se le da otra vez a ejecutar, igual que se
paran los temporizadores.

### Lo que no se permite, y por qué

| intento | qué pasa |
|---|---|
| `usar` dentro de una función o de un bloque | error de sintaxis: un módulo se carga una vez al empezar |
| `publico` dentro de una función | error de sintaxis: lo de dentro no sale del archivo |
| `usar "{d}/m.esl" como m` | error: la ruta tiene que saberse al compilar |
| `sumar = 3` sobre un nombre importado | error: lo que exporta un módulo solo lo cambia ese módulo |
| `m.VERSION = "2"` | lo mismo |
| `fijo x = m` | error: un módulo no es un valor |
| importar un nombre de la biblioteca | aviso, como `fn texto(…)`: la tapa, y se dice |
| un módulo importa el programa principal | error: el principal no es un módulo |

### Probado

150 pruebas en `pruebas/modulos.js`. Casi todas lanzan los intérpretes de verdad
y comparan Node contra QuickJS, como `fuera.js`, porque un módulo es un archivo
en un disco y el cargador es del anfitrión: probarlo con un anfitrión de mentira
sería probar el de mentira. En proceso se prueba lo contrario —que sin
`host.modulos` el `usar` no exista y lo diga— y las dos cosas que necesitan un
anfitrión a medida: que un manejador de eventos pueda vivir en un módulo, y que
con JIT y sin JIT salga lo mismo.

De paso salieron dos defectos. Uno de esta fase: el programa principal resolvía
sus rutas contra el directorio de trabajo en vez de contra su propio archivo, y
como todo lo probado a mano se lanzaba desde la carpeta del programa, funcionaba.
El otro, viejo y ajeno a los módulos: `fn f(d: dic)` —una anotación sin
parámetros de tipo— dejaba en el árbol la *fábrica* `T.dic` en vez de un tipo, y
a partir de ahí `tipoATexto` decía «undefined» y `compatible` comparaba con
basura. Corregido, porque salió al escribir el primer módulo con `lista` anotada.

## FFI: llamar a código compilado

La capacidad que faltaba para salir del mundo de JavaScript. Es, a la vez, la
única de este proyecto que **no tiene red de seguridad**: una llamada nativa no
la mira el verificador, no la corta el presupuesto de instrucciones, y un puntero
mal puesto tumba el proceso sin pasar por `intentar`. Todo el diseño sale de
aceptar eso en vez de disimularlo.

### La superficie: tres verbos y ningún tipo nuevo

```
cargarNativa("raylib.dll")                                   # abrir
estructuraNativa("Color", {"r": "natural8", "g": "natural8",
                           "b": "natural8", "a": "natural8"})
fijo abrirVentana = nativa("raylib.dll", "InitWindow",        # declarar
                           "nulo", ["entero", "entero", "texto"])
abrirVentana(640, 400, "Ñ")                                   # llamar
```

Lo que devuelve `nativa` **es un valor `ObjNativa`**, exactamente lo mismo que
`imprimir` o `raiz`. No es un envoltorio ni un tipo aparte: `tipo()` dice
`funcion`, se guarda en un `fijo`, se pasa a `mapear`, y la máquina comprueba el
número de argumentos con su mensaje de siempre porque la aridad va escrita en el
propio valor. Esa decisión es la que hace que no haya sintaxis nueva, ni un tipo
`biblioteca` que haya que serializar, marcar en el recolector y explicar.

Tampoco hay descriptor de biblioteca: **la biblioteca es su nombre**. Abrirla dos
veces no es un error, declarar una función la abre si hacía falta, y así no
existe un entero opaco que un programa pueda falsificar o dejar sin cerrar.

Los tipos se escriben en español, porque un programa en español no tiene por qué
escribir `uint32_t`: `entero8/16/(32)/64`, `natural8/16/(32)/64`, `real32`,
`real`, `log`, `texto`, `puntero`, `tamano` y `nulo` —este solo como valor
devuelto—. Una estructura declarada vale como tipo a partir de ahí.

**Un puntero es un entero.** Es lo honesto: una dirección es un número, Ñ tiene
números exactos hasta 2⁵³ y ninguna dirección real de Windows o Linux llega ahí.
Permite lo que hace falta —recibir de `malloc` y devolvérselo a `free`, guardar
el manejador que una función te da para pasárselo a otra— sin inventar un tipo
que solo sabría envolver.

**Una estructura es un diccionario.** Van y vienen por valor: `ColorFromHSV`
devuelve `{r: 255, g: 0, b: 0, a: 255}` y `ClearBackground` acepta uno. El orden
de los campos importa, y por eso funciona: el diccionario de Ñ conserva el orden
de inserción.

### Dónde está la frontera, y por qué está ahí

En el mismo sitio que la de los archivos, por la misma razón y con el mismo
mecanismo: `host.nativo`. Si el anfitrión no lo trae, los nombres existen pero
dicen «necesita un anfitrión con código nativo» en vez de fallar de forma rara.
El anfitrión de la zona aislada no lo trae y nunca lo va a traer; el del
intérprete de Node sí, y `hayNativo()` está para preguntarlo antes de intentarlo.

Y hay una segunda frontera, dentro del propio proyecto: **la biblioteca estándar
no sabe llamar a C**. Le pide al anfitrión cinco cosas —cargar, descargar,
listar, declarar una estructura, declarar una función— y se entienden con valores
planos de JavaScript. Convertir entre valores de Ñ y valores planos lo hace la
biblioteca (es la que conoce `ObjDic`); saber qué es un `uint32` lo hace el
anfitrión. Así `util/nativo-koffi.js` se puede cambiar por otra cosa sin tocar el
motor, y el de QuickJS puede simplemente no existir.

### koffi, y por qué no otra

El requisito que manda es **que no haga falta un compilador de C**. Con eso,
`ffi-napi` queda fuera: su último cambio es de mayo de 2022, depende de
`node-gyp-build` y no publica binarios para los Node de hoy, así que instalarlo
arranca node-gyp. Se comprobó instalándolo: falla pidiendo las cabeceras de Node.

koffi publica el binario como dependencia opcional por plataforma
(`@koromix/koffi-win32-x64` y sus veinte hermanas). `npm install koffi` en este
contenedor tardó **dos segundos** y no compiló nada.

### Lo que puede ir mal, y cómo llega

Todo lo que se puede comprobar se comprueba **al declarar**, no en la primera
llamada: que la biblioteca abra, que el símbolo exista, que los nombres de tipo
sean nombres de tipo. Y todo llega como valor `error` de tipo **`nativo`**,
capturable con `intentar`, con el mensaje en español.

Dos casos merecen su propio párrafo:

**Descargar deja funciones colgadas.** Si se descarga una biblioteca de la que ya
se declararon funciones, esos símbolos apuntan a memoria que puede haberse
desmapeado, y llamarlos sería un salto a ninguna parte: sin excepción, sin
mensaje, el proceso muerto. Así que al descargar se marcan como muertas y
llamarlas es un error normal de Ñ. Es la diferencia entre un fallo y un agujero.

**`log` es el `bool` de C, un byte.** Un montón de funciones de C que parecen
devolver un booleano devuelven un `int` cualquiera distinto de cero —glibc hace
que `isdigit()` devuelva 2048—, y declararlas `log` da `falso` siempre. Se
declaran `entero` y se comparan con 0. No es un defecto de la traducción: es lo
que dice la firma que se escribió. Hay una prueba que fija las dos mitades.

Un entero de 64 bits que no cabe en un número de Ñ se dice con esas palabras en
vez de entregar un número equivocado en silencio. Y hay límites, que aquí no son
adorno: 32 bibliotecas abiertas, 16 argumentos por función, 256 funciones
declaradas por ejecución —declarar dentro de un bucle es el error fácil—.

### Lo que no se ha hecho

No hay manejadores: no se puede pasar una función de Ñ para que C la llame. No
hay arreglos ni punteros de salida más allá de pasar la dirección a mano. No hay
forma de leer memoria cruda si no es pidiéndosela a otra función de C —el truco
de declarar el retorno de `strcpy` como `texto` funciona y está en las pruebas,
pero es un truco—.

Y no hay nada de esto en QuickJS. Ahí lo único que existe es cargar módulos
nativos compilados contra sus propias cabeceras, o sea un compilador de C, que es
justo lo que se quería evitar; en Windows no existe ni eso. La suite lo prueba
—`hayNativo()` da `falso` en qjs y `cierto` en Node— para que la diferencia esté
escrita y no se olvide.

### Probado

`pruebas/nativo.js`, 50 pruebas lanzando el intérprete de verdad; 52 si está
raylib, 54 si además hay pantalla. Llama a la libc del sistema —`libc.so.6` en
Linux, `msvcrt.dll` en Windows— y a raylib 6.0. En un contenedor sin pantalla se
comprueba lo que sí se puede comprobar: `TextLength`, `GetFileExtension`,
`ColorToInt`, `ColorFromHSV`, `Fade` y `GetRandomValue` dan lo que da raylib, con
estructuras entrando y saliendo por valor.

Con un servidor X de mentira delante (`xvfb-run`) se abre una ventana de verdad y
se pintan fotogramas. La comprobación que no se puede fingir es `MeasureText`:
sin ventana devuelve 0, porque no hay tipografía cargada; con ventana devuelve el
ancho en píxeles.

De paso salió un defecto viejo del verificador de tipos, y no tenía nada que ver
con esto: anotar `fn f(): dic` o `fn f(): lista` —sin parámetros de tipo— decía
«esta función debe devolver **undefined**». `T.lista` y `T.dic` son constructores
y se devolvían tal cual como si fueran tipos. No reventaba nada, porque el
resultado era compatible con todo, pero tampoco comprobaba nada. Corregido, con
prueba en `motor.js`.

### Lo que el FFI se lleva por delante

Al otro lado de una llamada nativa no hay red. Lo comprobé sin querer: un módulo
que envuelve raylib, y un programa que llama a `medir()` **después** de cerrar la
ventana. raylib mide con la tipografía que carga al abrirla y suelta al cerrarla,
así que dereferencia memoria liberada: **el proceso entero muere con
«Segmentation fault»**, sin error de Ñ, sin traza, sin `intentar` que valga.

Eso no es un defecto que arreglar, es el precio. Todo lo que protege al programa
—el presupuesto de instrucciones, los errores capturables, el aislamiento de la
página— se acaba en el borde del FFI. Lo que sí se protege es lo que ocurre
**antes** de cruzar: aridad, tipos, biblioteca o símbolo que no existen, y llamar
a una función cuya biblioteca se descargó. Eso son errores de Ñ normales. Lo que
pase después de cruzar depende de que la firma declarada sea la de verdad.

Dicho de otro modo: `nativa(…)` es la palabra con la que uno acepta ese trato, y
por eso solo existe cuando el anfitrión la ofrece.

## El motor sin nada debajo

El motor es JavaScript. Eso significa que siempre necesitó un runtime: un
navegador, Node o `qjs`. La confusión fácil es pensar que necesita **HTML**, y no:
`bundle.js` no contiene ni un `document.`, ni un `<div>`, ni nada del DOM. Todo
lo que toca una página vive en `ide/anfitrion.js`, que es el *anfitrión*, no el
motor. El mismo `bundle.js` corre en los cuatro sitios sin cambiar una línea.

Lo que sí faltaba era poder **entregar el motor**. `qjsc` compila JavaScript a
bytecode de QuickJS y lo enlaza con `libquickjs.a`: el binario que sale lleva la
máquina virtual de QuickJS en C, el bytecode del motor de Ñ, y el intérprete de
línea de órdenes. `util/construir-binario.js` junta `bundle.js` con `util/n.js`
—quitándole las dos líneas que cargaban el bundle desde disco— y se lo pasa a
qjsc. El motor entra **tal cual**: es el mismo archivo que corre en el navegador.

Resultado: 1,14 MB, enlazado solo contra libc y libm.

### El precio, medido

QuickJS no tiene JIT. El JIT de Ñ genera JavaScript con `new Function`, y ahí ese
JavaScript lo vuelve a interpretar QuickJS: no hay código máquina en ningún
momento, así que el JIT no aporta nada. Mandelbrot 600×400×200 tarda 12,5 s en el
binario contra 92 ms en Node —×136—, y el binario va prácticamente igual que
`qjs` (13,3 s), que es lo que confirma que la diferencia es el JIT y no el
empaquetado.

A cambio, arrancar cuesta 4,7 ms contra 58 ms de Node: ×12 más rápido en lo que
de verdad se nota en una herramienta de consola que se llama mil veces desde un
script. Y 1,14 MB frente a 119 MB.

No hay un ganador: hay dos herramientas. El binario es para entregar; Node es
para calcular.

## Lo que falta, dicho en voz alta

Durante mucho tiempo `pintar()` en la consola no hacía nada **y no lo decía**: el
programa construía su árbol, lo pintaba contra un anfitrión que no existía, y
seguía tan campante. Lo mismo el lienzo. Un fallo callado es el peor de todos,
sobre todo para quien está aprendiendo el lenguaje y no sabe si el error es suyo.

Ahora cada función que necesita anfitrión lo comprueba y lo dice con el mismo
patrón que ya usaban `leerTexto` y `nativa`: qué falta y dónde sí funciona.
Construir valores —nodos, estilos— no necesita anfitrión y sigue funcionando en
cualquier sitio; lo que lo necesita es **usarlos**.

`pedir()` ya existe en el intérprete de Node, que trae `fetch`. Ahí no se pide
permiso, al contrario que en el navegador: en la consola el programa es uno que
el usuario decidió ejecutar y que ya puede leer sus archivos y lanzar procesos.
Pedir permiso para una petición HTTP cuando `ejecutar` no lo pide sería teatro.
QuickJS sigue sin red, por lo mismo que sigue sin FFI: no lo trae.

## Ensamblado

```
node build.js       01..06-*.js        →  bundle.js
node build-ide.js   bundle  → hijo.html
                    hijo (base64) → padre.html  →  espanol-like-v4.html
```

El hijo va en base64 dentro del padre. No es adorno: el documento hijo lleva
`</script>` dentro de sus propias cadenas y acentos por todas partes, así que
ni el analizador de HTML del padre ni la codificación pueden romperlo. Cuesta
un 33 % de tamaño (122 KB → 164 KB) y el archivo final pesa 202 KB.

## Pruebas

`motor/pruebas/todas.js` pasa las diez suites: **678 pruebas** más los doce
ejemplos del selector, en unos 55 s.

| archivo | qué cubre |
|---|---|
| `motor.js` | 141 · lenguaje, tipos, VM, GC, JIT y presupuesto |
| `excepciones.js` | 48 · `intentar` / `capturar` / `finalmente` / `lanzar` |
| `web.js` | 42 · el árbol de nodos, los atributos y el escapado |
| `estilos.js` | 46 · anidamiento, consultas de medios y clases locales |
| `interaccion.js` | 60 · eventos, identidad, almacén y temporizadores, con reloj de mentira |
| `fuera.js` | 46 · archivos, procesos, argumentos y entrada, corriendo cada caso por Node y por QuickJS y comparando |
| `modulos.js` | 150 · `usar` y `publico`: ámbito por archivo, ejecución única, ciclos, rutas y el JIT dentro de un módulo, también por los dos intérpretes |
| `serial.js` | 56 · ida y vuelta, cabecera, catorce falsificaciones, bytes revueltos y truncados |
| `aislado.js` | 89 · el IDE entero en Chromium: frontera, programa hostil, paneles, `.elb`, y que escribir en una caja que filtra una lista funcione de verdad |
| `ejemplos-ide.js` | los trece ejemplos del selector, por el puente |
| `hostil.esl` | el programa que intenta salirse por las tres vías obvias |
