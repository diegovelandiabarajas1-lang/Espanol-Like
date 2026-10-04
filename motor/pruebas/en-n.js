// ============================================================================
//  Las suites escritas EN Ñ.
//
//  Hasta ahora todas las pruebas del lenguaje estaban en JavaScript, así que
//  cada eDSL nuevo costaba sus cincuenta bloques de prueba en otro idioma. Con
//  el eDSL «probar» eso cambia: estas suites son programas de Ñ que usan el
//  propio lenguaje para comprobarse, y este archivo solo las lanza y mira el
//  resumen que imprimen.
//
//  El reparto: lo que hay que comprobar desde dentro del motor —el registro de
//  globales, las firmas, cómo resuelve «usar»— se queda en pruebas/edsl.js, en
//  JavaScript. Lo que es comportamiento del lenguaje se escribe en Ñ.
// ============================================================================
const fs = require('fs');
const path = require('path');
const R = require('./../rutas.js');
require(R.bundle);
const { crearMotor } = globalThis.EspanolLike;

const dir = path.join(__dirname, 'en-n');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.esl')).sort();

let pasan = 0, fallan = 0, saltadas = 0, roto = 0;
for (const f of archivos) {
  const ruta = path.join(dir, f);
  const fuente = fs.readFileSync(ruta, 'utf8');
  const salida = [];
  // Mismo anfitrión que el intérprete de consola, para que una suite pueda
  // probar también lo de archivos y sistema cuando llegue el momento.
  const m = crearMotor({ salida: s => salida.push(String(s)), limiteInstr: 2e8 });
  const r = m.ejecutar(fuente, ruta);
  if (!r.ok) {
    roto++;
    console.log(`  ✗ ${f} no llegó a correr`);
    for (const e of r.errores) console.log('      ' + (e.formato ? e.formato() : e.message));
    continue;
  }
  // La suite imprime su propio resumen; aquí solo se lee el recuento.
  const texto = salida.join('\n');
  const m2 = texto.match(/(\d+) pasan, (\d+) fallan(?:, (\d+) saltadas)?/);
  if (!m2) { roto++; console.log(`  ✗ ${f} no imprimió un resumen que se pueda leer`); continue; }
  const p = +m2[1], mal = +m2[2], s = +(m2[3] || 0);
  pasan += p; fallan += mal; saltadas += s;
  console.log(`  ${mal ? '✗' : '✓'} ${f.padEnd(14)} ${p} pasan, ${mal} fallan` + (s ? `, ${s} saltadas` : ''));
  if (mal) for (const l of texto.split('\n').filter(l => l.includes('✗'))) console.log('      ' + l.trim());
}

console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? `, ${saltadas} saltadas` : '') +
  ` · en ${archivos.length} suites escritas en Ñ\n`);
process.exit(fallan || roto ? 1 : 0);
