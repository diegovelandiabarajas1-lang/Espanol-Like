// ============================================================================
//  Ñ v4 — eDSL «texto»: trabajar con cadenas
//  Parte 10.
//
//  Se importa con:  usar "texto"
//
//  Este es el primero que se MUDA, no se escribe de cero: sus diez funciones
//  estaban en el ámbito global y aquí están las mismas, con los mismos nombres
//  y el mismo cuerpo. Solo cambia dónde viven, y eso es a propósito: la mudanza
//  se hace de un eDSL por paso, sin renombrar nada, para que cada paso se pueda
//  deshacer solo y las pruebas digan si algo se movió de sitio.
//
//  Los renombres que propone la especificación —«rellenarIzq» y «rellenarDer»
//  en vez de «rellenar», «largo» en vez de «longitud»— son una decisión aparte
//  y vienen después. Mezclar mudanza con renombre es cómo se pierde el rastro
//  de qué rompió qué.
//
//  Lo que NO se muda: «contiene» y «longitud». Valen para texto, para listas y
//  para diccionarios, así que no son de este eDSL: se quedan en el núcleo.
// ============================================================================
'use strict';

// ── las piezas que necesitan varias funciones ───────────────────────────────

// Las vocales con tilde y la diéresis. La Ñ NO está: en español es una letra
// propia, no una n con sombrero, así que «sinAcentos» la conserva. La única
// excepción es «aUrl», donde una dirección web no la admite y se dice allí.
const TILDES = {
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'Á': 'A', 'À': 'A', 'Ä': 'A', 'Â': 'A',
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'É': 'E', 'È': 'E', 'Ë': 'E', 'Ê': 'E',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'Í': 'I', 'Ì': 'I', 'Ï': 'I', 'Î': 'I',
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'Ó': 'O', 'Ò': 'O', 'Ö': 'O', 'Ô': 'O',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'Ú': 'U', 'Ù': 'U', 'Ü': 'U', 'Û': 'U',
  'ç': 'c', 'Ç': 'C',
};
const sinTildes = s => s.replace(/[áàäâÁÀÄÂéèëêÉÈËÊíìïîÍÌÏÎóòöôÓÒÖÔúùüûÚÙÜÛçÇ]/g, c => TILDES[c]);

// El alfabeto español, con la ñ en su sitio: entre la n y la o. En Unicode la
// ñ está después de la z, así que ordenar por códigos pone «ñandú» detrás de
// «zapato», y eso es exactamente lo que este eDSL viene a arreglar.
const ALFA_ES = 'abcdefghijklmnñopqrstuvwxyz';

// Tres pesos, en orden: la letra, luego la tilde, luego la mayúscula. Así
// «el» va antes de «él», y «él» antes de «Él», que es la regla real.
function claveEs(s) {
  let letras = '', tildes = '', cajas = '';
  for (const c of s) {
    const bajo = c.toLowerCase();
    const base = TILDES[bajo] || bajo;
    const i = ALFA_ES.indexOf(base);
    // Lo que no es letra del alfabeto va antes que las letras, por su código.
    letras += i >= 0 ? String.fromCharCode(0x100 + i) : String.fromCharCode(Math.min(0xFF, c.codePointAt(0)));
    tildes += TILDES[bajo] ? '1' : '0';
    cajas += c === bajo ? '0' : '1';
  }
  return letras + '\u0000' + tildes + '\u0000' + cajas;
}
const comparaEs = (a, b) => {
  const x = claveEs(a), y = claveEs(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// Distancia de edición, con una sola fila en memoria: dos textos de mil
// caracteres son un millón de celdas, y guardar la matriz entera no hace falta.
function levenshtein(x, y) {
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  const fila = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) fila[j] = j;
  for (let i = 1; i <= x.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (x[i - 1] === y[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[y.length];
}

function instalarTexto(vm) {
  const L = items => vm.nuevaLista(items);
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);

  return function (def) {
    def('mayusculas', 'texto -> texto', a => txt(a[0], 1, 'mayusculas').toUpperCase(),
      'pasa el texto a mayúsculas, acentos incluidos');
    def('minusculas', 'texto -> texto', a => txt(a[0], 1, 'minusculas').toLowerCase(),
      'pasa el texto a minúsculas');
    def('recortar', 'texto -> texto', a => txt(a[0], 1, 'recortar').trim(),
      'quita los espacios de los extremos');
    def('dividir', '... -> lista<texto>',
      a => L(txt(a[0], 1, 'dividir').split(a.length > 1 ? txt(a[1], 2, 'dividir') : ' ')),
      'dividir(texto, separador) — el separador por defecto es el espacio');
    def('unir', 'lista, texto -> texto',
      a => lst(a[0], 1, 'unir').items.map(x => typeof x === 'string' ? x : repr(x, 1)).join(txt(a[1], 2, 'unir')),
      'unir(lista, separador) — lo contrario de dividir');
    def('reemplazar', 'texto, texto, texto -> texto',
      a => txt(a[0], 1, 'reemplazar').split(txt(a[1], 2, 'reemplazar')).join(txt(a[2], 3, 'reemplazar')),
      'cambia todas las apariciones de un trozo por otro');
    def('empiezaCon', 'texto, texto -> bool',
      a => txt(a[0], 1, 'empiezaCon').startsWith(txt(a[1], 2, 'empiezaCon')),
      'dice si el texto empieza por ese trozo');
    def('terminaCon', 'texto, texto -> bool',
      a => txt(a[0], 1, 'terminaCon').endsWith(txt(a[1], 2, 'terminaCon')),
      'dice si el texto termina en ese trozo');
    def('subtexto', 'texto, entero, entero -> texto',
      a => txt(a[0], 1, 'subtexto').slice(num(a[1], 2, 'subtexto'), num(a[2], 3, 'subtexto')),
      'subtexto(texto, desde, hasta) — el trozo entre dos posiciones');

    // ═══════════════════════════════════════════════════════ medir y buscar
    // No hay «largo» ni «estaVacio» ni «contiene»: «longitud» y «contiene» del
    // núcleo ya valen para texto, listas y diccionarios, y dos nombres para lo
    // mismo es peor que cualquiera de los dos.
    def('indiceDe', '... -> entero', a => {
      const s = txt(a[0], 1, 'indiceDe'), q = txt(a[1], 2, 'indiceDe');
      return s.indexOf(q, a.length > 2 ? ent(a[2], 3, 'indiceDe') : 0);
    }, 'indiceDe(texto, trozo, desde?) — la primera posición, o −1 si no está');
    def('ultimoIndiceDe', 'texto, texto -> entero',
      a => txt(a[0], 1, 'ultimoIndiceDe').lastIndexOf(txt(a[1], 2, 'ultimoIndiceDe')),
      'la última posición, o −1');
    def('cuantasVeces', 'texto, texto -> entero', a => {
      const s = txt(a[0], 1, 'cuantasVeces'), q = txt(a[1], 2, 'cuantasVeces');
      if (!q) vm.error('«cuantasVeces»: el trozo que se busca no puede estar vacío');
      let n = 0, i = 0;
      for (;;) { const j = s.indexOf(q, i); if (j < 0) break; n++; i = j + q.length; }
      return n;
    }, 'cuántas veces aparece · sin solaparse');

    // ═══════════════════════════════════════════════════════════════ cortar
    def('izquierda', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'izquierda');
      return n <= 0 ? '' : txt(a[0], 1, 'izquierda').slice(0, n);
    }, 'los n primeros caracteres');
    def('derecha', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'derecha');
      return n <= 0 ? '' : txt(a[0], 1, 'derecha').slice(-n);
    }, 'los n últimos caracteres');
    def('entre', 'texto, texto, texto -> texto', a => {
      // Lo que hay entre dos marcas. Si falta alguna, texto vacío: es lo que se
      // espera al sacar un campo de una línea que no lo trae.
      const s = txt(a[0], 1, 'entre'), d = txt(a[1], 2, 'entre'), h = txt(a[2], 3, 'entre');
      const i = s.indexOf(d);
      if (i < 0) return '';
      const j = s.indexOf(h, i + d.length);
      return j < 0 ? '' : s.slice(i + d.length, j);
    }, 'entre("nombre: Ana;", ": ", ";") → «Ana» — vacío si falta una marca');
    def('antesDe', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'antesDe'), q = txt(a[1], 2, 'antesDe');
      const i = s.indexOf(q);
      return i < 0 ? s : s.slice(0, i);
    }, 'lo que hay antes de la marca · el texto entero si no está');
    def('despuesDe', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'despuesDe'), q = txt(a[1], 2, 'despuesDe');
      const i = s.indexOf(q);
      return i < 0 ? '' : s.slice(i + q.length);
    }, 'lo que hay después de la marca · vacío si no está');
    def('recortarIzq', 'texto -> texto', a => txt(a[0], 1, 'recortarIzq').replace(/^\s+/, ''),
      'quita los espacios de delante');
    def('recortarDer', 'texto -> texto', a => txt(a[0], 1, 'recortarDer').replace(/\s+$/, ''),
      'quita los espacios de detrás');
    def('quitarPrefijo', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'quitarPrefijo'), p = txt(a[1], 2, 'quitarPrefijo');
      return p && s.startsWith(p) ? s.slice(p.length) : s;
    }, 'quita ese principio si está · no toca nada si no');
    def('quitarSufijo', 'texto, texto -> texto', a => {
      const s = txt(a[0], 1, 'quitarSufijo'), p = txt(a[1], 2, 'quitarSufijo');
      return p && s.endsWith(p) ? s.slice(0, -p.length) : s;
    }, 'quita ese final si está');

    // ══════════════════════════════════════════════════════════ transformar
    def('capitalizar', 'texto -> texto', a => {
      const s = txt(a[0], 1, 'capitalizar');
      return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
    }, 'capitalizar("hOLA mUNDO") → «Hola mundo» — solo la primera');
    def('titular', 'texto -> texto', a => {
      // En español NO se capitaliza cada palabra de un título, pero un nombre
      // propio o una cabecera de columna sí lo pide. Las palabras cortas de
      // enlace se quedan en minúscula, que es la regla real.
      const chicas = ['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u',
        'a', 'al', 'en', 'con', 'por', 'para', 'sin', 'un', 'una'];
      const ps = txt(a[0], 1, 'titular').toLowerCase().split(/(\s+)/);
      let primera = true;
      return ps.map(p => {
        if (!p.trim()) return p;
        const cap = primera || !chicas.includes(p);
        primera = false;
        return cap ? p.charAt(0).toUpperCase() + p.slice(1) : p;
      }).join('');
    }, 'titular("juan de la cruz") → «Juan de la Cruz» — «de» y «la» se quedan en minúscula');
    def('reemplazarPrimero', 'texto, texto, texto -> texto', a => {
      // «reemplazar» cambia TODAS las apariciones. Esta cambia una, que hacía
      // falta y no había forma de pedirlo.
      const s = txt(a[0], 1, 'reemplazarPrimero'), d = txt(a[1], 2, 'reemplazarPrimero');
      const c = txt(a[2], 3, 'reemplazarPrimero');
      const i = s.indexOf(d);
      return i < 0 ? s : s.slice(0, i) + c + s.slice(i + d.length);
    }, 'solo la primera aparición · «reemplazar» cambia todas');
    def('repetirTexto', 'texto, entero -> texto', a => {
      const n = ent(a[1], 2, 'repetirTexto');
      if (n < 0) vm.error('«repetirTexto»: no se puede repetir menos de 0 veces');
      const s = txt(a[0], 1, 'repetirTexto');
      if (s.length * n > 1e7) vm.error('«repetirTexto»: el resultado sería demasiado grande');
      return s.repeat(n);
    }, 'repetirTexto("ab", 3) → «ababab»');
    def('invertirTexto', 'texto -> texto', a => {
      // Por puntos de código y no por unidades UTF-16: así un emoji no se parte
      // por la mitad. «invertir» del núcleo es solo para listas.
      return [...txt(a[0], 1, 'invertirTexto')].reverse().join('');
    }, 'del revés · «invertir» del núcleo es para listas');

    // ══════════════════════════════════════════════════════ partir y juntar
    def('lineas', 'texto -> lista<texto>', a => L(txt(a[0], 1, 'lineas').split(/\r\n|\r|\n/)),
      'parte por saltos de línea · entiende los de Windows');
    def('palabras', 'texto -> lista<texto>', a =>
      L(txt(a[0], 1, 'palabras').split(/\s+/).filter(x => x !== '')),
      'parte por espacios, sin dejar huecos vacíos');
    def('caracteres', 'texto -> lista<texto>', a => L([...txt(a[0], 1, 'caracteres')]),
      'uno por carácter · por puntos de código, no por bytes');
    def('envolver', 'texto, entero -> lista<texto>', a => {
      // Corta en líneas de como máximo n, sin partir palabras. Lo que hace
      // falta para escribir un párrafo en una consola o en una factura.
      const s = txt(a[0], 1, 'envolver'), n = ent(a[1], 2, 'envolver');
      if (n < 1) vm.error('«envolver»: el ancho tiene que ser 1 o más');
      const out = [];
      for (const parrafo of s.split(/\r\n|\r|\n/)) {
        let linea = '';
        for (const p of parrafo.split(/\s+/).filter(x => x !== '')) {
          if (!linea) { linea = p; continue; }
          if (linea.length + 1 + p.length <= n) { linea += ' ' + p; continue; }
          out.push(linea);
          linea = p;
        }
        out.push(linea);
      }
      return L(out);
    }, 'envolver(texto, 40) — lo parte en líneas sin cortar palabras');
    def('sangrar', '... -> texto', a => {
      const s = txt(a[0], 1, 'sangrar'), n = ent(a[1], 2, 'sangrar');
      const c = a.length > 2 ? txt(a[2], 3, 'sangrar') : ' ';
      const p = c.repeat(Math.max(0, n));
      return s.split('\n').map(l => (l === '' ? l : p + l)).join('\n');
    }, 'sangrar(texto, 4) — mete n espacios delante de cada línea');
    def('desangrar', 'texto -> texto', a => {
      // Quita la sangría COMÚN, no toda: así un bloque anidado conserva su
      // forma. Es lo que se quiere al leer un texto escrito dentro del código.
      const ls = txt(a[0], 1, 'desangrar').split('\n');
      let min = Infinity;
      for (const l of ls) {
        if (!l.trim()) continue;
        min = Math.min(min, l.match(/^\s*/)[0].length);
      }
      if (!Number.isFinite(min) || min === 0) return ls.join('\n');
      return ls.map(l => (l.trim() ? l.slice(min) : l)).join('\n');
    }, 'quita la sangría que comparten todas las líneas, no más');

    // ════════════════════════════════════════════════ el español, en serio
    def('sinAcentos', 'texto -> texto', a => sinTildes(txt(a[0], 1, 'sinAcentos')),
      'sinAcentos("Martín") → «Martin» · la Ñ se QUEDA: en español es una letra, no una n con sombrero');
    def('igualSinAcentos', 'texto, texto -> bool', a =>
      sinTildes(txt(a[0], 1, 'igualSinAcentos')).toLowerCase() ===
      sinTildes(txt(a[1], 2, 'igualSinAcentos')).toLowerCase(),
      'igualSinAcentos("Martín", "martin") → cierto · buscar un cliente sin pelearse con las tildes');
    def('ordenAlfabetico', 'lista -> lista', a => {
      // El orden del español, no el de los códigos Unicode. Es la diferencia
      // entre [nada, nube, ñandú, ñu, oso] y [nada, nube, oso, ñandú, ñu]:
      // en Unicode la ñ va después de la z, y en español va después de la n.
      const l = lst(a[0], 1, 'ordenAlfabetico');
      const xs = l.items.map(x => (typeof x === 'string' ? x : repr(x, 1)));
      vm.cobrar(xs.length * 2);
      return L(xs.slice().sort(comparaEs));
    }, 'ordena como el español: la ñ va entre la n y la o, y «él» después de «el»');
    def('distancia', 'texto, texto -> entero', a => {
      const x = txt(a[0], 1, 'distancia'), y = txt(a[1], 2, 'distancia');
      if (x.length * y.length > 4e6) vm.error('«distancia»: los textos son demasiado largos');
      vm.cobrar(x.length * y.length / 100);
      return levenshtein(x, y);
    }, 'cuántos cambios de una letra hacen falta para pasar de uno a otro');
    def('parecido', 'texto, texto -> real', a => {
      // De 0 a 1, ignorando tildes y mayúsculas: lo que se quiere para decir
      // «¿será este el mismo cliente escrito de otra forma?».
      const x = sinTildes(txt(a[0], 1, 'parecido')).toLowerCase();
      const y = sinTildes(txt(a[1], 2, 'parecido')).toLowerCase();
      if (!x.length && !y.length) return 1;
      if (x.length * y.length > 4e6) vm.error('«parecido»: los textos son demasiado largos');
      vm.cobrar(x.length * y.length / 100);
      return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
    }, 'parecido("Gonzalez", "González") → 1 · de 0 a 1, sin tildes ni mayúsculas');
    def('aUrl', 'texto -> texto', a => {
      // Aquí la ñ SÍ pasa a n: una dirección web no la admite. Es la excepción
      // a la regla de sinAcentos, y es a propósito.
      const s = sinTildes(txt(a[0], 1, 'aUrl')).toLowerCase()
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return s;
    }, 'aUrl("Camión Año 2026") → «camion-ano-2026» · aquí la ñ sí pasa a n');
    def('aIdentificador', 'texto -> texto', a => {
      // Un nombre que Ñ acepta de verdad: el léxico admite tildes y ñ en un
      // identificador, así que solo hay que quitar lo demás y el dígito inicial.
      let s = txt(a[0], 1, 'aIdentificador').trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]/g, '');
      if (!s) vm.error('«aIdentificador»: no queda nada que pueda ser un nombre');
      if (/^[0-9]/.test(s)) s = '_' + s;
      return s;
    }, 'aIdentificador("Total año 2026") → «Total_año_2026» — un nombre que Ñ acepta');

    // ═════════════════════════════════════════════════════════ caracteres
    def('codigo', 'texto -> entero', a => {
      const s = txt(a[0], 1, 'codigo');
      if (!s) vm.error('«codigo» de un texto vacío');
      return s.codePointAt(0);
    }, 'el número Unicode del primer carácter');
    def('deCodigo', 'entero -> texto', a => {
      const n = ent(a[0], 1, 'deCodigo');
      if (n < 0 || n > 0x10FFFF) vm.error(`«deCodigo»: ${n} no es un carácter`);
      return String.fromCodePoint(n);
    }, 'deCodigo(241) → «ñ»');
    const clase = (nombre, re, doc) => def(nombre, 'texto -> bool', a => {
      const s = txt(a[0], 1, nombre);
      return s.length > 0 && re.test(s);
    }, doc);
    clase('esLetra', /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/, 'solo letras · las tildes y la ñ cuentan como letras');
    clase('esDigito', /^[0-9]+$/, 'solo dígitos');
    clase('esEspacio', /^\s+$/, 'solo espacios, tabulaciones o saltos');
    clase('esVocal', /^[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]+$/, 'solo vocales, con tilde o sin ella');
    def('esMayuscula', 'texto -> bool', a => {
      // Cierto si hay alguna letra y todas están en mayúscula. Un texto sin
      // letras no es mayúscula ni minúscula: «123» daría cierto con la
      // comparación ingenua contra su propia versión en mayúsculas.
      const s = txt(a[0], 1, 'esMayuscula');
      return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(s) && s === s.toUpperCase();
    }, 'todas las letras en mayúscula · «123» es falso, que no tiene letras');

    // ═══════════════════════════════════════════════════════════ plantillas
    def('plantilla', 'texto, dic -> texto', a => {
      // La interpolación del lenguaje —"hola {nombre}"— se resuelve al
      // compilar. Esta la resuelve en ejecución, que es lo que hace falta
      // cuando la plantilla viene de un archivo o de la base de datos.
      const s = txt(a[0], 1, 'plantilla');
      const d = a[1];
      if (!(d instanceof ObjDic)) vm.error('«plantilla»: el argumento 2 debe ser un diccionario');
      return s.replace(/\{([^{}]*)\}/g, (todo, clave) => {
        const k = clave.trim();
        if (!d.mapa.has(k)) vm.error(`«plantilla»: falta «${k}»`,
          d.mapa.size ? 'el diccionario trae: ' + [...d.mapa.keys()].join(', ') : 'el diccionario está vacío');
        const v = d.mapa.get(k);
        return typeof v === 'string' ? v : repr(v, 1);
      });
    }, 'plantilla(texto, diccionario) — para una plantilla que llega en ejecución, de un archivo o de una base de datos. En un texto ESCRITO en el programa, las llaves son la interpolación del lenguaje y hay que escaparlas: plantilla("Hola \\{nombre\\}", d)');
    def('escaparHtml', 'texto -> texto', a =>
      txt(a[0], 1, 'escaparHtml').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      'para meter texto en HTML a mano · el árbol de nodos ya lo hace solo');
    def('escaparCsv', 'texto -> texto', a => {
      // Entre comillas solo si hace falta, y las comillas de dentro se doblan.
      // Es lo que espera Excel, y hacerlo a mano sale mal una vez de cada diez.
      const s = txt(a[0], 1, 'escaparCsv');
      return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }, 'pone comillas solo si hacen falta y dobla las de dentro');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarTexto };
