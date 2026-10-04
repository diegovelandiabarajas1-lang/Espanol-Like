// ============================================================================
//  Ñ v4 — eDSL «numerico»: cuentas de todo tipo
//  Parte 11.
//
//  Se importa con:  usar "numerico"
//
//  UNO Y NO TRES. Matemáticas, estadística y álgebra lineal viven juntas porque
//  quien hace cuentas las mezcla en el mismo archivo: separarlas obligaría a
//  tres líneas de «usar» para sacar la media de una columna. El criterio de
//  toda la familia de eDSL es el co-uso, no la disciplina académica.
//
//  Este también se MUDA, no se escribe: son los mismos nombres, los mismos
//  cuerpos y las mismas firmas que estaban en el ámbito global. Los renombres
//  que propone la especificación —«potencia» en vez de «pot», «azar» en vez de
//  «aleatorio», «suma» en vez de «sumar»— son una decisión aparte.
//
//  Lo que NO se muda:
//
//    |PI, |E, |INFINITO   son constantes del lenguaje, con sigilo. Están
//                         siempre y sin «usar», porque nadie puede declarar un
//                         nombre con «|» y por tanto no hay nada que tapar.
//                         «E» a secas era un accidente esperando: «var E = 5»
//                         lo tapaba en silencio.
//    maximo, minimo       comparan números, texto y fechas por igual, así que
//                         son genéricos como «contiene» — se quedan en el núcleo.
// ============================================================================
'use strict';

function instalarNumerico(vm) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);
  const nums = (v, n, f) => vm.exigeNums(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);

  // ── el azar ────────────────────────────────────────────────────────────────
  // Generador propio (mulberry32) en vez de Math.random, por dos razones que se
  // notan: se puede SEMBRAR —«semilla(7)» hace repetible una simulación o una
  // prueba— y da la misma secuencia en Node y en QuickJS, que con Math.random
  // no está garantizado. Arranca sembrado del reloj, así que sin «semilla» se
  // comporta como se espera de algo aleatorio.
  let sem = (Date.now() ^ (Math.random() * 4294967296)) >>> 0;
  const sig = () => {
    sem = (sem + 0x6D2B79F5) >>> 0;
    let t = sem;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Box-Muller, con la segunda muestra guardada: cada vuelta da dos normales y
  // tirar una sería trabajo doble.
  let guardada = null;
  const normal = () => {
    if (guardada !== null) { const g = guardada; guardada = null; return g; }
    let u = 0;
    while (u === 0) u = sig();
    const v = sig();
    const r = Math.sqrt(-2 * Math.log(u));
    guardada = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  const promedio = xs => xs.reduce((p, c) => p + c, 0) / xs.length;

  // ── arreglos: forma, tipo y memoria contigua ───────────────────────────────
  // Dos puertas. «arr» es la de siempre y desde que existe el tipo «complejo»
  // también lo RECHAZA: así las ciento cincuenta funciones que ya había no
  // pudieron empezar a leer la mitad de los números de un complejo y devolver
  // algo con pinta de resultado. «arrC» es la puerta de las que sí saben, y son
  // pocas y están contadas. El día que se enseñe a otra, se le cambia la puerta.
  const arr = (v, n, f) => {
    if (!(v instanceof ObjArreglo)) vm.error(`«${f}»: el argumento ${n} debe ser un arreglo y es ${tipoDe(v)}`);
    vm.nadaDeComplejos(v, f);
    return v;
  };
  const arrC = (v, n, f) => {
    if (!(v instanceof ObjArreglo)) vm.error(`«${f}»: el argumento ${n} debe ser un arreglo y es ${tipoDe(v)}`);
    return v;
  };
  // «bool» está desde que existen las máscaras: es lo que devuelven las
  // comparaciones, así que tiene que poder pedirse y convertirse como los otros.
  const TIPOS_OK = ['real', 'entero', 'bool'];
  // Una forma puede venir como número —arreglo de una dimensión— o como lista.
  const formaDe = (v, f) => {
    const xs = typeof v === 'number' ? [v] : lst(v, 1, f).items;
    const out = [];
    for (const x of xs) {
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 0)
        vm.error(`«${f}»: la forma son enteros no negativos y llegó ${repr(x, 1)}`);
      out.push(x);
    }
    if (!out.length) vm.error(`«${f}»: la forma no puede estar vacía`);
    if (out.length > 8) vm.error(`«${f}»: como mucho 8 dimensiones`);
    return out;
  };
  const tipoArg = (v, f) => {
    if (v === undefined || v === null) return 'real';
    const t = txtA(v, f);
    // El mensaje sale de la lista, no de una copia a mano: cuando se añadió
    // «bool» el mensaje siguió diciendo que solo había dos tipos.
    if (!TIPOS_OK.includes(t))
      vm.error(`«${f}»: el tipo es ${TIPOS_OK.map(x => '"' + x + '"').join(', ')} y llegó «${t}»`,
        'los complejos no se piden así: se hacen con complejo(re, im)');
    return t;
  };
  const txtA = (v, f) => {
    if (typeof v !== 'string') vm.error(`«${f}»: se esperaba un texto y llegó ${tipoDe(v)}`);
    return v;
  };
  // De una lista —posiblemente anidada— a forma + números, comprobando que la
  // anidación sea rectangular. Una lista de listas de distinto largo no es un
  // arreglo, y decirlo aquí es mejor que rellenar con ceros en silencio.
  function desdeLista(l, f) {
    const forma = [];
    let nivel = l;
    while (nivel instanceof ObjLista) {
      forma.push(nivel.items.length);
      nivel = nivel.items.length ? nivel.items[0] : null;
      if (forma.length > 8) vm.error(`«${f}»: como mucho 8 dimensiones`);
    }
    const plano = [];
    (function baja(x, d) {
      if (d === forma.length) {
        if (typeof x !== 'number') vm.error(`«${f}»: todos los elementos tienen que ser números y hay ${tipoDe(x)}`);
        plano.push(x);
        return;
      }
      if (!(x instanceof ObjLista))
        vm.error(`«${f}»: la anidación no es rectangular`,
          `en el nivel ${d + 1} se esperaba una lista de ${forma[d]} y llegó ${tipoDe(x)}`);
      if (x.items.length !== forma[d])
        vm.error(`«${f}»: la anidación no es rectangular`,
          `una fila tiene ${x.items.length} elementos y otra ${forma[d]}`);
      for (const y of x.items) baja(y, d + 1);
    })(l, 0);
    return { forma, plano };
  }
  const todoEntero = xs => xs.every(x => Number.isInteger(x));
  const tamanoDeF = f => f.reduce((a, b) => a * b, 1);

  // ── la transformada de Fourier ─────────────────────────────────────────────
  // Dos algoritmos y una decisión. El rápido de todos los libros, Cooley-Tukey,
  // solo sirve si el número de datos es potencia de dos. Lo que suele hacerse
  // con los demás tamaños es caer a la suma directa, que es O(n²): con 10.000
  // datos son 10⁸ operaciones y parece que el programa se colgó. Así que los
  // tamaños que no son potencia de dos van por Bluestein, que los convierte en
  // una convolución y los resuelve con tres transformadas de las rápidas. El
  // resultado es que «fourier» no tiene ningún tamaño malo escondido.

  // Las raíces de la unidad, calculadas con coseno y seno de verdad y no
  // multiplicando la anterior por w. Multiplicar acumula error: en n = 2²⁰ la
  // última raíz sale con ocho cifras buenas en vez de dieciséis, y eso se ve
  // en el resultado. La tabla se calcula una vez por tamaño y se guarda.
  const tablas = new Map();
  const tablaDe = n => {
    let t = tablas.get(n);
    if (t) return t;
    const mitad = n >> 1, re = new Float64Array(mitad), im = new Float64Array(mitad);
    for (let k = 0; k < mitad; k++) {
      const ang = (-2 * Math.PI * k) / n;
      re[k] = Math.cos(ang); im[k] = Math.sin(ang);
    }
    t = { re, im };
    // Más de unas pocas tablas no hacen falta: quien transforma, transforma
    // muchas veces el mismo tamaño.
    if (tablas.size > 8) tablas.clear();
    tablas.set(n, t);
    return t;
  };

  // Cooley-Tukey iterativo, en el sitio, sobre [re, im, re, im, …].
  // «signo» es −1 para la directa y +1 para la inversa (sin dividir entre n:
  // eso lo hace quien llama, porque «convolucion» no quiere la división).
  function fft2(d, n, signo) {
    if (n === 1) return;
    // Inversión de bits: deja cada número donde le toca para que después los
    // cruces sean entre vecinos y no haya que copiar nada.
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = d[2 * i]; d[2 * i] = d[2 * j]; d[2 * j] = t;
        t = d[2 * i + 1]; d[2 * i + 1] = d[2 * j + 1]; d[2 * j + 1] = t;
      }
    }
    const tab = tablaDe(n);
    for (let largo = 2; largo <= n; largo <<= 1) {
      const mitad = largo >> 1, salto = n / largo;
      for (let i = 0; i < n; i += largo) {
        for (let k = 0; k < mitad; k++) {
          const w = k * salto;
          const wr = tab.re[w], wi = signo < 0 ? tab.im[w] : -tab.im[w];
          const p = i + k, q = p + mitad;
          const qr = d[2 * q], qi = d[2 * q + 1];
          const vr = qr * wr - qi * wi, vi = qr * wi + qi * wr;
          const ur = d[2 * p], ui = d[2 * p + 1];
          d[2 * p] = ur + vr; d[2 * p + 1] = ui + vi;
          d[2 * q] = ur - vr; d[2 * q + 1] = ui - vi;
        }
      }
    }
  }

  // Bluestein. El truco es que j·k = (j² + k² − (k−j)²)/2, y con eso la suma de
  // la transformada se vuelve una convolución entre los datos multiplicados por
  // una «chirp» y la chirp al revés. La convolución sí se hace con el algoritmo
  // rápido, en un tamaño potencia de dos que elegimos nosotros.
  function fftBluestein(d, n, signo) {
    const t = 1 << Math.ceil(Math.log2(2 * n - 1));
    const A = new Float64Array(2 * t), B = new Float64Array(2 * t);
    const cr = new Float64Array(n), ci = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      // j² mód 2n en vez de j² a secas: j² se sale del entero exacto de un
      // real en cuanto n pasa de unos millones, y el ángulo sería basura.
      const m = (j * j) % (2 * n);
      const ang = (signo * Math.PI * m) / n;
      cr[j] = Math.cos(ang); ci[j] = Math.sin(ang);
      const xr = d[2 * j], xi = d[2 * j + 1];
      A[2 * j] = xr * cr[j] - xi * ci[j];
      A[2 * j + 1] = xr * ci[j] + xi * cr[j];
      // La chirp conjugada, simétrica alrededor de t para que la convolución
      // circular de tamaño t dé la lineal que queremos.
      B[2 * j] = cr[j]; B[2 * j + 1] = -ci[j];
      if (j > 0) { B[2 * (t - j)] = cr[j]; B[2 * (t - j) + 1] = -ci[j]; }
    }
    fft2(A, t, -1); fft2(B, t, -1);
    for (let i = 0; i < t; i++) {
      const ar = A[2 * i], ai = A[2 * i + 1], br = B[2 * i], bi = B[2 * i + 1];
      A[2 * i] = ar * br - ai * bi; A[2 * i + 1] = ar * bi + ai * br;
    }
    fft2(A, t, 1);
    for (let k = 0; k < n; k++) {
      const vr = A[2 * k] / t, vi = A[2 * k + 1] / t;
      d[2 * k] = vr * cr[k] - vi * ci[k];
      d[2 * k + 1] = vr * ci[k] + vi * cr[k];
    }
  }
  const potenciaDeDos = n => (n & (n - 1)) === 0;
  const transformar = (d, n, signo) => (potenciaDeDos(n) ? fft2(d, n, signo) : fftBluestein(d, n, signo));
  // Los números de un arreglo —real o complejo— en un Float64Array de 2n.
  const aPlano = x => {
    if (x.tipo === 'complejo') return vm.arrPlanosC(x);
    const v = vm.arrValores(x), d = new Float64Array(2 * v.length);
    for (let i = 0; i < v.length; i++) d[2 * i] = v[i];
    return d;
  };

  // ── el andamio del álgebra lineal ──────────────────────────────────────────
  // Todo lo de abajo trabaja sobre un Float64Array plano de n×m en orden de
  // filas, no sobre el ObjArreglo: así las descomposiciones se escriben como en
  // cualquier libro de métodos numéricos, y entran y salen por estas dos
  // funciones. Es también la razón de que sean rápidas: ni cajas ni zancadas
  // dentro del bucle.
  const mat2 = (v, n, f) => {
    const x = arr(v, n, f);
    if (x.dimensiones !== 2)
      vm.error(`«${f}»: se esperaba una matriz (2 dimensiones) y llegó una de ${x.dimensiones}`,
        x.dimensiones === 1 ? 'pásala a matriz con expandir(a, 0) o expandir(a, 1)' : null);
    return x;
  };
  const cuadrada = (v, n, f) => {
    const x = mat2(v, n, f);
    if (x.forma[0] !== x.forma[1])
      vm.error(`«${f}» necesita una matriz cuadrada y llegó una de ${x.forma.join('×')}`);
    return x;
  };
  // Los números de una matriz, planos y en orden de filas.
  const planos = x => {
    const v = vm.arrValores(x);
    const d = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) d[i] = v[i];
    return d;
  };
  // Y de vuelta a un arreglo.
  const deMatriz = (d, nf, nc) => {
    const out = vm.arrNuevo([nf, nc], 'real');
    out.datos.set(d.subarray(0, nf * nc));
    return out;
  };
  const deVector = d => {
    const out = vm.arrNuevo([d.length], 'real');
    out.datos.set(d);
    return out;
  };

  // LU con pivoteo parcial. Es la base de resolver, el determinante y la
  // inversa: las tres salían antes de tres eliminaciones gaussianas distintas.
  // Devuelve la matriz combinada —L debajo de la diagonal, U en ella y encima—,
  // las permutaciones y el signo, que es lo que hace falta para el determinante.
  function luDe(a, n, quien) {
    const lu = Float64Array.from(a);
    const piv = new Int32Array(n);
    for (let i = 0; i < n; i++) piv[i] = i;
    let signo = 1;
    for (let k = 0; k < n; k++) {
      // El pivote más grande de la columna: sin esto una matriz perfectamente
      // resoluble puede dar basura por dividir entre algo diminuto.
      let p = k, mx = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > mx) { mx = v; p = i; }
      }
      if (mx === 0) return { lu, piv, signo, singular: k };
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = lu[k * n + j]; lu[k * n + j] = lu[p * n + j]; lu[p * n + j] = t; }
        const t = piv[k]; piv[k] = piv[p]; piv[p] = t;
        signo = -signo;
      }
      const d = lu[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = lu[i * n + k] / d;
        lu[i * n + k] = f;
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
      }
    }
    void quien;
    return { lu, piv, signo, singular: -1 };
  }
  // Resolver con una LU ya hecha, para un lado derecho. Separado porque
  // resolver diez sistemas con la misma matriz no debe factorizar diez veces:
  // es justo lo que hace la inversa.
  function luResolver(lu, piv, n, b) {
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = b[piv[i]];
    for (let i = 1; i < n; i++) { let s = x[i]; for (let j = 0; j < i; j++) s -= lu[i * n + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
      x[i] = s / lu[i * n + i];
    }
    return x;
  }

  // QR por reflexiones de Householder. Más estable que Gram-Schmidt, que pierde
  // la ortogonalidad en cuanto las columnas se parecen, y es lo que hace que los
  // mínimos cuadrados den la respuesta buena y no una parecida.
  function qrDe(a, nf, nc) {
    const R = Float64Array.from(a);
    const Q = new Float64Array(nf * nf);
    for (let i = 0; i < nf; i++) Q[i * nf + i] = 1;
    const pasos = Math.min(nf - 1, nc);
    const v = new Float64Array(nf);
    for (let k = 0; k < pasos; k++) {
      let norma = 0;
      for (let i = k; i < nf; i++) norma += R[i * nc + k] * R[i * nc + k];
      norma = Math.sqrt(norma);
      if (norma === 0) continue;
      const alfa = R[k * nc + k] >= 0 ? -norma : norma;
      for (let i = k; i < nf; i++) v[i] = R[i * nc + k];
      v[k] -= alfa;
      let vv = 0;
      for (let i = k; i < nf; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      // R ← (I − 2vvᵗ/vᵗv) R  y  Q ← Q (I − 2vvᵗ/vᵗv)
      for (let j = 0; j < nc; j++) {
        let s = 0;
        for (let i = k; i < nf; i++) s += v[i] * R[i * nc + j];
        s = (2 * s) / vv;
        for (let i = k; i < nf; i++) R[i * nc + j] -= s * v[i];
      }
      for (let i = 0; i < nf; i++) {
        let s = 0;
        for (let j = k; j < nf; j++) s += Q[i * nf + j] * v[j];
        s = (2 * s) / vv;
        for (let j = k; j < nf; j++) Q[i * nf + j] -= s * v[j];
      }
    }
    return { Q, R };
  }

  // SVD por Jacobi de un lado: se van rotando pares de columnas hasta que son
  // ortogonales. Es más lento que el método de Golub-Kahan y cabe en treinta
  // líneas que se pueden leer y comprobar, lo cual para esta biblioteca pesa
  // más. Da V exacto y los valores singulares como las normas de las columnas.
  function svdDe(a, nf, nc) {
    // Las dos matrices se guardan TRANSPUESTAS, por columnas en memoria seguida.
    // Jacobi de un lado no hace otra cosa que coger dos columnas y rotarlas, y
    // recorrer una columna de una matriz guardada por filas salta nc números en
    // cada paso: un fallo de caché por número. Así los cuatro bucles de dentro
    // van seguidos. Se destransponen al final, gratis, porque de todos modos
    // hay que copiarlas para ordenarlas.
    const Ut = new Float64Array(nc * nf);
    for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) Ut[j * nf + i] = a[i * nc + j];
    const Vt = new Float64Array(nc * nc);
    for (let i = 0; i < nc; i++) Vt[i * nc + i] = 1;
    const EPS = 1e-14;
    for (let vuelta = 0; vuelta < 60; vuelta++) {
      let fuera = 0;
      for (let p = 0; p < nc - 1; p++) {
        const op = p * nf, oq0 = p * nc;
        for (let q = p + 1; q < nc; q++) {
          const oq = q * nf;
          let app = 0, aqq = 0, apq = 0;
          for (let i = 0; i < nf; i++) {
            const x = Ut[op + i], y = Ut[oq + i];
            app += x * x; aqq += y * y; apq += x * y;
          }
          if (Math.abs(apq) <= EPS * Math.sqrt(app * aqq)) continue;
          fuera = Math.max(fuera, Math.abs(apq) / Math.sqrt(app * aqq || 1));
          const tau = (aqq - app) / (2 * apq);
          const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
          const c = 1 / Math.sqrt(1 + t * t), sn = c * t;
          for (let i = 0; i < nf; i++) {
            const x = Ut[op + i], y = Ut[oq + i];
            Ut[op + i] = c * x - sn * y;
            Ut[oq + i] = sn * x + c * y;
          }
          const ovq = q * nc;
          for (let i = 0; i < nc; i++) {
            const x = Vt[oq0 + i], y = Vt[ovq + i];
            Vt[oq0 + i] = c * x - sn * y;
            Vt[ovq + i] = sn * x + c * y;
          }
        }
      }
      if (fuera < EPS) break;
    }
    // Las normas de las columnas son los valores singulares; normalizando U
    // queda ortonormal. Se ordena de mayor a menor, que es la convención y lo
    // que deja usar el primero y el último para la condición.
    const sv = new Float64Array(nc);
    for (let j = 0; j < nc; j++) {
      let s = 0;
      const o = j * nf;
      for (let i = 0; i < nf; i++) s += Ut[o + i] * Ut[o + i];
      sv[j] = Math.sqrt(s);
    }
    const orden = Array.from({ length: nc }, (_, i) => i).sort((p, q) => sv[q] - sv[p]);
    const U2 = new Float64Array(nf * nc), V2 = new Float64Array(nc * nc), S2 = new Float64Array(nc);
    orden.forEach((o, j) => {
      S2[j] = sv[o];
      const inv = sv[o] > 0 ? 1 / sv[o] : 0;
      for (let i = 0; i < nf; i++) U2[i * nc + j] = Ut[o * nf + i] * inv;
      for (let i = 0; i < nc; i++) V2[i * nc + j] = Vt[o * nc + i];
    });
    return { U: U2, S: S2, V: V2 };
  }

  // Valores y vectores propios de una matriz SIMÉTRICA, por rotaciones de
  // Jacobi. Solo simétrica a propósito: el caso general necesita Hessenberg más
  // QR con desplazamientos de Francis, que es largo y fácil de escribir mal, y
  // una descomposición propia equivocada es peor que no tenerla.
  function eigSim(a, n) {
    const A = Float64Array.from(a);
    const V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let vuelta = 0; vuelta < 100; vuelta++) {
      // El corte es RELATIVO al tamaño de la matriz. Con un corte absoluto
      // (1e-14 a secas) una matriz de números grandes nunca converge «lo
      // bastante» y se dan las 100 vueltas enteras haciendo nada: eran 336 ms
      // en una de 200×200 donde hacen falta ocho vueltas.
      let fuera = 0, dentro = 0;
      for (let i = 0; i < n; i++) {
        dentro += A[i * n + i] * A[i * n + i];
        for (let j = i + 1; j < n; j++) fuera += A[i * n + j] * A[i * n + j];
      }
      if (fuera <= 1e-30 * (dentro || 1)) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q];
          // La prueba de Jacobi: si este elemento ya es despreciable frente a
          // los dos de la diagonal, rotar no lo mueve y cuesta 6n operaciones.
          // En las últimas vueltas eso es casi todo el trabajo que se ahorra.
          if (Math.abs(apq) <= 1e-17 * (Math.abs(A[p * n + p]) + Math.abs(A[q * n + q]))) continue;
          if (Math.abs(apq) < 1e-300) continue;
          const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), sn = c * t;
          for (let k = 0; k < n; k++) {
            const akp = A[k * n + p], akq = A[k * n + q];
            A[k * n + p] = c * akp - sn * akq;
            A[k * n + q] = sn * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p * n + k], aqk = A[q * n + k];
            A[p * n + k] = c * apk - sn * aqk;
            A[q * n + k] = sn * apk + c * aqk;
          }
          // V se guarda TRANSPUESTA —cada vector propio es una fila, no una
          // columna— solo para que este bucle vaya seguido en memoria. Recorrer
          // una columna salta n números en cada paso y en 200×200 eso es un
          // fallo de caché por número. Se destranspone al final, gratis, porque
          // de todos modos hay que copiarla para ordenarla.
          const op = p * n, oq = q * n;
          for (let k = 0; k < n; k++) {
            const vkp = V[op + k], vkq = V[oq + k];
            V[op + k] = c * vkp - sn * vkq;
            V[oq + k] = sn * vkp + c * vkq;
          }
        }
      }
    }
    const val = new Float64Array(n);
    for (let i = 0; i < n; i++) val[i] = A[i * n + i];
    // De mayor a menor, con sus vectores detrás.
    const orden = Array.from({ length: n }, (_, i) => i).sort((p, q) => val[q] - val[p]);
    const val2 = new Float64Array(n), V2 = new Float64Array(n * n);
    orden.forEach((o, j) => {
      val2[j] = val[o];
      for (let i = 0; i < n; i++) V2[i * n + j] = V[o * n + i];
    });
    return { val: val2, V: V2 };
  }
  const simetrica = (d, n) => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      if (Math.abs(d[i * n + j] - d[j * n + i]) > 1e-9 * (1 + Math.abs(d[i * n + j]))) return false;
    return true;
  };
  // Difundir dos formas, o quejarse con las dos escritas. Lo usan «donde», las
  // lógicas y los de dos a dos, que tienen que difundir igual que «+».
  const difundirF = (fa, fb, quien) => {
    const f = difundir(fa, fb);
    if (f === null)
      vm.error(`«${quien}»: las formas ${fa.join('×')} y ${fb.join('×')} no se pueden difundir`,
        'de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1');
    return f;
  };
  // Una vista de «x» con la forma destino, con los ejes estirados a zancada 0.
  const difundirVista = (x, f) => (x.forma.length === f.length && x.forma.every((v, i) => v === f[i])
    ? x
    : vm.nuevoArreglo(x.datos, f.slice(), x.tipo, zancadasDifundidas(x, f), x.desp, x.base || x));
  // Llenar un arreglo nuevo desde una lista plana.
  const cargar = (forma, plano, tipo) => {
    const a = vm.arrNuevo(forma, tipo);
    for (let i = 0; i < plano.length; i++) a.datos[i] = plano[i];
    return a;
  };

  return function (def) {
    // Una línea extiende TRECE funciones a los arreglos. El tipo de la firma es
    // una unión —«real|arreglo»— así que el verificador sigue rechazando
    // «seno("hola")» al compilar; es lo que hacía falta para no tener que
    // inventar «senoA» al lado de «seno».
    // El ARGUMENTO se comprueba —«seno("hola")» sigue siendo un error al
    // compilar— y el retorno es «cualquiera», porque depende de la entrada: con
    // un número sale un número y con un arreglo sale un arreglo. Eso el sistema
    // de tipos no lo puede decir sin sobrecargas, y poner «real|arreglo» de
    // retorno era peor: obligaba a convertir el resultado antes de usarlo.
    // «fc» es la version para complejos, y solo «absoluto» tiene una: el valor
    // absoluto de un complejo es su módulo, que es la misma idea —la distancia
    // al cero— y no merece un segundo nombre. Las otras veinte se niegan.
    const m1 = (n, fx, doc, ret, fc) => def(n, 'real|arreglo -> cualquiera', a => {
      const x = a[0];
      if (x instanceof ObjArreglo) {
        if (fc && x.tipo === 'complejo') return vm.arrDeComplejoA(x, fc);
        return vm.arrUnaria(x, fx, ret === 'entero' ? 'entero' : 'real');
      }
      return fx(num(x, 1, n));
    }, doc);
    m1('raiz', x => { if (x < 0) vm.error('«raiz» de un número negativo'); return Math.sqrt(x); }, 'raíz cuadrada');
    m1('absoluto', Math.abs, 'absoluto(x) — el valor absoluto · de un complejo, su módulo: la distancia al cero, que es la misma idea', null, (re, im) => Math.hypot(re, im));
    m1('piso', Math.floor, 'redondea hacia abajo', 'entero');
    m1('techo', Math.ceil, 'redondea hacia arriba', 'entero');
    m1('seno', Math.sin); m1('coseno', Math.cos); m1('tangente', Math.tan);
    m1('arcoseno', Math.asin); m1('arcocoseno', Math.acos); m1('arcotangente', Math.atan);
    m1('exp', Math.exp);
    m1('log', x => { if (x <= 0) vm.error('«log» necesita un número positivo'); return Math.log(x); }, 'logaritmo natural');
    m1('log10', x => { if (x <= 0) vm.error('«log10» necesita un número positivo'); return Math.log10(x); });
    m1('signo', Math.sign, '', 'entero');
    def('redondear', '... -> real', a => {
      const x = num(a[0], 1, 'redondear');
      const d = a.length > 1 ? num(a[1], 2, 'redondear') : 0;
      const f = Math.pow(10, d);
      return Math.round(x * f) / f;
    }, 'redondear(x) · redondear(x, decimales)');
    def('potencia', 'real, real -> real', a => Math.pow(num(a[0], 1, 'potencia'), num(a[1], 2, 'potencia')),
      'potencia(base, exponente)');
    // Con un eje, «suma(m, 0)» es la suma de cada columna y devuelve un arreglo.
    // Sin eje suma todo y devuelve un número, que es lo que ya hacía.
    def('suma', '... -> cualquiera', a => {
      const x = a[0];
      if (x instanceof ObjArreglo && a.length > 1)
        return vm.arrReducir(x, ent(a[1], 2, 'suma'), 0, (acc, v) => acc + v, null,
          x.tipo === 'entero' ? 'entero' : 'real');
      return nums(x, 1, 'suma').reduce((p, c) => p + c, 0);
    }, 'suma(lista) · suma(arreglo) · suma(arreglo, eje) — con eje da un arreglo');
    const media = xs => xs.reduce((p, c) => p + c, 0) / xs.length;
    def('media', '... -> cualquiera', a => {
      const x = a[0];
      if (x instanceof ObjArreglo && a.length > 1)
        return vm.arrReducir(x, ent(a[1], 2, 'media'), 0, (acc, v) => acc + v, (acc, n) => acc / n, 'real');
      const v = nums(x, 1, 'media');
      if (!v.length) vm.error('«media» de una lista vacía');
      return media(v);
    }, 'media(lista) · media(arreglo) · media(arreglo, eje)');
    def('mediana', 'lista<real>|arreglo -> real', a => {
      const x = nums(a[0], 1, 'mediana').slice().sort((p, q) => p - q);
      if (!x.length) vm.error('«mediana» de una lista vacía');
      const m = x.length >> 1;
      return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
    });
    def('moda', 'lista<real>|arreglo -> real', a => {
      const x = nums(a[0], 1, 'moda'); if (!x.length) vm.error('«moda» de una lista vacía');
      const c = new Map(); let mejor = x[0], mc = 0;
      for (const v of x) { const k = (c.get(v) || 0) + 1; c.set(v, k); if (k > mc) { mc = k; mejor = v; } }
      return mejor;
    });
    def('varianza', 'lista<real>|arreglo -> real', a => { const x = nums(a[0], 1, 'varianza'); if (x.length < 2) vm.error('«varianza» necesita al menos 2 datos'); const m = media(x); return x.reduce((p, c) => p + (c - m) * (c - m), 0) / (x.length - 1); }, 'varianza muestral');
    def('desviacion', 'lista<real>|arreglo -> real', a => { const x = nums(a[0], 1, 'desviacion'); if (x.length < 2) vm.error('«desviacion» necesita al menos 2 datos'); const m = media(x); return Math.sqrt(x.reduce((p, c) => p + (c - m) * (c - m), 0) / (x.length - 1)); });
    def('percentil', 'lista<real>|arreglo, real -> real', a => {
      const x = nums(a[0], 1, 'percentil').slice().sort((p, q) => p - q);
      const p = num(a[1], 2, 'percentil');
      if (!x.length) vm.error('«percentil» de una lista vacía');
      if (p < 0 || p > 100) vm.error('«percentil»: el percentil debe ir de 0 a 100');
      const pos = (p / 100) * (x.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
      return lo === hi ? x[lo] : x[lo] + (pos - lo) * (x[hi] - x[lo]);
    });
    def('correlacion', 'lista<real>|arreglo, lista<real>|arreglo -> real', a => {
      const x = nums(a[0], 1, 'correlacion'), y = nums(a[1], 2, 'correlacion');
      if (x.length !== y.length) vm.error('«correlacion»: las dos listas deben tener el mismo tamaño');
      if (x.length < 2) vm.error('«correlacion» necesita al menos 2 puntos');
      const mx = media(x), my = media(y);
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
      if (sxx === 0 || syy === 0) vm.error('«correlacion»: una de las listas no varía');
      return sxy / Math.sqrt(sxx * syy);
    }, 'coeficiente de Pearson');
    def('regresion', 'lista<real>|arreglo, lista<real>|arreglo -> dic<texto,real>', a => {
      const x = nums(a[0], 1, 'regresion'), y = nums(a[1], 2, 'regresion');
      if (x.length !== y.length) vm.error('«regresion»: las dos listas deben tener el mismo tamaño');
      if (x.length < 2) vm.error('«regresion» necesita al menos 2 puntos');
      const mx = media(x), my = media(y);
      let sxy = 0, sxx = 0;
      for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
      if (sxx === 0) vm.error('«regresion»: todos los x son iguales');
      const m = sxy / sxx, b = my - m * mx;
      let sr = 0, st = 0;
      for (let i = 0; i < x.length; i++) { sr += (y[i] - (m * x[i] + b)) ** 2; st += (y[i] - my) ** 2; }
      const d = D();
      d.mapa.set('pendiente', m); d.mapa.set('intercepto', b); d.mapa.set('r2', st === 0 ? 1 : 1 - sr / st);
      return d;
    }, 'devuelve {pendiente, intercepto, r2}');
    def('normalizar', 'lista<real>|arreglo -> lista<real>', a => {
      const x = nums(a[0], 1, 'normalizar');
      const lo = Math.min(...x), hi = Math.max(...x);
      if (hi === lo) return L(x.map(() => 0));
      return L(x.map(v => (v - lo) / (hi - lo)));
    }, 'escala una lista al rango 0–1');
    def('histograma', 'lista<real>|arreglo, entero -> lista<entero>', a => {
      const x = nums(a[0], 1, 'histograma'), k = num(a[1], 2, 'histograma');
      if (k < 1) vm.error('«histograma»: el número de cajas debe ser ≥ 1');
      const lo = Math.min(...x), hi = Math.max(...x), w = (hi - lo) / k || 1;
      const cuentas = new Array(k).fill(0);
      for (const v of x) { let i = Math.floor((v - lo) / w); if (i >= k) i = k - 1; if (i < 0) i = 0; cuentas[i]++; }
      return L(cuentas);
    }, 'histograma(datos, cajas)');

    // ---- matrices (lista de listas)
    const filas = (m, f) => { const l = lst(m, 1, f); for (const r of l.items) if (!(r instanceof ObjLista)) vm.error(`«${f}»: se esperaba una matriz (lista de listas)`); return l.items.map(r => r.items); };
    def('matriz', 'entero, entero, cualquiera -> lista', a => {
      const f = num(a[0], 1, 'matriz'), c = num(a[1], 2, 'matriz');
      if (f < 0 || c < 0) vm.error('«matriz»: las dimensiones no pueden ser negativas');
      vm.cobrar(f * c);
      return L(Array.from({ length: f }, () => L(new Array(c).fill(a[2]))));
    }, 'matriz(filas, columnas, valor)');
    def('transponer', 'lista -> lista', a => {
      const m = filas(a[0], 'transponer');
      if (!m.length) return L([]);
      vm.cobrar(m.length * m[0].length);
      return L(m[0].map((_, j) => L(m.map(r => r[j]))));
    });
    def('multMatriz', 'lista, lista -> lista', a => {
      const A = filas(a[0], 'multMatriz'), B = filas(a[1], 'multMatriz');
      if (!A.length || !B.length) vm.error('«multMatriz»: matriz vacía');
      if (A[0].length !== B.length) vm.error(`«multMatriz»: no se pueden multiplicar ${A.length}×${A[0].length} por ${B.length}×${B[0].length}`);
      const nf = A.length, nc = B[0].length, nm = B.length;
      vm.cobrar(nf * nm * nc);
      // El bucle está escrito así a propósito, y se midió. Antes tenía
      // «B[0].length» en la condición del bucle interno y «A[i][k]» dentro del
      // medio: dos cargas de propiedad por iteración que el motor de JavaScript
      // no puede izar, porque no sabe que nadie va a cambiar la matriz mientras
      // multiplica. Sacarlas fuera y acumular la fila en un Float64Array —sin
      // números en caja— pasó 400×400 de 228 ms a 108 ms. La misma cuenta, el
      // mismo orden ikj; solo dónde están las cargas.
      const out = new Array(nf);
      for (let i = 0; i < nf; i++) {
        const Ai = A[i];
        const fila = new Float64Array(nc);
        for (let k = 0; k < nm; k++) {
          const aik = Ai[k];
          if (aik === 0) continue;              // las matrices ralas son comunes
          const Bk = B[k];
          for (let j = 0; j < nc; j++) fila[j] += aik * Bk[j];
        }
        out[i] = L(Array.from(fila));
      }
      return L(out);
    });
    def('determinante', 'lista -> real', a => {
      const m = filas(a[0], 'determinante').map(r => r.slice());
      const n = m.length;
      if (!n || m.some(r => r.length !== n)) vm.error('«determinante» necesita una matriz cuadrada');
      vm.cobrar(n * n * n);
      let det = 1;
      for (let i = 0; i < n; i++) {
        let p = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
        if (Math.abs(m[p][i]) < 1e-12) return 0;
        if (p !== i) { const t = m[p]; m[p] = m[i]; m[i] = t; det = -det; }
        det *= m[i][i];
        for (let k = i + 1; k < n; k++) { const f = m[k][i] / m[i][i]; for (let j = i; j < n; j++) m[k][j] -= f * m[i][j]; }
      }
      return det;
    });
    def('resolver', 'lista, lista<real>|arreglo -> lista<real>', a => {
      const A = filas(a[0], 'resolver').map(r => r.slice());
      const b = nums(a[1], 2, 'resolver').slice();
      const n = A.length;
      if (b.length !== n || A.some(r => r.length !== n)) vm.error('«resolverSistema»: dimensiones incompatibles');
      vm.cobrar(n * n * n);
      for (let i = 0; i < n; i++) {
        let p = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
        if (Math.abs(A[p][i]) < 1e-12) vm.error('«resolverSistema»: el sistema no tiene solución única');
        if (p !== i) { let t = A[p]; A[p] = A[i]; A[i] = t; const tb = b[p]; b[p] = b[i]; b[i] = tb; }
        for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; b[k] -= f * b[i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; }
      }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
      return L(x);
    }, 'resuelve A·x = b por eliminación gaussiana');

    // ================================================== GRÁFICOS (lienzo)

    // ══════════════════════════════════════════════ redondeo y comparación
    def('truncar', '... -> real', a => {
      const x = num(a[0], 1, 'truncar');
      if (a.length < 2) return Math.trunc(x);
      const f = Math.pow(10, ent(a[1], 2, 'truncar'));
      return Math.trunc(x * f) / f;
    }, 'truncar(x) · truncar(x, decimales) — corta hacia cero, no redondea');
    def('acotar', 'real, real, real -> real', a => {
      const x = num(a[0], 1, 'acotar'), lo = num(a[1], 2, 'acotar'), hi = num(a[2], 3, 'acotar');
      if (lo > hi) vm.error('«acotar»: el mínimo es mayor que el máximo');
      return Math.min(hi, Math.max(lo, x));
    }, 'acotar(x, minimo, maximo) — deja x dentro del intervalo');
    def('entre', 'real, real, real -> bool', a => {
      const x = num(a[0], 1, 'entre'), lo = num(a[1], 2, 'entre'), hi = num(a[2], 3, 'entre');
      return x >= Math.min(lo, hi) && x <= Math.max(lo, hi);
    }, 'entre(x, desde, hasta) — con los extremos incluidos');
    def('casiIgual', '... -> bool', a => {
      // Comparar decimales con «==» es el error de principiante que nunca deja
      // de doler: 0.1 + 0.2 no es 0.3. La tolerancia es relativa al tamaño de
      // los números, porque 1e-9 absoluto no sirve para comparar millones.
      const x = num(a[0], 1, 'casiIgual'), y = num(a[1], 2, 'casiIgual');
      if (x === y) return true;
      const tol = a.length > 2 ? num(a[2], 3, 'casiIgual') : 1e-9;
      const escala = Math.max(1, Math.abs(x), Math.abs(y));
      return Math.abs(x - y) <= tol * escala;
    }, 'casiIgual(a, b, tolerancia?) — tolerancia relativa, 1e-9 por defecto');

    // ═══════════════════════════════════════════════════ potencias y raíces
    def('raizN', 'real, real -> real', a => {
      const x = num(a[0], 1, 'raizN'), n = num(a[1], 2, 'raizN');
      if (n === 0) vm.error('«raizN»: el índice no puede ser 0');
      // La raíz impar de un negativo SÍ existe: raizN(-8, 3) es -2. Math.pow da
      // «no es un número» ahí, así que se saca el signo antes.
      if (x < 0) {
        if (Math.abs(n % 2) !== 1) vm.error(`«raizN»: la raíz par de un negativo no es un número real`);
        return -Math.pow(-x, 1 / n);
      }
      return Math.pow(x, 1 / n);
    }, 'raizN(8, 3) → 2 · la raíz impar de un negativo también funciona');
    def('log2', 'real -> real', a => {
      const x = num(a[0], 1, 'log2');
      if (x <= 0) vm.error('«log2» necesita un número positivo');
      return Math.log2(x);
    }, 'logaritmo en base 2');

    // ═════════════════════════════════════════════════════════ trigonometría
    def('angulo', 'real, real -> real', a => Math.atan2(num(a[0], 1, 'angulo'), num(a[1], 2, 'angulo')),
      'angulo(y, x) — el ángulo del punto, en radianes, sabiendo en qué cuadrante está');
    def('grados', 'real -> real', a => num(a[0], 1, 'grados') * 180 / Math.PI, 'de radianes a grados');
    def('radianes', 'real -> real', a => num(a[0], 1, 'radianes') * Math.PI / 180, 'de grados a radianes');
    def('hipotenusa', '... -> real', a => {
      // Math.hypot y no raiz(a*a + b*b): así no se desborda con números grandes
      // ni se pierde todo con números diminutos.
      const xs = a.map((x, i) => num(x, i + 1, 'hipotenusa'));
      if (!xs.length) vm.error('«hipotenusa» necesita al menos un lado');
      return Math.hypot.apply(null, xs);
    }, 'hipotenusa(3, 4) → 5 · acepta más de dos lados');

    // ═════════════════════════════════════════════════════════════ agregados
    def('producto', 'lista<real>|arreglo -> real', a => nums(a[0], 1, 'producto').reduce((p, c) => p * c, 1),
      'multiplica todos los elementos');
    def('amplitud', 'lista<real>|arreglo -> real', a => {
      const x = nums(a[0], 1, 'amplitud');
      if (!x.length) vm.error('«amplitud» de una lista vacía');
      return Math.max.apply(null, x) - Math.min.apply(null, x);
    }, 'la distancia entre el mayor y el menor');
    def('cuartiles', 'lista<real>|arreglo -> dic<texto,real>', a => {
      const x = nums(a[0], 1, 'cuartiles').slice().sort((p, q) => p - q);
      if (!x.length) vm.error('«cuartiles» de una lista vacía');
      // El mismo método que «percentil», para que no digan cosas distintas del
      // mismo dato: interpolación lineal entre los dos vecinos.
      const q = p => {
        const i = (x.length - 1) * p / 100;
        const b = Math.floor(i), r = i - b;
        return b + 1 < x.length ? x[b] + (x[b + 1] - x[b]) * r : x[b];
      };
      const d = D();
      d.mapa.set('minimo', x[0]);
      d.mapa.set('q1', q(25));
      d.mapa.set('mediana', q(50));
      d.mapa.set('q3', q(75));
      d.mapa.set('maximo', x[x.length - 1]);
      return d;
    }, 'los cinco números del resumen: minimo, q1, mediana, q3, maximo');
    def('acumulado', 'lista<real>|arreglo -> lista<real>', a => {
      let t = 0;
      return L(nums(a[0], 1, 'acumulado').map(x => (t += x)));
    }, 'acumulado([1,2,3]) → [1, 3, 6] — la suma corriendo');

    // ═════════════════════════════════════════════════ relación entre series
    def('covarianza', 'lista<real>|arreglo, lista<real>|arreglo -> real', a => {
      const x = nums(a[0], 1, 'covarianza'), y = nums(a[1], 2, 'covarianza');
      if (x.length !== y.length) vm.error('«covarianza»: las dos listas tienen que medir lo mismo');
      if (x.length < 2) vm.error('«covarianza» necesita al menos 2 pares');
      const mx = promedio(x), my = promedio(y);
      let s = 0;
      for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my);
      return s / (x.length - 1);
    }, 'covarianza muestral · igual que «varianza», divide entre n−1');
    def('tendencia', 'lista<real>|arreglo -> real', a => {
      // La pendiente contra la posición: cuánto sube o baja la serie por paso.
      // Es lo que se quiere preguntar de una columna de ventas por mes.
      const y = nums(a[0], 1, 'tendencia');
      if (y.length < 2) vm.error('«tendencia» necesita al menos 2 datos');
      const n = y.length, mx = (n - 1) / 2, my = promedio(y);
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (i - mx) * (y[i] - my); sxx += (i - mx) * (i - mx); }
      return sxy / sxx;
    }, 'tendencia([10,12,15]) → cuánto sube por paso · negativo si baja');
    def('tipificar', 'lista<real>|arreglo -> lista<real>', a => {
      // Cada dato en desviaciones respecto a la media. Es lo que permite
      // comparar dos series con unidades distintas.
      const x = nums(a[0], 1, 'tipificar');
      if (x.length < 2) vm.error('«tipificar» necesita al menos 2 datos');
      const m = promedio(x);
      const s = Math.sqrt(x.reduce((p, c) => p + (c - m) * (c - m), 0) / (x.length - 1));
      if (s === 0) vm.error('«tipificar»: todos los datos son iguales, no hay desviación');
      return L(x.map(v => (v - m) / s));
    }, 'lleva la serie a media 0 y desviación 1 (puntuaciones z)');

    // ══════════════════════════════════════════════════════════════════ azar
    def('azar', ' -> real', () => sig(), 'un real de 0 (incluido) a 1 (excluido)');
    def('azarEntre', 'entero, entero -> entero', a => {
      const lo = ent(a[0], 1, 'azarEntre'), hi = ent(a[1], 2, 'azarEntre');
      if (lo > hi) vm.error('«azarEntre»: el mínimo es mayor que el máximo');
      return lo + Math.floor(sig() * (hi - lo + 1));
    }, 'azarEntre(1, 6) — un entero, con los DOS extremos incluidos');
    def('azarNormal', '... -> real', a => {
      const m = a.length > 0 ? num(a[0], 1, 'azarNormal') : 0;
      const s = a.length > 1 ? num(a[1], 2, 'azarNormal') : 1;
      if (s < 0) vm.error('«azarNormal»: la desviación no puede ser negativa');
      return m + s * normal();
    }, 'azarNormal(media, desviacion) — campana de Gauss, no uniforme');
    def('elegir', 'lista -> cualquiera', a => {
      const l = lst(a[0], 1, 'elegir');
      if (!l.items.length) vm.error('«elegir» de una lista vacía');
      return l.items[Math.floor(sig() * l.items.length)];
    }, 'un elemento al azar');
    def('elegirVarios', 'lista, entero -> lista', a => {
      const l = lst(a[0], 1, 'elegirVarios'), n = ent(a[1], 2, 'elegirVarios');
      if (n < 0) vm.error('«elegirVarios»: no se pueden elegir menos de 0');
      if (n > l.items.length)
        vm.error(`«elegirVarios»: se piden ${n} de una lista de ${l.items.length}`,
          'son SIN repetir; para permitir repetidos, llama a «elegir» varias veces');
      // Fisher-Yates parcial: los n primeros de una baraja a medio barajar.
      const c = l.items.slice();
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(sig() * (c.length - i));
        const t = c[i]; c[i] = c[j]; c[j] = t;
      }
      return L(c.slice(0, n));
    }, 'elegirVarios(lista, 3) — tres distintos, sin repetir');
    def('barajar', 'lista -> lista', a => {
      // Devuelve una lista NUEVA y deja la original quieta, como «ordenar».
      const c = lst(a[0], 1, 'barajar').items.slice();
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(sig() * (i + 1));
        const t = c[i]; c[i] = c[j]; c[j] = t;
      }
      return L(c);
    }, 'una copia en orden aleatorio · la lista original no se toca');
    def('semilla', 'entero -> nulo', a => {
      sem = ent(a[0], 1, 'semilla') >>> 0;
      guardada = null;
      return null;
    }, 'siembra el azar: con la misma semilla sale la misma secuencia, aquí y en QuickJS');

    // ══════════════════════════════════════════════════════════════ matrices
    def('identidad', 'entero -> lista', a => {
      const n = ent(a[0], 1, 'identidad');
      if (n < 1) vm.error('«identidad»: el tamaño tiene que ser 1 o más');
      return L(Array.from({ length: n }, (_, i) =>
        L(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))));
    }, 'identidad(3) — la matriz identidad de n por n');
    def('traza', 'lista|arreglo -> real', a => {
      // La misma cuenta en los dos mundos: no merece dos nombres, como pasó con
      // maximo y minimo. Donde sí hacen falta dos es donde cambia el RESULTADO
      // (inversa da lista e inversaA da arreglo), no donde cambia la entrada.
      if (a[0] instanceof ObjArreglo) {
        const x = a[0];
        if (x.dimensiones !== 2 || x.forma[0] !== x.forma[1])
          vm.error(`«traza»: la matriz tiene que ser cuadrada y esta es ${x.forma.join('×')}`);
        const n = x.forma[0], v = vm.arrValores(x);
        let t = 0;
        for (let i = 0; i < n; i++) t += v[i * n + i];
        return t;
      }
      const m = filas(a[0], 'traza');
      if (m.length !== m[0].length) vm.error('«traza»: la matriz tiene que ser cuadrada');
      let t = 0;
      for (let i = 0; i < m.length; i++) t += m[i][i];
      return t;
    }, 'traza(A) — la suma de la diagonal · en listas y en arreglos, que es la misma cuenta');
    def('inversa', 'lista -> lista', a => {
      // Gauss-Jordan con pivoteo parcial: sin elegir el pivote más grande, una
      // matriz perfectamente invertible da resultados basura por redondeo.
      const m = filas(a[0], 'inversa'), n = m.length;
      if (n !== m[0].length) vm.error('«inversa»: la matriz tiene que ser cuadrada');
      const A = m.map((f, i) => f.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
      for (let c = 0; c < n; c++) {
        let mejor = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[mejor][c])) mejor = r;
        if (Math.abs(A[mejor][c]) < 1e-12)
          vm.error('«inversa»: la matriz no tiene inversa', 'su determinante es cero (sus filas no son independientes)');
        const t = A[c]; A[c] = A[mejor]; A[mejor] = t;
        const piv = A[c][c];
        for (let j = 0; j < 2 * n; j++) A[c][j] /= piv;
        for (let r = 0; r < n; r++) {
          if (r === c) continue;
          const f = A[r][c];
          if (f === 0) continue;
          for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
        }
      }
      return L(A.map(f => L(f.slice(n))));
    }, 'la matriz inversa · falla si no tiene una, diciendo por qué');

    // ═══════════════════════════════════════════════════════ números enteros
    def('esPrimo', 'entero -> bool', a => {
      const n = ent(a[0], 1, 'esPrimo');
      if (n < 2) return false;
      if (n % 2 === 0) return n === 2;
      for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
      return true;
    }, 'esPrimo(97) → cierto');
    def('primos', 'entero -> lista<entero>', a => {
      const n = ent(a[0], 1, 'primos');
      if (n > 5e6) vm.error(`«primos»: hasta ${n.toLocaleString('es')} son demasiados`, 'el tope son 5 millones');
      if (n < 2) return L([]);
      const criba = new Uint8Array(n + 1);
      const out = [];
      for (let i = 2; i <= n; i++) {
        if (criba[i]) continue;
        out.push(i);
        for (let j = i * i; j <= n; j += i) criba[j] = 1;
      }
      return L(out);
    }, 'primos(30) → todos los primos hasta 30');
    def('mcd', '... -> entero', a => {
      if (a.length < 2) vm.error('«mcd» necesita al menos dos números');
      let g = Math.abs(ent(a[0], 1, 'mcd'));
      for (let i = 1; i < a.length; i++) {
        let b = Math.abs(ent(a[i], i + 1, 'mcd'));
        while (b) { const t = g % b; g = b; b = t; }
      }
      return g;
    }, 'máximo común divisor · acepta más de dos');
    def('mcm', '... -> entero', a => {
      if (a.length < 2) vm.error('«mcm» necesita al menos dos números');
      const g2 = (x, y) => { while (y) { const t = x % y; x = y; y = t; } return x; };
      let m = Math.abs(ent(a[0], 1, 'mcm'));
      for (let i = 1; i < a.length; i++) {
        const b = Math.abs(ent(a[i], i + 1, 'mcm'));
        if (m === 0 || b === 0) return 0;
        m = m / g2(m, b) * b;
        if (!Number.isFinite(m)) vm.error('«mcm»: el resultado es demasiado grande');
      }
      return m;
    }, 'mínimo común múltiplo · acepta más de dos');
    def('factorial', 'entero -> real', a => {
      const n = ent(a[0], 1, 'factorial');
      if (n < 0) vm.error('«factorial» de un negativo no existe');
      // Más de 170 y el resultado es infinito: se dice en vez de devolverlo.
      if (n > 170) vm.error(`«factorial»: ${n}! no cabe en un número`, 'el máximo exacto es 170!');
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    }, 'factorial(5) → 120 · hasta 170');
    def('combinaciones', 'entero, entero -> real', a => {
      const n = ent(a[0], 1, 'combinaciones'), k = ent(a[1], 2, 'combinaciones');
      if (n < 0 || k < 0) vm.error('«combinaciones» no admite negativos');
      if (k > n) return 0;
      // Multiplicando y dividiendo a la vez, no con factoriales: así
      // combinaciones(200, 2) funciona en vez de desbordarse por el camino.
      let r = 1;
      const m = Math.min(k, n - k);
      for (let i = 1; i <= m; i++) r = r * (n - m + i) / i;
      return Math.round(r);
    }, 'combinaciones(49, 6) — cuántos grupos, sin importar el orden');
    def('permutaciones', 'entero, entero -> real', a => {
      const n = ent(a[0], 1, 'permutaciones'), k = ent(a[1], 2, 'permutaciones');
      if (n < 0 || k < 0) vm.error('«permutaciones» no admite negativos');
      if (k > n) return 0;
      let r = 1;
      for (let i = 0; i < k; i++) r *= n - i;
      if (!Number.isFinite(r)) vm.error('«permutaciones»: el resultado no cabe en un número');
      return r;
    }, 'permutaciones(10, 3) — cuántos grupos, contando el orden');
    def('divisores', 'entero -> lista<entero>', a => {
      const n = Math.abs(ent(a[0], 1, 'divisores'));
      if (n === 0) vm.error('«divisores» de 0: todos lo dividen');
      const chicos = [], grandes = [];
      for (let d = 1; d * d <= n; d++) {
        if (n % d) continue;
        chicos.push(d);
        if (d !== n / d) grandes.push(n / d);
      }
      return L(chicos.concat(grandes.reverse()));
    }, 'divisores(12) → [1, 2, 3, 4, 6, 12]');

    // ═══════════════════════════════════════════════════ dinero en el tiempo
    // La tasa va siempre como FRACCIÓN del periodo: 0.019 es el 1,9 % mensual.
    // Pasar 19 en vez de 0.19 es el error de esta familia, así que se detecta.
    const tasa = (v, n, f) => {
      const t = num(v, n, f);
      if (t > 1) vm.error(`«${f}»: una tasa de ${t} es el ${t * 100} %`,
        'la tasa va como fracción del periodo: 0.019 para el 1,9 % mensual');
      if (t <= -1) vm.error(`«${f}»: una tasa de ${t} no tiene sentido`);
      return t;
    };
    def('valorFuturo', 'real, real, entero -> real', a =>
      num(a[0], 1, 'valorFuturo') * Math.pow(1 + tasa(a[1], 2, 'valorFuturo'), ent(a[2], 3, 'valorFuturo')),
      'valorFuturo(capital, tasaDelPeriodo, periodos) — en cuánto se convierte');
    def('valorPresente', 'real, real, entero -> real', a =>
      num(a[0], 1, 'valorPresente') / Math.pow(1 + tasa(a[1], 2, 'valorPresente'), ent(a[2], 3, 'valorPresente')),
      'valorPresente(monto, tasaDelPeriodo, periodos) — cuánto vale hoy lo que llega después');
    def('interesCompuesto', '... -> real', a => {
      // Con capitalización dentro del periodo: mensual sobre una tasa anual.
      const c = num(a[0], 1, 'interesCompuesto'), t = tasa(a[1], 2, 'interesCompuesto');
      const n = ent(a[2], 3, 'interesCompuesto');
      const veces = a.length > 3 ? ent(a[3], 4, 'interesCompuesto') : 1;
      if (veces < 1) vm.error('«interesCompuesto»: las capitalizaciones por periodo son 1 o más');
      return c * Math.pow(1 + t / veces, n * veces);
    }, 'interesCompuesto(capital, tasaAnual, anios, vecesPorAnio?) — el interés gana interés');
    def('tasaEfectiva', 'real, entero -> real', a => {
      const nom = tasa(a[0], 1, 'tasaEfectiva'), m = ent(a[1], 2, 'tasaEfectiva');
      if (m < 1) vm.error('«tasaEfectiva»: los periodos por año son 1 o más');
      return Math.pow(1 + nom / m, m) - 1;
    }, 'tasaEfectiva(nominalAnual, periodosPorAnio) — lo que de verdad se paga al año');
    def('cuota', 'real, real, entero -> real', a => {
      // Cuota fija de un crédito (sistema francés), que es como se presta aquí.
      const c = num(a[0], 1, 'cuota'), t = tasa(a[1], 2, 'cuota'), n = ent(a[2], 3, 'cuota');
      if (n < 1) vm.error('«cuota»: los periodos tienen que ser 1 o más');
      if (t === 0) return c / n;
      return c * t / (1 - Math.pow(1 + t, -n));
    }, 'cuota(capital, tasaDelPeriodo, periodos) — la cuota fija de un crédito');
    def('amortizacion', 'real, real, entero -> lista', a => {
      const c = num(a[0], 1, 'amortizacion'), t = tasa(a[1], 2, 'amortizacion'), n = ent(a[2], 3, 'amortizacion');
      if (n < 1) vm.error('«amortizacion»: los periodos tienen que ser 1 o más');
      if (n > 2000) vm.error(`«amortizacion»: ${n} periodos son demasiados`, 'el tope son 2000 filas');
      const q = t === 0 ? c / n : c * t / (1 - Math.pow(1 + t, -n));
      let saldo = c;
      const filas = [];
      for (let i = 1; i <= n; i++) {
        const interes = saldo * t;
        // La última cuota cierra el saldo exacto: sin esto queda un resto de
        // céntimos y la tabla no cuadra con el crédito.
        const abono = i === n ? saldo : q - interes;
        const pago = i === n ? saldo + interes : q;
        saldo = i === n ? 0 : saldo - abono;
        const d = D();
        d.mapa.set('periodo', i);
        d.mapa.set('cuota', pago);
        d.mapa.set('interes', interes);
        d.mapa.set('abono', abono);
        d.mapa.set('saldo', saldo);
        filas.push(d);
      }
      return L(filas);
    }, 'amortizacion(capital, tasa, periodos) — la tabla, y la última cuota cierra el saldo exacto');

    // ══════════════════════════════════════════════════════ arreglos
    def('arreglo', '... -> arreglo', a => {
      // De una lista, anidada o no. El tipo sale de los datos: si todos son
      // enteros, es un arreglo de enteros; si hay un real, de reales. Se puede
      // forzar con el segundo argumento.
      const { forma, plano } = desdeLista(lst(a[0], 1, 'arreglo'), 'arreglo');
      const tipo = a.length > 1 ? tipoArg(a[1], 'arreglo') : (todoEntero(plano) ? 'entero' : 'real');
      vm.cobrar(plano.length);
      return cargar(forma, plano, tipo);
    }, 'arreglo(lista, tipo?) — de una lista anidada a un arreglo · el tipo sale de los datos');

    def('ceros', '... -> arreglo', a => vm.arrNuevo(formaDe(a[0], 'ceros'), tipoArg(a[1], 'ceros')),
      'ceros(forma, tipo?) — ceros(3) o ceros([2, 4])');
    def('unos', '... -> arreglo', a => {
      const x = vm.arrNuevo(formaDe(a[0], 'unos'), tipoArg(a[1], 'unos'));
      x.datos.fill(1);
      return x;
    }, 'unos(forma, tipo?)');
    def('lleno', '... -> arreglo', a => {
      const v = num(a[1], 2, 'lleno');
      const x = vm.arrNuevo(formaDe(a[0], 'lleno'), a.length > 2 ? tipoArg(a[2], 'lleno') : (Number.isInteger(v) ? 'entero' : 'real'));
      x.datos.fill(v);
      return x;
    }, 'lleno(forma, valor, tipo?) — todo el arreglo con el mismo valor');
    def('secuencia', '... -> arreglo', a => {
      // secuencia(5) · secuencia(2, 10) · secuencia(0, 1, 0.25)
      let desde = 0, hasta, paso = 1;
      if (a.length === 1) hasta = num(a[0], 1, 'secuencia');
      else { desde = num(a[0], 1, 'secuencia'); hasta = num(a[1], 2, 'secuencia');
             if (a.length > 2) paso = num(a[2], 3, 'secuencia'); }
      if (paso === 0) vm.error('«secuencia»: el paso no puede ser 0');
      const n = Math.max(0, Math.ceil((hasta - desde) / paso));
      const tipo = Number.isInteger(desde) && Number.isInteger(paso) ? 'entero' : 'real';
      const x = vm.arrNuevo([n], tipo);
      for (let i = 0; i < n; i++) x.datos[i] = desde + i * paso;
      vm.cobrar(n);
      return x;
    }, 'secuencia(hasta) · secuencia(desde, hasta) · secuencia(desde, hasta, paso)');
    // Se llamaba «linea», que es el nombre de NumPy traducido («linspace»), y
    // la prueba de colisiones lo cazó: «linea» ya es el global que dibuja un
    // segmento en el lienzo. «reparto» dice además lo que hace.
    def('reparto', '... -> arreglo', a => {
      // «n» puntos repartidos entre dos valores, los dos incluidos. Es lo que
      // hace falta para dibujar una función, y lo que «secuencia» hace mal:
      // ahí el último punto cae donde caiga según el paso.
      const d = num(a[0], 1, 'reparto'), h = num(a[1], 2, 'reparto');
      const n = a.length > 2 ? Math.trunc(num(a[2], 3, 'reparto')) : 50;
      if (n < 1) vm.error('«reparto»: hacen falta al menos 1 punto', `pediste ${n}`);
      const x = vm.arrNuevo([n], 'real');
      if (n === 1) { x.datos[0] = d; return x; }
      const paso = (h - d) / (n - 1);
      for (let i = 0; i < n; i++) x.datos[i] = d + i * paso;
      x.datos[n - 1] = h;                       // el último, exacto, sin acumular error
      vm.cobrar(n);
      return x;
    }, 'reparto(desde, hasta, puntos?) — reparte n puntos, los dos extremos incluidos');
    def('azarArreglo', '... -> arreglo', a => {
      const x = vm.arrNuevo(formaDe(a[0], 'azarArreglo'), 'real');
      for (let i = 0; i < x.datos.length; i++) x.datos[i] = sig();
      vm.cobrar(x.datos.length);
      return x;
    }, 'azarArreglo(forma) — números entre 0 y 1, con la misma semilla que «azar»');

    // ── mirar ───────────────────────────────────────────────────────────────
    def('forma', 'arreglo -> lista', a => L(arrC(a[0], 1, 'forma').forma.slice()),
      'forma(a) → [2, 3] — el tamaño de cada eje');
    def('dimensiones', 'arreglo -> entero', a => arrC(a[0], 1, 'dimensiones').dimensiones,
      'cuántos ejes tiene');
    def('tamano', 'arreglo -> entero', a => arrC(a[0], 1, 'tamano').tamano,
      'cuántos números tiene en total');
    def('tipoArreglo', 'arreglo -> texto', a => arrC(a[0], 1, 'tipoArreglo').tipo,
      '"real" o "entero" — el tipo de TODOS sus números');
    def('esVista', 'arreglo -> bool', a => arrC(a[0], 1, 'esVista').base !== null,
      'dice si comparte memoria con otro arreglo en vez de tener la suya');

    // ── forma y vistas ──────────────────────────────────────────────────────
    def('redimensionar', '... -> arreglo', a => {
      // Cambia la forma sin tocar los números. Si la memoria está seguida, la
      // nueva forma es una VISTA y no copia nada.
      const x = arr(a[0], 1, 'redimensionar');
      const f = formaDe(a[1], 'redimensionar');
      if (tamanoDeF(f) !== x.tamano)
        vm.error(`«redimensionar»: ${x.forma.join('×')} son ${x.tamano} números y ${f.join('×')} son ${tamanoDeF(f)}`,
          'la cuenta de números tiene que ser la misma');
      if (x.seguida) return vm.nuevoArreglo(x.datos, f, x.tipo, null, 0, x.base || x);
      // No está seguida: hay que copiar, y se dice por qué en el comentario, no
      // en un error: copiar aquí es correcto, solo no es gratis.
      const y = vm.arrNuevo(f, x.tipo);
      let i = 0;
      for (const p of x.posiciones()) y.datos[i++] = x.datos[p];
      vm.cobrar(x.tamano);
      return y;
    }, 'redimensionar(a, forma) — misma memoria, otra forma · es una vista si se puede');
    def('transpuesta', 'arreglo -> arreglo', a => {
      // Darle la vuelta a los ejes es darle la vuelta a las zancadas. No copia
      // nada: cuesta lo mismo con cuatro números que con cuatro millones.
      const x = arr(a[0], 1, 'transpuesta');
      return vm.nuevoArreglo(x.datos, x.forma.slice().reverse(), x.tipo,
        x.zancadas.slice().reverse(), x.desp, x.base || x);
    }, 'transpuesta(a) — una VISTA con los ejes al revés, sin copiar');
    def('fila', 'arreglo, entero -> arreglo', a => {
      const x = arr(a[0], 1, 'fila'), i = ent(a[1], 2, 'fila');
      if (x.dimensiones < 2) vm.error('«fila» necesita un arreglo de 2 dimensiones o más', `este tiene ${x.dimensiones}`);
      if (i < 0 || i >= x.forma[0]) vm.error(`«fila»: no hay fila ${i} en un arreglo de ${x.forma.join('×')}`);
      return vm.nuevoArreglo(x.datos, x.forma.slice(1), x.tipo, x.zancadas.slice(1),
        x.desp + i * x.zancadas[0], x.base || x);
    }, 'fila(a, i) — una VISTA de la fila i, sin copiar');
    def('copia', 'arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'copia');
      const y = vm.arrNuevo(x.forma, x.tipo);
      let i = 0;
      for (const p of x.posiciones()) y.datos[i++] = x.datos[p];
      vm.cobrar(x.tamano);
      return y;
    }, 'copia(a) — memoria propia · lo contrario de una vista');

    // ── entrar y salir ──────────────────────────────────────────────────────
    def('aListaA', 'arreglo -> lista', a => {
      const x = arr(a[0], 1, 'aListaA');
      // Esta lee «datos» a mano en vez de pasar por arrValores, así que la
      // negativa para complejos hay que ponerla aquí: sin ella devolvía las
      // partes reales e imaginarias revueltas como si fueran números sueltos,
      // sin quejarse. Lo encontró una prueba que esperaba que fallara.
      vm.nadaDeComplejos(x, 'aListaA');
      vm.cobrar(x.tamano);
      const sube = (d, base) => {
        const n = x.forma[d], z = x.zancadas[d], out = new Array(n);
        for (let i = 0; i < n; i++)
          out[i] = d === x.forma.length - 1 ? x.datos[base + i * z] : sube(d + 1, base + i * z);
        return L(out);
      };
      return sube(0, x.desp);
    }, 'aListaA(a) — de arreglo a lista anidada');
    def('elemento', '... -> real', a => {
      const x = arr(a[0], 1, 'elemento');
      const ix = [];
      for (let k = 1; k < a.length; k++) ix.push(ent(a[k], k + 1, 'elemento'));
      if (ix.length !== x.dimensiones)
        vm.error(`«elemento»: el arreglo tiene ${x.dimensiones} dimensiones y llegaron ${ix.length} índices`,
          `su forma es ${x.forma.join('×')}`);
      for (let d = 0; d < ix.length; d++)
        if (ix[d] < 0 || ix[d] >= x.forma[d])
          vm.error(`«elemento»: el índice ${ix[d]} se sale del eje ${d}, que mide ${x.forma[d]}`);
      return x.datos[x.pos(ix)];
    }, 'elemento(a, i, j, …) — un solo número');
    def('ponerElemento', '... -> arreglo', a => {
      const x = arr(a[0], 1, 'ponerElemento');
      const v = num(a[a.length - 1], a.length, 'ponerElemento');
      const ix = [];
      for (let k = 1; k < a.length - 1; k++) ix.push(ent(a[k], k + 1, 'ponerElemento'));
      if (ix.length !== x.dimensiones)
        vm.error(`«ponerElemento»: el arreglo tiene ${x.dimensiones} dimensiones y llegaron ${ix.length} índices`);
      for (let d = 0; d < ix.length; d++)
        if (ix[d] < 0 || ix[d] >= x.forma[d])
          vm.error(`«ponerElemento»: el índice ${ix[d]} se sale del eje ${d}, que mide ${x.forma[d]}`);
      x.datos[x.pos(ix)] = v;
      return x;
    }, 'ponerElemento(a, i, j, …, valor) — cambia un número · MODIFICA el arreglo');

    // ══════════════════════════════════ comparar: de arreglo a máscara
    // Sin esto no hay máscaras, y sin máscaras no hay «los que cumplen esto»,
    // que es la mitad de lo que se hace con datos. Los operadores < y > NO se
    // extienden a arreglos a propósito: «a > b» tiene que seguir dando un bool
    // para que «si a > b» signifique algo, y un arreglo de bool no es un bool.
    const comparar = (nombre, op) => def(nombre, 'cualquiera, cualquiera -> arreglo',
      a => vm.arrComparar(a[0], a[1], op),
      `${nombre}(a, b) — compara elemento a elemento y da un arreglo de bool`);
    comparar('mayorQue', '>');
    comparar('menorQue', '<');
    comparar('mayorIgualQue', '>=');
    comparar('menorIgualQue', '<=');
    comparar('igualA', '==');
    comparar('distintoA', '!=');

    // Dos máscaras combinadas. Se escribe aparte porque la difusión tiene que
    // valer igual aquí: una máscara de (3,1) con otra de (1,4) da una de (3,4).
    function combinarLogico(x, y, fn, nombre) {
      const esY = y instanceof ObjArreglo;
      const f = esY ? difundirF(x.forma, y.forma, nombre) : x.forma.slice();
      const out = vm.arrNuevo(f, 'bool');
      const n = out.tamano;
      vm.cobrar(n);
      if (!esY) {
        const k = y ? 1 : 0;
        let i = 0;
        for (const p of x.posiciones()) out.datos[i++] = fn(x.datos[p], k) ? 1 : 0;
        return out;
      }
      const vx = vm.arrValores(difundirVista(x, f)), vy = vm.arrValores(difundirVista(y, f));
      for (let i = 0; i < n; i++) out.datos[i] = fn(vx[i], vy[i]) ? 1 : 0;
      return out;
    }
    def('yA', '... -> arreglo', a => combinarLogico(arr(a[0], 1, 'yA'), a[1], (p, q) => p && q, 'yA'),
      'yA(a, b) — «y» lógico elemento a elemento, entre máscaras');
    def('oA', '... -> arreglo', a => combinarLogico(arr(a[0], 1, 'oA'), a[1], (p, q) => p || q, 'oA'),
      'oA(a, b) — «o» lógico elemento a elemento');
    def('noA', 'arreglo -> arreglo', a => vm.arrUnaria(arr(a[0], 1, 'noA'), v => (v ? 0 : 1), 'bool'),
      'noA(a) — niega una máscara');
    def('esNaN', 'arreglo -> arreglo', a => vm.arrUnaria(arr(a[0], 1, 'esNaN'), v => (Number.isNaN(v) ? 1 : 0), 'bool'),
      'esNaN(a) — marca los huecos');
    def('esFinito', 'arreglo -> arreglo', a => vm.arrUnaria(arr(a[0], 1, 'esFinito'), v => (Number.isFinite(v) ? 1 : 0), 'bool'),
      'esFinito(a) — falso en los NaN y en los infinitos');

    def('todos', '... -> bool', a => {
      const x = arr(a[0], 1, 'todos');
      for (const p of x.posiciones()) if (!x.datos[p]) return false;
      vm.cobrar(x.tamano);
      return true;
    }, 'todos(mascara) — ¿todos ciertos?');
    def('alguno', '... -> bool', a => {
      const x = arr(a[0], 1, 'alguno');
      for (const p of x.posiciones()) if (x.datos[p]) return true;
      vm.cobrar(x.tamano);
      return false;
    }, 'alguno(mascara) — ¿alguno cierto?');
    def('contarCiertos', '... -> entero', a => {
      const x = arr(a[0], 1, 'contarCiertos');
      if (a.length > 1) return vm.arrReducir(x, ent(a[1], 2, 'contarCiertos'), 0, (c, v) => c + (v ? 1 : 0), null, 'entero');
      let c = 0;
      for (const p of x.posiciones()) if (x.datos[p]) c++;
      vm.cobrar(x.tamano);
      return c;
    }, 'contarCiertos(mascara, eje?) — cuántos cumplen · la forma de contar lo que pasa el filtro');

    // ══════════════════════════════════════════ elegir y enmascarar
    def('donde', '... -> arreglo', a => {
      // El «si» de los arreglos, y la función más usada de NumPy después de las
      // aritméticas: donde(a > 0, a, 0) recorta los negativos sin un bucle.
      const m = arr(a[0], 1, 'donde');
      const si = a[1], no = a[2];
      for (const [v, k] of [[si, 2], [no, 3]])
        if (!(v instanceof ObjArreglo) && typeof v !== 'number')
          vm.error(`«donde»: el argumento ${k} debe ser un arreglo o un número y es ${tipoDe(v)}`);
      let f = m.forma.slice();
      for (const v of [si, no]) if (v instanceof ObjArreglo) f = difundirF(f, v.forma, 'donde');
      const entero = (si instanceof ObjArreglo ? si.tipo === 'entero' : Number.isInteger(si)) &&
                     (no instanceof ObjArreglo ? no.tipo === 'entero' : Number.isInteger(no));
      const out = vm.arrNuevo(f, entero ? 'entero' : 'real');
      const vm_ = vm.arrValores(difundirVista(m, f));
      const vs = si instanceof ObjArreglo ? vm.arrValores(difundirVista(si, f)) : null;
      const vn = no instanceof ObjArreglo ? vm.arrValores(difundirVista(no, f)) : null;
      const n = out.tamano;
      vm.cobrar(n);
      for (let i = 0; i < n; i++) out.datos[i] = vm_[i] ? (vs ? vs[i] : si) : (vn ? vn[i] : no);
      return out;
    }, 'donde(mascara, siCierto, siFalso) — elige elemento a elemento · el «si» de los arreglos');

    def('enMascara', 'arreglo, arreglo -> arreglo', a => {
      // Devuelve los que cumplen, en un arreglo de una dimensión: no se puede
      // saber cuántos hasta mirarlos, así que la forma se pierde a propósito.
      const x = arr(a[0], 1, 'enMascara'), m = arr(a[1], 2, 'enMascara');
      if (m.tamano !== x.tamano)
        vm.error(`«enMascara»: la máscara tiene ${m.tamano} valores y el arreglo ${x.tamano}`);
      const vx = vm.arrValores(x), vm2 = vm.arrValores(m);
      const out = [];
      for (let i = 0; i < vx.length; i++) if (vm2[i]) out.push(vx[i]);
      const y = vm.arrNuevo([out.length], x.tipo);
      for (let i = 0; i < out.length; i++) y.datos[i] = out[i];
      return y;
    }, 'enMascara(a, mascara) — los valores que cumplen, en una dimensión');
    def('ponerEnMascara', '... -> arreglo', a => {
      // MODIFICA el arreglo, como «agregar» con las listas, y por la misma
      // razón: copiar un millón de números para cambiar tres es absurdo.
      const x = arr(a[0], 1, 'ponerEnMascara'), m = arr(a[1], 2, 'ponerEnMascara');
      const v = a[2];
      if (m.tamano !== x.tamano)
        vm.error(`«ponerEnMascara»: la máscara tiene ${m.tamano} valores y el arreglo ${x.tamano}`);
      const esArr = v instanceof ObjArreglo;
      if (!esArr && typeof v !== 'number')
        vm.error(`«ponerEnMascara»: el valor debe ser un número o un arreglo y es ${tipoDe(v)}`);
      const vv = esArr ? vm.arrValores(v) : null;
      const vm2 = vm.arrValores(m);
      let i = 0, j = 0;
      for (const p of x.posiciones()) {
        if (vm2[i]) x.datos[p] = esArr ? vv[j++ % vv.length] : v;
        i++;
      }
      vm.cobrar(x.tamano);
      return x;
    }, 'ponerEnMascara(a, mascara, valor) — escribe solo donde cumple · MODIFICA el arreglo');
    def('recortar', '... -> arreglo', a => {
      const x = arr(a[0], 1, 'recortar');
      const lo = num(a[1], 2, 'recortar'), hi = num(a[2], 3, 'recortar');
      if (lo > hi) vm.error(`«recortar»: el mínimo ${lo} es mayor que el máximo ${hi}`);
      return vm.arrUnaria(x, v => (v < lo ? lo : v > hi ? hi : v));
    }, 'recortar(a, minimo, maximo) — mete todos los valores en un rango');
    const dosAdos = (nombre, fn, doc) => def(nombre, '... -> arreglo', a => {
      const x = arr(a[0], 1, nombre), y = a[1];
      if (y instanceof ObjArreglo) {
        const f = difundirF(x.forma, y.forma, nombre);
        const out = vm.arrNuevo(f, x.tipo === 'entero' && y.tipo === 'entero' ? 'entero' : 'real');
        const vx = vm.arrValores(difundirVista(x, f)), vy = vm.arrValores(difundirVista(y, f));
        for (let i = 0; i < out.tamano; i++) out.datos[i] = fn(vx[i], vy[i]);
        return out;
      }
      const k = num(y, 2, nombre);
      return vm.arrUnaria(x, v => fn(v, k));
    }, doc);
    dosAdos('maximoDe', (p, q) => (p > q ? p : q), 'maximoDe(a, b) — el mayor de los dos, elemento a elemento');
    dosAdos('minimoDe', (p, q) => (p < q ? p : q), 'minimoDe(a, b) — el menor de los dos');

    // ══════════════════════════════════════════════ reducir por eje
    def('argMaximo', '... -> cualquiera', a => {
      // DÓNDE está el máximo, no cuál es. Con esto se contesta «qué ciudad
      // vendió más», que es la pregunta de verdad.
      const x = arr(a[0], 1, 'argMaximo');
      const paso = (acc, v, i) => (acc[1] === null || v > acc[1] ? [i, v] : acc);
      if (a.length > 1)
        return vm.arrReducir(x, ent(a[1], 2, 'argMaximo'), null, (acc, v, i) =>
          (acc === null || v > acc[1] ? [i, v] : acc), acc => acc[0], 'entero');
      let mejor = null, iMejor = -1, i = 0;
      for (const p of x.posiciones()) { const v = x.datos[p]; if (mejor === null || v > mejor) { mejor = v; iMejor = i; } i++; }
      vm.cobrar(x.tamano);
      void paso;
      return iMejor;
    }, 'argMaximo(a, eje?) — el ÍNDICE del máximo');
    def('argMinimo', '... -> cualquiera', a => {
      const x = arr(a[0], 1, 'argMinimo');
      if (a.length > 1)
        return vm.arrReducir(x, ent(a[1], 2, 'argMinimo'), null, (acc, v, i) =>
          (acc === null || v < acc[1] ? [i, v] : acc), acc => acc[0], 'entero');
      let mejor = null, iMejor = -1, i = 0;
      for (const p of x.posiciones()) { const v = x.datos[p]; if (mejor === null || v < mejor) { mejor = v; iMejor = i; } i++; }
      vm.cobrar(x.tamano);
      return iMejor;
    }, 'argMinimo(a, eje?) — el ÍNDICE del mínimo');

    const acumular = (nombre, inicial, paso, doc) => def(nombre, '... -> arreglo', a => {
      const x = arr(a[0], 1, nombre);
      const out = vm.arrNuevo(x.forma, x.tipo === 'bool' ? 'entero' : x.tipo);
      if (a.length > 1) {
        const e = vm.arrEje(x, ent(a[1], 2, nombre), nombre);
        const largo = x.forma[e], zEje = x.zancadas[e];
        const zOut = out.zancadas[e];
        const fRest = x.forma.filter((_, i) => i !== e);
        const zRest = x.zancadas.filter((_, i) => i !== e);
        const zoRest = out.zancadas.filter((_, i) => i !== e);
        const nd = fRest.length, ix = new Array(nd).fill(0);
        const total = fRest.reduce((p, q) => p * q, 1);
        for (let k = 0; k < total; k++) {
          let base = x.desp, oBase = 0;
          for (let q = 0; q < nd; q++) { base += ix[q] * zRest[q]; oBase += ix[q] * zoRest[q]; }
          let acc = inicial;
          for (let j = 0; j < largo; j++) { acc = paso(acc, x.datos[base + j * zEje]); out.datos[oBase + j * zOut] = acc; }
          for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < fRest[q]) break; ix[q] = 0; }
        }
        vm.cobrar(x.tamano);
        return out;
      }
      let acc = inicial, i = 0;
      for (const p of x.posiciones()) { acc = paso(acc, x.datos[p]); out.datos[i++] = acc; }
      vm.cobrar(x.tamano);
      return out;
    }, doc);
    acumular('acumSuma', 0, (acc, v) => acc + v, 'acumSuma(a, eje?) — las sumas parciales · el saldo acumulado');
    acumular('acumProducto', 1, (acc, v) => acc * v, 'acumProducto(a, eje?)');
    acumular('acumMaximo', -Infinity, (acc, v) => (v > acc ? v : acc), 'acumMaximo(a, eje?) — el máximo visto hasta aquí');
    acumular('acumMinimo', Infinity, (acc, v) => (v < acc ? v : acc), 'acumMinimo(a, eje?)');

    def('diferencias', '... -> arreglo', a => {
      // a[i+1] − a[i]: la derivada discreta, y la forma de pasar de un saldo a
      // sus movimientos. El resultado tiene un elemento menos, y eso es correcto.
      const x = arr(a[0], 1, 'diferencias');
      if (x.dimensiones !== 1) vm.error('«diferencias» trabaja sobre un arreglo de una dimensión', `este tiene ${x.dimensiones}`);
      const v = vm.arrValores(x), n = v.length;
      if (n < 2) return vm.arrNuevo([0], x.tipo);
      const out = vm.arrNuevo([n - 1], x.tipo);
      for (let i = 0; i < n - 1; i++) out.datos[i] = v[i + 1] - v[i];
      return out;
    }, 'diferencias(a) — a[i+1] − a[i] · un elemento menos, a propósito');
    def('cuantil', '... -> real', a => {
      const x = arr(a[0], 1, 'cuantil');
      const q = num(a[1], 2, 'cuantil');
      if (q < 0 || q > 1) vm.error('«cuantil»: el cuantil va de 0 a 1', `llegó ${q} · para percentiles divide por 100`);
      const v = vm.arrValores(x).slice().sort((p, r) => p - r);
      if (!v.length) vm.error('«cuantil»: el arreglo está vacío');
      const pos = q * (v.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
      return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
    }, 'cuantil(a, q) — con interpolación · cuantil(a, 0.5) es la mediana');
    def('normaVector', '... -> real', a => {
      const x = arr(a[0], 1, 'normaVector');
      const o = a.length > 1 ? num(a[1], 2, 'normaVector') : 2;
      let s = 0;
      for (const p of x.posiciones()) {
        const v = Math.abs(x.datos[p]);
        if (o === Infinity) { if (v > s) s = v; } else if (o === 1) s += v; else s += Math.pow(v, o);
      }
      vm.cobrar(x.tamano);
      return o === Infinity || o === 1 ? s : Math.pow(s, 1 / o);
    }, 'normaVector(a, orden?) — la longitud · orden 2 por defecto, 1 o |INFINITO también');
    def('estandarizar', 'arreglo -> arreglo', a => {
      // Media 0 y desviación 1. Es lo primero que pide cualquier modelo, y
      // hacerlo a mano se equivoca con el denominador una vez de cada tres.
      const x = arr(a[0], 1, 'estandarizar');
      const v = vm.arrValores(x), n = v.length;
      if (n < 2) vm.error('«estandarizar» necesita al menos dos valores');
      let m = 0;
      for (const y of v) m += y;
      m /= n;
      let s2 = 0;
      for (const y of v) s2 += (y - m) * (y - m);
      const s = Math.sqrt(s2 / (n - 1));
      if (s === 0) vm.error('«estandarizar»: todos los valores son iguales, así que la desviación es 0');
      return vm.arrUnaria(x, y => (y - m) / s, 'real');
    }, 'estandarizar(a) — media 0 y desviación 1');
    def('mediaMovil', '... -> arreglo', a => {
      const x = arr(a[0], 1, 'mediaMovil');
      const v2 = Math.trunc(num(a[1], 2, 'mediaMovil'));
      if (x.dimensiones !== 1) vm.error('«mediaMovil» trabaja sobre un arreglo de una dimensión');
      if (v2 < 1) vm.error('«mediaMovil»: la ventana tiene que ser al menos 1', `llegó ${v2}`);
      const v = vm.arrValores(x), n = v.length;
      if (v2 > n) vm.error(`«mediaMovil»: la ventana es ${v2} y el arreglo tiene ${n} valores`);
      const out = vm.arrNuevo([n - v2 + 1], 'real');
      let s = 0;
      for (let i = 0; i < v2; i++) s += v[i];
      out.datos[0] = s / v2;
      for (let i = v2; i < n; i++) { s += v[i] - v[i - v2]; out.datos[i - v2 + 1] = s / v2; }
      vm.cobrar(n);
      return out;
    }, 'mediaMovil(a, ventana) — la media de una ventana que se desliza · suaviza una serie');

    // ══════════════════════════════════════ los que ignoran huecos
    const sinNaN = (nombre, hacer, doc) => def(nombre, '... -> real', a => {
      const x = arr(a[0], 1, nombre);
      const v = [];
      for (const p of x.posiciones()) { const y = x.datos[p]; if (!Number.isNaN(y)) v.push(y); }
      vm.cobrar(x.tamano);
      if (!v.length) vm.error(`«${nombre}»: todos los valores son huecos`);
      return hacer(v);
    }, doc);
    sinNaN('sumaSinNaN', v => v.reduce((p, q) => p + q, 0), 'sumaSinNaN(a) — suma saltándose los NaN');
    sinNaN('mediaSinNaN', v => v.reduce((p, q) => p + q, 0) / v.length, 'mediaSinNaN(a)');
    sinNaN('minimoSinNaN', v => Math.min(...v), 'minimoSinNaN(a)');
    sinNaN('maximoSinNaN', v => Math.max(...v), 'maximoSinNaN(a)');
    def('aCero', '... -> arreglo', a => {
      // Los huecos y los infinitos a números, que es lo que hace falta antes de
      // guardar, dibujar o meter en un modelo.
      const x = arr(a[0], 1, 'aCero');
      const k = a.length > 1 ? num(a[1], 2, 'aCero') : 0;
      const gr = a.length > 2 ? num(a[2], 3, 'aCero') : Number.MAX_VALUE;
      return vm.arrUnaria(x, v => (Number.isNaN(v) ? k : v === Infinity ? gr : v === -Infinity ? -gr : v));
    }, 'aCero(a, valor?, grande?) — cambia los NaN por «valor» y los infinitos por «grande»');

    // ══════════════════════════════════════════════ forma y ejes
    def('aplanarA', 'arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'aplanarA');
      if (x.seguida) return vm.nuevoArreglo(x.datos, [x.tamano], x.tipo, null, 0, x.base || x);
      const y = vm.arrNuevo([x.tamano], x.tipo);
      let i = 0;
      for (const p of x.posiciones()) y.datos[i++] = x.datos[p];
      return y;
    }, 'aplanarA(a) — a una dimensión · VISTA si la memoria está seguida');
    def('expandir', 'arreglo, entero -> arreglo', a => {
      // Añade un eje de tamaño 1, que es cómo se le dice a la difusión «estira
      // por aquí»: un vector a columna, o a fila.
      const x = arr(a[0], 1, 'expandir');
      let e = ent(a[1], 2, 'expandir');
      if (e < 0) e += x.dimensiones + 1;
      if (e < 0 || e > x.dimensiones)
        vm.error(`«expandir»: el eje ${a[1]} no cabe en un arreglo de ${x.forma.join('×')}`,
          `puede ir de 0 a ${x.dimensiones}`);
      const f = x.forma.slice(); f.splice(e, 0, 1);
      const z = x.zancadas.slice(); z.splice(e, 0, 0);
      return vm.nuevoArreglo(x.datos, f, x.tipo, z, x.desp, x.base || x);
    }, 'expandir(a, eje) — mete un eje de tamaño 1 · VISTA');
    def('apretar', '... -> arreglo', a => {
      const x = arr(a[0], 1, 'apretar');
      const f = [], z = [];
      for (let i = 0; i < x.forma.length; i++)
        if (x.forma[i] !== 1) { f.push(x.forma[i]); z.push(x.zancadas[i]); }
      if (!f.length) { f.push(1); z.push(1); }
      return vm.nuevoArreglo(x.datos, f, x.tipo, z, x.desp, x.base || x);
    }, 'apretar(a) — quita los ejes de tamaño 1 · VISTA');
    def('difundirA', 'arreglo, lista -> arreglo', a => {
      const x = arr(a[0], 1, 'difundirA');
      const f = formaDe(a[1], 'difundirA');
      const comp = difundir(x.forma, f);
      if (comp === null || comp.length !== f.length || comp.some((v, i) => v !== f[i]))
        vm.error(`«difundirA»: ${x.forma.join('×')} no se puede estirar a ${f.join('×')}`,
          'cada eje tiene que ser igual o medir 1 en el original');
      return vm.nuevoArreglo(x.datos, f, x.tipo, zancadasDifundidas(x, f), x.desp, x.base || x);
    }, 'difundirA(a, forma) — lo estira sin copiar · las zancadas del eje estirado van a 0');
    def('concatenar', '... -> arreglo', a => {
      // Pega a lo largo de un eje que YA existe. «apilar» crea uno nuevo, y
      // confundirlas es el error más común de NumPy.
      const xs = [];
      let eje = 0, hasta = a.length;
      if (typeof a[a.length - 1] === 'number') { eje = Math.trunc(a[a.length - 1]); hasta = a.length - 1; }
      for (let i = 0; i < hasta; i++) xs.push(arr(a[i], i + 1, 'concatenar'));
      if (!xs.length) vm.error('«concatenar» necesita al menos un arreglo');
      const e = vm.arrEje(xs[0], eje, 'concatenar');
      for (const x of xs) {
        if (x.dimensiones !== xs[0].dimensiones)
          vm.error(`«concatenar»: uno tiene ${x.dimensiones} dimensiones y otro ${xs[0].dimensiones}`);
        for (let d = 0; d < x.dimensiones; d++)
          if (d !== e && x.forma[d] !== xs[0].forma[d])
            vm.error(`«concatenar»: las formas ${xs[0].forma.join('×')} y ${x.forma.join('×')} solo pueden diferir en el eje ${e}`);
      }
      const f = xs[0].forma.slice();
      f[e] = xs.reduce((n, x) => n + x.forma[e], 0);
      const tipo = xs.every(x => x.tipo === 'entero') ? 'entero' : (xs.every(x => x.tipo === 'bool') ? 'bool' : 'real');
      const out = vm.arrNuevo(f, tipo);
      let off = 0;
      for (const x of xs) {
        const vx = vm.arrValores(x);
        // Copiar por posiciones lógicas: con un solo eje es directo, y con más
        // hay que recorrer el destino respetando dónde empieza este trozo.
        const nd = f.length, ix = new Array(nd).fill(0);
        let k = 0;
        for (let c = 0; c < x.tamano; c++) {
          let pos = 0;
          for (let q = 0; q < nd; q++) pos += (q === e ? ix[q] + off : ix[q]) * out.zancadas[q];
          out.datos[pos] = vx[k++];
          for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < x.forma[q]) break; ix[q] = 0; }
        }
        off += x.forma[e];
      }
      return out;
    }, 'concatenar(a, b, …, eje?) — pega a lo largo de un eje que ya existe');
    def('apilar', '... -> arreglo', a => {
      const xs = [];
      let eje = 0, hasta = a.length;
      if (typeof a[a.length - 1] === 'number') { eje = Math.trunc(a[a.length - 1]); hasta = a.length - 1; }
      for (let i = 0; i < hasta; i++) xs.push(arr(a[i], i + 1, 'apilar'));
      if (!xs.length) vm.error('«apilar» necesita al menos un arreglo');
      for (const x of xs)
        if (x.forma.length !== xs[0].forma.length || x.forma.some((v, i) => v !== xs[0].forma[i]))
          vm.error(`«apilar»: todos tienen que tener la MISMA forma, y hay ${xs[0].forma.join('×')} y ${x.forma.join('×')}`,
            'para pegar formas distintas a lo largo de un eje que ya existe, usa concatenar');
      if (eje < 0) eje += xs[0].dimensiones + 1;
      if (eje < 0 || eje > xs[0].dimensiones) vm.error(`«apilar»: el eje no cabe · puede ir de 0 a ${xs[0].dimensiones}`);
      const f = xs[0].forma.slice(); f.splice(eje, 0, xs.length);
      const tipo = xs.every(x => x.tipo === 'entero') ? 'entero' : 'real';
      const out = vm.arrNuevo(f, tipo);
      const nd = f.length;
      for (let i = 0; i < xs.length; i++) {
        const vx = vm.arrValores(xs[i]);
        const ix = new Array(xs[i].dimensiones).fill(0);
        let k = 0;
        for (let c = 0; c < xs[i].tamano; c++) {
          let pos = 0, q2 = 0;
          for (let q = 0; q < nd; q++) pos += (q === eje ? i : ix[q2++]) * out.zancadas[q];
          out.datos[pos] = vx[k++];
          for (let q = ix.length - 1; q >= 0; q--) { if (++ix[q] < xs[i].forma[q]) break; ix[q] = 0; }
        }
      }
      return out;
    }, 'apilar(a, b, …, eje?) — pega creando un eje NUEVO · todos con la misma forma');
    def('trozo', '... -> arreglo', a => {
      // Rebanar por un eje, sin copiar. Es lo que en NumPy es «a[1:3]» y lo que
      // hoy hacía imposible trabajar con una parte de un arreglo.
      const x = arrC(a[0], 1, 'trozo');
      const e = vm.arrEje(x, ent(a[1], 2, 'trozo'), 'trozo');
      let d = a.length > 2 ? ent(a[2], 3, 'trozo') : 0;
      let h = a.length > 3 ? ent(a[3], 4, 'trozo') : x.forma[e];
      const largo = x.forma[e];
      if (d < 0) d += largo;
      if (h < 0) h += largo;
      d = Math.max(0, Math.min(largo, d));
      h = Math.max(d, Math.min(largo, h));
      const f = x.forma.slice(); f[e] = h - d;
      return vm.nuevoArreglo(x.datos, f, x.tipo, x.zancadas.slice(), x.desp + d * x.zancadas[e], x.base || x);
    }, 'trozo(a, eje, desde?, hasta?) — una VISTA del trozo · los índices negativos cuentan desde el final');
    def('trozoPaso', '... -> arreglo', a => {
      const x = arrC(a[0], 1, 'trozoPaso');
      const e = vm.arrEje(x, ent(a[1], 2, 'trozoPaso'), 'trozoPaso');
      const paso = ent(a[2], 3, 'trozoPaso');
      if (paso === 0) vm.error('«trozoPaso»: el paso no puede ser 0');
      const largo = x.forma[e];
      const f = x.forma.slice(), z = x.zancadas.slice();
      let desp = x.desp;
      if (paso > 0) f[e] = Math.ceil(largo / paso);
      else { f[e] = Math.ceil(largo / -paso); desp += (largo - 1) * x.zancadas[e]; }
      z[e] = x.zancadas[e] * paso;
      return vm.nuevoArreglo(x.datos, f, x.tipo, z, desp, x.base || x);
    }, 'trozoPaso(a, eje, paso) — cada n elementos · con −1 lo da al revés, sin copiar');
    def('trozoVarios', 'arreglo, lista -> arreglo', a => {
      // Rebanar TODOS los ejes de una vez. Con trozo hay que encadenar una
      // llamada por eje, y en tres dimensiones eso son tres líneas y dos
      // arreglos intermedios para decir una cosa sola. Esto es el «a[1:3, ::2]»
      // de NumPy, y como trozo y trozoPaso devuelve una VISTA: no copia nada.
      const x = arrC(a[0], 1, 'trozoVarios');
      const cortes = lst(a[1], 2, 'trozoVarios').items;
      if (cortes.length > x.dimensiones)
        vm.error(`«trozoVarios»: el arreglo tiene ${x.dimensiones} dimensiones y le pasaste ${cortes.length} cortes`,
          'los ejes que no nombres se quedan enteros, así que sobran cortes, no faltan');
      const f = x.forma.slice(), z = x.zancadas.slice();
      let desp = x.desp;
      for (let e = 0; e < cortes.length; e++) {
        const c = cortes[e];
        if (!(c instanceof ObjLista))
          vm.error(`«trozoVarios»: el corte del eje ${e} debe ser una lista y es ${tipoDe(c)}`,
            'cada corte es [], [desde], [desde, hasta] o [desde, hasta, paso]');
        const q = c.items;
        if (q.length > 3) vm.error(`«trozoVarios»: el corte del eje ${e} tiene ${q.length} números y como máximo son 3 ([desde, hasta, paso])`);
        const largo = x.forma[e];
        let d = q.length > 0 ? ent(q[0], 1, 'trozoVarios') : 0;
        let h = q.length > 1 ? ent(q[1], 2, 'trozoVarios') : largo;
        const paso = q.length > 2 ? ent(q[2], 3, 'trozoVarios') : 1;
        if (paso === 0) vm.error(`«trozoVarios»: el paso del eje ${e} no puede ser 0`);
        if (d < 0) d += largo;
        if (h < 0) h += largo;
        d = Math.max(0, Math.min(largo, d));
        h = Math.max(d, Math.min(largo, h));
        const cuantos = h - d;
        if (paso > 0) {
          f[e] = Math.ceil(cuantos / paso);
          desp += d * x.zancadas[e];
        } else {
          f[e] = Math.ceil(cuantos / -paso);
          // Al revés se empieza por el último del trozo, no por el del arreglo.
          desp += (cuantos > 0 ? h - 1 : d) * x.zancadas[e];
        }
        z[e] = x.zancadas[e] * paso;
      }
      return vm.nuevoArreglo(x.datos, f, x.tipo, z, desp, x.base || x);
    }, 'trozoVarios(a, cortes) — rebana TODOS los ejes en una llamada · cada corte es [], [desde], [desde, hasta] o [desde, hasta, paso], y los que falten dejan el eje entero · una VISTA, no copia');

    // ══════════════════════════════════════════════════════ crear
    def('vacio', '... -> arreglo', a => vm.arrNuevo(formaDe(a[0], 'vacio'), tipoArg(a[1], 'vacio')),
      'vacio(forma, tipo?) — sin inicializar · lo más rápido si lo vas a llenar entero');
    const como = (nombre, llenar, doc) => def(nombre, '... -> arreglo', a => {
      const x = arr(a[0], 1, nombre);
      const y = vm.arrNuevo(x.forma, a.length > 1 ? tipoArg(a[1], nombre) : x.tipo);
      if (llenar !== null) y.datos.fill(llenar);
      return y;
    }, doc);
    como('cerosComo', 0, 'cerosComo(a, tipo?) — ceros con la forma y el tipo de otro');
    como('unosComo', 1, 'unosComo(a, tipo?)');
    como('vacioComo', null, 'vacioComo(a, tipo?) — sin inicializar');
    def('aTipo', 'arreglo, texto -> arreglo', a => {
      const x = arr(a[0], 1, 'aTipo');
      const t = tipoArg(a[1], 'aTipo');
      const y = vm.arrNuevo(x.forma, t);
      let i = 0;
      for (const p of x.posiciones()) y.datos[i++] = x.datos[p];
      vm.cobrar(x.tamano);
      return y;
    }, 'aTipo(a, "real" | "entero" | "bool") — convierte, copiando');

    // ══════════════════════════════════════════════ álgebra lineal
    def('por', 'arreglo, arreglo -> arreglo', a => {
      // El producto matricial sobre arreglos. El orden del bucle es i-k-j y la
      // fila se acumula en un Float64Array: es la misma razón por la que
      // multMatriz pasó de 228 ms a 108 en 400×400.
      const A = arr(a[0], 1, 'por'), B = arr(a[1], 2, 'por');
      if (A.dimensiones !== 2 || B.dimensiones !== 2)
        vm.error(`«por» multiplica dos matrices, y llegaron de ${A.dimensiones} y ${B.dimensiones} dimensiones`,
          'para un vector, pásalo a matriz con expandir(v, 0) o expandir(v, 1)');
      if (A.forma[1] !== B.forma[0])
        vm.error(`«por»: no se puede multiplicar ${A.forma.join('×')} por ${B.forma.join('×')}`,
          `las columnas del primero (${A.forma[1]}) tienen que ser las filas del segundo (${B.forma[0]})`);
      const nf = A.forma[0], nm = A.forma[1], nc = B.forma[1];
      vm.cobrar(nf * nm * nc);
      const out = vm.arrNuevo([nf, nc], 'real');
      const va = vm.arrValores(A), vb = vm.arrValores(B);
      const fila2 = new Float64Array(nc);
      for (let i = 0; i < nf; i++) {
        fila2.fill(0);
        const io = i * nm;
        for (let k = 0; k < nm; k++) {
          const aik = va[io + k];
          if (aik === 0) continue;
          const ko = k * nc;
          for (let j = 0; j < nc; j++) fila2[j] += aik * vb[ko + j];
        }
        const oo = i * nc;
        for (let j = 0; j < nc; j++) out.datos[oo + j] = fila2[j];
      }
      return out;
    }, 'por(A, B) — el producto matricial de dos arreglos de 2 dimensiones');
    def('productoPunto', 'arreglo, arreglo -> real', a => {
      const x = arr(a[0], 1, 'productoPunto'), y = arr(a[1], 2, 'productoPunto');
      if (x.tamano !== y.tamano)
        vm.error(`«productoPunto»: uno tiene ${x.tamano} valores y el otro ${y.tamano}`);
      const vx = vm.arrValores(x), vy = vm.arrValores(y);
      let s = 0;
      for (let i = 0; i < vx.length; i++) s += vx[i] * vy[i];
      return s;
    }, 'productoPunto(a, b) — Σ a·b · el coseno, la proyección y el ajuste salen de aquí');

    // ══════════════════════════════════════════════ álgebra lineal
    // Las descomposiciones. Casi todo lo demás de este bloque sale de una de
    // ellas: LU resuelve, da el determinante y la inversa; QR da los mínimos
    // cuadrados; SVD da el rango, la condición y la pseudoinversa; y Jacobi da
    // los valores propios. Cuatro algoritmos, veinticuatro funciones.
    def('factorLU', 'arreglo -> dic', a => {
      const A = cuadrada(a[0], 1, 'factorLU'), n = A.forma[0];
      const { lu, piv, singular } = luDe(planos(A), n, 'factorLU');
      if (singular >= 0)
        vm.error(`«factorLU»: la matriz es singular (la columna ${singular} se quedó sin pivote)`,
          'una matriz singular no tiene LU; si querías resolver de todos modos, usa minimosCuadrados');
      const L = new Float64Array(n * n), U = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        L[i * n + i] = 1;
        for (let j = 0; j < i; j++) L[i * n + j] = lu[i * n + j];
        for (let j = i; j < n; j++) U[i * n + j] = lu[i * n + j];
      }
      const P = vm.arrNuevo([n], 'entero');
      for (let i = 0; i < n; i++) P.datos[i] = piv[i];
      const d = D();
      d.mapa.set('L', deMatriz(L, n, n)); d.mapa.set('U', deMatriz(U, n, n)); d.mapa.set('P', P);
      return d;
    }, 'factorLU(A) — {"L","U","P"} con pivoteo parcial · las filas de A en el orden P son L·U · la base de resolverA, determinanteA e inversaA');
    def('factorQR', 'arreglo -> dic', a => {
      const A = mat2(a[0], 1, 'factorQR'), nf = A.forma[0], nc = A.forma[1];
      const { Q, R } = qrDe(planos(A), nf, nc);
      // R se devuelve con los ceros debajo de la diagonal puestos a mano: lo
      // que quede ahí es ruido de redondeo y confunde al leerla.
      for (let i = 1; i < nf; i++) for (let j = 0; j < Math.min(i, nc); j++) R[i * nc + j] = 0;
      const d = D();
      d.mapa.set('Q', deMatriz(Q, nf, nf)); d.mapa.set('R', deMatriz(R, nf, nc));
      return d;
    }, 'factorQR(A) — {"Q","R"} por reflexiones de Householder · A = por(Q, R) con Q ortogonal · la base de minimosCuadrados');
    def('factorCholesky', 'arreglo -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'factorCholesky'), n = A.forma[0];
      const d = planos(A);
      if (!simetrica(d, n)) vm.error('«factorCholesky» necesita una matriz simétrica');
      const L = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          let s = d[i * n + j];
          for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
          if (i === j) {
            if (s <= 0) vm.error(`«factorCholesky»: la matriz no es definida positiva (se torció en la fila ${i})`,
              'pruébala antes con esDefinidaPositiva, o usa factorLU, que no lo exige');
            L[i * n + i] = Math.sqrt(s);
          } else L[i * n + j] = s / L[j * n + j];
        }
      }
      return deMatriz(L, n, n);
    }, 'factorCholesky(A) — la L triangular inferior con por(L, transpuesta(L)) = A · solo simétrica y definida positiva, y el doble de rápida que LU');
    def('descomponerSVD', 'arreglo -> dic', a => {
      const A = mat2(a[0], 1, 'descomponerSVD'), nf = A.forma[0], nc = A.forma[1];
      const { U, S, V } = svdDe(planos(A), nf, nc);
      const d = D();
      d.mapa.set('U', deMatriz(U, nf, nc)); d.mapa.set('S', deVector(S)); d.mapa.set('V', deMatriz(V, nc, nc));
      return d;
    }, 'descomponerSVD(A) — {"U","S","V"} con A = U·diagonal(S)·Vᵗ · S de mayor a menor · de aquí salen rango, condición y pseudoInversa');
    def('valoresSingulares', 'arreglo -> arreglo', a => {
      const A = mat2(a[0], 1, 'valoresSingulares');
      return deVector(svdDe(planos(A), A.forma[0], A.forma[1]).S);
    }, 'valoresSingulares(A) — solo los valores, de mayor a menor · cuánto estira la matriz en cada una de sus direcciones');

    // Resolver sistemas.
    def('resolverA', 'arreglo, arreglo -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'resolverA'), n = A.forma[0];
      const B = arr(a[1], 2, 'resolverA');
      if (B.forma[0] !== n)
        vm.error(`«resolverA»: la matriz es ${n}×${n} y el lado derecho tiene ${B.forma[0]} filas`);
      const { lu, piv, singular } = luDe(planos(A), n, 'resolverA');
      if (singular >= 0)
        vm.error('«resolverA»: la matriz es singular, el sistema no tiene solución única',
          'usa minimosCuadrados, que da la mejor solución aunque no haya una exacta');
      if (B.dimensiones === 1) return deVector(luResolver(lu, piv, n, planos(B)));
      // Varios lados derechos a la vez: la factorización se hace UNA vez.
      const nc = B.forma[1], db = planos(B), out = new Float64Array(n * nc), col = new Float64Array(n);
      for (let j = 0; j < nc; j++) {
        for (let i = 0; i < n; i++) col[i] = db[i * nc + j];
        const x = luResolver(lu, piv, n, col);
        for (let i = 0; i < n; i++) out[i * nc + j] = x[i];
      }
      return deMatriz(out, n, nc);
    }, 'resolverA(A, b) — la x de A·x = b · b puede ser un vector o una matriz de varios lados derechos, y entonces solo factoriza una vez');
    def('resolverTriangular', 'arreglo, arreglo -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'resolverTriangular'), n = A.forma[0];
      const b = arr(a[1], 2, 'resolverTriangular');
      if (b.dimensiones !== 1) vm.error('«resolverTriangular»: el lado derecho debe ser un vector');
      if (b.tamano !== n) vm.error(`«resolverTriangular»: la matriz es ${n}×${n} y el vector tiene ${b.tamano}`);
      const d = planos(A), x = planos(b);
      // De si es la de arriba o la de abajo no hace falta avisar: se mira. Un
      // parámetro «arriba» que se pasa mal da números equivocados sin quejarse,
      // y esto no puede. Si no es triangular, lo dice.
      let hayArriba = false, hayAbajo = false;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (d[i * n + j] === 0) continue;
        if (j > i) hayArriba = true; else if (j < i) hayAbajo = true;
      }
      if (hayArriba && hayAbajo)
        vm.error('«resolverTriangular»: la matriz no es triangular, tiene números a los dos lados de la diagonal',
          'usa resolverA, que vale para cualquiera; esta solo existe para ahorrarse el trabajo cuando ya es triangular');
      for (let p = 0; p < n; p++) {
        const i = hayArriba ? n - 1 - p : p;
        let s = x[i];
        if (hayArriba) for (let j = i + 1; j < n; j++) s -= d[i * n + j] * x[j];
        else for (let j = 0; j < i; j++) s -= d[i * n + j] * x[j];
        if (d[i * n + i] === 0) vm.error(`«resolverTriangular»: hay un 0 en la diagonal (fila ${i}) y el sistema no tiene solución única`);
        x[i] = s / d[i * n + i];
      }
      return deVector(x);
    }, 'resolverTriangular(A, b) — resuelve en n² en vez de n³ aprovechando que ya es triangular · mira ella misma si es la de arriba o la de abajo');
    def('minimosCuadrados', 'arreglo, arreglo -> arreglo', a => {
      const A = mat2(a[0], 1, 'minimosCuadrados'), nf = A.forma[0], nc = A.forma[1];
      const b = arr(a[1], 2, 'minimosCuadrados');
      if (b.dimensiones !== 1) vm.error('«minimosCuadrados»: el lado derecho debe ser un vector');
      if (b.tamano !== nf) vm.error(`«minimosCuadrados»: la matriz tiene ${nf} filas y el vector ${b.tamano}`);
      if (nf < nc) {
        // Menos ecuaciones que incógnitas: hay infinitas soluciones y la que se
        // quiere es la de norma mínima, que es la que da la pseudoinversa.
        const { U, S, V } = svdDe(planos(A), nf, nc);
        const db = planos(b), tol = (S[0] || 0) * 1e-12, x = new Float64Array(nc);
        for (let k = 0; k < nc; k++) {
          if (S[k] <= tol) continue;
          let ub = 0;
          for (let i = 0; i < nf; i++) ub += U[i * nc + k] * db[i];
          ub /= S[k];
          for (let j = 0; j < nc; j++) x[j] += V[j * nc + k] * ub;
        }
        return deVector(x);
      }
      // A = QR  ⇒  Rx = Qᵗb, y basta la parte de arriba de R.
      const { Q, R } = qrDe(planos(A), nf, nc);
      const db = planos(b), qb = new Float64Array(nc);
      for (let j = 0; j < nc; j++) { let s = 0; for (let i = 0; i < nf; i++) s += Q[i * nf + j] * db[i]; qb[j] = s; }
      const x = new Float64Array(nc);
      for (let i = nc - 1; i >= 0; i--) {
        let s = qb[i];
        for (let j = i + 1; j < nc; j++) s -= R[i * nc + j] * x[j];
        if (Math.abs(R[i * nc + i]) < 1e-13)
          vm.error(`«minimosCuadrados»: las columnas de la matriz son dependientes (la ${i} no aporta nada que no esté ya)`,
            'quita la columna repetida, o usa pseudoInversa, que aguanta la dependencia');
        x[i] = s / R[i * nc + i];
      }
      return deVector(x);
    }, 'minimosCuadrados(A, b) — la x que minimiza la distancia entre A·x y b · ajustar una recta, un plano o un polinomio a datos con más filas que incógnitas');
    def('pseudoInversa', 'arreglo -> arreglo', a => {
      const A = mat2(a[0], 1, 'pseudoInversa'), nf = A.forma[0], nc = A.forma[1];
      const { U, S, V } = svdDe(planos(A), nf, nc);
      const tol = (S[0] || 0) * 1e-12, out = new Float64Array(nc * nf);
      for (let k = 0; k < nc; k++) {
        if (S[k] <= tol) continue;
        const inv = 1 / S[k];
        for (let i = 0; i < nc; i++) {
          const vi = V[i * nc + k] * inv;
          if (vi === 0) continue;
          for (let j = 0; j < nf; j++) out[i * nf + j] += vi * U[j * nc + k];
        }
      }
      return deMatriz(out, nc, nf);
    }, 'pseudoInversa(A) — la inversa de Moore-Penrose · sirve con matrices no cuadradas y con las singulares, donde inversaA se niega');

    // Determinante, inversa y las medidas de una matriz.
    def('determinanteA', 'arreglo -> real', a => {
      const A = cuadrada(a[0], 1, 'determinanteA'), n = A.forma[0];
      const { lu, signo, singular } = luDe(planos(A), n, 'determinanteA');
      if (singular >= 0) return 0;
      let d = signo;
      for (let i = 0; i < n; i++) d *= lu[i * n + i];
      return d;
    }, 'determinanteA(A) — por LU, en n³ · en una de 20×20 el método de los menores haría 10¹⁸ operaciones y este hace 8000');
    def('inversaA', 'arreglo -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'inversaA'), n = A.forma[0];
      const { lu, piv, singular } = luDe(planos(A), n, 'inversaA');
      if (singular >= 0)
        vm.error('«inversaA»: la matriz es singular y no tiene inversa',
          'usa pseudoInversa; y si lo que querías era resolver un sistema, resolverA en vez de multiplicar por la inversa');
      const out = new Float64Array(n * n), e = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        e.fill(0); e[j] = 1;
        const x = luResolver(lu, piv, n, e);
        for (let i = 0; i < n; i++) out[i * n + j] = x[i];
      }
      return deMatriz(out, n, n);
    }, 'inversaA(A) — resolviendo n sistemas con UNA factorización · para resolver A·x=b usa resolverA, que es más rápido y más exacto');
    def('rangoMatriz', 'arreglo -> entero', a => {
      const A = mat2(a[0], 1, 'rangoMatriz');
      const S = svdDe(planos(A), A.forma[0], A.forma[1]).S;
      const tol = (S[0] || 0) * Math.max(A.forma[0], A.forma[1]) * 2.220446049250313e-16;
      let r = 0;
      for (let i = 0; i < S.length; i++) if (S[i] > tol) r++;
      return r;
    }, 'rangoMatriz(A) — cuántas filas aportan información de verdad · por SVD, la única forma fiable de contarlo con números con coma');
    def('condicion', 'arreglo -> real', a => {
      const A = mat2(a[0], 1, 'condicion');
      const S = svdDe(planos(A), A.forma[0], A.forma[1]).S;
      const ult = S[S.length - 1];
      return ult === 0 ? Infinity : S[0] / ult;
    }, 'condicion(A) — cuánto amplifica los errores · 10ⁿ significa perder n cifras al resolver, e |INFINITO que la matriz es singular');
    def('normaMatriz', '... -> real', a => {
      if (a.length < 1 || a.length > 2) vm.error('«normaMatriz» toma la matriz y, si quieres, qué norma');
      const A = mat2(a[0], 1, 'normaMatriz'), nf = A.forma[0], nc = A.forma[1];
      const clase = a.length === 2 ? vm.exigeTexto(a[1], 2, 'normaMatriz') : 'frobenius';
      const d = planos(A);
      if (clase === 'frobenius') { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s); }
      if (clase === 'uno') {       // la mayor suma de una columna
        let mx = 0;
        for (let j = 0; j < nc; j++) { let s = 0; for (let i = 0; i < nf; i++) s += Math.abs(d[i * nc + j]); if (s > mx) mx = s; }
        return mx;
      }
      if (clase === 'infinito') {  // la mayor suma de una fila
        let mx = 0;
        for (let i = 0; i < nf; i++) { let s = 0; for (let j = 0; j < nc; j++) s += Math.abs(d[i * nc + j]); if (s > mx) mx = s; }
        return mx;
      }
      if (clase === 'espectral') return svdDe(d, nf, nc).S[0];
      if (clase === 'nuclear') { const S = svdDe(d, nf, nc).S; let s = 0; for (let i = 0; i < S.length; i++) s += S[i]; return s; }
      return vm.error(`«normaMatriz»: no conozco la norma «${clase}»`, 'son "frobenius", "uno", "infinito", "espectral" y "nuclear"');
    }, 'normaMatriz(A, clase?) — "frobenius" (por omisión), "uno", "infinito", "espectral" o "nuclear" · el tamaño de una matriz, que no es uno solo');
    def('potenciaMatriz', 'arreglo, entero -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'potenciaMatriz'), n = A.forma[0];
      let k = vm.exigeNum(a[1], 2, 'potenciaMatriz');
      if (!Number.isInteger(k)) vm.error('«potenciaMatriz»: el exponente debe ser entero');
      let base = planos(A);
      // Negativo = potencia de la inversa; el bucle de abajo es el mismo.
      if (k < 0) {
        const { lu, piv, singular } = luDe(base, n, 'potenciaMatriz');
        if (singular >= 0) vm.error('«potenciaMatriz»: exponente negativo de una matriz singular, que no tiene inversa');
        const inv = new Float64Array(n * n), e = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          e.fill(0); e[j] = 1;
          const x = luResolver(lu, piv, n, e);
          for (let i = 0; i < n; i++) inv[i * n + j] = x[i];
        }
        base = inv; k = -k;
      }
      const mul = (X, Y) => {
        const Z = new Float64Array(n * n);
        for (let i = 0; i < n; i++) for (let p = 0; p < n; p++) {
          const x = X[i * n + p];
          if (x === 0) continue;
          for (let j = 0; j < n; j++) Z[i * n + j] += x * Y[p * n + j];
        }
        return Z;
      };
      // Por cuadrados: A^30 son 7 multiplicaciones y no 29.
      let res = new Float64Array(n * n);
      for (let i = 0; i < n; i++) res[i * n + i] = 1;
      while (k > 0) { if (k & 1) res = mul(res, base); base = mul(base, base); k >>= 1; }
      return deMatriz(res, n, n);
    }, 'potenciaMatriz(A, k) — A·A·…·A por cuadrados: A^30 son 7 productos, no 29 · k negativo es la potencia de la inversa');

    // Valores propios. Solo del caso simétrico, a propósito: el general necesita
    // Hessenberg más QR con desplazamientos, y una descomposición propia mal
    // hecha es peor que no tenerla. El aviso lo dice en vez de dar números malos.
    def('autoSimetrica', 'arreglo -> dic', a => {
      const A = cuadrada(a[0], 1, 'autoSimetrica'), n = A.forma[0];
      const d = planos(A);
      if (!simetrica(d, n))
        vm.error('«autoSimetrica» necesita una matriz simétrica',
          'si la tuya no lo es, de momento Ñ no sabe sacarle los valores propios; para una matriz de datos prueba con descomponerSVD, que sirve para lo mismo en casi todos los casos');
      const { val, V } = eigSim(d, n);
      const r = D();
      r.mapa.set('valores', deVector(val)); r.mapa.set('vectores', deMatriz(V, n, n));
      return r;
    }, 'autoSimetrica(A) — {"valores","vectores"} por rotaciones de Jacobi · los valores de mayor a menor y cada COLUMNA de "vectores" es el suyo');
    def('autovalores', 'arreglo -> arreglo', a => {
      const A = cuadrada(a[0], 1, 'autovalores'), n = A.forma[0];
      const d = planos(A);
      if (!simetrica(d, n))
        vm.error('«autovalores» solo sabe hacerlo con matrices simétricas',
          'para una no simétrica usa valoresSingulares, que existe siempre y mide lo mismo en la mayoría de los usos');
      return deVector(eigSim(d, n).val);
    }, 'autovalores(A) — los valores propios de una matriz simétrica, de mayor a menor · los ejes de una covarianza, el componente principal');

    // Construir y mirar matrices.
    def('identidadA', 'entero -> arreglo', a => {
      const n = vm.exigeNum(a[0], 1, 'identidadA');
      if (!Number.isInteger(n) || n < 1) vm.error('«identidadA»: el tamaño debe ser un entero de 1 o más');
      const out = vm.arrNuevo([n, n], 'real');
      for (let i = 0; i < n; i++) out.datos[i * n + i] = 1;
      return out;
    }, 'identidadA(n) — la matriz identidad n×n como arreglo · «identidad» da lo mismo en listas');
    def('diagonal', 'arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'diagonal');
      // Las dos direcciones en una: de una matriz saca la diagonal, de un vector
      // hace la matriz. Es el mismo gesto leído al revés y se usan igual de seguido.
      if (x.dimensiones === 1) {
        const n = x.tamano, v = vm.arrValores(x), out = vm.arrNuevo([n, n], x.tipo === 'bool' ? 'real' : x.tipo);
        for (let i = 0; i < n; i++) out.datos[i * n + i] = v[i];
        return out;
      }
      if (x.dimensiones !== 2) vm.error(`«diagonal»: se esperaba un vector o una matriz y llegó algo de ${x.dimensiones} dimensiones`);
      const nf = x.forma[0], nc = x.forma[1], n = Math.min(nf, nc), v = vm.arrValores(x);
      const out = vm.arrNuevo([n], x.tipo);
      for (let i = 0; i < n; i++) out.datos[i] = v[i * nc + i];
      return out;
    }, 'diagonal(a) — de una matriz saca su diagonal, de un vector hace la matriz que la tiene · las dos direcciones del mismo gesto');
    const triangular = (nombre, arriba) => def(nombre, '... -> arreglo', a => {
      if (a.length < 1 || a.length > 2) vm.error(`«${nombre}» toma la matriz y, si quieres, cuántas diagonales desplazarla`);
      const x = mat2(a[0], 1, nombre), nf = x.forma[0], nc = x.forma[1];
      const k = a.length === 2 ? vm.exigeNum(a[1], 2, nombre) : 0;
      const v = vm.arrValores(x), out = vm.arrNuevo([nf, nc], x.tipo);
      for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++)
        if (arriba ? j - i >= k : j - i <= k) out.datos[i * nc + j] = v[i * nc + j];
      return out;
    }, `${nombre}(A, k?) — una copia con solo lo que está en la diagonal y ${arriba ? 'encima' : 'debajo'}, el resto a cero · k desplaza la diagonal`);
    triangular('triangularSuperior', true);
    triangular('triangularInferior', false);
    def('externo', 'arreglo, arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'externo'), y = arr(a[1], 2, 'externo');
      if (x.dimensiones !== 1 || y.dimensiones !== 1) vm.error('«externo» toma dos vectores');
      const n = x.tamano, m = y.tamano, vx = vm.arrValores(x), vy = vm.arrValores(y);
      const out = vm.arrNuevo([n, m], 'real');
      for (let i = 0; i < n; i++) { const xi = vx[i], o = i * m; for (let j = 0; j < m; j++) out.datos[o + j] = xi * vy[j]; }
      return out;
    }, 'externo(a, b) — la matriz n×m con todos los productos a[i]·b[j] · el gemelo de productoPunto, que los suma en uno solo');
    def('kronecker', 'arreglo, arreglo -> arreglo', a => {
      const A = mat2(a[0], 1, 'kronecker'), B = mat2(a[1], 2, 'kronecker');
      const pa = A.forma[0], qa = A.forma[1], pb = B.forma[0], qb = B.forma[1];
      const va = vm.arrValores(A), vb = vm.arrValores(B);
      const nc = qa * qb, out = vm.arrNuevo([pa * pb, nc], 'real');
      for (let i = 0; i < pa; i++) for (let j = 0; j < qa; j++) {
        const f = va[i * qa + j];
        if (f === 0) continue;
        for (let k = 0; k < pb; k++) { const o = (i * pb + k) * nc + j * qb; for (let l = 0; l < qb; l++) out.datos[o + l] = f * vb[k * qb + l]; }
      }
      return out;
    }, 'kronecker(A, B) — cada número de A multiplicado por toda B, en su propio bloque · así se escribe un sistema de varias dimensiones como uno solo');
    def('esSimetrica', 'arreglo -> bool', a => {
      const A = mat2(a[0], 1, 'esSimetrica');
      if (A.forma[0] !== A.forma[1]) return false;
      return simetrica(planos(A), A.forma[0]);
    }, 'esSimetrica(A) — si A es igual a su transpuesta, con la tolerancia de los números con coma · lo exigen factorCholesky y autoSimetrica');
    def('esDefinidaPositiva', 'arreglo -> bool', a => {
      const A = mat2(a[0], 1, 'esDefinidaPositiva'), n = A.forma[0];
      if (A.forma[0] !== A.forma[1]) return false;
      const d = planos(A);
      if (!simetrica(d, n)) return false;
      // Se prueba intentando el Cholesky: si sale, lo es. No hay prueba más
      // corta ni más fiable, y de paso es la misma cuenta que se iba a hacer.
      const L = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
        let s = d[i * n + j];
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (s <= 0) return false; L[i * n + i] = Math.sqrt(s); }
        else L[i * n + j] = s / L[j * n + j];
      }
      return true;
    }, 'esDefinidaPositiva(A) — intentando el Cholesky, que es la prueba más corta y la más fiable · una matriz de covarianza de verdad siempre lo es');

    // ══════════════════════════════════════════════ complejos
    // El tipo existe por una razón concreta: una transformada devuelve UNA cosa
    // con parte real e imaginaria, y la alternativa —dos arreglos que hay que
    // llevar de la mano— no la comprueba nadie. Lo que no sabe de complejos se
    // niega con un aviso en vez de leer la mitad de los números.
    def('complejo', '... -> arreglo', a => {
      if (a.length < 1 || a.length > 2) vm.error('«complejo» toma la parte real y, si quieres, la imaginaria');
      const comoArr = (v, n) => {
        if (v instanceof ObjArreglo) {
          vm.nadaDeComplejos(v, 'complejo');
          return v;
        }
        const x = num(v, n, 'complejo'), u = vm.arrNuevo([1], 'real');
        u.datos[0] = x;
        return u;
      };
      const re = comoArr(a[0], 1);
      if (a.length === 1) return vm.arrAritC(re, 0, '+');
      // La parte imaginaria se suma como i·b, que es justo multiplicar por i:
      // así la difusión sale gratis y no hay un segundo recorrido escrito a mano.
      const im = comoArr(a[1], 2);
      const i = vm.arrNuevo([1], 'complejo');
      i.datos[0] = 0; i.datos[1] = 1;
      return vm.arrAritC(vm.arrAritC(re, 0, '+'), vm.arrAritC(im, i, '*'), '+');
    }, 'complejo(re, im?) — un arreglo complejo a partir de uno o dos de reales · un número suelto da un arreglo de uno');
    def('parteReal', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'parteReal');
      if (x.tipo !== 'complejo') return vm.arrUnaria(x, v => v, 'real');
      return vm.arrDeComplejoA(x, re => re);
    }, 'parteReal(a) — la parte real, como arreglo de reales · de un arreglo que ya es real, una copia');
    def('parteImaginaria', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'parteImaginaria');
      if (x.tipo !== 'complejo') return vm.arrNuevo(x.forma, 'real');
      return vm.arrDeComplejoA(x, (re, im) => im);
    }, 'parteImaginaria(a) — la parte imaginaria · de un arreglo real, ceros');
    def('conjugado', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'conjugado');
      if (x.tipo !== 'complejo') vm.error('«conjugado» necesita un arreglo complejo', 'conviértelo con complejo(a)');
      return vm.arrComplejoA(x, (re, im) => [re, -im]);
    }, 'conjugado(a) — cambia el signo de la parte imaginaria · a·conjugado(a) es el módulo al cuadrado');
    def('fase', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'fase');
      if (x.tipo !== 'complejo') vm.error('«fase» necesita un arreglo complejo', 'conviértelo con complejo(a)');
      return vm.arrDeComplejoA(x, (re, im) => Math.atan2(im, re));
    }, 'fase(a) — el ángulo de cada número, en radianes entre −π y π · con absoluto son las coordenadas polares');
    def('desdePolar', 'arreglo, arreglo -> arreglo', a => {
      const m = arr(a[0], 1, 'desdePolar'), f = arr(a[1], 2, 'desdePolar');
      vm.nadaDeComplejos(m, 'desdePolar'); vm.nadaDeComplejos(f, 'desdePolar');
      const fo = difundirF(m.forma, f.forma, 'desdePolar');
      const vm1 = difundirVista(m, fo), vf = difundirVista(f, fo);
      const vmm = vm.arrValores(vm1), vff = vm.arrValores(vf);
      const out = vm.arrNuevo(fo, 'complejo');
      for (let i = 0; i < vmm.length; i++) {
        out.datos[2 * i] = vmm[i] * Math.cos(vff[i]);
        out.datos[2 * i + 1] = vmm[i] * Math.sin(vff[i]);
      }
      return out;
    }, 'desdePolar(modulo, fase) — el camino de vuelta de absoluto y fase · filtrar cambiando solo el módulo y reconstruir');
    def('esComplejo', 'arreglo -> bool', a => arrC(a[0], 1, 'esComplejo').tipo === 'complejo',
      'esComplejo(a) — si el arreglo guarda números complejos · «tipoArreglo» da el nombre');

    // ══════════════════════════════════════════════ Fourier
    def('fourier', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'fourier');
      if (x.dimensiones !== 1) vm.error(`«fourier» trabaja sobre una dimensión y llegó un arreglo de ${x.dimensiones}`,
        'saca la fila o la columna con fila(a, i) o trozoVarios, y transfórmala');
      if (x.tamano < 1) vm.error('«fourier» de un arreglo vacío');
      const d = aPlano(x);
      transformar(d, x.tamano, -1);
      return vm.arrDesdePlanosC(d, x.forma);
    }, 'fourier(a) — la transformada discreta · acepta reales o complejos y devuelve complejos · O(n log n) para cualquier n, no solo potencias de dos');
    def('fourierInversa', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'fourierInversa');
      if (x.dimensiones !== 1) vm.error(`«fourierInversa» trabaja sobre una dimensión y llegó un arreglo de ${x.dimensiones}`);
      if (x.tamano < 1) vm.error('«fourierInversa» de un arreglo vacío');
      const n = x.tamano, d = aPlano(x);
      transformar(d, n, 1);
      for (let i = 0; i < 2 * n; i++) d[i] /= n;
      return vm.arrDesdePlanosC(d, x.forma);
    }, 'fourierInversa(a) — el camino de vuelta, ya dividida entre n · fourierInversa(fourier(x)) devuelve x');
    def('espectro', 'arreglo -> arreglo', a => {
      const x = arrC(a[0], 1, 'espectro');
      if (x.dimensiones !== 1) vm.error('«espectro» trabaja sobre una dimensión');
      const n = x.tamano, d = aPlano(x);
      transformar(d, n, -1);
      const out = vm.arrNuevo([n], 'real');
      for (let i = 0; i < n; i++) out.datos[i] = Math.hypot(d[2 * i], d[2 * i + 1]);
      return out;
    }, 'espectro(a) — cuánto hay de cada frecuencia: el módulo de la transformada · es lo que se dibuja, y ahorra el paso por complejos');
    def('frecuencias', '... -> arreglo', a => {
      if (a.length < 1 || a.length > 2) vm.error('«frecuencias» toma cuántos datos hay y, si quieres, cada cuánto se tomaron');
      const n = ent(a[0], 1, 'frecuencias');
      if (n < 1) vm.error('«frecuencias» necesita al menos 1');
      const paso = a.length === 2 ? num(a[1], 2, 'frecuencias') : 1;
      if (paso === 0) vm.error('«frecuencias»: el paso de muestreo no puede ser 0');
      // El mismo orden que devuelve «fourier»: primero las positivas, después
      // las negativas. Sin esto hay que adivinarlo, y adivinarlo mal desplaza
      // todo el espectro medio ciclo.
      const out = vm.arrNuevo([n], 'real');
      const mitad = Math.floor((n - 1) / 2) + 1;
      for (let i = 0; i < mitad; i++) out.datos[i] = i / (n * paso);
      for (let i = mitad; i < n; i++) out.datos[i] = (i - n) / (n * paso);
      return out;
    }, 'frecuencias(n, paso?) — el eje de frecuencias que le toca a fourier(a), en el mismo orden · paso es el tiempo entre dos datos');
    def('convolucion', 'arreglo, arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'convolucion'), y = arr(a[1], 2, 'convolucion');
      vm.nadaDeComplejos(x, 'convolucion'); vm.nadaDeComplejos(y, 'convolucion');
      if (x.dimensiones !== 1 || y.dimensiones !== 1) vm.error('«convolucion» toma dos arreglos de una dimensión');
      const n = x.tamano, m = y.tamano;
      if (n < 1 || m < 1) vm.error('«convolucion» de un arreglo vacío');
      const largo = n + m - 1;
      // Por Fourier, no con el doble bucle: con 100.000 datos y un filtro de
      // 1000 el bucle son 10⁸ multiplicaciones y esto son 10⁶.
      const t = 1 << Math.ceil(Math.log2(largo));
      const A = new Float64Array(2 * t), B = new Float64Array(2 * t);
      const vx = vm.arrValores(x), vy = vm.arrValores(y);
      for (let i = 0; i < n; i++) A[2 * i] = vx[i];
      for (let i = 0; i < m; i++) B[2 * i] = vy[i];
      fft2(A, t, -1); fft2(B, t, -1);
      for (let i = 0; i < t; i++) {
        const ar = A[2 * i], ai = A[2 * i + 1], br = B[2 * i], bi = B[2 * i + 1];
        A[2 * i] = ar * br - ai * bi; A[2 * i + 1] = ar * bi + ai * br;
      }
      fft2(A, t, 1);
      const out = vm.arrNuevo([largo], 'real');
      for (let i = 0; i < largo; i++) out.datos[i] = A[2 * i] / t;
      return out;
    }, 'convolucion(a, b) — por Fourier, no con el doble bucle · el filtro de una señal, el suavizado, la multiplicación de polinomios · da n+m−1 números');

    // ══════════════════════════════════════════════ ordenar y buscar
    def('ordenarA', '... -> arreglo', a => {
      const x = arr(a[0], 1, 'ordenarA');
      const v = vm.arrValores(x).slice().sort((p, q) => p - q);
      const out = vm.arrNuevo([v.length], x.tipo);
      for (let i = 0; i < v.length; i++) out.datos[i] = v[i];
      return out;
    }, 'ordenarA(a) — una COPIA ordenada, en una dimensión');
    def('argOrdenar', 'arreglo -> arreglo', a => {
      // Los índices que lo ordenarían. Con esto se ordena OTRO arreglo por
      // este, que es lo que de verdad se usa: los nombres por sus ventas.
      const x = arr(a[0], 1, 'argOrdenar');
      const v = vm.arrValores(x);
      const ix = v.map((_, i) => i).sort((p, q) => (v[p] - v[q]) || (p - q));
      const out = vm.arrNuevo([ix.length], 'entero');
      for (let i = 0; i < ix.length; i++) out.datos[i] = ix[i];
      return out;
    }, 'argOrdenar(a) — los ÍNDICES que lo ordenarían · para ordenar otro arreglo por este');
    def('tomar', 'arreglo, arreglo -> arreglo', a => {
      const x = arr(a[0], 1, 'tomar'), ix = arr(a[1], 2, 'tomar');
      const vx = vm.arrValores(x), vi = vm.arrValores(ix);
      const out = vm.arrNuevo([vi.length], x.tipo);
      for (let i = 0; i < vi.length; i++) {
        let k = Math.trunc(vi[i]);
        if (k < 0) k += vx.length;
        if (k < 0 || k >= vx.length)
          vm.error(`«tomar»: el índice ${vi[i]} se sale de un arreglo de ${vx.length} valores`);
        out.datos[i] = vx[k];
      }
      return out;
    }, 'tomar(a, indices) — los elementos de esas posiciones · con argOrdenar, ordena por otro');
    def('unicosConCuentas', 'arreglo -> dic', a => {
      const x = arr(a[0], 1, 'unicosConCuentas');
      const m = new Map();
      for (const p of x.posiciones()) { const v = x.datos[p]; m.set(v, (m.get(v) || 0) + 1); }
      vm.cobrar(x.tamano);
      const vals = [...m.keys()].sort((p, q) => p - q);
      const va = vm.arrNuevo([vals.length], x.tipo), cu = vm.arrNuevo([vals.length], 'entero');
      vals.forEach((v, i) => { va.datos[i] = v; cu.datos[i] = m.get(v); });
      const d = D();
      d.mapa.set('valores', va);
      d.mapa.set('cuantas', cu);
      return d;
    }, 'unicosConCuentas(a) → {valores, cuantas} — los distintos y cuántas veces sale cada uno');
    def('estaEn', 'arreglo, arreglo -> arreglo', a => {
      // Para cada elemento, ¿está en el otro? Es conciliar dos listas de
      // identificadores sin un bucle cuadrático.
      const x = arr(a[0], 1, 'estaEn'), y = arr(a[1], 2, 'estaEn');
      const set = new Set(vm.arrValores(y));
      return vm.arrUnaria(x, v => (set.has(v) ? 1 : 0), 'bool');
    }, 'estaEn(a, b) — para cada elemento de «a», ¿está en «b»? · da una máscara');

    // ══════════════════════════════════════════════════════ azar
    def('uniformes', '... -> arreglo', a => {
      const f = formaDe(a[0], 'uniformes');
      const lo = a.length > 1 ? num(a[1], 2, 'uniformes') : 0;
      const hi = a.length > 2 ? num(a[2], 3, 'uniformes') : 1;
      const x = vm.arrNuevo(f, 'real');
      for (let i = 0; i < x.datos.length; i++) x.datos[i] = lo + sig() * (hi - lo);
      vm.cobrar(x.datos.length);
      return x;
    }, 'uniformes(forma, desde?, hasta?) — con la misma semilla que «azar»');
    def('normales', '... -> arreglo', a => {
      const f = formaDe(a[0], 'normales');
      const m = a.length > 1 ? num(a[1], 2, 'normales') : 0;
      const s = a.length > 2 ? num(a[2], 3, 'normales') : 1;
      const x = vm.arrNuevo(f, 'real');
      for (let i = 0; i < x.datos.length; i++) x.datos[i] = m + s * normal();
      vm.cobrar(x.datos.length);
      return x;
    }, 'normales(forma, media?, desviacion?) — campana de Gauss');
    def('enteros', '... -> arreglo', a => {
      const f = formaDe(a[0], 'enteros');
      const lo = Math.trunc(num(a[1], 2, 'enteros'));
      const hi = Math.trunc(num(a[2], 3, 'enteros'));
      if (hi <= lo) vm.error(`«enteros»: el máximo (${hi}) tiene que ser mayor que el mínimo (${lo})`);
      const x = vm.arrNuevo(f, 'entero');
      for (let i = 0; i < x.datos.length; i++) x.datos[i] = lo + Math.floor(sig() * (hi - lo));
      vm.cobrar(x.datos.length);
      return x;
    }, 'enteros(forma, desde, hasta) — enteros en [desde, hasta)');
    def('barajarJuntos', '... -> lista', a => {
      // Baraja dos arreglos con el MISMO orden. Es lo que hace falta para
      // mezclar datos y etiquetas sin desparejarlos, y hacerlo a mano con dos
      // «barajar» es el fallo silencioso clásico.
      const xs = [];
      for (let i = 0; i < a.length; i++) xs.push(arr(a[i], i + 1, 'barajarJuntos'));
      if (!xs.length) vm.error('«barajarJuntos» necesita al menos un arreglo');
      const n = xs[0].forma[0];
      for (const x of xs)
        if (x.forma[0] !== n)
          vm.error(`«barajarJuntos»: uno tiene ${n} filas y otro ${x.forma[0]}`,
            'se barajan por el primer eje, así que tienen que medir lo mismo ahí');
      const orden = [];
      for (let i = 0; i < n; i++) orden.push(i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(sig() * (i + 1)); const t = orden[i]; orden[i] = orden[j]; orden[j] = t; }
      const out = xs.map(x => {
        const y = vm.arrNuevo(x.forma, x.tipo);
        const porFila = x.tamano / n;
        const vx = vm.arrValores(x);
        for (let i = 0; i < n; i++)
          for (let k = 0; k < porFila; k++) y.datos[i * porFila + k] = vx[orden[i] * porFila + k];
        return y;
      });
      vm.cobrar(xs[0].tamano * xs.length);
      return L(out);
    }, 'barajarJuntos(a, b, …) — los baraja con el MISMO orden · datos y etiquetas');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarNumerico };
