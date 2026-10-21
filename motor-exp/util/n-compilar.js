#!/usr/bin/env node
// Ñ sin runtime (motor-exp N4.1): compila un programa de Ñ a un ejecutable
// nativo que no necesita nada instalado para correr — ni Node, ni la VM.
//
//   node motor-exp/util/n-compilar.js programa.esl            → ./programa (programa.exe en Windows)
//   node motor-exp/util/n-compilar.js programa.esl -o salida
//   node motor-exp/util/n-compilar.js programa.esl --c programa.c     (además, deja el C)
//   node motor-exp/util/n-compilar.js programa.esl --ejecutar [args…] (compila y lo corre)
//   node motor-exp/util/n-compilar.js mates.esl --biblioteca [-o carpeta] [--prefijo p_]
//        (motor-exp N4.6) una BIBLIOTECA de C: libmates.so (mates.dll, libmates.dylib) con las
//        funciones «publico», más mates.h (C, C++, Rust, Go…) y mates.py (Python, con ctypes)
//   (motor-exp N4.10) nativa("libgeo.so", "double f(double)") y cabeceraNativa("libgeo.so", "geo.h")
//        se enlazan DIRECTAMENTE (sin koffi): la firma y la cabecera se leen al compilar y la
//        biblioteca va al enlazador. --enlazar archivo añade otro .o, .a o -lalgo.
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
const { compilarAOT, ErrorAOT, exportacionesBiblioteca } = require('../aot/compilador.js');
const AOT = path.join(__dirname, '..', 'aot');

function uso() {
  console.log('uso: node motor-exp/util/n-compilar.js programa.esl [-o salida] [--c archivo.c] [--cc compilador] [--ejecutar [args…]]');
  console.log('     node motor-exp/util/n-compilar.js biblioteca.esl --biblioteca [-o carpeta] [--prefijo p_] [--c archivo.c] [--cc compilador]');
  process.exit(2);
}
const args = process.argv.slice(2);
let entrada = null, salida = null, archC = null, cc = process.env.C1EN_CC || null, ejecutar = false, argsProg = [], banderas = [];
let biblioteca = false, prefijo = null;
const enlazarExtra = [];      // (motor-exp N4.10) --enlazar archivo.o / libalgo.a / -lalgo
while (args.length) {
  const a = args.shift();
  if (a === '-o') salida = args.shift();
  else if (a === '--c') archC = args.shift();
  else if (a === '--cc') cc = args.shift();
  else if (a === '--ejecutar') { ejecutar = true; argsProg = args.splice(0); }
  else if (a === '--biblioteca') biblioteca = true;
  else if (a === '--prefijo') prefijo = args.shift();
  else if (a === '--enlazar') enlazarExtra.push(args.shift());
  else if (a.startsWith('--cflag=')) banderas.push(a.slice(8));
  else if (a.startsWith('-')) uso();
  else if (!entrada) entrada = a;
  else uso();
}
if (!entrada) uso();
// (motor-exp N4.6) para quién se compila: con el gcc de mingw, para Windows aunque se esté en Linux
const ccPedido = cc || '';
const win = process.platform === 'win32' || /mingw|w64/i.test(ccPedido);
const mac = !win && process.platform === 'darwin';
if (ejecutar && biblioteca) { console.log('--ejecutar no va con --biblioteca: una biblioteca la llama otro programa'); process.exit(2); }
const nombreBase = path.basename(entrada).replace(/\.esl$/i, '');
const identC = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
let archivosBib = null;
if (biblioteca) {
  const dir = salida || path.dirname(entrada);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* nada */ }
  const nb = identC(nombreBase);
  archivosBib = { so: `lib${nb}.so`, dll: `${nb}.dll`, dylib: `lib${nb}.dylib`, h: `${nb}.h`, py: `${nb}.py`, dir };
  if (prefijo === null) prefijo = nb + '_';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(prefijo)) { console.log(`[biblioteca] el prefijo «${prefijo}» no es un nombre de C`); process.exit(2); }
  salida = path.join(dir, win ? archivosBib.dll : mac ? archivosBib.dylib : archivosBib.so);
}
if (!salida) salida = path.join(path.dirname(entrada), nombreBase) + (win ? '.exe' : '');

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
// (motor-exp N4.11) los avisos de «sinComprobar»: aquí es donde de verdad se quitan
for (const w of (a.avisos || [])) if (w.fase === 'seguridad') console.log('[aviso] ' + (w.formato ? w.formato() : w.message));
let res;
try {
  // (motor-exp N4.10) las cabeceras de cabeceraNativa se leen al compilar: junto al programa, o desde aquí
  const leerArchivo = r => {
    for (const x of [path.resolve(path.dirname(entrada), r), path.resolve(r)]) if (fs.existsSync(x)) return fs.readFileSync(x, 'utf8');
    throw new Error('no existe (se buscó junto al programa y en la carpeta actual)');
  };
  const op = { globalesMotor: new Set(m.vm.globals.keys()), modulos: a.modulos, leerArchivo };
  if (biblioteca) op.biblioteca = { nombre: identC(nombreBase), prefijo, exporta: exportacionesBiblioteca(a.ast), archivos: archivosBib };
  res = compilarAOT(a.fn, op);
}
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
const BASE = ['-std=gnu11', '-O2', '-ffp-contract=off', '-fno-fast-math', '-fwrapv', '-w', '-I', AOT].concat(banderas)
  // (motor-exp N4.6) una biblioteca: código reubicable, y de nrt no se ve nada desde fuera
  .concat(biblioteca ? (win ? ['-fvisibility=hidden'] : ['-fPIC', '-fvisibility=hidden']) : []);
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
// (motor-exp N4.10) las bibliotecas de nativa(…) y cabeceraNativa(…): un archivo que
// existe (junto al programa o desde aquí) va tal cual al enlazador, con su carpeta
// en el rpath para encontrarlo al correr; un nombre del sistema («libm.so.6»,
// «kernel32.dll», «libz.dylib») va como -l
function enlaces() {
  const out = [];
  for (const b of (res.enlazar || [])) {
    const cand = [path.resolve(path.dirname(entrada), b), path.resolve(b)].find(x => fs.existsSync(x));
    if (cand) {
      out.push(cand);
      if (!win && /\.(so(\.\d+)*|dylib)$/.test(cand)) out.push(`-Wl,-rpath,${path.dirname(cand)}`);
      continue;
    }
    const base = path.basename(b);
    let m2;
    if (win && (m2 = /^(.+)\.dll$/i.exec(base))) out.push('-l' + m2[1]);
    else if (mac && (m2 = /^lib(.+?)(\.\d+)*\.dylib$/.exec(base))) out.push('-l' + m2[1]);
    else if ((m2 = /^lib(.+?)\.so(\.\d+)*$/.exec(base))) out.push(mac || win ? '-l' + m2[1] : '-l:' + base);
    else out.push('-l' + base.replace(/^lib/, '').replace(/\.(a|lib)$/, ''));
  }
  const todo = out.concat(enlazarExtra);
  // las funciones de C se declaran con enlace débil (si la biblioteca no trae una,
  // vale NULL y se dice al usarla, como en la VM); con «--as-needed», que es lo
  // de siempre en Ubuntu, una biblioteca que solo se usa así se quitaría
  return todo.length && !win && !mac ? ['-Wl,--no-as-needed'].concat(todo) : todo;
}
const flags = biblioteca
  ? BASE.concat([mac ? '-dynamiclib' : '-shared', '-o', salida, c, objetoNrt()]).concat(enlaces(), ['-lm']).concat(win ? ['-static-libgcc'] : ['-pthread'])
  : BASE.concat(['-o', salida, c, objetoNrt()]).concat(enlaces(), ['-lm']).concat(win ? ['-Wl,--stack,67108864'] : []);
const r = spawnSync(comp, flags, { encoding: 'utf8' });
if (r.status !== 0) {
  // (motor-exp N4.10) en Windows no hay enlace débil: una función que la cabecera
  // declara y la DLL no trae se dice aquí, con su nombre
  const faltan = [...new Set([...String(r.stderr || '').matchAll(/undefined reference to `([A-Za-z_]\w*)'/g)].map(x => x[1]))]
    .filter(n => res.c.includes(`__asm__(N_SIM("${n}"))`));
  if (faltan.length) {
    console.log(`[ejecutable] ${faltan.map(n => `«${n}»`).join(', ')}: lo declara la cabecera (o la firma de nativa) y la biblioteca no lo trae` +
      (win ? ' (en Windows eso se sabe al enlazar; en Linux y macOS el ejecutable lo dice al usarla, como la VM)' : ''));
    process.exit(1);
  }
  console.log(`[ejecutable] ${comp} no lo compiló (el C está en ${c}):`);
  console.log(String(r.stderr || '').split('\n').slice(0, 20).join('\n'));
  process.exit(1);
}
if (!archC) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ } }
if (biblioteca) {
  fs.writeFileSync(path.join(archivosBib.dir, archivosBib.h), res.h);
  fs.writeFileSync(path.join(archivosBib.dir, archivosBib.py), res.py);
  console.log(`${salida} · ${archivosBib.h} · ${archivosBib.py} · ${res.exporta.length} funciones exportadas (${res.exporta.map(e => e.c).join(', ')}) · ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);
  process.exit(0);
}
if (!ejecutar) {
  console.log(`${salida} · ${res.funciones} funciones · ${(fs.statSync(salida).size / 1024).toFixed(0)} KB · sin runtime`);
  process.exit(0);
}
const e = spawnSync(path.resolve(salida), argsProg, { stdio: 'inherit' });
process.exit(e.status === null ? 1 : e.status);
