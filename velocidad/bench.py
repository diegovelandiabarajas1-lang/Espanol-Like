import time
def fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)
def criba(n):
    marca = [True] * (n + 1); marca[0] = False; marca[1] = False
    i = 2
    while i * i <= n:
        if marca[i]:
            j = i * i
            while j <= n: marca[j] = False; j += i
        i += 1
    return sum(1 for k in range(n + 1) if marca[k])
def mandelbrot(ancho, alto, max_iter):
    dentro = 0
    for py in range(alto):
        for px in range(ancho):
            cr = (px / ancho) * 3.5 - 2.5; ci = (py / alto) * 2.0 - 1.0
            zr = zi = 0.0; k = 0
            while k < max_iter and zr * zr + zi * zi <= 4.0:
                t = zr * zr - zi * zi + cr; zi = 2.0 * zr * zi + ci; zr = t; k += 1
            if k == max_iter: dentro += 1
    return dentro
def medir(nombre, f):
    t0 = time.perf_counter(); r = f(); print(nombre, "=", r, "en", round((time.perf_counter() - t0) * 1000), "ms")
medir("fib(30)", lambda: fib(30))
medir("criba(2000000)", lambda: criba(2000000))
medir("mandelbrot(400x300x200)", lambda: mandelbrot(400, 300, 200))
