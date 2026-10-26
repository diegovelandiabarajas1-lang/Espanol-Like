const fs = require('fs');
let html = fs.readFileSync('app/mega-app.html', 'utf8');
const esl = fs.readFileSync('app/mega-web.esl', 'utf8');
const inicio = html.indexOf('<script type="text/ñ">');
const fin = html.indexOf('</script>', inicio);
if (inicio < 0 || fin < 0) { console.log('No se encontraron las etiquetas script'); process.exit(1); }
const antes = html.substring(0, inicio + '<script type="text/ñ">'.length);
const despues = html.substring(fin);
fs.writeFileSync('app/mega-app.html', antes + '\n' + esl + '\n' + despues);
console.log('HTML sincronizado');
