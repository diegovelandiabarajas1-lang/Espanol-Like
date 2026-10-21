// Compara el motor LTS, el clon experimental y JavaScript en las tres pruebas
// de velocidad/bench.esl. Cada prueba corre en su PROPIO proceso y se queda el
// mejor de 5: corriendo las tres seguidas, la basura que deja la criba se
// recoge durante el mandelbrot y lo hace parecer más lento de lo que es.
//   node motor/util/banco.js
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const R = require('../rutas.js');
const vel = f => path.join(R.proyecto, 'velocidad', f);
const base = fs.readFileSync(vel('bench.esl'), 'utf8').split('\nmedir(')[0];
const js = fs.readFileSync(vel('bench.js'), 'utf8').split('\nmedir(')[0];
const PR = {
  'fib(30)': ['medir("fib(30)", funcion() { devolver fib(30) })', 'fib(30)'],
  'criba(2000000)': ['medir("criba(2000000)", funcion() { devolver criba(2000000) })', 'criba(2000000)'],
  'mandelbrot': ['medir("mandelbrot(400x300x200)", funcion() { devolver mandelbrot(400, 300, 200) })', 'mandelbrot(400,300,200)'],
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-'));
const filas = [];
for (const [nombre, [n, j]] of Object.entries(PR)) {
  const fe = path.join(tmp, 'b.esl'), fj = path.join(tmp, 'b.js');
  fs.writeFileSync(fe, base + '\n' + n + '\n');
  fs.writeFileSync(fj, js + `\nconst t=performance.now(); ${j}; console.log('x en '+Math.round(performance.now()-t)+' ms')\n`);
  const fila = { prueba: nombre };
  for (const [quien, args] of [
    ['LTS', [path.join(R.proyecto, 'motor', 'util', 'n-node.js'), fe]],
    ['exp', [path.join(R.motor, 'util', 'n-node.js'), fe]],
    ['JS', [fj]]]) {
    let m = Infinity;
    for (let i = 0; i < 5; i++) m = Math.min(m, +execFileSync(process.execPath, args, { encoding: 'utf8' }).match(/en (\d+) ms/)[1]);
    fila[quien] = m;
  }
  filas.push(fila);
}
console.log('| prueba | LTS | exp | JS | exp/JS |\n|---|---|---|---|---|');
for (const f of filas) console.log(`| ${f.prueba} | ${f.LTS} ms | ${f.exp} ms | ${f.JS} ms | ${(f.exp / f.JS).toFixed(1)}× |`);
