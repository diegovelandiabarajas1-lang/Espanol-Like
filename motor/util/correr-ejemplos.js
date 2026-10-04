// Corre una carpeta de programas de Ñ con un anfitrión COMPLETO de mentira:
// página, lienzo, almacén, archivos, sistema y red. Sin esto, la mitad de un
// catálogo de ejemplos no se puede comprobar —un programa que pinta en la
// página falla con «necesita un anfitrión con página»— y un ejemplo que no
// corre es peor que no tenerlo: enseña algo que no funciona.
//
//   node motor/util/correr-ejemplos.js <carpeta> [--ver <nombre>]
//
// Devuelve 1 si alguno falla, para poder encadenarlo.
'use strict';
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'bundle.js'));
const { crearMotor } = globalThis.EspanolLike;

const dir = process.argv[2];
if (!dir) { console.log('falta la carpeta'); process.exit(2); }
const soloVer = process.argv.indexOf('--ver') >= 0 ? process.argv[process.argv.indexOf('--ver') + 1] : null;

// ── el anfitrión de mentira ────────────────────────────────────────────────
// La página y el lienzo no dibujan nada, pero sí APUNTAN lo que se les pidió:
// así un ejemplo que pinta se puede comprobar («¿pintó algo?») sin navegador.
function anfitrion(apuntes) {
  const disco = new Map([
    ['datos/ventas.csv', 'ciudad,mes,ventas\nBucaramanga,1,120\nBucaramanga,2,150\nGirón,1,80\nGirón,2,95\nFloridablanca,1,200\nFloridablanca,2,180\n'],
    ['datos/clientes.csv', 'nit,nombre,ciudad\n900123,Ferretería El Tornillo,Bucaramanga\n900456,Panadería La Espiga,Girón\n900789,Droguería Salud,Floridablanca\n'],
    ['datos/notas.txt', 'primera línea\nsegunda línea\ntercera línea\n'],
    // El mismo CSV también en la raíz: «informe.esl» lo pide como
    // «ventas.csv», sin carpeta, porque lo recibe por argumentos().
    ['ventas.csv', 'ciudad,mes,ventas\nBucaramanga,1,120\nBucaramanga,2,150\nGirón,1,80\nGirón,2,95\nFloridablanca,1,200\nFloridablanca,2,180\n'],
  ]);
  const carpetas = new Set(['datos', 'salida']);
  const guardado = new Map();
  let sigTemp = 0;
  return {
    // Los nombres son los que la biblioteca llama de verdad: abrir, cerrar,
    // texto, control, eco, limpiar y asegurarClase. No valen inventados: si
    // falta «abrir», «pintar» se niega —y así lo descubrí—.
    web: {
      abrir: (etiq) => { apuntes.pintados++; apuntes.etiquetas.push(etiq); },
      cerrar: () => {},
      texto: t => { apuntes.texto += String(t).length; },
      control: c => { apuntes.controles++; if (c && c.tipo) apuntes.etiquetas.push(c.tipo); },
      eco: t => { apuntes.eco += String(t).length; },
      limpiar: () => { apuntes.limpiezas++; },
      asegurarClase: () => { apuntes.clases++; },
      // El eDSL de estilos usa «estilo» para una hoja global y «cssCrudo».
      estilo: t => { apuntes.css += String(t).length; apuntes.hojas++; },
    },
    grafico: {
      lienzo: (a, al) => { apuntes.lienzo = [a, al]; },
      limpiar: () => {}, rect: () => { apuntes.figuras++; },
      circulo: () => { apuntes.figuras++; }, linea: () => { apuntes.figuras++; },
      punto: () => { apuntes.figuras++; }, texto: () => { apuntes.figuras++; },
      escribirEn: () => { apuntes.figuras++; },
      color: () => {}, grosor: () => {},
      barras: () => { apuntes.graficas++; }, dispersion: () => { apuntes.graficas++; },
      graficar: () => { apuntes.graficas++; }, histograma: () => { apuntes.graficas++; },
    },
    almacen: {
      leer: k => (guardado.has(k) ? guardado.get(k) : null),
      escribir: (k, v) => guardado.set(k, v),
      borrar: k => guardado.delete(k),
      claves: () => [...guardado.keys()],
    },
    tiempo: {
      // Los temporizadores se ejecutan EN EL ACTO, una sola vez. Así un ejemplo
      // con «luego» enseña su efecto en la salida en vez de no enseñar nada, y
      // «cada» no se queda dando vueltas para siempre.
      // «f» es un cierre de Ñ, no una función de JavaScript: hay que llamarlo
      // por la máquina, que es para eso que la biblioteca le pasa «vm». Llamarlo
      // como f() da «f is not a function», y así lo descubrí.
      luego: (ms, f, vm) => { apuntes.temporizadores++; try { vm.invocar(f, []); } catch (e) { apuntes.erroresTemp.push(String(e.message || e)); } return ++sigTemp; },
      cada: (ms, f, vm) => { apuntes.temporizadores++; try { vm.invocar(f, []); } catch (e) { apuntes.erroresTemp.push(String(e.message || e)); } return ++sigTemp; },
      detener: id => id > 0 && id <= sigTemp,
    },
    red: { pedir() { apuntes.peticiones++; } },
    archivos: {
      leer: r => { if (!disco.has(r)) throw new Error('no se pudo leer ' + r); return disco.get(r); },
      escribir: (r, t) => disco.set(r, t),
      agregar: (r, t) => disco.set(r, (disco.get(r) || '') + t),
      existe: r => disco.has(r) || carpetas.has(r),
      esCarpeta: r => carpetas.has(r),
      listar: r => [...disco.keys()].filter(k => k.startsWith(r + '/')).map(k => k.slice(r.length + 1)),
      crearCarpeta: r => carpetas.add(r),
      borrar: r => disco.delete(r),
      tamano: r => (disco.get(r) || '').length,
    },
    // Los módulos sí salen del disco de verdad, no del de mentira: «lib/tabla.esl»
    // es un archivo que está al lado del ejemplo, y resolverlo contra el disco
    // falso significaría mantener una copia de cada módulo aquí dentro. Se acota
    // a la carpeta que se está verificando: un ejemplo no puede leer hacia fuera.
    modulos: {
      resolver(espec, desde) {
        // «desde» llega como el nombre con que se llamó a ejecutar() —«panel.esl»,
        // a secas—, no como ruta absoluta. Resolverlo contra el directorio de
        // trabajo buscaría «lib/» al lado de donde se lanzó la orden, y el
        // módulo saldría de la carpeta. La base es siempre la carpeta verificada.
        const base = path.resolve(dir, desde ? path.dirname(desde) : '.');
        const abs = path.resolve(base, espec);
        const raiz = path.resolve(dir);
        if (abs !== raiz && !abs.startsWith(raiz + path.sep))
          throw new Error(`el módulo «${espec}» queda fuera de ${dir}`);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
          throw new Error(`no existe el módulo «${espec}»`);
        return abs;
      },
      leer: clave => fs.readFileSync(clave, 'utf8'),
    },
    sistema: {
      argumentos: () => ['ventas.csv', '--mes', '2'],
      entorno: n => ({ USUARIO: 'diego', EMPRESA: 'DATAPRO' }[n] || null),
      ejecutar: (orden, a) => ({ codigo: 0, salida: [orden].concat(a || []).join(' ') + '\n', error: '' }),
      leerLinea: () => null,
      salir: () => {},
    },
  };
}

const archivos = fs.readdirSync(dir).filter(f => /\.(txt|esl)$/.test(f) && !f.startsWith('00-')).sort();
let mal = 0, vacios = 0, saltados = 0;
const anchoN = Math.max(...archivos.map(f => f.length));
for (const f of archivos) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const out = [];
  const apuntes = { pintados: 0, limpiezas: 0, eco: 0, texto: 0, controles: 0, clases: 0, css: 0, hojas: 0,
                    etiquetas: [], figuras: 0, graficas: 0, lienzo: null,
                    temporizadores: 0, peticiones: 0, erroresTemp: [] };
  const m = crearMotor({ salida: s => out.push(String(s)), host: anfitrion(apuntes), limiteInstr: 2e8 });
  let r;
  try { r = m.ejecutar(src, f); }
  catch (e) { r = { ok: false, errores: [{ message: 'excepción del motor: ' + (e.message || e) }] }; }
  const hechos = [];
  if (apuntes.pintados) hechos.push(apuntes.pintados + ' nodos');
  if (apuntes.controles) hechos.push(apuntes.controles + ' controles');
  if (apuntes.clases) hechos.push(apuntes.clases + ' clases css');
  if (apuntes.hojas) hechos.push(apuntes.hojas + ' hojas de estilo');
  if (apuntes.figuras) hechos.push(apuntes.figuras + ' figuras');
  if (apuntes.graficas) hechos.push(apuntes.graficas + ' gráficas');
  if (apuntes.temporizadores) hechos.push(apuntes.temporizadores + ' temporizadores');
  const lineas = out.join('\n').split('\n').filter(x => x.trim()).length;
  const motivo = r.ok ? '' : r.errores.map(e => (e.formato ? e.formato() : e.message)).join(' | ').replace(/\s+/g, ' ');
  // Un ejemplo que llama a código compilado no se puede comprobar con un
  // anfitrión de mentira: hace falta koffi y una biblioteca del sistema. Se
  // cuenta aparte, no como fallo, porque contarlo como fallo entrena a no mirar
  // la salida. Es el ÚNICO caso que se salta, y solo por ese mensaje exacto.
  if (!r.ok && /necesita un anfitri[oó]n con c[oó]digo nativo/.test(motivo)) {
    saltados++;
    console.log(`  – ${f.padEnd(anchoN)}  necesita koffi y una biblioteca del sistema`);
  } else if (!r.ok) {
    mal++;
    console.log(`  ✗ ${f.padEnd(anchoN)}  ${motivo.slice(0, 170)}`);
  } else if (apuntes.erroresTemp.length) {
    mal++;
    console.log(`  ✗ ${f.padEnd(anchoN)}  falló dentro de un temporizador: ${apuntes.erroresTemp[0].slice(0, 120)}`);
  } else if (lineas === 0 && !hechos.length) {
    // Un ejemplo que corre y no hace NADA observable no sirve de ejemplo.
    vacios++; mal++;
    console.log(`  ✗ ${f.padEnd(anchoN)}  corre pero no imprime ni pinta nada`);
  } else {
    console.log(`  ✓ ${f.padEnd(anchoN)}  ${String(lineas).padStart(3)} líneas${hechos.length ? ' · ' + hechos.join(', ') : ''}`);
  }
  if (soloVer && f.includes(soloVer)) {
    console.log('\n──── salida de ' + f + ' ────');
    console.log(out.join('\n'));
    console.log('──── fin ────\n');
  }
}
console.log(`\n  ${archivos.length - mal - saltados} de ${archivos.length - saltados} corren` +
  (saltados ? ` · ${saltados} saltados (hacen falta tanto koffi como el sistema operativo)` : '') +
  (vacios ? ` · ${vacios} sin salida` : '') + '\n');
process.exit(mal ? 1 : 0);
