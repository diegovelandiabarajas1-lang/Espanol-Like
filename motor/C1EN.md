# La rama `c1en`: el motor de C1EÑ, solo

Esta rama tiene **una sola carpeta, `motor/`**, y nada más (más `LICENSE`, `NOTICE` y los
dos archivos de git). Es el motor de **C1EÑ** («Cuda 1 Engine of Ñ»: Ñ en GPU, con NEÑ, su
BLAS y su FFT propios), y es su **versión estable**, al estilo de lo que `motor/` en `main` es
para Ñ.

Lo decidió Diego el 21-oct-2026:

- La **experimentación** de C1EÑ (hilos, varias GPU, plantillas, `sinComprobar`…) se hace en
  **`motor-exp/`, en la rama `motor-exp`**. No aquí.
- Esta carpeta es una **copia de `motor-exp/`** que se renueva **solo cuando Diego lo dice**:
  se trae `motor-exp/` de la rama `motor-exp`, se renombra `motor/`, se cambian las rutas de
  ejecución `motor-exp/` → `motor/` (las etiquetas «(motor-exp N4.x)» de los comentarios se
  dejan: cuentan en qué fase nació cada cosa), la versión pasa a `4.1-c1en` en
  `util/construir.js` y se reconstruyen `bundle.js`, `bundle-c1en.js` y `n-web.js` con
  `node motor/util/construir.js`.
- **Ni `motor/` de `main` (la LTS de Ñ) ni `motor-exp/` se tocan desde aquí.**

## De dónde viene esta copia

De `motor-exp/` en el commit `c9eb46a` de la rama `motor-exp` (21-oct-2026): la 4.1 más
N4.1–N4.11 y P6, es decir, cero runtime, real32/real16, colas de GPU, `paraleloBloques`,
tipos de máquina, Ñ como biblioteca de C, hilos, varias GPU, plantillas en los núcleos,
`cabeceraNativa` y `sinComprobar`, y `n-web.js` para `<script type="text/ñ">`. La bitácora
fase por fase es `EXPERIMENTAL.md`, que viene con la copia.

## Qué cambia por estar sola

`rutas.js` resuelve todo desde `__dirname`, así que el motor funciona igual. Pero lo que el
motor **lee de fuera** —`ejemplos/`, `PSeInt/`, `hub/`, la DLL de raylib— en esta rama no
existe. Por eso, de `pruebas/todas.js`, las suites que necesitan eso (`apps`, `ejemplos`,
`pseudocódigo`, parte de `módulos` y `fuera`) se saltan o fallan **aquí y solo aquí**; no es un
fallo del motor. Las que importan a C1EÑ (`motor`, `C1EÑ`, `núcleos NEÑ`, `perfil C1EÑ`, las
`exp-*` de GPU, precisión, hilos, plantillas) corren completas.

`koffi` (FFI, C1EÑ nativo) y `playwright` (las pruebas con Chromium) se instalan desde el
`package.json` de `main`; en esta rama no hay `package.json`, así que en un clon nuevo hay que
instalarlos a mano (`npm i koffi playwright`) o compartir el `node_modules/` de `main`.

## Cómo usarlo

```
node motor/util/n-node.js programa.esl          # en la consola
node motor/util/n-compilar.js programa.esl      # ejecutable nativo sin runtime
node motor/util/construir-ide.js                # el IDE, a motor/salida/
node motor/pruebas/c1en.js                      # jit = nativo = gpu, al bit
```

Y en una página web, sin instalar nada (el repositorio tiene que ser público):

```html
<script src="https://cdn.jsdelivr.net/gh/diegovelandiabarajas1-lang/Espanol-Like@c1en/motor/n-web.js"></script>
```
