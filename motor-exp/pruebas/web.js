// Pruebas del DSL web jerárquico: el árbol se construye por valores y solo
// pintar() toca la página. El anfitrión de prueba imita al del navegador —una
// pila de inserción y nodos de texto de verdad— y vuelca el resultado a HTML
// escapando igual que lo haría el DOM, para poder comprobarlo a ojo.
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 240) : ''); }
};

const VACIAS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'wbr']);
const escTexto = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAtrib = s => escTexto(s).replace(/"/g, '&quot;');

function anfitrion() {
  const raiz = { etiq: null, hijos: [] };
  let pila = [raiz];
  const act = () => pila[pila.length - 1];
  const estilos = [];
  const controles = [];
  const clases = [];
  const web = {
    abrir(nombre, at, meta) { const e = { etiq: nombre, at, meta, hijos: [] }; act().hijos.push(e); pila.push(e); },
    cerrar() { if (pila.length > 1) pila.pop(); },
    texto(t) { act().hijos.push({ texto: t }); },
    eco(h) { act().hijos.push({ crudo: h }); },
    control(d, vm) { const c = { control: d.forma, d, vm, rotulo: d.rotulo, f: d.accion }; act().hijos.push(c); controles.push(c); },
    asegurarClase(n, t) { clases.push({ nombre: n, texto: t }); },
    estilo(c) { estilos.push(c); },
    limpiar() { raiz.hijos.length = 0; pila = [raiz]; controles.length = 0; },
  };
  // Serializa un control igual que lo montaría el anfitrión del navegador: el
  // campo con sus atributos y, si hay rótulo, envuelto en su <label>.
  const serControl = n => {
    const d = n.d, at = Object.assign({}, d.atrib);
    let campo;
    if (d.forma === 'boton') campo = `<button type="button"${atribs(at)}>${escTexto(d.rotulo)}</button>`;
    else if (d.forma === 'area') campo = `<textarea${atribs(at)}></textarea>`;
    else if (d.forma === 'casilla') campo = `<input type="checkbox"${d.marcada ? ' checked' : ''}${atribs(at)}>`;
    else if (d.forma === 'seleccion') campo = `<select${atribs(at)}>${(d.opciones || []).map(o => `<option value="${escAtrib(o.valor)}">${escTexto(o.texto)}</option>`).join('')}</select>`;
    else campo = `<input${atribs(at)}>`;
    if (!d.rotulo || d.forma === 'boton') return campo;
    const rot = `<span class="el-rotulo">${escTexto(d.rotulo)}</span>`;
    return `<label class="el-campo">${d.forma === 'casilla' ? campo + rot : rot + campo}</label>`;
  };
  const atribs = at => Object.entries(at || {}).map(([k, v]) => ` ${k}="${escAtrib(v)}"`).join('');
  const ser = n => {
    if (n.texto !== undefined) return escTexto(n.texto);
    if (n.crudo !== undefined) return n.crudo;
    if (n.control) return serControl(n);
    const dentro = n.hijos.map(ser).join('');
    if (!n.etiq) return dentro;
    const at = Object.entries(n.at || {}).map(([k, v]) => ` ${k}="${escAtrib(v)}"`).join('');
    return VACIAS.has(n.etiq) ? `<${n.etiq}${at}>` : `<${n.etiq}${at}>${dentro}</${n.etiq}>`;
  };
  return { web, html: () => ser(raiz), estilos, controles, clases };
}

function corre(src, opts) {
  const h = anfitrion();
  const salida = [];
  const m = crearMotor(Object.assign({ salida: s => salida.push(s), host: { web: h.web }, limiteInstr: 5e7 }, opts || {}));
  const r = m.ejecutar(src);
  return { r, h, salida, m, html: h.html() };
}
const daHtml = (nombre, src, esperado) => {
  const c = corre(src);
  if (!c.r.ok) { comprobar(nombre, false, c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')); return c; }
  comprobar(nombre, c.html === esperado, `esperado: ${esperado}\n      obtenido: ${c.html}`);
  return c;
};
const falla = (nombre, src, fragmento) => {
  const c = corre(src);
  if (c.r.ok) { comprobar(nombre, false, 'no dio error'); return; }
  const msg = c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ');
  comprobar(nombre, !fragmento || msg.toLowerCase().includes(fragmento.toLowerCase()), msg);
};

console.log('\n── 1. el árbol se anida ──');
daHtml('un elemento con texto', 'pintar(etiqueta("p", "hola"))', '<p>hola</p>');
daHtml('atributos', 'pintar(etiqueta("p", {"clase": "guia"}, "hola"))', '<p class="guia">hola</p>');
daHtml('hijos anidados',
  'pintar(etiqueta("div", {"clase": "tarjeta"}, etiqueta("h2", "Ana"), etiqueta("p", "30 años")))',
  '<div class="tarjeta"><h2>Ana</h2><p>30 años</p></div>');
daHtml('tres niveles',
  'pintar(etiqueta("section", etiqueta("ul", etiqueta("li", "uno"), etiqueta("li", "dos"))))',
  '<section><ul><li>uno</li><li>dos</li></ul></section>');
daHtml('una lista de nodos como hijos',
  'var xs: lista<texto> = ["a", "b"]\npintar(etiqueta("ul", mapear(xs, funcion(x: texto) -> nodo { devolver etiqueta("li", x) })))',
  '<ul><li>a</li><li>b</li></ul>');
daHtml('varios nodos en una pintada', 'pintar(etiqueta("h1", "t"), etiqueta("p", "c"))', '<h1>t</h1><p>c</p>');
daHtml('texto y nodos mezclados',
  'pintar(etiqueta("p", "hola ", etiqueta("b", "mundo"), " otra vez"))',
  '<p>hola <b>mundo</b> otra vez</p>');
daHtml('números y booleanos se vuelven texto', 'pintar(etiqueta("p", 42, " ", verdadero))', '<p>42 cierto</p>');
daHtml('un nulo no pinta nada', 'pintar(etiqueta("p", "a", nulo, "b"))', '<p>ab</p>');
daHtml('elemento vacío', 'pintar(etiqueta("br"))', '<br>');
daHtml('elemento vacío con atributos', 'pintar(etiqueta("img", {"src": "gato.png"}))', '<img src="gato.png">');

console.log('\n── 2. el nodo es un valor ──');
daHtml('se guarda en una variable y se reutiliza',
  'var saludo: nodo = etiqueta("em", "hola")\npintar(etiqueta("p", saludo), etiqueta("div", saludo))',
  '<p><em>hola</em></p><div><em>hola</em></div>');
const c2 = corre('var n: nodo = etiqueta("p", "x")\nimprimir(tipo(n), n)');
comprobar('tipo() dice «nodo»', c2.salida[0] && c2.salida[0].startsWith('nodo '), c2.salida);
comprobar('se representa legible', /<nodo p · 1 hijo>/.test(c2.salida[0] || ''), c2.salida);
falla('el verificador rechaza un nodo donde va un número',
  'var x: entero = etiqueta("p", "a")', 'entero');
falla('y rechaza un texto donde va un nodo',
  'funcion f() -> nodo { devolver "hola" }', 'nodo');
daHtml('una función que devuelve nodo se compone',
  'funcion tarjeta(t: texto, c: texto) -> nodo {\n  devolver etiqueta("div", {"clase": "t"}, etiqueta("h3", t), etiqueta("p", c))\n}\npintar(etiqueta("main", tarjeta("Uno", "a"), tarjeta("Dos", "b")))',
  '<main><div class="t"><h3>Uno</h3><p>a</p></div><div class="t"><h3>Dos</h3><p>b</p></div></main>');

console.log('\n── 3. los datos no se vuelven marcado ──');
daHtml('los signos se ven, no se interpretan',
  'pintar(etiqueta("li", "<b>hola</b>"))', '<li>&lt;b&gt;hola&lt;/b&gt;</li>');
daHtml('un ampersand es un ampersand',
  'pintar(etiqueta("p", "tú & yo"))', '<p>tú &amp; yo</p>');
daHtml('las comillas de un atributo no lo rompen',
  'pintar(etiqueta("p", {"titulo": "dijo \\"hola\\""}, "x"))',
  '<p title="dijo &quot;hola&quot;">x</p>');
daHtml('crudo() sí mete HTML', 'pintar(etiqueta("p", crudo("<b>negrita</b>")))', '<p><b>negrita</b></p>');
daHtml('eco() sigue funcionando al margen del árbol', 'eco("<hr>")', '<hr>');
falla('un manejador en los atributos se rechaza',
  'pintar(etiqueta("div", {"onclick": "algo()"}, "x"))', 'código');
falla('una dirección javascript: se rechaza',
  'pintar(etiqueta("a", {"href": "javascript:algo()"}, "x"))', 'código');
falla('script no es contenido', 'pintar(etiqueta("script", "alert(1)"))', 'no lleva contenido');
falla('style tampoco, y sugiere estilo()', 'pintar(etiqueta("style", "reglas"))', 'estilo');
falla('nombre de etiqueta inventado con signos', 'pintar(etiqueta("di v", "x"))', 'no es un nombre');
falla('atributo con nombre imposible', 'pintar(etiqueta("p", {"a b": "1"}, "x"))', 'atributo');
falla('un elemento vacío no lleva hijos', 'pintar(etiqueta("br", "hola"))', 'no puede llevar hijos');

console.log('\n── 4. los controles viven dentro del árbol ──');
const c4 = corre(`
var n: entero = 0
funcion pintarTodo() {
  limpiarPagina()
  pintar(etiqueta("div", {"clase": "caja"},
    etiqueta("p", "van " + texto(n)),
    boton("sumar", funcion() {
      n = n + 1
      pintarTodo()
    })))
}
pintarTodo()`);
comprobar('el botón queda dentro del div', c4.html === '<div class="caja"><p>van 0</p><button type="button">sumar</button></div>', c4.html);
if (c4.r.ok && c4.h.controles.length) {
  const b = c4.h.controles[0];
  b.vm.invocar(b.f, []);
  const tras = c4.h.html();
  comprobar('pulsarlo repinta el árbol entero', tras === '<div class="caja"><p>van 1</p><button type="button">sumar</button></div>', tras);
  const b2 = c4.h.controles[0];
  b2.vm.invocar(b2.f, []);
  comprobar('y otra vez', c4.h.html().includes('van 2'), c4.h.html());
} else { mal += 2; console.log('  ✗ no hubo controles que pulsar'); }

const c4b = corre('pintar(etiqueta("form", entrada("Nombre", nulo), boton("Enviar", nulo)))');
comprobar('una entrada y un botón dentro de un formulario',
  c4b.html === '<form><label class="el-campo"><span class="el-rotulo">Nombre</span><input></label><button type="button">Enviar</button></form>', c4b.html);

console.log('\n── 5. tabla ──');
daHtml('tabla con encabezados',
  'pintar(tabla([["Ana", 30], ["Luis", 25]], ["nombre", "edad"]))',
  '<table class="el-tabla"><thead><tr><th>nombre</th><th>edad</th></tr></thead>' +
  '<tbody><tr><td>Ana</td><td>30</td></tr><tr><td>Luis</td><td>25</td></tr></tbody></table>');
daHtml('las celdas también escapan',
  'pintar(tabla([["<b>x</b>"]]))',
  '<table class="el-tabla"><tbody><tr><td>&lt;b&gt;x&lt;/b&gt;</td></tr></tbody></table>');
daHtml('una celda puede ser un nodo',
  'pintar(tabla([[etiqueta("b", "Ana")]]))',
  '<table class="el-tabla"><tbody><tr><td><b>Ana</b></td></tr></tbody></table>');

console.log('\n── 6. árboles que intentan hacer daño ──');
falla('anidamiento sin fondo', `
var n: nodo = etiqueta("p", "hondo")
para i en rango(400) { n = etiqueta("div", n) }
pintar(n)`, 'anidada');
const c6 = corre(`
funcion bomba(prof: entero) -> nodo {
  si prof == 0 { devolver etiqueta("i", "x") }
  devolver etiqueta("div", bomba(prof - 1), bomba(prof - 1))
}
pintar(bomba(15))`, { limiteInstr: 2e5 });
comprobar('un árbol que explota se para por presupuesto', !c6.r.ok &&
  /límite|instrucciones/i.test(c6.r.errores.map(e => e.message).join(' ')),
  c6.r.ok ? 'corrió entero' : c6.r.errores.map(e => e.message).join(' | '));
const c6b = corre('pintar(etiqueta("div", etiqueta("p", "a")), etiqueta("p", "b"))');
comprobar('la pila de inserción no se descuadra',
  c6b.html === '<div><p>a</p></div><p>b</p>', c6b.html);
const c6c = corre(`
funcion mala() -> nodo { devolver etiqueta("br", "no") }
pintar(etiqueta("div", etiqueta("p", "antes")))
pintar(etiqueta("div", mala()))`);
comprobar('un error a media pintada no deja la pila abierta',
  !c6c.r.ok && c6c.h.html().startsWith('<div><p>antes</p></div>'), c6c.h.html());

console.log('\n── 7. el recolector entiende los nodos ──');
const c7 = corre(`
para i en rango(2000) {
  var basura: nodo = etiqueta("div", etiqueta("p", "x"), etiqueta("p", "y"))
}
recolectar()
var vivo: nodo = etiqueta("p", "sigo")
pintar(vivo)
imprimir(memoria()["objetos"] < 500)`);
comprobar('los nodos muertos se liberan', c7.salida[0] === 'cierto', c7.salida);
comprobar('y el que sigue vivo se pinta', c7.html === '<p>sigo</p>', c7.html);

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
