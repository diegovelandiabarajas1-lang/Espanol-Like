// ============================================================================
//  Fase 2 — excepciones. Lo que se prueba aquí no es que «funcione el caso
//  bonito», sino los sitios donde estas construcciones se rompen en silencio:
//  el desenrollado entre marcos de llamada, los «finalmente» que tienen que
//  correr aunque se salga por devolver o romper, y las fugas de pila y de
//  manejadores que no dan error hasta mucho después.
// ============================================================================
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 260) : ''); }
};

function corre(src, opts) {
  const out = [];
  const m = crearMotor(Object.assign({ salida: s => out.push(s), host: {}, limiteInstr: 5e7 }, opts || {}));
  const r = m.ejecutar(src);
  return { r, out, m, texto: out.join('|') };
}
const da = (nombre, src, esperado, opts) => {
  const c = corre(src, opts);
  if (!c.r.ok) { comprobar(nombre, false, c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')); return c; }
  comprobar(nombre, c.texto === esperado, `esperado: ${esperado}\n      obtenido: ${c.texto}`);
  return c;
};
const falla = (nombre, src, fragmento, opts) => {
  const c = corre(src, opts);
  if (c.r.ok) { comprobar(nombre, false, 'no dio error · salida: ' + c.texto); return c; }
  const msg = c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ');
  comprobar(nombre, !fragmento || msg.toLowerCase().includes(fragmento.toLowerCase()), msg);
  return c;
};

console.log('\n── 1. lo básico ──');
da('captura un error del motor', 'intentar { imprimir(1 / 0) } capturar (e) { imprimir("c:" + e.mensaje) }\nimprimir("sigue")',
  'c:división entre cero|sigue');
da('el programa sigue después de capturar', 'intentar { lanzar "x" } capturar (e) { }\nimprimir("vivo")', 'vivo');
da('lanzar cualquier valor', 'intentar { lanzar 42 } capturar (e) { imprimir(tipo(e), e) }', 'entero 42');
da('lanzar una lista', 'intentar { lanzar [1, 2] } capturar (e) { imprimir(tipo(e), longitud(e)) }', 'lista 2');
da('los campos del error', 'intentar { lanzar error("roto", "mio") } capturar (e) { imprimir(e.tipo, e.mensaje, tipo(e)) }',
  'mio roto error');
da('también por índice', 'intentar { lanzar error("roto") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }', 'programa roto');
da('capturar sin nombrar el error', 'intentar { lanzar "x" } capturar { imprimir("recogido") }', 'recogido');
falla('un campo que no existe', 'intentar { lanzar error("a") } capturar (e) { imprimir(e.loquesea) }', 'no tiene');
falla('sin capturar sale como error', 'lanzar "nadie me recoge"', 'sin capturar');
falla('intentar suelto no compila', 'intentar { imprimir(1) }', 'necesita');

console.log('\n── 2. desenrollado entre funciones ──');
da('sube tres marcos de llamada', `
funcion c() { lanzar "desde el fondo" }
funcion b() { c()  imprimir("no debería verse") }
funcion a() { b()  imprimir("tampoco") }
intentar { a() } capturar (e) { imprimir("llegó: " + e) }`, 'llegó: desde el fondo');
da('captura dentro de una función y sigue', `
funcion segura(x: entero) -> texto {
  intentar { devolver texto(100 / x) }
  capturar (e) { devolver "indefinido" }
}
imprimir(segura(4), segura(0), segura(2))`, '25 indefinido 50');
da('relanzar desde el capturar', `
funcion interna() {
  intentar { lanzar "primero" }
  capturar (e) { lanzar "segundo (venía de " + texto(e) + ")" }
}
intentar { interna() } capturar (e) { imprimir(e) }`, 'segundo (venía de primero)');
da('el error del motor dentro de una nativa se captura', `
usar raiz de "numerico"

intentar { imprimir(raiz(-1)) } capturar (e) { imprimir("c:" + e.mensaje) }`, 'c:«raiz» de un número negativo');
// El verificador ya para «var f = nulo  f()» antes de ejecutar, así que para
// llegar al error de ejecución hay que esconder el nulo tras un «cualquiera».
da('llamar algo que resulta ser nulo', `
var d: dic<texto, cualquiera> = {"f": nulo}
intentar { d["f"]() } capturar (e) { imprimir("c:" + e.mensaje) }`, 'c:nulo no es una función; no se puede llamar');

console.log('\n── 3. finalmente ──');
da('camino normal', 'intentar { imprimir("a") } finalmente { imprimir("f") }\nimprimir("z")', 'a|f|z');
da('camino con fallo, relanzando', `
intentar {
  intentar { lanzar "x" } finalmente { imprimir("f") }
} capturar (e) { imprimir("fuera:" + texto(e)) }`, 'f|fuera:x');
da('con capturar y finalmente juntos',
  'intentar { lanzar "p" } capturar (e) { imprimir("c") } finalmente { imprimir("f") }\nimprimir("z")', 'c|f|z');
da('finalmente corre aunque falle el capturar', `
intentar {
  intentar { lanzar "uno" } capturar (e) { lanzar "dos" } finalmente { imprimir("f") }
} capturar (e) { imprimir("fuera:" + texto(e)) }`, 'f|fuera:dos');
da('corre al salir por devolver', `
funcion g() -> entero {
  intentar { devolver 7 } finalmente { imprimir("f") }
}
imprimir(texto(g()))`, 'f|7');
da('y con el valor calculado antes del finalmente', `
funcion g() -> entero {
  var x: entero = 1
  intentar { x = 2  devolver x } finalmente { x = 99  imprimir("f:" + texto(x)) }
}
imprimir(texto(g()))`, 'f:99|2');
da('corre al salir por romper', `
para i en rango(5) {
  intentar { si i == 2 { romper }  imprimir("i" + texto(i)) } finalmente { imprimir("f" + texto(i)) }
}
imprimir("fin")`, 'i0|f0|i1|f1|f2|fin');
da('corre al salir por continuar', `
para i en rango(3) {
  intentar { si i == 1 { continuar }  imprimir("i" + texto(i)) } finalmente { imprimir("f" + texto(i)) }
}`, 'i0|f0|f1|i2|f2');
da('dos finalmente anidados al devolver', `
funcion g() -> texto {
  intentar {
    intentar { devolver "valor" } finalmente { imprimir("dentro") }
  } finalmente { imprimir("fuera") }
}
imprimir(g())`, 'dentro|fuera|valor');
da('un finalmente que lanza sustituye al error original', `
intentar {
  intentar { lanzar "original" } finalmente { lanzar "del finalmente" }
} capturar (e) { imprimir(texto(e)) }`, 'del finalmente');

console.log('\n── 4. anidamiento y alcance ──');
da('el interior gana', `
intentar {
  intentar { lanzar "a" } capturar (e) { imprimir("dentro:" + texto(e)) }
} capturar (e) { imprimir("fuera, no debería") }`, 'dentro:a');
da('si el interior no captura, sube', `
intentar {
  intentar { lanzar "a" } finalmente { imprimir("f") }
} capturar (e) { imprimir("fuera:" + texto(e)) }`, 'f|fuera:a');
falla('la variable del capturar no se escapa',
  'intentar { lanzar "x" } capturar (e) { }\nimprimir(e)', 'no está definida');
da('capturar dentro de un cierre', `
funcion hacer() -> funcion {
  var n: entero = 0
  funcion probar(x: entero) -> texto {
    intentar { n = n + 1  devolver texto(10 / x) }
    capturar (e) { devolver "fallo " + texto(n) }
  }
  devolver probar
}
var p = hacer()
imprimir(p(2), p(0), p(5))`, '5 fallo 2 2');
da('capturar dentro de un bucle, muchas vueltas', `
var buenos: entero = 0
var malos: entero = 0
para i en rango(-3, 4) {
  intentar { var q = 10 / i  buenos = buenos + 1 }
  capturar (e) { malos = malos + 1 }
}
imprimir(texto(buenos), texto(malos))`, '6 1');

console.log('\n── 5. nada se queda colgando ──');
{
  const c = corre(`
funcion ruido(n: entero) -> entero {
  intentar {
    si n % 3 == 0 { lanzar "tres" }
    devolver n
  } capturar (e) { devolver 0 } finalmente { var basura: entero = n }
}
var total: entero = 0
para i en rango(2000) { total = total + ruido(i) }
imprimir(texto(total))`);
  comprobar('miles de vueltas dan el resultado correcto', c.texto === '1332667', c.texto);
  comprobar('la pila vuelve a cero', c.r.ok && c.m.vm.sp === 0, c.m.vm.sp);
  comprobar('no quedan marcos abiertos', c.m.vm.frames.length === 0, c.m.vm.frames.length);
}
{
  // Salir de un «intentar» por romper dejaba su manejador apilado: un fallo
  // posterior habría saltado a un sitio que ya no existe.
  const c = corre(`
funcion f() -> texto {
  para i en rango(10) {
    intentar { romper } capturar (e) { imprimir("no") }
  }
  intentar { lanzar "después" } capturar (e) { devolver "bien:" + texto(e) }
  devolver "mal"
}
imprimir(f())`);
  comprobar('romper no deja manejadores colgando', c.texto === 'bien:después', c.texto + ' | ' + (c.r.ok ? '' : c.r.errores.map(e => e.message)));
}
{
  const c = corre(`
funcion f() -> entero {
  intentar { devolver 1 } capturar (e) { devolver 2 }
}
var s: entero = 0
para i en rango(500) { s = s + f() }
imprimir(texto(s))`);
  comprobar('devolver dentro de intentar no deja manejadores', c.texto === '500', c.texto);
  comprobar('y la pila sigue limpia', c.r.ok && c.m.vm.sp === 0, c.m.vm.sp);
}
{
  const c = corre(`
para i en rango(3000) {
  intentar { lanzar error("basura " + texto(i)) } capturar (e) { }
}
recolectar()
imprimir(texto(memoria()["objetos"] < 300))`);
  comprobar('los errores capturados se recolectan', c.texto === 'cierto', c.texto);
}

console.log('\n── 6. los límites siguen en pie ──');
falla('el presupuesto no se puede capturar',
  'intentar { mientras verdadero { } } capturar (e) { imprimir("me lo comí") }', 'límite', { limiteInstr: 200000 });
{
  const c = corre('intentar { mientras verdadero { } } capturar (e) { imprimir("me lo comí") }', { limiteInstr: 200000 });
  comprobar('y no llega al capturar', !c.texto.includes('me lo comí'), c.texto);
}
da('el desbordamiento de pila sí se captura', `
funcion sinFondo(n: entero) -> entero { devolver sinFondo(n + 1) }
intentar { sinFondo(0) } capturar (e) { imprimir("c:" + texto(contiene(e.mensaje, "desbordamiento"))) }`,
  'c:cierto');

console.log('\n── 7. el JIT se aparta ──');
{
  const c = corre(`
funcion protegida(n: entero) -> entero {
  var s: entero = 0
  para i en rango(1, n) { intentar { s = s + i } capturar (e) { } }
  devolver s
}
funcion limpia(n: entero) -> entero {
  var s: entero = 0
  para i en rango(1, n) { s = s + i }
  devolver s
}
imprimir(texto(protegida(2000)), texto(limpia(2000)))`, { umbralJIT: 1 });
  comprobar('las dos dan lo mismo', c.texto === '1999000 1999000', c.texto);
  const conTry = c.r.fn && c.r.fn.chunk.consts.find(x => x && x.nombre === 'protegida');
  const sinTry = c.r.fn && c.r.fn.chunk.consts.find(x => x && x.nombre === 'limpia');
  comprobar('la que lleva intentar no se compila', conTry && conTry.jitEstado === 'rechazada', conTry && conTry.jitEstado);
  comprobar('la otra sí', sinTry && sinTry.jitEstado === 'compilada', sinTry && sinTry.jitEstado);
}

console.log('\n── 8. el bytecode viejo deja de valer ──');
{
  const EL = globalThis.EspanolLike;
  const m = crearMotor({ salida: () => {}, host: {} });
  const s = m.serializar('imprimir("hola")');
  comprobar('se sigue serializando', s.ok);
  const bytes = Uint8Array.from(s.bytes);
  const ida = EL.deserializar(bytes);
  comprobar('y cargando', !!ida);
  // La huella se calcula de la tabla de instrucciones: al añadir tres opcodes
  // cambia sola, y un archivo de antes queda rechazado con un mensaje claro.
  const viejo = Uint8Array.from(bytes);
  viejo[5] ^= 0xff;
  try { EL.deserializar(viejo); comprobar('rechaza otra tabla de instrucciones', false, 'lo aceptó'); }
  catch (e) { comprobar('rechaza otra tabla de instrucciones', /otra tabla/.test(e.message), e.message); }
  const conTry = m.serializar('intentar { lanzar "x" } capturar (e) { imprimir("c") }');
  comprobar('el bytecode con excepciones va y vuelve', conTry.ok);
  const out = [];
  const m2 = crearMotor({ salida: x => out.push(x), host: {} });
  const r2 = m2.ejecutarBytecode(conTry.bytes);
  comprobar('y se ejecuta igual desde el archivo', r2.ok && out.join('|') === 'c', (out.join('|') + ' ' + (r2.errores || []).map(e => e.message)));
}

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
