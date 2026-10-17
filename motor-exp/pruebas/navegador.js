// Abrir el Chromium de las pruebas, con las dos formas de no tenerlo.
//
// playwright es dependencia de desarrollo y opcional a propósito: pesa cientos
// de megas. Pero «no tenerlo» tiene DOS estados distintos, y las suites solo
// manejaban uno:
//
//   1. el paquete no está            → require('playwright') lanza
//   2. el paquete está, el navegador no → require funciona y revienta el launch
//
// El segundo es el normal recién clonado: «npm install» trae playwright, y hay
// que correr además «npx playwright install» para que baje el Chromium. Nadie lo
// sabe la primera vez. Y lo que veía era un volcado de pila de veinte líneas y
// «11 de 14 suites en verde», o sea: parecía que el motor estaba roto.
//
// Las dos cosas son lo mismo —no hay con qué probar el IDE— y ninguna es un
// fallo del lenguaje. Así que las dos se saltan y se dice qué hacer, igual que
// «fuera» cuando no encuentra QuickJS y «nativo» cuando no encuentra koffi.
'use strict';

function saltar(porque, resumen) {
  console.log('  · suite saltada: ' + porque);
  console.log('\n' + resumen + ' · saltada entera\n');
  process.exit(0);
}

// «resumen» es la última línea que la suite imprimiría, porque pruebas/todas.js
// lee justo esa para resumir. Cada suite cuenta lo suyo con palabras distintas.
module.exports = async function abrirNavegador(resumen) {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (_) { saltar('playwright no está instalado · «npm install»', resumen); }

  // Si ya hay un Chromium o un Chrome en la máquina, se puede usar ese y no
  // bajar otros 300 MB: N_CHROMIUM=/ruta/al/chrome. También resuelve el caso
  // molesto de que playwright pida una compilación distinta de la que hay
  // instalada —pide la 1243 y existe la 1194— que es un error de versiones
  // disfrazado de «no está».
  const propio = process.env.N_CHROMIUM;
  const opciones = propio ? { executablePath: propio } : {};

  try {
    return await chromium.launch(opciones);
  } catch (e) {
    const m = String((e && e.message) || e);
    // Solo este fallo se perdona, y por el mensaje exacto. Un launch que falla
    // por cualquier otra razón —un Chromium corrupto, permisos, falta de
    // memoria— SÍ es un fallo, y perdonarlo escondería un problema real.
    if (/Executable doesn't exist|playwright install/i.test(m))
      saltar(propio
        ? `N_CHROMIUM apunta a «${propio}» y ahí no hay un navegador`
        : 'playwright está, pero su navegador no · «npx playwright install»' +
          ' (o N_CHROMIUM=/ruta/a/chrome para usar uno que ya tengas)', resumen);
    throw e;
  }
};
