require('./bundle.js');
const { crearMotor } = globalThis.EspanolLike;
const casos = {
  'fib(30) recursivo': `fn fib(n) { si n < 2 { devolver n }  devolver fib(n-1) + fib(n-2) }\nimprimir(fib(30))`,
  'bucle 20M sumas':   `fn total(n) { var t = 0  var i = 0  mientras i < n { t = t + i  i = i + 1 }  devolver t }\nimprimir(total(20000000))`,
  'criba hasta 200k':  `fn primos(n) {
  var c = 0  var i = 2
  mientras i < n {
    var p = cierto  var d = 2
    mientras d * d <= i { si i % d == 0 { p = falso  romper }  d = d + 1 }
    si p { c = c + 1 }
    i = i + 1
  }
  devolver c
}
imprimir(primos(200000))`,
  'mandelbrot 300x200': `fn mandel(w, h, iter) {
  var dentro = 0
  para py en rango(h) {
    var y0 = (py / h) * 2.0 - 1.0
    para px en rango(w) {
      var x0 = (px / w) * 3.0 - 2.0
      var x = 0.0  var y = 0.0  var i = 0
      mientras x*x + y*y <= 4.0 { si i >= iter { romper }  var xt = x*x - y*y + x0  y = 2.0*x*y + y0  x = xt  i = i + 1 }
      si i >= iter { dentro = dentro + 1 }
    }
  }
  devolver dentro
}
imprimir(mandel(300, 200, 100))`,
};
console.log('caso'.padEnd(22), 'intérprete'.padStart(12), 'JIT'.padStart(10), 'mejora'.padStart(9), '  resultado');
console.log('─'.repeat(70));
for (const [nom, src] of Object.entries(casos)) {
  const run = (jit) => {
    const out = [];
    const m = crearMotor({ salida: s => out.push(s), limiteInstr: 1e10, jit, umbralJIT: 2 });
    const r = m.ejecutar(src);
    if (!r.ok) { console.log('ERROR', r.errores.map(e => e.formato ? e.formato() : e.message).join('|')); process.exit(1); }
    return { ms: r.ms, out: out.join(''), st: r.stats };
  };
  const b = run(false), a = run(true);
  if (a.out !== b.out) { console.log(`✗ ${nom}: DISCREPANCIA jit=${a.out} int=${b.out}`); continue; }
  console.log(nom.padEnd(22), (b.ms.toFixed(0)+' ms').padStart(12), (a.ms.toFixed(0)+' ms').padStart(10),
    ('×'+(b.ms/Math.max(a.ms,0.01)).toFixed(1)).padStart(9), '  ' + a.out);
}
