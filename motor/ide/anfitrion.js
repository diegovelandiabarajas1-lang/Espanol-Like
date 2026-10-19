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
  // La letra de escribirEn. Por defecto, la de siempre (12 px, sans, a la
  // izquierda): un programa que no llama a letra() se ve exactamente igual.
  const LETRA = () => ({ tam: 12, alin: 'left', peso: '', fam: 'sans-serif' });
  const lienzo = { c: null, ctx: null, color: '#4F3FD4', grosor: 2, letra: LETRA() };

  function vaciarLienzo() {
    const caja = $('#cajaLienzo');
    if (caja) caja.innerHTML = op.vacioLienzo || '';
    lienzo.c = null; lienzo.ctx = null; lienzo.color = '#4F3FD4'; lienzo.grosor = 2; lienzo.letra = LETRA();
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
    // letra(tamaño, alineación?, estilo?) — cómo escribe escribirEn desde ahí.
    // Las palabras son las mismas del eDSL de estilo: «centro», «negrita»…
    letra(tam, alin, estilo) {
      const t = Number(tam);
      if (!(t >= 1 && t <= 400)) throw new Error(`«letra»: el tamaño va de 1 a 400 píxeles, y llegó ${tam}`);
      const ALIN = { izquierda: 'left', centro: 'center', derecha: 'right' };
      let a = 'left';
      if (alin !== undefined && alin !== null) {
        a = ALIN[alin];
        if (!a) throw new Error(`«letra»: la alineación es «izquierda», «centro» o «derecha», no «${alin}»`);
      }
      const palabras = estilo === undefined || estilo === null ? [] : String(estilo).split(/\s+/).filter(Boolean);
      for (const w of palabras)
        if (w !== 'negrita' && w !== 'mono') throw new Error(`«letra»: el estilo admite «negrita» y «mono», no «${w}»`);
      lienzo.letra = {
        tam: t, alin: a,
        peso: palabras.includes('negrita') ? 'bold ' : '',
        fam: palabras.includes('mono') ? 'ui-monospace, Consolas, "Cascadia Mono", monospace' : 'sans-serif',
      };
    },
    linea(x1, y1, x2, y2) { const g = ctx(); g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
    rect(x, y, w, h, r) { const g = ctx(); if (r === false) { g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.strokeRect(x, y, w, h); } else { g.fillStyle = lienzo.color; g.fillRect(x, y, w, h); } },
    circulo(x, y, rad, r) { const g = ctx(); g.beginPath(); g.arc(x, y, Math.abs(rad), 0, Math.PI * 2); if (r === false) { g.strokeStyle = lienzo.color; g.lineWidth = lienzo.grosor; g.stroke(); } else { g.fillStyle = lienzo.color; g.fill(); } },
    punto(x, y) { const g = ctx(); g.fillStyle = lienzo.color; g.fillRect(x | 0, y | 0, 1, 1); },
    escribirEn(x, y, t) { const g = ctx(), L = lienzo.letra; g.fillStyle = lienzo.color; g.textAlign = L.alin; g.textBaseline = 'alphabetic'; g.font = `${L.peso}${L.tam}px ${L.fam}`; g.fillText(String(t), x, y); },
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
  // ═══════════════════════════════════════════════════════════════════════
  //  4.1 · LA PÁGINA SE RECONCILIA, NO SE REPINTA
  // ═══════════════════════════════════════════════════════════════════════
  // Antes: cada limpiarPagina() hacía «innerHTML = ''» y cada pintar() volvía a
  // crear TODOS los elementos. Con un reloj de un segundo, una lista de 300
  // filas se destruía y se creaba entera 60 veces por minuto, y lo que el
  // usuario tenía puesto (lo tecleado, el desplazamiento, el foco) había que
  // fotografiarlo antes y devolverlo después.
  //
  // Ahora el programa no toca el DOM: abrir/cerrar/texto/control/eco describen
  // un MODELO de la página, y al acabar el turno «volcar» lo compara con lo que
  // ya hay y cambia solo lo distinto. Un elemento que sigue ahí es el MISMO
  // elemento: conserva su foco, su texto, su cursor y su desplazamiento sin
  // que haga falta guardar nada. Un repintado que no cambia nada no toca el DOM.
  //
  // Y la memoria: un control que deja de pintarse —una pestaña que se oculta,
  // un panel que se pliega— guarda lo que el usuario había escrito en él. Si
  // vuelve a pintarse, lo recupera. Antes se perdía: la foto duraba un solo
  // repintado.
  const raiz = () => $('#pagina');
  const MAX_PILA = 250;
  const MAX_MEMORIA = 500;

  const nuevoModelo = () => ({ t: 'raiz', hijos: [], clave: null, cuentas: null });
  let modelo = nuevoModelo();
  let pila = [];
  const actual = () => (pila.length ? pila[pila.length - 1] : modelo);

  // Identidad posicional de los elementos, como antes (la usa la traza de
  // «__nId» y el desplazamiento). Los CONTROLES ya no usan esta: ver idControl.
  let cont = [0];
  function siguienteRuta() { cont[cont.length - 1]++; return cont.join('.'); }

  // La identidad de un control sin clave. Antes era su posición —«r:1.4.2»— y
  // eso tenía un fallo de fondo: si el programa dejaba de pintar un trozo de
  // página, todos los controles que venían DETRÁS cambiaban de identidad, y el
  // texto que el usuario había escrito en uno aparecía en otro. Ahora es «qué
  // control es y cómo se llama», contado dentro del ancestro con clave más
  // cercano: «entrada:Nombre#0». Quitar o poner otra parte de la página no lo
  // mueve. Con dos controles iguales en el mismo sitio —una lista de cajas con
  // el mismo rótulo— la clave sigue siendo la forma de no confundirlos.
  function idControl(d) {
    if (d.clave) return 'k:' + d.clave;
    let ambito = modelo;
    for (let i = pila.length - 1; i >= 0; i--) if (pila[i].clave) { ambito = pila[i]; break; }
    const k = d.forma + ':' + (d.rotulo === undefined || d.rotulo === null ? '' : String(d.rotulo));
    const c = ambito.cuentas || (ambito.cuentas = new Map());
    const n = c.get(k) || 0;
    c.set(k, n + 1);
    return 'a:' + (ambito.clave ? ambito.clave : '') + '/' + k + '#' + n;
  }

  // Lo que el usuario escribió en controles que ya no están en la página.
  const memoria = new Map();
  function recordar(id, valor) {
    memoria.delete(id);
    memoria.set(id, valor);
    if (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value);
  }

  // Las clases que salen del tipo «estilo». Se juntan en el modelo y la hoja
  // solo se reescribe si cambió: repintar mil veces no toca la hoja ni una.
  let hoja = null;
  let clasesModelo = new Map();
  let textoHoja = '';
  function hojaDeClases() {
    if (!hoja || !hoja.isConnected) {
      hoja = el('style'); hoja.id = 'clases-n';
      document.head.appendChild(hoja);
      textoHoja = '';
    }
    return hoja;
  }

  let enTurno = false;
  // Mientras se vuelca, el navegador puede disparar «change» o «blur» por
  // mover o quitar un control. No son acciones del usuario y se ignoran (igual
  // que antes al desmontar la página).
  let mudando = false;
  let pendiente = false, emitido = false;
  // Fuera de un turno —el programa principal, por ejemplo— el vuelco va en una
  // microtarea: después de todo el código síncrono, antes de que el navegador
  // pinte. Dentro de un turno lo hace el propio turno al acabar.
  function marcar() {
    emitido = true;
    if (pendiente) return;
    pendiente = true;
    if (!enTurno) queueMicrotask(volcar);
  }
  function poner(n) { actual().hijos.push(n); marcar(); }

  function turno(vm, fn, args) {
    if (!fn || mudando) return;
    enTurno = true;
    try { vm.nuevoTurno(); vm.invocar(fn, args || []); }
    catch (e) { linea(fmtErr(e), 'err'); irA('consola'); }
    finally { enTurno = false; volcar(); traspintar(); }
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

  // ── el vuelco: del modelo al DOM, cambiando solo lo distinto ──────────────
  function volcar() {
    if (!pendiente) return;
    pendiente = false;
    const r = raiz();
    if (!r) return;
    const act = document.activeElement;
    const dentro = !!(act && act !== document.body && r.contains(act));
    let ini = null, fin = null;
    if (dentro) { try { ini = act.selectionStart; fin = act.selectionEnd; } catch (_) {} }
    const idAct = dentro ? act.__nId : null;
    mudando = true;
    try {
      reconciliar(r, modelo.hijos);
      const texto = [...clasesModelo.values()].join('\n');
      if (texto !== textoHoja || (texto && (!hoja || !hoja.isConnected))) {
        hojaDeClases().textContent = texto;
        textoHoja = texto;
      }
    } finally { mudando = false; }
    // El foco. Si el control sigue en la página no se movió y lo conserva
    // solo; si hubo que moverlo de sitio, el navegador se lo quita y aquí se
    // le devuelve con el cursor donde estaba. Si se recreó, se busca por su
    // identidad.
    if (dentro && document.activeElement !== act) {
      let e = act.isConnected ? act : null;
      if (!e && idAct) for (const x of r.querySelectorAll('input,textarea,select,button')) if (x.__nId === idAct) { e = x; break; }
      if (e && typeof e.focus === 'function') {
        try {
          e.focus({ preventScroll: true });
          if (e.setSelectionRange && ini !== null && ini !== undefined) e.setSelectionRange(ini, fin);
        } catch (_) {}
      }
    }
    if (emitido) { emitido = false; irA('pagina'); }
  }

  // Lo que se quita de la página deja en la memoria lo que el usuario había
  // escrito en sus controles, para cuando vuelva.
  function olvidar(n) {
    if (n.nodeType !== 1) return;
    const campos = n.__nControl ? [n] : [];
    if (n.querySelectorAll) for (const c of n.querySelectorAll('input,textarea,select')) if (c.__nControl) campos.push(c);
    for (const c of campos) {
      if (c.__nGobernado || !c.__nId) continue;
      recordar(c.__nId, c.type === 'checkbox' ? !!c.checked : c.value);
    }
  }

  // Un contenedor del DOM contra la lista de hijos que dice el modelo.
  // 1. Se reparten los hijos que ya hay por cómo se reconocen: elementos con
  //    clave, elementos sin clave (por etiqueta, en orden), controles (por
  //    identidad), textos (en orden) y trozos de HTML crudo (por su HTML).
  // 2. Cada hijo del modelo se queda con uno de esos o se crea, y se actualiza.
  // 3. Se colocan en orden. Un nodo que ya está en su sitio no se mueve, y en
  //    un repintado con la misma forma no se mueve NINGUNO.
  // 4. Lo que sobra se quita.
  function reconciliar(padre, vhijos) {
    const conClave = new Map(), porEtiq = new Map(), porCtl = new Map(), textos = [], crudos = new Map();
    const tomar = (m, k) => { const q = m.get(k); return q && q.length ? q.shift() : null; };
    const echar = (m, k, n) => { const q = m.get(k); if (q) q.push(n); else m.set(k, [n]); };
    const grupos = new Set();
    for (const n of padre.childNodes) {
      if (n.__nGrupo) { if (!grupos.has(n.__nGrupo)) { grupos.add(n.__nGrupo); echar(crudos, n.__nGrupo.html, n.__nGrupo); } continue; }
      if (n.nodeType === 3) { textos.push(n); continue; }
      if (n.__nCtlId) { if (!porCtl.has(n.__nCtlId)) porCtl.set(n.__nCtlId, n); continue; }
      if (n.nodeType === 1 && n.__nK !== undefined && n.__nK !== null) { conClave.set(n.nodeName + '|' + n.__nK, n); continue; }
      if (n.nodeType === 1 && n.__nV) echar(porEtiq, n.nodeName, n);
    }
    const destino = [];
    for (const v of vhijos) {
      switch (v.t) {
        case 'tx': {
          const n = textos.length ? textos.shift() : document.createTextNode('');
          if (n.data !== v.s) n.data = v.s;
          destino.push(n);
          break;
        }
        case 'st': {
          let n = tomar(porEtiq, 'STYLE');
          if (!n) { n = el('style'); n.__nV = true; }
          if (n.textContent !== v.css) n.textContent = v.css;
          destino.push(n);
          break;
        }
        case 'cr': {
          let g = tomar(crudos, v.html);
          if (!g) {
            // Se parsea dentro de un elemento de la misma clase que el padre,
            // como hacía insertAdjacentHTML: un <tr> crudo dentro de una tabla
            // sigue siendo un <tr>. Y, como antes, un <script> no se ejecuta.
            let caja;
            try { caja = document.createElement(padre === raiz() ? 'div' : padre.nodeName); } catch (_) { caja = el('div'); }
            caja.insertAdjacentHTML('beforeend', v.html);
            g = { html: v.html, nodos: [...caja.childNodes] };
            for (const n of g.nodos) n.__nGrupo = g;
          }
          for (const n of g.nodos) destino.push(n);
          break;
        }
        case 'el': {
          const etiq = v.etiq;
          let n = v.clave !== undefined && v.clave !== null ? conClave.get(etiq + '|' + v.clave) : tomar(porEtiq, etiq);
          if (n && v.clave !== undefined && v.clave !== null) conClave.delete(etiq + '|' + v.clave);
          if (!n) {
            try { n = document.createElement(v.nombre); } catch (_) { n = document.createElement('span'); }
            n.__nV = true;
            ponAtrib(n, v.atrib);
          } else reponerAtrib(n, v.atrib);
          n.__nId = v.id;
          n.__nK = v.clave;
          if (v.eventos) {
            n.__nD = { eventos: v.eventos };
            n.__nVm = v.vm;
            conectarEventos(n, v.eventos, v.vm);
          } else if (n.__nD) n.__nD = null;
          reconciliar(n, v.hijos);
          destino.push(n);
          break;
        }
        case 'ctl': {
          let n = porCtl.get(v.id);
          if (n) porCtl.delete(v.id);
          if (n && !puedeReusar(n, v.d)) { olvidar(n); n = null; }
          destino.push(n ? actualizarControl(n, v.d, v.vm) : crearControl(v.d, v.vm, v.id));
          break;
        }
      }
    }
    // Primero se quita lo que sobra: lo que no está en «destino».
    const quedan = new Set(destino);
    for (const n of [...padre.childNodes]) {
      if (quedan.has(n)) continue;
      olvidar(n);
      if (n.__nGrupo) n.__nGrupo = null;
      padre.removeChild(n);
    }
    // Y luego se ordena moviendo lo MENOS posible. Los nodos que ya están en
    // el orden bueno entre sí —la subsecuencia creciente más larga de sus
    // posiciones de antes— no se tocan; solo se mueven los demás. Con la
    // colocación ingenua («poner cada uno en su índice»), rotar una lista con
    // clave un puesto movía los 300 elementos; así mueve uno. Mover un nodo no
    // es gratis: el navegador le quita el foco y recalcula su estilo.
    const antes = new Map();
    padre.childNodes.forEach((n, i) => antes.set(n, i));
    const fijos = subsecuenciaCreciente(destino.map(n => (antes.has(n) ? antes.get(n) : -1)));
    let ref = null;
    for (let i = destino.length - 1; i >= 0; i--) {
      const n = destino[i];
      if (!fijos.has(i) || n.parentNode !== padre) padre.insertBefore(n, ref);
      else if (n.nextSibling !== ref) padre.insertBefore(n, ref);
      ref = n;
    }
  }

  // Los índices (de «xs») que forman la subsecuencia estrictamente creciente
  // más larga, sin contar los -1 (nodos nuevos). O(n log n), la de siempre.
  function subsecuenciaCreciente(xs) {
    const colas = [], previo = new Array(xs.length).fill(-1);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x < 0) continue;
      let lo = 0, hi = colas.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (xs[colas[m]] < x) lo = m + 1; else hi = m; }
      if (lo > 0) previo[i] = colas[lo - 1];
      colas[lo] = i;
    }
    const fuera = new Set();
    let k = colas.length ? colas[colas.length - 1] : -1;
    while (k >= 0) { fuera.add(k); k = previo[k]; }
    return fuera;
  }

  // ── controles ────────────────────────────────────────────────────────────
  const conRotulo = d => !!d.rotulo && d.forma !== 'boton';
  function puedeReusar(n, d) {
    const campo = n.__nCampo || n;
    return campo.__nForma === d.forma && (n !== campo) === conRotulo(d);
  }
  function gobernado(d) {
    return d.forma === 'casilla' ? !!d.declara : !!(d.atrib && d.atrib.value !== undefined);
  }

  function actualizarControl(n, d, vm) {
    const e = n.__nCampo || n;
    e.__nD = d; e.__nVm = vm;
    reponerAtrib(e, d.atrib);
    if (d.forma === 'boton') { if (e.textContent !== (d.rotulo || '')) e.textContent = d.rotulo || ''; e.type = 'button'; }
    if (n !== e) {
      const t = n.querySelector('.el-rotulo');
      if (t && t.textContent !== d.rotulo) t.textContent = d.rotulo;
    }
    e.__nGobernado = gobernado(d);
    if (e.__nGobernado) {
      if (d.forma === 'casilla') { if (e.checked !== !!d.marcada) e.checked = !!d.marcada; }
      else if (d.atrib && d.atrib.value !== undefined && e.value !== d.atrib.value) e.value = d.atrib.value;
    }
    if (d.forma === 'seleccion') {
      reponerOpciones(e, d.opciones);
      if (d.atrib && d.atrib.value !== undefined && e.value !== d.atrib.value) e.value = d.atrib.value;
    }
    conectarEventos(e, d.eventos, vm);
    return n;
  }

  function crearControl(d, vm, id) {
    let campo;
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
        // Y con Enter, aparte del «change»: en una caja gobernada el repintado
        // le escribe el valor y eso puede hacer que el navegador no mande el
        // «change» (ver la historia en ARQUITECTURA.md, fase 3).
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
    // En un <select>, el atributo «value» no selecciona: hay que poner la propiedad.
    if (d.forma === 'seleccion' && d.atrib && d.atrib.value !== undefined) campo.value = d.atrib.value;
    campo.__nGobernado = gobernado(d);
    campo.__nId = id; campo.__nControl = true;
    // Lo que el usuario había escrito la última vez que este control estuvo
    // en la página. Solo si el programa no gobierna su valor: si lo declara,
    // manda el programa.
    if (!campo.__nGobernado && memoria.has(id)) {
      const v = memoria.get(id);
      memoria.delete(id);
      try { if (campo.type === 'checkbox') campo.checked = !!v; else campo.value = v; } catch (_) {}
    }
    conectarEventos(campo, d.eventos, vm);
    const n = envolver(campo, d);
    n.__nCtlId = id;
    if (n !== campo) n.__nCampo = campo;
    return n;
  }

  const web = {
    asegurarClase(nombre, texto) {
      if (clasesModelo.has(nombre)) return;
      clasesModelo.set(nombre, texto);
      marcar();
    },
    abrir(nombre, atrib, meta) {
      // Un nombre que createElement rechazaría se cambia por «span», como antes.
      let etiq;
      if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(nombre)) etiq = nombre.toUpperCase();
      else { etiq = 'SPAN'; nombre = 'span'; }
      const ruta = siguienteRuta();
      const clave = meta && meta.clave !== undefined && meta.clave !== null ? String(meta.clave) : null;
      const v = { t: 'el', nombre, etiq, atrib: atrib || {}, eventos: (meta && meta.eventos) || null, vm: meta && meta.vm,
                  clave, id: clave ? 'k:' + clave : 'r:' + ruta, hijos: [], cuentas: null };
      if (pila.length < MAX_PILA) { poner(v); pila.push(v); cont.push(0); }
      else { marcar(); pila.push(actual()); cont.push(0); }   // no bajar más, pero mantener el equilibrio
    },
    cerrar() { pila.pop(); if (cont.length > 1) cont.pop(); },
    texto(t) { siguienteRuta(); poner({ t: 'tx', s: String(t) }); },
    eco(html) { siguienteRuta(); poner({ t: 'cr', html: String(html) }); },
    estilo(css) { modelo.hijos.push({ t: 'st', css: String(css) }); marcar(); },
    // Ya no borra el DOM: empieza un modelo nuevo. Lo que de verdad cambia se
    // decide al volcar.
    limpiar() {
      modelo = nuevoModelo();
      pila = []; cont = [0];
      clasesModelo = new Map();
      emitido = false;
      if (!pendiente) { pendiente = true; if (!enTurno) queueMicrotask(volcar); }
    },
    control(d, vm) {
      if (!d.clave) siguienteRuta();
      poner({ t: 'ctl', d, vm, id: idControl(d) });
    },
  };

  // Para empezar un programa nuevo: aquí sí se borra todo, memoria incluida,
  // porque lo que se escribió en otro programa no es de este.
  function reiniciarPagina() {
    modelo = nuevoModelo(); pila = []; cont = [0];
    clasesModelo = new Map(); memoria.clear();
    pendiente = false; emitido = false;
    const r = raiz();
    if (r) { mudando = true; try { r.innerHTML = ''; } finally { mudando = false; } }
    if (hoja) { hoja.remove(); hoja = null; }
    textoHoja = '';
  }


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
    reiniciarPagina();
    vaciarLienzo();
  }

  return { web, grafico, tiempo, red, limpiarTodo, pararTodos, vaciarLienzo, turno, lienzo, volcar };
}

if (typeof module !== 'undefined') module.exports = { crearAnfitrion };
