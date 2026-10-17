# hub — ARCADE Ñ, el hub de juegos escrito en Ñ

Los juegos viven en `D:\Documents\Juegos` (HTML5, en JavaScript) y siguen ahí tal cual. Lo que está en Ñ es el hub:
la página que los lista, busca, agrupa por categoría, guarda favoritos y recuerda a qué jugaste.

## Archivos
- `BITACORA.md` — cada cambio: qué se tocó, qué se probó, qué se rompió. Léela antes de seguir.
- `juegos\flappy\` — el primer juego en Ñ, con su prueba sin navegador y la lista de lo que le falta al lienzo.
- `juegos\galaga\` — el segundo: la prueba de rendimiento (P abre el panel), con sus cifras medidas.
- `generar-hub.esl` — programa de consola. Recorre la carpeta de juegos, saca el `<title>` de cada `.html` que esté en
  una subcarpeta (los de la raíz son páginas del hub viejo), le asigna categoría por carpeta y escribe `hub.esl`.
- `hub-plantilla.esl` — la app. Tiene la línea `fijo JUEGOS = []  # <<CATALOGO>>` que el generador reemplaza.
  Todo el estilo es del eDSL `estilo`; no hay CSS externo.
- `hub.esl` — generado; no lo edites a mano (se pisa).
- `construir.cmd` — construye los juegos en Ñ dentro de `D:\Documents\Juegos\N\`, genera el catálogo y deja `hub.html`.
- `probar.cmd` — corre las pruebas de los juegos en Ñ (sin navegador).
- `escritorio\` — **el ARCADE Ñ como app de Windows**: un `arcade.exe` con el menú, Flappy y Galaga en una ventana
  (raylib). Solo los juegos hechos en Ñ. Ver `escritorio\LEEME.md`; se construye con `escritorio\construir.cmd`.

## Por qué el catálogo va dentro del programa
Una app exportada corre desde `file://` y el navegador no la deja leer carpetas ni pedir archivos. Quien lee la carpeta es
`generar-hub.esl`, en consola, donde `listar` y `leerTexto` sí existen. Si añades un juego, vuelves a correr `construir.cmd`.

## Qué comprobé en Chromium (sin cabeza)
40 tarjetas al abrir · buscar «snake» → 2 · categoría Combate → 10 · marcar favorito y recargar → sigue marcado ·
JUGAR abre `Retro/Game One Player/game10.html` (título 2048 NEON X) · al volver aparece «Seguir jugando» · 0 errores.

## Límites
- `pintar` fabrica DOM real desde nodos de Ñ, pero no admite `<iframe>`: los juegos se abren en la misma pestaña y se vuelve
  con «atrás». Es a propósito (el eDSL web no deja incrustar páginas ajenas).
- Categorías: «Game One Player» → Un jugador, «Games Combat» → Combate, «Pasiv» → Simuladores, «Support» → Guías, «N» → Hechos en Ñ.
  Una carpeta nueva sale con su propio nombre; para ponerle nombre bonito, añádela al diccionario `CATEGORIAS` del generador.
