# bench22.py — generado por gen22/gen.js: no editar a mano.
import math, sys, time
sys.setrecursionlimit(20000)
def matmul_run():
    n = 440
    a = [0.0] * ((n * n))
    b = [0.0] * ((n * n))
    c = [0.0] * ((n * n))
    for i in range(0, n):
        for j in range(0, n):
            a[((i * n) + j)] = (float((((i * 7) + (j * 3)) % 10)) / 10.0)
            b[((i * n) + j)] = (float((((i * 5) + (j * 11)) % 10)) / 10.0)
    for i in range(0, n):
        for j in range(0, n):
            s = 0.0
            for k in range(0, n):
                s = (s + (a[((i * n) + k)] * b[((k * n) + j)]))
            c[((i * n) + j)] = s
    t = 0.0
    for i in range(0, (n * n)):
        t = (t + c[i])
    return int((t * 1000.0))
def nbody_avanza(n, xs, ys, zs, vx, vy, vz, m, dt):
    for i in range(0, n):
        for j in range((i + 1), n):
            dx = (xs[i] - xs[j])
            dy = (ys[i] - ys[j])
            dz = (zs[i] - zs[j])
            d2 = (((dx * dx) + (dy * dy)) + (dz * dz))
            mag = (dt / (d2 * math.sqrt(d2)))
            vx[i] = (vx[i] - ((dx * m[j]) * mag))
            vy[i] = (vy[i] - ((dy * m[j]) * mag))
            vz[i] = (vz[i] - ((dz * m[j]) * mag))
            vx[j] = (vx[j] + ((dx * m[i]) * mag))
            vy[j] = (vy[j] + ((dy * m[i]) * mag))
            vz[j] = (vz[j] + ((dz * m[i]) * mag))
    for i in range(0, n):
        xs[i] = (xs[i] + (dt * vx[i]))
        ys[i] = (ys[i] + (dt * vy[i]))
        zs[i] = (zs[i] + (dt * vz[i]))
def nbody_run():
    n = 5
    xs = [0.0] * (n)
    ys = [0.0] * (n)
    zs = [0.0] * (n)
    vx = [0.0] * (n)
    vy = [0.0] * (n)
    vz = [0.0] * (n)
    m = [0.0] * (n)
    for i in range(0, n):
        xs[i] = ((float(i) * 1.5) + 0.1)
        ys[i] = ((float((i * i)) * 0.7) - 1.0)
        zs[i] = (float(((i * 3) % 4)) - 0.5)
        vx[i] = (float(i) * 0.01)
        vy[i] = (0.02 - (float(i) * 0.005))
        vz[i] = (0.001 * float(i))
        m[i] = (1.0 + (float(i) * 0.5))
    for s in range(0, 800000):
        nbody_avanza(n, xs, ys, zs, vx, vy, vz, m, 0.001)
    t = 0.0
    for i in range(0, n):
        t = (((t + xs[i]) + ys[i]) + zs[i])
    return int((t * 1000000.0))
def spectral_aij(i, j):
    return (1.0 / float(((((((i + j) * ((i + j) + 1))) // (2)) + i) + 1)))
def spectral_mulAv(n, v, av):
    for i in range(0, n):
        s = 0.0
        for j in range(0, n):
            s = (s + (spectral_aij(i, j) * v[j]))
        av[i] = s
def spectral_mulAtv(n, v, atv):
    for i in range(0, n):
        s = 0.0
        for j in range(0, n):
            s = (s + (spectral_aij(j, i) * v[j]))
        atv[i] = s
def spectral_run():
    n = 800
    u = [0.0] * (n)
    v = [0.0] * (n)
    tmp = [0.0] * (n)
    for i in range(0, n):
        u[i] = 1.0
    for it in range(0, 10):
        spectral_mulAv(n, u, tmp)
        spectral_mulAtv(n, tmp, v)
        spectral_mulAv(n, v, tmp)
        spectral_mulAtv(n, tmp, u)
    vbv = 0.0
    vv = 0.0
    for i in range(0, n):
        vbv = (vbv + (u[i] * v[i]))
        vv = (vv + (v[i] * v[i]))
    return int((math.sqrt((vbv / vv)) * 1000000000.0))
def fannkuch_run():
    n = 9
    perm1 = [0] * (n)
    perm = [0] * (n)
    count = [0] * (n)
    for i in range(0, n):
        perm1[i] = i
    maxFlips = 0
    checksum = 0
    permCount = 0
    r = n
    while (1 if 1 == 1 else 0):
        while (1 if r != 1 else 0):
            count[(r - 1)] = r
            r = (r - 1)
        for i in range(0, n):
            perm[i] = perm1[i]
        flips = 0
        k = perm[0]
        while (1 if k != 0 else 0):
            i = 0
            j = k
            while (1 if i < j else 0):
                t = perm[i]
                perm[i] = perm[j]
                perm[j] = t
                i = (i + 1)
                j = (j - 1)
            flips = (flips + 1)
            k = perm[0]
        if (1 if flips > maxFlips else 0):
            maxFlips = flips
        if (1 if (permCount % 2) == 0 else 0):
            checksum = (checksum + flips)
        else:
            checksum = (checksum - flips)
        seguir = 1
        while (1 if seguir == 1 else 0):
            if (1 if r == n else 0):
                return ((checksum * 1000) + maxFlips)
            p0 = perm1[0]
            q = 0
            while (1 if q < r else 0):
                perm1[q] = perm1[(q + 1)]
                q = (q + 1)
            perm1[r] = p0
            count[r] = (count[r] - 1)
            if (1 if count[r] > 0 else 0):
                seguir = 0
            else:
                r = (r + 1)
        permCount = (permCount + 1)
    return 0
def collatz_run():
    mejor = 0
    mejorPasos = 0
    for s in range(1, 400000):
        x = s
        pasos = 1
        while (1 if x != 1 else 0):
            if (1 if (x % 2) == 0 else 0):
                x = ((x) // (2))
            else:
                x = ((3 * x) + 1)
            pasos = (pasos + 1)
        if (1 if pasos > mejorPasos else 0):
            mejorPasos = pasos
            mejor = s
    return ((mejor * 1000) + mejorPasos)
def nqueens_coloca(n, fila, cols, d1, d2):
    if (1 if fila == n else 0):
        return 1
    total = 0
    for c in range(0, n):
        if (1 if ((1 if ((1 if cols[c] == 0 else 0) and (1 if d1[(fila + c)] == 0 else 0)) else 0) and (1 if d2[(((fila - c) + n) - 1)] == 0 else 0)) else 0):
            cols[c] = 1
            d1[(fila + c)] = 1
            d2[(((fila - c) + n) - 1)] = 1
            total = (total + nqueens_coloca(n, (fila + 1), cols, d1, d2))
            cols[c] = 0
            d1[(fila + c)] = 0
            d2[(((fila - c) + n) - 1)] = 0
    return total
def nqueens_run():
    n = 12
    return nqueens_coloca(n, 0, [0] * (n), [0] * ((2 * n)), [0] * ((2 * n)))
def quicksort_lcg(x):
    return ((x * 16807) % 2147483647)
def quicksort_qsort(a, lo, hi):
    if (1 if lo < hi else 0):
        p = a[(((lo + hi)) // (2))]
        i = lo
        j = hi
        while (1 if i <= j else 0):
            while (1 if a[i] < p else 0):
                i = (i + 1)
            while (1 if a[j] > p else 0):
                j = (j - 1)
            if (1 if i <= j else 0):
                t = a[i]
                a[i] = a[j]
                a[j] = t
                i = (i + 1)
                j = (j - 1)
        quicksort_qsort(a, lo, j)
        quicksort_qsort(a, i, hi)
def quicksort_run():
    n = 400000
    a = [0] * (n)
    x = 42
    for i in range(0, n):
        x = quicksort_lcg(x)
        a[i] = x
    quicksort_qsort(a, 0, (n - 1))
    c = 0
    for i in range(0, n):
        c = ((c + ((a[i] % 1000003) * ((i % 13) + 1))) % 1000000007)
    return c
def heapsort_lcg(x):
    return ((x * 16807) % 2147483647)
def heapsort_hunde(a, ini, fin):
    raiz = ini
    while (1 if ((raiz * 2) + 1) <= fin else 0):
        hijo = ((raiz * 2) + 1)
        cambio = raiz
        if (1 if a[cambio] < a[hijo] else 0):
            cambio = hijo
        if (1 if ((1 if (hijo + 1) <= fin else 0) and (1 if a[cambio] < a[(hijo + 1)] else 0)) else 0):
            cambio = (hijo + 1)
        if (1 if cambio == raiz else 0):
            return
        t = a[raiz]
        a[raiz] = a[cambio]
        a[cambio] = t
        raiz = cambio
def heapsort_run():
    n = 300000
    a = [0] * (n)
    x = 7
    for i in range(0, n):
        x = heapsort_lcg(x)
        a[i] = x
    ini = (((n - 2)) // (2))
    while (1 if ini >= 0 else 0):
        heapsort_hunde(a, ini, (n - 1))
        ini = (ini - 1)
    fin = (n - 1)
    while (1 if fin > 0 else 0):
        t = a[fin]
        a[fin] = a[0]
        a[0] = t
        fin = (fin - 1)
        heapsort_hunde(a, 0, fin)
    c = 0
    for i in range(0, n):
        c = ((c + ((a[i] % 1000003) * ((i % 13) + 1))) % 1000000007)
    return c
def bubble_lcg(x):
    return ((x * 16807) % 2147483647)
def bubble_run():
    n = 9000
    a = [0] * (n)
    x = 99
    for i in range(0, n):
        x = bubble_lcg(x)
        a[i] = (x % 100000)
    for i in range(0, (n - 1)):
        for j in range(0, ((n - 1) - i)):
            if (1 if a[j] > a[(j + 1)] else 0):
                t = a[j]
                a[j] = a[(j + 1)]
                a[(j + 1)] = t
    c = 0
    for i in range(0, n):
        c = ((c + (a[i] * ((i % 7) + 1))) % 1000000007)
    return c
def fibmod_run():
    a = 0
    b = 1
    for i in range(0, 15000000):
        t = ((a + b) % 1000000007)
        a = b
        b = t
    return b
def primos_esPrimo(n):
    if (1 if n < 2 else 0):
        return 0
    d = 2
    while (1 if (d * d) <= n else 0):
        if (1 if (n % d) == 0 else 0):
            return 0
        d = (d + 1)
    return 1
def primos_run():
    cuenta = 0
    for n in range(0, 200000):
        cuenta = (cuenta + primos_esPrimo(n))
    return cuenta
def mcd_mcd(a, b):
    while (1 if b != 0 else 0):
        t = (a % b)
        a = b
        b = t
    return a
def mcd_run():
    s = 0
    for i in range(1, 1500):
        for j in range(1, 1500):
            s = (s + mcd_mcd(i, j))
    return s
def leibniz_run():
    s = 0.0
    signo = 1.0
    for k in range(0, 20000000):
        s = (s + (signo / float(((2 * k) + 1))))
        signo = (-signo)
    return int(((s * 4.0) * 1000000000.0))
def montecarlo_lcg(x):
    return ((x * 16807) % 2147483647)
def montecarlo_run():
    x = 2024
    dentro = 0
    for i in range(0, 5000000):
        x = montecarlo_lcg(x)
        u = (float(x) / 2147483647.0)
        x = montecarlo_lcg(x)
        v = (float(x) / 2147483647.0)
        if (1 if ((u * u) + (v * v)) <= 1.0 else 0):
            dentro = (dentro + 1)
    return dentro
def saxpy_run():
    n = 1000000
    xs = [0.0] * (n)
    ys = [0.0] * (n)
    for i in range(0, n):
        xs[i] = (float((i % 100)) * 0.01)
        ys[i] = (float((i % 37)) * 0.5)
    for rep in range(0, 20):
        for i in range(0, n):
            ys[i] = ((0.5 * xs[i]) + ys[i])
    t = 0.0
    for i in range(0, n):
        t = (t + ys[i])
    return int((t * 1000.0))
def histograma_lcg(x):
    return ((x * 16807) % 2147483647)
def histograma_run():
    h = [0] * (1000)
    x = 5
    for i in range(0, 6000000):
        x = histograma_lcg(x)
        b = (x % 1000)
        h[b] = (h[b] + 1)
    c = 0
    for i in range(0, 1000):
        c = ((c + (h[i] * (i + 1))) % 1000000007)
    return c
def editdist_lcg(x):
    return ((x * 16807) % 2147483647)
def editdist_run():
    n = 5000
    s = [0] * (n)
    t = [0] * (n)
    x = 12345
    for i in range(0, n):
        x = editdist_lcg(x)
        s[i] = (x % 4)
        x = editdist_lcg(x)
        t[i] = (x % 4)
    prev = [0] * ((n + 1))
    cur = [0] * ((n + 1))
    for j in range(0, (n + 1)):
        prev[j] = j
    for i in range(1, (n + 1)):
        cur[0] = i
        for j in range(1, (n + 1)):
            costo = 1
            if (1 if s[(i - 1)] == t[(j - 1)] else 0):
                costo = 0
            mejor = (prev[(j - 1)] + costo)
            if (1 if (prev[j] + 1) < mejor else 0):
                mejor = (prev[j] + 1)
            if (1 if (cur[(j - 1)] + 1) < mejor else 0):
                mejor = (cur[(j - 1)] + 1)
            cur[j] = mejor
        for j in range(0, (n + 1)):
            prev[j] = cur[j]
    return prev[n]
def lcs_lcg(x):
    return ((x * 16807) % 2147483647)
def lcs_run():
    n = 5000
    s = [0] * (n)
    t = [0] * (n)
    x = 777
    for i in range(0, n):
        x = lcs_lcg(x)
        s[i] = (x % 4)
        x = lcs_lcg(x)
        t[i] = (x % 4)
    prev = [0] * ((n + 1))
    cur = [0] * ((n + 1))
    for i in range(1, (n + 1)):
        for j in range(1, (n + 1)):
            if (1 if s[(i - 1)] == t[(j - 1)] else 0):
                cur[j] = (prev[(j - 1)] + 1)
            else:
                if (1 if prev[j] > cur[(j - 1)] else 0):
                    cur[j] = prev[j]
                else:
                    cur[j] = cur[(j - 1)]
        for j in range(0, (n + 1)):
            prev[j] = cur[j]
    return prev[n]
def mochila_lcg(x):
    return ((x * 16807) % 2147483647)
def mochila_run():
    n = 1500
    cap = 20000
    w = [0] * (n)
    v = [0] * (n)
    x = 31
    for i in range(0, n):
        x = mochila_lcg(x)
        w[i] = (1 + (x % 50))
        x = mochila_lcg(x)
        v[i] = (x % 100)
    dp = [0] * ((cap + 1))
    for i in range(0, n):
        c = cap
        while (1 if c >= w[i] else 0):
            cand = (dp[(c - w[i])] + v[i])
            if (1 if cand > dp[c] else 0):
                dp[c] = cand
            c = (c - 1)
    return dp[cap]
def floyd_lcg(x):
    return ((x * 16807) % 2147483647)
def floyd_run():
    n = 350
    d = [0] * ((n * n))
    x = 11
    for i in range(0, n):
        for j in range(0, n):
            x = floyd_lcg(x)
            d[((i * n) + j)] = (1 + (x % 1000))
            if (1 if i == j else 0):
                d[((i * n) + j)] = 0
    for k in range(0, n):
        for i in range(0, n):
            for j in range(0, n):
                cand = (d[((i * n) + k)] + d[((k * n) + j)])
                if (1 if cand < d[((i * n) + j)] else 0):
                    d[((i * n) + j)] = cand
    c = 0
    for i in range(0, (n * n)):
        c = ((c + d[i]) % 1000000007)
    return c
def tak_tak(a, b, c):
    if (1 if b < a else 0):
        return tak_tak(tak_tak((a - 1), b, c), tak_tak((b - 1), c, a), tak_tak((c - 1), a, b))
    return c
def tak_run():
    return tak_tak(30, 20, 10)
def hanoi_mueve(n, a):
    if (1 if n == 0 else 0):
        return (a % 2)
    return ((hanoi_mueve((n - 1), (a + 1)) + hanoi_mueve((n - 1), (a + 2))) + 1)
def hanoi_run():
    return hanoi_mueve(25, 0)
t0 = time.perf_counter(); r = matmul_run(); print("matmul = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = nbody_run(); print("nbody = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = spectral_run(); print("spectral = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = fannkuch_run(); print("fannkuch = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = collatz_run(); print("collatz = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = nqueens_run(); print("nqueens = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = quicksort_run(); print("quicksort = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = heapsort_run(); print("heapsort = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = bubble_run(); print("bubble = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = fibmod_run(); print("fibmod = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = primos_run(); print("primos = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = mcd_run(); print("mcd = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = leibniz_run(); print("leibniz = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = montecarlo_run(); print("montecarlo = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = saxpy_run(); print("saxpy = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = histograma_run(); print("histograma = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = editdist_run(); print("editdist = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = lcs_run(); print("lcs = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = mochila_run(); print("mochila = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = floyd_run(); print("floyd = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = tak_run(); print("tak = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
t0 = time.perf_counter(); r = hanoi_run(); print("hanoi = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)
