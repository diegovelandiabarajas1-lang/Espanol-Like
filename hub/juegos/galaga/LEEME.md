# GALAGA Ñ — la prueba de rendimiento y de dibujo

Inspirado en `Retro/Game One Player/game2.html`; escrito de cero en Ñ (`galaga.esl`, ~560 líneas). Se construye con
`hub\construir.cmd` y queda en `D:\Documents\Juegos\N\galaga.html`.

**Teclas:** ← → o A D para mover · espacio, ↑ o W para disparar (se puede dejar pulsado) · **P** abre el panel de
rendimiento · con el panel abierto, **X** suelta 300 partículas de golpe y **N** salta a la siguiente ola.

## Qué tiene
40 enemigos por ola en tres clases (abejas, mariposas, jefes de dos golpes que cambian de color al ser heridos), que
entran en curva desde los costados, forman, se mecen, y bajan en picada disparando a la nave. Tres vidas, invulnerable
un par de segundos tras cada golpe, olas cada vez más agresivas, explosiones de partículas, 120 estrellas en tres
capas de velocidad, marca máxima guardada. Todo el texto (marcador, carteles, panel) se escribe EN el lienzo con `letra()`.

## Cómo se dibuja (y por qué así)
Los sprites son filas de letras (`"..a.....a.."`), una letra por color. Al arrancar, `construirSprite` las convierte en
**tramos horizontales del mismo color agrupados por color**: un enemigo de 11×8 píxeles se dibuja con ~15 `rect` y ~3
`color` en vez de 60 y 60. Es la optimización que más pesa, y es de las que se hacen en el programa, no en el motor.

## Medido
Las cifras salen del propio juego: con P, el juego mide con `reloj()` cuánto tarda cada cuadro (lógica + órdenes de
dibujo) y cuenta sus llamadas de dibujo. «Pantalla» se midió aparte, contando `requestAnimationFrame`.

| Chromium, lienzo 540×960 | ms por cuadro (medio / máx) | llamadas de dibujo | cuadros por segundo | en pantalla |
|---|---|---|---|---|
| CPU normal, jugando | 0,9 / 2,3 | ~890 | 63 | 61 |
| CPU normal, +900 partículas | 1,1 / 4,6 | ~2.670 | 62 | — |
| CPU ×4 más lenta, jugando | 3,4 / 8,4 | ~840 | 63 | 60 |
| CPU ×4, +900 partículas | 4,3 / 10,9 | ~2.540 | 60 | — |
| CPU ×6 más lenta | 5,8 / 16,4 | ~1.200 | 62 | 46 |

El presupuesto de un cuadro a 60 fps son 16,7 ms. Con la CPU frenada 4 veces Ñ usa una cuarta parte; a ×6 el
**cuadro peor** ya roza el límite y la pantalla baja a 46 cuadros. Tu i3 de 11.ª generación debería quedar entre ×1 y
×4 de la máquina donde se midió; la cifra de verdad es la que te dé P en tu PC.

Lo que **no** mide `ms`: el trabajo del navegador de pasar el lienzo a la pantalla (eso va después, fuera de Ñ). Por
eso se contrastó con «en pantalla».

## Pruebas
`node hub\juegos\galaga\prueba.js`: 20 pruebas sin navegador. Arranca y escribe «GALAGA Ñ»; espacio empieza (ola 1,
3 vidas, 40 enemigos); barriendo y disparando 15 s suma ≥500 puntos y derriba enemigos; N con el panel pasa a la
ola 2 con su cartel; quieto acaba en «FIN DEL JUEGO» y guarda la marca; espacio no reinicia en el primer segundo (para
no saltarse la pantalla final por tener el dedo en la tecla); mantener P no hace parpadear el panel (la repetición del
teclado manda «keydown» muchas veces: el juego lleva la lista de teclas sostenidas); 900 partículas a la vez.

## Lo que este juego enseñó del lienzo
- `letra()` era lo que más faltaba: ya existe (ver la bitácora). Con ella todo el texto vive en el lienzo y escala con él.
- **No hay polígonos ni rotación**: por eso todo es pixel art con `rect`. Una nave que gira, o un triángulo, no se
  pueden dibujar hoy. Sería lo siguiente útil: `poligono([x1,y1, x2,y2, …])` y `rotar(grados)` / `restaurar()`.
- **No hay sonido.** El original de JavaScript lo tiene. Sigue en la lista.
- **Teclas sostenidas**: el lienzo sigue sin eventos propios; la capa transparente con `alPulsarTecla` +
  `alSoltarTecla` funciona bien, pero cada juego tiene que reescribir la lista de teclas sostenidas. Un `pulsada("ArrowLeft")`
  en el anfitrión lo ahorraría.
