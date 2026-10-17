// Los escenarios de página de la comparación LTS contra motor-exp. Cada uno es
// un programa con «repintar(k)» —limpiarPagina + pintar, como escribe la gente
// una app en Ñ— y un modo: «igual» repinta con el mismo k (nada cambia de
// verdad) y «cambia» repinta con k distinto cada vez.
const filas = (n, txt) => `var filas = []
  para i en rango(${n}) { agregar(filas, etiqueta("li", ${txt})) }`;
module.exports = [
  ['lista de 100, sin cambios', 'igual', `fn repintar(k) { limpiarPagina()
  ${filas(100, '"fila " + texto(i)')}
  pintar(etiqueta("ul", filas)) }`],
  ['lista de 1000, sin cambios', 'igual', `fn repintar(k) { limpiarPagina()
  ${filas(1000, '"fila " + texto(i)')}
  pintar(etiqueta("ul", filas)) }`],
  ['lista de 1000, cambia una fila', 'cambia', `fn repintar(k) { limpiarPagina()
  var filas = []
  para i en rango(1000) { si i == 500 { agregar(filas, etiqueta("li", "vuelta " + texto(k))) } sino { agregar(filas, etiqueta("li", "fila " + texto(i))) } }
  pintar(etiqueta("ul", filas)) }`],
  ['lista de 1000, cambian todas', 'cambia', `fn repintar(k) { limpiarPagina()
  ${filas(1000, '"fila " + texto(i + k)')}
  pintar(etiqueta("ul", filas)) }`],
  ['tabla 100×10, sin cambios', 'igual', `fn repintar(k) { limpiarPagina()
  var t = []
  para i en rango(100) { var f = []
    para j en rango(10) { agregar(f, texto(i * j)) }
    agregar(t, f) }
  pintar(tabla(t, ["a","b","c","d","e","f","g","h","i","j"])) }`],
  ['tabla 100×10, cambia una celda', 'cambia', `fn repintar(k) { limpiarPagina()
  var t = []
  para i en rango(100) { var f = []
    para j en rango(10) { si i == 50 y j == 5 { agregar(f, texto(k)) } sino { agregar(f, texto(i * j)) } }
    agregar(t, f) }
  pintar(tabla(t, ["a","b","c","d","e","f","g","h","i","j"])) }`],
  ['formulario de 30 cajas, sin cambios', 'igual', `fn repintar(k) { limpiarPagina()
  var cs = []
  para i en rango(30) { agregar(cs, entrada("Campo " + texto(i))) }
  pintar(etiqueta("form", cs)) }`],
  ['formulario de 30 cajas con reloj', 'cambia', `fn repintar(k) { limpiarPagina()
  var cs = [etiqueta("p", "hora " + texto(k))]
  para i en rango(30) { agregar(cs, entrada("Campo " + texto(i))) }
  pintar(etiqueta("form", cs)) }`],
  ['lista con clave de 300 que rota', 'cambia', `fn repintar(k) { limpiarPagina()
  var lis = []
  para j en rango(300) { fijo i = (j + k) % 300
    agregar(lis, etiqueta("li", {"clave": "f" + texto(i)}, "fila " + texto(i))) }
  pintar(etiqueta("ul", lis)) }`],
  ['lista que crece', 'cambia', `fn repintar(k) { limpiarPagina()
  ${filas('200 + k', '"fila " + texto(i)')}
  pintar(etiqueta("ul", filas)) }`],
  ['lista que encoge', 'cambia', `fn repintar(k) { limpiarPagina()
  ${filas('400 - k % 300', '"fila " + texto(i)')}
  pintar(etiqueta("ul", filas)) }`],
  ['anidado de 50 niveles', 'cambia', `fn repintar(k) { limpiarPagina()
  var n = etiqueta("span", texto(k))
  repetir 50 { n = etiqueta("div", n) }
  pintar(n) }`],
  ['20 secciones × 20 párrafos', 'igual', `fn repintar(k) { limpiarPagina()
  var ss = []
  para s en rango(20) { var ps = [etiqueta("h2", "Sección " + texto(s))]
    para p en rango(20) { agregar(ps, etiqueta("p", "párrafo " + texto(p))) }
    agregar(ss, etiqueta("section", ps)) }
  pintar(etiqueta("main", ss)) }`],
  ['200 nodos con estilo fijo', 'igual', `usar estilo de "estilo"
fijo tarjeta = estilo({"relleno": 8, "borde": "1px solid #ccc", "color": "#333"})
fn repintar(k) { limpiarPagina()
  ${filas(200, '"t " + texto(i), tarjeta')}
  pintar(etiqueta("ul", filas)) }`],
  ['estilo que cambia cada turno', 'cambia', `usar estilo de "estilo"
fn repintar(k) { limpiarPagina()
  fijo e = estilo({"anchura": 100 + k % 5 * 10})
  ${filas(200, '"t " + texto(i), e')}
  pintar(etiqueta("ul", filas)) }`],
  ['200 botones', 'igual', `fn nada() { }
fn repintar(k) { limpiarPagina()
  var bs = []
  para i en rango(200) { agregar(bs, boton("b" + texto(i), nada)) }
  pintar(etiqueta("div", bs)) }`],
  ['100 bloques de HTML crudo', 'igual', `fn repintar(k) { limpiarPagina()
  var cs = []
  para i en rango(100) { agregar(cs, crudo("<b>uno</b> <i>dos</i>")) }
  pintar(etiqueta("div", cs)) }`],
  ['panel de 50 cajas que se abre y cierra', 'cambia', `fn repintar(k) { limpiarPagina()
  si k % 2 == 0 { var cs = []
    para i en rango(50) { agregar(cs, entrada("Campo " + texto(i))) }
    pintar(etiqueta("div", cs)) }
  pintar(etiqueta("p", "pie")) }`],
  ['200 casillas gobernadas', 'cambia', `fn repintar(k) { limpiarPagina()
  var cs = []
  para i en rango(200) { agregar(cs, casilla("c" + texto(i), (i + k) % 3 == 0)) }
  pintar(etiqueta("div", cs)) }`],
  ['50 desplegables de 20 opciones', 'igual', `fn repintar(k) { limpiarPagina()
  var ops = []
  para i en rango(20) { agregar(ops, "op" + texto(i)) }
  var ds = []
  para i en rango(50) { agregar(ds, desplegable(ops)) }
  pintar(etiqueta("div", ds)) }`],
];
