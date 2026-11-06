#!/bin/bash
# final22-wsl.sh — los 22 benchmarks en WSL, todos con el mismo gcc/node/python: C, C++, JavaScript, Python, Ñ JIT, Ñ AOT y Ñ AOT --sin-comprobar.
#   bash final22-wsl.sh [corridas]      (Rust no está en WSL: ver rust-reescalado.js)
REP=${1:-5}
V=/mnt/d/ProyectosJS/velocidad
bash /mnt/d/Inteligente/cofre-bots/sincronizar-wsl.sh
mkdir -p /tmp/f22 $V/resultados-22-final
rm -f $V/resultados-22-final/*.txt
cd $V && node gen22/gen.js > /dev/null || exit 1
gcc -O2 -o /tmp/f22/c $V/bench22.c -lm || exit 1
g++ -O2 -x c++ -o /tmp/f22/cpp $V/bench22.c -lm || exit 1
cd ~/pjs
node motor-exp/util/n-compilar.js $V/bench22.esl -o /tmp/f22/aot 2>&1 | tail -1 | cut -c1-100
N_AOT_SIN_COMPROBAR=1 node motor-exp/util/n-compilar.js $V/bench22.esl -o /tmp/f22/aotsc 2>&1 | tail -1 | cut -c1-100
O=$V/resultados-22-final
for i in $(seq $REP); do /tmp/f22/c >> $O/C.txt; done
for i in $(seq $REP); do /tmp/f22/cpp >> $O/C++.txt; done
for i in $(seq $REP); do /tmp/f22/aot >> $O/N-AOT.txt; done
for i in $(seq $REP); do /tmp/f22/aotsc >> $O/N-AOT-SC.txt; done
for i in $(seq 3); do node $V/bench22.js >> $O/JavaScript.txt; done
for i in 1 2; do node motor-exp/util/n-node.js $V/bench22.esl >> $O/N.txt; done
python3 $V/bench22.py >> $O/Python.txt
cd $V && node comparar22.js resultados-22-final
