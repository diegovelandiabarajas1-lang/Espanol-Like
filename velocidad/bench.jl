fib(n) = n < 2 ? n : fib(n - 1) + fib(n - 2)
function criba(n)
    marca = trues(n + 1); marca[1] = false; marca[2] = false   # Julia indexa desde 1
    i = 2
    while i * i <= n
        if marca[i + 1]
            j = i * i
            while j <= n; marca[j + 1] = false; j += i; end
        end
        i += 1
    end
    count(marca)
end
function mandelbrot(ancho, alto, maxIter)
    dentro = 0
    for py in 0:alto-1, px in 0:ancho-1
        cr = (px / ancho) * 3.5 - 2.5; ci = (py / alto) * 2.0 - 1.0
        zr = 0.0; zi = 0.0; k = 0
        while k < maxIter && zr * zr + zi * zi <= 4.0
            t = zr * zr - zi * zi + cr; zi = 2.0 * zr * zi + ci; zr = t; k += 1
        end
        k == maxIter && (dentro += 1)
    end
    dentro
end
function medir(nombre, f)
    f()                       # primera llamada: compila (Julia es JIT); se mide la segunda
    t0 = time_ns(); r = f(); ms = round(Int, (time_ns() - t0) / 1e6)
    println(nombre, " = ", r, " en ", ms, " ms")
end
medir("fib(30)", () -> fib(30))
medir("criba(2000000)", () -> criba(2000000))
medir("mandelbrot(400x300x200)", () -> mandelbrot(400, 300, 200))
