// Empaquetar un programa de varios archivos como un ejecutable y abrirlo: el
// ejecutable corre sin el proyecto, resuelve sus módulos desde dentro, trabaja en
// su propia carpeta, recibe argumentos limpios, y en modo ventana escribe el
// registro en vez de la consola. Tarda (copia node, ~120 MB) y necesita
// postject; si no está, la suite se salta en vez de bajarlo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');

let pasan = 0, fallan = 0;
const comprobar = (n, ok, det) => { if (ok) { pasan++; console.log('  ✓ ' + n); } else { fallan++; console.log('  ✗ ' + n + (det !== undefined ? '\n      → ' + det : '')); } };

if (!fs.existsSync(path.join(R.proyecto, 'node_modules', 'postject'))) {
  console.log('  – sin postject (npm install postject): saltada entera');
  console.log('0 pasan, 0 fallan · saltada entera');
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n-prueba-empaquetar-'));
const app = path.join(tmp, 'app');
fs.mkdirSync(path.join(app, 'lib'), { recursive: true });
fs.writeFileSync(path.join(app, 'lib', 'mates.esl'), 'publico fn cuadrado(x: entero): entero { devolver x * x }\n');
fs.writeFileSync(path.join(app, 'cuentas.esl'),
  'usar "lib/mates.esl" como m\n' +
  'imprimir("cuadrado {m.cuadrado(9)} · args {argumentos()}")\n' +
  'escribirTexto("huella.txt", "aquí")\n' +
  'si longitud(argumentos()) > 0 y argumentos()[0] == "falla" { fijo l = [1]\n  imprimir(l[3]) }\n');
const dist = path.join(tmp, 'dist');

console.log('\n── programa de consola');
let r = spawnSync(process.execPath, [R.util('empaquetar.js'), path.join(app, 'cuentas.esl'), dist], { encoding: 'utf8' });
comprobar('empaqueta sin errores', r.status === 0 && /listo:/.test(r.stdout), r.stdout + r.stderr);
const exe = path.join(dist, 'cuentas' + (process.platform === 'win32' ? '.exe' : ''));
comprobar('el ejecutable existe y es grande (lleva Node dentro)', fs.existsSync(exe) && fs.statSync(exe).size > 20e6);
// desde OTRA carpeta, sin el proyecto a la vista
r = spawnSync(exe, ['a', 'b'], { cwd: os.tmpdir(), encoding: 'utf8' });
comprobar('corre desde otra carpeta y resuelve el módulo desde dentro', r.status === 0 && /cuadrado 81/.test(r.stdout), r.stdout + r.stderr);
comprobar('los argumentos llegan limpios (sin el ejecutable)', /args \["a", "b"\]/.test(r.stdout), r.stdout);
comprobar('trabaja en su propia carpeta: el archivo queda junto al ejecutable', fs.existsSync(path.join(dist, 'huella.txt')));
r = spawnSync(exe, ['falla'], { cwd: os.tmpdir(), encoding: 'utf8' });
comprobar('un error de ejecución sale con código 1 y mensaje de Ñ', r.status === 1 && /fuera de rango/.test(r.stdout + r.stderr), r.stdout + r.stderr);

console.log('\n── app de ventana (registro en vez de consola)');
const dist2 = path.join(tmp, 'dist2');
r = spawnSync(process.execPath, [R.util('empaquetar.js'), '--ventana', path.join(app, 'cuentas.esl'), dist2], { encoding: 'utf8' });
comprobar('empaqueta con --ventana', r.status === 0, r.stdout + r.stderr);
const exe2 = path.join(dist2, 'cuentas' + (process.platform === 'win32' ? '.exe' : ''));
r = spawnSync(exe2, [], { cwd: os.tmpdir(), encoding: 'utf8' });
comprobar('no escribe en la consola', r.stdout.trim() === '', r.stdout);
const log = path.join(dist2, 'cuentas.log');
comprobar('lo impreso queda en <nombre>.log junto al ejecutable', fs.existsSync(log) && /cuadrado 81/.test(fs.readFileSync(log, 'utf8')));
if (process.platform === 'win32') {
  const b = fs.readFileSync(exe2);
  const pe = b.readUInt32LE(0x3c);
  comprobar('el .exe está marcado como aplicación de ventana (subsistema 2)', b.readUInt16LE(pe + 24 + 68) === 2, b.readUInt16LE(pe + 24 + 68));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pasan} pasan, ${fallan} fallan · empaquetar`);
process.exit(fallan ? 1 : 0);
