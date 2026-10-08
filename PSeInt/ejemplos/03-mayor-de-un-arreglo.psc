// Arreglos que empiezan en 1, Repetir-Hasta Que, y un SubProceso con retorno.
Proceso MayorDeUnArreglo
	Definir cuantos, i Como Entero
	Escribir "¿Cuántos números?"
	Leer cuantos
	Dimension v[cuantos]
	i <- 1
	Repetir
		Escribir "Número ", i, ":"
		Leer v[i]
		i <- i + 1
	Hasta Que i > cuantos
	Escribir "El mayor es ", mayor(v, cuantos)
	Escribir "La suma es ", suma(v, cuantos)
FinProceso

SubProceso m <- mayor(a, n)
	Definir k Como Entero
	m <- a[1]
	Para k <- 2 Hasta n Hacer
		Si a[k] > m Entonces
			m <- a[k]
		FinSi
	FinPara
FinSubProceso

SubProceso s <- suma(a, n)
	Definir k Como Entero
	s <- 0
	Para k <- 1 Hasta n Hacer
		s <- s + a[k]
	FinPara
FinSubProceso
