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
//      (motor-exp N3) La única excepción es a propósito y en los tres a la
//      vez: el producto de matrices de NEÑ (nen_dgemm) llama a fma() de forma
//      EXPLÍCITA en C y en CUDA, y JavaScript la emula exacta (nenFma). Ninguna
//      bandera cambia: lo generado por «paralelo» sigue sin FMA.
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
  // (motor-exp N4.4) el modelo de la GPU, en los núcleos de paraleloBloques
  barrera: 0, hilosPorBloque: 0, numeroBloques: 0, compartido: 1, compartidoEntero: 1,
  // (motor-exp N4.5) las operaciones de bits de C, sobre los enteros del núcleo
  // (64 bits con signo); el resultado tiene que caber exacto en un número de Ñ
  bitsY: 2, bitsO: 2, bitsXor: 2, bitsNo: 1, desplazarIzq: 2, desplazarDer: 2,
};
// (motor-exp N4.5) «&», «|» y «^» en JavaScript: con enteros de 32 bits, los
// operadores de siempre (dan lo mismo que en 64); si no, con BigInt. NaN si el
// resultado no cabe exacto en un número de Ñ (más de 2^53), y el núcleo falla.
function c1enBits(op, a, b) {
  if ((a | 0) === a && (b | 0) === b) return op === 0 ? a & b : op === 1 ? a | b : a ^ b;
  const x = BigInt(a), y = BigInt(b);
  const r = op === 0 ? x & y : op === 1 ? x | y : x ^ y;
  return r >= -9007199254740992n && r <= 9007199254740992n ? Number(r) : NaN;
}
const C1EN_BITS = { bitsY: 0, bitsO: 1, bitsXor: 2, bitsNo: 3, desplazarIzq: 4, desplazarDer: 5 };
const C1EN_TRASC = { exp: 'exp', log: 'log', log10: 'log10', seno: 'sin', coseno: 'cos', tangente: 'tan',
  arcoseno: 'asin', arcocoseno: 'acos', arcotangente: 'atan' };
const C1EN_TRASC_JS = { exp: 'Math.exp', log: 'Math.log', log10: 'Math.log10', seno: 'Math.sin', coseno: 'Math.cos',
  tangente: 'Math.tan', arcoseno: 'Math.asin', arcocoseno: 'Math.acos', arcotangente: 'Math.atan' };
const C1EN_LISTA = 'raiz, exp, log, log10, seno, coseno, tangente, arcoseno, arcocoseno, arcotangente, ' +
  'angulo, absoluto, piso, techo, minimo, maximo, entero, real, longitud, tamano, azarHilo y sumarAtomico' +
  ' (y en paraleloBloques: barrera, hilosPorBloque, numeroBloques, compartido y compartidoEntero;' +
  ' y de bits: bitsY, bitsO, bitsXor, bitsNo, desplazarIzq y desplazarDer)';

function instalarNenC1en(vm, def, host) {
  const c1en = crearC1en(vm);
  vm.c1en = c1en;

  // ── (motor-exp N4.3) trabajo asíncrono en la GPU ───────────────────────────
  // Una COLA es una fila de trabajo de la GPU (un CUstream): lo que se lanza en
  // ella va en orden, sin que la CPU espere, y dos colas pueden avanzar a la vez
  // (una copia mientras la otra calcula). El orden entre colas lo pone C1EÑ solo
  // (ver «COLAS» arriba). En jit y nativo una cola existe igual, pero todo corre
  // en el acto: el mismo programa vale en los tres dispositivos.
  const exigeCola = (v, k, f) => {
    if (!(v instanceof ObjOpaco) || v.clase !== 'cola') vm.error(`«${f}»: el argumento ${k} debe ser una cola (de colaGpu()) y es ${tipoDe(v)}`);
    if (!v.cola.viva) vm.error(`«${f}»: esa cola ya se soltó`, 'crea otra con colaGpu()');
    return v.cola;
  };
  def('colaGpu', ' -> cualquiera', () => new ObjOpaco('cola', null, { cola: c1en.nuevaCola() }),
    'colaGpu() — una cola de trabajo de la GPU: lo que se lance en ella con enCola no hace esperar a la CPU');
  def('enCola', 'cualquiera, funcion -> cualquiera', a => {
    const c = exigeCola(a[0], 1, 'enCola');
    vm.exigeFuncion(a[1], 2, 'enCola');
    return c1en.conCola(c, () => vm.invocar(a[1], []));
  }, 'enCola(c, fn() { … }) — lo que la función lance en la GPU va a la cola c y la CPU sigue sin esperar; devuelve lo que devuelva la función');
  def('esperarCola', 'cualquiera -> nulo', a => { c1en.esperarCola(exigeCola(a[0], 1, 'esperarCola')); return null; },
    'esperarCola(c) — la CPU espera a que la cola termine; si un núcleo de la cola falló, el error sale aquí');
  def('colaLista', 'cualquiera -> bool', a => c1en.colaLista(exigeCola(a[0], 1, 'colaLista')),
    'colaLista(c) — si la cola ya terminó todo, sin esperar');
  def('soltarCola', 'cualquiera -> nulo', a => { c1en.soltarCola(exigeCola(a[0], 1, 'soltarCola')); return null; },
    'soltarCola(c) — espera a que termine y la libera');
  def('promesaCola', 'cualquiera -> cualquiera', a => {
    // Una promesa que se cumple cuando la cola termina: dentro de una función
    // asíncrona, «esperar promesaCola(c)» deja correr otras cosas mientras tanto.
    const c = exigeCola(a[0], 1, 'promesaCola');
    const p = vm.registrar(new ObjPromesa());
    // se mira desde el bucle de eventos, siempre (también en jit y nativo, donde
    // ya terminó): así el orden de lo que pasa es el mismo en los tres
    const luego = f => host.tiempo.luego(1, new ObjNativa(' mirarCola', 0, () => { f(); return null; }), vm);
    const mirar = () => {
      if (c.viva && !c1en.colaLista(c)) { luego(mirar); return; }
      try { if (c.viva) c1en.esperarCola(c); vm.cumplir(p, null, true); }
      catch (e) { vm.cumplir(p, new ObjError('motor', e.message || String(e), e.linea || 0), false); }
    };
    if (host && host.tiempo) luego(mirar);
    else { c1en.esperarCola(c); vm.cumplir(p, null, true); }
    return p;
  }, 'promesaCola(c) — una promesa que se cumple cuando la cola termina: «esperar promesaCola(c)»');
  def('subirGpu', 'arreglo -> arreglo', a => {
    const x = a[0];
    if (!(x instanceof ObjArreglo)) vm.error(`«subirGpu»: el argumento 1 debe ser un arreglo y es ${tipoDe(x)}`);
    c1en.subir(x);
    return x;
  }, 'subirGpu(a) — sube el arreglo a la GPU ya, en la cola actual, sin esperar: para que esté allí cuando lo use un núcleo (copiar mientras se calcula)');
  def('medirGpu', 'funcion -> real', a => {
    vm.exigeFuncion(a[0], 1, 'medirGpu');
    return c1en.medir(() => vm.invocar(a[0], []));
  }, 'medirGpu(fn() { … }) — los milisegundos que tarda en la GPU lo que la función lanza (con eventos de CUDA); en jit y nativo, el reloj');

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

  // (motor-exp N4.4) el modelo de la GPU: bloques, hilos, memoria compartida y barreras
  def('paraleloBloques', '... -> nulo', a => {
    if (a.length < 3) vm.error('«paraleloBloques» necesita los bloques, los hilos por bloque y la función',
      'paraleloBloques(bloques, hilos, funcion(b, t, a) { … }, a)');
    vm.exigeFuncion(a[2], 3, 'paraleloBloques');
    c1en.paraleloBloques(a[0], a[1], a[2], a.slice(3), 'paraleloBloques');
    return null;
  }, 'paraleloBloques(bloques, hilos, funcion(b, t, …) { … }, …) — la cuadrícula de la GPU a la vista: «b» es el bloque, «t» el hilo dentro del bloque; dentro, compartido(n), barrera(), hilosPorBloque() y numeroBloques()');
  const soloNucleo = nombre => () => vm.error(`«${nombre}» solo tiene sentido dentro de un núcleo de paraleloBloques`,
    'paraleloBloques(bloques, hilos, funcion(b, t, …) { … barrera() … }, …)');
  def('barrera', ' -> nulo', soloNucleo('barrera'), 'barrera() — dentro de un núcleo de bloques: cada hilo espera a que todos los del bloque lleguen (__syncthreads)');
  def('hilosPorBloque', ' -> entero', soloNucleo('hilosPorBloque'), 'hilosPorBloque() — dentro de un núcleo de bloques: cuántos hilos tiene cada bloque');
  def('numeroBloques', ' -> entero', soloNucleo('numeroBloques'), 'numeroBloques() — dentro de un núcleo de bloques: cuántos bloques tiene la cuadrícula');
  def('compartido', 'entero -> cualquiera', soloNucleo('compartido'), 'fijo s = compartido(256) — dentro de un núcleo de bloques: memoria del bloque, que ven todos sus hilos (empieza a cero)');
  def('compartidoEntero', 'entero -> cualquiera', soloNucleo('compartidoEntero'), 'fijo s = compartidoEntero(256) — como compartido, de enteros');

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
    if (!(x instanceof ObjArreglo) || (x.tipo !== 'real' && x.tipo !== 'entero' && x.tipo !== 'real32'))
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
const porLiberar = [];                       // [d, gpu, bytes] pendientes de liberar
const finalizador = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry(({ d, gpu, bytes }) => porLiberar.push([d, gpu, bytes])) : null;
// (motor-exp N2) Memoria de la GPU que se devuelve y se vuelve a pedir. Un
// programa de NEÑ crea un arreglo nuevo en cada operación (y = senoA(x) * 2…),
// y cuMemAlloc + cuMemFree por cada uno cuesta más que el núcleo. Lo que se
// suelta se guarda por tamaño exacto y por GPU, hasta C1EN_POOL_MB (1024 si no
// se dice); lo que pase de ahí se libera de verdad.
const poolGpu = new Map();                   // gpu → Map(bytes → [d…])
let poolBytes = 0;
const POOL_MAX = (typeof process !== 'undefined' && process.env && Number(process.env.C1EN_POOL_MB) >= 0 && process.env.C1EN_POOL_MB !== undefined
  && process.env.C1EN_POOL_MB !== '') ? Number(process.env.C1EN_POOL_MB) * 1048576 : 1024 * 1048576;
// Los registros de residentes que usa el lanzamiento en curso: si falta memoria
// a mitad de un lanzamiento, a esos no se les puede bajar ni soltar.
const enUso = new Set();
// (motor-exp N4.3) COLAS. Todo lo de la GPU va a una cola (un CUstream): la de
// siempre por GPU (la «legacy», null) o una que el programa creó con colaGpu().
// Mientras solo existe la de siempre, el orden lo da ella sola y no hace falta
// nada más; en cuanto hay colas, cada arreglo residente recuerda qué cola lo
// escribió por última vez («esc») y cuáles lo leen («lectores»), y un núcleo en
// otra cola espera a esas con un evento (cuStreamWaitEvent): sin parar a la CPU
// y sin que el programa tenga que pensar en carreras. Cada cola tiene un evento
// que se vuelve a marcar tras cada cosa que se le encola.
const colasLegado = new Map();               // gpu → la cola de siempre
let colasVivas = 0;                          // colas creadas y no soltadas
const colaLegado = g => { let c = colasLegado.get(g); if (!c) { c = { s: null, gpu: g, ev: null, pendientes: [], legado: true }; colasLegado.set(g, c); } return c; };

// ============================================================================
//  El motor: compilar, elegir dispositivo y lanzar
// ============================================================================
function crearC1en(vm) {
  // El dispositivo se decide la primera vez que alguien pregunta. Lo que manda,
  // en orden: la variable de entorno C1EN_DISPOSITIVO; si no, el mejor que haya
  // (gpu, luego nativo, luego jit).
  let actual = null;
  let indiceGpu = 0;
  // (motor-exp N4.3) la cola en la que se encola lo que se lance ahora
  let colaActual = null;
  const colaUsada = () => (colaActual && !colaActual.logica && colaActual.gpu === indiceGpu ? colaActual : colaLegado(indiceGpu));
  const conColas = cu => cu.asincrono && colasVivas > 0;
  function eventoDe(cu, c) { if (!c.ev) c.ev = cu.nuevoEvento(false); return c.ev; }
  // tras encolar algo en «c»: su evento marca hasta aquí
  function trasEncolar(cu, c) { if (conColas(cu)) cu.marcar(eventoDe(cu, c), c.s); }
  // antes de que la cola «c» use el arreglo: que espere a las otras colas que lo
  // escribieron (si lo va a leer) o que lo usan (si lo va a escribir)
  function usar1(cu, reg, c, escribe) {
    if (conColas(cu)) {
      const otras = new Set();
      if (reg.esc && reg.esc !== c) otras.add(reg.esc);
      if (escribe && reg.lectores) for (const t of reg.lectores) if (t !== c) otras.add(t);
      for (const t of otras) if (t.ev) cu.colaEspera(c.s, t.ev);
    }
    if (escribe) { reg.esc = c; reg.lectores = new Set([c]); }
    else { if (!reg.lectores) reg.lectores = new Set(); reg.lectores.add(c); }
  }
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
  function prepararArreglo(x, quien, k, paraGpu, complejoOk) {
    // (motor-exp N3) los núcleos de biblioteca (vm.c1en.kernel) aceptan un
    // arreglo complejo en un parámetro f64*: lo ven como sus 2n reales
    // entrelazados (re, im). Así la FFT trabaja sobre el resultado de
    // «fourier» y este se queda residente en la GPU. Los de «paralelo», no.
    const w = x.tipo === 'complejo' && complejoOk ? 2 : 1;
    // (motor-exp N4.2) real32 (y real16, en los núcleos de biblioteca) entran como float*
    if (x.tipo !== 'real' && x.tipo !== 'entero' && x.tipo !== 'real32' && x.tipo !== 'real16' && !C1EN_ENT_C[x.tipo] && w === 1)
      vm.error(`«${quien}»: el argumento ${k} es un arreglo de tipo ${x.tipo}, y en un núcleo solo entran arreglos real, real32, entero o enteros de máquina de hasta 32 bits`,
        x.tipo === 'bool' ? 'conviértelo con aTipo(a, "entero")' : (x.tipo === 'i64' || x.tipo === 'u64') ? 'los de 64 bits todavía no: pásalo a "real" (exacto hasta 2^53) o parte el número en dos u32'
          : 'separa la parte real y la imaginaria en dos arreglos reales');
    const z = zancadasDe(x.forma);
    let contiguo = true;
    for (let d = 0; d < z.length; d++) if (x.forma[d] > 1 && z[d] !== x.zancadas[d]) contiguo = false;
    const n = x.tamano * w;
    if (w === 2) {
      if (!contiguo) vm.error(`«${quien}»: el argumento ${k} es una vista compleja con zancadas; aquí entra seguido`);
      return paraGpu && x.base === null ? { vista: x._d.subarray(2 * x.desp, 2 * x.desp + n), devolver: null, residible: true }
        : { vista: x.datos.subarray(2 * x.desp, 2 * x.desp + n), devolver: null };
    }
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
    // (motor-exp N4.3) un arreglo que murió pudo dejar núcleos en otra cola
    if (porLiberar.length && conColas(cu)) cu.sincronizar();
    for (let i = porLiberar.length - 1; i >= 0; i--) {
      if (porLiberar[i][1] !== indiceGpu) continue;
      soltarMem(cu, porLiberar[i][0], porLiberar[i][2]);
      porLiberar.splice(i, 1);
    }
  }
  // ── (motor-exp N2) la memoria de la GPU, con reutilización ───────────────
  function poolDe(g) { let m = poolGpu.get(g); if (!m) { m = new Map(); poolGpu.set(g, m); } return m; }
  function vaciarPool(cu) {
    if (conColas(cu)) cu.sincronizar();
    const m = poolDe(indiceGpu);
    for (const [bytes, l] of m) for (const e of l) { try { cu.liberar(e.d); } catch (_) { /* nada */ } poolBytes -= bytes; }
    m.clear();
  }
  // (motor-exp N4.3) cada trozo guardado recuerda la cola que lo usó por última
  // vez: otra cola que lo reutilice espera antes a esa (con su evento)
  function soltarMem(cu, d, bytes, gpu, c) {
    if (bytes !== undefined) bytes = Math.max(8, bytes);      // como en reservarMem
    if (bytes && poolBytes + bytes <= POOL_MAX) {
      const m = poolDe(gpu === undefined ? indiceGpu : gpu);
      let l = m.get(bytes);
      if (!l) { l = []; m.set(bytes, l); }
      l.push({ d, c: c || null }); poolBytes += bytes;
      return;
    }
    try { cu.liberar(d); } catch (_) { /* nada */ }
  }
  // Pedir memoria. Si la GPU dice que no hay: primero se vacía la reserva y lo
  // pendiente de liberar; si aún no hay, se bajan a la CPU los arreglos
  // residentes que no están en uso (sus datos no se pierden: vuelven a la CPU)
  // y se intenta otra vez. Solo si así tampoco cabe, el error es de verdad.
  function reservarMem(cu, bytes, c) {
    bytes = Math.max(8, bytes);
    const l = poolDe(indiceGpu).get(bytes);
    if (l && l.length) {
      poolBytes -= bytes;
      let k = l.length - 1;
      if (c) for (let j = l.length - 1; j >= 0; j--) if (l[j].c === c) { k = j; break; }
      const e = l.splice(k, 1)[0];
      if (c && e.c && e.c !== c && e.c.ev && conColas(cu)) cu.colaEspera(c.s, e.c.ev);
      return e.d;
    }
    try { return cu.reservar(bytes); } catch (e1) {
      vaciarPool(cu); liberarPendientes(cu); vaciarPool(cu);
      try { return cu.reservar(bytes); } catch (e2) {
        if (typeof globalThis.gc === 'function') { globalThis.gc(); liberarPendientes(cu); vaciarPool(cu); try { return cu.reservar(bytes); } catch (_) { /* sigue */ } }
        for (const ref of [...vivos]) {
          const x = ref.deref();
          if (!x) { vivos.delete(ref); continue; }
          const reg = residentes.get(x);
          if (reg && !enUso.has(reg) && reg.gpu === indiceGpu) sincronizarHost(x, true, true);
        }
        vaciarPool(cu);
        return cu.reservar(bytes);
      }
    }
  }
  // Trae la copia de la GPU si está allí (y marca «tocado»); con soltar=true
  // además libera la memoria de la GPU y deja de ser residente.
  function sincronizarHost(x, soltar, deVerdad) {
    const reg = residentes.get(x);
    if (!reg) { x.residente = null; return; }
    const cu = c1enCuda();
    const otraGpu = reg.gpu !== indiceGpu;
    try {
      if (otraGpu) cu.usar(reg.gpu);
      if (reg.enGpu) {
        const w = x.tipo === 'complejo' ? 2 : 1;           // (motor-exp N3) los complejos son 2n reales
        const vista = x._d.subarray(w * x.desp, w * (x.desp + x.tamano));
        // (motor-exp N4.3) baja en la cola que lo escribió: espera a que termine
        if (vista.byteLength === reg.bytes) cu.bajar(vista, reg.d, reg.esc ? reg.esc.s : null);
        reg.enGpu = false;
      }
      if (soltar) {
        if (conColas(cu) && reg.lectores) for (const t of reg.lectores) if (t.s) cu.esperarCola(t.s);
        if (deVerdad) cu.liberar(reg.d); else soltarMem(cu, reg.d, reg.bytes, reg.gpu, reg.esc); reg.d = null;
      }
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
    if (cu) {
      liberarPendientes(cu);
      // (motor-exp N2) y la reserva de memoria reutilizable, en todas las GPU
      const antes = indiceGpu;
      for (const g of [...poolGpu.keys()]) {
        if (!poolGpu.get(g).size) continue;
        try { if (g !== antes) cu.usar(g); indiceGpu = g; vaciarPool(cu); }
        finally { indiceGpu = antes; if (g !== antes) cu.usar(antes); }
      }
    }
  }
  // Deja el arreglo residente en la GPU actual con los datos al día y devuelve
  // el puntero de dispositivo.
  // (motor-exp N2) «sinSubir»: el núcleo va a escribir el arreglo entero sin
  // leerlo, así que lo que hay en la CPU no hace falta subirlo.
  function asegurarResidente(x, vista, cu, sinSubir, c, escribe) {
    c = c || colaUsada();
    let reg = residentes.get(x);
    if (reg && (reg.gpu !== indiceGpu || reg.bytes !== vista.byteLength)) { sincronizarHost(x, true); reg = null; }
    if (!reg) {
      const d = reservarMem(cu, vista.byteLength, c);
      reg = { d, bytes: vista.byteLength, gpu: indiceGpu, enGpu: false, tocado: true };
      residentes.set(x, reg);
      reg.ref = new WeakRef(x);
      vivos.add(reg.ref);
      x.residente = soltar => sincronizarHost(x, soltar === true);
      if (finalizador) finalizador.register(x, { d, gpu: indiceGpu, bytes: reg.bytes }, x);
    }
    enUso.add(reg);
    // subir es escribir en la GPU: espera a las colas que aún lo leen
    if (reg.tocado) { usar1(cu, reg, c, true); if (!sinSubir) cu.subir(reg.d, vista, c.s); reg.tocado = false; }
    usar1(cu, reg, c, escribe !== false);
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
      // (motor-exp N4.2) un real32 entra como float*: se lee en double, se calcula en
      // double y se guarda redondeado a float, igual en jit, nativo y GPU. Un real16
      // todavía no (habría que redondear cada escritura a 16 bits dentro del núcleo).
      if (v.tipo === 'real16')
        vm.error(`«${quien}»: «${nombre}» es un arreglo real16, y en «paralelo» todavía no entran`,
          'pásalo a real32 con aTipo(a, "real32"), y de vuelta con aTipo(r, "real16")');
      // (motor-exp N4.5) los enteros de máquina de hasta 32 bits entran con su tipo de C
      if (C1EN_ENT_C[v.tipo]) return `${v.tipo}*`;
      return v.tipo === 'entero' ? 'i32*' : (v.tipo === 'real' ? 'f64*' : (v.tipo === 'real32' ? 'f32*' : 'otro*'));
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
  function modeloDe(cierre, tipos, quien, bloques) {
    const fn = cierre.fn;
    let m = cache.get(fn);
    if (!m) { m = new Map(); cache.set(fn, m); }
    const clave = (bloques ? 'B:' : '') + tipos.join(',');
    let r = m.get(clave);
    if (!r) {
      r = { modelo: c1enAnalizar(vm, cierre, tipos, quien, bloques), js: null, c: null, cuda: null, fnNativa: null, gpu: new Map() };
      m.set(clave, r);
    }
    return r;
  }

  function tiposParaLlamada(cierre, args, quien, nIdx) {
    nIdx = nIdx || 1;
    const fn = cierre.fn;
    const ast = fn.ast;
    if (!ast || fn.deDisco)
      vm.error(`«${quien}»: esta función vino de bytecode y no trae su código fuente, así que no se puede compilar`,
        'C1EÑ compila desde el árbol sintáctico, igual que el JIT');
    if (fn.aridad !== args.length + nIdx)
      vm.error(nIdx === 1
        ? `«${quien}»: la función recibe ${fn.aridad} parámetro(s) y le llegan ${args.length + 1} (el índice y ${args.length} argumento(s))`
        : `«${quien}»: la función recibe ${fn.aridad} parámetro(s) y le llegan ${args.length + 2} (el bloque, el hilo y ${args.length} argumento(s))`,
      nIdx === 1 ? 'el primer parámetro es siempre el índice del hilo: funcion(i, a, b) con paralelo(n, f, a, b)'
        : 'los dos primeros son el bloque y el hilo dentro del bloque: funcion(b, t, a, x) con paraleloBloques(bloques, hilos, f, a, x)');
    return args.map((v, k) => tipoDeArg(v, ast.params[k + nIdx].anotacion, quien, k + 2 + nIdx, ast.params[k + nIdx].nombre));
  }

  function lanzarError(modelo, i, codigo, quien, nh) {
    const s = modelo.sitios[codigo] || { linea: '?', texto: 'fallo desconocido' };
    const quienHilo = nh ? `el hilo ${i % nh} del bloque ${Math.floor(i / nh)}` : `el hilo i = ${i}`;   // (motor-exp N4.4)
    vm.error(`«${quien}»: ${quienHilo} falló en la línea ${s.linea}: ${s.texto}`, s.pista || null);
  }

  // ── (motor-exp N4.4) el modelo de la GPU en manos del programa ─────────────
  function paraleloBloques(nb, nh, cierre, args, quien) {
    if (!Number.isInteger(nb) || nb < 0) vm.error(`«${quien}»: los bloques son un entero no negativo y llegó ${repr(nb, 1)}`);
    if (!Number.isInteger(nh) || nh < 1 || nh > 1024)
      vm.error(`«${quien}»: los hilos por bloque van de 1 a 1024 y llegó ${repr(nh, 1)}`, 'es el tope de una GPU; lo usual es 128, 256 o 512');
    if (nb * nh > C1EN_MAX_HILOS) vm.error(`«${quien}»: ${nb} × ${nh} hilos son demasiados; el máximo es 2^40`);
    if (!(cierre instanceof ObjCierre)) vm.error(`«${quien}»: el núcleo tiene que ser una función de Ñ, no una de la biblioteca`);
    const tipos = tiposParaLlamada(cierre, args, quien, 2);
    tipos.forEach((t, k) => { if (t === 'otro*') prepararArreglo(args[k], quien, k + 4); });
    const r = modeloDe(cierre, tipos, quien, true);
    elegirInicial();
    vm.cobrar(nb * nh);
    if (nb === 0) return;
    const preps = [], arrs = [];
    args.forEach((v, k) => {
      if (v instanceof ObjArreglo) { arrs.push({ x: v, k: k + 4 }); preps[k] = prepararArreglo(v, quien, k + 4, actual === 'gpu'); }
    });
    exigirSinSolape(arrs, quien);
    const geo = { nb, nh };
    let fallo = null;
    try {
      if (actual === 'jit') fallo = correrJS(r, nb * nh, args, preps, geo);
      else if (actual === 'nativo') fallo = correrNativo(r, nb * nh, args, preps, quien, geo);
      else fallo = correrGpu(r, nb * nh, args, preps, quien, geo);
    } finally {
      for (const p of preps) if (p && p.devolver) p.devolver();
    }
    if (fallo && colaActual && colaActual.logica) { colaActual.errores.push([r.modelo, fallo, quien, nh]); return; }
    if (fallo) lanzarError(r.modelo, fallo[0], fallo[1], quien, nh);
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
    // (motor-exp N4.3) en una cola del programa en jit o nativo el núcleo ya
    // terminó, pero su fallo se guarda para esperarCola: así el mismo programa
    // dice el error en el mismo sitio en los tres dispositivos
    if (fallo && colaActual && colaActual.logica) { colaActual.errores.push([r.modelo, fallo, quien]); return; }
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

  function correrJS(r, n, args, preps, geo) {
    if (!r.js) {
      const src = c1enEmitir(r.modelo, 'js');
      // eslint-disable-next-line no-new-func
      r.js = new Function('"use strict"; return ' + src)();
    }
    if (geo) return r.js(geo.nb, geo.nh, ...expandir(args, preps, false));
    return r.js(n, ...expandir(args, preps, false));
  }

  function correrNativo(r, n, args, preps, quien, geo) {
    const na = c1enNativo();
    if (!r.fnNativa) {
      if (!r.c) r.c = c1enEmitir(r.modelo, 'c');
      const firma = geo ? ['int64_t nb', 'int64_t nh'] : ['int64_t n'];
      for (const p of r.modelo.params.slice(geo ? 2 : 1)) {
        if (p.arr) { firma.push(`${c1enTipoElem(p, false)} *`); firma.push('int64_t'); }
        else firma.push(p.tipoEntrada === 'real' ? 'double' : 'int64_t');
      }
      firma.push('uint64_t *');
      try { r.fnNativa = na.compilar(r.c, [{ nombre: 'c1en_nucleo', firma: `void c1en_nucleo(${firma.join(', ')})` }]).c1en_nucleo; }
      catch (e) { vm.error(`«${quien}»: no se pudo compilar el núcleo en C: ${e.message}`, 'esto es un fallo de C1EÑ, no de tu programa: avísalo con el código de codigoC(f)'); }
    }
    const err = new BigUint64Array([0xffffffffffffffffn]);
    if (geo) r.fnNativa(geo.nb, geo.nh, ...expandir(args, preps, true), err);
    else r.fnNativa(n, ...expandir(args, preps, true), err);
    return c1enLeerClave(err[0]);
  }

  // En la GPU: reservar, subir, lanzar, sincronizar, bajar, liberar. En la v1
  // todo arreglo es de ida y vuelta; el día que haga falta se marcan los de
  // solo lectura y se ahorra la bajada.
  function correrGpu(r, n, args, preps, quien, geo) {
    const cu = c1enCuda();
    let fun = r.gpu.get(indiceGpu);
    if (!fun) {
      if (!r.cuda) r.cuda = c1enEmitir(r.modelo, 'cuda');
      try { fun = cu.compilar(r.cuda, ['c1en_nucleo']).c1en_nucleo; }
      catch (e) { vm.error(`«${quien}»: no se pudo compilar el núcleo para la GPU: ${e.message}`, 'esto es un fallo de C1EÑ, no de tu programa: avísalo con el código de codigoCuda(f)'); }
      r.gpu.set(indiceGpu, fun);
    }
    const lanz = geo ? [{ t: 'i64', v: geo.nb }, { t: 'i64', v: geo.nh }] : [{ t: 'i64', v: n }];
    const memorias = [];
    const bajadas = [];
    const residentesAqui = [];
    const err = new BigUint64Array([0xffffffffffffffffn]);
    // (motor-exp N4.3) Dentro de una cola del programa (enCola) el núcleo NO se
    // espera: su palabra de error es suya (un trozo de 8 bytes de la reserva) y se
    // mira al esperar la cola, que es cuando se dice el fallo, si lo hubo. En la
    // cola de siempre se mira enseguida, como antes: el error sale en su línea.
    const c = colaUsada();
    const diferir = !c.legado;
    let de = null;
    try {
      liberarPendientes(cu);
      args.forEach((v, k) => {
        if (v instanceof ObjArreglo) {
          const vista = preps[k].vista;
          if (preps[k].residible) {
            const reg = asegurarResidente(v, vista, cu, false, c, true);
            residentesAqui.push(reg);
            lanz.push({ t: 'ptr', v: reg.d }, { t: 'i64', v: vista.length });
          } else {
            const d = reservarMem(cu, vista.byteLength, c);
            memorias.push([d, Math.max(8, vista.byteLength)]);
            cu.subir(d, vista, c.s);
            bajadas.push([vista, d]);
            lanz.push({ t: 'ptr', v: d }, { t: 'i64', v: vista.length });
          }
        } else if (typeof v === 'boolean') lanz.push({ t: 'i64', v: v ? 1 : 0 });
        else lanz.push({ t: r.modelo.params[k + (geo ? 2 : 1)].tipoEntrada === 'real' ? 'f64' : 'i64', v });
      });
      if (diferir) { de = reservarMem(cu, 8, c); cu.subir(de, err, c.s); }
      else {
        de = errGpu(cu);
        if (!errLimpio.get(indiceGpu)) { cu.subir(de, err, null); errLimpio.set(indiceGpu, true); }
      }
      lanz.push({ t: 'ptr', v: de });
      // desde aquí la copia buena de los residentes está en la GPU, pase lo que pase
      for (const reg of residentesAqui) reg.enGpu = true;
      if (geo) cu.lanzar(fun, geo.nb, geo.nh, lanz, c.s);      // (motor-exp N4.4) la cuadrícula que pidió el programa
      else cu.lanzar(fun, c1enBloques(n, cu), C1EN_HILOS_BLOQUE, lanz, c.s);
      trasEncolar(cu, c);
      for (const [vista, d] of bajadas) cu.bajar(vista, d, c.s);
      if (diferir && !bajadas.length) { c.pendientes.push({ de, r, quien, nh: geo ? geo.nh : 0 }); de = null; return null; }
      cu.bajar(err, de, c.s);
      if (!diferir && err[0] !== 0xffffffffffffffffn) errLimpio.set(indiceGpu, false);   // hay que volver a limpiarla
    } catch (e) {
      if (!diferir) errLimpio.set(indiceGpu, false);
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: la GPU falló: ${e.message}`);
    } finally {
      for (const [d, bytes] of memorias) soltarMem(cu, d, bytes, undefined, c);
      if (diferir && de !== null) soltarMem(cu, de, 8, undefined, c);
      enUso.clear();
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
    // (motor-exp N4.4) un núcleo que usa barrera, compartido o la cuadrícula es de paraleloBloques: (b, t, …)
    const bloques = c1enUsaBloques(fn.ast.cuerpo);
    const nIdx = bloques ? 2 : 1;
    if (ejemplos.length > ps.length - nIdx)
      vm.error(`«${quien}»: la función tiene ${ps.length - nIdx} parámetro(s) además de ${bloques ? 'el bloque y el hilo' : 'el índice'} y llegaron ${ejemplos.length} ejemplos`);
    // Sin ejemplo, el tipo sale de la anotación; sin anotación, de cómo se usa:
    // si se indexa es un arreglo real, y si no, un número real.
    const tipos = [];
    for (let k = nIdx; k < ps.length; k++) {
      if (k - nIdx < ejemplos.length) { tipos.push(tipoDeArg(ejemplos[k - nIdx], ps[k].anotacion, quien, k + 1, ps[k].nombre)); continue; }
      const an = ps[k].anotacion;
      if (an && an.k === 'entero') tipos.push('ent');
      else if (an && an.k === 'real') tipos.push('real');
      else if (an && an.k === 'bool') tipos.push('bool');
      else tipos.push(c1enSeIndexa(fn.ast, ps[k].nombre) ? 'f64*' : 'real');
    }
    if (tipos.includes('otro*')) vm.error(`«${quien}»: solo entran arreglos real o entero`);
    const r = modeloDe(cierre, tipos, quien, bloques);
    if (destino === 'c') return r.c || (r.c = c1enEmitir(r.modelo, 'c'));
    return r.cuda || (r.cuda = c1enEmitir(r.modelo, 'cuda'));
  }

  // ── núcleos de biblioteca ─────────────────────────────────────────────────
  // La interfaz para los autores de la biblioteca (NEÑ): el cuerpo ya viene
  // escrito en C —válido a la vez para C y para CUDA— con su respaldo en
  // JavaScript. Aquí no hay análisis: quien escribe un núcleo de biblioteca es
  // responsable de sus índices, igual que en CUDA.
  const TIPOS_K = { f64: ['double', 'double', 'double'], i64: ['int64_t', 'long long', 'int64_t'],
    i32: ['int32_t', 'int', 'int32_t'], 'f64*': ['double *', 'double*', 'double *'], 'i32*': ['int32_t *', 'int*', 'int32_t *'],
    // (motor-exp N4.2) arreglos real32 (y real16, que en la VM viven en un Float32Array)
    'f32*': ['float *', 'float*', 'float *'] };
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
      if (!TIPOS_K[pt]) throw new Error(`vm.c1en.kernel «${nombre}»: el tipo «${pt}» de «${pn}» no existe (f64, i64, i32, f64*, f32*, i32*)`);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(pn)) throw new Error(`vm.c1en.kernel «${nombre}»: «${pn}» no es un nombre de C`);
    }
    // (motor-exp N3) Un núcleo de biblioteca puede traer su FUENTE ENTERA en vez
    // de un cuerpo por índice: «cFuente» (una función de C con la firma de
    // params, que reparte el trabajo como quiera) y/o «cudaFuente» (un
    // __global__ con la firma de params, que puede usar __shared__ y
    // __syncthreads), con «lanzamiento(...args) → { bloques, hilos }» para la
    // cuadrícula. Con «coop: true» el simulador lo corre con hilos cooperativos
    // (las barreras funcionan). Así se escriben el DGEMM y la FFT de verdad.
    const { cFuente, cudaFuente, lanzamiento } = spec;
    if (typeof js !== 'function' || (typeof cuerpo !== 'string' && (typeof cFuente !== 'string' || typeof cudaFuente !== 'string')))
      throw new Error(`vm.c1en.kernel «${nombre}»: hacen falta «cuerpo» (C) —o «cFuente» y «cudaFuente»— y «js» (respaldo)`);
    if (cudaFuente !== undefined && typeof lanzamiento !== 'function')
      throw new Error(`vm.c1en.kernel «${nombre}»: con «cudaFuente» hace falta «lanzamiento(...args) → { bloques, hilos }»`);
    // (motor-exp N2) spec.lee / spec.escribe: los parámetros arreglo que el
    // núcleo solo lee, o que escribe enteros sin leerlos
    const lee = new Set(spec.lee || []), escribe = new Set(spec.escribe || []);
    for (const pn of [...lee, ...escribe])
      if (!params.some(([q, pt]) => q === pn && pt.endsWith('*'))) throw new Error(`vm.c1en.kernel «${nombre}»: «${pn}» en lee/escribe no es un parámetro arreglo`);
    const k = { nombre, params, cuerpo, js, c: null, cuda: null, fnNativa: null, gpu: new Map(), lee, escribe,
      cFuente, cudaFuente, lanzamiento, coop: !!spec.coop,
      // (motor-exp N3) desde cuántos índices se reparte entre los hilos de la
      // CPU: 2048 si cada índice es poco trabajo; un núcleo con índices
      // pesados (un trozo entero de FFT por índice) pide menos
      minParalelo: Number.isInteger(spec.minParalelo) && spec.minParalelo >= 0 ? spec.minParalelo : 2048 };
    nucleos.set(nombre, k);
    const lanzar = (...args) => lanzarKernel(k, args);
    lanzar.nucleo = k;
    return lanzar;
  }
  function fuenteKernel(k, destino) {
    const d = destino === 'cuda' ? 1 : 0;
    const ps = k.params.map(([pn, pt]) => `${TIPOS_K[pt][d]} ${pn}`).join(', ');
    const un0 = k.params.map(([, pt], j) => `*(${TIPOS_K[pt][1]}*)p[${j}]`).join(', ');
    if (destino === 'c' && k.cFuente) return C1EN_CABECERA_C + C1EN_PRELUDIO + '\n' + k.cFuente + '\n';
    if (destino === 'cuda' && k.cudaFuente) return C1EN_CABECERA_CUDA + C1EN_PRELUDIO + '\n' + k.cudaFuente + '\n' +
      (k.coop ? c1enEmuladorCoop(k.nombre, un0) : c1enEmulador(k.nombre, un0));
    if (destino === 'c') return C1EN_CABECERA_C + C1EN_PRELUDIO +
      `\nvoid ${k.nombre}(${ps}) {\n#pragma omp parallel for schedule(static) if (n > ${k.minParalelo})\n` +
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
    elegirInicial();
    // (motor-exp N2) En la GPU, un arreglo de Ñ seguido y dueño de su memoria
    // se queda RESIDENTE, como en «paralelo»: se sube una vez, el resultado se
    // queda allí, y solo baja cuando alguien lo lee desde la CPU. Así una cadena
    // de NEÑ (senoA, por, sumaEje…) no cruza el PCIe en cada paso.
    const paraGpu = actual === 'gpu';
    const plano = [];
    const preps = [];
    const devolver = [];
    const arrs = [];
    args.forEach((v, j) => {
      const pt = k.params[j][1];
      if (pt.endsWith('*')) {
        const ctor = pt === 'f64*' ? Float64Array : (pt === 'f32*' ? Float32Array : Int32Array);
        if (v instanceof ObjArreglo) {
          if ((pt === 'f64*' && v.tipo !== 'real' && v.tipo !== 'complejo') || (pt === 'i32*' && v.tipo !== 'entero') ||
              (pt === 'f32*' && v.tipo !== 'real32' && v.tipo !== 'real16'))
            vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» es un arreglo ${pt === 'f64*' ? 'real' : (pt === 'f32*' ? 'real32' : 'entero')} y llegó uno ${v.tipo}`);
          arrs.push({ x: v, k: j + 1 });
          const p = prepararArreglo(v, quien, j + 1, paraGpu, true);
          if (p.devolver) devolver.push(p.devolver);
          preps.push(p.residible ? { x: v, vista: p.vista } : null);
          plano.push(p.vista);
        } else if (v instanceof ctor) { plano.push(v); preps.push(null); }
        else vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» tiene que ser un arreglo y es ${tipoDe(v)}`);
      } else {
        if (typeof v !== 'number') vm.error(`el núcleo «${quien}»: «${k.params[j][0]}» tiene que ser un número y es ${tipoDe(v)}`);
        plano.push(v); preps.push(null);
      }
    });
    exigirSinSolape(arrs, quien);
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
      // Lo que el núcleo solo LEE no hace falta bajarlo; lo que solo ESCRIBE
      // (entero) no hace falta subirlo. Lo dice la especificación del núcleo
      // (spec.lee, spec.escribe); lo que no diga nada va y vuelve.
      // (motor-exp N4.3) en la cola actual y SIN esperar a que termine: lo que
      // queda residente sigue en la GPU, y la CPU solo espera si tiene que bajar
      // algo (un argumento que no podía quedarse) o cuando alguien lo lea.
      const c = colaUsada();
      const memorias = [], bajadas = [], lanz = [], escritos = [];
      try {
        liberarPendientes(cu);
        plano.forEach((v, j) => {
          const [pn, pt] = k.params[j];
          if (!pt.endsWith('*')) { lanz.push({ t: pt, v }); return; }
          const soloLee = k.lee.has(pn), soloEscribe = k.escribe.has(pn);
          if (preps[j]) {
            const reg = asegurarResidente(preps[j].x, preps[j].vista, cu, soloEscribe, c, !soloLee);
            if (!soloLee) escritos.push(reg);
            lanz.push({ t: 'ptr', v: reg.d });
            return;
          }
          const d = reservarMem(cu, v.byteLength, c);
          memorias.push([d, Math.max(8, v.byteLength)]);
          if (!soloEscribe) cu.subir(d, v, c.s);
          if (!soloLee) bajadas.push([v, d]);
          lanz.push({ t: 'ptr', v: d });
        });
        // desde aquí la copia buena de lo que el núcleo escribe está en la GPU
        for (const reg of escritos) reg.enGpu = true;
        if (k.lanzamiento) {
          const { bloques, hilos } = k.lanzamiento(...args.map(v => (typeof v === 'number' ? v : null)));
          cu.lanzar(fun, bloques, hilos, lanz, c.s);
        } else cu.lanzar(fun, c1enBloques(n, cu), C1EN_HILOS_BLOQUE, lanz, c.s);
        trasEncolar(cu, c);
        for (const [v, d] of bajadas) cu.bajar(v, d, c.s);
      } catch (e) {
        if (e instanceof ErrorTiempoEjecucion) throw e;
        vm.error(`el núcleo «${quien}»: la GPU falló: ${e.message}`);
      } finally {
        for (const [d, bytes] of memorias) soltarMem(cu, d, bytes, undefined, c);
        enUso.clear();
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
    const c = colaUsada();      // (motor-exp N4.3) en la cola actual; bajar el resultado la espera
    try {
      a = cu.reservar(n * 8); b = cu.reservar(Math.max(8, Math.ceil(n / 2) * 8));
      cu.subir(a, datos, c.s);
      let len = n;
      while (len > 1) {
        const m = Math.ceil(len / 2);
        cu.lanzar(funs['c1en_red_' + op], c1enBloques(m, cu), C1EN_HILOS_BLOQUE,
          [{ t: 'i64', v: m }, { t: 'i64', v: len }, { t: 'ptr', v: a }, { t: 'ptr', v: b }], c.s);
        const t = a; a = b; b = t;
        len = m;
      }
      const r = new Float64Array(1);
      cu.bajar(r, a, c.s);
      return r[0];
    } finally {
      if (a !== null) cu.liberar(a);
      if (b !== null) cu.liberar(b);
    }
  }

  // ── (motor-exp N4.3) colas para el programa ─────────────────────────────────
  function nuevaCola() {
    elegirInicial();
    const c = { s: null, gpu: indiceGpu, ev: null, pendientes: [], errores: [], legado: false, viva: true, logica: true };
    if (actual === 'gpu') {
      const cu = c1enCuda();
      if (cu.asincrono) { c.s = cu.nuevaCola(); c.logica = false; colasVivas++; }
    }
    return c;
  }
  function conCola(c, f) {
    const antes = colaActual;
    colaActual = c;
    try { return f(); } finally { colaActual = antes; }
  }
  function enSuGpu(c, f) {
    const cu = c1enCuda();
    const otra = c.gpu !== indiceGpu;
    if (otra) cu.usar(c.gpu);
    try { return f(cu); } finally { if (otra) cu.usar(indiceGpu); }
  }
  function esperarCola(c) {
    if (c.logica) {
      const e = c.errores.splice(0)[0];
      if (e) lanzarError(e[0], e[1][0], e[1][1], e[2], e[3]);
      return;
    }
    enSuGpu(c, cu => {
      cu.esperarCola(c.s);
      let primero = null;
      for (const p of c.pendientes.splice(0)) {
        const e = new BigUint64Array(1);
        cu.bajar(e, p.de, null);
        soltarMem(cu, p.de, 8, c.gpu, c);
        const f = c1enLeerClave(e[0]);
        if (f && !primero) primero = [p, f];
      }
      if (primero) lanzarError(primero[0].r.modelo, primero[1][0], primero[1][1], primero[0].quien, primero[0].nh);
    });
  }
  function colaLista(c) { return c.logica ? true : enSuGpu(c, cu => cu.colaLista(c.s)); }
  function soltarCola(c) {
    try { esperarCola(c); } finally {
      if (!c.logica && c.viva) enSuGpu(c, cu => { cu.soltarCola(c.s); if (c.ev) cu.soltarEvento(c.ev); });
      if (!c.logica && c.viva) colasVivas--;
      c.viva = false;
    }
  }
  // Subir ya, en la cola actual (un «prefetch»): el núcleo que lo use después ya
  // lo encuentra allí. Una vista con zancadas no puede quedarse en la GPU: nada.
  function subir(x) {
    elegirInicial();
    if (actual !== 'gpu') return;
    const p = prepararArreglo(x, 'subirGpu', 1, true, true);
    if (!p.residible) return;
    const cu = c1enCuda(), c = colaUsada();
    try { liberarPendientes(cu); asegurarResidente(x, p.vista, cu, false, c, false); trasEncolar(cu, c); }
    finally { enUso.clear(); }
  }
  // Lo que tarda en la GPU, con dos eventos con tiempo alrededor; fuera de la
  // GPU, el reloj (lo de jit y nativo ya terminó al volver).
  function medir(f) {
    elegirInicial();
    const cu = actual === 'gpu' ? c1enCuda() : null;
    if (!cu || !cu.asincrono) {
      const t0 = Date.now(), p0 = typeof performance !== 'undefined' ? performance.now() : 0;
      f();
      if (cu) cu.sincronizar();
      return typeof performance !== 'undefined' ? performance.now() - p0 : Date.now() - t0;
    }
    const c = colaUsada();
    const a = cu.nuevoEvento(true), b = cu.nuevoEvento(true);
    try {
      cu.marcar(a, c.s);
      f();
      const c2 = colaUsada();
      cu.marcar(b, c2.s);
      cu.esperarEvento(b);
      return cu.tiempoEntre(a, b);
    } finally { cu.soltarEvento(a); cu.soltarEvento(b); }
  }

  return {
    get dispositivo() { elegirInicial(); return actual; },
    nuevaCola, conCola, esperarCola, colaLista, soltarCola, subir, medir,
    get gpu() { elegirInicial(); return actual === 'gpu' ? indiceGpu : null; },
    usar, describir, disponibles, paralelo, paraleloBloques, codigo, kernel, reducir, liberarResidentes,
    // Para las pruebas y para quien quiera ver el JavaScript que corre en "jit".
    codigoJS(cierre, ejemplos) {
      const r = modeloDe(cierre, tiposParaLlamada(cierre, ejemplos, 'codigoJS'), 'codigoJS');
      return c1enEmitir(r.modelo, 'js');
    },
    fuenteKernel(lanzador, destino) { return fuenteKernel(lanzador.nucleo, destino); },
  };
}

// (motor-exp N4.4) ¿Usa el cuerpo barrera(), compartido…, hilosPorBloque() o numeroBloques()?
function c1enUsaBloques(n) {
  const NOMBRES = new Set(['barrera', 'compartido', 'compartidoEntero', 'hilosPorBloque', 'numeroBloques']);
  const ver = x => {
    if (!x || typeof x !== 'object') return false;
    if (Array.isArray(x)) return x.some(ver);
    if (x.tipo === 'Llamada' && x.callee && x.callee.tipo === 'Variable' && NOMBRES.has(x.callee.nombre)) return true;
    for (const k of Object.keys(x)) if (k !== 'tipoLit' && k !== 'anotacion' && typeof x[k] === 'object' && ver(x[k])) return true;
    return false;
  };
  return ver(n);
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
// (motor-exp N3) Para núcleos con __syncthreads: cada hilo del bloque es una
// corrutina (ver c1en_coop_correr en la cabecera del simulador).
function c1enEmuladorCoop(nombre, desempaquetar) {
  return `#ifdef C1EN_EMULAR\nstatic void c1en_coopf_${nombre}(void** p) { ${nombre}(${desempaquetar}); }\n` +
    `extern "C" void c1en_emul_${nombre}(unsigned gx, unsigned bx, void** p) { c1en_coop_correr(gx, bx, c1en_coopf_${nombre}, p); }\n#endif\n`;
}
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
// (motor-exp N4.4) «bloques»: el núcleo es de paraleloBloques —recibe (bloque,
// hilo, …) y puede usar memoria compartida, barreras y el tamaño de la
// cuadrícula—; si no, de paralelo —(i, …)—.
// (motor-exp N4.5) el tipo de C (y de CUDA, que no trae <stdint.h> en NVRTC)
// del elemento de un parámetro arreglo: real, real32, entero o un entero de máquina
const C1EN_ENT_C = { i8: ['int8_t', 'signed char', 8], u8: ['uint8_t', 'unsigned char', 8], i16: ['int16_t', 'short', 16],
  u16: ['uint16_t', 'unsigned short', 16], u32: ['uint32_t', 'unsigned int', 32] };
function c1enTipoElem(p, cu) {
  if (p.arr === 'real') return p.f32 ? 'float' : 'double';
  const e = p.ent && C1EN_ENT_C[p.ent];
  if (e) return cu ? e[1] : e[0];
  return cu ? 'int' : 'int32_t';
}
const C1EN_MAX_COMPARTIDA = 48 * 1024;      // bytes de memoria compartida por bloque, como en CUDA sin pedir más
function c1enAnalizar(vm, cierre, tiposArgs, quien, bloques) {
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
    bloques: !!bloques, compartidos: [], barreras: 0,
  };
  const asc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_');
  let nVars = 0;
  const nuevaVar = (nombre, extra) => Object.assign({ nombre, cn: `v${nVars++}_${asc(nombre)}`, tipo: null, anot: null, fijo: false }, extra);

  // Los parámetros: el 0 es el índice del hilo; los demás, lo que llegó.
  // (motor-exp N4.4) En un núcleo de bloques, el 0 es el bloque y el 1 el hilo
  // dentro del bloque.
  const ps = ast.params;
  const nIdx = M.bloques ? 2 : 1;
  for (let k = 0; k < nIdx; k++) M.params.push(Object.assign(nuevaVar(ps[k].nombre), { tipo: 'ent', tipoEntrada: 'ent', entrada: `p${k}` }));
  for (let k = nIdx; k < ps.length; k++) {
    const t = tiposArgs[k - nIdx];
    const entM = typeof t === 'string' && t.endsWith('*') && C1EN_ENT_C[t.slice(0, -1)] ? t.slice(0, -1) : null;
    if (t === 'f64*' || t === 'i32*' || t === 'f32*' || entM)
      M.params.push({ nombre: ps[k].nombre, arr: t === 'f64*' || t === 'f32*' ? 'real' : 'ent', f32: t === 'f32*', ent: entM, cn: `p${k}`, cnN: `n${k}` });
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
        if (f === 'barrera') no(n, '«barrera()» es una sentencia: no devuelve nada que usar');
        if (f === 'compartido' || f === 'compartidoEntero')
          no(n, `«${f}» va en su propia declaración, al principio del núcleo`, 'fijo s = compartido(256)');
        if (f === 'hilosPorBloque' || f === 'numeroBloques') {
          if (!M.bloques) no(n, `«${f}()» solo existe en los núcleos de paraleloBloques`, 'paraleloBloques(bloques, hilos, funcion(b, t, …) { … }, …)');
          return 'ent';
        }
        if (f === 'longitud' || f === 'tamano') { arregloDe(n.args[0], `«${f}»`); return 'ent'; }
        const ts = n.args.map(tx);
        for (let k = 0; k < ts.length; k++) if (!esNum(ts[k])) no(n, `«${f}» necesita números y el argumento ${k + 1} es bool`);
        if (f === 'azarHilo') {
          ts.forEach((t, k) => { if (t !== 'ent') no(n, `«azarHilo»: el argumento ${k + 1} tiene que ser entero`, 'azarHilo(semilla, i, canal) con tres enteros'); });
          return 'real';
        }
        if (C1EN_BITS[f] !== undefined) {
          ts.forEach((t, k) => { if (t !== 'ent') no(n, `«${f}»: el argumento ${k + 1} tiene que ser entero`, 'las operaciones de bits son de enteros: usa entero(x) o piso(x)'); });
          if (f === 'desplazarIzq' || f === 'desplazarDer')
            sitio(n, 'despl', `«${f}»: el desplazamiento va de 0 a 63`);
          if (f !== 'bitsNo' && f !== 'desplazarDer')
            sitio(n, 'bits', `«${f}»: el resultado no cabe exacto en un número de Ñ (más de 2^53)`,
              'para trabajar con los 32 bits de abajo, quédate con ellos: bitsY(x, 4294967295)');
          return 'ent';
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
        // (motor-exp N4.4) fijo s = compartido(256): memoria compartida del bloque
        if (n.valor && n.valor.tipo === 'Llamada' && n.valor.callee.tipo === 'Variable' && !buscar(n.valor.callee.nombre)) {
          const f0 = (() => { const g = vm.globals.get(globalDeEnlace(enl, n.valor.callee.nombre)); return g instanceof ObjNativa ? (g.nombreCorto || g.nombre) : null; })();
          if (f0 === 'compartido' || f0 === 'compartidoEntero') {
            M.llamadas.set(n.valor, f0);
            if (!M.bloques) no(n, `«${f0}» solo existe en los núcleos de paraleloBloques`, 'paraleloBloques(bloques, hilos, funcion(b, t, …) { … }, …)');
            if (scopes.length !== 2) no(n, `«${f0}» se declara al principio del núcleo, fuera de «si» y de bucles`, 'es de todo el bloque: todos los hilos ven la misma');
            const a0 = n.valor.args[0];
            if (n.valor.args.length !== 1 || !a0 || a0.tipo !== 'Literal' || !Number.isInteger(a0.valor) || a0.valor < 1)
              no(n, `«${f0}» necesita el tamaño escrito como un entero positivo`, 'fijo s = compartido(256) — el tamaño se fija al compilar el núcleo');
            let info = M.porNodo.get(n);
            if (!info) {
              info = { nombre: n.nombre, arr: f0 === 'compartido' ? 'real' : 'ent', compartido: true, tam: a0.valor,
                cn: `sh${M.compartidos.length}_${asc(n.nombre)}`, cnN: String(a0.valor) };
              M.porNodo.set(n, info); M.compartidos.push(info);
              const bytes = M.compartidos.reduce((x, c) => x + c.tam * (c.arr === 'real' ? 8 : 4), 0);
              if (bytes > C1EN_MAX_COMPARTIDA)
                no(n, `la memoria compartida del bloque pasa de ${C1EN_MAX_COMPARTIDA / 1024} KB (${bytes} bytes)`, 'es lo que da una GPU por bloque sin pedir más: usa trozos más pequeños');
            }
            scopes[scopes.length - 1].set(n.nombre, info);
            return;
          }
        }
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
          if (f === 'barrera') {
            if (!M.bloques) no(e, '«barrera()» solo existe en los núcleos de paraleloBloques', 'paraleloBloques(bloques, hilos, funcion(b, t, …) { … }, …)');
            if (e.args.length) no(e, '«barrera()» no recibe argumentos');
            sitio(e, 'barrera', 'no todos los hilos del bloque llegaron a esta barrera (uno terminó o fue a otra)',
              'todos los hilos de un bloque tienen que pasar por las mismas barreras: no la pongas en un «si» que no todos toman ni salgas antes con devolver; en una GPU eso se cuelga o da basura');
            M.barreras++;
            return;
          }
          if (f !== 'sumarAtomico') no(e, `el resultado de «${f}» no se usa`, 'guárdalo en una variable o en un arreglo');
          if (e.args.length !== 3) no(e, '«sumarAtomico» recibe (arreglo, índice, valor)');
          const info = arregloDe(e.args[0], '«sumarAtomico»');
          const tj = tx(e.args[1]), tv = tx(e.args[2]);
          if (tj !== 'ent') no(e, 'el índice de «sumarAtomico» tiene que ser entero');
          if (!esNum(tv)) no(e, '«sumarAtomico» suma números');
          if (info.arr === 'ent' && tv !== 'ent') no(e, `«${info.nombre}» es un arreglo entero y se le suma un real`, 'usa piso(v), o un arreglo real');
          if (info.ent && info.ent !== 'u32') no(e, `«sumarAtomico» sobre un arreglo ${info.ent}: las GPU no suman atómicamente en 8 ni 16 bits`, 'usa un arreglo "entero" o "u32" para el acumulador');
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

  // (motor-exp N4.5) un elemento de un entero de máquina se lee como el entero
  // de 64 bits del núcleo: sin eso, un uint32_t por un int se haría en 32 bits sin
  // signo (las conversiones de C) y se envolvería antes de tiempo
  const elemDe = (info, t) => (!js && info.ent ? `((${TY.ent})${info.cn}[${t}])` : `${info.cn}[${t}]`);
  function leerArr(info, j) {
    const t = tmp('ent');
    return { t, codigo: (nodo) => `(${t} = ${j}, ${enRango(t, info.cnN)} ? ${elemDe(info, t)} : ${FALLA(M.sitio(nodo, 'idx'))})` };
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
    if (f === 'hilosPorBloque') return 'c1en_nh';      // (motor-exp N4.4)
    if (f === 'numeroBloques') return 'c1en_nb';
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
      // (motor-exp N4.5) bits: en C, los operadores de C en 64 bits; en JS, lo
      // mismo con números (o BigInt, ver c1enBits); los dos comprueban lo mismo
      case 'bitsY': case 'bitsO': case 'bitsXor': {
        const r = tmp('ent');
        const L53 = '9007199254740992';
        if (js) return `(${r} = c1enBits(${C1EN_BITS[f]}, ${a0()}, ${ex(as[1])}), ${r} === ${r} ? ${r} : ${FALLA(M.sitio(n, 'bits'))})`;
        const o = { bitsY: '&', bitsO: '|', bitsXor: '^' }[f];
        return `(${r} = (${a0()}) ${o} (${ex(as[1])}), (${r} >= -${L53}LL && ${r} <= ${L53}LL) ? ${r} : ${FALLA(M.sitio(n, 'bits'))})`;
      }
      case 'bitsNo': return js ? `(-(${a0()}) - 1)` : `(~(${a0()}))`;
      case 'desplazarIzq': case 'desplazarDer': {
        const a = tmp('ent'), k = tmp('ent');
        const desp = FALLA(M.sitio(n, 'despl'));
        const pre = `${a} = ${a0()}, ${k} = ${ex(as[1])}, (${k} < 0 || ${k} > 63) ? ${desp} : `;
        if (f === 'desplazarDer')
          return js ? `(${pre}Math.floor(${a} / Math.pow(2, ${k})))` : `(${pre}(${a} >> ${k}))`;
        // a la izquierda: a·2^k, que tiene que caber en 2^53 (así nunca llega a
        // envolverse en 64 bits, y en JS la cuenta es exacta)
        const r = tmp('real');
        const ull = cu ? 'unsigned long long' : 'uint64_t';
        if (js) return `(${pre}(${r} = ${a} * Math.pow(2, ${k}), (${r} >= -9007199254740992 && ${r} <= 9007199254740992) ? ${r} : ${FALLA(M.sitio(n, 'bits'))}))`;
        return `(${pre}(${r} = (double)${a} * (double)((${ull})1 << ${k}), (${r} >= -9007199254740992.0 && ${r} <= 9007199254740992.0) ? (${TY.ent})((${ull})${a} << ${k}) : ${FALLA(M.sitio(n, 'bits'))}))`;
      }
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
        if (info.compartido) return;                     // (motor-exp N4.4) la reserva el envoltorio del bloque
        const antes = fallas;
        const v = n.valor ? conv(ex(n.valor), tipoDe(n.valor), info.tipo) : lit(info.tipo === 'bool' ? false : 0, info.tipo);
        L(`${info.cn} = ${v};`);
        comprobar(antes);
        return;
      }
      case 'ExprSent': {
        const e = n.expr;
        if (e.tipo === 'Llamada' && M.llamadas.get(e) === 'barrera') {
          // (motor-exp N4.4) jit: el hilo cede el turno (es un generador) · C: la
          // corrutina vuelve al planificador del bloque · CUDA: __syncthreads
          const id = M.sitio(e, 'barrera');
          if (js) L(`yield ${id};`);
          else if (cu) L('__syncthreads();');
          else L(`c1en_barrera(c1en_h, ${id});`);
          return;
        }
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
  // (motor-exp N4.5) en un entero de máquina, igual pero con su tamaño: por el
  // sin signo de su anchura (que el estándar define para todo valor) y de ahí a él
  const guardarEnt = (v, info) => {
    if (js) return v;
    const e = info && info.ent && C1EN_ENT_C[info.ent];
    const ull = cu ? 'unsigned long long' : 'uint64_t';
    if (!e) return `(${cu ? 'int' : 'int32_t'})(${cu ? 'unsigned int' : 'uint32_t'})(${ull})(${v})`;
    const ty = cu ? e[1] : e[0];
    const sin = cu ? ({ 8: 'unsigned char', 16: 'unsigned short', 32: 'unsigned int' })[e[2]] : `uint${e[2]}_t`;
    return `(${ty})(${sin})(${ull})(${v})`;
  };
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
      const lee = `(${enRango(tj, info.cnN)} ? ${elemDe(info, tj)} : ${FALLA(M.sitio(d, 'idx'))})`;
      v = binop(e, e.op[0], lee, elem, v, tvTipo, t);
      tvTipo = t;
    }
    L(`${tv} = ${elem === 'real' ? aReal(v, tvTipo) : v};`);
    comprobar(antes);
    L(`if (!${enRango(tj, info.cnN)}) ${FALLA_S(M.sitio(d, 'idx'))}`);
    L(`${info.cn}[${tj}] = ${elem === 'real' ? tv : guardarEnt(tv, info)};`);
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
    else if (cu) L(info.arr === 'real' ? `atomicAdd(&${info.cn}[${tj}], ${info.f32 ? '(float)' : ''}${tv});`
      : info.ent === 'u32' ? `atomicAdd(&${info.cn}[${tj}], (unsigned int)(unsigned long long)${tv});`
        : `atomicAdd(&${info.cn}[${tj}], (int)(unsigned int)(unsigned long long)${tv});`);
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
  if (M.bloques) return c1enEnvolverBloques(M, destino, lineas.join('\n'), temps, TY);
  const firmaCuerpo = [], llamada0 = [], firmaNucleo = [], desemp = [];
  M.params.forEach((p, k) => {
    if (p.arr) {
      const ty = c1enTipoElem(p, cu);
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
      `  ${c1enMezclar.toString()}\n  ${c1enAzar.toString()}\n  ${c1enBits.toString()}\n` +
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

// ============================================================================
//  (motor-exp N4.4) El envoltorio de los núcleos de paraleloBloques
// ============================================================================
// El programa ve el modelo de la GPU: una cuadrícula de «nb» bloques de «nh»
// hilos, memoria compartida por bloque y barreras. Los tres destinos:
//   · CUDA: tal cual (__shared__, __syncthreads), un bloque de verdad por bloque.
//   · jit: cada hilo es un GENERADOR de JavaScript y la barrera es «yield»; el
//     bloque corre por rondas: todos los hilos hasta la barrera, y otra vez.
//   · C: lo mismo con CORRUTINAS (ucontext en Linux y macOS, fibras en Windows),
//     un bloque entero en un hilo del sistema y los bloques repartidos con
//     OpenMP.
// En jit y en C el orden es fijo (hilo 0, 1, 2… en cada ronda), así que dan lo
// mismo; y como es fácil equivocarse con las barreras, las vigilan: si un hilo
// termina mientras otros esperan en una barrera, o dos hilos esperan en
// barreras distintas —lo que en una GPU se cuelga o da basura—, el núcleo falla
// con la línea de la barrera. La memoria compartida empieza a cero en los tres.
const C1EN_HILOS_C = `
#ifdef _WIN32
#include <windows.h>
#else
#include <ucontext.h>
#endif
#include <stdlib.h>
#include <string.h>
typedef struct c1en_hb {
#ifdef _WIN32
  void* fibra;
#else
  ucontext_t ctx; char* pila;
#endif
  int estado;                       /* 0 corre, 1 en una barrera, 2 terminó */
  int64_t sitio, res, b, t;
  const void* a;
  void (*correr)(struct c1en_hb*);
} c1en_hb;
#define C1EN_PILA (64 * 1024)
#ifdef _WIN32
static __thread void* c1en_plan = 0;
static void WINAPI c1en_fibra(void* p) { c1en_hb* h = (c1en_hb*)p; h->correr(h); h->estado = 2; for (;;) SwitchToFiber(c1en_plan); }
static void c1en_hb_iniciar(c1en_hb* h) {
  if (!c1en_plan) c1en_plan = ConvertThreadToFiber(0);
  if (h->fibra) DeleteFiber(h->fibra);
  h->fibra = CreateFiber(C1EN_PILA, c1en_fibra, h); h->estado = 0;
}
static void c1en_hb_seguir(c1en_hb* h) { SwitchToFiber(h->fibra); }
static void c1en_barrera(c1en_hb* h, int64_t sitio) { h->estado = 1; h->sitio = sitio; SwitchToFiber(c1en_plan); h->estado = 0; }
static void c1en_hb_soltar(c1en_hb* h) { if (h->fibra) DeleteFiber(h->fibra); h->fibra = 0; }
#else
static __thread ucontext_t c1en_plan;
static __thread c1en_hb* c1en_hb_actual;
static void c1en_entrada(void) { c1en_hb* h = c1en_hb_actual; h->correr(h); h->estado = 2; }
static void c1en_hb_iniciar(c1en_hb* h) {
  if (!h->pila) h->pila = (char*)malloc(C1EN_PILA);
  getcontext(&h->ctx);
  h->ctx.uc_stack.ss_sp = h->pila; h->ctx.uc_stack.ss_size = C1EN_PILA; h->ctx.uc_link = &c1en_plan;
  makecontext(&h->ctx, c1en_entrada, 0);
  h->estado = 0;
}
static void c1en_hb_seguir(c1en_hb* h) { c1en_hb_actual = h; swapcontext(&c1en_plan, &h->ctx); }
static void c1en_barrera(c1en_hb* h, int64_t sitio) { h->estado = 1; h->sitio = sitio; swapcontext(&h->ctx, &c1en_plan); h->estado = 0; }
static void c1en_hb_soltar(c1en_hb* h) { free(h->pila); h->pila = 0; }
#endif
/* Un bloque entero, por rondas. Devuelve la peor clave ((hilo global << 24) |
   sitio, todo unos si nada falló): la misma regla que el jit. */
static uint64_t c1en_correr_bloque(c1en_hb* hs, int64_t nh, int64_t b) {
  uint64_t peor = ~0ULL;
  for (int64_t t = 0; t < nh; t++) c1en_hb_iniciar(&hs[t]);
  int64_t vivos = nh, fin = -1; int mal = 0;
  while (vivos > 0) {
    int64_t bar = 0, esperan = 0; int otra = 0;
    for (int64_t t = 0; t < nh; t++) {
      if (hs[t].estado == 2) continue;
      c1en_hb_seguir(&hs[t]);
      if (hs[t].estado == 2) {
        vivos--;
        if (hs[t].res != 0) { uint64_t k = ((uint64_t)(b * nh + t) << 24) | (uint64_t)hs[t].res; if (k < peor) peor = k; mal = 1; }
        else if (fin < 0) fin = t;
      } else {
        esperan++;
        if (bar == 0) bar = hs[t].sitio;
        else if (hs[t].sitio != bar && !mal && !otra) { uint64_t k = ((uint64_t)(b * nh + t) << 24) | (uint64_t)hs[t].sitio; if (k < peor) peor = k; otra = 1; }
      }
    }
    if (otra) break;
    if (!mal && esperan > 0 && fin >= 0) { uint64_t k = ((uint64_t)(b * nh + fin) << 24) | (uint64_t)bar; if (k < peor) peor = k; break; }
  }
  return peor;
}
`;
function c1enEnvolverBloques(M, destino, cuerpo, temps, TY) {
  const js = destino === 'js', cu = destino === 'cuda';
  const firmaCuerpo = [], llamada0 = [], firmaNucleo = [], desemp = [], campos = [], deCampos = [];
  M.params.forEach((p, k) => {
    if (p.arr) {
      const ty = c1enTipoElem(p, cu);
      firmaCuerpo.push(`${ty}* ${p.cn}`, `${TY.ent} ${p.cnN}`);
      llamada0.push(p.cn, p.cnN);
      firmaNucleo.push(`${ty}* ${p.cn}`, `${TY.ent} ${p.cnN}`);
      campos.push(`${ty}* ${p.cn};`, `${TY.ent} ${p.cnN};`); deCampos.push(`a->${p.cn}`, `a->${p.cnN}`);
      desemp.push(`*(${ty}**)p[${desemp.length + 2}]`, `*(long long*)p[${desemp.length + 3}]`);
    } else {
      const ty = p.tipoEntrada === 'real' ? 'double' : TY.ent;
      firmaCuerpo.push(`${ty} ${p.entrada}`);
      if (k <= 1) return;
      llamada0.push(p.entrada);
      firmaNucleo.push(`${ty} ${p.entrada}`);
      campos.push(`${ty} ${p.entrada};`); deCampos.push(`a->${p.entrada}`);
      desemp.push(`*(${ty === 'double' ? 'double' : 'long long'}*)p[${desemp.length + 2}]`);
    }
  });
  const tyC = c => (c.arr === 'real' ? 'double' : (cu ? 'int' : 'int32_t'));
  const firmaSh = M.compartidos.map(c => `${tyC(c)}* ${c.cn}`);
  const nombresSh = M.compartidos.map(c => c.cn);
  const locales = [];
  for (const p of M.params) if (!p.arr) locales.push([p.cn, p.tipo]);
  for (const v of M.vars) locales.push([v.cn, v.tipo]);
  for (const [nm, t] of temps) locales.push([nm, t]);
  // los parámetros del cuerpo: bloque, hilo, la cuadrícula, los del programa y la compartida
  const nombres = firmaCuerpo.map(x => x.split(' ').pop());
  const argsCuerpo = nombres.slice(2);           // sin p0 y p1

  if (js) {
    const decl = locales.map(([nm, t]) => `${nm} = ${t === 'bool' ? 'false' : '0'}`);
    const sh = M.compartidos.map(c => `const ${c.cn} = new ${c.arr === 'real' ? 'Float64Array' : 'Int32Array'}(${c.tam});`).join(' ');
    return `(function () {\n` +
      `  ${c1enMezclar.toString()}\n  ${c1enAzar.toString()}\n  ${c1enBits.toString()}\n` +
      `  // C1EÑ — «${M.nombre}» (línea ${M.linea}), destino jit, núcleo de bloques\n` +
      `  function* cuerpo(${['p0', 'p1', 'c1en_nb', 'c1en_nh'].concat(argsCuerpo, nombresSh).join(', ')}) {\n` +
      `    let f = 0, vueltas = 0;\n` + (decl.length ? `    let ${decl.join(', ')};\n` : '') +
      cuerpo.split('\n').map(l => '  ' + l).join('\n') + `\n    return 0;\n  }\n` +
      `  return function nucleo(${['c1en_nb', 'c1en_nh'].concat(argsCuerpo).join(', ')}) {\n` +
      `    let peor = null;\n` +
      `    const anotar = (g, c) => { if (peor === null || g * 16777216 + c < peor[0] * 16777216 + peor[1]) peor = [g, c]; };\n` +
      `    for (let b = 0; b < c1en_nb; b++) {\n` +
      `      ${sh}\n` +
      `      const hs = new Array(c1en_nh), est = new Uint8Array(c1en_nh);\n` +
      `      for (let t = 0; t < c1en_nh; t++) hs[t] = cuerpo(${['b', 't', 'c1en_nb', 'c1en_nh'].concat(argsCuerpo, nombresSh).join(', ')});\n` +
      `      let vivos = c1en_nh, fin = -1, mal = false;\n` +
      `      while (vivos > 0) {\n` +
      `        let bar = 0, esperan = 0, otra = false;\n` +
      `        for (let t = 0; t < c1en_nh; t++) {\n` +
      `          if (est[t] === 2) continue;\n` +
      `          const r = hs[t].next();\n` +
      `          if (r.done) { est[t] = 2; vivos--; if (r.value !== 0) { anotar(b * c1en_nh + t, r.value); mal = true; } else if (fin < 0) fin = t; }\n` +
      `          else { esperan++; if (bar === 0) bar = r.value; else if (r.value !== bar && !mal && !otra) { anotar(b * c1en_nh + t, r.value); otra = true; } }\n` +
      `        }\n` +
      `        if (otra) break;\n` +
      `        if (!mal && esperan > 0 && fin >= 0) { anotar(b * c1en_nh + fin, bar); break; }\n` +
      `      }\n` +
      `      if (peor !== null) return peor;\n` +
      `    }\n    return null;\n  };\n})()`;
  }
  const decl = locales.map(([nm, t]) => `  ${TY[t]} ${nm} = 0;`).join('\n');
  const titulo = `/* C1EÑ — generado desde la función «${M.nombre}» (línea ${M.linea}): un núcleo de bloques.\n` +
    (cu ? '   Compilar con NVRTC: --fmad=false -arch=compute_75 (sin FMA: mismos bits que la CPU). */\n'
      : '   Compilar con: gcc -O2 -shared -fPIC -ffp-contract=off [-fopenmp] (sin FMA). */\n');
  const cab = (cu ? C1EN_CABECERA_CUDA : C1EN_CABECERA_C) + C1EN_PRELUDIO;
  const firmaC = (cu ? [] : ['c1en_hb* c1en_h']).concat(firmaCuerpo.slice(0, 2), [`${TY.ent} c1en_nb`, `${TY.ent} c1en_nh`], firmaCuerpo.slice(2), firmaSh);
  const fCuerpo = `${cu ? 'static __device__ ' : 'static '}${TY.ent} c1en_cuerpo(${firmaC.join(', ')}) {\n` +
    `  ${TY.ent} f = 0, vueltas = 0;\n${decl}\n  (void)c1en_nb; (void)c1en_nh;\n${cuerpo}\n  (void)vueltas;\n  return 0;\n}\n`;
  const nucleoParams = [`${cu ? 'long long' : 'int64_t'} c1en_nb`, `${cu ? 'long long' : 'int64_t'} c1en_nh`].concat(firmaNucleo);
  if (!cu) {
    const shDecl = M.compartidos.map(c => `${tyC(c)} ${c.cn}[${c.tam}]; memset(${c.cn}, 0, sizeof ${c.cn});`).join(' ');
    return titulo + cab + C1EN_HILOS_C + '\n' + fCuerpo + '\n' +
      `typedef struct { int64_t c1en_nb, c1en_nh; ${campos.join(' ')} ${M.compartidos.map(c => `${tyC(c)}* ${c.cn};`).join(' ')} } c1en_args;\n` +
      `static void c1en_correr(c1en_hb* h) {\n  const c1en_args* a = (const c1en_args*)h->a;\n` +
      `  h->res = c1en_cuerpo(${['h', 'h->b', 'h->t', 'a->c1en_nb', 'a->c1en_nh'].concat(deCampos, M.compartidos.map(c => `a->${c.cn}`)).join(', ')});\n}\n` +
      `void c1en_nucleo(${nucleoParams.join(', ')}, uint64_t* c1en_err) {\n` +
      `#pragma omp parallel if (c1en_nb > 1)\n  {\n` +
      `    c1en_hb* hs = (c1en_hb*)calloc((size_t)c1en_nh, sizeof(c1en_hb));\n` +
      `#pragma omp for schedule(dynamic, 1)\n` +
      `    for (int64_t b = 0; b < c1en_nb; b++) {\n` +
      `      ${shDecl}\n` +
      `      c1en_args a = { ${['c1en_nb', 'c1en_nh'].concat(llamada0, nombresSh).join(', ')} };\n` +
      `      for (int64_t t = 0; t < c1en_nh; t++) { hs[t].b = b; hs[t].t = t; hs[t].a = &a; hs[t].correr = c1en_correr; }\n` +
      `      uint64_t k = c1en_correr_bloque(hs, c1en_nh, b);\n` +
      `      if (k != ~0ULL) {\n#pragma omp critical (c1en_err)\n        { if (k < c1en_err[0]) c1en_err[0] = k; }\n      }\n    }\n` +
      `    for (int64_t t = 0; t < c1en_nh; t++) c1en_hb_soltar(&hs[t]);\n    free(hs);\n  }\n}\n`;
  }
  const shDecl = M.compartidos.map(c => `  __shared__ ${tyC(c)} ${c.cn}[${c.tam}];\n  for (long long q = c1en_t; q < ${c.tam}; q += c1en_nh) ${c.cn}[q] = 0;\n`).join('');
  const todosDesemp = ['*(long long*)p[0]', '*(long long*)p[1]'].concat(desemp).concat([`*(unsigned long long**)p[${desemp.length + 2}]`]).join(', ');
  return titulo + cab + '\n' + fCuerpo + '\n' +
    `extern "C" __global__ void c1en_nucleo(${nucleoParams.join(', ')}, unsigned long long* c1en_err) {\n` +
    `  long long c1en_b = blockIdx.x, c1en_t = threadIdx.x;\n` + shDecl +
    (M.compartidos.length ? '  __syncthreads();\n' : '') +
    `  long long c = c1en_cuerpo(${['c1en_b', 'c1en_t', 'c1en_nb', 'c1en_nh'].concat(llamada0, nombresSh).join(', ')});\n` +
    `  if (c != 0) atomicMin(c1en_err, ((unsigned long long)(c1en_b * c1en_nh + c1en_t) << 24) | (unsigned long long)c);\n}\n` +
    c1enEmuladorCoop('c1en_nucleo', todosDesemp);
}

if (typeof module !== 'undefined') module.exports = { instalarNenC1en };
