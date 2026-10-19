// comparar/tfjs.js — las seis pruebas con TensorFlow.js en Node (CPU).
//   npm install @tensorflow/tfjs-node && node tfjs.js [chica]
// TensorFlow.js trabaja en float32: no tiene float64 (la huella sale con ~1e-4).
// @tensorflow/tfjs-node usa la biblioteca de C de TensorFlow en la CPU. Su
// versión para GPU (tfjs-node-gpu) pide CUDA 11.x y cuDNN 8, que Kaggle ya no
// tiene (CUDA 12), así que aquí se mide la CPU.
'use strict';
let tf, backend;
try { tf = require('@tensorflow/tfjs-node'); backend = 'tfjs-node'; }
catch (e) { tf = require('@tensorflow/tfjs'); backend = 'tfjs (JavaScript puro)'; }
const chica = process.argv[2] === 'chica';
const ns = chica ? [128, 256] : [1024, 2048];
const nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024, nf = chica ? 16384 : 1048576;

function medir(prueba, tam, f, h) {
  let r = f();
  for (let k = 0, mejor = Infinity; k <= 3; k++) {
    if (k === 3) { console.log(`RES,${prueba},${tam},cpu,${mejor},${h(r)},f32`); break; }
    tf.dispose(r);
    const t0 = process.hrtime.bigint();
    r = f();
    // tfjs-node calcula al llamar a la operación; dataSync no hace falta para
    // esperar, y copiaría el resultado (los demás tampoco lo copian)
    const t = Number(process.hrtime.bigint() - t0) / 1e6;
    if (t < mejor) mejor = t;
  }
  tf.dispose(r);
}
const sumaDe = r => tf.tidy(() => tf.sum(r).dataSync()[0]);

for (const n of ns) {
  const A = tf.tidy(() => { const i = tf.range(0, n, 1, 'int32').reshape([n, 1]), j = tf.range(0, n, 1, 'int32').reshape([1, n]);
    return tf.mod(tf.add(tf.mul(i, 7), tf.mul(j, 3)), 13).toFloat().div(13).sub(0.5); });
  const B = tf.tidy(() => { const i = tf.range(0, n, 1, 'int32').reshape([n, 1]), j = tf.range(0, n, 1, 'int32').reshape([1, n]);
    return tf.mod(tf.add(tf.mul(i, 5), tf.mul(j, 11)), 17).toFloat().div(17).sub(0.5); });
  medir('matmul', String(n), () => tf.matMul(A, B), sumaDe);
  tf.dispose([A, B]);
}
const x = tf.tidy(() => tf.mod(tf.range(0, nv, 1, 'int32'), 1000).toFloat().div(1000));
medir('seno', String(nv), () => tf.sin(x), sumaDe);
medir('x*2+1', String(nv), () => tf.tidy(() => x.mul(2).add(1)), sumaDe);
medir('suma', String(nv), () => tf.sum(x), r => r.dataSync()[0]);
const S = tf.tidy(() => { const i = tf.range(0, sm, 1, 'int32').reshape([sm, 1]), j = tf.range(0, sk, 1, 'int32').reshape([1, sk]);
  return tf.mod(tf.add(tf.mul(i, 3), j), 50).toFloat().div(10); });
medir('softmax', `${sm}x${sk}`, () => tf.softmax(S), r => tf.tidy(() => tf.sum(tf.mul(r, r)).dataSync()[0]));
const xf = tf.tidy(() => tf.complex(tf.mod(tf.range(0, nf, 1, 'int32'), 1000).toFloat().div(1000), tf.zeros([nf])));
medir('fft', String(nf), () => tf.spectral.fft(xf), r => tf.tidy(() => tf.sum(tf.abs(r)).dataSync()[0]));
console.log(`# backend ${backend} · ${tf.getBackend()}`);
