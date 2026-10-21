// ============================================================================
//  ESPAÑOL-LIKE v4 — Biblioteca estándar y fachada del motor
//  Parte 4 de 4.
// ============================================================================
'use strict';

function instalarBiblioteca(vm, host) {
  let cuerpoCorrutinas = null;     // (motor-exp) se llena abajo; se instala como eDSL
  let cuerpoNativo = null;         // (motor-exp, S1) ídem, el eDSL «nativo»
  let cuerpoSistema = null;        // (motor-exp, S2) ídem, el eDSL «sistema»
  // (motor-exp, S1) Lo que llega de fuera cuando ya no corre nada —una llamada
  // nativa en segundo plano que acaba, una retrollamada registrada que C
  // dispara— es un turno nuevo, como un clic. Si falla, el anfitrión decide
  // cómo enseñarlo (la consola lo imprime); si no dice nada, se lanza.
  const errorDeTurno = e => { if (host.errorEnTurno) host.errorEnTurno(e); else throw e; };
  const enTurno = f => { vm.nuevoTurno(); try { f(); } catch (e) { errorDeTurno(e); } };
  host = host || {};
  vm.edsls = new Map();          // nombre del eDSL → { nombre, clave, exporta }
  vm.edslPorClave = new Map();   // clave          → el mismo registro
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  // Los validadores viven en la VM, no aquí: la biblioteca y los eDSL tienen que
  // dar el MISMO mensaje cuando un argumento no es del tipo que toca.
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);
  const nums = (v, n, f) => vm.exigeNums(v, n, f);
  const def = (n, fir, fn, doc) => vm.definirNativa(n, fir, fn, doc);
  // El área a la que pertenece lo que se declara a partir de aquí. La usa la
  // página de referencia para agrupar, y antes la adivinaba leyendo estos
  // comentarios con una expresión regular: cualquier ayudante nuevo hacía
  // desaparecer funciones del catálogo. Ahora la sección viaja con el nombre.
  const seccion = s => { vm.seccionActual = s; };

  // ------------------------------------------------------------------ núcleo
  seccion('núcleo');
  def('imprimir', '... -> nulo', (a) => { vm.salida(a.map(x => repr(x, 0)).join(' ')); return null; }, 'imprime valores en la consola');
  def('texto', 'cualquiera -> texto', (a) => repr(a[0], 1) === 'nulo' && a[0] === null ? 'nulo' : (typeof a[0] === 'string' ? a[0] : repr(a[0], 1)), 'convierte cualquier valor a texto');
  def('entero', 'cualquiera -> entero', (a) => {
    const v = a[0];
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = parseInt(v.trim(), 10); if (Number.isNaN(n)) vm.error(`«entero»: «${v}» no es un número`); return n; }
    // (motor-exp N1) de un grande: la parte entera, si cabe en un entero de Ñ
    if (v instanceof ObjGrande) {
      const n = Number(grAEnteroBig(v));
      if (!Number.isSafeInteger(n)) vm.error(`«entero»: ${grATexto(v, 20)} no cabe en un entero (el máximo exacto es 2^53)`,
        'déjalo como grande, o sácalo como texto con cifrasExactas(g)');
      return n;
    }
    vm.error(`«entero»: no se puede convertir ${tipoDe(v)}`);
  }, 'convierte a número entero');
  def('real', 'cualquiera -> real', (a) => {
    const v = a[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = parseFloat(v.trim()); if (Number.isNaN(n)) vm.error(`«real»: «${v}» no es un número`); return n; }
    if (v instanceof ObjGrande) return grAReal(v);          // (motor-exp N1) el real más cercano
    vm.error(`«real»: no se puede convertir ${tipoDe(v)}`);
  }, 'convierte a número con decimales');
  def('bool', 'cualquiera -> bool', (a) => verdad(a[0]), 'convierte a verdadero/falso');
  def('tipo', 'cualquiera -> texto', (a) => (a[0] instanceof ObjDic && a[0].tipoReg ? a[0].tipoReg.nombre : tipoDe(a[0])), 'devuelve el nombre del tipo');
  // Lleva firma como toda nativa (la prueba «ninguna nativa sin firma»).
  if (!FALTANTE.firma) { FALTANTE.firma = firma('-> nulo'); FALTANTE.firmaTxt = '-> nulo'; }
  vm.globals.set(' faltante', FALTANTE);

  // (motor-exp) corrutinas. « producir» y « esperar» los emite el compilador.
  const corrutinaActual = () => vm.corrutinas.length ? vm.corrutinas[vm.corrutinas.length - 1] : null;
  def(' producir', 'cualquiera -> nulo', a => {
    const g = corrutinaActual();
    if (!g || g.asincrono) vm.error('«producir» solo funciona dentro de un generador que alguien esté recorriendo');
    vm.pausa = { valor: a[0] };
    return null;
  });
  def(' esperar', 'cualquiera -> cualquiera', a => {
    const g = corrutinaActual();
    if (!g || !g.asincrono) vm.error('«esperar» solo funciona dentro de una función asíncrona');
    vm.pausa = { valor: a[0] };
    return null;
  });
  // Los ayudantes van en un eDSL, «usar siguiente, recoger de "corrutinas"»,
  // y no en el ámbito global: un nombre global nuevo rompe a quien ya tenía
  // una función con ese nombre (pasó: «todas» en 20-contador-palabras.txt y
  // «siguiente» en 28-dias-habiles.txt). Solo «pedir» sin función es global.
  cuerpoCorrutinas = def => {
  const gen = (v, n, f) => { if (!(v instanceof ObjGenerador) || v.asincrono) vm.error(`«${f}»: el argumento ${n} debe ser un generador y es ${tipoDe(v)}`); return v; };
  def('siguiente', '... -> cualquiera', a => {
    if (a.length < 1 || a.length > 2) vm.error('«siguiente» acepta el generador y, si quieres, el valor para cuando se acabe');
    const g = gen(a[0], 1, 'siguiente');
    return vm.genAvanzar(g) ? g.actual : (a.length > 1 ? a[1] : null);
  }, 'siguiente(g, siSeAcaba?) — el próximo valor del generador; si ya no hay, siSeAcaba (o nulo)');
  def('terminado', 'cualquiera -> bool', a => {
    const v = a[0];
    if (v instanceof ObjGenerador) return v.estado === 'terminado';
    if (v instanceof ObjPromesa) return v.estado !== 'pendiente';
    vm.error(`«terminado»: necesita un generador o una promesa y recibió ${tipoDe(v)}`);
  }, 'terminado(g) — si el generador ya no da más, o si la promesa ya está lista');
  def('recoger', 'cualquiera -> lista', a => {
    const g = gen(a[0], 1, 'recoger');
    const out = [];
    while (vm.genAvanzar(g)) { out.push(g.actual); vm.cobrar(1); }
    return L(out);
  }, 'recoger(g) — todos los valores que queden en el generador, en una lista');
  def('dormir', 'real -> cualquiera', a => {
    if (!host.tiempo) vm.error('«dormir» necesita un anfitrión con reloj', 'está en el IDE y en las aplicaciones exportadas');
    const ms = vm.exigeNum(a[0], 1, 'dormir');
    const p = vm.registrar(new ObjPromesa());
    host.tiempo.luego(ms, new ObjNativa(' despertar', 0, () => { vm.cumplir(p, null, true); return null; }), vm);
    return p;
  }, 'dormir(ms) — una promesa que se cumple pasado ese tiempo: «esperar dormir(500)»');
  def('todas', 'lista -> cualquiera', a => {
    const ps = lst(a[0], 1, 'todas').items;
    const p = vm.registrar(new ObjPromesa());
    const res = new Array(ps.length);
    let faltan = ps.length;
    if (!faltan) { vm.cumplir(p, L([]), true); return p; }
    ps.forEach((x, i) => {
      const listo = (ok, v) => {
        if (p.estado !== 'pendiente') return;
        if (!ok) { vm.cumplir(p, v, false); return; }
        res[i] = v;
        if (--faltan === 0) vm.cumplir(p, L(res), true);
      };
      if (x instanceof ObjPromesa) { x.vista = true; if (x.estado === 'pendiente') x.esperando.push(listo); else listo(x.estado === 'cumplida', x.valor); }
      else listo(true, x);
    });
    return p;
  }, 'todas(promesas) — una promesa con la lista de resultados, cuando estén todas');
  };
  // (motor-exp) Lo que hay detrás de «tipo Punto { x, y }». La llama el
  // compilador, no el programa: el nombre lleva un espacio y no se puede
  // escribir. Devuelve el constructor, que queda como el global «Punto».
  def(' registro', 'texto, lista, dic -> cualquiera', a => {
    const desc = { nombre: a[0], campos: a[1].items.slice(), metodos: new Map(a[2].mapa) };
    const n = desc.campos.length;
    const ctor = new ObjNativa(desc.nombre, n, (args) => {
      const d = vm.nuevoDic();
      d.tipoReg = desc;
      for (let i = 0; i < n; i++) d.mapa.set(desc.campos[i], args[i]);
      return d;
    }, `${desc.nombre}(${desc.campos.join(', ')}) — crea un ${desc.nombre}`);
    ctor.registro = desc;
    return ctor;
  });
  def('longitud', 'cualquiera -> entero', (a) => vm.longitud(a[0]), 'longitud de un texto, lista o diccionario');
  def('rango', '... -> lista<entero>', (a) => {
    // La validación vive en la VM (vm.prepararRango) porque el JIT la necesita
    // igual: «para i en rango(n)» compilado no construye la lista, pero tiene
    // que dar exactamente los mismos errores que si la construyera.
    const { ini, fin, paso, cuantos } = vm.prepararRango(a);
    const out = new Array(cuantos);
    let n = 0;
    if (paso > 0) for (let i = ini; i < fin; i += paso) out[n++] = i;
    else for (let i = ini; i > fin; i += paso) out[n++] = i;
    out.length = n;
    return L(out);
  }, 'rango(n) · rango(ini,fin) · rango(ini,fin,paso)');
  // Marcas para el JIT (motor-exp): son ESTAS funciones y no otras con el
  // mismo nombre. Si un programa las tapa con su propio «fn», la marca no está
  // y el JIT no toma el atajo.
  vm.globals.get('rango').puro = 'rango';
  def('afirmar', '... -> nulo', (a) => {
    if (!verdad(a[0])) vm.error(a.length > 1 ? repr(a[1], 0) : 'la afirmación resultó falsa');
    return null;
  }, 'afirmar(cond, mensaje)');

  // ------------------------------------------------------------ matemáticas
  seccion('constantes');
  // Las constantes del lenguaje, con el sigilo «|». Están SIEMPRE, sin «usar»:
  // como un programa no puede declarar un nombre con «|», no hay nada que
  // tapar ni con qué confundirlas, así que no ensucian el ámbito de nadie.
  //
  // «E» a secas era lo que había antes, y era un accidente esperando: «var E:
  // real = 5» lo tapaba en silencio y el número de Euler pasaba a ser 5.
  vm.definirValor('|PI', Math.PI, 'real');
  vm.definirValor('|E', Math.E, 'real');
  vm.definirValor('|INFINITO', Infinity, 'real');
  // ------------------------------------------------------------------ núcleo
  // «maximo» y «minimo» NO se mudan a «numerico»: comparan números, texto y
  // fechas por igual, así que son genéricos como «contiene» y «longitud».
  seccion('núcleo');
  // Lo que se puede ordenar: todo números, todo texto o todo fechas. Mezclar no,
  // porque «maximo([1, "a"])» no tiene una respuesta correcta. Antes solo
  // aceptaba números en la forma de lista pero sí comparaba fechas en la forma
  // de argumentos sueltos, y esa diferencia no la esperaría nadie.
  const ordenables = (v, f) => {
    const l = lst(v, 1, f);
    const t = l.items.length ? tipoDe(l.items[0]) : 'entero';
    const clase = x => (typeof x === 'number' ? 'num' : typeof x === 'string' ? 'texto' : tipoDe(x));
    const c0 = clase(l.items[0]);
    for (const x of l.items) if (clase(x) !== c0 || !['num', 'texto', 'fecha'].includes(clase(x)))
      vm.error(`«${f}»: la lista tiene que ser toda de números, toda de texto o toda de fechas`);
    return l.items;
  };
  // Con un arreglo, reducen todo y dan un número; con un eje, dan un arreglo con
  // ese eje quitado. Es la misma forma que tienen todas las reducciones de
  // NumPy, y la razón de que «maximo(m, 0)» signifique «el máximo de cada
  // columna» sin que haya que escribir un bucle.
  const reduceArr = (quien, mejor) => (a) => {
    const x = a[0];
    if (!(x instanceof ObjArreglo)) return null;
    if (x.tamano === 0) vm.error(`«${quien}» de un arreglo vacío`);
    const eje = a.length > 1 ? a[1] : null;
    return vm.arrReducir(x, eje, null, (acc, v) => (acc === null || mejor(v, acc) ? v : acc), null,
      x.tipo === 'entero' ? 'entero' : 'real');
  };
  const maxArr = reduceArr('maximo', (v, acc) => v > acc);
  const minArr = reduceArr('minimo', (v, acc) => v < acc);
  def('maximo', '... -> cualquiera', a => {
    const r = maxArr(a);
    if (r !== null) return r;
    const xs = a.length === 1 && a[0] instanceof ObjLista ? ordenables(a[0], 'maximo') : a;
    if (!xs.length) vm.error('«maximo» de una lista vacía');
    return xs.reduce((p, c) => (c > p ? c : p));
  });
  def('minimo', '... -> cualquiera', a => {
    const r = minArr(a);
    if (r !== null) return r;
    const xs = a.length === 1 && a[0] instanceof ObjLista ? ordenables(a[0], 'minimo') : a;
    if (!xs.length) vm.error('«minimo» de una lista vacía');
    return xs.reduce((p, c) => (c < p ? c : p));
  });

  // ------------------------------------------------------------------ texto
  // Las diez funciones de texto se mudaron al eDSL «texto» (src/10). Aquí se
  // queda solo «contiene», que no es de texto: vale igual para una lista y
  // para un diccionario, así que es del núcleo.
  seccion('núcleo');
  def('contiene', 'cualquiera, cualquiera -> bool', a => vm.contiene(a[0], a[1], 'contiene'),
    'contiene(coleccion, valor) — en un texto, una lista o las claves de un diccionario');

  // ----------------------------------------------------------------- listas
  seccion('listas');
  def('agregar', '... -> lista', a => { const l = lst(a[0], 1, 'agregar'); for (let i = 1; i < a.length; i++) l.items.push(a[i]); return l; });
  vm.globals.get('agregar').puro = 'agregar';
  def('quitar', 'lista, cualquiera -> lista', a => {
    const l = lst(a[0], 1, 'quitar');
    const i = l.items.findIndex(x => iguales(x, a[1]));
    if (i < 0) vm.error(`«quitar»: ${repr(a[1], 1)} no está en la lista`);
    l.items.splice(i, 1); return l;
  });
  def('quitarEn', 'lista, entero -> cualquiera', a => { const l = lst(a[0], 1, 'quitarEn'); const i = num(a[1], 2, 'quitarEn'); if (i < 0 || i >= l.items.length) vm.error(`«quitarEn»: índice ${i} fuera de rango`); return l.items.splice(i, 1)[0]; });
  def('insertar', 'lista, entero, cualquiera -> lista', a => { const l = lst(a[0], 1, 'insertar'); l.items.splice(num(a[1], 2, 'insertar'), 0, a[2]); return l; });
  def('indice', 'lista, cualquiera -> entero', a => lst(a[0], 1, 'indice').items.findIndex(x => iguales(x, a[1])));
  def('contar', 'lista, cualquiera -> entero', a => lst(a[0], 1, 'contar').items.filter(x => iguales(x, a[1])).length);
  def('invertir', 'lista -> lista', a => L(lst(a[0], 1, 'invertir').items.slice().reverse()));
  def('copiar', 'cualquiera -> cualquiera', a => {
    const v = a[0];
    if (v instanceof ObjLista) return L(v.items.slice());
    if (v instanceof ObjDic) { const d = D(); for (const [k, x] of v.mapa) d.mapa.set(k, x); if (v.tipoReg) d.tipoReg = v.tipoReg; return d; }
    return v;
  });
  def('ordenar', '... -> lista', a => {
    const l = lst(a[0], 1, 'ordenar');
    vm.cobrar(l.items.length * (Math.log2(l.items.length + 2) | 0) + 1);
    const copia = l.items.slice();
    if (a.length > 1) {
      const f = a[1];
      copia.sort((x, y) => { const kx = vm.invocar(f, [x]), ky = vm.invocar(f, [y]); return kx < ky ? -1 : kx > ky ? 1 : 0; });
    } else copia.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return L(copia);
  }, 'ordenar(lista) · ordenar(lista, clave)');
  def('mapear', 'lista, funcion -> lista', a => L(lst(a[0], 1, 'mapear').items.map(x => vm.invocar(a[1], [x]))), 'mapear(lista, funcion)');
  def('filtrar', 'lista, funcion -> lista', a => L(lst(a[0], 1, 'filtrar').items.filter(x => verdad(vm.invocar(a[1], [x])))), 'filtrar(lista, funcion)');
  def('reducir', 'lista, funcion, cualquiera -> cualquiera', a => lst(a[0], 1, 'reducir').items.reduce((acc, x) => vm.invocar(a[1], [acc, x]), a[2]), 'reducir(lista, funcion, inicial)');
  def('rebanar', '... -> lista', a => {
    const l = lst(a[0], 1, 'rebanar');
    const i = a.length > 1 ? num(a[1], 2, 'rebanar') : 0;
    const j = a.length > 2 ? num(a[2], 3, 'rebanar') : l.items.length;
    return L(l.items.slice(i, j));
  }, 'rebanar(lista, desde, hasta)');
  def('aplanar', 'lista -> lista', a => {
    const out = [];
    const rec = xs => { for (const x of xs) x instanceof ObjLista ? rec(x.items) : out.push(x); };
    rec(lst(a[0], 1, 'aplanar').items);
    return L(out);
  });

  // ---------------------------------------------------------- diccionarios
  seccion('diccionarios');
  def('claves', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«claves» necesita un diccionario'); return L([...d.mapa.keys()]); });
  def('valores', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«valores» necesita un diccionario'); return L([...d.mapa.values()]); });
  // Esta firma decía «-> estilo», y no era un despiste: «pares» estaba MUERTO.
  // El «pares» de los estilos —&:nth-child(even)— se definía después y lo
  // sobrescribía, así que pares({…}) devolvía un estilo vacío sin quejarse de
  // nada. Al mudarse los estilos a su eDSL, este volvió a existir.
  def('pares', 'cualquiera -> lista', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«pares» necesita un diccionario'); return L([...d.mapa.entries()].map(([k, v]) => L([k, v]))); }, 'pares(dic) — una lista de [clave, valor]');
  def('obtener', 'cualquiera, cualquiera, cualquiera -> cualquiera', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«obtener» necesita un diccionario'); return d.mapa.has(a[1]) ? d.mapa.get(a[1]) : a[2]; }, 'obtener(dic, clave, pordefecto)');
  def('borrar', 'cualquiera, cualquiera -> cualquiera', a => { const d = a[0]; if (!(d instanceof ObjDic)) vm.error('«borrar» necesita un diccionario'); d.mapa.delete(a[1]); return d; });

  // ================================================== CÁLCULO CIENTÍFICO
  seccion('gráficos');
  const g = host.grafico || {};
  // Sin anfitrión, dibujar no hacía nada y no lo decía: el programa creía haber
  // pintado y no había pintado. Un fallo silencioso es peor que uno ruidoso,
  // sobre todo para quien está aprendiendo el lenguaje.
  const sinLienzo = quien => vm.error(`«${quien}» necesita un anfitrión con lienzo`,
    'el lienzo existe en el IDE y en una aplicación exportada; en la consola no hay dónde dibujar');
  const gfx = (n, fir, f, doc) => def(n, fir, (args) => {
    if (!g[n]) sinLienzo(n);
    return g[n].apply(null, args) ?? null;
  }, doc);
  def('lienzo', '... -> nulo', a => {
    if (!g.lienzo) sinLienzo('lienzo');
    g.lienzo(a[0] || 640, a[1] || 400);
    return null;
  }, 'lienzo(ancho, alto) — prepara el área de dibujo');
  gfx('limpiar', '... -> nulo', null, 'borra el lienzo');
  gfx('color', '... -> nulo', null, 'color(r,g,b) o color("#ff0000")');
  gfx('grosor', 'real -> nulo', null, 'grosor de la línea');
  gfx('linea', 'real, real, real, real -> nulo', null, 'linea(x1,y1,x2,y2)');
  gfx('rect', '... -> nulo', null, 'rect(x,y,ancho,alto,relleno?)');
  gfx('circulo', '... -> nulo', null, 'circulo(x,y,radio,relleno?)');
  gfx('punto', 'real, real -> nulo', null, 'punto(x,y)');
  gfx('escribirEn', 'real, real, texto -> nulo', null, 'escribirEn(x,y,texto)');
  gfx('letra', '... -> nulo', null, 'letra(tamaño, alineación?, estilo?) — cómo escribe escribirEn: px · «izquierda» «centro» «derecha» · «negrita» «mono»');
  def('graficar', '... -> nulo', a => {
    if (!g.graficar) sinLienzo('graficar');
    const xs = a[0] instanceof ObjLista ? a[0].items : [];
    const ys = a[1] instanceof ObjLista ? a[1].items : null;
    g.graficar(ys ? xs : xs.map((_, i) => i), ys || xs, a[2] || null);
    return null;
  }, 'graficar(ys) · graficar(xs, ys, titulo)');
  def('barras', '... -> nulo', a => {
    if (!g.barras) sinLienzo('barras');
    const vals = a[0] instanceof ObjLista ? a[0].items : [];
    const etiq = a[1] instanceof ObjLista ? a[1].items : null;
    g.barras(vals, etiq, a[2] || null);
    return null;
  }, 'barras(valores, etiquetas, titulo)');
  def('dispersion', '... -> nulo', a => {
    if (!g.dispersion) sinLienzo('dispersion');
    g.dispersion((a[0] || { items: [] }).items, (a[1] || { items: [] }).items, a[2] || null);
    return null;
  }, 'dispersion(xs, ys, titulo)');

  // ================================================== WEB — árbol de nodos
  seccion('web');
  // El DSL es jerárquico y por valores: etiqueta(), boton(), entrada(), tabla()
  // y crudo() no pintan nada, construyen un nodo. Los nodos se anidan unos
  // dentro de otros y se guardan en variables como cualquier otro valor, y
  // pintar() es el único que toca la página.
  //
  // El texto que entra por aquí se pinta como texto, siempre: el anfitrión
  // crea nodos de texto de verdad, así que un dato que contenga «<b>» se ve
  // con sus signos y no se convierte en marcado. Para meter HTML a propósito
  // está crudo(), que es la puerta explícita y se nota al leer el programa.
  const w = host.web || {};
  // Lo mismo que el lienzo: pintar sin anfitrión no hacía nada y se quedaba
  // callado. Ahora lo dice, y dice dónde sí funciona.
  const sinPagina = quien => vm.error(`«${quien}» necesita un anfitrión con página`,
    'la página existe en el IDE y en una aplicación exportada; en la consola no hay dónde pintar');
  const ETIQ_OK = /^[a-zA-Z][a-zA-Z0-9-]*$/;
  const ATRIB_OK = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
  // Sin hijos posibles: darles contenido sería un error silencioso.
  const VACIAS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  // Estas no son contenido: su interior no sigue las reglas del texto HTML y
  // escaparlo no significa nada. Quien las quiera, que pase por crudo().
  const NO_CONTENIDO = new Set(['script', 'style', 'iframe', 'object', 'embed', 'base', 'template']);
  const MAX_PROF = 200;

  // Los eventos que un nodo puede escuchar. La lista es blanca a propósito: el
  // atributo «on…» sigue prohibido, así que la única forma de que corra código
  // por una interacción es pasar una función de Ñ por aquí, y el anfitrión sabe
  // exactamente qué está conectando.
  const EVENTOS = {
    alHacerClic: 'click', alDobleClic: 'dblclick',
    alCambiar: 'change', alEscribir: 'input', alEnviar: 'submit',
    alEnfocar: 'focus', alDesenfocar: 'blur',
    alPulsarTecla: 'keydown', alSoltarTecla: 'keyup',
    alEntrar: 'mouseenter', alSalir: 'mouseleave',
  };
  // Nombres de atributo en español. Es el mismo trato que en el sistema de
  // estilo: lo que tiene nombre se traduce, y lo que no, pasa con su nombre de
  // HTML. Así «tipo» y «valor» funcionan sin tener que saber inglés, pero
  // «colspan» tampoco deja de funcionar.
  const ATRIBS = {
    clase: 'class', tipo: 'type', valor: 'value', nombre: 'name', pista: 'placeholder',
    titulo: 'title', destino: 'href', fuente: 'src', descripcion: 'alt', idioma: 'lang',
    marcada: 'checked', seleccionada: 'selected', deshabilitado: 'disabled',
    requerido: 'required', soloLectura: 'readonly', multiple: 'multiple', oculto: 'hidden',
    ancho: 'width', alto: 'height', filas: 'rows', columnas: 'cols',
    maximo: 'max', minimo: 'min', paso: 'step', largoMax: 'maxlength',
    objetivo: 'target', relacion: 'rel', accion: 'action', metodo: 'method',
    autocompletar: 'autocomplete', autofoco: 'autofocus', rotulo: 'aria-label',
  };
  // Atributos que son presencia, no valor: o están o no están.
  const BOOLEANOS = new Set(['checked', 'selected', 'disabled', 'required', 'readonly',
    'multiple', 'hidden', 'autofocus', 'open', 'loop', 'muted', 'controls', 'novalidate']);

  const esNodo = v => v instanceof ObjNodo;

  function nodoTexto(v) {
    const n = vm.nuevoNodo('texto');
    n.valor = repr(v, 0);
    return n;
  }
  // Convierte lo que venga en hijos: un nodo se queda, una lista se aplana,
  // y cualquier otro valor se vuelve texto.
  function comoHijos(v, fuera, prof) {
    if (esNodo(v)) { fuera.push(v); return; }
    if (v instanceof ObjLista) {
      if ((prof || 0) > 8) vm.error('«etiqueta»: listas de hijos anidadas demasiado hondo');
      for (const x of v.items) comoHijos(x, fuera, (prof || 0) + 1);
      return;
    }
    if (v instanceof ObjEstilo) {
      vm.error('un estilo no es contenido: pásalo a etiqueta(), no lo metas entre los hijos',
        'etiqueta("div", miEstilo, …)');
    }
    if (v === null) return;   // un nulo no pinta nada: deja escribir condicionales
    fuera.push(nodoTexto(v));
  }

  // Lee un diccionario sobre un nodo. De aquí salen tres cosas distintas y por
  // eso están juntas: los atributos, los eventos y las variables de CSS. La
  // clave «clave» no es ninguna de las tres: es la identidad del nodo.
  function aplicarDic(n, d, quien) {
    for (const [k, v] of d.mapa) {
      const bruto = String(k);
      if (bruto === 'clave') {
        if (v !== null) n.clave = repr(v, 0);
        continue;
      }
      if (EVENTOS[bruto] !== undefined) {
        if (v === null) { if (n.eventos) n.eventos.delete(EVENTOS[bruto]); continue; }
        if (!(v instanceof ObjCierre) && !(v instanceof ObjNativa))
          vm.error(`«${quien}»: «${bruto}» necesita una función y recibió ${tipoDe(v)}`);
        (n.eventos || (n.eventos = new Map())).set(EVENTOS[bruto], v);
        continue;
      }
      if (/^al[A-Z]/.test(bruto) && (v instanceof ObjCierre || v instanceof ObjNativa)) {
        vm.error(`«${quien}»: «${bruto}» no es un evento conocido`,
          'los eventos son ' + Object.keys(EVENTOS).join(', '));
      }
      if (bruto.startsWith('--')) {
        // Un valor que viene de los datos no debería fabricar una clase nueva
        // cada vez. Como variable de CSS viaja por el atributo «style» del
        // nodo y la clase, que es lo que se comparte, no cambia.
        (n.vars || (n.vars = new Map())).set(bruto, valorPropiedad(bruto, v));
        continue;
      }
      if (/^on/i.test(bruto)) vm.error(`«${quien}»: el atributo «${bruto}» pondría código en la página`,
        'los eventos se pasan como función: {alHacerClic: miFuncion}');
      const css = ATRIBS[bruto] || bruto;
      if (!ATRIB_OK.test(css)) vm.error(`«${quien}»: «${bruto}» no es un nombre de atributo válido`);
      const at = n.atrib || (n.atrib = new Map());
      // nulo quita el atributo; los booleanos lo ponen o lo quitan. Sin esto un
      // valor ausente se pinta como el texto «nulo», que es peor que nada.
      if (v === null || v === false) { at.delete(css); continue; }
      if (v === true) { at.set(css, ''); continue; }
      if (BOOLEANOS.has(css)) { at.set(css, ''); continue; }
      const valor = repr(v, 0);
      if (/^\s*javascript:/i.test(valor)) vm.error(`«${quien}»: «${bruto}» apunta a código, no a una dirección`);
      at.set(css, valor);
    }
  }

  // El barrido de argumentos que comparten todas las funciones de nodo: un
  // estilo es estilo, un diccionario son atributos —y se fusionan, no se
  // pintan—, una función es la acción principal. Lo demás lo decide quien llama.
  function extras(n, a, desde, quien, otros) {
    for (let i = desde; i < a.length; i++) {
      const x = a[i];
      if (x === null) continue;
      if (esEstilo(x)) { n.estilo = n.estilo ? fusionar([n.estilo, x], quien) : x; continue; }
      if (x instanceof ObjDic) { aplicarDic(n, x, quien); continue; }
      if (otros && otros(x, i)) continue;
      vm.error(`«${quien}» no sabe qué hacer con ${tipoDe(x)} en la posición ${i + 1}`);
    }
  }
  const esFn = v => v instanceof ObjCierre || v instanceof ObjNativa;

  def('etiqueta', '... -> nodo', a => {
    const nombre = txt(a[0], 1, 'etiqueta').toLowerCase();
    if (!ETIQ_OK.test(nombre)) vm.error(`«etiqueta»: «${nombre}» no es un nombre de etiqueta válido`);
    if (NO_CONTENIDO.has(nombre)) {
      vm.error(`«etiqueta»: «${nombre}» no lleva contenido de texto`,
        nombre === 'style' ? 'para CSS usa estilo("…")' : 'si de verdad lo necesitas, constrúyelo con crudo("…")');
    }
    const n = vm.nuevoNodo('elemento');
    n.etiqueta = nombre;
    n.hijos = [];
    for (let i = 1; i < a.length; i++) {
      const x = a[i];
      if (esEstilo(x)) { n.estilo = n.estilo ? fusionar([n.estilo, x], 'etiqueta') : x; continue; }
      // Todos los diccionarios son atributos y se fusionan; gana el de la
      // derecha, igual que al componer estilos. Antes solo contaba el primero y
      // el segundo acababa pintado como texto a la vista del usuario.
      if (x instanceof ObjDic) { aplicarDic(n, x, 'etiqueta'); continue; }
      comoHijos(x, n.hijos);
    }
    if (n.hijos.length && VACIAS.has(nombre)) {
      vm.error(`«etiqueta»: «${nombre}» no puede llevar hijos`);
    }
    vm.cobrar(1 + n.hijos.length);
    return n;
  }, 'etiqueta(nombre, atributos?, contenido…) — devuelve un nodo');

  def('crudo', 'texto -> nodo', a => {
    // El HTML de crudo() lo inserta el navegador, no el árbol, y el analizador
    // de HTML reequilibra lo que recibe: una etiqueta sin cerrar se cierra
    // sola al final del trozo y una de cierre sobrante se tira. O sea que
    // crudo("<div>") no deja el árbol abierto —lo de después sigue siendo
    // hermano, no hijo— pero tampoco pinta lo que uno creía. Si hace falta
    // anidar, se anida con etiqueta(), que para eso está.
    const n = vm.nuevoNodo('crudo');
    n.valor = repr(a[0], 0);
    vm.cobrar(1);
    return n;
  }, 'crudo(html) — un nodo con HTML sin escapar; la puerta explícita. El navegador reequilibra las etiquetas: lo que abras aquí se cierra aquí');

  // ---- controles
  function control(forma, quien, a, otros) {
    const n = vm.nuevoNodo(forma);
    vm.cobrar(1);
    extras(n, a, 1, quien, (x, i) => {
      if (esFn(x) && n.accion === null) { n.accion = x; return true; }
      return otros ? otros(n, x, i) : false;
    });
    return n;
  }

  def('boton', '... -> nodo', a => {
    const n = control('boton', 'boton', a);
    n.valor = txt(a[0], 1, 'boton');
    return n;
  }, 'boton(texto, funcion?, estilo?, atributos?) — devuelve un nodo botón');

  def('entrada', '... -> nodo', a => {
    const n = control('entrada', 'entrada', a);
    n.valor = txt(a[0], 1, 'entrada');
    return n;
  }, 'entrada(rotulo, funcion?, estilo?, atributos?) — caja de texto; el valor inicial va en {valor: …}');

  def('areaTexto', '... -> nodo', a => {
    const n = control('area', 'areaTexto', a);
    n.valor = txt(a[0], 1, 'areaTexto');
    return n;
  }, 'areaTexto(rotulo, funcion?, estilo?, atributos?) — caja de texto de varias líneas');

  def('casilla', '... -> nodo', a => {
    const n = control('casilla', 'casilla', a, (nodo, x) => {
      if (typeof x === 'boolean') { nodo.marcada = x; nodo.declara = true; return true; }
      return false;
    });
    n.valor = txt(a[0], 1, 'casilla');
    if (n.atrib && n.atrib.has('checked')) { n.marcada = true; n.declara = true; }
    return n;
  }, 'casilla(rotulo, marcada?, funcion?, estilo?, atributos?) — casilla de verificación');

  def('desplegable', '... -> nodo', a => {
    const lista = lst(a[0], 1, 'desplegable');
    const n = control('seleccion', 'desplegable', a);
    n.opciones = lista.items.map(o => {
      if (o instanceof ObjLista) {
        if (o.items.length !== 2) vm.error('«desplegable»: una opción con lista debe ser [valor, texto]');
        return { valor: repr(o.items[0], 0), texto: repr(o.items[1], 0) };
      }
      const t = repr(o, 0);
      return { valor: t, texto: t };
    });
    vm.cobrar(n.opciones.length);
    return n;
  }, 'desplegable(opciones, funcion?, estilo?, atributos?) — lista desplegable; opciones de texto o [valor, texto]');

  def('tabla', '... -> nodo', a => {
    const filas = lst(a[0], 1, 'tabla').items;
    const cab = a[1] instanceof ObjLista ? a[1].items : null;
    const tabla = vm.nuevoNodo('elemento');
    tabla.etiqueta = 'table';
    tabla.atrib = new Map([['class', 'el-tabla']]);
    tabla.hijos = [];
    extras(tabla, a, cab ? 2 : 1, 'tabla', x => x instanceof ObjLista);
    const fila = (celdas, etiq) => {
      const tr = vm.nuevoNodo('elemento');
      tr.etiqueta = 'tr'; tr.hijos = [];
      for (const c of celdas) {
        const td = vm.nuevoNodo('elemento');
        td.etiqueta = etiq; td.hijos = [];
        comoHijos(c, td.hijos);
        tr.hijos.push(td);
      }
      return tr;
    };
    if (cab) {
      const thead = vm.nuevoNodo('elemento');
      thead.etiqueta = 'thead'; thead.hijos = [fila(cab, 'th')];
      tabla.hijos.push(thead);
    }
    const tbody = vm.nuevoNodo('elemento');
    tbody.etiqueta = 'tbody'; tbody.hijos = [];
    for (const f of filas) tbody.hijos.push(fila(f instanceof ObjLista ? f.items : [f], 'td'));
    tabla.hijos.push(tbody);
    vm.cobrar(3 + filas.length * 2);
    return tabla;
  }, 'tabla(filas, encabezados?, estilo?, atributos?) — devuelve un nodo tabla');

  // ---- pintar: el único que toca la página
  // Lo que se le manda al anfitrión de cada nodo: atributos ya resueltos,
  // eventos ya traducidos a nombres del DOM y la clave de identidad. El
  // anfitrión no interpreta nada, solo conecta.
  function menaje(n) {
    const atrib = {};
    if (n.atrib) for (const [k, v] of n.atrib) atrib[k] = v;
    if (n.estilo) {
      const { nombre, texto } = cssDe(n.estilo);
      if (w.asegurarClase) w.asegurarClase(nombre, texto);
      atrib.class = atrib.class ? atrib.class + ' ' + nombre : nombre;
    }
    if (n.vars) {
      const decl = [...n.vars].map(([k, v]) => `${k}:${v}`).join(';');
      atrib.style = atrib.style ? atrib.style + ';' + decl : decl;
    }
    const ev = n.eventos ? Object.fromEntries(n.eventos) : null;
    return { atrib, eventos: ev, clave: n.clave };
  }

  function pintarNodo(n, prof) {
    if (prof > MAX_PROF) vm.error(`la página está anidada más de ${MAX_PROF} niveles`);
    vm.cobrar(1);
    switch (n.forma) {
      case 'texto': if (w.texto) w.texto(n.valor); break;
      case 'crudo': if (w.eco) w.eco(n.valor); break;
      case 'boton': case 'entrada': case 'area': case 'casilla': case 'seleccion': {
        if (!w.control) break;
        const m = menaje(n);
        w.control({
          forma: n.forma, rotulo: n.valor, accion: n.accion,
          // «declara» distingue un control que el programa gobierna —y cuyo
          // valor manda siempre— de uno que solo lee, donde lo que hay escrito
          // es del usuario y el repintado no debe tocarlo.
          marcada: n.marcada === true, declara: n.declara === true,
          opciones: n.opciones || null,
          atrib: m.atrib, eventos: m.eventos, clave: m.clave,
        }, vm);
        break;
      }
      case 'elemento': {
        if (!w.abrir) break;
        const m = menaje(n);
        w.abrir(n.etiqueta, m.atrib, { eventos: m.eventos, clave: m.clave, vm });
        try { for (const h of n.hijos) pintarNodo(h, prof + 1); }
        finally { if (w.cerrar) w.cerrar(); }
        break;
      }
    }
  }

  def('pintar', '... -> nulo', a => {
    if (!w.abrir) sinPagina('pintar');
    const pendientes = [];
    for (const x of a) comoHijos(x, pendientes);
    // Los fotogramas se reemiten en cada pintado. Se declaran una vez en el
    // programa, pero limpiarPagina() se lleva la hoja por delante; si no se
    // volvieran a poner, la animación deja de existir tras el primer repintado.
    if (w.asegurarClase) for (const [nombre, texto] of animaciones) w.asegurarClase(nombre, texto);
    for (const n of pendientes) pintarNodo(n, 0);
    return null;
  }, 'pintar(nodo…) — añade los nodos a la página');

  def('eco', '... -> nulo', a => { if (!w.eco) sinPagina('eco'); w.eco(a.map(x => repr(x, 0)).join('')); return null; }, 'escribe HTML crudo en la página, sin pasar por el árbol');
  // ================================================== ESTILO — reglas como valores
  // ================================================== ESTILO — vive en su eDSL
  // Toda la maquinaria de estilos se mudó a src/13-edsl-estilo.js con sus 22
  // nombres, que dejaron de ser globales. Aquí solo queda el enganche, porque
  // un nodo de la página lleva estilo dentro: «esEstilo» para reconocerlo,
  // «fusionar» para componer dos, y «cssDe» para sacar la clase y su CSS. Es la
  // MISMA copia que usa el eDSL, no otra: las reglas de traducir «transparente»
  // o de poner «px» a un número viven en un solo sitio.
  vm.estilos = maquinariaEstilo(vm, w, sinPagina);
  const { esEstilo, fusionar, cssDe, valorPropiedad } = vm.estilos;
  const animaciones = vm.estilos.animaciones;   // los @keyframes ya declarados
  def('limpiarPagina', ' -> nulo', () => { if (!w.limpiar) sinPagina('limpiarPagina'); w.limpiar(); return null; }, 'borra todo lo escrito en la página');

  // ================================================== MEMORIA Y TIEMPO
  seccion('memoria y tiempo');
  // La zona aislada tiene origen opaco: localStorage lanza SecurityError y ahí
  // no hay nada que hacer. Lo que sí se puede es pedírselo al anfitrión por el
  // puente, que es quien tiene un origen de verdad. El programa ve una API
  // síncrona porque el anfitrión mantiene el espejo en memoria; lo que cruza el
  // puente es solo la copia persistente.
  const alm = host.almacen || null;
  const MAX_GUARDADO = 64 * 1024;

  // Un valor guardado tiene que volver siendo el mismo: una lista tiene que
  // volver lista y un diccionario diccionario, con sus claves del tipo que
  // fueran. Por eso no es JSON pelado sino una forma etiquetada.
  function aGuardable(v, prof) {
    if ((prof || 0) > 32) vm.error('«guardar»: el valor está anidado demasiado hondo');
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof ObjLista) return { l: v.items.map(x => aGuardable(x, (prof || 0) + 1)) };
    if (v instanceof ObjDic) return { d: [...v.mapa].map(([k, x]) => [aGuardable(k, (prof || 0) + 1), aGuardable(x, (prof || 0) + 1)]) };
    vm.error(`«guardar» no puede guardar ${tipoDe(v)}`,
      'se guardan números, textos, booleanos, nulo, listas y diccionarios');
  }
  function deGuardable(v, prof) {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if ((prof || 0) > 64) vm.error('«recuperar»: el valor guardado está mal formado');
    if (v && Array.isArray(v.l)) return L(v.l.map(x => deGuardable(x, (prof || 0) + 1)));
    if (v && Array.isArray(v.d)) {
      const d = D();
      for (const par of v.d) d.mapa.set(deGuardable(par[0], (prof || 0) + 1), deGuardable(par[1], (prof || 0) + 1));
      return d;
    }
    return null;
  }
  const sinAlmacen = quien => vm.error(`«${quien}» necesita un anfitrión con almacenamiento`,
    'en el IDE está disponible; fuera del navegador, no');

  def('guardar', 'texto, cualquiera -> nulo', a => {
    if (!alm) sinAlmacen('guardar');
    const k = txt(a[0], 1, 'guardar');
    const texto = JSON.stringify(aGuardable(a[1], 0));
    if (texto.length > MAX_GUARDADO)
      vm.error(`«guardar»: «${k}» ocupa ${texto.length} caracteres y el máximo es ${MAX_GUARDADO}`);
    vm.cobrar(2 + (texto.length >> 6));
    alm.escribir(k, texto);
    return null;
  }, 'guardar(clave, valor) — deja el valor guardado entre ejecuciones');

  def('recuperar', '... -> cualquiera', a => {
    if (!alm) sinAlmacen('recuperar');
    const k = txt(a[0], 1, 'recuperar');
    const pordefecto = a.length > 1 ? a[1] : null;
    const texto = alm.leer(k);
    if (texto === null || texto === undefined) return pordefecto;
    vm.cobrar(2 + (String(texto).length >> 6));
    try { return deGuardable(JSON.parse(texto), 0); }
    catch (_) { return pordefecto; }
  }, 'recuperar(clave, pordefecto?) — lee lo guardado');

  def('olvidar', 'texto -> bool', a => {
    if (!alm) sinAlmacen('olvidar');
    return !!alm.borrar(txt(a[0], 1, 'olvidar'));
  }, 'olvidar(clave) — borra una clave guardada');

  def('guardados', ' -> lista<texto>', () => {
    if (!alm) sinAlmacen('guardados');
    return L(alm.claves().map(String));
  }, 'guardados() — la lista de claves guardadas');

  const tmp = host.tiempo || null;
  const sinTiempo = quien => vm.error(`«${quien}» necesita un anfitrión con temporizadores`,
    'en el IDE está disponible; fuera del navegador, no');
  const msDe = (v, quien) => {
    const ms = num(v, 1, quien);
    if (!isFinite(ms) || ms < 0) vm.error(`«${quien}»: los milisegundos deben ser un número positivo`);
    return ms;
  };
  // «despues» ya es el pseudoelemento ::after del sistema de estilo, así que el
  // temporizador de una sola vez se llama «luego».
  def('luego', 'real, cualquiera -> entero', a => {
    if (!tmp) sinTiempo('luego');
    if (!esFn(a[1])) vm.error(`«luego»: el argumento 2 debe ser una función y es ${tipoDe(a[1])}`);
    vm.cobrar(1);
    return tmp.luego(msDe(a[0], 'luego'), a[1], vm);
  }, 'luego(ms, funcion) — la llama una vez pasado ese tiempo; devuelve el número del temporizador');
  def('cada', 'real, cualquiera -> entero', a => {
    if (!tmp) sinTiempo('cada');
    if (!esFn(a[1])) vm.error(`«cada»: el argumento 2 debe ser una función y es ${tipoDe(a[1])}`);
    vm.cobrar(1);
    return tmp.cada(msDe(a[0], 'cada'), a[1], vm);
  }, 'cada(ms, funcion) — la llama cada tanto; devuelve el número del temporizador');
  def('detener', 'entero -> bool', a => {
    if (!tmp) sinTiempo('detener');
    return !!tmp.detener(num(a[0], 1, 'detener'));
  }, 'detener(numero) — para un temporizador de despues() o cada()');

  // ================================================== RED
  seccion('red');
  // Una petición no puede bloquear: la máquina es síncrona y no hay hilos. Así
  // que pedir() no devuelve la respuesta, la entrega — igual que un clic o un
  // temporizador, la respuesta llega como un turno más. Es la misma forma que
  // ya tiene todo lo demás y no hace falta inventar promesas en el lenguaje.
  const red = host.red || null;
  const METODOS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

  def('pedir', '... -> cualquiera', a => {
    if (!red) vm.error('«pedir» necesita un anfitrión con red',
      'está en el IDE, en una aplicación exportada y en el intérprete de Node; QuickJS no trae «fetch»');
    const url = txt(a[0], 1, 'pedir');
    if (!/^https?:\/\//i.test(url)) vm.error('«pedir»: la dirección debe empezar por http:// o https://');
    let op = null, fn = null;
    for (let i = 1; i < a.length; i++) {
      const x = a[i];
      if (esFn(x)) { fn = x; continue; }
      if (x instanceof ObjDic) { op = x; continue; }
      if (x === null) continue;
      vm.error(`«pedir» no sabe qué hacer con ${tipoDe(x)} en la posición ${i + 1}`);
    }
    // (motor-exp) Sin función, «pedir» devuelve una promesa: dentro de una
    // función asíncrona se escribe «var r = esperar pedir(url)».
    let promesa = null;
    if (!fn) {
      promesa = vm.registrar(new ObjPromesa());
      fn = new ObjNativa(' respuesta', 1, x => { vm.cumplir(promesa, x[0], true); return null; });
    }
    const o = { metodo: 'GET', cuerpo: null, cabeceras: {} };
    if (op) for (const [k, v] of op.mapa) {
      const clave = String(k);
      if (clave === 'metodo') {
        o.metodo = String(repr(v, 0)).toUpperCase();
        if (!METODOS.has(o.metodo)) vm.error(`«pedir»: el método «${o.metodo}» no está permitido`);
      } else if (clave === 'cuerpo') {
        o.cuerpo = v === null ? null : repr(v, 0);
      } else if (clave === 'cabeceras') {
        if (!(v instanceof ObjDic)) vm.error('«pedir»: «cabeceras» tiene que ser un diccionario');
        for (const [ck, cv] of v.mapa) {
          const nombre = String(ck);
          // Una cabecera con salto de línea partiría la petición en dos.
          if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(nombre)) vm.error(`«pedir»: «${nombre}» no es un nombre de cabecera válido`);
          const valor = repr(cv, 0);
          if (/[\r\n]/.test(valor)) vm.error(`«pedir»: el valor de «${nombre}» lleva un salto de línea`);
          o.cabeceras[nombre] = valor;
        }
      } else {
        vm.error(`«pedir»: no conozco la opción «${clave}»`, 'las opciones son metodo, cuerpo y cabeceras');
      }
    }
    vm.cobrar(4);
    red.pedir(url, o, fn, vm);
    return promesa;
  }, 'pedir(url, opciones?, funcion?) — trae datos de la red; la respuesta llega a la función, o con «esperar pedir(url)»');

  // JSON, que es en lo que habla casi todo lo que hay al otro lado de pedir().
  function aValor(v, prof) {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if ((prof || 0) > 64) vm.error('«deJson»: el texto está anidado demasiado hondo');
    if (Array.isArray(v)) return L(v.map(x => aValor(x, (prof || 0) + 1)));
    const d = D();
    for (const k in v) d.mapa.set(k, aValor(v[k], (prof || 0) + 1));
    return d;
  }
  function deValor(v, prof) {
    if ((prof || 0) > 32) vm.error('«aJson»: el valor está anidado demasiado hondo');
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof ObjLista) return v.items.map(x => deValor(x, (prof || 0) + 1));
    if (v instanceof ObjDic) {
      const o = {};
      for (const [k, x] of v.mapa) o[String(k)] = deValor(x, (prof || 0) + 1);
      return o;
    }
    vm.error(`«aJson» no puede convertir ${tipoDe(v)}`, 'se convierten números, textos, booleanos, nulo, listas y diccionarios');
  }
  def('deJson', 'texto -> cualquiera', a => {
    const t = txt(a[0], 1, 'deJson');
    vm.cobrar(2 + (t.length >> 6));
    let v;
    // Un JSON mal formado es un dato de fuera, no un fallo del motor: se
    // convierte en un error del lenguaje, que se puede capturar.
    try { v = JSON.parse(t); }
    catch (e) { vm.error('«deJson»: el texto no es JSON válido', String(e.message || e).slice(0, 120)); }
    return aValor(v, 0);
  }, 'deJson(texto) — convierte texto JSON en listas y diccionarios');
  def('aJson', '... -> texto', a => {
    const bonito = a.length > 1 && a[1] === true;
    const plano = deValor(a[0], 0);
    const t = JSON.stringify(plano, null, bonito ? 2 : 0);
    vm.cobrar(2 + (t.length >> 6));
    return t;
  }, 'aJson(valor, bonito?) — convierte un valor en texto JSON');

  // ================================================== ARCHIVOS Y SISTEMA
  seccion('archivos y sistema');
  // Nada de esto existe en el navegador, y es a propósito: un programa que
  // corre dentro de una página no tiene por qué poder abrir archivos. Estas
  // funciones solo aparecen cuando el anfitrión las ofrece, que es lo que hace
  // el intérprete de línea de órdenes. Si no están, lo dicen con esas palabras
  // en vez de fallar de una forma rara.
  const arch = host.archivos || null;
  const sis = host.sistema || null;
  const faltaArch = quien => vm.error(`«${quien}» necesita un anfitrión con archivos`,
    'esto corre fuera del navegador: qjs --std motor/util/n.js programa.esl, o node motor/util/n-node.js');
  const faltaSis = quien => vm.error(`«${quien}» necesita un anfitrión con sistema`,
    'esto corre fuera del navegador: qjs --std motor/util/n.js programa.esl, o node motor/util/n-node.js');

  // El anfitrión lanza errores de JavaScript; aquí se vuelven errores del
  // lenguaje, del tipo «archivo», para que un programa pueda capturarlos.
  function conArchivo(quien, ruta, f) {
    if (!arch) faltaArch(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'archivo');
    }
  }
  function conSistema(quien, f) {
    if (!sis) faltaSis(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'sistema');
    }
  }

  def('leerTexto', 'texto -> texto', a => {
    const r = txt(a[0], 1, 'leerTexto');
    const t = conArchivo('leerTexto', r, () => arch.leer(r));
    vm.cobrar(4 + (String(t).length >> 6));
    return t;
  }, 'leerTexto(ruta) — el contenido de un archivo de texto');
  def('escribirTexto', 'texto, texto -> nulo', a => {
    const r = txt(a[0], 1, 'escribirTexto'), t = txt(a[1], 2, 'escribirTexto');
    vm.cobrar(4 + (t.length >> 6));
    conArchivo('escribirTexto', r, () => arch.escribir(r, t));
    return null;
  }, 'escribirTexto(ruta, texto) — lo escribe entero, pisando lo que hubiera');
  def('agregarTexto', 'texto, texto -> nulo', a => {
    const r = txt(a[0], 1, 'agregarTexto'), t = txt(a[1], 2, 'agregarTexto');
    vm.cobrar(4 + (t.length >> 6));
    conArchivo('agregarTexto', r, () => arch.agregar(r, t));
    return null;
  }, 'agregarTexto(ruta, texto) — lo añade al final');
  def('existeArchivo', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'existeArchivo');
    return !!conArchivo('existeArchivo', r, () => arch.existe(r));
  }, 'existeArchivo(ruta) — si hay algo en esa ruta');
  def('esCarpeta', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'esCarpeta');
    return !!conArchivo('esCarpeta', r, () => arch.esCarpeta(r));
  }, 'esCarpeta(ruta) — si esa ruta es una carpeta');
  def('listar', 'texto -> lista<texto>', a => {
    const r = txt(a[0], 1, 'listar');
    const l = conArchivo('listar', r, () => arch.listar(r));
    vm.cobrar(2 + l.length);
    return L(l.map(String));
  }, 'listar(ruta) — los nombres que hay dentro de una carpeta');
  def('crearCarpeta', 'texto -> nulo', a => {
    const r = txt(a[0], 1, 'crearCarpeta');
    conArchivo('crearCarpeta', r, () => arch.crearCarpeta(r));
    return null;
  }, 'crearCarpeta(ruta) — la crea, con las que falten por el camino');
  def('borrarArchivo', 'texto -> bool', a => {
    const r = txt(a[0], 1, 'borrarArchivo');
    return !!conArchivo('borrarArchivo', r, () => arch.borrar(r));
  }, 'borrarArchivo(ruta) — lo borra; devuelve si había algo que borrar');
  def('tamanoArchivo', 'texto -> entero', a => {
    const r = txt(a[0], 1, 'tamanoArchivo');
    return conArchivo('tamanoArchivo', r, () => arch.tamano(r)) | 0;
  }, 'tamanoArchivo(ruta) — su tamaño en bytes');
  // Arreglos en binario crudo: real → float64, entero → int32, en el orden de
  // la memoria y sin cabecera. Es el formato con el que NumPy escribe y lee
  // (tofile / fromfile), y por eso existe: es el puente entre Ñ y Python sin
  // pasar millones de números por JSON. La forma y el tipo no van en el
  // archivo; quien lee los conoce (el puente los manda aparte).
  const TIPOS_BINARIOS = ['real', 'entero', 'real32', 'real16', 'i8', 'u8', 'i16', 'u16', 'u32', 'i64', 'u64'];
  def('leerArregloBinario', 'texto, texto, lista -> arreglo', a => {
    const r = txt(a[0], 1, 'leerArregloBinario');
    const tipo0 = txt(a[1], 2, 'leerArregloBinario'), tipo = ALIAS_TIPO[tipo0] || tipo0;
    // (motor-exp N4.5) y los enteros de máquina: i8 u8 i16 u16 u32 i64 u64
    if (!TIPOS_BINARIOS.includes(tipo))
      vm.error(`«leerArregloBinario»: el tipo es uno de ${TIPOS_BINARIOS.map(t => '«' + t + '»').join(', ')}, no «${tipo0}»`);
    const forma = lst(a[2], 3, 'leerArregloBinario').items.map(x => num(x, 3, 'leerArregloBinario') | 0);
    if (!arch || !arch.leerBytes) faltaArch('leerArregloBinario');
    const bytes = conArchivo('leerArregloBinario', r, () => arch.leerBytes(r));
    const out = vm.arrNuevo(forma, tipo);
    // (motor-exp N4.2) un real16 son 2 bytes por número en el archivo (float16 de NumPy)
    if (tipo === 'real16') {
      if (bytes.byteLength !== out.tamano * 2)
        vm.error(`«leerArregloBinario»: el archivo tiene ${bytes.byteLength} bytes y la forma ${forma.join('×')} de real16 pide ${out.tamano * 2}`);
      const h = new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      for (let i = 0; i < h.length; i++) out.datos[i] = deBits16(h[i]);
      vm.cobrar(out.tamano);
      return out;
    }
    const esperado = out.datos.byteLength;
    if (bytes.byteLength !== esperado)
      vm.error(`«leerArregloBinario»: el archivo tiene ${bytes.byteLength} bytes y la forma ${forma.join('×')} de ${tipo} pide ${esperado}`);
    new Uint8Array(out.datos.buffer, out.datos.byteOffset, esperado).set(new Uint8Array(bytes.buffer, bytes.byteOffset, esperado));
    vm.cobrar(out.tamano);
    return out;
  }, 'leerArregloBinario(ruta, tipo, forma) — un arreglo desde bytes crudos (float64, int32, float32, float16 o los enteros int8 … uint64), el formato de NumPy');
  def('escribirArregloBinario', 'texto, arreglo -> nulo', a => {
    const r = txt(a[0], 1, 'escribirArregloBinario');
    const arr = a[1];
    if (!(arr instanceof ObjArreglo)) vm.error(`«escribirArregloBinario»: el argumento 2 debe ser un arreglo y es ${tipoDe(arr)}`);
    if (!TIPOS_BINARIOS.includes(arr.tipo))
      vm.error(`«escribirArregloBinario»: solo arreglos ${TIPOS_BINARIOS.join(', ')}, no ${arr.tipo}`);
    if (!arch || !arch.escribirBytes) faltaArch('escribirArregloBinario');
    // Una vista no contigua se copia primero en orden lógico: lo que se escribe
    // es lo que el programa ve, no lo que hay en memoria.
    let plano;
    if (arr.seguida) plano = arr.datos.subarray(arr.desp, arr.desp + arr.tamano);
    else {
      plano = new arr.datos.constructor(arr.tamano);
      let i = 0;
      for (const q of arr.posiciones()) plano[i++] = arr.datos[q];
    }
    if (arr.tipo === 'real16') { const h = new Uint16Array(plano.length); for (let i = 0; i < h.length; i++) h[i] = bitsDe16(plano[i]); plano = h; }
    conArchivo('escribirArregloBinario', r, () => arch.escribirBytes(r, new Uint8Array(plano.buffer, plano.byteOffset, plano.byteLength)));
    vm.cobrar(arr.tamano);
    return null;
  }, 'escribirArregloBinario(ruta, arreglo) — lo guarda como bytes crudos (float64, int32, float32, float16 o los enteros int8 … uint64), el formato de NumPy');

  // ── (motor-exp, S2) el eDSL «sistema»: usar servir, leerLineas, unirRuta de "sistema"
  // Nombres nuevos en un eDSL, no globales: lección de X4 («todas» y
  // «siguiente» globales rompieron dos programas que ya existían).
  cuerpoSistema = def => {
    const rut = host.rutas || null;
    const exigeArch = (q, k) => { if (!arch || (k && !arch[k])) faltaArch(q); };
    // ── archivos
    def('leerLineas', 'texto -> cualquiera', a => {
      const r = txt(a[0], 1, 'leerLineas');
      exigeArch('leerLineas', 'lineas');
      const sig = conArchivo('leerLineas', r, () => arch.lineas(r));
      const g = vm.registrar(new ObjGenerador(null, null, false));
      g.nombreNativo = 'leerLineas';
      g.nativo = () => { const l = conArchivo('leerLineas', r, sig); if (l !== undefined) vm.cobrar(1 + (l.length >> 6)); return l; };
      g.alAcabar = () => sig.cerrar && sig.cerrar();
      return g;
    }, 'leerLineas(ruta) — un generador con las líneas del archivo, sin cargarlo entero: «para l en leerLineas("enorme.csv")»');
    def('copiarArchivo', 'texto, texto -> nulo', a => {
      const de = txt(a[0], 1, 'copiarArchivo'), aa = txt(a[1], 2, 'copiarArchivo');
      exigeArch('copiarArchivo', 'copiar');
      vm.cobrar(20);
      conArchivo('copiarArchivo', de, () => arch.copiar(de, aa));
      return null;
    }, 'copiarArchivo(de, a) — copia un archivo (o una carpeta entera)');
    def('moverArchivo', 'texto, texto -> nulo', a => {
      const de = txt(a[0], 1, 'moverArchivo'), aa = txt(a[1], 2, 'moverArchivo');
      exigeArch('moverArchivo', 'mover');
      conArchivo('moverArchivo', de, () => arch.mover(de, aa));
      return null;
    }, 'moverArchivo(de, a) — lo mueve o le cambia el nombre');
    def('infoArchivo', 'texto -> dic<texto,cualquiera>', a => {
      const r = txt(a[0], 1, 'infoArchivo');
      exigeArch('infoArchivo', 'info');
      const i = conArchivo('infoArchivo', r, () => arch.info(r));
      const d = D();
      d.mapa.set('tamano', i.tamano);
      d.mapa.set('modificado', vm.nuevaFecha(i.modificado));
      d.mapa.set('creado', vm.nuevaFecha(i.creado));
      d.mapa.set('esCarpeta', !!i.esCarpeta);
      d.mapa.set('esArchivo', !!i.esArchivo);
      return d;
    }, 'infoArchivo(ruta) — {tamano, modificado, creado, esCarpeta, esArchivo}; las fechas son fechas de Ñ');
    def('carpetaActual', ' -> texto', () => {
      if (!sis || !sis.carpetaActual) faltaSis('carpetaActual');
      return String(sis.carpetaActual());
    }, 'carpetaActual() — la carpeta desde la que corre el programa');
    def('cambiarCarpeta', 'texto -> nulo', a => {
      if (!sis || !sis.cambiarCarpeta) faltaSis('cambiarCarpeta');
      const r = txt(a[0], 1, 'cambiarCarpeta');
      conSistema('cambiarCarpeta', () => sis.cambiarCarpeta(r));
      return null;
    }, 'cambiarCarpeta(ruta) — las rutas relativas pasan a contar desde ahí');
    def('infoSistema', ' -> dic<texto,cualquiera>', () => {
      if (!sis || !sis.info) faltaSis('infoSistema');
      const i = sis.info(), d = D();
      for (const k of Object.keys(i)) d.mapa.set(k, i[k]);
      return d;
    }, 'infoSistema() — so, arquitectura, procesadores, memoria, libre, usuario, personal, temporal, equipo, motor');
    // ── procesos
    def('ejecutarEnFondo', '... -> cualquiera', a => {
      if (!sis || !sis.ejecutarFondo) faltaSis('ejecutarEnFondo');
      if (a.length < 1 || a.length > 3) vm.error('«ejecutarEnFondo» es ejecutarEnFondo(orden, argumentos?, opciones?)');
      const orden = txt(a[0], 1, 'ejecutarEnFondo');
      const args = a.length > 1 && a[1] !== null ? lst(a[1], 2, 'ejecutarEnFondo').items.map(x => repr(x, 0)) : [];
      const op = opcionesProceso(a[2], 'ejecutarEnFondo');
      const p = vm.registrar(new ObjPromesa());
      vm.cobrar(50);
      conSistema('ejecutarEnFondo', () => sis.ejecutarFondo(orden, args, op, r => enTurno(() => vm.cumplir(p, resultadoProceso(r), true))));
      return p;
    }, 'ejecutarEnFondo(orden, argumentos?, opciones?) — como ejecutar, sin parar el programa: «fijo r = esperar ejecutarEnFondo("git", ["status"])»');
    // ── el servidor
    const srv = host.servidor || null;
    const faltaSrv = q => vm.error(`«${q}» necesita un anfitrión que pueda abrir puertos`,
      'esto corre en la consola: node motor-exp/util/n-node.js programa.esl');
    // Lo que devuelve el manejador, convertido en una respuesta HTTP. Un texto
    // es texto (o HTML si empieza por «<»), una lista o un dic es JSON —
    // siempre: un dic de datos que tenga una clave «estado» o «cuerpo» no se
    // confunde con una respuesta—, nulo es 204, y para el estado o las
    // cabeceras está respuesta(estado, cuerpo, opciones?).
    const MARCA_RESP = Symbol('respuesta');
    const json = v => ({ estado: 200, tipo: 'application/json; charset=utf-8', cuerpo: JSON.stringify(deValor(v, 0)) });
    const tipoTexto = t => (/^\s*</.test(t) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
    function respuesta(v) {
      if (v === null || v === undefined) return { estado: 204, tipo: 'text/plain; charset=utf-8', cuerpo: '' };
      if (typeof v === 'string') return { estado: 200, tipo: tipoTexto(v), cuerpo: v };
      if (v instanceof ObjDic && v[MARCA_RESP]) return v[MARCA_RESP];
      if (v instanceof ObjLista || v instanceof ObjDic) return json(v);
      return { estado: 200, tipo: 'text/plain; charset=utf-8', cuerpo: repr(v, 0) };
    }
    def('respuesta', '... -> dic<texto,cualquiera>', a => {
      if (a.length < 2 || a.length > 3) vm.error('«respuesta» es respuesta(estado, cuerpo) o respuesta(estado, cuerpo, {"tipo": …, "cabeceras": {…}})');
      const estado = vm.exigeEnt(a[0], 1, 'respuesta');
      if (estado < 100 || estado > 599) vm.error(`«respuesta»: ${estado} no es un estado HTTP (van de 100 a 599)`);
      const base = respuesta(a[1]);
      const r = { estado, tipo: base.tipo, cuerpo: estado === 204 ? '' : base.cuerpo, cabeceras: {} };
      if (a.length > 2 && a[2] !== null) {
        const o = a[2];
        if (!(o instanceof ObjDic)) vm.error('«respuesta»: las opciones van en un diccionario');
        for (const [k, x] of o.mapa) {
          if (k === 'tipo') r.tipo = txt(x, 3, 'respuesta');
          else if (k === 'cabeceras') {
            if (!(x instanceof ObjDic)) vm.error('«respuesta»: «cabeceras» es un diccionario {Nombre: valor}');
            for (const [ck, cv] of x.mapa) {
              const n = String(ck), val = repr(cv, 0);
              if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(n)) vm.error(`«respuesta»: «${n}» no es un nombre de cabecera válido`);
              if (/[\r\n]/.test(val)) vm.error(`«respuesta»: el valor de «${n}» lleva un salto de línea`);
              r.cabeceras[n] = val;
            }
          } else vm.error(`«respuesta»: no conozco la opción «${k}»`, 'las opciones son tipo y cabeceras');
        }
      }
      // Es un dic normal para el programa (se puede imprimir y mirar), con la
      // respuesta ya comprobada guardada aparte.
      const d = D();
      d.mapa.set('estado', estado); d.mapa.set('cuerpo', a[1]);
      d[MARCA_RESP] = r;
      return d;
    }, 'respuesta(estado, cuerpo, opciones?) — para «servir»: respuesta(404, "no está"), respuesta(201, datos, {"cabeceras": {"X-Algo": "sí"}})');
    // A quien pidió no se le cuenta qué falló por dentro (podría ser cualquiera
    // en la red): eso va a la consola, entero, con su línea.
    const error500 = () => ({ estado: 500, tipo: 'text/plain; charset=utf-8', cuerpo: 'error interno del servidor' });
    def('servir', '... -> cualquiera', a => {
      if (!srv) faltaSrv('servir');
      if (a.length < 2 || a.length > 3) vm.error('«servir» es servir(puerto, funcion) o servir(puerto, funcion, {"anfitrion": "0.0.0.0"})');
      const puerto = vm.exigeEnt(a[0], 1, 'servir');
      if (puerto < 0 || puerto > 65535) vm.error(`«servir»: ${puerto} no es un puerto (van de 0 a 65535; 0 elige uno libre)`);
      const fn = a[1];
      if (!esFn(fn)) vm.error(`«servir»: el argumento 2 debe ser una función y es ${tipoDe(fn)}`);
      // Por defecto solo escucha en este equipo: abrirlo a la red es una
      // decisión, y se escribe.
      let ip = '127.0.0.1';
      if (a.length > 2 && a[2] !== null) {
        const o = a[2];
        if (!(o instanceof ObjDic)) vm.error('«servir»: las opciones van en un diccionario');
        for (const [k, x] of o.mapa) {
          if (k === 'anfitrion') ip = txt(x, 3, 'servir');
          else vm.error(`«servir»: no conozco la opción «${k}»`, 'la opción es anfitrion ("0.0.0.0" para abrirlo a la red)');
        }
      }
      const p = vm.registrar(new ObjPromesa());
      const d = D();
      const id = conSistema('servir', () => srv.escuchar(puerto, ip, (pet, responder) => {
        enTurno(() => {
          const q = D();
          for (const k of Object.keys(pet.consulta)) q.mapa.set(k, pet.consulta[k]);
          const c = D();
          for (const k of Object.keys(pet.cabeceras)) c.mapa.set(k, String(pet.cabeceras[k]));
          const pd = D();
          pd.mapa.set('metodo', pet.metodo); pd.mapa.set('ruta', pet.ruta); pd.mapa.set('consulta', q);
          pd.mapa.set('cabeceras', c); pd.mapa.set('cuerpo', pet.cuerpo); pd.mapa.set('ip', pet.ip);
          let r;
          try { r = vm.invocar(fn, [pd]); }
          catch (e) { responder(error500(e)); throw e; }
          // Un manejador asíncrono devuelve una promesa: se responde cuando esté.
          if (r instanceof ObjPromesa) {
            r.vista = true;
            const listo = (ok, v) => {
              if (!ok) { responder(error500({ message: v instanceof ObjError ? v.mensaje : repr(v, 0) })); errorDeTurno(new ErrorTiempoEjecucion(`una petición a ${pet.ruta} falló: ${v instanceof ObjError ? v.mensaje : repr(v, 0)}`)); return; }
              try { responder(respuesta(v)); } catch (e) { responder(error500(e)); errorDeTurno(e); }
            };
            if (r.estado === 'pendiente') r.esperando.push(listo); else listo(r.estado === 'cumplida', r.valor);
            return;
          }
          try { responder(respuesta(r)); } catch (e) { responder(error500(e)); throw e; }
        });
      }, (err, puertoReal) => enTurno(() => {
        if (err) { vm.cumplir(p, vm.nuevoError('sistema', `«servir»: ${err}`, vm.lineaActual), false); return; }
        d.mapa.set('puerto', puertoReal);
        vm.cumplir(p, d, true);
      })));
      d.mapa.set('id', id); d.mapa.set('puerto', puerto); d.mapa.set('listo', p);
      return d;
    }, 'servir(puerto, funcion) — un servidor HTTP: la función recibe {metodo, ruta, consulta, cabeceras, cuerpo, ip} y devuelve texto, un dic (JSON) o {estado, cuerpo, tipo, cabeceras}; puede ser asíncrona');
    def('detenerServidor', 'cualquiera -> bool', a => {
      if (!srv) faltaSrv('detenerServidor');
      const s = a[0];
      if (!(s instanceof ObjDic) || !s.mapa.has('id')) vm.error('«detenerServidor»: necesita lo que devolvió servir()');
      return !!srv.cerrar(s.mapa.get('id'));
    }, 'detenerServidor(s) — deja de escuchar; el programa puede acabar');
    // ── rutas: con las del sistema operativo si el anfitrión las da; si no
    // (el navegador), con «/», que es lo que entiende una URL.
    const pos = {
      unir: ps => pos.normalizar(ps.filter(x => x !== '').join('/')),
      normalizar: r => {
        const abs = r.startsWith('/'), out = [];
        for (const t of r.split('/')) { if (t === '' || t === '.') continue; if (t === '..' && out.length && out[out.length - 1] !== '..') out.pop(); else if (t !== '..' || !abs) out.push(t); }
        return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
      },
      nombre: r => r.replace(/\/+$/, '').split('/').pop(),
      extension: r => { const n = pos.nombre(r), i = n.lastIndexOf('.'); return i > 0 ? n.slice(i) : ''; },
      carpeta: r => { const t = r.replace(/\/+$/, ''), i = t.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : t.slice(0, i); },
      esAbsoluta: r => r.startsWith('/'),
    };
    const R = rut || pos;
    def('unirRuta', '... -> texto', a => {
      if (!a.length) vm.error('«unirRuta» necesita al menos un trozo');
      return R.unir(a.map((x, i) => txt(x, i + 1, 'unirRuta')));
    }, 'unirRuta("datos", "2026", "ventas.csv") — con el separador de este sistema, y sin barras dobles');
    def('nombreArchivo', 'texto -> texto', a => R.nombre(txt(a[0], 1, 'nombreArchivo')),
      'nombreArchivo("a/b/ventas.csv") — "ventas.csv"');
    def('extension', 'texto -> texto', a => R.extension(txt(a[0], 1, 'extension')),
      'extension("ventas.csv") — ".csv" (vacío si no tiene)');
    def('sinExtension', 'texto -> texto', a => { const r = txt(a[0], 1, 'sinExtension'), e = R.extension(r); return e ? r.slice(0, -e.length) : r; },
      'sinExtension("a/ventas.csv") — "a/ventas"');
    def('carpetaDe', 'texto -> texto', a => R.carpeta(txt(a[0], 1, 'carpetaDe')),
      'carpetaDe("a/b/ventas.csv") — "a/b"');
    def('esRutaAbsoluta', 'texto -> bool', a => !!R.esAbsoluta(txt(a[0], 1, 'esRutaAbsoluta')),
      'esRutaAbsoluta(ruta) — si empieza desde la raíz (o desde una unidad, en Windows)');
    def('normalizarRuta', 'texto -> texto', a => R.normalizar(txt(a[0], 1, 'normalizarRuta')),
      'normalizarRuta("a/./b/../c") — "a/c"');
    def('rutaAbsoluta', 'texto -> texto', a => {
      if (!rut) faltaSis('rutaAbsoluta');
      return rut.absoluta(txt(a[0], 1, 'rutaAbsoluta'));
    }, 'rutaAbsoluta(ruta) — la ruta completa, contando desde la carpeta actual');
    def('rutaRelativa', 'texto, texto -> texto', a => {
      if (!rut) faltaSis('rutaRelativa');
      return rut.relativa(txt(a[0], 1, 'rutaRelativa'), txt(a[1], 2, 'rutaRelativa'));
    }, 'rutaRelativa(desde, hasta) — cómo llegar de una carpeta a otra ruta');
  };

  def('argumentos', ' -> lista<texto>', () => {
    if (!sis) faltaSis('argumentos');
    return L(sis.argumentos().map(String));
  }, 'argumentos() — lo que venía detrás del nombre del programa');
  def('entorno', '... -> cualquiera', a => {
    if (!sis) faltaSis('entorno');
    const n = txt(a[0], 1, 'entorno');
    const v = sis.entorno(n);
    return v === null || v === undefined ? (a.length > 1 ? a[1] : null) : String(v);
  }, 'entorno(nombre, pordefecto?) — una variable de entorno');
  def('ejecutar', '... -> dic<texto,cualquiera>', a => {
    if (!sis) faltaSis('ejecutar');
    const orden = txt(a[0], 1, 'ejecutar');
    let args = [];
    if (a.length > 1 && a[1] !== null) {
      const l = lst(a[1], 2, 'ejecutar');
      args = l.items.map(x => repr(x, 0));
    }
    const op = opcionesProceso(a[2], 'ejecutar');
    if (op && sis.ejecutar.length < 3)
      vm.error('«ejecutar»: este anfitrión no entiende opciones (entrada, carpeta, entorno, espera)',
        'están en el intérprete de Node: node motor-exp/util/n-node.js', false, 'sistema');
    vm.cobrar(50);
    const r = conSistema('ejecutar', () => sis.ejecutar(orden, args, op));
    return resultadoProceso(r);
  }, 'ejecutar(orden, argumentos?, opciones?) — lanza un programa y espera; devuelve {codigo, salida, error}. Opciones: entrada, carpeta, entorno, espera (ms)');
  // (motor-exp, S2) Las opciones de un proceso, comprobadas aquí: un nombre mal
  // escrito («carpta») se diría como error y no se ignoraría en silencio.
  function opcionesProceso(v, quien) {
    if (v === undefined || v === null) return null;
    if (!(v instanceof ObjDic)) vm.error(`«${quien}»: las opciones van en un diccionario y es ${tipoDe(v)}`);
    const o = {};
    for (const [k, x] of v.mapa) {
      if (k === 'entrada') o.entrada = txt(x, 3, quien);
      else if (k === 'carpeta') o.carpeta = txt(x, 3, quien);
      else if (k === 'espera') { o.espera = vm.exigeEnt(x, 3, quien); if (o.espera <= 0) vm.error(`«${quien}»: «espera» son milisegundos, más de cero`); }
      else if (k === 'entorno') {
        if (!(x instanceof ObjDic)) vm.error(`«${quien}»: «entorno» es un diccionario {NOMBRE: valor}`);
        o.entorno = {};
        for (const [ek, ev] of x.mapa) o.entorno[String(ek)] = repr(ev, 0);
      } else vm.error(`«${quien}»: no conozco la opción «${k}»`, 'las opciones son entrada, carpeta, entorno y espera');
    }
    return o;
  }
  function resultadoProceso(r) {
    const d = D();
    d.mapa.set('codigo', r.codigo | 0);
    d.mapa.set('salida', String(r.salida || ''));
    d.mapa.set('error', String(r.error || ''));
    return d;
  }
  def('leerLinea', '... -> cualquiera', a => {
    if (!sis) faltaSis('leerLinea');
    // (motor-exp, S2) Si el anfitrión sabe escribir sin salto de línea, la
    // pregunta queda en la misma línea que la respuesta, como en cualquier consola.
    if (a.length && a[0] !== null) { if (sis.indicar) sis.indicar(repr(a[0], 0)); else vm.salida(repr(a[0], 0)); }
    const l = sis.leerLinea();
    return l === null || l === undefined ? null : String(l);
  }, 'leerLinea(pista?) — lee una línea de la entrada; nulo cuando se acaba');
  def('salir', '... -> nulo', a => {
    if (!sis) faltaSis('salir');
    sis.salir(a.length ? num(a[0], 1, 'salir') | 0 : 0);
    return null;
  }, 'salir(codigo?) — termina el programa');

  // ==================================================== CÓDIGO NATIVO (FFI)
  seccion('código nativo');
  // Esto es un agujero en la caja, y lo es a propósito. Llamar a una función de
  // una biblioteca compilada es ejecutar código arbitrario dentro de este mismo
  // proceso: no hay verificador que lo mire, no hay presupuesto de
  // instrucciones que lo corte, y un puntero mal puesto tira el proceso entero
  // sin pasar por «intentar». Por eso vive exactamente donde viven los
  // archivos: solo existe cuando el anfitrión lo ofrece, y el anfitrión de la
  // zona aislada no lo ofrece nunca.
  //
  // La biblioteca no sabe con qué se llama a lo nativo. Le pide al anfitrión
  // cuatro cosas —cargar, descargar, declarar una estructura y declarar una
  // función— y le pasa y recibe valores planos de JavaScript. Así el anfitrión
  // de Node puede usar koffi y el de QuickJS puede no ofrecer nada, sin que el
  // motor cambie.
  const nat = host.nativo || null;
  const MAX_NATIVAS = 256;     // funciones declaradas por ejecución
  const MAX_ARGS_NAT = 16;     // argumentos por función nativa
  let nDeclaradas = 0;
  const faltaNat = quien => vm.error(`«${quien}» necesita un anfitrión con código nativo`,
    'esto corre fuera del navegador y con koffi instalado: npm install koffi, y luego node motor/util/n-node.js');
  function conNativo(quien, f) {
    if (!nat) faltaNat(quien);
    try { return f(); }
    catch (e) {
      if (e instanceof ErrorTiempoEjecucion) throw e;
      vm.error(`«${quien}»: ${String((e && e.message) || e)}`, null, false, 'nativo');
    }
  }

  // Un valor de Ñ camino de C. Números, textos y booleanos van tal cual; un
  // diccionario es una estructura y una lista es un arreglo. Lo que no tiene
  // forma en C —una función, un nodo, un estilo, un error— se rechaza aquí,
  // con su nombre, en vez de llegar al anfitrión y salir como un fallo raro.
  function aCrudo(v, quien, i) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (v instanceof ObjDic) {
      const o = {};
      for (const [k, val] of v.mapa) {
        if (typeof k !== 'string')
          vm.error(`«${quien}»: las claves de una estructura tienen que ser texto y hay una de tipo ${tipoDe(k)}`,
            null, false, 'nativo');
        o[k] = aCrudo(val, quien, i);
      }
      return o;
    }
    if (v instanceof ObjLista) return v.items.map(x => aCrudo(x, quien, i));
    vm.error(`«${quien}»: el argumento ${i} es de tipo ${tipoDe(v)} y eso no se puede pasar a código nativo`,
      'a una función nativa se le pasan números, textos, booleanos, y diccionarios para las estructuras',
      false, 'nativo');
  }

  // Y de vuelta. Los enteros de 64 bits llegan como BigInt cuando no caben en
  // un número de JavaScript; Ñ no tiene BigInt, así que se dice con esas
  // palabras en vez de entregar un número equivocado en silencio.
  function deCrudo(v, quien) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'bigint') {
      if (v > 9007199254740991n || v < -9007199254740991n)
        vm.error(`«${quien}»: devolvió ${v} y eso no cabe en un número de Ñ`,
          'Ñ maneja enteros exactos hasta 9.007.199.254.740.991; para valores mayores declara el tipo «texto» y conviértelo en C',
          false, 'nativo');
      return Number(v);
    }
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (Array.isArray(v)) return L(v.map(x => deCrudo(x, quien)));
    if (t === 'object') {
      const d = D();
      for (const k of Object.keys(v)) d.mapa.set(k, deCrudo(v[k], quien));
      return d;
    }
    return String(v);
  }

  def('hayNativo', ' -> bool', () => !!nat,
    'hayNativo() — si este anfitrión puede llamar a código nativo');
  def('cargarNativa', 'texto -> nulo', a => {
    const b = txt(a[0], 1, 'cargarNativa');
    vm.cobrar(200);
    conNativo('cargarNativa', () => nat.cargar(b));
    return null;
  }, 'cargarNativa(biblioteca) — abre una biblioteca compilada; falla aquí si no está');
  def('descargarNativa', 'texto -> bool', a => {
    const b = txt(a[0], 1, 'descargarNativa');
    return !!conNativo('descargarNativa', () => nat.descargar(b));
  }, 'descargarNativa(biblioteca) — la suelta; devuelve si estaba abierta');
  def('bibliotecasNativas', ' -> lista<texto>', () => {
    if (!nat) faltaNat('bibliotecasNativas');
    return L(conNativo('bibliotecasNativas', () => nat.abiertas()).map(String));
  }, 'bibliotecasNativas() — las que están abiertas ahora mismo');

  def('estructuraNativa', 'texto, cualquiera -> texto', a => {
    const n = txt(a[0], 1, 'estructuraNativa');
    const campos = a[1];
    if (!(campos instanceof ObjDic))
      vm.error(`«estructuraNativa»: el argumento 2 debe ser un diccionario {campo: tipo} y es ${tipoDe(campos)}`);
    const pares = [];
    for (const [k, v] of campos.mapa) {
      if (typeof k !== 'string')
        vm.error('«estructuraNativa»: los nombres de campo tienen que ser texto', null, false, 'nativo');
      if (typeof v !== 'string')
        vm.error(`«estructuraNativa»: el tipo del campo «${k}» tiene que ser texto y es ${tipoDe(v)}`,
          null, false, 'nativo');
      pares.push([k, v]);
    }
    if (!pares.length)
      vm.error('«estructuraNativa»: una estructura sin campos no sirve de nada', null, false, 'nativo');
    vm.cobrar(20 + pares.length);
    conNativo('estructuraNativa', () => nat.estructura(n, pares));
    return n;
  }, 'estructuraNativa(nombre, {campo: tipo, …}) — declara una estructura de C; devuelve su nombre para usarlo como tipo');

  // ── (motor-exp, S1) la llamada, con lo que el anfitrión sabe de cada parámetro
  // Si el anfitrión describe los parámetros (koffi lo hace), la conversión los
  // mira: un arreglo solo va a un puntero de SU tipo de número, un parámetro de
  // salida no se pasa y se devuelve, y una función de Ñ que va a un puntero a
  // función se envuelve como retrollamada. Sin descripción, lo de siempre.
  const pilaNativa = [];      // las llamadas nativas en curso (una retrollamada puede anidar otra)
  const esFuncionN = v => v instanceof ObjCierre || v instanceof ObjNativa;
  const defectoDe = d => (!d ? null : d.clase === 'numero' ? 0 : d.clase === 'bool' ? false : null);
  function deNativo(r, d, quien) {
    if (d && d.clase === 'puntero') return r === null || r === undefined ? null : new ObjOpaco('puntero', r);
    return deCrudo(r, quien);
  }
  function aNativo(v, d, ctx, quien, i) {
    if (!d) return aCrudo(v, quien, i);
    if (v === null || v === undefined) return null;
    if (d.clase === 'retrollamada') {
      if (v instanceof ObjOpaco && v.clase === 'retrollamada') {
        if (!v.vivo) vm.error(`«${quien}»: el argumento ${i} es una retrollamada ya soltada`, null, false, 'nativo');
        return v.crudo;
      }
      if (!esFuncionN(v))
        vm.error(`«${quien}»: el argumento ${i} es un puntero a función (${d.c}) y recibió ${tipoDe(v)}`, null, false, 'nativo');
      if (ctx.enFondo)
        vm.error(`«${quien}»: una llamada en segundo plano no puede llevar retrollamadas`,
          'C la llamaría desde otro hilo, y Ñ corre en uno solo: hazla normal, sin «enFondo»', false, 'nativo');
      return retro(v, d.resultado, ctx);
    }
    if (v instanceof ObjArreglo) {
      if (d.clase !== 'puntero')
        vm.error(`«${quien}»: el argumento ${i} es un arreglo y C espera ${d.c}`, 'un arreglo va a un puntero: «double *» o «int *»', false, 'nativo');
      const elemN = v.tipo === 'entero' ? 'entero' : 'real';
      const cDe = v.tipo === 'entero' ? 'int (int32_t)' : 'double';
      if (d.apunta === 'numero' && (d.elem !== elemN || (elemN === 'entero' && d.ancho !== 4)))
        vm.error(`«${quien}»: el argumento ${i} es un arreglo ${v.tipo}, de ${cDe}, y C espera ${d.c}`,
          'C leería esos bytes como si fueran de otro tipo; convierte el arreglo o corrige la firma', false, 'nativo');
      if (d.apunta === 'estructura')
        vm.error(`«${quien}»: el argumento ${i} es un arreglo y C espera ${d.c}, un puntero a estructura`, null, false, 'nativo');
      // Seguida desde donde empiece (una fila de una matriz lo está, aunque no
      // empiece en 0): basta con que las zancadas sean las de su forma.
      const z = zancadasDe(v.forma);
      let contigua = true;
      for (let q = 0; q < z.length; q++) if (v.forma[q] > 1 && z[q] !== v.zancadas[q]) contigua = false;
      if (!contigua)
        vm.error(`«${quien}»: el argumento ${i} es una vista con huecos de un arreglo, y C necesita los números seguidos`,
          'pásale copia(a), de "numerico": una copia seguida (y lo que C escriba irá a la copia)', false, 'nativo');
      const dt = v.datos;   // «datos» trae la copia buena si vivía en la GPU
      return dt.subarray(v.desp * (v.tipo === 'complejo' ? 2 : 1), (v.desp + v.tamano) * (v.tipo === 'complejo' ? 2 : 1));
    }
    if (v instanceof ObjOpaco) {
      if (!v.vivo) vm.error(`«${quien}»: el argumento ${i} es ${repr(v, 0)}`, null, false, 'nativo');
      if (v.clase === 'retrollamada') vm.error(`«${quien}»: el argumento ${i} es una retrollamada y C espera ${d.c}`, null, false, 'nativo');
      if (d.clase === 'numero') {   // la forma vieja: «puntero» es un entero (uintptr_t)
        const dir = v.clase === 'memoria' ? nat.direccion(v.crudo) : v.direccion();
        return Number(dir);
      }
      if (d.clase !== 'puntero' && d.clase !== 'texto')
        vm.error(`«${quien}»: el argumento ${i} es un ${v.clase} y C espera ${d.c}`, null, false, 'nativo');
      return v.crudo;
    }
    return aCrudo(v, quien, i);
  }
  // Una función de Ñ que C va a llamar. Nada puede cruzar los marcos de C
  // lanzado —un error de JavaScript a través de C es un proceso roto—, así que
  // el error se guarda, la retrollamada devuelve un valor neutro, y la llamada
  // nativa, al volver, lo lanza como error de Ñ normal y capturable.
  function retro(f, dres, ctx) {
    return (...xs) => {
      if (ctx.error) return defectoDe(dres);
      try {
        const r = vm.invocar(f, xs.map(x => (typeof x === 'bigint' && (x > 9007199254740991n || x < -9007199254740991n))
          ? new ObjOpaco('puntero', x) : deCrudo(x, f.nombre || 'retrollamada')));
        if (!dres || dres.clase === 'nulo') return undefined;
        if (dres.clase === 'numero' && typeof r !== 'number' && typeof r !== 'boolean')
          vm.error(`la retrollamada tenía que devolver un número (${dres.c}) y devolvió ${tipoDe(r)}`, null, false, 'nativo');
        return aNativo(r, dres, ctx, 'retrollamada', 0);
      } catch (e) { ctx.error = e; return defectoDe(dres); }
    };
  }
  // Prepara los argumentos de Ñ y devuelve los crudos y las cajas de salida.
  function prepararNativa(llamar, args, quien, enFondo) {
    const ps = llamar.parametros || null;
    const ctx = { error: null, enFondo };
    if (!ps) return { ctx, crudos: args.map((x, i) => aCrudo(x, quien, i + 1)), cajas: null };
    const crudos = new Array(ps.length), cajas = [];
    let k = 0;
    for (let j = 0; j < ps.length; j++) {
      const d = ps[j];
      if (d.dir === 'sale') { const c = [null]; crudos[j] = c; cajas.push({ c, d }); continue; }
      const v = aNativo(args[k], d, ctx, quien, k + 1);
      k++;
      if (d.dir === 'entra y sale') { const c = [v]; crudos[j] = c; cajas.push({ c, d, orig: args[k - 1] }); }
      else crudos[j] = v;
    }
    return { ctx, crudos, cajas };
  }
  // Y lo que vuelve: el resultado y, detrás, lo que dejaron los de salida.
  // Uno solo va tal cual; varios, en una lista: «fijo [q, r] = dividir(17, 5)».
  function terminarNativa(llamar, r, cajas, quien) {
    // (motor-exp N4.10) las de una cabecera: un puntero a estructura que entra y
    // sale escribe en el MISMO diccionario de Ñ que se pasó (como en C)
    if (cajas && cajas.length && llamar.enSitio) {
      const quedan = [];
      for (const cj of cajas) {
        if (cj.orig instanceof ObjDic && cj.c[0] && typeof cj.c[0] === 'object') {
          const nuevo = deCrudo(cj.c[0], quien);
          for (const [k, v] of nuevo.mapa) cj.orig.mapa.set(k, v);
        } else quedan.push(cj);
      }
      cajas = quedan;
    }
    if (!cajas || !cajas.length) return deNativo(r, llamar.resultado, quien);
    const vals = [];
    if (!llamar.resultado || llamar.resultado.clase !== 'nulo') vals.push(deNativo(r, llamar.resultado, quien));
    for (const { c, d } of cajas) vals.push(deNativo(c[0], d.apunta === 'opaco' ? { clase: 'puntero' } : null, quien));
    return vals.length === 1 ? vals[0] : L(vals);
  }
  function hacerNativa(llamar, sim, bib, aridad, doc) {
    const n = new ObjNativa(sim, aridad, (args) => {
      vm.cobrar(20 + aridad * 2);
      const { ctx, crudos, cajas } = prepararNativa(llamar, args, sim, false);
      let r;
      pilaNativa.push(ctx);
      try { r = llamar(crudos); }
      catch (e) {
        if (e instanceof ErrorTiempoEjecucion) throw e;
        vm.error(`«${sim}»: ${String((e && e.message) || e)}`, null, false, 'nativo');
      }
      finally { pilaNativa.pop(); }
      if (ctx.error) throw ctx.error;      // lo que falló dentro de una retrollamada
      return terminarNativa(llamar, r, cajas, sim);
    }, doc);
    n.llamarNativo = llamar;               // para «enFondo»
    return n;
  }
  const contarEntradas = llamar => llamar.parametros ? llamar.parametros.filter(d => d.dir !== 'sale').length : null;

  def('nativa', '... -> funcion', a => {
    if (!nat) faltaNat('nativa');
    // (S1) La forma corta: nativa(biblioteca, "double cos(double)").
    if (a.length === 2) {
      const bib = txt(a[0], 1, 'nativa');
      const proto = txt(a[1], 2, 'nativa');
      if (!nat.funcionC) vm.error('«nativa» con una firma de C necesita un anfitrión más nuevo', null, false, 'nativo');
      if (++nDeclaradas > MAX_NATIVAS)
        vm.error(`«nativa»: no se declaran más de ${MAX_NATIVAS} funciones nativas en una ejecución`,
          'declárala una vez y guarda el resultado en una variable, no dentro de un bucle', false, 'nativo');
      vm.cobrar(100);
      const llamar = conNativo('nativa', () => nat.funcionC(bib, proto));
      const ar = contarEntradas(llamar);
      if (ar > MAX_ARGS_NAT)
        vm.error(`«nativa»: no se declaran más de ${MAX_ARGS_NAT} argumentos y se declararon ${ar}`, null, false, 'nativo');
      return hacerNativa(llamar, llamar.nombre, bib, ar, `${proto} — de ${bib}`);
    }
    if (a.length < 3 || a.length > 4)
      vm.error('«nativa» acepta 2, 3 o 4 argumentos: nativa(biblioteca, "double cos(double)") o nativa(biblioteca, simbolo, devuelve, argumentos?)');
    const bib = txt(a[0], 1, 'nativa');
    const sim = txt(a[1], 2, 'nativa');
    const dev = txt(a[2], 3, 'nativa');
    let tipos = [];
    if (a.length > 3 && a[3] !== null) {
      const l = lst(a[3], 4, 'nativa');
      tipos = l.items.map((x, i) => {
        if (typeof x !== 'string')
          vm.error(`«nativa»: el tipo del argumento ${i + 1} debe ser texto y es ${tipoDe(x)}`, null, false, 'nativo');
        return x;
      });
    }
    if (tipos.length > MAX_ARGS_NAT)
      vm.error(`«nativa»: no se declaran más de ${MAX_ARGS_NAT} argumentos y se declararon ${tipos.length}`,
        null, false, 'nativo');
    if (++nDeclaradas > MAX_NATIVAS)
      vm.error(`«nativa»: no se declaran más de ${MAX_NATIVAS} funciones nativas en una ejecución`,
        'declárala una vez y guarda el resultado en una variable, no dentro de un bucle', false, 'nativo');
    vm.cobrar(100);
    // El anfitrión valida aquí los nombres de tipo y busca el símbolo: lo que
    // está mal se sabe al declarar, no en la primera llamada.
    const llamar = conNativo('nativa', () => nat.funcion(bib, sim, dev, tipos));
    // La aridad va en el propio valor, así que el número de argumentos lo
    // comprueba la máquina con su mensaje de siempre antes de que nada cruce.
    return hacerNativa(llamar, sim, bib, tipos.length, `${sim}() de ${bib} — declarada con nativa()`);
  }, 'nativa(biblioteca, "double cos(double)") o nativa(biblioteca, simbolo, devuelve, argumentos?) — declara una función compilada y la devuelve como función de Ñ');

  // (motor-exp, S1) Lo demás del FFI va en el eDSL «nativo»: usar retrollamada,
  // memoria, leerMemoria de "nativo". No son globales para no quitarle nombres a nadie.
  cuerpoNativo = def => {
    const exigeNat = q => { if (!nat || !nat.tipoC) faltaNat(q); };
    // (motor-exp N4.10) toda una cabecera de C de una vez: sus funciones, sus
    // constantes (#define y enum) y sus estructuras, sin escribir ninguna firma
    def('cabeceraNativa', 'texto, texto -> dic', a => {
      if (!nat || !nat.cabecera) faltaNat('cabeceraNativa');
      const bib = txt(a[0], 1, 'cabeceraNativa');
      const ruta = txt(a[1], 2, 'cabeceraNativa');
      vm.cobrar(500);
      const h = conNativo('cabeceraNativa', () => nat.cabecera(bib, ruta));
      if (nDeclaradas + h.funciones.length > MAX_NATIVAS)
        vm.error(`«cabeceraNativa»: no se declaran más de ${MAX_NATIVAS} funciones nativas en una ejecución, y «${ruta}» trae ${h.funciones.length}`,
          'léela una vez y guarda el resultado', false, 'nativo');
      nDeclaradas += h.funciones.length;
      const d = D();
      for (const [n, v] of h.constantes) d.mapa.set(n, v);
      for (const { nombre, llamar } of h.funciones) {
        const ar = contarEntradas(llamar);
        if (ar > MAX_ARGS_NAT) { h.omitidas.push([nombre, `tiene ${ar} argumentos y el máximo es ${MAX_ARGS_NAT}`]); continue; }
        d.mapa.set(nombre, hacerNativa(llamar, nombre, bib, ar, `${llamar.firmaC} — de ${bib} (${ruta})`));
      }
      d.mapa.set('_omitidas', L(h.omitidas.map(([n, por]) => `${n}: ${por}`)));
      return d;
    }, 'cabeceraNativa(biblioteca, "geo.h") — lee la cabecera de C y devuelve un diccionario con sus funciones y sus constantes, listas para llamar: m.geo_area(caja); lo que no se pudo, en m._omitidas');
    def('tipoNativo', 'texto -> texto', a => {
      exigeNat('tipoNativo');
      return conNativo('tipoNativo', () => nat.tipoC(txt(a[0], 1, 'tipoNativo')));
    }, 'tipoNativo("int Comparar(const void *, const void *)") — un tipo de función para retrollamadas; tipoNativo("FILE") — un tipo opaco');
    def('retrollamada', 'cualquiera, texto -> cualquiera', a => {
      exigeNat('retrollamada');
      if (!esFuncionN(a[0])) vm.error(`«retrollamada»: el argumento 1 debe ser una función y es ${tipoDe(a[0])}`);
      const nombre = txt(a[1], 2, 'retrollamada');
      // Una registrada vive más que la llamada: sus errores no tienen llamada
      // a la que volver, así que salen como error del turno.
      const ctx = { error: null };
      const f = retro(a[0], null, ctx);
      // Si C la dispara dentro de una llamada nativa de Ñ, el error es de esa
      // llamada. Si la dispara él solo (un temporizador de C, otro hilo), es un
      // turno aparte, y el error se enseña sin lanzarlo: lanzar a través de C
      // es romper el proceso.
      const envuelta = (...xs) => {
        const dentro = pilaNativa.length ? pilaNativa[pilaNativa.length - 1] : null;
        if (!dentro) vm.nuevoTurno();
        const r = f(...xs);
        if (ctx.error) {
          const e = ctx.error; ctx.error = null;
          if (dentro) { if (!dentro.error) dentro.error = e; }
          else if (host.errorEnTurno) host.errorEnTurno(e);
          else vm.salida(e.formato ? e.formato() : String(e.message || e));
        }
        return r;
      };
      const h = conNativo('retrollamada', () => nat.registrar(envuelta, nombre));
      return new ObjOpaco('retrollamada', h, { nombre, fn: a[0] });
    }, 'retrollamada(funcion, "Tipo") — una retrollamada que C puede guardar y llamar más tarde; suéltala con soltarRetrollamada');
    def('soltarRetrollamada', 'cualquiera -> nulo', a => {
      exigeNat('soltarRetrollamada');
      const r = a[0];
      if (!(r instanceof ObjOpaco) || r.clase !== 'retrollamada') vm.error(`«soltarRetrollamada»: necesita una retrollamada y recibió ${tipoDe(r)}`);
      if (r.vivo) { conNativo('soltarRetrollamada', () => nat.desregistrar(r.crudo)); r.vivo = false; }
      return null;
    }, 'soltarRetrollamada(r) — C ya no la va a llamar; llamarla después sería un fallo');
    def('reservarMemoria', 'entero -> cualquiera', a => {
      exigeNat('reservarMemoria');
      const n = vm.exigeEnt(a[0], 1, 'reservarMemoria');
      if (n < 1 || n > 256 * 1024 * 1024) vm.error('«reservarMemoria»: entre 1 byte y 256 MB');
      vm.cobrar(4 + (n >> 10));
      return new ObjOpaco('memoria', nat.memoria(n), { bytes: n });
    }, 'reservarMemoria(bytes) — un bloque de bytes a cero, para pasarlo donde C pide char * o void *; se libera solo');
    const ptr = (v, i, q) => {
      if (v instanceof ObjOpaco && (v.clase === 'puntero' || v.clase === 'memoria') && v.vivo) return v.crudo;
      if (typeof v === 'number' && v > 0) return v;
      vm.error(`«${q}»: el argumento ${i} debe ser un puntero o una memoria y es ${v === null ? 'nulo' : tipoDe(v)}`,
        v === null ? 'leer de un puntero nulo tumbaría el proceso; compruébalo antes' : null, false, 'nativo');
    };
    def('leerMemoria', '... -> cualquiera', a => {
      exigeNat('leerMemoria');
      if (a.length < 2 || a.length > 3) vm.error('«leerMemoria» es leerMemoria(p, tipo) o leerMemoria(p, tipo, cuantos)');
      const p = ptr(a[0], 1, 'leerMemoria'), t = txt(a[1], 2, 'leerMemoria');
      const n = a.length > 2 ? vm.exigeEnt(a[2], 3, 'leerMemoria') : null;
      if (a[0] instanceof ObjOpaco && a[0].clase === 'memoria' && n !== null && n * nat.tamano(t === 'texto' ? 'entero8' : t) > a[0].bytes)
        vm.error(`«leerMemoria»: ${n} de ${t} no caben en ${a[0].bytes} bytes`, null, false, 'nativo');
      const r = conNativo('leerMemoria', () => nat.leer(p, t, n));
      if (ArrayBuffer.isView(r) || Array.isArray(r)) return L(Array.from(r, x => deCrudo(x, 'leerMemoria')));
      return deCrudo(r, 'leerMemoria');
    }, 'leerMemoria(p, tipo, cuantos?) — lee de un puntero: un número, una lista de cuantos, o "texto" hasta el cero');
    def('escribirMemoria', 'cualquiera, texto, cualquiera -> nulo', a => {
      exigeNat('escribirMemoria');
      const p = ptr(a[0], 1, 'escribirMemoria'), t = txt(a[1], 2, 'escribirMemoria');
      const v = a[2] instanceof ObjLista ? a[2].items.map(x => aCrudo(x, 'escribirMemoria', 3)) : aCrudo(a[2], 'escribirMemoria', 3);
      const n = Array.isArray(v) ? v.length : null;
      if (a[0] instanceof ObjOpaco && a[0].clase === 'memoria' && (n || 1) * nat.tamano(t) > a[0].bytes)
        vm.error(`«escribirMemoria»: eso no cabe en ${a[0].bytes} bytes`, null, false, 'nativo');
      conNativo('escribirMemoria', () => nat.escribir(p, t, v, n));
      return null;
    }, 'escribirMemoria(p, tipo, valor) — escribe un número (o una lista) en esa dirección');
    def('textoDeMemoria', 'cualquiera -> texto', a => {
      const m = a[0];
      if (!(m instanceof ObjOpaco) || m.clase !== 'memoria') vm.error(`«textoDeMemoria»: necesita una memoria y recibió ${tipoDe(m)}`);
      const b = m.crudo, fin = b.indexOf(0);
      return b.toString('utf8', 0, fin < 0 ? b.length : fin);
    }, 'textoDeMemoria(m) — el texto que C dejó en una memoria, hasta el primer cero');
    def('tamanoNativo', 'texto -> entero', a => {
      exigeNat('tamanoNativo');
      return conNativo('tamanoNativo', () => nat.tamano(txt(a[0], 1, 'tamanoNativo')));
    }, 'tamanoNativo(tipo) — cuántos bytes ocupa: "real", "int", o una estructura declarada');
    def('direccion', 'cualquiera -> entero', a => {
      exigeNat('direccion');
      const v = a[0];
      if (!(v instanceof ObjOpaco) || v.clase === 'retrollamada') vm.error(`«direccion»: necesita un puntero o una memoria y recibió ${tipoDe(v)}`);
      return Number(v.clase === 'memoria' ? nat.direccion(v.crudo) : v.direccion());
    }, 'direccion(p) — la dirección como entero, para imprimirla o compararla');
    def('errorC', ' -> entero', () => { exigeNat('errorC'); return nat.errno(); },
      'errorC() — el errno de la última llamada a C (0 si no hubo error)');
    def('enFondo', '... -> cualquiera', a => {
      exigeNat('enFondo');
      const f = a[0];
      if (!(f instanceof ObjNativa) || !f.llamarNativo || !f.llamarNativo.enFondo)
        vm.error(`«enFondo»: el argumento 1 debe ser una función declarada con nativa() y es ${tipoDe(f)}`,
          'en segundo plano solo corre código de C: lo de Ñ ya es de un solo hilo');
      const args = a.slice(1);
      if (f.aridad >= 0 && args.length !== f.aridad)
        vm.error(`«${f.nombre}» espera ${f.aridad} argumento(s) y recibió ${args.length}`);
      const llamar = f.llamarNativo;
      const { crudos, cajas } = prepararNativa(llamar, args, f.nombre, true);
      const p = vm.registrar(new ObjPromesa());
      vm.cobrar(50);
      conNativo('enFondo', () => llamar.enFondo(crudos, (err, r) => enTurno(() => {
        if (err) vm.cumplir(p, vm.nuevoError('nativo', `«${f.nombre}»: ${String((err && err.message) || err)}`, vm.lineaActual), false);
        else {
          let v, ok = true;
          try { v = terminarNativa(llamar, r, cajas, f.nombre); }
          catch (e) { if (!(e instanceof ErrorTiempoEjecucion)) throw e; ok = false; v = vm.nuevoError('nativo', e.message, vm.lineaActual); }
          vm.cumplir(p, v, ok);
        }
      })));
      return p;
    }, 'enFondo(f, args…) — llama a una función nativa en otro hilo y devuelve una promesa: «esperar enFondo(f, x)»');
  };

  // ------------------------------------------------------------- excepciones
  seccion('excepciones');
  def('error', '... -> error', a => {
    const msg = a.length ? repr(a[0], 0) : '';
    const tipo = a.length > 1 ? txt(a[1], 2, 'error') : 'programa';
    return vm.nuevoError(tipo, msg, vm.lineaActual);
  }, 'error(mensaje, tipo?) — construye un error para lanzarlo');

  // ===================================================== MÓDULOS
  // Esto no es una función de la biblioteca: es lo que el compilador emite
  // donde el programa escribió «usar». Se llama « usar», con un espacio
  // delante, y el léxico no acepta espacios dentro de un identificador, así que
  // ningún programa puede alcanzarla ni tapándola ni llamándola. El lenguaje
  // sigue sin tener un «cargar()»: cargar módulos no es algo que un programa
  // pueda pedir, es algo que el compilador deja escrito donde había un «usar».
  //
  // Aquí solo se ejecuta: encontrar y compilar el módulo ya pasó al analizar.
  // Y aquí es donde se cumplen las dos reglas de ejecución: una sola vez, y los
  // ciclos no desbordan la pila.
  // (motor-exp N4.11) las marcas de «sinComprobar { … }»: en la VM no hacen nada,
  // porque la VM comprueba siempre (es donde se depura). Las miran el ejecutable
  // de n-compilar y C1EÑ en nativo y en la GPU, que ahí quitan las comprobaciones.
  vm.definirNativa(' sinComprobar', 'entero -> nulo', () => null);
  vm.definirNativa(' usar', 'cualquiera -> nulo', a => {
    const clave = a[0];
    // Un eDSL nativo se instala al crear el motor, así que cuando el programa
    // llega a su «usar» sus funciones ya existen. No está en el registro de
    // ejecución porque no hay nada que ejecutar.
    if (vm.edslPorClave && vm.edslPorClave.has(clave)) return null;
    const reg = vm.modulos ? vm.modulos.get(clave) : null;
    if (!reg) vm.error(`no hay módulo compilado para «${rutaCorta(String(clave))}»`,
      'un .elb no lleva dentro los módulos que importaba: vuelve a ejecutarlo desde el código fuente');
    // «cargando» es un ciclo: el módulo está a medio ejecutar más abajo en la
    // pila. Seguir es lo correcto —sus funciones ya están definidas, porque el
    // compilador las eleva antes de los «usar»— y es lo que evita la recursión
    // infinita sin necesidad de detectar nada.
    if (reg.estado !== 'nuevo') return null;
    reg.estado = 'cargando';
    vm.invocar(vm.registrar(new ObjCierre(reg.fn)), []);
    reg.estado = 'listo';
    return null;
  });

  // ------------------------------------------------------------ introspección
  seccion('introspección');
  def('ahora', ' -> real', () => Date.now(), 'milisegundos desde 1970');
  def('reloj', ' -> real', () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), 'cronómetro en milisegundos');
  def('memoria', ' -> dic<texto,entero>', () => {
    const d = D();
    d.mapa.set('objetos', vm.monton.length);
    d.mapa.set('recolecciones', vm.stats.gc);
    d.mapa.set('liberados', vm.stats.liberados);
    d.mapa.set('pico', vm.stats.picoMonton);
    return d;
  }, 'estadísticas del recolector de basura');
  def('recolectar', ' -> nulo', () => { vm.recolectar(); return null; }, 'fuerza una recolección de basura');
  def('instrucciones', ' -> entero', () => vm.instrucciones, 'instrucciones de bytecode ejecutadas');

  // ---------------------------------------------------------------- los eDSL
  // Se instalan al final, cuando la biblioteca global ya está entera: un eDSL
  // puede apoyarse en ella, y no al revés.
  instalarEdsl(vm, 'formato', instalarFormato(vm));
  instalarEdsl(vm, 'fecha', instalarFecha(vm));
  instalarEdsl(vm, 'probar', instalarProbar(vm));
  // Los que se mudaron del ámbito global llevan «enClasico»: son los que
  // «usar "clasico"» devuelve.
  // La lista de cada uno son los nombres que ESTABAN en el ámbito global antes
  // de mudarse, con el nombre que tienen hoy. Lo que se escribió después no
  // entra: ningún programa viejo lo espera.
  instalarEdsl(vm, 'texto', instalarTexto(vm), {
    enClasico: ['mayusculas', 'minusculas', 'recortar', 'dividir', 'unir',
      'reemplazar', 'empiezaCon', 'terminaCon', 'subtexto'],
  });
  instalarEdsl(vm, 'numerico', instalarNumerico(vm), {
    enClasico: ['raiz', 'absoluto', 'piso', 'techo', 'seno', 'coseno', 'tangente',
      'arcoseno', 'arcocoseno', 'arcotangente', 'exp', 'log', 'log10', 'signo',
      'redondear', 'potencia', 'suma', 'media', 'mediana', 'moda', 'varianza',
      'desviacion', 'percentil', 'correlacion', 'regresion', 'normalizar',
      'histograma', 'matriz', 'transponer', 'multMatriz', 'determinante', 'resolver'],
  });
  // «datos» no lleva «enClasico»: ninguno de sus nombres estuvo en el ámbito
  // global, así que nada viejo los espera ahí.
  instalarEdsl(vm, 'datos', instalarDatos(vm));
  instalarEdsl(vm, 'corrutinas', cuerpoCorrutinas);     // (motor-exp) fase X4
  instalarEdsl(vm, 'nativo', cuerpoNativo);             // (motor-exp) fase S1
  instalarEdsl(vm, 'sistema', cuerpoSistema);           // (motor-exp) fase S2
  // De «estilo» sí eran globales 22 nombres. «pares» es el único que NO se
  // reexporta en «clasico»: su sitio en el ámbito global ya está ocupado por el
  // «pares» de los diccionarios, que es quien debía tenerlo desde el principio.
  // Un programa de estilos que lo usara necesita «usar pares de "estilo"».
  instalarEdsl(vm, 'estilo', instalarEstilo(vm), {
    enClasico: ['estilo', 'cssCrudo', 'estiloGlobal', 'fotogramas', 'dentro',
      'alPasar', 'alEnfocar', 'alActivar', 'alVisitar', 'siDeshabilitado',
      'primero', 'ultimo', 'impares', 'antes', 'despues',
      'enPantalla', 'enAlto', 'enOscuro', 'enClaro', 'enImpresion',
      'enMovimientoReducido'],
  });
  // NEÑ —Numeric Extension for Ñ— es UN eDSL hecho de cuatro partes, en este
  // orden a propósito: C1EÑ primero, porque crea «vm.c1en» y las otras partes
  // registran núcleos en él al instalarse (si no existiera se quedarían con su
  // respaldo en JavaScript). Luego cálculo, fórmulas y tensores.
  const regNen = instalarEdsl(vm, 'nen', def => {
    instalarNenC1en(vm, def, host);
    instalarNenCalculo(vm, def);
    instalarNenFormulas(vm, def);
    instalarNenTensores(vm, def);
    instalarNenPrecision(vm, def);      // (motor-exp N1) el tipo «grande» y los enteros exactos
    instalarNenAmplitud(vm, def);       // (motor-exp N1) especiales, distribuciones y muestreo (1.ª tanda)
    instalarNenUnion(vm, def);          // (motor-exp N1) fila, donde y apilar para arreglos Y tablas
  });
  reexportarEnNen(vm, regNen);          // (motor-exp N1) todo numerico y todo datos, también desde «nen»
  // El interruptor va al final: es la unión de los de arriba.
  instalarClasico(vm);
  // Y los eDSL que este motor trae ABIERTOS: en el ámbito global, sin «usar».
  abrirEdsls(vm, (host && host.abiertos) || (typeof C1EN_ABIERTOS !== 'undefined' ? C1EN_ABIERTOS : null));

  return vm;
}

// ================================================================ eDSL abiertos
// Un perfil del motor puede traer eDSL ya abiertos: sus nombres están en el
// ámbito global desde el arranque, como «imprimir», y no hace falta «usar».
// Es lo que hace el motor C1EÑ con numerico y nen: quien hace matemáticas no
// tiene por qué saber en qué eDSL vive «derivar».
//
// Cómo: cada nativa de un eDSL ya existe en «globals» con la clave del módulo
// delante («ñ:nen\0derivar»). Abrirlo es registrar EL MISMO objeto también bajo
// su nombre corto. No se copia nada: el verificador ve una global más (con la
// misma firma), el JIT y la VM llaman al mismo cuerpo, y «usar derivar de
// "nen"» sigue funcionando igual, así que un programa escrito para el motor
// normal corre sin cambios en el perfil.
//
// La única regla: un nombre abierto no puede tapar a uno del núcleo ni a otro
// eDSL abierto. Si pasa, es un error al construir el motor, no un silencio.
function abrirEdsls(vm, nombres) {
  if (!nombres || !nombres.length) return;
  const origen = new Map();
  for (const nombre of nombres) {
    const r = vm.edsls.get(nombre);
    if (!r) throw new Error(`no se puede abrir el eDSL «${nombre}»: no existe`);
    for (const [corto] of r.exporta) {
      const largo = nombreGlobalModulo(r.clave, corto);
      const obj = vm.globals.get(largo);
      // (motor-exp N1) «nen» reexporta numerico y datos con EL MISMO objeto: si
      // ya lo abrió otro eDSL, es el mismo nombre para lo mismo, no un choque.
      if (origen.has(corto) && vm.globals.get(corto) === obj) continue;
      // Y las tres de NEÑ que valen para arreglos y tablas (fila, donde, apilar)
      // pueden ocupar el sitio de la de numerico o datos: hacen lo mismo y más.
      if (origen.has(corto) && obj && obj.despacha && obj.despacha.includes(vm.globals.get(corto))) {
        vm.globals.set(corto, obj); origen.set(corto, nombre); continue;
      }
      if (vm.globals.has(corto)) {
        const quien = origen.get(corto);
        throw new Error(quien
          ? `al abrir «${nombre}»: «${corto}» ya lo trae abierto «${quien}»`
          : `al abrir «${nombre}»: «${corto}» taparía al «${corto}» del núcleo`);
      }
      vm.globals.set(corto, obj);
      origen.set(corto, nombre);
    }
    r.abierto = true;
  }
  vm.edslsAbiertos = nombres.slice();
}

// ======================================================= eDSL que vienen dentro
// Un eDSL nativo es un módulo cuyo código está en el motor en vez de en un
// archivo. Por dentro no es un caso especial: sus funciones son globales con la
// clave delante, las mismas que emite «usar» para un .esl, así que el
// compilador, el JIT, el recolector y el serializador no se enteran.
//
// Lo que sí gana es lo de fuera: los nombres no están en el ámbito global, así
// que «color», «punto» o «mover» siguen libres para quien no los importe, y dos
// eDSL pueden llamar igual a cosas distintas sin chocar.
function instalarEdsl(vm, nombre, cuerpo, opciones) {
  opciones = opciones || {};
  const clave = claveEdsl(nombre);
  const exporta = new Map();
  const previa = vm.seccionActual;
  vm.seccionActual = nombre;
  // Misma forma que el «def» de la biblioteca: la firma es texto y de ella sale
  // la aridad. La diferencia es que el nombre se guarda con la clave delante y
  // se apunta en la tabla de exportaciones que lee el verificador.
  const def = (n, fir, fn, doc) => {
    if (exporta.has(n)) throw new Error(`el eDSL «${nombre}» declara «${n}» dos veces`);
    const largo = nombreGlobalModulo(clave, n);
    vm.definirNativa(largo, fir, fn, doc);
    const obj = vm.globals.get(largo);
    obj.edsl = nombre;
    obj.nombreCorto = n;
    exporta.set(n, obj.firma);
  };
  try { cuerpo(def); } finally { vm.seccionActual = previa; }
  // «enClasico» es la LISTA de nombres que estuvieron en el ámbito global, no un
  // sí o no por eDSL. La diferencia importa: «texto» tiene 9 nombres que se
  // mudaron y 40 escritos después, y «usar "clasico"» solo tiene que devolver
  // los 9 —los otros nunca estuvieron ahí, así que ningún programa viejo los
  // espera—. Marcarlo por eDSL metía en «clasico» nombres nuevos, y con ellos
  // el primer choque: «entre» existe en «texto» (lo que hay entre dos marcas) y
  // en «numerico» (si un número está en un intervalo), y son distintas.
  const enClasico = opciones.enClasico || null;
  if (enClasico) for (const n of enClasico)
    if (!exporta.has(n)) throw new Error(`el eDSL «${nombre}» dice que «${n}» venía del ámbito global, y no lo exporta`);
  const reg = { nombre, clave, exporta, enClasico, globalDe: null };
  vm.edsls.set(nombre, reg);
  vm.edslPorClave.set(clave, reg);
  return reg;
}

// El interruptor. No define ni una función: reexporta las de los eDSL marcados,
// apuntando a su global de verdad. Por eso no puede separarse de ellos ni
// quedarse atrás — es la unión, calculada, no una lista escrita a mano.
//
//   usar "clasico"      → el ámbito de siempre, todo a mano
//   (sin esa línea)     → solo el núcleo; lo demás se pide con «usar»
//
// Y por eso el modo es POR ARCHIVO: el enlace ya lo era. Una biblioteca escrita
// a la vieja funciona dentro de un programa escrito a la nueva, y al revés.
function instalarClasico(vm) {
  const exporta = new Map();
  const globalDe = new Map();
  const origenDe = new Map();          // nombre → el eDSL de donde salió
  for (const r of vm.edsls.values()) {
    if (!r.enClasico) continue;
    for (const n of r.enClasico) {
      // Dos eDSL no pueden traer el mismo nombre al ámbito global: antes de la
      // mudanza había uno solo, así que si aparecen dos es que alguien marcó
      // como «venía de global» algo que no venía.
      if (exporta.has(n))
        throw new Error(`«${n}» viene del ámbito global según «${r.nombre}» y según «${origenDe.get(n)}»`);
      // Y tampoco puede reexportar un nombre que SIGUE siendo global: eso no
      // devuelve nada, lo tapa. Es como estaba «pares» —el de los estilos
      // enterraba al de los diccionarios—, y sin esta comprobación la mudanza
      // lo habría vuelto a enterrar por la puerta de atrás.
      if (vm.globals.has(n))
        throw new Error(`«${n}» está en el «enClasico» de «${r.nombre}» pero sigue siendo un global: ` +
          'reexportarlo taparía al de verdad');
      exporta.set(n, r.exporta.get(n));
      globalDe.set(n, nombreGlobalModulo(r.clave, n));
      origenDe.set(n, r.nombre);
    }
  }
  const clave = claveEdsl('clasico');
  const reg = { nombre: 'clasico', clave, exporta, enClasico: false, globalDe, origenDe };
  vm.edsls.set('clasico', reg);
  vm.edslPorClave.set(clave, reg);
  return reg;
}

// ===================================================================== Fachada

// Se queda por compatibilidad con quien la importaba de fuera (util/referencia.js,
// las pruebas). Ya no es una tabla escrita a mano: monta una VM de usar y tirar e
// itera su registro, así que no puede desviarse de lo que la biblioteca define.
function tiposGlobales() {
  const vm = new VM({});
  instalarBiblioteca(vm, {});
  return vm.tiposGlobales();
}

function crearMotor(opciones) {
  opciones = opciones || {};
  const vm = new VM(opciones);
  instalarBiblioteca(vm, opciones.host || {});
  const cargadorModulos = () => (opciones.host && opciones.host.modulos) || null;
  return {
    vm,
    // Analiza sin ejecutar: devuelve {ok, errores, avisos, fn, ast, modulos}
    // «clave» es de dónde viene este texto: la ruta canónica del programa, para
    // poder resolver contra ella las rutas relativas de sus «usar». Un programa
    // sin «usar» no la necesita, y todo lo de módulos se queda sin tocar.
    analizar(fuente, clave) {
      const res = { ok: false, errores: [], avisos: [], fn: null, ast: null, modulos: [] };
      let toks, ast;
      try { toks = lexer(fuente); } catch (e) { res.errores.push(e); return res; }
      try { ast = parser(toks, 'principal'); } catch (e) { res.errores.push(e); return res; }
      res.ast = ast;
      const tipos = vm.tiposGlobales();
      const ixEdsl = vm.indiceEdsl();

      // ── módulos ──────────────────────────────────────────────────────────
      const usos = ast.cuerpo.filter(s => s.tipo === 'Usar');
      let enlaceRaiz = null;
      if (usos.length) {
        const cargador = cargadorModulos();
        // Los eDSL nativos no salen de ningún disco, así que un programa que
        // solo los use funciona igual dentro de la zona aislada del navegador.
        // El anfitrión hace falta para los «usar» que sí son archivos.
        const deDisco = usos.filter(u => !vm.edsls.has(u.ruta));
        if (deDisco.length && !cargador) {
          // Dentro del navegador esto es lo que pasa, y es la decisión, no una
          // laguna: la zona aislada tiene origen opaco y no puede leer un disco
          // que no existe. Darle un cargador por la red sería el «cargar()» que
          // el proyecto decidió no tener.
          res.errores.push(new ErrorFuente('módulos', `«usar "${deDisco[0].ruta}"» necesita un anfitrión con módulos`,
            deDisco[0].linea, deDisco[0].col,
            'aquí dentro no hay sistema de archivos que leer; los módulos funcionan fuera del navegador: ' +
            'node motor/util/n-node.js programa.esl, o qjs --std motor/util/n.js programa.esl'));
          return res;
        }
        if (deDisco.length && (typeof clave !== 'string' || !clave)) {
          res.errores.push(new ErrorFuente('módulos', 'no se sabe desde qué archivo resolver «usar»',
            deDisco[0].linea, deDisco[0].col, 'el anfitrión tiene que decir de dónde salió el programa'));
          return res;
        }
        const mods = new Modulos(cargador, clave, vm.edsls);
        // Cada error y cada aviso se sella con el archivo del que salió: en un
        // programa de cinco archivos, «línea 3» a secas no dice nada.
        const sellar = (lista, arch) => { for (const e of lista) if (e && !e.archivo) e.archivo = arch; return lista; };
        const mios = (f, arch) => {
          const errs = [], avs = [];
          const r = f(errs, avs);
          res.errores.push(...sellar(errs, arch));
          res.avisos.push(...sellar(avs, arch));
          return r;
        };

        enlaceRaiz = mios((errs, avs) => enlazar(ast, null, mods, errs, avs, tipos), null);
        // Enlazar un archivo descubre sus dependencias, que se van añadiendo a
        // «orden»; el bucle sigue hasta que no queda nada nuevo. Un ciclo no lo
        // alarga: lo ya leído está en caché y no vuelve a entrar en la lista.
        const enlaces = new Map();
        for (let i = 0; i < mods.orden.length; i++) {
          const k = mods.orden[i];
          if (enlaces.has(k)) continue;
          const a = mods.ast.get(k);
          enlaces.set(k, mios((errs, avs) => enlazar(a, k, mods, errs, avs, tipos), rutaCorta(k)));
        }
        // Y ahora se comprueban los tipos y se compila cada módulo. Todo antes
        // de ejecutar nada: si el tercer archivo tiene un error de tipos, se
        // dice ya y no a mitad de programa.
        for (const k of mods.orden) {
          const a = mods.ast.get(k), e = enlaces.get(k);
          const tc = verificarTipos(a, tipos, e, ixEdsl);
          res.avisos.push(...sellar(tc.avisos, rutaCorta(k)));
          if (tc.errores.length) { res.errores.push(...sellar(tc.errores, rutaCorta(k))); continue; }
          try { res.modulos.push({ clave: k, fn: compilar(a, rutaCorta(k), e) }); }
          catch (err) { sellar([err], rutaCorta(k)); res.errores.push(err); }
        }
        if (res.errores.length) return res;
      }

      const tc = verificarTipos(ast, tipos, enlaceRaiz, ixEdsl);
      res.avisos.push(...tc.avisos);
      if (tc.errores.length) { res.errores.push(...tc.errores); return res; }
      try { res.fn = compilar(ast, 'principal', enlaceRaiz); } catch (e) { res.errores.push(e); return res; }
      res.ok = true;
      return res;
    },
    // Compila y devuelve el programa como bytes portables. Se apoya en
    // analizar(), así que un programa con errores de tipo no llega a existir
    // como bytecode.
    serializar(fuente, clave) {
      const a = this.analizar(fuente, clave);
      if (!a.ok) return { ok: false, errores: a.errores, avisos: a.avisos };
      // El .elb guarda UNA función y su árbol de funciones anidadas. Un programa
      // con «usar» son varios archivos que se resuelven contra un disco, y
      // meterlos dentro querría decir cambiar el formato —y con él la huella, y
      // con ella todos los .elb de antes— para guardar rutas absolutas que en
      // otra máquina no valen. Se dice y no se hace.
      // Un eDSL nativo no cuenta: su clave («ñ:formato») es la misma en toda
      // máquina, así que el bytecode que lo nombra sigue siendo portable. Lo
      // que no cabe son los archivos, cuya clave es una ruta absoluta de aquí.
      if (a.modulos.length)
        return { ok: false, avisos: a.avisos, errores: [new ErrorFuente('módulos',
          'un programa que importa archivos todavía no se puede guardar como .elb',
          1, 1, 'el .elb guarda un archivo, y esto son ' + (a.modulos.length + 1) +
          '; ejecútalo desde el código fuente — los «usar» de un eDSL sí se guardan, porque no son archivos')] };
      try { return { ok: true, bytes: serializar(a.fn), avisos: a.avisos, fn: a.fn }; }
      catch (e) { return { ok: false, errores: [e], avisos: a.avisos }; }
    },
    // Ejecuta bytecode ya compilado. Lo verifica entero antes de tocarlo, y lo
    // que carga no puede llegar al JIT porque no trae AST.
    ejecutarBytecode(datos) {
      let fn;
      try { fn = deserializar(datos); }
      catch (e) { return { ok: false, errores: [e], avisos: [] }; }
      return this.correr(fn);
    },
    ejecutar(fuente, clave) {
      const a = this.analizar(fuente, clave);
      if (!a.ok) return { ok: false, errores: a.errores, avisos: a.avisos };
      return this.correr(a.fn, a.avisos, a.modulos);
    },
    correr(fn, avisos, modulos) {
      avisos = avisos || [];
      const a = { fn, avisos };
      // El registro de ejecución: clave → {fn, estado}. Es lo que consulta la
      // nativa « usar» para no ejecutar dos veces lo mismo, y se rehace en cada
      // ejecución porque el estado de un módulo es de esta corrida, no del motor.
      vm.modulos = new Map((modulos || []).map(m => [m.clave, { fn: m.fn, estado: 'nuevo' }]));
      vm.instrucciones = 0;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try {
        vm.ejecutarPrograma(a.fn);
        const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        return { ok: true, ms, avisos: a.avisos, fn: a.fn, stats: vm.stats, instrucciones: vm.instrucciones };
      } catch (e) {
        const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        return { ok: false, errores: [e], avisos: a.avisos, ms, fn: a.fn, stats: vm.stats };
      }
    },
  };
}

if (typeof module !== 'undefined') module.exports = { instalarBiblioteca, crearMotor, tiposGlobales };
