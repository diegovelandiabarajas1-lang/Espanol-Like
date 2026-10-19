# ECOSIM-G v3.1 — 100 mecánicas en C1EÑ

> **La 3.1 (19-oct-2026)** arregla el estancamiento de la 3.0. Ver
> [La 3.1: que la sociedad avance](#la-31-que-la-sociedad-avance).

`ecosim/ecosim-g3.esl` más siete módulos en `ecosim/g3/`. La v2 (`ecosim-g.esl`)
queda intacta.

La v2 era una **economía**: compradores, empresas, bolsa, bancos y clubes. Todo se
conservaba al centavo: el dinero, las deudas, las acciones, los bienes y las
participaciones. La v3 le pone una **sociedad** encima, con personas que:

- nacen, envejecen, se emparejan, enferman y mueren;
- sienten, tienen amigos y enemigos, lengua, religión y facción;
- viven bajo tres Estados que cobran impuestos, hacen leyes, pagan funcionarios,
  se espían y se hacen la guerra;
- habitan un mundo con estaciones, lluvia, plagas, epidemias, desastres y
  contaminación.

La lista que pidió Diego tenía 90 mecánicas. Las diez últimas (el mundo y la
ecología) las añadí para llegar a 100, porque sin clima ni tierra la
temperatura, la cosecha y las epidemias no tendrían de dónde salir.

## La 3.1: que la sociedad avance

Con la 3.0 los números decían que todo se quedaba quieto: la tecnología no pasaba
de 115, casi nadie fundaba empresas, los ricos seguían ricos y los pobres pobres,
la riqueza solo se heredaba y el comercio no se movía.

### El diagnóstico

Medí un mundo año por año (dinero de las personas, de las empresas y de los
inversores, sueldos, ventas, tecnología):

- **Todos cobraban lo mismo** (60 monedas al año) y eso era la vigésima parte de
  lo que tenía ahorrado una persona normal. Ahorrando no se podía subir.
- **Las empresas guardaban el 60 % de todo el dinero** en su caja y no lo
  soltaban. El dinero de las personas bajó de 1,53 a 0,94 millones de monedas en
  seis años; el de las empresas y los inversores subió.
- **Las personas no podían ser dueñas de nada.** Solo fundaban los 100
  inversores (que no son personas) y los clubes, y las plazas de las empresas
  cerradas no se volvían a usar.
- **La tecnología solo subía por la ciencia del Estado**, una o dos veces en seis
  años, y no se contagiaba de un Estado a otro. Y la escritura se inventaba en el
  primer año en todos los Estados.
- Los préstamos de los bancos eran **cero**: nadie necesitaba crédito.

### Lo que cambió (todo en el programa, el motor no se tocó)

El dinero **se sigue conservando al centavo**, como quería Diego desde ECOSIM-5.
La riqueza nueva sale de producir más con la misma gente (tecnología), de las
casas, las máquinas y las empresas que se construyen, y del crédito de los bancos,
que crea depósitos contra préstamos dentro de las invariantes.

| qué | cómo |
|---|---|
| sueldo por empresa | cada empresa tiene su sueldo: sube del 1 % al 8 % al año según lo que gana por cada peso de nómina (si tiene más de 12 nóminas en caja), un 3 % si le sobran 40 nóminas, y baja un 4 % con pérdidas y poca caja |
| sueldo por persona | cada uno cobra sueldo × rendimiento / 80; el rendimiento sale de la energía, la salud, el oficio y los estudios. Estudiar y aprender el oficio paga |
| prima | la empresa con más de 30 nóminas en caja reparte cada año el 5 % de lo que le sobra entre su plantilla |
| mercado de trabajo | el que busca trabajo prefiere la que paga más entre las que necesitan manos; el que trabaja se cambia si otra le paga un 10 % más |
| emprendedores | una persona de 22 a 59 años, creativa o curiosa, con 20 sueldos ahorrados, funda su empresa en su territorio: pone la mitad de su dinero, y si no llega a 40 sueldos el banco le presta hasta el doble. Se lleva la mitad de la ganancia; la empresa la hereda su familia o se pierde si quiebra |
| plazas | caben 90 empresas por mundo (eran 48) y las de las cerradas se reutilizan |
| investigación | la empresa con caja de sobra paga cada año el 2 % de lo que le sobra a una tecnológica; con suerte (más si su Estado tiene ciencia) mejora un 12 % su productividad y le deja 2 puntos de tecnología al Estado |
| difusión | cada Estado aprende cada año un 5 % de la ventaja del más avanzado (un 1 % si son enemigos) |
| ciencia y escritura | la escritura necesita juntar 6.000 de ciencia y aun así sale un año de cada tres; la innovación del Estado crece con la ciencia |
| herencia | el Estado cobra un 10 % y el resto se reparte: la mitad a la pareja, la otra mitad entre los hijos a partes iguales |
| lujo | el que tiene más de 40 sueldos ahorrados compra lujo, más a menudo cuanto más tiene (un 5 % de su fortuna al año) |
| riqueza | cuenta el dinero, lo que vale la empresa propia y la parte del club; con eso se miden el Hoover y los quintiles |
| buscar | se compra y se busca trabajo entre las empresas abiertas del sector (una lista que se rehace cada año); antes se probaba al azar entre todas las plazas, también las vacías |

Las mecánicas nuevas viven en `g3/progreso.esl`; los cambios en las de antes,
marcados con «v3.1» en el código.

### Antes y después (corrida por defecto, semilla 20261018, 10 mundos)

| | 3.0 | 3.1 |
|---|---|---|
| población (6 años) | 1693 → 1706 | 1693 → **1774** |
| muertes de hambre o sed por mundo | 44 | **1** |
| desempleo | 2,4 % | **1,3 %** |
| sueldo base al final | 60 (fijo) | **73** monedas al año; el que más cobra, 112 |
| empresas fundadas por personas | 0 | **19,5** por mundo (17,2 con crédito) |
| empresas abiertas | 31 | **45** |
| quiebras | 0 | 6 por mundo |
| tecnología media de los Estados | 105 (máx. 115) | **143** (máx. 168) |
| innovaciones de empresas | — | 55 por mundo |
| producción real (unidades vendidas) | sin medir | **+21 %** frente al segundo año, y más de un 10 % en los 10 mundos |
| Estados con escritura | 30 de 30 (el primer año) | 15 de 30 |
| de los que empezaron en el 20 % más pobre, salieron de ahí | — | **85 %** |
| de los que empezaron en el 20 % más rico, dejaron de estar | — | **26 %** |
| riqueza media de un dueño / del resto | — | 12.240 / 1.121 monedas |
| Hoover | 45,8 % | 46,8 % |

Los mundos ahora **se separan**: la producción real crece entre un 12 % y un 31 %
según el mundo, la tecnología media de 128 a 154, la escritura llega a 0, 1 o 2
de los 3 Estados, y las quiebras van de 2 a 9.

### Lo que hay que saber

- **La bolsa baja.** El índice de las empresas de los inversores acaba entre 29 y
  63 (salida = 100) y el resumen marca «caída de bolsa ≥ 20 % en una hora» en 8 de
  10 mundos. Es una bajada continua, no un pánico: los sueldos suben, aparecen
  competidores y las empresas viejas valen menos. Las empresas de personas no
  cuentan en el índice (no cotizan).
- **Ninguna empresa de una persona quebró** en estas corridas: son pequeñas y la
  demanda les sobra (la escasez es alta). Pueden quebrar como las demás.
- **La escasez cuenta mucho más** (9,7 millones de veces frente a 0,8): ahora la
  gente sí encuentra la tienda abierta y se queda sin nada en la lotería del
  estante, cuando antes ni la encontraba. La demanda va por delante de la
  producción.
- El trueque y el fiado siguen casi a cero: casi nadie está tan desesperado.
- Va un poco más lento: 3,6 ms por tick con los diez mundos (antes 3,9 con la
  3.0, aunque en la 3.0 con 48 plazas iba a 2,5): hay el doble de plazas de
  empresa que recorrer.

### Lo que se comprobó

- Las invariantes (dinero con el tesoro, deudas = préstamos, acciones, bienes con
  las despensas, participaciones) en todas las corridas.
- **JIT = C nativo = GPU simulada**, al bit (CSV de mundos, serie y resumen; 3
  mundos de 300 plazas, 3 años).
- **Los lotes no cambian los mundos**: 6 mundos en un proceso = 3 + 3 en dos
  procesos, byte a byte.
- Un lote de 1500 mundos de 2000 plazas arranca y cumple las invariantes.
- El cuaderno de Kaggle, probado en la nube con JIT (3 lotes, CSV juntado y
  partido).

## Cómo se corre

```
node motor/util/n-node.js --c1en ecosim/ecosim-g3.esl [economías] [ticks] [plazas] [semilla] [serie.csv|-] [empresasPorSector] [crédito] [primerMundo] [mundos.csv|-]
```

Por defecto:

- 10 economías;
- 21 600 ticks, es decir, 6 años;
- 2000 plazas de personas por economía, el 85 % ocupadas al empezar (el resto es
  sitio para los que nacen);
- 6 empresas por sector;
- crédito 1;
- primer mundo 0.

En la nube, con 2 núcleos y C nativo, tarda **1 min 25 s** (3,9 ms por tick con las
diez economías a la vez). Para probar algo rápido:
`… ecosim-g3.esl 4 18000 500 11 -` tarda unos 20 s.

### Las dos salidas

- **La serie** (`ecosim/salida-g3.csv`): cada 10 minutos simulados, una fila por
  mundo, solo de los 20 primeros mundos. Con miles sería enorme.
- **Los mundos** (`ecosim/mundos-g3.csv`): **una fila por mundo** al final, con
  todos los mundos y 121 columnas (población, nacimientos, muertes, hambre,
  ánimo, Hoover, paro, bolsa, guerras, conquistas, revoluciones, tecnología,
  escritura, sequías, bosque…). El resumen de cada mundo lo calcula la GPU
  (`resumirMundo`, un hilo por mundo); la CPU solo escribe el texto.

  Si el archivo pasa de **7 MB**, se parte: se llena `mundos-g3-1.csv` hasta 7 MB,
  se sigue en `mundos-g3-2.csv`, y así. Cada parte lleva su encabezado. Una fila
  ocupa unos 465 bytes, así que caben unos 15 000 mundos por archivo.

### Miles de mundos

El mundo número `n` usa la semilla `semilla + n`, esté en el proceso que esté.
`primerMundo` dice qué número tiene el primer mundo del proceso. Así:

- varios procesos con `primerMundo` 0, 1500, 3000… dan mundos distintos, y sus
  CSV se juntan en uno;
- cualquier mundo se repite solo: 1 economía, la misma semilla, `primerMundo` =
  su número.

**El tope de un proceso.** Un arreglo de Ñ tiene como mucho 50 millones de
números. Los paquetes de las personas son `mundos × plazas × 16`, así que con
2000 plazas caben **1562 mundos por proceso**. Si se piden más, el programa lo
dice antes de empezar y dice en cuántos procesos repartirlos:

```
4000 mundos de 2000 plazas no caben en un proceso: el máximo son 1562 (un arreglo
de Ñ llega a 50 millones de números). Repártelos en 3 procesos con primerMundo 0,
1562, 3124…
```

**El cuaderno de Kaggle** `c1en/kaggle-ecosim-g3.ipynb` hace todo eso: parte los
mundos en lotes de 1500, corre 2 lotes a la vez en cada T4 (el resto en cola),
comprueba que todos cerraron con las invariantes en verde, junta los CSV en uno
ordenado por mundo (partido en archivos de ≤ 7 MB si hace falta) y pinta la
distribución.

**Cuántos caben en las dos T4.** Cada mundo de 2000 plazas ocupa ≈ 1,2 MB en la
GPU. Una T4 tiene ~15 GB, así que por memoria cabrían ~12 000 mundos en cada una;
con 2 lotes a la vez se usan 3,5 GB de cada T4. El límite real es el tiempo:

| mundos | lotes | CSV | tiempo estimado (6 años) |
|---|---|---|---|
| 3000 | 2 | ~1,4 MB, 1 archivo | 3–6 min |
| 12 000 | 8 | ~5,6 MB, 1 archivo | 9–22 min |
| 24 000 | 16 | ~11 MB, 2 archivos | 18–45 min |
| 50 000 | 34 | ~23 MB, 4 archivos | 36–90 min |

Los tiempos son una **estimación sin medir en una T4**: 4–10 ms por tick por cada
1000 mundos y GPU. El log de cada lote dice cuánto tardó de verdad.

### El tiempo

- Un **tick** es un segundo, como en la v2. El cuerpo (hambre, sed, sueño) y el
  mercado van por ticks.
- Un **año** es una hora: 3600 ticks.
- Un **día** son 10 minutos: 600 ticks, el último tercio de noche.
- El año tiene cuatro **estaciones** de 15 minutos.

Si el año durara lo que dura en la economía, en una corrida nadie nacería.

## Lo que se comprobó

- **Las invariantes de la v2 siguen comprobándose cada minuto**, con dos cosas más
  dentro:
  - el tesoro de los Estados, que es dinero depositado en un banco;
  - lo que cada persona guarda en su despensa, que son bienes.

  Ninguna corrida las rompió.
- **Al bit en los tres dispositivos.** La misma semilla da el mismo CSV y el mismo
  resumen, byte a byte, en JIT, en C nativo (gcc + OpenMP) y en la GPU simulada de
  las pruebas de C1EÑ (el mismo código CUDA que irá a las T4). Probado con 3 mundos
  de 300 plazas y 3 años, y otra vez después de añadir el CSV de mundos (3 mundos
  de 300 plazas, 1 año). Dos corridas nativas seguidas también salen iguales.
- **Los lotes no cambian los mundos.** 6 mundos en un proceso y 3 + 3 en dos
  procesos (`primerMundo` 0 y 3) dan el CSV de mundos idéntico, byte a byte. Lo
  mismo 7 mundos juntados desde 3 lotes por el cuaderno. Para eso el azar de cada
  persona usa su número dentro del mundo, no su posición en el arreglo.
- **Un lote de 1500 mundos de 2000 plazas** arranca (10 s en la nube), cumple las
  invariantes y escribe su CSV de mundos.

  Para que salga igual, cada decisión de la hora se toma con una **foto** que saca
  el censo, nunca leyendo a otro hilo que está cambiando. Lo que una persona le hace
  a otra (robarle, pedirle fiado, hablar mal de ella) se deja como pedido con
  `sumarAtomico` y se resuelve en la fase siguiente. Lo secuencial por naturaleza
  (emparejarse, nacer, el trueque, la guerra) va en un hilo por economía.
- **No se tocó el motor.** Todo es un programa de Ñ.

## Una cosa del motor que salió por el camino

El C nativo de C1EÑ llama a cada núcleo por **koffi**, y koffi no acepta funciones
de más de **64 parámetros**. Cada arreglo cuenta dos (el puntero y el largo). La
primera versión de «sentir» tenía más de cien arreglos y no compilaba
(`Functions cannot have more than 64 parameters`).

La solución está en el programa, sin cambiar el motor: lo de la v3 va
**empaquetado**. Cada persona tiene 16 casillas seguidas en `cuerpo`, `civil`,
`rasgo`, `animo`, `memo`, `pedido` y `foto`; cada territorio, en `clima`, `terrP` y
`censoT`; cada Estado, 24 casillas en `estado` y 16 en `censoF`. La tabla de
casillas está al principio de `ecosim-g3.esl` y en cada módulo.

En el motor estaría bien que C1EÑ lo dijera antes de compilar, o que pasara los
arreglos en una tabla. Eso es para el motor experimental, si quieres.

## Las 100 mecánicas

En el código cada una está marcada con su número entre corchetes: `[47]`.

### Supervivencia (`g3/supervivencia.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 1 | hambre | sube 2 por tick; se come de la despensa al pasar de 4000 |
| 2 | sed | igual, y con calor (más de 30 °C) sube más |
| 3 | sueño | de noche se duerme, mejor con techo; con mucho miedo no (insomnio); con sueño se rinde menos |
| 4 | salud física | cada año: comer, beber y dormir la sube; el hambre, la sed, el frío sin techo, la contaminación, la enfermedad y la vejez la bajan |
| 5 | salud mental | en `sentir`: la suben los amigos, el arte, la fe, los ritos y la esperanza; la bajan el miedo, la frustración, la exclusión, la cárcel, el duelo y la abstinencia |
| 6 | temperatura | la del territorio ese día; bajo 10 °C o sobre 32 °C sin techo enferma |
| 7 | higiene | se gasta sola; lavarse cuesta una unidad de agua; sucio, se contagia más |
| 8 | nutrición | comer la sube; de ella sale la inmunidad |
| 9 | inmunidad | va hacia lo que permiten la nutrición y la edad; con tecnología ≥ 150 hay vacunas; tras una enfermedad, inmunidad adquirida |
| 10 | edad | un año por hora; la muerte sigue la ley de Gompertz más lo que añaden la salud y la guerra |
| 11 | fertilidad | parejas (de un amigo o de una cita) y nacimientos en las plazas libres; con estudios hay menos hijos |
| 12 | mortalidad infantil | menores de 5 años con un riesgo extra que bajan los médicos |
| 13 | refugio | la casa (0–3) se compra al sector 4: protege del frío, deja dormir, agranda la despensa y aleja a los ladrones |
| 14 | seguridad física | el robo (tres pasos), el miedo que deja y la violencia |
| 15 | energía | se gasta trabajando, se recupera durmiendo; de ella depende cuánto rinde cada uno |

### Economía y recursos (la v2, `g3/economia.esl` y `ecosim-g3.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 16 | riqueza | Pareto al empezar (de la v2), en cubetas logarítmicas para medirla |
| 17 | desigualdad | índice de Hoover y la parte del 10 % más rico, cada año |
| 18 | comercio | también entre territorios y entre Estados |
| 19 | precios | los de la v2, más el IPC de agua y comida y la inflación |
| 20 | escasez | la lotería del estante de la v2; quien se queda sin nada lo apunta, siente miedo y frustración, y acapara |
| 21 | producción | 15 unidades por trabajador y hora, por energía, salud, oficio y estudios, por la tecnología del Estado, por la cohesión del territorio y por la estación; de noche, un 40 % |
| 22 | especialización | el oficio se aprende trabajando y se pierde a medias al cambiar de sector |
| 23 | trueque | agua por comida entre vecinos que hablan la misma lengua, en orden, en un hilo por economía |
| 24 | moneda | con inflación alta se desconfía del dinero: el trueque empieza antes y baja la confianza |
| 25 | impuestos | sobre el salario, para el Estado del territorio, y aranceles al comprar en otro Estado (doble si la frontera está cerrada); el egoísta evade si el gobierno no tiene autoridad |
| 26 | deuda | los bancos de la v2 y el **fiado** entre amigos: pedir, prestar, devolver; quien no paga en 5 años es moroso |
| 27 | almacenamiento | la despensa: se compra para guardar y se come de ahí; la comida se estropea; lo que no cabe se tira |
| 28 | cosecha | la comida depende de la estación (otoño ×1,4, invierno ×0,6) y del suelo; en otoño se guarda para el invierno |
| 29 | rutas | anillo de territorios; se compra y se trabaja en el vecino si la ruta está abierta; la guerra y los desastres la rompen, el Estado la arregla |
| 30 | monopolio | la empresa que vende más de la mitad de su sector sube el precio un 4 % por hora, salvo ley antimonopolio |

### Social (`g3/social.esl` y `g3/psicologia.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 31 | presión social | la moral, la facción y la moda van hacia las de los amigos, tanto más cuanto menos creativo es uno |
| 32 | reputación | baja con el chisme, el delito y el impago; sube al pagar; vuelve despacio a lo normal |
| 33 | confianza | la cohesión del territorio y los amigos la suben; la inflación y los robos la bajan; decide cuánto se presta |
| 34 | parentesco | padre, madre y pareja; herencia; los niños piden a sus padres; duelo |
| 35 | amistad | cuatro vínculos por persona; se conoce a vecinos y compañeros; la afinidad viene de la lengua, la empatía, la religión, la facción y la moral |
| 36 | enemistad | afinidad muy baja, guerra entre sus Estados, religión distinta para los tradicionalistas |
| 37 | rumores | sobre empresas: el empleado de una que va mal lo cuenta, el crédulo lo cree, y nadie le compra caprichos |
| 38 | chisme | el poco empático habla mal de su enemigo y le baja la reputación |
| 39 | estatus | quintil de riqueza, reputación, cargo, casa, cárcel |
| 40 | movilidad social | el quintil de cada uno frente al del primer año |
| 41 | exclusión | minoría de lengua o de religión (sin libertad de culto), o extranjero, en un territorio tradicionalista; al excluido lo contratan la mitad de las veces |
| 42 | cohesión | por territorio: confianza, inclusión, ritos y seguridad; sube la producción |
| 43 | facción | la que prefiere cada uno; la cambia el amigo carismático o un gobierno con autoridad |
| 44 | liderazgo | el líder de cada Estado es el adulto de su facción con más carisma, estatus y reputación |
| 45 | carisma | rasgo raro (pocos tienen mucho); hace líderes, arrastra a los amigos y mejora la diplomacia |

### Psicología (`g3/psicologia.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 46 | moral | va hacia lo que dictan la empatía, el egoísmo, la fe y los amigos; la necesidad la rompe; por debajo de 5000 se puede robar |
| 47 | miedo | delito, guerra, desastre, hambre, enfermedad y superstición; lo bajan la fe, la casa y la policía; hace acaparar y emigrar |
| 48 | esperanza | trabajo, estudios, fe, autoridad, casa |
| 49 | frustración | el estatus de los amigos frente al propio, el paro, la escasez, la exclusión, la cárcel y el hambre |
| 50 | agresividad | rasgo más frustración y guerra, menos empatía; lleva al delito y a la rebelión |
| 51 | empatía | ayudar al amigo con hambre, hacer amigos, la moral |
| 52 | egoísmo | baja la moral, sube los impuestos que pone el líder y lleva a evadir |
| 53 | curiosidad | compra tecnología, estudia de adulto, emigra más |
| 54 | tradicionalismo | excluye a las minorías, aleja de otras religiones y frena la innovación |
| 55 | creatividad | hace arte, impulsa la innovación y resiste la presión social |
| 56 | memoria | la empresa que le dejó sin nada se evita unos años, más con buena memoria |
| 57 | sesgos | lealtad a la empresa de siempre y credulidad ante los rumores |
| 58 | adicción | el ocio la sube; sin su dosis, abstinencia; puede romper el tabú |
| 59 | fe | los mitos de su religión, el miedo y la tradición la sostienen; los estudios la erosionan |
| 60 | identidad | tradición, fe y cuántos amigos son «de los suyos»; protege de la conversión forzada |

### Política y poder (`g3/politica.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 61 | autoridad | apoyo de los ciudadanos, orden y empleo, menos escándalos |
| 62 | ley | impuesto, años de cárcel, antimonopolio, libertad de culto, frontera, subsidio, policías por mil, años para naturalizarse y religión del Estado; salen del carácter del líder |
| 63 | castigo | la policía atrapa al ladrón (menos con burocracia y corrupción): devuelve lo robado y va preso |
| 64 | rebelión | frustrado, agresivo y con un gobierno sin autoridad: huelga; con más del 10 % de rebeldes hay disturbios |
| 65 | guerra | Estados vecinos enemistados y un líder agresivo; batallas con soldados × tecnología × suerte; bajas reales; conquista y saqueo |
| 66 | alianza | relación > 60: sin aranceles, migración libre y ayuda en la guerra |
| 67 | diplomacia | comercio y líderes carismáticos acercan; religiones de Estado distintas, líderes agresivos, guerra y espías descubiertos alejan |
| 68 | espionaje | los espías roban tecnología a quien va por delante; si los descubren, la relación cae |
| 69 | territorio | 6 por economía, en anillo; cambian de dueño por conquista o por revolución |
| 70 | frontera | cerrada: aduana doble y nadie la cruza para vivir; en guerra, cerrada del todo |
| 71 | migración | con miedo, sin trabajo o excluido, al vecino más atractivo (empleo, seguridad, paz) si la frontera deja |
| 72 | ciudadanía | el que llega es extranjero hasta que pasan los años de la ley y habla la lengua; sin ella no cobra subsidios ni es funcionario |
| 73 | corrupción | el líder sin moral se queda con parte de lo recaudado; a veces hay escándalo y cae |
| 74 | burocracia | la parte del gasto que se pierde: sube con el tamaño del Estado, baja con la escritura y la tecnología |
| 75 | revolución | más del 25 % de rebeldes: el territorio pasa a la facción que quieren o cae el líder |

### Cultura y conocimiento (`g3/cultura.esl` y `g3/psicologia.esl`)

| # | mecánica | cómo funciona |
|---|---|---|
| 76 | lenguaje | dos lenguas; sin una en común no hay amistad ni trueque; quien estudia aprende la de la mayoría |
| 77 | educación | escuela (maestros del Estado, mejor con bibliotecas), tradición oral y curiosidad; sin escritura, techo de 6000 |
| 78 | tecnología | por Estado: multiplica la producción, trae vacunas, gana guerras |
| 79 | ciencia | la hacen los estudiados que trabajan en tecnología, los maestros y los médicos; sin escritura se olvida |
| 80 | arte | los creativos hacen obras que alegran su territorio |
| 81 | religión | tres; un amigo creyente convence; sin libertad de culto, el Estado presiona |
| 82 | ritual | cada día, al amanecer: fe, salud mental y cohesión |
| 83 | tabú | cada religión prohíbe un sector (lujo, ocio, tecnología); romperlo deja culpa; la religión 2 frena la innovación si es la del Estado |
| 84 | moda | un producto de ocio o lujo que todos quieren, hasta que cambia |
| 85 | tradición oral | los mayores que saben enseñan a los jóvenes de su territorio |
| 86 | escritura | se inventa con la ciencia; desde entonces no se olvida, baja la burocracia, permite bibliotecas y fija los mitos |
| 87 | biblioteca | el Estado la construye (comprando bienes de verdad) y sube la educación y la ciencia |
| 88 | innovación | la probabilidad crece con la ciencia y la creatividad; los tradicionalistas la frenan |
| 89 | superstición | sube con miedo y sin estudios; el supersticioso cree los rumores y no compra caprichos en día nefasto |
| 90 | mitología | los mitos de cada religión crecen con sus ritos y sus fieles y alimentan la fe |

### El mundo (`g3/mundo.esl`, añadidas)

| # | mecánica | cómo funciona |
|---|---|---|
| 91 | estaciones | primavera, verano, otoño, invierno |
| 92 | clima | temperatura del día por estación ± 4 °C, más el calentamiento por contaminación |
| 93 | lluvia y sequía | llueve según la estación y el bosque; tres días secos son sequía (cosecha a la mitad) |
| 94 | plagas | en verano destruyen comida almacenada y bajan la cosecha |
| 95 | epidemias | contagio por territorio según enfermos, inmunidad, higiene y médicos; chispas al azar |
| 96 | desastres | raros, más sin bosque: destruyen inventario, casas y rutas, y hieren |
| 97 | contaminación | la emiten la tecnología y el lujo; el bosque la absorbe; enferma y calienta |
| 98 | suelo | la cosecha lo agota; descansa en invierno |
| 99 | acuífero | la lluvia lo llena, el agua que se produce lo vacía |
| 100 | bosque | crece solo; cada casa nueva tala; sin bosque, más desastres y más contaminación |

## La corrida por defecto de la 3.0 (nube, semilla 20261018)

Para comparar. La de la 3.1 está [arriba](#antes-y-después-corrida-por-defecto-semilla-20261018-10-mundos).

| | |
|---|---|
| población | de 1693 a 1706 por mundo en 6 años: 405 nacimientos y 394 muertes (54 niños, 44 de hambre o sed, 2 en la guerra) |
| economía | Hoover 45,8 % · el 10 % más rico tiene el 49,6 % · el 59,5 % cambió de quintil · paro 2,4 % · 31 empresas activas por mundo |
| Estados | autoridad media 8778 · impuesto 13,6 % · burocracia 21,8 % · 4,2 % de funcionarios |
| guerras | en 3 de 10 mundos, con conquistas en los 3; 3 Estados se quedaron sin territorio |
| saber | los 30 Estados inventaron la escritura · 60 bibliotecas · tecnología media 105 (máx. 115) |
| el mundo | 16,9 sequías, 3,5 plagas y 2 desastres por mundo · el bosque bajó de 9000 a 7528 por las casas |

Los números cambiaron un poco respecto a la primera versión porque el azar de cada
persona ahora sale de su número dentro del mundo (para que los lotes no cambien
los mundos). Las conclusiones son las mismas.

## Lo que se ajustó probando (para que conste)

- **Hambre con dinero.** Al principio se moría de hambre gente que tenía dinero.
  Tres causas:
  - se elegían estantes vacíos;
  - se guardaba rencor a la única tienda de comida del territorio;
  - la frontera cerrada cortaba el comercio del todo.

  Ahora:
  - se ve el estante vacío desde la puerta;
  - con hambre no hay rencor;
  - con la frontera cerrada se compra igual, pero se paga aduana.
- **Trabajo atascado.** Con todas las empresas llenas de caja, la v2 contrataba al
  azar y el trabajo no iba a donde faltaba comida. Ahora:
  - el que busca trabajo elige, de cuatro empresas, la que más manos necesita;
  - quien trabaja en una con el almacén lleno se va a veces a buscar otra.
- **Escala.** Con 500 personas el mundo era estable; con 2000 se agotaban el
  acuífero y el suelo y la contaminación lo calentaba 11 °C. Bajé las emisiones,
  el agua que se saca por unidad y el desgaste del suelo. Ahora con 2000 el bosque
  baja despacio, y una economía más grande o más industrial puede llegar al límite.
- **Guerras sin fin.** Con el doble de poder para conquistar no conquistaba nadie.
  Ahora basta vez y media, y la batalla tiene suerte (±30 %).

## Lo que es raro a propósito, o falta

- Rebeliones y revoluciones no salieron en la corrida por defecto: hacen falta
  frustración alta y un gobierno sin autoridad, y estas sociedades fueron
  prósperas. Están probadas en el código, no en una crisis. Para verlas hay que
  apretar (menos producción, más impuestos).
- En 6 años no se formó ninguna alianza (relación > 60): el comercio acerca, pero despacio.
- Los inversores de la v2 no son personas: no nacen ni mueren.
- Un año por hora es una convención del juego: una epidemia dura «dos años», que
  son dos horas de reloj.
- La GPU de verdad (Kaggle) no está probada todavía con la v3. La simulada da
  lo mismo al bit, y el cuaderno `c1en/kaggle-ecosim-g3.ipynb` está probado en
  la nube con JIT en lugar de GPU (3 lotes, CSV juntado y partido).
- El tope de 1562 mundos por proceso es del motor (50 millones por arreglo). Se
  podría subir en el motor experimental, pero con lotes no hace falta.
