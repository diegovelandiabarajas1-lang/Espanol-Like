// motor-exp N4.10 · Leer una cabecera de C (.h) sin escribir las firmas a mano.
//
//   const { leerCabecera } = require('./cabecera-c.js');
//   const h = leerCabecera(textoDelPuntoH);
//   h.funciones   → [{ nombre, proto: 'double hipotenusa(double a, double b)', ret, params, linea }]
//   h.constantes  → [['MATES_VERSION', 3], ['ROJO', 0], …]          (#define de números o textos, y enum)
//   h.estructuras → [{ nombre, campos: [['x', 'double'], ['v', 'double[3]'], …], union }]
//   h.opacos      → ['mates_valor', …]                               (typedef struct X X; sin cuerpo)
//   h.alias       → [['real_t', 'double'], ['Color', 'int'], …]     (typedef y enum con nombre)
//   h.tiposFuncion→ [{ nombre, proto: 'int Comparar(int a, int b)' }] (typedef int (*Comparar)(int, int);)
//   h.omitidas    → [['printf', 'tiene «...»: …'], …]                 (lo que se vio y no se puede usar)
//
// QUÉ ENTIENDE. Lo que de verdad hay en las cabeceras de una biblioteca: las
// firmas de las funciones, las estructuras (también con arreglos fijos y otras
// estructuras dentro), los enum, los #define de números (y cuentas con ellos:
// (1 << 4), MAX - 1), los typedef sencillos y de punteros a función, los
// tipos opacos, y el ruido de siempre: comentarios, extern "C", los #include,
// __attribute__((…)), __declspec(…) y las macros vacías de exportación
// (#define MATES_API). NO es un preprocesador: no sigue los #include (los
// tipos de <stdint.h> y compañía se conocen por su nombre) y no elige ramas
// de #if (lee las dos; si una función sale dos veces, vale la primera).
// Lo que no entiende no lo inventa: va a «omitidas» con el porqué.
'use strict';

// Los tipos base de C que no hace falta declarar (los de <stdint.h>, <stddef.h>, <stdbool.h>)
const BASE = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool', 'bool',
  'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t',
  'size_t', 'ssize_t', 'ptrdiff_t', 'intptr_t', 'uintptr_t', 'wchar_t', 'char16_t', 'char32_t']);
const CALIFICADORES = new Set(['const', 'volatile', 'restrict', '__restrict', '__restrict__', 'extern', 'static', 'inline',
  '__inline', '__inline__', 'register', '__cdecl', '__stdcall', '_cdecl', '__fastcall', 'WINAPI', '__extension__', '_Noreturn', 'noexcept']);

// ── 1. quitar comentarios y separar el preprocesador ────────────────────────
function limpiar(src) {
  let s = String(src).replace(/\r\n?/g, '\n');
  // comentarios, sin tocar los textos entre comillas
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const f = s.indexOf('*/', i + 2);
      const trozo = s.slice(i, f < 0 ? s.length : f + 2);
      out += trozo.replace(/[^\n]/g, ' ');           // las líneas se conservan
      i = f < 0 ? s.length : f + 2; continue;
    }
    out += c; i++;
  }
  // las líneas que siguen con «\» al final
  return out.replace(/\\\n/g, ' \u0001');
}

// ── 2. las piezas ───────────────────────────────────────────────────────────
function piezas(texto, lineaBase) {
  const t = [];
  const re = /\s+|([A-Za-z_]\w*)|(0[xX][0-9a-fA-F]+[uUlL]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFlLuU]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(<<|>>|<=|>=|==|!=|&&|\|\||->|\.\.\.|::|[{}()\[\];,*=&|^~!<>+\-/%?:.#])/y;
  let linea = lineaBase || 1, m, i = 0;
  while (i < texto.length) {
    re.lastIndex = i;
    m = re.exec(texto);
    if (!m) { t.push({ v: texto[i], k: 'raro', linea }); i++; continue; }
    const v = m[0];
    if (/^\s/.test(v)) { linea += (v.match(/\n/g) || []).length; i = re.lastIndex; continue; }
    t.push({ v, k: m[1] ? 'id' : m[2] ? 'num' : m[3] ? 'texto' : m[4] ? 'car' : 'op', linea });
    i = re.lastIndex;
  }
  return t;
}

// Un número de C (con sufijos u, l, f; hexadecimal y octal)
function numeroC(v) {
  let s = v.replace(/[uUlL]+$/, '');
  if (/^0[xX]/.test(s)) return parseInt(s, 16);
  if (/[.eE]/.test(s) || /[fF]$/.test(s)) return Number(s.replace(/[fF]$/, ''));
  if (/^0\d+$/.test(s)) return parseInt(s, 8);
  return Number(s);
}

// Una expresión constante de C: números, constantes ya vistas, paréntesis y
// los operadores de enteros. null si no es eso (una macro con otra cosa).
function evaluar(toks, consts) {
  let p = 0;
  const ver = () => toks[p], tomar = () => toks[p++];
  const prim = () => {
    const t = tomar();
    if (!t) throw 0;
    if (t.k === 'num') return numeroC(t.v);
    if (t.k === 'car') { const c = t.v.slice(1, -1); return c[0] === '\\' ? ({ n: 10, t: 9, r: 13, 0: 0, '\\': 92, "'": 39 })[c[1]] : c.charCodeAt(0); }
    if (t.k === 'id' && consts.has(t.v)) return consts.get(t.v);
    if (t.v === '(') {
      // un molde: (int)5, (unsigned)(1 << 3)
      if (ver() && ver().k === 'id' && (BASE.has(ver().v) || CALIFICADORES.has(ver().v))) {
        while (ver() && ver().v !== ')') p++;
        p++;
        return un();
      }
      const v = cond();
      if (!ver() || tomar().v !== ')') throw 0;
      return v;
    }
    throw 0;
  };
  const un = () => {
    const t = ver();
    if (t && t.v === '-') { p++; return -un(); }
    if (t && t.v === '+') { p++; return +un(); }
    if (t && t.v === '~') { p++; return ~un(); }
    if (t && t.v === '!') { p++; return un() ? 0 : 1; }
    return prim();
  };
  const NIV = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  const bin = k => {
    if (k === NIV.length) return un();
    let a = bin(k + 1);
    while (ver() && NIV[k].includes(ver().v)) {
      const op = tomar().v, b = bin(k + 1);
      const ent = Number.isInteger(a) && Number.isInteger(b);
      switch (op) {
        case '+': a = a + b; break; case '-': a = a - b; break; case '*': a = a * b; break;
        case '/': if (b === 0) throw 0; a = ent ? Math.trunc(a / b) : a / b; break;
        case '%': if (b === 0) throw 0; a = a % b; break;
        case '<<': a = Number(BigInt(a) << BigInt(b)); break; case '>>': a = Number(BigInt(a) >> BigInt(b)); break;
        case '&': a = Number(BigInt(a) & BigInt(b)); break; case '|': a = Number(BigInt(a) | BigInt(b)); break;
        case '^': a = Number(BigInt(a) ^ BigInt(b)); break;
        case '==': a = a === b ? 1 : 0; break; case '!=': a = a !== b ? 1 : 0; break;
        case '<': a = a < b ? 1 : 0; break; case '>': a = a > b ? 1 : 0; break;
        case '<=': a = a <= b ? 1 : 0; break; case '>=': a = a >= b ? 1 : 0; break;
        case '&&': a = a && b ? 1 : 0; break; case '||': a = a || b ? 1 : 0; break;
      }
    }
    return a;
  };
  const cond = () => {
    const c = bin(0);
    if (ver() && ver().v === '?') { p++; const a = cond(); if (!ver() || tomar().v !== ':') throw 0; const b = cond(); return c ? a : b; }
    return c;
  };
  try {
    if (!toks.length) return null;
    const v = cond();
    return p === toks.length && Number.isFinite(v) ? v : null;
  } catch (_) { return null; }
}

// ── 3. leer la cabecera ─────────────────────────────────────────────────────
function leerCabecera(src) {
  const r = { funciones: [], constantes: [], estructuras: [], opacos: [], alias: [], tiposFuncion: [], omitidas: [] };
  const consts = new Map();
  const quitar = new Set(['__attribute__', '__declspec', '__asm__', '__asm', 'asm']);   // y las macros vacías
  const ponerConst = (n, v) => { if (!consts.has(n)) { consts.set(n, v); r.constantes.push([n, v]); } };
  const vistas = new Set();
  const omitir = (n, por) => { if (!vistas.has(n)) { vistas.add(n); r.omitidas.push([n, por]); } };

  // el preprocesador: #define de números y macros que no son nada
  const lineas = limpiar(src).split('\n');
  const codigo = [];
  lineas.forEach((l, k) => {
    const t = l.trim();
    if (!t.startsWith('#')) { codigo.push(l.replace(/\u0001/g, '')); return; }
    codigo.push('');
    const m = /^#\s*define\s+([A-Za-z_]\w*)(\()?(.*)$/.exec(t.replace(/\u0001/g, ''));
    if (!m) return;
    const [, nombre, conParam, cuerpo] = m;
    if (conParam) { quitar.has(nombre) || (/__attribute__|__declspec/.test(cuerpo) && quitar.add(nombre)); return; }
    const toks = piezas(cuerpo.trim(), k + 1);
    if (!toks.length || toks.every(x => x.k === 'id' && (quitar.has(x.v) || CALIFICADORES.has(x.v)))) { quitar.add(nombre); return; }
    if (toks[0].k === 'id' && quitar.has(toks[0].v)) { quitar.add(nombre); return; }   // #define API __declspec(dllexport)
    if (toks.length === 1 && toks[0].k === 'texto') {          // #define NOMBRE "texto"
      try { ponerConst(nombre, JSON.parse(toks[0].v.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1'))); } catch (_) { /* un escape de C raro */ }
      return;
    }
    const v = evaluar(toks, consts);
    if (v !== null) ponerConst(nombre, v);
  });

  // las piezas del código, sin el ruido
  const T0 = piezas(codigo.join('\n'), 1);
  const T = [];
  for (let i = 0; i < T0.length; i++) {
    const t = T0[i];
    if (t.k === 'id' && quitar.has(t.v)) {
      // __attribute__((…)), __declspec(…) o una macro de exportación con paréntesis
      if (T0[i + 1] && T0[i + 1].v === '(') {
        let d = 0, j = i + 1;
        for (; j < T0.length; j++) { if (T0[j].v === '(') d++; else if (T0[j].v === ')' && --d === 0) break; }
        i = j;
      }
      continue;
    }
    // extern "C" {  … }
    if (t.v === 'extern' && T0[i + 1] && T0[i + 1].k === 'texto') {
      if (T0[i + 2] && T0[i + 2].v === '{') { i += 2; T.push({ v: '\u0002', k: 'abre' }); continue; }
      i += 1; continue;
    }
    T.push(t);
  }

  // en declaraciones: hasta «;» fuera de llaves, o un cuerpo { … } de función
  const decls = [];
  let cur = [], d = 0, externC = 0;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.k === 'abre') { externC++; continue; }
    if (t.v === '}' && d === 0 && externC) { externC--; continue; }
    if (t.v === '{') {
      // ¿el cuerpo de una función? (… ) {   → se salta entero
      const prev = cur[cur.length - 1];
      if (d === 0 && prev && prev.v === ')') {
        let dd = 0, j = i;
        for (; j < T.length; j++) { if (T[j].v === '{') dd++; else if (T[j].v === '}' && --dd === 0) break; }
        decls.push({ toks: cur, cuerpo: true });
        cur = []; i = j; continue;
      }
      d++;
    } else if (t.v === '}') d--;
    if (t.v === ';' && d === 0) { if (cur.length) decls.push({ toks: cur }); cur = []; continue; }
    cur.push(t);
  }

  const texto = ts => ts.map(x => x.v).join(' ').replace(/ \* /g, ' *').replace(/\s+([,)\]])/g, '$1').replace(/([(\[])\s+/g, '$1').replace(/\s+\(/g, '(').trim();
  // un tipo sin «struct»/«enum»/«union» (las estructuras se registran por su nombre)
  const tipoLimpio = ts => texto(ts.filter(x => !(x.k === 'id' && (x.v === 'struct' || x.v === 'enum' || x.v === 'union' ||
    (CALIFICADORES.has(x.v) && x.v !== 'const')))));
  const etiquetas = new Map();     // struct Tag → nombre con que se registra

  // los parámetros de una firma: [{ nombre, tipo }]
  function parametros(ts) {
    const grupos = [];
    let g = [], dd = 0;
    for (const t of ts) {
      if (t.v === '(' || t.v === '[') dd++;
      if (t.v === ')' || t.v === ']') dd--;
      if (t.v === ',' && dd === 0) { grupos.push(g); g = []; continue; }
      g.push(t);
    }
    if (g.length) grupos.push(g);
    if (grupos.length === 1 && grupos[0].length === 1 && grupos[0][0].v === 'void') return [];
    return grupos.map((g2, k) => {
      if (g2.length === 1 && g2[0].v === '...') return { variadica: true };
      // puntero a función como parámetro: int (*cmp)(int, int)
      const pf = g2.findIndex((x, j) => x.v === '(' && g2[j + 1] && g2[j + 1].v === '*');
      if (pf >= 0) return { nombre: (g2[pf + 2] && g2[pf + 2].k === 'id' ? g2[pf + 2].v : `p${k}`), punteroFuncion: true, tipo: texto(g2) };
      let arr = false;
      let q = g2.slice();
      while (q.length && q[q.length - 1].v === ']') {     // double v[] / double v[4] → puntero
        const a = q.map(x => x.v).lastIndexOf('[');
        q = q.slice(0, a); arr = true;
      }
      const ult = q[q.length - 1];
      let nombre = null;
      const tipoToks = q.slice();
      if (ult && ult.k === 'id' && !BASE.has(ult.v) && q.length > 1 && !CALIFICADORES.has(ult.v)) { nombre = ult.v; tipoToks.pop(); }
      let tipo = tipoLimpio(tipoToks);
      if (arr) tipo += ' *';
      return { nombre: nombre || `p${k + 1}`, tipo: tipo.replace(/\s*\*/g, ' *').replace(/\* \*/g, '**').trim() };
    });
  }

  function cuerpoEstructura(ts, nombre) {
    // ts: las piezas entre { y }
    const campos = [];
    let g = [], dd = 0;
    const cerrar = () => {
      if (!g.length) return true;
      if (g.some(x => x.v === ':')) return `el campo «${texto(g)}» es de bits, y eso no se puede pasar`;
      if (g.some(x => x.v === '{')) return 'tiene una estructura o una unión anónima dentro';
      if (g.some(x => x.v === '(')) return `el campo «${texto(g)}» es un puntero a función: declara su tipo con typedef`;
      // int a, b;  double v[3];  char *s;
      const partes = [];
      let p = [], d2 = 0;
      for (const t of g) { if (t.v === '[') d2++; if (t.v === ']') d2--; if (t.v === ',' && d2 === 0) { partes.push(p); p = []; } else p.push(t); }
      partes.push(p);
      // el tipo base sale del primero (hasta su nombre)
      const pri = partes[0];
      let idx = pri.length - 1;
      while (idx >= 0 && pri[idx].v === ']') { const a = pri.slice(0, idx + 1).map(x => x.v).lastIndexOf('['); idx = a - 1; }
      const baseToks = pri.slice(0, idx).filter(x => x.v !== '*');
      const base = tipoLimpio(baseToks);
      for (const pt of partes) {
        let estrellas = 0, nom = null, dims = [];
        for (let j = 0; j < pt.length; j++) {
          const t = pt[j];
          if (t.v === '*') estrellas++;
          if (t.v === '[') { const cierre = pt.findIndex((x, q) => q > j && x.v === ']'); const n = evaluar(pt.slice(j + 1, cierre), consts); if (n === null) return 'un arreglo de tamaño que no es un número'; dims.push(n); j = cierre; continue; }
          if (t.k === 'id' && (pt === pri ? j === idx : true) && !BASE.has(t.v) && !CALIFICADORES.has(t.v)) nom = t.v;
        }
        if (!nom) return `no encuentro el nombre de un campo en «${texto(pt)}»`;
        let tipo = base + (estrellas ? ' ' + '*'.repeat(estrellas) : '');
        for (const n of dims.reverse()) tipo += `[${n}]`;
        campos.push([nom, tipo]);
      }
      g = [];
      return true;
    };
    for (const t of ts) {
      if (t.v === '{' || t.v === '(') dd++;
      if (t.v === '}' || t.v === ')') dd--;
      if (t.v === ';' && dd === 0) { const ok = cerrar(); if (ok !== true) return { error: ok }; continue; }
      g.push(t);
    }
    const ok = cerrar();
    if (ok !== true) return { error: ok };
    if (!campos.length) return { error: 'no tiene campos' };
    return { campos };
  }

  function enumerar(ts) {
    // A, B = 5, C
    let siguiente = 0;
    let g = [];
    const cerrar = () => {
      if (!g.length) return;
      const n = g[0].v;
      if (g[1] && g[1].v === '=') { const v = evaluar(g.slice(2), consts); if (v === null) { omitir(n, 'el valor del enum no es un número'); g = []; return; } siguiente = v; }
      ponerConst(n, siguiente);
      siguiente++;
      g = [];
    };
    for (const t of ts) { if (t.v === ',') cerrar(); else g.push(t); }
    cerrar();
  }

  // un struct/enum/union con cuerpo dentro de las piezas: devuelve [inicio, fin] de las llaves
  const llaves = ts => {
    const a = ts.findIndex(x => x.v === '{');
    if (a < 0) return null;
    let dd = 0, j = a;
    for (; j < ts.length; j++) { if (ts[j].v === '{') dd++; else if (ts[j].v === '}' && --dd === 0) break; }
    return [a, j];
  };
  const nombreDe = new Map();      // para no repetir
  const registrarEstructura = (nombre, ts, union, tag) => {
    const c = cuerpoEstructura(ts, nombre);
    if (c.error) { omitir(nombre, c.error); return; }
    if (nombreDe.has(nombre)) return;
    nombreDe.set(nombre, true);
    r.estructuras.push({ nombre, campos: c.campos, union: !!union });
    if (tag && tag !== nombre) { etiquetas.set(tag, nombre); r.alias.push([tag, nombre]); }
  };

  for (const de of decls) {
    let ts = de.toks;
    if (!ts.length) continue;
    const linea = ts[0].linea;
    if (de.cuerpo) {
      const nm = (ts.slice().reverse().find((x, j, a) => x.k === 'id' && a[j - 1] && a[j - 1].v === '(') || {}).v;
      const pa = ts.findIndex(x => x.v === '(');
      if (pa > 0) omitir(ts[pa - 1].v, 'es una función «inline» con el cuerpo en la cabecera: no está en la biblioteca');
      else if (nm) omitir(nm, 'tiene el cuerpo en la cabecera');
      continue;
    }
    const esTypedef = ts[0].v === 'typedef';
    if (esTypedef) ts = ts.slice(1);
    const k0 = ts.findIndex(x => !(x.k === 'id' && CALIFICADORES.has(x.v) && x.v !== 'const'));
    ts = ts.slice(Math.max(0, k0));
    const cab = ts[0] && ts[0].v;
    // struct / union / enum con cuerpo
    if ((cab === 'struct' || cab === 'union' || cab === 'enum') && ts.some(x => x.v === '{')) {
      const [a, b] = llaves(ts);
      const tag = ts[1] && ts[1].k === 'id' && a === 2 ? ts[1].v : null;
      const resto = ts.slice(b + 1);
      if (cab === 'enum') {
        enumerar(ts.slice(a + 1, b));
        const nom = esTypedef && resto[0] && resto[0].k === 'id' ? resto[0].v : null;
        if (nom) r.alias.push([nom, 'int']);
        if (tag) r.alias.push([tag, 'int']);
        continue;
      }
      if (esTypedef) {
        const nom = resto.find(x => x.k === 'id');
        if (!nom) { omitir(tag || '(sin nombre)', 'un typedef de estructura sin nombre'); continue; }
        if (resto.some(x => x.v === '*')) { omitir(nom.v, 'es un typedef de puntero a estructura: usa la estructura'); continue; }
        registrarEstructura(nom.v, ts.slice(a + 1, b), cab === 'union', tag);
      } else if (tag) {
        if (resto.length) { omitir(tag, 'declara una variable global junto con la estructura'); continue; }
        registrarEstructura(tag, ts.slice(a + 1, b), cab === 'union', null);
      }
      continue;
    }
    if (esTypedef) {
      // typedef struct Tag Nombre;   (opaco, o el nombre de una estructura que viene)
      if ((cab === 'struct' || cab === 'union') && ts.length === 3 && ts[1].k === 'id' && ts[2].k === 'id') {
        const tag = ts[1].v, nom = ts[2].v;
        if (nombreDe.has(tag)) { if (tag !== nom) r.alias.push([nom, tag]); }
        else if (!r.opacos.includes(nom)) r.opacos.push(nom);
        continue;
      }
      // typedef int (*Comparar)(int, int);
      const pf = ts.findIndex((x, j) => x.v === '(' && ts[j + 1] && ts[j + 1].v === '*');
      if (pf >= 0) {
        const nom = ts[pf + 2] && ts[pf + 2].k === 'id' ? ts[pf + 2].v : null;
        const cierra = ts.findIndex((x, j) => j > pf && x.v === ')');
        const ab = cierra + 1;
        if (!nom || !ts[ab] || ts[ab].v !== '(') { omitir(nom || '?', 'un puntero a función que no entiendo'); continue; }
        const ps = parametros(ts.slice(ab + 1, -1));
        if (ps.some(p => p.variadica)) { omitir(nom, 'tiene «...»'); continue; }
        r.tiposFuncion.push({ nombre: nom, proto: `${tipoLimpio(ts.slice(0, pf))} ${nom}(${ps.map(p => `${p.tipo} ${p.nombre}`).join(', ')})` });
        continue;
      }
      // typedef double real_t;   typedef unsigned long long u64;   typedef int Vec[4] (no)
      if (ts.some(x => x.v === '[' || x.v === '(')) { omitir(ts.filter(x => x.k === 'id').pop().v, 'un typedef de arreglo o de función que no entiendo'); continue; }
      const nom = ts[ts.length - 1];
      if (!nom || nom.k !== 'id') continue;
      const destino = tipoLimpio(ts.slice(0, -1));
      if (destino === nom.v) continue;
      r.alias.push([nom.v, destino]);
      continue;
    }
    // ¿una función?   RET nombre ( PARAMS ) [const]
    const pa = ts.findIndex(x => x.v === '(');
    if (pa > 0 && ts[pa - 1].k === 'id' && !(ts[pa + 1] && ts[pa + 1].v === '*')) {
      const nombre = ts[pa - 1].v;
      let dd = 0, cierre = pa;
      for (; cierre < ts.length; cierre++) { if (ts[cierre].v === '(') dd++; else if (ts[cierre].v === ')' && --dd === 0) break; }
      const retToks = ts.slice(0, pa - 1);
      if (!retToks.length) { omitir(nombre, 'no dice qué devuelve'); continue; }
      const ps = parametros(ts.slice(pa + 1, cierre));
      if (ps.some(p => p.variadica)) { omitir(nombre, 'tiene «...» (como printf): C no dice de qué tipo es cada argumento de más'); continue; }
      if (r.funciones.some(f => f.nombre === nombre)) continue;
      const ret = tipoLimpio(retToks).replace(/\s*\*/g, ' *').replace(/\* \*/g, '**');
      const proto = `${ret} ${nombre}(${ps.map(p => (p.punteroFuncion ? p.tipo : `${p.tipo} ${p.nombre}`)).join(', ')})`;
      r.funciones.push({ nombre, proto, ret, params: ps, linea });
      continue;
    }
    if (pa > 0 && ts[pa + 1] && ts[pa + 1].v === '*') { omitir((ts[pa + 2] || {}).v || '?', 'es una variable global (un puntero a función): todavía no'); continue; }
    // struct Tag;  (declaración adelantada)
    if ((cab === 'struct' || cab === 'union') && ts.length === 2) continue;
    // una variable global: extern int contador;
    const ult = ts[ts.length - 1];
    if (ult && ult.k === 'id') omitir(ult.v, 'es una variable global: todavía no se leen ni se escriben desde Ñ');
  }
  return r;
}

module.exports = { leerCabecera, evaluarConstante: evaluar, piezas, numeroC };
