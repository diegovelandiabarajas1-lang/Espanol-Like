// ============================================================================
//  ESPAÑOL-LIKE v4 — Verificador de tipos y Compilador a bytecode
//  Parte 2 de 4.
// ============================================================================
'use strict';

// --------------------------------------------------------------- Instrucciones
const OP = {};
const OP_NOMBRE = [];
[
  'CONST', 'NULO', 'CIERTO', 'FALSO', 'POP', 'DUP',
  'GET_LOCAL', 'SET_LOCAL', 'GET_GLOBAL', 'SET_GLOBAL', 'DEF_GLOBAL', 'GET_UP', 'SET_UP',
  'ADD', 'SUB', 'MUL', 'DIV', 'IDIV', 'MOD', 'POW', 'NEG', 'NOT',
  'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE',
  'JMP', 'JMP_FALSE', 'JMP_TRUE', 'LOOP',
  'CALL', 'CLOSURE', 'CLOSE_UP', 'RET',
  'LISTA', 'DIC', 'IDX_GET', 'IDX_SET', 'PROP_GET', 'CONCAT', 'LEN',
  // Fase 2 — excepciones. TRY apila un manejador apuntando al bloque que
  // recoge; FIN_TRY lo quita al salir bien; LANZAR desenrolla.
  'TRY', 'FIN_TRY', 'LANZAR',
].forEach((n, i) => { OP[n] = i; OP_NOMBRE[i] = n; });

// cuántos operandos (bytes) lleva cada instrucción
const OPERANDOS = {
  [OP.CONST]: 1, [OP.GET_LOCAL]: 1, [OP.SET_LOCAL]: 1,
  [OP.GET_GLOBAL]: 1, [OP.SET_GLOBAL]: 1, [OP.DEF_GLOBAL]: 1,
  [OP.GET_UP]: 1, [OP.SET_UP]: 1,
  [OP.JMP]: 1, [OP.JMP_FALSE]: 1, [OP.JMP_TRUE]: 1, [OP.LOOP]: 1,
  [OP.CALL]: 1, [OP.CLOSURE]: 1, [OP.LISTA]: 1, [OP.DIC]: 1, [OP.CONCAT]: 1,
  [OP.PROP_GET]: 1, [OP.TRY]: 1,
};

class Chunk {
  constructor(nombre) { this.nombre = nombre; this.code = []; this.lineas = []; this.consts = []; this.indice = new Map(); }
  emitir(op, linea) { this.code.push(op); this.lineas.push(linea | 0); return this.code.length - 1; }
  // Un Map evita recorrer todas las constantes en cada una nueva. Sus claves usan
  // SameValueZero: los primitivos iguales comparten entrada y los objetos (las
  // funciones anidadas) se distinguen por identidad, que es justo lo que hace falta.
  cte(v) {
    const visto = this.indice.get(v);
    if (visto !== undefined) return visto;
    this.consts.push(v);
    const i = this.consts.length - 1;
    this.indice.set(v, i);
    return i;
  }
}

class FuncionCompilada {
  constructor(nombre, aridad) {
    this.nombre = nombre; this.aridad = aridad;
    this.chunk = new Chunk(nombre);
    this.nUpvalues = 0;
    // Tamaño máximo del marco. El verificador de bytecode lo usa para rechazar
    // un GET_LOCAL que se salga; sin él, leer un slot inexistente devuelve
    // «undefined» calladamente.
    this.maxSlots = 1;
    this.ast = null;        // se guarda para el JIT
    this.jit = null;        // función JS compilada, si procede
    this.jitEstado = 'frío'; // frío | caliente | compilada | rechazada
    this.llamadas = 0;
    this.nombresParams = [];
  }
  toString() { return `<funcion ${this.nombre}/${this.aridad}>`; }
}

// ======================================================================
//  VERIFICADOR DE TIPOS  (gradual: lo anotado se comprueba, lo demás no)
// ======================================================================
// «indiceEdsl» es nombre → [eDSL que lo exportan]. Sin él, mudar un nombre a un
// eDSL solo produce «no está definida», que es un muro: el programa era válido
// ayer y hoy no, y el mensaje no dice por qué. Con él, el mensaje dice la línea
// exacta que falta, y la mudanza pasa de romper cosas a enseñar el camino.
function verificarTipos(ast, globalesTipos, enlace, indiceEdsl) {
  const { T, tipoATexto, compatible, esNum, ErrorFuente } = MODULO_FRONT;
  const errores = [];
  const avisos = [];

  function err(nodo, msg, pista) {
    errores.push(new ErrorFuente('tipos', msg, nodo.linea, nodo.col, pista));
    return T.cualquiera;
  }

  class Ambito {
    constructor(padre, retornoEsperado) {
      this.vars = new Map(); this.padre = padre;
      this.retornoEsperado = retornoEsperado !== undefined ? retornoEsperado : (padre ? padre.retornoEsperado : null);
      this.hayRetorno = false;
    }
    declarar(n, t, esFijo) { this.vars.set(n, { tipo: t, esFijo }); }
    buscar(n) { let a = this; while (a) { if (a.vars.has(n)) return a.vars.get(n); a = a.padre; } return null; }
  }

  const raiz = new Ambito(null, null);
  for (const [n, t] of Object.entries(globalesTipos)) raiz.declarar(n, t, true);

  // Lo importado entra en el ámbito raíz como si estuviera declarado aquí, con
  // el tipo que el otro archivo anotó. Va después de la biblioteca a propósito:
  // importar algo llamado «texto» la tapa, y el aviso ya lo dio el enlazador.
  if (enlace) {
    for (const [al, m] of enlace.alias)
      raiz.declarar(al, { k: 'modulo', clave: m.clave, ruta: m.ruta, exporta: m.exporta }, true);
    for (const [nm, i] of enlace.nombres)
      raiz.vars.set(nm, { tipo: i.tipo || T.cualquiera, esFijo: true, deModulo: i.ruta,
        deClasico: i.deClasico ? i : null });
  }

  // Cuáles de los nombres que trajo «usar "clasico"» se usan de verdad. El
  // interruptor es una elección legítima, así que no avisa por existir: avisa
  // solo cuando SOBRA —el archivo no usa ninguno— o cuando con tres nombres
  // concretos se queda más claro de lo que trae. Un aviso que sale siempre se
  // aprende a ignorar, y entonces deja de servir para nada.
  const clasicoUsado = new Set();
  const marcarUso = v => { if (v && v.deClasico) clasicoUsado.add(v.deClasico); };

  // Declarar algo con el nombre de una función de la biblioteca la tapa para
  // el resto del programa, en silencio. No es un error —puede ser aposta— pero
  // sí es la clase de cosa que cuesta media hora encontrar cuando no lo es.
  function avisarSiTapa(nodo, nombre, que) {
    if (!Object.prototype.hasOwnProperty.call(globalesTipos, nombre)) return;
    avisos.push(new ErrorFuente('nombres', `${que} «${nombre}» tapa a la de la biblioteca`,
      nodo.linea, nodo.col, `a partir de aquí «${nombre}» ya no es la de Ñ; si es a propósito, ponle otro nombre para que se lea`));
  }

  // pre-registrar funciones de nivel superior (permite llamadas antes de definirlas)
  function registrarFunciones(cuerpo, amb) {
    for (const s of cuerpo) {
      if (s.tipo === 'DeclFuncion') {
        if (amb === raiz) avisarSiTapa(s, s.nombre, 'la función');
        amb.declarar(s.nombre, T.fn(s.params.map(p => p.anotacion || T.cualquiera), s.retorno || T.cualquiera), true);
      }
    }
  }

  function bloqueTipos(nodo, amb) { for (const s of nodo.cuerpo) sent(s, amb); }

  function sent(n, amb) {
    switch (n.tipo) {
      case 'DeclVar': {
        const tv = n.valor ? expr(n.valor, amb) : T.nulo;
        let t = n.anotacion || tv;
        if (n.anotacion && n.valor && !compatible(n.anotacion, tv))
          err(n, `«${n.nombre}» se declaró como ${tipoATexto(n.anotacion)} pero recibe ${tipoATexto(tv)}`,
            `cambia la anotación o convierte el valor (por ejemplo con entero(x) o real(x))`);
        if (amb.vars.has(n.nombre)) {
          // Decir «ya estaba declarada» de algo que el programa no declaró
          // nunca no ayuda a nadie: lo que pasa es que ese nombre es de la
          // biblioteca.
          if (amb === raiz && Object.prototype.hasOwnProperty.call(globalesTipos, n.nombre) && !amb.declaradas?.has(n.nombre))
            err(n, `«${n.nombre}» es una función de la biblioteca y no se puede redeclarar`, 'ponle otro nombre a la tuya');
          else err(n, `«${n.nombre}» ya estaba declarada en este ámbito`);
        }
        amb.declarar(n.nombre, t, n.esFijo);
        return;
      }
      case 'DeclFuncion': {
        if (!amb.vars.has(n.nombre))
          amb.declarar(n.nombre, T.fn(n.params.map(p => p.anotacion || T.cualquiera), n.retorno || T.cualquiera), true);
        const sub = new Ambito(amb, n.retorno || null);
        for (const p of n.params) sub.declarar(p.nombre, p.anotacion || T.cualquiera, false);
        bloqueTipos(n.cuerpo, sub);
        if (n.retorno && n.retorno.k !== 'nulo' && n.retorno.k !== 'cualquiera' && !sub.hayRetorno)
          err(n, `«${n.nombre}» promete devolver ${tipoATexto(n.retorno)} pero hay caminos sin «devolver»`,
            'añade un «devolver» al final de la función');
        return;
      }
      case 'Bloque': return bloqueTipos(n, new Ambito(amb));
      case 'Si': {
        const c = expr(n.cond, amb);
        if (c.k !== 'bool' && c.k !== 'cualquiera')
          avisos.push(new ErrorFuente('tipos', `la condición de «si» es ${tipoATexto(c)}, no bool`, n.linea, n.col, 'se usará su valor de verdad'));
        sent(n.entonces, new Ambito(amb));
        if (n.sino) sent(n.sino, new Ambito(amb));
        return;
      }
      case 'Mientras': expr(n.cond, amb); sent(n.cuerpo, new Ambito(amb)); return;
      case 'Repetir': {
        const t = expr(n.cuantas, amb);
        if (!esNum(t)) err(n, `«repetir» necesita un número y recibió ${tipoATexto(t)}`);
        sent(n.cuerpo, new Ambito(amb)); return;
      }
      case 'Para': {
        const it = expr(n.iterable, amb);
        let elem = T.cualquiera;
        if (it.k === 'lista') elem = it.elem;
        else if (it.k === 'texto') elem = T.texto;
        else if (it.k !== 'cualquiera' && it.k !== 'dic')
          err(n, `no se puede recorrer un valor de tipo ${tipoATexto(it)}`, 'usa una lista, un texto o rango(n)');
        const sub = new Ambito(amb);
        sub.declarar(n.nombre, elem, false);
        bloqueTipos(n.cuerpo, sub);
        return;
      }
      case 'Devolver': {
        const t = n.valor ? expr(n.valor, amb) : T.nulo;
        amb.hayRetorno = true;
        let a = amb; while (a) { a.hayRetorno = true; if (a.retornoEsperado !== (a.padre ? a.padre.retornoEsperado : null)) break; a = a.padre; }
        const esperado = amb.retornoEsperado;
        if (esperado && !compatible(esperado, t))
          err(n, `esta función debe devolver ${tipoATexto(esperado)} y devuelve ${tipoATexto(t)}`);
        return;
      }
      case 'Romper': case 'Continuar': return;
      case 'Lanzar': expr(n.valor, amb); return;
      case 'Intentar': {
        sent(n.cuerpo, new Ambito(amb));
        if (n.captura) {
          const dentro = new Ambito(amb);
          // Lo que llega a «capturar» puede ser un error del motor o cualquier
          // valor que el programa haya lanzado, así que el tipo es «cualquiera»
          // salvo que el programa solo lance errores; no se puede saber aquí.
          if (n.nombreError) dentro.declarar(n.nombreError, T.cualquiera, false);
          sent(n.captura, dentro);
        }
        if (n.finalmente) sent(n.finalmente, new Ambito(amb));
        return;
      }
      case 'ExprSent': expr(n.expr, amb); return;
      // El enlazador ya lo resolvió; aquí no hay nada que comprobar.
      case 'Usar': return;
      default: return;
    }
  }

  function expr(n, amb) {
    switch (n.tipo) {
      case 'Literal': return n.tipoLit;
      case 'Interpolacion': for (const q of n.partes) expr(q, amb); return T.texto;
      case 'Variable': {
        const v = amb.buscar(n.nombre);
        if (!v) return err(n, `«${n.nombre}» no está definida`, pistaNombre(n.nombre, amb));
        // El alias de un módulo no es un valor: no se puede pasar, ni guardar,
        // ni comparar. Solo sirve para «m.algo», y eso se resuelve al compilar.
        // Convertirlo en un diccionario al vuelo sería cómodo y traería de vuelta
        // el problema de los ciclos: el diccionario solo existiría cuando el
        // módulo hubiera terminado de ejecutarse.
        if (v.tipo && v.tipo.k === 'modulo')
          return err(n, `«${n.nombre}» es un módulo, no un valor`,
            `sirve para «${n.nombre}.algo»; si necesitas pasar una de sus funciones, tráela con «usar … de …»`);
        marcarUso(v);
        return v.tipo;
      }
      case 'Asignacion': {
        const tv = expr(n.valor, amb);
        if (n.destino.tipo === 'Variable') {
          const v = amb.buscar(n.destino.nombre);
          if (!v) return err(n, `«${n.destino.nombre}» no está definida`, pistaNombre(n.destino.nombre, amb));
          // Estos dos salen y no siguen: decir además «es funcion(…) y se le
          // asigna entero» sobre un nombre que no se puede asignar es ruido.
          if (v.deModulo) return err(n, `«${n.destino.nombre}» viene de «${v.deModulo}» y no se puede cambiar desde aquí`,
            'lo que exporta un módulo solo lo cambia ese módulo');
          if (v.tipo && v.tipo.k === 'modulo') return err(n, `«${n.destino.nombre}» es un módulo, no una variable`);
          if (v.esFijo) err(n, `«${n.destino.nombre}» es fijo y no se puede reasignar`, 'decláralo con «var» si debe cambiar');
          if (n.op === '=' && !compatible(v.tipo, tv))
            err(n, `«${n.destino.nombre}» es ${tipoATexto(v.tipo)} y se le asigna ${tipoATexto(tv)}`);
          return v.tipo;
        }
        if (n.destino.tipo === 'Propiedad' && n.destino.obj.tipo === 'Variable') {
          const mod = amb.buscar(n.destino.obj.nombre);
          if (mod && mod.tipo && mod.tipo.k === 'modulo')
            return err(n, `«${n.destino.obj.nombre}.${n.destino.nombre}» viene de «${mod.tipo.ruta}» y no se puede cambiar desde aquí`,
              'lo que exporta un módulo solo lo cambia ese módulo');
        }
        expr(n.destino, amb);
        return tv;
      }
      case 'Unario': {
        const t = expr(n.expr, amb);
        // «-a» sobre un arreglo le cambia el signo a todos sus números.
        if (n.op === '-') {
          if (t.k === 'arreglo') return T.arreglo;
          if (!esNum(t)) err(n, `«-» necesita un número y recibió ${tipoATexto(t)}`);
          return t;
        }
        return T.bool;
      }
      case 'Binario': {
        const a = expr(n.izq, amb), b = expr(n.der, amb);
        const op = n.op;
        if (op === 'o' || op === 'y') return T.bool;
        if (['==', '!='].includes(op)) return T.bool;
        if (['<', '<=', '>', '>='].includes(op)) {
          // Dos fechas se ordenan. Una fecha con cualquier otra cosa no, y eso
          // se dice aquí y no al ejecutar: es la mitad del valor de que «fecha»
          // sea un tipo. La VM lo vuelve a comprobar para lo que llegue como
          // «cualquiera», y las dos reglas tienen que decir lo mismo.
          const dosFechas = a.k === 'fecha' && b.k === 'fecha';
          if (!(dosFechas || (esNum(a) && esNum(b)) || (a.k === 'texto' && b.k === 'texto') ||
                a.k === 'cualquiera' || b.k === 'cualquiera'))
            err(n, `no se pueden comparar ${tipoATexto(a)} y ${tipoATexto(b)} con «${op}»`,
              // La misma pista que da la VM. Si las dos reglas dicen cosas
              // distintas, el programa recibe un consejo u otro según por
              // dónde entre, y eso es peor que no dar ninguno.
              (a.k === 'tabla' || b.k === 'tabla')
                ? 'una tabla no tiene orden; para ordenar sus filas usa ordenarPor(t, "columna")'
                : (a.k === 'fecha' || b.k === 'fecha')
                  ? 'una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)' : null);
          return T.bool;
        }
        // Un arreglo se opera con otro arreglo o con un número, y el resultado
        // es un arreglo. Esto es lo que deja escribir «a * 2 + b» en vez de un
        // bucle, y que el verificador lo tipe sin ejecutar nada.
        if (a.k === 'arreglo' || b.k === 'arreglo') {
          if (['+', '-', '*', '/', '//', '%', '**'].includes(op)) {
            const otro = a.k === 'arreglo' ? b : a;
            if (otro.k === 'arreglo' || esNum(otro) || otro.k === 'cualquiera') return T.arreglo;
            err(n, `«${op}»: un arreglo se opera con otro arreglo o con un número, y llegó ${tipoATexto(otro)}`,
              'para pasar una lista a arreglo usa arreglo(lista)');
            return T.arreglo;
          }
        }
        if (op === '+') {
          if (a.k === 'texto' || b.k === 'texto') {
            if (a.k !== 'texto' || b.k !== 'texto') {
              if (a.k !== 'cualquiera' && b.k !== 'cualquiera')
                err(n, `no se puede sumar ${tipoATexto(a)} y ${tipoATexto(b)}`,
                  `en Python esto también falla; convierte con texto(...) — por ejemplo: "n = " + texto(n)`);
            }
            return T.texto;
          }
          if (a.k === 'lista' && b.k === 'lista') return a;
        }
        if (!esNum(a) || !esNum(b)) {
          if (op === '+') err(n, `no se puede sumar ${tipoATexto(a)} y ${tipoATexto(b)}`,
            'convierte a texto con texto(...) o revisa los tipos');
          else err(n, `«${op}» necesita números y recibió ${tipoATexto(a)} y ${tipoATexto(b)}`);
          return T.cualquiera;
        }
        if (op === '/') return T.real;
        if (op === '//' || op === '%') return (a.k === 'entero' && b.k === 'entero') ? T.entero : T.real;
        if (a.k === 'cualquiera' || b.k === 'cualquiera') return T.cualquiera;
        return (a.k === 'entero' && b.k === 'entero') ? T.entero : T.real;
      }
      case 'Llamada': {
        const ft = expr(n.callee, amb);
        const args = n.args.map(a => expr(a, amb));
        if (ft.k === 'funcion' && ft.params) {
          if (ft.params.length !== args.length) {
            const nom = n.callee.tipo === 'Variable' ? `«${n.callee.nombre}»` : 'la función';
            err(n, `${nom} espera ${ft.params.length} argumento(s) y recibió ${args.length}`);
          } else {
            for (let i = 0; i < args.length; i++)
              if (!compatible(ft.params[i], args[i]))
                err(n.args[i], `argumento ${i + 1}: se esperaba ${tipoATexto(ft.params[i])} y llegó ${tipoATexto(args[i])}`);
          }
          return ft.ret;
        }
        if (ft.k !== 'cualquiera' && ft.k !== 'funcion')
          err(n, `${tipoATexto(ft)} no es una función; no se puede llamar`);
        // Una función de número variable de argumentos no deja comprobar lo que
        // entra, pero sí se sabe lo que sale. Devolver «cualquiera» aquí tiraba
        // esa información y dejaba sin comprobar todo lo que viniera después.
        if (ft.k === 'funcion' && ft.ret) return ft.ret;
        return T.cualquiera;
      }
      case 'Indice': {
        const o = expr(n.obj, amb), i = expr(n.indice, amb);
        if (o.k === 'lista') { if (!esNum(i)) err(n, `el índice de una lista debe ser entero y es ${tipoATexto(i)}`); return o.elem; }
        if (o.k === 'texto') return T.texto;
        if (o.k === 'dic') return o.valor;
        if (o.k !== 'cualquiera') err(n, `no se puede indexar un valor de tipo ${tipoATexto(o)}`);
        return T.cualquiera;
      }
      case 'Propiedad': {
        // «m.algo» con m un alias de módulo se resuelve aquí, antes de mirar m
        // como expresión: un módulo no es un valor y evaluarlo daría un error.
        // Un local o un parámetro con ese nombre manda sobre el alias.
        const mod = n.obj.tipo === 'Variable' ? amb.buscar(n.obj.nombre) : null;
        if (mod && mod.tipo && mod.tipo.k === 'modulo') {
          const t = mod.tipo.exporta.get(n.nombre);
          if (t === undefined)
            return err(n, `«${mod.tipo.ruta}» no exporta «${n.nombre}»`,
              mod.tipo.exporta.size ? 'exporta: ' + [...mod.tipo.exporta.keys()].join(', ')
                                    : 'no exporta nada: márcalo con «publico»');
          return t;
        }
        const o = expr(n.obj, amb);
        // dic<texto,real> accedido con «.» debe seguir siendo real, no «cualquiera»
        if (o.k === 'dic') return o.valor;
        return T.cualquiera;
      }
      case 'ListaLit': {
        if (!n.items.length) return T.lista(T.cualquiera);
        const ts = n.items.map(x => expr(x, amb));
        let e = ts[0];
        for (const t of ts) if (!compatible(e, t)) { if (compatible(t, e)) e = t; else { e = T.cualquiera; break; } }
        return T.lista(e);
      }
      case 'DicLit': {
        for (const p of n.pares) { expr(p.clave, amb); expr(p.valor, amb); }
        return T.dic(T.cualquiera, T.cualquiera);
      }
      case 'FuncionAnon': {
        const sub = new Ambito(amb, n.retorno || null);
        for (const p of n.params) sub.declarar(p.nombre, p.anotacion || T.cualquiera, false);
        bloqueTipos(n.cuerpo, sub);
        return T.fn(n.params.map(p => p.anotacion || T.cualquiera), n.retorno || T.cualquiera);
      }
      default: return T.cualquiera;
    }
  }

  // «candidatos» permite buscar parecidos fuera del ámbito: los nombres de los
  // eDSL, que no están declarados aquí pero existen en alguna parte.
  function sugerir(nombre, amb, candidatos) {
    const cands = candidatos ? candidatos.slice() : [];
    let a = amb; while (a) { for (const k of a.vars.keys()) cands.push(k); a = a.padre; }
    let mejor = null, mejorD = 1e9;
    const dist = (x, y) => {
      const m = x.length, k = y.length;
      const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(k).fill(0)]);
      for (let j = 0; j <= k; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= k; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      return d[m][k];
    };
    const bajo = nombre.toLowerCase();
    for (const c of cands) { const dd = dist(bajo, c.toLowerCase()); if (dd < mejorD) { mejorD = dd; mejor = c; } }
    if (mejor && mejorD <= Math.max(2, Math.floor(nombre.length / 3))) return `¿querías decir «${mejor}»?`;
    return null;
  }

  // El nombre existe, pero vive en un eDSL que este archivo no ha importado.
  // Se dice qué línea escribir, con el nombre tal cual, para que se pueda
  // copiar. Si está en más de uno, se nombran todos y decide quien escribe.
  function enQueEdsl(nombre) {
    if (!indiceEdsl) return null;
    const eds = indiceEdsl.get(nombre);
    if (!eds || !eds.length) return null;
    if (eds.length === 1)
      return `está en el eDSL «${eds[0]}»: añade arriba  usar ${nombre} de "${eds[0]}"`;
    return `está en los eDSL ${eds.map(e => `«${e}»`).join(' y ')}: añade arriba ` +
      eds.map(e => `usar ${nombre} de "${e}"`).join('  ·  ');
  }
  // La pista de un nombre que no se encuentra, en orden de utilidad:
  //   1. el nombre existe tal cual en un eDSL → la línea exacta que falta
  //   2. se parece a algo del ámbito           → «¿querías decir?»
  //   3. se parece a algo de un eDSL           → las dos cosas a la vez
  // El tercer caso hacía falta: al mudar un nombre a un eDSL, escribirlo mal
  // dejaba de dar cualquier pista, y antes de la mudanza sí la daba.
  function pistaNombre(nombre, amb) {
    // Las constantes del lenguaje son un conjunto pequeño y cerrado, así que
    // cuando alguien escribe una que no existe se pueden nombrar todas.
    if (nombre.charAt(0) === '|') {
      const hay = Object.keys(globalesTipos).filter(k => k.charAt(0) === '|').sort();
      return hay.length
        ? `las constantes del lenguaje son ${hay.join(', ')}`
        : 'no hay constantes del lenguaje definidas';
    }
    const exacto = enQueEdsl(nombre);
    if (exacto) return exacto;
    const cerca = sugerir(nombre, amb);
    if (cerca) return cerca;
    if (!indiceEdsl || !indiceEdsl.size) return null;
    const p = sugerir(nombre, null, [...indiceEdsl.keys()]);
    if (!p) return null;
    const m = p.match(/«([^»]+)»/);
    const eds = m && indiceEdsl.get(m[1]);
    return eds ? `${p} — está en el eDSL «${eds[0]}»: usar ${m[1]} de "${eds[0]}"` : p;
  }

  registrarFunciones(ast.cuerpo, raiz);
  for (const s of ast.cuerpo) sent(s, raiz);

  // El aviso del interruptor, ya con el archivo entero recorrido.
  const usarClasico = ast.cuerpo.find(x => x.tipo === 'Usar' && x.todo && x.ruta === 'clasico');
  if (usarClasico && errores.length === 0) {
    const usados = [...clasicoUsado];
    if (!usados.length) {
      avisos.push(new ErrorFuente('nombres', '«usar "clasico"» aquí no hace nada',
        usarClasico.linea, usarClasico.col,
        'este archivo no usa ninguno de los nombres que trae; se puede borrar la línea'));
    } else if (usados.length <= 3 && indiceEdsl) {
      // Con tres o menos, la línea concreta dice de dónde sale cada cosa, y el
      // archivo deja de arrastrar un ámbito entero para tres funciones.
      const porEdsl = new Map();
      for (const i of usados) {
        const donde = i.edslOrigen;
        if (!donde) continue;
        if (!porEdsl.has(donde)) porEdsl.set(donde, []);
        porEdsl.get(donde).push(i.nombre);
      }
      if (porEdsl.size) {
        const lineas = [...porEdsl].map(([e, ns]) => `usar ${ns.sort().join(', ')} de "${e}"`);
        const traia = usados[0].cuantosTraia || 0;
        avisos.push(new ErrorFuente('nombres',
          `«usar "clasico"» trae ${traia} nombres y este archivo usa ${usados.length}`,
          usarClasico.linea, usarClasico.col, 'con esto basta:  ' + lineas.join('  ·  ')));
      }
    }
  }
  return { errores, avisos };
}

// ======================================================================
//  COMPILADOR  →  bytecode
// ======================================================================
function compilar(ast, nombreScript, enlace) {
  const { ErrorFuente } = MODULO_FRONT;
  // El enlace dice a qué global se refiere cada nombre libre. Sin él —un
  // programa de un solo archivo— cada nombre es el que pone, exactamente como
  // antes de que existieran los módulos.
  const enl = enlace || null;
  const gl = nombre => globalDeEnlace(enl, nombre);

  class Ctx {
    constructor(padre, tipo, nombre, aridad) {
      this.padre = padre; this.tipo = tipo;
      this.fn = new FuncionCompilada(nombre, aridad);
      this.locals = [{ nombre: '', prof: 0, capturada: false }]; // slot 0 = la propia función
      this.prof = 0;
      this.upvalues = [];
      this.bucles = [];
      // Bloques «intentar» que envuelven al punto que se está compilando. Sirve
      // para dos cosas al salir por devolver, romper o continuar: quitar los
      // manejadores que quedarían colgando, y ejecutar los «finalmente».
      this.protegidos = [];
    }
  }
  let c = new Ctx(null, 'script', nombreScript || 'principal', 0);
  c.fn.enlace = enl;

  const chunk = () => c.fn.chunk;
  const emit = (op, linea) => chunk().emitir(op, linea);
  function emitOp(op, arg, linea) { emit(op, linea); if (arg !== undefined && arg !== null) emit(arg, linea); }
  function emitCte(v, linea) { const i = chunk().cte(v); emitOp(OP.CONST, i, linea); return i; }
  function emitSalto(op, linea) { emit(op, linea); emit(0xffff, linea); return chunk().code.length - 1; }
  function parchear(pos) {
    const salto = chunk().code.length - pos - 1;
    chunk().code[pos] = salto;
  }
  function emitBucle(inicio, linea) {
    emit(OP.LOOP, linea);
    emit(chunk().code.length - inicio + 1, linea);
  }

  // Ejecuta los «finalmente» pendientes y quita los manejadores que quedarían
  // colgando, al salir de bloques protegidos por devolver, romper o continuar.
  // «hasta» es cuántos niveles de protección hay que deshacer.
  function salirDeProtegidos(hasta, linea, hayValorEnPila) {
    if (!c.protegidos.length) return;
    // El valor que ya está en la pila (el de «devolver») no es un local
    // declarado, pero sí ocupa un hueco: sin este marcador, un local dentro del
    // «finalmente» recibiría un número de casilla que no le corresponde.
    if (hayValorEnPila) c.locals.push({ nombre: ' salida', prof: c.prof, capturada: false });
    for (let i = c.protegidos.length - 1; i >= hasta; i--) {
      const pr = c.protegidos[i];
      for (let k = 0; k < pr.manejadores; k++) emit(OP.FIN_TRY, linea);
      if (pr.finalmente) cuerpoDe(pr.finalmente, linea);
    }
    if (hayValorEnPila) c.locals.pop();
  }
  // ¿Cuántos bloques protegidos hay que deshacer para salir del bucle actual?
  // Los que se abrieron ya dentro de él.
  function nivelProtegidoDelBucle() {
    let i = c.protegidos.length;
    while (i > 0 && c.protegidos[i - 1].nBucles >= c.bucles.length) i--;
    return i;
  }
  function cuerpoDe(bloqueNodo, linea) {
    ambitoAbrir();
    for (const s of bloqueNodo.cuerpo) sent(s);
    ambitoCerrar(linea);
  }

  function ambitoAbrir() { c.prof++; }
  function ambitoCerrar(linea) {
    c.prof--;
    while (c.locals.length > 1 && c.locals[c.locals.length - 1].prof > c.prof) {
      emit(c.locals[c.locals.length - 1].capturada ? OP.CLOSE_UP : OP.POP, linea);
      c.locals.pop();
    }
  }
  function declararLocal(nombre, linea) {
    if (c.prof === 0) return -1;
    for (let i = c.locals.length - 1; i >= 1; i--) {
      const l = c.locals[i];
      if (l.prof < c.prof) break;
      if (l.nombre === nombre) throw new ErrorFuente('compilación', `«${nombre}» ya existe en este bloque`, linea, 1);
    }
    c.locals.push({ nombre, prof: c.prof, capturada: false });
    if (c.locals.length > c.fn.maxSlots) c.fn.maxSlots = c.locals.length;
    return c.locals.length - 1;
  }
  function buscarLocal(ctx, nombre) {
    for (let i = ctx.locals.length - 1; i >= 1; i--) if (ctx.locals[i].nombre === nombre) return i;
    return -1;
  }
  // El «nombre» no lo usa el intérprete —le basta la ranura— pero sí el JIT:
  // una función compilada a JavaScript no tiene marco en la pila de la máquina,
  // así que una ranura no le dice nada y un nombre sí.
  function addUpvalue(ctx, idx, esLocal, nombre) {
    for (let i = 0; i < ctx.upvalues.length; i++)
      if (ctx.upvalues[i].idx === idx && ctx.upvalues[i].esLocal === esLocal) return i;
    ctx.upvalues.push({ idx, esLocal, nombre });
    ctx.fn.nUpvalues = ctx.upvalues.length;
    return ctx.upvalues.length - 1;
  }
  // ¿Hay un local o un parámetro con ese nombre, aquí o en una función de
  // fuera? No marca nada como capturado, al revés que buscarUpvalue: solo
  // sirve para decidir si un nombre puede ser el alias de un módulo.
  function visibleComoLocal(ctx, nombre) {
    for (let x = ctx; x; x = x.padre) if (buscarLocal(x, nombre) !== -1) return true;
    return false;
  }
  function buscarUpvalue(ctx, nombre) {
    if (!ctx.padre) return -1;
    const l = buscarLocal(ctx.padre, nombre);
    if (l !== -1) { ctx.padre.locals[l].capturada = true; return addUpvalue(ctx, l, true, nombre); }
    const u = buscarUpvalue(ctx.padre, nombre);
    if (u !== -1) return addUpvalue(ctx, u, false, nombre);
    return -1;
  }

  // ---- sentencias
  function sent(n) {
    switch (n.tipo) {
      case 'DeclVar': {
        if (n.valor) expr(n.valor); else emit(OP.NULO, n.linea);
        if (c.prof === 0) emitOp(OP.DEF_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
        else declararLocal(n.nombre, n.linea);
        return;
      }
      case 'DeclFuncion': {
        if (c.prof > 0) declararLocal(n.nombre, n.linea);
        funcion(n, n.nombre);
        if (c.prof === 0) emitOp(OP.DEF_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
        return;
      }
      case 'Bloque': ambitoAbrir(); for (const s of n.cuerpo) sent(s); ambitoCerrar(n.linea); return;
      case 'Si': {
        expr(n.cond);
        const aElse = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.entonces);
        const aFin = emitSalto(OP.JMP, n.linea);
        parchear(aElse);
        emit(OP.POP, n.linea);
        if (n.sino) sent(n.sino);
        parchear(aFin);
        return;
      }
      case 'Mientras': {
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        expr(n.cond);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.cuerpo);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        return;
      }
      case 'Repetir': {
        ambitoAbrir();
        expr(n.cuantas);
        const sTope = declararLocal(' tope', n.linea);
        emitCte(0, n.linea);
        const sI = declararLocal(' i', n.linea);
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emitOp(OP.GET_LOCAL, sTope, n.linea);
        emit(OP.LT, n.linea);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        sent(n.cuerpo);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitOp(OP.GET_LOCAL, sI, n.linea); emitCte(1, n.linea); emit(OP.ADD, n.linea);
        emitOp(OP.SET_LOCAL, sI, n.linea); emit(OP.POP, n.linea);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        ambitoCerrar(n.linea);
        return;
      }
      case 'Para': {
        ambitoAbrir();
        expr(n.iterable);
        const sIter = declararLocal(' iter', n.linea);
        emitCte(0, n.linea);
        const sI = declararLocal(' i', n.linea);
        emitOp(OP.GET_LOCAL, sIter, n.linea); emit(OP.LEN, n.linea);
        const sLen = declararLocal(' len', n.linea);
        const inicio = chunk().code.length;
        c.bucles.push({ inicio, rompes: [], continuas: [], prof: c.prof });
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emitOp(OP.GET_LOCAL, sLen, n.linea);
        emit(OP.LT, n.linea);
        const salir = emitSalto(OP.JMP_FALSE, n.linea);
        emit(OP.POP, n.linea);
        ambitoAbrir();
        emitOp(OP.GET_LOCAL, sIter, n.linea);
        emitOp(OP.GET_LOCAL, sI, n.linea);
        emit(OP.IDX_GET, n.linea);
        declararLocal(n.nombre, n.linea);
        for (const s of n.cuerpo.cuerpo) sent(s);
        ambitoCerrar(n.linea);
        for (const k of c.bucles[c.bucles.length - 1].continuas) parchear(k);
        emitOp(OP.GET_LOCAL, sI, n.linea); emitCte(1, n.linea); emit(OP.ADD, n.linea);
        emitOp(OP.SET_LOCAL, sI, n.linea); emit(OP.POP, n.linea);
        emitBucle(inicio, n.linea);
        parchear(salir);
        emit(OP.POP, n.linea);
        for (const r of c.bucles.pop().rompes) parchear(r);
        ambitoCerrar(n.linea);
        return;
      }
      case 'Devolver': {
        if (c.tipo === 'script') throw new ErrorFuente('compilación', '«devolver» solo puede ir dentro de una función', n.linea, n.col);
        if (n.valor) expr(n.valor); else emit(OP.NULO, n.linea);
        salirDeProtegidos(0, n.linea, true);
        emit(OP.RET, n.linea);
        return;
      }
      case 'Romper': {
        if (!c.bucles.length) throw new ErrorFuente('compilación', '«romper» fuera de un bucle', n.linea, n.col);
        const b = c.bucles[c.bucles.length - 1];
        salirDeProtegidos(nivelProtegidoDelBucle(), n.linea, false);
        for (let i = c.locals.length - 1; i >= 1 && c.locals[i].prof > b.prof; i--) emit(OP.POP, n.linea);
        b.rompes.push(emitSalto(OP.JMP, n.linea));
        return;
      }
      case 'Continuar': {
        if (!c.bucles.length) throw new ErrorFuente('compilación', '«continuar» fuera de un bucle', n.linea, n.col);
        const b = c.bucles[c.bucles.length - 1];
        salirDeProtegidos(nivelProtegidoDelBucle(), n.linea, false);
        for (let i = c.locals.length - 1; i >= 1 && c.locals[i].prof > b.prof; i--) emit(OP.POP, n.linea);
        b.continuas.push(emitSalto(OP.JMP, n.linea));
        return;
      }

      // ── intentar / capturar / finalmente ────────────────────────────────
      // Los manejadores se apilan de fuera hacia dentro: primero el del
      // «finalmente», que tiene que correr aunque falle el propio «capturar».
      // El «finalmente» se emite dos veces, una por cada camino de salida, que
      // es como lo resolvió CPython a partir de la 3.11 y evita tener que
      // llevar «acciones pendientes» dentro de la máquina.
      case 'Intentar': {
        const conFin = !!n.finalmente;
        const saltoFin = conFin ? emitSalto(OP.TRY, n.linea) : null;
        const saltoCap = n.captura ? emitSalto(OP.TRY, n.linea) : null;

        c.protegidos.push({
          manejadores: (conFin ? 1 : 0) + (n.captura ? 1 : 0),
          finalmente: n.finalmente,
          nBucles: c.bucles.length,
        });
        cuerpoDe(n.cuerpo, n.linea);
        const marco = c.protegidos[c.protegidos.length - 1];

        if (n.captura) { emit(OP.FIN_TRY, n.linea); marco.manejadores--; }
        const alFinal = emitSalto(OP.JMP, n.linea);

        if (n.captura) {
          parchear(saltoCap);
          // La máquina ha dejado el valor lanzado justo aquí.
          ambitoAbrir();
          if (n.nombreError) declararLocal(n.nombreError, n.linea);
          else emit(OP.POP, n.linea);
          for (const st of n.captura.cuerpo) sent(st);
          ambitoCerrar(n.linea);
        }
        parchear(alFinal);
        c.protegidos.pop();

        if (conFin) {
          emit(OP.FIN_TRY, n.linea);
          cuerpoDe(n.finalmente, n.linea);          // camino normal
          const saltarExcepcional = emitSalto(OP.JMP, n.linea);

          parchear(saltoFin);                        // camino excepcional
          ambitoAbrir();
          const slot = declararLocal(' lanzado', n.linea);
          cuerpoDe(n.finalmente, n.linea);
          emitOp(OP.GET_LOCAL, slot, n.linea);
          emit(OP.LANZAR, n.linea);
          ambitoCerrar(n.linea);
          parchear(saltarExcepcional);
        }
        return;
      }

      case 'Lanzar': {
        expr(n.valor);
        emit(OP.LANZAR, n.linea);
        return;
      }
      case 'ExprSent': expr(n.expr); emit(OP.POP, n.linea); return;

      // ── usar ─────────────────────────────────────────────────────────────
      // Una llamada a una nativa, no un opcode nuevo: así la tabla de
      // instrucciones no cambia y los .elb de antes siguen valiendo. El nombre
      // lleva un espacio delante, que es un carácter que el léxico no acepta
      // dentro de un identificador, así que ningún programa puede llamarla.
      // Cargar un módulo NO es una operación del lenguaje; es lo que el
      // compilador emite donde hay un «usar», y nada más.
      case 'Usar': {
        // Sin clave resuelta el enlazador ya apuntó el error; no se emite nada.
        if (!n.claveResuelta) return;
        emitOp(OP.GET_GLOBAL, chunk().cte(' usar'), n.linea);
        emitCte(n.claveResuelta, n.linea);
        emitOp(OP.CALL, 1, n.linea);
        emit(OP.POP, n.linea);
        return;
      }
      default: throw new ErrorFuente('compilación', `sentencia no soportada: ${n.tipo}`, n.linea || 1, n.col || 1);
    }
  }

  function funcion(n, nombre) {
    const sub = new Ctx(c, 'funcion', nombre, n.params.length);
    // El JIT traduce desde el AST, donde los nombres están sin enlazar. Si no
    // llevara el enlace, una función de un módulo compilada por el JIT leería
    // «sumar» en vez de «…/mates.esl\0sumar»: o no la encuentra, o encuentra la
    // de la biblioteca. Sería un fallo que solo aparece tras la llamada 40.
    sub.fn.enlace = enl;
    sub.fn.ast = n;
    sub.fn.nombresParams = n.params.map(p => p.nombre);
    c = sub;
    ambitoAbrir();
    for (const p of n.params) declararLocal(p.nombre, p.linea || n.linea);
    for (const s of n.cuerpo.cuerpo) sent(s);
    emit(OP.NULO, n.linea); emit(OP.RET, n.linea);
    const compilada = c.fn;
    const ups = c.upvalues;
    c = c.padre;
    // El JIT traduce desde el AST y no ve el fondo de constantes del bytecode,
    // así que el prototipo recién compilado y la lista de capturas se dejan
    // colgados del nodo. Sin esto el JIT no puede crear el cierre y tiene que
    // rendirse con la función de fuera entera, que costaba nueve veces más.
    n.proto = compilada;
    n.ups = ups;
    const idx = chunk().cte(compilada);
    emitOp(OP.CLOSURE, idx, n.linea);
    for (const u of ups) { emit(u.esLocal ? 1 : 0, n.linea); emit(u.idx, n.linea); }
  }

  // ---- expresiones
  function expr(n) {
    switch (n.tipo) {
      case 'Literal':
        if (n.valor === null) return emit(OP.NULO, n.linea);
        if (n.valor === true) return emit(OP.CIERTO, n.linea);
        if (n.valor === false) return emit(OP.FALSO, n.linea);
        return emitCte(n.valor, n.linea);
      case 'Interpolacion': {
        for (const q of n.partes) expr(q);
        emitOp(OP.CONCAT, n.partes.length, n.linea);
        return;
      }
      case 'Variable': {
        const l = buscarLocal(c, n.nombre);
        if (l !== -1) return emitOp(OP.GET_LOCAL, l, n.linea);
        const u = buscarUpvalue(c, n.nombre);
        if (u !== -1) return emitOp(OP.GET_UP, u, n.linea);
        return emitOp(OP.GET_GLOBAL, chunk().cte(gl(n.nombre)), n.linea);
      }
      case 'Asignacion': {
        const d = n.destino;
        if (n.op !== '=') {   //  x += v   →   x = x + v
          const binOp = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' }[n.op];
          return expr({ tipo: 'Asignacion', destino: d, op: '=', linea: n.linea, col: n.col,
            valor: { tipo: 'Binario', op: binOp, izq: d, der: n.valor, linea: n.linea, col: n.col } });
        }
        if (d.tipo === 'Variable') {
          expr(n.valor);
          const l = buscarLocal(c, d.nombre);
          if (l !== -1) return emitOp(OP.SET_LOCAL, l, n.linea);
          const u = buscarUpvalue(c, d.nombre);
          if (u !== -1) return emitOp(OP.SET_UP, u, n.linea);
          return emitOp(OP.SET_GLOBAL, chunk().cte(gl(d.nombre)), n.linea);
        }
        if (d.tipo === 'Indice') { expr(d.obj); expr(d.indice); expr(n.valor); return emit(OP.IDX_SET, n.linea); }
        if (d.tipo === 'Propiedad') {
          expr(d.obj);
          emitCte(d.nombre, n.linea);
          expr(n.valor);
          return emit(OP.IDX_SET, n.linea);
        }
        throw new ErrorFuente('compilación', 'destino de asignación no válido', n.linea, n.col);
      }
      case 'Unario':
        expr(n.expr);
        return emit(n.op === '-' ? OP.NEG : OP.NOT, n.linea);
      case 'Binario': {
        if (n.op === 'y') {
          expr(n.izq);
          const s = emitSalto(OP.JMP_FALSE, n.linea);
          emit(OP.POP, n.linea); expr(n.der); parchear(s); return;
        }
        if (n.op === 'o') {
          expr(n.izq);
          const s = emitSalto(OP.JMP_TRUE, n.linea);
          emit(OP.POP, n.linea); expr(n.der); parchear(s); return;
        }
        expr(n.izq); expr(n.der);
        const m = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '//': OP.IDIV, '%': OP.MOD, '**': OP.POW,
                    '==': OP.EQ, '!=': OP.NEQ, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE };
        return emit(m[n.op], n.linea);
      }
      case 'Llamada': {
        expr(n.callee);
        for (const a of n.args) expr(a);
        return emitOp(OP.CALL, n.args.length, n.linea);
      }
      case 'Indice': expr(n.obj); expr(n.indice); return emit(OP.IDX_GET, n.linea);
      case 'Propiedad': {
        // «m.algo» con m alias de módulo es un global de allí, resuelto aquí.
        // Un local o un parámetro con ese nombre manda: «fn f(m) { m.x }» es un
        // acceso a propiedad normal aunque haya un módulo llamado «m».
        const g = (n.obj.tipo === 'Variable' && !visibleComoLocal(c, n.obj.nombre))
          ? miembroDeEnlace(enl, n.obj.nombre, n.nombre) : null;
        if (g) return emitOp(OP.GET_GLOBAL, chunk().cte(g), n.linea);
        expr(n.obj);
        return emitOp(OP.PROP_GET, chunk().cte(n.nombre), n.linea);
      }
      case 'ListaLit': for (const x of n.items) expr(x); return emitOp(OP.LISTA, n.items.length, n.linea);
      case 'DicLit':
        for (const par of n.pares) { expr(par.clave); expr(par.valor); }
        return emitOp(OP.DIC, n.pares.length, n.linea);
      case 'FuncionAnon': return funcion(n, '<anónima>');
      default: throw new ErrorFuente('compilación', `expresión no soportada: ${n.tipo}`, n.linea || 1, n.col || 1);
    }
  }

  // Elevación: las funciones de nivel superior se definen primero, así se
  // pueden llamar desde arriba aunque se declaren más abajo.
  //
  // Los «usar» van en segundo lugar, y de ahí sale la resolución de los ciclos:
  // cuando A importa B y B importa A, A ya tiene definidas todas sus funciones
  // antes de que empiece B, así que B las ve. Lo que B no ve son los valores que
  // A calcula después, y eso se dice con un mensaje que nombra el ciclo.
  for (const s of ast.cuerpo) if (s.tipo === 'DeclFuncion') sent(s);
  for (const s of ast.cuerpo) if (s.tipo === 'Usar') sent(s);
  for (const s of ast.cuerpo) if (s.tipo !== 'DeclFuncion' && s.tipo !== 'Usar') sent(s);
  // El retorno implícito del final se atribuye a la última línea real, no a un
  // 9999 de relleno: se ve mejor en el desensamblador y la tabla de líneas no
  // pega un salto absurdo al serializarse.
  const ultima = chunk().lineas.length ? chunk().lineas[chunk().lineas.length - 1] : 1;
  emit(OP.NULO, ultima); emit(OP.RET, ultima);
  return c.fn;
}

// ------------------------------------------------------------- Desensamblador
function desensamblar(fn) {
  const out = [];
  const ch = fn.chunk;
  let i = 0;
  while (i < ch.code.length) {
    const inicio = i;
    const op = ch.code[i++];
    const nom = OP_NOMBRE[op] || `??${op}`;
    let args = '', extra = '';
    const nArgs = OPERANDOS[op] || 0;
    const vals = [];
    for (let k = 0; k < nArgs; k++) vals.push(ch.code[i++]);
    if (vals.length) args = vals.join(' ');
    if (op === OP.CONST || op === OP.GET_GLOBAL || op === OP.SET_GLOBAL || op === OP.DEF_GLOBAL || op === OP.PROP_GET) {
      const v = ch.consts[vals[0]];
      extra = `  ; ${typeof v === 'string' ? JSON.stringify(v) : String(v)}`;
    }
    if (op === OP.CLOSURE) {
      const sub = ch.consts[vals[0]];
      extra = `  ; ${sub.nombre}/${sub.aridad}`;
      for (let k = 0; k < sub.nUpvalues; k++) { const l = ch.code[i++], idx = ch.code[i++]; extra += ` [${l ? 'local' : 'up'} ${idx}]`; }
    }
    if (op === OP.JMP || op === OP.JMP_FALSE || op === OP.JMP_TRUE) extra = `  → ${i + vals[0]}`;
    if (op === OP.LOOP) extra = `  → ${i - vals[0]}`;
    out.push({ pos: inicio, linea: ch.lineas[inicio], texto: `${String(inicio).padStart(4, '0')}  ${nom.padEnd(11)} ${args}${extra}` });
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { OP, OP_NOMBRE, OPERANDOS, Chunk, FuncionCompilada, verificarTipos, compilar, desensamblar };
