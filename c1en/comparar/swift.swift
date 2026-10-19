// comparar/swift.swift — las pruebas en Swift, SIN Metal (CPU, un hilo).
//   swiftc -Ounchecked swift.swift -o swiftbench && ./swiftbench [chica]
// Metal Performance Shaders solo existe en Mac, iPhone y iPad: en Kaggle (Linux
// con una T4 de NVIDIA) no hay Metal, y en Linux tampoco está Accelerate (vDSP,
// BLAS de Apple). Esto es lo que queda: Swift puro, con bucles escritos a mano
// (el producto en orden i-k-j) y la libm del sistema. Es Swift, no MPS: lo dice
// la tabla. Sin FFT (Swift en Linux no trae una).
#if canImport(Glibc)
import Glibc
#else
import Foundation
#endif

func ahora() -> Double {
    var t = timespec()
    clock_gettime(CLOCK_MONOTONIC, &t)
    return Double(t.tv_sec) * 1e3 + Double(t.tv_nsec) / 1e6
}
func medir<R>(_ prueba: String, _ tam: String, _ f: () -> R, _ h: (R) -> Double) {
    var r = f()
    var mejor = Double.infinity
    for _ in 0..<3 {
        let t0 = ahora(); r = f(); mejor = min(mejor, ahora() - t0)
    }
    print("RES,\(prueba),\(tam),cpu,\(mejor),\(h(r)),f64")
}
func suma(_ v: [Double]) -> Double { var s = 0.0; for e in v { s += e }; return s }

let chica = CommandLine.arguments.count > 1 && CommandLine.arguments[1] == "chica"
let ns = chica ? [128, 256] : [1024, 2048]
let nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024

for n in ns {
    var a = [Double](repeating: 0, count: n * n), b = a
    for i in 0..<n { for j in 0..<n {
        a[i * n + j] = Double((i * 7 + j * 3) % 13) / 13.0 - 0.5
        b[i * n + j] = Double((i * 5 + j * 11) % 17) / 17.0 - 0.5
    } }
    medir("matmul", "\(n)", { () -> [Double] in
        var c = [Double](repeating: 0, count: n * n)
        a.withUnsafeBufferPointer { pa in b.withUnsafeBufferPointer { pb in c.withUnsafeMutableBufferPointer { pc in
            for i in 0..<n { for k in 0..<n {
                let aik = pa[i * n + k]
                for j in 0..<n { pc[i * n + j] += aik * pb[k * n + j] }
            } }
        } } }
        return c
    }, suma)
}
var x = [Double](repeating: 0, count: nv)
for i in 0..<nv { x[i] = Double(i % 1000) / 1000.0 }
medir("seno", "\(nv)", { x.map { sin($0) } }, suma)
medir("x*2+1", "\(nv)", { x.map { $0 * 2 + 1 } }, suma)
medir("suma", "\(nv)", { suma(x) }, { $0 })
var s = [Double](repeating: 0, count: sm * sk)
for i in 0..<sm { for j in 0..<sk { s[i * sk + j] = Double((i * 3 + j) % 50) / 10.0 } }
medir("softmax", "\(sm)x\(sk)", { () -> [Double] in
    var y = [Double](repeating: 0, count: sm * sk)
    for i in 0..<sm {
        var m = s[i * sk]
        for j in 1..<sk { m = max(m, s[i * sk + j]) }
        var t = 0.0
        for j in 0..<sk { let e = exp(s[i * sk + j] - m); y[i * sk + j] = e; t += e }
        for j in 0..<sk { y[i * sk + j] /= t }
    }
    return y
}, { y in suma(y.map { $0 * $0 }) })
