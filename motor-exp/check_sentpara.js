const fs = require('fs');
const b = fs.readFileSync('bundle.js', 'utf8');
// Buscar sentPara
const idx = b.indexOf('sentPara');
console.log('sentPara encontrado en:', idx);
if (idx >= 0) {
  console.log(b.substring(idx, idx + 600));
}
