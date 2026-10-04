// ============================================================================
//  El tipo «estilo»: composición, anidamiento al estilo de SCSS, consultas de
//  medios, y clases locales generadas como en CSS Modules. Lo que se comprueba
//  no es que salga CSS, sino que salga el CSS correcto y que dos estilos
//  iguales acaben en la misma clase.
// ============================================================================
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 300) : ''); }
};

function anfitrion() {
  const raiz = { etiq: null, at: {}, hijos: [] };
  let pila = [raiz];
  const act = () => pila[pila.length - 1];
  const clases = new Map();
  const crudo = [];
  const web = {
    asegurarClase(nombre, texto) { if (!clases.has(nombre)) clases.set(nombre, texto); },
    abrir(n, at) { const e = { etiq: n, at, hijos: [] }; act().hijos.push(e); pila.push(e); },
    cerrar() { if (pila.length > 1) pila.pop(); },
    texto(t) { act().hijos.push({ texto: t }); },
    eco(h) { act().hijos.push({ crudo: h }); },
    estilo(c) { crudo.push(c); },
    control(d) { act().hijos.push({ ctrl: d }); },
    limpiar() { raiz.hijos.length = 0; pila = [raiz]; clases.clear(); crudo.length = 0; },
  };
  const ser = n => {
    if (n.texto !== undefined) return n.texto;
    if (n.crudo !== undefined) return n.crudo;
    if (n.ctrl) {
      const at = Object.entries(n.ctrl.atrib || {}).map(([k, v]) => ` ${k}="${v}"`).join('');
      return n.ctrl.forma === 'boton' ? `<button type="button"${at}>${n.ctrl.rotulo}</button>` : `<input${at}>`;
    }
    const dentro = n.hijos.map(ser).join('');
    if (!n.etiq) return dentro;
    const at = Object.entries(n.at || {}).map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<${n.etiq}${at}>${dentro}</${n.etiq}>`;
  };
  return { web, html: () => ser(raiz), clases, crudo };
}

// Los estilos se mudaron a su eDSL, así que cada programa de esta suite lleva su
// propio «usar». Se probó a ponerlo aquí una sola vez, y era peor: util/mudar.js
// lee los programas de dentro de este archivo sin saber de este ayudante, así
// que seguía pidiendo el «usar» en cada uno y la mudanza nunca daba 0. Las
// líneas las escribió mudar.js, que es lo que hará en el código de cualquiera.
function corre(src) {
  const h = anfitrion();
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), host: { web: h.web }, limiteInstr: 5e7 });
  const r = m.ejecutar(src);
  return { r, h, out, html: h.html(), css: [...h.clases.values()].join('\n'), texto: out.join('|') };
}
const cssEs = (nombre, src, esperado) => {
  const c = corre(src);
  if (!c.r.ok) { comprobar(nombre, false, c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')); return c; }
  const limpio = c.css.replace(/\.s[a-z0-9]+/g, '.X');
  comprobar(nombre, limpio === esperado, `esperado: ${esperado}\n      obtenido: ${limpio}`);
  return c;
};
const falla = (nombre, src, fragmento) => {
  const c = corre(src);
  if (c.r.ok) { comprobar(nombre, false, 'no dio error'); return; }
  const msg = c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ');
  comprobar(nombre, !fragmento || msg.toLowerCase().includes(fragmento.toLowerCase()), msg);
};

console.log('\n── 1. de diccionario a CSS ──');
cssEs('propiedades en español', `usar "estilo"\npintar(etiqueta("p", estilo({"fondo": "#fff", "relleno": 14}), "x"))`,
  '.X{background:#fff;padding:14px}');
cssEs('propiedades en CSS también valen', `usar "estilo"\npintar(etiqueta("p", estilo({"background-color": "red", "z-index": 3}), "x"))`,
  '.X{background-color:red;z-index:3}');
cssEs('camello se vuelve guiones', `usar "estilo"\npintar(etiqueta("p", estilo({"borderTopWidth": 2}), "x"))`,
  '.X{border-top-width:2px}');
cssEs('los números son píxeles', `usar "estilo"\npintar(etiqueta("p", estilo({"ancho": 300, "alto": 40}), "x"))`,
  '.X{width:300px;height:40px}');
cssEs('menos donde no llevan unidad', `usar "estilo"\npintar(etiqueta("p", estilo({"opacidad": 0.5, "capa": 10, "interlineado": 1.6, "grosor": 700}), "x"))`,
  '.X{opacity:0.5;z-index:10;line-height:1.6;font-weight:700}');
cssEs('el cero va pelado', `usar "estilo"\npintar(etiqueta("p", estilo({"margen": 0}), "x"))`, '.X{margin:0}');
cssEs('una lista se junta con espacios', `usar "estilo"\npintar(etiqueta("p", estilo({"relleno": [10, 20]}), "x"))`,
  '.X{padding:10px 20px}');
cssEs('las variables de CSS pasan tal cual', `usar "estilo"\npintar(etiqueta("p", estilo({"--acento": "#4F3FD4", "color": "var(--acento)"}), "x"))`,
  '.X{--acento:#4F3FD4;color:var(--acento)}');

console.log('\n── 2. es un valor: se compone ──');
cssEs('gana el de la derecha',
  `usar "estilo"\nfijo a = estilo({"color": "rojo", "relleno": 4})\nfijo b = estilo(a, {"color": "azul"})\npintar(etiqueta("p", b, "x"))`,
  '.X{color:blue;padding:4px}');
const c2 = corre(`
usar estilo de "estilo"

fijo base = estilo({"relleno": 8})
fijo uno = estilo(base, {"color": "rojo"})
fijo dos = estilo(base, {"color": "azul"})
pintar(etiqueta("p", uno, "a"), etiqueta("p", dos, "b"), etiqueta("p", base, "c"))`);
comprobar('tres estilos distintos, tres clases', c2.h.clases.size === 3, c2.h.clases.size);
const c2b = corre(`
usar estilo de "estilo"

fijo x = estilo({"color": "rojo"})
para i en rango(50) { pintar(etiqueta("p", x, texto(i))) }`);
comprobar('repintar mil veces no añade reglas', c2b.h.clases.size === 1, c2b.h.clases.size);
const c2c = corre(`
usar estilo de "estilo"

pintar(etiqueta("p", estilo({"color": "rojo"}), "a"))
pintar(etiqueta("div", estilo({"color": "rojo"}), "b"))`);
comprobar('dos estilos iguales comparten clase', c2c.h.clases.size === 1 &&
  (c2c.html.match(/class="(s[a-z0-9]+)"/g) || []).length === 2, c2c.html);
comprobar('una función que devuelve estilo es un mixin',
  corre(`
usar estilo de "estilo"

fn conBorde(color: texto) -> estilo { devolver estilo({"borde": "1px solid " + color, "redondeo": 6}) }
pintar(etiqueta("p", estilo(conBorde("rojo"), {"relleno": 8}), "x"))`).css.includes('border:1px solid red;border-radius:6px;padding:8px'));

console.log('\n── 3. anidamiento, como el «&» de SCSS ──');
cssEs('estados', `usar "estilo"\npintar(etiqueta("a", estilo({"color": "azul"}, alPasar({"color": "rojo"})), "x"))`,
  '.X{color:blue}\n.X:hover{color:red}');
cssEs('varios estados', `usar "estilo"\npintar(etiqueta("a", estilo(alPasar({"color": "a"}), alEnfocar({"color": "b"}), alActivar({"color": "c"})), "x"))`,
  '.X:hover{color:a}\n.X:focus{color:b}\n.X:active{color:c}');
cssEs('descendientes', `usar "estilo"\npintar(etiqueta("div", estilo({"relleno": 4}, dentro("h3", {"margen": 0})), "x"))`,
  '.X{padding:4px}\n.X h3{margin:0}');
cssEs('el & se coloca donde tú digas', `usar "estilo"\npintar(etiqueta("li", estilo(dentro("& + &", {"margenArriba": 6})), "x"))`,
  '.X + .X{margin-top:6px}');
cssEs('anidado dentro de anidado',
  `usar "estilo"\npintar(etiqueta("div", estilo(dentro("ul", {"margen": 0}, dentro("li", {"relleno": 2}))), "x"))`,
  '.X ul{margin:0}\n.X ul li{padding:2px}');
cssEs('pseudoelementos con contenido por defecto',
  `usar "estilo"\npintar(etiqueta("p", estilo(despues({"color": "gris"})), "x"))`,
  '.X::after{color:gray;content:""}');
cssEs('y con contenido propio',
  `usar "estilo"\npintar(etiqueta("p", estilo(antes({"contenido": "\\"→ \\""})), "x"))`,
  '.X::before{content:"→ "}');

console.log('\n── 4. consultas de medios ──');
cssEs('un mínimo', `usar "estilo"\npintar(etiqueta("p", estilo({"relleno": 8}, enPantalla(600, {"relleno": 16})), "x"))`,
  '.X{padding:8px}\n@media (min-width: 600px){.X{padding:16px}}');
cssEs('un rango', `usar "estilo"\npintar(etiqueta("p", estilo(enPantalla(600, 900, {"relleno": 16})), "x"))`,
  '@media (min-width: 600px) and (max-width: 900px){.X{padding:16px}}');
cssEs('un estado dentro de una consulta',
  `usar "estilo"\npintar(etiqueta("a", estilo(enPantalla(600, alPasar({"color": "rojo"}))), "x"))`,
  '@media (min-width: 600px){.X:hover{color:red}}');

console.log('\n── 5. lo global, cuando hace falta ──');
cssEs('estiloGlobal se sale del ámbito',
  `usar "estilo"\npintar(etiqueta("div", estilo({"relleno": 4}, estiloGlobal("body", {"margen": 0})), "x"))`,
  '.X{padding:4px}\nbody{margin:0}');
{
  const c = corre(`usar "estilo"\ncssCrudo("p \\{ color: red \\}")\npintar(etiqueta("p", "x"))`);
  comprobar('cssCrudo sigue existiendo como puerta de atrás',
    c.r.ok && c.h.crudo.join('') === 'p { color: red }', (c.r.ok ? c.h.crudo : c.r.errores.map(e => e.message)));
}
{
  const c = corre(`
usar estilo, fotogramas de "estilo"

fijo latir = fotogramas({"0%": estilo({"opacidad": 1}), "50%": estilo({"opacidad": 0.3}), "100%": estilo({"opacidad": 1})})
pintar(etiqueta("p", estilo({"animacion": latir + " 2s infinite"}), "x"))
imprimir(latir)`);
  comprobar('fotogramas emite el @keyframes', c.css.includes('@keyframes a') && c.css.includes('opacity:0.3'), c.css.slice(0, 160));
  comprobar('y devuelve su nombre para usarlo', c.css.includes('animation:' + c.texto + ' 2s infinite'), c.texto);
}

console.log('\n── 6. el verificador ayuda ──');
falla('un estilo suelto en pintar() avisa', `usar "estilo"\npintar(estilo({"color": "rojo"}))`, 'no es contenido');
comprobar('dentro de etiqueta() da igual el orden',
  corre(`usar "estilo"\npintar(etiqueta("p", "a", estilo({"color": "rojo"})))`).html.includes('class="s'));
{
  const c = corre(`usar "estilo"\nvar x: entero = estilo({"color": "rojo"})`);
  comprobar('el tipo se comprueba', !c.r.ok && /entero/.test(c.r.errores.map(e => e.message).join(' ')),
    c.r.ok ? 'compiló' : c.r.errores.map(e => e.message).join(' '));
}
{
  const c = corre(`usar "estilo"\nfn f() -> estilo { devolver estilo({"color": "rojo"}) }\nimprimir(tipo(f()))`);
  comprobar('una función puede declarar que devuelve estilo', c.texto === 'estilo', c.texto);
}
comprobar('atributos y estilo no se confunden',
  corre(`usar "estilo"\npintar(etiqueta("div", {"id": "caja"}, estilo({"color": "rojo"}), "x"))`).html
    .includes('id="caja"'));
falla('estilo no traga cualquier cosa', `usar "estilo"\npintar(etiqueta("p", estilo("color: red"), "x"))`, 'cssCrudo');
falla('un nombre de propiedad imposible', `usar "estilo"\npintar(etiqueta("p", estilo({"a b": 1}), "x"))`, 'no es un nombre');

console.log('\n── 7. un valor no puede romper la hoja ──');
falla('cerrar la regla', `usar "estilo"\npintar(etiqueta("p", estilo({"color": "rojo} body"}), "x"))`, 'romperían');
falla('cerrar la etiqueta style', `usar "estilo"\npintar(etiqueta("p", estilo({"color": "a</style><script>x()"}), "x"))`, 'romperían');
falla('colar otra propiedad', `usar "estilo"\npintar(etiqueta("p", estilo({"color": "rojo; position: fixed"}), "x"))`, 'romperían');
falla('un selector con llaves', `usar "estilo"\npintar(etiqueta("p", estilo(dentro("a}", {"color": "x"})), "x"))`, 'no es válido');

console.log('\n── 7b. el ancho no es lo único que cambia ──');
{
  const c = corre(`
usar enAlto, enImpresion, enMovimientoReducido, enOscuro, estilo de "estilo"

pintar(etiqueta("p", estilo({"color": "negro"},
  enOscuro({"color": "blanco"}),
  enImpresion({"color": "gris"}),
  enMovimientoReducido({"transicion": "ninguna"}),
  enAlto(600, {"relleno": 20})), "x"))`);
  const css = c.css;
  comprobar('tema oscuro', css.includes('@media (prefers-color-scheme: dark)'), css.slice(0, 160));
  comprobar('impresión', css.includes('@media print'), css.slice(0, 160));
  comprobar('movimiento reducido', css.includes('@media (prefers-reduced-motion: reduce)'), css.slice(0, 160));
  comprobar('altura mínima', css.includes('@media (min-height: 600px)'), css.slice(0, 160));
  comprobar('y todo eso cabe en una sola clase', new Set((css.match(/\.s[a-z0-9]+/g) || [])).size === 1,
    [...new Set((css.match(/\.s[a-z0-9]+/g) || []))]);
}

console.log('\n── 7c. los valores también se dicen en español ──');
{
  const c = corre(`
usar estilo de "estilo"

pintar(etiqueta("div", estilo({"fondo": "transparente", "mostrar": "ninguno",
  "borde": "1px solido azul", "color": "blanco", "alinear": "centro",
  "grosor": "negrita", "cursor": "mano", "posicion": "absoluto"}), "x"))`);
  const css = c.css;
  for (const [es, en] of [['transparente', 'transparent'], ['ninguno', 'none'], ['solido azul', 'solid blue'],
                          ['blanco', 'white'], ['centro', 'center'], ['negrita', 'bold'],
                          ['mano', 'pointer'], ['absoluto', 'absolute']]) {
    comprobar(`«${es}» sale como «${en}»`, css.includes(en) && !css.includes(es), css.slice(0, 200));
  }
}
{
  // Donde el valor es texto libre no se toca: traducir «negrita» dentro del
  // nombre de una tipografía sería peor que no traducir nada.
  const c = corre(`usar "estilo"\npintar(etiqueta("p", estilo({"fuente": "Negrita Grotesk", "contenido": "ninguno"}), "x"))`);
  comprobar('un nombre de tipografía no se traduce', c.css.includes('Negrita Grotesk'), c.css.slice(0, 160));
  comprobar('ni el contenido', c.css.includes('ninguno'), c.css.slice(0, 160));
}
{
  const c = corre(`usar "estilo"\npintar(etiqueta("p", estilo({"--mio": "ninguno", "ancho": "calc(100% - 10px)"}), "x"))`);
  comprobar('ni una variable de CSS', c.css.includes('--mio:ninguno'), c.css.slice(0, 160));
  comprobar('y lo que no es palabra conocida pasa igual', c.css.includes('calc(100% - 10px)'), c.css.slice(0, 160));
}

console.log('\n── 8. junto al resto del árbol ──');
{
  const c = corre(`
usar alPasar, estilo de "estilo"

fijo pastilla = estilo({"fondo": "#4F3FD4", "color": "blanco", "relleno": [8, 14], "redondeo": 6},
  alPasar({"opacidad": 0.9}))
pintar(etiqueta("div", estilo({"mostrar": "flex", "hueco": 8}),
  boton("Uno", nulo),
  etiqueta("span", pastilla, "parece botón")))`);
  comprobar('un estilo convive con nodos y controles',
    c.html.includes('<button type="button">Uno</button>') && /<span class="s[a-z0-9]+">parece botón<\/span>/.test(c.html), c.html);
  comprobar('y con la clase puesta en el div de fuera', /<div class="s[a-z0-9]+">/.test(c.html), c.html.slice(0, 80));
}
{
  const c = corre(`
usar estilo de "estilo"

para i en rango(300) {
  var basura: estilo = estilo({"color": "c" + texto(i)})
}
recolectar()
imprimir(texto(memoria()["objetos"] < 200))`);
  comprobar('el recolector entiende los estilos', c.texto === 'cierto', c.texto);
}

console.log('\n── 9. tokens de diseño ──');
cssEs('el tema sale como variables de CSS',
  `usar "estilo"
pintar(etiqueta("div", estiloGlobal(":root", tema({"color": {"acento": "#4F3FD4"}, "espacio": {"m": 16}})), "x"))`,
  ':root{--color-acento:#4F3FD4;--espacio-m:16px}');
cssEs('un número de espacio son píxeles y uno de grosor no',
  `usar "estilo"
pintar(etiqueta("div", estiloGlobal(":root", tema({"radio": {"suave": 8}, "grosor": {"fuerte": 700}})), "x"))`,
  ':root{--radio-suave:8px;--grosor-fuerte:700}');
cssEs('un valor del tema también se traduce del español',
  `usar "estilo"
pintar(etiqueta("div", estiloGlobal(":root", tema({"color": {"fondo": "blanco", "borde": "transparente"}})), "x"))`,
  ':root{--color-fondo:white;--color-borde:transparent}');
cssEs('el accesor devuelve la variable, no el valor',
  `usar "estilo"
fijo t = tema({"color": {"acento": "#4F3FD4"}, "espacio": {"m": 16}})
pintar(etiqueta("div", estiloGlobal(":root", t), estilo({"color": color("acento"), "relleno": espacio("m")}), "x"))`,
  '.X{color:var(--color-acento);padding:var(--espacio-m)}\n:root{--color-acento:#4F3FD4;--espacio-m:16px}');
cssEs('el modo oscuro es volver a declarar el tema y nada más',
  `usar "estilo"
fijo t = tema({"color": {"fondo": "blanco"}})
pintar(etiqueta("div", estiloGlobal(":root", t), enOscuro(estiloGlobal(":root", tema({"color": {"fondo": "#111"}}))),
  estilo({"fondo": color("fondo")}), "x"))`,
  '.X{background:var(--color-fondo)}\n:root{--color-fondo:white}\n@media (prefers-color-scheme: dark){:root{--color-fondo:#111}}');
falla('un token que el tema no declara se caza',
  `usar "estilo"
fijo t = tema({"color": {"acento": "#4F3FD4"}})
pintar(etiqueta("div", estiloGlobal(":root", t), estilo({"color": color("acnto")}), "x"))`,
  'no declara «acnto»');
falla('y si no hay tema, lo dice de otra forma',
  `usar "estilo"
pintar(etiqueta("div", estilo({"color": color("acento")}), "x"))`,
  'ningún «tema»');
falla('un grupo que no es diccionario',
  `usar "estilo"
pintar(etiqueta("div", estiloGlobal(":root", tema({"color": "#fff"})), "x"))`,
  'tiene que ser un diccionario');
{
  // La paleta tiene que dar el color que le pasaron, exacto, en el tono del
  // medio: si el «base» no está en la paleta, la paleta no sirve de nada.
  const c2 = corre(`usar paleta, escalaTipo de "estilo"
fijo p = paleta("#4f3fd4", 5)
imprimir(obtener(p, "3", "falta"), longitud(claves(p)))
fijo e = escalaTipo(16, 2, 3)
imprimir(obtener(e, "0", 0), obtener(e, "1", 0), obtener(e, "2", 0))`);
  comprobar('paleta deja el color base intacto en el medio',
    c2.r.ok && c2.texto.startsWith('#4f3fd4 5'), c2.r.ok ? c2.texto : c2.r.errores.map(e => e.message).join(' '));
  comprobar('escalaTipo es una progresión geométrica',
    c2.r.ok && c2.texto.endsWith('16 32 64'), c2.r.ok ? c2.texto : '—');
}
falla('paleta se queja de un color que no puede leer',
  `usar "estilo"\nimprimir(obtener(paleta("azul"), "1", ""))`, 'no es un color');
falla('escalaTipo exige una razón mayor que 1',
  `usar "estilo"\nimprimir(obtener(escalaTipo(16, 1), "0", 0))`, 'mayor que 1');

console.log('\n── 10. disposición, sin recordar flex ──');
cssEs('enFila, con el min-width que nadie se acuerda de poner',
  `usar "estilo"\npintar(etiqueta("div", enFila(12), "x"))`,
  '.X{display:flex;flex-direction:row;align-items:center;gap:12px}\n.X > *{min-width:0}');
cssEs('«fila» es un valor de verdad, no «flex-direction: fila»',
  `usar "estilo"\npintar(etiqueta("div", estilo({"mostrar": "flex", "direccion": "fila"}), "x"))`,
  '.X{display:flex;flex-direction:row}');
cssEs('enColumna no centra: estirar es lo que se quiere en una columna',
  `usar "estilo"\npintar(etiqueta("div", enColumna(4), "x"))`,
  '.X{display:flex;flex-direction:column;gap:4px}');
cssEs('el hueco es opcional',
  `usar "estilo"\npintar(etiqueta("div", enColumna(), "x"))`,
  '.X{display:flex;flex-direction:column}');
cssEs('y detrás del hueco se puede componer como en todo lo demás',
  `usar "estilo"\npintar(etiqueta("div", enFila(8, {"relleno": 4}), "x"))`,
  '.X{display:flex;flex-direction:row;align-items:center;gap:8px;padding:4px}\n.X > *{min-width:0}');
cssEs('centrado, en los dos ejes',
  `usar "estilo"\npintar(etiqueta("div", centrado(), "x"))`,
  '.X{display:flex;align-items:center;justify-content:center}');
cssEs('separado es la barra de siempre',
  `usar "estilo"\npintar(etiqueta("div", separado(), "x"))`,
  '.X{display:flex;align-items:center;justify-content:space-between}\n.X > *{min-width:0}');
cssEs('envuelto pasa de línea',
  `usar "estilo"\npintar(etiqueta("div", envuelto(6), "x"))`,
  '.X{display:flex;flex-wrap:wrap;align-items:center;gap:6px}\n.X > *{min-width:0}');
cssEs('rejillaDe con un número usa minmax, no 1fr',
  `usar "estilo"\npintar(etiqueta("div", rejillaDe(3, 8), "x"))`,
  '.X{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px}');
cssEs('rejillaDe con una plantilla escrita la respeta',
  `usar "estilo"\npintar(etiqueta("div", rejillaDe("200px 1fr"), "x"))`,
  '.X{display:grid;grid-template-columns:200px 1fr}');
cssEs('apilado pone a los hijos en la misma celda',
  `usar "estilo"\npintar(etiqueta("div", apilado(), "x"))`,
  '.X{display:grid}\n.X > *{grid-area:1 / 1}');
cssEs('pegadoArriba',
  `usar "estilo"\npintar(etiqueta("div", pegadoArriba(64), "x"))`,
  '.X{position:sticky;top:64px;z-index:1}');
falla('rejillaDe no acepta cien columnas',
  `usar "estilo"\npintar(etiqueta("div", rejillaDe(100), "x"))`, 'de 1 a 64');

console.log('\n── 11. más estados, pseudoelementos y anidamiento ──');
cssEs('cuando() no lleva espacio y dentro() sí',
  `usar "estilo"
pintar(etiqueta("div", estilo(cuando(".activo", {"color": "rojo"}), dentro(".activo", {"color": "azul"})), "x"))`,
  '.X.activo{color:red}\n.X .activo{color:blue}');
cssEs('hijoDirecto, hermano y hermanoSiguiente',
  `usar "estilo"
pintar(etiqueta("div", estilo(hijoDirecto("p", {"margen": 0}), hermano("p", {"relleno": 1}), hermanoSiguiente("p", {"relleno": 2})), "x"))`,
  '.X > p{margin:0}\n.X ~ p{padding:1px}\n.X + p{padding:2px}');
cssEs('los estados nuevos',
  `usar "estilo"
pintar(etiqueta("div", estilo(siInvalido({"color": "rojo"}), alSeleccionar({"color": "verde"}), siVacio({"opacidad": 0}), siSolo({"margen": 0})), "x"))`,
  '.X:invalid{color:red}\n.X:checked{color:green}\n.X:empty{opacity:0}\n.X:only-child{margin:0}');
cssEs('hijoN con número y con fórmula',
  `usar "estilo"
pintar(etiqueta("div", estilo(hijoN(3, {"color": "rojo"}), hijoN("3n+1", {"color": "azul"}), hijoN("impares", {"color": "verde"})), "x"))`,
  '.X:nth-child(3){color:red}\n.X:nth-child(3n+1){color:blue}\n.X:nth-child(odd){color:green}');
falla('hijoN no traga cualquier cosa',
  `usar "estilo"\npintar(etiqueta("div", estilo(hijoN("; color: red", {"margen": 0})), "x"))`,
  'no es una posición válida');
cssEs('marcador, seleccion y pista',
  `usar "estilo"
pintar(etiqueta("div", estilo(marcador({"color": "rojo"}), seleccion({"fondo": "amarillo"}), pista({"color": "gris"})), "x"))`,
  '.X::marker{color:red}\n.X::selection{background:yellow}\n.X::placeholder{color:gray}');
cssEs('las dos consultas de medios nuevas',
  `usar "estilo"
pintar(etiqueta("div", estilo(enTactil({"relleno": 16}), enApaisado({"relleno": 4})), "x"))`,
  '@media (hover: none) and (pointer: coarse){.X{padding:16px}}\n@media (orientation: landscape){.X{padding:4px}}');

console.log('\n── 12. movimiento ──');
cssEs('transicion nombra las propiedades, una a una',
  `usar "estilo"\npintar(etiqueta("div", transicion(["color", "fondo"], 150), "x"))`,
  '.X{transition:color 150ms ease, background 150ms ease}');
cssEs('una sola propiedad y la curva se puede cambiar',
  `usar "estilo"\npintar(etiqueta("div", transicion("opacidad", 80, "linear"), "x"))`,
  '.X{transition:opacity 80ms linear}');
falla('transicion no anima «todo»',
  `usar "estilo"\npintar(etiqueta("div", transicion("all"), "x"))`, 'lo que no se ve');
{
  // De aparecer y deslizar no se puede escribir el CSS esperado: el nombre de la
  // animación es la huella de su contenido. Lo que sí se comprueba es lo que
  // importa: que salga el @keyframes, que el «animation» apunte a ESE nombre, y
  // que «both» esté, sin lo cual el elemento salta atrás al terminar.
  const c = corre(`usar "estilo"\npintar(etiqueta("div", aparecer(250), "x"))`);
  const css = c.css;
  const m = /@keyframes (a[a-z0-9]+)\{from\{opacity:0\}to\{opacity:1\}\}/.exec(css);
  comprobar('aparecer emite su @keyframes', !!m, css.slice(0, 200));
  comprobar('y el animation apunta a ese nombre, con «both»',
    !!m && css.includes(`animation:${m[1]} 250ms ease both`), css.slice(0, 200));
  const c2 = corre(`usar "estilo"\npintar(etiqueta("div", deslizar("izquierda"), "x"))`);
  comprobar('deslizar mueve desde donde se le dice',
    /translate\(-16px,0px\)/.test(c2.css), c2.css.slice(0, 200));
  const c3 = corre(`usar "estilo"
pintar(etiqueta("div", deslizar(), "a"), etiqueta("p", deslizar(), "b"))`);
  comprobar('dos animaciones iguales comparten @keyframes',
    (c3.css.match(/@keyframes/g) || []).length === 1, c3.css);
}
falla('deslizar solo sabe cuatro direcciones',
  `usar "estilo"\npintar(etiqueta("div", deslizar("diagonal"), "x"))`, 'arriba, abajo');

console.log('\n── 13. reiniciar ──');
cssEs('reiniciar son reglas globales, no una clase',
  `usar "estilo"\npintar(etiqueta("div", reiniciar(), "x"))`,
  '*, *::before, *::after{box-sizing:border-box}\nbody{margin:0}\n' +
  'img, video, canvas, svg{display:block;max-width:100%}\n' +
  'button, input, textarea, select{font-family:inherit;font-size:inherit}');

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
