// Un ejemplo ejecutable por cada función de NEÑ, parte «cálculo». Van a la
// referencia igual que los de util/ejemplos-biblioteca.js: se ejecutan y lo
// que imprimen es lo que se publica, así que si una función cambia, su ejemplo
// falla y se nota.
//
// Recordatorio que aparece en varios: los polinomios son listas de
// coeficientes de la potencia 0 hacia arriba, [c0, c1, c2] = c0 + c1·x + c2·x².
module.exports = {
  // ───────────────────────────────────────────────────────────── cálculo
  'nen.derivar': 'usar derivar de "nen"\nusar seno, coseno, redondear de "numerico"\n\n' +
    'imprimir(redondear(derivar(seno, 0.5), 10), redondear(coseno(0.5), 10))',
  'nen.derivarN': 'usar derivarN de "nen"\nusar redondear de "numerico"\n\n' +
    '# la tercera derivada de x⁴ es 24x\nimprimir(redondear(derivarN(fn(x) { devolver x ** 4 }, 2.0, 3), 6))',
  'nen.gradiente': 'usar gradiente de "nen"\nusar redondear de "numerico"\n\n' +
    '# f(x, y) = x²·y  →  ∇f = (2xy, x²)\nfijo g = gradiente(fn(p) { devolver p[0] * p[0] * p[1] }, [1.0, 2.0])\n' +
    'imprimir(g)\nimprimir(mapear(g, fn(v) { devolver redondear(v, 8) }))',
  'nen.jacobiano': 'usar jacobiano de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo J = jacobiano(fn(p) { devolver [p[0] * p[1], p[0] + p[1]] }, [3.0, 4.0])\n' +
    'para fila en J { imprimir(mapear(fila, fn(v) { devolver redondear(v, 8) })) }',
  'nen.hessiano': 'usar hessiano de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo H = hessiano(fn(p) { devolver p[0] ** 2 * p[1] }, [1.0, 2.0])\nimprimir(redondear(H[0][0], 6), redondear(H[0][1], 6), redondear(H[1][1], 6))',
  'nen.integrar': 'usar integrar de "nen"\nusar seno, exp, raiz de "numerico"\n\n' +
    'imprimir(integrar(seno, 0.0, |PI))\n' +
    'imprimir(integrar(fn(x) { devolver exp(0.0 - x * x) }, -|INFINITO, |INFINITO), raiz(|PI))',
  'nen.integrarDoble': 'usar integrarDoble de "nen"\n\n' +
    '# ∫₀¹ ∫₀ˣ x·y dy dx = 1/8\nimprimir(integrarDoble(fn(x, y) { devolver x * y }, 0.0, 1.0, 0.0, fn(x) { devolver x }))',
  'nen.integrarMontecarlo': 'usar integrarMontecarlo de "nen"\nusar semilla, redondear de "numerico"\n\n' +
    'semilla(1)\n# el área del círculo unidad, tirando puntos en el cuadrado\n' +
    'fijo r = integrarMontecarlo(fn(p) { si p[0] * p[0] + p[1] * p[1] <= 1.0 { devolver 1.0 } sino { devolver 0.0 } }, [[-1.0, 1.0], [-1.0, 1.0]], 20000)\n' +
    'imprimir(redondear(r["valor"], 3), "±", redondear(r["error"], 3))',
  'nen.integrarDatos': 'usar integrarDatos de "nen"\n\n' +
    '# velocidades medidas cada 10 s → distancia recorrida\nimprimir(integrarDatos([0.0, 10.0, 20.0, 30.0, 40.0], [0.0, 5.0, 12.0, 20.0, 25.0]))',
  'nen.integrarAcumulado': 'usar integrarAcumulado de "nen"\n\n' +
    'imprimir(integrarAcumulado([0.0, 1.0, 2.0, 3.0], [2.0, 2.0, 2.0, 2.0]))',
  'nen.derivarDatos': 'usar derivarDatos de "nen"\n\n' +
    'imprimir(derivarDatos([0.0, 1.0, 2.0, 3.0], [0.0, 1.0, 4.0, 9.0]))',
  'nen.sumaSerie': 'usar sumaSerie de "nen"\nusar redondear de "numerico"\n\n' +
    'imprimir(redondear(sumaSerie(fn(k) { devolver 1.0 / (k * k) }, 1), 10), redondear(|PI ** 2 / 6, 10))',
  'nen.limite': 'usar limite de "nen"\nusar seno, redondear de "numerico"\n\n' +
    'imprimir(redondear(limite(fn(x) { devolver seno(x) / x }, 0.0), 10))\n' +
    'imprimir(redondear(limite(fn(x) { devolver (1.0 + 1.0 / x) ** x }, |INFINITO), 10))',
  'nen.longitudArco': 'usar longitudArco de "nen"\n\n' +
    '# el arco de la parábola y = x² entre 0 y 1 mide (2√5 + asinh 2)/4 ≈ 1.4789428575\nimprimir(longitudArco(fn(x) { devolver x * x }, 0.0, 1.0))',
  'nen.volumenRevolucion': 'usar volumenRevolucion de "nen"\nusar raiz de "numerico"\n\n' +
    '# la esfera de radio 1: 4π/3\nimprimir(volumenRevolucion(fn(x) { devolver raiz(1.0 - x * x) }, -1.0, 1.0), 4 * |PI / 3)',
  'nen.areaEntre': 'usar areaEntre de "nen"\n\n' +
    'imprimir(areaEntre(fn(x) { devolver x }, fn(x) { devolver x * x }, 0.0, 1.0))',
  'nen.polinomioTaylor': 'usar polinomioTaylor, textoPolinomio de "nen"\nusar coseno, redondear de "numerico"\n\n' +
    'fijo p = polinomioTaylor(coseno, 0.0, 4)\nvar r: lista = []\npara c en p { r = r + [redondear(c, 6)] }\nimprimir(textoPolinomio(r))',

  // ────────────────────────────────────────────────────────── ecuaciones
  'nen.resolverEcuacion': 'usar resolverEcuacion de "nen"\nusar coseno de "numerico"\n\n' +
    '# cos x = x\nimprimir(resolverEcuacion(fn(x) { devolver coseno(x) - x }, 0.0, 1.0))',
  'nen.raizNewton': 'usar raizNewton de "nen"\n\n' +
    'imprimir(raizNewton(fn(x) { devolver x ** 3 - 2 * x - 5 }, 2.0))',
  'nen.raices': 'usar raices de "nen"\nusar parteReal, parteImaginaria, aListaA de "numerico"\n\n' +
    '# x² − 2x + 5 = 0  →  1 ± 2i\nfijo z = raices([5.0, -2.0, 1.0])\nimprimir(aListaA(parteReal(z)), aListaA(parteImaginaria(z)))',
  'nen.raicesReales': 'usar raicesReales de "nen"\n\n' +
    '# (x − 1)(x − 2)(x − 3)\nimprimir(raicesReales([-6.0, 11.0, -6.0, 1.0]))',
  'nen.resolverNoLineal': 'usar resolverNoLineal de "nen"\n\n' +
    '# x² + y² = 4  y  x = y\nimprimir(resolverNoLineal(fn(v) { devolver [v[0] ** 2 + v[1] ** 2 - 4, v[0] - v[1]] }, [1.0, 0.5]))',
  'nen.puntoFijo': 'usar puntoFijo de "nen"\nusar coseno de "numerico"\n\n' +
    'imprimir(puntoFijo(coseno, 1.0))',

  // ────────────────────────────────────────────────────────── optimización
  'nen.minimizar1D': 'usar minimizar1D de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo r = minimizar1D(fn(x) { devolver (x - 2) ** 2 + 1 }, 0.0, 5.0)\nimprimir(redondear(r["x"], 6), r["valor"])',
  'nen.minimizar': 'usar minimizar de "nen"\nusar redondear de "numerico"\n\n' +
    '# Rosenbrock: el valle curvo con el mínimo en (1, 1)\n' +
    'fijo r = minimizar(fn(p) { devolver 100 * (p[1] - p[0] ** 2) ** 2 + (1 - p[0]) ** 2 }, [-1.2, 1.0])\n' +
    'imprimir(redondear(r["x"][0], 6), redondear(r["x"][1], 6))',
  'nen.minimizarBFGS': 'usar minimizarBFGS de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo r = minimizarBFGS(fn(p) { devolver (p[0] - 3) ** 2 + 2 * (p[1] + 1) ** 2 }, [0.0, 0.0])\n' +
    'imprimir(redondear(r["x"][0], 6), redondear(r["x"][1], 6), r["iteraciones"] < 50)',
  'nen.maximizar': 'usar maximizar de "nen"\nusar redondear de "numerico"\n\n' +
    '# la caja sin tapa de más volumen con una lámina de 30×30\n' +
    'fijo r = maximizar(fn(x) { devolver x * (30 - 2 * x) ** 2 }, 0.0, 15.0)\nimprimir(redondear(r["x"], 6), redondear(r["valor"], 6))',
  'nen.ajustarCurva': 'usar ajustarCurva de "nen"\nusar exp, redondear de "numerico"\n\n' +
    'fijo xs = [0.0, 1.0, 2.0, 3.0, 4.0]\nfijo ys = [5.0, 3.0, 1.8, 1.1, 0.66]\n' +
    'fijo r = ajustarCurva(fn(x, p) { devolver p[0] * exp(p[1] * x) }, xs, ys, [1.0, -0.1])\n' +
    'imprimir(redondear(r["parametros"][0], 3), redondear(r["parametros"][1], 3), "±", redondear(r["errores"][1], 3))',
  'nen.optimizarLineal': 'usar optimizarLineal de "nen"\n\n' +
    '# máx 3x + 5y  con  x ≤ 4,  2y ≤ 12,  3x + 2y ≤ 18\n' +
    'fijo r = optimizarLineal([3.0, 5.0], [[1.0, 0.0], [0.0, 2.0], [3.0, 2.0]], [4.0, 12.0, 18.0], "maximizar")\nimprimir(r["x"], r["valor"])',

  // ──────────────────────────────────────────── ecuaciones diferenciales
  'nen.resolverEDO': 'usar resolverEDO de "nen"\nusar redondear de "numerico"\n\n' +
    '# y′ = −y/2 con y(0) = 4, mirada en t = 0, 1, 2\nfijo r = resolverEDO(fn(t, y) { devolver -0.5 * y }, 0.0, 4.0, 2.0, 2)\n' +
    'para k en rango(3) { imprimir(r["t"][k], redondear(r["y"][k], 8)) }',
  'nen.rk4': 'usar rk4 de "nen"\nusar exp, redondear de "numerico"\n\n' +
    'fijo r = rk4(fn(t, y) { devolver y }, 0.0, 1.0, 1.0, 10)\nimprimir(redondear(r["y"][10], 8), redondear(exp(1), 8))',
  'nen.resolverEDORigida': 'usar resolverEDORigida de "nen"\nusar coseno, redondear de "numerico"\n\n' +
    '# rígida: y sigue a cos t con un tiempo de reacción de una milésima\n' +
    'fijo r = resolverEDORigida(fn(t, y) { devolver -1000 * (y - coseno(t)) }, 0.0, 0.0, 1.0, 100)\n' +
    'imprimir(redondear(r["y"][100], 4), redondear(coseno(1), 4))',

  // ──────────────────────────────────────────────────────────── polinomios
  'nen.evaluarPolinomio': 'usar evaluarPolinomio de "nen"\n\n' +
    '# 1 − 2x + 3x²\nimprimir(evaluarPolinomio([1.0, -2.0, 3.0], 2.0), evaluarPolinomio([1.0, -2.0, 3.0], [0.0, 1.0, 2.0]))',
  'nen.derivarPolinomio': 'usar derivarPolinomio, textoPolinomio de "nen"\n\n' +
    'imprimir(textoPolinomio(derivarPolinomio([1.0, -2.0, 3.0, 4.0])))',
  'nen.integrarPolinomio': 'usar integrarPolinomio, textoPolinomio de "nen"\n\n' +
    'imprimir(textoPolinomio(integrarPolinomio([0.0, 2.0, 3.0], 5.0)))',
  'nen.sumarPolinomios': 'usar sumarPolinomios de "nen"\n\nimprimir(sumarPolinomios([1.0, 2.0], [0.0, 0.0, 3.0]))',
  'nen.restarPolinomios': 'usar restarPolinomios de "nen"\n\nimprimir(restarPolinomios([1.0, 2.0, 3.0], [1.0, 0.0, 3.0]))',
  'nen.multiplicarPolinomios': 'usar multiplicarPolinomios, textoPolinomio de "nen"\n\n' +
    '# (x + 1)(x − 1)\nimprimir(textoPolinomio(multiplicarPolinomios([1.0, 1.0], [-1.0, 1.0])))',
  'nen.dividirPolinomios': 'usar dividirPolinomios, textoPolinomio de "nen"\n\n' +
    'fijo r = dividirPolinomios([-1.0, 0.0, 0.0, 1.0], [-1.0, 1.0])\nimprimir(textoPolinomio(r["cociente"]), "resto", textoPolinomio(r["resto"]))',
  'nen.polinomioDesdeRaices': 'usar polinomioDesdeRaices, textoPolinomio de "nen"\n\n' +
    'imprimir(textoPolinomio(polinomioDesdeRaices([1.0, 2.0, 3.0])))',
  'nen.ajustePolinomico': 'usar ajustePolinomico de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo p = ajustePolinomico([0.0, 1.0, 2.0, 3.0, 4.0], [1.1, 2.9, 9.2, 18.8, 33.1], 2)\n' +
    'imprimir(redondear(p[0], 3), redondear(p[1], 3), redondear(p[2], 3))',
  'nen.textoPolinomio': 'usar textoPolinomio de "nen"\n\n' +
    'imprimir(textoPolinomio([1.0, -2.0, 3.0]))\nimprimir(textoPolinomio([0.0, -1.0, 0.0, 0.5], "t"))',

  // ───────────────────────────────────────────────────────── interpolación
  'nen.interpolarLineal': 'usar interpolarLineal de "nen"\n\n' +
    'imprimir(interpolarLineal([0.0, 10.0, 20.0], [15.0, 25.0, 22.0], [5.0, 12.0]))',
  'nen.interpolarLagrange': 'usar interpolarLagrange de "nen"\n\n' +
    '# por cuatro puntos de x³ pasa x³\nimprimir(interpolarLagrange([0.0, 1.0, 2.0, 3.0], [0.0, 1.0, 8.0, 27.0], 1.5))',
  'nen.polinomioInterpolante': 'usar polinomioInterpolante, textoPolinomio de "nen"\n\n' +
    'imprimir(textoPolinomio(polinomioInterpolante([1.0, 2.0, 3.0], [2.0, 5.0, 10.0])))',
  'nen.splineCubico': 'usar splineCubico de "nen"\nusar redondear de "numerico"\n\n' +
    'fijo s = splineCubico([0.0, 1.0, 2.0, 3.0], [0.0, 1.0, 0.0, 1.0])\nimprimir(s(1.0), redondear(s(1.5), 6), redondear(s(2.5), 6))',
  'nen.interpolar': 'usar interpolar de "nen"\n\n' +
    'fijo xs = [0.0, 1.0, 2.0]\nfijo ys = [0.0, 1.0, 4.0]\nimprimir(interpolar(xs, ys, 1.5), interpolar(xs, ys, 1.5, "lagrange"))',

  // ─────────────────────────────────────────────────── funciones especiales
  'nen.gamma': 'usar gamma de "nen"\nusar raiz de "numerico"\n\nimprimir(gamma(5.0), gamma(0.5), raiz(|PI))',
  'nen.lnGamma': 'usar lnGamma de "nen"\n\n# Γ(200) no cabe; su logaritmo sí\nimprimir(lnGamma(200.0))',
  'nen.beta': 'usar beta de "nen"\n\nimprimir(beta(2.0, 3.0), 1.0 / 12)',
  'nen.digamma': 'usar digamma de "nen"\n\n# ψ(1) = −γ, la constante de Euler–Mascheroni\nimprimir(digamma(1.0))',
  'nen.erf': 'usar erf de "nen"\n\nimprimir(erf(0.0), erf(1.0), erf(|INFINITO))',
  'nen.erfc': 'usar erfc de "nen"\n\nimprimir(erfc(1.0), erfc(10.0))',
  'nen.erfInversa': 'usar erf, erfInversa de "nen"\n\nfijo x = erfInversa(0.5)\nimprimir(x, erf(x))',
  'nen.gammaIncompleta': 'usar gammaIncompleta de "nen"\nusar exp de "numerico"\n\n' +
    '# P(1, x) = 1 − e^(−x)\nimprimir(gammaIncompleta(1.0, 2.0), 1 - exp(-2.0), gammaIncompleta(1.0, 2.0, "superior"))',
  'nen.betaIncompleta': 'usar betaIncompleta de "nen"\n\nimprimir(betaIncompleta(2.0, 3.0, 0.4))',
  'nen.besselJ': 'usar besselJ de "nen"\n\nimprimir(besselJ(0, 0.0), besselJ(0, 2.404825557695773), besselJ(1, 1.0))',
  'nen.zeta': 'usar zeta de "nen"\n\nimprimir(zeta(2.0), |PI ** 2 / 6, zeta(-1.0))',

  // ──────────────────────────────────────────────────────────── probabilidad
  'nen.normalDensidad': 'usar normalDensidad de "nen"\n\nimprimir(normalDensidad(0.0), normalDensidad(100.0, 100.0, 15.0))',
  'nen.normalAcumulada': 'usar normalAcumulada de "nen"\n\n' +
    '# un CI de 130 con media 100 y desviación 15\nimprimir(normalAcumulada(1.96), normalAcumulada(130.0, 100.0, 15.0))',
  'nen.normalInversa': 'usar normalInversa de "nen"\n\nimprimir(normalInversa(0.975), normalInversa(0.95, 100.0, 15.0))',
  'nen.tStudentAcumulada': 'usar tStudentAcumulada de "nen"\n\nimprimir(tStudentAcumulada(2.228, 10.0))',
  'nen.tStudentInversa': 'usar tStudentInversa de "nen"\n\n# el valor crítico de un intervalo del 95 % con 10 grados de libertad\nimprimir(tStudentInversa(0.975, 10.0))',
  'nen.chiCuadradoAcumulada': 'usar chiCuadradoAcumulada de "nen"\n\nimprimir(chiCuadradoAcumulada(3.84, 1.0))',
  'nen.chiCuadradoInversa': 'usar chiCuadradoInversa de "nen"\n\nimprimir(chiCuadradoInversa(0.95, 1.0), chiCuadradoInversa(0.95, 10.0))',
  'nen.fisherAcumulada': 'usar fisherAcumulada de "nen"\n\nimprimir(fisherAcumulada(2.0, 3.0, 10.0))',
  'nen.binomialProb': 'usar binomialProb de "nen"\n\n# tres caras en diez lanzamientos\nimprimir(binomialProb(3, 10, 0.5))',
  'nen.binomialAcumulada': 'usar binomialAcumulada de "nen"\n\nimprimir(binomialAcumulada(3, 10, 0.5))',
  'nen.poissonProb': 'usar poissonProb de "nen"\n\n# si llegan 2 clientes por minuto, la probabilidad de que lleguen 3\nimprimir(poissonProb(3, 2.0))',
  'nen.poissonAcumulada': 'usar poissonAcumulada de "nen"\n\nimprimir(poissonAcumulada(3, 2.0))',
  'nen.exponencialAcumulada': 'usar exponencialAcumulada de "nen"\n\n# vida media de 1000 h: ¿falla antes de 500 h?\nimprimir(exponencialAcumulada(500.0, 1.0 / 1000))',

  // ──────────────────────────────────────────────────────── teoría de números
  'nen.potenciaModular': 'usar potenciaModular de "nen"\n\nimprimir(potenciaModular(2, 100, 1000000007), potenciaModular(3, 4, 5))',
  'nen.inversoModular': 'usar inversoModular de "nen"\n\nfijo x = inversoModular(17, 3120)\nimprimir(x, (17 * x) % 3120)',
  'nen.mcdExtendido': 'usar mcdExtendido de "nen"\n\nfijo r = mcdExtendido(240, 46)\nimprimir(r, 240 * r["x"] + 46 * r["y"])',
  'nen.restoChino': 'usar restoChino de "nen"\n\n# deja resto 2 entre 3, 3 entre 5 y 2 entre 7\nimprimir(restoChino([2, 3, 2], [3, 5, 7]))',
  'nen.fibonacci': 'usar fibonacci de "nen"\n\nimprimir(fibonacci(10), fibonacci(78))',
  'nen.totiente': 'usar totiente de "nen"\n\nimprimir(totiente(36), totiente(13))',
  'nen.factorizar': 'usar factorizar de "nen"\n\nimprimir(factorizar(360), factorizar(600851475143))',
  'nen.esCuadradoPerfecto': 'usar esCuadradoPerfecto de "nen"\n\nimprimir(esCuadradoPerfecto(144), esCuadradoPerfecto(145))',
  'nen.siguientePrimo': 'usar siguientePrimo de "nen"\n\nimprimir(siguientePrimo(100), siguientePrimo(1000000000000))',
};
