# Ñ

Un lenguaje de programación en español. No una capa de traducción encima de
otro lenguaje: tiene su propio verificador de tipos y tres formas de correr un
programa, con un orden claro entre ellas (la siguiente sección).

```n
usar media, desviacion, cuartiles de "numerico"
usar moneda, tablaTexto, enNegrita de "formato"

fijo ventas: lista = [120000.0, 98000.0, 143000.0, 110000.0]

imprimir(enNegrita("Ventas del mes"))
imprimir("promedio:   " + moneda(media(ventas)))
imprimir("desviación: " + moneda(desviacion(ventas)))

fn clasificar(x: real) -> texto {
    si x > media(ventas) { devolver "arriba" }
    devolver "abajo"
}
para v en ventas { imprimir(moneda(v) + "  " + clasificar(v)) }
```

## Los motores de Ñ

| | motor | para qué sirve | cómo se usa |
|---|---|---|---|
| **Oficial** | **AOT** — Ñ → C → ejecutable nativo, sin runtime aparte | la velocidad: programas, herramientas y cálculo que tienen que ir rápido | `node motor-exp/util/n-compilar.js programa.esl -o programa` · o `n-auto.js` (JIT al instante + AOT en segundo plano) |
| Secundario | **JIT** — máquina virtual + traducción a JavaScript, sobre Node | arrancar al instante, depurar, y correr **todo** el lenguaje y toda la biblioteca | `node motor/util/n-node.js programa.esl` |
| Secundario | **Navegador** — `espanol-like-v4.html`, un solo archivo | probar sin instalar nada, y las páginas con interfaz (lienzo, estilo, eventos) | abrir el archivo |

Donde el AOT puede correr un programa, da lo mismo que la máquina virtual: se
prueba contra ella con cada programa de la batería que puede compilar (salida y
código de salida iguales; solo cambia el rastro de los errores, que nombra otros
marcos intermedios). Los que no puede compilar los rechaza al compilar, no al correr.

**Qué tan rápido es el AOT.** Medido en una i3-1115G4 frente a C escrito a mano
(gcc -O2, mismos algoritmos; el C que genera Ñ va con -O3), 59 programas de estrés —objetos, recursión,
acceso a listas, memoria—, media geométrica del tiempo (se dejan fuera los que C resuelve en menos de
3 ms, donde el compilador de C elimina el trabajo y la razón no mide nada, y los 4 que pasan de 900 llamadas):

| familia | Ñ AOT frente a C |
|---|---|
| objetos y memoria (crear y soltar millones de objetos) | ×1.0 |
| acceso a listas, índices comprobados | ×1.19 |
| memoria y caché | ×1.30 |
| recursión | ×1.48 |
| **los 59** | **×1.21** (41 por debajo de ×1.5, 53 por debajo de ×2, 18 más rápidos que C) |

Los 22 programas numéricos clásicos (fib, criba, mandelbrot, n-cuerpos…) salen a
×1.3 de C con todas las comprobaciones puestas (×1.28 a ×1.31 según la corrida),
y a ×1.05–×1.10 con `--sin-comprobar`. El programa comprueba índices, desbordes y divisiones igual
que la máquina virtual: si algo se sale, da el mismo error con el mismo mensaje.
Las tablas completas, con las condiciones de cada medida, están en
[`velocidad/`](velocidad/).

**Lo que el AOT todavía no hace** (por eso el JIT sigue siendo el que corre
«todo Ñ», y por eso se dice aquí y no se esconde):

- **Biblioteca.** El ejecutable lleva 295 de los 1166 nombres del motor. Faltan
  el tipo `arreglo` y casi todo `numerico`, las tablas de `datos`, `estilo`, el
  lienzo y la página (esas viven en el navegador por naturaleza), NEÑ y varias
  funciones de `sistema`. Un programa que usa algo que falta no compila y lo dice
  con su nombre, nunca falla a medias.
- **Generadores y funciones asíncronas**, y los hilos.
- **Recursión:** hasta 900 llamadas anidadas, igual que la máquina virtual.
- **Necesita un compilador de C** (gcc o clang, o uno portátil en la carpeta
  `compilador/` junto al motor). Compilar un programa normal tarda del orden de
  medio segundo (unos 10 s uno de 28 000 líneas de C).

**El camino fácil: `n-auto.js`.** `node motor-exp/util/n-auto.js programa.esl`
corre el programa YA con el JIT y, en segundo plano, compila el AOT y lo guarda
en una caché; desde la segunda vez ejecuta el nativo. Si el AOT no cubre el
programa, no hay compilador o el sistema no deja arrancar el ejecutable, sigue
con el JIT sin que el usuario haga nada. La caché caduca sola si cambia el
programa, uno de sus módulos o el compilador de Ñ.

## Probarlo sin instalar nada

Abre **`espanol-like-v4.html`** en el navegador. Es un archivo solo, sin
conexión y sin instalar: editor con comprobación de tipos en vivo, consola,
lienzo, página dinámica y tres paneles para ver por dentro el bytecode, el JIT
y la memoria.

## Instalarlo

```
npm install -g n-lenguaje
n programa.esl
```

O sin instalar, desde el repositorio:

```
node motor/util/n-node.js programa.esl                          # JIT
node motor-exp/util/n-compilar.js programa.esl -o programa      # AOT (motor oficial)
node motor-exp/util/n-auto.js programa.esl                      # JIT ya + AOT en segundo plano
```

Hay también un intérprete para [QuickJS](https://bellard.org/quickjs/)
—`motor/util/n.js`— que pesa 1 MB entero y sirve para llevárselo a cualquier
sitio.

## Qué trae

**La biblioteca: 569 nombres**, 93 globales y 476 repartidos en siete eDSL que
se traen con `usar`. Un eDSL no añade sintaxis: añade funciones, formas de
valor y, cuando hace falta, tipos nuevos en la máquina.

| eDSL | para qué |
|---|---|
| `numerico` | álgebra lineal, Fourier, estadística, el tipo `arreglo` y los complejos |
| `datos` | el tipo `tabla`: agrupar, pivotar, cruzar, limpiar, leer y escribir CSV |
| `texto` | lo que una biblioteca pensada en inglés hace mal: tildes, la Ñ, plurales |
| `fecha` | el tipo `fecha`, días hábiles, festivos de Colombia, antigüedades |
| `formato` | números y tablas para leer con los ojos, con el ancho VISIBLE bien medido |
| `estilo` | el tipo `estilo`: tokens, paletas, estados y consultas de medios |
| `probar` | afirmaciones, grupos y espías, para probar Ñ con Ñ |

La idea de fondo es que los eDSL se agrupan **por uso conjunto, no por
disciplina**: si eres matemático no te hace falta saber el de estilos, ni al
contrario. Y uno se gana su sitio cuando elimina una clase de error, no cuando
ahorra teclas.

## La documentación, y por qué se puede creer

Tres documentos, y ninguno escrito a mano del todo:

- **`ejemplos/00-gramatica.txt`** — la gramática formal, contrastada contra el
  lexer y el parser. Cada regla tiene su prueba en
  `motor/pruebas/en-n/gramatica.esl` y en `motor/pruebas/motor.js`, así que si
  alguien cambia la precedencia, las pruebas fallan y el documento se corrige
  con ellas.
- **`referencia-stdlib.html`** y **`referencia-contexto.txt`** — los 569
  nombres con su aridad, sus tipos y un ejemplo. Se generan con
  `npm run referencia` y `npm run contexto` desde el registro de la máquina
  virtual, y cada ejemplo se EJECUTA al generarlos: la salida publicada es la
  que imprimió. Un ejemplo que deja de correr rompe la construcción.
- **`LEEME.md`** — el manual largo: el lenguaje entero, el IDE, el formato
  `.elb`, los módulos, el anfitrión y cómo se construye todo.

`referencia-contexto.txt` existe para dárselo a una IA: 569 entradas con
ejemplo verificado, en texto plano, junto con la gramática.

## Las pruebas

```
npm run probar     # 14 suites, 1496 afirmaciones · incluye los 50 ejemplos
npm run ejemplos   # solo los ejemplos, con un anfitrión de mentira completo
```

Las últimas ocho suites están escritas **en Ñ**, con el eDSL `probar`. Las de
JavaScript se quedan con lo que hay que mirar desde dentro del motor: el
registro de globales, las firmas, cómo resuelve `usar`, y lo que el lenguaje
tiene que **rechazar** —eso no se puede escribir en un programa que compila—.

## Licencia

Apache-2.0. Ver `LICENSE` y `NOTICE`.

La intención es que cualquiera use Ñ y lo use para lo que quiera, incluido
meterlo dentro de un producto cerrado. Por eso una licencia permisiva y no
copyleft.
