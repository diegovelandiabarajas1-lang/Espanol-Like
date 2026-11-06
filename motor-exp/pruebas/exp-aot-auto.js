// exp-aot-auto.js — el lanzador híbrido (util/n-auto.js): JIT al instante y AOT en segundo plano con caché.
// Comprueba: la primera vez corre el JIT y deja el AOT compilándose; la segunda ejecuta el nativo de la caché y da lo mismo; la caché caduca al cambiar
// el programa o un módulo; lo que el AOT todavía no cubre se sigue corriendo con el JIT (sin reintentar); los argumentos y el código de salida pasan;
// --aot espera; --jit no toca la caché; --estado y --limpiar. Se salta sin compilador de C.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pasan = 0, fallan = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}${detalle ? '\n      ' + String(detalle).split('\n').join('\n      ') : ''}`); }
};
const RAIZ = path.join(__dirname, '..');
const N_AUTO = path.join(RAIZ, 'util', 'n-auto.js');

const hay = c => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-auto-'));
{   // ¿hay compilador de C (del sistema o portátil)? n-compilar lo dice con N_AOT_DONDE_CC
  fs.writeFileSync(path.join(tmp, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [path.join(RAIZ, 'util', 'n-compilar.js'), path.join(tmp, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && !hay('gcc') && !hay('clang') && !process.env.C1EN_CC) { console.log('  (sin compilador de C)'); console.log('exp-aot-auto: saltada entera'); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ } process.exit(0); }
}
const cache = path.join(tmp, 'cache');
const env = { ...process.env, N_AUTO_CACHE: cache };
const correr = (args, extra) => spawnSync(process.execPath, [N_AUTO, ...args], { encoding: 'utf8', env: { ...env, ...(extra || {}) }, cwd: tmp, timeout: 180000 });
const dormir = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const esperarEstado = (prog, que, seg = 150) => {
  for (let i = 0; i < seg; i++) {
    const r = correr(['--estado', prog]);
    if (r.stdout.includes('estado: ' + que)) return true;
    dormir(1000);
  }
  return false;
};
const motor = r => (/\[n\] (JIT|AOT)/.exec(r.stderr || '') || [])[1];

const P = path.join(tmp, 'prog.esl');
const fuente = 'fn fib(n) { si n < 2 { devolver n } devolver fib(n - 1) + fib(n - 2) }\nimprimir("fib=" + texto(fib(22)))\nimprimir(argumentos())\n';
fs.writeFileSync(P, fuente);

// ── 1. primera vez: JIT; después AOT de la caché, con lo mismo ──
const r1 = correr(['--info', 'prog.esl', 'uno', 'dos']);
comprobar('la primera vez corre con el JIT', motor(r1) === 'JIT' && r1.status === 0, r1.stderr + r1.stdout);
comprobar('…y da fib y los argumentos', r1.stdout === 'fib=17711\n["uno", "dos"]\n', JSON.stringify(r1.stdout));
comprobar('el AOT se compila en segundo plano y queda «listo» en la caché', esperarEstado('prog.esl', 'listo'));
const r2 = correr(['--info', 'prog.esl', 'uno', 'dos']);
comprobar('la segunda vez corre el nativo de la caché', motor(r2) === 'AOT', r2.stderr + r2.stdout);
comprobar('…y da exactamente lo mismo que el JIT', r2.stdout === r1.stdout && r2.status === r1.status, JSON.stringify(r2.stdout));
const rj = correr(['--jit', '--info', 'prog.esl', 'uno', 'dos']);
comprobar('--jit fuerza el JIT aunque haya caché', motor(rj) === 'JIT' && rj.stdout === r1.stdout);

// ── 2. cambiar el programa caduca la caché ──
fs.writeFileSync(P, fuente + 'imprimir("otro")\n');
const r3 = correr(['--info', 'prog.esl']);
comprobar('si cambia el programa, la caché caduca y vuelve el JIT', motor(r3) === 'JIT' && r3.stdout.endsWith('otro\n'), r3.stderr + r3.stdout);
comprobar('…y el AOT nuevo se compila (y ya corre lo nuevo)', esperarEstado('prog.esl', 'listo') && correr(['--info', 'prog.esl']).stdout.endsWith('otro\n'));

// ── 3. un módulo también cuenta ──
const MOD = path.join(tmp, 'mod.esl'), PM = path.join(tmp, 'conmod.esl');
fs.writeFileSync(MOD, 'publico fn doble(x) { devolver x * 2 }\n');
fs.writeFileSync(PM, 'usar doble de "./mod.esl"\nimprimir(doble(21))\n');
const m1 = correr(['--info', 'conmod.esl']);
comprobar('un programa con módulo corre (JIT la primera vez)', m1.status === 0 && m1.stdout === '42\n' && motor(m1) === 'JIT', m1.stderr + m1.stdout);
comprobar('…se compila el AOT', esperarEstado('conmod.esl', 'listo'));
const m2 = correr(['--info', 'conmod.esl']);
comprobar('…y la segunda vez es el nativo', motor(m2) === 'AOT' && m2.stdout === '42\n', m2.stderr + m2.stdout);
fs.writeFileSync(MOD, 'publico fn doble(x) { devolver x * 3 }\n');
const m3 = correr(['--info', 'conmod.esl']);
comprobar('si cambia el MÓDULO, la caché caduca (y sale el valor nuevo)', motor(m3) === 'JIT' && m3.stdout === '63\n', m3.stderr + m3.stdout);

// ── 4. lo que el AOT todavía no cubre sigue corriendo con el JIT ──
const NS = path.join(tmp, 'nosoporte.esl');
fs.writeFileSync(NS, 'usar bitsY de "numerico"\nfijo a = bitsY(6, 3)\nimprimir(1)\n');
const n1 = correr(['--info', 'nosoporte.esl']);
comprobar('un programa que el AOT no cubre corre con el JIT', n1.status === 0 && n1.stdout.trim() === '1' && motor(n1) === 'JIT', n1.stderr + n1.stdout);
comprobar('…y queda anotado como «noaot» (no se reintenta)', esperarEstado('nosoporte.esl', 'noaot'));
const n2 = correr(['--info', 'nosoporte.esl']);
comprobar('…la siguiente vez sigue siendo el JIT, sin compilar otra vez', motor(n2) === 'JIT' && n2.stdout.trim() === '1' && /todavía no cubre/.test(n2.stderr), n2.stderr);

// ── 5. el código de salida y la salida de un error pasan tal cual ──
const ER = path.join(tmp, 'error.esl');
fs.writeFileSync(ER, 'fn f(a) { devolver a[5] }\nimprimir("antes")\nimprimir(f([1, 2]))\n');
const e1 = correr(['--info', 'error.esl']);
esperarEstado('error.esl', 'listo');
const e2 = correr(['--info', 'error.esl']);
comprobar('un error de ejecución da el mismo código con el JIT y con el AOT', e1.status !== 0 && e2.status === e1.status && motor(e2) === 'AOT', `JIT ${e1.status} · AOT ${e2.status}\n${e2.stderr}`);
comprobar('…y el mismo mensaje (sin el rastro de marcos)', e1.stdout.split('\n').filter(l => !/^\s+en /.test(l)).join('\n') === e2.stdout.split('\n').filter(l => !/^\s+en /.test(l)).join('\n'), JSON.stringify([e1.stdout, e2.stdout]));

// ── 6. --aot espera y corre ──
const A = path.join(tmp, 'aot.esl');
fs.writeFileSync(A, 'imprimir("aqui")\n');
const a1 = correr(['--aot', '--info', 'aot.esl']);
comprobar('--aot compila, espera y corre el nativo', a1.status === 0 && a1.stdout === 'aqui\n' && motor(a1) === 'AOT', a1.stderr + a1.stdout);

// ── 7. --estado y --limpiar ──
const s1 = correr(['--estado', 'aot.esl']);
comprobar('--estado dice «listo»', /estado: listo/.test(s1.stdout), s1.stdout);
correr(['--limpiar', 'aot.esl']);
const s2 = correr(['--estado', 'aot.esl']);
comprobar('--limpiar borra la caché de ese programa', /nada guardado/.test(s2.stdout), s2.stdout);

// ── 8. sin compilar en segundo plano ──
const SF = path.join(tmp, 'sinfondo.esl');
fs.writeFileSync(SF, 'imprimir("x")\n');
correr(['--info', 'sinfondo.esl'], { N_AUTO_SIN_FONDO: '1' });
dormir(3000);
comprobar('N_AUTO_SIN_FONDO=1 no deja compilando nada', /nada guardado/.test(correr(['--estado', 'sinfondo.esl']).stdout));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan`);
process.exit(fallan ? 1 : 0);
