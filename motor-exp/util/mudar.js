// ============================================================================
//  La herramienta de mudanza: añade las líneas «usar» que hacen falta cuando un
//  eDSL se lleva nombres que estaban en el ámbito global.
//
//  No adivina con expresiones regulares —un nombre dentro de un texto daría un
//  falso positivo, y uno escrito de otra forma se perdería—. Pregunta al
//  COMPILADOR: analiza cada programa, recoge los «X no está definida» cuyo X
//  vive hoy en un eDSL, escribe la línea «usar» correspondiente y vuelve a
//  analizar hasta que no queden. Lo que el compilador no señala, no se toca.
//
//  Cada paso de la mudanza vuelve a usar esto tal cual: el siguiente eDSL solo
//  necesita mudar sus funciones y correr «node util/mudar.js».
//
//    node util/mudar.js            → dice qué cambiaría, sin escribir
//    node util/mudar.js --escribir → lo escribe
//
//  CONVIENE PASARLA HASTA QUE DIGA 0. El compilador solo ve hasta el primer
//  muro: un «usar» que no resuelve corta el análisis antes de verificar tipos,
//  así que los nombres del cuerpo quedan tapados hasta que la línea del «usar»
//  esté bien. Cada pasada destapa la siguiente capa.
// ============================================================================
const fs = require('fs');
const path = require('path');
const R = require('../rutas.js');
require(R.bundle);
const { crearMotor } = globalThis.EspanolLike;

const ESCRIBIR = process.argv.includes('--escribir');

// El motor de análisis lleva un cargador de módulos de verdad, leyendo del
// disco. Sin él, un archivo que importa otro —«usar fila de "tabla.esl"»— se
// queda en «necesita un anfitrión con módulos» y la herramienta nunca llega a
// ver los nombres que le faltan: pasó con ejemplos/lib/numeros.esl, que salió
// intacto de la mudanza y rompió la suite de módulos.
const modulos = {
  resolver(espec, desde) {
    if (/^[./]/.test(espec) || espec.endsWith('.esl'))
      return path.resolve(desde ? path.dirname(desde) : process.cwd(), espec);
    return espec;
  },
  leer(clave) { return fs.readFileSync(clave, 'utf8'); },
};
const motor = () => crearMotor({ salida: () => {}, limiteInstr: 1, host: { modulos } });
const IX = motor().vm.indiceEdsl();

// ── FASE 2: renombres ───────────────────────────────────────────────────────
// Mudar un nombre a un eDSL solo pide una línea «usar». RENOMBRARLO es otra
// cosa: hay que tocar cada sitio donde está escrito. También se hace guiado por
// el compilador, y aquí se puede ser exacto: el error trae LÍNEA Y COLUMNA, así
// que se cambia esa aparición y solo esa. Un «E» que sea una variable del
// usuario no da error, así que la herramienta no lo ve y no lo toca.
const RENOMBRES = {
  PI: '|PI', E: '|E', INFINITO: '|INFINITO',
  // Los que la especificación de los quince eDSL renombra. Van con el relleno
  // de «numerico» y no después: añadir «suma» y dejar «sumar» daría dos nombres
  // para lo mismo, que es peor que cualquiera de los dos.
  abs: 'absoluto', pot: 'potencia', sumar: 'suma',
  // «rellenar» se retiró de «texto»: era exactamente «formato.alinearDer», y
  // alinear es presentación. El renombre cruza de eDSL, así que la línea del
  // «usar» hay que mirarla —la herramienta cambia el nombre, no la ruta—.
  rellenar: 'alinearDer',
  regresionLineal: 'regresion', resolverSistema: 'resolver',
  // «aleatorio» NO está aquí: no es un renombre. Se partió en «azar()» y
  // «azarEntre(min, max)» para quitar la firma de tres formas distintas que
  // nadie recuerda, así que sus llamadas hay que mirarlas una a una.
};

function renombrar(fuente, clave) {
  let out = fuente;
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const a = motor().analizar(out, clave);
    // De atrás hacia delante, para que cambiar uno no mueva la columna del otro.
    const sitios = [];
    for (const e of a.errores || []) {
      if (e.archivo) continue;            // de un módulo importado, no de aquí
      const t = String(e.message || e.msg || '');
      // Dos formas de que un renombre salga a la luz, y las dos traen la
      // posición exacta:
      //   «X» no está definida            una llamada
      //   «eDSL» no exporta «X»           la línea del «usar», cuando el
      //                                   programa ya venía migrado
      const m = t.match(/^«([^»]+)» no está definida$/) ||
                t.match(/^«[^»]+» no exporta «([^»]+)»$/);
      if (!m || !RENOMBRES[m[1]] || !e.linea) continue;
      sitios.push({ linea: e.linea, col: e.col, viejo: m[1], nuevo: RENOMBRES[m[1]] });
    }
    if (!sitios.length) return out;
    sitios.sort((x, y) => y.linea - x.linea || y.col - x.col);
    const ls = out.split('\n');
    for (const p of sitios) {
      const l = ls[p.linea - 1];
      if (l === undefined) continue;
      const i = p.col - 1;
      // Se comprueba que en esa posición esté de verdad el nombre: si no, se
      // deja y se avisa, antes que estropear una línea a ciegas.
      if (l.slice(i, i + p.viejo.length) !== p.viejo) {
        console.log(`  ⚠ ${p.viejo} en línea ${p.linea}:${p.col} no está donde dice el error`);
        continue;
      }
      ls[p.linea - 1] = l.slice(0, i) + p.nuevo + l.slice(i + p.viejo.length);
    }
    out = ls.join('\n');
  }
  return out;
}

// ── FASE 3: nombres que cambian de eDSL ─────────────────────────────────────
// Un nombre puede MUDARSE de un eDSL a otro —«rellenar» de «texto» pasó a ser
// «alinearDer» de «formato», porque alinear es presentación—. Entonces la línea
// del «usar» queda apuntando al eDSL viejo y el error es «X no exporta Y», que
// ni la fase 1 ni la 2 miraban: la herramienta decía 0 cambios sobre un archivo
// que no compilaba. Aquí se quita el nombre de la línea que ya no lo tiene, y
// la fase 1 le pone el «usar» bueno en la vuelta siguiente.
function quitarDeUsar(fuente, clave) {
  const a = motor().analizar(fuente, clave);
  const sitios = [];
  for (const e of a.errores || []) {
    if (e.archivo || !e.linea) continue;
    const m = String(e.message || e.msg || '').match(/^«[^»]+» no exporta «([^»]+)»$/);
    if (!m) continue;
    // Solo si el nombre existe de verdad en OTRO eDSL. Si no existe en ninguno,
    // el error es del programa y no es cosa de la herramienta.
    if (!IX.get(m[1])) continue;
    sitios.push({ linea: e.linea, col: e.col, nombre: m[1] });
  }
  if (!sitios.length) return fuente;
  const ls = fuente.split('\n');
  sitios.sort((x, y) => y.linea - x.linea || y.col - x.col);
  for (const p of sitios) {
    const i = p.linea - 1;
    const l = ls[i];
    if (l === undefined || l.indexOf(p.nombre) < 0) continue;
    // Se quita el nombre y la coma que le corresponda; si era el único, se
    // borra la línea entera.
    let n = l.replace(new RegExp('\\b' + p.nombre + '\\s*,\\s*'), '')
             .replace(new RegExp(',\\s*' + p.nombre + '\\b'), '');
    if (n === l) { ls.splice(i, 1); continue; }
    ls[i] = n;
  }
  return ls.join('\n');
}

// Los nombres que el compilador echa en falta y que hoy viven en un eDSL.
function faltan(fuente, clave) {
  const a = motor().analizar(fuente, clave);
  const pedir = new Map();                       // eDSL → Set(nombre)
  for (const e of a.errores || []) {
    // Un error con «archivo» viene de un módulo IMPORTADO, no de este. Ese se
    // arregla cuando le toque a su archivo: añadir el «usar» aquí no lo
    // soluciona y hace que la vuelta no converja nunca.
    if (e.archivo) continue;
    const m = String(e.message || e.msg || '').match(/^«([^»]+)» no está definida$/);
    if (!m) continue;
    const eds = IX.get(m[1]);
    if (!eds || !eds.length) continue;
    // Si un nombre está en dos eDSL, la mudanza no puede decidir sola: se avisa
    // y se deja al humano, que es justo lo que hay que hacer con un choque.
    if (eds.length > 1) { console.log(`  ⚠ «${m[1]}» está en ${eds.join(' y ')}: decide a mano`); continue; }
    if (!pedir.has(eds[0])) pedir.set(eds[0], new Set());
    pedir.get(eds[0]).add(m[1]);
  }
  return pedir;
}

// La línea «usar» va después de los comentarios de cabecera: en un ejemplo, lo
// primero que se lee tiene que seguir siendo de qué va el programa.
function insertar(fuente, lineas) {
  const ls = fuente.split('\n');
  let i = 0;
  while (i < ls.length && (ls[i].trim() === '' || ls[i].trim().startsWith('#'))) i++;
  // Si ya hay «usar», las nuevas van con ellas.
  let j = i;
  while (j < ls.length && ls[j].trim().startsWith('usar ')) j++;
  const sangria = (ls[i] || '').match(/^\s*/)[0];
  const bloque = lineas.map(l => sangria + l);
  if (j > i) ls.splice(j, 0, ...bloque);
  else ls.splice(i, 0, ...bloque, '');
  return ls.join('\n');
}

// Analiza, renombra, añade los «usar», y repite hasta que el compilador no
// pida más. El renombre va primero: si «PI» pasa a «|PI», ya no hace falta
// importarlo, así que preguntar por los «usar» antes daría una respuesta vieja.
// Las TRES fases, juntas y repetidas hasta que nada cambie. El orden importa y
// no basta con pasarlas una detrás de otra: un «usar» que apunta al eDSL viejo
// tapa los errores del cuerpo, así que hasta que la fase 3 lo quita, la fase 2
// no puede ver los nombres que hay que renombrar dentro. Pasó exactamente eso
// con «rellenar» → «alinearDer», que cruzaba de eDSL y de nombre a la vez.
function arreglar(fuente, etiqueta, clave) {
  let out = fuente;
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const antes = out;
    out = renombrar(out, clave);          // fase 2: nombres que cambiaron
    out = quitarDeUsar(out, clave);       // fase 3: nombres que cambiaron de eDSL
    const pedir = faltan(out, clave);     // fase 1: los «usar» que faltan
    if (pedir.size) {
      const lineas = [...pedir].sort().map(([e, ns]) =>
        `usar ${[...ns].sort().join(', ')} de "${e}"`);
      out = insertar(out, lineas);
    }
    if (out === antes) return { fuente: out, cambiado: out !== fuente };
  }
  console.log(`  ⚠ ${etiqueta}: no converge, mira a mano`);
  return { fuente: out, cambiado: out !== fuente };
}

let tocados = 0, progs = 0;

// ── 1. los .esl del proyecto y de las pruebas
for (const d of [R.entrega('ejemplos'), R.entrega('ejemplos/lib'), R.pruebas('en-n')]) {
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.esl'))) {
    const ruta = path.join(d, f);
    const r = arreglar(fs.readFileSync(ruta, 'utf8'), f, ruta);
    progs++;
    if (!r.cambiado) continue;
    tocados++;
    console.log('  ' + path.relative(R.proyecto, ruta));
    if (ESCRIBIR) fs.writeFileSync(ruta, r.fuente);
  }
}

// ── 2. los ejemplos del IDE y las suites: Ñ dentro de plantillas de JavaScript.
// Se reescribe trozo a trozo, sin tocar el JavaScript de alrededor.
function enPlantillas(ruta, patron) {
  let texto = fs.readFileSync(ruta, 'utf8');
  let cambios = 0;
  texto = texto.replace(patron, (todo, cuerpo) => {
    progs++;
    // Un acento grave escapado dentro del trozo no es Ñ: se deja igual.
    if (cuerpo.includes('${')) return todo;
    const r = arreglar(cuerpo, path.basename(ruta));
    if (!r.cambiado) return todo;
    cambios++;
    return todo.replace(cuerpo, r.fuente);
  });
  if (cambios) {
    tocados += cambios;
    console.log('  ' + path.relative(R.proyecto, ruta) + '  (' + cambios + ' trozos)');
    if (ESCRIBIR) fs.writeFileSync(ruta, texto);
  }
}
enPlantillas(R.ide('padre.html'), /`([\s\S]*?)`,\n/g);
for (const f of fs.readdirSync(R.pruebas('')).filter(x => x.endsWith('.js')))
  enPlantillas(R.pruebas(f), /`([\s\S]*?)`/g);

// ── 3. los ejemplos de la referencia, que son datos de un módulo de JavaScript
{
  const ruta = R.util('ejemplos-biblioteca.js');
  const bib = require(ruta);
  let texto = fs.readFileSync(ruta, 'utf8');
  let cambios = 0;
  for (const [clave, src] of Object.entries(bib)) {
    progs++;
    const r = arreglar(src, clave);
    if (!r.cambiado) continue;
    // Se reescribe la entrada con su literal, escapando como lo estaba.
    const esc = x => JSON.stringify(x).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
    const viejo = new RegExp("(['\"]?" + clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]?: )'" +
      esc(src).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
    if (!viejo.test(texto)) { console.log(`  ⚠ ${clave}: no encuentro su literal`); continue; }
    texto = texto.replace(viejo, (m, p1) => p1 + "'" + esc(r.fuente) + "'");
    cambios++;
  }
  if (cambios) {
    tocados += cambios;
    console.log('  ' + path.relative(R.proyecto, ruta) + '  (' + cambios + ' ejemplos)');
    if (ESCRIBIR) fs.writeFileSync(ruta, texto);
  }
}

// Un 0 aquí NO quiere decir que no quede nada por mudar, y conviene decirlo: de
// los archivos de JavaScript solo se leen los programas escritos entre acentos
// graves. Uno escrito con comillas —corre('pintar(…)')— es invisible para esta
// herramienta, y al mudar los estilos había 27 así en pruebas/estilos.js que
// daban 0 mientras 36 pruebas fallaban. Detectarlos probando a compilar todo
// literal de texto sería peor: cualquier frase en inglés parecería un programa
// con nombres sin definir y acabaría con líneas de «usar» inventadas dentro.
console.log(`\n  ${progs} programas mirados · ${tocados} necesitan «usar»` +
  (ESCRIBIR ? ' · escritos' : ' · nada escrito (usa --escribir)'));
if (!tocados) console.log('  (de los .js solo se leen los programas entre acentos graves:\n' +
  '   uno escrito con comillas hay que mudarlo a mano)');
