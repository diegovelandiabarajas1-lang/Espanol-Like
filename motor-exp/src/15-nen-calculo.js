// ============================================================================
//  Ñ v4 — NEÑ, parte «cálculo»: la matemática de pizarra
//  Parte 15.
//
//  Se importa con:  usar "nen"     (o  usar derivar, integrar de "nen")
//
//  Esta parte es lo que se escribe en una pizarra antes de tocar un tensor:
//  derivar, integrar, despejar, minimizar, resolver una ecuación diferencial,
//  jugar con polinomios, las funciones especiales que salen en cualquier libro
//  de física o de estadística, y la teoría de números que cabe en 53 bits.
//
//  QUÉ NO ESTÁ AQUÍ, A PROPÓSITO. El eDSL «numerico» ya tiene factorial,
//  combinaciones, mcd/mcm, esPrimo, primos, regresion lineal, «resolver» de
//  sistemas lineales, LU/QR/SVD, Fourier y el azar sembrable. Nada de eso se
//  repite: cuando una función de aquí lo necesita (la integral de Montecarlo
//  necesita azar), lo PIDE a «numerico» para que «semilla(7)» siga mandando
//  sobre todo el azar del programa.
//
//  DOS CAPAS. Todo el cálculo de verdad vive en tres bloques de JavaScript
//  puro —NEN_CALCULO (cálculo, ecuaciones, optimización), NEN_CALCULO2
//  (EDOs, polinomios, interpolación) y NEN_ESPECIALES (funciones especiales,
//  probabilidad, números)—: reciben funciones de JavaScript y números, y no
//  saben nada de la VM. La
//  segunda capa, «instalarNenCalculo», es la aduana: convierte listas, arreglos
//  y funciones de Ñ en eso, y convierte de vuelta. Separarlo así tiene dos
//  ventajas que se notan: los métodos numéricos se pueden probar sueltos, y el
//  día que C1EÑ quiera uno de ellos no tiene que arrastrar la VM.
//
//  LOS POLINOMIOS son listas de coeficientes EN ORDEN CRECIENTE de potencia:
//      [c0, c1, c2]  es  c0 + c1·x + c2·x²
//  Se eligió así (y no como NumPy, que va de la potencia mayor a la menor)
//  porque entonces el índice ES la potencia: p[2] es el coeficiente de x², y
//  sumar dos polinomios es sumar posición a posición sin alinear por la cola.
// ============================================================================
'use strict';

// Los errores de la capa pura. La aduana los convierte en un «vm.error» con el
// nombre de la función delante; cualquier otro error (por ejemplo, uno que
// lanzó la función de Ñ que se estaba integrando) pasa sin tocarlo.
class ErrorNenCalculo extends Error {
  constructor(mensaje, pista) { super(mensaje); this.pista = pista || null; }
}

const NEN_CALCULO = (function () {
  const EPS = 2.220446049250313e-16;
  const RAIZ_PI = Math.sqrt(Math.PI);
  const LN_RAIZ_2PI = 0.5 * Math.log(2 * Math.PI);
  const falla = (m, p) => { throw new ErrorNenCalculo(m, p); };
  // Un número para un mensaje: seis cifras bastan para reconocerlo.
  const fmt = x => (typeof x !== 'number' ? String(x) : !isFinite(x) ? (isNaN(x) ? 'NaN' : (x > 0 ? 'infinito' : '-infinito'))
    : Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(6))));
  const normaInf = v => { let m = 0; for (const x of v) { const a = Math.abs(x); if (a > m) m = a; } return m; };

  // ══════════════════════════════════════════════════════════════════ CÁLCULO

  // ── Ridders: Richardson sobre una sucesión de pasos ───────────────────────
  // Toda derivada numérica tiene el mismo dilema: con h grande manda el error
  // de truncamiento, con h pequeño manda el redondeo (restar dos números casi
  // iguales). No hay un h bueno para todas las funciones. Ridders no elige uno:
  // calcula la aproximación con h, h/1.4, h/1.4², … y extrapola a h = 0 con la
  // tabla de Richardson, quedándose con la casilla de menor error estimado y
  // parando en cuanto el redondeo empieza a ganar. Da 10–13 cifras donde una
  // diferencia central a pelo da 7–8.
  //
  // «p» es el orden de la expansión del error: 2 para fórmulas centradas (el
  // error solo tiene potencias pares de h) y 1 para las de un solo lado.
  function ridders(estim, h0, p) {
    const CON = 1.4, CONP = Math.pow(CON, p), NTAB = 10, SEGURO = 2;
    let h = h0, a00 = estim(h), intentos = 0;
    // Si en h0 la función no está definida (log cerca de 0, raíz de un
    // negativo), se achica el paso antes de rendirse.
    while (!isFinite(a00) && intentos++ < 12) { h /= 10; a00 = estim(h); }
    if (!isFinite(a00)) return { valor: NaN, error: Infinity };
    const a = [[a00]];
    let err = Infinity, mejor = a00;
    for (let i = 1; i < NTAB; i++) {
      h /= CON;
      a[0][i] = estim(h);
      if (!isFinite(a[0][i])) break;
      let fac = CONP;
      for (let j = 1; j <= i; j++) {
        if (!a[j]) a[j] = [];
        a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
        fac *= CONP;
        const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
        if (errt <= err) { err = errt; mejor = a[j][i]; }
      }
      // Cuando la diagonal empeora de golpe, lo que sigue ya es ruido.
      if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= SEGURO * err) break;
    }
    return { valor: mejor, error: err };
  }
  // La misma tabla para vectores (columnas de un jacobiano): una sola tabla
  // con la norma máxima como error, para no evaluar F una vez por componente.
  function riddersVec(estim, h0) {
    const CON = 1.4, CON2 = CON * CON, NTAB = 10, SEGURO = 2;
    let h = h0, a00 = estim(h), intentos = 0;
    const malo = v => v.some(x => !isFinite(x));
    while (malo(a00) && intentos++ < 12) { h /= 10; a00 = estim(h); }
    if (malo(a00)) return a00.map(() => NaN);
    const a = [[a00]];
    let err = Infinity, mejor = a00;
    const comb = (u, v, fac) => u.map((x, k) => (x * fac - v[k]) / (fac - 1));
    const dist = (u, v) => { let m = 0; for (let k = 0; k < u.length; k++) m = Math.max(m, Math.abs(u[k] - v[k])); return m; };
    for (let i = 1; i < NTAB; i++) {
      h /= CON;
      a[0][i] = estim(h);
      if (malo(a[0][i])) break;
      let fac = CON2;
      for (let j = 1; j <= i; j++) {
        if (!a[j]) a[j] = [];
        a[j][i] = comb(a[j - 1][i], a[j - 1][i - 1], fac);
        fac *= CON2;
        const errt = Math.max(dist(a[j][i], a[j - 1][i]), dist(a[j][i], a[j - 1][i - 1]));
        if (errt <= err) { err = errt; mejor = a[j][i]; }
      }
      if (dist(a[i][i], a[i - 1][i - 1]) >= SEGURO * err) break;
    }
    return mejor;
  }
  // El paso de partida escala con |x|: derivar en x = 10⁶ con h = 0.1 sería
  // pedirle a la resta 13 cifras que no tiene.
  const escala = x => Math.max(1, Math.abs(x));

  function derivar(f, x) {
    const r = ridders(h => (f(x + h) - f(x - h)) / (2 * h), 0.1 * escala(x), 2);
    if (!isFinite(r.valor)) falla(`la función no es derivable (o no está definida) cerca de x = ${fmt(x)}`,
      'mira que la función esté definida a los dos lados del punto');
    return r.valor;
  }
  // Derivada n-ésima: la diferencia central de orden n,
  //     Δⁿf(x)/hⁿ = Σ (−1)ᵏ C(n,k) f(x + (n/2 − k)·h) / hⁿ,
  // que es simétrica y por eso tiene error en h², h⁴…: justo lo que Ridders
  // sabe extrapolar. El paso de partida crece con n porque el redondeo se
  // divide entre hⁿ: con n = 4 y h = 0.01 ya no queda ni una cifra.
  function derivarN(f, x, n) {
    if (n === 0) return f(x);
    if (n === 1) return derivar(f, x);
    const c = [1];
    for (let k = 1; k <= n; k++) c[k] = c[k - 1] * (n - k + 1) / k;
    const est = h => {
      let s = 0;
      for (let k = 0; k <= n; k++) s += (k % 2 ? -1 : 1) * c[k] * f(x + (n / 2 - k) * h);
      return s / Math.pow(h, n);
    };
    const r = ridders(est, (0.1 + 0.15 * n) * escala(x), 2);
    if (!isFinite(r.valor)) falla(`no se pudo derivar ${n} veces cerca de x = ${fmt(x)}`,
      'la función tiene que estar definida y ser suave alrededor del punto');
    return r.valor;
  }
  // Parcial i-ésima de f: Rⁿ → R.
  function parcial(f, x, i) {
    const est = h => {
      const xp = x.slice(), xm = x.slice();
      xp[i] += h; xm[i] -= h;
      return (f(xp) - f(xm)) / (2 * h);
    };
    return ridders(est, 0.1 * escala(x[i]), 2).valor;
  }
  function gradiente(f, x) {
    const g = x.map((_, i) => parcial(f, x, i));
    if (g.some(v => !isFinite(v))) falla('la función no es derivable en ese punto', 'mira que esté definida alrededor del punto');
    return g;
  }
  function jacobiano(F, x) {
    const n = x.length;
    const cols = [];
    let m = -1;
    for (let j = 0; j < n; j++) {
      const est = h => {
        const xp = x.slice(), xm = x.slice();
        xp[j] += h; xm[j] -= h;
        const a = F(xp), b = F(xm);
        if (m < 0) m = a.length;
        return a.map((v, k) => (v - b[k]) / (2 * h));
      };
      cols.push(riddersVec(est, 0.1 * escala(x[j])));
    }
    const J = [];
    for (let i = 0; i < m; i++) J.push(cols.map(c => c[i]));
    if (J.some(f => f.some(v => !isFinite(v)))) falla('la función no es derivable en ese punto', 'mira que esté definida alrededor del punto');
    return J;
  }
  // Hessiano: la diagonal con la segunda diferencia central y lo de fuera con
  // la diferencia cruzada de cuatro puntos; las dos tienen error en h², así
  // que Ridders las mejora igual. Se simetriza al final: la matriz exacta es
  // simétrica y el ruido de una casilla no tiene por qué serlo.
  function hessiano(f, x) {
    const n = x.length;
    const H = [];
    for (let i = 0; i < n; i++) H.push(new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const si = escala(x[i]);
      const f0 = f(x);
      H[i][i] = ridders(h => {
        const xp = x.slice(), xm = x.slice();
        xp[i] += h; xm[i] -= h;
        return (f(xp) - 2 * f0 + f(xm)) / (h * h);
      }, 0.2 * si, 2).valor;
      for (let j = i + 1; j < n; j++) {
        const sj = escala(x[j]);
        const v = ridders(h => {
          const hi = h * si, hj = h * sj;
          const pp = x.slice(), pm = x.slice(), mp = x.slice(), mm = x.slice();
          pp[i] += hi; pp[j] += hj; pm[i] += hi; pm[j] -= hj;
          mp[i] -= hi; mp[j] += hj; mm[i] -= hi; mm[j] -= hj;
          return (f(pp) - f(pm) - f(mp) + f(mm)) / (4 * hi * hj);
        }, 0.2, 2).valor;
        H[i][j] = H[j][i] = v;
      }
    }
    if (H.some(f => f.some(v => !isFinite(v)))) falla('la función no es dos veces derivable en ese punto');
    return H;
  }

  // ── integrales: Gauss–Kronrod 7-15 adaptativo ─────────────────────────────
  // Por qué Gauss–Kronrod y no Simpson: con 15 evaluaciones integra exacto un
  // polinomio de grado 29, y la regla de Gauss de 7 puntos va ANIDADA dentro
  // (comparte los nodos), así que la estimación del error sale gratis. Es la
  // regla de QUADPACK y de scipy.integrate.quad. Ninguno de sus nodos cae en
  // los extremos, y por eso aguanta singularidades integrables en un borde
  // (1/√x en 0) y los cambios de variable que mandan el infinito a t = 1.
  const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
    0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
    0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
    0.207784955007898467600689403773245, 0];
  const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
    0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
    0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
    0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
  const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
    0.381830050505118944950369775488975, 0.417959183673469387755102040816327];
  function gk15(f, a, b) {
    const c = 0.5 * (a + b), hl = 0.5 * (b - a);
    const fc = f(c);
    let resk = fc * WGK[7], resg = fc * WG[3], resabs = Math.abs(resk);
    const f1s = new Array(7), f2s = new Array(7);
    for (let j = 0; j < 7; j++) {
      const dx = hl * XGK[j];
      const f1 = f(c - dx), f2 = f(c + dx);
      f1s[j] = f1; f2s[j] = f2;
      resk += WGK[j] * (f1 + f2);
      resabs += WGK[j] * (Math.abs(f1) + Math.abs(f2));
      if (j % 2 === 1) resg += WG[(j - 1) / 2] * (f1 + f2);
    }
    const media = resk * 0.5;
    let resasc = WGK[7] * Math.abs(fc - media);
    for (let j = 0; j < 7; j++) resasc += WGK[j] * (Math.abs(f1s[j] - media) + Math.abs(f2s[j] - media));
    const ah = Math.abs(hl);
    resasc *= ah; resabs *= ah;
    // La fórmula de QUADPACK para el error: |K − G| a secas es la precisión
    // de la regla de Gauss, mucho peor que la de Kronrod, y sobrestima tanto
    // que obligaría a partir intervalos que ya estaban bien.
    let err = Math.abs((resk - resg) * hl);
    if (resasc !== 0 && err !== 0) err = resasc * Math.min(1, Math.pow(200 * err / resasc, 1.5));
    if (resabs > 1e-290) err = Math.max(50 * EPS * resabs, err);
    return { valor: resk * hl, error: err };
  }
  // Adaptativo GLOBAL: siempre se parte el intervalo con más error, no el
  // primero que falle. Así el trabajo va a donde está la dificultad (el pico,
  // la singularidad) y no se reparte a ciegas.
  function integrarAdapt(f, a, b, rtol, atol, maxSub) {
    const ivs = [Object.assign({ a, b, fin: false }, gk15(f, a, b))];
    let total = ivs[0].valor, err = ivs[0].error;
    while (true) {
      const tol = Math.max(atol, rtol * Math.abs(total));
      if (err <= tol) break;
      if (ivs.length >= maxSub) return { valor: total, error: err, ok: false };
      let k = -1, max = -1;
      for (let i = 0; i < ivs.length; i++) if (!ivs[i].fin && ivs[i].error > max) { max = ivs[i].error; k = i; }
      if (k < 0) return { valor: total, error: err, ok: false };
      const iv = ivs[k];
      const m = 0.5 * (iv.a + iv.b);
      // Un intervalo que ya no se puede partir en coma flotante se da por
      // cerrado: seguir solo repetiría las mismas evaluaciones.
      if (!(m > Math.min(iv.a, iv.b) && m < Math.max(iv.a, iv.b)) ||
          Math.abs(iv.b - iv.a) < 8 * EPS * Math.max(Math.abs(iv.a), Math.abs(iv.b))) { iv.fin = true; continue; }
      const i1 = Object.assign({ a: iv.a, b: m, fin: false }, gk15(f, iv.a, m));
      const i2 = Object.assign({ a: m, b: iv.b, fin: false }, gk15(f, m, iv.b));
      total += i1.valor + i2.valor - iv.valor;
      err += i1.error + i2.error - iv.error;
      ivs[k] = i1; ivs.push(i2);
    }
    // Se suma de nuevo al final: las restas acumuladas arrastran redondeo.
    total = 0; err = 0;
    for (const iv of ivs) { total += iv.valor; err += iv.error; }
    return { valor: total, error: err, ok: true };
  }
  // Los límites infinitos se llevan a un intervalo finito con un cambio de
  // variable, y el jacobiano del cambio va dentro del integrando:
  //   [a, ∞)    x = a + t/(1−t),   dx = dt/(1−t)²,        t ∈ [0, 1)
  //   (−∞, b]   x = b − (1−t)/t,   dx = dt/t²,            t ∈ (0, 1]
  //   (−∞, ∞)   x = t/(1−t²),      dx = (1+t²)/(1−t²)² dt, t ∈ (−1, 1)
  // Gauss–Kronrod nunca evalúa en los extremos, así que t = 1 (x = ∞) no se
  // toca. El precio es que una función que decae despacio (1/x²) se concentra
  // cerca de t = 1, y ahí el adaptativo trabaja más.
  function integrar(f, a, b, opciones) {
    const o = opciones || {};
    const rtol = o.rtol || 1e-10, atol = o.atol || 1e-13, maxSub = o.maxSub || 1000;
    if (isNaN(a) || isNaN(b)) falla('los límites no pueden ser NaN');
    if (a === b) return { valor: 0, error: 0, ok: true };
    if (a > b) { const r = integrar(f, b, a, o); r.valor = -r.valor; return r; }
    const seguro = g => t => {
      const v = g(t);
      if (!isFinite(v)) {
        const x = !isFinite(a) || !isFinite(b) ? '(tras el cambio de variable) t' : 'x';
        falla(`la función vale ${fmt(v)} en ${x} = ${fmt(t)}`,
          'si tiene una singularidad dentro del intervalo, parte la integral en ese punto');
      }
      return v;
    };
    let g, ta, tb;
    if (isFinite(a) && isFinite(b)) { g = f; ta = a; tb = b; }
    else if (isFinite(a)) { g = t => { const u = 1 - t; const v = f(a + t / u); return v === 0 ? 0 : v / (u * u); }; ta = 0; tb = 1; }
    else if (isFinite(b)) { g = t => { const v = f(b - (1 - t) / t); return v === 0 ? 0 : v / (t * t); }; ta = 0; tb = 1; }
    else { g = t => { const u = 1 - t * t; const v = f(t / u); return v === 0 ? 0 : v * (1 + t * t) / (u * u); }; ta = -1; tb = 1; }
    return integrarAdapt(seguro(g), ta, tb, rtol, atol, maxSub);
  }
  // La que ven los usuarios: si no llega a la precisión pedida pero el error
  // es razonable se devuelve igual (es lo que haría cualquiera con la cifra en
  // la mano); si el error es grande, se dice en vez de devolver un número falso.
  function integral(f, a, b) {
    const r = integrar(f, a, b);
    if (!r.ok && r.error > 1e-6 * Math.max(1, Math.abs(r.valor)))
      falla(`la integral no converge: tras partir el intervalo 1000 veces el resultado es ${fmt(r.valor)} ± ${fmt(r.error)}`,
        'puede que la integral diverja (1/x en 0), o que la función oscile o salte; prueba partir el intervalo');
    return r.valor;
  }
  // Integral doble ∫ₐᵇ ∫_{c(x)}^{d(x)} f(x, y) dy dx. Es una integral de
  // integrales: la de dentro, más exigente que la de fuera, porque su error
  // es el ruido que ve la de fuera y con ruido no hay adaptativo que converja.
  function integrarDoble(f, a, b, c, d) {
    const r = integrar(x => {
      const lo = c(x), hi = d(x);
      const ri = integrar(y => f(x, y), lo, hi, { rtol: 1e-11, atol: 1e-14, maxSub: 400 });
      return ri.valor;
    }, a, b, { rtol: 1e-9, atol: 1e-12, maxSub: 400 });
    if (!r.ok && r.error > 1e-6 * Math.max(1, Math.abs(r.valor)))
      falla(`la integral doble no converge: ${fmt(r.valor)} ± ${fmt(r.error)}`, 'mira que la función no tenga singularidades dentro de la región');
    return r.valor;
  }
  // Montecarlo: el valor y su error estándar, que es lo que lo hace útil. El
  // error baja como 1/√n sea cual sea la dimensión —por eso existe—, pero con
  // n = 10⁴ son dos cifras, no diez.
  function integrarMontecarlo(f, lims, n, azar) {
    const d = lims.length;
    let vol = 1;
    for (const [a, b] of lims) vol *= (b - a);
    let s = 0, s2 = 0;
    const x = new Array(d);
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < d; i++) x[i] = lims[i][0] + (lims[i][1] - lims[i][0]) * azar();
      const v = f(x.slice());
      if (!isFinite(v)) falla(`la función vale ${fmt(v)} en el punto [${x.map(fmt).join(', ')}]`);
      s += v; s2 += v * v;
    }
    const media = s / n;
    const varianza = Math.max(0, s2 / n - media * media);
    return { valor: vol * media, error: vol * Math.sqrt(varianza / n) };
  }
  // Datos tabulados: Simpson con espaciado irregular, por parejas de
  // intervalos (la parábola por tres puntos, integrada exacta). Si el número
  // de intervalos es impar, el último se cubre con la MISMA parábola por los
  // tres últimos puntos, integrada solo en su último tramo —es lo que hace
  // scipy—: así todo sigue siendo exacto para cuadráticas.
  function integrarDatos(xs, ys, metodo) {
    const n = xs.length;
    if (n !== ys.length) falla(`hay ${n} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    if (n < 2) falla('hacen falta al menos dos puntos');
    for (let i = 1; i < n; i++) if (!(xs[i] > xs[i - 1])) falla('las x tienen que ir en orden creciente y sin repetirse');
    if (metodo === 'trapecio' || n === 2) {
      let s = 0;
      for (let i = 1; i < n; i++) s += 0.5 * (xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1]);
      return s;
    }
    const h = [];
    for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i]);
    const nint = n - 1;
    const pares = nint % 2 === 0 ? nint : nint - 1;
    let s = 0;
    for (let i = 0; i < pares; i += 2) {
      const h0 = h[i], h1 = h[i + 1], hs = h0 + h1;
      s += hs / 6 * (ys[i] * (2 - h1 / h0) + ys[i + 1] * hs * hs / (h0 * h1) + ys[i + 2] * (2 - h0 / h1));
    }
    if (pares < nint) {
      const h0 = h[n - 3], h1 = h[n - 2];
      const alfa = (2 * h1 * h1 + 3 * h0 * h1) / (6 * (h0 + h1));
      const beta = (h1 * h1 + 3 * h0 * h1) / (6 * h0);
      const eta = h1 * h1 * h1 / (6 * h0 * (h0 + h1));
      s += alfa * ys[n - 1] + beta * ys[n - 2] - eta * ys[n - 3];
    }
    return s;
  }
  function integrarAcumulado(xs, ys) {
    const n = xs.length;
    if (n !== ys.length) falla(`hay ${n} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    const out = [0];
    for (let i = 1; i < n; i++) {
      if (!(xs[i] > xs[i - 1])) falla('las x tienen que ir en orden creciente y sin repetirse');
      out.push(out[i - 1] + 0.5 * (xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1]));
    }
    return out;
  }
  // Derivada de datos: centrada de segundo orden con espaciado irregular por
  // dentro y fórmulas de un lado, también de segundo orden, en los bordes. Es
  // numpy.gradient con edge_order=2: exacta para parábolas en todos lados.
  function derivarDatos(xs, ys) {
    const n = xs.length;
    if (n !== ys.length) falla(`hay ${n} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    if (n < 3) falla('hacen falta al menos tres puntos para derivar con segundo orden');
    for (let i = 1; i < n; i++) if (!(xs[i] > xs[i - 1])) falla('las x tienen que ir en orden creciente y sin repetirse');
    const d = new Array(n);
    for (let i = 1; i < n - 1; i++) {
      const a = xs[i] - xs[i - 1], b = xs[i + 1] - xs[i];
      d[i] = (a * a * ys[i + 1] - b * b * ys[i - 1] + (b * b - a * a) * ys[i]) / (a * b * (a + b));
    }
    let a = xs[1] - xs[0], b = xs[2] - xs[1];
    d[0] = -(2 * a + b) / (a * (a + b)) * ys[0] + (a + b) / (a * b) * ys[1] - a / (b * (a + b)) * ys[2];
    a = xs[n - 2] - xs[n - 3]; b = xs[n - 1] - xs[n - 2];
    d[n - 1] = b / (a * (a + b)) * ys[n - 3] - (a + b) / (a * b) * ys[n - 2] + (2 * b + a) / (b * (a + b)) * ys[n - 1];
    return d;
  }

  // ── series: transformada u de Levin ───────────────────────────────────────
  // Sumar términos hasta que sean pequeños funciona con 1/2ᵏ y fracasa con
  // 1/k²: para 10 cifras harían falta 10¹⁰ términos. La transformada u de
  // Levin estima la cola a partir de cómo decrecen los términos, y converge
  // tanto con series alternadas como con las de convergencia lenta
  // («logarítmica») en unas decenas de términos. Se para cuando dos
  // estimaciones seguidas coinciden; Levin se vuelve inestable pasados unos
  // sesenta términos, así que ahí se deja de alimentar y se sigue solo con la
  // suma directa, por si es de las que convergen a lo bruto.
  function sumaSerie(term, desde) {
    // Levin se alimenta con los primeros 40 términos. Pasado eso, en series
    // lentas el redondeo se come la extrapolación (se probó: con 1/k² da 11
    // cifras hacia el término 12 y ninguna hacia el 30).
    const NMAX_LEVIN = 40, NMAX = 20000, BETA = 1;
    const num = [], den = [];
    let nL = 0, ultimo = NaN, cuentaConv = 0, mejor = NaN, mejorDif = Infinity;
    let S = 0, pequenos = 0, primero = NaN;
    for (let k = 0; k < NMAX; k++) {
      const a = term(desde + k);
      if (!isFinite(a)) falla(`el término ${desde + k} vale ${fmt(a)}`);
      if (k === 0) primero = Math.abs(a);
      S += a;
      if (!isFinite(S)) falla('la suma se desborda: la serie diverge');
      // Convergencia a lo bruto: varios términos seguidos que ya no mueven la suma.
      if (Math.abs(a) <= EPS * Math.abs(S) || a === 0) { if (++pequenos >= 4) return S; } else pequenos = 0;
      if (nL < NMAX_LEVIN && a !== 0) {
        const omega = (BETA + nL) * a;
        let t = 1 / (BETA + nL);
        den[nL] = t / omega;
        num[nL] = S * den[nL];
        if (nL > 0) {
          const r = (BETA + nL - 1) * t;
          for (let j = 1; j <= nL; j++) {
            const fact = (nL - j + BETA) * t;
            num[nL - j] = num[nL - j + 1] - fact * num[nL - j];
            den[nL - j] = den[nL - j + 1] - fact * den[nL - j];
            t *= r;
          }
        }
        nL++;
        const v = Math.abs(den[0]) < 1e-300 ? NaN : num[0] / den[0];   // degenerada: sin estimación
        if (nL > 3 && isFinite(v) && isFinite(ultimo)) {
          const dif = Math.abs(v - ultimo);
          if (dif < mejorDif) { mejorDif = dif; mejor = v; }
          if (dif <= 1e-13 * Math.max(1, Math.abs(v))) { if (++cuentaConv >= 2 && Math.abs(a) < primero) return v; } else cuentaConv = 0;
        } else cuentaConv = 0;
        ultimo = v;
        // Fin de la zona útil de Levin: se acepta su mejor estimación si dos
        // seguidas coincidían en 9 cifras Y los términos de verdad iban a cero
        // (sin esto, Levin «suma» series divergentes como 1 − 2 + 3 − 4…).
        if (nL === NMAX_LEVIN && mejorDif <= 1e-9 * Math.max(1, Math.abs(mejor)) && Math.abs(a) < 0.1 * primero) return mejor;
      }
    }
    falla(`la serie no converge (o converge demasiado despacio): tras ${NMAX} términos la suma va por ${fmt(S)}`,
      'mira que los términos tiendan a cero lo bastante rápido; Σ 1/k, por ejemplo, diverge');
  }

  // ── límites ───────────────────────────────────────────────────────────────
  // Se evalúa f en x ± h para h cada vez más pequeño y se extrapola a h = 0
  // con la misma tabla de Ridders, ahora con error en TODAS las potencias de
  // h (p = 1), porque a un solo lado no hay simetría que anule las impares.
  // Nunca se evalúa en el punto mismo: ahí es donde suele estar el 0/0.
  // Hacia el infinito se cambia x por 1/t y se mira t → 0⁺.
  function limiteLado(f, x0, s) {
    let g, h0;
    if (x0 === Infinity) { g = t => f(1 / t); h0 = 0.1; }
    else if (x0 === -Infinity) { g = t => f(-1 / t); h0 = 0.1; }
    else { g = h => f(x0 + s * h); h0 = 0.1 * escala(x0); }
    return ridders(g, h0, 1);
  }
  function limite(f, x0, lado) {
    const malo = r => !isFinite(r.valor) || Math.abs(r.valor) > 1e12 || r.error > 1e-5 * Math.max(1, Math.abs(r.valor));
    const noExiste = 'el límite no parece existir: la función crece sin cota u oscila cerca del punto';
    if (!isFinite(x0) || lado === 'derecha' || lado === 'izquierda') {
      const r = limiteLado(f, x0, lado === 'izquierda' ? -1 : 1);
      if (malo(r)) falla(noExiste);
      return r.valor;
    }
    const i = limiteLado(f, x0, -1), d = limiteLado(f, x0, 1);
    if (malo(i) || malo(d)) {
      if (!malo(i) || !malo(d)) falla(`el límite por un lado existe y por el otro no`, 'pide uno solo con limite(f, x, "derecha") o "izquierda"');
      falla(noExiste);
    }
    if (Math.abs(i.valor - d.valor) > 1e-7 * Math.max(1, Math.abs(d.valor)) + 10 * (i.error + d.error))
      falla(`los límites laterales no coinciden: por la izquierda tiende a ${fmt(i.valor)} y por la derecha a ${fmt(d.valor)}`,
        'pide uno solo con limite(f, x, "derecha") o "izquierda"');
    return i.error < d.error ? i.valor : d.valor;
  }

  // ════════════════════════════════════════════════════════════════ ECUACIONES

  // Brent: la seguridad de la bisección (nunca sale del intervalo y siempre lo
  // achica) con la velocidad de la interpolación cuadrática inversa cuando la
  // función se deja. Es el método que usan fzero de MATLAB y brentq de scipy.
  // Exige un cambio de signo porque es lo que GARANTIZA que haya raíz.
  function raizBrent(f, a, b) {
    let fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb)) falla(`la función no está definida en un extremo: f(${fmt(a)}) = ${fmt(fa)}, f(${fmt(b)}) = ${fmt(fb)}`);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if ((fa > 0) === (fb > 0))
      falla(`en [${fmt(a)}, ${fmt(b)}] la función no cambia de signo: f(${fmt(a)}) = ${fmt(fa)} y f(${fmt(b)}) = ${fmt(fb)}`,
        'elige un intervalo donde pase de positiva a negativa (o al revés), o usa raizNewton con un punto de partida');
    const tol = 1e-300;
    let c = b, fc = fb, d = b - a, e = d;
    for (let it = 0; it < 300; it++) {
      if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) { c = a; fc = fa; e = d = b - a; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol, xm = 0.5 * (c - b);
      if (Math.abs(xm) <= tol1 || fb === 0) return b;
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        const s = fb / fa;
        let p, q;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          const qq = fa / fc, r = fb / fc;
          p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
          q = (qq - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        const min1 = 3 * xm * q - Math.abs(tol1 * q), min2 = Math.abs(e * q);
        if (2 * p < Math.min(min1, min2)) { e = d; d = p / q; } else { d = xm; e = d; }
      } else { d = xm; e = d; }
      a = b; fa = fb;
      b += Math.abs(d) > tol1 ? d : (xm >= 0 ? tol1 : -tol1);
      fb = f(b);
      if (!isFinite(fb)) falla(`la función no está definida en x = ${fmt(b)}, dentro del intervalo`);
    }
    falla('no converge en 300 iteraciones', 'la función puede ser discontinua en el intervalo');
  }
  // Newton con derivada numérica y AMORTIGUADO: si un paso empeora |f|, se
  // parte a la mitad. Sin esto, un arranque lejos de la raíz (arctan desde
  // x = 2) sale disparado y diverge.
  function raizNewton(f, x0, df) {
    let x = x0, fx = f(x);
    if (!isFinite(fx)) falla(`la función no está definida en el punto de partida x = ${fmt(x0)}`);
    for (let it = 0; it < 100; it++) {
      if (fx === 0) return x;
      let d;
      if (df) d = df(x);
      else { const h = 6e-6 * escala(x); d = (f(x + h) - f(x - h)) / (2 * h); }
      if (d === 0 || !isFinite(d))
        falla(`la derivada se anula (o no existe) en x = ${fmt(x)}`, 'prueba otro punto de partida, o resolverEcuacion con un intervalo');
      const paso = fx / d;
      let lam = 1, xn = x - paso, fn = f(xn);
      for (let k = 0; k < 40 && !(isFinite(fn) && Math.abs(fn) < Math.abs(fx)); k++) { lam /= 2; xn = x - lam * paso; fn = f(xn); }
      if (!(isFinite(fn) && Math.abs(fn) < Math.abs(fx))) {
        // Ya no se puede bajar |f|: o estamos en la raíz hasta el redondeo, o atascados.
        if (Math.abs(paso) <= 1e-9 * escala(x)) return x;
        falla(`se atascó en x = ${fmt(x)} con f(x) = ${fmt(fx)}`, 'puede que no haya raíz cerca; prueba otro punto de partida');
      }
      const dx = Math.abs(xn - x);
      x = xn; fx = fn;
      if (dx <= 4 * EPS * escala(x)) return x;
    }
    if (Math.abs(fx) < 1e-10) return x;
    falla(`no converge en 100 iteraciones; va por x = ${fmt(x)} con f(x) = ${fmt(fx)}`, 'prueba otro punto de partida');
  }

  // ── raíces de polinomios: Aberth–Ehrlich ───────────────────────────────────
  // Busca TODAS las raíces a la vez, complejas incluidas. Cada aproximación se
  // corrige con Newton y además se aparta de las demás (el término Σ 1/(zᵢ−zⱼ)),
  // y por eso no convergen dos a la misma raíz. Converge con orden 3 en
  // raíces simples; en una raíz de multiplicidad k la precisión cae a unas
  // 16/k cifras —eso es del problema, no del método: la raíz doble de (x−1)²
  // se mueve √ε cuando el coeficiente se mueve ε—.
  function raicesPoli(coef) {
    let n = coef.length - 1;
    while (n > 0 && coef[n] === 0) n--;
    if (n < 1) falla('un polinomio constante no tiene raíces que buscar', 'la lista va de la potencia 0 hacia arriba: [c0, c1, c2] es c0 + c1·x + c2·x²');
    let ceros = 0;
    while (coef[ceros] === 0) ceros++;
    const a = coef.slice(ceros, n + 1);      // a[0] ≠ 0 y a[m] ≠ 0
    const m = a.length - 1;
    const re = [], im = [];
    for (let i = 0; i < ceros; i++) { re.push(0); im.push(0); }
    if (m === 0) return { re, im };
    // Punto de partida: un círculo con el radio de la media geométrica de las
    // raíces (|a0/am|^(1/m)), con un desfase para no caer en simetrías.
    const r0 = Math.pow(Math.abs(a[0] / a[m]), 1 / m);
    const zr = [], zi = [];
    for (let k = 0; k < m; k++) { const t = 2 * Math.PI * k / m + 0.4; zr.push(r0 * Math.cos(t)); zi.push(r0 * Math.sin(t)); }
    const listo = new Array(m).fill(false);
    for (let it = 0; it < 500; it++) {
      let todos = true;
      for (let i = 0; i < m; i++) {
        if (listo[i]) continue;
        // p(z) y p'(z) por Horner, en complejos.
        let pr = a[m], pi = 0, dr = 0, di = 0;
        for (let k = m - 1; k >= 0; k--) {
          const ndr = dr * zr[i] - di * zi[i] + pr, ndi = dr * zi[i] + di * zr[i] + pi;
          dr = ndr; di = ndi;
          const npr = pr * zr[i] - pi * zi[i] + a[k], npi = pr * zi[i] + pi * zr[i];
          pr = npr; pi = npi;
        }
        if (pr === 0 && pi === 0) { listo[i] = true; continue; }
        // cociente = p/p'
        const dd = dr * dr + di * di;
        let qr, qi;
        if (dd === 0) { qr = 1e-8 * escala(zr[i]); qi = 0; }
        else { qr = (pr * dr + pi * di) / dd; qi = (pi * dr - pr * di) / dd; }
        // suma = Σ 1/(zi − zj)
        let sr = 0, si = 0;
        for (let j = 0; j < m; j++) {
          if (j === i) continue;
          const xr = zr[i] - zr[j], xi = zi[i] - zi[j];
          const d2 = xr * xr + xi * xi;
          if (d2 === 0) continue;
          sr += xr / d2; si += -xi / d2;
        }
        // w = q / (1 − q·s)
        const br = 1 - (qr * sr - qi * si), bi = -(qr * si + qi * sr);
        const b2 = br * br + bi * bi;
        const wr = (qr * br + qi * bi) / b2, wi = (qi * br - qr * bi) / b2;
        zr[i] -= wr; zi[i] -= wi;
        const mag = Math.hypot(zr[i], zi[i]);
        if (Math.hypot(wr, wi) <= 2 * EPS * Math.max(mag, 1e-300)) listo[i] = true;
        else todos = false;
      }
      if (todos) break;
    }
    // Limpieza: una parte imaginaria al nivel del redondeo es un real.
    for (let i = 0; i < m; i++) {
      if (Math.abs(zi[i]) <= 1e-12 * Math.max(1, Math.hypot(zr[i], zi[i]))) zi[i] = 0;
      re.push(zr[i]); im.push(zi[i]);
    }
    const orden = re.map((_, k) => k).sort((p, q) => (re[p] - re[q]) || (im[p] - im[q]));
    return { re: orden.map(k => re[k]), im: orden.map(k => im[k]) };
  }
  // Las reales: las que tienen parte imaginaria despreciable, pulidas con
  // Newton real. La tolerancia es generosa (10⁻⁷) para no perder las raíces
  // dobles, que Aberth solo puede dar con la mitad de las cifras.
  function raicesRealesPoli(coef) {
    const r = raicesPoli(coef);
    const out = [];
    for (let k = 0; k < r.re.length; k++) {
      if (Math.abs(r.im[k]) > 1e-7 * Math.max(1, Math.abs(r.re[k]))) continue;
      let x = r.re[k];
      for (let it = 0; it < 3; it++) {
        let p = 0, dp = 0;
        for (let j = coef.length - 1; j >= 0; j--) { dp = dp * x + p; p = p * x + coef[j]; }
        if (dp === 0 || p === 0) break;
        const xn = x - p / dp;
        if (Math.abs(xn - x) > 1e-6 * Math.max(1, Math.abs(x))) break;   // no saltar a otra raíz
        x = xn;
      }
      out.push(x);
    }
    return out.sort((p, q) => p - q);
  }

  // ── sistemas no lineales: Newton con búsqueda lineal ──────────────────────
  // Eliminación gaussiana con pivoteo parcial, la pieza que necesitan Newton,
  // Levenberg–Marquardt y BFGS para sistemas pequeños. Devuelve null si la
  // matriz es singular, y quien llama decide qué mensaje dar.
  function resolverLineal(A, b) {
    const n = b.length;
    const M = A.map((f, i) => f.slice().concat([b[i]]));
    let escalaM = 0;
    for (const f of A) for (const v of f) escalaM = Math.max(escalaM, Math.abs(v));
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      if (Math.abs(M[p][k]) <= 1e-14 * escalaM || escalaM === 0) return null;
      if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; }
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        if (f === 0) continue;
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }
  // El jacobiano para Newton va con diferencias centrales de paso fijo
  // (h ≈ ε^⅓): Ridders costaría diez veces más y Newton no lo necesita, porque
  // un jacobiano con 10 cifras ya da convergencia casi cuadrática.
  function jacobianoRapido(F, x, Fx) {
    const n = x.length, m = Fx.length;
    const J = [];
    for (let i = 0; i < m; i++) J.push(new Array(n));
    for (let j = 0; j < n; j++) {
      const h = 6e-6 * escala(x[j]);
      const xp = x.slice(), xm = x.slice();
      xp[j] += h; xm[j] -= h;
      const a = F(xp), b = F(xm);
      for (let i = 0; i < m; i++) J[i][j] = (a[i] - b[i]) / (2 * h);
    }
    return J;
  }
  function resolverNoLineal(F, x0) {
    let x = x0.slice(), Fx = F(x);
    const n = x.length;
    if (Fx.length !== n) falla(`la función recibe ${n} incógnitas y devuelve ${Fx.length} ecuaciones: tienen que ser tantas ecuaciones como incógnitas`);
    const mitad = v => 0.5 * v.reduce((s, y) => s + y * y, 0);
    let fx = mitad(Fx);
    for (let it = 0; it < 200; it++) {
      if (normaInf(Fx) <= 1e-13) return x;
      const J = jacobianoRapido(F, x, Fx);
      const dx = resolverLineal(J, Fx.map(v => -v));
      if (!dx) falla(`el jacobiano es singular en [${x.map(fmt).join(', ')}]`, 'prueba otro punto de partida; puede que dos ecuaciones digan lo mismo');
      // Búsqueda lineal hacia atrás sobre ½|F|²: el paso de Newton es una
      // dirección de descenso, así que con λ pequeño SIEMPRE baja. Es lo que
      // convierte a Newton, que solo converge cerca, en algo que arranca lejos.
      let lam = 1, xn, Fn, fn;
      for (let k = 0; k < 50; k++) {
        xn = x.map((v, i) => v + lam * dx[i]);
        Fn = F(xn); fn = mitad(Fn);
        if (isFinite(fn) && fn <= (1 - 1e-4 * lam) * fx) break;
        lam /= 2;
      }
      if (!(isFinite(fn) && fn < fx)) {
        if (normaInf(Fx) <= 1e-9 * Math.max(1, normaInf(x))) return x;
        falla(`se atascó en [${x.map(fmt).join(', ')}], donde |F| = ${fmt(Math.sqrt(2 * fx))}`,
          'es un mínimo local de |F| que no es solución; prueba otro punto de partida');
      }
      const paso = normaInf(xn.map((v, i) => v - x[i]));
      x = xn; Fx = Fn; fx = fn;
      if (paso <= 4 * EPS * Math.max(1, normaInf(x)) && normaInf(Fx) <= 1e-8) return x;
    }
    if (normaInf(Fx) <= 1e-9) return x;
    falla(`no converge en 200 iteraciones; |F| va por ${fmt(Math.sqrt(2 * fx))}`, 'prueba otro punto de partida');
  }
  function puntoFijo(g, x0) {
    let x = x0.slice();
    for (let it = 0; it < 10000; it++) {
      const xn = g(x);
      if (xn.length !== x.length) falla('la función tiene que devolver tantos valores como recibe');
      if (xn.some(v => !isFinite(v))) falla(`la iteración diverge: en la vuelta ${it + 1} sale ${fmt(xn.find(v => !isFinite(v)))}`,
        'el punto fijo solo atrae si |g\'(x)| < 1 cerca de él; despeja la ecuación de otra forma');
      const d = normaInf(xn.map((v, i) => v - x[i]));
      x = xn;
      if (d <= 4 * EPS * Math.max(1, normaInf(x))) return x;
    }
    falla('no converge en 10000 iteraciones', 'el punto fijo solo atrae si |g\'(x)| < 1 cerca de él; despeja la ecuación de otra forma');
  }

  // ══════════════════════════════════════════════════════════════ OPTIMIZACIÓN

  // Brent para minimizar en un intervalo: sección áurea (segura, lenta) más
  // interpolación parabólica (rápida cerca del mínimo). La precisión en x no
  // pasa de √ε ≈ 1.5·10⁻⁸ relativo, y no es culpa del método: cerca de un
  // mínimo f(x) es plana y f(x ± δ) − f(x) ≈ δ², que se pierde en el redondeo
  // en cuanto δ < √ε. Se miran también los extremos, porque Brent no los toca.
  function minimizar1D(f, a, b) {
    if (a > b) { const t = a; a = b; b = t; }
    const C = (3 - Math.sqrt(5)) / 2, SQ = Math.sqrt(EPS), tol = 1e-12;
    let x = a + C * (b - a), w = x, v = x, fx = f(x), fw = fx, fv = fx, d = 0, e = 0;
    const lo0 = a, hi0 = b;
    for (let it = 0; it < 500; it++) {
      const xm = 0.5 * (a + b), tol1 = SQ * Math.abs(x) + tol / 3, tol2 = 2 * tol1;
      if (Math.abs(x - xm) <= tol2 - 0.5 * (b - a)) break;
      let usarAurea = true;
      if (Math.abs(e) > tol1) {
        let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
        q = 2 * (q - r);
        if (q > 0) p = -p;
        q = Math.abs(q);
        const etemp = e;
        e = d;
        if (!(Math.abs(p) >= Math.abs(0.5 * q * etemp) || p <= q * (a - x) || p >= q * (b - x))) {
          d = p / q;
          const u = x + d;
          if (u - a < tol2 || b - u < tol2) d = xm - x >= 0 ? tol1 : -tol1;
          usarAurea = false;
        }
      }
      if (usarAurea) { e = (x < xm ? b : a) - x; d = C * e; }
      const u = x + (Math.abs(d) >= tol1 ? d : (d >= 0 ? tol1 : -tol1));
      const fu = f(u);
      if (fu <= fx) {
        if (u < x) b = x; else a = x;
        v = w; fv = fw; w = x; fw = fx; x = u; fx = fu;
      } else {
        if (u < x) a = u; else b = u;
        if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; }
        else if (fu <= fv || v === x || v === w) { v = u; fv = fu; }
      }
    }
    const fa = f(lo0), fb = f(hi0);
    if (fa < fx) { x = lo0; fx = fa; }
    if (fb < fx) { x = hi0; fx = fb; }
    return { x, valor: fx };
  }
  // Nelder–Mead con los coeficientes adaptativos de Gao y Han (2012): los
  // clásicos (1, 2, ½, ½) se estancan a partir de unas 10 dimensiones; estos
  // dependen de n y no. No necesita derivadas, que es su razón de ser: vale
  // para funciones con ruido o con esquinas. Se reinicia una vez desde el
  // mínimo hallado, porque el símplex a veces se aplasta antes de tiempo.
  function nelderMead(f, x0) {
    const n = x0.length;
    const alfa = 1, gam = 1 + 2 / n, rho = 0.75 - 1 / (2 * n), sig = 1 - 1 / n;
    let evals = 0;
    const F = x => { evals++; const v = f(x); return isFinite(v) ? v : Infinity; };
    const correr = inicio => {
      let S = [inicio.slice()];
      for (let i = 0; i < n; i++) {
        const y = inicio.slice();
        y[i] = y[i] !== 0 ? y[i] * 1.05 : 0.00025;
        S.push(y);
      }
      let fS = S.map(F);
      let it = 0;
      for (; it < 2000 * n; it++) {
        const ord = fS.map((_, k) => k).sort((p, q) => fS[p] - fS[q]);
        S = ord.map(k => S[k]); fS = ord.map(k => fS[k]);
        let dx = 0;
        for (let k = 1; k <= n; k++) for (let i = 0; i < n; i++) dx = Math.max(dx, Math.abs(S[k][i] - S[0][i]));
        const df = Math.abs(fS[n] - fS[0]);
        if (dx <= 1e-11 * Math.max(1, normaInf(S[0])) && df <= 1e-14 * Math.max(1, Math.abs(fS[0]))) break;
        if (evals > 20000 * n) break;
        const c = new Array(n).fill(0);
        for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) c[i] += S[k][i] / n;
        const xr = c.map((v, i) => v + alfa * (v - S[n][i])), fr = F(xr);
        if (fr < fS[0]) {
          const xe = c.map((v, i) => v + gam * (xr[i] - v)), fe = F(xe);
          if (fe < fr) { S[n] = xe; fS[n] = fe; } else { S[n] = xr; fS[n] = fr; }
        } else if (fr < fS[n - 1]) { S[n] = xr; fS[n] = fr; }
        else {
          const fuera = fr < fS[n];
          const xc = fuera ? c.map((v, i) => v + rho * (xr[i] - v)) : c.map((v, i) => v + rho * (S[n][i] - v));
          const fc = F(xc);
          if (fc < (fuera ? fr : fS[n])) { S[n] = xc; fS[n] = fc; }
          else {
            for (let k = 1; k <= n; k++) { S[k] = S[k].map((v, i) => S[0][i] + sig * (v - S[0][i])); fS[k] = F(S[k]); }
          }
        }
      }
      let b = 0;
      for (let k = 1; k <= n; k++) if (fS[k] < fS[b]) b = k;
      return { x: S[b], valor: fS[b], it };
    };
    let r = correr(x0.slice());
    const r2 = correr(r.x);
    if (r2.valor <= r.valor) r = { x: r2.x, valor: r2.valor, it: r.it + r2.it };
    if (!isFinite(r.valor)) falla('la función no tiene un valor finito en ningún punto que se probó', 'mira el punto de partida');
    return { x: r.x, valor: r.valor, iteraciones: r.it };
  }
  function gradienteRapido(f, x) {
    return x.map((_, i) => {
      const h = 6e-6 * escala(x[i]);
      const xp = x.slice(), xm = x.slice();
      xp[i] += h; xm[i] -= h;
      return (f(xp) - f(xm)) / (2 * h);
    });
  }
  // BFGS: cuasi-Newton. Va aprendiendo la inversa del hessiano con los
  // gradientes de cada paso, sin calcularlo nunca, y converge superlinealmente
  // en funciones suaves. Usa el gradiente numérico central si no se le da uno.
  // La búsqueda lineal es de retroceso con Armijo: la más simple que garantiza
  // descenso; si la curvatura sale mala (sᵀy ≤ 0) la actualización se salta.
  function bfgs(f, x0, gradF) {
    const n = x0.length;
    const grad = gradF || (x => gradienteRapido(f, x));
    let x = x0.slice(), fx = f(x), g = grad(x);
    if (!isFinite(fx)) falla('la función no es finita en el punto de partida');
    let H = null;
    const ident = () => { const M = []; for (let i = 0; i < n; i++) { M.push(new Array(n).fill(0)); M[i][i] = 1; } return M; };
    H = ident();
    let it = 0, reinicio = false;
    for (; it < 1000; it++) {
      if (normaInf(g) <= 1e-9 * Math.max(1, Math.abs(fx))) break;
      let p = H.map(f => -f.reduce((s, v, j) => s + v * g[j], 0));
      let gp = p.reduce((s, v, i) => s + v * g[i], 0);
      if (!(gp < 0)) { H = ident(); p = g.map(v => -v); gp = -g.reduce((s, v) => s + v * v, 0); }
      let a = 1, xn, fn, ok = false;
      for (let k = 0; k < 60; k++) {
        xn = x.map((v, i) => v + a * p[i]);
        fn = f(xn);
        if (isFinite(fn) && fn <= fx + 1e-4 * a * gp) { ok = true; break; }
        a *= 0.5;
      }
      if (!ok) {
        if (reinicio) break;           // ni con descenso puro: es lo mejor que hay
        H = ident(); reinicio = true; continue;
      }
      reinicio = false;
      const s = xn.map((v, i) => v - x[i]);
      const gn = grad(xn);
      const y = gn.map((v, i) => v - g[i]);
      const sy = s.reduce((t, v, i) => t + v * y[i], 0);
      const df = fx - fn;
      x = xn; fx = fn; g = gn;
      if (sy > 1e-12 * Math.sqrt(s.reduce((t, v) => t + v * v, 0) * y.reduce((t, v) => t + v * v, 0))) {
        if (it === 0) {
          // Primera vuelta: se escala la identidad con sᵀy/yᵀy para que el
          // primer paso cuasi-Newton tenga el tamaño correcto.
          const yy = y.reduce((t, v) => t + v * v, 0);
          H = ident().map(f => f.map(v => v * sy / yy));
        }
        const rho = 1 / sy;
        const Hy = H.map(f => f.reduce((t, v, j) => t + v * y[j], 0));
        const yHy = y.reduce((t, v, i) => t + v * Hy[i], 0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
          H[i][j] += -rho * (Hy[i] * s[j] + s[i] * Hy[j]) + (rho * rho * yHy + rho) * s[i] * s[j];
      }
      if (normaInf(s) <= 1e-15 * Math.max(1, normaInf(x)) && Math.abs(df) <= 1e-16 * Math.max(1, Math.abs(fx))) break;
    }
    return { x, valor: fx, iteraciones: it };
  }
  // Levenberg–Marquardt: mínimos cuadrados no lineales. Es Gauss–Newton
  // (rápido cerca de la solución) con un amortiguamiento μ que lo convierte en
  // descenso por gradiente cuando el paso no ayuda. μ se ajusta con la regla de
  // Nielsen, según cuánto se parecía la bajada real a la que predecía el
  // modelo lineal. Además de los parámetros devuelve su error estándar,
  // √diag(s²·(JᵀJ)⁻¹), que es lo que separa un ajuste de un número cualquiera.
  function levenbergMarquardt(modelo, xs, ys, p0) {
    const m = xs.length, n = p0.length;
    if (ys.length !== m) falla(`hay ${m} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    if (m < n) falla(`con ${m} datos no se pueden ajustar ${n} parámetros`, 'hacen falta al menos tantos datos como parámetros');
    const res = p => xs.map((x, i) => ys[i] - modelo(x, p));
    const jac = p => {
      const J = [];
      for (let i = 0; i < m; i++) J.push(new Array(n));
      for (let j = 0; j < n; j++) {
        const h = 1.5e-8 * Math.max(Math.abs(p[j]), 1e-3);
        const pp = p.slice(); pp[j] += h;
        for (let i = 0; i < m; i++) J[i][j] = (modelo(xs[i], pp) - modelo(xs[i], p)) / h;
      }
      return J;
    };
    let p = p0.slice(), r = res(p);
    if (r.some(v => !isFinite(v))) falla('el modelo no da un número finito con los parámetros de partida', 'cambia los parámetros iniciales');
    let S = r.reduce((s, v) => s + v * v, 0);
    let J = jac(p);
    const JtJ = J => { const A = []; for (let a = 0; a < n; a++) { A.push(new Array(n).fill(0)); for (let b = 0; b < n; b++) for (let i = 0; i < m; i++) A[a][b] += J[i][a] * J[i][b]; } return A; };
    const Jtr = (J, r) => { const g = new Array(n).fill(0); for (let a = 0; a < n; a++) for (let i = 0; i < m; i++) g[a] += J[i][a] * r[i]; return g; };
    let A = JtJ(J), g = Jtr(J, r);
    let mu = 1e-3 * Math.max(...A.map((f, i) => f[i])), nu = 2;
    if (!(mu > 0)) mu = 1e-3;
    let it = 0;
    for (; it < 500; it++) {
      if (normaInf(g) <= 1e-15 * Math.max(1, S)) break;
      const Am = A.map((f, i) => f.map((v, j) => (i === j ? v + mu : v)));
      const d = resolverLineal(Am, g);
      if (!d) { mu *= nu; nu *= 2; continue; }
      if (normaInf(d) <= 1e-14 * (normaInf(p) + 1e-14)) break;
      const pn = p.map((v, i) => v + d[i]);
      const rn = res(pn);
      const Sn = rn.reduce((s, v) => s + (isFinite(v) ? v * v : Infinity), 0);
      const pred = d.reduce((s, v, i) => s + v * (mu * v + g[i]), 0);
      const rho = (S - Sn) / pred;
      if (isFinite(Sn) && rho > 0) {
        const bajada = S - Sn;
        p = pn; r = rn; S = Sn; J = jac(p); A = JtJ(J); g = Jtr(J, r);
        mu *= Math.max(1 / 3, 1 - Math.pow(2 * rho - 1, 3)); nu = 2;
        if (bajada <= 1e-15 * Math.max(S, 1e-300)) break;
      } else { mu *= nu; nu *= 2; if (mu > 1e300) break; }
    }
    const libres = m - n;
    let errores = new Array(n).fill(NaN);
    if (libres > 0) {
      const s2 = S / libres;
      const cov = [];
      for (let j = 0; j < n; j++) {
        const e = new Array(n).fill(0); e[j] = 1;
        const col = resolverLineal(A, e);
        if (!col) { cov.length = 0; break; }
        cov.push(col);
      }
      if (cov.length) errores = cov.map((c, j) => Math.sqrt(Math.max(0, s2 * c[j])));
    }
    return { parametros: p, errores, residuo: S, rmse: Math.sqrt(S / m), iteraciones: it };
  }
  // Símplex en dos fases, con la regla de Bland (el menor índice que mejora,
  // el menor índice en los empates). Bland es más lento que el criterio de
  // Dantzig pero no CICLA nunca, y en problemas de pizarra (decenas de
  // variables) la velocidad no importa y un ciclo infinito sí.
  //   minimizar cᵀx   sujeto a   A·x ≤ b,  x ≥ 0
  // Las b negativas (restricciones del tipo «≥») se resuelven con la fase 1,
  // que busca un punto factible con variables artificiales.
  function simplex(c, A, b, maximizar) {
    const m = A.length, n = c.length;
    for (const f of A) if (f.length !== n) falla(`cada fila de A tiene que tener ${n} coeficientes, uno por variable`);
    if (b.length !== m) falla(`A tiene ${m} filas y b tiene ${b.length} valores`, 'una cota por restricción');
    const cc = maximizar ? c.map(v => -v) : c.slice();
    const artificiales = [];
    for (let i = 0; i < m; i++) if (b[i] < 0) artificiales.push(i);
    const N = n + m + artificiales.length;     // originales, holguras, artificiales
    const T = [], base = [];
    for (let i = 0; i < m; i++) {
      const fila = new Array(N + 1).fill(0);
      const sg = b[i] < 0 ? -1 : 1;
      for (let j = 0; j < n; j++) fila[j] = sg * A[i][j];
      fila[n + i] = sg;                       // holgura (o exceso, si se dio la vuelta)
      fila[N] = sg * b[i];
      const k = artificiales.indexOf(i);
      if (k >= 0) { fila[n + m + k] = 1; base.push(n + m + k); } else base.push(n + i);
      T.push(fila);
    }
    const TOL = 1e-9;
    const pivotar = (obj, r, j) => {
      const fr = T[r], pv = fr[j];
      for (let k = 0; k <= N; k++) fr[k] /= pv;
      for (let i = 0; i < T.length; i++) {
        if (i === r) continue;
        const f = T[i][j];
        if (f !== 0) for (let k = 0; k <= N; k++) T[i][k] -= f * fr[k];
      }
      const f = obj[j];
      if (f !== 0) for (let k = 0; k <= N; k++) obj[k] -= f * fr[k];
      base[r] = j;
    };
    const objetivo = costos => {
      const obj = costos.slice(); obj.push(0);
      for (let i = 0; i < T.length; i++) {
        const cb = costos[base[i]];
        if (cb !== 0) for (let k = 0; k <= N; k++) obj[k] -= cb * T[i][k];
      }
      return obj;
    };
    const correr = (obj, permitidas) => {
      for (let it = 0; it < 50000; it++) {
        let j = -1;
        for (let k = 0; k < permitidas; k++) if (obj[k] < -TOL) { j = k; break; }
        if (j < 0) return 'optimo';
        let r = -1, mejor = Infinity;
        for (let i = 0; i < T.length; i++) {
          if (T[i][j] > TOL) {
            const q = T[i][N] / T[i][j];
            if (q < mejor - 1e-12 || (Math.abs(q - mejor) <= 1e-12 && base[i] < base[r])) { mejor = q; r = i; }
          }
        }
        if (r < 0) return 'noAcotado';
        pivotar(obj, r, j);
      }
      falla('el símplex no terminó en 50000 pivotes');
    };
    if (artificiales.length) {
      const c1 = new Array(N).fill(0);
      for (let k = 0; k < artificiales.length; k++) c1[n + m + k] = 1;
      const obj1 = objetivo(c1);
      correr(obj1, N);
      if (-obj1[N] > 1e-7 * Math.max(1, normaInf(b)))
        falla('el problema no es factible: ningún punto cumple todas las restricciones a la vez',
          'revisa los signos de A y b; recuerda que se pide A·x ≤ b con x ≥ 0');
      // Las artificiales que quedaron en la base (a valor 0) se sacan; si en
      // su fila no hay con qué cambiarlas, la restricción era redundante.
      for (let i = T.length - 1; i >= 0; i--) {
        if (base[i] < n + m) continue;
        let j = -1;
        for (let k = 0; k < n + m; k++) if (Math.abs(T[i][k]) > TOL) { j = k; break; }
        if (j >= 0) pivotar(new Array(N + 1).fill(0), i, j);
        else { T.splice(i, 1); base.splice(i, 1); }
      }
    }
    const c2 = new Array(N).fill(0);
    for (let j = 0; j < n; j++) c2[j] = cc[j];
    const obj2 = objetivo(c2);
    if (correr(obj2, n + m) === 'noAcotado')
      falla(`el problema no está acotado: se puede ${maximizar ? 'subir' : 'bajar'} el objetivo sin límite`,
        'falta una restricción que encierre la región factible');
    const x = new Array(n).fill(0);
    for (let i = 0; i < T.length; i++) if (base[i] < n) x[base[i]] = T[i][N];
    const valor = c.reduce((s, v, j) => s + v * x[j], 0);
    return { x: x.map(v => (Math.abs(v) < 1e-12 ? 0 : v)), valor };
  }

  return {
    EPS, RAIZ_PI, LN_RAIZ_2PI, falla, fmt, normaInf, escala, ridders,
    derivar, derivarN, gradiente, jacobiano, hessiano, integrar, integral, integrarDoble, integrarMontecarlo,
    integrarDatos, integrarAcumulado, derivarDatos, sumaSerie, limite,
    raizBrent, raizNewton, raicesPoli, raicesRealesPoli, resolverLineal, resolverNoLineal, puntoFijo,
    minimizar1D, nelderMead, bfgs, levenbergMarquardt, simplex,
  };
})();
// La segunda mitad de la capa pura: ecuaciones diferenciales, polinomios e
// interpolación. Usa las piezas de la primera (la eliminación gaussiana, el
// jacobiano rápido), así que va detrás.
const NEN_CALCULO2 = (function (B) {
  const { EPS, falla, fmt, normaInf, escala, resolverLineal } = B;

  // ══════════════════════════════════════════════════ ECUACIONES DIFERENCIALES

  // Dormand–Prince 5(4): siete etapas que dan a la vez una solución de orden 5
  // y otra de orden 4; su diferencia estima el error del paso, y el paso se
  // agranda o se achica para mantenerlo bajo la tolerancia. Es el «ode45» de
  // MATLAB y el RK45 de scipy. La última etapa se evalúa en el punto nuevo y
  // sirve de primera del paso siguiente (FSAL), así que cuesta 6 evaluaciones
  // por paso, no 7. Además trae una «salida densa» de orden 4: un polinomio
  // que da la solución en cualquier t dentro del paso sin volver a integrar,
  // que es lo que se usa cuando se piden tiempos concretos.
  const A2 = [1 / 5], A3 = [3 / 40, 9 / 40], A4 = [44 / 45, -56 / 15, 32 / 9];
  const A5 = [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729];
  const A6 = [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656];
  const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84];
  const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
  const D = [-12715105075 / 11282082432, 0, 87487479700 / 32700410799, -10690763975 / 1880347072,
    701980252875 / 199316789632, -1453857185 / 822651844, 69997945 / 29380423];
  const comb = (y, h, ks, cs) => y.map((v, i) => { let s = 0; for (let k = 0; k < cs.length; k++) if (cs[k]) s += cs[k] * ks[k][i]; return v + h * s; });

  function dopri(f, t0, y0, t1, puntos, opc) {
    const o = opc || {};
    const rtol = o.rtol || 1e-9, atol = o.atol || 1e-12;
    const n = y0.length;
    const F = (t, y) => {
      const r = f(t, y);
      if (r.length !== n) falla(`la función devuelve ${r.length} valor(es) y el estado tiene ${n} componente(s): hace falta una derivada por cada componente`);
      return r;
    };
    const ts = [], ys = [];
    if (t1 === t0) return { t: [t0], y: [y0.slice()] };
    const dir = t1 > t0 ? 1 : -1;
    let pi = 0;
    if (puntos) {
      for (const p of puntos) if ((p - t0) * dir < -1e-12 * escala(t0) || (p - t1) * dir > 1e-12 * escala(t1))
        falla(`el tiempo ${fmt(p)} está fuera de [${fmt(Math.min(t0, t1))}, ${fmt(Math.max(t0, t1))}]`);
      while (pi < puntos.length && puntos[pi] === t0) { ts.push(t0); ys.push(y0.slice()); pi++; }
    } else { ts.push(t0); ys.push(y0.slice()); }
    const norma = (v, y, yn) => {
      let s = 0;
      for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i])); s += (v[i] / sc) * (v[i] / sc); }
      return Math.sqrt(s / n);
    };
    let t = t0, y = y0.slice(), k1 = F(t, y);
    // El paso inicial de Hairer: del tamaño de y y de y' se deduce una escala
    // de tiempo, y con una evaluación más se tantea la segunda derivada.
    let h;
    {
      const d0 = norma(y, y, y), d1 = norma(k1, y, y);
      let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * d0 / d1;
      h0 = Math.min(h0, Math.abs(t1 - t0));
      const y1 = y.map((v, i) => v + dir * h0 * k1[i]);
      const f1 = F(t + dir * h0, y1);
      const d2 = norma(f1.map((v, i) => v - k1[i]), y, y) / h0;
      const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : Math.pow(0.01 / Math.max(d1, d2), 1 / 5);
      h = dir * Math.min(100 * h0, h1, Math.abs(t1 - t0));
    }
    let rechazado = false, pasos = 0;
    while (dir * (t1 - t) > 0) {
      if (++pasos > 200000) falla(`hicieron falta más de 200000 pasos y solo se llegó a t = ${fmt(t)}`,
        'si el sistema es rígido (escalas de tiempo muy distintas), usa resolverEDORigida');
      if (dir * (t + h - t1) > 0) h = t1 - t;
      const ks = [k1];
      ks.push(F(t + h / 5, comb(y, h, ks, A2)));
      ks.push(F(t + 3 * h / 10, comb(y, h, ks, A3)));
      ks.push(F(t + 4 * h / 5, comb(y, h, ks, A4)));
      ks.push(F(t + 8 * h / 9, comb(y, h, ks, A5)));
      ks.push(F(t + h, comb(y, h, ks, A6)));
      const yn = comb(y, h, ks, B5);
      const k7 = F(t + h, yn);
      ks.push(k7);
      const ev = y.map((_, i) => { let s = 0; for (let k = 0; k < 7; k++) s += E[k] * ks[k][i]; return h * s; });
      let err = norma(ev, y, yn);
      if (!isFinite(err) || yn.some(v => !isFinite(v))) err = Infinity;
      if (err <= 1) {
        const tn = t + h;
        if (puntos) {
          // Salida densa de Hairer (dopri5): el polinomio de grado 4 en θ.
          const r2 = yn.map((v, i) => v - y[i]);
          const r3 = r2.map((v, i) => h * k1[i] - v);
          const r4 = r2.map((v, i) => v - h * k7[i] - r3[i]);
          const r5 = y.map((_, i) => { let s = 0; for (let k = 0; k < 7; k++) s += D[k] * ks[k][i]; return h * s; });
          while (pi < puntos.length && dir * (puntos[pi] - tn) <= 0) {
            const th = (puntos[pi] - t) / h, th1 = 1 - th;
            ts.push(puntos[pi]);
            ys.push(y.map((v, i) => v + th * (r2[i] + th1 * (r3[i] + th * (r4[i] + th1 * r5[i])))));
            pi++;
          }
        } else { ts.push(tn); ys.push(yn.slice()); }
        t = tn; y = yn; k1 = k7;
        let fac = Math.min(10, Math.max(0.2, 0.9 * Math.pow(Math.max(err, 1e-10), -0.2)));
        if (rechazado) fac = Math.min(1, fac);
        h *= fac; rechazado = false;
      } else {
        h *= isFinite(err) ? Math.max(0.2, 0.9 * Math.pow(err, -0.2)) : 0.1;
        rechazado = true;
      }
      if (Math.abs(h) < 1e-14 * escala(t))
        falla(`el paso se hizo demasiado pequeño en t = ${fmt(t)}`,
          'la solución puede explotar ahí (una singularidad), o el sistema es rígido: prueba resolverEDORigida');
    }
    // Los puntos pedidos que coinciden con t1 (por redondeo) se cierran aquí.
    while (puntos && pi < puntos.length) { ts.push(puntos[pi]); ys.push(y.slice()); pi++; }
    return { t: ts, y: ys };
  }
  // RK4 clásico de paso fijo: el de los libros. Sin control de error, así que
  // el resultado es tan bueno como el número de pasos; está para enseñar y
  // para comparar, no para fiarse sin mirar.
  function rk4(f, t0, y0, t1, pasos) {
    const n = y0.length, h = (t1 - t0) / pasos;
    const ts = [t0], ys = [y0.slice()];
    let y = y0.slice();
    for (let k = 0; k < pasos; k++) {
      const t = t0 + k * h;
      const k1 = f(t, y);
      if (k1.length !== n) falla(`la función devuelve ${k1.length} valor(es) y el estado tiene ${n} componente(s): hace falta una derivada por cada componente`);
      const k2 = f(t + h / 2, y.map((v, i) => v + h / 2 * k1[i]));
      const k3 = f(t + h / 2, y.map((v, i) => v + h / 2 * k2[i]));
      const k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
      y = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      if (y.some(v => !isFinite(v))) falla(`la solución explota en t = ${fmt(t + h)}`, 'prueba con más pasos, o mira si el sistema es rígido');
      ts.push(t0 + (k + 1) * h); ys.push(y.slice());
    }
    return { t: ts, y: ys };
  }
  // Para sistemas RÍGIDOS (una parte que cambia en milisegundos y otra en
  // horas), un método explícito necesita pasos del tamaño de la escala rápida
  // aunque ya no pase nada en ella. Los implícitos no: BDF2 (diferencias hacia
  // atrás de orden 2, A-estable) arrancado con un paso de Euler implícito.
  // Cada paso resuelve una ecuación no lineal con Newton y el jacobiano
  // numérico. Es de paso FIJO: sencillo y robusto, pero sin control de error;
  // compáralo con el doble de pasos si necesitas saber cuánto te puedes fiar.
  function bdf2(f, t0, y0, t1, pasos) {
    const n = y0.length, h = (t1 - t0) / pasos;
    const ts = [t0], ys = [y0.slice()];
    const paso = (tn, rhs, c, guess) => {
      // Resolver  y − c·h·f(tn, y) = rhs  con Newton simplificado.
      let y = guess.slice();
      let J = null, ok = false;
      for (let it = 0; it < 40; it++) {
        const fy = f(tn, y);
        if (fy.length !== n) falla(`la función devuelve ${fy.length} valor(es) y el estado tiene ${n} componente(s): hace falta una derivada por cada componente`);
        const G = y.map((v, i) => v - c * h * fy[i] - rhs[i]);
        if (!J || it % 5 === 4) {
          const Jf = jacobianoRapido((yy) => f(tn, yy), y, fy);
          J = Jf.map((fila, i) => fila.map((v, j) => (i === j ? 1 : 0) - c * h * v));
        }
        const d = resolverLineal(J, G.map(v => -v));
        if (!d) falla(`el sistema de Newton es singular en t = ${fmt(tn)}`, 'prueba con otro número de pasos');
        y = y.map((v, i) => v + d[i]);
        if (normaInf(d) <= 1e-12 * (1 + normaInf(y))) { ok = true; break; }
      }
      if (!ok || y.some(v => !isFinite(v))) falla(`Newton no converge en t = ${fmt(tn)}`, 'prueba con más pasos');
      return y;
    };
    let yPrev = y0.slice();
    let y = paso(t0 + h, y0, 1, y0.map((v, i) => v + h * f(t0, y0)[i]));
    ts.push(t0 + h); ys.push(y.slice());
    for (let k = 2; k <= pasos; k++) {
      const tn = t0 + k * h;
      const rhs = y.map((v, i) => 4 / 3 * v - 1 / 3 * yPrev[i]);
      const guess = y.map((v, i) => 2 * v - yPrev[i]);
      const yn = paso(tn, rhs, 2 / 3, guess);
      yPrev = y; y = yn;
      ts.push(tn); ys.push(y.slice());
    }
    return { t: ts, y: ys };
  }
  function jacobianoRapido(F, x, Fx) {
    const n = x.length, m = Fx.length;
    const J = [];
    for (let i = 0; i < m; i++) J.push(new Array(n));
    for (let j = 0; j < n; j++) {
      const h = 1.5e-8 * escala(x[j]);
      const xp = x.slice(); xp[j] += h;
      const a = F(xp);
      for (let i = 0; i < m; i++) J[i][j] = (a[i] - Fx[i]) / h;
    }
    return J;
  }

  // ═══════════════════════════════════════════════════════════════ POLINOMIOS
  // Recordatorio: [c0, c1, c2] es c0 + c1·x + c2·x².
  const recortar = p => { const q = p.slice(); while (q.length > 1 && q[q.length - 1] === 0) q.pop(); return q.length ? q : [0]; };
  // Horner: n multiplicaciones y n sumas, y el menor error de redondeo posible
  // para evaluar un polinomio. Nunca se calculan potencias sueltas.
  const evaluarPoli = (p, x) => { let s = 0; for (let k = p.length - 1; k >= 0; k--) s = s * x + p[k]; return s; };
  const derivarPoli = p => p.length <= 1 ? [0] : p.slice(1).map((c, k) => c * (k + 1));
  const integrarPoli = (p, c0) => [c0 || 0].concat(p.map((c, k) => c / (k + 1)));
  const sumarPoli = (p, q) => recortar(Array.from({ length: Math.max(p.length, q.length) }, (_, k) => (p[k] || 0) + (q[k] || 0)));
  const restarPoli = (p, q) => recortar(Array.from({ length: Math.max(p.length, q.length) }, (_, k) => (p[k] || 0) - (q[k] || 0)));
  const multPoli = (p, q) => {
    const r = new Array(p.length + q.length - 1).fill(0);
    for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] += p[i] * q[j];
    return recortar(r);
  };
  // División larga, de la potencia mayor hacia abajo, como en la pizarra.
  function dividirPoli(p, q) {
    q = recortar(q);
    if (q.length === 1 && q[0] === 0) falla('no se puede dividir entre el polinomio cero');
    const r = recortar(p).slice();
    const dq = q.length - 1, lider = q[dq];
    if (r.length - 1 < dq) return { cociente: [0], resto: recortar(r) };
    const c = new Array(r.length - dq).fill(0);
    for (let k = r.length - 1; k >= dq; k--) {
      const f = r[k] / lider;
      c[k - dq] = f;
      for (let j = 0; j <= dq; j++) r[k - dq + j] -= f * q[j];
      r[k] = 0;
    }
    return { cociente: recortar(c), resto: recortar(r.slice(0, Math.max(1, dq))) };
  }
  const poliDesdeRaices = rs => rs.reduce((p, r) => multPoli(p, [-r, 1]), [1]);
  // Mínimos cuadrados con QR de Householder, no con las ecuaciones normales:
  // (AᵀA) eleva al cuadrado el número de condición, y con una Vandermonde de
  // grado 8 eso ya son todas las cifras. Además las x se centran y escalan a
  // [−1, 1] antes de montar la matriz, y el polinomio se devuelve a las x de
  // verdad al final.
  function minimosCuadradosQR(A, b) {
    const m = A.length, n = A[0].length;
    const R = A.map(f => f.slice()), y = b.slice();
    for (let k = 0; k < n; k++) {
      let nrm = 0;
      for (let i = k; i < m; i++) nrm = Math.hypot(nrm, R[i][k]);
      if (nrm === 0) falla('los datos no alcanzan para ese grado', 'baja el grado o da más puntos distintos');
      const alfa = R[k][k] > 0 ? -nrm : nrm;
      const v = new Array(m).fill(0);
      v[k] = R[k][k] - alfa;
      for (let i = k + 1; i < m; i++) v[i] = R[i][k];
      const vv = v.reduce((s, t) => s + t * t, 0);
      if (vv === 0) continue;
      for (let j = k; j < n; j++) {
        let s = 0;
        for (let i = k; i < m; i++) s += v[i] * R[i][j];
        s = 2 * s / vv;
        for (let i = k; i < m; i++) R[i][j] -= s * v[i];
      }
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * y[i];
      s = 2 * s / vv;
      for (let i = k; i < m; i++) y[i] -= s * v[i];
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j];
      if (Math.abs(R[i][i]) <= 1e-13 * Math.abs(R[0][0])) falla('los datos no alcanzan para ese grado', 'baja el grado o da más puntos distintos');
      x[i] = s / R[i][i];
    }
    return x;
  }
  function ajustePolinomico(xs, ys, grado) {
    const m = xs.length;
    if (ys.length !== m) falla(`hay ${m} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    if (grado < 0) falla('el grado no puede ser negativo');
    if (m < grado + 1) falla(`para un polinomio de grado ${grado} hacen falta al menos ${grado + 1} puntos y hay ${m}`);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const c = (lo + hi) / 2, s = (hi - lo) / 2 || 1;
    const A = xs.map(x => { const t = (x - c) / s; const f = [1]; for (let k = 1; k <= grado; k++) f.push(f[k - 1] * t); return f; });
    const bt = minimosCuadradosQR(A, ys);
    // p(x) = Σ bₖ·((x − c)/s)ᵏ, desarrollado por Horner en polinomios.
    const u = [-c / s, 1 / s];
    let p = [0];
    for (let k = grado; k >= 0; k--) p = sumarPoli(multPoli(p, u), [bt[k]]);
    return p;
  }
  // Para leerlo en la pizarra: «3x² − 2x + 1», con los exponentes como
  // superíndices y sin los «1·x» ni los «+ −» de una impresión a lo bruto.
  function textoPoli(p, v) {
    v = v || 'x';
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const sup = k => String(k).split('').map(d => SUP[+d]).join('');
    const num = x => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(10))));
    const partes = [];
    for (let k = p.length - 1; k >= 0; k--) {
      const c = p[k];
      if (c === 0) continue;
      const a = Math.abs(c);
      const coef = (a === 1 && k > 0) ? '' : num(a);
      const pot = k === 0 ? '' : k === 1 ? v : v + sup(k);
      partes.push({ neg: c < 0, txt: coef + pot });
    }
    if (!partes.length) return '0';
    return partes.map((t, i) => (i === 0 ? (t.neg ? '−' : '') + t.txt : (t.neg ? ' − ' : ' + ') + t.txt)).join('');
  }

  // ═════════════════════════════════════════════════════════════ INTERPOLACIÓN
  function exigeCrecientes(xs, ys) {
    if (xs.length !== ys.length) falla(`hay ${xs.length} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    if (xs.length < 2) falla('hacen falta al menos dos puntos');
    for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) falla('las x tienen que ir en orden creciente y sin repetirse', 'ordénalas junto con sus y');
  }
  // El intervalo [xs[i], xs[i+1]] que contiene a x, por bisección.
  function tramo(xs, x) {
    const n = xs.length;
    if (!(x >= xs[0] && x <= xs[n - 1]))
      falla(`x = ${fmt(x)} está fuera del rango de los datos, [${fmt(xs[0])}, ${fmt(xs[n - 1])}]`,
        'interpolar fuera de los datos es extrapolar, y eso no se hace a escondidas');
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    return lo;
  }
  const interpLineal = (xs, ys, x) => {
    const i = tramo(xs, x);
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + t * (ys[i + 1] - ys[i]);
  };
  // Lagrange en forma BARICÉNTRICA: la misma recta que la fórmula de los
  // libros, pero en O(n) por punto en vez de O(n²) y numéricamente estable
  // (la fórmula ingenua resta productos enormes). Los pesos se calculan una vez.
  function pesosBaricentricos(xs) {
    const n = xs.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      if (xs[i] === xs[j]) falla(`la x ${fmt(xs[i])} está repetida`, 'un polinomio no puede pasar por dos alturas en la misma x');
    return xs.map((xi, j) => { let p = 1; for (let k = 0; k < n; k++) if (k !== j) p *= (xi - xs[k]); return 1 / p; });
  }
  function interpLagrange(xs, ys, w, x) {
    let num = 0, den = 0;
    for (let j = 0; j < xs.length; j++) {
      if (x === xs[j]) return ys[j];
      const t = w[j] / (x - xs[j]);
      num += t * ys[j]; den += t;
    }
    return num / den;
  }
  // El mismo polinomio, pero con sus coeficientes: diferencias divididas de
  // Newton y desarrollo por Horner.
  function poliInterpolante(xs, ys) {
    pesosBaricentricos(xs);
    const n = xs.length, c = ys.slice();
    for (let j = 1; j < n; j++) for (let i = n - 1; i >= j; i--) c[i] = (c[i] - c[i - 1]) / (xs[i] - xs[i - j]);
    let p = [c[n - 1]];
    for (let k = n - 2; k >= 0; k--) p = sumarPoli(multPoli(p, [-xs[k], 1]), [c[k]]);
    return p;
  }
  // Spline cúbico: por cada tramo una cúbica, con valor, pendiente y
  // curvatura continuos. Se plantea con las PENDIENTES sᵢ en los nodos (como
  // scipy): sale un sistema tridiagonal que se resuelve en O(n) con Thomas.
  // Dos finales posibles:
  //   "natural"  curvatura cero en los extremos (el de los libros; por defecto)
  //   "noNodo"   la tercera derivada no salta en el segundo ni en el penúltimo
  //              nodo («not-a-knot», el de MATLAB y scipy): suele ajustar mejor
  //              cerca de los bordes.
  function spline(xs, ys, tipo) {
    exigeCrecientes(xs, ys);
    const n = xs.length;
    const h = [], m = [];
    for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); m.push((ys[i + 1] - ys[i]) / h[i]); }
    let s;
    if (n === 2) s = [m[0], m[0]];
    else if (n === 3 && tipo === 'noNodo') {
      // Con tres puntos, «sin nodo» es la parábola que pasa por los tres.
      const p = poliInterpolante(xs, ys), dp = derivarPoli(p);
      s = xs.map(x => evaluarPoli(dp, x));
    } else {
      const sub = new Array(n).fill(0), dia = new Array(n).fill(0), sup = new Array(n).fill(0), r = new Array(n).fill(0);
      for (let i = 1; i < n - 1; i++) {
        sub[i] = h[i]; dia[i] = 2 * (h[i - 1] + h[i]); sup[i] = h[i - 1];
        r[i] = 3 * (h[i] * m[i - 1] + h[i - 1] * m[i]);
      }
      if (tipo === 'noNodo') {
        const d0 = xs[2] - xs[0];
        dia[0] = h[1]; sup[0] = d0;
        r[0] = ((h[0] + 2 * d0) * h[1] * m[0] + h[0] * h[0] * m[1]) / d0;
        const dn = xs[n - 1] - xs[n - 3];
        dia[n - 1] = h[n - 3]; sub[n - 1] = dn;
        r[n - 1] = (h[n - 2] * h[n - 2] * m[n - 3] + (2 * dn + h[n - 2]) * h[n - 3] * m[n - 2]) / dn;
      } else {
        dia[0] = 2; sup[0] = 1; r[0] = 3 * m[0];
        sub[n - 1] = 1; dia[n - 1] = 2; r[n - 1] = 3 * m[n - 2];
      }
      // Thomas: eliminación hacia delante y sustitución hacia atrás.
      for (let i = 1; i < n; i++) {
        const w = sub[i] / dia[i - 1];
        dia[i] -= w * sup[i - 1];
        r[i] -= w * r[i - 1];
      }
      s = new Array(n);
      s[n - 1] = r[n - 1] / dia[n - 1];
      for (let i = n - 2; i >= 0; i--) s[i] = (r[i] - sup[i] * s[i + 1]) / dia[i];
    }
    // Cada tramo como cúbica de Hermite con los valores y las pendientes.
    const evaluar = x => {
      const i = tramo(xs, x);
      const hh = h[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * s[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * s[i + 1];
    };
    return { evaluar, pendientes: s };
  }

  return { dopri, rk4, bdf2, evaluarPoli, derivarPoli, integrarPoli, sumarPoli, restarPoli, multPoli, dividirPoli,
    poliDesdeRaices, ajustePolinomico, textoPoli, exigeCrecientes, interpLineal, pesosBaricentricos, interpLagrange,
    poliInterpolante, spline, recortar };
})(NEN_CALCULO);

// La tercera: funciones especiales, distribuciones y teoría de números.
const NEN_ESPECIALES = (function (B) {
  const { EPS, RAIZ_PI, LN_RAIZ_2PI, falla, fmt, raizBrent } = B;

  // ═══════════════════════════════════════════════════════ FUNCIONES ESPECIALES

  // Γ con la aproximación de Lanczos (g = 7, 9 términos): unas 15 cifras en
  // todo el semieje positivo con nueve divisiones. Para x < ½ se usa la
  // reflexión Γ(x)Γ(1−x) = π/sen(πx), porque Lanczos pierde precisión ahí.
  // En los enteros se multiplica directamente: así Γ(5) da 24 y no 23.999…
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (isNaN(x)) return NaN;
    if (x <= 0 && Number.isInteger(x)) falla(`Γ tiene un polo en ${fmt(x)}: no existe en 0 ni en los enteros negativos`);
    if (Number.isInteger(x) && x <= 171) { let p = 1; for (let k = 2; k < x; k++) p *= k; return p; }
    if (x > 171.62) falla(`Γ(${fmt(x)}) no cabe en un número (pasa de 10³⁰⁸)`, 'usa lnGamma, que da su logaritmo');
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    // t^(x+½) se hace en dos mitades para no desbordar antes de multiplicar por e^(−t).
    const p = Math.pow(t, (x + 0.5) / 2);
    return Math.sqrt(2 * Math.PI) * p * (p * Math.exp(-t)) * a;
  }
  // ln Γ: con la serie de Stirling para x ≥ 15 (donde cinco términos ya dan
  // el redondeo) y con el logaritmo de Γ por debajo. Para negativos, ln|Γ|.
  function lnGamma(x) {
    if (x <= 0 && Number.isInteger(x)) falla(`Γ tiene un polo en ${fmt(x)}: no existe en 0 ni en los enteros negativos`);
    if (x < 0) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
    if (x < 15) return Math.log(gamma(x));
    const x2 = 1 / (x * x);
    const serie = (1 / 12 - x2 * (1 / 360 - x2 * (1 / 1260 - x2 * (1 / 1680 - x2 * (1 / 1188 - x2 * 691 / 360360))))) / x;
    return (x - 0.5) * Math.log(x) - x + LN_RAIZ_2PI + serie;
  }
  function beta(a, b) {
    if (a > 0 && b > 0 && a + b < 170) return gamma(a) * gamma(b) / gamma(a + b);
    if (a > 0 && b > 0) return Math.exp(lnGamma(a) + lnGamma(b) - lnGamma(a + b));
    return gamma(a) * gamma(b) / gamma(a + b);
  }
  // ψ = Γ'/Γ: se sube con ψ(x) = ψ(x+1) − 1/x hasta x ≥ 10 y ahí la serie
  // asintótica con los números de Bernoulli ya está en el redondeo.
  function digamma(x) {
    if (x <= 0 && Number.isInteger(x)) falla(`ψ tiene un polo en ${fmt(x)}`);
    if (x < 0) return digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
    let r = 0;
    while (x < 10) { r -= 1 / x; x += 1; }
    const x2 = 1 / (x * x);
    return r + Math.log(x) - 0.5 / x - x2 * (1 / 12 - x2 * (1 / 120 - x2 * (1 / 252 - x2 * (1 / 240 - x2 * (1 / 132 - x2 * (691 / 32760 - x2 / 12))))));
  }
  // Gamma incompleta regularizada P(a, x) = γ(a, x)/Γ(a): la serie converge
  // rápido para x < a + 1 y la fracción continua (Lentz) para x > a + 1; se
  // usa cada una donde es buena y la otra se saca como 1 − la primera.
  function gammaSerie(a, x) {
    let ap = a, del = 1 / a, sum = del;
    for (let n = 0; n < 100000; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    falla('la serie de la gamma incompleta no converge (a demasiado grande)');
  }
  // La fracción continua de Γ(a, x), por Lentz modificado; devuelve solo la
  // fracción, sin el prefactor, para que erfc pueda poner el suyo con cuidado.
  function lentzGamma(a, x) {
    const MIN = 1e-300;
    let b = x + 1 - a, c = 1 / MIN, d = 1 / b, h = d;
    for (let i = 1; i < 100000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < MIN) d = MIN;
      c = b + an / c; if (Math.abs(c) < MIN) c = MIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) return h;
    }
    falla('la fracción continua de la gamma incompleta no converge (a demasiado grande)');
  }
  const gammaFraccion = (a, x) => Math.exp(-x + a * Math.log(x) - lnGamma(a)) * lentzGamma(a, x);
  function gammaP(a, x) {
    if (!(a > 0)) falla('el parámetro a tiene que ser positivo');
    if (x < 0) falla('x no puede ser negativo');
    if (x === 0) return 0;
    if (x === Infinity) return 1;
    return x < a + 1 ? gammaSerie(a, x) : 1 - gammaFraccion(a, x);
  }
  function gammaQ(a, x) {
    if (!(a > 0)) falla('el parámetro a tiene que ser positivo');
    if (x < 0) falla('x no puede ser negativo');
    if (x === 0) return 1;
    if (x === Infinity) return 0;
    return x < a + 1 ? 1 - gammaSerie(a, x) : gammaFraccion(a, x);
  }
  // erf: para |x| < 2, la serie de términos TODOS positivos
  //     erf(x) = (2/√π)·e^(−x²)·Σ 2ⁿ x^(2n+1) / (1·3·5···(2n+1)),
  // que no cancela nada (la de Taylor alterna y pierde cifras ya en x = 3).
  // Más allá, 1 − erfc, con erfc de la fracción continua de Γ(½, x²). Así cada
  // una tiene error relativo de pocas ε, incluso erfc(5) ≈ 1.5·10⁻¹².
  function erfSerie(x) {
    const x2 = x * x;
    let term = x, sum = x;
    for (let n = 1; n < 500; n++) {
      term *= 2 * x2 / (2 * n + 1);
      sum += term;
      if (term < EPS * sum) break;
    }
    return 2 / RAIZ_PI * Math.exp(-x2) * sum;
  }
  function erfc(x) {
    if (isNaN(x)) return NaN;
    if (x < 0) return 2 - erfc(-x);
    if (x < 2) return 1 - erfSerie(x);
    if (x > 27) return 0;
    // erfc(x) = x·e^(−x²)/√π · (fracción de Γ(½, x²)). El cuidado está en
    // e^(−x²): x² redondeado lleva un error absoluto de x²·ε, que la
    // exponencial convierte en relativo (10⁻¹⁴ en x = 10). Se parte x en una
    // parte corta xh, cuyo cuadrado es exacto, y el resto (x − xh)(x + xh).
    const xh = Math.round(x * 16) / 16, del = (x - xh) * (x + xh);
    return x / RAIZ_PI * Math.exp(-xh * xh) * Math.exp(-del) * lentzGamma(0.5, x * x);
  }
  function erf(x) {
    if (isNaN(x)) return NaN;
    if (x < 0) return -erf(-x);
    if (x < 2) return erfSerie(x);
    return 1 - erfc(x);
  }
  // Inversa de erf: arranque con el cuantil normal (Acklam) y tres pasos de
  // Halley sobre la propia erf (o sobre erfc cerca de ±1, donde 1 − y es lo
  // que lleva la información). Halley converge con orden 3: dos pasos ya dan
  // el redondeo; el tercero es seguro.
  function erfInversa(y) {
    if (y < -1 || y > 1) falla(`erfInversa solo existe entre −1 y 1, y llegó ${fmt(y)}`);
    if (y === 1) return Infinity;
    if (y === -1) return -Infinity;
    if (y === 0) return 0;
    if (y < 0) return -erfInversa(-y);
    let x = Math.abs(y) < 0.5 ? y * RAIZ_PI / 2 * (1 + Math.PI * y * y / 12) : acklam((1 + y) / 2) / Math.SQRT2;
    for (let it = 0; it < 6; it++) {
      const r = y < 0.5 ? erf(x) - y : (1 - y) - erfc(x);
      const u = r / (2 / RAIZ_PI * Math.exp(-x * x));
      const dx = u / (1 + x * u);
      x -= dx;
      if (Math.abs(dx) <= EPS * Math.abs(x)) break;
    }
    return x;
  }
  // Acklam: una racional por tramos para el cuantil normal, con error
  // relativo 1.15·10⁻⁹. Sola no basta; como arranque de Halley, sobra.
  function acklam(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const bajo = 0.02425;
    if (p < bajo) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - bajo) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // Beta incompleta regularizada Iₓ(a, b) por la fracción continua de
  // Lentz, que converge rápido para x < (a+1)/(a+b+2); del otro lado se usa la
  // simetría Iₓ(a, b) = 1 − I₁₋ₓ(b, a).
  function betaFraccion(a, b, x) {
    const MIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < MIN) d = MIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 100000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN;
      c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN;
      c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) return h;
    }
    falla('la fracción continua de la beta incompleta no converge (a o b demasiado grandes)');
  }
  function betaIncompleta(a, b, x) {
    if (!(a > 0) || !(b > 0)) falla('a y b tienen que ser positivos');
    if (x < 0 || x > 1) falla(`x tiene que estar entre 0 y 1, y llegó ${fmt(x)}`);
    if (x === 0) return 0;
    if (x === 1) return 1;
    const lbt = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
    const bt = Math.exp(lbt);
    if (x < (a + 1) / (a + b + 2)) return bt * betaFraccion(a, b, x) / a;
    return 1 - bt * betaFraccion(b, a, 1 - x) / b;
  }
  // Bessel J de orden ENTERO. Dos caminos:
  //  · x pequeña frente al orden: la serie de potencias, que ahí no cancela.
  //  · si no: la integral de Bessel  Jₙ(x) = (1/2π) ∫₀^{2π} cos(nτ − x·sen τ) dτ
  //    con la regla del trapecio. Parece ingenuo y es lo contrario: para un
  //    integrando periódico y analítico el trapecio converge EXPONENCIALMENTE,
  //    y con N > |x| + n + 40 puntos ya está en el redondeo.
  // El error es absoluto (~10⁻¹⁶), así que cerca de un cero de Jₙ las cifras
  // relativas bajan, como en cualquier implementación.
  function besselJ(n, x) {
    if (!Number.isInteger(n)) falla('besselJ solo está para órdenes enteros', 'redondea el orden');
    if (n < 0) return (n % 2 ? -1 : 1) * besselJ(-n, x);
    if (x < 0) return (n % 2 ? -1 : 1) * besselJ(n, -x);
    if (x === 0) return n === 0 ? 1 : 0;
    if (x * x < 4 * (n + 1) || x < 6) {
      const h = x / 2;
      let term = Math.exp(n * Math.log(h) - lnGamma(n + 1)), sum = term;
      for (let k = 1; k < 500; k++) {
        term *= -h * h / (k * (k + n));
        sum += term;
        if (Math.abs(term) < EPS * Math.abs(sum) * 1e-2) break;
      }
      return sum;
    }
    const N = 2 * Math.ceil((x + n) / 2 + 40);
    let s = 0;
    for (let k = 0; k < N; k++) { const t = 2 * Math.PI * k / N; s += Math.cos(n * t - x * Math.sin(t)); }
    return s / N;
  }
  // ζ de Riemann por el algoritmo de Borwein sobre la función eta alternada,
  // ζ(s) = η(s)/(1 − 2^(1−s)), con n = 50 términos: error teórico ~(3+√8)⁻⁵⁰,
  // muy por debajo del redondeo. Vale para todo s > 0 (salvo el polo en 1);
  // para s < 0, la ecuación funcional de Riemann.
  const ZD = (() => {
    const n = 50, d = [];
    let sum = 0, num = 1, den = 1;   // num = (n+i−1)!/(n−i)! · 4^i, den = (2i)!
    for (let i = 0; i <= n; i++) {
      if (i > 0) { num *= (n + i - 1) * (n - i + 1) * 4; den *= (2 * i - 1) * (2 * i); }
      sum += num / den;
      d.push(n * sum);
    }
    return d;
  })();
  function zeta(s) {
    if (s === 1) falla('ζ tiene un polo en s = 1: la serie armónica diverge');
    if (s === 0) return -0.5;
    if (s < 0) {
      if (Number.isInteger(s) && s % 2 === 0) return 0;     // los ceros triviales
      return Math.pow(2, s) * Math.pow(Math.PI, s - 1) * Math.sin(Math.PI * s / 2) * gamma(1 - s) * zeta(1 - s);
    }
    if (s > 60) return 1 + Math.pow(2, -s) + Math.pow(3, -s);
    const n = ZD.length - 1;
    let sum = 0;
    for (let k = 0; k < n; k++) sum += (k % 2 ? -1 : 1) * (ZD[k] - ZD[n]) / Math.pow(k + 1, s);
    return -sum / (ZD[n] * (1 - Math.pow(2, 1 - s)));
  }

  // ═════════════════════════════════════════════════════════════ PROBABILIDAD
  const exigeSigma = s => { if (!(s > 0)) falla(`la desviación tiene que ser positiva, y llegó ${fmt(s)}`); };
  const exigeP = p => { if (!(p >= 0 && p <= 1)) falla(`una probabilidad va de 0 a 1, y llegó ${fmt(p)}`); };
  const normalDensidad = (x, mu, s) => { exigeSigma(s); const z = (x - mu) / s; return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI)); };
  // Con erfc y no con ½(1 + erf): en la cola izquierda la resta 1 + erf(−6)
  // se come todas las cifras, y erfc(6/√2) las conserva.
  const normalAcumulada = (x, mu, s) => { exigeSigma(s); return 0.5 * erfc(-(x - mu) / (s * Math.SQRT2)); };
  function normalInversa(p, mu, s) {
    exigeSigma(s); exigeP(p);
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    // Se trabaja siempre en la cola izquierda (p ≤ ½) y se refleja: en la
    // derecha, la acumulada está pegada a 1 y su resta con p ya no tiene cifras.
    if (p > 0.5) return mu - s * normalInversa(1 - p, 0, 1);
    let x = acklam(p);
    // Un paso de Halley sobre la acumulada lleva Acklam (9 cifras) al redondeo.
    for (let k = 0; k < 2; k++) {
      const e = 0.5 * erfc(-x / Math.SQRT2) - p;
      const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
      x -= u / (1 + x * u / 2);
    }
    return mu + s * x;
  }
  const exigeGL = (v, q) => { if (!(v > 0)) falla(`los grados de libertad${q || ''} tienen que ser positivos, y llegó ${fmt(v)}`); };
  function tStudentAcumulada(t, v) {
    exigeGL(v);
    if (t === Infinity) return 1;
    if (t === -Infinity) return 0;
    const x = v / (v + t * t);
    const cola = 0.5 * betaIncompleta(v / 2, 0.5, x);
    return t > 0 ? 1 - cola : cola;
  }
  // Las inversas que no tienen fórmula se despejan con Brent sobre la
  // acumulada (que es monótona), después de abrir un intervalo que la encierre.
  function invertir(F, p, lo, hi, minimo) {
    let a = lo, b = hi;
    for (let k = 0; k < 200 && F(b) < p; k++) b = b * 2 + 1;
    if (minimo === undefined) for (let k = 0; k < 200 && F(a) > p; k++) a = a * 2 - 1;
    return raizBrent(x => F(x) - p, a, b);
  }
  function tStudentInversa(p, v) {
    exigeGL(v); exigeP(p);
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (p === 0.5) return 0;
    const z = acklam(p);
    return invertir(t => tStudentAcumulada(t, v), p, Math.min(-1, 2 * z), Math.max(1, 2 * z));
  }
  const chiCuadradoAcumulada = (x, k) => { exigeGL(k); return x <= 0 ? 0 : gammaP(k / 2, x / 2); };
  function chiCuadradoInversa(p, k) {
    exigeGL(k); exigeP(p);
    if (p === 0) return 0;
    if (p === 1) return Infinity;
    return invertir(x => chiCuadradoAcumulada(x, k), p, 0, k + 10, 0);
  }
  function fisherAcumulada(x, d1, d2) {
    exigeGL(d1, ' del numerador'); exigeGL(d2, ' del denominador');
    if (x <= 0) return 0;
    if (x === Infinity) return 1;
    return betaIncompleta(d1 / 2, d2 / 2, d1 * x / (d1 * x + d2));
  }
  // ln C(n, k) por lnGamma: así binomialProb(500, 1000, 0.5) no pasa por
  // números de 300 cifras.
  const lnComb = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
  function binomialProb(k, n, p) {
    exigeP(p);
    if (!Number.isInteger(n) || n < 0) falla('n tiene que ser un entero no negativo');
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(lnComb(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  }
  // P(X ≤ k) = I₁₋ₚ(n − k, k + 1): una beta incompleta en vez de k + 1 sumandos.
  function binomialAcumulada(k, n, p) {
    exigeP(p);
    if (!Number.isInteger(n) || n < 0) falla('n tiene que ser un entero no negativo');
    k = Math.floor(k);
    if (k < 0) return 0;
    if (k >= n) return 1;
    if (p === 0) return 1;
    if (p === 1) return 0;
    return betaIncompleta(n - k, k + 1, 1 - p);
  }
  function poissonProb(k, l) {
    if (!(l > 0)) falla(`la tasa λ tiene que ser positiva, y llegó ${fmt(l)}`);
    if (!Number.isInteger(k) || k < 0) return 0;
    return Math.exp(k * Math.log(l) - l - lnGamma(k + 1));
  }
  // P(X ≤ k) = Q(k + 1, λ), la gamma incompleta superior.
  function poissonAcumulada(k, l) {
    if (!(l > 0)) falla(`la tasa λ tiene que ser positiva, y llegó ${fmt(l)}`);
    k = Math.floor(k);
    if (k < 0) return 0;
    return gammaQ(k + 1, l);
  }
  const exponencialAcumulada = (x, l) => {
    if (!(l > 0)) falla(`la tasa λ tiene que ser positiva, y llegó ${fmt(l)}`);
    return x <= 0 ? 0 : -Math.expm1(-l * x);
  };

  // ═════════════════════════════════════════════════════════ TEORÍA DE NÚMEROS
  // Todo se hace con BigInt por dentro: un producto de dos números de 30 bits
  // ya no cabe exacto en un double, y la aritmética modular no admite «casi».
  // Por fuera, los números de Ñ son exactos hasta 2⁵³, y ese es el límite.
  const MAXSEG = Number.MAX_SAFE_INTEGER;
  const exigeEntero = (x, que) => {
    if (!Number.isInteger(x)) falla(`${que} tiene que ser entero, y llegó ${fmt(x)}`);
    if (Math.abs(x) > MAXSEG) falla(`${que} pasa de 2⁵³ y ya no es exacto en un número de Ñ`);
    return x;
  };
  const modB = (a, m) => ((a % m) + m) % m;
  function potenciaModular(b, e, m) {
    exigeEntero(b, 'la base'); exigeEntero(e, 'el exponente'); exigeEntero(m, 'el módulo');
    if (m < 1) falla('el módulo tiene que ser al menos 1');
    if (e < 0) return potenciaModular(inversoModular(b, m), -e, m);
    let r = 1n, x = modB(BigInt(b), BigInt(m)), k = BigInt(e);
    const M = BigInt(m);
    // Exponenciación binaria: log₂(e) cuadrados en vez de e productos.
    while (k > 0n) { if (k & 1n) r = r * x % M; x = x * x % M; k >>= 1n; }
    return Number(r % M);
  }
  function mcdExtendido(a, b) {
    exigeEntero(a, 'a'); exigeEntero(b, 'b');
    let [r0, r1] = [BigInt(a), BigInt(b)], [s0, s1] = [1n, 0n], [t0, t1] = [0n, 1n];
    while (r1 !== 0n) {
      const q = r0 / r1;
      [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; [t0, t1] = [t1, t0 - q * t1];
    }
    if (r0 < 0n) { r0 = -r0; s0 = -s0; t0 = -t0; }
    return { mcd: Number(r0), x: Number(s0), y: Number(t0) };
  }
  function inversoModular(a, m) {
    exigeEntero(a, 'el número'); exigeEntero(m, 'el módulo');
    if (m < 2) falla('el módulo tiene que ser al menos 2');
    const r = mcdExtendido(modB(a, m), m);
    if (r.mcd !== 1) falla(`${a} no tiene inverso módulo ${m}: comparten el factor ${r.mcd}`,
      'solo tienen inverso los números primos relativos con el módulo');
    return ((r.x % m) + m) % m;
  }
  // Resto chino en su versión general: los módulos no tienen que ser primos
  // entre sí, solo los restos compatibles. Se van juntando de dos en dos.
  function restoChino(rs, ms) {
    if (rs.length !== ms.length) falla(`hay ${rs.length} restos y ${ms.length} módulos`, 'uno por uno');
    if (!rs.length) falla('hace falta al menos una congruencia');
    let R = 0n, M = 1n;
    for (let i = 0; i < rs.length; i++) {
      exigeEntero(rs[i], 'cada resto'); exigeEntero(ms[i], 'cada módulo');
      if (ms[i] < 1) falla('los módulos tienen que ser positivos');
      const m = BigInt(ms[i]), r = modB(BigInt(rs[i]), m);
      // x ≡ R (mod M) y x ≡ r (mod m):  x = R + M·t  con  M·t ≡ r − R (mod m)
      let [a, b] = [M, m], [s0, s1] = [1n, 0n];
      while (b !== 0n) { const q = a / b; [a, b] = [b, a - q * b]; [s0, s1] = [s1, s0 - q * s1]; }
      const g = a;
      if ((r - R) % g !== 0n) falla(`las congruencias se contradicen: ningún número deja resto ${rs[i]} módulo ${ms[i]} y cumple las anteriores`);
      const mg = m / g;
      const t = modB(((r - R) / g) * s0, mg);
      R = R + M * t; M = M * mg; R = modB(R, M);
    }
    if (R > BigInt(MAXSEG)) falla('la solución pasa de 2⁵³ y no cabe exacta en un número de Ñ');
    // El módulo puede pasar de 2⁵³ aunque el resto quepa: se da como real (aproximado).
    return { resto: Number(R), modulo: Number(M) };
  }
  // Fibonacci por «duplicación»: F(2k) = F(k)·(2F(k+1) − F(k)) y
  // F(2k+1) = F(k)² + F(k+1)², en log₂(n) pasos y con BigInt. Exacto hasta
  // F(78), el último que cabe en 2⁵³; de ahí a F(1476) se devuelve el real más
  // cercano (16 cifras buenas), y después no cabe en un número.
  function fibonacci(n) {
    exigeEntero(n, 'n');
    if (n < 0) return (n % 2 ? 1 : -1) * fibonacci(-n);
    if (n > 1476) falla(`F(${n}) no cabe en un número (pasa de 10³⁰⁸)`);
    const par = k => {
      if (k === 0) return [0n, 1n];
      const [a, b] = par(Math.floor(k / 2));
      const c = a * (2n * b - a), d = a * a + b * b;
      return k % 2 ? [d, c + d] : [c, d];
    };
    return Number(par(n)[0]);
  }
  const mulmod = (a, b, m) => a * b % m;
  function potB(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = mulmod(r, b, m); b = mulmod(b, b, m); e >>= 1n; } return r; }
  // Miller–Rabin con las bases primas hasta 37: es DETERMINISTA para todo
  // n < 3.3·10²⁴, y por tanto para todo entero de Ñ.
  function esPrimoMR(n) {
    if (n < 2) return false;
    for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) { if (n === p) return true; if (n % p === 0) return false; }
    const N = BigInt(n);
    let d = N - 1n, s = 0;
    while (d % 2n === 0n) { d /= 2n; s++; }
    for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
      let x = potB(a, d, N);
      if (x === 1n || x === N - 1n) continue;
      let comp = true;
      for (let r = 1; r < s; r++) { x = mulmod(x, x, N); if (x === N - 1n) { comp = false; break; } }
      if (comp) return false;
    }
    return true;
  }
  // Rho de Pollard con la mejora de Brent: encuentra un factor de n en unas
  // n^(1/4) vueltas, contra las √n de probar divisores. Con n ~ 2⁵³ es la
  // diferencia entre 10⁴ y 10⁸.
  function rhoPollard(n) {
    const N = BigInt(n);
    if (N % 2n === 0n) return 2;
    for (let c = 1n; c < 50n; c++) {
      let y = 2n, x = 2n, g = 1n, q = 1n, ys = 2n, r = 1, m = 64;
      const f = v => (v * v + c) % N;
      do {
        x = y;
        for (let i = 0; i < r; i++) y = f(y);
        let k = 0;
        while (k < r && g === 1n) {
          ys = y;
          for (let i = 0; i < Math.min(m, r - k); i++) { y = f(y); q = q * (x > y ? x - y : y - x) % N; }
          g = gcdB(q, N); k += m;
        }
        r *= 2;
      } while (g === 1n);
      if (g === N) { do { ys = f(ys); g = gcdB(x > ys ? x - ys : ys - x, N); } while (g === 1n); }
      if (g !== N) return Number(g);
    }
    return n;
  }
  const gcdB = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  function factorizar(n) {
    exigeEntero(n, 'el número');
    if (n < 1) falla(`solo se factorizan enteros positivos, y llegó ${n}`);
    const out = [];
    for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]) while (n % p === 0) { out.push(p); n /= p; }
    const pila = n > 1 ? [n] : [];
    while (pila.length) {
      const m = pila.pop();
      if (m === 1) continue;
      if (esPrimoMR(m)) { out.push(m); continue; }
      const d = rhoPollard(m);
      pila.push(d, m / d);
    }
    return out.sort((a, b) => a - b);
  }
  function totiente(n) {
    exigeEntero(n, 'el número');
    if (n < 1) falla('φ(n) está definida para n ≥ 1');
    let r = n;
    for (const p of new Set(factorizar(n))) r = r / p * (p - 1);
    return r;
  }
  function esCuadradoPerfecto(n) {
    exigeEntero(n, 'el número');
    if (n < 0) return false;
    let r = Math.round(Math.sqrt(n));
    const N = BigInt(n);
    // √ en coma flotante puede fallar por uno cerca de 2⁵³: se corrige en BigInt.
    for (const c of [r - 1, r, r + 1]) if (c >= 0 && BigInt(c) * BigInt(c) === N) return true;
    return false;
  }
  function siguientePrimo(n) {
    exigeEntero(n, 'el número');
    let k = Math.max(2, Math.floor(n) + 1);
    while (!esPrimoMR(k)) { k++; if (k > MAXSEG) falla('el siguiente primo pasa de 2⁵³'); }
    return k;
  }

  return { gamma, lnGamma, beta, digamma, gammaP, gammaQ, erf, erfc, erfInversa, betaIncompleta, besselJ, zeta,
    normalDensidad, normalAcumulada, normalInversa, tStudentAcumulada, tStudentInversa, chiCuadradoAcumulada,
    chiCuadradoInversa, fisherAcumulada, binomialProb, binomialAcumulada, poissonProb, poissonAcumulada,
    exponencialAcumulada, potenciaModular, mcdExtendido, inversoModular, restoChino, fibonacci, factorizar,
    totiente, esCuadradoPerfecto, siguientePrimo, esPrimoMR };
})(NEN_CALCULO);

// ════════════════════════════════════════════════════════════════════ ADUANA
// Lo que ve Ñ. Cada «def» convierte los argumentos (listas, arreglos y
// funciones de Ñ) en lo que entiende la capa pura, llama, y convierte el
// resultado de vuelta. Los vectores vuelven con la MISMA forma con la que
// llegaron: quien da una lista recibe listas y quien da un arreglo, arreglos.
function instalarNenCalculo(vm, def) {
  const N = NEN_CALCULO, C = NEN_CALCULO2, Z = NEN_ESPECIALES;
  const L = items => vm.nuevaLista(items);
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => {
    const x = vm.exigeNum(v, n, f);
    if (!Number.isInteger(x)) vm.error(`«${f}»: el argumento ${n} tiene que ser entero y es ${x}`);
    return x;
  };
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const dic = obj => { const d = vm.nuevoDic(); for (const k of Object.keys(obj)) d.mapa.set(k, obj[k]); return d; };
  const arrDe = xs => { const a = vm.arrNuevo([xs.length], 'real'); for (let i = 0; i < xs.length; i++) a.datos[i] = xs[i]; return a; };
  const arr2De = filas => {
    const r = filas.length, c = r ? filas[0].length : 0;
    const a = vm.arrNuevo([r, c], 'real');
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) a.datos[i * c + j] = filas[i][j];
    return a;
  };
  // Una lista de números o un arreglo de una dimensión, como Array de JS.
  const nums = (v, n, f) => {
    if (v instanceof ObjArreglo) {
      if (v.forma.length !== 1) vm.error(`«${f}»: el argumento ${n} tiene que ser un arreglo de una dimensión y tiene ${v.forma.length}`);
      return vm.arrValores(v);
    }
    return vm.exigeNums(v, n, f).slice();
  };
  const matriz = (v, n, f) => {
    if (v instanceof ObjArreglo) {
      if (v.forma.length !== 2) vm.error(`«${f}»: el argumento ${n} tiene que ser una matriz (dos dimensiones)`);
      const xs = vm.arrValores(v), c = v.forma[1];
      const out = [];
      for (let i = 0; i < v.forma[0]; i++) out.push(xs.slice(i * c, (i + 1) * c));
      return out;
    }
    const l = vm.exigeLista(v, n, f);
    return l.items.map(fila => nums(fila, n, f));
  };
  const leerNums = (r, f, que) => {
    if (typeof r === 'number') return [r];
    if (r instanceof ObjArreglo) return vm.arrValores(r);
    if (r instanceof ObjLista) {
      for (const x of r.items) if (typeof x !== 'number')
        vm.error(`«${f}»: ${que} tiene que devolver números y en la lista hay ${tipoDe(x)}`);
      return r.items.slice();
    }
    vm.error(`«${f}»: ${que} tiene que devolver un número, una lista de números o un arreglo, y devolvió ${tipoDe(r)}`);
  };
  // Las funciones de Ñ, vistas desde JavaScript. Cada llamada se cobra: un
  // método numérico puede hacer miles, y el límite de instrucciones tiene que
  // poder pararlo igual que pararía un bucle escrito en Ñ.
  const fun = (v, n, f) => vm.exigeFuncion(v, n, f);
  const llamarNum = (g, args, f) => {
    vm.cobrar(1);
    const r = vm.invocar(g, args);
    if (typeof r !== 'number')
      vm.error(`«${f}»: la función tiene que devolver un número y devolvió ${tipoDe(r)}`, 'revisa el «devolver» de la función que pasaste');
    return r;
  };
  const fn1 = (v, n, f) => { const g = fun(v, n, f); return x => llamarNum(g, [x], f); };
  const fn2 = (v, n, f) => { const g = fun(v, n, f); return (x, y) => llamarNum(g, [x, y], f); };
  // El «molde» de un vector: cómo llegó (número, lista o arreglo), sus
  // valores, y cómo devolverle a Ñ un vector con esa misma forma.
  const molde = (v, n, f) => {
    if (typeof v === 'number') return { x: [v], dar: x => x[0], tipo: 'num' };
    if (v instanceof ObjArreglo) {
      if (v.forma.length !== 1) vm.error(`«${f}»: el punto tiene que ser un arreglo de una dimensión`);
      return { x: vm.arrValores(v), dar: x => arrDe(x), tipo: 'arr' };
    }
    if (v instanceof ObjLista) return { x: nums(v, n, f), dar: x => L(x.slice()), tipo: 'lista' };
    vm.error(`«${f}»: el argumento ${n} tiene que ser un número, una lista de números o un arreglo, y es ${tipoDe(v)}`);
  };
  const fnVecNum = (v, n, f, m) => { const g = fun(v, n, f); return x => llamarNum(g, [m.dar(x)], f); };
  const fnVecVec = (v, n, f, m, que) => {
    const g = fun(v, n, f);
    return x => { vm.cobrar(1); return leerNums(vm.invocar(g, [m.dar(x)]), f, que || 'la función'); };
  };
  // Para derivar y para los límites: si la función de Ñ falla en un punto
  // (log de un negativo, raíz de un negativo, un spline fuera de su rango),
  // ese punto cuenta como «no definido» —NaN— y el método achica el paso, que
  // es lo que habría hecho con un NaN de verdad. Se restaura el estado de la
  // VM igual que hace «aislado» en el eDSL probar. Si al final no sale nada,
  // se relanza el error ORIGINAL, que explica mejor que un «no es derivable».
  // El límite de instrucciones y los «lanzar» del programa no se tocan.
  const tolerante = llamar => {
    const st = { error: null };
    st.f = (...xs) => {
      const sp = vm.sp, marcos = vm.frames.length, prof = vm.profJS;
      try { return llamar(...xs); }
      catch (e) {
        if (!(e instanceof ErrorTiempoEjecucion) || e.fatal || e.limite) throw e;
        vm.cerrarUpvalues(sp); vm.frames.length = marcos; vm.sp = sp; vm.profJS = prof;
        st.error = e;
        return NaN;
      }
    };
    st.correr = cuerpo => {
      try { return cuerpo(); }
      catch (e) { if (e instanceof ErrorNenCalculo && st.error) throw st.error; throw e; }
    };
    return st;
  };
  const vecNaN = v => v.map(() => NaN);
  const matrizComo = (M, m) => (m.tipo === 'arr' ? arr2De(M) : L(M.map(fila => L(fila))));
  const sentido = (v, n, f, ops) => {
    const t = txt(v, n, f);
    if (!ops.includes(t)) vm.error(`«${f}»: «${t}» no es una opción`, `vale ${ops.map(o => '"' + o + '"').join(' o ')}`);
    return t;
  };
  // Los errores de la capa pura llevan el nombre de la función delante.
  const d = (nombre, firma, fn, doc) => def(nombre, firma, a => {
    try { return fn(a); }
    catch (e) { if (e instanceof ErrorNenCalculo) vm.error(`«${nombre}»: ${e.message}`, e.pista); throw e; }
  }, doc);
  const aridad = (a, f, min, max) => {
    if (a.length < min || a.length > max)
      vm.error(`«${f}» recibe ${min === max ? min : `de ${min} a ${max}`} argumentos y llegaron ${a.length}`);
  };

  // ── cálculo ────────────────────────────────────────────────────────────────
  d('derivar', 'funcion, real -> real', a => {
    const t = tolerante(fn1(a[0], 1, 'derivar'));
    return t.correr(() => N.derivar(t.f, num(a[1], 2, 'derivar')));
  },
    'derivar(f, x) — f′(x) por diferencias centrales con extrapolación de Richardson (Ridders) · 10 a 13 cifras');
  d('derivarN', 'funcion, real, entero -> real', a => {
    const n = ent(a[2], 3, 'derivarN');
    if (n < 0 || n > 8) vm.error(`«derivarN»: el orden tiene que estar entre 0 y 8, y es ${n}`, 'cada derivada numérica cuesta unas dos cifras: con más de 8 no queda ninguna');
    const t = tolerante(fn1(a[0], 1, 'derivarN'));
    return t.correr(() => N.derivarN(t.f, num(a[1], 2, 'derivarN'), n));
  }, 'derivarN(f, x, n) — la derivada n-ésima en x · n hasta 8, perdiendo unas dos cifras por orden');
  d('gradiente', 'funcion, lista|arreglo -> cualquiera', a => {
    const m = molde(a[1], 2, 'gradiente');
    const t = tolerante(fnVecNum(a[0], 1, 'gradiente', m));
    return m.dar(t.correr(() => N.gradiente(t.f, m.x)));
  }, 'gradiente(f, punto) — el vector de derivadas parciales de f en el punto · f recibe una lista (o un arreglo) y devuelve un número');
  d('jacobiano', 'funcion, lista|arreglo -> cualquiera', a => {
    const m = molde(a[1], 2, 'jacobiano');
    const g = fnVecVec(a[0], 1, 'jacobiano', m);
    let largo = null;
    // Un punto que falla devuelve un vector de NaN del largo de los demás.
    const t = tolerante(x => { const r = g(x); largo = r; return r; });
    const F = x => { const r = t.f(x); return typeof r === 'number' ? (largo ? vecNaN(largo) : [NaN]) : r; };
    return matrizComo(t.correr(() => N.jacobiano(F, m.x)), m);
  }, 'jacobiano(F, punto) — la matriz J[i][j] = ∂Fᵢ/∂xⱼ · F recibe y devuelve listas (o arreglos)');
  d('hessiano', 'funcion, lista|arreglo -> cualquiera', a => {
    const m = molde(a[1], 2, 'hessiano');
    const t = tolerante(fnVecNum(a[0], 1, 'hessiano', m));
    return matrizComo(t.correr(() => N.hessiano(t.f, m.x)), m);
  }, 'hessiano(f, punto) — la matriz de segundas derivadas, simétrica · de f que recibe una lista y devuelve un número');
  d('integrar', 'funcion, real, real -> real', a => N.integral(fn1(a[0], 1, 'integrar'), num(a[1], 2, 'integrar'), num(a[2], 3, 'integrar')),
    'integrar(f, a, b) — ∫ₐᵇ f(x) dx con Gauss–Kronrod adaptativo · los límites pueden ser |INFINITO o -|INFINITO');
  d('integrarDoble', 'funcion, real, real, cualquiera, cualquiera -> real', a => {
    const f = fn2(a[0], 1, 'integrarDoble');
    const lim = (v, n) => (typeof v === 'number' ? () => v : fn1(v, n, 'integrarDoble'));
    return N.integrarDoble(f, num(a[1], 2, 'integrarDoble'), num(a[2], 3, 'integrarDoble'), lim(a[3], 4), lim(a[4], 5));
  }, 'integrarDoble(f, a, b, c, d) — ∫ₐᵇ ∫_c^d f(x, y) dy dx · c y d pueden ser números o funciones de x');
  d('integrarMontecarlo', 'funcion, lista, entero -> dic', a => {
    const f = 'integrarMontecarlo';
    const g = fun(a[0], 1, f);
    const l = vm.exigeLista(a[1], 2, f);
    const n = ent(a[2], 3, f);
    if (n < 2) vm.error(`«${f}»: hacen falta al menos 2 muestras`);
    // [a, b] es una dimensión y la función recibe un número; [[a, b], [c, d]…]
    // son varias y recibe una lista.
    const unaDim = l.items.length === 2 && typeof l.items[0] === 'number';
    const lims = unaDim ? [nums(l, 2, f)] : l.items.map(p => nums(p, 2, f));
    for (const p of lims) if (p.length !== 2 || !(p[1] >= p[0]))
      vm.error(`«${f}»: cada límite es un par [desde, hasta] con desde ≤ hasta`, 'para una dimensión, [0, 1]; para dos, [[0, 1], [0, 2]]');
    // El azar es el de «numerico»: así «semilla(n)» manda también aquí.
    const azar = vm.globals.get(nombreGlobalModulo(claveEdsl('numerico'), 'azar'));
    const r = N.integrarMontecarlo(x => llamarNum(g, [unaDim ? x[0] : L(x)], f), lims, n, () => azar.fn([], vm));
    return dic({ valor: r.valor, error: r.error });
  }, 'integrarMontecarlo(f, limites, n) — {"valor", "error"} con n puntos al azar · limites = [a, b] o [[a, b], [c, d], …]; semilla() lo hace repetible');
  d('integrarDatos', '... -> real', a => {
    aridad(a, 'integrarDatos', 2, 3);
    const m = a.length > 2 ? sentido(a[2], 3, 'integrarDatos', ['simpson', 'trapecio']) : 'simpson';
    return N.integrarDatos(nums(a[0], 1, 'integrarDatos'), nums(a[1], 2, 'integrarDatos'), m);
  }, 'integrarDatos(xs, ys, metodo?) — el área bajo unos datos tabulados · Simpson (exacto en parábolas, admite x irregulares) o "trapecio"');
  d('integrarAcumulado', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a =>
    L(N.integrarAcumulado(nums(a[0], 1, 'integrarAcumulado'), nums(a[1], 2, 'integrarAcumulado'))),
    'integrarAcumulado(xs, ys) — la integral desde el primer punto hasta cada uno, por trapecios · empieza en 0');
  d('derivarDatos', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a =>
    L(N.derivarDatos(nums(a[0], 1, 'derivarDatos'), nums(a[1], 2, 'derivarDatos'))),
    'derivarDatos(xs, ys) — la pendiente en cada punto, con diferencias de segundo orden · exacta en parábolas');
  d('sumaSerie', 'funcion, entero -> real', a => N.sumaSerie(fn1(a[0], 1, 'sumaSerie'), ent(a[1], 2, 'sumaSerie')),
    'sumaSerie(termino, desde) — Σ termino(k) para k desde «desde» hasta infinito · acelerada con la transformada de Levin');
  d('limite', '... -> real', a => {
    aridad(a, 'limite', 2, 3);
    const lado = a.length > 2 ? sentido(a[2], 3, 'limite', ['izquierda', 'derecha']) : null;
    const t = tolerante(fn1(a[0], 1, 'limite'));
    return t.correr(() => N.limite(t.f, num(a[1], 2, 'limite'), lado));
  }, 'limite(f, x, lado?) — lím f cuando se acerca a x, sin evaluar en x · x puede ser |INFINITO; lado "izquierda" o "derecha"');
  d('longitudArco', 'funcion, real, real -> real', a => {
    // Tolerante: cerca de un borde del dominio (√(1 − x²) en x ≈ 1) la
    // derivada numérica asoma fuera y tiene que poder achicar el paso.
    const t = tolerante(fn1(a[0], 1, 'longitudArco'));
    return t.correr(() => N.integral(x => { const p = N.derivar(t.f, x); return Math.sqrt(1 + p * p); },
      num(a[1], 2, 'longitudArco'), num(a[2], 3, 'longitudArco')));
  }, 'longitudArco(f, a, b) — la longitud de la curva y = f(x) entre a y b · ∫ √(1 + f′²)');
  d('volumenRevolucion', 'funcion, real, real -> real', a => {
    const f = fn1(a[0], 1, 'volumenRevolucion');
    return Math.PI * N.integral(x => { const y = f(x); return y * y; }, num(a[1], 2, 'volumenRevolucion'), num(a[2], 3, 'volumenRevolucion'));
  }, 'volumenRevolucion(f, a, b) — el volumen al girar y = f(x) alrededor del eje x · π ∫ f²');
  d('areaEntre', 'funcion, funcion, real, real -> real', a => {
    const f = fn1(a[0], 1, 'areaEntre'), g = fn1(a[1], 2, 'areaEntre');
    return N.integral(x => Math.abs(f(x) - g(x)), num(a[2], 3, 'areaEntre'), num(a[3], 4, 'areaEntre'));
  }, 'areaEntre(f, g, a, b) — el área entre dos curvas, contando positiva aunque se crucen · ∫ |f − g|');
  d('polinomioTaylor', 'funcion, real, entero -> lista<real>', a => {
    const f = fn1(a[0], 1, 'polinomioTaylor'), x0 = num(a[1], 2, 'polinomioTaylor'), g = ent(a[2], 3, 'polinomioTaylor');
    if (g < 0 || g > 8) vm.error(`«polinomioTaylor»: el grado tiene que estar entre 0 y 8, y es ${g}`, 'las derivadas numéricas de orden alto no tienen cifras');
    // Σ f⁽ᵏ⁾(x0)/k!·(x − x0)ᵏ, desarrollado en potencias de x para que se
    // pueda pasar tal cual a evaluarPolinomio.
    let p = [0], fact = 1, pot = [1];
    for (let k = 0; k <= g; k++) {
      if (k > 0) { fact *= k; pot = C.multPoli(pot, [-x0, 1]); }
      const ck = N.derivarN(f, x0, k) / fact;
      p = C.sumarPoli(p, pot.map(c => c * ck));
    }
    return L(p);
  }, 'polinomioTaylor(f, x0, grado) — el polinomio de Taylor alrededor de x0, como coeficientes [c0, c1, …] en potencias de x');

  // ── ecuaciones ─────────────────────────────────────────────────────────────
  d('resolverEcuacion', 'funcion, real, real -> real', a =>
    N.raizBrent(fn1(a[0], 1, 'resolverEcuacion'), num(a[1], 2, 'resolverEcuacion'), num(a[2], 3, 'resolverEcuacion')),
    'resolverEcuacion(f, a, b) — la x de [a, b] con f(x) = 0, por el método de Brent · f(a) y f(b) tienen que tener signos distintos');
  d('raizNewton', '... -> real', a => {
    aridad(a, 'raizNewton', 2, 3);
    return N.raizNewton(fn1(a[0], 1, 'raizNewton'), num(a[1], 2, 'raizNewton'), a.length > 2 ? fn1(a[2], 3, 'raizNewton') : null);
  }, 'raizNewton(f, x0, derivada?) — una raíz de f cerca de x0 por Newton amortiguado · la derivada es opcional');
  d('raices', 'lista<real>|arreglo -> arreglo', a => {
    const r = N.raicesPoli(nums(a[0], 1, 'raices'));
    const z = vm.arrNuevo([r.re.length], 'complejo');
    for (let i = 0; i < r.re.length; i++) { z.datos[2 * i] = r.re[i]; z.datos[2 * i + 1] = r.im[i]; }
    return z;
  }, 'raices(coeficientes) — TODAS las raíces del polinomio, complejas incluidas, como arreglo complejo · [c0, c1, c2] es c0 + c1·x + c2·x²');
  d('raicesReales', 'lista<real>|arreglo -> lista<real>', a => L(N.raicesRealesPoli(nums(a[0], 1, 'raicesReales'))),
    'raicesReales(coeficientes) — las raíces reales del polinomio, de menor a mayor · [c0, c1, c2] es c0 + c1·x + c2·x²');
  d('resolverNoLineal', 'funcion, cualquiera -> cualquiera', a => {
    const m = molde(a[1], 2, 'resolverNoLineal');
    return m.dar(N.resolverNoLineal(fnVecVec(a[0], 1, 'resolverNoLineal', m), m.x));
  }, 'resolverNoLineal(F, x0) — un x con F(x) = 0 (todas las componentes), por Newton con búsqueda lineal · x0 número, lista o arreglo');
  d('puntoFijo', 'funcion, cualquiera -> cualquiera', a => {
    const m = molde(a[1], 2, 'puntoFijo');
    return m.dar(N.puntoFijo(fnVecVec(a[0], 1, 'puntoFijo', m), m.x));
  }, 'puntoFijo(g, x0) — un x con g(x) = x, iterando x ← g(x) desde x0 · converge si |g′| < 1 cerca');

  // ── optimización ───────────────────────────────────────────────────────────
  d('minimizar1D', 'funcion, real, real -> dic', a => {
    const r = N.minimizar1D(fn1(a[0], 1, 'minimizar1D'), num(a[1], 2, 'minimizar1D'), num(a[2], 3, 'minimizar1D'));
    return dic({ x: r.x, valor: r.valor });
  }, 'minimizar1D(f, a, b) — {"x", "valor"}: el mínimo de f en [a, b] por el método de Brent · x con unas 8 cifras');
  d('minimizar', 'funcion, cualquiera -> dic', a => {
    const m = molde(a[1], 2, 'minimizar');
    const r = N.nelderMead(fnVecNum(a[0], 1, 'minimizar', m), m.x);
    return dic({ x: m.dar(r.x), valor: r.valor, iteraciones: r.iteraciones });
  }, 'minimizar(f, x0) — {"x", "valor", "iteraciones"} por Nelder–Mead, sin derivadas · x0 número, lista o arreglo');
  d('minimizarBFGS', '... -> dic', a => {
    aridad(a, 'minimizarBFGS', 2, 3);
    const m = molde(a[1], 2, 'minimizarBFGS');
    const grad = a.length > 2 ? fnVecVec(a[2], 3, 'minimizarBFGS', m, 'el gradiente') : null;
    const r = N.bfgs(fnVecNum(a[0], 1, 'minimizarBFGS', m), m.x, grad);
    return dic({ x: m.dar(r.x), valor: r.valor, iteraciones: r.iteraciones });
  }, 'minimizarBFGS(f, x0, gradiente?) — {"x", "valor", "iteraciones"} por BFGS (cuasi-Newton) · para funciones suaves; gradiente numérico si no se da');
  d('maximizar', '... -> dic', a => {
    aridad(a, 'maximizar', 2, 3);
    if (a.length === 3) {
      const f = fn1(a[0], 1, 'maximizar');
      const r = N.minimizar1D(x => -f(x), num(a[1], 2, 'maximizar'), num(a[2], 3, 'maximizar'));
      return dic({ x: r.x, valor: -r.valor });
    }
    const m = molde(a[1], 2, 'maximizar');
    const f = fnVecNum(a[0], 1, 'maximizar', m);
    const r = N.nelderMead(x => -f(x), m.x);
    return dic({ x: m.dar(r.x), valor: -r.valor, iteraciones: r.iteraciones });
  }, 'maximizar(f, a, b) o maximizar(f, x0) — {"x", "valor"}: el máximo en [a, b] (Brent) o cerca de x0 (Nelder–Mead)');
  d('ajustarCurva', 'funcion, lista<real>|arreglo, lista<real>|arreglo, lista<real>|arreglo -> dic', a => {
    const f = 'ajustarCurva';
    const g = fun(a[0], 1, f);
    const r = N.levenbergMarquardt((x, p) => llamarNum(g, [x, L(p.slice())], f), nums(a[1], 2, f), nums(a[2], 3, f), nums(a[3], 4, f));
    return dic({ parametros: L(r.parametros), errores: L(r.errores), residuo: r.residuo, rmse: r.rmse, iteraciones: r.iteraciones });
  }, 'ajustarCurva(modelo, xs, ys, p0) — Levenberg–Marquardt: {"parametros", "errores", "residuo", "rmse"} · modelo(x, p) con p una lista');
  d('optimizarLineal', '... -> dic', a => {
    const f = 'optimizarLineal';
    aridad(a, f, 3, 4);
    const max = a.length > 3 && sentido(a[3], 4, f, ['minimizar', 'maximizar']) === 'maximizar';
    const r = N.simplex(nums(a[0], 1, f), matriz(a[1], 2, f), nums(a[2], 3, f), max);
    return dic({ x: L(r.x), valor: r.valor });
  }, 'optimizarLineal(c, A, b, sentido?) — {"x", "valor"}: optimiza c·x con A·x ≤ b y x ≥ 0 por el símplex · sentido "minimizar" (por defecto) o "maximizar"');

  // ── ecuaciones diferenciales ───────────────────────────────────────────────
  // y' = f(t, y). y0 puede ser un número (una ecuación), una lista o un
  // arreglo (un sistema); f recibe y devuelve lo mismo.
  const edo = (a, f, metodo) => {
    const g = fun(a[0], 1, f);
    const t0 = num(a[1], 2, f), t1 = num(a[3], 4, f);
    const m = molde(a[2], 3, f);
    const F = (t, y) => { vm.cobrar(1); return leerNums(vm.invocar(g, [t, m.dar(y)]), f, 'la función'); };
    const r = metodo(F, t0, m.x, t1);
    const ys = m.tipo === 'num' ? L(r.y.map(v => v[0])) : m.tipo === 'arr' ? arr2De(r.y) : L(r.y.map(v => L(v)));
    return dic({ t: L(r.t), y: ys });
  };
  d('resolverEDO', '... -> dic', a => {
    const f = 'resolverEDO';
    aridad(a, f, 4, 5);
    let puntos = null;
    if (a.length > 4) {
      const t0 = num(a[1], 2, f), t1 = num(a[3], 4, f);
      if (typeof a[4] === 'number') {
        const k = ent(a[4], 5, f);
        if (k < 1) vm.error(`«${f}»: el número de intervalos tiene que ser al menos 1`);
        puntos = [];
        for (let i = 0; i <= k; i++) puntos.push(i === k ? t1 : t0 + (t1 - t0) * i / k);
      } else {
        puntos = nums(a[4], 5, f);
        const dir = t1 >= t0 ? 1 : -1;
        for (let i = 1; i < puntos.length; i++) if (dir * (puntos[i] - puntos[i - 1]) < 0)
          vm.error(`«${f}»: los tiempos pedidos tienen que ir en orden, de t0 hacia t1`);
      }
    }
    return edo(a, f, (F, t0, y0, t1) => C.dopri(F, t0, y0, t1, puntos));
  }, 'resolverEDO(f, t0, y0, t1, puntos?) — {"t", "y"} de y′ = f(t, y) por Dormand–Prince adaptativo · puntos: lista de tiempos o cuántos tramos iguales');
  d('rk4', 'funcion, real, cualquiera, real, entero -> dic', a => {
    const pasos = ent(a[4], 5, 'rk4');
    if (pasos < 1) vm.error('«rk4»: hace falta al menos un paso');
    return edo(a, 'rk4', (F, t0, y0, t1) => C.rk4(F, t0, y0, t1, pasos));
  }, 'rk4(f, t0, y0, t1, pasos) — {"t", "y"} con Runge–Kutta clásico de paso fijo · el de los libros, sin control de error');
  d('resolverEDORigida', '... -> dic', a => {
    aridad(a, 'resolverEDORigida', 4, 5);
    const pasos = a.length > 4 ? ent(a[4], 5, 'resolverEDORigida') : 1000;
    if (pasos < 2) vm.error('«resolverEDORigida»: hacen falta al menos dos pasos');
    return edo(a, 'resolverEDORigida', (F, t0, y0, t1) => C.bdf2(F, t0, y0, t1, pasos));
  }, 'resolverEDORigida(f, t0, y0, t1, pasos?) — {"t", "y"} con BDF2 implícito de paso fijo (1000 por defecto) · para sistemas rígidos');

  // ── polinomios: [c0, c1, c2] es c0 + c1·x + c2·x² ──────────────────────────
  const poli = (v, n, f) => {
    const p = nums(v, n, f);
    if (!p.length) vm.error(`«${f}»: el polinomio está vacío`, 'el polinomio cero es [0]');
    return p;
  };
  const mapear = (v, n, f, g) => {
    if (typeof v === 'number') return g(v);
    if (v instanceof ObjArreglo) return arrDe(nums(v, n, f).map(g));
    if (v instanceof ObjLista) return L(nums(v, n, f).map(g));
    vm.error(`«${f}»: el argumento ${n} tiene que ser un número, una lista o un arreglo, y es ${tipoDe(v)}`);
  };
  d('evaluarPolinomio', 'lista<real>|arreglo, cualquiera -> cualquiera', a => {
    const p = poli(a[0], 1, 'evaluarPolinomio');
    return mapear(a[1], 2, 'evaluarPolinomio', x => C.evaluarPoli(p, x));
  }, 'evaluarPolinomio(p, x) — p(x) por Horner · x puede ser un número, una lista o un arreglo');
  d('derivarPolinomio', 'lista<real>|arreglo -> lista<real>', a => L(C.derivarPoli(poli(a[0], 1, 'derivarPolinomio'))),
    'derivarPolinomio(p) — los coeficientes de p′ · derivarPolinomio([1, 2, 3]) es [2, 6]');
  d('integrarPolinomio', '... -> lista<real>', a => {
    aridad(a, 'integrarPolinomio', 1, 2);
    return L(C.integrarPoli(poli(a[0], 1, 'integrarPolinomio'), a.length > 1 ? num(a[1], 2, 'integrarPolinomio') : 0));
  }, 'integrarPolinomio(p, constante?) — una primitiva de p, con la constante que digas (0 si no)');
  d('sumarPolinomios', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a =>
    L(C.sumarPoli(poli(a[0], 1, 'sumarPolinomios'), poli(a[1], 2, 'sumarPolinomios'))), 'sumarPolinomios(p, q) — p + q');
  d('restarPolinomios', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a =>
    L(C.restarPoli(poli(a[0], 1, 'restarPolinomios'), poli(a[1], 2, 'restarPolinomios'))), 'restarPolinomios(p, q) — p − q');
  d('multiplicarPolinomios', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a =>
    L(C.multPoli(poli(a[0], 1, 'multiplicarPolinomios'), poli(a[1], 2, 'multiplicarPolinomios'))), 'multiplicarPolinomios(p, q) — p·q');
  d('dividirPolinomios', 'lista<real>|arreglo, lista<real>|arreglo -> dic', a => {
    const r = C.dividirPoli(poli(a[0], 1, 'dividirPolinomios'), poli(a[1], 2, 'dividirPolinomios'));
    return dic({ cociente: L(r.cociente), resto: L(r.resto) });
  }, 'dividirPolinomios(p, q) — {"cociente", "resto"} de la división larga · p = cociente·q + resto');
  d('polinomioDesdeRaices', 'lista<real>|arreglo -> lista<real>', a => L(C.poliDesdeRaices(nums(a[0], 1, 'polinomioDesdeRaices'))),
    'polinomioDesdeRaices(raices) — el polinomio mónico (x − r1)(x − r2)… · [1, 2] da [2, −3, 1]');
  d('ajustePolinomico', 'lista<real>|arreglo, lista<real>|arreglo, entero -> lista<real>', a =>
    L(C.ajustePolinomico(nums(a[0], 1, 'ajustePolinomico'), nums(a[1], 2, 'ajustePolinomico'), ent(a[2], 3, 'ajustePolinomico'))),
    'ajustePolinomico(xs, ys, grado) — el polinomio de ese grado más cercano a los datos (mínimos cuadrados con QR)');
  d('textoPolinomio', '... -> texto', a => {
    aridad(a, 'textoPolinomio', 1, 2);
    return C.textoPoli(poli(a[0], 1, 'textoPolinomio'), a.length > 1 ? txt(a[1], 2, 'textoPolinomio') : 'x');
  }, 'textoPolinomio(p, variable?) — el polinomio escrito como en la pizarra · [1, -2, 3] da «3x² − 2x + 1»');

  // ── interpolación ──────────────────────────────────────────────────────────
  d('interpolarLineal', 'lista<real>|arreglo, lista<real>|arreglo, cualquiera -> cualquiera', a => {
    const f = 'interpolarLineal';
    const xs = nums(a[0], 1, f), ys = nums(a[1], 2, f);
    try { C.exigeCrecientes(xs, ys); } catch (e) { if (e instanceof ErrorNenCalculo) vm.error(`«${f}»: ${e.message}`, e.pista); throw e; }
    return mapear(a[2], 3, f, x => C.interpLineal(xs, ys, x));
  }, 'interpolarLineal(xs, ys, x) — une los puntos con rectas y lee en x · x número, lista o arreglo, dentro del rango');
  d('interpolarLagrange', 'lista<real>|arreglo, lista<real>|arreglo, cualquiera -> cualquiera', a => {
    const f = 'interpolarLagrange';
    const xs = nums(a[0], 1, f), ys = nums(a[1], 2, f);
    if (xs.length !== ys.length || !xs.length) vm.error(`«${f}»: hay ${xs.length} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    const w = C.pesosBaricentricos(xs);
    return mapear(a[2], 3, f, x => C.interpLagrange(xs, ys, w, x));
  }, 'interpolarLagrange(xs, ys, x) — el polinomio que pasa por todos los puntos, evaluado en x (forma baricéntrica)');
  d('polinomioInterpolante', 'lista<real>|arreglo, lista<real>|arreglo -> lista<real>', a => {
    const f = 'polinomioInterpolante';
    const xs = nums(a[0], 1, f), ys = nums(a[1], 2, f);
    if (xs.length !== ys.length || !xs.length) vm.error(`«${f}»: hay ${xs.length} valores de x y ${ys.length} de y`, 'tienen que ir por parejas');
    return L(C.poliInterpolante(xs, ys));
  }, 'polinomioInterpolante(xs, ys) — los coeficientes del polinomio que pasa por todos los puntos (diferencias divididas)');
  let splines = 0;
  d('splineCubico', '... -> funcion(real): real', a => {
    const f = 'splineCubico';
    aridad(a, f, 2, 3);
    const tipo = a.length > 2 ? sentido(a[2], 3, f, ['natural', 'noNodo']) : 'natural';
    const s = C.spline(nums(a[0], 1, f), nums(a[1], 2, f), tipo);
    // Lo que se devuelve es una FUNCIÓN de Ñ: «fijo s = splineCubico(xs, ys)»
    // y luego «s(2.5)». Se crea como nativa con el mismo mecanismo que usa
    // «espia» en el eDSL probar, y se quita del ámbito global en el acto.
    const nombre = ' nenSpline' + (splines++);
    vm.definirNativa(nombre, 'real -> real', b => {
      try { return s.evaluar(num(b[0], 1, 'spline')); }
      catch (e) { if (e instanceof ErrorNenCalculo) vm.error(`«spline»: ${e.message}`, e.pista); throw e; }
    }, 'un spline cúbico');
    const obj = vm.globals.get(nombre);
    vm.globals.delete(nombre);
    return obj;
  }, 'splineCubico(xs, ys, tipo?) — una FUNCIÓN s con s(x) suave por los puntos · tipo "natural" (por defecto) o "noNodo"');
  d('interpolar', '... -> cualquiera', a => {
    const f = 'interpolar';
    aridad(a, f, 3, 4);
    const metodo = a.length > 3 ? sentido(a[3], 4, f, ['lineal', 'lagrange', 'spline']) : 'lineal';
    const xs = nums(a[0], 1, f), ys = nums(a[1], 2, f);
    let g;
    if (metodo === 'lagrange') {
      if (xs.length !== ys.length) vm.error(`«${f}»: hay ${xs.length} valores de x y ${ys.length} de y`);
      const w = C.pesosBaricentricos(xs);
      g = x => C.interpLagrange(xs, ys, w, x);
    } else if (metodo === 'spline') g = C.spline(xs, ys, 'natural').evaluar;
    else { C.exigeCrecientes(xs, ys); g = x => C.interpLineal(xs, ys, x); }
    return mapear(a[2], 3, f, g);
  }, 'interpolar(xs, ys, x, metodo?) — el valor entre datos · metodo "lineal" (por defecto), "lagrange" o "spline"');

  // ── funciones especiales ───────────────────────────────────────────────────
  const r1 = (nombre, fn, doc) => d(nombre, 'real -> real', a => fn(num(a[0], 1, nombre)), doc);
  r1('gamma', Z.gamma, 'gamma(x) — Γ(x), el factorial continuo: gamma(n) = (n−1)! · Lanczos, unas 15 cifras');
  r1('lnGamma', Z.lnGamma, 'lnGamma(x) — ln |Γ(x)|, para cuando Γ(x) no cabe en un número');
  d('beta', 'real, real -> real', a => Z.beta(num(a[0], 1, 'beta'), num(a[1], 2, 'beta')), 'beta(a, b) — B(a, b) = Γ(a)Γ(b)/Γ(a+b)');
  r1('digamma', Z.digamma, 'digamma(x) — ψ(x) = Γ′(x)/Γ(x)');
  r1('erf', Z.erf, 'erf(x) — la función error, (2/√π) ∫₀ˣ e^(−t²) dt');
  r1('erfc', Z.erfc, 'erfc(x) — 1 − erf(x), calculada sin restar: conserva las cifras en la cola');
  r1('erfInversa', Z.erfInversa, 'erfInversa(y) — la x con erf(x) = y, para y entre −1 y 1');
  d('gammaIncompleta', '... -> real', a => {
    aridad(a, 'gammaIncompleta', 2, 3);
    const s = a.length > 2 ? sentido(a[2], 3, 'gammaIncompleta', ['inferior', 'superior']) : 'inferior';
    const x = num(a[0], 1, 'gammaIncompleta'), y = num(a[1], 2, 'gammaIncompleta');
    return s === 'superior' ? Z.gammaQ(x, y) : Z.gammaP(x, y);
  }, 'gammaIncompleta(a, x, cola?) — la gamma incompleta REGULARIZADA P(a, x) = γ(a, x)/Γ(a) · "superior" da Q = 1 − P');
  d('betaIncompleta', 'real, real, real -> real', a =>
    Z.betaIncompleta(num(a[0], 1, 'betaIncompleta'), num(a[1], 2, 'betaIncompleta'), num(a[2], 3, 'betaIncompleta')),
    'betaIncompleta(a, b, x) — la beta incompleta regularizada Iₓ(a, b), entre 0 y 1');
  d('besselJ', 'entero, real -> real', a => Z.besselJ(ent(a[0], 1, 'besselJ'), num(a[1], 2, 'besselJ')),
    'besselJ(n, x) — la función de Bessel de primera especie Jₙ(x), de orden entero');
  r1('zeta', Z.zeta, 'zeta(s) — la ζ de Riemann · zeta(2) = π²/6');

  // ── probabilidad ───────────────────────────────────────────────────────────
  // normal(x) o normal(x, media, desviacion): la estándar si no se dice.
  const normal = (nombre, fn, doc) => d(nombre, '... -> real', a => {
    if (a.length !== 1 && a.length !== 3) vm.error(`«${nombre}» recibe 1 argumento (normal estándar) o 3 (con media y desviación), y llegaron ${a.length}`);
    return fn(num(a[0], 1, nombre), a.length > 1 ? num(a[1], 2, nombre) : 0, a.length > 1 ? num(a[2], 3, nombre) : 1);
  }, doc);
  normal('normalDensidad', Z.normalDensidad, 'normalDensidad(x, media?, desviacion?) — la campana de Gauss en x · estándar si solo das x');
  normal('normalAcumulada', Z.normalAcumulada, 'normalAcumulada(x, media?, desviacion?) — P(X ≤ x) de una normal');
  normal('normalInversa', Z.normalInversa, 'normalInversa(p, media?, desviacion?) — el x con P(X ≤ x) = p · normalInversa(0.975) ≈ 1.96');
  const r2 = (nombre, firma, fn, doc) => d(nombre, firma, a => fn(...a.map((v, i) => num(v, i + 1, nombre))), doc);
  r2('tStudentAcumulada', 'real, real -> real', Z.tStudentAcumulada, 'tStudentAcumulada(t, gl) — P(T ≤ t) de una t de Student con gl grados de libertad');
  r2('tStudentInversa', 'real, real -> real', Z.tStudentInversa, 'tStudentInversa(p, gl) — el t con P(T ≤ t) = p · el valor crítico de un intervalo de confianza');
  r2('chiCuadradoAcumulada', 'real, real -> real', Z.chiCuadradoAcumulada, 'chiCuadradoAcumulada(x, gl) — P(X ≤ x) de una χ² con gl grados de libertad');
  r2('chiCuadradoInversa', 'real, real -> real', Z.chiCuadradoInversa, 'chiCuadradoInversa(p, gl) — el x con P(X ≤ x) = p de una χ²');
  r2('fisherAcumulada', 'real, real, real -> real', Z.fisherAcumulada, 'fisherAcumulada(x, gl1, gl2) — P(X ≤ x) de una F de Fisher–Snedecor');
  r2('binomialProb', 'entero, entero, real -> real', Z.binomialProb, 'binomialProb(k, n, p) — P(X = k): k éxitos en n intentos con probabilidad p');
  r2('binomialAcumulada', 'entero, entero, real -> real', Z.binomialAcumulada, 'binomialAcumulada(k, n, p) — P(X ≤ k) de una binomial');
  r2('poissonProb', 'entero, real -> real', Z.poissonProb, 'poissonProb(k, lambda) — P(X = k) de una Poisson de media lambda');
  r2('poissonAcumulada', 'entero, real -> real', Z.poissonAcumulada, 'poissonAcumulada(k, lambda) — P(X ≤ k) de una Poisson');
  r2('exponencialAcumulada', 'real, real -> real', Z.exponencialAcumulada, 'exponencialAcumulada(x, lambda) — P(X ≤ x) = 1 − e^(−λx)');

  // ── teoría de números ──────────────────────────────────────────────────────
  const e2 = (nombre, firma, fn, doc) => d(nombre, firma, a => fn(...a.map((v, i) => ent(v, i + 1, nombre))), doc);
  e2('potenciaModular', 'entero, entero, entero -> entero', Z.potenciaModular, 'potenciaModular(b, e, m) — bᵉ mod m, exacto aunque bᵉ tenga millones de cifras');
  e2('inversoModular', 'entero, entero -> entero', Z.inversoModular, 'inversoModular(a, m) — el x con a·x ≡ 1 (mod m) · solo existe si mcd(a, m) = 1');
  d('mcdExtendido', 'entero, entero -> dic', a => dic(Z.mcdExtendido(ent(a[0], 1, 'mcdExtendido'), ent(a[1], 2, 'mcdExtendido'))),
    'mcdExtendido(a, b) — {"mcd", "x", "y"} con a·x + b·y = mcd (identidad de Bézout)');
  d('restoChino', 'lista<entero>, lista<entero> -> dic', a => {
    const r = Z.restoChino(nums(a[0], 1, 'restoChino'), nums(a[1], 2, 'restoChino'));
    return dic({ resto: r.resto, modulo: r.modulo });
  }, 'restoChino(restos, modulos) — {"resto", "modulo"}: el x que deja esos restos, y cada cuánto se repite');
  e2('fibonacci', 'entero -> entero', Z.fibonacci, 'fibonacci(n) — el n-ésimo de Fibonacci · exacto hasta F(78); después, aproximado');
  e2('totiente', 'entero -> entero', Z.totiente, 'totiente(n) — φ(n): cuántos de 1…n son primos relativos con n');
  d('factorizar', 'entero -> lista<entero>', a => L(Z.factorizar(ent(a[0], 1, 'factorizar'))),
    'factorizar(n) — los factores primos con repetición, de menor a mayor · factorizar(12) es [2, 2, 3]');
  e2('esCuadradoPerfecto', 'entero -> bool', Z.esCuadradoPerfecto, 'esCuadradoPerfecto(n) — si n = k² para algún entero k');
  e2('siguientePrimo', 'entero -> entero', Z.siguientePrimo, 'siguientePrimo(n) — el menor primo mayor que n');
}

if (typeof module !== 'undefined') module.exports = { instalarNenCalculo };
