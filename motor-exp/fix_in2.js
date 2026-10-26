const fs = require('fs');
const c = fs.readFileSync('app/mega-web.esl', 'utf8');
const lineas = c.split('\n');
for (let i = 0; i < lineas.length; i++) {
    if (/\bpara\s+\w+\s+in\b/.test(lineas[i])) {
        lineas[i] = lineas[i].replace(/\bin\b(?=\s+\w)/, 'en');
    }
}
fs.writeFileSync('app/mega-web.esl', lineas.join('\n'));
console.log('Hecho');
// Verificar
for (let i = 0; i < lineas.length; i++) {
    if (/\bpara\s+\w+\s+in\b/.test(lineas[i])) {
        console.log('QUEDA línea ' + (i+1) + ': ' + lineas[i].trim());
    }
}
console.log('Verificación completa');
