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
const { leerCabecera } = require('../util/cabecera-c.js');

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
  // (motor-exp N4.10) lo que el programa enlaza de C
  const enl = buscarEnlaces(fns, decod, opciones.leerArchivo || (r => fs.readFileSync(r, 'utf8')));
  // lo que usa de la biblioteca y no está en C
  const faltan = [];
  for (const g of globales.keys()) {
    if (definidos.has(g)) continue;
    if (g === G_NATIVA || g === G_CABECERA || g === G_SIN) continue;
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
  E('/* Generado por motor/util/n-compilar.js (Ñ sin runtime, N4.1). No editar a mano. */');
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
  emitirEnlaces(enl, E, cTexto, globales.has(G_NATIVA) || globales.has(G_CABECERA));

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
    else if (g === G_NATIVA && !definidos.has(g)) E(`  G[${k}] = n_nativa_nueva("nativa", -1, NNAT_nativa, NULL); GD[${k}] = 1;`);
    else if (g === G_CABECERA && !definidos.has(g)) E(`  G[${k}] = n_nativa_nueva("cabeceraNativa", 2, NNAT_cabecera, NULL); GD[${k}] = 1;`);
  }
  E('}');
  // (motor-exp N4.6) una biblioteca de C en vez de un programa
  if (opciones.biblioteca) {
    const b = emitirBiblioteca(opciones.biblioteca, { E, idGlobal, modulos, idFn, cTexto });
    return { c: out.join('\n') + '\n', h: b.h, py: b.py, exporta: b.exporta, funciones: fns.length, textos: textos.size, globales: globales.size, enlazar: enl.bibliotecas };
  }
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
  return { c: out.join('\n') + '\n', funciones: fns.length, textos: textos.size, globales: globales.size, enlazar: enl.bibliotecas };

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
    // (motor-exp N4.11) dentro de «sinComprobar { … }»: el bytecode trae una marca
    // al entrar y otra al salir (GET_GLOBAL « sinComprobar», CONST 1|0, CALL 1, POP);
    // lo que queda entre las dos, en el orden del código, va sin comprobar
    let sinCom = 0;
    const marca = k => {
      const a = ins[k], b = ins[k + 1], c = ins[k + 2], e = ins[k + 3];
      return a && b && c && e && a.op === OP.GET_GLOBAL && consts[a.arg] === G_SIN && b.op === OP.CONST &&
        typeof consts[b.arg] === 'number' && c.op === OP.CALL && c.arg === 1 && e.op === OP.POP ? consts[b.arg] : null;
    };
    for (let k = 0; k < ins.length; k++) {
      const it = ins[k], st = est[k];
      if (!st) continue;   // código al que no se llega (detrás de un «devolver»)
      const mk = marca(k);
      if (mk !== null) {
        for (let q = k; q < k + 4; q++) if (destinos.has(ins[q].pos)) { cuerpo.push(`P${ins[q].pos}:;`); lineaPrevia = -1; }
        sinCom = Math.max(0, sinCom + (mk === 1 ? 1 : -1));
        k += 3;
        continue;
      }
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
          const [fnc, rap0] = BINARIOS[it.op];
          const a = r(d - 2), b = r(d - 1);
          // (motor-exp N4.11) sin comprobar: dividir entre cero ya no es un error
          // (da lo que dé la cuenta: infinito o NaN, como en C)
          const rap = rap0 || (sinCom && it.op === OP.DIV ? '/' : null);
          if (sinCom && (it.op === OP.IDIV || it.op === OP.MOD)) {
            const cuenta = it.op === OP.IDIV ? `floor(${a}.u.n / ${b}.u.n)` : `fmod(fmod(${a}.u.n, ${b}.u.n) + ${b}.u.n, ${b}.u.n)`;
            C(`if (${a}.t == N_NUM && ${b}.t == N_NUM) ${a}.u.n = ${cuenta}; else {`);
          } else if (rap) C(`if (${a}.t == N_NUM && ${b}.t == N_NUM) ${a}.u.n = ${a}.u.n ${rap} ${b}.u.n; else {`);
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
          // (motor-exp N4.11) sin comprobar: una lista con un número va directa a su casilla
          if (sinCom) C(`if (${o}.t == N_OBJ && ${o}.u.o->clase == NC_LISTA && ${i}.t == N_NUM) { NLista* l_ = (NLista*)${o}.u.o; NV t_ = n_inc(l_->v[(int64_t)(${i}.u.n < 0 ? (double)l_->n + ${i}.u.n : ${i}.u.n)]); n_dec(${o}); ${o} = t_; } else`);
          C(`{ NV t_ = n_idx_get(${o}, ${i}); if (N_FALLO(t_)) ${falla()} n_dec(${o}); n_dec(${i}); ${o} = t_; }`);
          break;
        }
        case OP.IDX_SET: {
          const o = r(d - 3), i = r(d - 2), v = r(d - 1);
          if (sinCom) C(`if (${o}.t == N_OBJ && ${o}.u.o->clase == NC_LISTA && ${i}.t == N_NUM) { NLista* l_ = (NLista*)${o}.u.o; double k_ = ${i}.u.n < 0 ? (double)l_->n + ${i}.u.n : ${i}.u.n; if (k_ == trunc(k_)) n_asignar(&l_->v[(int64_t)k_], ${v}); n_dec(${o}); ${o} = ${v}; } else`);
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

// ── (motor-exp N4.6) Ser la lengua franca: la biblioteca de C ──────────────
// Las funciones «publico» del programa salen con la ABI de C. Sus tipos, de la
// anotación: real → double, entero → int64_t, bool → int, texto → const char*
// (UTF-8; el que se devuelve es char* y se suelta con <p>liberar), nulo → void;
// lo demás (listas, diccionarios, registros, funciones, sin anotar) viaja como
// un ASA opaca, <p>valor*, con una API pequeña para mirarla y hacerla.
const API_SUFIJOS = ['iniciar', 'error', 'liberar', 'valor_tipo', 'valor_real', 'valor_bool', 'valor_texto', 'valor_repr',
  'valor_largo', 'valor_en', 'valor_clave', 'valor_de', 'valor_reales', 'valor_soltar', 'valor_copiar', 'nuevo_nulo', 'nuevo_bool',
  'nuevo_real', 'nuevo_texto', 'nuevo_lista', 'nuevo_lista_reales', 'nuevo_dic', 'lista_agregar', 'dic_poner', 'llamar'];
const PALABRAS_C = new Set(('auto break case char const continue default do double else enum extern float for goto if inline int long ' +
  'register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false ' +
  'class new delete template this namespace private public protected operator').split(' '));
const identC = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
const PY_RESERVADAS = new Set(('False None True and as assert async await break class continue def del elif else except finally for ' +
  'from global if import in is lambda nonlocal not or pass raise return try while with yield').split(' '));

function tipoABI(t, esRet) {
  const k = t ? t.k : 'cualquiera';
  if (k === 'real') return { c: 'double', clase: 'real' };
  if (k === 'entero') return { c: 'int64_t', clase: 'entero' };
  if (k === 'bool') return { c: 'int', clase: 'bool' };
  if (k === 'texto') return { c: esRet ? 'char*' : 'const char*', clase: 'texto' };
  if (k === 'nulo' && esRet) return { c: 'void', clase: 'nulo' };
  return { c: null, clase: 'asa' };
}
const nombreTipo = t => {
  if (!t) return 'cualquiera';
  if (t.k === 'lista') return `lista<${nombreTipo(t.elem)}>`;
  if (t.k === 'dic') return `dic<${nombreTipo(t.clave)}, ${nombreTipo(t.valor)}>`;
  if (t.k === 'registro') return t.nombre;
  if (t.k === 'funcion') return 'funcion';
  return t.k;
};

// Las funciones que se exportan, sacadas del árbol del archivo principal.
function exportacionesBiblioteca(ast) {
  const out = [];
  for (const s of ast.cuerpo) {
    if (!s.publico || s.tipo !== 'DeclFuncion' || s.metodo) continue;
    if (s.corrutina) throw new ErrorAOT(`«${s.nombre}» es un generador o una función asíncrona: todavía no se puede exportar a C`);
    out.push({ nombre: s.nombre, params: s.params.map(p => ({ nombre: p.nombre, tipo: p.anotacion || null })), ret: s.retorno || null, linea: s.linea });
  }
  return out;
}

function emitirBiblioteca(bib, ctx) {
  const { E, idGlobal, modulos, idFn, cTexto } = ctx;
  const P = bib.prefijo;
  const VT = `${P}valor`;
  const exp = bib.exporta;
  if (!exp.length) throw new ErrorAOT('la biblioteca no exporta nada: marca con «publico» las funciones que se tienen que ver desde fuera (publico fn sumar(a: real, b: real): real)');
  const vistos = new Map();
  for (const f of exp) {
    const suf = identC(f.nombre);
    f.c = P + suf;
    if (API_SUFIJOS.includes(suf)) throw new ErrorAOT(`la función «${f.nombre}» se llamaría ${f.c}, que es un nombre de la API de la biblioteca: cámbiale el nombre`);
    if (vistos.has(f.c)) throw new ErrorAOT(`«${f.nombre}» y «${vistos.get(f.c)}» se llamarían igual en C (${f.c})`);
    vistos.set(f.c, f.nombre);
    f.abiRet = tipoABI(f.ret, true);
    f.abiPs = f.params.map((p, i) => Object.assign({ nom: identC(p.nombre), cc: `p${i}` }, tipoABI(p.tipo, false)));
    for (const p of f.abiPs) if (PALABRAS_C.has(p.nom)) p.nom += '_';
  }
  const tyP = a => (a.clase === 'asa' ? `const ${VT}*` : a.c);
  const tyR = a => (a.clase === 'asa' ? `${VT}*` : a.c);
  const firma = (f, conNombres) => {
    const ps = f.abiPs.map(p => `${tyP(p)} ${conNombres ? p.nom : p.cc}`);
    return `${tyR(f.abiRet)} ${f.c}(${ps.length ? ps.join(', ') : 'void'})`;
  };
  const porDefecto = f => ({ real: 'NAN', entero: '0', bool: '0', texto: 'NULL', asa: 'NULL', nulo: '' })[f.abiRet.clase];
  const firmaN = f => `fn ${f.nombre}(${f.params.map(p => `${p.nombre}: ${nombreTipo(p.tipo)}`).join(', ')}): ${nombreTipo(f.ret)}`;
  const comentario = s => s.replace(/\*\//g, '* /');

  E('');
  E('/* ═══════════ (motor-exp N4.6) la biblioteca: las funciones «publico» con la ABI de C ═══════════ */');
  E('#if defined(_WIN32)');
  E('#define N_EXPORTA __declspec(dllexport)');
  E('#else');
  E('#define N_EXPORTA __attribute__((visibility("default")))');
  E('#endif');
  // (motor-exp N4.7) se puede llamar desde varios hilos: cada llamada entra de una
  // en una por un cerrojo (el conteo de referencias de los valores no es atómico,
  // y así no hace falta que lo sea). El error sigue siendo por hilo.
  E('#if defined(_WIN32)');
  E('#ifndef WIN32_LEAN_AND_MEAN');
  E('#define WIN32_LEAN_AND_MEAN');
  E('#endif');
  E('#include <windows.h>');
  E('static SRWLOCK lib_cerrojo = SRWLOCK_INIT;');
  E('#define N_BLOQ() AcquireSRWLockExclusive(&lib_cerrojo)');
  E('#define N_DESBLOQ() ReleaseSRWLockExclusive(&lib_cerrojo)');
  E('#else');
  E('#include <pthread.h>');
  E('static pthread_mutex_t lib_cerrojo = PTHREAD_MUTEX_INITIALIZER;');
  E('#define N_BLOQ() pthread_mutex_lock(&lib_cerrojo)');
  E('#define N_DESBLOQ() pthread_mutex_unlock(&lib_cerrojo)');
  E('#endif');
  // una función exportada = su cuerpo (static, «_i») y una envoltura con el cerrojo
  const conCerrojo = (firmaC, cuerpoC) => {
    const m = /^(.*?)\b(\w+)\((.*)\)$/.exec(firmaC);
    const [, ret, nombre, ps] = m;
    const nombres = ps.trim() === 'void' ? [] : ps.split(',').map(x => x.trim().split(/[\s*]+/).pop());
    E(`static ${ret}${nombre}_i(${ps}) { ${cuerpoC} }`);
    const llamada = `${nombre}_i(${nombres.join(', ')})`;
    if (ret.trim() === 'void') E(`N_EXPORTA ${firmaC} { N_BLOQ(); ${llamada}; N_DESBLOQ(); }`);
    else E(`N_EXPORTA ${firmaC} { N_BLOQ(); ${ret.trim()} r_ = ${llamada}; N_DESBLOQ(); return r_; }`);
  };
  E(`typedef struct ${VT} ${VT};`);
  E('static int lib_estado = 0;   /* 0 sin arrancar · 1 bien · 2 falló el arranque */');
  E('static char* lib_error_inicio = NULL;');
  E('static int lib_iniciar(void) {');
  E('  if (lib_estado == 1) return 1;');
  E('  if (lib_estado == 2) { n_api_poner_error(lib_error_inicio); return 0; }');
  E('  n_iniciar_biblioteca();');
  E('  iniciar_constantes();');
  if (modulos.length) {
    E(`  static const char* const claves[] = { ${modulos.map(m => cTexto(m.clave)).join(', ')} };`);
    E(`  static const NFn* const fns[] = { ${modulos.map(m => '&FN' + idFn.get(m.fn)).join(', ')} };`);
    E(`  n_registrar_modulos(claves, fns, ${modulos.length});`);
  }
  E('  NV c = n_cierre_nuevo(&FN0);');
  E('  NV r = F0((NCierre*)c.u.o, NULL, 0);');
  E('  n_dec(c); fflush(stdout);');
  E('  if (N_FALLO(r)) { n_api_guardar_error(); lib_error_inicio = strdup(n_api_error()); lib_estado = 2; return 0; }');
  E('  n_dec(r); lib_estado = 1; return 1;');
  E('}');
  conCerrojo(`int ${P}iniciar(void)`, 'n_api_limpiar_error(); return lib_iniciar();');
  E(`N_EXPORTA const char* ${P}error(void) { return n_api_error(); }`);
  E(`N_EXPORTA void ${P}liberar(void* p) { free(p); }`);
  // la API de las asas
  const api = [
    [`const char* ${P}valor_tipo(const ${VT}* v)`, 'return n_api_tipo(v);', 'mirar', '"nulo", "bool", "entero", "real", "texto", "lista", "dic", "registro", "funcion", "error", "fecha"'],
    [`double ${P}valor_real(const ${VT}* v)`, 'return n_api_real(v);', 'mirar', 'el número (NaN si no lo es)'],
    [`int ${P}valor_bool(const ${VT}* v)`, 'return n_api_bool(v);', 'mirar', 'si es verdad, como en un «si» de Ñ'],
    [`char* ${P}valor_texto(const ${VT}* v)`, 'return n_api_texto(v);', 'mirar', 'el texto (UTF-8, tuyo) o NULL si no es un texto'],
    [`char* ${P}valor_repr(const ${VT}* v)`, 'return n_api_repr(v);', 'mirar', 'cómo lo imprimiría Ñ (UTF-8, tuyo)'],
    [`int64_t ${P}valor_largo(const ${VT}* v)`, 'return n_api_largo(v);', 'mirar', 'cuántos elementos (lista, dic) o letras (texto); −1 si no tiene'],
    [`${VT}* ${P}valor_en(const ${VT}* v, int64_t i)`, `return (${VT}*)n_api_en(v, i);`, 'mirar', 'el elemento i de una lista (un asa nueva) o NULL'],
    [`${VT}* ${P}valor_clave(const ${VT}* v, int64_t i)`, `return (${VT}*)n_api_clave(v, i);`, 'mirar', 'la clave i de un dic o registro, en orden de inserción'],
    [`${VT}* ${P}valor_de(const ${VT}* v, int64_t i)`, `return (${VT}*)n_api_valor_en(v, i);`, 'mirar', 'el valor i de un dic o registro'],
    [`int64_t ${P}valor_reales(const ${VT}* v, double* destino, int64_t n)`, 'return n_api_copiar_reales(v, destino, n);', 'mirar', 'copia hasta n números de una lista; devuelve su largo, o −1'],
    [`${VT}* ${P}valor_copiar(const ${VT}* v)`, `return v ? (${VT}*)n_api_asa(n_inc(n_api_valor(v))) : NULL;`, 'mirar', 'otra asa del mismo valor (también hay que soltarla)'],
    [`void ${P}valor_soltar(${VT}* v)`, 'n_api_soltar(v);', 'mirar', 'suelta un asa (NULL no hace nada)'],
    [`${VT}* ${P}nuevo_nulo(void)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_asa(n_nulo());`, 'hacer', ''],
    [`${VT}* ${P}nuevo_bool(int b)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_asa(n_bool(b));`, 'hacer', ''],
    [`${VT}* ${P}nuevo_real(double x)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_asa(n_num(x));`, 'hacer', ''],
    [`${VT}* ${P}nuevo_texto(const char* s)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_asa(s ? n_texto_utf8(s) : n_nulo());`, 'hacer', 'UTF-8'],
    [`${VT}* ${P}nuevo_lista(void)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_lista();`, 'hacer', 'vacía'],
    [`${VT}* ${P}nuevo_lista_reales(const double* x, int64_t n)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_lista_reales(x, n);`, 'hacer', 'una lista con n números'],
    [`${VT}* ${P}nuevo_dic(void)`, `if (!lib_iniciar()) return NULL; return (${VT}*)n_api_dic();`, 'hacer', 'vacío'],
    [`int ${P}lista_agregar(${VT}* lista, const ${VT}* x)`, 'return n_api_agregar(lista, x);', 'hacer', 'x sigue siendo tuyo'],
    [`int ${P}dic_poner(${VT}* dic, const ${VT}* clave, const ${VT}* x)`, 'return n_api_poner(dic, clave, x);', 'hacer', 'clave y x siguen siendo tuyos'],
    [`${VT}* ${P}llamar(const ${VT}* f, const ${VT}* const* args, int n)`, `n_api_limpiar_error(); if (!lib_iniciar()) return NULL; return (${VT}*)n_api_llamar(f, (const void* const*)args, n);`, 'llamar', 'una función de Ñ que te llegó en un asa'],
  ];
  for (const [f, cuerpo] of api) conCerrojo(f, cuerpo);
  // cada función exportada
  for (const f of exp) {
    const g = idGlobal(f.nombre);
    const n = f.params.length, d = porDefecto(f), ret = d === '' ? 'return;' : `return ${d};`;
    E('');
    E(`/* Ñ: ${comentario(firmaN(f))} */`);
    const fi = firma(f, false), fiI = fi.replace(`${f.c}(`, `${f.c}_i(`);
    E(`static ${fiI} {`);
    E('  n_api_limpiar_error();');
    E(`  if (!lib_iniciar()) ${ret}`);
    E(`  if (!GD[${g}]) { n_api_poner_error(${cTexto(`«${f.nombre}» no está definida`)}); ${ret} }`);
    E(`  NV a_[${Math.max(1, n)}];`);
    // los enteros primero: son lo único que puede fallar al entrar
    f.abiPs.forEach((p, i) => { if (p.clase === 'entero') E(`  if (!n_api_de_entero(${p.cc}, &a_[${i}])) { n_api_guardar_error(); ${ret} }`); });
    f.abiPs.forEach((p, i) => {
      if (p.clase === 'real') E(`  a_[${i}] = n_num(${p.cc});`);
      else if (p.clase === 'bool') E(`  a_[${i}] = n_bool(${p.cc});`);
      else if (p.clase === 'texto') E(`  n_api_de_texto(${p.cc}, &a_[${i}]);`);
      else if (p.clase === 'asa') E(`  a_[${i}] = n_api_valor(${p.cc});`);
    });
    E(`  NV r_ = n_llamar(G[${g}], a_, ${n});`);
    f.abiPs.forEach((p, i) => { if (p.clase === 'texto') E(`  n_dec(a_[${i}]);`); });
    E('  fflush(stdout);');
    E(`  if (N_FALLO(r_)) { n_api_guardar_error(); ${ret} }`);
    const q = cTexto(f.nombre);
    switch (f.abiRet.clase) {
      case 'real': E(`  double x_; if (!n_api_a_real(r_, &x_, ${q})) { n_dec(r_); n_api_guardar_error(); return NAN; }`); E('  n_dec(r_); return x_;'); break;
      case 'entero': E(`  int64_t x_; if (!n_api_a_entero(r_, &x_, ${q})) { n_dec(r_); n_api_guardar_error(); return 0; }`); E('  n_dec(r_); return x_;'); break;
      case 'bool': E(`  int x_; if (!n_api_a_bool(r_, &x_, ${q})) { n_dec(r_); n_api_guardar_error(); return 0; }`); E('  n_dec(r_); return x_;'); break;
      case 'texto': E(`  char* x_; if (!n_api_a_texto(r_, &x_, ${q})) { n_dec(r_); n_api_guardar_error(); return NULL; }`); E('  n_dec(r_); return x_;'); break;
      case 'nulo': E('  n_dec(r_);'); break;
      default: E(`  return (${VT}*)n_api_asa(r_);`);
    }
    E('}');
    // la envoltura exportada, con el cerrojo (motor-exp N4.7)
    const llam = `${f.c}_i(${f.abiPs.map(p => p.cc).join(', ')})`;
    if (f.abiRet.clase === 'nulo') E(`N_EXPORTA ${fi} { N_BLOQ(); ${llam}; N_DESBLOQ(); }`);
    else E(`N_EXPORTA ${fi} { N_BLOQ(); ${tyR(f.abiRet)} r_ = ${llam}; N_DESBLOQ(); return r_; }`);
  }

  // ── la cabecera ──
  const GU = identC(bib.nombre).toUpperCase() + '_H';
  const h = [];
  const H = s => h.push(s);
  H(`/* ${bib.nombre}.h — generado por motor/util/n-compilar.js --biblioteca (Ñ, N4.6). No editar a mano.`);
  H(' *');
  H(' * Las funciones «publico» de un programa de Ñ, con la ABI de C. Sirve tal cual desde C, C++,');
  H(' * Rust (extern "C"), Go (cgo), Python (ctypes; hay un .py al lado), C#, Julia, Zig…');
  H(' *');
  H(' * Los tipos: real → double · entero → int64_t (hasta ±2^53, exacto) · bool → int · texto → const char*');
  H(` * en UTF-8 (el que devuelve una función es tuyo: suéltalo con ${P}liberar) · nulo → void · lo demás`);
  H(` * (listas, diccionarios, registros, funciones) → ${VT}*, un asa: la que te devuelve la biblioteca es`);
  H(` * tuya y se suelta con ${P}valor_soltar; la que le pasas sigue siendo tuya.`);
  H(' *');
  H(` * Errores: si una llamada falla devuelve 0, NaN o NULL, y ${P}error() dice por qué (el mismo mensaje`);
  H(` * que la VM de Ñ, con la línea); si va bien, ${P}error() es NULL. Lo de nivel superior del programa`);
  H(` * corre una vez, en la primera llamada (o en ${P}iniciar()). Se puede llamar desde varios hilos:`);
  H(' * las llamadas entran de una en una (un cerrojo), y el error es de cada hilo.');
  H(' */');
  H(`#ifndef ${GU}`);
  H(`#define ${GU}`);
  H('#include <stdint.h>');
  H('#ifdef __cplusplus');
  H('extern "C" {');
  H('#endif');
  H('');
  H(`typedef struct ${VT} ${VT};`);
  H('');
  for (const f of exp) { H(`/* ${comentario(firmaN(f))} */`); H(`${firma(f, true)};`); }
  H('');
  H('/* ── la biblioteca ── */');
  H(`int ${P}iniciar(void);                 /* 1 si arrancó bien (si no, mira ${P}error()) */`);
  H(`const char* ${P}error(void);           /* el error de la última llamada, o NULL (vale hasta la siguiente llamada) */`);
  H(`void ${P}liberar(void* p);             /* un char* que te dio la biblioteca */`);
  for (const [grupo, titulo] of [['mirar', 'las asas: mirar'], ['hacer', 'las asas: hacer (también son tuyas: suéltalas)'], ['llamar', 'llamar']]) {
    H('');
    H(`/* ── ${titulo} ── */`);
    for (const [f, , g, doc] of api) if (g === grupo) H(`${f};${doc ? `   /* ${doc} */` : ''}`);
  }
  H('');
  H('#ifdef __cplusplus');
  H('}');
  H('#endif');
  H('#endif');

  // ── el módulo de Python (ctypes, sin nada que instalar) ──
  const py = [];
  const Y = s => py.push(s);
  const pyNombre = s => (PY_RESERVADAS.has(s) ? s + '_' : s);
  const CT = { real: 'ctypes.c_double', entero: 'ctypes.c_int64', bool: 'ctypes.c_int', texto: 'ctypes.c_char_p', asa: 'ctypes.c_void_p', nulo: 'None' };
  const mod = identC(bib.nombre);
  Y(`# ${bib.nombre}.py — generado por motor/util/n-compilar.js --biblioteca (Ñ, N4.6). No editar a mano.`);
  Y('#');
  Y(`# Las funciones «publico» de ${bib.nombre}.esl, para Python, sin nada que instalar (ctypes):`);
  Y('#');
  Y(`#     import ${mod}`);
  Y(`#     ${mod}.${pyNombre(exp[0].nombre)}(…)`);
  Y('#');
  Y('# Las listas, los diccionarios y los registros llegan como list y dict de Python; una función de Ñ');
  Y('# llega como algo que se puede llamar. Un error de Ñ es una excepción ErrorÑ con el mensaje de la VM.');
  Y('import ctypes, os, sys');
  Y('');
  Y('_aqui = os.path.dirname(os.path.abspath(__file__))');
  Y(`_nombres = {'win32': ${JSON.stringify(bib.archivos.dll)}, 'darwin': ${JSON.stringify(bib.archivos.dylib)}}`);
  Y(`_lib = ctypes.CDLL(os.path.join(_aqui, _nombres.get(sys.platform, ${JSON.stringify(bib.archivos.so)})))`);
  Y('');
  Y('class ErrorÑ(Exception):');
  Y("    'Un error de Ñ: el mensaje es el de la VM, con su línea.'");
  Y('ErrorN = ErrorÑ');
  Y('');
  Y('def _f(nombre, args, ret):');
  Y('    f = getattr(_lib, nombre)');
  Y('    f.argtypes = args');
  Y('    f.restype = ret');
  Y('    return f');
  const vp = 'ctypes.c_void_p';
  const decl = [
    ['_error', 'error', '[]', 'ctypes.c_char_p'], ['_liberar', 'liberar', `[${vp}]`, 'None'],
    ['_tipo', 'valor_tipo', `[${vp}]`, 'ctypes.c_char_p'], ['_real', 'valor_real', `[${vp}]`, 'ctypes.c_double'],
    ['_bool', 'valor_bool', `[${vp}]`, 'ctypes.c_int'], ['_texto', 'valor_texto', `[${vp}]`, vp], ['_repr', 'valor_repr', `[${vp}]`, vp],
    ['_largo', 'valor_largo', `[${vp}]`, 'ctypes.c_int64'], ['_en', 'valor_en', `[${vp}, ctypes.c_int64]`, vp],
    ['_clave', 'valor_clave', `[${vp}, ctypes.c_int64]`, vp], ['_de', 'valor_de', `[${vp}, ctypes.c_int64]`, vp],
    ['_copiar', 'valor_copiar', `[${vp}]`, vp], ['_soltar', 'valor_soltar', `[${vp}]`, 'None'],
    ['_n_nulo', 'nuevo_nulo', '[]', vp], ['_n_bool', 'nuevo_bool', '[ctypes.c_int]', vp], ['_n_real', 'nuevo_real', '[ctypes.c_double]', vp],
    ['_n_texto', 'nuevo_texto', '[ctypes.c_char_p]', vp], ['_n_lista', 'nuevo_lista', '[]', vp], ['_n_dic', 'nuevo_dic', '[]', vp],
    ['_agregar', 'lista_agregar', `[${vp}, ${vp}]`, 'ctypes.c_int'], ['_poner', 'dic_poner', `[${vp}, ${vp}, ${vp}]`, 'ctypes.c_int'],
    ['_llamar', 'llamar', `[${vp}, ctypes.POINTER(${vp}), ctypes.c_int]`, vp], ['_iniciar', 'iniciar', '[]', 'ctypes.c_int'],
  ];
  for (const [py0, c, a, r] of decl) Y(`${py0} = _f('${P}${c}', ${a}, ${r})`);
  Y(`
def _comprobar():
    e = _error()
    if e is not None:
        raise ErrorÑ(e.decode('utf-8'))

def _cadena(p):
    if not p:
        return None
    s = ctypes.string_at(p).decode('utf-8')
    _liberar(p)
    return s

class FuncionÑ:
    'Una función de Ñ que llegó de la biblioteca: se llama como cualquier otra.'
    def __init__(self, asa):
        self._asa = asa
    def __call__(self, *args):
        asas = [_a_asa(x) for x in args]
        try:
            arr = (ctypes.c_void_p * max(1, len(asas)))(*asas)
            r = _llamar(self._asa, arr, len(asas))
            _comprobar()
            return _de_asa(r)
        finally:
            for a in asas:
                _soltar(a)
    def __del__(self):
        try:
            _soltar(self._asa)
        except Exception:
            pass

def _de_asa(a):
    'De un asa de Ñ a un valor de Python; el asa se suelta (salvo la de una función, que se queda dentro).'
    if not a:
        return None
    t = _tipo(a).decode('utf-8')
    if t == 'funcion':
        return FuncionÑ(a)
    try:
        if t == 'nulo': return None
        if t == 'bool': return bool(_bool(a))
        if t == 'entero': return int(_real(a))
        if t == 'real': return _real(a)
        if t == 'texto': return _cadena(_texto(a))
        if t == 'lista': return [_de_asa(_en(a, i)) for i in range(_largo(a))]
        if t in ('dic', 'registro'): return {_de_asa(_clave(a, i)): _de_asa(_de(a, i)) for i in range(_largo(a))}
        return _cadena(_repr(a))
    finally:
        _soltar(a)

def _a_asa(x):
    'De un valor de Python a un asa de Ñ nueva (quien la pide la suelta).'
    if isinstance(x, FuncionÑ): return _copiar(x._asa)
    if x is None: return _n_nulo()
    if isinstance(x, bool): return _n_bool(1 if x else 0)
    if isinstance(x, int):
        if abs(x) > 2 ** 53:
            raise ErrorÑ('el entero %d no cabe exacto en un número de Ñ (más de 2^53)' % x)
        return _n_real(float(x))
    if isinstance(x, float): return _n_real(x)
    if isinstance(x, str): return _n_texto(x.encode('utf-8'))
    if isinstance(x, (list, tuple)):
        l = _n_lista()
        for e in x:
            a = _a_asa(e); _agregar(l, a); _soltar(a)
        return l
    if isinstance(x, dict):
        d = _n_dic()
        for k, v in x.items():
            ak, av = _a_asa(k), _a_asa(v); _poner(d, ak, av); _soltar(ak); _soltar(av)
        return d
    raise TypeError('un %s de Python no tiene un valor de Ñ que le corresponda' % type(x).__name__)

def iniciar():
    'Corre lo de nivel superior del programa (si no, se hace en la primera llamada).'
    if not _iniciar():
        _comprobar()
`);
  const pyArg = (p, nombre) => {
    if (p.clase === 'real') return `float(${nombre})`;
    if (p.clase === 'entero') return `int(${nombre})`;
    if (p.clase === 'bool') return `(1 if ${nombre} else 0)`;
    if (p.clase === 'texto') return `(None if ${nombre} is None else str(${nombre}).encode('utf-8'))`;
    return null;
  };
  for (const f of exp) {
    const nombres = f.params.map(p => pyNombre(p.nombre));
    const args = f.abiPs.map(p => CT[p.clase]);
    const res = f.abiRet.clase === 'texto' ? vp : CT[f.abiRet.clase];
    const ic = identC(f.nombre);
    Y(`_c_${ic} = _f('${f.c}', [${args.join(', ')}], ${res})`);
    Y(`def ${pyNombre(f.nombre)}(${nombres.join(', ')}):`);
    Y(`    ${JSON.stringify('Ñ: ' + firmaN(f))}`);
    const asas = f.abiPs.map((p, i) => (p.clase === 'asa' ? i : -1)).filter(i => i >= 0);
    const llam = f.abiPs.map((p, i) => (p.clase === 'asa' ? `_a${i}` : pyArg(p, nombres[i])));
    let ind = '    ';
    for (const i of asas) Y(`${ind}_a${i} = _a_asa(${nombres[i]})`);
    if (asas.length) { Y(`${ind}try:`); ind += '    '; }
    Y(`${ind}r = _c_${ic}(${llam.join(', ')})`);
    Y(`${ind}_comprobar()`);
    if (f.abiRet.clase === 'texto') Y(`${ind}return _cadena(r)`);
    else if (f.abiRet.clase === 'bool') Y(`${ind}return bool(r)`);
    else if (f.abiRet.clase === 'asa') Y(`${ind}return _de_asa(r)`);
    else if (f.abiRet.clase === 'nulo') Y(`${ind}return None`);
    else Y(`${ind}return r`);
    if (asas.length) { Y('    finally:'); for (const i of asas) Y(`        _soltar(_a${i})`); }
    Y('');
  }
  return { h: h.join('\n') + '\n', py: py.join('\n') + '\n', exporta: exp.map(f => ({ nombre: f.nombre, c: f.c, firma: firma(f, true) })) };
}

// ============================================================================
//  (motor-exp N4.10) C llamado directamente: nativa(...) y cabeceraNativa(...)
// ============================================================================
// En la VM las dos pasan por koffi. Aquí la firma (o la cabecera entera) se lee
// AL COMPILAR, cada función lleva un envoltorio de C que convierte los valores
// de Ñ y llama al símbolo de verdad (declarado con su nombre de enlace, así no
// choca con lo que ya declaran <math.h> y compañía), y n-compilar le pasa la
// biblioteca al enlazador. Ver aot/nrt_enlace.inc.
const G_NATIVA = 'nativa', G_CABECERA = 'ñ:nativo' + SEP + 'cabeceraNativa';
const G_SIN = ' sinComprobar';    // (motor-exp N4.11) las marcas de «sinComprobar { … }»
// Los tipos de C que el ejecutable sabe pasar: [clase, tipo de C para declarar]
const TIPOS_ENLACE = {
  double: ['real', 'double'], float: ['real', 'float'], 'long double': null,
  char: ['ent', 'char'], 'signed char': ['ent', 'signed char'], 'unsigned char': ['nat', 'unsigned char'],
  short: ['ent', 'short'], 'unsigned short': ['nat', 'unsigned short'], int: ['ent', 'int'], 'unsigned int': ['nat', 'unsigned int'],
  long: ['ent', 'long'], 'unsigned long': ['nat', 'unsigned long'], 'long long': ['ent', 'long long'], 'unsigned long long': ['nat', 'unsigned long long'],
  int8_t: ['ent', 'int8_t'], uint8_t: ['nat', 'uint8_t'], int16_t: ['ent', 'int16_t'], uint16_t: ['nat', 'uint16_t'],
  int32_t: ['ent', 'int32_t'], uint32_t: ['nat', 'uint32_t'], int64_t: ['ent', 'int64_t'], uint64_t: ['nat', 'uint64_t'],
  size_t: ['nat', 'size_t'], ssize_t: ['ent', 'ptrdiff_t'], ptrdiff_t: ['ent', 'ptrdiff_t'], intptr_t: ['ent', 'intptr_t'], uintptr_t: ['nat', 'uintptr_t'],
  bool: ['bool', '_Bool'], _Bool: ['bool', '_Bool'], void: ['void', 'void'],
};
function normalTipoC(t) {
  let s = String(t).replace(/\b(const|volatile|restrict|__restrict|__restrict__|struct|enum|union)\b/g, ' ').replace(/\s*\*\s*/g, ' * ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bsigned (short|int|long)/g, '$1').replace(/\bshort int\b/g, 'short').replace(/\blong long int\b/g, 'long long')
    .replace(/\blong int\b/g, 'long').replace(/\bunsigned$/, 'unsigned int').replace(/^unsigned \*/, 'unsigned int *');
  return s;
}
// la clase de un tipo de C: { k: 'real'|'ent'|'nat'|'bool'|'texto'|'void', c } o { no: 'por qué' }
function claseTipoC(t, alias, estructuras, tiposFn) {
  let s = normalTipoC(t);
  for (let v = 0; v < 20 && alias.has(s); v++) s = normalTipoC(alias.get(s));
  if (s === 'char *') return { k: 'texto', c: 'const char*' };
  if (s.endsWith('*')) return { no: `pasa un puntero (${t})`, que: `un puntero (${t})` };
  if (tiposFn.has(s)) return { no: `lleva una retrollamada (${t})`, que: `una retrollamada (${t})` };
  if (estructuras.has(s)) return { no: `pasa una estructura (${s}) por valor`, que: `una estructura (${s}) por valor` };
  const e = TIPOS_ENLACE[s];
  if (!e) return { no: `usa el tipo «${t}», que no sé pasar`, que: `el tipo «${t}», que no sé pasar` };
  return { k: e[0], c: e[1] };
}
// Lo que el programa enlaza: las llamadas nativa("lib", "firma") y
// cabeceraNativa("lib", "geo.h") con los dos textos escritos tal cual.
function buscarEnlaces(fns, decod, leerArchivo) {
  const funciones = [], cabeceras = [], bibliotecas = [];
  const vistas = new Map();
  const bib = b => { if (!bibliotecas.includes(b)) bibliotecas.push(b); };
  fns.forEach((f, j) => {
    const ins = decod[j], consts = f.chunk.consts;
    for (let k = 0; k + 3 < ins.length; k++) {
      const a = ins[k];
      if (a.op !== OP.GET_GLOBAL || (consts[a.arg] !== G_NATIVA && consts[a.arg] !== G_CABECERA)) continue;
      const b = ins[k + 1], c = ins[k + 2], d = ins[k + 3];
      if (b.op !== OP.CONST || c.op !== OP.CONST || d.op !== OP.CALL || d.arg !== 2) continue;
      const lib = consts[b.arg], seg = consts[c.arg];
      if (typeof lib !== 'string' || typeof seg !== 'string') continue;
      const clave = consts[a.arg] + '\u0001' + lib + '\u0001' + seg;
      if (vistas.has(clave)) continue;
      vistas.set(clave, true);
      bib(lib);
      if (consts[a.arg] === G_NATIVA) {
        if (/\.\.\./.test(seg)) throw new ErrorAOT(`nativa(${JSON.stringify(lib)}, ${JSON.stringify(seg)}): una función con «...» no se puede llamar (C no dice de qué tipo es cada argumento de más)`);
        if (/_(Out|Inout)_/.test(seg)) throw new ErrorAOT(`nativa(${JSON.stringify(lib)}, ${JSON.stringify(seg)}): los parámetros de salida (_Out_, _Inout_) todavía no van en el ejecutable`);
        const h = leerCabecera(seg + ';');
        if (h.funciones.length !== 1) throw new ErrorAOT(`nativa(${JSON.stringify(lib)}, ${JSON.stringify(seg)}): no entiendo esa firma de C`);
        const fn = h.funciones[0];
        const cl = enlazable(fn, new Map(), new Set(), new Set());
        if (cl.no) throw new ErrorAOT(`nativa(${JSON.stringify(lib)}, ${JSON.stringify(seg)}): «${fn.nombre}» ${cl.no}: en el ejecutable, todavía no (en la VM sí)`);
        funciones.push({ lib, proto: seg, fn, cl });
      } else {
        let texto;
        try { texto = leerArchivo(seg); }
        catch (e) { throw new ErrorAOT(`cabeceraNativa(${JSON.stringify(lib)}, ${JSON.stringify(seg)}): no se pudo leer la cabecera al compilar (${e.message})`); }
        const h = leerCabecera(texto);
        const alias = new Map(h.alias.map(([n, t]) => [normalTipoC(n), t]));
        const estructuras = new Set(h.estructuras.map(e => e.nombre).concat(h.opacos));
        const tiposFn = new Set(h.tiposFuncion.map(t => t.nombre));
        const funs = h.funciones.map(fn => ({ fn, cl: enlazable(fn, alias, estructuras, tiposFn) }));
        cabeceras.push({ lib, ruta: seg, h, funs });
      }
    }
  });
  return { funciones, cabeceras, bibliotecas };
}
function enlazable(fn, alias, estructuras, tiposFn) {
  const ret = claseTipoC(fn.ret, alias, estructuras, tiposFn);
  if (ret.no) return { no: `devuelve ${ret.que}` };
  const ps = [];
  for (const p of fn.params) {
    const c = claseTipoC(p.tipo, alias, estructuras, tiposFn);
    if (c.no) return { no: c.no };
    if (c.k === 'void') return { no: 'tiene un parámetro void' };
    ps.push(c);
  }
  return { ret, ps };
}
function emitirEnlaces(enl, E, cTexto, usa) {
  if (!usa && !enl.funciones.length && !enl.cabeceras.length) return;
  let q = 0;
  E('/* ── (motor-exp N4.10) C llamado directamente: un envoltorio por función ── */');
  const envoltorio = (fn, cl) => {
    const k = q++;
    const decl = cl.ps.length ? cl.ps.map(p => p.c).join(', ') : 'void';
    E(`extern ${cl.ret.c} NXS${k}(${decl}) __asm__(N_SIM(${cTexto(fn.nombre)})) N_DEBIL;`);
    E(`static NV NX${k}(NV* a, int n, void* x) {`);
    E('  (void)n; (void)x;');
    const libres = [];
    cl.ps.forEach((p, i) => {
      if (p.k === 'real') E(`  double d${i}; if (!n_c_numero(a[${i}], &d${i}, ${cTexto(fn.nombre)}, ${i + 1})) goto fallo;`);
      else if (p.k === 'ent' || p.k === 'nat') E(`  int64_t d${i}; if (!n_c_entero(a[${i}], &d${i}, ${cTexto(fn.nombre)}, ${i + 1})) goto fallo;`);
      else if (p.k === 'bool') E(`  int d${i}; if (!n_c_bool(a[${i}], &d${i}, ${cTexto(fn.nombre)}, ${i + 1})) goto fallo;`);
      else if (p.k === 'texto') { E(`  char* d${i} = NULL; if (!n_c_texto(a[${i}], &d${i}, ${cTexto(fn.nombre)}, ${i + 1})) goto fallo;`); libres.push(i); }
    });
    const args = cl.ps.map((p, i) => (p.k === 'nat' ? `(${p.c})(uint64_t)d${i}` : `(${p.c})d${i}`)).join(', ');
    const llamada = `NXS${k}(${args})`;
    const soltar = libres.map(i => `free(d${i}); `).join('');
    const r = cl.ret;
    if (r.k === 'void') E(`  ${llamada}; ${soltar}return n_nulo();`);
    else {
      E(`  ${r.c} r = ${llamada};`);
      if (soltar) E(`  ${soltar}`);
      const conv = r.k === 'real' ? 'n_num((double)r)' : r.k === 'ent' ? `n_c_de_entero((int64_t)r, ${cTexto(fn.nombre)})`
        : r.k === 'nat' ? `n_c_de_natural((uint64_t)r, ${cTexto(fn.nombre)})` : r.k === 'bool' ? 'n_bool(r)' : 'n_c_de_texto(r)';
      E(`  return ${conv};`);
    }
    E(`fallo: ${soltar}return N_ERR;`);
    E('}');
    return k;
  };
  const filas = enl.funciones.map(e => {
    const k = envoltorio(e.fn, e.cl);
    return `{ ${cTexto(e.lib)}, ${cTexto(e.proto)}, ${cTexto(e.fn.nombre)}, ${e.cl.ps.length}, NX${k}, (const void*)&NXS${k} }`;
  });
  E(`static const NEnlace NENL[${Math.max(1, filas.length)}] = { ${filas.length ? filas.join(',\n  ') : '{ 0 }'} };`);
  E(`static NV NNAT_nativa(NV* a, int n, void* x) { (void)x; return n_c_nativa(a, n, NENL, ${filas.length}); }`);
  const cabs = enl.cabeceras.map((c, j) => {
    const cs = c.h.constantes.map(([n, v]) => (typeof v === 'string' ? `{ ${cTexto(n)}, 0, ${cTexto(v)} }` : `{ ${cTexto(n)}, ${cNumero(v)}, NULL }`));
    E(`static const NEnlaceConst NCK${j}[${Math.max(1, cs.length)}] = { ${cs.length ? cs.join(', ') : '{ 0 }'} };`);
    const fs2 = c.funs.map(({ fn, cl }) => {
      if (cl.no) return `{ ${cTexto(fn.nombre)}, ${fn.params.length}, NULL, NULL, ${cTexto(cl.no)} }`;
      const k = envoltorio(fn, cl);
      return `{ ${cTexto(fn.nombre)}, ${cl.ps.length}, NX${k}, (const void*)&NXS${k}, NULL }`;
    });
    E(`static const NEnlaceFun NCF${j}[${Math.max(1, fs2.length)}] = { ${fs2.length ? fs2.join(',\n  ') : '{ 0 }'} };`);
    const om = c.h.omitidas.map(([n, por]) => cTexto(`${n}: ${por}`));
    E(`static const char* const NCO${j}[${Math.max(1, om.length)}] = { ${om.length ? om.join(', ') : 'NULL'} };`);
    return `{ ${cTexto(c.lib)}, ${cTexto(c.ruta)}, NCK${j}, ${cs.length}, NCF${j}, ${fs2.length}, NCO${j}, ${om.length} }`;
  });
  E(`static const NCabecera NCAB[${Math.max(1, cabs.length)}] = { ${cabs.length ? cabs.join(',\n  ') : '{ 0 }'} };`);
  E(`static NV NNAT_cabecera(NV* a, int n, void* x) { (void)x; return n_c_cabecera(a, n, NCAB, ${cabs.length}); }`);
}

module.exports = { compilarAOT, ErrorAOT, NATIVAS_C, exportacionesBiblioteca, normalTipoC };
