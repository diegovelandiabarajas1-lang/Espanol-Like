// Segun con varios valores por caso, De Otro Modo, y las funciones de cadena.
Proceso MenuConSegun
	Definir opcion Como Entero
	Definir palabra Como Caracter
	Escribir "1) Mayúsculas  2) Longitud  3) Primeras tres letras  4) Al revés"
	Leer opcion
	Escribir "Una palabra:"
	Leer palabra
	Segun opcion Hacer
		1:
			Escribir Mayusculas(palabra)
		2:
			Escribir "Tiene ", Longitud(palabra), " letras"
		3:
			Escribir Subcadena(palabra, 1, 3)
		4:
			Escribir alReves(palabra)
		De Otro Modo:
			Escribir "Esa opción no existe"
	FinSegun
FinProceso

Funcion r <- alReves(t)
	Definir i Como Entero
	r <- ""
	Para i <- Longitud(t) Hasta 1 Con Paso -1 Hacer
		r <- Concatenar(r, Subcadena(t, i, i))
	FinPara
FinFuncion
