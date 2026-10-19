const fs = require('fs');
const R = require('../rutas.js');
const partes = R.FUENTES;
let out = '';
for (const p of partes) {
  let s = fs.readFileSync(R.src(p), 'utf8');
  s = s.replace(/^'use strict';\s*$/m, '');
  s = s.replace(/^\s*const \{[^}]*\} = MODULO_FRONT;\s*$/gm, '');
  s = s.replace(/\nif \(typeof module !== 'undefined'\) module\.exports = \{[\s\S]*?\};\s*$/m, '\n');
  out += s + '\n';
}
// Dos perfiles del MISMO motor, de las mismas fuentes:
//   bundle.js       Ñ — los eDSL se traen con «usar», como siempre
//   bundle-c1en.js  C1EÑ — numerico y nen ya abiertos en el ámbito global, sin «usar».
//                   Para quien hace matemáticas: «derivar», «einstein» o «paralelo»
//                   están ahí como «imprimir». Lo decide una sola constante al
//                   principio del archivo; el código es idéntico byte a byte.
function armar(abiertos, nombre) {
  const cabecera = abiertos
    ? `const C1EN_ABIERTOS = ${JSON.stringify(abiertos)};\n`
    : '';
  return `;(function(global){
'use strict';
${cabecera}${out}`;
}
const pie = `
global.EspanolLike = { crearMotor, lexer, parser, compilar, verificarTipos, desensamblar, VM,
  repr, tipoDe, T, tipoATexto, ObjLista, ObjDic, ObjCierre, ObjNativa, ObjNodo, ObjEstilo, OP, OP_NOMBRE, generarJS,
  tiposGlobales, ErrorFuente, firma, textoATipo, aridadDe, instalarEdsl, instalarClasico,
  serializar, deserializar, verificarBytecode: verificar, aTexto, deTexto, ErrorBytecode,
  Modulos, enlazar, exportacionesDe, SEP_MODULO, nombreGlobalModulo, CLAVE_EDSL, claveEdsl,
  version: '4.1', perfil: typeof C1EN_ABIERTOS !== 'undefined' ? 'C1EÑ' : 'Ñ',
  abiertos: typeof C1EN_ABIERTOS !== 'undefined' ? C1EN_ABIERTOS : [] };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
const bundle = armar(null, 'Ñ') + pie;
fs.writeFileSync(R.bundle, bundle);
console.log('bundle.js', bundle.length, 'bytes');
const bundleC1en = armar(['numerico', 'nen'], 'C1EÑ') + pie;
fs.writeFileSync(R.bundleC1en, bundleC1en);
console.log('bundle-c1en.js', bundleC1en.length, 'bytes');
