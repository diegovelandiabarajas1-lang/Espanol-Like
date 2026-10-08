// Una caja de tienda: lee productos hasta que le digan "fin", calcula el IVA
// de cada uno según su tipo, y al final da el total y el más caro.

Proceso CajaDeTienda
	Definir nombre, tipo Como Caracter
	Definir precio, subtotal, iva, total, mayorPrecio Como Real
	Definir cuantos, i Como Entero
	Dimension nombres[50], precios[50]

	cuantos <- 0
	total <- 0
	mayorPrecio <- 0

	Escribir "Caja de tienda. Escribe 'fin' como nombre para terminar."
	Escribir "Nombre del producto:"
	Leer nombre

	Mientras Minusculas(nombre) <> "fin" Hacer
		Escribir "Precio sin IVA:"
		Leer precio
		Escribir "Tipo (g = general 19%, a = alimento 5%, e = excluido):"
		Leer tipo

		iva <- ivaDe(precio, Minusculas(tipo))
		subtotal <- precio + iva

		cuantos <- cuantos + 1
		nombres[cuantos] <- nombre
		precios[cuantos] <- subtotal
		total <- total + subtotal

		Si subtotal > mayorPrecio Entonces
			mayorPrecio <- subtotal
		FinSi

		Escribir "  ", nombre, ": ", precio, " + IVA ", iva, " = ", subtotal
		Escribir "Nombre del producto:"
		Leer nombre
	FinMientras

	Escribir ""
	Escribir "===== RESUMEN ====="
	Si cuantos = 0 Entonces
		Escribir "No se registró nada."
	SiNo
		Para i <- 1 Hasta cuantos Hacer
			Escribir i, ". ", nombres[i], " -> ", precios[i]
		FinPara
		Escribir "Productos: ", cuantos
		Escribir "Total a pagar: ", total
		Escribir "El más caro costó ", mayorPrecio
		Escribir "Promedio por producto: ", Redon(total / cuantos)
	FinSi
FinProceso

// Devuelve el IVA según el tipo. Un Segun con De Otro Modo para lo desconocido.
Funcion resultado <- ivaDe(valor, clase)
	Segun clase Hacer
		"g":
			resultado <- valor * 0.19
		"a":
			resultado <- valor * 0.05
		"e":
			resultado <- 0
		De Otro Modo:
			Escribir "  (tipo desconocido, se cobra general)"
			resultado <- valor * 0.19
	FinSegun
FinFuncion