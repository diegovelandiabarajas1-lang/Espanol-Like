// ============================================================================
//  C1EÑ desde dentro: compilar, rechazar y comparar los tres destinos AL BIT.
//
//  Lo que se mira aquí y no en la suite en Ñ (pruebas/en-n/nen-c1en.esl) es lo
//  que solo se ve desde JavaScript: el texto generado, los bytes exactos de los
//  resultados (un −0 frente a un +0, que «==» de Ñ no distingue), el simulador
//  de GPU y miles de ejecuciones de núcleos inventados al azar.
//
//  Tres destinos:
//    jit      siempre
//    nativo   si hay gcc y koffi
//    gpu      con --gpu, la GPU DE VERDAD (el cuaderno de Kaggle corre esto);
//             sin --gpu, el SIMULADOR: una libcuda y una libnvrtc falsas
//             (pruebas/c1en-sim) que compilan el CUDA C con g++ y lo ejecutan
//             recorriendo la cuadrícula en la CPU. Así util/c1en-cuda.js, el
//             armado de kernelParams y el CUDA C generado se prueban de punta a
//             punta en cualquier máquina con gcc.
//
//    node motor/pruebas/c1en.js                 simulador
//    node motor/pruebas/c1en.js --gpu           GPU real (falla si no hay)
//    node motor/pruebas/c1en.js --fuzz=1000     más núcleos al azar
// ============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ARGS = process.argv.slice(2);
const GPU_REAL = ARGS.includes('--gpu');
const FUZZ = Number((ARGS.find(a => a.startsWith('--fuzz=')) || '=').split('=')[1]) || 300;
// Las pruebas del tope de vueltas no pueden esperar mil millones.
process.env.C1EN_MAX_VUELTAS = '200000';

// ── el simulador ─────────────────────────────────────────────────────────────
const SIM = path.join(__dirname, 'c1en-sim');
let dirSim = null, motivoSinGpu = null;
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
if (!GPU_REAL) {
  if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para montar el simulador';
  else {
    // Una carpeta fija por usuario: ahí se quedan los núcleos ya compilados por
    // el simulador, y la segunda pasada del fuzz no recompila nada.
    dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
    fs.mkdirSync(dirSim, { recursive: true });
    // A un nombre temporal y luego renombrar: si otra pasada de las pruebas
    // tiene cargada la biblioteca vieja, escribir encima la rompería en marcha.
    const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
    const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA, '-ldl'], { encoding: 'utf8' });
    const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
    if (!a.status && !b.status) { fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so')); }
    if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
    else {
      process.env.C1EN_CUDA_LIB = path.join(dirSim, 'libcuda.so');
      process.env.C1EN_NVRTC_LIB = path.join(dirSim, 'libnvrtc.so');
      process.env.C1EN_SIM_CABECERA = path.join(SIM, 'cuda-falsa.h');
      process.env.C1EN_SIM_DIR = dirSim;
      // Dos bloques como mucho: obliga a recorrer el índice a zancadas de
      // cuadrícula en cuanto n pasa de 512, que en una GPU de verdad solo
      // pasaría con millones de hilos.
      process.env.C1EN_MAX_BLOQUES = '2';
    }
  }
}

require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0, saltadas = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 600) : ''); }
};
const saltar = (n, por) => { saltadas++; console.log('  – saltada:', n, '·', por); };

function motor() {
  const out = [];
  const m = crearMotor({ salida: s => out.push(String(s)), limiteInstr: 1e12 });
  return { m, vm: m.vm, out };
}
const CABECERA = 'usar paralelo, azarHilo, sumarAtomico de "nen"\nusar raiz, absoluto, piso, techo, exp, log, seno, coseno, angulo, tamano de "numerico"\n';
// Compila un programa con CABECERA delante (las líneas de error se cuentan con
// ella: 2 líneas) y devuelve la función «nucleo».
function nucleoDe(src) {
  const e = motor();
  const r = e.m.ejecutar(CABECERA + src);
  if (!r.ok) throw new Error('el programa no compila: ' + r.errores.map(x => x.msg || x.message).join(' | '));
  return { ...e, f: e.vm.globals.get('nucleo') };
}
const msgDe = e => String((e && (e.msg || e.message)) || e);

// ── las banderas de gcc, por plataforma (fase W1) ──────────────────────────
// En Windows «-Wl,-z,nodelete» no existe y el enlazador no hacía NADA: C1EÑ
// nativo nunca había funcionado allí. Se mira desde cualquier sistema, y si hay
// un gcc para Windows (x86_64-w64-mingw32-gcc) se compila un núcleo de verdad.
{
  const N = require(require('../rutas.js').util('c1en-nativo.js'));
  const win = N.banderasPara('win32'), lin = N.banderasPara('linux');
  console.log('\n── banderas de gcc por plataforma');
  comprobar('en Windows no va «-z nodelete» (el enlazador de Windows no la conoce)', !win.some(b => /-z/.test(b)), win.join(' '));
  comprobar('en Windows tampoco «-fPIC» (toda DLL es reubicable)', !win.includes('-fPIC'), win.join(' '));
  comprobar('en Linux siguen las dos, y las de redondeo en las dos', lin.includes('-Wl,-z,nodelete') && lin.includes('-fPIC') &&
    ['-ffp-contract=off', '-fno-fast-math', '-fwrapv'].every(b => win.includes(b) && lin.includes(b)), lin.join(' '));
  const mingw = spawnSync('x86_64-w64-mingw32-gcc', ['--version'], { encoding: 'utf8' });
  if (mingw.status === 0) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'c1en-mingw-'));
    const c = path.join(d, 'k.c');
    fs.writeFileSync(c, '#include <math.h>\n#include <stdint.h>\nvoid k(int64_t n, double *x) { for (int64_t i = 0; i < n; i++) x[i] = sqrt(x[i]) * 2.0; }\n');
    const bien = spawnSync('x86_64-w64-mingw32-gcc', win.concat(['-o', path.join(d, 'k.dll'), c, '-lm']), { encoding: 'utf8' });
    comprobar('un núcleo enlaza como DLL de Windows con las banderas nuevas', bien.status === 0, bien.stderr);
    const mal = spawnSync('x86_64-w64-mingw32-gcc', win.concat(['-Wl,-z,nodelete', '-o', path.join(d, 'k2.dll'), c, '-lm']), { encoding: 'utf8' });
    comprobar('… y con «-z nodelete» no enlaza (el fallo que había)', mal.status !== 0 && /-z/.test(mal.stderr), mal.stderr);
    fs.rmSync(d, { recursive: true, force: true });
  } else console.log('  – sin x86_64-w64-mingw32-gcc: no se compila el núcleo para Windows aquí');
}
// Un compilador que está pero no enlaza (lo que pasaba en Windows): «nativo» no
// se ofrece, se dice por qué con la línea que importa, y C1EÑ sigue con el JIT.
if (process.platform !== 'win32') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'c1en-falso-'));
  const cc = path.join(d, 'gcc-falso');
  fs.writeFileSync(cc, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "gcc (falso) 1.0"; exit 0; fi\n' +
    'echo "ld.exe: unrecognized option \'-z\'" >&2\necho "collect2.exe: error: ld returned 1 exit status" >&2\nexit 1\n');
  fs.chmodSync(cc, 0o755);
  const r = spawnSync(process.execPath, ['-e', `const m = require(${JSON.stringify(require('../rutas.js').util('c1en-nativo.js'))});
    const n = m.crear(); console.log(n === null ? 'sin nativo' : 'CON nativo'); console.log(m.porQueNo());`],
    { encoding: 'utf8', env: Object.assign({}, process.env, { C1EN_CC: cc, C1EN_CACHE: path.join(d, 'cache') }) });
  comprobar('un gcc que no enlaza: «nativo» no se ofrece', /^sin nativo/.test(r.stdout), r.stdout + r.stderr);
  comprobar('… y el motivo trae la causa, no solo «ld returned 1»', /unrecognized option '-z'/.test(r.stdout), r.stdout);
  fs.rmSync(d, { recursive: true, force: true });
}

// ── los dispositivos que hay ───────────────────────────────────────────────
const sonda = motor();
const disp = sonda.vm.c1en.disponibles();
const DEVS = ['jit'];
if (disp.some(d => d.startsWith('nativo'))) DEVS.push('nativo');
if (disp.some(d => d.startsWith('gpu'))) DEVS.push('gpu');
console.log('\n── dispositivos: ' + disp.join(' · ') + (dirSim ? '   (gpu = SIMULADOR)' : ''));
if (GPU_REAL && !DEVS.includes('gpu')) {
  console.log('  ✗ --gpu pero no hay GPU: ' + (motivoSinGpu || 'mira nvidia-smi y C1EN_NVRTC_LIB'));
  process.exit(1);
}

// Arreglos de entrada y sus copias para cada dispositivo.
function arr(vm, valores, tipo) {
  const a = vm.arrNuevo([valores.length], tipo || 'real');
  a.datos.set(valores);
  return a;
}
const clonar = (vm, args) => args.map(v => (v && v.clase === 'arreglo' ? arr(vm, Array.from(v.datos), v.tipo) : v));
const mismosBits = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x !== x && y !== y) continue;      // NaN y NaN: la carga útil puede variar
    if (!Object.is(x, y)) return false;
  }
  return true;
};
// Corre el núcleo en cada dispositivo con copias de los argumentos y devuelve
// {dev: {arrs: [Float64Array…], error}}.
function enTodos(e, n, args, devs) {
  const res = {};
  for (const d of devs || DEVS) {
    const cop = clonar(e.vm, args);
    let error = null;
    try { e.vm.c1en.usar(d, null); e.vm.c1en.paralelo(n, e.f, cop, 'paralelo'); }
    catch (x) { error = msgDe(x); }
    res[d] = { arrs: cop.filter(v => v && v.clase === 'arreglo').map(v => Array.from(v.datos)), error };
  }
  return res;
}
function igualesEnTodos(res) {
  const base = res.jit;
  for (const d in res) {
    if (res[d].error !== base.error) return `${d}: error «${res[d].error}» y jit «${base.error}»`;
    if (base.error) continue;
    for (let k = 0; k < base.arrs.length; k++)
      if (!mismosBits(base.arrs[k], res[d].arrs[k]))
        return `${d}, arreglo ${k}: ${JSON.stringify(res[d].arrs[k].slice(0, 8))} contra jit ${JSON.stringify(base.arrs[k].slice(0, 8))}`;
  }
  return null;
}

// ============================================================================
console.log('\n── el subconjunto: compila, corre y da lo mismo en ' + DEVS.join(', '));
const casos = [
  ['saxpy', 'fn nucleo(i, a, x, y) {\n  y[i] = a * x[i] + y[i]\n}', 5,
    v => [2.5, arr(v, [1, 2, 3, 4, 5]), arr(v, [0.1, 0.2, 0.3, 0.4, 0.5])],
    r => mismosBits(r[2], [1, 2, 3, 4, 5].map((x, i) => 2.5 * x + [0.1, 0.2, 0.3, 0.4, 0.5][i]))],
  ['// y % de enteros son como en Python', 'fn nucleo(i, a, q, r) {\n  q[i] = a[i] // 3\n  r[i] = a[i] % 3\n}', 6,
    v => [arr(v, [7, -7, 6, -6, 0, -1], 'entero'), arr(v, [0, 0, 0, 0, 0, 0], 'entero'), arr(v, [0, 0, 0, 0, 0, 0], 'entero')],
    r => r[1].join() === '2,-3,2,-2,0,-1' && r[2].join() === '1,2,0,0,0,2'],
  ['con divisor negativo, el resto lleva su signo', 'fn nucleo(i, a, r) {\n  r[i] = a[i] % (0 - 3)\n}', 3,
    v => [arr(v, [7, -7, 6], 'entero'), arr(v, [0, 0, 0], 'entero')], r => r[1].join() === '-2,-1,0'],
  ['// y % de reales', 'fn nucleo(i, a, r) {\n  r[i] = a[i] // 0.5 + a[i] % 0.75\n}', 3,
    v => [arr(v, [1.3, -1.3, 2.0]), arr(v, [0, 0, 0])],
    r => mismosBits(r[1], [1.3, -1.3, 2.0].map(x => Math.floor(x / 0.5) + (((x % 0.75) + 0.75) % 0.75)))],
  ['un entero que vale −0 en JavaScript llega como +0', 'fn nucleo(i, a, r) {\n  var z = 0 * a[i]\n  r[i] = z\n}', 2,
    v => [arr(v, [-3, 4], 'entero'), arr(v, [7, 7])], r => Object.is(r[1][0], 0) && Object.is(r[1][1], 0)],
  ['pero un real −0 sigue siendo −0', 'fn nucleo(i, r) {\n  r[i] = 0.0 * (0.0 - 1.0)\n}', 1,
    v => [arr(v, [7])], r => Object.is(r[0][0], -0)],
  ['una variable entera que se ensancha a real', 'fn nucleo(i, r) {\n  var x: cualquiera = 7\n  x = x / 2\n  r[i] = x\n}', 1,
    v => [arr(v, [0])], r => r[0][0] === 3.5],
  ['piso y techo dan enteros que sirven de índice', 'fn nucleo(i, a, r) {\n  r[piso(a[i])] = techo(a[i])\n}', 3,
    v => [arr(v, [0.5, 1.5, 2.25]), arr(v, [0, 0, 0], 'entero')], r => r[1].join() === '1,2,3'],
  ['entero(piso(x)) y real(n): la conversión explícita que un núcleo puede anotar', 'fn nucleo(i, a, r, q) {\n  fijo k: entero = entero(piso(a[i] * 3.7))\n  r[i] = k * 2\n  q[i] = real(k) / 2.0\n}', 3,
    v => [arr(v, [0.5, 1.5, 2.25]), arr(v, [0, 0, 0], 'entero'), arr(v, [0, 0, 0])], r => r[1].join() === '2,10,16' && r[2].join() === '0.5,2.5,4'],
  ['entero de un real con decimales trunca hacia cero', 'fn nucleo(i, a, r) {\n  r[i] = entero(a[i])\n}', 2,
    v => [arr(v, [2.9, -2.9]), arr(v, [0, 0], 'entero')], r => r[0 + 1].join() === '2,-2'],
  ['minimo, maximo y absoluto', 'fn nucleo(i, a, r) {\n  r[i] = maximo(minimo(a[i], 2.0), 0.0 - 2.0) + absoluto(0 - i)\n}', 4,
    v => [arr(v, [5, -5, 1.5, 0]), arr(v, [0, 0, 0, 0])], r => r[1].join() === '2,-1,3.5,3'],
  ['|PI, potencias pequeñas y raíz', 'fn nucleo(i, r) {\n  r[i] = |PI * i ** 2 + raiz(2.0) ** 3\n}', 3,
    v => [arr(v, [0, 0, 0])], r => mismosBits(r[0], [0, 1, 2].map(i => Math.PI * (i * i) + Math.sqrt(2) * Math.sqrt(2) * Math.sqrt(2)))],
  ['para con paso negativo, romper y continuar', 'fn nucleo(i, r) {\n  var s = 0\n  para j en rango(10, 0, -2) {\n    si j == 4 { continuar }\n    si j == 2 { romper }\n    s += j\n  }\n  r[i] = s\n}', 1,
    v => [arr(v, [0], 'entero')], r => r[0][0] === 10 + 8 + 6],
  ['mientras, repetir y devolver temprano', 'fn nucleo(i, r) {\n  var c = 0\n  repetir 3 veces { c = c + 1 }\n  mientras c < 100 { c = c * 2 }\n  si i == 1 { devolver }\n  r[i] = c\n}', 2,
    v => [arr(v, [0, 0], 'entero')], r => r[0].join() === '192,0'],
  ['sino si encadenado y bool como argumento', 'fn nucleo(i, b, r) {\n  si i == 0 { r[i] = 1 } sino si b y i == 1 { r[i] = 2 } sino { r[i] = 3 }\n}', 3,
    v => [true, arr(v, [0, 0, 0], 'entero')], r => r[1].join() === '1,2,3'],
  ['operadores compuestos sobre arreglos', 'fn nucleo(i, r, q) {\n  r[i] += 1.5\n  r[i] *= 2.0\n  r[i] -= 1.0\n  r[i] /= 4.0\n  q[i] += i\n  q[i] *= 3\n}', 2,
    v => [arr(v, [1, 2]), arr(v, [5, 5], 'entero')], r => r[0].join() === '1,1.5' && r[1].join() === '15,18'],
  ['guardar en un arreglo entero se envuelve módulo 2^32, como Int32Array', 'fn nucleo(i, r) {\n  r[i] = 2147483647 + 1 + i\n}', 2,
    v => [arr(v, [0, 0], 'entero')], r => r[0].join() === '-2147483648,-2147483647'],
  ['longitud y tamano son el número de elementos', 'fn nucleo(i, a, r) {\n  r[i] = longitud(a) + tamano(a)\n}', 1,
    v => [arr(v, [1, 2, 3]), arr(v, [0], 'entero')], r => r[1][0] === 6],
  ['sumarAtomico entero: un histograma', 'fn nucleo(i, h) {\n  sumarAtomico(h, i % 4, 1)\n}', 1000,
    v => [arr(v, [0, 0, 0, 0], 'entero')], r => r[0].join() === '250,250,250,250'],
  ['un parámetro entero que recibe un real se ensancha', 'fn nucleo(i, a, r) {\n  a = a + 0.5\n  r[i] = a\n}', 1,
    v => [2, arr(v, [0])], r => r[1][0] === 2.5],
];
for (const [nombre, src, n, hacer, esperado] of casos) {
  let e;
  try { e = nucleoDe(src); } catch (x) { comprobar(nombre, false, msgDe(x)); continue; }
  const res = enTodos(e, n, hacer(e.vm));
  const dif = igualesEnTodos(res);
  if (dif) { comprobar(nombre, false, dif); continue; }
  // Los resultados, alineados con los argumentos: r[k] es el arreglo del argumento k.
  const alineado = [];
  let q = 0;
  for (const v of hacer(e.vm)) alineado.push(v && v.clase === 'arreglo' ? res.jit.arrs[q++] : null);
  comprobar(nombre, !res.jit.error && esperado(alineado),
    res.jit.error || JSON.stringify(res.jit.arrs));
}

// ============================================================================
console.log('\n── lo que no está en el subconjunto se rechaza con la línea');
// La cabecera ocupa 2 líneas, así que «línea 4» es la segunda del núcleo.
const rechazos = [
  ['texto', 'fn nucleo(i, r) {\n  var t = "hola"\n}', /línea 4: usa texto/],
  ['listas', 'fn nucleo(i, r) {\n  var l = [1, 2]\n}', /línea 4: crea una lista/],
  ['diccionarios', 'fn nucleo(i, r) {\n  var d = {"a": 1}\n}', /línea 4: crea un diccionario/],
  ['una variable capturada', 'var fuera = 3\nfn hacer() {\n  var k = 2\n  fn nucleo2(i, r) { r[i] = k }\n  devolver nucleo2\n}\nfijo nucleo = hacer()', /usa «k» de fuera/],
  ['una global', 'var g = 3\nfn nucleo(i, r) {\n  r[i] = g\n}', /línea 5: «g» es una variable de fuera del núcleo/],
  ['llamar a una función de usuario', 'fn doble(x) { devolver 2 * x }\nfn nucleo(i, r) {\n  r[i] = doble(i)\n}', /línea 5: llama a la función de usuario «doble»/],
  ['imprimir', 'fn nucleo(i, r) {\n  imprimir(i)\n}', /línea 4: «imprimir» no se puede llamar dentro de un núcleo/],
  ['lanzar', 'fn nucleo(i, r) {\n  lanzar 1\n}', /línea 4: usa «lanzar»/],
  ['intentar', 'fn nucleo(i, r) {\n  intentar { r[i] = 1 } capturar (e) { r[i] = 2 }\n}', /línea 4: usa intentar/],
  ['devolver un valor', 'fn nucleo(i, r) {\n  devolver 3\n}', /línea 4: devuelve un valor/],
  ['para sobre una lista', 'fn nucleo(i, r) {\n  para x en [1, 2] { r[i] = x }\n}', /línea 4: «para» solo recorre rango/],
  ['un índice real', 'fn nucleo(i, r) {\n  r[i / 2] = 1.0\n}', /línea 4: el índice de «r» tiene que ser entero/],
  ['un real en un arreglo entero', 'fn nucleo(i, r) {\n  r[i] = 0.5\n}', /línea 4: se guarda un real en el arreglo entero «r»/, v => [arr(v, [0], 'entero')]],
  ['copiar un arreglo', 'fn nucleo(i, r) {\n  var b = r\n}', /línea 4: copia el arreglo «r»/],
  ['condición que no es bool', 'fn nucleo(i, r) {\n  si i { r[i] = 1.0 }\n}', /línea 4: la condición de «si» tiene que ser un bool/],
  ['sumarAtomico usado como valor', 'fn nucleo(i, r) {\n  var x = sumarAtomico(r, 0, 1)\n}', /línea 4: «sumarAtomico» es una sentencia/],
  ['funciones anidadas', 'fn nucleo(i, r) {\n  fn g(x) { devolver x }\n}', /línea 4: declara la función «g»/],
  ['una variable bool y número a la vez', 'fn nucleo(i, r) {\n  var b: cualquiera = cierto\n  b = 3\n}', /línea 5: «b» es a veces bool y a veces un número/],
];
for (const [nombre, src, re, hacer] of rechazos) {
  let e;
  try { e = nucleoDe(src); } catch (x) { comprobar(nombre, false, msgDe(x)); continue; }
  let msg = null;
  try { e.vm.c1en.usar('jit', null); e.vm.c1en.paralelo(1, e.f, hacer ? hacer(e.vm) : [arr(e.vm, [0])], 'paralelo'); }
  catch (x) { msg = msgDe(x); }
  comprobar(`rechaza ${nombre}`, msg && re.test(msg), msg);
}
{
  const e = nucleoDe('fn nucleo(i, a, b) {\n  a[i] = b\n}');
  const pr = (args, re, nom) => {
    let msg = null;
    try { e.vm.c1en.paralelo(1, e.f, args, 'paralelo'); } catch (x) { msg = msgDe(x); }
    comprobar(nom, msg && re.test(msg), msg);
  };
  pr([arr(e.vm, [0])], /recibe 3 parámetro\(s\) y le llegan 2/, 'el número de argumentos se comprueba');
  pr([arr(e.vm, [0]), e.vm.nuevaLista([1])], /el argumento 4 \(«b»\) es una lista/, 'una lista se rechaza (y la pista dice cómo convertirla)');
  const c = e.vm.arrNuevo([1], 'complejo');
  pr([c, 1], /arreglo de tipo complejo/, 'un arreglo complejo se rechaza');
  let msg = null;
  try { e.vm.c1en.paralelo(1, e.f, [arr(e.vm, [1, 2, 3, 4]), 1], 'paralelo'); } catch (x) { msg = msgDe(x); }
  comprobar('y un argumento normal pasa', msg === null, msg);
}

// ============================================================================
console.log('\n── los fallos en ejecución: el hilo más bajo y la línea, igual en todos');
const fallos = [
  ['división entre cero', 'fn nucleo(i, r) {\n  r[i] = 1.0 / (i - 5)\n}', 9, /el hilo i = 5 falló en la línea 4: división entre cero/],
  ['// entre cero', 'fn nucleo(i, r) {\n  var x = 7 // (i - 3)\n}', 9, /el hilo i = 3 falló en la línea 4: división entre cero/],
  ['módulo entre cero', 'fn nucleo(i, r) {\n  var x = 7 % (i - 2)\n}', 9, /el hilo i = 2 falló en la línea 4: módulo entre cero/],
  ['índice fuera del arreglo', 'fn nucleo(i, r) {\n  r[i] = 1.0\n}', 7, /el hilo i = 5 falló en la línea 4: el índice se sale del arreglo «r»/],
  ['índice negativo al leer', 'fn nucleo(i, r) {\n  var x = r[i - 2]\n}', 5, /el hilo i = 0 falló en la línea 4: el índice se sale/],
  ['raíz de un negativo', 'fn nucleo(i, r) {\n  r[i] = raiz(2.0 - i)\n}', 5, /el hilo i = 3 falló en la línea 4: «raiz» de un número negativo/],
  ['log de cero', 'fn nucleo(i, r) {\n  r[i] = log(1.0 * (4 - i))\n}', 5, /el hilo i = 4 falló en la línea 4: «log» necesita un número positivo/],
  ['piso de un infinito', 'fn nucleo(i, r) {\n  var k = piso(|INFINITO)\n}', 5, /el hilo i = 0 falló en la línea 4: «piso» de un número que no es un entero exacto/],
  ['el paso de rango es 0', 'fn nucleo(i, r) {\n  para j en rango(0, 5, i - 1) { r[0] = 1.0 }\n}', 3, /el hilo i = 1 falló en la línea 4: el paso de «rango» es 0/],
  ['un bucle infinito se corta', 'fn nucleo(i, r) {\n  mientras cierto { r[0] = 1.0 }\n}', 2, /el hilo i = 0 falló en la línea 4: un hilo dio más de/],
];
for (const [nombre, src, n, re] of fallos) {
  const e = nucleoDe(src);
  const res = enTodos(e, n, [arr(e.vm, [0, 0, 0, 0, 0])]);
  const malos = Object.keys(res).filter(d => !res[d].error || !re.test(res[d].error));
  comprobar(`${nombre} (${Object.keys(res).join(', ')})`, !malos.length, malos.map(d => `${d}: ${res[d].error}`).join(' | '));
}

// ============================================================================
console.log('\n── azarHilo');
{
  const e = nucleoDe('fn nucleo(i, s, r) {\n  r[i] = azarHilo(s, i, 3)\n}');
  const r = enTodos(e, 2000, [123456789, arr(e.vm, new Array(2000).fill(0))]);
  comprobar('mismos bits en ' + DEVS.join(', '), !igualesEnTodos(r), igualesEnTodos(r));
  const xs = r.jit.arrs[0];
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  comprobar('en [0, 1) y con media ≈ 0,5', xs.every(x => x >= 0 && x < 1) && Math.abs(media - 0.5) < 0.03, media);
  comprobar('distinto por hilo', new Set(xs).size === xs.length);
  const e2 = nucleoDe('fn nucleo(i, r) {\n  r[i] = azarHilo(0 - 1099511627776 - 7, 9007199254740000 + i, 0 - 2)\n}');
  const r2 = enTodos(e2, 4, [arr(e2.vm, [0, 0, 0, 0])]);
  comprobar('con enteros negativos y de más de 32 bits, igual en todos', !igualesEnTodos(r2), igualesEnTodos(r2));
  const v = motor();
  v.m.ejecutar('usar azarHilo, paralelo de "nen"\nusar ceros, elemento de "numerico"\nvar r = ceros(4)\n' +
    'paralelo(4, fn(i, r) { r[i] = azarHilo(0 - 1099511627776 - 7, 9007199254740000 + i, 0 - 2) }, r)\n' +
    'imprimir(elemento(r, 2) == azarHilo(0 - 1099511627776 - 7, 9007199254740002, 0 - 2))');
  comprobar('y la función normal de Ñ da el mismo valor que el núcleo', v.out[0] === 'cierto', v.out.join(' '));
}

// ============================================================================
console.log('\n── vistas, solapes y arreglos de dos dimensiones');
{
  const e = motor();
  const r = e.m.ejecutar(CABECERA + 'usar ceros, transpuesta, redimensionar, secuencia, aListaA, trozoPaso de "numerico"\n' +
    'var m = redimensionar(secuencia(0.0, 6.0, 1.0), [2, 3])\nvar t = transpuesta(m)\n' +
    'fn doble(i, a) { a[i] = a[i] * 2 + i }\n' +
    'paralelo(6, doble, t)\nimprimir(aListaA(m))\n' +
    'var p = trozoPaso(secuencia(0.0, 8.0, 1.0), 0, 2)\nparalelo(4, doble, p)\nimprimir(aListaA(p))');
  comprobar('una transpuesta (no contigua) se modifica en su sitio, en orden lógico',
    r.ok && e.out[0] === '[[0, 4, 8], [7, 11, 15]]', r.ok ? e.out[0] : msgDe(r.errores[0]));
  comprobar('un trozo con paso también', r.ok && e.out[1] === '[0, 5, 10, 15]', e.out[1]);
  const e2 = nucleoDe('usar secuencia, transpuesta, redimensionar de "numerico"\nfn nucleo(i, a, b) {\n  a[i] = b[i]\n}');
  const m2 = e2.vm.arrNuevo([2, 2], 'real');
  let msg = null;
  try { e2.vm.c1en.paralelo(1, e2.f, [m2, m2], 'paralelo'); } catch (x) { msg = msgDe(x); }
  comprobar('el MISMO arreglo dos veces está permitido', msg === null, msg);
  const vista = new (m2.constructor)(m2.datos, [2], 'real', [1], 2, m2);
  e2.vm.registrar(vista);
  try { e2.vm.c1en.paralelo(1, e2.f, [m2, vista], 'paralelo'); msg = null; } catch (x) { msg = msgDe(x); }
  comprobar('una vista y su dueño a la vez, no (en la GPU se pisarían)', msg && /comparten memoria/.test(msg), msg);
}

// ============================================================================
console.log('\n── reducciones deterministas (vm.c1en.reducir)');
{
  const e = motor();
  const vm = e.vm;
  const vals = [];
  let s = 12345;
  for (let i = 0; i < 100003; i++) { s = (s * 1103515245 + 12345) % 2147483648; vals.push((s / 2147483648 - 0.5) * 1e3); }
  const a = arr(vm, vals);
  const res = {};
  // Si un dispositivo no puede reducir (pasó en Windows: gcc no enlazaba), es un
  // fallo de la prueba con su mensaje, no un volcado de pila que corta la suite.
  let fallo = null;
  for (const d of DEVS) {
    vm.c1en.usar(d, null);
    try { res[d] = ['suma', 'maximo', 'minimo'].map(op => vm.c1en.reducir(op, a)); }
    catch (x) { fallo = `${d}: ${msgDe(x)}`; res[d] = [NaN, NaN, NaN]; }
  }
  if (fallo) comprobar('las reducciones corren en todos los dispositivos', false, fallo);
  const pares = x => { const y = Float64Array.from(x); let len = y.length; while (len > 1) { const m = Math.ceil(len / 2); for (let j = 0; 2 * j + 1 < len; j++) y[j] = y[2 * j] + y[2 * j + 1]; if (len % 2) y[m - 1] = y[len - 1]; len = m; } return y[0]; };
  comprobar('suma por árbol fijo, igual al bit en ' + DEVS.join(', '), DEVS.every(d => Object.is(res[d][0], pares(vals))), JSON.stringify(res));
  comprobar('máximo y mínimo', DEVS.every(d => res[d][1] === Math.max(...vals) && res[d][2] === Math.min(...vals)), JSON.stringify(res));
  const ent = arr(vm, [3, -1, 7, 2, 2], 'entero');
  comprobar('sobre un arreglo entero', DEVS.every(d => { vm.c1en.usar(d, null); return vm.c1en.reducir('suma', ent) === 13 && vm.c1en.reducir('maximo', ent) === 7; }));
  comprobar('suma de un vacío es 0', vm.c1en.reducir('suma', arr(vm, [])) === 0);
  const nan = arr(vm, [1, NaN, 3]);
  comprobar('un NaN gana en máximo y mínimo, en todos', DEVS.every(d => { vm.c1en.usar(d, null); return Number.isNaN(vm.c1en.reducir('maximo', nan)) && Number.isNaN(vm.c1en.reducir('minimo', nan)); }));
}

// ============================================================================
console.log('\n── núcleos de biblioteca (vm.c1en.kernel), la interfaz de NEÑ');
{
  const e = motor();
  const vm = e.vm;
  const saxpy = vm.c1en.kernel({
    nombre: 'prueba_saxpy',
    params: [['n', 'i64'], ['a', 'f64'], ['x', 'f64*'], ['y', 'f64*']],
    cuerpo: 'y[i] = a * x[i] + y[i];',
    js: (n, a, x, y) => { for (let i = 0; i < n; i++) y[i] = a * x[i] + y[i]; },
  });
  const divmod = vm.c1en.kernel({
    nombre: 'prueba_divmod',
    params: [['n', 'i64'], ['d', 'i64'], ['a', 'i32*'], ['q', 'i32*'], ['r', 'i32*']],
    cuerpo: 'q[i] = (int)c1en_div_piso(a[i], d); r[i] = (int)c1en_mod(a[i], d);',
    js: (n, d, a, q, r) => { for (let i = 0; i < n; i++) { q[i] = Math.floor(a[i] / d); r[i] = ((a[i] % d) + d) % d; } },
  });
  const out = {};
  for (const d of DEVS) {
    vm.c1en.usar(d, null);
    const x = arr(vm, [1, 2, 3, 0.1]), y = arr(vm, [0.5, 0.25, 0.125, 0.3]);
    saxpy(4, 2.5, x, y);
    const a = arr(vm, [7, -7, 5, -5], 'entero'), q = arr(vm, [0, 0, 0, 0], 'entero'), r = arr(vm, [0, 0, 0, 0], 'entero');
    divmod(4, 3, a, q, r);
    const fy = new Float64Array([9, 9]);
    saxpy(2, 1.0, new Float64Array([1, 2]), fy);
    out[d] = [Array.from(y.datos), Array.from(q.datos), Array.from(r.datos), Array.from(fy)];
  }
  comprobar('saxpy y div/mod de enteros dan lo mismo que su respaldo js',
    DEVS.every(d => JSON.stringify(out[d]) === JSON.stringify(out.jit)) && out.jit[1].join() === '2,-3,1,-2' && out.jit[2].join() === '1,2,2,1',
    JSON.stringify(out));
  let msg = null;
  try { saxpy(4, 1.0, arr(vm, [1, 2, 3, 4], 'entero'), arr(vm, [1, 2, 3, 4])); } catch (x) { msg = msgDe(x); }
  comprobar('un arreglo del tipo equivocado se dice', msg && /es un arreglo real y llegó uno entero/.test(msg), msg);
  let lanzo = null;
  try { vm.c1en.kernel({ nombre: 'Malo', params: [['n', 'i64']], cuerpo: '', js: () => {} }); } catch (x) { lanzo = x.message; }
  comprobar('el nombre del núcleo se valida', lanzo && /\[a-z0-9_\]/.test(lanzo), lanzo);
  try { vm.c1en.kernel({ nombre: 'otro', params: [['a', 'f64']], cuerpo: '', js: () => {} }); lanzo = null; } catch (x) { lanzo = x.message; }
  comprobar('y que el primer parámetro sea n', lanzo && /\['n', 'i64'\]/.test(lanzo), lanzo);
  const tC = vm.c1en.fuenteKernel(saxpy, 'c'), tCu = vm.c1en.fuenteKernel(saxpy, 'cuda');
  comprobar('el C lleva OpenMP y el CUDA recorre a zancadas de cuadrícula',
    /#pragma omp parallel for/.test(tC) && /i \+= \(long long\)blockDim\.x \* gridDim\.x/.test(tCu));
}

// ============================================================================
console.log('\n── el CUDA C generado, por un front-end de CUDA de verdad (clang → PTX)');
const clangCuda = (() => {
  const r = spawnSync('clang++', ['-print-targets'], { encoding: 'utf8' });
  return r.status === 0 && /nvptx64/.test(r.stdout);
})();
if (!clangCuda) saltar('compilar con clang -x cuda', 'no hay clang con el destino nvptx64');
else {
  const e = nucleoDe('fn nucleo(i, x, y, h, a) {\n  var t = 0.0\n  para j en rango(4) { t += x[(i + j) % longitud(x)] * a }\n' +
    '  y[i] = raiz(absoluto(t)) + exp(t) - seno(t) * coseno(t) + angulo(t, 1.0) + minimo(t, |INFINITO)\n' +
    '  sumarAtomico(h, i % 3, 1)\n  sumarAtomico(y, 0, 0.5)\n  y[i] = y[i] // 0.3 + y[i] % 0.3 + log(1.0 + absoluto(t)) + azarHilo(1, i, 2)\n}');
  const x = arr(e.vm, [1, 2, 3]);
  const fuente = e.vm.c1en.codigo(e.f, [x, x, arr(e.vm, [0, 0, 0], 'entero'), 0.5], 'cuda', 'codigoCuda');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c1en-ptx-'));
  fs.writeFileSync(path.join(dir, 'k.cu'), fuente);
  const r = spawnSync('clang++', ['-x', 'cuda', '--cuda-device-only', '--cuda-gpu-arch=sm_75', '-nocudainc', '-nocudalib',
    '-O2', '-ffp-contract=off', '-std=c++17', '-Wall', '-Wno-unused-variable', '-Wno-unknown-cuda-version', '-include', path.join(SIM, 'cuda-clang.h'),
    '-S', path.join(dir, 'k.cu'), '-o', path.join(dir, 'k.ptx')], { encoding: 'utf8' });
  comprobar('compila a PTX para sm_75', r.status === 0, r.stderr);
  const ptx = r.status === 0 ? fs.readFileSync(path.join(dir, 'k.ptx'), 'utf8') : '';
  comprobar('el PTX no tiene ni una FMA (sin contracción, como --fmad=false)', ptx && !/\bfma\./.test(ptx));
  comprobar('y los reales se operan con redondeo explícito (mul.rn / add.rn)', /mul\.rn\.f64/.test(ptx) && /add\.rn\.f64/.test(ptx));
  comprobar('la raíz es sqrt.rn (IEEE, correctamente redondeada)', /sqrt\.rn\.f64/.test(ptx));
  comprobar('los atómicos son de verdad: atom.add y atom.min', /atom\.global\.add\.f64/.test(ptx) && /atom\.global\.add\.u32|atom\.global\.add\.s32/.test(ptx) && /atom\.global\.min\.u64/.test(ptx));
  comprobar('el núcleo se exporta con su nombre sin decorar (extern "C")', /\.entry c1en_nucleo\(/.test(ptx));
  // Y las reducciones y un núcleo de biblioteca.
  const red = e.vm.c1en.kernel({ nombre: 'k_clang', params: [['n', 'i64'], ['a', 'i32'], ['x', 'f64*'], ['q', 'i32*']],
    cuerpo: 'x[i] = sqrt(x[i]) * a; q[i] = (int)c1en_div_piso(q[i], 3);', js: () => {} });
  fs.writeFileSync(path.join(dir, 'b.cu'), e.vm.c1en.fuenteKernel(red, 'cuda'));
  const r2 = spawnSync('clang++', ['-x', 'cuda', '--cuda-device-only', '--cuda-gpu-arch=sm_75', '-nocudainc', '-nocudalib',
    '-O2', '-ffp-contract=off', '-std=c++17', '-Wno-unknown-cuda-version', '-include', path.join(SIM, 'cuda-clang.h'), '-S', path.join(dir, 'b.cu'), '-o', path.join(dir, 'b.ptx')], { encoding: 'utf8' });
  comprobar('un núcleo de biblioteca también compila a PTX', r2.status === 0, r2.stderr);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* nada */ }
}

// ============================================================================
console.log('\n── el simulador de GPU: cuadrícula, zancadas, memoria');
if (!DEVS.includes('gpu')) saltar('simulador', motivoSinGpu || 'sin gpu');
else {
  const e = nucleoDe('fn nucleo(i, r) {\n  r[i] = r[i] + i * 0.5\n}');
  const n = 1500;   // con 2 bloques de 256 (simulador), cada hilo hace 3 vueltas de cuadrícula
  const res = enTodos(e, n, [arr(e.vm, new Array(n).fill(1))]);
  comprobar(`n = ${n} con más hilos que cuadrícula: todos los índices, una vez`, !igualesEnTodos(res) && res.jit.arrs[0].every((v, i) => v === 1 + i * 0.5), igualesEnTodos(res));
  if (dirSim) {
    const koffi = require('koffi');
    const lib = koffi.load(process.env.C1EN_CUDA_LIB);
    const vivas = lib.func('long long c1en_sim_reservas_vivas(void)');
    const lanz = lib.func('long long c1en_sim_lanzamientos(void)');
    // Los arreglos se quedan RESIDENTES en la GPU hasta que mueren o alguien
    // los suelta; lo que no puede quedar vivo es nada más: tras soltar, solo la
    // palabra de error (una por GPU y proceso).
    const antes = Number(vivas());
    comprobar('los arreglos quedan residentes en la GPU (hay memoria viva tras el núcleo)', antes >= 1, antes);
    e.vm.c1en.liberarResidentes();
    comprobar('al soltar los residentes no queda memoria de la GPU sin liberar (salvo la palabra de error)', Number(vivas()) <= 2, vivas());
    comprobar('se lanzó de verdad por cuLaunchKernel', Number(lanz()) > 10, lanz());
    const e2 = nucleoDe('fn nucleo(i, r) {\n  r[i] = 1.0 / (i - 3)\n}');
    enTodos(e2, 10, [arr(e2.vm, new Array(10).fill(0))], ['gpu']);
    e2.vm.c1en.liberarResidentes();
    comprobar('ni después de un núcleo que falla', Number(vivas()) <= 2, vivas());
    // y la residencia es invisible: escribir desde la CPU entre dos núcleos se ve en el segundo
    const e4 = nucleoDe('fn nucleo(i, r) {\n  r[i] = r[i] * 2\n}');
    const a4 = arr(e4.vm, [1, 2, 3]);
    e4.vm.c1en.usar('gpu', 0);
    e4.vm.c1en.paralelo(3, e4.f, [a4], 'paralelo');
    a4.datos[0] = 100;                                   // la CPU lee (baja) y escribe
    e4.vm.c1en.paralelo(3, e4.f, [a4], 'paralelo');
    comprobar('escribir desde la CPU entre dos núcleos residentes se respeta', a4.datos.join() === '200,8,12', a4.datos.join());
  }
  const e3 = nucleoDe('fn nucleo(i, r) {\n  r[i] = i\n}');
  e3.vm.c1en.usar('gpu', 1);
  const g1 = enTodos(e3, 3, [arr(e3.vm, [0, 0, 0])], ['gpu']);
  comprobar('la segunda GPU también (usarDispositivo("gpu", 1))', !g1.gpu.error && g1.gpu.arrs[0].join() === '0,1,2' && e3.vm.c1en.describir().endsWith('(1)'), g1.gpu.error || e3.vm.c1en.describir());
}

// ============================================================================
console.log('\n── trascendentes: cerca, no al bit (V8, glibc y CUDA tienen las suyas)');
{
  const e = nucleoDe('fn nucleo(i, x, r) {\n  var t = x[i]\n  r[i] = exp(t) + log(t + 2.0) + seno(t) * coseno(t) + angulo(t, 0.5) + t ** 1.5\n}');
  const xs = []; for (let i = 0; i < 200; i++) xs.push(i / 40);
  const res = enTodos(e, 200, [arr(e.vm, xs), arr(e.vm, new Array(200).fill(0))]);
  let peor = 0;
  for (const d of DEVS) res[d].arrs[1].forEach((v, i) => { peor = Math.max(peor, Math.abs(v - res.jit.arrs[1][i]) / Math.max(1, Math.abs(v))); });
  comprobar('diferencia relativa < 1e-14 en ' + DEVS.join(', '), peor < 1e-14, peor);
}

// ============================================================================
console.log(`\n── fuzz: ${FUZZ} núcleos al azar, ${DEVS.join(' / ')}, comparados al bit`);
// En la GPU real salieron 10 de 300 núcleos distintos de la CPU, y no era el
// compilador: era el generador. Hacía que el hilo i leyera k[m % n] mientras
// otro hilo escribía k[i], una carrera. En CPU los hilos van en orden y gana
// siempre el mismo; en la GPU gana uno distinto cada vez, y eso está
// documentado como «depende del dispositivo». Así que los núcleos del fuzz
// leen de «x» y «k» y escriben SOLO en «y» y «ko»: cada hilo su casilla, y
// solo «h» se comparte, por sumarAtomico, que es para eso.
function fuzz(semilla) {
  let s = semilla >>> 0;
  const R = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = n => Math.floor(R() * n);
  const elige = xs => xs[ri(xs.length)];
  let nv = 0;
  const ambitos = [{ real: [], ent: [] }];
  const vars = t => ambitos.flatMap(a => a[t]);
  const REALES = ['0.5', '1.25', '3.0', '0.1', '1e-3', '7.75', '2.0', '0.0', '(0.0 - 1.5)'];
  const real = d => {
    const op = d <= 0 ? ri(4) : ri(17);
    switch (op) {
      case 0: return elige(REALES);
      case 1: return 's';
      case 2: return `x[(${ent(d - 1)}) % longitud(x)]`;      // solo lectura
      case 3: { const v = vars('real'); return v.length ? elige(v) : 's'; }
      case 4: case 5: case 6: return `(${real(d - 1)} ${elige(['+', '-', '*'])} ${real(d - 1)})`;
      case 7: return R() < 0.9 ? `(${real(d - 1)} / (${real(d - 1)} * ${real(d - 1)} + 0.5))` : `(${real(d - 1)} / ${real(d - 1)})`;
      case 8: return `(${ent(d - 1)} + ${real(d - 1)})`;
      case 9: return `raiz(absoluto(${real(d - 1)}))`;
      case 10: return `${elige(['minimo', 'maximo'])}(${real(d - 1)}, ${real(d - 1)})`;
      case 11: return `(${real(d - 1)}) ** ${elige(['2', '3', '0', '1', '4'])}`;
      case 12: return `azarHilo(m, i, ${ri(4)})`;
      case 13: return `(${real(d - 1)} // ${elige(['1.5', '0.25', '(0.0 - 2.0)'])})`;
      case 14: return `(${real(d - 1)} % ${elige(['2.5', '0.75', '(0.0 - 1.25)'])})`;
      case 15: return `(-${real(d - 1)})`;
      default: return `(${real(d - 1)} * ${ent(d - 1)})`;
    }
  };
  // Los enteros se mantienen pequeños a propósito: más allá de 2^53 JavaScript
  // redondea y C no, y esa diferencia está documentada, no es lo que se busca.
  const ent = d => {
    const op = d <= 0 ? ri(4) : ri(13);
    switch (op) {
      case 0: return String(ri(10));
      case 1: return 'i';
      case 2: return 'm';
      case 3: { const v = vars('ent'); return v.length ? elige(v) : 'i'; }
      case 4: return `k[(${ent(d - 1)}) % longitud(k)]`;      // solo lectura
      case 5: case 6: return `(${ent(d - 1)} ${elige(['+', '-'])} ${ent(d - 1)})`;
      case 7: return `(${ent(d - 1)} * ${elige(['2', '3', '(0 - 4)', '5'])})`;
      case 8: return `(${ent(d - 1)} // ${R() < 0.85 ? elige(['3', '(0 - 2)', '7']) : ent(d - 1)})`;
      case 9: return `(${ent(d - 1)} % ${R() < 0.85 ? elige(['3', '(0 - 5)', '8']) : ent(d - 1)})`;
      case 10: return `(${elige(['piso', 'techo'])}(${real(d - 1)}) % 1000)`;
      case 11: return `${elige(['minimo', 'maximo'])}(${ent(d - 1)}, ${ent(d - 1)})`;
      default: return `absoluto(${ent(d - 1)})`;
    }
  };
  const cond = d => {
    const op = d <= 0 ? ri(2) : ri(6);
    switch (op) {
      case 0: return `(${real(1)} < ${real(1)})`;
      case 1: return `(${ent(1)} ${elige(['==', '!=', '>=', '<'])} ${ent(1)})`;
      case 2: return `(${cond(d - 1)} y ${cond(d - 1)})`;
      case 3: return `(${cond(d - 1)} o ${cond(d - 1)})`;
      case 4: return `no ${cond(d - 1)}`;
      default: return elige(['cierto', 'falso']);
    }
  };
  const lineas = [];
  const sent = (d, ind, enBucle) => {
    const t = ' '.repeat(ind);
    const op = d <= 0 ? ri(6) : ri(13);
    const a = ambitos[ambitos.length - 1];
    switch (op) {
      case 0: { const nm = `r${nv++}`; lineas.push(`${t}var ${nm} = ${real(2)}`); a.real.push(nm); return; }
      case 1: { const nm = `e${nv++}`; lineas.push(`${t}var ${nm} = ${ent(2)}`); a.ent.push(nm); return; }
      case 2: { const v = vars('real'); if (v.length) lineas.push(`${t}${elige(v)} ${elige(['=', '+=', '-=', '*='])} ${real(2)}`); else lineas.push(`${t}y[i] = ${real(2)}`); return; }
      case 3: lineas.push(`${t}y[i] ${elige(['=', '+=', '-='])} ${real(2)}`); return;
      case 4: lineas.push(`${t}ko[i] ${elige(['=', '+='])} ${ent(2)}`); return;
      case 5: lineas.push(`${t}sumarAtomico(h, (${ent(1)}) % 8, ${ent(1)})`); return;
      case 6: case 7: {
        lineas.push(`${t}si ${cond(2)} {`);
        ambitos.push({ real: [], ent: [] }); bloque(d - 1, ind + 2, enBucle); ambitos.pop();
        if (R() < 0.5) { lineas.push(`${t}} sino {`); ambitos.push({ real: [], ent: [] }); bloque(d - 1, ind + 2, enBucle); ambitos.pop(); }
        lineas.push(`${t}}`);
        return;
      }
      case 8: case 9: {
        const j = `j${nv++}`;
        const ini = elige(['0', '1', 'm % 3', '(0 - 2)']), fin = elige(['3', '5', 'm % 6', '2']);
        lineas.push(`${t}para ${j} en rango(${ini}, ${fin}${R() < 0.3 ? ', ' + elige(['2', '(0 - 1)', '3']) : ''}) {`);
        ambitos.push({ real: [], ent: [j] }); bloque(d - 1, ind + 2, true); ambitos.pop();
        lineas.push(`${t}}`);
        return;
      }
      case 10: {
        const w = `w${nv++}`;
        lineas.push(`${t}var ${w} = 0`);
        lineas.push(`${t}mientras ${w} < ${1 + ri(4)} {`);
        lineas.push(`${t}  ${w} = ${w} + 1`);
        ambitos.push({ real: [], ent: [] }); bloque(d - 1, ind + 2, false); ambitos.pop();
        if (R() < 0.3) lineas.push(`${t}  si ${cond(1)} { romper }`);
        lineas.push(`${t}}`);
        return;
      }
      case 11: if (enBucle && R() < 0.5) lineas.push(`${t}si ${cond(1)} { ${elige(['romper', 'continuar'])} }`); else lineas.push(`${t}si ${cond(1)} { devolver }`); return;
      default: lineas.push(`${t}y[i] = y[i] + ${real(1)}`); return;
    }
  };
  const bloque = (d, ind, enBucle) => { const k = 1 + ri(3); for (let q = 0; q < k; q++) sent(d, ind, enBucle); };
  bloque(3, 2, false);
  lineas.push(`  y[i] = y[i] + ${vars('real').length ? elige(vars('real')) : 's'}`);
  return { src: `fn nucleo(i, x, y, k, ko, h, s, m) {\n${lineas.join('\n')}\n}`, R, ri };
}
{
  const N = 40;
  let pasan = 0, conFallo = 0, vistos = 0;
  const primeros = [];
  const t0 = Date.now();
  for (let q = 0; q < FUZZ; q++) {
    const { src, R, ri } = fuzz(1000 + q);
    let e;
    try { e = nucleoDe(src); }
    catch (x) { primeros.push(`núcleo ${q} no compila en Ñ: ${msgDe(x)}\n${src}`); continue; }
    const vm = e.vm;
    const xs = [], ys = [], ks = [];
    for (let j = 0; j < N; j++) {
      xs.push(R() < 0.1 ? 0 : (R() - 0.5) * 8);
      ys.push((R() - 0.5) * 2);
      ks.push(ri(41) - 20);
    }
    const args = [arr(vm, xs), arr(vm, ys), arr(vm, ks, 'entero'), arr(vm, new Array(N).fill(0), 'entero'), arr(vm, new Array(8).fill(0), 'entero'), (R() - 0.5) * 6, ri(30)];
    const res = enTodos(e, N, args);
    vistos++;
    const dif = igualesEnTodos(res);
    if (res.jit.error && /no se puede compilar/.test(res.jit.error)) { primeros.push(`núcleo ${q}: ${res.jit.error}\n${src}`); continue; }
    if (dif) { if (primeros.length < 3) primeros.push(`núcleo ${q}: ${dif}\n${src}`); continue; }
    if (res.jit.error) conFallo++;
    pasan++;
  }
  comprobar(`${pasan} de ${vistos} núcleos dan los mismos bits (y el mismo error, en ${conFallo} que fallan a propósito) en ${DEVS.join(', ')} · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    pasan === FUZZ, primeros.join('\n\n'));
}

// ============================================================================
console.log('\n── tiempos (informativos)');
{
  const e = nucleoDe('fn nucleo(i, ancho, alto, iter, r) {\n  var cx = -2.0 + 3.0 * (i % ancho) / ancho\n  var cy = -1.2 + 2.4 * (i // ancho) / alto\n' +
    '  var zx = 0.0\n  var zy = 0.0\n  var k = 0\n  mientras k < iter y zx * zx + zy * zy < 4.0 {\n    var t = zx * zx - zy * zy + cx\n' +
    '    zy = 2.0 * zx * zy + cy\n    zx = t\n    k = k + 1\n  }\n  r[i] = k\n}');
  const ancho = 400, alto = 300, iter = 200;
  const tiempos = {};
  let ref = null;
  for (const d of DEVS) {
    const r = arr(e.vm, new Array(ancho * alto).fill(0), 'entero');
    e.vm.c1en.usar(d, null);
    e.vm.c1en.paralelo(ancho * alto, e.f, [ancho, alto, iter, r], 'paralelo');   // calienta y compila
    const t0 = process.hrtime.bigint();
    e.vm.c1en.paralelo(ancho * alto, e.f, [ancho, alto, iter, r], 'paralelo');
    tiempos[d] = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ref === null) ref = Array.from(r.datos).join(); else if (Array.from(r.datos).join() !== ref) tiempos[d] = 'DISTINTO';
  }
  console.log(`   mandelbrot ${ancho}×${alto}×${iter}: ` + DEVS.map(d => `${d} ${typeof tiempos[d] === 'number' ? tiempos[d].toFixed(1) + ' ms' : tiempos[d]}`).join(' · '));
  comprobar('mandelbrot: el mismo dibujo en todos', Object.values(tiempos).every(t => typeof t === 'number'));
}

console.log(`\n${ok} pasan, ${mal} fallan${saltadas ? `, ${saltadas} saltadas` : ''} · C1EÑ (${DEVS.join(', ')}${dirSim ? ', gpu simulada' : ''})\n`);
process.exit(mal ? 1 : 0);
