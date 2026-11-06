#!/bin/bash
# correr22.sh — compila y corre los 22 benchmarks en C, C++, Rust, JavaScript, Python y Ñ (JIT y AOT), en Git Bash de Windows.
#   bash correr22.sh [corridas]        (por defecto 3; Python y Ñ JIT hacen 2, que son lentos)
# Cada ejecutable nuevo lo puede bloquear el Control de aplicaciones de Windows: se reintenta y, si no hay manera, se dice y se sigue.
cd "$(dirname "$0")"
REP=${1:-3}
export PATH="$PATH:$(pwd)/herramientas/w64devkit/bin:$HOME/.cargo/bin"
mkdir -p bin resultados-22
rm -f resultados-22/*.txt
node gen22/gen.js || exit 1

# intenta correr un ejecutable hasta que el sistema lo deje (devuelve 0 si corrió)
prueba() { for t in 1 2 3 4 5 6; do if "$1" > /tmp/prueba22.out 2>&1 && grep -q " en " /tmp/prueba22.out; then return 0; fi; sleep 8; done; return 1; }
corre() {   # nombre ejecutable [veces]
  local n=$1 exe=$2 v=${3:-$REP}
  if ! prueba "$exe"; then echo "  BLOQUEADO o con error: $n ($exe)"; return; fi
  rm -f "resultados-22/$n.txt"; for i in $(seq $v); do "$exe" >> "resultados-22/$n.txt"; done
  echo "  $n: $(grep -c ' en ' "resultados-22/$n.txt") líneas"
}

echo "== compilando"
gcc -O2 -o bin/b22_c.exe bench22.c -lm || echo "  gcc falló"
g++ -O2 -x c++ -o bin/b22_cpp.exe bench22.c -lm || echo "  g++ falló"
mkdir -p /tmp/stub && (cd /tmp/stub && echo "" > vacio.c && gcc -c vacio.c -o vacio.o && ar rcs libgcc_eh.a vacio.o)
rustc -O -C link-arg=-L/tmp/stub -o bin/b22_rs.exe bench22.rs 2>&1 | grep -E "^error" | head -5
node ../motor-exp/util/n-compilar.js bench22.esl -o bin/b22_aot.exe 2>&1 | tail -2 | cut -c1-200

echo "== corriendo ($REP corridas; Ñ JIT 2, Python 1)"
corre C bin/b22_c.exe
corre "C++" bin/b22_cpp.exe
corre Rust bin/b22_rs.exe
rm -f resultados-22/JavaScript.txt; for i in $(seq $REP); do node bench22.js >> resultados-22/JavaScript.txt; done; echo "  JavaScript: $(grep -c ' en ' resultados-22/JavaScript.txt) líneas"
corre N-AOT bin/b22_aot.exe
rm -f resultados-22/N.txt; for i in 1 2; do node ../motor-exp/util/n-node.js bench22.esl >> resultados-22/N.txt; done; echo "  Ñ JIT: $(grep -c ' en ' resultados-22/N.txt) líneas"
rm -f resultados-22/Python.txt; for i in 1; do python bench22.py >> resultados-22/Python.txt; done; echo "  Python: $(grep -c ' en ' resultados-22/Python.txt) líneas"
node comparar22.js
