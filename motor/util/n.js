// Intérprete de Ñ de línea de órdenes, para QuickJS.
//   qjs --std util/n.js programa.esl [argumentos…]
// Se carga el bundle tal cual: el motor no toca el DOM ni Node, así que corre
// sin cambios en un runtime de 1 MB. Aquí no hay página ni lienzo —eso es cosa
// del navegador— pero sí archivos, procesos y entorno, que es lo que hace falta
// para que un programa sirva de algo fuera de una pestaña.
import * as std from "std";
import * as os from "os";

// QuickJS no tiene __dirname: la carpeta sale del propio nombre del script.
const aqui = scriptArgs[0].replace(/[^\/\\]+$/, '');
globalThis.eval(std.loadFile(std.getenv('NN_BUNDLE') || (aqui + '../bundle.js')));

(function () {
  const args = typeof scriptArgs !== 'undefined' ? scriptArgs : [];
  if (args.length < 2) { print('uso: qjs --std util/n.js programa.esl [argumentos…]'); std.exit(2); }
  const fuente = std.loadFile(args[1]);
  if (fuente === null) { print('no se pudo abrir ' + args[1]); std.exit(2); }

  const fallo = (m) => { throw new Error(m); };

  const archivos = {
    leer(ruta) {
      const t = std.loadFile(ruta);
      if (t === null) fallo('no se pudo leer ' + ruta);
      return t;
    },
    escribir(ruta, texto) {
      const f = std.open(ruta, 'w');
      if (!f) fallo('no se pudo escribir ' + ruta);
      f.puts(texto); f.close();
    },
    agregar(ruta, texto) {
      const f = std.open(ruta, 'a');
      if (!f) fallo('no se pudo abrir ' + ruta);
      f.puts(texto); f.close();
    },
    existe(ruta) { const [, err] = os.stat(ruta); return !err; },
    esCarpeta(ruta) {
      const [st, err] = os.stat(ruta);
      return !err && (st.mode & os.S_IFMT) === os.S_IFDIR;
    },
    listar(ruta) {
      const [ns, err] = os.readdir(ruta);
      if (err) fallo('no se pudo listar ' + ruta);
      return ns.filter(n => n !== '.' && n !== '..');
    },
    crearCarpeta(ruta) {
      // Como «mkdir -p»: se crean las que falten por el camino.
      const partes = ruta.split(/[\/\\]/);
      let acc = ruta.startsWith('/') ? '/' : '';
      for (const p of partes) {
        if (!p) continue;
        acc = acc && acc !== '/' ? acc + '/' + p : acc + p;
        const [, err] = os.stat(acc);
        if (err) os.mkdir(acc, 0o755);
      }
    },
    borrar(ruta) {
      const [, err] = os.stat(ruta);
      if (err) return false;
      os.remove(ruta);
      return true;
    },
    tamano(ruta) {
      const [st, err] = os.stat(ruta);
      if (err) fallo('no existe ' + ruta);
      return st.size;
    },
  };

  // ----------------------------------------------------------------- módulos
  // El mismo cargador que la versión de Node, con las mismas reglas y los
  // mismos mensajes: rutas relativas al archivo que importa, y la ruta real
  // como clave, para que dos caminos al mismo archivo sean un solo módulo.
  // QuickJS no trae «path», así que unir y normalizar se hacen aquí — y tienen
  // que dar exactamente lo mismo que path.resolve, porque el texto del error
  // que se compara entre los dos intérpretes lleva la ruta dentro.
  function normalizar(ruta) {
    const abs = ruta.startsWith('/');
    const out = [];
    for (const seg of ruta.replace(/\\/g, '/').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        if (out.length && out[out.length - 1] !== '..') out.pop();
        else if (!abs) out.push('..');
        continue;
      }
      out.push(seg);
    }
    return (abs ? '/' : '') + out.join('/');
  }
  function carpetaDe(ruta) {
    const i = Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\'));
    return i < 0 ? '.' : (ruta.slice(0, i) || '/');
  }
  function absoluta(base, rel) {
    if (rel.startsWith('/')) return normalizar(rel);
    return normalizar(base + '/' + rel);
  }
  function rutaReal(ruta) {
    const [r, err] = os.realpath(ruta);
    return err ? null : r;
  }
  const cwd = () => { const [d, err] = os.getcwd(); return err ? '.' : d; };

  const modulos = {
    resolver(espec, desde) {
      const base = desde ? carpetaDe(desde) : cwd();
      const abs = absoluta(base, espec);
      const real = rutaReal(abs);
      if (real === null) fallo(`no existe el módulo «${espec}» (se buscó en ${abs})`);
      if (!archivos.existe(real) || archivos.esCarpeta(real)) fallo(`«${espec}» no es un archivo (${real})`);
      return real;
    },
    leer(clave) { return archivos.leer(clave); },
  };

  const sistema = {
    argumentos() { return args.slice(2); },
    entorno(n) { const v = std.getenv(n); return v === undefined ? null : v; },
    ejecutar(orden, extra) {
      // Se lanza sin shell: la orden y sus argumentos van por separado, así que
      // un espacio o una comilla dentro de un dato no se vuelve otra orden.
      const salida = std.tmpfile(), error = std.tmpfile();
      const codigo = os.exec([orden].concat(extra), {
        stdout: salida.fileno(), stderr: error.fileno(), usePath: true,
      });
      salida.seek(0, std.SEEK_SET); error.seek(0, std.SEEK_SET);
      const r = { codigo, salida: salida.readAsString(), error: error.readAsString() };
      salida.close(); error.close();
      return r;
    },
    leerLinea() { const l = std.in.getline(); return l === null ? null : l; },
    salir(c) { std.exit(c); },
  };

  // Aquí tampoco hay `red`: QuickJS no trae «fetch» ni sockets, y montar HTTP a
  // mano sobre su API de archivos sería un cliente de mentira. El intérprete de
  // Node sí lo ofrece; «pedir» aquí dice que falta el anfitrión.
  //
  // Aquí no hay `nativo`, y no es un olvido: QuickJS no sabe llamar a código
  // compilado. Lo único que tiene es cargar módulos nativos como .so, y esos
  // .so hay que compilarlos contra las cabeceras de QuickJS —o sea, hace falta
  // un compilador de C, que es justo lo que se quería evitar—; en Windows no
  // tiene ni eso. Así que «nativa» aquí dice que falta el anfitrión, y es
  // verdad. El intérprete de Node sí lo ofrece, con koffi.
  const m = globalThis.EspanolLike.crearMotor({
    salida: s => print(s),
    host: { archivos, sistema, modulos },
    limiteInstr: 4e8,
  });
  const claveRaiz = rutaReal(absoluta(cwd(), args[1])) || absoluta(cwd(), args[1]);
  const r = m.ejecutar(fuente, claveRaiz);
  if (!r.ok) {
    for (const e of r.errores) print(e.formato ? e.formato() : e.message);
    std.exit(1);
  }
})();
