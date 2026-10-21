// motor-exp · N4.5 «Tipos de máquina»: i8 u8 i16 u16 u32 i64 u64.
//
// Lo que se prueba:
//   1. la aritmética y los bits de Ñ, AL BIT contra NumPy (el árbitro de los
//      dtypes): para cada par de tipos, el tipo del resultado y sus bytes. Los
//      datos van y vienen con leerArregloBinario / escribirArregloBinario, así
//      que los de 64 bits llegan exactos y la E/S binaria queda probada también.
//      Sin python3 + numpy, esta parte se salta (y se dice).
//   2. lo exacto de 64 bits: leer un elemento grande da un «grande» exacto, la
//      suma es exacta, aTipo trunca y envuelve como C.
//   3. los núcleos de C1EÑ con arreglos de 8, 16 y 32 bits y las funciones de
//      bits, en jit, nativo y la GPU simulada: los tres, lo mismo que BigInt.
//   4. los errores: lo que todavía no entra se dice, con la salida.
//
//   node motor-exp/pruebas/exp-tipos.js          (--gpu: la GPU de verdad)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GPU_REAL = process.argv.includes('--gpu');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 10).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-tipos-'));

function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, extra || {}, dispositivo ? { C1EN_DISPOSITIVO: dispositivo } : {});
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// ── 1. contra NumPy ─────────────────────────────────────────────────────────
const ENTS = ['i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64'];
const NP = { i8: 'int8', u8: 'uint8', i16: 'int16', u16: 'uint16', i32: 'int32', u32: 'uint32', i64: 'int64', u64: 'uint64',
  f16: 'float16', f32: 'float32', f64: 'float64' };
// el nombre que da tipoArreglo para cada dtype de NumPy
const DE_NP = { int8: 'i8', uint8: 'u8', int16: 'i16', uint16: 'u16', int32: 'entero', uint32: 'u32', int64: 'i64', uint64: 'u64',
  float16: 'real16', float32: 'real32', float64: 'real', bool: 'bool' };
const numpy = hay('python3') && spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0;
if (!numpy) { saltadas++; console.log('  (sin python3 + numpy: la comparación con NumPy se salta)'); }
else {
  console.log('── contra NumPy (al bit)');
  const N = 64;
  const casos = [];   // [nombre, expresión Ñ, expresión numpy]
  const ent = (t, v) => `aTipo(${v}, "${t}")`;
  for (const ta of ENTS) for (const tb of ENTS) {
    for (const op of ['+', '-', '*'])
      casos.push([`${ta} ${op} ${tb}`, `a_${ta} ${op} b_${tb}`, `a_${ta} ${op} b_${tb}`]);
    // (con u64 y un entero con signo no hay entero común y el resultado es real:
    // ahí «//» y «%» son los de los reales de Ñ, que no son bit a bit los de NumPy)
    const sinComunE = (ta === 'u64' && ta !== tb && tb[0] === 'i') || (tb === 'u64' && ta !== tb && ta[0] === 'i');
    if (!sinComunE) {
      casos.push([`${ta} // ${tb}`, `a_${ta} // d_${tb}`, `a_${ta} // d_${tb}`]);
      casos.push([`${ta} % ${tb}`, `a_${ta} % d_${tb}`, `a_${ta} % d_${tb}`]);
    }
    casos.push([`${ta} / ${tb}`, `a_${ta} / d_${tb}`, `a_${ta} / d_${tb}`]);
    // los bits solo entre los que tienen un entero común (i64 con u64 no lo tiene)
    const sinComun = (ta === 'u64' && ta !== tb && tb[0] === 'i') || (tb === 'u64' && ta !== tb && ta[0] === 'i');
    if (!sinComun) for (const [f, o] of [['bitsY', '&'], ['bitsO', '|'], ['bitsXor', '^']])
      casos.push([`${f}(${ta}, ${tb})`, `${f}(a_${ta}, b_${tb})`, `a_${ta} ${o} b_${tb}`]);
  }
  void ent;
  for (const t of ENTS) {
    const bits = +t.slice(1);
    for (const k of [0, 1, 3, bits - 1])
      casos.push([`desplazarIzq(${t}, ${k})`, `desplazarIzq(a_${t}, ${k})`, `np.left_shift(a_${t}, ${k})`],
        [`desplazarDer(${t}, ${k})`, `desplazarDer(a_${t}, ${k})`, `np.right_shift(a_${t}, ${k})`]);
    casos.push([`bitsNo(${t})`, `bitsNo(a_${t})`, `~a_${t}`], [`-${t}`, `-a_${t}`, `-a_${t}`]);
    for (const s of [3, 7, 100]) casos.push([`${t} + ${s}`, `a_${t} + ${s}`, `a_${t} + ${s}`], [`${t} * ${s}`, `a_${t} * ${s}`, `a_${t} * ${s}`],
      [`${t} // ${s}`, `a_${t} // ${s}`, `a_${t} // ${s}`]);
    casos.push([`${t} - 5`, `a_${t} - 5`, `a_${t} - 5`], [`${t} % 7`, `a_${t} % 7`, `a_${t} % 7`]);
    // con un real de coma flotante gana ese real (la regla de N4.2, la de
    // PyTorch): la cuenta en double y un redondeo, que es lo que se compara
    for (const f of ['f16', 'f32', 'f64'])
      casos.push([`${t} + ${f}`, `a_${t} + b_${f}`, `(a_${t}.astype(np.float64) + b_${f}.astype(np.float64)).astype(np.${NP[f]})`],
        [`${f} * ${t}`, `b_${f} * a_${t}`, `(b_${f}.astype(np.float64) * a_${t}.astype(np.float64)).astype(np.${NP[f]})`]);
    casos.push([`${t} * 2.5`, `a_${t} * 2.5`, `a_${t} * np.float64(2.5)`]);
    for (const u of [...ENTS, 'f16', 'f32', 'f64']) casos.push([`aTipo(${t}, ${u})`, `aTipo(a_${t}, "${u}")`, `a_${t}.astype(np.${NP[u]})`]);
  }
  // python: los datos (al azar, con los extremos de cada tipo) y lo que da NumPy
  const py = `
import numpy as np, sys, json, os
d = sys.argv[1]
rng = np.random.default_rng(45)
def datos(t, nocero):
    info = np.iinfo(t)
    x = rng.integers(info.min, info.max, size=${N}, dtype=t, endpoint=True)
    x[:4] = np.array([info.min, info.max, 0, 1], dtype=object).astype(t) if not nocero else np.array([info.min, info.max, 1, -1 if info.min < 0 else 2], dtype=object).astype(t)
    if nocero: x[x == 0] = 3
    return x
v = {}
for t in ${JSON.stringify(ENTS)}:
    v['a_' + t] = datos(np.dtype(${JSON.stringify(NP)}[t]), False)
    v['b_' + t] = datos(np.dtype(${JSON.stringify(NP)}[t]), False)
    v['d_' + t] = datos(np.dtype(${JSON.stringify(NP)}[t]), True)
for f in ['f16', 'f32', 'f64']:
    v['b_' + f] = (rng.standard_normal(${N}) * 100).astype(${JSON.stringify(NP)}[f])
for k, x in v.items():
    x.tofile(os.path.join(d, k + '.bin'))
casos = json.load(open(os.path.join(d, 'casos.json')))
out = []
np.seterr(all='ignore')
import warnings; warnings.simplefilter('ignore')
for i, (nombre, _, e) in enumerate(casos):
    try:
        r = eval(e, {'np': np}, v)
        r.tofile(os.path.join(d, 'np_%d.bin' % i))
        out.append(str(r.dtype))
    except Exception as ex:
        out.append('error: ' + type(ex).__name__)
json.dump(out, open(os.path.join(d, 'np.json'), 'w'))
`;
  fs.writeFileSync(path.join(tmp, 'casos.json'), JSON.stringify(casos));
  fs.writeFileSync(path.join(tmp, 'np.py'), py);
  const rp = spawnSync('python3', [path.join(tmp, 'np.py'), tmp], { encoding: 'utf8' });
  if (rp.status !== 0) comprobar('python + numpy prepara los datos', false, rp.stderr);
  else {
    const tiposNp = JSON.parse(fs.readFileSync(path.join(tmp, 'np.json'), 'utf8'));
    // el programa de Ñ: lee los mismos datos y escribe cada resultado
    let src = 'usar aTipo, tipoArreglo, bitsY, bitsO, bitsXor, bitsNo, desplazarIzq, desplazarDer de "numerico"\n';
    for (const t of ENTS) for (const p of ['a', 'b', 'd'])
      src += `fijo ${p}_${t} = leerArregloBinario("${p}_${t}.bin", "${t}", [${N}])\n`;
    for (const f of ['f16', 'f32', 'f64']) src += `fijo b_${f} = leerArregloBinario("b_${f}.bin", "${f}", [${N}])\n`;
    casos.forEach(([, e], i) => {
      src += `intentar { fijo r = ${e}\n escribirArregloBinario("n_${i}.bin", r)\n imprimir(tipoArreglo(r)) } capturar (e) { imprimir("error") }\n`;
    });
    const r = correr(src, 'jit');
    const lineas = r.out.split('\n');
    let malos = [], iguales = 0, errores = 0, tipoMal = 0;
    casos.forEach(([nombre], i) => {
      const tn = lineas[i], tp = tiposNp[i];
      if (tp.startsWith('error')) {
        if (tn === 'error') { errores++; return; }
        malos.push(`${nombre}: NumPy da ${tp} y Ñ da ${tn}`); return;
      }
      if (tn !== DE_NP[tp]) { tipoMal++; malos.push(`${nombre}: el tipo es ${DE_NP[tp]} (NumPy ${tp}) y Ñ da ${tn}`); return; }
      const a = fs.readFileSync(path.join(tmp, `n_${i}.bin`)), b = fs.readFileSync(path.join(tmp, `np_${i}.bin`));
      if (!a.equals(b)) {
        // NaN: el mismo, aunque con otros bits de carga
        malos.push(`${nombre}: los bytes no coinciden`); return;
      }
      iguales++;
    });
    if (!r.ok) malos.unshift(r.err.slice(0, 400));
    comprobar(`${casos.length} operaciones entre los 8 enteros (y con real16/real32/real): el tipo del resultado y sus bytes, iguales a NumPy`,
      malos.length === 0, malos.slice(0, 10).join('\n'));
    console.log(`      (${iguales} al bit${errores ? ` · ${errores} que NumPy tampoco deja hacer` : ''})`);
    void tipoMal;
  }
}

// ── 2. lo exacto de 64 bits y las conversiones ───────────────────────────────
console.log('── 64 bits exactos y conversiones');
{
  const src = `usar arreglo, aTipo, aListaA, suma, ceros, unos, tipoArreglo, desplazarIzq, bitsNo, contarBits, elemento de "numerico"
fijo dos62 = desplazarIzq(1, 62)
fijo h = unos(3, "i64") * dos62
imprimir(suma(h))
fijo g = ceros(2, "u64")
g[0] = desplazarIzq(1, 64) - 1
g[1] = 12345
imprimir(g[0], g[1], elemento(g, 0) == desplazarIzq(1, 64) - 1)
imprimir(aListaA(g + g))
imprimir(aListaA(aTipo(arreglo([300.7, -1.5, 255.9, -129.2], "real"), "u8")), aListaA(aTipo(arreglo([300.7, -1.5, 127.9, -129.2], "real"), "i8")))
imprimir(bitsNo(5), desplazarIzq(1, 70), contarBits(255), aListaA(contarBits(arreglo([-1, 3], "i16"))))
imprimir(tipoArreglo(arreglo([1, 2], "i32")), tipoArreglo(arreglo([1, 2], "f32")), tipoArreglo(arreglo([1, 2], "f64")), tipoArreglo(arreglo([1, 2], "f16")))
fijo c = arreglo([200, 100], "u8")
c[0] = 300
imprimir(aListaA(c), aListaA(c * 2), aListaA(c - 101))
`;
  const r = correr(src);
  const L = r.out.split('\n');
  const M = 2n ** 64n - 1n;
  comprobar('suma de un i64 exacta (3·2^62, más de 2^63)', L[0] === String(3n * 2n ** 62n), r.out + r.err);
  comprobar('un u64 guarda 2^64 − 1 y se lee como un grande exacto; los chicos, como números', L[1] === `${M} 12345 cierto`, L[1]);
  comprobar('u64 + u64 envuelve en 64 bits', L[2] === `[${(2n * M) % (2n ** 64n)}, 24690]`, L[2]);
  comprobar('aTipo de real a u8 / i8: trunca y envuelve, como (uint8_t)(int64_t) en C', L[3] === '[44, 255, 255, 127] [44, -1, 127, 127]', L[3]);
  comprobar('bits de números sueltos: complemento a dos sin fin (bitsNo(5) = −6, 1 << 70 exacto); contarBits', L[4] === `-6 ${2n ** 70n} 8 [16, 2]`, L[4]);
  comprobar('los nombres de NumPy: i32 es entero, f32 real32, f64 real, f16 real16', L[5] === 'entero real32 real real16', L[5]);
  comprobar('guardar 300 en un u8 es 44; u8 · 2 y u8 − 101 envuelven', L[6] === '[44, 100] [88, 200] [199, 255]', L[6]);
}

// ── 3. los núcleos de C1EÑ ───────────────────────────────────────────────────
let envGpu = null, motivoSinGpu = null;
if (GPU_REAL) envGpu = {};
else if (!koffi) motivoSinGpu = 'no hay koffi';
else if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para el simulador';
else {
  const SIM = path.join(__dirname, 'c1en-sim');
  const dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  fs.mkdirSync(dirSim, { recursive: true });
  const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
  const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA].concat(process.platform === 'win32' ? [] : ['-ldl']), { encoding: 'utf8' });
  const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim };
  }
}
const NUCLEOS = `usar paralelo, sumarAtomico de "nen"
usar arreglo, aListaA, ceros, bitsY, bitsO, bitsXor, bitsNo, desplazarIzq, desplazarDer de "numerico"
fn mezcla(i, x, y, z, w) {
  var h = x[i] * 40503 + i
  h = bitsXor(h, desplazarDer(h, 13))
  h = bitsY(h, 4294967295)
  y[i] = h
  z[i] = x[i] * 77 + bitsNo(i)
  w[i] = bitsO(desplazarIzq(x[i] % 1000, 7), 5) - 70000
}
fn histo(i, x, cuenta) { sumarAtomico(cuenta, x[i] % 4, 4000000000) }
fijo x = arreglo([1, 2, 3, 200, 4000000000, 12345, 4294967295, 0], "u32")
fijo y = ceros(8, "u32")
fijo z = ceros(8, "i8")
fijo w = ceros(8, "u16")
paralelo(8, mezcla, x, y, z, w)
imprimir(aListaA(y))
imprimir(aListaA(z))
imprimir(aListaA(w))
fijo cuenta = ceros(4, "u32")
paralelo(8, histo, x, cuenta)
imprimir(aListaA(cuenta))
fn mal(i, x) { x[i] = desplazarIzq(x[i], 40) }
intentar { paralelo(8, mal, x) } capturar (e) { imprimir(e.mensaje) }
fn mal2(i, x) { x[i] = desplazarDer(x[i], i * 10) }
intentar { paralelo(8, mal2, x) } capturar (e) { imprimir(e.mensaje) }
fn chico(i, z) { sumarAtomico(z, i, 1) }
intentar { paralelo(8, chico, z) } capturar (e) { imprimir(e.mensaje) }
fijo g = ceros(8, "i64")
fn copia(i, g) { g[i] = i }
intentar { paralelo(8, copia, g) } capturar (e) { imprimir(e.mensaje) }
`;
// lo que tiene que dar, con BigInt
const esperadoNucleos = (() => {
  const xs = [1n, 2n, 3n, 200n, 4000000000n, 12345n, 4294967295n, 0n];
  const y = [], z = [], w = [], cuenta = [0n, 0n, 0n, 0n];
  xs.forEach((x, i) => {
    let h = x * 40503n + BigInt(i);
    h ^= h >> 13n; h &= 0xffffffffn; y.push(h);
    z.push(BigInt.asIntN(8, x * 77n + ~BigInt(i)));
    w.push(BigInt.asUintN(16, (((x % 1000n) << 7n) | 5n) - 70000n));
    cuenta[Number(x % 4n)] = BigInt.asUintN(32, cuenta[Number(x % 4n)] + 4000000000n);
  });
  return [`[${y.join(', ')}]`, `[${z.join(', ')}]`, `[${w.join(', ')}]`, `[${cuenta.join(', ')}]`];
})();
const dispositivos = [['jit', {}]];
if (koffi && hay('gcc')) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }
if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
for (const [d, env] of dispositivos) {
  console.log(`── núcleos en ${d}${d === 'gpu' && !GPU_REAL ? ' (simulada)' : ''}`);
  const r = correr(NUCLEOS, d, env);
  const L = r.out.split('\n');
  comprobar(`${d}: u32, i8 y u16 en un núcleo, con bitsY/bitsXor/bitsO/bitsNo/desplazar: lo mismo que BigInt`,
    L.slice(0, 3).join('\n') === esperadoNucleos.slice(0, 3).join('\n'), r.out + r.err + '\nesperado:\n' + esperadoNucleos.join('\n'));
  comprobar(`${d}: sumarAtomico sobre un u32 envuelve en 32 bits`, L[3] === esperadoNucleos[3], L[3] + ' · ' + esperadoNucleos[3]);
  comprobar(`${d}: desplazarIzq que no cabe en 2^53 falla con su línea (el hilo más bajo)`,
    /^«paralelo»: el hilo i = 4 falló en la línea 23: «desplazarIzq»: el resultado no cabe exacto/.test(L[4] || ''), L[4]);
  comprobar(`${d}: un desplazamiento de más de 63 falla`, /el hilo i = 7 falló en la línea 25: «desplazarDer»: el desplazamiento va de 0 a 63/.test(L[5] || ''), L[5]);
  comprobar(`${d}: sumarAtomico en 8 bits se rechaza al compilar el núcleo; un i64 todavía no entra`,
    /sumarAtomico» sobre un arreglo i8/.test(L[6] || '') && /arreglo de tipo i64/.test(L[7] || ''), L[6] + '\n' + L[7]);
}

// ── 4. lo que todavía no ─────────────────────────────────────────────────────
console.log('── lo que todavía no');
{
  const src = `usar arreglo, media, aTipo, ceros, aListaA, bitsY de "numerico"
fijo a = ceros(4, "i64")
intentar { imprimir(media(a)) } capturar (e) { imprimir(e.mensaje) }
imprimir(media(aTipo(a, "real")))
intentar { imprimir(aListaA(arreglo([1, 2], "u8") + 0.5)) } capturar (e) { imprimir(e.mensaje) }
intentar { imprimir(aTipo(arreglo([1e308, 1.0], "real") * 10.0, "u8")) } capturar (e) { imprimir(e.mensaje) }
intentar { imprimir(ceros(2, "i128")) } capturar (e) { imprimir(e.mensaje) }
intentar { imprimir(bitsY(ceros(2, "i64"), ceros(2, "u64"))) } capturar (e) { imprimir(e.mensaje) }
intentar { imprimir(bitsY(ceros(2), 1)) } capturar (e) { imprimir(e.mensaje) }
`;
  const r = correr(src);
  const L = r.out.split('\n');
  comprobar('una función que no sabe de i64 lo dice, con la salida (aTipo a real)', /«media» todavía no trabaja con arreglos i64/.test(L[0] || '') && L[1] === '0', r.out + r.err);
  comprobar('un u8 + 0.5 da real (como NumPy con un real suelto)', L[2] === '[1.5, 2.5]', L[2]);
  comprobar('bits entre i64 y u64 (no hay entero común) y de un arreglo real: se dice',
    /i64 con u64 no tiene un entero común/.test(L[5] || '') && /arreglos ENTEROS y el argumento 1 es real/.test(L[6] || ''), L[5] + '\n' + L[6]);
  comprobar('NaN a u8 no cabe; un tipo que no existe lo lista', /Infinity no cabe en un u8/.test(L[3] || '') && /"i8", "u8"/.test(L[4] || ''), L[3] + '\n' + L[4]);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas por falta de herramientas` : '') + (envGpu && !GPU_REAL ? ' · GPU simulada' : ''));
process.exit(fallan ? 1 : 0);
