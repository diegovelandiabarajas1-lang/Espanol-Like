// comparar/torchsharp/Program.cs — las seis pruebas con TorchSharp (C#, .NET), en CPU y GPU.
//   dotnet run -c Release -- [chica]
// TorchSharp es libtorch (lo de PyTorch) para .NET. Float64. Para esperar a la
// GPU se lee un número del resultado (.item), que obliga a terminar el trabajo:
// cuesta una copia de 8 bytes.
using System;
using System.Diagnostics;
using TorchSharp;
using static TorchSharp.torch;

bool chica = args.Length > 0 && args[0] == "chica";
long[] ns = chica ? new long[] { 128, 256 } : new long[] { 1024, 2048 };
long nv = chica ? 65536 : 16777216, sm = chica ? 256 : 4096, sk = 1024, nf = chica ? 16384 : 1048576;
Console.WriteLine($"# TorchSharp · CUDA {torch.cuda.is_available()}");

void Medir(string prueba, string tam, string disp, Func<Tensor> f, Func<Tensor, double> h)
{
    // en la GPU, leer un elemento del resultado obliga a esperar a que termine
    void Esperar(Tensor t) { if (disp == "gpu") t.reshape(-1)[0].item<double>(); }
    var r = f(); Esperar(r);
    double mejor = double.PositiveInfinity;
    for (int k = 0; k < 3; k++)
    {
        r.Dispose();
        var sw = Stopwatch.StartNew(); r = f(); Esperar(r); sw.Stop();
        mejor = Math.Min(mejor, sw.Elapsed.TotalMilliseconds);
    }
    Console.WriteLine(FormattableString.Invariant($"RES,{prueba},{tam},{disp},{mejor:F6},{h(r):R},f64"));
    r.Dispose();
}

void Pruebas(Device dev, string disp)
{
    using var _ = torch.NewDisposeScope();
    foreach (var n in ns)
    {
        var i = torch.arange(n, dtype: ScalarType.Float64, device: dev).view(-1, 1);
        var j = torch.arange(n, dtype: ScalarType.Float64, device: dev).view(1, -1);
        var A = (i * 7 + j * 3).remainder(13) / 13 - 0.5;
        var B = (i * 5 + j * 11).remainder(17) / 17 - 0.5;
        Medir("matmul", n.ToString(), disp, () => A.matmul(B), C => C.sum().item<double>());
    }
    var x = torch.arange(nv, dtype: ScalarType.Float64, device: dev).remainder(1000) / 1000;
    Medir("seno", nv.ToString(), disp, () => x.sin(), y => y.sum().item<double>());
    Medir("x*2+1", nv.ToString(), disp, () => x * 2 + 1, y => y.sum().item<double>());
    Medir("suma", nv.ToString(), disp, () => x.sum(), s => s.item<double>());
    var si = torch.arange(sm, dtype: ScalarType.Float64, device: dev).view(-1, 1);
    var sj = torch.arange(sk, dtype: ScalarType.Float64, device: dev).view(1, -1);
    var S = (si * 3 + sj).remainder(50) / 10;
    Medir("softmax", $"{sm}x{sk}", disp, () => torch.nn.functional.softmax(S, 1), Y => (Y * Y).sum().item<double>());
    var xf = torch.arange(nf, dtype: ScalarType.Float64, device: dev).remainder(1000) / 1000;
    Medir("fft", nf.ToString(), disp, () => torch.fft.fft(xf), X => X.abs().sum().item<double>());
}

// SOLO=cpu o SOLO=gpu: el cuaderno reparte CPU y GPU en dos máquinas
var solo = Environment.GetEnvironmentVariable("SOLO") ?? "";
if (solo != "gpu") Pruebas(torch.CPU, "cpu");
if (solo != "cpu" && torch.cuda.is_available()) Pruebas(torch.CUDA, "gpu");
