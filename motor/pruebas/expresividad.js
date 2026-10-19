// 4.1 · fase X1 (expresividad): registros con métodos, «si … entonces …
// sino …» como expresión, «??», «?.», desestructurar y «segun».
//
// Lo que se prueba de cada cosa: que hace lo que dice, que el verificador para
// los errores ANTES de correr, que el mensaje enseña la forma buena, que con y
// sin JIT da lo mismo, y que lo de antes sigue igual (los nombres «tipo»,
// «segun», «caso», «otro», «entonces» y «yo» siguen valiendo como nombres).
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let pasan = 0, fallan = 0;
const fallos = [];
const sinTraza = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n');
function corre(src, opts) {
  const out = [];
  const m = crearMotor(Object.assign({ salida: s => out.push(s), limiteInstr: 2e8 }, opts || {}));
  const r = m.ejecutar(src);
  return { r, out, m };
}
const msgDe = r => sinTraza(r.errores.map(e => e.formato ? e.formato() : e.message).join(' | '));
function ok(nombre, src, esperado) {
  const { r, out } = corre(src);
  if (!r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    ERROR: ${msgDe(r)}`); return; }
  if (out.join('\n') !== esperado) { fallan++; fallos.push(`✗ ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(out.join('\n'))}`); return; }
  pasan++;
}
// «etapa»: 'tipos'/'sintaxis' si debe pararse antes de correr, 'ejecución' si al correr.
function falla(nombre, src, fragmento, etapa) {
  const { r, out } = corre(src);
  if (r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y corrió bien`); return; }
  const msg = msgDe(r);
  if (fragmento && !msg.includes(fragmento)) { fallan++; fallos.push(`✗ ${nombre}\n    el error no dice «${fragmento}»\n    dijo: ${msg}`); return; }
  if (etapa && !msg.startsWith('[' + etapa)) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error de ${etapa}\n    dijo: ${msg}`); return; }
  if (etapa && etapa !== 'ejecución' && out.length) { fallan++; fallos.push(`✗ ${nombre}\n    se paró, pero DESPUÉS de imprimir: ${out.join('|')}`); return; }
  pasan++;
}
function mismo(nombre, src) {
  const a = corre(src, { jit: true }), b = corre(src, { jit: false });
  const ka = a.r.ok ? a.out.join('\n') : 'E:' + msgDe(a.r), kb = b.r.ok ? b.out.join('\n') : 'E:' + msgDe(b.r);
  if (ka !== kb) { fallan++; fallos.push(`✗ ${nombre}\n    sin JIT: ${kb.slice(0, 300)}\n    con JIT: ${ka.slice(0, 300)}`); return; }
  if (a.r.stats && a.r.stats.jitCompiladas < 1) { fallan++; fallos.push(`✗ ${nombre}\n    el JIT no compiló nada`); return; }
  if (!a.r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    los dos fallan: ${ka}`); return; }
  pasan++;
}

// ══════════════════════════════ 1. registros
const PUNTO = `usar raiz de "numerico"
tipo Punto {
  x: real
  y: real
}
fn Punto.distancia(otro: Punto): real { devolver raiz((yo.x - otro.x) ** 2 + (yo.y - otro.y) ** 2) }
fn Punto.mover(dx: real, dy: real) {
  yo.x = yo.x + dx
  yo.y = yo.y + dy
}
`;
ok('un registro se crea, se imprime con su tipo y se lee', PUNTO + `
fijo p = Punto(1.0, 2.0)
imprimir(p, p.x, p.y, tipo(p))`, 'Punto{x: 1, y: 2} 1 2 Punto');
ok('un método recibe «yo» y otros argumentos', PUNTO + `
imprimir(Punto(0.0, 0.0).distancia(Punto(3.0, 4.0)))`, '5');
ok('un método puede cambiar el registro', PUNTO + `
var p = Punto(1.0, 1.0)
p.mover(2.0, 3.0)
imprimir(p)`, 'Punto{x: 3, y: 4}');
ok('un método sin llamar es una función que ya lleva su «yo»', PUNTO + `
fijo p = Punto(0.0, 0.0)
fijo d = p.distancia
imprimir(d(Punto(6.0, 8.0)))`, '10');
ok('los campos se escriben con «.»', PUNTO + `
var p = Punto(0.0, 0.0)
p.x = 7.0
p.y += 1
imprimir(p)`, 'Punto{x: 7, y: 1}');
ok('el constructor y los métodos se pueden usar antes de declararlos', `
imprimir(Par(1, 2).suma())
tipo Par { a: entero
  b: entero }
fn Par.suma(): entero { devolver yo.a + yo.b }`, '3');
ok('un campo sin tipo acepta cualquier cosa', `
tipo Caja { contenido }
imprimir(Caja([1, 2]).contenido, Caja("x").contenido)`, '[1, 2] x');
ok('== compara campos Y tipo', `
tipo A { v }
tipo B { v }
imprimir(A(1) == A(1), A(1) == A(2), A(1) == B(1), A(1) == {"v": 1})`, 'cierto falso falso falso');
ok('copiar un registro da otro registro del mismo tipo', `
tipo A { v }
var a = A(1)
var b = copiar(a)
b.v = 2
imprimir(a, b, tipo(b))`, 'A{v: 1} A{v: 2} A');
ok('un registro dentro de una lista y de otro registro', PUNTO + `
tipo Linea { a: Punto
  b: Punto }
fn Linea.largo(): real { devolver yo.a.distancia(yo.b) }
fijo ls = [Linea(Punto(0.0, 0.0), Punto(0.0, 2.0)), Linea(Punto(1.0, 1.0), Punto(4.0, 5.0))]
var t = 0.0
para l en ls { t = t + l.largo() }
imprimir(t)`, '7');
ok('los nombres «tipo», «yo» y la función tipo() siguen funcionando', `
var yo = 3
fn tipoDe(x) { devolver tipo(x) }
imprimir(yo, tipoDe(yo), tipo("a"))`, '3 entero texto');

falla('un campo mal escrito se para ANTES de correr y sugiere el bueno', `
tipo Cliente { nombre: texto }
imprimir("antes")
fijo c = Cliente("Ana")
imprimir(c.nombr)`, '¿querías decir «nombre»?', 'tipos');
falla('el constructor comprueba el tipo de cada campo', PUNTO + `
var p = Punto("uno", 2.0)`, 'argumento 1: se esperaba real y llegó texto', 'tipos');
falla('el constructor comprueba cuántos campos', PUNTO + `
var p = Punto(1.0)`, 'espera 2 argumento(s)', 'tipos');
falla('asignar a un campo comprueba su tipo', PUNTO + `
var p = Punto(1.0, 2.0)
p.x = "uno"`, '«Punto.x» es real y se le asigna texto', 'tipos');
falla('un Punto no vale donde se espera otro registro', PUNTO + `
tipo Color { r: real
  g: real }
fn rojo(c: Color): real { devolver c.r }
imprimir(rojo(Punto(1.0, 2.0)))`, 'se esperaba Color y llegó Punto', 'tipos');
falla('un método inexistente', PUNTO + `
imprimir(Punto(1.0, 2.0).girar())`, '«Punto» no tiene «girar»', 'tipos');
falla('los métodos se comprueban como funciones', PUNTO + `
imprimir(Punto(1.0, 2.0).distancia(3))`, 'se esperaba Punto y llegó entero', 'tipos');
falla('un método no se reasigna', PUNTO + `
var p = Punto(1.0, 2.0)
p.mover = 3`, 'es un método', 'tipos');
falla('«yo» es fijo dentro del método', `
tipo A { v }
fn A.f() { yo = A(2) }`, 'fijo', 'tipos');
falla('sin el tipo a la vista, el error sale al correr y también lo explica', `
tipo A { v }
fn leer(x) { devolver x.w }
imprimir(leer(A(1)))`, '«A» no tiene «w»', 'ejecución');
falla('y escribir un campo que no existe, también al correr', `
tipo A { v }
fn poner(x) { x.w = 1 }
poner(A(1))`, '«A» no tiene el campo «w»', 'ejecución');
falla('«tipo» solo en el nivel superior', `fn f() {
  tipo A { v }
}`, 'nivel superior', 'sintaxis');
falla('un campo repetido', `tipo A { v
  v }`, 'está dos veces', 'sintaxis');
falla('«yo» no se declara a mano', `tipo A { v }
fn A.f(yo) { }`, 'ya es el registro', 'sintaxis');
falla('un método y un campo no se llaman igual', `tipo A { v }
fn A.v() { devolver 1 }`, 'no pueden llamarse igual', 'tipos');
falla('un registro no puede llamarse como un tipo de Ñ', `tipo texto { v }`, 'ya es un tipo de Ñ', 'sintaxis');

mismo('registros y métodos con y sin JIT', PUNTO + `
fn camino(ps) {
  var t = 0.0
  para i en rango(1, longitud(ps)) { t = t + ps[i - 1].distancia(ps[i]) }
  devolver t
}
var ps = []
para i en rango(50) { agregar(ps, Punto(real(i), real(i % 3))) }
var r = 0.0
repetir 50 { r = camino(ps) }
imprimir(r)`);

// ══════════════════════════════ 2. si … entonces … sino … como expresión
ok('«si» que da un valor', `fn signo(n) { devolver si n > 0 entonces "+" sino si n < 0 entonces "-" sino "0" }
imprimir(signo(3), signo(-1), signo(0))`, '+ - 0');
ok('solo se evalúa la rama que toca', `var n = 0
fn efecto() { n = n + 1
  devolver 1 }
fijo a = si cierto entonces 5 sino efecto()
fijo b = si falso entonces efecto() sino 6
imprimir(a, b, n)`, '5 6 0');
ok('dentro de una interpolación', `fijo n = 2
imprimir("hay {n} {si n == 1 entonces "caja" sino "cajas"}")`, 'hay 2 cajas');
ok('el tipo de la expresión se conoce: se puede sumar', `fijo x: entero = si 1 < 2 entonces 10 sino 20
imprimir(x + 1)`, '11');
falla('sin «sino» no es un valor', `var x = si cierto entonces 1`, 'necesita su «sino»', 'sintaxis');
falla('sin «entonces», el mensaje enseña la forma', `var x = si cierto 1 sino 2`, 'entonces', 'sintaxis');
mismo('«si» expresión con y sin JIT', `fn clasificar(xs) {
  var c = []
  para x en xs { agregar(c, si x % 15 == 0 entonces "fb" sino si x % 3 == 0 entonces "f" sino si x % 5 == 0 entonces "b" sino x) }
  devolver c
}
var r = []
repetir 45 { r = clasificar(rango(1, 31)) }
imprimir(r)`);

// ══════════════════════════════ 3. ?? y ?.
ok('«??» da el de la derecha solo si el de la izquierda es nulo', `var a = nulo
imprimir(a ?? 5, 0 ?? 5, falso ?? 5, "" ?? 5, nulo ?? nulo ?? 7)`, '5 0 falso  7');
ok('«??» evalúa la izquierda una sola vez', `var n = 0
fn f() { n = n + 1
  devolver nulo }
fijo x = f() ?? 3
imprimir(x, n)`, '3 1');
ok('«?.» da nulo si el objeto es nulo', `tipo A { v }
var a = nulo
imprimir(a?.v, A(3)?.v, {"k": 1}?.k)`, 'nulo 3 1');
ok('«?.» y «??» juntos', `tipo Cliente { correo }
fn correo(c) { devolver c?.correo ?? "sin correo" }
imprimir(correo(nulo), correo(Cliente("a@b.co")), correo(Cliente(nulo)))`, 'sin correo a@b.co sin correo');
ok('«?» suelto sigue sin ser nada', ``, '');
falla('el ternario con «?» de C sigue sin existir', `var x = cierto ? 1 : 2`, 'carácter inesperado', 'léxico');
mismo('«??» y «?.» con y sin JIT', `tipo N { v
  sig }
fn sumar(n) {
  var s = 0
  var x = n
  mientras x != nulo { s = s + (x?.v ?? 0)
    x = x?.sig }
  devolver s
}
var lista: cualquiera = nulo
para i en rango(30) { lista = N(si i % 4 == 0 entonces nulo sino i, lista) }
var r = 0
repetir 50 { r = sumar(lista) }
imprimir(r)`);

// ══════════════════════════════ 4. desestructurar
ok('una lista en varias variables', `var [a, b, c] = [1, "dos", 3.5]
imprimir(a, b, c)`, '1 dos 3.5');
ok('un registro o un diccionario por sus nombres', `tipo P { x
  y }
fijo {x, y} = P(3, 4)
var {nombre, edad} = {"nombre": "Ana", "edad": 30}
imprimir(x, y, nombre, edad)`, '3 4 Ana 30');
ok('la expresión se evalúa una vez', `var n = 0
fn par() { n = n + 1
  devolver [n, n * 10] }
var [a, b] = par()
imprimir(a, b, n)`, '1 10 1');
ok('dentro de una función y de un bucle', `fn sumas(ps) { var t = 0
  para p en ps { fijo [a, b] = p
    t = t + a * b }
  devolver t }
imprimir(sumas([[1, 2], [3, 4]]))`, '14');
ok('con anotación de tipo', `fijo [a: entero, b: texto] = [1, "x"]
imprimir(a, b)`, '1 x');
falla('el tipo anotado se comprueba', `tipo P { x: real }
fijo {x: texto} = P(1.0)`, 'se declaró como texto pero recibe real', 'tipos');
falla('una lista corta da el error del índice', `var [a, b, c] = [1, 2]`, 'fuera de rango', 'ejecución');
falla('fijo sigue siendo fijo', `fijo [a, b] = [1, 2]
a = 3`, 'fijo', 'tipos');
mismo('desestructurar con y sin JIT', `fn f(pares) { var s = 0
  para p en pares { var [a, b] = p
    var {k, v} = {"k": a, "v": b}
    s = s + k * v }
  devolver s }
var r = 0
repetir 50 { r = f([[1, 2], [3, 4], [5, 6]]) }
imprimir(r)`);

// ══════════════════════════════ 5. segun
ok('segun con varios valores por caso y «otro»', `fn dia(n) { var r = ""
  segun n {
    caso 1, 7 { r = "fin de semana" }
    caso 2 { r = "lunes" }
    otro { r = "entre semana" }
  }
  devolver r }
imprimir(dia(1), dia(7), dia(2), dia(4))`, 'fin de semana fin de semana lunes entre semana');
ok('segun con textos, sin «otro», y sin caída de un caso al siguiente', `fn f(x) { var r = []
  segun x { caso "a" { agregar(r, 1) }
    caso "b" { agregar(r, 2) } }
  devolver r }
imprimir(f("a"), f("b"), f("z"))`, '[1] [2] []');
ok('la expresión del segun se evalúa una vez', `var n = 0
fn v() { n = n + 1
  devolver 3 }
segun v() { caso 1 { } caso 2 { } caso 3 { imprimir("tres") } }
imprimir(n)`, 'tres\n1');
ok('«romper» dentro de un segun sale del bucle de fuera', `var vistos = []
para i en rango(10) { segun i { caso 4 { romper } otro { agregar(vistos, i) } } }
imprimir(vistos)`, '[0, 1, 2, 3]');
ok('«segun», «caso» y «otro» siguen valiendo como nombres', `var segun = 1
var caso = 2
fn otro(x) { devolver x }
imprimir(segun + caso, otro(3))`, '3 3');
falla('dentro de segun solo va caso u otro', `segun 1 { imprimir(1) }`, 'va «caso …» u «otro»', 'sintaxis');
falla('«otro» va al final', `segun 1 { otro { } caso 1 { } }`, 'al final', 'sintaxis');
mismo('segun con y sin JIT', `fn contar(xs) { var a = 0
  var b = 0
  var c = 0
  para x en xs { segun x % 3 { caso 0 { a = a + 1 } caso 1 { b = b + 1 } otro { c = c + 1 } } }
  devolver [a, b, c] }
var r = []
repetir 50 { r = contar(rango(100)) }
imprimir(r)`);

// ══════════════════════════════ 6. el bytecode no cambió
{
  const { m } = corre('fijo x = 1');
  const E = globalThis.EspanolLike;
  const a = m.analizar(PUNTO + `imprimir(Punto(1.0, 2.0).distancia(Punto(4.0, 6.0)), si cierto entonces 1 sino 2, nulo ?? 3)`);
  let ok2 = a.ok, txt = '';
  if (ok2) {
    const b = E.serializar(a.fn);
    const fn2 = E.deserializar(b);
    const out = [];
    const m2 = E.crearMotor({ salida: s => out.push(s) });
    const r = m2.correr ? m2.correr(fn2, [], []) : null;
    txt = out.join('|');
    ok2 = r && r.ok && txt === '5 1 3';
  }
  if (ok2) pasan++; else { fallan++; fallos.push(`✗ un programa con registros, «si» expresión y «??» viaja en .elb y corre igual\n    → ${txt}`); }
}

console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
