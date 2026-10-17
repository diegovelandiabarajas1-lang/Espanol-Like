// motor-exp · fases X2–X4 (expresividad): valores por defecto, argumentos con
// nombre, campos por defecto, «publico tipo» entre archivos, a?.m(), genéricos,
// generadores (producir) y funciones asíncronas (esperar).
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let pasan = 0, fallan = 0;
const fallos = [];
const sinTraza = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n');
// Un anfitrión de mentira: archivos en memoria, un reloj que se adelanta a
// mano y una red que contesta lo que se le diga. Sin esperas de verdad.
let ARCHIVOS = {};
function anfitrion() {
  const pend = new Map(), pet = [];
  let sig = 1, ahora = 0;
  return {
    pet,
    modulos: { resolver: (e, desde) => e.replace(/^\.\//, ''), leer: k => { if (!(k in ARCHIVOS)) throw new Error('no existe ' + k); return ARCHIVOS[k]; } },
    tiempo: { luego(ms, fn, vm) { pend.set(sig, { en: ahora + ms, fn, vm }); return sig++; }, cada() { return 0; }, detener: id => pend.delete(id) },
    red: { pedir(url, o, fn, vm) { pet.push({ url, fn, vm }); } },
    avanzar(ms) {
      const fin = ahora + ms;
      for (;;) {
        const sigs = [...pend].filter(([, t]) => t.en <= fin).sort((a, b) => a[1].en - b[1].en);
        if (!sigs.length) break;
        const [id, t] = sigs[0]; pend.delete(id); ahora = t.en;
        t.vm.nuevoTurno(); t.vm.invocar(t.fn, []);
      }
      ahora = fin;
    },
  };
}
function corre(src, opts) {
  const out = [];
  const h = anfitrion();
  const m = crearMotor(Object.assign({ salida: s => out.push(s), limiteInstr: 2e8,
    host: { modulos: h.modulos, tiempo: h.tiempo, red: h.red } }, opts || {}));
  const r0 = m.ejecutar(src, 'principal.esl');
  // Lo asíncrono: se adelanta el reloj y se contesta la red hasta que no quede nada.
  if (r0.ok) for (let v = 0; v < 20; v++) {
    h.avanzar(10000);
    const ps = h.pet.splice(0);
    for (const p of ps) { const d = m.vm.nuevoDic(); d.mapa.set('estado', 200); d.mapa.set('cuerpo', 'de ' + p.url); p.vm.nuevoTurno(); p.vm.invocar(p.fn, [d]); }
  }
  const r = r0;
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
function mismo(nombre, src, sinExigirJit) {
  const a = corre(src, { jit: true }), b = corre(src, { jit: false });
  const ka = a.r.ok ? a.out.join('\n') : 'E:' + msgDe(a.r), kb = b.r.ok ? b.out.join('\n') : 'E:' + msgDe(b.r);
  if (ka !== kb) { fallan++; fallos.push(`✗ ${nombre}\n    sin JIT: ${kb.slice(0, 300)}\n    con JIT: ${ka.slice(0, 300)}`); return; }
  if (!sinExigirJit && a.r.stats && a.r.stats.jitCompiladas < 1) { fallan++; fallos.push(`✗ ${nombre}\n    el JIT no compiló nada`); return; }
  if (!a.r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    los dos fallan: ${ka}`); return; }
  pasan++;
}


// ══════════════════════════════ X2. valores por defecto y argumentos con nombre
const SALUDO = `fn saludar(nombre: texto, saludo: texto = "Hola", signo: texto = "!"): texto {
  devolver saludo + ", " + nombre + signo }
`;
ok('un parámetro con valor por defecto se puede omitir', SALUDO + `imprimir(saludar("Ana"))`, 'Hola, Ana!');
ok('o darlo por posición', SALUDO + `imprimir(saludar("Ana", "Buenas"))`, 'Buenas, Ana!');
ok('argumentos con nombre, en cualquier orden', SALUDO + `imprimir(saludar(signo: "?", nombre: "Luis"))`, 'Hola, Luis?');
ok('saltarse uno del medio con un nombre', SALUDO + `imprimir(saludar("Eva", signo: "."))`, 'Hola, Eva.');
ok('el defecto se evalúa en cada llamada (no se comparte una lista)', `fn poner(x, l = []) { agregar(l, x)
  devolver l }
imprimir(poner(1), poner(2))`, '[1] [2]');
ok('el defecto puede usar los parámetros de antes', `fn caja(ancho, alto = ancho) { devolver ancho * alto }
imprimir(caja(3), caja(3, 4))`, '9 12');
ok('con nulo explícito NO se usa el defecto', `fn f(x = 5) { devolver x }
imprimir(f(nulo), f())`, 'nulo 5');
ok('una función con defectos pasada a mapear', `fn doble(x, k = 2) { devolver x * k }
imprimir(mapear([1, 2, 3], doble))`, '[2, 4, 6]');
ok('un método con defectos y con nombre', `tipo Cuenta { saldo: real }
fn Cuenta.sacar(monto: real, comision: real = 1.0) { yo.saldo = yo.saldo - monto - comision }
fijo c = Cuenta(100.0)
c.sacar(10.0)
c.sacar(monto: 5.0, comision: 0.0)
imprimir(c.saldo)`, '84');
falla('un nombre que no es de la función', SALUDO + `saludar("Ana", color: "rojo")`, '«color»', 'tipos');
falla('el mismo argumento dos veces', SALUDO + `saludar("Ana", nombre: "Eva")`, 'ya llegó por posición', 'tipos');
falla('falta el obligatorio', SALUDO + `saludar(saludo: "Hey")`, '«nombre»', 'tipos');
falla('demasiados argumentos dice el rango', SALUDO + `saludar("a", "b", "c", "d")`, 'entre 1 y 3', 'tipos');
falla('un posicional después de uno con nombre', SALUDO + `saludar(nombre: "a", "b")`, 'con nombre', 'sintaxis');
falla('los parámetros con defecto van al final', `fn f(a = 1, b) { }`, 'al final', 'sintaxis');
falla('el tipo del defecto se comprueba', `fn f(x: entero = "hola") { }`, 'entero', 'tipos');
mismo('defectos con y sin JIT', `fn paso(x: entero, k: entero = 3): entero { devolver x * k + 1 }
var s = 0
para i en rango(20000) { s = (s + paso(i) + paso(i, k: 2)) % 100003 }
imprimir(s)`);

// ══════════════════════════════ X2. campos con valor por defecto
const CFG = `tipo Config {
  nombre: texto
  puerto: entero = 8080
  depurar: bool = falso
}
`;
ok('un registro con campos por defecto', CFG + `imprimir(Config("api"))`, 'Config{nombre: "api", puerto: 8080, depurar: falso}');
ok('y se dan por nombre', CFG + `imprimir(Config("api", depurar: cierto).depurar, Config(nombre: "x", puerto: 1).puerto)`, 'cierto 1');
falla('el constructor comprueba los nombres', CFG + `Config("a", puerta: 1)`, '«puerta»', 'tipos');
falla('el campo obligatorio no se puede omitir', CFG + `Config()`, '«nombre»', 'tipos');

// ══════════════════════════════ X2. «publico tipo» entre archivos
{
  ARCHIVOS = { 'geo.esl': `publico tipo Punto {
  x: real
  y: real = 0.0
}
publico fn Punto.norma1(): real { devolver yo.x + yo.y }
` };
  ok('un tipo público se usa desde otro archivo, con sus métodos', `usar Punto de "./geo.esl"
fijo p = Punto(2.0, y: 3.0)
imprimir(p, p.norma1(), tipo(p))`, 'Punto{x: 2, y: 3} 5 Punto');
  ok('y con su campo por defecto', `usar Punto de "./geo.esl"
imprimir(Punto(1.5).y)`, '0');
  falla('el que importa también ve los campos', `usar Punto de "./geo.esl"
imprimir(Punto(1.0).z)`, '«z»', 'tipos');
}

// ══════════════════════════════ X2. a?.m()
ok('a?.m() con nulo no llama y da nulo', `tipo P { n: entero }
fn P.doble(): entero { devolver yo.n * 2 }
var a: cualquiera = nulo
imprimir(a?.doble(), P(4)?.doble())`, 'nulo 8');
ok('?. y ?? juntos', `var u: cualquiera = nulo
imprimir(u?.nombre ?? "anónimo")`, 'anónimo');

// ══════════════════════════════ X3. genéricos
ok('una función genérica', `fn primero<T>(l: lista, defecto: T): T { si longitud(l) == 0 { devolver defecto }
  devolver l[0] }
imprimir(primero([], 7), primero(["a"], "z"))`, '7 a');
ok('el tipo genérico pasa al resultado', `fn mismo<T>(x: T): T { devolver x }
fijo n: entero = mismo(3)
imprimir(n + 1)`, '4');
falla('T tiene que ser el mismo en toda la llamada', `fn par<T>(a: T, b: T): T { devolver a }
par(1, "dos")`, 'T', 'tipos');
falla('el resultado genérico se comprueba donde se usa', `fn mismo<T>(x: T): T { devolver x }
fijo s: texto = mismo(3)`, 'texto', 'tipos');

// ══════════════════════════════ X4. generadores
const U = 'usar siguiente, terminado, recoger, dormir, todas de "corrutinas"\n';
const CONTAR = U + `fn contar(desde, hasta) { var i = desde
  mientras i <= hasta { producir i
    i = i + 1 } }
fn fibs() { var a = 0
  var b = 1
  mientras cierto { producir a
    fijo t = a + b
    a = b
    b = t } }
`;
ok('para x en un generador', CONTAR + `var s = []
para x en contar(3, 6) { agregar(s, x) }
imprimir(s)`, '[3, 4, 5, 6]');
ok('un generador infinito se corta con romper', CONTAR + `var v = []
para x en fibs() { si x > 30 { romper }
  agregar(v, x) }
imprimir(v)`, '[0, 1, 1, 2, 3, 5, 8, 13, 21]');
ok('siguiente, el valor de cuando se acaba y terminado', CONTAR + `fijo g = contar(1, 2)
imprimir(siguiente(g), siguiente(g), siguiente(g, "fin"), siguiente(g), terminado(g))`, '1 2 fin nulo cierto');
ok('recoger y tipo', CONTAR + `imprimir(recoger(contar(1, 4)), tipo(fibs()))`, '[1, 2, 3, 4] generador');
ok('generadores encadenados', CONTAR + `fn pares(g) { para v en g { si v % 2 == 0 { producir v } } }
fn cuadrados(g) { para v en g { producir v * v } }
imprimir(recoger(cuadrados(pares(contar(1, 10)))))`, '[4, 16, 36, 64, 100]');
ok('cada llamada es un generador nuevo e independiente', CONTAR + `fijo a = contar(1, 3)
fijo b = contar(1, 3)
siguiente(a)
siguiente(a)
imprimir(siguiente(a), siguiente(b))`, '3 1');
ok('dos bucles anidados sobre generadores', CONTAR + `var s = 0
para i en contar(1, 3) { para j en contar(1, i) { s = s + i * j } }
imprimir(s)`, '25');
ok('intentar dentro de un generador', `${U}fn g() { intentar { producir 1
    lanzar "ups" } capturar (e) { producir "capturado " + texto(e) }
  producir 3 }
imprimir(recoger(g()))`, '[1, "capturado ups", 3]');
ok('un error del generador se captura fuera', `fn g() { producir 1
  lanzar "dentro" }
intentar { para x en g() { imprimir("v", x) } } capturar (e) { imprimir("fuera:", texto(e)) }`, 'v 1\nfuera: dentro');
ok('devolver termina el generador', `${U}fn g() { producir 1
  devolver
  producir 2 }
imprimir(recoger(g()))`, '[1]');
ok('un generador como método de un registro', `${U}tipo Rango { a: entero
  b: entero }
fn Rango.valores() { var i = yo.a
  mientras i < yo.b { producir i
    i = i + 1 } }
imprimir(recoger(Rango(2, 5).valores()))`, '[2, 3, 4]');
ok('siguiente, recoger, dormir y todas siguen libres sin el «usar»', `fn siguiente(x) { devolver x + 1 }
fn todas(l) { devolver longitud(l) }
var dormir = 3
imprimir(siguiente(1), todas([1, 2]), dormir)`, '2 2 3');
ok('«producir» y «esperar» siguen valiendo como nombres', `var producir = 2
fn esperar(x) { devolver x + 1 }
imprimir(producir, esperar(1))`, '2 2');
mismo('un generador recorrido desde código con JIT da lo mismo', CONTAR + `fn suma(n) { var s = 0
  para x en contar(1, n) { s = s + x }
  devolver s }
var t = 0
repetir 30 { t = t + suma(200) }
imprimir(t)`, true);
falla('producir fuera de una función', `producir 1`, 'dentro de una función', 'sintaxis');
falla('producir y esperar en la misma función', `fn f() { producir 1
  esperar 2 }`, 'a la vez', 'sintaxis');
falla('un generador no tiene longitud', CONTAR + `imprimir(longitud(contar(1, 3)))`, 'no tiene longitud', 'ejecución');
falla('una función de dentro no puede capturar variables de la corrutina', `fn g() { var n = 0
  fn suma() { n = n + 1 }
  producir n }`, 'corrutina', 'compilación');
falla('siguiente pide un generador', `${U}siguiente([1, 2])`, 'generador', 'ejecución');

// ══════════════════════════════ X4. asíncronas
const TAREAS = U + `fn tarea(nombre, ms) { imprimir("empieza " + nombre)
  esperar dormir(ms)
  imprimir("acaba " + nombre)
  devolver nombre + "!" }
`;
ok('una asíncrona corre hasta su primer esperar y el programa sigue', TAREAS + `fijo t = tarea("A", 100)
imprimir("sigo", tipo(t), terminado(t))`, 'empieza A\nsigo promesa falso\nacaba A');
ok('esperar el resultado de otra asíncrona', TAREAS + `fn principal() { fijo a = esperar tarea("A", 50)
  imprimir("tengo " + a) }
principal()`, 'empieza A\nacaba A\ntengo A!');
ok('todas: en paralelo, resultados en orden', TAREAS + `fn principal() { fijo r = esperar todas([tarea("B", 50), tarea("C", 20), 7])
  imprimir(r) }
principal()`, 'empieza B\nempieza C\nacaba C\nacaba B\n["B!", "C!", 7]');
ok('esperar pedir(url) sin función', `fn principal() { fijo r = esperar pedir("https://x.test/d")
  imprimir(r["estado"], r["cuerpo"]) }
principal()`, '200 de https://x.test/d');
ok('un error de una asíncrona se captura en quien la espera', `${U}fn falla() { esperar dormir(10)
  lanzar "roto" }
fn principal() { intentar { esperar falla() } capturar (e) { imprimir("capturado " + texto(e)) } }
principal()`, 'capturado roto');
ok('aunque falle antes de su primer esperar', `fn falla() { lanzar "pronto" }
fn principal() { esperar 0
  intentar { esperar falla2() } capturar (e) { imprimir("capturado " + texto(e)) } }
fn falla2() { lanzar "pronto"
  esperar 0 }
principal()`, 'capturado pronto');
ok('esperar un valor que no es promesa lo devuelve tal cual', `fn f() { fijo x = esperar 5
  imprimir(x * 2) }
f()`, '10');
ok('un bucle con esperar dentro', `${U}fn reloj() { para i en rango(3) { esperar dormir(100)
    imprimir("tic " + texto(i)) } }
reloj()
imprimir("antes")`, 'antes\ntic 0\ntic 1\ntic 2');
falla('esperar dentro de un generador no vale', `fn g() { producir 1
  fijo x = esperar 2 }`, 'a la vez', 'sintaxis');
falla('una asíncrona no se recorre', `fn f() { esperar 1 }
para x en f() { }`, null, 'ejecución');

// ══════════════════════════════ el .elb lleva las marcas
{
  const E = globalThis.EspanolLike;
  const { m } = corre('fijo x = 1');
  const a = m.analizar(`${U}fn g(n, k = 10) { para i en rango(n) { producir i * k } }
imprimir(recoger(g(3)), recoger(g(2, k: 1)))`);
  let txt = '', bien = a.ok;
  if (bien) {
    const fn2 = E.deserializar(E.serializar(a.fn));
    const out = [];
    const r = E.crearMotor({ salida: s => out.push(s) }).correr(fn2, [], []);
    txt = out.join('|');
    bien = r && r.ok && txt === '[0, 10, 20] [0, 1]';
  }
  if (bien) pasan++; else { fallan++; fallos.push(`✗ un generador con defectos viaja en .elb y corre igual\n    → ${txt}`); }
}

console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
