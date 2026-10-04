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
const bundle =
`;(function(global){
'use strict';
${out}
global.EspanolLike = { crearMotor, lexer, parser, compilar, verificarTipos, desensamblar, VM,
  repr, tipoDe, T, tipoATexto, ObjLista, ObjDic, ObjCierre, ObjNativa, ObjNodo, ObjEstilo, OP, OP_NOMBRE, generarJS,
  tiposGlobales, ErrorFuente, firma, textoATipo, aridadDe, instalarEdsl, instalarClasico,
  serializar, deserializar, verificarBytecode: verificar, aTexto, deTexto, ErrorBytecode,
  Modulos, enlazar, exportacionesDe, SEP_MODULO, nombreGlobalModulo, CLAVE_EDSL, claveEdsl,
  version: '4.0' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(R.bundle, bundle);
console.log('bundle.js', bundle.length, 'bytes');
