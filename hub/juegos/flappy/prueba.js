// Prueba del Flappy en Ñ SIN navegador: un anfitrión de mentira con reloj,
// lienzo que anota lo que dibuja y una capa que recibe teclas. Un piloto
// automático juega leyendo del lienzo dónde está el pájaro y el hueco.
//
//   node hub/juegos/flappy/prueba.js          (desde la raíz del proyecto)
'use strict';
const fs = require('fs');
const path = require('path');
require(require(path.join(__dirname, '..', '..', '..', 'motor', 'rutas.js')).bundle);
const { crearMotor } = globalThis.EspanolLike;
let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 200) : ''); }
};

function arrancar() {
  // lienzo de mentira: guarda las órdenes del ÚLTIMO cuadro
  let cuadro = [], color = '';
  const grafico = {
    lienzo: (w, h) => { grafico.tam = [w, h]; },
    limpiar: () => { cuadro = []; },
    color: c => { color = c; },
    grosor: () => {},
    linea: () => {},
    punto: () => {},
    rect: (x, y, w, h) => { if (x === 0 && y === 0 && w === 540) cuadro = []; cuadro.push({ op: 'rect', x, y, w, h, color }); },
    circulo: (x, y, r) => cuadro.push({ op: 'circulo', x, y, r, color }),
    escribirEn: (x, y, t) => cuadro.push({ op: 'texto', t }),
    letra: () => {},
  };
  // página de mentira: solo nos interesan los eventos de la capa y el texto
  let eventos = null, textos = [];
  const web = {
    abrir(n, at, meta) { if (meta && meta.eventos) eventos = { fns: meta.eventos, vm: meta.vm }; },
    cerrar() {}, texto(t) { textos.push(t); }, eco() {}, control() {}, asegurarClase() {}, estilo() {},
    limpiar() { textos = []; eventos = null; },
  };
  const disco = new Map();
  const almacen = { leer: k => (disco.has(k) ? disco.get(k) : null), escribir: (k, v) => disco.set(k, v), borrar: k => disco.delete(k), claves: () => [...disco.keys()] };
  const pendientes = new Map(); let sig = 1, ahora = 0;
  const tiempo = {
    luego(ms, fn, vm) { pendientes.set(sig, { en: ahora + ms, ms, fn, vm, repite: false }); return sig++; },
    cada(ms, fn, vm) { pendientes.set(sig, { en: ahora + ms, ms, fn, vm, repite: true }); return sig++; },
    detener: id => pendientes.delete(id),
  };
  const avanzar = ms => { ahora += ms; for (const [id, t] of [...pendientes]) while (t.en <= ahora) { if (!t.repite) pendientes.delete(id); t.vm.nuevoTurno(); t.vm.invocar(t.fn, []); if (!t.repite) break; t.en += t.ms; } };
  const salida = [];
  const m = crearMotor({ salida: s => salida.push(s), limiteInstr: 5e7, host: { web, almacen, tiempo, grafico } });
  const r = m.ejecutar(fs.readFileSync(path.join(__dirname, 'flappy.esl'), 'utf8'));
  const tecla = k => { const d = eventos.vm.nuevoDic(); d.mapa.set('tecla', k); eventos.vm.nuevoTurno(); eventos.vm.invocar(eventos.fns.keydown, [d]); };
  const clic = () => { const d = eventos.vm.nuevoDic(); eventos.vm.nuevoTurno(); eventos.vm.invocar(eventos.fns.click, [d]); };
  const pajaro = () => cuadro.find(o => o.op === 'circulo' && o.x === 110 && o.r === 18);
  const tubos = () => { const ts = cuadro.filter(o => o.op === 'rect' && o.w === 78 && o.y === 0); return ts.map(t => ({ x: t.x, arriba: t.h, abajo: (cuadro.find(o => o.op === 'rect' && o.w === 78 && o.x === t.x && o.y > 0) || {}).y })); };
  return { r, salida, textos: () => textos, tecla, clic, avanzar, cuadro: () => cuadro, pajaro, tubos, disco, grafico };
}

console.log('── el juego arranca y espera');
{
  const j = arrancar();
  comprobar('el programa corre sin error', j.r.ok !== false && !j.salida.some(s => /error/i.test(s)), j.salida.join('\n'));
  comprobar('lienzo de 540×960', j.grafico.tam && j.grafico.tam[0] === 540 && j.grafico.tam[1] === 960);
  comprobar('muestra la pantalla de inicio', j.textos().join(' ').includes('NEON FLAPPY'), j.textos().join(' | '));
  j.avanzar(16 * 30);
  comprobar('en inicio el pájaro no cae (30 cuadros, sigue a media altura)', j.pajaro() && Math.abs(j.pajaro().y - 480) < 1, JSON.stringify(j.pajaro()));
}

console.log('── sin aletear se muere; con clic se reinicia');
{
  const j = arrancar();
  j.tecla(' ');
  j.avanzar(16 * 120);
  comprobar('al soltarlo cae y muere antes de 2 segundos', j.textos().join(' ').includes('GAME OVER'), j.textos().join(' | '));
  j.clic();
  comprobar('un clic tras morir reinicia (el cartel desaparece)', !j.textos().join(' ').includes('GAME OVER'));
}

console.log('── un piloto automático que lee el lienzo marca puntos');
{
  const j = arrancar();
  j.tecla(' ');
  let puntos = 0, cuadros = 0, muerto = false;
  for (; cuadros < 60 * 25; cuadros++) {           // hasta 25 s de juego
    j.avanzar(16);
    if (j.textos().join(' ').includes('GAME OVER')) { muerto = true; break; }
    const p = j.pajaro(); if (!p) continue;
    const prox = j.tubos().filter(tb => tb.x + 78 > 92).sort((a, b) => a.x - b.x)[0];
    const objetivo = prox && prox.abajo ? (prox.arriba + prox.abajo) / 2 : 480;
    if (p.y > objetivo + 10 && cuadros % 6 === 0) j.tecla('ArrowUp');
    const m = (j.cuadro().find(o => o.op === 'texto' && /^\d+$/.test(o.t)) || { t: '' }).t.match(/^(\d+)$/);
    if (m) puntos = Math.max(puntos, +m[1]);
  }
  comprobar(`el piloto pasa al menos 5 tubos (pasó ${puntos} en ${Math.round(cuadros / 60)} s)`, puntos >= 5);
  // si sigue vivo, se deja caer: así la partida termina y se guarda la marca
  for (let k = 0; k < 60 * 5 && !muerto; k++) { j.avanzar(16); muerto = j.textos().join(' ').includes('GAME OVER'); }
  // el punto y el choque pueden caer en el mismo cuadro: el marcador final se lee del último cuadro dibujado
  { const m = (j.cuadro().find(o => o.op === 'texto' && /^\d+$/.test(o.t)) || { t: '' }).t.match(/^(\d+)$/); if (m) puntos = Math.max(puntos, +m[1]); }
  comprobar('la partida termina (por tubo o por dejarse caer)', muerto);
  comprobar('el cartel final muestra los mismos puntos que el lienzo', j.textos().join(' ').includes('GAME OVER · ' + puntos), j.textos().join(' | '));
  comprobar('la mejor marca queda guardada', j.disco.has('mejor') && /\b\d+\b/.test(String(j.disco.get('mejor'))) && Number(String(j.disco.get('mejor')).match(/\b(\d+)\b/)[1]) === puntos, String(j.disco.get('mejor')));
  comprobar('el hueco se cierra al avanzar (dificultad progresiva)', (() => { const tb = j.tubos().find(x => x.abajo); return !tb || tb.abajo - tb.arriba < 260; })());
}

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
