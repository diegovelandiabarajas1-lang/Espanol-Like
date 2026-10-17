// El .elb de varios archivos: un programa con sus módulos en un solo archivo.
//
// Un .elb de siempre (ESLB, 05-serial.js) guarda UNA función y su árbol. Un
// programa con «usar "lib/x.esl"» son varias: la del principal y una por cada
// módulo, y el bytecode de cada una nombra a las otras por su CLAVE —la ruta del
// módulo—, que va escrita dentro de los nombres de sus globales
// («lib/x.esl\0sumar») y en cada llamada a « usar».
//
// Dos problemas, y cómo se resuelven aquí sin tocar el motor:
//
//  1. LAS CLAVES. En la consola la clave de un módulo es su ruta absoluta
//     (D:\ProyectosJS\…), que en otra máquina no vale. Así que al COMPILAR el
//     anfitrión no le da al motor rutas del disco, sino rutas relativas a la
//     carpeta del programa principal, con «/»: «lib/pantalla.esl»,
//     «../comun/x.esl». El bytecode sale igual en cualquier carpeta y en
//     cualquier sistema operativo. (Es lo que ya hacía empaquetar.js con /app/.)
//
//  2. EL FORMATO. No se cambia el .elb: se METE. Un paquete es una lista de
//     .elb de siempre, cada uno con su clave delante:
//
//        ESLP · versión (1) · huella de la tabla de opcodes (uint32)
//        nº de módulos
//          por cada uno:  clave (texto UTF-8) · tamaño · un .elb completo (ESLB…)
//        tamaño · el .elb del programa principal
//
//     Cada .elb de dentro se lee con el deserializar de siempre, que lo verifica
//     entero —las seis comprobaciones—. Este archivo solo verifica lo suyo: la
//     cabecera, que las claves sean rutas relativas limpias y no se repitan, y
//     que no sobre ni falte nada. Los .elb de un solo archivo siguen siendo
//     ESLB y siguen valiendo; el motor ni se entera de que existe esto.
//
// Ejecutar un paquete es lo que el motor ya sabía hacer con un programa de
// varios archivos: correr(principal, avisos, [{clave, fn}]). La nativa « usar»
// busca cada módulo en ese registro por su clave; no hace falta ningún disco,
// así que un paquete corre también donde no hay módulos (el IDE).
//
// Funciona en Node, en el navegador y en QuickJS: no usa Buffer, ni require,
// ni TextEncoder.
(function (raiz) {
  'use strict';

  const MAGIA = [0x45, 0x53, 0x4C, 0x50];      // "ESLP"
  const MAGIA_ELB = [0x45, 0x53, 0x4C, 0x42];  // "ESLB", el .elb de un archivo
  const VERSION = 1;
  const MAX_MODULOS = 4096;
  const MAX_CLAVE = 1024;                      // bytes

  function crear(EL) {
    if (!EL || !EL.deserializar || !EL.serializar || !EL.crearMotor || !EL.ErrorBytecode || !EL.deTexto)
      throw new Error('paquete-elb: hace falta el motor (globalThis.EspanolLike)');
    const ErrorBytecode = EL.ErrorBytecode;
    const fallo = (m, pos) => new ErrorBytecode(m, pos);

    // La huella no está exportada por el bundle; se saca de un .elb de verdad,
    // que la lleva en los bytes 5 a 8. Así es la misma por construcción.
    let huella = null;
    function huellaMotor() {
      if (huella !== null) return huella;
      const m = EL.crearMotor({ salida: () => {}, host: {} });
      const r = m.serializar('fijo x = 1');
      if (!r.ok) throw new Error('paquete-elb: el motor no pudo compilar una línea');
      huella = (r.bytes[5] | (r.bytes[6] << 8) | (r.bytes[7] << 16) | (r.bytes[8] << 24)) >>> 0;
      return huella;
    }

    // ── bytes ─────────────────────────────────────────────────────────────
    const empiezaPor = (b, marca) => b.length >= 4 && b[0] === marca[0] && b[1] === marca[1] &&
      b[2] === marca[2] && b[3] === marca[3];

    // Acepta bytes (Uint8Array, Buffer, lista) o el mismo archivo en base64 —como
    // el .elb de siempre, para cuando solo se puede mover texto—.
    function aBytes(datos) {
      // Un texto es base64; lo que sale puede ser a su vez el archivo .elb.txt
      // (base64 de base64: el IDE manda así cualquier archivo que se importa).
      if (typeof datos === 'string') return aBytes(EL.deTexto(datos));
      if (Array.isArray(datos)) return Uint8Array.from(datos);
      if (datos instanceof Uint8Array) {
        if (empiezaPor(datos, MAGIA) || empiezaPor(datos, MAGIA_ELB)) return datos;
        // ¿Es base64 escrito en un archivo? Solo si TODO son caracteres de base64.
        let t = '';
        for (let i = 0; i < datos.length; i++) {
          const c = datos[i];
          if (c === 9 || c === 10 || c === 13 || c === 32) continue;
          const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;
          if (!ok) return datos;
          t += String.fromCharCode(c);
        }
        return t ? EL.deTexto(t) : datos;
      }
      throw fallo('se esperaban bytes o un texto en base64');
    }

    function esPaquete(datos) {
      try { return empiezaPor(aBytes(datos), MAGIA); } catch (_) { return false; }
    }

    // UTF-8 con lo que hay en todos los motores de JavaScript (escape y
    // encodeURIComponent existen también en QuickJS). Estricto al leer: una
    // secuencia rota es un archivo roto, no un carácter de reemplazo.
    function utf8(s) {
      const bin = unescape(encodeURIComponent(s));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    function deUtf8(b, ini, n, pos) {
      let bin = '';
      for (let i = 0; i < n; i++) bin += String.fromCharCode(b[ini + i]);
      try { return decodeURIComponent(escape(bin)); }
      catch (_) { throw fallo('una clave no es UTF-8 válido', pos); }
    }

    class Escritor {
      constructor() { this.b = []; }
      u8(v) { this.b.push(v & 255); }
      varint(v) { do { const c = v % 128; v = Math.floor(v / 128); this.b.push(v ? c + 128 : c); } while (v); }
      bytes(x) { for (let i = 0; i < x.length; i++) this.b.push(x[i]); }
      terminar() { return Uint8Array.from(this.b); }
    }
    class Lector {
      constructor(b) { this.b = b; this.p = 0; }
      get restantes() { return this.b.length - this.p; }
      u8() {
        if (this.p >= this.b.length) throw fallo('el paquete se acaba antes de tiempo', this.p);
        return this.b[this.p++];
      }
      varint() {
        let v = 0, mult = 1, n = 0;
        for (;;) {
          const c = this.u8();
          v += (c & 127) * mult;
          if (!(c & 128)) break;
          mult *= 128;
          if (++n > 9) throw fallo('número codificado demasiado largo', this.p);
        }
        if (!Number.isSafeInteger(v)) throw fallo('número fuera de rango', this.p);
        return v;
      }
      trozo(que) {
        const n = this.varint();
        if (n > this.restantes) throw fallo(`${que}: dice medir ${n} bytes y quedan ${this.restantes}`, this.p);
        const t = this.b.subarray(this.p, this.p + n);
        this.p += n;
        return t;
      }
    }

    // ── claves ────────────────────────────────────────────────────────────
    // Una clave es una ruta RELATIVA a la carpeta del programa principal, con
    // «/»: «lib/x.esl», «../comun/y.esl». Nada de rutas absolutas, de «\», de
    // «.» o «..» en medio, ni de nada que se parezca a la clave de un eDSL
    // («ñ:texto»), que el motor trata aparte.
    function problemaDeClave(k) {
      if (typeof k !== 'string' || !k) return 'está vacía';
      if (k.indexOf('\u0000') >= 0) return 'trae un byte cero';
      if (k.indexOf('\\') >= 0) return 'usa «\\»; las claves se escriben con «/»';
      if (k[0] === '/' || /^[A-Za-z]:/.test(k)) return 'es una ruta absoluta';
      if (k.indexOf(':') >= 0) return 'lleva «:» (se confundiría con un eDSL o una unidad de disco)';
      const partes = k.split('/');
      let subiendo = true;
      for (const p of partes) {
        if (p === '' ) return 'tiene un tramo vacío («//» o «/» al final)';
        if (p === '.') return 'tiene un tramo «.»';
        if (p === '..') { if (!subiendo) return 'tiene «..» en medio'; continue; }
        subiendo = false;
      }
      if (subiendo) return 'no nombra ningún archivo';
      return null;
    }

    // ── armar ─────────────────────────────────────────────────────────────
    // principal: los bytes de un .elb · modulos: [{clave, bytes}]
    function armar(principal, modulos) {
      if (!modulos.length) throw new Error('un paquete sin módulos es un .elb normal: guárdalo como tal');
      if (modulos.length > MAX_MODULOS) throw new Error(`más de ${MAX_MODULOS} módulos`);
      const vistas = new Set();
      const w = new Escritor();
      w.bytes(MAGIA);
      w.u8(VERSION);
      const h = huellaMotor();
      w.u8(h & 255); w.u8((h >>> 8) & 255); w.u8((h >>> 16) & 255); w.u8((h >>> 24) & 255);
      w.varint(modulos.length);
      for (const m of modulos) {
        const p = problemaDeClave(m.clave);
        if (p) throw new Error(`la clave «${m.clave}» ${p}`);
        if (vistas.has(m.clave)) throw new Error(`la clave «${m.clave}» está dos veces`);
        vistas.add(m.clave);
        const k = utf8(m.clave);
        if (k.length > MAX_CLAVE) throw new Error(`la clave «${m.clave}» mide más de ${MAX_CLAVE} bytes`);
        if (!empiezaPor(m.bytes, MAGIA_ELB)) throw new Error(`«${m.clave}» no es un .elb`);
        w.varint(k.length); w.bytes(k);
        w.varint(m.bytes.length); w.bytes(m.bytes);
      }
      if (!empiezaPor(principal, MAGIA_ELB)) throw new Error('el programa principal no es un .elb');
      w.varint(principal.length); w.bytes(principal);
      return w.terminar();
    }

    // ── leer ──────────────────────────────────────────────────────────────
    // Devuelve {fn, modulos: [{clave, fn}]}, listo para motor.correr(fn, [], modulos).
    // Todo se verifica ANTES de devolver nada: si un módulo está roto, no corre
    // ni el principal.
    function leer(datos) {
      const b = aBytes(datos);
      const r = new Lector(b);
      for (let i = 0; i < 4; i++)
        if (r.u8() !== MAGIA[i]) throw fallo(empiezaPor(b, MAGIA_ELB)
          ? 'esto es un .elb de un solo archivo, no un paquete' : 'esto no es un paquete .elb de Ñ', i);
      const v = r.u8();
      if (v !== VERSION) throw fallo(`paquete versión ${v}; este motor lee la ${VERSION}`, 4);
      const h = (r.u8() | (r.u8() << 8) | (r.u8() << 16) | (r.u8() << 24)) >>> 0;
      if (h !== huellaMotor())
        throw fallo('el paquete se compiló con otra tabla de instrucciones; vuelve a compilarlo desde el código fuente', 5);
      const n = r.varint();
      if (n === 0) throw fallo('un paquete sin módulos no existe: sería un .elb normal', r.p);
      if (n > MAX_MODULOS || n > r.restantes) throw fallo(`el paquete anuncia ${n} módulos`, r.p);
      const modulos = [];
      const vistas = new Set();
      for (let i = 0; i < n; i++) {
        const pos = r.p;
        const kb = r.trozo('una clave');
        if (kb.length > MAX_CLAVE) throw fallo(`una clave mide ${kb.length} bytes`, pos);
        const clave = deUtf8(kb, 0, kb.length, pos);
        const p = problemaDeClave(clave);
        if (p) throw fallo(`la clave «${clave}» ${p}`, pos);
        if (vistas.has(clave)) throw fallo(`el módulo «${clave}» está dos veces`, pos);
        vistas.add(clave);
        const elb = r.trozo(`el módulo «${clave}»`);
        let fn;
        try { fn = EL.deserializar(elb); }
        catch (e) {
          if (e && e.name === 'ErrorBytecode') { e.message = `en el módulo «${clave}»: ${e.message}`; throw e; }
          throw e;
        }
        modulos.push({ clave, fn });
      }
      const principal = r.trozo('el programa principal');
      let fn;
      try { fn = EL.deserializar(principal); }
      catch (e) {
        if (e && e.name === 'ErrorBytecode') { e.message = `en el programa principal: ${e.message}`; throw e; }
        throw e;
      }
      if (r.restantes !== 0) throw fallo(`sobran ${r.restantes} byte(s) al final del paquete`, r.p);
      return { fn, modulos };
    }

    // Lo que hay dentro, sin ejecutar (para «elb.js --ver»). Verifica igual.
    function describir(datos) {
      const b = aBytes(datos);
      const p = leer(b);
      return { bytes: b.length, modulos: p.modulos.map(m => m.clave) };
    }

    // ── compilar ──────────────────────────────────────────────────────────
    // Recibe un motor cuyo host.modulos YA da claves relativas (eso es cosa del
    // anfitrión: él sabe dónde está el disco) y el texto del programa principal.
    // Sin módulos de archivo devuelve un .elb de siempre; con ellos, un paquete.
    function compilar(motor, fuente, clavePrincipal) {
      const a = motor.analizar(fuente, clavePrincipal);
      if (!a.ok) return { ok: false, errores: a.errores, avisos: a.avisos };
      try {
        const principal = EL.serializar(a.fn);
        if (!a.modulos.length) return { ok: true, bytes: principal, paquete: false, modulos: [], avisos: a.avisos };
        const mods = a.modulos.map(m => ({ clave: m.clave, bytes: EL.serializar(m.fn) }));
        return { ok: true, bytes: armar(principal, mods), paquete: true, modulos: mods.map(m => m.clave), avisos: a.avisos };
      } catch (e) {
        return { ok: false, errores: [e], avisos: a.avisos };
      }
    }

    return { esPaquete, armar, leer, describir, compilar, problemaDeClave, aBytes, MAGIA, VERSION };
  }

  const api = { crear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PaqueteElb = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
