// El perfil C1EÑ: el mismo motor con numerico y nen ABIERTOS en el ámbito
// global. Lo que se fija aquí:
//   1. en el bundle de C1EÑ, «derivar» o «einstein» funcionan sin «usar»;
//   2. en el bundle de Ñ, el mismo programa se rechaza con la pista de siempre;
//   3. un programa con «usar … de "nen"» corre igual en los dos;
//   4. los dos bundles son el mismo código salvo la constante del perfil;
//   5. abrir un eDSL que tapara un nombre del núcleo es un error al construir,
//      no un silencio.
const fs = require('fs');
const R = require('../rutas.js');
let pasan = 0, fallan = 0;
const ok = (n, c, det) => { if (c) pasan++; else { fallan++; console.log('  ✗ ' + n + (det ? ' — ' + det : '')); } };

const SIN_USAR = `
imprimir(derivarFormula("x^2", "x"))
imprimir(integrar(funcion(x) { devolver 2 * x }, 0, 3))
imprimir(raiz(16), einstein("ii->", arreglo([[1, 0], [0, 2]], "real")))`;
const CON_USAR = `usar derivarFormula de "nen"\nusar raiz de "numerico"\nimprimir(derivarFormula("x^2", "x"), raiz(16))`;

function correr(bundle, src) {
  // Cada bundle se carga en un global limpio: los dos definen EspanolLike.
  delete globalThis.EspanolLike;
  delete require.cache[require.resolve(bundle)];
  require(bundle);
  const E = globalThis.EspanolLike;
  const out = [];
  const r = E.crearMotor({ salida: s => out.push(String(s)) }).ejecutar(src);
  return { E, out: out.join('\n'), errores: (r.errores || []).map(e => e.formato ? e.formato() : e.message) };
}

// 1 y 2
const a = correr(R.bundleC1en, SIN_USAR);
ok('C1EÑ: el perfil se llama así', a.E.perfil === 'C1EÑ' && a.E.abiertos.join() === 'numerico,nen', a.E.perfil);
ok('C1EÑ: sin «usar» corre', a.errores.length === 0, a.errores[0]);
ok('C1EÑ: y da lo esperado', a.out === '2x\n9\n4 3', JSON.stringify(a.out));
const b = correr(R.bundle, SIN_USAR);
ok('Ñ: el perfil se llama así', b.E.perfil === 'Ñ' && b.E.abiertos.length === 0);
ok('Ñ: el mismo programa se rechaza', b.errores.length > 0);
ok('Ñ: y la pista dice de qué eDSL es', /usar derivarFormula de "nen"/.test(b.errores.join('\n')), b.errores[0]);
// 3
const c = correr(R.bundleC1en, CON_USAR), d = correr(R.bundle, CON_USAR);
ok('con «usar» corre en los dos y da lo mismo', c.errores.length === 0 && d.errores.length === 0 && c.out === d.out, c.errores[0] || d.errores[0]);
// un nombre abierto es el MISMO objeto que el del eDSL, no una copia
{
  const vm = a.E.crearMotor({}).vm;
  const corto = vm.globals.get('derivar'), largo = vm.globals.get(a.E.nombreGlobalModulo(a.E.claveEdsl('nen'), 'derivar'));
  ok('el nombre abierto es el mismo objeto que el del eDSL', corto === largo && !!corto);
  ok('el verificador lo ve como global con firma', !!vm.tiposGlobales().derivar);
}
// 4
{
  const t1 = fs.readFileSync(R.bundle, 'utf8'), t2 = fs.readFileSync(R.bundleC1en, 'utf8');
  const sinCab = t2.replace(/^const C1EN_ABIERTOS = \[.*?\];\n/m, '');
  ok('los dos bundles son el mismo código salvo la constante del perfil', sinCab === t1, (t2.length - t1.length) + ' bytes de diferencia');
}
// 5
{
  const E = a.E;
  let msg = '';
  try { E.crearMotor({ host: { abiertos: ['texto'] } }); } catch (e) { msg = e.message; }
  // numerico y texto comparten nombres («recortar», «entre»): abrirlos juntos
  // tiene que fallar nombrando al nombre y a los dos eDSL, sea cual sea el
  // primero que choque.
  let msg2 = '';
  try { E.crearMotor({ host: { abiertos: ['numerico', 'texto'] } }); } catch (e) { msg2 = e.message; }
  ok('abrir dos eDSL con un nombre en común es un error que lo nombra', /al abrir «texto»: «\w+» ya lo trae abierto «numerico»/.test(msg2), msg2);
  let msg3 = '';
  try { E.crearMotor({ host: { abiertos: ['noexiste'] } }); } catch (e) { msg3 = e.message; }
  ok('abrir un eDSL que no existe es un error claro', /no existe/.test(msg3), msg3);
  ok('abrir «texto» solo, sin choque con el núcleo, funciona', msg === '' , msg);
}
console.log(`\n${pasan} pasan, ${fallan} fallan`);
process.exit(fallan ? 1 : 0);
