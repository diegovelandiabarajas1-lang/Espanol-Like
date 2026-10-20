#!/usr/bin/env node
// Ñ sin runtime (motor-exp N4.1): compila un programa de Ñ a un ejecutable
// nativo que no necesita nada instalado para correr — ni Node, ni la VM.
//
//   node motor-exp/util/n-compilar.js programa.esl            → ./programa (programa.exe en Windows)
//   node motor-exp/util/n-compilar.js programa.esl -o salida
//   node motor-exp/util/n-compilar.js programa.esl --c programa.c     (además, deja el C)
//   node motor-exp/util/n-compilar.js programa.esl --ejecutar [args…] (compila y lo corre)
//
// El compilador de C (gcc, clang o el de mingw en Windows) solo hace falta
// AQUÍ, al construir; quien reciba el ejecutable no necesita nada. Se elige con
// C1EN_CC o --cc, como en C1EÑ nativo.
//
// Las banderas de C son las de C1EÑ: -O2 -ffp-contract=off -fno-fast-math,
// para que + − * / den los mismos bits que JavaScript en la VM.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');
require(R.bundle);
const EL = globalThis.EspanolLike;
const { compilarAOT, ErrorAOT } = require('../aot/compilador.js');
const AOT = path.join(__dirname, '..', 'aot');

function uso() {
  console.log('uso: node motor-exp/util/n-compilar.js programa.esl [-o salida] [--c archivo.c] [--cc compilador] [--ejecutar [args…]]');
  process.exit(2);
}
const args = process.argv.slice(2);
let entrada = null, salida = null, archC = null, cc = process.env.C1EN_CC || null, ejecutar = false, argsProg = [], banderas = [];
while (args.length) {
  const a = args.shift();
  if (a === '-o') salida = args.shift();
  else if (a === '--c') archC = args.shift();
  else if (a === '--cc') cc = args.shift();
  else if (a === '--ejecutar') { ejecutar = true; argsProg = args.splice(0); }
  else if (a.startsWith('--cflag=')) banderas.push(a.slice(8));
  else if (a.startsWith('-')) uso();
  else if (!entrada) entrada = a;
  else uso();
}
if (!entrada) uso();
const win = process.platform === 'win32';
if (!salida) salida = path.join(path.dirname(entrada), path.basename(entrada).replace(/\.esl$/i, '')) + (win ? '.exe' : '');

let fuente;
try { fuente = fs.readFileSync(entrada, 'utf8'); } catch (_) { console.log('no se pudo abrir ' + entrada); process.exit(2); }
let clave; try { clave = fs.realpathSync(path.resolve(entrada)); } catch (_) { clave = path.resolve(entrada); }

// Analizar con el motor de siempre: los mismos errores de sintaxis y de tipos
// que la VM, dichos igual. Un programa que no pasa el verificador no llega a C.
const modulos = {   // el mismo cargador que util/n-node.js
  resolver(espec, desde) {
    const base = desde ? path.dirname(desde) : process.cwd();
    const abs = path.resolve(base, espec);
    let real;
    try { real = fs.realpathSync(abs); } catch (_) { throw new Error(`no existe el módulo «${espec}» (se buscó en ${abs})`); }
    if (!fs.statSync(real).isFile()) throw new Error(`«${espec}» no es un archivo (${real})`);
    return real;
  },
  leer(clave) { return fs.readFileSync(clave, 'utf8'); },
};
const m = EL.crearMotor({ salida: () => {}, host: { modulos } });
const a = m.analizar(fuente, clave);
if (!a.ok) {
  for (const e of a.errores) console.log(e.formato ? e.formato() : e.message);
  process.exit(1);
}
let res;
try { res = compilarAOT(a.fn, { globalesMotor: new Set(m.vm.globals.keys()), modulos: a.modulos }); }
catch (e) {
  if (e instanceof ErrorAOT) { console.log('[ejecutable] ' + e.message); process.exit(1); }
  throw e;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n-compilar-'));
const c = archC || path.join(tmp, 'programa.c');
fs.writeFileSync(c, res.c);

function buscarCC() {
  for (const x of cc ? [cc] : ['gcc', 'clang', 'cc']) {
    const r = spawnSync(x, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return x;
  }
  return null;
}
const comp = buscarCC();
if (!comp) { console.log('[ejecutable] no hay compilador de C (gcc o clang); se puede indicar con --cc o C1EN_CC'); process.exit(1); }
const BASE = ['-std=gnu11', '-O2', '-ffp-contract=off', '-fno-fast-math', '-fwrapv', '-w', '-I', AOT].concat(banderas);
// La biblioteca de apoyo se compila una vez y se guarda (por la huella de su
// código, del compilador y de las banderas): compilar un programa es entonces
// compilar solo su C.
function objetoNrt() {
  const crypto = require('crypto');
  const v = spawnSync(comp, ['--version'], { encoding: 'utf8' }).stdout || '';
  // La huella lleva TODOS los trozos de la biblioteca (nrt.c, nrt.h y los
  // nrt_*.inc que nrt.c incluye): con solo nrt.c, cambiar un eDSL dejaba
  // enlazando el objeto viejo.
  const hs = crypto.createHash('sha256');
  for (const f of fs.readdirSync(AOT).filter(f => /^nrt.*\.(c|h|inc)$/.test(f)).sort()) hs.update(f).update(fs.readFileSync(path.join(AOT, f)));
  const h = hs.update(v).update(BASE.join(' ')).digest('hex').slice(0, 20);
  const dir = path.join(os.tmpdir(), 'n-aot-cache');
  fs.mkdirSync(dir, { recursive: true });
  const o = path.join(dir, `nrt-${h}.o`);
  if (fs.existsSync(o)) return o;
  const t = `${o}.${process.pid}.tmp`;
  const r = spawnSync(comp, BASE.concat(['-c', path.join(AOT, 'nrt.c'), '-o', t]), { encoding: 'utf8' });
  if (r.status !== 0) { console.log(`[ejecutable] la biblioteca de apoyo no compiló con ${comp}:`); console.log(String(r.stderr).split('\n').slice(0, 20).join('\n')); process.exit(1); }
  fs.renameSync(t, o);
  return o;
}
const flags = BASE.concat(['-o', salida, c, objetoNrt(), '-lm']).concat(win ? ['-Wl,--stack,67108864'] : []);
const r = spawnSync(comp, flags, { encoding: 'utf8' });
if (r.status !== 0) {
  console.log(`[ejecutable] ${comp} no lo compiló (el C está en ${c}):`);
  console.log(String(r.stderr || '').split('\n').slice(0, 20).join('\n'));
  process.exit(1);
}
if (!archC) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ } }
if (!ejecutar) {
  console.log(`${salida} · ${res.funciones} funciones · ${(fs.statSync(salida).size / 1024).toFixed(0)} KB · sin runtime`);
  process.exit(0);
}
const e = spawnSync(path.resolve(salida), argsProg, { stdio: 'inherit' });
process.exit(e.status === null ? 1 : e.status);
