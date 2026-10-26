const fs = require('fs');
const archivos = ['mega-web.esl', 'mega-app.html'];
for (const arch of archivos) {
  let c = fs.readFileSync('app/' + arch, 'utf8');
  const lineas = c.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    // reemplazar ' in ' por ' en ' solo en líneas que contienen 'para ... in '
    if (/\bpara\s+\w+\s+in\b/.test(lineas[i])) {
      lineas[i] = lineas[i].replace(/\bin\b(?=\s+\w)/, 'en');
    }
  }
  fs.writeFileSync('app/' + arch, lineas.join('\n'));
  console.log(arch + ' procesado');
}

// Verificar
for (const arch of archivos) {
  const c = fs.readFileSync('app/' + arch, 'utf8');
  const lineas = c.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (/\bpara\s+\w+\s+in\b/.test(lineas[i])) {
      console.log('  QUEDA en ' + arch + ' línea ' + (i+1) + ': ' + lineas[i].trim());
    }
  }
}
console.log('Verificación completa');
