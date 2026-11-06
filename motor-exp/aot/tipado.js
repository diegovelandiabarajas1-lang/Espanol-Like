// ============================================================================
//  (motor-exp A4) El nivel TIPADO del compilador a C.
//
//  Las funciones PURAS de A3 solo saben de números. Este nivel suma las listas de números y de bool, y la división, el resto y la
//  división entera: una función (y las que llama) que solo hace cuentas y lee o escribe listas de números se emite como C de
//  verdad — double, int, NLista* — sin cajas, sin etiquetas y sin mirar el error tras cada paso.
//
//  Cómo se queda igual que la VM sin tener que repetir cada mensaje de error:
//    · lo "raro" (índice fuera de rango o no entero, división por cero, raíz de un negativo, una lista de otra clase, demasiada
//      profundidad) no se trata aquí: se pone n_tdeopt y la función baja de golpe, y quien la llamó desde fuera VUELVE A EMPEZAR
//      con la versión general, que da el error de siempre, con su mensaje y su rastro. Para poder volver a empezar sin que se note,
//      una función solo se ofrece desde fuera si no toca nada que no sea suyo: sus listas parámetro no se escriben, no hay
//      globales, ni salida, ni llamadas a nada que no sea tipado (ver «entrada»).
//    · los tipos no se suponen: se INFIEREN en todo el programa, por unificación (el de cada casilla de la pila en cada
//      instrucción, y el elemento de cada lista). Si dos usos no cuadran (una lista de números que también recibe un bool) la
//      función se queda por el camino general. Y al entrar desde fuera se comprueba de verdad lo que se infirió de los parámetros.
//    · las listas llevan su conteo de referencias de siempre: cada casilla de la pila que guarda una lista nueva la posee (-1);
//      las copias de una variable local son préstamos (el número de la casilla) y no cuentan.
// ============================================================================
'use strict';

class NoElegible extends Error {}

function analizarTipado(ctx) {
  const { OP, efecto, tipoGlobal, definidaSeguro, depurar, esPura } = ctx;
  // Las funciones que CONSTRUYEN listas («nueva(n)») se instancian en cada sitio desde el que se llaman: los tipos se unifican en todo el
  // programa y, con una sola instancia, la lista que crea «nueva» en un sitio compartiría clase con la de todos los demás (y bastaría que en
  // uno se guardase un real para que ninguna pudiera llevarse como enteros). Una instancia tiene un número nuevo (mayor que cualquier índice
  // del plan); «plan[id]» resuelve a la función de verdad.
  const planReal = ctx.plan;
  const clonDe = new Map();                     // id de instancia → índice en el plan
  const plan = new Proxy(planReal, { get(t, p) { if (typeof p === 'string' && /^\d+$/.test(p)) { const i = Number(p); return t[clonDe.has(i) ? clonDe.get(i) : i]; } return t[p]; } });
  const realDe = id => (clonDe.has(id) ? clonDe.get(id) : id);
  const OPS_OK = new Set([OP.CONST, OP.NULO, OP.CIERTO, OP.FALSO, OP.POP, OP.DUP, OP.GET_LOCAL, OP.SET_LOCAL, OP.GET_GLOBAL, OP.ADD, OP.SUB,
    OP.MUL, OP.DIV, OP.IDIV, OP.MOD, OP.NEG, OP.NOT, OP.EQ, OP.NEQ, OP.LT, OP.LE, OP.GT, OP.GE, OP.JMP, OP.JMP_FALSE, OP.JMP_TRUE, OP.LOOP,
    OP.CALL, OP.RET, OP.LISTA, OP.IDX_GET, OP.IDX_SET, OP.LEN, OP.PROP_GET]);
  const NATIVAS_NUM = { 'nat:longitud': 1, 'nat:reloj': 1, 'nat:entero': 1, 'nat:numerico/raiz': 1, 'nat:numerico/absoluto': 1, 'nat:numerico/piso': 1, 'nat:numerico/techo': 1 };

  // ── (A4) los «tipo» del programa ──
  // «tipo Nodo { v: real  i = nulo }» se compila a una llamada a la nativa « registro» en el programa principal (nombre, lista de campos, métodos) que
  // deja el constructor en un global, y a una función «Nodo» que pone los valores por omisión y llama a ese constructor. Aquí se reconocen los tipos sin
  // métodos; sus campos se tipan después por unificación y los objetos que no salen de las funciones tipadas pasan a ser estructuras de C.
  const recTipos = new Map(), recWrapper = new Map();
  {
    const q0 = planReal[0], c0 = q0.f.chunk.consts, I0 = q0.ins;
    for (let k = 0; k < I0.length; k++) {
      if (I0[k].op !== OP.GET_GLOBAL) continue;
      const g = c0[I0[k].arg];
      if (typeof g !== 'string' || tipoGlobal(g) !== 'nat: registro') continue;
      let p = k + 1;
      if (!(I0[p] && I0[p].op === OP.CONST && typeof c0[I0[p].arg] === 'string')) continue;
      const nombre = c0[I0[p].arg]; p++;
      const campos = [];
      while (I0[p] && I0[p].op === OP.CONST && typeof c0[I0[p].arg] === 'string') { campos.push(c0[I0[p].arg]); p++; }
      if (!(I0[p] && I0[p].op === OP.LISTA && I0[p].arg === campos.length)) continue; p++;
      if (!(I0[p] && I0[p].op === OP.DIC && I0[p].arg === 0)) continue; p++;      // sin métodos
      if (!(I0[p] && I0[p].op === OP.CALL && I0[p].arg === 3)) continue; p++;
      if (!(I0[p] && I0[p].op === OP.DEF_GLOBAL)) continue;
      if (new Set(campos.map(c => c.replace(/[^A-Za-z0-9_]/g, '_'))).size !== campos.length) continue;
      recTipos.set(nombre, { campos, ctor: c0[I0[p].arg] });
    }
    planReal.forEach((q, j) => {
      if (j === 0) return;
      const t = recTipos.get(q.f.nombre);
      if (t && q.f.aridad === t.campos.length && q.ins.some(it => it.op === OP.GET_GLOBAL && q.f.chunk.consts[it.arg] === t.ctor)) recWrapper.set(j, q.f.nombre);
    });
  }

  // ── quién puede ser candidata (sin mirar los tipos todavía) ──
  const candidata = new Map();   // j → motivo si no, o null si sí
  plan.forEach((q, j) => {
    const f = q.f;
    let m = null;
    if (j === 0) m = 'es el programa principal';
    else if (f.corrutina) m = 'es un generador';
    else if (f.nUpvalues || q.capturados.size) m = 'tiene capturas';
    else if (!q.res || !q.res[0]) m = 'sin análisis';
    else if (q.ins.some(it => !OPS_OK.has(it.op))) m = 'usa ' + q.ins.find(it => !OPS_OK.has(it.op)).nombre;
    candidata.set(j, m);
  });

  const inel = new Map();
  for (let vuelta = 0; vuelta < 400; vuelta++) {
    const r = intento();
    if (r.ok) return r.resultado;
    inel.set(r.culpable, r.motivo);
    if (depurar) console.error(`[tipado] «${planReal[r.culpable].f.nombre}» no: ${r.motivo}`);
  }
  return { fns: new Map() };

  function intento() {
    // ── unificación ──
    const kind = [], payload = [], elem = [], par = [];
    const nuevo = (k, p) => { kind.push(k); payload.push(p); elem.push(-1); par.push(par.length); return par.length - 1; };
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const nuevaLista = e => { const n = nuevo('list'); elem[n] = e === undefined ? nuevo('var') : e; return n; };
    const unir = (a, b, donde) => {
      a = find(a); b = find(b);
      if (a === b) return;
      const ka = kind[a], kb = kind[b];
      if (ka === 'var') { par[a] = b; return; }
      if (kb === 'var') { par[b] = a; return; }
      if (ka === 'nulo' && kb === 'rec') { par[a] = b; return; }          // un objeto puede ser nulo
      if (ka === 'rec' && kb === 'nulo') { par[b] = a; return; }
      if (ka !== kb) throw new NoElegible(`tipos distintos (${ka} y ${kb})${donde ? ' en ' + donde : ''}`);
      if ((ka === 'fn' || ka === 'nat' || ka === 'recctor' || ka === 'texto') && payload[a] !== payload[b]) throw new NoElegible('dos funciones distintas en el mismo sitio');
      if (ka === 'rec' && payload[a] !== payload[b]) throw new NoElegible(`dos tipos de objeto distintos (${payload[a]} y ${payload[b]})`);
      par[b] = a;
      if (ka === 'list') unir(elem[a], elem[b], donde);
    };
    const exigir = (n, k, donde) => unir(n, nuevo(k), donde);
    const elemDe = (n, donde) => {
      const r = find(n);
      if (kind[r] === 'var') { const l = nuevaLista(); par[r] = l; return elem[l]; }
      if (kind[r] !== 'list') throw new NoElegible(`se indexa algo que no es lista${donde ? ' en ' + donde : ''}`);
      return elem[r];
    };

    // los campos de cada tipo: un nodo por campo, compartido por todos los objetos de ese tipo (los tipos se unifican en todo el programa)
    const recCampos = new Map();
    const campoDe = (nombre, campo) => {
      const t = recTipos.get(nombre);
      if (!t || !t.campos.includes(campo)) throw new NoElegible(`«${nombre}» no tiene el campo «${campo}»`);
      if (!recCampos.has(nombre)) recCampos.set(nombre, new Map());
      const m = recCampos.get(nombre);
      if (!m.has(campo)) m.set(campo, nuevo('var'));
      return m.get(campo);
    };
    // «x.campo» y «x.campo = v» sobre algo cuyo tipo todavía no se sabe (un parámetro, por ejemplo) se resuelven cuando la unificación lo averigua
    const pendientes = [];
    const resolverCampos = () => {
      for (let progreso = true; progreso && pendientes.length;) {
        progreso = false;
        for (let i = pendientes.length - 1; i >= 0; i--) {
          const pd = pendientes[i], r = find(pd.nodo);
          if (kind[r] === 'rec') { unir(pd.res, campoDe(payload[r], pd.campo), pd.donde); pendientes.splice(i, 1); progreso = true; }
        }
      }
      if (pendientes.length) throw Object.assign(new NoElegible('un campo de algo cuyo tipo no se sabe'), { j: pendientes[0].j });
    };
    // ── las casillas de cada función en cada instrucción ──
    const T = new Map(), R = new Map(), llama = new Map(), muta = new Map(), usos = new Map(), padreDe = new Map();
    clonDe.clear();
    let siguiente = planReal.length;
    const cand = j => (clonDe.has(j) ? true : candidata.get(j) === null && !inel.has(j));
    const registrar = j => {
      const { est } = plan[j].res[0];
      const tj = [];
      for (let k = 0; k < plan[j].ins.length; k++) tj.push(est[k] ? Array.from({ length: est[k].d }, () => nuevo('var')) : null);
      T.set(j, tj);
      R.set(j, nuevo('var'));
      llama.set(j, new Set()); muta.set(j, []); usos.set(j, { listas: false, otros: false, agrega: false, objetos: false });
    };
    const constructora = kf => {   // una hoja que crea y rellena listas
      const q = planReal[kf];
      if (q.ins.length > 80) return false;
      let lista = false, agrega = false;
      for (const it of q.ins) {
        if (it.op === OP.LISTA) lista = true;
        if (it.op === OP.GET_GLOBAL) { const tg = tipoGlobal(q.f.chunk.consts[it.arg]); if (tg.startsWith('fn:')) return false; if (tg === 'nat:agregar') agrega = true; }
      }
      return lista && agrega;
    };
    const crearInstancia = (kf, padre) => { const id = siguiente++; clonDe.set(id, kf); padreDe.set(id, padre); registrar(id); return id; };
    for (const [j] of candidata) if (cand(j)) registrar(j);
    const culpa = (j, e) => { let r = j; while (clonDe.has(r)) r = padreDe.get(r); return { ok: false, culpable: realDe(r), motivo: e.message }; };

    for (const j of T.keys()) {
      try { procesar(j); } catch (e) { if (e instanceof NoElegible) return culpa(j, e); throw e; }
    }
    try { resolverCampos(); } catch (e) { if (e instanceof NoElegible) return culpa(e.j !== undefined ? e.j : T.keys().next().value, e); throw e; }

    function procesar(j) {
      const q = plan[j], f = q.f, ins = q.ins, consts = f.chunk.consts, tj = T.get(j), { porPos } = q.res[0], uso = usos.get(j);
      if (!tj[0] || tj[0].length !== 1 + f.aridad) throw new NoElegible('la entrada no tiene la forma esperada');
      for (let k = 0; k < ins.length; k++) {
        const B = tj[k];
        if (!B) continue;
        const it = ins[k], d = B.length, donde = `línea ${it.linea}`;
        let A = B;
        const succ = [];   // [índice, estado]
        const sig = porPos.get(it.fin);
        let sigue = true;
        switch (it.op) {
          case OP.CONST: {
            const v = consts[it.arg];
            if (typeof v === 'number') A = B.concat([nuevo('num')]);
            else if (typeof v === 'boolean') { A = B.concat([nuevo('bool')]); }
            else if (typeof v === 'string') A = B.concat([nuevo('texto', v)]);      // solo vale como nombre de campo (x.campo = v)
            else throw new NoElegible('una constante que no es número ni bool');
            break;
          }
          case OP.CIERTO: case OP.FALSO: A = B.concat([nuevo('bool')]); break;
          case OP.NULO: A = B.concat([nuevo('nulo')]); break;
          case OP.POP: A = B.slice(0, d - 1); break;
          case OP.DUP: A = B.concat([B[d - 1]]); break;
          case OP.GET_LOCAL: A = B.concat([B[it.arg]]); break;
          case OP.SET_LOCAL: if (it.arg !== d - 1) { A = B.slice(); A[it.arg] = B[d - 1]; } break;
          case OP.GET_GLOBAL: {
            const g = consts[it.arg], tg = tipoGlobal(g);
            if (tg.startsWith('fn:')) {
              if (!definidaSeguro(g, realDe(j), it.pos)) throw new NoElegible('una función que puede no estar definida todavía');
              const kf = Number(tg.slice(3));
              if (recWrapper.has(kf)) { A = B.concat([nuevo('recctor', recWrapper.get(kf))]); break; }
              if (!cand(kf) && !(candidata.get(kf) === null && constructora(kf))) throw new NoElegible(`llama a «${plan[kf].f.nombre}»${candidata.get(kf) ? ' (' + candidata.get(kf) + ')' : ' (que no se puede tipar)'}`);
              const n = nuevo('fn', constructora(kf) ? crearInstancia(kf, j) : kf); A = B.concat([n]);
            } else if (NATIVAS_NUM[tg] || tg === 'nat:agregar') { A = B.concat([nuevo('nat', tg)]); }
            else throw new NoElegible(`usa «${g}» (${tg})`);
            break;
          }
          case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.IDIV: case OP.MOD:
            exigir(B[d - 2], 'num', donde); exigir(B[d - 1], 'num', donde);
            if (it.op === OP.DIV || it.op === OP.IDIV || it.op === OP.MOD) uso.otros = true;
            A = B.slice(0, d - 2).concat([nuevo('num')]); break;
          case OP.NEG: exigir(B[d - 1], 'num', donde); break;
          case OP.NOT: exigir(B[d - 1], 'bool', donde); break;
          case OP.EQ: case OP.NEQ: unir(B[d - 2], B[d - 1], donde); A = B.slice(0, d - 2).concat([nuevo('bool')]); break;
          case OP.LT: case OP.LE: case OP.GT: case OP.GE:
            exigir(B[d - 2], 'num', donde); exigir(B[d - 1], 'num', donde); A = B.slice(0, d - 2).concat([nuevo('bool')]); break;
          case OP.JMP: case OP.LOOP: sigue = false; succ.push([porPos.get(it.destino), B]); break;
          case OP.JMP_FALSE: case OP.JMP_TRUE: exigir(B[d - 1], 'bool', donde); succ.push([porPos.get(it.destino), B]); break;
          case OP.CALL: {
            const n = it.arg, base = d - n - 1, args = B.slice(base + 1, d), c = find(B[base]);
            if (kind[c] === 'recctor') {
              const tn = payload[c], t = recTipos.get(tn);
              if (n !== t.campos.length) throw new NoElegible(`«${tn}» con menos argumentos que campos (los valores por omisión no están en el nivel tipado)`);
              for (let i = 0; i < n; i++) unir(args[i], campoDe(tn, t.campos[i]), donde);
              uso.objetos = true;
              A = B.slice(0, base).concat([nuevo('rec', tn)]);
            } else if (kind[c] === 'fn') {
              const kf = payload[c], tk = T.get(kf);
              if (!tk || plan[kf].f.aridad !== n) throw new NoElegible('llama a una función con otra aridad');
              for (let i = 0; i < n; i++) unir(args[i], tk[0][1 + i], donde);
              llama.get(j).add(kf);
              A = B.slice(0, base).concat([R.get(kf)]);
            } else if (kind[c] === 'nat') {
              const nm = payload[c];
              if (nm === 'nat:agregar') {
                if (n !== 2 || !ins[k + 1] || ins[k + 1].op !== OP.POP) throw new NoElegible('«agregar» fuera de una sentencia');
                const e = elemDe(args[0], donde); unir(args[1], e, donde); uso.listas = true; uso.agrega = true; muta.get(j).push(args[0]);
                A = B.slice(0, base).concat([nuevo('nulo')]);
              } else if (nm === 'nat:longitud') {
                if (n !== 1) throw new NoElegible('«longitud» con otros argumentos');
                elemDe(args[0], donde); uso.listas = true; A = B.slice(0, base).concat([nuevo('num')]);
              } else if (nm === 'nat:reloj') {
                if (n !== 0) throw new NoElegible('«reloj» con argumentos');
                uso.otros = true; A = B.slice(0, base).concat([nuevo('num')]);
              } else {
                if (n !== 1) throw new NoElegible('una nativa con otros argumentos');
                exigir(args[0], 'num', donde); uso.otros = true; A = B.slice(0, base).concat([nuevo('num')]);
              }
            } else throw new NoElegible('llama a algo que no se sabe qué es');
            break;
          }
          case OP.RET: unir(B[d - 1], R.get(j), donde); sigue = false; break;
          case OP.LISTA: {
            const n = it.arg, e = nuevo('var');
            for (let i = 0; i < n; i++) unir(B[d - n + i], e, donde);
            uso.listas = true; A = B.slice(0, d - n).concat([nuevaLista(e)]); break;
          }
          case OP.PROP_GET: {
            const campo = consts[it.arg];
            if (typeof campo !== 'string') throw new NoElegible('PROP_GET sin nombre');
            const res = nuevo('var'), r = find(B[d - 1]);
            if (kind[r] === 'rec') unir(res, campoDe(payload[r], campo), donde); else pendientes.push({ nodo: B[d - 1], campo, res, donde, j });
            uso.objetos = true; A = B.slice(0, d - 1).concat([res]); break;
          }
          case OP.IDX_GET: { const e = elemDe(B[d - 2], donde); exigir(B[d - 1], 'num', donde); uso.listas = true; A = B.slice(0, d - 2).concat([e]); break; }
          case OP.IDX_SET: {
            if (kind[find(B[d - 2])] === 'texto') {   // x.campo = v
              const campo = payload[find(B[d - 2])], r = find(B[d - 3]);
              if (kind[r] === 'rec') unir(B[d - 1], campoDe(payload[r], campo), donde); else pendientes.push({ nodo: B[d - 3], campo, res: B[d - 1], donde, j });
              uso.objetos = true; A = B.slice(0, d - 3).concat([B[d - 1]]); break;
            }
            const e = elemDe(B[d - 3], donde); exigir(B[d - 2], 'num', donde); unir(B[d - 1], e, donde);
            uso.listas = true; muta.get(j).push(B[d - 3]); A = B.slice(0, d - 3).concat([B[d - 1]]); break;
          }
          case OP.LEN: elemDe(B[d - 1], donde); uso.listas = true; A = B.slice(0, d - 1).concat([nuevo('num')]); break;
          default: throw new NoElegible('instrucción ' + it.nombre);
        }
        if (it.op !== OP.RET && A.length !== d + efecto(it)) throw new NoElegible(`la pila de ${it.nombre} no cuadra`);
        if (sigue && it.op !== OP.RET) { if (sig === undefined) throw new NoElegible('se acaba el código'); succ.push([sig, A]); }
        for (const [m, S] of succ) {
          const Tm = tj[m];
          if (!Tm || Tm.length !== S.length) throw new NoElegible('dos caminos llegan con la pila distinta');
          for (let i = 0; i < S.length; i++) unir(S[i], Tm[i], donde);
        }
      }
    }

    // ── ya resueltos: ¿todo tiene tipo? ──
    const K = n => { const r = find(n); return kind[r]; };
    const elK = n => { const r = find(n); return kind[r] === 'list' ? K(elem[r]) : null; };
    for (const [j, tj] of T) {
      const q = plan[j];
      try {
        for (let i = 1; i <= q.f.aridad; i++) {
          const kk = K(tj[0][i]);
          if (kk !== 'num' && kk !== 'bool' && kk !== 'list' && kk !== 'rec') throw new NoElegible(`el parámetro ${i} no tiene un tipo claro (${kk})`);
        }
        const kr = K(R.get(j));
        if (kr !== 'num' && kr !== 'bool' && kr !== 'list' && kr !== 'rec' && kr !== 'nulo') throw new NoElegible(`lo que devuelve no tiene un tipo claro (${kr})`);
        for (let k = 0; k < tj.length; k++) {
          const B = tj[k];
          if (!B) continue;
          B.forEach((n, i) => {
            const kk = K(n);
            if (kk === 'var' && i === 0) return;   // la casilla 0 es el cierre
            if (kk === 'var') throw new NoElegible(`una casilla sin tipo (pos ${i} de ${B.length}) antes de ${q.ins[k].nombre} en la línea ${q.ins[k].linea}`);
            if (kk === 'list') { const e = elK(n); if (e !== 'num' && e !== 'bool' && e !== 'rec' && e !== 'var') throw new NoElegible('una lista de algo que no es número, bool ni objeto'); }
          });
          const it = q.ins[k];
          if (it.op === OP.EQ || it.op === OP.NEQ) {
            const kk = K(B[B.length - 1]);
            if (kk === 'rec') {   // dos objetos se comparan campo a campo en Ñ; aquí solo se sabe comparar con «nulo»
              const k1 = q.ins[k - 1], k2 = q.ins[k - 2];
              if (!((k1 && k1.op === OP.NULO) || (k2 && k2.op === OP.NULO && k1 && k1.op === OP.GET_LOCAL))) throw new NoElegible('compara dos objetos (solo se sabe comparar con nulo)');
            } else if (kk !== 'num' && kk !== 'bool') throw new NoElegible('compara algo que no es número ni bool');
          }
          if (it.op === OP.IDX_GET || (it.op === OP.IDX_SET && K(B[B.length - 2]) !== 'texto')) {
            const ln = B[B.length - (it.op === OP.IDX_GET ? 2 : 3)];
            const e = elK(ln);
            if (e !== 'num' && e !== 'bool' && e !== 'rec') throw new NoElegible(`lee o escribe una lista sin tipo de elemento claro (línea ${it.linea})`);
          }
          if (it.op === OP.LISTA && it.arg > 0 && K(B[B.length - it.arg]) === 'rec') throw new NoElegible('una lista literal de objetos');
          if (it.op === OP.CALL && K(B[B.length - it.arg - 1]) === 'nat' && payload[find(B[B.length - it.arg - 1])] === 'nat:agregar') {
            const e = elK(B[B.length - 2]);
            if (e !== 'num' && e !== 'bool' && e !== 'rec') throw new NoElegible('«agregar» de algo que no es número, bool ni objeto');
            // (los objetos en una lista literal [a, b] todavía no)
          }
        }
      } catch (e) { if (e instanceof NoElegible) return culpa(j, e); throw e; }
    }

    // ── la propiedad de las listas (¿quién suelta qué?) ──
    const flags = new Map();
    for (const [j, tj] of T) {
      try { flags.set(j, calcularFlags(j, tj, K)); } catch (e) { if (e instanceof NoElegible) return culpa(j, e); throw e; }
    }

    // ── qué se ofrece desde fuera ──
    const alcanza = new Map();
    for (const j of T.keys()) {
      const vistos = new Set([j]), pila = [j];
      while (pila.length) for (const kf of llama.get(pila.pop())) if (!vistos.has(kf)) { vistos.add(kf); pila.push(kf); }
      alcanza.set(j, vistos);
    }
    const base = new Map();
    for (const [j, tj] of T) {
      const q = plan[j], f = q.f;
      const params = Array.from({ length: f.aridad }, (_, i) => K(tj[0][1 + i]));
      const elems = Array.from({ length: f.aridad }, (_, i) => elK(tj[0][1 + i]));
      const mutadas = new Set();
      let listas = false, otros = false, agrega = false, objetos = false;
      for (const kf of alcanza.get(j)) { for (const n of muta.get(kf)) mutadas.add(find(n)); listas = listas || usos.get(kf).listas; otros = otros || usos.get(kf).otros; agrega = agrega || usos.get(kf).agrega; objetos = objetos || usos.get(kf).objetos; }
      const seguro = params.every((p, i) => p !== 'list' || !mutadas.has(find(tj[0][1 + i])));
      base.set(j, { params, elems, ret: K(R.get(j)), seguro, listas, otros, agrega, planJ: realDe(j), objetos, entrada: !clonDe.has(j) && seguro && !esPura(j) && (listas || otros || objetos) && !params.includes('rec') && K(R.get(j)) !== 'rec' && !params.some((p, i) => p === 'list' && elems[i] === 'rec') && !(K(R.get(j)) === 'list' && elK(R.get(j)) === 'rec') });
    }

    // ── enteros: qué números se llevan como int64_t ──
    // Un número es "entero" si se demuestra que es un entero con |x| ≤ 2^53; entonces vive en un int64_t y sus sumas, restas y productos se
    // comprueban (si se salen del rango, la función baja y se repite con la general: los dobles redondearían, los enteros no). Se resuelve para
    // todo el programa a la vez, de forma optimista y bajando hasta fijarse: el parámetro de una función es entero si lo son todos los
    // argumentos con que la llaman las tipadas (y quien la llama desde fuera solo entra por aquí si el argumento es de verdad un entero), lo que devuelve si lo son todos sus «devolver», y
    // los elementos de una lista si lo es todo lo que se escribe en ella (y no la recibe ninguna función ofrecida desde fuera).
    const paramInt = new Map(), retInt = new Map(), listaInt = new Map();
    const abiertas = new Set();
    for (const [j, b] of base) if (b.entrada) b.params.forEach((p, i) => { if (p === 'list') abiertas.add(find(T.get(j)[0][1 + i])); });
    for (const [j, b] of base) { paramInt.set(j, b.params.map(p => p === 'num')); retInt.set(j, b.ret === 'num'); }
    const listaDe = n => { const r = find(n); if (!listaInt.has(r)) listaInt.set(r, !abiertas.has(r)); return r; };
    const ENT_MAX = 2 ** 53;
    // ── intervalos [lo, hi] de los números enteros (siempre dentro de ±2^53) ──
    // Con ellos se sabe qué cuentas no se pueden salir de ±2^53 y no necesitan comprobación: el contador de un bucle queda acotado por su
    // condición («i < n» en el cuerpo ⇒ i + 1 ≤ 2^53), el resto por un divisor positivo cae en [0, b-1], y los elementos de una lista valen lo
    // que se escribe en ella. Un cruce junta (hull) y, tras unas vueltas, ensancha hasta el extremo; el salto condicional afina las variables que se
    // comparan. El resultado de una operación se recorta a ±2^53: lo que se salga ya habría fallado y repetido con la versión general.
    const EMPTY = () => [Infinity, -Infinity];
    const FULL = () => [-ENT_MAX, ENT_MAX];
    const vacio = v => v[0] > v[1];
    const hull = (a, b) => (vacio(a) ? b.slice() : vacio(b) ? a.slice() : [Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
    const inter = (a, b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
    const clamp = a => (vacio(a) ? a : [Math.max(a[0], -ENT_MAX), Math.min(a[1], ENT_MAX)]);
    const ivAdd = (a, b) => (vacio(a) || vacio(b) ? EMPTY() : clamp([a[0] + b[0], a[1] + b[1]]));
    const ivSub = (a, b) => (vacio(a) || vacio(b) ? EMPTY() : clamp([a[0] - b[1], a[1] - b[0]]));
    const ivMul = (a, b) => {
      if (vacio(a) || vacio(b)) return EMPTY();
      const p = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
      return clamp([Math.min(...p), Math.max(...p)]);
    };
    const ivMod = (a, b) => {   // la entrada tipada solo admite divisor > 0: el resto cae en [0, b-1]
      if (vacio(a) || vacio(b)) return EMPTY();
      const m = Math.max(b[1] - 1, 0);
      return a[0] >= 0 ? [0, Math.min(a[1], m)] : [0, m];
    };
    const ivIdiv = (a, b) => {
      if (vacio(a) || vacio(b)) return EMPTY();
      if (b[0] >= 1 && a[0] >= 0) return [Math.floor(a[0] / b[1]), Math.floor(a[1] / b[0])];
      const m = Math.max(Math.abs(a[0]), Math.abs(a[1]));
      return [-m, m];
    };
    const ivNeg = a => (vacio(a) ? a : [-a[1], -a[0]]);
    const LISTA_MAX_A = 2 ** 51;
    const LONG_MAX = 2 ** 40;   // ninguna lista llega a tantos elementos
    const paramIv = new Map(), retIvM = new Map(), listaIvM = new Map(), wcnt = new Map();
    for (const [j, b] of base) { paramIv.set(j, b.params.map(p => (p === 'num' ? (b.entrada ? FULL() : EMPTY()) : null))); retIvM.set(j, EMPTY()); }
    // junta un intervalo nuevo con el de un resumen; tras tres subidas ensancha hasta el extremo (para que termine)
    const sube = (clave, viejo, nuevo, tope = ENT_MAX) => {
      const h = hull(viejo, nuevo);
      if (h[0] === viejo[0] && h[1] === viejo[1]) return [viejo, false];
      const c = (wcnt.get(clave) || 0) + 1;
      wcnt.set(clave, c);
      if (c > 3 && !vacio(viejo)) { if (h[0] < viejo[0]) h[0] = -tope; if (h[1] > viejo[1]) h[1] = tope; }
      return [h, true];
    };
    const igualCmp = (a, b) => a === b || (a && b && a.op === b.op && a.sa === b.sa && a.sb === b.sb && a.oa === b.oa && a.ob === b.ob && a.ia[0] === b.ia[0] && a.ia[1] === b.ia[1] && a.ib[0] === b.ib[0] && a.ib[1] === b.ib[1]);
    const copiar = S => ({ iv: S.iv.slice(), src: S.src.slice(), off: S.off.slice(), cmp: S.cmp.slice() });
    // el estado tras saber que la comparación `cmp` dio `verdad`: se afinan las variables que se compararon (y sus copias)
    const refinar = (S, cmp, verdad) => {
      if (!cmp) return S;
      let op = cmp.op;
      if (!verdad) op = { [OP.LT]: OP.GE, [OP.LE]: OP.GT, [OP.GT]: OP.LE, [OP.GE]: OP.LT, [OP.EQ]: OP.NEQ, [OP.NEQ]: OP.EQ }[op];
      const a = cmp.ia, b = cmp.ib;
      let na = a.slice(), nb = b.slice();
      switch (op) {
        case OP.LT: na[1] = Math.min(na[1], b[1] - 1); nb[0] = Math.max(nb[0], a[0] + 1); break;
        case OP.LE: na[1] = Math.min(na[1], b[1]); nb[0] = Math.max(nb[0], a[0]); break;
        case OP.GT: na[0] = Math.max(na[0], b[0] + 1); nb[1] = Math.min(nb[1], a[1] - 1); break;
        case OP.GE: na[0] = Math.max(na[0], b[0]); nb[1] = Math.min(nb[1], a[1]); break;
        case OP.EQ: na = inter(a, b); nb = na.slice(); break;
        case OP.NEQ:
          if (b[0] === b[1]) { if (na[0] === b[0]) na[0]++; else if (na[1] === b[0]) na[1]--; }
          if (a[0] === a[1]) { if (nb[0] === a[0]) nb[0]++; else if (nb[1] === a[0]) nb[1]--; }
          break;
        default: return S;
      }
      if (vacio(na) || vacio(nb)) return S;   // un camino imposible: no se afina (sigue siendo sonoro)
      const R2 = copiar(S);
      // `nuevo` acota el valor del operando, que es la variable `slot` más `offOp`: a la variable le toca nuevo - offOp, y a cada copia suya (variable + off) esa cota + off
      const aplica = (slot, nuevo, offOp) => {
        if (slot < 0) return;
        const sl = [nuevo[0] - offOp, nuevo[1] - offOp];
        for (let p = 0; p < R2.iv.length; p++) if (R2.iv[p] !== null && (p === slot || R2.src[p] === slot)) {
          const o = p === slot ? 0 : R2.off[p];
          const x = inter(R2.iv[p], clamp([sl[0] + o, sl[1] + o]));
          if (!vacio(x)) R2.iv[p] = x;
        }
      };
      aplica(cmp.sa, na, cmp.oa); aplica(cmp.sb, nb, cmp.ob);
      return R2;
    };
    function flujoEnteros(j) {
      const q = plan[j], f = q.f, ins = q.ins, consts = f.chunk.consts, tj = T.get(j), { porPos } = q.res[0];
      const Es = new Array(ins.length).fill(null), Ea = new Array(ins.length).fill(null), cnt = new Array(ins.length).fill(null);
      const calls = [], stores = [];
      let retAnd = true, retIv = EMPTY();
      const retNum = K(R.get(j)) === 'num';
      const pend = [];
      const llegar = (m, S) => {
        if (m === undefined) return;
        if (Es[m] === null) { Es[m] = copiar(S); pend.push(m); return; }
        const E = Es[m];
        let cambio = false;
        for (let i = 0; i < S.iv.length; i++) {
          const a = E.iv[i], b = S.iv[i];
          if (a !== null) {
            if (b === null) { E.iv[i] = null; cambio = true; }
            else {
              const h = hull(a, b);
              if (h[0] !== a[0] || h[1] !== a[1]) {
                const cm = cnt[m] || (cnt[m] = []);   // cuántas veces ha crecido ESTA variable en este punto (no el punto entero)
                cm[i] = (cm[i] || 0) + 1;
                if (cm[i] > 3 && !vacio(a)) { if (h[0] < a[0]) h[0] = -ENT_MAX; if (h[1] > a[1]) h[1] = ENT_MAX; }
                E.iv[i] = h; cambio = true;
              }
            }
          }
          if ((E.src[i] !== S.src[i] || E.off[i] !== S.off[i]) && E.src[i] !== -1) { E.src[i] = -1; E.off[i] = 0; cambio = true; }
          if (E.cmp[i] !== null && !igualCmp(E.cmp[i], S.cmp[i])) { E.cmp[i] = null; cambio = true; }
        }
        if (cambio) pend.push(m);
      };
      const pj = paramInt.get(j), pv = paramIv.get(j);
      const ini = { iv: [null].concat(pj.map((ok, i) => (ok ? pv[i].slice() : null))), src: new Array(1 + pj.length).fill(-1), off: new Array(1 + pj.length).fill(0), cmp: new Array(1 + pj.length).fill(null) };
      llegar(0, ini);
      // Lo que llega a cada punto por cada camino (para el estrechamiento de después) y la fase en que se está: 0 = subir hasta el punto fijo (con ensanchamiento), 1 = bajar
      const entradas = new Array(ins.length).fill(null);
      let fase = 0;
      const salto = (m, S, tag, kk) => {
        if (m === undefined) return;
        (entradas[m] || (entradas[m] = new Map())).set(`${kk}:${tag}`, copiar(S));
        if (fase === 0) llegar(m, S);
      };
      const unirEstados = lista => {
        const L = [...lista];
        const R2 = copiar(L[0]);
        for (let x = 1; x < L.length; x++) {
          const T2 = L[x];
          for (let i = 0; i < R2.iv.length; i++) {
            R2.iv[i] = R2.iv[i] === null || T2.iv[i] === null ? null : hull(R2.iv[i], T2.iv[i]);
            if (R2.src[i] !== T2.src[i] || R2.off[i] !== T2.off[i]) { R2.src[i] = -1; R2.off[i] = 0; }
            if (R2.cmp[i] !== null && !igualCmp(R2.cmp[i], T2.cmp[i])) R2.cmp[i] = null;
          }
        }
        return R2;
      };
      const paso = k => {
        const it = ins[k], B = tj[k], d = B.length, S = Es[k];
        const A = copiar(S);
        let sigue = true, Afall = A;
        const sig = porPos.get(it.fin);
        const iv = S.iv, src = S.src;
        const pushN = (v, s = -1, o = 0) => { A.iv.push(v); A.src.push(s); A.off.push(o); A.cmp.push(null); };
        const popN = n => { A.iv.length -= n; A.src.length -= n; A.off.length -= n; A.cmp.length -= n; };
        const quita = slot => {   // se reasigna `slot`: lo que copiaba su valor viejo deja de ser copia
          for (let p = 0; p < A.src.length; p++) { if (A.src[p] === slot) { A.src[p] = -1; A.off[p] = 0; } const c = A.cmp[p]; if (c && (c.sa === slot || c.sb === slot)) A.cmp[p] = null; }
        };
        switch (it.op) {
          case OP.CONST: { const v = consts[it.arg]; pushN(typeof v === 'number' && Number.isInteger(v) && !Object.is(v, -0) && Math.abs(v) <= ENT_MAX ? [v, v] : null); break; }
          case OP.CIERTO: case OP.FALSO: case OP.NULO: case OP.GET_GLOBAL: pushN(null); break;
          case OP.POP: popN(1); break;
          case OP.DUP: pushN(iv[d - 1], src[d - 1], S.off[d - 1]); break;
          case OP.GET_LOCAL: pushN(iv[it.arg], iv[it.arg] !== null ? it.arg : -1, 0); break;
          case OP.SET_LOCAL:
            if (it.arg !== d - 1) {
              quita(it.arg);
              A.iv[it.arg] = iv[d - 1]; A.src[it.arg] = -1; A.off[it.arg] = 0; A.cmp[it.arg] = null;
              A.src[d - 1] = iv[d - 1] !== null ? it.arg : -1; A.off[d - 1] = 0;
            }
            break;
          case OP.ADD: case OP.SUB: case OP.MUL: case OP.MOD: case OP.IDIV: {
            const a = iv[d - 2], b = iv[d - 1];
            const res = a !== null && b !== null ? (it.op === OP.ADD ? ivAdd(a, b) : it.op === OP.SUB ? ivSub(a, b) : it.op === OP.MUL ? ivMul(a, b) : it.op === OP.MOD ? ivMod(a, b) : ivIdiv(a, b)) : null;
            // variable ± constante sigue siendo "esa variable más un desplazamiento" (para saber luego qué casilla de una lista se toca)
            let s2 = -1, o2 = 0;
            if ((it.op === OP.ADD || it.op === OP.SUB) && res !== null) {
              const ca = a !== null && !vacio(a) && a[0] === a[1] ? a[0] : null, cb = b !== null && !vacio(b) && b[0] === b[1] ? b[0] : null;
              if (cb !== null && src[d - 2] >= 0) { s2 = src[d - 2]; o2 = S.off[d - 2] + (it.op === OP.ADD ? cb : -cb); }
              else if (it.op === OP.ADD && ca !== null && src[d - 1] >= 0) { s2 = src[d - 1]; o2 = S.off[d - 1] + ca; }
            }
            popN(2); pushN(res, s2, o2); break;
          }
          case OP.DIV: popN(2); pushN(null); break;
          case OP.EQ: case OP.NEQ: case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
            const a = iv[d - 2], b = iv[d - 1];
            const cmp = a !== null && b !== null && !vacio(a) && !vacio(b) ? { op: it.op, sa: src[d - 2], oa: S.off[d - 2], sb: src[d - 1], ob: S.off[d - 1], ia: a.slice(), ib: b.slice() } : null;
            popN(2); pushN(null); A.cmp[A.cmp.length - 1] = cmp; break;
          }
          case OP.NEG: A.iv[d - 1] = iv[d - 1] !== null ? ivNeg(iv[d - 1]) : null; A.src[d - 1] = -1; A.off[d - 1] = 0; break;
          case OP.NOT: A.iv[d - 1] = null; A.src[d - 1] = -1; A.off[d - 1] = 0; A.cmp[d - 1] = null; break;
          case OP.JMP: case OP.LOOP: sigue = false; salto(porPos.get(it.destino), A, 'j', k); break;
          case OP.JMP_FALSE: case OP.JMP_TRUE: {
            const c = S.cmp[d - 1];
            const st = refinar(A, c, true), sf = refinar(A, c, false);
            if (it.op === OP.JMP_FALSE) { salto(porPos.get(it.destino), sf, 'j', k); Afall = st; } else { salto(porPos.get(it.destino), st, 'j', k); Afall = sf; }
            break;
          }
          case OP.CALL: {
            const n = it.arg, bs = d - n - 1, c = find(B[bs]);
            let res = null;
            if (kind[c] === 'fn') {
              const kf = payload[c];
              calls.push([kf, iv.slice(bs + 1, d).map(x => (x === null ? null : x.slice()))]);
              res = K(R.get(kf)) === 'num' && retInt.get(kf) ? retIvM.get(kf).slice() : null;
            } else if (payload[c] === 'nat:agregar') {
              if (elK(B[bs + 1]) === 'num') stores.push([listaDe(B[bs + 1]), iv[bs + 2] === null ? null : iv[bs + 2].slice()]);
            } else if (payload[c] === 'nat:longitud') res = [0, LONG_MAX];
            popN(n + 1); pushN(res); break;
          }
          case OP.RET:
            sigue = false;
            if (retNum) { retAnd = retAnd && iv[d - 1] !== null; if (iv[d - 1] !== null) retIv = hull(retIv, iv[d - 1]); }
            break;
          case OP.LISTA: {
            const n = it.arg;
            if (n && K(B[d - n]) === 'num') {
              let h = EMPTY(), todo = true;
              for (let i = d - n; i < d; i++) { if (iv[i] === null) todo = false; else h = hull(h, iv[i]); }
              stores.push([listaDe(tj[sig][d - n]), todo ? h : null]);
            }
            popN(n); pushN(null); break;
          }
          case OP.PROP_GET: popN(1); pushN(null); break;
          case OP.IDX_GET: {
            const res = elK(B[d - 2]) === 'num' && listaInt.get(listaDe(B[d - 2])) ? (listaIvM.get(listaDe(B[d - 2])) || EMPTY()).slice() : null;
            popN(2); pushN(res); break;
          }
          case OP.IDX_SET: {
            if (elK(B[d - 3]) === 'num') stores.push([listaDe(B[d - 3]), iv[d - 1] === null ? null : iv[d - 1].slice()]);
            const v = iv[d - 1];
            popN(3); pushN(v === null ? null : v.slice()); break;
          }
          case OP.LEN: A.iv[d - 1] = [0, LONG_MAX]; A.src[d - 1] = -1; A.off[d - 1] = 0; A.cmp[d - 1] = null; break;
          default: throw new NoElegible('instrucción ' + it.nombre);
        }
        Ea[k] = A;
        if (sigue) salto(sig, Afall, 'f', k);
      };
      while (pend.length) paso(pend.pop());
      // Estrechamiento: el ensanchamiento dejó intervalos más anchos de lo necesario (una variable del bucle subió a 2^53 mientras el principio todavía crecía y ya no
      // baja). Se recalcula cada punto como la unión de lo que de verdad le llega (con las comparaciones ya afinadas), sin ensanchar. Lo que se acumula para los
      // resúmenes (llamadas, escrituras, devoluciones) se reinicia antes de la última pasada para que solo cuente lo estrechado.
      fase = 1;
      // (motor-exp A5) las pasadas que haga falta hasta que nada cambie (con bucles anidados, 3 no bastaban para llevar la cota de la variable de fuera hasta dentro);
      // cada pasada es sonora por sí sola, así que parar en cualquier momento también lo es. Después, una última pasada que sí cuenta para los resúmenes.
      // Un punto = la unión de lo que le llega. Cabecera de bucle: una variable que el bucle NO asigna vale lo que le llega por la entrada (por la arista de vuelta
      // volvería ella misma, y una cota ensanchada una vez no bajaría nunca).
      const estrechar = k => {
        const fw = [], bk = [];
        let asigB = null;
        if (k === 0) fw.push(ini);
        if (entradas[k]) for (const [clave, v] of entradas[k]) {
          const kk = Number(clave.split(':')[0]);
          if (kk >= k && ins[kk].op === OP.LOOP && porPos.get(ins[kk].destino) === k) {
            bk.push(v); asigB = asigB || new Set();
            for (let x = k; x <= kk; x++) if (ins[x].op === OP.SET_LOCAL) asigB.add(ins[x].arg);
          } else fw.push(v);
        }
        const todo = fw.concat(bk);
        if (!todo.length) return;
        const R2 = unirEstados(todo);
        if (bk.length && fw.length) {
          const RF = unirEstados(fw);
          for (let i = 0; i < R2.iv.length && i < RF.iv.length; i++) if (!asigB.has(i) && RF.iv[i] !== null && R2.iv[i] !== null) R2.iv[i] = RF.iv[i].slice();
        }
        Es[k] = R2;
      };
      const huella = () => JSON.stringify(Es.map(S => (S ? S.iv : null)));
      let antes = huella();
      for (let pasada = 0; pasada < 24; pasada++) {
        for (let k = 0; k < ins.length; k++) {
          if (!Es[k]) continue;
          estrechar(k);
          paso(k);
        }
        const ahora = huella();
        if (ahora === antes) break;
        antes = ahora;
      }
      calls.length = 0; stores.length = 0; retAnd = true; retIv = EMPTY();
      for (let k = 0; k < ins.length; k++) {
        if (!Es[k]) continue;
        estrechar(k);
        paso(k);
      }
      const En = Es.map(S => (S ? S.iv.map(x => x !== null) : null));
      const EaB = Ea.map(S => (S ? S.iv.map(x => x !== null) : null));
      const Iv = Es.map(S => (S ? S.iv : null));
      const Cn = Es.map(S => (S ? S.iv.map(x => (x === null || vacio(x) ? null : x[0] === x[1] ? x[0] : x[0] >= 0 ? '+' : null)) : null));
      if (process.env.N_AOT_DEBUG_IV && f.nombre === process.env.N_AOT_DEBUG_IV) {   // depuración: los intervalos de cada casilla antes de cada instrucción
        ins.forEach((it, k) => { if (Es[k]) console.error(`[iv] ${String(k).padStart(3)} L${it.linea} ${it.nombre.padEnd(10)} ${Es[k].iv.map((v, i) => `${i}:${v === null ? '·' : v[0] + '..' + v[1]}`).join(' ')}`); });
      }
      return { En, Ea: EaB, Cn, Iv, Es, calls, stores, retAnd, retIv };
    }
    let flujos = null;
    for (let vuelta = 0; vuelta < 300; vuelta++) {
      let cambio = false;
      flujos = new Map();
      for (const j of base.keys()) {
        const r = flujoEnteros(j);
        flujos.set(j, r);
        for (const [kf, ais] of r.calls) {
          const p = paramInt.get(kf), pv = paramIv.get(kf);
          ais.forEach((iv, i) => {
            if (!p[i]) return;
            if (iv === null) { p[i] = false; cambio = true; return; }
            const [h, c] = sube(`p${kf}_${i}`, pv[i], iv);
            if (c) { pv[i] = h; cambio = true; }
          });
        }
        if (retInt.get(j)) {
          if (!r.retAnd) { retInt.set(j, false); cambio = true; }
          else { const [h, c] = sube(`r${j}`, retIvM.get(j), r.retIv); if (c) { retIvM.set(j, h); cambio = true; } }
        }
        for (const [raiz, iv] of r.stores) {
          if (listaInt.get(raiz) === false) continue;
          if (iv === null) { listaInt.set(raiz, false); cambio = true; continue; }
          const [h, c] = sube(`l${raiz}`, listaIvM.get(raiz) || EMPTY(), inter(iv, [-LISTA_MAX_A, LISTA_MAX_A]), LISTA_MAX_A);
          if (c) { listaIvM.set(raiz, h); cambio = true; }
        }
      }
      if (!cambio) break;
    }

    // ── bucles: comprobar una vez, antes de entrar, que todos los accesos `lista[variable + c]` caben ──
    // En un bucle donde las listas no cambian de largo (nada llama a «agregar») y la variable del índice no cambia o solo avanza/retrocede en el último paso,
    // el índice se mueve en un rango que se conoce al entrar: se comprueba entonces (sin entrar en el bucle si algo no cabe: la función baja y se repite con la
    // general, que da el error de siempre) y dentro del bucle esos accesos van sin comprobar. Que baje de más no cambia el resultado, solo cuánto tarda.
    function analizarBucles(j, fl) {
      const q = plan[j], ins = q.ins, tj = T.get(j), { porPos } = q.res[0], Es = fl.Es, Fl = flags.get(j), consts = q.f.chunk.consts;
      const pre = new Map(), libre = new Set(), repet = new Map();
      for (let k = 0; k < ins.length; k++) {
        if (ins[k].op !== OP.LOOP || !tj[k]) continue;
        const m = porPos.get(ins[k].destino);
        if (m === undefined || m >= k || !Es[m]) continue;
        // ¿entra algo por el principio que no sea la caída normal?
        let entradaRara = false;
        for (let kk = 0; kk < m; kk++) if (ins[kk].destino === ins[m].pos && (ins[kk].op === OP.JMP || ins[kk].op === OP.JMP_FALSE || ins[kk].op === OP.JMP_TRUE)) entradaRara = true;
        if (entradaRara) continue;
        // «mientras s < N { agregar(a, K)  s = s + 1 }» (así se escribe «nueva(n)»): n copias de una constante, de una sola vez (memset en vez de n «agregar»)
        if (k === m + 15) {
          const [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14] = ins.slice(m, m + 15);
          const seq = i0.op === OP.GET_LOCAL && (i1.op === OP.GET_LOCAL || i1.op === OP.CONST) && (i2.op === OP.LT || i2.op === OP.LE) && i3.op === OP.JMP_FALSE && i4.op === OP.POP
            && i5.op === OP.GET_GLOBAL && i6.op === OP.GET_LOCAL && (i7.op === OP.CONST || i7.op === OP.CIERTO || i7.op === OP.FALSO) && i8.op === OP.CALL && i8.arg === 2 && i9.op === OP.POP
            && i10.op === OP.GET_LOCAL && i10.arg === i0.arg && i11.op === OP.CONST && consts[i11.arg] === 1 && i12.op === OP.ADD && i13.op === OP.SET_LOCAL && i13.arg === i0.arg && i14.op === OP.POP;
          if (seq && porPos.get(i3.destino) > k && tj[m + 8] && Es[m] && Es[m].iv[i0.arg] != null && (i1.op === OP.CONST ? Number.isInteger(consts[i1.arg]) : Es[m].iv[i1.arg] != null && i1.arg !== i0.arg) && i6.arg !== i0.arg && i6.arg !== i1.arg) {
            const t8 = tj[m + 8], base8 = t8.length - 3, c8 = find(t8[base8]), ln = t8[base8 + 1];
            if (kind[c8] === 'nat' && payload[c8] === 'nat:agregar' && K(ln) === 'list' && tj[m][i6.arg] && K(tj[m][i6.arg]) === 'list') {
              const ek = elK(ln);
              let val = null, fn = null;
              if (ek === 'bool' && (i7.op === OP.CIERTO || i7.op === OP.FALSO)) { fn = 'nt_rep_b'; val = i7.op === OP.CIERTO ? '1' : '0'; }
              else if (ek === 'num' && i7.op === OP.CONST && typeof consts[i7.arg] === 'number' && Number.isFinite(consts[i7.arg])) {
                const v = consts[i7.arg];
                if (listaInt.get(listaDe(ln)) === true) { if (Number.isInteger(v) && Math.abs(v) <= LISTA_MAX && !Object.is(v, -0)) { fn = 'nt_rep_i'; val = `${v}LL`; } }
                else { fn = 'nt_rep_d'; val = Object.is(v, -0) ? '-0.0' : `${v}`.includes('e') || `${v}`.includes('.') ? `${v}` : `${v}.0`; }
              }
              if (fn) repet.set(m + 3, { s: i0.arg, N: i1.op === OP.GET_LOCAL ? `i${i1.arg}` : `${consts[i1.arg]}LL`, le: i2.op === OP.LE, a: i6.arg, fn, val });
            }
          }
        }
        const asig = new Map();   // variable → instrucciones que la asignan
        let cambiaLargo = false;
        for (let kk = m; kk <= k; kk++) {
          const it = ins[kk];
          if (it.op === OP.SET_LOCAL) { if (!asig.has(it.arg)) asig.set(it.arg, []); asig.get(it.arg).push(kk); }
          if (it.op === OP.CALL && tj[kk]) {
            const c = find(tj[kk][tj[kk].length - it.arg - 1]);
            if (kind[c] === 'nat' && payload[c] === 'nat:agregar') cambiaLargo = true;
            if (kind[c] === 'fn' && base.get(payload[c]).agrega) cambiaLargo = true;
          }
        }
        if (cambiaLargo) continue;
        // variables que avanzan o retroceden en el último paso del bucle: GET_LOCAL s; CONST c; ADD|SUB; SET_LOCAL s; POP; LOOP
        const indu = new Map();   // s → { dir: 1 | -1 }
        for (const [sv, lista] of asig) {
          if (lista.length !== 1) continue;
          const kk = lista[0];
          // tras el incremento solo puede haber POP (la limpieza de las variables que el cuerpo declara) hasta el salto
          let soloPops = kk + 1 < k && kk >= 3;
          for (let x = kk + 1; x < k && soloPops; x++) if (ins[x].op !== OP.POP) soloPops = false;
          if (!soloPops) continue;
          const g = ins[kk - 3], c = ins[kk - 2], o = ins[kk - 1];
          if (g.op !== OP.GET_LOCAL || g.arg !== sv || c.op !== OP.CONST || (o.op !== OP.ADD && o.op !== OP.SUB)) continue;
          const v = consts[c.arg];
          if (!(typeof v === 'number' && Number.isInteger(v) && v > 0)) continue;
          indu.set(sv, { dir: o.op === OP.ADD ? 1 : -1 });
        }
        // la condición del principio: s < N / s <= N con N una variable que no cambia o una constante
        const cond = new Map();
        {
          const a0 = ins[m], a1 = ins[m + 1], a2 = ins[m + 2], a3 = ins[m + 3];
          if (a0 && a1 && a2 && a3 && a0.op === OP.GET_LOCAL && indu.has(a0.arg) && indu.get(a0.arg).dir === 1 && (a2.op === OP.LT || a2.op === OP.LE) && a3.op === OP.JMP_FALSE && !(porPos.get(a3.destino) >= m && porPos.get(a3.destino) <= k)) {
            let N = null;
            if (a1.op === OP.GET_LOCAL && !asig.has(a1.arg) && Es[m].iv[a1.arg] != null) N = `i${a1.arg}`;
            else if (a1.op === OP.CONST && Number.isInteger(consts[a1.arg])) N = `${consts[a1.arg]}LL`;
            if (N !== null) cond.set(a0.arg, { N, le: a2.op === OP.LE });
          }
        }
        const grupos = new Map();
        for (let kk = m; kk <= k; kk++) {
          const it = ins[kk];
          if ((it.op !== OP.IDX_GET && it.op !== OP.IDX_SET) || !tj[kk] || !Es[kk] || !Fl[kk]) continue;
          const d = tj[kk].length, lp = it.op === OP.IDX_GET ? d - 2 : d - 3, ip = it.op === OP.IDX_GET ? d - 1 : d - 2;
          const a = Fl[kk][lp], sv = Es[kk].src[ip], off = Es[kk].off[ip], ivx = Es[kk].iv[ip];
          if (!(a > 0) || asig.has(a) || sv < 0 || ivx === null || vacio(ivx)) continue;
          if (K(tj[kk][lp]) !== 'list' || Es[m].iv[sv] == null) continue;   // (sv debe existir ya en la cabecera: una «var» declarada dentro del cuerpo no)
          let tipo;
          if (!asig.has(sv)) tipo = 'inv';
          else if (indu.has(sv) && indu.get(sv).dir === 1 && cond.has(sv)) tipo = 'inc';
          else if (indu.has(sv) && indu.get(sv).dir === -1 && ivx[0] >= 0) tipo = 'dec';
          else continue;
          const clave = `${a}|${sv}|${tipo}`;
          const g = grupos.get(clave) || { a, sv, tipo, cmin: Infinity, cmax: -Infinity, bajo: false };
          g.cmin = Math.min(g.cmin, off); g.cmax = Math.max(g.cmax, off);
          if (ivx[0] < 0) g.bajo = true;
          grupos.set(clave, g);
          libre.add(kk);
        }
        const cs = [];
        for (const g of grupos.values()) {
          const sv = `i${g.sv}`, ln = `ln${g.a}`, bajo = g.bajo ? ` || ${sv} + ${g.cmin}LL < 0` : '';
          if (g.tipo === 'inv') cs.push(`if (__builtin_expect(${sv} + ${g.cmax}LL >= ${ln}${bajo}, 0)) NT_FAIL();`);
          else if (g.tipo === 'dec') cs.push(`if (__builtin_expect(${sv} + ${g.cmax}LL >= ${ln}, 0)) NT_FAIL();`);
          else {
            const c = cond.get(g.sv);
            cs.push(`if (${sv} ${c.le ? '<=' : '<'} ${c.N}) { if (__builtin_expect(${c.N} ${c.le ? '' : '- 1LL '}+ ${g.cmax}LL >= ${ln}${bajo}, 0)) NT_FAIL(); }`);
          }
        }
        // ── (motor-exp A5) índices «base invariante + variable del bucle» (a[i*n + j], el idioma de las matrices planas) ──
        // El índice se lee como un árbol de + − × sobre variables y constantes; si lo único que cambia en el bucle es la variable que avanza (coeficiente 1) y el
        // acceso se hace en TODAS las vueltas (sin saltos entre la condición del bucle y el acceso), se comprueba una sola vez antes del bucle que base + [primera, última]
        // cabe en la lista, con la base calculada con aritmética vigilada (un desbordamiento baja a la versión general). Dentro del bucle el acceso va sin comprobar,
        // y gcc puede vectorizarlo.
        {
          const alvos = new Set();
          for (const i2 of ins) if (i2.destino !== undefined) { const t2 = porPos.get(i2.destino); if (t2 !== undefined) alvos.add(t2); }
          let condIdx = -1;
          for (let x = m; x <= k && condIdx < 0; x++) if ((ins[x].op === OP.JMP_FALSE || ins[x].op === OP.JMP_TRUE) && porPos.get(ins[x].destino) > k) condIdx = x;
          const hojas = (n, f) => { if (n.t === 'v' || n.t === 'c') f(n); else { hojas(n.l, f); hojas(n.r, f); } };
          const arbolHasta = (pp, prof) => {
            if (pp < 0 || prof > 6) return null;
            const i3 = ins[pp];
            if (!i3) return null;
            if (i3.op === OP.GET_LOCAL) return { n: { t: 'v', s: i3.arg }, ini: pp };
            if (i3.op === OP.CONST) { const v = consts[i3.arg]; return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 1099511627776 && !Object.is(v, -0) ? { n: { t: 'c', v }, ini: pp } : null; }
            if (i3.op === OP.ADD || i3.op === OP.SUB || i3.op === OP.MUL) {
              const r2 = arbolHasta(pp - 1, prof + 1); if (!r2) return null;
              const l2 = arbolHasta(r2.ini - 1, prof + 1); if (!l2) return null;
              return { n: { t: i3.op, l: l2.n, r: r2.n }, ini: l2.ini };
            }
            return null;
          };
          const sumaE = (a2, b2) => (a2 === null ? b2 : b2 === null ? a2 : { t: OP.ADD, l: a2, r: b2 });
          const restaE = (a2, b2) => (b2 === null ? a2 : { t: OP.SUB, l: a2 === null ? { t: 'c', v: 0 } : a2, r: b2 });
          const mulE = (a2, b2) => (a2 === null || b2 === null ? null : { t: OP.MUL, l: a2, r: b2 });
          const afin = (n, sj, inv) => {   // → { K: el coeficiente de la variable que avanza (sj; null = 0), E: lo invariante (null = 0) }, con índice = K·sj + E
            if (n.t === 'v') return n.s === sj ? { K: { t: 'c', v: 1 }, E: null } : inv(n.s) ? { K: null, E: n } : null;
            if (n.t === 'c') return { K: null, E: n };
            const l2 = afin(n.l, sj, inv), r2 = afin(n.r, sj, inv);
            if (!l2 || !r2) return null;
            if (n.t === OP.ADD) return { K: sumaE(l2.K, r2.K), E: sumaE(l2.E, r2.E) };
            if (n.t === OP.SUB) return { K: restaE(l2.K, r2.K), E: restaE(l2.E, r2.E) };
            if (l2.K !== null && r2.K !== null) return null;              // MUL: la variable que avanza no se multiplica por sí misma
            if (l2.K !== null) return { K: mulE(l2.K, r2.E), E: mulE(l2.E, r2.E) };
            if (r2.K !== null) return { K: mulE(r2.K, l2.E), E: mulE(l2.E, r2.E) };
            return { K: null, E: mulE(l2.E, r2.E) };
          };
          const ivDe = n => {   // el intervalo de un árbol invariante, con los de la cabecera del bucle
            if (n.t === 'c') return [n.v, n.v];
            if (n.t === 'v') return Es[m].iv[n.s];
            const a2 = ivDe(n.l), b2 = ivDe(n.r);
            if (a2 === null || b2 === null || vacio(a2) || vacio(b2)) return null;
            return n.t === OP.ADD ? ivAdd(a2, b2) : n.t === OP.SUB ? ivSub(a2, b2) : ivMul(a2, b2);
          };
          const clave2 = n => (n === null ? '0' : n.t === 'v' ? `v${n.s}` : n.t === 'c' ? `c${n.v}` : `(${n.t}${clave2(n.l)},${clave2(n.r)})`);
          const gA = new Map();
          if (condIdx >= 0) for (let kk = condIdx + 1; kk < k; kk++) {
            const it = ins[kk];
            if ((it.op !== OP.IDX_GET && it.op !== OP.IDX_SET) || !tj[kk] || !Es[kk] || !Fl[kk] || libre.has(kk)) continue;
            let recto = true;                                               // sin saltos ni destinos de salto entre la condición y el acceso: se hace en cada vuelta
            for (let x = condIdx + 1; x <= kk && recto; x++) if (alvos.has(x) || (x < kk && (ins[x].op === OP.JMP || ins[x].op === OP.JMP_FALSE || ins[x].op === OP.JMP_TRUE || ins[x].op === OP.LOOP))) recto = false;
            if (!recto) continue;
            const d = tj[kk].length, lp = it.op === OP.IDX_GET ? d - 2 : d - 3, a = Fl[kk][lp];
            if (!(a > 0) || asig.has(a) || K(tj[kk][lp]) !== 'list' || a >= tj[m].length) continue;
            let fin = kk - 1;
            if (it.op === OP.IDX_SET) {                                     // el índice acaba donde empieza la expresión del valor (la primera con la pila a la altura d-1)
              let pp = kk - 1;
              while (pp > condIdx && !(tj[pp] && tj[pp].length === d - 1)) pp--;
              if (pp <= condIdx) continue;
              fin = pp - 1;
            }
            const ar = arbolHasta(fin, 0);
            if (!ar) continue;
            const hIdx = it.op === OP.IDX_GET ? d - 1 : d - 2;
            if (!tj[ar.ini] || tj[ar.ini].length !== hIdx || ar.ini - 1 < 0 || ins[ar.ini - 1].op !== OP.GET_LOCAL || ins[ar.ini - 1].arg !== a) continue;
            const inv = sl => sl > 0 && sl < tj[m].length && !asig.has(sl) && Es[m].iv[sl] != null;
            const variables = new Set(); hojas(ar.n, h => { if (h.t === 'v') variables.add(h.s); });
            const moviles = [...variables].filter(sl => asig.has(sl));
            if (moviles.length !== 1) continue;                             // exactamente una variable que cambia: la que avanza
            const sj = moviles[0];
            if (!(indu.has(sj) && indu.get(sj).dir === 1 && cond.has(sj)) || sj >= tj[m].length || Es[m].iv[sj] == null) continue;
            if (![...variables].every(sl => sl === sj || inv(sl))) continue;
            const af = afin(ar.n, sj, inv);
            if (!af || af.K === null) continue;
            const kiv = ivDe(af.K);
            if (kiv === null || vacio(kiv) || kiv[0] < 0) continue;      // monótono creciente: bastan los dos extremos
            const ck = `${a}|${sj}|${clave2(af.K)}|${clave2(af.E)}`;
            if (!gA.has(ck)) gA.set(ck, { a, sj, E: af.E, K: af.K });
            libre.add(kk);
          }
          for (const g of gA.values()) {
            const c = cond.get(g.sj), lineas = [];
            let nt = 0;
            const cg = n => {
              if (n.t === 'v') return `i${n.s}`;
              if (n.t === 'c') return `${n.v}LL`;
              const x = cg(n.l), y = cg(n.r), t = `e${nt++}_`;
              lineas.push(`int64_t ${t}; if (__builtin_${n.t === OP.ADD ? 'add' : n.t === OP.SUB ? 'sub' : 'mul'}_overflow(${x}, ${y}, &${t})) NT_FAIL();`);
              return t;
            };
            const base = g.E === null ? '0LL' : cg(g.E), coef = cg(g.K);
            cs.push(`if (i${g.sj} ${c.le ? '<=' : '<'} ${c.N}) { ${lineas.join(' ')} if (__builtin_expect(!nt_rango_ek(${base}, ${coef}, i${g.sj}, ${c.N}${c.le ? '' : ' - 1LL'}, ln${g.a}), 0)) NT_FAIL(); }`);
          }
        }
        if (cs.length) pre.set(m, (pre.get(m) || []).concat(cs));
      }
      return { pre, libre, repet };
    }

    // ── Análisis de escape ──
    // ¿Qué objetos creados en la función («Nodo(...)») no salen nunca de ella? Esos viven en la pila de C (no hay reserva, ni conteo que valga, ni liberación) y gcc
    // puede incluso llevar sus campos a registros, como hace con el C escrito a mano. Valores abstractos: conjuntos de «sitios» (el índice de la instrucción
    // que crea el objeto). -1 = algo de fuera (un objeto del montón); -1-i = el parámetro i (1..) de esta función.
    //  · sale: se devuelve, se guarda en una lista o en un objeto que sale, se pasa a una función que lo guarda (resumen «capt» por parámetro, punto fijo entre funciones);
    //  · no se puede: guarda dentro un objeto de fuera (habría que soltarlo al morir el contenedor);
    //  · solape: al ejecutar otra vez la creación sigue vivo el objeto de la vuelta anterior (una cadena que crece): la pila solo tiene sitio para uno.
    function analizarEscape(j, capt, modif) {
      const q = plan[j], ins = q.ins, tj = T.get(j), { porPos } = q.res[0], f = q.f;
      const VACIO = new Set(), EXT = -1, EXTSET = new Set([EXT]);
      const un = (a, b) => { if (b.size === 0 || a === b) return a; if (a.size === 0) return b; let r = null; for (const x of b) if (!a.has(x)) { r = r || new Set(a); r.add(x); } return r || a; };
      const esc = new Set(), nopila = new Set(), cont = new Map(), sitios = new Set(), entrada = new Map(), modifica = new Set();
      let cambio = false, E;
      const escapa = V => { for (const x of V) if (!esc.has(x)) { esc.add(x); cambio = true; } };
      const guardar = (t, V) => {
        if (t < 0) { escapa(V); if (t < EXT) modifica.add(-2 - t); return; }  // el contenedor es de fuera: lo que se guarda sale (y si es un parámetro, la función lo modifica)
        for (const x of V) if (x < 0 && !nopila.has(t)) { nopila.add(t); cambio = true; }
        const c = cont.get(t) || VACIO, u = un(c, V);
        if (u !== c) { cont.set(t, u); cambio = true; }
      };
      const esR = nd => K(nd) === 'rec';
      const ini = [VACIO];
      for (let i = 1; i <= f.aridad; i++) ini.push(esR(tj[0][i]) ? new Set([-1 - i]) : VACIO);
      let vueltas = 0;
      do {
        if (++vueltas > 60) return null;
        cambio = false;
        E = new Array(ins.length).fill(null);
        const pend = [];
        const llegar = (m, S) => {
          if (m === undefined) return;
          if (E[m] === null) { E[m] = S.slice(); pend.push(m); return; }
          const M = E[m].slice(); let ch = false;
          for (let i = 0; i < S.length && i < M.length; i++) { const u = un(M[i], S[i]); if (u !== M[i]) { M[i] = u; ch = true; } }
          if (ch) { E[m] = M; pend.push(m); }
        };
        llegar(0, ini);
        while (pend.length) {
          const k = pend.pop(), it = ins[k], B = tj[k], S = E[k], d = S.length;
          let A = null, sigue = true;
          const sig = porPos.get(it.fin);
          switch (it.op) {
            case OP.CONST: case OP.CIERTO: case OP.FALSO: case OP.NULO: case OP.GET_GLOBAL: A = S.concat([VACIO]); break;
            case OP.POP: A = S.slice(0, d - 1); break;
            case OP.DUP: A = S.concat([S[d - 1]]); break;
            case OP.GET_LOCAL: A = S.concat([S[it.arg]]); break;
            case OP.SET_LOCAL: A = S.slice(); if (it.arg !== d - 1) A[it.arg] = S[d - 1]; break;
            case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.IDIV: case OP.MOD: case OP.EQ: case OP.NEQ: case OP.LT: case OP.LE: case OP.GT: case OP.GE:
              A = S.slice(0, d - 2).concat([VACIO]); break;
            case OP.NEG: case OP.NOT: A = S.slice(); A[d - 1] = VACIO; break;
            case OP.JMP: case OP.LOOP: sigue = false; llegar(porPos.get(it.destino), S); break;
            case OP.JMP_FALSE: case OP.JMP_TRUE: llegar(porPos.get(it.destino), S); A = S; break;
            case OP.RET: escapa(S[d - 1]); sigue = false; break;
            case OP.LISTA: { const n = it.arg; for (let i = 0; i < n; i++) if (esR(B[d - n + i])) escapa(S[d - n + i]); A = S.slice(0, d - n).concat([VACIO]); break; }
            case OP.LEN: A = S.slice(0, d - 1).concat([VACIO]); break;
            case OP.IDX_GET: A = S.slice(0, d - 2).concat([esR(tj[k + 1][d - 2]) ? EXTSET : VACIO]); break;
            case OP.PROP_GET: {
              let res = VACIO;
              if (esR(tj[k + 1][d - 1])) for (const t of S[d - 1]) res = un(res, t < 0 ? EXTSET : (cont.get(t) || VACIO));
              A = S.slice(0, d - 1).concat([res]); break;
            }
            case OP.IDX_SET: {
              if (kind[find(B[d - 2])] === 'texto') {          // x.campo = v
                if (esR(B[d - 1])) for (const t of S[d - 3]) guardar(t, S[d - 1]);
              } else if (esR(B[d - 1])) escapa(S[d - 1]);       // l[i] = v
              A = S.slice(0, d - 3).concat([S[d - 1]]); break;
            }
            case OP.CALL: {
              const n = it.arg, base = d - n - 1, c = find(B[base]);
              if (kind[c] === 'recctor') {
                sitios.add(k);
                let todo = VACIO; for (const x of S) todo = un(todo, x);
                entrada.set(k, todo);
                for (let i = 0; i < n; i++) if (esR(B[base + 1 + i])) guardar(k, S[base + 1 + i]);
                A = S.slice(0, base).concat([new Set([k])]);
              } else if (kind[c] === 'fn') {
                const cp = capt.get(payload[c]);
                const mo = modif.get(payload[c]);
                for (let i = 0; i < n; i++) if (esR(B[base + 1 + i])) {
                  if (cp && cp.has(i)) escapa(S[base + 1 + i]);
                  // la llamada puede meter objetos del montón dentro de este (su contenedor tendría que soltarlos al morir): no va a la pila
                  if (mo && mo.has(i)) for (const x of S[base + 1 + i]) { if (x >= 0) { if (!nopila.has(x)) { nopila.add(x); cambio = true; } } else if (x < EXT && !modifica.has(-2 - x)) { modifica.add(-2 - x); cambio = true; } }
                }
                A = S.slice(0, base).concat([esR(tj[k + 1][base]) ? EXTSET : VACIO]);
              } else {
                if (payload[c] === 'nat:agregar' && esR(B[base + 2])) escapa(S[base + 2]);
                A = S.slice(0, base).concat([VACIO]);
              }
              break;
            }
            default: return null;
          }
          if (sigue && A) llegar(sig, A);
        }
      } while (cambio);
      // propagación: lo que guarda un objeto que sale, sale; un objeto que no puede ir a la pila no admite hijos en la pila
      const inel = new Set([...esc, ...nopila]);
      for (let ch = true; ch;) {
        ch = false;
        for (const t of [...inel]) { const c = cont.get(t); if (c) for (const x of c) if (!inel.has(x)) { inel.add(x); ch = true; } }
        for (const t of [...esc]) { const c = cont.get(t); if (c) for (const x of c) if (!esc.has(x)) { esc.add(x); ch = true; } }
      }
      // solape: ¿sigue vivo (alcanzable desde la pila) un objeto de este mismo sitio al volver a crearlo?
      for (const s of sitios) {
        if (!E[s]) { inel.add(s); continue; }
        const vivos = new Set(entrada.get(s));
        for (let ch = true; ch;) { ch = false; for (const t of [...vivos]) { const c = cont.get(t); if (c) for (const x of c) if (!vivos.has(x)) { vivos.add(x); ch = true; } } }
        if (vivos.has(s)) inel.add(s);
      }
      for (let ch = true; ch;) { ch = false; for (const t of [...inel]) { const c = cont.get(t); if (c) for (const x of c) if (x >= 0 && !inel.has(x)) { inel.add(x); ch = true; } } }
      const pila = new Set([...sitios].filter(s => !inel.has(s)));
      const capturados = new Set();
      for (let i = 1; i <= f.aridad; i++) if (esc.has(-1 - i)) capturados.add(i - 1);
      return { pila, capturados, modifica };
    }
    const escapePorFn = new Map();
    {
      const capt = new Map(), modif = new Map();
      let estable = false;
      for (let v = 0; v < 30 && !estable; v++) {
        estable = true;
        for (const [j] of T) {
          const r = analizarEscape(j, capt, modif);
          if (r === null) { escapePorFn.set(j, new Set()); continue; }
          escapePorFn.set(j, r.pila);
          const viejo = capt.get(j);
          if (!viejo || viejo.size !== r.capturados.size) { capt.set(j, r.capturados); estable = false; }
          const vm = modif.get(j);
          if (!vm || vm.size !== r.modifica.size) { modif.set(j, r.modifica); estable = false; }
        }
      }
      if (!estable) for (const [j] of T) escapePorFn.set(j, new Set());
      if (process.env.N_AOT_TIPADO === '1') for (const [j, ps] of escapePorFn) if (ps.size) console.error(`[escape] «${plan[j].f.nombre}»: ${ps.size} objeto(s) a la pila`);
    }

    // los objetos que usa el programa: cada campo, de qué clase quedó (número, bool, otro objeto o «nulo»)
    const nomC = nm => nm.replace(/[^A-Za-z0-9_]/g, '_');
    const construirRecs = () => {
    const recs = new Map();
    {
      const usados = new Set();
      for (const [, tj] of T) for (const B of tj) if (B) for (const nd of B) if (K(nd) === 'rec') usados.add(payload[find(nd)]);
      for (const [nm, m] of recCampos) usados.add(nm);
      const nuevosU = [...usados];
      for (let i = 0; i < nuevosU.length; i++) {
        const nm = nuevosU[i], t = recTipos.get(nm);
        const campos = t.campos.map(cn => {
          const nd = recCampos.has(nm) && recCampos.get(nm).has(cn) ? recCampos.get(nm).get(cn) : null;
          const kk = nd === null ? 'nulo' : K(nd) === 'var' ? 'nulo' : K(nd);
          if (kk !== 'num' && kk !== 'bool' && kk !== 'rec' && kk !== 'nulo') throw new NoElegible(`el campo «${cn}» de «${nm}» es de una clase que el nivel tipado no sabe llevar en un objeto (${kk})`);
          let rn = null;
          if (kk === 'rec') { rn = payload[find(nd)]; if (!usados.has(rn)) { usados.add(rn); nuevosU.push(rn); } }
          return { nombre: cn, c: 'f_' + nomC(cn), kind: kk, rec: rn };
        });
        recs.set(nm, { c: nomC(nm), campos });
      }
    }
    return recs;
    };
    let recs;
    try { recs = construirRecs(); } catch (e) { if (e instanceof NoElegible) return culpa(T.keys().next().value, e); throw e; }
    const elT = n => { const r = find(n); return kind[r] === 'list' && kind[find(elem[r])] === 'rec' ? payload[find(elem[r])] : null; };
    const resultado = { fns: new Map() };
    if (process.env.N_AOT_TIPADO === '2') for (const [j] of T) console.error(`[intervalos] «${plan[j].f.nombre}» params ${JSON.stringify(paramIv.get(j))} ret ${JSON.stringify(retIvM.get(j))}`);
    for (const [j, tj] of T) {
      const b = base.get(j), fl = flujos.get(j);
      resultado.fns.set(j, Object.assign({}, b, { recs, elT, tj, K, elK, tn: n => ({ kind: kind[find(n)], payload: payload[find(n)] }), flags: flags.get(j),
        llama: llama.get(j), maxD: plan[j].res[0].maxD, bucles: analizarBucles(j, fl), listaInt: n => elK(n) === 'num' && listaInt.get(listaDe(n)) === true, retNodo: R.get(j), pila: escapePorFn.get(j) || new Set(),
        ent: { En: fl.En, Ea: fl.Ea, Cn: fl.Cn, Iv: fl.Iv, paramInt: paramInt.get(j), retInt: retInt.get(j) && b.ret === 'num' } }));
    }
    return { ok: true, resultado };
  }

  // La propiedad de las listas por casilla: 0 nada · -1 la casilla la posee (hay que soltarla) · -2 parámetro (prestado de quien
  // llamó) · a>0 copia prestada de la variable local a. Las dos formas de prestado no se cuentan.
  function calcularFlags(j, tj, K) {
    const q = plan[j], f = q.f, ins = q.ins, { porPos } = q.res[0];
    const Fl = new Array(ins.length).fill(null);
    const ini = [0];
    const esObj = kk => kk === 'list' || kk === 'rec';
    for (let i = 1; i <= f.aridad; i++) ini.push(esObj(K(tj[0][i])) ? -2 : 0);
    const pend = [];
    const FlA = new Array(ins.length).fill(null);     // la propiedad DESPUÉS de cada instrucción (para las conversiones en las aristas)
    Fl.after = FlA;
    // En un cruce, si por un camino una variable es dueña de su objeto (-1) y por otro lo tiene prestado (una copia, un parámetro, nulo), pasa a ser dueña:
    // por el camino del préstamo se toma una referencia propia (un inc en la arista, ver «conv» en la emisión). Dos préstamos distintos son un préstamo cualquiera (-3).
    const llegar = (m, S) => {
      if (m === undefined) throw new NoElegible('salto a ninguna parte');
      if (Fl[m] === null) { Fl[m] = S.slice(); pend.push(m); return; }
      if (Fl[m].length !== S.length) throw new NoElegible('dos caminos llegan con la pila distinta');
      const M = Fl[m].slice();
      let cambio = false;
      for (let i = 0; i < S.length; i++) {
        const x = Fl[m][i], y = S[i];
        if (x === y) continue;
        if (x === -1) continue;
        if (y === -1) { M[i] = -1; cambio = true; continue; }
        M[i] = -3; cambio = true;
      }
      if (cambio) { Fl[m] = M; pend.push(m); }
    };
    llegar(0, ini);
    while (pend.length) {
      const k = pend.pop(), it = ins[k], B = tj[k], F = Fl[k], d = B.length;
      const esL = i => esObj(K(B[i]));
      let A = F.slice();
      let sigue = true;
      const sig = porPos.get(it.fin);
      switch (it.op) {
        case OP.CONST: case OP.CIERTO: case OP.FALSO: case OP.NULO: case OP.GET_GLOBAL: A.push(0); break;
        case OP.POP: A.pop(); break;
        case OP.DUP: if (esL(d - 1) && F[d - 1] === -1) throw new NoElegible('duplica una lista nueva'); A.push(F[d - 1]); break;
        case OP.GET_LOCAL: A.push(esL(it.arg) ? it.arg : 0); break;
        case OP.SET_LOCAL: {
          const a = it.arg;
          if (a !== d - 1 && esL(d - 1)) {
            if (a <= f.aridad) throw new NoElegible('se reasigna un parámetro que es lista');
            if (F.some((x, i) => i !== d - 1 && x === a) || F[d - 1] === a) throw new NoElegible('una copia prestada de una variable que se reasigna');
            A[a] = -1; A[d - 1] = a;
          } else if (a !== d - 1) A[a] = 0;
          break;
        }
        case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.IDIV: case OP.MOD: case OP.EQ: case OP.NEQ: case OP.LT: case OP.LE: case OP.GT: case OP.GE:
          A = F.slice(0, d - 2).concat([0]); break;
        case OP.NEG: case OP.NOT: A[d - 1] = 0; break;
        case OP.JMP: case OP.LOOP: sigue = false; llegar(porPos.get(it.destino), A); break;
        case OP.JMP_FALSE: case OP.JMP_TRUE: llegar(porPos.get(it.destino), A); break;
        case OP.CALL: {
          const n = it.arg, base = d - n - 1;
          const rk = K(tj[k + 1] ? tj[k + 1][base] : B[base]);   // el tipo del resultado: el de la casilla base en la instrucción siguiente
          A = F.slice(0, base).concat([esObj(rk) ? -1 : 0]); break;
        }
        case OP.RET: sigue = false; break;
        case OP.LISTA: A = F.slice(0, d - it.arg).concat([-1]); break;
        case OP.IDX_GET: A = F.slice(0, d - 2).concat([esObj(K(tj[k + 1][d - 2])) ? -1 : 0]); break;
        case OP.PROP_GET: { const rk = K(tj[k + 1][d - 1]); A = F.slice(0, d - 1).concat([esObj(rk) ? -1 : 0]); break; }
        case OP.IDX_SET:
          // x.campo = v: el objeto de v pasa al campo (si era un préstamo, el campo toma su propia referencia); lo que queda en la pila es un préstamo del campo (-3)
          A = F.slice(0, d - 3).concat([esL(d - 1) ? -3 : 0]); break;
        case OP.LEN: A = F.slice(0, d - 1).concat([0]); break;
        default: throw new NoElegible('instrucción ' + it.nombre);
      }
      FlA[k] = A;
      if (sigue) llegar(sig, A);
    }
    return Fl;
  }
}

// ── emitir el C ─────────────────────────────────────────────────────────────
// Un número puede vivir en C de dos formas: int64_t (variable i<pos>) cuando el análisis demostró que es un entero con |x| ≤ 2^53 (la suma, la resta
// y el producto se comprueban y, si se salen, la función baja y se repite con la general), o double (d<pos>). El resto: bool → int (b<pos>), lista →
// NLista* (l<pos>).
const ENT_MAX = 9007199254740992;   // 2^53
const LISTA_MAX = 2251799813685248;  // 2^51: los elementos de una lista de enteros se mantienen dentro (se comprueba en cada escritura que no lo asegura el intervalo)
const vacioIv = v => !v || v[0] > v[1];
function ctipoNum(esInt) { return esInt ? 'int64_t' : 'double'; }
function ctipo(k, esInt) { return k === 'num' ? ctipoNum(esInt) : k === 'bool' ? 'int' : k === 'list' ? 'NLista*' : k === 'rec' ? 'void*' : 'int'; }

// Los objetos del nivel tipado son estructuras de C con su propio conteo de referencias y destructor. El destructor no recursa por los campos del mismo tipo (soltar
// una lista de 3 millones de nodos reventaría la pila): los pone en una pila propia y los va soltando de uno en uno.
function emitirRegistros(recs, E) {
  const ct = c => (c.kind === 'num' ? 'double' : c.kind === 'bool' ? 'int' : c.kind === 'rec' ? `R_${recs.get(c.rec).c}*` : 'void*');
  for (const [, r] of recs) E(`typedef struct R_${r.c} R_${r.c};`);
  for (const [, r] of recs) E(`struct R_${r.c} { int64_t rc; ${r.campos.map(c => `${ct(c)} ${c.c};`).join(' ')} };`);
  for (const [, r] of recs) {
    E(`static void nr_liberar_${r.c}(R_${r.c}* p);`);
    E(`static void nrd_${r.c}(void* p);`);
    E(`static inline void nr_inc_${r.c}(R_${r.c}* p) { if (p) p->rc++; }`);
    E(`static inline void nr_dec_${r.c}(R_${r.c}* p) { if (p && --p->rc == 0) nr_liberar_${r.c}(p); }`);
    E(`static void nrd_${r.c}(void* p) { nr_dec_${r.c}((R_${r.c}*)p); }`);
    // zona de reserva: lista libre por tipo + trozos de 1024 objetos (sin malloc/free por objeto; la memoria queda reservada para el propio tipo)
    E(`static R_${r.c}* nr_libre_${r.c};`);
    E(`static __attribute__((noinline)) R_${r.c}* nr_nuevo_lento_${r.c}(void) { R_${r.c}* t = (R_${r.c}*)malloc(sizeof(R_${r.c}) * 1024); if (!t) { fputs("sin memoria\\n", stderr); exit(1); } for (int i = 1; i < 1023; i++) *(R_${r.c}**)&t[i] = &t[i + 1]; *(R_${r.c}**)&t[1023] = NULL; nr_libre_${r.c} = &t[1]; return &t[0]; }`);
    E(`static inline R_${r.c}* nr_nuevo_${r.c}(void) { R_${r.c}* p = nr_libre_${r.c}; if (__builtin_expect(p != NULL, 1)) { nr_libre_${r.c} = *(R_${r.c}**)p; return p; } return nr_nuevo_lento_${r.c}(); }`);
  }
  for (const [nm, r] of recs) {
    const propios = r.campos.filter(c => c.kind === 'rec' && recs.get(c.rec) === r), otros = r.campos.filter(c => c.kind === 'rec' && recs.get(c.rec) !== r);
    E(`static void nr_liberar_${r.c}(R_${r.c}* p) {`);
    E(`  static R_${r.c}** pila; static size_t n, cap; static int dentro;`);
    E(`  if (dentro) { if (n == cap) { cap = cap ? cap * 2 : 1024; pila = (R_${r.c}**)realloc(pila, cap * sizeof(*pila)); } pila[n++] = p; return; }`);
    E('  dentro = 1;');
    E('  for (;;) {');
    for (const c of propios) E(`    { R_${r.c}* h = p->${c.c}; if (h && --h->rc == 0) { if (n == cap) { cap = cap ? cap * 2 : 1024; pila = (R_${r.c}**)realloc(pila, cap * sizeof(*pila)); } pila[n++] = h; } }`);
    for (const c of otros) E(`    nr_dec_${recs.get(c.rec).c}(p->${c.c});`);
    E(`    *(R_${r.c}**)p = nr_libre_${r.c}; nr_libre_${r.c} = p;`);
    E('    if (!n) break;');
    E('    p = pila[--n];');
    E('  }');
    E('  dentro = 0;');
    E('}');
  }
}

function firmaTipada(plan, id, info) {
  const ps = info.params.map((k, i) => `${ctipo(k, info.ent.paramInt[i])} p${i}`);
  return `${ctipo(info.ret, info.ent.retInt)} F${id}t(int prof_${ps.length ? ', ' + ps.join(', ') : ''})`;
}

function emitirTipada(ctx, id, info, E) {
  const { plan, OP, cNumero } = ctx;
  const SC = !!ctx.sinComprobar;   // --sin-comprobar: ni el rango de los índices ni el de las cuentas (ver n-compilar)
  const j = id, q = plan[info.planJ], f = q.f, ins = q.ins, consts = f.chunk.consts, { tj, K, elK, flags } = info;
  const { En, Ea, Cn, Iv } = info.ent;
  const recs0 = nm => info.recs.get(nm);
  const destinos = new Set(ins.filter(it => it.destino !== undefined).map(it => it.destino));
  const { porPos } = q.res[0];
  const L = [], C = s => L.push('  ' + s), pilaDecl = [];
  let usaBad = false;
  for (let k = 0; k < ins.length; k++) {
    const it = ins[k], B = tj[k];
    if (!B) continue;
    const Fl = flags[k], ei = En[k], ea = Ea[k], cn = Cn[k], iv = Iv[k], d = B.length;
    const cv = x => (typeof x === 'number' ? x : null), nn = x => x === '+' || (typeof x === 'number' && x >= 0);
    if (!Fl || !ei) throw new Error('tipado: sin propiedad de listas o de enteros en ' + f.nombre + ':' + it.linea);
    const kd = i => K(B[i]);
    const esI = i => kd(i) === 'num' && ei[i];
    // la casilla i como double (un entero se convierte sin pérdida: |x| ≤ 2^53)
    const D = i => (ei[i] ? `((double)i${i})` : `d${i}`);
    const V = i => { const kk = kd(i); return kk === 'num' ? (ei[i] ? `i${i}` : `d${i}`) : kk === 'bool' ? `b${i}` : kk === 'list' ? `l${i}` : kk === 'rec' ? `r${i}` : '0'; };
    const cp = (dst, src) => {
      const kk = kd(src);
      if (kk === 'num') C(ei[src] ? `i${dst} = i${src};` : `d${dst} = d${src};`);
      else if (kk === 'bool') C(`b${dst} = b${src};`);
      else if (kk === 'list') C(`l${dst} = l${src}; ln${dst} = ln${src}; ld${dst} = ld${src};`);
      else if (kk === 'rec') C(`r${dst} = r${src};`);
    };
    // el tamaño y los datos de una lista se guardan en variables de C: gcc los tiene en registros en vez de volver a leerlos tras cada
    // escritura (que, de enteros, podría ser sobre ellos). Solo cambian con «agregar» (aquí o en una llamada): entonces se refrescan todas.
    const sigK = porPos.get(it.fin);
    const refrescar = (soloPos) => {
      const T2 = sigK !== undefined ? tj[sigK] : null;
      if (!T2) return;
      for (let p = 1; p < T2.length; p++) if (K(T2[p]) === 'list' && (soloPos === undefined || p === soloPos)) C(`ln${p} = l${p}->n; ld${p} = l${p}->d;`);
    };
    // el tipo de objeto de una casilla, y lo que hay que llamar para tomar o soltar una referencia
    const rt = i => info.recs.get(info.tn(B[i]).payload);
    const incObj = (i, expr) => (kd(i) === 'list' ? `nt_inc(${expr});` : `nr_inc_${rt(i).c}((R_${rt(i).c}*)${expr});`);
    const decObj = (i, expr) => (kd(i) === 'list' ? `nt_dec(${expr});` : `nr_dec_${rt(i).c}((R_${rt(i).c}*)${expr});`);
    const esObj = i => kd(i) === 'list' || kd(i) === 'rec';
    const soltar = i => { if (esObj(i) && Fl[i] === -1) C(decObj(i, kd(i) === 'list' ? `l${i}` : `r${i}`)); };
    // lo que hay que convertir al pasar de esta instrucción a la m (una casilla que aquí es entero y allí double)
    const conv = (m) => {
      const out = [];
      const Em = En[m];
      for (let p = 0; p < ea.length; p++) if (ea[p] && Em && !Em[p]) out.push(`d${p} = (double)i${p};`);
      // un objeto que por esta arista llega prestado a un lugar donde la variable es dueña: se toma su referencia
      const Fa = flags.after[k], Fm = flags[m], Tm = tj[m];
      if (Fa && Fm && Tm) for (let p = 1; p < Fm.length && p < Fa.length; p++) {
        if (Fm[p] !== -1 || Fa[p] === -1 || Fa[p] === 0) continue;
        const kk = K(Tm[p]);
        if (kk === 'list') out.push(`nt_inc(l${p});`);
        else if (kk === 'rec') { const rn = info.recs.get(info.tn(Tm[p]).payload).c; out.push(`nr_inc_${rn}((R_${rn}*)r${p});`); }
      }
      return out.join(' ');
    };
    if (info.bucles.pre.has(k) && !SC) for (const cc of info.bucles.pre.get(k)) C(cc);   // lo que se comprueba una vez antes del bucle
    if (destinos.has(it.pos)) L.push(`P${it.pos}:;`);
    const sig = porPos.get(it.fin);
    let cae = true;   // ¿sigue con la siguiente instrucción?
    // al escribir un entero en una lista de enteros: si su intervalo no cabe en ±2^51 se comprueba (así lo que se lee de la lista cabe, y las sumas de dos elementos no desbordan)
    const guardaElem = (pos) => {
      const v = iv[pos];
      if (SC || !v || vacioIv(v)) return;
      const bajo = v[0] < -LISTA_MAX, alto = v[1] > LISTA_MAX;
      if (!bajo && !alto) return;
      // sin salida del bucle (un `goto` fuera impide que gcc lo vectorice): el fallo se acumula y se mira al devolver. Es seguro: lo único que sale de una función
      // tipada es lo que devuelve, y entre el fallo y el retorno los valores son enteros exactos (como mucho, una suma sin comprobar pasa de 2^53 y se descarta).
      usaBad = true;
      C(`bad |= ${bajo && alto ? `(i${pos} > ${LISTA_MAX}LL) | (i${pos} < -${LISTA_MAX}LL)` : alto ? `(i${pos} > ${LISTA_MAX}LL)` : `(i${pos} < -${LISTA_MAX}LL)`};`);
    };
    const indice = (i, lp) => {
      if (!SC && info.bucles.libre.has(k) && ei[i]) return `int64_t ki_ = i${i};`;   // ya comprobado antes de entrar al bucle   // C que valida el índice de la casilla i en la lista L_ y deja ki_
      if (SC) return ei[i] ? `int64_t ki_ = i${i};` : `int64_t ki_ = (int64_t)d${i};`;
      if (ei[i]) return `int64_t ki_ = i${i}; if (__builtin_expect(!((uint64_t)ki_ < (uint64_t)ln${lp}), 0)) NT_FAIL();`;
      return `double kd_ = d${i}; int64_t ki_ = (int64_t)kd_; if (__builtin_expect(!((uint64_t)ki_ < (uint64_t)ln${lp} && (double)ki_ == kd_), 0)) NT_FAIL();`;
    };
    const RANGO = '(uint64_t)(t_ + 9007199254740992LL) > 18014398509481984ULL';
    switch (it.op) {
      case OP.CONST: {
        const v = consts[it.arg];
        if (typeof v === 'number') C(ea[d] ? `i${d} = ${v}LL;` : `d${d} = ${cNumero(v)};`);
        else if (typeof v === 'string') { /* el nombre de un campo: no ocupa variable */ }
        else C(`b${d} = ${v ? 1 : 0};`);
        break;
      }
      case OP.CIERTO: C(`b${d} = 1;`); break;
      case OP.FALSO: C(`b${d} = 0;`); break;
      case OP.NULO: if (K(tj[porPos.get(it.fin)][d]) === 'rec') C(`r${d} = NULL;`); break;
      case OP.GET_GLOBAL: break;
      case OP.POP: soltar(d - 1); break;
      case OP.DUP: cp(d, d - 1); break;
      case OP.GET_LOCAL: cp(d, it.arg); break;
      case OP.SET_LOCAL: {
        const a = it.arg;
        if (a === d - 1) break;
        if (kd(d - 1) === 'rec') {
          if (kd(a) === 'rec' && Fl[a] === -1) C(decObj(a, `r${a}`));
          C(`r${a} = r${d - 1};`);
          if (Fl[d - 1] !== -1) C(incObj(a, `r${a}`));
        } else if (kd(d - 1) === 'list') {
          if (kd(a) === 'list' && Fl[a] === -1) C(`nt_dec(l${a});`);
          C(`l${a} = l${d - 1}; ln${a} = ln${d - 1}; ld${a} = ld${d - 1};`);
          if (Fl[d - 1] !== -1) C(`nt_inc(l${a});`);
        } else cp(a, d - 1);
        break;
      }
      case OP.ADD: case OP.SUB: {
        const o = it.op === OP.ADD ? '+' : '-';
        if (!ea[d - 2]) { C(`d${d - 2} = ${D(d - 2)} ${o} ${D(d - 1)};`); break; }
        const a = iv[d - 2], b = iv[d - 1];
        // los límites se calculan con BigInt: en Number, 2^53 + 1 se redondea a 2^53 y la comprobación se perdería justo en el borde
        const BI = BigInt, MX = BI(ENT_MAX);
        const crudo = vacioIv(a) || vacioIv(b) ? [0n, 0n] : it.op === OP.ADD ? [BI(a[0]) + BI(b[0]), BI(a[1]) + BI(b[1])] : [BI(a[0]) - BI(b[1]), BI(a[1]) - BI(b[0])];
        const bajo = crudo[0] < -MX, alto = crudo[1] > MX;
        if (SC || (!bajo && !alto)) C(`i${d - 2} = i${d - 2} ${o} i${d - 1};`);
        else C(`{ int64_t t_ = i${d - 2} ${o} i${d - 1}; if (__builtin_expect(${bajo && alto ? RANGO : alto ? 't_ > 9007199254740992LL' : 't_ < -9007199254740992LL'}, 0)) NT_FAIL(); i${d - 2} = t_; }`);
        break;
      }
      case OP.MUL: {
        if (!ea[d - 2]) { C(`d${d - 2} = ${D(d - 2)} * ${D(d - 1)};`); break; }
        const a = iv[d - 2], b = iv[d - 1];
        const x = i2 => `i${d - i2}`;
        let crudo = [0n, 0n], negcero = false;
        if (!vacioIv(a) && !vacioIv(b)) {
          const BI = BigInt;   // exacto: en Number un producto cerca de 2^53 se redondea
          const ps = [BI(a[0]) * BI(b[0]), BI(a[0]) * BI(b[1]), BI(a[1]) * BI(b[0]), BI(a[1]) * BI(b[1])];
          crudo = [ps.reduce((m, x) => (x < m ? x : m)), ps.reduce((m, x) => (x > m ? x : m))];
          // -0: el producto es 0 y uno de los dos es negativo (el otro, 0)
          negcero = (a[0] <= 0 && a[1] >= 0 && b[0] < 0) || (b[0] <= 0 && b[1] >= 0 && a[0] < 0);
        }
        const MXn = BigInt(ENT_MAX), bajo = crudo[0] < -MXn, alto = crudo[1] > MXn, nc = `(t_ == 0 & (${x(2)} < 0 | ${x(1)} < 0))`;
        if (!bajo && !alto) {
          if (!negcero) C(`${x(2)} = ${x(2)} * ${x(1)};`);
          else C(`{ int64_t t_ = ${x(2)} * ${x(1)}; if (__builtin_expect(${nc}, 0)) NT_FAIL(); ${x(2)} = t_; }`);
        } else if (SC) {
          if (!negcero) C(`${x(2)} = ${x(2)} * ${x(1)};`);
          else C(`{ int64_t t_ = ${x(2)} * ${x(1)}; if (__builtin_expect(${nc}, 0)) NT_FAIL(); ${x(2)} = t_; }`);
        } else {
          const rango = bajo && alto ? '((uint64_t)(t_ + 9007199254740992LL) > 18014398509481984ULL)' : alto ? '(t_ > 9007199254740992LL)' : '(t_ < -9007199254740992LL)';
          C(`{ int64_t t_; if (__builtin_expect(__builtin_mul_overflow(${x(2)}, ${x(1)}, &t_) | ${rango}${negcero ? ' | ' + nc : ''}, 0)) NT_FAIL(); ${x(2)} = t_; }`);
        }
        break;
      }
      case OP.DIV: C(`if (${D(d - 1)} == 0) NT_FAIL(); d${d - 2} = ${D(d - 2)} / ${D(d - 1)};`); break;
      case OP.IDIV: {
        if (!ea[d - 2]) { C(`if (${D(d - 1)} == 0) NT_FAIL(); d${d - 2} = floor(${D(d - 2)} / ${D(d - 1)});`); break; }
        const a = iv[d - 2], b = iv[d - 1];
        const cb = cv(cn[d - 1]);
        if (cb !== null && cb >= 1 && Number.isInteger(Math.log2(cb))) { if (cb > 1) C(`i${d - 2} = i${d - 2} >> ${Math.log2(cb)};`); break; }   // floor(a / 2^k) = a >> k, con cualquier signo
        const cero = vacioIv(b) ? false : b[0] <= 0 && b[1] >= 0, negcero = !vacioIv(a) && !vacioIv(b) && a[0] <= 0 && a[1] >= 0 && b[0] < 0;
        C(`{ ${cero ? `if (i${d - 1} == 0) NT_FAIL(); ` : ''}int64_t q_ = nt_idivi(i${d - 2}, i${d - 1});${negcero ? ` if (q_ == 0 && i${d - 2} == 0 && i${d - 1} < 0) NT_FAIL();` : ''} i${d - 2} = q_; }`);
        break;
      }
      case OP.MOD: {
        if (!ea[d - 2]) { C(`if (${D(d - 1)} == 0) NT_FAIL(); d${d - 2} = nt_mod(${D(d - 2)}, ${D(d - 1)});`); break; }
        const b = iv[d - 1], cb = cv(cn[d - 1]);
        if (cb !== null && cb >= 1 && Number.isInteger(Math.log2(cb))) { C(`i${d - 2} = i${d - 2} & ${cb - 1}LL;`); break; }   // a mod 2^k = a & (2^k - 1), con cualquier signo
        C(`${!vacioIv(b) && b[0] >= 1 ? '' : `if (i${d - 1} <= 0) NT_FAIL(); `}i${d - 2} = nt_modi(i${d - 2}, i${d - 1});`);
        break;
      }
      case OP.NEG: {
        if (!ei[d - 1]) { C(`d${d - 1} = -d${d - 1};`); break; }
        const a = iv[d - 1];
        C(`${!vacioIv(a) && (a[0] > 0 || a[1] < 0) ? '' : `if (i${d - 1} == 0) NT_FAIL(); `}i${d - 1} = -i${d - 1};`);
        break;
      }
      case OP.NOT: C(`b${d - 1} = !b${d - 1};`); break;
      case OP.EQ: case OP.NEQ: {
        const o = it.op === OP.EQ ? '==' : '!=', kk = kd(d - 1);
        if (kk === 'rec') {
          const pos = ins[k - 1].op === OP.NULO ? d - 2 : d - 1;     // el otro operando es el «nulo» escrito en el programa
          C(`b${d - 2} = (r${pos} ${o} NULL);`);
          soltar(pos);
          break;
        }
        const a = kk === 'num' && ei[d - 2] && ei[d - 1] ? [`i${d - 2}`, `i${d - 1}`] : kk === 'num' ? [D(d - 2), D(d - 1)] : [V(d - 2), V(d - 1)];
        C(`b${d - 2} = (${a[0]} ${o} ${a[1]});`);
        break;
      }
      case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
        const o = { [OP.LT]: '<', [OP.LE]: '<=', [OP.GT]: '>', [OP.GE]: '>=' }[it.op];
        const a = ei[d - 2] && ei[d - 1] ? [`i${d - 2}`, `i${d - 1}`] : [D(d - 2), D(d - 1)];
        C(`b${d - 2} = (${a[0]} ${o} ${a[1]});`);
        break;
      }
      case OP.JMP: case OP.LOOP: {
        const c = conv(porPos.get(it.destino));
        if (c) C(c);
        if (it.op === OP.LOOP && !SC) {   // un bucle que llama a otras tipadas: aquí se mira si alguna falló
          const m = porPos.get(it.destino);
          let llama = false;
          for (let kk = m; kk < k && !llama; kk++) {
            const ik2 = ins[kk];
            if (ik2.op === OP.CALL && tj[kk] && info.tn(tj[kk][tj[kk].length - ik2.arg - 1]).kind === 'fn') llama = true;
          }
          if (llama) C('if (__builtin_expect(n_tdeopt, 0)) goto Ltdeopt;');
        }
        C(`goto P${it.destino};`); cae = false; break;
      }
      case OP.JMP_FALSE: case OP.JMP_TRUE: {
        const rp = it.op === OP.JMP_FALSE && !process.env.N_AOT_SIN_REP ? info.bucles.repet.get(k) : null;
        if (rp) {   // todo el bucle de una vez; después b = 0 y el salto sale del bucle
          const fin = `${rp.N}${rp.le ? ' + 1' : ''}`;
          C(`if (b${d - 1}) { ${rp.fn}(l${rp.a}, ${fin} - i${rp.s}, ${rp.val}); i${rp.s} = ${fin}; b${d - 1} = 0; }`);
          refrescar();
        }
        const c = conv(porPos.get(it.destino)), cond = it.op === OP.JMP_FALSE ? `!b${d - 1}` : `b${d - 1}`;
        C(c ? `if (${cond}) { ${c} goto P${it.destino}; }` : `if (${cond}) goto P${it.destino};`);
        break;
      }
      case OP.CALL: {
        const n = it.arg, base = d - n - 1, tn = info.tn(B[base]);
        if (tn.kind === 'recctor') {
          const r = info.recs.get(tn.payload);
          if (info.pila.has(k) && !process.env.N_AOT_SIN_ESCAPE) { pilaDecl.push(`R_${r.c} sk${k};`); C(`{ R_${r.c}* o_ = &sk${k}; o_->rc = NT_RC_PILA;`); }   // no escapa: vive en la pila (el conteo no llega nunca a 0)
          else C(`{ R_${r.c}* o_ = nr_nuevo_${r.c}(); o_->rc = 1;`);
          r.campos.forEach((c, i) => {
            const pos = base + 1 + i;
            if (c.kind === 'num') C(`  o_->${c.c} = ${D(pos)};`);
            else if (c.kind === 'bool') C(`  o_->${c.c} = b${pos};`);
            else if (c.kind === 'rec') C(`  o_->${c.c} = (R_${recs0(c.rec).c}*)r${pos};${Fl[pos] !== -1 ? ' ' + incObj(pos, `r${pos}`) : ''}`);
            else C(`  o_->${c.c} = NULL;`);
          });
          C(`  r${base} = o_; }`);
        } else if (tn.kind === 'fn') {
          const kf = tn.payload, ik = ctx.fnsInfo.get(kf);
          const args = Array.from({ length: n }, (_, i) => { const p = base + 1 + i; return ik.params[i] === 'num' && !ik.ent.paramInt[i] ? D(p) : V(p); });
          const llamada = `F${kf}t(prof_ + 1${n ? ', ' + args.join(', ') : ''})`;
          if (ik.ret === 'nulo') C(`${llamada};`);
          else C(`${ik.ret === 'num' ? (ik.ent.retInt ? 'i' : 'd') : ik.ret === 'bool' ? 'b' : ik.ret === 'rec' ? 'r' : 'l'}${base} = ${llamada};`);
          // Con todos los accesos comprobados, un fallo en la llamada no hace daño aunque se siga un rato con su 0: se mira en los saltos hacia atrás de
          // los bucles que llaman (para no dar vueltas sin fin) y al salir a la entrada. Una lista que falta (NULL) sí hay que mirarla ya.
          // (llamada de cola: lo siguiente es el RET, no se hace nada más con un 0 falso; la bandera sube sola y gcc puede convertir la llamada en un salto)
          const deCola = ins[k + 1] && ins[k + 1].op === OP.RET && ik.ret !== 'list' && ik.ret !== 'rec';
          if ((SC && !deCola) || ik.ret === 'list' || ik.ret === 'rec') C('if (__builtin_expect(n_tdeopt, 0)) goto Ltdeopt;');
          for (let i = 0; i < n; i++) soltar(base + 1 + i);
          if (ik.agrega || ik.ret === 'list') refrescar();
        } else if (tn.payload === 'nat:agregar' && kd(base + 2) === 'rec') {
          const rn = rt(base + 2).c;
          C(`{ R_${rn}* v_ = (R_${rn}*)r${base + 2};${Fl[base + 2] !== -1 ? ' ' + incObj(base + 2, 'v_') : ''} nt_agregar_p(l${base + 1}, v_, nrd_${rn}); }`);
          soltar(base + 1);
          refrescar();
        } else if (tn.payload === 'nat:agregar') {
          const ke = kd(base + 2);
          if (ke === 'num' && info.listaInt(B[base + 1])) { guardaElem(base + 2); C(`nt_agregar_i(l${base + 1}, i${base + 2});`); }
          else C(`n_lista_agregar(l${base + 1}, ${ke === 'num' ? `n_num(${D(base + 2)})` : `n_bool(b${base + 2})`});`);
          soltar(base + 1);
          refrescar();
        } else if (tn.payload === 'nat:longitud') {
          C(`i${base} = ln${base + 1};`); soltar(base + 1);
        } else if (tn.payload === 'nat:reloj') {
          C(`d${base} = nt_reloj();`);
        } else {
          const x = D(base + 1), r = `d${base}`;
          if (tn.payload === 'nat:numerico/raiz') C(`if (${x} < 0) NT_FAIL(); ${r} = sqrt(${x});`);
          else C(`${r} = ${{ 'nat:entero': 'trunc', 'nat:numerico/absoluto': 'fabs', 'nat:numerico/piso': 'floor', 'nat:numerico/techo': 'ceil' }[tn.payload]}(${x});`);
        }
        break;
      }
      case OP.RET: {
        const kk = kd(d - 1);
        if (kk === 'list' && Fl[d - 1] !== -1) C(`nt_inc(l${d - 1});`);
        else if (kk === 'rec' && Fl[d - 1] !== -1) C(incObj(d - 1, `r${d - 1}`));
        for (let i = 1; i < d - 1; i++) soltar(i);
        C('@@BAD@@');
        C(kk === 'nulo' ? 'return 0;' : kk === 'num' ? `return ${info.ent.retInt ? `i${d - 1}` : D(d - 1)};` : `return ${V(d - 1)};`);
        cae = false;
        break;
      }
      case OP.LISTA: {
        const n = it.arg, ek = n ? kd(d - n) : 'num';
        C(`l${d - n} = (NLista*)n_lista_nueva(${n}).u.o;`);
        const lint = ek === 'num' && n && info.listaInt(tj[porPos.get(it.fin)][d - n]);
        const refLit = () => C(`ln${d - n} = l${d - n}->n; ld${d - n} = l${d - n}->d;`);
        if (lint) for (let i = 0; i < n; i++) guardaElem(d - n + i);
        for (let i = 0; i < n; i++) C(lint ? `nt_agregar_i(l${d - n}, i${d - n + i});` : `n_lista_agregar(l${d - n}, ${ek === 'num' ? `n_num(${D(d - n + i)})` : `n_bool(b${d - n + i})`});`);
        refLit();
        break;
      }
      case OP.PROP_GET: {
        const r = rt(d - 1), campo = consts[it.arg], c = r.campos.find(x => x.nombre === campo), P = `((R_${r.c}*)r${d - 1})`;
        const nul = SC ? '' : `if (__builtin_expect(!r${d - 1}, 0)) NT_FAIL(); `;
        if (c.kind === 'num') { C(`${nul}d${d - 1} = ${P}->${c.c};`); soltar(d - 1); }
        else if (c.kind === 'bool') { C(`${nul}b${d - 1} = ${P}->${c.c};`); soltar(d - 1); }
        else if (c.kind === 'rec') {
          C(`{ ${nul}void* t_ = (void*)${P}->${c.c}; nr_inc_${recs0(c.rec).c}((R_${recs0(c.rec).c}*)t_);`);
          if (Fl[d - 1] === -1) C(`  ${decObj(d - 1, `r${d - 1}`)}`);
          C(`  r${d - 1} = t_; }`);
        } else { C(`${nul}(void)${P};`); soltar(d - 1); }
        break;
      }
      case OP.IDX_GET: {
        const ek = elK(B[d - 2]);
        if (ek === 'rec') {
          const rn = recs0(info.elT(B[d - 2])).c;
          C(`{ ${indice(d - 1, d - 2)}`);
          C(`  void* t_ = ((void**)ld${d - 2})[ki_]; nr_inc_${rn}((R_${rn}*)t_);`);
          if (Fl[d - 2] === -1) C(`  ${decObj(d - 2, `l${d - 2}`)}`);
          C(`  r${d - 2} = t_; }`);
          break;
        }
        C(`{ ${indice(d - 1, d - 2)}`);
        if (ek === 'num' && info.listaInt(B[d - 2])) C(`  i${d - 2} = ((int64_t*)ld${d - 2})[ki_]; }`);
        else if (ek === 'num') C(`  d${d - 2} = ((double*)ld${d - 2})[ki_]; }`);
        else C(`  b${d - 2} = ((uint8_t*)ld${d - 2})[ki_]; }`);
        soltar(d - 2); break;
      }
      case OP.IDX_SET: {
        if (kd(d - 2) === 'texto') {     // x.campo = v
          const r = rt(d - 3), campo = info.tn(B[d - 2]).payload, c = r.campos.find(x => x.nombre === campo), P = `((R_${r.c}*)r${d - 3})`;
          const nul = SC ? '' : `if (__builtin_expect(!r${d - 3}, 0)) NT_FAIL(); `;
          if (c.kind === 'num') { C(`${nul}${P}->${c.c} = ${D(d - 1)};`); soltar(d - 3); cp(d - 3, d - 1); }
          else if (c.kind === 'bool') { C(`${nul}${P}->${c.c} = b${d - 1};`); soltar(d - 3); cp(d - 3, d - 1); }
          else if (c.kind === 'rec') {
            const rc = recs0(c.rec);
            C(`{ ${nul}R_${rc.c}* v_ = (R_${rc.c}*)r${d - 1};${Fl[d - 1] !== -1 ? ' ' + incObj(d - 1, 'v_') : ''} R_${rc.c}* viejo_ = ${P}->${c.c}; ${P}->${c.c} = v_; nr_dec_${rc.c}(viejo_); }`);
            soltar(d - 3); C(`r${d - 3} = r${d - 1};`);
          } else { C(`${nul}(void)${P};`); soltar(d - 3); }
          break;
        }
        const ek = elK(B[d - 3]);
        if (ek === 'rec') {
          const rn = recs0(info.elT(B[d - 3])).c;
          C(`{ ${indice(d - 2, d - 3)}`);
          C(`  R_${rn}* v_ = (R_${rn}*)r${d - 1};${Fl[d - 1] !== -1 ? ' ' + incObj(d - 1, 'v_') : ''} R_${rn}* viejo_ = ((R_${rn}**)ld${d - 3})[ki_]; ((R_${rn}**)ld${d - 3})[ki_] = v_; nr_dec_${rn}(viejo_); }`);
          soltar(d - 3);
          C(`r${d - 3} = r${d - 1};`);
          break;
        }
        C(`{ ${indice(d - 2, d - 3)}`);
        if (ek === 'num' && info.listaInt(B[d - 3])) { guardaElem(d - 1); C(`  ((int64_t*)ld${d - 3})[ki_] = i${d - 1}; }`); }
        else C(ek === 'num' ? `  ((double*)ld${d - 3})[ki_] = ${D(d - 1)}; }` : `  ((uint8_t*)ld${d - 3})[ki_] = (uint8_t)b${d - 1}; }`);
        cp(d - 3, d - 1);
        soltar(d - 3); break;
      }
      case OP.LEN: C(`i${d - 1} = ln${d - 1};`); soltar(d - 1); break;
      default: throw new Error('tipado: instrucción sin traducir ' + it.nombre);
    }
    if (cae && sig !== undefined && it.op !== OP.RET) { const c = conv(sig); if (c) C(c); }
  }
  for (let x = 0; x < L.length; x++) if (L[x].trim() === '@@BAD@@') L[x] = usaBad ? '  if (__builtin_expect(bad, 0)) NT_FAIL();' : '';
  E('');
  E(`/* ${f.nombre}/${f.aridad}${id !== info.planJ ? ' [instancia ' + id + ']' : ''} (TIPADA: int64_t, double, int y NLista* de C, sin cajas; si algo se sale de lo esperado baja con n_tdeopt y quien entró desde fuera lo repite con la versión general) */`);
  E(`static N_PURA ${firmaTipada(plan, j, info)} {`);
  E('  if (__builtin_expect(prof_ > N_MAX_MARCOS, 0)) { n_tdeopt = 1; return 0; }');
  const md = info.maxD + 1, rg = n => Array.from({ length: md }, (_, i) => `${n}${i}`);
  E(`  double ${rg('d').join(' = 0, ')} = 0; int64_t ${rg('i').join(' = 0, ')} = 0; int ${rg('b').join(' = 0, ')} = 0; NLista ${rg('*l').join(' = NULL, ')} = NULL; void ${rg('*r').join(' = NULL, ')} = NULL;`);
  E('  int bad = 0;   /* fallos acumulados sin salir de los bucles */');
  if (pilaDecl.length) E('  ' + pilaDecl.join(' '));
  E(`  int64_t ${rg('ln').join(' = 0, ')} = 0; void ${rg('*ld').join(' = NULL, ')} = NULL;`);
  info.params.forEach((k, i) => { E(`  ${k === 'num' ? (info.ent.paramInt[i] ? 'i' : 'd') : k === 'bool' ? 'b' : k === 'rec' ? 'r' : 'l'}${i + 1} = p${i};`); if (k === 'list') E(`  ln${i + 1} = p${i}->n; ld${i + 1} = p${i}->d;`); });
  for (const l of L) E(l);
  E(`  Ltdeopt: return ${info.ret === 'list' || info.ret === 'rec' ? 'NULL' : '0'};`);
  E('}');
}

// Lo que se pone al principio de la versión general: si los argumentos son del tipo inferido, se intenta la tipada.
function entradaGeneral(plan, j, info) {
  const n = plan[j].f.aridad;
  const conds = [`nargs == ${n}`];
  info.params.forEach((k, i) => {
    if (k === 'num') conds.push(info.ent.paramInt[i] ? `args[${i}].t == N_NUM && nt_esent(args[${i}].u.n)` : `args[${i}].t == N_NUM`);
    else if (k === 'bool') conds.push(`args[${i}].t == N_BOOL`);
    else conds.push(info.elems[i] === 'num' ? `nt_lista_ok(args[${i}], NL_NUM)` : info.elems[i] === 'bool' ? `nt_lista_ok(args[${i}], NL_BOOL)` : `n_es(args[${i}], NC_LISTA)`);
  });
  const as = info.params.map((k, i) => (k === 'num' ? (info.ent.paramInt[i] ? `(int64_t)args[${i}].u.n` : `args[${i}].u.n`) : k === 'bool' ? `args[${i}].u.b` : `(NLista*)args[${i}].u.o`));
  const caja = { num: info.ent.retInt ? 'n_num((double)r_)' : 'n_num(r_)', bool: 'n_bool(r_)', list: 'n_obj(r_)', nulo: 'n_nulo()' }[info.ret];
  return [`  if (${conds.join(' && ')}) {`,
    '    n_tdeopt = 0;',
    `    ${ctipo(info.ret, info.ent.retInt)} r_ = F${j}t(n_hilo.profundidad + 1${as.length ? ', ' + as.join(', ') : ''});`,
    ...(info.ret === 'list' && info.listaInt(info.retNodo) ? ['    if (!n_tdeopt) nt_lista_a_num(r_);   /* sale al código general: sus elementos, doubles de siempre */'] : []),
    `    if (!n_tdeopt) return ${caja};`,
    '    n_tdeopt = 0;   /* algo raro: se vuelve a empezar con la versión general, que da el error de siempre */',
    '  }'].join('\n');
}

module.exports = { analizarTipado, emitirTipada, firmaTipada, entradaGeneral, emitirRegistros };
