# Resultados del 6 de noviembre de 2026 — Ñ AOT frente a C (59 programas de estrés)

Máquina: Intel i3-1115G4 (2 núcleos / 4 hilos), WSL Ubuntu, gcc 15.2 `-O2` para C a mano y `-O3` para el C que genera Ñ. Cada programa corre en su propio proceso, 3 repeticiones, el mejor tiempo; el tiempo es el que imprime el programa. El ruido entre corridas es de ±10 %.
Los valores que imprime cada programa coinciden con los de C (a20 imprime su propio cronómetro). Los programas con C = 0–1 ms (b28, b35) no dan una razón con sentido.

| familia (programas) | Ñ AOT / C, media geométrica | antes de esta etapa |
|---|--:|--:|
| A · objetos y memoria (15) | **×0.98** | ×17.3 |
| B · recursión (14) | ×1.48 | ×3.2 |
| C · índices y comprobaciones (20) | ×1.19 | ×1.23 |
| E · memoria y caché (10) | ×1.30 | ×1.95 |
| **los 59** | **×1.21** | |

41 de los 59 están en ≤ ×1.5, 53 en ≤ ×2 y 18 son más rápidos que C. Se dejan fuera los programas donde C tarda menos de 3 ms (b28, b35: gcc elimina el trabajo y la razón no mide nada). Fallan los 4 que recursan más de 900 llamadas (b22_8, b25, b30, b39_cadena): el límite de la máquina virtual.
La tabla por programa, con Ñ AOT, Ñ AOT sin comprobar, JS, Python y Ñ JIT: `resultados-100/TABLA-100.md`. Datos crudos: `resultados-100/resultados.json`.

Lo que cambió desde la medida anterior (`RESULTADOS-A4-5-nov-2026.md`): registros como estructuras de C, listas de objetos, pools de objetos y de listas, análisis de escape, recursión mutua tipada, llamada de cola, idioma de relleno y `reloj` tipado (ver `motor-exp/EXPERIMENTAL.md`, A5).
Cómo repetirlo: `bash velocidad/gen100/preparar100.sh` y `python3 velocidad/gen100/correr100.py --langs C,AOT,AOT-SC` (en WSL).
