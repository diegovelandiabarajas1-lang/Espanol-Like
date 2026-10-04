// ============================================================================
//  ESPAÑOL-LIKE v4 — Máquina virtual, recolector de basura y JIT
//  Parte 3 de 4.
// ============================================================================
'use strict';

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

if (typeof module !== 'undefined') module.exports = {
  VM, ErrorTiempoEjecucion, ObjLista, ObjDic, ObjCierre, ObjNativa, ObjUpvalue, ObjNodo, ObjError, ObjEstilo,
  repr, tipoDe, verdad, iguales, generarJS, ObjFecha, isoDeFecha, ObjTabla,
};
