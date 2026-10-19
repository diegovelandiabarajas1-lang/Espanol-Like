// comparar/eigen.cpp — las seis pruebas con Eigen (C++, CPU).
//   g++ -O3 -march=native -fopenmp -I/usr/include/eigen3 eigen.cpp -o eigen && ./eigen [chica]
// Eigen usa OpenMP en el producto de matrices; seno, x*2+1 y suma van vectorizados
// en un hilo (así es Eigen: sus expresiones elemento a elemento no se reparten).
// La FFT es la del módulo «unsupported» de Eigen (kissfft por dentro).
#include <Eigen/Dense>
#include <unsupported/Eigen/FFT>
#include <chrono>
#include <complex>
#include <cstdio>
#include <cstring>
#include <vector>
#include <string>
using namespace Eigen;
using Reloj = std::chrono::steady_clock;

template <class F, class H>
void medir(const char* prueba, const std::string& tam, F f, H h) {
  auto r = f();
  double mejor = 1e300;
  for (int k = 0; k < 3; k++) {
    auto t0 = Reloj::now();
    r = f();
    double ms = std::chrono::duration<double, std::milli>(Reloj::now() - t0).count();
    if (ms < mejor) mejor = ms;
  }
  std::printf("RES,%s,%s,cpu,%.6f,%.17g,f64\n", prueba, tam.c_str(), mejor, (double)h(r));
  std::fflush(stdout);
}

int main(int argc, char** argv) {
  bool chica = argc > 1 && std::strcmp(argv[1], "chica") == 0;
  std::vector<int> ns = chica ? std::vector<int>{128, 256} : std::vector<int>{1024, 2048};
  long nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024, nf = chica ? 16384 : 1048576;

  for (int n : ns) {
    MatrixXd A(n, n), B(n, n);
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
      A(i, j) = ((i * 7 + j * 3) % 13) / 13.0 - 0.5;
      B(i, j) = ((i * 5 + j * 11) % 17) / 17.0 - 0.5;
    }
    medir("matmul", std::to_string(n), [&] { MatrixXd C(n, n); C.noalias() = A * B; return C; },
          [](const MatrixXd& C) { return C.sum(); });
  }
  VectorXd x(nv);
  for (long i = 0; i < nv; i++) x(i) = (i % 1000) / 1000.0;
  medir("seno", std::to_string(nv), [&] { VectorXd y = x.array().sin().matrix(); return y; }, [](const VectorXd& y) { return y.sum(); });
  medir("x*2+1", std::to_string(nv), [&] { VectorXd y = (x.array() * 2.0 + 1.0).matrix(); return y; }, [](const VectorXd& y) { return y.sum(); });
  medir("suma", std::to_string(nv), [&] { return x.sum(); }, [](double s) { return s; });

  Matrix<double, Dynamic, Dynamic, RowMajor> S(sm, sk);
  for (long i = 0; i < sm; i++) for (long j = 0; j < sk; j++) S(i, j) = ((i * 3 + j) % 50) / 10.0;
  medir("softmax", std::to_string(sm) + "x" + std::to_string(sk), [&] {
    Array<double, Dynamic, Dynamic, RowMajor> E = (S.array().colwise() - S.array().rowwise().maxCoeff()).exp();
    Array<double, Dynamic, 1> s = E.rowwise().sum();
    E.colwise() /= s;
    return E;
  }, [](const Array<double, Dynamic, Dynamic, RowMajor>& Y) { return (Y * Y).sum(); });

  std::vector<double> xf(nf);
  for (long i = 0; i < nf; i++) xf[i] = (i % 1000) / 1000.0;
  FFT<double> fft;
  medir("fft", std::to_string(nf), [&] { std::vector<std::complex<double>> X; fft.fwd(X, xf); return X; },
        [](const std::vector<std::complex<double>>& X) { double s = 0; for (auto& c : X) s += std::abs(c); return s; });
  return 0;
}
