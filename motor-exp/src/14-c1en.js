// ============================================================================
//  Ñ v4 — C1EÑ («Cuda 1 Engine of Ñ»): funciones de Ñ en GPU y en C nativo
//  Parte 14. Va dentro del eDSL «nen».
//
//  Se importa con:  usar paralelo, azarHilo de "nen"
//
//  QUÉ ES. Un compilador pequeño: toma una función de Ñ escrita en un
//  subconjunto numérico —enteros, reales, bool, arreglos, si/mientras/para— y
//  la traduce a TRES destinos desde el mismo árbol sintáctico:
//
//    "jit"      JavaScript, con «new Function», como el JIT de la máquina.
//    "nativo"   C, compilado con gcc -O2 -ffp-contract=off y cargado con koffi.
//    "gpu"      CUDA C, compilado con NVRTC (--fmad=false) y lanzado con la
//               Driver API desde Node (util/c1en-cuda.js).
//
//  La función se ejecuta una vez por índice: paralelo(n, f, a, b) llama a
//  f(i, a, b) para i = 0..n−1, en el orden que el dispositivo quiera. Por eso
//  un núcleo no devuelve nada: escribe en sus arreglos.
//
//  LA REGLA QUE MANDA: el mismo programa da los MISMOS BITS en los tres
//  destinos para + − * / y raiz. No es un adorno: es lo que deja comprobar la
//  GPU contra la CPU número a número en vez de «más o menos». Cuesta tres cosas,
//  y las tres están escritas abajo donde se pagan:
//    · nada de FMA: gcc con -ffp-contract=off y NVRTC con --fmad=false. Una FMA
//      redondea una vez donde a*b+c redondea dos, y el último bit cambia.
//    · el mismo orden de operaciones en los tres textos: las expresiones se
//      emiten con paréntesis explícitos y los temporales en el mismo sitio.
//    · enteros que JavaScript no tiene: un «entero» de Ñ es un double y en C es
//      un int64. Son el mismo número mientras quepa en 53 bits; para que el
//      −0 de JavaScript (0 * −3 da −0) no llegue a un arreglo real como −0 y a
//      C como +0, cada paso de entero a real en JavaScript se escribe «x + 0»,
//      que en IEEE convierte −0 en +0 y deja todo lo demás igual.
//  Las trascendentes (exp, log, seno, coseno, tangente, potencia no entera…) NO
//  entran en la promesa: V8, glibc y CUDA las implementan cada uno a su manera
//  y pueden diferir en el último bit. Está dicho en la documentación.
//
//  LOS ERRORES no pueden lanzarse desde una GPU. Cada sitio que puede fallar
//  (dividir, indexar, raiz de un negativo…) tiene un número, en orden de
//  aparición; un hilo que falla se apunta el número más bajo de su sentencia y
//  termina. De todos los hilos que fallan gana el de índice más bajo, y eso se
//  resuelve igual en los tres: en JavaScript porque se recorren en orden, en C
//  con una sección crítica y en CUDA con atomicMin sobre (i << 24 | sitio). Al
//  volver, el motor convierte el número en un error de Ñ normal, con línea.
// ============================================================================
'use strict';

// Tope de vueltas por hilo, sumando todos sus bucles. La red contra un
// «mientras cierto» dentro de un núcleo: en C o en la GPU no hay presupuesto de
// instrucciones que lo corte, y un hilo que no termina cuelga el proceso entero.
// Mil millones es mucho más de lo que hace un núcleo razonable (un Monte Carlo
// de un millón de muestras por hilo da 1e6) y en JavaScript son pocos segundos.
// Se puede bajar con la variable de entorno C1EN_MAX_VUELTAS (las pruebas lo
// hacen, para comprobar el tope sin esperar mil millones de vueltas).
const C1EN_MAX_VUELTAS = (typeof process !== 'undefined' && process.env && Number(process.env.C1EN_MAX_VUELTAS) > 0)
  ? Math.floor(Number(process.env.C1EN_MAX_VUELTAS)) : 1000000000;
// Hilos por bloque en CUDA. 256 es el valor que va bien en casi todas las
// arquitecturas desde Kepler; el núcleo recorre el índice «a zancadas de
// cuadrícula», así que el número de bloques no limita n.
const C1EN_HILOS_BLOQUE = 256;
// El índice del hilo va en los 40 bits altos de la clave de error (los 24
// bajos son el sitio): 2^40 hilos son un billón, de sobra.
const C1EN_MAX_HILOS = 1099511627776;

// ── el azar por contador ─────────────────────────────────────────────────────
// azarHilo(semilla, i, canal) es una FUNCIÓN PURA de sus tres enteros: no hay
// estado que repartir entre hilos, así que da lo mismo en qué orden o en qué
// dispositivo corran. Es la idea de Philox/Random123, en barato.
//
// POR QUÉ ES IDÉNTICO EN LOS TRES DESTINOS: toda la aritmética es de 32 bits sin
// signo. En C y en CUDA un uint32_t se envuelve módulo 2^32 por definición del
// lenguaje; en JavaScript, Math.imul da exactamente los 32 bits bajos del
// producto y «>>> 0» reduce módulo 2^32. Nunca se forma un producto de 64 bits
// —que en un double de 53 bits perdería los bits bajos y en un int64 con signo
// sería desbordamiento indefinido—, y las sumas son de dos números < 2^32, que
// caben de sobra en 53 bits. Para sacar los 32 bits altos de un entero de Ñ se
// divide entre 2^32 (exacto: es una potencia de dos) y se redondea hacia abajo,
// que es lo mismo que el desplazamiento aritmético de un int64.
// El real final se arma con 27 + 26 = 53 bits: (a>>5)·2^26 + (b>>6) < 2^53 es
// un entero exacto en double, y multiplicarlo por 2^−53 también es exacto.
// La mezcla es «lowbias32» de Chris Wellons: dos multiplicaciones y tres
// desplazamientos, con muy buen efecto avalancha para lo que cuesta.
function c1enMezclar(h) {
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function c1enAzar(s, i, c) {
  let h = 0x2545f491;
  h = (c1enMezclar((h ^ (s >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  h = (c1enMezclar((h ^ (Math.floor(s / 4294967296) >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  h = (c1enMezclar((h ^ (i >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  h = (c1enMezclar((h ^ (Math.floor(i / 4294967296) >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  h = (c1enMezclar((h ^ (c >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  h = (c1enMezclar((h ^ (Math.floor(c / 4294967296) >>> 0)) >>> 0) + 0x9e3779b9) >>> 0;
  const a = c1enMezclar((h ^ 0x68e31da4) >>> 0);
  const b = c1enMezclar((a + 0xb5297a4d) >>> 0);
  return ((a >>> 5) * 67108864 + (b >>> 6)) * (1 / 9007199254740992);
}

// Lo mismo en C. Es texto compartido por los destinos C y CUDA: cambia solo la
// palabra que declara la función (C1EN_D) y los nombres de los tipos.
const C1EN_PRELUDIO = `
C1EN_D c1en_i64 c1en_falla(c1en_i64* f, c1en_i64 c) { if (*f == 0 || c < *f) *f = c; return 0; }
/* división y resto de enteros como en Ñ (y en Python): la división redondea
   hacia abajo y el resto lleva el signo del divisor. C trunca hacia cero. */
C1EN_D c1en_i64 c1en_div_piso(c1en_i64 a, c1en_i64 b) {
  if (b == 0) return 0;
  c1en_i64 q = a / b;
  if ((a % b != 0) && ((a < 0) != (b < 0))) q -= 1;
  return q;
}
C1EN_D c1en_i64 c1en_mod(c1en_i64 a, c1en_i64 b) {
  if (b == 0) return 0;
  c1en_i64 r = a % b;
  if (r != 0 && ((r < 0) != (b < 0))) r += b;
  return r;
}
C1EN_D c1en_u32 c1en_mezclar(c1en_u32 h) {
  h ^= h >> 16; h *= 0x7feb352dU; h ^= h >> 15; h *= 0x846ca68bU; h ^= h >> 16;
  return h;
}
/* azarHilo: real en [0, 1), función pura de (semilla, i, canal). Solo
   aritmética de 32 bits sin signo, que se envuelve igual en C, en CUDA y en
   JavaScript (Math.imul y >>> 0). Ver la explicación en 14-c1en.js. */
C1EN_D double c1en_azar(c1en_i64 s, c1en_i64 i, c1en_i64 c) {
  c1en_u64 us = (c1en_u64)s, ui = (c1en_u64)i, uc = (c1en_u64)c;
  c1en_u32 h = 0x2545f491U;
  h = c1en_mezclar(h ^ (c1en_u32)us) + 0x9e3779b9U;
  h = c1en_mezclar(h ^ (c1en_u32)(us >> 32)) + 0x9e3779b9U;
  h = c1en_mezclar(h ^ (c1en_u32)ui) + 0x9e3779b9U;
  h = c1en_mezclar(h ^ (c1en_u32)(ui >> 32)) + 0x9e3779b9U;
  h = c1en_mezclar(h ^ (c1en_u32)uc) + 0x9e3779b9U;
  h = c1en_mezclar(h ^ (c1en_u32)(uc >> 32)) + 0x9e3779b9U;
  c1en_u32 a = c1en_mezclar(h ^ 0x68e31da4U);
  c1en_u32 b = c1en_mezclar(a + 0xb5297a4dU);
  return ((double)(a >> 5) * 67108864.0 + (double)(b >> 6)) * (1.0 / 9007199254740992.0);
}
`;
const C1EN_CABECERA_C = `#include <stdint.h>
#include <math.h>
typedef int64_t c1en_i64;
typedef uint64_t c1en_u64;
typedef uint32_t c1en_u32;
#define C1EN_D static inline
#define C1EN_INF INFINITY
`;
// NVRTC no trae <stdint.h> ni <math.h>: los tipos se dicen con sus nombres de
// siempre y las funciones matemáticas ya están, como funciones de dispositivo.
const C1EN_CABECERA_CUDA = `typedef long long c1en_i64;
typedef unsigned long long c1en_u64;
typedef unsigned int c1en_u32;
#define C1EN_D static __device__ __forceinline__
#define C1EN_INF __longlong_as_double(0x7ff0000000000000LL)
`;

// Un real como literal de CUDA EXACTO: en hexadecimal no hay redondeo que
// discutir. En C sí se escribe en decimal (gcc lo redondea correctamente, y
// así se puede leer), pero de NVRTC no consta en ningún sitio que lo haga.
function c1enHexReal(v) {
  if (v === 0) return '0.0';
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v);
  const hi = b.getUint32(0), lo = b.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  const man = ((hi & 0xfffff).toString(16).padStart(5, '0') + lo.toString(16).padStart(8, '0')).replace(/0+$/, '');
  if (exp === 0) return `0x0.${man || '0'}p-1022`;
  return `0x1${man ? '.' + man : ''}p${exp - 1023}`;
}

// ── los anfitriones de Node ──────────────────────────────────────────────────
// La biblioteca no sabe compilar C ni hablar con una GPU: se lo pide a dos
// piezas de util/ que solo existen en Node. En el navegador y en QuickJS no hay
// ni «require» ni «process», y entonces lo único que hay es "jit" — que es la
// degradación elegante que se pide: el programa corre igual, más despacio.
// Se cargan la PRIMERA vez que hacen falta, no al crear la máquina: cada
// prueba crea su máquina y no debería pagar un «gcc --version» por eso.
const c1enHost = { nativo: undefined, cuda: undefined, motivoNativo: null, motivoCuda: null };
function c1enEnNode() {
  return typeof process !== 'undefined' && process.versions && process.versions.node &&
    typeof require === 'function' && typeof __dirname === 'string';
}
function c1enUtil(archivo) {
  const path = require('path'), fs = require('fs');
  // Desde bundle.js (motor/) o desde src/ (motor/src/): las dos caen en motor/util.
  for (const p of [path.join(__dirname, 'util', archivo), path.join(__dirname, '..', 'util', archivo)])
    if (fs.existsSync(p)) return require(p);
  return null;
}
function c1enNativo() {
  if (c1enHost.nativo !== undefined) return c1enHost.nativo;
  c1enHost.nativo = null;
  if (!c1enEnNode()) { c1enHost.motivoNativo = 'el código nativo solo existe fuera del navegador, en Node'; return null; }
  try {
    const m = c1enUtil('c1en-nativo.js');
    if (!m) { c1enHost.motivoNativo = 'falta motor/util/c1en-nativo.js'; return null; }
    c1enHost.nativo = m.crear();
    if (!c1enHost.nativo) c1enHost.motivoNativo = m.porQueNo();
  } catch (e) { c1enHost.motivoNativo = String((e && e.message) || e); }
  return c1enHost.nativo;
}
function c1enCuda() {
  if (c1enHost.cuda !== undefined) return c1enHost.cuda;
  c1enHost.cuda = null;
  if (!c1enEnNode()) { c1enHost.motivoCuda = 'la GPU solo se alcanza desde Node'; return null; }
  try {
    const m = c1enUtil('c1en-cuda.js');
    if (!m) { c1enHost.motivoCuda = 'falta motor/util/c1en-cuda.js'; return null; }
    c1enHost.cuda = m.crear();
    if (!c1enHost.cuda) c1enHost.motivoCuda = m.porQueNo();
  } catch (e) { c1enHost.motivoCuda = String((e && e.message) || e); }
  return c1enHost.cuda;
}

// ── el subconjunto ───────────────────────────────────────────────────────────
// Las funciones que se pueden llamar dentro de un núcleo, con su número de
// argumentos. El nombre es el CORTO: dentro del programa pueden venir de
// «numerico», de «nen» o del núcleo, y se reconocen por la nativa a la que
// apuntan, no por cómo se escriben (ver «resolverLlamada»).
const C1EN_FUNCIONES = {
  raiz: 1, exp: 1, log: 1, log10: 1, seno: 1, coseno: 1, tangente: 1,
  arcoseno: 1, arcocoseno: 1, arcotangente: 1, angulo: 2,
  absoluto: 1, piso: 1, techo: 1, minimo: 2, maximo: 2,
  longitud: 1, tamano: 1, azarHilo: 3, sumarAtomico: 3,
  // conversiones explícitas: «entero» trunca hacia cero como el entero() de Ñ,
  // «real» ensancha. Existen para que el verificador de tipos de Ñ y el de C1EÑ
  // digan lo mismo: piso() de la biblioteca devuelve real para el verificador y
  // entero para C1EÑ; entero(piso(x)) es entero para los dos.
  entero: 1, real: 1,
};
const C1EN_TRASC = { exp: 'exp', log: 'log', log10: 'log10', seno: 'sin', coseno: 'cos', tangente: 'tan',
  arcoseno: 'asin', arcocoseno: 'acos', arcotangente: 'atan' };
const C1EN_TRASC_JS = { exp: 'Math.exp', log: 'Math.log', log10: 'Math.log10', seno: 'Math.sin', coseno: 'Math.cos',
  tangente: 'Math.tan', arcoseno: 'Math.asin', arcocoseno: 'Math.acos', arcotangente: 'Math.atan' };
const C1EN_LISTA = 'raiz, exp, log, log10, seno, coseno, tangente, arcoseno, arcocoseno, arcotangente, ' +
  'angulo, absoluto, piso, techo, minimo, maximo, entero, real, longitud, tamano, azarHilo y sumarAtomico';

function instalarNenC1en(vm, def) {
  const c1en = crearC1en(vm);
  vm.c1en = c1en;

  def('paralelo', '... -> nulo', a => {
    if (a.length < 2) vm.error('«paralelo» necesita al menos el número de hilos y la función',
      'paralelo(n, funcion(i, a, b) { … }, a, b)');
    const n = a[0];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
      vm.error(`«paralelo»: el número de hilos tiene que ser un entero no negativo y es ${typeof n === 'number' ? n : tipoDe(n)}`);
    vm.exigeFuncion(a[1], 2, 'paralelo');
    c1en.paralelo(n, a[1], a.slice(2), 'paralelo');
    return null;
  }, 'paralelo(n, funcion(i, a, b) { a[i] = … }, a, b) — corre el cuerpo para i = 0..n−1 en el dispositivo actual; los arreglos se modifican en el sitio');

  def('dispositivo', ' -> texto', () => c1en.describir(),
    'dispositivo() — dónde corre «paralelo» ahora: "gpu: Tesla T4 (0)", "nativo: gcc …" o "jit"');
  def('dispositivos', ' -> lista<texto>', () => vm.nuevaLista(c1en.disponibles()),
    'dispositivos() — la lista de los dispositivos que hay en esta máquina');
  def('usarDispositivo', '... -> texto', a => {
    if (a.length < 1 || a.length > 2) vm.error('«usarDispositivo» recibe el nombre y, para "gpu", el índice',
      'usarDispositivo("gpu", 1) · usarDispositivo("nativo") · usarDispositivo("jit")');
    const nombre = vm.exigeTexto(a[0], 1, 'usarDispositivo');
    let indice = null;
    if (a.length === 2) {
      indice = vm.exigeNum(a[1], 2, 'usarDispositivo');
      if (!Number.isInteger(indice) || indice < 0) vm.error('«usarDispositivo»: el índice de la GPU es un entero desde 0');
    }
    c1en.usar(nombre, indice);
    return c1en.describir();
  }, 'usarDispositivo("gpu", 0) · usarDispositivo("nativo") · usarDispositivo("jit") — elige dónde corre «paralelo»');

  def('codigoCuda', '... -> texto', a => {
    if (!a.length) vm.error('«codigoCuda» necesita la función', 'codigoCuda(f) o codigoCuda(f, a, b) con argumentos de ejemplo');
    vm.exigeFuncion(a[0], 1, 'codigoCuda');
    return c1en.codigo(a[0], a.slice(1), 'cuda', 'codigoCuda');
  }, 'codigoCuda(f, a, b) — el CUDA C que C1EÑ genera para f (los argumentos de ejemplo dicen los tipos)');
  def('codigoC', '... -> texto', a => {
    if (!a.length) vm.error('«codigoC» necesita la función', 'codigoC(f) o codigoC(f, a, b) con argumentos de ejemplo');
    vm.exigeFuncion(a[0], 1, 'codigoC');
    return c1en.codigo(a[0], a.slice(1), 'c', 'codigoC');
  }, 'codigoC(f, a, b) — el C que C1EÑ genera para f y compila con gcc en el dispositivo "nativo"');

  def('azarHilo', 'real, real, real -> real', a => {
    for (let k = 0; k < 3; k++) {
      const v = vm.exigeNum(a[k], k + 1, 'azarHilo');
      if (!Number.isInteger(v)) vm.error(`«azarHilo»: el argumento ${k + 1} tiene que ser entero y es ${v}`,
        'azarHilo(semilla, i, canal): los tres son enteros');
    }
    return c1enAzar(a[0], a[1], a[2]);
  }, 'azarHilo(semilla, i, canal) — real en [0, 1) que solo depende de sus tres enteros: el mismo en jit, nativo y gpu');
  def('sumarAtomico', 'arreglo, real, real -> nulo', a => {
    const x = a[0];
    if (!(x instanceof ObjArreglo) || (x.tipo !== 'real' && x.tipo !== 'entero'))
      vm.error(`«sumarAtomico»: el argumento 1 tiene que ser un arreglo real o entero y es ${tipoDe(x)}`);
    const j = vm.exigeNum(a[1], 2, 'sumarAtomico');
    const v = vm.exigeNum(a[2], 3, 'sumarAtomico');
    if (!Number.isInteger(j) || j < 0 || j >= x.tamano)
      vm.error(`«sumarAtomico»: el índice ${j} se sale del arreglo (tiene ${x.tamano} elementos)`);
    if (x.tipo === 'entero' && !Number.isInteger(v))
      vm.error('«sumarAtomico»: a un arreglo entero se le suman enteros', 'usa piso(v) o un arreglo real');
    const z = zancadasDe(x.forma);
    let p = x.desp, r = j;
    for (let d = 0; d < z.length; d++) { const q = Math.floor(r / z[d]); r -= q * z[d]; p += q * x.zancadas[d]; }
    x.datos[p] += v;
    return null;
  }, 'sumarAtomico(a, j, v) — a[j] += v sin que dos hilos se pisen; en arreglos entero es determinista, en reales el orden de las sumas no');
}

// La palabra de error del núcleo en la GPU: 8 bytes por GPU y por proceso,
// reservados una vez y subidos solo cuando un núcleo la ensució (el valor «sin
// error» es todo unos). Compartida por todos los motores del proceso.
const errPorGpu = new Map();
const errLimpio = new Map();
// El registro de arreglos residentes en la GPU (ver «Residencia en la GPU» más
// abajo). Es del proceso, no de cada motor: la memoria de la GPU es una sola.
const residentes = new WeakMap();
const vivos = new Set();                     // WeakRef de cada arreglo residente
const porLiberar = [];                       // [d, gpu] pendientes de liberar
const finalizador = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry(({ d, gpu }) => porLiberar.push([d, gpu])) : null;

// ============================================================================
//  El motor: compilar, elegir dispositivo y lanzar
// ============================================================================
function crearC1en(vm) {
  // El dispositivo se decide la primera vez que alguien pregunta. Lo que manda,
  // en orden: la variable de entorno C1EN_DISPOSITIVO; si no, el mejor que haya
  // (gpu, luego nativo, luego jit).
  let actual = null;
  let indiceGpu = 0;
  const elegirInicial = () => {
    if (actual !== null) return;
    const env = c1enEnNode() ? process.env.C1EN_DISPOSITIVO : null;
    if (env === 'jit' || env === 'nativo' || env === 'gpu') {
      try { usar(env, null); return; } catch (_) { /* si no está, se cae al mejor */ }
    }
    const cu = c1enCuda();
    if (cu && cu.dispositivos.length) { actual = 'gpu'; indiceGpu = cu.actual; return; }
    if (c1enNativo()) { actual = 'nativo'; return; }
    actual = 'jit';
  };
  function usar(nombre, indice) {
    if (nombre === 'jit') { actual = 'jit'; return; }
    if (nombre === 'nativo') {
      if (!c1enNativo()) vm.error(`no hay dispositivo «nativo»: ${c1enHost.motivoNativo}`,
        'hace falta Node, koffi (npm install koffi) y gcc; mientras tanto, usarDispositivo("jit")');
      actual = 'nativo';
      return;
    }
    if (nombre === 'gpu') {
      const cu = c1enCuda();
      if (!cu || !cu.dispositivos.length) vm.error(`no hay GPU: ${c1enHost.motivoCuda || 'no se encontró ninguna'}`,
        'en Kaggle: Settings → Accelerator → GPU T4 x2; aquí usa "nativo" o "jit"');
      const k = indice === null || indice === undefined ? cu.actual : indice;
      if (k >= cu.dispositivos.length) vm.error(`no hay GPU ${k}: esta máquina tiene ${cu.dispositivos.length}`,
        `los índices van de 0 a ${cu.dispositivos.length - 1}`);
      try { cu.usar(k); }
      catch (e) { vm.error(`no se pudo activar la GPU ${k}: ${e.message}`); }
      indiceGpu = k;
      actual = 'gpu';
      return;
    }
    vm.error(`«usarDispositivo»: no conozco el dispositivo «${nombre}»`, 'los que hay: "jit", "nativo" y "gpu"');
  }
  function describir() {
    elegirInicial();
    if (actual === 'gpu') return `gpu: ${c1enCuda().dispositivos[indiceGpu].nombre} (${indiceGpu})`;
    if (actual === 'nativo') return `nativo: ${c1enNativo().nombre}`;
    return 'jit';
  }
  function disponibles() {
    const out = ['jit'];
    const na = c1enNativo();
    if (na) out.push(`nativo: ${na.nombre}`);
    const cu = c1enCuda();
    if (cu) for (const d of cu.dispositivos) out.push(`gpu ${d.indice}: ${d.nombre}`);
    return out;
  }

  // ── los argumentos ──────────────────────────────────────────────────────────
  // Un arreglo de Ñ puede ser una vista con zancadas. El núcleo lo ve plano y
  // contiguo: si ya lo es, se le pasa su trozo de memoria tal cual (cero copias,
  // y los cambios caen en su sitio); si no, se copia a uno contiguo, se corre y
  // se copia de vuelta.
  function prepararArreglo(x, quien, k, paraGpu) {
    if (x.tipo !== 'real' && x.tipo !== 'entero')
      vm.error(`«${quien}»: el argumento ${k} es un arreglo de tipo ${x.tipo}, y en un núcleo solo entran arreglos real o entero`,
        x.tipo === 'bool' ? 'conviértelo con aTipo(a, "entero")' : 'separa la parte real y la imaginaria en dos arreglos reales');
    const z = zancadasDe(x.forma);
    let contiguo = true;
    for (let d = 0; d < z.length; d++) if (x.forma[d] > 1 && z[d] !== x.zancadas[d]) contiguo = false;
    const n = x.tamano;
    // Un arreglo dueño de su memoria y contiguo puede quedarse RESIDENTE en la
    // GPU; se toca «_d» a secas para no disparar la bajada que hace «datos».
    // Todo lo demás (vistas, trozos) va por el camino de copiar, y leer
    // «x.datos» ya trae de la GPU lo que hiciera falta.
    if (contiguo && paraGpu && x.base === null) return { vista: x._d.subarray(x.desp, x.desp + n), devolver: null, residible: true };
    if (contiguo) return { vista: x.datos.subarray(x.desp, x.desp + n), devolver: null };
    const vista = new x.datos.constructor(n);
    let i = 0;
    for (const p of x.posiciones()) vista[i++] = x.datos[p];
    return { vista, devolver: () => { let j = 0; for (const p of x.posiciones()) x.datos[p] = vista[j++]; } };
  }

  // ── Residencia en la GPU ──────────────────────────────────────────────────
  // En la v1 cada «paralelo» reservaba, subía, bajaba y liberaba todos sus
  // arreglos: con mil economías de ECOSIM-G eran 250 MB por tick por el PCIe,
  // y la GPU se pasaba el tiempo esperando al bus. Ahora un arreglo se sube
  // UNA vez y se queda; tras el núcleo la copia buena está en la GPU, y se
  // baja solo cuando alguien la lee desde la CPU (el «get datos()» de
  // ObjArreglo llama a «residente»). Un acceso desde la CPU marca el arreglo
  // como «tocado» (pudo ser una escritura), y el siguiente núcleo lo vuelve a
  // subir. La memoria de la GPU se libera cuando el arreglo muere (registro de
  // finalización), cuando cambia su «datos» o cuando cambia de GPU.
  //   reg = { d, bytes, gpu, enGpu (la GPU tiene la copia buena), tocado }
  function liberarPendientes(cu) {
    for (let i = porLiberar.length - 1; i >= 0; i--) {
      if (porLiberar[i][1] !== indiceGpu) continue;
      try { cu.liberar(porLiberar[i][0]); } catch (_) { /* nada */ }
      porLiberar.splice(i, 1);
    }
  }
  // Trae la copia de la GPU si está allí (y marca «tocado»); con soltar=true
  // además libera la memoria de la GPU y deja de ser residente.
  function sincronizarHost(x, soltar) {
    const reg = residentes.get(x);
    if (!reg) { x.residente = null; return; }
    const cu = c1enCuda();
    const otraGpu = reg.gpu !== indiceGpu;
    try {
      if (otraGpu) cu.usar(reg.gpu);
      if (reg.enGpu) {
        const vista = x._d.subarray(x.desp, x.desp + x.tamano);
        if (vista.byteLength === reg.bytes) cu.bajar(vista, reg.d);
        reg.enGpu = false;
      }
      if (soltar) { cu.liberar(reg.d); reg.d = null; }
    } finally {
      if (otraGpu) cu.usar(indiceGpu);
    }
    reg.tocado = true;
    if (soltar) { vivos.delete(reg.ref); residentes.delete(x); x.residente = null; if (finalizador) finalizador.unregister(x); }
  }
  // Baja todo lo residente a la CPU y libera la memoria de la GPU. Lo llama
  // quien quiera dejar la GPU limpia (las pruebas, o un programa largo entre
  // dos fases); los programas normales no lo necesitan.
  function liberarResidentes() {
    for (const ref of [...vivos]) {
      const x = ref.deref();
      if (x) sincronizarHost(x, true); else vivos.delete(ref);
    }
    const cu = c1enCuda();
    if (cu) liberarPendientes(cu);
  }
  // Deja el arreglo residente en la GPU actual con los datos al día y devuelve
  // el puntero de dispositivo.
  function asegurarResidente(x, vista, cu) {
    let reg = residentes.get(x);
    if (reg && (reg.gpu !== indiceGpu || reg.bytes !== vista.byteLength)) { sincronizarHost(x, true); reg = null; }
    if (!reg) {
      const d = cu.reservar(Math.max(8, vista.byteLength));
      reg = { d, bytes: vista.byteLength, gpu: indiceGpu, enGpu: false, tocado: true };
      residentes.set(x, reg);
      reg.ref = new WeakRef(x);
      vivos.add(reg.ref);
      x.residente = soltar => sincronizarHost(x, soltar === true);
      if (finalizador) finalizador.register(x, { d, gpu: indiceGpu }, x);
    }
    if (reg.tocado) { cu.subir(reg.d, vista); reg.tocado = false; }
    return reg;
  }

  // Dos argumentos que comparten memoria sin ser el mismo arreglo (una vista y
  // su dueño, dos trozos del mismo) no se pueden llevar a la GPU: se copiarían
  // por separado y al volver uno pisaría al otro. Se rechaza en todos los
  // dispositivos, para que un programa no funcione en «jit» y falle en «gpu».
  function exigirSinSolape(arrs, quien) {
    for (let p = 0; p < arrs.length; p++) for (let q = p + 1; q < arrs.length; q++) {
      const A = arrs[p], B = arrs[q];
      if (A.x !== B.x && A.x._d === B.x._d)
        vm.error(`«${quien}»: los argumentos ${A.k} y ${B.k} comparten memoria (uno es una vista del otro)`,
          'pasa el mismo arreglo una sola vez, o haz una copia con copia(a)');
    }
  }
  // El tipo que un valor le da a su parámetro. Un número entero da «ent» aunque
  // se escribiera 2.0: en Ñ los dos son el mismo número, y en el núcleo da igual
  // porque «/» siempre divide en real y los enteros se convierten exactos.
  function tipoDeArg(v, anot, quien, k, nombre) {
    if (v instanceof ObjArreglo) {
      if (anot && anot.k && anot.k !== 'arreglo' && anot.k !== 'cualquiera')
        vm.error(`«${quien}»: «${nombre}» está anotado como ${anot.k} y llegó un arreglo`);
      return v.tipo === 'entero' ? 'i32*' : (v.tipo === 'real' ? 'f64*' : 'otro*');
    }
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') {
      if (anot && anot.k === 'real') return 'real';
      if (anot && anot.k === 'entero') {
        if (!Number.isInteger(v)) vm.error(`«${quien}»: «${nombre}» es entero y llegó ${v}`);
        return 'ent';
      }
      return Number.isInteger(v) && Math.abs(v) <= 9007199254740992 ? 'ent' : 'real';
    }
    if (v instanceof ObjLista)
      vm.error(`«${quien}»: el argumento ${k} («${nombre}») es una lista, y a un núcleo solo entran números, bool y arreglos`,
        'conviértela antes con arreglo(lista)');
    vm.error(`«${quien}»: el argumento ${k} («${nombre}») es ${tipoDe(v)}, y a un núcleo solo entran números, bool y arreglos`);
  }

  // ── compilación, con caché ──────────────────────────────────────────────────
  // Por prototipo de función y por firma de tipos de los argumentos: la misma
  // función llamada con un arreglo real y luego con uno entero son dos núcleos.
  const cache = new WeakMap();
  function modeloDe(cierre, tipos, quien) {
    const fn = cierre.fn;
    let m = cache.get(fn);
    if (!m) { m = new Map(); cache.set(fn, m); }
    const clave = tipos.join(',');
    let r = m.get(clave);
    if (!r) {
      r = { modelo: c1enAnalizar(vm, cierre, tipos, quien), js: null, c: null, cuda: null, fnNativa: null, gpu: new Map() };
      m.set(clave, r);
    }
    return r;
  }

  function tiposParaLlamada(cierre, args, quien) {
    const fn = cierre.fn;
    const ast = fn.ast;
    if (!ast || fn.deDisco)
      vm.error(`«${quien}»: esta función vino de bytecode y no trae su código fuente, así que no se puede compilar`,
        'C1EÑ compila desde el árbol sintáctico, igual que el JIT');
    if (fn.aridad !== args.length + 1)
      vm.error(`«${quien}»: la función recibe ${fn.aridad} parámetro(s) y le llegan ${args.length + 1} (el índice y ${args.length} argumento(s))`,
        'el primer parámetro es siempre el índice del hilo: funcion(i, a, b) con paralelo(n, f, a, b)');
    return args.map((v, k) => tipoDeArg(v, ast.params[k + 1].anotacion, quien, k + 3, ast.params[k + 1].nombre));
  }

  function lanzarError(modelo, i, codigo, quien) {
    const s = modelo.sitios[codigo] || { linea: '?', texto: 'fallo desconocido' };
    vm.error(`«${quien}»: el hilo i = ${i} falló en la línea ${s.linea}: ${s.texto}`, s.pista || null);
  }

  // Lo que «paralelo» promete y lo que no:
  //  · cada índice se calcula igual en cualquier dispositivo (los mismos bits,
  //    salvo trascendentes y salvo enteros de más de 53 bits);
  //  · el ORDEN entre hilos no existe: si dos hilos escriben el mismo elemento,
  //    gana uno cualquiera, y cuál depende del dispositivo (en "jit" el último,
  //    porque van en orden). Para acumular está sumarAtomico;
  //  · si un hilo falla, el error es el del hilo de índice más bajo y su línea,
  //    en todos; pero lo que los DEMÁS hilos alcanzaron a escribir no se
  //    promete: en "jit" se para en el primer fallo, en C y en la GPU los demás
  //    siguen. Tras un error, el contenido de los arreglos es indefinido.
  function paralelo(n, cierre, args, quien) {
    if (n > C1EN_MAX_HILOS) vm.error(`«${quien}»: ${n} hilos son demasiados; el máximo es 2^40`);
    if (!(cierre instanceof ObjCierre))
      vm.error(`«${quien}»: el núcleo tiene que ser una función de Ñ, no una de la biblioteca`);
    const tipos = tiposParaLlamada(cierre, args, quien);
    tipos.forEach((t, k) => {
      if (t === 'otro*') prepararArreglo(args[k], quien, k + 3);   // da el error que toca
    });
    const r = modeloDe(cierre, tipos, quien);
    elegirInicial();
    vm.cobrar(n);
    if (n === 0) return;
    // Los arreglos: vista contigua (o copia) por argumento.
    const preps = [];
    const arrs = [];
    args.forEach((v, k) => {
      if (v instanceof ObjArreglo) { arrs.push({ x: v, k: k + 3 }); preps[k] = prepararArreglo(v, quien, k + 3, actual === 'gpu'); }
    });
    exigirSinSolape(arrs, quien);
    let fallo = null;
    try {
      if (actual === 'jit') fallo = correrJS(r, n, args, preps);
      else if (actual === 'nativo') fallo = correrNativo(r, n, args, preps, quien);
      else fallo = correrGpu(r, n, args, preps, quien);
    } finally {
      for (const p of preps) if (p && p.devolver) p.devolver();
    }
    if (fallo) lanzarError(r.modelo, fallo[0], fallo[1], quien);
  }

  // Los argumentos ya expandidos: un arreglo pasa como (datos, número de
  // elementos), que es como lo recibe el núcleo para comprobar sus índices.
  function expandir(args, preps, bool) {
    const out = [];
    args.forEach((v, k) => {
      if (v instanceof ObjArreglo) { out.push(preps[k].vista); out.push(preps[k].vista.length); }
      else if (typeof v === 'boolean') out.push(bool ? (v ? 1 : 0) : v);
      else out.push(v);
    });
    return out;
  }

  function correrJS(r, n, args, preps) {
    if (!r.js) {
      const src = c1enEmitir(r.modelo, 'js');
      // eslint-disable-next-line no-new-func
      r.js = new Function('"use strict"; return ' + src)();
    }
    return r.js(n, ...expandir(args, preps, false));
  }

  function correrNativo(r, n, args, preps, quien) {
    const na = c1enNativo();
    if (!r.fnNativa) {
      if (!r.c) r.c = c1enEmitir(r.modelo, 'c');
      const firma = ['int64_t n'];
      for (const p of r.modelo.params.slice(1)) {
        if (p.arr) { firma.push(p.arr === 'real' ? 'double *' : 'int32_t *'); firma.push('int64_t'); }
        else firma.push(p.tipoEntrada === 'real' ? 'double' : 'int64_t');
      }
      firma.push('uint64_t *');
      try { r.fnNativa = na.compilar(r.c, [{ nombre: 'c1en_nucleo', firma: `void c1en_nucleo(${firma.join(', ')})` }]).c1en_nucleo; }
      catch (e) { vm.error(`«${quien}»: no se pudo compilar el núcleo en C: ${e.message}`, 'esto es un fallo de C1EÑ, no de tu programa: avísalo con el código de codigoC(f)'); }
    }
    const err = new BigUint64Array([0xffffffffffffffffn]);
    r.fnNativa(n, ...expandir(args, preps, true), err);
    return c1enLeerClave(err[0]);
  }

  // En la GPU: reservar, subir, lanzar, sincronizar, bajar, liberar. En la v1
  // todo arreglo es de ida y vuelta; el día que haga falta se marcan los de
  // solo lectura y se ahorra la bajada.
  function correrGpu(r, n, args, preps, quien) {
    const cu = c1enCuda();
    let fun = r.gpu.get(indiceGpu);
    if (!fun) {
      if (!r.cuda) r.cuda = c1enEmitir(r.modelo, 'cuda');
      try { fun = cu.compilar(r.cuda, ['c1en_nucleo']).c1en_nucleo; }
      catch (e) { vm.error(`«${quien}»: no se pudo compilar el núcleo para la GPU: ${e.message}`, 'esto es un fallo de C1EÑ, no de tu programa: avísalo con el código de codigoCuda(f)'); }
      r.gpu.set(indiceGpu, fun);
    }
    const lanz = [{ t: 'i64', v: n }];
    const memorias = [];
    const bajadas = [];
    const residentesAqui = [];
    const err = new BigUint64Array([0xffffffffffffffffn]);
    try {
      liberarPendientes(cu);
      args.forEach((v, k) => {
        if (v instanceof ObjArreglo) {
          const vista = preps[k].vista;
          if (preps[k].residible) {
            const reg = asegurarResidente(v, vista, cu);
            residentesAqui.push(reg);
            lanz.push({ t: 'ptr', v: reg.d }, { t: 'i64', v: vista.length });
          } else {
            const d = cu.reservar(Math.max(8, vista.byteLength));
            memorias.push(d);
            cu.subir(d, vista);
            bajadas.push([vista, d]);
            lanz.push({ t: 'ptr', v: d }, { t: 'i64', v: vista.length });
          }
        } else if (typeof v === 'boolean') lanz.push({ t: 'i64', v: v ? 1 : 0 });
        else lanz.push({ t: r.modelo.params[k + 1].tipoEntrada === 'real' ? 'f64' : 'i64', v });
      });
      const de = errGpu(cu);
      if (!errLimpio.get(indiceGpu)) { cu.subir(de, err); errLimpio.set(indiceGpu, true); }
      lanz.push({ t: 'ptr', v: de });
      // desde aquí la copia buena de los residentes está en la GPU, pase lo que pase
      for (const reg of residentesAqui) reg.enGpu = true;
      cu.lanzar(fun, c1enBloques(n, cu), C1EN_HILOS_BLOQUE, lanz);
      cu.sincronizar();
      for (const [vista, d] of bajadas) cu.bajar(vista, d);
      cu.bajar(err, de);
      if (err[0] !== 0xffffffffffffffffn) errLimpio.set(indiceGpu, false);   // hay que volver a limpiarla
    } catch (e) {
      errLimpio.set(indiceGpu, false);
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: la GPU falló: ${e.message}`);
    } finally {
      for (const d of memorias) { try { cu.liberar(d); } catch (_) { /* ya no hay nada que hacer */ } }
    }
    return c1enLeerClave(err[0]);
  }

  function errGpu(cu) {
    let d = errPorGpu.get(indiceGpu);
    if (!d) { d = cu.reservar(8); errPorGpu.set(indiceGpu, d); }
    return d;
  }

  function codigo(cierre, ejemplos, destino, quien) {
    if (!(cierre instanceof ObjCierre)) vm.error(`«${quien}»: hace falta una función de Ñ, no una de la biblioteca`);
    const fn = cierre.fn;
    if (!fn.ast || fn.deDisco) vm.error(`«${quien}»: esta función no trae su código fuente (vino de bytecode)`);
    const ps = fn.ast.params;
    if (ejemplos.length > ps.length - 1)
      vm.error(`«${quien}»: la función tiene ${ps.length - 1} parámetro(s) además del índice y llegaron ${ejemplos.length} ejemplos`);
    // Sin ejemplo, el tipo sale de la anotación; sin anotación, de cómo se usa:
    // si se indexa es un arreglo real, y si no, un número real.
    const tipos = [];
    for (let k = 1; k < ps.length; k++) {
      if (k - 1 < ejemplos.length) { tipos.push(tipoDeArg(ejemplos[k - 1], ps[k].anotacion, quien, k + 1, ps[k].nombre)); continue; }
      const an = ps[k].anotacion;
      if (an && an.k === 'entero') tipos.push('ent');
      else if (an && an.k === 'real') tipos.push('real');
      else if (an && an.k === 'bool') tipos.push('bool');
      else tipos.push(c1enSeIndexa(fn.ast, ps[k].nombre) ? 'f64*' : 'real');
    }
    if (tipos.includes('otro*')) vm.error(`«${quien}»: solo entran arreglos real o entero`);
    const r = modeloDe(cierre, tipos, quien);
    if (destino === 'c') return r.c || (r.c = c1enEmitir(r.modelo, 'c'));
    return r.cuda || (r.cuda = c1enEmitir(r.modelo, 'cuda'));
  }

  // ── núcleos de biblioteca ─────────────────────────────────────────────────
  // La interfaz para los autores de la biblioteca (NEÑ): el cuerpo ya viene
  // escrito en C —válido a la vez para C y para CUDA— con su respaldo en
  // JavaScript. Aquí no hay análisis: quien escribe un núcleo de biblioteca es
  // responsable de sus índices, igual que en CUDA.
  const TIPOS_K = { f64: ['double', 'double', 'double'], i64: ['int64_t', 'long long', 'int64_t'],
    i32: ['int32_t', 'int', 'int32_t'], 'f64*': ['double *', 'double*', 'double *'], 'i32*': ['int32_t *', 'int*', 'int32_t *'] };
  const nucleos = new Map();
  function kernel(spec) {
    if (!spec || typeof spec !== 'object') throw new Error('vm.c1en.kernel: falta la especificación');
    const { nombre, params, cuerpo, js } = spec;
    if (typeof nombre !== 'string' || !/^[a-z0-9_]+$/.test(nombre))
      throw new Error(`vm.c1en.kernel: el nombre «${nombre}» tiene que ser [a-z0-9_]`);
    if (nucleos.has(nombre)) throw new Error(`vm.c1en.kernel: ya hay un núcleo «${nombre}»`);
    if (!Array.isArray(params) || !params.length || params[0][1] !== 'i64')
      throw new Error(`vm.c1en.kernel «${nombre}»: el primer parámetro es siempre ['n', 'i64']`);
    for (const [pn, pt] of params) {
      if (!TIPOS_K[pt]) throw new Error(`vm.c1en.kernel «${nombre}»: el tipo «${pt}» de «${pn}» no existe (f64, i64, i32, f64*, i32*)`);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(pn)) throw new Error(`vm.c1en.kernel «${nombre}»: «${pn}» no es un nombre de C`);
    }
    if (typeof cuerpo !== 'string' || typeof js !== 'function')
      throw new Error(`vm.c1en.kernel «${nombre}»: hacen falta «cuerpo» (C) y «js» (respaldo)`);
    const k = { nombre, params, cuerpo, js, c: null, cuda: null, fnNativa: null, gpu: new Map() };
    nucleos.set(nombre, k);
    const lanzar = (...args) => lanzarKernel(k, args);
    lanzar.nucleo = k;
    return lanzar;
  }
  function fuenteKernel(k, destino) {
    const d = destino === 'cuda' ? 1 : 0;
    const ps = k.params.map(([pn, pt]) => `${TIPOS_K[pt][d]} ${pn}`).join(', ');
    if (destino === 'c') return C1EN_CABECERA_C + C1EN_PRELUDIO +
      `\nvoid ${k.nombre}(${ps}) {\n#pragma omp parallel for schedule(static) if (n > 2048)\n` +
      `  for (long long i = 0; i < n; i++) {\n    ${k.cuerpo}\n  }\n}\n`;
    const un = k.params.map(([, pt], j) => `*(${TIPOS_K[pt][1]}*)p[${j}]`).join(', ');
    return C1EN_CABECERA_CUDA + C1EN_PRELUDIO +
      `\nextern "C" __global__ void ${k.nombre}(${ps}) {\n` +
      `  for (long long i = (long long)blockIdx.x * blockDim.x + threadIdx.x; i < n; i += (long long)blockDim.x * gridDim.x) {\n` +
      `    ${k.cuerpo}\n  }\n}\n` + c1enEmulador(k.nombre, un);
  }
  function lanzarKernel(k, args) {
    const quien = k.nombre;
    if (args.length !== k.params.length)
      vm.error(`el núcleo «${quien}» recibe ${k.params.length} argumentos y llegaron ${args.length}`);
    const n = args[0];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
      vm.error(`el núcleo «${quien}»: n tiene que ser un entero no negativo y es ${repr(n, 1)}`);
    const plano = [];
    const devolver = [];
    const arrs = [];
    args.forEach((v, j) => {
      const pt = k.params[j][1];
      if (pt.endsWith('*')) {
        const ctor = pt === 'f64*' ? Float64Array : Int32Array;
        if (v instanceof ObjArreglo) {
          if ((pt === 'f64*' && v.tipo !== 'real') || (pt === 'i32*' && v.tipo !== 'entero'))
            vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» es un arreglo ${pt === 'f64*' ? 'real' : 'entero'} y llegó uno ${v.tipo}`);
          arrs.push({ x: v, k: j + 1 });
          const p = prepararArreglo(v, quien, j + 1);
          if (p.devolver) devolver.push(p.devolver);
          plano.push(p.vista);
        } else if (v instanceof ctor) plano.push(v);
        else vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» tiene que ser un arreglo y es ${tipoDe(v)}`);
      } else {
        if (typeof v !== 'number') vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» tiene que ser un número y es ${tipoDe(v)}`);
        plano.push(v);
      }
    });
    exigirSinSolape(arrs, quien);
    elegirInicial();
    vm.cobrar(n);
    try {
      if (n === 0) return null;
      if (actual === 'jit') { k.js(...plano); return null; }
      if (actual === 'nativo') {
        if (!k.fnNativa) {
          if (!k.c) k.c = fuenteKernel(k, 'c');
          const firma = k.params.map(([, pt]) => TIPOS_K[pt][2]).join(', ');
          try { k.fnNativa = c1enNativo().compilar(k.c, [{ nombre: k.nombre, firma: `void ${k.nombre}(${firma})` }])[k.nombre]; }
          catch (e) { vm.error(`el núcleo «${quien}» no compila en C: ${e.message}`); }
        }
        k.fnNativa(...plano);
        return null;
      }
      const cu = c1enCuda();
      let fun = k.gpu.get(indiceGpu);
      if (!fun) {
        if (!k.cuda) k.cuda = fuenteKernel(k, 'cuda');
        try { fun = cu.compilar(k.cuda, [k.nombre])[k.nombre]; }
        catch (e) { vm.error(`el núcleo «${quien}» no compila para la GPU: ${e.message}`); }
        k.gpu.set(indiceGpu, fun);
      }
      const memorias = [], bajadas = [], lanz = [];
      try {
        plano.forEach((v, j) => {
          const pt = k.params[j][1];
          if (pt.endsWith('*')) {
            const d = cu.reservar(Math.max(8, v.byteLength));
            memorias.push(d);
            cu.subir(d, v);
            bajadas.push([v, d]);
            lanz.push({ t: 'ptr', v: d });
          } else lanz.push({ t: pt, v });
        });
        cu.lanzar(fun, c1enBloques(n, cu), C1EN_HILOS_BLOQUE, lanz);
        cu.sincronizar();
        for (const [v, d] of bajadas) cu.bajar(v, d);
      } catch (e) {
        if (e instanceof ErrorTiempoEjecucion) throw e;
        vm.error(`el núcleo «${quien}»: la GPU falló: ${e.message}`);
      } finally {
        for (const d of memorias) { try { cu.liberar(d); } catch (_) { /* nada */ } }
      }
      return null;
    } finally {
      for (const f of devolver) f();
    }
  }

  // ── reducciones deterministas ───────────────────────────────────────────────
  // Suma, máximo y mínimo por un ÁRBOL DE ORDEN FIJO: en cada pasada el
  // elemento j es op(x[2j], x[2j+1]) y el último, si sobra, pasa tal cual. El
  // mismo árbol en los tres dispositivos, así que el mismo resultado al bit. En
  // la GPU es una pasada por nivel (log2 n lanzamientos) en vez de una
  // reducción en memoria compartida con atomicAdd: los atómicos de reales suman
  // en el orden en que llegan los hilos, y eso cambia el último bit de una
  // ejecución a otra. Como regalo, la suma por parejas acumula mucho menos error
  // que la suma de izquierda a derecha.
  const OPS_RED = { suma: 1, maximo: 1, minimo: 1 };
  let redNativa = null;
  const redGpu = new Map();
  function reducir(op, arreglo) {
    if (!OPS_RED[op]) vm.error(`vm.c1en.reducir: la operación es "suma", "maximo" o "minimo" y llegó «${op}»`);
    let datos;
    if (arreglo instanceof ObjArreglo) {
      if (arreglo.tipo !== 'real' && arreglo.tipo !== 'entero') vm.error(`«${op}»: solo arreglos real o entero`);
      datos = Float64Array.from(vm.arrValores(arreglo));
    } else if (arreglo instanceof Float64Array || arreglo instanceof Int32Array) datos = Float64Array.from(arreglo);
    else vm.error(`vm.c1en.reducir: hace falta un arreglo y llegó ${tipoDe(arreglo)}`);
    const n = datos.length;
    if (n === 0) {
      if (op === 'suma') return 0;
      vm.error(`«${op}» de un arreglo vacío`);
    }
    elegirInicial();
    vm.cobrar(n);
    if (actual === 'jit') return c1enReducirJS(op, datos);
    if (actual === 'nativo') {
      if (!redNativa) {
        const f = ['suma', 'maximo', 'minimo'].map(o => ({ nombre: 'c1en_red_' + o, firma: `double c1en_red_${o}(double *, int64_t)` }));
        try { redNativa = c1enNativo().compilar(c1enFuenteReducir('c'), f); }
        catch (e) { vm.error(`las reducciones no compilan en C: ${e.message}`); }
      }
      return redNativa['c1en_red_' + op](datos, n);
    }
    const cu = c1enCuda();
    let funs = redGpu.get(indiceGpu);
    if (!funs) {
      try { funs = cu.compilar(c1enFuenteReducir('cuda'), ['c1en_red_suma', 'c1en_red_maximo', 'c1en_red_minimo']); }
      catch (e) { vm.error(`las reducciones no compilan para la GPU: ${e.message}`); }
      redGpu.set(indiceGpu, funs);
    }
    let a = null, b = null;
    try {
      a = cu.reservar(n * 8); b = cu.reservar(Math.max(8, Math.ceil(n / 2) * 8));
      cu.subir(a, datos);
      let len = n;
      while (len > 1) {
        const m = Math.ceil(len / 2);
        cu.lanzar(funs['c1en_red_' + op], c1enBloques(m, cu), C1EN_HILOS_BLOQUE,
          [{ t: 'i64', v: m }, { t: 'i64', v: len }, { t: 'ptr', v: a }, { t: 'ptr', v: b }]);
        const t = a; a = b; b = t;
        len = m;
      }
      cu.sincronizar();
      const r = new Float64Array(1);
      cu.bajar(r, a);
      return r[0];
    } finally {
      if (a !== null) cu.liberar(a);
      if (b !== null) cu.liberar(b);
    }
  }

  return {
    get dispositivo() { elegirInicial(); return actual; },
    get gpu() { elegirInicial(); return actual === 'gpu' ? indiceGpu : null; },
    usar, describir, disponibles, paralelo, codigo, kernel, reducir, liberarResidentes,
    // Para las pruebas y para quien quiera ver el JavaScript que corre en "jit".
    codigoJS(cierre, ejemplos) {
      const r = modeloDe(cierre, tiposParaLlamada(cierre, ejemplos, 'codigoJS'), 'codigoJS');
      return c1enEmitir(r.modelo, 'js');
    },
    fuenteKernel(lanzador, destino) { return fuenteKernel(lanzador.nucleo, destino); },
  };
}

function c1enLeerClave(k) {
  if (k === 0xffffffffffffffffn) return null;
  return [Number(k >> 24n), Number(k & 0xffffffn)];
}
function c1enBloques(n, cu) {
  const max = (cu && cu.maxBloques) || 1048576;
  return Math.max(1, Math.min(max, Math.ceil(n / C1EN_HILOS_BLOQUE)));
}
// ¿Se usa «nombre[…]» en el cuerpo? Solo para adivinar tipos en codigoC/codigoCuda.
function c1enSeIndexa(ast, nombre) {
  let si = false;
  (function mirar(n) {
    if (si || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(mirar); return; }
    if (n.tipo === 'Indice' && n.obj && n.obj.tipo === 'Variable' && n.obj.nombre === nombre) { si = true; return; }
    if (n.tipo === 'Llamada' && n.callee && n.callee.tipo === 'Variable' &&
        ['longitud', 'tamano', 'sumarAtomico'].includes(n.callee.nombre) &&
        n.args[0] && n.args[0].tipo === 'Variable' && n.args[0].nombre === nombre) { si = true; return; }
    for (const k in n) if (k !== 'proto' && k !== 'ups') mirar(n[k]);
  })(ast.cuerpo);
  return si;
}

// La reducción por árbol en JavaScript: en el sitio, sobre una copia. Escribir
// x[j] mientras se leen x[2j] y x[2j+1] es seguro porque 2j ≥ j: nunca se lee
// algo que ya se haya escrito en esta pasada.
function c1enOpRed(op) {
  if (op === 'suma') return (a, b) => a + b;
  // NaN gana siempre, y si no hay NaN el orden de los argumentos decide los
  // empates: así máximo(+0, −0) da lo mismo en los tres dispositivos.
  if (op === 'maximo') return (a, b) => (a !== a ? a : ((b > a || b !== b) ? b : a));
  return (a, b) => (a !== a ? a : ((b < a || b !== b) ? b : a));
}
function c1enReducirJS(op, x) {
  const f = c1enOpRed(op);
  let len = x.length;
  while (len > 1) {
    const m = Math.ceil(len / 2);
    for (let j = 0; 2 * j + 1 < len; j++) x[j] = f(x[2 * j], x[2 * j + 1]);
    if (len % 2) x[m - 1] = x[len - 1];
    len = m;
  }
  return x[0];
}
function c1enFuenteReducir(destino) {
  const ops = {
    suma: '(a + b)',
    maximo: '((a != a) ? a : ((b > a || b != b) ? b : a))',
    minimo: '((a != a) ? a : ((b < a || b != b) ? b : a))',
  };
  let s = '/* C1EÑ — reducciones por árbol de orden fijo. */\n';
  if (destino === 'c') {
    s += C1EN_CABECERA_C;
    for (const o in ops) s +=
      `double c1en_red_${o}(double* x, int64_t len) {\n` +
      `  while (len > 1) {\n    int64_t m = (len + 1) / 2;\n` +
      `    for (int64_t j = 0; 2 * j + 1 < len; j++) { double a = x[2 * j], b = x[2 * j + 1]; x[j] = ${ops[o]}; }\n` +
      `    if (len % 2) x[m - 1] = x[len - 1];\n    len = m;\n  }\n  return x[0];\n}\n`;
    return s;
  }
  s += C1EN_CABECERA_CUDA;
  for (const o in ops) {
    s += `extern "C" __global__ void c1en_red_${o}(long long m, long long len, double* x, double* y) {\n` +
      `  for (long long j = (long long)blockIdx.x * blockDim.x + threadIdx.x; j < m; j += (long long)blockDim.x * gridDim.x) {\n` +
      `    if (2 * j + 1 < len) { double a = x[2 * j], b = x[2 * j + 1]; y[j] = ${ops[o]}; } else y[j] = x[2 * j];\n  }\n}\n`;
    s += c1enEmulador(`c1en_red_${o}`, '*(long long*)p[0], *(long long*)p[1], *(double**)p[2], *(double**)p[3]');
  }
  return s;
}
// Para el simulador de las pruebas: un envoltorio que recorre la cuadrícula en
// la CPU y desempaqueta los parámetros igual que lo hace el driver con el
// arreglo «void **kernelParams». Solo existe compilando con -DC1EN_EMULAR: NVRTC
// no lo ve nunca.
function c1enEmulador(nombre, desempaquetar) {
  return `#ifdef C1EN_EMULAR\nextern "C" void c1en_emul_${nombre}(unsigned gx, unsigned bx, void** p) {\n` +
    `  gridDim.x = gx; blockDim.x = bx;\n` +
    `  for (unsigned b = 0; b < gx; b++) for (unsigned t = 0; t < bx; t++) {\n` +
    `    blockIdx.x = b; threadIdx.x = t;\n    ${nombre}(${desempaquetar});\n  }\n}\n#endif\n`;
}

// ============================================================================
//  El análisis: tipos, ámbitos y sitios de fallo
// ============================================================================
// Recorre la función y deja un MODELO que los tres emisores leen igual: el tipo
// de cada expresión, el nombre de C de cada variable y el número de cada sitio
// que puede fallar. Que los tres lean el mismo modelo es lo que garantiza que
// hagan las mismas conversiones en el mismo sitio.
//
// Los tipos son 'ent', 'real' y 'bool'; los arreglos van aparte. El de una
// variable es la UNIÓN de todo lo que se le asigna (ent ∪ real = real), y se
// calcula hasta que no cambia: «var x = 0» seguido de «x = x / 2» deja x real,
// como en Ñ, donde x valdría 0,5.
function c1enAnalizar(vm, cierre, tiposArgs, quien) {
  const fn = cierre.fn;
  const ast = fn.ast;
  const enl = fn.enlace || null;
  const nombreFn = fn.nombre && fn.nombre !== '<anónima>' ? fn.nombre : 'anónima';
  const no = (n, que, pista) =>
    vm.error(`«${quien}»: no se puede compilar «${nombreFn}» para C1EÑ — línea ${(n && n.linea) || ast.linea}: ${que}`, pista || null);

  if (fn.nUpvalues > 0) {
    const ups = (ast.ups || []).map(u => u.nombre).filter(Boolean);
    no(ast, `usa ${ups.length ? ups.map(u => '«' + u + '»').join(', ') : 'variables'} de fuera de la función, ` +
      'y un núcleo no puede capturar variables: pásalas como argumentos', 'paralelo(n, funcion(i, a, x) { … }, a, x)');
  }

  const M = {
    nombre: nombreFn, linea: ast.linea, ast: ast.cuerpo, params: [], vars: [], tipos: new Map(), arrDe: new Map(),
    sitios: [null], sitioDe: new Map(), llamadas: new Map(), porNodo: new Map(),
  };
  const asc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_');
  let nVars = 0;
  const nuevaVar = (nombre, extra) => Object.assign({ nombre, cn: `v${nVars++}_${asc(nombre)}`, tipo: null, anot: null, fijo: false }, extra);

  // Los parámetros: el 0 es el índice del hilo; los demás, lo que llegó.
  const ps = ast.params;
  M.params.push(Object.assign(nuevaVar(ps[0].nombre), { tipo: 'ent', tipoEntrada: 'ent', entrada: 'p0' }));
  for (let k = 1; k < ps.length; k++) {
    const t = tiposArgs[k - 1];
    if (t === 'f64*' || t === 'i32*')
      M.params.push({ nombre: ps[k].nombre, arr: t === 'f64*' ? 'real' : 'ent', cn: `p${k}`, cnN: `n${k}` });
    else M.params.push(Object.assign(nuevaVar(ps[k].nombre), { tipo: t, tipoEntrada: t, entrada: `p${k}` }));
  }

  const sitio = (n, clase, texto, pista) => {
    let porClase = M.sitioDe.get(n);
    if (!porClase) { porClase = new Map(); M.sitioDe.set(n, porClase); }
    if (!porClase.has(clase)) {
      const id = M.sitios.length;
      if (id >= 0xffffff) no(n, 'el núcleo es demasiado largo (más de 16 millones de sitios que pueden fallar)');
      M.sitios.push({ linea: n.linea || ast.linea, texto, pista });
      porClase.set(clase, id);
    }
    return porClase.get(clase);
  };
  M.sitio = (n, clase) => M.sitioDe.get(n).get(clase);

  const unir = (a, b, n, nombre) => {
    if (a === null) return b;
    if (a === b) return a;
    if ((a === 'ent' && b === 'real') || (a === 'real' && b === 'ent')) return 'real';
    no(n, `«${nombre}» es a veces ${a === 'bool' ? 'bool' : 'un número'} y a veces ${b === 'bool' ? 'bool' : 'un número'}`,
      'dentro de un núcleo cada variable tiene un solo tipo');
  };
  const tipoAnot = (an, n, nombre) => {
    if (!an) return null;
    if (an.k === 'entero') return 'ent';
    if (an.k === 'real') return 'real';
    if (an.k === 'bool') return 'bool';
    if (an.k === 'cualquiera') return null;
    no(n, `«${nombre}» está anotada como ${tipoATexto(an)}, y en un núcleo las variables son entero, real o bool`);
  };
  const esNum = t => t === 'ent' || t === 'real';

  let scopes;
  const buscar = nombre => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(nombre)) return scopes[s].get(nombre);
    return null;
  };
  const declarar = (clave, nombre, extra) => {
    let info = M.porNodo.get(clave);
    if (!info) { info = nuevaVar(nombre, extra); M.porNodo.set(clave, info); M.vars.push(info); }
    scopes[scopes.length - 1].set(nombre, info);
    return info;
  };
  let cambio = false;
  const asignarTipo = (info, t, n) => {
    if (info.anot) {
      if (info.anot === 'ent' && t === 'real')
        no(n, `«${info.nombre}» es entera y se le asigna un real`, 'usa piso(x) o techo(x), o declárala real');
      if ((info.anot === 'bool') !== (t === 'bool')) unir(info.anot, t, n, info.nombre);
      return;
    }
    const u = unir(info.tipo, t, n, info.nombre);
    if (u !== info.tipo) { info.tipo = u; cambio = true; }
  };

  // ¿Qué nativa hay detrás de este nombre? Se resuelve como lo hace el
  // compilador —con el enlace del archivo— y se mira el valor: una función de
  // usuario que se llame «raiz» no es la raíz.
  const resolverLlamada = n => {
    if (n.callee.tipo !== 'Variable') no(n, 'solo se pueden llamar funciones por su nombre');
    const nombre = n.callee.nombre;
    if (buscar(nombre)) no(n, `«${nombre}» es una variable, no una función`);
    const g = vm.globals.get(globalDeEnlace(enl, nombre));
    if (g instanceof ObjNativa) {
      const corto = g.nombreCorto || g.nombre;
      if (C1EN_FUNCIONES[corto] !== undefined && (!g.edsl || g.edsl === 'numerico' || g.edsl === 'nen')) return corto;
      no(n, `«${nombre}» no se puede llamar dentro de un núcleo`, `las que sí: ${C1EN_LISTA}`);
    }
    if (g instanceof ObjCierre)
      no(n, `llama a la función de usuario «${nombre}», y un núcleo no puede llamar a otras funciones de Ñ`,
        'escribe esa cuenta dentro del núcleo (en la v1 de C1EÑ no hay llamadas entre núcleos)');
    no(n, `«${nombre}» no es una función que se conozca aquí`, `las que sí: ${C1EN_LISTA}`);
  };

  // Una expresión de tipo arreglo: solo un parámetro arreglo, por su nombre.
  const arregloDe = (n, para) => {
    if (n.tipo !== 'Variable') no(n, `${para} necesita un arreglo que sea un parámetro, por su nombre`);
    const info = buscar(n.nombre);
    if (!info) no(n, `«${n.nombre}» es de fuera del núcleo`, 'pásalo como argumento de paralelo');
    if (!info.arr) no(n, `«${n.nombre}» no es un arreglo`);
    M.arrDe.set(n, info);
    return info;
  };

  function tx(n) {
    const t = tx0(n);
    M.tipos.set(n, t);
    return t;
  }
  function tx0(n) {
    switch (n.tipo) {
      case 'Literal':
        if (typeof n.valor === 'boolean') return 'bool';
        if (typeof n.valor === 'number') {
          const real = n.tipoLit && (n.tipoLit === T.real || n.tipoLit.k === 'real');
          if (!real && Math.abs(n.valor) > 9007199254740992)
            no(n, `el entero ${n.valor} no cabe exacto en un número de Ñ (más de 2^53)`);
          return real ? 'real' : 'ent';
        }
        if (typeof n.valor === 'string') no(n, `usa texto (${repr(n.valor, 1)}), y en un núcleo solo hay números, bool y arreglos`);
        no(n, 'usa «nulo», y en un núcleo solo hay números, bool y arreglos');
        break;
      case 'Interpolacion': no(n, 'usa texto, y en un núcleo solo hay números, bool y arreglos'); break;
      case 'ListaLit': no(n, 'crea una lista, y dentro de un núcleo no se crean objetos', 'reserva los arreglos fuera y pásalos'); break;
      case 'DicLit': no(n, 'crea un diccionario, y dentro de un núcleo no se crean objetos'); break;
      case 'FuncionAnon': no(n, 'declara una función anónima (un cierre), y un núcleo no puede'); break;
      case 'Propiedad': no(n, `usa «.${n.nombre}», y dentro de un núcleo no hay campos ni métodos`); break;
      case 'Variable': {
        const info = buscar(n.nombre);
        if (info) {
          if (info.arr) no(n, `el arreglo «${n.nombre}» solo se puede usar como ${n.nombre}[i], o en longitud(${n.nombre})`);
          if (info.tipo === null) no(n, `«${n.nombre}» se usa antes de tener valor`);
          return info.tipo;
        }
        if (n.nombre[0] === '|') {
          const v = vm.globals.get(n.nombre);
          if (typeof v !== 'number') no(n, `la constante «${n.nombre}» no es un número`);
          M.llamadas.set(n, v);
          return 'real';
        }
        no(n, `«${n.nombre}» es una variable de fuera del núcleo`, 'pásala como argumento: paralelo(n, f, a, b, ' + n.nombre + ')');
        break;
      }
      case 'Unario': {
        const t = tx(n.expr);
        if (n.op === 'no') { if (t !== 'bool') no(n, '«no» necesita un bool'); return 'bool'; }
        if (!esNum(t)) no(n, '«-» necesita un número');
        return t;
      }
      case 'Binario': {
        const a = tx(n.izq);
        // «x ** 2» con el exponente escrito como entero pequeño se multiplica:
        // x*x da el mismo bit en todas partes y pow() no está garantizado.
        if (n.op === '**' && n.der.tipo === 'Literal' && typeof n.der.valor === 'number' &&
            !(n.der.tipoLit && n.der.tipoLit.k === 'real') && n.der.valor >= 0 && n.der.valor <= 4) {
          tx(n.der);
          if (!esNum(a)) no(n, '«**» necesita números');
          return a;
        }
        const b = tx(n.der);
        return tipoBin(n, n.op, a, b);
      }
      case 'Indice': {
        const info = arregloDe(n.obj, 'indexar');
        const ti = tx(n.indice);
        if (ti !== 'ent') no(n, `el índice de «${info.nombre}» tiene que ser entero y es ${ti === 'real' ? 'real' : 'bool'}`,
          'usa piso(x) para convertir un real en índice');
        sitio(n, 'idx', `el índice se sale del arreglo «${info.nombre}»`, `los índices válidos van de 0 a longitud(${info.nombre}) − 1`);
        return info.arr;
      }
      case 'Llamada': {
        const f = resolverLlamada(n);
        M.llamadas.set(n, f);
        const nArgs = C1EN_FUNCIONES[f];
        if (n.args.length !== nArgs) no(n, `«${f}» recibe ${nArgs} argumento(s) dentro de un núcleo y llegaron ${n.args.length}`);
        if (f === 'sumarAtomico') no(n, '«sumarAtomico» es una sentencia: no devuelve nada que usar');
        if (f === 'longitud' || f === 'tamano') { arregloDe(n.args[0], `«${f}»`); return 'ent'; }
        const ts = n.args.map(tx);
        for (let k = 0; k < ts.length; k++) if (!esNum(ts[k])) no(n, `«${f}» necesita números y el argumento ${k + 1} es bool`);
        if (f === 'azarHilo') {
          ts.forEach((t, k) => { if (t !== 'ent') no(n, `«azarHilo»: el argumento ${k + 1} tiene que ser entero`, 'azarHilo(semilla, i, canal) con tres enteros'); });
          return 'real';
        }
        if (f === 'raiz') { sitio(n, 'raiz', '«raiz» de un número negativo'); return 'real'; }
        if (f === 'log' || f === 'log10') { sitio(n, 'log', `«${f}» necesita un número positivo`); return 'real'; }
        if (f === 'absoluto') return ts[0];
        if (f === 'real') return 'real';
        if (f === 'entero') {
          if (ts[0] === 'ent') return 'ent';
          sitio(n, 'piso', '«entero» de un número que no es finito (infinito, NaN o más de 2^53)');
          return 'ent';
        }
        if (f === 'piso' || f === 'techo') {
          if (ts[0] === 'ent') return 'ent';
          sitio(n, 'piso', `«${f}» de un número que no es un entero exacto (infinito, NaN o más de 2^53)`);
          return 'ent';
        }
        if (f === 'minimo' || f === 'maximo') return ts[0] === 'ent' && ts[1] === 'ent' ? 'ent' : 'real';
        return 'real';   // trascendentes y angulo
      }
      case 'Asignacion': no(n, 'una asignación dentro de una expresión', 'escríbela como sentencia aparte'); break;
      default: no(n, `«${n.tipo}» no está en el subconjunto que C1EÑ sabe compilar`);
    }
    return null;
  }
  function tipoBin(n, op, a, b) {
    if (op === 'y' || op === 'o') {
      if (a !== 'bool' || b !== 'bool') no(n, `«${op}» une condiciones (bool), y aquí hay números`, 'compara antes: x > 0 y x < 1');
      return 'bool';
    }
    if (op === '==' || op === '!=') {
      if ((a === 'bool') !== (b === 'bool')) no(n, `«${op}» compara un bool con un número`);
      return 'bool';
    }
    if (!esNum(a) || !esNum(b)) no(n, `«${op}» necesita números y hay un bool`);
    switch (op) {
      case '<': case '<=': case '>': case '>=': return 'bool';
      case '+': case '-': case '*': return a === 'ent' && b === 'ent' ? 'ent' : 'real';
      case '/': sitio(n, 'div', 'división entre cero'); return 'real';
      case '//': sitio(n, 'div', 'división entre cero'); return a === 'ent' && b === 'ent' ? 'ent' : 'real';
      case '%': sitio(n, 'mod', 'módulo entre cero'); return a === 'ent' && b === 'ent' ? 'ent' : 'real';
      case '**': return 'real';
      default: no(n, `el operador «${op}» no está en el subconjunto`);
    }
    return null;
  }

  // ── sentencias ──────────────────────────────────────────────────────────────
  let bucles = 0;
  function bloque(b) {
    scopes.push(new Map());
    for (const s of b.cuerpo) ts(s);
    scopes.pop();
  }
  function cuerpoBucle(n, b) {
    bucles++;
    sitio(n, 'vueltas', `un hilo dio más de ${C1EN_MAX_VUELTAS.toLocaleString('es')} vueltas: probablemente un bucle infinito`);
    bloque(b);
    bucles--;
  }
  function ts(n) {
    switch (n.tipo) {
      case 'DeclVar': {
        const anot = tipoAnot(n.anotacion, n, n.nombre);
        if (!n.valor && !anot) no(n, `«${n.nombre}» se declara sin valor ni tipo`, `var ${n.nombre}: real = 0.0`);
        let t = null;
        if (n.valor) {
          if (n.valor.tipo === 'Variable' && buscar(n.valor.nombre) && buscar(n.valor.nombre).arr)
            no(n, `copia el arreglo «${n.valor.nombre}» en una variable, y dentro de un núcleo no se crean arreglos`,
              `usa ${n.valor.nombre} directamente`);
          t = tx(n.valor);
        }
        const info = declarar(n, n.nombre, { fijo: !!n.esFijo });
        if (anot) { info.anot = anot; info.tipo = anot; if (t) asignarTipo(info, t, n); }
        else asignarTipo(info, t, n);
        return;
      }
      case 'ExprSent': {
        const e = n.expr;
        if (e.tipo === 'Asignacion') return asignacion(e);
        if (e.tipo === 'Llamada') {
          const f = resolverLlamada(e);
          M.llamadas.set(e, f);
          if (f !== 'sumarAtomico') no(e, `el resultado de «${f}» no se usa`, 'guárdalo en una variable o en un arreglo');
          if (e.args.length !== 3) no(e, '«sumarAtomico» recibe (arreglo, índice, valor)');
          const info = arregloDe(e.args[0], '«sumarAtomico»');
          const tj = tx(e.args[1]), tv = tx(e.args[2]);
          if (tj !== 'ent') no(e, 'el índice de «sumarAtomico» tiene que ser entero');
          if (!esNum(tv)) no(e, '«sumarAtomico» suma números');
          if (info.arr === 'ent' && tv !== 'ent') no(e, `«${info.nombre}» es un arreglo entero y se le suma un real`, 'usa piso(v), o un arreglo real');
          sitio(e, 'idx', `el índice se sale del arreglo «${info.nombre}»`, `los índices válidos van de 0 a longitud(${info.nombre}) − 1`);
          return;
        }
        no(n, 'esta expresión no hace nada', 'en un núcleo las sentencias son asignaciones, si, mientras, para y sumarAtomico');
        return;
      }
      case 'Si': {
        if (tx(n.cond) !== 'bool') no(n.cond, 'la condición de «si» tiene que ser un bool', 'compara: si x > 0 { … }');
        ts(n.entonces);
        if (n.sino) ts(n.sino);
        return;
      }
      case 'Bloque': bloque(n); return;
      case 'Mientras': {
        if (tx(n.cond) !== 'bool') no(n.cond, 'la condición de «mientras» tiene que ser un bool');
        cuerpoBucle(n, n.cuerpo);
        return;
      }
      case 'Repetir': {
        if (tx(n.cuantas) !== 'ent') no(n, '«repetir» necesita un número entero de veces');
        cuerpoBucle(n, n.cuerpo);
        return;
      }
      case 'Para': {
        const it = n.iterable;
        const esRango = it.tipo === 'Llamada' && it.callee.tipo === 'Variable' && !buscar(it.callee.nombre) &&
          (() => { const g = vm.globals.get(globalDeEnlace(enl, it.callee.nombre)); return g instanceof ObjNativa && (g.nombreCorto || g.nombre) === 'rango'; })();
        if (!esRango) no(n, '«para» solo recorre rango(…) dentro de un núcleo', 'para j en rango(longitud(a)) { … a[j] … }');
        if (it.args.length < 1 || it.args.length > 3) no(n, '«rango» acepta 1, 2 o 3 argumentos');
        for (const x of it.args) if (tx(x) !== 'ent') no(x, '«rango» necesita enteros dentro de un núcleo', 'usa piso(x)');
        if (it.args.length === 3) {
          const p = it.args[2];
          if (p.tipo === 'Literal' && p.valor === 0) no(p, 'el paso de «rango» no puede ser 0');
          sitio(n, 'paso', 'el paso de «rango» es 0');
        }
        scopes.push(new Map());
        const info = declarar(n, n.nombre, {});
        asignarTipo(info, 'ent', n);
        cuerpoBucle(n, n.cuerpo);
        scopes.pop();
        return;
      }
      case 'Romper': case 'Continuar':
        if (!bucles) no(n, `«${n.tipo === 'Romper' ? 'romper' : 'continuar'}» fuera de un bucle`);
        return;
      case 'Devolver':
        if (n.valor) no(n, 'devuelve un valor, y un núcleo no devuelve nada', 'escribe el resultado en un arreglo: r[i] = …');
        return;
      case 'DeclFuncion': no(n, `declara la función «${n.nombre}» dentro, y un núcleo no puede`); return;
      case 'Intentar': no(n, 'usa intentar/capturar, y en una GPU no hay excepciones', 'los fallos (dividir entre cero, índices) los informa el propio C1EÑ con la línea'); return;
      case 'Lanzar': no(n, 'usa «lanzar», y en una GPU no hay excepciones'); return;
      case 'Usar': no(n, 'un «usar» dentro de un núcleo'); return;
      default: no(n, `«${n.tipo}» no está en el subconjunto que C1EÑ sabe compilar`);
    }
  }
  function asignacion(e) {
    const d = e.destino;
    if (d.tipo === 'Variable') {
      const info = buscar(d.nombre);
      if (!info) no(e, `asigna a «${d.nombre}», que es de fuera del núcleo`, 'el núcleo solo escribe en sus variables y en sus arreglos');
      if (info.arr) no(e, `reasigna el arreglo «${d.nombre}»`, `escribe en sus elementos: ${d.nombre}[i] = …`);
      if (info.fijo) no(e, `«${d.nombre}» es fija`);
      let t = tx(e.valor);
      if (e.op !== '=') {
        if (info.tipo === null) no(e, `«${d.nombre}» se usa antes de tener valor`);
        M.tipos.set(d, info.tipo);
        t = tipoBin(e, e.op[0], info.tipo, t);
      }
      M.tipos.set(e, t);
      asignarTipo(info, t, e);
      return;
    }
    if (d.tipo === 'Indice') {
      const info = arregloDe(d.obj, 'asignar por índice');
      if (tx(d.indice) !== 'ent') no(e, `el índice de «${info.nombre}» tiene que ser entero`, 'usa piso(x)');
      sitio(d, 'idx', `el índice se sale del arreglo «${info.nombre}»`, `los índices válidos van de 0 a longitud(${info.nombre}) − 1`);
      let t = tx(e.valor);
      if (e.op !== '=') t = tipoBin(e, e.op[0], info.arr, t);
      M.tipos.set(e, t);
      if (!esNum(t)) no(e, `se guarda un bool en el arreglo «${info.nombre}»`);
      if (info.arr === 'ent' && t === 'real') no(e, `se guarda un real en el arreglo entero «${info.nombre}»`, 'usa piso(x) o techo(x), o un arreglo real');
      return;
    }
    no(e, 'solo se puede asignar a una variable o a a[i]');
  }

  // Punto fijo: se repite hasta que ningún tipo cambie (una variable solo
  // puede pasar de ent a real, así que son dos o tres vueltas).
  for (let vuelta = 0; ; vuelta++) {
    cambio = false;
    scopes = [new Map()];
    for (const p of M.params) scopes[0].set(p.nombre, p);
    // Un parámetro escalar se copia a una local al entrar: se puede reasignar,
    // y su tipo puede ensancharse (llega 2 y luego se le suma 0,5).
    bloque(ast.cuerpo);
    if (!cambio) break;
    if (vuelta > 20) no(ast, 'los tipos no se estabilizan (fallo interno de C1EÑ)');
  }
  for (const v of M.vars) if (v.tipo === null) v.tipo = 'ent';
  return M;
}

// ============================================================================
//  Los emisores: el mismo modelo, tres textos
// ============================================================================
// Todo se escribe con la misma forma en los tres destinos: variables y
// temporales declarados arriba, los fallos como expresiones que valen 0, y
// después de cada sentencia que puede fallar un «if (f) return f». Así el
// orden de evaluación y el punto donde un hilo se detiene son los mismos.
function c1enEmitir(M, destino) {
  const js = destino === 'js', cu = destino === 'cuda';
  const TY = { ent: cu ? 'long long' : 'int64_t', real: 'double', bool: 'int' };
  const EQ = js ? '===' : '==', NE = js ? '!==' : '!=';
  const temps = [];
  const tmp = t => { const nm = `t${temps.length}`; temps.push([nm, t]); return nm; };
  let fallas = 0;
  const FALLA = id => { fallas++; return js ? `((f === 0 || ${id} < f) ? (f = ${id}) : 0, 0)` : `c1en_falla(&f, ${id})`; };
  const FALLA_S = id => js ? `{ if (f === 0 || ${id} < f) f = ${id}; return f; }` : `{ c1en_falla(&f, ${id}); return f; }`;
  const MATH = f => (js ? 'Math.' + f : f);
  const aReal = (c, t) => (t === 'real' ? c : (js ? `(${c} + 0)` : `((double)(${c}))`));
  const conv = (c, de, a) => (a === 'real' ? aReal(c, de) : c);
  const lit = (v, t) => {
    if (t === 'bool') return js ? String(v) : (v ? '1' : '0');
    if (t === 'ent') return js ? String(v) : `${v}LL`;
    if (v === Infinity) return js ? 'Infinity' : 'C1EN_INF';
    if (js) return String(v);
    if (cu) return `${c1enHexReal(v)} /* ${v} */`;
    const s = String(v);
    return /[.eE]/.test(s) ? s : s + '.0';
  };
  const enRango = (j, nn) => (js ? `(${j} >= 0 && ${j} < ${nn})` : `((${cu ? 'unsigned long long' : 'uint64_t'})(${j}) < (${cu ? 'unsigned long long' : 'uint64_t'})(${nn}))`);
  const tipoDe = n => M.tipos.get(n);

  function binop(nodo, op, a, ta, b, tb, tr) {
    switch (op) {
      case 'y': return `(${a} && ${b})`;
      case 'o': return `(${a} || ${b})`;
      case '==': return `(${a} ${EQ} ${b})`;
      case '!=': return `(${a} ${NE} ${b})`;
      case '<': case '<=': case '>': case '>=': return `(${a} ${op} ${b})`;
      case '+': case '-': case '*':
        return tr === 'ent' ? `(${a} ${op} ${b})` : `(${aReal(a, ta)} ${op} ${aReal(b, tb)})`;
      case '/': {
        const t = tmp('real');
        return `(${t} = ${aReal(b, tb)}, ${t} ${EQ} 0 ? ${FALLA(M.sitio(nodo, 'div'))} : ${aReal(a, ta)} / ${t})`;
      }
      case '//': {
        if (tr === 'ent') {
          const t = tmp('ent');
          return `(${t} = ${b}, ${t} ${EQ} 0 ? ${FALLA(M.sitio(nodo, 'div'))} : ${js ? `Math.floor(${a} / ${t})` : `c1en_div_piso(${a}, ${t})`})`;
        }
        const t = tmp('real');
        return `(${t} = ${aReal(b, tb)}, ${t} ${EQ} 0 ? ${FALLA(M.sitio(nodo, 'div'))} : ${MATH('floor')}(${aReal(a, ta)} / ${t}))`;
      }
      case '%': {
        if (tr === 'ent') {
          const t = tmp('ent');
          return `(${t} = ${b}, ${t} ${EQ} 0 ? ${FALLA(M.sitio(nodo, 'mod'))} : ${js ? `((${a} % ${t}) + ${t}) % ${t}` : `c1en_mod(${a}, ${t})`})`;
        }
        const t = tmp('real');
        const r = js ? `((${aReal(a, ta)} % ${t}) + ${t}) % ${t}` : `fmod(fmod(${aReal(a, ta)}, ${t}) + ${t}, ${t})`;
        return `(${t} = ${aReal(b, tb)}, ${t} ${EQ} 0 ? ${FALLA(M.sitio(nodo, 'mod'))} : ${r})`;
      }
      case '**': return `${MATH('pow')}(${aReal(a, ta)}, ${aReal(b, tb)})`;
    }
    throw new Error('operador sin emitir: ' + op);
  }

  function leerArr(info, j) {
    const t = tmp('ent');
    return { t, codigo: (nodo) => `(${t} = ${j}, ${enRango(t, info.cnN)} ? ${info.cn}[${t}] : ${FALLA(M.sitio(nodo, 'idx'))})` };
  }

  function ex(n) {
    const t = tipoDe(n);
    switch (n.tipo) {
      case 'Literal': return lit(n.valor, t);
      case 'Variable': {
        if (M.llamadas.has(n)) return lit(M.llamadas.get(n), 'real');
        return varDe(n.nombre);
      }
      case 'Unario': return n.op === 'no' ? `(!${ex(n.expr)})` : `(-${ex(n.expr)})`;
      case 'Binario': {
        if (n.op === '**' && n.der.tipo === 'Literal' && tipoDe(n.der) === 'ent' && n.der.valor >= 0 && n.der.valor <= 4) {
          const k = n.der.valor;
          const tb = tmp(t);
          const base = ex(n.izq);
          if (k === 0) return `(${tb} = ${base}, ${lit(1, t)})`;
          let prod = tb;
          for (let q = 1; q < k; q++) prod = `(${prod} * ${tb})`;
          return `(${tb} = ${base}, ${prod})`;
        }
        return binop(n, n.op, ex(n.izq), tipoDe(n.izq), ex(n.der), tipoDe(n.der), t);
      }
      case 'Indice': {
        const info = M.arrDe.get(n.obj);
        return leerArr(info, ex(n.indice)).codigo(n);
      }
      case 'Llamada': return llamada(n, t);
    }
    throw new Error('expresión sin emitir: ' + n.tipo);
  }
  function llamada(n, t) {
    const f = M.llamadas.get(n);
    const as = n.args;
    if (f === 'longitud' || f === 'tamano') return M.arrDe.get(as[0]).cnN;
    const a0 = () => ex(as[0]), t0 = tipoDe(as[0]);
    switch (f) {
      case 'raiz': {
        const x = tmp('real');
        return `(${x} = ${aReal(a0(), t0)}, ${x} < 0 ? ${FALLA(M.sitio(n, 'raiz'))} : ${MATH('sqrt')}(${x}))`;
      }
      case 'log': case 'log10': {
        const x = tmp('real');
        return `(${x} = ${aReal(a0(), t0)}, ${x} <= 0 ? ${FALLA(M.sitio(n, 'log'))} : ${js ? C1EN_TRASC_JS[f] : C1EN_TRASC[f]}(${x}))`;
      }
      case 'angulo': return `${MATH('atan2')}(${aReal(a0(), t0)}, ${aReal(ex(as[1]), tipoDe(as[1]))})`;
      case 'absoluto': {
        if (t === 'real') return `${js ? 'Math.abs' : 'fabs'}(${a0()})`;
        const x = tmp('ent');
        return `(${x} = ${a0()}, ${x} < 0 ? -${x} : ${x})`;
      }
      case 'real': return t0 === 'real' ? a0() : (js ? a0() : `(double)(${a0()})`);
      case 'entero': {
        if (t0 === 'ent') return a0();
        const x = tmp('real');
        const r = js ? `Math.trunc(${x})` : `(${TY.ent})trunc(${x})`;
        return `(${x} = ${a0()}, (${x} >= -9007199254740992.0 && ${x} <= 9007199254740992.0) ? ${r} : ${FALLA(M.sitio(n, 'piso'))})`;
      }
      case 'piso': case 'techo': {
        if (t0 === 'ent') return a0();
        const x = tmp('real');
        const fn = f === 'piso' ? 'floor' : 'ceil';
        const r = js ? `Math.${fn}(${x})` : `(${TY.ent})${fn}(${x})`;
        return `(${x} = ${a0()}, (${x} >= -9007199254740992.0 && ${x} <= 9007199254740992.0) ? ${r} : ${FALLA(M.sitio(n, 'piso'))})`;
      }
      case 'minimo': case 'maximo': {
        const a = tmp(t), b = tmp(t);
        return `(${a} = ${conv(a0(), t0, t)}, ${b} = ${conv(ex(as[1]), tipoDe(as[1]), t)}, ${b} ${f === 'minimo' ? '<' : '>'} ${a} ? ${b} : ${a})`;
      }
      case 'azarHilo': return `${js ? 'c1enAzar' : 'c1en_azar'}(${a0()}, ${ex(as[1])}, ${ex(as[2])})`;
      default: return `${js ? C1EN_TRASC_JS[f] : C1EN_TRASC[f]}(${aReal(a0(), t0)})`;
    }
  }

  // Los nombres de las variables por ámbito, igual que en el análisis.
  let scopes;
  const buscar = nombre => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(nombre)) return scopes[s].get(nombre);
    return null;
  };
  const varDe = nombre => buscar(nombre).cn;

  const lineas = [];
  let ind = 2;
  const L = s => lineas.push(' '.repeat(ind) + s);
  const comprobar = antes => { if (fallas > antes) L('if (f) return f;'); };

  function bloque(b) {
    scopes.push(new Map());
    for (const s of b.cuerpo) st(s);
    scopes.pop();
  }
  function vuelta(n) { L(`if (++vueltas > ${C1EN_MAX_VUELTAS}) ${FALLA_S(M.sitio(n, 'vueltas'))}`); }
  function st(n) {
    if (!js) L(`/* línea ${n.linea} */`);
    switch (n.tipo) {
      case 'DeclVar': {
        const info = M.porNodo.get(n);
        scopes[scopes.length - 1].set(n.nombre, info);
        const antes = fallas;
        const v = n.valor ? conv(ex(n.valor), tipoDe(n.valor), info.tipo) : lit(info.tipo === 'bool' ? false : 0, info.tipo);
        L(`${info.cn} = ${v};`);
        comprobar(antes);
        return;
      }
      case 'ExprSent': {
        const e = n.expr;
        if (e.tipo === 'Llamada') return sumarAtomico(e);
        return asignacion(e);
      }
      case 'Si': {
        const c = tmp('bool');
        const antes = fallas;
        L(`${c} = ${ex(n.cond)};`);
        comprobar(antes);
        L(`if (${c}) {`);
        ind += 2; st(n.entonces); ind -= 2;
        if (n.sino) { L('} else {'); ind += 2; st(n.sino); ind -= 2; }
        L('}');
        return;
      }
      case 'Bloque': bloque(n); return;
      case 'Mientras': {
        const c = tmp('bool');
        L('for (;;) {');
        ind += 2;
        vuelta(n);
        const antes = fallas;
        L(`${c} = ${ex(n.cond)};`);
        comprobar(antes);
        L(`if (!${c}) break;`);
        bloque(n.cuerpo);
        ind -= 2;
        L('}');
        return;
      }
      case 'Repetir': {
        const cn = tmp('ent'), k = tmp('ent');
        const antes = fallas;
        L(`${cn} = ${ex(n.cuantas)};`);
        comprobar(antes);
        L(`for (${k} = 0; ${k} < ${cn}; ${k}++) {`);
        ind += 2;
        vuelta(n);
        bloque(n.cuerpo);
        ind -= 2;
        L('}');
        return;
      }
      case 'Para': {
        const as = n.iterable.args;
        const ini = tmp('ent'), fin = tmp('ent'), paso = tmp('ent'), cur = tmp('ent');
        const antes = fallas;
        if (as.length === 1) { L(`${ini} = 0;`); L(`${fin} = ${ex(as[0])};`); }
        else { L(`${ini} = ${ex(as[0])};`); L(`${fin} = ${ex(as[1])};`); }
        L(`${paso} = ${as.length === 3 ? ex(as[2]) : lit(1, 'ent')};`);
        comprobar(antes);
        if (as.length === 3) L(`if (${paso} ${EQ} 0) ${FALLA_S(M.sitio(n, 'paso'))}`);
        L(`for (${cur} = ${ini}; ${paso} > 0 ? ${cur} < ${fin} : ${cur} > ${fin}; ${cur} += ${paso}) {`);
        ind += 2;
        vuelta(n);
        scopes.push(new Map());
        const info = M.porNodo.get(n);
        scopes[scopes.length - 1].set(n.nombre, info);
        L(`${info.cn} = ${cur};`);
        bloque(n.cuerpo);
        scopes.pop();
        ind -= 2;
        L('}');
        return;
      }
      case 'Romper': L('break;'); return;
      case 'Continuar': L('continue;'); return;
      case 'Devolver': L('return 0;'); return;
    }
    throw new Error('sentencia sin emitir: ' + n.tipo);
  }
  // Guardar en un arreglo entero: Ñ guarda los enteros en Int32Array, que se
  // envuelve módulo 2^32 al escribir. En C se dice lo mismo pasando por
  // unsigned, que es la única conversión que el estándar define para todos los
  // valores.
  const guardarEnt = v => (js ? v : `(${cu ? 'int' : 'int32_t'})(${cu ? 'unsigned int' : 'uint32_t'})(${cu ? 'unsigned long long' : 'uint64_t'})(${v})`);
  function asignacion(e) {
    const d = e.destino;
    const t = tipoDe(e) || tipoDe(e.valor);
    if (d.tipo === 'Variable') {
      const info = buscar(d.nombre);
      const antes = fallas;
      let v = ex(e.valor);
      if (e.op !== '=') v = binop(e, e.op[0], info.cn, info.tipo, v, tipoDe(e.valor), t);
      L(`${info.cn} = ${conv(v, e.op !== '=' ? t : tipoDe(e.valor), info.tipo)};`);
      comprobar(antes);
      return;
    }
    const info = M.arrDe.get(d.obj);
    const tj = tmp('ent');
    const elem = info.arr;
    const tv = tmp(e.op === '=' ? (elem === 'real' ? 'real' : 'ent') : t);
    const antes = fallas;
    L(`${tj} = ${ex(d.indice)};`);
    let v = ex(e.valor);
    let tvTipo = tipoDe(e.valor);
    if (e.op !== '=') {
      const lee = `(${enRango(tj, info.cnN)} ? ${info.cn}[${tj}] : ${FALLA(M.sitio(d, 'idx'))})`;
      v = binop(e, e.op[0], lee, elem, v, tvTipo, t);
      tvTipo = t;
    }
    L(`${tv} = ${elem === 'real' ? aReal(v, tvTipo) : v};`);
    comprobar(antes);
    L(`if (!${enRango(tj, info.cnN)}) ${FALLA_S(M.sitio(d, 'idx'))}`);
    L(`${info.cn}[${tj}] = ${elem === 'real' ? tv : guardarEnt(tv)};`);
  }
  function sumarAtomico(e) {
    const info = M.arrDe.get(e.args[0]);
    const tj = tmp('ent'), tv = tmp(info.arr === 'real' ? 'real' : 'ent');
    const antes = fallas;
    L(`${tj} = ${ex(e.args[1])};`);
    L(`${tv} = ${info.arr === 'real' ? aReal(ex(e.args[2]), tipoDe(e.args[2])) : ex(e.args[2])};`);
    comprobar(antes);
    L(`if (!${enRango(tj, info.cnN)}) ${FALLA_S(M.sitio(e, 'idx'))}`);
    if (js) L(`${info.cn}[${tj}] += ${tv};`);
    else if (cu) L(info.arr === 'real' ? `atomicAdd(&${info.cn}[${tj}], ${tv});` : `atomicAdd(&${info.cn}[${tj}], (int)(unsigned int)(unsigned long long)${tv});`);
    else {
      L('#pragma omp atomic');
      L(info.arr === 'real' ? `${info.cn}[${tj}] += ${tv};` : `*(uint32_t*)&${info.cn}[${tj}] += (uint32_t)(uint64_t)${tv};`);
    }
  }

  scopes = [new Map()];
  for (const p of M.params) scopes[0].set(p.nombre, p);
  // La copia de los parámetros escalares a sus locales.
  for (const p of M.params) if (!p.arr) L(`${p.cn} = ${conv(p.entrada, p.tipoEntrada, p.tipo)};`);
  bloque(M.ast);
  const cuerpo = lineas.join('\n');

  // ── el envoltorio de cada destino ──
  const firmaCuerpo = [], llamada0 = [], firmaNucleo = [], desemp = [];
  M.params.forEach((p, k) => {
    if (p.arr) {
      const ty = p.arr === 'real' ? 'double' : (cu ? 'int' : 'int32_t');
      firmaCuerpo.push(`${ty}* ${p.cn}`, `${TY.ent} ${p.cnN}`);
      llamada0.push(p.cn, p.cnN);
      firmaNucleo.push(`${ty}* ${p.cn}`, `${TY.ent} ${p.cnN}`);
      desemp.push(`*(${ty}**)p[${desemp.length}]`, `*(long long*)p[${desemp.length + 1}]`);
    } else {
      const ty = p.tipoEntrada === 'real' ? 'double' : TY.ent;
      firmaCuerpo.push(`${ty} ${p.entrada}`);
      llamada0.push(k === 0 ? 'i' : p.entrada);
      if (k > 0) {
        firmaNucleo.push(`${ty} ${p.entrada}`);
        desemp.push(`*(${ty === 'double' ? 'double' : 'long long'}*)p[${desemp.length}]`);
      }
    }
  });
  const locales = [];
  for (const p of M.params) if (!p.arr) locales.push([p.cn, p.tipo]);
  for (const v of M.vars) locales.push([v.cn, v.tipo]);
  for (const [nm, t] of temps) locales.push([nm, t]);

  if (js) {
    const decl = locales.map(([nm, t]) => `${nm} = ${t === 'bool' ? 'false' : '0'}`);
    const sinN = firmaCuerpo.slice(1).map(s => s.split(' ').pop());
    return `(function () {\n` +
      `  ${c1enMezclar.toString()}\n  ${c1enAzar.toString()}\n` +
      `  // C1EÑ — «${M.nombre}» (línea ${M.linea}), destino jit\n` +
      `  function cuerpo(${['p0'].concat(sinN).join(', ')}) {\n` +
      `    let f = 0, vueltas = 0;\n` + (decl.length ? `    let ${decl.join(', ')};\n` : '') +
      cuerpo.split('\n').map(l => '  ' + l).join('\n') + `\n    return 0;\n  }\n` +
      `  return function nucleo(n${sinN.length ? ', ' + sinN.join(', ') : ''}) {\n` +
      `    for (let i = 0; i < n; i++) {\n` +
      `      const c = cuerpo(i${sinN.length ? ', ' + sinN.join(', ') : ''});\n` +
      `      if (c !== 0) return [i, c];\n` +
      `      }\n    return null;\n  };\n})()`;
  }
  // En JavaScript el primer hilo que falla es el de índice más bajo porque se
  // recorren en orden, así que se puede parar ahí. En C y en CUDA los hilos
  // corren a la vez y se elige el más bajo con la clave (i << 24 | sitio).
  const decl = locales.map(([nm, t]) => `  ${TY[t]} ${nm} = 0;`).join('\n');
  const titulo = `/* C1EÑ — generado desde la función «${M.nombre}» (línea ${M.linea}).\n` +
    (cu ? '   Compilar con NVRTC: --fmad=false -arch=compute_75 (sin FMA: mismos bits que la CPU). */\n'
      : '   Compilar con: gcc -O2 -shared -fPIC -ffp-contract=off [-fopenmp] (sin FMA). */\n');
  const cab = (cu ? C1EN_CABECERA_CUDA : C1EN_CABECERA_C) + C1EN_PRELUDIO;
  const fCuerpo = `${cu ? 'static __device__ ' : 'static '}${TY.ent} c1en_cuerpo(${firmaCuerpo.join(', ')}) {\n` +
    `  ${TY.ent} f = 0, vueltas = 0;\n${decl}\n${cuerpo}\n  (void)vueltas;\n  return 0;\n}\n`;
  if (!cu) {
    return titulo + cab + '\n' + fCuerpo + '\n' +
      `void c1en_nucleo(int64_t n${firmaNucleo.length ? ', ' + firmaNucleo.join(', ') : ''}, uint64_t* c1en_err) {\n` +
      // Reparto dinámico en trozos de 256: en un mandelbrot unos hilos dan 3
      // vueltas y otros 500, y con trozos fijos un núcleo de la CPU acaba
      // mucho antes que el otro. No cambia ningún resultado: cada índice se
      // calcula igual lo haga quien lo haga.
      `#pragma omp parallel for schedule(dynamic, 256) if (n > 2048)\n` +
      `  for (int64_t i = 0; i < n; i++) {\n` +
      `    int64_t c = c1en_cuerpo(${llamada0.join(', ')});\n` +
      `    if (c != 0) {\n      uint64_t k = ((uint64_t)i << 24) | (uint64_t)c;\n` +
      `#pragma omp critical (c1en_err)\n      { if (k < c1en_err[0]) c1en_err[0] = k; }\n    }\n  }\n}\n`;
  }
  const todosDesemp = ['*(long long*)p[0]'].concat(desemp.map(s => s.replace(/p\[(\d+)\]/, (_, q) => `p[${+q + 1}]`)))
    .concat([`*(unsigned long long**)p[${desemp.length + 1}]`]).join(', ');
  return titulo + cab + '\n' + fCuerpo + '\n' +
    `extern "C" __global__ void c1en_nucleo(long long n${firmaNucleo.length ? ', ' + firmaNucleo.join(', ') : ''}, unsigned long long* c1en_err) {\n` +
    `  for (long long i = (long long)blockIdx.x * blockDim.x + threadIdx.x; i < n; i += (long long)blockDim.x * gridDim.x) {\n` +
    `    long long c = c1en_cuerpo(${llamada0.join(', ')});\n` +
    `    if (c != 0) atomicMin(c1en_err, ((unsigned long long)i << 24) | (unsigned long long)c);\n  }\n}\n` +
    c1enEmulador('c1en_nucleo', todosDesemp);
}

if (typeof module !== 'undefined') module.exports = { instalarNenC1en };
