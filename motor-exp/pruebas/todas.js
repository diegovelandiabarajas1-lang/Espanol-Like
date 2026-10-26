// Pasa todas las suites en orden y resume. Devuelve código 1 si algo falla,
// para que sirva igual a mano que dentro de otro script.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// (motor-exp N4.6) Varias suites (nativo, aislado, ejemplos) miran el IDE YA
// construido, que vive en salida/, fuera de git: en un clon recién hecho no
// existe, y la suite caía con un ENOENT que no decía qué faltaba. Se construye
// aquí si no está.
{
  const R = require('../rutas.js');
  for (const [archivo, args] of [['espanol-like-v4.html', []], ['c1en.html', ['--c1en']]]) {
    if (!fs.existsSync(R.entrega(archivo))) {
      console.log(`(construyendo ${archivo}: hace falta para las pruebas y no estaba)`);
      execFileSync(process.execPath, [path.join(__dirname, '..', 'util', 'construir-ide.js')].concat(args), { stdio: 'ignore' });
    }
  }
}

const SUITES = [
  ['motor',       'motor.js',        'el lenguaje, la máquina, el recolector y el JIT'],
  ['excepciones', 'excepciones.js',  'intentar / capturar / finalmente / lanzar'],
  ['web',         'web.js',          'el árbol de nodos de la página'],
  ['estilos',     'estilos.js',      'el tipo estilo: anidamiento, medios y clases locales'],
  ['interacción', 'interaccion.js',  'eventos, identidad, memoria y temporizadores'],
  ['serial',      'serial.js',       'el formato .elb y su verificación'],
  ['fuera',       'fuera.js',        'archivos, procesos y entrada, en Node y en QuickJS'],
  ['nativo',      'nativo.js',       'llamar a código compilado desde Ñ'],
  ['módulos',     'modulos.js',      'usar, publico, ámbito por archivo, ciclos y rutas'],
  ['eDSL',        'edsl.js',         'el mecanismo de los eDSL nativos, desde dentro'],
  ['en Ñ',        'en-n.js',         'las suites escritas en Ñ, con el eDSL probar'],
  ['aislado',     'aislado.js',      'el IDE entero en un navegador de verdad'],
  ['ejemplos',    'ejemplos-ide.js', 'los ejemplos del selector, uno por uno'],
  ['apps',        'apps.js',         'los programas de ejemplos/, con anfitrión completo'],
  ['pseudocódigo','pseudocodigo.js',  'la notación de PSeInt corriendo en el motor de Ñ'],
  ['C1EÑ',        'c1en.js',         'núcleos de Ñ en jit, C nativo y GPU (simulada), comparados al bit'],
  ['núcleos NEÑ', 'nen-nucleos.js',  'los núcleos de tensores y Fourier compilados en C contra su respaldo'],
  ['perfil C1EÑ', 'perfil-c1en.js',  'el bundle con numerico y nen abiertos: sin «usar», y el mismo código que Ñ'],
  ['empaquetar',  'empaquetar.js',   'un programa de varios archivos cosido en un ejecutable, de consola y de ventana'],
  ['.elb varios', 'elb-varios.js',   'un programa con sus módulos en un solo .elb: portable, verificado entero'],
  ['exp: rendim.', 'exp-rendimiento.js', 'motor-exp R1: a[i] en arreglos, rango sin lista, a[i] y agregar en línea, autollamada'],
  ['exp: página', 'exp-pagina.js',   'motor-exp P1: la página se reconcilia y los controles recuerdan lo escrito (Chromium)'],
  ['exp: expres.', 'exp-expresividad.js', 'motor-exp X1: registros con métodos, si-expresión, ??, ?., desestructurar, segun'],
  ['exp: expres.2', 'exp-expresividad2.js', 'motor-exp X2–X4: defectos, con nombre, publico tipo, a?.m(), genéricos, generadores, asíncronas'],
  ['exp: nulos', 'exp-nulos.js', 'motor-exp X5: «texto?» al estilo Kotlin — estrechamiento, ??, ?., y «devolver» por todos los caminos'],
  ['exp: sistema', 'exp-sistema.js', 'motor-exp S1–S2: FFI con firmas de C, arreglos sin copiar, retrollamadas, servidor, reloj, procesos, entrada'],
  ['exp: NEÑ',    'exp-nen.js',     'motor-exp N1: grande contra mpmath, enteros exactos, amplitud contra SciPy, numerico y datos en nen, volumen'],
  ['exp: NEÑ gpu', 'exp-nen-gpu.js', 'motor-exp N2: NEÑ igual en jit, nativo y GPU (simulada), y residente en la GPU'],
  ['exp: precisión', 'exp-precision.js', 'motor-exp N4.2: real32 y real16 contra float, _Float16 y fmaf de C, NumPy, y el SGEMM igual en jit, nativo y GPU'],
  ['exp: colas GPU', 'exp-asincrono.js', 'motor-exp N4.3: colas, eventos y lanzar sin esperar, con la GPU simulada perezosa (nada corre hasta que hace falta)'],
  ['exp: bloques', 'exp-bloques.js', 'motor-exp N4.4: paraleloBloques — bloques, hilos, memoria compartida y barreras, igual en jit, nativo y GPU (simulada)'],
  ['exp: tipos de máquina', 'exp-tipos.js', 'motor-exp N4.5: i8 u8 i16 u16 u32 i64 u64 — aritmética y bits al bit contra NumPy, 64 bits exactos, y en los núcleos de jit, nativo y GPU (simulada)'],
  ['exp: lengua franca', 'exp-lengua-franca.js', 'motor-exp N4.6: Ñ como biblioteca de C (n-compilar --biblioteca), llamada desde C, C++, Python, Rust y Go; tres a la vez; valgrind; la DLL de Windows'],
  ['exp: hilos', 'exp-hilos.js', 'motor-exp N4.7: hilos(n, f) de la CPU con barreras, candados, esperas y atómicos (jit = nativo), y atómicos en paralelo (jit, nativo, GPU simulada)'],
  ['exp: varias GPU', 'exp-varias-gpu.js', 'motor-exp N4.8: paraleloRepartido entre las GPU (= paralelo al bit), colaGpu(k), enGpu(k, f) y copias de GPU a GPU (simulador de 1, 2 y 3 GPU)'],
  ['exp: plantillas', 'exp-plantillas.js', 'motor-exp N4.9: núcleos genéricos (arreglo<T>, k: T), tipoArreglo y los límites del tipo como constantes, la rama que toca de cada «si» constante (jit = nativo = GPU simulada = VM)'],
  ['exp: interop', 'exp-interop.js', 'motor-exp N4.10: cabeceraNativa lee un .h entero (estructuras, enum, opacos, retrollamadas) y el ejecutable llama a C sin capa, igual que la VM; Ñ → C → Ñ; el .exe de Windows'],
  ['exp: sinComprobar', 'exp-sin-comprobar.js', 'motor-exp N4.11: sinComprobar { … } — avisado; la VM y jit comprueban, nativo, GPU y el ejecutable no (los mismos resultados si el programa es correcto; las esperas se quedan)'],
  ['exp: web script', 'exp-web-script.js', 'motor-exp P6/P7: <script type="text/ñ"> en una página normal — en orden, src con usar, eventos, data-destino, errores con su línea; irAPagina y usar heredado (Chromium de verdad)'],
  ['exp: sin runtime', 'exp-aot.js --rapida', 'motor-exp N4.1: el programa como ejecutable nativo, igual a la VM letra por letra (la completa: exp-aot.js)'],
];

let fallan = 0, saltadas = 0;
const t0 = Date.now();
for (const [nombre, archivo, que] of SUITES) {
  process.stdout.write(`── ${nombre.padEnd(12)} ${que}\n`);
  try {
    const [arch, ...args] = archivo.split(' ');   // una suite puede llevar opciones: «exp-aot.js --rapida»
    const salida = execFileSync(process.execPath, [path.join(__dirname, arch), ...args], { encoding: 'utf8' });
    const ultima = salida.trim().split('\n').filter(l => l.trim()).pop() || '';
    // Una suite saltada entera sale con 0 igual que una que pasa, pero no es lo
    // mismo y marcarla con ✓ miente: no se probó nada.
    saltadas += /saltada entera/.test(ultima) ? 1 : 0;
    console.log(`   ${/saltada entera/.test(ultima) ? '–' : '✓'} ` + ultima.trim());
  } catch (e) {
    fallan++;
    const texto = ((e.stdout || '') + (e.stderr || '')).trim().split('\n');
    console.log('   ✗ FALLA');
    // Las líneas que de verdad importan son las que llevan ✗, no las últimas
    // doce: con un volcado de pila al final, la cola es el volcado y los fallos
    // quedan fuera de la pantalla. Pasó: una suite con cinco fallos enseñaba
    // dos, y los otros tres no se sabía ni cuáles eran.
    const marcados = texto.filter(l => l.includes('✗'));
    const resumen = texto.filter(l => /\d+ (pasan|de \d+)/.test(l)).slice(-1);
    const mostrar = marcados.length ? marcados.slice(0, 15).concat(resumen) : texto.slice(-12);
    for (const l of mostrar) console.log('     ' + l.trim());
    if (marcados.length > 15) console.log(`     … y ${marcados.length - 15} más`);
  }
}
console.log(`\n${SUITES.length - fallan - saltadas} de ${SUITES.length - saltadas} suites en verde` +
  (saltadas ? ` · ${saltadas} saltada${saltadas > 1 ? 's' : ''} por falta de herramientas, no por fallos` : '') +
  ` · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
process.exit(fallan ? 1 : 0);
