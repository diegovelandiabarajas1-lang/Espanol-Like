// comparar/kotlindl.kt — las pruebas en Kotlin con el motor de KotlinDL (CPU).
//   kotlinc kotlindl.kt -cp <jars de KotlinDL> -include-runtime -d kotlindl.jar
//   java -Xmx12g -cp kotlindl.jar:<jars> KotlindlKt [chica]
// KotlinDL es una biblioteca para redes neuronales: no tiene operaciones sueltas
// de arreglos. Por dentro corre sobre TensorFlow 1.15 para Java, y eso es lo que
// se mide aquí, con el grafo de TensorFlow (sus operaciones MatMul, Sin, Sum,
// Softmax, FFT) y la sesión que trae KotlinDL. Doble precisión salvo la FFT: la
// API de Java de TF 1.15 no sabe de complejos de 128 bits, así que va en
// float32 (complex64). La GPU de TF 1.15 pide CUDA 10: aquí, CPU.
import org.tensorflow.DataType
import org.tensorflow.Graph
import org.tensorflow.Output
import org.tensorflow.Session
import org.tensorflow.Tensor

fun main(args: Array<String>) {
    val chica = args.isNotEmpty() && args[0] == "chica"
    val ns = if (chica) listOf(128, 256) else listOf(1024, 2048)
    val nv = if (chica) 65536 else 16777216
    val sm = if (chica) 256 else 4096
    val sk = 1024
    val nf = if (chica) 16384 else 1048576
    println("# TensorFlow " + org.tensorflow.TensorFlow.version())

    for (n in ns) {
        val a = Array(n) { i -> DoubleArray(n) { j -> ((i * 7 + j * 3) % 13) / 13.0 - 0.5 } }
        val b = Array(n) { i -> DoubleArray(n) { j -> ((i * 5 + j * 11) % 17) / 17.0 - 0.5 } }
        prueba("matmul", "$n", "f64", mapOf("A" to Tensor.create(a), "B" to Tensor.create(b))) { g ->
            val r = op(g, "MatMul", "r", entrada(g, "A"), entrada(g, "B"))
            r to sumaTodo(g, r)
        }
    }
    val x = DoubleArray(nv) { i -> (i % 1000) / 1000.0 }
    val tx = Tensor.create(x)
    prueba("seno", "$nv", "f64", mapOf("x" to tx)) { g -> val r = op(g, "Sin", "r", entrada(g, "x")); r to sumaTodo(g, r) }
    prueba("x*2+1", "$nv", "f64", mapOf("x" to tx)) { g ->
        val r = op(g, "Add", "r", op(g, "Mul", "m", entrada(g, "x"), constante(g, "dos", 2.0)), constante(g, "uno", 1.0))
        r to sumaTodo(g, r)
    }
    prueba("suma", "$nv", "f64", mapOf("x" to tx)) { g -> val r = sumaTodo(g, entrada(g, "x")); r to r }
    val s = Array(sm) { i -> DoubleArray(sk) { j -> ((i * 3 + j) % 50) / 10.0 } }
    prueba("softmax", "${sm}x$sk", "f64", mapOf("S" to Tensor.create(s))) { g ->
        val r = op(g, "Softmax", "r", entrada(g, "S"))
        r to sumaTodo(g, op(g, "Mul", "rr", r, r))
    }
    val xf = FloatArray(nf) { i -> (i % 1000) / 1000.0f }
    prueba("fft", "$nf", "f32", mapOf("xf" to Tensor.create(xf), "cero" to Tensor.create(FloatArray(nf)))) { g ->
        val c = op(g, "Complex", "c", entrada(g, "xf", DataType.FLOAT), entrada(g, "cero", DataType.FLOAT))
        val r = op(g, "FFT", "r", c)
        r to sumaTodo(g, op(g, "ComplexAbs", "abs", r))
    }
}

// Un grafo por prueba: «construir» devuelve (lo que se mide, la huella). Se mide
// pidiendo a la sesión que calcule «r» sin traer el resultado (addTarget).
fun prueba(nombre: String, tam: String, prec: String, entradas: Map<String, Tensor<*>>, construir: (Graph) -> Pair<Output<*>, Output<*>>) {
    try {
        Graph().use { g ->
            val (r, h) = construir(g)
            Session(g).use { s ->
                fun correr(): Unit { val run = s.runner(); entradas.forEach { (k, v) -> run.feed(k, v) }; run.addTarget(r.op().name()).run() }
                correr()
                var mejor = Double.POSITIVE_INFINITY
                repeat(3) {
                    val t0 = System.nanoTime(); correr(); mejor = minOf(mejor, (System.nanoTime() - t0) / 1e6)
                }
                val run = s.runner(); entradas.forEach { (k, v) -> run.feed(k, v) }
                val t = run.fetch(h).run()[0]
                val huella = if (t.dataType() == DataType.FLOAT) t.floatValue().toDouble() else t.doubleValue()
                t.close()
                println("RES,$nombre,$tam,cpu,$mejor,$huella,$prec")
            }
        }
    } catch (e: Throwable) {
        println("# fallo $nombre: ${e.message}")
    }
}
fun entrada(g: Graph, nombre: String, tipo: DataType = DataType.DOUBLE): Output<*> =
    g.operation(nombre)?.output<Any>(0) ?: g.opBuilder("Placeholder", nombre).setAttr("dtype", tipo).build().output<Any>(0)
fun op(g: Graph, tipo: String, nombre: String, vararg ins: Output<*>): Output<*> {
    val b = g.opBuilder(tipo, nombre)
    for (i in ins) b.addInput(i)
    return b.build().output<Any>(0)
}
fun constante(g: Graph, nombre: String, v: Double): Output<*> =
    g.opBuilder("Const", nombre).setAttr("dtype", DataType.DOUBLE).setAttr("value", Tensor.create(v)).build().output<Any>(0)
var cuantos = 0
fun sumaTodo(g: Graph, x: Output<*>): Output<*> {
    cuantos++
    // los ejes: todos (0 … rango−1), con Range(0, Rank(x), 1)
    val rango = op(g, "Rank", "rank$cuantos", x)
    val cero = g.opBuilder("Const", "c0_$cuantos").setAttr("dtype", DataType.INT32).setAttr("value", Tensor.create(0)).build().output<Any>(0)
    val unoI = g.opBuilder("Const", "c1_$cuantos").setAttr("dtype", DataType.INT32).setAttr("value", Tensor.create(1)).build().output<Any>(0)
    val ejes = op(g, "Range", "ejes$cuantos", cero, rango, unoI)
    return g.opBuilder("Sum", "suma$cuantos").addInput(x).addInput(ejes).setAttr("keep_dims", false).build().output<Any>(0)
}
