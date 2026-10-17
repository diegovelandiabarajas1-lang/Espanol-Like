// Una aplicación de Ñ, desde la línea de órdenes.
//
//   node motor/util/construir-app.js ejemplos/ventas.esl
//   node motor/util/construir-app.js ejemplos/ventas.esl "Panel de ventas" panel.html
//
// Sale UN archivo .html con el motor, el anfitrión y el programa dentro: sin
// editor, sin zona aislada y sin nada que instalar. Se abre con doble clic.
//
// El IDE ya hacía esto con el botón «⤓ Exportar app», y sigue haciéndolo igual
// —es la misma plantilla y el mismo ensamblado—. Esto existe porque una
// aplicación de escritorio no se construye a mano cada vez: se construye desde
// un script, junto al resto, y así se puede volver a hacer sin abrir nada.
//
// La zona aislada NO va dentro, y es a propósito: existe para proteger al editor
// del programa que se está editando, y aquí no hay editor que proteger —el
// programa ES la aplicación—, así que corre directo y gana un origen de verdad,
// con su propio localStorage.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../rutas.js');
require(R.bundle);
const { crearMotor } = globalThis.EspanolLike;

const args = process.argv.slice(2);
if (!args.length) {
  console.log('uso: node motor/util/construir-app.js programa.esl ["Título"] [salida.html]');
  process.exit(2);
}
const ruta = args[0];
let fuente;
try { fuente = fs.readFileSync(ruta, 'utf8'); }
catch (e) { console.log('no se pudo abrir ' + ruta); process.exit(2); }

// Se comprueba ANTES de entregar: exportar algo que no compila sería regalar un
// archivo roto. Es la misma razón por la que el botón del IDE tampoco exporta un
// programa con errores.
{
  const a = crearMotor({ salida: () => {}, host: {} }).analizar(fuente, path.resolve(ruta));
  if (!a.ok) {
    console.log('el programa no compila, así que no hay aplicación:');
    for (const e of a.errores) console.log('  ' + (e.formato ? e.formato() : e.msg || e.message));
    process.exit(1);
  }
  for (const v of a.avisos || []) console.log('  aviso: ' + (v.msg || v.message));
}

// Un programa que importa archivos no se puede empaquetar: sus «usar» se
// resuelven en el disco al ejecutar, y dentro de la aplicación no hay disco. Los
// eDSL del motor sí viajan, porque van dentro del motor.
if (/^\s*usar\s+[^\n]*["'][^"']*\.(esl|ñ)["']/m.test(fuente)) {
  console.log('este programa importa archivos con «usar … de "…​.esl"», y eso no entra en una');
  console.log('aplicación: los módulos se resuelven en el disco al ejecutar. Junta los archivos');
  console.log('en uno, o córrelo con n-node.js / el binario, que sí tienen disco.');
  process.exit(1);
}

const titulo = (args[1] || path.basename(ruta).replace(/\.[^.]+$/, '') || 'Aplicación en Ñ')
  .slice(0, 120);
const destino = args[2] || path.join(path.dirname(path.resolve(ruta)),
  path.basename(ruta).replace(/\.[^.]+$/, '') + '.html');

const plantilla = fs.readFileSync(R.ide('app.html'), 'utf8');
const bundle = fs.readFileSync(R.bundle, 'utf8');
const anfitrion = fs.readFileSync(R.ide('anfitrion.js'), 'utf8');

// Un cierre de script de más parte el documento por la mitad sin que el
// navegador se queje: el resto pasa a ser texto y la aplicación no corre. Por
// eso el programa viaja en base64 y el motor se revisa antes.
for (const [n, t] of [['motor', bundle], ['anfitrión', anfitrion]])
  if (t.includes('</script')) throw new Error(`el ${n} contiene «</script» y rompería la aplicación`);
for (const m of ['__TITULO__', '/*__MOTOR__*/', '/*__ANFITRION__*/', '__PROGRAMA__'])
  if (!plantilla.includes(m)) throw new Error('falta el marcador ' + m + ' en ide/app.html');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let html = plantilla
  .replace('__TITULO__', () => esc(titulo))
  .replace('/*__MOTOR__*/', () => bundle)
  .replace('/*__ANFITRION__*/', () => anfitrion)
  .replace('__PROGRAMA__', () => Buffer.from(fuente, 'utf8').toString('base64'));

fs.writeFileSync(destino, html);
console.log(`${path.relative(process.cwd(), destino)} · ${(html.length / 1024).toFixed(0)} KB · «${titulo}»`);
console.log('un solo archivo · ábrelo con doble clic · guarda en su propio localStorage');
