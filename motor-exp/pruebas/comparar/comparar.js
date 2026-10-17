// LTS contra motor-exp: 57 pruebas de rendimiento (37 de CPU, 20 de página).
//
//   node motor-exp/pruebas/comparar/comparar.js [--rondas 8] [--solo cpu|dom]
//
// Cómo se mide, para que el resultado signifique algo:
//  · CPU: cada muestra es un PROCESO nuevo de Node que corre el programa y
//    mide solo «trabajo()» con reloj(). Las muestras de los dos motores se
//    intercalan (LTS, exp, LTS, exp…) para que el ruido de la máquina caiga
//    igual en los dos. Los dos tienen que devolver el MISMO resultado.
//  · Página: Chromium, una pestaña por motor con la misma página. Cada muestra
//    son 30 repintados seguidos, cada uno un turno de verdad (lo que hace un
//    clic o un reloj) más un reflujo forzado (offsetHeight), que es lo que el
//    navegador pagaría antes de pintar. También intercaladas.
//  · Veredicto por prueba: U de Mann–Whitney a dos colas. «mejor» o «peor»
//    solo si p < 0,01 y la diferencia de medianas pasa del 5 %. Lo demás es
//    empate. Y al final, una prueba de signos sobre todas: ¿gana uno de los
//    dos más veces de lo que daría el azar?
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const R = require('../../rutas.js');
const CPU = require('./cpu.js');
const DOM = require('./dom.js');

const args = process.argv.slice(2);
const RONDAS = +(args[args.indexOf('--rondas') + 1] || 0) || 8;
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;
const CLON = R.motor, LTS = path.join(R.proyecto, 'motor');

// ── estadística
function mediana(xs) { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function normalCDF(z) { // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function mannWhitney(a, b) {
  const todos = a.map(v => [v, 0]).concat(b.map(v => [v, 1])).sort((x, y) => x[0] - y[0]);
  const rangos = new Array(todos.length);
  let empates = 0;
  for (let i = 0; i < todos.length;) {
    let j = i; while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) rangos[k] = r;
    const t = j - i + 1; empates += t * t * t - t; i = j + 1;
  }
  let Ra = 0; for (let k = 0; k < todos.length; k++) if (todos[k][1] === 0) Ra += rangos[k];
  const n1 = a.length, n2 = b.length, N = n1 + n2;
  const U = Ra - n1 * (n1 + 1) / 2;
  const mu = n1 * n2 / 2;
  const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - empates / (N * (N - 1))));
  if (sigma === 0) return 1;
  const z = (U - mu - Math.sign(U - mu) * 0.5) / sigma;   // corrección de continuidad
  return Math.min(1, 2 * (1 - normalCDF(Math.abs(z))));
}
function veredicto(lts, exp) {
  const ml = mediana(lts), me = mediana(exp), p = mannWhitney(lts, exp);
  const razon = ml / me;   // > 1: el clon tarda menos
  let v = 'empate';
  if (p < 0.01 && razon > 1.05) v = 'exp mejor';
  else if (p < 0.01 && razon < 1 / 1.05) v = 'LTS mejor';
  return { ml, me, p, razon, v };
}
// Prueba de signos exacta (binomial, p = 1/2), a dos colas.
function signos(g, p) {
  const n = g + p; if (!n) return 1;
  const k = Math.min(g, p); let s = 0, c = 1;
  for (let i = 0; i <= n; i++) { if (i <= k) s += c; c = c * (n - i) / (i + 1); }
  return Math.min(1, 2 * s / Math.pow(2, n));
}

const filas = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comparar-'));

// ── CPU
if (SOLO !== 'dom') {
  const ARNES = `
fijo __t0 = reloj()
fijo __r = trabajo()
fijo __ms = reloj() - __t0
imprimir("RESULTADO", __r)
imprimir("MS", __ms)`;
  for (const [nombre, src] of CPU) {
    const f = path.join(tmp, 'p.esl');
    fs.writeFileSync(f, src + '\n' + ARNES + '\n');
    const m = { LTS: [], exp: [] }, res = { LTS: new Set(), exp: new Set() };
    for (let r = 0; r < RONDAS; r++) {
      for (const [quien, dir] of (r % 2 ? [['exp', CLON], ['LTS', LTS]] : [['LTS', LTS], ['exp', CLON]])) {
        let out;
        try { out = execFileSync(process.execPath, [path.join(dir, 'util', 'n-node.js'), f], { encoding: 'utf8', timeout: 120000 }); }
        catch (e) { out = 'ERROR ' + ((e.stdout || '') + (e.stderr || '')).slice(0, 300); }
        const ms = out.match(/^MS (\S+)/m), rr = out.match(/^RESULTADO (.*)$/m);
        if (!ms || !rr) { res[quien].add('falló: ' + out.trim().split('\n').slice(-2).join(' ')); continue; }
        m[quien].push(+ms[1]); res[quien].add(rr[1]);
      }
    }
    const mismo = res.LTS.size === 1 && res.exp.size === 1 && [...res.LTS][0] === [...res.exp][0];
    const fila = { tipo: 'CPU', nombre, mismo, resultado: [...res.LTS][0], resExp: [...res.exp][0] };
    if (mismo && m.LTS.length === RONDAS && m.exp.length === RONDAS) Object.assign(fila, veredicto(m.LTS, m.exp));
    else fila.v = 'inválida';
    filas.push(fila);
    process.stdout.write(`  CPU  ${nombre.padEnd(34)} ${fila.v}${fila.razon ? ' ×' + fila.razon.toFixed(2) : ''}\n`);
  }
}

// ── página
(async () => {
  if (SOLO !== 'cpu') {
    const abrir = require('../navegador.js');
    const { montar, correr } = require('./pagina-comun.js');
    const nav = await abrir('0 pasan, 0 fallan · saltada entera');
    const pag = { LTS: await nav.newPage(), exp: await nav.newPage() };
    for (const [nombre, modo, src] of DOM) {
      const ok = {};
      for (const [quien, dir] of [['LTS', LTS], ['exp', CLON]]) {
        await montar(pag[quien], dir);
        const r = await correr(pag[quien], src + '\nrepintar(0)');
        ok[quien] = r.ok ? null : r.errores.join(' | ');
      }
      if (ok.LTS || ok.exp) { filas.push({ tipo: 'página', nombre, v: 'inválida', resultado: ok.LTS || ok.exp }); console.log(`  PÁG  ${nombre.padEnd(34)} inválida: ${ok.LTS || ok.exp}`); continue; }
      const m = { LTS: [], exp: [] };
      const medir = (page, base) => page.evaluate(({ base, igual }) => {
        const { anf, motor } = window.__n;
        const fn = motor.vm.globals.get('repintar');
        const t0 = performance.now();
        for (let i = 1; i <= 30; i++) {
          anf.turno(motor.vm, fn, [igual ? 0 : base + i]);
          void document.body.offsetHeight;
        }
        return performance.now() - t0;
      }, { base, igual: modo === 'igual' });
      for (const q of ['LTS', 'exp']) { await medir(pag[q], 0); }   // calentar
      for (let r = 0; r < RONDAS; r++) {
        for (const q of (r % 2 ? ['exp', 'LTS'] : ['LTS', 'exp'])) m[q].push(await medir(pag[q], (r + 1) * 100) / 30);
      }
      // Que los dos acaben con la misma página: misma prueba, mismo resultado.
      const html = {};
      for (const q of ['LTS', 'exp']) html[q] = await pag[q].evaluate(() => document.querySelector('#pagina').textContent);
      const fila = { tipo: 'página', nombre, mismo: html.LTS === html.exp, ...veredicto(m.LTS, m.exp) };
      if (!fila.mismo) fila.v = 'inválida';
      filas.push(fila);
      console.log(`  PÁG  ${nombre.padEnd(34)} ${fila.v} ×${fila.razon.toFixed(2)}`);
    }
    await nav.close();
  }

  // ── informe
  const val = filas.filter(f => f.v !== 'inválida');
  const g = val.filter(f => f.v === 'exp mejor').length, p = val.filter(f => f.v === 'LTS mejor').length, e = val.length - g - p;
  const ps = signos(g, p);
  const geo = xs => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
  const fmt = x => (x < 10 ? x.toFixed(2) : x.toFixed(1)).replace('.', ',');
  let md = `| # | tipo | prueba | LTS (mediana) | exp (mediana) | LTS ÷ exp | p | veredicto |\n|---|---|---|---|---|---|---|---|\n`;
  filas.forEach((f, i) => {
    md += f.v === 'inválida'
      ? `| ${i + 1} | ${f.tipo} | ${f.nombre} | — | — | — | — | **inválida** (${String(f.resultado).slice(0, 80)}) |\n`
      : `| ${i + 1} | ${f.tipo} | ${f.nombre} | ${fmt(f.ml)} ms | ${fmt(f.me)} ms | ×${f.razon.toFixed(2).replace('.', ',')} | ${f.p < 0.001 ? '<0,001' : f.p.toFixed(3).replace('.', ',')} | ${f.v} |\n`;
  });
  const resumen = {
    pruebas: filas.length, validas: val.length, exp_mejor: g, LTS_mejor: p, empates: e, p_signos: ps,
    media_geom_cpu: val.filter(f => f.tipo === 'CPU').length ? geo(val.filter(f => f.tipo === 'CPU').map(f => f.razon)) : null,
    media_geom_pagina: val.filter(f => f.tipo === 'página').length ? geo(val.filter(f => f.tipo === 'página').map(f => f.razon)) : null,
    rondas: RONDAS,
  };
  md += `\n**${filas.length} pruebas** (${val.length} válidas) · exp mejor en **${g}** · LTS mejor en **${p}** · empate en **${e}** · prueba de signos p = ${ps < 0.0001 ? ps.toExponential(1) : ps.toFixed(4)}\n`;
  if (resumen.media_geom_cpu) md += `\nMedia geométrica de LTS ÷ exp: CPU ×${resumen.media_geom_cpu.toFixed(2)}`;
  if (resumen.media_geom_pagina) md += ` · página ×${resumen.media_geom_pagina.toFixed(2)}`;
  md += '\n';
  const salida = R.salida('comparacion-lts-exp.md');
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, md);
  fs.writeFileSync(R.salida('comparacion-lts-exp.json'), JSON.stringify({ resumen, filas }, null, 1));
  console.log('\n' + md);
})();
