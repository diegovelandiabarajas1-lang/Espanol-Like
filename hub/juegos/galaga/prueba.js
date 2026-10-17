// Prueba de GALAGA Ñ SIN navegador: anfitrión de mentira con reloj, lienzo que
// cuenta lo que dibuja, y una capa que recibe teclas (pulsar y soltar).
//
//   node hub/juegos/galaga/prueba.js          (desde la raíz del proyecto)
'use strict';
const fs = require('fs');
const path = require('path');
require(require(path.join(__dirname, '..', '..', '..', 'motor', 'rutas.js')).bundle);
const { crearMotor } = globalThis.EspanolLike;
let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 240) : ''); }
};

function arrancar() {
  let cuadro = [], previo = [], letra = null;
  const grafico = {
    lienzo: (w, h) => { grafico.tam = [w, h]; },
    limpiar: () => {}, color: () => {}, grosor: () => {}, linea: () => {}, punto: () => {}, circulo: () => {},
    // el fondo (0,0,540,960) marca el principio de un cuadro
    rect: (x, y, w, h) => { if (x === 0 && y === 0 && w === 540 && h === 960) { previo = cuadro; cuadro = []; } cuadro.push({ op: 'rect' }); },
    letra: (t, a, e) => { letra = [t, a, e]; },
    escribirEn: (x, y, t) => cuadro.push({ op: 'texto', t: String(t), letra }),
  };
  let eventos = null, textos = [];
  const web = {
    abrir(n, at, meta) { if (meta && meta.eventos && meta.eventos.keydown) eventos = { fns: meta.eventos, vm: meta.vm }; },
    cerrar() {}, texto(t) { textos.push(t); }, eco() {}, control() {}, asegurarClase() {}, estilo() {},
    limpiar() { textos = []; },
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
  const r = m.ejecutar(fs.readFileSync(path.join(__dirname, 'galaga.esl'), 'utf8'));
  const ev = (tipo, k) => { const d = eventos.vm.nuevoDic(); d.mapa.set('tecla', k); eventos.vm.nuevoTurno(); eventos.vm.invocar(eventos.fns[tipo], [d]); };
  const textosLienzo = () => cuadro.filter(o => o.op === 'texto').map(o => o.t);
  // el panel de la página: «ms 1.2 · max … · enem 40 · …» → un objeto
  const panel = () => { const t = textos.join(' '); const o = {}; for (const [, k, v] of t.matchAll(/(ms|max|fps|dibujos|enem|part|estado|ola|puntos|vidas) ([^ ·]+)/g)) o[k] = isNaN(+v) ? v : +v; return o; };
  return { r, salida, textos: () => textos, textosLienzo, pulsar: k => ev('keydown', k), soltar: k => ev('keyup', k), avanzar, disco, grafico, panel, rects: () => cuadro.length };
}
const CUADRO = 16;
const segundos = s => Math.round(s * 1000 / CUADRO);

console.log('── arranca y espera');
{
  const j = arrancar();
  comprobar('el programa corre sin error', j.r.ok !== false && !j.salida.some(s => /error/i.test(s)), j.salida.join('\n'));
  comprobar('lienzo de 540×960', j.grafico.tam && j.grafico.tam[0] === 540 && j.grafico.tam[1] === 960);
  for (let i = 0; i < 3; i++) j.avanzar(CUADRO);
  comprobar('la pantalla de inicio escribe GALAGA Ñ en el lienzo, con letra grande', j.textosLienzo().includes('GALAGA Ñ'), j.textosLienzo().join(' | '));
}

console.log('── una partida: formación, disparos, puntos');
{
  const j = arrancar();
  j.avanzar(CUADRO * 3);
  j.pulsar('p');                                   // panel: el juego publica sus cifras en la página
  j.pulsar(' '); j.soltar(' ');
  comprobar('espacio empieza la partida (ola 1, 3 vidas)', j.panel().estado === 'jugando' && j.panel().ola === 1 && j.panel().vidas === 3, j.textos().join(' '));
  for (let i = 0; i < segundos(1); i++) j.avanzar(CUADRO);
  comprobar('40 enemigos en la ola 1', j.panel().enem === 40, JSON.stringify(j.panel()));
  // a disparar a ciegas barriendo de lado a lado durante 15 s
  j.pulsar(' ');
  let lado = 'ArrowLeft';
  for (let i = 0; i < segundos(15); i++) {
    if (i % 45 === 0) { j.soltar(lado); lado = lado === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'; j.pulsar(lado); }
    j.avanzar(CUADRO);
    if (j.panel().estado === 'fin') break;
  }
  const p = j.panel();
  comprobar(`disparando se suman puntos (${p.puntos})`, p.puntos >= 500, JSON.stringify(p));
  comprobar(`y se derriban enemigos (quedan ${p.enem} de 40, o ya va por la ola ${p.ola})`, p.enem < 40 || p.ola > 1, JSON.stringify(p));
  comprobar('el lienzo dibuja cientos de cosas por cuadro', j.rects() > 300, j.rects());
}

console.log('── pasar de ola, perder y guardar la marca');
{
  const j = arrancar();
  j.avanzar(CUADRO * 2);
  j.pulsar('p');
  j.pulsar(' '); j.soltar(' ');
  for (let i = 0; i < 10; i++) j.avanzar(CUADRO);
  j.pulsar('n'); j.soltar('n');                    // con el panel, N vacía la ola
  for (let i = 0; i < 5; i++) j.avanzar(CUADRO);
  comprobar('al vaciar la ola llega la ola 2 con 40 enemigos', j.panel().ola === 2 && j.panel().enem === 40, JSON.stringify(j.panel()));
  comprobar('el cartel «¡OLA 2!» sale en el lienzo', j.textosLienzo().includes('¡OLA 2!'), j.textosLienzo().join(' | '));
  // quieto en el centro, disparando: tumba a los que pasan por encima, pero las picadas acaban con él
  j.pulsar(' ');
  let fin = false;
  for (let i = 0; i < segundos(240) && !fin; i++) { j.avanzar(CUADRO); fin = j.panel().estado === 'fin'; }
  j.soltar(' ');
  comprobar('quieto, acaba muriendo (estado fin)', fin, JSON.stringify(j.panel()));
  comprobar(`y algo alcanzó a sumar (${j.panel().puntos} puntos)`, j.panel().puntos > 0, JSON.stringify(j.panel()));
  comprobar('«FIN DEL JUEGO» en el lienzo', j.textosLienzo().includes('FIN DEL JUEGO'), j.textosLienzo().join(' | '));
  comprobar('la marca queda guardada', j.disco.has('mejor'), [...j.disco.entries()].join(';'));
  j.pulsar(' '); j.soltar(' ');
  comprobar('espacio enseguida NO reinicia (se espera un segundo)', j.panel().estado === 'fin');
  for (let i = 0; i < segundos(1.2); i++) j.avanzar(CUADRO);
  j.pulsar(' '); j.soltar(' ');
  comprobar('pasado el segundo, espacio empieza otra', j.panel().estado === 'jugando' && j.panel().vidas === 3, JSON.stringify(j.panel()));
}

console.log('── teclas sostenidas y repetidas');
{
  const j = arrancar();
  j.avanzar(CUADRO * 2);
  j.pulsar('p'); j.pulsar('p'); j.pulsar('p');     // la repetición del teclado NO alterna tres veces
  comprobar('mantener P pulsada no hace parpadear el panel', /estado/.test(j.textos().join(' ')));
  j.soltar('p'); j.pulsar('p'); j.soltar('p');
  comprobar('soltar y volver a pulsar P sí lo cierra', !/estado/.test(j.textos().join(' ')));
}

console.log('── estrés: 300 partículas de golpe');
{
  const j = arrancar();
  j.avanzar(CUADRO * 2);
  j.pulsar('p');
  j.pulsar(' '); j.soltar(' ');
  for (let i = 0; i < segundos(3); i++) j.avanzar(CUADRO);
  for (let k = 0; k < 3; k++) { j.pulsar('x'); j.soltar('x'); }
  for (let i = 0; i < 30; i++) j.avanzar(CUADRO);
  const p = j.panel();
  comprobar(`900 partículas vivas a la vez y sigue en marcha (${p.part})`, p.part >= 700, JSON.stringify(p));
  comprobar(`más de 1500 llamadas de dibujo en un cuadro (${p.dibujos})`, p.dibujos > 1500, JSON.stringify(p));
}

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
