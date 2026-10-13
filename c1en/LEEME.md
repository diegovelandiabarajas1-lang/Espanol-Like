# C1EÑ en Kaggle

`kaggle-c1en.ipynb` corre C1EÑ —las funciones de Ñ en GPU— contra las dos
NVIDIA T4 de Kaggle: la suite comparando GPU, jit y nativo **al bit**, un
benchmark en tabla y el reparto entre las dos GPU con un proceso por GPU.

## Subirlo y correrlo

1. En Kaggle: **Create → New Notebook → File → Import Notebook** y elige
   `c1en/kaggle-c1en.ipynb`.
2. **Settings → Accelerator → GPU T4 x2**.
3. El proyecto, de una de dos maneras:
   - **A · dataset**: **Add Input → Upload → New Dataset** con la carpeta del
     proyecto (la que tiene `motor/` dentro; sin `node_modules`). El cuaderno la
     busca sola en `/kaggle/input/…` y la copia a `/kaggle/working/n`.
   - **B · GitHub**: **Settings → Internet → On**. Si no encuentra un dataset,
     el cuaderno hace `git clone` de
     `https://github.com/diegovelandiabarajas1-lang/Espanol-Like`.
4. **Run All**. La primera vez tarda unos minutos: instala Node 22 y koffi, y
   compila cada núcleo con gcc y con NVRTC.

## Qué mirar

- La celda `node motor/pruebas/c1en.js --gpu` tiene que terminar en
  `… pasan, 0 fallan`. Ahí está la prueba de verdad de la promesa: los mismos
  bits en la T4 que en la CPU para `+ − * /` y `raiz` (300 núcleos al azar
  incluidos).
- La tabla del benchmark: milisegundos por dispositivo y la aceleración frente
  a `jit`. La columna «igual a jit» tiene que decir `cierto` en todo.
- La celda de las dos T4: la suma de las dos mitades es **exactamente** la
  cuenta de una sola GPU (el azar es por contador, no por estado).

## Fuera de Kaggle

Lo mismo funciona en cualquier Linux con GPU NVIDIA, driver y toolkit de CUDA
(para `libnvrtc`). Variables que entiende C1EÑ:

| variable | para qué |
|---|---|
| `C1EN_GPU=k` | la GPU inicial (con varias: un proceso por GPU) |
| `C1EN_DISPOSITIVO=jit\|nativo\|gpu` | el dispositivo inicial |
| `C1EN_NVRTC_LIB=ruta` | dónde está `libnvrtc.so` si no se encuentra sola |
| `C1EN_CUDA_LIB=ruta` | dónde está `libcuda.so.1` |
| `C1EN_CC=gcc` · `C1EN_CACHE=carpeta` | el compilador de C y la caché del dispositivo nativo |

Sin GPU, sin gcc o en el navegador, `paralelo` corre igual en `jit`.
