// El primer programa de todo curso: tres notas y un veredicto.
Proceso PromedioDeNotas
	Definir n1, n2, n3, promedio Como Real
	Definir nombre Como Caracter
	Escribir "Nombre del estudiante:"
	Leer nombre
	Escribir "Tres notas, de 0 a 5:"
	Leer n1, n2, n3
	promedio <- (n1 + n2 + n3) / 3
	Escribir "Promedio de ", nombre, ": ", promedio
	Si promedio >= 3 Entonces
		Escribir "Aprueba"
	SiNo
		Escribir "Reprueba"
	FinSi
FinProceso
