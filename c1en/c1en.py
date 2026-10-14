"""
c1en — Ñ y C1EÑ desde Python.

    import c1en

    # 1. Correr un programa de Ñ (texto o archivo) y recoger lo que imprime.
    print(c1en.correr('''
        imprimir(derivarFormula("x^3 - 6x^2 + 11x - 6", "x"))
        imprimir(dispositivo())
    '''))

    # 2. Llamar a una función de Ñ como si fuera de Python, con NumPy de por medio.
    tirar = c1en.funcion('''
        fn tirar(i, dentro) {
          fijo x = azarHilo(7, i, 0)
          fijo y = azarHilo(7, i, 1)
          si x * x + y * y < 1.0 { sumarAtomico(dentro, 0, 1) }
        }
    ''', paralelo=True)
    dentro = numpy.zeros(1, dtype=numpy.int32)
    tirar(2_000_000, dentro)          # corre en la T4 si hay, si no en gcc, si no en el JIT
    print(4 * dentro[0] / 2_000_000)

Cómo funciona: cada llamada lanza Node con «bundle-c1en.js» (el perfil con
numerico y nen abiertos, sin «usar») y le pasa el programa. Los arreglos de
NumPy van y vuelven como JSON; para arreglos grandes, como binario crudo por un
archivo temporal (float64 / int32, los mismos tipos que usa Ñ por dentro).
Arrancar Node cuesta ~100 ms y la primera compilación de un núcleo en GPU (NVRTC)
unos 300 ms más; por eso «funcion» devuelve algo que se puede llamar muchas veces
con un solo proceso detrás (ver «Sesion»).

Variables de entorno que respeta (las de C1EÑ): C1EN_DISPOSITIVO, C1EN_GPU,
C1EN_NVRTC_LIB, C1EN_CUDA_LIB. Y una propia: N_RAIZ, la carpeta del proyecto Ñ
(la que tiene «motor/»); si no está, se busca al lado de este archivo.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import numpy as _np
except ImportError:          # NumPy es opcional: sin él, listas de Python
    _np = None


# ─────────────────────────────────────────────── dónde está Ñ
def raiz() -> Path:
    """La carpeta del proyecto Ñ: N_RAIZ, o la que contiene a este archivo (c1en/..)."""
    r = os.environ.get("N_RAIZ")
    if r:
        return Path(r)
    aqui = Path(__file__).resolve().parent
    for cand in (aqui.parent, aqui, Path.cwd()):
        if (cand / "motor" / "bundle-c1en.js").exists():
            return cand
    raise FileNotFoundError(
        "no encuentro el proyecto Ñ (motor/bundle-c1en.js). "
        "Pon N_RAIZ=/ruta/al/proyecto o copia c1en.py dentro de su carpeta c1en/")


def _node() -> str:
    return os.environ.get("N_NODE", "node")


# ─────────────────────────────────────────────── 1. correr un programa
def correr(programa: str, *args: str, perfil: str = "c1en", limite: int | None = None,
           dispositivo: str | None = None, gpu: int | None = None) -> str:
    """Ejecuta un programa de Ñ (texto, o ruta a un .esl) y devuelve lo que imprimió.

    perfil: "c1en" (numerico y nen abiertos, sin «usar») o "n" (el Ñ normal).
    dispositivo: "jit" | "nativo" | "gpu" para forzar uno; gpu: índice de la GPU.
    Si el programa falla, lanza ErrorN con el mensaje de Ñ tal cual.
    """
    r = raiz()
    es_archivo = programa.strip().endswith(".esl") and "\n" not in programa and Path(programa).exists()
    tmp = None
    if not es_archivo:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".esl", delete=False, encoding="utf-8")
        tmp.write(programa)
        tmp.close()
        ruta = tmp.name
    else:
        ruta = str(Path(programa).resolve())
    orden = [_node(), str(r / "motor" / "util" / "n-node.js")]
    if perfil == "c1en":
        orden.append("--c1en")
    if limite is not None:
        orden.append(f"--limite={limite}")
    orden.append(ruta)
    orden.extend(args)
    env = dict(os.environ)
    if dispositivo:
        env["C1EN_DISPOSITIVO"] = dispositivo
    if gpu is not None:
        env["C1EN_GPU"] = str(gpu)
    try:
        p = subprocess.run(orden, capture_output=True, text=True, encoding="utf-8", env=env, cwd=str(r))
    finally:
        if tmp:
            os.unlink(tmp.name)
    if p.returncode != 0:
        raise ErrorN((p.stdout + p.stderr).strip())
    return p.stdout.rstrip("\n")


class ErrorN(Exception):
    """Un error del programa de Ñ, con el texto que Ñ imprime (tipo, línea, pista)."""


# ─────────────────────────────────────────────── 2. una función de Ñ desde Python
# El puente: un programa de Ñ envuelve a la función del usuario. Lee los
# argumentos de un archivo (JSON para escalares, binario para arreglos), llama a
# la función —con «paralelo» si se pidió— y escribe de vuelta los arreglos que
# pudieron cambiar y el valor devuelto. Ñ no tiene punteros ni memoria
# compartida con Python: los arreglos van y vuelven por archivo, lo que para
# millones de elementos tarda milisegundos y para un núcleo de GPU es despreciable
# frente a lo que se ahorra.
_PUENTE = r'''
# ── puente c1en.py → Ñ (generado) ──
__USUARIO__

fijo __carpeta = argumentos()[0]
fijo __meta = deJson(leerTexto(__carpeta + "/meta.json"))
var __args: lista<cualquiera> = []
para __k en rango(longitud(__meta["args"])) {
  fijo __d = __meta["args"][__k]
  si __d["clase"] == "arreglo" {
    agregar(__args, leerArregloBinario(__carpeta + "/a" + texto(__k) + ".bin", __d["tipo"], __d["forma"]))
  } sino {
    agregar(__args, __d["valor"])
  }
}
var __res: cualquiera = nulo
si __meta["paralelo"] {
  __PARALELO__
} sino {
  __LLAMADA__
}
# de vuelta: los arreglos (pueden haber cambiado) y el resultado
para __k en rango(longitud(__args)) {
  fijo __d = __meta["args"][__k]
  si __d["clase"] == "arreglo" { escribirArregloBinario(__carpeta + "/r" + texto(__k) + ".bin", __args[__k]) }
}
var __salida: dic<texto, cualquiera> = {"dispositivo": dispositivo()}
si tipo(__res) == "arreglo" {
  escribirArregloBinario(__carpeta + "/res.bin", __res)
  __salida["res"] = {"clase": "arreglo", "tipo": tipoArreglo(__res), "forma": forma(__res)}
} sino {
  __salida["res"] = {"clase": "valor", "valor": __res}
}
escribirTexto(__carpeta + "/salida.json", aJson(__salida))
'''


def _args_n(n: int) -> str:
    return ", ".join(f"__args[{k}]" for k in range(n))


class Funcion:
    """Una función de Ñ llamable desde Python. Créala con «funcion(...)»."""

    def __init__(self, fuente: str, nombre: str | None, paralelo: bool, perfil: str,
                 dispositivo: str | None, gpu: int | None):
        self.fuente = fuente
        self.nombre = nombre or _nombre_de(fuente)
        self.paralelo = paralelo
        self.perfil, self.dispositivo, self.gpu = perfil, dispositivo, gpu
        self.ultimo_dispositivo: str | None = None

    def __call__(self, *args):
        meta_args, n_arr = [], 0
        carpeta = Path(tempfile.mkdtemp(prefix="c1en-"))
        try:
            for k, a in enumerate(args):
                if _np is not None and isinstance(a, _np.ndarray):
                    tipo = "entero" if a.dtype.kind in "iub" else "real"
                    datos = _np.ascontiguousarray(a, dtype=_np.int32 if tipo == "entero" else _np.float64)
                    datos.tofile(carpeta / f"a{k}.bin")
                    meta_args.append({"clase": "arreglo", "tipo": tipo, "forma": list(a.shape)})
                    n_arr += 1
                elif isinstance(a, (list, tuple)):
                    meta_args.append({"clase": "valor", "valor": list(a)})
                elif isinstance(a, bool) or a is None or isinstance(a, (int, float, str)):
                    meta_args.append({"clase": "valor", "valor": a})
                else:
                    raise TypeError(f"no sé pasar a Ñ un {type(a).__name__}: números, textos, listas o arreglos de NumPy")
            n = len(args)
            if self.paralelo:
                # paralelo(n, f, resto…): el primer argumento es el número de hilos
                llamada_par = f"paralelo(__args[0], {self.nombre}{', ' + _args_n(n)[len('__args[0], '):] if n > 1 else ''})"
                llamada = f"__res = {self.nombre}({_args_n(n)})"
            else:
                llamada_par = "nulo"
                llamada = f"__res = {self.nombre}({_args_n(n)})"
            prog = (_PUENTE.replace("__USUARIO__", self.fuente)
                    .replace("__PARALELO__", llamada_par)
                    .replace("__LLAMADA__", llamada))
            (carpeta / "meta.json").write_text(json.dumps({"args": meta_args, "paralelo": self.paralelo}), encoding="utf-8")
            correr(prog, str(carpeta), perfil=self.perfil, dispositivo=self.dispositivo, gpu=self.gpu)
            salida = json.loads((carpeta / "salida.json").read_text(encoding="utf-8"))
            self.ultimo_dispositivo = salida["dispositivo"]
            # los arreglos vuelven modificados EN EL SITIO, como en Ñ
            for k, a in enumerate(args):
                if _np is not None and isinstance(a, _np.ndarray):
                    r = carpeta / f"r{k}.bin"
                    if r.exists():
                        dt = _np.int32 if meta_args[k]["tipo"] == "entero" else _np.float64
                        a[...] = _np.fromfile(r, dtype=dt).reshape(a.shape).astype(a.dtype, copy=False)
            res = salida["res"]
            if res["clase"] == "arreglo":
                dt = _np.int32 if res["tipo"] == "entero" else _np.float64
                return _np.fromfile(carpeta / "res.bin", dtype=dt).reshape(res["forma"])
            return res["valor"]
        finally:
            for f in carpeta.iterdir():
                f.unlink()
            carpeta.rmdir()


def funcion(fuente: str, nombre: str | None = None, paralelo: bool = False, perfil: str = "c1en",
            dispositivo: str | None = None, gpu: int | None = None) -> Funcion:
    """Convierte una función de Ñ (su texto) en algo llamable desde Python.

    paralelo=True: se llama como paralelo(n, f, …): f(n, arreglo1, arreglo2, …), una
    vez por índice, en el mejor dispositivo (GPU → gcc → JIT). Los arreglos de NumPy
    se modifican en el sitio. Sin paralelo, se llama tal cual y devuelve el valor.
    """
    return Funcion(fuente, nombre, paralelo, perfil, dispositivo, gpu)


def _nombre_de(fuente: str) -> str:
    import re
    m = re.search(r"^\s*(?:fn|funcion|función|definir)\s+([A-Za-zÁ-ú_][\wÁ-ú]*)\s*\(", fuente, re.M)
    if not m:
        raise ValueError("no encuentro «fn nombre(» en el texto; pasa nombre=…")
    return m.group(1)


def dispositivos() -> list[str]:
    """Los dispositivos que C1EÑ ve en esta máquina."""
    return correr("para d en dispositivos() { imprimir(d) }").splitlines()


if __name__ == "__main__":
    # Prueba rápida: python c1en.py
    print("dispositivos:", dispositivos())
    print(correr('imprimir(derivarFormula("x^3 - 6x^2 + 11x - 6", "x"), " · ", integrar(funcion(x) { devolver x * x }, 0, 3))'))
    if _np is not None:
        tirar = funcion("fn tirar(i, dentro) {\n  fijo x = azarHilo(7, i, 0)\n  fijo y = azarHilo(7, i, 1)\n"
                        "  si x * x + y * y < 1.0 { sumarAtomico(dentro, 0, 1) }\n}", paralelo=True)
        dentro = _np.zeros(1, dtype=_np.int32)
        N = 2_000_000
        tirar(N, dentro)
        print(f"π ≈ {4 * dentro[0] / N} con {N} dardos en {tirar.ultimo_dispositivo}")
        suavizar = funcion("fn suavizar(i, a, b) {\n  si i > 0 y i < longitud(a) - 1 { b[i] = (a[i - 1] + a[i] + a[i + 1]) / 3.0 } sino { b[i] = a[i] }\n}", paralelo=True)
        a = _np.arange(10, dtype=_np.float64) ** 2
        b = _np.zeros_like(a)
        suavizar(len(a), a, b)
        print("suavizado:", b)
