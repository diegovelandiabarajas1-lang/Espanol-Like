// motor-exp · A3 «funciones numéricas puras» en el ejecutable nativo (n-compilar).
//
// Una función de Ñ cuyos parámetros son todos números, que devuelve un número y que solo hace cuentas (+ − ×, comparaciones, lógica,
// saltos) y llamadas a otras como ella se emite como una función de C de verdad (aot/compilador.js, «PURA»): sin cajas, sin cierre,
// sin mirar el error tras cada llamada. Lo único que puede fallar es la profundidad (más de 900 marcos): baja de golpe con longjmp
// hasta la versión numérica por la que se entró y esa pone el rastro. Esta suite comprueba tres cosas:
//   1. el compilador reconoce como puras las que lo son, y NO las que dividen, usan texto o listas…
//   2. el ejecutable da lo mismo que la VM (salida y código), también en los bordes de la profundidad;
//   3. el ejecutable con puras da EXACTAMENTE lo mismo que sin ellas (N_AOT_SIN_PURAS=1), incluido el rastro del desbordamiento.
//
//   node motor-exp/pruebas/exp-aot-puras.js      (necesita gcc; si el sistema bloquea ejecutables nuevos, esa parte se salta)
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
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 8).join('\n      ')}` : '')); }
};
const hay = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
if (!hay('gcc')) { console.log('  – no hay gcc: nada que comprobar\n\n0 pasan, 0 fallan, 1 saltadas'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-puras-'));
let contador = 0;

// compila un programa de Ñ a ejecutable; devuelve { exe, c } o { error }
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
// ¿qué funciones salieron puras? (los comentarios «/* nombre/aridad (PURA …» del C)
const puras = c => [...c.matchAll(/\/\* (\S+)\/\d+ \(PURA/g)].map(m => m[1]).sort();

// ── los programas ──
const P = {};
P.fib = `fn fib(n) { si n < 2 { devolver n } devolver fib(n - 1) + fib(n - 2) }
imprimir(fib(25)); imprimir(fib(5.5)); imprimir(fib(-3)); imprimir(fib(0.5))
`;
P.encadenadas = `fn cuad(x) { devolver x * x }
fn cubo(x) { devolver cuad(x) * x }
fn poli(x, y) { devolver cubo(x) - 2 * y * y + 7 }
fn principal2() { var s = 0  var i = 0  mientras i < 20000 { s = s + poli(i, i / 3)  i = i + 1 }  devolver s }
imprimir(principal2()); imprimir(poli(1.5, -2.25)); imprimir(cubo(-0.0))
`;
P.bucles = `fn suma(n) { var s = 0  var i = 1  mientras i <= n { s = s + i  i = i + 1 }  devolver s }
fn potencia(b, e) { var r = 1  var k = 0  mientras k < e { r = r * b  k = k + 1 }  devolver r }
imprimir(suma(100000)); imprimir(potencia(2, 40)); imprimir(potencia(1.5, 10)); imprimir(suma(0)); imprimir(suma(-5))
`;
P.logica = `fn signo(x) { si x < 0 { devolver -1 } si x == 0 { devolver 0 } devolver 1 }
fn raro(a, b) { si (a < b y no (b == 3)) o a == 10 { devolver a + b } sino { devolver a - b } }
fn clampa(x, lo, hi) { si x < lo { devolver lo } si x > hi { devolver hi } devolver x }
imprimir(signo(-2)); imprimir(signo(0)); imprimir(signo(9)); imprimir(raro(1, 2)); imprimir(raro(1, 3)); imprimir(raro(10, 0)); imprimir(clampa(5, 1, 3)); imprimir(clampa(-5, 1, 3))
`;
P.parametros = `fn f(x, y) { x = x + 1  y = x * y  x = x - y  devolver x + y }
imprimir(f(1, 2)); imprimir(f(2.5, -1))
`;
P.especiales = `fn resta(x) { devolver x - x }
fn inf(x) { devolver x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x * x }
imprimir(resta(inf(1000))); imprimir(inf(1000)); imprimir(-inf(1000)); imprimir(inf(1) == inf(1)); imprimir(resta(3))
`;
P.mutua = `fn par(n) { si n == 0 { devolver 1 } devolver impar(n - 1) }
fn impar(n) { si n == 0 { devolver 0 } devolver par(n - 1) }
imprimir(par(10)); imprimir(par(11)); imprimir(par(300))
`;
// no puras: dividen, usan texto o listas, o llaman a algo que no es puro
P.no_puras = `fn dividir(a, b) { devolver a / b }
fn resto(a, b) { devolver a % b }
fn conLista(n) { var l = [1, 2, 3]  devolver l[0] + n }
fn llamaDividir(x) { devolver dividir(x, 2) + 1 }
fn texto2(n) { si n > 0 { devolver longitud("abc") } devolver 0 }
imprimir(dividir(7, 2)); imprimir(resto(7, 3)); imprimir(conLista(4)); imprimir(llamaDividir(9)); imprimir(texto2(1))
`;

// 1. qué es pura y qué no
let c = compilar(P.fib);
comprobar('1. fib es pura', !c.error && puras(c.c).join() === 'fib', c.error || puras(c.c));
c = compilar(P.encadenadas);
comprobar('1. cuad, cubo y poli (encadenadas) son puras', !c.error && ['cubo', 'cuad', 'poli'].every(n => puras(c.c).includes(n)), c.error || puras(c.c));
c = compilar(P.bucles);
comprobar('1. los bucles con variables locales entran en lo puro', !c.error && puras(c.c).join() === 'potencia,suma', c.error || puras(c.c));
c = compilar(P.logica);
comprobar('1. si/y/o/no con saltos son puras', !c.error && puras(c.c).join() === 'clampa,raro,signo', c.error || puras(c.c));
c = compilar(P.mutua);
// «par» llama a «impar», que se define DESPUÉS, pero las dos están en el tramo recto del principio (sin ninguna llamada): ninguna corre antes de que
// las dos existan. Por eso la recursión mutua también es pura (antes se descartaba por prudencia).
comprobar('1. la recursión mutua definida en el tramo recto SÍ es pura (impar, par)', !c.error && puras(c.c).join() === 'impar,par', c.error || puras(c.c));
c = compilar('fn base(x) { devolver x * 2 }\nfn media(x) { devolver base(x) + 1 }\nfn alta(x) { devolver media(x) + base(x) }\nimprimir(alta(5))\n');
comprobar('1. una cadena base → media → alta (cada una definida antes de usarse) es pura entera', !c.error && puras(c.c).join() === 'alta,base,media', c.error || puras(c.c));
c = compilar(P.no_puras);
comprobar('1. dividir, el resto, las listas, el texto y quien llama a una no pura NO son puras', !c.error && puras(c.c).length === 0, c.error || puras(c.c));
c = compilar(P.fib, { N_AOT_SIN_PURAS: '1' });
comprobar('1. N_AOT_SIN_PURAS=1 las apaga', !c.error && puras(c.c).length === 0, c.error || puras(c.c));

// 2 y 3. el ejecutable da lo mismo que la VM, y con puras lo mismo que sin ellas
let bloqueado = false;
for (const [nombre, src] of Object.entries(P)) {
  const a = compilar(src), b = compilar(src, { N_AOT_SIN_PURAS: '1' });
  if (a.error || b.error) { comprobar(`2. ${nombre}: compila`, false, a.error || b.error); continue; }
  const ra = correr(a.exe), rb = correr(b.exe);
  if (ra.bloqueado || rb.bloqueado) { bloqueado = true; saltadas++; console.log(`  – 2. ${nombre}: el sistema bloqueó el ejecutable nuevo`); continue; }
  const rv = vm(src);
  comprobar(`2. ${nombre}: el ejecutable da la salida y el código de la VM`, ra.out === rv.out && ra.codigo === rv.codigo, `VM: ${JSON.stringify(rv.out.slice(0, 160))} (${rv.codigo})\nAOT: ${JSON.stringify(ra.out.slice(0, 160))} (${ra.codigo})`);
  comprobar(`3. ${nombre}: con puras y sin ellas, EXACTAMENTE lo mismo`, ra.out === rb.out && ra.codigo === rb.codigo, `con: ${JSON.stringify(ra.out.slice(0, 160))}\nsin: ${JSON.stringify(rb.out.slice(0, 160))}`);
}

// 4. la profundidad: el borde exacto desde una función normal, y el rastro del desbordamiento
const PROF = `fn prof(n) { si n == 0 { devolver 0 } devolver prof(n - 1) + 1 }
fn prueba(n) { intentar { devolver prof(n) } capturar (e) { devolver -1 } }
fn barrido() { var n = 860  var primero = -1  mientras n < 910 { si prueba(n) < 0 y primero < 0 { primero = n }  n = n + 1 }  devolver primero }
imprimir(prueba(10)); imprimir(prueba(850)); imprimir(barrido())
`;
{
  const a = compilar(PROF), b = compilar(PROF, { N_AOT_SIN_PURAS: '1' });
  if (a.error || b.error) comprobar('4. profundidad: compila', false, a.error || b.error);
  else {
    comprobar('4. prof es pura (y puede desbordar)', puras(a.c).join() === 'prof' && /puede desbordar/.test(a.c), puras(a.c));
    const ra = correr(a.exe), rb = correr(b.exe);
    if (ra.bloqueado || rb.bloqueado) { saltadas++; console.log('  – 4. el sistema bloqueó el ejecutable nuevo'); }
    else {
      const rv = vm(PROF);
      // (la VM y el ejecutable ya difieren en 2 marcos del borde desde antes de las puras —899 contra 897—: lo que debe cumplirse es que
      // con puras el borde sea EXACTAMENTE el de sin puras)
      comprobar('4. el borde de la profundidad (primer n que desborda, desde dentro de «barrido») es el mismo con puras que sin ellas', ra.out === rb.out, `con: ${JSON.stringify(ra.out)}\nsin: ${JSON.stringify(rb.out)}`);
      comprobar('4. y las dos primeras líneas (el 10 y el 850, que caben) son las de la VM', ra.out.split('\n').slice(0, 2).join() === rv.out.split('\n').slice(0, 2).join(), `VM: ${JSON.stringify(rv.out)}\nAOT: ${JSON.stringify(ra.out)}`);
    }
  }
}
const INFINITA = `fn f(n) { devolver f(n + 1) + 1 }
fn g(n) { devolver h(n) + 1 }
fn h(n) { devolver g(n + 1) + 1 }
imprimir("antes")
imprimir(f(1))
imprimir("despues")
`;
const INFINITA2 = INFINITA.replace('imprimir(f(1))', 'imprimir(g(1))');
for (const [nombre, src] of [['recursión infinita simple', INFINITA], ['recursión infinita mutua', INFINITA2]]) {
  const a = compilar(src), b = compilar(src, { N_AOT_SIN_PURAS: '1' });
  if (a.error || b.error) { comprobar(`4. ${nombre}: compila`, false, a.error || b.error); continue; }
  const ra = correr(a.exe), rb = correr(b.exe);
  if (ra.bloqueado || rb.bloqueado) { saltadas++; console.log(`  – 4. ${nombre}: el sistema bloqueó el ejecutable nuevo`); continue; }
  const rv = vm(src);
  // (la primera línea del rastro de una recursión MUTUA ya difería entre la VM y el ejecutable —h contra g— desde antes de las puras)
  comprobar(`4. ${nombre}: el mismo código de salida y el mismo mensaje (3 primeras líneas) que la VM`, ra.codigo === rv.codigo && ra.out.split('\n').slice(0, 3).join('\n') === rv.out.split('\n').slice(0, 3).join('\n'), `VM: ${JSON.stringify(rv.out.split('\n').slice(0, 3))}\nAOT: ${JSON.stringify(ra.out.split('\n').slice(0, 3))}`);
  // el rastro: con puras repite el nombre de la función que desbordó; sin ellas, el de cada marco (mismo texto si las líneas coinciden)
  if (nombre === 'recursión infinita simple') comprobar(`4. ${nombre}: el rastro con puras es idéntico al de sin puras`, ra.out === rb.out, `con: ${ra.out.split('\n').length} líneas · sin: ${rb.out.split('\n').length} líneas`);
  else {
    comprobar(`4. ${nombre}: el rastro con puras tiene las mismas líneas de cabecera y el mismo tamaño que sin puras`,
      ra.out.split('\n').slice(0, 3).join() === rb.out.split('\n').slice(0, 3).join() && ra.out.split('\n').length === rb.out.split('\n').length,
      `con: ${ra.out.split('\n').length} líneas · sin: ${rb.out.split('\n').length}`);
  }
}

console.log(`\n${pasan} pasan, ${fallan} fallan${saltadas ? `, ${saltadas} saltadas` : ''}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fallan ? 1 : 0);
