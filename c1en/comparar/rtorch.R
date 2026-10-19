# comparar/rtorch.R — las seis pruebas con torch para R (mlverse), en CPU y en GPU.
#   Rscript rtorch.R [chica]
# torch de R es libtorch (lo mismo que PyTorch por debajo) con la interfaz de R.
# Float64; en la GPU se espera con cuda_synchronize().
suppressMessages(library(torch))
args <- commandArgs(trailingOnly = TRUE)
chica <- length(args) > 0 && args[1] == "chica"
NS <- if (chica) c(128, 256) else c(1024, 2048)
NV <- if (chica) 65536 else 2^24; SM <- if (chica) 256 else 4096; SK <- 1024; NF <- if (chica) 16384 else 2^20

medir <- function(prueba, tam, disp, f, h, sinc) {
  r <- f(); sinc()
  mejor <- Inf
  for (k in 1:3) {
    t0 <- Sys.time(); r <- f(); sinc()
    mejor <- min(mejor, as.numeric(difftime(Sys.time(), t0, units = "secs")) * 1000)
  }
  cat(sprintf("RES,%s,%s,%s,%.6f,%.17g,f64\n", prueba, tam, disp, mejor, as.numeric(h(r)$item())))
}

pruebas <- function(dev, disp, sinc) {
  for (n in NS) {
    i <- torch_arange(0, n - 1, device = dev, dtype = torch_float64())$view(c(-1, 1))
    j <- torch_arange(0, n - 1, device = dev, dtype = torch_float64())$view(c(1, -1))
    A <- torch_remainder(i * 7 + j * 3, 13) / 13 - 0.5
    B <- torch_remainder(i * 5 + j * 11, 17) / 17 - 0.5
    medir("matmul", format(n, scientific = FALSE), disp, function() torch_matmul(A, B), function(C) C$sum(), sinc)
  }
  x <- torch_remainder(torch_arange(0, NV - 1, device = dev, dtype = torch_float64()), 1000) / 1000
  medir("seno", format(NV, scientific = FALSE), disp, function() torch_sin(x), function(y) y$sum(), sinc)
  medir("x*2+1", format(NV, scientific = FALSE), disp, function() x * 2 + 1, function(y) y$sum(), sinc)
  medir("suma", format(NV, scientific = FALSE), disp, function() x$sum(), function(s) s, sinc)
  i <- torch_arange(0, SM - 1, device = dev, dtype = torch_float64())$view(c(-1, 1))
  j <- torch_arange(0, SK - 1, device = dev, dtype = torch_float64())$view(c(1, -1))
  S <- torch_remainder(i * 3 + j, 50) / 10
  medir("softmax", sprintf("%dx%d", SM, SK), disp, function() nnf_softmax(S, dim = 2), function(Y) (Y * Y)$sum(), sinc)
  xf <- torch_remainder(torch_arange(0, NF - 1, device = dev, dtype = torch_float64()), 1000) / 1000
  medir("fft", format(NF, scientific = FALSE), disp, function() torch_fft_fft(xf), function(X) X$abs()$sum(), sinc)
}

cat("# torch para R", as.character(packageVersion("torch")), "\n")
SOLO <- Sys.getenv("SOLO")          # "cpu" o "gpu": el cuaderno reparte CPU y GPU en dos máquinas
if (SOLO != "gpu") pruebas(torch_device("cpu"), "cpu", function() invisible(NULL))
if (SOLO != "cpu" && cuda_is_available()) pruebas(torch_device("cuda"), "gpu", function() cuda_synchronize())
