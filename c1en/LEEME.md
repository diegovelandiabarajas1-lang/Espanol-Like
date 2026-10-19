# C1EÑ en Kaggle

`kaggle-c1en.ipynb` corre C1EÑ —las funciones de Ñ en GPU— contra las dos
NVIDIA T4 de Kaggle: la suite comparando GPU, jit y nativo **al bit**, un
benchmark en tabla y el reparto entre las dos GPU con un proceso por GPU.

`kaggle-c1en-velocidad.ipynb` (fase N1) **mide** la velocidad: el programa
`velocidad-c1en.esl` en jit, nativo y gpu (núcleos de `paralelo`, NEÑ en
volumen, aritmética de la VM), ECOSIM-G v3.1 en ms por tick y por mundo, y NumPy
y CuPy con los mismos tamaños. Deja `c1en-velocidad.csv`, el resumen y las
gráficas. Se sube igual que el de abajo; con `MOTORES = ['motor-exp', 'motor']`
compara también el LTS. El programa solo, sin cuaderno:
`node motor-exp/util/n-node.js c1en/velocidad-c1en.esl gpu normal`.

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

## Desde Python: `c1en.py`

`c1en/c1en.py` es el puente para usar Ñ como una biblioteca de Python, con
NumPy de por medio y la GPU cuando hay. `kaggle-python.ipynb` lo enseña paso a
paso; en resumen:

```python
import sys, os
os.environ['N_RAIZ'] = '/kaggle/working/n'        # la carpeta del proyecto
sys.path.insert(0, '/kaggle/working/n/c1en')
import c1en, numpy as np

# un programa de Ñ entero, en el perfil C1EÑ (sin «usar»)
print(c1en.correr('imprimir(derivarFormula("x^3 - 6x^2 + 11x - 6", "x"))'))

# una función de Ñ llamada desde Python; «paralelo» la corre en la T4
tirar = c1en.funcion('''
fn tirar(i, dentro) {
  fijo x = azarHilo(7, i, 0)
  fijo y = azarHilo(7, i, 1)
  si x * x + y * y < 1.0 { sumarAtomico(dentro, 0, 1) }
}''', paralelo=True)
dentro = np.zeros(1, dtype=np.int32)
tirar(20_000_000, dentro)                           # el arreglo vuelve modificado
print(4 * dentro[0] / 20_000_000, tirar.ultimo_dispositivo)
```

Cómo funciona: cada llamada lanza Node con `bundle-c1en.js` y le pasa el programa;
los arreglos de NumPy viajan como `float64` / `int32` crudos
(`escribirArregloBinario` / `leerArregloBinario` en Ñ, `tofile` / `fromfile` en
NumPy), así que millones de elementos cuestan milisegundos. Arrancar Node son
~100 ms por llamada; para muchos núcleos pequeños conviene agruparlos en un
programa de Ñ. `c1en.funcion(..., dispositivo='gpu', gpu=1)` fija el dispositivo.

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

## ECOSIM-G: un Monte Carlo de economías en la GPU

`ecosim/ecosim-g.esl` es la economía cerrada de `ecosim/` (hasta la v5: compradores
con colchón, empresas con máquinas y quiebras, accionistas de tres estilos con
euforia y pánico, bancos con doble entrada, encaje, margen y castigos, clubes
de compañeros con participaciones y corridas) reescrita para C1EÑ: muchas
economías («mundos») avanzan a la vez en arreglos planos de tamaño
`economías × N`, y cada regla es un núcleo que corre una vez por agente, por
empresa, por club, por banco o por economía. Dinero (depósitos − préstamos =
base), deudas, acciones, bienes y participaciones se verifican cada minuto
simulado, y la corrida da los mismos bits en `jit`, `nativo` y `gpu`.

```
node motor/util/n-node.js --c1en ecosim/ecosim-g.esl [economias] [ticks] [compradores] [semilla] [salida.csv|-] [empresasPorSector] [credito]
```

Un tick es un segundo simulado (7200 = 2 h). La economía `k` usa la semilla
`semilla + k`. El CSV trae, cada 10 minutos y por economía: paro, índice de
bolsa (centavos; 10000 = la salida a 100 monedas), empresas activas,
quiebras, fundadas (y por clubes), producido, consumido, préstamos vivos,
clubes, socios, llamadas de margen, castigos, horas de iliquidez bancaria y
corridas. Al final se resume en cuántos mundos hubo crisis de empleo
(paro > 5 %), caída de bolsa (≥ 20 % en una hora), burbuja (índice ≥ 2× la
salida), crisis de liquidez, llamadas de margen y corridas, y los 5 inversores
y 5 clubes más ricos del mundo 0.

## Residencia en la GPU

Un arreglo que entra en un `paralelo` en la GPU se sube UNA vez y se queda
allí; tras el núcleo la copia buena está en la GPU y solo baja cuando el
programa la lee desde la CPU (cualquier acceso: `elemento`, `imprimir`, otra
función de la biblioteca). Un acceso desde la CPU marca el arreglo como
«tocado» y el siguiente núcleo lo vuelve a subir. ECOSIM-G con 3 economías
pasó de 1.940 MB por el PCIe a 0,4 MB. `C1EN_ESTADISTICAS=1` imprime al salir
los lanzamientos y los MB subidos y bajados; `vm.c1en.liberarResidentes()`
baja todo y libera la memoria de la GPU (las pruebas lo usan).

Los arreglos enteros son de 32 bits (como en Ñ), así que el dinero de UNA
economía debe caber en 2^31 centavos ≈ 21 millones de monedas: con 10.000
compradores van 16 millones. `c1en/kaggle-ecosim-g.ipynb` corre 1.000
economías en las dos T4 (500 por GPU, un proceso por GPU) y pinta la
distribución.
