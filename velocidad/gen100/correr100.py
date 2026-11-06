#!/usr/bin/env python3
# correr100.py — corre cada benchmark de bench100 en su propio proceso, en cada lenguaje: tiempo (el que imprime el programa), memoria pico (wait4) y estado.
#   python3 correr100.py [--langs C,JS,...] [--names a01,b21] [--reps 3] [--salida resultados.json]
import os, sys, json, time, subprocess, threading, signal, re, resource

V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # velocidad/
B = os.environ.get('B100', os.path.expanduser('~/b100'))                                    # donde están los ejecutables
NODE_N = os.path.expanduser('~/pjs/motor-exp/util/n-node.js')
LANGS = {
    'C':       lambda n: [f'{B}/c', n],
    'JS':      lambda n: ['node', f'{V}/bench100.js', n],
    'Python':  lambda n: ['python3', f'{V}/bench100.py', n],
    'AOT':     lambda n: [f'{B}/aot', n],
    'AOT-SC':  lambda n: [f'{B}/aotsc', n],
    'JIT':     lambda n: ['node', NODE_N, f'{V}/bench100.esl', n],
}
REPS = {'C': 3, 'JS': 3, 'AOT': 3, 'AOT-SC': 3, 'Python': 1, 'JIT': 1}
LIMITE = {'C': 90, 'JS': 90, 'AOT': 90, 'AOT-SC': 90, 'Python': 45, 'JIT': 45}

def correr(cmd, limite):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, preexec_fn=os.setsid)
    agotado = [False]
    def matar():
        agotado[0] = True
        try: os.killpg(os.getpgid(p.pid), signal.SIGKILL)
        except Exception: pass
    tm = threading.Timer(limite, matar); tm.start()
    t0 = time.time()
    err_buf = []
    th = threading.Thread(target=lambda: err_buf.append(p.stderr.read())); th.start()
    out = p.stdout.read()
    th.join()
    _, st, ru = os.wait4(p.pid, 0)      # la memoria pico de ESTE proceso
    tm.cancel()
    rc = os.WEXITSTATUS(st) if os.WIFEXITED(st) else -os.WTERMSIG(st)
    return out.decode('utf8', 'replace'), (err_buf[0] if err_buf else b'').decode('utf8', 'replace'), rc, agotado[0], time.time() - t0, ru.ru_maxrss / 1024.0

def una(lang, nombre):
    mejor = None
    for _ in range(REPS[lang]):
        out, err, rc, agotado, seg, mb = correr(LANGS[lang](nombre), LIMITE[lang])
        if agotado: return {'estado': 'tiempo', 'seg': round(seg)}
        m = re.search(r'^' + re.escape(nombre) + r' = (\S+) en (\d+) ms', out, re.M)
        if rc != 0 or not m:
            primera = (err.strip() or out.strip()).splitlines()
            msg = next((l for l in primera if l.strip()), '')[:120]
            return {'estado': 'error', 'rc': rc, 'msg': msg}
        r = {'estado': 'ok', 'valor': m.group(1), 'ms': int(m.group(2)), 'mb': round(mb, 1)}
        if mejor is None or r['ms'] < mejor['ms']: mejor = r
    return mejor

def main():
    a = sys.argv[1:]
    langs = list(LANGS); nombres = [l.strip() for l in open(f'{V}/bench100.nombres') if l.strip()]
    salida = f'{V}/resultados-100/resultados.json'; conRss = True
    i = 0
    while i < len(a):
        if a[i] == '--langs': langs = a[i + 1].split(','); i += 2
        elif a[i] == '--names': pref = a[i + 1].split(','); nombres = [n for n in nombres if any(n.startswith(p) for p in pref)]; i += 2
        elif a[i] == '--reps':
            for k in REPS: REPS[k] = int(a[i + 1])
            i += 2
        elif a[i] == '--salida': salida = a[i + 1]; i += 2
        elif a[i] == '--sin-rss': conRss = False; i += 1
        else: i += 1
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    res = json.load(open(salida)) if os.path.exists(salida) else {}
    for n in nombres:
        res.setdefault(n, {})
        for l in langs:
            r = una(l, n)
            res[n][l] = r
            print(f"{n:28} {l:7} {r.get('estado'):7} {r.get('ms', ''):>7} {r.get('mb', ''):>7} {r.get('msg', '')}", flush=True)
            json.dump(res, open(salida, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
