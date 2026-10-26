const fs = require('fs');
const c = fs.readFileSync('app/mega-web.esl', 'utf8');
// En los valores de diccionario de estilo, faltaba "si " antes de " entonces "
let f = c.replace(/"\w+": (\w+) entonces/g, '"$1": si $1 entonces');
fs.writeFileSync('app/mega-web.esl', f);
console.log('Reemplazos hechos');
console.log(f.split('\n').filter(l => / entonces /.test(l) && !/ si \w+ entonces/.test(l)).map(l => '  ' + l.trim()));
