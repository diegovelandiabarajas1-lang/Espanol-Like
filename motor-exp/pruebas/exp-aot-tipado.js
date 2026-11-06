// motor-exp · A4 «nivel tipado» en el ejecutable nativo (n-compilar, aot/tipado.js).
//
// Una función que solo hace cuentas y lee o escribe listas de números o de bool (y las que llama) se emite como C de verdad: double, int y
// NLista*, sin cajas. Lo raro (índice fuera de rango, división por cero, raíz de un negativo, una lista de otra clase, demasiada
// profundidad) no se trata ahí: baja de golpe y quien entró desde fuera repite la llamada con la versión general, que da el error de
// siempre. Esta suite comprueba:
//   1. el compilador reconoce como tipadas las que lo son y NO las que usan texto, diccionarios, closures…;
//   2. el ejecutable da lo mismo que la VM (salida, mensaje de error, rastro y código), también cuando lo tipado "baja";
//   3. el ejecutable con el nivel tipado da EXACTAMENTE lo mismo que sin él (N_AOT_SIN_TIPADO=1).
//
//   node motor-exp/pruebas/exp-aot-tipado.js      (necesita gcc; si el sistema bloquea ejecutables nuevos, esa parte se salta)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
const N_COMP = path.join(__dirname, '..', 'util', 'n-compilar.js');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 10).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
if (!hay('gcc')) { console.log('  – no hay gcc: nada que comprobar\n\n0 pasan, 0 fallan, 1 saltadas'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-tipado-'));
let contador = 0;

function compilar(src, env) {
  const base = path.join(tmp, `p${contador++}`);
  fs.writeFileSync(base + '.esl', src);
  const exe = base + (process.platform === 'win32' ? '.exe' : '');
  const r = spawnSync(process.execPath, [N_COMP, base + '.esl', '-o', exe, '--c', base + '.c'], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
  if (r.status !== 0) return { error: (r.stdout + r.stderr).trim() };
  return { exe, c: fs.readFileSync(base + '.c', 'utf8') };
}
function correr(exe) {
  for (let intento = 0; intento < 4; intento++) {
    const r = spawnSync(exe, [], { encoding: 'utf8', maxBuffer: 1 << 24 });
    if (r.error && /EPERM|EACCES|UNKNOWN/.test(String(r.error.code))) { spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},4000)']); continue; }
    return { out: (r.stdout || '') + (r.stderr || ''), codigo: r.status, bloqueado: false };
  }
  return { out: '', codigo: -1, bloqueado: true };
}
function vm(src) {
  const f = path.join(tmp, `v${contador++}.esl`);
  fs.writeFileSync(f, src);
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return { out: (r.stdout || '') + (r.stderr || ''), codigo: r.status };
}
// la VM y el ejecutable ya diferían (antes de A4) en qué marcos intermedios nombra el rastro: se compara todo menos las líneas «   en …»
const sinRastro = t => t.split('\n').filter(l => !/^ {3}en /.test(l)).join('\n');
const tipadas = c => [...c.matchAll(/\/\* (\S+)\/\d+ \(TIPADA/g)].map(m => m[1]).sort();

// ── los programas ──
const P = {};
P.suma = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }
fn suma(a) { var s = 0  var i = 0  mientras i < longitud(a) { s = s + a[i]  i = i + 1 }  devolver s }
fn corre() { var a = nueva(1000)  var i = 0  mientras i < 1000 { a[i] = (i * 7) % 13  i = i + 1 }  devolver suma(a) + a[5] / 2 }
imprimir(corre())
`;
P.criba = `fn criba(n) {
  var marca = []
  var q = 0
  mientras q <= n { agregar(marca, cierto)  q = q + 1 }
  marca[0] = falso  marca[1] = falso
  var i = 2
  mientras i * i <= n { si marca[i] { var j = i * i  mientras j <= n { marca[j] = falso  j = j + i } }  i = i + 1 }
  var c = 0  i = 0
  mientras i <= n { si marca[i] { c = c + 1 }  i = i + 1 }
  devolver c
}
imprimir(criba(100000)); imprimir(criba(2)); imprimir(criba(1))
`;
P.resto = `fn f(a, b) { devolver (a % b) + (a // b) * 1000 + a / b }
fn corre() {
  var s = 0
  var xs = [7, -7, 7.5, -7.5, 0, 1e15, 123456789012]
  var i = 0
  mientras i < longitud(xs) { var j = 0  mientras j < longitud(xs) { si xs[j] != 0 { s = s + f(xs[i], xs[j]) }  j = j + 1 }  i = i + 1 }
  devolver s
}
imprimir(corre())
`;
P.fueraDeRango = `fn leer(a, k) { devolver a[k] }
fn corre() { var a = [1, 2, 3]  var s = 0  var i = 0  mientras i <= 3 { s = s + leer(a, i)  i = i + 1 }  devolver s }
imprimir(corre())
`;
P.indiceNoEntero = `fn corre() { var a = [1, 2, 3]  devolver a[1.5] }
imprimir(corre())
`;
P.indiceNegativo = `fn corre() { var a = [1, 2, 3]  devolver a[-1] + a[-3] }
imprimir(corre())
`;
P.divCero = `fn d(a, b) { devolver a / b }
fn corre() { var s = 0  var i = 3  mientras i >= 0 { s = s + d(10, i)  i = i - 1 }  devolver s }
imprimir(corre())
`;
P.restoCero = `fn corre() { var a = [5]  var z = a[0] - 5  devolver 10 % z }
imprimir(corre())
`;
P.raizNegativa = `usar raiz de "numerico"
fn corre() { var a = [4, 9, -1]  var s = 0  var i = 0  mientras i < 3 { s = s + raiz(a[i])  i = i + 1 }  devolver s }
imprimir(corre())
`;
P.listaDeTexto = `fn suma(a) { var s = 0  var i = 0  mientras i < longitud(a) { s = s + a[i]  i = i + 1 }  devolver s }
fn corre(a) { devolver suma(a) * 2 }
imprimir(corre([1, 2, 3]))
imprimir(corre([1, 2, 3.5]))
imprimir(corre([]))
imprimir(corre(["a", "b"]))
`;
P.listaMixta = `fn suma(a) { var s = 0  var i = 0  mientras i < longitud(a) { s = s + a[i]  i = i + 1 }  devolver s }
fn corre(a) { devolver suma(a) }
imprimir(corre([1, cierto]))
`;
P.parametroEscrito = `fn llena(a, n) { var i = 0  mientras i < longitud(a) { a[i] = n + i  i = i + 1 }  devolver 0 }
fn corre() { var a = [0, 0, 0, 0]  llena(a, 10)  devolver a[0] + a[3] }
imprimir(corre())
var b = [1, 2, 3]
llena(b, 100)
imprimir(b[0]); imprimir(b[2])
llena(b, 5.5)
imprimir(b[1])
`;
P.alias = `fn corre() { var a = [1, 2, 3]  var b = a  b[0] = 99  a[1] = 77  devolver a[0] + b[1] }
imprimir(corre())
`;
P.devuelveLista = `fn dos(n) { var a = []  agregar(a, n)  agregar(a, n * 2)  devolver a }
fn corre() { var s = 0  var i = 0  mientras i < 5 { var l = dos(i)  s = s + l[0] + l[1]  i = i + 1 }  devolver s }
imprimir(corre())
var x = dos(3)
imprimir(x[0] + x[1]); imprimir(longitud(x))
`;
P.devuelveNulo = `fn rellena(a, n) { var i = 0  mientras i < n { agregar(a, i * i)  i = i + 1 } }
fn corre() { var a = []  rellena(a, 10)  devolver a[9] + longitud(a) }
imprimir(corre())
`;
P.recursion = `fn fact(n, a) { si n <= 1 { devolver a[0] }  a[0] = a[0] * n  devolver fact(n - 1, a) }
fn corre(n) { var a = [1]  devolver fact(n, a) }
imprimir(corre(10)); imprimir(corre(20)); imprimir(corre(1))
`;
P.recursionProfunda = `fn cuenta(n, a) { si n == 0 { devolver longitud(a) }  agregar(a, n)  devolver cuenta(n - 1, a) }
fn corre(n) { var a = []  devolver cuenta(n, a) }
imprimir(corre(100)); imprimir(corre(850))
imprimir(corre(100000))
`;
P.nan = `fn corre() { var a = [0, 1, 2]  a[0] = 0 / 1 - 0 / 1  var x = a[0] - 0  a[1] = -x  a[2] = a[1] * 1e308 * 10  devolver a[2] }
imprimir(corre())
fn corre2() { var a = [1e308]  a[0] = a[0] * 10  var b = a[0] - a[0]  devolver b }
imprimir(corre2())
`;
P.comparaciones = `fn corre() { var a = [1, 2, 2, 3]  var c = 0  var i = 0  mientras i < 3 { si a[i] == a[i + 1] { c = c + 1 }  si a[i] != a[i + 1] { c = c + 10 }  si a[i] < a[i + 1] { c = c + 100 }  i = i + 1 }  devolver c }
imprimir(corre())
fn bo() { var b = [cierto, falso, cierto]  var c = 0  var i = 0  mientras i < 3 { si b[i] == b[0] { c = c + 1 }  si no b[i] { c = c + 10 }  i = i + 1 }  devolver c }
imprimir(bo())
`;
P.noTipadaTexto = `fn titulo(s) { devolver s + "!" }
fn corre() { devolver titulo("hola") }
imprimir(corre())
`;
P.muchasListas = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, i)  i = i + 1 }  devolver a }
fn corre() { var s = 0  var i = 0  mientras i < 200000 { var t = nueva(10)  s = s + t[9]  i = i + 1 }  devolver s }
imprimir(corre())
`;
P.matrizPlana = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }
fn mm(n) {
  var a = nueva(n * n)  var b = nueva(n * n)  var c = nueva(n * n)
  var i = 0
  mientras i < n * n { a[i] = i % 7  b[i] = (i * 3) % 11  i = i + 1 }
  i = 0
  mientras i < n { var j = 0  mientras j < n { var s = 0  var k = 0  mientras k < n { s = s + a[i * n + k] * b[k * n + j]  k = k + 1 }  c[i * n + j] = s  j = j + 1 }  i = i + 1 }
  devolver c[n * n - 1] + c[0]
}
imprimir(mm(30)); imprimir(mm(1))
`;

P.bordeEntero = `fn mas(n) { devolver n + 1 }
fn menos(n) { devolver n - 1 }
fn por(n) { devolver n * 2 }
fn corre(n) { devolver mas(n) + menos(0 - n) + por(n) }
fn lista() { var a = [9007199254740992]  a[0] = a[0] + 1  var b = [0 - 9007199254740992]  b[0] = b[0] - 1  devolver a[0] + b[0] }
imprimir(mas(9007199254740992)); imprimir(mas(9007199254740991)); imprimir(menos(0 - 9007199254740992)); imprimir(por(4503599627370496)); imprimir(por(4503599627370497))
imprimir(corre(9007199254740991)); imprimir(corre(100)); imprimir(lista())
`;
P.intervalos = `fn cuenta(n) { var i = 0  var s = 0  mientras i < n { s = s + i  i = i + 1 }  devolver s }
fn baja(n) { var c = n  var k = 0  mientras c > 0 { c = c - 1  k = k + 1 }  devolver k }
fn lista() { var a = []  var i = 0  mientras i < 10 { agregar(a, i * 3)  i = i + 1 }  var t = 0.0  i = 0  mientras i < 10 { t = t + a[i] % 7  i = i + 1 }  devolver t }
imprimir(cuenta(1000)); imprimir(cuenta(0)); imprimir(cuenta(-5)); imprimir(baja(500)); imprimir(baja(0)); imprimir(lista())
`;

P.bucleIndices = `fn suma(a) { var i = 0  var s = 0  mientras i < longitud(a) { s = s + a[i]  i = i + 1 }  devolver s }
fn pasaDelFinal() { var a = [1, 2, 3]  var i = 0  var s = 0  mientras i <= 3 { s = s + a[i]  i = i + 1 }  devolver s }
fn noLlegaAPasarse() { var a = [1, 2, 3]  var i = 0  var s = 0  mientras i < 10 { si i >= 3 { devolver s }  s = s + a[i]  i = i + 1 }  devolver s }
fn atras() { var a = [5, 6, 7, 8]  var c = 3  var s = 0  mientras c >= 0 { s = s + a[c]  c = c - 1 }  devolver s }
fn atrasPasado() { var a = [5, 6, 7, 8]  var c = 4  var s = 0  mientras c >= 1 { s = s + a[c]  c = c - 1 }  devolver s }
fn conOffset() { var a = [1, 2, 3, 4, 5]  var i = 1  var s = 0  mientras i < 5 { s = s + a[i - 1] * a[i]  i = i + 1 }  devolver s }
fn offsetMal() { var a = [1, 2, 3, 4, 5]  var i = 0  var s = 0  mientras i < 5 { s = s + a[i - 1]  i = i + 1 }  devolver s }
fn invariante() { var a = [10, 20, 30]  var k = 2  var i = 0  var s = 0  mientras i < 100 { s = s + a[k]  i = i + 1 }  devolver s }
fn invariantePasado() { var a = [10, 20, 30]  var k = 3  var i = 0  var s = 0  mientras i < 100 { s = s + a[k]  i = i + 1 }  devolver s }
fn vacio() { var a = []  var i = 0  var s = 0  mientras i < 0 { s = s + a[i]  i = i + 1 }  devolver s }
fn doble() { var a = [1, 2, 3]  var b = [4, 5, 6]  var i = 0  var s = 0  mientras i < 3 { var j = 0  mientras j < 3 { s = s + a[i] * b[j]  j = j + 1 }  i = i + 1 }  devolver s }
fn creceEnElBucle() { var a = [1]  var i = 0  var s = 0  mientras i < 5 { agregar(a, i)  s = s + a[i]  i = i + 1 }  devolver s }
imprimir(suma([1, 2, 3])); imprimir(noLlegaAPasarse()); imprimir(atras()); imprimir(conOffset()); imprimir(invariante()); imprimir(vacio()); imprimir(doble()); imprimir(creceEnElBucle())
imprimir(pasaDelFinal())
`;
P.bucleAtrasPasado = `fn atrasPasado() { var a = [5, 6, 7, 8]  var c = 4  var s = 0  mientras c >= 1 { s = s + a[c]  c = c - 1 }  devolver s }
imprimir(atrasPasado())
`;
P.bucleOffsetMal = `fn offsetMal() { var a = [1, 2, 3, 4, 5]  var i = 0  var s = 0  mientras i < 5 { s = s + a[i - 1]  i = i + 1 }  devolver s }
imprimir(offsetMal())
`;
P.bucleInvariantePasado = `fn invariantePasado() { var a = [10, 20, 30]  var k = 3  var i = 0  var s = 0  mientras i < 100 { s = s + a[k]  i = i + 1 }  devolver s }
imprimir(invariantePasado())
`;

P.regArbol = `tipo Nodo {
  v: real
  i = nulo
  d = nulo
}
fn construir(p) { si p == 0 { devolver nulo }  devolver Nodo(p, construir(p - 1), construir(p - 1)) }
fn suma(n) { si n == nulo { devolver 0 }  devolver n.v + suma(n.i) + suma(n.d) }
fn corre() { var t = 0.0  var r = 0  mientras r < 3 { fijo a = construir(14)  t = t + suma(a)  r = r + 1 }  devolver t }
imprimir(corre())
`;
P.regLista = `tipo Nodo {
  v: real
  i = nulo
}
fn construye(n) { var h: cualquiera = nulo  var k = 0  mientras k < n { h = Nodo(k, h)  k = k + 1 }  devolver h }
fn largo(h) { var c: cualquiera = h  var n = 0  mientras c != nulo { n = n + 1  c = c.i }  devolver n }
fn corre() { fijo a = construye(5000)  var t = largo(a) * 1000 + largo(construye(7))  devolver t }
imprimir(corre())
`;
P.regNuloCampo = `tipo Nodo {
  v: real
  i = nulo
}
fn lee(n) { devolver n.v }
fn corre() { var x: cualquiera = Nodo(3.0, nulo)  var s = lee(x)  x = x.i  s = s + lee(x)  devolver s }
imprimir(corre())
`;
P.regAlias = `tipo Caja {
  v: real
  w: real
}
fn corre() { fijo a = Caja(1.0, 2.0)  fijo b = a  b.v = 10.0  a.w = a.v + b.w  devolver a.v * 100 + a.w }
imprimir(corre())
`;
P.regReasignar = `tipo Nodo {
  v: real
  i = nulo
}
fn corre() { var x: cualquiera = Nodo(1.0, nulo)  var t = 0.0  var k = 0  mientras k < 1000 { var y = Nodo(k, x)  x = y  t = t + x.v + x.i.v  k = k + 1 }  devolver t }
imprimir(corre())
`;
P.regBool = `tipo Marca {
  ok: bool
  n: real
}
fn corre() { var m = Marca(cierto, 3.0)  var c = 0  var k = 0  mientras k < 10 { m.ok = k % 2 == 0  si m.ok { c = c + 1 }  k = k + 1 }  devolver c }
imprimir(corre())
`;
P.regComparar = `tipo P {
  x: real
}
fn corre() { fijo a = P(1.0)  fijo b = P(1.0)  si a == b { devolver 1 }  devolver 0 }
imprimir(corre())
`;
P.regCadenaLarga = `tipo Nodo {
  v: real
  i = nulo
}
fn corre() { var h: cualquiera = nulo  var k = 0  mientras k < 400000 { h = Nodo(k, h)  k = k + 1 }  var c: cualquiera = h  var s = 0.0  mientras c != nulo { s = s + c.v % 3  c = c.i }  devolver s }
imprimir(corre())
`;
P.regDeMain = `tipo Nodo {
  v: real
  i = nulo
}
fn suma(n) { var s = 0.0  var c: cualquiera = n  mientras c != nulo { s = s + c.v  c = c.i }  devolver s }
var l: cualquiera = nulo
var k = 0
mientras k < 100 { l = Nodo(k, l)  k = k + 1 }
imprimir(suma(l))
`;

// índice declarado DENTRO del cuerpo del bucle (no es invariante: debe seguir comprobándose)
P.bucleVarDentro = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }
fn corre() { fijo a = nueva(10)  var s = 0  var i = 0  mientras i < 10 { var j = i * 2  s = s + a[j]  i = i + 1 }  devolver s }
imprimir(corre())
`;
P.bucleVarDentroOk = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 1)  i = i + 1 }  devolver a }
fn corre() { fijo a = nueva(1000)  var s = 0  var i = 1  mientras i < 1000 { var j = (i * 7) % (i + 1)  s = s + a[j] + a[i - 1]  i = i + 1 }  devolver s }
imprimir(corre())
`;

// recursión mutua: la segunda se define después de la que la llama
P.mutua = `fn par(n) { si n == 0 { devolver 1 }  devolver impar(n - 1) }
fn impar(n) { si n == 0 { devolver 0 }  devolver par(n - 1) }
fn corre() { var s = 0  var r = 0  mientras r < 2000 { s = s + par(300 + r % 2)  r = r + 1 }  devolver s }
imprimir(corre())
`;
P.mutuaProfunda = `fn par(n) { si n == 0 { devolver 1 }  devolver impar(n - 1) }
fn impar(n) { si n == 0 { devolver 0 }  devolver par(n - 1) }
imprimir(par(5000))
`;

P.relojTipado = `fn corre() { var t0 = reloj()  var s = 0  var i = 0  mientras i < 1000 { s = s + i  i = i + 1 }  var t1 = reloj()  si t1 >= t0 { devolver s }  devolver -1 }
imprimir(corre())
`;
P.relojEntero = `tipo Nodo {
  v: real
  i = nulo
}
fn corre() { var h: cualquiera = nulo  var k = 0  mientras k < 1000 { h = Nodo(k, h)  k = k + 1 }  var t0 = entero(reloj() * 1000.0)  var c: cualquiera = h  var n = 0  mientras c != nulo { n = n + 1  c = c.i }  var dt = entero(reloj() * 1000.0) - t0  si dt >= 0 { devolver n }  devolver -1 }
imprimir(corre())
`;

// ── índices «base + variable del bucle» (a[i*n + j]): una comprobación antes del bucle ──
const NV_ = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }\n`;
P.idxPlano = NV_ + `fn corre() { var n = 40  var a = nueva(n * n)  var b = nueva(n * n)  var c = nueva(n * n)
  var i = 0  mientras i < n { var j = 0  mientras j < n { a[i * n + j] = (i * 7 + j * 3) % 10  b[i * n + j] = (i * 5 + j * 11) % 10  j = j + 1 }  i = i + 1 }
  i = 0  mientras i < n { var k = 0  mientras k < n { var aik = a[i * n + k]  var j = 0  mientras j < n { c[i * n + j] = c[i * n + j] + aik * b[k * n + j]  j = j + 1 }  k = k + 1 }  i = i + 1 }
  var t = 0  i = 0  mientras i < n * n { t = t + c[i] * (i % 7)  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoFuera = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var i = 0  var t = 0  mientras i < n { var j = 0  mientras j <= n { t = t + a[i * n + j]  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoNegativo = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var t = 0  var i = 0  mientras i < 3 { var j = 0  mientras j < 4 { t = t + a[i * n - 2 + j]  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoCondicional = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var t = 0  var i = 0  mientras i < n { var j = 0  mientras j < n { si j + 1 < n { t = t + a[i * n + j + 1] + 1 }  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoUltimaFila = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var t = 0  var i = 9  mientras i < 10 { var j = 0  mientras j < n { a[i * n + j] = j + 1  t = t + a[i * n + j]  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoUnaMas = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var t = 0  var i = 9  mientras i < 11 { var j = 0  mientras j < n { t = t + a[i * n + j]  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoVacio = NV_ + `fn corre() { var n = 10  var a = nueva(n * n)  var t = 0  var i = 5  mientras i < 5 { var j = 0  mientras j < 100 { t = t + a[i * n + j + 1000]  j = j + 1 }  i = i + 1 }  devolver t + 7 }
imprimir(corre())
`;
P.idxColumnas = NV_ + `fn corre() { var n = 30  var a = nueva(n * n)  var i = 0  mientras i < n * n { a[i] = (i * 7) % 13  i = i + 1 }
  var t = 0  var c = 0  mientras c < n { var f = 0  mientras f < n { t = t + a[f * n + c] * (f + 1)  f = f + 1 }  c = c + 1 }  devolver t }
imprimir(corre())
`;
P.idxColumnasFuera = NV_ + `fn corre() { var n = 30  var a = nueva(n * n)  var t = 0  var c = 0  mientras c < n { var f = 0  mientras f <= n { t = t + a[f * n + c]  f = f + 1 }  c = c + 1 }  devolver t }
imprimir(corre())
`;
P.idxInverso = NV_ + `fn corre() { var n = 20  var a = nueva(n * n)  var t = 0  var i = 0  mientras i < n { var j = 0  mientras j < n { t = t + a[(n * n - 1) - (i * n + j)] + 1  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxInversoFuera = NV_ + `fn corre() { var n = 20  var a = nueva(n * n)  var t = 0  var i = 0  mientras i < n { var j = 0  mientras j < n { t = t + a[(n * n - 1) - (i * n + j) + 1]  j = j + 1 }  i = i + 1 }  devolver t }
imprimir(corre())
`;
P.idxCoefVariable = NV_ + `fn corre() { var n = 12  var a = nueva(n * n)  var t = 0  var p = 1  mientras p <= 3 { var j = 0  mientras j < 4 { a[j * p + 2] = j + p  t = t + a[j * p + 2]  j = j + 1 }  p = p + 1 }  devolver t }
imprimir(corre())
`;
P.idxCoefNegativo = NV_ + `fn corre() { var n = 12  var a = nueva(n)  var t = 0  var p = 0 - 1  var j = 0  mientras j < 4 { t = t + a[j * p + 8]  j = j + 1 }  devolver t }
imprimir(corre())
`;
P.idxCoefGrande = NV_ + `fn corre() { var a = nueva(4)  var t = 0  var p = 4611686018427387904  var j = 0  mientras j < 4 { t = t + a[j * p]  j = j + 1 }  devolver t }
imprimir(corre())
`;
P.idxPlanoDesborde = NV_ + `fn corre() { var n = 3  var a = nueva(n)  var t = 0  var b = 4611686018427387904  var j = 0  mientras j < 3 { t = t + a[b * 4 + j]  j = j + 1 }  devolver t }
imprimir(corre())
`;

// ── idioma «mientras s < N { agregar(a, K)  s = s + 1 }» (n copias de una constante de una vez) ──
P.repCero = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }
fn corre() { fijo a = nueva(0)  fijo b = nueva(5)  fijo c = nueva(3000)  var s = longitud(a) * 100000 + longitud(b) * 1000 + longitud(c)  b[2] = 7  c[2999] = 1  devolver s + b[2] + b[4] + c[2999] + c[0] }
imprimir(corre())
`;
P.repMenor = `fn rellena(n, k) { var a = []  agregar(a, 5)  agregar(a, 6)  var i = 3  mientras i <= n { agregar(a, k)  i = i + 1 }  devolver a }
fn corre() { fijo a = rellena(10, 9)  fijo b = rellena(2, 9)  var s = 0  var j = 0  mientras j < longitud(a) { s = s + a[j] * (j + 1)  j = j + 1 }  devolver s * 100 + longitud(b) }
imprimir(corre())
`;
P.repReal = `fn corre() { var a = []  var i = 0  mientras i < 100 { agregar(a, 0.5)  i = i + 1 }  var s = 0.0  var j = 0  mientras j < 100 { s = s + a[j]  j = j + 1 }  devolver s }
imprimir(corre())
`;
P.repBool = `fn corre() { var a = []  var i = 0  mientras i < 64 { agregar(a, cierto)  i = i + 1 }  a[3] = falso  var c = 0  var j = 0  mientras j < 64 { si a[j] { c = c + 1 }  j = j + 1 }  devolver c }
imprimir(corre())
`;
P.repNegativo = `fn corre() { var a = []  var i = 0  mientras i < 40 { agregar(a, -3)  i = i + 1 }  var s = 0  var j = 0  mientras j < 40 { s = s + a[j]  j = j + 1 }  devolver s }
imprimir(corre())
`;
P.repListaDesp = `fn nueva(n) { var a = []  var i = 0  mientras i < n { agregar(a, 0)  i = i + 1 }  devolver a }
fn corre() { var t = 0  var r = 0  mientras r < 300 { fijo a = nueva(2000)  a[r] = r  t = t + a[(r * 7) % 2000]  r = r + 1 }  devolver t }
imprimir(corre())
`;

// ── análisis de escape: objetos que pueden vivir en la pila de C (y los que NO deben) ──
const ND = `tipo Nodo {
  v: real
  i = nulo
}
`;
P.escLocal = ND + `fn corre() { var s = 0.0  var k = 0  mientras k < 1000 { var a: cualquiera = Nodo(k, nulo)  var b: cualquiera = Nodo(k + 1, a)  s = s + b.i.v + b.v  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escDevuelve = ND + `fn crea(k) { devolver Nodo(k, nulo) }
fn corre() { var s = 0.0  var k = 0  mientras k < 500 { var a: cualquiera = crea(k)  var b: cualquiera = crea(k + 1)  s = s + a.v * 2 + b.v  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escCadena = ND + `fn corre() { var h: cualquiera = nulo  var k = 0  mientras k < 100 { h = Nodo(k, h)  k = k + 1 }  var c: cualquiera = h  var s = 0.0  mientras c != nulo { s = s + c.v  c = c.i }  devolver s }
imprimir(corre())
`;
P.escAnterior = ND + `fn corre() { var prev: cualquiera = nulo  var s = 0.0  var k = 0  mientras k < 50 { var a: cualquiera = Nodo(k, prev)  si prev != nulo { s = s + prev.v * 3 }  prev = a  k = k + 1 }  devolver s + prev.v }
imprimir(corre())
`;
P.escEnParam = ND + `fn ata(p, k) { p.i = Nodo(k, nulo) }
fn corre() { var raiz: cualquiera = Nodo(0.0, nulo)  ata(raiz, 7.0)  var s = raiz.i.v  var k = 0  mientras k < 20 { ata(raiz, k)  s = s + raiz.i.v  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escPasaYGuarda = ND + `fn guarda(dest, x) { dest.i = x }
fn corre() { var dest: cualquiera = Nodo(1.0, nulo)  var k = 0  mientras k < 30 { var x: cualquiera = Nodo(k * 10, nulo)  guarda(dest, x)  k = k + 1 }  devolver dest.i.v + dest.v }
imprimir(corre())
`;
P.escPasaYLee = ND + `fn lee(x) { devolver x.v + 1 }
fn corre() { var s = 0.0  var k = 0  mientras k < 1000 { var x: cualquiera = Nodo(k, nulo)  s = s + lee(x)  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escPasaYDevuelve = ND + `fn id(x) { devolver x }
fn corre() { var s = 0.0  var k = 0  var g: cualquiera = nulo  mientras k < 10 { var x: cualquiera = Nodo(k, nulo)  g = id(x)  k = k + 1 }  devolver g.v }
imprimir(corre())
`;
P.escEnLista = ND + `fn nueva_nulos(n) { var a = []  var i = 0  mientras i < n { agregar(a, nulo)  i = i + 1 }  devolver a }
fn corre() { fijo l = nueva_nulos(10)  var k = 0  mientras k < 10 { var x: cualquiera = Nodo(k, nulo)  l[k] = x  k = k + 1 }  var s = 0.0  k = 0  mientras k < 10 { s = s + l[k].v * (k + 1)  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escCondicional = ND + `fn corre() { var g: cualquiera = nulo  var s = 0.0  var k = 0  mientras k < 40 { var x: cualquiera = Nodo(k, nulo)  si k % 7 == 0 { g = x }  si g != nulo { s = s + g.v }  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.escNuloCampo = ND + `fn corre() { var x: cualquiera = Nodo(1.0, nulo)  devolver x.i.v }
imprimir(corre())
`;

// ── listas de objetos ──
const NN = `fn nueva_nulos(n) { var a = []  var i = 0  mientras i < n { agregar(a, nulo)  i = i + 1 }  devolver a }
tipo Nodo {
  v: real
  i = nulo
}
`;
P.lstObjs = NN + `fn corre() { fijo l = nueva_nulos(50)  var k = 0  mientras k < 50 { l[k] = Nodo(k, nulo)  k = k + 1 }  var s = 0.0  k = 0  mientras k < 50 { s = s + l[k].v * 2  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.lstAgregar = NN + `fn corre() { fijo l = nueva_nulos(0)  var k = 0  mientras k < 1000 { agregar(l, Nodo(k, nulo))  k = k + 1 }  var s = 0.0  k = 0  mientras k < 1000 { s = s + l[k].v  k = k + 1 }  devolver s }
imprimir(corre())
`;
P.lstAlias = NN + `fn corre() { fijo l = nueva_nulos(4)  l[0] = Nodo(1.0, nulo)  l[1] = l[0]  l[2] = Nodo(5.0, l[0])  l[1].v = 7.0  l[3] = l[2].i  devolver l[0].v * 100 + l[2].i.v * 10 + l[3].v + l[2].v }
imprimir(corre())
`;
P.lstReemplazo = NN + `fn corre() { fijo l = nueva_nulos(3)  var t = 0.0  var k = 0  mientras k < 3000 { l[k % 3] = Nodo(k, l[(k + 1) % 3])  t = t + l[k % 3].v  k = k + 1 }  devolver t }
imprimir(corre())
`;
P.lstFuera = NN + `fn corre() { fijo l = nueva_nulos(3)  l[0] = Nodo(1.0, nulo)  devolver l[5].v }
imprimir(corre())
`;
P.lstNuloElem = NN + `fn corre() { fijo l = nueva_nulos(3)  l[0] = Nodo(1.0, nulo)  devolver l[0].v + l[1].v }
imprimir(corre())
`;
P.lstLarga = NN + `fn corre() { fijo l = nueva_nulos(300000)  var k = 0  mientras k < 300000 { si k == 0 { l[k] = Nodo(k, nulo) } sino { l[k] = Nodo(k, l[k - 1]) }  k = k + 1 }  var c: cualquiera = l[299999]  var n = 0  mientras c != nulo { n = n + 1  c = c.i }  devolver n }
imprimir(corre())
`;

// qué funciones deben salir tipadas en cada programa (las que no se nombran no se comprueban)
const ESPERA = {
  regArbol: ['construir', 'suma', 'corre'],
  regLista: ['construye', 'largo', 'corre'],
  regCadenaLarga: ['corre'],
  regReasignar: ['corre'],
  regAlias: ['corre'],
  mutua: ['par', 'impar', 'corre'],
  idxPlano: ['corre', 'nueva'],
  relojTipado: ['corre'],
  relojEntero: ['corre'],
  repCero: ['corre', 'nueva'],
  repListaDesp: ['corre', 'nueva'],
  escLocal: ['corre'],
  escCadena: ['corre'],
  escAnterior: ['corre'],
  escCondicional: ['corre'],
  lstObjs: ['corre'],
  lstAgregar: ['corre'],
  lstAlias: ['corre'],
  lstReemplazo: ['corre'],
  lstLarga: ['corre'],
  suma: ['corre', 'nueva', 'suma'],
  criba: ['criba'],
  resto: ['corre', 'f'],
  noTipadaTexto: [],
  matrizPlana: ['mm', 'nueva'],
};
const NO = { noTipadaTexto: ['titulo', 'corre'] };

const nombres = Object.keys(P);
for (const nombre of nombres) {
  const src = P[nombre];
  const c1 = compilar(src);
  if (c1.error) { comprobar(`${nombre}: compila`, false, c1.error); continue; }
  const v = vm(src);
  const e1 = correr(c1.exe);
  if (e1.bloqueado) { saltadas++; console.log(`  – ${nombre}: el sistema bloquea el ejecutable nuevo`); continue; }
  comprobar(`${nombre}: el mismo código de salida y la misma salida (sin el rastro) que la VM`, e1.codigo === v.codigo && sinRastro(e1.out) === sinRastro(v.out),
    `VM (${v.codigo}): ${JSON.stringify(v.out.slice(0, 400))}\nEXE (${e1.codigo}): ${JSON.stringify(e1.out.slice(0, 400))}`);
  const c0 = compilar(src, { N_AOT_SIN_TIPADO: '1' });
  if (!c0.error) {
    const e0 = correr(c0.exe);
    if (!e0.bloqueado) comprobar(`${nombre}: igual con y sin nivel tipado`, e0.out === e1.out && e0.codigo === e1.codigo, `sin: ${JSON.stringify(e0.out.slice(0, 300))}\ncon: ${JSON.stringify(e1.out.slice(0, 300))}`);
  }
  const t = tipadas(c1.c);
  if (ESPERA[nombre]) {
    const falta = ESPERA[nombre].filter(x => !t.includes(x));
    comprobar(`${nombre}: salen tipadas ${ESPERA[nombre].join(', ') || '(ninguna)'}`, !falta.length && (ESPERA[nombre].length || !t.length), `tipadas: ${t.join(', ')} · faltan: ${falta.join(', ')}`);
  }
  if (NO[nombre]) comprobar(`${nombre}: NO salen tipadas ${NO[nombre].join(', ')}`, NO[nombre].every(x => !t.includes(x)), `tipadas: ${t.join(', ')}`);
}

console.log(`\n${pasan} pasan, ${fallan} fallan, ${saltadas} saltadas`);
process.exit(fallan ? 1 : 0);
