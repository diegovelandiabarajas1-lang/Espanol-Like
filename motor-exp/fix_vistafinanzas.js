const fs = require('fs');
let c = fs.readFileSync('app/mega-web.esl', 'utf8');

// Encontrar el inicio y fin de vistaFinanzas
const inicio = c.indexOf('fn vistaFinanzas(): nulo {');
const fin = c.indexOf('fn vistaConfiguracion(): nulo {');
if (inicio < 0 || fin < 0) { console.log('No se encontró'); process.exit(1); }

const nuevaFuncion = `fn vistaFinanzas(): nulo {
    var htmlTexto: texto
    si longitud(transacciones) == 0 {
        htmlTexto = "<div style=\\'padding:2rem;text-align:center;color:#64748b\\'>Sin transacciones</div>"
    }
    sino {
        htmlTexto = "<table style=\\'width:100%;border-collapse:collapse\\'><thead><tr><th style=\\'text-align:left;padding:0.75rem 1rem;border-bottom:1px solid #e2e8f0;font-weight:600;color:#374151;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.05em\\'>Concepto</th><th style=\\'text-align:right;padding:0.75rem 1rem;border-bottom:1px solid #e2e8f0;font-weight:600;color:#374151;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.05em\\'>Monto</th><th style=\\'text-align:left;padding:0.75rem 1rem;border-bottom:1px solid #e2e8f0;font-weight:600;color:#374151;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.05em\\'>Tipo</th></tr></thead><tbody>"
        para tr in transacciones {
            var tipo: texto = obtener(tr, "tipo", "")
            var cm: texto = si tipo == "ingreso" entonces "#10b981" sino "#ef4444"
            var cf: texto = si tipo == "ingreso" entonces "#dcfce7" sino "#fecaca"
            var ct: texto = si tipo == "ingreso" entonces "#166534" sino "#991b1b"
            var mt: texto = si tipo == "ingreso" entonces "+" sino "-" + formatearMoneda(obtener(tr, "monto", 0))
            htmlTexto = htmlTexto + "<tr style=\\'border-bottom:1px solid #f1f5f9\\'><td style=\\'padding:1rem;color:#475569;font-size:0.95rem\\'>" + obtener(tr, "concepto", "") + "</td><td style=\\'padding:1rem;color:" + cm + ";font-weight:600;text-align:right;font-size:0.95rem\\'>" + mt + "</td><td style=\\'padding:1rem;background:" + cf + ";color:" + ct + ";font-size:0.85rem;font-weight:500;border-radius:4px;text-transform:capitalize\\'>" + tipo + "</td></tr>"
        }
        htmlTexto = htmlTexto + "</tbody></table>"
    }
    pintar(etiqueta("div", {},
        etiqueta("div", estilo({"mostrar": "flex", "justifyContent": "entre", "alignItems": "centro", "margenAbajo": 1.5}),
            etiqueta("div", {},
                etiqueta("h2", estilo({"tamano": 2, "grosor": 800, "color": si temaOscuro entonces "#f9fafb" sino "#1e293b"}), "Finanzas"),
                etiqueta("p", estilo({"tamano": 1, "color": si temaOscuro entonces "#94a3b8" sino "#64748b"}), "Ingresos y gastos")
            ),
            etiqueta("div", estilo({"mostrar": "flex", "espaciado": 0.75}),
                boton("Ingreso", fn() { imprimir("ingreso") }, estilo({"fondo": "#10b981", "color": "#ffffff", "borde": "ninguno", "redondeo": 8, "relleno": [0.75, 1.25], "tamano": 0.9, "peso": 600})),
                boton("Gasto", fn() { imprimir("gasto") }, estilo({"fondo": "#ef4444", "color": "#ffffff", "borde": "ninguno", "redondeo": 8, "relleno": [0.75, 1.25], "tamano": 0.9, "peso": 600}))
            )
        ),
        etiqueta("div", estilo({"mostrar": "grid", "gridTemplateColumns": "repeat(auto-fit, minmax(260px, 1fr))", "hueco": 1.5, "margenAbajo": 2}),
            tarjetaEstadistica("Saldo total", formatearMoneda(saldoTotal()), "#4f46e5", "Disponible"),
            tarjetaEstadistica("Ingresos", formatearMoneda(totalIngresos()), "#10b981", "Este mes"),
            tarjetaEstadistica("Gastos", formatearMoneda(totalGastos()), "#ef4444", "Este mes")
        ),
        etiqueta("div", estilo({"fondo": si temaOscuro entonces "#1e293b" sino "#ffffff", "borde": "1px solid " + (si temaOscuro entonces "#334155" sino "#e2e8f0"), "redondeo": 12, "relleno": 1.5}),
            etiqueta("h3", estilo({"tamano": 1, "peso": 600, "color": si temaOscuro entonces "#f9fafb" sino "#1e293b", "margenAbajo": 1}), "Últimas transacciones"),
            etiqueta("div", estilo({"alto": 400, "desbordarY": "auto"}),
                crudo(htmlTexto)
            )
        )
    ))
}`;

c = c.substring(0, inicio) + nuevaFuncion + c.substring(fin);
fs.writeFileSync('app/mega-web.esl', c);
console.log('vistaFinanzas reemplazada');
