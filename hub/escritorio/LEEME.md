# ARCADE Ñ de escritorio

Una app de Windows: **un solo `arcade.exe`**, una ventana, un menú, y los juegos hechos en Ñ corriendo
dentro. No es una página: es Ñ empaquetado con `empaquetar.js --ventana` y dibujando con raylib por FFI.

| Tecla | En el menú | Dentro de un juego |
|---|---|---|
| ↑ ↓ (o W S) | elegir | — |
| Enter / espacio / clic | jugar | empezar, aletear, disparar |
| Esc | **cerrar el arcade** | **volver al menú** |
| F11 | pantalla completa (sin bordes) | igual |

## Cómo se usa
- `construir.cmd` → empaqueta en `D:\ProyectosJS\dist\arcade\`. Doble clic en `arcade.exe`.
  La carpeta entera es la app: `arcade.exe` + `raylib.dll` + `lib\` (koffi). Si mueves el .exe solo, no abre.
- `jugar.cmd` → abre el arcade sin empaquetar (con tu Node). Para probar un cambio en segundos.
- `probar.cmd` → la prueba: abre la ventana y se juega sola con un guion de teclas (~15–30 s). No toques el teclado.

Las tres buscan `raylib.dll` aquí; si no está, la copian de `dist\principal\` (la del ejemplo del contador).

## Archivos
```
arcade.esl          el menú y el bucle de cuadros
lib/pantalla.esl    la ventana: raylib por FFI, mundo 540×960 escalado, letra con Ñ, teclado, guion
lib/records.esl     los récords, en un archivo JSON
juegos/flappy.esl   NEON FLAPPY Ñ
juegos/galaga.esl   GALAGA Ñ
prueba.js           la prueba con guion (13 comprobaciones)
```

## Cómo funciona por dentro
- **Mismo dibujo que la web.** `pantalla.esl` ofrece `color("#hex")`, `rect`, `circulo`, `linea`, `punto`,
  `grosor`, `letra(tamaño, alineación, estilo)` y `escribirEn(x, y, texto)` con la misma forma que el lienzo
  web. Por eso Galaga de escritorio es el de la web casi línea por línea: cambió el teclado y desapareció la página.
- **Escala.** El mundo mide 540×960 (9:16) como en la web. Una cámara 2D de raylib lo escala al tamaño de la
  ventana; lo que sobra a los lados queda negro. La ventana abre al 86 % del alto del monitor y se puede estirar.
- **La Ñ.** La letra por defecto de raylib es diminuta. Se carga una TTF de `C:\Windows\Fonts` (Segoe UI/Arial
  y Consolas/Courier; en Linux, DejaVu) con Latin-1 entero (Ñ, tildes, ¡, ¿) y unas flechas (← ↑ → ↓ ▸).
  La lista de caracteres se la pide a la propia raylib (`LoadCodepoints`), porque Ñ no tiene punteros a listas.
- **Color en un número.** Un color de raylib es una estructura de 4 bytes; en Windows x64 (y Linux x64) se pasa
  igual que un entero de 32 bits. Así cada `rect` cruza a C sin armar un diccionario. Galaga dibuja ~1200 figuras
  por cuadro.
- **Teclado.** En la web llegaban eventos y había que llevar la cuenta de qué estaba apretado. Aquí se pregunta a
  la ventana cada cuadro: `pulsada(tecla)` (se acaba de apretar) y `sostenida(tecla)` (está apretada).
  Esc no cierra la ventana (raylib lo hace por defecto; se apagó con `SetExitKey(0)`): lo decide el arcade.
- **Récords.** `%LOCALAPPDATA%\ArcadeÑ\records.json`, con claves por juego (`flappy.mejor`, `galaga.mejor`).
  Fuera de `dist\` a propósito: volver a empaquetar no borra los récords. Un archivo roto no tumba el arcade.
  Son récords nuevos: los de la web viven en el navegador y no se pasan.

## Guion de pruebas
Con `N_GUION=archivo.txt` el teclado no se lee de la ventana sino del archivo, y el arcade corre sin límite de
60 fps. Una orden por línea, `cuadro orden [tecla|archivo]`:
```
5 pulsa abajo          pulsada en ese cuadro
21 baja espacio        queda sostenida…
60 suelta espacio      …hasta aquí
3 captura menu.png     captura de la ventana (queda en la carpeta actual)
620 fin                cierra
```
Teclas: espacio, esc, enter, arriba, abajo, izquierda, derecha, a, d, n, p, s, w, x.
`N_ARCADE_DATOS=ruta.json` cambia dónde van los récords (la prueba usa uno temporal).

## Agregar un juego
1. `juegos/nuevo.esl` con `entrar()`, `paso()`, `mejorPuntaje()` y `miniatura(x, y)` (caja de 130×170).
2. Ponerlo en `JUEGOS` de `arcade.esl` y una línea en `mejorDe`, `entrarEn`, `jugar` y `miniatura`.
3. Lo que dibuja, con `p.` delante (`usar "../lib/pantalla.esl" como p`). **Cuidado:** una variable local
   llamada `p` tapa el módulo (ver la bitácora, entrada 5).

## Límites
- El .exe de Windows se construye en Windows (empaqueta el `node.exe` de la máquina). Pesa ~120 MB porque lleva Node.
- SmartScreen puede avisar la primera vez («editor desconocido»): el .exe no está firmado.
- Con la escala de Windows al 125 % o 150 % la ventana se ve algo borrosa (raylib sin modo HiDPI). Funciona igual.
- Si no encuentra ninguna TTF, usa la letra de raylib: pequeña, pero también tiene Ñ.
