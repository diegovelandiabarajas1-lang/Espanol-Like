# Bitácora de hub\ — qué se tocó, qué se probó, qué se rompió

Regla de esta carpeta: **nada de aquí toca el motor** (`motor\src\`, `motor\bundle*.js`, `motor\ide\`). Todo es programas
en Ñ, construidos a HTML con las herramientas que ya existían. Si algo se rompe, se rompe un HTML, no Ñ.

## 2026-10-15 · hub de juegos + NEON FLAPPY Ñ
**Tocado (nuevo):** `hub\generar-hub.esl`, `hub\hub-plantilla.esl`, `hub\hub.esl` (generado), `hub\construir.cmd`,
`hub\probar.cmd`, `hub\LEEME.md`, `hub\juegos\flappy\flappy.esl`, `hub\juegos\flappy\prueba.js`,
`hub\juegos\flappy\LEEME.md`. Salidas: `D:\Documents\Juegos\hub.html`, `D:\Documents\Juegos\N\flappy.html`.
**Motor:** sin cambios. Construido con el `bundle.js` del commit `12ea6ed` (13-oct).
**Carpeta de juegos:** sin cambios en lo que había; solo se añadieron `hub.html` y `N\`. `home.html` y `main.html` siguen.

**Probado:**
- Hub en Chromium: 39 tarjetas · buscar «snake» → 2 · Combate → 10 · favorito sobrevive a recargar · JUGAR abre game10.html
  (2048 NEON X) · «Seguir jugando» aparece al volver · 0 errores.
- Flappy sin navegador (`prueba.js`): 11 de 11, corrido 8 veces seguidas (los tubos son al azar).
- Flappy en Chromium: 62 fps, teclas, muerte, reinicio, 0 errores.

**Se rompió / se encontró:**
- Al principio la prueba del piloto fallaba 1 de cada 3 veces: no por el juego, sino porque si el piloto no moría en 40 s
  la marca nunca se guardaba. Ahora la prueba lo deja caer al final. Lección: una prueba con azar necesita un final cierto.
- El contador de fps de la primera medición daba 125: contaba también el suelo, que mide 420 de ancho como el fondo.
  Medido bien: 62. Lección: comprobar qué se está contando antes de creer el número.
- Nada roto en el motor ni en los juegos existentes.

**Pendiente que salió de aquí:** la tabla «lo que le falta al lienzo» en `juegos\flappy\LEEME.md`.

## 2026-10-15 (2) · Flappy a pantalla completa
**Diego probó en su PC: FUNCIONÓ.** Pegas: resolución fija, no llenaba la pestaña, se veía chiquito.
**Tocado:** `hub\juegos\flappy\flappy.esl` (mundo de 540×960 en vez de 420×600, físicas reescaladas, y cuatro reglas
`estiloGlobal` que sacan el lienzo de su caja: fijo, centrado, tan alto como la pestaña o tan ancho como quepa, siempre
9:16, `body` sin margen ni scroll, consola oculta), `hub\juegos\flappy\prueba.js` (constantes nuevas y el marcador
final se lee del último cuadro). Salida: `D:\Documents\Juegos\N\flappy.html`.
**Motor:** sin cambios. El lienzo sigue sin saber el tamaño de la ventana; lo resuelve CSS desde Ñ con `estiloGlobal`,
que ya existía.
**Probado:** `prueba.js` 11 de 11, doce veces seguidas. Chromium en tres tamaños: 1366×768 → lienzo 432×768 centrado;
1920×1080 → 608×1080; teléfono 390×844 → 390×693 (lo limita el ancho). Sin desbordamiento, 0 errores.
**Se rompió:** la prueba volvió a fallar a veces: el punto y el choque pueden caer en el mismo cuadro, y el marcador se
leía antes de la muerte. Ahora se lee del último cuadro dibujado. Nada roto en el motor ni en el hub.

## 2026-10-15 (3) · letra() en el lienzo + GALAGA Ñ
**Esta vez SÍ se tocó el motor, y así:** el comportamiento nuevo está entero en el anfitrión HTML; en el motor hay
**una línea**, la declaración, porque el verificador de tipos tiene que conocer el nombre `letra` para no rechazar el
programa. Es un paso directo al anfitrión, igual que `color()` y `grosor()`: en la consola (E8 sin lienzo) `letra` da
el mismo error que `rect`, «necesita un anfitrión con lienzo».

Tocado en el motor, contra lo que había en tu disco:
| archivo | cambio |
|---|---|
| `motor\src\04-stdlib.js` | +1 línea: `gfx('letra', '... -> nulo', …)` |
| `motor\ide\anfitrion.js` | +26 −3: estado `letra` del lienzo (por defecto 12 px sans a la izquierda, como siempre), `letra()` con errores en español, `escribirEn` que la usa, y se reinicia en cada ejecución |
| `motor\util\ejemplos-biblioteca.js` | +1: el ejemplo de `letra` para el libro (el guardia exige uno por función) |
| `motor\util\referencia.js` | ±1: su línea de «efecto» |
| `motor\util\correr-ejemplos.js` | ±1: el anfitrión de mentira de la suite apps aprende `letra` |
| `motor\pruebas\aislado.js` | +18: sección «6b. letra() en el lienzo», 5 pruebas en Chromium |
Reconstruidos con las herramientas de siempre: `motor\bundle.js`, `motor\bundle-c1en.js`, `espanol-like-v4.html`,
`c1en.html`, `motor\publicar-ide.html`, `motor\publicar-c1en.html`, `referencia-stdlib.html`.

**Antes de tocar nada** se reconstruyó el bundle desde tus fuentes y salió **idéntico byte a byte** al de tu disco, y se
corrieron las 18 suites: 16 en verde, 1 saltada (empaquetar, falta postject aquí) y **1 que ya fallaba**: `apps` →
`ecosim5.esl`, porque el anfitrión de mentira le pasa `ventas.csv` como primer argumento y ecosim5 espera un número
(`entero(argumentos()[0])`, línea 207). No es de este cambio; queda anotado para arreglarlo aparte.

**Después del cambio:** las mismas 18 suites dan lo mismo, más 5 pruebas nuevas en `aislado` (92 → 97). Nada nuevo roto.
Pruebas de letra: sin `letra()` el lienzo sigue a `12px sans-serif` y a la izquierda; `letra(40, "centro",
"negrita mono")` llega al lienzo como `bold 40px … monospace` centrado y pinta píxeles; una alineación inexistente da
«la alineación es «izquierda», «centro» o «derecha»»; al volver a ejecutar, la letra vuelve a la de siempre.

**Flappy:** el marcador pasó de la página al lienzo con `letra`. `prueba.js` 11/11, ocho veces.

**GALAGA Ñ** (nuevo: `hub\juegos\galaga\`): 40 enemigos en sprites de píxeles, picadas, disparos, partículas,
estrellas, olas, panel de rendimiento con P. `prueba.js` 20/20, tres veces. Medido en Chromium (detalle en su LEEME):
0,9 ms por cuadro jugando, ~890 llamadas de dibujo, 61 cuadros en pantalla; con la CPU 4 veces más lenta 3,4 ms y 60
en pantalla; a ×6, 46.

**Se rompió por el camino (en las pruebas, no en el juego):**
- Las 5 pruebas de `letra` se pusieron primero en la sección 5 de `aislado` y rompieron dos de la sección 6: esa sección
  mira los paneles del ÚLTIMO programa ejecutado, y ya no era el suyo. Se movieron a una sección propia, 6b.
- La prueba de Galaga leía el panel de la página, que solo se repintaba cada 30 cuadros: pedía «ola 2» y veía «ola 1».
  Ahora el juego repinta el panel al cambiar de ola o de vidas.
- Leía también el cuadro anterior en vez del último: «FIN DEL JUEGO» se dibuja en el mismo cuadro en que muere la nave.
- El cartel «OLA 2» se confundía con el «OLA 2» del marcador; el cartel ahora dice «¡OLA 2!».
- Hub: con `N\` primero en orden alfabético, la 3.ª tarjeta pasó a ser `game1-supabase.html`, que intenta conectarse
  a Supabase por red: ese error de consola es del juego, no del hub.

## 2026-10-15 (4) · las apps se pisaban lo guardado
**Lo encontró Diego:** Flappy mostraba MEJOR 6090, que era la marca de Galaga.
**Causa:** una app exportada abierta con doble clic vive en `file://`, y el navegador da **un solo localStorage a
todos los archivos locales**. La plantilla de apps guardaba todo bajo `n:app:<clave>`, sin decir de qué app, así que
las dos guardaban en `n:app:mejor`. El comentario de la plantilla decía que cada app «tiene un origen de verdad y
localStorage propio»: era cierto servida desde una web, falso abierta desde el disco. Reproducido antes de arreglar:
con la plantilla vieja, dos apps distintas → la segunda lee lo que guardó la primera.
Lo mismo pasaba con los permisos de red (`n:perm:`): decir «sí» a un sitio en una app se lo concedía a todas.
**Tocado:** `motor\ide\app.html` (la plantilla de apps; el motor NO): ahora guarda bajo
`n:app:<título de la app>:<clave>` y los permisos bajo `n:perm:<título>:`. Reconstruir una app con el mismo título
conserva lo guardado; otra app no lo ve. `motor\pruebas\aislado.js`: la prueba de 11d busca la clave con el nombre de
la app, y una sección nueva **11d2** construye dos apps con `construir-app.js`, las abre desde `file://` en el mismo
navegador y comprueba que no se ven (4 pruebas; 97 → 101). Reconstruidos `espanol-like-v4.html`, `c1en.html`,
`motor\publicar-*.html` (llevan la plantilla dentro), `N\flappy.html`, `N\galaga.html` y `hub.html`.
**Batería completa:** igual que antes + 4; la única roja sigue siendo `apps` → ecosim5.esl, que ya fallaba.
**Lo que se pierde:** las marcas y los favoritos guardados antes de hoy quedan bajo la clave vieja `n:app:mejor` y
ninguna app la vuelve a leer. Flappy y Galaga empiezan otra vez en 0, y el hub sin favoritos. No hay forma de saber a
qué app pertenecía cada clave vieja, y adivinarlo sería repetir el mismo fallo.
**Lección:** «origen propio» depende de cómo se abre el archivo. Lo que se probó (una app sola en la pestaña) no podía
ver el fallo: hacían falta dos apps en el mismo navegador.

## 2026-10-16 (5) · ARCADE Ñ de escritorio: un .exe con el menú, Flappy y Galaga
**Pedido:** el hub y los juegos hechos en Ñ como app de Windows (la «nueva tecnología» de `empaquetar.js --ventana`),
no como página. Elegido por Diego: **un solo .exe** (el menú en la ventana; los juegos dentro; Esc vuelve) y **solo
los juegos hechos en Ñ** (los 38 de JavaScript se quedan en el hub web).
**Nuevo:** `hub\escritorio\` — `arcade.esl` (menú y bucle), `lib\pantalla.esl` (raylib por FFI con la API del lienzo
web), `lib\records.esl` (récords en `%LOCALAPPDATA%\ArcadeÑ\records.json`), `juegos\flappy.esl`, `juegos\galaga.esl`,
`prueba.js`, `construir.cmd`, `jugar.cmd`, `probar.cmd`, `LEEME.md`.
**No tocado:** el motor (`motor\src`, bundle, plantilla), `empaquetar.js`, `ejemplos\lib\ventana.esl`, el hub web y
los juegos web. La versión web de Flappy y Galaga sigue igual; las de escritorio son hermanas, no reemplazos.
**Cómo se pasó un juego:** `pantalla.esl` tiene `color/rect/circulo/linea/punto/grosor/letra/escribirEn` con la forma
de la web, así que el dibujo se copió con `p.` delante. Lo que cambió: (1) el teclado se pregunta cada cuadro
(`pulsada`/`sostenida`) en vez de recibir eventos —en Galaga desaparecen `pulsar`, `soltar` y la lista `sostenidas`—;
(2) no hay página: `ver()` desaparece y los carteles de Flappy pasan al lienzo; (3) `guardar/recuperar` → `records.esl`.
**Detalles de raylib que hubo que resolver (en la biblioteca, no en el motor):**
- Esc cerraba la ventana (raylib lo trae así): `SetExitKey(0)` y lo decide el arcade.
- Escala: cámara 2D de raylib (estructura por valor) + recorte; mundo 540×960 como en la web.
- Letra: TTF del sistema con Latin-1 + flechas, la lista de caracteres pedida a `LoadCodepoints` (Ñ no tiene punteros
  a listas). **Corrección a algo que dije antes:** la letra por defecto de raylib SÍ tiene Ñ y tildes (Latin-1); lo malo
  es que es diminuta. Se usa solo si no aparece ninguna TTF.
- Color como un entero de 32 bits (estructura de 4 bytes = entero en x64): ~0,9 µs por `rect` contando raylib.
**Probado (en la nube, raylib 5.5 de Linux con pantalla virtual):** `prueba.js` 13/13 — menú → Galaga (dispara, suma,
~1200 figuras, 2 ms por cuadro de Ñ + raylib en un procesador sin GPU) → Esc → Flappy (cae sin aletear) → Esc → Galaga
hasta perder → el récord queda en el archivo; un récord previo no se pisa; un JSON roto no tumba el arcade. Además
empaquetado con `empaquetar.js --ventana` (versión Linux, 119 MB): los 5 .esl van dentro, corre desde otra carpeta y
escribe `arcade.log`. **En Windows no se pudo probar desde aquí:** `construir.cmd` y `probar.cmd` son lo primero.
**Se rompió por el camino:**
- `texto no es una función` al empezar a disparar en Galaga. Causa: en la web las partículas se recorrían con
  `para p en particulas`, y al poner `p.` delante del dibujo, `p.color(p["color"])` usaba la PARTÍCULA, no el módulo
  `p`: una variable local tapa el alias del módulo, y `p.color` sobre un diccionario es `p["color"]` (un texto).
  El comprobador de tipos no lo avisó. Arreglo: la variable se llama `pa`. **Para el motor (pendiente, no tocado):** un
  local que tapa un alias de módulo debería ser aviso.
- La miniatura de Galaga en el menú, dibujada a mano, no se parecía a nada: ahora cada juego dibuja la suya
  (`miniatura(x, y)`) con sus propios sprites.
**Lo que se pierde:** nada. Los récords de escritorio empiezan en 0 (los de la web están en el navegador).

## 2026-10-16 (6) · el .exe hecho en la nube, sin pasar por tu PC
**Pedido:** «dámelo» (el .exe ya hecho). **Hecho:** `arcade.exe` construido desde Linux con el `node.exe` OFICIAL de
Windows (v22.22.0, firmado por OpenJS Foundation, firma verificada) y koffi para win32-x64, los dos sacados de npm; la
`raylib.dll` es la tuya de `dist\principal\`. Es el mismo `empaquetar.js` con cinco cambios para apuntar a ese Node (copia
solo en la nube, no está en tu disco). Entregado en `dist\arcade-entrega\` partido en dos (el puente a tu disco acepta
hasta 30 MB por archivo) con `armar.cmd`, que une, comprueba la huella SHA-256 y descomprime.
**Probado:** un programa mínimo empaquetado así corre bajo Wine (Windows simulado en Linux); `node.exe` + koffi +
`raylib.dll` también abren una ventana bajo Wine.
**No probado / se rompió:** el ARCADE completo **se quedó congelado bajo Wine** al cargar los módulos de los juegos, sin
mensaje; con solo `pantalla.esl` sí corría. No encontré la causa (paré a pedido de Diego). Puede ser cosa de Wine o no.
**Si se congela en tu Windows:** ciérralo con el Administrador de tareas y usa `hub\escritorio\construir.cmd`, que lo
construye con tu Node (el camino que ya funcionó con el contador). Y anota aquí qué pasó.
**Sin tocar:** el motor, `empaquetar.js` de tu disco, los juegos.

## 2026-10-16 (7) · el .elb de varios archivos
**Pedido:** «haz lo que acordamos: el .elb de varios archivos» (estaba en «Lo que falta» del LEEME y del documento de
capacidades). **Hecho, sin tocar el motor** (`motor\src` y `bundle.js` idénticos, comprobado byte a byte):
- `motor\util\paquete-elb.js` (nuevo): el formato **ESLP** — el principal y cada módulo, cada uno un `.elb` de siempre
  con su ruta delante. Arma, lee y verifica. Corre en Node, en el navegador y en QuickJS (sin Buffer ni require).
- `motor\util\elb.js` (nuevo): `node motor\util\elb.js programa.esl` → `programa.elb`. Sin módulos de archivo da el
  `.elb` de siempre; con módulos, el paquete. `--texto` (base64), `--ver` (qué lleva), `--avisos`.
- `motor\util\n-node.js`: ahora corre `programa.elb` y `programa.elb.txt` (de uno o de varios archivos).
- `motor\ide\hijo.html` + `motor\util\construir-ide.js`: el IDE lleva el lector, y «Importar y ejecutar» acepta paquetes.
  Reconstruidos `espanol-like-v4.html`, `c1en.html`, `motor\publicar-ide.html`, `motor\publicar-c1en.html`.
- Pruebas: `motor\pruebas\elb-varios.js` (nueva, 42) en `todas.js`; sección **11a** en `aislado.js` (7 más).
- Docs: `LEEME.md` (sección «Varios archivos en un solo .elb»), `motor\ARQUITECTURA.md` (el paquete), el documento de
  capacidades.
**La idea clave:** el bytecode lleva escrita la clave de cada módulo, y la clave la pone el anfitrión. `elb.js` compila
con rutas relativas a la carpeta del principal (`lib/pantalla.esl`), así que el paquete no lleva nada de tu máquina y
sale igual compilado en cualquier carpeta (hay prueba que lo compara byte a byte). Y correr varios módulos ya existía
en el motor (`correr(fn, avisos, modulos)`): «usar» busca el módulo en un registro, no en el disco.
**Probado:** batería completa con Chromium: **19 de 20 suites en verde** (la roja es la de siempre, `apps` →
`ecosim5.esl`); aislado 108/108, ejemplos 17/17, .elb varios 42/42. El ARCADE de escritorio entero como un solo
`arcade.elb` (52 KB, 5 archivos) corre con el guion: 2,4 ms por cuadro sin JIT contra 1,6 con JIT.
**Se rompió por el camino:** en el IDE, un paquete guardado en base64 (`.elb.txt`) no cargaba: el IDE manda cualquier
archivo en base64, así que llegaba base64 de base64. El `.elb` de siempre lo resolvía por dentro; el lector del
paquete no. Arreglado en `paquete-elb.js` (decodifica una vez más si hace falta) y lo cubre la prueba 11a.
**Visto y NO tocado (es del motor):** (1) la traza de un error dentro de un módulo nombra la función y la línea, pero
no el archivo —igual desde el fuente—; (2) `serializar` del motor sigue diciendo «un programa que importa archivos
todavía no se puede guardar como .elb»; en la consola nadie lo llama ya y en el navegador no se llega ahí, pero el
mensaje podría apuntar a `util/elb.js` (una línea de `04-stdlib.js`, si quieres). (3) `n.js` (QuickJS) no carga
paquetes todavía: QuickJS no está en la nube para probarlo.
**Lo que cuesta:** un `.elb` corre sin JIT (regla del formato, a propósito).
