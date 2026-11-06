#!/bin/bash
# preparar100.sh — genera y compila los ejecutables de bench100 en WSL (C, Ñ AOT y Ñ AOT --sin-comprobar)
V=/mnt/d/ProyectosJS/velocidad
B=${B100:-$HOME/b100}
mkdir -p $B
bash /mnt/d/Inteligente/cofre-bots/sincronizar-wsl.sh
(cd $V/gen100 && node gen.js | cut -c1-80) || exit 1
gcc -O2 -o $B/c $V/bench100.c -lm || exit 1
cd ~/pjs
echo "compilando Ñ AOT…";    node motor-exp/util/n-compilar.js $V/bench100.esl -o $B/aot 2>&1 | tail -1 | cut -c1-120
echo "compilando Ñ AOT sin comprobar…"; N_AOT_SIN_COMPROBAR=1 node motor-exp/util/n-compilar.js $V/bench100.esl -o $B/aotsc 2>&1 | tail -1 | cut -c1-120
ls -la $B | tail -4
