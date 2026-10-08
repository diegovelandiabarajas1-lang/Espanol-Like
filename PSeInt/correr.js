#!/usr/bin/env node
// Corre un programa escrito en la notación de PSeInt con el motor de Ñ.
//
//   node PSeInt/correr.js programa.psc                 traduce y corre
//   node PSeInt/correr.js programa.psc --ver           enseña la traducción a Ñ, línea a línea, y no corre
//   node PSeInt/correr.js programa.psc --guardar       además escribe programa.esl al lado
//   node PSeInt/correr.js programa.psc --entrada "Ana;30"   lo que «Leer» va a leer, separado por «;»
//
// Sin «--entrada», «Leer» lee de la entrada estándar, como PSeInt lee del
// teclado. Los errores —del front-end, del verificador de tipos o de la VM—
// apuntan a la línea del programa original, porque la traducción conserva la
// numeración.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../motor/rutas.js');
require(R.bundle);
const { crearMotor } = globalThis.EspanolLike;
const { traducir, ErrorPSeInt } = require('./pseint.js');

const args = process.argv.slice(2);
const ruta = args.find(a => !a.startsWith('--'));
if (!ruta) {
  console.log('uso: node PSeInt/correr.js programa.psc [--ver] [--guardar] [--entrada "a;b;c"]');
  process.exit(2);
}
const VER = args.includes('--ver');
const GUARDAR = args.includes('--guardar');
const iEnt = args.indexOf('--entrada');
const entradas = iEnt >= 0 ? String(args[iEnt + 1] || '').split(';') : null;

const fuente = fs.readFileSync(ruta, 'utf8');

// Los nombres de Ñ: una variable de PSeInt que choque se renombra, y se avisa.
const reservadas = (() => {
  const m = crearMotor({ salida: () => {}, host: {} });
  return new Set([...m.vm.globals.keys()].filter(k => k.indexOf('\u0000') < 0 && !k.startsWith(' ')));
})();

let r;
try { r = traducir(fuente, { reservadas }); }
catch (e) {
  if (e instanceof ErrorPSeInt) {
    console.error(`[pseudocódigo] línea ${e.linea}:${e.col} — ${e.message}`);
    const l = fuente.split(/\r?\n/)[e.linea - 1];
    if (l !== undefined) { console.error('   ' + l); console.error('   ' + ' '.repeat(Math.max(0, e.col - 1)) + '^'); }
    process.exit(1);
  }
  throw e;
}
for (const a of r.avisos) console.error('aviso: ' + a);

if (GUARDAR) {
  const destino = ruta.replace(/\.[^.]+$/, '') + '.esl';
  fs.writeFileSync(destino, r.texto);
  console.error('escrito ' + destino);
}
if (VER) {
  const orig = fuente.split(/\r?\n/), trad = r.texto.split('\n');
  const ancho = Math.max(...orig.map(l => l.length), 20);
  for (let i = 0; i < orig.length; i++) {
    console.log(String(i + 1).padStart(3) + '  ' + orig[i].padEnd(ancho) + '  │  ' + (trad[i] || ''));
  }
  process.exit(0);
}

// La entrada: la de «--entrada», o la estándar entera, servida por líneas.
let cola = entradas;
if (!cola) {
  let todo = '';
  try { if (!process.stdin.isTTY) todo = fs.readFileSync(0, 'utf8'); } catch (_) { todo = ''; }
  cola = todo.length ? todo.replace(/\r/g, '').split('\n') : [];
  if (cola.length && cola[cola.length - 1] === '') cola.pop();
}

const m = crearMotor({
  salida: s => console.log(String(s)),
  host: {
    sistema: {
      leerLinea: () => (cola.length ? String(cola.shift()) : null),
      argumentos: () => [],
      entorno: () => null,
      salir: c => process.exit(c || 0),
    },
  },
  limiteInstr: 5e8,
});
const res = m.ejecutar(r.texto, path.basename(ruta));
if (!res.ok) {
  for (const e of res.errores) console.error(e.formato ? e.formato() : e.message);
  process.exit(1);
}
