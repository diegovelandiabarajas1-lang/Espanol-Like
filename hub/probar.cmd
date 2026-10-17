@echo off
rem Pruebas de lo que esta en hub\: sin navegador, en segundos.
cd /d "%~dp0.."
node hub\juegos\flappy\prueba.js
node hub\juegos\galaga\prueba.js
pause
