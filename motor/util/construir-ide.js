// Ensamblado en dos capas:
//   bundle.js  →  hijo.html   (el motor entra en la zona aislada)
//   hijo.html  →  padre.html  (la zona, en base64, entra en el anfitrión)
// El base64 no es decoración: el documento hijo lleva </script> dentro de sus
// propias cadenas y acentos por todas partes, y así ni el analizador de HTML
// del padre ni la codificación pueden romperlo.
const fs = require('fs');
const R = require('../rutas.js');

const bundle = fs.readFileSync(R.bundle, 'utf8');
const anfitrion = fs.readFileSync(R.ide('anfitrion.js'), 'utf8');
// La plantilla de las aplicaciones exportadas viaja dentro del hijo, en base64.
// No lleva el motor: el hijo ya lo tiene y lo lee de su propio <script> al
// exportar, así que no hay una segunda copia de 170 KB dando vueltas.
const plantilla = fs.readFileSync(R.ide('app.html'), 'utf8');
// Un cierre de script de más dentro de la plantilla corta el documento por la
// mitad sin que el navegador se queje: el resto pasa a ser texto y el programa
// no corre. Pasó de verdad, escrito dentro de un comentario, así que se cuenta.
{
  const abre = (plantilla.match(/<script\b/g) || []).length;
  const cierra = (plantilla.match(/<\/script/g) || []).length;
  if (abre !== cierra) throw new Error(`app.html: ${abre} <script pero ${cierra} cierres — algún texto lleva un cierre dentro`);
}

let hijo = fs.readFileSync(R.ide('hijo.html'), 'utf8');
for (const m of ['/*__MOTOR__*/', '/*__ANFITRION__*/', '/*__PLANTILLA_APP__*/'])
  if (!hijo.includes(m)) throw new Error('falta el marcador ' + m + ' en hijo.html');
for (const [n, t] of [['bundle', bundle], ['anfitrion', anfitrion]])
  if (t.includes('</script')) throw new Error('el ' + n + ' contiene </script — rompería el hijo');
hijo = hijo.replace('/*__MOTOR__*/', () => bundle);
hijo = hijo.replace('/*__ANFITRION__*/', () => anfitrion);
hijo = hijo.replace('/*__PLANTILLA_APP__*/', () => Buffer.from(plantilla, 'utf8').toString('base64'));

const b64 = Buffer.from(hijo, 'utf8').toString('base64');
if (/[^A-Za-z0-9+/=]/.test(b64)) throw new Error('base64 con caracteres inesperados');

let padre = fs.readFileSync(R.ide('padre.html'), 'utf8');
if (!padre.includes('/*__HIJO__*/')) throw new Error('falta el marcador __HIJO__ en padre.html');
padre = padre.replace('/*__HIJO__*/', () => b64);

// Dos salidas del mismo documento.
//   · la de disco lleva su propio <!doctype> y, sobre todo, su <meta charset>:
//     sin él, un archivo local queda a merced de lo que adivine el navegador,
//     y los acentos salen rotos en cuanto cambia el tamaño del contenido.
//   · la de publicar va sin esqueleto, porque claude.ai se lo pone encima.
fs.writeFileSync(R.motor + '/publicar-ide.html', padre);
fs.writeFileSync(R.entrega('espanol-like-v4.html'), envolver(padre, 'Español-Like'));

function envolver(cuerpo, titulo) {
  const corte = cuerpo.indexOf('</style>') + '</style>'.length;
  return '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    cuerpo.slice(0, corte) + '\n</head>\n<body>' + cuerpo.slice(corte) + '\n</body>\n</html>\n';
}
console.log(
  'app   ', (plantilla.length / 1024).toFixed(1).padStart(4), 'KB  la plantilla de las aplicaciones\n' +
  'hijo  ', (hijo.length / 1024).toFixed(0).padStart(4), 'KB  →  base64', (b64.length / 1024).toFixed(0), 'KB\n' +
  'salida', (padre.length / 1024).toFixed(0).padStart(4), 'KB  espanol-like-v4.html'
);
