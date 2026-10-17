@echo off
rem 1) Construye los juegos hechos en N dentro de D:\Documents\Juegos\N\
rem 2) Genera el catalogo recorriendo D:\Documents\Juegos y arma hub.html al lado de los juegos.
cd /d "%~dp0.."
if not exist D:\Documents\Juegos\N mkdir D:\Documents\Juegos\N
node motor\util\construir-app.js hub\juegos\flappy\flappy.esl "NEON FLAPPY ¥" D:\Documents\Juegos\N\flappy.html || exit /b 1
node motor\util\construir-app.js hub\juegos\galaga\galaga.esl "GALAGA ¥" D:\Documents\Juegos\N\galaga.html || exit /b 1
node motor\util\n-node.js hub\generar-hub.esl D:\Documents\Juegos hub || exit /b 1
node motor\util\construir-app.js hub\hub.esl "ARCADE ¥" D:\Documents\Juegos\hub.html
pause
