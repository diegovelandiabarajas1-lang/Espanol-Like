const fs = require('fs');
let c = fs.readFileSync('app/mega-web.esl', 'utf8');

// Corregir posiciones con tilde y valores incorrectos
c = c.replace(/posición/g, 'posicion');
c = c.replace(/"fijo"/g, '"fijado"');
c = c.replace(/zIndice/g, 'capa');
c = c.replace(/máximoAncho/g, 'anchoMax');

fs.writeFileSync('app/mega-web.esl', c);
console.log('Correcciones aplicadas');

// Verificar que no queden
if (/posición/.test(c)) console.log('ADVERTENCIA: quedan "posición"');
if (/"fijo"/.test(c)) console.log('ADVERTENCIA: quedan "fijo" como valor');
if (/zIndice/.test(c)) console.log('ADVERTENCIA: quedan "zIndice"');
if (/máximoAncho/.test(c)) console.log('ADVERTENCIA: quedan "máximoAncho"');
console.log('Verificación completa');
