// exp-aot-red.js — servir, respuesta, detenerServidor y pedir en el ejecutable nativo (aot/nrt_red.inc).
// Cada programa abre un servidor en un puerto libre y se pide a sí mismo; se corre en la VM (n-node.js) y como ejecutable y tiene que imprimir lo mismo.
// Necesita curl (pedir lo usa en el nativo). Se salta sin compilador de C o sin curl.   node motor-exp/pruebas/exp-aot-red.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const N_COMP = path.join(RAIZ, 'util', 'n-compilar.js'), N_NODE = path.join(RAIZ, 'util', 'n-node.js');
const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-red-')));
{
  fs.writeFileSync(path.join(raiz, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [N_COMP, path.join(raiz, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && spawnSync('gcc', ['--version']).status !== 0 && !process.env.C1EN_CC) { console.log('  (sin compilador de C)\nexp-aot-red: saltada entera'); process.exit(0); }
  if (spawnSync('curl', ['--version']).status !== 0) { console.log('  (sin curl)\nexp-aot-red: saltada entera'); process.exit(0); }
}
let pasan = 0, fallan = 0, n = 0;
const fallos = [];
const limpia = t => t.replace(/puerto \d+/g, 'puerto N').split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n').replace(/\n$/, '');
function igual(nombre, src) {
  const d = path.join(raiz, 'w' + n++); fs.mkdirSync(d);
  const f = path.join(d, 'p.esl'), exe = path.join(d, 'p.exe');
  fs.writeFileSync(f, src);
  const c = spawnSync(process.execPath, [N_COMP, f, '-o', exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (c.status !== 0) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${((c.stdout || '') + (c.stderr || '')).trim().split('\n').slice(0, 3).join(' | ')}`); return; }
  const a = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const b = spawnSync(exe, [], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const sa = limpia(a.stdout || ''), sb = limpia(b.stdout || '');
  if (sa !== sb || a.status !== b.status) { fallan++; fallos.push(`✗ ${nombre}\n    VM:      ${JSON.stringify(sa)} (${a.status})\n    nativo:  ${JSON.stringify(sb)} (${b.status})`); return; }
  pasan++;
}
const U = 'usar servir, detenerServidor, respuesta de "sistema"\n' + 'usar dormir, todas de "corrutinas"\n';
const MANEJADOR = `fn manejador(p) {
  si p["ruta"] == "/hola" { devolver "hola " + p["consulta"]["nombre"] }
  si p["ruta"] == "/html" { devolver "<b>negrita</b>" }
  si p["ruta"] == "/json" { devolver { "b": [1, 2.5, cierto, nulo], "a": "x" } }
  si p["ruta"] == "/lista" { devolver [1, "dos", { "tres": 3 }] }
  si p["ruta"] == "/vacio" { devolver nulo }
  si p["ruta"] == "/numero" { devolver 42 }
  si p["ruta"] == "/creado" { devolver respuesta(201, { "id": 7 }, { "cabeceras": { "X-Algo": "sí", "X-Otro": 3 } }) }
  si p["ruta"] == "/tipo" { devolver respuesta(200, "a,b", { "tipo": "text/csv" }) }
  si p["ruta"] == "/no" { devolver respuesta(404, "no está") }
  si p["ruta"] == "/eco" { devolver { "metodo": p["metodo"], "cuerpo": p["cuerpo"], "consulta": p["consulta"], "ctype": p["cabeceras"]["content-type"], "x": p["cabeceras"]["x-prueba"], "ip": p["ip"] } }
  si p["ruta"] == "/tarde" { esperar dormir(50)
    devolver "tarde pero llego" }
  si p["ruta"] == "/mal" { devolver [1][5] }
  devolver respuesta(404, "ruta " + p["ruta"])
}
`;
const PRE = U + MANEJADOR + `fn ver(r) { imprimir(r["estado"], r["ok"], r["tipo"], r["cuerpo"], r["error"]) }
`;
const ARRANQUE = `  fijo s = servir(0, manejador)
  fijo info = esperar s["listo"]
  fijo base = "http://127.0.0.1:" + texto(info["puerto"])
`;
igual('servir: texto, html, json, lista, nulo, número', PRE + `fn principal() {
${ARRANQUE}  ver(esperar pedir(base + "/hola?nombre=Ana%20B"))
  ver(esperar pedir(base + "/html"))
  ver(esperar pedir(base + "/json"))
  ver(esperar pedir(base + "/lista"))
  ver(esperar pedir(base + "/vacio"))
  ver(esperar pedir(base + "/numero"))
  imprimir(detenerServidor(s), detenerServidor(s)) }
principal()`);
igual('servir: respuesta() con estado, tipo y cabeceras', PRE + `fn principal() {
${ARRANQUE}  ver(esperar pedir(base + "/creado"))
  ver(esperar pedir(base + "/tipo"))
  ver(esperar pedir(base + "/no"))
  ver(esperar pedir(base + "/otra"))
  fijo r = respuesta(201, "x")
  imprimir(r, tipo(r), claves(r))
  detenerServidor(s) }
principal()`);
igual('servir: método, cuerpo, consulta y cabeceras', PRE + `fn principal() {
${ARRANQUE}  fijo r = esperar pedir(base + "/eco?a=1&b=dos+tres&a=3&c", { "metodo": "post", "cuerpo": "línea 1\\nñandú", "cabeceras": { "X-Prueba": "sí" } })
  ver(r)
  fijo g = esperar pedir(base + "/eco")
  ver(g)
  detenerServidor(s) }
principal()`);
igual('servir: un manejador asíncrono y varias peticiones a la vez', PRE + `fn principal() {
${ARRANQUE}  fijo todas_ = esperar todas([pedir(base + "/tarde"), pedir(base + "/hola?nombre=Z"), pedir(base + "/tarde")])
  para r en todas_ { ver(r) }
  detenerServidor(s) }
principal()`);
igual('servir: un error del manejador da 500 y el programa sigue', PRE + `fn principal() {
${ARRANQUE}  ver(esperar pedir(base + "/mal"))
  ver(esperar pedir(base + "/hola?nombre=sigue"))
  detenerServidor(s) }
principal()`);
igual('servir: puerto ocupado y argumentos malos', U + `fn m(p) { devolver "x" }
fn principal() {
  fijo s = servir(0, m)
  fijo info = esperar s["listo"]
  fijo t = servir(info["puerto"], m)
  intentar { esperar t["listo"] } capturar (e) { imprimir(e["tipo"], e["mensaje"]) }
  detenerServidor(s) }
principal()
fijo tres = [3, "a"][0]
intentar { servir(70000, m) } capturar (e) { imprimir(e["mensaje"]) }
intentar { servir(8080, tres) } capturar (e) { imprimir(e["mensaje"]) }
intentar { servir(8080, m, { "x": 1 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { servir(8080, m, 5) } capturar (e) { imprimir(e["mensaje"]) }
intentar { detenerServidor(tres) } capturar (e) { imprimir(e["mensaje"]) }
intentar { respuesta(99, "x") } capturar (e) { imprimir(e["mensaje"]) }
intentar { respuesta(200, "x", { "z": 1 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { respuesta(200, "x", { "cabeceras": { "mal nombre": 1 } }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { respuesta(200, "x", { "cabeceras": { "X-A": "a\\nb" } }) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('pedir: con función, sin servidor y opciones malas', U + `fn principal() {
  fijo r = esperar pedir("http://127.0.0.1:1/")
  imprimir(r["ok"], r["estado"], r["cuerpo"] == "")
  pedir("http://127.0.0.1:1/", fn(x) { imprimir("con función", x["ok"]) })
  esperar dormir(300)
}
principal()
intentar { pedir("ftp://x") } capturar (e) { imprimir(e["mensaje"]) }
intentar { pedir("http://x", { "metodo": "TRACE" }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { pedir("http://x", { "zz": 1 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { pedir("http://x", { "cabeceras": 3 }) } capturar (e) { imprimir(e["mensaje"]) }`);

try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
