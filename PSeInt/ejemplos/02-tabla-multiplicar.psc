// Para con Hasta inclusivo, y Mientras para repetir hasta que diga que no.
Proceso TablaDeMultiplicar
	Definir n, i Como Entero
	Definir seguir Como Caracter
	seguir <- "s"
	Mientras seguir = "s" Hacer
		Escribir "¿Tabla de qué número?"
		Leer n
		Para i <- 1 Hasta 10 Hacer
			Escribir n, " x ", i, " = ", n * i
		FinPara
		Escribir "¿Otra? (s/n)"
		Leer seguir
	FinMientras
	Escribir "Hasta luego"
FinProceso
