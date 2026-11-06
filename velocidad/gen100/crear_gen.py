# Crea gen100/gen.js a partir de gen22/gen.js: nodos (v, w, i, d), nulo, arreglos de nodos, reloj en µs, un benchmark elegido por argumento y sin Rust.
import re, os
base = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(base, '..', 'gen22', 'gen.js'), encoding='utf8').read()

def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)

rep("const { SUITE } = require('./suite22.js');", "const { SUITE } = require('./suite100.js');")
rep("// gen.js — genera C, C++, Rust, JavaScript, Python y Ñ", "// gen.js (100) — genera C, JavaScript, Python y Ñ")
# lexer: el punto suelto (campo)
rep("[-+*\\/%<>=!(){}\\[\\],;:])/gy;", "[-+*\\/%<>=!(){}\\[\\],;:.])/gy;")
# tipos
rep("if (!['int', 'real', 'arr_int', 'arr_real'].includes(n)) throw new Error('tipo desconocido ' + n); return n; };",
    "if (!['int', 'real', 'arr_int', 'arr_real', 'nodo', 'arr_nodo'].includes(n)) throw new Error('tipo desconocido ' + n); return n; };")
# primarias: nulo y campos
rep("""    if (t.t === 'id') {
      if (es('(')) { next(); const args = []; if (!es(')')) { do { args.push(expr()); } while (es(',') && next()); } ex(')'); return { k: 'call', n: t.v, args }; }
      if (es('[')) { next(); const i = expr(); ex(']'); return { k: 'idx', n: t.v, i }; }
      return { k: 'id', n: t.v };
    }""", """    if (t.t === 'id') {
      let b;
      if (t.v === 'nulo') b = { k: 'nulo' };
      else if (es('(')) { next(); const args = []; if (!es(')')) { do { args.push(expr()); } while (es(',') && next()); } ex(')'); b = { k: 'call', n: t.v, args }; }
      else if (es('[')) { next(); const i = expr(); ex(']'); b = { k: 'idx', n: t.v, i }; }
      else b = { k: 'id', n: t.v };
      while (es('.')) { next(); b = { k: 'fld', o: b, f: ident() }; }
      return b;
    }""")
rep("if (e.k !== 'id' && e.k !== 'idx') throw new Error('no se puede asignar a eso');", "if (e.k !== 'id' && e.k !== 'idx' && e.k !== 'fld') throw new Error('no se puede asignar a eso');")
# comprobación de tipos
rep("const BUILTINS = { real: 'real', int: 'int', idiv: 'int', sqrt: 'real', newint: 'arr_int', newreal: 'arr_real' };",
    "const BUILTINS = { real: 'real', int: 'int', idiv: 'int', sqrt: 'real', newint: 'arr_int', newreal: 'arr_real', nuevo: 'nodo', liberar: 'void', liberar_arr: 'void', newnodo: 'arr_nodo', us: 'int' };")
rep("return t === 'arr_int' ? 'int' : 'real'; }", "return t === 'arr_int' ? 'int' : t === 'arr_nodo' ? 'nodo' : 'real'; }")
rep("        case 'un': { const t = tipoDe(e.a);", "        case 'nulo': return 'nodo';\n        case 'fld': { const t = tipoDe(e.o); if (t !== 'nodo') throw new Error(`${prefijo}.${f.n}: «.${e.f}» sobre algo que no es nodo`); if (!['v', 'w', 'i', 'd'].includes(e.f)) throw new Error('campo desconocido ' + e.f); return e.f === 'v' || e.f === 'w' ? 'int' : 'nodo'; }\n        case 'un': { const t = tipoDe(e.a);")
# fuera Rust
i0 = s.index("const Rs = {"); i1 = s.index("const Js = {")
s = s[:i0] + s[i1:]
i0 = s.index("// Rust\n{"); i1 = s.index("// JS\n{")
s = s[:i0] + s[i1:]
rep("Rs.firmas = null;\n", "")
rep("bench22", "bench100", s.count("bench22"))

rep("if (s.k === 'let') L.push(`${P}var ${s.n} = ${this.entero(s.ty, s.e, f, pre)}`);",
    "if (s.k === 'let') L.push(`${P}var ${s.n}${s.ty === 'nodo' || s.ty === 'arr_nodo' ? ': cualquiera' : ''} = ${this.entero(s.ty, s.e, f, pre)}`);")
# ── emisores: nodos ──
rep("// ── la suite ──", r"""// ── nodos: se añaden a cada emisor sin tocar el resto ──
const envuelve = (E, extra) => { const o = E.expr; E.expr = function (e, f, pre) { const r = extra.call(this, e, f, pre); return r !== undefined ? r : o.call(this, e, f, pre); }; };
Cc.ty = t => ({ int: 'long long', real: 'double', arr_int: 'long long*', arr_real: 'double*', nodo: 'Nodo*', arr_nodo: 'Nodo**' })[t];
envuelve(Cc, function (e, f, pre) { if (e.k === 'nulo') return 'NULL'; if (e.k === 'fld') return `(${this.expr(e.o, f, pre)})->${e.f}`; });
envuelve(Js, function (e, f, pre) { if (e.k === 'nulo') return 'null'; if (e.k === 'fld') return `${this.expr(e.o, f, pre)}.${e.f}`; });
envuelve(Py, function (e, f, pre) { if (e.k === 'nulo') return 'None'; if (e.k === 'fld') return `${this.expr(e.o, f, pre)}.${e.f}`; });
envuelve(Ni, function (e, f, pre) { if (e.k === 'nulo') return 'nulo'; if (e.k === 'fld') return `${this.expr(e.o, f, pre)}.${e.f}`; });
// builtins nuevos: se meten al principio del objeto de cada emisor
function conBuiltins(E, tabla) { const o = E.expr; E.expr = function (e, f, pre) { if (e.k === 'call' && tabla[e.n]) { e.builtin = true; return tabla[e.n](e.args.map(x => this.expr(x, f, pre))); } return o.call(this, e, f, pre); }; }
conBuiltins(Cc, { nuevo: a => `nuevo_nodo(${a[0]}, ${a[1]}, ${a[2]}, ${a[3]})`, liberar: a => `free((void*)(${a[0]}))`, liberar_arr: a => `free((void*)(${a[0]}))`, newnodo: a => `((Nodo**)calloc((size_t)(${a[0]}), 8))`, us: () => 'reloj_us()' });
conBuiltins(Js, { nuevo: a => `new Nodo(${a[0]}, ${a[1]}, ${a[2]}, ${a[3]})`, liberar: () => '0', liberar_arr: () => '0', newnodo: a => `new Array(${a[0]}).fill(null)`, us: () => 'Math.floor(performance.now() * 1000)' });
conBuiltins(Py, { nuevo: a => `Nodo(${a[0]}, ${a[1]}, ${a[2]}, ${a[3]})`, liberar: () => '0', liberar_arr: () => '0', newnodo: a => `[None] * (${a[0]})`, us: () => 'int(time.perf_counter() * 1e6)' });
conBuiltins(Ni, { nuevo: a => `Nodo(${a[0]}, ${a[1]}, ${a[2]}, ${a[3]})`, liberar: () => 'nulo', liberar_arr: () => 'nulo', newnodo: a => `nueva_nulos(${a[0]})`, us: () => 'entero(reloj() * 1000.0)' });

// ── la suite ──""")

# ── salidas con selección por argumento ──
i0 = s.index("// C\n{"); i1 = s.index("console.log(`generados")
salidas = r"""// C
{
  const L = ['/* bench100.c — generado por gen100/gen.js: no editar a mano. gcc -O2. Uso: bench100 [nombre] */',
    '#include <stdio.h>', '#include <stdlib.h>', '#include <string.h>', '#include <math.h>', '#include <time.h>',
    'typedef struct Nodo { long long v, w; struct Nodo *i, *d; } Nodo;',
    'static Nodo* nuevo_nodo(long long v, long long w, Nodo* i, Nodo* d) { Nodo* n = (Nodo*)malloc(sizeof(Nodo)); n->v = v; n->w = w; n->i = i; n->d = d; return n; }',
    'static double reloj(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }',
    'static long long reloj_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (long long)t.tv_sec * 1000000LL + t.tv_nsec / 1000; }'];
  for (const p of progs) for (const f of p.fns) L.push(Cc.func(f, p.nombre).split(String.fromCharCode(10))[0].replace(/ \{$/, ';'));
  for (const p of progs) for (const f of p.fns) L.push(Cc.func(f, p.nombre));
  L.push('int main(int argc, char** argv) {', '  double t0; long long r; const char* sel = argc > 1 ? argv[1] : NULL;');
  for (const p of progs) L.push(`  if (!sel || !strcmp(sel, "${p.nombre}")) { t0 = reloj(); r = ${p.nombre}_run(); printf("${p.nombre} = %lld en %.0f ms\\n", r, reloj() - t0); fflush(stdout); }`);
  L.push('  return 0;', '}');
  fs.writeFileSync(path.join(salida, 'bench100.c'), L.join('\n') + '\n');
}
// JS
{
  const L = ['// bench100.js — generado por gen100/gen.js: no editar a mano. Uso: node bench100.js [nombre]', "'use strict';",
    'class Nodo { constructor(v, w, i, d) { this.v = v; this.w = w; this.i = i; this.d = d; } }', 'const sel = process.argv[2];'];
  for (const p of progs) for (const f of p.fns) L.push(Js.func(f, p.nombre));
  for (const p of progs) L.push(`if (!sel || sel === "${p.nombre}") { const t0 = performance.now(); const r = ${p.nombre}_run(); console.log(\`${p.nombre} = \${r} en \${Math.round(performance.now() - t0)} ms\`); }`);
  fs.writeFileSync(path.join(salida, 'bench100.js'), L.join('\n') + '\n');
}
// Python
{
  const L = ['# bench100.py — generado por gen100/gen.js: no editar a mano. Uso: python3 bench100.py [nombre]', 'import math, sys, time, threading', 'sys.setrecursionlimit(1000000)',
    'class Nodo:', '    __slots__ = ("v", "w", "i", "d")', '    def __init__(self, v, w, i, d):', '        self.v = v; self.w = w; self.i = i; self.d = d',
    'sel = sys.argv[1] if len(sys.argv) > 1 else None'];
  for (const p of progs) for (const f of p.fns) L.push(Py.func(f, p.nombre));
  L.push('def principal():');
  for (const p of progs) { L.push(`    if sel is None or sel == "${p.nombre}":`); L.push(`        t0 = time.perf_counter(); r = ${p.nombre}_run(); print("${p.nombre} = %d en %d ms" % (r, round((time.perf_counter() - t0) * 1000)), flush=True)`); }
  L.push('threading.stack_size(512 * 1024 * 1024)', 'h = threading.Thread(target=principal)', 'h.start()', 'h.join()');
  fs.writeFileSync(path.join(salida, 'bench100.py'), L.join('\n') + '\n');
}
// Ñ
{
  const L = ['# bench100.esl — generado por gen100/gen.js: no editar a mano. Uso: bench100 [nombre]', 'usar raiz, redondear de "numerico"', '',
    'tipo Nodo {', '  v: real', '  w: real', '  i = nulo', '  d = nulo', '}',
    'fn nueva(n) {', '  var a = []', '  var i = 0', '  mientras i < n { agregar(a, 0)  i = i + 1 }', '  devolver a', '}',
    'fn nueva_nulos(n) {', '  var a = []', '  var i = 0', '  mientras i < n { agregar(a, nulo)  i = i + 1 }', '  devolver a', '}'];
  for (const p of progs) for (const f of p.fns) L.push(Ni.func(f, p.nombre));
  L.push('fn medir(nombre, f) {', '  fijo t0 = reloj()', '  fijo r = f()', '  imprimir(nombre + " = " + texto(r) + " en " + texto(redondear(reloj() - t0, 0)) + " ms")', '}',
    'fijo args = argumentos()', 'fijo sel = si longitud(args) > 0 entonces args[0] sino nulo');
  for (const p of progs) L.push(`si sel == nulo o sel == "${p.nombre}" { medir("${p.nombre}", funcion() { devolver ${p.nombre}_run() }) }`);
  fs.writeFileSync(path.join(salida, 'bench100.esl'), L.join('\n') + '\n');
}
fs.writeFileSync(path.join(salida, 'bench100.nombres'), nombres.join('\n') + '\n');
fs.writeFileSync(path.join(salida, 'bench100.meta.json'), JSON.stringify(SUITE.map(b => ({ nombre: b.nombre, grupo: b.grupo, desc: b.desc, nodet: !!b.nodet }))));
"""
s = s[:i0] + salidas + s[i1:]
open(os.path.join(base, 'gen.js'), 'w', encoding='utf8').write(s)
print('ok')
