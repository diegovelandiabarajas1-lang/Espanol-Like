// Genera la página de referencia de la biblioteca estándar a partir de dos
// fuentes, ninguna escrita a mano: el registro de globales del motor (nombres,
// aridad, firma, sección y texto de ayuda) y la salida real de ejecutar un
// ejemplo por cada entrada. Ya no se lee el código fuente como texto.
const fs = require('fs');
const R = require('../rutas.js');
require(R.bundle);
const EL = globalThis.EspanolLike;
const { crearMotor, tipoATexto, ObjNativa } = EL;

// ── 1. inventario: qué hay, con qué firma y en qué área — todo del registro
// de la VM. Antes el área se adivinaba raspando 04-stdlib.js con una expresión
// regular que listaba los ayudantes de declaración a mano, así que cualquier
// ayudante nuevo tiraba funciones fuera del catálogo sin avisar. Ya no: la
// sección la sella definirNativa y viaja con el nombre.
const inventario = [];
{
  const m = crearMotor({ salida: () => {}, host: {} });
  const tipos = m.vm.tiposGlobales();
  for (const [nombre, v] of m.vm.globals) {
    // Los nombres con un espacio delante no son de la biblioteca: son los que
    // el compilador emite y el léxico no puede escribir (« usar»). No se
    // documentan porque un programa no puede llamarlos.
    if (nombre.startsWith(' ')) continue;
    // Las de un eDSL viven con la clave delante. Se documentan con su nombre
    // corto, que es el que se escribe, y la clave solo sirve para saber de qué
    // eDSL son y con qué «usar» se traen.
    if (v instanceof ObjNativa && v.edsl) {
      const e = { nombre: v.nombreCorto, edsl: v.edsl, seccion: v.edsl,
        doc: v.doc || null, aridad: v.aridad, firma: tipoATexto(v.firma) };
      inventario.push(e);
      continue;
    }
    if (nombre.indexOf('\u0000') >= 0) continue;
    const t = tipos[nombre];
    const e = { nombre, doc: null, firma: t ? tipoATexto(t) : null };
    if (v instanceof ObjNativa) {
      e.seccion = v.seccion || '?'; e.doc = v.doc || null; e.aridad = v.aridad;
    } else {
      e.seccion = (m.vm.seccionValor && m.vm.seccionValor.get(nombre)) || '?';
      e.valor = EL.repr(v, 0); e.constante = true;
    }
    inventario.push(e);
  }
}

// ── 1b. la versión base: el inventario sellado, y qué ha cambiado desde él
//
// La página se regenera en cada construcción y se sobrescribe, así que ella sola
// no puede decir qué había antes. Al lado va «inventario.ñdatos», que SÍ se
// guarda: es la línea base contra la que se compara. Está en el formato del eDSL
// «datos» a propósito —es JSON con esquema y por columnas— así que se puede
// abrir con «deDatos» y consultar desde un programa en Ñ, no solo leer.
//
//   node util/referencia.js              genera la página y dice qué cambió
//   node util/referencia.js --sellar     y además fija la base de hoy
const SELLAR = process.argv.includes('--sellar');
const RUTA_INV = R.motor + '/inventario.ñdatos';
const COLS_INV = [
  { nombre: 'ambito', tipo: 'texto' },   // «global» o el nombre del eDSL
  { nombre: 'nombre', tipo: 'texto' },
  { nombre: 'clase', tipo: 'texto' },    // funcion · constante
  { nombre: 'firma', tipo: 'texto' },
  { nombre: 'aridad', tipo: 'entero' },  // −1 = número variable de argumentos
];
const claveInv = e => (e.edsl || 'global') + '\u0000' + e.nombre;

function aNdatos(inv) {
  const filas = [...inv].sort((a, b) => claveInv(a) < claveInv(b) ? -1 : 1);
  const col = f => filas.map(f);
  return JSON.stringify({
    'ñdatos': 1,
    columnas: COLS_INV,
    filas: filas.length,
    datos: [
      col(e => e.edsl || 'global'),
      col(e => e.nombre),
      col(e => e.constante ? 'constante' : 'funcion'),
      col(e => e.constante ? null : (e.firma || null)),
      col(e => e.constante ? null : (e.aridad === undefined ? null : e.aridad)),
    ],
  }, null, 1) + '\n';
}

// La comparación es por nombre completo —ámbito y nombre— y además mira la
// firma: un argumento que cambia de tipo no es un nombre nuevo, pero rompe
// programas igual, así que tiene que salir en la lista.
const cambios = { nuevos: [], idos: [], cambiados: [], base: null };
{
  let antes = null;
  try { antes = JSON.parse(fs.readFileSync(RUTA_INV, 'utf8')); } catch (_) {}
  if (antes && antes['ñdatos'] === 1) {
    const iCol = n => antes.columnas.findIndex(c => c.nombre === n);
    const dame = (n, f) => { const i = iCol(n); return i < 0 ? null : antes.datos[i][f]; };
    const viejos = new Map();
    for (let f = 0; f < antes.filas; f++) {
      viejos.set(dame('ambito', f) + '\u0000' + dame('nombre', f),
        { firma: dame('firma', f), clase: dame('clase', f) });
    }
    const hoy = new Map(inventario.map(e => [claveInv(e), e]));
    for (const [k, e] of hoy) {
      const v = viejos.get(k);
      const etiq = (e.edsl ? e.edsl + '.' : '') + e.nombre;
      if (!v) { cambios.nuevos.push(etiq); continue; }
      const firmaHoy = e.constante ? null : (e.firma || null);
      if (v.firma !== firmaHoy) cambios.cambiados.push(`${etiq}: «${v.firma}» → «${firmaHoy}»`);
    }
    for (const k of viejos.keys()) if (!hoy.has(k)) {
      const [amb, nom] = k.split('\u0000');
      cambios.idos.push(amb === 'global' ? nom : amb + '.' + nom);
    }
    cambios.base = { filas: antes.filas, fecha: antes.fecha || null, version: antes.version || null };
  }
}

// ── 2. cada ejemplo se ejecuta de verdad; lo que imprima es lo que se publica
const corridos = {};
{
  const ejemplos = require('./ejemplos-biblioteca.js');
  const clave = e => (e.edsl ? e.edsl + '.' + e.nombre : e.nombre);
  const faltan = inventario.filter(e => !(clave(e) in ejemplos)).map(clave);
  if (faltan.length) throw new Error('sin ejemplo: ' + faltan.join(', '));
  let rotos = [];
  for (const [nombre, src] of Object.entries(ejemplos)) {
    const out = [];
    const tocado = [];
    const espia = new Proxy({}, { get: (_, k) => (...a) => { tocado.push(String(k)); return null; }, has: () => true });
    // El almacén y los temporizadores necesitan un anfitrión que conteste de
    // verdad: uno que devuelva null a todo haría que los ejemplos mintieran.
    const disco = new Map();
    const almacen = { leer: k => (disco.has(k) ? disco.get(k) : null), escribir: (k, v) => disco.set(k, v),
      borrar: k => disco.delete(k), claves: () => [...disco.keys()] };
    let sig = 0;
    const tiempo = { luego: () => ++sig, cada: () => ++sig, detener: id => id > 0 && id <= sig };
    // La red no sale de verdad en la referencia: lo que se publica es el
    // ejemplo y lo que imprime antes de que llegue nada.
    const redFalsa = { pedir() {} };
    // Los archivos de los ejemplos son de mentira: la referencia se genera
    // ejecutándolos, y no tiene por qué tocar el disco de nadie para eso.
    const disco2 = new Map([['datos/notas.txt', 'primera\nsegunda\n']]);
    const carpetas = new Set(['datos']);
    const archivos = {
      leer: r => { if (!disco2.has(r)) throw new Error('no se pudo leer ' + r); return disco2.get(r); },
      escribir: (r, t) => disco2.set(r, t),
      agregar: (r, t) => disco2.set(r, (disco2.get(r) || '') + t),
      existe: r => disco2.has(r) || carpetas.has(r),
      esCarpeta: r => carpetas.has(r),
      listar: r => [...disco2.keys()].filter(k => k.startsWith(r + '/')).map(k => k.slice(r.length + 1)),
      crearCarpeta: r => carpetas.add(r),
      borrar: r => disco2.delete(r),
      tamano: r => (disco2.get(r) || '').length,
    };
    const sistema = {
      argumentos: () => ['informe.csv', '--todo'],
      entorno: n => (n === 'USUARIO' ? 'diego' : null),
      ejecutar: (orden, a) => ({ codigo: 0, salida: [orden].concat(a).join(' ') + '\n', error: '' }),
      leerLinea: () => null,
      salir: () => {},
    };
    // Y el código nativo también es de mentira aquí, por la misma razón: la
    // referencia se genera en cualquier máquina y no puede depender de que esté
    // instalado koffi ni de cómo se llame la libc del sistema. Lo que enseñan
    // estos ejemplos es la forma de la API —qué se declara y qué tipo sale—, no
    // que la llamada salga del proceso. Lo que comprueba que sale de verdad es
    // «motor/pruebas/nativo.js», que llama a la libc y a raylib.
    const tablaC = { cos: Math.cos, strlen: t => [...String(t)].reduce((n, c) => n + (c.codePointAt(0) > 127 ? 2 : 1), 0) };
    const abiertasF = new Set();
    const nativoFalso = {
      cargar: n => { abiertasF.add(n); },
      descargar: n => abiertasF.delete(n),
      abiertas: () => [...abiertasF],
      estructura: () => {},
      funcion: (bib, sim) => { abiertasF.add(bib); const f = tablaC[sim] || (() => 0); return a => f(...a); },
    };
    const m = crearMotor({ salida: x => out.push(x), host: { grafico: espia, web: espia, almacen, tiempo, red: redFalsa, archivos, sistema, nativo: nativoFalso }, limiteInstr: 5e7 });
    const r = m.ejecutar(src);
    if (!r.ok) rotos.push(`${nombre}: ${r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')}`);
    corridos[nombre] = { src, out, ok: r.ok, hechos: [...new Set(tocado)] };
  }
  if (rotos.length) throw new Error('ejemplos que ya no corren:\n  ' + rotos.join('\n  '));
}

// Descripciones para las entradas que no traen texto de ayuda en el código.
const DOC = {
  seno: 'seno, con el ángulo en radianes', coseno: 'coseno, con el ángulo en radianes',
  tangente: 'tangente, con el ángulo en radianes',
  arcoseno: 'arcoseno, devuelve radianes', arcocoseno: 'arcocoseno, devuelve radianes',
  arcotangente: 'arcotangente, devuelve radianes',
  exp: 'e elevado a x', log10: 'logaritmo en base 10',
  signo: 'devuelve −1, 0 o 1 según el signo',
  maximo: 'el mayor de una lista, o de varios argumentos sueltos; también compara texto',
  minimo: 'el menor de una lista, o de varios argumentos sueltos',
  mayusculas: 'pasa el texto a mayúsculas, acentos incluidos',
  minusculas: 'pasa el texto a minúsculas',
  recortar: 'quita los espacios de los extremos',
  reemplazar: 'cambia todas las apariciones de un trozo por otro',
  empiezaCon: 'dice si el texto empieza por ese trozo',
  terminaCon: 'dice si el texto termina en ese trozo',
  subtexto: 'subtexto(texto, desde, hasta) — el trozo entre dos posiciones',
  agregar: 'añade un valor al final · modifica la lista',
  quitar: 'quita la primera aparición de un valor · modifica la lista',
  quitarEn: 'quita por posición y devuelve lo quitado · modifica la lista',
  insertar: 'mete un valor en una posición · modifica la lista',
  indice: 'posición de la primera aparición, o −1 si no está',
  contar: 'cuántas veces aparece un valor',
  invertir: 'una copia al revés',
  copiar: 'una copia superficial de una lista o un diccionario',
  aplanar: 'junta una lista de listas en una sola',
  claves: 'las claves de un diccionario, como lista',
  valores: 'los valores de un diccionario, como lista',
  pares: 'los pares [clave, valor] de un diccionario',
  borrar: 'quita una clave · modifica el diccionario',
  media: 'media aritmética', mediana: 'el valor central', moda: 'el valor que más se repite',
  desviacion: 'desviación típica muestral',
  percentil: 'percentil(datos, p) — con interpolación entre valores',
  transponer: 'cambia filas por columnas',
  multMatriz: 'producto de dos matrices',
  determinante: 'determinante de una matriz cuadrada',
  limpiarPagina: 'borra todo lo escrito en la página',
  pintar: 'pintar(nodo…) — el único que toca la página',
  crudo: 'crudo(html) — un nodo con HTML sin escapar; la puerta explícita',
};

// Qué hace lo que no imprime nada.
const EFECTO = {
  lienzo: 'prepara el área de dibujo y abre la pestaña Lienzo',
  limpiar: 'borra el lienzo entero', color: 'fija el color de lo que se dibuje a partir de ahí',
  grosor: 'fija el grosor de línea', linea: 'dibuja un segmento', rect: 'dibuja un rectángulo',
  circulo: 'dibuja un círculo', punto: 'pinta un píxel', escribirEn: 'escribe texto sobre el lienzo',
  graficar: 'dibuja una línea con ejes y rejilla', barras: 'dibuja un diagrama de barras',
  dispersion: 'dibuja una nube de puntos con su recta de ajuste',
  eco: 'escribe HTML crudo en la pestaña Página, sin pasar por el árbol',
  estilo: 'añade una hoja de estilos a la página', limpiarPagina: 'vacía la página',
  pintar: 'añade los nodos a la pestaña Página',
  crudo: 'construye un nodo con HTML sin escapar',
  entrada: 'construye un nodo caja de texto con su función',
  tabla: 'construye un nodo tabla',
};

const SECCIONES = [
  ['núcleo', 'Núcleo', 'Conversión de tipos, medida y las dos que aparecen en todos los programas.'],
  ['listas', 'Listas', 'Unas modifican la lista que reciben y otras devuelven una nueva. Está dicho en cada una.'],
  ['diccionarios', 'Diccionarios', 'Claves de cualquier tipo primitivo, con el orden de inserción conservado.'],
  ['gráficos', 'Gráficos', 'Dibujan en el lienzo. Fuera del entorno, sin un anfitrión que los atienda, no hacen nada.'],
  ['web', 'Web', 'Un árbol de nodos. Los constructores devuelven valores que se anidan y se guardan en variables; solo pintar() toca la página, y el texto que entra por aquí nunca se convierte en marcado.'],
  ['excepciones', 'Excepciones', 'El lenguaje trae intentar / capturar / finalmente / lanzar. Se puede lanzar cualquier valor; los fallos del propio motor llegan envueltos en un valor de tipo «error».'],
  ['estilo', 'estilo',
   'Un estilo es un valor: se compone, se guarda en variables, se pasa a las funciones y se anida como en SCSS. De cada uno distinto sale una clase con el nombre derivado de su contenido, emitida una sola vez, como en CSS Modules, así que dos estilos iguales comparten clase y nada es global por accidente. Lo que en SCSS son variables aquí son variables de Ñ; lo que son mixins, funciones que devuelven estilo; y el anidamiento con «&» lo hacen «alPasar», «dentro», «cuando» y compañía. LO QUE LE FALTABA eran los TOKENS DE DISEÑO, y es lo único que de verdad faltaba: sin ellos un color se escribe a mano en diez sitios, que es como muere todo sistema visual. «tema({"color": {"acento": "#4F3FD4"}})» devuelve un estilo cuyas propiedades son variables de CSS —«--color-acento»— y «color("acento")» devuelve el texto «var(--color-acento)», que vale como valor de cualquier propiedad. No es un registro global de valores a propósito: como la variable la resuelve la cascada donde se use, el modo oscuro es volver a declarar el tema dentro de «enOscuro(…)» sin tocar ni una regla de los componentes, y dos temas pueden convivir. «tema» apunta los nombres que declaró, así que un token mal escrito se caza con la lista de los que sí existen; de ahí la única regla de uso: declara el tema ANTES de usar sus tokens. Los ocho atajos de disposición —«enFila», «enColumna», «centrado», «separado», «envuelto», «rejillaDe», «apilado», «pegadoArriba»— no son solo atajos: los tres que reparten en fila llevan el «min-width: 0» en los hijos que nadie recuerda poner y sin el cual un texto largo saca la barra horizontal de la página, y «rejillaDe» usa «minmax(0, 1fr)» en vez de «1fr» por la misma razón.'],
  ['red', 'Red', 'Una petición no puede bloquear: pedir() no devuelve la respuesta, la entrega. Llega a una función como llega un clic. El anfitrión pide permiso una vez por sitio antes de dejar salir nada.'],
  ['memoria y tiempo', 'Memoria y tiempo', 'Lo que hace falta para que una aplicación siga siendo la misma al volver a abrirla, y para que algo ocurra sin que nadie pulse nada.'],
  ['archivos y sistema', 'Archivos y sistema', 'Solo existen fuera del navegador: las ofrece el intérprete de línea de órdenes, no la página. Un programa que corre dentro de una pestaña no puede abrir archivos, y eso no es una limitación que haya que rodear.'],
  ['código nativo', 'Código nativo', 'Llamar a una biblioteca compilada: se abre por su nombre, se declara la firma de una función —qué devuelve y qué recibe, con los tipos escritos en español— y sale una función de Ñ normal. Es un agujero en la caja a propósito: ejecuta código que nadie ha verificado dentro de este mismo proceso, así que solo existe cuando el anfitrión lo ofrece, nunca dentro de una página. Hoy lo ofrece el intérprete de Node, con koffi instalado; el de QuickJS no puede.'],
  ['introspección', 'Introspección', 'El motor mirándose a sí mismo: reloj, memoria y contador de instrucciones.'],
  // ── los eDSL. No están en el ámbito global: hay que traerlos con «usar», y
  // por eso cada entrada de aquí abajo enseña su propia línea de importación.
  ['constantes', 'Constantes del lenguaje',
   'Tres, con el sigilo «|» delante, y están SIEMPRE: no hay que importarlas y no se pueden tapar. Un programa no puede declarar un nombre que empiece por «|» —lo rechaza el parser—, así que |PI es |PI en cualquier archivo, pase lo que pase. Eso es lo que arregla el accidente que había antes con «E» a secas: «var E: real = 5» lo tapaba en silencio y el número de Euler pasaba a ser 5. Ahora tu «E» y el «|E» del lenguaje conviven sin estorbarse. El «||» del «o» lógico no se confunde con el sigilo: este solo empieza una constante cuando lo que sigue es una letra.'],
  ['numerico', 'numerico',
   'Cuentas de todo tipo: matemáticas, estadística y álgebra lineal en UN solo eDSL, no en tres. Quien hace cuentas las mezcla en el mismo archivo, y separarlas obligaría a tres líneas de «usar» para sacar la media de una columna — el criterio de toda la familia es el co-uso, no la disciplina académica. También es una mudanza: los mismos nombres y los mismos cuerpos que estaban en el ámbito global. Lo que NO se mudó: «maximo» y «minimo», que comparan números, texto y fechas por igual, así que son genéricos como «contiene» y se quedan en el núcleo.'],
  ['texto', 'texto',
   'Trabajar con cadenas, y con el español en serio. Ordenar en español no es ordenar por códigos Unicode: ahí la ñ cae después de la z, así que «ñandú» sale detrás de «zapato» — «ordenAlfabetico» la pone entre la n y la o, donde va, y usa la tilde solo para desempatar («el» antes de «él»). «sinAcentos» quita las tildes y DEJA la ñ, porque en español es una letra y no una n con sombrero: quitársela convertiría «año» en «ano». La excepción es «aUrl», donde una dirección web no admite la ñ, y se dice. «igualSinAcentos» y «parecido» son para encontrar al cliente que alguien escribió sin tilde. Lo que NO vive aquí: «longitud» y «contiene», que valen igual para un texto, una lista y un diccionario, así que son del núcleo; y alinear, que es presentación y vive en «formato».'],
  ['datos', 'datos',
   'Tablas con columnas, nombre y tipo. El trabajo más común fuera de la web es leer una tabla, agrupar y sumar, y hacerlo con una lista de diccionarios funciona hasta que alguien añade una columna y el «fila[3]» pasa a significar otra cosa en silencio. LO IMPORTANTE ES EL FORMATO: un CSV pierde tres cosas y no hay forma de recuperarlas — los TIPOS (todo vuelve como texto, y una columna de fechas deja de ser de fechas), los NULOS (un campo vacío y un texto vacío son el mismo campo vacío) y el ESQUEMA (un archivo con una columna de menos se lee como si estuviera bien). Así que «datos» trae el suyo, .ñdatos, que es JSON con esquema y por columnas: el tipo se declara una vez por columna en vez de adivinarse celda a celda, el nulo es el null de JSON, y hay una versión para poder cambiar el formato sin romper los archivos de antes. La ida y vuelta por «aDatos» y «deDatos» es EXACTA, fechas incluidas; la del CSV no lo es, y se ve en un caso: un NIT «0012345» vuelve como el número 12345. Una tabla no tiene orden, así que no se compara con «<»; sus verbos son «donde», «ordenarPor» y «aplicarA», y no se sobrecargan «filtrar», «mapear» ni «ordenar» del núcleo, porque su respuesta sobre una tabla habría que adivinarla. Todas las operaciones devuelven una tabla nueva.'],
  ['formato', 'formato',
   'Números y texto para que los lea una persona. Es un eDSL: sus nombres no existen hasta que un «usar» los trae, así que «numero», «moneda» o «centrar» siguen libres para quien no lo importe. La convención es la del español y no hay que pedirla: coma decimal y punto de miles, «3 lápices» y no «3 lápizs», «pan e higos» y no «pan y higos», y «enLetras» para la factura que hay que imprimir en palabras. No usa Intl, que en QuickJS no existe: todo se calcula a mano y da lo mismo en las dos máquinas.'],
  ['fecha', 'fecha',
   'El calendario, con una decisión que gobierna el resto: una fecha de Ñ NO tiene zona horaria. Es un instante del calendario —como el TIMESTAMP WITHOUT TIME ZONE de SQL—, así que lo que se escribe es lo que se lee, en cualquier máquina, sin horario de verano ni desplazamientos; solo «hoy» y «ahora» miran el reloj local, una vez. Es un tipo de la máquina y no un texto, y eso es lo que hace que «<» y «==» funcionen solos y que el verificador pare el programa que compara una fecha con un texto: como texto, «10/02» es menor que «9/01», y ahí es donde se pierden los días. Las funciones «…Entre» miden tiempo transcurrido y truncan; para días de calendario se compone: diasEntre(inicioDia(a), inicioDia(b)).'],
  ['probar', 'probar',
   'Para que Ñ se pruebe a sí mismo. Las suites del lenguaje estaban escritas en JavaScript, así que cada eDSL nuevo costaba sus cincuenta bloques de prueba en otro idioma; con esto se escriben en Ñ. Lo delicado es que una prueba que falla no se lleve el programa: una afirmación fallida es un error normal del motor, y el corredor lo recoge haciendo desde fuera el mismo desenrollado que hace «intentar» por dentro —recortar los marcos, bajar la pila, cerrar los upvalues—. Lo único que no recoge es el límite de instrucciones: si se pudiera, una prueba con un bucle infinito desactivaría la única red que hay.'],
];

// Una sección que no esté en la lista de arriba desaparece de la página sin
// decir nada, y con ella todas sus funciones. Pasó: la biblioteca creció y la
// referencia siguió publicando el catálogo de antes.
{
  const conocidas = new Set(SECCIONES.map(s => s[0]));
  const sueltas = [...new Set(inventario.filter(e => !conocidas.has(e.seccion)).map(e => e.seccion + ' (' + e.nombre + ')'))];
  if (sueltas.length) throw new Error('secciones sin sitio en la referencia: ' + sueltas.join(', '));
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const datos = SECCIONES.map(([clave, titulo, intro]) => ({
  clave, titulo, intro,
  // Un eDSL no está en el ámbito global: sin esta línea, nada de la sección
  // existe. Se enseña en la cabecera para que se vea antes de leer la primera
  // función, no escondida en la intro.
  usar: inventario.some(e => e.edsl === clave) ? `usar "${clave}"` : null,
  entradas: inventario.filter(e => e.seccion === clave).map(e => {
    const c = corridos[e.edsl ? e.edsl + '.' + e.nombre : e.nombre] || {};
    return {
      nombre: e.nombre,
      firma: e.constante ? null : e.firma,
      aridad: e.aridad,
      valor: e.constante ? e.valor : null,
      doc: e.doc || DOC[e.nombre] || '',
      ejemplo: c.src || '',
      salida: (c.out || []).join('\n'),
      efecto: (c.out || []).length ? '' : (EFECTO[e.nombre] || ''),
    };
  }),
}));

const total = datos.reduce((n, s) => n + s.entradas.length, 0);
const nFunciones = inventario.filter(e => !e.constante).length;

// Las cifras de la portada salen del motor, no de la memoria de nadie. La
// versión y la fecha son lo que convierte esta página en una línea base: sin
// ellas, dos copias de la referencia no se pueden ordenar en el tiempo.
const VERSION_LIBRO = 1;
const HOY = new Date().toISOString().slice(0, 10);
const CIFRAS = (() => {
  const m = crearMotor({ salida: () => {}, host: {} });
  let edsl = 0, enEdsl = 0, clasico = 0;
  for (const [, r] of m.vm.edsls) {
    if (r.globalDe) { clasico = r.exporta.size; continue; }
    edsl++; enEdsl += r.exporta.size;
  }
  // Con el mismo filtro que el inventario, o la portada dice 94 y la tabla 93:
  // « usar» lo emite el compilador y el léxico no puede escribirlo, así que no
  // es un nombre de la biblioteca. Dos cifras que no cuadran en la misma página
  // hacen dudar de las dos.
  const globales = [...m.vm.globals.keys()]
    .filter(k => k.indexOf('\u0000') < 0 && !k.startsWith(' '));
  return { edsl, enEdsl, clasico, globales: globales.length };
})();

// ── 2b. «--contexto»: el mismo inventario, en texto, para darle Ñ a una IA
//
//   node util/referencia.js --contexto
//
//  El problema que esto resuelve: para que otro programa —o una IA— escriba Ñ
//  hace falta un documento con los 569 nombres, su aridad, sus tipos y un uso.
//  Escrito a mano, ese documento envejece en silencio: la función cambia de
//  aridad, nadie toca el documento, y quien lo lea escribirá código que no
//  compila sin entender por qué. Pasó con una gramática EBNF que tenía
//  veintidós diferencias con el parser y nadie lo había notado.
//
//  Así que no se escribe: se genera. Cada línea de aquí sale del registro de la
//  VM, y cada ejemplo es el que se EJECUTÓ en el paso 2, con la salida que de
//  verdad imprimió. Un ejemplo que deja de correr rompe esta construcción, y el
//  documento no puede mentir sobre el motor porque es el motor quien lo dicta.
//
//  Va junto a la gramática y a los 50 ejemplos: la gramática dice cómo se
//  escribe, esto dice qué hay, y los ejemplos dicen cómo se juntan.
if (process.argv.includes('--contexto')) {
  const L = [];
  const linea = t => L.push(t);

  linea('# Ñ — LA BIBLIOTECA, NOMBRE POR NOMBRE');
  linea('#');
  linea(`# Generado por util/referencia.js --contexto el ${new Date().toISOString().slice(0, 10)}.`);
  linea('# No se edita a mano: sale del registro de la VM, y cada ejemplo es el que');
  linea('# se ejecutó al construirlo, con la salida que imprimió de verdad.');
  linea('#');
  linea('# Cómo se lee cada entrada:');
  linea('#     nombre(tipos) -> tipo        — se escribe así en Ñ: «fn f(x: real) -> texto»');
  linea('#         qué hace');
  linea('#       > el ejemplo tal como se corrió');
  linea('#         lo que imprimió');
  linea('#');
  linea('# Los nombres de un eDSL NO están disponibles de entrada: hay que traerlos');
  linea('# con el «usar» que encabeza su sección, y el «usar» es por archivo. Un');
  linea('# mismo nombre puede existir en el núcleo y en un eDSL —«color», «pares»,');
  linea('# «tabla», «ahora»— y el «usar» tapa al del núcleo.');
  linea('#');
  linea('# La SINTAXIS no está aquí: está en 00-gramatica.txt. Lo que sí conviene');
  linea('# tener a mano al leer esto:');
  linea('#   · «si» es sentencia, no hay operador ternario.');
  linea('#   · «+» no convierte: "n = " + texto(n), nunca "n = " + n.');
  linea('#   · las constantes llevan sigilo y no se cierran: |PI, |E, |INFINITO.');
  linea('#   · un «fn» es fijo; lo que se reasigna es una «var».');
  linea('#   · «->» y «:» valen igual para anotar el retorno.');
  linea('');

  // El índice primero: con 569 nombres, lo que más falta hace es saber si un
  // nombre existe y de dónde sale, antes de buscar su firma.
  linea('═══ ÍNDICE: DÓNDE VIVE CADA NOMBRE ' + '═'.repeat(44));
  linea('');
  for (const s of datos) {
    if (!s.entradas.length) continue;
    const ns = s.entradas.map(e => e.nombre).sort((a, b) => a.localeCompare(b, 'es'));
    linea(`${s.titulo}${s.usar ? '  [' + s.usar + ']' : ''} · ${ns.length}`);
    // Envueltos a 76 columnas: un índice de una línea por nombre cuesta 569
    // líneas y no se puede recorrer con la vista.
    let fila = '   ';
    for (const n of ns) {
      if ((fila + ' ' + n).length > 76) { linea(fila); fila = '   '; }
      fila += ' ' + n;
    }
    if (fila.trim()) linea(fila);
    linea('');
  }

  linea('═══ LAS ENTRADAS ' + '═'.repeat(62));

  let nEnt = 0;
  for (const s of datos) {
    if (!s.entradas.length) continue;
    linea('');
    linea('─── ' + s.titulo.toUpperCase() + ' ' + '─'.repeat(Math.max(0, 72 - s.titulo.length)));
    if (s.usar) linea('    para usarlo:  ' + s.usar + '   (o «usar a, b de "' + s.clave + '"» para traer solo lo que haga falta)');
    linea('');
    for (const e of s.entradas) {
      nEnt++;
      // Una constante no tiene firma: tiene valor. Decir «-> null» de una
      // constante es justo el tipo de ruido que hace desconfiar del documento.
      // tipoATexto da «funcion(real): texto»; aquí se escribe como se anota en
      // Ñ de verdad —«(real) -> texto»— porque «->» es sintaxis válida del
      // lenguaje y «funcion(...)» no lo es en ese sitio.
      //
      // El caso que hay que tratar aparte: para una nativa variádica o con
      // varias formas de llamarse, el motor da «funcion» a secas, sin detalle.
      // Quitarle el prefijo deja la cadena VACÍA, que es falsa, y entonces la
      // entrada caía en la rama de las constantes y salía «maximo = null». Eran
      // 197 de 569 entradas diciendo dos mentiras: ni es constante ni vale null.
      // Lo honesto es decir que admite varias formas y dejar que el ejemplo y la
      // explicación hagan el trabajo, que para eso están.
      const bruta = e.firma ? String(e.firma) : null;
      const detalle = bruta && bruta !== 'funcion'
        ? bruta.replace(/^funcion/, '').replace(/\): /, ') -> ')
        : null;
      if (detalle) linea(`${e.nombre}${detalle.startsWith('(') ? '' : ' '}${detalle}`);
      else if (bruta) linea(`${e.nombre}(…)` + (e.aridad === -1
        ? '   — admite varias formas de llamarse; mira el ejemplo'
        : `   — ${e.aridad} argumento${e.aridad === 1 ? '' : 's'}; mira el ejemplo`));
      else linea(`${e.nombre} = ${e.valor}`);
      // El doc de la biblioteca suele venir «uso — explicación»; se parte para
      // que la explicación quede sola y el uso no compita con el ejemplo real.
      if (e.doc) {
        const corte = e.doc.indexOf(' — ');
        const txt = corte > 0 ? e.doc.slice(corte + 3) : e.doc;
        for (const l of String(txt).split('\n')) if (l.trim()) linea('      ' + l.trim());
      }
      if (e.ejemplo) {
        // El «usar» de cada ejemplo se quita: la sección ya lo encabeza, y
        // repetirlo 476 veces son veinte mil tokens que no enseñan nada.
        const cuerpo = String(e.ejemplo).split('\n')
          .filter(l => !/^\s*usar\b/.test(l));
        while (cuerpo.length && !cuerpo[0].trim()) cuerpo.shift();
        while (cuerpo.length && !cuerpo[cuerpo.length - 1].trim()) cuerpo.pop();
        for (const l of cuerpo) linea('    > ' + l);
        if (e.salida) for (const l of String(e.salida).split('\n')) linea('      ' + l);
        else if (e.efecto) linea('      (' + e.efecto + ')');
      }
      linea('');
    }
  }

  linea('═'.repeat(79));
  linea(`${nEnt} entradas · ${CIFRAS.globales} globales + ${CIFRAS.enEdsl} en ${CIFRAS.edsl} eDSL`);
  linea('Todo lo de arriba salió del motor. Si una firma de aquí no cuadra con el');
  linea('motor, el que está mal es el motor: este archivo no se escribe, se genera.');

  const txt = L.join('\n') + '\n';
  const destino = R.entrega('referencia-contexto.txt');
  fs.writeFileSync(destino, txt);
  console.log(`referencia-contexto.txt · ${(txt.length / 1024).toFixed(0)} KB · ${L.length} líneas · ` +
    `${nEnt} entradas · ~${Math.round(txt.length / 3.6 / 1000)}k tokens`);
  process.exit(0);
}

// ── notas comprobadas ejecutándolas, no recordándolas
const NOTAS = [
  ['La llave abre una interpolación dentro de un texto',
   'En <code>"hola {nombre}"</code> lo de dentro de las llaves se evalúa. Para escribir una llave literal —CSS, por ejemplo— hay que escaparla: <code>estilo("p \\{ color: crimson \\}")</code>.'],
  ['La división entera y el resto se comportan como en Python',
   '<code>7 // 2</code> da 3 y <code>-7 // 2</code> da <b>−4</b>, redondeando hacia abajo; <code>-7 % 3</code> da <b>2</b>, no −1. Si vienes de C o de JavaScript, es distinto.'],
  ['Redondear parte el empate hacia arriba',
   '<code>redondear(2.5)</code> da 3 y <code>redondear(-2.5)</code> da <b>−2</b>: el empate se va siempre hacia el infinito positivo, no al par más cercano.'],
  ['Unas funciones de lista modifican y otras copian',
   'Modifican la lista que reciben: <code>agregar</code>, <code>quitar</code>, <code>quitarEn</code>, <code>insertar</code>, y <code>borrar</code> sobre diccionarios. Devuelven una lista nueva y dejan la original intacta: <code>ordenar</code>, <code>invertir</code>, <code>mapear</code>, <code>filtrar</code>, <code>rebanar</code>, <code>aplanar</code>, <code>copiar</code>.'],
  ['Las funciones de número variable de argumentos no se comprueban',
   'Las que aparecen con la firma escueta <code>funcion</code> aceptan un número variable de argumentos, y por eso el verificador de tipos no puede mirar lo que les pasas. <code>maximo("a", 1, [2])</code> devuelve <code>"a"</code> sin protestar. Con el resto, un tipo equivocado se para antes de ejecutar.'],
  ['Los fallos se pueden atrapar',
   '<code>intentar { … } capturar (e) { … } finalmente { … }</code>. <code>lanzar</code> admite cualquier valor; los errores del motor llegan como un valor de tipo <code>error</code> con <code>e.tipo</code>, <code>e.mensaje</code> y <code>e.linea</code>. El <code>finalmente</code> corre también cuando se sale por <code>devolver</code>, <code>romper</code> o <code>continuar</code>. Lo único que no se puede capturar es el límite de instrucciones: es la red que corta los bucles infinitos.'],
  ['Una función con intentar no la compila el JIT',
   'El JIT traduce a JavaScript desde el árbol sintáctico y no cubre el desenrollado, así que rechaza esas funciones y se quedan en el intérprete. Dan el mismo resultado, más despacio. Si una función es el punto caliente del programa, conviene dejar el <code>intentar</code> fuera de ella.'],
  ['La página se construye como un árbol de valores',
   '<code>etiqueta()</code>, <code>boton()</code>, <code>entrada()</code>, <code>tabla()</code> y <code>crudo()</code> no pintan: devuelven un valor de tipo <code>nodo</code> que se guarda en variables y se anida. Solo <code>pintar()</code> toca la página. Una función que devuelve <code>nodo</code> es un componente, y el verificador comprueba que de verdad lo devuelva.'],
  ['Lo que entra por el árbol es dato, nunca marcado',
   'El texto que pasa por <code>etiqueta()</code> o <code>tabla()</code> se pinta como texto: un nombre que contenga <code>&lt;b&gt;</code> se ve con sus signos. Los atributos que empiezan por <code>on</code> y las direcciones <code>javascript:</code> se rechazan. Para meter HTML a propósito está <code>crudo()</code>, y se nota al leer el programa.'],
  ['La igualdad compara en profundidad',
   '<code>[1, 2] == [1, 2]</code> es cierto, y lo mismo con diccionarios. Las listas que se contienen a sí mismas también se comparan bien, sin colgarse.'],
  ['El texto se indexa como una lista',
   '<code>"hola"[1]</code> da <code>"o"</code>. Las posiciones empiezan en 0 y cuentan caracteres, no bytes.'],
];

const filas = datos.map(s => `
  <section class="sec" id="s-${s.clave}">
    <div class="sec-cab">
      <h2>${esc(s.titulo)}</h2>
      ${s.usar ? `<code class="usar-edsl">${esc(s.usar)}</code>` : ''}
      <span class="cuenta">${s.entradas.length}</span>
    </div>
    <p class="sec-intro">${esc(s.intro)}</p>
    ${s.entradas.map(e => `
    <article class="ent" id="fn-${esc(e.nombre)}" data-busca="${esc((e.nombre + ' ' + (e.firma || '') + ' ' + e.doc + ' ' + e.ejemplo).toLowerCase())}">
      <div class="ent-cab">
        <h3>${esc(e.nombre)}</h3>
        ${e.firma ? `<code class="firma">${e.firma === 'funcion'
              ? '<span class="variadica" title="número variable de argumentos: el verificador de tipos no la comprueba">(…)</span>'
              : esc(e.firma.replace(/^funcion/, ''))}</code>`
                  : `<span class="etq-const">constante</span><code class="firma">${esc(e.valor)}</code>`}
      </div>
      ${e.doc ? `<p class="doc">${esc(e.doc).replace(/·/g, '<span class="punto">·</span>')}</p>` : ''}
      <div class="caja">
        <pre class="cod"><code>${esc(e.ejemplo)}</code></pre>
        ${e.salida
          ? `<div class="sal"><span class="et">imprime</span><pre><code>${esc(e.salida)}</code></pre></div>`
          : `<div class="sal efecto"><span class="et">hace</span><p>${esc(e.efecto || 'nada visible en la consola')}</p></div>`}
      </div>
    </article>`).join('')}
  </section>`).join('');

const indice = datos.map(s =>
  `<li><a href="#s-${s.clave}">${esc(s.titulo)}<span>${s.entradas.length}</span></a></li>`).join('');

// El mapa de los eDSL, en la portada. Es lo que le falta a un catálogo para que
// alguien que no conoce el lenguaje entienda por qué está partido: la lista de
// 452 funciones no lo dice, y la intro de cada área se lee cuando ya bajaste.
const MAPA = (() => {
  const filas = SECCIONES
    .filter(([clave]) => inventario.some(e => e.edsl === clave))
    .map(([clave, , intro]) => {
      const n = inventario.filter(e => e.edsl === clave).length;
      // La primera frase de la intro: la que dice para qué existe.
      const corta = String(intro).split(/(?<=\.)\s/)[0];
      return `<tr><td><code>usar "${clave}"</code></td><td>${n}</td><td>${esc(corta)}</td></tr>`;
    }).join('');
  return `
    <div class="mapa">
      <h2>Los ${CIFRAS.edsl} eDSL, y por qué existen</h2>
      <p>Si haces cuentas no tienes por qué saber el vocabulario de la web, ni al contrario. Un eDSL
        se gana el sitio cuando quita una clase de error, no cuando ahorra teclas. El
        <code>usar</code> es por archivo, así que dos programas del mismo proyecto pueden tener
        vocabularios distintos.</p>
      <table>${filas}</table>
      <p class="pie-mapa">Y tres constantes están siempre, sin ningún <code>usar</code>, con un
        sigilo delante para que ningún programa pueda declararlas ni taparlas:
        <code>|PI</code>, <code>|E</code>, <code>|INFINITO</code>. Para lo de antes,
        <code>usar "clasico"</code> en la primera línea devuelve al ámbito global los
        ${CIFRAS.clasico} nombres que lo eran.</p>
    </div>`;
})();

// El bloque de «qué cambió», solo si hay base y algo cambió. Si no hay nada que
// decir no sale nada: una sección vacía que aparece en cada versión enseña a no
// mirarla, y entonces el día que diga algo tampoco se mira.
const BLOQUE_CAMBIOS = (() => {
  if (!cambios.base) return '';
  const n = cambios.nuevos.length + cambios.idos.length + cambios.cambiados.length;
  if (!n) return `
  <section class="cambios igual">
    <h2>Sin cambios desde la base</h2>
    <p>Los ${cambios.base.filas} nombres de <code>inventario.ñdatos</code> son exactamente los de
      hoy, con las mismas firmas.</p>
  </section>`;
  const lista = (t, xs, c) => xs.length ? `<div class="grupo ${c}"><h3>${t} · ${xs.length}</h3><ul>` +
    xs.map(x => `<li><code>${esc(x)}</code></li>`).join('') + '</ul></div>' : '';
  return `
  <section class="cambios">
    <h2>Qué cambió desde la base</h2>
    <p>Comparado contra los ${cambios.base.filas} nombres sellados en
      <code>motor/inventario.ñdatos</code>. Para fijar el estado de hoy como nueva base:
      <code>node util/referencia.js --sellar</code>.</p>
    ${lista('Nombres nuevos', cambios.nuevos, 'nuevo')}
    ${lista('Nombres que ya no están', cambios.idos, 'ido')}
    ${lista('Misma función, otra firma', cambios.cambiados, 'cambiado')}
  </section>`;
})();

const html = `<title>Biblioteca de Español-Like</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
:root{
  color-scheme: light;
  --papel:#F3F2F7; --tarjeta:#FFFFFF; --hundido:#ECEBF3;
  --tinta:#17161F; --tinta-2:#434254; --suave:#6C6B80;
  --linea:#E1E0EB; --linea-2:#CFCEDD;
  --acento:#4F3FD4; --acento-suave:#EEEBFF;
  --salida:#15704A; --salida-fondo:#E9F5EE;
  --aviso:#8A5800;
  --codigo-fondo:#1A1926; --codigo-tinta:#E6E4F2; --codigo-suave:#9A97B8;
  --ui:"Public Sans", system-ui, -apple-system, sans-serif;
  --disp:"Fraunces", Georgia, serif;
  --mono:"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --papel:#0E0E14; --tarjeta:#16161F; --hundido:#1D1D28;
    --tinta:#EDECF5; --tinta-2:#C2C1D4; --suave:#8B8AA2;
    --linea:#25252F; --linea-2:#343444;
    --acento:#A093FF; --acento-suave:#221E3D;
    --salida:#63CC91; --salida-fondo:#122A1E;
    --aviso:#DCA744;
    --codigo-fondo:#101019; --codigo-tinta:#E6E4F2; --codigo-suave:#807EA0;
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --papel:#0E0E14; --tarjeta:#16161F; --hundido:#1D1D28;
  --tinta:#EDECF5; --tinta-2:#C2C1D4; --suave:#8B8AA2;
  --linea:#25252F; --linea-2:#343444;
  --acento:#A093FF; --acento-suave:#221E3D;
  --salida:#63CC91; --salida-fondo:#122A1E;
  --aviso:#DCA744;
  --codigo-fondo:#101019; --codigo-tinta:#E6E4F2; --codigo-suave:#807EA0;
}
*{box-sizing:border-box}
body{margin:0; background:var(--papel); color:var(--tinta); font-family:var(--ui);
  font-size:15px; line-height:1.55; -webkit-font-smoothing:antialiased}

.envoltura{max-width:1180px; margin:0 auto; padding-inline:20px; padding-block:0 64px}

/* ── portada ───────────────────────────────────────────────── */
header.portada{padding-block:56px 30px; border-bottom:2px solid var(--tinta); margin-bottom:34px}
.sello{font-family:var(--mono); font-size:11.5px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--acento); font-weight:700; margin:0 0 14px}
h1{font-family:var(--disp); font-variation-settings:"opsz" 120, "SOFT" 0; font-weight:600;
  font-size:clamp(34px, 7vw, 60px); line-height:1.02; letter-spacing:-.02em; margin:0 0 16px;
  text-wrap:balance}
.bajada{font-size:17px; color:var(--tinta-2); max-width:62ch; margin:0 0 22px; line-height:1.6}
.bajada code{font-family:var(--mono); font-size:.86em; background:var(--hundido); padding:1px 5px; border-radius:4px}
.cifras{display:flex; flex-wrap:wrap; gap:26px; font-family:var(--mono); font-size:12.5px; color:var(--suave)}
.cifras b{display:block; font-size:24px; color:var(--tinta); font-weight:700; font-variant-numeric:tabular-nums}

/* ── disposición ───────────────────────────────────────────── */
.cuerpo{display:grid; grid-template-columns:210px minmax(0,1fr); gap:44px; align-items:start}
/* Los hijos de una rejilla arrancan con min-width:auto, así que un bloque de
   código ancho estira la columna y el documento entero se va de lado. */
.cuerpo > *{min-width:0}
nav.rail{position:sticky; top:calc(env(safe-area-inset-top, 0px) + 16px); align-self:start}
.buscar{width:100%; font:500 14px/1.4 var(--ui); color:var(--tinta);
  background:var(--tarjeta); border:1px solid var(--linea-2); border-radius:9px;
  padding:9px 12px; margin-bottom:6px}
.buscar:focus{outline:2px solid var(--acento); outline-offset:1px; border-color:transparent}
.hallados{font-family:var(--mono); font-size:11.5px; color:var(--suave); min-height:18px; margin-bottom:14px}
nav.rail ul{list-style:none; margin:0; padding:0}
nav.rail a{display:flex; justify-content:space-between; align-items:baseline; gap:8px;
  text-decoration:none; color:var(--tinta-2); font-size:13.5px; font-weight:500;
  padding:5px 8px; border-radius:7px; border-left:2px solid transparent}
nav.rail a:hover{background:var(--acento-suave); color:var(--acento); border-left-color:var(--acento)}
nav.rail a span{font-family:var(--mono); font-size:11px; color:var(--suave); font-variant-numeric:tabular-nums}

/* ── secciones ─────────────────────────────────────────────── */
.sec{margin-bottom:46px; scroll-margin-top:20px}
.sec-cab{display:flex; align-items:baseline; gap:12px; border-bottom:1px solid var(--tinta);
  padding-bottom:7px}
.usar-edsl{font-family:var(--mono); font-size:12.5px; padding:3px 9px; border-radius:6px;
  background:var(--acento-suave); color:var(--acento); border:1px solid var(--acento);
  white-space:nowrap}
.sec-cab h2{font-family:var(--disp); font-variation-settings:"opsz" 40; font-weight:600;
  font-size:27px; margin:0; letter-spacing:-.01em}
.cuenta{font-family:var(--mono); font-size:12px; color:var(--suave); font-variant-numeric:tabular-nums}
.sec-intro{color:var(--suave); font-size:14px; margin:10px 0 22px; max-width:66ch}

/* ── entradas ──────────────────────────────────────────────── */
.ent{padding:18px 0; border-bottom:1px solid var(--linea); scroll-margin-top:20px}
.ent:last-child{border-bottom:none}
.ent-cab{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
.ent-cab h3{font-family:var(--mono); font-weight:700; font-size:16px; margin:0; color:var(--acento)}
.firma{font-family:var(--mono); font-size:12.5px; color:var(--suave); word-break:break-word}
.variadica{color:var(--aviso); cursor:help; border-bottom:1px dotted currentColor}
.etq-const{font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--aviso); border:1px solid currentColor; border-radius:999px; padding:1px 7px; font-weight:700}
.doc{margin:5px 0 12px; color:var(--tinta-2); font-size:14.5px; max-width:70ch}
.punto{color:var(--linea-2); padding:0 2px}

.caja{border:1px solid var(--linea-2); border-radius:10px; overflow:hidden; max-width:840px; min-width:0}
pre{margin:0; overflow-x:auto}
.cod{background:var(--codigo-fondo); color:var(--codigo-tinta); padding:12px 14px}
.cod code{font-family:var(--mono); font-size:12.5px; line-height:1.65; white-space:pre}
.sal{display:flex; gap:12px; align-items:flex-start; min-width:0; background:var(--salida-fondo);
  border-top:1px solid var(--linea-2); padding:10px 14px}
.sal .et{font-family:var(--mono); font-size:10px; letter-spacing:.09em; text-transform:uppercase;
  color:var(--salida); font-weight:700; padding-top:3px; flex:none}
.sal pre{min-width:0; flex:1}
.sal pre code{font-family:var(--mono); font-size:12.5px; color:var(--salida); white-space:pre-wrap;
  word-break:break-word}
.sal.efecto{background:var(--hundido)}
.sal.efecto .et{color:var(--suave)}
.sal.efecto p{margin:0; font-size:13.5px; color:var(--tinta-2)}

/* ── notas ─────────────────────────────────────────────────── */
.cambios{background:var(--tarjeta);border:1px solid var(--linea);border-radius:14px;padding:22px 24px;margin:0 0 28px}
.cambios h2{font-family:var(--disp);font-size:22px;margin:0 0 6px}
.cambios>p{color:var(--suave);font-size:14px;margin:0 0 16px;max-width:62ch}
.cambios.igual{border-color:var(--linea)}
.cambios .grupo{margin:0 0 14px}
.cambios .grupo h3{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--suave);margin:0 0 8px}
.cambios .grupo ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}
.cambios .grupo li{margin:0}
.cambios .grupo code{font-family:var(--mono);font-size:12.5px;background:var(--hundido);border:1px solid var(--linea);border-radius:6px;padding:3px 8px;display:inline-block}
.cambios .nuevo code{background:var(--salida-fondo);border-color:transparent;color:var(--salida)}
.cambios .ido code{background:var(--acento-suave);border-color:transparent;color:var(--acento)}
.portada .base{color:var(--suave);font-size:13.5px;max-width:70ch;margin:18px 0 0;line-height:1.6}
.mapa{margin:26px 0 0;padding:20px 22px;background:var(--hundido);border-radius:14px}
.mapa h2{font-family:var(--disp);font-size:20px;margin:0 0 8px}
.mapa>p{color:var(--tinta-2);font-size:14px;margin:0 0 16px;max-width:70ch;line-height:1.6}
.mapa table{border-collapse:collapse;width:100%;font-size:13.5px}
.mapa td{border-top:1px solid var(--linea);padding:9px 10px 9px 0;vertical-align:top;color:var(--tinta-2)}
.mapa tr:first-child td{border-top:none}
.mapa td:first-child{white-space:nowrap;width:1%}
.mapa td:nth-child(2){text-align:right;font-family:var(--mono);color:var(--suave);width:1%;padding-right:16px}
.mapa code{font-family:var(--mono);font-size:12.5px;background:var(--tarjeta);border:1px solid var(--linea);border-radius:6px;padding:2px 7px}
.mapa .pie-mapa{color:var(--suave);font-size:13px;margin:16px 0 0;max-width:70ch;line-height:1.6}
@media (max-width:640px){.mapa td{display:block;border-top:none;padding:2px 0}.mapa tr{display:block;border-top:1px solid var(--linea);padding:10px 0}.mapa td:nth-child(2){text-align:left}}
.notas{margin-top:56px; padding-top:30px; border-top:2px solid var(--tinta)}
.notas h2{font-family:var(--disp); font-variation-settings:"opsz" 40; font-weight:600;
  font-size:27px; margin:0 0 6px}
.notas > p{color:var(--suave); font-size:14px; margin:0 0 24px; max-width:66ch}
.nota{padding:16px 0; border-bottom:1px solid var(--linea)}
.nota:last-child{border-bottom:none}
.nota h3{font-family:var(--ui); font-size:15.5px; font-weight:700; margin:0 0 5px}
.nota p{margin:0; color:var(--tinta-2); font-size:14.5px; max-width:74ch}
.nota code{font-family:var(--mono); font-size:.87em; background:var(--hundido);
  padding:1.5px 5px; border-radius:4px; color:var(--tinta)}

.pie{margin-top:46px; padding-top:20px; border-top:1px solid var(--linea);
  font-size:13px; color:var(--suave); max-width:70ch}
.pie code{font-family:var(--mono); font-size:.9em}

.ent[hidden], .sec[hidden]{display:none}

@media (max-width:860px){
  .cuerpo{grid-template-columns:1fr; gap:24px}
  nav.rail{position:static}
  nav.rail ul{display:flex; flex-wrap:wrap; gap:4px}
  nav.rail a{border-left:none; border:1px solid var(--linea-2)}
  header.portada{padding-block:36px 24px}
}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}
</style>

<div class="envoltura">
  <header class="portada">
    <p class="sello">Ñ · biblioteca base v${VERSION_LIBRO} · ${HOY}</p>
    <h1>Biblioteca estándar</h1>
    <p class="bajada">Todo lo que el lenguaje trae puesto: ${nFunciones} funciones y 3 constantes.
      <strong>No están todas en el ámbito global</strong>, y eso es lo primero que hay que saber:
      ${CIFRAS.globales} nombres se pueden usar sin más, y los otros ${CIFRAS.enEdsl} viven en
      ${CIFRAS.edsl} eDSL que hay que pedir con un <code>usar</code> —la línea exacta está en la
      cabecera de cada área—. Cada entrada lleva su firma tal y como la ve el verificador de tipos,
      un ejemplo, y <strong>la salida que ese ejemplo produjo de verdad</strong> al ejecutarlo contra
      el motor. Nada de esta página está escrito de memoria.</p>
    <div class="cifras">
      <div><b>${total}</b>entradas</div>
      <div><b>${CIFRAS.globales}</b>globales</div>
      <div><b>${CIFRAS.edsl}</b>eDSL</div>
      <div><b>${total}</b>ejemplos ejecutados</div>
      <div><b>0</b>dependencias</div>
    </div>
    <p class="base">Esta es la <b>versión base</b>: el inventario de hoy está sellado en
      <code>motor/inventario.ñdatos</code>, en el formato del eDSL <code>datos</code>, así que se
      puede abrir con <code>deDatos</code> y consultarlo desde un programa en Ñ. La próxima vez que
      se genere esta página se comparará contra él y dirá qué entró, qué se fue y a qué le cambió la
      firma.</p>
    ${MAPA}
  </header>${BLOQUE_CAMBIOS}

  <div class="cuerpo">
    <nav class="rail" aria-label="Índice">
      <input class="buscar" id="buscar" type="search" placeholder="Filtrar…" aria-label="Filtrar funciones" autocomplete="off">
      <p class="hallados" id="hallados"></p>
      <ul>${indice}</ul>
    </nav>
    <main id="lista">
      ${filas}
      <section class="notas">
        <h2>Cosas que conviene saber</h2>
        <p>Todas salieron de ejecutar el motor mientras se armaba esta página, no de suponerlas.</p>
        ${NOTAS.map(([t, d]) => `<div class="nota"><h3>${esc(t)}</h3><p>${d}</p></div>`).join('')}
      </section>
      <p class="pie">Generada con <code>util/referencia.js</code> a partir del registro de globales
        del motor, los textos de ayuda que viajan con cada función y la salida de
        <code>util/ejemplos-biblioteca.js</code>. Si falta un ejemplo, o si uno deja de correr, la
        generación <b>falla</b> y no sale página: por eso los ${total} ejemplos son también una
        segunda batería de pruebas.</p>
    </main>
  </div>
</div>

<script>
(function(){
  const caja = document.getElementById('buscar');
  const hallados = document.getElementById('hallados');
  const entradas = Array.from(document.querySelectorAll('.ent'));
  const secciones = Array.from(document.querySelectorAll('.sec'));
  const total = entradas.length;

  function filtrar(){
    const q = caja.value.trim().toLowerCase();
    if (!q) {
      for (const e of entradas) e.hidden = false;
      for (const s of secciones) s.hidden = false;
      hallados.textContent = total + ' entradas';
      return;
    }
    let n = 0;
    for (const e of entradas) {
      const cabe = e.dataset.busca.includes(q);
      e.hidden = !cabe;
      if (cabe) n++;
    }
    for (const s of secciones) s.hidden = !s.querySelector('.ent:not([hidden])');
    hallados.textContent = n === 0 ? 'nada con «' + q + '»' : n + (n === 1 ? ' entrada' : ' entradas');
  }
  caja.addEventListener('input', filtrar);
  caja.addEventListener('keydown', e => { if (e.key === 'Escape') { caja.value = ''; filtrar(); } });
  filtrar();
})();
</script>
`;

// Igual que el IDE: la copia de disco necesita declarar su codificación.
fs.writeFileSync(R.motor + '/publicar-referencia.html', html);
{
  const corte = html.indexOf('</style>') + '</style>'.length;
  fs.writeFileSync(R.entrega('referencia-stdlib.html'),
    '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    html.slice(0, corte) + '\n</head>\n<body>' + html.slice(corte) + '\n</body>\n</html>\n');
}
console.log('referencia-stdlib.html ·', (html.length / 1024).toFixed(0), 'KB ·', total, 'entradas');
console.log(`base v${VERSION_LIBRO} · ${HOY} · ${CIFRAS.globales} globales + ${CIFRAS.enEdsl} en ${CIFRAS.edsl} eDSL`);

// ── el sello: la línea base, en el formato del propio lenguaje ───────────────
{
  const n = cambios.nuevos.length + cambios.idos.length + cambios.cambiados.length;
  if (!cambios.base) {
    console.log('no hay base con la que comparar · «--sellar» crea la primera');
  } else if (!n) {
    console.log(`sin cambios desde la base (${cambios.base.filas} nombres)`);
  } else {
    console.log(`\ncambios desde la base de ${cambios.base.fecha || '¿cuándo?'}:`);
    const di = (t, xs) => { if (xs.length) console.log(`  ${t} (${xs.length}): ${xs.join(', ')}`); };
    di('nuevos', cambios.nuevos);
    di('ya no están', cambios.idos);
    di('otra firma', cambios.cambiados);
    if (!SELLAR) console.log('  (para fijar esto como la nueva base: --sellar)');
  }
  if (SELLAR) {
    const cuerpo = aNdatos(inventario);
    // La fecha y la versión van DENTRO del archivo, no en su nombre: un archivo
    // que hay que renombrar a mano para versionarlo se queda sin versionar.
    const conSello = cuerpo.replace('{\n "ñdatos": 1,',
      `{\n "ñdatos": 1,\n "version": ${VERSION_LIBRO},\n "fecha": ${JSON.stringify(HOY)},`);
    fs.writeFileSync(RUTA_INV, conSello);
    console.log(`sellado · inventario.ñdatos · ${inventario.length} nombres`);
  }
}
