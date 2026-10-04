// Pruebas de lo que hace falta para escribir aplicaciones y no solo páginas:
// eventos, identidad de nodo, memoria entre ejecuciones y temporizadores.
// El anfitrión de prueba imita al del navegador lo justo para poder disparar
// eventos y adelantar el reloj a mano, sin esperas de verdad.
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 260) : ''); }
};

function anfitrion(almacenInicial) {
  const raiz = { etiq: null, at: {}, meta: null, hijos: [] };
  let pila = [raiz];
  const act = () => pila[pila.length - 1];
  const controles = [], clases = [], puestas = new Set();
  const web = {
    abrir(n, at, meta) { const e = { etiq: n, at, meta, hijos: [] }; act().hijos.push(e); pila.push(e); },
    cerrar() { if (pila.length > 1) pila.pop(); },
    texto(t) { act().hijos.push({ texto: t }); },
    eco(h) { act().hijos.push({ crudo: h }); },
    control(d, vm) { const c = { d, vm }; act().hijos.push(c); controles.push(c); },
    // Igual que el anfitrión de verdad: cada nombre se emite una sola vez.
    asegurarClase(n, t) { if (!puestas.has(n)) { puestas.add(n); clases.push({ nombre: n, texto: t }); } },
    estilo() {},
    limpiar() { raiz.hijos.length = 0; pila = [raiz]; controles.length = 0; clases.length = 0; puestas.clear(); },
  };
  // El almacén, como el del IDE: espejo en memoria + copia persistente.
  const disco = new Map(Object.entries(almacenInicial || {}));
  const almacen = {
    leer: k => (disco.has(k) ? disco.get(k) : null),
    escribir: (k, v) => disco.set(k, v),
    borrar: k => disco.delete(k),
    claves: () => [...disco.keys()],
  };
  // Un reloj de mentira: nada corre hasta que se llama a avanzar().
  const peticiones = [];
  const red = { pedir(url, o, fn, vm) { peticiones.push({ url, o, fn, vm }); } };
  const pendientes = new Map();
  let sig = 1, ahora = 0;
  const tiempo = {
    luego(ms, fn, vm) { pendientes.set(sig, { en: ahora + ms, ms, fn, vm, repite: false }); return sig++; },
    cada(ms, fn, vm) { pendientes.set(sig, { en: ahora + ms, ms, fn, vm, repite: true }); return sig++; },
    detener(id) { return pendientes.delete(id); },
  };
  const avanzar = ms => {
    ahora += ms;
    for (const [id, t] of [...pendientes]) {
      while (t.en <= ahora) {
        if (!t.repite) pendientes.delete(id);
        t.vm.nuevoTurno();
        t.fn && t.vm.invocar(t.fn, []);
        if (!t.repite) break;
        t.en += Math.max(1, t.ms);
      }
    }
  };
  // Dispara un evento como lo haría el DOM.
  const disparar = (c, nombre, datos) => {
    const fn = c.d.eventos && c.d.eventos[nombre];
    if (!fn) throw new Error('ese control no escucha ' + nombre);
    const d = c.vm.nuevoDic();
    for (const k in (datos || {})) d.mapa.set(k, datos[k]);
    c.vm.nuevoTurno();
    c.vm.invocar(fn, [d]);
  };
  const pulsar = c => { c.vm.nuevoTurno(); c.vm.invocar(c.d.accion, []); };
  const cambiar = (c, v) => { c.vm.nuevoTurno(); c.vm.invocar(c.d.accion, [v]); };
  const todos = () => { const r = []; (function ir(n) { if (n.d) r.push(n); for (const h of (n.hijos || [])) ir(h); })(raiz); return r; };
  return { web, almacen, tiempo, red, peticiones, avanzar, disparar, pulsar, cambiar, controles, clases, raiz, disco, nodos: todos };
}

function corre(src, almacenInicial, op) {
  const h = anfitrion(almacenInicial);
  const salida = [];
  const host = { web: h.web, almacen: h.almacen, tiempo: h.tiempo, red: h.red };
  if (op && op.sinRed) delete host.red;
  const m = crearMotor({ salida: s => salida.push(s), limiteInstr: 5e7, host });
  const r = m.ejecutar(src);
  return { r, h, salida, m };
}
const bien = (nombre, src, comp) => {
  const c = corre(src);
  if (!c.r.ok) { comprobar(nombre, false, c.r.errores.map(e => e.formato ? e.formato() : e.message).join(' | ')); return c; }
  comprobar(nombre, comp(c), JSON.stringify(c.salida));
  return c;
};
const falla = (nombre, src, frag) => {
  const c = corre(src);
  const txt = (c.r.errores || []).map(e => e.formato ? e.formato() : e.message).join(' | ');
  comprobar(nombre, !c.r.ok && txt.includes(frag), txt || 'no falló');
};

console.log('\n── 1. eventos como funciones, no como atributos ──');
{
  const c = corre(`
var visto = "nada"
funcion anotar(ev) { visto = obtener(ev, "tipo", "?") + ":" + obtener(ev, "tecla", "") }
pintar(etiqueta("input", {"alPulsarTecla": anotar, "alEscribir": anotar}))
funcion leer(): texto { devolver visto }`);
  const div = c.r.ok && c.h.raiz.hijos[0];
  comprobar('el manejador no acaba de atributo en el HTML',
    c.r.ok && Object.keys(div.at).length === 0, c.r.ok ? div.at : c.r.errores[0].formato());
  comprobar('el anfitrión recibe los eventos ya traducidos al DOM',
    div.meta && !!div.meta.eventos.keydown && !!div.meta.eventos.input, div.meta && Object.keys(div.meta.eventos || {}));
  const vm = c.m.vm;
  vm.nuevoTurno();
  const d = vm.nuevoDic(); d.mapa.set('tipo', 'keydown'); d.mapa.set('tecla', 'a');
  vm.invocar(div.meta.eventos.keydown, [d]);
  comprobar('disparar el evento llama a la función de Ñ',
    vm.invocar(vm.globals.get('leer'), []) === 'keydown:a');
}
falla('un evento que no existe se rechaza', 'pintar(etiqueta("div", {"alExplotar": imprimir}))', 'no es un evento conocido');
falla('un evento con algo que no es función', 'pintar(etiqueta("div", {"alHacerClic": 5}))', 'necesita una función');
falla('onclick sigue prohibido', 'pintar(etiqueta("div", {"onclick": "x()"}))', 'pondría código');

console.log('\n── 2. atributos: nulo quita, los booleanos son presencia ──');
{
  const c = corre('pintar(etiqueta("input", {"valor": nulo, "deshabilitado": cierto, "requerido": falso, "tipo": "numero"}))');
  const at = c.h.raiz.hijos[0].at;
  comprobar('nulo no pinta el atributo', at.value === undefined, at);
  comprobar('cierto lo pone sin valor', at.disabled === '', at);
  comprobar('falso lo quita', at.required === undefined, at);
  comprobar('los nombres en español se traducen', at.type === 'numero', at);
}
{
  const c = corre('pintar(etiqueta("p", {"clase": "a", "titulo": "x"}, {"titulo": "y", "id": "z"}, "hola"))');
  const at = c.h.raiz.hijos[0].at;
  comprobar('el segundo diccionario también son atributos', at.id === 'z', at);
  comprobar('y gana el de la derecha', at.title === 'y', at);
  comprobar('no acaba pintado como texto',
    JSON.stringify(c.h.raiz.hijos[0].hijos) === JSON.stringify([{ texto: 'hola' }]), c.h.raiz.hijos[0].hijos);
}

console.log('\n── 3. los controles aceptan estilo, atributos y valor inicial ──');
{
  const c = corre(`
usar estilo de "estilo"
fijo rojo = estilo({"color": "rojo"})
pintar(
  boton("Uno", nulo, rojo, {"id": "b1"}),
  entrada("Nombre", nulo, rojo, {"valor": "Ana"}),
  areaTexto("Notas", nulo, {"filas": 4}),
  casilla("Acepto", cierto, nulo),
  desplegable(["a", ["b", "Be"]], nulo, {"valor": "b"}))`);
  if (!c.r.ok) comprobar('los cinco controles se construyen', false, c.r.errores.map(e => e.formato()).join(' | '));
  else {
    const [b, e, a, k, s] = c.h.controles.map(x => x.d);
    comprobar('el botón lleva clase de estilo e id', /^s[a-z0-9]+$/.test(b.atrib.class) && b.atrib.id === 'b1', b.atrib);
    comprobar('la entrada lleva su valor inicial', e.atrib.value === 'Ana', e.atrib);
    comprobar('el área lleva filas', a.forma === 'area' && a.atrib.rows === '4', a.atrib);
    comprobar('la casilla nace marcada', k.forma === 'casilla' && k.marcada === true, k);
    comprobar('el desplegable trae sus opciones', s.opciones.length === 2 && s.opciones[1].valor === 'b' && s.opciones[1].texto === 'Be', s.opciones);
  }
}
{
  const c = corre('var n = 0\nfuncion sube(v) { n = n + longitud(v) }\npintar(entrada("x", sube))\nfuncion leer(): entero { devolver n }');
  c.h.cambiar(c.h.controles[0], 'hola');
  comprobar('cambiar una entrada llama a la función con el texto',
    c.m.vm.invocar(c.m.vm.globals.get('leer'), []) === 4);
}

console.log('\n── 4. identidad de nodo ──');
{
  const c = corre('pintar(etiqueta("div", {"clave": "cabecera"}, "x"), entrada("y", nulo, {"clave": "campo"}))');
  comprobar('la clave llega al anfitrión y no es un atributo',
    c.h.raiz.hijos[0].meta.clave === 'cabecera' && c.h.raiz.hijos[0].at.clave === undefined, c.h.raiz.hijos[0]);
  comprobar('un control también puede llevar clave', c.h.controles[0].d.clave === 'campo', c.h.controles[0].d);
}

console.log('\n── 5. variables de CSS por nodo ──');
{
  const c = corre(`
usar estilo de "estilo"
fijo barra = estilo({"ancho": "var(--p)", "fondo": "azul", "alto": 8})
funcion fila(p: real) { devolver etiqueta("div", barra, {"--p": texto(p) + "%"}) }
pintar(fila(10), fila(80), fila(30))`);
  const divs = c.h.raiz.hijos;
  comprobar('el ancho viaja por el atributo style', divs[1].at.style === '--p:80%', divs[1].at);
  const clases = new Set(divs.map(d => d.at.class));
  comprobar('y las tres filas comparten una sola clase', clases.size === 1, [...clases]);
  comprobar('así que solo se emitió una regla', c.h.clases.length === 1, c.h.clases.map(x => x.nombre));
}

console.log('\n── 6. memoria entre ejecuciones ──');
bien('guardar y recuperar un número', 'guardar("n", 42)\nimprimir(recuperar("n"))', c => c.salida[0] === '42');
bien('una lista vuelve siendo lista', 'guardar("l", [1, "a", [2]])\nimprimir(tipo(recuperar("l")), recuperar("l"))',
  c => c.salida[0] === 'lista [1, "a", [2]]');
bien('un diccionario vuelve con sus claves', 'guardar("d", {"a": 1, 2: cierto})\nfijo d = recuperar("d")\nimprimir(d["a"], d[2])',
  c => c.salida[0] === '1 cierto');
bien('lo que no está da el valor por defecto', 'imprimir(recuperar("nada", "vacío"))', c => c.salida[0] === 'vacío');
bien('olvidar borra', 'guardar("x", 1)\nimprimir(olvidar("x"), recuperar("x", "fue"))', c => c.salida[0] === 'cierto fue');
bien('guardados lista las claves', 'guardar("a", 1)\nguardar("b", 2)\nimprimir(ordenar(guardados()))', c => c.salida[0] === '["a", "b"]');
falla('no se puede guardar una función', 'guardar("f", imprimir)', 'no puede guardar');
falla('ni un nodo', 'guardar("n", etiqueta("p"))', 'no puede guardar');
{
  const c = corre('imprimir(recuperar("previo", "nada"))', { previo: '"de antes"' });
  comprobar('lo guardado en una ejecución anterior sigue ahí', c.salida[0] === 'de antes', c.salida);
}
{
  const c = corre('guardar("g", "x")');
  comprobar('y lo guardado queda en el almacén del anfitrión', c.h.disco.get('g') === '"x"', [...c.h.disco]);
}

console.log('\n── 7. temporizadores ──');
{
  const c = corre('var n = 0\nfuncion mas() { n = n + 1 }\nfijo id = cada(100, mas)\nfuncion leer(): entero { devolver n }');
  const leer = () => c.m.vm.invocar(c.m.vm.globals.get('leer'), []);
  comprobar('antes de que pase el tiempo no ha corrido', leer() === 0);
  c.h.avanzar(250);
  comprobar('cada(100) corrió dos veces en 250 ms', leer() === 2, leer());
  c.m.vm.invocar(c.m.vm.globals.get('detener'), [c.m.vm.globals.get('id')]);
  c.h.avanzar(500);
  comprobar('y detener() lo para de verdad', leer() === 2, leer());
}
{
  const c = corre('var n = 0\nfuncion una() { n = 1 }\nluego(50, una)\nfuncion leer(): entero { devolver n }');
  const leer = () => c.m.vm.invocar(c.m.vm.globals.get('leer'), []);
  c.h.avanzar(60); comprobar('luego() corre una vez', leer() === 1);
  c.h.avanzar(600); comprobar('y no se repite', leer() === 1);
}
falla('luego() necesita una función', 'luego(10, 5)', 'debe ser una función');
falla('y milisegundos positivos', 'luego(-1, imprimir)', 'positivo');
{
  const c = corre('var n = 0\nfuncion mas() { n = n + 1 }\ncada(10, mas)\nfuncion leer(): entero { devolver n }');
  // El presupuesto de instrucciones se renueva en cada turno: una aplicación
  // que se usa un rato no puede morirse por haber estado abierta.
  c.h.avanzar(10000);
  comprobar('mil turnos seguidos no agotan el presupuesto',
    c.m.vm.invocar(c.m.vm.globals.get('leer'), []) === 1000, c.m.vm.instrucciones);
}

console.log('\n── 7b. red y JSON ──');
bien('aJson convierte listas y diccionarios', 'imprimir(aJson({"a": [1, "x"], "b": cierto, "c": nulo}))',
  c => c.salida[0] === '{"a":[1,"x"],"b":true,"c":null}');
bien('y deJson los devuelve', 'fijo d = deJson("\\{\\"a\\": [1, 2]}")\nimprimir(tipo(d), d["a"], tipo(d["a"]))',
  c => c.salida[0] === 'dic [1, 2] lista');
bien('ida y vuelta', 'fijo v = {"n": [1, {"m": cierto}]}\nimprimir(deJson(aJson(v)) == v)',
  c => c.salida[0] === 'cierto');
falla('un JSON roto es un error del lenguaje, no del motor', 'deJson("no soy json")', 'no es JSON válido');
falla('y se puede capturar', 'intentar { deJson("x") } capturar (e) { imprimir("capturado") }\nafirmar(falso, "no")', 'no');
falla('aJson no convierte funciones', 'aJson(imprimir)', 'no puede convertir');
{
  // Sin anfitrión de red, pedir() lo dice en vez de fallar raro.
  const c = corre('pedir("https://x.test/y", fn(r) { })', null, { sinRed: true });
  const txt = (c.r.errores || []).map(e => e.message).join(' ');
  comprobar('pedir necesita anfitrión', !c.r.ok && txt.includes('necesita un anfitrión con red'), txt);
}
{
  // Un anfitrión de red de mentira: contesta lo que se le diga, cuando se le diga.
  const h = anfitrion();
  const pendientes = h.peticiones;
  const salida = [];
  const m = crearMotor({ salida: s => salida.push(s), limiteInstr: 5e7,
    host: { web: h.web, almacen: h.almacen, tiempo: h.tiempo, red: h.red } });
  const r = m.ejecutar(`
pedir("https://ejemplo.test/datos", {"metodo": "post", "cuerpo": aJson({"q": 1}), "cabeceras": {"Accept": "application/json"}},
  fn(resp) { imprimir("llegó " + texto(resp["estado"]) + " " + resp["cuerpo"]) })
imprimir("no espero")`);
  comprobar('el programa sigue sin esperar', r.ok && salida[0] === 'no espero', r.ok ? salida : r.errores.map(e => e.formato()).join(';'));
  const p1 = pendientes[0];
  comprobar('el método se normaliza a mayúsculas', p1 && p1.o.metodo === 'POST', p1 && p1.o.metodo);
  comprobar('el cuerpo y las cabeceras llegan al anfitrión',
    p1 && p1.o.cuerpo === '{"q":1}' && p1.o.cabeceras.Accept === 'application/json', p1 && p1.o);
  // y ahora contesta
  const d = m.vm.nuevoDic();
  d.mapa.set('ok', true); d.mapa.set('estado', 200); d.mapa.set('cuerpo', 'hola'); d.mapa.set('tipo', 'text/plain'); d.mapa.set('error', '');
  m.vm.nuevoTurno(); m.vm.invocar(p1.fn, [d]);
  comprobar('la respuesta entra como un turno más', salida[1] === 'llegó 200 hola', salida);
}
falla('un método inventado se rechaza', 'pedir("https://x.test/y", {"metodo": "ROBAR"}, fn(r) { })', 'no está permitido');
falla('una opción que no existe se rechaza', 'pedir("https://x.test/y", {"tiempo": 5}, fn(r) { })', 'no conozco la opción');
falla('y hace falta la función', 'pedir("https://x.test/y")', 'necesita una función');

console.log('\n── 8. los fotogramas sobreviven al repintado ──');
{
  const c = corre(`
usar estilo, fotogramas de "estilo"
fijo giro = fotogramas({"0%": estilo({"opacidad": 0}), "100%": estilo({"opacidad": 1})})
funcion ver() { pintar(etiqueta("div", estilo({"animacion": giro + " 1s"}), "hola")) }
ver()`);
  const antes = c.h.clases.filter(x => x.texto.startsWith('@keyframes')).length;
  c.m.vm.invocar(c.m.vm.globals.get('limpiarPagina'), []);
  c.m.vm.invocar(c.m.vm.globals.get('ver'), []);
  const despues = c.h.clases.filter(x => x.texto.startsWith('@keyframes')).length;
  comprobar('los @keyframes se emiten también tras limpiarPagina', antes === 1 && despues === 1, { antes, despues });
}

console.log('\n── 9. tapar un nombre de la biblioteca se avisa ──');
{
  const m = crearMotor({ salida: () => {} });
  const a = m.analizar('funcion texto(x) { devolver 1 }');
  comprobar('avisa, pero no es un error', a.errores.length === 0 && a.avisos.some(w => w.message.includes('tapa a la de la biblioteca')),
    a.avisos.map(w => w.message));
  const b = m.analizar('var maximo = 3');
  comprobar('y una variable con ese nombre sí es error claro',
    b.errores.some(e => e.message.includes('es una función de la biblioteca')), b.errores.map(e => e.message));
  const d = m.analizar('funcion propia() { devolver 1 }\nfuncion otra() { fijo texto = 1\n devolver texto }');
  comprobar('dentro de una función no molesta', d.avisos.length === 0, d.avisos.map(w => w.message));
}

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
