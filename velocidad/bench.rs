use std::time::Instant;
fn fib(n: i64) -> i64 { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fn criba(n: usize) -> i64 {
    let mut marca = vec![true; n + 1]; marca[0] = false; marca[1] = false;
    let mut i = 2;
    while i * i <= n { if marca[i] { let mut j = i * i; while j <= n { marca[j] = false; j += i; } } i += 1; }
    marca.iter().filter(|&&m| m).count() as i64
}
fn mandelbrot(ancho: i32, alto: i32, max_iter: i32) -> i64 {
    let mut dentro = 0;
    for py in 0..alto { for px in 0..ancho {
        let cr = (px as f64 / ancho as f64) * 3.5 - 2.5; let ci = (py as f64 / alto as f64) * 2.0 - 1.0;
        let (mut zr, mut zi, mut k) = (0.0f64, 0.0f64, 0);
        while k < max_iter && zr * zr + zi * zi <= 4.0 { let t = zr * zr - zi * zi + cr; zi = 2.0 * zr * zi + ci; zr = t; k += 1; }
        if k == max_iter { dentro += 1; }
    } }
    dentro
}
fn medir(nombre: &str, f: impl Fn() -> i64) { let t0 = Instant::now(); let r = f(); println!("{} = {} en {:.0} ms", nombre, r, t0.elapsed().as_secs_f64() * 1000.0); }
fn main() {
    medir("fib(30)", || fib(30));
    medir("criba(2000000)", || criba(2_000_000));
    medir("mandelbrot(400x300x200)", || mandelbrot(400, 300, 200));
}
