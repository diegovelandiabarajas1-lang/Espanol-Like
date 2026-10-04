// Pasa todas las suites en orden y resume. Devuelve código 1 si algo falla,
// para que sirva igual a mano que dentro de otro script.
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['motor',       'motor.js',        'el lenguaje, la máquina, el recolector y el JIT'],
  ['excepciones', 'excepciones.js',  'intentar / capturar / finalmente / lanzar'],
  ['web',         'web.js',          'el árbol de nodos de la página'],
  ['estilos',     'estilos.js',      'el tipo estilo: anidamiento, medios y clases locales'],
  ['interacción', 'interaccion.js',  'eventos, identidad, memoria y temporizadores'],
  ['serial',      'serial.js',       'el formato .elb y su verificación'],
  ['fuera',       'fuera.js',        'archivos, procesos y entrada, en Node y en QuickJS'],
  ['nativo',      'nativo.js',       'llamar a código compilado desde Ñ'],
  ['módulos',     'modulos.js',      'usar, publico, ámbito por archivo, ciclos y rutas'],
  ['eDSL',        'edsl.js',         'el mecanismo de los eDSL nativos, desde dentro'],
  ['en Ñ',        'en-n.js',         'las suites escritas en Ñ, con el eDSL probar'],
  ['aislado',     'aislado.js',      'el IDE entero en un navegador de verdad'],
  ['ejemplos',    'ejemplos-ide.js', 'los ejemplos del selector, uno por uno'],
  ['apps',        'apps.js',         'los programas de ejemplos/, con anfitrión completo'],
];

let fallan = 0, saltadas = 0;
const t0 = Date.now();
for (const [nombre, archivo, que] of SUITES) {
  process.stdout.write(`── ${nombre.padEnd(12)} ${que}\n`);
  try {
    const salida = execFileSync(process.execPath, [path.join(__dirname, archivo)], { encoding: 'utf8' });
    const ultima = salida.trim().split('\n').filter(l => l.trim()).pop() || '';
    // Una suite saltada entera sale con 0 igual que una que pasa, pero no es lo
    // mismo y marcarla con ✓ miente: no se probó nada.
    saltadas += /saltada entera/.test(ultima) ? 1 : 0;
    console.log(`   ${/saltada entera/.test(ultima) ? '–' : '✓'} ` + ultima.trim());
  } catch (e) {
    fallan++;
    const texto = ((e.stdout || '') + (e.stderr || '')).trim().split('\n');
    console.log('   ✗ FALLA');
    // Las líneas que de verdad importan son las que llevan ✗, no las últimas
    // doce: con un volcado de pila al final, la cola es el volcado y los fallos
    // quedan fuera de la pantalla. Pasó: una suite con cinco fallos enseñaba
    // dos, y los otros tres no se sabía ni cuáles eran.
    const marcados = texto.filter(l => l.includes('✗'));
    const resumen = texto.filter(l => /\d+ (pasan|de \d+)/.test(l)).slice(-1);
    const mostrar = marcados.length ? marcados.slice(0, 15).concat(resumen) : texto.slice(-12);
    for (const l of mostrar) console.log('     ' + l.trim());
    if (marcados.length > 15) console.log(`     … y ${marcados.length - 15} más`);
  }
}
console.log(`\n${SUITES.length - fallan - saltadas} de ${SUITES.length - saltadas} suites en verde` +
  (saltadas ? ` · ${saltadas} saltada${saltadas > 1 ? 's' : ''} por falta de herramientas, no por fallos` : '') +
  ` · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
process.exit(fallan ? 1 : 0);
