// ============================================================================
//  Ñ en cualquier página web: <script type="text/ñ">  (motor-exp P6)
//
//  Una página normal carga el motor con UNA etiqueta y, a partir de ahí, el
//  navegador «lee Ñ»:
//
//    <script src="https://cdn.jsdelivr.net/gh/diegovelandiabarajas1-lang/Espanol-Like@motor-exp/motor-exp/n-web.js"></script>
//    <script type="text/ñ" src="app.esl"></script>
//    <script type="text/ñ">
//      pintar(etiqueta("h1", "Hola desde Ñ"))
//    </script>
//
//  El navegador no ejecuta lo que no conoce: una etiqueta <script> con un tipo
//  que no es JavaScript la deja quieta, con su texto dentro. Este cargador (que
//  va al final de n-web.js, detrás del motor y del anfitrión del IDE) las busca
//  cuando la página termina de leerse, trae el código de las que tienen «src»,
//  y las corre EN ORDEN con el motor de Ñ, como hace el navegador con las de
//  JavaScript. Es lo mismo que hacen Babel («text/babel») o Brython con Python.
//
//  Lo que se acepta:  type="text/ñ"  o  type="text/n"  (para quien no pueda
//  escribir la ñ; da igual mayúsculas o minúsculas).
//
//  La página: todas las etiquetas comparten UN motor y UNA página de Ñ (lo que
//  «pintar» pone), que va justo después de la primera etiqueta de Ñ, o dentro
//  del elemento que diga data-destino="#app". Cada etiqueta es un programa
//  aparte (como un módulo): lo que una quiera darle a otra va con «usar».
//  «usar "otro.esl"» trae el archivo relativo a la página o a quien lo importa.
//  «imprimir» escribe en la consola del navegador y, debajo de la página, en una
//  consola que solo aparece si hay algo que decir. Los errores salen igual que
//  en la VM, con su línea, en rojo.
//
//  Desde JavaScript:  Ñ.ejecutar(fuente) · Ñ.motor · Ñ.listo (una promesa)
// ============================================================================
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const EL = globalThis.EspanolLike;
  const TIPO = /^\s*text\/(ñ|n)\s*$/i;

  // Los estilos base de la página de Ñ, los mismos que en una app exportada,
  // pero solo dentro de sus tres cajas: la página que la acoge no se toca.
  const CSS = `
.n-web{--n-panel:#FFFFFF;--n-panel-2:#ECECF2;--n-ink:#16161D;--n-muted:#6D6D80;--n-line:#DDDDE7;--n-line-2:#C7C7D6;--n-acc:#4F3FD4;--n-bad:#B62E24}
@media (prefers-color-scheme:dark){.n-web{--n-panel:#17171F;--n-panel-2:#1E1E28;--n-ink:#ECECF4;--n-muted:#8C8CA0;--n-line:#272733;--n-line-2:#363646;--n-acc:#9B8CFF;--n-bad:#EC7C6E}}
:where(#pagina) h1,:where(#pagina) h2,:where(#pagina) h3{margin:.5em 0 .3em;line-height:1.25}
:where(#pagina) button{font:inherit;font-weight:600;padding:6px 12px;border-radius:6px;border:1px solid var(--n-acc);background:var(--n-acc);color:#fff;cursor:pointer;margin:3px 6px 3px 0}
:where(#pagina) input,:where(#pagina) textarea,:where(#pagina) select{font:inherit;padding:6px 9px;border-radius:6px;border:1px solid var(--n-line-2);background:var(--n-panel);color:var(--n-ink);margin:3px 6px 3px 0}
:where(#pagina) textarea{min-height:4.5em;resize:vertical}
:where(#pagina) input[type=checkbox]{margin:0;width:auto;accent-color:var(--n-acc)}
:where(#pagina) .el-campo{display:inline-flex;align-items:center;gap:.45em;margin:3px 8px 3px 0}
:where(#pagina) .el-campo>.el-rotulo{opacity:.85;white-space:nowrap}
:where(#pagina) .el-campo>input,:where(#pagina) .el-campo>textarea,:where(#pagina) .el-campo>select{margin:0}
:where(#pagina) .el-tabla{border-collapse:collapse;margin:8px 0}
:where(#pagina) .el-tabla td,:where(#pagina) .el-tabla th{border:1px solid var(--n-line-2);padding:5px 10px;text-align:left}
:where(#pagina) .el-tabla th{background:var(--n-panel-2)}
#cajaLienzo{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
#cajaLienzo:empty{display:none}
#cajaLienzo canvas{border:1px solid var(--n-line-2);border-radius:6px;background:#fff;max-width:100%;height:auto}
#consola.n-web{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;padding:10px 14px;white-space:pre-wrap;word-break:break-word;border-top:1px solid var(--n-line);background:var(--n-panel-2);color:var(--n-muted)}
#consola.n-web:empty{display:none}
#consola.n-web .err{color:var(--n-bad);font-weight:600}
`;

  let resolverListo;
  const listo = new Promise(r => { resolverListo = r; });
  const api = { listo, motor: null, ejecutar: null, version: EL && EL.version };
  globalThis.Ñ = api;
  globalThis.N_WEB = api;
  if (!EL) { console.error('[Ñ] n-web.js: no está el motor (EspanolLike); el archivo está incompleto'); return; }

  // ── las tres cajas: la página, el lienzo y la consola ─────────────────────
  let cajas = null;
  function prepararCajas(primera) {
    if (cajas) return cajas;
    const destino = primera && primera.dataset && primera.dataset.destino ? document.querySelector(primera.dataset.destino) : null;
    const hacer = (id, cls) => {
      let n = document.getElementById(id);
      if (!n) {
        n = document.createElement('div'); n.id = id;
        if (destino) destino.appendChild(n);
        else if (primera && primera.parentNode && primera.parentNode !== document.head) primera.parentNode.insertBefore(n, cajas && cajas.ultimo ? cajas.ultimo.nextSibling : primera.nextSibling);
        else document.body.appendChild(n);
      }
      n.classList.add('n-web');
      if (cls) n.classList.add(cls);
      (cajas = cajas || {}).ultimo = n;
      return n;
    };
    const pagina = hacer('pagina'), lienzo = hacer('cajaLienzo'), consola = hacer('consola');
    if (!document.getElementById('n-web-estilos')) {
      const st = document.createElement('style'); st.id = 'n-web-estilos'; st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    cajas = { pagina, lienzo, consola };
    return cajas;
  }
  function linea(txt, clase) {
    const c = prepararCajas(null).consola;
    const d = document.createElement('div');
    d.className = 'l' + (clase ? ' ' + clase : '');
    d.textContent = txt;
    c.appendChild(d);
    if (clase === 'err') console.error('[Ñ] ' + txt); else console.log(txt);
  }

  // ── guardar y permisos: por página, como en las apps exportadas ────────────
  const SITIO = encodeURIComponent(location.pathname || 'pagina');
  const caja = pre => ({
    leer(k) { try { return localStorage.getItem(pre + k); } catch (_) { return null; } },
    escribir(k, v) { try { localStorage.setItem(pre + k, v); } catch (_) { /* nada */ } },
    borrar(k) { try { const h = localStorage.getItem(pre + k) !== null; localStorage.removeItem(pre + k); return h; } catch (_) { return false; } },
    claves() {
      const r = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(pre) === 0) r.push(k.slice(pre.length)); } } catch (_) { /* nada */ }
      return r;
    },
  });
  const almacen = caja('n:web:' + SITIO + ':');
  const permisos = caja('n:perm:web:' + SITIO + ':');

  // ── «usar "otro.esl"»: los módulos, por la red ─────────────────────────────
  // El motor pide los módulos de forma síncrona (como en Node). Antes de correr
  // un programa se traen por adelantado los .esl que nombra (y los que nombran
  // esos); si aun así falta alguno, se pide en el momento.
  const traidos = new Map();          // url → texto
  const absoluta = (espec, desde) => new URL(espec, desde || location.href).href;
  function leerSincrono(url) {
    const x = new XMLHttpRequest();
    x.open('GET', url, false);
    x.overrideMimeType('text/plain; charset=utf-8');
    x.send(null);
    if (x.status !== 200 && x.status !== 0) throw new Error(`no se pudo traer «${url}» (HTTP ${x.status})`);
    return x.responseText;
  }
  const modulos = {
    resolver(espec, desde) {
      const url = absoluta(espec, desde);
      if (!traidos.has(url)) traidos.set(url, leerSincrono(url));
      return url;
    },
    leer(clave) { if (!traidos.has(clave)) traidos.set(clave, leerSincrono(clave)); return traidos.get(clave); },
  };
  async function traer(url) {
    if (traidos.has(url)) return traidos.get(url);
    let r;
    try { r = await fetch(url); }
    catch (e) {
      throw new Error(location.protocol === 'file:'
        ? `no se pudo traer «${url}»: abierta como archivo (file://), el navegador no deja leer otros archivos; sírvela (por ejemplo con «npx serve») o pon el código dentro de la etiqueta`
        : `no se pudo traer «${url}»: ${e.message}`);
    }
    if (!r.ok) throw new Error(`no se pudo traer «${url}» (HTTP ${r.status})`);
    const t = await r.text();
    traidos.set(url, t);
    return t;
  }
  async function traerImportados(fuente, desde, vistos) {
    const re = /\busar\b[^\n"]*"([^"]+\.(?:esl|ñ|n))"/g;
    let m;
    const pend = [];
    while ((m = re.exec(fuente))) {
      const url = absoluta(m[1], desde);
      if (vistos.has(url)) continue;
      vistos.add(url);
      pend.push(traer(url).then(t => traerImportados(t, url, vistos)).catch(() => { /* lo dirá el motor, con su línea */ }));
    }
    await Promise.all(pend);
  }

  // ── el motor ───────────────────────────────────────────────────────────────
  let motor = null, anf = null;
  function elMotor(primera) {
    if (motor) return motor;
    prepararCajas(primera);
    anf = crearAnfitrion({ linea, almacen, permisos });
    motor = EL.crearMotor({
      salida: s => linea(s),
      host: { web: anf.web, grafico: anf.grafico, almacen, tiempo: anf.tiempo, red: anf.red, modulos },
    });
    api.motor = motor;
    api.anfitrion = anf;
    return motor;
  }
  function correr(fuente, clave, etiqueta) {
    const m = elMotor(etiqueta);
    let r;
    try { r = m.ejecutar(fuente, clave); }
    catch (e) { r = { ok: false, errores: [e] }; }
    anf.volcar();
    for (const w of (r.avisos || [])) if (w.fase === 'seguridad') console.warn('[Ñ] aviso: ' + (w.formato ? w.formato() : w.message));
    if (!r.ok) for (const e of (r.errores || [])) linea(`${quien(clave)}: ` + (e.formato ? e.formato() : String((e && e.message) || e)), 'err');
    return r;
  }
  // De quién es un error: el archivo de un src, o «la etiqueta N» (las líneas
  // cuentan desde el principio del código de esa etiqueta)
  const quien = u => {
    const m = /#ñ(\d+)$/.exec(u || '');
    if (m) return `la etiqueta de Ñ número ${m[1]}`;
    if (/#ejecutar$/.test(u || '')) return 'Ñ.ejecutar';
    try { return decodeURIComponent(new URL(u).pathname.split('/').pop()) || u; } catch (_) { return u; }
  };
  api.ejecutar = (fuente, clave) => correr(String(fuente), clave || location.href + '#ejecutar', null);

  // ── las etiquetas, en orden ────────────────────────────────────────────────
  const hechas = new WeakSet();
  async function correrEtiquetas() {
    const todas = [...document.getElementsByTagName('script')].filter(s => TIPO.test(s.type || '') && !hechas.has(s));
    if (todas.length) prepararCajas(todas[0]);
    // se traen todas a la vez y se corren en el orden de la página
    const fuentes = todas.map(s => {
      hechas.add(s);
      if (s.src) { const url = absoluta(s.getAttribute('src')); return traer(url).then(t => ({ s, t, url }), e => ({ s, error: e, url })); }
      // el código dentro de la etiqueta: se quita la sangría común
      const lineas = s.textContent.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
      const sangria = Math.min(...lineas.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length));
      const t = lineas.map(l => l.slice(Number.isFinite(sangria) ? sangria : 0)).join('\n') + '\n';
      const k = [...document.getElementsByTagName('script')].filter(x => TIPO.test(x.type || '')).indexOf(s) + 1;
      return Promise.resolve({ s, t, url: location.href.replace(/#.*$/, '') + `#ñ${k}` });
    });
    for (const p of fuentes) {
      const f = await p;
      if (f.error) { linea(String(f.error.message || f.error), 'err'); f.s.dispatchEvent(new Event('error')); continue; }
      await traerImportados(f.t, f.url, new Set());
      const r = correr(f.t, f.url, f.s);
      f.s.dispatchEvent(new CustomEvent(r.ok ? 'load' : 'error', { detail: r }));
    }
    resolverListo(motor);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { correrEtiquetas(); });
  else correrEtiquetas();
})();
