require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let pasan = 0, fallan = 0;
const fallos = [];

function corre(src, opts) {
  const out = [];
  const m = crearMotor(Object.assign({ salida: s => out.push(s), limiteInstr: 2e8 }, opts || {}));
  const r = m.ejecutar(src);
  return { r, out, m };
}

function ok(nombre, src, esperado, opts) {
  const { r, out } = corre(src, opts);
  if (!r.ok) {
    fallan++; fallos.push(`✗ ${nombre}\n    ERROR: ${r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')}`);
    return;
  }
  const got = out.join('\n');
  if (got !== esperado) {
    fallan++; fallos.push(`✗ ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(got)}`);
    return;
  }
  pasan++;
}

// Para lo que no se comprueba corriendo un programa y mirando su salida, sino
// mirando por dentro del motor. Es lo que hacía falta para el JIT atado.
function comprobar(nombre, cond, extra) {
  if (cond) { pasan++; return; }
  fallan++; fallos.push(`✗ ${nombre}` + (extra !== undefined ? `\n    → ${String(extra).slice(0, 200)}` : ''));
}

function falla(nombre, src, fragmento, opts) {
  const { r } = corre(src, opts);
  if (r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y el programa corrió bien`); return; }
  const msg = r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ');
  if (fragmento && !msg.toLowerCase().includes(fragmento.toLowerCase())) {
    fallan++; fallos.push(`✗ ${nombre}\n    el error no menciona «${fragmento}»\n    dijo: ${msg}`);
    return;
  }
  pasan++;
}

// ───────────────────────────────────────────── 1. básicos
ok('hola mundo', `imprimir("Hola Mundo")`, 'Hola Mundo');
ok('aritmética', `imprimir(2 + 3 * 4)`, '14');
ok('precedencia paréntesis', `imprimir((2 + 3) * 4)`, '20');
ok('potencia derecha', `imprimir(2 ** 3 ** 2)`, '512');
ok('división real', `imprimir(7 / 2)`, '3.5');
ok('división entera', `imprimir(7 // 2)`, '3');
ok('módulo', `imprimir(7 % 3)`, '1');
ok('módulo negativo', `imprimir(-1 % 3)`, '2');
ok('unario', `imprimir(-5 + 3)`, '-2');
ok('comparaciones', `imprimir(3 < 5, 5 <= 5, 3 > 5, 2 != 3)`, 'cierto cierto falso cierto');
ok('lógicos', `imprimir(cierto y falso, cierto o falso, no cierto)`, 'falso cierto falso');
ok('cortocircuito y', `var n = 0
fn efecto() { n = n + 1  devolver cierto }
si falso y efecto() { }
imprimir(n)`, '0');
ok('concatenar texto', `imprimir("a" + "b" + "c")`, 'abc');
ok('interpolación', `var n = "mundo"  var k = 3
imprimir("Hola {n}, {k * 2} veces")`, 'Hola mundo, 6 veces');
ok('escapes', `imprimir("a\\tb")`, 'a\tb');

// ───────────────────────────────────────────── 2. variables
ok('var y reasignación', `var x = 1  x = x + 1  imprimir(x)`, '2');
ok('operador +=', `var x = 10  x += 5  x *= 2  imprimir(x)`, '30');
ok('ámbito de bloque', `var x = 1
{ var x = 2  imprimir(x) }
imprimir(x)`, '2\n1');
falla('fijo no se reasigna', `fijo x = 1  x = 2`, 'fijo');
falla('variable no definida', `imprimir(noExiste)`, 'no está definida');
ok('sugerencia de nombre', `var contador = 1`, '');

// ───────────────────────────────────────────── 3. control de flujo
ok('si/sino', `si 3 > 2 { imprimir("sí") } sino { imprimir("no") }`, 'sí');
ok('sino si', `var x = 5
si x > 10 { imprimir("grande") } sino si x > 3 { imprimir("medio") } sino { imprimir("chico") }`, 'medio');
ok('mientras', `var i = 0
mientras i < 3 { imprimir(i)  i = i + 1 }`, '0\n1\n2');
ok('repetir', `repetir 3 veces { imprimir("x") }`, 'x\nx\nx');
ok('para en lista', `para x en [10, 20, 30] { imprimir(x) }`, '10\n20\n30');
ok('para en rango', `para i en rango(3) { imprimir(i) }`, '0\n1\n2');
ok('para en texto', `para c en "abc" { imprimir(c) }`, 'a\nb\nc');
ok('romper', `para i en rango(10) { si i == 3 { romper }  imprimir(i) }`, '0\n1\n2');
ok('continuar', `para i en rango(5) { si i % 2 == 0 { continuar }  imprimir(i) }`, '1\n3');
ok('continuar en mientras', `var i = 0
mientras i < 5 { i = i + 1  si i % 2 == 0 { continuar }  imprimir(i) }`, '1\n3\n5');
ok('romper en mientras', `var i = 0
mientras cierto { i = i + 1  si i > 3 { romper } }
imprimir(i)`, '4');
ok('anidados', `para i en rango(3) { para j en rango(2) { imprimir("{i}{j}") } }`, '00\n01\n10\n11\n20\n21');
ok('pila limpia tras bucles', `repetir 100 veces { var z = 1 }
para i en rango(100) { var q = i }
imprimir("ok")`, 'ok');

// ───────────────────────────────────────────── 4. funciones
ok('función simple', `fn doble(x) { devolver x * 2 }
imprimir(doble(21))`, '42');
ok('definir (sinónimo)', `definir saludar(nombre) { devolver "Hola, " + nombre + "!" }
imprimir(saludar("mundo"))`, 'Hola, mundo!');
ok('sin retorno = nulo', `fn nada() { }
imprimir(nada())`, 'nulo');
ok('recursión factorial', `fn fact(n) { si n <= 1 { devolver 1 }  devolver n * fact(n - 1) }
imprimir(fact(10))`, '3628800');
ok('recursión fibonacci', `fn fib(n) { si n < 2 { devolver n }  devolver fib(n-1) + fib(n-2) }
imprimir(fib(20))`, '6765');
ok('llamada antes de definir', `imprimir(tarde())
fn tarde() { devolver "ok" }`, 'ok');
ok('cierre captura', `fn contador() {
  var n = 0
  devolver fn() { n = n + 1  devolver n }
}
var c = contador()
imprimir(c(), c(), c())`, '1 2 3');
ok('cierres independientes', `fn hacer() { var n = 0  devolver fn() { n = n + 1  devolver n } }
var a = hacer()  var b = hacer()
a()  a()
imprimir(a(), b())`, '3 1');
ok('función de orden superior', `fn aplicar(f, x) { devolver f(x) }
imprimir(aplicar(fn(y) { devolver y * 3 }, 5))`, '15');
falla('aridad incorrecta', `fn f(a, b) { devolver a }
f(1)`, 'espera 2');
falla('llamar a un número', `var x = 5  x()`, 'no es una función');
falla('recursión infinita', `fn f() { devolver f() }  f()`, 'desbordamiento');

// ───────────────────────────────────────────── 5. listas y diccionarios
ok('lista literal e índice', `var l = [1, 2, 3]  imprimir(l[0], l[2])`, '1 3');
ok('índice negativo', `imprimir([1,2,3][-1])`, '3');
ok('asignar por índice', `var l = [1,2,3]  l[1] = 99  imprimir(l)`, '[1, 99, 3]');
ok('longitud', `imprimir(longitud([1,2,3]), longitud("hola"))`, '3 4');
ok('lista de listas', `var m = [[1,2],[3,4]]  imprimir(m[1][0])`, '3');
ok('concatenar listas', `imprimir([1,2] + [3])`, '[1, 2, 3]');
ok('dic literal', `var d = {nombre: "Ana", edad: 25}
imprimir(d["nombre"], d.edad)`, 'Ana 25');
ok('dic asignación', `var d = {}  d["k"] = 1  d.j = 2  imprimir(d)`, '{k: 1, j: 2}');
ok('igualdad estructural', `imprimir([1,2] == [1,2], {a:1} == {a:1})`, 'cierto cierto');
falla('índice fuera de rango', `imprimir([1,2][5])`, 'fuera de rango');
falla('clave inexistente', `var d = {a: 1}  imprimir(d["z"])`, 'no existe');

// ───────────────────────────────────────────── 6. tipos (antes de ejecutar)
falla('tipo incompatible', `var x: entero = "hola"`, 'entero');
falla('suma texto+entero', `var s: texto = "n"  var n: entero = 1  imprimir(s + n)`, 'no se puede sumar');
falla('argumento mal tipado', `fn f(x: entero): entero { devolver x }
f("hola")`, 'argumento 1');
falla('retorno mal tipado', `fn f(): texto { devolver 5 }`, 'devolver texto');
falla('tipo desconocido', `var x: numerito = 1`, 'tipo desconocido');
ok('tipos correctos', `fn suma(a: entero, b: entero): entero { devolver a + b }
imprimir(suma(2, 3))`, '5');
ok('entero encaja en real', `fn f(x: real): real { devolver x * 2 }
imprimir(f(3))`, '6');
ok('gradual: sin anotar todo pasa', `fn f(x) { devolver x + 1 }
imprimir(f(1))`, '2');
ok('lista tipada', `usar suma de "numerico"

var xs: lista<entero> = [1,2,3]
imprimir(suma(xs))`, '6');
// «lista» y «dic» a secas también son tipos. Salió al anotar una función que
// devuelve una estructura de C: decía «esta función debe devolver undefined»,
// porque T.lista y T.dic son constructores y se devolvían sin construir.
ok('lista sin parámetro de tipo', `fn f(): lista { devolver [1, 2] }
imprimir(f())`, '[1, 2]');
ok('dic sin parámetros de tipo', `fn f(): dic { devolver {"a": 1} }
imprimir(f())`, '{a: 1}');
ok('y anotar la variable también', `var d: dic = {"a": 1}
var xs: lista = [1]
imprimir(d, xs)`, '{a: 1} [1]');
falla('pero «lista» a secas sigue rechazando lo que no es lista',
  `fn f(): lista { devolver 1 }`, 'debe devolver lista');
falla('y «dic» a secas lo que no es diccionario',
  `fn f(): dic { devolver 1 }`, 'debe devolver dic');

// ───────────────────────────────────────────── 7. errores en ejecución
falla('división entre cero', `imprimir(1 / 0)`, 'división entre cero');
falla('sumar tipos raros', `var a = [1]  var b = 1  imprimir(a + b)`, 'no se puede sumar');
falla('bucle infinito acotado', `mientras cierto { }`, 'límite');

// ───────────────────────────────────────────── 8. biblioteca
ok('texto()', `imprimir(texto(42) + "!")`, '42!');
ok('entero()', `imprimir(entero("42") + 1, entero(3.9))`, '43 3');
ok('tipo()', `imprimir(tipo(1), tipo(1.5), tipo("a"), tipo(cierto), tipo([1]), tipo({}), tipo(nulo))`,
   'entero real texto bool lista dic nulo');
ok('rango con pasos', `imprimir(rango(1, 10, 3))`, '[1, 4, 7]');
ok('mapear/filtrar/reducir', `var xs = rango(1, 6)
imprimir(mapear(xs, fn(x) { devolver x * x }))
imprimir(filtrar(xs, fn(x) { devolver x % 2 == 0 }))
imprimir(reducir(xs, fn(a, b) { devolver a + b }, 0))`, '[1, 4, 9, 16, 25]\n[2, 4]\n15');
ok('ordenar con clave', `imprimir(ordenar([3,1,2]))
imprimir(ordenar(["aaa","a","aa"], fn(s) { devolver longitud(s) }))`, '[1, 2, 3]\n["a", "aa", "aaa"]');
ok('los errores dentro de una interpolación dan su línea real', `imprimir("a")
imprimir("b")
var d = 0
intentar { imprimir("{100 / d}") } capturar (e) { imprimir(texto(e.linea)) }`, 'a\nb\n4');

// El JIT y el intérprete tienen que dar lo mismo también cuando el primer
// operando no es un número: ahí el cortocircuito del «&&» se comía la
// evaluación del segundo.
// ── el JIT ata las nativas: la misma cuenta, sin buscar el nombre ──────────
// Cuando el destino de una llamada es un global que al compilar ya es una
// nativa de aridad fija, el JIT deja de emitir «rt.call(rt.g("real"), […])» y
// llama derecho. Lo caro que se evita es la búsqueda en el mapa de globales de
// cada llamada; crear el array de argumentos no cuesta nada, porque V8 lo
// deshace. Medido: mandelbrot 300×200 pasó de 57 ms a 29.
//
// Lo que estas pruebas protegen no es la velocidad, es que atar no cambie
// NINGUNA respuesta: mismos resultados, mismos errores, mismas aridades.
ok('JIT atado: una nativa de aridad fija da lo mismo que antes',
  `fn f(x: entero) -> real { devolver real(x) / 2.0 }
var u: real = 0.0
para i en rango(20) { u = f(i) }
imprimir(u)`, '9.5', { umbralJIT: 5 });
ok('JIT atado: una nativa de aridad variable NO se ata, y sigue bien',
  `fn f(a: entero, b: entero) -> entero { devolver maximo(a, b, 7) }
var u: entero = 0
para i en rango(20) { u = f(i, 3) }
imprimir(u)`, '19', { umbralJIT: 5 });
ok('JIT atado: el error de una nativa sigue saliendo, y con su mensaje',
  `fn f(t: texto) -> entero { devolver entero(t) }
var u: entero = 0
para i en rango(20) { u = f("7") }
intentar { imprimir(f("no soy un número")) } capturar (e) { imprimir("cazado:", e.tipo) }`,
  'cazado: motor', { umbralJIT: 5 });
ok('JIT atado: una nativa de eDSL se ata por su nombre completo',
  `usar moneda de "formato"
fn f(n: entero) -> texto { devolver moneda(n) }
var u: texto = ""
para i en rango(20) { u = f(1000) }
imprimir(u)`, '$ 1.000', { umbralJIT: 5 });
// Y lo que de verdad podía romperse: redefinir después un global que el JIT
// había atado. El código generado tendría dentro la nativa de antes, así que la
// VM apunta qué nombres se ataron y al primer cambio tira todo lo compilado.
ok('JIT atado: redefinir la nativa atada cambia el resultado, no lo congela',
  `fn cuenta(l: lista) -> entero { devolver longitud(l) }
var s: entero = 0
para i en rango(20) { s = s + cuenta([1, 2, 3]) }
imprimir(s)`, '60', { umbralJIT: 5 });
{
  // La invalidación, desde dentro: se compila, se cambia el global atado, y se
  // comprueba que lo compilado se tiró. Sin esto la prueba de arriba pasaría
  // igual por el orden en que se definen las funciones, y no probaría nada.
  const { r, m } = (() => {
    const m = crearMotor({ salida: () => {}, umbralJIT: 5 });
    const r = m.ejecutar(`fn cuenta(l: lista) -> entero { devolver longitud(l) }
var s: entero = 0
para i en rango(20) { s = s + cuenta([1, 2, 3]) }`);
    return { r, m };
  })();
  const fn = r.ok && m.vm.globals.get('cuenta') ? m.vm.globals.get('cuenta').fn : null;
  comprobar('JIT atado: se apunta qué globales se ataron',
    !!fn && fn.jitEstado === 'compilada' && m.vm.atados && m.vm.atados.has('longitud'),
    fn ? fn.jitEstado + ' · ' + (m.vm.atados ? [...m.vm.atados].join(',') : 'sin atados') : 'no compiló');
  if (fn) {
    m.vm.olvidarJIT();
    comprobar('JIT atado: cambiar uno de esos globales tira lo compilado',
      fn.jit === null && fn.jitEstado === 'frío' && m.vm.stats.jitOlvidadas === 1,
      `jit=${fn.jit} estado=${fn.jitEstado} olvidadas=${m.vm.stats.jitOlvidadas}`);
  }
}

ok('JIT: concatenar texto con el resultado de una nativa', `fn f(i: entero) -> texto { devolver "a" + texto(i) }
var u: texto = ""
para i en rango(12) { u = f(i) }
imprimir(u)`, 'a11', { umbralJIT: 8 });

ok('JIT: comparar textos', `fn f(i: entero) -> bool { devolver texto(i) < "5" }
var u: bool = falso
para i en rango(12) { u = f(i) }
imprimir(texto(u))`, 'cierto', { umbralJIT: 8 });

ok('JIT: igualdad profunda de listas', `fn f(i: entero) -> bool { devolver [i] == [i] }
var u: bool = falso
para i en rango(12) { u = f(i) }
imprimir(texto(u))`, 'cierto', { umbralJIT: 8 });

ok('JIT: el segundo operando se evalúa siempre', `var c: entero = 0
fn sube() -> entero { c = c + 1
 devolver 1 }
fn f(i: entero) -> texto { devolver "a" + texto(sube()) }
para i en rango(12) { f(i) }
imprimir(texto(c))`, '12', { umbralJIT: 8 });

ok('rellenar alinea sin entrecomillar el texto', `
usar alinearDer de "formato"

imprimir("[" + alinearDer("x", 5, "-") + "]")
imprimir(alinearDer(7, 4, "0"))
imprimir(alinearDer("mas largo que el ancho", 3, " "))`, '[----x]\n0007\nmas largo que el ancho');

ok('texto: mayúsculas y dividir', `usar dividir, mayusculas, unir de "texto"

imprimir(mayusculas("hola"))
imprimir(dividir("a,b,c", ","))
imprimir(unir(["a","b"], "-"))`, 'HOLA\n["a", "b", "c"]\na-b');
ok('matemáticas', `usar absoluto, piso, raiz, redondear, techo de "numerico"

imprimir(raiz(16), absoluto(-3), redondear(3.14159, 2), piso(3.7), techo(3.2))`, '4 3 3.14 3 4');
ok('máximo y mínimo', `usar suma de "numerico"

imprimir(maximo([3,7,2]), minimo(4, 9), suma([1,2,3]))`, '7 4 6');

// ───────────────────────────────────────────── 9. científico
ok('estadística', `usar desviacion, media, mediana, moda, redondear de "numerico"

var d = [2, 4, 4, 4, 5, 5, 7, 9]
imprimir(media(d))
imprimir(mediana(d))
imprimir(moda(d))
imprimir(redondear(desviacion(d), 4))`, '5\n4.5\n4\n2.1381');
ok('percentil', `usar percentil de "numerico"

imprimir(percentil([1,2,3,4,5], 50))`, '3');
ok('correlación perfecta', `usar correlacion de "numerico"

imprimir(correlacion([1,2,3,4], [2,4,6,8]))`, '1');
ok('regresión lineal', `usar regresion de "numerico"

var r = regresion([1,2,3,4], [2,4,6,8])
imprimir(r.pendiente, r.intercepto, r.r2)`, '2 0 1');
ok('normalizar', `usar normalizar de "numerico"

imprimir(normalizar([0, 5, 10]))`, '[0, 0.5, 1]');
ok('histograma', `usar histograma de "numerico"

imprimir(histograma([1,1,2,2,2,3], 3))`, '[2, 3, 1]');
ok('matrices', `usar determinante, multMatriz, transponer de "numerico"

var A = [[1,2],[3,4]]
imprimir(multMatriz(A, [[1,0],[0,1]]))
imprimir(transponer(A))
imprimir(determinante(A))`, '[[1, 2], [3, 4]]\n[[1, 3], [2, 4]]\n-2');
ok('resolver sistema', `usar redondear, resolver de "numerico"

var x = resolver([[2,1],[1,3]], [5,10])
imprimir(redondear(x[0], 6), redondear(x[1], 6))`, '1 3');

// ───────────────────────────────────────────── 10. memoria y GC
ok('el GC libera basura', `repetir 5000 veces { var basura = [1,2,3,4,5] }
var m = memoria()
imprimir(m.recolecciones > 0, m.liberados > 1000)`, 'cierto cierto');
ok('el GC no se lleva lo vivo', `var vivo = []
repetir 3000 veces { agregar(vivo, [1,2,3]) }
recolectar()
imprimir(longitud(vivo), longitud(vivo[0]))`, '3000 3');

// ───────────────────────────────────────────── 11. JIT
(function () {
  const src = `fn fib(n) { si n < 2 { devolver n }  devolver fib(n-1) + fib(n-2) }
imprimir(fib(24))`;
  const conJit = corre(src, { umbralJIT: 5 });
  const sinJit = corre(src, { jit: false });
  const a = conJit.out.join(''), b = sinJit.out.join('');
  if (a !== '46368' || b !== '46368') {
    fallan++; fallos.push(`✗ JIT: resultados distintos → con=${a} sin=${b}`);
  } else if (conJit.r.stats.jitCompiladas < 1) {
    fallan++; fallos.push(`✗ JIT: no compiló ninguna función`);
  } else { pasan++; }
  console.log(`   ⚡ fib(24): intérprete ${sinJit.r.ms.toFixed(0)} ms · JIT ${conJit.r.ms.toFixed(0)} ms ` +
    `→ ×${(sinJit.r.ms / Math.max(conJit.r.ms, 0.01)).toFixed(1)} · compiladas ${conJit.r.stats.jitCompiladas}`);
})();

ok('JIT y bucles dan lo mismo', `fn suma(n) { var t = 0  para i en rango(n) { t = t + i }  devolver t }
var r = 0
repetir 60 veces { r = suma(100) }
imprimir(r)`, '4950', { umbralJIT: 3 });

ok('JIT respeta los errores', `fn f(a, b) { devolver a + b }
var r = 0
repetir 50 veces { r = f(1, 2) }
imprimir(r)`, '3', { umbralJIT: 3 });

(function () {
  const { r } = corre(`fn mala(a) { devolver a / 0 }
repetir 50 veces { mala(1) }`, { umbralJIT: 3 });
  if (r.ok) { fallan++; fallos.push('✗ JIT: la división entre cero no falló'); }
  else pasan++;
})();

// ───────────────────────────────────────────── 12. el ejemplo original de Diego
ok('el ejemplo que no corría antes', `definir saludar(nombre) {
    devolver "Hola, " + nombre + "!"
}
imprimir(saludar("mundo"))`, 'Hola, mundo!');

ok('clase Persona → diccionario', `fn Persona(nombre, edad) {
  devolver {nombre: nombre, edad: edad}
}
fn saludo(p) { devolver "Hola, soy " + p.nombre + " y tengo " + texto(p.edad) + " años" }
imprimir(saludo(Persona("Ana", 25)))`, 'Hola, soy Ana y tengo 25 años');


// ───────────────────────────────────────────── 13. «y» / «o» como nombres
ok('y como variable', `var y = 5  imprimir(y * 2)`, '10');
ok('x e y juntas', `usar raiz de "numerico"

var x = 3  var y = 4  imprimir(raiz(x*x + y*y))`, '5');
ok('y operador tras expresión', `imprimir(3 > 2 y 5 > 4)`, 'cierto');
ok('asignaciones seguidas en una línea', `var x = 1.0  var y = 2.0
fn paso() { var xt = x*x - y*y + 1.0  y = 2.0*x*y  x = xt  devolver x }
imprimir(paso())`, '-2');
ok('operadores && ||', `imprimir(cierto && falso, cierto || falso)`, 'falso cierto');
ok('o como variable', `var o = "hola"  imprimir(o)`, 'hola');
ok('y en índice', `var y = [1,2,3]  y[0] = 9  imprimir(y)`, '[9, 2, 3]');
ok('// es división, no comentario', `imprimir(10 // 3)  # esto sí es comentario`, '3');

// ───────────────────────────────────────────── 14. JIT dentro de nativas
// (regresión: el JIT compilaba la función en plena llamada desde mapear/filtrar
//  y la máquina intentaba leer un marco de pila que nunca se empujó)
for (const u of [1, 3, 8, 40]) {
  ok(`mapear con umbral ${u}`, `imprimir(mapear(rango(1,11), fn(x) { devolver x * x }))`,
     '[1, 4, 9, 16, 25, 36, 49, 64, 81, 100]', { umbralJIT: u });
  ok(`filtrar con umbral ${u}`, `imprimir(filtrar(rango(1,11), fn(x) { devolver x % 2 == 0 }))`,
     '[2, 4, 6, 8, 10]', { umbralJIT: u });
  ok(`reducir con umbral ${u}`, `imprimir(reducir(rango(1,11), fn(a,b) { devolver a * b }, 1))`,
     '3628800', { umbralJIT: u });
  ok(`ordenar por clave con umbral ${u}`,
     `fijo g = [{n:"Ana",e:31},{n:"Luis",e:24},{n:"Sara",e:45}]
para p en ordenar(g, fn(p) { devolver p.e }) { imprimir(p.n) }`, 'Luis\nAna\nSara', { umbralJIT: u });
}
ok('cierre devuelto y llamado muchas veces', `fn acum(ini) { var t = ini  devolver fn(x) { t = t + x  devolver t } }
var c = acum(0)
var u = 0
repetir 60 veces { u = c(1) }
imprimir(u)`, '60', { umbralJIT: 3 });
ok('composición de funciones', `fn componer(f, g) { devolver fn(x) { devolver f(g(x)) } }
var h = componer(fn(x) { devolver x * 2 }, fn(x) { devolver x + 1 })
var r = 0
repetir 50 veces { r = h(5) }
imprimir(r)`, '12', { umbralJIT: 3 });

// ───────────────────────────────────────────── 15. Fase 0 — regresiones

// A-1 · estructuras cíclicas (antes: «Maximum call stack size exceeded»)
ok('dos listas cíclicas se comparan sin colgarse', `var a = [1]
var b = [1]
a[0] = a
b[0] = b
imprimir(a == b)`, 'cierto');
// (a = [a] y b = [b] son la MISMA estructura infinita, así que son iguales;
//  para distinguirlas hace falta un elemento no cíclico que difiera, como en Python)
ok('ciclos iguales con contenido distinto sí se distinguen', `var a = [1, 0]
var b = [2, 0]
a[1] = a
b[1] = b
imprimir(a == b)`, 'falso');
ok('ciclos iguales con el mismo contenido', `var a = [7, 0]
var b = [7, 0]
a[1] = a
b[1] = b
imprimir(a == b)`, 'cierto');
ok('diccionarios cíclicos', `var d = {}
var e = {}
d.yo = d
e.yo = e
imprimir(d == e)`, 'cierto');
ok('ciclo indirecto entre dos listas', `var a = [0]
var b = [0]
a[0] = b
b[0] = a
imprimir(a == b)`, 'cierto');
ok('la comparación normal no se rompió', `imprimir([1,[2,3]] == [1,[2,3]], [1,2] == [1,3], {a:1} == {a:1})`,
   'cierto falso cierto');

// A-2 · el presupuesto de instrucciones alcanza a las nativas
falla('multMatriz respeta el límite', `usar matriz, multMatriz de "numerico"

var A = matriz(220, 220, 1.5)
imprimir(longitud(multMatriz(A, A)))`, 'límite', { limiteInstr: 1e6 });
falla('matriz gigante respeta el límite', `usar matriz de "numerico"

var A = matriz(9000, 9000, 0)
imprimir(longitud(A))`, 'límite', { limiteInstr: 1e6 });
falla('determinante respeta el límite', `usar determinante, matriz de "numerico"

var A = matriz(300, 300, 1)
imprimir(determinante(A))`, 'límite', { limiteInstr: 1e6 });
ok('con presupuesto suficiente sigue funcionando', `usar determinante, multMatriz, transponer de "numerico"

var A = [[1,2],[3,4]]
imprimir(multMatriz(A, [[1,0],[0,1]]))
imprimir(determinante(A))
imprimir(transponer(A))`, '[[1, 2], [3, 4]]\n-2\n[[1, 3], [2, 4]]');

// A-3 · el motor declara si el entorno le permite compilar
(function () {
  const { m } = corre(`imprimir(1)`);
  if (typeof m.vm.jitBloqueado !== 'boolean') {
    fallan++; fallos.push('✗ A-3: vm.jitBloqueado no existe');
  } else if (m.vm.jitBloqueado) {
    fallan++; fallos.push('✗ A-3: en Node el JIT debería estar disponible');
  } else pasan++;
})();

// M-2 · la tabla de constantes sigue deduplicando
ok('constantes iguales comparten entrada', `imprimir(3.5 + 3.5 + 3.5)`, '10.5');
ok('texto y número no se confunden', `imprimir(1 == "1", tipo(1), tipo("1"))`, 'falso entero texto');

// M-6 · el tipo del valor de un diccionario sobrevive al punto
falla('dic<texto,real> accedido con punto conserva el tipo', `usar regresion de "numerico"

var r = regresion([1,2,3], [2,4,6])
var s: texto = r.pendiente`, 'texto');
ok('y el tipo correcto pasa', `usar regresion de "numerico"

var r = regresion([1,2,3], [2,4,6])
var p: real = r.pendiente
imprimir(p)`, '2');


// ───────────────────────────────────────────── nombres de Object.prototype
// La tabla de palabras del lenguaje era un objeto de JavaScript, y un objeto de
// JavaScript hereda de Object.prototype: PALABRAS['toString'] daba algo, así que
// el lexer tomaba por palabra reservada a una docena de nombres razonables y el
// programa fallaba con «falta ( tras <anónima>», que no dice nada. Apareció
// escribiendo una prueba de cierres con una función llamada «constructor».
for (const n of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__',
                 'isPrototypeOf', 'toLocaleString', 'propertyIsEnumerable']) {
  ok(`nombre heredado de Object: «${n}» vale como función`,
    `fn ${n}(x: real): real { devolver x + 1.0 }\nimprimir(${n}(1.0))`, '2');
  ok(`nombre heredado de Object: «${n}» vale como variable`,
    `var ${n}: real = 5.0\nimprimir(${n})`, '5');
}

// ───────────────────────────────────────────── cierres compilados por el JIT
//
// Desde que el JIT compila las funciones anidadas y los cierres que capturan,
// la prueba que vale no es «¿da el número que yo creo?» sino «¿da LO MISMO que
// el intérprete?». El intérprete es la implementación de referencia: lleva
// mucho más tiempo en pie y las 1300 pruebas de arriba lo cubren. Así que cada
// programa se corre dos veces, con JIT y sin JIT, y las dos salidas tienen que
// ser idénticas carácter por carácter. Eso atrapa de una vez las capturas
// compartidas, la variable del bucle, la recursión y el cruce de motores, sin
// que yo tenga que acertar la respuesta de antemano.
//
// Y todos los programas llaman más de 40 veces, que es el umbral, e imprimen
// resultados de ANTES y de DESPUÉS: si el comportamiento cambiara justo en la
// llamada 41 —el fallo más feo que puede tener un JIT, porque no aparece en
// ninguna prueba corta— saldría aquí.
function mismoConYSinJIT(nombre, src) {
  const con = corre(src, { jit: true });
  const sin = corre(src, { jit: false });
  if (!sin.r.ok) {
    fallan++; fallos.push(`✗ ${nombre}\n    sin JIT ya falla: ${sin.r.errores.map(e => e.message).join(' | ')}`);
    return;
  }
  if (!con.r.ok) {
    fallan++; fallos.push(`✗ ${nombre}\n    con JIT falla: ${con.r.errores.map(e => e.message).join(' | ')}`);
    return;
  }
  if (con.out.join('\n') !== sin.out.join('\n')) {
    fallan++; fallos.push(`✗ ${nombre}\n    sin JIT: ${JSON.stringify(sin.out.join('\n')).slice(0, 300)}` +
                          `\n    con JIT: ${JSON.stringify(con.out.join('\n')).slice(0, 300)}`);
    return;
  }
  // Que coincidan no basta: si no compiló nada, la prueba no probó el JIT.
  if (con.r.stats.jitCompiladas < 1) {
    fallan++; fallos.push(`✗ ${nombre}\n    coinciden, pero el JIT no compiló NADA: la prueba no prueba nada`);
    return;
  }
  pasan++;
}

mismoConYSinJIT('cierre: el contador clásico, con estado propio', `
fn contador(): funcion {
    var n: real = 0.0
    fn siguiente(): real { n = n + 1.0  devolver n }
    devolver siguiente
}
var c = contador()
var ultimo: real = 0.0
repetir 100 { ultimo = c() }
imprimir(ultimo)
var otro = contador()
imprimir(otro())
imprimir(ultimo)`);

mismoConYSinJIT('cierre: dos cierres sobre la MISMA variable se ven', `
fn par(): lista {
    var n: real = 0.0
    fn sube(): real { n = n + 1.0  devolver n }
    fn mira(): real { devolver n }
    devolver [sube, mira]
}
var p = par()
var s = p[0]
var m = p[1]
repetir 60 { s() }
imprimir(m())
s()
imprimir(m())`);

mismoConYSinJIT('cierre: la función de fuera ve lo que le escribe el de dentro', `
fn cuenta(): real {
    var total: real = 0.0
    fn suma(x: real) { total = total + x }
    repetir 100 { suma(2.0) }
    devolver total
}
imprimir(cuenta())`);

mismoConYSinJIT('cierre: un parámetro capturado', `
fn multiplicador(k: real): funcion {
    fn por(x: real): real { devolver x * k }
    devolver por
}
var triple = multiplicador(3.0)
var t: real = 0.0
repetir 100 { t = triple(2.0) }
imprimir(t)
imprimir(multiplicador(10.0)(5.0))`);

mismoConYSinJIT('cierre: un parámetro capturado Y reasignado dentro', `
fn acumulador(k: real): funcion {
    fn sigue(x: real): real { k = k + x  devolver k }
    devolver sigue
}
var a = acumulador(0.0)
var u: real = 0.0
repetir 100 { u = a(1.0) }
imprimir(u)`);

mismoConYSinJIT('cierre: la variable del bucle «para», una caja por vuelta', `
fn hechos(): lista {
    var out: lista = []
    para i en [1, 2, 3, 4, 5] {
        fn dame(): real { devolver i }
        out = out + [dame]
    }
    devolver out
}
var fs = hechos()
repetir 50 { fs[0]() }
var txt: texto = ""
para f en fs { txt = txt + texto(f()) + " " }
imprimir(txt)`);

mismoConYSinJIT('cierre: capturar algo de la abuela, no de la madre', `
fn abuela(): funcion {
    var secreto: real = 7.0
    fn madre(): funcion {
        fn nieta(): real { devolver secreto }
        devolver nieta
    }
    devolver madre()
}
var n = abuela()
var v: real = 0.0
repetir 100 { v = n() }
imprimir(v)`);

mismoConYSinJIT('cierre: la abuela escribe y la nieta lo ve', `
fn cadena(): lista {
    var x: real = 1.0
    fn madre(): funcion {
        fn nieta(): real { x = x * 2.0  devolver x }
        devolver nieta
    }
    fn mira(): real { devolver x }
    devolver [madre(), mira]
}
var c = cadena()
var n = c[0]
var m = c[1]
repetir 60 { n() }
imprimir(m())`);

mismoConYSinJIT('cierre: una función anidada recursiva se captura a sí misma', `
fn fuera(): real {
    fn fact(n: real): real {
        si n <= 1.0 { devolver 1.0 }
        devolver n * fact(n - 1.0)
    }
    var t: real = 0.0
    repetir 60 { t = fact(10.0) }
    devolver t
}
imprimir(fuera())`);

mismoConYSinJIT('cierre: anónima pasada a una nativa, capturando', `
usar suma de "numerico"
fn escalar(xs: lista, k: real): lista {
    devolver mapear(xs, fn(x: real): real { devolver x * k })
}
var xs: lista = []
repetir 100 { xs = xs + [2.0] }
imprimir(suma(escalar(xs, 3.0)))
imprimir(suma(escalar(xs, 0.5)))`);

mismoConYSinJIT('cierre: un cierre devuelto y llamado desde fuera de su función', `
fn haz(k: texto): funcion {
    fn saluda(n: texto): texto { devolver k + ", " + n }
    devolver saluda
}
var h = haz("Hola")
var r: texto = ""
repetir 100 { r = h("Diego") }
imprimir(r)
imprimir(haz("Buenas")("Nico"))`);

mismoConYSinJIT('cierre: el mismo resultado en la llamada 1 y en la 100', `
fn hacer(): funcion {
    var n: real = 0.0
    fn f(x: real): real { n = n + 1.0  devolver x * 2.0 + n }
    devolver f
}
var f = hacer()
imprimir(f(10.0))
repetir 98 { f(10.0) }
imprimir(f(10.0))`);

mismoConYSinJIT('cierre: una función anidada que no captura y no se llama nunca', `
fn trabaja(): real {
    fn jamas(x: real): real { devolver x }
    var t: real = 0.0
    repetir 100000 { t = t + 1.0 }
    devolver t
}
imprimir(trabaja())`);

mismoConYSinJIT('cierre: capturar una lista y modificarla', `
fn constructor(): funcion {
    var acc: lista = []
    fn añade(x: real): real { acc = acc + [x]  devolver longitud(acc) }
    devolver añade
}
var a = constructor()
var n: real = 0.0
repetir 100 { n = a(1.0) }
imprimir(n)`);

mismoConYSinJIT('cierre: capturado dentro de un intentar/capturar', `
fn protege(): real {
    var cuantas: real = 0.0
    fn arriesga(x: real): real {
        intentar {
            si x < 0.0 { lanzar "negativo" }
            devolver x
        } capturar (e) {
            cuantas = cuantas + 1.0
            devolver 0.0
        }
    }
    var t: real = 0.0
    repetir 100 { t = t + arriesga(0.0 - 1.0) }
    devolver cuantas
}
imprimir(protege())`);

mismoConYSinJIT('cierre: dos instancias no comparten estado', `
fn caja(): funcion {
    var v: real = 0.0
    fn pon(x: real): real { v = v + x  devolver v }
    devolver pon
}
var a = caja()
var b = caja()
repetir 60 { a(1.0) }
repetir 30 { b(10.0) }
imprimir(texto(a(0.0)) + " " + texto(b(0.0)))`);

mismoConYSinJIT('cierre: creado por el intérprete y ejecutado compilado', `
# La de fuera no tiene bucle, así que no se compila hasta la llamada 41: las
# primeras cuarenta crean el cierre desde el intérprete, con la variable
# capturada TODAVÍA VIVA en la pila de la máquina (un upvalue «abierto»), y la
# de dentro sí llega al umbral antes y se compila. Es el cruce de motores, y es
# donde una representación doble de las capturas se rompería.
fn fabrica(k: real): funcion {
    fn usa(x: real): real { devolver x + k }
    devolver usa
}
var acc: real = 0.0
var i: real = 0.0
repetir 200 {
    i = i + 1.0
    var f = fabrica(i)
    acc = acc + f(1000.0)
}
imprimir(acc)`);

mismoConYSinJIT('cierre: el de fuera escribe la capturada entre llamada y llamada', `
fn fabrica(): lista {
    var k: real = 0.0
    fn lee(): real { devolver k }
    fn pon(v: real): real { k = v  devolver k }
    devolver [lee, pon]
}
var p = fabrica()
var lee = p[0]
var pon = p[1]
var txt: texto = ""
var j: real = 0.0
repetir 100 {
    j = j + 1.0
    pon(j)
    si j == 1.0 o j == 50.0 o j == 100.0 { txt = txt + texto(lee()) + " " }
}
imprimir(txt + texto(lee()))`);

// ── llamada directa de compilado a compilado (etapa 3) ─────────────────────
// Atar una función de Ñ por su nombre permite saltarse la búsqueda en el mapa
// de globales Y la comprobación de aridad por llamada. Lo segundo solo es
// legítimo si la promesa se sostiene: que el global siga siendo esa función.
// Estas pruebas atacan justo las formas de romper la promesa.

// Un nombre declarado con «fn» es FIJO en Ñ: no se puede reasignar, y eso hace
// la promesa del atado más fuerte de lo que hacía falta. Lo que sí se puede
// reasignar es una «var» que guarde una función, y ese es el caso que importa.
mismoConYSinJIT('atado: una var global con una función, reasignada', `
fn uno(): real { devolver 1.0 }
fn dos(): real { devolver 2.0 }
var cual: funcion = uno
fn usa(): real { var t: real = 0.0  repetir 100 { t = cual() }  devolver t }
imprimir(usa())
cual = dos
imprimir(usa())`);

falla('atado: un nombre de «fn» no se puede reasignar, y lo dice',
  `fn uno(): real { devolver 1.0 }
fn dos(): real { devolver 2.0 }
uno = dos`, 'fijo');

mismoConYSinJIT('atado: una var local con una función, reasignada a media función', `
fn fuera(): real {
    fn mas1(x: real): real { devolver x + 1.0 }
    fn mas10(x: real): real { devolver x + 10.0 }
    var f: funcion = mas1
    var t: real = 0.0
    repetir 100 { t = f(t) }
    f = mas10
    repetir 10 { t = f(t) }
    devolver t
}
imprimir(fuera())`);

mismoConYSinJIT('atado: dos «fn» con el mismo nombre en la misma función', `
fn fuera(): real {
    si cierto {
        fn g(x: real): real { devolver x + 1.0 }
        var a: real = 0.0
        repetir 60 { a = g(a) }
        imprimir(a)
    }
    devolver 0.0
}
imprimir(fuera())`);

mismoConYSinJIT('atado: la recursión también va derecha', `
fn fib(n: real): real {
    si n < 2.0 { devolver n }
    devolver fib(n - 1.0) + fib(n - 2.0)
}
imprimir(fib(20.0))`);

mismoConYSinJIT('atado: recursión mutua entre dos globales', `
fn par(n: real): bool {
    si n == 0.0 { devolver cierto }
    devolver impar(n - 1.0)
}
fn impar(n: real): bool {
    si n == 0.0 { devolver falso }
    devolver par(n - 1.0)
}
var t: texto = ""
repetir 60 { t = texto(par(100.0)) }
imprimir(t + " " + texto(impar(99.0)))`);

mismoConYSinJIT('atado: una local recursiva llamada por su nombre', `
fn fuera(): real {
    fn fact(n: real): real {
        si n <= 1.0 { devolver 1.0 }
        devolver n * fact(n - 1.0)
    }
    var t: real = 0.0
    repetir 100 { t = fact(12.0) }
    devolver t
}
imprimir(fuera())`);

falla('atado: la aridad mal sigue dando el error de siempre',
  `fn mas(a: real, b: real): real { devolver a + b }
fn usa(): real { var t: real = 0.0  repetir 100 { t = mas(t) }  devolver t }
imprimir(usa())`, 'argumento');

// Y que la invalidación de verdad se dispara con una función de Ñ, no solo con
// una nativa: si el global cambia, lo compilado que llamaba derecho se tira.
{
  const { m } = corre(`
fn uno(): real { devolver 1.0 }
fn usa(): real { var t: real = 0.0  repetir 100 { t = uno() }  devolver t }
imprimir(usa())`);
  comprobar('atado: el nombre de la función de Ñ queda en la lista de invalidación',
    !!m.vm.atados && m.vm.atados.has('uno'),
    m.vm.atados ? [...m.vm.atados].join(',') : 'sin atados');
}
{
  // Una «var» global que guarda una función SÍ se puede cambiar, y entonces lo
  // compilado que la llamaba derecho tiene que tirarse. Es la misma maquinaria
  // que ya protegía a las nativas atadas.
  const { m } = corre(`
fn uno(): real { devolver 1.0 }
fn dos(): real { devolver 2.0 }
var cual: funcion = uno
fn usa(): real { var t: real = 0.0  repetir 100 { t = cual() }  devolver t }
imprimir(usa())
cual = dos
imprimir(usa())`);
  comprobar('atado: cambiar esa var tira lo compilado',
    (m.vm.stats.jitOlvidadas || 0) >= 1, 'olvidadas=' + m.vm.stats.jitOlvidadas);
}

// Y la comprobación de que el JIT de verdad se está metiendo donde decimos:
// si estas dos dejaran de compilarse, las pruebas de arriba seguirían en verde
// por el camino del intérprete y no nos enteraríamos.
{
  const { m } = corre(`
fn conNido(): real {
    fn sinCapturar(x: real): real { devolver x }
    var t: real = 0.0
    repetir 5000 { t = t + 1.0 }
    devolver t
}
fn conCaptura(): real {
    var k: real = 1.0
    fn suma(x: real): real { devolver x + k }
    var t: real = 0.0
    repetir 5000 { t = suma(t) }
    devolver t
}
imprimir(conNido())
imprimir(conCaptura())`);
  const protos = [];
  for (const [, v] of m.vm.globals) if (v && v.clase === 'cierre' && v.fn && v.fn.ast) protos.push(v.fn);
  const porNombre = n => protos.find(p => p.nombre === n);
  const a = porNombre('conNido'), b = porNombre('conCaptura');
  comprobar('JIT: una función con un fn anidado dentro SÍ se compila',
    !!a && a.jitEstado === 'compilada', a ? a.jitEstado + (a.jitError ? ' · ' + a.jitError : '') : 'no la encontré');
  comprobar('JIT: una función con un fn anidado que CAPTURA también se compila',
    !!b && b.jitEstado === 'compilada', b ? b.jitEstado + (b.jitError ? ' · ' + b.jitError : '') : 'no la encontré');
}

// ───────────────────────────────────────────── gramática: lo que se RECHAZA
//
//  La otra mitad de pruebas/en-n/gramatica.esl. Allí se afirma con valores lo
//  que el lenguaje ACEPTA; eso se puede escribir en Ñ porque el programa
//  compila. Lo que el lenguaje tiene que rechazar no se puede escribir en un
//  programa que compila, así que vive aquí.
//
//  Y no basta con que falle: cada caso comprueba también QUÉ dice. Un rechazo
//  con un mensaje inútil es casi tan malo como no rechazar, porque el que
//  escribió el programa —persona o IA— no sabe qué corregir.

falla('gramática: «no» no vale como nombre, aunque «y» y «o» sí',
  `var no = 1`, 'palabra del lenguaje');
falla('gramática: la coma final NO se admite en los argumentos de una llamada',
  `imprimir(1, 2,)`, 'no se esperaba');
falla('gramática: «1 < 2 < 3» parsea pero no pasa los tipos',
  `imprimir(1 < 2 < 3)`, 'no se pueden comparar');
falla('gramática: «y» en una línea nueva deja de ser operador y se lee como nombre',
  `var a = cierto\nvar b = a\ny cierto`, '«y» no está definida');
falla('gramática: no existe «usar X as Y»',
  `usar media as m de "numerico"`, 'usar');
falla('gramática: «capturar» lleva los paréntesis del nombre',
  `intentar { } capturar e { }`, 'falta «{»');
falla('gramática: «si» es sentencia, no hay ternario con si/sino',
  `var x = si cierto { 1 } sino { 2 }`, 'no se esperaba «si»');
falla('gramática: tampoco hay ternario con «?»',
  `var x = cierto ? 1 : 2`, 'carácter inesperado');
falla('gramática: «dic» exige los DOS parámetros',
  `var d: dic<texto> = {"a": 1}`, 'se esperaba «,»');
falla('gramática: los tipos unión son de la biblioteca, no se escriben en un programa',
  `var x: real|entero = 1.0`, 'no está definida');
falla('gramática: los números no llevan separador de miles',
  `var x = 1_000`, 'no está definida');
falla('gramática: ni hexadecimal',
  `var x = 0xFF`, 'no está definida');
falla('gramática: un programa no puede declarar una constante con sigilo',
  `|MIO = 1`, 'no está definida');
falla('gramática: una constante que no existe lo dice con el sigilo puesto',
  `imprimir(|NOEXISTE)`, '«|NOEXISTE» no está definida');
falla('gramática: no hay «++»',
  `var x = 1\nx++`, 'no se esperaba');
falla('gramática: una interpolación sin cerrar se detecta en el léxico',
  `imprimir("{1")`, 'sin cerrar');
falla('gramática: el lado izquierdo de «=» tiene que ser asignable',
  `5 = 3`, 'no es asignable');
falla('gramática: «devolver» solo dentro de una función',
  `devolver 1`, 'dentro de una función');
falla('gramática: un nombre de la biblioteca no se redeclara',
  `var error = 1`, 'no se puede redeclarar');
falla('gramática: el mismo nombre no se importa dos veces en un archivo',
  `usar media de "numerico"\nusar media de "numerico"`, 'ya está usado');

// Y el otro lado de la misma moneda: estos SÍ tienen que correr, porque son
// los casos que una gramática escrita a ojo suele marcar como errores.
ok('gramática: «publico» y «público» valen como nombre de variable',
  `var publico = 1  var público = 2  imprimir(publico + público)`, '3');
ok('gramática: «usar» y «de» también',
  `var usar = 1  var de = 2  imprimir(usar + de)`, '3');
ok('gramática: la asignación es una expresión y asocia a la derecha',
  `var a = 0  var b = 0  imprimir(a = b = 7)  imprimir([a, b])`, '7\n[7, 7]');
ok('gramática: «**» asocia a la derecha y el menos unario queda fuera',
  `imprimir(2 ** 3 ** 2)  imprimir(-2 ** 2)`, '512\n-4');
ok('gramática: «no» está al nivel de las unarias, no al de «y»/«o»',
  `imprimir(no 1 == 2)  imprimir(no cierto o cierto)`, 'falso\ncierto');
ok('gramática: «==» es un nivel más flojo que «<»',
  `imprimir(cierto == 1 < 2)`, 'cierto');
ok('gramática: «repetir N veces» y «repetir N» son lo mismo',
  `var n = 0  repetir 2 veces { n += 1 }  repetir 2 { n += 1 }  imprimir(n)`, '4');
ok('gramática: la comilla simple no interpola',
  `var n = 3  imprimir('vale {n}')  imprimir("vale {n}")`, 'vale {n}\nvale 3');
ok('gramática: un escape que no está en la tabla pasa el carácter tal cual',
  `imprimir("a\\qb")`, 'aqb');
ok('gramática: el retorno se anota con «:» o con «->»',
  `fn a(): entero { devolver 1 }
fn b() -> entero { devolver 2 }
imprimir(a() + b())`, '3');
ok('gramática: «lanzar» lanza cualquier valor, no solo un error()',
  `intentar { lanzar 42 } capturar (e) { imprimir("cacé " + texto(e)) }`, 'cacé 42');
ok('gramática: «capturar» sin nombre, y «finalmente» sin «capturar»',
  `intentar { lanzar "x" } capturar { imprimir("a") }
intentar { imprimir("b") } finalmente { imprimir("c") }`, 'a\nb\nc');
ok('gramática: «devolver» solo en su línea devuelve nulo',
  `fn f() {
    devolver
    5
}
imprimir(f())`, 'nulo');

// ───────────────────────────────────────────── resultados
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
