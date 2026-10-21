// motor-exp · fase N1 (NEÑ): precisión y tipos, amplitud, rendimiento en volumen
// y numerico + datos dentro de «nen».
//
// Qué se comprueba, y contra qué:
//   · unión      — nen trae TODO numerico y datos, con el MISMO objeto (no copias),
//                  y las tres que chocan (fila, donde, apilar) eligen por el tipo.
//   · grande     — 34 valores contra mpmath (pruebas/datos-nen/precision-mpmath.json):
//                  el resultado tiene que ser el de mpmath redondeado a esas cifras,
//                  cifra a cifra. Y los operadores, las comparaciones, el checker.
//   · exactos    — factoriales, potencias, combinaciones y Fibonacci contra BigInt.
//   · amplitud   — 257 valores contra SciPy (pruebas/datos-nen/amplitud-scipy.json)
//                  a 1e-11 relativo; el muestreo con semilla, reproducible y con
//                  medias y varianzas razonables.
//   · volumen    — suma, media, varianza y «por» sobre arreglos dan EXACTAMENTE lo
//                  mismo que antes (sobre listas), con y sin JIT.
require(require('../rutas.js').bundle);
const path = require('path');
const EL = globalThis.EspanolLike;
const { crearMotor } = EL;

let pasan = 0, fallan = 0;
const fallos = [], notas = [];

function corre(src, opts) {
  const out = [];
  const m = crearMotor(Object.assign({ salida: s => out.push(s), limiteInstr: 5e8, host: {} }, opts || {}));
  const r = m.ejecutar(src);
  return { r, out, m };
}
const msgDe = r => r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ');
function ok(nombre, src, esperado, opts) {
  const { r, out } = corre(src, opts);
  if (!r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    ERROR: ${msgDe(r)}`); return; }
  const got = out.join('\n');
  if (got !== esperado) { fallan++; fallos.push(`✗ ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(got)}`); return; }
  pasan++;
}
function falla(nombre, src, fragmento) {
  const { r } = corre(src);
  if (r.ok) { fallan++; fallos.push(`✗ ${nombre}\n    se esperaba un error y el programa corrió bien`); return; }
  const msg = msgDe(r);
  if (fragmento && !msg.toLowerCase().includes(fragmento.toLowerCase())) {
    fallan++; fallos.push(`✗ ${nombre}\n    el error no dice «${fragmento}»: ${msg}`); return;
  }
  pasan++;
}
function comprobar(nombre, cond, detalle) {
  if (cond) pasan++;
  else { fallan++; fallos.push(`✗ ${nombre}` + (detalle ? `\n    ${detalle}` : '')); }
}
// Con JIT y sin JIT la salida tiene que ser la misma, carácter por carácter.
function igualConYSinJit(nombre, src) {
  const a = corre(src, { jit: true }), b = corre(src, { jit: false });
  const ka = a.r.ok ? a.out.join('\n') : 'E:' + msgDe(a.r), kb = b.r.ok ? b.out.join('\n') : 'E:' + msgDe(b.r);
  comprobar(`${nombre}: con y sin JIT dan lo mismo`, ka === kb && a.r.ok, `con JIT: ${ka.slice(0, 300)}\n    sin JIT: ${kb.slice(0, 300)}`);
}

// ───────────────────────────────────────────── 1. la unión: nen trae numerico y datos
{
  const m = crearMotor({ salida: () => {}, host: {} });
  const g = m.vm.globals;
  const clave = e => EL.nombreGlobalModulo(EL.claveEdsl(e), '');
  const de = e => [...g.keys()].filter(k => k.startsWith(clave(e))).map(k => k.slice(clave(e).length));
  const nen = new Set(de('nen'));
  const CHOQUES = new Set(['fila', 'donde', 'apilar']);
  let faltan = [], copias = [];
  for (const e of ['numerico', 'datos']) {
    for (const n of de(e)) {
      if (!nen.has(n)) { faltan.push(`${e}.${n}`); continue; }
      if (CHOQUES.has(n)) continue;
      if (g.get(EL.nombreGlobalModulo(EL.claveEdsl('nen'), n)) !== g.get(EL.nombreGlobalModulo(EL.claveEdsl(e), n))) copias.push(`${e}.${n}`);
    }
  }
  comprobar(`nen trae los ${de('numerico').length} nombres de numerico y los ${de('datos').length} de datos`, !faltan.length, 'faltan: ' + faltan.slice(0, 20).join(', '));
  comprobar('y son el MISMO objeto, no una copia (fila, donde y apilar aparte)', !copias.length, 'copias: ' + copias.slice(0, 20).join(', '));
  notas.push(`  unión: nen tiene ${nen.size} nombres (${de('numerico').length} de numerico, ${de('datos').length} de datos)`);
}
ok('un programa solo con «nen» usa media, arreglo, deRegistros y donde',
  'usar media, arreglo, deRegistros, donde, columna de "nen"\n' +
  'fijo t = deRegistros([{"x": 1}, {"x": 5}, {"x": 9}])\n' +
  'imprimir(media(columna(donde(t, fn(f) { devolver f["x"] > 2 }), "x")))\n' +
  'imprimir(media(arreglo([1.0, 2.0, 6.0])))',
  '7\n3');
ok('fila: con tabla un diccionario, con arreglo la vista de la fila',
  'usar fila, deRegistros, arreglo de "nen"\n' +
  'imprimir(fila(deRegistros([{"a": 1}, {"a": 2}]), 1))\nimprimir(fila(arreglo([[1, 2], [3, 4]]), 1))',
  '{a: 2}\narreglo 2 de entero\n[3, 4]');
ok('donde: con tabla filtra filas, con arreglos es el «si» elemento a elemento',
  'usar donde, deRegistros, arreglo, mayorQue, aRegistros de "nen"\n' +
  'imprimir(aRegistros(donde(deRegistros([{"a": 1}, {"a": 7}]), fn(f) { devolver f["a"] > 3 })))\n' +
  'fijo x = arreglo([-1.0, 2.0])\nimprimir(donde(mayorQue(x, 0), x, 0))',
  '[{a: 7}]\narreglo 2 de real\n[0, 2]');
ok('apilar: tablas una debajo de otra, arreglos en un eje nuevo',
  'usar apilar, deRegistros, arreglo, aRegistros, forma de "nen"\n' +
  'imprimir(longitud(aRegistros(apilar(deRegistros([{"a": 1}]), deRegistros([{"a": 2}])))))\nimprimir(forma(apilar(arreglo([1, 2]), arreglo([3, 4]))))',
  '2\n[2, 2]');
ok('«usar numerico» y «usar nen» a la vez no chocan (el mismo objeto)',
  'usar media de "numerico"\nusar suma de "nen"\nimprimir(media([1, 2]), suma([1, 2]))', '1.5 3');

// ───────────────────────────────────────────── 2. grande: contra mpmath
// El texto de Ñ y el de mpmath se comparan como números decimales: mantisa
// entera y exponente, sin ceros al final. Así «2.50» y «2.5e0» son lo mismo.
const norm = s => {
  s = String(s).trim();
  const m = /^(-?)(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  if (!m) return 'NO ES UN NÚMERO: ' + s;
  let dig = (m[2] + m[3]).replace(/^0+/, '');
  let exp = Number(m[4] || 0) - m[3].length;
  if (!dig) return '0';
  while (dig.endsWith('0')) { dig = dig.slice(0, -1); exp++; }
  return `${m[1]}${dig}e${exp}`;
};
{
  const casos = require(path.join(__dirname, 'datos-nen', 'precision-mpmath.json'));
  const usar = 'usar grande, raizGrande, piGrande, eGrande, expGrande, logGrande, senoGrande, cosenoGrande, tangenteGrande, ' +
    'arcotangenteGrande, arcosenoGrande, arcocosenoGrande, potenciaGrande de "nen"\n';
  const { r, out } = corre(usar + casos.map(([e]) => `imprimir(${e})`).join('\n'));
  if (!r.ok) { fallan++; fallos.push(`✗ grande contra mpmath: el programa no corrió: ${msgDe(r)}`); }
  else {
    const malos = casos.map(([e, ref], i) => [e, ref, out[i]]).filter(([, ref, v]) => norm(ref) !== norm(v));
    comprobar(`grande: ${casos.length} valores iguales a mpmath cifra a cifra (raíz, π, e, exp, ln, sen, cos, tan, arcos, potencias, división)`,
      !malos.length, malos.slice(0, 4).map(([e, ref, v]) => `${e}\n      mpmath: ${ref}\n      Ñ:      ${v}`).join('\n    '));
  }
}
ok('grande: los enteros y los textos sin coma son exactos; 0.1 + 0.2 == 0.3',
  'usar grande, esExacto de "nen"\nimprimir(grande(2) ** 100)\nimprimir(grande("0.1") + grande("0.2") == grande("0.3"))\nimprimir(esExacto(grande(10) ** 40), esExacto(grande(1) / 3))',
  '1267650600228229401496703205376\ncierto\ncierto falso');
ok('grande: con reales se mezcla por su valor decimal más corto, y las comparaciones van al bit',
  'usar grande de "nen"\nfijo g = grande("0.1")\nimprimir(g == 0.1, g < 0.11, g > 0.1, -g)\nimprimir(g * 3, 3 * g, g + 1, 1 - g)',
  'cierto cierto falso -0.1\n0.3 0.3 1.1 0.9');
ok('grande: cifrasGrande cambia las cifras de lo que se cree después y devuelve las de antes',
  'usar grande, cifrasGrande, cifrasDe de "nen"\nfijo antes = cifrasGrande(20)\nfijo a = grande(1) / 7\ncifrasGrande(antes)\nfijo b = grande(1) / 7\nimprimir(antes, cifrasDe(a), cifrasDe(b))\nimprimir(a)',
  '50 20 50\n0.14285714285714285714');
ok('grande: grandeExactoDe enseña el binario de verdad de 0.1',
  'usar grandeExactoDe de "nen"\nimprimir(grandeExactoDe(0.1))', '0.1000000000000000055511151231257827021181583404541015625');
ok('grande: decimalesGrande y redondearGrande redondean al par',
  'usar grande, decimalesGrande, redondearGrande, piGrande de "nen"\nimprimir(decimalesGrande(piGrande(30), 5))\nimprimir(redondearGrande(grande("2.5"), 1), redondearGrande(grande("3.5"), 1), redondearGrande(grande("0.125"), 2))',
  '3.14159\n2 4 0.12');
ok('grande: aReal y real() devuelven el real más cercano; entero() el entero exacto si cabe',
  'usar grande, aReal, potenciaExacta de "nen"\nfijo g = grande(1) / 3\nimprimir(aReal(g) == 1.0 / 3.0, real(g) == 1.0 / 3.0)\nimprimir(entero(potenciaExacta(2, 52)))',
  'cierto cierto\n4503599627370496');
ok('grande: el checker lo trata como un número propio (tipo, ramas, funciones)',
  'usar grande de "nen"\nfn doble(x: grande) -> grande { devolver x * 2 }\nfijo g: grande = grande("1.5")\nimprimir(tipo(g), doble(g))\nsi g > 1 { imprimir("mayor") }\nimprimir(tipo(g + 1), tipo(g < 2))',
  'grande 3\nmayor\ngrande bool');
ok('grande: verdad y repr: el cero es falso, y en listas sale como número',
  'usar grande de "nen"\nsi grande(0) { imprimir("no") } sino { imprimir("cero es falso") }\nimprimir([grande(1) / 4, grande(7)])',
  'cero es falso\n[0.25, 7]');
falla('grande: dividir entre cero es un error claro', 'usar grande de "nen"\nimprimir(grande(1) / grande(0))', 'división entre cero');
falla('grande: la raíz de un negativo es un error', 'usar raizGrande de "nen"\nimprimir(raizGrande(-2, 30))', '');
falla('grande: un texto que no es número se dice', 'usar grande de "nen"\nimprimir(grande("abc"))', 'no es un número');
ok('grande: la coma decimal también vale en el texto', 'usar grande de "nen"\nimprimir(grande("1,5") == grande("1.5"))', 'cierto');
igualConYSinJit('grande en un bucle (suma de 1/k² con 40 cifras)',
  'usar grande, cifrasGrande de "nen"\ncifrasGrande(40)\nfn s(n) {\n  var t = grande(0)\n  para k en rango(1, n + 1) { t = t + grande(1) / (k * k) }\n  devolver t\n}\nimprimir(s(200))\nimprimir(s(200) < 2)');

// ───────────────────────────────────────────── 3. enteros exactos contra BigInt
{
  const fact = n => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };
  const comb = (n, k) => fact(n) / (fact(k) * fact(n - k));
  const fib = n => { let a = 0n, b = 1n; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };
  ok('exactos: factorial, potencia, combinaciones y Fibonacci iguales a BigInt',
    'usar factorialExacto, potenciaExacta, combinacionesExactas, fibonacciExacto, cifrasExactas de "nen"\n' +
    'imprimir(cifrasExactas(factorialExacto(200)))\nimprimir(potenciaExacta(2, 1000))\nimprimir(potenciaExacta(-7, 33))\n' +
    'imprimir(combinacionesExactas(300, 150))\nimprimir(fibonacciExacto(1500))',
    [fact(200), 2n ** 1000n, (-7n) ** 33n, comb(300, 150), fib(1500)].map(String).join('\n'));
}
ok('exactos: mcd, primalidad (Mersenne M127 sí, 2^128+1 no) y la aritmética sigue exacta',
  'usar mcdExacto, esPrimoExacto, potenciaExacta, factorialExacto, esExacto de "nen"\n' +
  'imprimir(mcdExacto(factorialExacto(30), potenciaExacta(2, 40)))\nimprimir(esPrimoExacto(potenciaExacta(2, 127) - 1), esPrimoExacto(potenciaExacta(2, 128) + 1), esPrimoExacto(97))\n' +
  'fijo x = factorialExacto(40) * factorialExacto(40) - factorialExacto(40) ** 2\nimprimir(x, esExacto(x))',
  '67108864\ncierto falso cierto\n0 cierto');
falla('numerico.factorial: el error de 171! dice dónde está el exacto (factorialExacto)',
  'usar factorial de "numerico"\nimprimir(factorial(171))', 'factorialExacto');

// ───────────────────────────────────────────── 4. amplitud: contra SciPy
{
  const casos = require(path.join(__dirname, 'datos-nen', 'amplitud-scipy.json'));
  const m = crearMotor({ salida: () => {}, host: {} });
  const vm = m.vm;
  let malos = [], peor = 0;
  for (const [nombre, args, esperado] of casos) {
    const f = vm.globals.get(EL.nombreGlobalModulo(EL.claveEdsl('nen'), nombre));
    let v;
    try { v = f.fn(args, vm); } catch (e) { malos.push(`${nombre}(${args}): ERROR ${e.message}`); continue; }
    const err = (esperado === 0) ? Math.abs(v - esperado) : Math.abs(v - esperado) / Math.abs(esperado);
    if (v === esperado) continue;
    if (!(err <= 1e-11)) malos.push(`${nombre}(${args.join(', ')}) = ${v} y SciPy ${esperado} (${err.toExponential(1)})`);
    else peor = Math.max(peor, err);
  }
  const fns = new Set(casos.map(c => c[0])).size;
  comprobar(`amplitud: ${casos.length} valores de ${fns} funciones iguales a SciPy a 1e-11 (peor ${peor.toExponential(1)})`, !malos.length, malos.slice(0, 5).join('\n    '));
}
{
  // muestreo: reproducible con semilla, y momentos razonables con 20 000
  const N = 20000;
  const pruebas = [
    ['azarExponencial(2.0, N)', 0.5, 0.25], ['azarGamma(3, 2, N)', 6, 12], ['azarBeta(2, 5, N)', 2 / 7, 10 / 392],
    ['azarChiCuadrado(4, N)', 4, 8], ['azarTStudent(10, N)', 0, 10 / 8], ['azarPoisson(4, N)', 4, 4], ['azarPoisson(250, N)', 250, 250],
    ['azarBinomial(20, 0.3, N)', 6, 4.2], ['azarBinomial(1000, 0.4, N)', 400, 240], ['azarLogNormal(0, 0.5, N)', Math.exp(0.125), (Math.exp(0.25) - 1) * Math.exp(0.25)],
    ['azarWeibull(1.5, 2, N)', 2 * 0.9027452929509336, 4 * (1.1906393022884082 - 0.9027452929509336 ** 2)],   // λ²[Γ(1+2/k) − Γ(1+1/k)²]
  ];
  const src = 'usar azarExponencial, azarGamma, azarBeta, azarChiCuadrado, azarTStudent, azarPoisson, azarBinomial, azarLogNormal, azarWeibull, azarCauchy, semilla, media, varianza de "nen"\n' +
    `fijo N = ${N}\nsemilla(2026)\n` + pruebas.map(([e]) => `fijo x${pruebas.findIndex(p => p[0] === e)} = ${e}\nimprimir(media(x${pruebas.findIndex(p => p[0] === e)}), varianza(x${pruebas.findIndex(p => p[0] === e)}))`).join('\n') +
    '\nsemilla(5)\nfijo c1 = azarCauchy(0, 1, 5)\nsemilla(5)\nfijo c2 = azarCauchy(0, 1, 5)\nimprimir(c1 == c2)';
  const { r, out } = corre(src);
  if (!r.ok) { fallan++; fallos.push(`✗ muestreo: ${msgDe(r)}`); }
  else {
    const malos = [];
    pruebas.forEach(([e, mu, v2], i) => {
      const [m, s2] = out[i].split(' ').map(Number);
      // la media a 5 errores típicos; la varianza a un 8 %
      if (Math.abs(m - mu) > 5 * Math.sqrt(v2 / N) || Math.abs(s2 - v2) > 0.08 * v2) malos.push(`${e}: media ${m} (teórica ${mu}), varianza ${s2} (teórica ${v2})`);
    });
    comprobar(`muestreo: ${pruebas.length} distribuciones con media y varianza de la teoría (${N} muestras)`, !malos.length, malos.join('\n    '));
    comprobar('muestreo: la misma semilla da las mismas muestras', out[out.length - 1] === 'cierto');
  }
  const a = corre(src), b = corre(src);
  comprobar('muestreo: dos corridas con la misma semilla dan exactamente lo mismo', a.out.join('\n') === b.out.join('\n'));
}
ok('amplitud: unas cuantas identidades conocidas',
  'usar lambertW, integralSeno, dilogaritmo, trigamma, sinc, hipergeometrica, log, exp, absoluto, casiIgual de "nen"\nfijo pi = |PI\n' +
  'fijo w = lambertW(3.0)\nimprimir(casiIgual(w * exp(w), 3.0))\nimprimir(casiIgual(integralSeno(1.0e6), pi / 2, 1.0e-5))\n' +
  'imprimir(casiIgual(dilogaritmo(1.0), pi * pi / 6), casiIgual(trigamma(1.0), pi * pi / 6))\nimprimir(sinc(0.0), absoluto(sinc(1.0)) < 1.0e-15)\n' +
  'imprimir(casiIgual(hipergeometrica(1, 1, 2, 0.5), -log(0.5) / 0.5))',
  'cierto\ncierto\ncierto cierto\n1 cierto\ncierto');
falla('amplitud: fuera de dominio es un error, no un NaN callado', 'usar lambertW de "nen"\nimprimir(lambertW(-1.0))', '');

// ───────────────────────────────────────────── 5. volumen: lo mismo que antes, más rápido
// Antes, suma/media/varianza copiaban el arreglo a una lista y sumaban con
// reduce; ahora leen los datos del arreglo. El orden de la suma es el mismo,
// así que el resultado tiene que ser IDÉNTICO al de la lista.
// (motor-exp N2) suma, media, varianza y desviación de un arreglo REAL van por
// la reducción de NEÑ: por trozos de 4096 en orden. Con 4096 números o menos es
// la suma de izquierda a derecha de siempre (igual que la de la lista); con más,
// los trozos se suman entre sí. Aquí se rehace en JavaScript y se exige el
// mismo número, al bit.
{
  const porTrozos = v => {
    const parciales = [];
    for (let i = 0; i < v.length; i += 4096) { let s = 0; for (let k = i; k < Math.min(i + 4096, v.length); k++) s += v[k]; parciales.push(s); }
    return parciales.length === 1 ? parciales[0] : porTrozos(parciales);
  };
  const m = crearMotor({ salida: () => {}, host: {} });
  const vm = m.vm, G = n => vm.globals.get(EL.nombreGlobalModulo(EL.claveEdsl('nen'), n));
  G('semilla').fn([9], vm);
  const x = G('azarArreglo').fn([vm.nuevaLista([100000])], vm), v = Array.from(x.datos);
  const s = porTrozos(v), mu = s / v.length;
  const desv = porTrozos(v.map(q => (q - mu) * (q - mu))) / (v.length - 1);
  const suma = G('suma').fn([x], vm), media = G('media').fn([x], vm), varianza = G('varianza').fn([x], vm), desviacion = G('desviacion').fn([x], vm);
  comprobar('volumen: suma, media, varianza y desviación de 100 000 = por trozos de 4096, al bit',
    suma === s && media === mu && varianza === desv && desviacion === Math.sqrt(desv), `${suma} ${s} · ${varianza} ${desv}`);
  const y = G('azarArreglo').fn([vm.nuevaLista([4000])], vm), l = vm.nuevaLista(Array.from(y.datos));
  comprobar('volumen: con 4096 o menos, igual que la suma de la lista (izquierda a derecha)',
    G('suma').fn([y], vm) === G('suma').fn([l], vm) && G('varianza').fn([y], vm) === G('varianza').fn([l], vm));
}
ok('volumen: los enteros y las formas siguen igual',
  'usar suma, media, arreglo de "nen"\nfijo v = arreglo([[1, 2, 3], [4, 5, 6]])\nimprimir(suma(v), media(v), tipo(suma(arreglo([1, 2, 3]))))',
  '21 3.5 entero');
ok('volumen: suma y media de una vista no seguida (transpuesta) siguen bien',
  'usar arreglo, transpuesta, suma, media, esVista, aListaA de "nen"\nfijo a = arreglo([[1.0, 2.0], [3.0, 4.0]])\nfijo t = transpuesta(a)\nimprimir(esVista(t), suma(t), media(t), suma(t) == suma(aListaA(t)[0]) + suma(aListaA(t)[1]))',
  'cierto 10 2.5 cierto');
ok('volumen: «por» con bloques de 4×8 da lo mismo que multMatriz en listas, al bit',
  'usar azarArreglo, semilla, por, multMatriz, aListaA, arreglo de "nen"\nsemilla(4)\n' +
  'fijo A = azarArreglo([37, 301])\nfijo B = azarArreglo([301, 19])\n' +
  'fijo C = aListaA(por(A, B))\nfijo D = multMatriz(aListaA(A), aListaA(B))\nimprimir(C == D)\n' +
  'imprimir(aListaA(por(arreglo([[1, 2], [3, 4]]), arreglo([[5, 6], [7, 8]]))))',
  'cierto\n[[19, 22], [43, 50]]');
igualConYSinJit('volumen: un programa con arreglos, reducciones y matrices',
  'usar reparto, senoA, suma, media, por, azarArreglo, semilla de "nen"\nsemilla(1)\nfijo x = reparto(0.0, 1.0, 50000)\n' +
  'imprimir(suma(senoA(x)), media(x * 2 + 1))\nfijo A = azarArreglo([20, 20])\nimprimir(suma(por(A, A)))');
// En el LTS «arreglo([1.0, 2.0])» salía «de entero»: 1.0 y 2.0 son enteros por
// su valor y el tipo se deducía de los valores. Ahora un literal real escrito
// con punto hace el arreglo real (cambio de N1, a propósito).
ok('checker: arreglo([1.0, 2.0]) es real, como se escribió',
  'usar arreglo, tipoArreglo de "nen"\nimprimir(tipoArreglo(arreglo([1.0, 2.0])), tipoArreglo(arreglo([1, 2])), tipoArreglo(arreglo([1.5, 2])))', 'real entero real');

// ───────────────────────────────────────────── resultados
console.log('');
for (const f of fallos) console.log(f);
for (const l of notas) console.log(l);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
