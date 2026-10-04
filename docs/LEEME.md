# Informes

Dos auditorías del proyecto, las dos del **28 de septiembre de 2026**. No son
documentación del lenguaje —eso está en el `LEEME.md` de la raíz, en
`ejemplos/00-gramatica.txt` y en `referencia-stdlib.html`— sino el diagnóstico
que motivó una tanda de arreglos.

Llevan la fecha en el nombre a propósito. **Una auditoría es una foto**, y las
cifras que cita envejecen: si el nombre no dice cuándo se tomó, alguien va a
leer «120 pruebas» dentro de seis meses y creerá que es el estado de hoy.

| archivo | qué auditó | severidades |
|---|---|---|
| `auditoria-motor-2026-09-28.html` | 2.239 líneas del motor: etapas, límites, el JIT | 0 críticas, 3 altas, 6 medias, 3 bajas |
| `auditoria-web-2026-09-28.html` | 2.762 líneas del lado web: árbol de nodos, estilo, zona aislada, interacción | 1 crítica, 7 altas, 5 medias, 2 bajas |

## Qué de esto sigue siendo verdad

Lo que **encontraron** sigue siendo verdad: son fallos que se reprodujeron
ejecutando el código, y cada uno dice cómo. Los tres hallazgos altos del motor
—las listas cíclicas que lo tumbaban con un error en inglés, el límite de
instrucciones que no protegía contra las nativas, y el JIT apagándose en
silencio bajo una política de seguridad estricta— están corregidos, con pruebas
de regresión. La auditoría web destapó además uno que no era del lado web: el
JIT daba resultados distintos al intérprete en cuanto un operando dejaba de ser
un número, corrompiendo programas en silencio a partir de la novena llamada.
También arreglado.

Lo que **ya no es verdad son las cifras**, y por bastante:

| la auditoría decía | hoy |
|---|---|
| 120 pruebas, luego 135 | **1.443 afirmaciones** en 14 suites |
| sin pruebas escritas en Ñ | **8 suites en Ñ**, 511 afirmaciones |
| la gramática sin comprobar | **60 pruebas** que la atan al parser |

Para el estado de hoy: `npm run probar`.
