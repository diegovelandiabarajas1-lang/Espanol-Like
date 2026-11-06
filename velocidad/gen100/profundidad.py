#!/usr/bin/env python3
# profundidad.py — ¿hasta qué profundidad de recursión llega cada lenguaje, y cómo falla? (benchmarks B9 y B14)
import os, sys, json, subprocess, signal, threading

V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = os.path.expanduser('~'); D = f'{H}/fdat/prof'; os.makedirs(D, exist_ok=True)
NODE_N = f'{H}/pjs/motor-exp/util/n-node.js'; COMP_N = f'{H}/pjs/motor-exp/util/n-compilar.js'
FUENTES = {
 'c.c': '#include <stdio.h>\n#include <stdlib.h>\nstatic long f(long n){ if(n==0) return 0; return 1+f(n-1); }\nint main(int c,char**v){ printf("%ld\\n", f(atol(v[1]))); return 0; }\n',
 'p.js': 'function f(n){ if(n===0) return 0; return 1+f(n-1); }\nconsole.log(f(parseInt(process.argv[2])));\n',
 'p.py': 'import sys\nprint(sys.getrecursionlimit() if len(sys.argv)>2 else 0)\n' if False else 'import sys\nsys.setrecursionlimit(int(sys.argv[2]) if len(sys.argv)>2 else 1000)\ndef f(n):\n    if n==0: return 0\n    return 1+f(n-1)\nprint(f(int(sys.argv[1])))\n',
 'p.esl': 'fn f(n) {\n  si n == 0 { devolver 0 }\n  devolver 1 + f(n - 1)\n}\nfijo a = argumentos()\nimprimir(f(entero(a[0])))\n',
}
for n, t in FUENTES.items(): open(f'{D}/{n}', 'w', encoding='utf8').write(t)
subprocess.run(['gcc', '-O0', '-o', f'{D}/c', f'{D}/c.c'], check=True)
subprocess.run(['node', COMP_N, f'{D}/p.esl', '-o', f'{D}/aot'], check=True, capture_output=True)

def corre(cmd, lim=60):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, preexec_fn=os.setsid)
    tm = threading.Timer(lim, lambda: os.killpg(os.getpgid(p.pid), signal.SIGKILL)); tm.start()
    o, e = p.communicate(); tm.cancel()
    return p.returncode, o.decode('utf8', 'replace').strip(), e.decode('utf8', 'replace').strip()

NIVELES = [100, 500, 800, 900, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000, 5000000, 20000000]
LANGS = {
 'C (pila de 8 MB)': lambda d: [f'{D}/c', str(d)],
 'JavaScript (Node 22)': lambda d: ['node', f'{D}/p.js', str(d)],
 'Python (límite por defecto, 1000)': lambda d: ['python3', f'{D}/p.py', str(d)],
 'Python (límite subido a 10M)': lambda d: ['python3', f'{D}/p.py', str(d), '10000000'],
 'Ñ AOT': lambda d: [f'{D}/aot', str(d)],
 'Ñ JIT': lambda d: ['node', NODE_N, f'{D}/p.esl', str(d)],
}
res = {}
for l, mk in LANGS.items():
    maxok = 0; fallo = None
    for d in NIVELES:
        rc, o, e = corre(mk(d))
        if rc == 0 and o == str(d): maxok = d
        else:
            fallo = (d, rc, (e or o).splitlines()[0][:110] if (e or o) else f'rc={rc}')
            break
    res[l] = {'maximo_ok': maxok, 'primer_fallo': fallo}
    print(l, res[l], flush=True)
os.makedirs(f'{V}/resultados-100', exist_ok=True)
json.dump(res, open(f'{V}/resultados-100/profundidad.json', 'w'), ensure_ascii=False, indent=1)
