// ============================================================================
//  Modo pseudocódigo: la notación de PSeInt, corriendo en el motor de Ñ.
//
//  Qué es: un front-end. Lee un programa escrito en el pseudocódigo de PSeInt
//  y produce el mismo programa en Ñ, LÍNEA POR LÍNEA: la línea 7 del original es
//  la línea 7 de la traducción. Así, cuando el verificador de tipos o la VM se
//  quejan de la línea 7, el estudiante mira SU línea 7. Ñ permite varias
//  sentencias por línea, y eso es lo que hace posible el alineamiento: lo que
//  en PSeInt es una palabra de cierre («FinSi») en Ñ es «}» en esa misma línea.
//
//  Qué no es: no contiene código de PSeInt. PSeInt es de Pablo Novara y es
//  GPLv2; esto se escribió a partir de la referencia pública del pseudolenguaje
//  y de probar programas, y la sintaxis de un lenguaje no es obra protegible.
//  Ñ sigue siendo Apache-2.0.
//
//  Decisión de arquitectura: la gramática de Ñ NO se toca. PSeInt tiene tres
//  estructuras que Ñ no tiene —«Repetir…Hasta Que», «Segun», y «Para…Hasta…Con
//  Paso»— y aquí se BAJAN a lo que Ñ ya tiene: un «mientras cierto» con
//  «romper», una cadena de «si…sino si», y un «rango». Ñ sigue siendo un
//  lenguaje y no dos, y las 60 pruebas de gramatica.esl siguen valiendo.
//
//  La costura que se deja a la vista: los arreglos de PSeInt empiezan en 1 y
//  los de Ñ en 0. «v[i]» se traduce como «v[(i) - 1]». Es feo a propósito: el
//  estudiante que pulse «ver en Ñ» tiene que ver dónde está la diferencia.
// ============================================================================
'use strict';

// ── 1. léxico ───────────────────────────────────────────────────────────────
// PSeInt no distingue mayúsculas: «Si», «si» y «SI» son lo mismo, y «Suma» y
// «suma» son la misma variable. Todo identificador se baja a minúsculas.

const PALABRAS = new Set([
  'proceso', 'finproceso', 'algoritmo', 'finalgoritmo',
  'definir', 'como', 'dimension', 'dimensionar',
  'si', 'entonces', 'sino', 'finsi',
  'mientras', 'hacer', 'finmientras',
  'repetir', 'hasta',
  'para', 'finpara',
  'segun', 'finsegun',
  'leer', 'escribir', 'imprimir', 'mostrar',
  'subproceso', 'finsubproceso', 'funcion', 'finfuncion', 'subalgoritmo', 'finsubalgoritmo',
  'por',
  'verdadero', 'falso',
  'mod', 'y', 'o', 'no',
  // «texto» no está: no es palabra de PSeInt (las suyas son Caracter y Cadena,
  // que se vuelven «texto» por sinónimo) y un estudiante puede llamar así a
  // una variable.
  'entero', 'real', 'numero', 'numerico', 'caracter', 'cadena', 'logico',
]);

// Palabras que solo lo son EN SU SITIO: «valor» después de «Por», «paso» después
// de «Con», «otro modo» después de «De», «saltar» después de «Sin». Fuera de ahí
// son nombres de variable perfectamente normales —«valor» es de los más
// comunes que hay—, así que el lexer las deja como identificadores y el parser
// las reconoce por su texto donde las espera. Encontrado con el primer programa
// de verdad: una «Funcion ivaDe(valor, clase)» no parseaba.
const CONTEXTUALES = new Set(['que', 'con', 'paso', 'de', 'otro', 'modo', 'sin', 'saltar', 'referencia', 'valor']);

// Las palabras que PSeInt admite en más de una grafía.
const SINONIMOS = {
  dimensionar: 'dimension', imprimir: 'escribir', mostrar: 'escribir',
  subalgoritmo: 'subproceso', finsubalgoritmo: 'finsubproceso',
  algoritmo: 'proceso', finalgoritmo: 'finproceso',
  numero: 'real', numerico: 'real', cadena: 'texto', caracter: 'texto',
};

class ErrorPSeInt extends Error {
  constructor(msg, linea, col) { super(msg); this.linea = linea; this.col = col; }
}

function quitarAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function lexer(src) {
  const t = [];
  let i = 0, linea = 1, col = 1;
  const n = src.length;
  const emitir = (tipo, valor, l, c) => t.push({ tipo, valor, linea: l, col: c });
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { emitir('nl', '\n', linea, col); i++; linea++; col = 1; continue; }
    if (ch === '\r' || ch === ' ' || ch === '\t') { i++; col++; continue; }
    // Comentarios: «//» hasta el final de la línea.
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    // Cadenas: comilla doble o simple, sin escapes (PSeInt no los tiene).
    if (ch === '"' || ch === "'") {
      const l = linea, c = col, cierre = ch;
      let j = i + 1, s = '';
      while (j < n && src[j] !== cierre && src[j] !== '\n') { s += src[j]; j++; }
      if (src[j] !== cierre) throw new ErrorPSeInt('falta cerrar la cadena', l, c);
      emitir('str', s, l, c); col += (j + 1 - i); i = j + 1; continue;
    }
    // Números.
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const l = linea, c = col;
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      emitir('num', src.slice(i, j), l, c); col += j - i; i = j; continue;
    }
    // Identificadores y palabras.
    if (/[A-Za-z_À-ɏ]/.test(ch)) {
      const l = linea, c = col;
      let j = i;
      while (j < n && /[A-Za-z0-9_À-ɏ]/.test(src[j])) j++;
      const crudo = src.slice(i, j);
      let v = quitarAcentos(crudo).toLowerCase();
      // Si es palabra se decide ANTES de aplicar sinónimos: «Cadena» es palabra
      // y se vuelve «texto», pero «texto» a secas no es palabra de PSeInt y un
      // estudiante puede tener una variable que se llame así.
      const esPalabra = PALABRAS.has(v);
      if (SINONIMOS[v]) v = SINONIMOS[v];
      emitir(esPalabra ? 'pal' : 'id', v, l, c);
      col += j - i; i = j; continue;
    }
    // Operadores, de más largo a más corto.
    const dos = src.slice(i, i + 2);
    if (['<-', '<>', '<=', '>=', '==', ':='].includes(dos)) {
      // «==» y «:=» no son de PSeInt pero algunos perfiles los admiten.
      emitir('op', dos === ':=' ? '<-' : dos, linea, col); i += 2; col += 2; continue;
    }
    if ('=<>+-*/^%()[],:&|~;'.includes(ch)) { emitir('op', ch, linea, col); i++; col++; continue; }
    throw new ErrorPSeInt(`carácter inesperado «${ch}»`, linea, col);
  }
  emitir('nl', '\n', linea, col);
  emitir('eof', null, linea, col);
  return t;
}

// ── 2. sintaxis ─────────────────────────────────────────────────────────────
// Un árbol propio, pequeño. Cada nodo lleva la línea donde empieza y, las
// estructuras, la línea donde cierra: el emisor pone el «}» de Ñ ahí.

function parser(tokens) {
  let p = 0;
  const ver = (k = 0) => tokens[p + k];
  const es = (tipo, valor) => ver().tipo === tipo && (valor === undefined || ver().valor === valor);
  const esPal = v => es('pal', v);
  // Las contextuales llegan como identificadores: se miran por su texto.
  const esClave = v => es('pal', v) || (es('id', v) && CONTEXTUALES.has(v));
  const esperarClave = v => { if (!esClave(v)) fallo(`se esperaba «${v}» y llegó «${ver().valor === '\n' ? 'fin de línea' : ver().valor}»`); return avanzar(); };
  const esOp = v => es('op', v);
  const avanzar = () => tokens[p++];
  const fallo = (msg, tk = ver()) => { throw new ErrorPSeInt(msg, tk.linea, tk.col); };
  const esperarPal = v => { if (!esPal(v)) fallo(`se esperaba «${v}» y llegó «${ver().valor === '\n' ? 'fin de línea' : ver().valor}»`); return avanzar(); };
  const esperarOp = v => { if (!esOp(v)) fallo(`se esperaba «${v}» y llegó «${ver().valor === '\n' ? 'fin de línea' : ver().valor}»`); return avanzar(); };
  const saltarNl = () => { while (es('nl') || esOp(';')) avanzar(); };
  const finDeLinea = () => { if (!es('nl') && !es('eof') && !esOp(';')) fallo(`sobra «${ver().valor}» al final de la línea`); };

  // Qué palabras cierran el bloque en curso; «sino» y «caso» también cortan.
  const CIERRES = new Set(['finsi', 'finmientras', 'finpara', 'finsegun', 'finproceso',
    'finsubproceso', 'finfuncion', 'hasta', 'sino']);

  // Dentro de un «Segun», una línea que empieza con una expresión y lleva «:»
  // antes del salto es el siguiente caso («6, 7:»). No empieza con palabra, así
  // que CIERRES no la ve; se busca el «:» en la línea, saltando paréntesis y
  // corchetes. Las cadenas ya son un solo token, así que un «:» dentro de un
  // texto no engaña.
  function pareceCaso() {
    let k = 0, prof = 0;
    for (;;) {
      const tk = ver(k);
      if (tk.tipo === 'nl' || tk.tipo === 'eof') return false;
      if (tk.tipo === 'op') {
        if (tk.valor === '(' || tk.valor === '[') prof++;
        else if (tk.valor === ')' || tk.valor === ']') prof--;
        else if (tk.valor === ':' && prof === 0) return true;
        else if (tk.valor === '<-' && prof === 0) return false;   // una asignación
      }
      if (tk.tipo === 'pal' && tk.valor !== 'verdadero' && tk.valor !== 'falso') return false;
      // «De Otro Modo:» también es un corte: son identificadores contextuales y lleva «:».
      k++;
    }
  }

  function programa() {
    const prog = { tipo: 'Programa', nombre: null, cuerpo: [], subs: [], lineaFin: null, lineaIni: null };
    saltarNl();
    while (!es('eof')) {
      if (esPal('proceso')) {
        const tk = avanzar();
        prog.lineaIni = tk.linea;
        if (es('id')) prog.nombre = avanzar().valor;
        finDeLinea(); saltarNl();
        prog.cuerpo = sentencias();
        prog.lineaFin = esperarPal('finproceso').linea;
        finDeLinea(); saltarNl();
      } else if (esPal('subproceso') || esPal('funcion')) {
        prog.subs.push(subproceso());
        saltarNl();
      } else {
        fallo(`se esperaba «Proceso», «Algoritmo», «SubProceso» o «Funcion» y llegó «${ver().valor}»`);
      }
    }
    if (prog.lineaIni === null) fallo('el programa no tiene «Proceso» ni «Algoritmo»', tokens[tokens.length - 1]);
    return prog;
  }

  function subproceso() {
    const tk = avanzar(); // subproceso | funcion
    const sub = { tipo: 'Sub', nombre: null, retorno: null, params: [], cuerpo: [], linea: tk.linea, lineaFin: null };
    // Dos formas: «SubProceso nombre(a, b)» y «SubProceso r <- nombre(a, b)».
    const primero = ver();
    if (primero.tipo !== 'id') fallo('se esperaba el nombre del subproceso');
    avanzar();
    if (esOp('<-')) { avanzar(); sub.retorno = primero.valor; if (!es('id')) fallo('se esperaba el nombre del subproceso'); sub.nombre = avanzar().valor; }
    else sub.nombre = primero.valor;
    if (esOp('(')) {
      avanzar();
      while (!esOp(')')) {
        if (!es('id')) fallo('se esperaba un parámetro');
        const prm = { nombre: avanzar().valor, porRef: false };
        if (esPal('por')) { avanzar(); if (esClave('referencia')) { avanzar(); prm.porRef = true; } else esperarClave('valor'); }
        sub.params.push(prm);
        if (esOp(',')) avanzar(); else if (!esOp(')')) fallo('se esperaba «,» o «)»');
      }
      avanzar();
    }
    finDeLinea(); saltarNl();
    sub.cuerpo = sentencias();
    const cierre = avanzar();
    if (!(cierre.tipo === 'pal' && (cierre.valor === 'finsubproceso' || cierre.valor === 'finfuncion')))
      fallo('se esperaba «FinSubProceso»', cierre);
    sub.lineaFin = cierre.linea;
    finDeLinea();
    return sub;
  }

  function sentencias(enSegun = false) {
    const lista = [];
    saltarNl();
    while (!es('eof') && !(ver().tipo === 'pal' && CIERRES.has(ver().valor)) && !(enSegun && pareceCaso())) {
      lista.push(sentencia());
      finDeLinea();
      saltarNl();
    }
    return lista;
  }

  function sentencia() {
    const tk = ver();
    const L = tk.linea;
    if (tk.tipo === 'pal') {
      switch (tk.valor) {
        case 'definir': {
          avanzar();
          const nombres = [];
          do { if (!es('id')) fallo('se esperaba un nombre de variable'); nombres.push(avanzar().valor); } while (esOp(',') && avanzar());
          esperarPal('como');
          const t = ver();
          if (!(t.tipo === 'pal' && ['entero', 'real', 'texto', 'logico'].includes(t.valor))) fallo('se esperaba un tipo: Entero, Real, Caracter o Logico');
          avanzar();
          return { tipo: 'Definir', nombres, tipoDato: t.valor, linea: L };
        }
        case 'dimension': {
          avanzar();
          const arreglos = [];
          do {
            if (!es('id')) fallo('se esperaba el nombre del arreglo');
            const nombre = avanzar().valor;
            esperarOp('[');
            const dims = [expresion()];
            while (esOp(',')) { avanzar(); dims.push(expresion()); }
            esperarOp(']');
            arreglos.push({ nombre, dims });
          } while (esOp(',') && avanzar());
          return { tipo: 'Dimension', arreglos, linea: L };
        }
        case 'leer': {
          avanzar();
          const destinos = [];
          do { destinos.push(destino()); } while (esOp(',') && avanzar());
          return { tipo: 'Leer', destinos, linea: L };
        }
        case 'escribir': {
          avanzar();
          let sinSaltar = false;
          if (esClave('sin') && (ver(1).valor === 'saltar')) { avanzar(); esperarClave('saltar'); sinSaltar = true; }
          const exprs = [];
          if (!es('nl') && !es('eof')) {
            do { exprs.push(expresion()); } while (esOp(',') && avanzar());
          }
          // «Escribir a, b Sin Saltar» también vale.
          if (esClave('sin') && (ver(1).valor === 'saltar')) { avanzar(); esperarClave('saltar'); sinSaltar = true; }
          return { tipo: 'Escribir', exprs, sinSaltar, linea: L };
        }
        case 'si': {
          avanzar();
          const cond = expresion();
          esperarPal('entonces');
          finDeLinea();
          const entonces = sentencias();
          let sino = null, lineaSino = null;
          if (esPal('sino')) { lineaSino = avanzar().linea; finDeLinea(); sino = sentencias(); }
          const lineaFin = esperarPal('finsi').linea;
          return { tipo: 'Si', cond, entonces, sino, lineaSino, lineaFin, linea: L };
        }
        case 'mientras': {
          avanzar();
          const cond = expresion();
          esperarPal('hacer');
          finDeLinea();
          const cuerpo = sentencias();
          const lineaFin = esperarPal('finmientras').linea;
          return { tipo: 'Mientras', cond, cuerpo, lineaFin, linea: L };
        }
        case 'repetir': {
          avanzar(); finDeLinea();
          const cuerpo = sentencias();
          const lineaFin = esperarPal('hasta').linea;
          esperarClave('que');
          const cond = expresion();
          return { tipo: 'Repetir', cuerpo, cond, lineaFin, linea: L };
        }
        case 'para': {
          avanzar();
          if (!es('id')) fallo('se esperaba la variable del Para');
          const variable = avanzar().valor;
          if (esOp('<-') || esOp('=')) avanzar(); else fallo('se esperaba «<-»');
          const desde = expresion();
          esperarPal('hasta');
          const hastaE = expresion();
          let paso = null;
          if (esClave('con') && ver(1).valor === 'paso') { avanzar(); esperarClave('paso'); paso = expresion(); }
          esperarPal('hacer');
          finDeLinea();
          const cuerpo = sentencias();
          const lineaFin = esperarPal('finpara').linea;
          return { tipo: 'Para', variable, desde, hasta: hastaE, paso, cuerpo, lineaFin, linea: L };
        }
        case 'segun': {
          avanzar();
          const expr = expresion();
          esperarPal('hacer');
          finDeLinea(); saltarNl();
          const casos = [];
          let otro = null, lineaOtro = null;
          while (!esPal('finsegun')) {
            if (esClave('de') && ver(1).valor === 'otro') {
              lineaOtro = avanzar().linea; esperarClave('otro'); esperarClave('modo'); esperarOp(':');
              otro = sentencias(true);
            } else {
              const lc = ver().linea;
              const valores = [expresion()];
              while (esOp(',')) { avanzar(); valores.push(expresion()); }
              esperarOp(':');
              // Los casos pueden ir en la misma línea que su «:» o debajo.
              const cuerpo = sentencias(true);
              casos.push({ valores, cuerpo, linea: lc });
            }
            saltarNl();
          }
          const lineaFin = esperarPal('finsegun').linea;
          return { tipo: 'Segun', expr, casos, otro, lineaOtro, lineaFin, linea: L };
        }
        default:
          fallo(`no se esperaba «${tk.valor}» aquí`);
      }
    }
    // Asignación «x <- e», «v[i] <- e», o llamada a subproceso «nombre(args)».
    if (tk.tipo === 'id') {
      if (ver(1).tipo === 'op' && ver(1).valor === '(') {
        const nombre = avanzar().valor;
        const args = argumentos();
        return { tipo: 'Llamar', nombre, args, linea: L };
      }
      const d = destino();
      if (esOp('<-') || esOp('=')) avanzar(); else fallo('se esperaba «<-»');
      const expr = expresion();
      return { tipo: 'Asignar', destino: d, expr, linea: L };
    }
    fallo(`no se esperaba «${tk.valor}» al principio de una sentencia`);
  }

  function destino() {
    if (!es('id')) fallo('se esperaba una variable');
    const nombre = avanzar().valor;
    let indices = null;
    if (esOp('[')) {
      avanzar();
      indices = [expresion()];
      while (esOp(',')) { avanzar(); indices.push(expresion()); }
      esperarOp(']');
    }
    return { nombre, indices };
  }

  function argumentos() {
    esperarOp('(');
    const args = [];
    while (!esOp(')')) {
      args.push(expresion());
      if (esOp(',')) avanzar(); else if (!esOp(')')) fallo('se esperaba «,» o «)»');
    }
    avanzar();
    return args;
  }

  // Precedencia de PSeInt, de más floja a más apretada:
  //   O · Y · NO · comparaciones · + - · * / MOD · ^ · unario
  function expresion() { return exprO(); }
  function exprO() { let a = exprY(); while (esPal('o') || esOp('|')) { avanzar(); a = { tipo: 'Bin', op: 'o', a, b: exprY() }; } return a; }
  function exprY() { let a = exprNo(); while (esPal('y') || esOp('&')) { avanzar(); a = { tipo: 'Bin', op: 'y', a, b: exprNo() }; } return a; }
  function exprNo() { if (esPal('no') || esOp('~')) { avanzar(); return { tipo: 'Un', op: 'no', a: exprNo() }; } return comparacion(); }
  function comparacion() {
    let a = suma();
    while (es('op') && ['=', '<>', '<', '<=', '>', '>=', '=='].includes(ver().valor)) {
      const op = avanzar().valor;
      a = { tipo: 'Bin', op: op === '=' || op === '==' ? '==' : op === '<>' ? '!=' : op, a, b: suma() };
    }
    return a;
  }
  function suma() { let a = producto(); while (esOp('+') || esOp('-')) { const op = avanzar().valor; a = { tipo: 'Bin', op, a, b: producto() }; } return a; }
  function producto() {
    let a = unario();
    while (esOp('*') || esOp('/') || esOp('%') || esPal('mod')) { const op = avanzar().valor; a = { tipo: 'Bin', op: op === 'mod' ? '%' : op, a, b: unario() }; }
    return a;
  }
  // El menos unario es más flojo que la potencia: «-2 ^ 2» es -(2^2) = -4, como
  // en matemáticas y como en Ñ. Y «^» asocia a la derecha con una unaria al
  // otro lado, para que «2 ^ -1» valga.
  function unario() {
    if (esOp('-')) { avanzar(); return { tipo: 'Un', op: '-', a: unario() }; }
    if (esOp('+')) { avanzar(); return unario(); }
    return potencia();
  }
  function potencia() { const a = primario(); if (esOp('^')) { avanzar(); return { tipo: 'Bin', op: '**', a, b: unario() }; } return a; }
  function primario() {
    const tk = ver();
    if (tk.tipo === 'num') { avanzar(); return { tipo: 'Num', valor: tk.valor }; }
    if (tk.tipo === 'str') { avanzar(); return { tipo: 'Str', valor: tk.valor }; }
    if (tk.tipo === 'pal' && (tk.valor === 'verdadero' || tk.valor === 'falso')) { avanzar(); return { tipo: 'Bool', valor: tk.valor === 'verdadero' }; }
    if (tk.tipo === 'id') {
      avanzar();
      if (esOp('(')) return { tipo: 'Llamada', nombre: tk.valor, args: argumentos(), linea: tk.linea, col: tk.col };
      if (esOp('[')) {
        avanzar();
        const indices = [expresion()];
        while (esOp(',')) { avanzar(); indices.push(expresion()); }
        esperarOp(']');
        return { tipo: 'Indice', nombre: tk.valor, indices };
      }
      return { tipo: 'Var', nombre: tk.valor };
    }
    if (tk.tipo === 'op' && tk.valor === '(') { avanzar(); const e = expresion(); esperarOp(')'); return e; }
    fallo(`no se esperaba «${tk.valor === '\n' ? 'fin de línea' : tk.valor}» en una expresión`);
  }

  return programa();
}

// ── 3. emisión a Ñ ──────────────────────────────────────────────────────────

// Las funciones predefinidas de PSeInt y qué son en Ñ. «usar» dice de qué eDSL
// hay que traerla; null es del núcleo. «emitir» arma la llamada, porque en
// varias no basta con cambiar el nombre: Subcadena es 1-indexada e inclusiva,
// Azar es un entero de 0 a n-1, Aleatorio es inclusivo en los dos extremos.
const PREDEFINIDAS = {
  rc:         { usar: 'numerico', n: 1, emitir: a => `raiz(${a[0]})`, ret: 'real' },
  raiz:       { usar: 'numerico', n: 1, emitir: a => `raiz(${a[0]})`, ret: 'real' },
  abs:        { usar: 'numerico', n: 1, emitir: a => `absoluto(${a[0]})`, ret: 'real' },
  ln:         { usar: 'numerico', n: 1, emitir: a => `log(${a[0]})`, ret: 'real' },
  exp:        { usar: 'numerico', n: 1, emitir: a => `exp(${a[0]})`, ret: 'real' },
  sen:        { usar: 'numerico', n: 1, emitir: a => `seno(${a[0]})`, ret: 'real' },
  cos:        { usar: 'numerico', n: 1, emitir: a => `coseno(${a[0]})`, ret: 'real' },
  tan:        { usar: 'numerico', n: 1, emitir: a => `tangente(${a[0]})`, ret: 'real' },
  asen:       { usar: 'numerico', n: 1, emitir: a => `arcoseno(${a[0]})`, ret: 'real' },
  acos:       { usar: 'numerico', n: 1, emitir: a => `arcocoseno(${a[0]})`, ret: 'real' },
  atan:       { usar: 'numerico', n: 1, emitir: a => `arcotangente(${a[0]})`, ret: 'real' },
  trunc:      { usar: 'numerico', n: 1, emitir: a => `truncar(${a[0]})`, ret: 'real' },
  redon:      { usar: 'numerico', n: 1, emitir: a => `redondear(${a[0]})`, ret: 'real' },
  azar:       { usar: 'numerico', n: 1, emitir: a => `truncar(azar() * (${a[0]}))`, ret: 'real', trae: ['truncar', 'azar'] },
  aleatorio:  { usar: 'numerico', n: 2, emitir: a => `((${a[0]}) + truncar(azar() * ((${a[1]}) - (${a[0]}) + 1)))`, ret: 'real', trae: ['truncar', 'azar'] },
  longitud:   { usar: null,       n: 1, emitir: a => `longitud(${a[0]})`, ret: 'real' },
  mayusculas: { usar: 'texto',    n: 1, emitir: a => `mayusculas(${a[0]})`, ret: 'texto' },
  minusculas: { usar: 'texto',    n: 1, emitir: a => `minusculas(${a[0]})`, ret: 'texto' },
  subcadena:  { usar: 'texto',    n: 3, emitir: a => `subtexto(${a[0]}, (${a[1]}) - 1, ${a[2]})`, ret: 'texto' },
  concatenar: { usar: null,       n: 2, emitir: a => `(${a[0]}) + (${a[1]})`, ret: 'texto' },
  convertiranumero: { usar: null, n: 1, emitir: a => `real(${a[0]})`, ret: 'real' },
  convertiratexto:  { usar: null, n: 1, emitir: a => `texto(${a[0]})`, ret: 'texto' },
};
// Qué nombre real de Ñ hay que importar por cada predefinida (para el «usar»).
const NOMBRE_N = {
  rc: 'raiz', raiz: 'raiz', abs: 'absoluto', ln: 'log', exp: 'exp', sen: 'seno', cos: 'coseno',
  tan: 'tangente', asen: 'arcoseno', acos: 'arcocoseno', atan: 'arcotangente', trunc: 'truncar',
  redon: 'redondear', mayusculas: 'mayusculas', minusculas: 'minusculas', subcadena: 'subtexto',
};

const TIPO_N = { entero: 'entero', real: 'real', texto: 'texto', logico: 'bool' };
const CERO = { entero: '0', real: '0', texto: '""', bool: 'falso', cualquiera: 'nulo' };

function escaparTexto(s) {
  // En Ñ las llaves interpolan y la barra escapa; en PSeInt son caracteres.
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\{/g, '\\{').replace(/\}/g, '\\}') + '"';
}

function emisor(prog, opciones = {}) {
  const reservadas = opciones.reservadas || new Set();   // nombres de Ñ que no se pueden usar como variable
  const avisos = [];
  const lineas = [];                                      // índice = número de línea original
  const usa = { numerico: new Set(), texto: new Set() };
  let hayLeer = false, haySinSaltar = false, hayDim = false, hayParaVar = false;
  let contSegun = 0;

  const poner = (L, txt) => {
    while (lineas.length <= L) lineas.push('');
    lineas[L] = lineas[L] ? lineas[L] + '  ' + txt : txt;
  };

  // Nombres: minúsculas ya vienen del lexer. Si choca con algo de Ñ, se le pone
  // un guion bajo detrás, y se avisa una vez.
  const renombres = new Map();
  const nombreN = n => {
    if (renombres.has(n)) return renombres.get(n);
    let r = n;
    if (reservadas.has(n) || PALABRAS_N.has(n) || n.startsWith('_')) {
      r = n + '_';
      avisos.push(`la variable «${n}» se llama «${r}» en Ñ: «${n}» ya tiene dueño allí`);
    }
    renombres.set(n, r);
    return r;
  };

  // ── ámbitos: qué variables existen y de qué tipo ─────────────────────────
  function Ambito(padre) {
    const vars = new Map();   // nombre → { tipo, esLista }
    return {
      tiene: n => vars.has(n),
      tipo: n => (vars.get(n) || {}).tipo,
      esLista: n => !!(vars.get(n) || {}).esLista,
      declarar: (n, tipo, esLista = false) => vars.set(n, { tipo, esLista }),
    };
  }

  // ── inferencia mínima de tipos, para decidir el tipo de un «var» ─────────
  function tipoDe(e, amb) {
    switch (e.tipo) {
      case 'Num': return 'real';
      case 'Str': return 'texto';
      case 'Bool': return 'bool';
      case 'Var': return amb.tipo(e.nombre) || 'cualquiera';
      case 'Indice': return amb.tipo(e.nombre) || 'cualquiera';
      case 'Un': return e.op === 'no' ? 'bool' : tipoDe(e.a, amb);
      case 'Bin':
        if (['==', '!=', '<', '<=', '>', '>=', 'y', 'o'].includes(e.op)) return 'bool';
        if (e.op === '+') {
          const ta = tipoDe(e.a, amb), tb = tipoDe(e.b, amb);
          if (ta === 'texto' || tb === 'texto') return 'texto';
          if (ta === 'real' && tb === 'real') return 'real';
          if (ta === 'entero' && tb === 'entero') return 'entero';
          if ((ta === 'real' || ta === 'entero') && (tb === 'real' || tb === 'entero')) return 'real';
          return 'cualquiera';
        }
        if (e.op === '/' || e.op === '**') return 'real';
        { const ta = tipoDe(e.a, amb), tb = tipoDe(e.b, amb);
          if (ta === 'entero' && tb === 'entero') return 'entero';
          return 'real'; }
      case 'Llamada': {
        const pd = PREDEFINIDAS[e.nombre];
        if (pd) return pd.ret;
        return 'cualquiera';
      }
    }
    return 'cualquiera';
  }

  // ── expresiones ──────────────────────────────────────────────────────────
  // Paréntesis solo donde Ñ los necesita. El árbol ya viene bien armado con la
  // precedencia de PSeInt; aquí se imprime con la de Ñ, que es:
  //   o < y < == != < < <= > >= < + - < * / % < unario (no, -) < **
  const PREC = { o: 1, y: 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 8 };
  const precDe = e => e.tipo === 'Bin' ? PREC[e.op] : e.tipo === 'Un' ? 7 : 9;
  const par = s => `(${s})`;
  // El hijo va entre paréntesis si su precedencia es menor que la del padre, o
  // igual y está a la derecha de un operador que asocia a la izquierda.
  const hijo = (e, padrePrec, derecha, amb) => {
    const t = expr(e, amb);
    const p = precDe(e);
    if (p < padrePrec) return par(t);
    if (p === padrePrec && derecha && padrePrec !== 8) return par(t);
    return t;
  };
  function expr(e, amb) {
    switch (e.tipo) {
      case 'Num': {
        // PSeInt no distingue entero de real: 3 y 3.0 son el mismo número. En Ñ
        // sí, y mezclarlos da error de tipos. Se emite tal cual y se deja que la
        // declaración «real» absorba: Ñ acepta un entero donde va un real.
        return e.valor;
      }
      case 'Str': return escaparTexto(e.valor);
      case 'Bool': return e.valor ? 'cierto' : 'falso';
      case 'Var': return nombreN(e.nombre);
      case 'Indice': return nombreN(e.nombre) + e.indices.map(i => `[${indice(i, amb)}]`).join('');
      case 'Un': {
        // En Ñ «no» y «-» aprietan más que cualquier binario: «no a > b» se
        // leería «(no a) > b». Un hijo binario va siempre entre paréntesis.
        const a = e.a.tipo === 'Bin' ? par(expr(e.a, amb)) : expr(e.a, amb);
        return e.op === 'no' ? `no ${a}` : `-${a}`;
      }
      case 'Bin': {
        const pp = PREC[e.op];
        const a = hijo(e.a, pp, false, amb);
        const b = hijo(e.b, pp, true, amb);
        // «+» entre texto y número: PSeInt concatena convirtiendo; Ñ no convierte.
        if (e.op === '+') {
          const ta = tipoDe(e.a, amb), tb = tipoDe(e.b, amb);
          if ((ta === 'texto') !== (tb === 'texto') && ta !== 'cualquiera' && tb !== 'cualquiera')
            return `${ta === 'texto' ? a : `texto(${a})`} + ${tb === 'texto' ? b : `texto(${b})`}`;
        }
        return `${a} ${e.op} ${b}`;
      }
      case 'Llamada': {
        const pd = PREDEFINIDAS[e.nombre];
        if (pd) {
          if (e.args.length !== pd.n) throw new ErrorPSeInt(`«${e.nombre}» espera ${pd.n} argumento(s) y recibió ${e.args.length}`, e.linea, e.col);
          if (pd.usar) for (const t of (pd.trae || [NOMBRE_N[e.nombre]])) usa[pd.usar].add(t);
          return pd.emitir(e.args.map(a => expr(a, amb)));
        }
        return `${nombreN(e.nombre)}(${e.args.map(a => expr(a, amb)).join(', ')})`;
      }
    }
    throw new Error('expresión desconocida ' + e.tipo);
  }

  // Un índice de PSeInt empieza en 1. Si es un literal se resta aquí mismo, para
  // que «v[3]» salga «v[2]» y no «v[(3) - 1]».
  function indice(e, amb) {
    if (e.tipo === 'Num' && /^\d+$/.test(e.valor)) return String(parseInt(e.valor, 10) - 1);
    return `(${expr(e, amb)}) - 1`;
  }

  // ── sentencias ───────────────────────────────────────────────────────────
  function bloque(sents, amb) { for (const s of sents) sentencia(s, amb); }

  function asignar(d, valorTxt, tipoValor, amb, L) {
    const n = nombreN(d.nombre);
    if (d.indices) {
      if (!amb.tiene(d.nombre)) throw new ErrorPSeInt(`«${d.nombre}» se usa como arreglo pero no tiene «Dimension»`, L, 1);
      poner(L, `${n}${d.indices.map(i => `[${indice(i, amb)}]`).join('')} = ${valorTxt}`);
      return;
    }
    if (amb.tiene(d.nombre)) { poner(L, `${n} = ${valorTxt}`); return; }
    // Primera aparición sin «Definir»: PSeInt la crea aquí. Un número en PSeInt
    // es real siempre (no hay enteros salvo que se declaren), así que «real».
    const t = tipoValor === 'entero' ? 'real' : tipoValor;
    amb.declarar(d.nombre, t);
    poner(L, `var ${n}: ${t} = ${valorTxt}`);
  }

  function sentencia(s, amb) {
    const L = s.linea;
    switch (s.tipo) {
      case 'Definir': {
        const t = TIPO_N[s.tipoDato];
        for (const nm of s.nombres) {
          if (dimensionados.has(nm)) { amb.declarar(nm, t, true); continue; }   // la lista se crea en su Dimension
          amb.declarar(nm, t);
          poner(L, `var ${nombreN(nm)}: ${t} = ${CERO[t]}`);
        }
        return;
      }
      case 'Dimension': {
        hayDim = true;
        for (const a of s.arreglos) {
          const t = amb.tipo(a.nombre) || 'real';
          amb.declarar(a.nombre, t, true);
          const dims = a.dims.map(d => expr(d, amb)).join(', ');
          poner(L, `var ${nombreN(a.nombre)}: lista = _dim([${dims}], ${CERO[t]})`);
        }
        return;
      }
      case 'Asignar': {
        const v = expr(s.expr, amb);
        asignar(s.destino, v, tipoDe(s.expr, amb), amb, L);
        return;
      }
      case 'Leer': {
        hayLeer = true;
        for (const d of s.destinos) {
          const t = amb.tipo(d.nombre);
          let v = '_leer()';
          if (t === 'entero') v = 'entero(_leer())';
          else if (t === 'real') v = 'real(_leer())';
          else if (t === 'texto') v = 'texto(_leer())';
          else if (t === 'bool') v = '(_leer() == "verdadero")';
          if (d.indices || amb.tiene(d.nombre)) asignar(d, v, t, amb, L);
          else { amb.declarar(d.nombre, 'cualquiera'); poner(L, `var ${nombreN(d.nombre)}: cualquiera = _leer()`); }
        }
        return;
      }
      case 'Escribir': {
        const partes = s.exprs.map(e => {
          const t = tipoDe(e, amb);
          const v = expr(e, amb);
          if (t === 'texto') return v;
          return `_txt(${v})`;
        });
        const todo = partes.length ? partes.join(' + ') : '""';
        if (s.sinSaltar) { haySinSaltar = true; poner(L, `_pend = _pend + ${todo}`); }
        else if (haySinSaltarEnPrograma) { haySinSaltar = true; poner(L, `imprimir(_pend + ${todo})  _pend = ""`); }
        else poner(L, `imprimir(${todo})`);
        return;
      }
      case 'Si': {
        poner(L, `si ${expr(s.cond, amb)} {`);
        bloque(s.entonces, amb);
        if (s.sino) { poner(s.lineaSino, '} sino {'); bloque(s.sino, amb); }
        poner(s.lineaFin, '}');
        return;
      }
      case 'Mientras': {
        poner(L, `mientras ${expr(s.cond, amb)} {`);
        bloque(s.cuerpo, amb);
        poner(s.lineaFin, '}');
        return;
      }
      case 'Repetir': {
        // Ñ no tiene do-while: un «mientras cierto» que sale cuando se cumple
        // la condición, evaluada al final, que es justo lo que hace «Hasta Que».
        poner(L, 'mientras cierto {');
        bloque(s.cuerpo, amb);
        poner(s.lineaFin, `si ${expr(s.cond, amb)} { romper } }`);
        return;
      }
      case 'Para': {
        const v = nombreN(s.variable);
        const desde = expr(s.desde, amb), hasta = expr(s.hasta, amb);
        const pasoLit = !s.paso || s.paso.tipo === 'Num' || (s.paso.tipo === 'Un' && s.paso.a.tipo === 'Num');
        const pasoTxt = s.paso ? expr(s.paso, amb) : '1';
        const neg = pasoTxt.startsWith('-');

        // Dos formas, según de quién es la variable del bucle.
        //
        // Si el programa la declaró antes («Definir i Como Entero» y luego
        // «Para i»), que es el modismo de PSeInt estricto, el «Para» se baja a
        // un «mientras» sobre ESA variable: al salir queda con el último valor
        // más el paso, exactamente como en PSeInt. Un «para … en rango» de Ñ
        // crearía una variable propia y la de fuera no se enteraría.
        if (amb.tiene(s.variable)) {
          let cond;
          if (pasoLit) cond = `${v} ${neg ? '>=' : '<='} ${hasta}`;
          else cond = `(${pasoTxt} > 0 y ${v} <= ${hasta}) o (${pasoTxt} < 0 y ${v} >= ${hasta})`;
          poner(L, `${v} = ${desde}  mientras ${cond} {`);
          bloque(s.cuerpo, amb);
          poner(s.lineaFin, `${v} = ${v} + ${pasoTxt} }`);
          return;
        }
        // Si no existía, el «para … en rango» de Ñ es la traducción natural, y
        // la variable vive solo dentro del bucle, que es lo que el programa espera.
        let rango;
        if (!s.paso) rango = s.hasta.tipo === 'Num' ? `rango(${desde}, ${parseInt(s.hasta.valor, 10) + 1})` : `rango(${desde}, (${hasta}) + 1)`;
        else if (pasoLit) rango = `rango(${desde}, (${hasta}) ${neg ? '-' : '+'} 1, ${pasoTxt})`;
        else { hayParaVar = true; rango = `_rango(${desde}, ${hasta}, ${pasoTxt})`; }
        const ambBucle = { ...amb, tiene: n => n === s.variable || amb.tiene(n), tipo: n => n === s.variable ? 'real' : amb.tipo(n) };
        poner(L, `para ${v} en ${rango} {`);
        bloque(s.cuerpo, ambBucle);
        poner(s.lineaFin, '}');
        return;
      }
      case 'Segun': {
        // Ñ no tiene «segun»: una cadena de si / sino si sobre una copia del valor.
        const tmp = `_s${++contSegun}`;
        poner(L, `fijo ${tmp} = ${expr(s.expr, amb)}`);
        s.casos.forEach((c, i) => {
          const cond = c.valores.map(v => `${tmp} == ${expr(v, amb)}`).join(' o ');
          poner(c.linea, (i === 0 ? '' : '} sino ') + `si ${cond} {`);
          bloque(c.cuerpo, amb);
        });
        if (s.otro) { poner(s.lineaOtro, s.casos.length ? '} sino {' : 'si cierto {'); bloque(s.otro, amb); }
        if (s.casos.length || s.otro) poner(s.lineaFin, '}');
        return;
      }
      case 'Llamar': {
        poner(L, `${nombreN(s.nombre)}(${s.args.map(a => expr(a, amb)).join(', ')})`);
        return;
      }
    }
    throw new Error('sentencia desconocida ' + s.tipo);
  }

  // ── pre-escaneo: qué nombres se dimensionan, hay «Sin Saltar» ────────────
  const dimensionados = new Set();
  let haySinSaltarEnPrograma = false;
  (function escanear(sents) {
    for (const s of sents) {
      if (s.tipo === 'Dimension') for (const a of s.arreglos) dimensionados.add(a.nombre);
      if (s.tipo === 'Escribir' && s.sinSaltar) haySinSaltarEnPrograma = true;
      for (const k of ['entonces', 'sino', 'cuerpo', 'otro']) if (Array.isArray(s[k])) escanear(s[k]);
      if (s.casos) for (const c of s.casos) escanear(c.cuerpo);
    }
  })([...prog.cuerpo, ...prog.subs.flatMap(x => x.cuerpo)]);

  // ── subprocesos ──────────────────────────────────────────────────────────
  for (const sub of prog.subs) {
    const amb = Ambito(null);
    const params = sub.params.map(p => { amb.declarar(p.nombre, 'cualquiera'); return `${nombreN(p.nombre)}: cualquiera`; });
    for (const p of sub.params) if (p.porRef) avisos.push(`línea ${sub.linea}: «${p.nombre} Por Referencia» — en Ñ los arreglos ya van por referencia; un número o texto no se puede modificar desde dentro`);
    let cab = `fn ${nombreN(sub.nombre)}(${params.join(', ')}): cualquiera {`;
    if (sub.retorno) { amb.declarar(sub.retorno, 'cualquiera'); cab += `  var ${nombreN(sub.retorno)}: cualquiera = nulo`; }
    poner(sub.linea, cab);
    bloque(sub.cuerpo, amb);
    poner(sub.lineaFin, sub.retorno ? `devolver ${nombreN(sub.retorno)} }` : '}');
  }

  // ── el programa principal ────────────────────────────────────────────────
  const ambP = Ambito(null);
  bloque(prog.cuerpo, ambP);

  // ── lo que el programa necesita de Ñ va DEBAJO del original ──────────────
  // Las funciones de Ñ se izan y «usar» vale en cualquier línea, así que los
  // ayudantes y las importaciones se escriben después de la última línea del
  // programa: las primeras N líneas de la traducción son las N del original,
  // una a una, y lo que un estudiante vería al final es maquinaria aparte, con
  // su rótulo. Lo único que no se puede izar es una variable: «_pend» va en la
  // línea del «Proceso», que no emite nada propio.
  if (haySinSaltar) {
    const L0 = prog.lineaIni;
    while (lineas.length <= L0) lineas.push('');
    lineas[L0] = 'var _pend: texto = ""' + (lineas[L0] ? '  ' + lineas[L0] : '');
    if (prog.lineaFin !== null) poner(prog.lineaFin, 'si _pend != "" { imprimir(_pend) }');
  }

  // Tantas líneas como el original aunque las últimas no emitan nada: un
  // «FinProceso» final no produce texto, pero su línea existe.
  const total = opciones.totalLineas || lineas.length - 1;
  while (lineas.length <= total) lineas.push('');
  const cuerpo = lineas.slice(1, total + 1);

  const cola = ['', '# ── lo que el modo pseudocódigo necesita de Ñ; el programa termina arriba ──'];
  if (usa.numerico.size) cola.push(`usar ${[...usa.numerico].sort().join(', ')} de "numerico"`);
  if (usa.texto.size) cola.push(`usar ${[...usa.texto].sort().join(', ')} de "texto"`);
  cola.push('fn _txt(x: cualquiera): texto { si tipo(x) == "bool" { si x { devolver "Verdadero" }  devolver "Falso" }  devolver texto(x) }');
  if (hayLeer) cola.push('fn _leer(): cualquiera { fijo l = leerLinea()  si l == nulo { lanzar "se pidió leer y no había más entrada" }  intentar { devolver real(l) } capturar { devolver l } }');
  if (hayDim) cola.push('fn _dim(dims: lista, cero: cualquiera): lista { var l: lista = []  para i en rango(entero(dims[0])) { si longitud(dims) > 1 { l = l + [_dim(rebanar(dims, 1, longitud(dims)), cero)] } sino { l = l + [cero] } }  devolver l }');
  if (hayParaVar) cola.push('fn _rango(a: cualquiera, b: cualquiera, p: cualquiera): lista { si p > 0 { devolver rango(a, b + 1, p) }  devolver rango(a, b - 1, p) }');

  return { texto: cuerpo.concat(cola).join('\n') + '\n', avisos, lineasOriginal: total };
}

// Palabras de Ñ que una variable de PSeInt no puede usar como nombre.
const PALABRAS_N = new Set(['var', 'fijo', 'fn', 'funcion', 'función', 'definir', 'devolver', 'retornar',
  'si', 'sino', 'mientras', 'para', 'en', 'repetir', 'veces', 'romper', 'continuar', 'intentar',
  'capturar', 'finalmente', 'lanzar', 'cierto', 'falso', 'nulo', 'no', 'y', 'o', 'usar', 'de', 'publico', 'público']);

// ── 4. la puerta ────────────────────────────────────────────────────────────
function traducir(fuente, opciones = {}) {
  const tokens = lexer(fuente);
  const arbol = parser(tokens);
  const orig = fuente.split(/\r?\n/);
  const r = emisor(arbol, { ...opciones, totalLineas: orig.length });
  // La sangría del original se conserva línea a línea: el «ver en Ñ» tiene que
  // parecerse al programa del estudiante, no a una salida de máquina.
  const salida = r.texto.split('\n');
  for (let i = 0; i < salida.length && i < orig.length; i++) {
    if (!salida[i]) continue;
    const sangria = (orig[i].match(/^[ \t]*/) || [''])[0].replace(/\t/g, '    ');
    salida[i] = sangria + salida[i];
  }
  return { texto: salida.join('\n'), avisos: r.avisos, lineasOriginal: r.lineasOriginal };
}

module.exports = { traducir, lexer, parser, emisor, ErrorPSeInt, PREDEFINIDAS };
