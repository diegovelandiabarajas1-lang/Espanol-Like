// Ñ llamando a código compilado: «nativa», «cargarNativa», «estructuraNativa».
//
// Se prueba lanzando el intérprete de verdad, porque lo que importa aquí no es
// que una función de JavaScript devuelva lo que se espera: es que una llamada
// salga del proceso hacia una biblioteca compilada y vuelva, y que cuando algo
// va mal llegue como error capturable de Ñ en vez de tumbar el proceso.
//
// Tres cosas se comprueban en todas las plataformas usando la biblioteca de C
// del sistema (libc en Linux, msvcrt en Windows), y una cuarta —raylib— solo si
// la biblioteca está a mano; si no está, se dice y se salta.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../rutas.js');

let ok = 0, mal = 0, saltadas = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 400) : ''); }
};
const saltar = (n, por) => { saltadas++; console.log('  ·', n, '— saltada:', por); };

const taller = fs.mkdtempSync(path.join(os.tmpdir(), 'n-nativo-'));
function correr(fuente, args, motor) {
  const f = path.join(taller, 'p-' + Math.random().toString(36).slice(2) + '.esl');
  fs.writeFileSync(f, fuente, 'utf8');
  // La variable se pone aquí y no fuera para que la suite no dependa de con qué
  // entorno la lancen: el caso de «getenv» necesita algo que leer.
  const entorno = Object.assign({}, process.env, { N_PRUEBA_NATIVO: 'hola desde el entorno' });
  const r = motor === 'qjs'
    ? spawnSync('qjs', ['--std', R.util('n.js'), f].concat(args || []), { encoding: 'utf8', env: entorno })
    : spawnSync(process.execPath, [R.util('n-node.js'), f].concat(args || []), { encoding: 'utf8', env: entorno });
  fs.unlinkSync(f);
  return { salida: (r.stdout || '').trim(), error: (r.stderr || '').trim(), codigo: r.status };
}
// Cada caso es un programa entero: si algo se saliera del aislamiento o tumbara
// el proceso, se vería aquí como un código de salida raro y no como una
// aserción que falla en silencio.
function caso(nombre, fuente, esperado, args) {
  const r = correr(fuente, args);
  const bien = typeof esperado === 'function' ? esperado(r) : r.salida === esperado;
  comprobar(nombre, bien, `código ${r.codigo}\n      salida: ${r.salida}\n      error: ${r.error}`);
  return r;
}

// La biblioteca de C del sistema, que es la única que se puede dar por hecha.
const LIBC = process.platform === 'win32' ? 'msvcrt.dll'
  : process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';
// En Windows las matemáticas están en la misma msvcrt; en Linux van aparte.
const LIBM = process.platform === 'win32' ? 'msvcrt.dll'
  : process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libm.so.6';
// La msvcrt.dll de Windows es la biblioteca de C de ANTES de C99: no tiene
// «atoll». Su nombre para lo mismo es «_atoi64». En Linux y Mac es «atoll».
const ATOLL = process.platform === 'win32' ? '_atoi64' : 'atoll';

console.log(`  (la biblioteca de C de este sistema es ${LIBC})`);

// ---------------------------------------------------------------------------
console.log('\n── 0. los mensajes del sistema se entienden en cualquier idioma ──');
{
  // Esto corre SIEMPRE, con o sin koffi, porque es justo lo que no se podía
  // probar: el traductor de errores buscaba el texto del sistema operativo en
  // inglés —«The specified module could not be found»— y en un Windows en
  // español el sistema dice «No se puede encontrar el módulo especificado». La
  // prueba «una biblioteca que no existe» fallaba solo en esa máquina, y solo
  // con koffi instalado. Lo que decide la categoría es el prefijo de koffi, que
  // siempre está en inglés; el texto del sistema solo afina.
  const { enEspanol } = require(R.util('nativo-koffi.js'));
  const t = m => enEspanol({ message: m });
  const noEsta = 'no está ahí, o está pero no se puede abrir';
  comprobar('biblioteca inexistente, Windows en español',
    t('Failed to load shared library: No se puede encontrar el módulo especificado.') === noEsta);
  comprobar('biblioteca inexistente, Windows en inglés',
    t('Failed to load shared library: The specified module could not be found.') === noEsta);
  comprobar('biblioteca inexistente, Linux',
    t('Failed to load shared library: cannot open shared object file: No such file or directory') === noEsta);
  comprobar('otra arquitectura, Windows en español',
    /otra arquitectura/.test(t('Failed to load shared library: %1 no es una aplicación Win32 válida.')));
  comprobar('otra arquitectura, Windows en inglés',
    /otra arquitectura/.test(t('Failed to load shared library: %1 is not a valid Win32 application.')));
  comprobar('otra arquitectura, Linux',
    /otra arquitectura/.test(t('Failed to load shared library: wrong ELF class: ELFCLASS32')));
  comprobar('símbolo que no está',
    t("Cannot find function 'no_existe_xyz' in shared library") === 'ese símbolo no está en la biblioteca');
  comprobar('lo que no se reconoce pasa tal cual, que es mejor que inventar',
    t('Something entirely different happened') === 'Something entirely different happened');
}

console.log('\n── 1. hay anfitrión, o no lo hay ──');

const hayKoffi = (() => { try { require('koffi'); return true; } catch (_) { return false; } })();
console.log(hayKoffi ? '  (koffi está instalado: se prueba todo)'
  : '  (koffi NO está: solo se prueba que se diga con esas palabras)');

caso('hayNativo() contesta sin fallar y dice la verdad',
  'imprimir(hayNativo())', hayKoffi ? 'cierto' : 'falso');

if (!hayKoffi) {
  caso('sin koffi, «nativa» dice que falta el anfitrión',
    'nativa("libc.so.6", "abs", "entero", ["entero"])',
    r => r.codigo === 1 && r.salida.includes('necesita un anfitrión con código nativo'));
  caso('y explica cómo instalarlo',
    'nativa("libc.so.6", "abs", "entero", ["entero"])', r => r.salida.includes('npm install koffi'));
}

// ---------------------------------------------------------------------------
console.log('\n── 2. una llamada nativa de verdad, desde un programa en Ñ ──');

if (hayKoffi) {
  caso('cos(0) da 1, y la cuenta la hizo C',
    `fijo cos = nativa("${LIBM}", "cos", "real", ["real"])\nimprimir(cos(0.0))`, '1');
  caso('la biblioteca se puede abrir antes de declarar nada',
    `cargarNativa("${LIBM}")\nimprimir(bibliotecasNativas())`, `["${LIBM}"]`);
  caso('abrirla dos veces no es un error',
    `cargarNativa("${LIBM}")\ncargarNativa("${LIBM}")\nimprimir(longitud(bibliotecasNativas()))`, '1');
  caso('declararla también la abre',
    `fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\nimprimir(bibliotecasNativas())`, `["${LIBC}"]`);
  caso('la función declarada es una función de Ñ como cualquier otra',
    `fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\nimprimir(tipo(a), a(0 - 7))`, 'funcion 7');
  caso('y se puede pasar a mapear como una función de Ñ',
    `fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\nimprimir(mapear([0-1, 0-2, 3], a))`,
    '[1, 2, 3]');
  caso('la declaración se puede guardar y reusar; no hay que redeclararla',
    `fijo cos = nativa("${LIBM}", "cos", "real", ["real"])\nvar s = 0.0\npara i en rango(5) { s = s + cos(0.0) }\nimprimir(s)`, '5');
} else {
  saltar('las llamadas nativas', 'no hay koffi');
}

// ---------------------------------------------------------------------------
console.log('\n── 3. qué tipos pasan, y qué pasa de vuelta ──');

if (hayKoffi) {
  caso('enteros van y vuelven',
    `fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\nimprimir(a(0 - 2147483647), tipo(a(0-1)))`,
    '2147483647 entero');
  caso('reales van y vuelven con decimales',
    `fijo p = nativa("${LIBM}", "pow", "real", ["real", "real"])\nimprimir(p(2.0, 0.5))`,
    r => r.salida.startsWith('1.41421356'));
  caso('un real32 pierde precisión, y es lo que se pidió',
    `fijo p = nativa("${LIBM}", "powf", "real32", ["real32", "real32"])\nimprimir(p(2.0, 0.5) != 0)`,
    r => r.salida === 'cierto' || r.salida.includes('ese símbolo no está'));
  caso('un texto entra como cadena de C y su longitud la cuenta C',
    `fijo l = nativa("${LIBC}", "strlen", "tamano", ["texto"])\nimprimir(l("anejo"), l("añejo"))`,
    '5 6');
  caso('y un texto vuelve de C como texto de Ñ',
    `fijo g = nativa("${LIBC}", "getenv", "texto", ["texto"])\nimprimir(g("N_PRUEBA_NATIVO"))`,
    'hola desde el entorno');
  caso('un puntero nulo de C llega como nulo de Ñ',
    `fijo g = nativa("${LIBC}", "getenv", "texto", ["texto"])\nimprimir(g("NO_EXISTE_NI_DE_BROMA_XYZ"))`,
    'nulo');
  caso('una función que no devuelve nada devuelve nulo',
    `fijo s = nativa("${LIBC}", "srand", "nulo", ["natural"])\nimprimir(s(1))`, 'nulo');
  // Y aquí una trampa que conviene tener escrita: «log» es el `bool` de C, un
  // byte que vale 0 o 1. Un montón de funciones de C que parecen devolver un
  // booleano devuelven en realidad un `int` cualquiera distinto de cero —glibc
  // hace que isdigit() devuelva 2048—, y declararlas «log» da falso siempre.
  // Se declaran «entero» y se comparan con 0. No es un defecto de la
  // traducción: es lo que dice la firma que se declaró.
  caso('un int de C que no es 0 ni 1 declarado «log» da falso, y eso es la firma, no un fallo',
    `fijo i = nativa("${LIBC}", "isdigit", "log", ["entero"])\nimprimir(i(53))`, 'falso');
  caso('el mismo símbolo declarado «entero» dice la verdad',
    `fijo i = nativa("${LIBC}", "isdigit", "entero", ["entero"])\nimprimir(i(53) != 0, i(65) != 0)`,
    'cierto falso');

  console.log('  — punteros —');
  caso('un puntero es un entero, y se puede devolver al mismo C', `
fijo malloc = nativa("${LIBC}", "malloc", "puntero", ["tamano"])
fijo free   = nativa("${LIBC}", "free", "nulo", ["puntero"])
fijo memset = nativa("${LIBC}", "memset", "puntero", ["puntero", "entero", "tamano"])
fijo strcpy = nativa("${LIBC}", "strcpy", "texto", ["puntero", "texto"])
fijo largo  = nativa("${LIBC}", "strlen", "tamano", ["puntero"])
fijo p = malloc(64)
imprimir("es entero:", tipo(p), "· no es cero:", p > 0)
memset(p, 0, 64)
imprimir("lo que dejó strcpy:", strcpy(p, "hola desde C"))
imprimir("y strlen sobre el puntero:", largo(p))
free(p)
imprimir("liberado")`,
    r => r.salida.includes('es entero: entero · no es cero: cierto')
      && r.salida.includes('lo que dejó strcpy: hola desde C')
      && r.salida.includes('y strlen sobre el puntero: 12')
      && r.salida.includes('liberado'));

  console.log('  — estructuras —');
  caso('una estructura devuelta por valor llega como diccionario', `
estructuraNativa("div_t", {"quot": "entero", "rem": "entero"})
fijo div = nativa("${LIBC}", "div", "div_t", ["entero", "entero"])
fijo d = div(17, 5)
imprimir(tipo(d), d["quot"], d["rem"])`, 'dic 3 2');
  caso('estructuraNativa devuelve su nombre, para usarlo como tipo',
    'imprimir(estructuraNativa("Punto", {"x": "entero", "y": "entero"}))', 'Punto');
  caso('declarar la misma estructura igual dos veces no es un error', `
estructuraNativa("Punto2", {"x": "entero", "y": "entero"})
estructuraNativa("Punto2", {"x": "entero", "y": "entero"})
imprimir("bien")`, 'bien');
  caso('y una estructura sirve como tipo de un campo de otra', `
estructuraNativa("P", {"x": "entero", "y": "entero"})
estructuraNativa("Caja", {"esq": "P", "ancho": "entero"})
imprimir("bien")`, 'bien');
} else {
  saltar('los tipos', 'no hay koffi');
}

// ---------------------------------------------------------------------------
console.log('\n── 4. cuando algo va mal, llega como error de Ñ ──');

if (hayKoffi) {
  // El programa entero va envuelto en intentar/capturar: lo que se comprueba es
  // que el error se pueda capturar, que traiga el tipo «nativo», y que el
  // proceso siga vivo detrás. Si algo de esto tumbara el proceso, no habría
  // línea «sigo vivo» y el caso fallaría.
  const falla = (nombre, cuerpo, espera) => caso(nombre, `
intentar {
${cuerpo}
  imprimir("NO FALLÓ")
} capturar (e) {
  imprimir(e.tipo + " | " + e.mensaje)
}
imprimir("sigo vivo")`, r => r.codigo === 0 && r.salida.includes('sigo vivo') && espera(r.salida));

  falla('una biblioteca que no existe', '  cargarNativa("no_existe_esta_cosa_xyz.so")',
    s => s.startsWith('nativo | ') && s.includes('no se pudo abrir la biblioteca') && s.includes('no está ahí'));
  falla('un símbolo que no existe', `  nativa("${LIBC}", "no_existe_xyz", "entero", [])`,
    s => s.startsWith('nativo | ') && s.includes('ese símbolo no está en la biblioteca'));
  falla('un tipo de devolución que no existe', `  nativa("${LIBC}", "abs", "tipoRaro", ["entero"])`,
    s => s.startsWith('nativo | ') && s.includes('no conozco el tipo «tipoRaro»'));
  falla('un tipo de argumento que no existe', `  nativa("${LIBC}", "abs", "entero", ["ninguno"])`,
    s => s.includes('no conozco el tipo «ninguno»'));
  falla('el error de tipo enseña los que sí hay', `  nativa("${LIBC}", "abs", "entero", ["ninguno"])`,
    s => s.includes('entero64') && s.includes('puntero') && s.includes('texto'));
  falla('«nulo» no vale como argumento', `  nativa("${LIBC}", "abs", "entero", ["nulo"])`,
    s => s.includes('solo vale como valor devuelto'));
  falla('demasiados argumentos', `  fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\n  a(1, 2, 3)`,
    s => s.includes('espera 1 argumento(s) y recibió 3'));
  falla('demasiado pocos argumentos', `  fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\n  a()`,
    s => s.includes('espera 1 argumento(s) y recibió 0'));
  falla('pasar algo que no tiene forma en C', `  fijo a = nativa("${LIBC}", "abs", "entero", ["entero"])\n  a(imprimir)`,
    s => s.startsWith('nativo | ') && s.includes('de tipo funcion y eso no se puede pasar'));
  falla('un entero de 64 bits que no cabe en Ñ se dice, no se redondea',
    `  fijo t = nativa("${LIBC}", "${ATOLL}", "entero64", ["texto"])\n  imprimir(t("9007199254740993"))`,
    s => s.startsWith('nativo | ') && s.includes('no cabe en un número de Ñ'));
  falla('el mismo entero de 64 bits, si cabe, llega exacto',
    `  fijo t = nativa("${LIBC}", "${ATOLL}", "entero64", ["texto"])\n  afirmar(t("4503599627370496") == 4503599627370496)\n  lanzar error("cabe", "prueba")`,
    s => s.includes('prueba | cabe'));
  falla('una estructura redeclarada con otros campos',
    '  estructuraNativa("Otra", {"a": "entero"})\n  estructuraNativa("Otra", {"a": "real"})',
    s => s.startsWith('nativo | ') && s.includes('ya se declaró con otros campos'));
  falla('una estructura sin campos', '  estructuraNativa("Vacia", {})',
    s => s.includes('no sirve de nada'));
  falla('un diccionario con claves que no son texto',
    `  estructuraNativa("Dd", {"quot": "entero", "rem": "entero"})\n  fijo d = nativa("${LIBC}", "div", "Dd", ["entero", "entero"])\n  imprimir(d(1, 1))\n  lanzar error("hecho", "prueba")`,
    s => s.includes('prueba | hecho'));
  falla('más argumentos declarados de los que se admiten',
    `  nativa("${LIBC}", "printf", "entero", ["texto","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero","entero"])`,
    s => s.includes('no se declaran más de 16 argumentos'));

  caso('descargar deja muertas las funciones ya declaradas, y decirlo es mejor que saltar a ninguna parte', `
fijo cos = nativa("${LIBM}", "cos", "real", ["real"])
imprimir("antes:", cos(0.0))
imprimir("descargada:", descargarNativa("${LIBM}"))
intentar { imprimir(cos(0.0)) } capturar (e) { imprimir(e.tipo + " | " + e.mensaje) }
imprimir("sigo vivo")`,
    r => r.codigo === 0 && r.salida.includes('antes: 1') && r.salida.includes('descargada: cierto')
      && r.salida.includes('nativo | ') && r.salida.includes('se descargó') && r.salida.includes('sigo vivo'));
  caso('descargar lo que no estaba abierto devuelve falso, no falla',
    'imprimir(descargarNativa("nunca_se_abrio.so"))', 'falso');
  caso('declarar nativas sin parar se corta con un límite, no con memoria', `
intentar {
  para i en rango(400) { nativa("${LIBC}", "abs", "entero", ["entero"]) }
  imprimir("NO FALLÓ")
} capturar (e) {
  imprimir(e.tipo + " | " + e.mensaje)
}`, r => r.salida.startsWith('nativo | ') && r.salida.includes('no se declaran más de 256 funciones'));
} else {
  saltar('los errores', 'no hay koffi');
}

// ---------------------------------------------------------------------------
console.log('\n── 5. una biblioteca gráfica de verdad ──');
{
  // Solo se llama a lo que no necesita ventana: contar caracteres, convertir
  // colores, preguntar si hay ventana (no la hay). Es lo único que se puede
  // comprobar sin pantalla, y basta para demostrar que el enlace es real:
  // estas cuentas las hace raylib, no Ñ.
  // Se busca donde uno la dejaría: la variable N_RAYLIB, la raíz del proyecto
  // —al lado de espanol-like-v4.html—, o el directorio desde el que se llamó.
  const candidatas = [process.env.N_RAYLIB,
    R.entrega('raylib.dll'), R.entrega('libraylib.so'), R.entrega('libraylib.so.600'),
    './raylib.dll', './libraylib.so'].filter(Boolean);
  const hay = candidatas.find(c => { try { return fs.existsSync(c); } catch (_) { return false; } });
  if (!hayKoffi) saltar('raylib', 'no hay koffi');
  else if (!hay) saltar('raylib', 'no encuentro la biblioteca (pon N_RAYLIB=/ruta/a/libraylib.so o raylib.dll)');
  else {
    const RL = path.resolve(hay);
    console.log('  (usando', RL + ')');
    const r = caso('raylib contesta: texto, ficheros, colores y estructuras por valor', `
fijo RL = argumentos()[0]
cargarNativa(RL)
estructuraNativa("Color", {"r": "natural8", "g": "natural8", "b": "natural8", "a": "natural8"})
fijo silencio   = nativa(RL, "SetTraceLogLevel", "nulo", ["entero"])
fijo largo      = nativa(RL, "TextLength", "natural", ["texto"])
fijo extension  = nativa(RL, "GetFileExtension", "texto", ["texto"])
fijo aEntero    = nativa(RL, "ColorToInt", "entero", ["Color"])
fijo deHSV      = nativa(RL, "ColorFromHSV", "Color", ["real32", "real32", "real32"])
fijo desvanecer = nativa(RL, "Fade", "Color", ["Color", "real32"])
fijo hayVentana = nativa(RL, "IsWindowReady", "log", [])
fijo semilla    = nativa(RL, "SetRandomSeed", "nulo", ["natural"])
fijo azar       = nativa(RL, "GetRandomValue", "entero", ["entero", "entero"])
silencio(7)
imprimir("TextLength:", largo("anejo"), largo("añejo"))
imprimir("extension:", extension("D:/ProyectosJS/prog.esl"))
fijo rojo = {"r": 255, "g": 0, "b": 0, "a": 255}
imprimir("ColorToInt rojo:", aEntero(rojo))
imprimir("ColorFromHSV:", deHSV(0.0, 1.0, 1.0)["r"], deHSV(0.0, 1.0, 1.0)["g"])
imprimir("Fade alfa:", desvanecer(rojo, 0.5)["a"])
semilla(7)
fijo n = azar(10, 20)
imprimir("azar en rango:", n >= 10 y n <= 20)
imprimir("IsWindowReady:", hayVentana())
imprimir("descargada:", descargarNativa(RL))`,
      x => x.codigo === 0
        && x.salida.includes('TextLength: 5 6')
        && x.salida.includes('extension: .esl')
        && x.salida.includes('ColorToInt rojo: -16776961')
        && x.salida.includes('ColorFromHSV: 255 0')
        && x.salida.includes('Fade alfa: 127')
        && x.salida.includes('azar en rango: cierto')
        && x.salida.includes('IsWindowReady: falso')
        && x.salida.includes('descargada: cierto'),
      [RL]);
    comprobar('y no hay pantalla, así que IsWindowReady dice falso y nadie se cuelga',
      r.salida.includes('IsWindowReady: falso'), r.salida);

    // Y si hay pantalla —en Windows siempre; aquí solo con un servidor X de
    // mentira delante— se abre una ventana de verdad y se pintan dos
    // fotogramas. La prueba es MeasureText: sin ventana devuelve 0 porque no
    // hay tipografía cargada, y con ventana devuelve el ancho en píxeles. Eso
    // no se puede fingir desde JavaScript.
    const hayPantalla = process.platform === 'win32' || !!process.env.DISPLAY;
    if (!hayPantalla) saltar('abrir una ventana de verdad', 'este contenedor no tiene pantalla (prueba con xvfb-run)');
    else {
      const v = caso('se abre una ventana nativa y raylib mide el texto dentro de ella', `
fijo RL = argumentos()[0]
estructuraNativa("Color", {"r": "natural8", "g": "natural8", "b": "natural8", "a": "natural8"})
fijo aviso   = nativa(RL, "SetTraceLogLevel", "nulo", ["entero"])
fijo medir   = nativa(RL, "MeasureText", "entero", ["texto", "entero"])
fijo abrir   = nativa(RL, "InitWindow", "nulo", ["entero", "entero", "texto"])
fijo cerrar  = nativa(RL, "CloseWindow", "nulo", [])
fijo lista   = nativa(RL, "IsWindowReady", "log", [])
fijo empezar = nativa(RL, "BeginDrawing", "nulo", [])
fijo acabar  = nativa(RL, "EndDrawing", "nulo", [])
fijo fondo   = nativa(RL, "ClearBackground", "nulo", ["Color"])
fijo escribe = nativa(RL, "DrawText", "nulo", ["texto", "entero", "entero", "entero", "Color"])
aviso(5)
imprimir("antes de abrir, MeasureText:", medir("Hola desde Ñ", 40))
abrir(320, 200, "prueba de Ñ")
imprimir("IsWindowReady:", lista())
imprimir("con ventana, MeasureText:", medir("Hola desde Ñ", 40) > 0)
para i en rango(2) {
  empezar()
  fondo({"r": 24, "g": 22, "b": 37, "a": 255})
  escribe("Hola desde Ñ", 10, 10, 20, {"r": 240, "g": 240, "b": 245, "a": 255})
  acabar()
}
cerrar()
imprimir("cerrada sin incidentes")`,
        x => x.codigo === 0
          && x.salida.includes('antes de abrir, MeasureText: 0')
          && x.salida.includes('IsWindowReady: cierto')
          && x.salida.includes('con ventana, MeasureText: cierto')
          && x.salida.includes('cerrada sin incidentes'),
        [RL]);
      comprobar('sin ventana MeasureText da 0 y con ventana no: la diferencia la hace raylib, no Ñ',
        v.salida.includes('antes de abrir, MeasureText: 0') && v.salida.includes('con ventana, MeasureText: cierto'),
        v.salida);
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n── 6. la frontera: esto no puede existir dentro de una página ──');
{
  // Lo mismo que hace «fuera.js» con los archivos, y por la misma razón: llamar
  // a código nativo es ejecutar lo que sea dentro del proceso, y un programa que
  // corre en una pestaña no tiene por qué poder hacerlo. No es un permiso que
  // el programa pida: es una capacidad que el anfitrión da o no da.
  require(R.bundle);
  const m = globalThis.EspanolLike.crearMotor({ salida: () => {}, host: { web: {} } });
  const r1 = m.ejecutar('nativa("libc.so.6", "system", "entero", ["texto"])');
  comprobar('sin anfitrión nativo, no hay código nativo',
    !r1.ok && r1.errores[0].message.includes('necesita un anfitrión con código nativo'),
    (r1.errores || []).map(e => e.message).join(';'));
  const r2 = m.ejecutar('cargarNativa("libc.so.6")');
  comprobar('ni se puede abrir una biblioteca',
    !r2.ok && r2.errores[0].message.includes('necesita un anfitrión con código nativo'));
  const r3 = m.ejecutar('estructuraNativa("X", {"a": "entero"})');
  comprobar('ni declarar una estructura',
    !r3.ok && r3.errores[0].message.includes('necesita un anfitrión con código nativo'));
  const r4 = m.ejecutar('imprimir(hayNativo())');
  comprobar('pero preguntar si hay se puede, y contesta que no',
    r4.ok, (r4.errores || []).map(e => e.message).join(';'));
  let dicho = '';
  const m2 = globalThis.EspanolLike.crearMotor({ salida: s => { dicho = s; }, host: { web: {} } });
  m2.ejecutar('imprimir(hayNativo())');
  comprobar('y lo que contesta es «falso»', dicho === 'falso', dicho);

  // El IDE es el caso que importa de verdad: su anfitrión es el del marco
  // aislado, y ahí no hay ni archivos ni nativo. Que el nombre exista y diga
  // que no hay anfitrión es justo lo que se quiere: un mensaje, no un agujero.
  // El motor va en base64 dentro del HTML (el documento hijo lleva «</script>»
  // en sus propias cadenas), así que hay que decodificarlo para mirarlo.
  const html = fs.readFileSync(R.entrega('espanol-like-v4.html'), 'utf8');
  const bloques = (html.match(/[A-Za-z0-9+/=]{5000,}/g) || [])
    .map(b => { try { return Buffer.from(b, 'base64').toString('utf8'); } catch (_) { return ''; } });
  comprobar('el IDE construido lleva la biblioteca nueva dentro',
    bloques.some(t => t.includes('hayNativo') && t.includes('cargarNativa')),
    `bloques base64 encontrados: ${bloques.length}`);
  comprobar('y no lleva koffi ni nada que lo cargue',
    !/require\(['"]koffi/.test(html) && !html.includes('nativo-koffi'), 'algo de koffi acabó en el HTML');
}

// ---------------------------------------------------------------------------
console.log('\n── 7. QuickJS no puede, y lo dice ──');
{
  const hayQjs = spawnSync('qjs', ['--help'], { encoding: 'utf8' }).status !== null;
  if (!hayQjs) saltar('QuickJS', 'el binario no está aquí');
  else {
    // Esto no es un defecto por arreglar: QuickJS solo carga módulos nativos
    // compilados contra sus propias cabeceras, así que darle FFI exige un
    // compilador de C —justo lo que se quería evitar—. Se prueba para que la
    // diferencia entre los dos intérpretes esté escrita y no se olvide.
    const r = correr('imprimir(hayNativo())', [], 'qjs');
    comprobar('en QuickJS hayNativo() dice falso', r.salida === 'falso',
      `salida: ${r.salida}\n      error: ${r.error}`);
    const r2 = correr(`nativa("${LIBC}", "abs", "entero", ["entero"])`, [], 'qjs');
    comprobar('y «nativa» dice que falta el anfitrión, con el mismo mensaje que en el navegador',
      r2.salida.includes('necesita un anfitrión con código nativo'),
      `salida: ${r2.salida}\n      error: ${r2.error}`);
    const rn = correr('imprimir(hayNativo())', []);
    comprobar('en Node dice lo contrario, y esa diferencia es el punto',
      rn.salida === (hayKoffi ? 'cierto' : 'falso') && rn.salida !== r.salida === hayKoffi,
      `node: ${rn.salida} · qjs: ${r.salida}`);
  }
}

fs.rmSync(taller, { recursive: true, force: true });
console.log('\n── módulos y código nativo, juntos ──');
{
  // Las dos cosas nuevas se hicieron por separado; lo que ninguna de las dos
  // pruebas por su cuenta es que un módulo pueda envolver una biblioteca
  // compilada y exportar una interfaz en español. Es justo lo que uno quiere
  // hacer con las dos, así que se comprueba aquí.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n-mixto-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'mates.esl'), `
fijo LIB = entorno("N_LIBM", "${LIBM}")
fijo _cos = nativa(LIB, "cos", "real", ["real"])
fijo _pow = nativa(LIB, "pow", "real", ["real", "real"])
publico fn coseno(x: real): real { devolver _cos(x) }
publico fn potencia(a: real, b: real): real { devolver _pow(a, b) }
publico fijo DESDE = "C"
`, 'utf8');
  fs.writeFileSync(path.join(dir, 'main.esl'), `
usar "lib/mates.esl" como c
usar potencia de "lib/mates.esl"
usar redondear de "numerico"
imprimir(c.DESDE, redondear(c.coseno(0.0), 3), redondear(potencia(2.0, 10.0), 0))
# y que el JIT no se confunda llamando muchas veces a través del módulo
var s = 0.0
para i en rango(60) { s = s + c.coseno(0.0) }
imprimir("suma:", s)
`, 'utf8');
  const r = spawnSync(process.execPath, [R.util('n-node.js'), path.join(dir, 'main.esl')],
    { encoding: 'utf8', env: Object.assign({}, process.env) });
  const sal = (r.stdout || '').trim();
  if (!hayKoffi) saltar('un módulo envuelve una biblioteca compilada', 'no hay koffi');
  else {
    comprobar('un módulo puede envolver una biblioteca compilada',
      sal.includes('C 1 1024'), sal + '\n      ' + (r.stderr || ''));
    comprobar('y llamarla sesenta veces por el módulo no confunde al JIT',
      sal.includes('suma: 60'), sal);
  }
  // Lo privado del módulo sigue siendo privado aunque sea una función nativa.
  fs.writeFileSync(path.join(dir, 'fuga.esl'), 'usar "lib/mates.esl" como c\nimprimir(c._cos(0.0))\n', 'utf8');
  const r2 = spawnSync(process.execPath, [R.util('n-node.js'), path.join(dir, 'fuga.esl')], { encoding: 'utf8' });
  comprobar('una función nativa sin «publico» no se escapa del módulo',
    r2.status === 1 && /no exporta/.test(r2.stdout || ''), (r2.stdout || '').trim());
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${ok} pasan, ${mal} fallan${saltadas ? `, ${saltadas} saltadas` : ''}\n`);
process.exit(mal ? 1 : 0);
