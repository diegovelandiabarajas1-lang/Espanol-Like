// motor-exp · N4.7 «Hilos y memoria compartida con control fino».
//
//   · hilos(n, f(t, …)): n hilos de la CPU vivos a la vez, con barreraHilos,
//     candados (cerrarCandado/abrirCandado), esperarMientras y atómicos. En jit
//     se turnan en orden fijo y cazan los interbloqueos; en nativo son hilos del
//     sistema de verdad. Los dos tienen que dar lo mismo.
//   · los atómicos (atomicoSumar, atomicoCambiar, atomicoComparar, atomicoLeer,
//     atomicoEscribir, vallaMemoria) también en «paralelo», en jit, nativo y GPU.
//   · los errores: lo que bloquea fuera de «hilos», un atómico sobre un real, el
//     interbloqueo y la barrera a la que no llegan todos, con su línea.
//
//   node motor-exp/pruebas/exp-hilos.js          (--gpu: la GPU de verdad)
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
const hay = cmd => { try { return spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0; } catch (_) { return false; } };
let koffi = true;
try { require('koffi'); } catch (_) { koffi = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-hilos-'));
function correr(src, dispositivo, extra) {
  const f = path.join(tmp, `p${Math.floor(Math.random() * 1e9)}.esl`);
  fs.writeFileSync(f, src);
  const env = Object.assign({}, process.env, { C1EN_HILOS_ESPERA_S: '3' }, extra || {}, dispositivo ? { C1EN_DISPOSITIVO: dispositivo } : {});
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', env, cwd: tmp, maxBuffer: 1 << 26, timeout: 300000 });
  return { ok: r.status === 0, out: (r.stdout || '').replace(/\r\n/g, '\n').trim(), err: (r.stderr || '').trim() };
}

const CAB = `usar hilos, paralelo, codigoC, codigoCuda, atomicoSumar, atomicoLeer, atomicoEscribir, atomicoCambiar, atomicoComparar, vallaMemoria, barreraHilos, numeroHilos, cerrarCandado, abrirCandado, esperarMientras, despertar de "nen"
usar ceros, aListaA, suma de "numerico"
`;
const HILOS = CAB + `
# 1. un contador con atómicos, y una barrera entre fases: después de ella todos ven el total
fn contar(t, cuenta, fase) {
  para k en rango(1000) { atomicoSumar(cuenta, 0, 1) }
  barreraHilos()
  fase[t] = atomicoLeer(cuenta, 0) + numeroHilos() * 0
}
fijo cuenta = ceros(1, "entero")
fijo fase = ceros(4, "entero")
hilos(4, contar, cuenta, fase)
imprimir("contador", aListaA(cuenta), aListaA(fase))
# 2. un candado protege una suma que NO es atómica
fn conCandado(t, c, s) {
  para k en rango(500) {
    cerrarCandado(c, 0)
    s[0] = s[0] + 1
    abrirCandado(c, 0)
  }
}
fijo c = ceros(1, "entero")
fijo s = ceros(1, "entero")
hilos(8, conCandado, c, s)
imprimir("candado", aListaA(s))
# 3. productor y consumidor, con esperarMientras
fn tubo(t, bandera, dato, salida) {
  si t == 0 {
    para k en rango(20) {
      esperarMientras(bandera, 0, 1)
      dato[0] = k * 10
      atomicoEscribir(bandera, 0, 1)
      despertar(bandera, 0)
    }
  } sino {
    para k en rango(20) {
      esperarMientras(bandera, 0, 0)
      salida[k] = dato[0]
      vallaMemoria()
      atomicoEscribir(bandera, 0, 0)
    }
  }
}
fijo bandera = ceros(1, "entero")
fijo dato = ceros(1, "entero")
fijo salida = ceros(20, "entero")
hilos(2, tubo, bandera, dato, salida)
imprimir("tubo", suma(salida))
# 4. solo uno gana un CAS, y es el que queda escrito
fn cas(t, a, gano) { si atomicoComparar(a, 0, 0, t + 1) == 0 { gano[0] = t + 1 } }
fijo g = ceros(1, "entero")
fijo a = ceros(1, "entero")
hilos(16, cas, a, g)
imprimir("cas", aListaA(a)[0] == aListaA(g)[0], aListaA(a)[0] > 0)
# 5. fases con barrera: cada hilo lee lo que escribió su vecino en la fase anterior
fn fases(t, x, y) {
  para r en rango(10) {
    y[t] = x[(t + 1) % numeroHilos()] + 1
    barreraHilos()
    x[t] = y[t]
    barreraHilos()
  }
}
fijo x = ceros(6, "entero")
fijo y = ceros(6, "entero")
hilos(6, fases, x, y)
imprimir("fases", aListaA(x))
# 6. un u32 envuelve en el atómico
fn envolver(t, u) { atomicoSumar(u, 0, 2000000000) }
fijo u = ceros(1, "u32")
hilos(3, envolver, u)
imprimir("u32", aListaA(u))
`;
const ERRORES = CAB + `
fn mal(t, c) {
  cerrarCandado(c, t)
  barreraHilos()
  cerrarCandado(c, 1 - t)
}
intentar { hilos(2, mal, ceros(2, "entero")) } capturar (e) { imprimir(e.mensaje) }
fn mal2(t, a) { si t < 2 { barreraHilos() } a[t] = 1 }
intentar { hilos(3, mal2, ceros(3, "entero")) } capturar (e) { imprimir(e.mensaje) }
fn mal3(t, a) { a[t + 10] = 1 }
intentar { hilos(4, mal3, ceros(4, "entero")) } capturar (e) { imprimir(e.mensaje) }
fn espera(i, a) { cerrarCandado(a, 0) }
intentar { paralelo(4, espera, ceros(1, "entero")) } capturar (e) { imprimir(e.mensaje) }
fn real(i, a) { atomicoSumar(a, 0, 1) }
intentar { paralelo(4, real, ceros(1)) } capturar (e) { imprimir(e.mensaje) }
intentar { hilos(1000, mal, ceros(2, "entero")) } capturar (e) { imprimir(e.mensaje) }
`;
// atómicos en «paralelo»: cada índice saca un turno con atomicoSumar y marca su
// casilla; el máximo con un bucle de CAS; un intercambio
const PARALELO = CAB + `
fn turnos(i, siguiente, marca, maximo, x) {
  fijo yo = atomicoSumar(siguiente, 0, 1)
  marca[yo] = marca[yo] + 1
  var viejo = atomicoLeer(maximo, 0)
  mientras viejo < x[i] {
    fijo visto = atomicoComparar(maximo, 0, viejo, x[i])
    si visto == viejo { viejo = x[i] } sino { viejo = visto }
  }
  atomicoCambiar(siguiente, 1, i)
}
fn llenar(i, x) { x[i] = (i * 7919) % 100003 }
fijo N = 50000
fijo x = ceros(N, "entero")
paralelo(N, llenar, x)
fijo siguiente = ceros(2, "entero")
fijo marca = ceros(N, "entero")
fijo mayor = ceros(1, "entero")
paralelo(N, turnos, siguiente, marca, mayor, x)
imprimir(aListaA(siguiente)[0], suma(marca), aListaA(mayor)[0], aListaA(siguiente)[1] >= 0)
`;

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
const nativo = koffi && hay('gcc');
const dispositivos = [['jit', {}]];
if (nativo) dispositivos.push(['nativo', {}]); else { saltadas++; console.log('  (sin gcc o koffi: «nativo» no se prueba)'); }

const ESPERADO_HILOS = 'contador [4000] [4000, 4000, 4000, 4000]\ncandado [4000]\ntubo 1900\ncas cierto cierto\nfases [10, 10, 10, 10, 10, 10]\nu32 [1705032704]';
const res = {};
for (const [d, env] of dispositivos) {
  console.log(`── hilos en ${d}`);
  const r = correr(HILOS, d, env);
  res[d] = r;
  comprobar(`${d}: contador atómico + barrera, candado sobre una suma no atómica, productor/consumidor, CAS, fases y u32`,
    r.ok && r.out === ESPERADO_HILOS, r.out + '\n' + r.err);
  const e = correr(ERRORES, d, env);
  const L = e.out.split('\n');
  comprobar(`${d}: un interbloqueo se dice con su línea (el hilo más bajo de los que esperan)`,
    /^«hilos»: el hilo t = 0 falló en la línea 7: todos los hilos se quedaron esperando: un interbloqueo/.test(L[0] || ''), L[0]);
  comprobar(`${d}: una barrera a la que no llegan todos, y un índice fuera, con su línea`,
    /el hilo t = 0 falló en la línea 10: no todos los hilos llegaron a esta barrera/.test(L[1] || '') &&
      /el hilo t = 0 falló en la línea 12: el índice se sale del arreglo «a»/.test(L[2] || ''), L[1] + '\n' + L[2]);
  comprobar(`${d}: lo que espera no vale en «paralelo», un atómico sobre un real tampoco, y 1000 hilos son demasiados`,
    /«cerrarCandado» solo vale en un núcleo de «hilos»/.test(L[3] || '') && /trabaja sobre arreglos enteros de 32 bits/.test(L[4] || '') &&
      /los hilos van de 1 a 256/.test(L[5] || ''), L.slice(3, 6).join('\n'));
}
if (res.jit && res.nativo) comprobar('jit = nativo en todo lo de los hilos', res.jit.out === res.nativo.out, res.nativo.out);

if (envGpu) dispositivos.push(['gpu', envGpu]); else { saltadas++; console.log(`  (sin GPU: ${motivoSinGpu})`); }
console.log('── atómicos en «paralelo»');
const N = 50000;
let maxx = 0; for (let i = 0; i < N; i++) maxx = Math.max(maxx, (i * 7919) % 100003);
for (const [d, env] of dispositivos) {
  const r = correr(PARALELO, d, env);
  comprobar(`${d}: ${N} índices sacan turno con atomicoSumar (cada turno, una vez), el máximo con un bucle de CAS, un intercambio`,
    r.ok && r.out === `${N} ${N} ${maxx} cierto`, r.out + '\n' + r.err);
}
// con la GPU elegida, hilos va a la CPU
if (envGpu) {
  const r = correr(HILOS, 'gpu', envGpu);
  comprobar('con la GPU elegida, «hilos» corre en la CPU y da lo mismo', r.ok && r.out === ESPERADO_HILOS, r.out + r.err);
}

console.log('── el código');
{
  const src = CAB + `
fn f(t, c, s) { cerrarCandado(c, 0)
  s[0] = s[0] + 1
  abrirCandado(c, 0)
  barreraHilos() }
fn g(i, a) { atomicoSumar(a, 0, 1) }
fijo e = ceros(1, "entero")
escribirTexto("hilos.c", codigoC(f, e, e))
escribirTexto("g.cu", codigoCuda(g, e))
intentar { codigoCuda(f, e, e) } capturar (x) { imprimir(x.mensaje) }
`;
  const r = correr(src);
  comprobar('codigoC de un núcleo de hilos (hilos del sistema); codigoCuda de uno con atómicos; un núcleo de hilos no tiene CUDA',
    r.ok && /no tiene CUDA/.test(r.out) && fs.existsSync(path.join(tmp, 'hilos.c')) && /atomicAdd/.test(fs.readFileSync(path.join(tmp, 'g.cu'), 'utf8')), r.out + r.err);
  const mingw = 'x86_64-w64-mingw32-gcc';
  if (hay(mingw) && fs.existsSync(path.join(tmp, 'hilos.c'))) {
    const w = spawnSync(mingw, ['-O2', '-c', path.join(tmp, 'hilos.c'), '-o', path.join(tmp, 'hilos.o')], { encoding: 'utf8' });
    comprobar('el C de un núcleo de hilos compila para Windows (CreateThread, SwitchToThread)', w.status === 0, w.stderr);
  } else { saltadas++; console.log('  (sin mingw: no se compila para Windows)'); }
  if (hay('clang') && fs.existsSync(path.join(tmp, 'g.cu'))) {
    const cab = path.join(__dirname, 'c1en-sim', 'cuda-clang.h');
    const ptx = path.join(tmp, 'g.ptx');
    const c = spawnSync('clang', ['-x', 'cuda', '--cuda-device-only', '--cuda-gpu-arch=sm_75', '-nocudainc', '-nocudalib', '-include', cab, '-S', '-O2', '-o', ptx, path.join(tmp, 'g.cu')], { encoding: 'utf8' });
    const txt = c.status === 0 ? fs.readFileSync(ptx, 'utf8') : '';
    comprobar('el atómico de la GPU es una instrucción atom del PTX de verdad (clang, sm_75)', c.status === 0 && /atom\.(global\.)?add/.test(txt), c.stderr.split('\n').slice(0, 3).join(' '));
  } else { saltadas++; console.log('  (sin clang: no se mira el PTX)'); }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas por falta de herramientas` : '') + (envGpu && !GPU_REAL ? ' · GPU simulada' : ''));
process.exit(fallan ? 1 : 0);
