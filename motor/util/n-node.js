#!/usr/bin/env node
// El shebang es lo que vuelve esto un ejecutable cuando el paquete se
// instala: «npm i -g n-lenguaje» deja una orden «n» que apunta aquí. No
// estorba al uso de siempre, porque «node util/n-node.js» ignora la
// primera línea.
// Intérprete de Ñ de línea de órdenes, para Node.
//   node motor/util/n-node.js [--limite=N] programa.esl [argumentos…]
//   node motor/util/n-node.js programa.elb [argumentos…]      (bytecode: util/elb.js)
// El mismo motor y el mismo anfitrión de archivos y sistema que la versión de
// QuickJS; cambia solo cómo se le pide al sistema operativo. Existe porque Node
// ya está donde se desarrolla, y bajar un binario aparte para probar un
// programa es una barrera tonta.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const os = require('os');
const R = require('../rutas.js');
// Perfil del motor: «node motor/util/n-node.js --c1en programa.esl» carga el
// bundle de C1EÑ, con numerico y nen abiertos sin «usar». También con la
// variable N_PERFIL=c1en, para no repetirlo en cada orden.
const argsCrudos = process.argv.slice(2);
const quiereC1en = argsCrudos.includes('--c1en') || process.env.N_PERFIL === 'c1en';
if (quiereC1en) argsCrudos.splice(argsCrudos.indexOf('--c1en'), argsCrudos.includes('--c1en') ? 1 : 0);
require(quiereC1en ? R.bundleC1en : R.bundle);

const args = argsCrudos;
// Opciones del intérprete: van ANTES del programa; lo que va después es del programa.
// En la consola no hay tope de instrucciones por defecto: un programa largo —una
// simulación de horas— es trabajo legítimo, y uno desbocado se para con Ctrl+C,
// como en cualquier lenguaje. El tope existe para el IDE, que comparte hilo con
// la interfaz. Quien lo quiera aquí lo pide: --limite=400000000
let limite = Infinity;
while (args.length && args[0].startsWith('--')) {
  const op = args.shift();
  const m = /^--limite=(\d+(?:e\d+)?)$/.exec(op);
  if (m) limite = Number(m[1]);
  else { console.log('opción desconocida ' + op + ' · la única es --limite=N'); process.exit(2); }
}
if (!args.length) { console.log('uso: node motor/util/n-node.js [--limite=N] programa.esl|programa.elb [argumentos…]'); process.exit(2); }
// Un .elb (o su versión en base64, .elb.txt) no se compila: se verifica y se
// corre. Puede ser de un archivo (ESLB) o un paquete con sus módulos (ESLP,
// util/paquete-elb.js); los dos se hacen con «node motor/util/elb.js».
const esBytecode = /\.elb(\.txt)?$/i.test(args[0]);
let fuente, bytecode;
try { if (esBytecode) bytecode = fs.readFileSync(args[0]); else fuente = fs.readFileSync(args[0], 'utf8'); }
catch (e) { console.log('no se pudo abrir ' + args[0]); process.exit(2); }
// La clave canónica del programa: contra ella se resuelven las rutas relativas
// de sus «usar», y con ella se reconoce que dos rutas distintas son el mismo
// archivo y por tanto el mismo módulo.
let claveRaiz;
try { claveRaiz = fs.realpathSync(path.resolve(args[0])); }
catch (_) { claveRaiz = path.resolve(args[0]); }

// Los mensajes se dicen aquí, en español y con la misma forma que en la versión
// de QuickJS: un programa no debería tener que leer dos textos distintos según
// el intérprete que lo esté corriendo.
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
  // (4.1, S2)
  copiar: (a, b) => intenta('no se pudo copiar ' + a + ' a ' + b, () => fs.cpSync(a, b, { recursive: true })),
  mover: (a, b) => intenta('no se pudo mover ' + a + ' a ' + b, () => fs.renameSync(a, b)),
  info: r => {
    const st = intenta('no existe ' + r, () => fs.statSync(r));
    return { tamano: st.size, modificado: st.mtimeMs, creado: st.birthtimeMs, esCarpeta: st.isDirectory(), esArchivo: st.isFile() };
  },
  // Línea a línea, sin cargar el archivo entero: lee trozos de 64 KB y va
  // soltando líneas. Devuelve una función que da la siguiente, o undefined al
  // acabar (y entonces cierra el archivo).
  lineas(r) {
    const fd = intenta('no se pudo abrir ' + r, () => fs.openSync(r, 'r'));
    const buf = Buffer.alloc(65536);
    let resto = Buffer.alloc(0), fin = false, cerrado = false;
    const cerrar = () => { if (!cerrado) { cerrado = true; try { fs.closeSync(fd); } catch (_) {} } };
    const siguiente = () => {
      for (;;) {
        const nl = resto.indexOf(10);
        if (nl >= 0) {
          let linea = resto.subarray(0, nl);
          resto = resto.subarray(nl + 1);
          if (linea.length && linea[linea.length - 1] === 13) linea = linea.subarray(0, linea.length - 1);
          return linea.toString('utf8');
        }
        if (fin) {
          cerrar();
          if (!resto.length) return undefined;
          const ultima = resto.toString('utf8').replace(/\r$/, ''); resto = Buffer.alloc(0);
          return ultima;
        }
        const n = fs.readSync(fd, buf, 0, buf.length, null);
        if (n === 0) fin = true;
        else resto = Buffer.concat([resto, buf.subarray(0, n)]);
      }
    };
    siguiente.cerrar = cerrar;
    return siguiente;
  },
};
// Rutas: las de este sistema operativo (\\ en Windows, / en el resto).
const rutas = {
  unir: partes => path.join(...partes),
  absoluta: r => path.resolve(r),
  normalizar: r => path.normalize(r),
  nombre: r => path.basename(r),
  extension: r => path.extname(r),
  carpeta: r => path.dirname(r),
  esAbsoluta: r => path.isAbsolute(r),
  relativa: (de, a) => path.relative(de, a),
  separador: path.sep,
};

// ------------------------------------------------------------------- módulos
// El cargador de módulos es del anfitrión, como los archivos: el motor no sabe
// leer nada. Aquí, fuera del navegador, resolver quiere decir el disco.
//
// Las rutas son relativas AL ARCHIVO QUE IMPORTA, no al directorio desde el que
// se lanzó el programa. Es la única opción que deja mover una carpeta de
// módulos de sitio sin reescribir lo que dice dentro.
//
// La clave es la ruta real: dos caminos distintos al mismo archivo —«./m.esl» y
// «../lib/m.esl»— dan la misma clave, y por tanto el mismo módulo, ejecutado
// una sola vez.
const modulos = {
  resolver(espec, desde) {
    const base = desde ? path.dirname(desde) : process.cwd();
    const abs = path.resolve(base, espec);
    let real;
    try { real = fs.realpathSync(abs); }
    catch (_) { falla(`no existe el módulo «${espec}» (se buscó en ${abs})`); }
    if (!fs.statSync(real).isFile()) falla(`«${espec}» no es un archivo (${real})`);
    return real;
  },
  leer(clave) {
    const t = fs.readFileSync(clave, 'utf8');
    return t;
  },
};

// (4.1, S2) La entrada se lee de verdad línea a línea. En la 4.0 se leía
// ENTERA de golpe, y en una terminal eso es esperar al Ctrl+D: un programa que
// pregunta «¿cómo te llamas?» se quedaba colgado sin enseñar nada. Ahora se
// lee lo que haya llegado (en una terminal, hasta que se pulsa Intro) y se
// guarda lo que sobre para la siguiente línea.
let pendienteEntrada = Buffer.alloc(0), finEntrada = false;
const bufEntrada = Buffer.alloc(4096);
const dormirSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function siguienteLinea() {
  for (;;) {
    const nl = pendienteEntrada.indexOf(10);
    if (nl >= 0) {
      let l = pendienteEntrada.subarray(0, nl);
      pendienteEntrada = pendienteEntrada.subarray(nl + 1);
      if (l.length && l[l.length - 1] === 13) l = l.subarray(0, l.length - 1);
      return l.toString('utf8');
    }
    if (finEntrada) {
      if (!pendienteEntrada.length) return null;
      const u = pendienteEntrada.toString('utf8'); pendienteEntrada = Buffer.alloc(0);
      return u;
    }
    let n;
    try { n = fs.readSync(0, bufEntrada, 0, bufEntrada.length, null); }
    catch (e) {
      if (e.code === 'EAGAIN') { dormirSync(10); continue; }   // entrada no bloqueante: esperar un poco
      if (e.code === 'EOF') n = 0; else n = 0;
    }
    if (n === 0) finEntrada = true;
    else pendienteEntrada = Buffer.concat([pendienteEntrada, bufEntrada.subarray(0, n)]);
  }
}

function opcionesProceso(op, sincrono) {
  op = op || {};
  const o = { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 };
  if (op.carpeta) o.cwd = op.carpeta;
  if (op.entorno) o.env = Object.assign({}, process.env, op.entorno);
  if (op.espera) o.timeout = op.espera;
  if (sincrono) {
    if (typeof op.entrada === 'string') { o.input = op.entrada; o.stdio = ['pipe', 'pipe', 'pipe']; }
    else o.stdio = ['ignore', 'pipe', 'pipe'];
  }
  return o;
}
function resultadoFallido(e) {
  const muerto = e.code === 'ETIMEDOUT' || (e.signal === 'SIGTERM' && e.killed);
  return { codigo: e.status === undefined || e.status === null ? -1 : e.status,
           salida: e.stdout ? String(e.stdout) : '',
           error: muerto ? 'se pasó del tiempo de espera y se paró' : e.stderr ? String(e.stderr) : String(e.message || e) };
}

const sistema = {
  argumentos: () => args.slice(1),
  entorno: n => (n in process.env ? process.env[n] : null),
  ejecutar(orden, extra, op) {
    // Sin shell, igual que en la versión de QuickJS: la orden y sus argumentos
    // van por separado y un dato con espacios no se convierte en otra orden.
    // (4.1, S2) op: { entrada, carpeta, entorno, espera } — todas opcionales.
    try {
      const salida = execFileSync(orden, extra, opcionesProceso(op, true));
      return { codigo: 0, salida, error: '' };
    } catch (e) { return resultadoFallido(e); }
  },
  // (4.1, S2) Lo mismo sin esperar: «listo» recibe el resultado.
  ejecutarFondo(orden, extra, op, listo) {
    const hijo = execFile(orden, extra, opcionesProceso(op, false), (e, salida, error) => {
      if (!e) return listo({ codigo: 0, salida: String(salida), error: String(error) });
      const codigo = typeof e.code === 'number' ? e.code : -1;      // ENOENT y compañía llegan como texto
      const msg = e.killed ? 'se pasó del tiempo de espera y se paró'
        : String(error || '') || (typeof e.code === 'string' ? `no se pudo lanzar «${orden}» (${e.code})` : String(e.message || e));
      listo({ codigo, salida: String(salida || ''), error: msg });
    });
    if (op && typeof op.entrada === 'string') { hijo.stdin.end(op.entrada); }
    else if (hijo.stdin) hijo.stdin.end();
  },
  carpetaActual: () => process.cwd(),
  cambiarCarpeta: r => process.chdir(r),
  info: () => ({ so: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : process.platform,
                 arquitectura: process.arch, procesadores: os.cpus().length, memoria: os.totalmem(),
                 libre: os.freemem(), usuario: os.userInfo().username, personal: os.homedir(),
                 temporal: os.tmpdir(), equipo: os.hostname(), motor: 'node ' + process.version }),
  leerLinea() { return siguienteLinea(); },
  indicar: t => { try { fs.writeSync(1, t); } catch (_) { console.log(t); } },
  salir: c => process.exit(c),
};

// Código nativo. Es lo único del anfitrión que puede no estar: koffi es una
// dependencia opcional, y si no está instalada el motor se queda sin `nativo` y
// «nativa» lo dice con esas palabras, igual que «leerTexto» dentro del
// navegador. Instalarlo es `npm install koffi` en la carpeta del proyecto; en
// Windows x64 baja un binario ya compilado y no hace falta compilador de C.
const ffi = require('./nativo-koffi.js');
const nativo = ffi.crear();
// Si koffi está pero sin binario para esta plataforma, decirlo aquí una vez es
// mejor que dejar que «nativa» sugiera instalar algo que ya está instalado.
if (!nativo && ffi.porQueNo() && !/no está instalado/.test(ffi.porQueNo()))
  console.log('aviso: ' + ffi.porQueNo());


// Red. Node trae «fetch» desde la 18, así que aquí no hace falta nada más.
//
// Y aquí NO se pide permiso, al contrario que en el navegador. No es un
// descuido: en el navegador el programa es algo que estás editando o que te
// pasaron, y por eso se pregunta una vez por sitio. En la consola el programa
// es uno que tú decidiste ejecutar, y que ya puede leer tus archivos y lanzar
// procesos — pedir permiso para una petición HTTP cuando «ejecutar» no lo pide
// sería teatro.
const ESPERA_RED = 15000, MAX_RED = 2 * 1024 * 1024;
const red = typeof fetch === 'function' ? {
  pedir(url, o, fn, vm) {
    const responder = datos => {
      const d = vm.nuevoDic();
      for (const k in datos) d.mapa.set(k, datos[k]);
      try { vm.nuevoTurno(); vm.invocar(fn, [d]); }
      catch (e) { console.log(e.formato ? e.formato() : String(e.message || e)); process.exitCode = 1; }
    };
    const corta = AbortSignal.timeout ? AbortSignal.timeout(ESPERA_RED) : undefined;
    const cab = Object.assign({}, o.cabeceras);
    if (o.cuerpo !== null && !Object.keys(cab).some(k => k.toLowerCase() === 'content-type'))
      cab['Content-Type'] = 'text/plain;charset=utf-8';
    let estado = 0, tipo = '';
    fetch(url, { method: o.metodo, headers: cab, body: o.cuerpo, redirect: 'follow', signal: corta })
      .then(r => {
        estado = r.status;
        tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
        return r.text();
      })
      .then(t => {
        if (t.length > MAX_RED) throw new Error('la respuesta ocupa más de ' + MAX_RED + ' caracteres');
        responder({ ok: estado >= 200 && estado < 300, estado, cuerpo: t, tipo, error: '' });
      })
      .catch(e => {
        // «fetch failed» a secas no le sirve a nadie: la razón de verdad está
        // una capa más abajo, en la causa.
        const causa = e && e.cause && e.cause.message;
        const msg = (e && e.name === 'TimeoutError')
          ? 'la petición tardó más de ' + (ESPERA_RED / 1000) + ' s'
          : String((e && e.message) || e) + (causa ? ': ' + causa : '');
        responder({ ok: false, estado, cuerpo: '', tipo, error: msg });
      });
  },
} : null;

// (4.1, S2) Lo que llega de fuera cuando el programa principal ya acabó
// —un temporizador, una respuesta, una petición al servidor— es un turno. Si
// falla, se dice y el proceso acabará con código 1, pero lo demás sigue: un
// servidor no se cae porque una petición falle.
const errorEnTurno = e => { console.log(e && e.formato ? e.formato() : String((e && e.message) || e)); process.exitCode = 1; };
function turno(vm, fn, args) {
  try { vm.nuevoTurno(); vm.invocar(fn, args || []); }
  catch (e) { errorEnTurno(e); }
}
// El reloj. En la 4.0 la consola no tenía: «luego» y «cada» solo funcionaban
// en el IDE. Desde la 4.1 funcionan aquí, y con ellos «dormir» y lo asíncrono.
const temporizadores = new Map();
let sigTemp = 1;
const tiempo = {
  luego(ms, fn, vm) {
    const id = sigTemp++;
    temporizadores.set(id, setTimeout(() => { temporizadores.delete(id); turno(vm, fn, []); }, Math.max(0, ms)));
    return id;
  },
  cada(ms, fn, vm) {
    const id = sigTemp++;
    temporizadores.set(id, setInterval(() => turno(vm, fn, []), Math.max(1, ms)));
    return id;
  },
  detener(id) {
    const h = temporizadores.get(id);
    if (!h) return false;
    clearTimeout(h); clearInterval(h); temporizadores.delete(id);
    return true;
  },
};
// El servidor HTTP: «servir(puerto, fn)» del eDSL «sistema». El motor recibe
// la petición en datos planos y devuelve la respuesta por «responder».
const http = require('http');
const servidores = new Map();
let sigServ = 1;
const MAX_CUERPO = 8 * 1024 * 1024;
const servidor = {
  escuchar(puerto, anfitrionIp, manejar, listo) {
    const id = sigServ++;
    const srv = http.createServer((req, res) => {
      const trozos = [];
      let largo = 0, cortado = false;
      req.on('data', c => { largo += c.length; if (largo > MAX_CUERPO) { cortado = true; req.destroy(); } else trozos.push(c); });
      req.on('end', () => {
        if (cortado) return;
        const u = new URL(req.url, 'http://x');
        const consulta = {};
        for (const [k, v] of u.searchParams) consulta[k] = v;
        manejar({ metodo: req.method, ruta: decodeURIComponent(u.pathname), consulta,
                  cabeceras: Object.assign({}, req.headers), cuerpo: Buffer.concat(trozos).toString('utf8'),
                  ip: req.socket.remoteAddress || '' },
          r => {
            if (res.headersSent) return;
            res.writeHead(r.estado, Object.assign({ 'Content-Type': r.tipo }, r.cabeceras || {}));
            res.end(r.cuerpo);
          });
      });
    });
    srv.on('error', e => listo(e.code === 'EADDRINUSE' ? 'el puerto ' + puerto + ' ya está en uso' : String(e.message || e)));
    srv.listen(puerto, anfitrionIp, () => listo(null, srv.address().port));
    servidores.set(id, srv);
    return id;
  },
  cerrar(id) {
    const s = servidores.get(id);
    if (!s) return false;
    s.close(); if (s.closeAllConnections) s.closeAllConnections();
    servidores.delete(id);
    return true;
  },
};

const m = globalThis.EspanolLike.crearMotor({
  salida: s => console.log(s),
  host: Object.assign({ archivos, sistema, modulos, rutas, tiempo, servidor, errorEnTurno },
                      nativo ? { nativo } : null,
                      red ? { red } : null),
  limiteInstr: limite,
});
let r;
if (esBytecode) {
  const P = require('./paquete-elb.js').crear(globalThis.EspanolLike);
  if (P.esPaquete(bytecode)) {
    // Todo el paquete se verifica antes de correr nada: un módulo roto no deja
    // que empiece ni el principal.
    let p = null;
    try { p = P.leer(bytecode); }
    catch (e) { r = { ok: false, errores: [e] }; }
    if (p) r = m.correr(p.fn, [], p.modulos);
  } else r = m.ejecutarBytecode(bytecode);
} else r = m.ejecutar(fuente, claveRaiz);
if (!r.ok) {
  for (const e of r.errores) console.log(e.formato ? e.formato() : e.message);
  process.exit(1);
}
