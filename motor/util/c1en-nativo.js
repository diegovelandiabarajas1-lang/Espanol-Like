// Anfitrión del dispositivo «nativo» de C1EÑ: compila C con gcc y lo carga con
// koffi.
//
// Es la otra mitad de motor/src/14-c1en.js. El motor genera el texto en C y
// dice qué funciones quiere y con qué firma; esto lo compila, lo guarda en una
// caché en disco por la huella del código y devuelve funciones de JavaScript
// que llaman al código compilado. Nada más: no conoce Ñ.
//
//   const nativo = require('./c1en-nativo.js').crear();   // null si no hay gcc o koffi
//   const { f } = nativo.compilar(fuenteC, [{ nombre: 'f', firma: 'void f(int64_t, double *)' }]);
//
// Las banderas no son negociables, y por eso no se pueden cambiar desde fuera:
//   -O2                  optimiza, pero sin licencias con la aritmética real
//   -ffp-contract=off    NADA de FMA. Una FMA redondea una vez donde a*b+c
//                        redondea dos; con ella el último bit dejaría de
//                        coincidir con el de JavaScript y con el de la GPU.
//   -fno-fast-math       explícito, por si alguien lo trae en CFLAGS
//   -fwrapv              que un entero que se desborda se envuelva en vez de
//                        ser comportamiento indefinido (el optimizador no puede
//                        borrar una comprobación contando con que no pasa)
//   -fopenmp             si el compilador lo trae: los hilos de la CPU. Los
//                        núcleos de C1EÑ son independientes por índice, como
//                        en CUDA, así que se reparten sin más.
//   -Wl,-z,nodelete      que la biblioteca no se descargue NUNCA. Sin esto el
//                        proceso moría con «Segmentation fault» al salir: Node
//                        descarga lo que cargó koffi, con ello se va libgomp, y
//                        sus hilos —que siguen vivos, esperando trabajo— saltan
//                        a memoria que ya no existe. Pasaba siempre que un
//                        programa usaba «nativo» con OpenMP y terminaba solo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BANDERAS = ['-O2', '-shared', '-fPIC', '-ffp-contract=off', '-fno-fast-math', '-fwrapv', '-std=gnu11', '-Wl,-z,nodelete'];

let motivo = null;
function porQueNo() { return motivo; }

// Qué compilador hay. C1EN_CC manda; si no, gcc, y si no, cc.
function buscarCompilador() {
  const candidatos = process.env.C1EN_CC ? [process.env.C1EN_CC] : ['gcc', 'cc'];
  for (const cc of candidatos) {
    const r = spawnSync(cc, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) {
      const primera = String(r.stdout).split('\n')[0];
      const v = /(\d+\.\d+(\.\d+)?)/.exec(primera);
      const familia = /clang/i.test(primera) ? 'clang' : (/gcc|GCC|Free Software/.test(primera + r.stdout) ? 'gcc' : cc);
      return { cc, version: primera, corto: `${familia} ${v ? v[1] : ''}`.trim() };
    }
  }
  return null;
}

function carpetaCache() {
  if (process.env.C1EN_CACHE) return process.env.C1EN_CACHE;
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'u';
  return path.join(os.tmpdir(), `c1en-cache-${uid}`);
}

function crear() {
  let koffi;
  try { koffi = require('koffi'); }
  catch (e) {
    motivo = /Cannot find module ['"]koffi/.test(String(e && e.message))
      ? 'koffi no está instalado (npm install koffi)'
      : `koffi no carga en ${process.platform}-${process.arch}: vuelve a lanzar «npm install» en esta máquina`;
    return null;
  }
  const comp = buscarCompilador();
  if (!comp) { motivo = 'no hay compilador de C (gcc o cc) en el PATH; se puede indicar con C1EN_CC'; return null; }
  const dir = carpetaCache();
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { motivo = `no se pudo crear la caché ${dir}`; return null; }

  // ¿Trae OpenMP? Se prueba compilando de verdad una vez, porque «gcc» en macOS
  // es clang y no lo trae, y en algunos contenedores falta libgomp.
  let openmp = false;
  if (process.env.C1EN_OPENMP !== '0') {
    const prueba = path.join(dir, `omp-${process.pid}.c`);
    const so = prueba.replace(/\.c$/, '.so');
    try {
      fs.writeFileSync(prueba, '#include <omp.h>\nint c1en_hilos(void) { return omp_get_max_threads(); }\n');
      const r = spawnSync(comp.cc, BANDERAS.concat(['-fopenmp', '-o', so, prueba]), { encoding: 'utf8' });
      openmp = r.status === 0;
    } catch (_) { openmp = false; }
    for (const f of [prueba, so]) { try { fs.unlinkSync(f); } catch (_) { /* nada */ } }
  }
  const banderas = BANDERAS.concat(openmp ? ['-fopenmp'] : []);
  const hilos = openmp ? (os.availableParallelism ? os.availableParallelism() : os.cpus().length) : 1;
  const nombre = `${comp.corto}${openmp ? `, OpenMP con ${hilos} hilos` : ', un hilo'}`;

  const cargadas = new Map();   // huella → { lib, funciones }

  function compilar(fuente, funciones) {
    const huella = crypto.createHash('sha256')
      .update(comp.version).update('\0').update(banderas.join(' ')).update('\0').update(fuente)
      .digest('hex').slice(0, 32);
    let e = cargadas.get(huella);
    if (!e) {
      const so = path.join(dir, `c1en-${huella}.so`);
      if (!fs.existsSync(so)) {
        const c = path.join(dir, `c1en-${huella}.c`);
        fs.writeFileSync(c, fuente);
        // Se compila a un nombre temporal y se renombra: dos procesos (uno por
        // GPU, que es el patrón recomendado) pueden compilar el mismo núcleo a la
        // vez, y renombrar es atómico; escribir encima no.
        const tmp = path.join(dir, `c1en-${huella}.${process.pid}.tmp.so`);
        const r = spawnSync(comp.cc, banderas.concat(['-o', tmp, c, '-lm']), { encoding: 'utf8' });
        if (r.status !== 0) {
          try { fs.unlinkSync(tmp); } catch (_) { /* nada */ }
          const err = String(r.stderr || r.error || '').split('\n').filter(l => /error/.test(l)).slice(0, 6).join('\n');
          throw new Error(`${comp.cc} no lo compiló (el código está en ${c}):\n${err || r.stderr}`);
        }
        fs.renameSync(tmp, so);
      }
      let lib;
      try { lib = koffi.load(so); }
      catch (x) { throw new Error(`no se pudo cargar ${so}: ${x.message}`); }
      e = { lib, funciones: new Map() };
      cargadas.set(huella, e);
    }
    const out = {};
    for (const { nombre: nm, firma } of funciones) {
      let f = e.funciones.get(firma);
      if (!f) { f = e.lib.func(firma); e.funciones.set(firma, f); }
      out[nm] = f;
    }
    return out;
  }

  return { nombre, compilador: comp.cc, openmp, hilos, banderas, cache: dir, compilar };
}

module.exports = { crear, porQueNo, BANDERAS };
