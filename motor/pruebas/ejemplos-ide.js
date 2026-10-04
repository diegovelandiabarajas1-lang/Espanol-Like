// Los diez ejemplos del selector, cada uno ejecutado a través del puente.
// Lo mismo que en aislado.js: sin playwright esto no se puede probar, pero no
// es un fallo del lenguaje. Se salta y se dice por qué.
const abrirNavegador = require('./navegador.js');
(async () => {
  const nav = await abrirNavegador('0 de 0 ejemplos corren en la zona aislada');
  const pag = await nav.newPage();
  const fallos = [];
  pag.on('pageerror', e => { if (!/cross-origin|Blocked a frame/i.test(e.message)) fallos.push(e.message); });
  await pag.goto('file://' + require('../rutas.js').entrega('espanol-like-v4.html'));
  await pag.waitForFunction(() => document.querySelector('#estado').textContent.includes('terminó'), null, { timeout: 25000 });
  const nombres = await pag.$$eval('#selEj option', os => os.map(o => o.value));
  let mal = 0;
  for (const n of nombres) {
    await pag.selectOption('#selEj', n);
    await pag.evaluate(() => document.querySelector('#estado').innerHTML = '');
    await pag.click('#bRun');
    await pag.waitForFunction(() => !document.querySelector('#bRun').disabled &&
      document.querySelector('#estado').textContent.trim() !== '', null, { timeout: 30000 });
    const est = (await pag.textContent('#estado')).replace(/\s+/g, ' ').trim();
    const zona = pag.frames().find(f => f !== pag.mainFrame());
    const sal = await zona.$eval('#consola', x => x.innerText).catch(() => '');
    // «Errores antes de ejecutar» existe para fallar: es el ejemplo que muestra
    // el verificador de tipos atajando el programa antes de correrlo.
    const debeFallar = /Errores antes/.test(n);
    const bien = debeFallar ? est.includes('falló') : est.includes('terminó');
    if (!bien) mal++;
    console.log(`  ${bien ? '✓' : '✗'} ${n.padEnd(26)}${debeFallar ? '(debe fallar) ' : ''}${est}`);
    if (!bien) console.log('      ' + sal.split('\n').slice(0, 3).join(' | '));
  }
  if (fallos.length) { console.log('\n  errores sueltos:', fallos); mal += fallos.length; }
  await nav.close();
  console.log(`\n${nombres.length - mal} de ${nombres.length} ejemplos corren en la zona aislada\n`);
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
