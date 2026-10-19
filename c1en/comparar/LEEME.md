# Ñ contra otros lenguajes: las mismas seis pruebas

`c1en/kaggle-comparar-lenguajes.ipynb` corre en Kaggle (T4 ×2) las mismas seis pruebas en Ñ (C1EÑ: jit, nativo y GPU)
y en 16 bibliotecas de otros lenguajes, con **los mismos datos** (salen de una fórmula, no del azar), para comparar
tiempos y comprobar que todos calculan lo mismo (la «huella» de cada resultado contra NumPy en doble precisión).

## Las pruebas

| prueba | qué | tamaño (escala normal) | datos |
|---|---|---|---|
| `matmul` | C = A·B | 1024×1024 y 2048×2048 | A[i,j] = ((7i + 3j) mód 13)/13 − 0.5 · B[i,j] = ((5i + 11j) mód 17)/17 − 0.5 |
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

## Las dos T4 a la vez

El cuaderno trabaja en dos fases. **Fase 1:** instala y compila varios lenguajes a la vez (`INSTALAR_A_LA_VEZ`, 3 por
defecto; `apt-get` de uno en uno). **Fase 2:** dos trabajadores sacan tareas de una cola, de la más larga a la más corta:
el 1 con la T4 0 y la mitad de los núcleos físicos, el 2 con la T4 1 y la otra mitad (`CUDA_VISIBLE_DEVICES`, `taskset`
y los hilos de OpenMP/MKL/OpenBLAS/Go/Rust/Julia/JVM limitados a su mitad). Así las medidas no se estorban y todos los
lenguajes compiten en las mismas condiciones; el precio es que los tiempos de CPU son con media CPU. `MODO =
'secuencial'` corre uno detrás de otro con la CPU entera y la T4 0.

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
