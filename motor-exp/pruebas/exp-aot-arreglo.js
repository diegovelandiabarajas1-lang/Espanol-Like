// exp-aot-arreglo.js — el tipo «arreglo» (numerico) en el ejecutable nativo (aot/nrt_arreglo.inc), comparado con la VM caso por caso.
// Cada programa se corre en la VM (n-node.js) y como ejecutable, y tiene que imprimir lo mismo y salir con el mismo código.
// Se salta sin compilador de C.   node motor-exp/pruebas/exp-aot-arreglo.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const N_COMP = path.join(RAIZ, 'util', 'n-compilar.js'), N_NODE = path.join(RAIZ, 'util', 'n-node.js');
const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-arr-')));
{
  fs.writeFileSync(path.join(raiz, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [N_COMP, path.join(raiz, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && spawnSync('gcc', ['--version']).status !== 0 && !process.env.C1EN_CC) { console.log('  (sin compilador de C)\nexp-aot-arreglo: saltada entera'); process.exit(0); }
}
let pasan = 0, fallan = 0, n = 0;
const fallos = [];
const limpia = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n').replace(/\n$/, '');
function igual(nombre, src) {
  const d = path.join(raiz, 'w' + n++); fs.mkdirSync(d);
  const f = path.join(d, 'p.esl'), exe = path.join(d, 'p.exe');
  fs.writeFileSync(f, src);
  const c = spawnSync(process.execPath, [N_COMP, f, '-o', exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (c.status !== 0) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${((c.stdout || '') + (c.stderr || '')).trim().split('\n').slice(0, 3).join(' | ')}`); return; }
  const a = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const b = spawnSync(exe, [], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const sa = limpia(a.stdout || ''), sb = limpia(b.stdout || '');
  if (sa !== sb || a.status !== b.status) { fallan++; fallos.push(`✗ ${nombre}\n    VM:      ${JSON.stringify(sa).slice(0, 1500)} (${a.status})\n    nativo:  ${JSON.stringify(sb).slice(0, 1500)} (${b.status})`); return; }
  pasan++;
}
const U = 'usar "numerico"\n';

igual('arreglo: de listas, tipos y forma', U + `fijo a = arreglo([1, 2, 3])
fijo b = arreglo([[1, 2.5], [3, 4]])
fijo c = arreglo([1, 2, 3], "real")
fijo d = arreglo([1, 0, 1], "bool")
fijo e = arreglo([[[1, 2], [3, 4]], [[5, 6], [7, 8]]])
imprimir(a, b, c, d, e)
imprimir(forma(a), forma(b), forma(e), dimensiones(e), tamano(e), tipoArreglo(a), tipoArreglo(b), tipoArreglo(d), esVista(a))
imprimir(arreglo([]), forma(arreglo([])), tamano(arreglo([])), arreglo([[]]), tipoArreglo(arreglo([])))
imprimir(arreglo([3e200, 1]), arreglo([2147483647, 1]), arreglo([2147483648, 1]), arreglo([-0.0, 1]))`);
igual('arreglo: errores', U + `fijo q = [3, "a"][0]
intentar { arreglo([1, [2]]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { arreglo([[1, 2], [3]]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { arreglo([1, "x"]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { arreglo(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { arreglo([1], "raro") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { arreglo([1], "complejo") } capturar (e) { imprimir(e["mensaje"]) }
intentar { arreglo([1], q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('ceros, unos, lleno, secuencia, reparto, vacio', U + `imprimir(ceros(3), ceros([2, 3]), unos(4, "entero"), unos([2, 2]), lleno(3, 7), lleno([2, 2], 1.5), lleno(2, 0.1, "real32"), lleno(3, 5, "u8"))
imprimir(secuencia(5), secuencia(2, 10), secuencia(0, 1, 0.25), secuencia(10, 0, -3), secuencia(3, 3), secuencia(0, 1, 0.1))
imprimir(reparto(0, 1, 5), reparto(0, 1), reparto(2, 5, 1), reparto(-1, 1, 3), tipoArreglo(reparto(0, 1, 2)))
imprimir(forma(vacio([2, 3])), tipoArreglo(vacio(2, "i16")), ceros(0), ceros([0, 3]))
fijo q = [3, "a"][0]
intentar { ceros(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ceros([2, -1]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ceros([]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ceros([1, 1, 1, 1, 1, 1, 1, 1, 1]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { secuencia(0, 1, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { reparto(0, 1, 0) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { lleno(2, q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('azarArreglo con semilla', U + `semilla(42)
imprimir(azarArreglo(5), azarArreglo([2, 2]))
semilla(7)
fijo a = azarArreglo(3)
semilla(7)
imprimir(a == azarArreglo(3))`);

// ── aritmética
igual('aritmética: arreglo con número y con arreglo', U + `fijo a = arreglo([1, 2, 3, 4])
fijo b = arreglo([10, 20, 30, 40])
imprimir(a + b, a - b, a * b, b / a, b // a, b % a, a ** 2, 2 ** a)
imprimir(a + 1, 1 + a, a - 1, 10 - a, a * 2.5, 2 * a, a / 2, 8 / a, a // 2, 9 // a, a % 3, 10 % a, -a)
fijo r = arreglo([1.5, 2.5, -3.5])
imprimir(r + a[0], r * 2, r ** 2, r // 1, r % 2, -r, r / 4)`);
igual('aritmética: difusión', U + `fijo m = arreglo([[1, 2, 3], [4, 5, 6]])
fijo f = arreglo([10, 20, 30])
fijo c = arreglo([[100], [200]])
imprimir(m + f, m * f, m + c, c + f, f + c, m - m, forma(c + f))
imprimir(arreglo([[1], [2], [3]]) * arreglo([[1, 2, 3]]))
fijo cu = arreglo([[[1, 2]], [[3, 4]]])
imprimir(cu + arreglo([10, 20]), forma(cu + m))`);
igual('aritmética: tipos del resultado', U + `fijo e = arreglo([1, 2, 3])
fijo r = arreglo([1.5, 2.5, 3.5])
fijo b = arreglo([1, 0, 1], "bool")
fijo u = arreglo([200, 100, 50], "u8")
fijo i8 = arreglo([100, -100, 5], "i8")
fijo f32 = arreglo([0.1, 0.2, 0.3], "real32")
fijo f16 = arreglo([0.1, 0.2, 1000], "real16")
imprimir(tipoArreglo(e + e), tipoArreglo(e * e), tipoArreglo(e / e), tipoArreglo(e + r), tipoArreglo(e ** 2), tipoArreglo(e // e), tipoArreglo(e + 1.5))
imprimir(tipoArreglo(b + b), tipoArreglo(b + e), tipoArreglo(b * 2), tipoArreglo(b / 2))
imprimir(u + u, u * 2, u + 100, u - 255, u // 7, u % 7, tipoArreglo(u + u), tipoArreglo(u + i8), tipoArreglo(u + e))
imprimir(i8 + i8, i8 * 2, i8 * i8, i8 // 7, i8 % 7, -i8, tipoArreglo(i8 * 3))
imprimir(f32 + f32, f32 * 3, f32 / 3, tipoArreglo(f32 + e), tipoArreglo(f32 + r), tipoArreglo(f32 * 2.5))
imprimir(f16 + f16, f16 * f16, f16 / 3, tipoArreglo(f16 + f32), f16 * 100)`);
igual('aritmética: enteros de 32 bits (imul, envoltura)', U + `fijo a = arreglo([2147483647, 65536, -5, 3])
imprimir(a + 1, a * 2, a * a, a * 65536, a - a * 2, a // 7, a % 7, a // -2, a % -3)
fijo u = arreglo([4000000000, 5, 3], "u32")
imprimir(u + u, u * u, u * 2, u - 4294967295, u // 3, u % 7, tipoArreglo(u * 2))
fijo c = arreglo([300, 70000], "u16")
imprimir(c * c, c + c, c - 301)`);
igual('aritmética: errores', U + `fijo a = arreglo([1, 2, 3])
fijo z = arreglo([0, 1, 2])
fijo m = arreglo([[1, 2], [3, 4]])
fijo q = [3, "a"][0]
fijo s = ["a", 1][0]
intentar { a / z } capturar (e) { imprimir(e["mensaje"]) }
intentar { a // z } capturar (e) { imprimir(e["mensaje"]) }
intentar { a % z } capturar (e) { imprimir(e["mensaje"]) }
intentar { a / 0 } capturar (e) { imprimir(e["mensaje"]) }
intentar { 1 / z } capturar (e) { imprimir(e["mensaje"]) }
intentar { a + m } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { a + s } capturar (e) { imprimir(e["mensaje"]) }
intentar { s - a } capturar (e) { imprimir(e["mensaje"]) }
intentar { arreglo([1, 2], "u8") + 1.5 } capturar (e) { imprimir(e["mensaje"]) }
intentar { arreglo([1, 2], "i64") } capturar (e) { imprimir(e["mensaje"]) }`);

// ── comparar y lógica
igual('comparaciones y máscaras', U + `fijo a = arreglo([1, 5, 3, 7])
fijo b = arreglo([2, 5, 1, 7])
imprimir(mayorQue(a, b), menorQue(a, b), mayorIgualQue(a, b), menorIgualQue(a, b), igualA(a, b), distintoA(a, b))
imprimir(mayorQue(a, 3), menorQue(3, a), igualA(a, 5), distintoA(a, 5))
fijo m = mayorQue(a, 2)
fijo k = menorQue(a, 6)
imprimir(m, yA(m, k), oA(m, k), noA(m), yA(m, cierto), oA(m, falso), tipoArreglo(m))
imprimir(todos(m), alguno(m), todos(yA(m, noA(m))), alguno(yA(m, noA(m))), contarCiertos(m), contarCiertos(k))
fijo n = arreglo([1.5, 0.0, 2.0])
imprimir(esNaN(n / n), esFinito(arreglo([1, 2]) / arreglo([1, 2])), esNaN(n), esFinito(n))
imprimir(mayorQue(arreglo([[1, 2], [3, 4]]), arreglo([2, 3])), a == a, a == b, a == arreglo([1, 5, 3, 7]), arreglo([1, 2]) == arreglo([1.0, 2.0]))
fijo q = [3, "a"][0]
intentar { mayorQue(a, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { mayorQue(1, 2) } capturar (e) { imprimir(e["mensaje"]) }
intentar { mayorQue(a, arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { yA(q, m) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── vistas, índices y conversión
igual('vistas: redimensionar, transpuesta, fila, copia', U + `fijo a = arreglo([1, 2, 3, 4, 5, 6])
fijo m = redimensionar(a, [2, 3])
imprimir(m, esVista(m), forma(m), esVista(a))
fijo t = transpuesta(m)
imprimir(t, forma(t), esVista(t), tamano(t), t + 1)
imprimir(fila(m, 1), esVista(fila(m, 0)), fila(t, 2), copia(t), esVista(copia(t)))
fijo r = redimensionar(t, [6])
imprimir(r, esVista(r))
fijo m3 = redimensionar(arreglo([1, 2, 3, 4, 5, 6, 7, 8]), [2, 2, 2])
imprimir(m3, fila(m3, 1), fila(fila(m3, 1), 0), transpuesta(m3), forma(transpuesta(m3)))
fijo q = [3, "a"][0]
intentar { redimensionar(a, [4, 2]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { fila(a, 0) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { fila(m, 5) } capturar (e) { imprimir(e["mensaje"]) }
intentar { fila(q, 0) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('índices: a[i], a[i][j], a[i] = v, para x en a', U + `fijo a = arreglo([10, 20, 30, 40])
imprimir(a[0], a[3], a[-1], a[-4], longitud(a))
a[1] = 99
a[-1] = 1.7
imprimir(a, tipoArreglo(a))
fijo m = arreglo([[1, 2, 3], [4, 5, 6]])
imprimir(m[1], m[1][2], m[-1][-1], longitud(m))
m[0][1] = 50
imprimir(m)
var s = 0
para x en a { s = s + x }
imprimir(s)
para fila en m { imprimir(fila) }
fijo b = arreglo([1, 0, 1], "bool")
b[1] = cierto
b[0] = falso
imprimir(b)
fijo q = [3, "a"][0]
intentar { a[4] } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { a[-5] } capturar (e) { imprimir(e["mensaje"]) }
intentar { a[1.5] } capturar (e) { imprimir(e["mensaje"]) }
intentar { a[q] } capturar (e) { imprimir(e["mensaje"]) }
intentar { m[0] = 5 } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { a[0] = q } capturar (e) { imprimir(e["mensaje"]) }
intentar { a[9] = 1 } capturar (e) { imprimir(e["mensaje"]) }
intentar { imprimir(longitud(redimensionar(arreglo([5]), [1])[0])) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('elemento, ponerElemento, aListaA, aTipo', U + `fijo m = arreglo([[1, 2, 3], [4, 5, 6]])
imprimir(elemento(m, 1, 2), elemento(m, 0, 0), aListaA(m), aListaA(arreglo([1.5, 2])), aListaA(transpuesta(m)))
ponerElemento(m, 0, 1, 99)
ponerElemento(m, 1, 1, 0.5)
imprimir(m, tipoArreglo(m))
fijo r = arreglo([1.7, -2.7, 300.5, 70000.9])
imprimir(aTipo(r, "entero"), aTipo(r, "u8"), aTipo(r, "i8"), aTipo(r, "i16"), aTipo(r, "bool"), aTipo(r, "real32"), aTipo(arreglo([1, 2, 3]), "real"))
imprimir(aTipo(arreglo([0.1, 100000.7]), "real16"), aTipo(arreglo([1, 2]), "u32"))
fijo q = [3, "a"][0]
intentar { elemento(m, 5, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { elemento(m, 1) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { ponerElemento(m, 0, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { elemento(m, q, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { aTipo(arreglo([1.0]) / arreglo([0.0]), "u8") } capturar (e) { imprimir(e["mensaje"]) }
intentar { aTipo(m, "raro") } capturar (e) { imprimir(e["mensaje"]) }`);
igual('imprimir arreglos grandes y vacíos', U + `imprimir(secuencia(7), secuencia(8), secuencia(100))
imprimir(redimensionar(secuencia(60), [10, 6]))
imprimir(redimensionar(secuencia(40), [2, 5, 4]))
imprimir(ceros(0), ceros([2, 0]), secuencia(20) / 7, tipo(secuencia(3)), texto(secuencia(3)) + "!", [secuencia(3), 1])
imprimir(arreglo([0.1, 0.25, 1e21, -1e-7, 123456.789]), arreglo([0.1, 0.2], "real32"), arreglo([0.1, 1000.5], "real16"), arreglo([1, 2], "u8"), arreglo([1, 0], "bool"))`);

// ── complejos
igual('complejo: crear y separar', U + `fijo c = complejo(arreglo([1.5, 2, 3]), arreglo([-1, 0, 4.25]))
imprimir(c, tipoArreglo(c), esComplejo(c), esComplejo(arreglo([1])), forma(c))
imprimir(parteReal(c), parteImaginaria(c), conjugado(c), fase(c), absoluto(c))
imprimir(complejo(arreglo([1, 2])), complejo(3), complejo(1, 2), complejo(arreglo([1, 2]), 5), complejo(2, arreglo([1, 2, 3])))
imprimir(parteReal(arreglo([1.5, 2])), parteImaginaria(arreglo([1.5, 2])))
fijo p = desdePolar(arreglo([1, 2, 0.5]), arreglo([0, 1.5707963267948966, 3.141592653589793]))
imprimir(p, redimensionar(complejo(secuencia(6), secuencia(6) * 2), [2, 3]))
fijo q = [3, "a"][0]
intentar { conjugado(arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { fase(arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { complejo(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { complejo(c) } capturar (e) { imprimir(e["mensaje"]) }
intentar { complejo() } capturar (e) { imprimir(e["mensaje"]) }`);
igual('complejo: aritmética y comparación', U + `fijo a = complejo(arreglo([1, 2, 3]), arreglo([1, -1, 0]))
fijo b = complejo(arreglo([2, 0, 1]), arreglo([3, 1, 1]))
imprimir(a + b, a - b, a * b, a / b, a * 2, 2 * a, a + 1, a / 2, 10 / b, -a)
imprimir(a * conjugado(a), igualA(a, a), distintoA(a, b), igualA(a, 1), a == a, a == b)
fijo q = [3, "a"][0]
intentar { a // b } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { a ** 2 } capturar (e) { imprimir(e["mensaje"]) }
intentar { a % b } capturar (e) { imprimir(e["mensaje"]) }
intentar { a / complejo(0, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { mayorQue(a, b) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { a[0] } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { aListaA(a) } capturar (e) { imprimir(e["mensaje"]) }
intentar { seno(a) } capturar (e) { imprimir(e["mensaje"]) }
intentar { suma(a) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── las funciones de números que ya existían, ahora con arreglos
igual('funciones de números sobre arreglos', U + `fijo a = arreglo([0.5, 1, 2.25, 4])
fijo e = arreglo([-3, 0, 4, 9])
imprimir(seno(a), coseno(a), tangente(a), arcoseno(arreglo([0.5, 1])), arcocoseno(arreglo([0.5, 1])), arcotangente(a), exp(a), log(a), log10(a), raiz(a))
imprimir(absoluto(e), piso(a), techo(a), signo(e), tipoArreglo(piso(a)), tipoArreglo(absoluto(e)), tipoArreglo(signo(e)), tipoArreglo(seno(e)))
imprimir(seno(arreglo([0.1, 0.2], "real32")), tipoArreglo(raiz(arreglo([4, 9], "real32"))), piso(arreglo([1.5, 2.5], "real16")), seno(redimensionar(secuencia(6), [2, 3])))
imprimir(seno(transpuesta(redimensionar(secuencia(6), [2, 3]))))
fijo q = [3, "a"][0]
intentar { raiz(e) } capturar (e) { imprimir(e["mensaje"]) }
intentar { log(arreglo([1, 0])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { log10(e) } capturar (e) { imprimir(e["mensaje"]) }
intentar { seno(q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('suma, media y estadística sobre arreglos', U + `fijo a = arreglo([3, 1, 4, 1, 5, 9, 2, 6])
fijo m = redimensionar(a, [2, 4])
imprimir(suma(a), media(a), mediana(a), moda(a), varianza(a), desviacion(a), producto(a), percentil(a, 50), amplitud(a))
imprimir(suma(m), suma(m, 0), suma(m, 1), suma(m, -1), media(m, 0), media(m, 1), tipoArreglo(suma(m, 0)), tipoArreglo(media(m, 0)), suma(a, 0))
imprimir(suma(arreglo([0.5, 0.25])), suma(transpuesta(m)), suma(transpuesta(m), 0), media(arreglo([1, 2, 3, 4]), 0))
imprimir(normalizar(a), histograma(a, 3), correlacion(a, a * 2), regresion(secuencia(5), arreglo([1, 3, 5, 7, 9])))
fijo q = [3, "a"][0]
intentar { suma(m, 2) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { suma(m, -3) } capturar (e) { imprimir(e["mensaje"]) }
intentar { suma(m, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { media(arreglo([])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { varianza(arreglo([1])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { aJson(a) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('un programa corto de datos con arreglos', U + `fn norma(v) { devolver raiz(suma(v * v)) }
fijo xs = reparto(0, 1, 11)
fijo ys = xs * xs * 3 + 2
imprimir(ys)
imprimir(norma(ys), media(ys), suma(mayorQue(ys, 3.5)), contarCiertos(mayorQue(ys, 3.5)))
var acc = ceros(5)
para i en rango(5) { acc[i] = i * i }
imprimir(acc, acc[4], suma(acc), longitud(acc))
fijo m = redimensionar(secuencia(12), [3, 4])
imprimir(suma(m, 0), suma(m, 1), m * m, transpuesta(m) + 1)`);


// ── segunda tanda
igual('por, productoPunto, externo, kronecker, identidadA, diagonal', U + `fijo A = arreglo([[1, 2, 3], [4, 5, 6]])
fijo B = arreglo([[7, 8], [9, 10], [11, 12]])
imprimir(por(A, B), por(B, A), forma(por(A, B)), tipoArreglo(por(A, B)))
imprimir(por(identidadA(3), B), identidadA(2), identidadA(1), tipoArreglo(identidadA(2)))
fijo v = arreglo([1.5, 2, 3.25])
imprimir(productoPunto(v, v), productoPunto(arreglo([1, 2]), arreglo([3, 4])), externo(arreglo([1, 2]), arreglo([3, 4, 5])), kronecker(arreglo([[1, 2], [3, 4]]), identidadA(2)))
imprimir(diagonal(A), diagonal(arreglo([1, 2, 3])), diagonal(arreglo([1.5, 2], "real32")), diagonal(identidadA(3)), triangularSuperior(arreglo([[1, 2, 3], [4, 5, 6], [7, 8, 9]])), triangularInferior(arreglo([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), -1), triangularSuperior(identidadA(3) + 1, 1))
imprimir(esSimetrica(arreglo([[1, 2], [2, 1]])), esSimetrica(A), esSimetrica(arreglo([[1, 2], [2.0000000001, 1]])))
fijo q = [3, "a"][0]
intentar { por(A, A) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { por(v, v) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { productoPunto(v, A) } capturar (e) { imprimir(e["mensaje"]) }
intentar { identidadA(0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { externo(A, v) } capturar (e) { imprimir(e["mensaje"]) }
intentar { diagonal(redimensionar(secuencia(8), [2, 2, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { triangularSuperior(v) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { kronecker(v, A) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('por con matrices reales y bits exactos', U + `semilla(5)
fijo A = azarArreglo([6, 7])
fijo B = azarArreglo([7, 5])
fijo C = por(A, B)
imprimir(C)
imprimir(suma(C), C[2][3], por(A, identidadA(7)) == A, por(transpuesta(B), transpuesta(A)) == transpuesta(C))
fijo G = azarArreglo([40, 40])
fijo H = por(G, G)
imprimir(suma(H), H[7][9], H[39][0])`);
igual('por en precisión simple, media y con enteros', U + `semilla(9)
fijo A = aTipo(azarArreglo([5, 6]), "real32")
fijo B = aTipo(azarArreglo([6, 4]), "real32")
imprimir(por(A, B), tipoArreglo(por(A, B)))
imprimir(por(aTipo(A * 100, "real16"), aTipo(B, "real16")), por(A, arreglo([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]])))
imprimir(por(arreglo([[1, 2], [3, 4]]), arreglo([[5, 6], [7, 8]])), por(arreglo([[1, 0], [0, 1]], "bool"), arreglo([[1.5, 2], [3, 4]])), por(arreglo([[200, 100]], "u8"), arreglo([[3], [4]], "u8")))`);
igual('expandir, apretar, aplanarA, difundirA', U + `fijo v = arreglo([1, 2, 3])
imprimir(expandir(v, 0), expandir(v, 1), expandir(v, -1), forma(expandir(v, 0)), esVista(expandir(v, 1)))
imprimir(apretar(expandir(v, 0)), forma(apretar(redimensionar(v, [1, 3, 1]))), apretar(arreglo([[5]])), forma(apretar(arreglo([[5]]))))
imprimir(aplanarA(arreglo([[1, 2], [3, 4]])), aplanarA(transpuesta(arreglo([[1, 2], [3, 4]]))), esVista(aplanarA(arreglo([[1, 2], [3, 4]]))), esVista(aplanarA(transpuesta(arreglo([[1, 2], [3, 4]])))))
imprimir(difundirA(v, [2, 3]), difundirA(expandir(v, 1), [3, 4]), forma(difundirA(arreglo([7]), [2, 2])), difundirA(v, [2, 3]) + 1)
fijo q = [3, "a"][0]
intentar { expandir(v, 5) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { expandir(v, -5) } capturar (e) { imprimir(e["mensaje"]) }
intentar { expandir(v, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { difundirA(v, [2, 4]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { difundirA(v, [3]) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('donde, enMascara, ponerEnMascara, recortar, maximoDe, minimoDe, aCero', U + `fijo a = arreglo([3, -1, 4, -1, 5, -9])
imprimir(donde(mayorQue(a, 0), a, 0), donde(mayorQue(a, 0), a, -a), donde(menorQue(a, 0), 1.5, 2), donde(mayorQue(a, 0), 1, 0), tipoArreglo(donde(mayorQue(a, 0), a, 0.5)))
imprimir(donde(arreglo([cierto, falso], "bool"), arreglo([[1], [2]]), arreglo([10, 20])), enMascara(a, mayorQue(a, 0)), enMascara(a, menorQue(a, 0)), enMascara(arreglo([1.5, 2.5, 3.5], "real32"), arreglo([1, 0, 1], "bool")))
fijo b = copia(a)
ponerEnMascara(b, menorQue(b, 0), 0)
imprimir(b, a)
ponerEnMascara(b, mayorQue(b, 3), arreglo([100, 200]))
imprimir(b)
imprimir(recortar(a, -2, 4), recortar(arreglo([1.5, 9.5]), 2, 5), tipoArreglo(recortar(arreglo([1, 2], "u8"), 1, 1)), maximoDe(a, 0), minimoDe(a, 0), maximoDe(a, arreglo([0, 1, 2])), minimoDe(a, arreglo([[0], [4]])), tipoArreglo(maximoDe(a, arreglo([0.5]))))
imprimir(aCero(arreglo([1, 0, 0]) / arreglo([1, 0, 0]) * 0), aCero(arreglo([1.5, 2]) / arreglo([0.5, 1])), aCero(arreglo([1, -1, 2]) / 1.0, 7, 99))
fijo q = [3, "a"][0]
intentar { donde(a, q, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { donde(a, 0, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { donde(a, arreglo([1, 2]), 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { enMascara(a, arreglo([1])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ponerEnMascara(a, mayorQue(a, 0), q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { recortar(a, 5, 1) } capturar (e) { imprimir(e["mensaje"]) }
intentar { maximoDe(a, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { maximoDe(a, arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('cuantil, normaVector, estandarizar, mediaMovil, sin NaN', U + `fijo a = arreglo([3, 1, 4, 1, 5, 9, 2, 6])
imprimir(cuantil(a, 0.5), cuantil(a, 0), cuantil(a, 1), cuantil(a, 0.3), cuantil(redimensionar(a, [2, 4]), 0.9))
imprimir(normaVector(a), normaVector(a, 1), normaVector(a, 3), normaVector(a, |INFINITO), normaVector(arreglo([3, 4])))
imprimir(estandarizar(a), estandarizar(arreglo([1.5, 2.5], "real32")))
imprimir(mediaMovil(a, 3), mediaMovil(a, 1), mediaMovil(a, 8), tipoArreglo(mediaMovil(a, 2)))
fijo h = arreglo([1, 2, 3, 4]) / arreglo([1, 0, 1, 1]) * 0 + arreglo([1, 2, 3, 4])
fijo n = arreglo([1.5, 2, 0, 4]) / arreglo([1, 1, 0, 1])
imprimir(sumaSinNaN(n), mediaSinNaN(n), minimoSinNaN(n), maximoSinNaN(n), sumaSinNaN(a), minimoSinNaN(arreglo([0.0, -0.0])), h)
fijo q = [3, "a"][0]
intentar { cuantil(a, 2) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { cuantil(arreglo([]), 0.5) } capturar (e) { imprimir(e["mensaje"]) }
intentar { estandarizar(arreglo([1])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { estandarizar(arreglo([2, 2, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { mediaMovil(a, 0) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { mediaMovil(a, 9) } capturar (e) { imprimir(e["mensaje"]) }
intentar { mediaMovil(redimensionar(a, [2, 4]), 2) } capturar (e) { imprimir(e["mensaje"]) }
intentar { sumaSinNaN(arreglo([1.0]) / arreglo([0.0]) * 0) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('argMaximo, argMinimo, acumulados y diferencias', U + `fijo a = arreglo([3, 1, 4, 1, 5, 9, 2, 6])
fijo m = redimensionar(a, [2, 4])
imprimir(argMaximo(a), argMinimo(a), argMaximo(m), argMaximo(m, 0), argMaximo(m, 1), argMinimo(m, 1), argMinimo(m, -1), tipoArreglo(argMaximo(m, 0)))
imprimir(acumSuma(a), acumProducto(a), acumMaximo(a), acumMinimo(a), acumSuma(m, 0), acumSuma(m, 1), acumMaximo(m, 1), acumProducto(arreglo([1, 0, 1], "bool")), tipoArreglo(acumSuma(arreglo([1, 0, 1], "bool"))))
imprimir(diferencias(a), diferencias(arreglo([5])), diferencias(arreglo([1.5, 4, 2], "real32")), tipoArreglo(diferencias(arreglo([200, 100], "u8"))), diferencias(arreglo([200, 100], "u8")))
fijo q = [3, "a"][0]
intentar { diferencias(m) } capturar (e) { imprimir(e["mensaje"]) }
intentar { acumSuma(m, 2) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { argMaximo(m, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { argMaximo(q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('un programa de tablas numéricas', U + `fn frecuencias(v) {
  fijo ordenado = acumSuma(v)
  devolver ordenado / ordenado[longitud(ordenado) - 1]
}
fijo ventas = arreglo([120, 80, 45, 200, 15, 60])
imprimir(frecuencias(ventas), argMaximo(ventas), donde(mayorQue(ventas, 70), ventas, 0), cuantil(ventas, 0.75), estandarizar(ventas))
fijo M = redimensionar(secuencia(1, 13), [3, 4])
imprimir(por(M, transpuesta(M)), diagonal(por(M, transpuesta(M))), normaVector(M), aplanarA(M) + 0.5)`);


// ── tercera tanda
igual('concatenar, apilar', U + `fijo a = arreglo([[1, 2], [3, 4]])
fijo b = arreglo([[5, 6]])
fijo c = arreglo([[7], [8]])
imprimir(concatenar(a, b), concatenar(a, b, 0), concatenar(a, c, 1), concatenar(arreglo([1, 2]), arreglo([3]), arreglo([4, 5])), concatenar(a, a, -1), tipoArreglo(concatenar(a, arreglo([[0.5, 1]]))))
imprimir(concatenar(arreglo([1, 0], "bool"), arreglo([0], "bool")), tipoArreglo(concatenar(arreglo([1, 0], "bool"), arreglo([1], "bool"))), tipoArreglo(concatenar(arreglo([1, 0], "bool"), arreglo([1, 2]))), tipoArreglo(concatenar(arreglo([1], "u8"), arreglo([300], "i16"))))
imprimir(apilar(arreglo([1, 2]), arreglo([3, 4])), apilar(arreglo([1, 2]), arreglo([3, 4]), 1), apilar(a, a), forma(apilar(a, a, 2)), apilar(a, a, -1), apilar(arreglo([1, 2, 3])), tipoArreglo(apilar(arreglo([1]), arreglo([1.5]))))
fijo q = [3, "a"][0]
intentar { concatenar(a, arreglo([1, 2, 3])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { concatenar(a, c) } capturar (e) { imprimir(e["mensaje"]) }
intentar { concatenar(a, a, 5) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { concatenar() } capturar (e) { imprimir(e["mensaje"]) }
intentar { concatenar(a, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { apilar(a, b) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { apilar(a, a, 9) } capturar (e) { imprimir(e["mensaje"]) }
intentar { apilar() } capturar (e) { imprimir(e["mensaje"]) }`);
igual('trozo, trozoPaso, trozoVarios (vistas)', U + `fijo m = redimensionar(secuencia(24), [4, 6])
imprimir(trozo(m, 0, 1, 3), trozo(m, 1, 2), trozo(m, 1, 0, 2), trozo(m, 0, -2), trozo(m, 0, 1, -1), forma(trozo(m, 0, 3, 1)), trozo(m, -1, 4), esVista(trozo(m, 0, 1)))
imprimir(trozoPaso(m, 1, 2), trozoPaso(m, 0, -1), trozoPaso(m, 1, -2), trozoPaso(m, 0, 3), forma(trozoPaso(m, 1, 4)), trozoPaso(secuencia(7), 0, -3))
imprimir(trozoVarios(m, [[1, 3], [0, 6, 2]]), trozoVarios(m, [[], [4]]), trozoVarios(m, [[3, 0, -1], [5, 1, -2]]), trozoVarios(m, []), trozoVarios(secuencia(10), [[2, 8, 3]]), trozoVarios(m, [[0, 0]]))
imprimir(trozo(m, 0, 1, 3) + 1, suma(trozo(m, 1, 0, 2)), trozoVarios(m, [[1, 3], [2, 4]]) * 2)
fijo v = trozo(m, 0, 1, 2)
v[0] = 99
imprimir(m[1][0], v)
fijo q = [3, "a"][0]
intentar { trozo(m, 5) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { trozo(m, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { trozoPaso(m, 0, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { trozoVarios(m, [[0], [0], [0]]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { trozoVarios(m, [1]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { trozoVarios(m, [[1, 2, 3, 4]]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { trozoVarios(m, [[0, 1, 0]]) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('cerosComo, unosComo, vacioComo', U + `fijo a = arreglo([[1.5, 2], [3, 4]])
imprimir(cerosComo(a), unosComo(a), forma(vacioComo(a)), unosComo(arreglo([1, 2, 3])), unosComo(a, "u8"), cerosComo(arreglo([1, 2]), "bool"), tipoArreglo(vacioComo(arreglo([1], "i16"))))
fijo q = [3, "a"][0]
intentar { unosComo(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { cerosComo(a, "nada") } capturar (e) { imprimir(e["mensaje"]) }`);
igual('ordenarA, argOrdenar, tomar, unicosConCuentas, estaEn', U + `fijo a = arreglo([3, 1, 4, 1, 5, 9, 2, 6, 5, 3])
imprimir(ordenarA(a), argOrdenar(a), tomar(a, argOrdenar(a)), tomar(a, arreglo([0, -1, 2])), ordenarA(arreglo([[3, 1], [2, 0]])), ordenarA(arreglo([2.5, -1, 0.5], "real32")))
fijo u = unicosConCuentas(a)
imprimir(u, u["valores"], u["cuantas"], unicosConCuentas(arreglo([0.5, 0.5, 2])), unicosConCuentas(arreglo([1, 0, 1], "bool")))
imprimir(estaEn(a, arreglo([1, 5, 7])), estaEn(arreglo([1.5, 2]), arreglo([2, 3])), tipoArreglo(estaEn(a, a)))
fijo nombres = arreglo([10, 20, 30])
fijo ventas = arreglo([5, 100, 50])
imprimir(tomar(nombres, argOrdenar(ventas)), tomar(nombres, argOrdenar(-ventas)))
fijo q = [3, "a"][0]
intentar { tomar(a, arreglo([10])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { tomar(a, arreglo([-11])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ordenarA(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { estaEn(a, q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('uniformes, normales, enteros, barajarJuntos (con semilla)', U + `semilla(11)
imprimir(uniformes(4), uniformes([2, 2], 10, 20), normales(5), normales([2, 3], 100, 15), enteros(6, 0, 10), enteros([2, 2], -5, 5))
semilla(3)
fijo X = redimensionar(secuencia(12), [6, 2])
fijo y = secuencia(6) * 10
fijo p = barajarJuntos(X, y)
imprimir(p[0], p[1], tipoArreglo(p[1]), longitud(p))
fijo q = [3, "a"][0]
intentar { enteros(3, 5, 5) } capturar (e) { imprimir(e["mensaje"]) }
intentar { uniformes(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { barajarJuntos(X, secuencia(5)) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { barajarJuntos() } capturar (e) { imprimir(e["mensaje"]) }`);


// ── cuarta tanda: Fourier
igual('fourier: potencias de dos y otros tamaños', U + `fijo r8 = arreglo([1, 2, 3, 4, 0, -1, -2, -3])
imprimir(fourier(r8))
imprimir(fourier(arreglo([1.5, -2, 0.25])), fourier(arreglo([1, 2, 3, 4, 5])), fourier(arreglo([1, 0, 0, 0, 0, 0])))
fijo s = seno(secuencia(12) * 0.7) + 0.25
imprimir(fourier(s), espectro(s), espectro(r8))
imprimir(fourier(arreglo([4])), fourier(complejo(arreglo([1, 2, 3, 4]), arreglo([0, 1, 0, -1]))))
fijo g = seno(secuencia(100) * 0.3) * 2 + coseno(secuencia(100) * 1.1)
fijo F = fourier(g)
imprimir(suma(espectro(g)), parteReal(F)[7], parteImaginaria(F)[93], absoluto(F)[50])
fijo f2 = fourier(seno(secuencia(64) * 0.5))
imprimir(parteReal(f2)[5], parteImaginaria(f2)[5], suma(espectro(seno(secuencia(64) * 0.5))))`);
igual('fourierInversa, frecuencias, convolucion', U + `fijo x = arreglo([3, 1, 4, 1, 5, 9, 2, 6])
imprimir(fourierInversa(fourier(x)), parteReal(fourierInversa(fourier(arreglo([1, 2, 3, 4, 5, 6, 7])))))
imprimir(frecuencias(8), frecuencias(7, 0.5), frecuencias(1), frecuencias(4, 2))
imprimir(convolucion(arreglo([1, 2, 3]), arreglo([0, 1, 0.5])), convolucion(x, arreglo([1, 1, 1]) / 3), convolucion(arreglo([1]), arreglo([5, 6])))
fijo senal = seno(secuencia(50) * 0.2)
imprimir(suma(convolucion(senal, arreglo([0.25, 0.5, 0.25]))), convolucion(senal, arreglo([1, -1]))[10])
fijo q = [3, "a"][0]
intentar { fourier(redimensionar(secuencia(4), [2, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { fourier(arreglo([])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { fourierInversa(redimensionar(secuencia(4), [2, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { fourierInversa(arreglo([])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { espectro(redimensionar(secuencia(4), [2, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { frecuencias(0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { frecuencias(4, 0) } capturar (e) { imprimir(e["mensaje"]) }
intentar { frecuencias() } capturar (e) { imprimir(e["mensaje"]) }
intentar { convolucion(redimensionar(secuencia(4), [2, 2]), x) } capturar (e) { imprimir(e["mensaje"]) }
intentar { convolucion(arreglo([]), x) } capturar (e) { imprimir(e["mensaje"]) }
intentar { convolucion(complejo(x), x) } capturar (e) { imprimir(e["mensaje"]) }
intentar { fourier(q) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── quinta tanda: álgebra lineal
igual('factorLU, determinanteA, inversaA, resolverA', U + `fijo A = arreglo([[2, 1, 1], [4, -6, 0], [-2, 7, 2]])
fijo f = factorLU(A)
imprimir(f["L"], f["U"], f["P"], determinanteA(A), inversaA(A), resolverA(A, arreglo([5, -2, 9])))
imprimir(resolverA(A, arreglo([[5, 1], [-2, 0], [9, 3]])), por(A, inversaA(A)))
imprimir(determinanteA(identidadA(4)), determinanteA(arreglo([[1, 2], [2, 4]])), determinanteA(arreglo([[0, 1], [1, 0]])), inversaA(arreglo([[4, 7], [2, 6]])))
semilla(9)
fijo G = azarArreglo([8, 8])
fijo b = azarArreglo([8])
imprimir(determinanteA(G), resolverA(G, b), suma(inversaA(G)))
fijo q = [3, "a"][0]
intentar { factorLU(arreglo([[1, 2], [2, 4]])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { factorLU(arreglo([[1, 2, 3], [4, 5, 6]])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { inversaA(arreglo([[1, 2], [2, 4]])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { inversaA(arreglo([1, 2, 3])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { resolverA(A, arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { resolverA(arreglo([[1, 2], [2, 4]]), arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { determinanteA(q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('factorQR, factorCholesky, resolverTriangular, esDefinidaPositiva', U + `fijo A = arreglo([[12, -51, 4], [6, 167, -68], [-4, 24, -41]])
fijo qr = factorQR(A)
imprimir(qr["Q"], qr["R"], por(qr["Q"], qr["R"]))
fijo B = arreglo([[4, 12, -16], [12, 37, -43], [-16, -43, 98]])
imprimir(factorCholesky(B), esDefinidaPositiva(B), esDefinidaPositiva(arreglo([[1, 2], [2, 1]])), esDefinidaPositiva(arreglo([[1, 2, 3], [4, 5, 6]])), esDefinidaPositiva(arreglo([[1, 2], [3, 4]])))
imprimir(resolverTriangular(arreglo([[2, 0, 0], [1, 3, 0], [4, 5, 6]]), arreglo([2, 7, 32])), resolverTriangular(arreglo([[2, 1, 4], [0, 3, 5], [0, 0, 6]]), arreglo([20, 17, 12])))
imprimir(factorQR(arreglo([[1, 2], [3, 4], [5, 6]]))["R"], forma(factorQR(arreglo([[1, 2, 3], [4, 5, 6]]))["Q"]))
fijo q = [3, "a"][0]
intentar { factorCholesky(arreglo([[1, 2], [3, 4]])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { factorCholesky(arreglo([[1, 2], [2, 1]])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { resolverTriangular(arreglo([[1, 2], [3, 4]]), arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { resolverTriangular(arreglo([[1, 0], [0, 0]]), arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { resolverTriangular(arreglo([[1, 0], [0, 1]]), arreglo([1, 2, 3])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { resolverTriangular(arreglo([[1, 0], [0, 1]]), arreglo([[1, 2]])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { factorQR(arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }`);
igual('descomponerSVD, valoresSingulares, rangoMatriz, condicion, normaMatriz', U + `fijo A = arreglo([[3, 1, 1], [-1, 3, 1]])
fijo s = descomponerSVD(A)
imprimir(s["U"], s["S"], s["V"], valoresSingulares(A), rangoMatriz(A), rangoMatriz(arreglo([[1, 2], [2, 4]])), condicion(arreglo([[1, 2], [3, 4]])), condicion(arreglo([[1, 2], [2, 4]])))
fijo M = redimensionar(secuencia(1, 13), [4, 3])
imprimir(valoresSingulares(M), rangoMatriz(M), normaMatriz(M), normaMatriz(M, "uno"), normaMatriz(M, "infinito"), normaMatriz(M, "espectral"), normaMatriz(M, "nuclear"), normaMatriz(M, "frobenius"))
semilla(2)
fijo R = azarArreglo([9, 5])
fijo d = descomponerSVD(R)
imprimir(valoresSingulares(R), rangoMatriz(R), condicion(R), suma(d["U"]), suma(d["V"]))
fijo q = [3, "a"][0]
intentar { normaMatriz(M, "raro") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { normaMatriz(M, 3) } capturar (e) { imprimir(e["mensaje"]) }
intentar { normaMatriz() } capturar (e) { imprimir(e["mensaje"]) }
intentar { descomponerSVD(arreglo([1, 2, 3])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { rangoMatriz(q) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('minimosCuadrados, pseudoInversa, potenciaMatriz', U + `fijo X = arreglo([[1, 1], [1, 2], [1, 3], [1, 4]])
fijo y = arreglo([6, 5, 7, 10])
imprimir(minimosCuadrados(X, y), pseudoInversa(X), por(pseudoInversa(X), X))
imprimir(minimosCuadrados(arreglo([[1, 2, 3], [4, 5, 6]]), arreglo([1, 2])), pseudoInversa(arreglo([[1, 2], [2, 4]])), pseudoInversa(arreglo([[1, 2, 3], [4, 5, 6]])))
fijo F = arreglo([[1, 1], [1, 0]])
imprimir(potenciaMatriz(F, 10), potenciaMatriz(F, 0), potenciaMatriz(F, 1), potenciaMatriz(F, -2), potenciaMatriz(arreglo([[2, 0], [0, 3]]), 5))
fijo q = [3, "a"][0]
intentar { minimosCuadrados(arreglo([[1, 2], [2, 4], [3, 6]]), arreglo([1, 2, 3])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { minimosCuadrados(X, arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { minimosCuadrados(X, X) } capturar (e) { imprimir(e["mensaje"]) }
fijo r15 = [1.5, "a"][0]
intentar { potenciaMatriz(F, r15) } capturar (e) { imprimir(e["mensaje"]) }
intentar { potenciaMatriz(arreglo([[1, 2], [2, 4]]), -1) } capturar (e) { imprimir(e["mensaje"]) }
intentar { potenciaMatriz(F, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { pseudoInversa(arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }`);
igual('autoSimetrica, autovalores', U + `fijo S = arreglo([[2, -1, 0], [-1, 2, -1], [0, -1, 2]])
fijo e = autoSimetrica(S)
imprimir(e["valores"], e["vectores"], autovalores(S), autovalores(arreglo([[5, 0], [0, 1]])), autovalores(identidadA(3)))
semilla(4)
fijo R = azarArreglo([6, 6])
fijo Z = R + transpuesta(R)
imprimir(autovalores(Z), autoSimetrica(Z)["vectores"][0])
imprimir(traza(S), traza(arreglo([[1.5, 2], [3, 4]])), traza([[1, 2], [3, 4]]))
intentar { traza(arreglo([[1, 2, 3], [4, 5, 6]])) } capturar (e) { imprimir(e["mensaje"]) }
fijo q = [3, "a"][0]
intentar { autoSimetrica(arreglo([[1, 2], [3, 4]])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { autovalores(arreglo([[1, 2], [3, 4]])) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { autovalores(arreglo([1, 2])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { autovalores(arreglo([[1, 2, 3], [4, 5, 6]])) } capturar (e) { imprimir(e["mensaje"]) }
intentar { autovalores(q) } capturar (e) { imprimir(e["mensaje"]) }`);

try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
