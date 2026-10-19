// Monta un motor de Ñ con su anfitrión de página dentro de una pestaña de
// Chromium, sin IDE alrededor: una página con #pagina, #cajaLienzo y #consola,
// el bundle y el anfitrión de la carpeta que se pida (la del motor, o la de un
// clon experimental, para compararlos en las mismas condiciones).
const fs = require('fs');
const path = require('path');

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="pagina" style="height:600px;overflow:auto"></div><div id="cajaLienzo"></div><div id="consola"></div></body></html>`;

async function montar(page, dirMotor) {
  await page.setContent(HTML);
  await page.addScriptTag({ content: fs.readFileSync(path.join(dirMotor, 'bundle.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(dirMotor, 'ide', 'anfitrion.js'), 'utf8') });
  await page.evaluate(() => {
    const salida = [];
    const anf = crearAnfitrion({ linea: (t) => salida.push(t) });
    window.__n = { anf, salida, motor: null };
  });
}

// Corre un programa (el principal) y deja el motor a mano para los turnos.
async function correr(page, src) {
  return page.evaluate(async (src) => {
    const { anf } = window.__n;
    anf.limpiarTodo();
    const motor = globalThis.EspanolLike.crearMotor({
      salida: s => window.__n.salida.push(String(s)), limiteInstr: 5e8,
      host: { web: anf.web, grafico: anf.grafico, tiempo: anf.tiempo, red: anf.red },
    });
    window.__n.motor = motor;
    const r = motor.ejecutar(src);
    if (anf.volcar) anf.volcar();
    await Promise.resolve();
    return { ok: r.ok, errores: (r.errores || []).map(e => e.formato ? e.formato() : String(e.message || e)) };
  }, src);
}

// Llama a una función del programa como lo haría un evento: un turno.
async function turno(page, nombre, args) {
  return page.evaluate(async ({ nombre, args }) => {
    const { anf, motor } = window.__n;
    const fn = motor.vm.globals.get(nombre);
    anf.turno(motor.vm, fn, args || []);
    await Promise.resolve();
  }, { nombre, args });
}

module.exports = { montar, correr, turno };
