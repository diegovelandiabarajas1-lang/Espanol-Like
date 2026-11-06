#!/usr/bin/env python3
# grupo_f.py — benchmarks de arranque, archivos y casos reales (grupo F), escritos a mano en C, JavaScript, Python y Ñ.
# Cada programa se corre como PROCESO COMPLETO: el tiempo incluye el arranque. Se mide tiempo de pared y memoria pico (wait4).
import os, sys, json, time, subprocess, threading, signal, shutil

V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = os.path.expanduser('~')
D = f'{H}/fdat'; os.makedirs(D, exist_ok=True)
NODE_N = f'{H}/pjs/motor-exp/util/n-node.js'
COMP_N = f'{H}/pjs/motor-exp/util/n-compilar.js'
N_LIN = 3000000

SRC = {}
# ── hola ──
SRC['f86_hola'] = {
 'c': '#include <stdio.h>\nint main(void){ puts("hola"); return 0; }\n',
 'js': 'console.log("hola");\n', 'py': 'print("hola")\n', 'esl': 'imprimir("hola")\n'}
# ── arranque con una estructura grande (10M de enteros) ──
SRC['f87_arranque_estructura'] = {
 'c': '#include <stdio.h>\n#include <stdlib.h>\nint main(void){ long long n=10000000; long long* a=(long long*)malloc(n*8); for(long long i=0;i<n;i++) a[i]=i; long long s=0; for(long long i=0;i<n;i++) s+=a[i]%7; printf("%lld\\n", s); return 0; }\n',
 'js': 'const n=10000000; const a=new Float64Array(n); for(let i=0;i<n;i++) a[i]=i; let s=0; for(let i=0;i<n;i++) s+=a[i]%7; console.log(s);\n',
 'py': 'n=10000000\na=[0]*n\nfor i in range(n): a[i]=i\ns=0\nfor i in range(n): s+=a[i]%7\nprint(s)\n',
 'esl': 'fn nueva(n) {\n  var a = []\n  var i = 0\n  mientras i < n { agregar(a, 0)  i = i + 1 }\n  devolver a\n}\nfn principal() {\n  fijo n = 10000000\n  var a = nueva(n)\n  var i = 0.0\n  mientras i < n { a[i] = i  i = i + 1 }\n  var s = 0.0\n  i = 0.0\n  mientras i < n { s = s + a[i] % 7  i = i + 1 }\n  devolver s\n}\nimprimir(principal())\n'}
# ── escribir 3M de líneas ──
SRC['f88_escribir_archivo'] = {
 'c': '#include <stdio.h>\nint main(int c, char** v){ FILE* f=fopen(v[1],"w"); for(long long i=0;i<%d;i++) fprintf(f,"%%lld\\n",i); fclose(f); printf("ok\\n"); return 0; }\n' % N_LIN,
 'js': 'const fs=require("fs"); const r=process.argv[2]; fs.writeFileSync(r,""); for(let i=0;i<%d;i+=10000){ const t=[]; for(let j=0;j<10000;j++) t.push(i+j); fs.appendFileSync(r,t.join("\\n")+"\\n"); } console.log("ok");\n' % N_LIN,
 'py': 'import sys\nr=sys.argv[1]\nwith open(r,"w") as f:\n    for i in range(0,%d,10000):\n        f.write("\\n".join(str(i+j) for j in range(10000))+"\\n")\nprint("ok")\n' % N_LIN,
 'esl': 'usar unir de "texto"\nfn principal(ruta) {\n  escribirTexto(ruta, "")\n  var i = 0\n  mientras i < %d {\n    var trozo = []\n    var j = 0\n    mientras j < 10000 { agregar(trozo, texto(i + j))  j = j + 1 }\n    agregarTexto(ruta, unir(trozo, "\\n") + "\\n")\n    i = i + 10000\n  }\n  imprimir("ok")\n}\nfijo args = argumentos()\nprincipal(args[0])\n' % N_LIN}
# ── leer línea a línea (stdin) y sumar ──
SRC['f89_leer_archivo'] = {
 'c': '#include <stdio.h>\n#include <stdlib.h>\nint main(void){ char* l=NULL; size_t cap=0; long long s=0; while(getline(&l,&cap,stdin)>0) s+=atoll(l)%7; printf("%lld\\n", s); return 0; }\n',
 'js': 'const fs=require("fs"); const ls=fs.readFileSync(0,"utf8").split("\\n"); let s=0; for(const l of ls){ if(l!=="") s+=parseInt(l)%7; } console.log(s);\n',
 'py': 'import sys\ns=0\nfor l in sys.stdin:\n    s+=int(l)%7\nprint(s)\n',
 'esl': 'fn principal() {\n  var s = 0.0\n  var l = leerLinea()\n  mientras l != nulo { s = s + entero(l) % 7  l = leerLinea() }\n  devolver s\n}\nimprimir(principal())\n'}
# ── CSV: id,valor,nombre ──
SRC['f90_csv'] = {
 'c': '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(void){ char* l=NULL; size_t cap=0; long long s=0; while(getline(&l,&cap,stdin)>0){ char* p=strchr(l,\',\'); s+=atoll(p+1)%%7; } printf("%lld\\n", s); return 0; }\n'.replace('%%', '%'),
 'js': 'const fs=require("fs"); const ls=fs.readFileSync(0,"utf8").split("\\n"); let s=0; for(const l of ls){ if(l==="") continue; const c=l.split(","); s+=parseInt(c[1])%7; } console.log(s);\n',
 'py': 'import sys\ns=0\nfor l in sys.stdin:\n    c=l.split(",")\n    s+=int(c[1])%7\nprint(s)\n',
 'esl': 'usar dividir de "texto"\nfn principal() {\n  var s = 0.0\n  var l = leerLinea()\n  mientras l != nulo { fijo c = dividir(l, ",")  s = s + entero(c[1]) % 7  l = leerLinea() }\n  devolver s\n}\nimprimir(principal())\n'}
# ── serializar 300k enteros a JSON ──
SRC['f93_json_serializar'] = {
 'c': '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(void){ char* b=(char*)malloc(8000000); size_t n=0; b[n++]=\'[\'; for(long long i=0;i<300000;i++){ if(i) b[n++]=\',\'; n+=sprintf(b+n,"%lld",i*3); } b[n++]=\']\'; printf("%zu\\n", n); return 0; }\n',
 'js': 'const a=[]; for(let i=0;i<300000;i++) a.push(i*3); console.log(JSON.stringify(a).length);\n',
 'py': 'import json\na=[i*3 for i in range(300000)]\nprint(len(json.dumps(a, separators=(",",":"))))\n',
 'esl': 'usar unir de "texto"\nfn principal() {\n  var xs = []\n  var i = 0\n  mientras i < 300000 { agregar(xs, texto(i * 3))  i = i + 1 }\n  fijo t = "[" + unir(xs, ",") + "]"\n  devolver longitud(t)\n}\nimprimir(principal())\n'}
# ── mixto 50/50: Collatz de 1..150000 (cómputo) y escribir un resumen por línea (E/S) ──
SRC['f100_mixto'] = {
 'c': '#include <stdio.h>\nint main(int c, char** v){ FILE* f=fopen(v[1],"w"); long long tot=0; for(long long i=1;i<=150000;i++){ long long x=i,p=0; while(x!=1){ x=(x%2==0)?x/2:3*x+1; p++; } tot+=p; fprintf(f,"%lld,%lld\\n",i,p); } fclose(f); printf("%lld\\n", tot); return 0; }\n',
 'js': 'const fs=require("fs"); const r=process.argv[2]; let tot=0; const t=[]; for(let i=1;i<=150000;i++){ let x=i,p=0; while(x!==1){ x=(x%2===0)?x/2:3*x+1; p++; } tot+=p; t.push(i+","+p); } fs.writeFileSync(r,t.join("\\n")+"\\n"); console.log(tot);\n',
 'py': 'import sys\nr=sys.argv[1]\ntot=0\nout=[]\nfor i in range(1,150001):\n    x=i;p=0\n    while x!=1:\n        x=x//2 if x%2==0 else 3*x+1\n        p+=1\n    tot+=p\n    out.append("%d,%d"%(i,p))\nopen(r,"w").write("\\n".join(out)+"\\n")\nprint(tot)\n',
 'esl': 'usar unir de "texto"\nfn principal(ruta) {\n  var tot = 0\n  var out = []\n  var i = 1\n  mientras i <= 150000 {\n    var x = i\n    var p = 0\n    mientras x != 1 { si x % 2 == 0 { x = x // 2 } sino { x = 3 * x + 1 }  p = p + 1 }\n    tot = tot + p\n    agregar(out, texto(i) + "," + texto(p))\n    i = i + 1\n  }\n  escribirTexto(ruta, unir(out, "\\n") + "\\n")\n  devolver tot\n}\nfijo args = argumentos()\nimprimir(principal(args[0]))\n'}

def correr(cmd, limite=120, stdin=None):
    t0 = time.perf_counter()
    f = open(stdin, 'rb') if stdin else subprocess.DEVNULL
    p = subprocess.Popen(cmd, stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE, preexec_fn=os.setsid)
    agotado = [False]
    def matar():
        agotado[0] = True
        try: os.killpg(os.getpgid(p.pid), signal.SIGKILL)
        except Exception: pass
    tm = threading.Timer(limite, matar); tm.start()
    eb = []
    th = threading.Thread(target=lambda: eb.append(p.stderr.read())); th.start()
    out = p.stdout.read(); th.join()
    _, st, ru = os.wait4(p.pid, 0)
    tm.cancel()
    seg = time.perf_counter() - t0
    rc = os.WEXITSTATUS(st) if os.WIFEXITED(st) else -os.WTERMSIG(st)
    return out.decode('utf8', 'replace').strip(), (eb[0] if eb else b'').decode('utf8', 'replace').strip(), rc, agotado[0], seg, ru.ru_maxrss / 1024.0

def preparar():
    for n, fuentes in SRC.items():
        os.makedirs(f'{D}/{n}', exist_ok=True)
        for ext, txt in fuentes.items():
            open(f'{D}/{n}/p.{ext}', 'w', encoding='utf8').write(txt)
        subprocess.run(['gcc', '-O2', '-o', f'{D}/{n}/c', f'{D}/{n}/p.c', '-lm'], check=True)
        r = subprocess.run(['node', COMP_N, f'{D}/{n}/p.esl', '-o', f'{D}/{n}/aot'], capture_output=True, text=True)
        if r.returncode != 0: print('AOT no compila', n, r.stdout[-300:], r.stderr[-300:])
        r = subprocess.run(['node', COMP_N, f'{D}/{n}/p.esl', '-o', f'{D}/{n}/aotsc', '--sin-comprobar'], capture_output=True, text=True)
    # datos de entrada
    subprocess.run([f'{D}/f88_escribir_archivo/c', f'{D}/lineas.txt'], check=True, capture_output=True)
    with open(f'{D}/datos.csv', 'w') as f:
        for i in range(1000000): f.write(f'{i},{i * 7 % 1000},nombre{i}\n')

LANGS = ['c', 'js', 'py', 'aot', 'aotsc', 'jit']
NOM = {'c': 'C', 'js': 'JS', 'py': 'Python', 'aot': 'AOT', 'aotsc': 'AOT-SC', 'jit': 'JIT'}
def cmd(n, l, arg):
    d = f'{D}/{n}'
    return {'c': [f'{d}/c'], 'js': ['node', f'{d}/p.js'], 'py': ['python3', f'{d}/p.py'], 'aot': [f'{d}/aot'], 'aotsc': [f'{d}/aotsc'], 'jit': ['node', NODE_N, f'{d}/p.esl']}[l] + arg

def main():
    preparar()
    res = {}
    entradas = {'f89_leer_archivo': f'{D}/lineas.txt', 'f90_csv': f'{D}/datos.csv'}
    salidas = {'f88_escribir_archivo': f'{D}/salida_88.txt', 'f100_mixto': f'{D}/salida_100.txt'}
    for n in SRC:
        res[n] = {}
        for l in LANGS:
            reps = 3 if l in ('c', 'js', 'aot', 'aotsc') else 1
            mejor = None
            for _ in range(reps):
                out, err, rc, ag, seg, mb = correr(cmd(n, l, [salidas[n]] if n in salidas else []), 100, entradas.get(n))
                if ag: mejor = {'estado': 'tiempo'}; break
                if rc != 0: mejor = {'estado': 'error', 'msg': (err or out).splitlines()[0][:100] if (err or out) else f'rc={rc}'}; break
                r = {'estado': 'ok', 'ms': round(seg * 1000), 'mb': round(mb, 1), 'valor': out.splitlines()[-1] if out else ''}
                if mejor is None or r['ms'] < mejor['ms']: mejor = r
            res[n][NOM[l]] = mejor
            print(f"{n:28} {NOM[l]:7} {mejor.get('estado'):7} {mejor.get('ms', ''):>7} {mejor.get('mb', ''):>7} {mejor.get('valor', mejor.get('msg', ''))}", flush=True)
    # tiempo de compilación y tamaño de binario
    comp = {}
    t0 = time.perf_counter(); subprocess.run(['gcc', '-O2', '-o', f'{D}/b22c', f'{V}/bench22.c', '-lm'], check=True); comp['C (gcc -O2)'] = round((time.perf_counter() - t0) * 1000)
    t0 = time.perf_counter(); subprocess.run(['node', COMP_N, f'{V}/bench22.esl', '-o', f'{D}/b22aot'], capture_output=True); comp['Ñ AOT'] = round((time.perf_counter() - t0) * 1000)
    t0 = time.perf_counter(); subprocess.run(['node', COMP_N, f'{V}/bench22.esl', '-o', f'{D}/b22aot2'], capture_output=True); comp['Ñ AOT (2.ª vez, con la biblioteca ya compilada)'] = round((time.perf_counter() - t0) * 1000)
    tam = {'C hola': os.path.getsize(f'{D}/f86_hola/c'), 'Ñ AOT hola': os.path.getsize(f'{D}/f86_hola/aot'),
           'C bench22 (22 benchmarks)': os.path.getsize(f'{D}/b22c'), 'Ñ AOT bench22 (22 benchmarks)': os.path.getsize(f'{D}/b22aot')}
    res['_compilacion_ms'] = comp; res['_tamano_bytes'] = tam
    print(comp, tam)
    os.makedirs(f'{V}/resultados-100', exist_ok=True)
    json.dump(res, open(f'{V}/resultados-100/grupo_f.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
