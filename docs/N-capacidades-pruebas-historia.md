# Ñ — capacidades, pruebas de estrés e historia

> Estado al **16 de octubre de 2026** (actualizado el mismo día con el `.elb` de varios archivos). Todo lo que dice «medido» o «pasa» se midió o se corrió de verdad. Lo que no
> se pudo comprobar lo dice. Las cifras de pruebas salen de correr `node motor/pruebas/todas.js` hoy, sobre una copia
> de `D:\ProyectosJS`.

---

## 1. Qué es Ñ, en una línea

Un lenguaje de programación **en español**, con verificador de tipos, máquina virtual de bytecode y un JIT que traduce a
JavaScript. Corre en el navegador, en la consola (Node o QuickJS), como app HTML de un solo archivo, como `.exe` de
Windows, y sus núcleos numéricos corren en C nativo y en GPU (C1EÑ).

```
léxico → gramática → verificador de tipos → bytecode → máquina de pila → JIT a JavaScript
                                                                      ↘ C1EÑ: C nativo / CUDA
```

| | |
|---|---|
| Fuentes del motor | 17 archivos en `motor/src`, **20.367 líneas** |
| Biblioteca | **661 entradas** en el libro (`referencia-stdlib.html`), cada una con su ejemplo ejecutado |
| eDSL | 8: `numerico`, `texto`, `fecha`, `formato`, `datos`, `estilo`, `probar`, `nen` |
| Ejemplos | 72 en `ejemplos/` (58 programas verificados + apps + ventana) |
| Licencia | Apache-2.0 |

---

## 2. Capacidades

### 2.1 El lenguaje
- **Tipos verificados antes de correr**: `entero`, `real`, `texto`, `bool`, `lista<T>`, `dic`, `fecha`, `tabla`,
  `arreglo`, `complejo`, `estilo`, funciones. Errores en español, con línea, columna y «¿querías decir…?».
- `var` / `fijo`, `fn` con tipos opcionales, cierres, `si / sino`, `mientras`, `para … en`, `romper`, `continuar`.
- **Excepciones**: `intentar / capturar / finalmente / lanzar`.
- `y` / `o` / `no` son operadores **o** nombres según el contexto; `usar`, `publico`, `como` y `de` no son reservadas.
- Constantes con sigilo que nadie puede tapar: `|PI`, `|E`, `|INFINITO`.
- `usar "clasico"` devuelve al ámbito global los 62 nombres de antes (compatibilidad por archivo) y `mudar.js` arregla
  los `usar` de un programa viejo.

### 2.2 La máquina
- Máquina de pila con **recolector de basura** propio y **JIT** que compila a JavaScript las funciones calientes.
- El JIT **ata** las nativas al compilar (mandelbrot 57 → 29 ms) y tira lo compilado si alguien redefine un nombre atado.
- `.elb`: bytecode serializado, con **seis comprobaciones** al cargarlo (un `.elb` manipulado no corre).
- E6 y E8 **no son dos versiones**: son dos formas de usar el mismo motor (sin eDSL / con eDSL por `usar`).

### 2.3 Los eDSL (bibliotecas que se piden con `usar`)
| eDSL | qué trae |
|---|---|
| `numerico` | estadística, matrices, primos, trigonometría, complejos, Fourier, dinero en el tiempo, el tipo `arreglo` |
| `texto` | acentos, eñes, orden alfabético en español, parecido entre textos |
| `fecha` | el tipo `fecha` y su aritmética, días hábiles |
| `formato` | números con coma decimal, moneda, porcentajes, cheques en letras |
| `datos` | el tipo `tabla`, CSV, agrupar y sumar, el formato `.ñdatos` |
| `estilo` | CSS como valores, anidamiento, medios, tokens de diseño, clases locales |
| `probar` | Ñ probándose con Ñ (792 pruebas del proyecto están escritas así) |
| `nen` (NEÑ) | 185 funciones: cálculo, ecuaciones, EDO, álgebra simbólica con racionales exactos, tensores, `einstein`, Fourier 2D, `paralelo` |

### 2.4 Dónde corre
| | IDE y app HTML | consola Node | consola QuickJS | `.exe` (empaquetar) |
|---|---|---|---|---|
| página, estilo, eventos, lienzo | sí | no | no | no |
| memoria entre ejecuciones y temporizadores | sí | no | no | no |
| red (`pedir`) | sí, con permiso por sitio | sí | no | sí |
| archivos, procesos, módulos `usar "x.esl"` | no | sí | sí | sí |
| código nativo (FFI, raylib) | no | sí, con koffi | no | sí |
| GPU / C nativo (C1EÑ) | jit | sí | no | jit (nativo/gpu con gcc/CUDA) |

Lo que no existe en un sitio **lo dice** en vez de fallar en silencio.

### 2.5 Las salidas
- **IDE** (`espanol-like-v4.html`): editor con tipos en vivo, consola, lienzo, página, y paneles de bytecode, JIT y memoria.
  El programa corre en un **marco aislado** (origen opaco); `hostil.esl` intenta escaparse y no puede.
- **App HTML de un archivo** (~470 KB) con `construir-app.js` o el botón «Exportar app». Cada app guarda en su propio
  almacén (`n:app:<título>:…`), aunque se abran desde el disco.
- **Binario `n` con QuickJS**: 1,14 MB, sin dependencias, arranca en 0,09 s.
- **`.elb` de un archivo o de varios** (`util/elb.js`): bytecode verificado, sin el código fuente. Con módulos sale un
  **paquete** (`ESLP`) que lleva el principal y cada módulo; corre con `n-node.js programa.elb` y en el IDE, y sale
  idéntico compilado en cualquier carpeta. Corre sin JIT, por diseño.
- **`.exe` de Windows** con `empaquetar.js`: Ñ + Node + tus `.esl` dentro; `--ventana` = sin consola, registro en
  `<nombre>.log` y errores en un cuadro de diálogo.
- **C1EÑ** (`c1en.html`, `--c1en`): el mismo motor con `numerico` y `nen` abiertos; `paralelo` corre en GPU → C → JIT.
- **Puente con Python** (`c1en/c1en.py`): funciones de Ñ que reciben y devuelven arreglos de NumPy.

### 2.6 Lo que se construyó encima
- **PSeInt sobre el motor de Ñ** (`PSeInt/`): la notación de PSeInt traducida a Ñ, sin código GPL.
- **ECOSIM-5 y ECOSIM-G v2**: mercado cerrado con conservación estricta de dinero, acciones y bienes; la versión G
  corre 1.000 economías en paralelo.
- **Hub de juegos web** (`hub/`): catálogo de los 40 juegos de `D:\Documents\Juegos`, búsqueda, favoritos, «Seguir jugando».
- **NEON FLAPPY Ñ** y **GALAGA Ñ**, en web y en escritorio.
- **ARCADE Ñ de escritorio** (`hub/escritorio/`): un `.exe` con menú, los dos juegos en una ventana raylib, récords en
  `%LOCALAPPDATA%\ArcadeÑ`.

---

## 3. Pruebas: la batería de hoy (16-oct)

`node motor/pruebas/todas.js`, con Chromium → **19 de 20 suites en verde, 1.910 pruebas pasan** (más 17 ejemplos en el
IDE y 44 casos de núcleos NEÑ), en 86 s.

| suite | qué prueba | resultado |
|---|---|---|
| motor | el lenguaje, la máquina, el recolector y el JIT | 232 ✓ |
| excepciones | intentar / capturar / finalmente / lanzar | 48 ✓ |
| web | el árbol de nodos de la página | 42 ✓ |
| estilos | el tipo estilo, medios, clases locales | 99 ✓ |
| interacción | eventos, identidad, memoria, temporizadores | 60 ✓ |
| serial | el formato `.elb` y su verificación | 61 ✓ |
| fuera | archivos, procesos, entrada | 33 ✓ (QuickJS no instalado aquí) |
| nativo | llamar a código compilado | 58 ✓, 2 saltadas |
| módulos | usar, publico, ámbito, ciclos, rutas | 64 ✓ |
| eDSL | el mecanismo de los eDSL nativos | 116 ✓ |
| en Ñ | 12 suites escritas en Ñ con `probar` | 792 ✓ |
| pseudocódigo | PSeInt corriendo en el motor | 45 ✓ |
| C1EÑ | núcleos en jit, C y GPU simulada, al bit | 88 ✓ |
| núcleos NEÑ | 34 núcleos en C contra su respaldo | 44 casos ✓ (21 al bit, 13 a pocos ulp) |
| perfil C1EÑ | el bundle con numerico y nen abiertos | 13 ✓ |
| empaquetar | un programa de varios archivos en un ejecutable, consola y ventana | 9 ✓ |
| aislado | el IDE entero en un Chromium de verdad | 108 ✓ |
| ejemplos | los ejemplos del selector, en la zona aislada | 17 de 17 ✓ |
| .elb varios | un programa con sus módulos en un solo `.elb` | 42 ✓ |
| apps | los 66 programas de `ejemplos/` con anfitrión completo | **65 de 66** ✗ |

- **La única roja ya fallaba antes** y no es del motor: el anfitrión falso de la prueba le pasa «ventas.csv» como primer
  argumento a `ecosim5.esl`, que espera un número (línea 207). Está anotado; no se ha arreglado.
- Pruebas de los juegos: Flappy web **11/11**, Galaga web **20/20**, ARCADE de escritorio **13/13**.

---

## 4. Pruebas de estrés pasadas

| # | qué se estresó | resultado | dónde |
|---|---|---|---|
| 1 | **JIT contra intérprete**: 5.000 programas aleatorios (aritmética, lógica, bucles, listas) | **0 diferencias** (antes del arreglo de `**`: 57) | 9-oct |
| 2 | **IDE con 64 temporizadores** de 20 ms | peor congelación **15 ms** (antes: 29 s) | 9-oct |
| 3 | **Aislamiento**: `hostil.esl` intenta salirse del marco | no sale; aislado 101/101 | 15-oct |
| 4 | **C1EÑ en 2× Tesla T4 reales** (Kaggle) | suite GPU completa; mismos bits en jit, C y GPU en aritmética básica; trascendentes < 1e-14 | 13-oct |
| 5 | **Fuzz de núcleos**: 300 núcleos aleatorios | mismos bits en jit, nativo y GPU | 13-oct |
| 6 | **ECOSIM-G**: 1.000 economías en paralelo | 51,9 ms por tick en 2 vCPU; tráfico PCIe de 1.940 MB a **0,4 MB** con arreglos residentes; invariantes de dinero intactos | 13-oct |
| 7 | **Precisión de NEÑ** contra mpmath | derivadas 10–13 cifras, integrales ~1e-12, especiales 1e-14 a 1e-16 | 13-oct |
| 8 | **C nativo con 2 hilos** contra el JIT | mandelbrot ×2,1 · Monte Carlo π ×3,6 · n-cuerpos ×4,8, bits idénticos | 13-oct |
| 9 | **GALAGA Ñ web** (Chromium) | 0,9 ms por cuadro, ~890 llamadas de dibujo, 61 fps; CPU ×4 más lenta → 60 fps; ×6 → 46 fps | 15-oct |
| 10 | **GALAGA Ñ escritorio** (raylib, sin GPU) | ~1.200 figuras en 2 ms por cuadro; 1.743 figuras con 300 partículas a 60 fps; 4.000 cuadros seguidos sin límite hasta perder | 16-oct |
| 11 | **Llamada nativa** desde Ñ | `DrawRectangle` ~0,9 µs por llamada contando raylib | 16-oct |
| 12 | **Dos apps desde el disco** en el mismo navegador | no se pisan lo guardado (11d2, 4 pruebas) | 15-oct |
| 13 | **Récords dañados** en el arcade | el arcade arranca igual y lo dice | 16-oct |
| 14 | **Paquete `.elb`**: los 796 prefijos truncados y 3.000 mutaciones al azar | todos los truncados rechazados; 2.578 mutaciones rechazadas, 422 aceptadas, **0 errores internos** | 16-oct |
| 15 | **ARCADE desde un solo `.elb`** (5 archivos, sin JIT) | 2,4 ms por cuadro con ~1.300 figuras (1,6 ms desde el fuente con JIT) | 16-oct |

### Velocidad contra otros lenguajes (en tu PC, 14-oct)

| | fib | criba | mandelbrot |
|---|---|---|---|
| C | 1 ms | 3 ms | 19 ms |
| Julia | 4 | 4 | 18 |
| JavaScript | 10 | 101 | 22 |
| **Ñ** | **23** | **256** | **31** |
| Python | 103 | 252 | 634 |

En mandelbrot Ñ está a 1,4× de JavaScript y es 20 veces más rápido que Python. La criba es lenta por 2 millones de
`agregar` y porque `arreglo` aún no tiene `[]`: ese es el próximo arreglo de velocidad. El núcleo C1EÑ nativo empata con
Rust (26 ms en 1 hilo, 13 ms en 2).

### Binario QuickJS contra Node
| | binario `n` | Node |
|---|---|---|
| tamaño | **1,14 MB** | 119 MB |
| arranque (20 veces) | **0,09 s** | 1,15 s |
| CSV de 20.000 filas | 461 ms | **76 ms** |
| mandelbrot 600×400×200 | 12,5 s | **92 ms** |

---

## 5. Historia

### Antes de Ñ: Español-Like v3
Una sola página HTML (`index.html`, «v3.0»). Un diccionario de **93 palabras en español → Python** y un botón «Traducir»
que reescribía el texto palabra por palabra. «Ejecutar» usaba un evaluador mínimo en JavaScript; el 27-sep no
corría ninguno de sus 5 ejemplos. Las versiones anteriores (E1–E5) eran la misma idea con más palabras; no hay archivos de
ellas.

### El salto: reescribir desde cero
No fue agrandar el diccionario: fue un **lenguaje de verdad**, con su propia tubería, y Python desapareció del todo.

| fecha (2026) | qué pasó |
|---|---|
| 27-sep | Se muestra Español-Like v3. Se escribe **Ñ v4**: VM de bytecode + JIT |
| 28-sep | Aislamiento padre/hijo, `.elb`, biblioteca estándar, DSL web, **se llama Ñ**, excepciones, corre en QuickJS, estilo como valores, auditoría web, apps exportadas, red, archivos y procesos |
| 29-sep | **Módulos** (`usar` / `publico`) y **FFI** a bibliotecas nativas (raylib). Licencia **Apache-2.0** |
| 30-sep | «El libro» (`referencia-stdlib.html`); el JIT ata las nativas (×1,97); nacen los nombres **E6 / E8** |
| 4-oct | Primer push de v4 a GitHub: «Ñ 4.0: motor, 7 eDSL, 58 ejemplos verificados y la gramática con pruebas» |
| 5–7-oct | **PSeInt** corriendo en el motor de Ñ |
| 9-oct | Depuración: `**` bajo el JIT, `(a) y (b)`, temporizadores que congelaban el IDE; fuzz de 5.000 programas |
| 13-oct | **C1EÑ** y **NEÑ**; probado en 2× Tesla T4; ECOSIM-G v2 con arreglos residentes en la GPU |
| 14-oct | Velocidad contra 6 lenguajes; **`empaquetar.js`**: un programa de Ñ como `.exe` de Windows |
| 15-oct | Hub de juegos en Ñ, NEON FLAPPY Ñ, GALAGA Ñ, `letra()` en el lienzo, almacén separado por app |
| 16-oct | **ARCADE Ñ de escritorio**: un `.exe` con menú, Flappy y Galaga en una ventana raylib. **El `.elb` de varios archivos** (paquete `ESLP`) |

### Decisiones que marcaron el camino
- **Un eDSL se gana el sitio cuando quita una clase de error**, no cuando ahorra teclas. Por eso la biblioteca no está toda
  en el ámbito global.
- **Lo que no existe en un sitio lo dice.** `pintar()` en la consola avisa; `nativa` sin koffi avisa.
- **Lo nuevo va del lado del anfitrión, no del núcleo** (tu regla del 15-oct): si se rompe, se rompe el HTML o la biblioteca,
  no el motor E8. Cada cambio queda en `hub\BITACORA.md`.
- **El FFI es un agujero a propósito**: solo existe en la consola y en el `.exe`, nunca en una página.
- **Medir antes de optimizar**: las guardas de tipo del JIT parecían el cuello de botella y no lo eran; las llamadas sí.

---

## 6. Lo que falta (honesto)
- **Velocidad**: `arreglo` con `[]` y `listaDe(valor, n)`; que el JIT acepte cierres (hoy una llamada a un cierre cuesta
  hasta 88× lo de JavaScript).
- **Lienzo web para juegos**: polígonos y rotación, sonido, imágenes, `pulsada("tecla")` en el anfitrión web.
- **Avisos del verificador**: una variable local que tapa un módulo (`para p en …` con `usar … como p`) y una `fn` que
  tapa una función de la biblioteca pasan sin avisar.
- **Módulos**: renombrar al importar, importar solo por efecto. (El `.elb` de varios archivos ya está; falta que `n.js`
  de QuickJS cargue paquetes y que `empaquetar.js` pueda llevar el paquete en vez del texto.)
- **Trazas de error**: nombran la función y la línea, pero no el archivo del módulo.
- **Sin probar**: la mitad QuickJS de `fuera` y `módulos` (QuickJS no está instalado en la nube); el benchmark real de la
  T4; el `.exe` del ARCADE en un Windows de verdad.
- **Pendiente conocido**: `apps` → `ecosim5.esl`; `arreglo([3e200, 4e200])` deduce `entero` y da ceros.
