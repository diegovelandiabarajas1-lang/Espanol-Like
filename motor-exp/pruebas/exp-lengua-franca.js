// motor-exp · N4.6 «Ser la lengua franca»: Ñ como biblioteca de C.
//
// Un programa de Ñ se compila con «n-compilar --biblioteca» a una biblioteca
// compartida con sus funciones «publico» y la ABI de C, más su cabecera y un
// módulo de Python. Aquí se llama desde C, C++, Python, Rust y Go (los que haya
// instalados), se compara con lo que da la VM, se buscan fugas con valgrind, se
// cargan tres bibliotecas de Ñ en el mismo proceso y se compila la DLL de
// Windows (con mingw) mirando qué exporta.
//
//   node motor-exp/pruebas/exp-lengua-franca.js           (--rapida: sin Rust, Go ni valgrind)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAPIDA = process.argv.includes('--rapida');
const N_COMPILAR = path.join(__dirname, '..', 'util', 'n-compilar.js');
const N_NODE = path.join(__dirname, '..', 'util', 'n-node.js');
let pasan = 0, fallan = 0, saltadas = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle ? `\n      ${String(detalle).split('\n').slice(0, 12).join('\n      ')}` : '')); }
};
const saltar = m => { saltadas++; console.log(`  (${m})`); };
const hay = (cmd, arg) => { try { return spawnSync(cmd, [arg || '--version'], { encoding: 'utf8' }).status === 0; } catch (_) { return false; } };
const correr = (cmd, args, opc) => {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 26 }, opc || {}));
  // (Windows) printf escribe «\r\n»: se compara sin el \r
  const limpio = t => (t || '').replace(/\r\n/g, '\n').trim();
  return { ok: r.status === 0, out: limpio(r.stdout), err: limpio(r.stderr) + (r.error ? ' ' + r.error.message : ''), status: r.status };
};
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const EXE = WIN ? '.exe' : '';
// cómo se enlaza contra una biblioteca de la carpeta: en Windows, la DLL se busca al lado del .exe
const enlazar = (dir, libs) => ['-L', dir].concat(libs.map(l => '-l' + l)).concat(WIN ? [] : [`-Wl,-rpath,${dir}`]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-lengua-franca-'));
const escribir = (n, s) => { fs.mkdirSync(path.dirname(path.join(tmp, n)), { recursive: true }); fs.writeFileSync(path.join(tmp, n), s); };

const cc = hay('gcc') ? 'gcc' : hay('clang') ? 'clang' : null;
if (!cc) { console.log('  (no hay compilador de C: la prueba entera se salta)'); console.log('\n0 pasan, 0 fallan · saltada entera'); process.exit(0); }

// ── la biblioteca de prueba ─────────────────────────────────────────────────
escribir('mates.esl', `usar mayusculas de "texto"
usar raiz de "numerico"
var llamadas = 0
imprimir("mates: lista")

publico fn hipotenusa(a: real, b: real): real {
  llamadas = llamadas + 1
  devolver raiz(a * a + b * b)
}
publico fn factorial(n: entero): entero {
  si n <= 1 { devolver 1 }
  devolver n * factorial(n - 1)
}
publico fn saludo(nombre: texto): texto { devolver "¡Hola, " + mayusculas(nombre) + "!" }
publico fn esPar(n: entero): bool { devolver n % 2 == 0 }
publico fn dividir(a: real, b: real): real {
  si b == 0 { lanzar "no se divide entre cero" }
  devolver a / b
}
publico fn cuadrados(n: entero) {
  var r = []
  para i en rango(n) { agregar(r, i * i) }
  devolver r
}
publico fn resumen(xs: lista<real>) {
  var s = 0.0
  para x en xs { s = s + x }
  devolver { "suma": s, "n": longitud(xs), "media": s / longitud(xs) }
}
publico fn sumador(k: real) { devolver fn(x) { devolver x + k } }
publico fn aplicar(f, x: real): real { devolver f(x) }
publico fn cuantas(): entero { devolver llamadas }
publico fn avisar(m: texto): nulo { imprimir("aviso: " + m) }
publico fn mal(x: real): real {
  var d = {"a": 1}
  devolver x + d["b"]
}
publico fn salirse(): nulo { salir(3) }
publico fn mentira(): entero { devolver medio() }
fn privada() { devolver 1 }
fn medio() { devolver 2.5 }
`);
escribir('mod/util2.esl', 'publico fn doble(x: real): real { devolver 2 * x }\n');
escribir('otra.esl', `usar "mod/util2.esl" como u
publico fn doble(x: real): real { devolver u.doble(x) }
publico fn version(): texto { devolver "otra 1" }
`);
escribir('rota.esl', `fijo d = {"a": 1}
fijo x = d["no"]
publico fn f(): real { devolver 1 }
`);

console.log('── compilar');
const c1 = correr(process.execPath, [N_COMPILAR, path.join(tmp, 'mates.esl'), '--biblioteca'], { cwd: tmp });
const archLib = WIN ? 'mates.dll' : MAC ? 'libmates.dylib' : 'libmates.so';
comprobar('n-compilar --biblioteca da la biblioteca, la cabecera y el módulo de Python',
  c1.ok && [archLib, 'mates.h', 'mates.py'].every(f => fs.existsSync(path.join(tmp, f))) && /14 funciones exportadas/.test(c1.out), c1.out + c1.err);
const c2 = correr(process.execPath, [N_COMPILAR, path.join(tmp, 'otra.esl'), '--biblioteca', '--prefijo', 'ot_'], { cwd: tmp });
const c3 = correr(process.execPath, [N_COMPILAR, path.join(tmp, 'rota.esl'), '--biblioteca'], { cwd: tmp });
comprobar('una con un módulo propio (usar … como u) y --prefijo; otra cuyo nivel superior falla', c2.ok && c3.ok, c2.out + c2.err + c3.out + c3.err);
const h = fs.existsSync(path.join(tmp, 'mates.h')) ? fs.readFileSync(path.join(tmp, 'mates.h'), 'utf8') : '';
comprobar('la cabecera: las firmas de C de las funciones «publico» y nada de lo privado',
  h.includes('double mates_hipotenusa(double a, double b);') && h.includes('int64_t mates_factorial(int64_t n);') &&
    h.includes('char* mates_saludo(const char* nombre);') && h.includes('int mates_esPar(int64_t n);') &&
    h.includes('mates_valor* mates_resumen(const mates_valor* xs);') && h.includes('void mates_avisar(const char* m);') &&
    h.includes('extern "C"') && !h.includes('privada'), h.split('\n').slice(18, 50).join('\n'));
// las exportaciones: en Linux con nm, en Windows con objdump (viene con mingw y w64devkit)
const exportadas = archivo => {
  if (WIN) {
    if (!hay('objdump', '--version')) return null;
    const od = correr('objdump', ['-p', archivo]);
    const tabla = (od.out.split('[Ordinal/Name Pointer] Table')[1] || '').split(/\n\s*\n/)[0];
    return { nombres: [...tabla.matchAll(/\]\s+(\S+)/g)].map(m => m[1]), dlls: [...od.out.matchAll(/DLL Name: (\S+)/g)].map(m => m[1]) };
  }
  if (MAC || !hay('nm', '--version')) return null;
  const nm = correr('nm', ['-D', '--defined-only', archivo]);
  return { nombres: nm.out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean), dlls: [] };
};
{
  const ex = exportadas(path.join(tmp, archLib));
  if (ex) comprobar('la biblioteca solo exporta lo suyo, con su prefijo (nada de la biblioteca de apoyo)',
    ex.nombres.length > 30 && ex.nombres.every(n => n.startsWith('mates_')), ex.nombres.filter(n => !n.startsWith('mates_')).slice(0, 10).join(' '));
  else saltar('sin nm ni objdump: no se miran las exportaciones');
  if (ex && WIN) comprobar('mates.dll solo depende de DLL del sistema (KERNEL32, msvcrt/ucrt): nada que instalar',
    ex.dlls.every(d => /^(KERNEL32|msvcrt|ucrtbase|api-ms-win-[\w-]+)\.dll$/i.test(d)), ex.dlls.join(' '));
}

// errores al compilar
const errComp = (nombre, src, re) => {
  escribir(nombre + '.esl', src);
  const r = correr(process.execPath, [N_COMPILAR, path.join(tmp, nombre + '.esl'), '--biblioteca'], { cwd: tmp });
  return { ok: !r.ok && re.test(r.out + r.err), txt: r.out + r.err };
};
const e1 = errComp('nada', 'fn f(): real { devolver 1 }\n', /no exporta nada: marca con «publico»/);
const e2 = errComp('choca', 'publico fn error(): real { devolver 1 }\n', /choca_error, que es un nombre de la API/);
const e3 = errComp('gen', 'publico fn g() { producir 1 }\n', /generador o una función asíncrona/);
comprobar('se dice al compilar: sin «publico», un nombre que choca con la API, un generador', e1.ok && e2.ok && e3.ok, [e1.txt, e2.txt, e3.txt].join('\n'));

// ── desde C ─────────────────────────────────────────────────────────────────
console.log('── desde C');
escribir('uso.c', `#define __USE_MINGW_ANSI_STDIO 1
#include <stdio.h>
#include <math.h>
#include "mates.h"
static void decir(const char* q) { const char* e = mates_error(); printf("%s: %s\\n", q, e ? e : "NULL"); }
int main(void) {
  printf("hipotenusa %.17g\\n", mates_hipotenusa(3, 4));
  printf("factorial %lld\\n", (long long)mates_factorial(15));
  char* s = mates_saludo("ñandú"); printf("saludo %s\\n", s); mates_liberar(s);
  printf("esPar %d %d\\n", mates_esPar(10), mates_esPar(7));
  double d = mates_dividir(1, 0); printf("dividir %s\\n", isnan(d) ? "NaN" : "?"); decir("error");
  double h2 = mates_hipotenusa(5, 12); printf("tras una buena %g\\n", h2); decir("error");
  mates_valor* c = mates_cuadrados(5);
  double xs[8]; int64_t n = mates_valor_reales(c, xs, 8);
  char* r = mates_valor_repr(c); printf("cuadrados %s %s n=%lld x4=%g\\n", mates_valor_tipo(c), r, (long long)n, xs[4]); mates_liberar(r); mates_valor_soltar(c);
  double ys[] = {1, 2, 3, 4.5};
  mates_valor* l = mates_nuevo_lista_reales(ys, 4);
  mates_valor* res = mates_resumen(l);
  r = mates_valor_repr(res); printf("resumen %s %s\\n", mates_valor_tipo(res), r); mates_liberar(r);
  mates_valor* k2 = mates_valor_clave(res, 2); mates_valor* v2 = mates_valor_de(res, 2);
  char* kt = mates_valor_texto(k2); printf("clave2 %s = %g\\n", kt, mates_valor_real(v2)); mates_liberar(kt);
  mates_valor_soltar(k2); mates_valor_soltar(v2); mates_valor_soltar(res); mates_valor_soltar(l);
  mates_valor* f = mates_sumador(10);
  mates_valor* x = mates_nuevo_real(5);
  const mates_valor* args[] = { x };
  mates_valor* y = mates_llamar(f, args, 1);
  printf("sumador(10)(5) = %g (%s)\\n", mates_valor_real(y), mates_valor_tipo(f));
  printf("aplicar(sumador(10), 1) = %g\\n", mates_aplicar(f, 1));
  mates_valor_soltar(y); mates_valor_soltar(x); mates_valor_soltar(f);
  printf("cuantas %lld\\n", (long long)mates_cuantas());
  mates_avisar("desde C");
  double m = mates_mal(1); printf("mal %s\\n", isnan(m) ? "NaN" : "?"); decir("error");
  mates_salirse(); decir("salirse");
  long long g = (long long)mates_factorial(1LL << 60); printf("factorial(2^60) %lld\\n", g); decir("error");
  long long mm = (long long)mates_mentira(); printf("mentira %lld\\n", mm); decir("error");
  mates_valor* t = mates_nuevo_texto("ñ"); mates_valor* li = mates_nuevo_lista(); mates_lista_agregar(li, t);
  mates_valor* di = mates_nuevo_dic(); mates_dic_poner(di, t, li);
  r = mates_valor_repr(di); printf("hecho en C %s largo=%lld\\n", r, (long long)mates_valor_largo(di)); mates_liberar(r);
  mates_valor_soltar(t); mates_valor_soltar(li); mates_valor_soltar(di);
  return 0;
}
`);
const bc = correr(cc, ['-O1', '-g', path.join(tmp, 'uso.c'), '-o', path.join(tmp, 'uso' + EXE), '-I', tmp].concat(enlazar(tmp, ['mates']), ['-lm']));
const rc = bc.ok ? correr(path.join(tmp, 'uso' + EXE), []) : bc;
const L = rc.out.split('\n');
const esperadoC = [
  'mates: lista',
  'hipotenusa 5',
  'factorial 1307674368000',
  'saludo ¡Hola, ÑANDÚ!',
  'esPar 1 0',
  'dividir NaN',
  'error: error sin capturar: "no se divide entre cero"',
  'tras una buena 13',
  'error: NULL',
  'cuadrados lista [0, 1, 4, 9, 16] n=5 x4=16',
  'resumen dic {suma: 10.5, n: 4, media: 2.625}',
  'clave2 media = 2.625',
  'sumador(10)(5) = 15 (funcion)',
  'aplicar(sumador(10), 1) = 11',
  'cuantas 2',
  'aviso: desde C',
  'mal NaN',
  'error: la clave "b" no existe en el diccionario',
  '   ↳ claves disponibles: "a"',
  '   en mal (línea 36)',
  'salirse: «salir» dentro de una biblioteca: el programa que la usa es el que decide cuándo terminar',
  '   en salirse (línea 38)',
  'factorial(2^60) 0',
  'error: el entero 1152921504606846976 no cabe exacto en un número de Ñ (más de 2^53)',
  'mentira 0',
  'error: «mentira» tenía que devolver un entero y devolvió real',
  'hecho en C {ñ: ["ñ"]} largo=1',
];
const dif = esperadoC.map((e, i) => (L[i] === e ? null : `línea ${i + 1}: esperaba «${e}» y salió «${L[i]}»`)).filter(Boolean);
comprobar('números, enteros, textos UTF-8, bools, listas, diccionarios, cierres de ida y vuelta y la API de asas', rc.ok && dif.length === 0 && L.length === esperadoC.length, (dif.join('\n') || '') + '\n' + rc.err);
comprobar('un error de Ñ: NaN/0/NULL y <prefijo>error() con el mensaje, la pista y la línea; una llamada buena lo borra',
  L[6] === esperadoC[6] && L[8] === 'error: NULL' && L[19] === esperadoC[19]);
comprobar('«salir» en una biblioteca no cierra el programa; un entero de más de 2^53 y un tipo de vuelta equivocado se dicen',
  L[20] === esperadoC[20] && L[23] === esperadoC[23] && L[25] === esperadoC[25]);

// (motor-exp N4.7) desde varios hilos a la vez: las llamadas entran de una en una
// (el cerrojo) y el error es de cada hilo
escribir('hilos.c', `#define __USE_MINGW_ANSI_STDIO 1
#include <stdio.h>
#include <math.h>
#include "mates.h"
#ifdef _WIN32
#include <windows.h>
#define HILO DWORD WINAPI
#else
#include <pthread.h>
#define HILO void*
#endif
static double sumas[8]; static int errores_mal[8], errores_bien[8];
static HILO trabajar(void* p) {
  int k = (int)(long long)p; double s = 0;
  for (int i = 0; i < 3000; i++) {
    s += mates_hipotenusa(3, 4);
    mates_valor* c = mates_cuadrados(4); double xs[4]; mates_valor_reales(c, xs, 4); s += xs[3]; mates_valor_soltar(c);
    if (k % 2) { mates_dividir(1, 0); if (mates_error()) errores_mal[k]++; }
    else { mates_hipotenusa(1, 1); if (!mates_error()) errores_bien[k]++; }
  }
  sumas[k] = s; return 0;
}
int main(void) {
#ifdef _WIN32
  HANDLE h[8]; for (int k = 0; k < 8; k++) h[k] = CreateThread(NULL, 0, trabajar, (void*)(long long)k, 0, NULL);
  for (int k = 0; k < 8; k++) { WaitForSingleObject(h[k], INFINITE); CloseHandle(h[k]); }
#else
  pthread_t h[8]; for (int k = 0; k < 8; k++) pthread_create(&h[k], NULL, trabajar, (void*)(long long)k);
  for (int k = 0; k < 8; k++) pthread_join(h[k], NULL);
#endif
  int bien = 1; for (int k = 0; k < 8; k++) { if (sumas[k] != 3000 * 14.0) bien = 0; if (k % 2 ? errores_mal[k] != 3000 : errores_bien[k] != 3000) bien = 0; }
  printf("%s %lld\\n", bien ? "bien" : "mal", (long long)mates_cuantas());
  return 0;
}
`);
{
  const bh = correr(cc, ['-O1', path.join(tmp, 'hilos.c'), '-o', path.join(tmp, 'hilos' + EXE), '-I', tmp].concat(enlazar(tmp, ['mates']), WIN ? [] : ['-pthread'], ['-lm']));
  const rh = bh.ok ? correr(path.join(tmp, 'hilos' + EXE), []) : bh;
  comprobar('desde 8 hilos a la vez (N4.7): 48.000 llamadas sin romper nada, y el error de cada hilo es suyo',
    rh.ok && /^mates: lista\nbien \d+$/.test(rh.out), rh.out + rh.err);
}

// lo mismo que la VM
escribir('vm.esl', `usar hipotenusa, saludo, cuadrados, resumen, sumador, aplicar de "mates.esl"
imprimir("hipotenusa", hipotenusa(3, 4))
imprimir("saludo", saludo("ñandú"))
imprimir("cuadrados", cuadrados(5))
imprimir("resumen", resumen([1, 2, 3, 4.5]))
imprimir("aplicar", aplicar(sumador(10), 1))
`);
const rv = correr(process.execPath, [N_NODE, path.join(tmp, 'vm.esl')], { cwd: tmp });
const V = rv.out.split('\n');
comprobar('lo que da la biblioteca es lo que da la VM (mismos números, mismos textos, mismo repr)',
  rv.ok && V[0] === 'mates: lista' && V[1] === 'hipotenusa 5' && V[2] === 'saludo ¡Hola, ÑANDÚ!' &&
    V[3] === 'cuadrados [0, 1, 4, 9, 16]' && V[4] === 'resumen {suma: 10.5, n: 4, media: 2.625}' && V[5] === 'aplicar 11', rv.out + rv.err);

if (!RAPIDA && hay('valgrind')) {
  const vg = correr('valgrind', ['--leak-check=full', '--error-exitcode=9', path.join(tmp, 'uso')]);
  const lost = /definitely lost: 0 bytes/.test(vg.err) || /All heap blocks were freed/.test(vg.err);
  comprobar('valgrind: ninguna fuga ni acceso inválido (el conteo de referencias cuadra también desde fuera)',
    vg.status === 0 && lost && /ERROR SUMMARY: 0 errors/.test(vg.err), vg.err.split('\n').filter(l => /lost|ERROR|Invalid/.test(l)).join('\n'));
} else saltar(RAPIDA ? '--rapida: sin valgrind' : 'sin valgrind');

// ── C++, y tres bibliotecas de Ñ en el mismo proceso ────────────────────────
console.log('── desde C++, con tres bibliotecas a la vez');
if (hay('g++') || hay('clang++')) {
  escribir('tres.cpp', `#include <cstdio>
#include <string>
#include "mates.h"
#include "otra.h"
#include "rota.h"
int main() {
  std::printf("mates %g · otra %g\\n", mates_hipotenusa(3, 4), ot_doble(21));
  char* v = ot_version(); std::string s(v); ot_liberar(v);
  std::printf("%s · errores %s %s\\n", s.c_str(), mates_error() ? "sí" : "no", ot_error() ? "sí" : "no");
  double r = rota_f(); const char* e = rota_error();
  std::printf("rota %s · %s\\n", r != r ? "NaN" : "?", e ? e : "NULL");
  r = rota_f(); std::printf("rota otra vez %s\\n", rota_error() ? "el mismo error" : "NULL");
  std::printf("iniciar %d · mates sigue %g\\n", rota_iniciar(), mates_hipotenusa(6, 8));
  return 0;
}
`);
  const cxx = hay('g++') ? 'g++' : 'clang++';
  const b = correr(cxx, ['-O1', path.join(tmp, 'tres.cpp'), '-o', path.join(tmp, 'tres' + EXE), '-I', tmp].concat(enlazar(tmp, ['mates', 'otra', 'rota'])));
  const r = b.ok ? correr(path.join(tmp, 'tres' + EXE), []) : b;
  comprobar('C++ (extern "C"); tres bibliotecas de Ñ juntas, cada una con lo suyo; un módulo propio dentro de una',
    r.ok && r.out.includes('mates 5 · otra 42') && r.out.includes('otra 1 · errores no no'), r.out + r.err);
  comprobar('si lo de nivel superior falla, cada llamada lo dice (con su línea) y <prefijo>iniciar() da 0; las otras siguen',
    r.out.includes('rota NaN · la clave "no" no existe en el diccionario') && r.out.includes('en principal (línea 2)') &&
      r.out.includes('rota otra vez el mismo error') && r.out.includes('iniciar 0 · mates sigue 10'), r.out);
} else saltar('sin compilador de C++');

// ── Python ──────────────────────────────────────────────────────────────────
console.log('── desde Python (ctypes, el .py generado)');
// en Windows Python suele llamarse «python» o «py»; y su salida, sin decirle nada, no es UTF-8
const PY = ['python3', 'python', 'py'].find(p => hay(p) && spawnSync(p, ['-c', 'import ctypes'], { encoding: 'utf8' }).status === 0);
if (PY) {
  escribir('uso.py', `import sys; sys.path.insert(0, ${JSON.stringify(tmp)})
import mates
print(mates.hipotenusa(3, 4), mates.factorial(10), mates.saludo('ñu'), mates.esPar(4))
print(mates.cuadrados(4), mates.resumen([1, 2, 3.5]))
f = mates.sumador(2.5)
print(f(1), f(10), type(f).__name__, mates.aplicar(f, 100))
try:
    mates.dividir(1, 0)
except mates.ErrorÑ as e:
    print('ErrorÑ:', e)
try:
    mates.mal(1)
except mates.ErrorN as e:
    print('ErrorN:', str(e).splitlines()[0])
try:
    mates.resumen([1, 'a'])
except mates.ErrorÑ as e:
    print('tipos:', str(e).splitlines()[0])
mates.avisar('desde Python')
print(mates.cuantas())
`);
  const r = correr(PY, [path.join(tmp, 'uso.py')], { env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }) });
  const P = r.out.split('\n');
  comprobar('Python: números, textos, listas y dict de ida y vuelta, y una función de Ñ que se llama desde Python',
    r.ok && P[1] === '5.0 3628800 ¡Hola, ÑU! True' && P[2] === "[0, 1, 4, 9] {'suma': 6.5, 'n': 3, 'media': 2.1666666666666665}" &&
      P[3] === '3.5 12.5 FuncionÑ 102.5', r.out + r.err);
  comprobar('Python: un error de Ñ es una excepción ErrorÑ con el mensaje de la VM',
    P[4] === 'ErrorÑ: error sin capturar: "no se divide entre cero"' && P[5] === 'ErrorN: la clave "b" no existe en el diccionario' &&
      /^tipos: /.test(P[6] || ''), P.slice(4, 7).join('\n'));
} else saltar('sin Python');

// ── Rust y Go ───────────────────────────────────────────────────────────────
console.log('── desde Rust y Go');
if (!RAPIDA && hay('rustc') && !WIN) {
  escribir('main.rs', `use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_void};
#[link(name = "mates")]
extern "C" {
    fn mates_hipotenusa(a: c_double, b: c_double) -> c_double;
    fn mates_saludo(n: *const c_char) -> *mut c_char;
    fn mates_dividir(a: c_double, b: c_double) -> c_double;
    fn mates_error() -> *const c_char;
    fn mates_liberar(p: *mut c_void);
}
fn main() {
    unsafe {
        println!("rust: hipotenusa {}", mates_hipotenusa(6.0, 8.0));
        let n = CString::new("rust").unwrap();
        let s = mates_saludo(n.as_ptr());
        println!("rust: {}", CStr::from_ptr(s).to_str().unwrap());
        mates_liberar(s as *mut c_void);
        let d = mates_dividir(1.0, 0.0);
        println!("rust: {} · {}", d, CStr::from_ptr(mates_error()).to_str().unwrap());
    }
}
`);
  const b = correr('rustc', ['-O', path.join(tmp, 'main.rs'), '-L', tmp, '-C', `link-args=-Wl,-rpath,${tmp}`, '-o', path.join(tmp, 'rs')]);
  const r = b.ok ? correr(path.join(tmp, 'rs'), []) : b;
  comprobar('Rust (extern "C")', r.ok && r.out.includes('rust: hipotenusa 10') && r.out.includes('rust: ¡Hola, RUST!') &&
    r.out.includes('rust: NaN · error sin capturar'), r.out + r.err);
} else saltar(RAPIDA ? '--rapida: sin Rust' : WIN ? 'Rust en Windows enlaza con el enlazador de MSVC (.lib): no se prueba aquí' : 'sin rustc');
if (!RAPIDA && hay('go', 'version')) {
  const dg = path.join(tmp, 'go');
  fs.mkdirSync(dg, { recursive: true });
  fs.writeFileSync(path.join(dg, 'go.mod'), 'module prueba\ngo 1.21\n');
  fs.writeFileSync(path.join(dg, 'main.go'), `package main

/*
#cgo CFLAGS: -I${tmp.replace(/\\/g, '/')}
#cgo LDFLAGS: -L${tmp.replace(/\\/g, '/')} -lmates${WIN ? '' : ` -Wl,-rpath,${tmp}`}
#include <stdlib.h>
#include "mates.h"
*/
import "C"
import (
	"fmt"
	"unsafe"
)

func main() {
	fmt.Println("go: hipotenusa", float64(C.mates_hipotenusa(5, 12)))
	n := C.CString("go")
	defer C.free(unsafe.Pointer(n))
	s := C.mates_saludo(n)
	fmt.Println("go:", C.GoString(s))
	C.mates_liberar(unsafe.Pointer(s))
	fmt.Println("go: factorial", int64(C.mates_factorial(12)), "esPar(3)", int(C.mates_esPar(3)))
}
`);
  const env = Object.assign({}, process.env, { GOFLAGS: '-mod=mod', GOTOOLCHAIN: 'local', CGO_ENABLED: '1' });
  if (!env.GOCACHE) env.GOCACHE = path.join(os.tmpdir(), 'exp-lengua-franca-gocache');
  const b = correr('go', ['build', '-o', path.join(dg, 'g' + EXE), '.'], { cwd: dg, env });
  if (WIN && b.ok) fs.copyFileSync(path.join(tmp, archLib), path.join(dg, archLib));   // la DLL, al lado del .exe
  const r = b.ok ? correr(path.join(dg, 'g' + EXE), []) : b;
  comprobar('Go (cgo)', r.ok && r.out.includes('go: hipotenusa 13') && r.out.includes('go: ¡Hola, GO!') && r.out.includes('go: factorial 479001600 esPar(3) 0'), r.out + r.err);
} else saltar(RAPIDA ? '--rapida: sin Go' : 'sin go');

// ── Windows ─────────────────────────────────────────────────────────────────
console.log('── la DLL de Windows (compilada con mingw)');
const mingw = 'x86_64-w64-mingw32-gcc';
if (WIN) saltar('en Windows la DLL ya se probó arriba, de verdad');
else if (hay(mingw)) {
  const dw = path.join(tmp, 'win');
  const r = correr(process.execPath, [N_COMPILAR, path.join(tmp, 'mates.esl'), '--biblioteca', '-o', dw, '--cc', mingw], { cwd: tmp });
  const dll = path.join(dw, 'mates.dll');
  const od = hay('x86_64-w64-mingw32-objdump') ? correr('x86_64-w64-mingw32-objdump', ['-p', dll]) : null;
  if (od) {
    const tabla = (od.out.split('[Ordinal/Name Pointer] Table')[1] || '').split(/\n\s*\n/)[0];
    const exp = [...tabla.matchAll(/\]\s+(\S+)/g)].map(m => m[1]);
    const dlls = [...od.out.matchAll(/DLL Name: (\S+)/g)].map(m => m[1]);
    comprobar('mates.dll: exporta solo las funciones con su prefijo y solo depende de KERNEL32 y msvcrt (nada que instalar)',
      r.ok && exp.length > 30 && exp.every(n => n.startsWith('mates_')) && dlls.every(d => /^(KERNEL32|msvcrt)\.dll$/i.test(d)),
      r.out + r.err + '\n' + exp.slice(0, 5).join(' ') + ' · ' + dlls.join(' '));
  } else comprobar('mates.dll se compila', r.ok && fs.existsSync(dll), r.out + r.err);
  fs.writeFileSync(path.join(dw, 'uso.c'), '#include <stdio.h>\n#include "mates.h"\nint main(void) { printf("%g\\n", mates_hipotenusa(3, 4)); return 0; }\n');
  const e = correr(mingw, [path.join(dw, 'uso.c'), '-o', path.join(dw, 'uso.exe'), '-I', dw, '-L', dw, '-lmates']);
  comprobar('un programa de Windows enlaza contra mates.dll con la cabecera generada', e.ok, e.err);
} else saltar('sin mingw: la DLL de Windows no se prueba');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log(`\n${pasan} pasan, ${fallan} fallan` + (saltadas ? ` · ${saltadas} partes saltadas` : ''));
process.exit(fallan ? 1 : 0);
