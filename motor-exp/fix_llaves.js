const fs = require('fs');
let c = fs.readFileSync('app/mega-web.esl', 'utf8');
const lineas = c.split('\n');
const cambios = [];
for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // Buscar "si ... entonces" al final de línea (sin { después)
    // Solo si no tiene "entonces {" y no tiene "sino si"
    if (/entonces\s*$/.test(l) && !/entonces\s*\{/.test(l) && !/sino si/.test(l)) {
        lineas[i] = l.replace(/entonces\s*$/, 'entonces {');
        cambios.push(i + 1);
    }
    // Si la siguiente línea empieza con "sino" y la actual no termina en {, agregar {
    if (/entonces\s*$/.test(l) && lineas[i+1] && /^\s*sino\b/.test(lineas[i+1])) {
        lineas[i] = l.replace(/entonces\s*$/, 'entonces {');
        cambios.push(i + 1);
    }
}
// Ahora necesitamos cerrar los bloques que abrimos: encontrar las líneas "sino" o el final del bloque si
// Estrategia simple: después de cada "si ... entonces {", buscar el siguiente "sino" o línea que no esté indentada como contenido
// Esto es complejo; haremos un segundo pase para agregar "}" antes de "sino" y antes del siguiente "si"/"fn"/etc al mismo nivel
fs.writeFileSync('app/mega-web.esl', lineas.join('\n'));
console.log('Líneas abiertas con {: ' + cambios.join(', '));
