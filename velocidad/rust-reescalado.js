// rust-reescalado.js — Rust no está en WSL: se toma la relación Rust/C de la corrida de Windows (resultados-22) y se aplica al C medido en WSL
// (resultados-22-final). La columna sale marcada como reescalada en el informe; no es una medición hecha en WSL.
const fs = require('fs'), path = require('path');
const mejor = f => {
  const m = {};
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const r = l.match(/^(\S+) = (\S+) en (\d+) ms/);
    if (r) m[r[1]] = { v: r[2], ms: Math.min(m[r[1]] ? m[r[1]].ms : Infinity, +r[3]) };
  }
  return m;
};
const dirW = path.join(__dirname, 'resultados-22'), dirF = path.join(__dirname, 'resultados-22-final');
const rW = mejor(path.join(dirW, 'Rust.txt')), cW = mejor(path.join(dirW, 'C.txt')), cF = mejor(path.join(dirF, 'C.txt'));
let out = '';
for (const p of Object.keys(cF)) {
  if (!rW[p] || !cW[p]) continue;
  out += `${p} = ${rW[p].v} en ${Math.max(1, Math.round(rW[p].ms / Math.max(1, cW[p].ms) * cF[p].ms))} ms\n`;
}
fs.writeFileSync(path.join(dirF, 'Rust.txt'), out);
console.log('Rust reescalado:', out.split('\n').filter(Boolean).length, 'benchmarks');
