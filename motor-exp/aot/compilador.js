// ============================================================================
//  Ñ sin runtime (motor-exp N4.1) — el compilador de Ñ a C.
//
//  Entra lo que ya salió del verificador y del compilador de siempre: el
//  bytecode (src/02-check-compile.js), con los ámbitos resueltos, las capturas
//  decididas y los saltos puestos. Sale C que se enlaza con aot/nrt.c y nada
//  más: un ejecutable sin Node, sin VM, sin JIT y sin recolector.
//
//  Por qué del bytecode y no del árbol: el bytecode YA dice qué es cada
//  variable (local, captura o global), dónde se cierra cada captura y adónde
//  salta cada «romper». Empezar de ahí es heredar las decisiones de la VM tal
//  cual, y por eso el ejecutable hace lo mismo que la VM.
//
//  Las tres etapas, separadas para que lo que viene en N4 se monte encima:
//    1. descodificar  — instrucciones, saltos, líneas.
//    2. analizar (IR-Ñ) — la profundidad de la pila y los manejadores de
//       «intentar» activos en cada instrucción. La pila tiene una altura fija
//       en cada punto (el verificador de bytecode lo garantiza), así que cada
//       casilla de la pila es una variable de C: r[0] el cierre, r[1…] los
//       parámetros, y encima los temporales. Aquí entrarán después los tipos
//       por casilla (números sin caja, i32/f32 de los tipos de máquina…).
//    3. emitir C     — cada instrucción en unas líneas de C, con el conteo de
//       referencias a la vista y los errores como saltos a una escalera de
//       limpieza (sin setjmp: ninguna referencia se pierde).
// ============================================================================
'use strict';

const OPS = ['CONST', 'NULO', 'CIERTO', 'FALSO', 'POP', 'DUP',
  'GET_LOCAL', 'SET_LOCAL', 'GET_GLOBAL', 'SET_GLOBAL', 'DEF_GLOBAL', 'GET_UP', 'SET_UP',
  'ADD', 'SUB', 'MUL', 'DIV', 'IDIV', 'MOD', 'POW', 'NEG', 'NOT',
  'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE',
  'JMP', 'JMP_FALSE', 'JMP_TRUE', 'LOOP',
  'CALL', 'CLOSURE', 'CLOSE_UP', 'RET',
  'LISTA', 'DIC', 'IDX_GET', 'IDX_SET', 'PROP_GET', 'CONCAT', 'LEN',
  'TRY', 'FIN_TRY', 'LANZAR'];
const OP = {}; OPS.forEach((n, i) => { OP[n] = i; });
const CON_OPERANDO = new Set(['CONST', 'GET_LOCAL', 'SET_LOCAL', 'GET_GLOBAL', 'SET_GLOBAL', 'DEF_GLOBAL', 'GET_UP', 'SET_UP',
  'JMP', 'JMP_FALSE', 'JMP_TRUE', 'LOOP', 'CALL', 'CLOSURE', 'LISTA', 'DIC', 'CONCAT', 'PROP_GET', 'TRY'].map(n => OP[n]));

class ErrorAOT extends Error {}
const esFuncion = c => c && typeof c === 'object' && c.chunk && Array.isArray(c.chunk.code);

// ── 1. descodificar ─────────────────────────────────────────────────────────
function descodificar(fn) {
  const code = fn.chunk.code, lineas = fn.chunk.lineas, consts = fn.chunk.consts;
  if (OPS.length !== 46) throw new ErrorAOT('la lista de instrucciones no coincide con la del motor');
  const ins = [];
  for (let i = 0; i < code.length;) {
    const pos = i, op = code[i++];
    if (!(op >= 0 && op < OPS.length)) throw new ErrorAOT(`«${fn.nombre}»: instrucción desconocida ${op}`);
    const it = { pos, op, nombre: OPS[op], arg: 0, linea: lineas[pos] | 0, ups: null };
    if (CON_OPERANDO.has(op)) it.arg = code[i++];
    if (op === OP.CLOSURE) {
      const sub = consts[it.arg];
      it.ups = [];
      for (let k = 0; k < sub.nUpvalues; k++) { it.ups.push([code[i], code[i + 1]]); i += 2; }
    }
    it.fin = i;
    if (op === OP.JMP || op === OP.JMP_FALSE || op === OP.JMP_TRUE || op === OP.TRY) it.destino = i + it.arg;
    if (op === OP.LOOP) it.destino = i - it.arg;
    ins.push(it);
  }
  return ins;
}

// ── 2. analizar: la pila y los manejadores en cada instrucción ─────────────
function efecto(it) {
  switch (it.op) {
    case OP.CONST: case OP.NULO: case OP.CIERTO: case OP.FALSO: case OP.DUP: case OP.GET_LOCAL:
    case OP.GET_GLOBAL: case OP.GET_UP: case OP.CLOSURE: return 1;
    case OP.POP: case OP.DEF_GLOBAL: case OP.CLOSE_UP: case OP.LANZAR: return -1;
    case OP.SET_LOCAL: case OP.SET_GLOBAL: case OP.SET_UP: case OP.NEG: case OP.NOT: case OP.JMP: case OP.JMP_FALSE:
    case OP.JMP_TRUE: case OP.LOOP: case OP.PROP_GET: case OP.LEN: case OP.TRY: case OP.FIN_TRY: return 0;
    case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.IDIV: case OP.MOD: case OP.POW:
    case OP.EQ: case OP.NEQ: case OP.LT: case OP.LE: case OP.GT: case OP.GE: case OP.IDX_GET: return -1;
    case OP.IDX_SET: return -2;
    case OP.CALL: return -it.arg;
    case OP.LISTA: case OP.CONCAT: return 1 - it.arg;
    case OP.DIC: return 1 - 2 * it.arg;
    case OP.RET: return -1;
    default: throw new ErrorAOT('instrucción sin efecto conocido ' + it.nombre);
  }
}
function analizar(fn, ins) {
  const porPos = new Map(ins.map((it, k) => [it.pos, k]));
  const est = new Array(ins.length).fill(null);   // { d, h: [{pos, d, destino}] }
  const pendientes = [];
  const llegar = (k, d, h, desde) => {
    if (k === undefined) throw new ErrorAOT(`«${fn.nombre}»: un salto no cae en una instrucción (desde ${desde})`);
    const e = est[k];
    if (!e) { est[k] = { d, h }; pendientes.push(k); return; }
    if (e.d !== d) throw new ErrorAOT(`«${fn.nombre}»: la pila no tiene la misma altura en la posición ${ins[k].pos} (${e.d} y ${d})`);
    const a = e.h.map(x => x.pos).join(','), b = h.map(x => x.pos).join(',');
    if (a !== b) throw new ErrorAOT(`«${fn.nombre}»: un «intentar» queda abierto de dos maneras en la posición ${ins[k].pos}`);
  };
  llegar(0, 1 + fn.aridad, [], 'inicio');
  let maxD = 1 + fn.aridad;
  while (pendientes.length) {
    const k = pendientes.pop(), it = ins[k], { d, h } = est[k];
    if (d > maxD) maxD = d;
    const d2 = d + efecto(it);
    if (d2 < 0) throw new ErrorAOT(`«${fn.nombre}»: la pila se queda vacía en ${it.pos}`);
    if (d2 + 1 > maxD) maxD = d2 + 1;
    const sig = porPos.get(it.fin);
    switch (it.op) {
      case OP.RET: case OP.LANZAR: break;
      case OP.JMP: case OP.LOOP: llegar(porPos.get(it.destino), d2, h, it.pos); break;
      case OP.JMP_FALSE: case OP.JMP_TRUE: llegar(porPos.get(it.destino), d2, h, it.pos); llegar(sig, d2, h, it.pos); break;
      case OP.TRY: {
        const man = { pos: it.pos, d, destino: it.destino };
        llegar(porPos.get(it.destino), d + 1, h, it.pos);
        llegar(sig, d, h.concat([man]), it.pos);
        break;
      }
      case OP.FIN_TRY: llegar(sig, d2, h.slice(0, -1), it.pos); break;
      default: llegar(sig, d2, h, it.pos);
    }
  }
  return { est, maxD, porPos };
}

// ── 3. emitir C ─────────────────────────────────────────────────────────────
const cTexto = s => '"' + Buffer.from(String(s), 'utf8').toString('latin1').replace(/[\\"]/g, c => '\\' + c)
  .replace(/[^\x20-\x7e]/g, c => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0')) + '"';
function cNumero(v) {
  if (Number.isNaN(v)) return '(0.0/0.0)';
  if (v === Infinity) return '(1.0/0.0)';
  if (v === -Infinity) return '(-1.0/0.0)';
  if (Object.is(v, -0)) return '(-0.0)';
  if (Number.isInteger(v) && Math.abs(v) < 2 ** 53) return v.toFixed(1);
  // hexadecimal: exacto, sin redondeo que discutir
  const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v);
  const hi = b.getUint32(0), lo = b.getUint32(4);
  const s = hi >>> 31, e = (hi >>> 20) & 0x7ff;
  const man = ((hi & 0xfffff).toString(16).padStart(5, '0') + lo.toString(16).padStart(8, '0'));
  if (e === 0) return `${s ? '-' : ''}0x0.${man}p-1022`;
  return `${s ? '-' : ''}0x1.${man}p${e - 1023}`;
}

const BINARIOS = {
  [OP.ADD]: ['n_sumar', '+'], [OP.SUB]: ['n_restar', '-'], [OP.MUL]: ['n_mult', '*'],
  [OP.DIV]: ['n_div', null], [OP.IDIV]: ['n_idiv', null], [OP.MOD]: ['n_mod', null], [OP.POW]: ['n_pot', null],
};
const COMPARA = { [OP.LT]: [0, '<'], [OP.LE]: [1, '<='], [OP.GT]: [2, '>'], [OP.GE]: [3, '>='] };

// Lo que la biblioteca de apoyo trae hoy: se lee de su propia tabla
// (aot/nrt.c y los .inc), así que no hay dos listas que puedan separarse. Lo
// demás de la biblioteca de Ñ se dice al compilar, en vez de fallar a medio
// programa. Un nombre de eDSL («ñ:texto\0mayusculas») se busca allí como
// «texto/mayusculas».
const fs = require('fs');
const path = require('path');
const NATIVAS_C = (() => {
  const s = new Set();
  for (const f of fs.readdirSync(__dirname)) if (/^nrt.*\.(c|inc)$/.test(f))
    for (const m of fs.readFileSync(path.join(__dirname, f), 'utf8').matchAll(/\{ "([^"]+)", -?\d+, [a-zA-Z_]\w* \}/g)) s.add(m[1]);
  return s;
})();
const SEP = '\u0000';
const nombreC = g => (g.startsWith('ñ:') && g.includes(SEP) ? g.slice(2).replace(SEP, '/') : g);
const rutaCorta = c => String(c).replace(/^.*[/\\]/, '') || String(c);
function noDefinida(n) {   // mensajeNoDefinida de src/06-modulos.js
  const i = String(n).indexOf(SEP);
  if (i < 0) return { msg: `«${n}» no está definida`, pista: null };
  return { msg: `«${n.slice(i + 1)}» de «${rutaCorta(n.slice(0, i))}» todavía no está definida`,
    pista: 'suele ser un ciclo de importación: el valor se usa antes de que su módulo llegue a calcularlo — las funciones sí se ven, los valores de nivel superior no' };
}
const VALORES_C = { '|PI': 'n_num(3.141592653589793)', '|E': 'n_num(2.718281828459045)', '|INFINITO': 'n_num(1.0/0.0)', ' faltante': 'n_faltante' };

function compilarAOT(fnPrincipal, opciones) {
  opciones = opciones || {};
  const globalesMotor = opciones.globalesMotor || new Set();   // lo que la VM trae definido
  // las funciones
  const fns = [], idFn = new Map();
  const visitar = f => {
    if (idFn.has(f)) return;
    idFn.set(f, fns.length); fns.push(f);
    for (const c of f.chunk.consts) if (esFuncion(c)) visitar(c);
  };
  visitar(fnPrincipal);
  const modulos = opciones.modulos || [];
  for (const m of modulos) visitar(m.fn);
  // las constantes de texto y los globales
  const textos = new Map(), globales = new Map(), definidos = new Set();
  const idTexto = s => { if (!textos.has(s)) textos.set(s, textos.size); return textos.get(s); };
  const idGlobal = s => { if (!globales.has(s)) globales.set(s, globales.size); return globales.get(s); };
  const decod = fns.map(f => descodificar(f));
  decod.forEach((ins, j) => {
    const consts = fns[j].chunk.consts;
    for (const it of ins) {
      if (it.op === OP.GET_GLOBAL || it.op === OP.SET_GLOBAL || it.op === OP.DEF_GLOBAL) idGlobal(consts[it.arg]);
      if (it.op === OP.DEF_GLOBAL) definidos.add(consts[it.arg]);
      if (it.op === OP.CONST && typeof consts[it.arg] === 'string') idTexto(consts[it.arg]);
      if (it.op === OP.PROP_GET) idTexto(consts[it.arg]);
    }
  });
  // lo que usa de la biblioteca y no está en C
  const faltan = [];
  for (const g of globales.keys()) {
    if (definidos.has(g)) continue;
    if (NATIVAS_C.has(nombreC(g)) || VALORES_C[g]) continue;
    if (globalesMotor.has(g)) faltan.push(g.includes(SEP) ? `«${g.split(SEP)[1]}» de "${g.split(SEP)[0].slice(2)}"` : `«${g}»`);
  }
  const corrutinas = fns.filter(f => f.corrutina).map(f => `«${f.nombre}»`);
  if (faltan.length || corrutinas.length) {
    const partes = [];
    if (faltan.length) partes.push('todavía no están en el ejecutable nativo: ' + faltan.join(', '));
    if (corrutinas.length) partes.push('los generadores y las funciones asíncronas todavía no: ' + corrutinas.join(', '));
    throw new ErrorAOT(partes.join(' · '));
  }

  const out = [];
  const E = s => out.push(s);
  E('/* Generado por motor-exp/util/n-compilar.js (Ñ sin runtime, N4.1). No editar a mano. */');
  E('#include "nrt.h"');
  E(`static NV K[${Math.max(1, textos.size)}];`);
  E(`static NV G[${Math.max(1, globales.size)}];`);
  E(`static unsigned char GD[${Math.max(1, globales.size)}];`);
  // el mensaje de «no está definida» de cada global, ya escrito
  const nombresG = [...globales.keys()].map(noDefinida);
  E(`static const char* const GM[${Math.max(1, nombresG.length)}] = { ${nombresG.length ? nombresG.map(x => cTexto(x.msg)).join(', ') : '""'} };`);
  E(`static const char* const GP[${Math.max(1, nombresG.length)}] = { ${nombresG.length ? nombresG.map(x => (x.pista ? cTexto(x.pista) : 'NULL')).join(', ') : 'NULL'} };`);
  fns.forEach((f, j) => E(`static NV F${j}(NCierre* yo, NV* args, int nargs);`));
  fns.forEach((f, j) => E(`static const NFn FN${j} = { ${cTexto(f.nombre)}, ${f.aridad}, ${f.minimos !== undefined ? f.minimos : -1}, ${f.nUpvalues}, ${f.corrutina ? 1 : 0}, F${j} };`));

  fns.forEach((f, j) => emitirFuncion(f, j, decod[j]));

  // los textos constantes, en UTF-16
  E('static void iniciar_constantes(void) {');
  for (const [s, k] of textos) {
    const u = []; for (let i = 0; i < s.length; i++) u.push(s.charCodeAt(i));
    if (u.length) E(`  { static const uint16_t s[] = { ${u.join(',')} }; K[${k}] = n_texto_inmortal_utf16(s, ${u.length}); }`);
    else E(`  K[${k}] = n_texto_inmortal_utf16(NULL, 0);`);
  }
  for (const [g, k] of globales) {
    if (NATIVAS_C.has(nombreC(g)) && !definidos.has(g)) E(`  G[${k}] = n_buscar_nativa(${cTexto(nombreC(g))}); GD[${k}] = 1;`);
    else if (VALORES_C[g] && !definidos.has(g)) E(`  G[${k}] = ${VALORES_C[g]}; GD[${k}] = 1;`);
  }
  E('}');
  E('int main(int argc, char** argv) {');
  E('  n_iniciar(argc, argv);');
  E('  iniciar_constantes();');
  if (modulos.length) {
    E(`  static const char* const claves[] = { ${modulos.map(m => cTexto(m.clave)).join(', ')} };`);
    E(`  static const NFn* const fns[] = { ${modulos.map(m => '&FN' + idFn.get(m.fn)).join(', ')} };`);
    E(`  n_registrar_modulos(claves, fns, ${modulos.length});`);
  }
  E('  NV c = n_cierre_nuevo(&FN0);');
  E('  NV r = F0((NCierre*)c.u.o, NULL, 0);');
  E('  if (N_FALLO(r)) n_fallo_final();');
  E('  n_dec(r); n_dec(c);');
  E('  fflush(stdout);');
  E('  return 0;');
  E('}');
  return { c: out.join('\n') + '\n', funciones: fns.length, textos: textos.size, globales: globales.size };

  function emitirFuncion(f, j, ins) {
    const consts = f.chunk.consts;
    const { est, maxD } = analizar(f, ins);
    const destinos = new Set(ins.filter(it => it.destino !== undefined).map(it => it.destino));
    // Cada casilla de la pila es una variable de C propia (s0, s1…), no un
    // arreglo: así gcc puede tener los números en registros. Solo las que se
    // capturan (CLOSURE) dejan que se tome su dirección.
    //
    // PRESTADAS: s0 (el cierre) y los parámetros que la función nunca
    // reasigna ni captura son de quien llamó, que los mantiene vivos durante la
    // llamada: no se incrementan al entrar ni se sueltan al salir.
    const escritos = new Set(), capturados = new Set();
    for (const it of ins) {
      if (it.op === OP.SET_LOCAL) escritos.add(it.arg);
      if (it.op === OP.CLOSURE) for (const [esLocal, idx] of it.ups) if (esLocal) capturados.add(idx);
    }
    const prestada = q => q <= f.aridad && !escritos.has(q) && !capturados.has(q);
    const escaleras = new Map();   // clave del manejador ('' = salir) → { max, hd, destino }
    const usarEscalera = (h, d) => {
      const m = h.length ? h[h.length - 1] : null;
      const clave = m ? String(m.pos) : '';
      const e = escaleras.get(clave) || { max: 0, hd: m ? m.d : 0, destino: m ? m.destino : null };
      if (d > e.max) e.max = d;
      escaleras.set(clave, e);
      return `L${clave || 'x'}_${d}`;
    };
    const cuerpo = [];
    const C = s => cuerpo.push('  ' + s);
    const r = i => `s${i}`;
    const arr = (desde, n) => (n ? `(NV[${n}]){ ${Array.from({ length: n }, (_, q) => r(desde + q)).join(', ')} }` : 'NULL');
    const soltar = (desde, hasta) => { let s = ''; for (let q = desde; q < hasta; q++) if (!prestada(q)) s += `n_dec(${r(q)}); `; return s; };
    let lineaPrevia = -1;
    for (let k = 0; k < ins.length; k++) {
      const it = ins[k], st = est[k];
      if (!st) continue;   // código al que no se llega (detrás de un «devolver»)
      const d = st.d;
      if (destinos.has(it.pos)) { cuerpo.push(`P${it.pos}:;`); lineaPrevia = -1; }
      if (it.linea !== lineaPrevia) { C(`M_->linea = ${it.linea};`); lineaPrevia = it.linea; }
      // al fallar: cerrar las capturas de lo que se va a soltar y bajar por la escalera
      const falla = () => {
        const m = st.h.length ? st.h[st.h.length - 1] : null;
        return `{ if (ab) n_up_cerrar(&ab, ${m ? m.d : 0}); goto ${usarEscalera(st.h, d)}; }`;
      };
      switch (it.op) {
        case OP.CONST: {
          const v = consts[it.arg];
          if (typeof v === 'number') C(`${r(d)} = n_num(${cNumero(v)});`);
          else if (typeof v === 'string') C(`${r(d)} = K[${idTexto(v)}];`);
          else if (v === null) C(`${r(d)} = n_nulo();`);
          else if (typeof v === 'boolean') C(`${r(d)} = n_bool(${v ? 1 : 0});`);
          else throw new ErrorAOT(`«${f.nombre}»: una constante que el ejecutable nativo no sabe guardar (${typeof v})`);
          break;
        }
        case OP.NULO: C(`${r(d)} = n_nulo();`); break;
        case OP.CIERTO: C(`${r(d)} = n_bool(1);`); break;
        case OP.FALSO: C(`${r(d)} = n_bool(0);`); break;
        case OP.POP: C(`n_dec(${r(d - 1)});`); break;
        case OP.DUP: C(`${r(d)} = n_inc(${r(d - 1)});`); break;
        case OP.GET_LOCAL: C(`${r(d)} = n_inc(${r(it.arg)});`); break;
        case OP.SET_LOCAL: if (it.arg !== d - 1) C(`n_asignar(&${r(it.arg)}, ${r(d - 1)});`); break;
        case OP.GET_GLOBAL: {
          const g = idGlobal(consts[it.arg]);
          C(`if (!GD[${g}]) { n_error(GM[${g}], GP[${g}]); ${falla()} }`);
          C(`${r(d)} = n_inc(G[${g}]);`);
          break;
        }
        case OP.SET_GLOBAL: {
          const g = idGlobal(consts[it.arg]);
          C(`if (!GD[${g}]) { n_error(GM[${g}], GP[${g}]); ${falla()} }`);
          C(`n_asignar(&G[${g}], ${r(d - 1)});`);
          break;
        }
        case OP.DEF_GLOBAL: {
          const g = idGlobal(consts[it.arg]);
          C(`{ NV v_ = G[${g}]; G[${g}] = ${r(d - 1)}; if (GD[${g}]) n_dec(v_); GD[${g}] = 1; }`);
          break;
        }
        case OP.GET_UP: C(`${r(d)} = n_inc(*yo->up[${it.arg}]->p);`); break;
        case OP.SET_UP: C(`n_asignar(yo->up[${it.arg}]->p, ${r(d - 1)});`); break;
        case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.IDIV: case OP.MOD: case OP.POW: {
          const [fnc, rap] = BINARIOS[it.op];
          const a = r(d - 2), b = r(d - 1);
          if (rap) C(`if (${a}.t == N_NUM && ${b}.t == N_NUM) ${a}.u.n = ${a}.u.n ${rap} ${b}.u.n; else {`);
          else C('{');
          C(`  NV t_ = ${fnc}(${a}, ${b}); if (N_FALLO(t_)) ${falla()}`);
          C(`  n_dec(${a}); n_dec(${b}); ${a} = t_; }`);
          break;
        }
        case OP.EQ: case OP.NEQ: {
          const a = r(d - 2), b = r(d - 1), neg = it.op === OP.NEQ ? '!' : '';
          C(`if (${a}.t == N_NUM && ${b}.t == N_NUM) ${a} = n_bool(${neg}(${a}.u.n == ${b}.u.n));`);
          C(`else { int q_ = ${neg}n_iguales(${a}, ${b}); n_dec(${a}); n_dec(${b}); ${a} = n_bool(q_); }`);
          break;
        }
        case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
          const [cod, rap] = COMPARA[it.op];
          const a = r(d - 2), b = r(d - 1);
          C(`if (${a}.t == N_NUM && ${b}.t == N_NUM) ${a} = n_bool(${a}.u.n ${rap} ${b}.u.n); else {`);
          C(`  NV t_ = n_cmp(${a}, ${b}, ${cod}); if (N_FALLO(t_)) ${falla()}`);
          C(`  n_dec(${a}); n_dec(${b}); ${a} = t_; }`);
          break;
        }
        case OP.NEG: {
          const a = r(d - 1);
          C(`if (${a}.t == N_NUM) ${a}.u.n = -${a}.u.n; else { NV t_ = n_neg(${a}); if (N_FALLO(t_)) ${falla()} n_dec(${a}); ${a} = t_; }`);
          break;
        }
        case OP.NOT: { const a = r(d - 1); C(`{ int q_ = !n_verdad(${a}); n_dec(${a}); ${a} = n_bool(q_); }`); break; }
        case OP.JMP: case OP.LOOP: C(`goto P${it.destino};`); break;
        case OP.JMP_FALSE: C(`if (!N_VERDAD(${r(d - 1)})) goto P${it.destino};`); break;
        case OP.JMP_TRUE: C(`if (N_VERDAD(${r(d - 1)})) goto P${it.destino};`); break;
        case OP.CALL: {
          const n = it.arg, base = d - n - 1;
          C(`{ NV t_ = n_llamar_r(${r(base)}, ${arr(base + 1, n)}, ${n}); if (N_FALLO(t_)) ${falla()}`);
          C(`  ${soltar(base, d)}${r(base)} = t_; }`);
          break;
        }
        case OP.CLOSURE: {
          const sub = consts[it.arg], js = idFn.get(sub);
          C(`{ NV c_ = n_cierre_nuevo(&FN${js}); NCierre* q_ = (NCierre*)c_.u.o;`);
          it.ups.forEach(([esLocal, idx], q) => {
            if (esLocal) C(`  q_->up[${q}] = n_up_capturar(&ab, &${r(idx)}, ${idx});`);
            else C(`  q_->up[${q}] = yo->up[${idx}]; N_RC_MAS(&yo->up[${idx}]->h);`);
          });
          C(`  ${r(d)} = c_; }`);
          break;
        }
        case OP.CLOSE_UP: C(`if (ab) n_up_cerrar(&ab, ${d - 1});`); C(`n_dec(${r(d - 1)});`); break;
        case OP.RET: {
          C(`if (ab) n_up_cerrar(&ab, 0);`);
          const t0 = prestada(d - 1) ? `n_inc(${r(d - 1)})` : r(d - 1);
          C(`{ NV t_ = ${t0}; ${soltar(0, d - 1)}n_marco_salir(); return t_; }`);
          break;
        }
        case OP.LISTA: { const n = it.arg; C(`${r(d - n)} = n_lista_tomar(${arr(d - n, n)}, ${n});`); break; }
        case OP.DIC: {
          const n = it.arg;
          C(`{ NV t_ = n_dic_de(${arr(d - 2 * n, 2 * n)}, ${n}); ${soltar(d - 2 * n, d)}${r(d - 2 * n)} = t_; }`);
          break;
        }
        case OP.IDX_GET: {
          const o = r(d - 2), i = r(d - 1);
          C(`{ NV t_ = n_idx_get(${o}, ${i}); if (N_FALLO(t_)) ${falla()} n_dec(${o}); n_dec(${i}); ${o} = t_; }`);
          break;
        }
        case OP.IDX_SET: {
          const o = r(d - 3), i = r(d - 2), v = r(d - 1);
          C(`{ NV t_ = n_idx_set(${o}, ${i}, ${v}); if (N_FALLO(t_)) ${falla()} n_dec(${o}); n_dec(${i}); ${o} = ${v}; }`);
          break;
        }
        case OP.PROP_GET: {
          const o = r(d - 1);
          C(`{ NV t_ = n_prop_get(${o}, K[${idTexto(consts[it.arg])}]); if (N_FALLO(t_)) ${falla()} n_dec(${o}); ${o} = t_; }`);
          break;
        }
        case OP.CONCAT: {
          const n = it.arg;
          C(`{ NV t_ = n_concat(${arr(d - n, n)}, ${n}); ${soltar(d - n, d)}${r(d - n)} = t_; }`);
          break;
        }
        case OP.LEN: {
          const o = r(d - 1);
          C(`{ NV t_ = n_len(${o}); if (N_FALLO(t_)) ${falla()} n_dec(${o}); ${o} = t_; }`);
          break;
        }
        case OP.TRY: case OP.FIN_TRY: break;   // los manejadores son estáticos: ver la escalera
        case OP.LANZAR: C(`n_lanzar(${r(d - 1)}); ${falla()}`); break;
        default: throw new ErrorAOT('instrucción sin traducir ' + it.nombre);
      }
    }
    // las escaleras de limpieza: soltar de la casilla más alta hacia abajo
    const pie = [];
    for (const [clave, e] of escaleras) {
      for (let q = e.max; q > e.hd; q--) pie.push(`L${clave || 'x'}_${q}:; ${prestada(q - 1) ? '' : `n_dec(${r(q - 1)});`}`);
      pie.push(`L${clave || 'x'}_${e.hd}:;`);
      if (clave) pie.push(`  ${r(e.hd)} = n_error_capturado(); goto P${e.destino};`);
      else pie.push('  n_marco_salir(); return N_ERR;');
    }
    E('');
    E(`/* ${f.nombre}/${f.aridad} */`);
    E(`static NV F${j}(NCierre* yo, NV* args, int nargs) {`);
    E(`  NV ${Array.from({ length: maxD + 1 }, (_, q) => r(q)).join(', ')}; NUp* ab = NULL; (void)nargs; (void)ab; (void)args;`);
    E(`  n_marco_entrar(${cTexto(f.nombre)}, ${ins.length ? ins[0].linea : 0});`);
    E('  NMarco* M_ = &n_hilo.marcos[n_hilo.nmarcos - 1];');
    E(`  ${r(0)} = ${prestada(0) ? 'n_obj(yo)' : 'n_inc(n_obj(yo))'};`);
    for (let q = 0; q < f.aridad; q++) E(`  ${r(q + 1)} = ${prestada(q + 1) ? `args[${q}]` : `n_inc(args[${q}])`};`);
    for (const l of cuerpo) E(l);
    for (const l of pie) E(l);
    E('}');
  }
}

module.exports = { compilarAOT, ErrorAOT, NATIVAS_C };
