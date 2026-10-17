#!/usr/bin/env node
// Compilar un programa de Ñ a .elb desde la consola, con sus módulos dentro.
//
//   node motor/util/elb.js programa.esl [salida.elb] [--texto] [--c1en] [--avisos]
//   node motor/util/elb.js --ver programa.elb
//
// · Sin «usar» de archivos sale un .elb de siempre (ESLB), el mismo que da el
//   botón «Exportar .elb» del IDE.
// · Con módulos sale un PAQUETE (ESLP): el principal y cada módulo, cada uno
//   un .elb verificado, en un solo archivo. Ver util/paquete-elb.js.
// · --texto lo escribe en base64 (programa.elb.txt), para cuando solo se puede
//   mover texto. Se carga igual.
//
// Correrlo:   node motor/util/n-node.js programa.elb [argumentos…]
// o en el IDE: panel Bytecode → «Importar y ejecutar».
//
// Lo que se gana: un archivo, sin el código fuente, que el motor verifica
// entero antes de ejecutar. Lo que se pierde: el JIT —un .elb corre solo en el
// intérprete, a propósito (ver motor/ARQUITECTURA.md, «El bytecode como
// archivo»)—, así que un programa de cálculo pesado va más lento que desde el
// .esl.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../rutas.js');

const args = process.argv.slice(2);
let texto = false, c1en = false, ver = false, verAvisos = false;
const resto = [];
for (const a of args) {
  if (a === '--texto') texto = true;
  else if (a === '--c1en') c1en = true;
  else if (a === '--ver') ver = true;
  else if (a === '--avisos') verAvisos = true;
  else if (a.startsWith('--')) { console.log('opción desconocida ' + a + ' · las que hay: --texto, --c1en, --ver, --avisos'); process.exit(2); }
  else resto.push(a);
}
const uso = 'uso: node motor/util/elb.js programa.esl [salida.elb] [--texto]   ·   node motor/util/elb.js --ver programa.elb';
if (!resto.length) { console.log(uso); process.exit(2); }

require(c1en ? R.bundleC1en : R.bundle);
const EL = globalThis.EspanolLike;
const P = require('./paquete-elb.js').crear(EL);

// ───────────────────────────────────────────────────────── --ver
if (ver) {
  let datos;
  try { datos = fs.readFileSync(resto[0]); } catch (_) { console.log('no se pudo abrir ' + resto[0]); process.exit(2); }
  try {
    if (P.esPaquete(datos)) {
      const d = P.describir(datos);
      console.log(`paquete .elb verificado · ${d.bytes.toLocaleString('es')} bytes · principal + ${d.modulos.length} módulo(s):`);
      for (const k of d.modulos) console.log('  ' + k);
    } else {
      EL.deserializar(datos);
      console.log(`.elb de un archivo, verificado · ${datos.length.toLocaleString('es')} bytes`);
    }
  } catch (e) {
    console.log(e.formato ? e.formato() : String(e.message || e));
    process.exit(1);
  }
  process.exit(0);
}

// ───────────────────────────────────────────────────────── compilar
const entrada = path.resolve(resto[0]);
if (!fs.existsSync(entrada) || !fs.statSync(entrada).isFile()) { console.log('no existe el archivo ' + entrada); process.exit(2); }
const realPrincipal = fs.realpathSync(entrada);
const carpeta = path.dirname(realPrincipal);

// Las claves: rutas relativas a la carpeta del principal, con «/». Así el
// bytecode no lleva nada de esta máquina y sale igual compilado en cualquier
// carpeta o sistema. «real» recuerda de qué archivo salió cada clave.
const real = new Map();
const relativa = abs => path.relative(carpeta, abs).split(path.sep).join('/');
const clavePrincipal = relativa(realPrincipal);
real.set(clavePrincipal, realPrincipal);

const modulos = {
  resolver(espec, desde) {
    const base = desde ? path.dirname(real.get(desde) || path.join(carpeta, desde)) : carpeta;
    const abs = path.resolve(base, espec);
    let r;
    try { r = fs.realpathSync(abs); }
    catch (_) { throw new Error(`no existe el módulo «${espec}» (se buscó en ${abs})`); }
    if (!fs.statSync(r).isFile()) throw new Error(`«${espec}» no es un archivo (${r})`);
    const k = relativa(r);
    const problema = P.problemaDeClave(k);
    if (problema) throw new Error(`«${espec}» no se puede meter en un .elb: su ruta relativa «${k}» ${problema}`);
    real.set(k, r);
    return k;
  },
  leer(clave) { return fs.readFileSync(real.get(clave), 'utf8'); },
};

const motor = EL.crearMotor({ salida: () => {}, host: { modulos } });
const r = P.compilar(motor, fs.readFileSync(realPrincipal, 'utf8'), clavePrincipal);
// Los avisos son los mismos que al correr el .esl; se cuentan y se enseñan si
// se piden, para que no tapen lo importante (si salió o no).
const avisos = r.avisos || [];
if (avisos.length && verAvisos) for (const a of avisos) console.log('aviso · ' + (a.formato ? a.formato() : a.message));
else if (avisos.length) console.log(`${avisos.length} aviso(s) del verificador, los mismos que al correr el .esl (--avisos para verlos)`);
if (!r.ok) {
  for (const e of r.errores) console.log(e.formato ? e.formato() : String(e.message || e));
  process.exit(1);
}

let salida = resto[1] ? path.resolve(resto[1])
  : path.join(path.dirname(entrada), path.basename(entrada).replace(/\.esl$/i, '') + '.elb');
if (texto) {
  if (!/\.txt$/i.test(salida)) salida += '.txt';
  fs.writeFileSync(salida, EL.aTexto(r.bytes) + '\n', 'utf8');
} else fs.writeFileSync(salida, r.bytes);

// Comprobar lo escrito leyéndolo como lo leerá quien lo cargue: si no se
// puede leer, mejor saberlo aquí que en la otra máquina.
try {
  const vuelta = fs.readFileSync(salida);
  if (r.paquete) P.leer(vuelta); else EL.deserializar(texto ? vuelta.toString('utf8') : vuelta);
} catch (e) {
  console.log('se escribió pero no se puede volver a leer: ' + (e.formato ? e.formato() : e.message));
  process.exit(1);
}
const tam = fs.statSync(salida).size.toLocaleString('es');
if (r.paquete) {
  console.log(`listo: ${salida} · paquete con el principal y ${r.modulos.length} módulo(s) · ${tam} bytes`);
  for (const k of r.modulos) console.log('  + ' + k);
} else console.log(`listo: ${salida} · .elb de un archivo · ${tam} bytes`);
