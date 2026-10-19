"""comparar/pytorch.py — las seis pruebas con PyTorch, en CPU y en GPU (CUDA).
    python pytorch.py [chica]
float64 en los dos. Los datos se crean ya en el dispositivo y el resultado se
queda allí; antes y después de medir se sincroniza la GPU (torch.cuda.synchronize).
"""
import sys, time, torch

chica = len(sys.argv) > 1 and sys.argv[1] == 'chica'
NS = [128, 256] if chica else [1024, 2048]
NV, SM, SK, NF = (65536, 256, 1024, 16384) if chica else (1 << 24, 4096, 1024, 1 << 20)
dispositivos = ['cpu'] + (['cuda'] if torch.cuda.is_available() else [])
print(f'# torch {torch.__version__} · hilos CPU {torch.get_num_threads()} · ' +
      (torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'sin GPU'), flush=True)

for dev in dispositivos:
    sync = torch.cuda.synchronize if dev == 'cuda' else (lambda: None)
    nombre = 'gpu' if dev == 'cuda' else 'cpu'
    def medir(prueba, tam, f, h):
        r = f(); sync()
        mejor = float('inf')
        for _ in range(3):
            t0 = time.perf_counter(); r = f(); sync()
            mejor = min(mejor, (time.perf_counter() - t0) * 1000)
        print(f'RES,{prueba},{tam},{nombre},{mejor:.6f},{float(h(r))!r},f64', flush=True)
    for n in NS:
        i = torch.arange(n, device=dev).view(-1, 1); j = torch.arange(n, device=dev).view(1, -1)
        A = ((i * 7 + j * 3) % 13).double() / 13 - 0.5
        B = ((i * 5 + j * 11) % 17).double() / 17 - 0.5
        medir('matmul', str(n), lambda: A @ B, lambda C: C.sum())
        del A, B
    x = (torch.arange(NV, device=dev) % 1000).double() / 1000
    medir('seno', str(NV), lambda: torch.sin(x), lambda y: y.sum())
    medir('x*2+1', str(NV), lambda: x * 2 + 1, lambda y: y.sum())
    medir('suma', str(NV), lambda: x.sum(), lambda s: s)
    i = torch.arange(SM, device=dev).view(-1, 1); j = torch.arange(SK, device=dev).view(1, -1)
    S = ((i * 3 + j) % 50).double() / 10
    medir('softmax', f'{SM}x{SK}', lambda: torch.softmax(S, dim=1), lambda Y: (Y * Y).sum())
    xf = (torch.arange(NF, device=dev) % 1000).double() / 1000
    medir('fft', str(NF), lambda: torch.fft.fft(xf), lambda X: X.abs().sum())
    del x, S, xf
    if dev == 'cuda': torch.cuda.empty_cache()
