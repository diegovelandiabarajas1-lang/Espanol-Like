# NEON FLAPPY Ñ — el primer juego portado a Ñ

Original: `Retro/Game One Player/game12.html` (JavaScript, 545 líneas). Versión en Ñ: `flappy.esl` (170 líneas).
Se construye con `hub\construir.cmd` y queda en `D:\Documents\Juegos\N\flappy.html`; el hub lo lista en «Hechos en Ñ».

Controles: espacio, ↑ o W para aletear; clic o toque también. Al morir, cualquiera de ellos reinicia.

## Cómo está hecho con lo que el lienzo YA tiene
- Mundo y físicas en Ñ puro: gravedad, salto, tubos en una lista de diccionarios, choque por rectángulos.
- Dibujo con `rect`, `circulo`, `linea`, `punto`, `color`, `grosor`, `escribirEn`. Un cuadro cada `cada(16, paso)` → 62 fps medidos en Chromium.
- Tamaño: el lienzo es de 540×960 por dentro (9:16) y cuatro reglas `estiloGlobal` lo estiran a la altura de la pestaña
  (o al ancho, en un teléfono), centrado y sin scroll. El juego no sabe cuánto mide la ventana; CSS lo adapta.
- Marcador: en el lienzo, con `letra(84, "centro", "negrita mono")`. Los carteles de inicio y final siguen en la página.
- Entrada: el lienzo no es un nodo y no recibe teclas ni clics. Solución sin tocar el motor: un `div` que cubre toda la
  ventana (`position: fixed; inset: 0`), con `tabindex` y `autofoco`, que escucha `alPulsarTecla` y `alHacerClic` y se
  queda con el foco. Es transparente, así que el lienzo se ve debajo.
- La mejor marca se guarda con `guardar("mejor", …)` y sobrevive al cerrar la pestaña.

## Lo que le falta al lienzo para juegos (lo que este port enseñó)
| Falta | Cómo lo sorteó el juego | Qué haría falta en el anfitrión HTML |
|---|---|---|
| ~~Tamaño y tipo de letra en `escribirEn`~~ **hecho el 15-oct: `letra(tamaño, alineación, estilo)`** | el marcador ya va en el lienzo | — |
| Teclas y clics sobre el lienzo | capa transparente con foco | que el lienzo pueda registrar `alPulsarTecla`/`alHacerClic`, o un `teclas()` que diga qué está pulsado |
| Imágenes / sprites | todo son figuras | `imagen(ruta)` + `dibujarImagen(img, x, y, w, h)` |
| Sonido (el original usa AudioContext para el aleteo y el choque) | sin sonido | `tono(frecuencia, ms)` y `sonido(ruta)` |
| Transparencia, degradados, rotación, brillo (el original usa `shadowBlur`) | colores planos | `opacidad(a)`, `brillo(color, px)`, `rotar(grados)` |
| Pantalla completa / tamaño según la ventana | lienzo fijo de 540×960 estirado con `estiloGlobal` | `lienzo("ventana")` o `tamanoVentana()` para dibujar a resolución real |
| Toques con deslizamiento | solo clic | eventos de puntero |

Ninguna de estas faltas se añadió al motor en este paso: la regla es «primero jugar con lo que hay, documentar lo que
falta, y añadir después lo que de verdad pida un juego», y cada añadido iría en el anfitrión HTML (`motor/ide/anfitrion.js`
+ la firma en la biblioteca), no en el núcleo.

## Pruebas
`node hub\juegos\flappy\prueba.js` (o `hub\probar.cmd`): 11 pruebas sin navegador, con un anfitrión de mentira que lleva el
reloj y anota lo que se dibuja. Un piloto automático lee del lienzo dónde está el pájaro y el hueco del tubo y juega:
tiene que pasar al menos 5 tubos (suele pasar 15–19 en 25 s). Comprueba también que sin aletear se muere, que un clic
reinicia, que el cartel final y el lienzo dicen los mismos puntos, que la marca queda guardada y que el hueco se estrecha.
Los tubos salen al azar, así que la prueba fuerza el final dejándose caer si el piloto sigue vivo a los 25 s.

En Chromium real (Playwright): carga en ~430 ms, lienzo 540×960 que llena la pestaña en 1366×768, 1920×1080 y 390×844, espacio da foco a la capa y aletea, al soltarlo muere,
el clic tras morir reinicia, 62 cuadros por segundo, 0 errores en consola.
