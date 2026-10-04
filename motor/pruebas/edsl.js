// ============================================================================
//  Los eDSL que vienen dentro del motor: el mecanismo y el primero de ellos.
//
//  Dos mitades, y la primera importa más que la segunda. Lo que se comprueba
//  del MECANISMO es que un eDSL nativo sea un módulo de verdad —que el
//  verificador tipe sus llamadas, que sus nombres no toquen el ámbito global,
//  que el alias funcione, que un nombre inexistente se vea al compilar— y que
//  no necesite disco, que es lo que le deja funcionar dentro del navegador.
//
//  De FORMATO se comprueba sobre todo lo que sería fácil dar por bueno sin
//  mirar: las apócopes de «enLetras», la «e» de «pan e higos», el plural de
//  «lápiz». Son la razón de que el eDSL exista, así que son las pruebas que de
//  verdad protegen algo.
// ============================================================================
require(require('../rutas.js').bundle);
const { crearMotor } = globalThis.EspanolLike;

let ok = 0, mal = 0;
const comprobar = (n, cond, extra) => {
  if (cond) { ok++; console.log('  ✓', n); }
  else { mal++; console.log('  ✗', n, extra !== undefined ? '\n      → ' + String(extra).slice(0, 400) : ''); }
};

// Motor pelado, como el de la zona aislada: ni archivos ni cargador de módulos.
// Que las pruebas de formato corran aquí ya demuestra que no necesita anfitrión.
function corre(src) {
  const out = [];
  const m = crearMotor({ salida: s => out.push(s), limiteInstr: 2e8 });
  const r = m.ejecutar(src);
  return { r, texto: out.join('\n'), errores: r.errores || [], avisos: r.avisos || [] };
}
const msgs = c => c.errores.map(e => e.msg || e.message).join(' | ');

// Comprueba una expresión de formato: importa el nombre y lo imprime.
function vale(expr, esperado, nombres) {
  const ns = nombres || expr.match(/^[a-zA-ZñÑ]+/)[0];
  const c = corre(`usar ${ns} de "formato"\nimprimir(${expr})`);
  if (!c.r.ok) { comprobar(expr, false, msgs(c)); return; }
  comprobar(`${expr} → ${JSON.stringify(esperado)}`, c.texto === esperado, JSON.stringify(c.texto));
}

console.log('\n── el mecanismo');

{
  const c = corre('usar moneda de "formato"\nimprimir(moneda(4500))');
  comprobar('se resuelve sin disco y sin anfitrión', c.r.ok && c.texto === '$ 4.500', msgs(c) || c.texto);
}
{
  const c = corre('imprimir(moneda(5))');
  comprobar('sus nombres NO están en el ámbito global sin «usar»',
    !c.r.ok && /«moneda» no está definida/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar "formato" como f\nimprimir(f.romano(2026))');
  comprobar('el alias funciona igual que con un archivo', c.r.ok && c.texto === 'MMXXVI', msgs(c) || c.texto);
}
{
  const c = corre('usar "formato" como f\nimprimir(f.noExiste(1))');
  comprobar('un miembro que no exporta se ve al compilar',
    !c.r.ok && /no exporta «noExiste»/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar noExiste de "formato"\nimprimir(1)');
  comprobar('un nombre que no exporta se ve al compilar',
    !c.r.ok && /no exporta «noExiste»/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar algo de "noSoyUnEdsl"');
  comprobar('un especificador que no es eDSL ni archivo se queja del anfitrión',
    !c.r.ok && /necesita un anfitrión con módulos/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar moneda de "formato"\nvar x: entero = moneda(5)');
  comprobar('el verificador conoce el tipo que DEVUELVE',
    !c.r.ok && /se declaró como entero pero recibe texto/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar enLetras de "formato"\nimprimir(enLetras("hola"))');
  comprobar('el verificador conoce los tipos que RECIBE',
    !c.r.ok && /se esperaba entero y llegó texto/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar romano de "formato"\nimprimir(romano(1, 2))');
  comprobar('la aridad sale de la firma, sin declararla aparte',
    !c.r.ok && /romano/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar moneda de "formato"\nusar romano de "formato"\nimprimir(moneda(1) + romano(1))');
  comprobar('dos «usar» del mismo eDSL no se estorban', c.r.ok && c.texto === '$ 1I', msgs(c) || c.texto);
}
{
  // La clave de un eDSL («ñ:formato») es la misma en toda máquina, mientras que
  // la de un archivo es una ruta absoluta de ESTA. De ahí una asimetría que
  // conviene fijar: un programa que solo importa eDSL sí cabe en un .elb, y
  // tiene que correr en un motor nuevo que solo recibe los bytes.
  const a = crearMotor({ salida: () => {} });
  const s = a.serializar('usar moneda, enLetras de "formato"\nimprimir(moneda(1234567))\nimprimir(enLetras(21000))');
  comprobar('un programa que solo importa eDSL se guarda como .elb', s.ok,
    (s.errores || []).map(e => e.msg || e.message).join(' | '));
  if (s.ok) {
    const out = [];
    const r = crearMotor({ salida: t => out.push(t) }).ejecutarBytecode(s.bytes);
    comprobar('y corre desde los bytes en un motor nuevo',
      r.ok && out.join('|') === '$ 1.234.567|veintiún mil',
      r.ok ? out.join('|') : (r.errores || []).map(e => e.msg || e.message).join(' | '));
  }
}
{
  // Y lo contrario: un archivo no cabe, y el mensaje tiene que decir por qué
  // sin dar a entender que «usar» en general lo impide.
  const m = crearMotor({ salida: () => {},
    host: { modulos: { resolver: () => '/tmp/x.esl', leer: () => 'publico fn f(): entero { devolver 1 }' } } });
  const s = m.serializar('usar f de "./x.esl"\nimprimir(f())', '/tmp/p.esl');
  const txt = (s.errores || []).map(e => e.msg || e.message).join(' ');
  comprobar('un programa que importa archivos sigue sin poder guardarse',
    !s.ok && /importa archivos/.test(txt), txt);
}
{
  // Invariante, no número mágico: cada cosa que un eDSL exporta es un global
  // con la clave delante, y no hay ninguno de más. Así la prueba sigue valiendo
  // cuando se añada el eDSL número cuatro.
  const vm = crearMotor({ salida: () => {} }).vm;
  let conClave = 0;
  for (const k of vm.globals.keys()) if (k.indexOf('\u0000') >= 0) conClave++;
  // «clasico» no define nada: reexporta, así que sus nombres no son globales
  // propios y no se cuentan dos veces.
  let propios = 0, reexporta = 0;
  for (const r of vm.edsls.values()) { if (r.globalDe) reexporta++; else propios += r.exporta.size; }
  comprobar(`los ${conClave} nombres con clave delante son lo que definen los ${vm.edsls.size - reexporta} eDSL propios`,
    conClave === propios && conClave > 0, `${conClave} globales contra ${propios} definidos`);
  // Y ninguno de ellos se puede escribir: el léxico no acepta el byte cero.
  const c = corre('imprimir(1)');
  comprobar('un programa no puede nombrar uno de esos globales', c.r.ok, msgs(c));
}
{
  // Invariante y no número mágico: ni un solo nombre que exporte un eDSL puede
  // estar además en el ámbito global. Es lo que hace que mudar uno signifique
  // algo — si se quedara en los dos sitios, el «usar» no haría falta nunca.
  const vm = crearMotor({ salida: () => {} }).vm;
  const tipos = vm.tiposGlobales();
  // Las excepciones se declaran aquí, con su razón. Si un nombre aparece en los
  // dos sitios sin estar en esta lista, es que se mudó a medias.
  const APOSTA = {
    // La «ahora» global da milisegundos; la de «fecha» devuelve una fecha. Se
    // solapan a propósito: «usar ahora de "fecha"» tapa la global y el
    // enlazador lo avisa. Queda pendiente decidir si la global desaparece —para
    // medir tiempos ya está «reloj()»— o si la de fecha se llama de otra forma.
    ahora: 'fecha',
    // «color» en «estilo» lee un token del tema; el «color» global es el del
    // pincel del lienzo, que pertenece a «dibujo» y todavía no se ha mudado. Son
    // dos cosas con un nombre, y por eso hay que borrar esta línea el día que
    // «dibujo» salga: cada «color» vivirá en su eDSL y la prueba de abajo
    // —«las excepciones declaradas siguen existiendo»— falla ese día, que es
    // justo cuando hay que decidirlo.
    color: 'estilo',
    // «pares» es el caso contrario, y es el que enseña para qué sirve esta
    // lista. El «pares» de los estilos —&:nth-child(even)— se definía DESPUÉS
    // del de los diccionarios y lo sobrescribía: pares({…}) devolvía un estilo
    // vacío y no se quejaba de nada. Al mudarse los estilos, el de los
    // diccionarios volvió a existir, así que este ya NO se reexporta en
    // «clasico»: quien lo usara para estilos necesita «usar pares de "estilo"».
    pares: 'estilo',
  };
  const dobles = [];
  for (const [n, r] of vm.edsls) { if (r.globalDe) continue;
    for (const k of r.exporta.keys())
      if (Object.prototype.hasOwnProperty.call(tipos, k) && APOSTA[k] !== n) dobles.push(`${k} (${n})`); }
  comprobar(`ningún nombre de un eDSL está también en el ámbito global, salvo las ${Object.keys(APOSTA).length} excepciones declaradas (${Object.keys(tipos).length} globales)`,
    dobles.length === 0, dobles.join(', '));
  // Y la excepción tiene que seguir siendo real: si alguien borra la «ahora»
  // global, esta lista tiene que encogerse con ella y no quedarse mintiendo.
  const muertas = Object.entries(APOSTA).filter(([k, n]) => {
    const r = vm.edsls.get(n);
    return !r || !r.exporta.has(k) || !Object.prototype.hasOwnProperty.call(tipos, k);
  });
  comprobar('las excepciones declaradas siguen existiendo', muertas.length === 0,
    muertas.map(([k]) => k).join(', '));
}
{
  // Toda nativa, global o de eDSL, tiene firma: es lo que hace imposible el
  // fallo silencioso de declarar el cuerpo y olvidar el tipo.
  const vm = crearMotor({ salida: () => {} }).vm;
  const sin = [];
  for (const [k, v] of vm.globals) if (v && v.clase === 'nativa' && !v.firma) sin.push(k);
  comprobar('ninguna nativa se queda sin firma', sin.length === 0, sin.join(', '));
}
{
  const vm = crearMotor({ salida: () => {} }).vm;
  let error = null;
  try { vm.definirNativa('malita', 'real -> entreo', () => null, ''); }
  catch (e) { error = e.message; }
  comprobar('una firma mal escrita revienta al instalar, no al llamar',
    error && /no entiendo el tipo «entreo»/.test(error), error);
}

console.log('\n── las constantes del lenguaje: el sigilo |');

{
  // «|PI» no necesita «usar»; «redondear» sí, que es del eDSL numerico.
  const c = corre('usar redondear de "numerico"\nimprimir(redondear(|PI, 4), redondear(|E, 4), |INFINITO)');
  comprobar('están siempre, sin ningún «usar»',
    c.r.ok && c.texto === '3.1416 2.7183 infinito', msgs(c) || c.texto);
}
{
  // Y sin ningún «usar» en absoluto: una constante sola tiene que bastar.
  const c = corre('imprimir(|INFINITO, 1.0 / |INFINITO)');
  comprobar('un programa sin un solo «usar» las tiene', c.r.ok && c.texto === 'infinito 0',
    msgs(c) || c.texto);
}
{
  // Antes esto era el accidente: «E» a secas se tapaba en silencio y el número
  // de Euler pasaba a ser 5 para el resto del programa.
  const c = corre('usar redondear de "numerico"\nvar E: real = 5.0\nimprimir(E, redondear(|E, 3))');
  comprobar('lo tuyo y lo del lenguaje conviven sin estorbarse',
    c.r.ok && c.texto === '5 2.718', msgs(c) || c.texto);
}
for (const [q, src] of [
  ['una variable', 'var |E: real = 5.0'],
  ['una función', 'fn |f() { }'],
  ['un parámetro', 'fn g(|x: entero) { }'],
  ['el índice de un para', 'para |i en rango(3) { }'],
]) {
  const c = corre(src);
  comprobar(`no se puede declarar ${q} con «|»`,
    !c.r.ok && /es una constante del lenguaje y no se puede declarar/.test(msgs(c)), msgs(c));
}
{
  const c = corre('imprimir(|EULER)');
  const pista = (c.errores[0] || {}).pista || '';
  comprobar('una constante inventada dice las que hay',
    /\|E, \|INFINITO, \|PI/.test(pista), pista);
}
{
  const c = corre('imprimir(PI)');
  const pista = (c.errores[0] || {}).pista || '';
  comprobar('el nombre viejo lleva al nuevo', /«\|PI»/.test(pista), pista);
}
{
  // Esto lo cazó la suite de operadores y no mi comprobación de que «|»
  // estuviera libre: miré «|» y «| », no miré «||».
  const c = corre('imprimir(cierto || falso, cierto && falso)');
  comprobar('el «||» del «o» lógico sigue siendo el «o» lógico',
    c.r.ok && c.texto === 'cierto falso', msgs(c) || c.texto);
}
{
  const c = corre('imprimir(1 || |INFINITO)');
  comprobar('y convive con el sigilo en la misma línea', c.r.ok, msgs(c));
}
{
  const vm = crearMotor({ salida: () => {} }).vm;
  const tipos = vm.tiposGlobales();
  const conSigilo = Object.keys(tipos).filter(k => k.charAt(0) === '|');
  comprobar(`las ${conSigilo.length} constantes están en el ámbito y ninguna en un eDSL`,
    conSigilo.length === 3 && [...vm.edsls.values()].every(r => ![...r.exporta.keys()].some(k => k.charAt(0) === '|')),
    conSigilo.join(', '));
}

console.log('\n── el interruptor: usar "clasico"');

{
  const c = corre('usar "clasico"\nimprimir(mayusculas("hola"), recortar("  x  "))');
  comprobar('devuelve al ámbito los nombres que se mudaron', c.r.ok && c.texto === 'HOLA x', msgs(c) || c.texto);
}
{
  const c = corre('imprimir(mayusculas("hola"))');
  comprobar('sin él, un nombre mudado no está', !c.r.ok && /«mayusculas» no está definida/.test(msgs(c)), msgs(c));
}
{
  // Esto es lo que convierte la mudanza en una guía en vez de un muro.
  const c = corre('imprimir(mayusculas("hola"))');
  const pista = (c.errores[0] || {}).pista || '';
  comprobar('y el error dice la línea exacta que falta',
    /usar mayusculas de "texto"/.test(pista), pista);
}
{
  const c = corre('imprimir(mayuscolas("hola"))');
  const pista = (c.errores[0] || {}).pista || '';
  comprobar('un nombre mudado y mal escrito da las dos pistas',
    /querías decir «mayusculas»/.test(pista) && /texto/.test(pista), pista);
}
{
  const c = corre('usar "clasico"\nimprimir("hola")');
  comprobar('avisa cuando sobra del todo',
    c.r.ok && c.avisos.some(a => /aquí no hace nada/.test(a.msg || a.message)),
    c.avisos.map(a => a.msg || a.message).join(' | ') || '(ningún aviso)');
}
{
  const c = corre('usar "clasico"\nimprimir(mayusculas("a"), recortar(" b "))');
  const av = c.avisos.map(a => (a.msg || a.message) + ' ' + (a.pista || '')).join(' | ');
  comprobar('con dos nombres, propone el «usar» concreto',
    c.r.ok && /usar mayusculas, recortar de "texto"/.test(av), av || '(ningún aviso)');
}
{
  const c = corre('usar "clasico"\nimprimir(mayusculas("a"), recortar(" b "), subtexto("abc",0,2), unir(["x"],"-"))');
  comprobar('con cuatro se calla: un aviso que sale siempre se ignora',
    c.r.ok && !c.avisos.length, c.avisos.map(a => a.msg || a.message).join(' | '));
}
{
  const c = corre('usar mayusculas de "texto"\nimprimir(mayusculas("a"))');
  comprobar('el modo nuevo no avisa nunca', c.r.ok && !c.avisos.length,
    c.avisos.map(a => a.msg || a.message).join(' | '));
}
{
  const c = corre('usar "clasico"\nfn mayusculas(x: texto): texto { devolver "mío" }\nimprimir(mayusculas("a"))');
  comprobar('lo propio del archivo gana al interruptor', c.r.ok && c.texto === 'mío', msgs(c) || c.texto);
}
{
  const c = corre('usar "clasico" como c\nimprimir(c.mayusculas("hola"))');
  comprobar('y funciona detrás de un alias', c.r.ok && c.texto === 'HOLA', msgs(c) || c.texto);
}
{
  const c = corre('usar "formato" f');
  comprobar('un «como» olvidado se distingue de la forma a secas',
    !c.r.ok && /se esperaba «como»/.test(msgs(c)), msgs(c));
}
{
  // El modo es POR ARCHIVO, y eso es lo que hace que la mudanza no parta el
  // ecosistema en dos: una biblioteca vieja sirve en un programa nuevo.
  const vm = crearMotor({ salida: () => {} }).vm;
  const clasico = vm.edsls.get('clasico');
  comprobar('«clasico» reexporta y no define nada propio',
    !!clasico && !!clasico.globalDe && clasico.exporta.size === clasico.globalDe.size,
    clasico ? clasico.exporta.size + ' exporta / ' + (clasico.globalDe ? clasico.globalDe.size : 0) + ' apunta' : 'no existe');
  let mal = [];
  for (const [n, g] of clasico.globalDe) if (!vm.globals.has(g)) mal.push(n);
  comprobar('cada nombre que reexporta apunta a un global que existe', mal.length === 0, mal.join(', '));
}
{
  const vm = crearMotor({ salida: () => {} }).vm;
  // «clasico» devuelve SOLO los nombres que estuvieron en el ámbito global, no
  // todo lo que exportan esos eDSL. La diferencia la descubrió esta prueba: al
  // marcar por eDSL entero, «clasico» traía nombres nuevos y con ellos el
  // primer choque —«entre» existe en «texto» y en «numerico», y son distintas—.
  let esperado = 0;
  for (const r of vm.edsls.values()) if (r.enClasico) esperado += r.enClasico.length;
  comprobar(`«clasico» devuelve los ${esperado} nombres que fueron globales, ni uno más`,
    vm.edsls.get('clasico').exporta.size === esperado, vm.edsls.get('clasico').exporta.size);
}
{
  // Y lo que se escribió DESPUÉS de la mudanza no está ahí, porque ningún
  // programa viejo lo espera.
  const c = corre('usar "clasico"\nimprimir(sinAcentos("Martín"))');
  comprobar('lo nuevo de un eDSL mudado no entra en «clasico»',
    !c.r.ok && /«sinAcentos» no está definida/.test(msgs(c)), msgs(c));
}
{
  // Dos eDSL pueden llamar igual a cosas distintas: es lo que compraron los
  // namespaces. «entre» en «texto» saca lo que hay entre dos marcas; en
  // «numerico» dice si un número está en un intervalo.
  const a = corre('usar entre de "texto"\nimprimir(entre("a: X;", ": ", ";"))');
  const b = corre('usar entre de "numerico"\nimprimir(entre(5.0, 1.0, 10.0))');
  comprobar('el mismo nombre en dos eDSL, sin estorbarse',
    a.r.ok && a.texto === 'X' && b.r.ok && b.texto === 'cierto',
    msgs(a) + ' / ' + msgs(b));
  const c = corre('imprimir(entre(5.0, 1.0, 10.0))');
  const pista = (c.errores[0] || {}).pista || '';
  comprobar('y el error nombra los dos y deja elegir',
    /texto/.test(pista) && /numerico/.test(pista), pista);
}
{
  const vm = crearMotor({ salida: () => {} }).vm;
  comprobar('«clasico» no se propone nunca como pista: el índice lo deja fuera',
    ![...vm.indiceEdsl().values()].flat().includes('clasico'), 'aparece en el índice');
}

console.log('\n── formato: números');
vale('numero(1234.5)', '1.234,5');
vale('numero(1000000)', '1.000.000');
vale('decimales(3.14159, 2)', '3,14');
vale('moneda(1234567)', '$ 1.234.567');
vale('moneda(9.5, "€", 2)', '€ 9,50');
vale('porciento(0.156)', '15,6 %');
vale('porciento(0.5)', '50 %');
vale('porcientoCambio(80.0, 90.0)', '+12,5 %');
vale('porcientoCambio(100.0, 75.0)', '-25,0 %');   // decimal fijo: una columna de cambios se lee alineada
vale('signoMas(3)', '+3');
vale('signoMas(-3)', '-3');
vale('abreviar(1234567)', '1,2 M');
vale('abreviar(4500)', '4,5 mil');
vale('abreviar(999)', '999');
vale('ordinal(1)', '1.º');
vale('ordinal(3, cierto)', '3.ª');
vale('romano(2026)', 'MMXXVI');
vale('romano(4)', 'IV');
vale('intervalo(3, 7)', '3 – 7');

console.log('\n── formato: enLetras, que es donde se nota el español');
vale('enLetras(0)', 'cero');
vale('enLetras(16)', 'dieciséis');
vale('enLetras(21)', 'veintiuno');
vale('enLetras(31)', 'treinta y uno');
vale('enLetras(100)', 'cien');
vale('enLetras(101)', 'ciento uno');
vale('enLetras(500)', 'quinientos');
vale('enLetras(1000)', 'mil');
vale('enLetras(1250)', 'mil doscientos cincuenta');
vale('enLetras(21000)', 'veintiún mil');
vale('enLetras(31000)', 'treinta y un mil');
vale('enLetras(1000000)', 'un millón');
vale('enLetras(21000000)', 'veintiún millones');
vale('enLetras(1000000000)', 'mil millones');
vale('enLetras(-45)', 'menos cuarenta y cinco');

console.log('\n── formato: texto para personas');
vale('plural(1, "factura")', '1 factura');
vale('plural(2, "factura")', '2 facturas');
vale('plural(3, "lápiz")', '3 lápices');
vale('plural(0, "error")', '0 errores');
vale('listaLegible(["a", "b", "c"])', 'a, b y c');
vale('listaLegible(["pan", "higos"])', 'pan e higos');
vale('listaLegible(["solo"])', 'solo');
vale('mayusculaInicial("hola")', 'Hola');
vale('acortar("un texto bien largo", 10)', 'un texto…');
vale('elipsis("/muy/larga/ruta/archivo.txt", 14)', '/muy/la…vo.txt');
vale('alinearDer("7", 3)', '  7');
vale('alinearIzq("ab", 5)', 'ab   ');
vale('centrar("ab", 6)', '  ab  ');

console.log('\n── formato: magnitudes');
vale('tamanoLegible(1536000)', '1,5 MB');
vale('tamanoLegible(512)', '512 B');
vale('duracionLegible(7505000)', '2 h 5 min');
vale('duracionLegible(500)', '500 ms');
vale('tiempoReloj(7531000)', '2:05:31');
vale('tiempoRelativo(259200000.0)', 'hace 3 días');
vale('tiempoRelativo(-7200000.0)', 'en 2 horas');
vale('tiempoRelativo(1000.0)', 'hace un momento');

console.log('\n── formato: para la consola');
vale('regla(5)', '─────');
vale('barraTexto(7.0, 10.0, 10)', '███████░░░');
vale('minigrafico([1.0, 5.0, 3.0, 9.0, 2.0])', '▁▅▃█▂');
vale('sinColor(enRojo("mal"))', 'mal', 'sinColor, enRojo');
{
  const c = corre('usar enRojo de "formato"\nimprimir(longitud(enRojo("ab")))');
  comprobar('enRojo envuelve el texto en códigos ANSI', c.r.ok && c.texto === '11', msgs(c) || c.texto);
}
{
  const c = corre(`usar tablaTexto de "formato"
imprimir(tablaTexto([{"ciudad": "Girón", "ventas": 1200}, {"ciudad": "Bogotá", "ventas": 45}]))`);
  // «Girón» mide 5 y «ciudad» 6: la columna la fija el encabezado.
  const esp = 'ciudad  ventas\n──────  ──────\nGirón    1.200\nBogotá      45';
  comprobar('tablaTexto alinea los números a la derecha', c.r.ok && c.texto === esp, JSON.stringify(c.texto));
}
{
  const c = corre(`usar marco de "formato"\nimprimir(marco("hola", "aviso"))`);
  comprobar('marco dibuja la caja con título', c.r.ok && c.texto.split('\n').length === 3 && /^┌─ aviso/.test(c.texto),
    JSON.stringify(c.texto));
}

console.log('\n── formato: los ajustes son de este eDSL, no del motor');
{
  const c = corre(`usar separadores, numero de "formato"
separadores(",", ".")
imprimir(numero(1234.5))`);
  comprobar('separadores cambia la convención', c.r.ok && c.texto === '1,234.5', msgs(c) || c.texto);
}
{
  const c = corre(`usar monedaPorDefecto, moneda de "formato"
monedaPorDefecto("€")
imprimir(moneda(9))`);
  comprobar('monedaPorDefecto se recuerda', c.r.ok && c.texto === '€ 9', msgs(c) || c.texto);
}
{
  // Cada motor trae su propio eDSL con su propio estado: si lo compartieran, un
  // programa cambiaría el formato del siguiente.
  const a = crearMotor({ salida: () => {} });
  a.ejecutar('usar separadores de "formato"\nseparadores(",", ".")');
  const c = corre('usar numero de "formato"\nimprimir(numero(1234.5))');
  comprobar('el estado no se filtra a otro motor', c.texto === '1.234,5', c.texto);
}

console.log('\n── errores de uso');
{
  const c = corre('usar romano de "formato"\nimprimir(romano(5000))');
  comprobar('romano se queja fuera de su rango', !c.r.ok && /solo de 1 a 3999/.test(msgs(c)), msgs(c));
}
{
  const c = corre('usar enLetras de "formato"\nimprimir(enLetras(1000000000000000))');
  comprobar('enLetras se queja de un número imposible de leer',
    !c.r.ok && /demasiado grande/.test(msgs(c)), msgs(c));
}

console.log(`\n${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
