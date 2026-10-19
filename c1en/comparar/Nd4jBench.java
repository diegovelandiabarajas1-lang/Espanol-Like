// comparar/Nd4jBench.java — las pruebas con ND4J (Java, Eclipse Deeplearning4j), CPU.
//   java -Xmx12g -cp <jars de nd4j-native> Nd4jBench.java [chica]
// ND4J en doble precisión (DataType.DOUBLE). Su motor para GPU (nd4j-cuda-11.x)
// pide CUDA 11, que Kaggle ya no tiene: aquí se mide nd4j-native (CPU, con
// OpenBLAS/oneDNN por dentro). Softmax con sus operaciones por filas. ND4J no
// trae una FFT de uso general: esa prueba no está.
import org.nd4j.linalg.api.buffer.DataType;
import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.factory.Nd4j;
import org.nd4j.linalg.ops.transforms.Transforms;
import java.util.function.Function;
import java.util.function.Supplier;

public class Nd4jBench {
    static void medir(String prueba, String tam, Supplier<INDArray> f, Function<INDArray, Double> h) {
        INDArray r = f.get();
        double mejor = Double.POSITIVE_INFINITY;
        for (int k = 0; k < 3; k++) {
            long t0 = System.nanoTime();
            r = f.get();
            double ms = (System.nanoTime() - t0) / 1e6;
            if (ms < mejor) mejor = ms;
        }
        System.out.println("RES," + prueba + "," + tam + ",cpu," + mejor + "," + h.apply(r) + ",f64");
    }
    static double suma(INDArray a) { return a.sumNumber().doubleValue(); }

    public static void main(String[] args) {
        boolean chica = args.length > 0 && args[0].equals("chica");
        int[] ns = chica ? new int[] {128, 256} : new int[] {1024, 2048};
        int nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024;
        Nd4j.setDefaultDataTypes(DataType.DOUBLE, DataType.DOUBLE);
        for (int n : ns) {
            double[] a = new double[n * n], b = new double[n * n];
            for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
                a[i * n + j] = ((i * 7 + j * 3) % 13) / 13.0 - 0.5;
                b[i * n + j] = ((i * 5 + j * 11) % 17) / 17.0 - 0.5;
            }
            INDArray A = Nd4j.create(a, new long[] {n, n}, 'c'), B = Nd4j.create(b, new long[] {n, n}, 'c');
            medir("matmul", String.valueOf(n), () -> A.mmul(B), Nd4jBench::suma);
        }
        double[] xs = new double[nv];
        for (int i = 0; i < nv; i++) xs[i] = (i % 1000) / 1000.0;
        INDArray x = Nd4j.create(xs, new long[] {nv}, 'c');
        medir("seno", String.valueOf(nv), () -> Transforms.sin(x, true), Nd4jBench::suma);
        medir("x*2+1", String.valueOf(nv), () -> x.mul(2.0).addi(1.0), Nd4jBench::suma);
        medir("suma", String.valueOf(nv), () -> x.sum(), Nd4jBench::suma);
        double[] ss = new double[sm * sk];
        for (int i = 0; i < sm; i++) for (int j = 0; j < sk; j++) ss[i * sk + j] = ((i * 3 + j) % 50) / 10.0;
        INDArray S = Nd4j.create(ss, new long[] {sm, sk}, 'c');
        medir("softmax", sm + "x" + sk, () -> {
            INDArray m = S.max(1).reshape(sm, 1);
            INDArray e = Transforms.exp(S.subColumnVector(m), false);
            return e.diviColumnVector(e.sum(1).reshape(sm, 1));
        }, y -> suma(y.mul(y)));
    }
}
