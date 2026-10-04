// ============================================================================
//  Ñ v4 — MÓDULOS: resolución, enlace y registro
//  Parte 6 de 6.
//
//  Hasta aquí un programa era un archivo. Partirlo en varios exige tres cosas
//  que no son la misma: encontrar el archivo, decidir a qué se refiere cada
//  nombre, y ejecutar cada archivo una sola vez. Las tres viven aquí.
//
//  Tres decisiones gobiernan el resto:
//
//  1. ENCONTRAR EL ARCHIVO ES DEL ANFITRIÓN. El motor no sabe leer nada. En el
//     navegador la zona aislada no tiene sistema de archivos —no es una
//     carencia, es la frontera de seguridad— así que `usar` solo existe cuando
//     el anfitrión ofrece `host.modulos`, igual que `leerTexto` solo existe
//     cuando ofrece `host.archivos`. El motor pide dos cosas y nada más:
//         resolver(especificador, desdeClave) → clave canónica
//         leer(clave)                        → el texto del módulo
//
//  2. EL ENLACE ES DE COMPILACIÓN, NO DE EJECUCIÓN. Cada nombre de nivel
//     superior de un módulo es un global cuyo nombre lleva delante la clave del
//     módulo y un \0 —un byte que el léxico no puede producir, así que ningún
//     programa puede escribir ese nombre a mano. `mates.sumar` se compila a un
//     GET_GLOBAL de «/ruta/mates.esl\0sumar». Consecuencias, todas buenas:
//     sigue habiendo UNA tabla de globales (el recolector, el panel de memoria y
//     el serializador ven lo que veían siempre), no hay ni un opcode nuevo —los
//     .elb de antes siguen valiendo—, el JIT sigue funcionando dentro de los
//     módulos, y un miembro que no existe o un nombre que no se exporta se
//     detectan al compilar y no al ejecutar.
//
//  3. LOS CICLOS SE RESUELVEN CON LA ELEVACIÓN QUE YA HABÍA. El compilador ya
//     emitía las funciones del nivel superior antes que el resto del archivo.
//     Las importaciones se emiten justo después: cuando A importa B y B importa
//     A, A ya tiene sus funciones definidas antes de que B empiece, así que B
//     las ve. Lo que no ve son los valores que A calcula más abajo, y eso se
//     dice con un mensaje que nombra el ciclo en vez de desbordar la pila.
// ============================================================================
'use strict';

// El separador entre la clave del módulo y el nombre. Es \0 a propósito: el
// léxico solo acepta letras, dígitos y «_» en un identificador, así que un
// programa no puede nombrar uno de estos globales ni por accidente ni queriendo.
const SEP_MODULO = '\u0000';

function nombreGlobalModulo(clave, nombre) { return clave + SEP_MODULO + nombre; }

// Los eDSL que vienen dentro del motor no están en ningún disco, pero por
// dentro son módulos como cualquier otro: sus funciones son globales con la
// clave delante, y por tanto un programa no puede escribir ese nombre a mano ni
// tropezarse con ellas sin un «usar». Lo único propio es de dónde salen:
//
//   usar "numerico"        → eDSL nativo, sin tocar el disco, sin anfitrión
//   usar "./numerico.esl"  → el archivo del usuario, como siempre
//
// El especificador desnudo es siempre el nativo: eso hace que «usar "texto"»
// signifique lo mismo en el navegador, en Node y dentro de un .elb, y que un
// archivo llamado texto.esl en la carpeta de al lado no pueda cambiar el
// significado de un programa ajeno.
const CLAVE_EDSL = 'ñ:';
function claveEdsl(nombre) { return CLAVE_EDSL + nombre; }

// Solo el nombre del archivo: las claves son rutas absolutas y en un mensaje de
// error lo que ayuda es «mates.esl», no cuarenta caracteres de carpeta.
function rutaCorta(clave) { return String(clave).replace(/^.*[/\\]/, '') || String(clave); }

// El mensaje de «no está definida» para un global que puede venir de un módulo.
// Sin esto, un ciclo se explicaba con ««/tmp/a.esl\0x» no está definida».
function mensajeNoDefinida(n) {
  const i = String(n).indexOf(SEP_MODULO);
  if (i < 0) return { msg: `«${n}» no está definida`, pista: null };
  return {
    msg: `«${n.slice(i + 1)}» de «${rutaCorta(n.slice(0, i))}» todavía no está definida`,
    pista: 'suele ser un ciclo de importación: el valor se usa antes de que su módulo llegue a calcularlo — las funciones sí se ven, los valores de nivel superior no',
  };
}

// ---------------------------------------------------------------- exportaciones
// Lo que un archivo exporta se sabe SIN mirar los cuerpos: son las declaraciones
// de nivel superior marcadas con «publico», y su tipo sale de la anotación. Eso
// es lo que hace que un ciclo no sea un problema al analizar: para saber qué
// exporta A no hay que analizar A, basta con haberlo leído.
function exportacionesDe(ast) {
  const ex = new Map();
  for (const s of ast.cuerpo) {
    if (!s.publico) continue;
    if (s.tipo === 'DeclFuncion')
      ex.set(s.nombre, T.fn(s.params.map(p => p.anotacion || T.cualquiera), s.retorno || T.cualquiera));
    else if (s.tipo === 'DeclVar')
      ex.set(s.nombre, s.anotacion || (s.valor && s.valor.tipoLit) || T.cualquiera);
  }
  return ex;
}

// ------------------------------------------------------------------- el registro
// Guarda lo que ya se ha leído y analizado, con la clave canónica como
// identidad. Es lo que hace que un módulo importado por tres archivos se lea,
// se compile y se ejecute una sola vez.
class Modulos {
  constructor(cargador, claveRaiz, edsls) {
    this.cargador = cargador || null;
    this.claveRaiz = claveRaiz || null;
    this.edsls = edsls || new Map();
    this.ast = new Map();         // clave → AST
    this.exporta = new Map();     // clave → Map(nombre → tipo)
    this.orden = [];              // claves, en el orden en que se descubrieron
  }

  resolver(espec, desde, nodo) {
    let clave;
    try { clave = this.cargador.resolver(espec, desde || null); }
    catch (e) { throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col); }
    if (typeof clave !== 'string' || !clave)
      throw new ErrorFuente('módulos', `el anfitrión no supo resolver «${espec}»`, nodo.linea, nodo.col);
    if (clave.indexOf(SEP_MODULO) >= 0)
      throw new ErrorFuente('módulos', `la clave de «${espec}» trae un byte cero`, nodo.linea, nodo.col);
    return clave;
  }

  astDe(clave, nodo) {
    if (this.ast.has(clave)) return this.ast.get(clave);
    let fuente;
    try { fuente = this.cargador.leer(clave); }
    catch (e) { throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col); }
    if (typeof fuente !== 'string')
      throw new ErrorFuente('módulos', `«${rutaCorta(clave)}» no se pudo leer`, nodo.linea, nodo.col);
    let a;
    try { a = parser(lexer(fuente), clave); }
    catch (e) {
      // El error es del módulo, no del archivo que lo importa: su línea y su
      // columna son las de allí, y hay que decir de qué archivo se habla.
      if (e && e.esErrorFuente) { e.archivo = rutaCorta(clave); throw e; }
      throw new ErrorFuente('módulos', String((e && e.message) || e), nodo.linea, nodo.col);
    }
    this.ast.set(clave, a);
    this.orden.push(clave);
    return a;
  }

  exportaDe(clave, nodo) {
    if (this.exporta.has(clave)) return this.exporta.get(clave);
    const ex = exportacionesDe(this.astDe(clave, nodo));
    this.exporta.set(clave, ex);
    return ex;
  }
}

// ------------------------------------------------------------------- el enlace
// Un «enlace» es lo que el compilador y el JIT necesitan saber de un archivo
// para traducir sus nombres: cuáles son suyos, cuáles vienen de fuera, y qué
// alias corresponde a qué módulo.
//
//   clave     la del archivo, o null para el programa principal
//   propias   sus declaraciones de nivel superior
//   nombres   nombre → { clave, global, tipo }     (usar a, b de "…")
//   alias     alias  → { clave, ruta, exporta }    (usar "…" como m)
//   deps      claves de los módulos que importa, en orden
//
// El programa principal tiene enlace pero no clave: sus globales NO llevan
// prefijo. No es una excepción por comodidad — es lo que mantiene su bytecode
// libre de rutas absolutas, y por tanto un .elb portable.
function enlazar(ast, clave, mods, errores, avisos, globalesTipos) {
  const enl = { clave: clave || null, propias: new Set(), nombres: new Map(), alias: new Map(), deps: [] };
  // Desde dónde se resuelven las rutas relativas: el archivo en el que está
  // escrito el «usar». Para un módulo es su clave; para el programa principal,
  // que no tiene clave porque sus globales no llevan prefijo, es la ruta con la
  // que el anfitrión lo abrió. Confundir las dos cosas hacía que el programa
  // principal resolviera contra el directorio de trabajo: funcionaba mientras se
  // lanzara desde la carpeta del programa y fallaba en cuanto no.
  const desde = clave || mods.claveRaiz || null;
  for (const s of ast.cuerpo)
    if (s.tipo === 'DeclVar' || s.tipo === 'DeclFuncion') enl.propias.add(s.nombre);

  const ocupado = n => enl.propias.has(n) || enl.nombres.has(n) || enl.alias.has(n);
  const avisarSiTapa = (nodo, n) => {
    if (globalesTipos && Object.prototype.hasOwnProperty.call(globalesTipos, n))
      avisos.push(new ErrorFuente('nombres', `lo importado como «${n}» tapa a la «${n}» de la biblioteca`,
        nodo.linea, nodo.col, `a partir de aquí «${n}» ya no es la de Ñ; si no era la idea, tráelo con «usar … como …»`));
  };

  for (const s of ast.cuerpo) {
    if (s.tipo !== 'Usar') continue;
    let destino, exporta;
    // Primero los nativos. No es un atajo: es lo que hace que el nombre desnudo
    // signifique lo mismo en todas partes, y lo que evita que resolver un eDSL
    // dependa de que exista un disco.
    const nat = mods.edsls.get(s.ruta);
    if (nat) {
      destino = nat.clave;
      exporta = nat.exporta;
    } else try {
      destino = mods.resolver(s.ruta, desde, s);
      if (mods.claveRaiz && destino === mods.claveRaiz)
        throw new ErrorFuente('módulos', `«${s.ruta}» es el programa principal, y el programa principal no es un módulo`,
          s.linea, s.col, 'mueve a un archivo aparte lo que quieras compartir');
      exporta = mods.exportaDe(destino, s);
    } catch (e) {
      errores.push(e && e.esErrorFuente ? e : new ErrorFuente('módulos', String((e && e.message) || e), s.linea, s.col));
      continue;
    }
    s.claveResuelta = destino;
    if (!enl.deps.includes(destino)) enl.deps.push(destino);
    if (!exporta.size)
      avisos.push(new ErrorFuente('módulos', `«${s.ruta}» no exporta nada`, s.linea, s.col,
        'marca con «publico» lo que deba verse desde fuera'));

    // «usar "x"» a secas: todo lo que exporte, con su nombre, sin cualificar.
    // Es como escribir la lista entera a mano, así que pasa por el mismo camino
    // —enl.nombres— y el compilador, el JIT y el verificador no se enteran.
    if (s.todo) {
      for (const [nm, tipo] of exporta) {
        if (ocupado(nm)) {
          // Lo propio del archivo gana, en silencio: quien escribe «usar
          // "clasico"» y además define su propia «media» quiere la suya.
          continue;
        }
        avisarSiTapa(s, nm);
        enl.nombres.set(nm, {
          clave: destino, ruta: s.ruta, tipo, deTodo: true,
          // «clasico» reexporta: su global de verdad está en el eDSL de donde
          // salió el nombre, no bajo la clave de «clasico».
          global: (nat && nat.globalDe) ? nat.globalDe.get(nm) : nombreGlobalModulo(destino, nm),
          deClasico: !!(nat && nat.globalDe),
          nombre: nm,
          edslOrigen: (nat && nat.origenDe) ? nat.origenDe.get(nm) : null,
          cuantosTraia: exporta.size,
        });
      }
      continue;
    }

    if (s.alias) {
      if (ocupado(s.alias)) {
        errores.push(new ErrorFuente('módulos', `«${s.alias}» ya está usado en este archivo`, s.linea, s.col));
        continue;
      }
      avisarSiTapa(s, s.alias);
      enl.alias.set(s.alias, { clave: destino, ruta: s.ruta, exporta,
        globalDe: (nat && nat.globalDe) || null });
      continue;
    }
    for (const nm of s.nombres) {
      if (!exporta.has(nm.nombre)) {
        errores.push(new ErrorFuente('módulos', `«${s.ruta}» no exporta «${nm.nombre}»`, nm.linea, nm.col,
          exporta.size ? 'exporta: ' + [...exporta.keys()].join(', ') : 'no exporta nada: márcalo con «publico»'));
        continue;
      }
      if (ocupado(nm.nombre)) {
        errores.push(new ErrorFuente('módulos', `«${nm.nombre}» ya está usado en este archivo`, nm.linea, nm.col));
        continue;
      }
      avisarSiTapa(nm, nm.nombre);
      enl.nombres.set(nm.nombre, {
        clave: destino, ruta: s.ruta,
        global: (nat && nat.globalDe) ? nat.globalDe.get(nm.nombre) : nombreGlobalModulo(destino, nm.nombre),
        tipo: exporta.get(nm.nombre),
      });
    }
  }
  return enl;
}

// A qué global se refiere un nombre libre de este archivo. Lo usan el
// compilador y el JIT, y tienen que decir lo mismo: si se separan, una función
// da un resultado distinto a partir de su cuadragésima llamada.
function globalDeEnlace(enl, nombre) {
  if (!enl) return nombre;
  const imp = enl.nombres.get(nombre);
  if (imp) return imp.global;
  if (enl.clave && enl.propias.has(nombre)) return nombreGlobalModulo(enl.clave, nombre);
  return nombre;                      // de la biblioteca, o no existe
}

// «m.algo» donde m es el alias de un módulo → el global de allí. Devuelve null
// si m no es un alias, y entonces es un acceso a propiedad de los de siempre.
function miembroDeEnlace(enl, alias, miembro) {
  if (!enl) return null;
  const a = enl.alias.get(alias);
  if (!a) return null;
  return a.globalDe ? (a.globalDe.get(miembro) || nombreGlobalModulo(a.clave, miembro))
    : nombreGlobalModulo(a.clave, miembro);
}

if (typeof module !== 'undefined') module.exports = {
  SEP_MODULO, CLAVE_EDSL, claveEdsl, nombreGlobalModulo, rutaCorta, mensajeNoDefinida,
  exportacionesDe, Modulos, enlazar, globalDeEnlace, miembroDeEnlace,
};
