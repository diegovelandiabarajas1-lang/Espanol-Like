// Lee resultados\*.txt (varias corridas por lenguaje), toma el mejor tiempo de cada
// prueba, comprueba que todos calcularon lo mismo y escribe una tabla.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'resultados');
const ORDEN = ['C', 'C++', 'Rust', 'Julia', 'JavaScript', 'N', 'Python'];
const NOMBRE = { N: 'Ñ (JIT)' };
const datos = {}, valores = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
  const lang = f.slice(0, -4);
  for (const linea of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^(\S+) = (\S+) en (\d+) ms/);
    if (!m) continue;
    const [, prueba, valor, ms] = m;
    (datos[lang] ??= {})[prueba] = Math.min(datos[lang][prueba] ?? Infinity, +ms);
    (valores[prueba] ??= new Set()).add(valor);
  }
}
const pruebas = Object.keys(valores);
const langs = ORDEN.filter(l => datos[l]).concat(Object.keys(datos).filter(l => !ORDEN.includes(l)));
if (!langs.length) { console.log('no hay resultados'); process.exit(1); }
const ref = langs.find(l => l === 'C') || langs[0];
const ancho = Math.max(...langs.map(l => (NOMBRE[l] || l).length), 8);
let salida = `| ${'lenguaje'.padEnd(ancho)} | ${pruebas.map(p => p.padStart(26)).join(' | ')} |\n`;
salida += `|${'-'.repeat(ancho + 2)}|${pruebas.map(() => '-'.repeat(28)).join('|')}|\n`;
for (const l of langs) {
  const celdas = pruebas.map(p => {
    const ms = datos[l][p];
    if (ms === undefined) return '—'.padStart(26);
    const base = datos[ref][p];
    const rel = base ? ` (×${(ms / base).toFixed(ms / base < 10 ? 1 : 0)} de ${ref})` : '';
    return `${ms} ms${rel}`.padStart(26);
  });
  salida += `| ${(NOMBRE[l] || l).padEnd(ancho)} | ${celdas.join(' | ')} |\n`;
}
console.log(salida);
const malas = pruebas.filter(p => valores[p].size > 1);
if (malas.length) console.log('OJO: no todos dieron el mismo resultado en', malas.join(', '), '→', malas.map(p => [...valores[p]].join(' / ')).join(' ; '));
else console.log('Todos los lenguajes calcularon los mismos resultados:', pruebas.map(p => `${p} = ${[...valores[p]][0]}`).join(', '));
fs.writeFileSync(path.join(dir, 'tabla.md'), salida);
