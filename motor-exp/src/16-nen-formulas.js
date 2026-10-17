// ============================================================================
//  Ñ v4 — NEÑ, parte C: el resolucionador de fórmulas
//  Parte 16.
//
//  Se importa con:  usar simplificarFormula, derivarFormula de "nen"
//
//  Un sistema de álgebra computacional pequeño. Las fórmulas entran como TEXTO
//  en la notación que se escribe a mano —«3x^2 + 2(x - 1)», «seno(x)/x»,
//  «x^2 - 5x + 6 = 0»— y salen como texto canónico que se puede volver a leer,
//  como números, como listas o como una función de Ñ.
//
//  Por qué texto y no un tipo nuevo: una fórmula se lee, se imprime, se guarda
//  en un CSV y se manda por la red; el texto ya sabe hacer todo eso. El costo es
//  volver a analizarla en cada llamada, que para fórmulas de una línea es
//  despreciable frente a lo que cuesta simplificarla.
//
//  La tubería es la de siempre: léxico → análisis (con las precedencias del
//  papel: «-x^2» es «-(x^2)», «^» asocia a la derecha) → árbol CANÓNICO →
//  impresor que pone solo los paréntesis necesarios.
//
//  LA DECISIÓN DE FONDO: el árbol se construye ya en forma normal. No hay un
//  «simplificador» que se aplique después por reglas hasta que nada cambie (eso
//  es lo que a veces no termina); hay cuatro constructores —suma, producto,
//  potencia y función— que reciben hijos ya canónicos y devuelven un nodo
//  canónico. Cada uno solo llama a los otros con cosas estrictamente más
//  pequeñas, así que termina siempre. «simplificarFormula» encima de eso solo
//  ELIGE: prueba la forma canónica, la expandida y la de fracción única, y se
//  queda con la más corta.
//
//  Los números son racionales EXACTOS con BigInt: 1/3 + 1/6 es 1/2 y no
//  0.49999…, y 2^100 no se desborda. Los decimales de la entrada se leen como
//  fracciones decimales exactas (0.1 es 1/10, no el doble más cercano).
// ============================================================================
'use strict';

const nucleoNenFormulas = (function () {
  // ── errores ───────────────────────────────────────────────────────────────
  // El núcleo no conoce la VM: lanza ErrorFormula y el instalador lo traduce a
  // vm.error con el nombre de la función. «indefinido» es un tipo aparte porque
  // hay quien lo atrapa a propósito —los límites, el que verifica raíces—: una
  // división entre cero al sustituir no es un error del usuario, es información.
  class ErrorFormula extends Error {
    constructor(msg, sug, tipo) { super(msg); this.sug = sug || null; this.tipo = tipo || 'formula'; }
  }
  const fallo = (m, s) => new ErrorFormula(m, s);
  const indefinido = m => new ErrorFormula(m, null, 'indefinido');

  // El instalador cambia esto por vm.cobrar: así una expansión gigante agota el
  // presupuesto de instrucciones como cualquier bucle de Ñ, en vez de colgar.
  let gastar = () => {};

  // ── racionales exactos ────────────────────────────────────────────────────
  const bAbs = a => (a < 0n ? -a : a);
  function bMcd(a, b) { a = bAbs(a); b = bAbs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  const bBits = a => (a === 0n ? 0 : bAbs(a).toString(2).length);
  // Raíz k-ésima entera (piso) por Newton. El punto de partida 2^⌈bits/k⌉ está
  // siempre por ENCIMA de la raíz, y desde arriba Newton baja monótono: por eso
  // la condición de parada es «dejó de bajar».
  function bRaiz(n, k) {
    if (n < 2n) return n;
    const kb = BigInt(k);
    let x = 1n << BigInt(Math.ceil(bBits(n) / k));
    for (;;) {
      const y = ((kb - 1n) * x + n / (x ** (kb - 1n))) / kb;
      if (y >= x) return x;
      x = y;
    }
  }
  class Rac { constructor(n, d) { this.n = n; this.d = d; } }
  function R(n, d) {
    n = BigInt(n); d = d === undefined ? 1n : BigInt(d);
    if (d === 0n) throw indefinido('la fórmula divide entre cero');
    if (d < 0n) { n = -n; d = -d; }
    const g = bMcd(n, d);
    if (g > 1n) { n /= g; d /= g; }
    return new Rac(n, d);
  }
  const R0 = R(0), R1 = R(1);
  const rSuma = (a, b) => (a.d === b.d ? R(a.n + b.n, a.d) : R(a.n * b.d + b.n * a.d, a.d * b.d));
  const rResta = (a, b) => rSuma(a, new Rac(-b.n, b.d));
  const rMul = (a, b) => R(a.n * b.n, a.d * b.d);
  const rDiv = (a, b) => { if (b.n === 0n) throw indefinido('la fórmula divide entre cero'); return R(a.n * b.d, a.d * b.n); };
  const rNeg = a => new Rac(-a.n, a.d);
  const rCero = a => a.n === 0n;
  const rUno = a => a.n === 1n && a.d === 1n;
  const rEnt = a => a.d === 1n;
  const rCmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
  const rIgual = (a, b) => a.n === b.n && a.d === b.d;
  const rAbs = a => (a.n < 0n ? rNeg(a) : a);
  function rPotEnt(a, k) {
    k = BigInt(k);
    if (k < 0n) { if (a.n === 0n) throw indefinido('la fórmula divide entre cero'); a = new Rac(a.d, a.n); k = -k; if (a.d < 0n) a = new Rac(-a.n, -a.d); }
    // Un tope a ojo: más de un millón de bits ya no es un número que alguien
    // quiera ver, y calcularlo bloquearía la máquina sin pasar por «cobrar».
    if (Number(k) * Math.max(bBits(a.n), bBits(a.d)) > 1e6)
      throw fallo('el número resultante es demasiado grande (más de un millón de bits)', 'usa evaluarFormula para una aproximación decimal');
    gastar(Number(k) > 64 ? 64 : 1);
    return new Rac(a.n ** k, a.d ** k);
  }
  // A real sin desbordar: si numerador o denominador pasan de ~1e300, Number()
  // da infinito y el cociente NaN; se reescala antes por potencias de 2.
  function rANum(a) {
    const nb = bBits(a.n), db = bBits(a.d);
    if (nb < 1000 && db < 1000) return Number(a.n) / Number(a.d);
    const sh = nb - db - 64;
    const v = sh >= 0 ? Number(a.n / (a.d << BigInt(sh))) : Number((a.n << BigInt(-sh)) / a.d);
    return v * Math.pow(2, sh);
  }
  // De un real de Ñ a racional por su representación decimal más corta: 0.1
  // entra como 1/10, que es lo que la persona escribió, no como
  // 3602879701896397/36028797018963968, que es lo que hay en memoria.
  function deNumero(x) {
    if (!isFinite(x)) throw fallo('no se puede usar un valor infinito o NaN dentro de una fórmula');
    if (Number.isInteger(x)) return R(BigInt(x));
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(x));
    if (!m) throw fallo(`no sé convertir ${x} en un número exacto`);
    const frac = m[3] || '';
    let e10 = (m[4] ? Number(m[4]) : 0) - frac.length;
    let n = BigInt(m[2] + frac); if (m[1]) n = -n;
    return e10 >= 0 ? R(n * 10n ** BigInt(e10)) : R(n, 10n ** BigInt(-e10));
  }

  // ── factorización de enteros (para radicales y raíces racionales) ─────────
  // División por tentativa con los primos hasta 10^5: alcanza para todo lo que
  // aparece al simplificar radicales escritos a mano. Lo que sobra sin
  // factorizar se trata como si fuera primo; si no lo es, el único efecto es
  // que una raíz quede menos simplificada, nunca un resultado falso.
  let PRIMOS = null;
  function primos() {
    if (PRIMOS) return PRIMOS;
    const N = 100000, criba = new Uint8Array(N + 1), out = [];
    for (let i = 2; i <= N; i++) if (!criba[i]) { out.push(BigInt(i)); for (let j = i * i; j <= N; j += i) criba[j] = 1; }
    return (PRIMOS = out);
  }
  const memoFact = new Map();
  function factorizarEntero(m) {
    m = bAbs(m);
    const k = m.toString();
    if (memoFact.has(k)) return memoFact.get(k);
    const fs = new Map();
    let resto = m;
    if (bBits(m) <= 4000) {
      for (const p of primos()) {
        if (p * p > resto) break;
        if (resto % p === 0n) { let e = 0; while (resto % p === 0n) { resto /= p; e++; } fs.set(p, e); }
      }
      gastar(200);
    }
    // Lo que queda tras quitar los primos pequeños: si es menor que 10^10 ya es
    // primo seguro (no tiene divisores hasta su raíz).
    if (resto > 1n && resto < 10000000000n) { fs.set(resto, (fs.get(resto) || 0) + 1); resto = 1n; }
    const r = { fs, resto };
    if (memoFact.size > 2000) memoFact.clear();
    memoFact.set(k, r);
    return r;
  }

  // ── nodos ─────────────────────────────────────────────────────────────────
  //   {t:'n', q}            número racional
  //   {t:'v', n}            variable
  //   {t:'c', n}            constante: 'pi', 'e', 'i'
  //   {t:'+', a:[...]}      suma n-aria
  //   {t:'*', a:[...]}      producto n-ario (el número, si lo hay, va primero)
  //   {t:'^', b, e}         potencia
  //   {t:'f', f, a}         función de un argumento
  // No hay resta ni división: a − b es a + (−1)·b y a/b es a·b^(−1). Así las
  // reglas de agrupar se escriben una vez y no tres.
  const N = q => ({ t: 'n', q });
  const V = n => ({ t: 'v', n });
  const C = n => ({ t: 'c', n });
  const CERO = N(R0), UNO = N(R1), MENOS_UNO = N(R(-1)), DOS = N(R(2)), MEDIO = N(R(1, 2));
  const PI = C('pi'), E = C('e'), I = C('i');
  const esNum = e => e.t === 'n';
  const esCero = e => e.t === 'n' && e.q.n === 0n;
  const esUno = e => e.t === 'n' && rUno(e.q);

  // La clave es la forma escrita del árbol canónico: dos fórmulas son iguales
  // si y solo si tienen la misma clave. Se calcula una vez y se guarda en el nodo.
  function clave(e) {
    if (e.k !== undefined) return e.k;
    let k;
    switch (e.t) {
      case 'n': k = e.q.d === 1n ? e.q.n.toString() : e.q.n + '/' + e.q.d; break;
      case 'v': k = 'v:' + e.n; break;
      case 'c': k = 'c:' + e.n; break;
      case '+': k = '+(' + e.a.map(clave).join(',') + ')'; break;
      case '*': k = '*(' + e.a.map(clave).join(',') + ')'; break;
      case '^': k = '^(' + clave(e.b) + ',' + clave(e.e) + ')'; break;
      case 'f': k = e.f + '(' + clave(e.a) + ')'; break;
    }
    e.k = k;
    return k;
  }
  const igual = (a, b) => a === b || clave(a) === clave(b);

  function variablesDe(e) {
    if (e.vs) return e.vs;
    let s;
    switch (e.t) {
      case 'n': case 'c': s = new Set(); break;
      case 'v': s = new Set([e.n]); break;
      case '+': case '*': s = new Set(); for (const h of e.a) for (const v of variablesDe(h)) s.add(v); break;
      case '^': s = new Set(variablesDe(e.b)); for (const v of variablesDe(e.e)) s.add(v); break;
      case 'f': s = variablesDe(e.a); break;
    }
    e.vs = s;
    return s;
  }
  const depende = (e, x) => variablesDe(e).has(x);
  const tieneI = e => {
    switch (e.t) {
      case 'c': return e.n === 'i';
      case '+': case '*': return e.a.some(tieneI);
      case '^': return tieneI(e.b) || tieneI(e.e);
      case 'f': return tieneI(e.a);
      default: return false;
    }
  };
  function tamano(e) {
    switch (e.t) {
      case '+': case '*': return 1 + e.a.reduce((s, h) => s + tamano(h), 0);
      case '^': return 1 + tamano(e.b) + tamano(e.e);
      case 'f': return 1 + tamano(e.a);
      default: return 1;
    }
  }

  // ── orden canónico ────────────────────────────────────────────────────────
  // Dentro de un producto: radicales numéricos, constantes, variables (en orden
  // alfabético), funciones, sumas, y la «i» al final: «2π·r», «raiz(3)·i».
  function claseFactor(f) {
    const b = f.t === '^' ? f.b : f;
    switch (b.t) {
      case 'n': return 0;
      case 'c': return b.n === 'i' ? 6 : 1;
      case 'v': return 2;
      case 'f': return 3;
      default: return 4;
    }
  }
  const cmpTxt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function cmpFactor(f, g) {
    const cf = claseFactor(f), cg = claseFactor(g);
    if (cf !== cg) return cf - cg;
    const bf = f.t === '^' ? f.b : f, bg = g.t === '^' ? g.b : g;
    if (bf.t === 'v' && bg.t === 'v' && bf.n !== bg.n) return cmpTxt(bf.n, bg.n);
    const c = cmpTxt(clave(bf), clave(bg));
    return c || cmpTxt(clave(f), clave(g));
  }
  // Dentro de una suma: primero lo que tiene variables, de mayor a menor grado
  // (como se escribe un polinomio: x^2 + 3x + 1); luego el número suelto; y al
  // final las constantes no numéricas. Así «-1 + raiz(5)» y «x^2 + seno(x) + 1»
  // salen como se escriben en el papel.
  function grado(t) {
    switch (t.t) {
      case 'v': return 1;
      case '*': return t.a.reduce((s, f) => s + grado(f), 0);
      case '^': return t.e.t === 'n' ? rANum(t.e.q) * grado(t.b) : 0;
      case '+': return Math.max(...t.a.map(grado));
      default: return 0;
    }
  }
  function firmaMonomio(t) {
    const fs = t.t === '*' ? t.a : [t], out = [];
    for (const f of fs) {
      if (f.t === 'v') out.push([f.n, 1]);
      else if (f.t === '^' && f.b.t === 'v' && f.e.t === 'n') out.push([f.b.n, rANum(f.e.q)]);
    }
    return out;
  }
  function cmpTermino(a, b) {
    const ga = a.t === 'n' ? 1 : variablesDe(a).size ? 0 : 2;
    const gb = b.t === 'n' ? 1 : variablesDe(b).size ? 0 : 2;
    if (ga !== gb) return ga - gb;
    if (ga === 0) {
      const da = grado(a), db = grado(b);
      if (da !== db) return db - da;
      const fa = firmaMonomio(a), fb = firmaMonomio(b);
      for (let i = 0; i < Math.min(fa.length, fb.length); i++) {
        if (fa[i][0] !== fb[i][0]) return cmpTxt(fa[i][0], fb[i][0]);
        if (fa[i][1] !== fb[i][1]) return fb[i][1] - fa[i][1];
      }
      if (fa.length !== fb.length) return fb.length - fa.length;
    }
    const c = cmpTxt(clave(sinCoef(a)), clave(sinCoef(b)));
    return c || cmpTxt(clave(a), clave(b));
  }
  function partirCoef(t) {
    if (t.t === 'n') return [t.q, UNO];
    if (t.t === '*' && t.a[0].t === 'n') return [t.a[0].q, t.a.length === 2 ? t.a[1] : { t: '*', a: t.a.slice(1) }];
    return [R1, t];
  }
  const sinCoef = t => partirCoef(t)[1];
  function conCoef(c, resto) {
    if (rCero(c)) return CERO;
    if (resto.t === 'n') return N(rMul(c, resto.q));
    if (rUno(c)) return resto;
    if (resto.t === '*') return { t: '*', a: [N(c), ...resto.a] };
    return { t: '*', a: [N(c), resto] };
  }
  const esNegativo = t => (t.t === 'n' && t.q.n < 0n) || (t.t === '*' && t.a[0].t === 'n' && t.a[0].q.n < 0n) ||
    (t.t === '+' && esNegativo(t.a[0]));

  // ── constructores canónicos ───────────────────────────────────────────────
  function mkAdd(ts) {
    gastar(ts.length);
    let c = R0;
    const mapa = new Map();
    const plano = [];
    for (const t of ts) if (t.t === '+') plano.push(...t.a); else plano.push(t);
    for (let i = 0; i < plano.length; i++) {
      const t = plano[i];
      if (t.t === 'n') { c = rSuma(c, t.q); continue; }
      const [k, resto] = partirCoef(t);
      // Dentro de una suma, c·(a + b) se reparte: x − (y − 1) es x − y + 1.
      // Fuera de una suma no se toca, y así «2(x + 1)» y «-(x + 1)» se
      // conservan tal cual se escribieron.
      if (resto.t === '+') { for (const u of resto.a) plano.push(conCoef(k, u).t === '*' ? mkMul([N(k), u]) : conCoef(k, u)); continue; }
      const ck = clave(resto);
      const p = mapa.get(ck);
      if (p) p.c = rSuma(p.c, k); else mapa.set(ck, { c: k, resto });
    }
    let terms = [];
    for (const { c: k, resto } of mapa.values()) if (!rCero(k)) terms.push(conCoef(k, resto));
    const p = pitagoras(terms);
    if (p) return mkAdd([...p, N(c)]);
    terms.sort(cmpTermino);
    // El número suelto va después de lo que tiene variables y antes de las
    // constantes no numéricas: x + 1, pero -1 + raiz(5).
    if (!rCero(c)) {
      let k = terms.length;
      while (k > 0 && !variablesDe(terms[k - 1]).size) k--;
      terms.splice(k, 0, N(c));
    }
    if (!terms.length) return CERO;
    if (terms.length === 1) return terms[0];
    return { t: '+', a: terms };
  }
  // seno(u)^2 + coseno(u)^2 = 1, con el mismo coeficiente y el mismo resto de
  // factores. Es la única identidad trigonométrica que se aplica sola: sin
  // ella la derivada de tangente no se reconoce como 1 + tangente^2 ni al revés.
  function pitagoras(terms) {
    const info = [];
    for (const t of terms) {
      const [c, resto] = partirCoef(t);
      const fs = resto.t === '*' ? resto.a : [resto];
      let hallado = null;
      fs.forEach((f, i) => {
        if (!hallado && f.t === '^' && f.e.t === 'n' && rIgual(f.e.q, R(2)) && f.b.t === 'f' && (f.b.f === 'seno' || f.b.f === 'coseno')) {
          const otros = fs.filter((_, j) => j !== i);
          hallado = { c, tipo: f.b.f, u: clave(f.b.a), otros, ko: clave({ t: '*', a: otros }) };
        }
      });
      info.push(hallado);
    }
    for (let i = 0; i < terms.length; i++) {
      const a = info[i];
      if (!a || a.tipo !== 'seno') continue;
      for (let j = 0; j < terms.length; j++) {
        const b = info[j];
        if (!b || b.tipo !== 'coseno' || b.u !== a.u || b.ko !== a.ko || !rIgual(a.c, b.c)) continue;
        const resto = a.otros.length === 0 ? UNO : a.otros.length === 1 ? a.otros[0] : { t: '*', a: a.otros };
        const out = terms.filter((_, k) => k !== i && k !== j);
        out.push(conCoef(a.c, resto));
        return out;
      }
    }
    return null;
  }

  function mkMul(fs, prof) {
    prof = prof || 0;
    gastar(fs.length);
    let coef = R1;
    const grupos = new Map();
    const rad = [];
    const argsExp = [];
    const agregar = (base, ex) => {
      const k = clave(base);
      const g = grupos.get(k);
      if (g) g.exps.push(ex); else grupos.set(k, { base, exps: [ex] });
    };
    const pila = fs.slice();
    while (pila.length) {
      const f = pila.pop();
      switch (f.t) {
        case 'n': coef = rMul(coef, f.q); break;
        case '*': for (const g of f.a) pila.push(g); break;
        case 'c': if (f.n === 'e') argsExp.push(UNO); else agregar(f, UNO); break;
        case 'f': if (f.f === 'exp') argsExp.push(f.a); else agregar(f, UNO); break;
        case '^': if (f.b.t === 'n' && f.e.t === 'n') rad.push(f); else agregar(f.b, f.e); break;
        default: agregar(f, UNO);
      }
    }
    if (rCero(coef)) return CERO;
    const fuera = [];
    let rehacer = false;
    const meter = (p, base) => {
      if (p.t === 'n') { coef = rMul(coef, p.q); return; }
      if (p.t === '^' && p.b.t === 'n' && p.e.t === 'n') { rad.push(p); return; }
      const b = p.t === '^' ? p.b : p;
      if (!base || clave(b) !== clave(base)) rehacer = true;
      fuera.push(p);
    };
    for (const { base, exps } of grupos.values()) {
      const ex = exps.length === 1 ? exps[0] : mkAdd(exps);
      meter(mkPow(base, ex), base);
    }
    if (argsExp.length) {
      const a = argsExp.length === 1 ? argsExp[0] : mkAdd(argsExp);
      const p = mkFn('exp', a);
      if (p.t === 'n') coef = rMul(coef, p.q);
      else if ((p.t === 'f' && p.f === 'exp') || (p.t === 'c' && p.n === 'e')) fuera.push(p);
      else { rehacer = true; fuera.push(p); }
    }
    // Radicales numéricos: se juntan todos en uno, √6·√2 = √12 = 2√3. Se lleva
    // todo a un índice común L y se extrae de nuevo; así la forma no depende de
    // en qué orden se multiplicaron.
    if (rad.length) {
      const pos = rad.filter(r => r.b.q.n > 0n), neg = rad.filter(r => r.b.q.n < 0n);
      for (const r of neg) fuera.push(r);
      if (pos.length === 1) fuera.push(pos[0]);
      else if (pos.length > 1) {
        let L = 1n;
        for (const r of pos) L = L / bMcd(L, r.e.q.d) * r.e.q.d;
        let M = R1, cabe = true;
        for (const r of pos) {
          const k = r.e.q.n * (L / r.e.q.d);
          if (Number(k) * bBits(r.b.q.n + r.b.q.d) > 20000) { cabe = false; break; }
          M = rMul(M, rPotEnt(r.b.q, k));
        }
        if (!cabe) for (const r of pos) fuera.push(r);
        else {
          const res = numPow(M, R(1n, L));
          const piezas = res.t === '*' ? res.a : [res];
          for (const p of piezas) if (p.t === 'n') coef = rMul(coef, p.q); else fuera.push(p);
        }
      }
    }
    if (rehacer && prof < 8) return mkMul([N(coef), ...fuera], prof + 1);
    const planos = [];
    for (const f of fuera) if (f.t === '*') { for (const g of f.a) if (g.t === 'n') coef = rMul(coef, g.q); else planos.push(g); } else planos.push(f);
    if (rCero(coef)) return CERO;
    planos.sort(cmpFactor);
    if (!planos.length) return N(coef);
    if (rUno(coef) && planos.length === 1) return planos[0];
    return { t: '*', a: rUno(coef) ? planos : [N(coef), ...planos] };
  }

  function mkPow(b, e) {
    if (e.t === 'n') {
      const q = e.q;
      if (rCero(q)) return UNO;                 // incluso 0^0: la convención de los polinomios
      if (rUno(q)) return b;
      switch (b.t) {
        case 'n': return numPow(b.q, q);
        case 'c':
          if (b.n === 'i' && rEnt(q)) {
            const m = Number(((q.n % 4n) + 4n) % 4n);
            return [UNO, I, MENOS_UNO, { t: '*', a: [MENOS_UNO, I] }][m];
          }
          if (b.n === 'e') return mkFn('exp', e);
          break;
        case '^':
          if (rEnt(q)) return mkPow(b.b, mkMul([b.e, e]));
          if (b.e.t === 'n') {
            const prod = rMul(b.e.q, q);
            // (u^k)^(1/k): |u| si k es par, u si es impar —para u real—.
            if (rEnt(b.e.q) && rUno(prod)) return b.e.q.n % 2n === 0n ? mkFn('abs', b.b) : b.b;
            // (u^(p/q))^r con q par: u ya tenía que ser ≥ 0 para que la raíz
            // fuera real, y entonces los exponentes se multiplican sin miedo.
            if (b.e.q.d % 2n === 0n) return mkPow(b.b, N(prod));
          }
          break;
        case '*':
          if (rEnt(q)) return mkMul(b.a.map(f => mkPow(f, e)));
          // (4x)^(1/2) = 2·x^(1/2): solo se saca el coeficiente si es positivo,
          // que es cuando la regla vale para todo x.
          if (b.a[0].t === 'n' && b.a[0].q.n > 0n) {
            const resto = b.a.length === 2 ? b.a[1] : { t: '*', a: b.a.slice(1) };
            return mkMul([numPow(b.a[0].q, q), { t: '^', b: resto, e }]);
          }
          // (−c·r)^q con r una constante positiva (√2, π…): = (−c)^q · r^q,
          // y así √(−√2) es i·2^(1/4) y no una raíz de un negativo a medias.
          if (b.a[0].t === 'n' && b.a[0].q.n < 0n && !variablesDe(b).size && !tieneI(b)) {
            const resto = b.a.length === 2 ? b.a[1] : { t: '*', a: b.a.slice(1) };
            if (valorDe(resto) > 0) return mkMul([numPow(b.a[0].q, q), mkPow(resto, e)]);
          }
          break;
        case 'f':
          if (b.f === 'exp') return mkFn('exp', mkMul([b.a, e]));
          if (b.f === 'abs' && rEnt(q) && q.n % 2n === 0n) return mkPow(b.a, e);
          break;
      }
    } else {
      if (b.t === 'n' && rUno(b.q)) return UNO;
      if (b.t === 'c' && b.n === 'e') return mkFn('exp', e);
    }
    return { t: '^', b, e };
  }

  // Potencia de un racional con exponente racional, en forma normal: el
  // coeficiente racional delante y los radicales con exponente en (0, 1).
  // 2^(-1/2) = (1/2)·√2: el denominador queda racionalizado, como en el colegio.
  function numPow(b, ex) {
    if (rEnt(ex)) return N(rPotEnt(b, ex.n));
    if (rCero(b)) { if (ex.n < 0n) throw indefinido('la fórmula divide entre cero'); return CERO; }
    if (rUno(b)) return UNO;
    if (b.n < 0n) {
      const pos = rNeg(b);
      // Índice impar: la raíz real de un negativo existe y es negativa, como
      // la de «raizN» en «numerico». (−8)^(1/3) = −2.
      if (ex.d % 2n === 1n) { const r = numPow(pos, ex); return ex.n % 2n === 0n ? r : mkMul([MENOS_UNO, r]); }
      // Raíz cuadrada de un negativo: la unidad imaginaria. √(−4) = 2i.
      if (ex.d === 2n) return mkMul([mkPow(I, N(R(ex.n))), numPow(pos, ex)]);
      return { t: '^', b: N(b), e: N(ex) };
    }
    let coef = R1;
    const grupos = new Map();
    const extraer = (m, p, q) => {        // m^(p/q), m entero positivo, q > 1
      if (m === 1n) return;
      let k = p / q; if (p % q !== 0n && p < 0n) k -= 1n;     // piso
      const r = p - k * q;                                    // 0 ≤ r < q
      coef = rMul(coef, rPotEnt(R(m), k));
      if (r === 0n) return;
      const { fs, resto } = factorizarEntero(m);
      const poner = (base, num) => {
        const w = num / q, fr = num % q;
        if (w) coef = rMul(coef, rPotEnt(R(base), w));
        if (fr) {
          const f = R(fr, q), kf = f.n + '/' + f.d;
          const g = grupos.get(kf);
          if (g) g.base *= base; else grupos.set(kf, { base, f });
        }
      };
      for (const [pr, a] of fs) poner(pr, BigInt(a) * r);
      if (resto > 1n) {
        const rz = bRaiz(resto, Number(q));
        if (rz ** q === resto) coef = rMul(coef, rPotEnt(R(rz), r));
        else poner(resto, r);
      }
    };
    extraer(b.n, ex.n, ex.d);
    extraer(b.d, -ex.n, ex.d);
    const rads = [];
    for (const { base, f } of grupos.values()) rads.push({ t: '^', b: N(R(base)), e: N(f) });
    rads.sort(cmpFactor);
    if (!rads.length) return N(coef);
    if (rUno(coef) && rads.length === 1) return rads[0];
    return { t: '*', a: rUno(coef) ? rads : [N(coef), ...rads] };
  }

  // −e: dentro de una suma se reparte (lo hace mkAdd); suelto queda −(…).
  const neg = e => (e.t === '+' ? mkAdd([mkMul([MENOS_UNO, e])]) : mkMul([MENOS_UNO, e]));
  const resta = (a, b) => mkAdd([a, neg(b)]);
  const div = (a, b) => mkMul([a, mkPow(b, MENOS_UNO)]);
  const num = (n, d) => N(R(n, d));

  // ── funciones ─────────────────────────────────────────────────────────────
  // Valores exactos de seno en los ángulos de la tabla del colegio, como
  // fracción de π en [0, 1/2]. Lo demás se reduce a estos por cuadrante.
  const TABLA_SENO = () => new Map([
    ['0', CERO], ['1/6', MEDIO], ['1/4', mkMul([MEDIO, numPow(R(2), R(1, 2))])],
    ['1/3', mkMul([MEDIO, numPow(R(3), R(1, 2))])], ['1/2', UNO]]);
  let tablaSeno = null;
  function senoDePi(t) {                 // seno(π·t) exacto o null
    tablaSeno = tablaSeno || TABLA_SENO();
    t = R(((t.n % (2n * t.d)) + 2n * t.d) % (2n * t.d), t.d);   // t en [0, 2)
    let signo = 1;
    if (rCmp(t, R1) >= 0) { t = rResta(t, R1); signo = -1; }
    if (rCmp(t, R(1, 2)) > 0) t = rResta(R1, t);
    const v = tablaSeno.get(t.d === 1n ? t.n.toString() : t.n + '/' + t.d);
    if (!v) return null;
    return signo > 0 ? v : neg(v);
  }
  function fraccionDePi(a) {           // a = k·π → k, si no null
    if (a.t === 'c' && a.n === 'pi') return R1;
    if (a.t === '*' && a.a.length === 2 && a.a[0].t === 'n' && a.a[1].t === 'c' && a.a[1].n === 'pi') return a.a[0].q;
    if (a.t === 'n' && rCero(a.q)) return R0;
    return null;
  }
  let tablaArco = null;
  function arcoDeTabla(v) {            // arcoseno exacto de los valores de la tabla, o null
    if (!tablaArco) {
      tablaSeno = tablaSeno || TABLA_SENO();
      tablaArco = new Map();
      for (const [k, val] of tablaSeno) {
        const [n, d] = k.split('/');
        tablaArco.set(clave(val), mkMul([N(R(BigInt(n), BigInt(d || 1))), PI]));
      }
    }
    return tablaArco.get(clave(v)) || null;
  }
  const IMPARES = new Set(['seno', 'tangente', 'arcoseno', 'arcotangente']);
  function mkFn(f, a) {
    gastar(1);
    if (esNegativo(a)) {
      if (IMPARES.has(f)) return neg(mkFn(f, neg(a)));
      if (f === 'coseno' || f === 'abs') return mkFn(f, neg(a));
      if (f === 'arcocoseno') return resta(PI, mkFn('arcocoseno', neg(a)));
    }
    switch (f) {
      case 'seno': case 'coseno': case 'tangente': {
        const k = fraccionDePi(a);
        if (k) {
          const s = senoDePi(k), c = senoDePi(rSuma(k, R(1, 2)));
          if (f === 'seno' && s) return s;
          if (f === 'coseno' && c) return c;
          if (f === 'tangente' && s && c) {
            if (esCero(c)) throw indefinido('la tangente no está definida en π/2 + kπ');
            return div(s, c);
          }
        }
        if (f === 'seno' && a.t === 'f' && a.f === 'arcoseno') return a.a;
        if (f === 'coseno' && a.t === 'f' && a.f === 'arcocoseno') return a.a;
        if (f === 'tangente' && a.t === 'f' && a.f === 'arcotangente') return a.a;
        break;
      }
      case 'arcoseno': case 'arcocoseno': {
        if (a.t === 'n' && rCmp(rAbs(a.q), R1) > 0) throw indefinido(`${f}(${imprimir(a)}) no existe: el argumento tiene que estar entre -1 y 1`);
        const v = arcoDeTabla(a);
        if (v) return f === 'arcoseno' ? v : resta(mkMul([MEDIO, PI]), v);
        break;
      }
      case 'arcotangente': {
        if (esCero(a)) return CERO;
        if (esUno(a)) return mkMul([num(1, 4), PI]);
        const r3 = numPow(R(3), R(1, 2));
        if (igual(a, r3)) return mkMul([num(1, 3), PI]);
        if (igual(a, mkMul([num(1, 3), r3]))) return mkMul([num(1, 6), PI]);
        break;
      }
      case 'ln':
        if (a.t === 'n') {
          if (a.q.n <= 0n) throw indefinido(`ln(${imprimir(a)}) no existe: el logaritmo pide un número positivo`);
          if (rUno(a.q)) return CERO;
          // ln(8) = 3·ln(2), ln(1/4) = −2·ln(2): sin esto log(8; 2) no daría 3.
          if (a.q.n === 1n || a.q.d === 1n) {
            const m = a.q.d === 1n ? a.q.n : a.q.d, sg = a.q.d === 1n ? 1n : -1n;
            const { fs, resto } = factorizarEntero(m);
            if (resto === 1n) {
              let g = 0n;
              for (const e of fs.values()) g = bMcd(g, BigInt(e));
              if (g > 1n || sg < 0n) {
                let base = 1n;
                for (const [pr, e] of fs) base *= pr ** (BigInt(e) / g);
                return mkMul([N(R(g * sg)), { t: 'f', f: 'ln', a: N(R(base)) }]);
              }
            }
          }
        }
        if (a.t === 'c' && a.n === 'e') return UNO;
        if (a.t === 'f' && a.f === 'exp') return a.a;
        break;
      case 'exp': {
        if (esCero(a)) return UNO;
        if (esUno(a)) return E;
        if (a.t === 'f' && a.f === 'ln') return a.a;
        // exp(k·ln u + resto) = u^k · exp(resto): así se deshace lo que hace
        // la regla de la cadena al derivar a^x, y «despejar» queda limpio.
        const ts = a.t === '+' ? a.a : [a];
        const lns = [], resto = [];
        for (const t of ts) {
          const [k, r] = partirCoef(t);
          if (r.t === 'f' && r.f === 'ln') lns.push(mkPow(r.a, N(k))); else resto.push(t);
        }
        if (lns.length) return mkMul([...lns, resto.length ? mkFn('exp', mkAdd(resto)) : UNO]);
        break;
      }
      case 'abs': {
        if (a.t === 'n') return N(rAbs(a.q));
        if (a.t === 'c' && a.n !== 'i') return a;
        if (a.t === 'f' && (a.f === 'abs' || a.f === 'exp')) return a;
        if (a.t === '^' && a.e.t === 'n' && rEnt(a.e.q) && a.e.q.n % 2n === 0n) return a;
        if (a.t === '*' && a.a[0].t === 'n') {
          const resto = a.a.length === 2 ? a.a[1] : { t: '*', a: a.a.slice(1) };
          return mkMul([N(rAbs(a.a[0].q)), mkFn('abs', resto)]);
        }
        break;
      }
    }
    return { t: 'f', f, a };
  }

  // Reconstruye un árbol pasando por los constructores; con «hoja» se cambia lo
  // que se quiera en las hojas (sustituir variables, por ejemplo).
  function reconstruir(e, hoja) {
    switch (e.t) {
      case 'n': case 'c': return e;
      case 'v': return hoja(e);
      case '+': return mkAdd(e.a.map(h => reconstruir(h, hoja)));
      case '*': return mkMul(e.a.map(h => reconstruir(h, hoja)));
      case '^': return mkPow(reconstruir(e.b, hoja), reconstruir(e.e, hoja));
      case 'f': return mkFn(e.f, reconstruir(e.a, hoja));
    }
  }
  const sustituirVars = (e, mapa) => reconstruir(e, v => (mapa.has(v.n) ? mapa.get(v.n) : v));
  // Cambia un subárbol entero (por clave) por otro. Lo usa la integración por
  // sustitución: u = x^2 se reemplaza por una variable nueva.
  function reemplazarSub(e, k, por) {
    if (clave(e) === k) return por;
    switch (e.t) {
      case '+': return mkAdd(e.a.map(h => reemplazarSub(h, k, por)));
      case '*': return mkMul(e.a.map(h => reemplazarSub(h, k, por)));
      case '^': return mkPow(reemplazarSub(e.b, k, por), reemplazarSub(e.e, k, por));
      case 'f': return mkFn(e.f, reemplazarSub(e.a, k, por));
      default: return e;
    }
  }

  // ── léxico y análisis ─────────────────────────────────────────────────────
  // Decisiones de notación (están también en la documentación):
  //  · «log» es el logaritmo NATURAL, igual que «log» de «numerico»: si en una
  //    fórmula significara otra cosa que en el resto de Ñ, formulaAFuncion("log(x)")
  //    y log(x) darían distinto. Para base 10 está «log10(x)» y para otra base
  //    «log(x; b)».
  //  · La coma decimal vale SOLO pegada entre dígitos: «3,5» es 3.5. Por eso
  //    los argumentos se separan con «;» o con «, » (coma y espacio).
  //  · Los nombres se leen enteros: «xy» es UNA variable; el producto es «x y»
  //    o «x*y». «3x» sí es 3·x, porque un nombre no empieza por dígito.
  //  · «1/2x» es (1/2)·x: la multiplicación implícita tiene la misma fuerza
  //    que «*» y «/», y se agrupa de izquierda a derecha.
  //  · «e», «pi» (o «π») e «i» son constantes, no variables.
  const FUNCIONES = {
    seno: 'seno', sen: 'seno', sin: 'seno', coseno: 'coseno', cos: 'coseno',
    tangente: 'tangente', tan: 'tangente', tg: 'tangente',
    arcoseno: 'arcoseno', arcsen: 'arcoseno', arcsin: 'arcoseno', asin: 'arcoseno',
    arcocoseno: 'arcocoseno', arccos: 'arcocoseno', acos: 'arcocoseno',
    arcotangente: 'arcotangente', arctan: 'arcotangente', arctg: 'arcotangente', atan: 'arcotangente',
    raiz: 'raiz', sqrt: 'raiz', ln: 'ln', log: 'log', log10: 'log10', exp: 'exp', abs: 'abs', absoluto: 'abs',
  };
  const CONSTANTES = { pi: PI, 'π': PI, e: E, i: I };
  const SUPER_A_DIGITO = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const esLetra = c => /[A-Za-z_À-ÖØ-öø-ɏͰ-Ͽ]/.test(c);
  const esDigito = c => c >= '0' && c <= '9';

  function lexer(src) {
    const toks = [];
    let i = 0;
    const err = (pos, m) => { throw fallo(`en la posición ${pos + 1} de «${src}»: ${m}`); };
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const pos = i;
      if (esDigito(ch) || (ch === '.' && esDigito(src[i + 1] || ''))) {
        let j = i;
        while (j < src.length && esDigito(src[j])) j++;
        const ent = src.slice(i, j);
        let dec = '';
        if ((src[j] === '.' || src[j] === ',') && esDigito(src[j + 1] || '')) {
          let k = j + 1;
          while (k < src.length && esDigito(src[k])) k++;
          dec = src.slice(j + 1, k);
          j = k;
        } else if (src[j] === '.' && !esDigito(src[j + 1] || '')) err(j, 'un número no puede terminar en punto');
        toks.push({ t: 'num', q: R(BigInt((ent || '0') + dec), 10n ** BigInt(dec.length)), pos });
        i = j;
        continue;
      }
      if (ch === 'π') { toks.push({ t: 'id', v: 'π', pos }); i++; continue; }
      // Superíndices: «x²», «x¹⁰». Es lo que escribe formulaATexto, así que
      // su salida se puede volver a leer.
      if (SUPER_A_DIGITO[ch] !== undefined) {
        let j = i, d = '';
        while (j < src.length && SUPER_A_DIGITO[src[j]] !== undefined) d += SUPER_A_DIGITO[src[j++]];
        toks.push({ t: 'sup', q: R(BigInt(d)), pos });
        i = j;
        continue;
      }
      if (esLetra(ch)) {
        let j = i + 1;
        while (j < src.length && src[j] !== 'π' && (esLetra(src[j]) || esDigito(src[j]))) j++;
        toks.push({ t: 'id', v: src.slice(i, j), pos });
        i = j;
        continue;
      }
      i++;
      switch (ch) {
        case '+': toks.push({ t: '+', pos }); break;
        case '-': case '−': case '–': toks.push({ t: '-', pos }); break;
        case '*':
          if (src[i] === '*') { i++; toks.push({ t: '^', pos }); } else toks.push({ t: '*', pos });
          break;
        case '·': case '×': case '⋅': toks.push({ t: '*', pos }); break;
        case '/': case '÷': toks.push({ t: '/', pos }); break;
        case '^': toks.push({ t: '^', pos }); break;
        case '(': case '[': case '{': toks.push({ t: '(', pos }); break;
        case ')': case ']': case '}': toks.push({ t: ')', pos }); break;
        case ',': case ';': toks.push({ t: ',', pos }); break;
        case '=': toks.push({ t: '=', pos }); break;
        case '|': toks.push({ t: '|', pos }); break;
        case '√': toks.push({ t: '√', pos }); break;
        case '∛': toks.push({ t: '∛', pos }); break;
        default: err(pos, `no entiendo el carácter «${ch}»`);
      }
    }
    toks.push({ t: 'fin', pos: src.length });
    return toks;
  }

  const describir = t => (t.t === 'fin' ? 'el final' : t.t === 'num' ? 'un número' : t.t === 'id' ? `«${t.v}»` : t.t === 'sup' ? '«²»' : `«${t.t}»`);

  // Devuelve {izq, der} si hay «=», o {izq} si no.
  function analizar(src) {
    if (typeof src !== 'string') throw fallo('la fórmula tiene que ser texto');
    if (!src.trim()) throw fallo('la fórmula está vacía');
    const toks = lexer(src);
    let p = 0, enAbs = 0;
    const ver = () => toks[p];
    const err = (t, m) => { throw fallo(`en la posición ${t.pos + 1} de «${src}»: ${m}`); };
    const esperar = (tipo, que) => {
      const t = ver();
      if (t.t !== tipo) err(t, `esperaba ${que} y encontré ${describir(t)}`);
      p++;
      return t;
    };
    function expr() {
      let a = termino();
      for (;;) {
        const t = ver();
        if (t.t === '+') { p++; a = mkAdd([a, termino()]); }
        else if (t.t === '-') { p++; a = resta(a, termino()); }
        else return a;
      }
    }
    // Lo que puede empezar un factor sin operador delante: «3x», «2(x+1)», «x y».
    const empiezaFactor = t => t.t === 'id' || t.t === '(' || t.t === '√' || t.t === '∛' || (t.t === '|' && enAbs === 0);
    function termino() {
      let a = unario();
      for (;;) {
        const t = ver();
        if (t.t === '*') { p++; a = mkMul([a, unario()]); }
        else if (t.t === '/') {
          p++;
          const tb = ver();
          const b = unario();
          if (esCero(b)) err(tb, 'la fórmula divide entre cero');
          a = div(a, b);
        }
        else if (empiezaFactor(t)) a = mkMul([a, potencia()]);
        else if (t.t === 'num') err(t, 'un número no puede ir pegado detrás de otra cosa; escribe «*» entre los dos');
        else return a;
      }
    }
    function unario() {
      const t = ver();
      if (t.t === '-') { p++; return mkMul([MENOS_UNO, unario()]); }
      if (t.t === '+') { p++; return unario(); }
      return potencia();
    }
    function potencia() {
      let b = primario();
      while (ver().t === 'sup') b = mkPow(b, N(toks[p++].q));
      if (ver().t === '^') { p++; return mkPow(b, unario()); }
      return b;
    }
    function primario() {
      const t = ver();
      if (t.t === 'num') { p++; return N(t.q); }
      if (t.t === '(') { p++; const a = expr(); esperar(')', '«)»'); return a; }
      if (t.t === '|') { p++; enAbs++; const a = expr(); enAbs--; esperar('|', '«|» para cerrar el valor absoluto'); return mkFn('abs', a); }
      if (t.t === '√') { p++; return mkPow(potencia(), MEDIO); }
      if (t.t === '∛') { p++; return mkPow(potencia(), num(1, 3)); }
      if (t.t === 'id') {
        p++;
        const nombre = t.v;
        if (Object.prototype.hasOwnProperty.call(CONSTANTES, nombre)) return CONSTANTES[nombre];
        const f = Object.prototype.hasOwnProperty.call(FUNCIONES, nombre) ? FUNCIONES[nombre] : null;
        const sigue = ver();
        if (f) {
          if (sigue.t !== '(') err(sigue, `«${nombre}» es una función: escribe ${nombre}(…) con paréntesis`);
          p++;
          const args = [expr()];
          while (ver().t === ',') { p++; args.push(expr()); }
          esperar(')', '«)» para cerrar los argumentos');
          return aplicar(f, args, t);
        }
        // Un nombre de varias letras pegado a «(» es casi seguro una función que
        // no existe (sinh, f…); tomarlo como producto escondería el error.
        if (sigue.t === '(' && sigue.pos === t.pos + nombre.length && nombre.length > 1)
          err(t, `no conozco la función «${nombre}»`);
        return V(nombre);
      }
      err(t, `esperaba un número, una variable o «(» y encontré ${describir(t)}`);
    }
    function aplicar(f, args, t) {
      const n = args.length;
      const exigir = k => { if (n !== k) err(t, `«${t.v}» lleva ${k} argumento${k > 1 ? 's' : ''} y recibió ${n}`); };
      switch (f) {
        case 'raiz': exigir(1); return mkPow(args[0], MEDIO);
        case 'log':
          if (n === 2) return div(mkFn('ln', args[0]), mkFn('ln', args[1]));
          exigir(1); return mkFn('ln', args[0]);
        case 'log10': exigir(1); return div(mkFn('ln', args[0]), mkFn('ln', num(10)));
        default: exigir(1); return mkFn(f, args[0]);
      }
    }
    const izq = expr();
    if (ver().t === '=') {
      p++;
      const der = expr();
      if (ver().t === '=') err(ver(), 'una ecuación lleva un solo «=»');
      if (ver().t !== 'fin') err(ver(), `sobra ${describir(ver())}`);
      return { izq, der };
    }
    if (ver().t !== 'fin') err(ver(), ver().t === ')' ? 'sobra un «)»' : `sobra ${describir(ver())}`);
    return { izq };
  }
  // Envuelve «indefinido» al leer: «1/0» escrito a mano es un error de quien
  // escribe, no una pregunta.
  function leer(src) {
    try { return analizar(src); }
    catch (e) { if (e instanceof ErrorFormula && e.tipo === 'indefinido') throw fallo(`«${src}»: ${e.message}`); throw e; }
  }
  function leerExpr(src) {
    const r = leer(src);
    if (r.der) throw fallo(`«${src}» es una ecuación y aquí se espera una expresión sin «=»`, 'quita el «=» o usa resolverFormula');
    return r.izq;
  }
  // Una ecuación se guarda como «izquierda − derecha = 0». Sin «=», la fórmula
  // misma se iguala a cero.
  function leerEcuacion(src) {
    const r = leer(src);
    return r.der ? resta(r.izq, r.der) : r.izq;
  }
  // Las variables tal como se escribieron, antes de restar los dos lados:
  // «x + 1 = x» sí tiene x (y no tiene solución); «y^2 = 4» resuelta en x no.
  function variablesEscritas(src) {
    const r = leer(src);
    const s = new Set(variablesDe(r.izq));
    if (r.der) for (const v of variablesDe(r.der)) s.add(v);
    return s;
  }
  function exigirVariable(x) {
    if (typeof x !== 'string' || !/^[A-Za-z_À-ÖØ-öø-ɏͰ-Ͽ][A-Za-z0-9_À-ÖØ-öø-ɏͰ-Ͽ]*$/.test(x))
      throw fallo(`«${x}» no es un nombre de variable válido`);
    if (CONSTANTES[x] || FUNCIONES[x]) throw fallo(`«${x}» no puede ser una variable: es ${CONSTANTES[x] ? 'una constante' : 'una función'}`);
    return x;
  }

  // ── impresión ─────────────────────────────────────────────────────────────
  // Una sola rutina con dos estilos: el canónico (ASCII, se puede volver a
  // leer y es lo que devuelven las demás funciones) y el bonito (², √, π, ·).
  // pr devuelve [texto, precedencia]: 1 suma, 2 producto, 4 potencia, 5 átomo.
  const ESTILO_TEXTO = { mul: '*', menos: '-', pi: 'pi', sup: false, raiz: s => `raiz(${s})`, raiz3: null, abs: s => `abs(${s})`, juntarRaiz: false };
  const ESTILO_BONITO = { mul: '·', menos: '−', pi: 'π', sup: true, raiz: (s, prec) => (prec >= 5 ? '√' + s : `√(${s})`), raiz3: (s, prec) => (prec >= 5 ? '∛' + s : `∛(${s})`), abs: s => `|${s}|`, juntarRaiz: true };
  const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const par = (s, prec, min) => (prec < min ? '(' + s + ')' : s);

  function imprimir(e, est) {
    est = est || ESTILO_TEXTO;
    return pr(e, est)[0];
  }
  function pr(e, est) {
    switch (e.t) {
      case 'n': {
        const q = e.q;
        const s = (q.n < 0n ? est.menos : '') + bAbs(q.n).toString() + (q.d === 1n ? '' : '/' + q.d);
        return [s, q.n < 0n ? 1 : q.d === 1n ? 5 : 2];
      }
      case 'v': return [e.n, 5];
      case 'c': return [e.n === 'pi' ? est.pi : e.n, 5];
      case '+': {
        let s = pr(e.a[0], est)[0];
        for (let i = 1; i < e.a.length; i++) {
          const t = e.a[i];
          if (esNegativo(t)) s += ` ${est.menos} ` + par(...pr(neg(t), est), 2);
          else s += ' + ' + pr(t, est)[0];
        }
        return [s, 1];
      }
      case '*': return prMul(e.a, est);
      case '^': {
        if (e.e.t === 'n' && e.e.q.n < 0n) return prMul([e], est);
        if (e.b.t === 'c' && e.b.n === 'e') break;
        if (e.e.t === 'n' && rIgual(e.e.q, R(1, 2))) { const [s, p] = pr(e.b, est); return [est.sup ? est.raiz(s, p) : est.raiz(s), 5]; }
        if (est.raiz3 && e.e.t === 'n' && rIgual(e.e.q, R(1, 3))) { const [s, p] = pr(e.b, est); return [est.raiz3(s, p), 5]; }
        const base = par(...pr(e.b, est), 5);
        return [base + exponente(e.e, est), 4];
      }
      case 'f': {
        if (e.f === 'exp') return ['e' + exponente(e.a, est), 4];
        if (e.f === 'abs') return [est.abs(pr(e.a, est)[0]), 5];
        return [`${e.f}(${pr(e.a, est)[0]})`, 5];
      }
    }
    return ['?', 5];
  }
  function exponente(x, est) {
    if (est.sup && x.t === 'n' && rEnt(x.q) && x.q.n >= 0n) return x.q.n.toString().split('').map(d => SUPER[d]).join('');
    const [s, p] = pr(x, est);
    if ((x.t === 'n' && rEnt(x.q) && x.q.n >= 0n) || x.t === 'v' || x.t === 'c') return '^' + s;
    return '^(' + s + ')';
  }
  // Un producto se imprime como fracción: lo de exponente negativo va abajo.
  // El coeficiente se pega a lo que sigue cuando no hay ambigüedad («3x»,
  // «2(x + 1)»), y entre lo demás va «*» (o «·» en el estilo bonito).
  function prMul(fs, est) {
    let coef = R1;
    const arriba = [], abajo = [];
    for (const f of fs) {
      if (f.t === 'n') coef = rMul(coef, f.q);
      else if (f.t === '^' && f.e.t === 'n' && f.e.q.n < 0n) abajo.push(mkPowCrudo(f.b, rNeg(f.e.q)));
      else arriba.push(f);
    }
    const signo = coef.n < 0n ? est.menos : '';
    const cn = bAbs(coef.n), cd = coef.d;
    const juntar = (numeral, factores) => {
      let s = numeral, prev = numeral ? 'num' : null;
      for (const f of factores) {
        const [t, p] = pr(f, est);
        const str = par(t, p, f.t === '^' ? 4 : 3);
        let pegado = false;
        if (prev === 'num') pegado = f.t === 'v' || (f.t === 'c' && f.n !== 'i') || (f.t === '^' && (f.b.t === 'v' || f.b.t === 'c') && !str.startsWith('raiz')) || str.startsWith('(') || (est.juntarRaiz && (str.startsWith('√') || str.startsWith('∛')));
        else if (prev) pegado = str.startsWith('(') && (prev.endsWith(')') || /^[A-Za-z]$/.test(prev)) && !est.sup;
        s = s ? s + (pegado ? '' : est.mul) + str : str;
        prev = str;
      }
      return s;
    };
    let sArr = juntar(cn !== 1n || !arriba.length ? cn.toString() : '', arriba);
    if (!abajo.length && cd === 1n) {
      const prec = arriba.length === 1 && cn === 1n ? pr(arriba[0], est)[1] : 2;
      return [signo + sArr, signo ? 1 : prec];
    }
    const piezasAbajo = (cd !== 1n ? 1 : 0) + abajo.length;
    let sAb = juntar(cd !== 1n ? cd.toString() : '', abajo);
    if (piezasAbajo > 1) sAb = '(' + sAb + ')';
    else if (abajo.length === 1) {
      const [t, p] = pr(abajo[0], est);
      sAb = par(t, p, 3);
    }
    if (arriba.length === 1 && cn === 1n) { const [t, p] = pr(arriba[0], est); sArr = par(t, p, 3); }
    return [signo + sArr + '/' + sAb, signo ? 1 : 2];
  }
  function mkPowCrudo(b, q) { return rUno(q) ? b : { t: '^', b, e: N(q) }; }

  // LaTeX: \frac para lo de abajo, \sqrt, y los nombres de función de siempre.
  const LATEX_FN = { seno: '\\sin', coseno: '\\cos', tangente: '\\tan', arcoseno: '\\arcsin', arcocoseno: '\\arccos', arcotangente: '\\arctan', ln: '\\ln' };
  function latex(e) { return lx(e)[0]; }
  function lx(e) {
    switch (e.t) {
      case 'n': {
        const q = e.q;
        if (q.d === 1n) return [q.n.toString(), q.n < 0n ? 1 : 5];
        return [(q.n < 0n ? '-' : '') + `\\frac{${bAbs(q.n)}}{${q.d}}`, q.n < 0n ? 1 : 2];
      }
      case 'v': return [e.n.length > 1 ? `\\mathrm{${e.n}}` : e.n, 5];
      case 'c': return [e.n === 'pi' ? '\\pi' : e.n, 5];
      case '+': {
        let s = lx(e.a[0])[0];
        for (let i = 1; i < e.a.length; i++) {
          const t = e.a[i];
          if (esNegativo(t)) s += ' - ' + lpar(...lx(neg(t)), 2);
          else s += ' + ' + lx(t)[0];
        }
        return [s, 1];
      }
      case '*': return lxMul(e.a);
      case '^': {
        if (e.e.t === 'n' && e.e.q.n < 0n) return lxMul([e]);
        if (e.e.t === 'n' && rIgual(e.e.q, R(1, 2))) return [`\\sqrt{${lx(e.b)[0]}}`, 5];
        if (e.e.t === 'n' && e.e.q.n === 1n) return [`\\sqrt[${e.e.q.d}]{${lx(e.b)[0]}}`, 5];
        return [lpar(...lx(e.b), 5) + `^{${lx(e.e)[0]}}`, 4];
      }
      case 'f': {
        if (e.f === 'exp') return [`e^{${lx(e.a)[0]}}`, 4];
        if (e.f === 'abs') return [`\\left|${lx(e.a)[0]}\\right|`, 5];
        return [`${LATEX_FN[e.f]}\\left(${lx(e.a)[0]}\\right)`, 5];
      }
    }
  }
  const lpar = (s, p, min) => (p < min ? `\\left(${s}\\right)` : s);
  function lxMul(fs) {
    let coef = R1;
    const arriba = [], abajo = [];
    for (const f of fs) {
      if (f.t === 'n') coef = rMul(coef, f.q);
      else if (f.t === '^' && f.e.t === 'n' && f.e.q.n < 0n) abajo.push(mkPowCrudo(f.b, rNeg(f.e.q)));
      else arriba.push(f);
    }
    const signo = coef.n < 0n ? '-' : '';
    const cn = bAbs(coef.n), cd = coef.d;
    const juntar = (numeral, fs2) => {
      let s = numeral;
      for (const f of fs2) {
        const [t, p] = lx(f);
        const str = lpar(t, p, f.t === '^' ? 4 : 3);
        s = s ? s + (/^[0-9]/.test(str) || /^\\sqrt/.test(str) && /[0-9]$/.test(s) ? ' \\cdot ' : ' ') + str : str;
      }
      return s;
    };
    let sArr = juntar(cn !== 1n || !arriba.length ? cn.toString() : '', arriba);
    if (!abajo.length && cd === 1n) return [signo + sArr, signo ? 1 : 2];
    let sAb = juntar(cd !== 1n ? cd.toString() : '', abajo);
    // Dentro de \frac las llaves ya agrupan: sin paréntesis de más.
    if (cn === 1n && arriba.length === 1) sArr = lx(arriba[0])[0];
    if (cd === 1n && abajo.length === 1) sAb = lx(abajo[0])[0];
    return [`${signo}\\frac{${sArr}}{${sAb}}`, signo ? 1 : 2];
  }

  // ── expansión ─────────────────────────────────────────────────────────────
  const TOPE_TERMINOS = 3000;
  function expandir(e) {
    switch (e.t) {
      case '+': return mkAdd(e.a.map(expandir));
      case '*': {
        let acc = UNO;
        for (const f of e.a) acc = distribuir(acc, expandir(f));
        return acc;
      }
      case '^': {
        const b = expandir(e.b), x = expandir(e.e);
        if (b.t === '+' && x.t === 'n' && rEnt(x.q) && x.q.n !== 0n) {
          const k = bAbs(x.q.n);
          if (k > 200n) throw fallo('la potencia es demasiado grande para expandirla');
          // Potencia por cuadrados: (a+b)^8 son tres multiplicaciones, no siete.
          let r = UNO, base = b, n = k;
          while (n > 0n) {
            if (n & 1n) r = distribuir(r, base);
            n >>= 1n;
            if (n) base = distribuir(base, base);
          }
          return x.q.n < 0n ? mkPow(r, MENOS_UNO) : r;
        }
        return mkPow(b, x);
      }
      case 'f': return mkFn(e.f, expandir(e.a));
      default: return e;
    }
  }

  // Producto de dos expresiones ya expandidas, término a término. No pasa por
  // mkMul con las sumas enteras: (a+b)·(a+b) volvería a ser (a+b)^2.
  function distribuir(x, y) {
    const tx = x.t === '+' ? x.a : [x], ty = y.t === '+' ? y.a : [y];
    if (tx.length * ty.length > TOPE_TERMINOS) throw fallo('al expandir salen demasiados términos (más de ' + TOPE_TERMINOS + ')', 'deja la fórmula factorizada o usa evaluarFormula');
    const out = [];
    for (const a of tx) for (const b of ty) {
      const m = mkMul([a, b]);
      // a·b puede volver a ser una potencia de suma (√(x+1)·√(x+1) = x + 1):
      out.push(m.t === '+' || (m.t === '^' && m.b.t === '+') || m.t === '*' && m.a.some(f => f.t === '+' || (f.t === '^' && f.b.t === '+' && f.e.t === 'n' && rEnt(f.e.q) && f.e.q.n > 0n)) ? expandir(m) : m);
    }
    gastar(out.length);
    return mkAdd(out);
  }

  // ── polinomios de una variable con coeficientes racionales ────────────────
  // Arreglos de Rac, índice = grado. Sirven para el máximo común divisor, las
  // raíces racionales, factorizar y las fracciones parciales.
  const pRecortar = p => { while (p.length && rCero(p[p.length - 1])) p.pop(); return p; };
  const pGrado = p => p.length - 1;
  function pSuma(a, b) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(rSuma(a[i] || R0, b[i] || R0)); return pRecortar(r); }
  function pMul(a, b) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(R0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = rSuma(r[i + j], rMul(a[i], b[j]));
    gastar(a.length * b.length);
    return pRecortar(r);
  }
  const pEscalar = (a, c) => pRecortar(a.map(x => rMul(x, c)));
  function pDivMod(a, b) {
    a = a.slice();
    const q = new Array(Math.max(0, a.length - b.length + 1)).fill(R0);
    const lb = b[b.length - 1];
    while (a.length >= b.length && a.length) {
      const k = a.length - b.length, c = rDiv(a[a.length - 1], lb);
      q[k] = c;
      for (let i = 0; i < b.length; i++) a[i + k] = rResta(a[i + k], rMul(c, b[i]));
      a.pop();
      pRecortar(a);
    }
    return [pRecortar(q), a];
  }
  function pMcd(a, b) {
    a = pRecortar(a.slice()); b = pRecortar(b.slice());
    while (b.length) { const r = pDivMod(a, b)[1]; a = b; b = r; }
    return a.length ? pEscalar(a, rDiv(R1, a[a.length - 1])) : a;
  }
  const pDerivar = p => pRecortar(p.slice(1).map((c, i) => rMul(c, R(i + 1))));
  function pEval(p, x) { let r = R0; for (let i = p.length - 1; i >= 0; i--) r = rSuma(rMul(r, x), p[i]); return r; }
  function pAExpr(p, x) {
    const ts = [];
    p.forEach((c, k) => { if (!rCero(c)) ts.push(mkMul([N(c), mkPow(V(x), num(k))])); });
    return mkAdd(ts);
  }
  // Coeficientes enteros primitivos y el factor que se sacó: p = c · prim.
  function pPrimitivo(p) {
    let l = 1n;
    for (const c of p) l = l / bMcd(l, c.d) * c.d;
    let g = 0n;
    const ent = p.map(c => c.n * (l / c.d));
    for (const v of ent) g = bMcd(g, v);
    if (g === 0n) return { c: R0, p: ent.map(() => R0) };
    let s = ent[ent.length - 1] < 0n ? -1n : 1n;
    return { c: R(g * s, l), p: ent.map(v => R(v / (g * s))) };
  }
  function divisores(m) {
    m = bAbs(m);
    if (m === 0n) return [];
    const { fs, resto } = factorizarEntero(m);
    let ds = [1n];
    const todos = [...fs];
    if (resto > 1n) todos.push([resto, 1]);
    for (const [pr, e] of todos) {
      const nuevo = [];
      for (const d of ds) { let x = d; for (let k = 0; k <= e; k++) { nuevo.push(x); x *= pr; } }
      ds = nuevo;
      if (ds.length > 20000) throw fallo('el polinomio tiene coeficientes con demasiados divisores para buscar raíces racionales');
    }
    return ds;
  }
  // Raíces racionales por el teorema de la raíz racional: p/q con p que divide
  // al término independiente y q al principal. Devuelve las raíces con su
  // multiplicidad y lo que queda sin factorizar (con su coeficiente principal).
  function raicesRacionales(p) {
    let resto = pRecortar(p.slice());
    const raices = [];
    let ceros = 0;
    while (resto.length > 1 && rCero(resto[0])) { resto.shift(); ceros++; }
    if (ceros) raices.push({ r: R0, m: ceros });
    if (resto.length <= 1) return { raices, resto };
    const prim = pPrimitivo(resto).p;
    const ps = divisores(prim[0].n), qs = divisores(prim[prim.length - 1].n);
    const cands = new Map();
    for (const a of ps) for (const b of qs) { const r = R(a, b); cands.set(r.n + '/' + r.d, r); }
    for (const c0 of cands.values()) {
      for (const c of [c0, rNeg(c0)]) {
        gastar(resto.length);
        let m = 0;
        while (resto.length > 1 && rCero(pEval(resto, c))) { resto = pDivMod(resto, [rNeg(c), R1])[0]; m++; }
        if (m) raices.push({ r: c, m });
        if (resto.length <= 1) break;
      }
      if (resto.length <= 1) break;
    }
    raices.sort((a, b) => rCmp(a.r, b.r));
    return { raices, resto };
  }

  // Ve una expresión como polinomio en x: lista de coeficientes (expresiones
  // que no dependen de x), o null si x aparece de otra forma (en un seno, en
  // un denominador, con exponente fraccionario…).
  function comoPolinomio(e, x) {
    const ex = expandir(e);
    const ts = ex.t === '+' ? ex.a : [ex];
    const cs = [];
    for (const t of ts) {
      const fs = t.t === '*' ? t.a : [t];
      let g = 0;
      const otros = [];
      for (const f of fs) {
        if (!depende(f, x)) otros.push(f);
        else if (f.t === 'v') g += 1;
        else if (f.t === '^' && f.b.t === 'v' && f.b.n === x && f.e.t === 'n' && rEnt(f.e.q) && f.e.q.n > 0n && f.e.q.n < 10000n) g += Number(f.e.q.n);
        else return null;
      }
      (cs[g] = cs[g] || []).push(mkMul(otros));
    }
    const out = [];
    for (let k = 0; k < cs.length; k++) out.push(cs[k] ? mkAdd(cs[k]) : CERO);
    while (out.length > 1 && esCero(out[out.length - 1])) out.pop();
    return out;
  }
  const polyQ = cs => (cs && cs.every(esNum) ? pRecortar(cs.map(c => c.q)) : null);
  function polyQDe(e, x) { return polyQ(comoPolinomio(e, x)); }

  // ── fracción única (juntar) ───────────────────────────────────────────────
  // Lleva la expresión a numerador/denominador, ambos expandidos, y cancela lo
  // común: potencias de cada base, el contenido numérico y, si es de una sola
  // variable con coeficientes racionales, el máximo común divisor polinómico.
  // Es lo que reconoce que (x^2 − 1)/(x − 1) es x + 1 y que una resta es cero.
  function juntar(e) {
    switch (e.t) {
      case 'n': return e.q.d === 1n ? { num: e, den: UNO } : { num: N(R(e.q.n)), den: N(R(e.q.d)) };
      case 'v': case 'c': return { num: e, den: UNO };
      case 'f': {
        // Para reconocer identidades, la trigonometría se lleva a seno y
        // coseno de un solo ángulo: tangente = seno/coseno y el ángulo doble
        // se abre. Es solo para comparar: si la forma resultante es más larga,
        // «simplificar» no la elige.
        const u = juntarExpr(e.a);
        if (e.f === 'tangente') return juntar(div(mkFn('seno', u), mkFn('coseno', u)));
        if ((e.f === 'seno' || e.f === 'coseno') && u.t === '*' && u.a[0].t === 'n' && rIgual(u.a[0].q, R(2))) {
          const v = u.a.length === 2 ? u.a[1] : { t: '*', a: u.a.slice(1) };
          const sv = mkFn('seno', v), cv = mkFn('coseno', v);
          return juntar(e.f === 'seno' ? mkMul([DOS, sv, cv]) : resta(mkPow(cv, DOS), mkPow(sv, DOS)));
        }
        return { num: mkFn(e.f, u), den: UNO };
      }
      case '+': {
        let acc = juntar(e.a[0]);
        for (let i = 1; i < e.a.length; i++) {
          const b = juntar(e.a[i]);
          if (igual(acc.den, b.den)) acc = { num: expandir(mkAdd([acc.num, b.num])), den: acc.den };
          else acc = { num: expandir(mkAdd([mkMul([acc.num, b.den]), mkMul([b.num, acc.den])])), den: expandir(mkMul([acc.den, b.den])) };
        }
        return cancelar(acc.num, acc.den);
      }
      case '*': {
        let n = UNO, d = UNO;
        for (const f of e.a) { const j = juntar(f); n = expandir(mkMul([n, j.num])); d = expandir(mkMul([d, j.den])); }
        return cancelar(n, d);
      }
      case '^': {
        // coseno(u)^(2k) = (1 − seno(u)^2)^k: con eso seno^2 + coseno^2 se
        // reconoce aunque los coeficientes no coincidan.
        if (e.e.t === 'n' && rEnt(e.e.q) && e.e.q.n > 0n && e.e.q.n % 2n === 0n && e.b.t === 'f' && e.b.f === 'coseno')
          return juntar(mkPow(resta(UNO, mkPow(mkFn('seno', e.b.a), DOS)), N(R(e.e.q.n / 2n))));
        if (e.e.t === 'n' && rEnt(e.e.q)) {
          const j = juntar(e.b);
          const k = N(R(bAbs(e.e.q.n)));
          const n = expandir(mkPow(j.num, k)), d = expandir(mkPow(j.den, k));
          return e.e.q.n > 0n ? cancelar(n, d) : cancelar(d, n);
        }
        const b = juntarExpr(e.b);
        if (e.e.t === 'n' && e.e.q.n < 0n) return { num: UNO, den: mkPow(b, N(rNeg(e.e.q))) };
        return { num: mkPow(b, juntarExpr(e.e)), den: UNO };
      }
    }
  }
  function terminosDe(e) { return e.t === '+' ? e.a : [e]; }
  function cancelar(n, d) {
    if (esCero(d)) throw indefinido('la fórmula divide entre cero');
    if (esCero(n)) return { num: CERO, den: UNO };
    if (d.t === 'n') return { num: expandir(mkMul([n, N(rDiv(R1, d.q))])), den: UNO };
    // Potencias comunes de cada base, por el mínimo exponente numérico.
    const minimo = new Map();
    let primero = true;
    for (const t of [...terminosDe(n), ...terminosDe(d)]) {
      const fs = (t.t === '*' ? t.a : [t]).filter(f => f.t !== 'n');
      const aqui = new Map();
      for (const f of fs) {
        const b = f.t === '^' ? f.b : f, ex = f.t === '^' ? f.e : UNO;
        if (ex.t !== 'n' || b.t === 'n') continue;
        aqui.set(clave(b), { b, q: ex.q });
      }
      if (primero) { for (const [k, v] of aqui) if (v.q.n > 0n) minimo.set(k, v); primero = false; }
      else for (const [k, v] of minimo) {
        const a = aqui.get(k);
        if (!a || a.q.n <= 0n) minimo.delete(k);
        else if (rCmp(a.q, v.q) < 0) minimo.set(k, a);
      }
    }
    if (minimo.size) {
      const quitar = mkMul([...minimo.values()].map(({ b, q }) => mkPow(b, N(rNeg(q)))));
      n = expandir(mkMul([n, quitar]));
      d = expandir(mkMul([d, quitar]));
    }
    // Una sola variable y coeficientes racionales: máximo común divisor.
    const vs = new Set([...variablesDe(n), ...variablesDe(d)]);
    if (vs.size === 1) {
      const x = [...vs][0];
      const pn = polyQDe(n, x), pd = polyQDe(d, x);
      if (pn && pd && pd.length > 1) {
        const g = pMcd(pn, pd);
        if (g.length > 1) {
          n = pAExpr(pDivMod(pn, g)[0], x);
          d = pAExpr(pDivMod(pd, g)[0], x);
        }
      }
    }
    // El denominador con coeficientes enteros primitivos y principal positivo.
    const cont = contenido(d);
    if (!rUno(cont)) { n = expandir(mkMul([n, N(rDiv(R1, cont))])); d = expandir(mkMul([d, N(rDiv(R1, cont))])); }
    if (d.t === 'n') return { num: expandir(mkMul([n, N(rDiv(R1, d.q))])), den: UNO };
    return { num: n, den: d };
  }
  // Contenido racional de una suma: mcd de numeradores / mcm de denominadores,
  // con el signo del primer término.
  function contenido(e) {
    const qs = terminosDe(e).map(t => partirCoef(t)[0]);
    let g = 0n, l = 1n;
    for (const q of qs) { g = bMcd(g, q.n); l = l / bMcd(l, q.d) * q.d; }
    if (g === 0n) return R1;
    return R(qs[0].n < 0n ? -g : g, l);
  }
  function juntarExpr(e) {
    const { num: n, den: d } = juntar(e);
    if (esUno(d)) return n;
    // Para mostrar, el contenido del numerador va fuera: 3(x + 1)/(2x).
    const c = contenido(n);
    const n2 = rUno(c) ? n : expandir(mkMul([n, N(rDiv(R1, c))]));
    return mkMul([N(c), n2, mkPow(d, MENOS_UNO)]);
  }

  // ── simplificar: elegir la forma más corta ────────────────────────────────
  function intentar(fn) {
    try { return fn(); }
    catch (e) { if (e instanceof ErrorFormula) return null; throw e; }
  }
  function simplificar(e) {
    // En empate gana la expandida: «-x - 1» antes que «-(x + 1)», como se
    // escribe un resultado; la factorizada solo si es más corta de verdad.
    const cands = [];
    const ex = intentar(() => expandir(e));
    if (ex) cands.push(ex);
    cands.push(e);
    const jx = intentar(() => juntarExpr(e));
    if (jx) cands.push(jx);
    let mejor = cands[0], tm = tamano(mejor);
    for (const c of cands.slice(1)) { const t = tamano(c); if (t < tm) { mejor = c; tm = t; } }
    return mejor;
  }
  const esCeroSimbolico = e => esCero(simplificar(e));

  // ── factorizar ────────────────────────────────────────────────────────────
  function factorizar(e) {
    const j = intentar(() => juntar(e));
    if (j && !esUno(j.den)) return mkMul([factorizarPoli(j.num), mkPow(factorizarPoli(j.den), MENOS_UNO)]);
    return factorizarPoli(expandir(e));
  }
  function factorizarPoli(e) {
    if (e.t !== '+') return e;
    // 1) contenido numérico y monomio común
    const c = contenido(e);
    const minimo = new Map();
    e.a.forEach((t, i) => {
      const fs = (t.t === '*' ? t.a : [t]).filter(f => f.t !== 'n');
      const aqui = new Map();
      for (const f of fs) {
        const b = f.t === '^' ? f.b : f, ex = f.t === '^' ? f.e : UNO;
        if (ex.t === 'n' && ex.q.n > 0n) aqui.set(clave(b), { b, q: ex.q });
      }
      if (i === 0) for (const [k, v] of aqui) minimo.set(k, v);
      else for (const [k, v] of [...minimo]) {
        const a = aqui.get(k);
        if (!a) minimo.delete(k); else if (rCmp(a.q, v.q) < 0) minimo.set(k, a);
      }
    });
    const mono = mkMul([...minimo.values()].map(({ b, q }) => mkPow(b, N(q))));
    let resto = expandir(mkMul([e, N(rDiv(R1, c)), mkPow(mono, MENOS_UNO)]));
    const factores = factoresDe(resto);
    return mkMul([N(c), mono, ...factores]);
  }
  // Factores de un polinomio primitivo (sin contenido ni monomio común).
  function factoresDe(p) {
    const vs = [...variablesDe(p)];
    if (vs.length === 1) {
      const x = vs[0], q = polyQDe(p, x);
      if (q && q.length > 2) return factoresUni(q, x, V(x));
    }
    // Dos variables y homogéneo: se fija y = 1, se factoriza en x y se vuelve
    // a homogeneizar. Es lo que da x^2 − y^2 = (x − y)(x + y).
    if (vs.length === 2 && p.t === '+') {
      const [x, y] = vs.sort();
      const cx = comoPolinomio(p, x);
      if (cx) {
        const n = cx.length - 1;
        let homog = true;
        const q = [];
        for (let k = 0; k <= n && homog; k++) {
          const cy = cx[k];
          if (esCero(cy)) { q.push(R0); continue; }
          const py = polyQDe(cy, y);
          if (!py) { homog = false; break; }
          const nz = py.map((v, i) => (rCero(v) ? -1 : i)).filter(i => i >= 0);
          if (nz.length !== 1 || nz[0] !== n - k) homog = false;
          else q.push(py[n - k]);
        }
        if (homog && n >= 2) {
          const fs = factoresUni(q, x, V(x));
          // homogeneizar cada factor: sustituir x por x/y y multiplicar por y^grado
          return fs.map(f => {
            const base = f.t === '^' ? f.b : f, ex = f.t === '^' ? f.e : UNO;
            const pq = polyQDe(base, x);
            if (!pq) return f;
            const g = pq.length - 1;
            const h = mkAdd(pq.map((cf, k) => mkMul([N(cf), mkPow(V(x), num(k)), mkPow(V(y), num(g - k))])));
            return mkPow(h, ex);
          });
        }
      }
    }
    return [p];
  }
  function factoresUni(q, x, vx) {
    const out = [];
    const { raices, resto } = raicesRacionales(q);
    for (const { r, m } of raices) {
      // (q·x − p) con enteros, no (x − p/q): 2x − 1 en vez de x − 1/2.
      const f = mkAdd([mkMul([N(R(r.d)), vx]), N(R(-r.n))]);
      out.push(mkPow(f, num(m)));
    }
    if (resto.length > 1) {
      const pr = pPrimitivo(resto);
      // Si solo tiene potencias pares, se prueba en t = x^2: x^4 − 4 = (x^2 − 2)(x^2 + 2).
      const pares = pr.p.every((c, k) => k % 2 === 0 || rCero(c));
      if (pares && pr.p.length > 3) {
        const t = pr.p.filter((_, k) => k % 2 === 0);
        const sub = factoresUni(t, x, mkPow(vx, DOS));
        out.push(...sub);
      } else out.push(pAExprCon(pr.p, vx));
    }
    return out;
  }
  function pAExprCon(p, vx) { return mkAdd(p.map((c, k) => mkMul([N(c), mkPow(vx, num(k))]))); }

  // ── derivar ───────────────────────────────────────────────────────────────
  function derivar(e, x) {
    if (!depende(e, x)) return CERO;
    gastar(2);
    switch (e.t) {
      case 'v': return UNO;
      case '+': return mkAdd(e.a.map(t => derivar(t, x)));
      case '*': {
        const ts = [];
        for (let i = 0; i < e.a.length; i++) {
          const d = derivar(e.a[i], x);
          if (!esCero(d)) ts.push(mkMul([d, ...e.a.filter((_, j) => j !== i)]));
        }
        return mkAdd(ts);
      }
      case '^': {
        const b = e.b, ex = e.e;
        if (!depende(ex, x)) return mkMul([ex, mkPow(b, mkAdd([ex, MENOS_UNO])), derivar(b, x)]);
        if (!depende(b, x)) return mkMul([e, mkFn('ln', b), derivar(ex, x)]);
        return mkMul([e, mkAdd([mkMul([derivar(ex, x), mkFn('ln', b)]), mkMul([ex, derivar(b, x), mkPow(b, MENOS_UNO)])])]);
      }
      case 'f': {
        const u = e.a;
        if (e.f === 'ln' && u.t === 'f' && u.f === 'abs') return mkMul([derivar(u.a, x), mkPow(u.a, MENOS_UNO)]);
        let g;
        switch (e.f) {
          case 'seno': g = mkFn('coseno', u); break;
          case 'coseno': g = neg(mkFn('seno', u)); break;
          case 'tangente': g = mkPow(mkFn('coseno', u), num(-2)); break;
          case 'arcoseno': g = mkPow(resta(UNO, mkPow(u, DOS)), num(-1, 2)); break;
          case 'arcocoseno': g = neg(mkPow(resta(UNO, mkPow(u, DOS)), num(-1, 2))); break;
          case 'arcotangente': g = mkPow(mkAdd([UNO, mkPow(u, DOS)]), MENOS_UNO); break;
          case 'ln': g = mkPow(u, MENOS_UNO); break;
          case 'exp': g = e; break;
          case 'abs': g = mkMul([u, mkPow(e, MENOS_UNO)]); break;
        }
        return mkMul([g, derivar(u, x)]);
      }
    }
    return CERO;
  }

  // ── integrar ──────────────────────────────────────────────────────────────
  // Por reglas, en este orden: linealidad, tabla con argumento lineal a·x + b,
  // por partes tabular (polinomio · exp/seno/coseno), por partes con logaritmo
  // y arcotangente, fracciones racionales (fracciones parciales con raíces
  // racionales y a lo sumo un factor cuadrático irreducible), expandir, y
  // sustitución u = g(x) cuando el integrando es f(g(x))·g'(x) salvo constante.
  // Si nada de eso sirve, devuelve null y quien llama dice que use «integrar»
  // numérico. No hay algoritmo de Risch: hay integrales elementales que no saca.
  function lineal(u, x) {
    const cs = comoPolinomio(u, x);
    if (!cs || cs.length !== 2 || esCero(cs[1])) return null;
    return { a: cs[1], b: cs[0] };
  }
  function integrar(f, x, prof) {
    prof = prof || 0;
    if (prof > 6) return null;
    gastar(5);
    if (!depende(f, x)) return mkMul([f, V(x)]);
    if (f.t === '+') {
      const out = [];
      for (const t of f.a) { const r = integrar(t, x, prof); if (!r) return null; out.push(r); }
      return mkAdd(out);
    }
    if (f.t === '*') {
      const ctes = f.a.filter(g => !depende(g, x));
      if (ctes.length) {
        const r = integrar(mkMul(f.a.filter(g => depende(g, x))), x, prof);
        return r && mkMul([...ctes, r]);
      }
    }
    let r = tablaIntegrales(f, x) || porPartes(f, x, prof) || racional(f, x);
    if (r) return r;
    const ex = intentar(() => expandir(f));
    if (ex && !igual(ex, f)) { r = integrar(ex, x, prof + 1); if (r) return r; }
    r = sustitucion(f, x, prof);
    if (r) return r;
    const jx = intentar(() => juntarExpr(f));
    if (jx && !igual(jx, f) && !(ex && igual(jx, ex))) { r = integrar(jx, x, prof + 1); if (r) return r; }
    return null;
  }
  function tablaIntegrales(f, x) {
    const X = V(x);
    if (f.t === 'v') return mkMul([MEDIO, mkPow(X, DOS)]);
    if (f.t === '^') {
      if (!depende(f.e, x)) {
        const L = lineal(f.b, x), n = f.e;
        if (L) {
          if (esUno(neg(n))) return div(mkFn('ln', mkFn('abs', f.b)), L.a);
          const n1 = mkAdd([n, UNO]);
          return div(mkPow(f.b, n1), mkMul([L.a, n1]));
        }
        // 1/raiz(c − d·x^2) → arcoseno, 1/raiz(d·x^2 + c) → ln
        if (n.t === 'n' && rIgual(n.q, R(-1, 2))) {
          const q = polyQDe(f.b, x);
          if (q && q.length === 3 && rCero(q[1])) {
            const c = q[0], d = q[2];
            if (d.n < 0n && c.n > 0n) {
              const k = numPow(rDiv(rNeg(d), c), R(1, 2));
              return div(mkFn('arcoseno', mkMul([k, X])), numPow(rNeg(d), R(1, 2)));
            }
            if (d.n > 0n) {
              const rd = numPow(d, R(1, 2));
              return div(mkFn('ln', mkFn('abs', mkAdd([mkMul([rd, X]), mkPow(f.b, MEDIO)]))), rd);
            }
          }
        }
        // 1/coseno^2, 1/seno^2, 1/coseno, 1/seno
        if (n.t === 'n' && (rIgual(n.q, R(-2)) || rIgual(n.q, R(-1))) && f.b.t === 'f' && (f.b.f === 'seno' || f.b.f === 'coseno')) {
          const L2 = lineal(f.b.a, x);
          if (L2) {
            const u = f.b.a;
            if (rIgual(n.q, R(-2))) return f.b.f === 'coseno' ? div(mkFn('tangente', u), L2.a) : div(MENOS_UNO, mkMul([L2.a, mkFn('tangente', u)]));
            if (f.b.f === 'coseno') return div(mkFn('ln', mkFn('abs', div(mkAdd([UNO, mkFn('seno', u)]), mkFn('coseno', u)))), L2.a);
            return div(mkFn('ln', mkFn('abs', mkFn('tangente', mkMul([MEDIO, u])))), L2.a);
          }
        }
        // seno(L)^2 y coseno(L)^2 por el ángulo doble
        if (n.t === 'n' && rIgual(n.q, R(2)) && f.b.t === 'f' && (f.b.f === 'seno' || f.b.f === 'coseno')) {
          const L2 = lineal(f.b.a, x);
          if (L2) {
            const s = div(mkFn('seno', mkMul([DOS, f.b.a])), mkMul([num(4), L2.a]));
            return mkAdd([mkMul([MEDIO, X]), f.b.f === 'seno' ? neg(s) : s]);
          }
        }
      }
      if (!depende(f.b, x)) {
        const L = lineal(f.e, x);
        if (L) return div(f, mkMul([L.a, mkFn('ln', f.b)]));
      }
      return null;
    }
    if (f.t === 'f') {
      const L = lineal(f.a, x);
      if (!L) return null;
      const u = f.a, a = L.a;
      switch (f.f) {
        case 'exp': return div(f, a);
        case 'seno': return div(neg(mkFn('coseno', u)), a);
        case 'coseno': return div(mkFn('seno', u), a);
        case 'tangente': return div(neg(mkFn('ln', mkFn('abs', mkFn('coseno', u)))), a);
        case 'ln': return div(resta(mkMul([u, f]), u), a);
        case 'arcotangente': return div(resta(mkMul([u, f]), mkMul([MEDIO, mkFn('ln', mkAdd([UNO, mkPow(u, DOS)]))])), a);
        case 'arcoseno': return div(mkAdd([mkMul([u, f]), mkPow(resta(UNO, mkPow(u, DOS)), MEDIO)]), a);
        case 'arcocoseno': return div(resta(mkMul([u, f]), mkPow(resta(UNO, mkPow(u, DOS)), MEDIO)), a);
      }
    }
    return null;
  }
  // P(x)·g(L) con P polinomio: tabular para g = exp, seno, coseno, c^L (las que
  // se integran sin fin), y una vez por partes para g = ln, arcotangente,
  // arcoseno (las que se derivan a algo algebraico).
  function porPartes(f, x, prof) {
    const fs = f.t === '*' ? f.a : [f];
    let g = null;
    const pol = [];
    for (const h of fs) {
      // ln(u)^n cuenta como trascendente: se integra por partes bajando n.
      const trasc = h.t === 'f' || (h.t === '^' && depende(h.e, x)) ||
        (h.t === '^' && h.b.t === 'f' && h.b.f === 'ln' && h.e.t === 'n' && rEnt(h.e.q) && h.e.q.n > 0n);
      if (trasc) { if (g) return expTrig(fs, x); g = h; } else pol.push(h);
    }
    if (!g) return expTrig(fs, x);
    const P = mkMul(pol);
    const cs = comoPolinomio(P, x);
    if (!cs) return null;
    const ciclica = (g.t === 'f' && (g.f === 'exp' || g.f === 'seno' || g.f === 'coseno')) || (g.t === '^' && depende(g.e, x));
    if (ciclica) {
      if (!pol.length) return null;
      if (g.t === 'f' && !lineal(g.a, x)) return null;
      if (g.t === '^' && !lineal(g.e, x)) return null;
      const ts = [];
      let d = P, G = g, signo = 1;
      for (let k = 0; k < cs.length; k++) {
        G = integrar(G, x, prof + 1);
        if (!G) return null;
        const t = mkMul([d, G]);
        ts.push(signo > 0 ? t : neg(t));
        d = derivar(d, x);
        signo = -signo;
        if (esCero(d)) break;
      }
      return mkAdd(ts);
    }
    const esLn = g.t === '^' || (g.t === 'f' && g.f === 'ln');
    if (esLn || (g.t === 'f' && (g.f === 'arcotangente' || g.f === 'arcoseno'))) {
      // ∫ P·g = Q·g − ∫ Q·g'. Con P = 1 solo vale la pena si g no es de la
      // tabla (ln(x^2), ln(x)^3…): la tabla ya sabe ln(a·x + b).
      if (!pol.length && g.t === 'f' && lineal(g.a, x)) return null;
      const Q = integrar(P, x, prof + 1);
      if (!Q) return null;
      const resto = integrar(simplificar(mkMul([Q, derivar(g, x)])), x, prof + 1);
      if (!resto) return null;
      return resta(mkMul([Q, g]), resto);
    }
    return null;
  }
  // e^(a·x + c)·seno(b·x + d) y con coseno: la integración por partes da
  // vueltas en círculo, así que se usa la fórmula cerrada de siempre.
  function expTrig(fs, x) {
    const ctes = fs.filter(f => !depende(f, x)), resto = fs.filter(f => depende(f, x));
    if (resto.length !== 2) return null;
    const ex = resto.find(f => f.t === 'f' && f.f === 'exp'), tr = resto.find(f => f.t === 'f' && (f.f === 'seno' || f.f === 'coseno'));
    if (!ex || !tr) return null;
    const L1 = lineal(ex.a, x), L2 = lineal(tr.a, x);
    if (!L1 || !L2) return null;
    const a = L1.a, b = L2.a, den = mkAdd([mkPow(a, DOS), mkPow(b, DOS)]);
    const s = mkFn('seno', tr.a), c = mkFn('coseno', tr.a);
    const dentro = tr.f === 'seno' ? resta(mkMul([a, s]), mkMul([b, c])) : mkAdd([mkMul([a, c]), mkMul([b, s])]);
    return mkMul([...ctes, ex, dentro, mkPow(den, MENOS_UNO)]);
  }
  // Fracciones parciales para P/D de una variable con coeficientes racionales.
  function racional(f, x) {
    const vs = variablesDe(f);
    if (vs.size !== 1 || !vs.has(x) || tieneI(f)) return null;
    const j = intentar(() => juntar(f));
    if (!j || esUno(j.den)) return null;
    const P = polyQDe(j.num, x), D = polyQDe(j.den, x);
    if (!P || !D || D.length < 2) return null;
    const X = V(x);
    const [cociente, r] = pDivMod(P, D);
    const partes = [];
    cociente.forEach((c, k) => { if (!rCero(c)) partes.push(mkMul([N(rDiv(c, R(k + 1))), mkPow(X, num(k + 1))])); });
    if (!r.length) return mkAdd(partes);
    const { raices, resto: L } = raicesRacionales(D);
    if (L.length > 3) return null;          // queda un factor de grado ≥ 3 sin raíces racionales
    const bases = [], tipos = [];
    for (const { r: raiz, m } of raices) {
      for (let k = 1; k <= m; k++) {
        let dk = D;
        for (let i = 0; i < k; i++) dk = pDivMod(dk, [rNeg(raiz), R1])[0];
        bases.push(dk); tipos.push({ raiz, k });
      }
    }
    if (L.length === 3) {
      const dL = pDivMod(D, L)[0];
      bases.push(pMul(dL, [R0, R1])); tipos.push({ cuad: 'B' });
      bases.push(dL); tipos.push({ cuad: 'C' });
    }
    const n = D.length - 1;
    if (bases.length !== n) return null;
    // Sistema: Σ c_j·base_j = r, coeficiente a coeficiente.
    const A = [];
    for (let fila = 0; fila < n; fila++) A.push([...bases.map(b => b[fila] || R0), r[fila] || R0]);
    const sol = gaussRac(A, n);
    if (!sol) return null;
    let B = R0, Cc = R0;
    sol.forEach((c, idx) => {
      const t = tipos[idx];
      if (t.cuad === 'B') { B = c; return; }
      if (t.cuad === 'C') { Cc = c; return; }
      if (rCero(c)) return;
      const lin = mkAdd([X, N(rNeg(t.raiz))]);
      if (t.k === 1) partes.push(mkMul([N(c), mkFn('ln', mkFn('abs', lin))]));
      else partes.push(mkMul([N(rDiv(c, R(1 - t.k))), mkPow(lin, num(1 - t.k))]));
    });
    if (L.length === 3) {
      // (B·x + C)/(p·x^2 + q·x + s) = B/(2p)·(2px + q)/L + (C − Bq/(2p))/L
      const [s, q, p] = L;
      const Lx = pAExpr(L, x);
      const disc = rResta(rMul(q, q), rMul(R(4), rMul(p, s)));
      const k1 = rDiv(B, rMul(R(2), p));
      const k2 = rResta(Cc, rMul(k1, q));
      if (!rCero(k1)) partes.push(mkMul([N(k1), mkFn('ln', disc.n < 0n && p.n > 0n ? Lx : mkFn('abs', Lx))]));
      if (!rCero(k2)) {
        const lin = mkAdd([mkMul([N(rMul(R(2), p)), X]), N(q)]);
        if (disc.n < 0n) {
          const rd = numPow(rNeg(disc), R(1, 2));
          partes.push(mkMul([N(rMul(k2, R(2))), mkPow(rd, MENOS_UNO), mkFn('arcotangente', div(lin, rd))]));
        } else {
          const rd = numPow(disc, R(1, 2));
          partes.push(mkMul([N(k2), mkPow(rd, MENOS_UNO), mkFn('ln', mkFn('abs', div(resta(lin, rd), mkAdd([lin, rd]))))]));
        }
      }
    }
    return mkAdd(partes);
  }
  // Eliminación de Gauss con racionales exactos; null si es singular.
  function gaussRac(A, n) {
    A = A.map(f => f.slice());
    for (let c = 0; c < n; c++) {
      let piv = -1;
      for (let f = c; f < A.length; f++) if (!rCero(A[f][c])) { piv = f; break; }
      if (piv < 0) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      const inv = rDiv(R1, A[c][c]);
      for (let k = c; k <= n; k++) A[c][k] = rMul(A[c][k], inv);
      for (let f = 0; f < A.length; f++) {
        if (f === c || rCero(A[f][c])) continue;
        const m = A[f][c];
        for (let k = c; k <= n; k++) A[f][k] = rResta(A[f][k], rMul(m, A[c][k]));
      }
      gastar(n * n);
    }
    return A.slice(0, n).map(f => f[n]);
  }
  // u = g(x): si f/g'(x), escrito con u, ya no tiene x, se integra en u.
  function sustitucion(f, x, prof) {
    const cands = new Map();
    const recoger = e => {
      if (!depende(e, x) || e.t === 'v') return;
      if (e.t === 'f') { cands.set(clave(e), e); cands.set(clave(e.a), e.a); recoger(e.a); }
      else if (e.t === '^') { cands.set(clave(e), e); cands.set(clave(e.b), e.b); recoger(e.b); recoger(e.e); }
      else if (e.t === '+' || e.t === '*') { if (e !== f) cands.set(clave(e), e); for (const h of e.a) recoger(h); }
    };
    recoger(f);
    let n = 0;
    for (const u of cands.values()) {
      if (u.t === 'v' || ++n > 16) continue;
      if (u.t === '^' && u.b.t === 'v' && u.e.t === 'n' && rIgual(u.e.q, R1)) continue;
      const du = derivar(u, x);
      if (esCero(du)) continue;
      const t = '\u0000t' + prof;
      const T = V(t);
      for (const forma of [() => simplificar(div(f, du)), () => expandir(div(f, du))]) {
        const cociente = intentar(forma);
        if (!cociente) continue;
        const g = intentar(() => reemplazarSub(cociente, clave(u), T));
        if (!g || depende(g, x)) continue;
        const G = integrar(g, t, prof + 1);
        if (G) return sustituirVars(G, new Map([[t, u]]));
      }
    }
    return null;
  }

  // ── evaluar con números de verdad ─────────────────────────────────────────
  // Se compila a clausuras de JavaScript una vez: formulaAFuncion la llama
  // miles de veces dentro de un «mapear» y recorrer el árbol en cada llamada
  // costaría el triple.
  function compilar(e, indice) {
    switch (e.t) {
      case 'n': { const v = rANum(e.q); return () => v; }
      case 'c':
        if (e.n === 'i') throw fallo('la fórmula tiene la unidad imaginaria «i» y su valor no es un número real');
        { const v = e.n === 'pi' ? Math.PI : Math.E; return () => v; }
      case 'v': {
        if (!indice.has(e.n)) throw fallo(`falta el valor de la variable «${e.n}»`);
        const k = indice.get(e.n);
        return vs => vs[k];
      }
      case '+': { const fs = e.a.map(h => compilar(h, indice)); return vs => { let s = 0; for (const f of fs) s += f(vs); return s; }; }
      case '*': { const fs = e.a.map(h => compilar(h, indice)); return vs => { let s = 1; for (const f of fs) s *= f(vs); return s; }; }
      case '^': {
        const b = compilar(e.b, indice), x = compilar(e.e, indice);
        // Exponente racional de denominador impar: la raíz real de un negativo
        // existe ((−8)^(1/3) = −2), y Math.pow daría NaN.
        if (e.e.t === 'n' && e.e.q.d % 2n === 1n && !rEnt(e.e.q)) {
          const ex = rANum(e.e.q), par = e.e.q.n % 2n === 0n;
          return vs => { const v = b(vs); return v >= 0 ? Math.pow(v, ex) : (par ? 1 : -1) * Math.pow(-v, ex); };
        }
        return vs => Math.pow(b(vs), x(vs));
      }
      case 'f': {
        const a = compilar(e.a, indice);
        const F = { seno: Math.sin, coseno: Math.cos, tangente: Math.tan, arcoseno: Math.asin, arcocoseno: Math.acos, arcotangente: Math.atan, ln: Math.log, exp: Math.exp, abs: Math.abs }[e.f];
        return vs => F(a(vs));
      }
    }
  }
  function evaluar(e, valores) {
    const indice = new Map(), vs = [];
    for (const [k, v] of valores) { indice.set(k, vs.length); vs.push(v); }
    return compilar(e, indice)(vs);
  }
  // Valor numérico de una expresión SIN variables, o NaN.
  function valorDe(e) {
    try { return evaluar(e, new Map()); } catch (err) { if (err instanceof ErrorFormula) return NaN; throw err; }
  }
  // Complejo aproximado (para ordenar y verificar raíces con «i»).
  function valorComplejo(e) {
    if (!tieneI(e)) return [valorDe(e), 0];
    const ex = intentar(() => expandir(e));
    if (!ex) return [NaN, NaN];
    let re = 0, im = 0;
    for (const t of terminosDe(ex)) {
      const fs = t.t === '*' ? t.a : [t];
      const conI = fs.some(f => f.t === 'c' && f.n === 'i');
      const v = valorDe(mkMul(fs.filter(f => !(f.t === 'c' && f.n === 'i'))));
      if (conI) im += v; else re += v;
    }
    return [re, im];
  }

  // ── resolver ──────────────────────────────────────────────────────────────
  // Devuelve {exactas: [expr], numericas: [número o texto]}.
  function resolver(E, x, vsOriginales) {
    if (!depende(E, x)) {
      if (vsOriginales && vsOriginales.size && !vsOriginales.has(x)) throw fallo(`la ecuación no tiene la variable «${x}»`, `sus variables son ${[...vsOriginales].sort().map(v => '«' + v + '»').join(', ')}`);
      if (esCeroSimbolico(E)) throw fallo(`la ecuación no depende de «${x}» y se cumple siempre`, 'es una identidad: cualquier valor sirve');
      return { exactas: [], numericas: [] };
    }
    const j = intentar(() => juntar(E)) || { num: E, den: UNO };
    const P = j.num, D = j.den;
    let r = resolverPolinomio(P, x) || resolverPorAtomo(P, x) || resolverAislando(P, x) || resolverNumerico(E, x);
    if (!r) throw fallo(`no sé despejar «${x}» de esta ecuación de forma exacta`, 'si solo tiene esa variable, prueba con valores numéricos o con «raiz» numérico de NEÑ');
    // Fuera las que anulan el denominador: (x^2 − 1)/(x − 1) = 0 no tiene x = 1.
    if (!esUno(D)) r.exactas = r.exactas.filter(s => { const v = intentar(() => simplificar(sustituirVars(D, new Map([[x, s]])))); return !v || !esCero(v); });
    // Sin repetidas y ordenadas por valor (las complejas al final).
    const vistas = new Set();
    r.exactas = r.exactas.map(s => simplificar(s)).filter(s => { const k = clave(s); if (vistas.has(k)) return false; vistas.add(k); return true; });
    r.exactas.sort((a, b) => {
      const [ra, ia] = valorComplejo(a), [rb, ib] = valorComplejo(b);
      const ca = Math.abs(ia) > 1e-12 ? 1 : 0, cb = Math.abs(ib) > 1e-12 ? 1 : 0;
      if (ca !== cb) return ca - cb;
      if (isNaN(ra) || isNaN(rb)) return cmpTxt(clave(a), clave(b));
      return ra - rb || ia - ib;
    });
    return r;
  }
  function resolverPolinomio(P, x) {
    const cs = comoPolinomio(P, x);
    if (!cs || cs.length < 2) return null;
    const q = polyQ(cs);
    if (q) return resolverPolyQ(q, x);
    if (cs.length === 2) return { exactas: [neg(div(cs[0], cs[1]))], numericas: [] };
    if (cs.length === 3) return { exactas: cuadratica(cs[2], cs[1], cs[0]), numericas: [] };
    return null;
  }
  function cuadratica(a, b, c) {
    if (esCero(b)) {
      const r = mkPow(neg(div(c, a)), MEDIO);
      return [r, neg(r)];
    }
    const disc = simplificar(resta(mkPow(b, DOS), mkMul([num(4), a, c])));
    const rd = mkPow(disc, MEDIO);
    const den = mkMul([DOS, a]);
    if (esCero(disc)) return [div(neg(b), den)];
    return [div(mkAdd([neg(b), neg(rd)]), den), div(mkAdd([neg(b), rd]), den)];
  }
  function resolverPolyQ(q, x) {
    const { raices, resto } = raicesRacionales(q);
    const exactas = raices.map(r => N(r.r));
    const numericas = [];
    const g = resto.length - 1;
    if (g === 1) exactas.push(N(rDiv(rNeg(resto[0]), resto[1])));
    else if (g === 2) exactas.push(...cuadratica(N(resto[2]), N(resto[1]), N(resto[0])));
    else if (g > 2 && resto.slice(1, g).every(rCero)) {
      // x^n = c: la raíz real exacta y, para n = 3 y n = 4, también las
      // complejas exactas; para n mayor, las complejas van aproximadas.
      const c = rDiv(rNeg(resto[0]), resto[g]);
      const r = numPow(rAbs(c), R(1, g));
      const raicesExactas = [];
      if (g % 2 === 1) raicesExactas.push(c.n < 0n ? neg(r) : r);
      else if (c.n > 0n) raicesExactas.push(r, neg(r));
      if (g === 3) {
        const real = c.n < 0n ? neg(r) : r;
        const w = mkAdd([num(-1, 2), mkMul([MEDIO, numPow(R(3), R(1, 2)), I])]);
        raicesExactas.push(simplificar(expandir(mkMul([real, w]))), simplificar(expandir(mkMul([real, conjugar(w)]))));
      } else if (g === 4) {
        if (c.n > 0n) raicesExactas.push(mkMul([r, I]), neg(mkMul([r, I])));
        else { const w = mkMul([numPow(R(2), R(1, 2)), MEDIO]); for (const s1 of [1, -1]) for (const s2 of [1, -1]) raicesExactas.push(mkMul([r, mkAdd([mkMul([N(R(s1)), w]), mkMul([N(R(s2)), w, I])])])); }
      } else {
        for (const [re, im] of raicesNumericas(resto.map(rANum))) if (Math.abs(im) > 1e-9 * Math.max(1, Math.abs(re))) numericas.push({ re, im });
      }
      exactas.push(...raicesExactas);
    } else if (g === 4 && rCero(resto[1]) && rCero(resto[3])) {
      // bicuadrada: t = x^2
      for (const t of cuadratica(N(resto[4]), N(resto[2]), N(resto[0]))) {
        const r = mkPow(t, MEDIO);
        exactas.push(r, neg(r));
      }
    } else if (g > 2) {
      for (const [re, im] of raicesNumericas(resto.map(rANum))) {
        if (Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re))) numericas.push(re);
        else numericas.push({ re, im });
      }
    }
    return { exactas, numericas };
  }
  const conjugar = e => reconstruirConI(e);
  function reconstruirConI(e) {
    switch (e.t) {
      case 'c': return e.n === 'i' ? neg(I) : e;
      case '+': return mkAdd(e.a.map(reconstruirConI));
      case '*': return mkMul(e.a.map(reconstruirConI));
      case '^': return mkPow(reconstruirConI(e.b), reconstruirConI(e.e));
      case 'f': return mkFn(e.f, reconstruirConI(e.a));
      default: return e;
    }
  }
  // Durand–Kerner: todas las raíces complejas a la vez, sin necesidad de
  // buenos puntos de partida. Después un pulido de Newton con el polinomio
  // original para recuperar los dígitos que se pierden al iterar en conjunto.
  function raicesNumericas(c) {
    const n = c.length - 1;
    const a = c.map(v => v / c[n]);
    const ev = (re, im) => {
      let sr = 0, si = 0;
      for (let k = n; k >= 0; k--) { const tr = sr * re - si * im + a[k], ti = sr * im + si * re; sr = tr; si = ti; }
      return [sr, si];
    };
    const z = [];
    // Puntos de partida en un círculo de radio la cota de Cauchy (todas las
    // raíces están dentro), girado para no empezar simétrico respecto al eje
    // real: con coeficientes reales, la simetría haría que nunca se separaran.
    const radio = 1 + Math.max(...a.slice(0, n).map(Math.abs));
    for (let k = 0; k < n; k++) z.push([radio * Math.cos(2 * Math.PI * k / n + 0.4), radio * Math.sin(2 * Math.PI * k / n + 0.4)]);
    for (let it = 0; it < 2000; it++) {
      let cambio = 0;
      for (let i = 0; i < n; i++) {
        let [nr, ni] = ev(z[i][0], z[i][1]);
        let dr = 1, di = 0;
        for (let j = 0; j < n; j++) if (j !== i) { const er = z[i][0] - z[j][0], ei = z[i][1] - z[j][1]; const tr = dr * er - di * ei; di = dr * ei + di * er; dr = tr; }
        const m = dr * dr + di * di || 1e-300;
        const qr = (nr * dr + ni * di) / m, qi = (ni * dr - nr * di) / m;
        z[i][0] -= qr; z[i][1] -= qi;
        cambio = Math.max(cambio, Math.hypot(qr, qi));
      }
      gastar(n * n);
      if (cambio < 1e-15) break;
    }
    return z.map(([re, im]) => [Math.abs(re) < 1e-14 ? 0 : re, Math.abs(im) < 1e-14 ? 0 : im]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }
  // Polinomio en UNA subexpresión: seno(x)^2 − 1/4 = 0 es cuadrática en seno(x).
  function resolverPorAtomo(P, x) {
    // e^(2x) y e^x son la misma incógnita T = e^x: se reescribe e^(k·w) como
    // T^k antes de buscar el átomo.
    const exps = [];
    const buscarExp = e => {
      if (e.t === 'f' && e.f === 'exp' && depende(e.a, x)) { exps.push(e); return; }
      if (e.t === '+' || e.t === '*') e.a.forEach(buscarExp);
      else if (e.t === '^') { buscarExp(e.b); buscarExp(e.e); }
      else if (e.t === 'f') buscarExp(e.a);
    };
    buscarExp(P);
    if (exps.length > 1) {
      const partes = exps.map(e => partirCoef(e.a));
      const w = partes[0][1];
      if (partes.every(([k, r]) => rEnt(k) && igual(r, w))) {
        let g = 0n;
        for (const [k] of partes) g = bMcd(g, k.n);
        const base = mkFn('exp', mkMul([N(R(g)), w]));
        const T = V('\u0000T');
        let Q = P;
        exps.forEach((e, i) => { Q = reemplazarSub(Q, clave(e), mkPow(T, N(R(partes[i][0].n / g)))); });
        if (!depende(Q, x)) {
          const sub = resolverPolinomio(Q, T.n);
          if (sub) {
            const exactas = [];
            for (const v of sub.exactas) { const r = intentar(() => aislar(resta(base, v), x)); if (r) exactas.push(...r); }
            return { exactas, numericas: [] };
          }
        }
      }
    }
    const atomos = new Map();
    const recoger = e => {
      if (!depende(e, x)) return;
      if (e.t === 'f' || (e.t === '^' && (depende(e.e, x) || !(e.e.t === 'n' && rEnt(e.e.q))))) { atomos.set(clave(e), e); return; }
      if (e.t === '^') return recoger(e.b);
      if (e.t === '+' || e.t === '*') for (const h of e.a) recoger(h);
    };
    recoger(P);
    if (atomos.size !== 1) return null;
    const A = [...atomos.values()][0];
    const t = '\u0000u';
    const Q = reemplazarSub(P, clave(A), V(t));
    if (depende(Q, x)) return null;
    const cs = comoPolinomio(Q, t);
    if (!cs || cs.length < 3) return null;        // lineal en el átomo: mejor aislar
    const sub = resolverPolinomio(Q, t);
    if (!sub) return null;
    const exactas = [];
    for (const v of sub.exactas) {
      const r = intentar(() => aislar(resta(A, v), x));
      if (r) exactas.push(...r);
    }
    return { exactas, numericas: [] };
  }
  function cuentaApariciones(e, x) {
    switch (e.t) {
      case 'v': return e.n === x ? 1 : 0;
      case '+': case '*': return e.a.reduce((s, h) => s + cuentaApariciones(h, x), 0);
      case '^': return cuentaApariciones(e.b, x) + cuentaApariciones(e.e, x);
      case 'f': return cuentaApariciones(e.a, x);
      default: return 0;
    }
  }
  function resolverAislando(P, x) {
    if (cuentaApariciones(P, x) !== 1) return null;
    const r = intentar(() => aislar(P, x));
    if (!r) return null;
    return { exactas: r, numericas: [] };
  }
  // lhs = 0 con x en un solo sitio: se deshacen las operaciones de fuera
  // hacia dentro. Las funciones periódicas dan solo los valores principales
  // (sin el «+ 2kπ»), y se descartan las que no cumplen la ecuación original
  // cuando se puede comprobar con números.
  function aislar(P, x) {
    const sols = [];
    const paso = (lhs, rhs, prof) => {
      if (prof > 40) return;
      if (lhs.t === 'v' && lhs.n === x) { sols.push(rhs); return; }
      switch (lhs.t) {
        case '+': {
          const con = lhs.a.filter(t => depende(t, x)), sin = lhs.a.filter(t => !depende(t, x));
          if (con.length !== 1) return;
          return paso(con[0], resta(rhs, mkAdd(sin)), prof + 1);
        }
        case '*': {
          const con = lhs.a.filter(t => depende(t, x)), sin = lhs.a.filter(t => !depende(t, x));
          if (con.length !== 1) return;
          return paso(con[0], div(rhs, mkMul(sin)), prof + 1);
        }
        case '^': {
          if (depende(lhs.b, x) && !depende(lhs.e, x)) {
            if (lhs.e.t === 'n' && rEnt(lhs.e.q) && lhs.e.q.n % 2n === 0n) {
              const r = mkPow(rhs, mkPow(lhs.e, MENOS_UNO));
              paso(lhs.b, r, prof + 1);
              paso(lhs.b, neg(r), prof + 1);
              return;
            }
            return paso(lhs.b, mkPow(rhs, mkPow(lhs.e, MENOS_UNO)), prof + 1);
          }
          if (!depende(lhs.b, x)) return paso(lhs.e, div(mkFn('ln', rhs), mkFn('ln', lhs.b)), prof + 1);
          return;
        }
        case 'f': {
          const u = lhs.a, sig = r => { const v = intentar(() => r()); if (v) paso(u, v, prof + 1); };
          switch (lhs.f) {
            case 'seno': sig(() => mkFn('arcoseno', rhs)); sig(() => resta(PI, mkFn('arcoseno', rhs))); return;
            case 'coseno': sig(() => mkFn('arcocoseno', rhs)); sig(() => neg(mkFn('arcocoseno', rhs))); return;
            case 'tangente': sig(() => mkFn('arcotangente', rhs)); return;
            case 'arcoseno': sig(() => mkFn('seno', rhs)); return;
            case 'arcocoseno': sig(() => mkFn('coseno', rhs)); return;
            case 'arcotangente': sig(() => mkFn('tangente', rhs)); return;
            case 'ln': sig(() => mkFn('exp', rhs)); return;
            case 'exp': sig(() => mkFn('ln', rhs)); return;
            case 'abs': sig(() => rhs); sig(() => neg(rhs)); return;
          }
        }
      }
    };
    paso(P, CERO, 0);
    // Comprobación numérica cuando no hay otras variables: elevar al cuadrado
    // y el valor absoluto meten soluciones falsas.
    const soloX = [...variablesDe(P)].every(v => v === x);
    return sols.filter(s => {
      if (!soloX || variablesDe(s).size) return true;
      const v = valorDe(s);
      if (!isFinite(v)) return tieneI(s);
      const r = evaluar(P, new Map([[x, v]]));
      return isFinite(r) && Math.abs(r) <= 1e-9 * (1 + Math.abs(v));
    });
  }
  // Último recurso: raíces reales en [−100, 100] por cambio de signo y
  // bisección. Solo encuentra las que cruzan el eje (no x^2 = 0 tocando) y se
  // descartan los «cruces» que en realidad son polos (tangente, 1/x).
  function resolverNumerico(E, x) {
    const vs = variablesDe(E);
    if (vs.size !== 1) return null;
    const f = compilar(E, new Map([[x, 0]]));
    const F = v => f([v]);
    const raices = [];
    const n = 20000, a = -100, b = 100, h = (b - a) / n;
    let x0 = a, f0 = F(x0);
    for (let k = 1; k <= n; k++) {
      const x1 = a + k * h, f1 = F(x1);
      if (f0 === 0) raices.push(x0);
      else if (isFinite(f0) && isFinite(f1) && f0 * f1 < 0) {
        let lo = x0, hi = x1, flo = f0;
        for (let it = 0; it < 200; it++) {
          const m = (lo + hi) / 2, fm = F(m);
          if (fm === 0 || hi - lo < 1e-15 * Math.max(1, Math.abs(m))) { lo = hi = m; break; }
          if (flo * fm < 0) hi = m; else { lo = m; flo = fm; }
        }
        const r = (lo + hi) / 2, fr = Math.abs(F(r));
        if (fr < 1e-8 * (1 + Math.abs(f0) + Math.abs(f1))) raices.push(r);
      }
      x0 = x1; f0 = f1;
    }
    gastar(n);
    const out = [];
    for (const r of raices) if (!out.length || Math.abs(out[out.length - 1] - r) > 1e-9) out.push(r);
    return { exactas: [], numericas: out };
  }

  // ── sistemas lineales ─────────────────────────────────────────────────────
  // Eliminación de Gauss–Jordan con COEFICIENTES SIMBÓLICOS: cada operación
  // pasa por «simplificar», que reconoce el cero. Con números es aritmética
  // racional exacta; con letras (a·x + b·y = c) también funciona.
  function sistema(ecs, incs) {
    const n = incs.length;
    const filas = ecs.map(E => {
      const cs = [];
      let resto = E;
      for (const v of incs) {
        const p = comoPolinomio(E, v);
        if (!p || p.length > 2) throw fallo('el sistema no es lineal en las incógnitas', 'resolverSistemaFormulas solo resuelve sistemas lineales; para uno no lineal despeja una variable y sustituye');
        const c = p.length === 2 ? p[1] : CERO;
        if (incs.some(w => depende(c, w))) throw fallo('el sistema no es lineal: hay productos entre incógnitas');
        cs.push(c);
      }
      for (const v of incs) resto = sustituirVars(resto, new Map([[v, CERO]]));
      cs.push(simplificar(neg(resto)));
      return cs;
    });
    let fila = 0;
    const pivotes = [];
    for (let c = 0; c < n && fila < filas.length; c++) {
      let piv = -1;
      for (let f = fila; f < filas.length; f++) { const v = simplificar(filas[f][c]); filas[f][c] = v; if (!esCero(v)) { piv = f; if (esNum(v)) break; } }
      if (piv < 0) continue;
      [filas[fila], filas[piv]] = [filas[piv], filas[fila]];
      const p = filas[fila][c];
      for (let k = c; k <= n; k++) filas[fila][k] = simplificar(div(filas[fila][k], p));
      for (let f = 0; f < filas.length; f++) {
        if (f === fila) continue;
        const m = simplificar(filas[f][c]);
        if (esCero(m)) continue;
        for (let k = c; k <= n; k++) filas[f][k] = simplificar(resta(filas[f][k], mkMul([m, filas[fila][k]])));
      }
      pivotes.push(c);
      fila++;
    }
    for (let f = fila; f < filas.length; f++)
      if (!esCero(simplificar(filas[f][n]))) throw fallo('el sistema es incompatible: no tiene solución', 'hay ecuaciones que se contradicen');
    if (pivotes.length < n) {
      const libres = incs.filter((_, i) => !pivotes.includes(i));
      throw fallo(`el sistema es indeterminado: tiene infinitas soluciones (${libres.map(v => '«' + v + '»').join(', ')} queda${libres.length > 1 ? 'n' : ''} libre${libres.length > 1 ? 's' : ''})`, 'faltan ecuaciones independientes');
    }
    const sol = new Map();
    pivotes.forEach((c, f) => sol.set(incs[c], simplificar(filas[f][n])));
    return sol;
  }

  // ── Taylor y límites ──────────────────────────────────────────────────────
  function taylor(e, x, a, n) {
    const X = V(x);
    const terminos = [];
    let d = e, fact = R1;
    for (let k = 0; k <= n; k++) {
      if (k > 0) { d = simplificar(derivar(d, x)); fact = rMul(fact, R(k)); }
      let v;
      try { v = simplificar(sustituirVars(d, new Map([[x, a]]))); }
      catch (err) {
        if (err instanceof ErrorFormula && err.tipo === 'indefinido') throw fallo(`la ${k === 0 ? 'función' : 'derivada ' + k} no está definida en ${x} = ${imprimir(a)}`, 'el desarrollo de Taylor necesita que la función sea derivable en ese punto');
        throw err;
      }
      if (esCero(v)) continue;
      const pot = esCero(a) ? mkPow(X, num(k)) : mkPow(resta(X, a), num(k));
      terminos.push(mkMul([v, N(rDiv(R1, fact)), pot]));
    }
    return terminos;
  }
  // Une términos en orden de grado ascendente, como se escribe una serie.
  function unirAscendente(ts, est) {
    if (!ts.length) return '0';
    let s = imprimir(ts[0], est);
    for (let i = 1; i < ts.length; i++) {
      const t = ts[i];
      if (esNegativo(t)) s += ` ${(est || ESTILO_TEXTO).menos} ` + par(...pr(neg(t), est || ESTILO_TEXTO), 2);
      else s += ' + ' + pr(t, est || ESTILO_TEXTO)[0];
    }
    return s;
  }
  // Límite por sustitución directa, simplificando la fracción y, si queda 0/0,
  // L'Hôpital simbólico (hasta 10 veces). En el infinito solo para funciones
  // racionales, comparando grados.
  const INF = { t: 'inf', s: 1 }, MINF = { t: 'inf', s: -1 };
  function limite(e, x, a) {
    if (a.t === 'inf') return limiteInfinito(e, x, a.s);
    const sub = expr => simplificar(sustituirVars(expr, new Map([[x, a]])));
    const directo = intentarIndef(() => sub(e));
    if (directo) return directo;
    // «null» al sustituir es una división entre cero o un logaritmo de cero:
    // un infinito, a efectos de decidir la forma indeterminada.
    let { num: n, den: d } = intentar(() => juntar(e)) || partirFraccion(e);
    // 0·∞ dentro del numerador: u·v con u → 0 y v → ∞ se reescribe v/(1/u),
    // que es ∞/∞ y ya sirve para L'Hôpital (x·ln(x) = ln(x)/(1/x)).
    if (n.t === '*') {
      const malos = n.a.filter(f => !intentarIndef(() => sub(f)));
      const buenos = n.a.filter(f => !malos.includes(f));
      if (malos.length && buenos.some(f => esCero(sub(f)))) { n = mkMul(malos); d = mkMul([d, mkPow(mkMul(buenos), MENOS_UNO)]); }
    }
    for (let k = 0; k < 12; k++) {
      const vn = intentarIndef(() => sub(n)), vd = intentarIndef(() => sub(d));
      if (vn && vd && !esCero(vd)) return simplificar(div(vn, vd));
      if (vn && !vd) return CERO;                                   // finito / ∞
      if ((vn && !esCero(vn) && vd && esCero(vd)) || (!vn && vd)) return divergente(e, x, a);
      // 0/0 o ∞/∞: L'Hôpital, y el cociente nuevo se vuelve a juntar para que
      // se cancele lo que se pueda antes de la vuelta siguiente.
      const r = simplificar(div(derivar(n, x), derivar(d, x)));
      const v = intentarIndef(() => sub(r));
      if (v) return v;
      ({ num: n, den: d } = intentar(() => juntar(r)) || partirFraccion(r));
    }
    throw fallo('no sé calcular este límite de forma exacta (L\'Hôpital no lo resolvió en 12 pasos)', 'prueba acercándote con evaluarFormula');
  }
  function partirFraccion(e) {
    const fs = e.t === '*' ? e.a : [e];
    const arriba = [], abajo = [];
    for (const f of fs) if (f.t === '^' && f.e.t === 'n' && f.e.q.n < 0n) abajo.push(mkPow(f.b, N(rNeg(f.e.q)))); else arriba.push(f);
    return { num: mkMul(arriba), den: mkMul(abajo) };
  }
  function intentarIndef(fn) {
    try { return fn(); }
    catch (e) { if (e instanceof ErrorFormula && e.tipo === 'indefinido') return null; throw e; }
  }
  function divergente(e, x, a) {
    const av = valorDe(a);
    const f = compilar(e, new Map([[x, 0]]));
    const h = 1e-7 * Math.max(1, Math.abs(av));
    const izq = f([av - h]), der = f([av + h]);
    if (!isFinite(av) || isNaN(izq) || isNaN(der)) throw fallo('no sé calcular este límite de forma exacta', 'prueba acercándote con evaluarFormula');
    if (izq > 0 && der > 0) return INF;
    if (izq < 0 && der < 0) return MINF;
    throw fallo(`el límite no existe: por la izquierda tiende a ${izq > 0 ? '+' : '-'}infinito y por la derecha a ${der > 0 ? '+' : '-'}infinito`);
  }
  function limiteInfinito(e, x, s) {
    const j = intentar(() => juntar(e));
    const P = j && polyQDe(j.num, x), D = j && polyQDe(j.den, x);
    if (!P || !D) throw fallo('en el infinito solo sé calcular límites de funciones racionales (cociente de polinomios)', 'prueba con evaluarFormula en valores grandes');
    if (!P.length) return CERO;
    const gp = P.length - 1, gd = D.length - 1;
    if (gp < gd) return CERO;
    const r = rDiv(P[gp], D[gd]);
    if (gp === gd) return N(r);
    const signo = (r.n > 0n ? 1 : -1) * (s < 0 && (gp - gd) % 2 === 1 ? -1 : 1);
    return signo > 0 ? INF : MINF;
  }

  return {
    ErrorFormula, R, N, V, deNumero, rANum, leer, leerExpr, leerEcuacion, exigirVariable,
    variablesEscritas, imprimir, latex, ESTILO_BONITO, ESTILO_TEXTO, simplificar, expandir, factorizar, derivar, integrar,
    resolver, sistema, evaluar, compilar, sustituirVars, variablesDe, depende, taylor, unirAscendente,
    limite, INF, MINF, clave, igual, tieneI, valorDe, esCero, mkAdd, mkMul, resta, juntarExpr,
    setGastar: g => { gastar = g; },
  };
})();

// ============================================================================
//  El instalador: traduce entre Ñ y el núcleo.
// ============================================================================
function instalarNenFormulas(vm, def) {
  const K = nucleoNenFormulas;
  const L = items => vm.nuevaLista(items);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  // Cada función pasa por aquí: el costo va al presupuesto de la VM y los
  // errores del núcleo salen como errores de Ñ, con el nombre de quien falló.
  const envolver = (nombre, fn) => a => {
    K.setGastar(n => vm.cobrar(n));
    try { return fn(a); }
    catch (e) {
      if (e instanceof K.ErrorFormula) vm.error(`«${nombre}»: ${e.message}`, e.sug);
      if (typeof ErrorTiempoEjecucion !== 'undefined' && e instanceof ErrorTiempoEjecucion) throw e;
      if (e instanceof RangeError) vm.error(`«${nombre}»: la fórmula es demasiado grande o está demasiado anidada`, 'pártela en trozos más pequeños');
      vm.error(`«${nombre}»: fallo interno del resolucionador de fórmulas`, `es un error de NEÑ, no tuyo; avísalo con la fórmula que lo produjo (${e && e.message})`);
    }
  };
  const d = (nombre, firma, fn, doc) => def(nombre, firma, envolver(nombre, fn), doc);
  const variable = (v, n, f) => K.exigirVariable(txt(v, n, f));
  const salida = e => K.imprimir(e);
  // Un punto puede venir como número de Ñ o como texto de fórmula («pi/2»).
  const punto = (v, n, f) => {
    if (typeof v === 'number') return K.N(K.deNumero(v));
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'infinito' || s === '+infinito' || s === '∞' || s === '+∞') return K.INF;
      if (s === '-infinito' || s === '-∞' || s === '−infinito' || s === '−∞') return K.MINF;
      return K.leerExpr(v);
    }
    vm.error(`«${f}»: el argumento ${n} debe ser un número o una fórmula en texto y es ${tipoDe(v)}`);
  };
  const listaTextos = (v, n, f) => {
    const l = vm.exigeLista(v, n, f);
    return l.items.map((x, i) => { if (typeof x !== 'string') vm.error(`«${f}»: el elemento ${i} de la lista ${n} debe ser texto`); return x; });
  };
  const valoresDe = (v, n, f) => {
    if (!(v instanceof ObjDic)) vm.error(`«${f}»: el argumento ${n} debe ser un diccionario {"x": valor} y es ${tipoDe(v)}`);
    return v.mapa;
  };

  d('simplificarFormula', 'texto -> texto', a => salida(K.simplificar(K.leerExpr(txt(a[0], 1, 'simplificarFormula')))),
    'simplificarFormula("2x + 3x - x^2/x") → "4x" · fracciones exactas, términos semejantes, potencias de la misma base y fracciones algebraicas; se queda con la forma más corta');
  d('expandirFormula', 'texto -> texto', a => salida(K.expandir(K.leerExpr(txt(a[0], 1, 'expandirFormula')))),
    'expandirFormula("(x + 1)^2") → "x^2 + 2x + 1" · reparte productos y potencias enteras de sumas');
  d('factorizarFormula', 'texto -> texto', a => salida(K.factorizar(K.leerExpr(txt(a[0], 1, 'factorizarFormula')))),
    'factorizarFormula("x^2 - 5x + 6") → "(x - 3)*(x - 2)" · factor común y raíces racionales; lo que no se puede, queda expandido');
  d('derivarFormula', '... -> texto', a => {
    if (a.length < 2 || a.length > 3) vm.error('«derivarFormula» lleva 2 o 3 argumentos: (fórmula, "x") o (fórmula, "x", n)');
    let e = K.leerExpr(txt(a[0], 1, 'derivarFormula'));
    const x = variable(a[1], 2, 'derivarFormula');
    const n = a.length > 2 ? vm.exigeEnt(a[2], 3, 'derivarFormula') : 1;
    if (n < 0) vm.error('«derivarFormula»: el orden de la derivada no puede ser negativo');
    for (let k = 0; k < n; k++) e = K.simplificar(K.derivar(e, x));
    return salida(e);
  }, 'derivarFormula("x^3 + seno(x)", "x") → "3x^2 + coseno(x)" · con un tercer argumento n, la derivada n-ésima; con otras letras, la parcial');
  d('gradienteFormula', 'texto, lista<texto> -> lista<texto>', a => {
    const e = K.leerExpr(txt(a[0], 1, 'gradienteFormula'));
    return L(listaTextos(a[1], 2, 'gradienteFormula').map(v => salida(K.simplificar(K.derivar(e, K.exigirVariable(v))))));
  }, 'gradienteFormula("x^2 y", ["x", "y"]) → ["2x*y", "x^2"] · las derivadas parciales, una por variable');
  d('integrarFormula', '... -> texto', a => {
    if (a.length !== 2 && a.length !== 4) vm.error('«integrarFormula» lleva 2 argumentos (fórmula, "x") o 4 (fórmula, "x", desde, hasta)');
    const f = K.leerExpr(txt(a[0], 1, 'integrarFormula'));
    const x = variable(a[1], 2, 'integrarFormula');
    const F = K.integrar(K.simplificar(f), x) || K.integrar(f, x);
    if (!F) vm.error(`«integrarFormula»: no sé integrar «${txt(a[0], 1, 'integrarFormula')}» de forma simbólica`,
      'no toda función tiene primitiva elemental; para el valor de una integral definida usa «integrar» numérico de NEÑ');
    if (a.length === 2) return salida(K.simplificar(F));
    const lo = punto(a[2], 3, 'integrarFormula'), hi = punto(a[3], 4, 'integrarFormula');
    if (lo.t === 'inf' || hi.t === 'inf') vm.error('«integrarFormula»: los límites tienen que ser finitos', 'una integral impropia se calcula con limiteFormula sobre la primitiva');
    // Si el integrando no es finito en algún punto del intervalo, la regla de
    // Barrow daría un número falso (∫ de −1 a 1 de 1/x no es 0).
    const vlo = K.valorDe(lo), vhi = K.valorDe(hi);
    if (K.variablesDe(f).size === 1 && isFinite(vlo) && isFinite(vhi)) {
      const g = K.compilar(f, new Map([[x, 0]]));
      for (let k = 0; k <= 2000; k++) {
        const t = vlo + (vhi - vlo) * k / 2000;
        if (!isFinite(g([t]))) vm.error(`«integrarFormula»: la función no es finita cerca de ${x} = ${t}, dentro del intervalo`, 'la integral es impropia; estúdiala con limiteFormula');
      }
    }
    const val = (p) => K.simplificar(K.sustituirVars(F, new Map([[x, p]])));
    return salida(K.simplificar(K.resta(val(hi), val(lo))));
  }, 'integrarFormula("3x^2", "x") → "x^3" (sin la constante) · integrarFormula(f, "x", desde, hasta) da el valor exacto por la regla de Barrow');
  // Las soluciones exactas salen como texto; las aproximadas, como número real
  // (o como texto «a + b*i» con decimales si son complejas aproximadas).
  const solucionesALista = r => {
    const out = r.exactas.map(salida);
    for (const v of r.numericas) if (typeof v === 'number') out.push(v);
    for (const v of r.numericas) if (typeof v !== 'number') out.push(`${v.re} ${v.im < 0 ? '-' : '+'} ${Math.abs(v.im)}*i`);
    return L(out);
  };
  d('resolverFormula', 'texto, texto -> lista', a => {
    const src = txt(a[0], 1, 'resolverFormula');
    return solucionesALista(K.resolver(K.leerEcuacion(src), variable(a[1], 2, 'resolverFormula'), K.variablesEscritas(src)));
  }, 'resolverFormula("x^2 - 5x + 6 = 0", "x") → ["2", "3"] · exactas como texto (radicales y complejas incluidas); las solo numéricas, como real');
  d('despejar', 'texto, texto -> texto', a => {
    const src = txt(a[0], 1, 'despejar');
    const y = variable(a[1], 2, 'despejar');
    const r = K.resolver(K.leerEcuacion(src), y, K.variablesEscritas(src));
    if (r.numericas.length || !r.exactas.length) vm.error(`«despejar»: no pude despejar «${y}» de forma exacta`, 'prueba con resolverFormula, que también da soluciones numéricas');
    if (r.exactas.length === 1) return `${y} = ${salida(r.exactas[0])}`;
    if (r.exactas.length === 2 && K.igual(K.simplificar(K.mkAdd(r.exactas)), K.N(K.R(0)))) {
      const pos = r.exactas.find(s => !salida(s).startsWith('-')) || r.exactas[1];
      return `${y} = ±${/^[A-Za-z0-9_]+(\(.*\))?$/.test(salida(pos)) ? salida(pos) : '(' + salida(pos) + ')'}`;
    }
    return r.exactas.map(s => `${y} = ${salida(s)}`).join('  o  ');
  }, 'despejar("2y + x = 4", "y") → "y = -x/2 + 2" · si hay dos con signo opuesto escribe «±», si hay varias las une con «o»');
  d('resolverSistemaFormulas', 'lista<texto>, lista<texto> -> dic<texto,texto>', a => {
    const ecs = listaTextos(a[0], 1, 'resolverSistemaFormulas').map(K.leerEcuacion);
    const incs = listaTextos(a[1], 2, 'resolverSistemaFormulas').map(K.exigirVariable);
    if (!ecs.length) vm.error('«resolverSistemaFormulas»: la lista de ecuaciones está vacía');
    if (!incs.length) vm.error('«resolverSistemaFormulas»: la lista de incógnitas está vacía');
    const sol = K.sistema(ecs, incs);
    const dic = vm.nuevoDic();
    for (const v of incs) dic.mapa.set(v, salida(sol.get(v)));
    return dic;
  }, 'resolverSistemaFormulas(["x + y = 3", "x - y = 1"], ["x", "y"]) → {"x": "2", "y": "1"} · exacto, también con coeficientes con letras');
  d('evaluarFormula', '... -> real', a => {
    if (a.length < 1 || a.length > 2) vm.error('«evaluarFormula» lleva la fórmula y, si tiene variables, un diccionario con sus valores');
    const e = K.leerExpr(txt(a[0], 1, 'evaluarFormula'));
    const vals = new Map();
    if (a.length > 1) for (const [k, v] of valoresDe(a[1], 2, 'evaluarFormula')) vals.set(k, vm.exigeNum(v, 2, 'evaluarFormula'));
    const r = K.evaluar(e, vals);
    if (isNaN(r)) vm.error('«evaluarFormula»: el resultado no es un número real', 'suele ser la raíz de un negativo, el logaritmo de algo no positivo o un arcoseno fuera de [-1, 1]');
    return r;
  }, 'evaluarFormula("x^2 + y", {"x": 2, "y": 3}) → 7 · con números de coma flotante, no exacto');
  d('sustituirEnFormula', 'texto, dic -> texto', a => {
    const e = K.leerExpr(txt(a[0], 1, 'sustituirEnFormula'));
    const m = new Map();
    for (const [k, v] of valoresDe(a[1], 2, 'sustituirEnFormula')) {
      if (typeof v === 'number') m.set(K.exigirVariable(k), K.N(K.deNumero(v)));
      else if (typeof v === 'string') m.set(K.exigirVariable(k), K.leerExpr(v));
      else vm.error(`«sustituirEnFormula»: el valor de «${k}» debe ser un número o una fórmula en texto`);
    }
    return salida(K.simplificar(K.sustituirVars(e, m)));
  }, 'sustituirEnFormula("x^2 + 1", {"x": "y + 1"}) → "(y + 1)^2 + 1" · los valores pueden ser números (exactos) o fórmulas');
  d('variablesDeFormula', 'texto -> lista<texto>', a => {
    const r = K.leer(txt(a[0], 1, 'variablesDeFormula'));
    const s = new Set(K.variablesDe(r.izq));
    if (r.der) for (const v of K.variablesDe(r.der)) s.add(v);
    return L([...s].sort());
  }, 'variablesDeFormula("a x^2 + b x + c") → ["a", "b", "c", "x"] · ordenadas; pi, e e i son constantes y no cuentan');
  d('formulaAFuncion', '... -> funcion', a => {
    if (a.length < 1 || a.length > 2) vm.error('«formulaAFuncion» lleva la fórmula y, opcionalmente, la lista de variables en orden');
    const src = txt(a[0], 1, 'formulaAFuncion');
    const e = K.leerExpr(src);
    const vars = a.length > 1 ? listaTextos(a[1], 2, 'formulaAFuncion').map(K.exigirVariable) : [...K.variablesDe(e)].sort();
    for (const v of K.variablesDe(e)) if (!vars.includes(v))
      vm.error(`«formulaAFuncion»: la fórmula usa «${v}» y no está en la lista de variables`, `añádela: [${[...vars, v].map(x => '"' + x + '"').join(', ')}]`);
    const indice = new Map(vars.map((v, i) => [v, i]));
    const fn = K.compilar(e, indice);
    const nombre = `formula(${vars.join(', ')})`;
    return new ObjNativa(nombre, vars.length, args => {
      const vs = new Array(args.length);
      for (let i = 0; i < args.length; i++) vs[i] = vm.exigeNum(args[i], i + 1, nombre);
      const r = fn(vs);
      if (isNaN(r)) vm.error(`«${src}» no da un número real en (${vs.join(', ')})`, 'raíz de un negativo, logaritmo de algo no positivo o arcoseno fuera de [-1, 1]');
      return r;
    }, `${src} como función de ${vars.join(', ') || 'nada'}`);
  }, 'formulaAFuncion("x^2 + 1", ["x"]) → una función de Ñ: g(3) da 10 y se puede pasar a mapear · sin lista, las variables en orden alfabético');
  d('taylorFormula', 'texto, texto, cualquiera, entero -> texto', a => {
    const e = K.leerExpr(txt(a[0], 1, 'taylorFormula'));
    const x = variable(a[1], 2, 'taylorFormula');
    const p = punto(a[2], 3, 'taylorFormula');
    if (p.t === 'inf') vm.error('«taylorFormula»: el punto tiene que ser finito');
    const n = vm.exigeEnt(a[3], 4, 'taylorFormula');
    if (n < 0 || n > 60) vm.error('«taylorFormula»: el orden tiene que estar entre 0 y 60');
    return K.unirAscendente(K.taylor(e, x, p, n));
  }, 'taylorFormula("exp(x)", "x", 0, 3) → "1 + x + x^2/2 + x^3/6" · en potencias de (x - a), de menor a mayor grado');
  d('limiteFormula', 'texto, texto, cualquiera -> texto', a => {
    const e = K.leerExpr(txt(a[0], 1, 'limiteFormula'));
    const x = variable(a[1], 2, 'limiteFormula');
    const r = K.limite(e, x, punto(a[2], 3, 'limiteFormula'));
    return r.t === 'inf' ? (r.s > 0 ? 'infinito' : '-infinito') : salida(r);
  }, 'limiteFormula("seno(x)/x", "x", 0) → "1" · sustitución, simplificación y L\'Hôpital; el punto puede ser "infinito" para cocientes de polinomios');
  d('formulaALatex', 'texto -> texto', a => {
    const r = K.leer(txt(a[0], 1, 'formulaALatex'));
    return K.latex(r.izq) + (r.der ? ' = ' + K.latex(r.der) : '');
  }, 'formulaALatex("x^2/2 + raiz(x)") → "\\\\frac{x^{2}}{2} + \\\\sqrt{x}" · para pegar en un documento o en MathJax');
  d('formulaATexto', 'texto -> texto', a => {
    const r = K.leer(txt(a[0], 1, 'formulaATexto'));
    return K.imprimir(r.izq, K.ESTILO_BONITO) + (r.der ? ' = ' + K.imprimir(r.der, K.ESTILO_BONITO) : '');
  }, 'formulaATexto("3x^2 + raiz(2)*pi") → "3x² + √2·π" · para leer: superíndices, √, π, |x|, · y «−»; también se puede volver a leer');
}

if (typeof module !== 'undefined') module.exports = { instalarNenFormulas, nucleoNenFormulas };
