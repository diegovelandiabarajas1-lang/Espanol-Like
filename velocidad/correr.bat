@echo off
setlocal
cd /d "%~dp0"
rem Rutas de lo que instala instalar.bat, por si la consola aun no las tiene en el PATH
set "PATH=%~dp0herramientas\w64devkit\bin;%USERPROFILE%\.cargo\bin;%USERPROFILE%\.juliaup\bin;%LOCALAPPDATA%\Programs\Python\Python313;%PATH%"
set REP=%1
if "%REP%"=="" set REP=3
if not exist resultados mkdir resultados
if not exist bin mkdir bin
del /q resultados\*.txt 2>nul
echo Cada lenguaje corre %REP% veces; la tabla final toma el MEJOR tiempo de cada prueba.
echo.

echo == N con enie (JIT, por Node)
for /L %%i in (1,1,%REP%) do node ..\motor\util\n-node.js bench.esl >> resultados\N.txt

echo == JavaScript (Node)
for /L %%i in (1,1,%REP%) do node bench.js >> resultados\JavaScript.txt

echo == Python
where python >nul 2>nul && (
  for /L %%i in (1,1,%REP%) do python bench.py >> resultados\Python.txt
) || echo   saltado: no hay python

echo == C (gcc -O2)
where gcc >nul 2>nul && (
  gcc -O2 -o bin\bench_c.exe bench.c && for /L %%i in (1,1,%REP%) do bin\bench_c.exe >> resultados\C.txt
) || echo   saltado: no hay gcc

echo == C++ (g++ -O2)
where g++ >nul 2>nul && (
  g++ -O2 -o bin\bench_cpp.exe bench.cpp && for /L %%i in (1,1,%REP%) do bin\bench_cpp.exe >> resultados\C++.txt
) || echo   saltado: no hay g++

echo == Rust (rustc -O)
where rustc >nul 2>nul && (
  rustc -O -o bin\bench_rs.exe bench.rs && for /L %%i in (1,1,%REP%) do bin\bench_rs.exe >> resultados\Rust.txt
) || echo   saltado: no hay rustc

echo == Julia
where julia >nul 2>nul && (
  for /L %%i in (1,1,%REP%) do julia bench.jl >> resultados\Julia.txt
) || echo   saltado: no hay julia

echo.
node comparar.js
echo.
echo La tabla tambien quedo en resultados\tabla.md
pause
