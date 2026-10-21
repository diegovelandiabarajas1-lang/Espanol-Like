#!/usr/bin/env node
// Empaquetar un programa de Ñ como UN EJECUTABLE: motor + tus archivos .esl
// dentro, sin Node instalado en la máquina que lo abre.
//
//   node motor/util/empaquetar.js [--ventana] [--c1en] [--con=archivo]… principal.esl [carpetaSalida]
//
// Deja en carpetaSalida (por defecto dist/<nombre>/):
//   <nombre>.exe (Windows) o <nombre> (Linux/macOS)   el ejecutable
//   lib/node_modules/koffi…                            el FFI, si está instalado aquí
//   *.dll / *.so que estén junto a principal.esl        las bibliotecas nativas (raylib…)
//   lo que pidas con --con=                             archivos o carpetas de datos
//
// --ventana: la app abre una ventana y NO quiere terminal. En Windows el .exe
//   se marca como aplicación gráfica (sin consola negra detrás) y lo que
//   «imprimir» escriba va a <nombre>.log junto al ejecutable; un error se
//   muestra en un cuadro de diálogo. Sin --ventana es un programa de consola.
//
// CÓMO: Node sabe hacer «aplicaciones de un solo ejecutable» (SEA): una copia
// de node.exe con un programa de JavaScript cosido dentro. Aquí ese programa es
// el bundle del motor más un anfitrión (archivos, sistema, módulos desde la
// memoria, FFI) más tus .esl como texto. El motor compila tus archivos al
// arrancar, igual que n-node.js: lo que cambia es de dónde salen.
//
// Los .esl se guardan tal cual (texto), no como bytecode: son 10–50 KB, y así
// el mensaje de error de un programa empaquetado trae línea y columna igual que
// en desarrollo. Quien quiera ocultar el código tiene .elb (serial) como camino.
//
// No es lo mismo que construir-binario.js: aquel compila EL INTÉRPRETE con QuickJS
// (1,3 MB, sin FFI, y le pasas los .esl por fuera); este empaqueta UNA APP con
// Node dentro (~120 MB, con FFI y ventanas, doble clic y ya).
//
// Lo que hace falta aquí, en la máquina que empaqueta: Node 20 o más nuevo,
// y «postject» (npm install postject); el script lo instala si no está. En la
// máquina que ABRE el ejecutable: nada. Ni Node, ni npm.
//
// Límites honestos:
//   · El ejecutable se construye para ESTA plataforma (el node.exe que lo
//     empaqueta). Un .exe de Windows se hace en Windows.
//   · node.exe viene firmado por Node; al coserle el programa la firma deja de
//     valer. Windows abre el .exe igual, pero SmartScreen puede avisar la
//     primera vez («editor desconocido»). Firmarlo es cosa del que publica.
//   · koffi (el FFI) y las DLL van en archivos aparte junto al .exe: un módulo
//     nativo no se puede coser dentro. La carpeta entera es la app.
//   · «--c1en» mete el bundle de C1EÑ (numerico y nen abiertos sin usar); los
//     dispositivos nativo y gpu necesitan además gcc o CUDA en la máquina de
//     destino, como siempre; sin ellos corre en jit.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const R = require('../rutas.js');

// ───────────────────────────────────────────────────────────── argumentos
const args = process.argv.slice(2);
let ventana = false, c1en = false;
const extras = [];
while (args.length && args[0].startsWith('--')) {
  const op = args.shift();
  if (op === '--ventana') ventana = true;
  else if (op === '--c1en') c1en = true;
  else if (op.startsWith('--con=')) extras.push(op.slice(6));
  else { console.log('opción desconocida ' + op + ' · las que hay: --ventana, --c1en, --con=archivo'); process.exit(2); }
}
if (!args.length) {
  console.log('uso: node motor/util/empaquetar.js [--ventana] [--c1en] [--con=archivo]… principal.esl [carpetaSalida]');
  process.exit(2);
}
const principal = path.resolve(args[0]);
if (!fs.existsSync(principal)) { console.log('no existe ' + principal); process.exit(2); }
if (fs.statSync(principal).isDirectory()) {
  const dentro = fs.readdirSync(principal).filter(f => /\.esl$/i.test(f));
  console.log(`«${principal}» es una carpeta; hay que pasar el archivo .esl principal` +
    (dentro.length ? `, por ejemplo:\n  ${path.join(principal, dentro.includes('principal.esl') ? 'principal.esl' : dentro[0])}` : ''));
  process.exit(2);
}
const nombre = path.basename(principal).replace(/\.esl$/i, '');
const salida = path.resolve(args[1] || R.salida(path.join('dist', nombre)));
const dirApp = path.dirname(principal);
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { console.log(`hace falta Node 20 o más nuevo para empaquetar (este es ${process.version})`); process.exit(2); }

// ───────────────────────────────────────────────────────────── 1. analizar: qué archivos entran
// El propio motor dice qué módulos usa el programa (resuelve los «usar» y
// verifica los tipos cruzando archivos) SIN ejecutarlo: un programa de ventana
// no se puede «ejecutar un poco» para ver qué importa.
require(c1en ? R.bundleC1en : R.bundle);
const falla = m => { throw new Error(m); };
const anfitrionAnalisis = {
  archivos: { leer: r => fs.readFileSync(r, 'utf8'), existe: r => fs.existsSync(r) },
  sistema: { argumentos: () => [], entorno: n => (n in process.env ? process.env[n] : null) },
  modulos: {
    resolver(espec, desde) {
      const abs = path.resolve(desde ? path.dirname(desde) : dirApp, espec);
      let real;
      try { real = fs.realpathSync(abs); } catch (_) { falla(`no existe el módulo «${espec}» (se buscó en ${abs})`); }
      return real;
    },
    leer: k => fs.readFileSync(k, 'utf8'),
  },
};
const motor = globalThis.EspanolLike.crearMotor({ salida: () => {}, host: anfitrionAnalisis });
const claveRaiz = fs.realpathSync(principal);
const an = motor.analizar(fs.readFileSync(claveRaiz, 'utf8'), claveRaiz);
if (!an.ok) {
  console.log('el programa no compila; arréglalo antes de empaquetar:');
  for (const e of an.errores) console.log('  ' + (e.formato ? e.formato() : e.message));
  process.exit(1);
}
// Rutas virtuales: el programa principal vive en /app/<nombre>.esl y cada módulo
// en /app/<ruta relativa a su carpeta>; «..» se normaliza (/app/../lib/x →
// /lib/x). Lo que importa es que resolver(espec, desde) dé la misma clave aquí
// y dentro del ejecutable, y las dos usan path.posix.normalize.
const virtual = real => path.posix.normalize('/app/' + path.relative(dirApp, real).split(path.sep).join('/'));
const archivos = {};
archivos[virtual(claveRaiz)] = fs.readFileSync(claveRaiz, 'utf8');
for (const m of an.modulos) archivos[virtual(m.clave)] = fs.readFileSync(m.clave, 'utf8');
console.log(`${Object.keys(archivos).length} archivo(s) de Ñ:`);
for (const k of Object.keys(archivos)) console.log('  ' + k);

// ───────────────────────────────────────────────────────────── 2. el programa de arranque
const bundle = fs.readFileSync(c1en ? R.bundleC1en : R.bundle, 'utf8');
// nativo-koffi.js tal cual, pero su require('koffi') pasa por el «require» de
// la carpeta lib/ del ejecutable (dentro de un SEA, require solo trae los
// módulos de Node; para archivos de disco hay que crear uno).
const ffiFuente = fs.readFileSync(R.util('nativo-koffi.js'), 'utf8')
  .replace("require('koffi')", "requerirApp('koffi')")
  .replace(/module\.exports\s*=\s*\{[^}]*\};?/, 'return { crear, porQueNo };');

const arranque = `'use strict';
// Generado por motor/util/empaquetar.js · ${new Date().toISOString()} · no editar a mano
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');
const NOMBRE = ${JSON.stringify(nombre)};
const VENTANA = ${ventana};
const PRINCIPAL = ${JSON.stringify(virtual(claveRaiz))};
const ARCHIVOS = ${JSON.stringify(archivos)};

// La carpeta de la app es la del ejecutable, y es el directorio de trabajo: así
// «leerTexto("datos.csv")» y «nativa("./raylib.dll", …)» encuentran lo que está
// junto al .exe, se abra desde donde se abra (doble clic incluido).
const dirApp = path.dirname(process.execPath);
try { process.chdir(dirApp); } catch (_) { /* si no se puede, se queda donde está */ }
const requerirApp = (() => {
  const req = createRequire(path.join(dirApp, 'lib', 'app.cjs'));
  return (m) => req(m);
})();

// ── salida: consola, o un registro junto al ejecutable si es app de ventana
const rutaLog = path.join(dirApp, NOMBRE + '.log');
let primeraLinea = true;
function escribirSalida(s) {
  if (!VENTANA) { console.log(s); return; }
  try {
    if (primeraLinea) { fs.writeFileSync(rutaLog, '', 'utf8'); primeraLinea = false; }
    fs.appendFileSync(rutaLog, s + '\\n', 'utf8');
  } catch (_) { /* sin registro no pasa nada */ }
}
// Un error en una app de ventana no tiene dónde salir: cuadro de diálogo (Windows,
// por el mismo FFI) además del registro.
function avisarError(texto) {
  escribirSalida(texto);
  if (!VENTANA) return;
  if (process.platform === 'win32') {
    try {
      const koffi = requerirApp('koffi');
      const user32 = koffi.load('user32.dll');
      const MessageBoxW = user32.func('int __stdcall MessageBoxW(void *, const char16_t *, const char16_t *, uint32_t)');
      MessageBoxW(null, texto, NOMBRE + ' · error', 0x10);
      return;
    } catch (_) { /* sin koffi no hay cuadro; queda el registro */ }
  }
  try { console.error(texto); } catch (_) { /* nada */ }
}

// ── el motor (el bundle entero, cosido aquí)
${bundle}

// ── anfitrión: archivos y sistema de verdad; módulos desde la memoria
const falla = (m) => { throw new Error(m); };
const intenta = (m, f) => { try { return f(); } catch (e) { falla(m + (e && e.code ? ' (' + e.code + ')' : '')); } };
const archivos = {
  leer: r => intenta('no se pudo leer ' + r, () => fs.readFileSync(r, 'utf8')),
  leerBytes: r => intenta('no se pudo leer ' + r, () => fs.readFileSync(r)),
  escribirBytes: (r, b) => intenta('no se pudo escribir ' + r, () => fs.writeFileSync(r, b)),
  escribir: (r, t) => intenta('no se pudo escribir ' + r, () => fs.writeFileSync(r, t, 'utf8')),
  agregar: (r, t) => intenta('no se pudo abrir ' + r, () => fs.appendFileSync(r, t, 'utf8')),
  existe: r => fs.existsSync(r),
  esCarpeta: r => { try { return fs.statSync(r).isDirectory(); } catch (_) { return false; } },
  listar: r => intenta('no se pudo listar ' + r, () => fs.readdirSync(r)),
  crearCarpeta: r => intenta('no se pudo crear ' + r, () => { fs.mkdirSync(r, { recursive: true }); }),
  borrar: r => { if (!fs.existsSync(r)) return false; intenta('no se pudo borrar ' + r, () => fs.rmSync(r)); return true; },
  tamano: r => intenta('no existe ' + r, () => fs.statSync(r).size),
};
const modulos = {
  resolver(espec, desde) {
    const base = desde ? path.posix.dirname(desde) : '/app';
    const clave = path.posix.normalize(path.posix.join(base, espec.split('\\\\').join('/')));
    if (!(clave in ARCHIVOS)) falla('no existe el módulo «' + espec + '» (no se empaquetó: ' + clave + ')');
    return clave;
  },
  leer: clave => ARCHIVOS[clave],
};
let lineas = null, iLinea = 0;
function entradaEntera() {
  if (lineas !== null) return;
  let t = '';
  try { t = VENTANA ? '' : fs.readFileSync(0, 'utf8'); } catch (_) { t = ''; }
  lineas = t.length ? t.replace(/\\r\\n/g, '\\n').replace(/\\n$/, '').split('\\n') : [];
}
// Los argumentos del programa: en un SEA, argv trae el ejecutable (a veces dos
// veces: la ruta real y como se escribió); se quitan y queda lo que puso el usuario.
const argumentosApp = (() => {
  const a = process.argv.slice(1);
  const mismo = x => { try { return fs.realpathSync(path.resolve(x)) === fs.realpathSync(process.execPath); } catch (_) { return false; } };
  while (a.length && mismo(a[0])) a.shift();
  return a;
})();
const sistema = {
  argumentos: () => argumentosApp,
  entorno: n => (n in process.env ? process.env[n] : null),
  ejecutar(orden, extra) {
    try {
      const salida = execFileSync(orden, extra, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      return { codigo: 0, salida, error: '' };
    } catch (e) {
      return { codigo: e.status === undefined || e.status === null ? -1 : e.status,
               salida: e.stdout ? String(e.stdout) : '', error: e.stderr ? String(e.stderr) : String(e.message || e) };
    }
  },
  leerLinea() { entradaEntera(); return iLinea < lineas.length ? lineas[iLinea++] : null; },
  salir: c => process.exit(c),
};
const ffi = (function () {
${ffiFuente}
})();
const nativo = ffi.crear();
const red = typeof fetch === 'function' ? {
  pedir(url, o, fn, vm) {
    const responder = datos => {
      const d = vm.nuevoDic();
      for (const k in datos) d.mapa.set(k, datos[k]);
      try { vm.nuevoTurno(); vm.invocar(fn, [d]); }
      catch (e) { avisarError(e.formato ? e.formato() : String(e.message || e)); process.exitCode = 1; }
    };
    const cab = Object.assign({}, o.cabeceras);
    if (o.cuerpo !== null && !Object.keys(cab).some(k => k.toLowerCase() === 'content-type')) cab['Content-Type'] = 'text/plain;charset=utf-8';
    let estado = 0, tipo = '';
    fetch(url, { method: o.metodo, headers: cab, body: o.cuerpo, redirect: 'follow', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined })
      .then(r => { estado = r.status; tipo = (r.headers.get('content-type') || '').split(';')[0].trim(); return r.text(); })
      .then(t => responder({ ok: estado >= 200 && estado < 300, estado, cuerpo: t, tipo, error: '' }))
      .catch(e => responder({ ok: false, estado, cuerpo: '', tipo, error: String((e && e.message) || e) }));
  },
} : null;

const m = globalThis.EspanolLike.crearMotor({
  salida: escribirSalida,
  host: Object.assign({ archivos, sistema, modulos }, nativo ? { nativo } : null, red ? { red } : null),
  limiteInstr: Infinity,
});
const r = m.ejecutar(ARCHIVOS[PRINCIPAL], PRINCIPAL);
if (!r.ok) {
  avisarError(r.errores.map(e => (e.formato ? e.formato() : e.message)).join('\\n'));
  process.exit(1);
}
`;

// ───────────────────────────────────────────────────────────── 3. construir
fs.mkdirSync(salida, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n-empaquetar-'));
const rutaArranque = path.join(tmp, 'arranque.js');
const rutaBlob = path.join(tmp, 'programa.blob');
const rutaConf = path.join(tmp, 'sea.json');
fs.writeFileSync(rutaArranque, arranque, 'utf8');
fs.writeFileSync(rutaConf, JSON.stringify({ main: rutaArranque, output: rutaBlob, disableExperimentalSEAWarning: true, useCodeCache: false }), 'utf8');
console.log('generando el programa de arranque…');
const gen = spawnSync(process.execPath, ['--experimental-sea-config', rutaConf], { encoding: 'utf8' });
if (gen.status !== 0) { console.log('no se pudo generar el blob SEA:\n' + gen.stdout + gen.stderr); process.exit(1); }

// postject: cose el blob en una copia de node
let postject;
try { postject = require('postject'); }
catch (_) {
  if (process.env.N_EMPAQUETAR_RELANZADO) {
    console.log('postject está en node_modules pero Node no consigue cargarlo; prueba: npm install postject  y vuelve a correr esto');
    process.exit(1);
  }
  console.log('instalando postject (una vez; es la herramienta que cose el programa en el ejecutable)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const ins = spawnSync(npm, ['install', '--no-save', '--no-audit', '--no-fund', '--loglevel=error', 'postject'], { cwd: R.proyecto, encoding: 'utf8', shell: process.platform === 'win32' });
  if (ins.status !== 0) { console.log('no se pudo instalar postject: ' + ins.stderr + '\nhazlo a mano: npm install postject'); process.exit(1); }
  // Node guarda en caché, mientras carga el programa principal, los «stat» que
  // ya hizo: el primer require probó node_modules/postject, no existía, y esa
  // respuesta queda pegada aunque npm acabe de crearlo. Así que, ya instalado,
  // se vuelve a lanzar este mismo script en un proceso nuevo, que lo ve.
  if (!fs.existsSync(path.join(R.proyecto, 'node_modules', 'postject', 'package.json'))) {
    console.log('npm terminó pero node_modules/postject no apareció; hazlo a mano: npm install postject');
    process.exit(1);
  }
  const otraVez = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, N_EMPAQUETAR_RELANZADO: '1' } });
  process.exit(otraVez.status === null ? 1 : otraVez.status);
}
const exe = path.join(salida, nombre + (process.platform === 'win32' ? '.exe' : ''));
fs.copyFileSync(process.execPath, exe);
if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
console.log('cosiendo el programa en ' + path.basename(exe) + '…');
(async () => {
  // postject avisa de secciones ELF sin nombre («.note.100»): ruido conocido, no un fallo
  const avisar = console.warn;
  console.warn = () => {};
  try {
    await postject.inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(rutaBlob), {
      sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
      machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined,
    });
  } finally { console.warn = avisar; }

  // ── app de ventana en Windows: subsistema GUI, para que no se abra una consola
  // El campo Subsystem del encabezado PE: 2 = ventana (GUI), 3 = consola. Está
  // en el encabezado opcional, a 68 bytes de su comienzo, y el encabezado
  // opcional empieza 24 bytes después de la firma «PE\0\0», cuya posición dice
  // el campo e_lfanew (desplazamiento 0x3C del archivo). Dos bytes, y listo.
  if (ventana && process.platform === 'win32') {
    const fd = fs.openSync(exe, 'r+');
    const cab = Buffer.alloc(4);
    fs.readSync(fd, cab, 0, 4, 0x3c);
    const pe = cab.readUInt32LE(0);
    const firma = Buffer.alloc(4);
    fs.readSync(fd, firma, 0, 4, pe);
    if (firma.toString('latin1') !== 'PE\0\0') { fs.closeSync(fd); console.log('el ejecutable no es PE; no se pudo marcar como aplicación de ventana'); }
    else {
      const sub = Buffer.alloc(2);
      sub.writeUInt16LE(2, 0);
      fs.writeSync(fd, sub, 0, 2, pe + 24 + 68);
      fs.closeSync(fd);
      console.log('marcado como aplicación de ventana (sin consola)');
    }
  }

  // ── lo que viaja junto al ejecutable
  const copiar = (de, a) => {
    if (fs.statSync(de).isDirectory()) fs.cpSync(de, a, { recursive: true });
    else { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(de, a); }
  };
  // koffi y su binario de esta plataforma
  const nmKoffi = path.join(R.proyecto, 'node_modules', 'koffi');
  if (fs.existsSync(nmKoffi)) {
    const destNm = path.join(salida, 'lib', 'node_modules');
    copiar(nmKoffi, path.join(destNm, 'koffi'));
    for (const d of ['doc', 'src/cnoke', 'vendor']) fs.rmSync(path.join(destNm, 'koffi', d), { recursive: true, force: true });
    const bin = path.join(R.proyecto, 'node_modules', '@koromix', `koffi-${process.platform}-${process.arch}`);
    if (fs.existsSync(bin)) copiar(bin, path.join(destNm, '@koromix', path.basename(bin)));
    else console.log(`aviso: no está el binario de koffi para ${process.platform}-${process.arch} (@koromix/koffi-…); «nativa» no funcionará en el ejecutable`);
    fs.writeFileSync(path.join(salida, 'lib', 'app.cjs'), '// ancla para require(): koffi vive en node_modules/ de esta carpeta\n', 'utf8');
  } else console.log('aviso: koffi no está instalado aquí; el ejecutable no podrá llamar a código nativo (npm install koffi)');
  // bibliotecas nativas junto al programa
  for (const f of fs.readdirSync(dirApp)) {
    if (/\.(dll|so(\.\d+)*|dylib)$/i.test(f)) { copiar(path.join(dirApp, f), path.join(salida, f)); console.log('  + ' + f); }
  }
  // lo pedido con --con
  for (const e of extras) {
    const de = path.resolve(e);
    if (!fs.existsSync(de)) { console.log('aviso: no existe ' + de); continue; }
    copiar(de, path.join(salida, path.basename(de)));
    console.log('  + ' + path.basename(de));
  }
  fs.writeFileSync(path.join(salida, 'LEEME.txt'),
    `${nombre} — hecho en Ñ y empaquetado con motor/util/empaquetar.js\n\n` +
    `Abre ${path.basename(exe)}. No hace falta tener Node ni nada instalado.\n` +
    (ventana ? `Es una app de ventana: lo que el programa «imprime» queda en ${nombre}.log, aquí mismo.\n` : '') +
    `La carpeta entera es la app: lib/ (código nativo) y las .dll/.so tienen que viajar con el ejecutable.\n`, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  const mb = (fs.statSync(exe).size / 1048576).toFixed(1);
  console.log(`listo: ${exe} (${mb} MB)`);
})().catch(e => { console.log('no se pudo coser el programa: ' + (e && e.message || e)); process.exit(1); });
