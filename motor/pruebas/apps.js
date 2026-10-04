// Los programas de «ejemplos/», corridos de verdad con un anfitrión completo
// de mentira.
//
// Estaban fuera de la batería y había que acordarse de lanzarlos a mano, que es
// lo mismo que no tenerlos: un ejemplo roto no se nota hasta que alguien lo
// copia. Esto es un envoltorio de util/correr-ejemplos.js —la carpeta es lo
// único que hay que darle— para que entre en pruebas/todas.js con el mismo
// contrato que las demás: corre sin argumentos y su última línea es el resumen.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../rutas.js');

const corredor = path.join(__dirname, '..', 'util', 'correr-ejemplos.js');
const carpeta = R.entrega('ejemplos');

try {
  const salida = execFileSync(process.execPath, [corredor, carpeta], { encoding: 'utf8' });
  process.stdout.write(salida);
  process.exit(0);
} catch (e) {
  process.stdout.write((e.stdout || '') + (e.stderr || ''));
  process.exit(1);
}
