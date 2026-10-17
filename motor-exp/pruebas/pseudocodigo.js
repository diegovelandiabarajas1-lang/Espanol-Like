// El modo pseudocódigo —la notación de PSeInt corriendo en el motor de Ñ— vive
// en PSeInt/ y tiene sus pruebas allí, porque es un front-end aparte y no toca
// la gramática de Ñ. Esto solo lo mete en la batería con el contrato de las
// demás suites: corre sin argumentos y su última línea es el resumen.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../rutas.js');

try {
  const salida = execFileSync(process.execPath, [R.entrega('PSeInt/pruebas.js')], { encoding: 'utf8' });
  process.stdout.write(salida);
  process.exit(0);
} catch (e) {
  process.stdout.write((e.stdout || '') + (e.stderr || ''));
  process.exit(1);
}
