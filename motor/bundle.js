;(function(global){
'use strict';
// ============================================================================
//  ESPAÑOL-LIKE v4 — FRONT END: Léxico, Sintaxis y Tipos
//  Parte 1 de 4. Sin dependencias.
// ============================================================================

// ---------------------------------------------------------------- Diagnóstico
class ErrorFuente extends Error {
  constructor(fase, mensaje, linea, col, pista) {
    super(mensaje);
    this.fase = fase; this.linea = linea; this.col = col; this.pista = pista || null;
    this.esErrorFuente = true;
    // Qué archivo. Es null mientras el programa es uno solo, y entonces el
    // mensaje sale exactamente como salía antes; lo rellena el cargador de
    // módulos, porque un error en la línea 3 no dice nada si hay cinco archivos.
    this.archivo = null;
  }
  formato() {
    let s = `[${this.fase}] ${this.archivo ? this.archivo + ' ' : ''}línea ${this.linea}:${this.col} — ${this.message}`;
    if (this.pista) s += `\n   ↳ ${this.pista}`;
    return s;
  }
}

// ---------------------------------------------------------------------- Léxico
// Un objeto de JavaScript hereda de Object.prototype, así que PALABRAS['toString']
// y PALABRAS['constructor'] daban algo: el lexer tomaba por palabra del lenguaje
// a «constructor», «toString», «valueOf», «hasOwnProperty» y «__proto__», y el
// programa fallaba con «falta ( tras <anónima>». Una docena de nombres
// perfectamente razonables, prohibidos sin motivo y sin decirlo. Con
// Object.create(null) la tabla no hereda nada y solo contiene lo que se le pone.
// Lo mismo valdría un Map; esto deja el resto del archivo igual.
const PALABRAS = Object.assign(Object.create(null), {
  'var': 'VAR', 'fijo': 'FIJO',
  'funcion': 'FUNCION', 'función': 'FUNCION', 'definir': 'FUNCION', 'fn': 'FUNCION',
  'devolver': 'DEVOLVER', 'retornar': 'DEVOLVER',
  'si': 'SI', 'sino': 'SINO',
  'mientras': 'MIENTRAS', 'para': 'PARA', 'en': 'EN',
  'repetir': 'REPETIR', 'veces': 'VECES',
  'romper': 'ROMPER', 'continuar': 'CONTINUAR',
  'intentar': 'INTENTAR', 'capturar': 'CAPTURAR', 'finalmente': 'FINALMENTE', 'lanzar': 'LANZAR',
  'cierto': 'CIERTO', 'Cierto': 'CIERTO', 'verdadero': 'CIERTO',
  'falso': 'FALSO', 'Falso': 'FALSO',
  'nulo': 'NULO', 'Nulo': 'NULO',
  'y': 'Y', 'o': 'O', 'no': 'NO',
})

// Para cada palabra reservada, dónde se usa. Es lo que convierte «no se puede
// usar como nombre» en algo que se entiende sin ir a buscar una lista: las que
// más se tropiezan son las que además son palabras corrientes del español
// —«veces», «en», «no», «y», «o», «para»— y decir en qué construcción viven
// ahorra el viaje.
const PISTA_PALABRA = Object.assign(Object.create(null), {
  var: 'declara variables: «var x = 1»', fijo: 'declara constantes: «fijo x = 1»',
  funcion: 'declara funciones', 'función': 'declara funciones',
  definir: 'declara funciones', fn: 'declara funciones',
  devolver: 'sale de una función con un valor', retornar: 'sale de una función con un valor',
  si: 'condiciones: «si x > 0 { … }»', sino: 'la otra rama de un «si»',
  mientras: 'bucles: «mientras x < 10 { … }»',
  para: 'recorre una lista: «para x en lista { … }»',
  en: 'va dentro de «para x en lista»; prueba «dentro» o «donde»',
  repetir: 'repite n veces: «repetir 3 veces { … }»',
  veces: 'va dentro de «repetir 3 veces { … }»; prueba «cuantas», «vez» o «repeticiones»',
  romper: 'sale de un bucle', continuar: 'salta a la siguiente vuelta del bucle',
  intentar: 'protege un trozo de código', capturar: 'recoge el fallo de un «intentar»',
  finalmente: 'corre siempre, al salir de un «intentar»',
  lanzar: 'lanza un error a mano',
  cierto: 'el valor verdadero', Cierto: 'el valor verdadero', verdadero: 'el valor verdadero',
  falso: 'el valor falso', Falso: 'el valor falso',
  nulo: 'la ausencia de valor', Nulo: 'la ausencia de valor',
  no: 'operador: «no a»; prueba «negado» o «sin»',
})
// «y» y «o» NO están en esta tabla a propósito, y no es un olvido: sí se pueden
// usar como nombres. Se reconocen como operadores por la forma de la sentencia,
// igual que «usar», «como» y «de», porque reservar dos de las palabras más
// comunes del idioma habría roto cualquier programa que las use de nombre.
// «var y = 1» compila.

const TIPOS_BASE = new Set(['entero', 'real', 'texto', 'bool', 'nulo', 'lista', 'dic', 'funcion', 'nodo', 'estilo', 'error', 'fecha', 'tabla', 'arreglo', 'cualquiera']);

function lexer(fuente) {
  const toks = [];
  let i = 0, linea = 1, col = 1;
  const n = fuente.length;
  const peek = (k = 0) => fuente[i + k];
  const esDig = c => c >= '0' && c <= '9';
  const esAlfa = c => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]/.test(c || '');
  const esAlnum = c => esAlfa(c) || esDig(c);

  function push(tipo, valor, l, c, extra) {
    const t = { tipo, valor, linea: l, col: c };
    if (extra) Object.assign(t, extra);
    toks.push(t);
  }
  function avanzar() { const c = fuente[i++]; if (c === '\n') { linea++; col = 1; } else col++; return c; }

  while (i < n) {
    const c = peek();
    const L = linea, C = col;

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { avanzar(); continue; }

    // comentarios
    if (c === '#') { while (i < n && peek() !== '\n') avanzar(); continue; }
    if (c === '/' && peek(1) === '*') {
      avanzar(); avanzar();
      while (i < n && !(peek() === '*' && peek(1) === '/')) avanzar();
      if (i >= n) throw new ErrorFuente('léxico', 'comentario /* sin cerrar', L, C);
      avanzar(); avanzar(); continue;
    }

    // números
    if (esDig(c)) {
      let s = '';
      while (esDig(peek())) s += avanzar();
      let esReal = false;
      if (peek() === '.' && esDig(peek(1))) { esReal = true; s += avanzar(); while (esDig(peek())) s += avanzar(); }
      if (peek() === 'e' || peek() === 'E') {
        const g = i;
        let e = avanzar();
        if (peek() === '+' || peek() === '-') e += avanzar();
        if (esDig(peek())) { esReal = true; s += e; while (esDig(peek())) s += avanzar(); }
        else { i = g; }
      }
      push('NUM', parseFloat(s), L, C, { esReal });
      continue;
    }

    // texto con interpolación  "hola {nombre}"
    if (c === '"' || c === "'") {
      const comilla = avanzar();
      const partes = [];   // {tipo:'lit'|'expr', valor}
      let buf = '';
      while (true) {
        if (i >= n) throw new ErrorFuente('léxico', 'texto sin cerrar', L, C, 'falta la comilla de cierre');
        const ch = peek();
        if (ch === comilla) { avanzar(); break; }
        if (ch === '\\') {
          avanzar();
          const e = avanzar();
          buf += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r'
               : e === '\\' ? '\\' : e === '{' ? '{' : e === '}' ? '}' : e;
          continue;
        }
        if (ch === '{' && comilla === '"') {
          avanzar();
          if (buf) { partes.push({ tipo: 'lit', valor: buf }); buf = ''; }
          let prof = 1, sub = '';
          const sl = linea, sc = col;
          while (i < n && prof > 0) {
            const d = peek();
            if (d === '{') prof++;
            else if (d === '}') { prof--; if (prof === 0) { avanzar(); break; } }
            sub += avanzar();
          }
          if (prof > 0) throw new ErrorFuente('léxico', 'interpolación { } sin cerrar', sl, sc);
          partes.push({ tipo: 'expr', valor: sub, linea: sl, col: sc });
          continue;
        }
        buf += avanzar();
      }
      if (buf || partes.length === 0) partes.push({ tipo: 'lit', valor: buf });
      if (partes.length === 1 && partes[0].tipo === 'lit') push('TEXTO', partes[0].valor, L, C);
      else push('TEXTO_INTERP', partes, L, C);
      continue;
    }

    // Las constantes del lenguaje llevan «|» delante: |PI, |E, |INFINITO.
    //
    // No es adorno. «E» a secas como nombre global era un accidente esperando:
    // «var E: real = 5» lo tapaba en silencio y a partir de ahí el número de
    // Euler era 5. Con el sigilo eso no puede pasar, porque un programa NO
    // PUEDE declarar un nombre que empiece por «|» —lo rechaza el parser—, así
    // que una constante del lenguaje no se tapa nunca.
    //
    // Y de ahí sale lo bueno: como nadie puede querer ese nombre para otra
    // cosa, las constantes no ensucian el ámbito y no hace falta importarlas.
    // Están siempre, en cualquier archivo, sin «usar».
    // «||» es el «o» de toda la vida y va primero: el sigilo solo empieza una
    // constante cuando lo que sigue es una letra. Esto lo cazó la prueba de
    // operadores, no mi comprobación de que «|» estuviera libre — miré «|» y
    // «| » y no miré «||», que era justo el que estaba ocupado.
    if (c === '|' && esAlfa(peek(1))) {
      avanzar();
      let s = '';
      while (esAlnum(peek())) s += avanzar();

      push('CONSTANTE', '|' + s, L, C);
      continue;
    }

    // identificadores y palabras clave
    if (esAlfa(c)) {
      let s = '';
      while (esAlnum(peek())) s += avanzar();
      const pal = PALABRAS[s];
      if (pal) push(pal, s, L, C);
      else push('IDENT', s, L, C);
      continue;
    }

    // operadores (los largos primero)
    const tres = fuente.substr(i, 3);
    const dos = fuente.substr(i, 2);
    const OP3 = ['**='];
    const OP2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '->', '..'];
    if (OP3.includes(tres)) { avanzar(); avanzar(); avanzar(); push('OP', tres, L, C); continue; }
    if (OP2.includes(dos)) { avanzar(); avanzar(); push('OP', dos, L, C); continue; }
    if (dos === '&&') { avanzar(); avanzar(); push('Y', 'y', L, C); continue; }
    if (dos === '||') { avanzar(); avanzar(); push('O', 'o', L, C); continue; }
    if ('+-*/%<>=!'.includes(c)) { avanzar(); push('OP', c, L, C); continue; }
    if ('()[]{},:;.'.includes(c)) { avanzar(); push(c, c, L, C); continue; }

    throw new ErrorFuente('léxico', `carácter inesperado «${c}»`, L, C);
  }
  push('FIN', null, linea, col);
  return toks;
}

// Las llaves de un texto son la interpolación del lenguaje, así que escribir un
// JSON literal choca de frente: «{"a": 1}» intenta evaluar «"a": 1». No se
// puede arreglar sin cambiar la gramática —y la interpolación es más valiosa—,
// pero sí se puede decir qué hacer, porque el caso se reconoce a la vista.
function pistaLlaves(e, q) {
  const dentro = String(q.valor || '');
  // Vacío, o con dos puntos dentro: es JSON o CSS, no una expresión de Ñ. No
  // hace falta más precisión — si el contenido no parseaba y además lleva «:»,
  // la pista acierta mucho más de lo que estorba.
  const pareceJson = /^\s*$/.test(dentro) || dentro.includes(':');
  if (pareceJson && e && e.esErrorFuente)
    e.pista = 'si querías escribir JSON o CSS dentro del texto, escapa las llaves: ' +
      '"\\{\"a\": 1\\}" · para leer JSON de un archivo no hace falta escapar nada';
  return e;
}

// --------------------------------------------------------------------- Tipos
const T = {
  entero: { k: 'entero' }, real: { k: 'real' }, texto: { k: 'texto' },
  bool: { k: 'bool' }, nulo: { k: 'nulo' }, cualquiera: { k: 'cualquiera' },
  // Un trozo de página: lo que devuelven etiqueta(), boton() y compañía.
  nodo: { k: 'nodo' },
  // Lo que llega a «capturar»: mensaje, clase y línea de donde saltó.
  error: { k: 'error' },
  // Un trozo de estilo: propiedades, reglas anidadas y consultas de medios.
  estilo: { k: 'estilo' },
  // Un instante del calendario, sin zona horaria. Es un tipo y no un texto
  // porque así «<» y «==» funcionan solos y el verificador puede parar el
  // programa que mezcla fechas con textos, que es de donde salen los fallos.
  fecha: { k: 'fecha' },
  // Columnas con nombre y tipo. Es un tipo y no una lista de diccionarios
  // porque así el verificador sabe que «fn informe(): tabla» devuelve una, y
  // porque las columnas llevan su tipo: una de fechas sigue siendo de fechas
  // después de guardarla y volverla a leer.
  tabla: { k: 'tabla' },
  arreglo: { k: 'arreglo' },
  lista: (e) => ({ k: 'lista', elem: e || T.cualquiera }),
  dic: (c, v) => ({ k: 'dic', clave: c || T.cualquiera, valor: v || T.cualquiera }),
  fn: (params, ret) => ({ k: 'funcion', params: params || null, ret: ret || T.cualquiera }),
  // Una unión de tipos, para las firmas de la biblioteca. Se aplana y se quita
  // lo repetido al construirla, así que «real|real» es «real».
  union: (...ts) => {
    const de = [];
    for (const t of ts) for (const u of (t.k === 'union' ? t.de : [t]))
      if (!de.some(v => v.k === u.k)) de.push(u);
    return de.length === 1 ? de[0] : { k: 'union', de };
  },
};

function tipoATexto(t) {
  if (t && t.k === 'union') return t.de.map(tipoATexto).join('|');
  if (!t) return 'cualquiera';
  switch (t.k) {
    case 'lista': return t.elem && t.elem.k !== 'cualquiera' ? `lista<${tipoATexto(t.elem)}>` : 'lista';
    case 'dic': return (t.clave && t.clave.k !== 'cualquiera') ? `dic<${tipoATexto(t.clave)},${tipoATexto(t.valor)}>` : 'dic';
    case 'funcion': return t.params ? `funcion(${t.params.map(tipoATexto).join(', ')}): ${tipoATexto(t.ret)}` : 'funcion';
    // «modulo» no es un tipo que el programa pueda escribir: es lo que el
    // verificador le asigna al nombre de un «usar … como …», para poder decir
    // «un módulo no es un valor» en vez de dejarlo pasar como «cualquiera».
    case 'modulo': return `módulo «${t.ruta || t.clave}»`;
    default: return t.k;
  }
}

// Lee una firma escrita en la MISMA notación que imprime tipoATexto, para que
// lo que se declara y lo que dice el error sean el mismo texto:
//
//   'real -> real'                    raiz
//   'lista<real>, real -> real'       percentil
//   '... -> nulo'                     imprimir, aridad variable
//   ' -> entero'                      sin argumentos
//
// Falla al instalar la biblioteca, no al llamar a la función: una firma mal
// escrita revienta la creación del motor y por tanto la primera prueba que
// corra, en vez de dejar un nombre mal tipado suelto.
const BASICOS = ['entero', 'real', 'texto', 'bool', 'nulo', 'cualquiera', 'nodo', 'error', 'estilo', 'fecha', 'tabla', 'arreglo'];

// Parte por comas de primer nivel: 'lista<real>, dic<texto,real>' → dos trozos.
function partirNivel(s) {
  const out = []; let prof = 0, act = '';
  for (const c of s) {
    if (c === '<' || c === '(') prof++;
    else if (c === '>' || c === ')') prof--;
    else if (c === ',' && prof === 0) { out.push(act); act = ''; continue; }
    act += c;
  }
  if (act.trim()) out.push(act);
  return out.map(x => x.trim()).filter(x => x);
}

// Parte por barras de primer nivel, sin romper «dic<texto,real>».
function partirPorBarra(s) {
  const out = [];
  let act = '', prof = 0;
  for (const c of s) {
    if (c === '<' || c === '(') prof++;
    else if (c === '>' || c === ')') prof--;
    else if (c === '|' && prof === 0) { out.push(act); act = ''; continue; }
    act += c;
  }
  out.push(act);
  return out.map(x => x.trim()).filter(x => x);
}

function textoATipo(s) {
  s = String(s).trim();
  if (BASICOS.includes(s)) return T[s];
  // «real|arreglo» antes que nada: la barra tiene menos fuerza que todo lo
  // demás, y así «lista<real>|arreglo» también se lee.
  if (s.includes('|')) {
    const partes = partirPorBarra(s);
    if (partes.length > 1) return T.union(...partes.map(textoATipo));
  }
  let m = s.match(/^lista(?:<(.+)>)?$/);
  if (m) return T.lista(m[1] ? textoATipo(m[1]) : T.cualquiera);
  m = s.match(/^dic(?:<(.+)>)?$/);
  if (m) {
    if (!m[1]) return T.dic();
    const p = partirNivel(m[1]);
    if (p.length !== 2) throw new Error(`firma: «dic<${m[1]}>» necesita clave y valor`);
    return T.dic(textoATipo(p[0]), textoATipo(p[1]));
  }
  if (s === 'funcion') return T.fn(null, T.cualquiera);
  m = s.match(/^funcion\((.*)\): *(.+)$/);
  if (m) return firma(`${m[1]} -> ${m[2]}`);
  throw new Error(`firma: no entiendo el tipo «${s}»`);
}

// 'params -> retorno'. Params vacío = aridad 0; '...' = aridad variable.
function firma(s) {
  const i = String(s).lastIndexOf('->');
  if (i < 0) throw new Error(`firma: falta «->» en «${s}»`);
  const izq = s.slice(0, i).trim(), der = s.slice(i + 2).trim();
  if (!der) throw new Error(`firma: falta el tipo de retorno en «${s}»`);
  const params = izq === '...' ? null : partirNivel(izq).map(textoATipo);
  return T.fn(params, textoATipo(der));
}

// La aridad no se declara aparte: es lo que dice la firma. Así no pueden
// discrepar, que era el fallo silencioso de tener las dos cosas a mano.
const aridadDe = t => (t && t.k === 'funcion' && t.params === null ? -1
  : t && t.k === 'funcion' ? t.params.length : 0);

// ¿se puede usar un valor de tipo `origen` donde se espera `destino`?
function compatible(destino, origen) {
  if (!destino || !origen) return true;
  if (destino.k === 'cualquiera' || origen.k === 'cualquiera') return true;
  // Una unión acepta cualquiera de sus miembros. Existe por «seno»: tiene que
  // recibir un número o un arreglo, y la alternativa era poner «cualquiera» y
  // perder la comprobación del todo, o inventar «senoA» al lado de «seno», que
  // es el ruido que este lenguaje quiere quitar. Solo se escribe en las firmas
  // de la biblioteca: un programa no puede declarar «var x: real|arreglo».
  if (destino.k === 'union') return destino.de.some(t => compatible(t, origen));
  if (origen.k === 'union') return origen.de.every(t => compatible(destino, t));
  if (destino.k === origen.k) {
    if (destino.k === 'lista') return compatible(destino.elem, origen.elem);
    if (destino.k === 'dic') return compatible(destino.clave, origen.clave) && compatible(destino.valor, origen.valor);
    return true;
  }
  if (destino.k === 'real' && origen.k === 'entero') return true;   // ensanchado numérico
  return false;
}
const esNum = t => t && (t.k === 'entero' || t.k === 'real' || t.k === 'cualquiera');

// -------------------------------------------------------------------- Parser
// Reescribe la línea y la columna de todo un subárbol. Hace falta para las
// interpolaciones, que se analizan como si fueran un programa aparte.
function reubicar(nodo, linea, col) {
  const vistos = new Set();
  const andar = (x) => {
    if (!x || typeof x !== 'object' || vistos.has(x)) return;
    vistos.add(x);
    if (Array.isArray(x)) { for (const y of x) andar(y); return; }
    if (typeof x.tipo === 'string') { x.linea = linea; x.col = col; }
    for (const k in x) if (k !== 'tipoLit' && k !== 'anotacion' && k !== 'retorno') andar(x[k]);
  };
  andar(nodo);
  return nodo;
}

function parser(toks, fuenteNombre) {
  let p = 0;
  const ver = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const fin = () => ver().tipo === 'FIN';
  const comprobar = (tipo, valor) => {
    const t = ver();
    return t.tipo === tipo && (valor === undefined || t.valor === valor);
  };
  const igualar = (tipo, valor) => { if (comprobar(tipo, valor)) { p++; return true; } return false; };
  // «y» y «o» son operadores, pero también deben poder usarse como nombres
  // Una constante del lenguaje se LEE donde se lee un nombre, pero no cuenta
  // como nombre declarable: eso es lo que la hace imposible de tapar.
  const esNombre = t => t.tipo === 'IDENT' || t.tipo === 'Y' || t.tipo === 'O';
  function exigirNombre(msg) {
    const t = ver();
    if (esNombre(t)) { p++; return t; }
    // Aquí está la garantía del sigilo: un programa no puede declarar «|algo»,
    // ni como variable, ni como función, ni como parámetro. Por eso una
    // constante del lenguaje no se puede tapar, y por eso no hace falta
    // importarla: no hay forma de que signifique otra cosa.
    if (t.tipo === 'CONSTANTE')
      throw new ErrorFuente('sintaxis', `«${t.valor}» es una constante del lenguaje y no se puede declarar`,
        t.linea, t.col, `el «|» está reservado a Ñ; para lo tuyo usa un nombre sin él, como «${t.valor.slice(1)}»`);
    // Si lo que llegó es una palabra del lenguaje, hay que DECIRLO. «veces» es
    // un nombre perfectamente natural en español —«var veces = 0»— y está
    // reservado porque existe «repetir 3 veces { … }». Sin esta pista el
    // mensaje era «se esperaba el nombre de la variable» sobre una línea que se
    // ve correcta, y hay que ir a buscar la lista de palabras reservadas para
    // entenderlo. Con ella se lee de una vez.
    if (PALABRAS[String(t.valor)] !== undefined)
      throw new ErrorFuente('sintaxis',
        `«${t.valor}» es una palabra del lenguaje y no se puede usar como nombre`,
        t.linea, t.col, PISTA_PALABRA[String(t.valor)] || 'ponle otro nombre');
    throw new ErrorFuente('sintaxis', msg || `se esperaba un nombre y llegó «${t.valor}»`, t.linea, t.col);
  }
  function exigir(tipo, valor, msg) {
    if (comprobar(tipo, valor)) return toks[p++];
    const t = ver();
    throw new ErrorFuente('sintaxis', msg || `se esperaba «${valor || tipo}» y llegó «${t.valor === null ? 'fin de archivo' : t.valor}»`, t.linea, t.col);
  }
  const saltarPuntoYComa = () => { while (igualar(';')) { } };

  // --- tipos ---
  function parseTipo() {
    const t = ver();
    if (t.tipo !== 'IDENT' && t.tipo !== 'NULO' && t.tipo !== 'FUNCION')
      throw new ErrorFuente('sintaxis', `se esperaba un tipo y llegó «${t.valor}»`, t.linea, t.col);
    const nombre = t.tipo === 'NULO' ? 'nulo' : (t.tipo === 'FUNCION' ? 'funcion' : t.valor);
    p++;
    if (!TIPOS_BASE.has(nombre))
      throw new ErrorFuente('tipos', `tipo desconocido «${nombre}»`, t.linea, t.col,
        `tipos válidos: ${[...TIPOS_BASE].join(', ')}`);
    if (nombre === 'lista' && comprobar('OP', '<')) {
      p++; const e = parseTipo(); exigir('OP', '>', 'falta «>» al cerrar lista<…>'); return T.lista(e);
    }
    if (nombre === 'dic' && comprobar('OP', '<')) {
      p++; const c = parseTipo(); exigir(',', ','); const v = parseTipo();
      exigir('OP', '>', 'falta «>» al cerrar dic<…>'); return T.dic(c, v);
    }
    if (nombre === 'funcion') return T.fn(null, T.cualquiera);
    // «lista» y «dic» sin parámetros. T.lista y T.dic son fábricas, no tipos:
    // devolverlas tal cual dejaba en la anotación una función de JavaScript, y a
    // partir de ahí tipoATexto decía «undefined» y compatible() comparaba con
    // basura. Salió al anotar «fn f(d: dic)», que es lo más normal del mundo.
    if (nombre === 'lista') return T.lista();
    if (nombre === 'dic') return T.dic();
    return T[nombre] || T.cualquiera;
  }
  const tipoOpcional = () => igualar(':') ? parseTipo() : null;

  // --- programa ---
  function programa() {
    const cuerpo = [];
    while (!fin()) cuerpo.push(declaracion(true));
    return { tipo: 'Programa', cuerpo, linea: 1, col: 1 };
  }

  // «esTop» dice si estamos en el nivel superior del archivo. Solo ahí valen
  // «usar» y «publico»: un módulo se carga una vez al empezar, y lo que se
  // exporta es la cara del archivo, no algo que aparezca a mitad de un bucle.
  function declaracion(esTop) {
    const imp = quizaUsar(esTop);
    if (imp) return imp;
    const pub = quizaPublico(esTop);
    if (pub) return pub;
    if (comprobar('VAR') || comprobar('FIJO')) return declVar();
    // «fn |f» no es una función anónima: es alguien intentando declarar una
    // constante del lenguaje. Se manda a declFuncion para que dé el mensaje
    // bueno en vez de «falta ( tras <anónima>».
    if (comprobar('FUNCION') && (esNombre(ver(1)) || ver(1).tipo === 'CONSTANTE')) return declFuncion();
    return sentencia();
  }

  // ── módulos ───────────────────────────────────────────────────────────────
  // «usar», «publico», «como» y «de» NO son palabras reservadas. Reservar «de»
  // o «como» —dos de las palabras más comunes del español— rompería cualquier
  // programa que las use como nombre, y el léxico ya tiene el precedente de «y»
  // y «o», que son operadores y nombres a la vez según el contexto. Aquí se
  // reconocen solo en la forma de la sentencia: al principio de una sentencia
  // del nivel superior, «usar» seguido de un texto o de una lista de nombres
  // que acaba en «de». Fuera de ahí siguen siendo identificadores normales.
  const esPalabra = (t, v) => t.tipo === 'IDENT' && t.valor === v;

  function quizaUsar(esTop) {
    const t = ver();
    if (!esPalabra(t, 'usar')) return null;
    const sig = ver(1);
    let esImport = sig.tipo === 'TEXTO' || sig.tipo === 'TEXTO_INTERP';
    if (!esImport && esNombre(sig)) {
      // Se mira adelante: nombre (, nombre)* «de». Si no aparece el «de» pero sí
      // apareció una coma o una ruta, esto no puede ser otra cosa —«usar a, b»
      // no es una expresión válida en ningún caso— así que en vez de dejarlo
      // caer en «no se esperaba «,» aquí» se dice qué falta.
      let k = 1, huboComa = false;
      for (;;) {
        if (!esNombre(ver(k))) break;
        k++;
        if (ver(k).tipo === ',') { k++; huboComa = true; continue; }
        if (esPalabra(ver(k), 'de')) { esImport = true; break; }
        if (huboComa || ver(k).tipo === 'TEXTO' || ver(k).tipo === 'TEXTO_INTERP')
          throw new ErrorFuente('sintaxis', 'falta «de» y la ruta del módulo', ver(k).linea, ver(k).col,
            'escribe «usar sumar, restar de "mates.esl"»');
        break;
      }
    }
    if (!esImport) return null;
    if (!esTop)
      throw new ErrorFuente('sintaxis', '«usar» solo puede ir en el nivel superior del archivo', t.linea, t.col,
        'un módulo se carga una vez al empezar, no dentro de una función ni de un bloque');
    p++;                                              // «usar»
    if (comprobar('TEXTO_INTERP'))
      throw new ErrorFuente('sintaxis', 'la ruta de un módulo no puede llevar interpolación { }', ver().linea, ver().col,
        'tiene que saberse al compilar, no al ejecutar');
    if (comprobar('TEXTO')) {
      const ruta = toks[p++];
      const cm = ver();
      // «usar "ruta" como nombre» — el módulo entero, detrás de un alias.
      if (esPalabra(cm, 'como')) {
        p++;
        const al = exigirNombre('se esperaba el nombre con el que usar el módulo');
        saltarPuntoYComa();
        return { tipo: 'Usar', ruta: ruta.valor, alias: al.valor, nombres: null, todo: false, linea: t.linea, col: t.col };
      }
      // Un nombre pegado detrás de la ruta, en la MISMA línea, es un «como»
      // olvidado y no la forma a secas. Antes de admitir «usar "x"» esto lo
      // decía el propio error; ahora hay que distinguirlo a mano, porque si no
      // el mensaje pasa a ser «sobra un nombre», que no ayuda a nadie.
      if (esNombre(cm) && cm.linea === ruta.linea)
        throw new ErrorFuente('sintaxis', `se esperaba «como» y llegó «${cm.valor}»`, cm.linea, cm.col,
          `escribe «usar "${ruta.valor}" como ${cm.valor}», o «usar "${ruta.valor}"» a secas para traerlo todo`);
      // «usar "ruta"» a secas — todo lo que exporte, sin cualificar. No es una
      // comodidad para archivos: existe para «usar "clasico"», que devuelve al
      // ámbito global los nombres que se mudaron a un eDSL. Con un archivo
      // también vale, y ahí es igual de explícito: la ruta se lee y se ve.
      saltarPuntoYComa();
      return { tipo: 'Usar', ruta: ruta.valor, alias: null, nombres: null, todo: true, linea: t.linea, col: t.col };
    }
    const nombres = [];                               // usar a, b de "ruta"
    do {
      const nn = exigirNombre('se esperaba el nombre de algo que importar');
      nombres.push({ nombre: nn.valor, linea: nn.linea, col: nn.col });
    } while (igualar(','));
    const de = ver();
    if (!esPalabra(de, 'de'))
      throw new ErrorFuente('sintaxis', `se esperaba «de» y llegó «${de.valor === null ? 'fin de archivo' : de.valor}»`, de.linea, de.col,
        'escribe «usar sumar, restar de "mates.esl"»');
    p++;
    const ruta = exigir('TEXTO', undefined, 'se esperaba la ruta del módulo, entre comillas');
    saltarPuntoYComa();
    return { tipo: 'Usar', ruta: ruta.valor, alias: null, nombres, linea: t.linea, col: t.col };
  }

  function quizaPublico(esTop) {
    const t = ver();
    if (!esPalabra(t, 'publico') && !esPalabra(t, 'público')) return null;
    const sig = ver(1);
    if (sig.tipo !== 'FUNCION' && sig.tipo !== 'FIJO' && sig.tipo !== 'VAR') return null;
    if (!esTop)
      throw new ErrorFuente('sintaxis', '«publico» solo puede marcar algo del nivel superior del archivo', t.linea, t.col,
        'lo que vive dentro de una función o de un bloque no sale del archivo');
    p++;
    const d = comprobar('FUNCION') ? declFuncion() : declVar();
    d.publico = true;
    return d;
  }

  function declVar() {
    const t = toks[p++];
    const esFijo = t.tipo === 'FIJO';
    const nom = exigirNombre('se esperaba el nombre de la variable');
    const anot = tipoOpcional();
    let valor = null;
    if (igualar('OP', '=')) valor = expresion();
    else if (esFijo) throw new ErrorFuente('sintaxis', `«fijo ${nom.valor}» necesita un valor`, nom.linea, nom.col);
    saltarPuntoYComa();
    return { tipo: 'DeclVar', nombre: nom.valor, anotacion: anot, valor, esFijo, linea: t.linea, col: t.col };
  }

  function declFuncion() {
    const t = toks[p++];
    const nom = exigirNombre('se esperaba el nombre de la función');
    const { params, retorno, cuerpo } = restoFuncion(nom.valor);
    return { tipo: 'DeclFuncion', nombre: nom.valor, params, retorno, cuerpo, linea: t.linea, col: t.col };
  }

  function restoFuncion(nombre) {
    exigir('(', '(', `falta «(» tras «${nombre}»`);
    const params = [];
    if (!comprobar(')')) {
      do {
        const pn = exigirNombre('se esperaba el nombre de un parámetro');
        const pt = tipoOpcional();
        params.push({ nombre: pn.valor, anotacion: pt, linea: pn.linea, col: pn.col });
      } while (igualar(','));
    }
    exigir(')', ')', 'falta «)» al cerrar los parámetros');
    let retorno = null;
    if (igualar(':')) retorno = parseTipo();
    else if (igualar('OP', '->')) retorno = parseTipo();
    const cuerpo = bloque();
    return { params, retorno, cuerpo };
  }

  function bloque() {
    const t = exigir('{', '{', 'falta «{» para abrir el bloque');
    const cuerpo = [];
    while (!comprobar('}') && !fin()) cuerpo.push(declaracion(false));
    exigir('}', '}', 'falta «}» para cerrar el bloque');
    return { tipo: 'Bloque', cuerpo, linea: t.linea, col: t.col };
  }

  function sentencia() {
    const t = ver();
    if (comprobar('SI')) return sentSi();
    if (comprobar('MIENTRAS')) return sentMientras();
    if (comprobar('PARA')) return sentPara();
    if (comprobar('REPETIR')) return sentRepetir();
    if (comprobar('DEVOLVER')) {
      p++;
      let v = null;
      if (!comprobar('}') && !comprobar(';') && !fin() && !inicioDeLineaNueva(t)) v = expresion();
      saltarPuntoYComa();
      return { tipo: 'Devolver', valor: v, linea: t.linea, col: t.col };
    }
    if (comprobar('INTENTAR')) return sentIntentar();
    if (comprobar('LANZAR')) {
      p++;
      const v = expresion();
      saltarPuntoYComa();
      return { tipo: 'Lanzar', valor: v, linea: t.linea, col: t.col };
    }
    if (comprobar('ROMPER')) { p++; saltarPuntoYComa(); return { tipo: 'Romper', linea: t.linea, col: t.col }; }
    if (comprobar('CONTINUAR')) { p++; saltarPuntoYComa(); return { tipo: 'Continuar', linea: t.linea, col: t.col }; }
    if (comprobar('{')) return bloque();
    const e = expresion();
    saltarPuntoYComa();
    return { tipo: 'ExprSent', expr: e, linea: e.linea, col: e.col };
  }
  // «devolver» solo: si el siguiente token está en otra línea, no hay valor
  function inicioDeLineaNueva(t) { return ver().linea > t.linea; }

  function sentSi() {
    const t = toks[p++];
    const cond = expresion();
    const entonces = bloque();
    let sino = null;
    if (igualar('SINO')) sino = comprobar('SI') ? sentSi() : bloque();
    return { tipo: 'Si', cond, entonces, sino, linea: t.linea, col: t.col };
  }
  // intentar { … } capturar (e) { … } finalmente { … }
  // Al menos una de las dos partes tiene que estar; un «intentar» solo no
  // significa nada y casi siempre es un descuido.
  function sentIntentar() {
    const t = toks[p++];
    const cuerpo = bloque();
    let nombreError = null, captura = null, finalmente = null;
    if (igualar('CAPTURAR')) {
      if (igualar('(')) {
        nombreError = exigirNombre('se esperaba el nombre del error: «capturar (e)»').valor;
        exigir(')', undefined, 'falta «)» tras el nombre del error');
      }
      captura = bloque();
    }
    if (igualar('FINALMENTE')) finalmente = bloque();
    if (!captura && !finalmente) {
      throw new ErrorFuente('sintaxis', 'un «intentar» necesita «capturar» o «finalmente»', t.linea, t.col,
        'escribe «intentar { … } capturar (e) { … }»');
    }
    return { tipo: 'Intentar', cuerpo, nombreError, captura, finalmente, linea: t.linea, col: t.col };
  }

  function sentMientras() {
    const t = toks[p++];
    const cond = expresion();
    return { tipo: 'Mientras', cond, cuerpo: bloque(), linea: t.linea, col: t.col };
  }
  function sentPara() {
    const t = toks[p++];
    const nom = exigirNombre('se esperaba la variable del bucle: «para i en …»');
    exigir('EN', undefined, 'falta «en» en el bucle «para»');
    const iter = expresion();
    return { tipo: 'Para', nombre: nom.valor, iterable: iter, cuerpo: bloque(), linea: t.linea, col: t.col };
  }
  function sentRepetir() {
    const t = toks[p++];
    const cuantas = expresion();
    igualar('VECES');
    return { tipo: 'Repetir', cuantas, cuerpo: bloque(), linea: t.linea, col: t.col };
  }

  // --- expresiones ---
  function expresion() { return asignacion(); }

  function asignacion() {
    const izq = oLogico();
    const t = ver();
    if (t.tipo === 'OP' && ['=', '+=', '-=', '*=', '/='].includes(t.valor)) {
      p++;
      const der = asignacion();
      const op = t.valor;
      if (izq.tipo === 'Variable' || izq.tipo === 'Indice' || izq.tipo === 'Propiedad') {
        return { tipo: 'Asignacion', destino: izq, op, valor: der, linea: t.linea, col: t.col };
      }
      throw new ErrorFuente('sintaxis', 'el lado izquierdo de «=» no es asignable', t.linea, t.col,
        'solo se puede asignar a una variable, a lista[i] o a dic.campo');
    }
    return izq;
  }

  function binarioIzq(sig, comprueba) {
    let izq = sig();
    for (;;) {
      const t = ver();
      if (!comprueba(t)) return izq;
      p++;
      const der = sig();
      izq = { tipo: 'Binario', op: t.valor, izq, der, linea: t.linea, col: t.col };
    }
  }
  // «y» y «o» son a la vez operadores lógicos y nombres válidos de variable.
  // Se leen como operador solo si van en la misma línea que lo anterior y no
  // les sigue algo que los convierta en el sujeto de una sentencia (=, [, ., ().
  function esOperadorLogico(t, clase) {
    if (t.tipo !== clase) return false;
    const previo = toks[p - 1];
    if (previo && t.linea !== previo.linea) return false;
    const sig = ver(1);
    if (sig.tipo === '[' || sig.tipo === '.' || sig.tipo === '(') return false;
    if (sig.tipo === 'OP' && ['=', '+=', '-=', '*=', '/='].includes(sig.valor)) return false;
    return true;
  }
  const oLogico = () => binarioIzq(yLogico, t => esOperadorLogico(t, 'O'));
  const yLogico = () => binarioIzq(igualdad, t => esOperadorLogico(t, 'Y'));
  const igualdad = () => binarioIzq(comparacion, t => t.tipo === 'OP' && ['==', '!='].includes(t.valor));
  const comparacion = () => binarioIzq(termino, t => t.tipo === 'OP' && ['<', '<=', '>', '>='].includes(t.valor));
  const termino = () => binarioIzq(factor, t => t.tipo === 'OP' && ['+', '-'].includes(t.valor));
  const factor = () => binarioIzq(unario, t => t.tipo === 'OP' && ['*', '/', '%', '//'].includes(t.valor));

  function unario() {
    const t = ver();
    if (t.tipo === 'NO' || (t.tipo === 'OP' && t.valor === '-')) {
      p++;
      return { tipo: 'Unario', op: t.tipo === 'NO' ? 'no' : '-', expr: unario(), linea: t.linea, col: t.col };
    }
    return potencia();
  }
  function potencia() {
    const base = llamada();
    const t = ver();
    if (t.tipo === 'OP' && t.valor === '**') {
      p++;
      return { tipo: 'Binario', op: '**', izq: base, der: unario(), linea: t.linea, col: t.col };
    }
    return base;
  }

  function llamada() {
    let e = primario();
    for (;;) {
      const t = ver();
      if (comprobar('(')) {
        p++;
        const args = [];
        if (!comprobar(')')) do { args.push(expresion()); } while (igualar(','));
        exigir(')', ')', 'falta «)» al cerrar la llamada');
        e = { tipo: 'Llamada', callee: e, args, linea: t.linea, col: t.col };
      } else if (comprobar('[')) {
        p++;
        const idx = expresion();
        exigir(']', ']', 'falta «]» al cerrar el índice');
        e = { tipo: 'Indice', obj: e, indice: idx, linea: t.linea, col: t.col };
      } else if (comprobar('.')) {
        p++;
        const nom = exigirNombre('se esperaba un nombre tras «.»');
        e = { tipo: 'Propiedad', obj: e, nombre: nom.valor, linea: nom.linea, col: nom.col };
      } else return e;
    }
  }

  function primario() {
    const t = ver();
    switch (t.tipo) {
      case 'NUM': p++; return { tipo: 'Literal', valor: t.valor, tipoLit: t.esReal ? T.real : T.entero, linea: t.linea, col: t.col };
      case 'TEXTO': p++; return { tipo: 'Literal', valor: t.valor, tipoLit: T.texto, linea: t.linea, col: t.col };
      case 'CIERTO': p++; return { tipo: 'Literal', valor: true, tipoLit: T.bool, linea: t.linea, col: t.col };
      case 'FALSO': p++; return { tipo: 'Literal', valor: false, tipoLit: T.bool, linea: t.linea, col: t.col };
      case 'NULO': p++; return { tipo: 'Literal', valor: null, tipoLit: T.nulo, linea: t.linea, col: t.col };
      case 'CONSTANTE':
      case 'IDENT': case 'Y': case 'O':
        p++; return { tipo: 'Variable', nombre: t.valor, linea: t.linea, col: t.col };
      case 'TEXTO_INTERP': {
        p++;
        const partes = t.valor.map(q => {
          if (q.tipo === 'lit') return { tipo: 'Literal', valor: q.valor, tipoLit: T.texto, linea: t.linea, col: t.col };
          // El trozo entre llaves se analiza por separado, así que sale
          // numerado desde su propia línea 1. Sin corregirlo, un fallo dentro de
          // una interpolación se reporta en la línea 1 del programa.
          let sub;
          try { sub = parser(lexer(q.valor), fuenteNombre); }
          catch (e) { throw pistaLlaves(e, q); }
          if (sub.cuerpo.length !== 1 || sub.cuerpo[0].tipo !== 'ExprSent')
            throw pistaLlaves(new ErrorFuente('sintaxis',
              'la interpolación { } debe contener una sola expresión', q.linea, q.col), q);
          return reubicar(sub.cuerpo[0].expr, q.linea, q.col);
        });
        return { tipo: 'Interpolacion', partes, linea: t.linea, col: t.col };
      }
      case 'FUNCION': {
        p++;
        const { params, retorno, cuerpo } = restoFuncion('<anónima>');
        return { tipo: 'FuncionAnon', params, retorno, cuerpo, linea: t.linea, col: t.col };
      }
      case '(': {
        p++;
        const e = expresion();
        exigir(')', ')', 'falta «)»');
        return e;
      }
      case '[': {
        p++;
        const items = [];
        if (!comprobar(']')) do { if (comprobar(']')) break; items.push(expresion()); } while (igualar(','));
        exigir(']', ']', 'falta «]» al cerrar la lista');
        return { tipo: 'ListaLit', items, linea: t.linea, col: t.col };
      }
      case '{': {
        p++;
        const pares = [];
        if (!comprobar('}')) do {
          if (comprobar('}')) break;
          let clave;
          if (esNombre(ver()) && (ver(1).tipo === ':')) { clave = { tipo: 'Literal', valor: ver().valor, tipoLit: T.texto, linea: ver().linea, col: ver().col }; p++; }
          else clave = expresion();
          exigir(':', ':', 'falta «:» entre clave y valor');
          pares.push({ clave, valor: expresion() });
        } while (igualar(','));
        exigir('}', '}', 'falta «}» al cerrar el diccionario');
        return { tipo: 'DicLit', pares, linea: t.linea, col: t.col };
      }
    }
    throw new ErrorFuente('sintaxis', `no se esperaba «${t.valor === null ? 'fin de archivo' : t.valor}» aquí`, t.linea, t.col);
  }

  return programa();
}


// ============================================================================
//  ESPAÑOL-LIKE v4 — Verificador de tipos y Compilador a bytecode
//  Parte 2 de 4.
// ============================================================================

// --------------------------------------------------------------- Instrucciones
const OP = {};
const OP_NOMBRE = [];
[
  'CONST', 'NULO', 'CIERTO', 'FALSO', 'POP', 'DUP',
  'GET_LOCAL', 'SET_LOCAL', 'GET_GLOBAL', 'SET_GLOBAL', 'DEF_GLOBAL', 'GET_UP', 'SET_UP',
  'ADD', 'SUB', 'MUL', 'DIV', 'IDIV', 'MOD', 'POW', 'NEG', 'NOT',
  'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE',
  'JMP', 'JMP_FALSE', 'JMP_TRUE', 'LOOP',
  'CALL', 'CLOSURE', 'CLOSE_UP', 'RET',
  'LISTA', 'DIC', 'IDX_GET', 'IDX_SET', 'PROP_GET', 'CONCAT', 'LEN',
  // Fase 2 — excepciones. TRY apila un manejador apuntando al bloque que
  // recoge; FIN_TRY lo quita al salir bien; LANZAR desenrolla.
  'TRY', 'FIN_TRY', 'LANZAR',
].forEach((n, i) => { OP[n] = i; OP_NOMBRE[i] = n; });

// cuántos operandos (bytes) lleva cada instrucción
const OPERANDOS = {
  [OP.CONST]: 1, [OP.GET_LOCAL]: 1, [OP.SET_LOCAL]: 1,
  [OP.GET_GLOBAL]: 1, [OP.SET_GLOBAL]: 1, [OP.DEF_GLOBAL]: 1,
  [OP.GET_UP]: 1, [OP.SET_UP]: 1,
  [OP.JMP]: 1, [OP.JMP_FALSE]: 1, [OP.JMP_TRUE]: 1, [OP.LOOP]: 1,
  [OP.CALL]: 1, [OP.CLOSURE]: 1, [OP.LISTA]: 1, [OP.DIC]: 1, [OP.CONCAT]: 1,
  [OP.PROP_GET]: 1, [OP.TRY]: 1,
};

class Chunk {
  constructor(nombre) { this.nombre = nombre; this.code = []; this.lineas = []; this.consts = []; this.indice = new Map(); }
  emitir(op, linea) { this.code.push(op); this.lineas.push(linea | 0); return this.code.length - 1; }
  // Un Map evita recorrer todas las constantes en cada una nueva. Sus claves usan
  // SameValueZero: los primitivos iguales comparten entrada y los objetos (las
  // funciones anidadas) se distinguen por identidad, que es justo lo que hace falta.
  cte(v) {
    const visto = this.indice.get(v);
    if (visto !== undefined) return visto;
    this.consts.push(v);
    const i = this.consts.length - 1;
    this.indice.set(v, i);
    return i;
  }
}

class FuncionCompilada {
  constructor(nombre, aridad) {
    this.nombre = nombre; this.aridad = aridad;
    this.chunk = new Chunk(nombre);
    this.nUpvalues = 0;
    // Tamaño máximo del marco. El verificador de bytecode lo usa para rechazar
    // un GET_LOCAL que se salga; sin él, leer un slot inexistente devuelve
    // «undefined» calladamente.
    this.maxSlots = 1;
    this.ast = null;        // se guarda para el JIT
    this.jit = null;        // función JS compilada, si procede
    this.jitEstado = 'frío'; // frío | caliente | compilada | rechazada
    this.llamadas = 0;
    this.nombresParams = [];
  }
  toString() { return `<funcion ${this.nombre}/${this.aridad}>`; }
}

// ======================================================================
//  VERIFICADOR DE TIPOS  (gradual: lo anotado se comprueba, lo demás no)
// ======================================================================
// «indiceEdsl» es nombre → [eDSL que lo exportan]. Sin él, mudar un nombre a un
// eDSL solo produce «no está definida», que es un muro: el programa era válido
// ayer y hoy no, y el mensaje no dice por qué. Con él, el mensaje dice la línea
// exacta que falta, y la mudanza pasa de romper cosas a enseñar el camino.
function verificarTipos(ast, globalesTipos, enlace, indiceEdsl) {

  const errores = [];
  const avisos = [];

  function err(nodo, msg, pista) {
    errores.push(new ErrorFuente('tipos', msg, nodo.linea, nodo.col, pista));
    return T.cualquiera;
  }

  class Ambito {
    constructor(padre, retornoEsperado) {
      this.vars = new Map(); this.padre = padre;
      this.retornoEsperado = retornoEsperado !== undefined ? retornoEsperado : (padre ? padre.retornoEsperado : null);
      this.hayRetorno = false;
    }
    declarar(n, t, esFijo) { this.vars.set(n, { tipo: t, esFijo }); }
    buscar(n) { let a = this; while (a) { if (a.vars.has(n)) return a.vars.get(n); a = a.padre; } return null; }
  }

  const raiz = new Ambito(null, null);
  for (const [n, t] of Object.entries(globalesTipos)) raiz.declarar(n, t, true);

  // Lo importado entra en el ámbito raíz como si estuviera declarado aquí, con
  // el tipo que el otro archivo anotó. Va después de la biblioteca a propósito:
  // importar algo llamado «texto» la tapa, y el aviso ya lo dio el enlazador.
  if (enlace) {
    for (const [al, m] of enlace.alias)
      raiz.declarar(al, { k: 'modulo', clave: m.clave, ruta: m.ruta, exporta: m.exporta }, true);
    for (const [nm, i] of enlace.nombres)
      raiz.vars.set(nm, { tipo: i.tipo || T.cualquiera, esFijo: true, deModulo: i.ruta,
        deClasico: i.deClasico ? i : null });
  }

  // Cuáles de los nombres que trajo «usar "clasico"» se usan de verdad. El
  // interruptor es una elección legítima, así que no avisa por existir: avisa
  // solo cuando SOBRA —el archivo no usa ninguno— o cuando con tres nombres
  // concretos se queda más claro de lo que trae. Un aviso que sale siempre se
  // aprende a ignorar, y entonces deja de servir para nada.
  const clasicoUsado = new Set();
  const marcarUso = v => { if (v && v.deClasico) clasicoUsado.add(v.deClasico); };

  // Declarar algo con el nombre de una función de la biblioteca la tapa para
  // el resto del programa, en silencio. No es un error —puede ser aposta— pero
  // sí es la clase de cosa que cuesta media hora encontrar cuando no lo es.
  function avisarSiTapa(nodo, nombre, que) {
    if (!Object.prototype.hasOwnProperty.call(globalesTipos, nombre)) return;
    avisos.push(new ErrorFuente('nombres', `${que} «${nombre}» tapa a la de la biblioteca`,
      nodo.linea, nodo.col, `a partir de aquí «${nombre}» ya no es la de Ñ; si es a propósito, ponle otro nombre para que se lea`));
  }

  // pre-registrar funciones de nivel superior (permite llamadas antes de definirlas)
  function registrarFunciones(cuerpo, amb) {
    for (const s of cuerpo) {
      if (s.tipo === 'DeclFuncion') {
        if (amb === raiz) avisarSiTapa(s, s.nombre, 'la función');
        amb.declarar(s.nombre, T.fn(s.params.map(p => p.anotacion || T.cualquiera), s.retorno || T.cualquiera), true);
      }
    }
  }

  function bloqueTipos(nodo, amb) { for (const s of nodo.cuerpo) sent(s, amb); }

  function sent(n, amb) {
    switch (n.tipo) {
      case 'DeclVar': {
        const tv = n.valor ? expr(n.valor, amb) : T.nulo;
        let t = n.anotacion || tv;
        if (n.anotacion && n.valor && !compatible(n.anotacion, tv))
          err(n, `«${n.nombre}» se declaró como ${tipoATexto(n.anotacion)} pero recibe ${tipoATexto(tv)}`,
            `cambia la anotación o convierte el valor (por ejemplo con entero(x) o real(x))`);
        if (amb.vars.has(n.nombre)) {
          // Decir «ya estaba declarada» de algo que el programa no declaró
          // nunca no ayuda a nadie: lo que pasa es que ese nombre es de la
          // biblioteca.
          if (amb === raiz && Object.prototype.hasOwnProperty.call(globalesTipos, n.nombre) && !amb.declaradas?.has(n.nombre))
            err(n, `«${n.nombre}» es una función de la biblioteca y no se puede redeclarar`, 'ponle otro nombre a la tuya');
          else err(n, `«${n.nombre}» ya estaba declarada en este ámbito`);
        }
        amb.declarar(n.nombre, t, n.esFijo);
        return;
      }
      case 'DeclFuncion': {
        if (!amb.vars.has(n.nombre))
          amb.declarar(n.nombre, T.fn(n.params.map(p => p.anotacion || T.cualquiera), n.retorno || T.cualquiera), true);
        const sub = new Ambito(amb, n.retorno || null);
        for (const p of n.params) sub.declarar(p.nombre, p.anotacion || T.cualquiera, false);
        bloqueTipos(n.cuerpo, sub);
        if (n.retorno && n.retorno.k !== 'nulo' && n.retorno.k !== 'cualquiera' && !sub.hayRetorno)
          err(n, `«${n.nombre}» promete devolver ${tipoATexto(n.retorno)} pero hay caminos sin «devolver»`,
            'añade un «devolver» al final de la función');
        return;
      }
      case 'Bloque': return bloqueTipos(n, new Ambito(amb));
      case 'Si': {
        const c = expr(n.cond, amb);
        if (c.k !== 'bool' && c.k !== 'cualquiera')
          avisos.push(new ErrorFuente('tipos', `la condición de «si» es ${tipoATexto(c)}, no bool`, n.linea, n.col, 'se usará su valor de verdad'));
        sent(n.entonces, new Ambito(amb));
        if (n.sino) sent(n.sino, new Ambito(amb));
        return;
      }
      case 'Mientras': expr(n.cond, amb); sent(n.cuerpo, new Ambito(amb)); return;
      case 'Repetir': {
        const t = expr(n.cuantas, amb);
        if (!esNum(t)) err(n, `«repetir» necesita un número y recibió ${tipoATexto(t)}`);
        sent(n.cuerpo, new Ambito(amb)); return;
      }
      case 'Para': {
        const it = expr(n.iterable, amb);
        let elem = T.cualquiera;
        if (it.k === 'lista') elem = it.elem;
        else if (it.k === 'texto') elem = T.texto;
        else if (it.k !== 'cualquiera' && it.k !== 'dic')
          err(n, `no se puede recorrer un valor de tipo ${tipoATexto(it)}`, 'usa una lista, un texto o rango(n)');
        const sub = new Ambito(amb);
        sub.declarar(n.nombre, elem, false);
        bloqueTipos(n.cuerpo, sub);
        return;
      }
      case 'Devolver': {
        const t = n.valor ? expr(n.valor, amb) : T.nulo;
        amb.hayRetorno = true;
        let a = amb; while (a) { a.hayRetorno = true; if (a.retornoEsperado !== (a.padre ? a.padre.retornoEsperado : null)) break; a = a.padre; }
        const esperado = amb.retornoEsperado;
        if (esperado && !compatible(esperado, t))
          err(n, `esta función debe devolver ${tipoATexto(esperado)} y devuelve ${tipoATexto(t)}`);
        return;
      }
      case 'Romper': case 'Continuar': return;
      case 'Lanzar': expr(n.valor, amb); return;
      case 'Intentar': {
        sent(n.cuerpo, new Ambito(amb));
        if (n.captura) {
          const dentro = new Ambito(amb);
          // Lo que llega a «capturar» puede ser un error del motor o cualquier
          // valor que el programa haya lanzado, así que el tipo es «cualquiera»
          // salvo que el programa solo lance errores; no se puede saber aquí.
          if (n.nombreError) dentro.declarar(n.nombreError, T.cualquiera, false);
          sent(n.captura, dentro);
        }
        if (n.finalmente) sent(n.finalmente, new Ambito(amb));
        return;
      }
      case 'ExprSent': expr(n.expr, amb); return;
      // El enlazador ya lo resolvió; aquí no hay nada que comprobar.
      case 'Usar': return;
      default: return;
    }
  }

  function expr(n, amb) {
    switch (n.tipo) {
      case 'Literal': return n.tipoLit;
      case 'Interpolacion': for (const q of n.partes) expr(q, amb); return T.texto;
      case 'Variable': {
        const v = amb.buscar(n.nombre);
        if (!v) return err(n, `«${n.nombre}» no está definida`, pistaNombre(n.nombre, amb));
        // El alias de un módulo no es un valor: no se puede pasar, ni guardar,
        // ni comparar. Solo sirve para «m.algo», y eso se resuelve al compilar.
        // Convertirlo en un diccionario al vuelo sería cómodo y traería de vuelta
        // el problema de los ciclos: el diccionario solo existiría cuando el
        // módulo hubiera terminado de ejecutarse.
        if (v.tipo && v.tipo.k === 'modulo')
          return err(n, `«${n.nombre}» es un módulo, no un valor`,
            `sirve para «${n.nombre}.algo»; si necesitas pasar una de sus funciones, tráela con «usar … de …»`);
        marcarUso(v);
        return v.tipo;
      }
      case 'Asignacion': {
        const tv = expr(n.valor, amb);
        if (n.destino.tipo === 'Variable') {
          const v = amb.buscar(n.destino.nombre);
          if (!v) return err(n, `«${n.destino.nombre}» no está definida`, pistaNombre(n.destino.nombre, amb));
          // Estos dos salen y no siguen: decir además «es funcion(…) y se le
          // asigna entero» sobre un nombre que no se puede asignar es ruido.
          if (v.deModulo) return err(n, `«${n.destino.nombre}» viene de «${v.deModulo}» y no se puede cambiar desde aquí`,
            'lo que exporta un módulo solo lo cambia ese módulo');
          if (v.tipo && v.tipo.k === 'modulo') return err(n, `«${n.destino.nombre}» es un módulo, no una variable`);
          if (v.esFijo) err(n, `«${n.destino.nombre}» es fijo y no se puede reasignar`, 'decláralo con «var» si debe cambiar');
          if (n.op === '=' && !compatible(v.tipo, tv))
            err(n, `«${n.destino.nombre}» es ${tipoATexto(v.tipo)} y se le asigna ${tipoATexto(tv)}`);
          return v.tipo;
        }
        if (n.destino.tipo === 'Propiedad' && n.destino.obj.tipo === 'Variable') {
          const mod = amb.buscar(n.destino.obj.nombre);
          if (mod && mod.tipo && mod.tipo.k === 'modulo')
            return err(n, `«${n.destino.obj.nombre}.${n.destino.nombre}» viene de «${mod.tipo.ruta}» y no se puede cambiar desde aquí`,
              'lo que exporta un módulo solo lo cambia ese módulo');
        }
        expr(n.destino, amb);
        return tv;
      }
      case 'Unario': {
        const t = expr(n.expr, amb);
        // «-a» sobre un arreglo le cambia el signo a todos sus números.
        if (n.op === '-') {
          if (t.k === 'arreglo') return T.arreglo;
          if (!esNum(t)) err(n, `«-» necesita un número y recibió ${tipoATexto(t)}`);
          return t;
        }
        return T.bool;
      }
      case 'Binario': {
        const a = expr(n.izq, amb), b = expr(n.der, amb);
        const op = n.op;
        if (op === 'o' || op === 'y') return T.bool;
        if (['==', '!='].includes(op)) return T.bool;
        if (['<', '<=', '>', '>='].includes(op)) {
          // Dos fechas se ordenan. Una fecha con cualquier otra cosa no, y eso
          // se dice aquí y no al ejecutar: es la mitad del valor de que «fecha»
          // sea un tipo. La VM lo vuelve a comprobar para lo que llegue como
          // «cualquiera», y las dos reglas tienen que decir lo mismo.
          const dosFechas = a.k === 'fecha' && b.k === 'fecha';
          if (!(dosFechas || (esNum(a) && esNum(b)) || (a.k === 'texto' && b.k === 'texto') ||
                a.k === 'cualquiera' || b.k === 'cualquiera'))
            err(n, `no se pueden comparar ${tipoATexto(a)} y ${tipoATexto(b)} con «${op}»`,
              // La misma pista que da la VM. Si las dos reglas dicen cosas
              // distintas, el programa recibe un consejo u otro según por
              // dónde entre, y eso es peor que no dar ninguno.
              (a.k === 'tabla' || b.k === 'tabla')
                ? 'una tabla no tiene orden; para ordenar sus filas usa ordenarPor(t, "columna")'
                : (a.k === 'fecha' || b.k === 'fecha')
                  ? 'una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)' : null);
          return T.bool;
        }
        // Un arreglo se opera con otro arreglo o con un número, y el resultado
        // es un arreglo. Esto es lo que deja escribir «a * 2 + b» en vez de un
        // bucle, y que el verificador lo tipe sin ejecutar nada.
        if (a.k === 'arreglo' || b.k === 'arreglo') {
          if (['+', '-', '*', '/', '//', '%', '**'].includes(op)) {
            const otro = a.k === 'arreglo' ? b : a;
            if (otro.k === 'arreglo' || esNum(otro) || otro.k === 'cualquiera') return T.arreglo;
            err(n, `«${op}»: un arreglo se opera con otro arreglo o con un número, y llegó ${tipoATexto(otro)}`,
              'para pasar una lista a arreglo usa arreglo(lista)');
            return T.arreglo;
          }
        }
        if (op === '+') {
          if (a.k === 'texto' || b.k === 'texto') {
            if (a.k !== 'texto' || b.k !== 'texto') {
              if (a.k !== 'cualquiera' && b.k !== 'cualquiera')
                err(n, `no se puede sumar ${tipoATexto(a)} y ${tipoATexto(b)}`,
                  `en Python esto también falla; convierte con texto(...) — por ejemplo: "n = " + texto(n)`);
            }
            return T.texto;
          }
          if (a.k === 'lista' && b.k === 'lista') return a;
        }
        if (!esNum(a) || !esNum(b)) {
          if (op === '+') err(n, `no se puede sumar ${tipoATexto(a)} y ${tipoATexto(b)}`,
            'convierte a texto con texto(...) o revisa los tipos');
          else err(n, `«${op}» necesita números y recibió ${tipoATexto(a)} y ${tipoATexto(b)}`);
          return T.cualquiera;
        }
        if (op === '/') return T.real;
        if (op === '//' || op === '%') return (a.k === 'entero' && b.k === 'entero') ? T.entero : T.real;
        if (a.k === 'cualquiera' || b.k === 'cualquiera') return T.cualquiera;
        return (a.k === 'entero' && b.k === 'entero') ? T.entero : T.real;
      }
      case 'Llamada': {
        const ft = expr(n.callee, amb);
        const args = n.args.map(a => expr(a, amb));
        if (ft.k === 'funcion' && ft.params) {
          if (ft.params.length !== args.length) {
            const nom = n.callee.tipo === 'Variable' ? `«${n.callee.nombre}»` : 'la función';
            err(n, `${nom} espera ${ft.params.length} argumento(s) y recibió ${args.length}`);
          } else {
            for (let i = 0; i < args.length; i++)
              if (!compatible(ft.params[i], args[i]))
                err(n.args[i], `argumento ${i + 1}: se esperaba ${tipoATexto(ft.params[i])} y llegó ${tipoATexto(args[i])}`);
          }
          return ft.ret;
        }
        if (ft.k !== 'cualquiera' && ft.k !== 'funcion')
          err(n, `${tipoATexto(ft)} no es una función; no se puede llamar`);
        // Una función de número variable de argumentos no deja comprobar lo que
        // entra, pero sí se sabe lo que sale. Devolver «cualquiera» aquí tiraba
        // esa información y dejaba sin comprobar todo lo que viniera después.
        if (ft.k === 'funcion' && ft.ret) return ft.ret;
        return T.cualquiera;
      }
      case 'Indice': {
        const o = expr(n.obj, amb), i = expr(n.indice, amb);
        if (o.k === 'lista') { if (!esNum(i)) err(n, `el índice de una lista debe ser entero y es ${tipoATexto(i)}`); return o.elem; }
        if (o.k === 'texto') return T.texto;
        if (o.k === 'dic') return o.valor;
        if (o.k !== 'cualquiera') err(n, `no se puede indexar un valor de tipo ${tipoATexto(o)}`);
        return T.cualquiera;
      }
      case 'Propiedad': {
        // «m.algo» con m un alias de módulo se resuelve aquí, antes de mirar m
        // como expresión: un módulo no es un valor y evaluarlo daría un error.
        // Un local o un parámetro con ese nombre manda sobre el alias.
        const mod = n.obj.tipo === 'Variable' ? amb.buscar(n.obj.nombre) : null;
        if (mod && mod.tipo && mod.tipo.k === 'modulo') {
          const t = mod.tipo.exporta.get(n.nombre);
          if (t === undefined)
            return err(n, `«${mod.tipo.ruta}» no exporta «${n.nombre}»`,
              mod.tipo.exporta.size ? 'exporta: ' + [...mod.tipo.exporta.keys()].join(', ')
                                    : 'no exporta nada: márcalo con «publico»');
          return t;
        }
        const o = expr(n.obj, amb);
        // dic<texto,real> accedido con «.» debe seguir siendo real, no «cualquiera»
        if (o.k === 'dic') return o.valor;
        return T.cualquiera;
      }
      case 'ListaLit': {
        if (!n.items.length) return T.lista(T.cualquiera);
        const ts = n.items.map(x => expr(x, amb));
        let e = ts[0];
        for (const t of ts) if (!compatible(e, t)) { if (compatible(t, e)) e = t; else { e = T.cualquiera; break; } }
        return T.lista(e);
      }
      case 'DicLit': {
        for (const p of n.pares) { expr(p.clave, amb); expr(p.valor, amb); }
        return T.dic(T.cualquiera, T.cualquiera);
      }
      case 'FuncionAnon': {
        const sub = new Ambito(amb, n.retorno || null);
        for (const p of n.params) sub.declarar(p.nombre, p.anotacion || T.cualquiera, false);
        bloqueTipos(n.cuerpo, sub);
        return T.fn(n.params.map(p => p.anotacion || T.cualquiera), n.retorno || T.cualquiera);
      }
      default: return T.cualquiera;
    }
  }

  // «candidatos» permite buscar parecidos fuera del ámbito: los nombres de los
  // eDSL, que no están declarados aquí pero existen en alguna parte.
  function sugerir(nombre, amb, candidatos) {
    const cands = candidatos ? candidatos.slice() : [];
    let a = amb; while (a) { for (const k of a.vars.keys()) cands.push(k); a = a.padre; }
    let mejor = null, mejorD = 1e9;
    const dist = (x, y) => {
      const m = x.length, k = y.length;
      const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(k).fill(0)]);
      for (let j = 0; j <= k; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= k; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      return d[m][k];
    };
    const bajo = nombre.toLowerCase();
    for (const c of cands) { const dd = dist(bajo, c.toLowerCase()); if (dd < mejorD) { mejorD = dd; mejor = c; } }
    if (mejor && mejorD <= Math.max(2, Math.floor(nombre.length / 3))) return `¿querías decir «${mejor}»?`;
    return null;
  }

  // El nombre existe, pero vive en un eDSL que este archivo no ha importado.
  // Se dice qué línea escribir, con el nombre tal cual, para que se pueda
  // copiar. Si está en más de uno, se nombran todos y decide quien escribe.
  function enQueEdsl(nombre) {
    if (!indiceEdsl) return null;
    const eds = indiceEdsl.get(nombre);
    if (!eds || !eds.length) return null;
    if (eds.length === 1)
      return `está en el eDSL «${eds[0]}»: añade arriba  usar ${nombre} de "${eds[0]}"`;
    return `está en los eDSL ${eds.map(e => `«${e}»`).join(' y ')}: añade arriba ` +
      eds.map(e => `usar ${nombre} de "${e}"`).join('  ·  ');
  }
  // La pista de un nombre que no se encuentra, en orden de utilidad:
  //   1. el nombre existe tal cual en un eDSL → la línea exacta que falta
  //   2. se parece a algo del ámbito           → «¿querías decir?»
  //   3. se parece a algo de un eDSL           → las dos cosas a la vez
  // El tercer caso hacía falta: al mudar un nombre a un eDSL, escribirlo mal
  // dejaba de dar cualquier pista, y antes de la mudanza sí la daba.
  function pistaNombre(nombre, amb) {
    // Las constantes del lenguaje son un conjunto pequeño y cerrado, así que
    // cuando alguien escribe una que no existe se pueden nombrar todas.
    if (nombre.charAt(0) === '|') {
      const hay = Object.keys(globalesTipos).filter(k => k.charAt(0) === '|').sort();
      return hay.length
        ? `las constantes del lenguaje son ${hay.join(', ')}`
        : 'no hay constantes del lenguaje definidas';
    }
    const exacto = enQueEdsl(nombre);
    if (exacto) return exacto;
    const cerca = sugerir(nombre, amb);
    if (cerca) return cerca;
    if (!indiceEdsl || !indiceEdsl.size) return null;
    const p = sugerir(nombre, null, [...indiceEdsl.keys()]);
    if (!p) return null;
    const m = p.match(/«([^»]+)»/);
    const eds = m && indiceEdsl.get(m[1]);
    return eds ? `${p} — está en el eDSL «${eds[0]}»: usar ${m[1]} de "${eds[0]}"` : p;
  }

  registrarFunciones(ast.cuerpo, raiz);
  for (const s of ast.cuerpo) sent(s, raiz);

  // El aviso del interruptor, ya con el archivo entero recorrido.
  const usarClasico = ast.cuerpo.find(x => x.tipo === 'Usar' && x.todo && x.ruta === 'clasico');
  if (usarClasico && errores.length === 0) {
    const usados = [...clasicoUsado];
    if (!usados.length) {
      avisos.push(new ErrorFuente('nombres', '«usar "clasico"» aquí no hace nada',
        usarClasico.linea, usarClasico.col,
        'este archivo no usa ninguno de los nombres que trae; se puede borrar la línea'));
    } else if (usados.length <= 3 && indiceEdsl) {
      // Con tres o menos, la línea concreta dice de dónde sale cada cosa, y el
      // archivo deja de arrastrar un ámbito entero para tres funciones.
      const porEdsl = new Map();
      for (const i of usados) {
        const donde = i.edslOrigen;
        if (!donde) continue;
        if (!porEdsl.has(donde)) porEdsl.set(donde, []);
        porEdsl.get(donde).push(i.nombre);
      }
      if (porEdsl.size) {
        const lineas = [...porEdsl].map(([e, ns]) => `usar ${ns.sort().join(', ')} de "${e}"`);
        const traia = usados[0].cuantosTraia || 0;
        avisos.push(new ErrorFuente('nombres',
          `«usar "clasico"» trae ${traia} nombres y este archivo usa ${usados.length}`,
          usarClasico.linea, usarClasico.col, 'con esto basta:  ' + lineas.join('  ·  ')));
      }
    }
  }
  return { errores, avisos };
}

// ======================================================================
//  COMPILADOR  →  bytecode
// ======================================================================
function compilar(ast, nombreScript, enlace) {

  // El enlace dice a qué global se refiere cada nombre libre. Sin él —un
  // programa de un solo archivo— cada nombre es el que pone, exactamente como
  // antes de que existieran los módulos.
  const enl = enlace || null;
  const gl = nombre => globalDeEnlace(enl, nombre);

  class Ctx {
    constructor(padre, tipo, nombre, aridad) {
      this.padre = padre; this.tipo = tipo;
      this.fn = new FuncionCompilada(nombre, aridad);
      this.locals = [{ nombre: '', prof: 0, capturada: false }]; // slot 0 = la propia función
      this.prof = 0;
      this.upvalues = [];
      this.bucles = [];
      // Bloques «intentar» que envuelven al punto que se está compilando. Sirve
      // para dos cosas al salir por devolver, romper o continuar: quitar los
      // manejadores que quedarían colgando, y ejecutar los «finalmente».
      this.protegidos = [];
    }
  }
  let c = new Ctx(null, 'script', nombreScript || 'principal', 0);
  c.fn.enlace = enl;

  const chunk = () => c.fn.chunk;
  const emit = (op, linea) => chunk().emitir(op, linea);
  function emitOp(op, arg, linea) { emit(op, linea); if (arg !== undefined && arg !== null) emit(arg, linea); }
  function emitCte(v, linea) { const i = chunk().cte(v); emitOp(OP.CONST, i, linea); return i; }
  function emitSalto(op, linea) { emit(op, linea); emit(0xffff, linea); return chunk().code.length - 1; }
  function parchear(pos) {
    const salto = chunk().code.length - pos - 1;
    chunk().code[pos] = salto;
  }
  function emitBucle(inicio, linea) {
    emit(OP.LOOP, linea);
    emit(chunk().code.length - inicio + 1, linea);
  }

  // Ejecuta los «finalmente» pendientes y quita los manejadores que quedarían
  // colgando, al salir de bloques protegidos por devolver, romper o continuar.
  // «hasta» es cuántos niveles de protección hay que deshacer.
  function salirDeProtegidos(hasta, linea, hayValorEnPila) {
    if (!c.protegidos.length) return;
    // El valor que ya está en la pila (el de «devolver») no es un local
    // declarado, pero sí ocupa un hueco: sin este marcador, un local dentro del
    // «finalmente» recibiría un número de casilla que no le corresponde.
    if (hayValorEnPila) c.locals.push({ nombre: ' salida', prof: c.prof, capturada: false });
    for (let i = c.protegidos.length - 1; i >= hasta; i--) {
      const pr = c.protegidos[i];
      for (let k = 0; k < pr.manejadores; k++) emit(OP.FIN_TRY, linea);
      if (pr.finalmente) cuerpoDe(pr.finalmente, linea);
    }
    if (hayValorEnPila) c.locals.pop();
  }
  // ¿Cuántos bloques protegidos hay que deshacer para salir del bucle actual?
  // Los que se abrieron ya dentro de él.
  function nivelProtegidoDelBucle() {
    let i = c.protegidos.length;
    while (i > 0 && c.protegidos[i - 1].nBucles >= c.bucles.length) i--;
    return i;
  }
  function cuerpoDe(bloqueNodo, linea) {
    ambitoAbrir();
    for (const s of bloqueNodo.cuerpo) sent(s);
    ambitoCerrar(linea);
  }

  function ambitoAbrir() { c.prof++; }
  function ambitoCerrar(linea) {
    c.prof--;
    while (c.locals.length > 1 && c.locals[c.locals.length - 1].prof > c.prof) {
      emit(c.locals[c.locals.length - 1].capturada ? OP.CLOSE_UP : OP.POP, linea);
      c.locals.pop();
    }
  }
  function declararLocal(nombre, linea) {
    if (c.prof === 0) return -1;
    for (let i = c.locals.length - 1; i >= 1; i--) {
      const l = c.locals[i];
      if (l.prof < c.prof) break;
      if (l.nombre === nombre) throw new ErrorFuente('compilación', `«${nombre}» ya existe en este bloque`, linea, 1);
    }
    c.locals.push({ nombre, prof: c.prof, capturada: false });
    if (c.locals.length > c.fn.maxSlots) c.fn.maxSlots = c.locals.length;
    return c.locals.length - 1;
  }
  function buscarLocal(ctx, nombre) {
    for (let i = ctx.locals.length - 1; i >= 1; i--) if (ctx.locals[i].nombre === nombre) return i;
    return -1;
  }
  // El «nombre» no lo usa el intérprete —le basta la ranura— pero sí el JIT:
  // una función compilada a JavaScript no tiene marco en la pila de la máquina,
  // así que una ranura no le dice nada y un nombre sí.
  function addUpvalue(ctx, idx, esLocal, nombre) {
    for (let i = 0; i < ctx.upvalues.length; i++)
      if (ctx.upvalues[i].idx === idx && ctx.upvalues[i].esLocal === esLocal) return i;
    ctx.upvalues.push({ idx, esLocal, nombre });
    ctx.fn.nUpvalues = ctx.upvalues.length;
    return ctx.upvalues.length - 1;
  }
  // ¿Hay un local o un parámetro con ese nombre, aquí o en una función de
  // fuera? No marca nada como capturado, al revés que buscarUpvalue: solo
  // sirve para decidir si un nombre puede ser el alias de un módulo.
  function visibleComoLocal(ctx, nombre) {
    for (let x = ctx; x; x = x.padre) if (buscarLocal(x, nombre) !== -1) return true;
    return false;
  }
  function buscarUpvalue(ctx, nombre) {
    if (!ctx.padre) return -1;
    const l = buscarLocal(ctx.padre, nombre);
    if (l !== -1) { ctx.padre.locals[l].capturada = true; return addUpvalue(ctx, l, true, nombre); }
    const u = buscarUpvalue(ctx.padre, nombre);
    if (u !== -1) return addUpvalue(ctx, u, false, nombre);
    return -1;
  }

  // ---- sentencias
  function sent(n) {
    switch (n.tipo) {
      case 'DeclVar': {
        if (n.valor) expr(n.valor); else emit(OP.NULO, n.linea);
        if (c.prof === 0) emitOp(OP.DEF_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
        else declararLocal(n.nombre, n.linea);
        return;
      }
      case 'DeclFuncion': {
        if (c.prof > 0) declararLocal(n.nombre, n.linea);
        funcion(n, n.nombre);
        if (c.prof === 0) emitOp(OP.DEF_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
        return;
      }
      case 'Bloque': ambitoAbrir(); for (const s of n.cuerpo) sent(s); ambitoCerrar(n.linea); return;
      case 'Si': {
        expr(n.cond);
        const aElse = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.entonces);
        const aFin = emitSalto(OP.JMP, n.linea);
        parchear(aElse);
        emit(OP.POP, n.linea);
        if (n.sino) sent(n.sino);
        parchear(aFin);
        return;
      }
      case 'Mientras': {
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        expr(n.cond);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.cuerpo);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        return;
      }
      case 'Repetir': {
        ambitoAbrir();
        expr(n.cuantas);
        const sTope = declararLocal(' tope', n.linea);
        emitCte(0, n.linea);
        const sI = declararLocal(' i', n.linea);
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emitOp(OP.GET_LOCAL, sTope, n.linea);
        emit(OP.LT, n.linea);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.cuerpo);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitOp(OP.GET_LOCAL, sI, n.linea); emitCte(1, n.linea); emit(OP.ADD, n.linea);
        emitOp(OP.SET_LOCAL, sI, n.linea); emit(OP.POP, n.linea);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        ambitoCerrar(n.linea);
        return;
      }
      case 'Para': {
        ambitoAbrir();
        expr(n.iterable);
        const sIter = declararLocal(' iter', n.linea);
        emitCte(0, n.linea);
        const sI = declararLocal(' i', n.linea);
        emitOp(OP.GET_LOCAL, sIter, n.linea); emit(OP.LEN, n.linea);
        const sLen = declararLocal(' len', n.linea);
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emitOp(OP.GET_LOCAL, sLen, n.linea);
        emit(OP.LT, n.linea);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        ambitoAbrir();
        emitOp(OP.GET_LOCAL, sIter, n.linea);
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emit(OP.IDX_GET, n.linea);
        declararLocal(n.nombre, n.linea);
        for (const s of n.cuerpo.cuerpo) sent(s);
        ambitoCerrar(n.linea);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitOp(OP.GET_LOCAL, sI, n.linea); emitCte(1, n.linea); emit(OP.ADD, n.linea);
        emitOp(OP.SET_LOCAL, sI, n.linea); emit(OP.POP, n.linea);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        ambitoCerrar(n.linea);
        return;
      }
      case 'Devolver': {
        if (c.tipo === 'script') throw new ErrorFuente('compilación', '«devolver» solo puede ir dentro de una función', n.linea, n.col);
        if (n.valor) expr(n.valor); else emit(OP.NULO, n.linea);
        salirDeProtegidos(0, n.linea, true);
        emit(OP.RET, n.linea);
        return;
      }
      case 'Romper': {
        if (!c.bucles.length) throw new ErrorFuente('compilación', '«romper» fuera de un bucle', n.linea, n.col);
        const b = c.bucles[c.bucles.length - 1];
        salirDeProtegidos(nivelProtegidoDelBucle(), n.linea, false);
        for (let i = c.locals.length - 1; i >= 1 && c.locals[i].prof > b.prof; i--) emit(OP.POP, n.linea);
        b.rompes.push(emitSalto(OP.JMP, n.linea));
        return;
      }
      case 'Continuar': {
        if (!c.bucles.length) throw new ErrorFuente('compilación', '«continuar» fuera de un bucle', n.linea, n.col);
        const b = c.bucles[c.bucles.length - 1];
        salirDeProtegidos(nivelProtegidoDelBucle(), n.linea, false);
        for (let i = c.locals.length - 1; i >= 1 && c.locals[i].prof > b.prof; i--) emit(OP.POP, n.linea);
        b.continuas.push(emitSalto(OP.JMP, n.linea));
        return;
      }

      // ── intentar / capturar / finalmente ────────────────────────────────
      // Los manejadores se apilan de fuera hacia dentro: primero el del
      // «finalmente», que tiene que correr aunque falle el propio «capturar».
      // El «finalmente» se emite dos veces, una por cada camino de salida, que
      // es como lo resolvió CPython a partir de la 3.11 y evita tener que
      // llevar «acciones pendientes» dentro de la máquina.
      case 'Intentar': {
        const conFin = !!n.finalmente;
        const saltoFin = conFin ? emitSalto(OP.TRY, n.linea) : null;
        const saltoCap = n.captura ? emitSalto(OP.TRY, n.linea) : null;

        c.protegidos.push({
          manejadores: (conFin ? 1 : 0) + (n.captura ? 1 : 0),
          finalmente: n.finalmente,
          nBucles: c.bucles.length,
        });
        cuerpoDe(n.cuerpo, n.linea);
        const marco = c.protegidos[c.protegidos.length - 1];

        if (n.captura) { emit(OP.FIN_TRY, n.linea); marco.manejadores--; }
        const alFinal = emitSalto(OP.JMP, n.linea);

        if (n.captura) {
          parchear(saltoCap);
          // La máquina ha dejado el valor lanzado justo aquí.
          ambitoAbrir();
          if (n.nombreError) declararLocal(n.nombreError, n.linea);
          else emit(OP.POP, n.linea);
          for (const st of n.captura.cuerpo) sent(st);
          ambitoCerrar(n.linea);
        }
        parchear(alFinal);
        c.protegidos.pop();

        if (conFin) {
          emit(OP.FIN_TRY, n.linea);
          cuerpoDe(n.finalmente, n.linea);          // camino normal
          const saltarExcepcional = emitSalto(OP.JMP, n.linea);

          parchear(saltoFin);                        // camino excepcional
          ambitoAbrir();
          const slot = declararLocal(' lanzado', n.linea);
          cuerpoDe(n.finalmente, n.linea);
          emitOp(OP.GET_LOCAL, slot, n.linea);
          emit(OP.LANZAR, n.linea);
          ambitoCerrar(n.linea);
          parchear(saltarExcepcional);
        }
        return;
      }

      case 'Lanzar': {
        expr(n.valor);
        emit(OP.LANZAR, n.linea);
        return;
      }
      case 'ExprSent': expr(n.expr); emit(OP.POP, n.linea); return;

      // ── usar ─────────────────────────────────────────────────────────────
      // Una llamada a una nativa, no un opcode nuevo: así la tabla de
      // instrucciones no cambia y los .elb de antes siguen valiendo. El nombre
      // lleva un espacio delante, que es un carácter que el léxico no acepta
      // dentro de un identificador, así que ningún programa puede llamarla.
      // Cargar un módulo NO es una operación del lenguaje; es lo que el
      // compilador emite donde hay un «usar», y nada más.
      case 'Usar': {
        // Sin clave resuelta el enlazador ya apuntó el error; no se emite nada.
        if (!n.claveResuelta) return;
        emitOp(OP.GET_GLOBAL, chunk().cte(' usar'), n.linea);
        emitCte(n.claveResuelta, n.linea);
        emitOp(OP.CALL, 1, n.linea);
        emit(OP.POP, n.linea);
        return;
      }
      default: throw new ErrorFuente('compilación', `sentencia no soportada: ${n.tipo}`, n.linea || 1, n.col || 1);
    }
  }

  function funcion(n, nombre) {
    const sub = new Ctx(c, 'funcion', nombre, n.params.length);
    // El JIT traduce desde el AST, donde los nombres están sin enlazar. Si no
    // llevara el enlace, una función de un módulo compilada por el JIT leería
    // «sumar» en vez de «…/mates.esl\0sumar»: o no la encuentra, o encuentra la
    // de la biblioteca. Sería un fallo que solo aparece tras la llamada 40.
    sub.fn.enlace = enl;
    sub.fn.ast = n;
    sub.fn.nombresParams = n.params.map(p => p.nombre);
    c = sub;
    ambitoAbrir();
    for (const p of n.params) declararLocal(p.nombre, p.linea || n.linea);
    for (const s of n.cuerpo.cuerpo) sent(s);
    emit(OP.NULO, n.linea); emit(OP.RET, n.linea);
    const compilada = c.fn;
    const ups = c.upvalues;
    c = c.padre;
    // El JIT traduce desde el AST y no ve el fondo de constantes del bytecode,
    // así que el prototipo recién compilado y la lista de capturas se dejan
    // colgados del nodo. Sin esto el JIT no puede crear el cierre y tiene que
    // rendirse con la función de fuera entera, que costaba nueve veces más.
    n.proto = compilada;
    n.ups = ups;
    const idx = chunk().cte(compilada);
    emitOp(OP.CLOSURE, idx, n.linea);
    for (const u of ups) { emit(u.esLocal ? 1 : 0, n.linea); emit(u.idx, n.linea); }
  }

  // ---- expresiones
  function expr(n) {
    switch (n.tipo) {
      case 'Literal':
        if (n.valor === null) return emit(OP.NULO, n.linea);
        if (n.valor === true) return emit(OP.CIERTO, n.linea);
        if (n.valor === false) return emit(OP.FALSO, n.linea);
        return emitCte(n.valor, n.linea);
      case 'Interpolacion': {
        for (const q of n.partes) expr(q);
        emitOp(OP.CONCAT, n.partes.length, n.linea);
        return;
      }
      case 'Variable': {
        const l = buscarLocal(c, n.nombre);
        if (l !== -1) return emitOp(OP.GET_LOCAL, l, n.linea);
        const u = buscarUpvalue(c, n.nombre);
        if (u !== -1) return emitOp(OP.GET_UP, u, n.linea);
        return emitOp(OP.GET_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
      }
      case 'Asignacion': {
        const d = n.destino;
        if (n.op !== '=') {   //  x += v   →   x = x + v
          const binOp = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' }[n.op];
          return expr({ tipo: 'Asignacion', destino: d, op: '=', linea: n.linea, col: n.col,
            valor: { tipo: 'Binario', op: binOp, izq: d, der: n.valor, linea: n.linea, col: n.col } });
        }
        if (d.tipo === 'Variable') {
          expr(n.valor);
          const l = buscarLocal(c, d.nombre);
          if (l !== -1) return emitOp(OP.SET_LOCAL, l, n.linea);
          const u = buscarUpvalue(c, d.nombre);
          if (u !== -1) return emitOp(OP.SET_UP, u, n.linea);
          return emitOp(OP.SET_GLOBAL, chunk().cte(gl(d.nombre)), n.linea);
        }
        if (d.tipo === 'Indice') { expr(d.obj); expr(d.indice); expr(n.valor); return emit(OP.IDX_SET, n.linea); }
        if (d.tipo === 'Propiedad') {
          expr(d.obj);
          emitCte(d.nombre, n.linea);
          expr(n.valor);
          return emit(OP.IDX_SET, n.linea);
        }
        throw new ErrorFuente('compilación', 'destino de asignación no válido', n.linea, n.col);
      }
      case 'Unario':
        expr(n.expr);
        return emit(n.op === '-' ? OP.NEG : OP.NOT, n.linea);
      case 'Binario': {
        if (n.op === 'y') {
          expr(n.izq);
          const s = emitSalto(OP.JMP_FALSE, n.linea);
          emit(OP.POP, n.linea); expr(n.der); parchear(s); return;
        }
        if (n.op === 'o') {
          expr(n.izq);
          const s = emitSalto(OP.JMP_TRUE, n.linea);
          emit(OP.POP, n.linea); expr(n.der); parchear(s); return;
        }
        expr(n.izq); expr(n.der);
        const m = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '//': OP.IDIV, '%': OP.MOD, '**': OP.POW,
                    '==': OP.EQ, '!=': OP.NEQ, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE };
        return emit(m[n.op], n.linea);
      }
      case 'Llamada': {
        expr(n.callee);
        for (const a of n.args) expr(a);
        return emitOp(OP.CALL, n.args.length, n.linea);
      }
      case 'Indice': expr(n.obj); expr(n.indice); return emit(OP.IDX_GET, n.linea);
      case 'Propiedad': {
        // «m.algo» con m alias de módulo es un global de allí, resuelto aquí.
        // Un local o un parámetro con ese nombre manda: «fn f(m) { m.x }» es un
        // acceso a propiedad normal aunque haya un módulo llamado «m».
        const g = (n.obj.tipo === 'Variable' && !visibleComoLocal(c, n.obj.nombre))
          ? miembroDeEnlace(enl, n.obj.nombre, n.nombre) : null;
        if (g) return emitOp(OP.GET_GLOBAL, chunk().cte(g), n.linea);
        expr(n.obj);
        return emitOp(OP.PROP_GET, chunk().cte(n.nombre), n.linea);
      }
      case 'ListaLit': for (const x of n.items) expr(x); return emitOp(OP.LISTA, n.items.length, n.linea);
      case 'DicLit':
        for (const par of n.pares) { expr(par.clave); expr(par.valor); }
        return emitOp(OP.DIC, n.pares.length, n.linea);
      case 'FuncionAnon': return funcion(n, '<anónima>');
      default: throw new ErrorFuente('compilación', `expresión no soportada: ${n.tipo}`, n.linea || 1, n.col || 1);
    }
  }

  // Elevación: las funciones de nivel superior se definen primero, así se
  // pueden llamar desde arriba aunque se declaren más abajo.
  //
  // Los «usar» van en segundo lugar, y de ahí sale la resolución de los ciclos:
  // cuando A importa B y B importa A, A ya tiene definidas todas sus funciones
  // antes de que empiece B, así que B las ve. Lo que B no ve son los valores que
  // A calcula después, y eso se dice con un mensaje que nombra el ciclo.
  for (const s of ast.cuerpo) if (s.tipo === 'DeclFuncion') sent(s);
  for (const s of ast.cuerpo) if (s.tipo === 'Usar') sent(s);
  for (const s of ast.cuerpo) if (s.tipo !== 'DeclFuncion' && s.tipo !== 'Usar') sent(s);
  // El retorno implícito del final se atribuye a la última línea real, no a un
  // 9999 de relleno: se ve mejor en el desensamblador y la tabla de líneas no
  // pega un salto absurdo al serializarse.
  const ultima = chunk().lineas.length ? chunk().lineas[chunk().lineas.length - 1] : 1;
  emit(OP.NULO, ultima); emit(OP.RET, ultima);
  return c.fn;
}

// ------------------------------------------------------------- Desensamblador
function desensamblar(fn) {
  const out = [];
  const ch = fn.chunk;
  let i = 0;
  while (i < ch.code.length) {
    const inicio = i;
    const op = ch.code[i++];
    const nom = OP_NOMBRE[op] || `??${op}`;
    let args = '', extra = '';
    const nArgs = OPERANDOS[op] || 0;
    const vals = [];
    for (let k = 0; k < nArgs; k++) vals.push(ch.code[i++]);
    if (vals.length) args = vals.join(' ');
    if (op === OP.CONST || op === OP.GET_GLOBAL || op === OP.SET_GLOBAL || op === OP.DEF_GLOBAL || op === OP.PROP_GET) {
      const v = ch.consts[vals[0]];
      extra = `  ; ${typeof v === 'string' ? JSON.stringify(v) : String(v)}`;
    }
    if (op === OP.CLOSURE) {
      const sub = ch.consts[vals[0]];
      extra = `  ; ${sub.nombre}/${sub.aridad}`;
      for (let k = 0; k < sub.nUpvalues; k++) { const l = ch.code[i++], idx = ch.code[i++]; extra += ` [${l ? 'local' : 'up'} ${idx}]`; }
    }
    if (op === OP.JMP || op === OP.JMP_FALSE || op === OP.JMP_TRUE) extra = `  → ${i + vals[0]}`;
    if (op === OP.LOOP) extra = `  → ${i - vals[0]}`;
    out.push({ pos: inicio, linea: ch.lineas[inicio], texto: `${String(inicio).padStart(4, '0')}  ${nom.padEnd(11)} ${args}${extra}` });
  }
  return out;
}


// ============================================================================
//  ESPAÑOL-LIKE v4 — Máquina virtual, recolector de basura y JIT
//  Parte 3 de 4.
// ============================================================================

class ErrorTiempoEjecucion extends Error {
  constructor(mensaje, pista) { super(mensaje); this.pista = pista || null; this.traza = []; this.esRuntime = true; }
  formato() {
    let s = `[ejecución] ${this.message}`;
    if (this.pista) s += `\n   ↳ ${this.pista}`;
    for (const t of this.traza) s += `\n   en ${t.nombre} (línea ${t.linea})`;
    return s;
  }
}

// -------------------------------------------------------- Objetos del montón
let SIG_ID = 1;
class ObjLista { constructor(items) { this.clase = 'lista'; this.items = items || []; this.id = SIG_ID++; this.marca = false; } }
class ObjDic { constructor() { this.clase = 'dic'; this.mapa = new Map(); this.id = SIG_ID++; this.marca = false; } }
class ObjCierre {
  constructor(fn) { this.clase = 'cierre'; this.fn = fn; this.upvalues = []; this.id = SIG_ID++; this.marca = false; }
}
// Un trozo del árbol de la página. La forma dice cómo se pinta:
//   elemento → una etiqueta con sus atributos y sus hijos
//   texto    → contenido que se pinta como texto, nunca como marcado
//   crudo    → HTML que se inserta tal cual, la puerta explícita
//   boton / entrada → un control con la función del usuario colgada
class ObjNodo {
  constructor(forma) {
    this.clase = 'nodo'; this.forma = forma;
    this.etiqueta = null; this.atrib = null; this.hijos = null;
    this.valor = null; this.accion = null; this.estilo = null;
    // Identidad y eventos. «clave» es lo que deja reconocer al mismo control
    // entre dos pintados, así que el foco y lo tecleado sobreviven al repintado
    // aunque el árbol cambie de forma. «eventos» es un Map de nombre→función.
    this.clave = null; this.eventos = null; this.vars = null;
    this.marcada = false; this.declara = false; this.opciones = null;
    this.id = SIG_ID++; this.marca = false;
  }
}
// Un trozo de estilo. Es un valor como cualquier otro: se compone, se guarda en
// variables y se comparte entre componentes. Lleva sus propiedades, sus reglas
// anidadas —que es lo que hace SCSS con «&»— y sus consultas de medios, y de
// ahí sale una clase con nombre derivado del contenido, como en CSS Modules.
// Una fecha SIN zona horaria: un instante del calendario, como el TIMESTAMP
// WITHOUT TIME ZONE de SQL. Por dentro son milisegundos que se leen y se
// escriben SIEMPRE con los getters UTC, así que lo que entra es lo que sale y
// no hay horario de verano, ni desplazamiento, ni sorpresas al cambiar de
// máquina. Solo «hoy()» y «ahora()» miran el reloj local, una vez, al nacer.
//
// valueOf() es lo que hace que «<», «<=», «>» y «>=» funcionen tal cual en el
// intérprete Y en el JIT, que comparten «cmp»: los dos acaban haciendo «a < b»
// sobre el objeto, y JavaScript pide el número. Sin esto habría que tocar los
// cuatro opcodes y los cuatro ayudantes del JIT, y podrían separarse.
class ObjFecha {
  constructor(ms) { this.clase = 'fecha'; this.ms = ms; this.id = SIG_ID++; this.marca = false; }
  valueOf() { return this.ms; }
}

// Una TABLA: columnas con nombre y tipo, y los datos guardados POR COLUMNA.
//
// Por columnas y no por filas, por tres razones que se notan:
//   1. El tipo se declara una vez por columna, no se adivina celda a celda.
//      Es lo que hace que una columna de fechas siga siendo de fechas después
//      de guardarla y volverla a leer, que el CSV no puede.
//   2. Sacar, renombrar o convertir una columna es tocar un array, no recorrer
//      cien mil filas.
//   3. El formato .ñdatos se guarda igual, así que leer y escribir no traduce.
//
// El verificador conoce «tabla» como tipo, así que «fn informe(): tabla» se
// comprueba, y pasar una lista donde se espera una tabla se para antes de
// ejecutar. Lo que NO tiene es orden: dos tablas no se comparan con «<», y eso
// se dice en «cmp».
class ObjTabla {
  constructor(cols, datos) {
    this.clase = 'tabla';
    this.cols = cols || [];      // [{ nombre, tipo }]  — tipo es un texto: 'entero', 'fecha'…
    this.datos = datos || [];    // datos[c][f] — una columna, luego la fila
    this.id = SIG_ID++;
    this.marca = false;
  }
  get filas() { return this.datos.length ? this.datos[0].length : 0; }
  indiceCol(nombre) { for (let i = 0; i < this.cols.length; i++) if (this.cols[i].nombre === nombre) return i; return -1; }
}

// ── arreglo: forma, tipo y memoria contigua ─────────────────────────────────
//
// Una lista de listas NO es un arreglo, y esa es la diferencia que separa este
// eDSL de NumPy. Aquí los números viven en un Float64Array o un Int32Array —sin
// caja, uno detrás de otro— y la forma vive aparte, en «forma». Con eso salen
// cuatro cosas que con listas anidadas no se pueden tener:
//
//   · DIFUSIÓN. «a * 2» y «a + b» funcionan sobre el arreglo entero, sin bucle,
//     porque los operadores de la VM saben lo que es un arreglo.
//   · VISTAS. Rebanar no copia: la vista comparte la memoria del original y solo
//     cambia el desplazamiento y las zancadas. Transponer es cambiar dos
//     zancadas de sitio; cuesta lo mismo con 4 elementos que con 4 millones.
//   · UN TIPO. Toda la memoria es del mismo tipo, así que no hay que mirar cada
//     elemento para saber qué es.
//   · MEMORIA. Un millón de reales son 8 MB exactos, no un millón de objetos.
//
// Las zancadas son cuántos elementos hay que saltar para avanzar uno en cada
// eje. Es lo que deja que una vista, una transpuesta y una rebanada sean el
// mismo mecanismo en vez de tres.
const TIPOS_ARR = {
  real:   { ctor: Float64Array, ent: false },
  entero: { ctor: Int32Array,   ent: true },
  // Un byte por valor, no un bit: empaquetar bits ahorraría ocho veces la
  // memoria y costaría un desplazamiento en cada acceso, y lo que se hace con
  // una máscara es recorrerla. Vale más la velocidad.
  bool:   { ctor: Uint8Array,   ent: true, log: true },
  // Dos reales seguidos por número: la parte real en 2p y la imaginaria en
  // 2p+1. La alternativa —dos arreglos, uno de reales y otro de imaginarios—
  // obliga a quien use una transformada a llevarlos de la mano sin que nada lo
  // compruebe, que es justo la clase de error que un tipo existe para quitar.
  // Las ZANCADAS siguen contando números, no reales: así las vistas, la
  // difusión y «trozo» funcionan sin tocar nada, y solo quien de verdad lee o
  // escribe un número multiplica por la anchura.
  complejo: { ctor: Float64Array, ent: false, anchura: 2 },
};
const ANCHO = t => (TIPOS_ARR[t] && TIPOS_ARR[t].anchura) || 1;

function zancadasDe(forma) {
  const z = new Array(forma.length);
  let acc = 1;
  for (let i = forma.length - 1; i >= 0; i--) { z[i] = acc; acc *= forma[i]; }
  return z;
}
const tamanoDe = forma => forma.reduce((a, b) => a * b, 1);

class ObjArreglo {
  constructor(datos, forma, tipo, zancadas, desp, base) {
    this.clase = 'arreglo';
    this.datos = datos;                                  // Float64Array | Int32Array
    this.forma = forma;                                  // [2, 3]
    this.tipo = tipo || 'real';                          // 'real' | 'entero'
    this.zancadas = zancadas || zancadasDe(forma);
    this.desp = desp || 0;                               // dónde empieza en «datos»
    // Si es una vista, «base» es el arreglo dueño de la memoria. El recolector
    // lo necesita: mientras viva la vista, la memoria no se puede soltar.
    this.base = base || null;
    this.id = SIG_ID++;
    this.marca = false;
  }
  get tamano() { return tamanoDe(this.forma); }
  get dimensiones() { return this.forma.length; }
  // ¿La memoria está en orden, sin huecos? Entonces se puede recorrer de un
  // tirón, que es el camino rápido de todo lo demás.
  get seguida() {
    if (this.desp !== 0) return false;
    const z = zancadasDe(this.forma);
    for (let i = 0; i < z.length; i++) if (z[i] !== this.zancadas[i]) return false;
    return true;
  }
  // El índice dentro de «datos» de la posición [i, j, …].
  pos(ix) {
    let p = this.desp;
    for (let d = 0; d < ix.length; d++) p += ix[d] * this.zancadas[d];
    return p;
  }
  // Recorrer en orden lógico, respetando las zancadas. Es el camino lento, el
  // que vale para cualquier vista.
  *posiciones() {
    const n = this.forma.length;
    if (n === 0) { yield this.desp; return; }
    const ix = new Array(n).fill(0);
    const total = this.tamano;
    for (let k = 0; k < total; k++) {
      yield this.pos(ix);
      for (let d = n - 1; d >= 0; d--) { if (++ix[d] < this.forma[d]) break; ix[d] = 0; }
    }
  }
}

class ObjEstilo {
  constructor() {
    this.clase = 'estilo';
    this.props = new Map();   // nombre CSS → valor ya formateado
    this.reglas = [];         // { selector, estilo }  — anidadas
    this.medios = [];         // { consulta, estilo }
    this.css = null;          // { nombre, texto } una vez calculado
    this.id = SIG_ID++; this.marca = false;
  }
}

// Lo que recibe «capturar» cuando el fallo viene del propio motor. Los valores
// que lanza el programa con «lanzar» viajan tal cual, sean del tipo que sean;
// esto es solo el envoltorio de los errores de ejecución, para que se puedan
// mirar desde el lenguaje en vez de ser opacos.
class ObjError {
  constructor(tipo, mensaje, linea) {
    this.clase = 'error';
    this.tipoError = tipo || 'motor';
    this.mensaje = mensaje || '';
    this.lineaError = linea || 0;
    this.id = SIG_ID++; this.marca = false;
  }
  campo(nombre) {
    if (nombre === 'tipo') return this.tipoError;
    if (nombre === 'mensaje') return this.mensaje;
    if (nombre === 'linea') return this.lineaError;
    return undefined;
  }
}
class ObjUpvalue { constructor(slot) { this.clase = 'upvalue'; this.slot = slot; this.cerrado = false; this.valor = null; this.id = SIG_ID++; this.marca = false; } }
class ObjNativa {
  constructor(nombre, aridad, fn, doc) { this.clase = 'nativa'; this.nombre = nombre; this.aridad = aridad; this.fn = fn; this.doc = doc || ''; this.marca = true; }
}

const esObj = v => v !== null && typeof v === 'object';

// ------------------------------------------------------------ Representación
// La forma canónica de una fecha: día a secas si es medianoche, día y hora si
// no. Es lo que imprime «imprimir», lo que devuelve «texto(f)» y lo que se
// escribe en un CSV, así que tiene que poder volver a leerse.
// ── difusión: la regla que hace que «a + b» funcione sin bucles ─────────────
//
// Dos formas son compatibles si, mirándolas de derecha a izquierda, cada par de
// ejes es igual o uno de los dos es 1. El eje de tamaño 1 se estira. Es la regla
// de NumPy, y es la que deja escribir «matriz + fila» sin repetir la fila a
// mano:
//
//     (3, 4) con (4,)     →  (3, 4)      la fila se estira a las 3 filas
//     (3, 1) con (1, 4)   →  (3, 4)      una columna por una fila
//     (3, 4) con (3,)     →  error       4 contra 3 y ninguno es 1
//
// El estirado no copia nada: se pone la zancada de ese eje a 0, y entonces
// avanzar por él no mueve el puntero. Por eso sumar una fila a un millón de
// filas no gasta memoria.
// Los bucles de verdad, uno por operación. Están separados a propósito: con un
// «switch» dentro del bucle, V8 no puede especializar la operación y se queda a
// la mitad de velocidad. Son seis líneas repetidas seis veces, y se midió que
// vale la pena.
function aplicarOp(d, x, y, n, op, vm) {
  switch (op) {
    case '+': for (let i = 0; i < n; i++) d[i] = x[i] + y[i]; return;
    case '-': for (let i = 0; i < n; i++) d[i] = x[i] - y[i]; return;
    case '*': for (let i = 0; i < n; i++) d[i] = x[i] * y[i]; return;
    case '/': for (let i = 0; i < n; i++) { if (y[i] === 0) vm.error('división entre cero'); d[i] = x[i] / y[i]; } return;
    case '//': for (let i = 0; i < n; i++) { if (y[i] === 0) vm.error('división entre cero'); d[i] = Math.floor(x[i] / y[i]); } return;
    case '%': for (let i = 0; i < n; i++) { if (y[i] === 0) vm.error('módulo entre cero'); d[i] = ((x[i] % y[i]) + y[i]) % y[i]; } return;
    case '**': for (let i = 0; i < n; i++) d[i] = Math.pow(x[i], y[i]); return;
    default: vm.error(`«${op}» no se puede aplicar a un arreglo`);
  }
}
// Arreglo contra número. «alRevés» es para «2 / a», donde el número va delante.
function aplicarOpEsc(d, x, k, n, op, alReves, vm) {
  if (alReves) {
    switch (op) {
      case '+': for (let i = 0; i < n; i++) d[i] = k + x[i]; return;
      case '-': for (let i = 0; i < n; i++) d[i] = k - x[i]; return;
      case '*': for (let i = 0; i < n; i++) d[i] = k * x[i]; return;
      case '/': for (let i = 0; i < n; i++) { if (x[i] === 0) vm.error('división entre cero'); d[i] = k / x[i]; } return;
      default: for (let i = 0; i < n; i++) d[i] = unaOp(k, x[i], op, vm); return;
    }
  }
  switch (op) {
    case '+': for (let i = 0; i < n; i++) d[i] = x[i] + k; return;
    case '-': for (let i = 0; i < n; i++) d[i] = x[i] - k; return;
    case '*': for (let i = 0; i < n; i++) d[i] = x[i] * k; return;
    case '/': if (k === 0) vm.error('división entre cero');
              for (let i = 0; i < n; i++) d[i] = x[i] / k; return;
    case '**': for (let i = 0; i < n; i++) d[i] = Math.pow(x[i], k); return;
    default: for (let i = 0; i < n; i++) d[i] = unaOp(x[i], k, op, vm); return;
  }
}
// Aritmética compleja. Suma y resta son por partes; el producto y el cociente
// no, y por eso esto no se puede hacer «aplicando la operación a los dos
// arreglos»: (a+bi)(c+di) mezcla las cuatro. La división usa el método de
// Smith —dividir por el mayor de los dos denominadores— porque la fórmula de
// libro desborda con números grandes: (1e200+1e200i)/(1e200+1e200i) daría NaN.
function opC(op, ar, ai, br, bi, vm) {
  switch (op) {
    case '+': return [ar + br, ai + bi];
    case '-': return [ar - br, ai - bi];
    case '*': return [ar * br - ai * bi, ar * bi + ai * br];
    case '/': {
      if (br === 0 && bi === 0) vm.error('división entre cero');
      if (Math.abs(br) >= Math.abs(bi)) {
        const r = bi / br, den = br + bi * r;
        return [(ar + ai * r) / den, (ai - ar * r) / den];
      }
      const r = br / bi, den = br * r + bi;
      return [(ar * r + ai) / den, (ai * r - ar) / den];
    }
    default:
      return vm.error(`«${op}» no está definida para números complejos`,
        'los complejos no se ordenan ni se dividen a lo entero: suma, resta, multiplica y divide, y para lo demás pasa a reales con absoluto o parteReal');
  }
}
function unaOp(a, b, op, vm) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': if (b === 0) vm.error('división entre cero'); return a / b;
    case '//': if (b === 0) vm.error('división entre cero'); return Math.floor(a / b);
    case '%': if (b === 0) vm.error('módulo entre cero'); return ((a % b) + b) % b;
    case '**': return Math.pow(a, b);
    default: vm.error(`«${op}» no se puede aplicar a un arreglo`);
  }
}

const CMP_ARR = {
  '>':  (a, b) => a > b,
  '<':  (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

function difundir(fa, fb) {
  const n = Math.max(fa.length, fb.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = fa[fa.length - n + i], y = fb[fb.length - n + i];
    const a = x === undefined ? 1 : x, b = y === undefined ? 1 : y;
    if (a !== b && a !== 1 && b !== 1) return null;
    out[i] = Math.max(a, b);
  }
  return out;
}
// Las zancadas de «v» vistas con la forma destino: los ejes que se estiran
// quedan en 0, y los que «v» no tiene se añaden delante, también en 0.
function zancadasDifundidas(v, forma) {
  const n = forma.length, d = n - v.forma.length;
  const z = new Array(n).fill(0);
  for (let i = 0; i < v.forma.length; i++) z[d + i] = v.forma[i] === 1 ? 0 : v.zancadas[i];
  return z;
}

// Un arreglo se imprime como lo que es: su forma y su tipo arriba, y los
// números dentro. Si es grande se recortan los extremos, como hace NumPy:
// imprimir un millón de números no informa de nada y llena la consola.
function reprArreglo(v, prof) {
  const cab = `arreglo ${v.forma.join('×')} de ${v.tipo}`;
  if (v.tamano === 0) return `<${cab}, vacío>`;
  if ((prof || 0) > 3) return `<${cab}>`;
  const num = p => {
    if (v.tipo === 'complejo') {
      const re = v.datos[2 * p], im = v.datos[2 * p + 1];
      // «3-2i» y no «3+-2i»; y «0i» se escribe igual, porque un complejo con
      // parte imaginaria 0 sigue siendo un complejo y esconderlo haría creer
      // que el arreglo es de reales. El cero negativo se escribe «+0i»: es el
      // mismo número que el cero, y «conjugado» lo produce a montones.
      return repr(re, 1) + (im < 0 ? '-' : '+') + repr(Math.abs(im), 1) + 'i';
    }
    const x = v.datos[p];
    if (v.tipo === 'bool') return x ? 'cierto' : 'falso';
    return v.tipo === 'entero' ? String(x) : repr(x, 1);
  };
  const BORDE = 3, MAX = 1000;
  // Recursivo por ejes, que es lo que hace que una matriz se lea como una
  // matriz y no como una tira de números.
  const eje = (d, base) => {
    const n = v.forma[d];
    const z = v.zancadas[d];
    const trozo = i => (d === v.forma.length - 1 ? num(base + i * z) : eje(d + 1, base + i * z));
    if (n <= BORDE * 2 + 1) {
      const xs = []; for (let i = 0; i < n; i++) xs.push(trozo(i));
      return '[' + xs.join(d === v.forma.length - 1 ? ', ' : ',\n ') + ']';
    }
    const ini = [], fin = [];
    for (let i = 0; i < BORDE; i++) ini.push(trozo(i));
    for (let i = n - BORDE; i < n; i++) fin.push(trozo(i));
    const sep = d === v.forma.length - 1 ? ', ' : ',\n ';
    return '[' + ini.join(sep) + sep + '…' + sep + fin.join(sep) + ']';
  };
  const cuerpo = v.tamano > MAX && v.forma.length === 1
    ? eje(0, v.desp) : eje(0, v.desp);
  return `${cab}\n${cuerpo}`;
}

function isoDeFecha(f) {
  const d = new Date(f.ms);
  const dd = (n, a) => String(n).padStart(a || 2, '0');
  const dia = `${dd(d.getUTCFullYear(), 4)}-${dd(d.getUTCMonth() + 1)}-${dd(d.getUTCDate())}`;
  const h = d.getUTCHours(), m = d.getUTCMinutes(), sg = d.getUTCSeconds(), ms = d.getUTCMilliseconds();
  if (!h && !m && !sg && !ms) return dia;
  return `${dia} ${dd(h)}:${dd(m)}:${dd(sg)}` + (ms ? '.' + dd(ms, 3) : '');
}

function repr(v, prof) {
  prof = prof || 0;
  if (v === null || v === undefined) return 'nulo';
  if (v === true) return 'cierto';
  if (v === false) return 'falso';
  if (typeof v === 'number') {
    // Un lenguaje en español no imprime «Infinity». Es un detalle, y es de los
    // que hacen que parezca acabado o no: «|INFINITO» se escribe en español y
    // tenía que leerse en español.
    if (v === Infinity) return 'infinito';
    if (v === -Infinity) return '-infinito';
    if (Number.isNaN(v)) return 'no es un número';
    return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(15)));
  }
  if (typeof v === 'string') return prof === 0 ? v : JSON.stringify(v);
  if (v instanceof ObjLista) {
    if (prof > 4) return '[…]';
    return '[' + v.items.map(x => repr(x, prof + 1)).join(', ') + ']';
  }
  if (v instanceof ObjDic) {
    if (prof > 4) return '{…}';
    const p = [];
    // Una clave de texto sale sin comillas, que se lee mejor. Pero si PARECE un
    // número hay que ponerlas: {"3": "x"} y {3: "x"} son diccionarios distintos
    // —obtener(d, 3, …) no encuentra nada en el primero— y sin comillas se
    // imprimían igual. Es el mismo fallo que «se esperaba 0.12 y llegó 0.12».
    const claveTxt = k => (typeof k !== 'string' ? repr(k, prof + 1)
      : (/^-?\d+(\.\d+)?$/.test(k) || k === '' ? JSON.stringify(k) : k));
    for (const [k, val] of v.mapa) p.push(`${claveTxt(k)}: ${repr(val, prof + 1)}`);
    return '{' + p.join(', ') + '}';
  }
  if (v instanceof ObjFecha) return isoDeFecha(v);
  if (v instanceof ObjTabla)
    return `<tabla ${v.filas}×${v.cols.length}: ${v.cols.map(c => c.nombre).join(', ')}>`;
  if (v instanceof ObjArreglo) return reprArreglo(v, prof);
  if (v instanceof ObjNodo) {
    if (v.forma === 'texto') return `<nodo texto ${JSON.stringify(String(v.valor).slice(0, 24))}>`;
    if (v.forma === 'elemento') return `<nodo ${v.etiqueta}${v.hijos.length ? ' · ' + v.hijos.length + ' hijo' + (v.hijos.length > 1 ? 's' : '') : ''}>`;
    return `<nodo ${v.forma}>`;
  }
  if (v instanceof ObjEstilo) {
    const n = v.props.size, r = v.reglas.length + v.medios.length;
    return `<estilo ${n} propiedad${n === 1 ? '' : 'es'}${r ? ' · ' + r + ' anidada' + (r === 1 ? '' : 's') : ''}>`;
  }
  if (v instanceof ObjError) return `<error ${v.tipoError}: ${v.mensaje}>`;
  if (v instanceof ObjCierre) return `<funcion ${v.fn.nombre}/${v.fn.aridad}>`;
  if (v instanceof ObjNativa) return `<nativa ${v.nombre}>`;
  return String(v);
}
function tipoDe(v) {
  if (v === null || v === undefined) return 'nulo';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'entero' : 'real';
  if (typeof v === 'string') return 'texto';
  if (v instanceof ObjLista) return 'lista';
  if (v instanceof ObjDic) return 'dic';
  if (v instanceof ObjNodo) return 'nodo';
  if (v instanceof ObjError) return 'error';
  if (v instanceof ObjEstilo) return 'estilo';
  if (v instanceof ObjFecha) return 'fecha';
  if (v instanceof ObjTabla) return 'tabla';
  if (v instanceof ObjArreglo) return 'arreglo';
  return 'funcion';
}
const verdad = v => !(v === null || v === undefined || v === false || v === 0 || v === '' ||
                      (v instanceof ObjLista && v.items.length === 0));
// Compara en profundidad. El tercer parámetro lleva los pares que ya se están
// comparando más arriba en la recursión: sin él, dos listas que se contienen a
// sí mismas hacen que la recursión no termine nunca.
function iguales(a, b, enCurso) {
  if (a === b) return true;
  // Una fecha es un valor, no una identidad: dos objetos distintos que marcan
  // el mismo instante son iguales, como dos listas con los mismos elementos.
  if (a instanceof ObjFecha || b instanceof ObjFecha)
    return a instanceof ObjFecha && b instanceof ObjFecha && a.ms === b.ms;
  if (a instanceof ObjArreglo || b instanceof ObjArreglo) {
    if (!(a instanceof ObjArreglo) || !(b instanceof ObjArreglo)) return false;
    if (a.forma.length !== b.forma.length) return false;
    for (let i = 0; i < a.forma.length; i++) if (a.forma[i] !== b.forma[i]) return false;
    const pa = a.posiciones(), pb = b.posiciones();
    for (;;) {
      const x = pa.next(), y = pb.next();
      if (x.done) return y.done;
      if (y.done) return false;
      if (a.datos[x.value] !== b.datos[y.value]) return false;
    }
  }
  if (a instanceof ObjTabla || b instanceof ObjTabla) {
    if (!(a instanceof ObjTabla) || !(b instanceof ObjTabla)) return false;
    if (a.cols.length !== b.cols.length || a.filas !== b.filas) return false;
    for (let c = 0; c < a.cols.length; c++) {
      if (a.cols[c].nombre !== b.cols[c].nombre || a.cols[c].tipo !== b.cols[c].tipo) return false;
      for (let f = 0; f < a.filas; f++) if (!iguales(a.datos[c][f], b.datos[c][f], enCurso)) return false;
    }
    return true;
  }
  const dosListas = a instanceof ObjLista && b instanceof ObjLista;
  const dosDics = a instanceof ObjDic && b instanceof ObjDic;
  if (!dosListas && !dosDics) return false;

  const par = a.id + '\u0000' + b.id;
  if (enCurso === undefined) enCurso = new Set();
  else if (enCurso.has(par)) return true;  // ya lo estamos comparando: no volvemos a entrar
  enCurso.add(par);

  if (dosListas) {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) if (!iguales(a.items[i], b.items[i], enCurso)) return false;
    return true;
  }
  if (a.mapa.size !== b.mapa.size) return false;
  for (const [k, v] of a.mapa) { if (!b.mapa.has(k)) return false; if (!iguales(v, b.mapa.get(k), enCurso)) return false; }
  return true;
}

// ¿Permite este entorno compilar código en caliente? Una política de seguridad
// de contenidos (CSP) sin «unsafe-eval» hace que new Function lance EvalError.
// Se comprueba una sola vez, al primer motor que se cree.
let _jitPermitido = null, _jitMotivo = null;
function jitPermitido() {
  if (_jitPermitido === null) {
    try {
      // eslint-disable-next-line no-new-func
      _jitPermitido = (new Function('return 1'))() === 1;
      if (!_jitPermitido) _jitMotivo = 'new Function devolvió algo inesperado';
    } catch (e) {
      _jitPermitido = false;
      _jitMotivo = (e && e.name === 'EvalError')
        ? 'la política de seguridad de esta página no permite compilar código en caliente'
        : ((e && e.name) || 'Error') + ': ' + ((e && e.message) || '');
    }
  }
  return _jitPermitido;
}
function motivoJIT() { jitPermitido(); return _jitMotivo; }

// =============================================================== Máquina virtual
const MAX_FRAMES = 900;

class VM {
  constructor(opciones) {
    opciones = opciones || {};
    this.salida = opciones.salida || (s => { if (typeof console !== 'undefined') console.log(s); });
    this.limiteInstr = opciones.limiteInstr || 60e6;
    this.umbralJIT = opciones.umbralJIT === undefined ? 40 : opciones.umbralJIT;
    // Los nombres globales que el JIT resolvió y ató DENTRO del código que
    // generó, y las funciones que lo hicieron. Atar es lo que quita la búsqueda
    // en el mapa de cada llamada —que es lo caro, medido: 34 ms contra 2,7 por
    // dos millones de llamadas— pero deja una deuda: si alguien redefine ese
    // global después, el código atado seguiría llamando al de antes. Así que se
    // apunta, y al primer cambio de uno de esos nombres se tira todo lo
    // compilado. Se recompila solo en las siguientes llamadas.
    //
    // Se podría comprobar la identidad en cada llamada en vez de esto, y se
    // probó: cuesta la misma búsqueda en el mapa que se quería evitar (31 ms de
    // los 34), así que no arregla nada. Invalidar es raro; buscar es constante.
    this.atados = null;              // Set de nombres, o null si no hay ninguno
    this.compiladas = null;          // las funciones con código generado
    this.jitActivo = opciones.jit !== false;
    // Si el entorno lo prohíbe, se apaga aquí y se deja constancia: el motor
    // sigue funcionando en el intérprete, pero conviene poder decirlo.
    this.jitBloqueado = false;
    if (this.jitActivo && !jitPermitido()) { this.jitActivo = false; this.jitBloqueado = true; }
    this.motivoJIT = this.jitBloqueado ? motivoJIT() : null;
    this.reiniciar();
  }

  reiniciar() {
    this.stack = new Array(65536);
    this.sp = 0;
    this.frames = [];
    this.globals = new Map();
    this.upAbiertas = [];
    this.monton = [];             // tabla de objetos vivos (la gestiona el GC)
    this.umbralGC = 2048;
    this.instrucciones = 0;
    this.profJS = 0;
    this.stats = { gc: 0, liberados: 0, picoMonton: 0, jitCompiladas: 0, jitFallidas: 0, tiempoJIT: 0 };
    this.lineaActual = 0;
  }

  registrar(o) {
    this.monton.push(o);
    if (this.monton.length > this.stats.picoMonton) this.stats.picoMonton = this.monton.length;
    if (this.monton.length >= this.umbralGC) this.recolectar();
    return o;
  }
  nuevaLista(items) { return this.registrar(new ObjLista(items)); }
  nuevoDic() { return this.registrar(new ObjDic()); }
  nuevoNodo(forma) { return this.registrar(new ObjNodo(forma)); }
  nuevoError(tipo, mensaje, linea) { return this.registrar(new ObjError(tipo, mensaje, linea)); }
  nuevoEstilo() { return this.registrar(new ObjEstilo()); }
  nuevaFecha(ms) { return this.registrar(new ObjFecha(ms)); }
  nuevaTabla(cols, datos) { return this.registrar(new ObjTabla(cols, datos)); }
  nuevoArreglo(datos, forma, tipo, zancadas, desp, base) {
    const o = new ObjArreglo(datos, forma, tipo, zancadas, desp, base);
    // La memoria cuenta: un arreglo de un millón de reales son 8 MB, y el
    // recolector tiene que saberlo o un programa que crea arreglos en un bucle
    // se lo come todo sin que salte ninguna cuenta.
    this.cobrar(1 + (o.tamano >> 10));
    return this.registrar(o);
  }
  // Un arreglo nuevo, vacío, con la forma y el tipo pedidos.
  arrNuevo(forma, tipo) {
    const t = TIPOS_ARR[tipo] || TIPOS_ARR.real;
    const n = tamanoDe(forma);
    if (n > 50e6) this.error(`un arreglo de ${forma.join('×')} son ${n} números y el máximo son 50 millones`,
      'si de verdad necesitas más, hazlo por trozos');
    return this.nuevoArreglo(new t.ctor(n * (t.anchura || 1)), forma.slice(), tipo);
  }
  // Los validadores de argumentos de las nativas. Uno solo para la biblioteca y
  // para todos los eDSL: ya había cuatro copias de «exige texto» en cuatro
  // archivos, y cuando hay doce eDSL son doce mensajes de error que se separan.
  exigeNum(v, n, f) {
    if (typeof v !== 'number') this.error(`«${f}»: el argumento ${n} debe ser un número y es ${tipoDe(v)}`);
    return v;
  }
  exigeEnt(v, n, f) { return Math.trunc(this.exigeNum(v, n, f)); }
  exigeTexto(v, n, f) {
    if (typeof v !== 'string') this.error(`«${f}»: el argumento ${n} debe ser texto y es ${tipoDe(v)}`);
    return v;
  }
  exigeLista(v, n, f) {
    if (!(v instanceof ObjLista)) this.error(`«${f}»: el argumento ${n} debe ser una lista y es ${tipoDe(v)}`);
    return v;
  }
  exigeNums(v, n, f) {
    // Un arreglo también vale, y con esto DIECIOCHO funciones de estadística
    // —media, mediana, desviacion, percentil, correlacion…— empiezan a
    // aceptarlo sin tocar ni una de ellas. Las que además necesitan un eje se
    // tratan aparte; estas reducen todo y devuelven un número, que es lo que ya
    // hacían.
    if (v instanceof ObjArreglo) return this.arrValores(v);
    const l = this.exigeLista(v, n, f);
    for (const x of l.items) if (typeof x !== 'number') this.error(`«${f}»: la lista debe contener solo números`);
    return l.items;
  }
  exigeFuncion(v, n, f) {
    if (!(v instanceof ObjCierre) && !(v instanceof ObjNativa))
      this.error(`«${f}»: el argumento ${n} debe ser una función y es ${tipoDe(v)}`);
    return v;
  }
  exigeFecha(v, n, f) {
    if (!(v instanceof ObjFecha)) this.error(`«${f}»: el argumento ${n} debe ser una fecha y es ${tipoDe(v)}`);
    return v;
  }

  // Lo usan «contiene» de la biblioteca y «debeContener» del eDSL «probar». Con
  // dos copias podrían separarse y una prueba pasaría sobre una regla distinta
  // de la que aplica el programa.
  contiene(o, x, quien) {
    if (typeof o === 'string') {
      if (typeof x !== 'string') this.error(`«${quien || 'contiene'}»: dentro de un texto se busca texto y llegó ${tipoDe(x)}`);
      return o.includes(x);
    }
    if (o instanceof ObjLista) return o.items.some(y => iguales(y, x));
    if (o instanceof ObjDic) return o.mapa.has(x);
    this.error(`«${quien || 'contiene'}»: no se puede buscar dentro de ${tipoDe(o)}`);
  }

  // La firma llega como texto y es la única fuente: de ella sale la aridad que
  // comprueba la VM y el tipo que ve el verificador. Antes eran dos
  // declaraciones a 1.400 líneas de distancia y podían no coincidir.
  definirNativa(nombre, firmaTxt, fn, doc) {
    let t;
    try { t = firma(firmaTxt); }
    catch (e) { throw new Error(`«${nombre}»: ${e.message}`); }
    const n = new ObjNativa(nombre, aridadDe(t), fn, doc);
    n.firma = t;
    n.firmaTxt = String(firmaTxt).trim();
    n.seccion = this.seccionActual || null;
    this.globals.set(nombre, n);
  }
  definirValor(nombre, v, tipoTxt) {
    this.globals.set(nombre, v);
    if (!this.tiposValor) this.tiposValor = new Map();
    this.tiposValor.set(nombre, textoATipo(tipoTxt || 'cualquiera'));
    if (!this.seccionValor) this.seccionValor = new Map();
    this.seccionValor.set(nombre, this.seccionActual || null);
  }
  // nombre → los eDSL que lo exportan. Lo usa el verificador para que «no está
  // definida» pueda decir qué «usar» falta. Se calcula del registro, así que un
  // eDSL nuevo entra aquí solo.
  indiceEdsl() {
    const ix = new Map();
    if (!this.edsls) return ix;
    for (const [nombre, r] of this.edsls) {
      // «clasico» no se sugiere nunca: es el interruptor del modo viejo, y
      // proponerlo para un nombre suelto sería enseñar a no usar los eDSL.
      if (r.globalDe) continue;
      for (const n of r.exporta.keys()) {
        if (!ix.has(n)) ix.set(n, []);
        ix.get(n).push(nombre);
      }
    }
    return ix;
  }

  // Lo que el verificador necesita saber de la biblioteca, sacado del registro
  // de verdad: si una nativa existe, su firma existe; si no existe, tampoco.
  // Ya no hay tabla paralela que mantener a mano.
  tiposGlobales() {
    const out = {};
    for (const [n, v] of this.globals) {
      if (n.charAt(0) === ' ') continue;          // internas, como « usar»
      // Lo que lleva la clave de un módulo delante —un eDSL nativo, o un
      // archivo ya cargado— no es un global del programa: el verificador lo
      // recibe por el enlace de cada archivo, con el tipo que corresponda a
      // quien lo importó. Colarlo aquí metía en el ámbito raíz nombres que el
      // léxico no puede escribir, y con 15 eDSL serían setecientos.
      if (n.indexOf(SEP_MODULO) >= 0) continue;
      if (v instanceof ObjNativa) out[n] = v.firma;
    }
    if (this.tiposValor) for (const [n, t] of this.tiposValor) out[n] = t;
    return out;
  }

  // ------------------------------------------------- recolector mark & sweep
  recolectar() {
    const gris = [];
    const marcar = v => {
      if (!esObj(v) || v.marca) return;
      v.marca = true; gris.push(v);
    };
    for (let i = 0; i < this.sp; i++) marcar(this.stack[i]);
    for (const v of this.globals.values()) marcar(v);
    for (const f of this.frames) marcar(f.cierre);
    for (const u of this.upAbiertas) marcar(u);
    while (gris.length) {
      const o = gris.pop();
      if (o instanceof ObjLista) for (const x of o.items) marcar(x);
      else if (o instanceof ObjDic) { for (const [k, v] of o.mapa) { marcar(k); marcar(v); } }
      else if (o instanceof ObjNodo) {
        if (o.hijos) for (const h of o.hijos) marcar(h);
        marcar(o.accion); marcar(o.estilo);
        if (o.eventos) for (const f of o.eventos.values()) marcar(f);
      }
      else if (o instanceof ObjArreglo) {
        // La memoria la tiene el dueño. Mientras viva una vista hay que marcar
        // su base, o se soltaría la memoria que la vista está mirando.
        if (o.base) marcar(o.base);
      }
      else if (o instanceof ObjTabla) {
        // Una tabla contiene valores —textos, números, fechas—, así que hay que
        // recorrerla. «fecha» no hizo falta porque es una hoja; esto sí.
        for (const col of o.datos) for (const v of col) marcar(v);
      }
      else if (o instanceof ObjEstilo) {
        for (const r of o.reglas) marcar(r.estilo);
        for (const m of o.medios) marcar(m.estilo);
      }
      else if (o instanceof ObjCierre) for (const u of o.upvalues) marcar(u);
      else if (o instanceof ObjUpvalue) { if (o.cerrado) marcar(o.valor); else marcar(this.stack[o.slot]); }
    }
    let vivos = 0;
    const nuevo = [];
    for (const o of this.monton) {
      if (o.marca) { o.marca = false; nuevo.push(o); vivos++; }
      else { this.stats.liberados++; }
    }
    this.monton = nuevo;
    this.stats.gc++;
    this.umbralGC = Math.max(2048, vivos * 2);
  }

  // --------------------------------------------------------------- utilidades
  // Cobra por adelantado el trabajo de una función nativa. Sin esto, una llamada
  // a multMatriz cuenta como UNA instrucción haga lo que haga por dentro, y el
  // límite de instrucciones no protege de nada.
  cobrar(n) {
    this.instrucciones += n;
    if (this.instrucciones > this.limiteInstr)
      this.error(`se superó el límite de ${this.limiteInstr.toLocaleString('es')} instrucciones`,
        'una operación sobre datos muy grandes agotó el presupuesto antes de empezar', 'limite');
  }

  // Cada turno de interacción —un clic, un cambio, un temporizador— empieza con
  // el presupuesto entero. Sin esto una aplicación que se usa durante un rato
  // acaba muriendo por el límite de instrucciones sin haber hecho nada raro; el
  // límite sigue protegiendo dentro del turno, que es donde hace falta.
  nuevoTurno() { this.instrucciones = 0; this.profJS = 0; }

  empujar(v) { this.stack[this.sp++] = v; }
  sacar() { return this.stack[--this.sp]; }
  mirar(d) { return this.stack[this.sp - 1 - (d || 0)]; }

  // «fatal» marca lo que el bucle de despacho no debe volver a intentar
  // capturar. Resultó que eso son DOS cosas distintas, y confundirlas se notó
  // al escribir el corredor de pruebas:
  //
  //   fatal === 'limite'  el presupuesto de instrucciones. Nadie lo captura,
  //                       ni «intentar» ni un corredor de pruebas: si se
  //                       pudiera, un bucle infinito dentro de un «intentar»
  //                       desactivaría la única red que hay.
  //   fatal === true      un «lanzar» que nadie recogió. Ya se desenrolló la
  //                       pila, así que dentro de la VM no hay a quién dárselo
  //                       — pero un corredor de pruebas SÍ tiene que poder
  //                       apuntarlo como una prueba que falla.
  //
  // «tipo» es el que verá el programa en el valor error que capture. Casi todo
  // es «motor»; lo que viene del mundo de fuera —un archivo que no está, un
  // proceso que falla— se marca aparte para poder distinguirlo al capturarlo.
  error(msg, pista, fatal, tipo) {
    const e = new ErrorTiempoEjecucion(msg, pista);
    if (fatal) e.fatal = true;
    if (fatal === 'limite') e.limite = true;
    if (tipo) e.tipo = tipo;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      e.traza.push({ nombre: f.cierre.fn.nombre, linea: f.cierre.fn.chunk.lineas[Math.max(0, f.ip - 1)] });
    }
    e.linea = this.lineaActual;
    throw e;
  }

  // --------------------------------------------------------------- ejecución
  ejecutarPrograma(fnPrincipal) {
    this.sp = 0; this.frames = []; this.profJS = 0;
    const cierre = this.registrar(new ObjCierre(fnPrincipal));
    this.empujar(cierre);
    this.frames.push({ cierre, ip: 0, base: 0, manejadores: [] });
    return this.correr();
  }

  llamarValor(callee, nArgs) {
    if (callee instanceof ObjCierre) {
      const fn = callee.fn;
      if (fn.aridad !== nArgs)
        this.error(`«${fn.nombre}» espera ${fn.aridad} argumento(s) y recibió ${nArgs}`);
      fn.llamadas++;
      if (this.jitActivo && fn.jit) {
        const args = new Array(nArgs);
        for (let i = 0; i < nArgs; i++) args[i] = this.stack[this.sp - nArgs + i];
        this.sp -= nArgs + 1;
        if (++this.profJS > MAX_FRAMES) { this.profJS--; this.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
        const r = fn.jit.apply(callee.upvalues, args);
        this.profJS--;
        this.empujar(r);
        return;
      }
      // Escalonado: una función con bucles puede ser costosa en su primera
      // llamada, así que se compila ya; el resto espera al umbral de llamadas.
      if (this.jitActivo && fn.jitEstado === 'frío' &&
          (fn.llamadas > this.umbralJIT || (fn.llamadas === 1 && tieneBucle(fn.ast)))) {
        this.intentarJIT(fn);
        if (fn.jit) {
          const args = new Array(nArgs);
          for (let i = 0; i < nArgs; i++) args[i] = this.stack[this.sp - nArgs + i];
          this.sp -= nArgs + 1;
          if (++this.profJS > MAX_FRAMES) { this.profJS--; this.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
          const r = fn.jit.apply(callee.upvalues, args);
          this.profJS--;
          this.empujar(r);
          return;
        }
      }
      if (this.frames.length >= MAX_FRAMES)
        this.error('desbordamiento de pila: demasiadas llamadas anidadas',
          'suele indicar una recursión sin caso base');
      this.frames.push({ cierre: callee, ip: 0, base: this.sp - nArgs - 1, manejadores: [] });
      return;
    }
    if (callee instanceof ObjNativa) {
      if (callee.aridad >= 0 && callee.aridad !== nArgs)
        this.error(`«${callee.nombre}» espera ${callee.aridad} argumento(s) y recibió ${nArgs}`);
      const args = new Array(nArgs);
      for (let i = 0; i < nArgs; i++) args[i] = this.stack[this.sp - nArgs + i];
      this.sp -= nArgs + 1;
      this.empujar(callee.fn(args, this));
      return;
    }
    this.error(`${tipoDe(callee)} no es una función; no se puede llamar`,
      callee === null ? 'el valor es nulo — ¿olvidaste definirlo?' : null);
  }

  // llamada desde código JIT o desde una nativa
  invocar(callee, args) {
    if (callee instanceof ObjCierre && callee.fn.jit) {
      if (callee.fn.aridad !== args.length) this.error(`«${callee.fn.nombre}» espera ${callee.fn.aridad} argumento(s) y recibió ${args.length}`);
      if (++this.profJS > MAX_FRAMES) { this.profJS--; this.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = callee.fn.jit.apply(callee.upvalues, args);
      this.profJS--;
      return r;
    }
    if (callee instanceof ObjNativa) {
      if (callee.aridad >= 0 && callee.aridad !== args.length)
        this.error(`«${callee.nombre}» espera ${callee.aridad} argumento(s) y recibió ${args.length}`);
      return callee.fn(args, this);
    }
    if (!(callee instanceof ObjCierre)) this.error(`${tipoDe(callee)} no es una función`);
    const spGuardado = this.sp, framesGuardados = this.frames.length;
    this.empujar(callee);
    for (const a of args) this.empujar(a);
    this.llamarValor(callee, args.length);
    // llamarValor puede haber resuelto la llamada sin empujar marco: ocurre
    // cuando el JIT compila la función justo en esta llamada y la ejecuta ya
    // como JavaScript. En ese caso el resultado está en la pila, no hay que correr.
    if (this.frames.length === framesGuardados) {
      const r = this.sacar();
      this.sp = spGuardado;
      return r;
    }
    const r = this.correr(framesGuardados);
    this.sp = spGuardado;
    return r;
  }

  capturarUpvalue(slot) {
    for (const u of this.upAbiertas) if (u.slot === slot) return u;
    const u = this.registrar(new ObjUpvalue(slot));
    this.upAbiertas.push(u);
    return u;
  }
  cerrarUpvalues(desde) {
    for (let i = this.upAbiertas.length - 1; i >= 0; i--) {
      const u = this.upAbiertas[i];
      if (u.slot >= desde) { u.cerrado = true; u.valor = this.stack[u.slot]; this.upAbiertas.splice(i, 1); }
    }
  }

  // El bucle de despacho va envuelto para que un error del propio motor pueda
  // convertirse en algo que el programa capture. Si nadie lo recoge, se vuelve
  // a lanzar tal cual y sale por donde salía antes.
  correr(frameBase) {
    frameBase = frameBase || 0;
    for (;;) {
      try {
        return this.despachar(frameBase);
      } catch (e) {
        if (!(e instanceof ErrorTiempoEjecucion) || e.fatal) throw e;
        const valor = this.nuevoError(e.tipo || 'motor', e.message, e.linea || this.lineaActual);
        if (!this.desenrollar(valor, frameBase)) throw e;
      }
    }
  }

  // Busca hacia afuera un manejador vivo. Devuelve falso si no hay ninguno, y
  // en ese caso deja los marcos ya descartados: el error es terminal.
  desenrollar(valor, frameBase) {
    while (this.frames.length > frameBase) {
      const f = this.frames[this.frames.length - 1];
      if (f.manejadores.length) {
        const h = f.manejadores.pop();
        this.cerrarUpvalues(h.sp);
        this.sp = h.sp;
        this.empujar(valor);
        f.ip = h.destino;
        return true;
      }
      this.cerrarUpvalues(f.base);
      this.sp = f.base;
      this.frames.pop();
    }
    return false;
  }

  despachar(frameBase) {
    let f = this.frames[this.frames.length - 1];
    let code = f.cierre.fn.chunk.code, consts = f.cierre.fn.chunk.consts, lineas = f.cierre.fn.chunk.lineas;
    const recargar = () => {
      f = this.frames[this.frames.length - 1];
      code = f.cierre.fn.chunk.code; consts = f.cierre.fn.chunk.consts; lineas = f.cierre.fn.chunk.lineas;
    };

    for (;;) {
      if (++this.instrucciones > this.limiteInstr)
        this.error(`se superó el límite de ${this.limiteInstr.toLocaleString('es')} instrucciones`,
          'probablemente hay un bucle infinito', 'limite');
      const ipActual = f.ip;
      const op = code[f.ip++];
      this.lineaActual = lineas[ipActual];

      switch (op) {
        case 0 /*CONST*/: this.empujar(consts[code[f.ip++]]); break;
        case 1 /*NULO*/: this.empujar(null); break;
        case 2 /*CIERTO*/: this.empujar(true); break;
        case 3 /*FALSO*/: this.empujar(false); break;
        case 4 /*POP*/: this.sp--; break;
        case 5 /*DUP*/: this.empujar(this.mirar(0)); break;

        case 6 /*GET_LOCAL*/: this.empujar(this.stack[f.base + code[f.ip++]]); break;
        case 7 /*SET_LOCAL*/: this.stack[f.base + code[f.ip++]] = this.mirar(0); break;
        case 8 /*GET_GLOBAL*/: {
          const n = consts[code[f.ip++]];
          if (!this.globals.has(n)) { const m = mensajeNoDefinida(n); this.error(m.msg, m.pista); }
          this.empujar(this.globals.get(n)); break;
        }
        case 9 /*SET_GLOBAL*/: {
          const n = consts[code[f.ip++]];
          if (!this.globals.has(n)) { const m = mensajeNoDefinida(n); this.error(m.msg, m.pista); }
          this.globals.set(n, this.mirar(0));
          if (this.atados !== null && this.atados.has(n)) this.olvidarJIT();
          break;
        }
        case 10 /*DEF_GLOBAL*/: {
          const n = consts[code[f.ip++]];
          this.globals.set(n, this.sacar());
          if (this.atados !== null && this.atados.has(n)) this.olvidarJIT();
          break;
        }
        case 11 /*GET_UP*/: {
          const u = f.cierre.upvalues[code[f.ip++]];
          this.empujar(u.cerrado ? u.valor : this.stack[u.slot]); break;
        }
        case 12 /*SET_UP*/: {
          const u = f.cierre.upvalues[code[f.ip++]];
          if (u.cerrado) u.valor = this.mirar(0); else this.stack[u.slot] = this.mirar(0);
          break;
        }

        case 13 /*ADD*/: {
          const b = this.sacar(), a = this.sacar();
          this.empujar(this.sumar(a, b)); break;
        }
        case 14 /*SUB*/: { const b = this.sacar(), a = this.sacar();
          if (typeof a === 'number' && typeof b === 'number') { this.empujar(a - b); break; }
          this.empujar(this.aritOtro(a, b, '-')); break; }
        case 15 /*MUL*/: { const b = this.sacar(), a = this.sacar();
          if (typeof a === 'number' && typeof b === 'number') { this.empujar(a * b); break; }
          this.empujar(this.aritOtro(a, b, '*')); break; }
        case 16 /*DIV*/: {
          const b = this.sacar(), a = this.sacar();
          if (typeof a !== 'number' || typeof b !== 'number') { this.empujar(this.aritOtro(a, b, '/')); break; }
          if (b === 0) this.error('división entre cero', 'comprueba el divisor antes de dividir');
          this.empujar(a / b); break;
        }
        case 17 /*IDIV*/: {
          const b = this.sacar(), a = this.sacar();
          if (typeof a !== 'number' || typeof b !== 'number') { this.empujar(this.aritOtro(a, b, '//')); break; }
          if (b === 0) this.error('división entre cero');
          this.empujar(Math.floor(a / b)); break;
        }
        case 18 /*MOD*/: {
          const b = this.sacar(), a = this.sacar();
          if (typeof a !== 'number' || typeof b !== 'number') { this.empujar(this.aritOtro(a, b, '%')); break; }
          if (b === 0) this.error('módulo entre cero');
          this.empujar(((a % b) + b) % b); break;
        }
        case 19 /*POW*/: { const b = this.sacar(), a = this.sacar();
          if (typeof a === 'number' && typeof b === 'number') { this.empujar(Math.pow(a, b)); break; }
          this.empujar(this.aritOtro(a, b, '**')); break; }
        case 20 /*NEG*/: {
          const a = this.sacar();
          if (a instanceof ObjArreglo) { this.empujar(this.arrArit(a, -1, '*')); break; }
          if (typeof a !== 'number') this.error(`«-» necesita un número y recibió ${tipoDe(a)}`);
          this.empujar(-a); break;
        }
        case 21 /*NOT*/: this.empujar(!verdad(this.sacar())); break;

        case 22 /*EQ*/: { const b = this.sacar(), a = this.sacar(); this.empujar(iguales(a, b)); break; }
        case 23 /*NEQ*/: { const b = this.sacar(), a = this.sacar(); this.empujar(!iguales(a, b)); break; }
        case 24 /*LT*/: { const b = this.sacar(), a = this.sacar(); this.cmp(a, b, '<'); this.empujar(a < b); break; }
        case 25 /*LE*/: { const b = this.sacar(), a = this.sacar(); this.cmp(a, b, '<='); this.empujar(a <= b); break; }
        case 26 /*GT*/: { const b = this.sacar(), a = this.sacar(); this.cmp(a, b, '>'); this.empujar(a > b); break; }
        case 27 /*GE*/: { const b = this.sacar(), a = this.sacar(); this.cmp(a, b, '>='); this.empujar(a >= b); break; }

        case 28 /*JMP*/: f.ip += code[f.ip] + 1; break;
        case 29 /*JMP_FALSE*/: { const off = code[f.ip++]; if (!verdad(this.mirar(0))) f.ip += off; break; }
        case 30 /*JMP_TRUE*/: { const off = code[f.ip++]; if (verdad(this.mirar(0))) f.ip += off; break; }
        case 31 /*LOOP*/: { const off = code[f.ip++]; f.ip -= off; break; }

        case 32 /*CALL*/: {
          const n = code[f.ip++];
          this.llamarValor(this.stack[this.sp - n - 1], n);
          recargar(); break;
        }
        case 33 /*CLOSURE*/: {
          const fn = consts[code[f.ip++]];
          const cl = this.registrar(new ObjCierre(fn));
          for (let i = 0; i < fn.nUpvalues; i++) {
            const esLocal = code[f.ip++], idx = code[f.ip++];
            cl.upvalues.push(esLocal ? this.capturarUpvalue(f.base + idx) : f.cierre.upvalues[idx]);
          }
          this.empujar(cl); break;
        }
        case 34 /*CLOSE_UP*/: this.cerrarUpvalues(this.sp - 1); this.sp--; break;
        case 35 /*RET*/: {
          const r = this.sacar();
          this.cerrarUpvalues(f.base);
          this.frames.pop();
          if (this.frames.length <= frameBase) { this.sp = f.base; return r; }
          this.sp = f.base;
          this.empujar(r);
          recargar(); break;
        }

        case 36 /*LISTA*/: {
          const n = code[f.ip++];
          const items = new Array(n);
          for (let i = n - 1; i >= 0; i--) items[i] = this.sacar();
          this.empujar(this.nuevaLista(items)); break;
        }
        case 37 /*DIC*/: {
          const n = code[f.ip++];
          const d = this.nuevoDic();
          const pares = new Array(n);
          for (let i = n - 1; i >= 0; i--) { const v = this.sacar(), k = this.sacar(); pares[i] = [k, v]; }
          for (const [k, v] of pares) d.mapa.set(k, v);
          this.empujar(d); break;
        }
        case 38 /*IDX_GET*/: { const i = this.sacar(), o = this.sacar(); this.empujar(this.indiceObtener(o, i)); break; }
        case 39 /*IDX_SET*/: {
          const v = this.sacar(), i = this.sacar(), o = this.sacar();
          this.indiceAsignar(o, i, v); this.empujar(v); break;
        }
        case 40 /*PROP_GET*/: {
          const n = consts[code[f.ip++]], o = this.sacar();
          this.empujar(this.indiceObtener(o, n)); break;
        }
        case 41 /*CONCAT*/: {
          const n = code[f.ip++];
          const partes = new Array(n);
          for (let i = n - 1; i >= 0; i--) partes[i] = this.sacar();
          this.empujar(partes.map(x => typeof x === 'string' ? x : repr(x, 1)).join('')); break;
        }
        case 43 /*TRY*/: {
          const off = code[f.ip++];
          f.manejadores.push({ destino: f.ip + off, sp: this.sp });
          break;
        }
        case 44 /*FIN_TRY*/: f.manejadores.pop(); break;
        case 45 /*LANZAR*/: {
          const v = this.sacar();
          if (this.desenrollar(v, frameBase)) { recargar(); break; }
          const e = new ErrorTiempoEjecucion(
            v instanceof ObjError ? v.mensaje : `error sin capturar: ${repr(v, 1)}`);
          e.fatal = true;            // ya se desenrolló; no volver a buscarle sitio
          e.linea = this.lineaActual;
          throw e;
        }

        case 42 /*LEN*/: {
          const o = this.sacar();
          this.empujar(this.longitud(o)); break;
        }
        default: this.error(`instrucción desconocida ${op}`);
      }
    }
  }

  // La aritmética cuando NO son dos números. Los opcodes y el JIT prueban el
  // camino rápido primero —dos números, sin llamar a nada— y solo caen aquí si
  // alguno es otra cosa. Así añadir arreglos no cuesta un microsegundo en el
  // 99% de los programas, que no los usan.
  aritOtro(a, b, op) {
    if (a instanceof ObjArreglo || b instanceof ObjArreglo) return this.arrArit(a, b, op);
    if (op === '+') return this.sumar(a, b);
    this.error(`«${op}» necesita dos números y recibió ${tipoDe(a)} y ${tipoDe(b)}`);
  }

  // Una operación elemento a elemento entre dos arreglos, o entre un arreglo y
  // un número. El bucle está en JavaScript, no en la VM: es lo que separa esto
  // de «mapear(lista, fn(x) { … })», donde cada elemento paga una llamada.
  arrArit(a, b, op) {
    const esA = a instanceof ObjArreglo, esB = b instanceof ObjArreglo;
    if (esA && !esB && typeof b !== 'number')
      this.error(`«${op}»: un arreglo se opera con otro arreglo o con un número, y llegó ${tipoDe(b)}`);
    if (esB && !esA && typeof a !== 'number')
      this.error(`«${op}»: un arreglo se opera con otro arreglo o con un número, y llegó ${tipoDe(a)}`);

    // Si alguno es complejo, el resultado lo es y la cuenta es otra. Se aparta
    // aquí arriba porque abajo todo supone un número por posición.
    if ((esA && a.tipo === 'complejo') || (esB && b.tipo === 'complejo')) return this.arrAritC(a, b, op);

    // El tipo del resultado: entero solo si los dos lo son y la operación lo
    // conserva. Dividir siempre da real, como en el resto del lenguaje.
    const tA = esA ? a.tipo : (Number.isInteger(a) ? 'entero' : 'real');
    const tB = esB ? b.tipo : (Number.isInteger(b) ? 'entero' : 'real');
    const entero = tA === 'entero' && tB === 'entero' && op !== '/' && op !== '**';
    const tipo = entero ? 'entero' : 'real';

    const f = esA && esB ? difundir(a.forma, b.forma) : (esA ? a.forma.slice() : b.forma.slice());
    if (f === null)
      this.error(`«${op}»: las formas ${a.forma.join('×')} y ${b.forma.join('×')} no se pueden difundir`,
        'de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1');

    const out = this.arrNuevo(f, tipo);
    const n = out.tamano;
    this.cobrar(n);
    const d = out.datos;

    // El camino rápido: los dos seguidos y de la misma forma. Es el caso de
    // «a + b» con dos arreglos iguales, que es el que más se escribe, y aquí el
    // bucle no mira zancadas ni índices.
    const mismaForma = esA && esB && a.seguida && b.seguida &&
      a.forma.length === b.forma.length && a.forma.every((x, i) => x === b.forma[i]);
    if (mismaForma) {
      const x = a.datos, y = b.datos;
      aplicarOp(d, x, y, n, op, this);
      return out;
    }
    if (esA && !esB && a.seguida) { aplicarOpEsc(d, a.datos, b, n, op, false, this); return out; }
    if (esB && !esA && b.seguida) { aplicarOpEsc(d, b.datos, a, n, op, true, this); return out; }

    // El camino general: vistas, transpuestas y difusión de verdad. Recorre por
    // zancadas, que es lo único que vale para cualquier forma.
    const za = esA ? zancadasDifundidas(a, f) : null;
    const zb = esB ? zancadasDifundidas(b, f) : null;
    const nd = f.length;
    const ix = new Array(nd).fill(0);
    for (let k = 0; k < n; k++) {
      let pa = esA ? a.desp : 0, pb = esB ? b.desp : 0;
      for (let q = 0; q < nd; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
      const va = esA ? a.datos[pa] : a, vb = esB ? b.datos[pb] : b;
      d[k] = unaOp(va, vb, op, this);
      for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
    }
    return out;
  }

  // Un complejo contra otro, o contra un real, con difusión. Un real se trata
  // como (x, 0): así «fourier(x) * 2» y «a + 1» funcionan sin que nadie tenga
  // que convertir nada a mano.
  arrAritC(a, b, op) {
    const esA = a instanceof ObjArreglo, esB = b instanceof ObjArreglo;
    const f = esA && esB ? difundir(a.forma, b.forma) : (esA ? a.forma.slice() : b.forma.slice());
    if (f === null)
      this.error(`«${op}»: las formas ${a.forma.join('×')} y ${b.forma.join('×')} no se pueden difundir`,
        'de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1');
    const out = this.arrNuevo(f, 'complejo');
    const n = out.tamano;
    this.cobrar(n * 2);
    const d = out.datos;
    const cA = esA && a.tipo === 'complejo', cB = esB && b.tipo === 'complejo';
    const za = esA ? zancadasDifundidas(a, f) : null;
    const zb = esB ? zancadasDifundidas(b, f) : null;
    const nd = f.length, ix = new Array(nd).fill(0);
    for (let k = 0; k < n; k++) {
      let pa = esA ? a.desp : 0, pb = esB ? b.desp : 0;
      for (let q = 0; q < nd; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
      const ar = esA ? (cA ? a.datos[2 * pa] : a.datos[pa]) : a;
      const ai = cA ? a.datos[2 * pa + 1] : 0;
      const br = esB ? (cB ? b.datos[2 * pb] : b.datos[pb]) : b;
      const bi = cB ? b.datos[2 * pb + 1] : 0;
      const r = opC(op, ar, ai, br, bi, this);
      d[2 * k] = r[0]; d[2 * k + 1] = r[1];
      for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
    }
    return out;
  }
  // De un complejo a un real: el módulo, la fase, la parte real. Una sola
  // función y los cuatro nombres que las usan quedan en una línea cada uno.
  arrDeComplejoA(x, fn, tipo) {
    const out = this.arrNuevo(x.forma, tipo || 'real');
    const d = out.datos;
    this.cobrar(x.tamano);
    let i = 0;
    for (const p of x.posiciones()) d[i++] = fn(x.datos[2 * p], x.datos[2 * p + 1]);
    return out;
  }
  // De complejo a complejo, posición a posición. «fn» devuelve [re, im].
  arrComplejoA(x, fn) {
    const out = this.arrNuevo(x.forma, 'complejo');
    const d = out.datos;
    this.cobrar(x.tamano * 2);
    let i = 0;
    for (const p of x.posiciones()) {
      const r = fn(x.datos[2 * p], x.datos[2 * p + 1]);
      d[2 * i] = r[0]; d[2 * i + 1] = r[1]; i++;
    }
    return out;
  }
  // Los números de un complejo, en un Float64Array seguido de 2n: es lo que
  // necesitan Fourier y cualquier cosa que lo trate como memoria plana.
  arrPlanosC(x) {
    const n = x.tamano, d = new Float64Array(n * 2);
    let i = 0;
    for (const p of x.posiciones()) { d[2 * i] = x.datos[2 * p]; d[2 * i + 1] = x.datos[2 * p + 1]; i++; }
    this.cobrar(n);
    return d;
  }
  // Y de vuelta.
  arrDesdePlanosC(d, forma) {
    const out = this.arrNuevo(forma, 'complejo');
    out.datos.set(d.subarray(0, out.tamano * 2));
    return out;
  }
  // Lo que NO sabe de complejos lo dice en vez de leer la mitad de los números
  // y devolver algo que parece un resultado. Es la razón de que añadir el tipo
  // no haya podido romper en silencio ninguna de las ciento cincuenta funciones
  // que ya había: ninguna lo acepta hasta que se la enseña a propósito.
  nadaDeComplejos(x, f) {
    if (x instanceof ObjArreglo && x.tipo === 'complejo')
      this.error(f ? `«${f}» todavía no sabe trabajar con arreglos complejos`
                   : 'esta operación todavía no sabe trabajar con arreglos complejos',
        'pasa a reales primero con parteReal, parteImaginaria o absoluto, que es casi siempre lo que se quiere de una transformada');
  }

  // ── los motores que comparten todas las funciones de arreglo ─────────────
  // Están en la VM y no en el eDSL porque los necesitan las dos mitades: las
  // funciones nuevas y las que ya existían y tienen que aprender a recibir un
  // arreglo. Dos copias de «recorrer respetando las zancadas» es una de más.

  // Una función de un número a un número, aplicada a todo. Es lo que convierte
  // «seno(x)» en «seno(arreglo)» sin escribir nada nuevo.
  arrUnaria(x, fn, tipo) {
    this.nadaDeComplejos(x, null);
    const out = this.arrNuevo(x.forma, tipo || (x.tipo === 'bool' ? 'real' : x.tipo));
    const d = out.datos, n = out.tamano;
    this.cobrar(n);
    if (x.seguida) { const s = x.datos; for (let i = 0; i < n; i++) d[i] = fn(s[i]); return out; }
    let i = 0;
    for (const p of x.posiciones()) d[i++] = fn(x.datos[p]);
    return out;
  }

  // Comparar elemento a elemento da un arreglo de «bool», que es la mitad del
  // vocabulario: sin él no hay máscaras, y sin máscaras no hay «los que
  // cumplen esto».
  arrComparar(a, b, op) {
    const esA = a instanceof ObjArreglo, esB = b instanceof ObjArreglo;
    if (!esA && !esB) this.error(`«${op}» sobre arreglos necesita al menos un arreglo`);
    if ((esA && !esB && typeof b !== 'number') || (esB && !esA && typeof a !== 'number'))
      this.error(`«${op}»: un arreglo se compara con otro arreglo o con un número`);
    const f = esA && esB ? difundir(a.forma, b.forma) : (esA ? a.forma.slice() : b.forma.slice());
    if (f === null)
      this.error(`«${op}»: las formas ${a.forma.join('×')} y ${b.forma.join('×')} no se pueden difundir`,
        'de derecha a izquierda, cada par de ejes tiene que ser igual o uno de los dos ser 1');
    // Los complejos no tienen orden: «menor» no significa nada en el plano. Sí
    // se puede preguntar si son iguales, y eso se hace comparando las dos
    // partes. Decirlo es mejor que comparar solo la parte real, que es lo que
    // haría el bucle de abajo sin enterarse.
    const cplx = (esA && a.tipo === 'complejo') || (esB && b.tipo === 'complejo');
    if (cplx) {
      if (op !== '==' && op !== '!=')
        this.error(`«${op}» no vale entre complejos: en el plano no hay «menor»`,
          'compara los módulos con absoluto(a), o usa «==» y «!=», que sí tienen sentido');
      const out = this.arrNuevo(f, 'bool');
      const d = out.datos, n = out.tamano;
      this.cobrar(n);
      const cA = esA && a.tipo === 'complejo', cB = esB && b.tipo === 'complejo';
      const za = esA ? zancadasDifundidas(a, f) : null;
      const zb = esB ? zancadasDifundidas(b, f) : null;
      const nd = f.length, ix = new Array(nd).fill(0);
      for (let k = 0; k < n; k++) {
        let pa = esA ? a.desp : 0, pb = esB ? b.desp : 0;
        for (let q = 0; q < nd; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
        const ar = esA ? (cA ? a.datos[2 * pa] : a.datos[pa]) : a;
        const ai = cA ? a.datos[2 * pa + 1] : 0;
        const br = esB ? (cB ? b.datos[2 * pb] : b.datos[pb]) : b;
        const bi = cB ? b.datos[2 * pb + 1] : 0;
        const ig = ar === br && ai === bi;
        d[k] = (op === '==' ? ig : !ig) ? 1 : 0;
        for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
      }
      return out;
    }
    const out = this.arrNuevo(f, 'bool');
    const d = out.datos, n = out.tamano;
    this.cobrar(n);
    const cmp = CMP_ARR[op];
    if (!cmp) this.error(`«${op}» no es una comparación`);
    if (esA && esB && a.seguida && b.seguida && a.tamano === n && b.tamano === n) {
      const x = a.datos, y = b.datos;
      for (let i = 0; i < n; i++) d[i] = cmp(x[i], y[i]) ? 1 : 0;
      return out;
    }
    if (esA && !esB && a.seguida) {
      const x = a.datos;
      for (let i = 0; i < n; i++) d[i] = cmp(x[i], b) ? 1 : 0;
      return out;
    }
    if (esB && !esA && b.seguida) {
      const y = b.datos;
      for (let i = 0; i < n; i++) d[i] = cmp(a, y[i]) ? 1 : 0;
      return out;
    }
    const za = esA ? zancadasDifundidas(a, f) : null;
    const zb = esB ? zancadasDifundidas(b, f) : null;
    const nd = f.length, ix = new Array(nd).fill(0);
    for (let k = 0; k < n; k++) {
      let pa = esA ? a.desp : 0, pb = esB ? b.desp : 0;
      for (let q = 0; q < nd; q++) { if (esA) pa += ix[q] * za[q]; if (esB) pb += ix[q] * zb[q]; }
      d[k] = cmp(esA ? a.datos[pa] : a, esB ? b.datos[pb] : b) ? 1 : 0;
      for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < f[q]) break; ix[q] = 0; }
    }
    return out;
  }

  // Los valores de un arreglo en orden lógico, como JavaScript plano. Es el
  // puente que usan las reducciones que ya existían para listas.
  arrValores(x) {
    this.nadaDeComplejos(x, null);
    const out = new Array(x.tamano);
    let i = 0;
    for (const p of x.posiciones()) out[i++] = x.datos[p];
    this.cobrar(x.tamano);
    return out;
  }

  // Reducir a lo largo de un eje. Sin eje reduce todo y devuelve un número; con
  // eje devuelve un arreglo con ese eje quitado. Es la forma que tienen todas
  // las reducciones de NumPy, y la razón de que «suma(a, 0)» signifique algo.
  arrReducir(x, eje, inicio, paso, fin, tipo) {
    this.nadaDeComplejos(x, null);
    if (eje === null || eje === undefined) {
      let acc = inicio;
      let n = 0;
      for (const p of x.posiciones()) { acc = paso(acc, x.datos[p], n++); }
      this.cobrar(x.tamano);
      return fin ? fin(acc, n) : acc;
    }
    const e = this.arrEje(x, eje, 'reducir');
    const f = x.forma.filter((_, i) => i !== e);
    const out = this.arrNuevo(f.length ? f : [1], tipo || 'real');
    const largo = x.forma[e], zEje = x.zancadas[e];
    // Recorre la forma SIN el eje reducido, y dentro recorre el eje.
    const fRest = f.length ? f : [1];
    const zRest = x.zancadas.filter((_, i) => i !== e);
    const nd = fRest.length, ix = new Array(nd).fill(0);
    const total = out.tamano;
    for (let k = 0; k < total; k++) {
      let base = x.desp;
      if (f.length) for (let q = 0; q < nd; q++) base += ix[q] * zRest[q];
      let acc = inicio;
      for (let j = 0; j < largo; j++) acc = paso(acc, x.datos[base + j * zEje], j);
      out.datos[k] = fin ? fin(acc, largo) : acc;
      for (let q = nd - 1; q >= 0; q--) { if (++ix[q] < fRest[q]) break; ix[q] = 0; }
    }
    this.cobrar(x.tamano);
    return f.length ? out : out.datos[0];
  }

  // Un eje válido, aceptando negativos como en NumPy: −1 es el último.
  arrEje(x, eje, quien) {
    let e = Math.trunc(eje);
    if (e < 0) e += x.dimensiones;
    if (e < 0 || e >= x.dimensiones)
      this.error(`«${quien}»: el eje ${eje} no existe en un arreglo de ${x.forma.join('×')}`,
        x.dimensiones === 1 ? 'este arreglo tiene un solo eje, el 0'
          : `los ejes van de 0 a ${x.dimensiones - 1}, y −1 es el último`);
    return e;
  }

  sumar(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (a instanceof ObjLista && b instanceof ObjLista) return this.nuevaLista(a.items.concat(b.items));
    if (a instanceof ObjArreglo || b instanceof ObjArreglo) return this.arrArit(a, b, '+');
    if (typeof a === 'string' || typeof b === 'string')
      this.error(`no se puede sumar ${tipoDe(a)} y ${tipoDe(b)}`,
        `convierte con texto(...): por ejemplo "total: " + texto(${repr(typeof a === 'string' ? b : a, 1)})`);
    this.error(`no se puede sumar ${tipoDe(a)} y ${tipoDe(b)}`);
  }
  numDos(a, b, op) {
    if (typeof a !== 'number' || typeof b !== 'number')
      this.error(`«${op}» necesita dos números y recibió ${tipoDe(a)} y ${tipoDe(b)}`);
  }
  cmp(a, b, op) {
    // Dos fechas sí: es la razón de que «fecha» sea un tipo y no un texto ni un
    // número. Una fecha con un número NO, aunque por dentro sea un número:
    // dejarlo pasar es justo el error que el tipo viene a quitar.
    const ok = (typeof a === 'number' && typeof b === 'number') ||
               (typeof a === 'string' && typeof b === 'string') ||
               (a instanceof ObjFecha && b instanceof ObjFecha);
    if (!ok) this.error(`no se pueden comparar ${tipoDe(a)} y ${tipoDe(b)} con «${op}»`,
      (a instanceof ObjTabla || b instanceof ObjTabla)
        ? 'una tabla no tiene orden; para ordenar sus filas usa ordenarPor(t, "columna")'
        : (a instanceof ObjFecha || b instanceof ObjFecha)
          ? 'una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)' : null);
  }
  longitud(o) {
    if (typeof o === 'string') return o.length;
    if (o instanceof ObjLista) return o.items.length;
    if (o instanceof ObjDic) return o.mapa.size;
    // De una tabla, sus FILAS. Es lo que alguien pregunta al escribir
    // longitud(t), y para las columnas está «columnas(t)».
    if (o instanceof ObjTabla) return o.filas;
    this.error(`no se puede recorrer ni medir un valor de tipo ${tipoDe(o)}`);
  }
  indiceObtener(o, i) {
    if (o instanceof ObjError) {
      const v = o.campo(String(i));
      if (v === undefined) this.error(`un error no tiene «${i}»`, 'sus campos son tipo, mensaje y linea');
      return v;
    }
    if (o instanceof ObjLista) {
      if (typeof i !== 'number') this.error(`el índice de una lista debe ser un número y es ${tipoDe(i)}`);
      let k = i < 0 ? o.items.length + i : i;
      if (k < 0 || k >= o.items.length || !Number.isInteger(k))
        this.error(`índice ${i} fuera de rango (la lista tiene ${o.items.length} elemento(s))`,
          o.items.length ? `los índices válidos van de 0 a ${o.items.length - 1}, o de -1 a -${o.items.length}` : 'la lista está vacía');
      return o.items[k];
    }
    if (typeof o === 'string') {
      let k = i < 0 ? o.length + i : i;
      if (typeof i !== 'number' || k < 0 || k >= o.length) this.error(`índice ${i} fuera del texto (longitud ${o.length})`);
      return o[k];
    }
    if (o instanceof ObjDic) {
      if (!o.mapa.has(i)) this.error(`la clave ${repr(i, 1)} no existe en el diccionario`,
        o.mapa.size ? `claves disponibles: ${[...o.mapa.keys()].slice(0, 6).map(k => repr(k, 1)).join(', ')}` : 'el diccionario está vacío');
      return o.mapa.get(i);
    }
    this.error(`no se puede indexar un valor de tipo ${tipoDe(o)}`);
  }
  indiceAsignar(o, i, v) {
    if (o instanceof ObjLista) {
      if (typeof i !== 'number') this.error(`el índice de una lista debe ser un número y es ${tipoDe(i)}`);
      let k = i < 0 ? o.items.length + i : i;
      if (k < 0 || k >= o.items.length) this.error(`índice ${i} fuera de rango (longitud ${o.items.length})`);
      o.items[k] = v; return;
    }
    if (o instanceof ObjDic) { o.mapa.set(i, v); return; }
    this.error(`no se puede asignar por índice en un valor de tipo ${tipoDe(o)}`);
  }

  // ======================================================================
  //   JIT — compila el AST de una función caliente a JavaScript nativo
  // ======================================================================
  // Tirar todo lo compilado. Pasa cuando cambia un global que el JIT había
  // atado, y en un programa normal eso ocurre cero veces: los «fn» del nivel
  // superior se definen antes de que nada se ponga caliente.
  olvidarJIT() {
    if (this.compiladas === null) return;
    for (const fn of this.compiladas) { fn.jit = null; fn.jitEstado = 'frío'; fn.llamadas = 0; }
    this.compiladas.clear();
    this.atados.clear();
    this.stats.jitOlvidadas = (this.stats.jitOlvidadas || 0) + 1;
  }

  intentarJIT(fn) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    fn.jitEstado = 'caliente';
    try {
      const gen = generarJS(fn, this);
      if (!gen) { fn.jitEstado = 'rechazada'; this.stats.jitFallidas++; return; }
      const src = typeof gen === 'string' ? gen : gen.src;
      const nat = (typeof gen === 'string' ? null : gen.nativas) || [];
      const rt = this.rt || (this.rt = crearRT(this));
      // Las nativas atadas entran como un argumento más de la fábrica, así que
      // dentro del código generado son variables locales: ni búsqueda en el
      // mapa de globales ni despacho por llamada.
      // eslint-disable-next-line no-new-func
      const cie = (typeof gen === 'string' ? null : gen.cierres) || [];
      const factoria = new Function('rt', 'nt', 'pr', 'cf', '"use strict";return ' + src);
      fn.jit = factoria(rt, nat.map(x => x.nat.fn), (typeof gen === 'string' ? null : gen.protos) || [],
                        cie.map(x => x.cl));
      if (nat.length || cie.length) {
        if (this.atados === null) { this.atados = new Set(); this.compiladas = new Set(); }
        for (const x of nat) this.atados.add(x.nombre);
        // Los cierres atados también: si alguien reasigna «sumar», lo compilado
        // que llamaba derecho al «sumar» de antes tiene que tirarse. Es la misma
        // maquinaria que ya había para las nativas.
        for (const x of cie) this.atados.add(x.nombre);
        this.compiladas.add(fn);
      }
      fn.jitSrc = src;
      fn.jitEstado = 'compilada';
      this.stats.jitCompiladas++;
    } catch (e) {
      fn.jitEstado = 'rechazada';
      fn.jitError = e.message;
      this.stats.jitFallidas++;
    }
    this.stats.tiempoJIT += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  }
}

// ¿el cuerpo de esta función contiene algún bucle?
function tieneBucle(ast) {
  if (!ast) return false;
  let hay = false;
  const visita = n => {
    if (hay || !n || typeof n !== 'object') return;
    if (n.tipo === 'Mientras' || n.tipo === 'Para' || n.tipo === 'Repetir') { hay = true; return; }
    if (n.tipo === 'FuncionAnon' || n.tipo === 'DeclFuncion') return;
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(visita); else if (v && typeof v === 'object') visita(v); }
  };
  visita(ast.cuerpo);
  return hay;
}

// ------------------------------------------- puente entre el JIT y la máquina
function crearRT(vm) {
  return {
    // Las nativas atadas reciben la VM como segundo argumento, igual que cuando
    // las llama el intérprete: hay nativas que la necesitan.
    vm,
    g(n) { if (!vm.globals.has(n)) { const m = mensajeNoDefinida(n); vm.error(m.msg, m.pista); } return vm.globals.get(n); },
    sg(n, v) { if (!vm.globals.has(n)) { const m = mensajeNoDefinida(n); vm.error(m.msg, m.pista); } vm.globals.set(n, v); return v; },
    // Una caja: un ObjUpvalue ya CERRADO. Es la misma clase que usa el
    // intérprete para las variables capturadas, y eso es a propósito: un cierre
    // creado por código compilado puede acabar llamado por el intérprete y al
    // revés, así que la representación tiene que ser una sola. Si fueran dos
    // habría que mantenerlas de acuerdo, y ese es el fallo que no se encuentra.
    // No se registra en el montón: no hace falta, porque quien la alcanza es el
    // cierre que la guarda, y el recolector de JavaScript ya se ocupa.
    caja(v) {
      const u = new ObjUpvalue(-1);
      u.cerrado = true;
      u.valor = v;
      return u;
    },
    // Leer y escribir una variable capturada. El «cerrado» no se puede dar por
    // supuesto: si el cierre lo creó el intérprete, la variable puede seguir
    // viva en la pila de la máquina.
    gu(u) { return u.cerrado ? u.valor : vm.stack[u.slot]; },
    su(u, v) { if (u.cerrado) u.valor = v; else vm.stack[u.slot] = v; return v; },
    // Crear un cierre desde código compilado. El prototipo ya lo compiló el
    // compilador de bytecode y viene atado a la fábrica, así que esto es un
    // objeto nuevo y nada más: ni compilar ni buscar.
    cierre(proto, ups) {
      const cl = vm.registrar(new ObjCierre(proto));
      for (let i = 0; i < ups.length; i++) cl.upvalues.push(ups[i]);
      return cl;
    },
    // El camino rápido de una llamada atada: el cierre ya está en la mano, la
    // aridad se comprobó al compilar y el guardia de quien llama ya vio que hay
    // código. Solo queda el control de profundidad, que no se puede saltar: sin
    // él una recursión sin caso base revienta la pila de JavaScript en vez de
    // dar el error de Ñ.
    // Una por aridad hasta cuatro argumentos. Parece repetitivo y lo es, pero
    // la medida manda: con «apply» y un array la llamada costaba 18 ns y con
    // «call» y argumentos sueltos cuesta mucho menos, porque no se asigna el
    // array y V8 puede meter la llamada en línea. La nativa atada, que es una
    // llamada directa de toda la vida, cuesta 1,25 ns: ese es el suelo.
    ya0(c) {
      if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = c.fn.jit.call(c.upvalues);
      vm.profJS--;
      return r;
    },
    ya1(c, a) {
      if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = c.fn.jit.call(c.upvalues, a);
      vm.profJS--;
      return r;
    },
    ya2(c, a, b) {
      if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = c.fn.jit.call(c.upvalues, a, b);
      vm.profJS--;
      return r;
    },
    ya3(c, a, b, d) {
      if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = c.fn.jit.call(c.upvalues, a, b, d);
      vm.profJS--;
      return r;
    },
    ya4(c, a, b, d, e) {
      if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
      const r = c.fn.jit.call(c.upvalues, a, b, d, e);
      vm.profJS--;
      return r;
    },
    call(c, a) {
      if (c !== null && c.clase === 'cierre' && c.fn.jit !== null && c.fn.aridad === a.length) {
        if (++vm.profJS > MAX_FRAMES) { vm.profJS--; vm.error('desbordamiento de pila: demasiadas llamadas anidadas', 'suele indicar una recursión sin caso base'); }
        const r = c.fn.jit.apply(c.upvalues, a);
        vm.profJS--;
        return r;
      }
      return vm.invocar(c, a);
    },
    add(a, b) { return vm.sumar(a, b); },
    // El JIT ya prueba «typeof a === 'number' && typeof b === 'number'» en el
    // código que genera, así que aquí solo llega lo que NO son dos números: un
    // arreglo, o un error. Por eso se va derecho a «aritOtro».
    sub(a, b) { return vm.aritOtro(a, b, '-'); },
    mul(a, b) { return vm.aritOtro(a, b, '*'); },
    div(a, b) { if (typeof a !== 'number' || typeof b !== 'number') return vm.aritOtro(a, b, '/');
                if (b === 0) vm.error('división entre cero'); return a / b; },
    idiv(a, b) { if (typeof a !== 'number' || typeof b !== 'number') return vm.aritOtro(a, b, '//');
                 if (b === 0) vm.error('división entre cero'); return Math.floor(a / b); },
    mod(a, b) { if (typeof a !== 'number' || typeof b !== 'number') return vm.aritOtro(a, b, '%');
                if (b === 0) vm.error('módulo entre cero'); return ((a % b) + b) % b; },
    pow(a, b) { return vm.aritOtro(a, b, '**'); },
    neg(a) { if (a instanceof ObjArreglo) return vm.arrArit(a, -1, '*');
             if (typeof a !== 'number') vm.error(`«-» necesita un número y recibió ${tipoDe(a)}`); return -a; },
    lt(a, b) { vm.cmp(a, b, '<'); return a < b; },
    le(a, b) { vm.cmp(a, b, '<='); return a <= b; },
    gt(a, b) { vm.cmp(a, b, '>'); return a > b; },
    ge(a, b) { vm.cmp(a, b, '>='); return a >= b; },
    // La red contra bucles infinitos, dentro del código traducido. El JS que
    // genera el JIT no pasa por el bucle de despacho, así que no contaba nada:
    // «mientras cierto» dentro de una función se colgaba para siempre, y una
    // función con bucle se traduce en su PRIMERA llamada, así que era el caso
    // normal y no el raro. Se cobra de 1024 en 1024 para que el bucle caliente
    // no pague una llamada por vuelta.
    tic(n) {
      vm.instrucciones += n;
      if (vm.instrucciones > vm.limiteInstr)
        vm.error(`se superó el límite de ${vm.limiteInstr.toLocaleString('es')} instrucciones`,
          'probablemente hay un bucle infinito', 'limite');
    },
    eq: iguales,
    verdad,
    lista(items) { return vm.nuevaLista(items); },
    dic(pares) { const d = vm.nuevoDic(); for (const [k, v] of pares) d.mapa.set(k, v); return d; },
    idxg(o, i) { return vm.indiceObtener(o, i); },
    idxs(o, i, v) { vm.indiceAsignar(o, i, v); return v; },
    len(o) { return vm.longitud(o); },
    cat(p) { return p.map(x => typeof x === 'string' ? x : repr(x, 1)).join(''); },
    txt(x) { return typeof x === 'string' ? x : repr(x, 1); },
  };
}

// --------------------------------------- generador de JavaScript desde el AST
function generarJS(fn, vm) {
  // Una función que llegó por bytecode no trae AST, y ese es justo el punto:
  // el JIT compila desde el AST, así que cargar bytecode ajeno nunca puede
  // acabar en «new Function». Se comprueba de las dos maneras —por la bandera
  // y por la ausencia de AST— para que quitar una sin querer no abra la puerta.
  if (fn.deDisco) { fn.jitEstado = 'rechazada'; return null; }
  const ast = fn.ast;
  if (!ast) return null;
  // Una función que captura variables de fuera SÍ se compila: sus capturas
  // llegan como el «this» de la función y leerlas o escribirlas es rt.gu y
  // rt.su. Lo único que no se puede compilar es una captura cuyo nombre no
  // venga apuntado, y eso solo pasa con bytecode de disco, que ya está fuera.
  const upIndice = new Map();
  if (fn.nUpvalues > 0) {
    const ups = (fn.ast && fn.ast.ups) || null;
    if (!ups || ups.length !== fn.nUpvalues) return null;
    for (let i = 0; i < ups.length; i++) {
      if (!ups[i].nombre) return null;
      upIndice.set(ups[i].nombre, i);
    }
  }
  // El mismo enlace que usó el compilador de bytecode. Los dos tienen que
  // traducir los nombres igual: si se separan, una función de un módulo cambia
  // de comportamiento al pasar por el JIT, y solo a partir de la llamada 40.
  const enl = fn.enlace || null;
  const gl = nombre => globalDeEnlace(enl, nombre);
  let nTmp = 0;
  const temps = [];
  const tmp = () => { const t = '_r$' + temps.length; temps.push(t); return t; };
  const jsNom = n => '_v$' + n.replace(/[^A-Za-z0-9_]/g, c => '$' + c.charCodeAt(0).toString(16));
  const locales = [new Set(ast.params.map(p => p.nombre))];
  const declarada = n => locales.some(s => s.has(n));

  // Las locales de ESTA función que alguna función anidada se lleva. Se miran
  // solo las anidadas DIRECTAS, y basta: cuando una nieta captura algo de la
  // abuela, la hija lo pide a su vez con «esLocal» sobre la abuela, así que el
  // nombre aparece aquí igual. Una local capturada se compila como una CAJA
  // —un ObjUpvalue cerrado— para que la función y el cierre compartan la misma
  // variable y no dos copias: si el cierre le escribe, el de fuera lo ve.
  const cajas = new Set();
  (function buscarCapturas(nodo) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) { for (const x of nodo) buscarCapturas(x); return; }
    if (nodo.tipo === 'DeclFuncion' || nodo.tipo === 'FuncionAnon') {
      // No se entra en su cuerpo: lo que capture de más adentro ya sube por
      // sus propias «ups».
      if (nodo.ups) for (const u of nodo.ups) if (u.esLocal && u.nombre) cajas.add(u.nombre);
      return;
    }
    for (const k in nodo) if (k !== 'proto' && k !== 'ups') buscarCapturas(nodo[k]);
  })(ast.cuerpo);
  // Una local declarada con «fn» aquí dentro y que NADIE reasigna ni redeclara
  // guarda siempre un cierre de ese prototipo. Entonces su aridad se sabe al
  // compilar y la llamada puede ir derecha, igual que a una global atada, sin
  // tabla ninguna: el objeto es la propia variable. Si alguien la reasigna
  // —aunque sea a otra función— se cae al camino de siempre, porque entonces
  // no se puede prometer ni el prototipo ni la aridad.
  const fnsLocales = new Map();
  {
    const reasignadas = new Set();
    (function mirar(nodo, dentro) {
      if (!nodo || typeof nodo !== 'object') return;
      if (Array.isArray(nodo)) { for (const x of nodo) mirar(x, dentro); return; }
      if (nodo.tipo === 'DeclFuncion' || nodo.tipo === 'FuncionAnon') {
        if (nodo.tipo === 'DeclFuncion' && !dentro && nodo.proto) {
          // Dos «fn» con el mismo nombre en la misma función: no se promete nada.
          if (fnsLocales.has(nodo.nombre)) reasignadas.add(nodo.nombre);
          else fnsLocales.set(nodo.nombre, nodo.proto);
        }
        mirar(nodo.cuerpo, true);
        return;
      }
      if (nodo.tipo === 'Asignacion' && nodo.destino && nodo.destino.tipo === 'Variable')
        reasignadas.add(nodo.destino.nombre);
      if (nodo.tipo === 'DeclVar') reasignadas.add(nodo.nombre);
      if (nodo.tipo === 'Para') reasignadas.add(nodo.nombre);
      for (const k in nodo) if (k !== 'proto' && k !== 'ups') mirar(nodo[k], dentro);
    })(ast.cuerpo, false);
    for (const n of reasignadas) fnsLocales.delete(n);
    for (const p of ast.params) fnsLocales.delete(p.nombre);
  }

  // Leer y escribir un nombre, sabiendo si es caja, captura o global.
  const enCaja = n => cajas.has(n) && declarada(n);
  const leerVar = n => {
    if (declarada(n)) return enCaja(n) ? `${jsNom(n)}.valor` : jsNom(n);
    if (upIndice.has(n)) return `rt.gu(this[${upIndice.get(n)}])`;
    return `rt.g(${JSON.stringify(gl(n))})`;
  };
  const escribirVar = (n, v) => {
    if (declarada(n)) return enCaja(n) ? `(${jsNom(n)}.valor = ${v})` : `(${jsNom(n)} = ${v})`;
    if (upIndice.has(n)) return `rt.su(this[${upIndice.get(n)}], ${v})`;
    return `rt.sg(${JSON.stringify(gl(n))}, ${v})`;
  };
  const envolver = (n, v) => (cajas.has(n) ? `rt.caja(${v})` : v);
  let bail = false;
  const rendirse = () => { bail = true; return 'null'; };

  // Las nativas que se atan: se resuelven UNA vez, aquí, y dentro del código
  // generado son «nt[i]». Solo se atan las que ya están en el mapa de globales
  // al compilar, son nativas de verdad, y tienen aridad fija que cuadra con la
  // llamada: si la aridad es variable, la nativa cuenta sus argumentos y no se
  // puede saltar la comprobación.
  // Los prototipos de las funciones anidadas, atados igual que las nativas:
  // dentro del código generado son «pr[i]».
  const protos = [];
  const atarProto = pr => { const i = protos.length; protos.push(pr); return i; };
  // Los cierres de funciones de Ñ que se llaman por su nombre global. Se atan
  // igual que las nativas —dentro del código generado son «cf[i]»— y por el
  // mismo motivo: lo caro de una llamada no es armar el array de argumentos,
  // que V8 deshace solo, sino buscar el nombre en el mapa de globales cada vez.
  const cierres = [];
  const iCierre = new Map();
  function atarCierre(nombre, nArgs) {
    if (!vm) return -1;
    const g = vm.globals.get(nombre);
    if (!(g instanceof ObjCierre)) return -1;
    // Sin AST no se compila nunca (bytecode de disco), así que atarlo no
    // ahorraría nada y sí añadiría un global a la lista de invalidación.
    if (!g.fn || !g.fn.ast || g.fn.deDisco) return -1;
    // La aridad se comprueba AQUÍ, una vez, y por eso el camino rápido puede
    // saltarse la comprobación por llamada. Si no cuadra, no se ata y el
    // camino normal da el error de siempre.
    if (g.fn.aridad !== nArgs) return -1;
    if (iCierre.has(nombre)) return iCierre.get(nombre);
    const i = cierres.length;
    cierres.push({ nombre, cl: g });
    iCierre.set(nombre, i);
    return i;
  }
  const nativas = [];
  const iNativa = new Map();
  function atar(nombre, nArgs) {
    if (!vm) return -1;
    const g = vm.globals.get(nombre);
    if (!(g instanceof ObjNativa)) return -1;
    if (g.aridad < 0 || g.aridad !== nArgs) return -1;
    if (iNativa.has(nombre)) return iNativa.get(nombre);
    const i = nativas.length;
    nativas.push({ nombre, nat: g });
    iNativa.set(nombre, i);
    return i;
  }

  function bloque(b, ind) {
    locales.push(new Set());
    const s = b.cuerpo.map(x => sent(x, ind)).join('\n');
    locales.pop();
    return s;
  }

  function sent(n, ind) {
    const t = ' '.repeat(ind);
    switch (n.tipo) {
      case 'DeclVar': {
        const v = n.valor ? ex(n.valor) : 'null';
        locales[locales.length - 1].add(n.nombre);
        return `${t}let ${jsNom(n.nombre)} = ${envolver(n.nombre, v)};`;
      }
      case 'ExprSent': return `${t}${ex(n.expr)};`;
      case 'Devolver': return `${t}return ${n.valor ? ex(n.valor) : 'null'};`;
      case 'Si': {
        let s = `${t}if (${verdadJS(ex(n.cond))}) {\n${sent(n.entonces, ind + 2)}\n${t}}`;
        if (n.sino) s += ` else {\n${sent(n.sino, ind + 2)}\n${t}}`;
        return s;
      }
      case 'Bloque': return `${t}{\n${bloque(n, ind + 2)}\n${t}}`;
      // Cada bucle traducido cuenta sus vueltas en una variable local —un
      // registro, no una propiedad— y solo avisa a la VM cada 1024.
      case 'Mientras': {
        const c = '_c$' + (nTmp++);
        return `${t}let ${c} = 0;\n${t}while (${verdadJS(ex(n.cond))}) {\n` +
               `${t}  if ((${c} = ${c} + 1 | 0) > 1023) { ${c} = 0; rt.tic(1024); }\n` +
               `${sent(n.cuerpo, ind + 2)}\n${t}}`;
      }
      case 'Repetir': {
        const i = '_i$' + (nTmp++), lim = '_n$' + (nTmp++), c = '_c$' + (nTmp++);
        return `${t}let ${lim} = ${ex(n.cuantas)}, ${c} = 0;\n` +
               `${t}for (let ${i} = 0; ${i} < ${lim}; ${i}++) {\n` +
               `${t}  if ((${c} = ${c} + 1 | 0) > 1023) { ${c} = 0; rt.tic(1024); }\n` +
               `${sent(n.cuerpo, ind + 2)}\n${t}}`;
      }
      case 'Para': {
        const it = '_it$' + (nTmp++), i = '_i$' + (nTmp++);
        locales.push(new Set([n.nombre]));
        const cuerpo = n.cuerpo.cuerpo.map(x => sent(x, ind + 2)).join('\n');
        locales.pop();
        const c = '_c$' + (nTmp++);
        return `${t}let ${it} = ${ex(n.iterable)}, ${c} = 0;\n` +
               `${t}for (let ${i} = 0, _l = rt.len(${it}); ${i} < _l; ${i}++) {\n` +
               `${t}  if ((${c} = ${c} + 1 | 0) > 1023) { ${c} = 0; rt.tic(1024); }\n` +
               `${t}  let ${jsNom(n.nombre)} = ${envolver(n.nombre, `rt.idxg(${it}, ${i})`)};\n${cuerpo}\n${t}}`;
      }
      case 'Romper': return `${t}break;`;
      case 'Continuar': return `${t}continue;`;
      // Una función declarada dentro de otra. Lo que hacía antes era rendirse
      // —y con ella se perdía la compilación de la función de FUERA, aunque la
      // de dentro no capturara nada y no se llamara nunca: 509 ms contra 57 en
      // el mismo bucle—. Si no captura, crear el cierre es un objeto nuevo y
      // ya está, así que se emite. Si captura, por ahora sí se rinde.
      case 'DeclFuncion': {
        // El nombre se declara ANTES de armar el cierre, porque una función
        // recursiva anidada se captura a sí misma: la caja tiene que existir
        // para poder metérsela, y se rellena justo después.
        locales[locales.length - 1].add(n.nombre);
        if (cajas.has(n.nombre)) {
          const e = cierreDe(n);
          if (e === null) return rendirse();
          return `${t}let ${jsNom(n.nombre)} = rt.caja(null);\n${t}${jsNom(n.nombre)}.valor = ${e};`;
        }
        const e = cierreDe(n);
        if (e === null) return rendirse();
        return `${t}let ${jsNom(n.nombre)} = ${e};`;
      }
      default: return rendirse();
    }
  }

  function verdadJS(e) { const t = tmp(); return `(typeof (${t}=${e}) === 'boolean' ? ${t} : rt.verdad(${t}))`; }

  function ex(n) {
    if (bail) return 'null';
    switch (n.tipo) {
      case 'Literal':
        if (n.valor === null) return 'null';
        if (typeof n.valor === 'string') return JSON.stringify(n.valor);
        return String(n.valor);
      case 'Interpolacion': return `rt.cat([${n.partes.map(ex).join(',')}])`;
      case 'Variable': return leerVar(n.nombre);
      case 'Asignacion': {
        if (n.op !== '=') {
          const b = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' }[n.op];
          return ex({ tipo: 'Asignacion', destino: n.destino, op: '=', valor: { tipo: 'Binario', op: b, izq: n.destino, der: n.valor } });
        }
        const d = n.destino;
        if (d.tipo === 'Variable') return escribirVar(d.nombre, ex(n.valor));
        if (d.tipo === 'Indice') return `rt.idxs(${ex(d.obj)}, ${ex(d.indice)}, ${ex(n.valor)})`;
        if (d.tipo === 'Propiedad') return `rt.idxs(${ex(d.obj)}, ${JSON.stringify(d.nombre)}, ${ex(n.valor)})`;
        return rendirse();
      }
      case 'Unario': return n.op === '-' ? `rt.neg(${ex(n.expr)})` : `(!rt.verdad(${ex(n.expr)}))`;
      case 'Binario': {
        const a = () => ex(n.izq), b = () => ex(n.der);
        if (n.op === 'y') { const t = tmp(); return `(rt.verdad(${t}=${a()}) ? ${b()} : ${t})`; }
        if (n.op === 'o') { const t = tmp(); return `(rt.verdad(${t}=${a()}) ? ${t} : ${b()})`; }
        // Camino rápido: si los dos operandos son números, se opera en JavaScript
        // puro; si no, se delega en el mismo código que usa el intérprete, para
        // que JIT e intérprete den exactamente el mismo resultado y el mismo error.
        const RAPIDO = { '-': 'sub', '*': 'mul', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
        const JS = { '-': '-', '*': '*', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
        // Los dos operandos se evalúan ANTES de mirar sus tipos. Si la prueba
        // de tipo se escribe dentro del «&&», el cortocircuito se salta la
        // asignación del segundo en cuanto el primero no es número: el camino
        // lento recibía «undefined» y, según el caso, daba un error falso, un
        // resultado equivocado sin avisar, o se comía los efectos del segundo
        // operando. Eso solo pasaba después de la novena llamada, que es cuando
        // entra el JIT.
        if (RAPIDO[n.op]) {
          const x = tmp(), y = tmp();
          return `((${x}=${a()}, ${y}=${b()}, typeof ${x} === 'number' && typeof ${y} === 'number') ` +
                 `? ${x} ${JS[n.op]} ${y} : rt.${RAPIDO[n.op]}(${x}, ${y}))`;
        }
        if (n.op === '+') {
          const x = tmp(), y = tmp();
          return `((${x}=${a()}, ${y}=${b()}, typeof ${x} === 'number' && typeof ${y} === 'number') ` +
                 `? ${x} + ${y} : rt.add(${x}, ${y}))`;
        }
        switch (n.op) {
          case '/': return `rt.div(${a()}, ${b()})`;
          case '//': return `rt.idiv(${a()}, ${b()})`;
          case '%': return `rt.mod(${a()}, ${b()})`;
          case '**': return `rt.pow(${a()}, ${b()})`;
          case '==': { const x = tmp(), y = tmp();
            return `((${x}=${a()}, ${y}=${b()}, typeof ${x} === 'number' && typeof ${y} === 'number') ? ${x} === ${y} : rt.eq(${x}, ${y}))`; }
          case '!=': { const x = tmp(), y = tmp();
            return `((${x}=${a()}, ${y}=${b()}, typeof ${x} === 'number' && typeof ${y} === 'number') ? ${x} !== ${y} : !rt.eq(${x}, ${y}))`; }
          default: return rendirse();
        }
      }
      case 'Llamada': {
        // Si el destino es un global que AL COMPILAR es una nativa de aridad
        // fija, se llama derecho. Es la diferencia entre 34 ms y 2,7 por dos
        // millones de llamadas, y lo caro que se evita no es crear el array de
        // argumentos —eso V8 lo deshace solo— sino buscar el nombre en el mapa
        // de globales en cada llamada.
        // Una función declarada con «fn» en esta misma función.
        if (n.callee.tipo === 'Variable' && declarada(n.callee.nombre) &&
            n.args.length <= 4 && fnsLocales.has(n.callee.nombre) &&
            fnsLocales.get(n.callee.nombre).aridad === n.args.length) {
          const v = leerVar(n.callee.nombre);
          const as = n.args.map(ex);
          return `(${v}.fn.jit !== null` +
                 ` ? rt.ya${n.args.length}(${v}${as.length ? ',' + as.join(',') : ''})` +
                 ` : rt.call(${v}, [${as.join(',')}]))`;
        }
        if (n.callee.tipo === 'Variable' && !declarada(n.callee.nombre)) {
          const i = atar(gl(n.callee.nombre), n.args.length);
          if (i >= 0) return `nt[${i}]([${n.args.map(ex).join(',')}], rt.vm)`;
          // Una función de Ñ llamada por su nombre global. El guardia se mira en
          // cada llamada a propósito: cuando se compila ESTA función, la llamada
          // puede no estar compilada todavía —le faltan llamadas para el
          // umbral— y «olvidarJIT» puede deshacerla después. Con el guardia las
          // dos cosas se arreglan solas: mientras no haya código se va por el
          // camino de siempre, y en cuanto lo hay se va derecho.
          const j = n.args.length <= 4 ? atarCierre(gl(n.callee.nombre), n.args.length) : -1;
          if (j >= 0) {
            // Los argumentos aparecen dos veces en el TEXTO y una sola en la
            // ejecución: de un condicional solo se evalúa la rama que se toma.
            // Por eso no hace falta ninguna variable temporal.
            const as = n.args.map(ex);
            return `(cf[${j}].fn.jit !== null` +
                   ` ? rt.ya${n.args.length}(cf[${j}]${as.length ? ',' + as.join(',') : ''})` +
                   ` : rt.call(cf[${j}], [${as.join(',')}]))`;
          }
        }
        return `rt.call(${ex(n.callee)}, [${n.args.map(ex).join(',')}])`;
      }
      case 'Indice': return `rt.idxg(${ex(n.obj)}, ${ex(n.indice)})`;
      case 'Propiedad': {
        // «m.algo» con m alias de módulo es un global, igual que en el bytecode.
        const g = (n.obj.tipo === 'Variable' && !declarada(n.obj.nombre))
          ? miembroDeEnlace(enl, n.obj.nombre, n.nombre) : null;
        if (g) return `rt.g(${JSON.stringify(g)})`;
        return `rt.idxg(${ex(n.obj)}, ${JSON.stringify(n.nombre)})`;
      }
      case 'ListaLit': return `rt.lista([${n.items.map(ex).join(',')}])`;
      case 'DicLit': return `rt.dic([${n.pares.map(p => `[${ex(p.clave)},${ex(p.valor)}]`).join(',')}])`;
      case 'FuncionAnon': {
        const e = cierreDe(n);
        return e === null ? rendirse() : e;
      }
      default: return rendirse();
    }
  }

  // El código que crea el cierre de una función anidada, o null si todavía no
  // se sabe hacer. Hoy solo las que no capturan nada.
  function cierreDe(n) {
    if (!n.proto || !n.ups) return null;    // el compilador no pasó por aquí
    const capturas = [];
    for (const u of n.ups) {
      if (!u.nombre) return null;
      if (u.esLocal) {
        // Una local de esta función: se le pasa la caja, la misma que usa esta
        // función. Si no está declarada o no es caja, algo no cuadra entre el
        // compilador y esto, y más vale quedarse en el intérprete que adivinar.
        if (!enCaja(u.nombre)) return null;
        capturas.push(jsNom(u.nombre));
      } else {
        // Algo que esta función también tenía capturado: se reenvía su upvalue.
        if (!upIndice.has(u.nombre)) return null;
        capturas.push(`this[${upIndice.get(u.nombre)}]`);
      }
    }
    return `rt.cierre(pr[${atarProto(n.proto)}], [${capturas.join(',')}])`;
  }

  const cuerpo = ast.cuerpo.cuerpo.map(s => sent(s, 2)).join('\n');
  if (bail) return null;
  // Las capturas llegan como el «this» de la función, no como un argumento más.
  // Con un argumento había que alargar el array en CADA llamada —un
  // «args.concat» por llamada— y eso se comía la ganancia justo en el caso que
  // más se usa: un callback de «mapear» sobre doscientos mil datos pasaba de 53
  // a 60 ms, peor que el intérprete. Como «this» no se asigna nada. El código
  // generado no contiene ninguna función de JavaScript por dentro —una anidada
  // de Ñ es un rt.cierre, no una función inline— así que «this» no se pierde.
  const params = ast.params.map(p => jsNom(p.nombre)).join(', ');
  // Un parámetro capturado se mete en su caja al entrar. Se puede reasignar el
  // propio parámetro, que en JavaScript es una variable como cualquier otra.
  const encajar = ast.params.filter(p => cajas.has(p.nombre))
    .map(p => `  ${jsNom(p.nombre)} = rt.caja(${jsNom(p.nombre)});\n`).join('');
  const decl = temps.length ? `  let ${temps.join(', ')};\n` : '';
  return { nativas, protos, cierres,
    src: `(function ${jsNom(fn.nombre === '<anónima>' ? 'anon' : fn.nombre)}(${params}) {\n${encajar}${decl}${cuerpo}\n  return null;\n})` };
}


// ============================================================================
//  ESPAÑOL-LIKE v4 — Biblioteca estándar y fachada del motor
//  Parte 4 de 4.
// ============================================================================

function instalarBiblioteca(vm, host) {
  host = host || {};
  vm.edsls = new Map();          // nombre del eDSL → { nombre, clave, exporta }
  vm.edslPorClave = new Map();   // clave          → el mismo registro
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  // Los validadores viven en la VM, no aquí: la biblioteca y los eDSL tienen que
  // dar el MISMO mensaje cuando un argumento no es del tipo que toca.
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);
  const nums = (v, n, f) => vm.exigeNums(v, n, f);
  const def = (n, fir, fn, doc) => vm.definirNativa(n, fir, fn, doc);
  // El área a la que pertenece lo que se declara a partir de aquí. La usa la
  // página de referencia para agrupar, y antes la adivinaba leyendo estos
  // comentarios con una expresión regular: cualquier ayudante nuevo hacía
  // desaparecer funciones del catálogo. Ahora la sección viaja con el nombre.
  const seccion = s => { vm.seccionActual = s; };

  // ------------------------------------------------------------------ núcleo
  seccion('núcleo');
  def('imprimir', '... -> nulo', (a) => { vm.salida(a.map(x => repr(x, 0)).join(' ')); return null; }, 'imprime valores en la consola');
  def('texto', 'cualquiera -> texto', (a) => repr(a[0], 1) === 'nulo' && a[0] === null ? 'nulo' : (typeof a[0] === 'string' ? a[0] : repr(a[0], 1)), 'convierte cualquier valor a texto');
  def('entero', 'cualquiera -> entero', (a) => {
    const v = a[0];
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = parseInt(v.trim(), 10); if (Number.isNaN(n)) vm.error(`«entero»: «${v}» no es un número`); return n; }
    vm.error(`«entero»: no se puede convertir ${tipoDe(v)}`);
  }, 'convierte a número entero');
  def('real', 'cualquiera -> real', (a) => {
    const v = a[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = parseFloat(v.trim()); if (Number.isNaN(n)) vm.error(`«real»: «${v}» no es un número`); return n; }
    vm.error(`«real»: no se puede convertir ${tipoDe(v)}`);
  }, 'convierte a número con decimales');
  def('bool', 'cualquiera -> bool', (a) => verdad(a[0]), 'convierte a verdadero/falso');
  def('tipo', 'cualquiera -> texto', (a) => tipoDe(a[0]), 'devuelve el nombre del tipo');
  def('longitud', 'cualquiera -> entero', (a) => vm.longitud(a[0]), 'longitud de un texto, lista o diccionario');
  def('rango', '... -> lista<entero>', (a) => {
    let ini = 0, fin = 0, paso = 1;
    if (a.length === 1) fin = num(a[0], 1, 'rango');
    else if (a.length === 2) { ini = num(a[0], 1, 'rango'); fin = num(a[1], 2, 'rango'); }
    else if (a.length === 3) { ini = num(a[0], 1, 'rango'); fin = num(a[1], 2, 'rango'); paso = num(a[2], 3, 'rango'); }
    else vm.error('«rango» acepta 1, 2 o 3 argumentos');
    if (paso === 0) vm.error('«rango»: el paso no puede ser 0');
    // La cuenta se hace ANTES de construir nada. Estaba después, así que
    // «rango(1000000000)» intentaba primero llenar la lista y salía por un
    // error de JavaScript en crudo —«Invalid array length»— en vez de por el
    // mensaje de Ñ que había justo debajo.
    const cuantos = Math.max(0, Math.ceil((fin - ini) / paso));
    if (cuantos > 5e6)
      vm.error(`«rango» generaría ${cuantos.toLocaleString('es')} elementos y el tope son 5 millones`,
        'si solo quieres contar, usa «repetir n { … }», que no construye la lista');
    const out = new Array(cuantos);
    let n = 0;
    if (paso > 0) for (let i = ini; i < fin; i += paso) out[n++] = i;
    else for (let i = ini; i > fin; i += paso) out[n++] = i;
    out.length = n;
    return L(out);
  }, 'rango(n) · rango(ini,fin) · rango(ini,fin,paso)');
  def('afirmar', '... -> nulo', (a) => {
    if (!verdad(a[0])) vm.error(a.length > 1 ? repr(a[1], 0) : 'la afirmación resultó falsa');
    return null;
  }, 'afirmar(cond, mensaje)');

  // ------------------------------------------------------------ matemáticas
  seccion('constantes');
  // Las constantes del lenguaje, con el sigilo «|». Están SIEMPRE, sin «usar»:
  // como un programa no puede declarar un nombre con «|», no hay nada que
  // tapar ni con qué confundirlas, así que no ensucian el ámbito de nadie.
  //
  // «E» a secas era lo que había antes, y era un accidente esperando: «var E:
  // real = 5» lo tapaba en silencio y el número de Euler pasaba a ser 5.
  vm.definirValor('|PI', Math.PI, 'real');
  vm.definirValor('|E', Math.E, 'real');
  vm.definirValor('|INFINITO', Infinity, 'real');
  // ------------------------------------------------------------------ núcleo
  // «maximo» y «minimo» NO se mudan a «numerico»: comparan números, texto y
  // fechas por igual, así que son genéricos como «contiene» y «longitud».
  seccion('núcleo');
  // Lo que se puede ordenar: todo números, todo texto o todo fechas. Mezclar no,
  // porque «maximo([1, "a"])» no tiene una respuesta correcta. Antes solo
  // aceptaba números en la forma de lista pero sí comparaba fechas en la forma
  // de argumentos sueltos, y esa diferencia no la esperaría nadie.
  const ordenables = (v, f) => {
    const l = lst(v, 1, f);
    const t = l.items.length ? tipoDe(l.items[0]) : 'entero';
    const clase = x => (typeof x === 'number' ? 'num' : typeof x === 'string' ? 'texto' : tipoDe(x));
    const c0 = clase(l.items[0]);
    for (const x of l.items) if (clase(x) !== c0 || !['num', 'texto', 'fecha'].includes(clase(x)))
      vm.error(`«${f}»: la lista tiene que ser toda de números, toda de texto o toda de fechas`);
    return l.items;
  };
  // Con un arreglo, reducen todo y dan un número; con un eje, dan un arreglo con
  // ese eje quitado. Es la misma forma que tienen todas las reducciones de
  // NumPy, y la razón de que «maximo(m, 0)» signifique «el máximo de cada
  // columna» sin que haya que escribir un bucle.
  const reduceArr = (quien, mejor) => (a) => {
    const x = a[0];
    if (!(x instanceof ObjArreglo)) return null;
    if (x.tamano === 0) vm.error(`«${quien}» de un arreglo vacío`);
    const eje = a.length > 1 ? a[1] : null;
    return vm.arrReducir(x, eje, null, (acc, v) => (acc === null || mejor(v, acc) ? v : acc), null,
      x.tipo === 'entero' ? 'entero' : 'real');
  };
  const maxArr = reduceArr('maximo', (v, acc) => v > acc);
  const minArr = reduceArr('minimo', (v, acc) => v < acc);
  def('maximo', '... -> cualquiera', a => {
    const r = maxArr(a);
    if (r !== null) return r;
    const xs = a.length === 1 && a[0] instanceof ObjLista ? ordenables(a[0], 'maximo') : a;
    if (!xs.length) vm.error('«maximo» de una lista vacía');
    return xs.reduce((p, c) => (c > p ? c : p));
  });
  def('minimo', '... -> cualquiera', a => {
    const r = minArr(a);
    if (r !== null) return r;
    const xs = a.length === 1 && a[0] instanceof ObjLista ? ordenables(a[0], 'minimo') : a;
    if (!xs.length) vm.error('«minimo» de una lista vacía');
    return xs.reduce((p, c) => (c < p ? c : p));
  });

  // ------------------------------------------------------------------ texto
  // Las diez funciones de texto se mudaron al eDSL «texto» (src/10). Aquí se
  // queda solo «contiene», que no es de texto: vale igual para una lista y
  // para un diccionario, así que es del núcleo.
  seccion('núcleo');
  def('contiene', 'cualquiera, cualquiera -> bool', a => vm.contiene(a[0], a[1], 'contiene'),
    'contiene(coleccion, valor) — en un texto, una lista o las claves de un diccionario');

  // ----------------------------------------------------------------- listas
  seccion('listas');
  def('agregar', '... -> lista', a => { const l = lst(a[0], 1, 'agregar'); for (let i = 1; i < a.length; i++) l.items.push(a[i]); return l; });
  def('quitar', 'lista, cualquiera -> lista', a => {
    const l = lst(a[0], 1, 'quitar');
    const i = l.items.findIndex(x => iguales(x, a[1]));
    if (i < 0) vm.error(`«quitar»: ${repr(a[1], 1)} no está en la lista`);
    l.items.splice(i, 1); return l;
  });
  def('quitarEn', 'lista, entero -> cualquiera', a => { const l = lst(a[0], 1, 'quitarEn'); const i = num(a[1], 2, 'quitarEn'); if (i < 0 || i >= l.items.length) vm.error(`«quitarEn»: índice ${i} fuera de rango`); return l.items.splice(i, 1)[0]; });
  def('insertar', 'lista, entero, cualquiera -> lista', a => { const l = lst(a[0], 1, 'insertar'); l.items.splice(num(a[1], 2, 'insertar'), 0, a[2]); return l; });
  def('indice', 'lista, cualquiera -> entero', a => lst(a[0], 1, 'indice').items.findIndex(x => iguales(x, a[1])));
  def('contar', 'lista, cualquiera -> entero', a => lst(a[0], 1, 'contar').items.filter(x => iguales(x, a[1])).length);
  def('invertir', 'lista -> lista', a => L(lst(a[0], 1, 'invertir').items.slice().reverse()));
  def('copiar', 'cualquiera -> cualquiera', a => {
    const v = a[0];
    if (v instanceof ObjLista) return L(v.items.slice());
    if (v instanceof ObjDic) { const d = D(); for (const [k, x] of v.mapa) d.mapa.set(k, x); return d; }
    return v;
  });
  def('ordenar', '... -> lista', a => {
    const l = lst(a[0], 1, 'ordenar');
    vm.cobrar(l.items.length * (Math.log2(l.items.length + 2) | 0) + 1);
    const copia = l.items.slice();
    if (a.length > 1) {
      const f = a[1];
      copia.sort((x, y) => { const kx = vm.invocar(f, [x]), ky = vm.invocar(f, [y]); return kx < ky ? -1 : kx > ky ? 1 : 0; });
    } else copia.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return L(copia);
  }, 'ordenar(lista) · ordenar(lista, clave)');
  def('mapear', 'lista, funcion -> lista', a => L(lst(a[0], 1, 'mapear').items.map(x => vm.invocar(a[1], [x]))), 'mapear(lista, funcion)');
  def('filtrar', 'lista, funcion -> lista', a => L(lst(a[0], 1, 'filtrar').items.filter(x => verdad(vm.invocar(a[1], [x])))), 'filtrar(lista, funcion)');
  def('reducir', 'lista, funcion, cualquiera -> cualquiera', a => lst(a[0], 1, 'reducir').items.reduce((acc, x) => vm.invocar(a[1], [acc, x]), a[2]), 'reducir(lista, funcion, inicial)');
  def('rebanar', '... -> lista', a => {
    const l = lst(a[0], 1, 'rebanar');
    const i = a.length > 1 ? num(a[1], 2, 'rebanar') : 0;
    const j = a.length > 2 ? num(a[2], 3, 'rebanar') : l.items.length;
    return L(l.items.slice(i, j));
  }, 'rebanar(lista, desde, hasta)');
  def('aplanar', 'lista -> lista', a => {
    const out = [];
    const rec = xs => { for (const x of xs) x instanceof ObjLista ? rec(x.items) : out.push(x); };
    rec(lst(a[0], 1, 'aplanar').items);
    return L(out);
  });

  // ---------------------------------------------------------- diccionarios
  seccion('diccionarios');
  def('claves', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«claves» necesita un diccionario'); return L([...d.mapa.keys()]); });
  def('valores', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«valores» necesita un diccionario'); return L([...d.mapa.values()]); });
  // Esta firma decía «-> estilo», y no era un despiste: «pares» estaba MUERTO.
  // El «pares» de los estilos —&:nth-child(even)— se definía después y lo
  // sobrescribía, así que pares({…}) devolvía un estilo vacío sin quejarse de
  // nada. Al mudarse los estilos a su eDSL, este volvió a existir.
  def('pares', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«pares» necesita un diccionario'); return L([...d.mapa.entries()].map(([k, v]) => L([k, v]))); }, 'pares(dic) — una lista de [clave, valor]');
  def('obtener', 'cualquiera, cualquiera, cualquiera -> cualquiera', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«obtener» necesita un diccionario'); return d.mapa.has(a[1]) ? d.mapa.get(a[1]) : a[2]; }, 'obtener(dic, clave, pordefecto)');
  def('borrar', 'cualquiera, cualquiera -> cualquiera', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«borrar» necesita un diccionario'); d.mapa.delete(a[1]); return d; });

  // ================================================== CÁLCULO CIENTÍFICO
  seccion('gráficos');
  const g = host.grafico || {};
  // Sin anfitrión, dibujar no hacía nada y no lo decía: el programa creía haber
  // pintado y no había pintado. Un fallo silencioso es peor que uno ruidoso,
  // sobre todo para quien está aprendiendo el lenguaje.
  const sinLienzo = quien => vm.error(`«${quien}» necesita un anfitrión con lienzo`,
    'el lienzo existe en el IDE y en una aplicación exportada; en la consola no hay dónde dibujar');
  const gfx = (n, fir, f, doc) => def(n, fir, (args) => {
    if (!g[n]) sinLienzo(n);
    return g[n].apply(null, args) ?? null;
  }, doc);
  def('lienzo', '... -> nulo', a => {
    if (!g.lienzo) sinLienzo('lienzo');
    g.lienzo(a[0] || 640, a[1] || 400);
    return null;
  }, 'lienzo(ancho, alto) — prepara el área de dibujo');
  gfx('limpiar', '... -> nulo', null, 'borra el lienzo');
  gfx('color', '... -> nulo', null, 'color(r,g,b) o color("#ff0000")');
  gfx('grosor', 'real -> nulo', null, 'grosor de la línea');
  gfx('linea', 'real, real, real, real -> nulo', null, 'linea(x1,y1,x2,y2)');
  gfx('rect', '... -> nulo', null, 'rect(x,y,ancho,alto,relleno?)');
  gfx('circulo', '... -> nulo', null, 'circulo(x,y,radio,relleno?)');
  gfx('punto', 'real, real -> nulo', null, 'punto(x,y)');
  gfx('escribirEn', 'real, real, texto -> nulo', null, 'escribirEn(x,y,texto)');
  def('graficar', '... -> nulo', a => {
    if (!g.graficar) sinLienzo('graficar');
    const xs = a[0] instanceof ObjLista ? a[0].items : [];
    const ys = a[1] instanceof ObjLista ? a[1].items : null;
    g.graficar(ys ? xs : xs.map((_, i) => i), ys || xs, a[2] || null);
    return null;
  }, 'graficar(ys) · graficar(xs, ys, titulo)');
  def('barras', '... -> nulo', a => {
    if (!g.barras) sinLienzo('barras');
    const vals = a[0] instanceof ObjLista ? a[0].items : [];
    const etiq = a[1] instanceof ObjLista ? a[1].items : null;
    g.barras(vals, etiq, a[2] || null);
    return null;
  }, 'barras(valores, etiquetas, titulo)');
  def('dispersion', '... -> nulo', a => {
    if (!g.dispersion) sinLienzo('dispersion');
    g.dispersion((a[0] || { items: [] }).items, (a[1] || { items: [] }).items, a[2] || null);
    return null;
  }, 'dispersion(xs, ys, titulo)');

  // ================================================== WEB — árbol de nodos
  seccion('web');
  // El DSL es jerárquico y por valores: etiqueta(), boton(), entrada(), tabla()
  // y crudo() no pintan nada, construyen un nodo. Los nodos se anidan unos
  // dentro de otros y se guardan en variables como cualquier otro valor, y
  // pintar() es el único que toca la página.
  //
  // El texto que entra por aquí se pinta como texto, siempre: el anfitrión
  // crea nodos de texto de verdad, así que un dato que contenga «<b>» se ve
  // con sus signos y no se convierte en marcado. Para meter HTML a propósito
  // está crudo(), que es la puerta explícita y se nota al leer el programa.
  const w = host.web || {};
  // Lo mismo que el lienzo: pintar sin anfitrión no hacía nada y se quedaba
  // callado. Ahora lo dice, y dice dónde sí funciona.
  const sinPagina = quien => vm.error(`«${quien}» necesita un anfitrión con página`,
    'la página existe en el IDE y en una aplicación exportada; en la consola no hay dónde pintar');
  const ETIQ_OK = /^[a-zA-Z][a-zA-Z0-9-]*$/;
  const ATRIB_OK = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
  // Sin hijos posibles: darles contenido sería un error silencioso.
  const VACIAS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  // Estas no son contenido: su interior no sigue las reglas del texto HTML y
  // escaparlo no significa nada. Quien las quiera, que pase por crudo().
  const NO_CONTENIDO = new Set(['script', 'style', 'iframe', 'object', 'embed', 'base', 'template']);
  const MAX_PROF = 200;

  // Los eventos que un nodo puede escuchar. La lista es blanca a propósito: el
  // atributo «on…» sigue prohibido, así que la única forma de que corra código
  // por una interacción es pasar una función de Ñ por aquí, y el anfitrión sabe
  // exactamente qué está conectando.
  const EVENTOS = {
    alHacerClic: 'click', alDobleClic: 'dblclick',
    alCambiar: 'change', alEscribir: 'input', alEnviar: 'submit',
    alEnfocar: 'focus', alDesenfocar: 'blur',
    alPulsarTecla: 'keydown', alSoltarTecla: 'keyup',
    alEntrar: 'mouseenter', alSalir: 'mouseleave',
  };
  // Nombres de atributo en español. Es el mismo trato que en el sistema de
  // estilo: lo que tiene nombre se traduce, y lo que no, pasa con su nombre de
  // HTML. Así «tipo» y «valor» funcionan sin tener que saber inglés, pero
  // «colspan» tampoco deja de funcionar.
  const ATRIBS = {
    clase: 'class', tipo: 'type', valor: 'value', nombre: 'name', pista: 'placeholder',
    titulo: 'title', destino: 'href', fuente: 'src', descripcion: 'alt', idioma: 'lang',
    marcada: 'checked', seleccionada: 'selected', deshabilitado: 'disabled',
    requerido: 'required', soloLectura: 'readonly', multiple: 'multiple', oculto: 'hidden',
    ancho: 'width', alto: 'height', filas: 'rows', columnas: 'cols',
    maximo: 'max', minimo: 'min', paso: 'step', largoMax: 'maxlength',
    objetivo: 'target', relacion: 'rel', accion: 'action', metodo: 'method',
    autocompletar: 'autocomplete', autofoco: 'autofocus', rotulo: 'aria-label',
  };
  // Atributos que son presencia, no valor: o están o no están.
  const BOOLEANOS = new Set(['checked', 'selected', 'disabled', 'required', 'readonly',
    'multiple', 'hidden', 'autofocus', 'open', 'loop', 'muted', 'controls', 'novalidate']);

  const esNodo = v => v instanceof ObjNodo;

  function nodoTexto(v) {
    const n = vm.nuevoNodo('texto');
    n.valor = repr(v, 0);
    return n;
  }
  // Convierte lo que venga en hijos: un nodo se queda, una lista se aplana,
  // y cualquier otro valor se vuelve texto.
  function comoHijos(v, fuera, prof) {
    if (esNodo(v)) { fuera.push(v); return; }
    if (v instanceof ObjLista) {
      if ((prof || 0) > 8) vm.error('«etiqueta»: listas de hijos anidadas demasiado hondo');
      for (const x of v.items) comoHijos(x, fuera, (prof || 0) + 1);
      return;
    }
    if (v instanceof ObjEstilo) {
      vm.error('un estilo no es contenido: pásalo a etiqueta(), no lo metas entre los hijos',
        'etiqueta("div", miEstilo, …)');
    }
    if (v === null) return;   // un nulo no pinta nada: deja escribir condicionales
    fuera.push(nodoTexto(v));
  }

  // Lee un diccionario sobre un nodo. De aquí salen tres cosas distintas y por
  // eso están juntas: los atributos, los eventos y las variables de CSS. La
  // clave «clave» no es ninguna de las tres: es la identidad del nodo.
  function aplicarDic(n, d, quien) {
    for (const [k, v] of d.mapa) {
      const bruto = String(k);
      if (bruto === 'clave') {
        if (v !== null) n.clave = repr(v, 0);
        continue;
      }
      if (EVENTOS[bruto] !== undefined) {
        if (v === null) { if (n.eventos) n.eventos.delete(EVENTOS[bruto]); continue; }
        if (!(v instanceof ObjCierre) && !(v instanceof ObjNativa))
          vm.error(`«${quien}»: «${bruto}» necesita una función y recibió ${tipoDe(v)}`);
        (n.eventos || (n.eventos = new Map())).set(EVENTOS[bruto], v);
        continue;
      }
      if (/^al[A-Z]/.test(bruto) && (v instanceof ObjCierre || v instanceof ObjNativa)) {
        vm.error(`«${quien}»: «${bruto}» no es un evento conocido`,
          'los eventos son ' + Object.keys(EVENTOS).join(', '));
      }
      if (bruto.startsWith('--')) {
        // Un valor que viene de los datos no debería fabricar una clase nueva
        // cada vez. Como variable de CSS viaja por el atributo «style» del
        // nodo y la clase, que es lo que se comparte, no cambia.
        (n.vars || (n.vars = new Map())).set(bruto, valorPropiedad(bruto, v));
        continue;
      }
      if (/^on/i.test(bruto)) vm.error(`«${quien}»: el atributo «${bruto}» pondría código en la página`,
        'los eventos se pasan como función: {alHacerClic: miFuncion}');
      const css = ATRIBS[bruto] || bruto;
      if (!ATRIB_OK.test(css)) vm.error(`«${quien}»: «${bruto}» no es un nombre de atributo válido`);
      const at = n.atrib || (n.atrib = new Map());
      // nulo quita el atributo; los booleanos lo ponen o lo quitan. Sin esto un
      // valor ausente se pinta como el texto «nulo», que es peor que nada.
      if (v === null || v === false) { at.delete(css); continue; }
      if (v === true) { at.set(css, ''); continue; }
      if (BOOLEANOS.has(css)) { at.set(css, ''); continue; }
      const valor = repr(v, 0);
      if (/^\s*javascript:/i.test(valor)) vm.error(`«${quien}»: «${bruto}» apunta a código, no a una dirección`);
      at.set(css, valor);
    }
  }

  // El barrido de argumentos que comparten todas las funciones de nodo: un
  // estilo es estilo, un diccionario son atributos —y se fusionan, no se
  // pintan—, una función es la acción principal. Lo demás lo decide quien llama.
  function extras(n, a, desde, quien, otros) {
    for (let i = desde; i < a.length; i++) {
      const x = a[i];
      if (x === null) continue;
      if (esEstilo(x)) { n.estilo = n.estilo ? fusionar([n.estilo, x], quien) : x; continue; }
      if (x instanceof ObjDic) { aplicarDic(n, x, quien); continue; }
      if (otros && otros(x, i)) continue;
      vm.error(`«${quien}» no sabe qué hacer con ${tipoDe(x)} en la posición ${i + 1}`);
    }
  }
  const esFn = v => v instanceof ObjCierre || v instanceof ObjNativa;

  def('etiqueta', '... -> nodo', a => {
    const nombre = txt(a[0], 1, 'etiqueta').toLowerCase();
    if (!ETIQ_OK.test(nombre)) vm.error(`«etiqueta»: «${nombre}» no es un nombre de etiqueta válido`);
    if (NO_CONTENIDO.has(nombre)) {
      vm.error(`«etiqueta»: «${nombre}» no lleva contenido de texto`,
        nombre === 'style' ? 'para CSS usa estilo("…")' : 'si de verdad lo necesitas, constrúyelo con crudo("…")');
    }
    const n = vm.nuevoNodo('elemento');
    n.etiqueta = nombre;
    n.hijos = [];
    for (let i = 1; i < a.length; i++) {
      const x = a[i];
      if (esEstilo(x)) { n.estilo = n.estilo ? fusionar([n.estilo, x], 'etiqueta') : x; continue; }
      // Todos los diccionarios son atributos y se fusionan; gana el de la
      // derecha, igual que al componer estilos. Antes solo contaba el primero y
      // el segundo acababa pintado como texto a la vista del usuario.
      if (x instanceof ObjDic) { aplicarDic(n, x, 'etiqueta'); continue; }
      comoHijos(x, n.hijos);
    }
    if (n.hijos.length && VACIAS.has(nombre)) {
      vm.error(`«etiqueta»: «${nombre}» no puede llevar hijos`);
    }
    vm.cobrar(1 + n.hijos.length);
    return n;
  }, 'etiqueta(nombre, atributos?, contenido…) — devuelve un nodo');

  def('crudo', 'texto -> nodo', a => {
    // El HTML de crudo() lo inserta el navegador, no el árbol, y el analizador
    // de HTML reequilibra lo que recibe: una etiqueta sin cerrar se cierra
    // sola al final del trozo y una de cierre sobrante se tira. O sea que
    // crudo("<div>") no deja el árbol abierto —lo de después sigue siendo
    // hermano, no hijo— pero tampoco pinta lo que uno creía. Si hace falta
    // anidar, se anida con etiqueta(), que para eso está.
    const n = vm.nuevoNodo('crudo');
    n.valor = repr(a[0], 0);
    vm.cobrar(1);
    return n;
  }, 'crudo(html) — un nodo con HTML sin escapar; la puerta explícita. El navegador reequilibra las etiquetas: lo que abras aquí se cierra aquí');

  // ---- controles
  function control(forma, quien, a, otros) {
    const n = vm.nuevoNodo(forma);
    vm.cobrar(1);
    extras(n, a, 1, quien, (x, i) => {
      if (esFn(x) && n.accion === null) { n.accion = x; return true; }
      return otros ? otros(n, x, i) : false;
    });
    return n;
  }

  def('boton', '... -> nodo', a => {
    const n = control('boton', 'boton', a);
    n.valor = txt(a[0], 1, 'boton');
    return n;
  }, 'boton(texto, funcion?, estilo?, atributos?) — devuelve un nodo botón');

  def('entrada', '... -> nodo', a => {
    const n = control('entrada', 'entrada', a);
    n.valor = txt(a[0], 1, 'entrada');
    return n;
  }, 'entrada(rotulo, funcion?, estilo?, atributos?) — caja de texto; el valor inicial va en {valor: …}');

  def('areaTexto', '... -> nodo', a => {
    const n = control('area', 'areaTexto', a);
    n.valor = txt(a[0], 1, 'areaTexto');
    return n;
  }, 'areaTexto(rotulo, funcion?, estilo?, atributos?) — caja de texto de varias líneas');

  def('casilla', '... -> nodo', a => {
    const n = control('casilla', 'casilla', a, (nodo, x) => {
      if (typeof x === 'boolean') { nodo.marcada = x; nodo.declara = true; return true; }
      return false;
    });
    n.valor = txt(a[0], 1, 'casilla');
    if (n.atrib && n.atrib.has('checked')) { n.marcada = true; n.declara = true; }
    return n;
  }, 'casilla(rotulo, marcada?, funcion?, estilo?, atributos?) — casilla de verificación');

  def('desplegable', '... -> nodo', a => {
    const lista = lst(a[0], 1, 'desplegable');
    const n = control('seleccion', 'desplegable', a);
    n.opciones = lista.items.map(o => {
      if (o instanceof ObjLista) {
        if (o.items.length !== 2) vm.error('«desplegable»: una opción con lista debe ser [valor, texto]');
        return { valor: repr(o.items[0], 0), texto: repr(o.items[1], 0) };
      }
      const t = repr(o, 0);
      return { valor: t, texto: t };
    });
    vm.cobrar(n.opciones.length);
    return n;
  }, 'desplegable(opciones, funcion?, estilo?, atributos?) — lista desplegable; opciones de texto o [valor, texto]');

  def('tabla', '... -> nodo', a => {
    const filas = lst(a[0], 1, 'tabla').items;
    const cab = a[1] instanceof ObjLista ? a[1].items : null;
    const tabla = vm.nuevoNodo('elemento');
    tabla.etiqueta = 'table';
    tabla.atrib = new Map([['class', 'el-tabla']]);
    tabla.hijos = [];
    extras(tabla, a, cab ? 2 : 1, 'tabla', x => x instanceof ObjLista);
    const fila = (celdas, etiq) => {
      const tr = vm.nuevoNodo('elemento');
      tr.etiqueta = 'tr'; tr.hijos = [];
      for (const c of celdas) {
        const td = vm.nuevoNodo('elemento');
        td.etiqueta = etiq; td.hijos = [];
        comoHijos(c, td.hijos);
        tr.hijos.push(td);
      }
      return tr;
    };
    if (cab) {
      const thead = vm.nuevoNodo('elemento');
      thead.etiqueta = 'thead'; thead.hijos = [fila(cab, 'th')];
      tabla.hijos.push(thead);
    }
    const tbody = vm.nuevoNodo('elemento');
    tbody.etiqueta = 'tbody'; tbody.hijos = [];
    for (const f of filas) tbody.hijos.push(fila(f instanceof ObjLista ? f.items : [f], 'td'));
    tabla.hijos.push(tbody);
    vm.cobrar(3 + filas.length * 2);
    return tabla;
  }, 'tabla(filas, encabezados?, estilo?, atributos?) — devuelve un nodo tabla');

  // ---- pintar: el único que toca la página
  // Lo que se le manda al anfitrión de cada nodo: atributos ya resueltos,
  // eventos ya traducidos a nombres del DOM y la clave de identidad. El
  // anfitrión no interpreta nada, solo conecta.
  function menaje(n) {
    const atrib = {};
    if (n.atrib) for (const [k, v] of n.atrib) atrib[k] = v;
    if (n.estilo) {
      const { nombre, texto } = cssDe(n.estilo);
      if (w.asegurarClase) w.asegurarClase(nombre, texto);
      atrib.class = atrib.class ? atrib.class + ' ' + nombre : nombre;
    }
    if (n.vars) {
      const decl = [...n.vars].map(([k, v]) => `${k}:${v}`).join(';');
      atrib.style = atrib.style ? atrib.style + ';' + decl : decl;
    }
    const ev = n.eventos ? Object.fromEntries(n.eventos) : null;
    return { atrib, eventos: ev, clave: n.clave };
  }

  function pintarNodo(n, prof) {
    if (prof > MAX_PROF) vm.error(`la página está anidada más de ${MAX_PROF} niveles`);
    vm.cobrar(1);
    switch (n.forma) {
      case 'texto': if (w.texto) w.texto(n.valor); break;
      case 'crudo': if (w.eco) w.eco(n.valor); break;
      case 'boton': case 'entrada': case 'area': case 'casilla': case 'seleccion': {
        if (!w.control) break;
        const m = menaje(n);
        w.control({
          forma: n.forma, rotulo: n.valor, accion: n.accion,
          // «declara» distingue un control que el programa gobierna —y cuyo
          // valor manda siempre— de uno que solo lee, donde lo que hay escrito
          // es del usuario y el repintado no debe tocarlo.
          marcada: n.marcada === true, declara: n.declara === true,
          opciones: n.opciones || null,
          atrib: m.atrib, eventos: m.eventos, clave: m.clave,
        }, vm);
        break;
      }
      case 'elemento': {
        if (!w.abrir) break;
        const m = menaje(n);
        w.abrir(n.etiqueta, m.atrib, { eventos: m.eventos, clave: m.clave, vm });
        try { for (const h of n.hijos) pintarNodo(h, prof + 1); }
        finally { if (w.cerrar) w.cerrar(); }
        break;
      }
    }
  }

  def('pintar', '... -> nulo', a => {
    if (!w.abrir) sinPagina('pintar');
    const pendientes = [];
    for (const x of a) comoHijos(x, pendientes);
    // Los fotogramas se reemiten en cada pintado. Se declaran una vez en el
    // programa, pero limpiarPagina() se lleva la hoja por delante; si no se
    // volvieran a poner, la animación deja de existir tras el primer repintado.
    if (w.asegurarClase) for (const [nombre, texto] of animaciones) w.asegurarClase(nombre, texto);
    for (const n of pendientes) pintarNodo(n, 0);
    return null;
  }, 'pintar(nodo…) — añade los nodos a la página');

  def('eco', '... -> nulo', a => { if (!w.eco) sinPagina('eco'); w.eco(a.map(x => repr(x, 0)).join('')); return null; }, 'escribe HTML crudo en la página, sin pasar por el árbol');
  // ================================================== ESTILO — reglas como valores
  // ================================================== ESTILO — vive en su eDSL
  // Toda la maquinaria de estilos se mudó a src/13-edsl-estilo.js con sus 22
  // nombres, que dejaron de ser globales. Aquí solo queda el enganche, porque
  // un nodo de la página lleva estilo dentro: «esEstilo» para reconocerlo,
  // «fusionar» para componer dos, y «cssDe» para sacar la clase y su CSS. Es la
  // MISMA copia que usa el eDSL, no otra: las reglas de traducir «transparente»
  // o de poner «px» a un número viven en un solo sitio.
  vm.estilos = maquinariaEstilo(vm, w, sinPagina);
  const { esEstilo, fusionar, cssDe, valorPropiedad } = vm.estilos;
  const animaciones = vm.estilos.animaciones;   // los @keyframes ya declarados
  def('limpiarPagina', ' -> nulo', () => { if (!w.limpiar) sinPagina('limpiarPagina'); w.limpiar(); return null; }, 'borra todo lo escrito en la página');

  // ================================================== MEMORIA Y TIEMPO
  seccion('memoria y tiempo');
  // La zona aislada tiene origen opaco: localStorage lanza SecurityError y ahí
  // no hay nada que hacer. Lo que sí se puede es pedírselo al anfitrión por el
  // puente, que es quien tiene un origen de verdad. El programa ve una API
  // síncrona porque el anfitrión mantiene el espejo en memoria; lo que cruza el
  // puente es solo la copia persistente.
  const alm = host.almacen || null;
  const MAX_GUARDADO = 64 * 1024;

  // Un valor guardado tiene que volver siendo el mismo: una lista tiene que
  // volver lista y un diccionario diccionario, con sus claves del tipo que
  // fueran. Por eso no es JSON pelado sino una forma etiquetada.
  function aGuardable(v, prof) {
    if ((prof || 0) > 32) vm.error('«guardar»: el valor está anidado demasiado hondo');
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof ObjLista) return { l: v.items.map(x => aGuardable(x, (prof || 0) + 1)) };
    if (v instanceof ObjDic) return { d: [...v.mapa].map(([k, x]) => [aGuardable(k, (prof || 0) + 1), aGuardable(x, (prof || 0) + 1)]) };
    vm.error(`«guardar» no puede guardar ${tipoDe(v)}`,
      'se guardan números, textos, booleanos, nulo, listas y diccionarios');
  }
  function deGuardable(v, prof) {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if ((prof || 0) > 64) vm.error('«recuperar»: el valor guardado está mal formado');
    if (v && Array.isArray(v.l)) return L(v.l.map(x => deGuardable(x, (prof || 0) + 1)));
    if (v && Array.isArray(v.d)) {
      const d = D();
      for (const par of v.d) d.mapa.set(deGuardable(par[0], (prof || 0) + 1), deGuardable(par[1], (prof || 0) + 1));
      return d;
    }
    return null;
  }
  const sinAlmacen = quien => vm.error(`«${quien}» necesita un anfitrión con almacenamiento`,
    'en el IDE está disponible; fuera del navegador, no');

  def('guardar', 'texto, cualquiera -> nulo', a => {
    if (!alm) sinAlmacen('guardar');
    const k = txt(a[0], 1, 'guardar');
    const texto = JSON.stringify(aGuardable(a[1], 0));
    if (texto.length > MAX_GUARDADO)
      vm.error(`«guardar»: «${k}» ocupa ${texto.length} caracteres y el máximo es ${MAX_GUARDADO}`);
    vm.cobrar(2 + (texto.length >> 6));
    alm.escribir(k, texto);
    return null;
  }, 'guardar(clave, valor) — deja el valor guardado entre ejecuciones');

  def('recuperar', '... -> cualquiera', a => {
    if (!alm) sinAlmacen('recuperar');
    const k = txt(a[0], 1, 'recuperar');
    const pordefecto = a.length > 1 ? a[1] : null;
    const texto = alm.leer(k);
    if (texto === null || texto === undefined) return pordefecto;
    vm.cobrar(2 + (String(texto).length >> 6));
    try { return deGuardable(JSON.parse(texto), 0); }
    catch (_) { return pordefecto; }
  }, 'recuperar(clave, pordefecto?) — lee lo guardado');

  def('olvidar', 'texto -> bool', a => {
    if (!alm) sinAlmacen('olvidar');
    return !!alm.borrar(txt(a[0], 1, 'olvidar'));
  }, 'olvidar(clave) — borra una clave guardada');

  def('guardados', ' -> lista<texto>', () => {
    if (!alm) sinAlmacen('guardados');
    return L(alm.claves().map(String));
  }, 'guardados() — la lista de claves guardadas');

  const tmp = host.tiempo || null;
  const sinTiempo = quien => vm.error(`«${quien}» necesita un anfitrión con temporizadores`,
    'en el IDE está disponible; fuera del navegador, no');
  const msDe = (v, quien) => {
    const ms = num(v, 1, quien);
    if (!isFinite(ms) || ms < 0) vm.error(`«${quien}»: los milisegundos deben ser un número positivo`);
    return ms;
  };
  // «despues» ya es el pseudoelemento ::after del sistema de estilo, así que el
  // temporizador de una sola vez se llama «luego».
  def('luego', 'real, cualquiera -> entero', a => {
    if (!tmp) sinTiempo('luego');
    if (!esFn(a[1])) vm.error(`«luego»: el argumento 2 debe ser una función y es ${tipoDe(a[1])}`);
    vm.cobrar(1);
    return tmp.luego(msDe(a[0], 'luego'), a[1], vm);
  }, 'luego(ms, funcion) — la llama una vez pasado ese tiempo; devuelve el número del temporizador');
  def('cada', 'real, cualquiera -> entero', a => {
    if (!tmp) sinTiempo('cada');
    if (!esFn(a[1])) vm.error(`«cada»: el argumento 2 debe ser una función y es ${tipoDe(a[1])}`);
    vm.cobrar(1);
    return tmp.cada(msDe(a[0], 'cada'), a[1], vm);
  }, 'cada(ms, funcion) — la llama cada tanto; devuelve el número del temporizador');
  def('detener', 'entero -> bool', a => {
    if (!tmp) sinTiempo('detener');
    return !!tmp.detener(num(a[0], 1, 'detener'));
  }, 'detener(numero) — para un temporizador de despues() o cada()');

  // ================================================== RED
  seccion('red');
  // Una petición no puede bloquear: la máquina es síncrona y no hay hilos. Así
  // que pedir() no devuelve la respuesta, la entrega — igual que un clic o un
  // temporizador, la respuesta llega como un turno más. Es la misma forma que
  // ya tiene todo lo demás y no hace falta inventar promesas en el lenguaje.
  const red = host.red || null;
  const METODOS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

  def('pedir', '... -> nulo', a => {
    if (!red) vm.error('«pedir» necesita un anfitrión con red',
      'está en el IDE, en una aplicación exportada y en el intérprete de Node; QuickJS no trae «fetch»');
    const url = txt(a[0], 1, 'pedir');
    if (!/^https?:\/\//i.test(url)) vm.error('«pedir»: la dirección debe empezar por http:// o https://');
    let op = null, fn = null;
    for (let i = 1; i < a.length; i++) {
      const x = a[i];
      if (esFn(x)) { fn = x; continue; }
      if (x instanceof ObjDic) { op = x; continue; }
      if (x === null) continue;
      vm.error(`«pedir» no sabe qué hacer con ${tipoDe(x)} en la posición ${i + 1}`);
    }
    if (!fn) vm.error('«pedir» necesita una función que reciba la respuesta',
      'pedir("https://…", fn(r) { imprimir(r["cuerpo"]) })');
    const o = { metodo: 'GET', cuerpo: null, cabeceras: {} };
    if (op) for (const [k, v] of op.mapa) {
      const clave = String(k);
      if (clave === 'metodo') {
        o.metodo = String(repr(v, 0)).toUpperCase();
        if (!METODOS.has(o.metodo)) vm.error(`«pedir»: el método «${o.metodo}» no está permitido`);
      } else if (clave === 'cuerpo') {
        o.cuerpo = v === null ? null : repr(v, 0);
      } else if (clave === 'cabeceras') {
        if (!(v instanceof ObjDic)) vm.error('«pedir»: «cabeceras» tiene que ser un diccionario');
        for (const [ck, cv] of v.mapa) {
          const nombre = String(ck);
          // Una cabecera con salto de línea partiría la petición en dos.
          if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(nombre)) vm.error(`«pedir»: «${nombre}» no es un nombre de cabecera válido`);
          const valor = repr(cv, 0);
          if (/[\r\n]/.test(valor)) vm.error(`«pedir»: el valor de «${nombre}» lleva un salto de línea`);
          o.cabeceras[nombre] = valor;
        }
      } else {
        vm.error(`«pedir»: no conozco la opción «${clave}»`, 'las opciones son metodo, cuerpo y cabeceras');
      }
    }
    vm.cobrar(4);
    red.pedir(url, o, fn, vm);
    return null;
  }, 'pedir(url, opciones?, funcion) — trae datos de la red; la respuesta llega a la función, como un clic');

  // JSON, que es en lo que habla casi todo lo que hay al otro lado de pedir().
  function aValor(v, prof) {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if ((prof || 0) > 64) vm.error('«deJson»: el texto está anidado demasiado hondo');
    if (Array.isArray(v)) return L(v.map(x => aValor(x, (prof || 0) + 1)));
    const d = D();
    for (const k in v) d.mapa.set(k, aValor(v[k], (prof || 0) + 1));
    return d;
  }
  function deValor(v, prof) {
    if ((prof || 0) > 32) vm.error('«aJson»: el valor está anidado demasiado hondo');
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof ObjLista) return v.items.map(x => deValor(x, (prof || 0) + 1));
    if (v instanceof ObjDic) {
      const o = {};
      for (const [k, x] of v.mapa) o[String(k)] = deValor(x, (prof || 0) + 1);
      return o;
    }
    vm.error(`«aJson» no puede convertir ${tipoDe(v)}`, 'se convierten números, textos, booleanos, nulo, listas y diccionarios');
  }
  def('deJson', 'texto -> cualquiera', a => {
    const t = txt(a[0], 1, 'deJson');
    vm.cobrar(2 + (t.length >> 6));
    let v;
    // Un JSON mal formado es un dato de fuera, no un fallo del motor: se
    // convierte en un error del lenguaje, que se puede capturar.
    try { v = JSON.parse(t); }
    catch (e) { vm.error('«deJson»: el texto no es JSON válido', String(e.message || e).slice(0, 120)); }
    return aValor(v, 0);
  }, 'deJson(texto) — convierte texto JSON en listas y diccionarios');
  def('aJson', '... -> texto', a => {
    const bonito = a.length > 1 && a[1] === true;
    const plano = deValor(a[0], 0);
    const t = JSON.stringify(plano, null, bonito ? 2 : 0);
    vm.cobrar(2 + (t.length >> 6));
    return t;
  }, 'aJson(valor, bonito?) — convierte un valor en texto JSON');

  // ================================================== ARCHIVOS Y SISTEMA
  seccion('archivos y sistema');
  // Nada de esto existe en el navegador, y es a propósito: un programa que
  // corre dentro de una página no tiene por qué poder abrir archivos. Estas
  // funciones solo aparecen cuando el anfitrión las ofrece, que es lo que hace
  // el intérprete de línea de órdenes. Si no están, lo dicen con esas palabras
  // en vez de fallar de una forma rara.
  const arch = host.archivos || null;
  const sis = host.sistema || null;
  const faltaArch = quien => vm.error(`«${quien}» necesita un anfitrión con archivos`,
    'esto corre fuera del navegador: qjs --std motor/util/n.js programa.esl, o node motor/util/n-node.js');
  const faltaSis = quien => vm.error(`«${quien}» necesita un anfitrión con sistema`,
    'esto corre fuera del navegador: qjs --std motor/util/n.js programa.esl, o node motor/util/n-node.js');

  // El anfitrión lanza errores de JavaScript; aquí se vuelven errores del
  // lenguaje, del tipo «archivo», para que un programa pueda capturarlos.
  function conArchivo(quien, ruta, f) {
    if (!arch) faltaArch(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'archivo');
    }
  }
  function conSistema(quien, f) {
    if (!sis) faltaSis(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'sistema');
    }
  }

  def('leerTexto', 'texto -> texto', a => {
    const r = txt(a[0], 1, 'leerTexto');
    const t = conArchivo('leerTexto', r, () => arch.leer(r));
    vm.cobrar(4 + (String(t).length >> 6));
    return t;
  }, 'leerTexto(ruta) — el contenido de un archivo de texto');
  def('escribirTexto', 'texto, texto -> nulo', a => {
    const r = txt(a[0], 1, 'escribirTexto'), t = txt(a[1], 2, 'escribirTexto');
    vm.cobrar(4 + (t.length >> 6));
    conArchivo('escribirTexto', r, () => arch.escribir(r, t));
    return null;
  }, 'escribirTexto(ruta, texto) — lo escribe entero, pisando lo que hubiera');
  def('agregarTexto', 'texto, texto -> nulo', a => {
    const r = txt(a[0], 1, 'agregarTexto'), t = txt(a[1], 2, 'agregarTexto');
    vm.cobrar(4 + (t.length >> 6));
    conArchivo('agregarTexto', r, () => arch.agregar(r, t));
    return null;
  }, 'agregarTexto(ruta, texto) — lo añade al final');
  def('existeArchivo', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'existeArchivo');
    return !!conArchivo('existeArchivo', r, () => arch.existe(r));
  }, 'existeArchivo(ruta) — si hay algo en esa ruta');
  def('esCarpeta', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'esCarpeta');
    return !!conArchivo('esCarpeta', r, () => arch.esCarpeta(r));
  }, 'esCarpeta(ruta) — si esa ruta es una carpeta');
  def('listar', 'texto -> lista<texto>', a => {
    const r = txt(a[0], 1, 'listar');
    const l = conArchivo('listar', r, () => arch.listar(r));
    vm.cobrar(2 + l.length);
    return L(l.map(String));
  }, 'listar(ruta) — los nombres que hay dentro de una carpeta');
  def('crearCarpeta', 'texto -> nulo', a => {
    const r = txt(a[0], 1, 'crearCarpeta');
    conArchivo('crearCarpeta', r, () => arch.crearCarpeta(r));
    return null;
  }, 'crearCarpeta(ruta) — la crea, con las que falten por el camino');
  def('borrarArchivo', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'borrarArchivo');
    return !!conArchivo('borrarArchivo', r, () => arch.borrar(r));
  }, 'borrarArchivo(ruta) — lo borra; devuelve si había algo que borrar');
  def('tamanoArchivo', 'texto -> entero', a => {
    const r = txt(a[0], 1, 'tamanoArchivo');
    return conArchivo('tamanoArchivo', r, () => arch.tamano(r)) | 0;
  }, 'tamanoArchivo(ruta) — su tamaño en bytes');

  def('argumentos', ' -> lista<texto>', () => {
    if (!sis) faltaSis('argumentos');
    return L(sis.argumentos().map(String));
  }, 'argumentos() — lo que venía detrás del nombre del programa');
  def('entorno', '... -> cualquiera', a => {
    if (!sis) faltaSis('entorno');
    const n = txt(a[0], 1, 'entorno');
    const v = sis.entorno(n);
    return v === null || v === undefined ? (a.length > 1 ? a[1] : null) : String(v);
  }, 'entorno(nombre, pordefecto?) — una variable de entorno');
  def('ejecutar', '... -> dic<texto,cualquiera>', a => {
    if (!sis) faltaSis('ejecutar');
    const orden = txt(a[0], 1, 'ejecutar');
    let args = [];
    if (a.length > 1 && a[1] !== null) {
      const l = lst(a[1], 2, 'ejecutar');
      args = l.items.map(x => repr(x, 0));
    }
    vm.cobrar(50);
    const r = conSistema('ejecutar', () => sis.ejecutar(orden, args));
    const d = D();
    d.mapa.set('codigo', r.codigo | 0);
    d.mapa.set('salida', String(r.salida || ''));
    d.mapa.set('error', String(r.error || ''));
    return d;
  }, 'ejecutar(orden, argumentos?) — lanza un programa y espera; devuelve {codigo, salida, error}');
  def('leerLinea', '... -> cualquiera', a => {
    if (!sis) faltaSis('leerLinea');
    if (a.length && a[0] !== null) vm.salida(repr(a[0], 0));
    const l = sis.leerLinea();
    return l === null || l === undefined ? null : String(l);
  }, 'leerLinea(pista?) — lee una línea de la entrada; nulo cuando se acaba');
  def('salir', '... -> nulo', a => {
    if (!sis) faltaSis('salir');
    sis.salir(a.length ? num(a[0], 1, 'salir') | 0 : 0);
    return null;
  }, 'salir(codigo?) — termina el programa');

  // ==================================================== CÓDIGO NATIVO (FFI)
  seccion('código nativo');
  // Esto es un agujero en la caja, y lo es a propósito. Llamar a una función de
  // una biblioteca compilada es ejecutar código arbitrario dentro de este mismo
  // proceso: no hay verificador que lo mire, no hay presupuesto de
  // instrucciones que lo corte, y un puntero mal puesto tira el proceso entero
  // sin pasar por «intentar». Por eso vive exactamente donde viven los
  // archivos: solo existe cuando el anfitrión lo ofrece, y el anfitrión de la
  // zona aislada no lo ofrece nunca.
  //
  // La biblioteca no sabe con qué se llama a lo nativo. Le pide al anfitrión
  // cuatro cosas —cargar, descargar, declarar una estructura y declarar una
  // función— y le pasa y recibe valores planos de JavaScript. Así el anfitrión
  // de Node puede usar koffi y el de QuickJS puede no ofrecer nada, sin que el
  // motor cambie.
  const nat = host.nativo || null;
  const MAX_NATIVAS = 256;     // funciones declaradas por ejecución
  const MAX_ARGS_NAT = 16;     // argumentos por función nativa
  let nDeclaradas = 0;
  const faltaNat = quien => vm.error(`«${quien}» necesita un anfitrión con código nativo`,
    'esto corre fuera del navegador y con koffi instalado: npm install koffi, y luego node motor/util/n-node.js');
  function conNativo(quien, f) {
    if (!nat) faltaNat(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'nativo');
    }
  }

  // Un valor de Ñ camino de C. Números, textos y booleanos van tal cual; un
  // diccionario es una estructura y una lista es un arreglo. Lo que no tiene
  // forma en C —una función, un nodo, un estilo, un error— se rechaza aquí,
  // con su nombre, en vez de llegar al anfitrión y salir como un fallo raro.
  function aCrudo(v, quien, i) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (v instanceof ObjDic) {
      const o = {};
      for (const [k, val] of v.mapa) {
        if (typeof k !== 'string')
          vm.error(`«${quien}»: las claves de una estructura tienen que ser texto y hay una de tipo ${tipoDe(k)}`,
            null, false, 'nativo');
        o[k] = aCrudo(val, quien, i);
      }
      return o;
    }
    if (v instanceof ObjLista) return v.items.map(x => aCrudo(x, quien, i));
    vm.error(`«${quien}»: el argumento ${i} es de tipo ${tipoDe(v)} y eso no se puede pasar a código nativo`,
      'a una función nativa se le pasan números, textos, booleanos, y diccionarios para las estructuras',
      false, 'nativo');
  }

  // Y de vuelta. Los enteros de 64 bits llegan como BigInt cuando no caben en
  // un número de JavaScript; Ñ no tiene BigInt, así que se dice con esas
  // palabras en vez de entregar un número equivocado en silencio.
  function deCrudo(v, quien) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'bigint') {
      if (v > 9007199254740991n || v < -9007199254740991n)
        vm.error(`«${quien}»: devolvió ${v} y eso no cabe en un número de Ñ`,
          'Ñ maneja enteros exactos hasta 9.007.199.254.740.991; para valores mayores declara el tipo «texto» y conviértelo en C',
          false, 'nativo');
      return Number(v);
    }
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (Array.isArray(v)) return L(v.map(x => deCrudo(x, quien)));
    if (t === 'object') {
      const d = D();
      for (const k of Object.keys(v)) d.mapa.set(k, deCrudo(v[k], quien));
      return d;
    }
    return String(v);
  }

  def('hayNativo', ' -> bool', () => !!nat,
    'hayNativo() — si este anfitrión puede llamar a código nativo');
  def('cargarNativa', 'texto -> nulo', a => {
    const b = txt(a[0], 1, 'cargarNativa');
    vm.cobrar(200);
    conNativo('cargarNativa', () => nat.cargar(b));
    return null;
  }, 'cargarNativa(biblioteca) — abre una biblioteca compilada; falla aquí si no está');
  def('descargarNativa', 'texto -> bool', a => {
    const b = txt(a[0], 1, 'descargarNativa');
    return !!conNativo('descargarNativa', () => nat.descargar(b));
  }, 'descargarNativa(biblioteca) — la suelta; devuelve si estaba abierta');
  def('bibliotecasNativas', ' -> lista<texto>', () => {
    if (!nat) faltaNat('bibliotecasNativas');
    return L(conNativo('bibliotecasNativas', () => nat.abiertas()).map(String));
  }, 'bibliotecasNativas() — las que están abiertas ahora mismo');

  def('estructuraNativa', 'texto, cualquiera -> texto', a => {
    const n = txt(a[0], 1, 'estructuraNativa');
    const campos = a[1];
    if (!(campos instanceof ObjDic))
      vm.error(`«estructuraNativa»: el argumento 2 debe ser un diccionario {campo: tipo} y es ${tipoDe(campos)}`);
    const pares = [];
    for (const [k, v] of campos.mapa) {
      if (typeof k !== 'string')
        vm.error('«estructuraNativa»: los nombres de campo tienen que ser texto', null, false, 'nativo');
      if (typeof v !== 'string')
        vm.error(`«estructuraNativa»: el tipo del campo «${k}» tiene que ser texto y es ${tipoDe(v)}`,
          null, false, 'nativo');
      pares.push([k, v]);
    }
    if (!pares.length)
      vm.error('«estructuraNativa»: una estructura sin campos no sirve de nada', null, false, 'nativo');
    vm.cobrar(20 + pares.length);
    conNativo('estructuraNativa', () => nat.estructura(n, pares));
    return n;
  }, 'estructuraNativa(nombre, {campo: tipo, …}) — declara una estructura de C; devuelve su nombre para usarlo como tipo');

  def('nativa', '... -> funcion', a => {
    if (!nat) faltaNat('nativa');
    if (a.length < 3 || a.length > 4)
      vm.error('«nativa» acepta 3 o 4 argumentos: nativa(biblioteca, simbolo, devuelve, argumentos?)');
    const bib = txt(a[0], 1, 'nativa');
    const sim = txt(a[1], 2, 'nativa');
    const dev = txt(a[2], 3, 'nativa');
    let tipos = [];
    if (a.length > 3 && a[3] !== null) {
      const l = lst(a[3], 4, 'nativa');
      tipos = l.items.map((x, i) => {
        if (typeof x !== 'string')
          vm.error(`«nativa»: el tipo del argumento ${i + 1} debe ser texto y es ${tipoDe(x)}`, null, false, 'nativo');
        return x;
      });
    }
    if (tipos.length > MAX_ARGS_NAT)
      vm.error(`«nativa»: no se declaran más de ${MAX_ARGS_NAT} argumentos y se declararon ${tipos.length}`,
        null, false, 'nativo');
    if (++nDeclaradas > MAX_NATIVAS)
      vm.error(`«nativa»: no se declaran más de ${MAX_NATIVAS} funciones nativas en una ejecución`,
        'declárala una vez y guarda el resultado en una variable, no dentro de un bucle', false, 'nativo');
    vm.cobrar(100);
    // El anfitrión valida aquí los nombres de tipo y busca el símbolo: lo que
    // está mal se sabe al declarar, no en la primera llamada.
    const llamar = conNativo('nativa', () => nat.funcion(bib, sim, dev, tipos));
    // La aridad va en el propio valor, así que el número de argumentos lo
    // comprueba la máquina con su mensaje de siempre antes de que nada cruce.
    return new ObjNativa(sim, tipos.length, (args) => {
      vm.cobrar(20 + tipos.length * 2);
      const crudos = new Array(args.length);
      for (let i = 0; i < args.length; i++) crudos[i] = aCrudo(args[i], sim, i + 1);
      let r;
      try { r = llamar(crudos); }
      catch (e) {
        if (e instanceof ErrorTiempoEjecucion) throw e;
        vm.error(`«${sim}»: ${String((e && e.message) || e)}`, null, false, 'nativo');
      }
      return deCrudo(r, sim);
    }, `${sim}() de ${bib} — declarada con nativa()`);
  }, 'nativa(biblioteca, simbolo, devuelve, argumentos?) — declara una función compilada y la devuelve como función de Ñ');

  // ------------------------------------------------------------- excepciones
  seccion('excepciones');
  def('error', '... -> error', a => {
    const msg = a.length ? repr(a[0], 0) : '';
    const tipo = a.length > 1 ? txt(a[1], 2, 'error') : 'programa';
    return vm.nuevoError(tipo, msg, vm.lineaActual);
  }, 'error(mensaje, tipo?) — construye un error para lanzarlo');

  // ===================================================== MÓDULOS
  // Esto no es una función de la biblioteca: es lo que el compilador emite
  // donde el programa escribió «usar». Se llama « usar», con un espacio
  // delante, y el léxico no acepta espacios dentro de un identificador, así que
  // ningún programa puede alcanzarla ni tapándola ni llamándola. El lenguaje
  // sigue sin tener un «cargar()»: cargar módulos no es algo que un programa
  // pueda pedir, es algo que el compilador deja escrito donde había un «usar».
  //
  // Aquí solo se ejecuta: encontrar y compilar el módulo ya pasó al analizar.
  // Y aquí es donde se cumplen las dos reglas de ejecución: una sola vez, y los
  // ciclos no desbordan la pila.
  vm.definirNativa(' usar', 'cualquiera -> nulo', a => {
    const clave = a[0];
    // Un eDSL nativo se instala al crear el motor, así que cuando el programa
    // llega a su «usar» sus funciones ya existen. No está en el registro de
    // ejecución porque no hay nada que ejecutar.
    if (vm.edslPorClave && vm.edslPorClave.has(clave)) return null;
    const reg = vm.modulos ? vm.modulos.get(clave) : null;
    if (!reg) vm.error(`no hay módulo compilado para «${rutaCorta(String(clave))}»`,
      'un .elb no lleva dentro los módulos que importaba: vuelve a ejecutarlo desde el código fuente');
    // «cargando» es un ciclo: el módulo está a medio ejecutar más abajo en la
    // pila. Seguir es lo correcto —sus funciones ya están definidas, porque el
    // compilador las eleva antes de los «usar»— y es lo que evita la recursión
    // infinita sin necesidad de detectar nada.
    if (reg.estado !== 'nuevo') return null;
    reg.estado = 'cargando';
    vm.invocar(vm.registrar(new ObjCierre(reg.fn)), []);
    reg.estado = 'listo';
    return null;
  });

  // ------------------------------------------------------------ introspección
  seccion('introspección');
  def('ahora', ' -> real', () => Date.now(), 'milisegundos desde 1970');
  def('reloj', ' -> real', () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), 'cronómetro en milisegundos');
  def('memoria', ' -> dic<texto,entero>', () => {
    const d = D();
    d.mapa.set('objetos', vm.monton.length);
    d.mapa.set('recolecciones', vm.stats.gc);
    d.mapa.set('liberados', vm.stats.liberados);
    d.mapa.set('pico', vm.stats.picoMonton);
    return d;
  }, 'estadísticas del recolector de basura');
  def('recolectar', ' -> nulo', () => { vm.recolectar(); return null; }, 'fuerza una recolección de basura');
  def('instrucciones', ' -> entero', () => vm.instrucciones, 'instrucciones de bytecode ejecutadas');

  // ---------------------------------------------------------------- los eDSL
  // Se instalan al final, cuando la biblioteca global ya está entera: un eDSL
  // puede apoyarse en ella, y no al revés.
  instalarEdsl(vm, 'formato', instalarFormato(vm));
  instalarEdsl(vm, 'fecha', instalarFecha(vm));
  instalarEdsl(vm, 'probar', instalarProbar(vm));
  // Los que se mudaron del ámbito global llevan «enClasico»: son los que
  // «usar "clasico"» devuelve.
  // La lista de cada uno son los nombres que ESTABAN en el ámbito global antes
  // de mudarse, con el nombre que tienen hoy. Lo que se escribió después no
  // entra: ningún programa viejo lo espera.
  instalarEdsl(vm, 'texto', instalarTexto(vm), {
    enClasico: ['mayusculas', 'minusculas', 'recortar', 'dividir', 'unir',
      'reemplazar', 'empiezaCon', 'terminaCon', 'subtexto'],
  });
  instalarEdsl(vm, 'numerico', instalarNumerico(vm), {
    enClasico: ['raiz', 'absoluto', 'piso', 'techo', 'seno', 'coseno', 'tangente',
      'arcoseno', 'arcocoseno', 'arcotangente', 'exp', 'log', 'log10', 'signo',
      'redondear', 'potencia', 'suma', 'media', 'mediana', 'moda', 'varianza',
      'desviacion', 'percentil', 'correlacion', 'regresion', 'normalizar',
      'histograma', 'matriz', 'transponer', 'multMatriz', 'determinante', 'resolver'],
  });
  // «datos» no lleva «enClasico»: ninguno de sus nombres estuvo en el ámbito
  // global, así que nada viejo los espera ahí.
  instalarEdsl(vm, 'datos', instalarDatos(vm));
  // De «estilo» sí eran globales 22 nombres. «pares» es el único que NO se
  // reexporta en «clasico»: su sitio en el ámbito global ya está ocupado por el
  // «pares» de los diccionarios, que es quien debía tenerlo desde el principio.
  // Un programa de estilos que lo usara necesita «usar pares de "estilo"».
  instalarEdsl(vm, 'estilo', instalarEstilo(vm), {
    enClasico: ['estilo', 'cssCrudo', 'estiloGlobal', 'fotogramas', 'dentro',
      'alPasar', 'alEnfocar', 'alActivar', 'alVisitar', 'siDeshabilitado',
      'primero', 'ultimo', 'impares', 'antes', 'despues',
      'enPantalla', 'enAlto', 'enOscuro', 'enClaro', 'enImpresion',
      'enMovimientoReducido'],
  });
  // El interruptor va al final: es la unión de los de arriba.
  instalarClasico(vm);

  return vm;
}

// ======================================================= eDSL que vienen dentro
// Un eDSL nativo es un módulo cuyo código está en el motor en vez de en un
// archivo. Por dentro no es un caso especial: sus funciones son globales con la
// clave delante, las mismas que emite «usar» para un .esl, así que el
// compilador, el JIT, el recolector y el serializador no se enteran.
//
// Lo que sí gana es lo de fuera: los nombres no están en el ámbito global, así
// que «color», «punto» o «mover» siguen libres para quien no los importe, y dos
// eDSL pueden llamar igual a cosas distintas sin chocar.
function instalarEdsl(vm, nombre, cuerpo, opciones) {
  opciones = opciones || {};
  const clave = claveEdsl(nombre);
  const exporta = new Map();
  const previa = vm.seccionActual;
  vm.seccionActual = nombre;
  // Misma forma que el «def» de la biblioteca: la firma es texto y de ella sale
  // la aridad. La diferencia es que el nombre se guarda con la clave delante y
  // se apunta en la tabla de exportaciones que lee el verificador.
  const def = (n, fir, fn, doc) => {
    if (exporta.has(n)) throw new Error(`el eDSL «${nombre}» declara «${n}» dos veces`);
    const largo = nombreGlobalModulo(clave, n);
    vm.definirNativa(largo, fir, fn, doc);
    const obj = vm.globals.get(largo);
    obj.edsl = nombre;
    obj.nombreCorto = n;
    exporta.set(n, obj.firma);
  };
  try { cuerpo(def); } finally { vm.seccionActual = previa; }
  // «enClasico» es la LISTA de nombres que estuvieron en el ámbito global, no un
  // sí o no por eDSL. La diferencia importa: «texto» tiene 9 nombres que se
  // mudaron y 40 escritos después, y «usar "clasico"» solo tiene que devolver
  // los 9 —los otros nunca estuvieron ahí, así que ningún programa viejo los
  // espera—. Marcarlo por eDSL metía en «clasico» nombres nuevos, y con ellos
  // el primer choque: «entre» existe en «texto» (lo que hay entre dos marcas) y
  // en «numerico» (si un número está en un intervalo), y son distintas.
  const enClasico = opciones.enClasico || null;
  if (enClasico) for (const n of enClasico)
    if (!exporta.has(n)) throw new Error(`el eDSL «${nombre}» dice que «${n}» venía del ámbito global, y no lo exporta`);
  const reg = { nombre, clave, exporta, enClasico, globalDe: null };
  vm.edsls.set(nombre, reg);
  vm.edslPorClave.set(clave, reg);
  return reg;
}

// El interruptor. No define ni una función: reexporta las de los eDSL marcados,
// apuntando a su global de verdad. Por eso no puede separarse de ellos ni
// quedarse atrás — es la unión, calculada, no una lista escrita a mano.
//
//   usar "clasico"      → el ámbito de siempre, todo a mano
//   (sin esa línea)     → solo el núcleo; lo demás se pide con «usar»
//
// Y por eso el modo es POR ARCHIVO: el enlace ya lo era. Una biblioteca escrita
// a la vieja funciona dentro de un programa escrito a la nueva, y al revés.
function instalarClasico(vm) {
  const exporta = new Map();
  const globalDe = new Map();
  const origenDe = new Map();          // nombre → el eDSL de donde salió
  for (const r of vm.edsls.values()) {
    if (!r.enClasico) continue;
    for (const n of r.enClasico) {
      // Dos eDSL no pueden traer el mismo nombre al ámbito global: antes de la
      // mudanza había uno solo, así que si aparecen dos es que alguien marcó
      // como «venía de global» algo que no venía.
      if (exporta.has(n))
        throw new Error(`«${n}» viene del ámbito global según «${r.nombre}» y según «${origenDe.get(n)}»`);
      // Y tampoco puede reexportar un nombre que SIGUE siendo global: eso no
      // devuelve nada, lo tapa. Es como estaba «pares» —el de los estilos
      // enterraba al de los diccionarios—, y sin esta comprobación la mudanza
      // lo habría vuelto a enterrar por la puerta de atrás.
      if (vm.globals.has(n))
        throw new Error(`«${n}» está en el «enClasico» de «${r.nombre}» pero sigue siendo un global: ` +
          'reexportarlo taparía al de verdad');
      exporta.set(n, r.exporta.get(n));
      globalDe.set(n, nombreGlobalModulo(r.clave, n));
      origenDe.set(n, r.nombre);
    }
  }
  const clave = claveEdsl('clasico');
  const reg = { nombre: 'clasico', clave, exporta, enClasico: false, globalDe, origenDe };
  vm.edsls.set('clasico', reg);
  vm.edslPorClave.set(clave, reg);
  return reg;
}

// ===================================================================== Fachada

// Se queda por compatibilidad con quien la importaba de fuera (util/referencia.js,
// las pruebas). Ya no es una tabla escrita a mano: monta una VM de usar y tirar e
// itera su registro, así que no puede desviarse de lo que la biblioteca define.
function tiposGlobales() {
  const vm = new VM({});
  instalarBiblioteca(vm, {});
  return vm.tiposGlobales();
}

function crearMotor(opciones) {
  opciones = opciones || {};
  const vm = new VM(opciones);
  instalarBiblioteca(vm, opciones.host || {});
  const cargadorModulos = () => (opciones.host && opciones.host.modulos) || null;
  return {
    vm,
    // Analiza sin ejecutar: devuelve {ok, errores, avisos, fn, ast, modulos}
    // «clave» es de dónde viene este texto: la ruta canónica del programa, para
    // poder resolver contra ella las rutas relativas de sus «usar». Un programa
    // sin «usar» no la necesita, y todo lo de módulos se queda sin tocar.
    analizar(fuente, clave) {
      const res = { ok: false, errores: [], avisos: [], fn: null, ast: null, modulos: [] };
      let toks, ast;
      try { toks = lexer(fuente); } catch (e) { res.errores.push(e); return res; }
      try { ast = parser(toks, 'principal'); } catch (e) { res.errores.push(e); return res; }
      res.ast = ast;
      const tipos = vm.tiposGlobales();
      const ixEdsl = vm.indiceEdsl();

      // ── módulos ──────────────────────────────────────────────────────────
      const usos = ast.cuerpo.filter(s => s.tipo === 'Usar');
      let enlaceRaiz = null;
      if (usos.length) {
        const cargador = cargadorModulos();
        // Los eDSL nativos no salen de ningún disco, así que un programa que
        // solo los use funciona igual dentro de la zona aislada del navegador.
        // El anfitrión hace falta para los «usar» que sí son archivos.
        const deDisco = usos.filter(u => !vm.edsls.has(u.ruta));
        if (deDisco.length && !cargador) {
          // Dentro del navegador esto es lo que pasa, y es la decisión, no una
          // laguna: la zona aislada tiene origen opaco y no puede leer un disco
          // que no existe. Darle un cargador por la red sería el «cargar()» que
          // el proyecto decidió no tener.
          res.errores.push(new ErrorFuente('módulos', `«usar "${deDisco[0].ruta}"» necesita un anfitrión con módulos`,
            deDisco[0].linea, deDisco[0].col,
            'aquí dentro no hay sistema de archivos que leer; los módulos funcionan fuera del navegador: ' +
            'node motor/util/n-node.js programa.esl, o qjs --std motor/util/n.js programa.esl'));
          return res;
        }
        if (deDisco.length && (typeof clave !== 'string' || !clave)) {
          res.errores.push(new ErrorFuente('módulos', 'no se sabe desde qué archivo resolver «usar»',
            deDisco[0].linea, deDisco[0].col, 'el anfitrión tiene que decir de dónde salió el programa'));
          return res;
        }
        const mods = new Modulos(cargador, clave, vm.edsls);
        // Cada error y cada aviso se sella con el archivo del que salió: en un
        // programa de cinco archivos, «línea 3» a secas no dice nada.
        const sellar = (lista, arch) => { for (const e of lista) if (e && !e.archivo) e.archivo = arch; return lista; };
        const mios = (f, arch) => {
          const errs = [], avs = [];
          const r = f(errs, avs);
          res.errores.push(...sellar(errs, arch));
          res.avisos.push(...sellar(avs, arch));
          return r;
        };

        enlaceRaiz = mios((errs, avs) => enlazar(ast, null, mods, errs, avs, tipos), null);
        // Enlazar un archivo descubre sus dependencias, que se van añadiendo a
        // «orden»; el bucle sigue hasta que no queda nada nuevo. Un ciclo no lo
        // alarga: lo ya leído está en caché y no vuelve a entrar en la lista.
        const enlaces = new Map();
        for (let i = 0; i < mods.orden.length; i++) {
          const k = mods.orden[i];
          if (enlaces.has(k)) continue;
          const a = mods.ast.get(k);
          enlaces.set(k, mios((errs, avs) => enlazar(a, k, mods, errs, avs, tipos), rutaCorta(k)));
        }
        // Y ahora se comprueban los tipos y se compila cada módulo. Todo antes
        // de ejecutar nada: si el tercer archivo tiene un error de tipos, se
        // dice ya y no a mitad de programa.
        for (const k of mods.orden) {
          const a = mods.ast.get(k), e = enlaces.get(k);
          const tc = verificarTipos(a, tipos, e, ixEdsl);
          res.avisos.push(...sellar(tc.avisos, rutaCorta(k)));
          if (tc.errores.length) { res.errores.push(...sellar(tc.errores, rutaCorta(k))); continue; }
          try { res.modulos.push({ clave: k, fn: compilar(a, rutaCorta(k), e) }); }
          catch (err) { sellar([err], rutaCorta(k)); res.errores.push(err); }
        }
        if (res.errores.length) return res;
      }

      const tc = verificarTipos(ast, tipos, enlaceRaiz, ixEdsl);
      res.avisos.push(...tc.avisos);
      if (tc.errores.length) { res.errores.push(...tc.errores); return res; }
      try { res.fn = compilar(ast, 'principal', enlaceRaiz); } catch (e) { res.errores.push(e); return res; }
      res.ok = true;
      return res;
    },
    // Compila y devuelve el programa como bytes portables. Se apoya en
    // analizar(), así que un programa con errores de tipo no llega a existir
    // como bytecode.
    serializar(fuente, clave) {
      const a = this.analizar(fuente, clave);
      if (!a.ok) return { ok: false, errores: a.errores, avisos: a.avisos };
      // El .elb guarda UNA función y su árbol de funciones anidadas. Un programa
      // con «usar» son varios archivos que se resuelven contra un disco, y
      // meterlos dentro querría decir cambiar el formato —y con él la huella, y
      // con ella todos los .elb de antes— para guardar rutas absolutas que en
      // otra máquina no valen. Se dice y no se hace.
      // Un eDSL nativo no cuenta: su clave («ñ:formato») es la misma en toda
      // máquina, así que el bytecode que lo nombra sigue siendo portable. Lo
      // que no cabe son los archivos, cuya clave es una ruta absoluta de aquí.
      if (a.modulos.length)
        return { ok: false, avisos: a.avisos, errores: [new ErrorFuente('módulos',
          'un programa que importa archivos todavía no se puede guardar como .elb',
          1, 1, 'el .elb guarda un archivo, y esto son ' + (a.modulos.length + 1) +
          '; ejecútalo desde el código fuente — los «usar» de un eDSL sí se guardan, porque no son archivos')] };
      try { return { ok: true, bytes: serializar(a.fn), avisos: a.avisos, fn: a.fn }; }
      catch (e) { return { ok: false, errores: [e], avisos: a.avisos }; }
    },
    // Ejecuta bytecode ya compilado. Lo verifica entero antes de tocarlo, y lo
    // que carga no puede llegar al JIT porque no trae AST.
    ejecutarBytecode(datos) {
      let fn;
      try { fn = deserializar(datos); }
      catch (e) { return { ok: false, errores: [e], avisos: [] }; }
      return this.correr(fn);
    },
    ejecutar(fuente, clave) {
      const a = this.analizar(fuente, clave);
      if (!a.ok) return { ok: false, errores: a.errores, avisos: a.avisos };
      return this.correr(a.fn, a.avisos, a.modulos);
    },
    correr(fn, avisos, modulos) {
      avisos = avisos || [];
      const a = { fn, avisos };
      // El registro de ejecución: clave → {fn, estado}. Es lo que consulta la
      // nativa « usar» para no ejecutar dos veces lo mismo, y se rehace en cada
      // ejecución porque el estado de un módulo es de esta corrida, no del motor.
      vm.modulos = new Map((modulos || []).map(m => [m.clave, { fn: m.fn, estado: 'nuevo' }]));
      vm.instrucciones = 0;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try {
        vm.ejecutarPrograma(a.fn);
        const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        return { ok: true, ms, avisos: a.avisos, fn: a.fn, stats: vm.stats, instrucciones: vm.instrucciones };
      } catch (e) {
        const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        return { ok: false, errores: [e], avisos: a.avisos, ms, fn: a.fn, stats: vm.stats };
      }
    },
  };
}


// ============================================================================
//  ESPAÑOL-LIKE v4 — Serialización del bytecode
//  Parte 5 de 5.
//
//  Convierte un programa ya compilado en una ristra de bytes portable, y la
//  vuelve a convertir en funciones ejecutables. Dos decisiones gobiernan todo
//  lo demás:
//
//  1. El AST no se serializa nunca. El JIT compila desde el AST, así que una
//     función que viene de fuera no puede alcanzarlo por construcción: no hay
//     nada que compilar. Es la única razón por la que cargar bytecode ajeno no
//     equivale a `new Function` sobre texto ajeno.
//
//  2. Las funciones anidadas van en árbol, colgando del pool de constantes de
//     quien las declara, como hace Lua con sus prototipos. No hay referencias
//     cruzadas ni ciclos que resolver, y por tanto no hace falta una tabla de
//     objetos ya vistos —el sitio donde .pyc necesita su FLAG_REF y donde se
//     cuelan los ciclos maliciosos.
//
//  Todo lo que se lee se verifica. No hay modo «confiable» que salte las
//  comprobaciones: cuestan un recorrido lineal y la alternativa es una bandera
//  que algún día alguien pondrá en verdadero por comodidad.
// ============================================================================

const MAGIA = [0x45, 0x53, 0x4C, 0x42];   // "ESLB"
const VERSION_FORMATO = 1;
const MAX_ANIDAMIENTO = 200;              // funciones dentro de funciones
const MAX_SLOTS = 1 << 16;
const MAX_UPVALUES = 256;

class ErrorBytecode extends Error {
  constructor(mensaje, pos) {
    super(mensaje);
    this.name = 'ErrorBytecode';
    this.fase = 'bytecode';
    this.pos = pos;
    this.linea = 0; this.col = 0;
  }
  formato() {
    return `[bytecode] ${this.message}` + (this.pos !== undefined ? ` (byte ${this.pos})` : '');
  }
}

// La huella identifica la tabla de instrucciones: si mañana se añade, se quita
// o se reordena un opcode, o cambia cuántos operandos lleva, la huella cambia y
// los archivos viejos se rechazan con un mensaje claro en vez de ejecutar otra
// cosa. Se calcula sola, así que no hay un número de versión que actualizar a
// mano y olvidar.
function huellaOpcodes() {
  let h = 0x811c9dc5;
  const texto = OP_NOMBRE.map((n, i) => `${n}:${OPERANDOS[i] || 0}`).join(',');
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// --------------------------------------------------------------- etiquetas
const CTE_TEXTO = 0, CTE_ENTERO = 1, CTE_REAL = 2, CTE_FUNCION = 3;

// --------------------------------------------------------------- escritura
class Escritor {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 0xff); }
  // LEB128 sin signo
  varint(v) {
    if (!Number.isSafeInteger(v) || v < 0) throw new ErrorBytecode(`no se puede escribir ${v} como entero sin signo`);
    // Aritmética, no bits: los operadores bit a bit de JavaScript truncan a 32
    // con signo y aquí pueden pasar números mayores.
    do { const c = v % 128; v = Math.floor(v / 128); this.b.push(v ? (c + 128) : c); } while (v);
  }
  // zigzag: los negativos pequeños ocupan un byte igual que los positivos
  zigzag(v) { this.varint(v < 0 ? (-v * 2 - 1) : v * 2); }
  f64(v) {
    const d = new DataView(new ArrayBuffer(8));
    d.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) this.b.push(d.getUint8(i));
  }
  texto(s) {
    const bytes = utf8Codificar(String(s));
    this.varint(bytes.length);
    for (const x of bytes) this.b.push(x);
  }
  terminar() { return Uint8Array.from(this.b); }
}

class Lector {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  get restantes() { return this.b.length - this.p; }
  u8() {
    if (this.p >= this.b.length) throw new ErrorBytecode('el archivo se acaba antes de tiempo', this.p);
    return this.b[this.p++];
  }
  varint() {
    let v = 0, mult = 1, n = 0;
    for (;;) {
      const c = this.u8();
      v += (c & 0x7f) * mult;
      if (!(c & 0x80)) break;
      mult *= 128;
      if (++n > 9) throw new ErrorBytecode('número codificado demasiado largo', this.p);
    }
    if (!Number.isSafeInteger(v)) throw new ErrorBytecode('número fuera del rango representable', this.p);
    return v;
  }
  zigzag() {
    const v = this.varint();
    const neg = v % 2 === 1;
    const m = (v - (neg ? 1 : 0)) / 2;
    return neg ? -(m + 1) : m;
  }
  f64() {
    if (this.restantes < 8) throw new ErrorBytecode('el archivo se acaba dentro de un número real', this.p);
    const d = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) d.setUint8(i, this.b[this.p + i]);
    this.p += 8;
    return d.getFloat64(0, true);
  }
  texto() {
    const n = this.varint();
    if (n > this.restantes) throw new ErrorBytecode('una cadena dice medir más que lo que queda de archivo', this.p);
    const s = utf8Descodificar(this.b, this.p, n);
    this.p += n;
    return s;
  }
  // Un contador nunca puede ser mayor que los bytes que quedan: cada elemento
  // ocupa al menos uno. Evita que un número inflado reserve memoria a lo tonto.
  cuenta(que) {
    const n = this.varint();
    if (n > this.restantes) throw new ErrorBytecode(`${que}: se anuncian ${n} y no caben en lo que queda`, this.p);
    return n;
  }
}

// UTF-8 a mano: TextEncoder no está en todos los entornos donde esto puede
// acabar corriendo, y son treinta líneas.
function utf8Codificar(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
// Estricto a propósito. Un descodificador indulgente convierte bytes corruptos
// en caracteres raros o, peor, deja que String.fromCodePoint lance un error de
// JavaScript que se escapa por encima del ErrorBytecode. Aquí todo lo que no
// sea UTF-8 legal se rechaza como lo que es: un archivo estropeado.
function utf8Descodificar(b, ini, n) {
  let s = '';
  const fin = ini + n;
  let i = ini;
  const cont = () => {
    if (i >= fin) throw new ErrorBytecode('texto UTF-8 cortado', i);
    const x = b[i++];
    if ((x & 0xc0) !== 0x80) throw new ErrorBytecode('secuencia UTF-8 inválida', i - 1);
    return x & 63;
  };
  while (i < fin) {
    const c = b[i++];
    let p, minimo;
    if (c < 0x80) { p = c; minimo = 0; }
    else if ((c & 0xe0) === 0xc0) { p = ((c & 31) << 6) | cont(); minimo = 0x80; }
    else if ((c & 0xf0) === 0xe0) { p = ((c & 15) << 12) | (cont() << 6) | cont(); minimo = 0x800; }
    else if ((c & 0xf8) === 0xf0) { p = ((c & 7) << 18) | (cont() << 12) | (cont() << 6) | cont(); minimo = 0x10000; }
    else throw new ErrorBytecode('byte inicial UTF-8 inválido', i - 1);
    if (p < minimo) throw new ErrorBytecode('secuencia UTF-8 más larga de lo necesario', i - 1);
    if (p > 0x10ffff) throw new ErrorBytecode('carácter fuera del rango Unicode', i - 1);
    if (p >= 0xd800 && p <= 0xdfff) throw new ErrorBytecode('mitad de par suplente suelta', i - 1);
    s += String.fromCodePoint(p);
  }
  return s;
}

// --------------------------------------------------------------- serializar
function serializar(fn) {
  if (!(fn instanceof FuncionCompilada)) throw new ErrorBytecode('no es una función compilada');
  const w = new Escritor();
  for (const m of MAGIA) w.u8(m);
  w.u8(VERSION_FORMATO);
  const h = huellaOpcodes();
  w.u8(h & 255); w.u8((h >>> 8) & 255); w.u8((h >>> 16) & 255); w.u8((h >>> 24) & 255);
  escribirFn(w, fn, new Set(), 0);
  return w.terminar();
}

function escribirFn(w, fn, enCurso, prof) {
  if (prof > MAX_ANIDAMIENTO) throw new ErrorBytecode('funciones anidadas demasiado hondo');
  // El árbol no debería tener ciclos nunca; si los tuviera sería un fallo del
  // compilador, y es mejor enterarse aquí que escribir un archivo infinito.
  if (enCurso.has(fn)) throw new ErrorBytecode(`ciclo en el árbol de funciones, en «${fn.nombre}»`);
  enCurso.add(fn);

  w.texto(fn.nombre);
  w.varint(fn.aridad);
  w.varint(fn.nUpvalues);
  w.varint(fn.maxSlots || 1);

  const consts = fn.chunk.consts;
  w.varint(consts.length);
  for (const v of consts) {
    if (v instanceof FuncionCompilada) { w.u8(CTE_FUNCION); escribirFn(w, v, enCurso, prof + 1); }
    else if (typeof v === 'string') { w.u8(CTE_TEXTO); w.texto(v); }
    else if (typeof v === 'number') {
      // En ejecución «1.0» ya es un entero: el tipo real solo existe en el
      // verificador. Así que basta con distinguir lo que cabe exacto.
      if (Number.isSafeInteger(v) && !Object.is(v, -0)) { w.u8(CTE_ENTERO); w.zigzag(v); }
      else { w.u8(CTE_REAL); w.f64(v); }
    } else throw new ErrorBytecode(`constante de tipo inesperado (${typeof v}) en «${fn.nombre}»`);
  }

  const code = fn.chunk.code, lineas = fn.chunk.lineas;
  w.varint(code.length);
  for (const x of code) {
    if (!Number.isSafeInteger(x) || x < 0) throw new ErrorBytecode(`instrucción con valor inesperado (${x}) en «${fn.nombre}»`);
    w.varint(x);
  }
  w.varint(lineas.length);
  let prev = 0;
  for (const l of lineas) { w.zigzag((l | 0) - prev); prev = l | 0; }

  enCurso.delete(fn);
}

// -------------------------------------------------------------- deserializar
function deserializar(bytes) {
  if (typeof bytes === 'string') bytes = deTexto(bytes);
  if (!(bytes instanceof Uint8Array)) {
    if (Array.isArray(bytes)) bytes = Uint8Array.from(bytes);
    else throw new ErrorBytecode('se esperaban bytes o un texto en base64');
  }
  bytes = normalizar(bytes);
  const r = new Lector(bytes);
  for (let i = 0; i < MAGIA.length; i++) {
    if (r.u8() !== MAGIA[i]) throw new ErrorBytecode('esto no es bytecode de Español-Like', i);
  }
  const v = r.u8();
  if (v !== VERSION_FORMATO) {
    throw new ErrorBytecode(`formato versión ${v}; este motor lee la ${VERSION_FORMATO}`, 4);
  }
  const h = r.u8() | (r.u8() << 8) | (r.u8() << 16) | (r.u8() << 24);
  if ((h >>> 0) !== huellaOpcodes()) {
    throw new ErrorBytecode('el archivo se compiló con otra tabla de instrucciones; vuelve a compilar el programa desde el código fuente', 5);
  }
  const fn = leerFn(r, 0);
  if (r.restantes !== 0) throw new ErrorBytecode(`sobran ${r.restantes} byte(s) al final`, r.p);
  return fn;
}

function leerFn(r, prof) {
  if (prof > MAX_ANIDAMIENTO) throw new ErrorBytecode('funciones anidadas demasiado hondo', r.p);
  const fn = new FuncionCompilada(r.texto(), r.varint());
  fn.nUpvalues = r.varint();
  fn.maxSlots = r.varint();
  fn.ast = null;          // explícito: sin AST no hay JIT, y eso es el punto
  fn.deDisco = true;
  if (fn.aridad > MAX_UPVALUES) throw new ErrorBytecode(`«${fn.nombre}» declara ${fn.aridad} parámetros`, r.p);
  if (fn.nUpvalues > MAX_UPVALUES) throw new ErrorBytecode(`«${fn.nombre}» declara ${fn.nUpvalues} capturas`, r.p);
  if (fn.maxSlots < 1 || fn.maxSlots > MAX_SLOTS) throw new ErrorBytecode(`«${fn.nombre}» declara ${fn.maxSlots} variables locales`, r.p);

  const nConsts = r.cuenta('pool de constantes');
  for (let i = 0; i < nConsts; i++) {
    const et = r.u8();
    switch (et) {
      case CTE_TEXTO: fn.chunk.consts.push(r.texto()); break;
      case CTE_ENTERO: fn.chunk.consts.push(r.zigzag()); break;
      case CTE_REAL: fn.chunk.consts.push(r.f64()); break;
      case CTE_FUNCION: fn.chunk.consts.push(leerFn(r, prof + 1)); break;
      default: throw new ErrorBytecode(`etiqueta de constante desconocida (${et})`, r.p - 1);
    }
  }

  const nCode = r.cuenta('código');
  for (let i = 0; i < nCode; i++) fn.chunk.code.push(r.varint());
  const nLineas = r.cuenta('tabla de líneas');
  if (nLineas !== nCode) throw new ErrorBytecode(`la tabla de líneas tiene ${nLineas} entradas y el código ${nCode}`, r.p);
  let prev = 0;
  for (let i = 0; i < nLineas; i++) { prev += r.zigzag(); fn.chunk.lineas.push(prev); }

  verificar(fn);
  return fn;
}

// --------------------------------------------------------------- verificación
// Un recorrido del código, igual que el del desensamblador, comprobando seis
// cosas. Sirve para lo que trae el archivo, no para lo que dice traer.
function verificar(fn) {
  const ch = fn.chunk, code = ch.code, n = code.length, consts = ch.consts;
  const donde = `«${fn.nombre}»`;
  if (n === 0) throw new ErrorBytecode(`${donde} no tiene código`);

  const inicios = new Set();   // posiciones donde empieza una instrucción
  const saltos = [];
  let i = 0;

  while (i < n) {
    const pos = i;
    inicios.add(pos);
    const op = code[i++];

    // 1. la instrucción existe y sus operandos caben
    if (!(op >= 0 && op < OP_NOMBRE.length)) {
      throw new ErrorBytecode(`${donde}: instrucción desconocida (${op}) en la posición ${pos}`);
    }
    const nArgs = OPERANDOS[op] || 0;
    if (i + nArgs > n) throw new ErrorBytecode(`${donde}: la instrucción ${OP_NOMBRE[op]} de la posición ${pos} se queda sin operandos`);
    const arg = nArgs ? code[i] : 0;
    i += nArgs;

    switch (op) {
      // 2. los índices al pool apuntan dentro, y a algo del tipo correcto
      case OP.CONST: case OP.GET_GLOBAL: case OP.SET_GLOBAL: case OP.DEF_GLOBAL: case OP.PROP_GET:
        if (arg >= consts.length) throw new ErrorBytecode(`${donde}: ${OP_NOMBRE[op]} pide la constante ${arg} y solo hay ${consts.length}`);
        if (consts[arg] instanceof FuncionCompilada) throw new ErrorBytecode(`${donde}: ${OP_NOMBRE[op]} usa una función como si fuera un valor`);
        if (op !== OP.CONST && typeof consts[arg] !== 'string') throw new ErrorBytecode(`${donde}: ${OP_NOMBRE[op]} necesita un nombre de texto`);
        break;

      // 3. CLOSURE apunta a una función y trae sus descriptores de captura
      case OP.CLOSURE: {
        if (arg >= consts.length) throw new ErrorBytecode(`${donde}: CLOSURE pide la constante ${arg} y solo hay ${consts.length}`);
        const sub = consts[arg];
        if (!(sub instanceof FuncionCompilada)) throw new ErrorBytecode(`${donde}: CLOSURE no apunta a una función`);
        if (i + sub.nUpvalues * 2 > n) throw new ErrorBytecode(`${donde}: faltan descriptores de captura de «${sub.nombre}»`);
        for (let k = 0; k < sub.nUpvalues; k++) {
          const esLocal = code[i++], idx = code[i++];
          if (esLocal !== 0 && esLocal !== 1) throw new ErrorBytecode(`${donde}: descriptor de captura corrupto (${esLocal})`);
          const tope = esLocal ? fn.maxSlots : fn.nUpvalues;
          if (idx >= tope) throw new ErrorBytecode(`${donde}: «${sub.nombre}» captura ${esLocal ? 'la local' : 'la captura'} ${idx}, fuera de rango`);
        }
        break;
      }

      // 4. las variables locales caben en el marco que la función declara
      case OP.GET_LOCAL: case OP.SET_LOCAL:
        if (arg >= fn.maxSlots) throw new ErrorBytecode(`${donde}: ${OP_NOMBRE[op]} ${arg} se sale del marco (${fn.maxSlots} variables)`);
        break;

      // 5. las capturas caben en las que la función declara
      case OP.GET_UP: case OP.SET_UP:
        if (arg >= fn.nUpvalues) throw new ErrorBytecode(`${donde}: ${OP_NOMBRE[op]} ${arg} y solo hay ${fn.nUpvalues} captura(s)`);
        break;

      case OP.JMP: case OP.JMP_FALSE: case OP.JMP_TRUE: saltos.push([pos, i + arg]); break;
      case OP.LOOP: saltos.push([pos, i - arg]); break;
    }
  }

  // 6. todo salto cae en el principio de una instrucción de esta misma función.
  //    Es la comprobación que más importa: saltar a mitad de una instrucción
  //    desincroniza el descodificador y a partir de ahí los operandos se
  //    ejecutan como si fueran opcodes.
  for (const [desde, a] of saltos) {
    if (!inicios.has(a)) throw new ErrorBytecode(`${donde}: el salto de la posición ${desde} va a ${a}, que no es el principio de ninguna instrucción`);
  }
  if (code[n - 1] !== OP.RET || !inicios.has(n - 1)) {
    throw new ErrorBytecode(`${donde}: el código no termina en RET`);
  }
  return fn;
}

// El mismo programa viaja de dos maneras: el archivo binario, y ese mismo
// archivo escrito en base64 cuando solo se puede mover texto (un correo, un
// portapapeles, un entorno donde solo se dejan descargar ciertas extensiones).
// Se distinguen por la marca del principio, así que cargar acepta las dos sin
// que quien carga tenga que saber cuál tiene delante.
function normalizar(bytes) {
  if (bytes.length >= 4 && bytes[0] === MAGIA[0] && bytes[1] === MAGIA[1] &&
      bytes[2] === MAGIA[2] && bytes[3] === MAGIA[3]) return bytes;
  let texto = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 9 || c === 10 || c === 13 || c === 32) continue;
    if (c > 126 || B64_INV[c] < 0 && c !== 61 /* = */) return bytes;  // no es base64: que falle por la marca
    texto += String.fromCharCode(c);
  }
  if (!texto) return bytes;
  return deTexto(texto);
}

// --------------------------------------------------------------- base64
// Propio, para que el mismo código valga en Node y en el navegador y no
// dependa de Buffer ni de atob.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => { const m = new Int16Array(256).fill(-1); for (let i = 0; i < 64; i++) m[B64.charCodeAt(i)] = i; return m; })();

function aTexto(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2];
    s += B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    s += b === undefined ? '=' : B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    s += c === undefined ? '=' : B64[c & 63];
  }
  return s;
}

function deTexto(texto) {
  const limpio = String(texto).replace(/[\s]/g, '').replace(/=+$/, '');
  const out = new Uint8Array(Math.floor(limpio.length * 3 / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < limpio.length; i++) {
    const v = B64_INV[limpio.charCodeAt(i)];
    if (v < 0) throw new ErrorBytecode(`carácter inválido en el texto del bytecode («${limpio[i]}»)`, i);
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out.subarray(0, o);
}


// ============================================================================
//  Ñ v4 — MÓDULOS: resolución, enlace y registro
//  Parte 6 de 6.
//
//  Hasta aquí un programa era un archivo. Partirlo en varios exige tres cosas
//  que no son la misma: encontrar el archivo, decidir a qué se refiere cada
//  nombre, y ejecutar cada archivo una sola vez. Las tres viven aquí.
//
//  Tres decisiones gobiernan el resto:
//
//  1. ENCONTRAR EL ARCHIVO ES DEL ANFITRIÓN. El motor no sabe leer nada. En el
//     navegador la zona aislada no tiene sistema de archivos —no es una
//     carencia, es la frontera de seguridad— así que `usar` solo existe cuando
//     el anfitrión ofrece `host.modulos`, igual que `leerTexto` solo existe
//     cuando ofrece `host.archivos`. El motor pide dos cosas y nada más:
//         resolver(especificador, desdeClave) → clave canónica
//         leer(clave)                        → el texto del módulo
//
//  2. EL ENLACE ES DE COMPILACIÓN, NO DE EJECUCIÓN. Cada nombre de nivel
//     superior de un módulo es un global cuyo nombre lleva delante la clave del
//     módulo y un \0 —un byte que el léxico no puede producir, así que ningún
//     programa puede escribir ese nombre a mano. `mates.sumar` se compila a un
//     GET_GLOBAL de «/ruta/mates.esl\0sumar». Consecuencias, todas buenas:
//     sigue habiendo UNA tabla de globales (el recolector, el panel de memoria y
//     el serializador ven lo que veían siempre), no hay ni un opcode nuevo —los
//     .elb de antes siguen valiendo—, el JIT sigue funcionando dentro de los
//     módulos, y un miembro que no existe o un nombre que no se exporta se
//     detectan al compilar y no al ejecutar.
//
//  3. LOS CICLOS SE RESUELVEN CON LA ELEVACIÓN QUE YA HABÍA. El compilador ya
//     emitía las funciones del nivel superior antes que el resto del archivo.
//     Las importaciones se emiten justo después: cuando A importa B y B importa
//     A, A ya tiene sus funciones definidas antes de que B empiece, así que B
//     las ve. Lo que no ve son los valores que A calcula más abajo, y eso se
//     dice con un mensaje que nombra el ciclo en vez de desbordar la pila.
// ============================================================================

// El separador entre la clave del módulo y el nombre. Es \0 a propósito: el
// léxico solo acepta letras, dígitos y «_» en un identificador, así que un
// programa no puede nombrar uno de estos globales ni por accidente ni queriendo.
const SEP_MODULO = '\u0000';

function nombreGlobalModulo(clave, nombre) { return clave + SEP_MODULO + nombre; }

// Los eDSL que vienen dentro del motor no están en ningún disco, pero por
// dentro son módulos como cualquier otro: sus funciones son globales con la
// clave delante, y por tanto un programa no puede escribir ese nombre a mano ni
// tropezarse con ellas sin un «usar». Lo único propio es de dónde salen:
//
//   usar "numerico"        → eDSL nativo, sin tocar el disco, sin anfitrión
//   usar "./numerico.esl"  → el archivo del usuario, como siempre
//
// El especificador desnudo es siempre el nativo: eso hace que «usar "texto"»
// signifique lo mismo en el navegador, en Node y dentro de un .elb, y que un
// archivo llamado texto.esl en la carpeta de al lado no pueda cambiar el
// significado de un programa ajeno.
const CLAVE_EDSL = 'ñ:';
function claveEdsl(nombre) { return CLAVE_EDSL + nombre; }

// Solo el nombre del archivo: las claves son rutas absolutas y en un mensaje de
// error lo que ayuda es «mates.esl», no cuarenta caracteres de carpeta.
function rutaCorta(clave) { return String(clave).replace(/^.*[/\\]/, '') || String(clave); }

// El mensaje de «no está definida» para un global que puede venir de un módulo.
// Sin esto, un ciclo se explicaba con ««/tmp/a.esl\0x» no está definida».
function mensajeNoDefinida(n) {
  const i = String(n).indexOf(SEP_MODULO);
  if (i < 0) return { msg: `«${n}» no está definida`, pista: null };
  return {
    msg: `«${n.slice(i + 1)}» de «${rutaCorta(n.slice(0, i))}» todavía no está definida`,
    pista: 'suele ser un ciclo de importación: el valor se usa antes de que su módulo llegue a calcularlo — las funciones sí se ven, los valores de nivel superior no',
  };
}

// ---------------------------------------------------------------- exportaciones
// Lo que un archivo exporta se sabe SIN mirar los cuerpos: son las declaraciones
// de nivel superior marcadas con «publico», y su tipo sale de la anotación. Eso
// es lo que hace que un ciclo no sea un problema al analizar: para saber qué
// exporta A no hay que analizar A, basta con haberlo leído.
function exportacionesDe(ast) {
  const ex = new Map();
  for (const s of ast.cuerpo) {
    if (!s.publico) continue;
    if (s.tipo === 'DeclFuncion')
      ex.set(s.nombre, T.fn(s.params.map(p => p.anotacion || T.cualquiera), s.retorno || T.cualquiera));
    else if (s.tipo === 'DeclVar')
      ex.set(s.nombre, s.anotacion || (s.valor && s.valor.tipoLit) || T.cualquiera);
  }
  return ex;
}

// ------------------------------------------------------------------- el registro
// Guarda lo que ya se ha leído y analizado, con la clave canónica como
// identidad. Es lo que hace que un módulo importado por tres archivos se lea,
// se compile y se ejecute una sola vez.
class Modulos {
  constructor(cargador, claveRaiz, edsls) {
    this.cargador = cargador || null;
    this.claveRaiz = claveRaiz || null;
    this.edsls = edsls || new Map();
    this.ast = new Map();         // clave → AST
    this.exporta = new Map();     // clave → Map(nombre → tipo)
    this.orden = [];              // claves, en el orden en que se descubrieron
  }

  resolver(espec, desde, nodo) {
    let clave;
    try { clave = this.cargador.resolver(espec, desde || null); }
    catch (e) { throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col); }
    if (typeof clave !== 'string' || !clave)
      throw new ErrorFuente('módulos', `el anfitrión no supo resolver «${espec}»`, nodo.linea, nodo.col);
    if (clave.indexOf(SEP_MODULO) >= 0)
      throw new ErrorFuente('módulos', `la clave de «${espec}» trae un byte cero`, nodo.linea, nodo.col);
    return clave;
  }

  astDe(clave, nodo) {
    if (this.ast.has(clave)) return this.ast.get(clave);
    let fuente;
    try { fuente = this.cargador.leer(clave); }
    catch (e) { throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col); }
    if (typeof fuente !== 'string')
      throw new ErrorFuente('módulos', `«${rutaCorta(clave)}» no se pudo leer`, nodo.linea, nodo.col);
    let a;
    try { a = parser(lexer(fuente), clave); }
    catch (e) {
      // El error es del módulo, no del archivo que lo importa: su línea y su
      // columna son las de allí, y hay que decir de qué archivo se habla.
      if (e && e.esErrorFuente) { e.archivo = rutaCorta(clave); throw e; }
      throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col);
    }
    this.ast.set(clave, a);
    this.orden.push(clave);
    return a;
  }

  exportaDe(clave, nodo) {
    if (this.exporta.has(clave)) return this.exporta.get(clave);
    const ex = exportacionesDe(this.astDe(clave, nodo));
    this.exporta.set(clave, ex);
    return ex;
  }
}

// ------------------------------------------------------------------- el enlace
// Un «enlace» es lo que el compilador y el JIT necesitan saber de un archivo
// para traducir sus nombres: cuáles son suyos, cuáles vienen de fuera, y qué
// alias corresponde a qué módulo.
//
//   clave     la del archivo, o null para el programa principal
//   propias   sus declaraciones de nivel superior
//   nombres   nombre → { clave, global, tipo }     (usar a, b de "…")
//   alias     alias  → { clave, ruta, exporta }    (usar "…" como m)
//   deps      claves de los módulos que importa, en orden
//
// El programa principal tiene enlace pero no clave: sus globales NO llevan
// prefijo. No es una excepción por comodidad — es lo que mantiene su bytecode
// libre de rutas absolutas, y por tanto un .elb portable.
function enlazar(ast, clave, mods, errores, avisos, globalesTipos) {
  const enl = { clave: clave || null, propias: new Set(), nombres: new Map(), alias: new Map(), deps: [] };
  // Desde dónde se resuelven las rutas relativas: el archivo en el que está
  // escrito el «usar». Para un módulo es su clave; para el programa principal,
  // que no tiene clave porque sus globales no llevan prefijo, es la ruta con la
  // que el anfitrión lo abrió. Confundir las dos cosas hacía que el programa
  // principal resolviera contra el directorio de trabajo: funcionaba mientras se
  // lanzara desde la carpeta del programa y fallaba en cuanto no.
  const desde = clave || mods.claveRaiz || null;
  for (const s of ast.cuerpo)
    if (s.tipo === 'DeclVar' || s.tipo === 'DeclFuncion') enl.propias.add(s.nombre);

  const ocupado = n => enl.propias.has(n) || enl.nombres.has(n) || enl.alias.has(n);
  const avisarSiTapa = (nodo, n) => {
    if (globalesTipos && Object.prototype.hasOwnProperty.call(globalesTipos, n))
      avisos.push(new ErrorFuente('nombres', `lo importado como «${n}» tapa a la «${n}» de la biblioteca`,
        nodo.linea, nodo.col, `a partir de aquí «${n}» ya no es la de Ñ; si no era la idea, tráelo con «usar … como …»`));
  };

  for (const s of ast.cuerpo) {
    if (s.tipo !== 'Usar') continue;
    let destino, exporta;
    // Primero los nativos. No es un atajo: es lo que hace que el nombre desnudo
    // signifique lo mismo en todas partes, y lo que evita que resolver un eDSL
    // dependa de que exista un disco.
    const nat = mods.edsls.get(s.ruta);
    if (nat) {
      destino = nat.clave;
      exporta = nat.exporta;
    } else try {
      destino = mods.resolver(s.ruta, desde, s);
      if (mods.claveRaiz && destino === mods.claveRaiz)
        throw new ErrorFuente('módulos', `«${s.ruta}» es el programa principal, y el programa principal no es un módulo`,
          s.linea, s.col, 'mueve a un archivo aparte lo que quieras compartir');
      exporta = mods.exportaDe(destino, s);
    } catch (e) {
      errores.push(e && e.esErrorFuente ? e : new ErrorFuente('módulos', String((e && e.message) || e), s.linea, s.col));
      continue;
    }
    s.claveResuelta = destino;
    if (!enl.deps.includes(destino)) enl.deps.push(destino);
    if (!exporta.size)
      avisos.push(new ErrorFuente('módulos', `«${s.ruta}» no exporta nada`, s.linea, s.col,
        'marca con «publico» lo que deba verse desde fuera'));

    // «usar "x"» a secas: todo lo que exporte, con su nombre, sin cualificar.
    // Es como escribir la lista entera a mano, así que pasa por el mismo camino
    // —enl.nombres— y el compilador, el JIT y el verificador no se enteran.
    if (s.todo) {
      for (const [nm, tipo] of exporta) {
        if (ocupado(nm)) {
          // Lo propio del archivo gana, en silencio: quien escribe «usar
          // "clasico"» y además define su propia «media» quiere la suya.
          continue;
        }
        avisarSiTapa(s, nm);
        enl.nombres.set(nm, {
          clave: destino, ruta: s.ruta, tipo, deTodo: true,
          // «clasico» reexporta: su global de verdad está en el eDSL de donde
          // salió el nombre, no bajo la clave de «clasico».
          global: (nat && nat.globalDe) ? nat.globalDe.get(nm) : nombreGlobalModulo(destino, nm),
          deClasico: !!(nat && nat.globalDe),
          nombre: nm,
          edslOrigen: (nat && nat.origenDe) ? nat.origenDe.get(nm) : null,
          cuantosTraia: exporta.size,
        });
      }
      continue;
    }

    if (s.alias) {
      if (ocupado(s.alias)) {
        errores.push(new ErrorFuente('módulos', `«${s.alias}» ya está usado en este archivo`, s.linea, s.col));
        continue;
      }
      avisarSiTapa(s, s.alias);
      enl.alias.set(s.alias, { clave: destino, ruta: s.ruta, exporta,
        globalDe: (nat && nat.globalDe) || null });
      continue;
    }
    for (const nm of s.nombres) {
      if (!exporta.has(nm.nombre)) {
        errores.push(new ErrorFuente('módulos', `«${s.ruta}» no exporta «${nm.nombre}»`, nm.linea, nm.col,
          exporta.size ? 'exporta: ' + [...exporta.keys()].join(', ') : 'no exporta nada: márcalo con «publico»'));
        continue;
      }
      if (ocupado(nm.nombre)) {
        errores.push(new ErrorFuente('módulos', `«${nm.nombre}» ya está usado en este archivo`, nm.linea, nm.col));
        continue;
      }
      avisarSiTapa(nm, nm.nombre);
      enl.nombres.set(nm.nombre, {
        clave: destino, ruta: s.ruta,
        global: (nat && nat.globalDe) ? nat.globalDe.get(nm.nombre) : nombreGlobalModulo(destino, nm.nombre),
        tipo: exporta.get(nm.nombre),
      });
    }
  }
  return enl;
}

// A qué global se refiere un nombre libre de este archivo. Lo usan el
// compilador y el JIT, y tienen que decir lo mismo: si se separan, una función
// da un resultado distinto a partir de su cuadragésima llamada.
function globalDeEnlace(enl, nombre) {
  if (!enl) return nombre;
  const imp = enl.nombres.get(nombre);
  if (imp) return imp.global;
  if (enl.clave && enl.propias.has(nombre)) return nombreGlobalModulo(enl.clave, nombre);
  return nombre;                      // de la biblioteca, o no existe
}

// «m.algo» donde m es el alias de un módulo → el global de allí. Devuelve null
// si m no es un alias, y entonces es un acceso a propiedad de los de siempre.
function miembroDeEnlace(enl, alias, miembro) {
  if (!enl) return null;
  const a = enl.alias.get(alias);
  if (!a) return null;
  return a.globalDe ? (a.globalDe.get(miembro) || nombreGlobalModulo(a.clave, miembro))
    : nombreGlobalModulo(a.clave, miembro);
}


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


// ============================================================================
//  Ñ v4 — eDSL «fecha»: el calendario, sin zonas horarias
//  Parte 8.
//
//  Se importa con:  usar "fecha"
//
//  Antes de esto el lenguaje no tenía nada: «ahora()» daba milisegundos y se
//  acabó. Guardar una fecha como texto parece que funciona hasta que hay que
//  ordenarla, y entonces «10/02» es menor que «9/01». Eso es lo que quita el
//  tipo: «<» y «==» funcionan solos, y el verificador para el programa que
//  mezcla una fecha con un texto antes de ejecutarlo.
//
//  UNA DECISIÓN GOBIERNA TODO LO DEMÁS: una fecha de Ñ no tiene zona horaria.
//  Es un instante del calendario —como el TIMESTAMP WITHOUT TIME ZONE de SQL o
//  el LocalDateTime de Java—, así que lo que se escribe es lo que se lee, en
//  cualquier máquina, sin horario de verano ni desplazamientos. Por dentro son
//  milisegundos que SIEMPRE se leen con los getters UTC de JavaScript; el reloj
//  local solo se mira en «hoy()» y «ahora()», una vez, al nacer la fecha.
//
//  La otra decisión: las funciones «…Entre» miden tiempo TRANSCURRIDO y truncan
//  hacia cero, todas igual. Para contar días de calendario en vez de días
//  completos, se compone: diasEntre(inicioDia(a), inicioDia(b)).
// ============================================================================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// En español la semana empieza el lunes, así que diaSemana() devuelve 1 para el
// lunes y 7 para el domingo. JavaScript cuenta desde el domingo; se traduce.
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const DIA_MS = 86400000;
const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasMes = (a, m) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];

// Los milisegundos de un instante del calendario. Date.UTC normaliza de balde
// —el mes 12 es enero del año siguiente—, que es lo que hace que sumarMeses y
// sumarDias no tengan que contar nada a mano.
const msDe = (a, m, d, h, mi, s, ms) => Date.UTC(a, m, d, h || 0, mi || 0, s || 0, ms || 0);
const partes = f => {
  const d = new Date(f.ms);
  return { a: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(),
    // lunes = 0
    sem: (d.getUTCDay() + 6) % 7 };
};

function instalarFecha(vm) {
  const D = () => vm.nuevoDic();
  const F = ms => vm.nuevaFecha(ms);
  const fch = (v, n, f) => vm.exigeFecha(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  // Comprueba que el día exista de verdad: el 31 de febrero no es una fecha, y
  // dejarlo pasar como el 3 de marzo es de las cosas que hay que no hacer.
  const valida = (a, m, d, f) => {
    if (m < 1 || m > 12) vm.error(`«${f}»: el mes ${m} no existe`, 'los meses van de 1 a 12');
    const max = diasMes(a, m - 1);
    if (d < 1 || d > max)
      vm.error(`«${f}»: ${d} no es un día de ${MESES[m - 1]} de ${a}`, `ese mes tiene ${max} días`);
  };
  // Al sumar meses o años el día se recorta al último del mes destino: el 31 de
  // enero más un mes es el 28 de febrero. Sin esto se desborda a marzo, que es
  // el fallo clásico de la aritmética de calendario.
  const moverMeses = (f, n) => {
    const p = partes(f);
    const total = p.a * 12 + p.m + n;
    const a = Math.floor(total / 12), m = ((total % 12) + 12) % 12;
    return F(msDe(a, m, Math.min(p.d, diasMes(a, m)), p.h, p.mi, p.s, p.ms));
  };
  const truncaDiv = (ms, u) => Math.trunc(ms / u);

  // Meses CUMPLIDOS de «a» a «b». Aquí NO vale el recorte de sumarMeses: si se
  // usa, el 31 de enero «alcanza» al 28 de febrero y sale 1 mes donde no ha
  // pasado un mes. La regla correcta es la del aniversario: el mes está
  // cumplido cuando el día —y la hora, si la hay— del destino ya llegó al del
  // origen. Es lo que hace cualquiera al contar una edad, y lo que necesita
  // «aniosEntre», que se calcula a partir de esto para no tener dos reglas.
  const meses = (a, b) => {
    const p = partes(a), q = partes(b);
    let n = (q.a - p.a) * 12 + (q.m - p.m);
    const hora = x => x.h * 3600000 + x.mi * 60000 + x.s * 1000 + x.ms;
    // Tres casos, no dos: el día del destino está DESPUÉS, ANTES, o es el
    // mismo. Cuando es el mismo no se ajusta nada en ninguna dirección —
    // tratarlo como «después» daba -1 donde había exactamente -2 meses.
    const rel = q.d !== p.d ? (q.d > p.d ? 1 : -1)
      : (hora(q) === hora(p) ? 0 : (hora(q) > hora(p) ? 1 : -1));
    if (n > 0 && rel < 0) n--;
    else if (n < 0 && rel > 0) n++;
    return n;
  };

  return function (def) {
    // ──────────────────────────────────────────────────────────── construir
    def('fecha', 'entero, entero, entero -> fecha', a => {
      const an = ent(a[0], 1, 'fecha'), m = ent(a[1], 2, 'fecha'), d = ent(a[2], 3, 'fecha');
      valida(an, m, d, 'fecha');
      return F(msDe(an, m - 1, d));
    }, 'fecha(2026, 9, 29) — el mes va de 1 a 12, como se dice en voz alta');
    def('fechaHora', '... -> fecha', a => {
      if (a.length < 5) vm.error('«fechaHora» necesita al menos año, mes, día, hora y minuto');
      const an = ent(a[0], 1, 'fechaHora'), m = ent(a[1], 2, 'fechaHora'), d = ent(a[2], 3, 'fechaHora');
      valida(an, m, d, 'fechaHora');
      return F(msDe(an, m - 1, d, ent(a[3], 4, 'fechaHora'), ent(a[4], 5, 'fechaHora'),
        a.length > 5 ? ent(a[5], 6, 'fechaHora') : 0));
    }, 'fechaHora(2026, 9, 29, 14, 30) — y opcionalmente los segundos');
    def('hoy', ' -> fecha', () => {
      // El único sitio, con «ahora», donde se mira el reloj de la máquina: se
      // lee el día LOCAL y desde ahí ya es aritmética de calendario.
      const n = new Date();
      return F(msDe(n.getFullYear(), n.getMonth(), n.getDate()));
    }, 'el día de hoy, a medianoche');
    def('ahora', ' -> fecha', () => {
      const n = new Date();
      return F(msDe(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()));
    }, 'este momento — tapa a la «ahora» de la biblioteca, que da milisegundos');
    def('aFecha', 'texto -> fecha', a => {
      const s = txt(a[0], 1, 'aFecha').trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (!m) {
        // El formato de aquí: 29/09/2026. Se acepta porque es el que sale de un
        // CSV hecho en español, y no admitirlo obligaría a partir el texto a mano.
        const e = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (e) m = [e[0], e[3], e[2], e[1], e[4], e[5], e[6]];
      }
      if (!m) vm.error(`«aFecha»: no entiendo «${s}»`,
        'formatos que lee: 2026-09-29 · 2026-09-29 14:30 · 29/09/2026');
      const an = +m[1], me = +m[2], d = +m[3];
      valida(an, me, d, 'aFecha');
      return F(msDe(an, me - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    }, 'aFecha("29/09/2026") · aFecha("2026-09-29 14:30")');
    def('desdeMarca', 'real -> fecha', a => F(ent(a[0], 1, 'desdeMarca')),
      'desde milisegundos desde 1970 — lo que devuelve la «ahora» de la biblioteca');

    // ────────────────────────────────────────────────────── leer las partes
    const leer = (nombre, fn, doc) => def(nombre, 'fecha -> entero', a => fn(partes(fch(a[0], 1, nombre))), doc);
    leer('anio', p => p.a, 'el año');
    leer('mes', p => p.m + 1, 'el mes, de 1 a 12');
    leer('dia', p => p.d, 'el día del mes');
    leer('hora', p => p.h, 'la hora, de 0 a 23');
    leer('minuto', p => p.mi, 'el minuto');
    leer('segundo', p => p.s, 'el segundo');
    leer('diaSemana', p => p.sem + 1, 'de 1 (lunes) a 7 (domingo) — en español la semana empieza el lunes');
    leer('trimestre', p => Math.floor(p.m / 3) + 1, 'de 1 a 4');
    def('diaDelAnio', 'fecha -> entero', a => {
      const p = partes(fch(a[0], 1, 'diaDelAnio'));
      return Math.round((p.a === 0 ? 0 : 0) + (msDe(p.a, p.m, p.d) - msDe(p.a, 0, 1)) / DIA_MS) + 1;
    }, 'de 1 a 365 (o 366)');
    def('semana', 'fecha -> entero', a => {
      // Semana ISO 8601: la primera del año es la que contiene el jueves.
      const p = partes(fch(a[0], 1, 'semana'));
      const jue = msDe(p.a, p.m, p.d + (3 - p.sem));
      const ene1 = new Date(jue).getUTCFullYear();
      return Math.floor((jue - msDe(ene1, 0, 1)) / (7 * DIA_MS)) + 1;
    }, 'el número de semana ISO, de 1 a 53');

    // ─────────────────────────────────────────────── los nombres, en español
    const nombra = (nombre, fn, doc) => def(nombre, 'fecha -> texto', a => fn(partes(fch(a[0], 1, nombre))), doc);
    nombra('nombreMes', p => MESES[p.m], 'nombreMes(hoy()) → «septiembre» — en minúscula, como se escribe en español');
    nombra('nombreDia', p => DIAS[p.sem], 'nombreDia(hoy()) → «martes»');
    nombra('mesCorto', p => MES_CORTO[p.m], 'mesCorto → «sep»');
    nombra('diaCorto', p => DIA_CORTO[p.sem], 'diaCorto → «mar»');

    // ───────────────────────────────────────────────────────────────── mover
    const mueve = (nombre, u, doc) => def(nombre, 'fecha, entero -> fecha',
      a => F(fch(a[0], 1, nombre).ms + ent(a[1], 2, nombre) * u), doc);
    mueve('sumarSegundos', 1000, 'suma segundos · con un número negativo, resta');
    mueve('sumarMinutos', 60000, 'suma minutos');
    mueve('sumarHoras', 3600000, 'suma horas');
    mueve('sumarDias', DIA_MS, 'suma días — sin horario de verano, un día son 24 horas siempre');
    mueve('sumarSemanas', 7 * DIA_MS, 'suma semanas');
    def('sumarMeses', 'fecha, entero -> fecha', a => moverMeses(fch(a[0], 1, 'sumarMeses'), ent(a[1], 2, 'sumarMeses')),
      'suma meses · el 31 de enero más 1 mes es el 28 de febrero, no el 3 de marzo');
    def('sumarAnios', 'fecha, entero -> fecha', a => moverMeses(fch(a[0], 1, 'sumarAnios'), ent(a[1], 2, 'sumarAnios') * 12),
      'suma años · el 29 de febrero más 1 año es el 28 de febrero');

    // ──────────────────────────────────────────────────────────────── bordes
    const borde = (nombre, fn, doc) => def(nombre, 'fecha -> fecha', a => fn(partes(fch(a[0], 1, nombre))), doc);
    borde('inicioDia', p => F(msDe(p.a, p.m, p.d)), 'ese día a las 00:00:00');
    borde('finDia', p => F(msDe(p.a, p.m, p.d, 23, 59, 59, 999)), 'ese día a las 23:59:59.999');
    borde('inicioSemana', p => F(msDe(p.a, p.m, p.d - p.sem)), 'el lunes de esa semana, a medianoche');
    borde('finSemana', p => F(msDe(p.a, p.m, p.d + (6 - p.sem), 23, 59, 59, 999)), 'el domingo de esa semana, al final');
    borde('inicioMes', p => F(msDe(p.a, p.m, 1)), 'el día 1 de ese mes');
    borde('finMes', p => F(msDe(p.a, p.m, diasMes(p.a, p.m), 23, 59, 59, 999)), 'el último día de ese mes, al final');
    borde('inicioAnio', p => F(msDe(p.a, 0, 1)), 'el 1 de enero de ese año');
    borde('finAnio', p => F(msDe(p.a, 11, 31, 23, 59, 59, 999)), 'el 31 de diciembre de ese año, al final');

    // ───────────────────────────────────────────────────── medir distancias
    // Todas miden tiempo TRANSCURRIDO y truncan hacia cero. Para días de
    // calendario: diasEntre(inicioDia(a), inicioDia(b)).
    const mide = (nombre, u, doc) => def(nombre, 'fecha, fecha -> entero',
      a => truncaDiv(fch(a[1], 2, nombre).ms - fch(a[0], 1, nombre).ms, u), doc);
    mide('segundosEntre', 1000, 'segundos completos de la primera a la segunda · negativo si va al revés');
    mide('minutosEntre', 60000, 'minutos completos');
    mide('horasEntre', 3600000, 'horas completas');
    mide('diasEntre', DIA_MS, 'días completos · para días de calendario: diasEntre(inicioDia(a), inicioDia(b))');
    def('mesesEntre', 'fecha, fecha -> entero', a => meses(fch(a[0], 1, 'mesesEntre'), fch(a[1], 2, 'mesesEntre')),
      'meses cumplidos · del 31 de enero al 28 de febrero es 0, porque 28 aún no llega a 31');
    def('aniosEntre', 'fecha, fecha -> entero', a =>
      Math.trunc(meses(fch(a[0], 1, 'aniosEntre'), fch(a[1], 2, 'aniosEntre')) / 12),
      'años cumplidos — sirve para calcular una edad');
    def('duracion', 'fecha, fecha -> dic<texto,entero>', a => {
      let ms = Math.abs(fch(a[1], 2, 'duracion').ms - fch(a[0], 1, 'duracion').ms);
      const d = D();
      d.mapa.set('dias', Math.trunc(ms / DIA_MS)); ms %= DIA_MS;
      d.mapa.set('horas', Math.trunc(ms / 3600000)); ms %= 3600000;
      d.mapa.set('minutos', Math.trunc(ms / 60000)); ms %= 60000;
      d.mapa.set('segundos', Math.trunc(ms / 1000));
      return d;
    }, 'la distancia partida en días, horas, minutos y segundos');

    // ────────────────────────────────────────────────────────────  preguntar
    def('esBisiesto', 'fecha -> bool', a => bisiesto(partes(fch(a[0], 1, 'esBisiesto')).a),
      'si el año de esa fecha es bisiesto');
    def('diasDelMes', 'fecha -> entero', a => {
      const p = partes(fch(a[0], 1, 'diasDelMes'));
      return diasMes(p.a, p.m);
    }, 'cuántos días tiene el mes de esa fecha');
    def('esFinDeSemana', 'fecha -> bool', a => partes(fch(a[0], 1, 'esFinDeSemana')).sem >= 5,
      'sábado o domingo');
    def('esMismoDia', 'fecha, fecha -> bool', a => {
      const p = partes(fch(a[0], 1, 'esMismoDia')), q = partes(fch(a[1], 2, 'esMismoDia'));
      return p.a === q.a && p.m === q.m && p.d === q.d;
    }, 'el mismo día del calendario, sin mirar la hora');
    def('estaEntre', 'fecha, fecha, fecha -> bool', a => {
      const x = fch(a[0], 1, 'estaEntre').ms, d = fch(a[1], 2, 'estaEntre').ms, h = fch(a[2], 3, 'estaEntre').ms;
      return x >= Math.min(d, h) && x <= Math.max(d, h);
    }, 'estaEntre(f, desde, hasta) — con los extremos incluidos');
    def('esAntesDe', 'fecha, fecha -> bool', a => fch(a[0], 1, 'esAntesDe').ms < fch(a[1], 2, 'esAntesDe').ms,
      'lo mismo que «a < b», para cuando se lee mejor');
    def('esDespuesDe', 'fecha, fecha -> bool', a => fch(a[0], 1, 'esDespuesDe').ms > fch(a[1], 2, 'esDespuesDe').ms,
      'lo mismo que «a > b»');

    // ─────────────────────────────────────────────────────────────── sacarla
    def('deFecha', '... -> texto', a => {
      const f = fch(a[0], 1, 'deFecha'), p = partes(f);
      const forma = a.length > 1 ? txt(a[1], 2, 'deFecha') : 'iso';
      const dd = (n, an) => String(n).padStart(an || 2, '0');
      const hm = `${dd(p.h)}:${dd(p.mi)}`;
      switch (forma) {
        case 'iso': return isoDeFecha(f);
        case 'corta': return `${dd(p.d)}/${dd(p.m + 1)}/${p.a}`;
        case 'larga': return `${p.d} de ${MESES[p.m]} de ${p.a}`;
        case 'mes': return `${MESES[p.m]} de ${p.a}`;
        case 'hora': return hm;
        case 'completa': return `${DIAS[p.sem]}, ${p.d} de ${MESES[p.m]} de ${p.a}, ${hm}`;
        default: vm.error(`«deFecha»: no conozco el formato «${forma}»`,
          'formatos: iso · corta · larga · mes · hora · completa');
      }
    }, 'deFecha(f, "larga") → «29 de septiembre de 2026» · iso, corta, larga, mes, hora, completa');
    def('aIso', 'fecha -> texto', a => isoDeFecha(fch(a[0], 1, 'aIso')),
      'la forma canónica, que «aFecha» vuelve a leer');
    def('aMarca', 'fecha -> real', a => fch(a[0], 1, 'aMarca').ms,
      'los milisegundos de dentro — la puerta de atrás para cuando hace falta el número');
  };
}


// ============================================================================
//  Ñ v4 — eDSL «probar»: para que Ñ se pruebe a sí mismo
//  Parte 9.
//
//  Se importa con:  usar "probar"
//
//  Hay un detalle que dice mucho del estado del proyecto: las pruebas de Ñ
//  están escritas en JavaScript. El lenguaje no podía probarse a sí mismo, y
//  eso encarece cada eDSL nuevo —cincuenta funciones nuevas significan
//  cincuenta bloques de prueba en otro lenguaje—. Esto es lo que lo arregla.
//
//  LO ÚNICO DELICADO: correr una prueba que falla sin tumbar el programa. Una
//  afirmación fallida llama a vm.error(), que lanza; si nadie recoge, el
//  programa entero se cae y la segunda prueba no llega a correr. Recogerlo en
//  una nativa deja la VM a medio desenrollar —marcos empujados, pila de
//  valores alta, upvalues abiertos apuntando a ranuras muertas—, así que el
//  corredor tiene que hacer desde fuera lo mismo que hace «desenrollar» por
//  dentro: recortar los marcos, bajar la pila y cerrar los upvalues.
//
//  Y una cosa que NO se recoge: el límite de instrucciones. Si se capturara,
//  una prueba con un bucle infinito desactivaría la única red que hay contra
//  los bucles infinitos. Se vuelve a lanzar tal cual.
// ============================================================================

function instalarProbar(vm) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const fn_ = (v, n, f) => vm.exigeFuncion(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const num = (v, n, f) => vm.exigeNum(v, n, f);

  // El estado es de este motor, no global: dos motores no comparten pruebas.
  const est = {
    casos: [],            // { nombre, fn, grupo, saltada, solo }
    pila: [],             // los grupos abiertos, mientras se registran
    antesTodo: [], despuesTodo: [], antesCada: [], despuesCada: [],
    corriendo: false,
    afirmaciones: 0,
    ultimo: { pasan: 0, fallan: 0, saltadas: 0, fallos: [] },
    soloFallos: false,
    semilla: null,
    espias: new Map(),    // el objeto espía → sus llamadas
  };

  // Corre una función de Ñ y devuelve el error si falló, o null si pasó. Deja
  // la VM como estaba: es el desenrollado de «intentar», hecho desde fuera.
  function aislado(f) {
    const sp = vm.sp, marcos = vm.frames.length, prof = vm.profJS, instr = vm.instrucciones;
    try { vm.invocar(f, []); return null; }
    catch (e) {
      // El presupuesto de instrucciones no es capturable, ni aquí ni en
      // «intentar»: una prueba con un bucle infinito se lleva el programa, que
      // es lo correcto. Un «lanzar» que nadie recogió SÍ se apunta: viene
      // marcado «fatal» porque la VM ya desenrolló y no tiene a quién dárselo,
      // pero para una prueba es un fallo como cualquier otro.
      if (e && e.limite) throw e;
      vm.cerrarUpvalues(sp);
      vm.frames.length = marcos;
      vm.sp = sp;
      vm.profJS = prof;
      // El contador de instrucciones no se rebobina: lo gastado está gastado, y
      // si no, una prueba en bucle podría gastar el presupuesto infinitas veces.
      if (vm.instrucciones < instr) vm.instrucciones = instr;
      return e;
    }
  }
  const mensajeDe = e => (e && (e.pista ? `${e.message}\n      ↳ ${e.pista}` : e.message)) || String(e);

  // Una afirmación fallida es un error normal del motor: así funciona igual
  // dentro de una prueba (la recoge el corredor) y fuera de ella (se cae el
  // programa, que es lo que se quiere si alguien afirma en producción).
  function falla(msg, pista) { vm.error(msg, pista); }
  const cuenta = () => { est.afirmaciones++; };
  const v = x => repr(x, 1);

  const nombreLargo = c => (c.grupo ? c.grupo + ' › ' + c.nombre : c.nombre);

  // Baraja con una semilla, para que el orden sea distinto pero repetible. Una
  // suite que solo pasa en un orden tiene una dependencia escondida, y esto es
  // lo que la saca a la luz sin volverse imposible de reproducir.
  function barajar(xs, semilla) {
    let s = semilla >>> 0 || 1;
    const sig = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(sig() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
    return xs;
  }

  return function (def) {
    // ──────────────────────────────────────────────────────────── estructura
    const registra = (nombre, f, extra) => {
      est.casos.push(Object.assign({
        nombre, fn: f, grupo: est.pila.join(' › '), saltada: false, solo: false,
      }, extra || {}));
      return null;
    };
    def('probar', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'probar'), fn_(a[1], 2, 'probar')),
      'probar("suma dos números", fn() { … }) — registra; no corre hasta correrPruebas()');
    def('saltar', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'saltar'), fn_(a[1], 2, 'saltar'), { saltada: true }),
      'como probar, pero no se ejecuta — sale contada aparte, no escondida');
    def('soloEsta', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'soloEsta'), fn_(a[1], 2, 'soloEsta'), { solo: true }),
      'si alguna prueba es «soloEsta», solo corren esas — para depurar una');
    def('grupo', 'texto, funcion -> nulo', a => {
      est.pila.push(txt(a[0], 1, 'grupo'));
      // El cuerpo del grupo corre YA, y lo que hace es registrar: si falla al
      // registrar, el fallo es del archivo de pruebas y tiene que verse entero.
      try { vm.invocar(fn_(a[1], 2, 'grupo'), []); }
      finally { est.pila.pop(); }
      return null;
    }, 'grupo("el eDSL fecha", fn() { … }) — agrupa y se puede anidar');
    const gancho = (nombre, lista, doc) => def(nombre, 'funcion -> nulo', a => {
      lista.push(fn_(a[0], 1, nombre)); return null;
    }, doc);
    gancho('antesDeTodo', est.antesTodo, 'corre una vez, antes de la primera prueba');
    gancho('despuesDeTodo', est.despuesTodo, 'corre una vez, después de la última');
    gancho('antesDeCada', est.antesCada, 'corre antes de cada prueba');
    gancho('despuesDeCada', est.despuesCada, 'corre después de cada prueba, pase o falle');

    // ───────────────────────────────────────────────────────── afirmaciones
    def('debeSer', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      // Compara en profundidad, como «==» del lenguaje: dos listas iguales lo son.
      if (iguales(a[0], a[1])) return null;
      // Dos decimales distintos pueden IMPRIMIRSE igual: repr recorta a 15
      // cifras. Sin esto, el mensaje era «se esperaba 0.12 y llegó 0.12» y no
      // decía nada — pasó con (1 + 0.12)^1 - 1, que no es exactamente 0.12.
      if (v(a[0]) === v(a[1]) && typeof a[0] === 'number' && typeof a[1] === 'number')
        falla(`los dos se imprimen «${v(a[0])}» pero no son el mismo número: ` +
          `llegó ${a[0].toPrecision(17)} y se esperaba ${a[1].toPrecision(17)}`,
          'con decimales, «debeSerCerca» es lo que se quiere casi siempre');
      falla(`se esperaba ${v(a[1])} y llegó ${v(a[0])}`);
      return null;
    }, 'debeSer(loQueSalio, loQueSeEsperaba) — compara en profundidad');
    def('noDebeSer', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (iguales(a[0], a[1])) falla(`no se esperaba ${v(a[1])}, y es lo que llegó`);
      return null;
    }, 'que los dos valores NO sean iguales');
    def('debeSerCierto', 'cualquiera -> nulo', a => {
      cuenta();
      if (!verdad(a[0])) falla(`se esperaba algo cierto y llegó ${v(a[0])}`);
      return null;
    }, 'con la misma regla de verdad que «si»');
    def('debeSerFalso', 'cualquiera -> nulo', a => {
      cuenta();
      if (verdad(a[0])) falla(`se esperaba algo falso y llegó ${v(a[0])}`);
      return null;
    }, 'lo contrario de debeSerCierto');
    def('debeSerCerca', '... -> nulo', a => {
      cuenta();
      const x = num(a[0], 1, 'debeSerCerca'), y = num(a[1], 2, 'debeSerCerca');
      const tol = a.length > 2 ? num(a[2], 3, 'debeSerCerca') : 1e-9;
      if (Math.abs(x - y) > tol) falla(`${x} no está a menos de ${tol} de ${y}`);
      return null;
    }, 'debeSerCerca(a, b, tolerancia?) — para números con decimales');
    const comparar = (nombre, ok, texto) => def(nombre, 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      vm.cmp(a[0], a[1], nombre);
      if (!ok(a[0], a[1])) falla(`${v(a[0])} no es ${texto} ${v(a[1])}`);
      return null;
    }, `que el primero sea ${texto} el segundo · también vale para fechas`);
    comparar('debeSerMayor', (x, y) => x > y, 'mayor que');
    comparar('debeSerMenor', (x, y) => x < y, 'menor que');
    comparar('debeSerAlMenos', (x, y) => x >= y, 'al menos');
    comparar('debeSerComoMucho', (x, y) => x <= y, 'como mucho');
    def('debeContener', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (!vm.contiene(a[0], a[1])) falla(`${v(a[0])} no contiene ${v(a[1])}`);
      return null;
    }, 'en un texto, una lista o las claves de un diccionario');
    def('noDebeContener', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (vm.contiene(a[0], a[1])) falla(`${v(a[0])} contiene ${v(a[1])}, y no debía`);
      return null;
    }, 'lo contrario de debeContener');
    def('debeEmpezarCon', 'texto, texto -> nulo', a => {
      cuenta();
      const s = txt(a[0], 1, 'debeEmpezarCon'), p = txt(a[1], 2, 'debeEmpezarCon');
      if (!s.startsWith(p)) falla(`${v(s)} no empieza con ${v(p)}`);
      return null;
    }, 'que un texto empiece por ese trozo');
    def('debeTerminarCon', 'texto, texto -> nulo', a => {
      cuenta();
      const s = txt(a[0], 1, 'debeTerminarCon'), p = txt(a[1], 2, 'debeTerminarCon');
      if (!s.endsWith(p)) falla(`${v(s)} no termina con ${v(p)}`);
      return null;
    }, 'que un texto termine en ese trozo');
    def('debeEstarVacio', 'cualquiera -> nulo', a => {
      cuenta();
      if (vm.longitud(a[0]) !== 0) falla(`${v(a[0])} no está vacío`);
      return null;
    }, 'un texto, una lista o un diccionario sin nada dentro');
    def('debeTener', 'cualquiera, entero -> nulo', a => {
      cuenta();
      const n = vm.longitud(a[0]);
      if (n !== num(a[1], 2, 'debeTener')) falla(`se esperaban ${a[1]} elementos y hay ${n}`);
      return null;
    }, 'debeTener(lista, 3) — comprueba la longitud');
    def('debeSerTipo', 'cualquiera, texto -> nulo', a => {
      cuenta();
      const t = tipoDe(a[0]), q = txt(a[1], 2, 'debeSerTipo');
      if (t !== q) falla(`se esperaba un valor de tipo ${q} y llegó ${t}`);
      return null;
    }, 'debeSerTipo(f, "fecha")');

    // ────────────────────────────────────────────────────────────── errores
    def('debeFallar', 'funcion -> texto', a => {
      cuenta();
      const e = aislado(fn_(a[0], 1, 'debeFallar'));
      if (!e) falla('se esperaba un fallo y no falló');
      return e.message || String(e);
    }, 'debeFallar(fn() { … }) — y devuelve el mensaje, para mirarlo');
    def('noDebeFallar', 'funcion -> nulo', a => {
      cuenta();
      const e = aislado(fn_(a[0], 1, 'noDebeFallar'));
      if (e) falla('no debía fallar y falló: ' + (e.message || String(e)));
      return null;
    }, 'que un trozo corra sin fallar');
    def('debeFallarCon', 'funcion, texto -> nulo', a => {
      cuenta();
      const esperado = txt(a[1], 2, 'debeFallarCon');
      const e = aislado(fn_(a[0], 1, 'debeFallarCon'));
      if (!e) falla(`se esperaba un fallo con «${esperado}» y no falló`);
      const m = e.message || String(e);
      if (m.indexOf(esperado) < 0) falla(`el fallo dice «${m}» y se esperaba que dijera «${esperado}»`);
      return null;
    }, 'debeFallarCon(fn() { … }, "división entre cero") — comprueba el mensaje');

    // ─────────────────────────────────────────────────────────────── dobles
    def('espia', 'funcion -> funcion', a => {
      const original = fn_(a[0], 1, 'espia');
      const llamadas = [];
      // El espía es una nativa de aridad variable que apunta y delega. Para Ñ
      // es una función como cualquier otra, así que se puede pasar a donde
      // esperen una función.
      const nombre = ' espia' + est.espias.size;
      vm.definirNativa(nombre, '... -> cualquiera', args => {
        llamadas.push(L(args.slice()));
        return vm.invocar(original, args);
      }, 'espía');
      const obj = vm.globals.get(nombre);
      vm.globals.delete(nombre);   // no debe quedar visible como un global
      est.espias.set(obj, llamadas);
      return obj;
    }, 'envuelve una función y apunta con qué se la llamó, sin cambiar lo que hace');
    def('llamadasDe', 'funcion -> lista', a => {
      const l = est.espias.get(a[0]);
      if (!l) vm.error('«llamadasDe»: eso no es un espía', 'envuélvelo antes con espia(f)');
      return L(l.slice());
    }, 'la lista de llamadas, cada una con sus argumentos');
    def('vecesLlamada', 'funcion -> entero', a => {
      const l = est.espias.get(a[0]);
      if (!l) vm.error('«vecesLlamada»: eso no es un espía', 'envuélvelo antes con espia(f)');
      return l.length;
    }, 'cuántas veces se llamó al espía');

    // ─────────────────────────────────────────────────────────────── correr
    def('soloFallos', 'bool -> nulo', a => { est.soloFallos = verdad(a[0]); return null; },
      'que solo se impriman las que fallan — para una suite grande');
    def('semillaPruebas', 'entero -> nulo', a => { est.semilla = num(a[0], 1, 'semillaPruebas'); return null; },
      'baraja el orden, repetible — saca a la luz las pruebas que dependen del orden');
    def('afirmaciones', ' -> entero', () => est.afirmaciones,
      'cuántas afirmaciones se han comprobado en total');
    def('correrPruebas', ' -> dic<texto,entero>', () => {
      if (est.corriendo) vm.error('«correrPruebas» ya está corriendo', 'no se puede llamar desde dentro de una prueba');
      est.corriendo = true;
      const haySolo = est.casos.some(c => c.solo);
      let casos = est.casos.slice();
      if (est.semilla !== null) barajar(casos, est.semilla);
      const res = { pasan: 0, fallan: 0, saltadas: 0, fallos: [] };
      const gancho = (lista, donde) => {
        for (const g of lista) {
          const e = aislado(g);
          if (e) { res.fallan++; res.fallos.push(`${donde}: ${mensajeDe(e)}`); vm.salida(`  ✗ ${donde}\n      → ${mensajeDe(e)}`); }
        }
      };
      gancho(est.antesTodo, 'antesDeTodo');
      let grupoActual = null;
      for (const c of casos) {
        if (c.grupo !== grupoActual) {
          grupoActual = c.grupo;
          if (grupoActual && !est.soloFallos) vm.salida('\n── ' + grupoActual);
        }
        if (c.saltada || (haySolo && !c.solo)) {
          res.saltadas++;
          if (!est.soloFallos) vm.salida(`  · ${c.nombre} (saltada)`);
          continue;
        }
        gancho(est.antesCada, 'antesDeCada');
        const e = aislado(c.fn);
        gancho(est.despuesCada, 'despuesDeCada');
        if (e) {
          res.fallan++;
          res.fallos.push(`${nombreLargo(c)}: ${mensajeDe(e)}`);
          vm.salida(`  ✗ ${c.nombre}\n      → ${mensajeDe(e)}`);
        } else {
          res.pasan++;
          if (!est.soloFallos) vm.salida(`  ✓ ${c.nombre}`);
        }
      }
      gancho(est.despuesTodo, 'despuesDeTodo');
      est.corriendo = false;
      est.ultimo = res;
      // Las pruebas ya corridas se descartan: llamar dos veces no las repite,
      // y así un archivo puede registrar más y volver a correr solo las nuevas.
      est.casos = [];
      const d = D();
      d.mapa.set('pasan', res.pasan);
      d.mapa.set('fallan', res.fallan);
      d.mapa.set('saltadas', res.saltadas);
      return d;
    }, 'corre todo lo registrado, lo imprime y devuelve {pasan, fallan, saltadas}');
    def('resumenPruebas', ' -> texto', () => {
      const r = est.ultimo;
      const l = [`${r.pasan} pasan, ${r.fallan} fallan` + (r.saltadas ? `, ${r.saltadas} saltadas` : '') +
        ` · ${est.afirmaciones} afirmaciones`];
      if (r.fallos.length) { l.push(''); for (const f of r.fallos) l.push('  ✗ ' + f); }
      return l.join('\n');
    }, 'la última corrida en una línea, con la lista de fallos si hubo');
  };
}


// ============================================================================
//  Ñ v4 — eDSL «texto»: trabajar con cadenas
//  Parte 10.
//
//  Se importa con:  usar "texto"
//
//  Este es el primero que se MUDA, no se escribe de cero: sus diez funciones
//  estaban en el ámbito global y aquí están las mismas, con los mismos nombres
//  y el mismo cuerpo. Solo cambia dónde viven, y eso es a propósito: la mudanza
//  se hace de un eDSL por paso, sin renombrar nada, para que cada paso se pueda
//  deshacer solo y las pruebas digan si algo se movió de sitio.
//
//  Los renombres que propone la especificación —«rellenarIzq» y «rellenarDer»
//  en vez de «rellenar», «largo» en vez de «longitud»— son una decisión aparte
//  y vienen después. Mezclar mudanza con renombre es cómo se pierde el rastro
//  de qué rompió qué.
//
//  Lo que NO se muda: «contiene» y «longitud». Valen para texto, para listas y
//  para diccionarios, así que no son de este eDSL: se quedan en el núcleo.
// ============================================================================

// ── las piezas que necesitan varias funciones ───────────────────────────────

// Las vocales con tilde y la diéresis. La Ñ NO está: en español es una letra
// propia, no una n con sombrero, así que «sinAcentos» la conserva. La única
// excepción es «aUrl», donde una dirección web no la admite y se dice allí.
const TILDES = {
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'Á': 'A', 'À': 'A', 'Ä': 'A', 'Â': 'A',
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'É': 'E', 'È': 'E', 'Ë': 'E', 'Ê': 'E',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'Í': 'I', 'Ì': 'I', 'Ï': 'I', 'Î': 'I',
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'Ó': 'O', 'Ò': 'O', 'Ö': 'O', 'Ô': 'O',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'Ú': 'U', 'Ù': 'U', 'Ü': 'U', 'Û': 'U',
  'ç': 'c', 'Ç': 'C',
};
const sinTildes = s => s.replace(/[áàäâÁÀÄÂéèëêÉÈËÊíìïîÍÌÏÎóòöôÓÒÖÔúùüûÚÙÜÛçÇ]/g, c => TILDES[c]);

// El alfabeto español, con la ñ en su sitio: entre la n y la o. En Unicode la
// ñ está después de la z, así que ordenar por códigos pone «ñandú» detrás de
// «zapato», y eso es exactamente lo que este eDSL viene a arreglar.
const ALFA_ES = 'abcdefghijklmnñopqrstuvwxyz';

// Tres pesos, en orden: la letra, luego la tilde, luego la mayúscula. Así
// «el» va antes de «él», y «él» antes de «Él», que es la regla real.
function claveEs(s) {
  let letras = '', tildes = '', cajas = '';
  for (const c of s) {
    const bajo = c.toLowerCase();
    const base = TILDES[bajo] || bajo;
    const i = ALFA_ES.indexOf(base);
    // Lo que no es letra del alfabeto va antes que las letras, por su código.
    letras += i >= 0 ? String.fromCharCode(0x100 + i) : String.fromCharCode(Math.min(0xFF, c.codePointAt(0)));
    tildes += TILDES[bajo] ? '1' : '0';
    cajas += c === bajo ? '0' : '1';
  }
  return letras + '\u0000' + tildes + '\u0000' + cajas;
}
const comparaEs = (a, b) => {
  const x = claveEs(a), y = claveEs(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// Distancia de edición, con una sola fila en memoria: dos textos de mil
// caracteres son un millón de celdas, y guardar la matriz entera no hace falta.
function levenshtein(x, y) {
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  const fila = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) fila[j] = j;
  for (let i = 1; i <= x.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (x[i - 1] === y[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[y.length];
}

function instalarTexto(vm) {
  const L = items => vm.nuevaLista(items);
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);

  return function (def) {
    def('mayusculas', 'texto -> texto', a => txt(a[0], 1, 'mayusculas').toUpperCase(),
      'pasa el texto a mayúsculas, acentos incluidos');
    def('minusculas', 'texto -> texto', a => txt(a[0], 1, 'minusculas').toLowerCase(),
      'pasa el texto a minúsculas');
    def('recortar', 'texto -> texto', a => txt(a[0], 1, 'recortar').trim(),
      'quita los espacios de los extremos');
    def('dividir', '... -> lista<texto>',
      a => L(txt(a[0], 1, 'dividir').split(a.length > 1 ? txt(a[1], 2, 'dividir') : ' ')),
      'dividir(texto, separador) — el separador por defecto es el espacio');
    def('unir', 'lista, texto -> texto',
      a => lst(a[0], 1, 'unir').items.map(x => typeof x === 'string' ? x : repr(x, 1)).join(txt(a[1], 2, 'unir')),
      'unir(lista, separador) — lo contrario de dividir');
    def('reemplazar', 'texto, texto, texto -> texto',
      a => txt(a[0], 1, 'reemplazar').split(txt(a[1], 2, 'reemplazar')).join(txt(a[2], 3, 'reemplazar')),
      'cambia todas las apariciones de un trozo por otro');
    def('empiezaCon', 'texto, texto -> bool',
      a => txt(a[0], 1, 'empiezaCon').startsWith(txt(a[1], 2, 'empiezaCon')),
      'dice si el texto empieza por ese trozo');
    def('terminaCon', 'texto, texto -> bool',
      a => txt(a[0], 1, 'terminaCon').endsWith(txt(a[1], 2, 'terminaCon')),
      'dice si el texto termina en ese trozo');
    def('subtexto', 'texto, entero, entero -> texto',
      a => txt(a[0], 1, 'subtexto').slice(num(a[1], 2, 'subtexto'), num(a[2], 3, 'subtexto')),
      'subtexto(texto, desde, hasta) — el trozo entre dos posiciones');

    // ═══════════════════════════════════════════════════════ medir y buscar
    // No hay «largo» ni «estaVacio» ni «contiene»: «longitud» y «contiene» del
    // núcleo ya valen para texto, listas y diccionarios, y dos nombres para lo
    // mismo es peor que cualquiera de los dos.
    def('indiceDe', '... -> entero', a => {
      const s = txt(a[0], 1, 'indiceDe'), q = txt(a[1], 2, 'indiceDe');
      return s.indexOf(q, a.length > 2 ? ent(a[2], 3, 'indiceDe') : 0);
    }, 'indiceDe(texto, trozo, desde?) — la primera posición, o −1 si no está');
    def('ultimoIndiceDe', 'texto, texto -> entero',
      a => txt(a[0], 1, 'ultimoIndiceDe').lastIndexOf(txt(a[1], 2, 'ultimoIndiceDe')),
      'la última posición, o −1');
    def('cuantasVeces', 'texto, texto -> entero', a => {
      const s = txt(a[0], 1, 'cuantasVeces'), q = txt(a[1], 2, 'cuantasVeces');
      if (!q) vm.error('«cuantasVeces»: el trozo que se busca no puede estar vacío');
      let n = 0, i = 0;
      for (;;) { const j = s.indexOf(q, i); if (j < 0) break; n++; i = j + q.length; }
      return n;
    }, 'cuántas veces aparece · sin solaparse');

    // ═══════════════════════════════════════════════════════════════ cortar
    def('izquierda', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'izquierda');
      return n <= 0 ? '' : txt(a[0], 1, 'izquierda').slice(0, n);
    }, 'los n primeros caracteres');
    def('derecha', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'derecha');
      return n <= 0 ? '' : txt(a[0], 1, 'derecha').slice(-n);
    }, 'los n últimos caracteres');
    def('entre', 'texto, texto, texto -> texto', a => {
      // Lo que hay entre dos marcas. Si falta alguna, texto vacío: es lo que se
      // espera al sacar un campo de una línea que no lo trae.
      const s = txt(a[0], 1, 'entre'), d = txt(a[1], 2, 'entre'), h = txt(a[2], 3, 'entre');
      const i = s.indexOf(d);
      if (i < 0) return '';
      const j = s.indexOf(h, i + d.length);
      return j < 0 ? '' : s.slice(i + d.length, j);
    }, 'entre("nombre: Ana;", ": ", ";") → «Ana» — vacío si falta una marca');
    def('antesDe', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'antesDe'), q = txt(a[1], 2, 'antesDe');
      const i = s.indexOf(q);
      return i < 0 ? s : s.slice(0, i);
    }, 'lo que hay antes de la marca · el texto entero si no está');
    def('despuesDe', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'despuesDe'), q = txt(a[1], 2, 'despuesDe');
      const i = s.indexOf(q);
      return i < 0 ? '' : s.slice(i + q.length);
    }, 'lo que hay después de la marca · vacío si no está');
    def('recortarIzq', 'texto -> texto', a => txt(a[0], 1, 'recortarIzq').replace(/^\s+/, ''),
      'quita los espacios de delante');
    def('recortarDer', 'texto -> texto', a => txt(a[0], 1, 'recortarDer').replace(/\s+$/, ''),
      'quita los espacios de detrás');
    def('quitarPrefijo', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'quitarPrefijo'), p = txt(a[1], 2, 'quitarPrefijo');
      return p && s.startsWith(p) ? s.slice(p.length) : s;
    }, 'quita ese principio si está · no toca nada si no');
    def('quitarSufijo', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'quitarSufijo'), p = txt(a[1], 2, 'quitarSufijo');
      return p && s.endsWith(p) ? s.slice(0, -p.length) : s;
    }, 'quita ese final si está');

    // ══════════════════════════════════════════════════════════ transformar
    def('capitalizar', 'texto -> texto', a => {
      const s = txt(a[0], 1, 'capitalizar');
      return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
    }, 'capitalizar("hOLA mUNDO") → «Hola mundo» — solo la primera');
    def('titular', 'texto -> texto', a => {
      // En español NO se capitaliza cada palabra de un título, pero un nombre
      // propio o una cabecera de columna sí lo pide. Las palabras cortas de
      // enlace se quedan en minúscula, que es la regla real.
      const chicas = ['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u',
        'a', 'al', 'en', 'con', 'por', 'para', 'sin', 'un', 'una'];
      const ps = txt(a[0], 1, 'titular').toLowerCase().split(/(\s+)/);
      let primera = true;
      return ps.map(p => {
        if (!p.trim()) return p;
        const cap = primera || !chicas.includes(p);
        primera = false;
        return cap ? p.charAt(0).toUpperCase() + p.slice(1) : p;
      }).join('');
    }, 'titular("juan de la cruz") → «Juan de la Cruz» — «de» y «la» se quedan en minúscula');
    def('reemplazarPrimero', 'texto, texto, texto -> texto', a => {
      // «reemplazar» cambia TODAS las apariciones. Esta cambia una, que hacía
      // falta y no había forma de pedirlo.
      const s = txt(a[0], 1, 'reemplazarPrimero'), d = txt(a[1], 2, 'reemplazarPrimero');
      const c = txt(a[2], 3, 'reemplazarPrimero');
      const i = s.indexOf(d);
      return i < 0 ? s : s.slice(0, i) + c + s.slice(i + d.length);
    }, 'solo la primera aparición · «reemplazar» cambia todas');
    def('repetirTexto', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'repetirTexto');
      if (n < 0) vm.error('«repetirTexto»: no se puede repetir menos de 0 veces');
      const s = txt(a[0], 1, 'repetirTexto');
      if (s.length * n > 1e7) vm.error('«repetirTexto»: el resultado sería demasiado grande');
      return s.repeat(n);
    }, 'repetirTexto("ab", 3) → «ababab»');
    def('invertirTexto', 'texto -> texto', a => {
      // Por puntos de código y no por unidades UTF-16: así un emoji no se parte
      // por la mitad. «invertir» del núcleo es solo para listas.
      return [...txt(a[0], 1, 'invertirTexto')].reverse().join('');
    }, 'del revés · «invertir» del núcleo es para listas');

    // ══════════════════════════════════════════════════════ partir y juntar
    def('lineas', 'texto -> lista<texto>', a => L(txt(a[0], 1, 'lineas').split(/\r\n|\r|\n/)),
      'parte por saltos de línea · entiende los de Windows');
    def('palabras', 'texto -> lista<texto>', a =>
      L(txt(a[0], 1, 'palabras').split(/\s+/).filter(x => x !== '')),
      'parte por espacios, sin dejar huecos vacíos');
    def('caracteres', 'texto -> lista<texto>', a => L([...txt(a[0], 1, 'caracteres')]),
      'uno por carácter · por puntos de código, no por bytes');
    def('envolver', 'texto, entero -> lista<texto>', a => {
      // Corta en líneas de como máximo n, sin partir palabras. Lo que hace
      // falta para escribir un párrafo en una consola o en una factura.
      const s = txt(a[0], 1, 'envolver'), n = ent(a[1], 2, 'envolver');
      if (n < 1) vm.error('«envolver»: el ancho tiene que ser 1 o más');
      const out = [];
      for (const parrafo of s.split(/\r\n|\r|\n/)) {
        let linea = '';
        for (const p of parrafo.split(/\s+/).filter(x => x !== '')) {
          if (!linea) { linea = p; continue; }
          if (linea.length + 1 + p.length <= n) { linea += ' ' + p; continue; }
          out.push(linea);
          linea = p;
        }
        out.push(linea);
      }
      return L(out);
    }, 'envolver(texto, 40) — lo parte en líneas sin cortar palabras');
    def('sangrar', '... -> texto', a => {
      const s = txt(a[0], 1, 'sangrar'), n = ent(a[1], 2, 'sangrar');
      const c = a.length > 2 ? txt(a[2], 3, 'sangrar') : ' ';
      const p = c.repeat(Math.max(0, n));
      return s.split('\n').map(l => (l === '' ? l : p + l)).join('\n');
    }, 'sangrar(texto, 4) — mete n espacios delante de cada línea');
    def('desangrar', 'texto -> texto', a => {
      // Quita la sangría COMÚN, no toda: así un bloque anidado conserva su
      // forma. Es lo que se quiere al leer un texto escrito dentro del código.
      const ls = txt(a[0], 1, 'desangrar').split('\n');
      let min = Infinity;
      for (const l of ls) {
        if (!l.trim()) continue;
        min = Math.min(min, l.match(/^\s*/)[0].length);
      }
      if (!Number.isFinite(min) || min === 0) return ls.join('\n');
      return ls.map(l => (l.trim() ? l.slice(min) : l)).join('\n');
    }, 'quita la sangría que comparten todas las líneas, no más');

    // ════════════════════════════════════════════════ el español, en serio
    def('sinAcentos', 'texto -> texto', a => sinTildes(txt(a[0], 1, 'sinAcentos')),
      'sinAcentos("Martín") → «Martin» · la Ñ se QUEDA: en español es una letra, no una n con sombrero');
    def('igualSinAcentos', 'texto, texto -> bool', a =>
      sinTildes(txt(a[0], 1, 'igualSinAcentos')).toLowerCase() ===
      sinTildes(txt(a[1], 2, 'igualSinAcentos')).toLowerCase(),
      'igualSinAcentos("Martín", "martin") → cierto · buscar un cliente sin pelearse con las tildes');
    def('ordenAlfabetico', 'lista -> lista', a => {
      // El orden del español, no el de los códigos Unicode. Es la diferencia
      // entre [nada, nube, ñandú, ñu, oso] y [nada, nube, oso, ñandú, ñu]:
      // en Unicode la ñ va después de la z, y en español va después de la n.
      const l = lst(a[0], 1, 'ordenAlfabetico');
      const xs = l.items.map(x => (typeof x === 'string' ? x : repr(x, 1)));
      vm.cobrar(xs.length * 2);
      return L(xs.slice().sort(comparaEs));
    }, 'ordena como el español: la ñ va entre la n y la o, y «él» después de «el»');
    def('distancia', 'texto, texto -> entero', a => {
      const x = txt(a[0], 1, 'distancia'), y = txt(a[1], 2, 'distancia');
      if (x.length * y.length > 4e6) vm.error('«distancia»: los textos son demasiado largos');
      vm.cobrar(x.length * y.length / 100);
      return levenshtein(x, y);
    }, 'cuántos cambios de una letra hacen falta para pasar de uno a otro');
    def('parecido', 'texto, texto -> real', a => {
      // De 0 a 1, ignorando tildes y mayúsculas: lo que se quiere para decir
      // «¿será este el mismo cliente escrito de otra forma?».
      const x = sinTildes(txt(a[0], 1, 'parecido')).toLowerCase();
      const y = sinTildes(txt(a[1], 2, 'parecido')).toLowerCase();
      if (!x.length && !y.length) return 1;
      if (x.length * y.length > 4e6) vm.error('«parecido»: los textos son demasiado largos');
      vm.cobrar(x.length * y.length / 100);
      return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
    }, 'parecido("Gonzalez", "González") → 1 · de 0 a 1, sin tildes ni mayúsculas');
    def('aUrl', 'texto -> texto', a => {
      // Aquí la ñ SÍ pasa a n: una dirección web no la admite. Es la excepción
      // a la regla de sinAcentos, y es a propósito.
      const s = sinTildes(txt(a[0], 1, 'aUrl')).toLowerCase()
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return s;
    }, 'aUrl("Camión Año 2026") → «camion-ano-2026» · aquí la ñ sí pasa a n');
    def('aIdentificador', 'texto -> texto', a => {
      // Un nombre que Ñ acepta de verdad: el léxico admite tildes y ñ en un
      // identificador, así que solo hay que quitar lo demás y el dígito inicial.
      let s = txt(a[0], 1, 'aIdentificador').trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]/g, '');
      if (!s) vm.error('«aIdentificador»: no queda nada que pueda ser un nombre');
      if (/^[0-9]/.test(s)) s = '_' + s;
      return s;
    }, 'aIdentificador("Total año 2026") → «Total_año_2026» — un nombre que Ñ acepta');

    // ═════════════════════════════════════════════════════════ caracteres
    def('codigo', 'texto -> entero', a => {
      const s = txt(a[0], 1, 'codigo');
      if (!s) vm.error('«codigo» de un texto vacío');
      return s.codePointAt(0);
    }, 'el número Unicode del primer carácter');
    def('deCodigo', 'entero -> texto', a => {
      const n = ent(a[0], 1, 'deCodigo');
      if (n < 0 || n > 0x10FFFF) vm.error(`«deCodigo»: ${n} no es un carácter`);
      return String.fromCodePoint(n);
    }, 'deCodigo(241) → «ñ»');
    const clase = (nombre, re, doc) => def(nombre, 'texto -> bool', a => {
      const s = txt(a[0], 1, nombre);
      return s.length > 0 && re.test(s);
    }, doc);
    clase('esLetra', /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/, 'solo letras · las tildes y la ñ cuentan como letras');
    clase('esDigito', /^[0-9]+$/, 'solo dígitos');
    clase('esEspacio', /^\s+$/, 'solo espacios, tabulaciones o saltos');
    clase('esVocal', /^[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]+$/, 'solo vocales, con tilde o sin ella');
    def('esMayuscula', 'texto -> bool', a => {
      // Cierto si hay alguna letra y todas están en mayúscula. Un texto sin
      // letras no es mayúscula ni minúscula: «123» daría cierto con la
      // comparación ingenua contra su propia versión en mayúsculas.
      const s = txt(a[0], 1, 'esMayuscula');
      return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(s) && s === s.toUpperCase();
    }, 'todas las letras en mayúscula · «123» es falso, que no tiene letras');

    // ═══════════════════════════════════════════════════════════ plantillas
    def('plantilla', 'texto, dic -> texto', a => {
      // La interpolación del lenguaje —"hola {nombre}"— se resuelve al
      // compilar. Esta la resuelve en ejecución, que es lo que hace falta
      // cuando la plantilla viene de un archivo o de la base de datos.
      const s = txt(a[0], 1, 'plantilla');
      const d = a[1];
      if (!(d instanceof ObjDic)) vm.error('«plantilla»: el argumento 2 debe ser un diccionario');
      return s.replace(/\{([^{}]*)\}/g, (todo, clave) => {
        const k = clave.trim();
        if (!d.mapa.has(k)) vm.error(`«plantilla»: falta «${k}»`,
          d.mapa.size ? 'el diccionario trae: ' + [...d.mapa.keys()].join(', ') : 'el diccionario está vacío');
        const v = d.mapa.get(k);
        return typeof v === 'string' ? v : repr(v, 1);
      });
    }, 'plantilla(texto, diccionario) — para una plantilla que llega en ejecución, de un archivo o de una base de datos. En un texto ESCRITO en el programa, las llaves son la interpolación del lenguaje y hay que escaparlas: plantilla("Hola \\{nombre\\}", d)');
    def('escaparHtml', 'texto -> texto', a =>
      txt(a[0], 1, 'escaparHtml').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      'para meter texto en HTML a mano · el árbol de nodos ya lo hace solo');
    def('escaparCsv', 'texto -> texto', a => {
      // Entre comillas solo si hace falta, y las comillas de dentro se doblan.
      // Es lo que espera Excel, y hacerlo a mano sale mal una vez de cada diez.
      const s = txt(a[0], 1, 'escaparCsv');
      return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }, 'pone comillas solo si hacen falta y dobla las de dentro');
  };
}


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


// ============================================================================
//  Ñ v4 — eDSL «datos»: tablas con columnas, tipos y esquema
//  Parte 12.
//
//  Se importa con:  usar "datos"
//
//  EL PROBLEMA QUE RESUELVE. El trabajo más común fuera de la web es leer una
//  tabla, agrupar y sumar. Hacerlo con una lista de diccionarios funciona hasta
//  que alguien añade una columna y el «fila[3]» pasa a significar otra cosa en
//  silencio. Con un tipo, las columnas tienen nombre y tienen tipo, y el
//  verificador sabe que «fn informe(): tabla» devuelve una.
//
//  EL FORMATO .ñdatos. El CSV pierde tres cosas y no hay forma de recuperarlas:
//
//    · los TIPOS. Todo vuelve como texto. Una columna de fechas deja de ser de
//      fechas, y una de números hay que convertirla a mano cada vez.
//    · los NULOS. Un campo vacío y un texto vacío son el mismo campo vacío.
//    · el ESQUEMA. No hay forma de saber qué columnas debía traer el archivo,
//      así que un CSV con una columna de menos se lee como si estuviera bien.
//
//  Así que «datos» trae su propio formato, que es JSON con esquema:
//
//    {
//      "ñdatos": 1,
//      "columnas": [{"nombre": "ciudad", "tipo": "texto"},
//                   {"nombre": "dia",    "tipo": "fecha"},
//                   {"nombre": "ventas", "tipo": "entero"}],
//      "filas": 2,
//      "datos": [["Girón", "Bogotá"],
//                ["2026-09-01", "2026-09-02"],
//                [1200, null]]
//    }
//
//  Por COLUMNAS y no por filas, a propósito: el tipo se declara una vez por
//  columna en vez de adivinarse celda a celda, no se repiten los nombres en
//  cada fila, y es como la tabla está guardada por dentro, así que leer y
//  escribir no traduce nada. El nulo es el null de JSON, distinguible del texto
//  vacío. Y la versión está ahí para poder cambiar el formato sin romper los
//  archivos de antes.
//
//  La ida y vuelta es EXACTA, fechas incluidas. Eso es todo lo que el formato
//  promete, y es lo que el CSV no puede prometer.
//
//  El CSV sigue estando, porque hay que intercambiar con el mundo: «deCsv»
//  adivina los tipos al leer —entero, real, fecha, bool, texto, en ese orden— y
//  «aCsv» escribe lo que Excel espera. Lo que se pierde al pasar por él se ve
//  en un caso: un NIT «0012345» vuelve como el número 12345, y un texto vacío
//  vuelve como un hueco. Con .ñdatos los dos vuelven tal cual.
//
//  LO QUE NO SE SOBRECARGA, Y POR QUÉ. La propuesta original decía que
//  «filtrar», «mapear» y «ordenar» del núcleo funcionaran sobre una tabla.
//  «longitud» sí —cuántas filas tiene una tabla no tiene otra respuesta—, pero
//  los otros tres no, porque no hay una respuesta única:
//
//    filtrar(t, fn)   sería exactamente «donde», y «donde» se lee mejor
//    mapear(t, fn)    ¿devuelve una tabla, una lista, otra columna?
//    ordenar(t)       ¿por cuál de las columnas?
//
//  Tener dos nombres para lo mismo es peor que cualquiera de los dos, y un
//  nombre cuya respuesta hay que adivinar es peor todavía. Así que la tabla
//  tiene sus propios verbos: «donde», «ordenarPor», «aplicarA».
// ============================================================================

const TIPOS_TABLA = ['entero', 'real', 'texto', 'bool', 'fecha', 'cualquiera'];
const VERSION_DATOS = 1;

// Qué tipo tiene una columna, mirando sus valores. El orden importa: lo que
// cabe en «entero» no debe salir como «real», y lo que parece fecha no debe
// salir como texto. Un nulo no cuenta para decidir.
function inferirTipo(vals) {
  let hay = false, todoEnt = true, todoNum = true, todoBool = true, todoFecha = true;
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    hay = true;
    if (typeof v === 'number') { todoBool = false; todoFecha = false; if (!Number.isInteger(v)) todoEnt = false; continue; }
    todoEnt = false; todoNum = false;
    if (typeof v === 'boolean') { todoFecha = false; continue; }
    todoBool = false;
    if (!(v instanceof ObjFecha)) todoFecha = false;
  }
  if (!hay) return 'cualquiera';
  if (todoEnt) return 'entero';
  if (todoNum) return 'real';
  if (todoBool) return 'bool';
  if (todoFecha) return 'fecha';
  return 'texto';
}

function instalarDatos(vm) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);
  const tab = (v, n, f) => {
    if (!(v instanceof ObjTabla)) vm.error(`«${f}»: el argumento ${n} debe ser una tabla y es ${tipoDe(v)}`);
    return v;
  };
  const dic = (v, n, f) => {
    if (!(v instanceof ObjDic)) vm.error(`«${f}»: el argumento ${n} debe ser un diccionario y es ${tipoDe(v)}`);
    return v;
  };
  // El índice de una columna, o un error que dice las que hay: buscar una
  // columna que no existe es el fallo más común y merece un mensaje bueno.
  const iCol = (t, nombre, f) => {
    const i = t.indiceCol(nombre);
    if (i < 0) vm.error(`«${f}»: la tabla no tiene una columna «${nombre}»`,
      t.cols.length ? 'tiene: ' + t.cols.map(c => c.nombre).join(', ') : 'la tabla no tiene columnas');
    return i;
  };
  const nueva = (cols, datos) => vm.nuevaTabla(cols, datos);
  const copiaCols = t => t.cols.map(c => ({ nombre: c.nombre, tipo: c.tipo }));
  // Reordena una tabla según una lista de índices de fila. Es la operación que
  // está debajo de filtrar, ordenar, quitar repetidos y agrupar.
  const porFilas = (t, idx) => nueva(copiaCols(t), t.datos.map(col => idx.map(i => col[i])));
  const nulo = v => v === null || v === undefined || v === '';

  // ── el formato .ñdatos ─────────────────────────────────────────────────────
  const aJsonValor = (v, tipo) => {
    if (v === null || v === undefined) return null;
    if (tipo === 'fecha') return v instanceof ObjFecha ? isoDeFecha(v) : null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    return repr(v, 1);
  };
  const deJsonValor = (v, tipo, col, fila) => {
    if (v === null || v === undefined) return null;
    if (tipo === 'fecha') {
      if (typeof v !== 'string') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer una fecha`);
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
      if (!m) vm.error(`«deDatos»: «${v}» no es una fecha en la columna «${col}», fila ${fila}`,
        'el formato guarda las fechas como 2026-09-29 o 2026-09-29 14:30:00');
      return vm.nuevaFecha(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0').padEnd(3, '0'))));
    }
    if (tipo === 'entero' || tipo === 'real') {
      if (typeof v !== 'number') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer un número y trae ${typeof v}`);
      return tipo === 'entero' ? Math.trunc(v) : v;
    }
    if (tipo === 'bool') {
      if (typeof v !== 'boolean') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer verdadero o falso`);
      return v;
    }
    if (tipo === 'texto') return typeof v === 'string' ? v : String(v);
    return v;
  };

  // ── CSV ────────────────────────────────────────────────────────────────────
  // Un lector de CSV de verdad: comillas, comas dentro de las comillas, y las
  // comillas dobladas. Partir por comas falla con el primer «Pérez, Ana».
  function filasCsv(texto, sep) {
    const filas = [];
    let fila = [], campo = '', enComillas = false, i = 0;
    const n = texto.length;
    while (i < n) {
      const c = texto[i];
      if (enComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          enComillas = false; i++; continue;
        }
        campo += c; i++; continue;
      }
      if (c === '"' && campo === '') { enComillas = true; i++; continue; }
      if (c === sep) { fila.push(campo); campo = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; i++; continue; }
      campo += c; i++;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }
  // Adivina el tipo de un campo de texto. El orden es el que no pierde
  // información: lo que es entero no sale como real, y lo que es fecha no sale
  // como texto. Lo que no encaja en nada se queda como texto, que nunca miente.
  function leerCampo(s) {
    const t = s.trim();
    if (t === '') return null;
    if (/^-?\d+$/.test(t)) { const n = +t; if (Number.isSafeInteger(n)) return n; }
    if (/^-?\d+[.,]\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
    if (/^(cierto|verdadero|si|sí|true)$/i.test(t)) return true;
    if (/^(falso|no|false)$/i.test(t)) return false;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return vm.nuevaFecha(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return vm.nuevaFecha(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return s;
  }

  // ── los agregadores ────────────────────────────────────────────────────────
  // «sumaCol("ventas")» no suma: describe una suma. Lo que devuelve es una
  // receta que «agrupar» y «resumir» aplican a cada grupo, y eso es lo que
  // permite pedir varios resúmenes en una sola llamada sin inventar un tipo
  // nuevo para «tabla agrupada».
  const RECETAS = new WeakMap();
  const receta = (clase, col, fn) => {
    const d = D();
    d.mapa.set('agregado', clase);
    if (col !== null) d.mapa.set('columna', col);
    RECETAS.set(d, { clase, col, fn });
    return d;
  };
  const esReceta = v => v instanceof ObjDic && RECETAS.has(v);

  return function (def) {
    // ══════════════════════════════════════════════════════════════ entrar
    // Los cinco caminos de entrada se llaman «deAlgo» y los cinco de salida
    // «aAlgo», y cada par es el inverso del otro. Este se llamaba «tabla», que
    // era el nombre natural hasta que se vio que «tabla» ya existe dos veces
    // más: es el nombre del TIPO y es la función que arma un <table> en una
    // página. Tres cosas distintas con un nombre es la clase de error que este
    // lenguaje quiere quitar, no repartir.
    def('deRegistros', 'lista -> tabla', a => {
      // De una lista de diccionarios: las columnas salen del PRIMERO y en ese
      // orden. Un registro que traiga una clave de más se queja, porque callarlo
      // es perder datos sin avisar.
      const l = lst(a[0], 1, 'deRegistros');
      if (!l.items.length) return nueva([], []);
      const p = l.items[0];
      if (!(p instanceof ObjDic)) vm.error('«deRegistros»: se esperaba una lista de diccionarios');
      const nombres = [...p.mapa.keys()].map(String);
      const datos = nombres.map(() => []);
      for (let f = 0; f < l.items.length; f++) {
        const r = l.items[f];
        if (!(r instanceof ObjDic)) vm.error(`«deRegistros»: el elemento ${f + 1} no es un diccionario`);
        for (const k of r.mapa.keys()) if (!nombres.includes(String(k)))
          vm.error(`«deRegistros»: el registro ${f + 1} trae «${k}», que no está en el primero`,
            'todos los registros tienen que traer las mismas claves: ' + nombres.join(', '));
        nombres.forEach((n, c) => datos[c].push(r.mapa.has(n) ? r.mapa.get(n) : null));
      }
      vm.cobrar(nombres.length * l.items.length);
      return nueva(nombres.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deRegistros(lista de diccionarios) — las columnas salen del primer registro, en su orden');
    def('deColumnas', 'dic -> tabla', a => {
      const d = dic(a[0], 1, 'deColumnas');
      const nombres = [], datos = [];
      let filas = -1;
      for (const [k, v] of d.mapa) {
        if (!(v instanceof ObjLista)) vm.error(`«deColumnas»: «${k}» no es una lista`);
        if (filas < 0) filas = v.items.length;
        else if (v.items.length !== filas)
          vm.error(`«deColumnas»: «${k}» trae ${v.items.length} valores y las otras ${filas}`);
        nombres.push(String(k)); datos.push(v.items.slice());
      }
      return nueva(nombres.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deColumnas({"ciudad": [...], "ventas": [...]}) — una lista por columna');
    def('deLista', 'lista, lista -> tabla', a => {
      const fs = lst(a[0], 1, 'deLista').items, ns = lst(a[1], 2, 'deLista').items.map(String);
      const datos = ns.map(() => []);
      for (let f = 0; f < fs.length; f++) {
        const r = fs[f];
        if (!(r instanceof ObjLista)) vm.error(`«deLista»: la fila ${f + 1} no es una lista`);
        if (r.items.length !== ns.length)
          vm.error(`«deLista»: la fila ${f + 1} trae ${r.items.length} valores y hay ${ns.length} columnas`);
        ns.forEach((_, c) => datos[c].push(r.items[c]));
      }
      vm.cobrar(ns.length * fs.length);
      return nueva(ns.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deLista(filas, nombresDeColumna) — una lista de listas');
    def('deCsv', '... -> tabla', a => {
      const s = txt(a[0], 1, 'deCsv');
      const sep = a.length > 1 ? txt(a[1], 2, 'deCsv') : (s.split('\n')[0].includes(';') ? ';' : ',');
      const fs = filasCsv(s, sep);
      // Se descarta UNA sola línea final vacía: el salto con el que acaba todo
      // archivo de texto. Descartarlas todas perdía las filas en blanco de en
      // medio, que sí son datos.
      //
      // Y aquí hay un límite del CSV que no se puede arreglar: en una tabla de
      // UNA columna con los valores vacíos, la línea en blanco y el salto final
      // son el mismo carácter, así que el número de filas no sobrevive. Con
      // dos columnas o más la coma lo distingue («,» es una fila vacía) y no
      // pasa. Es otra razón de que exista .ñdatos.
      if (fs.length && fs[fs.length - 1].length === 1 && fs[fs.length - 1][0].trim() === '') fs.pop();
      if (!fs.length) return nueva([], []);
      const ns = fs[0].map(x => x.trim());
      const datos = ns.map(() => []);
      for (let f = 1; f < fs.length; f++) {
        const r = fs[f];
        ns.forEach((_, c) => datos[c].push(c < r.length ? leerCampo(r[c]) : null));
      }
      vm.cobrar(ns.length * fs.length);
      // Los tipos se adivinan aquí, que es lo que el CSV no trae. Por eso
      // «deCsv» y luego «aDatos» convierte un CSV en algo que ya no los pierde.
      return nueva(ns.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deCsv(texto, separador?) — adivina el separador y los tipos · entiende comillas y comas dentro');
    def('deDatos', 'texto -> tabla', a => {
      const s = txt(a[0], 1, 'deDatos');
      let j;
      try { j = JSON.parse(s); }
      catch (e) { vm.error('«deDatos»: el texto no es JSON válido', String(e.message || e)); }
      if (!j || typeof j !== 'object' || Array.isArray(j))
        vm.error('«deDatos»: el JSON no es un documento .ñdatos', 'tiene que ser un objeto con «ñdatos», «columnas» y «datos»');
      const ver = j['ñdatos'];
      if (ver === undefined) vm.error('«deDatos»: falta la marca «ñdatos»',
        'esto no parece un archivo del formato; si es un CSV, usa «deCsv»');
      if (ver > VERSION_DATOS)
        vm.error(`«deDatos»: el archivo es del formato versión ${ver} y este motor entiende hasta la ${VERSION_DATOS}`);
      if (!Array.isArray(j.columnas) || !Array.isArray(j.datos))
        vm.error('«deDatos»: «columnas» y «datos» tienen que ser listas');
      if (j.columnas.length !== j.datos.length)
        vm.error(`«deDatos»: hay ${j.columnas.length} columnas declaradas y ${j.datos.length} listas de datos`);
      const cols = j.columnas.map((c, i) => {
        if (!c || typeof c.nombre !== 'string') vm.error(`«deDatos»: la columna ${i + 1} no trae nombre`);
        const tipo = c.tipo === undefined ? 'cualquiera' : c.tipo;
        if (!TIPOS_TABLA.includes(tipo))
          vm.error(`«deDatos»: «${tipo}» no es un tipo de columna`, 'los tipos son: ' + TIPOS_TABLA.join(', '));
        return { nombre: c.nombre, tipo };
      });
      // El esquema se comprueba: un archivo con una columna a medias se dice
      // aquí y no tres pasos después, cuando ya no se sabe de dónde vino.
      const filas = j.datos.length ? j.datos[0].length : 0;
      j.datos.forEach((col, i) => {
        if (!Array.isArray(col)) vm.error(`«deDatos»: los datos de «${cols[i].nombre}» no son una lista`);
        if (col.length !== filas)
          vm.error(`«deDatos»: «${cols[i].nombre}» trae ${col.length} valores y «${cols[0].nombre}» trae ${filas}`);
      });
      if (j.filas !== undefined && j.filas !== filas)
        vm.error(`«deDatos»: el archivo dice ${j.filas} filas y trae ${filas}`);
      vm.cobrar(cols.length * filas);
      return nueva(cols, j.datos.map((col, c) =>
        col.map((v, f) => deJsonValor(v, cols[c].tipo, cols[c].nombre, f + 1))));
    }, 'deDatos(texto) — lee el formato .ñdatos, comprobando el esquema y los tipos');

    // ══════════════════════════════════════════════════════════════════ salir
    def('aDatos', '... -> texto', a => {
      const t = tab(a[0], 1, 'aDatos');
      const bonito = a.length > 1 && verdad(a[1]);
      const doc = {
        'ñdatos': VERSION_DATOS,
        columnas: t.cols.map(c => ({ nombre: c.nombre, tipo: c.tipo })),
        filas: t.filas,
        datos: t.datos.map((col, c) => col.map(v => aJsonValor(v, t.cols[c].tipo))),
      };
      vm.cobrar(t.cols.length * t.filas);
      return JSON.stringify(doc, null, bonito ? 2 : 0);
    }, 'aDatos(tabla, bonito?) — el formato .ñdatos: ida y vuelta exacta, fechas incluidas');
    def('aCsv', '... -> texto', a => {
      const t = tab(a[0], 1, 'aCsv');
      const sep = a.length > 1 ? txt(a[1], 2, 'aCsv') : ',';
      const esc = v => {
        if (v === null || v === undefined) return '';
        const s = v instanceof ObjFecha ? isoDeFecha(v)
          : typeof v === 'string' ? v
            : v === true ? 'cierto' : v === false ? 'falso' : repr(v, 1);
        return new RegExp('["\n\r' + sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']').test(s)
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const out = [t.cols.map(c => esc(c.nombre)).join(sep)];
      for (let f = 0; f < t.filas; f++) out.push(t.datos.map(col => esc(col[f])).join(sep));
      vm.cobrar(t.cols.length * t.filas);
      return out.join('\n');
    }, 'aCsv(tabla, separador?) — lo que espera una hoja de cálculo · pierde los tipos, por eso existe aDatos');
    def('aLista', 'tabla -> lista', a => {
      const t = tab(a[0], 1, 'aLista');
      const out = [];
      for (let f = 0; f < t.filas; f++) out.push(L(t.datos.map(col => col[f])));
      return L(out);
    }, 'una lista de listas, una por fila');
    def('aRegistros', 'tabla -> lista', a => {
      const t = tab(a[0], 1, 'aRegistros');
      const out = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        out.push(d);
      }
      vm.cobrar(t.cols.length * t.filas);
      return L(out);
    }, 'una lista de diccionarios · lo contrario de «tabla»');
    def('aColumnas', 'tabla -> dic', a => {
      // El inverso exacto de «deColumnas»: deColumnas(aColumnas(t)) == t. Sirve
      // para sacar todas las columnas de una vez, cuando «columna» una por una
      // ya es ruido.
      const t = tab(a[0], 1, 'aColumnas');
      const d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, L(t.datos[i].slice())));
      vm.cobrar(t.cols.length * t.filas);
      return d;
    }, 'un diccionario de listas, una por columna · el inverso de deColumnas');

    // ════════════════════════════════════════════════ mirar antes de tocar
    def('columnas', 'tabla -> lista<texto>', a => L(tab(a[0], 1, 'columnas').cols.map(c => c.nombre)),
      'los nombres de las columnas, en su orden');
    def('tipos', 'tabla -> dic<texto,texto>', a => {
      const t = tab(a[0], 1, 'tipos'), d = D();
      for (const c of t.cols) d.mapa.set(c.nombre, c.tipo);
      return d;
    }, 'el tipo de cada columna · esto es lo que un CSV no trae');
    def('primeras', '... -> tabla', a => {
      const t = tab(a[0], 1, 'primeras'), n = a.length > 1 ? ent(a[1], 2, 'primeras') : 5;
      const idx = [];
      for (let i = 0; i < Math.min(Math.max(0, n), t.filas); i++) idx.push(i);
      return porFilas(t, idx);
    }, 'primeras(t, 5) — las primeras filas');
    def('ultimas', '... -> tabla', a => {
      const t = tab(a[0], 1, 'ultimas'), n = a.length > 1 ? ent(a[1], 2, 'ultimas') : 5;
      const idx = [];
      for (let i = Math.max(0, t.filas - Math.max(0, n)); i < t.filas; i++) idx.push(i);
      return porFilas(t, idx);
    }, 'las últimas filas');
    def('vacios', 'tabla -> dic<texto,entero>', a => {
      const t = tab(a[0], 1, 'vacios'), d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i].reduce((n, v) => n + (nulo(v) ? 1 : 0), 0)));
      return d;
    }, 'cuántos huecos tiene cada columna · lo primero que hay que mirar de un archivo ajeno');
    def('describir', 'tabla -> tabla', a => {
      // Una tabla que describe la tabla: así se puede filtrar, ordenar y
      // guardar como cualquier otra.
      const t = tab(a[0], 1, 'describir');
      const cn = [], ct = [], cv = [], cu = [], cmin = [], cmax = [], cmed = [];
      for (let i = 0; i < t.cols.length; i++) {
        const col = t.datos[i], vs = col.filter(v => !nulo(v));
        cn.push(t.cols[i].nombre); ct.push(t.cols[i].tipo);
        cv.push(col.length - vs.length);
        cu.push(new Set(vs.map(v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v)))).size);
        const nums = vs.filter(v => typeof v === 'number');
        if (nums.length === vs.length && nums.length) {
          cmin.push(Math.min.apply(null, nums));
          cmax.push(Math.max.apply(null, nums));
          cmed.push(nums.reduce((p, c) => p + c, 0) / nums.length);
        } else { cmin.push(null); cmax.push(null); cmed.push(null); }
      }
      vm.cobrar(t.cols.length * t.filas);
      return nueva([
        { nombre: 'columna', tipo: 'texto' }, { nombre: 'tipo', tipo: 'texto' },
        { nombre: 'vacios', tipo: 'entero' }, { nombre: 'distintos', tipo: 'entero' },
        { nombre: 'minimo', tipo: 'real' }, { nombre: 'maximo', tipo: 'real' },
        { nombre: 'media', tipo: 'real' },
      ], [cn, ct, cv, cu, cmin, cmax, cmed]);
    }, 'una tabla con el tipo, los huecos, los distintos y el mínimo, máximo y media de cada columna');
    def('vistazo', '... -> nulo', a => {
      const t = tab(a[0], 1, 'vistazo'), n = a.length > 1 ? ent(a[1], 2, 'vistazo') : 10;
      const cols = t.cols.map(c => c.nombre);
      const cel = v => (v === null || v === undefined) ? '·'
        : v instanceof ObjFecha ? isoDeFecha(v)
          : typeof v === 'string' ? v : repr(v, 1);
      const cuerpo = [];
      for (let f = 0; f < Math.min(n, t.filas); f++) cuerpo.push(t.datos.map(col => cel(col[f])));
      const numerica = t.cols.map(c => c.tipo === 'entero' || c.tipo === 'real');
      const an = cols.map((c, i) => Math.max(c.length, t.cols[i].tipo.length, ...cuerpo.map(r => r[i].length)));
      const pad = (s, i) => (numerica[i] ? ' '.repeat(an[i] - s.length) + s : s + ' '.repeat(an[i] - s.length));
      vm.salida(cols.map(pad).join('  '));
      vm.salida(t.cols.map((c, i) => pad(c.tipo, i)).join('  '));
      vm.salida(an.map(x => '─'.repeat(x)).join('  '));
      for (const r of cuerpo) vm.salida(r.map(pad).join('  '));
      if (t.filas > n) vm.salida(`… y ${t.filas - n} filas más (${t.filas} en total)`);
      return null;
    }, 'vistazo(t, 10) — la imprime con los tipos debajo de los nombres y «·» en los huecos');

    // ════════════════════════════════════════════════════════════ seleccionar
    def('columna', 'tabla, texto -> lista', a => {
      const t = tab(a[0], 1, 'columna');
      return L(t.datos[iCol(t, txt(a[1], 2, 'columna'), 'columna')].slice());
    }, 'columna(t, "ventas") — sus valores como lista');
    def('celda', 'tabla, entero, texto -> cualquiera', a => {
      const t = tab(a[0], 1, 'celda'), f = ent(a[1], 2, 'celda');
      if (f < 0 || f >= t.filas) vm.error(`«celda»: la fila ${f} no existe · la tabla tiene ${t.filas}`);
      return t.datos[iCol(t, txt(a[2], 3, 'celda'), 'celda')][f];
    }, 'celda(t, 0, "ventas") — un valor suelto');
    def('fila', 'tabla, entero -> dic', a => {
      const t = tab(a[0], 1, 'fila'), f = ent(a[1], 2, 'fila');
      if (f < 0 || f >= t.filas) vm.error(`«fila»: la fila ${f} no existe · la tabla tiene ${t.filas}`);
      const d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
      return d;
    }, 'fila(t, 0) — un diccionario con esa fila');
    def('soloColumnas', 'tabla, lista -> tabla', a => {
      const t = tab(a[0], 1, 'soloColumnas');
      const ns = lst(a[1], 2, 'soloColumnas').items.map(String);
      const idx = ns.map(n => iCol(t, n, 'soloColumnas'));
      return nueva(idx.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), idx.map(i => t.datos[i].slice()));
    }, 'soloColumnas(t, ["ciudad", "ventas"]) — y en ESE orden');
    def('sinColumna', '... -> tabla', a => {
      const t = tab(a[0], 1, 'sinColumna');
      const fuera = [];
      for (let i = 1; i < a.length; i++) fuera.push(iCol(t, txt(a[i], i + 1, 'sinColumna'), 'sinColumna'));
      const quedan = t.cols.map((_, i) => i).filter(i => !fuera.includes(i));
      return nueva(quedan.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), quedan.map(i => t.datos[i].slice()));
    }, 'sinColumna(t, "interna", "temporal") — quita una o varias');
    def('renombrar', 'tabla, texto, texto -> tabla', a => {
      const t = tab(a[0], 1, 'renombrar'), viejo = txt(a[1], 2, 'renombrar'), nuevo = txt(a[2], 3, 'renombrar');
      const i = iCol(t, viejo, 'renombrar');
      if (nuevo !== viejo && t.indiceCol(nuevo) >= 0)
        vm.error(`«renombrar»: ya hay una columna «${nuevo}»`);
      const cols = copiaCols(t);
      cols[i].nombre = nuevo;
      return nueva(cols, t.datos.map(c => c.slice()));
    }, 'renombrar(t, "vtas", "ventas")');
    def('reordenar', 'tabla, lista -> tabla', a => {
      const t = tab(a[0], 1, 'reordenar');
      const ns = lst(a[1], 2, 'reordenar').items.map(String);
      // Las que no se nombran van detrás, en su orden: así reordenar dos
      // columnas de treinta no obliga a escribir las treinta.
      const idx = ns.map(n => iCol(t, n, 'reordenar'));
      for (let i = 0; i < t.cols.length; i++) if (!idx.includes(i)) idx.push(i);
      return nueva(idx.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), idx.map(i => t.datos[i].slice()));
    }, 'reordenar(t, ["fecha", "ciudad"]) — las que no nombres van detrás');

    // ══════════════════════════════════════════════════════ filtrar y ordenar
    def('donde', 'tabla, funcion -> tabla', a => {
      // La función recibe la FILA como diccionario, no la tabla: así se escribe
      // igual que un filtro sobre una lista de registros.
      const t = tab(a[0], 1, 'donde'), fn = vm.exigeFuncion(a[1], 2, 'donde');
      const idx = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        if (verdad(vm.invocar(fn, [d]))) idx.push(f);
      }
      return porFilas(t, idx);
    }, 'donde(t, fn(f) { devolver f["ventas"] > 100 }) — la función recibe cada fila como diccionario');
    def('ordenarPor', '... -> tabla', a => {
      const t = tab(a[0], 1, 'ordenarPor'), c = iCol(t, txt(a[1], 2, 'ordenarPor'), 'ordenarPor');
      const desc = a.length > 2 && verdad(a[2]);
      const col = t.datos[c];
      const idx = t.datos.length ? col.map((_, i) => i) : [];
      const clave = v => (v instanceof ObjFecha ? v.ms : v);
      idx.sort((x, y) => {
        const p = clave(col[x]), q = clave(col[y]);
        // Los huecos van al final, siempre: sea ascendente o descendente, lo
        // que no se sabe no debe encabezar la lista.
        if (nulo(p) && nulo(q)) return x - y;
        if (nulo(p)) return 1;
        if (nulo(q)) return -1;
        const r = p < q ? -1 : p > q ? 1 : 0;
        return (desc ? -r : r) || (x - y);          // estable
      });
      vm.cobrar(t.filas * 2);
      return porFilas(t, idx);
    }, 'ordenarPor(t, "ventas", descendente?) — estable, y los huecos siempre al final');
    def('unicas', 'tabla, texto -> lista', a => {
      const t = tab(a[0], 1, 'unicas'), c = iCol(t, txt(a[1], 2, 'unicas'), 'unicas');
      const vistos = new Set(), out = [];
      for (const v of t.datos[c]) {
        const k = v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v);
        if (vistos.has(k)) continue;
        vistos.add(k); out.push(v);
      }
      return L(out);
    }, 'unicas(t, "ciudad") — los valores distintos de una columna, en el orden en que aparecen');
    def('sinRepetir', '... -> tabla', a => {
      // Filas repetidas, mirando todas las columnas o solo las que se digan.
      const t = tab(a[0], 1, 'sinRepetir');
      const cs = a.length > 1 ? lst(a[1], 2, 'sinRepetir').items.map(x => iCol(t, String(x), 'sinRepetir'))
        : t.cols.map((_, i) => i);
      const vistos = new Set(), idx = [];
      for (let f = 0; f < t.filas; f++) {
        const k = cs.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        if (vistos.has(k)) continue;
        vistos.add(k); idx.push(f);
      }
      vm.cobrar(t.filas * cs.length);
      return porFilas(t, idx);
    }, 'sinRepetir(t) · sinRepetir(t, ["nit"]) — quita filas repetidas, y se queda con la primera');
    def('quitarVacios', '... -> tabla', a => {
      const t = tab(a[0], 1, 'quitarVacios');
      const cs = a.length > 1 ? lst(a[1], 2, 'quitarVacios').items.map(x => iCol(t, String(x), 'quitarVacios'))
        : t.cols.map((_, i) => i);
      const idx = [];
      for (let f = 0; f < t.filas; f++) if (!cs.some(c => nulo(t.datos[c][f]))) idx.push(f);
      return porFilas(t, idx);
    }, 'quitarVacios(t) · quitarVacios(t, ["nit"]) — quita las filas con huecos');

    // ══════════════════════════════════════════════════════════════ derivar
    def('conColumna', 'tabla, texto, funcion -> tabla', a => {
      const t = tab(a[0], 1, 'conColumna'), n = txt(a[1], 2, 'conColumna');
      const fn = vm.exigeFuncion(a[2], 3, 'conColumna');
      const vals = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        vals.push(vm.invocar(fn, [d]));
      }
      const i = t.indiceCol(n);
      const cols = copiaCols(t), datos = t.datos.map(c => c.slice());
      // Con el mismo nombre, se reemplaza: «conColumna(t, "total", …)» dos
      // veces no debe dejar dos columnas «total».
      if (i >= 0) { cols[i].tipo = inferirTipo(vals); datos[i] = vals; }
      else { cols.push({ nombre: n, tipo: inferirTipo(vals) }); datos.push(vals); }
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'conColumna(t, "total", fn(f) { devolver f["precio"] * f["cantidad"] }) — si ya existe, la reemplaza');
    def('convertir', 'tabla, texto, texto -> tabla', a => {
      // Cambia el TIPO de una columna, que es lo que hay que hacer después de
      // leer un CSV donde algo se adivinó mal.
      const t = tab(a[0], 1, 'convertir'), n = txt(a[1], 2, 'convertir'), tipo = txt(a[2], 3, 'convertir');
      if (!TIPOS_TABLA.includes(tipo))
        vm.error(`«convertir»: «${tipo}» no es un tipo de columna`, 'los tipos son: ' + TIPOS_TABLA.join(', '));
      const c = iCol(t, n, 'convertir');
      const conv = v => {
        if (nulo(v)) return null;
        switch (tipo) {
          case 'entero': { const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
            if (Number.isNaN(x)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es un número`); return Math.trunc(x); }
          case 'real': { const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
            if (Number.isNaN(x)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es un número`); return x; }
          case 'texto': return v instanceof ObjFecha ? isoDeFecha(v) : (typeof v === 'string' ? v : repr(v, 1));
          case 'bool': return verdad(v);
          case 'fecha': {
            if (v instanceof ObjFecha) return v;
            const x = leerCampo(String(v));
            if (!(x instanceof ObjFecha)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es una fecha`,
              'se leen 2026-09-29 y 29/09/2026');
            return x;
          }
          default: return v;
        }
      };
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      cols[c].tipo = tipo;
      datos[c] = datos[c].map(conv);
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'convertir(t, "ventas", "entero") — para arreglar lo que un CSV adivinó mal');
    def('aplicarA', 'tabla, texto, funcion -> tabla', a => {
      const t = tab(a[0], 1, 'aplicarA'), n = txt(a[1], 2, 'aplicarA');
      const fn = vm.exigeFuncion(a[2], 3, 'aplicarA');
      const c = iCol(t, n, 'aplicarA');
      const vals = t.datos[c].map(v => vm.invocar(fn, [v]));
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      cols[c].tipo = inferirTipo(vals); datos[c] = vals;
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'aplicarA(t, "ciudad", mayusculas) — la función recibe CADA VALOR, no la fila');
    def('rellenarVacios', 'tabla, texto, cualquiera -> tabla', a => {
      const t = tab(a[0], 1, 'rellenarVacios'), n = txt(a[1], 2, 'rellenarVacios');
      const c = iCol(t, n, 'rellenarVacios');
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      datos[c] = datos[c].map(v => (nulo(v) ? a[2] : v));
      cols[c].tipo = inferirTipo(datos[c]);
      return nueva(cols, datos);
    }, 'rellenarVacios(t, "ventas", 0) — pone un valor en los huecos de esa columna');
    def('numerar', '... -> tabla', a => {
      const t = tab(a[0], 1, 'numerar');
      const n = a.length > 1 ? txt(a[1], 2, 'numerar') : 'n';
      const desde = a.length > 2 ? ent(a[2], 3, 'numerar') : 1;
      if (t.indiceCol(n) >= 0) vm.error(`«numerar»: ya hay una columna «${n}»`);
      const vals = [];
      for (let f = 0; f < t.filas; f++) vals.push(desde + f);
      return nueva(copiaCols(t).concat([{ nombre: n, tipo: 'entero' }]),
        t.datos.map(c => c.slice()).concat([vals]));
    }, 'numerar(t, "n", 1) — añade una columna con el número de fila');

    // ═══════════════════════════════════════════════════ agrupar y resumir
    const agregado = (nombre, clase, doc) => def(nombre, '... -> dic', a => {
      const col = a.length ? txt(a[0], 1, nombre) : null;
      return receta(clase, col, null);
    }, doc);
    agregado('sumaCol', 'suma', 'sumaCol("ventas") — la receta de una suma, para agrupar o resumir');
    agregado('promedioCol', 'promedio', 'promedioCol("ventas")');
    agregado('minCol', 'min', 'minCol("ventas")');
    agregado('maxCol', 'max', 'maxCol("ventas")');
    agregado('primeroCol', 'primero', 'primeroCol("ciudad") — el primero del grupo');
    agregado('ultimoCol', 'ultimo', 'ultimoCol("ciudad")');
    agregado('contarCol', 'contar', 'contarCol() — cuántas filas · contarCol("nit") cuenta las que no están vacías');
    def('juntarCol', '... -> dic', a => {
      const col = txt(a[0], 1, 'juntarCol');
      const sep = a.length > 1 ? txt(a[1], 2, 'juntarCol') : ', ';
      const d = receta('juntar', col, null);
      d.mapa.set('separador', sep);
      return d;
    }, 'juntarCol("ciudad", ", ") — pega los valores del grupo en un texto');

    // Aplica una receta a un grupo de índices de fila.
    function aplicarReceta(t, r, idx) {
      const sep = r.sep || ', ';
      if (r.clase === 'contar') {
        if (r.col === null) return idx.length;
        const c = iCol(t, r.col, 'contarCol');
        return idx.reduce((n, f) => n + (nulo(t.datos[c][f]) ? 0 : 1), 0);
      }
      const c = iCol(t, r.col, r.clase + 'Col');
      const vals = idx.map(f => t.datos[c][f]).filter(v => !nulo(v));
      switch (r.clase) {
        case 'suma': case 'promedio': {
          const ns = vals.filter(v => typeof v === 'number');
          if (ns.length !== vals.length)
            vm.error(`«${r.clase === 'suma' ? 'sumaCol' : 'promedioCol'}»: la columna «${r.col}» no es de números`,
              `es de tipo ${t.cols[c].tipo}; con «convertir» se puede cambiar`);
          // Sin ningún valor, el resultado es NULO y no 0. La suma de nada es
          // 0 en matemáticas, pero en una tabla significa otra cosa: en una
          // celda de «ventas» un 0 dice «no vendió» y un hueco dice «no se
          // sabe». Es la regla de SQL, y es la que no miente.
          if (!ns.length) return null;
          const s = ns.reduce((p, x) => p + x, 0);
          return r.clase === 'suma' ? s : s / ns.length;
        }
        case 'min': case 'max': {
          if (!vals.length) return null;
          const k = v => (v instanceof ObjFecha ? v.ms : v);
          let mejor = vals[0];
          for (const v of vals) {
            const cmp = k(v) < k(mejor);
            if (r.clase === 'min' ? cmp : !cmp && k(v) !== k(mejor)) mejor = v;
          }
          return mejor;
        }
        case 'primero': return vals.length ? vals[0] : null;
        case 'ultimo': return vals.length ? vals[vals.length - 1] : null;
        case 'juntar': return vals.map(v => (typeof v === 'string' ? v : repr(v, 1))).join(sep);
        default: vm.error(`agregado desconocido: ${r.clase}`);
      }
    }
    // Lee el diccionario de recetas, con un mensaje claro si alguien pone algo
    // que no es una receta: es el error fácil de cometer aquí.
    function leerRecetas(d, quien) {
      const out = [];
      for (const [k, v] of d.mapa) {
        if (!esReceta(v))
          vm.error(`«${quien}»: «${k}» no es un agregado`,
            'los agregados son sumaCol, promedioCol, minCol, maxCol, primeroCol, ultimoCol, contarCol y juntarCol');
        const r = Object.assign({}, RECETAS.get(v));
        if (v.mapa.has('separador')) r.sep = v.mapa.get('separador');
        out.push([String(k), r]);
      }
      if (!out.length) vm.error(`«${quien}»: no se pidió ningún resumen`);
      return out;
    }

    def('agrupar', 'tabla, lista, dic -> tabla', a => {
      const t = tab(a[0], 1, 'agrupar');
      const claves = lst(a[1], 2, 'agrupar').items.map(x => String(x));
      const ic = claves.map(n => iCol(t, n, 'agrupar'));
      const recs = leerRecetas(dic(a[2], 3, 'agrupar'), 'agrupar');
      // Los grupos salen en el orden en que aparecen, no ordenados: así dos
      // corridas dan lo mismo y se puede ordenar después si hace falta.
      const grupos = new Map();
      for (let f = 0; f < t.filas; f++) {
        const k = ic.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(f);
      }
      vm.cobrar(t.filas * (ic.length + recs.length));
      const cols = ic.map(c => ({ nombre: t.cols[c].nombre, tipo: t.cols[c].tipo }))
        .concat(recs.map(([n]) => ({ nombre: n, tipo: 'cualquiera' })));
      const datos = cols.map(() => []);
      for (const idx of grupos.values()) {
        ic.forEach((c, i) => datos[i].push(t.datos[c][idx[0]]));
        recs.forEach(([, r], i) => datos[ic.length + i].push(aplicarReceta(t, r, idx)));
      }
      recs.forEach((_, i) => { cols[ic.length + i].tipo = inferirTipo(datos[ic.length + i]); });
      return nueva(cols, datos);
    }, 'agrupar(t, ["ciudad"], {"total": sumaCol("ventas"), "n": contarCol()}) — los grupos salen en el orden en que aparecen');
    def('resumir', 'tabla, dic -> tabla', a => {
      const t = tab(a[0], 1, 'resumir');
      const recs = leerRecetas(dic(a[1], 2, 'resumir'), 'resumir');
      const idx = [];
      for (let f = 0; f < t.filas; f++) idx.push(f);
      const datos = recs.map(([, r]) => [aplicarReceta(t, r, idx)]);
      return nueva(recs.map(([n], i) => ({ nombre: n, tipo: inferirTipo(datos[i]) })), datos);
    }, 'resumir(t, {"total": sumaCol("ventas")}) — la tabla entera en una fila, sin agrupar');
    def('contarPor', '... -> tabla', a => {
      const t = tab(a[0], 1, 'contarPor');
      const ns = [];
      for (let i = 1; i < a.length; i++) ns.push(txt(a[i], i + 1, 'contarPor'));
      if (!ns.length) vm.error('«contarPor» necesita al menos una columna');
      const rec = D();
      rec.mapa.set('cuantas', receta('contar', null, null));
      // Se apoya en «agrupar» para no tener dos formas de contar lo mismo.
      const ic = ns.map(n => iCol(t, n, 'contarPor'));
      const grupos = new Map();
      for (let f = 0; f < t.filas; f++) {
        const k = ic.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        grupos.set(k, (grupos.get(k) || 0) + 1);
        if (!grupos.has(k + '\u0001')) grupos.set(k + '\u0001', ic.map(c => t.datos[c][f]));
      }
      const cols = ic.map(c => ({ nombre: t.cols[c].nombre, tipo: t.cols[c].tipo }))
        .concat([{ nombre: 'cuantas', tipo: 'entero' }]);
      const datos = cols.map(() => []);
      for (const [k, v] of grupos) {
        if (k.endsWith('\u0001')) continue;
        const vals = grupos.get(k + '\u0001');
        vals.forEach((x, i) => datos[i].push(x));
        datos[ic.length].push(v);
      }
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'contarPor(t, "ciudad") — cuántas filas por valor · el atajo del caso más común');
    def('pivotar', 'tabla, texto, texto, dic -> tabla', a => {
      // Tabla cruzada: una columna pasa a ser varias. Es lo que se hace a mano
      // en una hoja de cálculo y a nadie le sale bien la primera vez.
      const t = tab(a[0], 1, 'pivotar');
      const fCol = txt(a[1], 2, 'pivotar'), cCol = txt(a[2], 3, 'pivotar');
      const recs = leerRecetas(dic(a[3], 4, 'pivotar'), 'pivotar');
      if (recs.length !== 1) vm.error('«pivotar»: se pide un solo agregado', 'una tabla cruzada tiene un valor por celda');
      const [, r] = recs[0];
      const iF = iCol(t, fCol, 'pivotar'), iC = iCol(t, cCol, 'pivotar');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const filas = new Map(), cols = new Map();
      for (let f = 0; f < t.filas; f++) {
        const kf = clave(t.datos[iF][f]), kc = clave(t.datos[iC][f]);
        if (!filas.has(kf)) filas.set(kf, { valor: t.datos[iF][f], celdas: new Map() });
        if (!cols.has(kc)) cols.set(kc, t.datos[iC][f]);
        const cel = filas.get(kf).celdas;
        if (!cel.has(kc)) cel.set(kc, []);
        cel.get(kc).push(f);
      }
      vm.cobrar(t.filas + filas.size * cols.size);
      const nombreCol = v => (v === null || v === undefined) ? '(vacío)'
        : v instanceof ObjFecha ? isoDeFecha(v) : (typeof v === 'string' ? v : repr(v, 1));
      const salidaCols = [{ nombre: t.cols[iF].nombre, tipo: t.cols[iF].tipo }]
        .concat([...cols.values()].map(v => ({ nombre: nombreCol(v), tipo: 'cualquiera' })));
      const datos = salidaCols.map(() => []);
      for (const g of filas.values()) {
        datos[0].push(g.valor);
        let i = 1;
        for (const kc of cols.keys()) {
          datos[i].push(g.celdas.has(kc) ? aplicarReceta(t, r, g.celdas.get(kc)) : null);
          i++;
        }
      }
      for (let i = 1; i < salidaCols.length; i++) salidaCols[i].tipo = inferirTipo(datos[i]);
      return nueva(salidaCols, datos);
    }, 'pivotar(t, "ciudad", "mes", {"ventas": sumaCol("ventas")}) — una columna pasa a ser varias');
    def('despivotar', '... -> tabla', a => {
      // Lo contrario: varias columnas pasan a ser dos, una de nombre y una de
      // valor. Es como se arregla una tabla escrita para mirarla, no para
      // calcular con ella.
      const t = tab(a[0], 1, 'despivotar');
      const fijas = lst(a[1], 2, 'despivotar').items.map(x => iCol(t, String(x), 'despivotar'));
      const nomVar = a.length > 2 ? txt(a[2], 3, 'despivotar') : 'variable';
      const nomVal = a.length > 3 ? txt(a[3], 4, 'despivotar') : 'valor';
      const mover = t.cols.map((_, i) => i).filter(i => !fijas.includes(i));
      if (!mover.length) vm.error('«despivotar»: no queda ninguna columna que mover');
      const cols = fijas.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo }))
        .concat([{ nombre: nomVar, tipo: 'texto' }, { nombre: nomVal, tipo: 'cualquiera' }]);
      const datos = cols.map(() => []);
      for (let f = 0; f < t.filas; f++) {
        for (const c of mover) {
          fijas.forEach((i, k) => datos[k].push(t.datos[i][f]));
          datos[fijas.length].push(t.cols[c].nombre);
          datos[fijas.length + 1].push(t.datos[c][f]);
        }
      }
      vm.cobrar(t.filas * mover.length);
      cols[cols.length - 1].tipo = inferirTipo(datos[datos.length - 1]);
      return nueva(cols, datos);
    }, 'despivotar(t, ["ciudad"], "mes", "ventas") — varias columnas pasan a ser dos');

    // ═════════════════════════════════════════════════════════════ combinar
    def('cruzar', '... -> tabla', a => {
      // Cruce por una columna común. Solo las filas que están en las DOS, que
      // es lo que se quiere casi siempre; lo demás se ve con «diferencia».
      const x = tab(a[0], 1, 'cruzar'), y = tab(a[1], 2, 'cruzar');
      const n = txt(a[2], 3, 'cruzar');
      const ix = iCol(x, n, 'cruzar'), iy = iCol(y, n, 'cruzar');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const indice = new Map();
      for (let f = 0; f < y.filas; f++) {
        const k = clave(y.datos[iy][f]);
        if (!indice.has(k)) indice.set(k, []);
        indice.get(k).push(f);
      }
      const colsY = y.cols.map((c, i) => i).filter(i => i !== iy);
      // Un nombre repetido se marca con el sufijo del lado, en vez de perderse.
      const nombreY = i => (x.indiceCol(y.cols[i].nombre) >= 0 ? y.cols[i].nombre + '_2' : y.cols[i].nombre);
      const cols = copiaCols(x).concat(colsY.map(i => ({ nombre: nombreY(i), tipo: y.cols[i].tipo })));
      const datos = cols.map(() => []);
      for (let f = 0; f < x.filas; f++) {
        const hs = indice.get(clave(x.datos[ix][f]));
        if (!hs) continue;
        for (const g of hs) {
          x.datos.forEach((col, i) => datos[i].push(col[f]));
          colsY.forEach((i, k) => datos[x.cols.length + k].push(y.datos[i][g]));
        }
      }
      vm.cobrar(x.filas + y.filas);
      return nueva(cols, datos);
    }, 'cruzar(a, b, "nit") — solo las filas que están en las dos · un nombre repetido lleva «_2»');
    def('apilar', '... -> tabla', a => {
      const ts = [];
      for (let i = 0; i < a.length; i++) ts.push(tab(a[i], i + 1, 'apilar'));
      if (!ts.length) vm.error('«apilar» necesita al menos una tabla');
      const base = ts[0];
      for (let i = 1; i < ts.length; i++) {
        const ns = ts[i].cols.map(c => c.nombre), bs = base.cols.map(c => c.nombre);
        if (ns.length !== bs.length || ns.some((n, k) => n !== bs[k]))
          vm.error(`«apilar»: la tabla ${i + 1} tiene otras columnas`,
            `la primera: ${bs.join(', ')} · la ${i + 1}: ${ns.join(', ')}`);
      }
      const datos = base.cols.map((_, c) => [].concat.apply([], ts.map(t => t.datos[c])));
      vm.cobrar(datos.length ? datos[0].length : 0);
      return nueva(base.cols.map((c, i) => ({ nombre: c.nombre, tipo: inferirTipo(datos[i]) })), datos);
    }, 'apilar(a, b, c) — una debajo de otra · las columnas tienen que coincidir');
    def('juntarColumnas', '... -> tabla', a => {
      const x = tab(a[0], 1, 'juntarColumnas'), y = tab(a[1], 2, 'juntarColumnas');
      if (x.filas !== y.filas)
        vm.error(`«juntarColumnas»: una tiene ${x.filas} filas y la otra ${y.filas}`,
          'para juntar por una columna común usa «cruzar»');
      for (const c of y.cols) if (x.indiceCol(c.nombre) >= 0)
        vm.error(`«juntarColumnas»: las dos tienen una columna «${c.nombre}»`);
      return nueva(copiaCols(x).concat(copiaCols(y)),
        x.datos.map(c => c.slice()).concat(y.datos.map(c => c.slice())));
    }, 'juntarColumnas(a, b) — lado a lado · mismo número de filas y sin nombres repetidos');
    def('diferencia', 'tabla, tabla, texto -> tabla', a => {
      const x = tab(a[0], 1, 'diferencia'), y = tab(a[1], 2, 'diferencia');
      const n = txt(a[2], 3, 'diferencia');
      const ix = iCol(x, n, 'diferencia'), iy = iCol(y, n, 'diferencia');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const hay = new Set(y.datos[iy].map(clave));
      const idx = [];
      for (let f = 0; f < x.filas; f++) if (!hay.has(clave(x.datos[ix][f]))) idx.push(f);
      vm.cobrar(x.filas + y.filas);
      return porFilas(x, idx);
    }, 'diferencia(a, b, "nit") — las filas de «a» cuyo valor NO está en «b» · para conciliar');
  };
}


// ============================================================================
//  Ñ v4 — eDSL «estilo»: reglas de CSS como valores de primera clase
//  Parte 13.
//
//  Se importa con:  usar "estilo"
//
//  QUÉ HAY AQUÍ Y QUÉ NO. La maquinaria —el diccionario de propiedades y de
//  valores en español, la composición, el anidamiento y la emisión de la clase
//  local— ya existía y funcionaba; estaba suelta en la biblioteca, con sus 22
//  nombres en el ámbito global de todo programa. Este archivo la recoge entera
//  y se la queda. La biblioteca sigue necesitando TRES cosas de ella, porque un
//  nodo de la página lleva estilo dentro: saber si un valor es un estilo,
//  fusionar dos, y sacar la clase y el CSS de uno. Esas tres salen por
//  «vm.estilos», y son la misma copia: si la regla de traducir «transparente»
//  cambia, cambia en un solo sitio.
//
//  LO QUE LE FALTABA: TOKENS DE DISEÑO. Es lo más usado de SCSS y lo único que
//  de verdad faltaba. Sin ello, un color se escribe a mano en diez sitios, que
//  es como muere todo sistema visual. La forma que se eligió no es un registro
//  global de valores —eso rompería lo que hace bueno al sistema actual, que
//  nada sea global por accidente— sino variables de CSS:
//
//    tema({"color": {"acento": "#4F3FD4"}, "espacio": {"m": 16}})
//
//  devuelve un ESTILO cuyas propiedades son «--color-acento: #4F3FD4» y
//  «--espacio-m: 16px», y «color("acento")» devuelve el texto «var(--color-acento)»,
//  que sirve como valor de cualquier propiedad. De ahí salen tres cosas gratis:
//
//    · el modo oscuro es volver a declarar el tema dentro de «enOscuro(…)», sin
//      tocar ni una regla de los componentes;
//    · dos temas pueden convivir, porque la variable la resuelve la cascada
//      donde se use, no una tabla global en el momento de escribir la regla;
//    · un nombre de token mal escrito se caza, porque «tema» apunta los nombres
//      que declaró y el accesor se queja con la lista de los que sí existen.
//
//  De esa última sale la única regla de uso: DECLARA EL TEMA ANTES DE USAR SUS
//  TOKENS. La comprobación es de ejecución, así que mira lo que se haya
//  declarado hasta ese momento; al CSS le da igual el orden, pero a esta no.
//  «tema» arriba del archivo, que es donde se pone de todas formas.
//
//  EL CHOQUE DE «color». En «estilo», «color("acento")» lee un token. Pero
//  «color» ya es un global: el del pincel del lienzo, que pertenece al eDSL
//  «dibujo» y todavía no se ha mudado. Son dos cosas distintas con un nombre, y
//  por eso está declarado como excepción a propósito en pruebas/edsl.js. No es
//  el caso de «tabla», que hubo que renombrar: «tabla» es además el nombre de
//  un TIPO, y un tipo se escribe en todos los archivos, no solo en los que
//  hacen «usar». Cuando «dibujo» se mude, cada «color» vivirá en su eDSL y la
//  excepción hay que borrarla —y la prueba de excepciones declaradas falla ese
//  día, que es justo cuando hay que decidirlo.
// ============================================================================

// La maquinaria. Se construye una vez por motor y vive en «vm.estilos», porque
// la biblioteca la necesita para los nodos de la página y no puede haber dos
// copias de estas reglas.
function maquinariaEstilo(vm, w, sinPagina) {
  // Los @keyframes que declaró el programa. Se guardan porque limpiarPagina()
  // se lleva la hoja de clases entera: sin este registro, la animación existe
  // hasta el primer repintado y luego desaparece sin decir nada.
  const animaciones = new Map();
  // Los nombres de token que el programa declaró con «tema», por grupo. Solo
  // sirven para cazar el nombre mal escrito: el valor que se emite es siempre
  // «var(--grupo-nombre)», así que quien manda es la cascada, no esta tabla.
  const tokens = new Map();
  const PROPS = {
    // caja
    ancho: 'width', alto: 'height', anchoMin: 'min-width', anchoMax: 'max-width',
    altoMin: 'min-height', altoMax: 'max-height',
    relleno: 'padding', rellenoArriba: 'padding-top', rellenoAbajo: 'padding-bottom',
    rellenoIzquierda: 'padding-left', rellenoDerecha: 'padding-right',
    margen: 'margin', margenArriba: 'margin-top', margenAbajo: 'margin-bottom',
    margenIzquierda: 'margin-left', margenDerecha: 'margin-right',
    borde: 'border', bordeArriba: 'border-top', bordeAbajo: 'border-bottom',
    bordeIzquierda: 'border-left', bordeDerecha: 'border-right',
    bordeColor: 'border-color', bordeAncho: 'border-width', bordeEstilo: 'border-style',
    redondeo: 'border-radius', sombra: 'box-shadow', cajaModelo: 'box-sizing',
    // color y fondo
    color: 'color', fondo: 'background', fondoColor: 'background-color',
    fondoImagen: 'background-image', fondoTamano: 'background-size',
    fondoPosicion: 'background-position', fondoRepetir: 'background-repeat',
    opacidad: 'opacity',
    // texto
    fuente: 'font-family', tamano: 'font-size', grosor: 'font-weight',
    cursiva: 'font-style', interlineado: 'line-height', espaciado: 'letter-spacing',
    alinear: 'text-align', decoracion: 'text-decoration', mayusculas: 'text-transform',
    sombraTexto: 'text-shadow', sangria: 'text-indent', ajusteTexto: 'white-space',
    partirPalabra: 'word-break', partirTexto: 'overflow-wrap',
    // disposición
    mostrar: 'display', posicion: 'position', arriba: 'top', abajo: 'bottom',
    izquierda: 'left', derecha: 'right', capa: 'z-index', flotar: 'float',
    desbordar: 'overflow', desbordarX: 'overflow-x', desbordarY: 'overflow-y',
    visibilidad: 'visibility',
    // flex y rejilla
    direccion: 'flex-direction', justificar: 'justify-content',
    alinearItems: 'align-items', alinearPropio: 'align-self', envolver: 'flex-wrap',
    hueco: 'gap', crecer: 'flex-grow', encoger: 'flex-shrink', baseFlex: 'flex-basis',
    orden: 'order', columnas: 'grid-template-columns', filas: 'grid-template-rows',
    areaRejilla: 'grid-area', columna: 'grid-column', fila: 'grid-row',
    // movimiento y otros
    transicion: 'transition', transformar: 'transform', animacion: 'animation',
    cursor: 'cursor', relleno2: 'fill', trazo: 'stroke', objetoAjuste: 'object-fit',
    filtro: 'filter', puntero: 'pointer-events', usuarioSeleccion: 'user-select',
    contenido: 'content',
  };
  // Estas llevan número pelado: ponerles «px» las rompe.
  const SIN_UNIDAD = new Set(['opacity', 'z-index', 'flex-grow', 'flex-shrink', 'flex',
    'line-height', 'font-weight', 'order', 'zoom', 'columns', 'column-count', 'tab-size']);
  const PROP_OK = /^(--)?[a-zA-Z][a-zA-Z0-9-]*$/;
  const SELECTOR_OK = /^[^{}@;]*$/;

  const esEstilo = v => v instanceof ObjEstilo;

  function nombrePropiedad(bruto) {
    const n = String(bruto);
    if (n.startsWith('--')) return n;                       // variable de CSS
    const css = PROPS[n] || n.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    if (!PROP_OK.test(css)) vm.error(`«estilo»: «${bruto}» no es un nombre de propiedad válido`);
    return css;
  }

  // Los nombres de propiedad se traducen desde el principio; los valores no, y
  // eso hacía que «{"fondo": "transparente"}» saliera como «background:
  // transparente» —CSS inválido que el navegador tira sin decir nada—. Un
  // lenguaje que te deja escribir la propiedad en español y luego te obliga a
  // saber la palabra en inglés para el valor no está terminado.
  const VALORES = {
    ninguno: 'none', ninguna: 'none', nada: 'none',
    transparente: 'transparent', automatico: 'auto', automatica: 'auto', heredado: 'inherit',
    heredada: 'inherit', inicial: 'initial', sinDefinir: 'unset',
    // disposición
    bloque: 'block', enLinea: 'inline', bloqueEnLinea: 'inline-block', rejilla: 'grid',
    tabla: 'table', celda: 'table-cell', contenidos: 'contents',
    relativo: 'relative', absoluto: 'absolute', fijado: 'fixed', pegajoso: 'sticky',
    estatico: 'static',
    // «fila» no estaba, y estaba «columna»: {"direccion": "fila"} salía como
    // «flex-direction: fila», CSS inválido que el navegador tira sin decir nada
    // y deja el elemento en columna. Lo encontró «enFila» al escribirse, no una
    // lectura de esta tabla.
    fila: 'row', columna: 'column',
    columnaInversa: 'column-reverse', filaInversa: 'row-reverse',
    envolver: 'wrap', sinEnvolver: 'nowrap',
    centro: 'center', centrado: 'center', inicio: 'flex-start', final: 'flex-end',
    entre: 'space-between', alrededor: 'space-around', parejo: 'space-evenly',
    estirar: 'stretch', linea: 'baseline',
    izquierda: 'left', derecha: 'right', arriba: 'top', abajo: 'bottom',
    justificado: 'justify',
    oculto: 'hidden', oculta: 'hidden', visible: 'visible', desplazar: 'scroll',
    // texto
    negrita: 'bold', masNegrita: 'bolder', ligera: 'lighter',
    cursiva: 'italic', oblicua: 'oblique', normal: 'normal',
    mayusculas: 'uppercase', minusculas: 'lowercase', capital: 'capitalize',
    subrayado: 'underline', tachado: 'line-through',
    preformateado: 'pre', preLinea: 'pre-line', preEnvuelto: 'pre-wrap',
    // otros
    mano: 'pointer', puntero: 'pointer', texto2: 'text', noPermitido: 'not-allowed',
    mover: 'move', espera: 'wait', ayuda: 'help', agarrar: 'grab',
    cubrir: 'cover', contener: 'contain', rellenar2: 'fill',
    solido: 'solid', punteado: 'dotted', rayado: 'dashed', doble: 'double',
    redondo: 'round', cuadrado: 'square',
    // colores
    blanco: 'white', negro: 'black', rojo: 'red', verde: 'green', azul: 'blue',
    amarillo: 'yellow', naranja: 'orange', morado: 'purple', violeta: 'violet',
    rosa: 'pink', gris: 'gray', grisClaro: 'lightgray', grisOscuro: 'darkgray',
    marron: 'brown', cian: 'cyan', magenta: 'magenta', dorado: 'gold',
    plateado: 'silver', turquesa: 'turquoise', beige: 'beige', lima: 'lime',
    azulMarino: 'navy', aguamarina: 'aquamarine', coral: 'coral', salmon: 'salmon',
  };
  // Aquí el valor es texto libre, no palabras clave: traducir «negrita» dentro
  // de un nombre de tipografía o de un contenido sería peor que no traducir.
  const TEXTO_LIBRE = new Set(['content', 'font-family', 'grid-template-areas', 'quotes']);

  function traducirValor(css, s) {
    if (TEXTO_LIBRE.has(css) || css.startsWith('--')) return s;
    // Palabra por palabra: «2px solid azul» → «2px solid blue».
    return s.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*/g,
      p => (Object.prototype.hasOwnProperty.call(VALORES, p) ? VALORES[p] : p));
  }

  function valorPropiedad(css, v) {
    if (v instanceof ObjLista) return v.items.map(x => valorPropiedad(css, x)).join(' ');
    if (typeof v === 'number') {
      if (v === 0 || SIN_UNIDAD.has(css) || css.startsWith('--')) return repr(v, 0);
      return repr(v, 0) + 'px';                             // los números son píxeles
    }
    const s = repr(v, 0);
    // Un valor no puede cerrar su regla ni salirse de la hoja de estilos: es el
    // mismo principio que en el árbol de la página, los datos no son marcado.
    if (/[{};]/.test(s) || /<\s*\//.test(s)) {
      vm.error(`«estilo»: el valor de «${css}» contiene caracteres que romperían la hoja`,
        'si necesitas escribir CSS literal, usa cssCrudo("…")');
    }
    return traducirValor(css, s);
  }

  function fusionar(args, quien) {
    const e = vm.nuevoEstilo();
    for (const x of args) {
      if (x === null) continue;
      if (esEstilo(x)) {
        for (const [k, v] of x.props) e.props.set(k, v);    // gana el de la derecha
        for (const r of x.reglas) e.reglas.push(r);
        for (const m of x.medios) e.medios.push(m);
      } else if (x instanceof ObjDic) {
        for (const [k, v] of x.mapa) {
          const css = nombrePropiedad(k);
          e.props.set(css, valorPropiedad(css, v));
        }
      } else {
        vm.error(`«${quien}» solo acepta diccionarios y estilos, y recibió ${tipoDe(x)}`,
          'para CSS escrito a mano usa cssCrudo("…")');
      }
    }
    vm.cobrar(1 + e.props.size);
    return e;
  }

  function anidar(selector, args, quien, global) {
    if (!SELECTOR_OK.test(selector)) vm.error(`«${quien}»: el selector «${selector}» no es válido`);
    const e = vm.nuevoEstilo();
    e.reglas.push({ selector, estilo: fusionar(args, quien), global: !!global });
    vm.cobrar(2);
    return e;
  }


  // ---- de estilo a CSS -----------------------------------------------------
  function huella(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return (h >>> 0).toString(36);
  }
  function canonico(e) {
    let s = '';
    for (const [k, v] of e.props) s += k + ':' + v + ';';
    for (const r of e.reglas) s += (r.global ? '!' : '') + r.selector + '{' + canonico(r.estilo) + '}';
    for (const m of e.medios) s += '@' + m.consulta + '{' + canonico(m.estilo) + '}';
    return s;
  }
  function resolverSelector(sel, padre) {
    return sel.includes('&') ? sel.split('&').join(padre) : padre + ' ' + sel;
  }
  function emitirReglas(e, sel, media, fuera) {
    const props = [];
    for (const [k, v] of e.props) props.push(`${k}:${v}`);
    if (props.length) {
      const regla = `${sel}{${props.join(';')}}`;
      fuera.push(media ? `@media ${media}{${regla}}` : regla);
    }
    for (const r of e.reglas) {
      emitirReglas(r.estilo, r.global ? r.selector : resolverSelector(r.selector, sel), media, fuera);
    }
    for (const m of e.medios) {
      emitirReglas(m.estilo, sel, media ? `${media} and ${m.consulta}` : m.consulta, fuera);
    }
  }
  function cssDe(e) {
    if (e.css) return e.css;
    const nombre = 's' + huella(canonico(e));
    const fuera = [];
    emitirReglas(e, '.' + nombre, null, fuera);
    e.css = { nombre, texto: fuera.join('\n') };
    return e.css;
  }

  return { esEstilo, fusionar, anidar, cssDe, nombrePropiedad, valorPropiedad,
           huella, animaciones, tokens, w, sinPagina, PROPS, VALORES };
}

function instalarEstilo(vm) {
  const M = vm.estilos;
  const { esEstilo, fusionar, anidar, valorPropiedad, huella, animaciones, tokens, w, sinPagina } = M;
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const dic = (v, n, f) => {
    if (!(v instanceof ObjDic)) vm.error(`«${f}»: el argumento ${n} debe ser un diccionario y es ${tipoDe(v)}`);
    return v;
  };
  const D = () => vm.nuevoDic();
  // Un nombre de token acaba dentro de «--grupo-nombre», así que tiene que ser
  // un identificador de CSS y no cualquier texto.
  const NOMBRE_OK = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
  // Los grupos cuyo número NO es una medida. En los demás, 16 significa 16px:
  // es la misma regla que ya tienen las propiedades, y por eso se emite pasando
  // por «valorPropiedad», no traduciendo aquí otra vez.
  const SIN_MEDIDA = new Set(['grosor', 'peso', 'opacidad', 'capa', 'interlineado', 'color']);

  // Un @keyframes se emite una sola vez y devuelve su nombre. Lo usan
  // «fotogramas», que recibe los pasos del programa, y «aparecer»/«deslizar»,
  // que los traen hechos.
  function emitirFotogramas(cuerpo) {
    const nombre = 'a' + huella(cuerpo);
    const regla = `@keyframes ${nombre}{${cuerpo}}`;
    animaciones.set(nombre, regla);
    if (w.asegurarClase) w.asegurarClase(nombre, regla);
    vm.cobrar(2);
    return nombre;
  }
  // Las propiedades de un estilo, como texto de reglas. Es lo que necesita un
  // paso de @keyframes, que no lleva selector.
  const propsDe = e => [...e.props].map(([k, v]) => `${k}:${v}`).join(';');
  // Un estilo hecho de un diccionario de propiedades ya en español, más lo que
  // venga detrás. Así todos los atajos de disposición aceptan «…» como el resto.
  const conMas = (base, resto, quien) => {
    const d = D();
    for (const [k, v] of base) d.mapa.set(k, v);
    return fusionar([d, ...resto], quien);
  };
  const msDe = (v, pordefecto) => (typeof v === 'number' ? v : pordefecto);

  return function (def) {
    // ══════════════════════════════════════════════════════════ componer
    def('estilo', '... -> estilo', a => fusionar(a, 'estilo'),
      'estilo({…}, otroEstilo, …) — compone; gana el de la derecha');
    def('cssCrudo', 'texto -> nulo', a => {
      if (!w.estilo) sinPagina('cssCrudo');
      w.estilo(txt(a[0], 1, 'cssCrudo'));
      return null;
    }, 'cssCrudo(texto) — una hoja de estilos escrita a mano; la puerta de atrás');
    def('estiloGlobal', '... -> estilo',
      a => anidar(txt(a[0], 1, 'estiloGlobal'), a.slice(1), 'estiloGlobal', true),
      'estiloGlobal("selector", …) — se sale del ámbito local, como «:global»');
    def('reiniciar', ' -> estilo', () => {
      // Las cuatro reglas que se escriben en todo proyecto y que nadie recuerda
      // entera. No es una hoja de reinicio completa a propósito: lo que hace es
      // quitar las sorpresas —el margen del body, el modelo de caja que no
      // cuenta el relleno, la imagen que desborda— y nada más.
      const e = vm.nuevoEstilo();
      const g = (sel, props) => {
        const d = D();
        for (const [k, v] of props) d.mapa.set(k, v);
        e.reglas.push({ selector: sel, estilo: fusionar([d], 'reiniciar'), global: true });
      };
      g('*, *::before, *::after', [['cajaModelo', 'border-box']]);
      g('body', [['margen', 0]]);
      g('img, video, canvas, svg', [['mostrar', 'bloque'], ['anchoMax', '100%']]);
      g('button, input, textarea, select', [['fuente', 'inherit'], ['tamano', 'inherit']]);
      vm.cobrar(4);
      return e;
    }, 'reiniciar() — quita las sorpresas del navegador · úsalo una vez, como estiloGlobal');

    // ══════════════════════════════════════════════════ tokens de diseño
    def('tema', 'dic -> estilo', a => {
      // Devuelve un ESTILO con las variables de CSS, no una tabla global. Lo
      // normal es estiloGlobal(":root", tema({…})); dentro de enOscuro(…) se
      // vuelve a declarar y el modo oscuro entero son esas líneas.
      const d = dic(a[0], 1, 'tema');
      const e = vm.nuevoEstilo();
      for (const [grupo, valores] of d.mapa) {
        const g = String(grupo);
        if (!NOMBRE_OK.test(g)) vm.error(`«tema»: «${g}» no sirve como nombre de grupo`,
          'los grupos son nombres sencillos: color, espacio, tipografia, radio, sombra');
        if (!(valores instanceof ObjDic))
          vm.error(`«tema»: el grupo «${g}» tiene que ser un diccionario de nombre → valor`,
            'por ejemplo {"color": {"acento": "#4F3FD4", "fondo": "blanco"}}');
        let vistos = tokens.get(g);
        if (!vistos) tokens.set(g, vistos = new Set());
        for (const [n, v] of valores.mapa) {
          const nm = String(n);
          if (!NOMBRE_OK.test(nm)) vm.error(`«tema»: «${nm}» no sirve como nombre de token`);
          // Se emite por «valorPropiedad» con una propiedad de mentira, para que
          // valgan las mismas reglas que en cualquier otra: «transparente» se
          // traduce, 16 son 16px, y un valor con «;» se rechaza.
          e.props.set(`--${g}-${nm}`, valorPropiedad(SIN_MEDIDA.has(g) ? 'opacity' : 'width', v));
          vistos.add(nm);
        }
      }
      vm.cobrar(1 + e.props.size);
      return e;
    }, 'tema({"color": {…}, "espacio": {…}}) — declara los tokens · ponlo arriba, en estiloGlobal(":root", …)');

    const accesor = (nombre, grupo) => def(nombre, 'texto -> texto', a => {
      const n = txt(a[0], 1, nombre);
      const vistos = tokens.get(grupo);
      if (!vistos || !vistos.size)
        vm.error(`«${nombre}»: ningún «tema» ha declarado el grupo «${grupo}»`,
          `declara el tema primero: estiloGlobal(":root", tema({"${grupo}": {"${n}": …}}))`);
      if (!vistos.has(n))
        vm.error(`«${nombre}»: el tema no declara «${n}» en «${grupo}»`,
          'declarados: ' + [...vistos].join(', '));
      return `var(--${grupo}-${n})`;
    }, `${nombre}("nombre") — el token de ${grupo} que declaró «tema»`);
    accesor('color', 'color');
    accesor('espacio', 'espacio');
    accesor('tipografia', 'tipografia');
    accesor('radio', 'radio');
    accesor('sombraToken', 'sombra');

    def('paleta', '... -> dic', a => {
      // De un color base salen los tonos, aclarando y oscureciendo en el espacio
      // HSL. Sirve para no escribir nueve hexadecimales a mano y, sobre todo,
      // para que los nueve sean del mismo color.
      const base = txt(a[0], 1, 'paleta');
      const cuantos = a.length > 1 ? Math.trunc(num(a[1], 2, 'paleta')) : 9;
      if (cuantos < 3 || cuantos > 25) vm.error('«paleta»: los tonos van de 3 a 25', `pediste ${cuantos}`);
      const rgb = aRgb(base);
      if (!rgb) vm.error(`«paleta»: «${base}» no es un color que se pueda leer`,
        'usa #rgb, #rrggbb o rgb(r, g, b) · los nombres en español solo valen como valor, no como base');
      const [h, s, l] = aHsl(rgb);
      const d = D();
      const medio = (cuantos - 1) / 2;
      for (let i = 0; i < cuantos; i++) {
        // El tono del medio es el color que pasaron, exacto. Los de fuera se
        // acercan al blanco y al negro sin llegar, que es donde un tono deja de
        // tener color.
        const t = (i - medio) / medio;                       // -1 … 0 … 1
        const li = i === medio ? l : (t < 0 ? l + (0.96 - l) * -t : l + (0.08 - l) * t);
        d.mapa.set(String(i + 1), deHsl(h, s, li));
      }
      vm.cobrar(cuantos);
      return d;
    }, 'paleta("#4F3FD4", cuantos?) — los tonos de un color, del más claro al más oscuro · para meter en «tema»');

    def('escalaTipo', '... -> dic', a => {
      // Una escala tipográfica es una razón geométrica, no una lista de tallas
      // elegidas a ojo: por eso los tamaños de una página bien hecha «pegan».
      const base = num(a[0], 1, 'escalaTipo');
      const razon = a.length > 1 ? num(a[1], 2, 'escalaTipo') : 1.25;
      const cuantos = a.length > 2 ? Math.trunc(num(a[2], 3, 'escalaTipo')) : 6;
      if (razon <= 1) vm.error('«escalaTipo»: la razón tiene que ser mayor que 1', `llegó ${razon}`);
      if (cuantos < 2 || cuantos > 20) vm.error('«escalaTipo»: los pasos van de 2 a 20', `pediste ${cuantos}`);
      const d = D();
      for (let i = 0; i < cuantos; i++) {
        const v = base * Math.pow(razon, i);
        d.mapa.set(String(i), Math.round(v * 100) / 100);
      }
      vm.cobrar(cuantos);
      return d;
    }, 'escalaTipo(base, razon?, pasos?) — tamaños en progresión geométrica · para meter en «tema»');

    // ══════════════════════════════════════════════════════════ estados
    const estado = (nombre, sel) => def(nombre, '... -> estilo',
      a => anidar('&' + sel, a, nombre), `&${sel}`);
    estado('alPasar', ':hover');
    estado('alEnfocar', ':focus');
    estado('alActivar', ':active');
    estado('alVisitar', ':visited');
    estado('siDeshabilitado', ':disabled');
    estado('siInvalido', ':invalid');
    estado('alSeleccionar', ':checked');
    estado('primero', ':first-child');
    estado('ultimo', ':last-child');
    estado('impares', ':nth-child(odd)');
    estado('pares', ':nth-child(even)');
    estado('siVacio', ':empty');
    estado('siSolo', ':only-child');

    def('hijoN', '... -> estilo', a => {
      // Un número o una fórmula: hijoN(3, …) y hijoN("3n+1", …). La fórmula se
      // revisa, porque un selector inválido se lo come el navegador callado y
      // con él se va la regla entera.
      const q = a[0];
      let sel;
      if (typeof q === 'number') sel = String(Math.trunc(q));
      else {
        sel = txt(q, 1, 'hijoN').replace(/\s+/g, '');
        if (!/^(odd|even|impares|pares|[+-]?\d*n?([+-]\d+)?)$/.test(sel) || sel === '')
          vm.error(`«hijoN»: «${sel}» no es una posición válida`,
            'vale un número, «3n+1», «impares» o «pares»');
        if (sel === 'impares') sel = 'odd';
        if (sel === 'pares') sel = 'even';
      }
      return anidar(`&:nth-child(${sel})`, a.slice(1), 'hijoN');
    }, 'hijoN(3, …) · hijoN("3n+1", …) — &:nth-child(…)');

    // ═════════════════════════════════════════════════ pseudoelementos
    const pseudoContenido = (nombre, sel) => def(nombre, '... -> estilo', a => {
      const e = fusionar(a, nombre);
      if (!e.props.has('content')) e.props.set('content', '""');   // sin esto no se pinta
      const env = vm.nuevoEstilo();
      env.reglas.push({ selector: '&' + sel, estilo: e, global: false });
      return env;
    }, `&${sel}`);
    pseudoContenido('antes', '::before');
    pseudoContenido('despues', '::after');
    const pseudo = (nombre, sel) => def(nombre, '... -> estilo',
      a => anidar('&' + sel, a, nombre), `&${sel}`);
    pseudo('marcador', '::marker');
    pseudo('seleccion', '::selection');
    pseudo('pista', '::placeholder');

    // ══════════════════════════════════════════════════════════ anidar
    def('dentro', '... -> estilo', a => {
      const sel = txt(a[0], 1, 'dentro');
      return anidar(sel.includes('&') ? sel : '& ' + sel, a.slice(1), 'dentro');
    }, 'dentro("selector", …) — anida como el «&» de SCSS');
    def('hijoDirecto', '... -> estilo',
      a => anidar('& > ' + txt(a[0], 1, 'hijoDirecto'), a.slice(1), 'hijoDirecto'),
      'hijoDirecto("selector", …) — solo los hijos, no los nietos');
    def('hermano', '... -> estilo',
      a => anidar('& ~ ' + txt(a[0], 1, 'hermano'), a.slice(1), 'hermano'),
      'hermano("selector", …) — cualquier hermano de después');
    def('hermanoSiguiente', '... -> estilo',
      a => anidar('& + ' + txt(a[0], 1, 'hermanoSiguiente'), a.slice(1), 'hermanoSiguiente'),
      'hermanoSiguiente("selector", …) — solo el de justo después');
    def('cuando', '... -> estilo', a => {
      // Sin espacio: cuando(".activo", …) es «&.activo», el mismo elemento con
      // esa clase encima. Con «dentro» sería «& .activo», otro elemento, y ese
      // espacio de más es un error que no da ningún aviso.
      const sel = txt(a[0], 1, 'cuando');
      return anidar('&' + sel, a.slice(1), 'cuando');
    }, 'cuando(".clase", …) — el mismo elemento cuando además lleva eso · «&.clase», sin espacio');

    // ═══════════════════════════════════════════════════════════ medios
    def('enPantalla', '... -> estilo', a => {
      const min = num(a[0], 1, 'enPantalla');
      let i = 1, consulta = `(min-width: ${min}px)`;
      if (typeof a[1] === 'number') { consulta += ` and (max-width: ${a[1]}px)`; i = 2; }
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a.slice(i), 'enPantalla') });
      vm.cobrar(2);
      return e;
    }, 'enPantalla(minimo, maximo?, …) — una consulta de medios');
    def('enAlto', '... -> estilo', a => {
      const min = num(a[0], 1, 'enAlto');
      let i = 1, consulta = `(min-height: ${min}px)`;
      if (typeof a[1] === 'number') { consulta += ` and (max-height: ${a[1]}px)`; i = 2; }
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a.slice(i), 'enAlto') });
      vm.cobrar(2);
      return e;
    }, 'enAlto(minimo, maximo?, …) — una consulta de medios por altura');
    const medio = (nombre, consulta) => def(nombre, '... -> estilo', a => {
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a, nombre) });
      vm.cobrar(2);
      return e;
    }, `${nombre}(…) — @media ${consulta}`);
    medio('enOscuro', '(prefers-color-scheme: dark)');
    medio('enClaro', '(prefers-color-scheme: light)');
    medio('enImpresion', 'print');
    medio('enMovimientoReducido', '(prefers-reduced-motion: reduce)');
    medio('enTactil', '(hover: none) and (pointer: coarse)');
    medio('enApaisado', '(orientation: landscape)');

    // ══════════════════════════════════ disposición, sin recordar flex
    // Estos ocho son atajos, y un atajo solo se gana el sitio si además arregla
    // algo. Los tres que reparten en fila llevan «& > * { min-width: 0 }»:
    // sin eso, un hijo con un texto largo empuja la fila y saca la barra
    // horizontal de la página, que es el fallo más repetido de flex y el más
    // difícil de ver, porque la regla que falta no está en ninguna parte.
    const sinEncogerse = e => {
      e.reglas.push({ selector: '& > *', estilo: fusionar([(() => { const d = D(); d.mapa.set('anchoMin', 0); return d; })()], 'enFila'), global: false });
      return e;
    };
    def('enFila', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['direccion', 'fila'], ['alinearItems', 'centro']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'enFila'));
    }, 'enFila(hueco?, …) — en línea, centrados verticalmente');
    def('enColumna', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['direccion', 'columna']];
      if (i) props.push(['hueco', a[0]]);
      return conMas(props, a.slice(i), 'enColumna');
    }, 'enColumna(hueco?, …) — uno debajo de otro');
    def('centrado', '... -> estilo',
      a => conMas([['mostrar', 'flex'], ['alinearItems', 'centro'], ['justificar', 'centro']], a, 'centrado'),
      'centrado(…) — en el medio, en los dos ejes');
    def('separado', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['alinearItems', 'centro'], ['justificar', 'entre']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'separado'));
    }, 'separado(hueco?, …) — a los extremos, lo de siempre de una barra');
    def('envuelto', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['envolver', 'envolver'], ['alinearItems', 'centro']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'envuelto'));
    }, 'envuelto(hueco?, …) — en fila, y pasan de línea cuando no caben');
    def('rejillaDe', '... -> estilo', a => {
      // Un número son columnas iguales, y con «minmax(0, 1fr)» en vez de «1fr»,
      // que es la misma trampa de arriba: con «1fr» una celda con contenido
      // ancho se hace más grande que su parte y descuadra la rejilla entera.
      const q = a[0];
      let plantilla, i = 1;
      if (typeof q === 'number') {
        const n = Math.trunc(q);
        if (n < 1 || n > 64) vm.error('«rejillaDe»: las columnas van de 1 a 64', `pediste ${n}`);
        plantilla = `repeat(${n}, minmax(0, 1fr))`;
      } else plantilla = txt(q, 1, 'rejillaDe');
      const props = [['mostrar', 'rejilla'], ['columnas', plantilla]];
      if (typeof a[1] === 'number') { props.push(['hueco', a[1]]); i = 2; }
      return conMas(props, a.slice(i), 'rejillaDe');
    }, 'rejillaDe(columnas, hueco?, …) — un número de columnas iguales, o la plantilla escrita');
    def('apilado', '... -> estilo', a => {
      // Todos los hijos en la misma celda, unos encima de otros. Es lo que se
      // hace con posición absoluta y sale mal, porque el padre deja de medir.
      // Con una rejilla de una celda el padre mide lo que mida el hijo mayor.
      const e = conMas([['mostrar', 'rejilla']], a, 'apilado');
      const d = D();
      d.mapa.set('areaRejilla', '1 / 1');
      e.reglas.push({ selector: '& > *', estilo: fusionar([d], 'apilado'), global: false });
      return e;
    }, 'apilado(…) — los hijos unos encima de otros, y el padre sigue midiendo');
    def('pegadoArriba', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['posicion', 'pegajoso'], ['arriba', i ? a[0] : 0], ['capa', 1]];
      return conMas(props, a.slice(i), 'pegadoArriba');
    }, 'pegadoArriba(desplazamiento?, …) — se queda arriba al bajar la página');

    // ═════════════════════════════════════════════════════════ movimiento
    def('fotogramas', 'cualquiera -> texto', a => {
      const pasos = a[0];
      if (!(pasos instanceof ObjDic)) vm.error('«fotogramas» espera un diccionario de paso → estilo');
      let cuerpo = '';
      for (const [paso, est] of pasos.mapa) {
        if (!esEstilo(est)) vm.error('«fotogramas»: cada paso tiene que ser un estilo');
        cuerpo += `${String(paso)}{${propsDe(est)}}`;
      }
      return emitirFotogramas(cuerpo);
    }, 'fotogramas({"0%": estilo(…), "100%": estilo(…)}) — devuelve el nombre de la animación');

    def('animar', '... -> estilo', a => {
      // El nombre sale de «fotogramas». «both» va siempre: sin eso, la animación
      // termina y el elemento salta de vuelta a como estaba, que nunca es lo que
      // se quería.
      const nombre = txt(a[0], 1, 'animar');
      const ms = msDe(a[1], 300);
      const resto = typeof a[1] === 'number' ? a.slice(2) : a.slice(1);
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'animar');
    }, 'animar(nombre, ms?, …) — el nombre que devolvió «fotogramas»');

    def('transicion', '... -> estilo', a => {
      // Acepta una propiedad o una lista, en español: transicion(["color", "fondo"]).
      // Nunca «todo»: animar «all» es lo que hace que una página se sienta
      // pegajosa, porque el navegador anima también lo que no se ve.
      const q = a[0];
      const nombres = q instanceof ObjLista ? q.items.map((x, i) => txt(x, i + 1, 'transicion'))
        : [txt(q, 1, 'transicion')];
      const ms = msDe(a[1], 200);
      const resto = typeof a[1] === 'number' ? a.slice(2) : a.slice(1);
      const curva = typeof resto[0] === 'string' ? resto.shift() : 'ease';
      const props = nombres.map(n => {
        const css = M.nombrePropiedad(n);
        if (css === 'all') vm.error('«transicion»: «todo» anima también lo que no se ve',
          'nombra las propiedades que cambian: transicion(["color", "fondo"], 200)');
        return `${css} ${ms}ms ${curva}`;
      });
      vm.cobrar(nombres.length);
      return conMas([['transicion', props.join(', ')]], resto, 'transicion');
    }, 'transicion("color", ms?, curva?, …) · transicion(["color", "fondo"], …)');

    def('aparecer', '... -> estilo', a => {
      const ms = msDe(a[0], 300);
      const resto = typeof a[0] === 'number' ? a.slice(1) : a;
      const nombre = emitirFotogramas('from{opacity:0}to{opacity:1}');
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'aparecer');
    }, 'aparecer(ms?, …) — entra apareciendo');

    def('deslizar', '... -> estilo', a => {
      // deslizar() · deslizar("abajo") · deslizar("izquierda", 400)
      const DESDE = { arriba: [0, -16], abajo: [0, 16], izquierda: [-16, 0], derecha: [16, 0] };
      let desde = 'abajo', i = 0;
      if (typeof a[0] === 'string') { desde = a[0]; i = 1; }
      if (!Object.prototype.hasOwnProperty.call(DESDE, desde))
        vm.error(`«deslizar»: no sé deslizar desde «${desde}»`,
          'vale arriba, abajo, izquierda o derecha');
      const ms = msDe(a[i], 300);
      const resto = typeof a[i] === 'number' ? a.slice(i + 1) : a.slice(i);
      const [x, y] = DESDE[desde];
      const nombre = emitirFotogramas(
        `from{opacity:0;transform:translate(${x}px,${y}px)}to{opacity:1;transform:translate(0,0)}`);
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'deslizar');
    }, 'deslizar(desde?, ms?, …) — entra desde arriba, abajo, izquierda o derecha');
  };
}

// ── color: leer y escribir, para «paleta» ───────────────────────────────────
// Lo justo para generar tonos. No es un eDSL de color y no pretende serlo: si
// hace falta más, «cssCrudo» y las funciones de color del propio CSS están ahí.
function aRgb(s) {
  const t = String(s).trim();
  let m = /^#([0-9a-fA-F]{3})$/.exec(t);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = /^#([0-9a-fA-F]{6})$/.exec(t);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(t);
  if (m) return [1, 2, 3].map(i => Math.min(255, +m[i]));
  return null;
}
function aHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function deHsl(h, s, l) {
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return 6 * t;
    if (t < 1 / 2) return 1;
    if (t < 2 / 3) return (2 / 3 - t) * 6;
    return 0;
  };
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const comp = t => Math.round((l - c / 2 + c * f(t)) * 255);
  const hex = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + hex(comp(h + 1 / 3)) + hex(comp(h)) + hex(comp(h - 1 / 3));
}



global.EspanolLike = { crearMotor, lexer, parser, compilar, verificarTipos, desensamblar, VM,
  repr, tipoDe, T, tipoATexto, ObjLista, ObjDic, ObjCierre, ObjNativa, ObjNodo, ObjEstilo, OP, OP_NOMBRE, generarJS,
  tiposGlobales, ErrorFuente, firma, textoATipo, aridadDe, instalarEdsl, instalarClasico,
  serializar, deserializar, verificarBytecode: verificar, aTexto, deTexto, ErrorBytecode,
  Modulos, enlazar, exportacionesDe, SEP_MODULO, nombreGlobalModulo, CLAVE_EDSL, claveEdsl,
  version: '4.0' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
