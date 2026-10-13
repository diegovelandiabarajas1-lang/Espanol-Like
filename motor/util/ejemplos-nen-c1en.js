// Un ejemplo ejecutable por cada nombre de C1EÑ dentro de «nen». Como el resto
// de la referencia, se generan corriéndolos. Ninguno exige "nativo" ni "gpu":
// la referencia también se arma donde solo hay "jit" (el navegador), y ahí
// tienen que correr igual.
module.exports = {
  'nen.paralelo':
    'usar paralelo de "nen"\nusar arreglo, aListaA de "numerico"\n\n' +
    '# y = a·x + y, un hilo por elemento\n' +
    'fn saxpy(i, a, x, y) {\n  y[i] = a * x[i] + y[i]\n}\n' +
    'var x = arreglo([1.0, 2.0, 3.0, 4.0], "real")\nvar y = arreglo([0.5, 0.5, 0.5, 0.5], "real")\n' +
    'paralelo(4, saxpy, 2.0, x, y)\nimprimir(aListaA(y))',
  'nen.dispositivo':
    'usar dispositivo, usarDispositivo de "nen"\n\nusarDispositivo("jit")\nimprimir("corriendo en: " + dispositivo())',
  'nen.dispositivos':
    'usar dispositivos de "nen"\n\npara d en dispositivos() {\n  imprimir("· " + d)\n}',
  'nen.usarDispositivo':
    'usar usarDispositivo, dispositivos, paralelo de "nen"\nusar ceros, suma de "numerico"\n\n' +
    '# el mismo núcleo en cada dispositivo que haya: da lo mismo en todos\n' +
    'fn cuadrados(i, r) {\n  r[i] = i * i\n}\n' +
    'para d en dispositivos() {\n  var nombre = d\n  si contiene(d, "nativo") { nombre = "nativo" }\n' +
    '  si contiene(d, "gpu") { nombre = "gpu" }\n  usarDispositivo(nombre)\n' +
    '  var r = ceros(100, "entero")\n  paralelo(100, cuadrados, r)\n  imprimir(nombre + ": " + texto(suma(r)))\n}\n' +
    'usarDispositivo("jit")',
  'nen.codigoCuda':
    'usar codigoCuda de "nen"\n\nfn doble(i, a) {\n  a[i] = 2.0 * a[i]\n}\n' +
    '# sin ejemplos, «a» se toma por arreglo real porque se indexa\n' +
    'var cu = codigoCuda(doble)\nimprimir(contiene(cu, "__global__ void c1en_nucleo"))',
  'nen.codigoC':
    'usar codigoC de "nen"\nusar ceros de "numerico"\n\nfn cuenta(i, h) {\n  h[i % 4] = i\n}\n' +
    '# con un ejemplo, el arreglo es del tipo del ejemplo (aquí entero → int32_t*)\n' +
    'var c = codigoC(cuenta, ceros(4, "entero"))\nimprimir(contiene(c, "int32_t* p1"))',
  'nen.azarHilo':
    'usar azarHilo, paralelo, usarDispositivo de "nen"\nusar ceros, suma de "numerico"\n\n' +
    '# Monte Carlo de π: cada hilo saca sus puntos del azar por contador\n' +
    'fn piHilo(i, muestras, dentro) {\n  var c = 0\n  para j en rango(muestras) {\n' +
    '    var x = azarHilo(2026, i * muestras + j, 0)\n    var y = azarHilo(2026, i * muestras + j, 1)\n' +
    '    si x * x + y * y < 1.0 { c = c + 1 }\n  }\n  dentro[i] = c\n}\n' +
    'usarDispositivo("jit")\nvar dentro = ceros(64, "entero")\nparalelo(64, piHilo, 500, dentro)\n' +
    'imprimir(4.0 * suma(dentro) / (64 * 500))\nimprimir(azarHilo(1, 2, 3) == azarHilo(1, 2, 3))',
  'nen.sumarAtomico':
    'usar sumarAtomico, paralelo de "nen"\nusar arreglo, ceros, aListaA, piso de "numerico"\n\n' +
    '# un histograma: muchos hilos suman en pocas cubetas sin pisarse\n' +
    'fn histo(i, datos, cubetas) {\n  sumarAtomico(cubetas, piso(datos[i]), 1)\n}\n' +
    'var datos = arreglo([0.5, 1.5, 1.7, 2.2, 2.9, 2.0, 3.99, 0.1], "real")\nvar cub = ceros(4, "entero")\n' +
    'paralelo(8, histo, datos, cub)\nimprimir(aListaA(cub))',
};
