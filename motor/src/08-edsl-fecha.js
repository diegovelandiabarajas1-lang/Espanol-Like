// ============================================================================
//  Ñ v4 — eDSL «fecha»: el calendario, sin zonas horarias
//  Parte 8.
//
//  Se importa con:  usar "fecha"
//
//  Antes de esto el lenguaje no tenía nada: «ahora()» daba milisegundos y se
//  acabó. Guardar una fecha como texto parece que funciona hasta que hay que
//  ordenarla, y entonces «10/02» es menor que «9/01». Eso es lo que quita el
//  tipo: «<» y «==» funcionan solos, y el verificador para el programa que
//  mezcla una fecha con un texto antes de ejecutarlo.
//
//  UNA DECISIÓN GOBIERNA TODO LO DEMÁS: una fecha de Ñ no tiene zona horaria.
//  Es un instante del calendario —como el TIMESTAMP WITHOUT TIME ZONE de SQL o
//  el LocalDateTime de Java—, así que lo que se escribe es lo que se lee, en
//  cualquier máquina, sin horario de verano ni desplazamientos. Por dentro son
//  milisegundos que SIEMPRE se leen con los getters UTC de JavaScript; el reloj
//  local solo se mira en «hoy()» y «ahora()», una vez, al nacer la fecha.
//
//  La otra decisión: las funciones «…Entre» miden tiempo TRANSCURRIDO y truncan
//  hacia cero, todas igual. Para contar días de calendario en vez de días
//  completos, se compone: diasEntre(inicioDia(a), inicioDia(b)).
// ============================================================================
'use strict';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// En español la semana empieza el lunes, así que diaSemana() devuelve 1 para el
// lunes y 7 para el domingo. JavaScript cuenta desde el domingo; se traduce.
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const DIA_MS = 86400000;
const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasMes = (a, m) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];

// Los milisegundos de un instante del calendario. Date.UTC normaliza de balde
// —el mes 12 es enero del año siguiente—, que es lo que hace que sumarMeses y
// sumarDias no tengan que contar nada a mano.
const msDe = (a, m, d, h, mi, s, ms) => Date.UTC(a, m, d, h || 0, mi || 0, s || 0, ms || 0);
const partes = f => {
  const d = new Date(f.ms);
  return { a: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(),
    // lunes = 0
    sem: (d.getUTCDay() + 6) % 7 };
};

function instalarFecha(vm) {
  const D = () => vm.nuevoDic();
  const F = ms => vm.nuevaFecha(ms);
  const fch = (v, n, f) => vm.exigeFecha(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  // Comprueba que el día exista de verdad: el 31 de febrero no es una fecha, y
  // dejarlo pasar como el 3 de marzo es de las cosas que hay que no hacer.
  const valida = (a, m, d, f) => {
    if (m < 1 || m > 12) vm.error(`«${f}»: el mes ${m} no existe`, 'los meses van de 1 a 12');
    const max = diasMes(a, m - 1);
    if (d < 1 || d > max)
      vm.error(`«${f}»: ${d} no es un día de ${MESES[m - 1]} de ${a}`, `ese mes tiene ${max} días`);
  };
  // Al sumar meses o años el día se recorta al último del mes destino: el 31 de
  // enero más un mes es el 28 de febrero. Sin esto se desborda a marzo, que es
  // el fallo clásico de la aritmética de calendario.
  const moverMeses = (f, n) => {
    const p = partes(f);
    const total = p.a * 12 + p.m + n;
    const a = Math.floor(total / 12), m = ((total % 12) + 12) % 12;
    return F(msDe(a, m, Math.min(p.d, diasMes(a, m)), p.h, p.mi, p.s, p.ms));
  };
  const truncaDiv = (ms, u) => Math.trunc(ms / u);

  // Meses CUMPLIDOS de «a» a «b». Aquí NO vale el recorte de sumarMeses: si se
  // usa, el 31 de enero «alcanza» al 28 de febrero y sale 1 mes donde no ha
  // pasado un mes. La regla correcta es la del aniversario: el mes está
  // cumplido cuando el día —y la hora, si la hay— del destino ya llegó al del
  // origen. Es lo que hace cualquiera al contar una edad, y lo que necesita
  // «aniosEntre», que se calcula a partir de esto para no tener dos reglas.
  const meses = (a, b) => {
    const p = partes(a), q = partes(b);
    let n = (q.a - p.a) * 12 + (q.m - p.m);
    const hora = x => x.h * 3600000 + x.mi * 60000 + x.s * 1000 + x.ms;
    // Tres casos, no dos: el día del destino está DESPUÉS, ANTES, o es el
    // mismo. Cuando es el mismo no se ajusta nada en ninguna dirección —
    // tratarlo como «después» daba -1 donde había exactamente -2 meses.
    const rel = q.d !== p.d ? (q.d > p.d ? 1 : -1)
      : (hora(q) === hora(p) ? 0 : (hora(q) > hora(p) ? 1 : -1));
    if (n > 0 && rel < 0) n--;
    else if (n < 0 && rel > 0) n++;
    return n;
  };

  return function (def) {
    // ──────────────────────────────────────────────────────────── construir
    def('fecha', 'entero, entero, entero -> fecha', a => {
      const an = ent(a[0], 1, 'fecha'), m = ent(a[1], 2, 'fecha'), d = ent(a[2], 3, 'fecha');
      valida(an, m, d, 'fecha');
      return F(msDe(an, m - 1, d));
    }, 'fecha(2026, 9, 29) — el mes va de 1 a 12, como se dice en voz alta');
    def('fechaHora', '... -> fecha', a => {
      if (a.length < 5) vm.error('«fechaHora» necesita al menos año, mes, día, hora y minuto');
      const an = ent(a[0], 1, 'fechaHora'), m = ent(a[1], 2, 'fechaHora'), d = ent(a[2], 3, 'fechaHora');
      valida(an, m, d, 'fechaHora');
      return F(msDe(an, m - 1, d, ent(a[3], 4, 'fechaHora'), ent(a[4], 5, 'fechaHora'),
        a.length > 5 ? ent(a[5], 6, 'fechaHora') : 0));
    }, 'fechaHora(2026, 9, 29, 14, 30) — y opcionalmente los segundos');
    def('hoy', ' -> fecha', () => {
      // El único sitio, con «ahora», donde se mira el reloj de la máquina: se
      // lee el día LOCAL y desde ahí ya es aritmética de calendario.
      const n = new Date();
      return F(msDe(n.getFullYear(), n.getMonth(), n.getDate()));
    }, 'el día de hoy, a medianoche');
    def('ahora', ' -> fecha', () => {
      const n = new Date();
      return F(msDe(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()));
    }, 'este momento — tapa a la «ahora» de la biblioteca, que da milisegundos');
    def('aFecha', 'texto -> fecha', a => {
      const s = txt(a[0], 1, 'aFecha').trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (!m) {
        // El formato de aquí: 29/09/2026. Se acepta porque es el que sale de un
        // CSV hecho en español, y no admitirlo obligaría a partir el texto a mano.
        const e = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (e) m = [e[0], e[3], e[2], e[1], e[4], e[5], e[6]];
      }
      if (!m) vm.error(`«aFecha»: no entiendo «${s}»`,
        'formatos que lee: 2026-09-29 · 2026-09-29 14:30 · 29/09/2026');
      const an = +m[1], me = +m[2], d = +m[3];
      valida(an, me, d, 'aFecha');
      return F(msDe(an, me - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    }, 'aFecha("29/09/2026") · aFecha("2026-09-29 14:30")');
    def('desdeMarca', 'real -> fecha', a => F(ent(a[0], 1, 'desdeMarca')),
      'desde milisegundos desde 1970 — lo que devuelve la «ahora» de la biblioteca');

    // ────────────────────────────────────────────────────── leer las partes
    const leer = (nombre, fn, doc) => def(nombre, 'fecha -> entero', a => fn(partes(fch(a[0], 1, nombre))), doc);
    leer('anio', p => p.a, 'el año');
    leer('mes', p => p.m + 1, 'el mes, de 1 a 12');
    leer('dia', p => p.d, 'el día del mes');
    leer('hora', p => p.h, 'la hora, de 0 a 23');
    leer('minuto', p => p.mi, 'el minuto');
    leer('segundo', p => p.s, 'el segundo');
    leer('diaSemana', p => p.sem + 1, 'de 1 (lunes) a 7 (domingo) — en español la semana empieza el lunes');
    leer('trimestre', p => Math.floor(p.m / 3) + 1, 'de 1 a 4');
    def('diaDelAnio', 'fecha -> entero', a => {
      const p = partes(fch(a[0], 1, 'diaDelAnio'));
      return Math.round((p.a === 0 ? 0 : 0) + (msDe(p.a, p.m, p.d) - msDe(p.a, 0, 1)) / DIA_MS) + 1;
    }, 'de 1 a 365 (o 366)');
    def('semana', 'fecha -> entero', a => {
      // Semana ISO 8601: la primera del año es la que contiene el jueves.
      const p = partes(fch(a[0], 1, 'semana'));
      const jue = msDe(p.a, p.m, p.d + (3 - p.sem));
      const ene1 = new Date(jue).getUTCFullYear();
      return Math.floor((jue - msDe(ene1, 0, 1)) / (7 * DIA_MS)) + 1;
    }, 'el número de semana ISO, de 1 a 53');

    // ─────────────────────────────────────────────── los nombres, en español
    const nombra = (nombre, fn, doc) => def(nombre, 'fecha -> texto', a => fn(partes(fch(a[0], 1, nombre))), doc);
    nombra('nombreMes', p => MESES[p.m], 'nombreMes(hoy()) → «septiembre» — en minúscula, como se escribe en español');
    nombra('nombreDia', p => DIAS[p.sem], 'nombreDia(hoy()) → «martes»');
    nombra('mesCorto', p => MES_CORTO[p.m], 'mesCorto → «sep»');
    nombra('diaCorto', p => DIA_CORTO[p.sem], 'diaCorto → «mar»');

    // ───────────────────────────────────────────────────────────────── mover
    const mueve = (nombre, u, doc) => def(nombre, 'fecha, entero -> fecha',
      a => F(fch(a[0], 1, nombre).ms + ent(a[1], 2, nombre) * u), doc);
    mueve('sumarSegundos', 1000, 'suma segundos · con un número negativo, resta');
    mueve('sumarMinutos', 60000, 'suma minutos');
    mueve('sumarHoras', 3600000, 'suma horas');
    mueve('sumarDias', DIA_MS, 'suma días — sin horario de verano, un día son 24 horas siempre');
    mueve('sumarSemanas', 7 * DIA_MS, 'suma semanas');
    def('sumarMeses', 'fecha, entero -> fecha', a => moverMeses(fch(a[0], 1, 'sumarMeses'), ent(a[1], 2, 'sumarMeses')),
      'suma meses · el 31 de enero más 1 mes es el 28 de febrero, no el 3 de marzo');
    def('sumarAnios', 'fecha, entero -> fecha', a => moverMeses(fch(a[0], 1, 'sumarAnios'), ent(a[1], 2, 'sumarAnios') * 12),
      'suma años · el 29 de febrero más 1 año es el 28 de febrero');

    // ──────────────────────────────────────────────────────────────── bordes
    const borde = (nombre, fn, doc) => def(nombre, 'fecha -> fecha', a => fn(partes(fch(a[0], 1, nombre))), doc);
    borde('inicioDia', p => F(msDe(p.a, p.m, p.d)), 'ese día a las 00:00:00');
    borde('finDia', p => F(msDe(p.a, p.m, p.d, 23, 59, 59, 999)), 'ese día a las 23:59:59.999');
    borde('inicioSemana', p => F(msDe(p.a, p.m, p.d - p.sem)), 'el lunes de esa semana, a medianoche');
    borde('finSemana', p => F(msDe(p.a, p.m, p.d + (6 - p.sem), 23, 59, 59, 999)), 'el domingo de esa semana, al final');
    borde('inicioMes', p => F(msDe(p.a, p.m, 1)), 'el día 1 de ese mes');
    borde('finMes', p => F(msDe(p.a, p.m, diasMes(p.a, p.m), 23, 59, 59, 999)), 'el último día de ese mes, al final');
    borde('inicioAnio', p => F(msDe(p.a, 0, 1)), 'el 1 de enero de ese año');
    borde('finAnio', p => F(msDe(p.a, 11, 31, 23, 59, 59, 999)), 'el 31 de diciembre de ese año, al final');

    // ───────────────────────────────────────────────────── medir distancias
    // Todas miden tiempo TRANSCURRIDO y truncan hacia cero. Para días de
    // calendario: diasEntre(inicioDia(a), inicioDia(b)).
    const mide = (nombre, u, doc) => def(nombre, 'fecha, fecha -> entero',
      a => truncaDiv(fch(a[1], 2, nombre).ms - fch(a[0], 1, nombre).ms, u), doc);
    mide('segundosEntre', 1000, 'segundos completos de la primera a la segunda · negativo si va al revés');
    mide('minutosEntre', 60000, 'minutos completos');
    mide('horasEntre', 3600000, 'horas completas');
    mide('diasEntre', DIA_MS, 'días completos · para días de calendario: diasEntre(inicioDia(a), inicioDia(b))');
    def('mesesEntre', 'fecha, fecha -> entero', a => meses(fch(a[0], 1, 'mesesEntre'), fch(a[1], 2, 'mesesEntre')),
      'meses cumplidos · del 31 de enero al 28 de febrero es 0, porque 28 aún no llega a 31');
    def('aniosEntre', 'fecha, fecha -> entero', a =>
      Math.trunc(meses(fch(a[0], 1, 'aniosEntre'), fch(a[1], 2, 'aniosEntre')) / 12),
      'años cumplidos — sirve para calcular una edad');
    def('duracion', 'fecha, fecha -> dic<texto,entero>', a => {
      let ms = Math.abs(fch(a[1], 2, 'duracion').ms - fch(a[0], 1, 'duracion').ms);
      const d = D();
      d.mapa.set('dias', Math.trunc(ms / DIA_MS)); ms %= DIA_MS;
      d.mapa.set('horas', Math.trunc(ms / 3600000)); ms %= 3600000;
      d.mapa.set('minutos', Math.trunc(ms / 60000)); ms %= 60000;
      d.mapa.set('segundos', Math.trunc(ms / 1000));
      return d;
    }, 'la distancia partida en días, horas, minutos y segundos');

    // ────────────────────────────────────────────────────────────  preguntar
    def('esBisiesto', 'fecha -> bool', a => bisiesto(partes(fch(a[0], 1, 'esBisiesto')).a),
      'si el año de esa fecha es bisiesto');
    def('diasDelMes', 'fecha -> entero', a => {
      const p = partes(fch(a[0], 1, 'diasDelMes'));
      return diasMes(p.a, p.m);
    }, 'cuántos días tiene el mes de esa fecha');
    def('esFinDeSemana', 'fecha -> bool', a => partes(fch(a[0], 1, 'esFinDeSemana')).sem >= 5,
      'sábado o domingo');
    def('esMismoDia', 'fecha, fecha -> bool', a => {
      const p = partes(fch(a[0], 1, 'esMismoDia')), q = partes(fch(a[1], 2, 'esMismoDia'));
      return p.a === q.a && p.m === q.m && p.d === q.d;
    }, 'el mismo día del calendario, sin mirar la hora');
    def('estaEntre', 'fecha, fecha, fecha -> bool', a => {
      const x = fch(a[0], 1, 'estaEntre').ms, d = fch(a[1], 2, 'estaEntre').ms, h = fch(a[2], 3, 'estaEntre').ms;
      return x >= Math.min(d, h) && x <= Math.max(d, h);
    }, 'estaEntre(f, desde, hasta) — con los extremos incluidos');
    def('esAntesDe', 'fecha, fecha -> bool', a => fch(a[0], 1, 'esAntesDe').ms < fch(a[1], 2, 'esAntesDe').ms,
      'lo mismo que «a < b», para cuando se lee mejor');
    def('esDespuesDe', 'fecha, fecha -> bool', a => fch(a[0], 1, 'esDespuesDe').ms > fch(a[1], 2, 'esDespuesDe').ms,
      'lo mismo que «a > b»');

    // ─────────────────────────────────────────────────────────────── sacarla
    def('deFecha', '... -> texto', a => {
      const f = fch(a[0], 1, 'deFecha'), p = partes(f);
      const forma = a.length > 1 ? txt(a[1], 2, 'deFecha') : 'iso';
      const dd = (n, an) => String(n).padStart(an || 2, '0');
      const hm = `${dd(p.h)}:${dd(p.mi)}`;
      switch (forma) {
        case 'iso': return isoDeFecha(f);
        case 'corta': return `${dd(p.d)}/${dd(p.m + 1)}/${p.a}`;
        case 'larga': return `${p.d} de ${MESES[p.m]} de ${p.a}`;
        case 'mes': return `${MESES[p.m]} de ${p.a}`;
        case 'hora': return hm;
        case 'completa': return `${DIAS[p.sem]}, ${p.d} de ${MESES[p.m]} de ${p.a}, ${hm}`;
        default: vm.error(`«deFecha»: no conozco el formato «${forma}»`,
          'formatos: iso · corta · larga · mes · hora · completa');
      }
    }, 'deFecha(f, "larga") → «29 de septiembre de 2026» · iso, corta, larga, mes, hora, completa');
    def('aIso', 'fecha -> texto', a => isoDeFecha(fch(a[0], 1, 'aIso')),
      'la forma canónica, que «aFecha» vuelve a leer');
    def('aMarca', 'fecha -> real', a => fch(a[0], 1, 'aMarca').ms,
      'los milisegundos de dentro — la puerta de atrás para cuando hace falta el número');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarFecha, MESES, DIAS };
