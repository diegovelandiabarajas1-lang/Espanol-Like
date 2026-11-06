#!/bin/bash
# medir22-wsl.sh — C (gcc -O2) y Ñ AOT de los 22 benchmarks, en WSL, mismo gcc para los dos; deja resultados-22-wsl-sc/{C,N-AOT}.txt y la tabla.
#   bash medir22-wsl.sh [corridas]
REP=${1:-3}
V=/mnt/d/ProyectosJS/velocidad
bash /mnt/d/Inteligente/cofre-bots/sincronizar-wsl.sh
mkdir -p /tmp/m22 $V/resultados-22-wsl-sc
rm -f $V/resultados-22-wsl-sc/*.txt
gcc -O2 -o /tmp/m22/c $V/bench22.c -lm || exit 1
cd ~/pjs && N_AOT_SIN_COMPROBAR=1 node motor-exp/util/n-compilar.js $V/bench22.esl -o /tmp/m22/aot 2>&1 | tail -1 | cut -c1-120
for i in $(seq $REP); do /tmp/m22/c >> $V/resultados-22-wsl-sc/C.txt; done
for i in $(seq $REP); do /tmp/m22/aot >> $V/resultados-22-wsl-sc/N-AOT.txt; done
cd $V && node comparar22.js resultados-22-wsl-sc
