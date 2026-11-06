#!/usr/bin/env python3
# tabla100.py — arma resultados-100/TABLA-100.md con los resultados de correr100.py y grupo_f.py
import json, os, math, re
V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = f'{V}/resultados-100'
res = json.load(open(f'{R}/resultados.json', encoding='utf8'))
meta = {m['nombre']: m for m in json.load(open(f'{V}/bench100.meta.json', encoding='utf8'))}
F = json.load(open(f'{R}/grupo_f.json', encoding='utf8')) if os.path.exists(f'{R}/grupo_f.json') else {}
COLS = [('C', 'C'), ('AOT', 'Ñ AOT'), ('AOT-SC', 'Ñ AOT sin comprobar'), ('JS', 'JavaScript'), ('JIT', 'Ñ JIT'), ('Python', 'Python')]
GRUPOS = {'A': 'Grupo A · memoria y objetos', 'B': 'Grupo B · recursión y pila', 'C': 'Grupo C · comprobaciones de índice y seguridad', 'E': 'Grupo E · memoria, caché y diseño'}

def celda(r, c_ms):
    if r is None: return '—'
    if r['estado'] == 'tiempo': return '>45 s'
    if r['estado'] == 'error':
        m = r.get('msg', '')
        if 'desbordamiento' in m or 'RecursionError' in m or 'Maximum call stack' in m or 'stack' in m.lower() or m.startswith('/mnt') or m.startswith('Traceback'): return '✗ pila'
        if r.get('rc') == -11: return '✗ se cae (segfault)'
        return '✗ ' + (m[:28] if m else f"rc={r.get('rc')}")
    ms = r['ms']
    return f"{ms} ms (×{ms / c_ms:.1f})" if c_ms else f"{ms} ms"

def geo(lang, nombres):
    xs = []
    for n in nombres:
        c = res.get(n, {}).get('C'); r = res.get(n, {}).get(lang)
        if c and r and c['estado'] == 'ok' and r['estado'] == 'ok' and not meta[n]['nodet']:
            xs.append(max(r['ms'], 1) / max(c['ms'], 1))
    return (math.exp(sum(math.log(x) for x in xs) / len(xs)), len(xs)) if xs else (None, 0)

L = ['# Los benchmarks "para romper un lenguaje" · Ñ frente a C, JavaScript y Python', '',
     'Medido en WSL (Ubuntu, gcc 15 `-O2`, Node 22, Python 3.14) en el mismo equipo (i3-1115G4, 4 hilos). Cada benchmark corre en su **propio proceso**, en cada lenguaje;',
     'el tiempo es el que imprime el propio programa (mejor de 3 para C, JavaScript y Ñ AOT; 1 corrida para Python y Ñ JIT). `×N` = veces el tiempo de C. `✗ pila` = el',
     'programa murió por desbordamiento de pila. `>45 s` = tiempo agotado. Rust y C++ no están en esta tabla: Rust no está instalado en WSL y C++ es el mismo C.', '']
malos = []
for g, titulo in GRUPOS.items():
    nombres = [n for n in meta if meta[n]['grupo'] == g and n in res]
    if not nombres: continue
    L += [f'## {titulo}', '', '| benchmark | qué hace | ' + ' | '.join(t for _, t in COLS) + ' |', '|---|---|' + '---|' * len(COLS)]
    for n in nombres:
        r = res[n]; c = r.get('C'); c_ms = c['ms'] if c and c['estado'] == 'ok' else None
        # ¿calcularon lo mismo?
        vals = {l: r[l]['valor'] for l in r if r[l] and r[l]['estado'] == 'ok'}
        dif = '' if meta[n]['nodet'] or len(set(vals.values())) <= 1 else ' ⚠'
        if dif: malos.append((n, vals))
        L.append(f"| {n}{dif} | {meta[n]['desc']} | " + ' | '.join(celda(r.get(k), c_ms) for k, _ in COLS) + ' |')
    gm = ['**media geométrica**', f'(sobre los que terminan)']
    for k, _ in COLS:
        v, cnt = geo(k, nombres)
        gm.append('×1.00' if k == 'C' else (f'**×{v:.2f}** ({cnt})' if v else '—'))
    L.append('| ' + ' | '.join(gm) + ' |')
    L.append('')
    if g in ('A', 'E', 'C'):
        L += [f'Memoria pico (MB) — {titulo.split("· ")[1]}', '', '| benchmark | C | Ñ AOT | JavaScript | Python |', '|---|---|---|---|---|']
        for n in nombres:
            r = res[n]
            f = lambda k: (f"{r[k]['mb']:.0f}" if r.get(k) and r[k]['estado'] == 'ok' else '—')
            L.append(f"| {n} | {f('C')} | {f('AOT')} | {f('JS')} | {f('Python')} |")
        L.append('')
if malos:
    L += ['### ⚠ No calcularon lo mismo', '']
    for n, v in malos: L.append(f'- {n}: ' + ' · '.join(f'{k}={x}' for k, x in v.items()))
    L.append('')

# ── grupo F ──
if F:
    L += ['## Grupo F · arranque, archivos y casos reales', '', 'Cada programa se mide como **proceso completo** (incluye el arranque). Tiempo de pared y memoria pico.', '',
          '| benchmark | ' + ' | '.join(t for _, t in COLS) + ' |', '|---|' + '---|' * len(COLS)]
    for n, r in F.items():
        if n.startswith('_'): continue
        c = r.get('C'); c_ms = c['ms'] if c and c.get('estado') == 'ok' else None
        def cf(x):
            if not x: return '—'
            if x['estado'] == 'tiempo': return '>100 s'
            if x['estado'] == 'error': return '✗ ' + x.get('msg', '')[:30]
            return f"{x['ms']} ms (×{x['ms'] / max(c_ms, 1):.1f}) · {x['mb']:.0f} MB" if c_ms is not None else f"{x['ms']} ms · {x['mb']:.0f} MB"
        L.append(f'| {n} | ' + ' | '.join(cf(r.get(k)) for k, _ in COLS) + ' |')
    L.append('')
    if '_compilacion_ms' in F:
        L += ['### Tiempo de compilación (los 22 benchmarks de bench22)', '']
        for k, v in F['_compilacion_ms'].items(): L.append(f'- {k}: {v} ms')
        L += ['', '### Tamaño del binario', '']
        for k, v in F['_tamano_bytes'].items(): L.append(f'- {k}: {v / 1024:.0f} KB')
        L.append('')

# ── profundidad de recursión ──
if os.path.exists(f'{R}/profundidad.json'):
    P = json.load(open(f'{R}/profundidad.json', encoding='utf8'))
    L += ['## Profundidad de recursión (B9 y B14)', '', 'Función `f(n) = 1 + f(n-1)` (sin cola, sin optimizar) llamada con profundidad creciente; se anota la mayor que termina bien y cómo falla la siguiente.', '',
          '| lenguaje | mayor profundidad que termina | la siguiente falla así |', '|---|---|---|']
    for l, r in P.items():
        fa = r['primer_fallo']
        L.append(f"| {l} | {r['maximo_ok']:,} | " + (f"{fa[0]:,}: {fa[2]}" if fa else 'no falló hasta 20M') + ' |')
    L.append('')

# ── los que no aplican ──
L += ['## Lo que no se midió, y por qué', '',
      '**Ñ no tiene** (en el ejecutable nativo): hilos ni paralelismo general (el grupo D completo, 15 benchmarks), referencias débiles (A16), finalizadores (A17), JSON nativo (A9, F), regex (F), red/HTTP (F), SIMD explícito (E84), objetos en la pila (E83), control de relleno de estructuras (E79).',
      '**No medido por exigir otro arnés:** latencia p99.9 con carga mixta (A11) y pausa de «stop-the-world» (A20 se midió solo como el tiempo de soltar un heap grande de golpe), arranque en contenedor sin caché de disco (F99), cierres/lambdas recursivos (B16), `string indexing` (C58).',
      '**Medidos de otra forma:** B9 y B14 (profundidad máxima) → sección «Profundidad de recursión»; C54 (con y sin `--sin-comprobar`) → son las columnas «Ñ AOT» y «Ñ AOT sin comprobar» de todo el grupo C; A19 (pico vs. promedio de memoria) → tablas de memoria pico.', '']
open(f'{R}/TABLA-100.md', 'w', encoding='utf8').write('\n'.join(L) + '\n')
print('escrito', f'{R}/TABLA-100.md', len(L), 'líneas')
