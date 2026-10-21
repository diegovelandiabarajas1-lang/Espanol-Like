// motor-exp · P6 «Ñ en cualquier página: <script type="text/ñ">».
//
// En un Chromium de verdad (Playwright), con las páginas servidas por un
// servidor HTTP de aquí mismo, como las serviría jsDelivr o GitHub Pages:
//  · una etiqueta con el código dentro, y otra con src="app.esl" que importa un
//    módulo con «usar»: corren en orden, pintan en la página y el clic de un
//    botón llega a la función de Ñ;
//  · type="text/n" vale igual; una de JavaScript no se toca;
//  · data-destino="#app" pone la página de Ñ donde se diga;
//  · un error sale en rojo con su línea, y el resto de etiquetas sigue;
//  · Ñ.ejecutar(fuente) desde JavaScript, Ñ.listo, y los eventos load/error;
//  · los acentos y la ñ de un .esl llegan bien (UTF-8).
//
//   node motor-exp/pruebas/exp-web-script.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let pasan = 0, fallan = 0;
const comprobar = (nombre, cond, detalle) => {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; console.log(`  ✗ ${nombre}` + (detalle !== undefined ? `\n      ${String(detalle).split('\n').slice(0, 8).join('\n      ')}` : '')); }
};
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) {
  try { ({ chromium } = require('playwright-core')); } catch (_2) { chromium = null; }
}
const N_WEB = path.join(__dirname, '..', 'n-web.js');
if (!chromium) { console.log('  – saltada entera: no hay Playwright\n\n0 pasan, 0 fallan, 1 saltadas'); process.exit(0); }
if (!fs.existsSync(N_WEB)) { console.log('  ✗ no está motor-exp/n-web.js: node motor-exp/util/construir.js\n\n0 pasan, 1 fallan'); process.exit(1); }

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-web-script-'));
fs.copyFileSync(N_WEB, path.join(raiz, 'n-web.js'));
const poner = (n, s) => { fs.mkdirSync(path.dirname(path.join(raiz, n)), { recursive: true }); fs.writeFileSync(path.join(raiz, n), s); };

poner('lib/saludos.esl', `publico fn saludo(quien: texto): texto { devolver "¡Hola, " + quien + "! Año 2026, ñandú" }
`);
poner('app.esl', `usar saludo de "lib/saludos.esl"
var clics = 0
fn ver() {
  limpiarPagina()
  pintar(etiqueta("h2", {"id": "saludo"}, saludo("Diego")))
  pintar(etiqueta("p", {"id": "cuenta"}, "clics: {clics}"))
  pintar(boton("sumar", fn() { clics = clics + 1  ver() }))
}
ver()
imprimir("app.esl cargada")
`);
poner('index.html', `<!doctype html>
<html><head><meta charset="utf-8"><title>Ñ en la web</title>
<script src="n-web.js"></script>
</head><body>
<h1 id="titulo">Una página normal</h1>
<script type="text/ñ">
  imprimir("primera")
  fijo x = 6 * 7
  imprimir("x vale {x}")
</script>
<script type="text/ñ" src="app.esl"></script>
<script type="text/N">
  imprimir("text/N también")
</script>
<script>window.jsCorrio = true;</script>
<p id="pie">pie de la página</p>
</body></html>
`);
poner('destino.html', `<!doctype html><html><head><meta charset="utf-8"><script src="n-web.js"></script></head><body>
<header id="cabeza">arriba</header>
<main id="app"></main>
<script type="text/ñ" data-destino="#app">pintar(etiqueta("p", {"id": "dentro"}, "en #app"))</script>
</body></html>
`);
poner('errores.html', `<!doctype html><html><head><meta charset="utf-8"><script src="n-web.js"></script></head><body>
<script type="text/ñ">
imprimir("antes")
fijo l = [1, 2]
imprimir(l[5])
</script>
<script type="text/ñ" src="no-existe.esl"></script>
<script type="text/ñ">imprimir("sigue")</script>
</body></html>
`);

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.esl': 'text/plain; charset=utf-8' };
const servidor = http.createServer((q, r) => {
  const f = path.join(raiz, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  let nav;
  try {
    nav = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  } catch (e) {
    try { nav = await chromium.launch(); } catch (e2) { console.log(`  – saltada entera: Chromium no arranca (${e2.message.split('\n')[0]})\n\n0 pasan, 0 fallan, 1 saltadas`); servidor.close(); process.exit(0); }
  }
  const pagina = await nav.newPage();
  const consola = [];
  pagina.on('console', m => consola.push(m.text()));
  const fallosJS = [];
  pagina.on('pageerror', e => fallosJS.push(e.message));

  console.log('· una página con etiquetas de Ñ');
  await pagina.goto(base + 'index.html');
  await pagina.evaluate(() => globalThis.Ñ.listo);
  const t = await pagina.evaluate(() => ({
    saludo: (document.getElementById('saludo') || {}).textContent,
    cuenta: (document.getElementById('cuenta') || {}).textContent,
    consola: [...document.querySelectorAll('#consola .l')].map(d => d.textContent),
    js: window.jsCorrio === true,
    orden: [...document.body.children].map(n => n.id || n.tagName.toLowerCase()).join(','),
  }));
  comprobar('el código dentro de la etiqueta corre, en orden, con la sangría quitada', t.consola[0] === 'primera' && t.consola[1] === 'x vale 42', JSON.stringify(t.consola));
  comprobar('src="app.esl" con «usar» de un módulo, y los acentos y la ñ llegan bien', t.saludo === '¡Hola, Diego! Año 2026, ñandú', t.saludo);
  comprobar('type="text/N" también, y la etiqueta de JavaScript corre como siempre', t.consola.includes('text/N también') && t.js, JSON.stringify(t));
  comprobar('imprimir va también a la consola del navegador', consola.includes('primera') && consola.includes('app.esl cargada'), JSON.stringify(consola));
  comprobar('la página de Ñ va justo después de la primera etiqueta, antes del pie', /titulo,script,pagina,cajaLienzo,consola,script.*pie/.test(t.orden), t.orden);
  await pagina.click('#pagina button');
  await pagina.click('#pagina button');
  const cuenta = await pagina.evaluate(() => document.getElementById('cuenta').textContent);
  comprobar('el clic en el botón llega a la función de Ñ y la página se repinta', cuenta === 'clics: 2', cuenta);
  const desdeJS = await pagina.evaluate(() => {
    const r = globalThis.Ñ.ejecutar('fn doble(n: entero): entero { devolver n * 2 }\nimprimir("desde JS: {doble(21)}")\n');
    return { ok: r.ok, ultima: [...document.querySelectorAll('#consola .l')].pop().textContent };
  });
  comprobar('Ñ.ejecutar(fuente) desde JavaScript', desdeJS.ok && desdeJS.ultima === 'desde JS: 42', JSON.stringify(desdeJS));
  comprobar('sin errores de JavaScript en la página', fallosJS.length === 0, fallosJS.join('\n'));

  console.log('· data-destino');
  await pagina.goto(base + 'destino.html');
  await pagina.evaluate(() => globalThis.Ñ.listo);
  const d = await pagina.evaluate(() => { const p = document.getElementById('dentro'); return p && p.closest('#app') ? p.textContent : null; });
  comprobar('data-destino="#app": la página de Ñ va dentro de #app', d === 'en #app', d);

  console.log('· los errores');
  const fallosAntes = fallosJS.length;
  await pagina.goto(base + 'errores.html');
  await pagina.evaluate(() => globalThis.Ñ.listo);
  const e = await pagina.evaluate(() => [...document.querySelectorAll('#consola .l')].map(x => ({ t: x.textContent, err: x.classList.contains('err') })));
  const errs = e.filter(x => x.err).map(x => x.t);
  comprobar('un error sale en rojo, con su línea (desde el principio de su etiqueta), como en la VM', errs.some(x => /^la etiqueta de Ñ número 1: \[ejecución\] índice 5 fuera de rango/.test(x) && /línea 3\)/.test(x)), JSON.stringify(e));
  comprobar('un src que no existe se dice', errs.some(x => /no-existe\.esl.*HTTP 404/.test(x)), JSON.stringify(errs));
  comprobar('y las demás etiquetas siguen', e.some(x => x.t === 'antes') && e.some(x => x.t === 'sigue'), JSON.stringify(e));
  comprobar('los errores de Ñ no son errores de JavaScript', fallosJS.length === fallosAntes, fallosJS.slice(fallosAntes).join('\n'));

  await nav.close();
  servidor.close();
  try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (_) { /* nada */ }
  console.log(`\n${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.log('  ✗ la prueba se cayó: ' + (e && e.stack || e)); servidor.close(); process.exit(1); });
