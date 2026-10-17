@echo off
rem Empaqueta el ARCADE de escritorio: UN .exe con el menu, Flappy y Galaga dentro.
rem Deja todo en D:\ProyectosJS\dist\arcade\  (arcade.exe + raylib.dll + lib\ con koffi).
rem Necesita raylib.dll (64 bits) aqui, en hub\escritorio. Si no esta, la toma de
rem dist\principal\ (la del ejemplo del contador, que ya funciono).
cd /d "%~dp0"
if not exist raylib.dll (
  if exist "..\..\dist\principal\raylib.dll" (
    copy /y "..\..\dist\principal\raylib.dll" raylib.dll >nul
    echo + raylib.dll copiada de dist\principal
  ) else (
    echo Falta raylib.dll en hub\escritorio. Bajala de github.com/raysan5/raylib/releases
    echo ^(raylib-5.5_win64_mingw-w64.zip, carpeta lib^) y ponla aqui.
    pause
    exit /b 1
  )
)
node "..\..\motor\util\empaquetar.js" --ventana arcade.esl "..\..\dist\arcade"
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Listo: D:\ProyectosJS\dist\arcade\arcade.exe  (doble clic para jugar)
echo La carpeta entera es la app: arcade.exe solo, sin lib\ ni raylib.dll, no abre.
pause
