// gen.js (100) — genera C, JavaScript, Python y Ñ a partir de benchmarks escritos UNA vez en un mini-lenguaje tipado.
//
//   node gen.js            escribe ../bench100.c  ../bench100.rs  ../bench100.js  ../bench100.py  ../bench100.esl
//                          (el C++ es el mismo bench100.c compilado con g++ -x c++)
//
// El mini-lenguaje (C con tipos explícitos):
//   tipos:   int (64 bits), real (double), arr_int, arr_real
//   fn nombre(p: T, …): T { … }            let x: T = e;     x = e;     a[e] = e;
//   for i in lo..hi { … }                  while (c) { … }   if (c) { … } else { … }     return e;
//   expresiones: + - * / % < <= > >= == != && || !   (int con int, real con real: nada de mezclar)
//   builtins: real(i) int→real · int(x) real→int (trunca) · idiv(a,b) división entera (solo no negativos) · sqrt(x)
//             newint(n) newreal(n) (arreglos de ceros)
// Para que TODOS los lenguajes calculen lo mismo: los enteros no pasan de 2^53, % e idiv solo con no negativos, y de los reales solo
// se usan + − × ÷ y raíz (correctamente redondeadas); cada benchmark devuelve un int.
'use strict';
const fs = require('fs');
const path = require('path');

// ── lexer ──
function lex(src) {
  const toks = [];
  const re = /\s+|\/\/[^\n]*|(\d+\.\d+|\d+)|([A-Za-z_]\w*)|(\.\.|&&|\|\||<=|>=|==|!=|[-+*\/%<>=!(){}\[\],;:.])/gy;
  let m, pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) throw new Error('carácter inesperado en: ' + src.slice(pos, pos + 30));
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) toks.push({ t: 'op', v: m[3] });
  }
  return toks;
}
// ── parser ──
function parse(src) {
  const T = lex(src);
  let p = 0;
  const peek = () => T[p], next = () => T[p++];
  const es = v => T[p] && T[p].v === v && T[p].t !== 'num';
  const ex = v => { if (!es(v)) throw new Error(`se esperaba «${v}» y llegó «${T[p] && T[p].v}»`); p++; };
  const ident = () => { const t = next(); if (!t || t.t !== 'id') throw new Error('se esperaba un nombre'); return t.v; };
  const tipo = () => { const n = ident(); if (!['int', 'real', 'arr_int', 'arr_real', 'nodo', 'arr_nodo'].includes(n)) throw new Error('tipo desconocido ' + n); return n; };
  const prim = () => {
    const t = next();
    if (t.t === 'num') return { k: 'num', v: t.v, t: t.v.includes('.') ? 'real' : 'int' };
    if (t.v === '(') { const e = expr(); ex(')'); return e; }
    if (t.v === '-') return { k: 'un', op: '-', a: unary() };
    if (t.v === '!') return { k: 'un', op: '!', a: unary() };
    if (t.t === 'id') {
      let b;
      if (t.v === 'nulo') b = { k: 'nulo' };
      else if (es('(')) { next(); const args = []; if (!es(')')) { do { args.push(expr()); } while (es(',') && next()); } ex(')'); b = { k: 'call', n: t.v, args }; }
      else if (es('[')) { next(); const i = expr(); ex(']'); b = { k: 'idx', n: t.v, i }; }
      else b = { k: 'id', n: t.v };
      while (es('.')) { next(); b = { k: 'fld', o: b, f: ident() }; }
      return b;
    }
    throw new Error('expresión inesperada: ' + t.v);
  };
  const unary = () => prim();
  const nivel = (ops, sub) => () => { let a = sub(); while (T[p] && T[p].t === 'op' && ops.includes(T[p].v)) { const op = next().v; a = { k: 'bin', op, a, b: sub() }; } return a; };
  const mul = nivel(['*', '/', '%'], unary), sum = nivel(['+', '-'], mul), cmp = nivel(['<', '<=', '>', '>=', '==', '!='], sum),
    and = nivel(['&&'], cmp), or = nivel(['||'], and);
  const expr = or;
  const bloque = () => { ex('{'); const b = []; while (!es('}')) b.push(stmt()); ex('}'); return b; };
  const stmt = () => {
    const t = peek();
    if (t.t === 'id') {
      if (t.v === 'let') { next(); const n = ident(); ex(':'); const ty = tipo(); ex('='); const e = expr(); ex(';'); return { k: 'let', n, ty, e }; }
      if (t.v === 'for') { next(); const v = ident(); ex('in'.length ? 'in' : 'in'); const lo = expr(); ex('..'); const hi = expr(); return { k: 'for', v, lo, hi, body: bloque() }; }
      if (t.v === 'while') { next(); ex('('); const c = expr(); ex(')'); return { k: 'while', c, body: bloque() }; }
      if (t.v === 'if') {
        next(); ex('('); const c = expr(); ex(')'); const a = bloque(); let b = null;
        if (es('else')) { next(); b = es('if') ? [stmt()] : bloque(); }
        return { k: 'if', c, a, b };
      }
      if (t.v === 'return') { next(); if (es(';')) { next(); return { k: 'ret', e: null }; } const e = expr(); ex(';'); return { k: 'ret', e }; }
    }
    // asignación o llamada
    const e = expr();
    if (es('=')) { next(); const v = expr(); ex(';'); if (e.k !== 'id' && e.k !== 'idx' && e.k !== 'fld') throw new Error('no se puede asignar a eso'); return { k: 'set', lhs: e, e: v }; }
    ex(';');
    return { k: 'expr', e };
  };
  const fns = [];
  while (p < T.length) {
    if (!es('fn')) throw new Error('se esperaba «fn»');
    next(); const n = ident(); ex('('); const ps = [];
    if (!es(')')) { do { const pn = ident(); ex(':'); ps.push({ n: pn, t: tipo() }); } while (es(',') && next()); }
    ex(')'); let ret = null; if (es(':')) { next(); ret = tipo(); }
    fns.push({ n, ps, ret, body: bloque() });
  }
  return fns;
}

// ── tipos ──
const BUILTINS = { real: 'real', int: 'int', idiv: 'int', sqrt: 'real', newint: 'arr_int', newreal: 'arr_real', nuevo: 'nodo', liberar: 'void', liberar_arr: 'void', newnodo: 'arr_nodo', us: 'int' };
const RESERVADAS = new Set(['y', 'o', 'no', 'en', 'si', 'sino', 'para', 'mientras', 'devolver', 'fn', 'var', 'fijo', 'cierto', 'falso', 'nulo', 'tipo', 'usar', 'segun', 'caso', 'otro', 'yo',
  'int', 'double', 'long', 'char', 'float', 'void', 'struct', 'static', 'const', 'auto', 'break', 'continue', 'default', 'do', 'else', 'enum', 'extern', 'goto', 'register', 'return', 'short', 'signed', 'sizeof', 'switch', 'typedef', 'union', 'unsigned', 'volatile', 'while', 'class', 'new', 'delete', 'this', 'template', 'namespace', 'operator', 'public', 'private',
  'let', 'mut', 'match', 'loop', 'impl', 'trait', 'use', 'mod', 'pub', 'ref', 'self', 'where', 'move', 'crate', 'dyn', 'as', 'const', 'type', 'unsafe', 'box',
  'function', 'var', 'null', 'undefined', 'typeof', 'delete', 'void', 'with', 'yield', 'await', 'async', 'export', 'import',
  'def', 'del', 'is', 'in', 'not', 'and', 'or', 'pass', 'raise', 'try', 'except', 'from', 'global', 'lambda', 'None', 'True', 'False', 'assert', 'elif', 'finally']);
function chequear(fns, prefijo) {
  const firmas = new Map(fns.map(f => [f.n, f]));
  for (const f of fns) {
    const vars = new Map(f.ps.map(p => [p.n, p.t]));
    f.vars = vars;
    const tipoDe = e => {
      switch (e.k) {
        case 'num': return e.t;
        case 'id': if (!vars.has(e.n)) throw new Error(`${prefijo}.${f.n}: variable «${e.n}» sin declarar`); return vars.get(e.n);
        case 'idx': { const t = vars.get(e.n); if (!t || !t.startsWith('arr_')) throw new Error(`${prefijo}.${f.n}: «${e.n}» no es un arreglo`); if (tipoDe(e.i) !== 'int') throw new Error('el índice tiene que ser int'); return t === 'arr_int' ? 'int' : t === 'arr_nodo' ? 'nodo' : 'real'; }
        case 'nulo': return 'nodo';
        case 'fld': { const t = tipoDe(e.o); if (t !== 'nodo') throw new Error(`${prefijo}.${f.n}: «.${e.f}» sobre algo que no es nodo`); if (!['v', 'w', 'i', 'd'].includes(e.f)) throw new Error('campo desconocido ' + e.f); return e.f === 'v' || e.f === 'w' ? 'int' : 'nodo'; }
        case 'un': { const t = tipoDe(e.a); return e.op === '!' ? 'int' : t; }
        case 'bin': {
          const a = tipoDe(e.a), b = tipoDe(e.b);
          if (a !== b) throw new Error(`${prefijo}.${f.n}: «${e.op}» mezcla ${a} y ${b}`);
          if (['<', '<=', '>', '>=', '==', '!=', '&&', '||'].includes(e.op)) return 'int';
          if (e.op === '/' && a !== 'real') throw new Error(`${prefijo}.${f.n}: «/» solo con reales (usa idiv)`);
          if (e.op === '%' && a !== 'int') throw new Error('«%» solo con ints');
          return a;
        }
        case 'call': {
          e.args.forEach(tipoDe);
          if (BUILTINS[e.n]) { e.builtin = true; return BUILTINS[e.n]; }
          const g = firmas.get(e.n); if (!g) throw new Error(`${prefijo}.${f.n}: función «${e.n}» desconocida`);
          if (g.ps.length !== e.args.length) throw new Error(`${e.n}: aridad`);
          g.ps.forEach((p, i) => { if (tipoDe(e.args[i]) !== p.t) throw new Error(`${prefijo}.${e.n}: el argumento ${i + 1} es ${tipoDe(e.args[i])} y se esperaba ${p.t}`); });
          return g.ret;
        }
      }
    };
    e_tipo = tipoDe;
    const rec = body => {
      for (const s of body) {
        if (s.k === 'let') { if (RESERVADAS.has(s.n)) throw new Error('nombre reservado: ' + s.n); if (vars.has(s.n) && vars.get(s.n) !== s.ty) throw new Error(`«${s.n}» con dos tipos`); if (tipoDe(s.e) !== s.ty) throw new Error(`${prefijo}.${f.n}: let ${s.n}: ${s.ty} = ${tipoDe(s.e)}`); vars.set(s.n, s.ty); }
        else if (s.k === 'set') { const t = s.lhs.k === 'id' ? tipoDe(s.lhs) : tipoDe(s.lhs); if (tipoDe(s.e) !== t) throw new Error(`${prefijo}.${f.n}: asigna ${tipoDe(s.e)} a ${t}`); }
        else if (s.k === 'for') { if (RESERVADAS.has(s.v)) throw new Error('nombre reservado: ' + s.v); vars.set(s.v, 'int'); tipoDe(s.lo); tipoDe(s.hi); rec(s.body); }
        else if (s.k === 'while') { tipoDe(s.c); rec(s.body); }
        else if (s.k === 'if') { tipoDe(s.c); rec(s.a); if (s.b) rec(s.b); }
        else if (s.k === 'ret') { if (!s.e) continue; const t = tipoDe(s.e); if (t !== f.ret) throw new Error(`${prefijo}.${f.n}: devuelve ${t} y debía ser ${f.ret}`); }
        else if (s.k === 'expr') tipoDe(s.e);
      }
    };
    rec(f.body);
    for (const p of f.ps) if (RESERVADAS.has(p.n)) throw new Error('nombre reservado: ' + p.n);
    f.tipoDe = tipoDe;
  }
}
let e_tipo = null;

// ── emisores ──
const Cc = {
  ty: t => ({ int: 'long long', real: 'double', arr_int: 'long long*', arr_real: 'double*' })[t],
  fn: (pre, n) => `${pre}_${n}`,
  expr(e, f, pre) {
    const E = x => this.expr(x, f, pre);
    switch (e.k) {
      case 'num': return e.t === 'real' ? e.v : e.v + 'LL';
      case 'id': return e.n;
      case 'idx': return `${e.n}[${E(e.i)}]`;
      case 'un': return `(${e.op}${E(e.a)})`;
      case 'bin': return `(${E(e.a)} ${e.op} ${E(e.b)})`;
      case 'call': {
        const a = e.args.map(E);
        if (e.builtin) return ({ real: `((double)(${a[0]}))`, int: `((long long)(${a[0]}))`, idiv: `((${a[0]}) / (${a[1]}))`, sqrt: `sqrt(${a[0]})`, newint: `((long long*)calloc((size_t)(${a[0]}), 8))`, newreal: `((double*)calloc((size_t)(${a[0]}), 8))` })[e.n];
        return `${this.fn(pre, e.n)}(${a.join(', ')})`;
      }
    }
  },
  stmts(body, f, pre, ind) {
    const L = [], P = ' '.repeat(ind);
    for (const s of body) {
      if (s.k === 'let') L.push(`${P}${this.ty(s.ty)} ${s.n} = ${this.expr(s.e, f, pre)};`);
      else if (s.k === 'set') L.push(`${P}${this.expr(s.lhs, f, pre)} = ${this.expr(s.e, f, pre)};`);
      else if (s.k === 'for') { L.push(`${P}for (long long ${s.v} = ${this.expr(s.lo, f, pre)}; ${s.v} < ${this.expr(s.hi, f, pre)}; ${s.v}++) {`); L.push(...this.stmts(s.body, f, pre, ind + 2)); L.push(`${P}}`); }
      else if (s.k === 'while') { L.push(`${P}while (${this.expr(s.c, f, pre)}) {`); L.push(...this.stmts(s.body, f, pre, ind + 2)); L.push(`${P}}`); }
      else if (s.k === 'if') { L.push(`${P}if (${this.expr(s.c, f, pre)}) {`); L.push(...this.stmts(s.a, f, pre, ind + 2)); if (s.b) { L.push(`${P}} else {`); L.push(...this.stmts(s.b, f, pre, ind + 2)); } L.push(`${P}}`); }
      else if (s.k === 'ret') L.push(s.e ? `${P}return ${this.expr(s.e, f, pre)};` : `${P}return;`);
      else L.push(`${P}${this.expr(s.e, f, pre)};`);
    }
    return L;
  },
  func(f, pre) {
    const ps = f.ps.map(p => `${this.ty(p.t)} ${p.n}`).join(', ') || 'void';
    return [`static ${f.ret ? this.ty(f.ret) : 'void'} ${this.fn(pre, f.n)}(${ps}) {`, ...this.stmts(f.body, f, pre, 2), '}'].join('\n');
  },
};

const Js = {
  expr(e, f, pre) {
    const E = x => this.expr(x, f, pre);
    switch (e.k) {
      case 'num': return e.v;
      case 'id': return e.n;
      case 'idx': return `${e.n}[${E(e.i)}]`;
      case 'un': return e.op === '!' ? `(${E(e.a)} ? 0 : 1)` : `(-${E(e.a)})`;
      case 'bin': {
        if (['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return `(${E(e.a)} ${e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op} ${E(e.b)} ? 1 : 0)`;
        if (e.op === '&&') return `(${E(e.a)} && ${E(e.b)} ? 1 : 0)`;
        if (e.op === '||') return `(${E(e.a)} || ${E(e.b)} ? 1 : 0)`;
        return `(${E(e.a)} ${e.op} ${E(e.b)})`;
      }
      case 'call': {
        const a = e.args.map(E);
        if (e.builtin) return ({ real: `(${a[0]})`, int: `Math.trunc(${a[0]})`, idiv: `Math.floor((${a[0]}) / (${a[1]}))`, sqrt: `Math.sqrt(${a[0]})`, newint: `new Float64Array(${a[0]})`, newreal: `new Float64Array(${a[0]})` })[e.n];
        return `${pre}_${e.n}(${a.join(', ')})`;
      }
    }
  },
  stmts(body, f, pre, ind) {
    const L = [], P = ' '.repeat(ind);
    for (const s of body) {
      if (s.k === 'let') L.push(`${P}let ${s.n} = ${this.expr(s.e, f, pre)};`);
      else if (s.k === 'set') L.push(`${P}${this.expr(s.lhs, f, pre)} = ${this.expr(s.e, f, pre)};`);
      else if (s.k === 'for') { L.push(`${P}for (let ${s.v} = ${this.expr(s.lo, f, pre)}; ${s.v} < ${this.expr(s.hi, f, pre)}; ${s.v}++) {`); L.push(...this.stmts(s.body, f, pre, ind + 2)); L.push(`${P}}`); }
      else if (s.k === 'while') { L.push(`${P}while (${this.expr(s.c, f, pre)}) {`); L.push(...this.stmts(s.body, f, pre, ind + 2)); L.push(`${P}}`); }
      else if (s.k === 'if') { L.push(`${P}if (${this.expr(s.c, f, pre)}) {`); L.push(...this.stmts(s.a, f, pre, ind + 2)); if (s.b) { L.push(`${P}} else {`); L.push(...this.stmts(s.b, f, pre, ind + 2)); } L.push(`${P}}`); }
      else if (s.k === 'ret') L.push(s.e ? `${P}return ${this.expr(s.e, f, pre)};` : `${P}return;`);
      else L.push(`${P}${this.expr(s.e, f, pre)};`);
    }
    return L;
  },
  func(f, pre) { return [`function ${pre}_${f.n}(${f.ps.map(p => p.n).join(', ')}) {`, ...this.stmts(f.body, f, pre, 2), '}'].join('\n'); },
};

const Py = {
  expr(e, f, pre) {
    const E = x => this.expr(x, f, pre);
    switch (e.k) {
      case 'num': return e.v;
      case 'id': return e.n;
      case 'idx': return `${e.n}[${E(e.i)}]`;
      case 'un': return e.op === '!' ? `(0 if ${E(e.a)} else 1)` : `(-${E(e.a)})`;
      case 'bin': {
        if (['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return `(1 if ${E(e.a)} ${e.op} ${E(e.b)} else 0)`;
        if (e.op === '&&') return `(1 if (${E(e.a)} and ${E(e.b)}) else 0)`;
        if (e.op === '||') return `(1 if (${E(e.a)} or ${E(e.b)}) else 0)`;
        return `(${E(e.a)} ${e.op} ${E(e.b)})`;
      }
      case 'call': {
        const a = e.args.map(E);
        if (e.builtin) return ({ real: `float(${a[0]})`, int: `int(${a[0]})`, idiv: `((${a[0]}) // (${a[1]}))`, sqrt: `math.sqrt(${a[0]})`, newint: `[0] * (${a[0]})`, newreal: `[0.0] * (${a[0]})` })[e.n];
        return `${pre}_${e.n}(${a.join(', ')})`;
      }
    }
  },
  stmts(body, f, pre, ind) {
    const L = [], P = ' '.repeat(ind);
    const cuerpo = b => { const r = this.stmts(b, f, pre, ind + 4); return r.length ? r : [`${P}    pass`]; };
    for (const s of body) {
      if (s.k === 'let') L.push(`${P}${s.n} = ${this.expr(s.e, f, pre)}`);
      else if (s.k === 'set') L.push(`${P}${this.expr(s.lhs, f, pre)} = ${this.expr(s.e, f, pre)}`);
      else if (s.k === 'for') { L.push(`${P}for ${s.v} in range(${this.expr(s.lo, f, pre)}, ${this.expr(s.hi, f, pre)}):`); L.push(...cuerpo(s.body)); }
      else if (s.k === 'while') { L.push(`${P}while ${this.expr(s.c, f, pre)}:`); L.push(...cuerpo(s.body)); }
      else if (s.k === 'if') { L.push(`${P}if ${this.expr(s.c, f, pre)}:`); L.push(...cuerpo(s.a)); if (s.b) { L.push(`${P}else:`); L.push(...cuerpo(s.b)); } }
      else if (s.k === 'ret') L.push(s.e ? `${P}return ${this.expr(s.e, f, pre)}` : `${P}return`);
      else L.push(`${P}${this.expr(s.e, f, pre)}`);
    }
    return L;
  },
  func(f, pre) { return [`def ${pre}_${f.n}(${f.ps.map(p => p.n).join(', ')}):`, ...this.stmts(f.body, f, pre, 4)].join('\n'); },
};

const Ni = {
  // un int local se declara real (el mismo double): el verificador de Ñ toma por real lo que sale de una lista y no deja asignarlo a un entero
  entero(ty, e, f, pre) {
    if (ty !== 'int') return this.expr(e, f, pre);
    if (e.k === 'num') return e.v + '.0';
    return `${this.expr(e, f, pre)} + 0.0`;
  },
  expr(e, f, pre) {
    const E = x => this.expr(x, f, pre);
    switch (e.k) {
      case 'num': return e.v;
      case 'id': return e.n;
      case 'idx': return `${e.n}[${E(e.i)}]`;
      case 'un': return e.op === '!' ? `(si ${E(e.a)} != 0 entonces 0 sino 1)` : `(-${E(e.a)})`;
      case 'bin': {
        if (['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return `(si ${E(e.a)} ${e.op} ${E(e.b)} entonces 1 sino 0)`;
        if (e.op === '&&') return `(si (${E(e.a)} != 0) y (${E(e.b)} != 0) entonces 1 sino 0)`;
        if (e.op === '||') return `(si (${E(e.a)} != 0) o (${E(e.b)} != 0) entonces 1 sino 0)`;
        return `(${E(e.a)} ${e.op} ${E(e.b)})`;
      }
      case 'call': {
        const a = e.args.map(E);
        if (e.builtin) return ({ real: `(${a[0]})`, int: `entero(${a[0]})`, idiv: `((${a[0]}) // (${a[1]}))`, sqrt: `raiz(${a[0]})`, newint: `nueva(${a[0]})`, newreal: `nueva(${a[0]})` })[e.n];
        return `${pre}_${e.n}(${a.join(', ')})`;
      }
    }
  },
  cond(e, f, pre) {
    if (e.k === 'bin' && ['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return `${this.expr(e.a, f, pre)} ${e.op} ${this.expr(e.b, f, pre)}`;
    if (e.k === 'bin' && e.op === '&&') return `(${this.cond(e.a, f, pre)}) y (${this.cond(e.b, f, pre)})`;
    if (e.k === 'bin' && e.op === '||') return `(${this.cond(e.a, f, pre)}) o (${this.cond(e.b, f, pre)})`;
    return `${this.expr(e, f, pre)} != 0`;
  },
  stmts(body, f, pre, ind) {
    const L = [], P = ' '.repeat(ind);
    for (const s of body) {
      if (s.k === 'let') L.push(`${P}var ${s.n}${s.ty === 'nodo' || s.ty === 'arr_nodo' ? ': cualquiera' : ''} = ${this.entero(s.ty, s.e, f, pre)}`);
      else if (s.k === 'set') L.push(`${P}${this.expr(s.lhs, f, pre)} = ${this.expr(s.e, f, pre)}`);
      else if (s.k === 'for') {
        const lim = `fin_${s.v}`;
        L.push(`${P}{`);
        L.push(`${P}  var ${s.v} = ${this.entero('int', s.lo, f, pre)}`); L.push(`${P}  fijo ${lim} = ${this.expr(s.hi, f, pre)}`);
        L.push(`${P}  mientras ${s.v} < ${lim} {`); L.push(...this.stmts(s.body, f, pre, ind + 4)); L.push(`${P}    ${s.v} = ${s.v} + 1`); L.push(`${P}  }`);
        L.push(`${P}}`);
      }
      else if (s.k === 'while') { L.push(`${P}mientras ${this.cond(s.c, f, pre)} {`); L.push(...this.stmts(s.body, f, pre, ind + 2)); L.push(`${P}}`); }
      else if (s.k === 'if') { L.push(`${P}si ${this.cond(s.c, f, pre)} {`); L.push(...this.stmts(s.a, f, pre, ind + 2)); if (s.b) { L.push(`${P}} sino {`); L.push(...this.stmts(s.b, f, pre, ind + 2)); } L.push(`${P}}`); }
      else if (s.k === 'ret') L.push(s.e ? `${P}devolver ${this.expr(s.e, f, pre)}` : `${P}devolver`);
      else L.push(`${P}${this.expr(s.e, f, pre)}`);
    }
    return L;
  },
  func(f, pre) { return [`fn ${pre}_${f.n}(${f.ps.map(p => p.n).join(', ')}) {`, ...this.stmts(f.body, f, pre, 2), '}'].join('\n'); },
};

// ── nodos: se añaden a cada emisor sin tocar el resto ──
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

// ── la suite ──
const { SUITE } = require('./suite100.js');
const progs = SUITE.map(b => {
  const fns = parse(b.src);
  chequear(fns, b.nombre);
  const run = fns.find(f => f.n === 'run');
  if (!run || run.ret !== 'int' || run.ps.length) throw new Error(b.nombre + ': falta «fn run(): int»');
  return { nombre: b.nombre, fns };
});
const salida = path.join(__dirname, '..');
const nombres = progs.map(p => p.nombre);

// C
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
console.log(`generados ${progs.length} benchmarks: ${nombres.join(', ')}`);
