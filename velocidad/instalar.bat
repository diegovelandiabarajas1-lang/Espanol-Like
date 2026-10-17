@echo off
setlocal
cd /d "%~dp0"
set "HERR=%~dp0herramientas"
if not exist "%HERR%" mkdir "%HERR%"
echo.
echo ===== Dependencias para comparar velocidades (todo va a %HERR% o se instala para tu usuario) =====
echo.

echo [1/5] Node
where node >nul 2>nul && (node --version) || echo   FALTA Node. Instalalo desde https://nodejs.org y vuelve a correr esto.

echo [2/5] Python 3
where python >nul 2>nul && (python --version) || (
  echo   instalando Python 3.13 con winget...
  winget install -e --id Python.Python.3.13 --accept-source-agreements --accept-package-agreements
)

echo [3/5] gcc y g++  (w64devkit 2.10.1, portable: se descomprime, no se instala; 64 MB)
if exist "%HERR%\w64devkit\bin\gcc.exe" (
  "%HERR%\w64devkit\bin\gcc.exe" --version | findstr gcc
) else (
  curl -L -o "%HERR%\w64devkit.7z.exe" https://github.com/skeeto/w64devkit/releases/download/v2.10.1/w64devkit-x64-2.10.1.7z.exe
  "%HERR%\w64devkit.7z.exe" -y -o"%HERR%" >nul
  if exist "%HERR%\w64devkit\bin\gcc.exe" (echo   listo) else (echo   no se pudo descomprimir solo: haz doble clic en %HERR%\w64devkit.7z.exe y extrae en %HERR%)
)

echo [4/5] Rust  (rustup con la cadena GNU: no necesita Visual Studio; unos 250 MB)
where rustc >nul 2>nul && (rustc --version) || (
  curl -L -o "%HERR%\rustup-init.exe" https://win.rustup.rs/x86_64
  "%HERR%\rustup-init.exe" -y --profile minimal --default-toolchain stable-x86_64-pc-windows-gnu
)

echo [5/5] Julia  (juliaup con winget; la primera vez que corra julia bajara la version estable, ~200 MB)
where julia >nul 2>nul && (julia --version) || (
  winget install -e --id Julialang.Juliaup --accept-source-agreements --accept-package-agreements
)

echo.
echo ===== Listo. CIERRA esta consola y abre una nueva antes de correr correr.bat =====
echo (los programas recien instalados entran al PATH solo en consolas nuevas)
pause
