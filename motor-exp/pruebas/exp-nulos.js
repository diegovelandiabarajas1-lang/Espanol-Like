// motor-exp · fase X5 (nulos al estilo Kotlin): «texto?» es texto o nulo; un
// «texto» a secas no admite nulo; un «texto?» no se usa como texto hasta que el
// verificador sabe que no es nulo («si x != nulo», «x ?? v», «x?.c», o una
// asignación con valor). Y una función que promete un tipo lo devuelve por
// TODOS sus caminos.
//
// Lo que se prueba: que lo bueno corre y da lo de siempre (con y sin JIT), que
// lo malo se para ANTES de correr y el mensaje enseña la forma buena, y que lo
// de antes sigue igual («var x» sin valor ahora sirve; «??» y «?.» no cambian).
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
// «etapa»: 'tipos'/'sintaxis'/'léxico' si debe pararse antes de correr, 'ejecución' si al correr.
function falla(nombre, src, fragmento, etapa) {
  const { r } = corre(src);
  if (r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y corrió bien`); return; }
  const msg = msgDe(r);
  if (fragmento && !msg.toLowerCase().includes(fragmento.toLowerCase())) { fallan++; fallos.push(`✗ ${nombre}\n    el error no menciona «${fragmento}»\n    dijo: ${msg}`); return; }
  if (etapa && !msg.includes(`[${etapa}]`)) { fallan++; fallos.push(`✗ ${nombre}\n    tenía que pararse en «${etapa}» y dijo: ${msg}`); return; }
  pasan++;
}

console.log('── «var x» sin valor y el tipo que admite nulo');
ok('«var x» sin valor ya sirve: la primera asignación le pone el tipo',
  `var x\nx = 5\nimprimir(x + 1)`, '6');
ok('«texto?» admite nulo y texto; «??» da el valor de respaldo',
  `var n: texto? = nulo\nimprimir(n ?? "nadie")\nn = "Ana"\nimprimir(n ?? "nadie")`, 'nadie\nAna');
ok('«lista<real>?», «Punto?» y «(funcion(real): real)?» también se escriben',
  `tipo Punto { x: real }\nvar l: lista<real>? = nulo\nvar p: Punto? = nulo\nvar f: funcion? = nulo\nimprimir(l, p, f)`, 'nulo nulo nulo');
ok('un parámetro «texto?» acepta nulo; uno «texto» acepta un «texto?» ya comprobado',
  `fn largo(t: texto): entero { devolver longitud(t) }\nfn seguro(t: texto?): entero { si t == nulo { devolver 0 }  devolver largo(t) }\nimprimir(seguro(nulo), seguro("hola"))`, '0 4');
ok('una función «: entero?» puede devolver nulo o un entero',
  `fn buscar(l: lista, v): entero? {\n  para i en rango(longitud(l)) { si l[i] == v { devolver i } }\n  devolver nulo\n}\nimprimir(buscar([7, 8], 8), buscar([7, 8], 9))`, '1 nulo');

console.log('── el estrechamiento (lo que Kotlin llama smart cast)');
ok('dentro de «si x != nulo { … }», x es texto',
  `var n: texto? = "ñu"\nsi n != nulo { imprimir(longitud(n), n + "!") }`, '2 ñu!');
ok('en el «sino» de «si x == nulo», también',
  `var n: texto? = "ñu"\nsi n == nulo { imprimir("vacío") } sino { imprimir(n + "!") }`, 'ñu!');
ok('«si x == nulo { devolver }» deja a x sin nulo en lo que sigue',
  `fn f(n: texto?): texto {\n  si n == nulo { devolver "vacío" }\n  devolver n + "!"\n}\nimprimir(f(nulo), f("a"))`, 'vacío a!');
ok('la derecha de «y» ya sabe lo que comprobó la izquierda',
  `var n: texto? = "abc"\nsi n != nulo y longitud(n) > 2 { imprimir(n + "!") }`, 'abc!');
ok('«no (x == nulo)» y «x != nulo o …» estrechan donde toca',
  `var n: texto? = "a"\nsi no (n == nulo) { imprimir(n + "1") }\nsi n == nulo o longitud(n) == 0 { imprimir("nada") } sino { imprimir(n + "2") }`, 'a1\na2');
ok('«si … entonces … sino …» como expresión estrecha cada rama',
  `var n: texto? = "abc"\nimprimir(si n != nulo entonces longitud(n) sino 0)`, '3');
ok('asignar un valor a una «texto?» la deja sin nulo hasta el final del bloque',
  `var n: texto? = nulo\nn = "hola"\nimprimir(n + "!")`, 'hola!');
ok('«?.» sobre una «Punto?» da «real?», y «??» lo remata',
  `tipo Punto { x: real }\nvar p: Punto? = nulo\nimprimir(p?.x ?? -1)\np = Punto(3)\nimprimir(p.x)`, '-1\n3');
ok('«?.m()» sobre un registro que puede ser nulo',
  `tipo C { v: real }\nfn C.doble(): real { devolver yo.v * 2 }\nvar c: C? = nulo\nimprimir(c?.doble() ?? 0)\nc = C(4)\nimprimir(c.doble())`, '0\n8');
ok('con el JIT da lo mismo',
  `fn f(n: texto?): entero { si n == nulo { devolver 0 }  devolver longitud(n) }\nvar s = 0\npara i en rango(200) { s = s + f(si i % 2 == 0 entonces "ab" sino nulo) }\nimprimir(s)`, '200');

console.log('── lo que se para antes de correr');
falla('un «texto?» no se suma: puede ser nulo',
  `var n: texto? = nulo\nimprimir(n + "!")`, 'puede ser nulo', 'tipos');
falla('ni se compara con «<»',
  `var n: entero? = nulo\nimprimir(n < 3)`, 'puede ser nulo', 'tipos');
falla('ni se le cambia el signo',
  `var n: entero? = nulo\nimprimir(-n)`, 'puede ser nulo', 'tipos');
falla('«p.x» con «p: Punto?» no vale, y la pista enseña «p?.x»',
  `tipo Punto { x: real }\nvar p: Punto? = nulo\nimprimir(p.x)`, 'p?.x', 'tipos');
falla('ni indexar una «lista?»',
  `var l: lista<real>? = nulo\nimprimir(l[0])`, 'puede ser nulo', 'tipos');
falla('ni llamar a una «funcion?»',
  `var f: funcion? = nulo\nf()`, 'puede ser nulo', 'tipos');
falla('un «texto?» no se pasa donde se espera «texto»',
  `fn g(t: texto) { devolver t }\nvar n: texto? = nulo\ng(n)`, 'se esperaba texto y llegó texto?', 'tipos');
falla('«var s: texto = nulo» es un error, y la pista dice «texto?»',
  `var s: texto = nulo`, 'texto?', 'tipos');
falla('«var s: texto» sin valor también: en memoria sería nulo',
  `var s: texto\ns = "a"`, 'no tiene valor', 'tipos');
falla('«s = nulo» con «s: texto» tampoco',
  `var s: texto = "a"\ns = nulo`, 'texto?', 'tipos');
falla('una función «: texto» no devuelve nulo',
  `fn f(): texto { devolver nulo }`, 'devuelve nulo', 'tipos');
falla('ni un «texto?» sin comprobar',
  `fn f(n: texto?): texto { devolver n }`, 'devuelve texto?', 'tipos');
falla('un camino que acaba sin «devolver» ya no devuelve nulo en silencio',
  `fn f(x): entero { si x > 0 { devolver 1 } }\nimprimir(f(-1) + 1)`, 'camino que acaba sin «devolver»', 'tipos');
falla('también en una anónima',
  `fijo f = fn(x): entero { si x > 0 { devolver 1 } }`, 'camino que acaba sin «devolver»', 'tipos');
falla('el estrechamiento se acaba al salir del bloque',
  `var n: texto? = "a"\nsi n != nulo { imprimir(n + "!") }\nimprimir(n + "?")`, 'puede ser nulo', 'tipos');
falla('y asignar nulo lo deshace',
  `var n: texto? = "a"\nn = nulo\nimprimir(n + "!")`, 'puede ser nulo', 'tipos');
falla('la derecha de «o» NO sabe que la izquierda falló: «x != nulo o x.largo» sigue mal',
  `var n: texto? = "a"\nsi n != nulo o longitud(n + "") > 0 { imprimir(1) }`, 'puede ser nulo', 'tipos');
falla('el ternario de C sigue sin existir: «?» con espacio es un carácter inesperado',
  `var x = cierto ? 1 : 2`, 'carácter inesperado', 'léxico');
falla('«?» pegado a algo que no es un tipo es un error de sintaxis, no de léxico',
  `var x = cierto?`, 'no se esperaba', 'sintaxis');

console.log('── lo de antes sigue igual');
ok('«??» y «?.» sobre «cualquiera» no cambian',
  `fn f(x) { devolver x ?? "nada" }\nimprimir(f(nulo), f(1))\nvar d = {a: {b: 2}}\nvar e = nulo\nimprimir(d?.a?.b, e?.b)`, 'nada 1\n2 nulo');
ok('una función sin tipo de retorno puede devolver nulo o nada',
  `fn f(x) { si x { devolver 1 } }\nimprimir(f(cierto), f(falso))`, '1 nulo');
ok('«: nulo» y «: cualquiera» no exigen «devolver» en todos los caminos',
  `fn f(x): nulo { si x { devolver } }\nfn g(x): cualquiera { si x { devolver 1 } }\nimprimir(f(cierto), g(falso))`, 'nulo nulo');
ok('una función que acaba en «mientras cierto» con sus «devolver» dentro no necesita otro al final',
  `fn f(): entero { var i = 0\n  mientras cierto { i = i + 1\n    si i > 3 { devolver i } } }\nimprimir(f())`, '4');
ok('un «segun» con «otro» que devuelve en todas las ramas también cuenta',
  `fn f(x): texto { segun x { caso 1 { devolver "uno" } otro { devolver "otro" } } }\nimprimir(f(1), f(2))`, 'uno otro');
ok('«fijo» con nulo y una lista de nulos siguen siendo lo que eran',
  `fijo n = nulo\nfijo l = [nulo, nulo]\nimprimir(n, longitud(l))`, 'nulo 2');
ok('una «texto?» se puede comparar con «==» y pasar a «texto(…)» o «imprimir» sin comprobar',
  `var n: texto? = nulo\nimprimir(n == nulo, texto(n), n)`, 'cierto nulo nulo');

console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
