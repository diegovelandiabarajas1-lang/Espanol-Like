// (motor-exp N2) Calcula unas cuantas cosas de numerico con el bundle que se le
// pase y las escribe en JSON: fourier (potencia de dos y no), la inversa,
// espectro, convolución, «por» y aritmética de arreglos. pruebas/exp-nen-gpu.js
// lo corre con el LTS (motor/bundle.js) y con motor-exp en cada dispositivo, y
// exige los mismos números al bit: pasar por los núcleos no cambia nada.
const b = process.argv[2];
require(b);
const EL = globalThis.EspanolLike;
const m = EL.crearMotor({ salida: () => {}, host: {}, limiteInstr: 1e12 });
const vm = m.vm, G = n => vm.globals.get(EL.nombreGlobalModulo(EL.claveEdsl('numerico'), n)) ;
G('semilla').fn([3], vm);
const x = G('azarArreglo').fn([vm.nuevaLista([65536])], vm), y = G('azarArreglo').fn([vm.nuevaLista([50000])], vm);
const A = G('azarArreglo').fn([vm.nuevaLista([200, 300])], vm), B = G('azarArreglo').fn([vm.nuevaLista([300, 100])], vm);
const out = {};
const pl = a => Array.from(a.datos);
out.f2 = pl(G('fourier').fn([x], vm)); out.fn = pl(G('fourier').fn([y], vm));
out.fi = pl(G('fourierInversa').fn([G('fourier').fn([x], vm)], vm));
out.es = pl(G('espectro').fn([y], vm)); out.cv = pl(G('convolucion').fn([y, x], vm));
out.por = pl(G('por').fn([A, B], vm));
out.ar = pl(vm.arrArit(vm.arrArit(x, 2, '*'), 1, '+')); out.dv = pl(vm.arrArit(x, vm.arrArit(x, 1, '+'), '/'));
process.stdout.write(JSON.stringify(out));
