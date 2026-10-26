#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
n-analizar.py — comprueba programas Ñ (.esl) SIN ejecutarlos y sin Node.

    python motor-exp/util/n-analizar.py programa.esl [otro.esl … | carpeta/]

Hace, en Python puro y en este orden, lo mismo que el motor hace antes de
correr un programa —léxico, sintaxis, enlace de módulos («usar») y verificación
de tipos, con los MISMOS mensajes— y añade lo que el motor solo descubre al
ejecutar:

  ejecución   división entre cero con un 0 escrito · índice fuera de rango y
              clave inexistente sobre listas y diccionarios literales que no
              cambian · recursión sin ninguna condición (desbordamiento seguro,
              también entre varias funciones) · código inalcanzable tras
              «devolver», «romper», «continuar» o «lanzar» · caminos que acaban
              sin «devolver» en una función que promete un tipo · un «lanzar»
              del nivel superior que nadie captura
  bucle       «mientras» cuya condición siempre es cierta y del que nada sale ·
              «mientras» cuya condición no cambia dentro del cuerpo · variable
              de la condición que solo se mueve en el sentido contrario ·
              «repetir» negativo y «para» sobre una lista vacía (no entran)

Lo que está dentro de un «intentar … capturar» no se marca como error de
ejecución: el programa ya lo recoge.

Lleva también los nulos al estilo Kotlin de la fase X5 (26-oct-2026):
«texto?», el estrechamiento por flujo («si x != nulo», «??», «?.»), «var x»
sin valor, y «devolver» por todos los caminos, con los mismos mensajes que
el verificador del motor. Los avisos del motor (condición que no es
bool, «sinComprobar», nombres que tapan a la biblioteca…) salen tal cual.

Opciones
  --json          salida en JSON (una lista de hallazgos)
  --sin-avisos    solo errores
  --estricto      los avisos también hacen fallar (código de salida 1)
  --solo-motor    exactamente lo que diría el motor: sin ejecución ni bucles, y
                  si un módulo tiene errores el programa principal no se mira
  --c1en          perfil C1EÑ: «numerico» y «nen» abiertos sin «usar»
                  (como «node util/n-node.js --c1en»)
  --firmas RUTA   tabla de firmas alternativa (ver «La tabla de firmas»)
  --volcar-firmas imprime la tabla de firmas que lleva dentro y sale

Código de salida: 0 si no hay errores, 1 si los hay (o avisos con --estricto),
2 si la orden está mal.

La tabla de firmas
  El verificador necesita saber qué funciones hay en la biblioteca y en cada
  eDSL («usar media de "numerico"») y con qué tipos. La tabla va embebida al
  final de este archivo (FIRMAS_JSON) y se sacó del propio motor con:

      require(require('D:/ProyectosJS/motor-exp/rutas.js').bundle);
      const { crearMotor, tipoATexto } = globalThis.EspanolLike;
      const vm = crearMotor({}).vm, out = { globales: {}, edsls: {}, clasico: [] };
      for (const [n, t] of Object.entries(vm.tiposGlobales())) out.globales[n] = tipoATexto(t);
      for (const [nombre, r] of vm.edsls) {
        out.edsls[nombre] = Object.fromEntries([...r.exporta].map(([k, t]) => [k, tipoATexto(t)]));
        if (nombre === 'clasico') out.clasico = [...r.exporta.keys()];
      }
      process.stdout.write(JSON.stringify(out));

  Si la biblioteca cambia (una función nueva, un eDSL nuevo), se vuelve a
  volcar y se pega aquí, o se pasa con --firmas sin tocar el archivo.

Portado de motor-exp/src/01-front.js, 02-check-compile.js y 06-modulos.js
(N4.11, octubre de 2026). Si el motor cambia la gramática o un mensaje, hay que
traerlo aquí: este archivo no se genera, se mantiene.
"""
import sys
import os
import re
import json
import argparse

VERSION = '0.3 (motor-exp N4.11 + X5 nulos, 26-oct-2026)'


# ============================================================================
#  Diagnóstico
# ============================================================================
class ErrorFuente(Exception):
    def __init__(self, fase, mensaje, linea, col, pista=None, nivel='error'):
        super().__init__(mensaje)
        self.fase = fase
        self.mensaje = mensaje
        self.linea = linea
        self.col = col
        self.pista = pista
        self.archivo = None
        self.nivel = nivel          # 'error' | 'aviso'

    def formato(self):
        s = '[%s] %slínea %s:%s — %s' % (self.fase, (self.archivo + ' ') if self.archivo else '', self.linea, self.col, self.mensaje)
        if self.pista:
            s += '\n   ↳ ' + self.pista
        return s

    def como_dic(self):
        return {'nivel': self.nivel, 'fase': self.fase, 'archivo': self.archivo, 'linea': self.linea,
                'col': self.col, 'mensaje': self.mensaje, 'pista': self.pista}


# ============================================================================
#  Léxico
# ============================================================================
PALABRAS = {
    'var': 'VAR', 'fijo': 'FIJO',
    'funcion': 'FUNCION', 'función': 'FUNCION', 'definir': 'FUNCION', 'fn': 'FUNCION',
    'devolver': 'DEVOLVER', 'retornar': 'DEVOLVER',
    'si': 'SI', 'sino': 'SINO',
    'mientras': 'MIENTRAS', 'para': 'PARA', 'en': 'EN',
    'repetir': 'REPETIR', 'veces': 'VECES',
    'romper': 'ROMPER', 'continuar': 'CONTINUAR',
    'intentar': 'INTENTAR', 'capturar': 'CAPTURAR', 'finalmente': 'FINALMENTE', 'lanzar': 'LANZAR',
    'cierto': 'CIERTO', 'Cierto': 'CIERTO', 'verdadero': 'CIERTO',
    'falso': 'FALSO', 'Falso': 'FALSO',
    'nulo': 'NULO', 'Nulo': 'NULO',
    'y': 'Y', 'o': 'O', 'no': 'NO',
}

PISTA_PALABRA = {
    'var': 'declara variables: «var x = 1»', 'fijo': 'declara constantes: «fijo x = 1»',
    'funcion': 'declara funciones', 'función': 'declara funciones',
    'definir': 'declara funciones', 'fn': 'declara funciones',
    'devolver': 'sale de una función con un valor', 'retornar': 'sale de una función con un valor',
    'si': 'condiciones: «si x > 0 { … }»', 'sino': 'la otra rama de un «si»',
    'mientras': 'bucles: «mientras x < 10 { … }»',
    'para': 'recorre una lista: «para x en lista { … }»',
    'en': 'va dentro de «para x en lista»; prueba «dentro» o «donde»',
    'repetir': 'repite n veces: «repetir 3 veces { … }»',
    'veces': 'va dentro de «repetir 3 veces { … }»; prueba «cuantas», «vez» o «repeticiones»',
    'romper': 'sale de un bucle', 'continuar': 'salta a la siguiente vuelta del bucle',
    'intentar': 'protege un trozo de código', 'capturar': 'recoge el fallo de un «intentar»',
    'finalmente': 'corre siempre, al salir de un «intentar»',
    'lanzar': 'lanza un error a mano',
    'cierto': 'el valor verdadero', 'Cierto': 'el valor verdadero', 'verdadero': 'el valor verdadero',
    'falso': 'el valor falso', 'Falso': 'el valor falso',
    'nulo': 'la ausencia de valor', 'Nulo': 'la ausencia de valor',
    'no': 'operador: «no a»; prueba «negado» o «sin»',
}

ELEM_ARREGLO = {'real', 'entero', 'bool', 'complejo', 'real32', 'real16', 'i8', 'u8', 'i16', 'u16', 'u32', 'i64', 'u64', 'i32', 'f64', 'f32', 'f16'}
TIPOS_BASE = ['entero', 'real', 'texto', 'bool', 'nulo', 'lista', 'dic', 'funcion', 'nodo', 'estilo', 'error', 'fecha', 'tabla', 'arreglo', 'grande', 'cualquiera']
TIPOS_BASE_SET = set(TIPOS_BASE)

_RE_ALFA = re.compile(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]')


def _es_dig(c):
    return '0' <= c <= '9' if c else False


def _es_alfa(c):
    return bool(c) and bool(_RE_ALFA.match(c))


def _es_alnum(c):
    return _es_alfa(c) or _es_dig(c)


def lexer(fuente):
    toks = []
    n = len(fuente)
    st = {'i': 0, 'linea': 1, 'col': 1}

    def peek(k=0):
        j = st['i'] + k
        return fuente[j] if j < n else ''

    def avanzar():
        c = fuente[st['i']] if st['i'] < n else ''
        st['i'] += 1
        if c == '\n':
            st['linea'] += 1
            st['col'] = 1
        else:
            st['col'] += 1
        return c

    def push(tipo, valor, l, c, extra=None):
        t = {'tipo': tipo, 'valor': valor, 'linea': l, 'col': c}
        if extra:
            t.update(extra)
        toks.append(t)

    OP3 = ['**=']
    OP2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '->', '..', '??']

    while st['i'] < n:
        c = peek()
        L, C = st['linea'], st['col']
        if c in (' ', '\t', '\r', '\n'):
            avanzar()
            continue
        if c == '#':
            while st['i'] < n and peek() != '\n':
                avanzar()
            continue
        if c == '/' and peek(1) == '*':
            avanzar(); avanzar()
            while st['i'] < n and not (peek() == '*' and peek(1) == '/'):
                avanzar()
            if st['i'] >= n:
                raise ErrorFuente('léxico', 'comentario /* sin cerrar', L, C)
            avanzar(); avanzar()
            continue
        if _es_dig(c):
            s = ''
            while _es_dig(peek()):
                s += avanzar()
            es_real = False
            if peek() == '.' and _es_dig(peek(1)):
                es_real = True
                s += avanzar()
                while _es_dig(peek()):
                    s += avanzar()
            if peek() in ('e', 'E'):
                g = dict(st)
                e = avanzar()
                if peek() in ('+', '-'):
                    e += avanzar()
                if _es_dig(peek()):
                    es_real = True
                    s += e
                    while _es_dig(peek()):
                        s += avanzar()
                else:
                    st.update(g)
            push('NUM', float(s), L, C, {'esReal': es_real})
            continue
        if c == '"' or c == "'":
            comilla = avanzar()
            partes = []
            buf = ''
            while True:
                if st['i'] >= n:
                    raise ErrorFuente('léxico', 'texto sin cerrar', L, C, 'falta la comilla de cierre')
                ch = peek()
                if ch == comilla:
                    avanzar()
                    break
                if ch == '\\':
                    avanzar()
                    e = avanzar()
                    buf += {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '{': '{', '}': '}'}.get(e, e)
                    continue
                if ch == '{' and comilla == '"':
                    avanzar()
                    if buf:
                        partes.append({'tipo': 'lit', 'valor': buf})
                        buf = ''
                    prof, sub = 1, ''
                    sl, sc = st['linea'], st['col']
                    while st['i'] < n and prof > 0:
                        d = peek()
                        if d == '{':
                            prof += 1
                        elif d == '}':
                            prof -= 1
                            if prof == 0:
                                avanzar()
                                break
                        sub += avanzar()
                    if prof > 0:
                        raise ErrorFuente('léxico', 'interpolación { } sin cerrar', sl, sc)
                    partes.append({'tipo': 'expr', 'valor': sub, 'linea': sl, 'col': sc})
                    continue
                buf += avanzar()
            if buf or not partes:
                partes.append({'tipo': 'lit', 'valor': buf})
            if len(partes) == 1 and partes[0]['tipo'] == 'lit':
                push('TEXTO', partes[0]['valor'], L, C)
            else:
                push('TEXTO_INTERP', partes, L, C)
            continue
        if c == '|' and _es_alfa(peek(1)):
            avanzar()
            s = ''
            while _es_alnum(peek()):
                s += avanzar()
            push('CONSTANTE', '|' + s, L, C)
            continue
        if _es_alfa(c):
            s = ''
            while _es_alnum(peek()):
                s += avanzar()
            pal = PALABRAS.get(s)
            if pal:
                push(pal, s, L, C)
            else:
                push('IDENT', s, L, C)
            continue
        tres = fuente[st['i']:st['i'] + 3]
        dos = fuente[st['i']:st['i'] + 2]
        if dos == '?.':
            avanzar(); avanzar()
            push('?.', '?.', L, C)
            continue
        if tres in OP3:
            avanzar(); avanzar(); avanzar()
            push('OP', tres, L, C)
            continue
        if dos in OP2:
            avanzar(); avanzar()
            push('OP', dos, L, C)
            continue
        if c == '?' and st['i'] > 0 and (_es_alnum(fuente[st['i'] - 1]) or fuente[st['i'] - 1] in '>)'):
            avanzar()
            push('?', '?', L, C)
            continue
        if dos == '&&':
            avanzar(); avanzar()
            push('Y', 'y', L, C)
            continue
        if dos == '||':
            avanzar(); avanzar()
            push('O', 'o', L, C)
            continue
        if c in '+-*/%<>=!':
            avanzar()
            push('OP', c, L, C)
            continue
        if c in '()[]{},:;.':
            avanzar()
            push(c, c, L, C)
            continue
        raise ErrorFuente('léxico', 'carácter inesperado «%s»' % c, L, C)
    push('FIN', None, st['linea'], st['col'])
    return toks


def pista_llaves(e, q):
    dentro = str(q.get('valor') or '')
    parece_json = re.match(r'^\s*$', dentro) is not None or ':' in dentro
    if parece_json and isinstance(e, ErrorFuente):
        e.pista = ('si querías escribir JSON o CSS dentro del texto, escapa las llaves: '
                   '"\\{"a": 1\\}" · para leer JSON de un archivo no hace falta escapar nada')
    return e


# ============================================================================
#  Tipos
# ============================================================================
class _T:
    def __init__(self):
        for k in ('entero', 'real', 'texto', 'bool', 'nulo', 'cualquiera', 'nodo', 'error', 'estilo', 'fecha', 'tabla', 'arreglo', 'grande'):
            setattr(self, k, {'k': k})

    def registro(self, nombre):
        return {'k': 'registro', 'nombre': nombre}

    def opcional(self, t):
        # (X5) «texto?»: texto o nulo. «cualquiera?», «nulo?» y una variable de tipo no cambian.
        if not t or t['k'] in ('opcional', 'cualquiera', 'nulo', 'var'):
            return t or self.cualquiera
        return {'k': 'opcional', 'de': t}

    def lista(self, e=None):
        return {'k': 'lista', 'elem': e or self.cualquiera}

    def dic(self, c=None, v=None):
        return {'k': 'dic', 'clave': c or self.cualquiera, 'valor': v or self.cualquiera}

    def fn(self, params=None, ret=None):
        return {'k': 'funcion', 'params': params if params is not None else None, 'ret': ret or self.cualquiera}

    def union(self, *ts):
        de = []
        for t in ts:
            for u in (t['de'] if t['k'] == 'union' else [t]):
                if not any(v['k'] == u['k'] for v in de):
                    de.append(u)
        return de[0] if len(de) == 1 else {'k': 'union', 'de': de}


T = _T()
BASICOS = ['entero', 'real', 'texto', 'bool', 'nulo', 'cualquiera', 'nodo', 'error', 'estilo', 'fecha', 'tabla', 'arreglo', 'grande']


def tipo_a_texto(t):
    if t and t['k'] == 'union':
        return '|'.join(tipo_a_texto(x) for x in t['de'])
    if not t:
        return 'cualquiera'
    k = t['k']
    if k == 'lista':
        return 'lista<%s>' % tipo_a_texto(t['elem']) if t.get('elem') and t['elem']['k'] != 'cualquiera' else 'lista'
    if k == 'dic':
        return 'dic<%s,%s>' % (tipo_a_texto(t['clave']), tipo_a_texto(t['valor'])) if t.get('clave') and t['clave']['k'] != 'cualquiera' else 'dic'
    if k == 'funcion':
        return 'funcion(%s): %s' % (', '.join(tipo_a_texto(p) for p in t['params']), tipo_a_texto(t['ret'])) if t.get('params') is not None else 'funcion'
    if k == 'modulo':
        return 'módulo «%s»' % (t.get('ruta') or t.get('clave'))
    if k in ('registro', 'var', 'elem'):
        return t['nombre']
    if k == 'opcional':
        return ('(%s)?' % tipo_a_texto(t['de'])) if (t['de']['k'] == 'funcion' and t['de'].get('params') is not None) else tipo_a_texto(t['de']) + '?'
    if k == 'pendiente':
        return 'sin tipo todavía'
    if k == 'arreglo':
        return 'arreglo<%s>' % tipo_a_texto(t['elem']) if t.get('elem') else 'arreglo'
    return k


def _partir(s, sep):
    out, prof, act = [], 0, ''
    for c in s:
        if c in '<(':
            prof += 1
        elif c in '>)':
            prof -= 1
        elif c == sep and prof == 0:
            out.append(act)
            act = ''
            continue
        act += c
    if sep == ',':
        if act.strip():
            out.append(act)
    else:
        out.append(act)
    return [x.strip() for x in out if x.strip()]


def texto_a_tipo(s):
    s = str(s).strip()
    if s in BASICOS:
        return getattr(T, s)
    if s.endswith('?'):
        d = s[:-1].strip()
        return T.opcional(texto_a_tipo(d[1:-1] if d.startswith('(') and d.endswith(')') else d))
    if '|' in s:
        partes = _partir(s, '|')
        if len(partes) > 1:
            return T.union(*[texto_a_tipo(p) for p in partes])
    m = re.match(r'^lista(?:<(.+)>)?$', s)
    if m:
        return T.lista(texto_a_tipo(m.group(1)) if m.group(1) else T.cualquiera)
    m = re.match(r'^dic(?:<(.+)>)?$', s)
    if m:
        if not m.group(1):
            return T.dic()
        p = _partir(m.group(1), ',')
        if len(p) != 2:
            raise Exception('firma: «dic<%s>» necesita clave y valor' % m.group(1))
        return T.dic(texto_a_tipo(p[0]), texto_a_tipo(p[1]))
    if s == 'funcion':
        return T.fn(None, T.cualquiera)
    if s.startswith('funcion('):
        # El paréntesis que cierra los parámetros es el que EMPAREJA, no el
        # último: «funcion(funcion(...): nulo, lista): nulo» lleva uno dentro.
        prof, i = 0, len('funcion')
        for j in range(i, len(s)):
            if s[j] == '(':
                prof += 1
            elif s[j] == ')':
                prof -= 1
                if prof == 0:
                    params, resto = s[i + 1:j], s[j + 1:]
                    if resto.startswith(':'):
                        return firma('%s -> %s' % (params, resto[1:].strip()))
                    break
    raise Exception('firma: no entiendo el tipo «%s»' % s)


def firma(s):
    i = str(s).rfind('->')
    if i < 0:
        raise Exception('firma: falta «->» en «%s»' % s)
    izq, der = s[:i].strip(), s[i + 2:].strip()
    if not der:
        raise Exception('firma: falta el tipo de retorno en «%s»' % s)
    params = None if izq == '...' else [texto_a_tipo(x) for x in _partir(izq, ',')]
    return T.fn(params, texto_a_tipo(der))


def tipo_de_funcion(n, quitar_yo=False):
    ps = n['params'][1:] if quitar_yo else n['params']
    t = T.fn([p['anotacion'] or T.cualquiera for p in ps], T.cualquiera if n.get('corrutina') else (n.get('retorno') or T.cualquiera))
    t['nombres'] = [p['nombre'] for p in ps]
    primero = next((i for i, p in enumerate(ps) if p.get('defecto')), -1)
    t['minimos'] = len(ps) if primero < 0 else primero
    if n.get('genericos'):
        t['genericos'] = n['genericos']
    return t


def compatible(destino, origen):
    if not destino or not origen:
        return True
    if destino['k'] == 'cualquiera' or origen['k'] == 'cualquiera':
        return True
    if destino['k'] == 'var' or origen['k'] == 'var':
        return True
    # (X5) donde se espera «texto?» vale texto, nulo o «texto?»; donde se espera «texto» NO vale un «texto?»
    if destino['k'] == 'opcional':
        return origen['k'] == 'nulo' or compatible(destino['de'], origen['de'] if origen['k'] == 'opcional' else origen)
    if origen['k'] == 'opcional':
        return False
    if destino['k'] == 'union':
        return any(compatible(t, origen) for t in destino['de'])
    if origen['k'] == 'union':
        return all(compatible(destino, t) for t in origen['de'])
    if destino['k'] == origen['k']:
        if destino['k'] == 'registro':
            return destino['nombre'] == origen['nombre']
        if destino['k'] == 'lista':
            return compatible(destino['elem'], origen['elem'])
        if destino['k'] == 'dic':
            return compatible(destino['clave'], origen['clave']) and compatible(destino['valor'], origen['valor'])
        return True
    if destino['k'] == 'real' and origen['k'] == 'entero':
        return True
    return False


def es_num(t):
    return bool(t) and t['k'] in ('entero', 'real', 'cualquiera')


# ============================================================================
#  Parser
# ============================================================================
def reubicar(nodo, linea, col):
    vistos = set()

    def andar(x):
        if x is None or id(x) in vistos or not isinstance(x, (dict, list)):
            return
        vistos.add(id(x))
        if isinstance(x, list):
            for y in x:
                andar(y)
            return
        if isinstance(x.get('tipo'), str):
            x['linea'] = linea
            x['col'] = col
        for k, v in x.items():
            if k not in ('tipoLit', 'anotacion', 'retorno'):
                andar(v)
    andar(nodo)
    return nodo


ASIGN_OPS = ['=', '+=', '-=', '*=', '/=']


class Parser:
    def __init__(self, toks, fuente_nombre=None, solo_expresion=False):
        self.toks = toks
        self.p = 0
        self.fuente_nombre = fuente_nombre
        self.solo_expresion = solo_expresion
        self.tipos_declarados = set()
        for i in range(len(toks) - 2):
            if toks[i]['tipo'] == 'IDENT' and toks[i]['valor'] == 'tipo' and toks[i + 1]['tipo'] == 'IDENT' and toks[i + 2]['tipo'] == '{':
                self.tipos_declarados.add(toks[i + 1]['valor'])
        self.sig_tmp = 0
        self.tapadas = set()
        for i in range(len(toks) - 1):
            if toks[i]['tipo'] in ('FUNCION', 'VAR', 'FIJO') and toks[i + 1]['tipo'] == 'IDENT':
                self.tapadas.add(toks[i + 1]['valor'])
        self.funciones = []
        self.vars_tipo = []
        for i in range(len(toks) - 1):
            if not (toks[i]['tipo'] == 'IDENT' and toks[i]['valor'] == 'usar'):
                continue
            k = i + 1
            while k < len(toks) and toks[k]['tipo'] == 'IDENT':
                if toks[k]['valor'] == 'de':
                    break
                if re.match(r'^[A-ZÁÉÍÓÚÑ]', toks[k]['valor']):
                    self.tipos_declarados.add(toks[k]['valor'])
                if k + 1 >= len(toks) or toks[k + 1]['tipo'] != ',':
                    break
                k += 2

    # --- utilidades ---
    def tmp_nombre(self):
        self.sig_tmp += 1
        return ' t%d' % (self.sig_tmp - 1)

    def ver(self, k=0):
        return self.toks[min(self.p + k, len(self.toks) - 1)]

    def fin(self):
        return self.ver()['tipo'] == 'FIN'

    def comprobar(self, tipo, valor=None):
        t = self.ver()
        return t['tipo'] == tipo and (valor is None or t['valor'] == valor)

    def igualar(self, tipo, valor=None):
        if self.comprobar(tipo, valor):
            self.p += 1
            return True
        return False

    @staticmethod
    def es_nombre(t):
        return t['tipo'] in ('IDENT', 'Y', 'O')

    def es_clave(self, t, v):
        return t['tipo'] == 'IDENT' and t['valor'] == v and v not in self.tapadas

    @staticmethod
    def es_palabra(t, v):
        return t['tipo'] == 'IDENT' and t['valor'] == v

    def es_var_tipo(self, n):
        return any(n in s for s in self.vars_tipo)

    def exigir_nombre(self, msg=None):
        t = self.ver()
        if self.es_nombre(t):
            self.p += 1
            return t
        if t['tipo'] == 'CONSTANTE':
            raise ErrorFuente('sintaxis', '«%s» es una constante del lenguaje y no se puede declarar' % t['valor'],
                              t['linea'], t['col'], 'el «|» está reservado a Ñ; para lo tuyo usa un nombre sin él, como «%s»' % t['valor'][1:])
        if str(t['valor']) in PALABRAS:
            raise ErrorFuente('sintaxis', '«%s» es una palabra del lenguaje y no se puede usar como nombre' % t['valor'],
                              t['linea'], t['col'], PISTA_PALABRA.get(str(t['valor'])) or 'ponle otro nombre')
        raise ErrorFuente('sintaxis', msg or 'se esperaba un nombre y llegó «%s»' % t['valor'], t['linea'], t['col'])

    def exigir(self, tipo, valor=None, msg=None):
        if self.comprobar(tipo, valor):
            self.p += 1
            return self.toks[self.p - 1]
        t = self.ver()
        llego = 'fin de archivo' if t['valor'] is None else t['valor']
        raise ErrorFuente('sintaxis', msg or 'se esperaba «%s» y llegó «%s»' % (valor or tipo, llego), t['linea'], t['col'])

    def saltar_punto_y_coma(self):
        while self.igualar(';'):
            pass

    # --- tipos ---
    def parse_tipo(self):
        t = self.parse_tipo_base()
        if self.comprobar('?'):
            self.p += 1
            return T.opcional(t)
        return t

    def parse_tipo_base(self):
        t = self.ver()
        if t['tipo'] not in ('IDENT', 'NULO', 'FUNCION'):
            raise ErrorFuente('sintaxis', 'se esperaba un tipo y llegó «%s»' % t['valor'], t['linea'], t['col'])
        nombre = 'nulo' if t['tipo'] == 'NULO' else ('funcion' if t['tipo'] == 'FUNCION' else t['valor'])
        self.p += 1
        if self.es_var_tipo(nombre):
            return {'k': 'var', 'nombre': nombre}
        if nombre in self.tipos_declarados and nombre not in TIPOS_BASE_SET:
            return T.registro(nombre)
        if nombre not in TIPOS_BASE_SET:
            raise ErrorFuente('tipos', 'tipo desconocido «%s»' % nombre, t['linea'], t['col'], 'tipos válidos: ' + ', '.join(TIPOS_BASE))
        if nombre == 'lista' and self.comprobar('OP', '<'):
            self.p += 1
            e = self.parse_tipo()
            self.exigir('OP', '>', 'falta «>» al cerrar lista<…>')
            return T.lista(e)
        if nombre == 'arreglo' and self.comprobar('OP', '<'):
            self.p += 1
            e = self.ver()
            if e['tipo'] != 'IDENT':
                raise ErrorFuente('sintaxis', 'se esperaba el tipo de los números del arreglo y llegó «%s»' % e['valor'], e['linea'], e['col'])
            self.p += 1
            if self.es_var_tipo(e['valor']):
                elem = {'k': 'var', 'nombre': e['valor']}
            elif e['valor'] in ELEM_ARREGLO:
                elem = {'k': 'elem', 'nombre': e['valor']}
            else:
                raise ErrorFuente('tipos', '«%s» no es un tipo de los números de un arreglo' % e['valor'], e['linea'], e['col'],
                                  'los que hay: %s, o una variable de tipo (fn f<T>(a: arreglo<T>))' % ', '.join(sorted(ELEM_ARREGLO)))
            self.exigir('OP', '>', 'falta «>» al cerrar arreglo<…>')
            return {'k': 'arreglo', 'elem': elem}
        if nombre == 'dic' and self.comprobar('OP', '<'):
            self.p += 1
            c = self.parse_tipo()
            self.exigir(',', ',')
            v = self.parse_tipo()
            self.exigir('OP', '>', 'falta «>» al cerrar dic<…>')
            return T.dic(c, v)
        if nombre == 'funcion':
            return T.fn(None, T.cualquiera)
        if nombre == 'lista':
            return T.lista()
        if nombre == 'dic':
            return T.dic()
        return getattr(T, nombre, T.cualquiera)

    def tipo_opcional(self):
        return self.parse_tipo() if self.igualar(':') else None

    # --- programa ---
    def programa(self):
        if self.solo_expresion:
            e = self.expresion()
            if not self.fin():
                raise ErrorFuente('sintaxis', 'la interpolación { } debe contener una sola expresión', self.ver()['linea'], self.ver()['col'])
            return {'tipo': 'Programa', 'cuerpo': [{'tipo': 'ExprSent', 'expr': e, 'linea': e['linea'], 'col': e['col']}], 'linea': 1, 'col': 1}
        cuerpo = []
        while not self.fin():
            self.poner(cuerpo, self.declaracion(True))
        return {'tipo': 'Programa', 'cuerpo': cuerpo, 'linea': 1, 'col': 1}

    @staticmethod
    def poner(cuerpo, d):
        if isinstance(d, list):
            cuerpo.extend(d)
        else:
            cuerpo.append(d)

    def declaracion(self, es_top):
        imp = self.quiza_usar(es_top)
        if imp:
            return imp
        pub = self.quiza_publico(es_top)
        if pub:
            return pub
        tt = self.quiza_tipo(es_top)
        if tt:
            return tt
        sg = self.quiza_segun()
        if sg:
            return sg
        if (self.comprobar('VAR') or self.comprobar('FIJO')) and self.ver(1)['tipo'] in ('[', '{'):
            return self.desestructurar()
        if self.comprobar('VAR') or self.comprobar('FIJO'):
            return self.decl_var()
        if self.comprobar('FUNCION') and self.es_nombre(self.ver(1)) and self.ver(2)['tipo'] == '.' and self.ver(1)['valor'] in self.tipos_declarados:
            return self.decl_metodo(es_top)
        if self.comprobar('FUNCION') and (self.es_nombre(self.ver(1)) or self.ver(1)['tipo'] == 'CONSTANTE'):
            return self.decl_funcion()
        return self.sentencia()

    # --- módulos ---
    def quiza_usar(self, es_top):
        t = self.ver()
        if not self.es_palabra(t, 'usar'):
            return None
        sig = self.ver(1)
        es_import = sig['tipo'] in ('TEXTO', 'TEXTO_INTERP')
        if not es_import and self.es_nombre(sig):
            k, hubo_coma = 1, False
            while True:
                if not self.es_nombre(self.ver(k)):
                    break
                k += 1
                if self.ver(k)['tipo'] == ',':
                    k += 1
                    hubo_coma = True
                    continue
                if self.es_palabra(self.ver(k), 'de'):
                    es_import = True
                    break
                if hubo_coma or self.ver(k)['tipo'] in ('TEXTO', 'TEXTO_INTERP'):
                    raise ErrorFuente('sintaxis', 'falta «de» y la ruta del módulo', self.ver(k)['linea'], self.ver(k)['col'],
                                      'escribe «usar sumar, restar de "mates.esl"»')
                break
        if not es_import:
            return None
        if not es_top:
            raise ErrorFuente('sintaxis', '«usar» solo puede ir en el nivel superior del archivo', t['linea'], t['col'],
                              'un módulo se carga una vez al empezar, no dentro de una función ni de un bloque')
        self.p += 1
        if self.comprobar('TEXTO_INTERP'):
            raise ErrorFuente('sintaxis', 'la ruta de un módulo no puede llevar interpolación { }', self.ver()['linea'], self.ver()['col'],
                              'tiene que saberse al compilar, no al ejecutar')
        if self.comprobar('TEXTO'):
            ruta = self.toks[self.p]
            self.p += 1
            cm = self.ver()
            if self.es_palabra(cm, 'como'):
                self.p += 1
                al = self.exigir_nombre('se esperaba el nombre con el que usar el módulo')
                self.saltar_punto_y_coma()
                return {'tipo': 'Usar', 'ruta': ruta['valor'], 'alias': al['valor'], 'nombres': None, 'todo': False, 'linea': t['linea'], 'col': t['col']}
            if self.es_nombre(cm) and cm['linea'] == ruta['linea']:
                raise ErrorFuente('sintaxis', 'se esperaba «como» y llegó «%s»' % cm['valor'], cm['linea'], cm['col'],
                                  'escribe «usar "%s" como %s», o «usar "%s"» a secas para traerlo todo' % (ruta['valor'], cm['valor'], ruta['valor']))
            self.saltar_punto_y_coma()
            return {'tipo': 'Usar', 'ruta': ruta['valor'], 'alias': None, 'nombres': None, 'todo': True, 'linea': t['linea'], 'col': t['col']}
        nombres = []
        while True:
            nn = self.exigir_nombre('se esperaba el nombre de algo que importar')
            nombres.append({'nombre': nn['valor'], 'linea': nn['linea'], 'col': nn['col']})
            if not self.igualar(','):
                break
        de = self.ver()
        if not self.es_palabra(de, 'de'):
            llego = 'fin de archivo' if de['valor'] is None else de['valor']
            raise ErrorFuente('sintaxis', 'se esperaba «de» y llegó «%s»' % llego, de['linea'], de['col'], 'escribe «usar sumar, restar de "mates.esl"»')
        self.p += 1
        ruta = self.exigir('TEXTO', None, 'se esperaba la ruta del módulo, entre comillas')
        self.saltar_punto_y_coma()
        return {'tipo': 'Usar', 'ruta': ruta['valor'], 'alias': None, 'nombres': nombres, 'todo': False, 'linea': t['linea'], 'col': t['col']}

    def quiza_publico(self, es_top):
        t = self.ver()
        if not self.es_palabra(t, 'publico') and not self.es_palabra(t, 'público'):
            return None
        sig = self.ver(1)
        if self.es_palabra(sig, 'tipo') and self.es_nombre(self.ver(2)) and self.ver(3)['tipo'] == '{':
            if not es_top:
                raise ErrorFuente('sintaxis', '«publico» solo puede marcar algo del nivel superior del archivo', t['linea'], t['col'])
            self.p += 1
            d = self.quiza_tipo(es_top)
            d[0]['publico'] = True
            d[1]['publico'] = True
            return d
        if sig['tipo'] == 'FUNCION' and self.es_nombre(self.ver(2)) and self.ver(3)['tipo'] == '.' and self.ver(2)['valor'] in self.tipos_declarados:
            self.p += 1
            return self.decl_metodo(es_top)
        if sig['tipo'] not in ('FUNCION', 'FIJO', 'VAR'):
            return None
        if not es_top:
            raise ErrorFuente('sintaxis', '«publico» solo puede marcar algo del nivel superior del archivo', t['linea'], t['col'],
                              'lo que vive dentro de una función o de un bloque no sale del archivo')
        self.p += 1
        d = self.decl_funcion() if self.comprobar('FUNCION') else self.decl_var()
        d['publico'] = True
        return d

    # --- registros ---
    def quiza_tipo(self, es_top):
        t = self.ver()
        if not self.es_palabra(t, 'tipo') or not self.es_nombre(self.ver(1)) or self.ver(2)['tipo'] != '{':
            return None
        if not es_top:
            raise ErrorFuente('sintaxis', '«tipo» solo puede ir en el nivel superior del archivo', t['linea'], t['col'],
                              'declara el registro fuera de funciones y bloques')
        self.p += 1
        nom = self.exigir_nombre('se esperaba el nombre del registro')
        if nom['valor'] in TIPOS_BASE_SET:
            raise ErrorFuente('sintaxis', '«%s» ya es un tipo de Ñ' % nom['valor'], nom['linea'], nom['col'], 'ponle otro nombre al registro')
        self.exigir('{', '{')
        campos, vistos = [], set()
        while not self.comprobar('}') and not self.fin():
            c = self.exigir_nombre('se esperaba el nombre de un campo')
            if c['valor'] in vistos:
                raise ErrorFuente('sintaxis', 'el campo «%s» está dos veces en «%s»' % (c['valor'], nom['valor']), c['linea'], c['col'])
            vistos.add(c['valor'])
            anot = self.tipo_opcional()
            defecto = None
            if self.igualar('OP', '='):
                defecto = self.expresion()
            elif any(q['defecto'] for q in campos):
                raise ErrorFuente('sintaxis', 'el campo «%s» va después de uno con valor por defecto y no tiene el suyo' % c['valor'],
                                  c['linea'], c['col'], 'los campos con valor por defecto van al final')
            campos.append({'nombre': c['valor'], 'anotacion': anot, 'defecto': defecto, 'linea': c['linea'], 'col': c['col']})
            self.igualar(',')
            self.saltar_punto_y_coma()
        self.exigir('}', '}', 'falta «}» al cerrar «tipo %s»' % nom['valor'])
        if not campos:
            raise ErrorFuente('sintaxis', '«%s» no tiene campos' % nom['valor'], nom['linea'], nom['col'], 'un registro necesita al menos un campo')
        L, C = t['linea'], t['col']
        params = [{'nombre': c['nombre'], 'anotacion': c['anotacion'], 'defecto': c['defecto'], 'linea': c['linea'], 'col': c['col']} for c in campos]
        cuerpo_ctor = {'tipo': 'Bloque', 'linea': L, 'col': C, 'cuerpo': [{'tipo': 'Devolver', 'linea': L, 'col': C,
                       'valor': {'tipo': 'Llamada', 'linea': L, 'col': C, 'callee': {'tipo': 'Variable', 'nombre': ' hacer ' + nom['valor'], 'linea': L, 'col': C},
                                 'args': [{'tipo': 'Variable', 'nombre': c['nombre'], 'linea': L, 'col': C} for c in campos]}}]}
        self.poner_defectos(params, cuerpo_ctor)
        ctor = {'tipo': 'DeclFuncion', 'nombre': nom['valor'], 'params': params, 'retorno': T.registro(nom['valor']), 'cuerpo': cuerpo_ctor,
                'esConstructor': True, 'genericos': [], 'corrutina': None, 'linea': L, 'col': C}
        return [{'tipo': 'DeclTipo', 'nombre': nom['valor'], 'campos': campos, 'linea': L, 'col': C}, ctor]

    def decl_metodo(self, es_top):
        t = self.toks[self.p]
        self.p += 1
        tipo_n = self.toks[self.p]
        self.p += 2
        if not es_top:
            raise ErrorFuente('sintaxis', 'un método solo puede ir en el nivel superior del archivo', t['linea'], t['col'])
        met = self.exigir_nombre('se esperaba el nombre del método de «%s»' % tipo_n['valor'])
        nombre = tipo_n['valor'] + '.' + met['valor']
        r = self.resto_funcion(nombre)
        if any(q['nombre'] == 'yo' for q in r['params']):
            raise ErrorFuente('sintaxis', '«yo» ya es el registro sobre el que se llama el método', met['linea'], met['col'],
                              'no lo pongas en los parámetros: está siempre')
        r['params'].insert(0, {'nombre': 'yo', 'anotacion': T.registro(tipo_n['valor']), 'defecto': None, 'linea': met['linea'], 'col': met['col'], 'esYo': True})
        return {'tipo': 'DeclFuncion', 'nombre': nombre, 'params': r['params'], 'retorno': r['retorno'], 'cuerpo': r['cuerpo'], 'genericos': r['genericos'],
                'corrutina': r['corrutina'], 'metodo': {'tipo': tipo_n['valor'], 'nombre': met['valor']}, 'linea': t['linea'], 'col': t['col']}

    # --- desestructurar ---
    def desestructurar(self):
        t = self.toks[self.p]
        self.p += 1
        es_fijo = t['tipo'] == 'FIJO'
        lista = self.comprobar('[')
        self.p += 1
        nombres = []
        cierre = ']' if lista else '}'
        if not self.comprobar(cierre):
            while True:
                if self.comprobar(cierre):
                    break
                n = self.exigir_nombre('se esperaba un nombre')
                nombres.append({'nombre': n['valor'], 'anotacion': self.tipo_opcional(), 'linea': n['linea'], 'col': n['col']})
                if not self.igualar(','):
                    break
        self.exigir(cierre, cierre, 'falta «%s»' % cierre)
        if not nombres:
            raise ErrorFuente('sintaxis', 'no hay nada que desestructurar', t['linea'], t['col'])
        self.exigir('OP', '=', 'falta «=» y el valor que desestructurar')
        valor = self.expresion()
        self.saltar_punto_y_coma()
        tmp = self.tmp_nombre()
        L, C = t['linea'], t['col']
        out = [{'tipo': 'DeclVar', 'nombre': tmp, 'anotacion': None, 'valor': valor, 'esFijo': True, 'linea': L, 'col': C}]
        for i, n in enumerate(nombres):
            fuente = {'tipo': 'Variable', 'nombre': tmp, 'linea': L, 'col': C}
            if lista:
                v = {'tipo': 'Indice', 'obj': fuente, 'indice': {'tipo': 'Literal', 'valor': float(i), 'tipoLit': T.entero, 'linea': L, 'col': C}, 'linea': L, 'col': C}
            else:
                v = {'tipo': 'Propiedad', 'obj': fuente, 'nombre': n['nombre'], 'linea': L, 'col': C}
            out.append({'tipo': 'DeclVar', 'nombre': n['nombre'], 'anotacion': n['anotacion'], 'valor': v, 'esFijo': es_fijo, 'linea': n['linea'], 'col': n['col']})
        return out

    # --- segun ---
    def quiza_segun(self):
        t = self.ver()
        if not self.es_palabra(t, 'segun') and not self.es_palabra(t, 'según'):
            return None
        sig = self.ver(1)
        if sig['tipo'] in ('OP', '.', '[', ')', ','):
            return None
        guardado = self.p
        try:
            self.p += 1
            valor = self.expresion()
        except ErrorFuente:
            self.p = guardado
            return None
        if not self.comprobar('{'):
            self.p = guardado
            return None
        self.p += 1
        tmp = self.tmp_nombre()
        L, C = t['linea'], t['col']
        casos, otro = [], None
        while not self.comprobar('}') and not self.fin():
            c = self.ver()
            if self.es_palabra(c, 'otro'):
                if otro:
                    raise ErrorFuente('sintaxis', '«segun» tiene dos «otro»', c['linea'], c['col'])
                self.p += 1
                otro = self.bloque()
                continue
            if not self.es_palabra(c, 'caso'):
                raise ErrorFuente('sintaxis', 'dentro de «segun» va «caso …» u «otro» y llegó «%s»' % c['valor'], c['linea'], c['col'], 'escribe «caso 1, 2 { … }»')
            if otro:
                raise ErrorFuente('sintaxis', '«otro» va al final del «segun»', c['linea'], c['col'])
            self.p += 1
            valores = []
            while True:
                valores.append(self.expresion())
                if not self.igualar(','):
                    break
            casos.append({'valores': valores, 'cuerpo': self.bloque(), 'linea': c['linea'], 'col': c['col']})
        self.exigir('}', '}', 'falta «}» al cerrar el «segun»')
        cadena = otro
        for k in reversed(casos):
            cond = None
            for v in k['valores']:
                eq = {'tipo': 'Binario', 'op': '==', 'izq': {'tipo': 'Variable', 'nombre': tmp, 'linea': k['linea'], 'col': k['col']}, 'der': v, 'linea': k['linea'], 'col': k['col']}
                cond = {'tipo': 'Binario', 'op': 'o', 'izq': cond, 'der': eq, 'linea': k['linea'], 'col': k['col']} if cond else eq
            cadena = {'tipo': 'Si', 'cond': cond, 'entonces': k['cuerpo'], 'sino': cadena, 'linea': k['linea'], 'col': k['col'], 'deSegun': True}
        cuerpo = [{'tipo': 'DeclVar', 'nombre': tmp, 'anotacion': None, 'valor': valor, 'esFijo': True, 'linea': L, 'col': C}]
        if cadena:
            cuerpo.append(cadena)
        return {'tipo': 'Bloque', 'cuerpo': cuerpo, 'linea': L, 'col': C}

    def decl_var(self):
        t = self.toks[self.p]
        self.p += 1
        es_fijo = t['tipo'] == 'FIJO'
        nom = self.exigir_nombre('se esperaba el nombre de la variable')
        anot = self.tipo_opcional()
        valor = None
        if self.igualar('OP', '='):
            valor = self.expresion()
        elif es_fijo:
            raise ErrorFuente('sintaxis', '«fijo %s» necesita un valor' % nom['valor'], nom['linea'], nom['col'])
        self.saltar_punto_y_coma()
        return {'tipo': 'DeclVar', 'nombre': nom['valor'], 'anotacion': anot, 'valor': valor, 'esFijo': es_fijo, 'linea': t['linea'], 'col': t['col']}

    def decl_funcion(self):
        t = self.toks[self.p]
        self.p += 1
        nom = self.exigir_nombre('se esperaba el nombre de la función')
        r = self.resto_funcion(nom['valor'])
        return {'tipo': 'DeclFuncion', 'nombre': nom['valor'], 'params': r['params'], 'retorno': r['retorno'], 'cuerpo': r['cuerpo'],
                'genericos': r['genericos'], 'corrutina': r['corrutina'], 'linea': t['linea'], 'col': t['col']}

    def resto_funcion(self, nombre):
        genericos = []
        if self.comprobar('OP', '<'):
            self.p += 1
            while True:
                g = self.exigir_nombre('se esperaba el nombre de una variable de tipo, como «T»')
                if g['valor'] in TIPOS_BASE_SET:
                    raise ErrorFuente('sintaxis', '«%s» ya es un tipo de Ñ y no puede ser variable de tipo' % g['valor'], g['linea'], g['col'])
                genericos.append(g['valor'])
                if not self.igualar(','):
                    break
            self.exigir('OP', '>', 'falta «>» al cerrar las variables de tipo')
        self.vars_tipo.append(set(genericos))
        try:
            self.exigir('(', '(', 'falta «(» tras «%s»' % nombre)
            params = []
            if not self.comprobar(')'):
                while True:
                    pn = self.exigir_nombre('se esperaba el nombre de un parámetro')
                    pt = self.tipo_opcional()
                    defecto = None
                    if self.igualar('OP', '='):
                        defecto = self.expresion()
                    elif any(q['defecto'] for q in params):
                        raise ErrorFuente('sintaxis', '«%s» va después de un parámetro con valor por defecto y no tiene el suyo' % pn['valor'],
                                          pn['linea'], pn['col'], 'los parámetros con valor por defecto van al final')
                    if any(q['nombre'] == pn['valor'] for q in params):
                        raise ErrorFuente('sintaxis', 'el parámetro «%s» está dos veces' % pn['valor'], pn['linea'], pn['col'])
                    params.append({'nombre': pn['valor'], 'anotacion': pt, 'defecto': defecto, 'linea': pn['linea'], 'col': pn['col']})
                    if not self.igualar(','):
                        break
            self.exigir(')', ')', 'falta «)» al cerrar los parámetros')
            retorno = None
            if self.igualar(':'):
                retorno = self.parse_tipo()
            elif self.igualar('OP', '->'):
                retorno = self.parse_tipo()
            marco = {'corrutina': None}
            self.funciones.append(marco)
            try:
                cuerpo = self.bloque()
            finally:
                self.funciones.pop()
            self.poner_defectos(params, cuerpo)
            return {'params': params, 'retorno': retorno, 'cuerpo': cuerpo, 'genericos': genericos, 'corrutina': marco['corrutina']}
        finally:
            self.vars_tipo.pop()

    @staticmethod
    def poner_defectos(params, cuerpo):
        pro = []
        for q in params:
            if not q['defecto']:
                continue
            L, C = q['linea'], q['col']
            v = {'tipo': 'Variable', 'nombre': q['nombre'], 'linea': L, 'col': C}
            pro.append({'tipo': 'Si', 'linea': L, 'col': C, 'sino': None, 'esDefecto': True,
                        'cond': {'tipo': 'Binario', 'op': '==', 'izq': v, 'der': {'tipo': 'Variable', 'nombre': ' faltante', 'linea': L, 'col': C}, 'linea': L, 'col': C},
                        'entonces': {'tipo': 'Bloque', 'linea': L, 'col': C, 'cuerpo': [{'tipo': 'ExprSent', 'linea': L, 'col': C,
                                     'expr': {'tipo': 'Asignacion', 'op': '=', 'esDefecto': True, 'destino': {'tipo': 'Variable', 'nombre': q['nombre'], 'linea': L, 'col': C},
                                              'valor': q['defecto'], 'linea': L, 'col': C}}]}})
        if pro:
            cuerpo['cuerpo'][0:0] = pro

    def marcar_corrutina(self, clase, t):
        if not self.funciones:
            raise ErrorFuente('sintaxis', '«%s» solo puede ir dentro de una función' % ('producir' if clase == 'generador' else 'esperar'), t['linea'], t['col'],
                              'una función con «producir» es un generador: «fn contar(n) { para i en rango(n) { producir i } }»' if clase == 'generador'
                              else 'una función con «esperar» es asíncrona: «fn cargar() { var r = esperar pedir(url) }»')
        f = self.funciones[-1]
        if f['corrutina'] and f['corrutina'] != clase:
            raise ErrorFuente('sintaxis', 'una función no puede tener «producir» y «esperar» a la vez', t['linea'], t['col'],
                              'sepáralo en dos funciones: un generador y una asíncrona')
        f['corrutina'] = clase

    def bloque(self):
        t = self.exigir('{', '{', 'falta «{» para abrir el bloque')
        cuerpo = []
        while not self.comprobar('}') and not self.fin():
            self.poner(cuerpo, self.declaracion(False))
        self.exigir('}', '}', 'falta «}» para cerrar el bloque')
        return {'tipo': 'Bloque', 'cuerpo': cuerpo, 'linea': t['linea'], 'col': t['col']}

    def inicio_de_linea_nueva(self, t):
        return self.ver()['linea'] > t['linea']

    def sentencia(self):
        t = self.ver()
        if (self.es_clave(t, 'producir') and not (self.ver(1)['tipo'] == 'OP' and self.ver(1)['valor'] in ASIGN_OPS)
                and self.ver(1)['tipo'] not in ('.', '[')):
            self.p += 1
            self.marcar_corrutina('generador', t)
            if self.comprobar('}') or self.comprobar(';') or self.fin() or self.inicio_de_linea_nueva(t):
                v = {'tipo': 'Literal', 'valor': None, 'tipoLit': T.nulo, 'linea': t['linea'], 'col': t['col']}
            else:
                v = self.expresion()
            self.saltar_punto_y_coma()
            return {'tipo': 'Producir', 'valor': v, 'linea': t['linea'], 'col': t['col']}
        if self.es_clave(t, 'sinComprobar') and self.ver(1)['tipo'] == '{':
            self.p += 1
            b = self.bloque()
            L, C = t['linea'], t['col']

            def marca(v, l):
                return {'tipo': 'ExprSent', 'linea': l, 'col': C, 'expr': {'tipo': 'Llamada', 'linea': l, 'col': C,
                        'callee': {'tipo': 'Variable', 'nombre': ' sinComprobar', 'linea': l, 'col': C},
                        'args': [{'tipo': 'Literal', 'valor': float(v), 'tipoLit': T.entero, 'linea': l, 'col': C}]}}
            ultima = (b['cuerpo'][-1].get('linea') or L) if b['cuerpo'] else L
            return {'tipo': 'Bloque', 'cuerpo': [marca(1, L)] + b['cuerpo'] + [marca(0, ultima)], 'linea': L, 'col': C, 'sinComprobar': True}
        if self.comprobar('SI'):
            return self.sent_si()
        if self.comprobar('MIENTRAS'):
            return self.sent_mientras()
        if self.comprobar('PARA'):
            return self.sent_para()
        if self.comprobar('REPETIR'):
            return self.sent_repetir()
        if self.comprobar('DEVOLVER'):
            self.p += 1
            v = None
            if not self.comprobar('}') and not self.comprobar(';') and not self.fin() and not self.inicio_de_linea_nueva(t):
                v = self.expresion()
            self.saltar_punto_y_coma()
            return {'tipo': 'Devolver', 'valor': v, 'linea': t['linea'], 'col': t['col']}
        if self.comprobar('INTENTAR'):
            return self.sent_intentar()
        if self.comprobar('LANZAR'):
            self.p += 1
            v = self.expresion()
            self.saltar_punto_y_coma()
            return {'tipo': 'Lanzar', 'valor': v, 'linea': t['linea'], 'col': t['col']}
        if self.comprobar('ROMPER'):
            self.p += 1
            self.saltar_punto_y_coma()
            return {'tipo': 'Romper', 'linea': t['linea'], 'col': t['col']}
        if self.comprobar('CONTINUAR'):
            self.p += 1
            self.saltar_punto_y_coma()
            return {'tipo': 'Continuar', 'linea': t['linea'], 'col': t['col']}
        if self.comprobar('{'):
            return self.bloque()
        e = self.expresion()
        self.saltar_punto_y_coma()
        return {'tipo': 'ExprSent', 'expr': e, 'linea': e['linea'], 'col': e['col']}

    def sent_si(self):
        t = self.toks[self.p]
        self.p += 1
        cond = self.expresion()
        entonces = self.bloque()
        sino = None
        if self.igualar('SINO'):
            sino = self.sent_si() if self.comprobar('SI') else self.bloque()
        return {'tipo': 'Si', 'cond': cond, 'entonces': entonces, 'sino': sino, 'linea': t['linea'], 'col': t['col']}

    def sent_intentar(self):
        t = self.toks[self.p]
        self.p += 1
        cuerpo = self.bloque()
        nombre_error, captura, finalmente = None, None, None
        if self.igualar('CAPTURAR'):
            if self.igualar('('):
                nombre_error = self.exigir_nombre('se esperaba el nombre del error: «capturar (e)»')['valor']
                self.exigir(')', None, 'falta «)» tras el nombre del error')
            captura = self.bloque()
        if self.igualar('FINALMENTE'):
            finalmente = self.bloque()
        if not captura and not finalmente:
            raise ErrorFuente('sintaxis', 'un «intentar» necesita «capturar» o «finalmente»', t['linea'], t['col'],
                              'escribe «intentar { … } capturar (e) { … }»')
        return {'tipo': 'Intentar', 'cuerpo': cuerpo, 'nombreError': nombre_error, 'captura': captura, 'finalmente': finalmente, 'linea': t['linea'], 'col': t['col']}

    def sent_mientras(self):
        t = self.toks[self.p]
        self.p += 1
        cond = self.expresion()
        return {'tipo': 'Mientras', 'cond': cond, 'cuerpo': self.bloque(), 'linea': t['linea'], 'col': t['col']}

    def sent_para(self):
        t = self.toks[self.p]
        self.p += 1
        nom = self.exigir_nombre('se esperaba la variable del bucle: «para i en …»')
        self.exigir('EN', None, 'falta «en» en el bucle «para»')
        it = self.expresion()
        return {'tipo': 'Para', 'nombre': nom['valor'], 'iterable': it, 'cuerpo': self.bloque(), 'linea': t['linea'], 'col': t['col']}

    def sent_repetir(self):
        t = self.toks[self.p]
        self.p += 1
        cuantas = self.expresion()
        self.igualar('VECES')
        return {'tipo': 'Repetir', 'cuantas': cuantas, 'cuerpo': self.bloque(), 'linea': t['linea'], 'col': t['col']}

    # --- expresiones ---
    def expresion(self):
        return self.asignacion()

    def asignacion(self):
        izq = self.coalescer()
        t = self.ver()
        if t['tipo'] == 'OP' and t['valor'] in ASIGN_OPS:
            self.p += 1
            der = self.asignacion()
            if izq['tipo'] in ('Variable', 'Indice', 'Propiedad'):
                return {'tipo': 'Asignacion', 'destino': izq, 'op': t['valor'], 'valor': der, 'linea': t['linea'], 'col': t['col']}
            raise ErrorFuente('sintaxis', 'el lado izquierdo de «=» no es asignable', t['linea'], t['col'],
                              'solo se puede asignar a una variable, a lista[i] o a dic.campo')
        return izq

    def binario_izq(self, sig, comprueba):
        izq = sig()
        while True:
            t = self.ver()
            if not comprueba(t):
                return izq
            self.p += 1
            der = sig()
            izq = {'tipo': 'Binario', 'op': t['valor'], 'izq': izq, 'der': der, 'linea': t['linea'], 'col': t['col']}

    def es_operador_logico(self, t, clase):
        if t['tipo'] != clase:
            return False
        previo = self.toks[self.p - 1] if self.p > 0 else None
        if previo and t['linea'] != previo['linea']:
            return False
        sig = self.ver(1)
        if sig['tipo'] == '.':
            return False
        if sig['tipo'] == '[':
            k, hondo = 1, 0
            while True:
                x = self.ver(k)
                if x['tipo'] == 'FIN':
                    break
                if x['tipo'] == '[':
                    hondo += 1
                elif x['tipo'] == ']':
                    hondo -= 1
                    if hondo == 0:
                        break
                k += 1
            tras = self.ver(k + 1)
            if tras['tipo'] == 'OP' and tras['valor'] in ASIGN_OPS:
                return False
        if sig['tipo'] == 'OP' and sig['valor'] in ASIGN_OPS:
            return False
        return True

    def coalescer(self):
        return self.binario_izq(self.o_logico, lambda t: t['tipo'] == 'OP' and t['valor'] == '??')

    def o_logico(self):
        return self.binario_izq(self.y_logico, lambda t: self.es_operador_logico(t, 'O'))

    def y_logico(self):
        return self.binario_izq(self.igualdad, lambda t: self.es_operador_logico(t, 'Y'))

    def igualdad(self):
        return self.binario_izq(self.comparacion, lambda t: t['tipo'] == 'OP' and t['valor'] in ('==', '!='))

    def comparacion(self):
        return self.binario_izq(self.termino, lambda t: t['tipo'] == 'OP' and t['valor'] in ('<', '<=', '>', '>='))

    def termino(self):
        return self.binario_izq(self.factor, lambda t: t['tipo'] == 'OP' and t['valor'] in ('+', '-'))

    def factor(self):
        return self.binario_izq(self.unario, lambda t: t['tipo'] == 'OP' and t['valor'] in ('*', '/', '%', '//'))

    def unario(self):
        t = self.ver()
        if self.es_clave(t, 'esperar'):
            sig = self.ver(1)
            empieza_expr = (sig['linea'] == t['linea'] and not (sig['tipo'] == 'OP' and sig['valor'] != '-')
                            and sig['tipo'] not in ('.', '[', ')', ']', '}', ',', ':', ';', 'FIN', 'Y', 'O', '?.'))
            if empieza_expr:
                self.p += 1
                self.marcar_corrutina('asincrona', t)
                return {'tipo': 'Esperar', 'valor': self.unario(), 'linea': t['linea'], 'col': t['col']}
        if t['tipo'] == 'NO' or (t['tipo'] == 'OP' and t['valor'] == '-'):
            self.p += 1
            return {'tipo': 'Unario', 'op': 'no' if t['tipo'] == 'NO' else '-', 'expr': self.unario(), 'linea': t['linea'], 'col': t['col']}
        return self.potencia()

    def potencia(self):
        base = self.llamada()
        t = self.ver()
        if t['tipo'] == 'OP' and t['valor'] == '**':
            self.p += 1
            return {'tipo': 'Binario', 'op': '**', 'izq': base, 'der': self.unario(), 'linea': t['linea'], 'col': t['col']}
        return base

    def llamada(self):
        e = self.primario()
        while True:
            t = self.ver()
            if self.comprobar('('):
                self.p += 1
                args, nombrados = [], []
                if not self.comprobar(')'):
                    while True:
                        if self.es_nombre(self.ver()) and self.ver(1)['tipo'] == ':':
                            nn = self.toks[self.p]
                            self.p += 2
                            if any(x['nombre'] == nn['valor'] for x in nombrados):
                                raise ErrorFuente('sintaxis', 'el argumento «%s» está dos veces' % nn['valor'], nn['linea'], nn['col'])
                            nombrados.append({'nombre': nn['valor'], 'valor': self.expresion(), 'linea': nn['linea'], 'col': nn['col']})
                        else:
                            if nombrados:
                                raise ErrorFuente('sintaxis', 'un argumento sin nombre no puede ir después de uno con nombre', self.ver()['linea'], self.ver()['col'],
                                                  'pon primero los de posición y al final los de nombre')
                            args.append(self.expresion())
                        if not self.igualar(','):
                            break
                self.exigir(')', ')', 'falta «)» al cerrar la llamada')
                e = {'tipo': 'Llamada', 'callee': e, 'args': args, 'linea': t['linea'], 'col': t['col']}
                if nombrados:
                    e['nombrados'] = nombrados
            elif self.comprobar('['):
                self.p += 1
                idx = self.expresion()
                self.exigir(']', ']', 'falta «]» al cerrar el índice')
                e = {'tipo': 'Indice', 'obj': e, 'indice': idx, 'linea': t['linea'], 'col': t['col']}
            elif self.comprobar('.'):
                self.p += 1
                nom = self.exigir_nombre('se esperaba un nombre tras «.»')
                e = {'tipo': 'Propiedad', 'obj': e, 'nombre': nom['valor'], 'linea': nom['linea'], 'col': nom['col']}
            elif self.comprobar('?.'):
                self.p += 1
                nom = self.exigir_nombre('se esperaba un nombre tras «?.»')
                e = {'tipo': 'Propiedad', 'obj': e, 'nombre': nom['valor'], 'opcional': True, 'linea': nom['linea'], 'col': nom['col']}
            else:
                return e

    def primario(self):
        t = self.ver()
        k = t['tipo']
        if k == 'NUM':
            self.p += 1
            return {'tipo': 'Literal', 'valor': t['valor'], 'tipoLit': T.real if t.get('esReal') else T.entero, 'linea': t['linea'], 'col': t['col']}
        if k == 'TEXTO':
            self.p += 1
            return {'tipo': 'Literal', 'valor': t['valor'], 'tipoLit': T.texto, 'linea': t['linea'], 'col': t['col']}
        if k == 'CIERTO':
            self.p += 1
            return {'tipo': 'Literal', 'valor': True, 'tipoLit': T.bool, 'linea': t['linea'], 'col': t['col']}
        if k == 'FALSO':
            self.p += 1
            return {'tipo': 'Literal', 'valor': False, 'tipoLit': T.bool, 'linea': t['linea'], 'col': t['col']}
        if k == 'NULO':
            self.p += 1
            return {'tipo': 'Literal', 'valor': None, 'tipoLit': T.nulo, 'linea': t['linea'], 'col': t['col']}
        if k in ('CONSTANTE', 'IDENT', 'Y', 'O'):
            self.p += 1
            return {'tipo': 'Variable', 'nombre': t['valor'], 'linea': t['linea'], 'col': t['col']}
        if k == 'TEXTO_INTERP':
            self.p += 1
            partes = []
            for q in t['valor']:
                if q['tipo'] == 'lit':
                    partes.append({'tipo': 'Literal', 'valor': q['valor'], 'tipoLit': T.texto, 'linea': t['linea'], 'col': t['col']})
                    continue
                try:
                    sub = Parser(lexer(q['valor']), self.fuente_nombre, solo_expresion=True).programa()
                except ErrorFuente as e:
                    raise pista_llaves(e, q)
                if len(sub['cuerpo']) != 1 or sub['cuerpo'][0]['tipo'] != 'ExprSent':
                    raise pista_llaves(ErrorFuente('sintaxis', 'la interpolación { } debe contener una sola expresión', q['linea'], q['col']), q)
                partes.append(reubicar(sub['cuerpo'][0]['expr'], q['linea'], q['col']))
            return {'tipo': 'Interpolacion', 'partes': partes, 'linea': t['linea'], 'col': t['col']}
        if k == 'SI':
            self.p += 1
            cond = self.expresion()
            ent = self.ver()
            if not self.es_palabra(ent, 'entonces'):
                llego = 'fin de archivo' if ent['valor'] is None else ent['valor']
                raise ErrorFuente('sintaxis', 'en un «si» que da un valor falta «entonces» y llegó «%s»' % llego, ent['linea'], ent['col'],
                                  'escribe «si x > 0 entonces "positivo" sino "no"»')
            self.p += 1
            a = self.expresion()
            self.exigir('SINO', None, 'un «si … entonces …» que da un valor necesita su «sino»')
            b = self.expresion()
            return {'tipo': 'SiExpr', 'cond': cond, 'entonces': a, 'sino': b, 'linea': t['linea'], 'col': t['col']}
        if k == 'FUNCION':
            self.p += 1
            r = self.resto_funcion('<anónima>')
            return {'tipo': 'FuncionAnon', 'params': r['params'], 'retorno': r['retorno'], 'cuerpo': r['cuerpo'], 'genericos': r['genericos'],
                    'corrutina': r['corrutina'], 'linea': t['linea'], 'col': t['col']}
        if k == '(':
            self.p += 1
            e = self.expresion()
            self.exigir(')', ')', 'falta «)»')
            return e
        if k == '[':
            self.p += 1
            items = []
            if not self.comprobar(']'):
                while True:
                    if self.comprobar(']'):
                        break
                    items.append(self.expresion())
                    if not self.igualar(','):
                        break
            self.exigir(']', ']', 'falta «]» al cerrar la lista')
            return {'tipo': 'ListaLit', 'items': items, 'linea': t['linea'], 'col': t['col']}
        if k == '{':
            self.p += 1
            pares = []
            if not self.comprobar('}'):
                while True:
                    if self.comprobar('}'):
                        break
                    if self.es_nombre(self.ver()) and self.ver(1)['tipo'] == ':':
                        v = self.ver()
                        clave = {'tipo': 'Literal', 'valor': v['valor'], 'tipoLit': T.texto, 'linea': v['linea'], 'col': v['col']}
                        self.p += 1
                    else:
                        clave = self.expresion()
                    self.exigir(':', ':', 'falta «:» entre clave y valor')
                    pares.append({'clave': clave, 'valor': self.expresion()})
                    if not self.igualar(','):
                        break
            self.exigir('}', '}', 'falta «}» al cerrar el diccionario')
            return {'tipo': 'DicLit', 'pares': pares, 'linea': t['linea'], 'col': t['col']}
        llego = 'fin de archivo' if t['valor'] is None else t['valor']
        raise ErrorFuente('sintaxis', 'no se esperaba «%s» aquí' % llego, t['linea'], t['col'])


def parser(toks, fuente_nombre=None, solo_expresion=False):
    return Parser(toks, fuente_nombre, solo_expresion).programa()


# ============================================================================
#  Módulos: eDSL embebidos, archivos, exportaciones y enlace
# ============================================================================
SEP_MODULO = '\u0000'
CLAVE_EDSL = 'ñ:'


def clave_edsl(nombre):
    return CLAVE_EDSL + nombre


def nombre_global_modulo(clave, nombre):
    return clave + SEP_MODULO + nombre


def ruta_corta(clave):
    return re.sub(r'^.*[/\\]', '', str(clave)) or str(clave)


class Biblioteca:
    """La tabla de firmas ya interpretada: globales y eDSL."""

    def __init__(self, tabla):
        self.globales = {}
        for n, s in tabla['globales'].items():
            self.globales[n] = texto_a_tipo(s)
        self.edsls = {}
        for nombre, ex in tabla['edsls'].items():
            if nombre == 'clasico':
                continue
            exporta = {k: texto_a_tipo(v) for k, v in ex.items()}
            self.edsls[nombre] = {'nombre': nombre, 'clave': clave_edsl(nombre), 'exporta': exporta, 'globalDe': None, 'origenDe': None}
        # «clasico» reexporta lo que se mudó de los eDSL al ámbito global.
        clasico = tabla.get('clasico') or []
        exporta, global_de, origen_de = {}, {}, {}
        for n in clasico:
            for e in self.edsls.values():
                if n in e['exporta']:
                    exporta[n] = e['exporta'][n]
                    global_de[n] = nombre_global_modulo(e['clave'], n)
                    origen_de[n] = e['nombre']
                    break
        self.edsls['clasico'] = {'nombre': 'clasico', 'clave': clave_edsl('clasico'), 'exporta': exporta, 'globalDe': global_de, 'origenDe': origen_de}

    def abrir(self, nombres):
        """Como abrirEdsls() del motor (perfil C1EÑ): los nombres de esos eDSL
        pasan al ámbito global sin «usar». El último que llega gana, igual que
        «nen» reexporta a «numerico» con el mismo objeto."""
        for nombre in nombres:
            r = self.edsls.get(nombre)
            if not r:
                raise Exception('no se puede abrir el eDSL «%s»: no existe' % nombre)
            for corto, t in r['exporta'].items():
                self.globales[corto] = t

    def indice_edsl(self):
        ix = {}
        for nombre, r in self.edsls.items():
            if nombre == 'clasico':
                continue
            for n in r['exporta']:
                ix.setdefault(n, []).append(nombre)
        return ix


def exportaciones_de(ast):
    ex = {}
    for s in ast['cuerpo']:
        if not s.get('publico'):
            continue
        if s['tipo'] == 'DeclFuncion':
            t = tipo_de_funcion(s)
            if s.get('esConstructor'):
                dt = next(x for x in ast['cuerpo'] if x['tipo'] == 'DeclTipo' and x['nombre'] == s['nombre'])
                metodos = {}
                for f in ast['cuerpo']:
                    if f['tipo'] == 'DeclFuncion' and f.get('metodo') and f['metodo']['tipo'] == s['nombre']:
                        metodos[f['metodo']['nombre']] = tipo_de_funcion(f, True)
                r = T.registro(s['nombre'])
                r['forma'] = {'nombre': s['nombre'], 'campos': [{'nombre': c['nombre'], 'tipo': c['anotacion'] or T.cualquiera} for c in dt['campos']], 'metodos': metodos}
                t['ret'] = r
            ex[s['nombre']] = t
        elif s['tipo'] == 'DeclVar':
            ex[s['nombre']] = s['anotacion'] or (s['valor'] and s['valor'].get('tipoLit')) or T.cualquiera
    return ex


class Modulos:
    def __init__(self, clave_raiz, edsls):
        self.clave_raiz = clave_raiz
        self.edsls = edsls
        self.ast = {}
        self.exporta = {}
        self.orden = []

    def resolver(self, espec, desde, nodo):
        base = os.path.dirname(desde) if desde else os.getcwd()
        abs_ = os.path.abspath(os.path.join(base, espec))
        if not os.path.exists(abs_):
            raise ErrorFuente('módulos', 'no existe el módulo «%s» (se buscó en %s)' % (espec, abs_), nodo['linea'], nodo['col'])
        real = os.path.realpath(abs_)
        if not os.path.isfile(real):
            raise ErrorFuente('módulos', '«%s» no es un archivo (%s)' % (espec, real), nodo['linea'], nodo['col'])
        return real

    def ast_de(self, clave, nodo):
        if clave in self.ast:
            return self.ast[clave]
        try:
            with open(clave, encoding='utf-8') as f:
                fuente = f.read()
        except Exception as e:
            raise ErrorFuente('módulos', str(e), nodo['linea'], nodo['col'])
        try:
            a = parser(lexer(fuente), clave)
        except ErrorFuente as e:
            e.archivo = ruta_corta(clave)
            raise
        self.ast[clave] = a
        self.orden.append(clave)
        return a

    def exporta_de(self, clave, nodo):
        if clave in self.exporta:
            return self.exporta[clave]
        ex = exportaciones_de(self.ast_de(clave, nodo))
        self.exporta[clave] = ex
        return ex


def enlazar(ast, clave, mods, errores, avisos, globales_tipos):
    enl = {'clave': clave, 'propias': set(), 'nombres': {}, 'alias': {}, 'deps': []}
    desde = clave or mods.clave_raiz
    for s in ast['cuerpo']:
        if s['tipo'] in ('DeclVar', 'DeclFuncion'):
            enl['propias'].add(s['nombre'])
        if s['tipo'] == 'DeclTipo':
            enl['propias'].add(' hacer ' + s['nombre'])

    def ocupado(n):
        return n in enl['propias'] or n in enl['nombres'] or n in enl['alias']

    def avisar_si_tapa(nodo, n):
        if globales_tipos is not None and n in globales_tipos:
            avisos.append(ErrorFuente('nombres', 'lo importado como «%s» tapa a la «%s» de la biblioteca' % (n, n), nodo['linea'], nodo['col'],
                                      'a partir de aquí «%s» ya no es la de Ñ; si no era la idea, tráelo con «usar … como …»' % n, nivel='aviso'))

    for s in ast['cuerpo']:
        if s['tipo'] != 'Usar':
            continue
        nat = mods.edsls.get(s['ruta'])
        if nat:
            destino, exporta = nat['clave'], nat['exporta']
        else:
            try:
                destino = mods.resolver(s['ruta'], desde, s)
                if mods.clave_raiz and destino == mods.clave_raiz:
                    raise ErrorFuente('módulos', '«%s» es el programa principal, y el programa principal no es un módulo' % s['ruta'], s['linea'], s['col'],
                                      'mueve a un archivo aparte lo que quieras compartir')
                exporta = mods.exporta_de(destino, s)
            except ErrorFuente as e:
                errores.append(e)
                continue
        s['claveResuelta'] = destino
        if destino not in enl['deps']:
            enl['deps'].append(destino)
        if not exporta:
            avisos.append(ErrorFuente('módulos', '«%s» no exporta nada' % s['ruta'], s['linea'], s['col'], 'marca con «publico» lo que deba verse desde fuera', nivel='aviso'))
        if s.get('todo'):
            for nm, tipo in exporta.items():
                if ocupado(nm):
                    continue
                avisar_si_tapa(s, nm)
                enl['nombres'][nm] = {
                    'clave': destino, 'ruta': s['ruta'], 'tipo': tipo, 'deTodo': True,
                    'global': nat['globalDe'].get(nm) if (nat and nat.get('globalDe')) else nombre_global_modulo(destino, nm),
                    'deClasico': bool(nat and nat.get('globalDe')), 'nombre': nm,
                    'edslOrigen': nat['origenDe'].get(nm) if (nat and nat.get('origenDe')) else None,
                    'cuantosTraia': len(exporta)}
            continue
        if s.get('alias'):
            if ocupado(s['alias']):
                errores.append(ErrorFuente('módulos', '«%s» ya está usado en este archivo' % s['alias'], s['linea'], s['col']))
                continue
            avisar_si_tapa(s, s['alias'])
            enl['alias'][s['alias']] = {'clave': destino, 'ruta': s['ruta'], 'exporta': exporta, 'globalDe': nat.get('globalDe') if nat else None}
            continue
        for nm in s['nombres']:
            if nm['nombre'] not in exporta:
                errores.append(ErrorFuente('módulos', '«%s» no exporta «%s»' % (s['ruta'], nm['nombre']), nm['linea'], nm['col'],
                                           ('exporta: ' + ', '.join(exporta.keys())) if exporta else 'no exporta nada: márcalo con «publico»'))
                continue
            if ocupado(nm['nombre']):
                errores.append(ErrorFuente('módulos', '«%s» ya está usado en este archivo' % nm['nombre'], nm['linea'], nm['col']))
                continue
            avisar_si_tapa(nm, nm['nombre'])
            enl['nombres'][nm['nombre']] = {'clave': destino, 'ruta': s['ruta'], 'tipo': exporta[nm['nombre']],
                                            'global': nat['globalDe'].get(nm['nombre']) if (nat and nat.get('globalDe')) else nombre_global_modulo(destino, nm['nombre'])}
    return enl


# ============================================================================
#  Verificador de tipos (gradual: lo anotado se comprueba, lo demás no)
# ============================================================================
class Ambito:
    def __init__(self, padre, retorno_esperado='heredar'):
        self.vars = {}
        self.padre = padre
        self.retorno_esperado = retorno_esperado if retorno_esperado != 'heredar' else (padre.retorno_esperado if padre else None)
        self.hay_retorno = False
        # (X5) lo que se sabe de más en este bloque: «x» (texto?) aquí no es nulo
        self.estrechos = {}

    def declarar(self, n, t, es_fijo):
        self.vars[n] = {'tipo': t, 'esFijo': es_fijo}

    def buscar(self, n):
        a = self
        while a:
            if n in a.estrechos:
                return a.estrechos[n]
            if n in a.vars:
                return a.vars[n]
            a = a.padre
        return None

    def estrechar(self, n, t):
        v = self.buscar(n)
        if v:
            self.estrechos[n] = dict(v, tipo=t)

    def desestrechar(self, n):
        a = self
        while a:
            a.estrechos.pop(n, None)
            a = a.padre


def _distancia(a, b):
    m, n2 = len(a), len(b)
    f = [[i] + [0] * n2 for i in range(m + 1)]
    for j in range(1, n2 + 1):
        f[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n2 + 1):
            f[i][j] = min(f[i - 1][j] + 1, f[i][j - 1] + 1, f[i - 1][j - 1] + (0 if a[i - 1] == b[j - 1] else 1))
    return f[m][n2]


def verificar_tipos(ast, globales_tipos, enlace, indice_edsl):
    errores, avisos = [], []

    def err(nodo, msg, pista=None):
        errores.append(ErrorFuente('tipos', msg, nodo['linea'], nodo['col'], pista))
        return T.cualquiera

    def aviso(fase, nodo, msg, pista=None):
        avisos.append(ErrorFuente(fase, msg, nodo['linea'], nodo['col'], pista, nivel='aviso'))

    raiz = Ambito(None, None)
    for n, t in globales_tipos.items():
        raiz.declarar(n, t, True)
    if enlace:
        for al, m in enlace['alias'].items():
            raiz.declarar(al, {'k': 'modulo', 'clave': m['clave'], 'ruta': m['ruta'], 'exporta': m['exporta']}, True)
        for nm, i in enlace['nombres'].items():
            raiz.vars[nm] = {'tipo': i.get('tipo') or T.cualquiera, 'esFijo': True, 'deModulo': i['ruta'], 'deClasico': i if i.get('deClasico') else None}

    clasico_usado = []

    def marcar_uso(v):
        if v and v.get('deClasico') and not any(x is v['deClasico'] for x in clasico_usado):
            clasico_usado.append(v['deClasico'])

    def avisar_si_tapa(nodo, nombre, que):
        if nombre not in globales_tipos:
            return
        aviso('nombres', nodo, '%s «%s» tapa a la de la biblioteca' % (que, nombre),
              'a partir de aquí «%s» ya no es la de Ñ; si es a propósito, ponle otro nombre para que se lea' % nombre)

    registros = {}
    if enlace:
        for i in enlace['nombres'].values():
            t = i.get('tipo')
            f = t and t['k'] == 'funcion' and t.get('ret') and t['ret'].get('forma')
            if f and f['nombre'] not in registros:
                registros[f['nombre']] = f

    def tipo_reg(nombre):
        return registros.get(nombre)

    def es_arreglo_de_numerico(amb):
        v = amb.buscar('arreglo')
        if not v:
            return False
        imp = enlace and enlace['nombres'].get('arreglo')
        if imp:
            return v is raiz.vars.get('arreglo') and imp['global'] in (nombre_global_modulo(clave_edsl('numerico'), 'arreglo'), nombre_global_modulo(clave_edsl('nen'), 'arreglo'))
        return v is raiz.vars.get('arreglo') and 'arreglo' in globales_tipos

    def lleva_literal_real(n):
        if n['tipo'] == 'Literal':
            return n['tipoLit'] is T.real
        if n['tipo'] == 'Unario' and n['op'] == '-':
            return lleva_literal_real(n['expr'])
        if n['tipo'] == 'ListaLit':
            return any(lleva_literal_real(x) for x in n['items'])
        return False

    def campo_de(r, nombre):
        return next((c for c in r['campos'] if c['nombre'] == nombre), None)

    def sin_campo(n, r, nombre):
        lista = [c['nombre'] for c in r['campos']] + list(r['metodos'].keys())
        cerca = sugerir_entre(nombre, lista)
        return err(n, '«%s» no tiene «%s»' % (r['nombre'], nombre),
                   ('¿querías decir «%s»? tiene: %s' % (cerca, ', '.join(lista))) if cerca else 'tiene: ' + ', '.join(lista))

    def unificar(param, arg, vinc):
        if not param or not arg:
            return None
        if param['k'] == 'var':
            if arg['k'] == 'cualquiera':
                return None
            ya = vinc.get(param['nombre'])
            if not ya:
                vinc[param['nombre']] = arg
                return None
            if compatible(ya, arg):
                return None
            if compatible(arg, ya):
                vinc[param['nombre']] = arg
                return None
            return '«%s» ya era %s y aquí llega %s' % (param['nombre'], tipo_a_texto(ya), tipo_a_texto(arg))
        if param['k'] == 'opcional':
            return unificar(param['de'], arg['de'] if arg['k'] == 'opcional' else arg, vinc)
        if param['k'] == 'lista' and arg['k'] == 'lista':
            return unificar(param['elem'], arg['elem'], vinc)
        if param['k'] == 'dic' and arg['k'] == 'dic':
            return unificar(param['clave'], arg['clave'], vinc) or unificar(param['valor'], arg['valor'], vinc)
        if (param['k'] == 'funcion' and arg['k'] == 'funcion' and param.get('params') is not None and arg.get('params') is not None
                and len(param['params']) == len(arg['params'])):
            for i in range(len(param['params'])):
                f = unificar(param['params'][i], arg['params'][i], vinc)
                if f:
                    return f
            return unificar(param['ret'], arg['ret'], vinc)
        return None

    def sustituir(t, vinc):
        if not t:
            return t
        if t['k'] == 'var':
            return vinc.get(t['nombre']) or T.cualquiera
        if t['k'] == 'opcional':
            return T.opcional(sustituir(t['de'], vinc))
        if t['k'] == 'lista':
            return T.lista(sustituir(t['elem'], vinc))
        if t['k'] == 'dic':
            return T.dic(sustituir(t['clave'], vinc), sustituir(t['valor'], vinc))
        if t['k'] == 'funcion':
            return T.fn([sustituir(x, vinc) for x in t['params']] if t.get('params') is not None else None, sustituir(t['ret'], vinc))
        return t

    # ── (X5) nulos al estilo Kotlin ──
    def nulos_en(c):
        vacio = lambda: {'si': set(), 'no': set()}
        if not c:
            return vacio()
        if c['tipo'] == 'Binario' and c['op'] in ('==', '!='):
            es_nulo = lambda x: x['tipo'] == 'Literal' and x['valor'] is None
            v = c['izq']['nombre'] if (c['izq']['tipo'] == 'Variable' and es_nulo(c['der'])) else (c['der']['nombre'] if (c['der']['tipo'] == 'Variable' and es_nulo(c['izq'])) else None)
            r = vacio()
            if v:
                (r['si'] if c['op'] == '!=' else r['no']).add(v)
            return r
        if c['tipo'] == 'Binario' and c['op'] in ('y', 'o'):
            a, b, r = nulos_en(c['izq']), nulos_en(c['der']), vacio()
            if c['op'] == 'y':
                r['si'] = a['si'] | b['si']
            else:
                r['no'] = a['no'] | b['no']
            return r
        if c['tipo'] == 'Unario' and c['op'] == 'no':
            a = nulos_en(c['expr'])
            return {'si': a['no'], 'no': a['si']}
        return vacio()

    def estrechar_no_nulo(amb, nombres):
        for x in nombres:
            v = amb.buscar(x)
            if v and v['tipo'] and v['tipo']['k'] == 'opcional':
                amb.estrechar(x, v['tipo']['de'])

    def termina_siempre(n):
        if not n:
            return False
        k = n['tipo']
        if k in ('Devolver', 'Lanzar', 'Romper', 'Continuar'):
            return True
        if k == 'Bloque':
            return any(termina_siempre(s) for s in n['cuerpo'])
        if k == 'Si':
            return bool(n.get('sino')) and termina_siempre(n['entonces']) and termina_siempre(n['sino'])
        if k == 'Intentar':
            if n.get('finalmente') and termina_siempre(n['finalmente']):
                return True
            return termina_siempre(n['cuerpo']) and (not n.get('captura') or termina_siempre(n['captura']))
        if k == 'Mientras':
            c = n['cond']
            siempre = (c['tipo'] == 'Literal' and c['valor'] is True) or (c['tipo'] == 'Unario' and c['op'] == 'no' and c['expr']['tipo'] == 'Literal' and c['expr']['valor'] is False)
            if not siempre:
                return False

            def hay_romper(x, anidado):
                if x['tipo'] == 'Romper' and not anidado:
                    return True
                if x['tipo'] == 'FuncionAnon':
                    return False
                dentro = anidado or x['tipo'] in ('Mientras', 'Para', 'Repetir')
                return any(hay_romper(h, dentro) for h in _hijos(x))
            return not hay_romper(n['cuerpo'], False)
        return False

    def describir(e):
        if e['tipo'] == 'Variable':
            return '«%s»' % e['nombre']
        if e['tipo'] == 'Propiedad' and e['obj']['tipo'] == 'Variable':
            return '«%s.%s»' % (e['obj']['nombre'], e['nombre'])
        if e['tipo'] == 'Llamada' and e['callee']['tipo'] == 'Variable':
            return 'lo que devuelve «%s»' % e['callee']['nombre']
        return 'el valor'

    def pista_nulo(e):
        if e['tipo'] == 'Variable':
            return 'comprueba antes con «si %s != nulo { … }», o dale un valor con «%s ?? …»' % (e['nombre'], e['nombre'])
        return 'comprueba antes con «si … != nulo { … }», o dale un valor con «… ?? …»'

    def comprobar_caminos(n, sub, nombre):
        if n.get('corrutina') or not n.get('retorno') or n['retorno']['k'] in ('nulo', 'cualquiera'):
            return
        if termina_siempre(n['cuerpo']):
            return
        err(n, ('«%s» promete devolver %s pero hay un camino que acaba sin «devolver»' if sub.hay_retorno
                else '«%s» promete devolver %s pero hay caminos sin «devolver»') % (nombre, tipo_a_texto(n['retorno'])),
            'por ese camino devolvería nulo; añade un «devolver» al final de la función')

    def sugerir_entre(nombre, lista):
        mejor, d0 = None, 3
        for x in lista:
            d = _distancia(nombre, x)
            if d < d0:
                d0, mejor = d, x
        return mejor

    def registrar_funciones(cuerpo, amb):
        for s in cuerpo:
            if s['tipo'] != 'DeclTipo':
                continue
            if s['nombre'] in registros:
                err(s, 'el registro «%s» ya estaba declarado' % s['nombre'])
                continue
            if s['nombre'] in amb.vars or s['nombre'] in globales_tipos:
                err(s, '«%s» ya es un nombre en uso; el registro necesita otro' % s['nombre'])
            campos = [{'nombre': c['nombre'], 'tipo': c['anotacion'] or T.cualquiera} for c in s['campos']]
            registros[s['nombre']] = {'nombre': s['nombre'], 'campos': campos, 'metodos': {}}
        for s in cuerpo:
            if s['tipo'] != 'DeclFuncion' or not s.get('metodo'):
                continue
            r = tipo_reg(s['metodo']['tipo'])
            if not r:
                err(s, '«%s» no es un registro de este archivo' % s['metodo']['tipo'])
                continue
            if campo_de(r, s['metodo']['nombre']):
                err(s, '«%s» ya tiene un campo llamado «%s»' % (r['nombre'], s['metodo']['nombre']), 'un método y un campo no pueden llamarse igual')
            if s['metodo']['nombre'] in r['metodos']:
                err(s, '«%s» ya tiene un método «%s»' % (r['nombre'], s['metodo']['nombre']))
            r['metodos'][s['metodo']['nombre']] = tipo_de_funcion(s, True)
        for s in cuerpo:
            if s['tipo'] == 'DeclFuncion':
                if amb is raiz:
                    avisar_si_tapa(s, s['nombre'], 'la función')
                amb.declarar(s['nombre'], tipo_de_funcion(s), True)

    def bloque_tipos(nodo, amb):
        for s in nodo['cuerpo']:
            sent(s, amb)

    def sent(n, amb):
        k = n['tipo']
        if k == 'DeclVar':
            tv = expr(n['valor'], amb) if n['valor'] else (T.nulo if n['anotacion'] else {'k': 'pendiente'})
            t = n['anotacion'] or tv
            if n['anotacion'] and not n['valor'] and not compatible(n['anotacion'], T.nulo):
                err(n, '«%s» es %s y no tiene valor' % (n['nombre'], tipo_a_texto(n['anotacion'])),
                    'dale un valor al declararla, o escribe «var %s: %s?» si puede estar vacía' % (n['nombre'], tipo_a_texto(n['anotacion'])))
            if n['anotacion'] and n['valor'] and not compatible(n['anotacion'], tv):
                if tv['k'] in ('nulo', 'opcional'):
                    pista = 'si «%s» puede estar vacía, decláralo «%s?»; si no, %s' % (n['nombre'], tipo_a_texto(n['anotacion']),
                                                                                     pista_nulo(n['valor']) if tv['k'] == 'opcional' else 'dale un valor de verdad')
                else:
                    pista = 'cambia la anotación o convierte el valor (por ejemplo con entero(x) o real(x))'
                err(n, '«%s» se declaró como %s pero recibe %s' % (n['nombre'], tipo_a_texto(n['anotacion']), tipo_a_texto(tv)), pista)
            if n['nombre'] in amb.vars:
                if amb is raiz and n['nombre'] in globales_tipos:
                    err(n, '«%s» es una función de la biblioteca y no se puede redeclarar' % n['nombre'], 'ponle otro nombre a la tuya')
                else:
                    err(n, '«%s» ya estaba declarada en este ámbito' % n['nombre'])
            amb.declarar(n['nombre'], t, n['esFijo'])
            return
        if k == 'DeclFuncion':
            if n['nombre'] not in amb.vars:
                amb.declarar(n['nombre'], tipo_de_funcion(n), True)
            sub = Ambito(amb, None if n.get('corrutina') else (n.get('retorno') or None))
            for p in n['params']:
                sub.declarar(p['nombre'], p['anotacion'] or T.cualquiera, bool(p.get('esYo')))
            bloque_tipos(n['cuerpo'], sub)
            comprobar_caminos(n, sub, n['nombre'])
            return
        if k == 'Bloque':
            if n.get('sinComprobar'):
                aviso('seguridad', n, '«sinComprobar»: aquí, en el ejecutable (n-compilar) y en los núcleos de C1EÑ en nativo y en la GPU, un índice fuera de rango o una división entre cero NO se dicen: el resultado es indefinido',
                      'la VM y C1EÑ en jit siguen comprobando: pruébalo ahí antes; quita el bloque si algo no cuadra')
            bloque_tipos(n, Ambito(amb))
            return
        if k == 'DeclTipo':
            return
        if k == 'Producir':
            expr(n['valor'], amb)
            return
        if k == 'Si':
            c = expr(n['cond'], amb)
            if c['k'] not in ('bool', 'cualquiera'):
                aviso('tipos', n, 'la condición de «si» es %s, no bool' % tipo_a_texto(c), 'se usará su valor de verdad')
            nn = nulos_en(n['cond'])
            ent = Ambito(amb)
            estrechar_no_nulo(ent, nn['si'])
            sent(n['entonces'], ent)
            if n.get('sino'):
                otro = Ambito(amb)
                estrechar_no_nulo(otro, nn['no'])
                sent(n['sino'], otro)
            if termina_siempre(n['entonces']):
                estrechar_no_nulo(amb, nn['no'])
            if n.get('sino') and termina_siempre(n['sino']):
                estrechar_no_nulo(amb, nn['si'])
            return
        if k == 'Mientras':
            expr(n['cond'], amb)
            sent(n['cuerpo'], Ambito(amb))
            return
        if k == 'Repetir':
            t = expr(n['cuantas'], amb)
            if not es_num(t):
                err(n, '«repetir» necesita un número y recibió %s' % tipo_a_texto(t))
            sent(n['cuerpo'], Ambito(amb))
            return
        if k == 'Para':
            it = expr(n['iterable'], amb)
            elem = T.cualquiera
            if it['k'] == 'lista':
                elem = it['elem']
            elif it['k'] == 'texto':
                elem = T.texto
            elif it['k'] not in ('cualquiera', 'dic', 'arreglo'):
                err(n, 'no se puede recorrer un valor de tipo %s' % tipo_a_texto(it), 'usa una lista, un texto, un arreglo o rango(n)')
            sub = Ambito(amb)
            sub.declarar(n['nombre'], elem, False)
            bloque_tipos(n['cuerpo'], sub)
            return
        if k == 'Devolver':
            t = expr(n['valor'], amb) if n['valor'] else T.nulo
            amb.hay_retorno = True
            a = amb
            while a:
                a.hay_retorno = True
                if a.retorno_esperado is not (a.padre.retorno_esperado if a.padre else None):
                    break
                a = a.padre
            esperado = amb.retorno_esperado
            if esperado and not compatible(esperado, t):
                err(n, 'esta función debe devolver %s y devuelve %s' % (tipo_a_texto(esperado), tipo_a_texto(t)))
            return
        if k in ('Romper', 'Continuar'):
            return
        if k == 'Lanzar':
            expr(n['valor'], amb)
            return
        if k == 'Intentar':
            sent(n['cuerpo'], Ambito(amb))
            if n.get('captura'):
                dentro = Ambito(amb)
                if n.get('nombreError'):
                    dentro.declarar(n['nombreError'], T.cualquiera, False)
                sent(n['captura'], dentro)
            if n.get('finalmente'):
                sent(n['finalmente'], Ambito(amb))
            return
        if k == 'ExprSent':
            expr(n['expr'], amb)
            return
        return

    def expr(n, amb):
        k = n['tipo']
        if k == 'Literal':
            return n['tipoLit']
        if k == 'Interpolacion':
            for q in n['partes']:
                expr(q, amb)
            return T.texto
        if k == 'Variable':
            if n['nombre'][:1] == ' ' and not amb.buscar(n['nombre']):
                return T.cualquiera
            v = amb.buscar(n['nombre'])
            if not v:
                return err(n, '«%s» no está definida' % n['nombre'], pista_nombre(n['nombre'], amb))
            if v['tipo'] and v['tipo']['k'] == 'modulo':
                return err(n, '«%s» es un módulo, no un valor' % n['nombre'],
                           'sirve para «%s.algo»; si necesitas pasar una de sus funciones, tráela con «usar … de …»' % n['nombre'])
            marcar_uso(v)
            if v['tipo'] and v['tipo']['k'] == 'var':
                return T.cualquiera
            if v['tipo'] and v['tipo']['k'] == 'pendiente':
                return T.cualquiera
            return v['tipo']
        if k == 'Asignacion':
            tv = expr(n['valor'], amb)
            d = n['destino']
            if d['tipo'] == 'Variable':
                v = amb.buscar(d['nombre'])
                if not v:
                    return err(n, '«%s» no está definida' % d['nombre'], pista_nombre(d['nombre'], amb))
                if v.get('deModulo'):
                    return err(n, '«%s» viene de «%s» y no se puede cambiar desde aquí' % (d['nombre'], v['deModulo']), 'lo que exporta un módulo solo lo cambia ese módulo')
                if v['tipo'] and v['tipo']['k'] == 'modulo':
                    return err(n, '«%s» es un módulo, no una variable' % d['nombre'])
                if v['esFijo']:
                    err(n, '«%s» es fijo y no se puede reasignar' % d['nombre'], 'decláralo con «var» si debe cambiar')
                if v['tipo'] and v['tipo']['k'] == 'pendiente':
                    if tv['k'] != 'nulo':
                        v['tipo'] = tv
                    return tv
                if n['op'] == '=' and not compatible(v['tipo'], tv):
                    err(n, ('el valor por defecto de «%s» es %s y el parámetro es %s' % (d['nombre'], tipo_a_texto(tv), tipo_a_texto(v['tipo'])))
                        if n.get('esDefecto') else '«%s» es %s y se le asigna %s' % (d['nombre'], tipo_a_texto(v['tipo']), tipo_a_texto(tv)),
                        ('si «%s» puede estar vacía, decláralo «%s?»' % (d['nombre'], tipo_a_texto(v['tipo'])))
                        if (tv['k'] in ('nulo', 'opcional') and v['tipo']['k'] != 'opcional') else None)
                if n['op'] == '=' and v['tipo'] and v['tipo']['k'] == 'opcional':
                    amb.desestrechar(d['nombre'])
                    if tv['k'] not in ('nulo', 'opcional', 'cualquiera'):
                        amb.estrechar(d['nombre'], v['tipo']['de'])
                return v['tipo']
            if d['tipo'] == 'Propiedad' and d['obj']['tipo'] == 'Variable':
                mod = amb.buscar(d['obj']['nombre'])
                if mod and mod['tipo'] and mod['tipo']['k'] == 'modulo':
                    return err(n, '«%s.%s» viene de «%s» y no se puede cambiar desde aquí' % (d['obj']['nombre'], d['nombre'], mod['tipo']['ruta']),
                               'lo que exporta un módulo solo lo cambia ese módulo')
            if d['tipo'] == 'Propiedad':
                o = expr(d['obj'], amb)
                r = tipo_reg(o['nombre']) if o['k'] == 'registro' else None
                if r:
                    c = campo_de(r, d['nombre'])
                    if not c:
                        if d['nombre'] in r['metodos']:
                            return err(n, '«%s» es un método de «%s» y no se puede reasignar' % (d['nombre'], r['nombre']))
                        return sin_campo(d, r, d['nombre'])
                    if n['op'] == '=' and not compatible(c['tipo'], tv):
                        err(n, '«%s.%s» es %s y se le asigna %s' % (r['nombre'], c['nombre'], tipo_a_texto(c['tipo']), tipo_a_texto(tv)))
                    return c['tipo']
                return tv
            expr(d, amb)
            return tv
        if k == 'Unario':
            t = expr(n['expr'], amb)
            if n['op'] == '-':
                if t['k'] == 'arreglo':
                    return T.arreglo
                if t['k'] == 'grande':
                    return T.grande
                if t['k'] == 'opcional':
                    return err(n, '%s puede ser nulo y aquí se le cambia el signo' % describir(n['expr']), pista_nulo(n['expr']))
                if not es_num(t):
                    err(n, '«-» necesita un número y recibió %s' % tipo_a_texto(t))
                return t
            return T.bool
        if k == 'Binario':
            op = n['op']
            a = expr(n['izq'], amb)
            if op in ('y', 'o'):
                sub = Ambito(amb)
                nn = nulos_en(n['izq'])
                estrechar_no_nulo(sub, nn['si'] if op == 'y' else nn['no'])
                b = expr(n['der'], sub)
            else:
                b = expr(n['der'], amb)
            if op == '??':
                if a['k'] == 'nulo':
                    return b
                if a['k'] == 'opcional':
                    d = a['de']
                    if b['k'] == 'nulo':
                        return a
                    if b['k'] == 'opcional':
                        return a if compatible(d, b['de']) else T.cualquiera
                    if b['k'] == 'cualquiera':
                        return T.cualquiera
                    if compatible(d, b):
                        return d
                    if compatible(b, d):
                        return b
                    return T.cualquiera
                if compatible(a, b) and compatible(b, a):
                    return a
                return T.cualquiera
            if op in ('o', 'y'):
                return T.bool
            if op in ('==', '!='):
                return T.bool
            if a['k'] == 'opcional' or b['k'] == 'opcional':
                e = n['izq'] if a['k'] == 'opcional' else n['der']
                return err(n, '%s puede ser nulo y aquí se usa con «%s»' % (describir(e), op), pista_nulo(e))
            if op in ('<', '<=', '>', '>='):
                dos_fechas = a['k'] == 'fecha' and b['k'] == 'fecha'
                con_grande = (a['k'] == 'grande' or b['k'] == 'grande') and (a['k'] == 'grande' or es_num(a)) and (b['k'] == 'grande' or es_num(b))
                if not (dos_fechas or con_grande or (es_num(a) and es_num(b)) or (a['k'] == 'texto' and b['k'] == 'texto') or a['k'] == 'cualquiera' or b['k'] == 'cualquiera'):
                    pista = ('una tabla no tiene orden; para ordenar sus filas usa ordenarPor(t, "columna")' if (a['k'] == 'tabla' or b['k'] == 'tabla')
                             else 'una fecha solo se compara con otra fecha; para sacar el número usa aMarca(f)' if (a['k'] == 'fecha' or b['k'] == 'fecha') else None)
                    err(n, 'no se pueden comparar %s y %s con «%s»' % (tipo_a_texto(a), tipo_a_texto(b), op), pista)
                return T.bool
            ARIT = ('+', '-', '*', '/', '//', '%', '**')
            if (a['k'] == 'grande' or b['k'] == 'grande') and op in ARIT:
                otro = b if a['k'] == 'grande' else a
                if otro['k'] == 'grande' or es_num(otro):
                    return T.grande
                if otro['k'] == 'arreglo':
                    return T.arreglo
                err(n, '«%s»: un grande se opera con otro grande o con un número, y llegó %s' % (op, tipo_a_texto(otro)), 'para pasar un texto a grande: grande("3.14159")')
                return T.grande
            if a['k'] == 'arreglo' or b['k'] == 'arreglo':
                if op in ARIT:
                    otro = b if a['k'] == 'arreglo' else a
                    if otro['k'] == 'arreglo' or es_num(otro) or otro['k'] == 'cualquiera':
                        return T.arreglo
                    err(n, '«%s»: un arreglo se opera con otro arreglo o con un número, y llegó %s' % (op, tipo_a_texto(otro)), 'para pasar una lista a arreglo usa arreglo(lista)')
                    return T.arreglo
            if op == '+':
                if a['k'] == 'texto' or b['k'] == 'texto':
                    if a['k'] != 'texto' or b['k'] != 'texto':
                        if a['k'] != 'cualquiera' and b['k'] != 'cualquiera':
                            err(n, 'no se puede sumar %s y %s' % (tipo_a_texto(a), tipo_a_texto(b)),
                                'en Python esto también falla; convierte con texto(...) — por ejemplo: "n = " + texto(n)')
                    return T.texto
                if a['k'] == 'lista' and b['k'] == 'lista':
                    return a
            if not es_num(a) or not es_num(b):
                if op == '+':
                    err(n, 'no se puede sumar %s y %s' % (tipo_a_texto(a), tipo_a_texto(b)), 'convierte a texto con texto(...) o revisa los tipos')
                else:
                    err(n, '«%s» necesita números y recibió %s y %s' % (op, tipo_a_texto(a), tipo_a_texto(b)))
                return T.cualquiera
            if op == '/':
                return T.real
            if op in ('//', '%'):
                return T.entero if (a['k'] == 'entero' and b['k'] == 'entero') else T.real
            if a['k'] == 'cualquiera' or b['k'] == 'cualquiera':
                return T.cualquiera
            return T.entero if (a['k'] == 'entero' and b['k'] == 'entero') else T.real
        if k == 'Llamada':
            ft = expr(n['callee'], amb)
            llamada_opcional = False
            if ft['k'] == 'opcional':
                if n['callee']['tipo'] == 'Propiedad' and n['callee'].get('opcional'):
                    llamada_opcional, ft = True, ft['de']
                else:
                    return err(n, '%s puede ser nulo y aquí se llama' % describir(n['callee']), pista_nulo(n['callee']))
            con_opcional = (lambda t: T.opcional(t)) if llamada_opcional else (lambda t: t)
            if (n['callee']['tipo'] == 'Variable' and n['callee']['nombre'] == 'arreglo' and len(n['args']) == 1
                    and n['args'][0]['tipo'] == 'ListaLit' and es_arreglo_de_numerico(amb) and lleva_literal_real(n['args'][0])):
                n['args'].append({'tipo': 'Literal', 'valor': 'real', 'tipoLit': T.texto, 'linea': n['linea'], 'col': n['col']})
            nom = ('«%s»' % n['callee']['nombre']) if n['callee']['tipo'] in ('Variable', 'Propiedad') else 'la función'
            es_fn = ft['k'] == 'funcion' and ft.get('params') is not None
            if n.get('nombrados') or (es_fn and len(n['args']) < len(ft['params']) and ft.get('minimos') is not None and ft['minimos'] < len(ft['params'])):
                if not (es_fn and ft.get('nombres')):
                    if n.get('nombrados'):
                        return err(n, 'los argumentos con nombre necesitan saber a qué función se llama, y aquí no se sabe',
                                   'llama a una función declarada con «fn», o pasa los argumentos por posición')
                else:
                    ranuras = [None] * len(ft['params'])
                    if len(n['args']) > len(ft['params']):
                        return err(n, '%s espera como mucho %d argumento(s) y recibió %d' % (nom, len(ft['params']), len(n['args'])))
                    for i, a in enumerate(n['args']):
                        ranuras[i] = a
                    for x in (n.get('nombrados') or []):
                        if x['nombre'] not in ft['nombres']:
                            return err(x, '%s no tiene ningún parámetro «%s»' % (nom, x['nombre']), 'sus parámetros son: ' + ', '.join(ft['nombres']))
                        i = ft['nombres'].index(x['nombre'])
                        if ranuras[i]:
                            return err(x, '«%s» ya llegó por posición' % x['nombre'], 'pásalo de una sola manera')
                        ranuras[i] = x['valor']
                    for i in range(len(ranuras)):
                        if ranuras[i]:
                            continue
                        if i < ft['minimos']:
                            pista = None
                            if ft['minimos'] < len(ft['params']):
                                pista = ('solo «%s» es obligatorio' % ft['nombres'][0] if ft['minimos'] == 1
                                         else '«%s» son obligatorios' % '», «'.join(ft['nombres'][:ft['minimos']])) + '; el resto tiene valor por defecto'
                            return err(n, '%s: falta el argumento «%s»' % (nom, ft['nombres'][i]), pista)
                        ranuras[i] = {'tipo': 'Variable', 'nombre': ' faltante', 'linea': n['linea'], 'col': n['col']}
                    n['args'] = ranuras
                    n.pop('nombrados', None)
            args = [expr(a, amb) for a in n['args']]
            if es_fn:
                if len(ft['params']) != len(args):
                    rango = ('entre %d y %d' % (ft['minimos'], len(ft['params']))) if (ft.get('minimos') is not None and ft['minimos'] < len(ft['params'])) else str(len(ft['params']))
                    err(n, '%s espera %s argumento(s) y recibió %d' % (nom, rango, len(args)))
                    return ft['ret']
                vinc = {} if ft.get('genericos') else None
                for i in range(len(args)):
                    if n['args'][i]['tipo'] == 'Variable' and n['args'][i]['nombre'] == ' faltante':
                        continue
                    if vinc is not None:
                        fallo = unificar(ft['params'][i], args[i], vinc)
                        if fallo:
                            err(n['args'][i], 'argumento %d: %s' % (i + 1, fallo))
                            continue
                    if not compatible(ft['params'][i], args[i]):
                        err(n['args'][i], 'argumento %d: se esperaba %s y llegó %s' % (i + 1, tipo_a_texto(ft['params'][i]), tipo_a_texto(args[i])),
                            pista_nulo(n['args'][i]) if args[i]['k'] in ('opcional', 'nulo') else None)
                return con_opcional(sustituir(ft['ret'], vinc) if vinc is not None else ft['ret'])
            if ft['k'] not in ('cualquiera', 'funcion'):
                err(n, '%s no es una función; no se puede llamar' % tipo_a_texto(ft))
            if ft['k'] == 'funcion' and ft.get('ret'):
                return con_opcional(ft['ret'])
            return T.cualquiera
        if k == 'Indice':
            o, i = expr(n['obj'], amb), expr(n['indice'], amb)
            if o['k'] == 'opcional':
                return err(n, '%s puede ser nulo y aquí se indexa' % describir(n['obj']), pista_nulo(n['obj']))
            if i['k'] == 'opcional':
                return err(n, 'el índice %s puede ser nulo' % describir(n['indice']), pista_nulo(n['indice']))
            if o['k'] == 'lista':
                if not es_num(i):
                    err(n, 'el índice de una lista debe ser entero y es %s' % tipo_a_texto(i))
                return o['elem']
            if o['k'] == 'texto':
                return T.texto
            if o['k'] == 'dic':
                return o['valor']
            if o['k'] == 'arreglo':
                if not es_num(i):
                    err(n, 'el índice de un arreglo debe ser entero y es %s' % tipo_a_texto(i))
                return T.cualquiera
            if o['k'] != 'cualquiera':
                err(n, 'no se puede indexar un valor de tipo %s' % tipo_a_texto(o))
            return T.cualquiera
        if k == 'Propiedad':
            mod = amb.buscar(n['obj']['nombre']) if n['obj']['tipo'] == 'Variable' else None
            if mod and mod['tipo'] and mod['tipo']['k'] == 'modulo':
                t = mod['tipo']['exporta'].get(n['nombre'])
                if t is None:
                    return err(n, '«%s» no exporta «%s»' % (mod['tipo']['ruta'], n['nombre']),
                               ('exporta: ' + ', '.join(mod['tipo']['exporta'].keys())) if mod['tipo']['exporta'] else 'no exporta nada: márcalo con «publico»')
                return t
            o = expr(n['obj'], amb)
            opcional = False
            if o['k'] == 'opcional':
                if not n.get('opcional'):
                    return err(n, '%s puede ser nulo y aquí se usa «.%s»' % (describir(n['obj']), n['nombre']),
                               ('escribe «%s?.%s», o comprueba antes con «si %s != nulo { … }»' % (n['obj']['nombre'], n['nombre'], n['obj']['nombre']))
                               if n['obj']['tipo'] == 'Variable' else pista_nulo(n['obj']))
                opcional, o = True, o['de']
            salida = (lambda t: T.opcional(t)) if opcional else (lambda t: t)
            if o['k'] == 'dic':
                return salida(o['valor'])
            if o['k'] == 'registro':
                r = tipo_reg(o['nombre'])
                if not r:
                    return T.cualquiera
                c = campo_de(r, n['nombre'])
                if c:
                    return salida(c['tipo'])
                if n['nombre'] in r['metodos']:
                    return salida(r['metodos'][n['nombre']])
                return sin_campo(n, r, n['nombre'])
            return T.cualquiera
        if k == 'Esperar':
            expr(n['valor'], amb)
            return T.cualquiera
        if k == 'SiExpr':
            c = expr(n['cond'], amb)
            if c['k'] not in ('bool', 'cualquiera'):
                aviso('tipos', n, 'la condición de «si» es %s, no bool' % tipo_a_texto(c), 'se usará su valor de verdad')
            nn = nulos_en(n['cond'])
            ent, otro = Ambito(amb), Ambito(amb)
            estrechar_no_nulo(ent, nn['si'])
            estrechar_no_nulo(otro, nn['no'])
            a, b = expr(n['entonces'], ent), expr(n['sino'], otro)
            if compatible(a, b) and compatible(b, a):
                return b if a['k'] == 'cualquiera' else a
            if (a['k'] == 'entero' and b['k'] == 'real') or (a['k'] == 'real' and b['k'] == 'entero'):
                return T.real
            return T.cualquiera
        if k == 'ListaLit':
            if not n['items']:
                return T.lista(T.cualquiera)
            ts = [expr(x, amb) for x in n['items']]
            e = ts[0]
            for t in ts:
                if not compatible(e, t):
                    if compatible(t, e):
                        e = t
                    else:
                        e = T.cualquiera
                        break
            return T.lista(e)
        if k == 'DicLit':
            for p in n['pares']:
                expr(p['clave'], amb)
                expr(p['valor'], amb)
            return T.dic(T.cualquiera, T.cualquiera)
        if k == 'FuncionAnon':
            sub = Ambito(amb, None if n.get('corrutina') else (n.get('retorno') or None))
            for p in n['params']:
                sub.declarar(p['nombre'], p['anotacion'] or T.cualquiera, False)
            bloque_tipos(n['cuerpo'], sub)
            comprobar_caminos(n, sub, '<anónima>')
            return tipo_de_funcion(n)
        return T.cualquiera

    def sugerir(nombre, amb, candidatos=None):
        cands = list(candidatos) if candidatos else []
        a = amb
        while a:
            cands.extend(a.vars.keys())
            a = a.padre
        mejor, mejor_d = None, 10 ** 9
        bajo = nombre.lower()
        for c in cands:
            dd = _distancia(bajo, c.lower())
            if dd < mejor_d:
                mejor_d, mejor = dd, c
        if mejor and mejor_d <= max(2, len(nombre) // 3):
            return '¿querías decir «%s»?' % mejor
        return None

    def en_que_edsl(nombre):
        if not indice_edsl:
            return None
        eds = indice_edsl.get(nombre)
        if not eds:
            return None
        if len(eds) == 1:
            return 'está en el eDSL «%s»: añade arriba  usar %s de "%s"' % (eds[0], nombre, eds[0])
        return 'está en los eDSL %s: añade arriba %s' % (' y '.join('«%s»' % e for e in eds), '  ·  '.join('usar %s de "%s"' % (nombre, e) for e in eds))

    def pista_nombre(nombre, amb):
        if nombre[:1] == '|':
            hay = sorted(k for k in globales_tipos if k[:1] == '|')
            return ('las constantes del lenguaje son ' + ', '.join(hay)) if hay else 'no hay constantes del lenguaje definidas'
        exacto = en_que_edsl(nombre)
        if exacto:
            return exacto
        cerca = sugerir(nombre, amb)
        if cerca:
            return cerca
        if not indice_edsl:
            return None
        p = sugerir(nombre, None, list(indice_edsl.keys()))
        if not p:
            return None
        m = re.search(r'«([^»]+)»', p)
        eds = m and indice_edsl.get(m.group(1))
        return '%s — está en el eDSL «%s»: usar %s de "%s"' % (p, eds[0], m.group(1), eds[0]) if eds else p

    registrar_funciones(ast['cuerpo'], raiz)
    for s in ast['cuerpo']:
        sent(s, raiz)

    usar_clasico = next((x for x in ast['cuerpo'] if x['tipo'] == 'Usar' and x.get('todo') and x['ruta'] == 'clasico'), None)
    if usar_clasico and not errores:
        usados = clasico_usado
        if not usados:
            aviso('nombres', usar_clasico, '«usar "clasico"» aquí no hace nada', 'este archivo no usa ninguno de los nombres que trae; se puede borrar la línea')
        elif len(usados) <= 3 and indice_edsl:
            por_edsl = {}
            for i in usados:
                donde = i.get('edslOrigen')
                if not donde:
                    continue
                por_edsl.setdefault(donde, []).append(i['nombre'])
            if por_edsl:
                lineas = ['usar %s de "%s"' % (', '.join(sorted(ns)), e) for e, ns in por_edsl.items()]
                traia = usados[0].get('cuantosTraia') or 0
                aviso('nombres', usar_clasico, '«usar "clasico"» trae %d nombres y este archivo usa %d' % (traia, len(usados)), 'con esto basta:  ' + '  ·  '.join(lineas))
    return errores, avisos


# ============================================================================
#  Lo que comprueba el compilador a bytecode (y aquí se comprueba sin compilar)
# ============================================================================
def comprobar_compilacion(ast):
    errores = []

    def fn_ctx(padre, corrutina, nombres):
        return {'padre': padre, 'bucles': 0, 'corrutina': corrutina, 'locales': set(nombres), 'script': padre is None}

    def sent(n, c):
        k = n['tipo']
        if k == 'Devolver':
            if c['script']:
                errores.append(ErrorFuente('compilación', '«devolver» solo puede ir dentro de una función', n['linea'], n['col']))
            if n['valor']:
                expr(n['valor'], c)
        elif k == 'Romper':
            if not c['bucles']:
                errores.append(ErrorFuente('compilación', '«romper» fuera de un bucle', n['linea'], n['col']))
        elif k == 'Continuar':
            if not c['bucles']:
                errores.append(ErrorFuente('compilación', '«continuar» fuera de un bucle', n['linea'], n['col']))
        elif k == 'DeclVar':
            c['locales'].add(n['nombre'])
            if n['valor']:
                expr(n['valor'], c)
        elif k == 'DeclFuncion':
            c['locales'].add(n['nombre'])
            funcion(n, c)
        elif k == 'Bloque':
            for s in n['cuerpo']:
                sent(s, c)
        elif k == 'Si':
            expr(n['cond'], c)
            sent(n['entonces'], c)
            if n.get('sino'):
                sent(n['sino'], c)
        elif k in ('Mientras', 'Repetir', 'Para'):
            expr(n['cond'] if k == 'Mientras' else n['cuantas'] if k == 'Repetir' else n['iterable'], c)
            if k == 'Para':
                c['locales'].add(n['nombre'])
            c['bucles'] += 1
            sent(n['cuerpo'], c)
            c['bucles'] -= 1
        elif k == 'Intentar':
            sent(n['cuerpo'], c)
            if n.get('captura'):
                if n.get('nombreError'):
                    c['locales'].add(n['nombreError'])
                sent(n['captura'], c)
            if n.get('finalmente'):
                sent(n['finalmente'], c)
        elif k in ('Lanzar', 'Producir'):
            expr(n['valor'], c)
        elif k == 'ExprSent':
            expr(n['expr'], c)

    def funcion(n, c):
        sub = fn_ctx(c, n.get('corrutina'), [p['nombre'] for p in n['params']])
        for s in n['cuerpo']['cuerpo']:
            sent(s, sub)

    def expr(n, c):
        if not isinstance(n, dict):
            return
        k = n['tipo']
        if k == 'Variable':
            # Un cierre que usa una variable de una corrutina: el compilador lo rechaza.
            if n['nombre'] not in c['locales']:
                x = c['padre']
                while x:
                    if n['nombre'] in x['locales']:
                        if x['corrutina'] and not x['script']:
                            errores.append(ErrorFuente('compilación', '«%s» es de una corrutina y una función de dentro la usa: eso todavía no se puede' % n['nombre'],
                                                       n['linea'], n['col'], 'pásasela como argumento, o saca esa función fuera de la corrutina'))
                        break
                    x = x['padre']
            return
        if k == 'FuncionAnon':
            funcion(n, c)
            return
        for key, v in n.items():
            if key in ('tipoLit', 'anotacion', 'retorno'):
                continue
            if isinstance(v, dict) and 'tipo' in v:
                expr(v, c)
            elif isinstance(v, list):
                for y in v:
                    if isinstance(y, dict):
                        if 'tipo' in y:
                            expr(y, c)
                        else:
                            for z in y.values():
                                if isinstance(z, dict) and 'tipo' in z:
                                    expr(z, c)

    raiz = fn_ctx(None, None, [])
    for s in ast['cuerpo']:
        sent(s, raiz)
    return errores


# ============================================================================
#  Lo que el motor solo ve al ejecutar: errores de ejecución y bucles
# ============================================================================
# Funciones de la biblioteca que no cambian nada y devuelven lo mismo para los
# mismos argumentos: una condición que solo las usa depende solo de sus variables.
# Las de la biblioteca que CAMBIAN lo que reciben (una lista o un diccionario).
# Pasar «x» a cualquier otra de la biblioteca no toca «x».
MUTADORAS = {'agregar', 'quitar', 'quitarEn', 'insertar', 'invertir', 'ordenar', 'borrar', 'limpiar', 'guardar', 'olvidar'}
PURAS = {'longitud', 'texto', 'entero', 'real', 'bool', 'tipo', 'contiene', 'indice', 'contar', 'maximo', 'minimo',
         'abs', 'redondear', 'piso', 'techo', 'raiz', 'potencia', 'mayusculas', 'minusculas', 'recortar', 'claves', 'valores'}
TERMINAN = ('Devolver', 'Romper', 'Continuar', 'Lanzar')
# Las del eDSL «probar» que reciben una función QUE DEBE FALLAR: lo que hay dentro no es un error.
ESPERAN_FALLO = {'debeFallar', 'debeFallarCon'}


def _hijos(n):
    """Las expresiones y sentencias hijas de un nodo, sin entrar en los tipos."""
    if not isinstance(n, dict):
        return
    for k, v in n.items():
        if k in ('tipoLit', 'anotacion', 'retorno'):
            continue
        if isinstance(v, dict) and 'tipo' in v:
            yield v
        elif isinstance(v, list):
            for y in v:
                if isinstance(y, dict):
                    if 'tipo' in y:
                        yield y
                    else:
                        for z in y.values():
                            if isinstance(z, dict) and 'tipo' in z:
                                yield z


def _recorrer(n, sin_funciones=False):
    """Todos los nodos bajo n (incluido), en preorden."""
    pila = [n]
    while pila:
        x = pila.pop()
        yield x
        if sin_funciones and x['tipo'] in ('FuncionAnon',):
            continue
        pila.extend(_hijos(x))


def _verdad(v):
    if v is None or v is False or v == 0 or v == '':
        return False
    return True


def valor_constante(e):
    """El valor de una expresión hecha solo de literales, o None si no se sabe."""
    k = e['tipo']
    if k == 'Literal':
        return ('ok', e['valor'])
    if k == 'Unario':
        r = valor_constante(e['expr'])
        if not r:
            return None
        v = r[1]
        if e['op'] == 'no':
            return ('ok', not _verdad(v))
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return ('ok', -v)
        return None
    if k == 'Binario':
        a, b = valor_constante(e['izq']), valor_constante(e['der'])
        if not a or not b:
            return None
        a, b, op = a[1], b[1], e['op']
        if op == 'y':
            return ('ok', _verdad(a) and _verdad(b))
        if op == 'o':
            return ('ok', _verdad(a) or _verdad(b))
        if op == '==':
            return ('ok', a == b and type(a) == type(b))
        if op == '!=':
            return ('ok', not (a == b and type(a) == type(b)))
        num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
        if num(a) and num(b):
            try:
                if op == '<':
                    return ('ok', a < b)
                if op == '<=':
                    return ('ok', a <= b)
                if op == '>':
                    return ('ok', a > b)
                if op == '>=':
                    return ('ok', a >= b)
                if op == '+':
                    return ('ok', a + b)
                if op == '-':
                    return ('ok', a - b)
                if op == '*':
                    return ('ok', a * b)
            except Exception:
                return None
        if isinstance(a, str) and isinstance(b, str) and op in ('<', '<=', '>', '>='):
            return ('ok', eval('a %s b' % op))
    return None


def _es_cero(e):
    r = valor_constante(e)
    return bool(r) and isinstance(r[1], (int, float)) and not isinstance(r[1], bool) and r[1] == 0


def _entero_literal(e):
    r = valor_constante(e)
    if r and isinstance(r[1], float) and r[1].is_integer():
        return int(r[1])
    if r and isinstance(r[1], int) and not isinstance(r[1], bool):
        return r[1]
    return None


def _texto_literal(e):
    r = valor_constante(e)
    return r[1] if r and isinstance(r[1], str) else None


def _base(destino):
    """La variable raíz de un destino: «a», «a[i]», «a.b.c» → «a»."""
    x = destino
    while x['tipo'] in ('Indice', 'Propiedad'):
        x = x['obj']
    return x['nombre'] if x['tipo'] == 'Variable' else None


def _salidas(cuerpo):
    """¿Hay algo en el cuerpo de un bucle que pueda sacar de él?"""
    def mira(n, anidado):
        k = n['tipo']
        if k in ('Devolver', 'Lanzar', 'Producir', 'Esperar'):
            return True
        if k in ('Romper',) and not anidado:
            return True
        if k == 'FuncionAnon':
            return False
        hondo = anidado or k in ('Mientras', 'Para', 'Repetir')
        return any(mira(h, hondo) for h in _hijos(n))
    return any(mira(s, False) for s in cuerpo['cuerpo'])


def analizar_ejecucion(ast, nombres_biblioteca):
    """Errores de ejecución y bucles que se ven sin correr el programa."""
    hallazgos = []

    def h(fase, nodo, msg, pista=None, nivel='error'):
        hallazgos.append(ErrorFuente(fase, msg, nodo['linea'], nodo['col'], pista, nivel=nivel))

    # ── literales que no cambian: listas y diccionarios que se declaran y nadie toca ──
    declarados, veces, mutados = {}, {}, set()
    for n in _recorrer(ast):
        k = n['tipo']
        if k == 'DeclVar':
            veces[n['nombre']] = veces.get(n['nombre'], 0) + 1
            v = n['valor']
            if v and v['tipo'] == 'ListaLit':
                declarados[n['nombre']] = ('lista', len(v['items']))
            elif v and v['tipo'] == 'DicLit' and all(p['clave']['tipo'] == 'Literal' for p in v['pares']):
                declarados[n['nombre']] = ('dic', set(p['clave']['valor'] for p in v['pares']))
        elif k in ('DeclFuncion', 'FuncionAnon'):
            for p in n['params']:
                veces[p['nombre']] = veces.get(p['nombre'], 0) + 1
        elif k == 'Para':
            veces[n['nombre']] = veces.get(n['nombre'], 0) + 1
        elif k == 'Intentar' and n.get('nombreError'):
            veces[n['nombreError']] = veces.get(n['nombreError'], 0) + 1
        elif k == 'Asignacion':
            b = _base(n['destino'])
            if b:
                mutados.add(b)
        elif k == 'Llamada':
            for a in n['args']:
                if a['tipo'] == 'Variable':
                    mutados.add(a['nombre'])
            if n['callee']['tipo'] == 'Propiedad':
                b = _base(n['callee'])
                if b:
                    mutados.add(b)
    fijos = {n: d for n, d in declarados.items() if veces.get(n) == 1 and n not in mutados}

    def forma_de(obj):
        if obj['tipo'] == 'ListaLit':
            return ('lista', len(obj['items']))
        if obj['tipo'] == 'DicLit' and all(p['clave']['tipo'] == 'Literal' for p in obj['pares']):
            return ('dic', set(p['clave']['valor'] for p in obj['pares']))
        if obj['tipo'] == 'Variable':
            return fijos.get(obj['nombre'])
        return None

    # ── funciones del nivel superior y sus llamadas sin condición ──
    funciones = {s['nombre']: s for s in ast['cuerpo'] if s['tipo'] == 'DeclFuncion' and not s.get('esConstructor')}

    def llamadas_incondicionales_expr(e, propios):
        out = set()
        k = e['tipo']
        if k == 'FuncionAnon':
            return out
        if k == 'Llamada':
            c = e['callee']
            if c['tipo'] == 'Variable' and c['nombre'] in funciones and c['nombre'] not in propios:
                out.add(c['nombre'])
            out |= llamadas_incondicionales_expr(c, propios)
            for a in e['args']:
                out |= llamadas_incondicionales_expr(a, propios)
            return out
        if k == 'Binario' and e['op'] in ('y', 'o', '??'):
            return llamadas_incondicionales_expr(e['izq'], propios)
        if k == 'SiExpr':
            return (llamadas_incondicionales_expr(e['cond'], propios)
                    | (llamadas_incondicionales_expr(e['entonces'], propios) & llamadas_incondicionales_expr(e['sino'], propios)))
        for hijo in _hijos(e):
            out |= llamadas_incondicionales_expr(hijo, propios)
        return out

    def puede_salir(n):
        """¿Hay en n (sin entrar en funciones) algo que pueda salir de la función o del bucle?"""
        return any(x['tipo'] in ('Devolver', 'Lanzar', 'Romper', 'Continuar') for x in _recorrer(n, sin_funciones=True))

    def llamadas_incondicionales(cuerpo, propios):
        """Las funciones a las que se llama seguro al entrar en «cuerpo», y si el
        recorrido se cortó (algo de dentro puede salir antes de llegar al final)."""
        out = set()
        for s in cuerpo:
            k = s['tipo']
            if k == 'ExprSent':
                out |= llamadas_incondicionales_expr(s['expr'], propios)
            elif k == 'DeclVar':
                if s['valor']:
                    out |= llamadas_incondicionales_expr(s['valor'], propios)
            elif k in ('Devolver', 'Lanzar', 'Producir'):
                if s.get('valor'):
                    out |= llamadas_incondicionales_expr(s['valor'], propios)
                return out, True
            elif k in ('Romper', 'Continuar'):
                return out, True
            elif k == 'Bloque':
                o, corto = llamadas_incondicionales(s['cuerpo'], propios)
                out |= o
                if corto:
                    return out, True
            elif k == 'Si':
                if s.get('esDefecto'):
                    continue
                out |= llamadas_incondicionales_expr(s['cond'], propios)
                if s.get('sino'):
                    a, _ = llamadas_incondicionales([s['entonces']], propios)
                    b, _ = llamadas_incondicionales([s['sino']], propios)
                    out |= a & b
                if puede_salir(s):
                    return out, True
            elif k == 'Mientras':
                out |= llamadas_incondicionales_expr(s['cond'], propios)
                if puede_salir(s):
                    return out, True
            elif k == 'Repetir':
                out |= llamadas_incondicionales_expr(s['cuantas'], propios)
                if puede_salir(s):
                    return out, True
            elif k == 'Para':
                out |= llamadas_incondicionales_expr(s['iterable'], propios)
                if puede_salir(s):
                    return out, True
            elif k == 'Intentar':
                if not s.get('captura'):
                    o, corto = llamadas_incondicionales(s['cuerpo']['cuerpo'], propios)
                    out |= o
                    if corto:
                        return out, True
                if s.get('finalmente'):
                    o, corto = llamadas_incondicionales(s['finalmente']['cuerpo'], propios)
                    out |= o
                    if corto:
                        return out, True
                if puede_salir(s):
                    return out, True
        return out, False

    grafo = {}
    for nombre, f in funciones.items():
        propios = set(p['nombre'] for p in f['params'])
        for n in _recorrer(f['cuerpo']):
            if n['tipo'] == 'DeclVar':
                propios.add(n['nombre'])
        grafo[nombre] = llamadas_incondicionales(f['cuerpo']['cuerpo'], propios)[0]

    # Dónde se llama a cada función: desde qué función (o el nivel superior) y si
    # ese sitio está dentro de un «intentar … capturar».
    sitios = []          # (función llamada, desde, protegido)

    def recoger_llamadas(n, protegido, desde):
        k = n['tipo']
        if k == 'Intentar':
            recoger_llamadas(n['cuerpo'], protegido or bool(n.get('captura')), desde)
            if n.get('captura'):
                recoger_llamadas(n['captura'], protegido, desde)
            if n.get('finalmente'):
                recoger_llamadas(n['finalmente'], protegido, desde)
            return
        if k == 'DeclFuncion':
            recoger_llamadas(n['cuerpo'], False, n['nombre'] if n['nombre'] in funciones else desde)
            return
        if k == 'Llamada' and n['callee']['tipo'] == 'Variable' and n['callee']['nombre'] in funciones:
            sitios.append((n['callee']['nombre'], desde, protegido))
        for hijo in _hijos(n):
            recoger_llamadas(hijo, protegido, desde)
    recoger_llamadas(ast, False, None)

    # Ciclos en el grafo de llamadas sin condición: cada función del ciclo se
    # llama a sí misma, tarde o temprano, sin que nada lo pare.
    estado, en_ciclo, ciclos = {}, set(), []

    def dfs(u, camino):
        estado[u] = 1
        camino.append(u)
        for v in sorted(grafo.get(u, ())):
            if estado.get(v) == 1:
                ciclo = camino[camino.index(v):]
                if not any(set(c) == set(ciclo) for c in ciclos):
                    ciclos.append(ciclo)
                en_ciclo.update(ciclo)
            elif estado.get(v) is None:
                dfs(v, camino)
        camino.pop()
        estado[u] = 2
    for u in sorted(grafo):
        if estado.get(u) is None:
            dfs(u, [])
    for ciclo in ciclos:
        f = funciones[ciclo[0]]
        miembros = set(ciclo)
        desde_fuera = [(fn, desde, prot) for (fn, desde, prot) in sitios if fn in miembros and desde not in miembros]
        libre = any(not prot for (_, _, prot) in desde_fuera)
        if len(ciclo) == 1:
            msg = '«%s» se llama a sí misma en todos sus caminos: ningún «si» la para' % ciclo[0]
        else:
            msg = 'recursión sin condición: %s' % ' → '.join('«%s»' % x for x in ciclo + [ciclo[0]])
        if libre:
            h('ejecución', f, msg, 'al llamarla, desbordamiento de pila seguro; pon el caso base dentro de un «si … { devolver … }»')
        else:
            h('ejecución', f, msg, 'no revienta el programa: nadie la llama' if not desde_fuera else 'solo se llama dentro de «intentar … capturar», que recoge el desbordamiento', nivel='aviso')

    # ── el recorrido con contexto: dónde estamos y qué protege ──
    def expr_ejec(e, ctx):
        k = e['tipo']
        nivel = 'aviso' if ctx['protegido'] else 'error'
        if k == 'Binario' and e['op'] in ('/', '//', '%') and _es_cero(e['der']):
            h('ejecución', e, 'división entre cero: el divisor de «%s» es 0' % e['op'],
                'el programa pararía aquí' if nivel == 'error' else 'lo recoge el «capturar» de fuera', nivel)
        if k == 'Indice':
            forma = forma_de(e['obj'])
            if forma and forma[0] == 'lista':
                i = _entero_literal(e['indice'])
                if i is not None:
                    n = forma[1]
                    kk = n + i if i < 0 else i
                    if kk < 0 or kk >= n:
                        h('ejecución', e, 'índice %d fuera de rango (la lista tiene %d elemento(s))' % (i, n),
                          ('los índices válidos van de 0 a %d, o de -1 a -%d' % (n - 1, n)) if n else 'la lista está vacía', nivel)
            elif forma and forma[0] == 'dic':
                c = _texto_literal(e['indice'])
                if c is not None and c not in forma[1]:
                    h('ejecución', e, 'la clave "%s" no existe en el diccionario' % c,
                      ('claves disponibles: ' + ', '.join('"%s"' % x for x in sorted(str(x) for x in forma[1])[:6])) if forma[1] else 'el diccionario está vacío', nivel)
        if k == 'Propiedad' and not e.get('opcional'):
            forma = forma_de(e['obj'])
            if forma and forma[0] == 'dic' and e['nombre'] not in forma[1]:
                h('ejecución', e, 'la clave "%s" no existe en el diccionario' % e['nombre'],
                  ('claves disponibles: ' + ', '.join('"%s"' % x for x in sorted(str(x) for x in forma[1])[:6])) if forma[1] else 'el diccionario está vacío', nivel)
        if k == 'FuncionAnon':
            funcion_ejec(e, ctx)
            return
        if k == 'Llamada' and e['callee']['tipo'] == 'Variable' and e['callee']['nombre'] in ESPERAN_FALLO:
            # «debeFallar(fn() { 1 / 0 })»: el fallo es lo que se está probando.
            for a in e['args']:
                if a['tipo'] == 'FuncionAnon':
                    funcion_ejec(a, ctx, protegido=True)
                else:
                    expr_ejec(a, ctx)
            return
        for hijo in _hijos(e):
            expr_ejec(hijo, ctx)

    def termina(stmts):
        for s in stmts:
            k = s['tipo']
            if k in ('Devolver', 'Lanzar'):
                return True
            if k == 'Bloque' and termina(s['cuerpo']):
                return True
            if k == 'Si' and s.get('sino') and termina([s['entonces']]) and termina([s['sino']]):
                return True
            if k == 'Intentar':
                if s.get('finalmente') and termina([s['finalmente']]):
                    return True
                if termina([s['cuerpo']]) and (not s.get('captura') or termina([s['captura']])):
                    return True
            if k == 'Mientras':
                v = valor_constante(s['cond'])
                if v and _verdad(v[1]) and not _salidas(s['cuerpo']):
                    return True
        return False

    def funcion_ejec(f, ctx, protegido=False):
        sub = {'protegido': protegido, 'bucles': [], 'enFuncion': True, 'nivelSuperior': False}
        cuerpo_ejec(f['cuerpo']['cuerpo'], sub)
        # (X5) el camino que acaba sin «devolver» lo para el verificador: aquí ya no se avisa

    def cuerpo_ejec(stmts, ctx):
        for i, s in enumerate(stmts):
            sent_ejec(s, ctx)
            if s['tipo'] in TERMINAN and i + 1 < len(stmts):
                sig = stmts[i + 1]
                pal = {'Devolver': 'devolver', 'Romper': 'romper', 'Continuar': 'continuar', 'Lanzar': 'lanzar'}[s['tipo']]
                h('ejecución', sig, 'código inalcanzable: va después de «%s» y nunca se ejecuta' % pal, nivel='aviso')
                break

    def revisar_mientras(n, ctx):
        salidas = _salidas(n['cuerpo'])
        v = valor_constante(n['cond'])
        if v is not None:
            if _verdad(v[1]):
                if not salidas:
                    h('bucle', n, 'bucle infinito: la condición siempre es cierta y nada sale del cuerpo (ni «romper», ni «devolver», ni «lanzar»)',
                      'el motor lo pararía por el límite de instrucciones; añade una condición o un «romper»')
            else:
                h('bucle', n, 'este «mientras» no entra nunca: su condición siempre es falsa', nivel='aviso')
            return
        if salidas:
            return
        vars_cond, llamadas_cond = set(), []
        for x in _recorrer(n['cond']):
            if x['tipo'] == 'Variable':
                vars_cond.add(x['nombre'])
            elif x['tipo'] == 'Llamada':
                llamadas_cond.append(x)
        for ll in llamadas_cond:
            c = ll['callee']
            if not (c['tipo'] == 'Variable' and c['nombre'] in PURAS and c['nombre'] in nombres_biblioteca):
                return
            vars_cond.discard(c['nombre'])
        if not vars_cond:
            return
        mutadas, impuro = set(), False
        for x in _recorrer(n['cuerpo']):
            k = x['tipo']
            if k == 'Asignacion':
                b = _base(x['destino'])
                if b:
                    mutadas.add(b)
            elif k == 'DeclVar':
                mutadas.add(x['nombre'])
            elif k == 'Para':
                mutadas.add(x['nombre'])
            elif k == 'FuncionAnon':
                impuro = True
            elif k == 'Llamada':
                c = x['callee']
                de_biblioteca = c['tipo'] == 'Variable' and c['nombre'] in nombres_biblioteca
                if not de_biblioteca or c['nombre'] in MUTADORAS:
                    for a in x['args']:
                        if a['tipo'] == 'Variable':
                            mutadas.add(a['nombre'])
                if c['tipo'] == 'Propiedad':
                    b = _base(c)
                    if b:
                        mutadas.add(b)
                    impuro = True
                elif not de_biblioteca:
                    impuro = True
        if impuro:
            return
        if not (vars_cond & mutadas):
            h('bucle', n, 'la condición de «mientras» no cambia dentro del bucle: si entra una vez, no sale nunca',
              'de %s no se asigna ninguna en el cuerpo, y nada lo rompe' % ', '.join('«%s»' % x for x in sorted(vars_cond)))
            return
        # ── la dirección: «mientras i < n» donde «i» solo baja ──
        c = n['cond']
        if c['tipo'] != 'Binario' or c['op'] not in ('<', '<=', '>', '>='):
            return
        lados = (c['izq'], c['der'])
        for lado, otro, op in ((lados[0], lados[1], c['op']), (lados[1], lados[0], {'<': '>', '<=': '>=', '>': '<', '>=': '<='}[c['op']])):
            if lado['tipo'] != 'Variable':
                continue
            v = lado['nombre']
            if any(x['tipo'] == 'Variable' and x['nombre'] == v for x in _recorrer(otro)):
                continue
            asigs = [x for x in _recorrer(n['cuerpo']) if x['tipo'] == 'Asignacion' and x['destino']['tipo'] == 'Variable' and x['destino']['nombre'] == v]
            otras = [x for x in _recorrer(n['cuerpo']) if x['tipo'] in ('Llamada', 'Para', 'DeclVar') and (
                (x['tipo'] == 'Llamada' and any(a['tipo'] == 'Variable' and a['nombre'] == v for a in x['args'])
                 and not (x['callee']['tipo'] == 'Variable' and x['callee']['nombre'] in nombres_biblioteca and x['callee']['nombre'] not in MUTADORAS)) or
                (x['tipo'] in ('Para', 'DeclVar') and x['nombre'] == v))]
            if not asigs or otras:
                continue
            direcciones = set()
            for a in asigs:
                paso = None
                if a['op'] in ('+=', '-='):
                    r = valor_constante(a['valor'])
                    if r and isinstance(r[1], (int, float)) and not isinstance(r[1], bool) and r[1] > 0:
                        paso = '+' if a['op'] == '+=' else '-'
                elif a['op'] == '=' and a['valor']['tipo'] == 'Binario' and a['valor']['op'] in ('+', '-'):
                    b = a['valor']
                    if b['izq']['tipo'] == 'Variable' and b['izq']['nombre'] == v:
                        r = valor_constante(b['der'])
                        if r and isinstance(r[1], (int, float)) and not isinstance(r[1], bool) and r[1] > 0:
                            paso = b['op']
                if paso is None:
                    direcciones.add('?')
                else:
                    direcciones.add(paso)
            if direcciones == {'-'} and op in ('<', '<='):
                h('bucle', n, '«%s» solo baja dentro del bucle y la condición «%s %s …» necesita que suba: no termina' % (v, v, op),
                  'cambia el sentido del paso o el de la comparación')
            elif direcciones == {'+'} and op in ('>', '>='):
                h('bucle', n, '«%s» solo sube dentro del bucle y la condición «%s %s …» necesita que baje: no termina' % (v, v, op),
                  'cambia el sentido del paso o el de la comparación')

    def sent_ejec(s, ctx):
        k = s['tipo']
        if k == 'DeclVar':
            if s['valor']:
                expr_ejec(s['valor'], ctx)
        elif k == 'DeclFuncion':
            funcion_ejec(s, ctx)
        elif k == 'Bloque':
            cuerpo_ejec(s['cuerpo'], ctx)
        elif k == 'Si':
            expr_ejec(s['cond'], ctx)
            sub = dict(ctx, nivelSuperior=False)
            sent_ejec(s['entonces'], sub)
            if s.get('sino'):
                sent_ejec(s['sino'], sub)
        elif k == 'Mientras':
            expr_ejec(s['cond'], ctx)
            revisar_mientras(s, ctx)
            sent_ejec(s['cuerpo'], dict(ctx, nivelSuperior=False))
        elif k == 'Repetir':
            expr_ejec(s['cuantas'], ctx)
            r = valor_constante(s['cuantas'])
            if r and isinstance(r[1], (int, float)) and not isinstance(r[1], bool) and r[1] <= 0:
                h('bucle', s, 'este «repetir» no entra nunca: repite %s veces' % (int(r[1]) if float(r[1]).is_integer() else r[1]), nivel='aviso')
            sent_ejec(s['cuerpo'], dict(ctx, nivelSuperior=False))
        elif k == 'Para':
            expr_ejec(s['iterable'], ctx)
            if s['iterable']['tipo'] == 'ListaLit' and not s['iterable']['items']:
                h('bucle', s, 'este «para» no entra nunca: recorre una lista vacía', nivel='aviso')
            sent_ejec(s['cuerpo'], dict(ctx, nivelSuperior=False))
        elif k == 'Intentar':
            sent_ejec(s['cuerpo'], dict(ctx, protegido=ctx['protegido'] or bool(s.get('captura')), nivelSuperior=False))
            if s.get('captura'):
                sent_ejec(s['captura'], dict(ctx, nivelSuperior=False))
            if s.get('finalmente'):
                sent_ejec(s['finalmente'], dict(ctx, nivelSuperior=False))
        elif k == 'Lanzar':
            expr_ejec(s['valor'], ctx)
            if ctx['nivelSuperior'] and not ctx['protegido']:
                h('ejecución', s, 'este «lanzar» del nivel superior no está dentro de ningún «intentar»: el programa termina aquí', nivel='aviso')
        elif k in ('Devolver', 'Producir'):
            if s.get('valor'):
                expr_ejec(s['valor'], ctx)
        elif k == 'ExprSent':
            expr_ejec(s['expr'], ctx)

    cuerpo_ejec(ast['cuerpo'], {'protegido': False, 'bucles': [], 'enFuncion': False, 'nivelSuperior': True})
    return hallazgos


# ============================================================================
#  El análisis de un archivo: todas las fases, como el motor
# ============================================================================
def analizar_archivo(ruta, bib, solo_motor=False):
    """Devuelve la lista de hallazgos (ErrorFuente, con .nivel) del archivo y sus módulos."""
    hallazgos = []
    try:
        with open(ruta, encoding='utf-8', errors='replace') as f:
            fuente = f.read()
    except Exception as e:
        hallazgos.append(ErrorFuente('archivo', 'no se pudo leer: %s' % e, 1, 1))
        return hallazgos
    try:
        ast = parser(lexer(fuente), 'principal')
    except ErrorFuente as e:
        hallazgos.append(e)
        return hallazgos
    clave = os.path.realpath(ruta)
    tipos = bib.globales
    ix = bib.indice_edsl()
    nombres_bib = set(tipos.keys())
    usos = [s for s in ast['cuerpo'] if s['tipo'] == 'Usar']
    enlace_raiz = None
    errores_modulos = False
    if usos:
        mods = Modulos(clave, bib.edsls)

        def sellar(lista, arch):
            for e in lista:
                if e and not e.archivo:
                    e.archivo = arch
            return lista
        errs, avs = [], []
        enlace_raiz = enlazar(ast, None, mods, errs, avs, tipos)
        hallazgos += errs + avs
        enlaces = {}
        i = 0
        while i < len(mods.orden):
            k = mods.orden[i]
            i += 1
            if k in enlaces:
                continue
            errs, avs = [], []
            try:
                enlaces[k] = enlazar(mods.ast[k], k, mods, errs, avs, tipos)
            except ErrorFuente as e:
                errs.append(e)
            hallazgos += sellar(errs, ruta_corta(k)) + sellar(avs, ruta_corta(k))
        for k in mods.orden:
            if k not in enlaces:
                continue
            a = mods.ast[k]
            errs, avs = verificar_tipos(a, tipos, enlaces[k], ix)
            hallazgos += sellar(avs, ruta_corta(k))
            if errs:
                hallazgos += sellar(errs, ruta_corta(k))
                errores_modulos = True
                continue
            hallazgos += sellar(comprobar_compilacion(a), ruta_corta(k))
            if not solo_motor:
                hallazgos += sellar(analizar_ejecucion(a, nombres_bib), ruta_corta(k))
    if solo_motor and (errores_modulos or any(e.nivel == 'error' for e in hallazgos)):
        return hallazgos
    errs, avs = verificar_tipos(ast, tipos, enlace_raiz, ix)
    hallazgos += avs
    hallazgos += errs
    if not errs:
        hallazgos += comprobar_compilacion(ast)
    if not solo_motor:
        hallazgos += analizar_ejecucion(ast, nombres_bib)
    return hallazgos


def expandir_rutas(rutas):
    out = []
    for r in rutas:
        if os.path.isdir(r):
            for base, _, archivos in os.walk(r):
                if 'node_modules' in base or os.sep + 'borrar' in base:
                    continue
                for a in sorted(archivos):
                    if a.endswith('.esl'):
                        out.append(os.path.join(base, a))
        elif any(c in r for c in '*?['):
            import glob
            out.extend(sorted(glob.glob(r, recursive=True)))
        else:
            out.append(r)
    return out


def cargar_biblioteca(ruta_firmas=None, perfil=None):
    if ruta_firmas:
        with open(ruta_firmas, encoding='utf-8') as f:
            tabla = json.load(f)
    else:
        tabla = json.loads(FIRMAS_JSON)
    bib = Biblioteca(tabla)
    if perfil:
        abiertos = (tabla.get('perfiles') or {}).get(perfil)
        if abiertos is None:
            raise Exception('no conozco el perfil «%s»; los que hay: %s' % (perfil, ', '.join((tabla.get('perfiles') or {}).keys()) or 'ninguno'))
        bib.abrir(abiertos)
    return bib


def main(argv=None):
    ap = argparse.ArgumentParser(prog='n-analizar.py', add_help=False,
                                 description='Comprueba programas Ñ (.esl) sin ejecutarlos: tipos, ejecución y bucles.')
    ap.add_argument('rutas', nargs='*', help='archivos .esl, carpetas (se recorren) o patrones')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--sin-avisos', action='store_true')
    ap.add_argument('--estricto', action='store_true')
    ap.add_argument('--solo-motor', action='store_true')
    ap.add_argument('--firmas', default=None)
    ap.add_argument('--c1en', action='store_true', help='perfil C1EÑ: «numerico» y «nen» abiertos sin «usar» (como n-node.js --c1en)')
    ap.add_argument('--volcar-firmas', action='store_true')
    ap.add_argument('--version', action='store_true')
    ap.add_argument('-h', '--ayuda', '--help', action='store_true')
    args = ap.parse_args(argv)
    if args.ayuda:
        print(__doc__.strip())
        return 0
    if args.version:
        print('n-analizar ' + VERSION)
        return 0
    if args.volcar_firmas:
        sys.stdout.write(FIRMAS_JSON)
        return 0
    rutas = expandir_rutas(args.rutas)
    if not rutas:
        print('uso: python n-analizar.py [opciones] programa.esl [más archivos | carpetas]   (-h para la ayuda)', file=sys.stderr)
        return 2
    try:
        bib = cargar_biblioteca(args.firmas, 'c1en' if args.c1en else None)
    except Exception as e:
        print('no se pudo cargar la tabla de firmas: %s' % e, file=sys.stderr)
        return 2

    total_err = total_av = 0
    salida_json = []
    for ruta in rutas:
        hs = analizar_archivo(ruta, bib, solo_motor=args.solo_motor)
        hs.sort(key=lambda e: ((e.archivo or ''), e.linea or 0, e.col or 0, 0 if e.nivel == 'error' else 1))
        if args.sin_avisos:
            hs = [e for e in hs if e.nivel == 'error']
        errs = [e for e in hs if e.nivel == 'error']
        avs = [e for e in hs if e.nivel != 'error']
        total_err += len(errs)
        total_av += len(avs)
        if args.json:
            for e in hs:
                d = e.como_dic()
                d['programa'] = ruta
                salida_json.append(d)
            continue
        estado = '✓' if not errs else '✗'
        print('%s %s · %d error(es) · %d aviso(s)' % (estado, ruta, len(errs), len(avs)))
        for e in hs:
            marca = '  ✗ ' if e.nivel == 'error' else '  ⚠ '
            print(marca + e.formato().replace('\n', '\n    '))
    if args.json:
        print(json.dumps(salida_json, ensure_ascii=False, indent=1))
    else:
        print('— %d archivo(s) · %d error(es) · %d aviso(s)' % (len(rutas), total_err, total_av))
    if total_err or (args.estricto and total_av):
        return 1
    return 0


# ============================================================================
#  La tabla de firmas del motor (ver «La tabla de firmas» arriba)
# ============================================================================
FIRMAS_JSON = r'''{
"globales": {
 "imprimir": "funcion(...): nulo",
 "texto": "funcion(cualquiera): texto",
 "entero": "funcion(cualquiera): entero",
 "real": "funcion(cualquiera): real",
 "bool": "funcion(cualquiera): bool",
 "tipo": "funcion(cualquiera): texto",
 "longitud": "funcion(cualquiera): entero",
 "rango": "funcion(...): lista<entero>",
 "afirmar": "funcion(...): nulo",
 "maximo": "funcion(...): cualquiera",
 "minimo": "funcion(...): cualquiera",
 "contiene": "funcion(cualquiera, cualquiera): bool",
 "agregar": "funcion(...): lista",
 "quitar": "funcion(lista, cualquiera): lista",
 "quitarEn": "funcion(lista, entero): cualquiera",
 "insertar": "funcion(lista, entero, cualquiera): lista",
 "indice": "funcion(lista, cualquiera): entero",
 "contar": "funcion(lista, cualquiera): entero",
 "invertir": "funcion(lista): lista",
 "copiar": "funcion(cualquiera): cualquiera",
 "ordenar": "funcion(...): lista",
 "mapear": "funcion(lista, funcion(...): cualquiera): lista",
 "filtrar": "funcion(lista, funcion(...): cualquiera): lista",
 "reducir": "funcion(lista, funcion(...): cualquiera, cualquiera): cualquiera",
 "rebanar": "funcion(...): lista",
 "aplanar": "funcion(lista): lista",
 "claves": "funcion(cualquiera): lista",
 "valores": "funcion(cualquiera): lista",
 "pares": "funcion(cualquiera): lista",
 "obtener": "funcion(cualquiera, cualquiera, cualquiera): cualquiera",
 "borrar": "funcion(cualquiera, cualquiera): cualquiera",
 "lienzo": "funcion(...): nulo",
 "limpiar": "funcion(...): nulo",
 "color": "funcion(...): nulo",
 "grosor": "funcion(real): nulo",
 "linea": "funcion(real, real, real, real): nulo",
 "rect": "funcion(...): nulo",
 "circulo": "funcion(...): nulo",
 "punto": "funcion(real, real): nulo",
 "escribirEn": "funcion(real, real, texto): nulo",
 "letra": "funcion(...): nulo",
 "graficar": "funcion(...): nulo",
 "barras": "funcion(...): nulo",
 "dispersion": "funcion(...): nulo",
 "etiqueta": "funcion(...): nodo",
 "crudo": "funcion(texto): nodo",
 "boton": "funcion(...): nodo",
 "entrada": "funcion(...): nodo",
 "areaTexto": "funcion(...): nodo",
 "casilla": "funcion(...): nodo",
 "desplegable": "funcion(...): nodo",
 "tabla": "funcion(...): nodo",
 "pintar": "funcion(...): nulo",
 "eco": "funcion(...): nulo",
 "limpiarPagina": "funcion(): nulo",
 "guardar": "funcion(texto, cualquiera): nulo",
 "recuperar": "funcion(...): cualquiera",
 "olvidar": "funcion(texto): bool",
 "guardados": "funcion(): lista<texto>",
 "luego": "funcion(real, cualquiera): entero",
 "cada": "funcion(real, cualquiera): entero",
 "detener": "funcion(entero): bool",
 "pedir": "funcion(...): cualquiera",
 "deJson": "funcion(texto): cualquiera",
 "aJson": "funcion(...): texto",
 "leerTexto": "funcion(texto): texto",
 "escribirTexto": "funcion(texto, texto): nulo",
 "agregarTexto": "funcion(texto, texto): nulo",
 "existeArchivo": "funcion(texto): bool",
 "esCarpeta": "funcion(texto): bool",
 "listar": "funcion(texto): lista<texto>",
 "crearCarpeta": "funcion(texto): nulo",
 "borrarArchivo": "funcion(texto): bool",
 "tamanoArchivo": "funcion(texto): entero",
 "leerArregloBinario": "funcion(texto, texto, lista): arreglo",
 "escribirArregloBinario": "funcion(texto, arreglo): nulo",
 "argumentos": "funcion(): lista<texto>",
 "entorno": "funcion(...): cualquiera",
 "ejecutar": "funcion(...): dic<texto,cualquiera>",
 "leerLinea": "funcion(...): cualquiera",
 "salir": "funcion(...): nulo",
 "hayNativo": "funcion(): bool",
 "cargarNativa": "funcion(texto): nulo",
 "descargarNativa": "funcion(texto): bool",
 "bibliotecasNativas": "funcion(): lista<texto>",
 "estructuraNativa": "funcion(texto, cualquiera): texto",
 "nativa": "funcion(...): funcion(...): cualquiera",
 "error": "funcion(...): error",
 "ahora": "funcion(): real",
 "reloj": "funcion(): real",
 "memoria": "funcion(): dic<texto,entero>",
 "recolectar": "funcion(): nulo",
 "instrucciones": "funcion(): entero",
 "|PI": "real",
 "|E": "real",
 "|INFINITO": "real"
},
"edsls": {
 "formato": {
  "numero": "funcion(real): texto",
  "decimales": "funcion(real, entero): texto",
  "moneda": "funcion(...): texto",
  "porciento": "funcion(...): texto",
  "porcientoCambio": "funcion(...): texto",
  "signoMas": "funcion(...): texto",
  "abreviar": "funcion(real): texto",
  "ordinal": "funcion(...): texto",
  "enLetras": "funcion(entero): texto",
  "romano": "funcion(entero): texto",
  "intervalo": "funcion(...): texto",
  "plural": "funcion(...): texto",
  "listaLegible": "funcion(...): texto",
  "mayusculaInicial": "funcion(texto): texto",
  "acortar": "funcion(...): texto",
  "elipsis": "funcion(...): texto",
  "alinearIzq": "funcion(...): texto",
  "alinearDer": "funcion(...): texto",
  "centrar": "funcion(...): texto",
  "aAncho": "funcion(...): texto",
  "rangoFechas": "funcion(...): texto",
  "tamanoLegible": "funcion(real): texto",
  "duracionLegible": "funcion(real): texto",
  "tiempoReloj": "funcion(real): texto",
  "tiempoRelativo": "funcion(real): texto",
  "regla": "funcion(...): texto",
  "barraTexto": "funcion(...): texto",
  "minigrafico": "funcion(lista<real>): texto",
  "marco": "funcion(...): texto",
  "tablaTexto": "funcion(...): texto",
  "columnas": "funcion(...): texto",
  "enRojo": "funcion(texto): texto",
  "enVerde": "funcion(texto): texto",
  "enAmarillo": "funcion(texto): texto",
  "enAzul": "funcion(texto): texto",
  "enGris": "funcion(texto): texto",
  "enNegrita": "funcion(texto): texto",
  "enTenue": "funcion(texto): texto",
  "enSubrayado": "funcion(texto): texto",
  "sinColor": "funcion(texto): texto",
  "separadores": "funcion(...): nulo",
  "monedaPorDefecto": "funcion(texto): nulo"
 },
 "fecha": {
  "fecha": "funcion(entero, entero, entero): fecha",
  "fechaHora": "funcion(...): fecha",
  "hoy": "funcion(): fecha",
  "ahora": "funcion(): fecha",
  "aFecha": "funcion(texto): fecha",
  "desdeMarca": "funcion(real): fecha",
  "anio": "funcion(fecha): entero",
  "mes": "funcion(fecha): entero",
  "dia": "funcion(fecha): entero",
  "hora": "funcion(fecha): entero",
  "minuto": "funcion(fecha): entero",
  "segundo": "funcion(fecha): entero",
  "diaSemana": "funcion(fecha): entero",
  "trimestre": "funcion(fecha): entero",
  "diaDelAnio": "funcion(fecha): entero",
  "semana": "funcion(fecha): entero",
  "nombreMes": "funcion(fecha): texto",
  "nombreDia": "funcion(fecha): texto",
  "mesCorto": "funcion(fecha): texto",
  "diaCorto": "funcion(fecha): texto",
  "sumarSegundos": "funcion(fecha, entero): fecha",
  "sumarMinutos": "funcion(fecha, entero): fecha",
  "sumarHoras": "funcion(fecha, entero): fecha",
  "sumarDias": "funcion(fecha, entero): fecha",
  "sumarSemanas": "funcion(fecha, entero): fecha",
  "sumarMeses": "funcion(fecha, entero): fecha",
  "sumarAnios": "funcion(fecha, entero): fecha",
  "inicioDia": "funcion(fecha): fecha",
  "finDia": "funcion(fecha): fecha",
  "inicioSemana": "funcion(fecha): fecha",
  "finSemana": "funcion(fecha): fecha",
  "inicioMes": "funcion(fecha): fecha",
  "finMes": "funcion(fecha): fecha",
  "inicioAnio": "funcion(fecha): fecha",
  "finAnio": "funcion(fecha): fecha",
  "segundosEntre": "funcion(fecha, fecha): entero",
  "minutosEntre": "funcion(fecha, fecha): entero",
  "horasEntre": "funcion(fecha, fecha): entero",
  "diasEntre": "funcion(fecha, fecha): entero",
  "mesesEntre": "funcion(fecha, fecha): entero",
  "aniosEntre": "funcion(fecha, fecha): entero",
  "duracion": "funcion(fecha, fecha): dic<texto,entero>",
  "esBisiesto": "funcion(fecha): bool",
  "diasDelMes": "funcion(fecha): entero",
  "esFinDeSemana": "funcion(fecha): bool",
  "esMismoDia": "funcion(fecha, fecha): bool",
  "estaEntre": "funcion(fecha, fecha, fecha): bool",
  "esAntesDe": "funcion(fecha, fecha): bool",
  "esDespuesDe": "funcion(fecha, fecha): bool",
  "deFecha": "funcion(...): texto",
  "aIso": "funcion(fecha): texto",
  "aMarca": "funcion(fecha): real"
 },
 "probar": {
  "probar": "funcion(texto, funcion(...): cualquiera): nulo",
  "saltar": "funcion(texto, funcion(...): cualquiera): nulo",
  "soloEsta": "funcion(texto, funcion(...): cualquiera): nulo",
  "grupo": "funcion(texto, funcion(...): cualquiera): nulo",
  "antesDeTodo": "funcion(funcion(...): cualquiera): nulo",
  "despuesDeTodo": "funcion(funcion(...): cualquiera): nulo",
  "antesDeCada": "funcion(funcion(...): cualquiera): nulo",
  "despuesDeCada": "funcion(funcion(...): cualquiera): nulo",
  "debeSer": "funcion(cualquiera, cualquiera): nulo",
  "noDebeSer": "funcion(cualquiera, cualquiera): nulo",
  "debeSerCierto": "funcion(cualquiera): nulo",
  "debeSerFalso": "funcion(cualquiera): nulo",
  "debeSerCerca": "funcion(...): nulo",
  "debeSerMayor": "funcion(cualquiera, cualquiera): nulo",
  "debeSerMenor": "funcion(cualquiera, cualquiera): nulo",
  "debeSerAlMenos": "funcion(cualquiera, cualquiera): nulo",
  "debeSerComoMucho": "funcion(cualquiera, cualquiera): nulo",
  "debeContener": "funcion(cualquiera, cualquiera): nulo",
  "noDebeContener": "funcion(cualquiera, cualquiera): nulo",
  "debeEmpezarCon": "funcion(texto, texto): nulo",
  "debeTerminarCon": "funcion(texto, texto): nulo",
  "debeEstarVacio": "funcion(cualquiera): nulo",
  "debeTener": "funcion(cualquiera, entero): nulo",
  "debeSerTipo": "funcion(cualquiera, texto): nulo",
  "debeFallar": "funcion(funcion(...): cualquiera): texto",
  "noDebeFallar": "funcion(funcion(...): cualquiera): nulo",
  "debeFallarCon": "funcion(funcion(...): cualquiera, texto): nulo",
  "espia": "funcion(funcion(...): cualquiera): funcion(...): cualquiera",
  "llamadasDe": "funcion(funcion(...): cualquiera): lista",
  "vecesLlamada": "funcion(funcion(...): cualquiera): entero",
  "soloFallos": "funcion(bool): nulo",
  "semillaPruebas": "funcion(entero): nulo",
  "afirmaciones": "funcion(): entero",
  "correrPruebas": "funcion(): dic<texto,entero>",
  "resumenPruebas": "funcion(): texto"
 },
 "texto": {
  "mayusculas": "funcion(texto): texto",
  "minusculas": "funcion(texto): texto",
  "recortar": "funcion(texto): texto",
  "dividir": "funcion(...): lista<texto>",
  "unir": "funcion(lista, texto): texto",
  "reemplazar": "funcion(texto, texto, texto): texto",
  "empiezaCon": "funcion(texto, texto): bool",
  "terminaCon": "funcion(texto, texto): bool",
  "subtexto": "funcion(texto, entero, entero): texto",
  "indiceDe": "funcion(...): entero",
  "ultimoIndiceDe": "funcion(texto, texto): entero",
  "cuantasVeces": "funcion(texto, texto): entero",
  "izquierda": "funcion(texto, entero): texto",
  "derecha": "funcion(texto, entero): texto",
  "entre": "funcion(texto, texto, texto): texto",
  "antesDe": "funcion(texto, texto): texto",
  "despuesDe": "funcion(texto, texto): texto",
  "recortarIzq": "funcion(texto): texto",
  "recortarDer": "funcion(texto): texto",
  "quitarPrefijo": "funcion(texto, texto): texto",
  "quitarSufijo": "funcion(texto, texto): texto",
  "capitalizar": "funcion(texto): texto",
  "titular": "funcion(texto): texto",
  "reemplazarPrimero": "funcion(texto, texto, texto): texto",
  "repetirTexto": "funcion(texto, entero): texto",
  "invertirTexto": "funcion(texto): texto",
  "lineas": "funcion(texto): lista<texto>",
  "palabras": "funcion(texto): lista<texto>",
  "caracteres": "funcion(texto): lista<texto>",
  "envolver": "funcion(texto, entero): lista<texto>",
  "sangrar": "funcion(...): texto",
  "desangrar": "funcion(texto): texto",
  "sinAcentos": "funcion(texto): texto",
  "igualSinAcentos": "funcion(texto, texto): bool",
  "ordenAlfabetico": "funcion(lista): lista",
  "distancia": "funcion(texto, texto): entero",
  "parecido": "funcion(texto, texto): real",
  "aUrl": "funcion(texto): texto",
  "aIdentificador": "funcion(texto): texto",
  "codigo": "funcion(texto): entero",
  "deCodigo": "funcion(entero): texto",
  "esLetra": "funcion(texto): bool",
  "esDigito": "funcion(texto): bool",
  "esEspacio": "funcion(texto): bool",
  "esVocal": "funcion(texto): bool",
  "esMayuscula": "funcion(texto): bool",
  "plantilla": "funcion(texto, dic): texto",
  "escaparHtml": "funcion(texto): texto",
  "escaparCsv": "funcion(texto): texto"
 },
 "numerico": {
  "raiz": "funcion(real|arreglo): cualquiera",
  "absoluto": "funcion(real|arreglo): cualquiera",
  "piso": "funcion(real|arreglo): cualquiera",
  "techo": "funcion(real|arreglo): cualquiera",
  "seno": "funcion(real|arreglo): cualquiera",
  "coseno": "funcion(real|arreglo): cualquiera",
  "tangente": "funcion(real|arreglo): cualquiera",
  "arcoseno": "funcion(real|arreglo): cualquiera",
  "arcocoseno": "funcion(real|arreglo): cualquiera",
  "arcotangente": "funcion(real|arreglo): cualquiera",
  "exp": "funcion(real|arreglo): cualquiera",
  "log": "funcion(real|arreglo): cualquiera",
  "log10": "funcion(real|arreglo): cualquiera",
  "signo": "funcion(real|arreglo): cualquiera",
  "redondear": "funcion(...): real",
  "potencia": "funcion(real, real): real",
  "suma": "funcion(...): cualquiera",
  "media": "funcion(...): cualquiera",
  "mediana": "funcion(lista<real>|arreglo): real",
  "moda": "funcion(lista<real>|arreglo): real",
  "varianza": "funcion(lista<real>|arreglo): real",
  "desviacion": "funcion(lista<real>|arreglo): real",
  "percentil": "funcion(lista<real>|arreglo, real): real",
  "correlacion": "funcion(lista<real>|arreglo, lista<real>|arreglo): real",
  "regresion": "funcion(lista<real>|arreglo, lista<real>|arreglo): dic<texto,real>",
  "normalizar": "funcion(lista<real>|arreglo): lista<real>",
  "histograma": "funcion(lista<real>|arreglo, entero): lista<entero>",
  "matriz": "funcion(entero, entero, cualquiera): lista",
  "transponer": "funcion(lista): lista",
  "multMatriz": "funcion(lista, lista): lista",
  "determinante": "funcion(lista): real",
  "resolver": "funcion(lista, lista<real>|arreglo): lista<real>",
  "truncar": "funcion(...): real",
  "acotar": "funcion(real, real, real): real",
  "entre": "funcion(real, real, real): bool",
  "casiIgual": "funcion(...): bool",
  "raizN": "funcion(real, real): real",
  "log2": "funcion(real): real",
  "angulo": "funcion(real, real): real",
  "grados": "funcion(real): real",
  "radianes": "funcion(real): real",
  "hipotenusa": "funcion(...): real",
  "producto": "funcion(lista<real>|arreglo): real",
  "amplitud": "funcion(lista<real>|arreglo): real",
  "cuartiles": "funcion(lista<real>|arreglo): dic<texto,real>",
  "acumulado": "funcion(lista<real>|arreglo): lista<real>",
  "covarianza": "funcion(lista<real>|arreglo, lista<real>|arreglo): real",
  "tendencia": "funcion(lista<real>|arreglo): real",
  "tipificar": "funcion(lista<real>|arreglo): lista<real>",
  "azar": "funcion(): real",
  "azarEntre": "funcion(entero, entero): entero",
  "azarNormal": "funcion(...): real",
  "elegir": "funcion(lista): cualquiera",
  "elegirVarios": "funcion(lista, entero): lista",
  "barajar": "funcion(lista): lista",
  "semilla": "funcion(entero): nulo",
  "identidad": "funcion(entero): lista",
  "traza": "funcion(lista|arreglo): real",
  "inversa": "funcion(lista): lista",
  "esPrimo": "funcion(entero): bool",
  "primos": "funcion(entero): lista<entero>",
  "mcd": "funcion(...): entero",
  "mcm": "funcion(...): entero",
  "factorial": "funcion(entero): real",
  "combinaciones": "funcion(entero, entero): real",
  "permutaciones": "funcion(entero, entero): real",
  "divisores": "funcion(entero): lista<entero>",
  "valorFuturo": "funcion(real, real, entero): real",
  "valorPresente": "funcion(real, real, entero): real",
  "interesCompuesto": "funcion(...): real",
  "tasaEfectiva": "funcion(real, entero): real",
  "cuota": "funcion(real, real, entero): real",
  "amortizacion": "funcion(real, real, entero): lista",
  "arreglo": "funcion(...): arreglo",
  "ceros": "funcion(...): arreglo",
  "unos": "funcion(...): arreglo",
  "lleno": "funcion(...): arreglo",
  "secuencia": "funcion(...): arreglo",
  "reparto": "funcion(...): arreglo",
  "azarArreglo": "funcion(...): arreglo",
  "forma": "funcion(arreglo): lista",
  "dimensiones": "funcion(arreglo): entero",
  "tamano": "funcion(arreglo): entero",
  "tipoArreglo": "funcion(arreglo): texto",
  "epsilonTipo": "funcion(arreglo|texto): real",
  "minimoTipo": "funcion(arreglo|texto): cualquiera",
  "maximoTipo": "funcion(arreglo|texto): cualquiera",
  "esVista": "funcion(arreglo): bool",
  "redimensionar": "funcion(...): arreglo",
  "transpuesta": "funcion(arreglo): arreglo",
  "fila": "funcion(arreglo, entero): arreglo",
  "copia": "funcion(arreglo): arreglo",
  "aListaA": "funcion(arreglo): lista",
  "elemento": "funcion(...): real",
  "ponerElemento": "funcion(...): arreglo",
  "mayorQue": "funcion(cualquiera, cualquiera): arreglo",
  "menorQue": "funcion(cualquiera, cualquiera): arreglo",
  "mayorIgualQue": "funcion(cualquiera, cualquiera): arreglo",
  "menorIgualQue": "funcion(cualquiera, cualquiera): arreglo",
  "igualA": "funcion(cualquiera, cualquiera): arreglo",
  "distintoA": "funcion(cualquiera, cualquiera): arreglo",
  "yA": "funcion(...): arreglo",
  "oA": "funcion(...): arreglo",
  "noA": "funcion(arreglo): arreglo",
  "esNaN": "funcion(arreglo): arreglo",
  "esFinito": "funcion(arreglo): arreglo",
  "todos": "funcion(...): bool",
  "alguno": "funcion(...): bool",
  "contarCiertos": "funcion(...): entero",
  "donde": "funcion(...): arreglo",
  "enMascara": "funcion(arreglo, arreglo): arreglo",
  "ponerEnMascara": "funcion(...): arreglo",
  "recortar": "funcion(...): arreglo",
  "maximoDe": "funcion(...): arreglo",
  "minimoDe": "funcion(...): arreglo",
  "argMaximo": "funcion(...): cualquiera",
  "argMinimo": "funcion(...): cualquiera",
  "acumSuma": "funcion(...): arreglo",
  "acumProducto": "funcion(...): arreglo",
  "acumMaximo": "funcion(...): arreglo",
  "acumMinimo": "funcion(...): arreglo",
  "diferencias": "funcion(...): arreglo",
  "cuantil": "funcion(...): real",
  "normaVector": "funcion(...): real",
  "estandarizar": "funcion(arreglo): arreglo",
  "mediaMovil": "funcion(...): arreglo",
  "sumaSinNaN": "funcion(...): real",
  "mediaSinNaN": "funcion(...): real",
  "minimoSinNaN": "funcion(...): real",
  "maximoSinNaN": "funcion(...): real",
  "aCero": "funcion(...): arreglo",
  "aplanarA": "funcion(arreglo): arreglo",
  "expandir": "funcion(arreglo, entero): arreglo",
  "apretar": "funcion(...): arreglo",
  "difundirA": "funcion(arreglo, lista): arreglo",
  "concatenar": "funcion(...): arreglo",
  "apilar": "funcion(...): arreglo",
  "trozo": "funcion(...): arreglo",
  "trozoPaso": "funcion(...): arreglo",
  "trozoVarios": "funcion(arreglo, lista): arreglo",
  "vacio": "funcion(...): arreglo",
  "cerosComo": "funcion(...): arreglo",
  "unosComo": "funcion(...): arreglo",
  "vacioComo": "funcion(...): arreglo",
  "bitsY": "funcion(...): cualquiera",
  "bitsO": "funcion(...): cualquiera",
  "bitsXor": "funcion(...): cualquiera",
  "desplazarIzq": "funcion(...): cualquiera",
  "desplazarDer": "funcion(...): cualquiera",
  "bitsNo": "funcion(...): cualquiera",
  "contarBits": "funcion(...): cualquiera",
  "aTipo": "funcion(arreglo, texto): arreglo",
  "por": "funcion(arreglo, arreglo): arreglo",
  "productoPunto": "funcion(arreglo, arreglo): real",
  "factorLU": "funcion(arreglo): dic",
  "factorQR": "funcion(arreglo): dic",
  "factorCholesky": "funcion(arreglo): arreglo",
  "descomponerSVD": "funcion(arreglo): dic",
  "valoresSingulares": "funcion(arreglo): arreglo",
  "resolverA": "funcion(arreglo, arreglo): arreglo",
  "resolverTriangular": "funcion(arreglo, arreglo): arreglo",
  "minimosCuadrados": "funcion(arreglo, arreglo): arreglo",
  "pseudoInversa": "funcion(arreglo): arreglo",
  "determinanteA": "funcion(arreglo): real",
  "inversaA": "funcion(arreglo): arreglo",
  "rangoMatriz": "funcion(arreglo): entero",
  "condicion": "funcion(arreglo): real",
  "normaMatriz": "funcion(...): real",
  "potenciaMatriz": "funcion(arreglo, entero): arreglo",
  "autoSimetrica": "funcion(arreglo): dic",
  "autovalores": "funcion(arreglo): arreglo",
  "identidadA": "funcion(entero): arreglo",
  "diagonal": "funcion(arreglo): arreglo",
  "triangularSuperior": "funcion(...): arreglo",
  "triangularInferior": "funcion(...): arreglo",
  "externo": "funcion(arreglo, arreglo): arreglo",
  "kronecker": "funcion(arreglo, arreglo): arreglo",
  "esSimetrica": "funcion(arreglo): bool",
  "esDefinidaPositiva": "funcion(arreglo): bool",
  "complejo": "funcion(...): arreglo",
  "parteReal": "funcion(arreglo): arreglo",
  "parteImaginaria": "funcion(arreglo): arreglo",
  "conjugado": "funcion(arreglo): arreglo",
  "fase": "funcion(arreglo): arreglo",
  "desdePolar": "funcion(arreglo, arreglo): arreglo",
  "esComplejo": "funcion(arreglo): bool",
  "fourier": "funcion(arreglo): arreglo",
  "fourierInversa": "funcion(arreglo): arreglo",
  "espectro": "funcion(arreglo): arreglo",
  "frecuencias": "funcion(...): arreglo",
  "convolucion": "funcion(arreglo, arreglo): arreglo",
  "ordenarA": "funcion(...): arreglo",
  "argOrdenar": "funcion(arreglo): arreglo",
  "tomar": "funcion(arreglo, arreglo): arreglo",
  "unicosConCuentas": "funcion(arreglo): dic",
  "estaEn": "funcion(arreglo, arreglo): arreglo",
  "uniformes": "funcion(...): arreglo",
  "normales": "funcion(...): arreglo",
  "enteros": "funcion(...): arreglo",
  "barajarJuntos": "funcion(...): lista"
 },
 "datos": {
  "deRegistros": "funcion(lista): tabla",
  "deColumnas": "funcion(dic): tabla",
  "deLista": "funcion(lista, lista): tabla",
  "deCsv": "funcion(...): tabla",
  "deDatos": "funcion(texto): tabla",
  "aDatos": "funcion(...): texto",
  "aCsv": "funcion(...): texto",
  "aLista": "funcion(tabla): lista",
  "aRegistros": "funcion(tabla): lista",
  "aColumnas": "funcion(tabla): dic",
  "columnas": "funcion(tabla): lista<texto>",
  "tipos": "funcion(tabla): dic<texto,texto>",
  "primeras": "funcion(...): tabla",
  "ultimas": "funcion(...): tabla",
  "vacios": "funcion(tabla): dic<texto,entero>",
  "describir": "funcion(tabla): tabla",
  "vistazo": "funcion(...): nulo",
  "columna": "funcion(tabla, texto): lista",
  "celda": "funcion(tabla, entero, texto): cualquiera",
  "fila": "funcion(tabla, entero): dic",
  "soloColumnas": "funcion(tabla, lista): tabla",
  "sinColumna": "funcion(...): tabla",
  "renombrar": "funcion(tabla, texto, texto): tabla",
  "reordenar": "funcion(tabla, lista): tabla",
  "donde": "funcion(tabla, funcion(...): cualquiera): tabla",
  "ordenarPor": "funcion(...): tabla",
  "unicas": "funcion(tabla, texto): lista",
  "sinRepetir": "funcion(...): tabla",
  "quitarVacios": "funcion(...): tabla",
  "conColumna": "funcion(tabla, texto, funcion(...): cualquiera): tabla",
  "convertir": "funcion(tabla, texto, texto): tabla",
  "aplicarA": "funcion(tabla, texto, funcion(...): cualquiera): tabla",
  "rellenarVacios": "funcion(tabla, texto, cualquiera): tabla",
  "numerar": "funcion(...): tabla",
  "sumaCol": "funcion(...): dic",
  "promedioCol": "funcion(...): dic",
  "minCol": "funcion(...): dic",
  "maxCol": "funcion(...): dic",
  "primeroCol": "funcion(...): dic",
  "ultimoCol": "funcion(...): dic",
  "contarCol": "funcion(...): dic",
  "juntarCol": "funcion(...): dic",
  "agrupar": "funcion(tabla, lista, dic): tabla",
  "resumir": "funcion(tabla, dic): tabla",
  "contarPor": "funcion(...): tabla",
  "pivotar": "funcion(tabla, texto, texto, dic): tabla",
  "despivotar": "funcion(...): tabla",
  "cruzar": "funcion(...): tabla",
  "apilar": "funcion(...): tabla",
  "juntarColumnas": "funcion(...): tabla",
  "diferencia": "funcion(tabla, tabla, texto): tabla"
 },
 "corrutinas": {
  "siguiente": "funcion(...): cualquiera",
  "terminado": "funcion(cualquiera): bool",
  "recoger": "funcion(cualquiera): lista",
  "dormir": "funcion(real): cualquiera",
  "todas": "funcion(lista): cualquiera"
 },
 "nativo": {
  "cabeceraNativa": "funcion(texto, texto): dic",
  "tipoNativo": "funcion(texto): texto",
  "retrollamada": "funcion(cualquiera, texto): cualquiera",
  "soltarRetrollamada": "funcion(cualquiera): nulo",
  "reservarMemoria": "funcion(entero): cualquiera",
  "leerMemoria": "funcion(...): cualquiera",
  "escribirMemoria": "funcion(cualquiera, texto, cualquiera): nulo",
  "textoDeMemoria": "funcion(cualquiera): texto",
  "tamanoNativo": "funcion(texto): entero",
  "direccion": "funcion(cualquiera): entero",
  "errorC": "funcion(): entero",
  "enFondo": "funcion(...): cualquiera"
 },
 "sistema": {
  "leerLineas": "funcion(texto): cualquiera",
  "copiarArchivo": "funcion(texto, texto): nulo",
  "moverArchivo": "funcion(texto, texto): nulo",
  "infoArchivo": "funcion(texto): dic<texto,cualquiera>",
  "carpetaActual": "funcion(): texto",
  "cambiarCarpeta": "funcion(texto): nulo",
  "infoSistema": "funcion(): dic<texto,cualquiera>",
  "ejecutarEnFondo": "funcion(...): cualquiera",
  "respuesta": "funcion(...): dic<texto,cualquiera>",
  "servir": "funcion(...): cualquiera",
  "detenerServidor": "funcion(cualquiera): bool",
  "unirRuta": "funcion(...): texto",
  "nombreArchivo": "funcion(texto): texto",
  "extension": "funcion(texto): texto",
  "sinExtension": "funcion(texto): texto",
  "carpetaDe": "funcion(texto): texto",
  "esRutaAbsoluta": "funcion(texto): bool",
  "normalizarRuta": "funcion(texto): texto",
  "rutaAbsoluta": "funcion(texto): texto",
  "rutaRelativa": "funcion(texto, texto): texto"
 },
 "estilo": {
  "estilo": "funcion(...): estilo",
  "cssCrudo": "funcion(texto): nulo",
  "estiloGlobal": "funcion(...): estilo",
  "reiniciar": "funcion(): estilo",
  "tema": "funcion(dic): estilo",
  "color": "funcion(texto): texto",
  "espacio": "funcion(texto): texto",
  "tipografia": "funcion(texto): texto",
  "radio": "funcion(texto): texto",
  "sombraToken": "funcion(texto): texto",
  "paleta": "funcion(...): dic",
  "escalaTipo": "funcion(...): dic",
  "alPasar": "funcion(...): estilo",
  "alEnfocar": "funcion(...): estilo",
  "alActivar": "funcion(...): estilo",
  "alVisitar": "funcion(...): estilo",
  "siDeshabilitado": "funcion(...): estilo",
  "siInvalido": "funcion(...): estilo",
  "alSeleccionar": "funcion(...): estilo",
  "primero": "funcion(...): estilo",
  "ultimo": "funcion(...): estilo",
  "impares": "funcion(...): estilo",
  "pares": "funcion(...): estilo",
  "siVacio": "funcion(...): estilo",
  "siSolo": "funcion(...): estilo",
  "hijoN": "funcion(...): estilo",
  "antes": "funcion(...): estilo",
  "despues": "funcion(...): estilo",
  "marcador": "funcion(...): estilo",
  "seleccion": "funcion(...): estilo",
  "pista": "funcion(...): estilo",
  "dentro": "funcion(...): estilo",
  "hijoDirecto": "funcion(...): estilo",
  "hermano": "funcion(...): estilo",
  "hermanoSiguiente": "funcion(...): estilo",
  "cuando": "funcion(...): estilo",
  "enPantalla": "funcion(...): estilo",
  "enAlto": "funcion(...): estilo",
  "enOscuro": "funcion(...): estilo",
  "enClaro": "funcion(...): estilo",
  "enImpresion": "funcion(...): estilo",
  "enMovimientoReducido": "funcion(...): estilo",
  "enTactil": "funcion(...): estilo",
  "enApaisado": "funcion(...): estilo",
  "enFila": "funcion(...): estilo",
  "enColumna": "funcion(...): estilo",
  "centrado": "funcion(...): estilo",
  "separado": "funcion(...): estilo",
  "envuelto": "funcion(...): estilo",
  "rejillaDe": "funcion(...): estilo",
  "apilado": "funcion(...): estilo",
  "pegadoArriba": "funcion(...): estilo",
  "fotogramas": "funcion(cualquiera): texto",
  "animar": "funcion(...): estilo",
  "transicion": "funcion(...): estilo",
  "aparecer": "funcion(...): estilo",
  "deslizar": "funcion(...): estilo"
 },
 "nen": {
  "colaGpu": "funcion(...): cualquiera",
  "enCola": "funcion(cualquiera, funcion(...): cualquiera): cualquiera",
  "esperarCola": "funcion(cualquiera): nulo",
  "colaLista": "funcion(cualquiera): bool",
  "soltarCola": "funcion(cualquiera): nulo",
  "promesaCola": "funcion(cualquiera): cualquiera",
  "subirGpu": "funcion(arreglo): arreglo",
  "medirGpu": "funcion(funcion(...): cualquiera): real",
  "numeroGpus": "funcion(): entero",
  "enGpu": "funcion(entero, funcion(...): cualquiera): cualquiera",
  "paraleloRepartido": "funcion(...): nulo",
  "paralelo": "funcion(...): nulo",
  "paraleloBloques": "funcion(...): nulo",
  "barrera": "funcion(): nulo",
  "hilosPorBloque": "funcion(): entero",
  "numeroBloques": "funcion(): entero",
  "compartido": "funcion(entero): cualquiera",
  "compartidoEntero": "funcion(entero): cualquiera",
  "hilos": "funcion(...): nulo",
  "atomicoLeer": "funcion(arreglo, entero): entero",
  "atomicoEscribir": "funcion(arreglo, entero, entero): nulo",
  "atomicoSumar": "funcion(arreglo, entero, entero): entero",
  "atomicoCambiar": "funcion(arreglo, entero, entero): entero",
  "atomicoComparar": "funcion(arreglo, entero, entero, entero): entero",
  "vallaMemoria": "funcion(): nulo",
  "cerrarCandado": "funcion(arreglo, entero): nulo",
  "abrirCandado": "funcion(arreglo, entero): nulo",
  "esperarMientras": "funcion(arreglo, entero, entero): nulo",
  "despertar": "funcion(arreglo, entero): nulo",
  "barreraHilos": "funcion(): nulo",
  "numeroHilos": "funcion(): entero",
  "dispositivo": "funcion(): texto",
  "dispositivos": "funcion(): lista<texto>",
  "usarDispositivo": "funcion(...): texto",
  "codigoCuda": "funcion(...): texto",
  "codigoC": "funcion(...): texto",
  "azarHilo": "funcion(real, real, real): real",
  "sumarAtomico": "funcion(arreglo, real, real): nulo",
  "derivar": "funcion(funcion(...): cualquiera, real): real",
  "derivarN": "funcion(funcion(...): cualquiera, real, entero): real",
  "gradiente": "funcion(funcion(...): cualquiera, lista|arreglo): cualquiera",
  "jacobiano": "funcion(funcion(...): cualquiera, lista|arreglo): cualquiera",
  "hessiano": "funcion(funcion(...): cualquiera, lista|arreglo): cualquiera",
  "integrar": "funcion(funcion(...): cualquiera, real, real): real",
  "integrarDoble": "funcion(funcion(...): cualquiera, real, real, cualquiera, cualquiera): real",
  "integrarMontecarlo": "funcion(funcion(...): cualquiera, lista, entero): dic",
  "integrarDatos": "funcion(...): real",
  "integrarAcumulado": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "derivarDatos": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "sumaSerie": "funcion(funcion(...): cualquiera, entero): real",
  "limite": "funcion(...): real",
  "longitudArco": "funcion(funcion(...): cualquiera, real, real): real",
  "volumenRevolucion": "funcion(funcion(...): cualquiera, real, real): real",
  "areaEntre": "funcion(funcion(...): cualquiera, funcion(...): cualquiera, real, real): real",
  "polinomioTaylor": "funcion(funcion(...): cualquiera, real, entero): lista<real>",
  "resolverEcuacion": "funcion(funcion(...): cualquiera, real, real): real",
  "raizNewton": "funcion(...): real",
  "raices": "funcion(lista<real>|arreglo): arreglo",
  "raicesReales": "funcion(lista<real>|arreglo): lista<real>",
  "resolverNoLineal": "funcion(funcion(...): cualquiera, cualquiera): cualquiera",
  "puntoFijo": "funcion(funcion(...): cualquiera, cualquiera): cualquiera",
  "minimizar1D": "funcion(funcion(...): cualquiera, real, real): dic",
  "minimizar": "funcion(funcion(...): cualquiera, cualquiera): dic",
  "minimizarBFGS": "funcion(...): dic",
  "maximizar": "funcion(...): dic",
  "ajustarCurva": "funcion(funcion(...): cualquiera, lista<real>|arreglo, lista<real>|arreglo, lista<real>|arreglo): dic",
  "optimizarLineal": "funcion(...): dic",
  "resolverEDO": "funcion(...): dic",
  "rk4": "funcion(funcion(...): cualquiera, real, cualquiera, real, entero): dic",
  "resolverEDORigida": "funcion(...): dic",
  "evaluarPolinomio": "funcion(lista<real>|arreglo, cualquiera): cualquiera",
  "derivarPolinomio": "funcion(lista<real>|arreglo): lista<real>",
  "integrarPolinomio": "funcion(...): lista<real>",
  "sumarPolinomios": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "restarPolinomios": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "multiplicarPolinomios": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "dividirPolinomios": "funcion(lista<real>|arreglo, lista<real>|arreglo): dic",
  "polinomioDesdeRaices": "funcion(lista<real>|arreglo): lista<real>",
  "ajustePolinomico": "funcion(lista<real>|arreglo, lista<real>|arreglo, entero): lista<real>",
  "textoPolinomio": "funcion(...): texto",
  "interpolarLineal": "funcion(lista<real>|arreglo, lista<real>|arreglo, cualquiera): cualquiera",
  "interpolarLagrange": "funcion(lista<real>|arreglo, lista<real>|arreglo, cualquiera): cualquiera",
  "polinomioInterpolante": "funcion(lista<real>|arreglo, lista<real>|arreglo): lista<real>",
  "splineCubico": "funcion(...): funcion(real): real",
  "interpolar": "funcion(...): cualquiera",
  "gamma": "funcion(real): real",
  "lnGamma": "funcion(real): real",
  "beta": "funcion(real, real): real",
  "digamma": "funcion(real): real",
  "erf": "funcion(real): real",
  "erfc": "funcion(real): real",
  "erfInversa": "funcion(real): real",
  "gammaIncompleta": "funcion(...): real",
  "betaIncompleta": "funcion(real, real, real): real",
  "besselJ": "funcion(entero, real): real",
  "zeta": "funcion(real): real",
  "normalDensidad": "funcion(...): real",
  "normalAcumulada": "funcion(...): real",
  "normalInversa": "funcion(...): real",
  "tStudentAcumulada": "funcion(real, real): real",
  "tStudentInversa": "funcion(real, real): real",
  "chiCuadradoAcumulada": "funcion(real, real): real",
  "chiCuadradoInversa": "funcion(real, real): real",
  "fisherAcumulada": "funcion(real, real, real): real",
  "binomialProb": "funcion(entero, entero, real): real",
  "binomialAcumulada": "funcion(entero, entero, real): real",
  "poissonProb": "funcion(entero, real): real",
  "poissonAcumulada": "funcion(entero, real): real",
  "exponencialAcumulada": "funcion(real, real): real",
  "potenciaModular": "funcion(entero, entero, entero): entero",
  "inversoModular": "funcion(entero, entero): entero",
  "mcdExtendido": "funcion(entero, entero): dic",
  "restoChino": "funcion(lista<entero>, lista<entero>): dic",
  "fibonacci": "funcion(entero): entero",
  "totiente": "funcion(entero): entero",
  "factorizar": "funcion(entero): lista<entero>",
  "esCuadradoPerfecto": "funcion(entero): bool",
  "siguientePrimo": "funcion(entero): entero",
  "simplificarFormula": "funcion(texto): texto",
  "expandirFormula": "funcion(texto): texto",
  "factorizarFormula": "funcion(texto): texto",
  "derivarFormula": "funcion(...): texto",
  "gradienteFormula": "funcion(texto, lista<texto>): lista<texto>",
  "integrarFormula": "funcion(...): texto",
  "resolverFormula": "funcion(texto, texto): lista",
  "despejar": "funcion(texto, texto): texto",
  "resolverSistemaFormulas": "funcion(lista<texto>, lista<texto>): dic<texto,texto>",
  "evaluarFormula": "funcion(...): real",
  "sustituirEnFormula": "funcion(texto, dic): texto",
  "variablesDeFormula": "funcion(texto): lista<texto>",
  "formulaAFuncion": "funcion(...): funcion(...): cualquiera",
  "taylorFormula": "funcion(texto, texto, cualquiera, entero): texto",
  "limiteFormula": "funcion(texto, texto, cualquiera): texto",
  "formulaALatex": "funcion(texto): texto",
  "formulaATexto": "funcion(texto): texto",
  "senoA": "funcion(real|arreglo|lista): cualquiera",
  "cosenoA": "funcion(real|arreglo|lista): cualquiera",
  "tangenteA": "funcion(real|arreglo|lista): cualquiera",
  "arcotangenteA": "funcion(real|arreglo|lista): cualquiera",
  "senoHiperbolicoA": "funcion(real|arreglo|lista): cualquiera",
  "cosenoHiperbolicoA": "funcion(real|arreglo|lista): cualquiera",
  "tangenteHiperbolicaA": "funcion(real|arreglo|lista): cualquiera",
  "expA": "funcion(real|arreglo|lista): cualquiera",
  "logA": "funcion(real|arreglo|lista): cualquiera",
  "raizA": "funcion(real|arreglo|lista): cualquiera",
  "absolutoA": "funcion(real|arreglo|lista): cualquiera",
  "signoA": "funcion(real|arreglo|lista): cualquiera",
  "pisoA": "funcion(real|arreglo|lista): cualquiera",
  "techoA": "funcion(real|arreglo|lista): cualquiera",
  "sigmoideA": "funcion(real|arreglo|lista): cualquiera",
  "reluA": "funcion(real|arreglo|lista): cualquiera",
  "redondearA": "funcion(...): cualquiera",
  "potenciaA": "funcion(real|arreglo|lista, real|arreglo|lista): cualquiera",
  "anguloA": "funcion(real|arreglo|lista, real|arreglo|lista): cualquiera",
  "softmax": "funcion(...): arreglo",
  "mapearA": "funcion(arreglo|lista, funcion(...): cualquiera): arreglo",
  "sumaEje": "funcion(...): cualquiera",
  "productoEje": "funcion(...): cualquiera",
  "mediaEje": "funcion(...): cualquiera",
  "varianzaEje": "funcion(...): cualquiera",
  "desviacionEje": "funcion(...): cualquiera",
  "maximoEje": "funcion(...): cualquiera",
  "minimoEje": "funcion(...): cualquiera",
  "normaEje": "funcion(...): cualquiera",
  "todosEje": "funcion(...): cualquiera",
  "algunoEje": "funcion(...): cualquiera",
  "permutarEjes": "funcion(...): arreglo",
  "voltear": "funcion(...): arreglo",
  "rodar": "funcion(...): arreglo",
  "rejilla": "funcion(...): lista",
  "repetirA": "funcion(...): arreglo",
  "mosaico": "funcion(arreglo|lista, entero|lista): arreglo",
  "diagonalDe": "funcion(...): arreglo",
  "productoCruz": "funcion(arreglo|lista, arreglo|lista): arreglo",
  "normaTensor": "funcion(...): real",
  "contraer": "funcion(...): cualquiera",
  "einstein": "funcion(...): cualquiera",
  "multLotes": "funcion(arreglo|lista, arreglo|lista): arreglo",
  "formaHessenberg": "funcion(arreglo|lista): dic",
  "factorSchur": "funcion(arreglo|lista): dic",
  "autovaloresGeneral": "funcion(arreglo|lista): arreglo",
  "autovectoresGeneral": "funcion(arreglo|lista): dic",
  "radioEspectral": "funcion(arreglo|lista): real",
  "exponencialMatriz": "funcion(arreglo|lista): arreglo",
  "raizMatriz": "funcion(arreglo|lista): arreglo",
  "logaritmoMatriz": "funcion(arreglo|lista): arreglo",
  "nucleoMatriz": "funcion(...): arreglo",
  "imagenMatriz": "funcion(...): arreglo",
  "gramSchmidt": "funcion(arreglo|lista): dic",
  "factorLDL": "funcion(arreglo|lista): dic",
  "resolverGradienteConjugado": "funcion(...): arreglo",
  "resolverGaussSeidel": "funcion(...): arreglo",
  "resolverJacobi": "funcion(...): arreglo",
  "vandermonde": "funcion(...): arreglo",
  "toeplitz": "funcion(...): arreglo",
  "hilbert": "funcion(entero): arreglo",
  "matrizRotacion": "funcion(...): arreglo",
  "fourier2D": "funcion(arreglo|lista): arreglo",
  "fourierInversa2D": "funcion(arreglo|lista): arreglo",
  "fourierReal": "funcion(arreglo|lista): arreglo",
  "fourierRealInversa": "funcion(...): arreglo",
  "frecuenciasReal": "funcion(...): arreglo",
  "centrarFrecuencias": "funcion(...): arreglo",
  "descentrarFrecuencias": "funcion(...): arreglo",
  "ventana": "funcion(...): arreglo",
  "espectrograma": "funcion(...): arreglo",
  "potenciaEspectral": "funcion(...): dic",
  "correlacionCruzada": "funcion(arreglo|lista, arreglo|lista): arreglo",
  "autocorrelacion": "funcion(arreglo|lista): arreglo",
  "transformadaCoseno": "funcion(arreglo|lista): arreglo",
  "transformadaCosenoInversa": "funcion(arreglo|lista): arreglo",
  "filtrarFrecuencias": "funcion(...): arreglo",
  "convolucion2D": "funcion(...): arreglo",
  "senalAnalitica": "funcion(arreglo|lista): arreglo",
  "envolvente": "funcion(arreglo|lista): arreglo",
  "grande": "funcion(...): grande",
  "cifrasGrande": "funcion(...): entero",
  "cifrasDe": "funcion(grande): entero",
  "esExacto": "funcion(grande): bool",
  "grandeExactoDe": "funcion(real): grande",
  "redondearGrande": "funcion(grande, entero): grande",
  "decimalesGrande": "funcion(grande, entero): texto",
  "aReal": "funcion(grande): real",
  "raizGrande": "funcion(...): grande",
  "expGrande": "funcion(...): grande",
  "logGrande": "funcion(...): grande",
  "senoGrande": "funcion(...): grande",
  "cosenoGrande": "funcion(...): grande",
  "tangenteGrande": "funcion(...): grande",
  "arcotangenteGrande": "funcion(...): grande",
  "arcosenoGrande": "funcion(...): grande",
  "arcocosenoGrande": "funcion(...): grande",
  "potenciaGrande": "funcion(...): grande",
  "piGrande": "funcion(entero): grande",
  "eGrande": "funcion(entero): grande",
  "factorialExacto": "funcion(entero): grande",
  "potenciaExacta": "funcion(entero|grande, entero): grande",
  "combinacionesExactas": "funcion(entero, entero): grande",
  "fibonacciExacto": "funcion(entero): grande",
  "mcdExacto": "funcion(entero|grande, entero|grande): grande",
  "esPrimoExacto": "funcion(entero|grande): bool",
  "cifrasExactas": "funcion(grande): texto",
  "lambertW": "funcion(...): real",
  "integralExponencial": "funcion(real): real",
  "integralExponencialE1": "funcion(real): real",
  "integralSeno": "funcion(real): real",
  "integralCoseno": "funcion(real): real",
  "fresnelS": "funcion(real): real",
  "fresnelC": "funcion(real): real",
  "elipticaK": "funcion(real): real",
  "elipticaE": "funcion(real): real",
  "dilogaritmo": "funcion(real): real",
  "hipergeometrica": "funcion(real, real, real, real): real",
  "besselI": "funcion(entero, real): real",
  "trigamma": "funcion(real): real",
  "poligamma": "funcion(entero, real): real",
  "sinc": "funcion(real): real",
  "gammaDensidad": "funcion(real, real, real): real",
  "gammaAcumulada": "funcion(real, real, real): real",
  "betaDensidad": "funcion(real, real, real): real",
  "betaAcumulada": "funcion(real, real, real): real",
  "weibullDensidad": "funcion(real, real, real): real",
  "weibullAcumulada": "funcion(real, real, real): real",
  "lognormalDensidad": "funcion(real, real, real): real",
  "lognormalAcumulada": "funcion(real, real, real): real",
  "cauchyDensidad": "funcion(real, real, real): real",
  "cauchyAcumulada": "funcion(real, real, real): real",
  "logisticaDensidad": "funcion(real, real, real): real",
  "logisticaAcumulada": "funcion(real, real, real): real",
  "exponencialDensidad": "funcion(real, real): real",
  "tStudentDensidad": "funcion(real, real): real",
  "chiCuadradoDensidad": "funcion(real, real): real",
  "fisherDensidad": "funcion(real, real, real): real",
  "geometricaProb": "funcion(entero, real): real",
  "binomialNegativaProb": "funcion(entero, real, real): real",
  "hipergeometricaProb": "funcion(entero, entero, entero, entero): real",
  "azarExponencial": "funcion(...): cualquiera",
  "azarGamma": "funcion(...): cualquiera",
  "azarBeta": "funcion(...): cualquiera",
  "azarChiCuadrado": "funcion(...): cualquiera",
  "azarTStudent": "funcion(...): cualquiera",
  "azarPoisson": "funcion(...): cualquiera",
  "azarBinomial": "funcion(...): cualquiera",
  "azarLogNormal": "funcion(...): cualquiera",
  "azarWeibull": "funcion(...): cualquiera",
  "azarCauchy": "funcion(...): cualquiera",
  "fila": "funcion(tabla|arreglo, entero): dic|arreglo",
  "donde": "funcion(...): cualquiera",
  "apilar": "funcion(...): cualquiera",
  "raiz": "funcion(real|arreglo): cualquiera",
  "absoluto": "funcion(real|arreglo): cualquiera",
  "piso": "funcion(real|arreglo): cualquiera",
  "techo": "funcion(real|arreglo): cualquiera",
  "seno": "funcion(real|arreglo): cualquiera",
  "coseno": "funcion(real|arreglo): cualquiera",
  "tangente": "funcion(real|arreglo): cualquiera",
  "arcoseno": "funcion(real|arreglo): cualquiera",
  "arcocoseno": "funcion(real|arreglo): cualquiera",
  "arcotangente": "funcion(real|arreglo): cualquiera",
  "exp": "funcion(real|arreglo): cualquiera",
  "log": "funcion(real|arreglo): cualquiera",
  "log10": "funcion(real|arreglo): cualquiera",
  "signo": "funcion(real|arreglo): cualquiera",
  "redondear": "funcion(...): real",
  "potencia": "funcion(real, real): real",
  "suma": "funcion(...): cualquiera",
  "media": "funcion(...): cualquiera",
  "mediana": "funcion(lista<real>|arreglo): real",
  "moda": "funcion(lista<real>|arreglo): real",
  "varianza": "funcion(lista<real>|arreglo): real",
  "desviacion": "funcion(lista<real>|arreglo): real",
  "percentil": "funcion(lista<real>|arreglo, real): real",
  "correlacion": "funcion(lista<real>|arreglo, lista<real>|arreglo): real",
  "regresion": "funcion(lista<real>|arreglo, lista<real>|arreglo): dic<texto,real>",
  "normalizar": "funcion(lista<real>|arreglo): lista<real>",
  "histograma": "funcion(lista<real>|arreglo, entero): lista<entero>",
  "matriz": "funcion(entero, entero, cualquiera): lista",
  "transponer": "funcion(lista): lista",
  "multMatriz": "funcion(lista, lista): lista",
  "determinante": "funcion(lista): real",
  "resolver": "funcion(lista, lista<real>|arreglo): lista<real>",
  "truncar": "funcion(...): real",
  "acotar": "funcion(real, real, real): real",
  "entre": "funcion(real, real, real): bool",
  "casiIgual": "funcion(...): bool",
  "raizN": "funcion(real, real): real",
  "log2": "funcion(real): real",
  "angulo": "funcion(real, real): real",
  "grados": "funcion(real): real",
  "radianes": "funcion(real): real",
  "hipotenusa": "funcion(...): real",
  "producto": "funcion(lista<real>|arreglo): real",
  "amplitud": "funcion(lista<real>|arreglo): real",
  "cuartiles": "funcion(lista<real>|arreglo): dic<texto,real>",
  "acumulado": "funcion(lista<real>|arreglo): lista<real>",
  "covarianza": "funcion(lista<real>|arreglo, lista<real>|arreglo): real",
  "tendencia": "funcion(lista<real>|arreglo): real",
  "tipificar": "funcion(lista<real>|arreglo): lista<real>",
  "azar": "funcion(): real",
  "azarEntre": "funcion(entero, entero): entero",
  "azarNormal": "funcion(...): real",
  "elegir": "funcion(lista): cualquiera",
  "elegirVarios": "funcion(lista, entero): lista",
  "barajar": "funcion(lista): lista",
  "semilla": "funcion(entero): nulo",
  "identidad": "funcion(entero): lista",
  "traza": "funcion(lista|arreglo): real",
  "inversa": "funcion(lista): lista",
  "esPrimo": "funcion(entero): bool",
  "primos": "funcion(entero): lista<entero>",
  "mcd": "funcion(...): entero",
  "mcm": "funcion(...): entero",
  "factorial": "funcion(entero): real",
  "combinaciones": "funcion(entero, entero): real",
  "permutaciones": "funcion(entero, entero): real",
  "divisores": "funcion(entero): lista<entero>",
  "valorFuturo": "funcion(real, real, entero): real",
  "valorPresente": "funcion(real, real, entero): real",
  "interesCompuesto": "funcion(...): real",
  "tasaEfectiva": "funcion(real, entero): real",
  "cuota": "funcion(real, real, entero): real",
  "amortizacion": "funcion(real, real, entero): lista",
  "arreglo": "funcion(...): arreglo",
  "ceros": "funcion(...): arreglo",
  "unos": "funcion(...): arreglo",
  "lleno": "funcion(...): arreglo",
  "secuencia": "funcion(...): arreglo",
  "reparto": "funcion(...): arreglo",
  "azarArreglo": "funcion(...): arreglo",
  "forma": "funcion(arreglo): lista",
  "dimensiones": "funcion(arreglo): entero",
  "tamano": "funcion(arreglo): entero",
  "tipoArreglo": "funcion(arreglo): texto",
  "epsilonTipo": "funcion(arreglo|texto): real",
  "minimoTipo": "funcion(arreglo|texto): cualquiera",
  "maximoTipo": "funcion(arreglo|texto): cualquiera",
  "esVista": "funcion(arreglo): bool",
  "redimensionar": "funcion(...): arreglo",
  "transpuesta": "funcion(arreglo): arreglo",
  "copia": "funcion(arreglo): arreglo",
  "aListaA": "funcion(arreglo): lista",
  "elemento": "funcion(...): real",
  "ponerElemento": "funcion(...): arreglo",
  "mayorQue": "funcion(cualquiera, cualquiera): arreglo",
  "menorQue": "funcion(cualquiera, cualquiera): arreglo",
  "mayorIgualQue": "funcion(cualquiera, cualquiera): arreglo",
  "menorIgualQue": "funcion(cualquiera, cualquiera): arreglo",
  "igualA": "funcion(cualquiera, cualquiera): arreglo",
  "distintoA": "funcion(cualquiera, cualquiera): arreglo",
  "yA": "funcion(...): arreglo",
  "oA": "funcion(...): arreglo",
  "noA": "funcion(arreglo): arreglo",
  "esNaN": "funcion(arreglo): arreglo",
  "esFinito": "funcion(arreglo): arreglo",
  "todos": "funcion(...): bool",
  "alguno": "funcion(...): bool",
  "contarCiertos": "funcion(...): entero",
  "enMascara": "funcion(arreglo, arreglo): arreglo",
  "ponerEnMascara": "funcion(...): arreglo",
  "recortar": "funcion(...): arreglo",
  "maximoDe": "funcion(...): arreglo",
  "minimoDe": "funcion(...): arreglo",
  "argMaximo": "funcion(...): cualquiera",
  "argMinimo": "funcion(...): cualquiera",
  "acumSuma": "funcion(...): arreglo",
  "acumProducto": "funcion(...): arreglo",
  "acumMaximo": "funcion(...): arreglo",
  "acumMinimo": "funcion(...): arreglo",
  "diferencias": "funcion(...): arreglo",
  "cuantil": "funcion(...): real",
  "normaVector": "funcion(...): real",
  "estandarizar": "funcion(arreglo): arreglo",
  "mediaMovil": "funcion(...): arreglo",
  "sumaSinNaN": "funcion(...): real",
  "mediaSinNaN": "funcion(...): real",
  "minimoSinNaN": "funcion(...): real",
  "maximoSinNaN": "funcion(...): real",
  "aCero": "funcion(...): arreglo",
  "aplanarA": "funcion(arreglo): arreglo",
  "expandir": "funcion(arreglo, entero): arreglo",
  "apretar": "funcion(...): arreglo",
  "difundirA": "funcion(arreglo, lista): arreglo",
  "concatenar": "funcion(...): arreglo",
  "trozo": "funcion(...): arreglo",
  "trozoPaso": "funcion(...): arreglo",
  "trozoVarios": "funcion(arreglo, lista): arreglo",
  "vacio": "funcion(...): arreglo",
  "cerosComo": "funcion(...): arreglo",
  "unosComo": "funcion(...): arreglo",
  "vacioComo": "funcion(...): arreglo",
  "bitsY": "funcion(...): cualquiera",
  "bitsO": "funcion(...): cualquiera",
  "bitsXor": "funcion(...): cualquiera",
  "desplazarIzq": "funcion(...): cualquiera",
  "desplazarDer": "funcion(...): cualquiera",
  "bitsNo": "funcion(...): cualquiera",
  "contarBits": "funcion(...): cualquiera",
  "aTipo": "funcion(arreglo, texto): arreglo",
  "por": "funcion(arreglo, arreglo): arreglo",
  "productoPunto": "funcion(arreglo, arreglo): real",
  "factorLU": "funcion(arreglo): dic",
  "factorQR": "funcion(arreglo): dic",
  "factorCholesky": "funcion(arreglo): arreglo",
  "descomponerSVD": "funcion(arreglo): dic",
  "valoresSingulares": "funcion(arreglo): arreglo",
  "resolverA": "funcion(arreglo, arreglo): arreglo",
  "resolverTriangular": "funcion(arreglo, arreglo): arreglo",
  "minimosCuadrados": "funcion(arreglo, arreglo): arreglo",
  "pseudoInversa": "funcion(arreglo): arreglo",
  "determinanteA": "funcion(arreglo): real",
  "inversaA": "funcion(arreglo): arreglo",
  "rangoMatriz": "funcion(arreglo): entero",
  "condicion": "funcion(arreglo): real",
  "normaMatriz": "funcion(...): real",
  "potenciaMatriz": "funcion(arreglo, entero): arreglo",
  "autoSimetrica": "funcion(arreglo): dic",
  "autovalores": "funcion(arreglo): arreglo",
  "identidadA": "funcion(entero): arreglo",
  "diagonal": "funcion(arreglo): arreglo",
  "triangularSuperior": "funcion(...): arreglo",
  "triangularInferior": "funcion(...): arreglo",
  "externo": "funcion(arreglo, arreglo): arreglo",
  "kronecker": "funcion(arreglo, arreglo): arreglo",
  "esSimetrica": "funcion(arreglo): bool",
  "esDefinidaPositiva": "funcion(arreglo): bool",
  "complejo": "funcion(...): arreglo",
  "parteReal": "funcion(arreglo): arreglo",
  "parteImaginaria": "funcion(arreglo): arreglo",
  "conjugado": "funcion(arreglo): arreglo",
  "fase": "funcion(arreglo): arreglo",
  "desdePolar": "funcion(arreglo, arreglo): arreglo",
  "esComplejo": "funcion(arreglo): bool",
  "fourier": "funcion(arreglo): arreglo",
  "fourierInversa": "funcion(arreglo): arreglo",
  "espectro": "funcion(arreglo): arreglo",
  "frecuencias": "funcion(...): arreglo",
  "convolucion": "funcion(arreglo, arreglo): arreglo",
  "ordenarA": "funcion(...): arreglo",
  "argOrdenar": "funcion(arreglo): arreglo",
  "tomar": "funcion(arreglo, arreglo): arreglo",
  "unicosConCuentas": "funcion(arreglo): dic",
  "estaEn": "funcion(arreglo, arreglo): arreglo",
  "uniformes": "funcion(...): arreglo",
  "normales": "funcion(...): arreglo",
  "enteros": "funcion(...): arreglo",
  "barajarJuntos": "funcion(...): lista",
  "deRegistros": "funcion(lista): tabla",
  "deColumnas": "funcion(dic): tabla",
  "deLista": "funcion(lista, lista): tabla",
  "deCsv": "funcion(...): tabla",
  "deDatos": "funcion(texto): tabla",
  "aDatos": "funcion(...): texto",
  "aCsv": "funcion(...): texto",
  "aLista": "funcion(tabla): lista",
  "aRegistros": "funcion(tabla): lista",
  "aColumnas": "funcion(tabla): dic",
  "columnas": "funcion(tabla): lista<texto>",
  "tipos": "funcion(tabla): dic<texto,texto>",
  "primeras": "funcion(...): tabla",
  "ultimas": "funcion(...): tabla",
  "vacios": "funcion(tabla): dic<texto,entero>",
  "describir": "funcion(tabla): tabla",
  "vistazo": "funcion(...): nulo",
  "columna": "funcion(tabla, texto): lista",
  "celda": "funcion(tabla, entero, texto): cualquiera",
  "soloColumnas": "funcion(tabla, lista): tabla",
  "sinColumna": "funcion(...): tabla",
  "renombrar": "funcion(tabla, texto, texto): tabla",
  "reordenar": "funcion(tabla, lista): tabla",
  "ordenarPor": "funcion(...): tabla",
  "unicas": "funcion(tabla, texto): lista",
  "sinRepetir": "funcion(...): tabla",
  "quitarVacios": "funcion(...): tabla",
  "conColumna": "funcion(tabla, texto, funcion(...): cualquiera): tabla",
  "convertir": "funcion(tabla, texto, texto): tabla",
  "aplicarA": "funcion(tabla, texto, funcion(...): cualquiera): tabla",
  "rellenarVacios": "funcion(tabla, texto, cualquiera): tabla",
  "numerar": "funcion(...): tabla",
  "sumaCol": "funcion(...): dic",
  "promedioCol": "funcion(...): dic",
  "minCol": "funcion(...): dic",
  "maxCol": "funcion(...): dic",
  "primeroCol": "funcion(...): dic",
  "ultimoCol": "funcion(...): dic",
  "contarCol": "funcion(...): dic",
  "juntarCol": "funcion(...): dic",
  "agrupar": "funcion(tabla, lista, dic): tabla",
  "resumir": "funcion(tabla, dic): tabla",
  "contarPor": "funcion(...): tabla",
  "pivotar": "funcion(tabla, texto, texto, dic): tabla",
  "despivotar": "funcion(...): tabla",
  "cruzar": "funcion(...): tabla",
  "juntarColumnas": "funcion(...): tabla",
  "diferencia": "funcion(tabla, tabla, texto): tabla"
 },
 "clasico": {
  "mayusculas": "funcion(texto): texto",
  "minusculas": "funcion(texto): texto",
  "recortar": "funcion(texto): texto",
  "dividir": "funcion(...): lista<texto>",
  "unir": "funcion(lista, texto): texto",
  "reemplazar": "funcion(texto, texto, texto): texto",
  "empiezaCon": "funcion(texto, texto): bool",
  "terminaCon": "funcion(texto, texto): bool",
  "subtexto": "funcion(texto, entero, entero): texto",
  "raiz": "funcion(real|arreglo): cualquiera",
  "absoluto": "funcion(real|arreglo): cualquiera",
  "piso": "funcion(real|arreglo): cualquiera",
  "techo": "funcion(real|arreglo): cualquiera",
  "seno": "funcion(real|arreglo): cualquiera",
  "coseno": "funcion(real|arreglo): cualquiera",
  "tangente": "funcion(real|arreglo): cualquiera",
  "arcoseno": "funcion(real|arreglo): cualquiera",
  "arcocoseno": "funcion(real|arreglo): cualquiera",
  "arcotangente": "funcion(real|arreglo): cualquiera",
  "exp": "funcion(real|arreglo): cualquiera",
  "log": "funcion(real|arreglo): cualquiera",
  "log10": "funcion(real|arreglo): cualquiera",
  "signo": "funcion(real|arreglo): cualquiera",
  "redondear": "funcion(...): real",
  "potencia": "funcion(real, real): real",
  "suma": "funcion(...): cualquiera",
  "media": "funcion(...): cualquiera",
  "mediana": "funcion(lista<real>|arreglo): real",
  "moda": "funcion(lista<real>|arreglo): real",
  "varianza": "funcion(lista<real>|arreglo): real",
  "desviacion": "funcion(lista<real>|arreglo): real",
  "percentil": "funcion(lista<real>|arreglo, real): real",
  "correlacion": "funcion(lista<real>|arreglo, lista<real>|arreglo): real",
  "regresion": "funcion(lista<real>|arreglo, lista<real>|arreglo): dic<texto,real>",
  "normalizar": "funcion(lista<real>|arreglo): lista<real>",
  "histograma": "funcion(lista<real>|arreglo, entero): lista<entero>",
  "matriz": "funcion(entero, entero, cualquiera): lista",
  "transponer": "funcion(lista): lista",
  "multMatriz": "funcion(lista, lista): lista",
  "determinante": "funcion(lista): real",
  "resolver": "funcion(lista, lista<real>|arreglo): lista<real>",
  "estilo": "funcion(...): estilo",
  "cssCrudo": "funcion(texto): nulo",
  "estiloGlobal": "funcion(...): estilo",
  "fotogramas": "funcion(cualquiera): texto",
  "dentro": "funcion(...): estilo",
  "alPasar": "funcion(...): estilo",
  "alEnfocar": "funcion(...): estilo",
  "alActivar": "funcion(...): estilo",
  "alVisitar": "funcion(...): estilo",
  "siDeshabilitado": "funcion(...): estilo",
  "primero": "funcion(...): estilo",
  "ultimo": "funcion(...): estilo",
  "impares": "funcion(...): estilo",
  "antes": "funcion(...): estilo",
  "despues": "funcion(...): estilo",
  "enPantalla": "funcion(...): estilo",
  "enAlto": "funcion(...): estilo",
  "enOscuro": "funcion(...): estilo",
  "enClaro": "funcion(...): estilo",
  "enImpresion": "funcion(...): estilo",
  "enMovimientoReducido": "funcion(...): estilo"
 }
},
"clasico": ["mayusculas", "minusculas", "recortar", "dividir", "unir", "reemplazar", "empiezaCon", "terminaCon", "subtexto", "raiz", "absoluto", "piso", "techo", "seno", "coseno", "tangente", "arcoseno", "arcocoseno", "arcotangente", "exp", "log", "log10", "signo", "redondear", "potencia", "suma", "media", "mediana", "moda", "varianza", "desviacion", "percentil", "correlacion", "regresion", "normalizar", "histograma", "matriz", "transponer", "multMatriz", "determinante", "resolver", "estilo", "cssCrudo", "estiloGlobal", "fotogramas", "dentro", "alPasar", "alEnfocar", "alActivar", "alVisitar", "siDeshabilitado", "primero", "ultimo", "impares", "antes", "despues", "enPantalla", "enAlto", "enOscuro", "enClaro", "enImpresion", "enMovimientoReducido"],
"perfiles": {"c1en": ["numerico", "nen"]}
}'''

if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
    sys.exit(main())
