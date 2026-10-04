// Ñ fuera del navegador: archivos, procesos, argumentos y entrada. Se prueba
// lanzando los intérpretes de verdad —el de Node siempre, el de QuickJS si el
// binario está— porque lo que importa aquí es que los dos hagan lo mismo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const R = require('../rutas.js');

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 300) : ''); }
};

const hayQjs = spawnSync('qjs', ['--help'], { encoding: 'utf8' }).status !== null;
// Esta faltaba, y el fallo solo salía en una máquina SIN qjsc: aquí siempre
// estaba, así que la rama del «if» no se ejecutaba nunca y el nombre sin definir
// no lo veía nadie. Salió la primera vez que el proyecto corrió en Windows.
let saltadas = 0;
const saltar = (n, por) => { saltadas++; console.log('  ·', n, '— saltada:', por); };
const taller = fs.mkdtempSync(path.join(os.tmpdir(), 'n-fuera-'));
const prog = f => path.join(taller, f);

// Lanza un programa por el intérprete que se le diga y devuelve lo que salió.
function correr(motor, fuente, args, entrada) {
  const f = prog('p-' + Math.random().toString(36).slice(2) + '.esl');
  fs.writeFileSync(f, fuente, 'utf8');
  const r = motor === 'node'
    ? spawnSync(process.execPath, [R.util('n-node.js'), f].concat(args || []), { encoding: 'utf8', input: entrada || '' })
    : spawnSync('qjs', ['--std', R.util('n.js'), f].concat(args || []), { encoding: 'utf8', input: entrada || '' });
  fs.unlinkSync(f);
  return { salida: (r.stdout || '').trim(), error: (r.stderr || '').trim(), codigo: r.status };
}

const motores = ['node'].concat(hayQjs ? ['qjs'] : []);
console.log(hayQjs ? '  (se prueban Node y QuickJS)' : '  (QuickJS no está aquí: solo se prueba Node)');

// Cada caso corre en todos los intérpretes y tiene que dar lo mismo en todos.
function enTodos(nombre, fuente, esperado, args, entrada) {
  const vistos = motores.map(m => [m, correr(m, fuente, args, entrada)]);
  for (const [m, r] of vistos) {
    const bien = typeof esperado === 'function' ? esperado(r) : r.salida === esperado;
    comprobar(`${nombre} · ${m}`, bien, `salida: ${r.salida}\n      error: ${r.error}`);
  }
  if (vistos.length > 1) {
    // Los dos tienen que decir lo mismo salvo el código que añade el sistema
    // operativo entre paréntesis (ENOENT y compañía): ese detalle es útil y no
    // tiene por qué coincidir, el resto del mensaje sí.
    const igual = t => t.replace(/ \([A-Z]{2,}\)/g, '');
    comprobar(`${nombre} · los dos dicen lo mismo`, igual(vistos[0][1].salida) === igual(vistos[1][1].salida),
      vistos.map(([m, r]) => m + ': ' + r.salida).join('\n      '));
  }
}

console.log('\n── 1. lo básico sigue en pie ──');
enTodos('el motor corre igual fuera', 'fn fib(n: entero): entero {\n si n < 2 { devolver n }\n devolver fib(n-1) + fib(n-2)\n}\nimprimir(fib(22))', '17711');
enTodos('un error de tipos se dice y devuelve 1', 'var x: entero = "no"',
  r => r.codigo === 1 && r.salida.includes('se declaró como entero'));

console.log('\n── 2. archivos ──');
const base = taller.replace(/\\/g, '/');
enTodos('escribir, añadir y leer', `
usar recortar de "texto"
fijo f = "${base}/uno.txt"
escribirTexto(f, "a\\n")
agregarTexto(f, "b\\n")
imprimir(recortar(leerTexto(f)), tamanoArchivo(f), existeArchivo(f))`, 'a\nb 4 cierto');
enTodos('crear carpeta y listar', `
crearCarpeta("${base}/x/y")
escribirTexto("${base}/x/y/z.txt", "z")
imprimir(esCarpeta("${base}/x"), listar("${base}/x/y"), esCarpeta("${base}/x/y/z.txt"))`,
  'cierto ["z.txt"] falso');
enTodos('borrar dice si había algo', `
escribirTexto("${base}/b.txt", "b")
imprimir(borrarArchivo("${base}/b.txt"), borrarArchivo("${base}/b.txt"))`, 'cierto falso');
enTodos('leer lo que no existe es un error de tipo «archivo», y se captura', `
intentar {
    leerTexto("${base}/no-existe-jamas.txt")
    imprimir("no debería llegar")
} capturar (e) {
    imprimir(tipo(e), e["tipo"], contiene(e["mensaje"], "leerTexto"))
}`, 'error archivo cierto');
enTodos('y sin capturar, el programa termina con 1', `leerTexto("${base}/tampoco.txt")`,
  r => r.codigo === 1 && r.salida.includes('leerTexto'));

console.log('\n── 3. procesos, argumentos y entorno ──');
// Los programas que se lanzan aquí son «node» y nada más. Antes eran «echo» y
// «ls», y eso hacía que estas cuatro pruebas fallaran en Windows sin que el
// motor tuviera nada que ver: allí «echo» no es un programa, es una palabra del
// intérprete de órdenes, y «ls» no existe. La marca de que un argumento no se
// convirtió en otra orden tampoco puede ser «/tmp/…»: se toma del sistema.
const NODO = process.execPath;
const centinela = path.join(os.tmpdir(), 'n-no-deberia-existir');
try { fs.rmSync(centinela, { force: true }); } catch (_) {}
enTodos('lanzar un programa y leer su salida',
  `usar recortar de "texto"\nfijo r = ejecutar(${JSON.stringify(NODO)}, ["-e", "process.stdout.write('hola mundo')"])\nimprimir(r["codigo"], recortar(r["salida"]))`,
  '0 hola mundo');
enTodos('un programa que falla llega como datos, no como excepción',
  `fijo r = ejecutar(${JSON.stringify(NODO)}, ["-e", "process.stderr.write('mal'); process.exit(3)"])\nimprimir(r["codigo"] != 0, longitud(r["error"]) > 0)`,
  'cierto cierto');
// El argumento lleva dentro una orden entera. Si «ejecutar» pasara por un
// intérprete de órdenes, esa orden se ejecutaría y el centinela existiría; como
// no pasa, el argumento vuelve tal cual y el archivo no aparece.
const travesura = `; node -e "require('fs').writeFileSync(${JSON.stringify(JSON.stringify(centinela))}, 'x')"`;
enTodos('un argumento con espacios no se convierte en otra orden',
  `usar recortar de "texto"\nfijo r = ejecutar(${JSON.stringify(NODO)}, ["-e", "process.stdout.write(process.argv[1])", ${JSON.stringify('a' + travesura)}])\nimprimir(recortar(r["salida"]))`,
  'a' + travesura);
comprobar('y de verdad no se ejecutó', !fs.existsSync(centinela), centinela);
enTodos('los argumentos llegan al programa', 'imprimir(argumentos())', '["uno", "dos tres"]', ['uno', 'dos tres']);
enTodos('el entorno se lee, con valor por defecto',
  'imprimir(entorno("NO_EXISTE_NI_DE_BROMA", "nada"))', 'nada');

console.log('\n── 4. entrada por consola ──');
enTodos('leerLinea lee líneas hasta que se acaban', `
var n = 0
var l = leerLinea()
mientras l != nulo {
    n = n + 1
    imprimir(texto(n) + ": " + l)
    l = leerLinea()
}
imprimir("total " + texto(n))`, '1: hola\n2: qué tal\ntotal 2', [], 'hola\nqué tal\n');

console.log('\n── 5. el ejemplo de línea de órdenes ──');
{
  const csv = path.join(taller, 'ventas.csv');
  fs.writeFileSync(csv, 'producto,mes,importe\nteclado,enero,120.5\nmonitor,enero,340\nteclado,febrero,95.25\nmonitor,febrero,410\n');
  const ej = R.proyecto + '/ejemplos/informe.esl';
  for (const m of motores) {
    const r = m === 'node'
      ? spawnSync(process.execPath, [R.util('n-node.js'), ej, csv], { encoding: 'utf8' })
      : spawnSync('qjs', ['--std', R.util('n.js'), ej, csv], { encoding: 'utf8' });
    const sal = (r.stdout || '').trim();
    comprobar(`informe.esl resume el CSV · ${m}`,
      sal.includes('filas:    4') && sal.includes('total:    965.75') && sal.includes('media:    241.44'),
      sal + '\n      ' + (r.stderr || ''));
  }
  comprobar('y dejó el informe escrito al lado', fs.existsSync(csv + '.informe.txt') &&
    fs.readFileSync(csv + '.informe.txt', 'utf8').includes('total: 965.75'));
  const sinArgs = spawnSync(process.execPath, [R.util('n-node.js'), ej], { encoding: 'utf8' });
  comprobar('sin argumentos explica cómo se usa y sale con 2',
    sinArgs.status === 2 && sinArgs.stdout.includes('uso:'), sinArgs.status + ' ' + sinArgs.stdout);
}

console.log('\n── 4b. página, lienzo y red fuera del navegador ──');
{
  // Antes, pintar() y lienzo() en consola no hacían nada Y NO LO DECÍAN: el
  // programa creía haber pintado. Un fallo callado es el peor de todos.
  enTodos('pintar() dice que aquí no hay página',
    'fijo n = etiqueta("h1", "x")\nimprimir("el nodo se construye:", tipo(n))\npintar(n)',
    r => r.codigo === 1 && r.salida.includes('el nodo se construye: nodo')
      && r.salida.includes('necesita un anfitrión con página'));
  enTodos('y lienzo() que no hay dónde dibujar', 'lienzo(100, 100)',
    r => r.codigo === 1 && r.salida.includes('necesita un anfitrión con lienzo'));
  enTodos('pero construir nodos y estilos sí se puede',
    'usar estilo de "estilo"\nimprimir(tipo(etiqueta("p", "x")), tipo(estilo({"color": "rojo"})))',
    'nodo estilo');
}
{
  // La red sí existe en Node —trae «fetch»— y no en QuickJS. Es una diferencia
  // real entre los dos intérpretes, así que se prueba como tal.
  const http = require('http');
  const srv = http.createServer((q, s2) => {
    if (q.url === '/saluda') { s2.writeHead(200, { 'Content-Type': 'application/json' }); s2.end(JSON.stringify({ hola: 'Ñ', lista: [1, 2, 3] })); return; }
    if (q.url === '/eco') { let c = ''; q.on('data', d => c += d); q.on('end', () => { s2.writeHead(200, { 'Content-Type': 'application/json' }); s2.end(JSON.stringify({ metodo: q.method, recibido: c })); }); return; }
    if (q.url === '/roto') { s2.writeHead(503); s2.end('no'); return; }
    s2.writeHead(404); s2.end('{}');
  });
  const puerto = (() => { srv.listen(0, '127.0.0.1'); return srv.address() ? srv.address().port : 0; })();
  // El servidor y el programa no pueden compartir proceso: spawnSync bloquea el
  // bucle de eventos y el servidor no podría contestar. Va con spawn de verdad.
  const { spawn } = require('child_process');
  const correrAsinc = (fuente) => new Promise(res => {
    const f = prog('r-' + Math.random().toString(36).slice(2) + '.esl');
    fs.writeFileSync(f, fuente, 'utf8');
    const h = spawn(process.execPath, [R.util('n-node.js'), f], { encoding: 'utf8' });
    let out = '';
    h.stdout.on('data', d => out += d); h.stderr.on('data', d => out += d);
    h.on('close', c => { try { fs.unlinkSync(f); } catch (_) {} res({ salida: out.trim(), codigo: c }); });
  });
  const pendiente = (async () => {
    await new Promise(r => setTimeout(r, 60));
    const base = 'http://127.0.0.1:' + srv.address().port;
    const r1 = await correrAsinc(`
usar suma de "numerico"
pedir("${base}/saluda", fn(r) {
    fijo d = deJson(r["cuerpo"])
    imprimir("llegó:", d["hola"], suma(d["lista"]), r["tipo"])
})
imprimir("sigo corriendo")`);
    comprobar('pedir() funciona en el intérprete de Node',
      r1.salida.split('\n')[0].includes('sigo corriendo') && r1.salida.includes('llegó: Ñ 6 application/json'), r1.salida);
    const r2 = await correrAsinc(`pedir("${base}/eco", {"metodo": "POST", "cuerpo": aJson({"n": 7})}, fn(r) { imprimir(deJson(r["cuerpo"])["recibido"]) })`);
    comprobar('con POST y cuerpo', r2.salida.includes('{"n":7}'), r2.salida);
    const r3 = await correrAsinc(`pedir("${base}/roto", fn(r) { imprimir(texto(r["ok"]), texto(r["estado"])) })`);
    comprobar('un 503 llega como dato, no como fallo', r3.salida.includes('falso 503'), r3.salida);
    // Un puerto cerrado de verdad: se abre uno, se anota y se cierra. El puerto 1
    // no vale — undici lo tiene en su lista de puertos prohibidos y da «bad port»,
    // que no es el error que se quiere comprobar.
    const cerrado = await new Promise(res => {
      const s3 = http.createServer();
      s3.listen(0, '127.0.0.1', () => { const p2 = s3.address().port; s3.close(() => res(p2)); });
    });
    const r4 = await correrAsinc(`pedir("http://127.0.0.1:${cerrado}/x", fn(r) { imprimir("error:", r["error"]) })`);
    comprobar('y un servidor caído dice por qué, no solo «fetch failed»',
      /ECONNREFUSED/i.test(r4.salida), r4.salida);
    if (hayQjs) {
      const q = correr('qjs', 'pedir("http://127.0.0.1:1/x", fn(r) { })');
      comprobar('en QuickJS no hay red, y lo dice',
        q.codigo === 1 && q.salida.includes('necesita un anfitrión con red'), q.salida);
    }
    srv.close();
  })();
  global.__pendienteRed = pendiente;
}

console.log('\n── 5b. el motor como ejecutable ──');
{
  // «qjsc» compila el motor y lo enlaza con la máquina de QuickJS: sale un
  // binario nativo que ejecuta .esl sin Node, sin navegador y sin nada
  // instalado. No está en todas las máquinas, así que si falta se salta.
  const hayQjsc = spawnSync('qjsc', ['-h'], { encoding: 'utf8' }).status !== null;
  if (!hayQjsc) saltar('el motor como ejecutable', 'no hay qjsc en esta máquina');
  else {
    const r = spawnSync(process.execPath, [R.util('construir-binario.js')], { encoding: 'utf8' });
    const bin = path.join(R.proyecto, process.platform === 'win32' ? 'n.exe' : 'n');
    comprobar('se construye', r.status === 0 && fs.existsSync(bin), (r.stdout || '') + (r.stderr || ''));
    if (fs.existsSync(bin)) {
      const tam = fs.statSync(bin).size;
      comprobar('y pesa poco más de un mega', tam > 500 * 1024 && tam < 8 * 1024 * 1024, tam);
      const f = path.join(taller, 'bin.esl');
      fs.writeFileSync(f, 'imprimir("desde el binario:", 6 * 7)\nimprimir("y lee archivos:", existeArchivo(argumentos()[0]))\n', 'utf8');
      const s1 = spawnSync(bin, [f, f], { encoding: 'utf8' });
      comprobar('ejecuta un programa sin nada instalado',
        (s1.stdout || '').includes('desde el binario: 42') && (s1.stdout || '').includes('y lee archivos: cierto'),
        (s1.stdout || '') + (s1.stderr || ''));
      // Un programa de varios archivos también: los módulos no dependen de Node.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n-bin-'));
      fs.writeFileSync(path.join(dir, 'lib.esl'), 'publico fn doble(x: entero): entero { devolver x * 2 }\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'main.esl'), 'usar doble de "lib.esl"\nimprimir("módulos en el binario:", doble(21))\n', 'utf8');
      const s2 = spawnSync(bin, [path.join(dir, 'main.esl')], { encoding: 'utf8' });
      comprobar('con módulos incluidos', (s2.stdout || '').includes('módulos en el binario: 42'),
        (s2.stdout || '') + (s2.stderr || ''));
      const s3 = spawnSync(bin, [path.join(dir, 'no-existe.esl')], { encoding: 'utf8' });
      comprobar('y un archivo que no está devuelve 2', s3.status === 2, s3.status + ' ' + (s3.stdout || ''));
      fs.rmSync(dir, { recursive: true, force: true });
      fs.unlinkSync(bin);
    }
  }
}

console.log('\n── 6. la frontera del navegador sigue donde estaba ──');
{
  // Lo importante: esto NO puede aparecer dentro de una página. El anfitrión de
  // la zona aislada no ofrece archivos, así que el programa se queda sin ellos.
  require(R.bundle);
  const m = globalThis.EspanolLike.crearMotor({ salida: () => {}, host: { web: {} } });
  const r = m.ejecutar('leerTexto("/etc/passwd")');
  comprobar('sin anfitrión de archivos, no hay archivos',
    !r.ok && r.errores[0].message.includes('necesita un anfitrión con archivos'),
    (r.errores || []).map(e => e.message).join(';'));
  const r2 = m.ejecutar('ejecutar("ls")');
  comprobar('ni procesos', !r2.ok && r2.errores[0].message.includes('necesita un anfitrión con sistema'),
    (r2.errores || []).map(e => e.message).join(';'));
}

// Las pruebas de red son asíncronas de verdad (hay un servidor contestando),
// así que el resumen espera a que terminen.
(global.__pendienteRed || Promise.resolve()).then(() => {
  fs.rmSync(taller, { recursive: true, force: true });
  // El resumen dice lo que NO se probó. «todas.js» solo muestra esta línea, así
  // que un «64 pasan, 0 fallan» donde en otra máquina hay 156 parecía que la
  // suite había encogido sola. Lo que falta tiene que decirse aquí.
  const notas = [];
  if (!hayQjs) notas.push('solo Node, QuickJS no está aquí');
  if (saltadas) notas.push(`${saltadas} saltada${saltadas === 1 ? '' : 's'}`);
  console.log(`\n${ok} pasan, ${mal} fallan${notas.length ? ' · ' + notas.join(' · ') : ''}\n`);
  process.exit(mal ? 1 : 0);
});
