// Pruebas del modo pseudocódigo: programas escritos en la notación de PSeInt,
// traducidos a Ñ y CORRIDOS en el motor, comparando la salida con la esperada.
//
// Los programas son nuestros, escritos aquí, no copiados de ninguna parte: así
// la cobertura es la que queremos y no queda ni una línea de material ajeno.
//
//   node PSeInt/pruebas.js          corre todo
//   node PSeInt/pruebas.js --ver    y además enseña la traducción de cada uno
'use strict';
const path = require('path');
const R = require('../motor/rutas.js');
require(R.bundle);
const { crearMotor } = globalThis.EspanolLike;
const { traducir, ErrorPSeInt } = require('./pseint.js');

const VER = process.argv.includes('--ver');
let ok = 0, mal = 0;
const fallos = [];

// Los nombres que Ñ ya tiene: una variable de PSeInt que choque se renombra.
const reservadas = (() => {
  const m = crearMotor({ salida: () => {}, host: {} });
  return new Set([...m.vm.globals.keys()].filter(k => k.indexOf('\u0000') < 0 && !k.startsWith(' ')));
})();

function correr(fuente, entradas) {
  const r = traducir(fuente, { reservadas });
  const salida = [];
  const cola = [...(entradas || [])];
  const m = crearMotor({
    salida: s => salida.push(String(s)),
    host: { sistema: { leerLinea: () => (cola.length ? String(cola.shift()) : null), argumentos: () => [], entorno: () => null, salir: () => {} } },
    limiteInstr: 2e7,
  });
  const res = m.ejecutar(r.texto, 'pseudocodigo.esl');
  return { traducido: r.texto, avisos: r.avisos, ok: res.ok, errores: res.ok ? [] : res.errores.map(e => e.formato ? e.formato() : e.message), salida: salida.join('\n') };
}

function caso(nombre, fuente, esperado, entradas) {
  let r;
  try { r = correr(fuente, entradas); }
  catch (e) {
    mal++; fallos.push(`✗ ${nombre}\n    el front-end falló: ${e.message}${e.linea ? ` (línea ${e.linea})` : ''}`);
    console.log('  ✗', nombre); return;
  }
  if (VER) { console.log('\n──', nombre); console.log(r.traducido.split('\n').map((l, i) => String(i + 1).padStart(3) + '  ' + l).join('\n')); }
  if (!r.ok) { mal++; fallos.push(`✗ ${nombre}\n    Ñ rechazó la traducción: ${r.errores.join(' | ')}\n${r.traducido}`); console.log('  ✗', nombre); return; }
  const esp = esperado.trim(), got = r.salida.trim();
  if (esp !== got) { mal++; fallos.push(`✗ ${nombre}\n    esperaba:\n${esp}\n    llegó:\n${got}\n    traducción:\n${r.traducido}`); console.log('  ✗', nombre); return; }
  ok++; console.log('  ✓', nombre + (r.avisos.length ? `  (${r.avisos.length} aviso${r.avisos.length > 1 ? 's' : ''})` : ''));
}

// Lo que debe RECHAZAR el front-end, con un mensaje que diga dónde.
function rechaza(nombre, fuente, fragmento, lineaEsperada) {
  try { traducir(fuente, { reservadas }); mal++; fallos.push(`✗ ${nombre}\n    se esperaba un error y tradujo sin quejarse`); console.log('  ✗', nombre); }
  catch (e) {
    if (!(e instanceof ErrorPSeInt)) { mal++; fallos.push(`✗ ${nombre}\n    falló con otra cosa: ${e.message}`); console.log('  ✗', nombre); return; }
    const bien = e.message.includes(fragmento) && (lineaEsperada === undefined || e.linea === lineaEsperada);
    if (bien) { ok++; console.log('  ✓', nombre); }
    else { mal++; fallos.push(`✗ ${nombre}\n    dijo «${e.message}» en la línea ${e.linea}; se esperaba «${fragmento}»${lineaEsperada ? ` en la ${lineaEsperada}` : ''}`); console.log('  ✗', nombre); }
  }
}

console.log('\n── 1. lo básico: Proceso, Definir, Escribir, asignar ──');
caso('escribir concatena sin separador, como PSeInt',
`Proceso Hola
    Escribir "Hola", " ", "mundo"
    Escribir "a", 1, "b", 2.5
FinProceso`, 'Hola mundo\na1b2.5');

caso('Definir con los cuatro tipos y sus ceros',
`Proceso Tipos
    Definir e Como Entero
    Definir r Como Real
    Definir t Como Caracter
    Definir l Como Logico
    Escribir e, "|", r, "|", t, "|", l
FinProceso`, '0|0||Falso');

caso('mayúsculas y minúsculas son la misma variable y la misma palabra',
`PROCESO Mayus
    DEFINIR Total COMO ENTERO
    total <- 5
    ESCRIBIR TOTAL
FINPROCESO`, '5');

caso('una variable sin Definir nace en la primera asignación y es real',
`Proceso Implicita
    x <- 7
    x <- x / 2
    Escribir x
    s <- "hola"
    Escribir s
FinProceso`, '3.5\nhola');

caso('Algoritmo y FinAlgoritmo valen igual que Proceso',
`Algoritmo A
    Escribir "ok"
FinAlgoritmo`, 'ok');

caso('comentarios // se ignoran, también al final de la línea',
`Proceso C
    // esto no es nada
    Escribir "a" // ni esto
FinProceso`, 'a');

console.log('\n── 2. expresiones ──');
caso('precedencia: ^ antes que *, * antes que +, y MOD',
`Proceso Prec
    Escribir 2 + 3 * 4
    Escribir 2 ^ 3 ^ 2
    Escribir 17 MOD 5
    Escribir 17 % 5
    Escribir (2 + 3) * 4
    Escribir -2 ^ 2
FinProceso`, '14\n512\n2\n2\n20\n-4');

caso('comparaciones con = y <> y los lógicos Y, O, NO',
`Proceso Comp
    a <- 5
    Escribir a = 5
    Escribir a <> 5
    Escribir a > 3 Y a < 10
    Escribir a > 30 O a < 10
    Escribir NO a > 3
    Escribir NO (a > 30)
FinProceso`, 'Verdadero\nFalso\nVerdadero\nVerdadero\nFalso\nVerdadero');

caso('división es real siempre, como en PSeInt',
`Proceso Div
    Escribir 7 / 2
    Escribir 6 / 2
    Escribir Trunc(7 / 2)
FinProceso`, '3.5\n3\n3');

console.log('\n── 3. las estructuras de control ──');
caso('Si / SiNo / FinSi anidados',
`Proceso Si1
    n <- 15
    Si n > 10 Entonces
        Si n > 20 Entonces
            Escribir "grande"
        SiNo
            Escribir "mediano"
        FinSi
    SiNo
        Escribir "chico"
    FinSi
FinProceso`, 'mediano');

caso('Mientras',
`Proceso M
    i <- 1
    Mientras i <= 3 Hacer
        Escribir i
        i <- i + 1
    FinMientras
FinProceso`, '1\n2\n3');

caso('Repetir ... Hasta Que se ejecuta al menos una vez',
`Proceso Rep
    i <- 10
    Repetir
        Escribir "pasa ", i
        i <- i + 1
    Hasta Que i > 5
FinProceso`, 'pasa 10');

caso('Para con Hasta inclusivo, con paso, y hacia atrás',
`Proceso P
    Para i <- 1 Hasta 3 Hacer
        Escribir i
    FinPara
    Para j <- 0 Hasta 10 Con Paso 5 Hacer
        Escribir j
    FinPara
    Para k <- 3 Hasta 1 Con Paso -1 Hacer
        Escribir k
    FinPara
FinProceso`, '1\n2\n3\n0\n5\n10\n3\n2\n1');

caso('Para sobre una variable ya declarada la deja como PSeInt: último valor más el paso',
`Proceso PD
    Definir i, k Como Entero
    Para i <- 1 Hasta 3 Hacer
        Escribir i
    FinPara
    Escribir "al salir: ", i
    Para k <- 10 Hasta 1 Con Paso -4 Hacer
        Escribir k
    FinPara
    Escribir "al salir: ", k
FinProceso`, '1\n2\n3\nal salir: 4\n10\n6\n2\nal salir: -2');

caso('Para con límites que son variables',
`Proceso PV
    n <- 4
    Para i <- 2 Hasta n Hacer
        Escribir i
    FinPara
FinProceso`, '2\n3\n4');

caso('Segun con varios valores por caso y De Otro Modo',
`Proceso S
    dia <- 6
    Segun dia Hacer
        1, 2, 3, 4, 5:
            Escribir "laboral"
        6, 7:
            Escribir "fin de semana"
        De Otro Modo:
            Escribir "no existe"
    FinSegun
    dia <- 9
    Segun dia Hacer
        1: Escribir "uno"
        De Otro Modo: Escribir "otro"
    FinSegun
FinProceso`, 'fin de semana\notro');

console.log('\n── 4. arreglos, que empiezan en 1 ──');
caso('Dimension y acceso 1-indexado',
`Proceso Arr
    Dimension v[3]
    v[1] <- 10
    v[2] <- 20
    v[3] <- 30
    Escribir v[1], " ", v[3]
    suma <- 0
    Para i <- 1 Hasta 3 Hacer
        suma <- suma + v[i]
    FinPara
    Escribir suma
FinProceso`, '10 30\n60');

caso('Definir antes de Dimension da el tipo de las celdas',
`Proceso ArrT
    Definir nombres Como Caracter
    Dimension nombres[2]
    nombres[1] <- "Ana"
    nombres[2] <- "Luis"
    Escribir nombres[2], nombres[1]
FinProceso`, 'LuisAna');

caso('matriz de dos dimensiones',
`Proceso Mat
    Dimension m[2, 3]
    Para i <- 1 Hasta 2 Hacer
        Para j <- 1 Hasta 3 Hacer
            m[i, j] <- i * 10 + j
        FinPara
    FinPara
    Escribir m[2, 3], " ", m[1, 1]
FinProceso`, '23 11');

console.log('\n── 5. Leer ──');
caso('Leer un número y un texto, con y sin Definir',
`Proceso L
    Definir edad Como Entero
    Leer nombre
    Leer edad
    Escribir nombre, " tiene ", edad + 1
FinProceso`, 'Ana tiene 31', ['Ana', '30']);

caso('Leer varios en una línea',
`Proceso L2
    Leer a, b
    Escribir a + b
FinProceso`, '7', ['3', '4']);

caso('Escribir Sin Saltar junta con el siguiente Escribir',
`Proceso SS
    Escribir Sin Saltar "a"
    Escribir Sin Saltar "b"
    Escribir "c"
    Escribir "d"
FinProceso`, 'abc\nd');

console.log('\n── 6. subprocesos ──');
caso('SubProceso con valor de retorno nombrado en la cabecera',
`Proceso Main
    Escribir cuadrado(4)
    Escribir cuadrado(1.5)
FinProceso

SubProceso r <- cuadrado(x)
    r <- x * x
FinSubProceso`, '16\n2.25');

caso('Funcion / FinFuncion, definida antes del Proceso, recursiva',
`Funcion f <- factorial(n)
    Si n <= 1 Entonces
        f <- 1
    SiNo
        f <- n * factorial(n - 1)
    FinSi
FinFuncion

Proceso Main
    Escribir factorial(5)
FinProceso`, '120');

caso('SubProceso sin retorno que escribe, y un arreglo por referencia',
`Proceso Main
    Dimension v[2]
    v[1] <- 1
    v[2] <- 2
    duplicar(v)
    Escribir v[1], " ", v[2]
    saludar("Ana")
FinProceso

SubProceso duplicar(a Por Referencia)
    a[1] <- a[1] * 2
    a[2] <- a[2] * 2
FinSubProceso

SubProceso saludar(quien)
    Escribir "hola ", quien
FinSubProceso`, '2 4\nhola Ana');

console.log('\n── 7. las funciones predefinidas ──');
caso('matemáticas',
`Proceso F
    Escribir RC(16), " ", Abs(-3), " ", Trunc(3.9), " ", Redon(3.5)
    Escribir Trunc(Exp(0)), " ", Trunc(LN(1))
FinProceso`, '4 3 3 4\n1 0');

caso('cadenas: Longitud, Mayusculas, Subcadena 1-indexada e inclusiva, Concatenar',
`Proceso Cad
    s <- "murcielago"
    Escribir Longitud(s)
    Escribir Mayusculas(s)
    Escribir Subcadena(s, 1, 4)
    Escribir Concatenar("a", "b")
    Escribir ConvertirANumero("12") + 1
    Escribir ConvertirATexto(5), "!"
FinProceso`, '10\nMURCIELAGO\nmurc\nab\n13\n5!');

caso('Azar y Aleatorio quedan en rango (se corre cien veces)',
`Proceso Az
    bien <- Verdadero
    Para i <- 1 Hasta 100 Hacer
        a <- Azar(6)
        b <- Aleatorio(1, 6)
        Si a < 0 O a > 5 O b < 1 O b > 6 Entonces
            bien <- Falso
        FinSi
    FinPara
    Escribir bien
FinProceso`, 'Verdadero');

console.log('\n── 8. choques de nombre con Ñ ──');
caso('una variable que se llama como algo de Ñ se renombra y funciona',
`Proceso Choque
    Definir maximo, texto, lista Como Entero
    maximo <- 9
    texto <- 2
    lista <- 3
    Escribir maximo + texto + lista
FinProceso`, '14');

caso('una variable que se llama como una palabra de Ñ también',
`Proceso Pal
    var <- 1
    fn <- 2
    Escribir var + fn
FinProceso`, '3');

caso('«valor», «paso», «modo» y «otro» son nombres válidos fuera de su contexto',
`Proceso Ctx
    Definir paso, modo, otro Como Entero
    paso <- 2
    modo <- 3
    otro <- 4
    Escribir doble(paso) + modo + otro
    Para i <- 1 Hasta 6 Con Paso paso Hacer
        Escribir Sin Saltar i
    FinPara
    Escribir ""
FinProceso

Funcion r <- doble(valor)
    r <- valor * 2
FinFuncion`, '11\n135');

console.log('\n── 9. lo que se rechaza, y dónde ──');
rechaza('falta el FinSi', `Proceso X
    Si 1 > 0 Entonces
        Escribir "a"
FinProceso`, 'se esperaba «finsi»', 4);
rechaza('un arreglo sin Dimension', `Proceso X
    v[1] <- 3
FinProceso`, 'no tiene «Dimension»', 2);
rechaza('una cadena sin cerrar', `Proceso X
    Escribir "hola
FinProceso`, 'falta cerrar la cadena', 2);
rechaza('un tipo que no existe', `Proceso X
    Definir a Como Numerote
FinProceso`, 'se esperaba un tipo', 2);
rechaza('sin Proceso', `Escribir 1`, 'se esperaba «Proceso»', 1);
rechaza('una predefinida con los argumentos mal', `Proceso X
    Escribir Subcadena("a", 1)
FinProceso`, 'espera 3 argumento(s)', 2);

console.log('\n── 10. las líneas se conservan ──');
{
  const fuente = `Proceso Lineas
    a <- 1

    Si a > 0 Entonces
        Escribir "si"
    FinSi
    // comentario
    Escribir "fin"
FinProceso`;
  const r = traducir(fuente, { reservadas });
  const ls = r.texto.split('\n');
  const prueba = (n, cond, extra) => { if (cond) { ok++; console.log('  ✓', n); } else { mal++; fallos.push(`✗ ${n}\n    ${extra}`); console.log('  ✗', n); } };
  prueba('el Si está en la línea 4 del original y de la traducción', /^\s*si a > 0 \{$/.test(ls[3]), ls[3]);
  prueba('el FinSi es un } en la línea 6', /^\s*\}$/.test(ls[5]), ls[5]);
  prueba('la línea en blanco sigue en blanco', ls[2] === '', JSON.stringify(ls[2]));
  prueba('la línea del comentario queda vacía', ls[6].trim() === '', JSON.stringify(ls[6]));
  prueba('la sangría se conserva', ls[4].startsWith('        imprimir'), ls[4]);
  const n = fuente.split('\n').length;
  prueba('las primeras N líneas son las N del original', r.lineasOriginal === n && ls[n - 1].trim() === '', `lineasOriginal=${r.lineasOriginal}, n=${n}, última=${JSON.stringify(ls[n - 1])}`);
  prueba('y debajo van los ayudantes, con su rótulo', ls[n] === '' && ls[n + 1].startsWith('# ──'), JSON.stringify(ls.slice(n, n + 2)));
  prueba('ningún ayudante se cuela en las líneas del programa', !ls.slice(0, n).some(l => /\b_txt\b|\b_leer\b|\busar\b/.test(l) && !/imprimir|=/.test(l)), ls.slice(0, n).join('\n'));
}

console.log('');
for (const f of fallos) console.log(f + '\n');
console.log(`${ok} pasan, ${mal} fallan\n`);
process.exit(mal ? 1 : 0);
