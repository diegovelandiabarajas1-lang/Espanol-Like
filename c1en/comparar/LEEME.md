# Ñ contra otros lenguajes: las mismas seis pruebas

`c1en/kaggle-comparar-lenguajes.ipynb` corre en Kaggle (T4 ×2) las mismas seis pruebas en Ñ (C1EÑ: jit, nativo y GPU)
y en 16 bibliotecas de otros lenguajes, con **los mismos datos** (salen de una fórmula, no del azar), para comparar
tiempos y comprobar que todos calculan lo mismo (la «huella» de cada resultado contra NumPy en doble precisión).

## Las pruebas

| prueba | qué | tamaño (escala normal) | datos |
|---|---|---|---|
| `matmul` | C = A·B | 1024×1024 y 2048×2048 | A[i,j] = ((7i + 3j) mód 13)/13 − 0.5 · B[i,j] = ((5i + 11j) mód 17)/17 − 0.5 |
| `matmul32` | lo mismo en float32 | igual | los mismos, redondeados a float (por ahora solo Ñ —nativo y gpu— y PyTorch) |
| `seno` | sin(x) elemento a elemento | 2^24 números | x[i] = (i mód 1000)/1000 |
| `x*2+1` | x·2 + 1 | 2^24 | igual |
| `suma` | Σx | 2^24 | igual |
| `softmax` | por filas | 4096×1024 | S[i,j] = ((3i + j) mód 50)/10 |
| `fft` | transformada de Fourier compleja | 2^20 | los primeros 2^20 de x |

Cada programa: una vez para calentar y la mejor de 3. Los datos ya están en el dispositivo (en la GPU, ya subidos) y el
resultado no se copia a la CPU; en la GPU se espera a que termine (sincronizar). La huella (suma del resultado, Σ|X| en la
FFT, Σy² en softmax) se calcula fuera del tiempo medido. Salida de todos, una línea por prueba:

    RES,prueba,tamaño,dispositivo,ms,huella,precision

`escala chica` (primer argumento `chica`) usa tamaños pequeños para comprobar que todo corre.

## Dos cuadernos a la vez: uno con las T4, otro solo CPU

El mismo cuaderno se importa dos veces en Kaggle y se elige el papel en la primera celda:

- **`PAPEL = 'gpu'`** (sesión *GPU T4 x2*): instala solo los lenguajes con GPU (Ñ, PyTorch, CUDA.jl, Candle, R torch,
  TorchSharp) y mide **solo sus pruebas de GPU**, dos a la vez: un trabajador por T4 (`CUDA_VISIBLE_DEVICES`), cada uno
  atado a su mitad de núcleos (`taskset`). Los demás lenguajes salen como «en el cuaderno de CPU».
- **`PAPEL = 'cpu'`** (sesión sin acelerador): instala lo de CPU de todos (Julia sin CUDA.jl, Candle sin `cuda`,
  torch de R y TorchSharp en su versión CPU) y mide **todas las pruebas de CPU**, una tras otra, con la CPU entera.
- **`PAPEL = 'todo'`**: las dos cosas en una sola sesión de GPU, con `MODO = 'paralelo'` (dos a la vez, media CPU
  cada uno) o `'secuencial'`.

Los programas que miden CPU y GPU (pytorch.py, cudajl.jl, candle, rtorch.R, torchsharp) leen la variable `SOLO=cpu|gpu`
que les pasa el cuaderno. Así cada ranking sale de una sola máquina: las pruebas de CPU todas de la sesión de CPU, las de
GPU de la de GPU, y la tabla las muestra separadas. Cada cuaderno guarda `comparar-lenguajes-cpu.csv` o `-gpu.csv`; para
la tabla conjunta, en uno de los dos se añade como entrada (*Add Input → Your Work*) la salida del otro y se corre de
nuevo desde «Juntar con el otro cuaderno» (si la sesión se reinició, antes las tres primeras celdas de código; no hace
falta medir otra vez): lee `/kaggle/input/**/comparar-lenguajes-*.csv` y escribe
`comparar-lenguajes-junto.csv`. En las dos fases, la 1 instala varios lenguajes a la vez (`INSTALAR_A_LA_VEZ`, 3 por
defecto; `apt-get` de uno en uno) y la 2 mide sacando tareas de una cola, de la más larga a la más corta.

## Los programas

| archivo | lenguaje · biblioteca | dispositivos | notas |
|---|---|---|---|
| `n.esl` | Ñ · C1EÑ (motor-exp) | jit, nativo, gpu | |
| `pytorch.py` | Python · PyTorch | cpu, gpu | |
| `eigen.cpp` | C++ · Eigen | cpu | FFT del módulo `unsupported` (kissfft) |
| `openblas.c` | C · OpenBLAS | cpu | BLAS solo hace matmul; lo demás son bucles C con OpenMP; sin FFT |
| `cudajl.jl` | Julia · CUDA.jl | cpu, gpu | CPU con BLAS y FFTW; GPU con CuArray y CUFFT |
| `candle/` | Rust · Candle | cpu, gpu | sin FFT (Candle no la trae) |
| `tfjs.js` | JavaScript · TensorFlow.js | cpu | **float32** (tfjs no tiene float64); tfjs-node-gpu pide CUDA 11 |
| `gorgonia.go` | Go · Gorgonia | cpu | seno con Apply; softmax con bucles de Go; sin FFT |
| `rtorch.R` | R · torch | cpu, gpu | libtorch por debajo |
| `Nd4jBench.java` | Java · ND4J | cpu | nd4j-cuda pide CUDA 11; sin FFT |
| `mkl.f90` | Fortran · Intel MKL | cpu | DGEMM, VML (vdSin), DFTI |
| `octave.m` | **Octave en lugar de MATLAB** | cpu | MATLAB necesita licencia; el archivo corre igual en MATLAB |
| `torchsharp/` | C# · TorchSharp | cpu, gpu | libtorch por debajo |
| `swift.swift` | **Swift sin Metal** | cpu | Metal Performance Shaders solo existe en Apple; Swift puro, un hilo; sin FFT |
| `breeze.sc` | Scala · Breeze | cpu | BLAS del sistema por netlib |
| `kotlindl.kt` | Kotlin · KotlinDL | cpu | se mide TensorFlow 1.15 para Java, el motor de KotlinDL; FFT en float32 |
| `referencia.py` | NumPy | — | las huellas de referencia |

Los programas de C++ (Eigen), C (OpenBLAS), Fortran (MKL), Octave y Ñ se probaron en la nube antes de entregarlos
(escala chica y normal, huellas iguales a NumPy); el de TensorFlow.js, con su motor de JavaScript puro (tfjs-node no se
pudo bajar allí). Los demás no se pudieron probar allí (sin acceso a sus
repositorios de paquetes): la primera corrida en Kaggle es su prueba, y cada uno que falle se salta sin tumbar los
demás y deja su error en el cuaderno.
