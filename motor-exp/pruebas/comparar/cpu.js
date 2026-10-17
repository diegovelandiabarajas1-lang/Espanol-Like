// Los programas de CPU de la comparación LTS contra motor-exp. Cada uno define
// «trabajo()», que devuelve algo comparable: los dos motores tienen que dar el
// MISMO resultado, o la medida no vale. Todos son Ñ válido en los dos motores
// (nada de a[i] en arreglos, que solo existe en el clon).
module.exports = [
  ['fib(27) recursivo', `fn fib(n) { si n < 2 { devolver n }
  devolver fib(n - 1) + fib(n - 2) }
fn trabajo() { devolver fib(27) }`],
  ['fib iterativo ×20000', `fn fibI(n) { var a = 0
  var b = 1
  para i en rango(n) { fijo t = a + b
    a = b
    b = t }
  devolver a }
fn trabajo() { var s = 0.0
  para k en rango(20000) { s = (s + fibI(40)) % 1000003 }
  devolver entero(s) }`],
  ['criba(1000000)', `fn trabajo() { var marca = []
  para i en rango(1000001) { agregar(marca, cierto) }
  var i = 2
  mientras i * i <= 1000000 { si marca[i] { var j = i * i
      mientras j <= 1000000 { marca[j] = falso
        j = j + i } }
    i = i + 1 }
  var c = 0
  para k en rango(2, 1000001) { si marca[k] { c = c + 1 } }
  devolver c }`],
  ['mandelbrot 300×200×150', `fn trabajo() { var dentro = 0
  para py en rango(200) { para px en rango(300) {
      fijo cr = (px / 300) * 3.5 - 2.5
      fijo ci = (py / 200) * 2.0 - 1.0
      var zr = 0.0
      var zi = 0.0
      var k = 0
      mientras k < 150 y zr * zr + zi * zi <= 4.0 { fijo t = zr * zr - zi * zi + cr
        zi = 2.0 * zr * zi + ci
        zr = t
        k = k + 1 }
      si k == 150 { dentro = dentro + 1 } } }
  devolver dentro }`],
  ['suma de rango 3M', `fn trabajo() { var s = 0
  para i en rango(3000000) { s = s + i }
  devolver s }`],
  ['rango con paso', `fn trabajo() { var s = 0
  para i en rango(0, 3000000, 3) { s = s + i % 7 }
  devolver s }`],
  ['rango hacia atrás', `fn trabajo() { var s = 0
  para i en rango(2000000, 0, -1) { s = s + i % 5 }
  devolver s }`],
  ['mientras con contador', `fn trabajo() { var i = 0
  var s = 0
  mientras i < 3000000 { s = s + i % 3
    i = i + 1 }
  devolver s }`],
  ['repetir N', `fn trabajo() { var s = 0
  repetir 3000000 { s = s + 1 }
  devolver s }`],
  ['agregar 1M', `fn trabajo() { var l = []
  para i en rango(1000000) { agregar(l, i * 2) }
  devolver longitud(l) }`],
  ['leer lista por índice', `fn trabajo() { var l = rango(1000000)
  var s = 0
  repetir 3 { para i en rango(longitud(l)) { s = s + l[i] } }
  devolver s }`],
  ['escribir lista por índice', `fn trabajo() { var l = rango(1000000)
  repetir 3 { para i en rango(longitud(l)) { l[i] = l[i] + 1 } }
  devolver l[999999] }`],
  ['para x en lista', `fn trabajo() { var l = rango(1000000)
  var s = 0
  repetir 3 { para x en l { s = s + x } }
  devolver s }`],
  ['índice negativo', `fn trabajo() { var l = rango(1000)
  var s = 0
  repetir 2000 { para i en rango(1, 501) { s = s + l[-i] } }
  devolver s }`],
  ['burbuja 1200', `fn trabajo() { var l = []
  var x = 12345
  para i en rango(1200) { x = (x * 1103515245 + 12345) % 2147483648
    agregar(l, x % 10000) }
  var n = longitud(l)
  para i en rango(n) { para j en rango(n - 1 - i) {
      si l[j] > l[j + 1] { fijo t = l[j]
        l[j] = l[j + 1]
        l[j + 1] = t } } }
  devolver l[0] + l[n - 1] }`],
  ['ordenar nativo 200k', `fn trabajo() { var l = []
  var x = 7
  para i en rango(200000) { x = (x * 1103515245 + 12345) % 2147483648
    agregar(l, x) }
  fijo o = ordenar(l)
  devolver o[0] + o[199999] % 1000 }`],
  ['mapear con cierre', `fn trabajo() { var l = rango(300000)
  fijo k = 3
  var s = 0
  repetir 3 { fijo m = mapear(l, funcion(x) { devolver x * k })
    s = s + m[299999] }
  devolver s }`],
  ['filtrar', `fn trabajo() { var l = rango(500000)
  var c = 0
  repetir 3 { c = c + longitud(filtrar(l, funcion(x) { devolver x % 3 == 0 })) }
  devolver c }`],
  ['reducir', `fn trabajo() { var l = rango(500000)
  devolver reducir(l, funcion(a, x) { devolver a + x % 11 }, 0) }`],
  ['diccionario: contar', `fn trabajo() { var d = {}
  para i en rango(300000) { fijo k = i % 1000
    si contiene(d, k) { d[k] = d[k] + 1 } sino { d[k] = 1 } }
  devolver d[7] }`],
  ['diccionario con texto', `fn trabajo() { var d = {}
  para i en rango(100000) { fijo k = "c" + texto(i % 500)
    d[k] = obtener(d, k, 0) + i }
  devolver d["c42"] }`],
  ['concatenar texto', `fn trabajo() { var t = ""
  para i en rango(100000) { t = t + "a" }
  devolver longitud(t) }`],
  ['interpolación', `fn trabajo() { var n = 0
  para i en rango(100000) { fijo s = "v={i} x={i * 2}"
    n = n + longitud(s) }
  devolver n }`],
  ['recursión mutua', `fn par(n) { si n == 0 { devolver cierto }
  devolver impar(n - 1) }
fn impar(n) { si n == 0 { devolver falso }
  devolver par(n - 1) }
fn trabajo() { var c = 0
  para i en rango(3000) { si par(i % 300) { c = c + 1 } }
  devolver c }`],
  ['ackermann(2, n)', `fn ack(m, n) { si m == 0 { devolver n + 1 }
  si n == 0 { devolver ack(m - 1, 1) }
  devolver ack(m - 1, ack(m, n - 1)) }
fn trabajo() { var s = 0
  repetir 40 { s = s + ack(2, 200) }
  devolver s }`],
  ['collatz', `fn pasos(n) { var k = 0
  var x = n
  mientras x != 1 { si x % 2 == 0 { x = x // 2 } sino { x = 3 * x + 1 }
    k = k + 1 }
  devolver k }
fn trabajo() { var m = 0
  para i en rango(1, 150000) { fijo p = pasos(i)
    si p > m { m = p } }
  devolver m }`],
  ['primos por división', `fn esP(n) { si n < 2 { devolver falso }
  var d = 2
  mientras d * d <= n { si n % d == 0 { devolver falso }
    d = d + 1 }
  devolver cierto }
fn trabajo() { var c = 0
  para i en rango(200000) { si esP(i) { c = c + 1 } }
  devolver c }`],
  ['matriz 120×120 con listas', `fn trabajo() { fijo n = 120
  var a = []
  var b = []
  para i en rango(n) { var fa = []
    var fb = []
    para j en rango(n) { agregar(fa, (i + j) % 7)
      agregar(fb, (i * j) % 5) }
    agregar(a, fa)
    agregar(b, fb) }
  var s = 0
  para i en rango(n) { fijo fi = a[i]
    para j en rango(n) { var t = 0
      para k en rango(n) { t = t + fi[k] * b[k][j] }
      s = s + t } }
  devolver s }`],
  ['lista de listas: suma', `fn trabajo() { var m = []
  para i en rango(1000) { agregar(m, rango(300)) }
  var s = 0
  repetir 3 { para f en m { para x en f { s = s + x } } }
  devolver s }`],
  ['cierre contador', `fn hacer() { var n = 0
  fn sig() { n = n + 1
    devolver n }
  devolver sig }
fn trabajo() { fijo c = hacer()
  var u = 0
  repetir 1000000 { u = c() }
  devolver u }`],
  ['llamadas cortas', `fn doble(x) { devolver x * 2 }
fn trabajo() { var s = 0.0
  para i en rango(2000000) { s = s + doble(i) % 3 }
  devolver entero(s) }`],
  ['booleans y lógica', `fn trabajo() { var c = 0
  para i en rango(2000000) { si (i % 3 == 0 y i % 5 != 0) o i % 7 == 0 { c = c + 1 } }
  devolver c }`],
  ['reales y división', `fn trabajo() { var s = 0.0
  para i en rango(1, 2000000) { s = s + 1.0 / i }
  devolver entero(s * 1000) }`],
  ['numerico: elemento', `usar ceros, ponerElemento, elemento de "numerico"
fn trabajo() { var a = ceros(200000)
  para i en rango(200000) { ponerElemento(a, i, i % 9) }
  var s = 0.0
  para i en rango(200000) { s = s + elemento(a, i) }
  devolver entero(s) }`],
  ['numerico: estadística', `usar media, desviacion de "numerico"
fn trabajo() { var l = []
  para i en rango(200000) { agregar(l, (i * 37) % 1000) }
  var s = 0
  repetir 10 { s = s + media(l) + desviacion(l) }
  devolver entero(s) }`],
  ['texto eDSL: sinAcentos', `usar sinAcentos de "texto"
fn trabajo() { var n = 0
  para i en rango(20000) { n = n + longitud(sinAcentos("Martín Núñez año {i}")) }
  devolver n }`],
  ['quicksort recursivo', `fn qs(l) { si longitud(l) <= 1 { devolver l }
  fijo p = l[0]
  var menores = []
  var mayores = []
  para i en rango(1, longitud(l)) { si l[i] < p { agregar(menores, l[i]) } sino { agregar(mayores, l[i]) } }
  var r = qs(menores)
  agregar(r, p)
  para x en qs(mayores) { agregar(r, x) }
  devolver r }
fn trabajo() { var l = []
  var x = 99
  para i en rango(60000) { x = (x * 1103515245 + 12345) % 2147483648
    agregar(l, x % 100000) }
  fijo o = qs(l)
  devolver o[0] + o[59999] }`],
];
