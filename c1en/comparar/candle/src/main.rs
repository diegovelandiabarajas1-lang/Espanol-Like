// comparar/candle/src/main.rs — las pruebas con Candle, en CPU y (con la
// característica «cuda») en la GPU. Float64 en los dos. Candle no trae FFT:
// esa prueba no está. El softmax se escribe con sus operaciones (máximo por fila,
// restar, exp, dividir por la suma), que es como lo hace candle-nn por dentro.
use candle_core::{DType, Device, Result, Tensor};
use std::time::Instant;

fn medir<F: Fn() -> Result<Tensor>, H: Fn(&Tensor) -> Result<f64>>(
    prueba: &str, tam: &str, disp: &str, dev: &Device, f: F, h: H,
) -> Result<()> {
    let mut r = f()?;
    dev.synchronize()?;
    let mut mejor = f64::INFINITY;
    for _ in 0..3 {
        let t0 = Instant::now();
        r = f()?;
        dev.synchronize()?;
        let ms = t0.elapsed().as_secs_f64() * 1e3;
        if ms < mejor { mejor = ms; }
    }
    println!("RES,{},{},{},{:.6},{:e},f64", prueba, tam, disp, mejor, h(&r)?);
    Ok(())
}

fn suma(t: &Tensor) -> Result<f64> { t.sum_all()?.to_dtype(DType::F64)?.to_scalar::<f64>() }

fn pruebas(dev: &Device, disp: &str, chica: bool) -> Result<()> {
    let ns: Vec<usize> = if chica { vec![128, 256] } else { vec![1024, 2048] };
    let (nv, sm, sk) = if chica { (65536usize, 256usize, 1024usize) } else { (1usize << 24, 4096, 1024) };
    for &n in &ns {
        let mut a = vec![0f64; n * n];
        let mut b = vec![0f64; n * n];
        for i in 0..n { for j in 0..n {
            a[i * n + j] = ((i * 7 + j * 3) % 13) as f64 / 13.0 - 0.5;
            b[i * n + j] = ((i * 5 + j * 11) % 17) as f64 / 17.0 - 0.5;
        } }
        let a = Tensor::from_vec(a, (n, n), dev)?;
        let b = Tensor::from_vec(b, (n, n), dev)?;
        medir("matmul", &n.to_string(), disp, dev, || a.matmul(&b), suma)?;
    }
    let x: Vec<f64> = (0..nv).map(|i| (i % 1000) as f64 / 1000.0).collect();
    let x = Tensor::from_vec(x, nv, dev)?;
    medir("seno", &nv.to_string(), disp, dev, || x.sin(), suma)?;
    medir("x*2+1", &nv.to_string(), disp, dev, || x.affine(2.0, 1.0), suma)?;
    medir("suma", &nv.to_string(), disp, dev, || x.sum_all(), |s| s.to_scalar::<f64>())?;
    let mut s = vec![0f64; sm * sk];
    for i in 0..sm { for j in 0..sk { s[i * sk + j] = ((i * 3 + j) % 50) as f64 / 10.0; } }
    let s = Tensor::from_vec(s, (sm, sk), dev)?;
    medir("softmax", &format!("{}x{}", sm, sk), disp, dev, || {
        let m = s.max_keepdim(1)?;
        let e = s.broadcast_sub(&m)?.exp()?;
        e.broadcast_div(&e.sum_keepdim(1)?)
    }, |y| suma(&(y * y)?))?;
    Ok(())
}

fn main() -> Result<()> {
    let chica = std::env::args().nth(1).map(|a| a == "chica").unwrap_or(false);
    // SOLO=cpu o SOLO=gpu: el cuaderno reparte CPU y GPU en dos máquinas
    let solo = std::env::var("SOLO").unwrap_or_default();
    if solo != "gpu" { pruebas(&Device::Cpu, "cpu", chica)?; }
    #[cfg(feature = "cuda")]
    if solo != "cpu" {
        match Device::new_cuda(0) {
            Ok(dev) => pruebas(&dev, "gpu", chica)?,
            Err(e) => println!("# sin GPU para Candle: {}", e),
        }
    }
    Ok(())
}
