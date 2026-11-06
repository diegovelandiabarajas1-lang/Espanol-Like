#!/usr/bin/env node
// n-auto.js — «n programa.esl»: el motor oficial (AOT) sin esperar a que compile.
//
//   la primera vez   corre YA con el JIT, y en segundo plano compila el AOT y lo guarda en la caché
//   las siguientes   ejecuta el nativo de la caché (arranca como un programa de C)
//   si algo falla    siempre se vuelve al JIT, que corre todo Ñ: no hay compilador de C, el AOT todavía
//                    no cubre algo que el programa usa, el sistema bloquea el ejecutable nuevo…
//
// uso:  node motor-exp/util/n-auto.js programa.esl [argumentos…]
//       --aot       compila (si hace falta), espera, y corre el nativo
//       --jit       corre con el JIT y no toca la caché
//       --info      dice por stderr qué motor corrió (también N_AUTO_INFO=1)
//       --estado    dice qué hay en la caché para ese programa y no lo corre
//       --limpiar   borra la caché de ese programa      (--limpiar --todo: toda la caché)
//
// La caché (~/.n/cache/aot/<huella del programa>/) vale mientras no cambien el programa ni sus módulos ni el
// compilador de Ñ. N_AUTO_SIN_FONDO=1 apaga la compilación en segundo plano.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const AQUI = __dirname, AOT = path.join(AQUI, '..', 'aot');
const N_NODE = path.join(AQUI, 'n-node.js'), N_COMP = path.join(AQUI, 'n-compilar.js');
const EXE = process.platform === 'win32' ? '.exe' : '';
const RAIZ_CACHE = process.env.N_AUTO_CACHE || path.join(os.homedir(), '.n', 'cache', 'aot');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const leerJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
const escribirJSON = (f, o) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };

// ── argumentos ──
const args = process.argv.slice(2);
const flags = new Set();
while (args.length && /^--[a-z-]+$/.test(args[0])) flags.add(args.shift());
const fondo = flags.has('--fondo');
const info = flags.has('--info') || process.env.N_AUTO_INFO === '1';
const decir = m => { if (info) process.stderr.write('[n] ' + m + '\n'); };
const entradaArg = args.shift();
if (!entradaArg && !flags.has('--limpiar')) {
  console.log('uso: node motor-exp/util/n-auto.js programa.esl [argumentos…]   (--aot · --jit · --info · --estado · --limpiar [--todo])');
  process.exit(2);
}
const progArgs = args;

// ── la huella del motor: si cambia cualquier parte del compilador o del runtime, la caché ya no vale ──
function huellaMotor() {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(AOT).filter(f => /\.(js|c|h|inc)$/.test(f)).sort()) h.update(f).update(fs.readFileSync(path.join(AOT, f)));
  h.update(fs.readFileSync(N_COMP));
  return h.digest('hex').slice(0, 24);
}

function real(p) { try { return fs.realpathSync(path.resolve(p)); } catch (_) { return path.resolve(p); } }
function carpetaDe(entrada) { return path.join(RAIZ_CACHE, sha(entrada).slice(0, 20)); }

// ── limpiar ──
if (flags.has('--limpiar')) {
  const objetivo = flags.has('--todo') || !entradaArg ? RAIZ_CACHE : carpetaDe(real(entradaArg));
  if (!path.resolve(objetivo).startsWith(path.resolve(RAIZ_CACHE))) { console.log('[n] ruta de caché rara; no se borra nada'); process.exit(1); }
  fs.rmSync(objetivo, { recursive: true, force: true });
  console.log('[n] caché borrada: ' + objetivo);
  process.exit(0);
}

const entrada = real(entradaArg);
if (!fs.existsSync(entrada)) { console.log(`[n] no existe «${entradaArg}»`); process.exit(1); }
const dir = carpetaDe(entrada);
const F = { exe: path.join(dir, 'programa' + EXE), estado: path.join(dir, 'estado.json'), deps: path.join(dir, 'deps.json'), cerrojo: path.join(dir, 'compilando.lock') };

// ¿la caché sigue valiendo? (mismo motor y mismos archivos)
function estadoValido() {
  const e = leerJSON(F.estado);
  if (!e || e.motor !== huellaMotor()) return null;
  for (const d of e.deps || []) {
    let b; try { b = fs.readFileSync(d.ruta); } catch (_) { return null; }
    if (sha(b) !== d.sha) return null;
  }
  return e;
}

// ── el JIT ──
function correrJIT(razon) {
  decir('JIT' + (razon ? ' · ' + razon : ''));
  const r = spawnSync(process.execPath, [N_NODE, entrada, ...progArgs], { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

// ── compilar (en la caché) ──
function compilar() {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `programa.${process.pid}.tmp${EXE}`);
  const r = spawnSync(process.execPath, [N_COMP, entrada, '-o', tmp], { encoding: 'utf8', env: { ...process.env, N_AOT_DEPS: F.deps }, maxBuffer: 1 << 26 });
  const salida = ((r.stdout || '') + (r.stderr || '')).trim();
  const motor = huellaMotor();
  const deps = (leerJSON(F.deps) || [entrada]).map(ruta => { let b = null; try { b = fs.readFileSync(ruta); } catch (_) { /* nada */ } return b ? { ruta, sha: sha(b) } : null; }).filter(Boolean);
  if (r.status === 0 && fs.existsSync(tmp)) {
    try { fs.rmSync(F.exe, { force: true }); } catch (_) { /* nada */ }
    fs.renameSync(tmp, F.exe);
    escribirJSON(F.estado, { estado: 'listo', motor, deps, cuando: Date.now() });
    return { estado: 'listo' };
  }
  try { fs.rmSync(tmp, { force: true }); } catch (_) { /* nada */ }
  // lo que el AOT todavía no cubre, o un programa que ni compila: el JIT lo dirá o lo correrá; no se reintenta hasta que algo cambie
  if (/^\[ejecutable\] (todavía no|los generadores)/m.test(salida) || /^\[(sintaxis|tipos|módulos)\]/m.test(salida)) {
    escribirJSON(F.estado, { estado: 'noaot', motivo: salida.split('\n')[0].slice(0, 300), motor, deps, cuando: Date.now() });
    return { estado: 'noaot' };
  }
  // sin compilador de C u otro fallo del entorno: se reintenta pasada una hora
  escribirJSON(F.estado, { estado: 'fallo', motivo: salida.split('\n')[0].slice(0, 300), motor, deps: [], reintentar: Date.now() + 3600e3, cuando: Date.now() });
  return { estado: 'fallo' };
}

// ── --fondo: el hijo que compila sin que nadie lo espere ──
if (fondo) {
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(F.cerrojo, String(process.pid), { flag: 'wx' }); } catch (_) {
    let viejo = true; try { viejo = Date.now() - fs.statSync(F.cerrojo).mtimeMs > 10 * 60e3; } catch (_) { /* nada */ }
    if (!viejo) process.exit(0);   // ya hay otro compilando
    fs.writeFileSync(F.cerrojo, String(process.pid));
  }
  try { compilar(); } finally { try { fs.rmSync(F.cerrojo, { force: true }); } catch (_) { /* nada */ } }
  process.exit(0);
}

// ── --estado ──
if (flags.has('--estado')) {
  const e = leerJSON(F.estado), v = estadoValido();
  console.log(`[n] caché: ${dir}`);
  console.log(e ? `[n] estado: ${e.estado}${e.motivo ? ' — ' + e.motivo : ''}${v ? '' : ' (CADUCADA: cambió el programa, un módulo o el compilador de Ñ)'}` : '[n] estado: nada guardado');
  process.exit(0);
}

if (flags.has('--jit')) correrJIT('pedido con --jit');

// ── elegir motor ──
let est = estadoValido();
if (est && est.estado === 'listo' && fs.existsSync(F.exe)) {
  const r = spawnSync(F.exe, progArgs, { stdio: 'inherit' });
  if (!r.error) { decir('AOT (caché)'); process.exit(r.status === null ? 1 : r.status); }
  // el sistema no deja arrancar el ejecutable (p. ej. un control de aplicaciones en Windows): se anota y se sigue con el JIT
  escribirJSON(F.estado, { estado: 'fallo', motivo: 'no arranca el ejecutable: ' + (r.error.code || r.error.message), motor: huellaMotor(), deps: [], reintentar: Date.now() + 24 * 3600e3, cuando: Date.now() });
  correrJIT('el ejecutable no arrancó (' + (r.error.code || r.error.message) + ')');
}
if (est && est.estado === 'noaot') correrJIT('el AOT todavía no cubre este programa: ' + (est.motivo || ''));
const e0 = leerJSON(F.estado);
if (e0 && e0.estado === 'fallo' && e0.motor === huellaMotor() && e0.reintentar > Date.now()) correrJIT('el AOT no está disponible (' + (e0.motivo || '') + ')');

if (flags.has('--aot')) {   // compilar y esperar
  decir('compilando el AOT…');
  const c = compilar();
  const e = leerJSON(F.estado);
  if (c.estado === 'listo') {
    const r = spawnSync(F.exe, progArgs, { stdio: 'inherit' });
    if (!r.error) { decir('AOT (recién compilado)'); process.exit(r.status === null ? 1 : r.status); }
    correrJIT('el ejecutable no arrancó (' + (r.error.code || r.error.message) + ')');
  }
  correrJIT('no se pudo compilar el AOT: ' + ((e && e.motivo) || ''));
}

// primera vez: JIT ya, AOT en segundo plano
if (process.env.N_AUTO_SIN_FONDO !== '1') {
  try {
    const h = spawn(process.execPath, [__filename, '--fondo', entrada], { detached: true, stdio: 'ignore', windowsHide: true });
    h.unref();
  } catch (_) { /* sin AOT; el JIT corre igual */ }
}
correrJIT('compilando el AOT en segundo plano');
