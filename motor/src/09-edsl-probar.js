// ============================================================================
//  Ñ v4 — eDSL «probar»: para que Ñ se pruebe a sí mismo
//  Parte 9.
//
//  Se importa con:  usar "probar"
//
//  Hay un detalle que dice mucho del estado del proyecto: las pruebas de Ñ
//  están escritas en JavaScript. El lenguaje no podía probarse a sí mismo, y
//  eso encarece cada eDSL nuevo —cincuenta funciones nuevas significan
//  cincuenta bloques de prueba en otro lenguaje—. Esto es lo que lo arregla.
//
//  LO ÚNICO DELICADO: correr una prueba que falla sin tumbar el programa. Una
//  afirmación fallida llama a vm.error(), que lanza; si nadie recoge, el
//  programa entero se cae y la segunda prueba no llega a correr. Recogerlo en
//  una nativa deja la VM a medio desenrollar —marcos empujados, pila de
//  valores alta, upvalues abiertos apuntando a ranuras muertas—, así que el
//  corredor tiene que hacer desde fuera lo mismo que hace «desenrollar» por
//  dentro: recortar los marcos, bajar la pila y cerrar los upvalues.
//
//  Y una cosa que NO se recoge: el límite de instrucciones. Si se capturara,
//  una prueba con un bucle infinito desactivaría la única red que hay contra
//  los bucles infinitos. Se vuelve a lanzar tal cual.
// ============================================================================
'use strict';

function instalarProbar(vm) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const fn_ = (v, n, f) => vm.exigeFuncion(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const num = (v, n, f) => vm.exigeNum(v, n, f);

  // El estado es de este motor, no global: dos motores no comparten pruebas.
  const est = {
    casos: [],            // { nombre, fn, grupo, saltada, solo }
    pila: [],             // los grupos abiertos, mientras se registran
    antesTodo: [], despuesTodo: [], antesCada: [], despuesCada: [],
    corriendo: false,
    afirmaciones: 0,
    ultimo: { pasan: 0, fallan: 0, saltadas: 0, fallos: [] },
    soloFallos: false,
    semilla: null,
    espias: new Map(),    // el objeto espía → sus llamadas
  };

  // Corre una función de Ñ y devuelve el error si falló, o null si pasó. Deja
  // la VM como estaba: es el desenrollado de «intentar», hecho desde fuera.
  function aislado(f) {
    const sp = vm.sp, marcos = vm.frames.length, prof = vm.profJS, instr = vm.instrucciones;
    try { vm.invocar(f, []); return null; }
    catch (e) {
      // El presupuesto de instrucciones no es capturable, ni aquí ni en
      // «intentar»: una prueba con un bucle infinito se lleva el programa, que
      // es lo correcto. Un «lanzar» que nadie recogió SÍ se apunta: viene
      // marcado «fatal» porque la VM ya desenrolló y no tiene a quién dárselo,
      // pero para una prueba es un fallo como cualquier otro.
      if (e && e.limite) throw e;
      vm.cerrarUpvalues(sp);
      vm.frames.length = marcos;
      vm.sp = sp;
      vm.profJS = prof;
      // El contador de instrucciones no se rebobina: lo gastado está gastado, y
      // si no, una prueba en bucle podría gastar el presupuesto infinitas veces.
      if (vm.instrucciones < instr) vm.instrucciones = instr;
      return e;
    }
  }
  const mensajeDe = e => (e && (e.pista ? `${e.message}\n      ↳ ${e.pista}` : e.message)) || String(e);

  // Una afirmación fallida es un error normal del motor: así funciona igual
  // dentro de una prueba (la recoge el corredor) y fuera de ella (se cae el
  // programa, que es lo que se quiere si alguien afirma en producción).
  function falla(msg, pista) { vm.error(msg, pista); }
  const cuenta = () => { est.afirmaciones++; };
  const v = x => repr(x, 1);

  const nombreLargo = c => (c.grupo ? c.grupo + ' › ' + c.nombre : c.nombre);

  // Baraja con una semilla, para que el orden sea distinto pero repetible. Una
  // suite que solo pasa en un orden tiene una dependencia escondida, y esto es
  // lo que la saca a la luz sin volverse imposible de reproducir.
  function barajar(xs, semilla) {
    let s = semilla >>> 0 || 1;
    const sig = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(sig() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
    return xs;
  }

  return function (def) {
    // ──────────────────────────────────────────────────────────── estructura
    const registra = (nombre, f, extra) => {
      est.casos.push(Object.assign({
        nombre, fn: f, grupo: est.pila.join(' › '), saltada: false, solo: false,
      }, extra || {}));
      return null;
    };
    def('probar', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'probar'), fn_(a[1], 2, 'probar')),
      'probar("suma dos números", fn() { … }) — registra; no corre hasta correrPruebas()');
    def('saltar', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'saltar'), fn_(a[1], 2, 'saltar'), { saltada: true }),
      'como probar, pero no se ejecuta — sale contada aparte, no escondida');
    def('soloEsta', 'texto, funcion -> nulo', a =>
      registra(txt(a[0], 1, 'soloEsta'), fn_(a[1], 2, 'soloEsta'), { solo: true }),
      'si alguna prueba es «soloEsta», solo corren esas — para depurar una');
    def('grupo', 'texto, funcion -> nulo', a => {
      est.pila.push(txt(a[0], 1, 'grupo'));
      // El cuerpo del grupo corre YA, y lo que hace es registrar: si falla al
      // registrar, el fallo es del archivo de pruebas y tiene que verse entero.
      try { vm.invocar(fn_(a[1], 2, 'grupo'), []); }
      finally { est.pila.pop(); }
      return null;
    }, 'grupo("el eDSL fecha", fn() { … }) — agrupa y se puede anidar');
    const gancho = (nombre, lista, doc) => def(nombre, 'funcion -> nulo', a => {
      lista.push(fn_(a[0], 1, nombre)); return null;
    }, doc);
    gancho('antesDeTodo', est.antesTodo, 'corre una vez, antes de la primera prueba');
    gancho('despuesDeTodo', est.despuesTodo, 'corre una vez, después de la última');
    gancho('antesDeCada', est.antesCada, 'corre antes de cada prueba');
    gancho('despuesDeCada', est.despuesCada, 'corre después de cada prueba, pase o falle');

    // ───────────────────────────────────────────────────────── afirmaciones
    def('debeSer', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      // Compara en profundidad, como «==» del lenguaje: dos listas iguales lo son.
      if (iguales(a[0], a[1])) return null;
      // Dos decimales distintos pueden IMPRIMIRSE igual: repr recorta a 15
      // cifras. Sin esto, el mensaje era «se esperaba 0.12 y llegó 0.12» y no
      // decía nada — pasó con (1 + 0.12)^1 - 1, que no es exactamente 0.12.
      if (v(a[0]) === v(a[1]) && typeof a[0] === 'number' && typeof a[1] === 'number')
        falla(`los dos se imprimen «${v(a[0])}» pero no son el mismo número: ` +
          `llegó ${a[0].toPrecision(17)} y se esperaba ${a[1].toPrecision(17)}`,
          'con decimales, «debeSerCerca» es lo que se quiere casi siempre');
      falla(`se esperaba ${v(a[1])} y llegó ${v(a[0])}`);
      return null;
    }, 'debeSer(loQueSalio, loQueSeEsperaba) — compara en profundidad');
    def('noDebeSer', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (iguales(a[0], a[1])) falla(`no se esperaba ${v(a[1])}, y es lo que llegó`);
      return null;
    }, 'que los dos valores NO sean iguales');
    def('debeSerCierto', 'cualquiera -> nulo', a => {
      cuenta();
      if (!verdad(a[0])) falla(`se esperaba algo cierto y llegó ${v(a[0])}`);
      return null;
    }, 'con la misma regla de verdad que «si»');
    def('debeSerFalso', 'cualquiera -> nulo', a => {
      cuenta();
      if (verdad(a[0])) falla(`se esperaba algo falso y llegó ${v(a[0])}`);
      return null;
    }, 'lo contrario de debeSerCierto');
    def('debeSerCerca', '... -> nulo', a => {
      cuenta();
      const x = num(a[0], 1, 'debeSerCerca'), y = num(a[1], 2, 'debeSerCerca');
      const tol = a.length > 2 ? num(a[2], 3, 'debeSerCerca') : 1e-9;
      if (Math.abs(x - y) > tol) falla(`${x} no está a menos de ${tol} de ${y}`);
      return null;
    }, 'debeSerCerca(a, b, tolerancia?) — para números con decimales');
    const comparar = (nombre, ok, texto) => def(nombre, 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      vm.cmp(a[0], a[1], nombre);
      if (!ok(a[0], a[1])) falla(`${v(a[0])} no es ${texto} ${v(a[1])}`);
      return null;
    }, `que el primero sea ${texto} el segundo · también vale para fechas`);
    comparar('debeSerMayor', (x, y) => x > y, 'mayor que');
    comparar('debeSerMenor', (x, y) => x < y, 'menor que');
    comparar('debeSerAlMenos', (x, y) => x >= y, 'al menos');
    comparar('debeSerComoMucho', (x, y) => x <= y, 'como mucho');
    def('debeContener', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (!vm.contiene(a[0], a[1])) falla(`${v(a[0])} no contiene ${v(a[1])}`);
      return null;
    }, 'en un texto, una lista o las claves de un diccionario');
    def('noDebeContener', 'cualquiera, cualquiera -> nulo', a => {
      cuenta();
      if (vm.contiene(a[0], a[1])) falla(`${v(a[0])} contiene ${v(a[1])}, y no debía`);
      return null;
    }, 'lo contrario de debeContener');
    def('debeEmpezarCon', 'texto, texto -> nulo', a => {
      cuenta();
      const s = txt(a[0], 1, 'debeEmpezarCon'), p = txt(a[1], 2, 'debeEmpezarCon');
      if (!s.startsWith(p)) falla(`${v(s)} no empieza con ${v(p)}`);
      return null;
    }, 'que un texto empiece por ese trozo');
    def('debeTerminarCon', 'texto, texto -> nulo', a => {
      cuenta();
      const s = txt(a[0], 1, 'debeTerminarCon'), p = txt(a[1], 2, 'debeTerminarCon');
      if (!s.endsWith(p)) falla(`${v(s)} no termina con ${v(p)}`);
      return null;
    }, 'que un texto termine en ese trozo');
    def('debeEstarVacio', 'cualquiera -> nulo', a => {
      cuenta();
      if (vm.longitud(a[0]) !== 0) falla(`${v(a[0])} no está vacío`);
      return null;
    }, 'un texto, una lista o un diccionario sin nada dentro');
    def('debeTener', 'cualquiera, entero -> nulo', a => {
      cuenta();
      const n = vm.longitud(a[0]);
      if (n !== num(a[1], 2, 'debeTener')) falla(`se esperaban ${a[1]} elementos y hay ${n}`);
      return null;
    }, 'debeTener(lista, 3) — comprueba la longitud');
    def('debeSerTipo', 'cualquiera, texto -> nulo', a => {
      cuenta();
      const t = tipoDe(a[0]), q = txt(a[1], 2, 'debeSerTipo');
      if (t !== q) falla(`se esperaba un valor de tipo ${q} y llegó ${t}`);
      return null;
    }, 'debeSerTipo(f, "fecha")');

    // ────────────────────────────────────────────────────────────── errores
    def('debeFallar', 'funcion -> texto', a => {
      cuenta();
      const e = aislado(fn_(a[0], 1, 'debeFallar'));
      if (!e) falla('se esperaba un fallo y no falló');
      return e.message || String(e);
    }, 'debeFallar(fn() { … }) — y devuelve el mensaje, para mirarlo');
    def('noDebeFallar', 'funcion -> nulo', a => {
      cuenta();
      const e = aislado(fn_(a[0], 1, 'noDebeFallar'));
      if (e) falla('no debía fallar y falló: ' + (e.message || String(e)));
      return null;
    }, 'que un trozo corra sin fallar');
    def('debeFallarCon', 'funcion, texto -> nulo', a => {
      cuenta();
      const esperado = txt(a[1], 2, 'debeFallarCon');
      const e = aislado(fn_(a[0], 1, 'debeFallarCon'));
      if (!e) falla(`se esperaba un fallo con «${esperado}» y no falló`);
      const m = e.message || String(e);
      if (m.indexOf(esperado) < 0) falla(`el fallo dice «${m}» y se esperaba que dijera «${esperado}»`);
      return null;
    }, 'debeFallarCon(fn() { … }, "división entre cero") — comprueba el mensaje');

    // ─────────────────────────────────────────────────────────────── dobles
    def('espia', 'funcion -> funcion', a => {
      const original = fn_(a[0], 1, 'espia');
      const llamadas = [];
      // El espía es una nativa de aridad variable que apunta y delega. Para Ñ
      // es una función como cualquier otra, así que se puede pasar a donde
      // esperen una función.
      const nombre = ' espia' + est.espias.size;
      vm.definirNativa(nombre, '... -> cualquiera', args => {
        llamadas.push(L(args.slice()));
        return vm.invocar(original, args);
      }, 'espía');
      const obj = vm.globals.get(nombre);
      vm.globals.delete(nombre);   // no debe quedar visible como un global
      est.espias.set(obj, llamadas);
      return obj;
    }, 'envuelve una función y apunta con qué se la llamó, sin cambiar lo que hace');
    def('llamadasDe', 'funcion -> lista', a => {
      const l = est.espias.get(a[0]);
      if (!l) vm.error('«llamadasDe»: eso no es un espía', 'envuélvelo antes con espia(f)');
      return L(l.slice());
    }, 'la lista de llamadas, cada una con sus argumentos');
    def('vecesLlamada', 'funcion -> entero', a => {
      const l = est.espias.get(a[0]);
      if (!l) vm.error('«vecesLlamada»: eso no es un espía', 'envuélvelo antes con espia(f)');
      return l.length;
    }, 'cuántas veces se llamó al espía');

    // ─────────────────────────────────────────────────────────────── correr
    def('soloFallos', 'bool -> nulo', a => { est.soloFallos = verdad(a[0]); return null; },
      'que solo se impriman las que fallan — para una suite grande');
    def('semillaPruebas', 'entero -> nulo', a => { est.semilla = num(a[0], 1, 'semillaPruebas'); return null; },
      'baraja el orden, repetible — saca a la luz las pruebas que dependen del orden');
    def('afirmaciones', ' -> entero', () => est.afirmaciones,
      'cuántas afirmaciones se han comprobado en total');
    def('correrPruebas', ' -> dic<texto,entero>', () => {
      if (est.corriendo) vm.error('«correrPruebas» ya está corriendo', 'no se puede llamar desde dentro de una prueba');
      est.corriendo = true;
      const haySolo = est.casos.some(c => c.solo);
      let casos = est.casos.slice();
      if (est.semilla !== null) barajar(casos, est.semilla);
      const res = { pasan: 0, fallan: 0, saltadas: 0, fallos: [] };
      const gancho = (lista, donde) => {
        for (const g of lista) {
          const e = aislado(g);
          if (e) { res.fallan++; res.fallos.push(`${donde}: ${mensajeDe(e)}`); vm.salida(`  ✗ ${donde}\n      → ${mensajeDe(e)}`); }
        }
      };
      gancho(est.antesTodo, 'antesDeTodo');
      let grupoActual = null;
      for (const c of casos) {
        if (c.grupo !== grupoActual) {
          grupoActual = c.grupo;
          if (grupoActual && !est.soloFallos) vm.salida('\n── ' + grupoActual);
        }
        if (c.saltada || (haySolo && !c.solo)) {
          res.saltadas++;
          if (!est.soloFallos) vm.salida(`  · ${c.nombre} (saltada)`);
          continue;
        }
        gancho(est.antesCada, 'antesDeCada');
        const e = aislado(c.fn);
        gancho(est.despuesCada, 'despuesDeCada');
        if (e) {
          res.fallan++;
          res.fallos.push(`${nombreLargo(c)}: ${mensajeDe(e)}`);
          vm.salida(`  ✗ ${c.nombre}\n      → ${mensajeDe(e)}`);
        } else {
          res.pasan++;
          if (!est.soloFallos) vm.salida(`  ✓ ${c.nombre}`);
        }
      }
      gancho(est.despuesTodo, 'despuesDeTodo');
      est.corriendo = false;
      est.ultimo = res;
      // Las pruebas ya corridas se descartan: llamar dos veces no las repite,
      // y así un archivo puede registrar más y volver a correr solo las nuevas.
      est.casos = [];
      const d = D();
      d.mapa.set('pasan', res.pasan);
      d.mapa.set('fallan', res.fallan);
      d.mapa.set('saltadas', res.saltadas);
      return d;
    }, 'corre todo lo registrado, lo imprime y devuelve {pasan, fallan, saltadas}');
    def('resumenPruebas', ' -> texto', () => {
      const r = est.ultimo;
      const l = [`${r.pasan} pasan, ${r.fallan} fallan` + (r.saltadas ? `, ${r.saltadas} saltadas` : '') +
        ` · ${est.afirmaciones} afirmaciones`];
      if (r.fallos.length) { l.push(''); for (const f of r.fallos) l.push('  ✗ ' + f); }
      return l.join('\n');
    }, 'la última corrida en una línea, con la lista de fallos si hubo');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarProbar };
