#!/usr/bin/env node
// El shebang es lo que vuelve esto un ejecutable cuando el paquete se
// instala: «npm i -g n-lenguaje» deja una orden «n» que apunta aquí. No
// estorba al uso de siempre, porque «node util/n-node.js» ignora la
// primera línea.
// Intérprete de Ñ de línea de órdenes, para Node.
//   node motor/util/n-node.js programa.esl [argumentos…]
// El mismo motor y el mismo anfitrión de archivos y sistema que la versión de
// QuickJS; cambia solo cómo se le pide al sistema operativo. Existe porque Node
// ya está donde se desarrolla, y bajar un binario aparte para probar un
// programa es una barrera tonta.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../rutas.js');
require(R.bundle);

const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node motor/util/n-node.js programa.esl [argumentos…]'); process.exit(2); }
let fuente;
try { fuente = fs.readFileSync(args[0], 'utf8'); }
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
  escribir: (r, t) => intenta('no se pudo escribir ' + r, () => fs.writeFileSync(r, t, 'utf8')),
  agregar: (r, t) => intenta('no se pudo abrir ' + r, () => fs.appendFileSync(r, t, 'utf8')),
  existe: r => fs.existsSync(r),
  esCarpeta: r => { try { return fs.statSync(r).isDirectory(); } catch (_) { return false; } },
  listar: r => intenta('no se pudo listar ' + r, () => fs.readdirSync(r)),
  crearCarpeta: r => intenta('no se pudo crear ' + r, () => { fs.mkdirSync(r, { recursive: true }); }),
  borrar: r => { if (!fs.existsSync(r)) return false; intenta('no se pudo borrar ' + r, () => fs.rmSync(r)); return true; },
  tamano: r => intenta('no existe ' + r, () => fs.statSync(r).size),
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

// La entrada se lee entera de golpe y se va sirviendo por líneas: el motor es
// síncrono y no hay forma de esperar a que llegue una línea a mitad de turno.
let lineas = null, iLinea = 0;
function entradaEntera() {
  if (lineas !== null) return;
  let t = '';
  try { t = fs.readFileSync(0, 'utf8'); } catch (_) { t = ''; }
  lineas = t.length ? t.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
}

const sistema = {
  argumentos: () => args.slice(1),
  entorno: n => (n in process.env ? process.env[n] : null),
  ejecutar(orden, extra) {
    // Sin shell, igual que en la versión de QuickJS: la orden y sus argumentos
    // van por separado y un dato con espacios no se convierte en otra orden.
    try {
      const salida = execFileSync(orden, extra, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      return { codigo: 0, salida, error: '' };
    } catch (e) {
      return { codigo: e.status === undefined || e.status === null ? -1 : e.status,
               salida: e.stdout ? String(e.stdout) : '',
               error: e.stderr ? String(e.stderr) : String(e.message || e) };
    }
  },
  leerLinea() { entradaEntera(); return iLinea < lineas.length ? lineas[iLinea++] : null; },
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

const m = globalThis.EspanolLike.crearMotor({
  salida: s => console.log(s),
  host: Object.assign({ archivos, sistema, modulos },
                      nativo ? { nativo } : null,
                      red ? { red } : null),
  limiteInstr: 4e8,
});
const r = m.ejecutar(fuente, claveRaiz);
if (!r.ok) {
  for (const e of r.errores) console.log(e.formato ? e.formato() : e.message);
  process.exit(1);
}
