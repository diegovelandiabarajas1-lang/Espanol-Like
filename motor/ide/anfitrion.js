// ============================================================================
//  EL ANFITRIÓN — la página, el lienzo y el tiempo
//  Lo comparten dos documentos: la zona aislada del IDE y las aplicaciones
//  exportadas. Vive aparte justamente por eso: con dos copias, la lógica
//  delicada —guardar y reponer lo que el usuario tenía puesto alrededor de un
//  repintado— se separaría en cuanto se tocara una de ellas.
//
//  crearAnfitrion(op) espera un documento con #pagina, #cajaLienzo y #consola,
//  y devuelve {web, grafico, tiempo} para pasárselos a crearMotor como host.
//  Lo que cambia entre los dos documentos se pasa en «op»:
//    irA(cual)      cambiar de pestaña; en una app exportada no hay pestañas
//    traspintar()   avisar de que el estado cambió; el IDE repinta sus paneles
//    linea(t, c)    escribir en la consola
//    fmtErr(e)      cómo se enseña un error del motor
//    almacen        el respaldo de guardar/recuperar
//    vacioLienzo    qué poner donde iría el dibujo mientras no hay ninguno
// ============================================================================
'use strict';

function crearAnfitrion(op) {
  op = op || {};
  const $ = s => document.querySelector(s);
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
  const irA = op.irA || function () {};
  const traspintar = op.traspintar || function () {};
  const fmtErr = op.fmtErr || (e => (e && e.formato ? e.formato() : '[error interno] ' + ((e && e.message) || e)));
  const linea = op.linea || function (t, c) {
    const caja = $('#consola');
    if (!caja) return;
    caja.appendChild(el('div', 'l' + (c ? ' ' + c : ''), t));
  };
  const almacen = op.almacen || null;
  const lienzo = { c: null, ctx: null, color: '#4F3FD4', grosor: 2 };

  function vaciarLienzo() {
    const caja = $('#cajaLienzo');
    if (caja) caja.innerHTML = op.vacioLienzo || '';
    lienzo.c = null; lienzo.ctx = null; lienzo.color = '#4F3FD4'; lienzo.grosor = 2;
  }

  // ─────────────────────────────────────────── lienzo
  function ctx(w, h) {
    if (!lienzo.c) {
      const caja = $('#cajaLienzo'); caja.innerHTML = '';
      const c = el('canvas'); caja.appendChild(c);
      lienzo.c = c; lienzo.ctx = c.getContext('2d');
    }
    const c = lienzo.c;
    if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    if (!c.width) { c.width = 560; c.height = 320; }
    return lienzo.ctx;
  }
  const varCss = n => getComputedStyle(document.body).getPropertyValue(n).trim();

  function ejes(g, W, H, xs, ys, titulo) {
    const m = { i: 48, d: 14, s: titulo ? 30 : 14, b: 30 };
    const aw = W - m.i - m.d, ah = H - m.s - m.b;
    g.clearRect(0, 0, W, H);
    g.fillStyle = varCss('--panel') || '#fff'; g.fillRect(0, 0, W, H);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const dx = (x1 - x0) || 1, dy = (y1 - y0) || 1;
    const px = v => m.i + ((v - x0) / dx) * aw, py = v => m.s + ah - ((v - y0) / dy) * ah;
    const suave = varCss('--muted') || '#888';
    g.font = '10px monospace'; g.strokeStyle = suave; g.globalAlpha = .22; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const yy = m.s + ah * k / 4; g.beginPath(); g.moveTo(m.i, yy); g.lineTo(m.i + aw, yy); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = suave; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) { const v = y1 - dy * k / 4; g.fillText(Number(v.toFixed(Math.abs(v) < 10 ? 2 : 0)), m.i - 6, m.s + ah * k / 4); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let k = 0; k <= 4; k++) { const v = x0 + dx * k / 4; g.fillText(Number(v.toFixed(Math.abs(v) < 10 ? 1 : 0)), m.i + aw * k / 4, m.s + ah + 7); }
    if (titulo) { g.fillStyle = varCss('--ink') || '#000'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '600 12px sans-serif'; g.fillText(titulo, m.i, 18); }
    return { px, py, m, aw, ah };
  }

  const grafico = {
    lienzo(w, h) { ctx(w | 0, h | 0); irA('lienzo'); },
    limpiar() { const g = ctx(); g.clearRect(0, 0, lienzo.c.width, lienzo.c.height); },
    color(a, b, c) {
      lienzo.color = typeof a === 'string' ? a
        : `rgb(${Math.max(0, Math.min(255, a | 0))},${Math.max(0, Math.min(255, b | 0))},${Math.max(0, Math.min(255, c | 0))})`;
    },
    grosor(g) { lienzo.grosor = g; },
    linea(x1, y1, x2, y2) { const g = ctx(); g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
    rect(x, y, w, h, r) { const g = ctx(); if (r === false) { g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.strokeRect(x, y, w, h); } else { g.fillStyle = lienzo.color; g.fillRect(x, y, w, h); } },
    circulo(x, y, rad, r) { const g = ctx(); g.beginPath(); g.arc(x, y, Math.abs(rad), 0, Math.PI * 2); if (r === false) { g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.stroke(); } else { g.fillStyle = lienzo.color; g.fill(); } },
    punto(x, y) { const g = ctx(); g.fillStyle = lienzo.color; g.fillRect(x | 0, y | 0, 1, 1); },
    escribirEn(x, y, t) { const g = ctx(); g.fillStyle = lienzo.color; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '12px sans-serif'; g.fillText(String(t), x, y); },
    graficar(xs, ys, titulo) {
      if (!xs.length) return;
      const g = ctx(), c = lienzo.c, e = ejes(g, c.width, c.height, xs, ys, titulo);
      g.strokeStyle = varCss('--acc') || '#4F3FD4'; g.lineWidth = 2; g.lineJoin = 'round';
      g.beginPath(); xs.forEach((x, i) => { const X = e.px(x), Y = e.py(ys[i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      irA('lienzo');
    },
    barras(vals, etiq, titulo) {
      if (!vals.length) return;
      const g = ctx(), c = lienzo.c, e = ejes(g, c.width, c.height, vals.map((_, i) => i), vals.concat([0]), titulo);
      g.fillStyle = varCss('--acc') || '#4F3FD4';
      const w = e.aw / vals.length;
      vals.forEach((v, i) => {
        const X = e.m.i + i * w + w * .16, Y = e.py(v), base = e.py(0);
        const ww = w * .68, hh = Math.max(1, base - Y), r = Math.min(4, ww / 2, hh);
        g.beginPath(); g.moveTo(X, base); g.lineTo(X, Y + r); g.quadraticCurveTo(X, Y, X + r, Y);
        g.lineTo(X + ww - r, Y); g.quadraticCurveTo(X + ww, Y, X + ww, Y + r); g.lineTo(X + ww, base); g.closePath(); g.fill();
      });
      if (etiq) {
        g.fillStyle = varCss('--muted') || '#888'; g.textAlign = 'center'; g.textBaseline = 'top'; g.font = '10px monospace';
        g.clearRect(0, e.m.s + e.ah + 2, c.width, 24);
        const paso = Math.ceil(etiq.length / 9);
        etiq.forEach((t, i) => { if (i % paso === 0) g.fillText(String(t).slice(0, 8), e.m.i + i * w + w / 2, e.m.s + e.ah + 7); });
      }
      irA('lienzo');
    },
    dispersion(xs, ys, titulo) {
      if (!xs.length) return;
      const g = ctx(), c = lienzo.c, e = ejes(g, c.width, c.height, xs, ys, titulo);
      g.fillStyle = varCss('--acc') || '#4F3FD4'; g.globalAlpha = .72;
      xs.forEach((x, i) => { g.beginPath(); g.arc(e.px(x), e.py(ys[i]), 3.4, 0, Math.PI * 2); g.fill(); });
      g.globalAlpha = 1;
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
      if (sxx > 0) {
        const m2 = sxy / sxx, b2 = my - m2 * mx, x0 = Math.min(...xs), x1 = Math.max(...xs);
        g.strokeStyle = varCss('--bad') || '#B62E24'; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.beginPath(); g.moveTo(e.px(x0), e.py(m2 * x0 + b2)); g.lineTo(e.px(x1), e.py(m2 * x1 + b2)); g.stroke(); g.setLineDash([]);
      }
      irA('lienzo');
    },
  };

  // ─────────────────────────────────────────── página
  // eco() inserta HTML sin filtrar, igual que antes. La diferencia es dónde:
  // aquí dentro, en un origen opaco. Lo peor que puede hacer un programa
  // hostil es estropear su propia zona de dibujo.
  // El DSL es un árbol, así que el anfitrión lleva una pila de inserción: abrir
  // baja un nivel y cerrar sube. Todo lo demás se cuelga del nodo abierto, de
  // modo que un botón dentro de un div acaba dentro de ese div y no al final de
  // la página. El texto entra como nodo de texto de verdad: por construcción no
  // puede convertirse en marcado.
  let pila = [];
  const raiz = () => $('#pagina');
  const actual = () => (pila.length ? pila[pila.length - 1] : raiz());
  const MAX_PILA = 250;

  // Identidad posicional: cada nodo que se pinta recibe el camino de índices
  // desde la raíz. Es lo que permite reconocer «el mismo» control entre dos
  // pintados. Si el programa da una clave, manda la clave: entonces la
  // identidad sobrevive aunque el nodo cambie de sitio.
  let cont = [0];
  function siguienteRuta() { cont[cont.length - 1]++; return cont.join('.'); }
  function sellar(e, clave) { e.__nId = clave ? 'k:' + clave : 'r:' + siguienteRuta(); return e; }

  function conectar(n) { actual().appendChild(n); irA('pagina'); }

  // Las clases que salen del tipo «estilo». Cada nombre se emite una sola vez;
  // como el nombre viene del contenido, dos estilos iguales comparten clase y
  // repintar mil veces no añade ni una regla.
  let hoja = null;
  const clasesPuestas = new Set();
  function hojaDeClases() {
    if (!hoja || !hoja.isConnected) {
      hoja = el('style'); hoja.id = 'clases-n';
      document.head.appendChild(hoja);
    }
    return hoja;
  }

  // ---- lo que el usuario había hecho y el repintado no debe borrarse
  // Un repintado completo destruye el foco, la selección, lo tecleado y el
  // desplazamiento. Esto lo guarda justo antes de borrar la página y lo
  // devuelve cuando el turno termina de pintar.
  let enTurno = false, instantanea = null;
  // El control que tiene el foco no se destruye al repintar: se aparta y se
  // vuelve a colocar. Reponer el valor y el cursor no bastaba — mientras el
  // elemento se cambia por otro, lo que el usuario teclea cae en el elemento
  // viejo y se pierde. Con un reloj que repinta cada segundo eso significa
  // perder letras a media palabra.
  let apartado = null;
  // Quitar del DOM una caja de texto que el usuario había tocado hace que el
  // navegador dispare «change» —es el blur implícito— y ese change llamaba al
  // manejador del programa EN MITAD del repintado: se añadía una tarea a medio
  // escribir y la caja se vaciaba sola. Un evento que nace de que estamos
  // desmontando la página no es una acción del usuario, así que se ignora.
  let mudando = false;

  function tomarInstantanea() {
    const s = { activo: null, ini: 0, fin: 0, estado: new Map(), scroll: new Map(),
                pagina: raiz().scrollTop, paginaX: raiz().scrollLeft,
                ventana: window.scrollY || 0 };
    const act = document.activeElement;
    const mirar = e => {
      if (!e.__nId) return;
      // Solo se guarda lo que el programa no gobierna. Si declara el valor, ese
      // valor es la verdad en el próximo pintado y no hay nada que devolver.
      if (e.__nControl && !e.__nGobernado) {
        s.estado.set(e.__nId, { valor: e.type === 'checkbox' ? e.checked : e.value });
      }
      if (e.scrollTop || e.scrollLeft) s.scroll.set(e.__nId, [e.scrollTop, e.scrollLeft]);
      if (e === act) {
        s.activo = e.__nId;
        try { s.ini = e.selectionStart; s.fin = e.selectionEnd; } catch (_) {}
      }
    };
    const todos = raiz().querySelectorAll('*');
    for (const e of todos) mirar(e);
    return s;
  }

  function restaurar() {
    const s = instantanea; instantanea = null;
    if (!s) return;
    const porId = new Map();
    for (const e of raiz().querySelectorAll('*')) if (e.__nId && !porId.has(e.__nId)) porId.set(e.__nId, e);
    for (const [id, guardado] of s.estado) {
      const e = porId.get(id);
      if (!e || !e.__nControl || e.__nGobernado) continue;
      try {
        if (e.type === 'checkbox') e.checked = !!guardado.valor;
        else if (guardado.valor !== undefined) e.value = guardado.valor;
      } catch (_) {}
    }
    for (const [id, [t, l]] of s.scroll) {
      const e = porId.get(id);
      if (e) { try { e.scrollTop = t; e.scrollLeft = l; } catch (_) {} }
    }
    raiz().scrollTop = s.pagina; raiz().scrollLeft = s.paginaX;
    if (s.ventana) window.scrollTo(0, s.ventana);
    if (s.activo) {
      const e = porId.get(s.activo);
      if (e && typeof e.focus === 'function') {
        try {
          e.focus({ preventScroll: true });
          if (e.setSelectionRange && s.ini !== null && s.ini !== undefined) e.setSelectionRange(s.ini, s.fin);
        } catch (_) {}
      }
    }
  }

  // Un turno de interacción: presupuesto de instrucciones nuevo, la página
  // reconstruida si el programa repinta, y lo que el usuario tenía puesto de
  // vuelta en su sitio.
  function turno(vm, fn, args) {
    if (!fn || mudando) return;
    enTurno = true;
    try { vm.nuevoTurno(); vm.invocar(fn, args || []); }
    catch (e) { linea(fmtErr(e), 'err'); irA('consola'); }
    finally { enTurno = false; restaurar(); traspintar(); }
  }

  const DATOS_TECLA = ev => ({ tecla: ev.key || '', codigo: ev.code || '' });
  function datosEvento(ev, e) {
    const d = { tipo: ev.type };
    if (e) { d.valor = e.type === 'checkbox' ? '' : (e.value !== undefined ? e.value : ''); d.marcada = !!e.checked; }
    if (ev.key !== undefined) Object.assign(d, DATOS_TECLA(ev));
    if (ev.clientX !== undefined) { d.x = ev.clientX | 0; d.y = ev.clientY | 0; }
    return d;
  }

  // Los oyentes no se quedan con la función: se quedan con el elemento y leen
  // «__nD», el descriptor del último pintado. Así un elemento que se reutiliza
  // entre repintados llama siempre a la función de ahora, no a la de antes.
  function conectarEventos(e, eventos, vm) {
    if (!eventos) return;
    const puestos = e.__nEv || (e.__nEv = new Set());
    for (const nombre in eventos) {
      if (puestos.has(nombre)) continue;
      puestos.add(nombre);
      e.addEventListener(nombre, ev => {
        if (nombre === 'change' && e.__nRecien) return;   // el Enter ya confirmó
        const d = e.__nD;
        const fn = d && d.eventos && d.eventos[nombre];
        if (nombre === 'submit') ev.preventDefault();
        if (fn) turno(e.__nVm || vm, fn, [dicDe(e.__nVm || vm, datosEvento(ev, e))]);
      });
    }
  }
  // Lo mismo para la acción principal del control.
  function conectarAccion(e, nombre, args) {
    if (e.__nAccion) return;
    e.__nAccion = true;
    e.addEventListener(nombre, () => {
      if (e.__nRecien) return;               // el Enter acaba de confirmarlo
      const d = e.__nD;
      if (d && d.accion) turno(e.__nVm, d.accion, args(e));
    });
  }
  // El Enter de una caja de texto. Confirma por su cuenta y le dice al «change»
  // que ya está hecho, porque el navegador suele mandar los dos y la tarea se
  // añadiría dos veces. La marca se limpia en el siguiente turno del navegador,
  // no comparando valores: confirmar dos veces el MISMO texto —dos tareas con
  // el mismo nombre— tiene que seguir funcionando.
  function conectarEnter(e) {
    e.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const d = e.__nD;
      if (!d) return;
      // Confirmar puede venir por los DOS caminos que tiene una entrada: la
      // función que se le pasa suelta —entrada("Nueva", anotar)— o el evento
      // declarado —{"alCambiar": …}—. Hay que cubrir los dos: el programa de la
      // prueba usa el segundo, y con solo el primero el Enter seguía cayendo al
      // vacío una vez de cada cuatro.
      if (d.accion) {
        e.__nRecien = true;
        setTimeout(() => { e.__nRecien = false; }, 0);
        turno(e.__nVm, d.accion, [e.value]);
        return;
      }
      const fn = d.eventos && d.eventos.change;
      if (!fn) return;
      e.__nRecien = true;
      setTimeout(() => { e.__nRecien = false; }, 0);
      // El programa declaró «alCambiar», así que lo que recibe tiene que decir
      // «change» y no «keydown»: para él esto ES la confirmación, y de dónde
      // salió es asunto del anfitrión.
      const datos = datosEvento(ev, e);
      datos.tipo = 'change';
      turno(e.__nVm, fn, [dicDe(e.__nVm, datos)]);
    });
  }

  // Un diccionario de Ñ a partir de un objeto plano, para pasárselo al programa.
  function dicDe(vm, o) {
    const d = vm.nuevoDic();
    for (const k in o) d.mapa.set(k, o[k]);
    return d;
  }

  // Un rótulo de verdad, asociado por envoltura: sin ids que inventar y
  // funciona igual para la casilla, donde además hace clicable el texto.
  function envolver(campo, d) {
    if (!d.rotulo || d.forma === 'boton') return campo;
    const env = el('label'); env.className = 'el-campo';
    const t = el('span', 'el-rotulo', d.rotulo);
    if (d.forma === 'casilla') { env.appendChild(campo); env.appendChild(t); }
    else { env.appendChild(t); env.appendChild(campo); }
    return env;
  }

  // Al reutilizar un elemento hay que quitarle lo que el programa ya no declara,
  // no solo ponerle lo nuevo.
  function reponerAtrib(e, atrib) {
    const quiere = atrib || {};
    for (const a of [...e.attributes]) {
      if (a.name === 'type') continue;
      if (!(a.name in quiere)) e.removeAttribute(a.name);
    }
    ponAtrib(e, quiere);
  }

  function reponerOpciones(e, ops) {
    const nuevas = (ops || []).map(o => o.valor + '\u0000' + o.texto).join('\u0001');
    if (e.__nOps === nuevas) return;
    e.__nOps = nuevas;
    const elegido = e.value;
    e.innerHTML = '';
    for (const o of (ops || [])) { const op = el('option', null, o.texto); op.value = o.valor; e.appendChild(op); }
    if (elegido) e.value = elegido;
  }

  function ponAtrib(e, atrib) {
    for (const k in atrib) { try { e.setAttribute(k, atrib[k]); } catch (_) {} }
  }

  const web = {
    asegurarClase(nombre, texto) {
      if (clasesPuestas.has(nombre)) return;
      clasesPuestas.add(nombre);
      hojaDeClases().appendChild(document.createTextNode(texto + '\n'));
    },
    abrir(nombre, atrib, meta) {
      let e;
      try { e = document.createElement(nombre); }
      catch (_) { e = document.createElement('span'); }
      ponAtrib(e, atrib);
      sellar(e, meta && meta.clave);
      if (meta && meta.eventos) {
        e.__nD = { eventos: meta.eventos };
        e.__nVm = meta.vm;
        conectarEventos(e, meta.eventos, meta.vm);
      }
      conectar(e);
      if (pila.length < MAX_PILA) { pila.push(e); cont.push(0); }
      else { pila.push(actual()); cont.push(0); }   // no bajar más, pero mantener el equilibrio
    },
    cerrar() { pila.pop(); if (cont.length > 1) cont.pop(); },
    texto(t) { siguienteRuta(); conectar(document.createTextNode(t)); },
    eco(html) { siguienteRuta(); actual().insertAdjacentHTML('beforeend', html); irA('pagina'); },
    estilo(css) { const s = el('style'); s.textContent = css; raiz().appendChild(s); },
    limpiar() {
      if (enTurno && !instantanea) instantanea = tomarInstantanea();
      const act = document.activeElement;
      mudando = true;
      try {
        if (enTurno) {
          apartado = (act && act.__nControl && raiz().contains(act)) ? act : null;
          if (apartado) apartado.remove();
        }
        raiz().innerHTML = '';
      } finally { mudando = false; }
      pila = []; cont = [0];
      clasesPuestas.clear();
      if (hoja) { hoja.remove(); hoja = null; }
    },
    // Un solo punto de entrada para todos los controles. El anfitrión no
    // interpreta nada: monta el elemento que le piden, le pone los atributos ya
    // resueltos y conecta las funciones que le pasan.
    control(d, vm) {
      const ruta = d.clave ? null : siguienteRuta();
      const id = d.clave ? 'k:' + d.clave : 'r:' + ruta;
      // ¿Es el mismo control que tenía el foco antes de repintar? Entonces se
      // reutiliza tal cual, con lo que el usuario estuviera escribiendo dentro.
      if (apartado && apartado.__nId === id && apartado.__nForma === d.forma) {
        const e = apartado; apartado = null;
        e.__nD = d; e.__nVm = vm;
        reponerAtrib(e, d.atrib);
        e.__nGobernado = d.forma === 'casilla' ? !!d.declara : !!(d.atrib && d.atrib.value !== undefined);
        if (e.__nGobernado) {
          if (d.forma === 'casilla') e.checked = !!d.marcada;
          else if (d.atrib && d.atrib.value !== undefined && e.value !== d.atrib.value) e.value = d.atrib.value;
        }
        if (d.forma === 'seleccion') {
          reponerOpciones(e, d.opciones);
          if (d.atrib && d.atrib.value !== undefined) e.value = d.atrib.value;
        }
        conectarEventos(e, d.eventos, vm);
        conectar(envolver(e, d));
        return;
      }
      let campo, envoltura = null;
      switch (d.forma) {
        case 'boton': {
          campo = el('button', null, d.rotulo);
          campo.type = 'button';
          conectarAccion(campo, 'click', () => []);
          break;
        }
        case 'entrada': case 'area': {
          campo = el(d.forma === 'area' ? 'textarea' : 'input');
          conectarAccion(campo, 'change', e => [e.value]);
          // Y con Enter, aparte del «change». No es una comodidad: en una caja
          // GOBERNADA el repintado le escribe el valor —«e.value = …»— y eso
          // reinicia la referencia con la que el navegador decide si «change»
          // toca. Si un repintado cae entre la última tecla y el Enter, el
          // navegador ve la caja «sin cambios» y el Enter no confirma NADA: se
          // escribe la tarea, se pulsa Enter y no pasa nada. Con un reloj
          // repintando por debajo pasaba dos veces de cada tres.
          if (d.forma === 'entrada') conectarEnter(campo);
          break;
        }
        case 'casilla': {
          campo = el('input'); campo.type = 'checkbox'; campo.checked = !!d.marcada;
          conectarAccion(campo, 'change', e => [e.checked]);
          break;
        }
        case 'seleccion': {
          campo = el('select');
          reponerOpciones(campo, d.opciones);
          conectarAccion(campo, 'change', e => [e.value]);
          break;
        }
        default: campo = el('span', null, d.rotulo || '');
      }
      campo.__nForma = d.forma; campo.__nD = d; campo.__nVm = vm;
      ponAtrib(campo, d.atrib);
      // En un <select>, el atributo «value» no selecciona nada: hay que poner la
      // propiedad. Sin esto, desplegable(…, {"valor": x}) enseñaba siempre la
      // primera opción por mucho que el programa dijera otra.
      if (d.forma === 'seleccion' && d.atrib && d.atrib.value !== undefined) campo.value = d.atrib.value;
      // Un control es «gobernado» cuando el programa dice qué valor tiene. Ahí
      // el programa manda siempre y el repintado lo repone. Si no lo dice, lo
      // que hay escrito es del usuario y sobrevive al repintado.
      campo.__nGobernado = d.forma === 'casilla'
        ? !!d.declara
        : !!(d.atrib && d.atrib.value !== undefined);
      campo.__nId = id; campo.__nControl = true;
      conectarEventos(campo, d.eventos, vm);
      conectar(envolver(campo, d));
    },
  };

  // ─────────────────────────────────────────── temporizadores
  // Un programa puede pedir que lo llamen más tarde. Los límites no son
  // decoración: sin tope de temporizadores vivos ni intervalo mínimo, un bucle
  // de «cada(0, …)» deja la pestaña inservible y no hay botón que lo pare.
  const temporizadores = new Map();
  let sigTemp = 1;
  const MAX_TEMP = 64, MIN_MS = 15;
  function pararTodos() {
    for (const [, t] of temporizadores) (t.repite ? clearInterval : clearTimeout)(t.h);
    temporizadores.clear();
  }
  function nuevoTemp(ms, fn, vm, repite) {
    if (temporizadores.size >= MAX_TEMP)
      throw new Error(`no puede haber más de ${MAX_TEMP} temporizadores a la vez`);
    const id = sigTemp++;
    const espera = Math.max(MIN_MS, ms | 0);
    const disparo = () => {
      if (!repite) temporizadores.delete(id);
      turno(vm, fn, []);
    };
    const h = repite ? setInterval(disparo, espera) : setTimeout(disparo, espera);
    temporizadores.set(id, { h, repite });
    return id;
  }
  const tiempo = {
    luego(ms, fn, vm) { return nuevoTemp(ms, fn, vm, false); },
    cada(ms, fn, vm) { return nuevoTemp(ms, fn, vm, true); },
    detener(id) {
      const t = temporizadores.get(id);
      if (!t) return false;
      (t.repite ? clearInterval : clearTimeout)(t.h);
      temporizadores.delete(id);
      return true;
    },
  };


  // ─────────────────────────────────────────── red
  // Un programa que puede pedir datos también puede mandarlos, así que el
  // permiso no lo da el programa: lo da quien está delante, una vez por sitio.
  // La pregunta se hace fuera de #pagina, para que limpiarPagina() no se la
  // lleve por delante en mitad de un repintado.
  const MAX_VIVAS = 4, ESPERA = 15000, MAX_BYTES = 2 * 1024 * 1024;
  const permisos = new Map();          // solo de esta sesión
  const guardados = op.permisos || null;   // los que sobreviven, si el documento los tiene
  let vivas = 0;
  const cola = [];

  function recordado(sitio) {
    if (permisos.has(sitio)) return permisos.get(sitio);
    if (guardados) {
      const v = guardados.leer(sitio);
      if (v === 'si' || v === 'no') { permisos.set(sitio, v === 'si'); return v === 'si'; }
    }
    return null;
  }

  function preguntar(sitio, responder) {
    irA('pagina');
    const caja = el('div', 'n-permiso');
    caja.setAttribute('role', 'alertdialog');
    const t = el('div', 'n-permiso-txt');
    t.appendChild(el('b', null, 'El programa quiere pedir datos a ' + sitio));
    t.appendChild(el('div', 'n-permiso-sub', 'Lo que pida y lo que mande sale de aquí. Permítelo solo si sabes qué es ese sitio.'));
    const bs = el('div', 'n-permiso-bs');
    const no = el('button', 'n-no', 'No');
    const si = el('button', 'n-si', 'Permitir');
    const cerrar = v => {
      caja.remove();
      permisos.set(sitio, v);
      if (guardados) guardados.escribir(sitio, v ? 'si' : 'no');
      responder(v);
    };
    no.addEventListener('click', () => cerrar(false));
    si.addEventListener('click', () => cerrar(true));
    bs.appendChild(no); bs.appendChild(si);
    caja.appendChild(t); caja.appendChild(bs);
    document.body.insertBefore(caja, document.body.firstChild);
    si.focus();
  }

  function respuesta(vm, fn, datos) {
    const d = vm.nuevoDic();
    for (const k in datos) d.mapa.set(k, datos[k]);
    turno(vm, fn, [d]);
  }

  function siguienteDeLaCola() {
    vivas--;
    const n = cola.shift();
    if (n) n();
  }

  function lanzar(url, o, fn, vm) {
    vivas++;
    const corta = new AbortController();
    const reloj = setTimeout(() => corta.abort(), ESPERA);
    const cab = Object.assign({}, o.cabeceras);
    if (o.cuerpo !== null && !Object.keys(cab).some(k => k.toLowerCase() === 'content-type')) {
      cab['Content-Type'] = 'text/plain;charset=utf-8';
    }
    let estado = 0, tipo = '';
    // credentials: 'omit' a propósito: nada de cookies ni credenciales de nadie
    // viajando porque un programa escribió una dirección.
    fetch(url, { method: o.metodo, headers: cab, body: o.cuerpo, credentials: 'omit', redirect: 'follow', signal: corta.signal })
      .then(r => {
        estado = r.status;
        tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
        const largo = Number(r.headers.get('content-length') || 0);
        if (largo > MAX_BYTES) throw new Error('la respuesta ocupa ' + largo + ' bytes y el máximo es ' + MAX_BYTES);
        return r.text();
      })
      .then(texto => {
        clearTimeout(reloj);
        if (texto.length > MAX_BYTES) throw new Error('la respuesta es demasiado grande');
        respuesta(vm, fn, { ok: estado >= 200 && estado < 300, estado, cuerpo: texto, tipo, error: '' });
      })
      .catch(e => {
        clearTimeout(reloj);
        const msg = (e && e.name === 'AbortError')
          ? 'la petición tardó más de ' + (ESPERA / 1000) + ' s'
          : String((e && e.message) || e);
        respuesta(vm, fn, { ok: false, estado, cuerpo: '', tipo, error: msg });
      })
      .then(siguienteDeLaCola, siguienteDeLaCola);
  }

  const red = {
    pedir(url, o, fn, vm) {
      let sitio;
      try { const u = new URL(url); sitio = u.protocol + '//' + u.host; }
      catch (_) { respuesta(vm, fn, { ok: false, estado: 0, cuerpo: '', tipo: '', error: 'la dirección no es válida' }); return; }
      const seguir = ok => {
        if (!ok) { respuesta(vm, fn, { ok: false, estado: 0, cuerpo: '', tipo: '', error: 'sin permiso para ' + sitio }); return; }
        const arranca = () => lanzar(url, o, fn, vm);
        if (vivas >= MAX_VIVAS) cola.push(arranca); else arranca();
      };
      const ya = recordado(sitio);
      if (ya !== null) { seguir(ya); return; }
      preguntar(sitio, seguir);
    },
  };

  // Todo lo que hay que deshacer antes de volver a empezar. El orden importa:
  // los temporizadores primero, porque si no seguirían llamando a funciones de
  // un motor que ya no existe.
  function limpiarTodo() {
    pararTodos();
    for (const c of [...document.querySelectorAll('.n-permiso')]) c.remove();
    const c = $('#consola');
    if (c) c.innerHTML = '';
    web.limpiar();
    vaciarLienzo();
  }

  return { web, grafico, tiempo, red, limpiarTodo, pararTodos, vaciarLienzo, turno, lienzo };
}

if (typeof module !== 'undefined') module.exports = { crearAnfitrion };
