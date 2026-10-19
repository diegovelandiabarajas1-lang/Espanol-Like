// 4.1 · fases S1 y S2: el FFI (firmas de C, arreglos sin copiar,
// parámetros de salida, retrollamadas, memoria, llamadas en segundo plano) y
// el acceso al sistema (reloj en la consola, servidor HTTP, archivos línea a
// línea, rutas, procesos con opciones y en segundo plano, entrada interactiva).
//
// Como pruebas/nativo.js, se lanza el intérprete de verdad: lo que importa es
// que una llamada salga del proceso y vuelva, que un servidor conteste por un
// puerto de verdad y que un error llegue como error de Ñ, no como un proceso
// muerto. La biblioteca de C de prueba se compila aquí mismo con gcc; sin gcc
// (o sin koffi) esas pruebas se saltan y se dice.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const R = require('../rutas.js');

let ok = 0, mal = 0, saltadas = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 600) : ''); }
};
const saltar = (n, por) => { saltadas++; console.log('  ·', n, '— saltada:', por); };

const taller = fs.mkdtempSync(path.join(os.tmpdir(), 'n-sistema-'));
const NNODE = R.util('n-node.js');
function correr(fuente, args, op) {
  const f = path.join(taller, 'p-' + Math.random().toString(36).slice(2) + '.esl');
  fs.writeFileSync(f, fuente, 'utf8');
  const r = spawnSync(process.execPath, [NNODE, f].concat(args || []),
    { encoding: 'utf8', env: Object.assign({}, process.env, (op && op.env) || {}), input: op && op.entrada, timeout: 30000 });
  return { salida: (r.stdout || '').trim(), error: (r.stderr || '').trim(), codigo: r.status };
}
function caso(nombre, fuente, esperado, args, op) {
  const r = correr(fuente, args, op);
  const bien = typeof esperado === 'function' ? esperado(r) : r.salida === esperado;
  comprobar(nombre, bien, `código ${r.codigo}\n      salida: ${r.salida}\n      error: ${r.error}`);
  return r;
}
const hayKoffi = (() => { try { require('koffi'); return true; } catch (_) { return false; } })();
const LIBM = process.platform === 'win32' ? 'msvcrt.dll' : process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libm.so.6';
const LIBC = process.platform === 'win32' ? 'msvcrt.dll' : process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';

// ── la biblioteca de prueba
const C = `
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#define EXPORTA __declspec(dllexport)
static void esperar_ms(int ms) { Sleep(ms); }
#else
#include <unistd.h>
#define EXPORTA
static void esperar_ms(int ms) { usleep(ms * 1000); }
#endif
EXPORTA double suma(const double *a, int n) { double s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }
EXPORTA void duplicar(double *a, int n) { for (int i = 0; i < n; i++) a[i] *= 2; }
EXPORTA void cuadrados(int *a, int n) { for (int i = 0; i < n; i++) a[i] = i * i; }
EXPORTA int aplicar(int (*f)(int), int x) { return f(f(x)); }
EXPORTA int ordenar_con(int *a, int n, int (*cmp)(int, int)) { for (int i = 0; i < n; i++) for (int j = 0; j + 1 < n - i; j++) if (cmp(a[j], a[j+1]) > 0) { int t = a[j]; a[j] = a[j+1]; a[j+1] = t; } return n; }
EXPORTA int dividir_c(int a, int b, int *q, int *r) { *q = a / b; *r = a % b; return b != 0; }
EXPORTA double lento(int ms) { esperar_ms(ms); return ms * 1.5; }
typedef void (*cb_t)(int);
static cb_t guardado;
EXPORTA void guardar_cb(cb_t c) { guardado = c; }
EXPORTA int disparar(int x) { if (!guardado) return 0; guardado(x); return 1; }
typedef struct { double x, y; } Punto;
EXPORTA double norma2(const Punto *p) { return p->x * p->x + p->y * p->y; }
EXPORTA void origen(Punto *p) { p->x = 0; p->y = 0; }
EXPORTA void mover(Punto *p, double dx) { p->x += dx; }
EXPORTA void escribir_en(char *buf, int n) { strncpy(buf, "escrito por C", n); }
typedef struct nodo { int v; } Nodo;
EXPORTA Nodo *nuevo_nodo(int v) { Nodo *n = malloc(sizeof(Nodo)); n->v = v; return n; }
EXPORTA int valor_nodo(Nodo *n) { return n ? n->v : -1; }
EXPORTA void borrar_nodo(Nodo *n) { free(n); }
EXPORTA void *nada(void) { return 0; }
`;
let LIBT = null;
if (hayKoffi) {
  const src = path.join(taller, 't.c');
  fs.writeFileSync(src, C);
  const sal = path.join(taller, process.platform === 'win32' ? 't.dll' : 'libt.so');
  const g = spawnSync('gcc', ['-shared', '-fPIC', '-O2', '-o', sal, src], { encoding: 'utf8' });
  if (g.status === 0) LIBT = sal;
}
console.log(hayKoffi ? (LIBT ? '  (koffi y gcc están: se prueba todo el FFI)' : '  (hay koffi pero no gcc: solo lo que se prueba con la biblioteca de C del sistema)')
  : '  (koffi NO está: el FFI se salta)');
const lib = s => s.split('LIBT').join(JSON.stringify(LIBT).slice(1, -1));
const NAT = 'usar tipoNativo, retrollamada, soltarRetrollamada, reservarMemoria, leerMemoria, escribirMemoria, textoDeMemoria, tamanoNativo, direccion, errorC, enFondo de "nativo"\n';

// ═══════════════════════════════════════════════════════ S1 · FFI
console.log('\n── S1.1 firmas de C ──');
if (hayKoffi) {
  caso('nativa con la firma tal como está en el .h', `fijo cos = nativa("${LIBM}", "double cos(double)")\nimprimir(cos(0.0), tipo(cos))`, '1 funcion');
  caso('el nombre de la función sale de la firma', `fijo p = nativa("${LIBM}", "double pow(double base, double exp)")\nimprimir(p(2.0, 10.0), p)`, '1024 <nativa pow>');
  caso('el número de argumentos lo comprueba la máquina', `fijo p = nativa("${LIBM}", "double pow(double, double)")\np(2.0)`,
    r => r.codigo === 1 && /espera 2 argumento/.test(r.salida));
  caso('una variádica (printf) se rechaza diciendo por qué', `nativa("${LIBC}", "int printf(const char *, ...)")`,
    r => r.codigo === 1 && r.salida.includes('«...»'));
  caso('un tipo desconocido dice cómo declararlo', `nativa("${LIBM}", "double cos(Raro x)")`,
    r => r.codigo === 1 && r.salida.includes('«Raro»') && r.salida.includes('tipoNativo'));
  caso('un símbolo que no está, en español', `nativa("${LIBM}", "double noexiste_xyz(double)")`,
    r => r.codigo === 1 && r.salida.includes('ese símbolo no está'));
  if (process.platform !== 'win32') {
    caso('un puntero nulo de vuelta es nulo, y errorC da el errno',
      `${NAT}fijo fopen = nativa("${LIBC}", "void *fopen(const char *, const char *)")\nimprimir(fopen("/no/existe/de/verdad", "r"), errorC() > 0)`, 'nulo cierto');
  } else {
    // En Windows no hay UN errno: cada biblioteca de C tiene el suyo (msvcrt.dll,
    // ucrtbase.dll…), y errorC lee el que ve koffi. Con msvcrt.dll daba 0 (fase W1).
    // Se prueba con ucrtbase.dll, la de Windows 10 y 11; si tampoco se ve, es un
    // límite de la plataforma y se dice como tal, no como un fallo del motor.
    const r = correr(`${NAT}fijo fopen = nativa("ucrtbase.dll", "void *fopen(const char *, const char *)")\nimprimir(fopen("C:/no/existe/de/verdad", "r"), errorC())`);
    const [puntero, errno] = r.salida.split(' ');
    comprobar('un puntero nulo de vuelta es nulo (Windows, ucrtbase.dll)', puntero === 'nulo', `código ${r.codigo}\n      salida: ${r.salida}\n      error: ${r.error}`);
    if (Number(errno) > 0) comprobar('errorC da el errno (Windows, ucrtbase.dll)', true);
    else saltar('errorC da el errno', `en Windows cada biblioteca de C tiene su errno y koffi no ve el de ucrtbase.dll (dio ${errno})`);
  }
} else saltar('las firmas de C', 'no hay koffi');

console.log('\n── S1.2 arreglos sin copiar, salidas, estructuras ──');
if (LIBT) {
  caso('un arreglo de reales va a «const double *» sin copiar', lib(`usar ceros de "numerico"
fijo suma = nativa("LIBT", "double suma(const double *a, int n)")
var a = ceros(4)
para i en rango(4) { a[i] = i + 1.0 }
imprimir(suma(a, 4))`), '10');
  caso('y lo que C escribe se ve en el arreglo', lib(`usar ceros de "numerico"
fijo dup = nativa("LIBT", "void duplicar(double *a, int n)")
var a = ceros(3)
para i en rango(3) { a[i] = i + 1.0 }
dup(a, 3)
imprimir(a[0], a[1], a[2])`), '2 4 6');
  caso('un arreglo de enteros va a «int *»', lib(`usar ceros de "numerico"
fijo cu = nativa("LIBT", "void cuadrados(int *a, int n)")
var a = ceros(5, "entero")
cu(a, 5)
imprimir(a[4], tipo(a[4]))`), '16 entero');
  caso('una fila de una matriz (vista seguida) también va sin copiar', lib(`usar ceros de "numerico"
fijo dup = nativa("LIBT", "void duplicar(double *a, int n)")
var m = ceros([3, 2])
m[1][0] = 5.0
m[1][1] = 7.0
dup(m[1], 2)
imprimir(m[1][0], m[1][1], m[0][0])`), '10 14 0');
  caso('una vista con huecos (columna de una transpuesta) se rechaza y se dice cómo arreglarlo', lib(`usar ceros, transpuesta, copia de "numerico"
fijo dup = nativa("LIBT", "void duplicar(double *a, int n)")
fijo t = transpuesta(ceros([2, 3]))
intentar { dup(t[0], 2) } capturar (e) { imprimir("capturado") }
dup(copia(t[0]), 2)
imprimir("con copia sí")
dup(t[0], 2)`), r => r.salida.startsWith('capturado\ncon copia sí') && r.salida.includes('copia(a)'));
  caso('un arreglo del tipo equivocado es un error capturable, no basura', lib(`usar ceros de "numerico"
fijo suma = nativa("LIBT", "double suma(const double *a, int n)")
intentar { suma(ceros(4, "entero"), 4) } capturar (e) { imprimir("capturado") }`), 'capturado');
  caso('y el mensaje dice los dos tipos', lib(`usar ceros de "numerico"
fijo suma = nativa("LIBT", "double suma(const double *a, int n)")
suma(ceros(4, "entero"), 4)`), r => r.codigo === 1 && r.salida.includes('arreglo entero') && r.salida.includes('double *'));
  caso('una lista de números también vale (se copia)', lib(`fijo suma = nativa("LIBT", "double suma(const double *a, int n)")
imprimir(suma([1, 2.5, 3], 3))`), '6.5');
  caso('_Out_ no se pasa: se devuelve, junto al resultado', lib(`fijo d = nativa("LIBT", "int dividir_c(int a, int b, _Out_ int *q, _Out_ int *r)")
fijo [ok, q, r] = d(17, 5)
imprimir(ok, q, r)`), '1 3 2');
  caso('una estructura por puntero entra como diccionario', lib(`estructuraNativa("Punto", {"x": "real", "y": "real"})
fijo n2 = nativa("LIBT", "double norma2(const Punto *p)")
imprimir(n2({"x": 3.0, "y": 4.0}))`), '25');
  caso('_Out_ de una estructura vuelve como diccionario', lib(`estructuraNativa("Punto", {"x": "real", "y": "real"})
fijo o = nativa("LIBT", "void origen(_Out_ Punto *p)")
imprimir(o())`), '{x: 0, y: 0}');
  caso('_Inout_ entra y sale', lib(`estructuraNativa("Punto", {"x": "real", "y": "real"})
fijo mv = nativa("LIBT", "void mover(_Inout_ Punto *p, double dx)")
imprimir(mv({"x": 1.0, "y": 2.0}, 10.0))`), '{x: 11, y: 2}');
  caso('un tipo opaco: su puntero se guarda y se devuelve a C', lib(NAT + `tipoNativo("Nodo")
fijo nuevo = nativa("LIBT", "Nodo *nuevo_nodo(int v)")
fijo val = nativa("LIBT", "int valor_nodo(Nodo *n)")
fijo fuera = nativa("LIBT", "void borrar_nodo(Nodo *n)")
fijo n = nuevo(41)
imprimir(tipo(n), val(n), direccion(n) > 0, n == n)
fuera(n)`), 'puntero 41 cierto cierto');
  caso('a un puntero no se le pueden hacer cuentas', lib(NAT + `tipoNativo("Nodo")
fijo nuevo = nativa("LIBT", "Nodo *nuevo_nodo(int v)")
fijo n = nuevo(1)
imprimir(n + 1)`), r => r.codigo === 1);
} else saltar('arreglos, salidas y estructuras', LIBT === null && hayKoffi ? 'no hay gcc' : 'no hay koffi');

console.log('\n── S1.3 retrollamadas ──');
if (LIBT) {
  caso('una función de Ñ como puntero a función', lib(NAT + `tipoNativo("int Fn(int)")
fijo ap = nativa("LIBT", "int aplicar(Fn *f, int x)")
imprimir(ap(funcion(x) { devolver x * 3 }, 2))`), '18');
  caso('C ordena con un comparador escrito en Ñ', lib(NAT + `usar arreglo de "numerico"
tipoNativo("int Cmp(int, int)")
fijo ord = nativa("LIBT", "int ordenar_con(int *a, int n, Cmp *cmp)")
var e = arreglo([5, 3, 9, 1], "entero")
ord(e, 4, funcion(x, y) { devolver y - x })
imprimir(e[0], e[1], e[2], e[3])`), '9 5 3 1');
  caso('un error dentro de la retrollamada se captura fuera de la llamada a C', lib(NAT + `tipoNativo("int Fn(int)")
fijo ap = nativa("LIBT", "int aplicar(Fn *f, int x)")
var cuenta = 0
intentar { ap(funcion(x) { cuenta = cuenta + 1
  lanzar "falla " + texto(x) }, 1) } capturar (e) { imprimir("capturado", texto(e), cuenta) }`), 'capturado falla 1 1');
  caso('una retrollamada que devuelve lo que no es dice qué esperaba', lib(NAT + `tipoNativo("int Fn(int)")
fijo ap = nativa("LIBT", "int aplicar(Fn *f, int x)")
ap(funcion(x) { devolver "texto" }, 1)`), r => r.codigo === 1 && r.salida.includes('tenía que devolver un número'));
  caso('una registrada: C la guarda y la llama después', lib(NAT + `tipoNativo("void Cb(int)")
fijo guardarCb = nativa("LIBT", "void guardar_cb(Cb *c)")
fijo disparar = nativa("LIBT", "int disparar(int)")
var vistos = []
fijo r = retrollamada(funcion(x) { agregar(vistos, x) }, "Cb")
guardarCb(r)
disparar(1)
disparar(2)
imprimir(vistos, r)`), '[1, 2] <retrollamada Cb>');
  caso('el error de una registrada sale por la llamada que la disparó', lib(NAT + `tipoNativo("void Cb(int)")
fijo guardarCb = nativa("LIBT", "void guardar_cb(Cb *c)")
fijo disparar = nativa("LIBT", "int disparar(int)")
guardarCb(retrollamada(funcion(x) { lanzar "mal " + texto(x) }, "Cb"))
intentar { disparar(7) } capturar (e) { imprimir("capturado", texto(e)) }`), 'capturado mal 7');
  caso('una soltada ya no se puede pasar', lib(NAT + `tipoNativo("void Cb(int)")
fijo guardarCb = nativa("LIBT", "void guardar_cb(Cb *c)")
fijo r = retrollamada(funcion(x) { }, "Cb")
soltarRetrollamada(r)
intentar { guardarCb(r) } capturar (e) { imprimir("capturado", r) }`), 'capturado <retrollamada Cb · soltada>');
  caso('una función a un parámetro que no es de función se rechaza', lib(`fijo suma = nativa("LIBT", "double suma(const double *a, int n)")
suma(funcion(x) { devolver x }, 1)`), r => r.codigo === 1 && /funcion/.test(r.salida));
} else saltar('retrollamadas', 'no hay biblioteca de prueba');

console.log('\n── S1.4 memoria ──');
if (LIBT) {
  caso('reservarMemoria(n) para un «char *» que C rellena', lib(NAT + `fijo m = reservarMemoria(32)
fijo esc = nativa("LIBT", "void escribir_en(char *buf, int n)")
esc(m, 32)
imprimir(textoDeMemoria(m), m)`), 'escrito por C <memoria 32 bytes>');
  caso('leer y escribir números en memoria', NAT + `fijo m = reservarMemoria(16)
escribirMemoria(m, "real", [1.5, 2.5])
imprimir(leerMemoria(m, "real", 2), leerMemoria(m, "real"), tamanoNativo("real"), tamanoNativo("int"))`, '[1.5, 2.5] 1.5 8 4');
  caso('leer más de lo que cabe es un error, no leer fuera', NAT + `fijo m = reservarMemoria(16)
intentar { leerMemoria(m, "real", 3) } capturar (e) { imprimir("capturado") }
intentar { escribirMemoria(m, "real", [1, 2, 3]) } capturar (e) { imprimir("capturado") }`, 'capturado\ncapturado');
  caso('leer de un puntero nulo se para antes de tumbar el proceso', NAT + `leerMemoria(nulo, "real")`,
    r => r.codigo === 1 && r.salida.includes('tumbaría el proceso'));
} else saltar('memoria', 'no hay biblioteca de prueba');

console.log('\n── S1.5 en segundo plano ──');
if (LIBT) {
  const r = caso('enFondo no para el programa, y esperar da el resultado', lib(NAT + `usar todas de "corrutinas"
fijo lento = nativa("LIBT", "double lento(int ms)")
fn principal() {
  fijo t0 = ahora()
  fijo ps = [enFondo(lento, 300), enFondo(lento, 300)]
  imprimir("sigo")
  fijo rs = esperar todas(ps)
  imprimir(rs, entero(ahora() - t0))
}
principal()
imprimir("fin del principal")`), r => /^sigo\nfin del principal\n\[450, 450\] \d+$/.test(r.salida));
  const ms = +(/\] (\d+)$/.exec(r.salida) || [])[1];
  comprobar('y las dos llamadas de 300 ms corren a la vez (menos de 550 ms)', ms > 0 && ms < 550, ms + ' ms');
  caso('enFondo no acepta retrollamadas (C las llamaría desde otro hilo)', lib(NAT + `tipoNativo("int Fn(int)")
fijo ap = nativa("LIBT", "int aplicar(Fn *f, int x)")
enFondo(ap, funcion(x) { devolver x }, 1)`), r => r.codigo === 1 && r.salida.includes('otro hilo'));
  caso('enFondo solo con funciones nativas', NAT + `enFondo(imprimir, 1)`, r => r.codigo === 1 && r.salida.includes('declarada con nativa'));
} else saltar('en segundo plano', 'no hay biblioteca de prueba');

// ═══════════════════════════════════════════════════════ S2 · sistema
console.log('\n── S2.1 el reloj en la consola ──');
caso('luego, cada y detener', `var n = 0
var id = 0
id = cada(20, funcion() { n = n + 1
  si n == 3 { detener(id)
    imprimir("tres tics") } })
luego(10, funcion() { imprimir("luego") })
imprimir("primero")`, 'primero\nluego\ntres tics');
caso('dormir y lo asíncrono funcionan fuera del IDE', `usar dormir de "corrutinas"
fn f() { esperar dormir(50)
  imprimir("desperté") }
f()
imprimir("antes")`, 'antes\ndesperté');
caso('un error en un temporizador se dice y el proceso acaba con 1', `luego(10, funcion() { lanzar "en el reloj" })`,
  r => r.codigo === 1 && r.salida.includes('en el reloj'));

console.log('\n── S2.2 archivos ──');
const dir = path.join(taller, 'arch');
fs.mkdirSync(dir);
const SIS = 'usar respuesta, leerLineas, copiarArchivo, moverArchivo, infoArchivo, carpetaActual, cambiarCarpeta, infoSistema, ejecutarEnFondo, servir, detenerServidor, unirRuta, nombreArchivo, extension, sinExtension, carpetaDe, esRutaAbsoluta, normalizarRuta, rutaAbsoluta, rutaRelativa de "sistema"\n';
fs.writeFileSync(path.join(dir, 'grande.csv'), 'id,v\n' + Array.from({ length: 50000 }, (_, i) => `${i},${i * 2}`).join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'crlf.txt'), 'uno\r\ndos\r\ntres');
caso('leerLineas recorre un archivo grande sin cargarlo', SIS + `var n = 0
var s = 0
para l en leerLineas(argumentos()[0]) { n = n + 1 }
imprimir(n)`, '50001', [path.join(dir, 'grande.csv')]);
caso('se puede cortar con romper', SIS + `var p = []
para l en leerLineas(argumentos()[0]) { si longitud(p) == 2 { romper }
  agregar(p, l) }
imprimir(p)`, '["id,v", "0,0"]', [path.join(dir, 'grande.csv')]);
caso('quita el \\r de Windows y da la última línea sin salto', SIS + `imprimir(recoger(leerLineas(argumentos()[0])))
usar recoger de "corrutinas"`, '["uno", "dos", "tres"]', [path.join(dir, 'crlf.txt')]);
caso('un archivo que no está es un error capturable', SIS + `intentar { leerLineas("/no/esta.txt") } capturar (e) { imprimir("capturado") }`, 'capturado');
caso('copiar, mover e info', SIS + `fijo d = argumentos()[0]
copiarArchivo(unirRuta(d, "crlf.txt"), unirRuta(d, "c.txt"))
moverArchivo(unirRuta(d, "c.txt"), unirRuta(d, "m.txt"))
fijo i = infoArchivo(unirRuta(d, "m.txt"))
imprimir(existeArchivo(unirRuta(d, "c.txt")), i["tamano"], i["esArchivo"], i["esCarpeta"], tipo(i["modificado"]))`,
  'falso 14 cierto falso fecha', [dir]);
caso('carpetaActual y cambiarCarpeta', SIS + `cambiarCarpeta(argumentos()[0])
imprimir(nombreArchivo(carpetaActual()), existeArchivo("crlf.txt"))`, `${path.basename(dir)} cierto`, [dir]);
caso('infoSistema', SIS + `fijo i = infoSistema()
imprimir(tipo(i["procesadores"]), i["procesadores"] > 0, tipo(i["so"]), longitud(i["personal"]) > 0)`, 'entero cierto texto cierto');

console.log('\n── S2.3 rutas ──');
const sep = path.sep === '\\' ? '\\\\' : '/';
caso('unirRuta usa el separador del sistema y limpia', SIS + `imprimir(unirRuta("a", "b", "..", "c.csv"))`, ['a', 'c.csv'].join(path.sep));
caso('nombre, extensión, carpeta', SIS + `fijo r = unirRuta("datos", "2026", "ventas.csv")
imprimir(nombreArchivo(r), extension(r), nombreArchivo(sinExtension(r)), nombreArchivo(carpetaDe(r)), "[" + extension("sin") + "]")`,
  'ventas.csv .csv ventas 2026 []');
caso('absoluta y relativa', SIS + `fijo a = rutaAbsoluta("x")
imprimir(esRutaAbsoluta(a), esRutaAbsoluta("x"), rutaRelativa(carpetaActual(), a))`, 'cierto falso x');
{
  // Sin anfitrión (el IDE): las que son de texto puro siguen funcionando, con «/».
  require(R.bundle);
  const out = [];
  const m = globalThis.EspanolLike.crearMotor({ salida: s => out.push(s) });
  const r = m.ejecutar(SIS + 'imprimir(unirRuta("a/", "b", "../c.txt"), normalizarRuta("/x/./y/../z"), extension("a.tar.gz"))');
  comprobar('sin anfitrión, las rutas de texto funcionan con «/»', r.ok && out[0] === 'a/c.txt /x/z .gz', r.ok ? out : r.errores.map(e => e.formato()).join(';'));
  const out2 = [];
  const m2 = globalThis.EspanolLike.crearMotor({ salida: s => out2.push(s) });
  const r2 = m2.ejecutar(SIS + 'servir(8080, fn(p) { devolver "x" })');
  comprobar('y servir dice que hace falta un anfitrión que abra puertos', !r2.ok && r2.errores[0].formato().includes('abrir puertos'),
    r2.ok ? 'corrió' : r2.errores[0].formato());
}

console.log('\n── S2.4 procesos ──');
const ES_WIN = process.platform === 'win32';
if (!ES_WIN) {
  caso('ejecutar con entrada', `fijo r = ejecutar("cat", [], {"entrada": "hola por la entrada"})\nimprimir(r["salida"])`, 'hola por la entrada');
  caso('con entorno y carpeta', `fijo r = ejecutar("sh", ["-c", "echo $SALUDO; pwd"], {"entorno": {"SALUDO": "hola"}, "carpeta": "/"})\nimprimir(r["salida"])`, 'hola\n/');
  caso('con espera: lo que tarda demasiado se para', `fijo r = ejecutar("sleep", ["5"], {"espera": 200})\nimprimir(r["codigo"], r["error"])`,
    '-1 se pasó del tiempo de espera y se paró');
  caso('una opción mal escrita se dice', `ejecutar("ls", [], {"carpta": "/"})`, r => r.codigo === 1 && r.salida.includes('«carpta»'));
  const r = caso('ejecutarEnFondo: dos a la vez', SIS + `usar todas de "corrutinas"
fn principal() { fijo t0 = ahora()
  fijo rs = esperar todas([ejecutarEnFondo("sh", ["-c", "sleep 0.3; echo uno"]), ejecutarEnFondo("sh", ["-c", "sleep 0.3; echo dos"])])
  imprimir(rs[0]["salida"] + rs[1]["salida"] + texto(entero(ahora() - t0))) }
principal()
imprimir("sigo")`, r => /^sigo\nuno\ndos\n\d+$/.test(r.salida));
  const ms = +(/(\d+)$/.exec(r.salida) || [])[1];
  comprobar('y tardan lo de uno, no lo de dos (menos de 550 ms)', ms > 0 && ms < 550, ms + ' ms');
  caso('un programa que no existe no tumba nada', SIS + `fn p() { fijo r = esperar ejecutarEnFondo("no_existe_xyz_123")
  imprimir(r["codigo"], longitud(r["error"]) > 0) }
p()`, '-1 cierto');
} else saltar('procesos con sh y cat', 'esto es Windows');

console.log('\n── S2.5 el servidor ──');
const SRV = SIS + `fn lento() { esperar dormir(30)
  devolver respuesta(201, "tardé", {"cabeceras": {"X-Prueba": "si"}}) }
usar dormir de "corrutinas"
fn principal() {
  fijo srv = servir(0, fn(p) {
    si p["ruta"] == "/hola" { devolver "hola " + obtener(p["consulta"], "nombre", "mundo") }
    si p["ruta"] == "/json" { devolver {"metodo": p["metodo"], "cuerpo": p["cuerpo"], "lista": [1, 2]} }
    si p["ruta"] == "/html" { devolver "<h1>hola</h1>" }
    si p["ruta"] == "/lento" { devolver lento() }
    si p["ruta"] == "/roto" { lanzar "secreto interno" }
    si p["ruta"] == "/nada" { devolver nulo }
    si p["ruta"] == "/datos" { devolver {"estado": "activo", "cuerpo": "no es una respuesta"} }
    devolver respuesta(404, "no está: " + p["ruta"])
  })
  fijo info = esperar srv["listo"]
  fijo base = "http://127.0.0.1:" + texto(info["puerto"])
  para ruta en ["/hola?nombre=Diego", "/json", "/html", "/lento", "/nada", "/otra", "/datos", "/roto"] {
    fijo r = esperar pedir(base + ruta)
    imprimir(ruta, r["estado"], r["tipo"], r["cuerpo"])
  }
  fijo post = esperar pedir(base + "/json", {"metodo": "post", "cuerpo": "datos"})
  imprimir("post", post["cuerpo"])
  detenerServidor(srv)
  imprimir("parado")
}
principal()`;
{
  const r = correr(SRV);
  const l = r.salida.split('\n');
  const tiene = t => l.includes(t);
  comprobar('texto, con la consulta', tiene('/hola?nombre=Diego 200 text/plain hola Diego'), r.salida);
  comprobar('un diccionario sale como JSON', tiene('/json 200 application/json {"metodo":"GET","cuerpo":"","lista":[1,2]}'), r.salida);
  comprobar('lo que empieza por < sale como HTML', tiene('/html 200 text/html <h1>hola</h1>'), r.salida);
  comprobar('un manejador asíncrono, con estado y cabeceras propias', tiene('/lento 201 text/plain tardé'), r.salida);
  comprobar('nulo es 204 sin cuerpo', tiene('/nada 204 text/plain '), JSON.stringify(l));
  comprobar('el 404 lo decide el programa, con respuesta()', tiene('/otra 404 text/plain no está: /otra'), r.salida);
  comprobar('un dic de datos con «estado» y «cuerpo» sigue siendo JSON, no una respuesta', tiene('/datos 200 application/json {"estado":"activo","cuerpo":"no es una respuesta"}'), r.salida);
  comprobar('un error es un 500 que NO cuenta qué falló por dentro', tiene('/roto 500 text/plain error interno del servidor'), r.salida);
  comprobar('…pero en la consola sí se dice, entero', r.salida.includes('secreto interno') && l.indexOf('/roto 500 text/plain error interno del servidor') > 0, r.salida);
  comprobar('el cuerpo de un POST llega', tiene('post {"metodo":"POST","cuerpo":"datos","lista":[1,2]}'), r.salida);
  comprobar('detenerServidor deja que el programa acabe', tiene('parado') && r.codigo === 1, `código ${r.codigo}`);
}
caso('un puerto ocupado se dice y se puede capturar', SIS + `fn p() { fijo a = servir(0, fn(q) { devolver "a" })
  fijo ia = esperar a["listo"]
  fijo b = servir(ia["puerto"], fn(q) { devolver "b" })
  intentar { esperar b["listo"] } capturar (e) { imprimir("capturado:", texto(e)) }
  detenerServidor(a) }
p()`, r => /capturado: .*ya está en uso/.test(r.salida));
caso('por defecto solo escucha en este equipo; abrirlo es una opción escrita', SIS + `servir(0, fn(p) { devolver "x" }, {"abierto": cierto})`,
  r => r.codigo === 1 && r.salida.includes('«abierto»') && r.salida.includes('0.0.0.0'));
caso('respuesta() comprueba lo que se le da', SIS + `respuesta(200, "x", {"cabezeras": {}})`, r => r.codigo === 1 && r.salida.includes('«cabezeras»'));
caso('y un estado que no existe', SIS + `respuesta(999, "x")`, r => r.codigo === 1 && r.salida.includes('999'));
caso('y una cabecera con salto de línea (que partiría la respuesta en dos)', SIS + `respuesta(200, "x", {"cabeceras": {"X-A": "a\nSet-Cookie: b"}})`,
  r => r.codigo === 1 && r.salida.includes('salto de línea'));

console.log('\n── S2.6 la entrada, de verdad línea a línea ──');
caso('leerLinea con la entrada por tubería', `fijo n = leerLinea("¿Nombre? ")\nimprimir("hola", n)\nimprimir(leerLinea(), leerLinea())`,
  '¿Nombre? hola Ana\n30 nulo', [], { entrada: 'Ana\n30\n' });
{
  // En una terminal de verdad: la 4.0 leía la entrada ENTERA antes de la
  // primera línea, así que «hola Ana» no salía hasta el Ctrl+D. Se comprueba
  // con una pseudoterminal de Python, si la hay.
  const py = spawnSync('python3', ['-c', 'import pty'], { encoding: 'utf8' });
  if (ES_WIN || py.status !== 0) saltar('en una terminal', 'no hay pseudoterminal');
  else {
    const prog = path.join(taller, 'tty.esl');
    fs.writeFileSync(prog, 'fijo n = leerLinea("¿Nombre? ")\nimprimir("hola", n)\nfijo e = leerLinea("¿Edad? ")\nimprimir("edad", e)\n');
    const script = path.join(taller, 'tty.py');
    fs.writeFileSync(script, `import os, pty, time, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1], sys.argv[2], sys.argv[3]])
out = b''
def leer(t):
    global out
    fin = time.time() + t
    while time.time() < fin:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: out += os.read(fd, 1024)
            except OSError: return
leer(1.5)
os.write(fd, b'Ana\\n'); leer(1.0)
print('TRAS-UNA-LINEA:' + out.decode().replace('\\r', '').replace('\\n', '|'))
os.write(fd, b'30\\n'); leer(1.0)
os.write(fd, b'\\x04'); leer(0.5)
try: os.kill(pid, 9)
except Exception: pass
`);
    const r = spawnSync('python3', ['-I', script, process.execPath, NNODE, prog], { encoding: 'utf8', timeout: 20000 });
    const linea = (/TRAS-UNA-LINEA:(.*)/.exec(r.stdout || '') || [])[1] || '';
    comprobar('en una terminal, contesta a cada línea sin esperar al Ctrl+D', linea.includes('hola Ana') && linea.includes('¿Edad?'), linea || r.stderr);
  }
}

console.log('\n── nombres libres y errores que cruzan nativas ──');
caso('servir, reservarMemoria, leerLineas, enFondo siguen libres sin el «usar»', `fn servir(x) { devolver x }
var reservarMemoria = 2
fn leerLineas() { devolver 3 }
fijo enFondo = 4
imprimir(servir(1), reservarMemoria, leerLineas(), enFondo)`, '1 2 3 4');
caso('un lanzar dentro de la función de mapear se captura fuera (en la 4.0 no)', `fn f(x) { si x == 2 { lanzar "en " + texto(x) }
  devolver x }
intentar { mapear([1, 2, 3], f) } capturar (e) { imprimir("capturado", texto(e)) }
intentar { filtrar([1], funcion(x) { lanzar "b" }) } capturar (e) { imprimir("capturado", texto(e)) }`, 'capturado en 2\ncapturado b');
{
  require(R.bundle);
  const src = `fn f(x) { si x == 99999 { lanzar "en " + texto(x) }
  devolver x * 2 }
fn caliente(l) { devolver mapear(l, f) }
var s = 0
para i en rango(3000) { s = s + longitud(caliente([1, 2, 3])) }
intentar { caliente([1, 99999]) } capturar (e) { imprimir("capturado", texto(e)) }
imprimir(s)`;
  const res = [true, false].map(jit => {
    const o = [];
    const m = globalThis.EspanolLike.crearMotor({ salida: s => o.push(s), jit, limiteInstr: 1e9 });
    const r = m.ejecutar(src);
    return { t: r.ok ? o.join('|') : 'E', jit: m.vm.stats.jitCompiladas };
  });
  comprobar('y con el JIT compilando la función que lanza, igual', res[0].t === 'capturado en 99999|9000' && res[1].t === res[0].t && res[0].jit > 0,
    JSON.stringify(res));
}

try { fs.rmSync(taller, { recursive: true, force: true }); } catch (_) {}
console.log(`\n  ${ok} pasan · ${mal} fallan${saltadas ? ` · ${saltadas} saltadas` : ''}\n`);
process.exit(mal ? 1 : 0);
