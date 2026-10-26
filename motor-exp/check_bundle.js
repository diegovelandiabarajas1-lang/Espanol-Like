const fs = require('fs');
const b = fs.readFileSync('bundle.js', 'utf8');
console.log('en EN:', b.includes("'en': 'EN'"));
console.log('para PARA:', b.includes("'para': 'PARA'"));
console.log('tiene PALABRAS:', b.includes('PALABRAS'));
