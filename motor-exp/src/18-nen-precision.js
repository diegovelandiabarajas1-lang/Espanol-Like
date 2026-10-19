// ============================================================================
//  Ñ v4 — NEÑ: precisión arbitraria, enteros exactos y la unión con numerico
//  y datos. Parte 18 (motor-exp, fase N1).
//
//  EL TIPO «grande». Un número decimal con tantas cifras como se pidan:
//
//      fijo r = raizGrande(grande(2), 1000)      # √2 con mil cifras
//      fijo x = grande("0.1") + grande("0.2")    # 0.3, exacto
//      imprimir(factorialExacto(100))            # las 158 cifras de 100!
//
//  Por dentro es m × 10^e con m un BigInt y una precisión p (cifras
//  significativas). Se opera con los operadores de siempre (+ − * / // % **,
//  < <= > >= == !=, el menos de delante) contra otro grande o contra un número,
//  y el verificador lo tipa: «grande op número» es grande.
//
//  REDONDEO. Cada resultado se redondea a p cifras, al par más cercano (como
//  Python con «decimal» y como decimal.js por defecto en su modo 6). Al operar
//  dos grandes manda la mayor de sus precisiones. + − * / y la raíz salen con
//  redondeo correcto; exp, log, seno y compañía se calculan con 12 cifras de
//  guarda y luego se redondean (error de menos de una unidad en la última
//  cifra salvo casos rarísimos).
//
//  EXACTOS. Un grande que viene de un entero (o de factorialExacto, o de un
//  texto sin coma) es EXACTO: sumarlo, restarlo, multiplicarlo o elevarlo a un
//  entero no redondea nunca, por grande que salga. Dividir dos exactos da un
//  exacto si la división es justa; si no, un grande con la precisión por
//  defecto. Mezclar un exacto con uno que no lo es da uno que no lo es.
//
//  DE UN REAL. grande(0.1) es 0.1, no 0.1000000000000000055511…: se toma la
//  escritura más corta del real, que es lo que el programa escribió. El valor
//  binario exacto está en grandeExactoDe(0.1).
//
//  LA UNIÓN. «usar … de "nen"» trae también TODO numerico y TODO datos: es el
//  mismo objeto registrado con otro nombre, no una copia (ver reexportarEnNen).
//  Tres nombres existían en los dos —fila, donde y apilar— y en NEÑ miran el
//  primer argumento: con una tabla hacen lo de datos; si no, lo de numerico.
// ============================================================================
'use strict';

// ─────────────────────────────────────────────── el valor
class ObjGrande {
  constructor(m, e, p, exacto) {
    this.clase = 'grande';
    this.m = m;            // BigInt con signo
    this.e = e;            // exponente de 10 (entero de JavaScript)
    this.p = p;            // cifras significativas
    this.exacto = !!exacto;
  }
}

const GR_DEFECTO = 50;          // cifras por defecto
// las cifras por defecto de ESTA vm (las que fija cifrasGrande): se usan cuando
// el resultado de dos exactos (o de un exacto y un número) hay que redondearlo
const grDef = vm => (vm && vm.cifrasGrande) || GR_DEFECTO;
const GR_MAX = 1000000;         // un millón de cifras como mucho
const GR_GUARDA = 12;           // cifras de guarda en las trascendentes
const GR_10 = 10n;

const grPot10 = (() => {
  const cache = new Map();
  return k => {
    if (k < 0) throw new Error('grPot10 negativo');
    if (k < 400) {
      let v = cache.get(k);
      if (v === undefined) { v = GR_10 ** BigInt(k); cache.set(k, v); }
      return v;
    }
    return GR_10 ** BigInt(k);
  };
})();
const grAbs = x => (x < 0n ? -x : x);
function grCifras(x) {
  // cuántas cifras tiene |x| (0 tiene 1)
  x = grAbs(x);
  if (x < 10n) return 1;
  // estimación por bits y corrección
  const bits = x.toString(2).length;
  let d = Math.floor((bits - 1) * 0.30102999566398120) + 1;
  if (x >= grPot10(d)) d++;
  else if (d > 1 && x < grPot10(d - 1)) d--;
  return d;
}

// Redondea m × 10^e a p cifras (al par más cercano). «pegajoso» dice si a la
// derecha de m había algo distinto de cero que ya se perdió (para que 2,5000…1
// no se redondee como 2,5 justo).
function grRedondear(m, e, p, pegajoso) {
  if (m === 0n) return { m: 0n, e: 0 };
  const d = grCifras(m);
  if (d <= p) return { m, e };
  const quita = d - p;
  const div = grPot10(quita);
  let q = m / div;                      // trunca hacia cero
  const r = grAbs(m - q * div);
  const mitad = div / 2n;
  const signo = m < 0n ? -1n : 1n;
  let sube = false;
  if (r > mitad) sube = true;
  else if (r === mitad && div % 2n === 0n) sube = pegajoso ? true : (grAbs(q) % 2n === 1n);
  else if (r === mitad) sube = true;
  if (sube) q += signo;
  e += quita;
  // 9,99… redondeado puede ganar una cifra: 99 → 100
  if (grCifras(q) > p) { q /= GR_10; e += 1; }
  return { m: q, e };
}

function grNuevo(m, e, p, exacto) {
  if (exacto) return new ObjGrande(m, e, p, true);
  const r = grRedondear(m, e, p, false);
  return new ObjGrande(r.m, r.e, p, false);
}

// Quita los ceros de la derecha (para comparar y escribir).
function grNormal(m, e) {
  if (m === 0n) return { m: 0n, e: 0 };
  const s = grAbs(m).toString();
  let z = 0;
  while (z < s.length - 1 && s.charCodeAt(s.length - 1 - z) === 48) z++;
  if (z) { m /= grPot10(z); e += z; }
  return { m, e };
}

// ─────────────────────────────────────────────── entrar
function grDeTexto(s, p, quien) {
  const t = String(s).trim().replace(/_/g, '');
  const mt = t.match(/^([+-]?)(\d*)(?:[.,](\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!mt || (mt[2] === '' && (mt[3] === undefined || mt[3] === '')))
    return { error: `«${quien}»: «${s}» no es un número` };
  const ent = mt[2] || '', frac = mt[3] || '';
  let m = BigInt((ent + frac) || '0');
  if (mt[1] === '-') m = -m;
  const e = -frac.length + (mt[4] ? parseInt(mt[4], 10) : 0);
  const exacto = frac.length === 0 && !mt[4];
  if (exacto) return { v: new ObjGrande(m, 0, Math.max(p, grCifras(m)), true) };
  return { v: grNuevo(m, e, p, false) };
}
function grDeNumero(x, p, quien) {
  if (!Number.isFinite(x)) return { error: `«${quien}»: ${x} no se puede pasar a grande` };
  if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER) {
    const m = BigInt(x);
    return { v: new ObjGrande(m, 0, Math.max(p, grCifras(m)), true) };
  }
  // la escritura más corta: lo que el programa escribió
  return grDeTexto(String(x), p, quien);
}
// El valor binario exacto de un real de 64 bits, en decimal.
function grExactoDeReal(x) {
  if (x === 0) return new ObjGrande(0n, 0, 1, true);
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const signo = hi >>> 31 ? -1n : 1n;
  const expo = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2;
  if (expo === 0) e2 = -1074; else { mant |= 1n << 52n; e2 = expo - 1075; }
  if (e2 >= 0) return new ObjGrande(signo * (mant << BigInt(e2)), 0, 0, true);
  // mant × 2^e2 = mant × 5^(−e2) × 10^e2
  const m = signo * mant * (5n ** BigInt(-e2));
  const r = grNormal(m, e2);
  return new ObjGrande(r.m, r.e, grCifras(r.m), false);
}

// ─────────────────────────────────────────────── salir
function grATexto(g, cifras) {
  if (g.m === 0n) return '0';
  let { m, e } = grNormal(g.m, g.e);
  if (cifras !== undefined && cifras < grCifras(m)) {
    const r = grRedondear(m, e, cifras, false);
    ({ m, e } = grNormal(r.m, r.e));
  }
  const neg = m < 0n;
  const s = grAbs(m).toString();
  const n = s.length;
  const exp10 = n - 1 + e;                  // exponente científico
  let out;
  // un exacto se escribe entero siempre; uno que no lo es, con exponente si
  // los ceros de la derecha no son cifras de verdad (como un real: 1e+21)
  if (e >= 0 && (g.exacto || exp10 < 21)) out = s + '0'.repeat(e);
  else if (exp10 >= -7 && e < 0) {
    if (exp10 >= 0) out = s.slice(0, n + e) + '.' + s.slice(n + e);
    else out = '0.' + '0'.repeat(-exp10 - 1) + s;
  } else {
    out = s[0] + (n > 1 ? '.' + s.slice(1) : '') + 'e' + (exp10 >= 0 ? '+' : '') + exp10;
  }
  return (neg ? '-' : '') + out;
}
function grAReal(g) { return Number(grATexto(g, 20)); }

// ─────────────────────────────────────────────── aritmética
function grPrec(a, b) {
  // la precisión del resultado: la mayor de las que no son exactas; si los dos
  // son exactos, la por defecto (solo importa si hay que redondear)
  if (!a.exacto && !b.exacto) return Math.max(a.p, b.p);
  if (!a.exacto) return a.p;
  if (!b.exacto) return b.p;
  return Math.max(GR_DEFECTO, a.p, b.p);
}
function grMagn(g) { return g.m === 0n ? -Infinity : grCifras(g.m) + g.e; }

function grSumar(a, b, restar) {
  const mb0 = restar ? -b.m : b.m;
  if (a.m === 0n) return b.exacto && a.exacto ? new ObjGrande(mb0, b.e, b.p, true) : grNuevo(mb0, b.e, grPrec(a, b), false);
  if (b.m === 0n) return a.exacto && b.exacto ? new ObjGrande(a.m, a.e, a.p, true) : grNuevo(a.m, a.e, grPrec(a, b), false);
  const exacto = a.exacto && b.exacto;
  const p = grPrec(a, b);
  if (!exacto) {
    // si uno es despreciable frente al otro, no hace falta alinear un millón
    // de ceros: basta con dejar una marca a la derecha
    const ma = grMagn(a), mb = grMagn(b);
    if (ma - mb > p + 3) return grSumarMarca(a.m, a.e, mb0 < 0n ? -1n : 1n, p);
    if (mb - ma > p + 3) return grSumarMarca(mb0, b.e, a.m < 0n ? -1n : 1n, p);
  }
  let m, e;
  if (a.e === b.e) { m = a.m + mb0; e = a.e; }
  else if (a.e > b.e) { m = a.m * grPot10(a.e - b.e) + mb0; e = b.e; }
  else { m = a.m + mb0 * grPot10(b.e - a.e); e = a.e; }
  if (exacto) return new ObjGrande(m, e, Math.max(a.p, b.p, grCifras(m)), true);
  return grNuevo(m, e, p, false);
}
// x + algo diminuto con signo s: se baja x a p+3 cifras y se suma una unidad
// de la última cifra de guarda, que decide el redondeo como debe.
function grSumarMarca(m, e, s, p) {
  const d = grCifras(m);
  const extra = p + 3 - d;
  if (extra > 0) { m *= grPot10(extra); e -= extra; }
  return grNuevo(m * 10n + s, e - 1, p, false);
}
function grMult(a, b) {
  const exacto = a.exacto && b.exacto;
  const m = a.m * b.m, e = a.e + b.e;
  if (exacto) return new ObjGrande(m, e, Math.max(a.p, b.p, grCifras(m)), true);
  return grNuevo(m, e, grPrec(a, b), false);
}
// a / b redondeado a p cifras, con redondeo correcto
function grDividirP(am, ae, bm, be, p) {
  if (am === 0n) return { m: 0n, e: 0 };
  const neg = (am < 0n) !== (bm < 0n);
  am = grAbs(am); bm = grAbs(bm);
  let k = p + grCifras(bm) - grCifras(am);
  if (k < 0) k = 0;
  let num = am * grPot10(k);
  let q = num / bm;
  if (grCifras(q) < p) { k += 1; num *= GR_10; q = num / bm; }
  let r = num - q * bm;
  let e = ae - be - k;
  // q tiene p o p+1 cifras; si tiene p+1, se redondea con el resto como marca
  if (grCifras(q) > p) {
    const rr = grRedondear(neg ? -q : q, e, p, r !== 0n);
    return rr;
  }
  const dos = 2n * r;
  if (dos > bm || (dos === bm && q % 2n === 1n)) q += 1n;
  const out = grRedondear(neg ? -q : q, e, p, false);
  return out;
}
function grDividir(vm, a, b, quien) {
  if (b.m === 0n) vm.error(`«${quien}»: división entre cero`);
  if (a.exacto && b.exacto && a.e >= 0 && b.e >= 0) {
    const na = a.m * grPot10(a.e), nb = b.m * grPot10(b.e);
    if (na % nb === 0n) { const q = na / nb; return new ObjGrande(q, 0, Math.max(GR_DEFECTO, grCifras(q)), true); }
  }
  const p = (a.exacto && b.exacto) ? grDef(vm) : grPrec(a, b);
  const r = grDividirP(a.m, a.e, b.m, b.e, p);
  return new ObjGrande(r.m, r.e, p, false);
}
// la parte entera hacia −infinito de a/b, como «//» en Ñ
function grPisoDiv(vm, a, b) {
  if (b.m === 0n) vm.error('«//»: división entre cero');
  // a/b = (am·10^ae)/(bm·10^be)
  let na = a.m, nb = b.m;
  if (a.e > b.e) na *= grPot10(a.e - b.e); else if (b.e > a.e) nb *= grPot10(b.e - a.e);
  let q = na / nb;
  if ((na % nb !== 0n) && ((na < 0n) !== (nb < 0n))) q -= 1n;
  return new ObjGrande(q, 0, Math.max(grPrec(a, b), grCifras(q)), true);      // la parte entera siempre es exacta
}
function grResto(vm, a, b) {
  if (b.m === 0n) vm.error('«%»: módulo entre cero');
  let na = a.m, nb = b.m, e = Math.min(a.e, b.e);
  if (a.e > e) na *= grPot10(a.e - e);
  if (b.e > e) nb *= grPot10(b.e - e);
  let r = ((na % nb) + nb) % nb;
  if (nb < 0n && r > 0n) r += nb;
  const exacto = a.exacto && b.exacto;
  return exacto ? new ObjGrande(r, e, Math.max(a.p, b.p), true) : grNuevo(r, e, grPrec(a, b), false);
}
function grComparar(a, b) {
  if (a.m === 0n && b.m === 0n) return 0;
  const sa = a.m < 0n ? -1 : (a.m > 0n ? 1 : 0), sb = b.m < 0n ? -1 : (b.m > 0n ? 1 : 0);
  if (sa !== sb) return sa < sb ? -1 : 1;
  // mismo signo: por magnitud primero (barato)
  const ma = grMagn(a), mb = grMagn(b);
  if (ma !== mb) return (ma < mb ? -1 : 1) * sa;
  let na = a.m, nb = b.m;
  if (a.e > b.e) na *= grPot10(a.e - b.e); else if (b.e > a.e) nb *= grPot10(b.e - a.e);
  return na < nb ? -1 : (na > nb ? 1 : 0);
}
function grNeg(g) { return new ObjGrande(-g.m, g.e, g.p, g.exacto); }

// ─────────────────────────────────────────────── punto fijo para las trascendentes
// Un número en punto fijo es un BigInt X que vale X / 10^w.
function grAFijo(g, w) {
  const s = g.e + w;
  if (s >= 0) return g.m * grPot10(s);
  return g.m / grPot10(-s);
}
function grDeFijo(X, w, p) { return grNuevo(X, -w, p, false); }
function grRaizEntera(n) {
  if (n < 0n) throw new Error('raíz entera de un negativo');
  if (n < 2n) return n;
  // primera aproximación con un real
  // se empieza por ENCIMA de la raíz: Newton baja sin pasarse
  const bits = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bits / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}

// π por Chudnovsky con partición binaria: unas 14 cifras por término.
const grCachePi = { w: 0, X: 0n };
function grPiFijo(w) {
  if (grCachePi.w >= w) return grCachePi.X / grPot10(grCachePi.w - w);
  const C = 640320n, C3_24 = C * C * C / 24n;
  const n = Math.floor(w / 14) + 2;
  function bs(a, b) {
    if (b - a === 1) {
      let Pab, Qab;
      if (a === 0) { Pab = 1n; Qab = 1n; }
      else {
        const A = BigInt(a);
        Pab = (6n * A - 5n) * (2n * A - 1n) * (6n * A - 1n);
        Qab = A * A * A * C3_24;
      }
      let Tab = Pab * (13591409n + 545140134n * BigInt(a));
      if (a & 1) Tab = -Tab;
      return [Pab, Qab, Tab];
    }
    const m = (a + b) >> 1;
    const [P1, Q1, T1] = bs(a, m), [P2, Q2, T2] = bs(m, b);
    return [P1 * P2, Q1 * Q2, Q2 * T1 + P1 * T2];
  }
  const [, Q, T] = bs(0, n);
  const raiz = grRaizEntera(10005n * grPot10(2 * w));
  const X = (Q * 426880n * raiz) / T;
  grCachePi.w = w; grCachePi.X = X;
  return X;
}
// atanh(1/k) en punto fijo: 1/k + 1/(3k³) + …
function grAtanhInv(k, w) {
  const S = grPot10(w);
  const K = BigInt(k), K2 = K * K;
  let pot = S / K, suma = pot, n = 1n;
  for (;;) {
    pot /= K2; n += 2n;
    const t = pot / n;
    if (t === 0n) break;
    suma += t;
  }
  return suma;
}
const grCacheLn2 = { w: 0, X: 0n }, grCacheLn10 = { w: 0, X: 0n };
function grLn2Fijo(w) {
  if (grCacheLn2.w >= w) return grCacheLn2.X / grPot10(grCacheLn2.w - w);
  // ln 2 = 2·atanh(1/3)
  const X = 2n * grAtanhInv(3, w + 5) / grPot10(5);
  grCacheLn2.w = w; grCacheLn2.X = X;
  return X;
}
function grLn10Fijo(w) {
  if (grCacheLn10.w >= w) return grCacheLn10.X / grPot10(grCacheLn10.w - w);
  // ln 10 = 3·ln 2 + ln(5/4), y ln(5/4) = 2·atanh(1/9)
  const X = (3n * grLn2Fijo(w + 5) + 2n * grAtanhInv(9, w + 5)) / grPot10(5);
  grCacheLn10.w = w; grCacheLn10.X = X;
  return X;
}
// exp de un punto fijo X (|x| razonable). Devuelve punto fijo.
function grExpFijo(X, w) {
  const S = grPot10(w);
  // reducción: x = n·ln2 + r, |r| ≤ ln2/2
  const L = grLn2Fijo(w + 10) / grPot10(10);
  let n = X / L;
  let r = X - n * L;
  if (r * 2n > L) { r -= L; n += 1n; } else if (r * 2n < -L) { r += L; n -= 1n; }
  // y luego r / 2^k, para que la serie sea corta
  const k = Math.max(4, Math.floor(Math.sqrt(w)));
  const ww = w + k + 10;
  const SS = grPot10(ww);
  let rr = r * grPot10(ww - w) / (1n << BigInt(k));
  let t = SS, suma = SS, i = 1n;
  for (;;) {
    t = t * rr / SS / i;
    if (t === 0n) break;
    suma += t; i += 1n;
  }
  for (let j = 0; j < k; j++) suma = suma * suma / SS;
  // × 2^n
  if (n >= 0n) suma <<= n; else suma >>= -n;
  return suma / grPot10(ww - w);
}
// exp(X / 10^w) como grande de p cifras: x = q·ln 10 + r con r en [0, ln 10),
// así exp(x) = exp(r)·10^q y el exponente enorme va al exponente decimal.
function grExpGrande(vm, X, w, p, quien) {
  const L10 = grLn10Fijo(w + 5) / grPot10(5);
  let q = X / L10;
  let r = X - q * L10;
  if (r < 0n) { r += L10; q -= 1n; }
  if (q > 1000000000000000n || q < -1000000000000000n) vm.error(`«${quien}»: el resultado no cabe ni en un grande`);
  const E = grExpFijo(r, w);
  return grNuevo(E, -w + Number(q), p, false);
}
// ln de un grande positivo, en punto fijo de w cifras
function grLnFijo(g, w) {
  // g = m·10^e = y·10^E con y en [1, 10)
  const d = grCifras(g.m);
  const E = d - 1 + g.e;
  const ww = w + 15;
  const SS = grPot10(ww);
  let Y = g.m * grPot10(ww) / grPot10(d - 1);       // y en punto fijo, en [1, 10)
  // y = y'·2^k con y' en [0.75, 1.5)
  let k = 0;
  const tres4 = SS * 3n / 4n, tres2 = SS * 3n / 2n;
  while (Y >= tres2) { Y >>= 1n; k++; }
  while (Y < tres4) { Y <<= 1n; k--; }
  // unas cuantas raíces cuadradas para acercar y' a 1: ln y' = 2^j · ln y'^(1/2^j)
  const j = Math.min(24, Math.max(2, Math.floor(Math.sqrt(ww) / 3)));
  for (let i = 0; i < j; i++) Y = grRaizEntera(Y * SS);
  // ln y = 2·atanh(z), z = (y−1)/(y+1)
  const Z = (Y - SS) * SS / (Y + SS);
  const Z2 = Z * Z / SS;
  let pot = Z, suma = Z, n = 1n;
  for (;;) {
    pot = pot * Z2 / SS; n += 2n;
    const t = pot / n;
    if (t === 0n) break;
    suma += t;
  }
  let ln = 2n * suma * (1n << BigInt(j));
  ln += BigInt(k) * grLn2Fijo(ww) + BigInt(E) * grLn10Fijo(ww);
  return ln / grPot10(ww - w);
}
// seno y coseno de un punto fijo X
function grSenCosFijo(X, w) {
  const ww = w + 15;
  const SS = grPot10(ww);
  let x = X * grPot10(ww - w);
  // reducir módulo 2π (con π de más cifras si x es grande)
  const extra = Math.max(0, x.toString().length - ww) + 5;
  const PI = grPiFijo(ww + extra) / grPot10(extra);
  const DOS_PI = 2n * PI;
  x = x % DOS_PI;
  if (x > PI) x -= DOS_PI; else if (x < -PI) x += DOS_PI;
  // ahora |x| ≤ π: se divide entre 2^k y se duplica después
  const k = Math.max(4, Math.floor(Math.sqrt(ww) / 2));
  const SK = grPot10(ww + k);
  let r = x * grPot10(k) / (1n << BigInt(k));     // en punto fijo de ww+k
  const R2 = r * r / SK;
  // seno y coseno de r por Taylor
  let s = r, c = SK, ts = r, tc = SK, i = 1n;
  for (;;) {
    ts = -ts * R2 / SK / ((2n * i) * (2n * i + 1n));
    tc = -tc * R2 / SK / ((2n * i - 1n) * (2n * i));
    if (ts === 0n && tc === 0n) break;
    s += ts; c += tc; i += 1n;
  }
  for (let j = 0; j < k; j++) { const s2 = 2n * s * c / SK; c = (c * c - s * s) / SK; s = s2; }
  const div = grPot10(ww + k - w);
  return [s / div, c / div];
}
// arcotangente de un punto fijo X
function grAtanFijo(X, w) {
  const ww = w + 15;
  const SS = grPot10(ww);
  let x = X * grPot10(ww - w);
  let neg = false;
  if (x < 0n) { neg = true; x = -x; }
  let inv = false;
  if (x > SS) { x = SS * SS / x; inv = true; }
  // atan(x) = 2·atan(x / (1 + √(1 + x²))), j veces
  const j = Math.max(3, Math.floor(Math.sqrt(ww) / 2));
  for (let i = 0; i < j; i++) {
    const raiz = grRaizEntera(SS * SS + x * x);
    x = x * SS / (SS + raiz);
  }
  const X2 = x * x / SS;
  let pot = x, suma = x, n = 1n, signo = -1n;
  for (;;) {
    pot = pot * X2 / SS; n += 2n;
    const t = pot / n;
    if (t === 0n) break;
    suma += signo * t; signo = -signo;
  }
  let a = suma * (1n << BigInt(j));
  if (inv) a = grPiFijo(ww) / 2n - a;
  if (neg) a = -a;
  return a / grPot10(ww - w);
}

// ─────────────────────────────────────────────── las operaciones que llama la VM
// aritOtro, sumar, neg y las comparaciones de 03-vm-jit.js vienen aquí cuando
// alguno de los dos es un grande.
function grDeOperando(vm, x, op) {
  if (x instanceof ObjGrande) return x;
  if (typeof x === 'number') {
    const r = grDeNumero(x, grDef(vm), op);
    if (r.error) vm.error(r.error);
    return r.v;
  }
  vm.error(`«${op}»: un grande se opera con otro grande o con un número, y llegó ${tipoDe(x)}`,
    'para pasar un texto a grande: grande("3.14159…")');
}
function grandeArit(vm, a, b, op) {
  const x = grDeOperando(vm, a, op), y = grDeOperando(vm, b, op);
  switch (op) {
    case '+': return grSumar(x, y, false);
    case '-': return grSumar(x, y, true);
    case '*': return grMult(x, y);
    case '/': return grDividir(vm, x, y, '/');
    case '//': return grPisoDiv(vm, x, y);
    case '%': return grResto(vm, x, y);
    case '**': return grPotencia(vm, x, y, '**');
  }
  vm.error(`«${op}» no se aplica a un grande`);
}
function grandeCmp(vm, a, b, op) {
  const x = grDeOperando(vm, a, op), y = grDeOperando(vm, b, op);
  return grComparar(x, y);
}
function grandeIgual(a, b) {
  const x = a instanceof ObjGrande ? a : (typeof a === 'number' && Number.isFinite(a) ? grDeNumero(a, GR_DEFECTO, '==').v : null);
  const y = b instanceof ObjGrande ? b : (typeof b === 'number' && Number.isFinite(b) ? grDeNumero(b, GR_DEFECTO, '==').v : null);
  if (!x || !y) return false;
  return grComparar(x, y) === 0;
}

// ─────────────────────────────────────────────── potencia y trascendentes
function grEsEntero(g) {
  if (g.e >= 0) return true;
  return g.m % grPot10(-g.e) === 0n;
}
function grAEnteroBig(g) {
  if (g.e >= 0) return g.m * grPot10(g.e);
  return g.m / grPot10(-g.e);
}
function grPotencia(vm, b, x, quien, pForzada) {
  if (grEsEntero(x)) {
    const n = grAEnteroBig(x);
    if (b.exacto && n >= 0n && !pForzada) {
      if (n > 100000000n) vm.error(`«${quien}»: el exponente ${n} es demasiado grande para un resultado exacto`);
      const m = (b.m * grPot10(Math.max(0, b.e))) ** n;
      return new ObjGrande(m, 0, Math.max(b.p, grCifras(m)), true);
    }
    const p = pForzada || (b.exacto ? (x.exacto ? grDef(vm) : x.p) : b.p);
    if (n === 0n) return new ObjGrande(1n, 0, p, false);
    if (b.m === 0n) {
      if (n < 0n) vm.error(`«${quien}»: 0 elevado a un negativo`);
      return new ObjGrande(0n, 0, p, false);
    }
    // por cuadrados, con guarda
    let k = n < 0n ? -n : n;
    const guarda = p + 10 + k.toString(2).length;
    let base = { m: b.m, e: b.e }, acc = { m: 1n, e: 0 };
    while (k > 0n) {
      if (k & 1n) { const r = grRedondear(acc.m * base.m, acc.e + base.e, guarda, false); acc = r; }
      k >>= 1n;
      if (k > 0n) { const r = grRedondear(base.m * base.m, base.e + base.e, guarda, false); base = r; }
    }
    if (n < 0n) {
      const r = grDividirP(1n, 0, acc.m, acc.e, p);
      return new ObjGrande(r.m, r.e, p, false);
    }
    return grNuevo(acc.m, acc.e, p, false);
  }
  if (b.m <= 0n) vm.error(`«${quien}»: una base negativa o cero con un exponente que no es entero no da un real`);
  const p = pForzada || Math.max(b.exacto ? grDef(vm) : b.p, x.exacto ? grDef(vm) : x.p);
  // b^x = exp(x·ln b), con cifras de más por lo que crece el exponente
  const w = p + GR_GUARDA + Math.max(0, grMagn(x)) + 2;
  const L = grLnFijo(b, w);
  const xf = grAFijo(x, w);
  return grExpGrande(vm, xf * L / grPot10(w), w, p, quien);
}

function grCifrasArg(vm, v, quien, k) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    vm.error(`«${quien}»: las cifras (argumento ${k}) deben ser un entero positivo y son ${repr(v, 1)}`);
  if (v > GR_MAX) vm.error(`«${quien}»: ${v} cifras es demasiado; el máximo es ${GR_MAX}`);
  return v;
}

// ─────────────────────────────────────────────── la unión con numerico y datos
function instalarNenUnion(vm, def) {
  const de = (edsl, n) => vm.globals.get(nombreGlobalModulo(claveEdsl(edsl), n));
  const esTabla = v => v instanceof ObjTabla;
  // cada una dice a quiénes despacha: así abrir NEÑ junto a numerico no choca
  const marcar = n => { const o = vm.globals.get(nombreGlobalModulo(claveEdsl('nen'), n)); o.despacha = [de('numerico', n), de('datos', n)]; };
  def('fila', 'tabla|arreglo, entero -> dic|arreglo', a =>
    (esTabla(a[0]) ? de('datos', 'fila') : de('numerico', 'fila')).fn(a, vm),
    'fila(t, 0) — con una tabla, un diccionario con esa fila (como en datos); con un arreglo, la vista de la fila i (como en numerico)');
  def('donde', '... -> cualquiera', a =>
    (esTabla(a[0]) ? de('datos', 'donde') : de('numerico', 'donde')).fn(a, vm),
    'donde(t, fn(f) {…}) — con una tabla, las filas que cumplen (datos); donde(cond, a, b) — con arreglos, el «si» elemento a elemento (numerico)');
  def('apilar', '... -> cualquiera', a => {
    const primero = a[0] instanceof ObjLista ? a[0].items[0] : a[0];
    return (esTabla(primero) ? de('datos', 'apilar') : de('numerico', 'apilar')).fn(a, vm);
  }, 'apilar(t1, t2) — con tablas, una debajo de la otra (datos); con arreglos, en un eje nuevo (numerico)');
  for (const n of ['fila', 'donde', 'apilar']) marcar(n);
}
// Después de instalar «nen»: cada nombre de numerico y de datos que NEÑ no
// define queda registrado también bajo la clave de NEÑ, apuntando al MISMO
// objeto. «usar media de "nen"» y «usar media de "numerico"» llaman a la misma
// función, con la misma firma y el mismo JIT.
function reexportarEnNen(vm, reg) {
  const propios = new Set(reg.exporta.keys());
  reg.reexporta = new Map();          // nombre → eDSL de donde viene
  for (const origen of ['numerico', 'datos']) {
    const r = vm.edsls.get(origen);
    if (!r) continue;
    for (const [n, firmaT] of r.exporta) {
      if (propios.has(n) || reg.exporta.has(n)) continue;
      const obj = vm.globals.get(nombreGlobalModulo(r.clave, n));
      vm.globals.set(nombreGlobalModulo(reg.clave, n), obj);
      reg.exporta.set(n, firmaT);
      reg.reexporta.set(n, origen);
    }
  }
}

// ─────────────────────────────────────────────── las funciones de NEÑ
function instalarNenPrecision(vm, def) {
  if (vm.cifrasGrande === undefined) vm.cifrasGrande = GR_DEFECTO;
  const P = () => vm.cifrasGrande;
  const aGrande = (v, k, quien, p) => {
    if (v instanceof ObjGrande) return v;
    let r;
    if (typeof v === 'number') r = grDeNumero(v, p || P(), quien);
    else if (typeof v === 'string') r = grDeTexto(v, p || P(), quien);
    else vm.error(`«${quien}»: el argumento ${k} debe ser un número, un texto o un grande y es ${tipoDe(v)}`);
    if (r.error) vm.error(r.error);
    return r.v;
  };
  // con la precisión pedida (o la de x, o la por defecto)
  const precisionPara = (x, c) => c || (x.exacto ? P() : x.p);
  const entN = (v, k, quien) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) vm.error(`«${quien}»: el argumento ${k} debe ser un entero y es ${repr(v, 1)}`);
    return v;
  };

  def('grande', '... -> grande', a => {
    const c = grCifrasArg(vm, a[1], 'grande', 2);
    if (a[0] instanceof ObjGrande) return c ? grNuevo(a[0].m, a[0].e, c, false) : a[0];
    return aGrande(a[0], 1, 'grande', c);
  }, 'grande(2), grande("0.1"), grande(|PI, 30) — un número decimal de precisión arbitraria; de un entero o de un texto sin coma, EXACTO');
  def('cifrasGrande', '... -> entero', a => {
    const antes = P();
    if (a.length) vm.cifrasGrande = grCifrasArg(vm, a[0], 'cifrasGrande', 1);
    return antes;
  }, 'cifrasGrande(100) — las cifras de los grandes que se creen desde ahora (por defecto 50); devuelve las que había');
  def('cifrasDe', 'grande -> entero', a => {
    const g = aGrande(a[0], 1, 'cifrasDe');
    return g.exacto ? grCifras(g.m * grPot10(Math.max(0, g.e))) : g.p;
  }, 'cifrasDe(g) — con cuántas cifras significativas va g (en un exacto, las que tiene)');
  def('esExacto', 'grande -> bool', a => aGrande(a[0], 1, 'esExacto').exacto,
    'esExacto(factorialExacto(30)) — cierto si g es un entero exacto (nunca se redondea al sumar, restar o multiplicar)');
  def('grandeExactoDe', 'real -> grande', a => {
    if (typeof a[0] !== 'number' || !Number.isFinite(a[0])) vm.error('«grandeExactoDe»: necesita un real finito');
    return grExactoDeReal(a[0]);
  }, 'grandeExactoDe(0.1) — el valor binario EXACTO de un real de 64 bits: 0.1000000000000000055511151231257827…');
  def('redondearGrande', 'grande, entero -> grande', a => {
    const g = aGrande(a[0], 1, 'redondearGrande');
    const c = grCifrasArg(vm, a[1], 'redondearGrande', 2);
    return grNuevo(g.m, g.e, c, false);
  }, 'redondearGrande(g, 10) — g con 10 cifras significativas');
  def('decimalesGrande', 'grande, entero -> texto', a => {
    const g = aGrande(a[0], 1, 'decimalesGrande');
    const d = entN(a[1], 2, 'decimalesGrande');
    if (d < 0) vm.error('«decimalesGrande»: los decimales no pueden ser negativos');
    // redondear a d decimales: al par
    const e0 = -d;
    let m = g.m, e = g.e;
    if (e < e0) {
      const div = grPot10(e0 - e);
      let q = m / div; const r = grAbs(m - q * div); const mitad = div / 2n;
      if (r > mitad || (r === mitad && grAbs(q) % 2n === 1n)) q += (m < 0n ? -1n : 1n);
      m = q; e = e0;
    } else if (e > e0) { m = m * grPot10(e - e0); e = e0; }
    const neg = m < 0n;
    let s = grAbs(m).toString();
    if (d > 0) { s = s.padStart(d + 1, '0'); s = s.slice(0, s.length - d) + '.' + s.slice(s.length - d); }
    return (neg ? '-' : '') + s;
  }, 'decimalesGrande(piGrande(30), 5) — «3.14159»: el texto con ese número de decimales, redondeado');
  def('aReal', 'grande -> real', a => grAReal(aGrande(a[0], 1, 'aReal')),
    'aReal(g) — el real de 64 bits más cercano (también vale real(g))');

  // raíces, exponenciales, logaritmos
  def('raizGrande', '... -> grande', a => {
    const c = grCifrasArg(vm, a[1], 'raizGrande', 2);
    const g = aGrande(a[0], 1, 'raizGrande', c);
    if (g.m < 0n) vm.error('«raizGrande»: no hay raíz real de un negativo', 'para complejos está «raiz» de numerico');
    const p = precisionPara(g, c);
    if (g.m === 0n) return new ObjGrande(0n, 0, p, false);
    // N = m·10^s con (e − s) par y unas 2(p+2) cifras
    let s = 2 * (p + 2) - grCifras(g.m);
    if ((g.e - s) % 2 !== 0) s += 1;
    const N = s >= 0 ? g.m * grPot10(s) : g.m / grPot10(-s);
    const r = grRaizEntera(N);
    const exacta = s >= 0 && r * r === N;
    const R = grRedondear(r, (g.e - s) / 2, p, !exacta);
    return new ObjGrande(R.m, R.e, p, false);
  }, 'raizGrande(2, 1000) — √2 con mil cifras (redondeo correcto)');
  def('expGrande', '... -> grande', a => {
    const c = grCifrasArg(vm, a[1], 'expGrande', 2);
    const g = aGrande(a[0], 1, 'expGrande', c);
    const p = precisionPara(g, c);
    const w = p + GR_GUARDA + Math.max(0, grMagn(g));
    return grExpGrande(vm, grAFijo(g, w), w, p, 'expGrande');
  }, 'expGrande(1, 100) — e con cien cifras; expGrande(x) — e elevado a x');
  def('logGrande', '... -> grande', a => {
    const c = grCifrasArg(vm, typeof a[1] === 'number' && a.length === 2 ? a[1] : a[2], 'logGrande', a.length === 2 ? 2 : 3);
    const g = aGrande(a[0], 1, 'logGrande', c);
    if (g.m <= 0n) vm.error('«logGrande»: el logaritmo solo existe para positivos');
    const p = precisionPara(g, c);
    const w = p + GR_GUARDA;
    let L = grLnFijo(g, w);
    if (a.length === 3) {
      const b = aGrande(a[1], 2, 'logGrande');
      if (b.m <= 0n || grComparar(b, new ObjGrande(1n, 0, 1, true)) === 0) vm.error('«logGrande»: la base debe ser positiva y distinta de 1');
      L = L * grPot10(w) / grLnFijo(b, w);
    }
    return grDeFijo(L, w, p);
  }, 'logGrande(2, 100) — ln 2 con cien cifras; logGrande(x, base, cifras) — en otra base');
  // trigonometría
  const trig = (nombre, f, doc) => def(nombre, '... -> grande', a => {
    const c = grCifrasArg(vm, a[1], nombre, 2);
    const g = aGrande(a[0], 1, nombre, c);
    const p = precisionPara(g, c);
    const w = p + GR_GUARDA;
    return grDeFijo(f(grAFijo(g, w), w, g), w, p);
  }, doc);
  trig('senoGrande', (X, w) => grSenCosFijo(X, w)[0], 'senoGrande(1, 60) — sen 1 con 60 cifras (en radianes)');
  trig('cosenoGrande', (X, w) => grSenCosFijo(X, w)[1], 'cosenoGrande(1, 60) — cos 1 con 60 cifras');
  trig('tangenteGrande', (X, w) => {
    const [s, c] = grSenCosFijo(X, w);
    if (c === 0n) vm.error('«tangenteGrande»: la tangente no existe ahí');
    return s * grPot10(w) / c;
  }, 'tangenteGrande(1, 60) — tan 1 con 60 cifras');
  trig('arcotangenteGrande', (X, w) => grAtanFijo(X, w), 'arcotangenteGrande(1, 100) — π/4 con cien cifras');
  trig('arcosenoGrande', (X, w) => {
    const S = grPot10(w);
    if (grAbs(X) > S) vm.error('«arcosenoGrande»: el argumento debe estar entre −1 y 1');
    if (grAbs(X) === S) return X > 0n ? grPiFijo(w) / 2n : -grPiFijo(w) / 2n;
    const raiz = grRaizEntera(S * S - X * X);
    return grAtanFijo(X * S / raiz, w);
  }, 'arcosenoGrande(0.5, 50) — π/6 con 50 cifras');
  trig('arcocosenoGrande', (X, w) => {
    const S = grPot10(w);
    if (grAbs(X) > S) vm.error('«arcocosenoGrande»: el argumento debe estar entre −1 y 1');
    let as;
    if (grAbs(X) === S) as = X > 0n ? grPiFijo(w) / 2n : -grPiFijo(w) / 2n;
    else as = grAtanFijo(X * S / grRaizEntera(S * S - X * X), w);
    return grPiFijo(w) / 2n - as;
  }, 'arcocosenoGrande(0, 50) — π/2 con 50 cifras');
  def('potenciaGrande', '... -> grande', a => {
    const c = grCifrasArg(vm, a[2], 'potenciaGrande', 3);
    const b = aGrande(a[0], 1, 'potenciaGrande', c), x = aGrande(a[1], 2, 'potenciaGrande', c);
    return grPotencia(vm, b, x, 'potenciaGrande', c);
  }, 'potenciaGrande(2, "0.5", 40) — 2^0,5 con 40 cifras; con base exacta y exponente entero, exacto');
  def('piGrande', 'entero -> grande', a => {
    const p = grCifrasArg(vm, a[0], 'piGrande', 1);
    const w = p + GR_GUARDA;
    return grDeFijo(grPiFijo(w), w, p);
  }, 'piGrande(1000) — π con mil cifras (Chudnovsky)');
  def('eGrande', 'entero -> grande', a => {
    const p = grCifrasArg(vm, a[0], 'eGrande', 1);
    const w = p + GR_GUARDA;
    return grExpGrande(vm, grPot10(w), w, p, 'eGrande');
  }, 'eGrande(100) — el número e con cien cifras');

  // enteros exactos
  const natural = (v, k, quien, max) => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v) || v < 0) vm.error(`«${quien}»: el argumento ${k} debe ser un entero no negativo y es ${repr(v, 1)}`);
      if (max && v > max) vm.error(`«${quien}»: ${v} es demasiado; el máximo es ${max}`);
      return BigInt(v);
    }
    if (v instanceof ObjGrande && grEsEntero(v) && v.m >= 0n) return grAEnteroBig(v);
    vm.error(`«${quien}»: el argumento ${k} debe ser un entero no negativo y es ${tipoDe(v)}`);
  };
  const exacto = m => new ObjGrande(m, 0, grCifras(m), true);
  def('factorialExacto', 'entero -> grande', a => {
    const n = Number(natural(a[0], 1, 'factorialExacto', 200000));
    // producto por mitades: mucho más rápido que de uno en uno
    const prod = (lo, hi) => {
      if (hi - lo < 16) { let r = 1n; for (let i = lo; i <= hi; i++) r *= BigInt(i); return r; }
      const m = (lo + hi) >> 1;
      return prod(lo, m) * prod(m + 1, hi);
    };
    return exacto(n < 2 ? 1n : prod(2, n));
  }, 'factorialExacto(100) — 100! con sus 158 cifras, exacto');
  def('potenciaExacta', 'entero|grande, entero -> grande', a => {
    const b = a[0] instanceof ObjGrande ? a[0] : aGrande(entN(a[0], 1, 'potenciaExacta'), 1, 'potenciaExacta');
    if (!b.exacto) vm.error('«potenciaExacta»: la base debe ser un entero exacto', 'para potencias con decimales: potenciaGrande');
    const n = entN(a[1], 2, 'potenciaExacta');
    if (n < 0) vm.error('«potenciaExacta»: el exponente no puede ser negativo');
    if (n > 10000000) vm.error('«potenciaExacta»: el exponente es demasiado grande');
    return exacto(grAEnteroBig(b) ** BigInt(n));
  }, 'potenciaExacta(2, 1000) — 2^1000 con sus 302 cifras');
  def('combinacionesExactas', 'entero, entero -> grande', a => {
    const n = natural(a[0], 1, 'combinacionesExactas', 1000000), k0 = natural(a[1], 2, 'combinacionesExactas');
    if (k0 > n) return exacto(0n);
    const k = k0 > n - k0 ? n - k0 : k0;
    let r = 1n;
    for (let i = 1n; i <= k; i++) r = r * (n - k + i) / i;
    return exacto(r);
  }, 'combinacionesExactas(100, 50) — 100 sobre 50, exacto (29 cifras)');
  def('fibonacciExacto', 'entero -> grande', a => {
    const n = Number(natural(a[0], 1, 'fibonacciExacto', 10000000));
    // duplicación: F(2k) = F(k)(2F(k+1) − F(k)), F(2k+1) = F(k)² + F(k+1)²
    const fib = n => {
      if (n === 0) return [0n, 1n];
      const [x, y] = fib(n >> 1);
      const c = x * (2n * y - x), d = x * x + y * y;
      return n & 1 ? [d, c + d] : [c, d];
    };
    return exacto(fib(n)[0]);
  }, 'fibonacciExacto(1000) — el término mil de Fibonacci, exacto (209 cifras)');
  def('mcdExacto', 'entero|grande, entero|grande -> grande', a => {
    let x = natural(a[0] instanceof ObjGrande ? a[0] : Math.abs(entN(a[0], 1, 'mcdExacto')), 1, 'mcdExacto');
    let y = natural(a[1] instanceof ObjGrande ? a[1] : Math.abs(entN(a[1], 2, 'mcdExacto')), 2, 'mcdExacto');
    while (y) { [x, y] = [y, x % y]; }
    return exacto(x);
  }, 'mcdExacto(factorialExacto(30), potenciaExacta(2, 40)) — el máximo común divisor de dos enteros exactos');
  def('esPrimoExacto', 'entero|grande -> bool', a => {
    const n = natural(a[0], 1, 'esPrimoExacto');
    if (n < 2n) return false;
    for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
    // Miller–Rabin con las 12 primeras bases: determinista hasta 3,3·10^24 y
    // con probabilidad de error menor que 4^-12 más allá
    let d = n - 1n, s = 0;
    while ((d & 1n) === 0n) { d >>= 1n; s++; }
    const potMod = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; e >>= 1n; b = b * b % m; } return r; };
    for (const b of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
      let x = potMod(b, d, n);
      if (x === 1n || x === n - 1n) continue;
      let compuesto = true;
      for (let r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) { compuesto = false; break; } }
      if (compuesto) return false;
    }
    return true;
  }, 'esPrimoExacto(potenciaExacta(2, 127) - 1) — si un entero (de cualquier tamaño) es primo (Miller–Rabin)');
  def('cifrasExactas', 'grande -> texto', a => {
    const g = aGrande(a[0], 1, 'cifrasExactas');
    if (!grEsEntero(g)) vm.error('«cifrasExactas»: necesita un entero', 'para decimales: decimalesGrande(g, n)');
    return grAEnteroBig(g).toString();
  }, 'cifrasExactas(factorialExacto(25)) — «15511210043330985984000000»: todas las cifras como texto');
}

if (typeof module !== 'undefined') module.exports = { ObjGrande, grandeArit, grandeCmp, grandeIgual, grATexto, grAReal,
  instalarNenPrecision, instalarNenUnion, reexportarEnNen };
