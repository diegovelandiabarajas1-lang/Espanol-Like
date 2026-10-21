// motor-exp P6 · n-web.js: el motor, el anfitrión de la página y el cargador de
// <script type="text/ñ">, en UN archivo para enlazar desde cualquier página:
//
//   <script src="https://cdn.jsdelivr.net/gh/diegovelandiabarajas1-lang/Espanol-Like@motor-exp/motor-exp/n-web.js"></script>
//   <script type="text/ñ" src="app.esl"></script>
//
// Lo llama util/construir.js al final, así que n-web.js siempre va con el motor
// del mismo commit. Ver web/cargador.js.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../rutas.js');
const salida = path.join(R.motor, 'n-web.js');
const partes = [
  `/* n-web.js — Ñ en cualquier página web (motor-exp ${new Date().toISOString().slice(0, 10)}).\n` +
  ` * Generado por motor-exp/util/construir-web.js: el motor (bundle.js), el anfitrión de la página\n` +
  ` * (ide/anfitrion.js) y el cargador de <script type="text/ñ"> (web/cargador.js). No editar a mano. */\n`,
  fs.readFileSync(R.bundle, 'utf8'),
  ';\n',
  fs.readFileSync(R.ide('anfitrion.js'), 'utf8').replace(/^'use strict';\s*$/m, ''),
  ';\n',
  fs.readFileSync(path.join(R.motor, 'web', 'cargador.js'), 'utf8'),
];
fs.writeFileSync(salida, partes.join(''));
console.log('n-web.js', fs.statSync(salida).size, 'bytes');
