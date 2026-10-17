function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
function criba(n) {
  const marca = []; for (let i = 0; i <= n; i++) marca.push(true);
  marca[0] = false; marca[1] = false;
  let i = 2;
  while (i * i <= n) { if (marca[i]) { let j = i * i; while (j <= n) { marca[j] = false; j += i; } } i++; }
  let c = 0; for (let k = 0; k <= n; k++) if (marca[k]) c++;
  return c;
}
function mandelbrot(ancho, alto, maxIter) {
  let dentro = 0;
  for (let py = 0; py < alto; py++) for (let px = 0; px < ancho; px++) {
    const cr = (px / ancho) * 3.5 - 2.5, ci = (py / alto) * 2.0 - 1.0;
    let zr = 0, zi = 0, k = 0;
    while (k < maxIter && zr * zr + zi * zi <= 4.0) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; k++; }
    if (k === maxIter) dentro++;
  }
  return dentro;
}
function medir(nombre, f) { const t0 = performance.now(); const r = f(); console.log(nombre, '=', r, 'en', Math.round(performance.now() - t0), 'ms'); }
medir('fib(30)', () => fib(30));
medir('criba(2000000)', () => criba(2000000));
medir('mandelbrot(400x300x200)', () => mandelbrot(400, 300, 200));
