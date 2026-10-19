# comparar/cudajl.jl — las seis pruebas en Julia: CPU (Base + BLAS + FFTW) y GPU (CUDA.jl).
#   julia --threads=auto cudajl.jl [chica]
# Float64 en los dos. En la GPU los arreglos son CuArray (los datos ya están allí)
# y se espera a la GPU con CUDA.@sync; la FFT de la GPU es CUFFT (por CUDA.jl).
using LinearAlgebra, FFTW, Printf
const chica = length(ARGS) > 0 && ARGS[1] == "chica"
const NS = chica ? [128, 256] : [1024, 2048]
const NV, SM, SK, NF = chica ? (65536, 256, 1024, 16384) : (1 << 24, 4096, 1024, 1 << 20)

function medir(prueba, tam, disp, f, h, sincronizar)
    r = sincronizar(f)
    mejor = Inf
    for _ in 1:3
        t0 = time_ns(); r = sincronizar(f); t = (time_ns() - t0) / 1e6
        mejor = min(mejor, t)
    end
    @printf("RES,%s,%s,%s,%.6f,%.17g,f64\n", prueba, tam, disp, mejor, Float64(h(r)))
    flush(stdout)
end
softmaxFilas(S) = (E = exp.(S .- maximum(S, dims=2)); E ./ sum(E, dims=2))

function pruebas(disp, a, sincronizar)          # a: convierte un Array al dispositivo
    for n in NS
        A = a([((i * 7 + j * 3) % 13) / 13 - 0.5 for i in 0:n-1, j in 0:n-1])
        B = a([((i * 5 + j * 11) % 17) / 17 - 0.5 for i in 0:n-1, j in 0:n-1])
        medir("matmul", string(n), disp, () -> A * B, sum, sincronizar)
    end
    x = a([(i % 1000) / 1000 for i in 0:NV-1])
    medir("seno", string(NV), disp, () -> sin.(x), sum, sincronizar)
    medir("x*2+1", string(NV), disp, () -> x .* 2 .+ 1, sum, sincronizar)
    medir("suma", string(NV), disp, () -> sum(x), identity, sincronizar)
    S = a([((i * 3 + j) % 50) / 10 for i in 0:SM-1, j in 0:SK-1])
    medir("softmax", "$(SM)x$(SK)", disp, () -> softmaxFilas(S), Y -> sum(Y .* Y), sincronizar)
    xf = a(ComplexF64.([(i % 1000) / 1000 for i in 0:NF-1]))
    medir("fft", string(NF), disp, () -> fft(xf), X -> sum(abs.(X)), sincronizar)
end

# con el cuaderno en paralelo, cada trabajo tiene sus núcleos: los de BLAS, los mismos
haskey(ENV, "HILOS") && BLAS.set_num_threads(parse(Int, ENV["HILOS"]))
println("# julia ", VERSION, " · hilos ", Threads.nthreads(), " · BLAS ", BLAS.get_num_threads())
pruebas("cpu", identity, f -> f())
if get(ENV, "SIN_GPU", "") != "1"
    # «using» dentro de un «if» se puede, pero CUDA.@sync se expande al leer el
    # bloque, antes de cargar CUDA: por eso la parte de la GPU se lee después
    @eval using CUDA
    include_string(Main, """
    if CUDA.functional()
        println("# ", CUDA.name(CUDA.device()))
        pruebas("gpu", CuArray, f -> CUDA.@sync f())
    else
        println("# CUDA.jl no ve una GPU que funcione")
    end
    """)
end
