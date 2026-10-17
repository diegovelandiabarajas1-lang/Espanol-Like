// Un ejemplo ejecutable por cada función del resolucionador de fórmulas de
// NEÑ, para «el libro». Como los de ejemplos-biblioteca.js: la referencia se
// genera corriéndolos, así que si una función cambia, su ejemplo falla.
module.exports = {
  'nen.simplificarFormula': 'usar simplificarFormula de "nen"\n\nimprimir(simplificarFormula("2x + 3x - x^2/x"))\nimprimir(simplificarFormula("1/3 + 1/6"))\nimprimir(simplificarFormula("(x^2 - 1)/(x - 1)"))\nimprimir(simplificarFormula("raiz(12)/raiz(3) + seno(pi/6)"))',
  'nen.expandirFormula': 'usar expandirFormula de "nen"\n\nimprimir(expandirFormula("(x + 1)^3"))\nimprimir(expandirFormula("(a + b)(a - b)"))',
  'nen.factorizarFormula': 'usar factorizarFormula de "nen"\n\nimprimir(factorizarFormula("x^3 - 6x^2 + 11x - 6"))\nimprimir(factorizarFormula("12x^3 - 2x^2 - 30x"))\nimprimir(factorizarFormula("x^2 - y^2"))',
  'nen.derivarFormula': 'usar derivarFormula de "nen"\n\nimprimir(derivarFormula("x^3 + seno(x)", "x"))\nimprimir(derivarFormula("x^5", "x", 3))\nimprimir(derivarFormula("x^2 y + y^3", "y"))',
  'nen.gradienteFormula': 'usar gradienteFormula de "nen"\n\nimprimir(gradienteFormula("x^2 y + seno(y)", ["x", "y"]))',
  'nen.integrarFormula': 'usar integrarFormula de "nen"\n\nimprimir(integrarFormula("x*e^x", "x"))\nimprimir(integrarFormula("1/(x^2 - 1)", "x"))\nimprimir(integrarFormula("seno(x)", "x", 0, "pi"))',
  'nen.resolverFormula': 'usar resolverFormula de "nen"\n\nimprimir(resolverFormula("x^2 - 5x + 6 = 0", "x"))\nimprimir(resolverFormula("x^2 + x + 1 = 0", "x"))\nimprimir(resolverFormula("e^x = 5", "x"))\nimprimir(resolverFormula("x = coseno(x)", "x"))',
  'nen.despejar': 'usar despejar de "nen"\n\nimprimir(despejar("v = d/t", "t"))\nimprimir(despejar("x^2 + y^2 = r^2", "y"))',
  'nen.resolverSistemaFormulas': 'usar resolverSistemaFormulas de "nen"\n\nimprimir(resolverSistemaFormulas(["x + y = 3", "x - y = 1"], ["x", "y"]))\nimprimir(resolverSistemaFormulas(["x/2 + y/3 = 1", "x - y = 1/2"], ["x", "y"]))',
  'nen.evaluarFormula': 'usar evaluarFormula de "nen"\n\nimprimir(evaluarFormula("x^2 + y", {"x": 2, "y": 3}))\nimprimir(evaluarFormula("raiz(2) * pi"))',
  'nen.sustituirEnFormula': 'usar sustituirEnFormula de "nen"\n\nimprimir(sustituirEnFormula("x^2 + 1", {"x": "y + 1"}))\nimprimir(sustituirEnFormula("x^2 + 1", {"x": 0.5}))',
  'nen.variablesDeFormula': 'usar variablesDeFormula de "nen"\n\nimprimir(variablesDeFormula("a x^2 + b x + c"))',
  'nen.formulaAFuncion': 'usar formulaAFuncion de "nen"\n\nfijo g = formulaAFuncion("x^2 + 1", ["x"])\nimprimir(g(3))\nimprimir(mapear([1, 2, 3], g))',
  'nen.taylorFormula': 'usar taylorFormula de "nen"\n\nimprimir(taylorFormula("exp(x)", "x", 0, 4))\nimprimir(taylorFormula("ln(x)", "x", 1, 3))',
  'nen.limiteFormula': 'usar limiteFormula de "nen"\n\nimprimir(limiteFormula("seno(x)/x", "x", 0))\nimprimir(limiteFormula("(2x^2 + 1)/(x^2 - 3)", "x", "infinito"))',
  'nen.formulaALatex': 'usar formulaALatex de "nen"\n\nimprimir(formulaALatex("x^2/2 + raiz(x) = 1"))',
  'nen.formulaATexto': 'usar formulaATexto de "nen"\n\nimprimir(formulaATexto("3x^2 + raiz(2)*pi - abs(x)"))',
};
