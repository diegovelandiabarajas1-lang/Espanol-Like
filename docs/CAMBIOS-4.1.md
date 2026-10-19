# Ñ 4.1 — lo que cambió frente a la 4.0

17 de octubre de 2026. La 4.1 es el motor experimental (`motor-exp/`, «4.1-exp»)
**ascendido a LTS**: todo lo que se probó allí en las fases R1, P1, X1–X4, S1–S2 y
W1 pasa a `motor/`. Lo decidió Diego después de que el clon pasara la batería en
la nube y en Windows. La historia fase a fase, con lo medido y lo que se rompió
por el camino, sigue en `motor-exp/EXPERIMENTAL.md`.

**Ningún opcode nuevo.** La huella del `.elb` es la misma: un `.elb` compilado
con la 4.0 se carga y corre igual en la 4.1 (probado con 19 programas de un
archivo y con un paquete de varios archivos, salida idéntica).

## Lo nuevo en el lenguaje

| | qué | ejemplo |
|---|---|---|
| R1 | `a[i]` y `a[i] = v` en arreglos; en N dimensiones `a[i]` es una vista | `m[1][0]`, `para fila en m` |
| X1 | registros con métodos (`tipo`, `yo`), sin herencia | `tipo Punto { x: real  y: real }` · `fn Punto.norma()` |
| X1 | `si … entonces … sino` como expresión | `si n == 1 entonces "caja" sino "cajas"` |
| X1 | `??` (solo nulo) y `?.` | `cliente?.correo ?? "sin correo"` |
| X1 | desestructurar listas, registros y diccionarios | `var [a, b] = par` · `fijo {x, y} = p` |
| X1 | `segun` / `caso` / `otro`, sin caída de un caso al otro | `segun dia { caso 1, 7 { … } otro { … } }` |
| X2 | parámetros por defecto (evaluados en cada llamada) y argumentos con nombre | `saludar("Eva", signo: ".")` |
| X2 | campos con valor por defecto; `publico tipo` entre archivos; `a?.m()` | `usar Punto de "./geo.esl"` |
| X3 | genéricos de usuario (solo verificador; `lista<T>` aún no) | `fn primero<T>(l: lista, d: T): T` |
| X4 | generadores (`producir`) y asíncronas (`esperar`) | `para x en contar(1, 4)` · `esperar todas([…])` |

`tipo`, `segun`, `caso`, `otro`, `entonces`, `yo`, `producir` y `esperar` **no
son palabras reservadas**: solo cuentan con su forma. `var segun = 1` sigue
valiendo.

## Tres eDSL nuevos (eran siete, ahora diez)

| eDSL | qué trae | dónde |
|---|---|---|
| `corrutinas` | `siguiente`, `recoger`, `terminado`, `dormir`, `todas` | en todas partes; `dormir` necesita reloj |
| `nativo` | `tipoNativo`, `retrollamada`, `soltarRetrollamada`, `enFondo`, `reservarMemoria`, `leerMemoria`, `escribirMemoria`, `textoDeMemoria`, `tamanoNativo`, `direccion`, `errorC` | solo Node con koffi |
| `sistema` | `servir`, `respuesta`, `leerLineas`, `copiarArchivo`, `moverArchivo`, `infoArchivo`, `carpetaActual`, `cambiarCarpeta`, `infoSistema`, `ejecutarEnFondo`, rutas (`unirRuta`, `nombreArchivo`, `extension`, …) | consola de Node; las rutas también en el IDE, con `/` |

Van en eDSL y no en el ámbito global a propósito: la primera versión de X4 puso
`todas` y `siguiente` globales y rompió dos programas que ya existían.

## FFI (S1)

- `nativa(lib, "double cos(double)")`: la firma tal como está en el `.h`. La
  forma vieja, con tipos en español, sigue igual.
- Arreglos de Ñ a C **sin copiar**, comprobando que el tipo de número coincide
  (antes koffi dejaba pasar `entero` a `double *` y C leía basura) y rechazando
  vistas con huecos.
- `_Out_` y `_Inout_`: lo que C devuelve por puntero sale como lista.
- Retrollamadas: C puede llamar a una función de Ñ; un error dentro no cruza C,
  sale como error de Ñ al volver de la llamada.
- Punteros como valor `puntero` (sin aritmética), tipos opacos, memoria
  reservada, `enFondo` en otro hilo como promesa.

## Sistema (S2)

- **La consola tiene reloj**: `luego`, `cada`, `dormir` y las asíncronas
  funcionan fuera del IDE.
- `servir(puerto, manejador)`: escucha solo en `127.0.0.1` salvo que se pida otra
  cosa; un error del manejador es un 500 que no cuenta nada a quien pidió.
- `leerLinea` es interactiva de verdad en una terminal (antes leía la entrada
  entera antes de devolver la primera línea).
- `ejecutar` acepta opciones (`entrada`, `carpeta`, `entorno`, `espera`).

## La página (P1)

El repintado ya no reconstruye la página: el anfitrión compara un modelo con el
DOM y cambia solo lo distinto. Un repintado sin cambios hace 0 mutaciones; rotar
300 filas con clave mueve 1 nodo. Lo escrito en un control que desaparece se
recuerda (hasta 500) y vuelve con él. La identidad de un control es qué es y
cómo se llama, no su posición.

## Rendimiento (R1)

`para i en rango(…)` sin construir la lista, `l[i]` y `agregar` en línea en el
JIT, autollamada directa. Contra la 4.0, en 57 pruebas: mejor en 41, peor en 0,
empate en 16 (CPU ×1,61, página ×3,70).

## Arreglos de la 4.0 que salieron por el camino

- Un `lanzar` dentro de una función pasada a `mapear`/`filtrar` no lo capturaba
  ningún `intentar`. Ahora sí, con y sin JIT.
- En Windows (W1): C1EÑ nativo no enlazaba (`-z nodelete` es solo de ELF), rutas
  con `\` en `fuera`, tolerancia de los núcleos NEÑ con el `pow` de mingw, borrar
  una DLL cargada, y `errorC` con el `errno` de `ucrtbase.dll`.

## Cambios de comportamiento (lo que puede notar un programa)

1. **`pedir` sin función devuelve una promesa** en vez de dar error. Algo que
   antes fallaba ahora vale; nada que antes valía falla.
2. **El error de `si` con llaves usado como valor** (`var x = si c { 1 } sino { 2 }`)
   tiene otro mensaje: ahora enseña la forma con `entonces`.
3. El mensaje de `nativa` cuando la biblioteca no está es más preciso (antes, en
   algunos casos, decía que faltaba el anfitrión).

## Compatibilidad, comprobada

- Los 67 programas de `ejemplos/` (`.esl` y los `.txt` numerados), corridos con
  la 4.0 y con la 4.1: **65 salen idénticos**. Los otros dos no son regresiones:
  `49-registro-de-eventos.txt` imprime marcas de tiempo de ahora mismo (cambian
  en cada ejecución, también entre dos corridas de la 4.0) y `panel.esl` necesita
  raylib, que en la nube no está; la 4.1 lo dice con un mensaje más claro.
- `.elb` de la 4.0 en la 4.1: 19 de un archivo y los paquetes de varios archivos,
  salida idéntica.
- Juegos y ARCADE con la 4.1: Flappy 11/11, Galaga 20/20, escritorio 13/13.
- Batería completa (nube, con Chromium): **24 de 25 suites en verde**, unas
  2.300 pruebas. Las nuevas: rendimiento 50, página 20, expresividad 60,
  expresiv. 2 60, sistema 80; y aislado 108, ejemplos del IDE 17, C1EÑ 95.
  En Windows la última batería fue la del clon (23 de 25, luego arreglado en W1):
  conviene correr `node motor\pruebas\todas.js` una vez en tu PC con la 4.1.

## Lo que cambió en las pruebas

- Cinco suites nuevas en `pruebas/todas.js`: `rendimiento` (R1), `página` (P1),
  `expresividad` (X1), `expresiv. 2` (X2–X4), `sistema` (S1–S2).
- `pagina.js` tiene 20 pruebas y no 23 como `exp-pagina.js` en el clon: las tres
  que corrían además contra la 4.0 «para que conste» que allí fallaba no tienen
  contra qué compararse ahora que el LTS es la 4.1.
- `motor.js` («no hay ternario con si/sino») espera el mensaje nuevo, e
  `interaccion.js` («pedir sin función») espera la promesa.
- La única roja de la batería sigue siendo la de siempre: `apps` → `ecosim5.esl`
  (los argumentos con que el corredor lanza ese programa; no es del motor).

## Lo que no se traspasó

Se queda en `motor-exp/`, que sigue siendo el sitio de lo que viene: `rutas.js`
(salidas a `motor-exp/salida/`), `util/banco.js` y `pruebas/comparar/` (comparan
el clon con el LTS), `EXPERIMENTAL.md`, los `CAMBIOS-*.diff`. Los ejemplos del
clon pasan a `ejemplos/sistema/` (`servidor-tareas.esl`, `ffi-ordenar.esl` y su
`.c`).

## Lo que sigue pendiente (en el clon)

R2 (`a[i]` de arreglo dentro del JIT, JIT del nivel superior), D1 (`bytes`,
`conjunto`, `patron`, `unir`/`pivotar`), S3 (npm, FFI en QuickJS, variádicas),
P2–P5 (PWA, servidor desplegable, ventana de escritorio, instalador). Y las dos
cosas del JIT que se anotaron en R1: la traza de error pierde las funciones
compiladas, y el presupuesto de instrucciones no mide lo mismo con y sin JIT.
