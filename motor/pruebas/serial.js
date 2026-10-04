// ============================================================================
//  Pruebas de la serialización del bytecode.
//  Tres partes: ida y vuelta, cabecera, y bytecode manipulado a mano.
// ============================================================================
require(require('../rutas.js').bundle);
const EL = globalThis.EspanolLike;
const { crearMotor, serializar, deserializar, aTexto, deTexto, ErrorBytecode, OP } = EL;
const fs = require('fs');

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '→ ' + String(extra).slice(0, 200) : ''); }
};

function correrFuente(src) {
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), host: {}, limiteInstr: 5e7 });
  const r = m.ejecutar(src);
  return { r, out, m };
}
function correrBytes(bytes) {
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), host: {}, limiteInstr: 5e7 });
  const r = m.ejecutarBytecode(bytes);
  return { r, out, m };
}

// Los diez ejemplos del IDE, sacados del propio documento para que no haya dos
// copias que se desincronicen.
function ejemplosDelIDE() {
  const html = fs.readFileSync(require('../rutas.js').ide('padre.html'), 'utf8');
  const i = html.indexOf('const EJEMPLOS = {');
  const j = html.indexOf('\n  };', i);
  // eslint-disable-next-line no-eval
  return eval('(' + html.slice(i + 'const EJEMPLOS = '.length, j + 4).replace(/;\s*$/, '') + ')');
}

const PROGRAMAS = {
  'aritmética y tipos': `
usar potencia, redondear de "numerico"

var a: entero = 7
var b: real = 2.5
imprimir(a + 1, a - 1, a * 2, a / 2, a // 2, a % 3, 2 ** 10, potencia(2, 10))
imprimir(b * 2, redondear(b))
imprimir(verdadero y falso, verdadero o falso, no verdadero)`,

  'texto': `
usar mayusculas, reemplazar, subtexto de "texto"

var s: texto = "Ñandú corría"
imprimir(mayusculas(s), longitud(s), subtexto(s, 0, 6))
imprimir(reemplazar(s, "corría", "vuela"))
imprimir("interpolado: {s} con {longitud(s)}")`,

  'listas y diccionarios': `
usar media, suma de "numerico"

var xs: lista<entero> = [5, 3, 9, 1]
agregar(xs, 7)
imprimir(ordenar(xs), suma(xs), maximo(xs), minimo(xs), media(xs))
var d: dic<texto, entero> = {"a": 1, "b": 2}
d["c"] = 3
imprimir(claves(d), valores(d), d["b"])`,

  'control de flujo': `
var t: entero = 0
para i en rango(1, 20) {
  si i % 3 == 0 { continuar }
  si i > 15 { romper }
  t = t + i
}
imprimir(t)
var k: entero = 0
mientras k < 5 { k = k + 1 }
imprimir(k)`,

  'funciones recursivas': `
funcion fib(n: entero) -> entero {
  si n < 2 { devolver n }
  devolver fib(n - 1) + fib(n - 2)
}
imprimir(fib(20))`,

  'cierres anidados': `
funcion contador(desde: entero) -> funcion {
  var n: entero = desde
  funcion siguiente() -> entero {
    n = n + 1
    devolver n
  }
  devolver siguiente
}
var c = contador(10)
imprimir(c(), c(), c())
funcion compuesta(a: entero) -> funcion {
  funcion media(b: entero) -> funcion {
    funcion honda(c: entero) -> entero { devolver a + b + c }
    devolver honda
  }
  devolver media
}
imprimir(compuesta(1)(2)(3))`,

  'orden superior': `
var xs: lista<entero> = rango(1, 11)
imprimir(mapear(xs, funcion(x: entero) -> entero { devolver x * x }))
imprimir(filtrar(xs, funcion(x: entero) -> bool { devolver x % 2 == 0 }))
imprimir(reducir(xs, funcion(a: entero, b: entero) -> entero { devolver a + b }, 0))`,

  'números raros': `
imprimir(0.1 + 0.2)
imprimir(1.0 / 3.0)
imprimir(1000000000000)
imprimir(-0.0000001)
imprimir(2 ** 53)
imprimir(2 ** 53 + 1.5)`,

  'programa que falla': `
var xs: lista<entero> = [1, 2, 3]
imprimir(xs[10])`,
};

// ───────────────────────────────────────────────── 1. ida y vuelta
console.log('\n── 1. ida y vuelta ──');
let bytesTotal = 0, fuenteTotal = 0;
for (const [nombre, src] of Object.entries(PROGRAMAS)) {
  const a = correrFuente(src);
  const s = crearMotor({ salida: () => {}, host: {} }).serializar(src);
  if (!s.ok) { comprobar(nombre, false, (s.errores[0] || {}).message); continue; }
  const b = correrBytes(s.bytes);
  const mismaSalida = a.out.join('\n') === b.out.join('\n');
  const mismoEstado = a.r.ok === b.r.ok;
  const mismoError = a.r.ok || (a.r.errores[0].message === b.r.errores[0].message);
  comprobar(nombre, mismaSalida && mismoEstado && mismoError,
    mismaSalida ? `ok=${a.r.ok}/${b.r.ok}` : `\n      fuente: ${a.out.join(' | ')}\n      bytes : ${b.out.join(' | ')}`);
  bytesTotal += s.bytes.length; fuenteTotal += Buffer.byteLength(src, 'utf8');
}
console.log(`     (${fuenteTotal} bytes de fuente → ${bytesTotal} de bytecode, ${(bytesTotal / fuenteTotal * 100).toFixed(0)} %)`);

console.log('\n── 2. los diez ejemplos del IDE ──');
// Dos cuidados para que la comparación sea justa. Uno: la fuente se ejecuta con
// el JIT apagado, porque las funciones compiladas no suman instrucciones y los
// ejemplos pesados se saldrían del presupuesto solo en el lado del bytecode.
// Dos: los ejemplos que usan azar() no pueden dar la misma salida dos
// veces, así que de esos solo se compara que terminen igual.
const EJ = ejemplosDelIDE();
const correrLento = (src, bytes) => {
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), host: {}, limiteInstr: 2e9, jit: false });
  const r = bytes ? m.ejecutarBytecode(bytes) : m.ejecutar(src);
  return { r, out };
};
for (const [nombre, src] of Object.entries(EJ)) {
  const s = crearMotor({ salida: () => {}, host: {} }).serializar(src);
  // reloj() y ahora() son tan poco repetibles como azar()
  const azar = /\bazar\s*\(|azarEntre\s*\(|azarNormal\s*\(|elegir\s*\(|barajar\s*\(|reloj\s*\(|ahora\s*\(/.test(src);
  if (!s.ok) {
    const a0 = correrFuente(src);
    comprobar(nombre + ' (no compila, esperado)', !a0.r.ok);
    continue;
  }
  const a = correrLento(src, null), b = correrLento(null, s.bytes);
  const igual = azar ? a.out.length === b.out.length : a.out.join('\n') === b.out.join('\n');
  comprobar(nombre + (azar ? ' (con azar: se comparan las líneas)' : ''), igual && a.r.ok === b.r.ok,
    `ok=${a.r.ok}/${b.r.ok}\n      fuente: ${a.out.slice(0, 2).join(' | ')}\n      bytes : ${b.out.slice(0, 2).join(' | ')} ${(b.r.errores || []).map(e => e.message)}`);
}

// ───────────────────────────────────────────────── 3. base64 y determinismo
console.log('\n── 3. texto y determinismo ──');
const srcFib = PROGRAMAS['funciones recursivas'];
const m0 = crearMotor({ salida: () => {}, host: {} });
const s1 = m0.serializar(srcFib).bytes, s2 = m0.serializar(srcFib).bytes;
comprobar('serializar dos veces da lo mismo', Buffer.compare(Buffer.from(s1), Buffer.from(s2)) === 0);
const txt = aTexto(s1);
comprobar('el texto es base64 puro', /^[A-Za-z0-9+/]+=*$/.test(txt), txt.slice(0, 40));
comprobar('base64 ida y vuelta', Buffer.compare(Buffer.from(deTexto(txt)), Buffer.from(s1)) === 0);
comprobar('deserializar acepta el texto directamente', correrBytes(txt).out.join() === '6765');
comprobar('base64 con saltos de línea también', correrBytes(txt.replace(/(.{40})/g, '$1\n')).out.join() === '6765');

// ───────────────────────────────────────────────── 4. el JIT no alcanza lo cargado
console.log('\n── 4. lo cargado no puede llegar al JIT ──');
const pesado = `
funcion trabajo(n: entero) -> entero {
  var s: entero = 0
  para i en rango(1, n) { s = s + i * i }
  devolver s
}
imprimir(texto(trabajo(20000)))`;
const dFuente = (() => {
  const m = crearMotor({ salida: () => {}, host: {}, umbralJIT: 1 });
  const r = m.ejecutar(pesado);
  return { jit: r.stats.jitCompiladas, out: r.ok };
})();
const dBytes = (() => {
  const m = crearMotor({ salida: () => {}, host: {}, umbralJIT: 1 });
  const s = crearMotor({ salida: () => {}, host: {} }).serializar(pesado);
  const r = m.ejecutarBytecode(s.bytes);
  return { jit: m.vm.stats.jitCompiladas, fallidas: m.vm.stats.jitFallidas, ok: r.ok };
})();
comprobar('desde fuente el JIT sí compila', dFuente.jit > 0, dFuente.jit);
comprobar('desde bytecode el JIT no compila nada', dBytes.jit === 0, dBytes);
comprobar('y aun así el programa da el resultado', dBytes.ok);
const fnCargada = deserializar(crearMotor({ salida: () => {}, host: {} }).serializar(pesado).bytes);
comprobar('la función cargada no trae AST', fnCargada.ast === null);
comprobar('y va marcada como venida de fuera', fnCargada.deDisco === true);
comprobar('generarJS la rechaza explícitamente', EL.generarJS(fnCargada) === null);

// ───────────────────────────────────────────────── 5. cabecera
console.log('\n── 5. cabecera ──');
const base = crearMotor({ salida: () => {}, host: {} }).serializar(srcFib).bytes;
const conCambio = (i, v) => { const c = Uint8Array.from(base); c[i] = v; return c; };
const falla = (nombre, datos, fragmento) => {
  try { deserializar(datos); comprobar(nombre, false, 'no lanzó nada'); }
  catch (e) {
    const bien = e instanceof ErrorBytecode && (!fragmento || e.message.includes(fragmento));
    comprobar(nombre, bien, `${e.name}: ${e.message}`);
  }
};
falla('magia cambiada', conCambio(0, 0x58), 'no es bytecode');
falla('versión desconocida', conCambio(4, 99), 'versión 99');
falla('huella de opcodes distinta', conCambio(5, base[5] ^ 0xff), 'otra tabla de instrucciones');
falla('archivo vacío', new Uint8Array(0));
falla('solo la cabecera', base.subarray(0, 9));
falla('bytes de más al final', Uint8Array.from([...base, 0, 0, 0]), 'sobran');
falla('texto base64 con basura', 'ESLB!!!!', 'inválido');

// ───────────────────────────────────────────────── 6. bytecode falsificado
console.log('\n── 6. bytecode falsificado a mano ──');
// Se construye el archivo desde una función real y se retoca el código, que es
// lo que haría alguien con un editor hexadecimal y ganas.
function forjar(retoque) {
  const m = crearMotor({ salida: () => {}, host: {} });
  const a = m.analizar('funcion g(x: entero) -> entero { devolver x + 1 }\nimprimir(g(2))');
  retoque(a.fn);
  return serializar(a.fn);
}
const forjaFalla = (nombre, retoque, fragmento) => {
  let datos;
  try { datos = forjar(retoque); }
  catch (e) {
    // Algunas manipulaciones ya no se dejan ni escribir; también vale.
    comprobar(nombre, e instanceof ErrorBytecode, `al escribir: ${e.name}: ${e.message}`);
    return;
  }
  falla(nombre, datos, fragmento);
};

forjaFalla('opcode inexistente', fn => { fn.chunk.code[0] = 200; }, 'desconocida');
forjaFalla('índice de constante fuera de rango', fn => {
  const i = fn.chunk.code.indexOf(OP.DEF_GLOBAL);
  fn.chunk.code[i + 1] = 999;
}, 'constante');
forjaFalla('GET_LOCAL fuera del marco', fn => {
  const g = fn.chunk.consts.find(c => c && c.chunk);
  const i = g.chunk.code.indexOf(OP.GET_LOCAL);
  g.chunk.code[i + 1] = 250;
}, 'marco');
forjaFalla('GET_UP sin capturas', fn => {
  fn.chunk.code.splice(0, 0, OP.GET_UP, 0);
  fn.chunk.lineas.splice(0, 0, 1, 1);
}, 'captura');
forjaFalla('CLOSURE apuntando a un texto', fn => {
  const i = fn.chunk.code.indexOf(OP.CLOSURE);
  fn.chunk.code[i + 1] = fn.chunk.consts.findIndex(c => typeof c === 'string');
}, 'no apunta a una función');
forjaFalla('CONST usando una función como valor', fn => {
  const iFn = fn.chunk.consts.findIndex(c => c && c.chunk);
  fn.chunk.code.splice(0, 0, OP.CONST, iFn, OP.POP);
  fn.chunk.lineas.splice(0, 0, 1, 1, 1);
}, 'como si fuera un valor');
forjaFalla('salto a mitad de instrucción', fn => {
  fn.chunk.code.splice(0, 0, OP.JMP, 1);
  fn.chunk.lineas.splice(0, 0, 1, 1);
}, 'principio de ninguna instrucción');
forjaFalla('salto más allá del final', fn => {
  fn.chunk.code.splice(0, 0, OP.JMP, 5000);
  fn.chunk.lineas.splice(0, 0, 1, 1);
}, 'no es el principio');
forjaFalla('LOOP hacia atrás fuera del chunk', fn => {
  fn.chunk.code.push(OP.LOOP, 99999);
  fn.chunk.lineas.push(1, 1);
}, 'no es el principio');
forjaFalla('el código no termina en RET', fn => {
  fn.chunk.code.push(OP.NULO);
  fn.chunk.lineas.push(1);
}, 'no termina en RET');
forjaFalla('instrucción cortada al final', fn => {
  fn.chunk.code.push(OP.CONST);
  fn.chunk.lineas.push(1);
}, 'sin operandos');
forjaFalla('tabla de líneas de otro tamaño', fn => {
  fn.chunk.lineas.push(1);
}, 'tabla de líneas');
forjaFalla('marco declarado absurdo', fn => { fn.maxSlots = 1e9; }, 'variables locales');
forjaFalla('capturas declaradas absurdas', fn => { fn.nUpvalues = 5000; }, 'capturas');

// ───────────────────────────────────────────────── 7. bytes revueltos al azar
console.log('\n── 7. bytes revueltos al azar ──');
// Lo que importa no es que cargue —casi nunca debería— sino que el fallo sea
// siempre un ErrorBytecode y nunca un error interno de la máquina, un cuelgue o
// una lectura de algo que no existe.
let rechazados = 0, cargados = 0, internos = [];
const semilla = (() => { let x = 20260928; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
for (let n = 0; n < 4000; n++) {
  const c = Uint8Array.from(base);
  const cuantos = 1 + Math.floor(semilla() * 3);
  for (let k = 0; k < cuantos; k++) c[Math.floor(semilla() * c.length)] = Math.floor(semilla() * 256);
  let fn = null;
  try { fn = deserializar(c); }
  catch (e) {
    if (e instanceof ErrorBytecode) { rechazados++; continue; }
    internos.push(`${e.name}: ${e.message}`);
    continue;
  }
  cargados++;
  // Si pasó la verificación tiene que poder ejecutarse sin romper la máquina.
  try {
    const m = crearMotor({ salida: () => {}, host: {}, limiteInstr: 2e6 });
    m.correr(fn);
  } catch (e) {
    if (!(e && (e.esRuntime || e.fase))) internos.push(`al ejecutar: ${e.name}: ${e.message}`);
  }
}
console.log(`     (${rechazados} rechazados, ${cargados} aceptados tras el cambio, ${internos.length} errores internos)`);
comprobar('ningún error interno con bytes revueltos', internos.length === 0, internos.slice(0, 3).join(' ; '));
comprobar('la inmensa mayoría se rechaza', rechazados > cargados, `${rechazados} vs ${cargados}`);

// ───────────────────────────────────────────────── 8. truncados
console.log('\n── 8. archivos truncados ──');
let malTruncado = [];
for (let n = 0; n < base.length; n++) {
  try { deserializar(base.subarray(0, n)); malTruncado.push(`aceptó ${n} de ${base.length} bytes`); }
  catch (e) { if (!(e instanceof ErrorBytecode)) malTruncado.push(`${n}: ${e.name} ${e.message}`); }
}
comprobar('todo prefijo incompleto se rechaza limpiamente', malTruncado.length === 0, malTruncado.slice(0, 3).join(' ; '));

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
