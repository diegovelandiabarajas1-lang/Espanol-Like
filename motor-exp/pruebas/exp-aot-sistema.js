// exp-aot-sistema.js — el eDSL «sistema», JSON, procesos y temporizadores en el ejecutable nativo (aot/nrt_sistema.inc).
// Cada programa se corre en la VM (n-node.js) y como ejecutable, desde la misma carpeta, y tiene que imprimir lo mismo y salir con el mismo código.
// Se salta sin compilador de C.   node motor-exp/pruebas/exp-aot-sistema.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const N_COMP = path.join(RAIZ, 'util', 'n-compilar.js'), N_NODE = path.join(RAIZ, 'util', 'n-node.js');
const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-sis-')));
{
  fs.writeFileSync(path.join(raiz, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [N_COMP, path.join(raiz, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && spawnSync('gcc', ['--version']).status !== 0 && !process.env.C1EN_CC) { console.log('  (sin compilador de C)\nexp-aot-sistema: saltada entera'); process.exit(0); }
}
let pasan = 0, fallan = 0, n = 0;
const fallos = [];
const limpia = t => t.split(raiz).join('<T>').split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n').replace(/\n$/, '');
function taller() { const d = path.join(raiz, 'w' + n++); fs.mkdirSync(d); return d; }
function igual(nombre, src, opciones) {
  const o = opciones || {};
  const dv = taller(), dn = taller();
  const fv = path.join(dv, 'p.esl'), fn = path.join(dn, 'p.esl');
  fs.writeFileSync(fv, src); fs.writeFileSync(fn, src);
  for (const d of [dv, dn]) (o.prepara || (() => {}))(d);
  const exe = path.join(dn, 'p.exe');
  const c = spawnSync(process.execPath, [N_COMP, fn, '-o', exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (c.status !== 0) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${((c.stdout || '') + (c.stderr || '')).trim().split('\n').slice(0, 3).join(' | ')}`); return; }
  const a = spawnSync(process.execPath, [N_NODE, fv], { encoding: 'utf8', cwd: dv, timeout: 60000, maxBuffer: 1 << 26 });
  const b = spawnSync(exe, [], { encoding: 'utf8', cwd: dn, timeout: 60000, maxBuffer: 1 << 26 });
  const sa = limpia((a.stdout || '').split(dv).join(raiz + '/w')), sb = limpia((b.stdout || '').split(dn).join(raiz + '/w'));
  const norm = t => (o.norm ? o.norm(t) : t);
  if (norm(sa) !== norm(sb) || a.status !== b.status) {
    fallan++; fallos.push(`✗ ${nombre}\n    VM:      ${JSON.stringify(norm(sa))} (${a.status})\n    nativo:  ${JSON.stringify(norm(sb))} (${b.status})`); return;
  }
  pasan++;
}
const U = 'usar unirRuta, nombreArchivo, extension, sinExtension, carpetaDe, esRutaAbsoluta, normalizarRuta, rutaAbsoluta, rutaRelativa, carpetaActual, cambiarCarpeta, infoSistema, copiarArchivo, moverArchivo, infoArchivo, leerLineas, ejecutarEnFondo de "sistema"\nusar siguiente, terminado, recoger, dormir, todas de "corrutinas"\n';

// ── rutas
igual('unirRuta', U + `imprimir(unirRuta("a", "b", "../c"), unirRuta("", "x"), unirRuta("a/", "/b"), unirRuta("/", "a"), unirRuta(".", "."), unirRuta("a", "..", ".."))`);
igual('normalizarRuta', U + `imprimir(normalizarRuta("a/./b/../c/"), normalizarRuta(""), normalizarRuta("/.."), normalizarRuta("../.."), normalizarRuta("a//b"), normalizarRuta("./"), normalizarRuta("/a/b/../../.."))`);
igual('nombreArchivo y extension', U + `imprimir(nombreArchivo("a/b/ventas.csv"), "|" + nombreArchivo("/a/b/") + "|", "|" + nombreArchivo("/") + "|", nombreArchivo("x"), "|" + nombreArchivo("") + "|")
imprimir(extension(".bashrc"), extension("a.b.c"), extension("a."), extension("..") + "|", extension("a/b.d/c"), extension("x.tar.gz"), extension(".a.b"))
imprimir(sinExtension("a/ventas.csv"), sinExtension("a.b/c"), sinExtension(".bashrc"))`);
igual('carpetaDe y esRutaAbsoluta', U + `imprimir(carpetaDe("a/b/c.txt"), carpetaDe("/x"), carpetaDe("x"), carpetaDe("/"), carpetaDe("a/b/"), carpetaDe(""), carpetaDe("//a"))
imprimir(esRutaAbsoluta("/a"), esRutaAbsoluta("a"), esRutaAbsoluta(""), esRutaAbsoluta("./a"))`);
igual('rutaRelativa', U + `imprimir(rutaRelativa("/a/b/c", "/a/d"), rutaRelativa("/a/b", "/a/b/c/d"), rutaRelativa("/a/b/c", "/a/b"), "|" + rutaRelativa("/a", "/a") + "|", rutaRelativa("/", "/x/y"), rutaRelativa("/x/y", "/"))`);
igual('rutaAbsoluta y carpetaActual', U + `imprimir(rutaAbsoluta("x/../y"), rutaAbsoluta("/q/./r"), rutaAbsoluta(""), carpetaActual() == rutaAbsoluta("."))`);
igual('cambiarCarpeta', U + `crearCarpeta("sub")
cambiarCarpeta("sub")
imprimir(rutaRelativa(rutaAbsoluta(".."), carpetaActual()))
intentar { cambiarCarpeta("no-existe") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`, { norm: t => t.replace(/chdir '[^']*' -> '/g, "chdir '<C>' -> '") });
igual('errores de argumentos de rutas', U + `fijo q = [3, "a"][0]
intentar { nombreArchivo(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { unirRuta() } capturar (e) { imprimir(e["mensaje"]) }
intentar { unirRuta("a", q) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── archivos
igual('crear, escribir, listar, info y tamaño', U + `crearCarpeta("t/a/b")
escribirTexto("t/a/b/x.txt", "hola")
escribirTexto("t/a/y.txt", "12345")
imprimir(listar("t"), listar("t/a"), esCarpeta("t/a"), esCarpeta("t/a/y.txt"), esCarpeta("nada"), tamanoArchivo("t/a/y.txt"))
fijo i = infoArchivo("t/a/y.txt")
imprimir(i["tamano"], i["esCarpeta"], i["esArchivo"], tipo(i["modificado"]), tipo(i["creado"]), claves(i))
fijo j = infoArchivo("t/a")
imprimir(j["esCarpeta"], j["esArchivo"])`);
igual('crearCarpeta repetida y sobre un archivo', U + `crearCarpeta("d")
crearCarpeta("d")
escribirTexto("f", "x")
intentar { crearCarpeta("f/g") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`);
igual('copiarArchivo: archivo, carpeta y destino existente', U + `crearCarpeta("o/s")
escribirTexto("o/a.txt", "uno")
escribirTexto("o/s/b.txt", "dos")
copiarArchivo("o/a.txt", "c.txt")
copiarArchivo("o", "copia")
imprimir(leerTexto("c.txt"), listar("copia"), leerTexto("copia/s/b.txt"))
escribirTexto("copia/a.txt", "otro")
copiarArchivo("o", "copia")
imprimir(leerTexto("copia/a.txt"))`);
igual('copiarArchivo: errores', U + `escribirTexto("a.txt", "x")
crearCarpeta("dd")
intentar { copiarArchivo("no-existe", "z") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
intentar { copiarArchivo("a.txt", "dd") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
intentar { copiarArchivo("dd", "a.txt") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
intentar { copiarArchivo("dd", "dd/dentro") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`);
igual('moverArchivo', U + `escribirTexto("a.txt", "x")
moverArchivo("a.txt", "b.txt")
imprimir(existeArchivo("a.txt"), existeArchivo("b.txt"))
intentar { moverArchivo("a.txt", "c.txt") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`);
igual('errores de infoArchivo, listar, tamanoArchivo', U + `intentar { infoArchivo("no") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
intentar { listar("no") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
intentar { tamanoArchivo("no") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`);
igual('leerLineas: \\n, \\r\\n, sin salto final, vacío', U + `escribirTexto("a.txt", "uno\\ndos\\r\\ntres")
escribirTexto("b.txt", "x\\n\\ny\\n")
escribirTexto("c.txt", "")
var l = []
para t en leerLineas("a.txt") { agregar(l, t) }
imprimir(l, recoger(leerLineas("b.txt")), recoger(leerLineas("c.txt")), tipo(leerLineas("a.txt")))
fijo g = leerLineas("a.txt")
imprimir(siguiente(g), siguiente(g), siguiente(g), siguiente(g, "fin"), terminado(g))
intentar { leerLineas("no.txt") } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }`);
igual('leerLineas: un archivo grande', U + `var s = ""
para i en rango(30000) { s = s + "línea número " + texto(i) + "\\n" }
escribirTexto("g.txt", s)
var c = 0
var ult = ""
para t en leerLineas("g.txt") { c = c + 1
  ult = t }
imprimir(c, ult)`);

// ── infoSistema
igual('infoSistema: las claves y los tipos', U + `fijo s = infoSistema()
imprimir(claves(s), tipo(s["procesadores"]), tipo(s["memoria"]), s["procesadores"] > 0, s["memoria"] > 0, tipo(s["usuario"]), s["so"])`, { norm: t => t.replace(/nativo \(AOT\)|node v[\d.]+/g, 'M') });

// ── procesos
igual('ejecutar: salida, error y código', U + `fijo a = ejecutar("echo", ["hola", "mundo"])
imprimir(a["codigo"], "[" + a["salida"] + "]", "[" + a["error"] + "]", claves(a))
fijo b = ejecutar("sh", ["-c", "echo fuera; echo dentro 1>&2; exit 3"])
imprimir(b["codigo"], "[" + b["salida"] + "]", "[" + b["error"] + "]")
fijo c = ejecutar("sh", ["-c", "exit 4"])
imprimir(c["codigo"], "[" + c["salida"] + "]", c["error"])
fijo d = ejecutar("orden-que-no-existe-xyz")
imprimir(d["codigo"], d["salida"] == "", d["error"])`);
igual('ejecutar: opciones', U + `escribirTexto("dato.txt", "DATO")
crearCarpeta("sub")
escribirTexto("sub/z.txt", "zeta")
imprimir(ejecutar("cat", [], { "entrada": "desde la entrada" })["salida"])
imprimir(ejecutar("ls", [], { "carpeta": "sub" })["salida"])
imprimir(ejecutar("sh", ["-c", "echo $MI_VAR"], { "entorno": { "MI_VAR": "valor" } })["salida"])
fijo t = ejecutar("sleep", ["5"], { "espera": 200 })
imprimir(t["codigo"], t["error"])
intentar { ejecutar("echo", [], { "carpta": "x" }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ejecutar("echo", [], { "espera": 0 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { ejecutar("echo", 5) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('ejecutarEnFondo: en paralelo y esperar', U + `fn principal() { fijo a = ejecutarEnFondo("sh", ["-c", "sleep 0.3; echo uno"])
  fijo b = ejecutarEnFondo("sh", ["-c", "echo dos"])
  imprimir("lanzados", tipo(a))
  fijo rb = esperar b
  imprimir("b:", rb["salida"], rb["codigo"])
  fijo ra = esperar a
  imprimir("a:", ra["salida"], ra["codigo"])
  fijo rc = esperar ejecutarEnFondo("orden-que-no-existe-xyz")
  imprimir(rc["codigo"], rc["error"])
  fijo rd = esperar ejecutarEnFondo("sh", ["-c", "echo malo 1>&2; exit 2"])
  imprimir(rd["codigo"], rd["error"])
  fijo re = esperar todas([ejecutarEnFondo("echo", ["x"]), ejecutarEnFondo("echo", ["y"])])
  imprimir(re[0]["salida"], re[1]["salida"]) }
principal()
imprimir("main acaba")`);

// ── JSON
const J = 'imprimir(1)\n';
const JSON1 = '{"b": 1, "2": [true, false, null], "a": {"y": "\\u00e9\\n\\ud83d\\ude00", "x": 1.5e3}, "1": "uno", "-1": 7, "01": 8}';
igual('deJson: tipos y orden de claves', J + `fijo v = deJson(leerTexto("a.json"))
imprimir(v, claves(v), tipo(v["2"]), v["a"]["x"], v["a"]["y"])
imprimir(deJson(leerTexto("b.json")))
imprimir(deJson(leerTexto("c.json")), deJson("12"), deJson("true"), deJson("null"), deJson("[]"))`, { prepara: d => { fs.writeFileSync(path.join(d, 'a.json'), JSON1); fs.writeFileSync(path.join(d, 'b.json'), '  [1, 2.5, -0, 1e21, 1E-7, 123456789012345678901234567890]  '); fs.writeFileSync(path.join(d, 'c.json'), '"hola"'); } });
igual('aJson: valores, escapes y bonito', J + `imprimir(aJson({"b": 1, "2": [1, 2.5, cierto, falso, nulo], "a": "x\\"y\\\\z\\n\\t"}))
imprimir(aJson([1, [2, [3, {}]], []], cierto))
imprimir(aJson({"b": {"c": 1}, "1": 2, "0": "a"}, cierto))
imprimir(aJson(0.1 + 0.2), aJson(1e21), aJson(-0), aJson(1 / 0), aJson("é\\u0001"), aJson(100), aJson(1.5e-7))
imprimir(aJson({}), aJson([]), aJson("", cierto), aJson(nulo))`);
igual('JSON: ida y vuelta', J + `fijo t = {"nombre": "Ñandú", "edad": 3, "cosas": [1, "dos", {"tres": 3.5}], "vacío": {}}
fijo s = aJson(t)
imprimir(s)
imprimir(deJson(s) == t, aJson(deJson(s)) == s)`);
const MALOS = ['{', '[1,]', '{"a" 1}', '[1 2]', 'tru', 'trux', '', ' ', '{"a":1,}', '{,}', '[,]', '"abc', '"a\nb"', '"\\x"', '"\\u12"', '-', '-x', '1.', '1.e3', '1e', '1e+', '01', '[1]x', '{"a":1}}',
  'nul', 'undefined', "{'a':1}", '[1,2', '{"a":', '{"a"', '{"abcdefghijklmnopqrstuvwxyz": tru }', '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, @]', '@', '.5', '+1', '[1,\n2,\n x]', 'NaN',
  '{"a":1 "b":2}', '[}', '{]', '{"a":1', '[tru]', '{"a":1,"b"}', '"\\uzzzz"', '[1,2,]', '{"a":}', '1 2', 'true false', '["é", @]', '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,x]'];
igual('JSON: errores de sintaxis (los mensajes de V8)', J + `para i en rango(${MALOS.length}) { intentar { deJson(leerTexto("m" + texto(i) + ".json")) } capturar (e) { imprimir(i, e["tipo"], e["mensaje"]) } }`,
  { prepara: d => MALOS.forEach((c, k) => fs.writeFileSync(path.join(d, `m${k}.json`), c)) });
igual('JSON: otros errores', J + `intentar { deJson("") } capturar (e) { imprimir(e["mensaje"]) }
fijo f = fn(x) { devolver 1 }
intentar { aJson(f) } capturar (e) { imprimir(e["mensaje"]) }
fijo q = [3, "a"][0]
intentar { deJson(q) } capturar (e) { imprimir(e["mensaje"]) }
var hondo = []
repetir 40 { hondo = [hondo] }
intentar { aJson(hondo) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── temporizadores
igual('luego, cada y detener', J + `var n = 0
var id = 0
id = cada(30, fn() { n = n + 1
  imprimir("tic", n)
  si n == 3 { imprimir("detenido", detener(id)) } })
luego(10, fn() { imprimir("luego 10") })
luego(200, fn() { imprimir("luego 200", n) })
imprimir("main", detener(9999), tipo(id))`);
igual('un error en un temporizador no para el programa', J + `luego(10, fn() { imprimir([1][3]) })
luego(30, fn() { imprimir("sigue") })`);
igual('luego con una función con parámetros', J + `luego(5, fn(x) { imprimir(x) })
luego(15, fn() { imprimir("bien") })`);
igual('luego pide una función y milisegundos', J + `fijo tres = [3, "a"][0]
intentar { luego(5, tres) } capturar (e) { imprimir(e["mensaje"]) }
intentar { luego(-1, fn() {}) } capturar (e) { imprimir(e["mensaje"]) }
fijo q = ["x", 1][0]
intentar { cada(q, fn() {}) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── lo que en la consola da error
igual('guardar y recuperar en la consola', J + `intentar { guardar("k", 1) } capturar (e) { imprimir(e["mensaje"]) }
intentar { recuperar("k") } capturar (e) { imprimir(e["mensaje"]) }
intentar { olvidar("k") } capturar (e) { imprimir(e["mensaje"]) }
intentar { guardados() } capturar (e) { imprimir(e["mensaje"]) }`);

try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
