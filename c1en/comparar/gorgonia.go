// comparar/gorgonia.go — las pruebas con Gorgonia (el paquete «tensor»), en Go, CPU.
//   go mod init comparar && go get gorgonia.org/tensor && go run gorgonia.go [chica]
// matmul con tensor.MatMul (BLAS de gonum, en Go), x*2+1 con tensor.Mul/Add,
// suma con tensor.Sum y seno con Apply(math.Sin): el paquete no trae seno propio.
// Softmax con bucles de Go sobre los datos del tensor (tensor no difunde una
// columna contra una matriz). Gorgonia no trae FFT: esa prueba no está.
package main

import (
	"fmt"
	"math"
	"os"
	"time"

	"gorgonia.org/tensor"
)

func valor(t tensor.Tensor) float64 {
	switch v := t.Data().(type) {
	case float64:
		return v
	case []float64:
		return v[0]
	}
	panic(fmt.Sprintf("valor: tipo %T", t.Data()))
}

func sumaDe(t tensor.Tensor) float64 {
	s, err := tensor.Sum(t)
	if err != nil {
		panic(err)
	}
	return valor(s)
}

func medir(prueba, tam string, f func() tensor.Tensor, h func(tensor.Tensor) float64) {
	r := f()
	mejor := math.Inf(1)
	for k := 0; k < 3; k++ {
		t0 := time.Now()
		r = f()
		ms := float64(time.Since(t0).Nanoseconds()) / 1e6
		if ms < mejor {
			mejor = ms
		}
	}
	fmt.Printf("RES,%s,%s,cpu,%.6f,%.17g,f64\n", prueba, tam, mejor, h(r))
}

func debe(t tensor.Tensor, err error) tensor.Tensor {
	if err != nil {
		panic(err)
	}
	return t
}

func main() {
	chica := len(os.Args) > 1 && os.Args[1] == "chica"
	ns := []int{1024, 2048}
	nv, sm, sk := 16777216, 4096, 1024
	if chica {
		ns = []int{128, 256}
		nv, sm = 65536, 256
	}
	for _, n := range ns {
		a := make([]float64, n*n)
		b := make([]float64, n*n)
		for i := 0; i < n; i++ {
			for j := 0; j < n; j++ {
				a[i*n+j] = float64((i*7+j*3)%13)/13.0 - 0.5
				b[i*n+j] = float64((i*5+j*11)%17)/17.0 - 0.5
			}
		}
		A := tensor.New(tensor.WithShape(n, n), tensor.WithBacking(a))
		B := tensor.New(tensor.WithShape(n, n), tensor.WithBacking(b))
		medir("matmul", fmt.Sprint(n), func() tensor.Tensor { return debe(tensor.MatMul(A, B)) }, sumaDe)
	}
	xs := make([]float64, nv)
	for i := range xs {
		xs[i] = float64(i%1000) / 1000.0
	}
	x := tensor.New(tensor.WithShape(nv), tensor.WithBacking(xs))
	medir("seno", fmt.Sprint(nv), func() tensor.Tensor { return debe(x.Apply(math.Sin)) }, sumaDe)
	medir("x*2+1", fmt.Sprint(nv), func() tensor.Tensor {
		return debe(tensor.Add(debe(tensor.Mul(x, 2.0)), 1.0))
	}, sumaDe)
	medir("suma", fmt.Sprint(nv), func() tensor.Tensor { return debe(tensor.Sum(x)) }, valor)

	ss := make([]float64, sm*sk)
	for i := 0; i < sm; i++ {
		for j := 0; j < sk; j++ {
			ss[i*sk+j] = float64((i*3+j)%50) / 10.0
		}
	}
	S := tensor.New(tensor.WithShape(sm, sk), tensor.WithBacking(ss))
	medir("softmax", fmt.Sprintf("%dx%d", sm, sk), func() tensor.Tensor {
		d := S.Data().([]float64)
		y := make([]float64, sm*sk)
		for i := 0; i < sm; i++ {
			f, o := d[i*sk:(i+1)*sk], y[i*sk:(i+1)*sk]
			m := f[0]
			for _, v := range f[1:] {
				if v > m {
					m = v
				}
			}
			t := 0.0
			for j, v := range f {
				o[j] = math.Exp(v - m)
				t += o[j]
			}
			for j := range o {
				o[j] /= t
			}
		}
		return tensor.New(tensor.WithShape(sm, sk), tensor.WithBacking(y))
	}, func(r tensor.Tensor) float64 { return sumaDe(debe(tensor.Mul(r, r))) })
}
