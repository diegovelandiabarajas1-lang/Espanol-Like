@echo off
rem Prueba del ARCADE de escritorio: abre la ventana y se juega solo con un guion
rem de teclas (unos segundos). No toques el teclado mientras corre.
cd /d "%~dp0"
if not exist raylib.dll if exist "..\..\dist\principal\raylib.dll" copy /y "..\..\dist\principal\raylib.dll" raylib.dll >nul
node prueba.js
pause
