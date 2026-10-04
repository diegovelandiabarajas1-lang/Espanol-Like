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

function crear() {
  const koffi = cargarKoffi();
  if (!koffi) return null;   // sin koffi no hay código nativo, y ya está

  const abiertas = new Map();      // nombre → { lib, firmas:Set }
  const estructuras = new Map();   // nombre → huella de sus campos

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
    const firma = { viva: true };
    entrada.firmas.add(firma);
    return (crudos) => {
      if (!firma.viva)
        throw new Error(`la biblioteca «${biblioteca}» se descargó; esta función ya no se puede llamar`);
      return fn(...crudos);
    };
  }

  return { cargar, descargar, estructura, funcion, abiertas: () => [...abiertas.keys()] };
}

// Para que el intérprete pueda decir por qué no hay código nativo, en vez de
// soltar la misma frase pase lo que pase.
function porQueNo() { return motivoSinKoffi; }

// «enEspanol» se exporta para poder probarlo SIN koffi: el fallo que motivó su
// reescritura solo se veía con koffi instalado y un Windows en español, y esa
// combinación no la tiene ninguna máquina de pruebas.
module.exports = { crear, porQueNo, TIPOS, enEspanol };
