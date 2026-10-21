// Todas las rutas del motor de C1EÑ salen de aquí, resueltas desde la posición
// de este archivo. Así cualquier script se puede ejecutar desde donde sea y la
// carpeta entera se puede mover sin tocar nada.
const path = require('path');

const motor = __dirname;                       // …/motor
const proyecto = path.resolve(motor, '..');    // la carpeta del proyecto

module.exports = {
  motor, proyecto,
  src: f => path.join(motor, 'src', f),
  ide: f => path.join(motor, 'ide', f),
  util: f => path.join(motor, 'util', f),
  pruebas: f => path.join(motor, 'pruebas', f),
  bundle: path.join(motor, 'bundle.js'),
  bundleC1en: path.join(motor, 'bundle-c1en.js'),  // el mismo motor con numerico y nen abiertos
  // MOTOR DE C1EÑ (rama c1en: aquí el motor es la carpeta motor/). Lo que
  // CONSTRUYE —el IDE, la referencia, el contexto— va a motor/salida/. Copia
  // estable de motor-exp/ (rama motor-exp); recibe lo nuevo cuando Diego lo dice.
  // Lo que LEE de fuera (ejemplos/, PSeInt/, la DLL de raylib) lo busca en la
  // raíz del proyecto; en esta rama no hay nada ahí: esas suites se saltan o fallan.
  salida: f => path.join(motor, 'salida', f),
  entrega: f => /\.(html|txt)$/.test(f) ? path.join(motor, 'salida', f) : path.join(proyecto, f),
  FUENTES: ['01-front.js', '02-check-compile.js', '03-vm-jit.js', '04-stdlib.js', '05-serial.js', '06-modulos.js',
    '07-edsl-formato.js', '08-edsl-fecha.js', '09-edsl-probar.js', '10-edsl-texto.js', '11-edsl-numerico.js', '12-edsl-datos.js', '13-edsl-estilo.js',
    '14-c1en.js', '15-nen-calculo.js', '16-nen-formulas.js', '17-nen-tensores.js', '18-nen-precision.js', '19-nen-amplitud.js'],
};
