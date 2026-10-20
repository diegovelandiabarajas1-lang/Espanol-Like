"""Las huellas de referencia de la comparación entre lenguajes, con NumPy en
float64 (los mismos datos que en LEEME.md). Cada lenguaje se compara con esto:
diferencia relativa ~1e-12 en doble, ~1e-4 en simple (float32)."""
import numpy as np

def datos_matriz(n):
    i = np.arange(n)[:, None]; j = np.arange(n)[None, :]
    return ((i * 7 + j * 3) % 13) / 13.0 - 0.5, ((i * 5 + j * 11) % 17) / 17.0 - 0.5

def vector(n):
    return (np.arange(n) % 1000) / 1000.0

def softmax_datos(m, k):
    i = np.arange(m)[:, None]; j = np.arange(k)[None, :]
    return ((i * 3 + j) % 50) / 10.0

def huellas(ns=(1024, 2048), nv=1 << 24, sm=4096, sk=1024, nf=1 << 20):
    out = {}
    for n in ns:
        A, B = datos_matriz(n)
        out[('matmul', str(n))] = float((A @ B).sum())
        out[('matmul32', str(n))] = out[('matmul', str(n))]   # la misma cuenta, medida en float32 (tolerancia 1e-3)
    x = vector(nv)
    out[('seno', str(nv))] = float(np.sin(x).sum())
    out[('x*2+1', str(nv))] = float((x * 2 + 1).sum())
    out[('suma', str(nv))] = float(x.sum())
    S = softmax_datos(sm, sk)
    e = np.exp(S - S.max(axis=1, keepdims=True)); Y = e / e.sum(axis=1, keepdims=True)
    out[('softmax', f'{sm}x{sk}')] = float((Y * Y).sum())
    out[('fft', str(nf))] = float(np.abs(np.fft.fft(vector(nf))).sum())
    return out

if __name__ == '__main__':
    import sys
    chica = len(sys.argv) > 1 and sys.argv[1] == 'chica'
    r = huellas((128, 256), 65536, 256, 1024, 16384) if chica else huellas()
    for (p, t), v in r.items(): print(p, t, repr(v))
