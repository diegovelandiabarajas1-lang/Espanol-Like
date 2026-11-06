// comparar22.js — lee resultados-22/*.txt (varias corridas por lenguaje), toma el MEJOR tiempo de cada benchmark, comprueba que todos
// los lenguajes calcularon lo mismo y escribe la tabla (22 filas × lenguajes) con la media geométrica de cada uno frente a C.
//   node comparar22.js [carpeta]      (por defecto resultados-22)
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, 'resultados-22'));
const ORDEN = ['C', 'C++', 'Rust', 'JavaScript', 'N-AOT', 'N-AOT-SC', 'N', 'Python'];
const NOMBRE = { N: 'Ñ JIT', 'N-AOT': 'Ñ AOT', 'N-AOT-SC': 'Ñ AOT sin comprobar' };
const datos = {}, valores = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt') && !f.startsWith('tabla'))) {
  const lang = f.slice(0, -4);
  for (const linea of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^(\S+) = (\S+) en (\d+) ms/);
    if (!m) continue;
    const [, prueba, valor, ms] = m;
    (datos[lang] ??= {})[prueba] = Math.min(datos[lang][prueba] ?? Infinity, +ms);
    ((valores[prueba] ??= {})[valor] ??= new Set()).add(lang);
  }
}
const pruebas = Object.keys(valores);
const langs = ORDEN.filter(l => datos[l]).concat(Object.keys(datos).filter(l => !ORDEN.includes(l)));
const nom = l => NOMBRE[l] || l;
const ref = langs.includes('C') ? 'C' : langs[0];
const celda = (l, p) => { const v = datos[l] && datos[l][p]; if (v === undefined) return '—'; const r = datos[ref][p]; return r > 0 ? `${v} ms (×${(v / r).toFixed(1)})` : `${v} ms`; };
let out = `| benchmark | ${langs.map(nom).join(' | ')} |\n|---|${langs.map(() => '---').join('|')}|\n`;
for (const p of pruebas) out += `| ${p} | ${langs.map(l => celda(l, p)).join(' | ')} |\n`;
// media geométrica de (tiempo / tiempo de C), con un suelo de 1 ms para no dividir por 0
const gm = l => { const xs = pruebas.filter(p => datos[l][p] !== undefined && datos[ref][p] !== undefined).map(p => Math.max(1, datos[l][p]) / Math.max(1, datos[ref][p])); return xs.length ? Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length) : NaN; };
out += `| **media geométrica frente a ${nom(ref)}** | ${langs.map(l => `**×${gm(l).toFixed(2)}**`).join(' | ')} |\n`;
// victorias: en cuántos benchmarks es el más rápido (empates a menos de un 3 % cuentan como empate)
const gana = {}; for (const l of langs) gana[l] = 0;
for (const p of pruebas) { const t = langs.filter(l => datos[l][p] !== undefined).map(l => [l, datos[l][p]]).sort((a, b) => a[1] - b[1]); if (t.length) gana[t[0][0]]++; }
out += `\nMás rápido en: ${langs.map(l => `${nom(l)} ${gana[l]}`).join(' · ')}\n`;
// ¿calcularon lo mismo?
const malos = pruebas.filter(p => Object.keys(valores[p]).length > 1);
out += malos.length ? `\n⚠ NO calcularon lo mismo: ${malos.map(p => `${p} → ` + Object.entries(valores[p]).map(([v, ls]) => `${v} (${[...ls].map(nom).join(', ')})`).join(' | ')).join('\n  ')}\n` : `\nTodos los lenguajes calcularon lo mismo en los ${pruebas.length} benchmarks.\n`;
console.log(out);
fs.writeFileSync(path.join(dir, 'tabla22.md'), out);
