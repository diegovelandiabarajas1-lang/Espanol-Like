// motor-exp · N4.1 «Cero runtime»: cada programa en la VM y como ejecutable
// nativo, y lo que imprimen tiene que ser IGUAL, letra por letra (y el código
// de salida también, errores incluidos).
//
//   node motor-exp/pruebas/exp-aot.js            todos
//   node motor-exp/pruebas/exp-aot.js --ver      además, lo que no compila y por qué
//   node motor-exp/pruebas/exp-aot.js --rapida   solo los de aot/pruebas (la que corre todas.js)
//
// Los programas: los de aot/pruebas/*.esl (escritos para esto: lo que cubre
// cada parte del lenguaje, errores incluidos) y los ejemplos de la referencia
// (util/ejemplos-biblioteca.js). Un programa que usa algo que el ejecutable
// todavía no trae («usar», generadores…) no cuenta como fallo: se dice cuántos
// son y por qué, para saber qué falta.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const VER = process.argv.includes('--ver');
const RAPIDA = process.argv.includes('--rapida');
const RAIZ = path.join(__dirname, '..');
const N_NODE = path.join(RAIZ, 'util', 'n-node.js'), N_COMP = path.join(RAIZ, 'util', 'n-compilar.js');

const hay = c => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0;
if (!hay('gcc') && !hay('clang') && !process.env.C1EN_CC) { console.log('  (sin compilador de C)'); console.log('exp-aot: saltada entera'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-'));
const programas = [];
const dirP = path.join(RAIZ, 'aot', 'pruebas');
if (fs.existsSync(dirP)) for (const f of fs.readdirSync(dirP).sort()) if (f.endsWith('.esl')) programas.push([f, fs.readFileSync(path.join(dirP, f), 'utf8'), path.join(dirP, f)]);
const ejemplos = require(path.join(RAIZ, 'util', 'ejemplos-biblioteca.js'));
if (!RAPIDA) for (const [k, src] of Object.entries(ejemplos)) if (typeof src === 'string') programas.push(['ref:' + k, src]);

let iguales = 0, distintos = 0, noSoportados = 0, fallanC = 0;
const motivos = new Map(), fallos = [];
programas.forEach(([nombre, src, original], i) => {
  // los de aot/pruebas se corren en su sitio (sus «usar» de archivos son relativos)
  const f = original || path.join(tmp, `p${i}.esl`), exe = path.join(tmp, `p${i}` + (process.platform === 'win32' ? '.exe' : ''));
  if (!original) fs.writeFileSync(f, src);
  const cwd = original ? path.dirname(original) : tmp;
  const vm = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', timeout: 60000, cwd });
  const c = spawnSync(process.execPath, [N_COMP, f, '-o', exe], { encoding: 'utf8', timeout: 120000 });
  if (c.status !== 0) {
    const m = (c.stdout || c.stderr || '').trim();
    if (/^\[ejecutable\] todavía no|^\[ejecutable\] los generadores/.test(m)) {
      noSoportados++;
      for (const x of m.replace(/^\[ejecutable\] /, '').split(/, | · /)) { const k = x.replace(/^todavía no están en el ejecutable nativo: /, ''); motivos.set(k, (motivos.get(k) || 0) + 1); }
      return;
    }
    if (vm.status !== 0 && /^\[(sintaxis|tipos|módulos)\]/.test(m)) {   // el programa ya no compilaba para la VM: igual
      if ((vm.stdout || '').trim() === m) { iguales++; return; }
    }
    fallanC++; fallos.push(`✗ ${nombre}: no compiló\n    ${m.split('\n').slice(0, 6).join('\n    ')}`);
    return;
  }
  const n = spawnSync(exe, [], { encoding: 'utf8', timeout: 60000, cwd });
  const a = (vm.stdout || ''), b = (n.stdout || '');
  if (a === b && vm.status === n.status) { iguales++; return; }
  distintos++;
  const la = a.split('\n'), lb = b.split('\n');
  let j = 0; while (j < la.length && la[j] === lb[j]) j++;
  fallos.push(`✗ ${nombre}: distinto (código ${vm.status} en la VM, ${n.status} nativo), desde la línea ${j + 1}\n    VM:     ${JSON.stringify(la.slice(j, j + 3).join('⏎'))}\n    nativo: ${JSON.stringify(lb.slice(j, j + 3).join('⏎'))}`);
});
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }

for (const x of fallos) console.log(x);
if (VER || noSoportados) {
  const lista = [...motivos].sort((p, q) => q[1] - p[1]);
  console.log(`\n  sin soporte todavía (${noSoportados} programas): ` + lista.slice(0, VER ? 200 : 12).map(([k, v]) => `${k} ×${v}`).join(' · '));
}
const total = iguales + distintos + fallanC;
console.log(`\n  ${iguales} iguales a la VM · ${distintos} distintos · ${fallanC} no compilan · ${noSoportados} sin soporte todavía (de ${programas.length})\n`);
process.exit(distintos || fallanC ? 1 : 0);
