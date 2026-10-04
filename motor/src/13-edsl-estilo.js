// ============================================================================
//  Ñ v4 — eDSL «estilo»: reglas de CSS como valores de primera clase
//  Parte 13.
//
//  Se importa con:  usar "estilo"
//
//  QUÉ HAY AQUÍ Y QUÉ NO. La maquinaria —el diccionario de propiedades y de
//  valores en español, la composición, el anidamiento y la emisión de la clase
//  local— ya existía y funcionaba; estaba suelta en la biblioteca, con sus 22
//  nombres en el ámbito global de todo programa. Este archivo la recoge entera
//  y se la queda. La biblioteca sigue necesitando TRES cosas de ella, porque un
//  nodo de la página lleva estilo dentro: saber si un valor es un estilo,
//  fusionar dos, y sacar la clase y el CSS de uno. Esas tres salen por
//  «vm.estilos», y son la misma copia: si la regla de traducir «transparente»
//  cambia, cambia en un solo sitio.
//
//  LO QUE LE FALTABA: TOKENS DE DISEÑO. Es lo más usado de SCSS y lo único que
//  de verdad faltaba. Sin ello, un color se escribe a mano en diez sitios, que
//  es como muere todo sistema visual. La forma que se eligió no es un registro
//  global de valores —eso rompería lo que hace bueno al sistema actual, que
//  nada sea global por accidente— sino variables de CSS:
//
//    tema({"color": {"acento": "#4F3FD4"}, "espacio": {"m": 16}})
//
//  devuelve un ESTILO cuyas propiedades son «--color-acento: #4F3FD4» y
//  «--espacio-m: 16px», y «color("acento")» devuelve el texto «var(--color-acento)»,
//  que sirve como valor de cualquier propiedad. De ahí salen tres cosas gratis:
//
//    · el modo oscuro es volver a declarar el tema dentro de «enOscuro(…)», sin
//      tocar ni una regla de los componentes;
//    · dos temas pueden convivir, porque la variable la resuelve la cascada
//      donde se use, no una tabla global en el momento de escribir la regla;
//    · un nombre de token mal escrito se caza, porque «tema» apunta los nombres
//      que declaró y el accesor se queja con la lista de los que sí existen.
//
//  De esa última sale la única regla de uso: DECLARA EL TEMA ANTES DE USAR SUS
//  TOKENS. La comprobación es de ejecución, así que mira lo que se haya
//  declarado hasta ese momento; al CSS le da igual el orden, pero a esta no.
//  «tema» arriba del archivo, que es donde se pone de todas formas.
//
//  EL CHOQUE DE «color». En «estilo», «color("acento")» lee un token. Pero
//  «color» ya es un global: el del pincel del lienzo, que pertenece al eDSL
//  «dibujo» y todavía no se ha mudado. Son dos cosas distintas con un nombre, y
//  por eso está declarado como excepción a propósito en pruebas/edsl.js. No es
//  el caso de «tabla», que hubo que renombrar: «tabla» es además el nombre de
//  un TIPO, y un tipo se escribe en todos los archivos, no solo en los que
//  hacen «usar». Cuando «dibujo» se mude, cada «color» vivirá en su eDSL y la
//  excepción hay que borrarla —y la prueba de excepciones declaradas falla ese
//  día, que es justo cuando hay que decidirlo.
// ============================================================================
'use strict';

// La maquinaria. Se construye una vez por motor y vive en «vm.estilos», porque
// la biblioteca la necesita para los nodos de la página y no puede haber dos
// copias de estas reglas.
function maquinariaEstilo(vm, w, sinPagina) {
  // Los @keyframes que declaró el programa. Se guardan porque limpiarPagina()
  // se lleva la hoja de clases entera: sin este registro, la animación existe
  // hasta el primer repintado y luego desaparece sin decir nada.
  const animaciones = new Map();
  // Los nombres de token que el programa declaró con «tema», por grupo. Solo
  // sirven para cazar el nombre mal escrito: el valor que se emite es siempre
  // «var(--grupo-nombre)», así que quien manda es la cascada, no esta tabla.
  const tokens = new Map();
  const PROPS = {
    // caja
    ancho: 'width', alto: 'height', anchoMin: 'min-width', anchoMax: 'max-width',
    altoMin: 'min-height', altoMax: 'max-height',
    relleno: 'padding', rellenoArriba: 'padding-top', rellenoAbajo: 'padding-bottom',
    rellenoIzquierda: 'padding-left', rellenoDerecha: 'padding-right',
    margen: 'margin', margenArriba: 'margin-top', margenAbajo: 'margin-bottom',
    margenIzquierda: 'margin-left', margenDerecha: 'margin-right',
    borde: 'border', bordeArriba: 'border-top', bordeAbajo: 'border-bottom',
    bordeIzquierda: 'border-left', bordeDerecha: 'border-right',
    bordeColor: 'border-color', bordeAncho: 'border-width', bordeEstilo: 'border-style',
    redondeo: 'border-radius', sombra: 'box-shadow', cajaModelo: 'box-sizing',
    // color y fondo
    color: 'color', fondo: 'background', fondoColor: 'background-color',
    fondoImagen: 'background-image', fondoTamano: 'background-size',
    fondoPosicion: 'background-position', fondoRepetir: 'background-repeat',
    opacidad: 'opacity',
    // texto
    fuente: 'font-family', tamano: 'font-size', grosor: 'font-weight',
    cursiva: 'font-style', interlineado: 'line-height', espaciado: 'letter-spacing',
    alinear: 'text-align', decoracion: 'text-decoration', mayusculas: 'text-transform',
    sombraTexto: 'text-shadow', sangria: 'text-indent', ajusteTexto: 'white-space',
    partirPalabra: 'word-break', partirTexto: 'overflow-wrap',
    // disposición
    mostrar: 'display', posicion: 'position', arriba: 'top', abajo: 'bottom',
    izquierda: 'left', derecha: 'right', capa: 'z-index', flotar: 'float',
    desbordar: 'overflow', desbordarX: 'overflow-x', desbordarY: 'overflow-y',
    visibilidad: 'visibility',
    // flex y rejilla
    direccion: 'flex-direction', justificar: 'justify-content',
    alinearItems: 'align-items', alinearPropio: 'align-self', envolver: 'flex-wrap',
    hueco: 'gap', crecer: 'flex-grow', encoger: 'flex-shrink', baseFlex: 'flex-basis',
    orden: 'order', columnas: 'grid-template-columns', filas: 'grid-template-rows',
    areaRejilla: 'grid-area', columna: 'grid-column', fila: 'grid-row',
    // movimiento y otros
    transicion: 'transition', transformar: 'transform', animacion: 'animation',
    cursor: 'cursor', relleno2: 'fill', trazo: 'stroke', objetoAjuste: 'object-fit',
    filtro: 'filter', puntero: 'pointer-events', usuarioSeleccion: 'user-select',
    contenido: 'content',
  };
  // Estas llevan número pelado: ponerles «px» las rompe.
  const SIN_UNIDAD = new Set(['opacity', 'z-index', 'flex-grow', 'flex-shrink', 'flex',
    'line-height', 'font-weight', 'order', 'zoom', 'columns', 'column-count', 'tab-size']);
  const PROP_OK = /^(--)?[a-zA-Z][a-zA-Z0-9-]*$/;
  const SELECTOR_OK = /^[^{}@;]*$/;

  const esEstilo = v => v instanceof ObjEstilo;

  function nombrePropiedad(bruto) {
    const n = String(bruto);
    if (n.startsWith('--')) return n;                       // variable de CSS
    const css = PROPS[n] || n.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    if (!PROP_OK.test(css)) vm.error(`«estilo»: «${bruto}» no es un nombre de propiedad válido`);
    return css;
  }

  // Los nombres de propiedad se traducen desde el principio; los valores no, y
  // eso hacía que «{"fondo": "transparente"}» saliera como «background:
  // transparente» —CSS inválido que el navegador tira sin decir nada—. Un
  // lenguaje que te deja escribir la propiedad en español y luego te obliga a
  // saber la palabra en inglés para el valor no está terminado.
  const VALORES = {
    ninguno: 'none', ninguna: 'none', nada: 'none',
    transparente: 'transparent', automatico: 'auto', automatica: 'auto', heredado: 'inherit',
    heredada: 'inherit', inicial: 'initial', sinDefinir: 'unset',
    // disposición
    bloque: 'block', enLinea: 'inline', bloqueEnLinea: 'inline-block', rejilla: 'grid',
    tabla: 'table', celda: 'table-cell', contenidos: 'contents',
    relativo: 'relative', absoluto: 'absolute', fijado: 'fixed', pegajoso: 'sticky',
    estatico: 'static',
    // «fila» no estaba, y estaba «columna»: {"direccion": "fila"} salía como
    // «flex-direction: fila», CSS inválido que el navegador tira sin decir nada
    // y deja el elemento en columna. Lo encontró «enFila» al escribirse, no una
    // lectura de esta tabla.
    fila: 'row', columna: 'column',
    columnaInversa: 'column-reverse', filaInversa: 'row-reverse',
    envolver: 'wrap', sinEnvolver: 'nowrap',
    centro: 'center', centrado: 'center', inicio: 'flex-start', final: 'flex-end',
    entre: 'space-between', alrededor: 'space-around', parejo: 'space-evenly',
    estirar: 'stretch', linea: 'baseline',
    izquierda: 'left', derecha: 'right', arriba: 'top', abajo: 'bottom',
    justificado: 'justify',
    oculto: 'hidden', oculta: 'hidden', visible: 'visible', desplazar: 'scroll',
    // texto
    negrita: 'bold', masNegrita: 'bolder', ligera: 'lighter',
    cursiva: 'italic', oblicua: 'oblique', normal: 'normal',
    mayusculas: 'uppercase', minusculas: 'lowercase', capital: 'capitalize',
    subrayado: 'underline', tachado: 'line-through',
    preformateado: 'pre', preLinea: 'pre-line', preEnvuelto: 'pre-wrap',
    // otros
    mano: 'pointer', puntero: 'pointer', texto2: 'text', noPermitido: 'not-allowed',
    mover: 'move', espera: 'wait', ayuda: 'help', agarrar: 'grab',
    cubrir: 'cover', contener: 'contain', rellenar2: 'fill',
    solido: 'solid', punteado: 'dotted', rayado: 'dashed', doble: 'double',
    redondo: 'round', cuadrado: 'square',
    // colores
    blanco: 'white', negro: 'black', rojo: 'red', verde: 'green', azul: 'blue',
    amarillo: 'yellow', naranja: 'orange', morado: 'purple', violeta: 'violet',
    rosa: 'pink', gris: 'gray', grisClaro: 'lightgray', grisOscuro: 'darkgray',
    marron: 'brown', cian: 'cyan', magenta: 'magenta', dorado: 'gold',
    plateado: 'silver', turquesa: 'turquoise', beige: 'beige', lima: 'lime',
    azulMarino: 'navy', aguamarina: 'aquamarine', coral: 'coral', salmon: 'salmon',
  };
  // Aquí el valor es texto libre, no palabras clave: traducir «negrita» dentro
  // de un nombre de tipografía o de un contenido sería peor que no traducir.
  const TEXTO_LIBRE = new Set(['content', 'font-family', 'grid-template-areas', 'quotes']);

  function traducirValor(css, s) {
    if (TEXTO_LIBRE.has(css) || css.startsWith('--')) return s;
    // Palabra por palabra: «2px solid azul» → «2px solid blue».
    return s.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*/g,
      p => (Object.prototype.hasOwnProperty.call(VALORES, p) ? VALORES[p] : p));
  }

  function valorPropiedad(css, v) {
    if (v instanceof ObjLista) return v.items.map(x => valorPropiedad(css, x)).join(' ');
    if (typeof v === 'number') {
      if (v === 0 || SIN_UNIDAD.has(css) || css.startsWith('--')) return repr(v, 0);
      return repr(v, 0) + 'px';                             // los números son píxeles
    }
    const s = repr(v, 0);
    // Un valor no puede cerrar su regla ni salirse de la hoja de estilos: es el
    // mismo principio que en el árbol de la página, los datos no son marcado.
    if (/[{};]/.test(s) || /<\s*\//.test(s)) {
      vm.error(`«estilo»: el valor de «${css}» contiene caracteres que romperían la hoja`,
        'si necesitas escribir CSS literal, usa cssCrudo("…")');
    }
    return traducirValor(css, s);
  }

  function fusionar(args, quien) {
    const e = vm.nuevoEstilo();
    for (const x of args) {
      if (x === null) continue;
      if (esEstilo(x)) {
        for (const [k, v] of x.props) e.props.set(k, v);    // gana el de la derecha
        for (const r of x.reglas) e.reglas.push(r);
        for (const m of x.medios) e.medios.push(m);
      } else if (x instanceof ObjDic) {
        for (const [k, v] of x.mapa) {
          const css = nombrePropiedad(k);
          e.props.set(css, valorPropiedad(css, v));
        }
      } else {
        vm.error(`«${quien}» solo acepta diccionarios y estilos, y recibió ${tipoDe(x)}`,
          'para CSS escrito a mano usa cssCrudo("…")');
      }
    }
    vm.cobrar(1 + e.props.size);
    return e;
  }

  function anidar(selector, args, quien, global) {
    if (!SELECTOR_OK.test(selector)) vm.error(`«${quien}»: el selector «${selector}» no es válido`);
    const e = vm.nuevoEstilo();
    e.reglas.push({ selector, estilo: fusionar(args, quien), global: !!global });
    vm.cobrar(2);
    return e;
  }


  // ---- de estilo a CSS -----------------------------------------------------
  function huella(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return (h >>> 0).toString(36);
  }
  function canonico(e) {
    let s = '';
    for (const [k, v] of e.props) s += k + ':' + v + ';';
    for (const r of e.reglas) s += (r.global ? '!' : '') + r.selector + '{' + canonico(r.estilo) + '}';
    for (const m of e.medios) s += '@' + m.consulta + '{' + canonico(m.estilo) + '}';
    return s;
  }
  function resolverSelector(sel, padre) {
    return sel.includes('&') ? sel.split('&').join(padre) : padre + ' ' + sel;
  }
  function emitirReglas(e, sel, media, fuera) {
    const props = [];
    for (const [k, v] of e.props) props.push(`${k}:${v}`);
    if (props.length) {
      const regla = `${sel}{${props.join(';')}}`;
      fuera.push(media ? `@media ${media}{${regla}}` : regla);
    }
    for (const r of e.reglas) {
      emitirReglas(r.estilo, r.global ? r.selector : resolverSelector(r.selector, sel), media, fuera);
    }
    for (const m of e.medios) {
      emitirReglas(m.estilo, sel, media ? `${media} and ${m.consulta}` : m.consulta, fuera);
    }
  }
  function cssDe(e) {
    if (e.css) return e.css;
    const nombre = 's' + huella(canonico(e));
    const fuera = [];
    emitirReglas(e, '.' + nombre, null, fuera);
    e.css = { nombre, texto: fuera.join('\n') };
    return e.css;
  }

  return { esEstilo, fusionar, anidar, cssDe, nombrePropiedad, valorPropiedad,
           huella, animaciones, tokens, w, sinPagina, PROPS, VALORES };
}

function instalarEstilo(vm) {
  const M = vm.estilos;
  const { esEstilo, fusionar, anidar, valorPropiedad, huella, animaciones, tokens, w, sinPagina } = M;
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const dic = (v, n, f) => {
    if (!(v instanceof ObjDic)) vm.error(`«${f}»: el argumento ${n} debe ser un diccionario y es ${tipoDe(v)}`);
    return v;
  };
  const D = () => vm.nuevoDic();
  // Un nombre de token acaba dentro de «--grupo-nombre», así que tiene que ser
  // un identificador de CSS y no cualquier texto.
  const NOMBRE_OK = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
  // Los grupos cuyo número NO es una medida. En los demás, 16 significa 16px:
  // es la misma regla que ya tienen las propiedades, y por eso se emite pasando
  // por «valorPropiedad», no traduciendo aquí otra vez.
  const SIN_MEDIDA = new Set(['grosor', 'peso', 'opacidad', 'capa', 'interlineado', 'color']);

  // Un @keyframes se emite una sola vez y devuelve su nombre. Lo usan
  // «fotogramas», que recibe los pasos del programa, y «aparecer»/«deslizar»,
  // que los traen hechos.
  function emitirFotogramas(cuerpo) {
    const nombre = 'a' + huella(cuerpo);
    const regla = `@keyframes ${nombre}{${cuerpo}}`;
    animaciones.set(nombre, regla);
    if (w.asegurarClase) w.asegurarClase(nombre, regla);
    vm.cobrar(2);
    return nombre;
  }
  // Las propiedades de un estilo, como texto de reglas. Es lo que necesita un
  // paso de @keyframes, que no lleva selector.
  const propsDe = e => [...e.props].map(([k, v]) => `${k}:${v}`).join(';');
  // Un estilo hecho de un diccionario de propiedades ya en español, más lo que
  // venga detrás. Así todos los atajos de disposición aceptan «…» como el resto.
  const conMas = (base, resto, quien) => {
    const d = D();
    for (const [k, v] of base) d.mapa.set(k, v);
    return fusionar([d, ...resto], quien);
  };
  const msDe = (v, pordefecto) => (typeof v === 'number' ? v : pordefecto);

  return function (def) {
    // ══════════════════════════════════════════════════════════ componer
    def('estilo', '... -> estilo', a => fusionar(a, 'estilo'),
      'estilo({…}, otroEstilo, …) — compone; gana el de la derecha');
    def('cssCrudo', 'texto -> nulo', a => {
      if (!w.estilo) sinPagina('cssCrudo');
      w.estilo(txt(a[0], 1, 'cssCrudo'));
      return null;
    }, 'cssCrudo(texto) — una hoja de estilos escrita a mano; la puerta de atrás');
    def('estiloGlobal', '... -> estilo',
      a => anidar(txt(a[0], 1, 'estiloGlobal'), a.slice(1), 'estiloGlobal', true),
      'estiloGlobal("selector", …) — se sale del ámbito local, como «:global»');
    def('reiniciar', ' -> estilo', () => {
      // Las cuatro reglas que se escriben en todo proyecto y que nadie recuerda
      // entera. No es una hoja de reinicio completa a propósito: lo que hace es
      // quitar las sorpresas —el margen del body, el modelo de caja que no
      // cuenta el relleno, la imagen que desborda— y nada más.
      const e = vm.nuevoEstilo();
      const g = (sel, props) => {
        const d = D();
        for (const [k, v] of props) d.mapa.set(k, v);
        e.reglas.push({ selector: sel, estilo: fusionar([d], 'reiniciar'), global: true });
      };
      g('*, *::before, *::after', [['cajaModelo', 'border-box']]);
      g('body', [['margen', 0]]);
      g('img, video, canvas, svg', [['mostrar', 'bloque'], ['anchoMax', '100%']]);
      g('button, input, textarea, select', [['fuente', 'inherit'], ['tamano', 'inherit']]);
      vm.cobrar(4);
      return e;
    }, 'reiniciar() — quita las sorpresas del navegador · úsalo una vez, como estiloGlobal');

    // ══════════════════════════════════════════════════ tokens de diseño
    def('tema', 'dic -> estilo', a => {
      // Devuelve un ESTILO con las variables de CSS, no una tabla global. Lo
      // normal es estiloGlobal(":root", tema({…})); dentro de enOscuro(…) se
      // vuelve a declarar y el modo oscuro entero son esas líneas.
      const d = dic(a[0], 1, 'tema');
      const e = vm.nuevoEstilo();
      for (const [grupo, valores] of d.mapa) {
        const g = String(grupo);
        if (!NOMBRE_OK.test(g)) vm.error(`«tema»: «${g}» no sirve como nombre de grupo`,
          'los grupos son nombres sencillos: color, espacio, tipografia, radio, sombra');
        if (!(valores instanceof ObjDic))
          vm.error(`«tema»: el grupo «${g}» tiene que ser un diccionario de nombre → valor`,
            'por ejemplo {"color": {"acento": "#4F3FD4", "fondo": "blanco"}}');
        let vistos = tokens.get(g);
        if (!vistos) tokens.set(g, vistos = new Set());
        for (const [n, v] of valores.mapa) {
          const nm = String(n);
          if (!NOMBRE_OK.test(nm)) vm.error(`«tema»: «${nm}» no sirve como nombre de token`);
          // Se emite por «valorPropiedad» con una propiedad de mentira, para que
          // valgan las mismas reglas que en cualquier otra: «transparente» se
          // traduce, 16 son 16px, y un valor con «;» se rechaza.
          e.props.set(`--${g}-${nm}`, valorPropiedad(SIN_MEDIDA.has(g) ? 'opacity' : 'width', v));
          vistos.add(nm);
        }
      }
      vm.cobrar(1 + e.props.size);
      return e;
    }, 'tema({"color": {…}, "espacio": {…}}) — declara los tokens · ponlo arriba, en estiloGlobal(":root", …)');

    const accesor = (nombre, grupo) => def(nombre, 'texto -> texto', a => {
      const n = txt(a[0], 1, nombre);
      const vistos = tokens.get(grupo);
      if (!vistos || !vistos.size)
        vm.error(`«${nombre}»: ningún «tema» ha declarado el grupo «${grupo}»`,
          `declara el tema primero: estiloGlobal(":root", tema({"${grupo}": {"${n}": …}}))`);
      if (!vistos.has(n))
        vm.error(`«${nombre}»: el tema no declara «${n}» en «${grupo}»`,
          'declarados: ' + [...vistos].join(', '));
      return `var(--${grupo}-${n})`;
    }, `${nombre}("nombre") — el token de ${grupo} que declaró «tema»`);
    accesor('color', 'color');
    accesor('espacio', 'espacio');
    accesor('tipografia', 'tipografia');
    accesor('radio', 'radio');
    accesor('sombraToken', 'sombra');

    def('paleta', '... -> dic', a => {
      // De un color base salen los tonos, aclarando y oscureciendo en el espacio
      // HSL. Sirve para no escribir nueve hexadecimales a mano y, sobre todo,
      // para que los nueve sean del mismo color.
      const base = txt(a[0], 1, 'paleta');
      const cuantos = a.length > 1 ? Math.trunc(num(a[1], 2, 'paleta')) : 9;
      if (cuantos < 3 || cuantos > 25) vm.error('«paleta»: los tonos van de 3 a 25', `pediste ${cuantos}`);
      const rgb = aRgb(base);
      if (!rgb) vm.error(`«paleta»: «${base}» no es un color que se pueda leer`,
        'usa #rgb, #rrggbb o rgb(r, g, b) · los nombres en español solo valen como valor, no como base');
      const [h, s, l] = aHsl(rgb);
      const d = D();
      const medio = (cuantos - 1) / 2;
      for (let i = 0; i < cuantos; i++) {
        // El tono del medio es el color que pasaron, exacto. Los de fuera se
        // acercan al blanco y al negro sin llegar, que es donde un tono deja de
        // tener color.
        const t = (i - medio) / medio;                       // -1 … 0 … 1
        const li = i === medio ? l : (t < 0 ? l + (0.96 - l) * -t : l + (0.08 - l) * t);
        d.mapa.set(String(i + 1), deHsl(h, s, li));
      }
      vm.cobrar(cuantos);
      return d;
    }, 'paleta("#4F3FD4", cuantos?) — los tonos de un color, del más claro al más oscuro · para meter en «tema»');

    def('escalaTipo', '... -> dic', a => {
      // Una escala tipográfica es una razón geométrica, no una lista de tallas
      // elegidas a ojo: por eso los tamaños de una página bien hecha «pegan».
      const base = num(a[0], 1, 'escalaTipo');
      const razon = a.length > 1 ? num(a[1], 2, 'escalaTipo') : 1.25;
      const cuantos = a.length > 2 ? Math.trunc(num(a[2], 3, 'escalaTipo')) : 6;
      if (razon <= 1) vm.error('«escalaTipo»: la razón tiene que ser mayor que 1', `llegó ${razon}`);
      if (cuantos < 2 || cuantos > 20) vm.error('«escalaTipo»: los pasos van de 2 a 20', `pediste ${cuantos}`);
      const d = D();
      for (let i = 0; i < cuantos; i++) {
        const v = base * Math.pow(razon, i);
        d.mapa.set(String(i), Math.round(v * 100) / 100);
      }
      vm.cobrar(cuantos);
      return d;
    }, 'escalaTipo(base, razon?, pasos?) — tamaños en progresión geométrica · para meter en «tema»');

    // ══════════════════════════════════════════════════════════ estados
    const estado = (nombre, sel) => def(nombre, '... -> estilo',
      a => anidar('&' + sel, a, nombre), `&${sel}`);
    estado('alPasar', ':hover');
    estado('alEnfocar', ':focus');
    estado('alActivar', ':active');
    estado('alVisitar', ':visited');
    estado('siDeshabilitado', ':disabled');
    estado('siInvalido', ':invalid');
    estado('alSeleccionar', ':checked');
    estado('primero', ':first-child');
    estado('ultimo', ':last-child');
    estado('impares', ':nth-child(odd)');
    estado('pares', ':nth-child(even)');
    estado('siVacio', ':empty');
    estado('siSolo', ':only-child');

    def('hijoN', '... -> estilo', a => {
      // Un número o una fórmula: hijoN(3, …) y hijoN("3n+1", …). La fórmula se
      // revisa, porque un selector inválido se lo come el navegador callado y
      // con él se va la regla entera.
      const q = a[0];
      let sel;
      if (typeof q === 'number') sel = String(Math.trunc(q));
      else {
        sel = txt(q, 1, 'hijoN').replace(/\s+/g, '');
        if (!/^(odd|even|impares|pares|[+-]?\d*n?([+-]\d+)?)$/.test(sel) || sel === '')
          vm.error(`«hijoN»: «${sel}» no es una posición válida`,
            'vale un número, «3n+1», «impares» o «pares»');
        if (sel === 'impares') sel = 'odd';
        if (sel === 'pares') sel = 'even';
      }
      return anidar(`&:nth-child(${sel})`, a.slice(1), 'hijoN');
    }, 'hijoN(3, …) · hijoN("3n+1", …) — &:nth-child(…)');

    // ═════════════════════════════════════════════════ pseudoelementos
    const pseudoContenido = (nombre, sel) => def(nombre, '... -> estilo', a => {
      const e = fusionar(a, nombre);
      if (!e.props.has('content')) e.props.set('content', '""');   // sin esto no se pinta
      const env = vm.nuevoEstilo();
      env.reglas.push({ selector: '&' + sel, estilo: e, global: false });
      return env;
    }, `&${sel}`);
    pseudoContenido('antes', '::before');
    pseudoContenido('despues', '::after');
    const pseudo = (nombre, sel) => def(nombre, '... -> estilo',
      a => anidar('&' + sel, a, nombre), `&${sel}`);
    pseudo('marcador', '::marker');
    pseudo('seleccion', '::selection');
    pseudo('pista', '::placeholder');

    // ══════════════════════════════════════════════════════════ anidar
    def('dentro', '... -> estilo', a => {
      const sel = txt(a[0], 1, 'dentro');
      return anidar(sel.includes('&') ? sel : '& ' + sel, a.slice(1), 'dentro');
    }, 'dentro("selector", …) — anida como el «&» de SCSS');
    def('hijoDirecto', '... -> estilo',
      a => anidar('& > ' + txt(a[0], 1, 'hijoDirecto'), a.slice(1), 'hijoDirecto'),
      'hijoDirecto("selector", …) — solo los hijos, no los nietos');
    def('hermano', '... -> estilo',
      a => anidar('& ~ ' + txt(a[0], 1, 'hermano'), a.slice(1), 'hermano'),
      'hermano("selector", …) — cualquier hermano de después');
    def('hermanoSiguiente', '... -> estilo',
      a => anidar('& + ' + txt(a[0], 1, 'hermanoSiguiente'), a.slice(1), 'hermanoSiguiente'),
      'hermanoSiguiente("selector", …) — solo el de justo después');
    def('cuando', '... -> estilo', a => {
      // Sin espacio: cuando(".activo", …) es «&.activo», el mismo elemento con
      // esa clase encima. Con «dentro» sería «& .activo», otro elemento, y ese
      // espacio de más es un error que no da ningún aviso.
      const sel = txt(a[0], 1, 'cuando');
      return anidar('&' + sel, a.slice(1), 'cuando');
    }, 'cuando(".clase", …) — el mismo elemento cuando además lleva eso · «&.clase», sin espacio');

    // ═══════════════════════════════════════════════════════════ medios
    def('enPantalla', '... -> estilo', a => {
      const min = num(a[0], 1, 'enPantalla');
      let i = 1, consulta = `(min-width: ${min}px)`;
      if (typeof a[1] === 'number') { consulta += ` and (max-width: ${a[1]}px)`; i = 2; }
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a.slice(i), 'enPantalla') });
      vm.cobrar(2);
      return e;
    }, 'enPantalla(minimo, maximo?, …) — una consulta de medios');
    def('enAlto', '... -> estilo', a => {
      const min = num(a[0], 1, 'enAlto');
      let i = 1, consulta = `(min-height: ${min}px)`;
      if (typeof a[1] === 'number') { consulta += ` and (max-height: ${a[1]}px)`; i = 2; }
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a.slice(i), 'enAlto') });
      vm.cobrar(2);
      return e;
    }, 'enAlto(minimo, maximo?, …) — una consulta de medios por altura');
    const medio = (nombre, consulta) => def(nombre, '... -> estilo', a => {
      const e = vm.nuevoEstilo();
      e.medios.push({ consulta, estilo: fusionar(a, nombre) });
      vm.cobrar(2);
      return e;
    }, `${nombre}(…) — @media ${consulta}`);
    medio('enOscuro', '(prefers-color-scheme: dark)');
    medio('enClaro', '(prefers-color-scheme: light)');
    medio('enImpresion', 'print');
    medio('enMovimientoReducido', '(prefers-reduced-motion: reduce)');
    medio('enTactil', '(hover: none) and (pointer: coarse)');
    medio('enApaisado', '(orientation: landscape)');

    // ══════════════════════════════════ disposición, sin recordar flex
    // Estos ocho son atajos, y un atajo solo se gana el sitio si además arregla
    // algo. Los tres que reparten en fila llevan «& > * { min-width: 0 }»:
    // sin eso, un hijo con un texto largo empuja la fila y saca la barra
    // horizontal de la página, que es el fallo más repetido de flex y el más
    // difícil de ver, porque la regla que falta no está en ninguna parte.
    const sinEncogerse = e => {
      e.reglas.push({ selector: '& > *', estilo: fusionar([(() => { const d = D(); d.mapa.set('anchoMin', 0); return d; })()], 'enFila'), global: false });
      return e;
    };
    def('enFila', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['direccion', 'fila'], ['alinearItems', 'centro']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'enFila'));
    }, 'enFila(hueco?, …) — en línea, centrados verticalmente');
    def('enColumna', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['direccion', 'columna']];
      if (i) props.push(['hueco', a[0]]);
      return conMas(props, a.slice(i), 'enColumna');
    }, 'enColumna(hueco?, …) — uno debajo de otro');
    def('centrado', '... -> estilo',
      a => conMas([['mostrar', 'flex'], ['alinearItems', 'centro'], ['justificar', 'centro']], a, 'centrado'),
      'centrado(…) — en el medio, en los dos ejes');
    def('separado', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['alinearItems', 'centro'], ['justificar', 'entre']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'separado'));
    }, 'separado(hueco?, …) — a los extremos, lo de siempre de una barra');
    def('envuelto', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['mostrar', 'flex'], ['envolver', 'envolver'], ['alinearItems', 'centro']];
      if (i) props.push(['hueco', a[0]]);
      return sinEncogerse(conMas(props, a.slice(i), 'envuelto'));
    }, 'envuelto(hueco?, …) — en fila, y pasan de línea cuando no caben');
    def('rejillaDe', '... -> estilo', a => {
      // Un número son columnas iguales, y con «minmax(0, 1fr)» en vez de «1fr»,
      // que es la misma trampa de arriba: con «1fr» una celda con contenido
      // ancho se hace más grande que su parte y descuadra la rejilla entera.
      const q = a[0];
      let plantilla, i = 1;
      if (typeof q === 'number') {
        const n = Math.trunc(q);
        if (n < 1 || n > 64) vm.error('«rejillaDe»: las columnas van de 1 a 64', `pediste ${n}`);
        plantilla = `repeat(${n}, minmax(0, 1fr))`;
      } else plantilla = txt(q, 1, 'rejillaDe');
      const props = [['mostrar', 'rejilla'], ['columnas', plantilla]];
      if (typeof a[1] === 'number') { props.push(['hueco', a[1]]); i = 2; }
      return conMas(props, a.slice(i), 'rejillaDe');
    }, 'rejillaDe(columnas, hueco?, …) — un número de columnas iguales, o la plantilla escrita');
    def('apilado', '... -> estilo', a => {
      // Todos los hijos en la misma celda, unos encima de otros. Es lo que se
      // hace con posición absoluta y sale mal, porque el padre deja de medir.
      // Con una rejilla de una celda el padre mide lo que mida el hijo mayor.
      const e = conMas([['mostrar', 'rejilla']], a, 'apilado');
      const d = D();
      d.mapa.set('areaRejilla', '1 / 1');
      e.reglas.push({ selector: '& > *', estilo: fusionar([d], 'apilado'), global: false });
      return e;
    }, 'apilado(…) — los hijos unos encima de otros, y el padre sigue midiendo');
    def('pegadoArriba', '... -> estilo', a => {
      const i = typeof a[0] === 'number' ? 1 : 0;
      const props = [['posicion', 'pegajoso'], ['arriba', i ? a[0] : 0], ['capa', 1]];
      return conMas(props, a.slice(i), 'pegadoArriba');
    }, 'pegadoArriba(desplazamiento?, …) — se queda arriba al bajar la página');

    // ═════════════════════════════════════════════════════════ movimiento
    def('fotogramas', 'cualquiera -> texto', a => {
      const pasos = a[0];
      if (!(pasos instanceof ObjDic)) vm.error('«fotogramas» espera un diccionario de paso → estilo');
      let cuerpo = '';
      for (const [paso, est] of pasos.mapa) {
        if (!esEstilo(est)) vm.error('«fotogramas»: cada paso tiene que ser un estilo');
        cuerpo += `${String(paso)}{${propsDe(est)}}`;
      }
      return emitirFotogramas(cuerpo);
    }, 'fotogramas({"0%": estilo(…), "100%": estilo(…)}) — devuelve el nombre de la animación');

    def('animar', '... -> estilo', a => {
      // El nombre sale de «fotogramas». «both» va siempre: sin eso, la animación
      // termina y el elemento salta de vuelta a como estaba, que nunca es lo que
      // se quería.
      const nombre = txt(a[0], 1, 'animar');
      const ms = msDe(a[1], 300);
      const resto = typeof a[1] === 'number' ? a.slice(2) : a.slice(1);
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'animar');
    }, 'animar(nombre, ms?, …) — el nombre que devolvió «fotogramas»');

    def('transicion', '... -> estilo', a => {
      // Acepta una propiedad o una lista, en español: transicion(["color", "fondo"]).
      // Nunca «todo»: animar «all» es lo que hace que una página se sienta
      // pegajosa, porque el navegador anima también lo que no se ve.
      const q = a[0];
      const nombres = q instanceof ObjLista ? q.items.map((x, i) => txt(x, i + 1, 'transicion'))
        : [txt(q, 1, 'transicion')];
      const ms = msDe(a[1], 200);
      const resto = typeof a[1] === 'number' ? a.slice(2) : a.slice(1);
      const curva = typeof resto[0] === 'string' ? resto.shift() : 'ease';
      const props = nombres.map(n => {
        const css = M.nombrePropiedad(n);
        if (css === 'all') vm.error('«transicion»: «todo» anima también lo que no se ve',
          'nombra las propiedades que cambian: transicion(["color", "fondo"], 200)');
        return `${css} ${ms}ms ${curva}`;
      });
      vm.cobrar(nombres.length);
      return conMas([['transicion', props.join(', ')]], resto, 'transicion');
    }, 'transicion("color", ms?, curva?, …) · transicion(["color", "fondo"], …)');

    def('aparecer', '... -> estilo', a => {
      const ms = msDe(a[0], 300);
      const resto = typeof a[0] === 'number' ? a.slice(1) : a;
      const nombre = emitirFotogramas('from{opacity:0}to{opacity:1}');
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'aparecer');
    }, 'aparecer(ms?, …) — entra apareciendo');

    def('deslizar', '... -> estilo', a => {
      // deslizar() · deslizar("abajo") · deslizar("izquierda", 400)
      const DESDE = { arriba: [0, -16], abajo: [0, 16], izquierda: [-16, 0], derecha: [16, 0] };
      let desde = 'abajo', i = 0;
      if (typeof a[0] === 'string') { desde = a[0]; i = 1; }
      if (!Object.prototype.hasOwnProperty.call(DESDE, desde))
        vm.error(`«deslizar»: no sé deslizar desde «${desde}»`,
          'vale arriba, abajo, izquierda o derecha');
      const ms = msDe(a[i], 300);
      const resto = typeof a[i] === 'number' ? a.slice(i + 1) : a.slice(i);
      const [x, y] = DESDE[desde];
      const nombre = emitirFotogramas(
        `from{opacity:0;transform:translate(${x}px,${y}px)}to{opacity:1;transform:translate(0,0)}`);
      return conMas([['animacion', `${nombre} ${ms}ms ease both`]], resto, 'deslizar');
    }, 'deslizar(desde?, ms?, …) — entra desde arriba, abajo, izquierda o derecha');
  };
}

// ── color: leer y escribir, para «paleta» ───────────────────────────────────
// Lo justo para generar tonos. No es un eDSL de color y no pretende serlo: si
// hace falta más, «cssCrudo» y las funciones de color del propio CSS están ahí.
function aRgb(s) {
  const t = String(s).trim();
  let m = /^#([0-9a-fA-F]{3})$/.exec(t);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = /^#([0-9a-fA-F]{6})$/.exec(t);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(t);
  if (m) return [1, 2, 3].map(i => Math.min(255, +m[i]));
  return null;
}
function aHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function deHsl(h, s, l) {
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return 6 * t;
    if (t < 1 / 2) return 1;
    if (t < 2 / 3) return (2 / 3 - t) * 6;
    return 0;
  };
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const comp = t => Math.round((l - c / 2 + c * f(t)) * 255);
  const hex = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + hex(comp(h + 1 / 3)) + hex(comp(h)) + hex(comp(h - 1 / 3));
}

if (typeof module !== 'undefined') module.exports = { maquinariaEstilo, instalarEstilo };
