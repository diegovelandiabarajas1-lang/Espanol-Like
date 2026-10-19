// Anfitrión de código nativo para Node, montado sobre koffi.
//
// Es la única pieza del proyecto que sabe cómo se llama de verdad a una
// biblioteca compilada. La biblioteca estándar no la conoce: le pide al
// anfitrión cinco cosas —cargar, descargar, listar, declarar una estructura y
// declarar una función— y se entienden con valores planos de JavaScript. Así
// esto se puede cambiar por otra cosa sin tocar el motor, y el anfitrión de
// QuickJS puede simplemente no ofrecerlo.
//
// Por qué koffi y no otra: trae binarios ya compilados para Windows x64 (y
// para Linux, macOS y más) como dependencias opcionales de npm, así que
// `npm install koffi` no necesita ni Visual Studio ni node-gyp. Ese es todo el
// motivo, y es el que importa cuando no hay un compilador de C a mano.
//
//   const nativo = require('./nativo-koffi.js').crear();   // null si no hay koffi
//
'use strict';

// Los nombres de tipo son los de Ñ, no los de C: un programa en español no
// tiene por qué escribir «uint32_t». A la izquierda lo que se escribe en Ñ, a
// la derecha lo que entiende koffi.
const TIPOS = {
  nulo: 'void',            // solo como valor devuelto
  log: 'bool',
  entero8: 'int8', entero16: 'int16', entero: 'int32', entero64: 'int64',
  natural8: 'uint8', natural16: 'uint16', natural: 'uint32', natural64: 'uint64',
  real32: 'float32', real: 'float64',
  texto: 'str',            // const char * — entra y sale como texto de Ñ
  puntero: 'uintptr_t',    // una dirección, y en Ñ es un entero: cuídala tú
  tamano: 'size_t',
  // (4.1, S1) Un arreglo de Ñ pasa SIN COPIAR: C recibe la dirección de
  // sus números y lo que escriba se ve en el arreglo. «memoria» es un bloque
  // de bytes (memoria(n) en el eDSL «nativo»): char *, void *, uint8_t *.
  'arreglo real': 'double *', 'arreglo entero': 'int32_t *', 'arreglo real32': 'float *',
  memoria: 'void *',
};
const NOMBRES = Object.keys(TIPOS).join(', ');
const MAX_BIBLIOTECAS = 32;

// koffi dice sus cosas en inglés y aquí todo se dice en español. Los dos fallos
// que se ven de verdad —no está el archivo, no está el símbolo— se traducen; lo
// que no esté en la lista se deja tal cual, porque un mensaje en inglés es
// mucho mejor que un «algo salió mal» en español.
//
// El mensaje de koffi tiene dos partes: un prefijo suyo, que siempre está en
// inglés —«Failed to load shared library: »—, y detrás el mensaje del sistema
// operativo EN EL IDIOMA DEL SISTEMA. La primera versión de esto buscaba el
// texto del sistema en inglés («The specified module could not be found»), y
// en un Windows en español el sistema dice «No se puede encontrar el módulo
// especificado», así que no se reconocía nada y el mensaje pasaba tal cual. Lo
// que decide la categoría es el prefijo de koffi; el texto del sistema solo
// afina, cuando se reconoce en alguno de los dos idiomas.
function enEspanol(e) {
  const t = String((e && e.message) || e);
  if (/Cannot find function/i.test(t)) return 'ese símbolo no está en la biblioteca';
  if (/^Failed to load shared library/i.test(t)) {
    if (/not a valid Win32 application|no es una aplicaci[oó]n (de )?Win32 v[aá]lida|wrong ELF class|incompatible architecture|Bad EXE format|formato EXE/i.test(t))
      return 'es de otra arquitectura que este Node (¿una DLL de 32 bits con un Node de 64?)';
    if (/is not a shared library|invalid ELF header|file too short/i.test(t))
      return 'ese archivo no es una biblioteca compilada';
    return 'no está ahí, o está pero no se puede abrir';
  }
  // Por si el mensaje llega sin el prefijo (otra versión de koffi, otro camino).
  if (/cannot open shared object file|No such file or directory|module could not be found|no se puede encontrar el m[oó]dulo/i.test(t))
    return 'no está ahí, o está pero no se puede abrir';
  return t;
}

// Por qué esto no está dentro de «crear»: el caso feo no es que koffi falte,
// es que esté a medias. Si se copia una carpeta node_modules de Linux a
// Windows, el paquete «koffi» está pero su binario —que viaja en una
// dependencia opcional por plataforma, @koromix/koffi-win32-x64— no, y entonces
// «require» revienta al cargarse. Decir ahí «instala koffi» sería mentir.
let motivoSinKoffi = null;
function cargarKoffi() {
  try { return require('koffi'); }
  catch (e) {
    const t = String((e && e.message) || e);
    motivoSinKoffi = /Cannot find module ['"]koffi/.test(t)
      ? 'koffi no está instalado'
      : `koffi está instalado pero no trae binario para ${process.platform}-${process.arch}: ` +
        'vuelve a lanzar «npm install» en esta carpeta, en esta máquina';
    return null;
  }
}

// (4.1, S1) Un tipo de koffi, contado en palabras que el motor entiende
// sin saber nada de koffi. Es lo que le deja a la biblioteca estándar comprobar
// que un arreglo de reales va a un «double *» y no a un «int *» —koffi lo
// dejaría pasar y C leería basura (se vio: 6,9·10⁻³¹⁰)—, quitar de la llamada
// los parámetros de salida, y envolver una función de Ñ como retrollamada.
const NUMEROS = { Int8: 'entero', UInt8: 'entero', Int16: 'entero', UInt16: 'entero', Int32: 'entero',
  UInt32: 'entero', Int64: 'entero', UInt64: 'entero', Float32: 'real32', Float64: 'real',
  Int16S: 'entero', UInt16S: 'entero', Int32S: 'entero', UInt32S: 'entero', Int64S: 'entero', UInt64S: 'entero' };
function describir(t) {
  if (!t) return { clase: 'nulo', c: 'void' };
  const p = t.primitive, c = t.name;
  if (p === 'Void') return { clase: 'nulo', c };
  if (p === 'Bool') return { clase: 'bool', c };
  if (NUMEROS[p]) return { clase: 'numero', elem: NUMEROS[p], c, entero: NUMEROS[p] === 'entero' };
  if (p === 'String' || p === 'String16' || p === 'String32') return { clase: 'texto', c };
  if (p === 'Record' || p === 'Union') return { clase: 'estructura', c };
  if (p === 'Array') return { clase: 'lista', c };
  if (p === 'Callback') return { clase: 'retrollamada', c, proto: t.proto && t.proto.name,
    resultado: describir(t.proto && t.proto.result) };
  if (p === 'Pointer') {
    const r = t.ref || null, rp = r ? r.primitive : 'Void';
    // A qué apunta: un número (un arreglo de Ñ puede ir ahí), una estructura
    // (un dic de salida), o nada en concreto (void *, FILE *: un puntero opaco).
    return { clase: 'puntero', c, apunta: NUMEROS[rp] ? 'numero' : (rp === 'Record' || rp === 'Union') ? 'estructura' : 'opaco',
      elem: NUMEROS[rp] || null, byte: rp === 'Int8' || rp === 'UInt8', ancho: r ? r.size : 0 };
  }
  return { clase: 'otro', c };
}
const DIRECCION = { Input: 'entra', Output: 'sale', 'Input/Output': 'entra y sale' };

function crear() {
  const koffi = cargarKoffi();
  if (!koffi) return null;   // sin koffi no hay código nativo, y ya está

  const abiertas = new Map();      // nombre → { lib, firmas:Set }
  const estructuras = new Map();   // nombre → huella de sus campos
  const tiposC = new Map();        // (S1) nombre → declaración, de tipoNativo()

  // Traduce un nombre de tipo de Ñ. Una estructura ya declarada vale como tipo,
  // y ahí está la razón de llevar la cuenta: para poder decir «no lo conozco»
  // con la lista de los que sí, en vez de dejar que koffi lo diga en inglés.
  function tipo(n, donde, permiteNulo) {
    if (typeof n !== 'string') throw new Error(`${donde}: el tipo tiene que ser texto`);
    if (n === 'nulo' && !permiteNulo)
      throw new Error(`${donde}: «nulo» solo vale como valor devuelto, no como argumento`);
    const t = TIPOS[n];
    if (t) return t;
    if (estructuras.has(n)) return n;
    if (tiposC.has(n)) return n + ' *';       // (S1) de tipoNativo: se pasa por puntero
    throw new Error(`${donde}: no conozco el tipo «${n}» (los que hay: ${NOMBRES}` +
      (estructuras.size ? `, y las estructuras declaradas: ${[...estructuras.keys()].join(', ')}` : '') + ')');
  }

  function cargar(nombre) {
    const ya = abiertas.get(nombre);
    if (ya) return;                                  // abrir dos veces no es un error
    if (abiertas.size >= MAX_BIBLIOTECAS)
      throw new Error(`ya hay ${MAX_BIBLIOTECAS} bibliotecas abiertas; descarga alguna antes de abrir otra`);
    let lib;
    try { lib = koffi.load(nombre); }
    catch (e) { throw new Error(`no se pudo abrir la biblioteca «${nombre}»: ${enEspanol(e)}`); }
    abiertas.set(nombre, { lib, firmas: new Set() });
  }

  // Descargar deja colgadas las funciones ya declaradas: el símbolo apunta a
  // memoria que puede haberse desmapeado, y llamarla sería un salto a ninguna
  // parte —sin excepción, sin mensaje, el proceso muerto—. Así que al
  // descargar se marcan como muertas, y llamar a una muerta es un error normal
  // de Ñ. Es la diferencia entre un fallo y un agujero.
  function descargar(nombre) {
    const e = abiertas.get(nombre);
    if (!e) return false;
    for (const f of e.firmas) f.viva = false;
    abiertas.delete(nombre);
    try { e.lib.unload(); } catch (_) { /* si no se deja, al menos ya no se usa */ }
    return true;
  }

  function estructura(nombre, pares) {
    const huella = pares.map(([c, t]) => c + ':' + t).join(',');
    const antes = estructuras.get(nombre);
    if (antes !== undefined) {
      // Declararla igual dos veces es normal —un programa que se ejecuta otra
      // vez, una función que se llama dos— y no debería fallar. Declararla
      // distinta sí, porque entonces una de las dos formas está mintiendo.
      if (antes === huella) return;
      throw new Error(`la estructura «${nombre}» ya se declaró con otros campos (${antes})`);
    }
    const campos = {};
    for (const [c, t] of pares) campos[c] = tipo(t, `estructura «${nombre}», campo «${c}»`, false);
    try { koffi.struct(nombre, campos); }
    catch (e) { throw new Error(`no se pudo declarar la estructura «${nombre}»: ${enEspanol(e)}`); }
    estructuras.set(nombre, huella);
  }

  function funcion(biblioteca, simbolo, devuelve, tipos) {
    cargar(biblioteca);                              // abrir es parte de declarar
    const entrada = abiertas.get(biblioteca);
    const ret = tipo(devuelve, `«${simbolo}», el valor devuelto`, true);
    const args = tipos.map((t, i) => tipo(t, `«${simbolo}», argumento ${i + 1}`, false));
    let fn;
    try { fn = entrada.lib.func(simbolo, ret, args); }
    catch (e) {
      throw new Error(`«${simbolo}» en «${biblioteca}»: ${enEspanol(e)}`);
    }
    return envolver(fn, entrada, biblioteca);
  }

  // Lo que comparten las dos formas de declarar: la llamada, la llamada en
  // segundo plano, y la descripción de cada parámetro para el motor.
  function envolver(fn, entrada, biblioteca) {
    const firma = { viva: true };
    entrada.firmas.add(firma);
    const muerta = () => new Error(`la biblioteca «${biblioteca}» se descargó; esta función ya no se puede llamar`);
    const llamar = (crudos) => {
      if (!firma.viva) throw muerta();
      return fn(...crudos);
    };
    llamar.enFondo = (crudos, listo) => {
      if (!firma.viva) throw muerta();
      fn.async(...crudos, listo);
    };
    const info = fn.info || { name: '?', arguments: [], result: null };
    llamar.nombre = info.name;
    llamar.parametros = info.arguments.map(a => Object.assign(describir(a.type), { dir: DIRECCION[a.direction] || 'entra' }));
    llamar.resultado = describir(info.result);
    return llamar;
  }

  // (4.1, S1) nativa(biblioteca, "double cos(double)"): la firma tal
  // como está en el .h. Los nombres de C sirven tal cual, y también las
  // estructuras de estructuraNativa y los tipos de tipoNativo. «_Out_ int *q»
  // marca un parámetro de salida: no se pasa, se devuelve.
  function funcionC(biblioteca, prototipo) {
    if (/\.\.\./.test(prototipo))
      throw new Error('las funciones con «...» (como printf) todavía no se pueden declarar: C no dice de qué tipo es cada argumento extra, y adivinarlo es leer basura');
    cargar(biblioteca);
    const entrada = abiertas.get(biblioteca);
    let fn;
    try { fn = entrada.lib.func(prototipo); }
    catch (e) {
      const t = enEspanol(e);
      const desconocido = /Unknown or invalid type name '([^']+)'/.exec(t);
      throw new Error(desconocido
        ? `en «${prototipo}» no conozco el tipo «${desconocido[1]}»: si es una estructura, declárala con estructuraNativa; si es un puntero a función o un tipo opaco, con tipoNativo`
        : `no entiendo la firma «${prototipo}» en «${biblioteca}»: ${t}`);
    }
    return envolver(fn, entrada, biblioteca);
  }

  // tipoNativo("int Comparar(const void *, const void *)") declara un tipo de
  // función, para pasar retrollamadas; tipoNativo("FILE") un tipo opaco, del
  // que solo se manejan punteros. Repetirlo igual no es un error.
  function tipoC(decl) {
    decl = String(decl).trim();
    const esFuncion = decl.includes('(');
    const nombre = esFuncion ? (/([A-Za-z_]\w*)\s*\(/.exec(decl) || [])[1] : decl;
    if (!nombre || !/^[A-Za-z_]\w*$/.test(nombre))
      throw new Error(`no entiendo «${decl}»: es «int Nombre(int, double)» para un tipo de función, o un nombre para un tipo opaco`);
    const antes = tiposC.get(nombre);
    if (antes !== undefined) {
      if (antes === decl) return nombre;
      throw new Error(`el tipo «${nombre}» ya se declaró de otra forma («${antes}»)`);
    }
    try { esFuncion ? koffi.proto(decl) : koffi.opaque(nombre); }
    catch (e) { throw new Error(`no se pudo declarar «${decl}»: ${enEspanol(e)}`); }
    tiposC.set(nombre, decl);
    return nombre;
  }

  // Una retrollamada que vive más que una llamada (C la guarda y la llama
  // luego). Hay que soltarla a mano: C no avisa de cuándo deja de usarla.
  function registrar(f, nombre) {
    if (!tiposC.has(nombre) || !tiposC.get(nombre).includes('('))
      throw new Error(`«${nombre}» no es un tipo de función declarado con tipoNativo`);
    return koffi.register(f, koffi.pointer(nombre));
  }
  const desregistrar = h => koffi.unregister(h);

  // Memoria: tipo en palabras de Ñ (real, entero, texto…) o de C (double, int…).
  const tipoMem = n => (n === 'texto' ? 'char' : TIPOS[n] && !TIPOS[n].includes('*') ? TIPOS[n] : n);
  const leer = (p, t, n) => {
    if (t === 'texto') return koffi.decode(p, 'char', n === undefined || n === null ? -1 : n);
    return n === undefined || n === null ? koffi.decode(p, tipoMem(t)) : koffi.decode(p, tipoMem(t), n);
  };
  const escribir = (p, t, v, n) => (n === undefined || n === null ? koffi.encode(p, tipoMem(t), v) : koffi.encode(p, tipoMem(t), v, n));
  const tamano = t => koffi.sizeof(tipoMem(t));
  const direccion = b => koffi.address(b);

  return { cargar, descargar, estructura, funcion, abiertas: () => [...abiertas.keys()],
           funcionC, tipoC, registrar, desregistrar, leer, escribir, tamano, direccion,
           memoria: n => Buffer.alloc(n), errno: () => koffi.errno() };
}

// Para que el intérprete pueda decir por qué no hay código nativo, en vez de
// soltar la misma frase pase lo que pase.
function porQueNo() { return motivoSinKoffi; }

// «enEspanol» se exporta para poder probarlo SIN koffi: el fallo que motivó su
// reescritura solo se veía con koffi instalado y un Windows en español, y esa
// combinación no la tiene ninguna máquina de pruebas.
module.exports = { crear, porQueNo, TIPOS, enEspanol };
