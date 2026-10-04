// ============================================================================
//  ESPAÑOL-LIKE v4 — FRONT END: Léxico, Sintaxis y Tipos
//  Parte 1 de 4. Sin dependencias.
// ============================================================================
'use strict';

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

if (typeof module !== 'undefined') module.exports = { ErrorFuente, lexer, parser, T, tipoATexto, compatible, esNum, TIPOS_BASE, firma, textoATipo, aridadDe };
