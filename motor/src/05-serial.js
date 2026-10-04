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
'use strict';

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

if (typeof module !== 'undefined') module.exports = {
  serializar, deserializar, verificar, aTexto, deTexto, ErrorBytecode, huellaOpcodes, VERSION_FORMATO,
};
