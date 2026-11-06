// exp-aot-datos.js — el eDSL «datos» (tablas) en el ejecutable nativo (aot/nrt_datos.inc).
// Cada programa se corre en la VM (n-node.js) y como ejecutable, y tiene que imprimir lo mismo y salir con el mismo código.
// Se salta sin compilador de C.   node motor-exp/pruebas/exp-aot-datos.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const N_COMP = path.join(RAIZ, 'util', 'n-compilar.js'), N_NODE = path.join(RAIZ, 'util', 'n-node.js');
const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aot-dat-')));
{
  fs.writeFileSync(path.join(raiz, 'sonda.esl'), 'imprimir(1)\n');
  const d = spawnSync(process.execPath, [N_COMP, path.join(raiz, 'sonda.esl')], { encoding: 'utf8', env: { ...process.env, N_AOT_DONDE_CC: '1' } });
  if (d.status !== 0 && spawnSync('gcc', ['--version']).status !== 0 && !process.env.C1EN_CC) { console.log('  (sin compilador de C)\nexp-aot-datos: saltada entera'); process.exit(0); }
}
let pasan = 0, fallan = 0, n = 0;
const fallos = [];
const limpia = t => t.split('\n').filter(l => !/^\s+en .+\(línea \d+\)\s*$/.test(l)).join('\n').replace(/\n$/, '');
function igual(nombre, src, opciones) {
  const d = path.join(raiz, 'w' + n++); fs.mkdirSync(d);
  if (opciones && opciones.prepara) opciones.prepara(d);
  const f = path.join(d, 'p.esl'), exe = path.join(d, 'p.exe');
  fs.writeFileSync(f, src);
  const c = spawnSync(process.execPath, [N_COMP, f, '-o', exe], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (c.status !== 0) { fallan++; fallos.push(`✗ ${nombre}\n    NO COMPILA: ${((c.stdout || '') + (c.stderr || '')).trim().split('\n').slice(0, 3).join(' | ')}`); return; }
  const a = spawnSync(process.execPath, [N_NODE, f], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const b = spawnSync(exe, [], { encoding: 'utf8', cwd: d, timeout: 60000, maxBuffer: 1 << 26 });
  const sa = limpia(a.stdout || ''), sb = limpia(b.stdout || '');
  if (sa !== sb || a.status !== b.status) { fallan++; fallos.push(`✗ ${nombre}\n    VM:      ${JSON.stringify(sa)} (${a.status})\n    nativo:  ${JSON.stringify(sb)} (${b.status})`); return; }
  pasan++;
}
const NOMBRES = 'deRegistros, deColumnas, deLista, deCsv, deDatos, aDatos, aCsv, aLista, aRegistros, aColumnas, columnas, tipos, primeras, ultimas, vacios, describir, vistazo, columna, celda, fila, soloColumnas, sinColumna, renombrar, reordenar, donde, ordenarPor, unicas, sinRepetir, quitarVacios, conColumna, convertir, aplicarA, rellenarVacios, numerar, sumaCol, promedioCol, minCol, maxCol, primeroCol, ultimoCol, contarCol, juntarCol, agrupar, resumir, contarPor, pivotar, despivotar, cruzar, apilar, juntarColumnas, diferencia';
const U = `usar ${NOMBRES} de "datos"\n`;
const VENTAS = `fijo ventas = deRegistros([
  {"ciudad": "Girón", "mes": "ene", "ventas": 1200, "precio": 3.5, "activo": cierto},
  {"ciudad": "Bogotá", "mes": "ene", "ventas": 800, "precio": 4.25, "activo": falso},
  {"ciudad": "Girón", "mes": "feb", "ventas": nulo, "precio": 3.5, "activo": cierto},
  {"ciudad": "Cali", "mes": "feb", "ventas": 450, "precio": nulo, "activo": cierto},
  {"ciudad": "Bogotá", "mes": "feb", "ventas": 950, "precio": 4.25, "activo": nulo},
  {"ciudad": "Girón", "mes": "mar", "ventas": 300, "precio": 2.0, "activo": falso}
])
`;
const CSV1 = 'nit;nombre;saldo;fecha;ok\\n0012345;\\"Pérez, Ana\\";1.234,5;2026-09-29;sí\\n99;Luis \\"el Zorro\\";-7;29/09/2026;no\\n;;;;\\n7;Ñandú;3,25;2026-1-2;CIERTO\\n';

// ── entrar
igual('deRegistros, tipos y columnas', U + VENTAS + `imprimir(ventas, columnas(ventas), tipos(ventas), longitud(ventas), tipo(ventas))
imprimir(aRegistros(ventas))
imprimir(deRegistros([]), longitud(deRegistros([])))`);
igual('deRegistros: errores', U + `fijo q = [3, "a"][0]
intentar { deRegistros(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deRegistros([q]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deRegistros([{"a": 1}, q]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deRegistros([{"a": 1}, {"a": 2, "b": 3}]) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }`);
igual('deColumnas, deLista y sus errores', U + `fijo t = deColumnas({"a": [1, 2, 3], "b": ["x", "y", "z"], "c": [1.5, nulo, 2]})
imprimir(t, tipos(t), aLista(t), aColumnas(t))
fijo u = deLista([[1, "x"], [2, "y"]], ["n", "s"])
imprimir(u, aRegistros(u), tipos(u))
intentar { deColumnas({"a": [1], "b": [1, 2]}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deColumnas({"a": 5}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deLista([[1]], ["a", "b"]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { deLista([5], ["a"]) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('deCsv: tipos adivinados, comillas, comas, fechas, booleanos', U + `fijo t = deCsv("${CSV1}")
imprimir(t, tipos(t))
imprimir(aRegistros(t))
vistazo(t)
imprimir(aCsv(t))
imprimir(aCsv(t, ";"))`);
igual('deCsv: separadores y bordes', U + `imprimir(aLista(deCsv("a,b\\n1,2\\n3,4")), aLista(deCsv("a;b\\n1,5;2")), aLista(deCsv("a\\tb\\n1\\t2", "\\t")), deCsv(""), aLista(deCsv("x\\n\\n\\ny\\n")))
imprimir(tipos(deCsv("a,b,c\\n1,2\\n3,4,5,6")), aLista(deCsv("a,b,c\\n1,2\\n3,4,5,6")))
imprimir(aLista(deCsv("a\\n9007199254740993\\n12345678901234567890")), tipos(deCsv("a\\n9007199254740993")))
imprimir(aLista(deCsv("a\\n 12 \\n-3\\n1.5\\n1,5\\n.5\\n5.\\n1e3\\n+4")))`);
igual('deDatos y aDatos: ida y vuelta', U + `fijo t = deCsv("${CSV1}")
fijo s = aDatos(t)
imprimir(s)
imprimir(aDatos(t, cierto))
fijo u = deDatos(s)
imprimir(u == t, tipos(u), aRegistros(u))
imprimir(aDatos(u) == s)
imprimir(aDatos(deColumnas({"x": [1, nulo], "y": [cierto, falso]})))`);
const MALOS_DATOS = [
  '{', '[1]', '{}', '{"ñdatos": 9, "columnas": [], "datos": []}', '{"ñdatos": 1}', '{"ñdatos": 1, "columnas": [{"nombre": "a"}], "datos": []}',
  '{"ñdatos": 1, "columnas": [{}], "datos": [[1]]}', '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "raro"}], "datos": [[1]]}',
  '{"ñdatos": 1, "columnas": [{"nombre": "a"}, {"nombre": "b"}], "datos": [[1], [1, 2]]}', '{"ñdatos": 1, "columnas": [{"nombre": "a"}], "datos": [5]}',
  '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "entero"}], "datos": [["x"]]}', '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "fecha"}], "datos": [["2026-13"]]}',
  '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "fecha"}], "datos": [[5]]}', '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "bool"}], "datos": [[5]]}',
  '{"ñdatos": 1, "filas": 3, "columnas": [{"nombre": "a"}], "datos": [[1]]}', '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": 5}], "datos": [[1]]}',
  '{"ñdatos": "2", "columnas": [], "datos": []}', '{"ñdatos": 1, "columnas": [{"nombre": "a", "tipo": "texto"}], "datos": [[1, true, null, "z"]]}',
];
igual('deDatos: errores y casos raros', U + `fijo q = [3, "a"][0]
para i en rango(${MALOS_DATOS.length}) { intentar { imprimir(i, aRegistros(deDatos(leerTexto("j" + texto(i) + ".json")))) } capturar (e) { imprimir(i, e["mensaje"]) } }
intentar { deDatos(q) } capturar (e) { imprimir(e["mensaje"]) }
fijo bien = deDatos(leerTexto("fechas.json"))
imprimir(aRegistros(bien), tipos(bien))`, { prepara: d => { MALOS_DATOS.forEach((c, k) => fs.writeFileSync(path.join(d, `j${k}.json`), c));
  fs.writeFileSync(path.join(d, 'fechas.json'), '{"ñdatos": 1, "columnas": [{"nombre": "d", "tipo": "fecha"}, {"nombre": "t", "tipo": "texto"}], "datos": [["2026-09-29 14:30:00.5", "2026-01-02T03:04"], ["x", null]]}'); } });

// ── mirar
igual('primeras, ultimas, vacios, describir', U + VENTAS + `imprimir(aLista(primeras(ventas, 2)), aLista(ultimas(ventas, 2)), longitud(primeras(ventas)), longitud(ultimas(ventas, 0)), longitud(primeras(ventas, -3)), longitud(ultimas(ventas, 99)))
imprimir(vacios(ventas))
fijo d = describir(ventas)
imprimir(d, aRegistros(d), tipos(d))
vistazo(describir(deColumnas({"a": [1, 2, 3], "b": [1.5, nulo, 2.5], "c": ["x", "", "x"], "d": [cierto, falso, cierto]})))`);
igual('vistazo', U + VENTAS + `vistazo(ventas)
vistazo(ventas, 3)
vistazo(ventas, 0)
vistazo(ventas, -1)
vistazo(deCsv("${CSV1}"), 2)
vistazo(deRegistros([]))`);

// ── seleccionar
igual('columna, celda, fila, soloColumnas, sinColumna, renombrar, reordenar', U + VENTAS + `imprimir(columna(ventas, "ciudad"), celda(ventas, 3, "ventas"), fila(ventas, 1))
imprimir(columnas(soloColumnas(ventas, ["mes", "ciudad"])), columnas(sinColumna(ventas, "precio", "activo")), columnas(renombrar(ventas, "ciudad", "plaza")), columnas(reordenar(ventas, ["activo", "mes"])))
imprimir(columnas(renombrar(ventas, "ciudad", "ciudad")), aLista(soloColumnas(ventas, ["mes"])))
fijo q = [3, "a"][0]
intentar { columna(ventas, "no") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { celda(ventas, 99, "ciudad") } capturar (e) { imprimir(e["mensaje"]) }
intentar { celda(ventas, -1, "ciudad") } capturar (e) { imprimir(e["mensaje"]) }
intentar { fila(ventas, 6) } capturar (e) { imprimir(e["mensaje"]) }
intentar { renombrar(ventas, "ciudad", "mes") } capturar (e) { imprimir(e["mensaje"]) }
intentar { soloColumnas(ventas, ["x"]) } capturar (e) { imprimir(e["mensaje"]) }
intentar { sinColumna(ventas, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { columna(q, "a") } capturar (e) { imprimir(e["mensaje"]) }
intentar { columna(deRegistros([]), "a") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }`);

// ── filtrar y ordenar
igual('donde, ordenarPor, unicas', U + VENTAS + `imprimir(aRegistros(donde(ventas, fn(f) { devolver f["ciudad"] == "Girón" })))
imprimir(aRegistros(donde(ventas, fn(f) { devolver f["ventas"] != nulo y f["ventas"] > 400 })))
imprimir(columna(ordenarPor(ventas, "ventas"), "ventas"), columna(ordenarPor(ventas, "ventas", cierto), "ventas"))
imprimir(columna(ordenarPor(ventas, "ciudad"), "mes"), columna(ordenarPor(ventas, "ciudad", cierto), "mes"), columna(ordenarPor(ventas, "activo"), "ciudad"))
imprimir(unicas(ventas, "ciudad"), unicas(ventas, "ventas"), unicas(ventas, "activo"))
fijo f = deCsv("d\\n2026-03-01\\n2025-01-01\\n\\n2026-01-01")
imprimir(columna(ordenarPor(f, "d"), "d"), columna(ordenarPor(f, "d", cierto), "d"))
fijo q = [3, "a"][0]
intentar { donde(ventas, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { donde(ventas, fn(f) { devolver f["x"] > 1 }) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('sinRepetir, quitarVacios', U + VENTAS + `imprimir(aLista(sinRepetir(ventas, ["ciudad"])), aLista(sinRepetir(ventas, ["ciudad", "precio"])), longitud(sinRepetir(apilar(ventas, ventas))))
imprimir(longitud(quitarVacios(ventas)), aLista(quitarVacios(ventas, ["ventas"])), columna(quitarVacios(deCsv("a,b\\n1,\\n,2\\n3,4")), "a"))
fijo q = [3, "a"][0]
intentar { sinRepetir(ventas, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { quitarVacios(ventas, ["no"]) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── derivar
igual('conColumna, aplicarA, rellenarVacios, numerar', U + VENTAS + `fijo t = conColumna(ventas, "total", fn(f) { devolver f["precio"] * 2 })
imprimir(aRegistros(t), tipos(t))
fijo u = conColumna(ventas, "ventas", fn(f) { devolver "v" })
imprimir(columnas(u), tipos(u), columna(u, "ventas"))
fijo w = aplicarA(ventas, "ciudad", fn(c) { devolver longitud(c) })
imprimir(columna(w, "ciudad"), tipos(w))
imprimir(columna(rellenarVacios(ventas, "ventas", 0), "ventas"), tipos(rellenarVacios(ventas, "ventas", 0)), columna(rellenarVacios(ventas, "activo", "?"), "activo"))
imprimir(columna(numerar(ventas), "n"), columnas(numerar(ventas, "id", 10)), columna(numerar(ventas, "id", 10), "id"))
fijo q = [3, "a"][0]
intentar { numerar(ventas, "mes") } capturar (e) { imprimir(e["mensaje"]) }
intentar { conColumna(ventas, q, fn(f) { devolver 1 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { aplicarA(ventas, "no", fn(c) { devolver 1 }) } capturar (e) { imprimir(e["mensaje"]) }
intentar { conColumna(ventas, "x", fn(f) { devolver f["y"] + 1 }) } capturar (e) { imprimir(e["mensaje"]) }`);
igual('convertir', U + `fijo t = deColumnas({"a": ["1", "2,5", "x", ""], "b": [1, 2.7, -3.9, nulo], "c": ["2026-09-29", "29/09/2026", "9", nulo], "d": [1, 0, "", "no"]})
imprimir(columna(convertir(deColumnas({"a": ["1", "2,5", " 3 ", "4.5e1", "0x10", "-.5"]}), "a", "real"), "a"))
imprimir(columna(convertir(deColumnas({"a": ["1", "2,5", " 3 ", "4.5e1"]}), "a", "entero"), "a"))
imprimir(columna(convertir(t, "b", "texto"), "b"), columna(convertir(t, "b", "entero"), "b"), columna(convertir(t, "d", "bool"), "d"))
imprimir(columna(convertir(deColumnas({"c": ["2026-09-29", "29/09/2026"]}), "c", "fecha"), "c"), tipos(convertir(t, "b", "cualquiera")))
imprimir(columna(convertir(deCsv("f\\n2026-09-29\\n2026-10-01"), "f", "texto"), "f"))
intentar { convertir(t, "a", "real") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { convertir(t, "c", "fecha") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { convertir(t, "a", "raro") } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { convertir(t, "z", "texto") } capturar (e) { imprimir(e["mensaje"]) }`);

// ── agrupar y resumir
igual('agrupar con todos los agregados', U + VENTAS + `fijo g = agrupar(ventas, ["ciudad"], {"total": sumaCol("ventas"), "media": promedioCol("precio"), "minimo": minCol("ventas"), "maximo": maxCol("precio"),
  "primero": primeroCol("mes"), "ultimo": ultimoCol("mes"), "n": contarCol(), "con": contarCol("ventas"), "meses": juntarCol("mes", "/"), "todos": juntarCol("mes")})
imprimir(g, aRegistros(g), tipos(g))
fijo h = agrupar(ventas, ["ciudad", "mes"], {"n": contarCol()})
imprimir(aLista(h))
imprimir(aRegistros(agrupar(ventas, [], {"n": contarCol()})))
imprimir(tipo(sumaCol("x")), sumaCol("x"), contarCol(), juntarCol("a", "-"))`);
igual('resumir y contarPor', U + VENTAS + `fijo r = resumir(ventas, {"total": sumaCol("ventas"), "n": contarCol(), "maxima": maxCol("precio"), "vacia": sumaCol("precio")})
imprimir(r, aRegistros(r), tipos(r))
imprimir(aRegistros(resumir(deColumnas({"v": [nulo, nulo]}), {"s": sumaCol("v"), "m": minCol("v"), "p": primeroCol("v"), "j": juntarCol("v")})))
imprimir(aLista(contarPor(ventas, "ciudad")), aLista(contarPor(ventas, "ciudad", "activo")), columnas(contarPor(ventas, "mes")))
fijo f = deCsv("d,x\\n2026-01-02,1\\n2026-01-01,5\\n2026-01-02,3")
imprimir(aLista(agrupar(f, ["d"], {"s": sumaCol("x"), "mn": minCol("x"), "mx": maxCol("d")})))`);
igual('agrupar, resumir y contarPor: errores', U + VENTAS + `fijo q = [3, "a"][0]
intentar { agrupar(ventas, ["ciudad"], {"t": sumaCol("ciudad")}) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { agrupar(ventas, ["ciudad"], {"t": promedioCol("mes")}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { agrupar(ventas, ["ciudad"], {"t": 5}) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { agrupar(ventas, ["ciudad"], {}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { agrupar(ventas, ["no"], {"t": contarCol()}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { agrupar(ventas, ["ciudad"], q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { resumir(ventas, {"t": sumaCol("no")}) } capturar (e) { imprimir(e["mensaje"]) }
intentar { contarPor(ventas) } capturar (e) { imprimir(e["mensaje"]) }
intentar { contarPor(ventas, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { sumaCol(q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { juntarCol() } capturar (e) { imprimir(e["mensaje"]) }`);
igual('pivotar y despivotar', U + VENTAS + `fijo p = pivotar(ventas, "ciudad", "mes", {"v": sumaCol("ventas")})
imprimir(p, aRegistros(p), tipos(p))
fijo q = pivotar(ventas, "mes", "activo", {"n": contarCol()})
imprimir(aLista(q), columnas(q))
fijo d = despivotar(p, ["ciudad"], "mes", "ventas")
imprimir(aLista(d), tipos(d))
imprimir(columnas(despivotar(p, ["ciudad"])))
intentar { pivotar(ventas, "ciudad", "mes", {"a": sumaCol("ventas"), "b": contarCol()}) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { despivotar(p, columnas(p)) } capturar (e) { imprimir(e["mensaje"]) }
intentar { pivotar(ventas, "no", "mes", {"a": contarCol()}) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── combinar
igual('cruzar, apilar, juntarColumnas, diferencia', U + VENTAS + `fijo ciudades = deRegistros([{"ciudad": "Girón", "depto": "Santander", "mes": "x"}, {"ciudad": "Cali", "depto": "Valle", "mes": "y"}, {"ciudad": "Cali", "depto": "Valle 2", "mes": "z"}])
fijo c = cruzar(ventas, ciudades, "ciudad")
imprimir(columnas(c), aLista(c), tipos(c))
imprimir(aLista(diferencia(ventas, ciudades, "ciudad")), longitud(diferencia(ciudades, ventas, "ciudad")))
imprimir(longitud(apilar(ventas, ventas, ventas)), tipos(apilar(ventas, ventas)), aLista(apilar(primeras(ventas, 1), ultimas(ventas, 1))))
fijo x = deColumnas({"a": [1, 2]})
fijo y = deColumnas({"b": ["p", "q"]})
imprimir(aRegistros(juntarColumnas(x, y)))
fijo q = [3, "a"][0]
intentar { apilar(ventas, ciudades) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { apilar() } capturar (e) { imprimir(e["mensaje"]) }
intentar { apilar(ventas, q) } capturar (e) { imprimir(e["mensaje"]) }
intentar { juntarColumnas(x, deColumnas({"a": [1, 2]})) } capturar (e) { imprimir(e["mensaje"]) }
intentar { juntarColumnas(x, deColumnas({"b": [1]})) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { cruzar(ventas, ciudades, "nada") } capturar (e) { imprimir(e["mensaje"]) }
intentar { diferencia(ventas, ciudades, "mes") } capturar (e) { imprimir(e["mensaje"]) }`);

igual('rangoFechas (del eDSL formato, que usa fechas de datos)', 'usar rangoFechas de "formato"\n' + U + `fijo f = columna(deCsv("d\\n2026-10-03\\n2026-10-07\\n2026-11-01\\n2027-01-05"), "d")
imprimir(rangoFechas(f[0], f[0]), rangoFechas(f[0], f[1]), rangoFechas(f[0], f[2]), rangoFechas(f[0], f[3]), rangoFechas(f[3], f[0]))
fijo q = [3, "a"][0]
intentar { rangoFechas(q, f[0]) } capturar (e) { imprimir(e["mensaje"]) }`);

// ── la tabla como valor
igual('igualdad, orden y tipo de una tabla', U + VENTAS + `fijo a = deColumnas({"x": [1, 2], "y": ["a", "b"]})
fijo b = deColumnas({"x": [1, 2], "y": ["a", "b"]})
fijo c = deColumnas({"x": [1, 2], "y": ["a", "c"]})
imprimir(a == b, a == c, a != c, a == 5, tipo(a), longitud(a), a)
fijo fa = deCsv("d\\n2026-01-01")
fijo fb = deCsv("d\\n2026-01-01")
imprimir(fa == fb, [a, b] == [b, a])
fijo menor = fn(x, y) { devolver x < y }
intentar { imprimir(menor(a, b)) } capturar (e) { imprimir(e["mensaje"], e["pista"]) }
intentar { imprimir(aJson(a)) } capturar (e) { imprimir(e["mensaje"]) }
imprimir(texto(a) + "!", "t: " + texto(deRegistros([])))`);
igual('un flujo completo: leer, limpiar, agrupar, ordenar, mostrar', U + `fijo bruto = "ciudad;mes;ventas\\nGirón;ene;1200\\nBogotá;ene;800\\nGirón;feb;\\nCali;feb;450\\nBogotá;feb;950\\nGirón;mar;300\\n"
fijo t = deCsv(bruto)
fijo limpia = rellenarVacios(t, "ventas", 0)
fijo g = ordenarPor(agrupar(limpia, ["ciudad"], {"total": sumaCol("ventas"), "meses": contarCol()}), "total", cierto)
vistazo(g)
imprimir(aCsv(g))
imprimir(aDatos(g))`);

try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (_) { /* nada */ }
console.log('');
for (const f of fallos) console.log(f);
console.log(`\n  ${pasan} pasan · ${fallan} fallan\n`);
process.exit(fallan ? 1 : 0);
