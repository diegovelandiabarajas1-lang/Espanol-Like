// comparar/breeze.sc — las seis pruebas con Breeze (Scala), CPU.
//   scala-cli run breeze.sc -- [chica]
// Breeze usa BLAS por netlib (dev.ludovic.netlib): si encuentra la libblas del
// sistema (OpenBLAS instalado con apt) la usa para A * B; si no, Java puro. La
// FFT es breeze.signal.fourierTr. Softmax con sus operaciones por filas.
//> using scala 2.13
//> using dep org.scalanlp::breeze:2.1.0
//> using javaOpt -Xmx12g
import breeze.linalg._
import breeze.numerics._
import breeze.math.Complex
import breeze.signal.fourierTr

val chica = args.headOption.contains("chica")
val ns = if (chica) Seq(128, 256) else Seq(1024, 2048)
val (nv, sm, sk, nf) = if (chica) (65536, 256, 1024, 16384) else (16777216, 4096, 1024, 1048576)

def medir[R](prueba: String, tam: String)(f: => R)(h: R => Double): Unit = {
  var r = f
  var mejor = Double.PositiveInfinity
  for (_ <- 0 until 3) {
    val t0 = System.nanoTime(); r = f; mejor = math.min(mejor, (System.nanoTime() - t0) / 1e6)
  }
  println(s"RES,$prueba,$tam,cpu,$mejor,${h(r)},f64")
}

for (n <- ns) {
  val A = DenseMatrix.tabulate(n, n)((i, j) => ((i * 7 + j * 3) % 13) / 13.0 - 0.5)
  val B = DenseMatrix.tabulate(n, n)((i, j) => ((i * 5 + j * 11) % 17) / 17.0 - 0.5)
  medir("matmul", n.toString)(A * B)(C => sum(C))
}
val x = DenseVector.tabulate(nv)(i => (i % 1000) / 1000.0)
medir("seno", nv.toString)(sin(x))(y => sum(y))
medir("x*2+1", nv.toString)(x * 2.0 + 1.0)(y => sum(y))
medir("suma", nv.toString)(sum(x))(s => s)
val S = DenseMatrix.tabulate(sm, sk)((i, j) => ((i * 3 + j) % 50) / 10.0)
medir("softmax", s"${sm}x$sk") {
  val m = max(S(*, ::))
  val E = exp(S(::, *) - m)
  E(::, *) /:/ sum(E(*, ::))
}(Y => sum(Y *:* Y))
val xf = DenseVector.tabulate(nf)(i => (i % 1000) / 1000.0)
medir("fft", nf.toString)(fourierTr(xf))(X => X.toArray.map(_.abs).sum)
