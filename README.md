# Ñ

Un lenguaje de programación en español. No una capa de traducción encima de
otro lenguaje: tiene su propio verificador de tipos, su máquina virtual de
bytecode y un JIT que traduce a JavaScript cuando una función se calienta.

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
node motor/util/n-node.js programa.esl
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
