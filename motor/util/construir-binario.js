// El motor de Ñ como un ejecutable de verdad.
//
//   node motor/util/construir-binario.js
//
// Hasta ahora el motor siempre necesitaba algo debajo: un navegador, Node o el
// intérprete qjs. Eso es porque está escrito en JavaScript, no porque tenga
// nada que ver con HTML. QuickJS trae «qjsc», que compila JavaScript a bytecode
// y lo enlaza con su propia máquina virtual en C: el resultado es un binario
// nativo de ~1,3 MB que ejecuta .esl y no necesita nada instalado.
//
// Se arma un solo archivo —el motor + el intérprete de línea de órdenes— y se
// le pasa a qjsc. El motor entra tal cual, sin tocar: es el mismo bundle.js que
// corre en el navegador y en Node.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const R = require('../rutas.js');

const hayQjsc = spawnSync('qjsc', ['-h'], { encoding: 'utf8' }).status !== null;
if (!hayQjsc) {
  console.log('falta «qjsc», que viene con QuickJS.');
  console.log('  Linux:   apt install quickjs        (o compílalo de bellard.org/quickjs)');
  console.log('  Windows: los binarios de quickjs-ng traen qjsc.exe');
  process.exit(2);
}

const bundle = fs.readFileSync(R.bundle, 'utf8');
// El CLI, sin el «require» de Node: aquí no hay Node.
let cli = fs.readFileSync(R.util('n.js'), 'utf8');
// Fuera las dos líneas que cargan el bundle desde disco: ahora va incrustado.
cli = cli.replace(/^const aqui = .*$/m, '')
         .replace(/^globalThis\.eval\(std\.loadFile.*$/m, '');
// Los import van arriba del todo en un módulo; el resto, después.
const imports = (cli.match(/^import .*$/gm) || []).join('\n');
cli = cli.replace(/^import .*$/gm, '');

const salida = path.join(R.motor, 'n-completo.js');
fs.writeFileSync(salida, `${imports}\n\n/* ── el motor ── */\n${bundle}\n/* ── el intérprete ── */\n${cli}\n`, 'utf8');

const destino = path.join(R.proyecto, process.platform === 'win32' ? 'n.exe' : 'n');
try {
  execFileSync('qjsc', ['-o', destino, salida], { stdio: 'inherit' });
} catch (e) {
  console.log('qjsc falló:', e.message);
  process.exit(1);
}
fs.unlinkSync(salida);
const tam = fs.statSync(destino).size;
console.log(`${path.basename(destino)}  ${(tam / 1024 / 1024).toFixed(2)} MB  ·  ejecuta .esl sin nada instalado`);
