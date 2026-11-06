// exp-aot-corrutinas.js — generadores y funciones asíncronas en el ejecutable nativo (aot/nrt_corrutinas.inc).
// Los programas y lo que deben imprimir son los de exp-expresividad2.js (X4, la VM); aquí se compilan con n-compilar y se corren como ejecutable.
// Al final, casos que añade el nativo (se comparan con la VM). Se salta sin compilador de C.   node motor-exp/pruebas/exp-aot-corrutinas.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const N_COMP = path.join(RAIZ, 'util', 'n-compilar.js'), N_NODE = path.join(RAIZ, 'util', 'n-node.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-corr-'));
{
  fs.writeFileSync(path.join(tmp, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [N_COMP, path.join(tmp, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && spawnSync('gcc', ['--version']).status !== 0 && !process.env.C1EN_CC) { console.log('  (sin compilador de C)\nexp-aot-corrutinas: saltada entera'); process.exit(0); }
}
let pasan = 0, fallan = 0, saltadas = 0, n = 0;
const fallos = [];
const sinTraza = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n');
function nativo(src) {
  const f = path.join(tmp, `p${n++}.esl`), exe = path.join(tmp, `p${n}.exe`);
  fs.writeFileSync(f, src);
  const c = spawnSync(process.execPath, [N_COMP, f, '-o', exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (c.status !== 0) return { compila: false, msg: sinTraza(((c.stdout || '') + (c.stderr || '')).trim()) };
  const r = spawnSync(exe, [], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26 });
  return { compila: true, status: r.status, out: sinTraza((r.stdout || '').replace(/\n$/, '')), err: r.stderr || '' };
}
function enVM(src) {
  const f = path.join(tmp, `v${n++}.esl`);
  fs.writeFileSync(f, src);
  const r = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: r.status, out: sinTraza((r.stdout || '').replace(/\n$/, '')) };
}
function ok(nombre, src, esperado) {
  if (/\bpedir\(/.test(src)) { saltadas++; return; }
  const r = nativo(src);
  if (!r.compila) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${r.msg.split('\n').slice(0, 3).join(' | ')}`); return; }
  if (r.out !== esperado) { fallan++; fallos.push(`✗ ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(r.out)} (código ${r.status})`); return; }
  pasan++;
}
function falla(nombre, src, fragmento, etapa) {
  const r = nativo(src);
  if (etapa !== 'ejecución') {
    if (r.compila) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error al compilar y compiló`); return; }
    if (fragmento && !r.msg.includes(fragmento)) { fallan++; fallos.push(`✗ ${nombre}\n    el error no dice «${fragmento}»\n    dijo: ${r.msg}`); return; }
    pasan++; return;
  }
  if (!r.compila) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${r.msg.split('\n').slice(0, 3).join(' | ')}`); return; }
  if (r.status === 0) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y corrió bien: ${r.out}`); return; }
  if (fragmento && !r.out.includes(fragmento)) { fallan++; fallos.push(`✗ ${nombre}\n    el error no dice «${fragmento}»\n    dijo: ${r.out}`); return; }
  pasan++;
}
function mismo(nombre, src) {
  const a = enVM(src), b = nativo(src);
  if (!b.compila) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${b.msg.split('\n').slice(0, 3).join(' | ')}`); return; }
  if (a.out !== b.out || a.status !== b.status) { fallan++; fallos.push(`✗ ${nombre}\n    VM: ${JSON.stringify(a.out)} (${a.status})\n    nativo: ${JSON.stringify(b.out)} (${b.status})`); return; }
  pasan++;
}
const igual = mismo;

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


// ══════════════════════════════ lo que añade el nativo (se compara con la VM)
const U2 = 'usar siguiente, terminado, recoger, dormir, todas de "corrutinas"\n';
igual('un generador dentro de otro, anidado en tres niveles', U2 + `fn a(n) { para i en rango(n) { producir i } }
fn b(n) { para x en a(n) { para y en a(2) { producir x * 10 + y } } }
fn c(n) { para z en b(n) { producir z + 1 } }
imprimir(recoger(c(3)))`);
igual('un generador que no se termina de recorrer y se suelta', U2 + `fn g() { var i = 0
  mientras cierto { producir i
    i = i + 1 } }
var tot = 0
repetir 200 { fijo x = g()
  tot = tot + siguiente(x) + siguiente(x) + siguiente(x) }
imprimir(tot)`);
igual('muchos generadores vivos a la vez', U2 + `fn g(k) { var i = 0
  mientras cierto { producir i * k
    i = i + 1 } }
var gs = []
para k en rango(300) { agregar(gs, g(k)) }
var s = 0
para r en rango(3) { para x en gs { s = s + siguiente(x) } }
imprimir(s)`);
igual('un generador con muchos valores', U2 + `fn g(n) { var i = 0
  mientras i < n { producir i
    i = i + 1 } }
var s = 0
para x en g(200000) { s = s + x }
imprimir(s)`);
igual('recursión DENTRO de un generador (inorden de un árbol)', U2 + `fn inorden(t) { si t == nulo { devolver }
  para x en inorden(t["i"]) { producir x }
  producir t["v"]
  para x en inorden(t["d"]) { producir x } }
fn arbol(a, b) { si a > b { devolver nulo }
  fijo m = (a + b) // 2
  devolver { "v": m, "i": arbol(a, m - 1), "d": arbol(m + 1, b) } }
imprimir(recoger(inorden(arbol(1, 40))))`);
igual('recursión honda dentro de un generador', U2 + `fn hondo(n) { si n == 0 { devolver 0 }
  devolver 1 + hondo(n - 1) }
fn g() { producir hondo(500)
  producir hondo(800) }
imprimir(recoger(g()))`);
igual('desbordamiento de pila dentro de un generador', U2 + `fn hondo(n) { si n == 0 { devolver 0 }
  devolver 1 + hondo(n - 1) }
fn g() { producir hondo(50000) }
intentar { imprimir(recoger(g())) } capturar (e) { imprimir("capturado", e["mensaje"]) }`);
igual('varias asíncronas intercaladas por el tiempo', U2 + `fn t(nombre, ms, cuantas) { para i en rango(cuantas) { esperar dormir(ms)
    imprimir(nombre + texto(i)) } }
fn principal() { esperar todas([t("a", 30, 3), t("b", 50, 2), t("c", 20, 4)])
  imprimir("fin") }
principal()`);
igual('un error sin capturar en un turno (después de dormir)', U2 + `fn mal() { esperar dormir(20)
  lanzar "tarde" }
fn principal() { mal()
  imprimir("sigo") }
principal()
imprimir("main acaba")`);
igual('una asíncrona que falla y nadie espera, en el primer tramo', U2 + `fn mal() { lanzar "pronto" }
fn principal() { mal()
  imprimir("sigo") }
principal()`);
igual('capturar y seguir esperando', U2 + `fn mal(ms) { esperar dormir(ms)
  lanzar "roto" + texto(ms) }
fn principal() { para ms en [10, 20, 30] { intentar { esperar mal(ms) } capturar (e) { imprimir("ok", texto(e)) } }
  imprimir("fin") }
principal()`);
igual('esperar una promesa ya cumplida y una pendiente', U2 + `fn f() { esperar dormir(5)
  devolver 7 }
fn principal() { fijo p = f()
  esperar dormir(30)
  imprimir(terminado(p))
  imprimir(esperar p, esperar p) }
principal()`);
igual('tipo, imprimir y estado de un generador y de una promesa', U2 + `fn g() { producir 1 }
fn f() { esperar dormir(5)
  devolver 1 }
fijo a = g()
fijo p = f()
imprimir(a, p, tipo(a), tipo(p))
recoger(a)
imprimir(a)`);
igual('un generador con argumentos con defecto y un cierre', U2 + `fn g(n, paso = 2) { var i = 0
  mientras i < n { producir i
    i = i + paso } }
fijo h = g
imprimir(recoger(g(7)), recoger(h(7, 3)), recoger(g(n: 5, paso: 4)))`);
igual('un generador sobre las claves de un dic', U2 + `fn pares(d) { para k en claves(d) { fijo v = d[k]
    producir k + texto(v) } }
fijo m = { "a": 1, "b": 2, "c": 3 }
imprimir(recoger(pares(m)))`);
igual('el error de main con un temporizador pendiente', U2 + `fn f() { esperar dormir(10)
  imprimir("tarde") }
f()
imprimir([1, 2][5])`);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan · ${saltadas} saltadas\n`);
process.exit(fallan ? 1 : 0);
