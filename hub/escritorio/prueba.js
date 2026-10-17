// Prueba del ARCADE Ñ de escritorio: abre la ventana DE VERDAD (raylib) y la
// maneja con un guion de teclas, cuadro a cuadro (N_GUION, ver lib/pantalla.esl).
//
//   node hub/escritorio/prueba.js
//
// Necesita raylib junto a arcade.esl (raylib.dll en Windows, libraylib.so en
// Linux) o la ruta en N_RAYLIB. Sin raylib se salta. En Windows se ve la ventana
// unos segundos: es el juego jugándose solo. En Linux sin pantalla: Xvfb.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const aqui = __dirname;
const raiz = path.resolve(aqui, '..', '..');
const nNode = path.join(raiz, 'motor', 'util', 'n-node.js');
const lib = process.platform === 'win32' ? 'raylib.dll' : 'libraylib.so';

let pasan = 0, fallan = 0;
const comprobar = (n, ok, det) => {
  if (ok) { pasan++; console.log('  ✓ ' + n); }
  else { fallan++; console.log('  ✗ ' + n + (det !== undefined ? '\n      → ' + String(det).slice(0, 600) : '')); }
};

if (!process.env.N_RAYLIB && !fs.existsSync(path.join(aqui, lib))) {
  console.log(`  – sin ${lib} en hub/escritorio (ni N_RAYLIB): saltada entera`);
  console.log('0 pasan, 0 fallan · escritorio (saltada)');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-n-'));
function correr(guion, records) {
  const g = path.join(tmp, 'guion.txt');
  fs.writeFileSync(g, guion, 'utf8');
  const datos = path.join(tmp, 'records.json');
  if (records === null) { try { fs.unlinkSync(datos); } catch (_) {} }
  else fs.writeFileSync(datos, records, 'utf8');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [nNode, path.join(aqui, 'arcade.esl')], {
    cwd: aqui, encoding: 'utf8', timeout: 240000,
    env: Object.assign({}, process.env, { N_GUION: g, N_ARCADE_DATOS: datos }),
  });
  const leidos = fs.existsSync(datos) ? fs.readFileSync(datos, 'utf8') : '';
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), records: leidos, seg: (Date.now() - t0) / 1000 };
}

// ── 1. una sesión entera: menú → Galaga → menú → Flappy → menú → Galaga hasta perder
console.log('\n── una sesión entera con el guion');
const GUION = [
  '3 captura prueba-menu.png',
  '5 pulsa abajo', '10 pulsa enter',                 // Galaga
  '20 pulsa espacio', '21 baja espacio',             // empieza y dispara sin parar
  '300 pulsa esc',                                    // al menú
  '305 pulsa arriba', '308 pulsa enter',             // Flappy
  '312 pulsa espacio',                                // empieza y no aletea más: cae
  '420 pulsa esc',
  '425 pulsa abajo', '430 pulsa enter',              // Galaga otra vez
  '435 pulsa espacio', '436 baja espacio',
  '4400 pulsa esc',                                   // en 4000 cuadros quieto pierde
  '4405 fin',
].join('\n');
const a = correr(GUION, '{"flappy.mejor": 9}');
const out = a.out;
console.log(`  (${a.seg.toFixed(1)} s)`);
comprobar('el arcade abre, juega y se cierra solo (código 0)', a.status === 0, out);
comprobar('entra en Galaga desde el menú (↓ y Enter)', /arcade: entra en galaga/.test(out), out);
const res = /galaga: estado jugando · ola (\d+) · puntos (\d+) · vidas (\d+) · enem (\d+) · part (\d+) · dibujos (\d+) · ms ([\d.]+)/.exec(out);
comprobar('Galaga juega: dispara y suma puntos', res && Number(res[2]) > 0, out);
comprobar('Galaga dibuja cientos de figuras por cuadro', res && Number(res[6]) > 500, res && res[6]);
if (res) console.log(`      (Ñ + raylib: ${res[7]} ms por cuadro con ${res[6]} figuras)`);
comprobar('Esc vuelve al menú desde Galaga', /vuelve al menú desde galaga/.test(out), out);
comprobar('entra en Flappy y, sin aletear, cae (0 puntos)', /entra en flappy[\s\S]*flappy: fin · puntos 0/.test(out), out);
comprobar('Esc vuelve al menú desde Flappy', /vuelve al menú desde flappy/.test(out), out);
const fin = /galaga: fin · estado fin · ola \d+ · puntos (\d+) · vidas 0/.exec(out);
comprobar('Galaga se pierde al quedarse sin vidas', !!fin, out);
let rec = {};
try { rec = JSON.parse(a.records); } catch (_) {}
comprobar('el récord de Galaga queda en el archivo', fin && rec['galaga.mejor'] === Number(fin[1]), a.records);
comprobar('el récord que ya estaba (Flappy 9) no se pisa con un 0', rec['flappy.mejor'] === 9, a.records);
const cap = path.join(aqui, 'prueba-menu.png');
comprobar('la captura del menú existe y tiene dibujo', fs.existsSync(cap) && fs.statSync(cap).size > 5000,
  fs.existsSync(cap) ? fs.statSync(cap).size + ' bytes' : 'no está');
try { fs.renameSync(cap, path.join(tmp, 'prueba-menu.png')); } catch (_) {}

// ── 2. un archivo de récords roto no tumba el arcade
console.log('\n── récords rotos');
const b = correr('5 fin', '{esto no es json');
comprobar('arranca igual y lo dice en el registro', b.status === 0 && /empiezo de cero/.test(b.out), b.out);

// ── 3. sin archivo de récords: empieza de cero, sin errores
const c = correr('5 fin', null);
comprobar('sin récords previos también arranca', c.status === 0 && /cerrado tras/.test(c.out), c.out);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pasan} pasan, ${fallan} fallan · escritorio`);
process.exit(fallan ? 1 : 0);
