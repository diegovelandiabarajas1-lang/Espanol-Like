// motor-exp · N4.3 «Trabajo asíncrono en la GPU»: colas, eventos y lanzar sin esperar.
//
// Se prueba con la GPU SIMULADA en modo perezoso (C1EN_SIM_PEREZOSO=1): ahí no
// corre NADA hasta que alguien lo necesita, así que una sincronización o una
// espera entre colas que falte se nota siempre —en una GPU de verdad el núcleo
// acabaría «a tiempo» casi siempre y el fallo saldría una vez de cada mil—.
// Lo mismo se corre en jit y en nativo (las colas existen pero todo es en el
// acto) y tiene que dar lo mismo.
//
//   node motor-exp/pruebas/exp-asincrono.js          (--gpu: la GPU de verdad)
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
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 8).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-asincrono-'));

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
      C1EN_SIM_CABECERA: path.join(SIM, 'cuda-falsa.h'), C1EN_SIM_DIR: dirSim, C1EN_SIM_PEREZOSO: '1' };
  }
}
function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, extra || {}, { C1EN_DISPOSITIVO: dispositivo, C1EN_ESTADISTICAS: '1' });
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26 });
  const m = /(\d+) lanzamientos · (\d+) subidas \(([\d.]+) MB\) · (\d+) bajadas \(([\d.]+) MB\)/.exec(r.stderr || '');
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(),
    trafico: m ? { lanz: +m[1], subidas: +m[2], bajadas: +m[4] } : null };
}

const CAB = `usar paralelo, usarDispositivo, colaGpu, enCola, esperarCola, colaLista, soltarCola, promesaCola, subirGpu, medirGpu de "nen"
usar ceros, suma, aListaA, tamano de "nen"
`;
// 1. Dos colas que dependen una de otra, sin que el programa diga nada: la de
//    abajo lee lo que escribe la de arriba, y luego la de arriba escribe lo que
//    la de abajo todavía lee. Si C1EÑ no pusiera las esperas, el modo perezoso
//    daría basura.
const DEPENDENCIAS = CAB + `
fn llenar(i, x) { x[i] = i * 1.0 }
fn masUno(i, x, y) { y[i] = x[i] + 1 }
fn doble(i, y, z) { z[i] = y[i] * 2 }
fn cien(i, x) { x[i] = 100.0 }
fijo N = 100000
fijo x = ceros(N)
fijo y = ceros(N)
fijo z = ceros(N)
fijo a = colaGpu()
fijo b = colaGpu()
paralelo(N, llenar, x)
enCola(a, fn() { paralelo(N, masUno, x, y) })          # a: y = x + 1  (lee x, escribe y)
enCola(b, fn() { paralelo(N, doble, y, z) })           # b: z = 2y     (tiene que esperar a «a»)
enCola(b, fn() { paralelo(N, cien, x) })               # b: x = 100    (tiene que esperar a que «a» lea x)
esperarCola(a)
esperarCola(b)
imprimir("y", suma(y))
imprimir("z", suma(z))
imprimir("x", suma(x))
`;
// 2. Una cadena de núcleos en la cola de siempre no espera tras cada uno: solo
//    baja una vez, al leer.
const CADENA = CAB + `usar senoA, absolutoA de "nen"
fn llenar(i, x) { x[i] = (i % 1000) / 1000.0 }
fijo N = 131072
fijo x = ceros(N)
paralelo(N, llenar, x)
var y = x
para k en rango(6) { y = senoA(y) * 2.0 + 1.0 }
imprimir("cadena", suma(absolutoA(y)))
`;
// 3. Un fallo dentro de una cola se dice al esperarla, con su línea.
const ERRORES = CAB + `
fn fuera(i, x) { x[i + 5] = 1.0 }
fijo x = ceros(10)
fijo c = colaGpu()
enCola(c, fn() { paralelo(10, fuera, x) })
imprimir("lanzado sin esperar")
intentar { esperarCola(c) } capturar (e) { imprimir("al esperar:", e.mensaje) }
paralelo(10, fuera, x)
`;
// 4. Esperar sin bloquear: una función asíncrona espera la promesa de la cola
//    y mientras tanto el programa sigue; subirGpu y medirGpu.
const ASINC = CAB + `
fn llenar(i, x) { x[i] = i * 0.5 }
fn cuadrado(i, x) { x[i] = x[i] * x[i] }
fijo N = 50000
fijo x = ceros(N)
paralelo(N, llenar, x)
fijo c = colaGpu()
fijo w = ceros(N)
enCola(c, fn() { subirGpu(w) })
enCola(c, fn() { paralelo(N, cuadrado, x) })
fn principal() {
  esperar promesaCola(c)
  imprimir("la cola terminó", suma(x))
}
fijo p = principal()
imprimir("mientras tanto, la CPU sigue")
fijo t = medirGpu(fn() { paralelo(N, cuadrado, w) })
imprimir("medirGpu da un número:", t >= 0)
fijo d = colaGpu()
enCola(d, fn() { paralelo(N, cuadrado, w) })
esperarCola(d)
imprimir("lista tras esperar:", colaLista(d))
soltarCola(d)
intentar { esperarCola(d) } capturar (e) { imprimir(e.mensaje) }
`;

const dispositivos = [['jit', {}]];
if (koffi && hay('gcc')) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }
if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
const res = {};
for (const [d, env] of dispositivos) {
  console.log(`── ${d}${d === 'gpu' && !GPU_REAL ? ' (simulada, perezosa)' : ''}`);
  const r1 = correr(DEPENDENCIAS, d, env), r2 = correr(CADENA, d, env), r3 = correr(ERRORES, d, env), r4 = correr(ASINC, d, env);
  res[d] = { r1, r2, r3, r4 };
  const N = 100000, sx = N * (N - 1) / 2;
  comprobar(`${d}: dos colas, la segunda lee lo que escribe la primera y luego escribe lo que ella leía: el orden lo pone C1EÑ`,
    r1.ok && r1.out === `y ${sx + N}\nz ${2 * (sx + N)}\nx ${100 * N}`, r1.out + r1.err);
  comprobar(`${d}: una cadena de 6 operaciones de NEÑ sobre lo residente`, r2.ok && /^cadena \d/.test(r2.out), r2.out + r2.err);
  comprobar(`${d}: un fallo en una cola sale al esperarla, con la línea del núcleo; en la cola de siempre, en el acto`,
    r3.ok === false && r3.out.startsWith('lanzado sin esperar\nal esperar: «paralelo»: el hilo i = 5 falló en la línea 4') &&
      /en principal \(línea 10\)/.test(r3.out), r3.out + r3.err);
  const s4 = (() => { let s = 0; for (let i = 0; i < 50000; i++) s += (i * 0.5) ** 2; return s; })();
  comprobar(`${d}: esperar promesaCola(c) en una asíncrona mientras la CPU sigue; subirGpu, medirGpu, colaLista y soltarCola`,
    r4.ok && r4.out === `mientras tanto, la CPU sigue\nmedirGpu da un número: cierto\nlista tras esperar: cierto\n«esperarCola»: esa cola ya se soltó\nla cola terminó ${s4}`,
    r4.out + r4.err);
}
// lo mismo en todos los dispositivos
if (res.gpu && res.jit) {
  comprobar('gpu y jit dan lo mismo en la cadena (al bit)', res.gpu.r2.out === res.jit.r2.out, `${res.gpu.r2.out} · ${res.jit.r2.out}`);
  const t = res.gpu.r2.trafico;
  comprobar('la cadena en la GPU: sube una vez y baja solo al leer (lanzamientos sin esperar entre ellos)',
    t && t.bajadas <= 2, JSON.stringify(t));
  if (t) console.log(`      (${t.lanz} lanzamientos · ${t.subidas} subidas · ${t.bajadas} bajadas)`);
}
if (res.nativo && res.jit) comprobar('nativo y jit dan lo mismo en la cadena', res.nativo.r2.out === res.jit.r2.out, `${res.nativo.r2.out} · ${res.jit.r2.out}`);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas por falta de herramientas` : '') + (envGpu && !GPU_REAL ? ' · GPU simulada (perezosa)' : ''));
process.exit(fallan ? 1 : 0);
