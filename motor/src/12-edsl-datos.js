// ============================================================================
//  Ñ v4 — eDSL «datos»: tablas con columnas, tipos y esquema
//  Parte 12.
//
//  Se importa con:  usar "datos"
//
//  EL PROBLEMA QUE RESUELVE. El trabajo más común fuera de la web es leer una
//  tabla, agrupar y sumar. Hacerlo con una lista de diccionarios funciona hasta
//  que alguien añade una columna y el «fila[3]» pasa a significar otra cosa en
//  silencio. Con un tipo, las columnas tienen nombre y tienen tipo, y el
//  verificador sabe que «fn informe(): tabla» devuelve una.
//
//  EL FORMATO .ñdatos. El CSV pierde tres cosas y no hay forma de recuperarlas:
//
//    · los TIPOS. Todo vuelve como texto. Una columna de fechas deja de ser de
//      fechas, y una de números hay que convertirla a mano cada vez.
//    · los NULOS. Un campo vacío y un texto vacío son el mismo campo vacío.
//    · el ESQUEMA. No hay forma de saber qué columnas debía traer el archivo,
//      así que un CSV con una columna de menos se lee como si estuviera bien.
//
//  Así que «datos» trae su propio formato, que es JSON con esquema:
//
//    {
//      "ñdatos": 1,
//      "columnas": [{"nombre": "ciudad", "tipo": "texto"},
//                   {"nombre": "dia",    "tipo": "fecha"},
//                   {"nombre": "ventas", "tipo": "entero"}],
//      "filas": 2,
//      "datos": [["Girón", "Bogotá"],
//                ["2026-09-01", "2026-09-02"],
//                [1200, null]]
//    }
//
//  Por COLUMNAS y no por filas, a propósito: el tipo se declara una vez por
//  columna en vez de adivinarse celda a celda, no se repiten los nombres en
//  cada fila, y es como la tabla está guardada por dentro, así que leer y
//  escribir no traduce nada. El nulo es el null de JSON, distinguible del texto
//  vacío. Y la versión está ahí para poder cambiar el formato sin romper los
//  archivos de antes.
//
//  La ida y vuelta es EXACTA, fechas incluidas. Eso es todo lo que el formato
//  promete, y es lo que el CSV no puede prometer.
//
//  El CSV sigue estando, porque hay que intercambiar con el mundo: «deCsv»
//  adivina los tipos al leer —entero, real, fecha, bool, texto, en ese orden— y
//  «aCsv» escribe lo que Excel espera. Lo que se pierde al pasar por él se ve
//  en un caso: un NIT «0012345» vuelve como el número 12345, y un texto vacío
//  vuelve como un hueco. Con .ñdatos los dos vuelven tal cual.
//
//  LO QUE NO SE SOBRECARGA, Y POR QUÉ. La propuesta original decía que
//  «filtrar», «mapear» y «ordenar» del núcleo funcionaran sobre una tabla.
//  «longitud» sí —cuántas filas tiene una tabla no tiene otra respuesta—, pero
//  los otros tres no, porque no hay una respuesta única:
//
//    filtrar(t, fn)   sería exactamente «donde», y «donde» se lee mejor
//    mapear(t, fn)    ¿devuelve una tabla, una lista, otra columna?
//    ordenar(t)       ¿por cuál de las columnas?
//
//  Tener dos nombres para lo mismo es peor que cualquiera de los dos, y un
//  nombre cuya respuesta hay que adivinar es peor todavía. Así que la tabla
//  tiene sus propios verbos: «donde», «ordenarPor», «aplicarA».
// ============================================================================
'use strict';

const TIPOS_TABLA = ['entero', 'real', 'texto', 'bool', 'fecha', 'cualquiera'];
const VERSION_DATOS = 1;

// Qué tipo tiene una columna, mirando sus valores. El orden importa: lo que
// cabe en «entero» no debe salir como «real», y lo que parece fecha no debe
// salir como texto. Un nulo no cuenta para decidir.
function inferirTipo(vals) {
  let hay = false, todoEnt = true, todoNum = true, todoBool = true, todoFecha = true;
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    hay = true;
    if (typeof v === 'number') { todoBool = false; todoFecha = false; if (!Number.isInteger(v)) todoEnt = false; continue; }
    todoEnt = false; todoNum = false;
    if (typeof v === 'boolean') { todoFecha = false; continue; }
    todoBool = false;
    if (!(v instanceof ObjFecha)) todoFecha = false;
  }
  if (!hay) return 'cualquiera';
  if (todoEnt) return 'entero';
  if (todoNum) return 'real';
  if (todoBool) return 'bool';
  if (todoFecha) return 'fecha';
  return 'texto';
}

function instalarDatos(vm) {
  const L = items => vm.nuevaLista(items);
  const D = () => vm.nuevoDic();
  const num = (v, n, f) => vm.exigeNum(v, n, f);
  const ent = (v, n, f) => vm.exigeEnt(v, n, f);
  const txt = (v, n, f) => vm.exigeTexto(v, n, f);
  const lst = (v, n, f) => vm.exigeLista(v, n, f);
  const tab = (v, n, f) => {
    if (!(v instanceof ObjTabla)) vm.error(`«${f}»: el argumento ${n} debe ser una tabla y es ${tipoDe(v)}`);
    return v;
  };
  const dic = (v, n, f) => {
    if (!(v instanceof ObjDic)) vm.error(`«${f}»: el argumento ${n} debe ser un diccionario y es ${tipoDe(v)}`);
    return v;
  };
  // El índice de una columna, o un error que dice las que hay: buscar una
  // columna que no existe es el fallo más común y merece un mensaje bueno.
  const iCol = (t, nombre, f) => {
    const i = t.indiceCol(nombre);
    if (i < 0) vm.error(`«${f}»: la tabla no tiene una columna «${nombre}»`,
      t.cols.length ? 'tiene: ' + t.cols.map(c => c.nombre).join(', ') : 'la tabla no tiene columnas');
    return i;
  };
  const nueva = (cols, datos) => vm.nuevaTabla(cols, datos);
  const copiaCols = t => t.cols.map(c => ({ nombre: c.nombre, tipo: c.tipo }));
  // Reordena una tabla según una lista de índices de fila. Es la operación que
  // está debajo de filtrar, ordenar, quitar repetidos y agrupar.
  const porFilas = (t, idx) => nueva(copiaCols(t), t.datos.map(col => idx.map(i => col[i])));
  const nulo = v => v === null || v === undefined || v === '';

  // ── el formato .ñdatos ─────────────────────────────────────────────────────
  const aJsonValor = (v, tipo) => {
    if (v === null || v === undefined) return null;
    if (tipo === 'fecha') return v instanceof ObjFecha ? isoDeFecha(v) : null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    return repr(v, 1);
  };
  const deJsonValor = (v, tipo, col, fila) => {
    if (v === null || v === undefined) return null;
    if (tipo === 'fecha') {
      if (typeof v !== 'string') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer una fecha`);
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
      if (!m) vm.error(`«deDatos»: «${v}» no es una fecha en la columna «${col}», fila ${fila}`,
        'el formato guarda las fechas como 2026-09-29 o 2026-09-29 14:30:00');
      return vm.nuevaFecha(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0').padEnd(3, '0'))));
    }
    if (tipo === 'entero' || tipo === 'real') {
      if (typeof v !== 'number') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer un número y trae ${typeof v}`);
      return tipo === 'entero' ? Math.trunc(v) : v;
    }
    if (tipo === 'bool') {
      if (typeof v !== 'boolean') vm.error(`«deDatos»: la columna «${col}», fila ${fila}, debía traer verdadero o falso`);
      return v;
    }
    if (tipo === 'texto') return typeof v === 'string' ? v : String(v);
    return v;
  };

  // ── CSV ────────────────────────────────────────────────────────────────────
  // Un lector de CSV de verdad: comillas, comas dentro de las comillas, y las
  // comillas dobladas. Partir por comas falla con el primer «Pérez, Ana».
  function filasCsv(texto, sep) {
    const filas = [];
    let fila = [], campo = '', enComillas = false, i = 0;
    const n = texto.length;
    while (i < n) {
      const c = texto[i];
      if (enComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          enComillas = false; i++; continue;
        }
        campo += c; i++; continue;
      }
      if (c === '"' && campo === '') { enComillas = true; i++; continue; }
      if (c === sep) { fila.push(campo); campo = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; i++; continue; }
      campo += c; i++;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }
  // Adivina el tipo de un campo de texto. El orden es el que no pierde
  // información: lo que es entero no sale como real, y lo que es fecha no sale
  // como texto. Lo que no encaja en nada se queda como texto, que nunca miente.
  function leerCampo(s) {
    const t = s.trim();
    if (t === '') return null;
    if (/^-?\d+$/.test(t)) { const n = +t; if (Number.isSafeInteger(n)) return n; }
    if (/^-?\d+[.,]\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
    if (/^(cierto|verdadero|si|sí|true)$/i.test(t)) return true;
    if (/^(falso|no|false)$/i.test(t)) return false;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return vm.nuevaFecha(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return vm.nuevaFecha(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return s;
  }

  // ── los agregadores ────────────────────────────────────────────────────────
  // «sumaCol("ventas")» no suma: describe una suma. Lo que devuelve es una
  // receta que «agrupar» y «resumir» aplican a cada grupo, y eso es lo que
  // permite pedir varios resúmenes en una sola llamada sin inventar un tipo
  // nuevo para «tabla agrupada».
  const RECETAS = new WeakMap();
  const receta = (clase, col, fn) => {
    const d = D();
    d.mapa.set('agregado', clase);
    if (col !== null) d.mapa.set('columna', col);
    RECETAS.set(d, { clase, col, fn });
    return d;
  };
  const esReceta = v => v instanceof ObjDic && RECETAS.has(v);

  return function (def) {
    // ══════════════════════════════════════════════════════════════ entrar
    // Los cinco caminos de entrada se llaman «deAlgo» y los cinco de salida
    // «aAlgo», y cada par es el inverso del otro. Este se llamaba «tabla», que
    // era el nombre natural hasta que se vio que «tabla» ya existe dos veces
    // más: es el nombre del TIPO y es la función que arma un <table> en una
    // página. Tres cosas distintas con un nombre es la clase de error que este
    // lenguaje quiere quitar, no repartir.
    def('deRegistros', 'lista -> tabla', a => {
      // De una lista de diccionarios: las columnas salen del PRIMERO y en ese
      // orden. Un registro que traiga una clave de más se queja, porque callarlo
      // es perder datos sin avisar.
      const l = lst(a[0], 1, 'deRegistros');
      if (!l.items.length) return nueva([], []);
      const p = l.items[0];
      if (!(p instanceof ObjDic)) vm.error('«deRegistros»: se esperaba una lista de diccionarios');
      const nombres = [...p.mapa.keys()].map(String);
      const datos = nombres.map(() => []);
      for (let f = 0; f < l.items.length; f++) {
        const r = l.items[f];
        if (!(r instanceof ObjDic)) vm.error(`«deRegistros»: el elemento ${f + 1} no es un diccionario`);
        for (const k of r.mapa.keys()) if (!nombres.includes(String(k)))
          vm.error(`«deRegistros»: el registro ${f + 1} trae «${k}», que no está en el primero`,
            'todos los registros tienen que traer las mismas claves: ' + nombres.join(', '));
        nombres.forEach((n, c) => datos[c].push(r.mapa.has(n) ? r.mapa.get(n) : null));
      }
      vm.cobrar(nombres.length * l.items.length);
      return nueva(nombres.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deRegistros(lista de diccionarios) — las columnas salen del primer registro, en su orden');
    def('deColumnas', 'dic -> tabla', a => {
      const d = dic(a[0], 1, 'deColumnas');
      const nombres = [], datos = [];
      let filas = -1;
      for (const [k, v] of d.mapa) {
        if (!(v instanceof ObjLista)) vm.error(`«deColumnas»: «${k}» no es una lista`);
        if (filas < 0) filas = v.items.length;
        else if (v.items.length !== filas)
          vm.error(`«deColumnas»: «${k}» trae ${v.items.length} valores y las otras ${filas}`);
        nombres.push(String(k)); datos.push(v.items.slice());
      }
      return nueva(nombres.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deColumnas({"ciudad": [...], "ventas": [...]}) — una lista por columna');
    def('deLista', 'lista, lista -> tabla', a => {
      const fs = lst(a[0], 1, 'deLista').items, ns = lst(a[1], 2, 'deLista').items.map(String);
      const datos = ns.map(() => []);
      for (let f = 0; f < fs.length; f++) {
        const r = fs[f];
        if (!(r instanceof ObjLista)) vm.error(`«deLista»: la fila ${f + 1} no es una lista`);
        if (r.items.length !== ns.length)
          vm.error(`«deLista»: la fila ${f + 1} trae ${r.items.length} valores y hay ${ns.length} columnas`);
        ns.forEach((_, c) => datos[c].push(r.items[c]));
      }
      vm.cobrar(ns.length * fs.length);
      return nueva(ns.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deLista(filas, nombresDeColumna) — una lista de listas');
    def('deCsv', '... -> tabla', a => {
      const s = txt(a[0], 1, 'deCsv');
      const sep = a.length > 1 ? txt(a[1], 2, 'deCsv') : (s.split('\n')[0].includes(';') ? ';' : ',');
      const fs = filasCsv(s, sep);
      // Se descarta UNA sola línea final vacía: el salto con el que acaba todo
      // archivo de texto. Descartarlas todas perdía las filas en blanco de en
      // medio, que sí son datos.
      //
      // Y aquí hay un límite del CSV que no se puede arreglar: en una tabla de
      // UNA columna con los valores vacíos, la línea en blanco y el salto final
      // son el mismo carácter, así que el número de filas no sobrevive. Con
      // dos columnas o más la coma lo distingue («,» es una fila vacía) y no
      // pasa. Es otra razón de que exista .ñdatos.
      if (fs.length && fs[fs.length - 1].length === 1 && fs[fs.length - 1][0].trim() === '') fs.pop();
      if (!fs.length) return nueva([], []);
      const ns = fs[0].map(x => x.trim());
      const datos = ns.map(() => []);
      for (let f = 1; f < fs.length; f++) {
        const r = fs[f];
        ns.forEach((_, c) => datos[c].push(c < r.length ? leerCampo(r[c]) : null));
      }
      vm.cobrar(ns.length * fs.length);
      // Los tipos se adivinan aquí, que es lo que el CSV no trae. Por eso
      // «deCsv» y luego «aDatos» convierte un CSV en algo que ya no los pierde.
      return nueva(ns.map((n, c) => ({ nombre: n, tipo: inferirTipo(datos[c]) })), datos);
    }, 'deCsv(texto, separador?) — adivina el separador y los tipos · entiende comillas y comas dentro');
    def('deDatos', 'texto -> tabla', a => {
      const s = txt(a[0], 1, 'deDatos');
      let j;
      try { j = JSON.parse(s); }
      catch (e) { vm.error('«deDatos»: el texto no es JSON válido', String(e.message || e)); }
      if (!j || typeof j !== 'object' || Array.isArray(j))
        vm.error('«deDatos»: el JSON no es un documento .ñdatos', 'tiene que ser un objeto con «ñdatos», «columnas» y «datos»');
      const ver = j['ñdatos'];
      if (ver === undefined) vm.error('«deDatos»: falta la marca «ñdatos»',
        'esto no parece un archivo del formato; si es un CSV, usa «deCsv»');
      if (ver > VERSION_DATOS)
        vm.error(`«deDatos»: el archivo es del formato versión ${ver} y este motor entiende hasta la ${VERSION_DATOS}`);
      if (!Array.isArray(j.columnas) || !Array.isArray(j.datos))
        vm.error('«deDatos»: «columnas» y «datos» tienen que ser listas');
      if (j.columnas.length !== j.datos.length)
        vm.error(`«deDatos»: hay ${j.columnas.length} columnas declaradas y ${j.datos.length} listas de datos`);
      const cols = j.columnas.map((c, i) => {
        if (!c || typeof c.nombre !== 'string') vm.error(`«deDatos»: la columna ${i + 1} no trae nombre`);
        const tipo = c.tipo === undefined ? 'cualquiera' : c.tipo;
        if (!TIPOS_TABLA.includes(tipo))
          vm.error(`«deDatos»: «${tipo}» no es un tipo de columna`, 'los tipos son: ' + TIPOS_TABLA.join(', '));
        return { nombre: c.nombre, tipo };
      });
      // El esquema se comprueba: un archivo con una columna a medias se dice
      // aquí y no tres pasos después, cuando ya no se sabe de dónde vino.
      const filas = j.datos.length ? j.datos[0].length : 0;
      j.datos.forEach((col, i) => {
        if (!Array.isArray(col)) vm.error(`«deDatos»: los datos de «${cols[i].nombre}» no son una lista`);
        if (col.length !== filas)
          vm.error(`«deDatos»: «${cols[i].nombre}» trae ${col.length} valores y «${cols[0].nombre}» trae ${filas}`);
      });
      if (j.filas !== undefined && j.filas !== filas)
        vm.error(`«deDatos»: el archivo dice ${j.filas} filas y trae ${filas}`);
      vm.cobrar(cols.length * filas);
      return nueva(cols, j.datos.map((col, c) =>
        col.map((v, f) => deJsonValor(v, cols[c].tipo, cols[c].nombre, f + 1))));
    }, 'deDatos(texto) — lee el formato .ñdatos, comprobando el esquema y los tipos');

    // ══════════════════════════════════════════════════════════════════ salir
    def('aDatos', '... -> texto', a => {
      const t = tab(a[0], 1, 'aDatos');
      const bonito = a.length > 1 && verdad(a[1]);
      const doc = {
        'ñdatos': VERSION_DATOS,
        columnas: t.cols.map(c => ({ nombre: c.nombre, tipo: c.tipo })),
        filas: t.filas,
        datos: t.datos.map((col, c) => col.map(v => aJsonValor(v, t.cols[c].tipo))),
      };
      vm.cobrar(t.cols.length * t.filas);
      return JSON.stringify(doc, null, bonito ? 2 : 0);
    }, 'aDatos(tabla, bonito?) — el formato .ñdatos: ida y vuelta exacta, fechas incluidas');
    def('aCsv', '... -> texto', a => {
      const t = tab(a[0], 1, 'aCsv');
      const sep = a.length > 1 ? txt(a[1], 2, 'aCsv') : ',';
      const esc = v => {
        if (v === null || v === undefined) return '';
        const s = v instanceof ObjFecha ? isoDeFecha(v)
          : typeof v === 'string' ? v
            : v === true ? 'cierto' : v === false ? 'falso' : repr(v, 1);
        return new RegExp('["\n\r' + sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']').test(s)
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const out = [t.cols.map(c => esc(c.nombre)).join(sep)];
      for (let f = 0; f < t.filas; f++) out.push(t.datos.map(col => esc(col[f])).join(sep));
      vm.cobrar(t.cols.length * t.filas);
      return out.join('\n');
    }, 'aCsv(tabla, separador?) — lo que espera una hoja de cálculo · pierde los tipos, por eso existe aDatos');
    def('aLista', 'tabla -> lista', a => {
      const t = tab(a[0], 1, 'aLista');
      const out = [];
      for (let f = 0; f < t.filas; f++) out.push(L(t.datos.map(col => col[f])));
      return L(out);
    }, 'una lista de listas, una por fila');
    def('aRegistros', 'tabla -> lista', a => {
      const t = tab(a[0], 1, 'aRegistros');
      const out = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        out.push(d);
      }
      vm.cobrar(t.cols.length * t.filas);
      return L(out);
    }, 'una lista de diccionarios · lo contrario de «tabla»');
    def('aColumnas', 'tabla -> dic', a => {
      // El inverso exacto de «deColumnas»: deColumnas(aColumnas(t)) == t. Sirve
      // para sacar todas las columnas de una vez, cuando «columna» una por una
      // ya es ruido.
      const t = tab(a[0], 1, 'aColumnas');
      const d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, L(t.datos[i].slice())));
      vm.cobrar(t.cols.length * t.filas);
      return d;
    }, 'un diccionario de listas, una por columna · el inverso de deColumnas');

    // ════════════════════════════════════════════════ mirar antes de tocar
    def('columnas', 'tabla -> lista<texto>', a => L(tab(a[0], 1, 'columnas').cols.map(c => c.nombre)),
      'los nombres de las columnas, en su orden');
    def('tipos', 'tabla -> dic<texto,texto>', a => {
      const t = tab(a[0], 1, 'tipos'), d = D();
      for (const c of t.cols) d.mapa.set(c.nombre, c.tipo);
      return d;
    }, 'el tipo de cada columna · esto es lo que un CSV no trae');
    def('primeras', '... -> tabla', a => {
      const t = tab(a[0], 1, 'primeras'), n = a.length > 1 ? ent(a[1], 2, 'primeras') : 5;
      const idx = [];
      for (let i = 0; i < Math.min(Math.max(0, n), t.filas); i++) idx.push(i);
      return porFilas(t, idx);
    }, 'primeras(t, 5) — las primeras filas');
    def('ultimas', '... -> tabla', a => {
      const t = tab(a[0], 1, 'ultimas'), n = a.length > 1 ? ent(a[1], 2, 'ultimas') : 5;
      const idx = [];
      for (let i = Math.max(0, t.filas - Math.max(0, n)); i < t.filas; i++) idx.push(i);
      return porFilas(t, idx);
    }, 'las últimas filas');
    def('vacios', 'tabla -> dic<texto,entero>', a => {
      const t = tab(a[0], 1, 'vacios'), d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i].reduce((n, v) => n + (nulo(v) ? 1 : 0), 0)));
      return d;
    }, 'cuántos huecos tiene cada columna · lo primero que hay que mirar de un archivo ajeno');
    def('describir', 'tabla -> tabla', a => {
      // Una tabla que describe la tabla: así se puede filtrar, ordenar y
      // guardar como cualquier otra.
      const t = tab(a[0], 1, 'describir');
      const cn = [], ct = [], cv = [], cu = [], cmin = [], cmax = [], cmed = [];
      for (let i = 0; i < t.cols.length; i++) {
        const col = t.datos[i], vs = col.filter(v => !nulo(v));
        cn.push(t.cols[i].nombre); ct.push(t.cols[i].tipo);
        cv.push(col.length - vs.length);
        cu.push(new Set(vs.map(v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v)))).size);
        const nums = vs.filter(v => typeof v === 'number');
        if (nums.length === vs.length && nums.length) {
          cmin.push(Math.min.apply(null, nums));
          cmax.push(Math.max.apply(null, nums));
          cmed.push(nums.reduce((p, c) => p + c, 0) / nums.length);
        } else { cmin.push(null); cmax.push(null); cmed.push(null); }
      }
      vm.cobrar(t.cols.length * t.filas);
      return nueva([
        { nombre: 'columna', tipo: 'texto' }, { nombre: 'tipo', tipo: 'texto' },
        { nombre: 'vacios', tipo: 'entero' }, { nombre: 'distintos', tipo: 'entero' },
        { nombre: 'minimo', tipo: 'real' }, { nombre: 'maximo', tipo: 'real' },
        { nombre: 'media', tipo: 'real' },
      ], [cn, ct, cv, cu, cmin, cmax, cmed]);
    }, 'una tabla con el tipo, los huecos, los distintos y el mínimo, máximo y media de cada columna');
    def('vistazo', '... -> nulo', a => {
      const t = tab(a[0], 1, 'vistazo'), n = a.length > 1 ? ent(a[1], 2, 'vistazo') : 10;
      const cols = t.cols.map(c => c.nombre);
      const cel = v => (v === null || v === undefined) ? '·'
        : v instanceof ObjFecha ? isoDeFecha(v)
          : typeof v === 'string' ? v : repr(v, 1);
      const cuerpo = [];
      for (let f = 0; f < Math.min(n, t.filas); f++) cuerpo.push(t.datos.map(col => cel(col[f])));
      const numerica = t.cols.map(c => c.tipo === 'entero' || c.tipo === 'real');
      const an = cols.map((c, i) => Math.max(c.length, t.cols[i].tipo.length, ...cuerpo.map(r => r[i].length)));
      const pad = (s, i) => (numerica[i] ? ' '.repeat(an[i] - s.length) + s : s + ' '.repeat(an[i] - s.length));
      vm.salida(cols.map(pad).join('  '));
      vm.salida(t.cols.map((c, i) => pad(c.tipo, i)).join('  '));
      vm.salida(an.map(x => '─'.repeat(x)).join('  '));
      for (const r of cuerpo) vm.salida(r.map(pad).join('  '));
      if (t.filas > n) vm.salida(`… y ${t.filas - n} filas más (${t.filas} en total)`);
      return null;
    }, 'vistazo(t, 10) — la imprime con los tipos debajo de los nombres y «·» en los huecos');

    // ════════════════════════════════════════════════════════════ seleccionar
    def('columna', 'tabla, texto -> lista', a => {
      const t = tab(a[0], 1, 'columna');
      return L(t.datos[iCol(t, txt(a[1], 2, 'columna'), 'columna')].slice());
    }, 'columna(t, "ventas") — sus valores como lista');
    def('celda', 'tabla, entero, texto -> cualquiera', a => {
      const t = tab(a[0], 1, 'celda'), f = ent(a[1], 2, 'celda');
      if (f < 0 || f >= t.filas) vm.error(`«celda»: la fila ${f} no existe · la tabla tiene ${t.filas}`);
      return t.datos[iCol(t, txt(a[2], 3, 'celda'), 'celda')][f];
    }, 'celda(t, 0, "ventas") — un valor suelto');
    def('fila', 'tabla, entero -> dic', a => {
      const t = tab(a[0], 1, 'fila'), f = ent(a[1], 2, 'fila');
      if (f < 0 || f >= t.filas) vm.error(`«fila»: la fila ${f} no existe · la tabla tiene ${t.filas}`);
      const d = D();
      t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
      return d;
    }, 'fila(t, 0) — un diccionario con esa fila');
    def('soloColumnas', 'tabla, lista -> tabla', a => {
      const t = tab(a[0], 1, 'soloColumnas');
      const ns = lst(a[1], 2, 'soloColumnas').items.map(String);
      const idx = ns.map(n => iCol(t, n, 'soloColumnas'));
      return nueva(idx.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), idx.map(i => t.datos[i].slice()));
    }, 'soloColumnas(t, ["ciudad", "ventas"]) — y en ESE orden');
    def('sinColumna', '... -> tabla', a => {
      const t = tab(a[0], 1, 'sinColumna');
      const fuera = [];
      for (let i = 1; i < a.length; i++) fuera.push(iCol(t, txt(a[i], i + 1, 'sinColumna'), 'sinColumna'));
      const quedan = t.cols.map((_, i) => i).filter(i => !fuera.includes(i));
      return nueva(quedan.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), quedan.map(i => t.datos[i].slice()));
    }, 'sinColumna(t, "interna", "temporal") — quita una o varias');
    def('renombrar', 'tabla, texto, texto -> tabla', a => {
      const t = tab(a[0], 1, 'renombrar'), viejo = txt(a[1], 2, 'renombrar'), nuevo = txt(a[2], 3, 'renombrar');
      const i = iCol(t, viejo, 'renombrar');
      if (nuevo !== viejo && t.indiceCol(nuevo) >= 0)
        vm.error(`«renombrar»: ya hay una columna «${nuevo}»`);
      const cols = copiaCols(t);
      cols[i].nombre = nuevo;
      return nueva(cols, t.datos.map(c => c.slice()));
    }, 'renombrar(t, "vtas", "ventas")');
    def('reordenar', 'tabla, lista -> tabla', a => {
      const t = tab(a[0], 1, 'reordenar');
      const ns = lst(a[1], 2, 'reordenar').items.map(String);
      // Las que no se nombran van detrás, en su orden: así reordenar dos
      // columnas de treinta no obliga a escribir las treinta.
      const idx = ns.map(n => iCol(t, n, 'reordenar'));
      for (let i = 0; i < t.cols.length; i++) if (!idx.includes(i)) idx.push(i);
      return nueva(idx.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo })), idx.map(i => t.datos[i].slice()));
    }, 'reordenar(t, ["fecha", "ciudad"]) — las que no nombres van detrás');

    // ══════════════════════════════════════════════════════ filtrar y ordenar
    def('donde', 'tabla, funcion -> tabla', a => {
      // La función recibe la FILA como diccionario, no la tabla: así se escribe
      // igual que un filtro sobre una lista de registros.
      const t = tab(a[0], 1, 'donde'), fn = vm.exigeFuncion(a[1], 2, 'donde');
      const idx = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        if (verdad(vm.invocar(fn, [d]))) idx.push(f);
      }
      return porFilas(t, idx);
    }, 'donde(t, fn(f) { devolver f["ventas"] > 100 }) — la función recibe cada fila como diccionario');
    def('ordenarPor', '... -> tabla', a => {
      const t = tab(a[0], 1, 'ordenarPor'), c = iCol(t, txt(a[1], 2, 'ordenarPor'), 'ordenarPor');
      const desc = a.length > 2 && verdad(a[2]);
      const col = t.datos[c];
      const idx = t.datos.length ? col.map((_, i) => i) : [];
      const clave = v => (v instanceof ObjFecha ? v.ms : v);
      idx.sort((x, y) => {
        const p = clave(col[x]), q = clave(col[y]);
        // Los huecos van al final, siempre: sea ascendente o descendente, lo
        // que no se sabe no debe encabezar la lista.
        if (nulo(p) && nulo(q)) return x - y;
        if (nulo(p)) return 1;
        if (nulo(q)) return -1;
        const r = p < q ? -1 : p > q ? 1 : 0;
        return (desc ? -r : r) || (x - y);          // estable
      });
      vm.cobrar(t.filas * 2);
      return porFilas(t, idx);
    }, 'ordenarPor(t, "ventas", descendente?) — estable, y los huecos siempre al final');
    def('unicas', 'tabla, texto -> lista', a => {
      const t = tab(a[0], 1, 'unicas'), c = iCol(t, txt(a[1], 2, 'unicas'), 'unicas');
      const vistos = new Set(), out = [];
      for (const v of t.datos[c]) {
        const k = v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v);
        if (vistos.has(k)) continue;
        vistos.add(k); out.push(v);
      }
      return L(out);
    }, 'unicas(t, "ciudad") — los valores distintos de una columna, en el orden en que aparecen');
    def('sinRepetir', '... -> tabla', a => {
      // Filas repetidas, mirando todas las columnas o solo las que se digan.
      const t = tab(a[0], 1, 'sinRepetir');
      const cs = a.length > 1 ? lst(a[1], 2, 'sinRepetir').items.map(x => iCol(t, String(x), 'sinRepetir'))
        : t.cols.map((_, i) => i);
      const vistos = new Set(), idx = [];
      for (let f = 0; f < t.filas; f++) {
        const k = cs.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        if (vistos.has(k)) continue;
        vistos.add(k); idx.push(f);
      }
      vm.cobrar(t.filas * cs.length);
      return porFilas(t, idx);
    }, 'sinRepetir(t) · sinRepetir(t, ["nit"]) — quita filas repetidas, y se queda con la primera');
    def('quitarVacios', '... -> tabla', a => {
      const t = tab(a[0], 1, 'quitarVacios');
      const cs = a.length > 1 ? lst(a[1], 2, 'quitarVacios').items.map(x => iCol(t, String(x), 'quitarVacios'))
        : t.cols.map((_, i) => i);
      const idx = [];
      for (let f = 0; f < t.filas; f++) if (!cs.some(c => nulo(t.datos[c][f]))) idx.push(f);
      return porFilas(t, idx);
    }, 'quitarVacios(t) · quitarVacios(t, ["nit"]) — quita las filas con huecos');

    // ══════════════════════════════════════════════════════════════ derivar
    def('conColumna', 'tabla, texto, funcion -> tabla', a => {
      const t = tab(a[0], 1, 'conColumna'), n = txt(a[1], 2, 'conColumna');
      const fn = vm.exigeFuncion(a[2], 3, 'conColumna');
      const vals = [];
      for (let f = 0; f < t.filas; f++) {
        const d = D();
        t.cols.forEach((c, i) => d.mapa.set(c.nombre, t.datos[i][f]));
        vals.push(vm.invocar(fn, [d]));
      }
      const i = t.indiceCol(n);
      const cols = copiaCols(t), datos = t.datos.map(c => c.slice());
      // Con el mismo nombre, se reemplaza: «conColumna(t, "total", …)» dos
      // veces no debe dejar dos columnas «total».
      if (i >= 0) { cols[i].tipo = inferirTipo(vals); datos[i] = vals; }
      else { cols.push({ nombre: n, tipo: inferirTipo(vals) }); datos.push(vals); }
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'conColumna(t, "total", fn(f) { devolver f["precio"] * f["cantidad"] }) — si ya existe, la reemplaza');
    def('convertir', 'tabla, texto, texto -> tabla', a => {
      // Cambia el TIPO de una columna, que es lo que hay que hacer después de
      // leer un CSV donde algo se adivinó mal.
      const t = tab(a[0], 1, 'convertir'), n = txt(a[1], 2, 'convertir'), tipo = txt(a[2], 3, 'convertir');
      if (!TIPOS_TABLA.includes(tipo))
        vm.error(`«convertir»: «${tipo}» no es un tipo de columna`, 'los tipos son: ' + TIPOS_TABLA.join(', '));
      const c = iCol(t, n, 'convertir');
      const conv = v => {
        if (nulo(v)) return null;
        switch (tipo) {
          case 'entero': { const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
            if (Number.isNaN(x)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es un número`); return Math.trunc(x); }
          case 'real': { const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
            if (Number.isNaN(x)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es un número`); return x; }
          case 'texto': return v instanceof ObjFecha ? isoDeFecha(v) : (typeof v === 'string' ? v : repr(v, 1));
          case 'bool': return verdad(v);
          case 'fecha': {
            if (v instanceof ObjFecha) return v;
            const x = leerCampo(String(v));
            if (!(x instanceof ObjFecha)) vm.error(`«convertir»: «${repr(v, 1)}» de «${n}» no es una fecha`,
              'se leen 2026-09-29 y 29/09/2026');
            return x;
          }
          default: return v;
        }
      };
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      cols[c].tipo = tipo;
      datos[c] = datos[c].map(conv);
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'convertir(t, "ventas", "entero") — para arreglar lo que un CSV adivinó mal');
    def('aplicarA', 'tabla, texto, funcion -> tabla', a => {
      const t = tab(a[0], 1, 'aplicarA'), n = txt(a[1], 2, 'aplicarA');
      const fn = vm.exigeFuncion(a[2], 3, 'aplicarA');
      const c = iCol(t, n, 'aplicarA');
      const vals = t.datos[c].map(v => vm.invocar(fn, [v]));
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      cols[c].tipo = inferirTipo(vals); datos[c] = vals;
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'aplicarA(t, "ciudad", mayusculas) — la función recibe CADA VALOR, no la fila');
    def('rellenarVacios', 'tabla, texto, cualquiera -> tabla', a => {
      const t = tab(a[0], 1, 'rellenarVacios'), n = txt(a[1], 2, 'rellenarVacios');
      const c = iCol(t, n, 'rellenarVacios');
      const cols = copiaCols(t), datos = t.datos.map(x => x.slice());
      datos[c] = datos[c].map(v => (nulo(v) ? a[2] : v));
      cols[c].tipo = inferirTipo(datos[c]);
      return nueva(cols, datos);
    }, 'rellenarVacios(t, "ventas", 0) — pone un valor en los huecos de esa columna');
    def('numerar', '... -> tabla', a => {
      const t = tab(a[0], 1, 'numerar');
      const n = a.length > 1 ? txt(a[1], 2, 'numerar') : 'n';
      const desde = a.length > 2 ? ent(a[2], 3, 'numerar') : 1;
      if (t.indiceCol(n) >= 0) vm.error(`«numerar»: ya hay una columna «${n}»`);
      const vals = [];
      for (let f = 0; f < t.filas; f++) vals.push(desde + f);
      return nueva(copiaCols(t).concat([{ nombre: n, tipo: 'entero' }]),
        t.datos.map(c => c.slice()).concat([vals]));
    }, 'numerar(t, "n", 1) — añade una columna con el número de fila');

    // ═══════════════════════════════════════════════════ agrupar y resumir
    const agregado = (nombre, clase, doc) => def(nombre, '... -> dic', a => {
      const col = a.length ? txt(a[0], 1, nombre) : null;
      return receta(clase, col, null);
    }, doc);
    agregado('sumaCol', 'suma', 'sumaCol("ventas") — la receta de una suma, para agrupar o resumir');
    agregado('promedioCol', 'promedio', 'promedioCol("ventas")');
    agregado('minCol', 'min', 'minCol("ventas")');
    agregado('maxCol', 'max', 'maxCol("ventas")');
    agregado('primeroCol', 'primero', 'primeroCol("ciudad") — el primero del grupo');
    agregado('ultimoCol', 'ultimo', 'ultimoCol("ciudad")');
    agregado('contarCol', 'contar', 'contarCol() — cuántas filas · contarCol("nit") cuenta las que no están vacías');
    def('juntarCol', '... -> dic', a => {
      const col = txt(a[0], 1, 'juntarCol');
      const sep = a.length > 1 ? txt(a[1], 2, 'juntarCol') : ', ';
      const d = receta('juntar', col, null);
      d.mapa.set('separador', sep);
      return d;
    }, 'juntarCol("ciudad", ", ") — pega los valores del grupo en un texto');

    // Aplica una receta a un grupo de índices de fila.
    function aplicarReceta(t, r, idx) {
      const sep = r.sep || ', ';
      if (r.clase === 'contar') {
        if (r.col === null) return idx.length;
        const c = iCol(t, r.col, 'contarCol');
        return idx.reduce((n, f) => n + (nulo(t.datos[c][f]) ? 0 : 1), 0);
      }
      const c = iCol(t, r.col, r.clase + 'Col');
      const vals = idx.map(f => t.datos[c][f]).filter(v => !nulo(v));
      switch (r.clase) {
        case 'suma': case 'promedio': {
          const ns = vals.filter(v => typeof v === 'number');
          if (ns.length !== vals.length)
            vm.error(`«${r.clase === 'suma' ? 'sumaCol' : 'promedioCol'}»: la columna «${r.col}» no es de números`,
              `es de tipo ${t.cols[c].tipo}; con «convertir» se puede cambiar`);
          // Sin ningún valor, el resultado es NULO y no 0. La suma de nada es
          // 0 en matemáticas, pero en una tabla significa otra cosa: en una
          // celda de «ventas» un 0 dice «no vendió» y un hueco dice «no se
          // sabe». Es la regla de SQL, y es la que no miente.
          if (!ns.length) return null;
          const s = ns.reduce((p, x) => p + x, 0);
          return r.clase === 'suma' ? s : s / ns.length;
        }
        case 'min': case 'max': {
          if (!vals.length) return null;
          const k = v => (v instanceof ObjFecha ? v.ms : v);
          let mejor = vals[0];
          for (const v of vals) {
            const cmp = k(v) < k(mejor);
            if (r.clase === 'min' ? cmp : !cmp && k(v) !== k(mejor)) mejor = v;
          }
          return mejor;
        }
        case 'primero': return vals.length ? vals[0] : null;
        case 'ultimo': return vals.length ? vals[vals.length - 1] : null;
        case 'juntar': return vals.map(v => (typeof v === 'string' ? v : repr(v, 1))).join(sep);
        default: vm.error(`agregado desconocido: ${r.clase}`);
      }
    }
    // Lee el diccionario de recetas, con un mensaje claro si alguien pone algo
    // que no es una receta: es el error fácil de cometer aquí.
    function leerRecetas(d, quien) {
      const out = [];
      for (const [k, v] of d.mapa) {
        if (!esReceta(v))
          vm.error(`«${quien}»: «${k}» no es un agregado`,
            'los agregados son sumaCol, promedioCol, minCol, maxCol, primeroCol, ultimoCol, contarCol y juntarCol');
        const r = Object.assign({}, RECETAS.get(v));
        if (v.mapa.has('separador')) r.sep = v.mapa.get('separador');
        out.push([String(k), r]);
      }
      if (!out.length) vm.error(`«${quien}»: no se pidió ningún resumen`);
      return out;
    }

    def('agrupar', 'tabla, lista, dic -> tabla', a => {
      const t = tab(a[0], 1, 'agrupar');
      const claves = lst(a[1], 2, 'agrupar').items.map(x => String(x));
      const ic = claves.map(n => iCol(t, n, 'agrupar'));
      const recs = leerRecetas(dic(a[2], 3, 'agrupar'), 'agrupar');
      // Los grupos salen en el orden en que aparecen, no ordenados: así dos
      // corridas dan lo mismo y se puede ordenar después si hace falta.
      const grupos = new Map();
      for (let f = 0; f < t.filas; f++) {
        const k = ic.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(f);
      }
      vm.cobrar(t.filas * (ic.length + recs.length));
      const cols = ic.map(c => ({ nombre: t.cols[c].nombre, tipo: t.cols[c].tipo }))
        .concat(recs.map(([n]) => ({ nombre: n, tipo: 'cualquiera' })));
      const datos = cols.map(() => []);
      for (const idx of grupos.values()) {
        ic.forEach((c, i) => datos[i].push(t.datos[c][idx[0]]));
        recs.forEach(([, r], i) => datos[ic.length + i].push(aplicarReceta(t, r, idx)));
      }
      recs.forEach((_, i) => { cols[ic.length + i].tipo = inferirTipo(datos[ic.length + i]); });
      return nueva(cols, datos);
    }, 'agrupar(t, ["ciudad"], {"total": sumaCol("ventas"), "n": contarCol()}) — los grupos salen en el orden en que aparecen');
    def('resumir', 'tabla, dic -> tabla', a => {
      const t = tab(a[0], 1, 'resumir');
      const recs = leerRecetas(dic(a[1], 2, 'resumir'), 'resumir');
      const idx = [];
      for (let f = 0; f < t.filas; f++) idx.push(f);
      const datos = recs.map(([, r]) => [aplicarReceta(t, r, idx)]);
      return nueva(recs.map(([n], i) => ({ nombre: n, tipo: inferirTipo(datos[i]) })), datos);
    }, 'resumir(t, {"total": sumaCol("ventas")}) — la tabla entera en una fila, sin agrupar');
    def('contarPor', '... -> tabla', a => {
      const t = tab(a[0], 1, 'contarPor');
      const ns = [];
      for (let i = 1; i < a.length; i++) ns.push(txt(a[i], i + 1, 'contarPor'));
      if (!ns.length) vm.error('«contarPor» necesita al menos una columna');
      const rec = D();
      rec.mapa.set('cuantas', receta('contar', null, null));
      // Se apoya en «agrupar» para no tener dos formas de contar lo mismo.
      const ic = ns.map(n => iCol(t, n, 'contarPor'));
      const grupos = new Map();
      for (let f = 0; f < t.filas; f++) {
        const k = ic.map(c => { const v = t.datos[c][f]; return v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v); }).join('\u0000');
        grupos.set(k, (grupos.get(k) || 0) + 1);
        if (!grupos.has(k + '\u0001')) grupos.set(k + '\u0001', ic.map(c => t.datos[c][f]));
      }
      const cols = ic.map(c => ({ nombre: t.cols[c].nombre, tipo: t.cols[c].tipo }))
        .concat([{ nombre: 'cuantas', tipo: 'entero' }]);
      const datos = cols.map(() => []);
      for (const [k, v] of grupos) {
        if (k.endsWith('\u0001')) continue;
        const vals = grupos.get(k + '\u0001');
        vals.forEach((x, i) => datos[i].push(x));
        datos[ic.length].push(v);
      }
      vm.cobrar(t.filas);
      return nueva(cols, datos);
    }, 'contarPor(t, "ciudad") — cuántas filas por valor · el atajo del caso más común');
    def('pivotar', 'tabla, texto, texto, dic -> tabla', a => {
      // Tabla cruzada: una columna pasa a ser varias. Es lo que se hace a mano
      // en una hoja de cálculo y a nadie le sale bien la primera vez.
      const t = tab(a[0], 1, 'pivotar');
      const fCol = txt(a[1], 2, 'pivotar'), cCol = txt(a[2], 3, 'pivotar');
      const recs = leerRecetas(dic(a[3], 4, 'pivotar'), 'pivotar');
      if (recs.length !== 1) vm.error('«pivotar»: se pide un solo agregado', 'una tabla cruzada tiene un valor por celda');
      const [, r] = recs[0];
      const iF = iCol(t, fCol, 'pivotar'), iC = iCol(t, cCol, 'pivotar');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const filas = new Map(), cols = new Map();
      for (let f = 0; f < t.filas; f++) {
        const kf = clave(t.datos[iF][f]), kc = clave(t.datos[iC][f]);
        if (!filas.has(kf)) filas.set(kf, { valor: t.datos[iF][f], celdas: new Map() });
        if (!cols.has(kc)) cols.set(kc, t.datos[iC][f]);
        const cel = filas.get(kf).celdas;
        if (!cel.has(kc)) cel.set(kc, []);
        cel.get(kc).push(f);
      }
      vm.cobrar(t.filas + filas.size * cols.size);
      const nombreCol = v => (v === null || v === undefined) ? '(vacío)'
        : v instanceof ObjFecha ? isoDeFecha(v) : (typeof v === 'string' ? v : repr(v, 1));
      const salidaCols = [{ nombre: t.cols[iF].nombre, tipo: t.cols[iF].tipo }]
        .concat([...cols.values()].map(v => ({ nombre: nombreCol(v), tipo: 'cualquiera' })));
      const datos = salidaCols.map(() => []);
      for (const g of filas.values()) {
        datos[0].push(g.valor);
        let i = 1;
        for (const kc of cols.keys()) {
          datos[i].push(g.celdas.has(kc) ? aplicarReceta(t, r, g.celdas.get(kc)) : null);
          i++;
        }
      }
      for (let i = 1; i < salidaCols.length; i++) salidaCols[i].tipo = inferirTipo(datos[i]);
      return nueva(salidaCols, datos);
    }, 'pivotar(t, "ciudad", "mes", {"ventas": sumaCol("ventas")}) — una columna pasa a ser varias');
    def('despivotar', '... -> tabla', a => {
      // Lo contrario: varias columnas pasan a ser dos, una de nombre y una de
      // valor. Es como se arregla una tabla escrita para mirarla, no para
      // calcular con ella.
      const t = tab(a[0], 1, 'despivotar');
      const fijas = lst(a[1], 2, 'despivotar').items.map(x => iCol(t, String(x), 'despivotar'));
      const nomVar = a.length > 2 ? txt(a[2], 3, 'despivotar') : 'variable';
      const nomVal = a.length > 3 ? txt(a[3], 4, 'despivotar') : 'valor';
      const mover = t.cols.map((_, i) => i).filter(i => !fijas.includes(i));
      if (!mover.length) vm.error('«despivotar»: no queda ninguna columna que mover');
      const cols = fijas.map(i => ({ nombre: t.cols[i].nombre, tipo: t.cols[i].tipo }))
        .concat([{ nombre: nomVar, tipo: 'texto' }, { nombre: nomVal, tipo: 'cualquiera' }]);
      const datos = cols.map(() => []);
      for (let f = 0; f < t.filas; f++) {
        for (const c of mover) {
          fijas.forEach((i, k) => datos[k].push(t.datos[i][f]));
          datos[fijas.length].push(t.cols[c].nombre);
          datos[fijas.length + 1].push(t.datos[c][f]);
        }
      }
      vm.cobrar(t.filas * mover.length);
      cols[cols.length - 1].tipo = inferirTipo(datos[datos.length - 1]);
      return nueva(cols, datos);
    }, 'despivotar(t, ["ciudad"], "mes", "ventas") — varias columnas pasan a ser dos');

    // ═════════════════════════════════════════════════════════════ combinar
    def('cruzar', '... -> tabla', a => {
      // Cruce por una columna común. Solo las filas que están en las DOS, que
      // es lo que se quiere casi siempre; lo demás se ve con «diferencia».
      const x = tab(a[0], 1, 'cruzar'), y = tab(a[1], 2, 'cruzar');
      const n = txt(a[2], 3, 'cruzar');
      const ix = iCol(x, n, 'cruzar'), iy = iCol(y, n, 'cruzar');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const indice = new Map();
      for (let f = 0; f < y.filas; f++) {
        const k = clave(y.datos[iy][f]);
        if (!indice.has(k)) indice.set(k, []);
        indice.get(k).push(f);
      }
      const colsY = y.cols.map((c, i) => i).filter(i => i !== iy);
      // Un nombre repetido se marca con el sufijo del lado, en vez de perderse.
      const nombreY = i => (x.indiceCol(y.cols[i].nombre) >= 0 ? y.cols[i].nombre + '_2' : y.cols[i].nombre);
      const cols = copiaCols(x).concat(colsY.map(i => ({ nombre: nombreY(i), tipo: y.cols[i].tipo })));
      const datos = cols.map(() => []);
      for (let f = 0; f < x.filas; f++) {
        const hs = indice.get(clave(x.datos[ix][f]));
        if (!hs) continue;
        for (const g of hs) {
          x.datos.forEach((col, i) => datos[i].push(col[f]));
          colsY.forEach((i, k) => datos[x.cols.length + k].push(y.datos[i][g]));
        }
      }
      vm.cobrar(x.filas + y.filas);
      return nueva(cols, datos);
    }, 'cruzar(a, b, "nit") — solo las filas que están en las dos · un nombre repetido lleva «_2»');
    def('apilar', '... -> tabla', a => {
      const ts = [];
      for (let i = 0; i < a.length; i++) ts.push(tab(a[i], i + 1, 'apilar'));
      if (!ts.length) vm.error('«apilar» necesita al menos una tabla');
      const base = ts[0];
      for (let i = 1; i < ts.length; i++) {
        const ns = ts[i].cols.map(c => c.nombre), bs = base.cols.map(c => c.nombre);
        if (ns.length !== bs.length || ns.some((n, k) => n !== bs[k]))
          vm.error(`«apilar»: la tabla ${i + 1} tiene otras columnas`,
            `la primera: ${bs.join(', ')} · la ${i + 1}: ${ns.join(', ')}`);
      }
      const datos = base.cols.map((_, c) => [].concat.apply([], ts.map(t => t.datos[c])));
      vm.cobrar(datos.length ? datos[0].length : 0);
      return nueva(base.cols.map((c, i) => ({ nombre: c.nombre, tipo: inferirTipo(datos[i]) })), datos);
    }, 'apilar(a, b, c) — una debajo de otra · las columnas tienen que coincidir');
    def('juntarColumnas', '... -> tabla', a => {
      const x = tab(a[0], 1, 'juntarColumnas'), y = tab(a[1], 2, 'juntarColumnas');
      if (x.filas !== y.filas)
        vm.error(`«juntarColumnas»: una tiene ${x.filas} filas y la otra ${y.filas}`,
          'para juntar por una columna común usa «cruzar»');
      for (const c of y.cols) if (x.indiceCol(c.nombre) >= 0)
        vm.error(`«juntarColumnas»: las dos tienen una columna «${c.nombre}»`);
      return nueva(copiaCols(x).concat(copiaCols(y)),
        x.datos.map(c => c.slice()).concat(y.datos.map(c => c.slice())));
    }, 'juntarColumnas(a, b) — lado a lado · mismo número de filas y sin nombres repetidos');
    def('diferencia', 'tabla, tabla, texto -> tabla', a => {
      const x = tab(a[0], 1, 'diferencia'), y = tab(a[1], 2, 'diferencia');
      const n = txt(a[2], 3, 'diferencia');
      const ix = iCol(x, n, 'diferencia'), iy = iCol(y, n, 'diferencia');
      const clave = v => (v instanceof ObjFecha ? 'f' + v.ms : typeof v + ':' + String(v));
      const hay = new Set(y.datos[iy].map(clave));
      const idx = [];
      for (let f = 0; f < x.filas; f++) if (!hay.has(clave(x.datos[ix][f]))) idx.push(f);
      vm.cobrar(x.filas + y.filas);
      return porFilas(x, idx);
    }, 'diferencia(a, b, "nit") — las filas de «a» cuyo valor NO está en «b» · para conciliar');
  };
}

if (typeof module !== 'undefined') module.exports = { instalarDatos, inferirTipo, VERSION_DATOS };
