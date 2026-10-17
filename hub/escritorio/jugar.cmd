@echo off
rem Abre el ARCADE sin empaquetar (con el Node instalado). Para probar cambios rapido.
cd /d "%~dp0"
if not exist raylib.dll if exist "..\..\dist\principal\raylib.dll" copy /y "..\..\dist\principal\raylib.dll" raylib.dll >nul
node "..\..\motor\util\n-node.js" arcade.esl
if errorlevel 1 pause
