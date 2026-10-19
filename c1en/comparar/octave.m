% comparar/octave.m — las seis pruebas en GNU Octave (CPU).
%   octave-cli --no-gui octave.m [chica]
% Octave EN LUGAR DE MATLAB: MATLAB necesita licencia y no se puede instalar en
% Kaggle. Es el mismo lenguaje y este mismo archivo corre en MATLAB tal cual,
% pero los tiempos son los de Octave (con OpenBLAS para A*B y FFTW para fft), no
% los de MATLAB. Sin Parallel Computing Toolbox: solo CPU (en MATLAB con la
% toolbox, A y B irían con gpuArray).
args = argv();
chica = numel(args) > 0 && strcmp(args{1}, 'chica');
if chica
  ns = [128 256]; nv = 65536; sm = 256; nf = 16384;
else
  ns = [1024 2048]; nv = 16777216; sm = 4096; nf = 1048576;
end
sk = 1024;

function medir(prueba, tam, f, h)
  r = f();
  mejor = Inf;
  for k = 1:3
    t0 = tic(); r = f(); t = toc(t0) * 1000;
    mejor = min(mejor, t);
  end
  printf('RES,%s,%s,cpu,%.6f,%.17g,f64\n', prueba, tam, mejor, h(r));
  fflush(stdout);
end

for n = ns
  [j, i] = meshgrid(0:n-1, 0:n-1);          % i fila, j columna
  A = mod(i * 7 + j * 3, 13) / 13 - 0.5;
  B = mod(i * 5 + j * 11, 17) / 17 - 0.5;
  medir('matmul', sprintf('%d', n), @() A * B, @(C) sum(C(:)));
end
x = mod(0:nv-1, 1000)' / 1000;
medir('seno', sprintf('%d', nv), @() sin(x), @(y) sum(y));
medir('x*2+1', sprintf('%d', nv), @() x * 2 + 1, @(y) sum(y));
medir('suma', sprintf('%d', nv), @() sum(x), @(s) s);
[j, i] = meshgrid(0:sk-1, 0:sm-1);
S = mod(i * 3 + j, 50) / 10;
function Y = softmaxFilas(S)
  E = exp(S - max(S, [], 2));
  Y = E ./ sum(E, 2);
end
medir('softmax', sprintf('%dx%d', sm, sk), @() softmaxFilas(S), @(Y) sum(Y(:) .^ 2));
xf = mod(0:nf-1, 1000)' / 1000;
medir('fft', sprintf('%d', nf), @() fft(xf), @(X) sum(abs(X)));
