// 4.1 · fase R1 (rendimiento): a[i] en arreglos, «para i en rango(…)»
// sin construir la lista, a[i] rápido en listas, agregar en línea y la
// autollamada directa.
//
// La regla de esta suite es la misma que la del JIT de cierres: el intérprete
// es la implementación de referencia. Casi todo se corre dos veces, con JIT y
// sin JIT, y la salida —o el ERROR— tiene que ser idéntica carácter por
// carácter. Y si el JIT no compiló nada, la prueba no probó nada y lo dice.
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let pasan = 0, fallan = 0;
const fallos = [];
const notas = [];

function corre(src, opts) {
  const out = [];
  const m = crearMotor(Object.assign({ salida: s => out.push(s), limiteInstr: 2e8 }, opts || {}));
  const r = m.ejecutar(src);
  return { r, out, m };
}
// La traza («en f (línea 2)») se quita al comparar: una función compilada por
// el JIT no deja marco en la pila de la VM, así que con JIT la traza sale más
// corta. Eso ya pasaba en el motor LTS (comprobado el 16-oct con el mismo
// programa) y no es de esta fase; el MENSAJE sí tiene que ser idéntico.
const sinTraza = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n');
const msgDe = r => sinTraza(r.errores.map(e => e.formato ? e.formato() : e.message).join(' | '));

function ok(nombre, src, esperado, opts) {
  const { r, out } = corre(src, opts);
  if (!r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    ERROR: ${msgDe(r)}`); return; }
  const got = out.join('\n');
  if (got !== esperado) { fallan++; fallos.push(`✗ ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(got)}`); return; }
  pasan++;
}
function falla(nombre, src, fragmento, opts) {
  const { r } = corre(src, opts);
  if (r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y el programa corrió bien`); return; }
  const msg = msgDe(r);
  if (fragmento && !msg.toLowerCase().includes(fragmento.toLowerCase())) {
    fallan++; fallos.push(`✗ ${nombre}\n    el error no menciona «${fragmento}»\n    dijo: ${msg}`); return;
  }
  pasan++;
}
function comprobar(nombre, cond, extra) {
  if (cond) { pasan++; return; }
  fallan++; fallos.push(`✗ ${nombre}` + (extra !== undefined ? `\n    → ${String(extra).slice(0, 300)}` : ''));
}

// Con y sin JIT: misma salida, y si los dos fallan, el mismo mensaje.
function mismo(nombre, src, { exigeJIT = true, opts = {} } = {}) {
  const con = corre(src, Object.assign({ jit: true }, opts));
  const sin = corre(src, Object.assign({ jit: false }, opts));
  const a = sin.r.ok ? 'ok:' + sin.out.join('\n') : 'error:' + sin.out.join('\n') + '|' + msgDe(sin.r);
  const b = con.r.ok ? 'ok:' + con.out.join('\n') : 'error:' + con.out.join('\n') + '|' + msgDe(con.r);
  if (a !== b) {
    fallan++; fallos.push(`✗ ${nombre}\n    sin JIT: ${JSON.stringify(a).slice(0, 400)}\n    con JIT: ${JSON.stringify(b).slice(0, 400)}`);
    return null;
  }
  if (exigeJIT && con.r.stats && con.r.stats.jitCompiladas < 1) {
    fallan++; fallos.push(`✗ ${nombre}\n    coinciden, pero el JIT no compiló NADA: la prueba no prueba nada`);
    return null;
  }
  pasan++;
  return con;
}
// El código que generó el JIT para una función, para mirar qué atajo tomó.
function fuenteJIT(src, nombre) {
  const { m } = corre(src, { jit: true });
  const g = m.vm.globals.get(nombre);
  return g && g.fn ? (g.fn.jitSrc || '') : '';
}

// ═══════════════════════════════════════════ 1. a[i] en arreglos
const U = 'usar arreglo, forma, ceros, elemento, aListaA, trozo de "numerico"\n';

ok('a[i] lee un arreglo de 1 dimensión', U + `
fijo a = arreglo([10, 20, 30])
imprimir(a[0], a[2], a[-1], a[-3])`, '10 30 30 10');
ok('a[i] = v escribe y lo ve elemento()', U + `
var a = arreglo([1.5, 2.5, 3.5])
a[1] = 9
a[-1] = 7.25
imprimir(elemento(a, 1), elemento(a, 2), a[0])`, '9 7.25 1.5');
ok('a[i] en 2 dimensiones da la fila, y a[i][j] el número', U + `
fijo m = arreglo([[1, 2, 3], [4, 5, 6]])
imprimir(forma(m[1]), m[1][2], m[0][0], m[-1][-1])`, '[3] 6 1 6');
ok('escribir en la fila (una vista) cambia el original, como en NumPy', U + `
var m = arreglo([[1, 2], [3, 4]])
var f = m[1]
f[0] = 30
imprimir(elemento(m, 1, 0), aListaA(m))`, '30 [[1, 2], [30, 4]]');
ok('longitud(a) es el primer eje', U + `
imprimir(longitud(arreglo([1, 2, 3, 4])), longitud(arreglo([[1, 2, 3], [4, 5, 6]])))`, '4 2');
ok('para x en arreglo recorre el primer eje', U + `
var s = 0
para x en arreglo([1, 2, 3, 4]) { s = s + x }
var filas = 0
para f en arreglo([[1, 2], [3, 4], [5, 6]]) { filas = filas + f[1] }
imprimir(s, filas)`, '10 12');
ok('un arreglo entero trunca al escribir, igual que ponerElemento', U + `
var a = arreglo([1, 2, 3], "entero")
a[0] = 7.9
imprimir(a[0])`, '7');
falla('a[i] fuera de rango lo dice con el tamaño del eje', U + `
fijo a = arreglo([1, 2, 3])
imprimir(a[3])`, 'el eje 0 del arreglo mide 3');
falla('a[1.5] no es un índice', U + `
fijo a = arreglo([1, 2, 3])
imprimir(a[1.5])`, 'debe ser un entero');
falla('a[i] = v en 2 dimensiones pide bajar hasta el número', U + `
var m = arreglo([[1, 2], [3, 4]])
m[0] = 5`, 'a[i][j] = v');
falla('a[i] = "texto" se rechaza: en un arreglo solo entran números', U + `
var a = arreglo([1, 2, 3])
a[0] = "x"`, 'debe ser un número');
falla('el verificador sigue exigiendo índice numérico', U + `
fijo a = arreglo([1, 2, 3])
imprimir(a["x"])`, 'el índice de un arreglo debe ser entero');
falla('un número sigue sin poder indexarse', `
fijo n = 5
imprimir(n[0])`, 'no se puede indexar');
mismo('a[i] y para-en-arreglo dan lo mismo con y sin JIT', U + `
fn suma(a) {
  var s = 0
  para i en rango(longitud(a)) { s = s + a[i] }
  para x en a { s = s + x }
  devolver s
}
fijo a = arreglo([1, 2, 3, 4, 5])
var t = 0
repetir 60 { t = t + suma(a) }
imprimir(t)`);

// ═══════════════════════════════════════════ 2. para i en rango(…) sin lista
const casosRango = [
  ['un argumento', 'rango(5)'],
  ['dos argumentos', 'rango(2, 7)'],
  ['paso positivo', 'rango(1, 20, 3)'],
  ['paso negativo', 'rango(10, 0, -3)'],
  ['paso fraccionario (la acumulación tiene que ser la misma)', 'rango(0, 1, 0.1)'],
  ['vacío', 'rango(0)'],
  ['vacío al revés', 'rango(5, 2)'],
  ['negativo', 'rango(-3)'],
  ['límite real', 'rango(2.5)'],
];
for (const [qué, r] of casosRango) {
  mismo(`para en ${r}: ${qué}`, `
fn f() {
  var vistos = []
  para i en ${r} { agregar(vistos, i) }
  devolver vistos
}
imprimir(f())
imprimir(f())`);
}
for (const [qué, r, frag] of [
  ['paso 0', 'rango(0, 5, 0)', 'el paso no puede ser 0'],
  ['más de 5 millones', 'rango(6000000)', '5 millones'],
  ['cuatro argumentos', 'rango(1, 2, 3, 4)', 'acepta 1, 2 o 3'],
]) {
  const r1 = corre(`fn f() { para i en ${r} { imprimir(i) } }\nf()`, { jit: true });
  const r2 = corre(`fn f() { para i en ${r} { imprimir(i) } }\nf()`, { jit: false });
  comprobar(`para en rango con ${qué}: el mismo error con y sin JIT`,
    !r1.r.ok && !r2.r.ok && msgDe(r1.r) === msgDe(r2.r) && msgDe(r1.r).includes(frag), msgDe(r1.r) + ' ⟷ ' + msgDe(r2.r));
}
mismo('reasignar la variable del bucle no cambia las vueltas', `
fn f() {
  var n = 0
  para i en rango(5) { i = i + 100  n = n + 1 }
  devolver n
}
imprimir(f())`);
mismo('romper y continuar dentro de un rango compilado', `
fn f() {
  var s = 0
  para i en rango(100) {
    si i % 2 == 0 { continuar }
    si i > 20 { romper }
    s = s + i
  }
  devolver s
}
imprimir(f())`);
mismo('un cierre por vuelta captura su propia i', `
fn f() {
  var fs = []
  para i en rango(4) { agregar(fs, funcion() { devolver i * 10 }) }
  var out = []
  para g en fs { agregar(out, g()) }
  devolver out
}
imprimir(f())`);
comprobar('el atajo de rango de verdad se toma (no se construye la lista)',
  /prepararRango/.test(fuenteJIT(`fn f() { var s = 0\n para i en rango(10) { s = s + i }\n devolver s }\nimprimir(f())`, 'f')));
comprobar('si un programa tapa «rango» con su fn, el JIT NO toma el atajo',
  !/prepararRango/.test(fuenteJIT(`fn rango(n) { devolver [1, 2] }\nfn f() { var s = 0\n para i en rango(10) { s = s + i }\n devolver s }\nimprimir(f())`, 'f')));
mismo('y con «rango» tapado el resultado es el de la función del programa', `
fn rango(n) { devolver [7, 8] }
fn f() { var s = 0
  para i en rango(10) { s = s + i }
  devolver s }
imprimir(f())`);

// ═══════════════════════════════════════════ 3. a[i] rápido en listas
mismo('índices normales, negativos, en el borde y de texto', `
fn f(l, t) {
  var out = []
  para k en [0, 1, 2, -1, -3] { agregar(out, l[k]) }
  agregar(out, t[1])
  agregar(out, t[-1])
  devolver out
}
var r = []
repetir 50 { r = f([10, 20, 30], "hola") }
imprimir(r)`);
for (const [qué, idx, frag] of [
  ['fuera de rango', '3', 'fuera de rango'],
  ['negativo fuera de rango', '-4', 'fuera de rango'],
  ['no entero', '1.5', 'fuera de rango'],
  ['un texto como índice', '"a"', 'debe ser un número'],
]) {
  const src = `fn f(l, i) { var x = 0\n para k en rango(1) { x = l[i] }\n devolver x }\nimprimir(f([10, 20, 30], ${idx}))`;
  const a = corre(src, { jit: true }), b = corre(src, { jit: false });
  comprobar(`a[i] en lista, ${qué}: el mismo error con y sin JIT`,
    !a.r.ok && !b.r.ok && msgDe(a.r) === msgDe(b.r) && msgDe(a.r).includes(frag), msgDe(a.r) + ' ⟷ ' + msgDe(b.r));
}
mismo('escribir l[i] = v, negativos y diccionarios', `
fn f() {
  var l = [1, 2, 3]
  var d = {"a": 1}
  para k en rango(3) { l[k] = l[k] * 10 }
  l[-1] = 99
  d["b"] = 2
  d["a"] = l[0]
  devolver [l, d]
}
imprimir(f())`);
mismo('el orden de evaluación al escribir es objeto, índice, valor', `
var traza = []
fn o(l) { agregar(traza, "o")  devolver l }
fn i() { agregar(traza, "i")  devolver 0 }
fn v() { agregar(traza, "v")  devolver 5 }
fn f() {
  var l = [1, 2]
  para k en rango(2) { o(l)[i()] = v() }
  devolver l
}
imprimir(f(), traza)`);
mismo('para x en lista que se acorta mientras se recorre', `
fn f() {
  var l = [1, 2, 3, 4]
  var out = []
  para x en l { agregar(out, x)  si x == 2 { quitar(l, 4) } }
  devolver out
}
imprimir(f())`);

// ═══════════════════════════════════════════ 4. agregar en línea
mismo('agregar(l, x) en línea devuelve la lista, como la nativa', `
fn f() {
  var l = []
  para i en rango(5) { fijo r = agregar(l, i * i)  si i == 4 { imprimir(longitud(r)) } }
  devolver l
}
imprimir(f())`);
{
  const src = `fn f(x) { para i en rango(1) { agregar(x, 1) } }\nf(5)`;
  const a = corre(src, { jit: true }), b = corre(src, { jit: false });
  comprobar('agregar a algo que no es lista: el mismo error con y sin JIT',
    !a.r.ok && !b.r.ok && msgDe(a.r) === msgDe(b.r), msgDe(a.r) + ' ⟷ ' + msgDe(b.r));
}
mismo('agregar con tres argumentos sigue yendo por la nativa', `
fn f() { var l = []
  para i en rango(3) { agregar(l, i, i + 10) }
  devolver l }
imprimir(f())`);
comprobar('si el programa tapa «agregar», no se mete en línea',
  !/items\.push/.test(fuenteJIT(`fn agregar(l, x) { devolver l }\nfn f() { var l = []\n para i en rango(3) { agregar(l, i) }\n devolver l }\nimprimir(f())`, 'f')));

// ═══════════════════════════════════════════ 5. la autollamada directa
mismo('fib con autollamada directa', `
fn fib(n) { si n < 2 { devolver n }
  devolver fib(n - 1) + fib(n - 2) }
imprimir(fib(22), fib(5))`);
comprobar('fib se llama a sí misma derecho (sin yaN)',
  /_yo\$_v\$fib\.call/.test(fuenteJIT(`fn fib(n) { si n < 2 { devolver n }\n devolver fib(n - 1) + fib(n - 2) }\nimprimir(fib(22))`, 'fib')));
{
  const src = `fn sin(n) { devolver sin(n + 1) }\nrepetir 45 { }\nimprimir(sin(0))`;
  const a = corre(src, { jit: true, umbralJIT: 1 }), b = corre(src, { jit: false });
  comprobar('una recursión sin caso base da el error de Ñ con y sin JIT',
    !a.r.ok && !b.r.ok && /desbordamiento de pila/.test(msgDe(a.r)) && /desbordamiento de pila/.test(msgDe(b.r)),
    msgDe(a.r) + ' ⟷ ' + msgDe(b.r));
}
mismo('recursión mutua sigue por el camino de siempre', `
fn par(n) { si n == 0 { devolver cierto }
  devolver impar(n - 1) }
fn impar(n) { si n == 0 { devolver falso }
  devolver par(n - 1) }
var r = []
para k en rango(60) { agregar(r, par(k)) }
imprimir(r[59], r[58])`);
mismo('un parámetro con el mismo nombre que la función no tapa la autollamada', `
fn f(f) { si f <= 0 { devolver 0 }
  devolver 1 + f(f - 1) }
var t = 0
repetir 50 { t = f(10) }
imprimir(t)`, { exigeJIT: false });

// ═══════════════════════════════════════════ 6. programas al azar
// 2.000 programas con listas, índices, rangos y bucles. Cada uno corre con y
// sin JIT y la salida —o el error— tiene que coincidir.
{
  let semilla = 20261016;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const de = xs => xs[Math.floor(azar() * xs.length)];
  const ent = (a, b) => a + Math.floor(azar() * (b - a + 1));
  const rangoAz = () => de([`rango(${ent(-2, 8)})`, `rango(${ent(-3, 3)}, ${ent(-2, 9)})`,
    `rango(${ent(-5, 5)}, ${ent(-5, 12)}, ${de([-3, -2, -1, 1, 2, 3, 0.5])})`, 'l', 'rango(longitud(l))']);
  const expr = () => de(['i', 'i * 2', 's', 'l[0]', 'l[-1]', `l[${ent(-4, 6)}]`, 'longitud(l)', 's % 7', 'i - s']);
  const sentencia = prof => {
    const r = azar();
    if (prof > 2 || r < 0.35) return de([`s = s + ${expr()}`, `agregar(l, ${expr()})`, `l[${ent(-3, 4)}] = ${expr()}`, `s = s - 1`]);
    if (r < 0.7) return `para i en ${rangoAz()} {\n${cuerpo(prof + 1)}\n}`;
    if (r < 0.85) return `si ${expr()} > ${ent(-2, 5)} {\n${cuerpo(prof + 1)}\n}`;
    return `si longitud(l) > ${ent(5, 40)} { romper }`;
  };
  const cuerpo = prof => Array.from({ length: ent(1, 3) }, () => sentencia(prof)).join('\n');
  let iguales = 0, distintos = 0, conError = 0, porLimite = 0;
  const ejemplos = [];
  for (let k = 0; k < 2000; k++) {
    const src = `fn f() {\n  var s = 0\n  var i = 0\n  var l = [${ent(1, 4)}, ${ent(0, 9)}, ${ent(-5, 5)}]\n  para vuelta en rango(3) {\n${cuerpo(0)}\n  }\n  devolver [s, longitud(l), l]\n}\nimprimir(f())\nimprimir(f())`;
    const a = corre(src, { jit: true, limiteInstr: 2e6 }), b = corre(src, { jit: false, limiteInstr: 2e6 });
    const ka = a.r.ok ? a.out.join('\n') : 'E:' + msgDe(a.r), kb = b.r.ok ? b.out.join('\n') : 'E:' + msgDe(b.r);
    // El presupuesto de instrucciones NO es igual con y sin JIT, y eso viene
    // de la 4.0: el intérprete cobra cada instrucción de bytecode y el código
    // compilado cobra una por vuelta de bucle. Un programa que agota el
    // presupuesto en un lado puede terminar en el otro. Esos casos se cuentan
    // aparte y no se comparan (comprobado con el mismo generador sobre la 4.0).
    if (/límite de [\d.]+ instrucciones/.test(ka + kb)) { porLimite++; continue; }
    if (!b.r.ok) conError++;
    if (ka === kb) iguales++;
    else { distintos++; if (ejemplos.length < 3) ejemplos.push(`${src}\n  sin JIT: ${kb.slice(0, 200)}\n  con JIT: ${ka.slice(0, 200)}`); }
  }
  notas.push(`  azar: ${iguales} iguales · ${distintos} distintos · ${porLimite} apartados por el presupuesto`);
  comprobar(`2.000 programas al azar: con y sin JIT dan lo mismo (${iguales} iguales, ${conError} de ellos terminan en el mismo error, ${porLimite} apartados por el presupuesto)`,
    distintos === 0, ejemplos.join('\n---\n'));
}

// ───────────────────────────────────────────── resultados
console.log('');
for (const f of fallos) console.log(f);
for (const l of notas) console.log(l);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
