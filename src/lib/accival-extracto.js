// Extracto unificado de Acciones & Valores: resumen general + detalle por FIC.
// Mismo formato para cuentas de Acciones y Valores y trii; nunca usar para Bancolombia.
const monto = String.raw`(-?\s*\$\s*[\d.]+,\d{2})`

function dinero(texto) {
  if (!texto) return null
  const valor = Number(texto.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(valor) ? valor : null
}

function renglon(texto, etiqueta) {
  const match = texto.match(new RegExp(`^\\s*${etiqueta}\\s+${monto}`, 'im'))
  return match ? dinero(match[1]) : null
}

function movimientosFondo(texto, periodo, nombre, saldos) {
  const tipos = [
    { etiqueta: 'Adiciones', tipo: 'Adición', monto: saldos.adiciones, transaccion: /^ADICI[OÓ]N(?:ES)?$/i },
    { etiqueta: 'Retiros', tipo: 'Retiro', monto: saldos.retiros, transaccion: /^RETIRO(?:S)?$/i },
    { etiqueta: 'GMF', tipo: 'GMF', monto: renglon(texto, 'GMF'), transaccion: /^GMF$/i },
    { etiqueta: 'Retención en la fuente', tipo: 'Retención en la fuente', monto: renglon(texto, 'Retenci[oó]n en la fuente'), transaccion: /^RETENCI[OÓ]N(?: EN LA FUENTE)?$/i },
  ]
  const inicio = texto.search(/Fecha Transacci[oó]n\s+Transacci[oó]n\s+Valor/i)
  const detalle = inicio < 0 ? [] : texto.slice(inicio).split('\n').flatMap((linea) => {
    const columnas = linea.trim().split(/\s{2,}/)
    const fecha = columnas[0]?.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/)
    const concepto = columnas[1]?.trim()
    const tipo = tipos.find((item) => item.transaccion.test(concepto || ''))
    if (!fecha || !tipo) return []
    const fechaIso = `${fecha[3]}-${fecha[2]}-${fecha[1]}`
    if (fechaIso.slice(0, 7) !== periodo) throw new Error('Una transacción no coincide con el periodo del extracto.')
    const valor = dinero(columnas[2])
    if (valor === null) throw new Error('No se pudo leer el importe de una transacción.')
    return [{ fecha: fechaIso, tipo: tipo.tipo, valor: Math.abs(valor), fondo: nombre, origen: 'transacción' }]
  })
  for (const tipo of tipos) {
    const filas = detalle.filter((item) => item.tipo === tipo.tipo)
    if (tipo.monto === null) {
      if (filas.length) throw new Error(`Falta el total de ${tipo.etiqueta} en ${nombre}.`)
      continue
    }
    const total = filas.reduce((suma, item) => suma + item.valor, 0)
    if (total > 0 && Math.abs(total - Math.abs(tipo.monto)) > 0.03) throw new Error(`Las transacciones de ${tipo.etiqueta} no coinciden con su total en ${nombre}.`)
    if (!filas.length && tipo.monto !== 0) detalle.push({ fecha: null, tipo: tipo.tipo, valor: Math.abs(tipo.monto), fondo: nombre, origen: 'resumen mensual' })
  }
  return detalle.filter((item) => item.valor !== 0)
}

export function extraerExtractoAccival(paginas) {
  if (!Array.isArray(paginas) || !paginas.length) throw new Error('El PDF no tiene texto extraíble.')
  const textos = paginas.map(String)
  const primera = textos.find((texto) => /Extracto de Inversiones/i.test(texto) && /Total Portafolio/i.test(texto))
  if (!primera || !/acciones\s*(?:&|y)\s*valores|accivalores\.com/i.test(textos.join('\n'))) throw new Error('El PDF no corresponde a un extracto unificado de Acciones y Valores.')
  const fecha = primera.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(20\d{2})\b/i)
  if (!fecha) throw new Error('No se encontró el mes de corte del extracto.')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const periodo = `${fecha[3]}-${String(meses.indexOf(fecha[2].toLowerCase()) + 1).padStart(2, '0')}`
  const campos = {
    efectivo: 'Saldos en Efectivo', renta_variable: 'Renta Variable', renta_fija: 'Renta Fija',
    repos_activos: 'Repos Activos', simultaneas_activas: 'Simultáneas Activas',
    fondos_inversion: 'Fondo de Inversión Colectiva', total_activos: 'Total Activos',
    total_pasivos: 'Total Pasivos', total_portafolio: 'Total Portafolio',
  }
  const resumen = Object.fromEntries(Object.entries(campos).map(([clave, etiqueta]) => [clave, renglon(primera, etiqueta)]))
  if (Object.values(resumen).some((valor) => valor === null)) throw new Error('El resumen de activos del PDF está incompleto.')
  const fondos = []
  for (const texto of textos) {
    if (!/Extracto Fondos/i.test(texto) || !/Acciones\s*&\s*Valores/i.test(texto)) continue
    // La línea del fondo puede terminar en la columna "Comisión Fondo", en un NIT
    // o inmediatamente tras el nombre; otra línea suele mostrarlo abreviado (...).
    const candidatos = texto.split('\n').flatMap((linea) => {
      const inicio = linea.search(/\bFIC\s+ACCIVAL\b/i)
      if (inicio < 0) return []
      const columna = linea.slice(inicio).split(/\s{2,}|\s+Comisi[oó]n\b/i)[0].trim()
      return columna && !/\.\.\./.test(columna) ? [columna] : []
    })
    const nombreCompleto = candidatos[0]?.replace(/ACCIO NES/gi, 'ACCIONES').replace(/\s+/g, ' ').trim()
    if (!nombreCompleto) throw new Error('No se pudo identificar el nombre completo de un fondo; el PDF solo contiene nombres abreviados.')
    const saldos = {
      saldo_anterior: renglon(texto, 'Saldo anterior'), adiciones: renglon(texto, 'Adiciones'),
      retiros: renglon(texto, 'Retiros'), rendimientos: renglon(texto, 'Rendimientos'),
      pago_rendimientos: renglon(texto, 'Pago de rendimientos'), nuevo_saldo: renglon(texto, 'Nuevo saldo'),
    }
    const unidades = texto.match(/^\s*Nuevo saldo\s+-?\s*\$\s*[\d.]+,\d{2}\s+([\d.,]+)/im)?.[1]
    const valorUnidad = texto.match(/Valor Unidad Final\s*\n\s*Encargo[^\n]*?\$\s*([\d.]+,\d+)/i)?.[1]
    const rentabilidad = texto.match(/^\s*\d+-\d+\s+(-?[\d.,]+)\s*%\s*E\.A/im)?.[1]
    const decimal = (valor) => valor ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
    if (Object.values(saldos).some((valor) => valor === null)) throw new Error(`Faltan importes en el fondo ${nombreCompleto}.`)
    const fechas = texto.match(new RegExp(`\\b(${meses.join('|')})-(\\d{2})-(20\\d{2})\\s+(${meses.join('|')})-(\\d{2})-(20\\d{2})`, 'i'))
    if (!fechas || `${fechas[6]}-${String(meses.indexOf(fechas[4].toLowerCase()) + 1).padStart(2, '0')}` !== periodo) throw new Error(`El periodo del fondo ${nombreCompleto} no coincide con el resumen.`)
    const gmf = renglon(texto, 'GMF')
    const retencion = renglon(texto, 'Retenci[oó]n en la fuente')
    const entradas = renglon(texto, 'Entradas por reclasificaci[oó]n')
    const salidas = renglon(texto, 'Salidas por reclasificaci[oó]n')
    if (Math.abs(saldos.saldo_anterior + saldos.adiciones - saldos.retiros - (gmf ?? 0) + saldos.rendimientos - saldos.pago_rendimientos - (retencion ?? 0) + (entradas ?? 0) - (salidas ?? 0) - saldos.nuevo_saldo) > 0.03) throw new Error(`El saldo del fondo ${nombreCompleto} no cuadra con sus movimientos.`)
    fondos.push({ nombre: nombreCompleto, ...saldos, unidades: decimal(unidades), valor_unidad: decimal(valorUnidad), rentabilidad_valor_unidad_ea: decimal(rentabilidad), movimientos: movimientosFondo(texto, periodo, nombreCompleto, saldos) })
  }
  if (!fondos.length && resumen.fondos_inversion !== 0) throw new Error('El extracto informa saldo en fondos, pero no incluye su detalle.')
  const suma = Math.round(fondos.reduce((total, fondo) => total + fondo.nuevo_saldo, 0) * 100) / 100
  if (Math.abs(suma - resumen.fondos_inversion) > 0.03 || Math.abs(resumen.total_activos - resumen.total_pasivos - resumen.total_portafolio) > 0.03) throw new Error('Los totales del resumen no concuerdan con los fondos o el portafolio.')
  return { periodo, resumen, fondos }
}
