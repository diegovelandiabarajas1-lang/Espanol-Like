// motor-exp · fase N2: NEÑ en el dispositivo de C1EÑ (GPU si la hay, si no C).
//
//   1. pruebas/datos-nen/dispositivos.esl calcula 29 cosas de NEÑ (aritmética
//      de arreglos, reducciones, por, multLotes, Fourier, unarias…) en jit y en
//      el dispositivo pedido, y las compara: las exactas número a número, las
//      de seno/exp a 1e-14. Se corre en «nativo» y en la GPU SIMULADA (la libcuda
//      y la libnvrtc falsas de pruebas/c1en-sim, las mismas de pruebas/c1en.js).
//   2. La residencia: una cadena de NEÑ en la GPU sube los datos una vez y no
//      los baja hasta que se leen (se cuentan con C1EN_ESTADISTICAS).
//
// Con «--gpu» usa la GPU de verdad en vez del simulador (en Kaggle).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');

const GPU_REAL = process.argv.includes('--gpu');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
const PROG = path.join(__dirname, 'datos-nen', 'dispositivos.esl');
let pasan = 0, fallan = 0, saltadas = 0;
const fallos = [];
const comprobar = (nombre, cond, detalle) => { if (cond) pasan++; else { fallan++; fallos.push(`✗ ${nombre}` + (detalle ? `\n    ${detalle}` : '')); } };

const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }

// ── el simulador (como en pruebas/c1en.js) ───────────────────────────────────
let envGpu = null, motivoSinGpu = null;
if (GPU_REAL) envGpu = {};
else if (!koffi) motivoSinGpu = 'no hay koffi';
else if (!hay('gcc') || !hay('g++')) motivoSinGpu = 'no hay gcc/g++ para el simulador';
else {
  const SIM = path.join(__dirname, 'c1en-sim');
  const dirSim = path.join(os.tmpdir(), `c1en-sim-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  fs.mkdirSync(dirSim, { recursive: true });
  const tmpA = path.join(dirSim, `libcuda.${process.pid}.so`), tmpB = path.join(dirSim, `libnvrtc.${process.pid}.so`);
  const a = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libcuda-falsa.c'), '-o', tmpA, '-ldl'], { encoding: 'utf8' });
  const b = spawnSync('gcc', ['-shared', '-fPIC', '-O1', path.join(SIM, 'libnvrtc-falsa.c'), '-o', tmpB], { encoding: 'utf8' });
  if (a.status || b.status) motivoSinGpu = 'no compiló el simulador: ' + a.stderr + b.stderr;
  else {
    fs.renameSync(tmpA, path.join(dirSim, 'libcuda.so')); fs.renameSync(tmpB, path.join(dirSim, 'libnvrtc.so'));
    envGpu = { C1EN_CUDA_LIB: path.join(dirSim, 'libcuda.so'), C1EN_NVRTC_LIB: path.join(dirSim, 'libnvrtc.so'),
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim };
  }
}

function correr(dispositivo, archivo, args, extra) {
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo });
  const r = spawnSync(process.execPath, [N_NODE, archivo, ...(args || [])], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// ── 1. lo mismo en jit y en cada dispositivo ─────────────────────────────────
const dispositivos = [];
if (koffi && hay('gcc')) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }
if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
for (const [d, env] of dispositivos) {
  const r = correr(d, PROG, [d], env);
  if (!r.ok) { comprobar(`${d}: el programa corre`, false, (r.out + '\n' + r.err).split('\n').slice(-6).join('\n    ')); continue; }
  const lineas = r.out.split('\n');
  const pruebas = lineas.filter(l => /: (cierto|falso)$/.test(l));
  const malas = pruebas.filter(l => l.endsWith('falso'));
  comprobar(`${d}: ${pruebas.length} operaciones de NEÑ dan lo mismo que en jit (exactas al bit, seno/exp a 1e-14)`,
    pruebas.length >= 30 && !malas.length, malas.join(' · ') || `solo ${pruebas.length} pruebas`);
  comprobar(`${d}: dividir entre cero sigue siendo un error en los tres casos`,
    lineas.filter(l => /entre (cero|0): división entre cero$/.test(l)).length === 3, lineas.filter(l => /cero|entre 0/.test(l)).join(' · '));
  comprobar(`${d}: corrió de verdad en ese dispositivo`, lineas.some(l => l.startsWith('fin en ' + d)), lineas[lineas.length - 1]);
}

// ── 2. la residencia: cuánto cruza el PCIe ───────────────────────────────────
if (envGpu) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nen-gpu-'));
  const prog = (nombre, src) => { const f = path.join(tmp, nombre); fs.writeFileSync(f, src); return f; };
  const trafico = txt => {
    const m = /(\d+) lanzamientos · (\d+) subidas \(([\d.]+) MB\) · (\d+) bajadas \(([\d.]+) MB\)/.exec(txt);
    return m ? { lanz: +m[1], subidas: +m[2], mbSub: +m[3], bajadas: +m[4], mbBaj: +m[5] } : null;
  };
  const casos = [
    ['cadena de arreglos (8 MB): sube una vez y no baja', 'usar reparto, senoA, expA, suma de "nen"\nfijo x = reparto(0.0, 1.0, 1048576)\nfijo y = expA(senoA(x)) * 2 + 1\nimprimir(suma(y) > 0)\n',
      t => t.mbSub <= 8.1 && t.mbBaj < 0.1],
    ['por(por(A, A), A): A sube una vez, solo baja la suma', 'usar azarArreglo, semilla, por, suma de "nen"\nsemilla(1)\nfijo A = azarArreglo([512, 512])\nimprimir(suma(por(por(A, A), A)) > 0)\n',
      t => t.subidas === 1 && t.mbBaj < 0.1],
    ['fourier de 2^20: los datos suben y bajan una vez, no en cada etapa', 'usar reparto, fourier, parteReal de "nen"\nfijo f = fourier(reparto(0.0, 1.0, 1048576))\nimprimir(tipo(f))\n',
      t => t.bajadas === 1 && t.mbSub < 30],
  ];
  for (const [nombre, src, ok] of casos) {
    const r = correr('gpu', prog(nombre.slice(0, 5).replace(/\W/g, '_') + '.esl', src), [], Object.assign({ C1EN_ESTADISTICAS: '1' }, envGpu));
    const t = trafico(r.err);
    comprobar(`residencia: ${nombre}`, r.ok && t && ok(t), t ? JSON.stringify(t) : r.err.slice(0, 300));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 3. los mismos números que el LTS ─────────────────────────────────────────
// fourier, fourierInversa, espectro, convolucion, por y la aritmética de
// arreglos ahora pasan por los núcleos de NEÑ: tienen que dar exactamente lo
// que daba el motor LTS con su JavaScript.
{
  const lts = path.join(__dirname, '..', '..', 'motor', 'bundle.js');
  const guion = path.join(__dirname, 'datos-nen', 'igual-que-lts.js');
  if (!fs.existsSync(lts)) { saltadas++; console.log('  (no está motor/bundle.js: no se compara con el LTS)'); }
  else {
    const una = (bundle, d, env) => {
      const r = spawnSync(process.execPath, [guion, bundle], { encoding: 'utf8', maxBuffer: 1 << 28,
        env: Object.assign({}, process.env, env || {}, { C1EN_DISPOSITIVO: d }) });
      try { return JSON.parse(r.stdout); } catch (_) { return { error: (r.stderr || '').slice(0, 300) }; }
    };
    const base = una(lts, 'jit');
    for (const [d, env] of [['jit', {}]].concat(dispositivos)) {
      const otro = una(R.bundle, d, env);
      const distintos = Object.keys(base).filter(k => JSON.stringify(base[k]) !== JSON.stringify(otro[k]));
      comprobar(`${d}: fourier, inversa, espectro, convolución, por y x*2+1 iguales al LTS, al bit`, !distintos.length && !otro.error,
        otro.error || 'distintos: ' + distintos.join(', '));
    }
  }
}

console.log('');
for (const f of fallos) console.log(f);
const total = pasan + fallan;
if (!total) { console.log('exp-nen-gpu: saltada entera'); process.exit(0); }
console.log(`\n  ${pasan} pasan · ${fallan} fallan` + (saltadas ? ` · ${saltadas} saltadas` : '') + (GPU_REAL ? ' · GPU de verdad' : ' · GPU simulada') + '\n');
process.exit(fallan ? 1 : 0);
