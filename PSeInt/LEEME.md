# Modo pseudocódigo: la notación de PSeInt, en el motor de Ñ

Un programa escrito en el pseudocódigo de PSeInt corre aquí sin cambiarle una
letra. Y se puede ver cómo queda en Ñ, **línea por línea**.

```
node PSeInt/correr.js programa.psc                     traduce y corre
node PSeInt/correr.js programa.psc --ver               el original y la traducción, lado a lado
node PSeInt/correr.js programa.psc --guardar           escribe programa.esl al lado
node PSeInt/correr.js programa.psc --entrada "Ana;30"  lo que «Leer» va a leer
node PSeInt/pruebas.js                                 las pruebas (también están en la batería)
```

## Para qué existe

Un docente de lógica de programación tiene años de ejercicios en PSeInt. Con
esto los abre en Ñ **sin reescribir nada**, los ve correr, y pulsa `--ver`
para que el estudiante vea su `Si x > 5 Entonces` junto a `si x > 5 {`. Es el
puente: la clase empieza en la notación que ya conoce y sigue en Ñ sin
cambiar de herramienta.

Y por debajo corre todo Ñ. El verificador de tipos le dirá al estudiante que
declaró `Entero` y le está guardando un texto — cosa que PSeInt no le diría—,
y el error apunta a **su** línea, porque la traducción conserva la numeración.

## Cómo está hecho

Es un **front-end**: lexer y parser propios para la notación de PSeInt, y un
emisor que escribe Ñ. Tres decisiones:

1. **La gramática de Ñ no se toca.** PSeInt tiene tres estructuras que Ñ no
   tiene y aquí se *bajan* a lo que Ñ ya tiene:

   | PSeInt | Ñ |
   |---|---|
   | `Repetir … Hasta Que c` | `mientras cierto { … si c { romper } }` |
   | `Segun x Hacer / 1, 2: / De Otro Modo:` | `fijo _s1 = x` y una cadena de `si … sino si …` |
   | `Para i <- a Hasta b Con Paso p` | `para i en rango(a, b + 1, p)` si `i` es nueva; `i = a  mientras i <= b { … i = i + p }` si `i` ya existía, para que al salir valga lo que vale en PSeInt |
   | `Definir a Como Entero` | `var a: entero = 0` |
   | `Dimension v[n]` | `var v: lista = _dim([n], 0)` |
   | `Leer x` | `x = _leer()`, con conversión según el tipo declarado |
   | `Escribir a, b` | `imprimir(_txt(a) + _txt(b))` — PSeInt no separa con espacio |
   | `SubProceso r <- f(a)` … `FinSubProceso` | `fn f(a) { var r … devolver r }` |

2. **Las líneas se conservan.** La línea 7 del original es la línea 7 de la
   traducción; `FinSi` es un `}` en su misma línea. Los ayudantes (`_txt`,
   `_leer`, `_dim`) y los `usar` van **debajo** del programa, con su rótulo:
   las funciones de Ñ se izan, así que no hace falta que estén arriba.

3. **La costura queda a la vista.** Los arreglos de PSeInt empiezan en 1 y los
   de Ñ en 0: `v[i]` se traduce como `v[(i) - 1]` (y `v[3]` como `v[2]`). Es
   feo a propósito. Cuando el estudiante pase a Ñ los arreglos van a empezar
   en cero, y mejor que lo vea en la semana nueve con su propio ejercicio que
   en segundo semestre con Java.

Otras cosas que hace: no distingue mayúsculas (`Si`, `si`, `SI`; `Total` y
`total` son la misma variable), acepta `<-` y `=` para asignar, `=`/`<>` para
comparar, `MOD` y `%`, `^`, `Y`/`O`/`NO` y `&`/`|`/`~`, `Verdadero`/`Falso`,
los sinónimos `Algoritmo`/`FinAlgoritmo`, `Funcion`/`FinFuncion`,
`Imprimir`/`Mostrar`, y las 20 funciones predefinidas (`RC`, `Abs`, `Trunc`,
`Redon`, `Azar`, `Aleatorio`, `Longitud`, `Subcadena` 1-indexada e inclusiva,
`Concatenar`, `ConvertirANumero`…). Si una variable se llama como algo de Ñ
—`maximo`, `lista`, `var`— se renombra con un guion bajo y se avisa.

## Lo que no hace, todavía

- `Por Referencia` con un número o un texto: en Ñ los arreglos ya van por
  referencia, pero un escalar no se puede modificar desde dentro. Se avisa.
- Un programa de PSeInt que dependa del redondeo al imprimir reales (PSeInt
  corta decimales; Ñ imprime todos) va a dar una salida distinta en eso.
- Perfiles por institución. La sintaxis flexible y la estricta se aceptan las
  dos a la vez; lo que no hay es forma de *exigir* una.

## Sobre PSeInt y la licencia

PSeInt es de Pablo Novara (Universidad Nacional del Litoral) y es GPLv2.
**Aquí no hay código de PSeInt**: esto se escribió a partir de la referencia
pública del pseudolenguaje y de probar programas, y la sintaxis de un lenguaje
no es obra protegible. Los programas de prueba y los ejemplos son nuestros. Ñ
sigue siendo Apache-2.0, y «PSeInt» se nombra solo para decir con qué notación
es compatible.
