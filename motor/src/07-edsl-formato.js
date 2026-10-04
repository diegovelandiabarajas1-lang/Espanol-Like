// ============================================================================
//  Ñ v4 — eDSL «formato»: números y texto para que los lea una persona
//  Parte 7 de 7.
//
//  Se importa con:  usar "formato"
//
//  Por qué es el primer eDSL nativo: es puro —ni un tipo nuevo, ni anfitrión,
//  ni estado—, así que valida el mecanismo sin arrastrar nada. Y paga solo:
//  todo programa que le enseña un número a alguien necesita esto.
//
//  La convención es la del español, no la del inglés: coma decimal y punto de
//  miles. Es la ventaja que un lenguaje escrito en español tiene de serie, y
//  cambiarla a mano en cada programa es precisamente lo que se quiere evitar.
//
//  Nada de Intl: el motor también corre sobre QuickJS, donde no existe. Todo
//  lo de aquí se calcula a mano y da el mismo resultado en las dos máquinas.
// ============================================================================
'use strict';

// ------------------------------------------------------------------- números
const UNO_15 = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
const DIECI = ['dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const VEINTI = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CIENTOS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

// De 0 a 999. «apocope» pide la forma corta que va delante de un nombre:
// veintiún mil, treinta y un millones, ciento un pesos.
function centenasEnLetras(n, apocope) {
  if (n === 100) return 'cien';
  let out = '';
  const c = Math.floor(n / 100), r = n % 100;
  if (c) out = CIENTOS[c];
  if (r) {
    let t;
    if (r <= 15) t = UNO_15[r];
    else if (r <= 19) t = DIECI[r - 16];
    else if (r <= 29) t = VEINTI[r - 20];
    else {
      t = DECENAS[Math.floor(r / 10)];
      if (r % 10) t += ' y ' + UNO_15[r % 10];
    }
    if (apocope) t = t.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un');
    out = out ? out + ' ' + t : t;
  }
  return out;
}

// Escala larga, que es la del español: 10^9 es «mil millones», no «un billón».
function enteroEnLetras(n) {
  if (n === 0) return 'cero';
  if (n < 0) return 'menos ' + enteroEnLetras(-n);
  const partes = [];
  const bill = Math.floor(n / 1e12); n %= 1e12;
  const mill = Math.floor(n / 1e6); n %= 1e6;
  const mil = Math.floor(n / 1e3); n %= 1e3;
  if (bill) partes.push(bill === 1 ? 'un billón' : enteroEnLetras(bill) + ' billones');
  if (mill) partes.push(mill === 1 ? 'un millón' : centenasEnLetrasLargo(mill, true) + ' millones');
  if (mil) partes.push(mil === 1 ? 'mil' : centenasEnLetrasLargo(mil, true) + ' mil');
  if (n) partes.push(centenasEnLetras(n, false));
  return partes.join(' ');
}
// Un grupo puede pasar de 999 (los millones de 1.234.000.000), así que recurre.
function centenasEnLetrasLargo(n, apocope) {
  return n <= 999 ? centenasEnLetras(n, apocope) : enteroEnLetras(n);
}

const ROMANOS = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

// ------------------------------------------------------------------ el eDSL
function instalarFormato(vm) {
  const L = items => vm.nuevaLista(items);
  // Ajustes con estado, propios de este eDSL: se cambian una vez y valen para
  // todo el programa, que es cómo se usa un separador de miles.
  const conf = { miles: '.', decimal: ',', moneda: '$' };

  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);

  // Agrupa la parte entera y pone la coma decimal. Todo lo demás se apoya aquí.
  function fmt(x, dec) {
    const neg = x < 0 || (x === 0 && 1 / x < 0);
    const s = Math.abs(x).toFixed(dec);
    const p = s.split('.');
    let e = p[0], out = '';
    while (e.length > 3) { out = conf.miles + e.slice(-3) + out; e = e.slice(0, -3); }
    out = e + out;
    if (p[1]) out += conf.decimal + p[1];
    return (neg ? '-' : '') + out;
  }
  // Decimales por defecto: los que tenga. Un entero no se enseña como «5,00».
// El ancho VISIBLE de un texto. Un código de color ANSI son varios caracteres
// que no ocupan ninguna columna en la pantalla, así que medir con «.length»
// desalinea toda la tabla en cuanto una celda lleva color — y los colores los
// da este mismo eDSL, así que la combinación es lo esperable, no un caso raro.
// Está en un solo sitio porque lo usan siete funciones: si cada una lo midiera
// a su manera, arreglar una dejaría las otras seis torcidas.
const ANSI = /\u001b\[[0-9;]*m/g;
const ancho = s => String(s).replace(ANSI, '').length;
// Rellenar hasta un ancho visible, no hasta una longitud de caracteres.
const rellenar = (s, n) => ' '.repeat(Math.max(0, n - ancho(s)));
const decNat = x => (Number.isInteger(x) ? 0 : Math.min(6, (String(x).split('.')[1] || '').length));

  return function (def) {
    // ───────────────────────────────────────────────────────────── números
    def('numero', 'real -> texto', a => fmt(num(a[0], 1, 'numero'), decNat(a[0])),
      'numero(1234.5) → «1.234,5»');
    def('decimales', 'real, entero -> texto', a => fmt(num(a[0], 1, 'decimales'), Math.max(0, Math.min(20, ent(a[1], 2, 'decimales')))),
      'decimales(3.14159, 2) → «3,14»');
    def('moneda', '... -> texto', a => {
      if (!a.length) vm.error('«moneda» necesita al menos el número');
      const n = num(a[0], 1, 'moneda');
      const sim = a.length > 1 ? txt(a[1], 2, 'moneda') : conf.moneda;
      const d = a.length > 2 ? Math.max(0, ent(a[2], 3, 'moneda')) : (Number.isInteger(n) ? 0 : 2);
      return sim + ' ' + fmt(n, d);
    }, 'moneda(1234567) → «$ 1.234.567» · moneda(9.5, "€", 2)');
    def('porciento', '... -> texto', a => {
      const n = num(a[0], 1, 'porciento') * 100;
      const d = a.length > 1 ? Math.max(0, ent(a[1], 2, 'porciento')) : (Number.isInteger(n) ? 0 : 1);
      return fmt(n, d) + ' %';
    }, 'porciento(0.156) → «15,6 %» — recibe la fracción, no el 15,6');
    def('porcientoCambio', '... -> texto', a => {
      const antes = num(a[0], 1, 'porcientoCambio'), ahora = num(a[1], 2, 'porcientoCambio');
      if (antes === 0) return ahora === 0 ? '0 %' : 'nuevo';
      const p = (ahora - antes) / Math.abs(antes) * 100;
      const d = a.length > 2 ? Math.max(0, ent(a[2], 3, 'porcientoCambio')) : 1;
      return (p > 0 ? '+' : '') + fmt(p, d) + ' %';
    }, 'porcientoCambio(80, 90) → «+12,5 %»');
    def('signoMas', '... -> texto', a => {
      const n = num(a[0], 1, 'signoMas');
      const d = a.length > 1 ? Math.max(0, ent(a[1], 2, 'signoMas')) : decNat(n);
      return (n > 0 ? '+' : '') + fmt(n, d);
    }, 'signoMas(3) → «+3» — para variaciones');
    def('abreviar', 'real -> texto', a => {
      const n = num(a[0], 1, 'abreviar'), x = Math.abs(n);
      const uno = (v, s) => (n < 0 ? '-' : '') + fmt(v, v < 10 && !Number.isInteger(v) ? 1 : 0) + s;
      if (x < 1e3) return fmt(n, decNat(n));
      if (x < 1e6) return uno(x / 1e3, ' mil');
      if (x < 1e12) return uno(x / 1e6, ' M');
      return uno(x / 1e12, ' B');
    }, 'abreviar(1234567) → «1,2 M»');
    def('ordinal', '... -> texto', a => {
      const n = ent(a[0], 1, 'ordinal');
      const fem = a.length > 1 && verdad(a[1]);
      return fmt(n, 0) + (fem ? '.ª' : '.º');
    }, 'ordinal(1) → «1.º» · ordinal(1, verdadero) → «1.ª»');
    def('enLetras', 'entero -> texto', a => {
      const n = ent(a[0], 1, 'enLetras');
      if (Math.abs(n) >= 1e15) vm.error('«enLetras»: el número es demasiado grande');
      return enteroEnLetras(n);
    }, 'enLetras(1250) → «mil doscientos cincuenta» — para facturas y cheques');
    def('romano', 'entero -> texto', a => {
      let n = ent(a[0], 1, 'romano');
      if (n < 1 || n > 3999) vm.error('«romano»: solo de 1 a 3999');
      let out = '';
      for (const [v, s] of ROMANOS) while (n >= v) { out += s; n -= v; }
      return out;
    }, 'romano(2026) → «MMXXVI»');
    def('intervalo', '... -> texto', a => {
      const d = a.length > 2 ? Math.max(0, ent(a[2], 3, 'intervalo')) : null;
      const f = x => fmt(num(x, 1, 'intervalo'), d === null ? decNat(x) : d);
      return f(a[0]) + ' – ' + f(a[1]);
    }, 'intervalo(3, 7) → «3 – 7» (con raya, no con guion)');

    // ──────────────────────────────────────────────── texto para personas
    def('plural', '... -> texto', a => {
      const n = num(a[0], 1, 'plural'), s = txt(a[1], 2, 'plural');
      if (Math.abs(n) === 1) return fmt(n, 0) + ' ' + s;
      let p;
      if (a.length > 2) p = txt(a[2], 3, 'plural');
      else if (/[aeiouáéíóú]$/i.test(s)) p = s + 's';
      else if (/z$/i.test(s)) p = s.slice(0, -1) + 'ces';
      else if (/[íú]$/i.test(s)) p = s + 'es';
      else p = s + 'es';
      return fmt(n, decNat(n)) + ' ' + p;
    }, 'plural(2, "factura") → «2 facturas» · plural(3, "lápiz") → «3 lápices»');
    def('listaLegible', '... -> texto', a => {
      const l = a[0];
      if (!(l instanceof ObjLista)) vm.error('«listaLegible»: el argumento 1 debe ser una lista');
      const xs = l.items.map(x => (typeof x === 'string' ? x : repr(x, 1))).filter(x => x !== '');
      if (!xs.length) return '';
      if (xs.length === 1) return xs[0];
      // «y» se vuelve «e» delante de i- o hi-: «pan e higos», no «pan y higos».
      const ult = xs[xs.length - 1];
      const conj = a.length > 1 ? txt(a[1], 2, 'listaLegible')
        : (/^(i|hi(?![ae]))/i.test(ult) ? 'e' : 'y');
      return xs.slice(0, -1).join(', ') + ' ' + conj + ' ' + ult;
    }, 'listaLegible(["a","b","c"]) → «a, b y c» — y pone «e» donde toca');
    def('mayusculaInicial', 'texto -> texto', a => {
      const s = txt(a[0], 1, 'mayusculaInicial');
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }, 'mayusculaInicial("hola") → «Hola»');
    def('acortar', '... -> texto', a => {
      const s = txt(a[0], 1, 'acortar'), n = ent(a[1], 2, 'acortar');
      const fin = a.length > 2 ? txt(a[2], 3, 'acortar') : '…';
      if (n <= 0) return '';
      return s.length <= n ? s : s.slice(0, Math.max(0, n - fin.length)).replace(/\s+$/, '') + fin;
    }, 'acortar("un texto largo", 8) → «un tex…»');
    def('elipsis', '... -> texto', a => {
      const s = txt(a[0], 1, 'elipsis'), n = ent(a[1], 2, 'elipsis');
      if (s.length <= n || n <= 1) return s.length <= n ? s : s.slice(0, Math.max(0, n));
      const izq = Math.ceil((n - 1) / 2), der = n - 1 - izq;
      return s.slice(0, izq) + '…' + (der ? s.slice(-der) : '');
    }, 'elipsis("/carpeta/muy/larga/archivo.txt", 14) → «/carpe…ivo.txt» — recorta por el medio');
    // Reciben cualquier valor, no solo texto: alinear una columna de números es
    // justo para lo que se usan. Esto es lo que hacía «texto.rellenar», que se
    // retiró en su favor — alinear es presentación, así que vive aquí.
    const comoTexto = (v, n, f) => (typeof v === 'string' ? v : repr(v, 1));
    def('alinearIzq', '... -> texto', a => {
      const s = comoTexto(a[0], 1, 'alinearIzq'), n = ent(a[1], 2, 'alinearIzq');
      const c = a.length > 2 ? txt(a[2], 3, 'alinearIzq') || ' ' : ' ';
      const falta = n - ancho(s);
      return falta <= 0 ? s : s + c.repeat(falta).slice(0, falta);
    }, 'alinearIzq("ab", 5) → «ab   »');
    def('alinearDer', '... -> texto', a => {
      const s = comoTexto(a[0], 1, 'alinearDer'), n = ent(a[1], 2, 'alinearDer');
      const c = a.length > 2 ? txt(a[2], 3, 'alinearDer') || ' ' : ' ';
      const falta = n - ancho(s);
      return falta <= 0 ? s : c.repeat(falta).slice(0, falta) + s;
    }, 'alinearDer("7", 3) → «  7» — para columnas de números');
    def('centrar', '... -> texto', a => {
      const s = comoTexto(a[0], 1, 'centrar'), n = ent(a[1], 2, 'centrar');
      const w = ancho(s);
      if (w >= n) return s;
      const izq = Math.floor((n - w) / 2);
      return ' '.repeat(izq) + s + ' '.repeat(n - w - izq);
    }, 'centrar("ab", 6) → «  ab  »');

    def('aAncho', '... -> texto', a => {
      // Exactamente n caracteres: rellena si falta y recorta si sobra. Es lo
      // que hace falta para una columna que NO puede desbordarse, y hacerlo
      // con alinearIzq más acortar son dos llamadas y un error de un carácter.
      const s = comoTexto(a[0], 1, 'aAncho'), n = ent(a[1], 2, 'aAncho');
      if (n <= 0) return '';
      const lado = a.length > 2 ? txt(a[2], 3, 'aAncho') : 'izq';
      // Si lleva color NO se recorta: cortar en medio de un código ANSI deja la
      // terminal pintada del color de la última celda. Se deja largo y se dice.
      if (ancho(s) > n) {
        if (ANSI.test(s)) { ANSI.lastIndex = 0; return s; }
        return s.slice(0, Math.max(0, n - 1)) + '…';
      }
      const hueco = ' '.repeat(Math.max(0, n - ancho(s)));
      return lado === 'der' ? hueco + s : s + hueco;
    }, 'aAncho(texto, 12, "izq"|"der") — exactamente 12 caracteres: rellena o recorta con «…»');
    def('rangoFechas', '... -> texto', a => {
      // Junta lo que las dos fechas comparten: «del 3 al 7 de octubre de 2026»
      // y no «del 3 de octubre de 2026 al 7 de octubre de 2026».
      const d = vm.exigeFecha(a[0], 1, 'rangoFechas'), h = vm.exigeFecha(a[1], 2, 'rangoFechas');
      const p = f => { const x = new Date(f.ms);
        return { a: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }; };
      const A = p(d), B = p(h);
      const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      if (A.a === B.a && A.m === B.m && A.d === B.d) return `${A.d} de ${M[A.m]} de ${A.a}`;
      if (A.a === B.a && A.m === B.m) return `del ${A.d} al ${B.d} de ${M[A.m]} de ${A.a}`;
      if (A.a === B.a) return `del ${A.d} de ${M[A.m]} al ${B.d} de ${M[B.m]} de ${A.a}`;
      return `del ${A.d} de ${M[A.m]} de ${A.a} al ${B.d} de ${M[B.m]} de ${B.a}`;
    }, 'rangoFechas(a, b) → «del 3 al 7 de octubre de 2026» — junta lo que comparten');

    // ───────────────────────────────────────────────────────── magnitudes
    def('tamanoLegible', 'real -> texto', a => {
      let b = num(a[0], 1, 'tamanoLegible');
      const neg = b < 0; b = Math.abs(b);
      const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0;
      while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
      return (neg ? '-' : '') + fmt(b, i === 0 ? 0 : (b < 10 ? 1 : 0)) + ' ' + u[i];
    }, 'tamanoLegible(1536000) → «1,5 MB»');
    def('duracionLegible', 'real -> texto', a => {
      let ms = Math.abs(num(a[0], 1, 'duracionLegible'));
      if (ms < 1000) return fmt(Math.round(ms), 0) + ' ms';
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
            m = Math.floor(s % 3600 / 60), sg = s % 60;
      const p = [];
      if (d) p.push(d + ' d');
      if (h) p.push(h + ' h');
      if (m && !d) p.push(m + ' min');
      if (sg && !d && !h) p.push(sg + ' s');
      return p.join(' ') || '0 s';
    }, 'duracionLegible(7505000) → «2 h 5 min»');
    def('tiempoReloj', 'real -> texto', a => {
      const t = Math.max(0, Math.floor(num(a[0], 1, 'tiempoReloj') / 1000));
      const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
      const dd = x => (x < 10 ? '0' : '') + x;
      return (h ? h + ':' : '') + dd(m) + ':' + dd(s);
    }, 'tiempoReloj(7531000) → «2:05:31»');
    def('tiempoRelativo', 'real -> texto', a => {
      const ms = num(a[0], 1, 'tiempoRelativo');
      const fut = ms < 0, x = Math.abs(ms);
      const s = Math.round(x / 1000);
      let n, u;
      if (s < 45) return fut ? 'en un momento' : 'hace un momento';
      else if (s < 5400) { n = Math.round(s / 60); u = ['minuto', 'minutos']; }
      else if (s < 79200) { n = Math.round(s / 3600); u = ['hora', 'horas']; }
      else if (s < 2246400) { n = Math.round(s / 86400); u = ['día', 'días']; }
      else if (s < 28512000) { n = Math.round(s / 2592000); u = ['mes', 'meses']; }
      else { n = Math.round(s / 31536000); u = ['año', 'años']; }
      const cuerpo = n + ' ' + (n === 1 ? u[0] : u[1]);
      return fut ? 'en ' + cuerpo : 'hace ' + cuerpo;
    }, 'tiempoRelativo(259200000) → «hace 3 días» — negativo es futuro');

    // ──────────────────────────────────────────────────── para la consola
    def('regla', '... -> texto', a => {
      const n = a.length ? ent(a[0], 1, 'regla') : 40;
      const c = a.length > 1 ? txt(a[1], 2, 'regla') || '─' : '─';
      return n <= 0 ? '' : c.repeat(Math.ceil(n / c.length)).slice(0, n);
    }, 'regla(20) → «────────────────────»');
    def('barraTexto', '... -> texto', a => {
      const v = num(a[0], 1, 'barraTexto'), max = num(a[1], 2, 'barraTexto');
      const an = a.length > 2 ? Math.max(1, ent(a[2], 3, 'barraTexto')) : 20;
      const p = max === 0 ? 0 : Math.max(0, Math.min(1, v / max));
      const lleno = Math.round(p * an);
      return '█'.repeat(lleno) + '░'.repeat(an - lleno);
    }, 'barraTexto(7, 10) → «██████████████░░░░░░»');
    def('minigrafico', 'lista<real> -> texto', a => {
      const l = a[0];
      if (!(l instanceof ObjLista)) vm.error('«minigrafico»: el argumento 1 debe ser una lista');
      const xs = l.items.map((x, i) => num(x, i + 1, 'minigrafico'));
      if (!xs.length) return '';
      const N = '▁▂▃▄▅▆▇█', lo = Math.min(...xs), hi = Math.max(...xs);
      if (hi === lo) return N[3].repeat(xs.length);
      return xs.map(x => N[Math.round((x - lo) / (hi - lo) * (N.length - 1))]).join('');
    }, 'minigrafico([1,5,3,9,2]) → «▁▄▂█▁» — una serie en una línea');
    def('marco', '... -> texto', a => {
      const s = txt(a[0], 1, 'marco');
      const ls = s.split('\n');
      const titulo = a.length > 1 ? txt(a[1], 2, 'marco') : '';
      const an = Math.max(ancho(titulo) + 2, ...ls.map(x => ancho(x)));
      // La cuenta: la línea de abajo mide an+4 ('└' + an+2 rayas + '┘'), así que
      // la de arriba —'┌─ ' + título + ' ' + rayas + '┐'— necesita an−ancho−1 rayas
      // para medir lo mismo. Decía −2 y el marco con título no cerraba: la
      // línea de arriba salía un carácter más corta, siempre.
      const sup = titulo ? '┌─ ' + titulo + ' ' + '─'.repeat(Math.max(0, an - ancho(titulo) - 1)) + '┐'
                         : '┌' + '─'.repeat(an + 2) + '┐';
      const inf = '└' + '─'.repeat(an + 2) + '┘';
      return [sup, ...ls.map(x => '│ ' + x + rellenar(x, an) + ' │'), inf].join('\n');
    }, 'marco("hola", "aviso") — dibuja una caja alrededor del texto');
    def('tablaTexto', '... -> texto', a => {
      const l = a[0];
      if (!(l instanceof ObjLista)) vm.error('«tablaTexto»: el argumento 1 debe ser una lista de diccionarios');
      const filas = l.items;
      if (!filas.length) return '';
      // Las columnas salen del primer registro, y en ese orden: una tabla que
      // cambia de orden entre corridas no se puede leer ni comparar.
      let cols;
      if (a.length > 1 && a[1] instanceof ObjLista) cols = a[1].items.map(String);
      else {
        cols = [];
        for (const f of filas) if (f instanceof ObjDic) for (const k of f.mapa.keys()) {
          const s = String(k); if (!cols.includes(s)) cols.push(s);
        }
      }
      // Una fila que no es un diccionario salía como una fila de celdas vacías,
      // sin decir nada: pasarle una lista de LISTAS —que es el error natural—
      // imprimía la tabla entera en blanco y parecía que «tablaTexto» no
      // funcionaba. Vale más quejarse y decir cómo se arregla.
      for (let i = 0; i < filas.length; i++) {
        if (!(filas[i] instanceof ObjDic))
          vm.error(`«tablaTexto»: la fila ${i + 1} es ${tipoDe(filas[i])} y tiene que ser un diccionario`,
            'las claves son los títulos de las columnas: [{"ciudad": "Girón", "ventas": 1200}] · ' +
            'de una tabla salen con aRegistros(t)');
      }
      const cel = (f, c) => {
        if (!(f instanceof ObjDic)) return '';
        const v = f.mapa.get(c);
        if (v === undefined || v === null) return '';
        return typeof v === 'number' ? fmt(v, decNat(v)) : (typeof v === 'string' ? v : repr(v, 1));
      };
      const cuerpo = filas.map(f => cols.map(c => cel(f, c)));
      const numerica = cols.map((c, i) => filas.every(f => {
        const v = f instanceof ObjDic ? f.mapa.get(c) : undefined;
        return v === undefined || v === null || typeof v === 'number';
      }));
      const an = cols.map((c, i) => Math.max(ancho(c), ...cuerpo.map(r => ancho(r[i]))));
      const pad = (s, i) => (numerica[i] ? rellenar(s, an[i]) + s : s + rellenar(s, an[i]));
      const lin = r => r.map(pad).join('  ');
      return [lin(cols), an.map(x => '─'.repeat(x)).join('  '), ...cuerpo.map(lin)].join('\n');
    }, 'tablaTexto(filas) — alinea los números a la derecha y el texto a la izquierda');
    def('columnas', '... -> texto', a => {
      const l = a[0];
      if (!(l instanceof ObjLista)) vm.error('«columnas»: el argumento 1 debe ser una lista');
      const xs = l.items.map(x => (typeof x === 'string' ? x : repr(x, 1)));
      const n = a.length > 1 ? Math.max(1, ent(a[1], 2, 'columnas')) : 3;
      if (!xs.length) return '';
      const alto = Math.ceil(xs.length / n);
      const an = Math.max(...xs.map(x => ancho(x))) + 2;
      const out = [];
      for (let f = 0; f < alto; f++) {
        const fila = [];
        for (let c = 0; c < n; c++) {
          const x = xs[c * alto + f];
          if (x !== undefined) fila.push(x + rellenar(x, an));
        }
        out.push(fila.join('').replace(/\s+$/, ''));
      }
      return out.join('\n');
    }, 'columnas(nombres, 4) — reparte una lista larga en columnas');

    // ─────────────────────────────────────────────── color en la terminal
    // Códigos ANSI. En una terminal que no los entienda salen como basura, y
    // por eso existe «sinColor» para quitarlos antes de escribir a un archivo.
    const ansi = (nombre, cod, doc) => def(nombre, 'texto -> texto',
      a => `\u001b[${cod}m${txt(a[0], 1, nombre)}\u001b[0m`, doc);
    ansi('enRojo', 31, 'para errores');
    ansi('enVerde', 32, 'para lo que salió bien');
    ansi('enAmarillo', 33, 'para avisos');
    ansi('enAzul', 34, 'para datos');
    ansi('enGris', 90, 'para lo secundario');
    ansi('enNegrita', 1, 'resalta');
    ansi('enTenue', 2, 'apaga');
    ansi('enSubrayado', 4, 'subraya');
    def('sinColor', 'texto -> texto', a => txt(a[0], 1, 'sinColor').replace(/\u001b\[[0-9;]*m/g, ''),
      'quita los códigos de color — para escribir a un archivo o a un registro');

    // ──────────────────────────────────────────────────────────── ajustes
    def('separadores', '... -> nulo', a => {
      conf.miles = a.length > 0 ? String(a[0]) : '.';
      conf.decimal = a.length > 1 ? String(a[1]) : ',';
      return null;
    }, 'separadores(".", ",") — lo de España y América Latina, que es lo de serie');
    def('monedaPorDefecto', 'texto -> nulo', a => {
      conf.moneda = txt(a[0], 1, 'monedaPorDefecto');
      return null;
    }, 'monedaPorDefecto("€") — para no repetir el símbolo en cada llamada');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarFormato, enteroEnLetras };
