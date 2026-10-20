// Anfitrión del dispositivo «gpu» de C1EÑ: NVRTC + la Driver API de CUDA,
// llamadas desde Node con koffi. Sin nvcc, sin compilar nada de C++ para Node,
// sin Python.
//
//   const cuda = require('./c1en-cuda.js').crear();   // null si no hay GPU
//   cuda.dispositivos      → [{ indice, nombre, cc: [7, 5], memoria }]
//   cuda.usar(1)           → la GPU 1 pasa a ser la actual
//   cuda.compilar(fuente, ['f'])  → { f: manejador }   (NVRTC → PTX → módulo)
//   cuda.reservar(bytes) · cuda.subir(d, typed) · cuda.bajar(typed, d) · cuda.liberar(d)
//   cuda.lanzar(f, bloques, hilos, [{ t: 'i64' | 'f64' | 'i32' | 'ptr', v }])
//   cuda.sincronizar()
//   (motor-exp N4.3) colas (streams) y eventos, si el driver los trae (cuda.asincrono):
//   cuda.nuevaCola() · cuda.esperarCola(s) · cuda.colaLista(s) · cuda.soltarCola(s)
//   cuda.nuevoEvento(conTiempo) · cuda.marcar(e, s) · cuda.colaEspera(s, e) · cuda.esperarEvento(e)
//   cuda.eventoListo(e) · cuda.tiempoEntre(a, b) · cuda.soltarEvento(e)
//   lanzar(f, b, h, args, s), subir(d, typed, s) y bajar(typed, d, s) aceptan la cola (null = la de siempre)
//
// POR QUÉ ASÍ. La Driver API es una biblioteca de C normal (libcuda.so, que
// instala el driver de NVIDIA) y NVRTC otra (libnvrtc.so, del toolkit). Las dos
// se pueden llamar con koffi igual que la libc, así que el motor de Ñ llega a la
// GPU sin una sola línea compilada para Node. El precio es que aquí no hay
// cabeceras que comprueben las firmas: van escritas a mano abajo, con su
// prototipo de CUDA al lado, y cada una se ha mirado contra la documentación de
// la Driver API (cuda.h de CUDA 12). Los nombres con _v2 son los de verdad: en
// cuda.h, «cuMemAlloc» es una macro que apunta a «cuMemAlloc_v2», y el símbolo
// sin sufijo es la ABI vieja de 32 bits.
//
// LA EXACTITUD. NVRTC compila con --fmad=false: sin eso, a*b+c se contrae en
// una FMA y el último bit deja de coincidir con la CPU. La división y la raíz
// de double en CUDA ya son IEEE (redondeo correcto) sin pedir nada.
//
// VARIAS GPU. C1EN_GPU=k elige la GPU inicial. El patrón recomendado con las dos
// T4 de Kaggle es UN PROCESO POR GPU (C1EN_GPU=0 y C1EN_GPU=1): cada proceso
// tiene su contexto y su caché de módulos, y no hay que pensar en qué contexto
// está activo en cada hilo. Aun así «usar(k)» cambia de GPU dentro del mismo
// proceso: cada GPU tiene su contexto primario, y los módulos se cargan por GPU.
//
// Variables de entorno:
//   C1EN_GPU=k              la GPU inicial (por defecto 0)
//   C1EN_CUDA_LIB=ruta      dónde está libcuda (por defecto libcuda.so.1)
//   C1EN_NVRTC_LIB=ruta     dónde está libnvrtc (se busca en los sitios de siempre)
//   C1EN_MAX_BLOQUES=n      tope de bloques por lanzamiento (para probar las zancadas)
'use strict';
const fs = require('fs');
const path = require('path');

let motivo = null;
function porQueNo() { return motivo; }

// Dónde suele estar libnvrtc. En Kaggle está en /usr/local/cuda/lib64; con los
// paquetes de pip de NVIDIA, dentro de site-packages/nvidia/cuda_nvrtc/lib.
function candidatosNvrtc() {
  const out = [];
  if (process.env.C1EN_NVRTC_LIB) out.push(process.env.C1EN_NVRTC_LIB);
  out.push('libnvrtc.so', 'libnvrtc.so.12', 'libnvrtc.so.11.2');
  const dirs = ['/usr/local/cuda/lib64', '/usr/local/cuda/targets/x86_64-linux/lib', '/usr/lib/x86_64-linux-gnu'];
  try {
    for (const d of fs.readdirSync('/usr/local')) if (/^cuda-\d/.test(d)) dirs.push(path.join('/usr/local', d, 'lib64'));
  } catch (_) { /* no hay /usr/local */ }
  for (const base of ['/usr/local/lib', '/usr/lib', '/opt/conda/lib']) {
    try {
      for (const py of fs.readdirSync(base)) if (/^python3/.test(py))
        for (const sp of ['site-packages', 'dist-packages']) dirs.push(path.join(base, py, sp, 'nvidia', 'cuda_nvrtc', 'lib'));
    } catch (_) { /* nada */ }
  }
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d).sort().reverse())
        if (/^libnvrtc\.so(\.\d+)*$/.test(f)) out.push(path.join(d, f));
    } catch (_) { /* no existe */ }
  }
  return out;
}

function crear() {
  let koffi;
  try { koffi = require('koffi'); }
  catch (e) { motivo = 'koffi no está instalado (npm install koffi)'; return null; }

  // ── libcuda: la Driver API ──────────────────────────────────────────────────
  let libcuda;
  const nombreCuda = process.env.C1EN_CUDA_LIB || 'libcuda.so.1';
  try { libcuda = koffi.load(nombreCuda); }
  catch (e) { motivo = `no hay driver de NVIDIA (no se pudo abrir ${nombreCuda})`; return null; }

  // CUresult es un enum (int). CUdevice es un int. CUcontext, CUmodule,
  // CUfunction y CUstream son punteros opacos. CUdeviceptr es un entero sin
  // signo de 64 bits (unsigned long long en 64 bits). size_t es size_t.
  const C = {};
  const decl = (proto) => {
    const nombre = /\b(cu\w+)\s*\(/.exec(proto)[1];
    try { C[nombre] = libcuda.func(proto); }
    catch (e) { throw new Error(`libcuda no trae ${nombre}: ${e.message}`); }
  };
  try {
    decl('int cuInit(unsigned int Flags)');                                                // CUresult cuInit(unsigned int)
    decl('int cuDriverGetVersion(_Out_ int *driverVersion)');                              // (int*)
    decl('int cuDeviceGetCount(_Out_ int *count)');                                        // (int*)
    decl('int cuDeviceGet(_Out_ int *device, int ordinal)');                               // (CUdevice*, int)
    decl('int cuDeviceGetName(_Out_ uint8_t *name, int len, int dev)');                    // (char*, int, CUdevice)
    decl('int cuDeviceGetAttribute(_Out_ int *pi, int attrib, int dev)');                  // (int*, CUdevice_attribute, CUdevice)
    decl('int cuDeviceTotalMem_v2(_Out_ size_t *bytes, int dev)');                         // (size_t*, CUdevice)
    decl('int cuDevicePrimaryCtxRetain(_Out_ void **pctx, int dev)');                      // (CUcontext*, CUdevice)
    decl('int cuCtxSetCurrent(void *ctx)');                                                // (CUcontext)
    decl('int cuCtxSynchronize()');                                                        // (void)
    decl('int cuModuleLoadData(_Out_ void **module, const char *image)');                  // (CUmodule*, const void*)
    decl('int cuModuleGetFunction(_Out_ void **hfunc, void *hmod, const char *name)');     // (CUfunction*, CUmodule, const char*)
    decl('int cuMemAlloc_v2(_Out_ uint64_t *dptr, size_t bytesize)');                      // (CUdeviceptr*, size_t)
    decl('int cuMemFree_v2(uint64_t dptr)');                                               // (CUdeviceptr)
    decl('int cuMemcpyHtoD_v2(uint64_t dstDevice, const void *srcHost, size_t ByteCount)'); // (CUdeviceptr, const void*, size_t)
    decl('int cuMemcpyDtoH_v2(void *dstHost, uint64_t srcDevice, size_t ByteCount)');       // (void*, CUdeviceptr, size_t)
    // CUresult cuLaunchKernel(CUfunction f, unsigned gridDimX, gridDimY, gridDimZ,
    //   unsigned blockDimX, blockDimY, blockDimZ, unsigned sharedMemBytes,
    //   CUstream hStream, void **kernelParams, void **extra)
    decl('int cuLaunchKernel(void *f, unsigned int gx, unsigned int gy, unsigned int gz, ' +
         'unsigned int bx, unsigned int by, unsigned int bz, unsigned int shmem, void *stream, void *params, void *extra)');
    decl('int cuGetErrorName(int error, _Out_ const char **pStr)');                        // (CUresult, const char**)
  } catch (e) { motivo = e.message; return null; }
  // (motor-exp N4.3) Lo asíncrono: colas (CUstream), eventos (CUevent) y copias
  // que no esperan. Si el driver no los trae, todo sigue funcionando en la cola
  // de siempre (la «legacy», null) y «asincrono» queda en falso.
  let asincrono = true;
  try {
    decl('int cuStreamCreate(_Out_ void **phStream, unsigned int Flags)');                 // (CUstream*, unsigned)
    decl('int cuStreamDestroy_v2(void *hStream)');                                         // (CUstream)
    decl('int cuStreamSynchronize(void *hStream)');                                        // (CUstream)
    decl('int cuStreamQuery(void *hStream)');                                              // (CUstream) → 0 o CUDA_ERROR_NOT_READY (600)
    decl('int cuStreamWaitEvent(void *hStream, void *hEvent, unsigned int Flags)');        // (CUstream, CUevent, unsigned)
    decl('int cuEventCreate(_Out_ void **phEvent, unsigned int Flags)');                   // (CUevent*, unsigned)
    decl('int cuEventDestroy_v2(void *hEvent)');                                           // (CUevent)
    decl('int cuEventRecord(void *hEvent, void *hStream)');                                // (CUevent, CUstream)
    decl('int cuEventSynchronize(void *hEvent)');                                          // (CUevent)
    decl('int cuEventQuery(void *hEvent)');                                                // (CUevent) → 0 o 600
    decl('int cuEventElapsedTime(_Out_ float *pMilliseconds, void *hStart, void *hEnd)');  // (float*, CUevent, CUevent)
    decl('int cuMemcpyHtoDAsync_v2(uint64_t dstDevice, const void *srcHost, size_t ByteCount, void *hStream)');
    decl('int cuMemcpyDtoHAsync_v2(void *dstHost, uint64_t srcDevice, size_t ByteCount, void *hStream)');
  } catch (_) { asincrono = false; }

  const nombreError = (r) => {
    const s = [null];
    try { if (C.cuGetErrorName(r, s) === 0 && s[0]) return s[0]; } catch (_) { /* nada */ }
    return `código ${r}`;
  };
  const ok = (r, que) => {
    if (r !== 0) throw new Error(`${que} devolvió ${nombreError(r)}`);
  };

  // cuInit falla con CUDA_ERROR_NO_DEVICE (100) si no hay GPU: eso no es un
  // error, es la respuesta.
  const r0 = C.cuInit(0);
  if (r0 !== 0) { motivo = `el driver de CUDA no arranca (cuInit: ${nombreError(r0)})`; return null; }
  const cuenta = [0];
  ok(C.cuDeviceGetCount(cuenta), 'cuDeviceGetCount');
  if (!cuenta[0]) { motivo = 'el driver está pero no hay ninguna GPU'; return null; }

  const ATTR_CC_MAYOR = 75, ATTR_CC_MENOR = 76;   // CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR/MINOR
  const dispositivos = [];
  for (let k = 0; k < cuenta[0]; k++) {
    const d = [0];
    ok(C.cuDeviceGet(d, k), 'cuDeviceGet');
    const b = Buffer.alloc(256);
    ok(C.cuDeviceGetName(b, 256, d[0]), 'cuDeviceGetName');
    const may = [0], men = [0], mem = [0];
    ok(C.cuDeviceGetAttribute(may, ATTR_CC_MAYOR, d[0]), 'cuDeviceGetAttribute');
    ok(C.cuDeviceGetAttribute(men, ATTR_CC_MENOR, d[0]), 'cuDeviceGetAttribute');
    try { C.cuDeviceTotalMem_v2(mem, d[0]); } catch (_) { /* no es imprescindible */ }
    const fin = b.indexOf(0);
    dispositivos.push({ indice: k, dev: d[0], nombre: b.toString('utf8', 0, fin < 0 ? 256 : fin),
      cc: [may[0], men[0]], memoria: Number(mem[0]) });
  }

  // ── libnvrtc ─────────────────────────────────────────────────────────────────
  let nvrtc = null, nombreNvrtc = null;
  for (const c of candidatosNvrtc()) {
    try { nvrtc = koffi.load(c); nombreNvrtc = c; break; } catch (_) { /* el siguiente */ }
  }
  if (!nvrtc) { motivo = 'hay GPU pero no se encontró libnvrtc (indícala con C1EN_NVRTC_LIB)'; return null; }
  const N = {};
  try {
    // nvrtcResult nvrtcCreateProgram(nvrtcProgram *prog, const char *src, const char *name,
    //   int numHeaders, const char * const *headers, const char * const *includeNames)
    N.crear = nvrtc.func('int nvrtcCreateProgram(_Out_ void **prog, const char *src, const char *name, int nh, void *h, void *hn)');
    // nvrtcResult nvrtcCompileProgram(nvrtcProgram prog, int numOptions, const char * const *options)
    N.compilar = nvrtc.func('int nvrtcCompileProgram(void *prog, int n, const char **opts)');
    N.tamLog = nvrtc.func('int nvrtcGetProgramLogSize(void *prog, _Out_ size_t *n)');
    N.log = nvrtc.func('int nvrtcGetProgramLog(void *prog, _Out_ uint8_t *log)');
    N.tamPtx = nvrtc.func('int nvrtcGetPTXSize(void *prog, _Out_ size_t *n)');
    N.ptx = nvrtc.func('int nvrtcGetPTX(void *prog, _Out_ uint8_t *ptx)');
    // nvrtcResult nvrtcDestroyProgram(nvrtcProgram *prog)
    N.destruir = nvrtc.func('int nvrtcDestroyProgram(_Inout_ void **prog)');
    N.error = nvrtc.func('const char *nvrtcGetErrorString(int r)');
    N.version = nvrtc.func('int nvrtcVersion(_Out_ int *mayor, _Out_ int *menor)');
  } catch (e) { motivo = `libnvrtc (${nombreNvrtc}) no trae lo que hace falta: ${e.message}`; return null; }
  const vM = [0], vm = [0];
  N.version(vM, vm);
  const versionNvrtc = `${vM[0]}.${vm[0]}`;

  const okN = (r, que, prog) => {
    if (r === 0) return;
    let log = '';
    if (prog) {
      const n = [0];
      if (N.tamLog(prog, n) === 0 && Number(n[0]) > 1) {
        const b = Buffer.alloc(Number(n[0]));
        N.log(prog, b);
        log = b.toString('utf8', 0, Math.max(0, b.indexOf(0))).trim();
      }
    }
    throw new Error(`NVRTC: ${que} devolvió ${N.error(r)}${log ? '\n' + log : ''}`);
  };

  // ── estado: GPU actual, contextos y módulos ──────────────────────────────────
  let actual = Number(process.env.C1EN_GPU || 0);
  if (!Number.isInteger(actual) || actual < 0 || actual >= dispositivos.length) actual = 0;
  const contextos = new Map();         // índice → CUcontext
  const modulos = new Map();           // `${índice}\0${fuente}` → { nombre: CUfunction }

  // El contexto PRIMARIO de cada GPU, el mismo que usa el runtime de CUDA: así
  // C1EÑ convive con cualquier otra cosa del proceso que use la GPU (y no hay
  // que destruirlo al salir).
  function activar(k) {
    let ctx = contextos.get(k);
    if (!ctx) {
      const p = [null];
      ok(C.cuDevicePrimaryCtxRetain(p, dispositivos[k].dev), 'cuDevicePrimaryCtxRetain');
      ctx = p[0];
      contextos.set(k, ctx);
    }
    ok(C.cuCtxSetCurrent(ctx), 'cuCtxSetCurrent');
  }
  let activado = -1;
  const asegurar = () => { if (activado !== actual) { activar(actual); activado = actual; } };

  function compilar(fuente, nombres) {
    const clave = `${actual}\0${fuente}`;
    const ya = modulos.get(clave);
    if (ya) return ya;
    asegurar();
    const cc = dispositivos[actual].cc;
    const arch = `-arch=compute_${cc[0]}${cc[1]}`;
    // Las opciones de exactitud: sin FMA, sin aplanar subnormales y con división
    // y raíz correctamente redondeadas (las dos últimas solo afectan a float, y
    // se dicen igual para que nadie tenga que adivinarlo).
    const opciones = ['--fmad=false', arch, '--ftz=false', '--prec-div=true', '--prec-sqrt=true', '--std=c++17'];
    const p = [null];
    okN(N.crear(p, fuente, 'c1en.cu', 0, null, null), 'nvrtcCreateProgram');
    const prog = p[0];
    let ptx;
    try {
      okN(N.compilar(prog, opciones.length, opciones), 'nvrtcCompileProgram', prog);
      const n = [0];
      okN(N.tamPtx(prog, n), 'nvrtcGetPTXSize');
      const b = Buffer.alloc(Number(n[0]));
      okN(N.ptx(prog, b), 'nvrtcGetPTX');
      ptx = b.toString('latin1', 0, b.indexOf(0) < 0 ? b.length : b.indexOf(0));
    } finally {
      N.destruir([prog]);
    }
    const m = [null];
    ok(C.cuModuleLoadData(m, ptx), 'cuModuleLoadData');
    const out = {};
    for (const nm of nombres) {
      const f = [null];
      ok(C.cuModuleGetFunction(f, m[0], nm), `cuModuleGetFunction(${nm})`);
      out[nm] = f[0];
    }
    modulos.set(clave, out);
    return out;
  }

  const big = v => (typeof v === 'bigint' ? v : BigInt(v));
  function reservar(bytes) {
    asegurar();
    const d = [0];
    ok(C.cuMemAlloc_v2(d, bytes), 'cuMemAlloc');
    return big(d[0]);
  }
  function liberar(d) { asegurar(); ok(C.cuMemFree_v2(big(d)), 'cuMemFree'); }
  // Cuentas del tráfico por el PCIe, para saber si la residencia está haciendo
  // su trabajo: con C1EN_ESTADISTICAS=1 se imprimen al salir.
  const cuentas = { subidas: 0, bytesSubidos: 0, bajadas: 0, bytesBajados: 0, lanzamientos: 0 };
  if (process.env.C1EN_ESTADISTICAS) process.on('exit', () => {
    const mb = b => (b / 1048576).toFixed(1) + ' MB';
    process.stderr.write(`[c1en gpu] ${cuentas.lanzamientos} lanzamientos · ${cuentas.subidas} subidas (${mb(cuentas.bytesSubidos)}) · ${cuentas.bajadas} bajadas (${mb(cuentas.bytesBajados)})\n`);
  });
  // (motor-exp N4.3) Con una cola, la subida es asíncrona: desde memoria normal
  // (no fijada) el driver copia los bytes a su zona intermedia antes de volver,
  // así que el arreglo de JavaScript se puede tocar en cuanto vuelve, y la copia
  // al dispositivo va en orden dentro de la cola, sin parar a la CPU. La bajada
  // espera a que la cola termine (la CPU va a leer).
  function subir(d, typed, s) {
    asegurar(); cuentas.subidas++; cuentas.bytesSubidos += typed.byteLength;
    if (s && asincrono) ok(C.cuMemcpyHtoDAsync_v2(big(d), typed, typed.byteLength, s), 'cuMemcpyHtoDAsync');
    else ok(C.cuMemcpyHtoD_v2(big(d), typed, typed.byteLength), 'cuMemcpyHtoD');
  }
  function bajar(typed, d, s) {
    asegurar(); cuentas.bajadas++; cuentas.bytesBajados += typed.byteLength;
    if (s && asincrono) ok(C.cuStreamSynchronize(s), 'cuStreamSynchronize');
    ok(C.cuMemcpyDtoH_v2(typed, big(d), typed.byteLength), 'cuMemcpyDtoH');
  }

  // kernelParams es un arreglo de PUNTEROS, uno por argumento, cada uno a la
  // memoria donde está el VALOR de ese argumento (8 bytes cada uno: los i32 van
  // en los 4 bajos, que en x86-64 —little endian— es donde los lee el driver).
  // El driver copia los valores en el momento del lanzamiento, así que la
  // memoria se puede soltar en cuanto cuLaunchKernel vuelve.
  // (motor-exp N4.3) kernelParams lleva un NULL de más al final: el driver no
  // lo mira (sabe cuántos parámetros tiene el núcleo), y al simulador le dice
  // dónde acaba la lista para copiar los valores si deja el núcleo en cola.
  function lanzar(fun, bloques, hilos, args, s) {
    cuentas.lanzamientos++;
    asegurar();
    const n = args.length;
    const valores = koffi.alloc('uint64_t', Math.max(1, n));
    const punteros = koffi.alloc('uint64_t', n + 1);
    try {
      const base = big(koffi.address(valores));
      args.forEach((a, j) => {
        const off = 8 * j;
        if (a.t === 'f64') koffi.encode(valores, off, 'double', a.v);
        else if (a.t === 'i32') { koffi.encode(valores, off, 'uint64_t', 0n); koffi.encode(valores, off, 'int32_t', a.v); }
        else if (a.t === 'ptr') koffi.encode(valores, off, 'uint64_t', big(a.v));
        else koffi.encode(valores, off, 'int64_t', BigInt(a.v));
        koffi.encode(punteros, off, 'uint64_t', base + BigInt(off));
      });
      koffi.encode(punteros, 8 * n, 'uint64_t', 0n);
      ok(C.cuLaunchKernel(fun, bloques, 1, 1, hilos, 1, 1, 0, (s && asincrono) ? s : null, punteros, null), 'cuLaunchKernel');
    } finally {
      koffi.free(valores);
      koffi.free(punteros);
    }
  }
  function sincronizar() { asegurar(); ok(C.cuCtxSynchronize(), 'cuCtxSynchronize'); }

  // ── (motor-exp N4.3) colas y eventos ─────────────────────────────────────────
  // Las colas son NO BLOQUEANTES (CU_STREAM_NON_BLOCKING = 1): no esperan a la
  // cola de siempre ni ella a ellas, así que el orden entre colas lo pone quien
  // las usa, con eventos (cuStreamWaitEvent). Es lo que deja que una cola copie
  // mientras otra calcula.
  const NO_LISTO = 600;   // CUDA_ERROR_NOT_READY
  function exigirAsinc(que) { if (!asincrono) throw new Error(`este driver no trae colas (${que})`); }
  function nuevaCola() { exigirAsinc('cuStreamCreate'); asegurar(); const p = [null]; ok(C.cuStreamCreate(p, 1), 'cuStreamCreate'); return p[0]; }
  function soltarCola(s) { if (s && asincrono) { asegurar(); ok(C.cuStreamDestroy_v2(s), 'cuStreamDestroy'); } }
  function esperarCola(s) { asegurar(); if (asincrono) ok(C.cuStreamSynchronize(s || null), 'cuStreamSynchronize'); else ok(C.cuCtxSynchronize(), 'cuCtxSynchronize'); }
  function colaLista(s) {
    if (!asincrono) return true;
    asegurar(); const r = C.cuStreamQuery(s || null);
    if (r === NO_LISTO) return false; ok(r, 'cuStreamQuery'); return true;
  }
  // CU_EVENT_DISABLE_TIMING = 2: los de orden no miden tiempo (son más baratos)
  function nuevoEvento(conTiempo) { exigirAsinc('cuEventCreate'); asegurar(); const p = [null]; ok(C.cuEventCreate(p, conTiempo ? 0 : 2), 'cuEventCreate'); return p[0]; }
  function soltarEvento(e) { if (e && asincrono) { asegurar(); ok(C.cuEventDestroy_v2(e), 'cuEventDestroy'); } }
  function marcar(e, s) { asegurar(); ok(C.cuEventRecord(e, s || null), 'cuEventRecord'); }
  function colaEspera(s, e) { asegurar(); ok(C.cuStreamWaitEvent(s || null, e, 0), 'cuStreamWaitEvent'); }
  function esperarEvento(e) { asegurar(); ok(C.cuEventSynchronize(e), 'cuEventSynchronize'); }
  function eventoListo(e) { asegurar(); const r = C.cuEventQuery(e); if (r === NO_LISTO) return false; ok(r, 'cuEventQuery'); return true; }
  function tiempoEntre(a, b) { asegurar(); const ms = [0]; ok(C.cuEventElapsedTime(ms, a, b), 'cuEventElapsedTime'); return ms[0]; }

  const dv = [0];
  C.cuDriverGetVersion(dv);
  return {
    dispositivos,
    get actual() { return actual; },
    usar(k) {
      if (!Number.isInteger(k) || k < 0 || k >= dispositivos.length) throw new Error(`no hay GPU ${k}`);
      actual = k;
      asegurar();
    },
    maxBloques: Number(process.env.C1EN_MAX_BLOQUES) > 0 ? Number(process.env.C1EN_MAX_BLOQUES) : 1048576,
    driver: `${Math.floor(dv[0] / 1000)}.${(dv[0] % 1000) / 10}`,
    nvrtc: versionNvrtc, rutaNvrtc: nombreNvrtc,
    compilar, reservar, liberar, subir, bajar, lanzar, sincronizar,
    asincrono, nuevaCola, soltarCola, esperarCola, colaLista, nuevoEvento, soltarEvento, marcar, colaEspera,
    esperarEvento, eventoListo, tiempoEntre, cuentas,
  };
}

module.exports = { crear, porQueNo };
