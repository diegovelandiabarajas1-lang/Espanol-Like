require('./bundle.js');
const { crearMotor } = globalThis.EspanolLike;
const run=(src,o)=>{const out=[];const m=crearMotor(Object.assign({salida:s=>out.push(s),limiteInstr:5e8},o||{}));
  const r=m.ejecutar(src);return{r,out:out.join('\n'),m};};

console.log('── SONDA 1: ¿el GC recolecta objetos que una nativa tiene en la mano? ──');
// mapear construye un array JS de resultados que NO es raíz del GC.
// Si una recolección salta a mitad, esos objetos podrían desaparecer.
const s1=`var r = mapear(rango(0, 20000), fn(x) { devolver [x, x, x] })
imprimir(longitud(r))
var malos = 0
para i en rango(longitud(r)) { si longitud(r[i]) != 3 { malos = malos + 1 } }
imprimir("elementos corruptos:", malos)
imprimir("recolecciones:", memoria().recolecciones)`;
const a=run(s1); console.log(a.r.ok?a.out:'ERROR '+a.r.errores.map(e=>e.message).join(';'));

console.log('\n── SONDA 2: igualdad de estructuras cíclicas ──');
const s2=`var a = [1]
var b = [1]
a[0] = a
b[0] = b
imprimir(a == b)`;
let t0=Date.now();
try{ const c=run(s2); console.log(c.r.ok?('resultado: '+c.out):('ERROR: '+c.r.errores.map(e=>e.message).join(';'))); }
catch(e){ console.log('💥 EXCEPCIÓN NO CAPTURADA:', e.message.slice(0,90)); }
console.log('tardó', Date.now()-t0, 'ms');

console.log('\n── SONDA 3: impresión de estructura cíclica ──');
try{ const c=run(`var a = [1]  a[0] = a  imprimir(a)`); console.log(c.r.ok?('resultado: '+c.out.slice(0,70)):('ERROR: '+c.r.errores[0].message)); }
catch(e){ console.log('💥 EXCEPCIÓN:', e.message.slice(0,90)); }

console.log('\n── SONDA 4: coste de la tabla de constantes (¿es O(n²)?) ──');
for(const n of [500,1000,2000,4000]){
  const src = Array.from({length:n},(_,i)=>`var v${i} = ${i}.5`).join('\n');
  const m=crearMotor({salida:()=>{}});
  const t=process.hrtime.bigint(); m.analizar(src); const ms=Number(process.hrtime.bigint()-t)/1e6;
  console.log(`  ${String(n).padStart(5)} constantes → ${ms.toFixed(1).padStart(7)} ms`);
}

console.log('\n── SONDA 5: coste de crear un motor (el IDE lo hace en cada tecla) ──');
let t=process.hrtime.bigint();
for(let i=0;i<200;i++) crearMotor({salida:()=>{}});
console.log(`  200 motores → ${(Number(process.hrtime.bigint()-t)/1e6).toFixed(0)} ms (${(Number(process.hrtime.bigint()-t)/1e6/200).toFixed(2)} ms cada uno)`);
console.log(`  cada uno reserva un array de 65.536 posiciones`);

console.log('\n── SONDA 6: ¿el límite de instrucciones detiene a las nativas? ──');
t=process.hrtime.bigint();
const s6=run(`var A = matriz(220, 220, 1.5)
imprimir(longitud(multMatriz(A, A)))`,{limiteInstr:1000});
console.log(`  límite de 1000 instrucciones, multMatriz 220×220 → ${s6.r.ok?'COMPLETÓ':'detenido'} en ${(Number(process.hrtime.bigint()-t)/1e6).toFixed(0)} ms`);
console.log(`  (si completó, el límite no protege contra nativas costosas)`);

console.log('\n── SONDA 7: profundidad de recursión real antes del límite ──');
const s7=run(`fn hondo(n) { si n <= 0 { devolver 0 }  devolver 1 + hondo(n - 1) }
imprimir(hondo(880))`,{jit:false});
console.log('  sin JIT, 880 niveles:', s7.r.ok?s7.out:('detenido → '+s7.r.errores[0].message.slice(0,60)));
const s7b=run(`fn hondo(n) { si n <= 0 { devolver 0 }  devolver 1 + hondo(n - 1) }
imprimir(hondo(880))`,{umbralJIT:2});
console.log('  con JIT, 880 niveles:', s7b.r.ok?s7b.out:('detenido → '+s7b.r.errores[0].message.slice(0,60)));
