const numero = (valor) => Number(valor || 0)

function claveMoneda(valor) {
  return String(valor || 'N/A').toUpperCase()
}

function redondear(valor) {
  return Number(Number(valor || 0).toFixed(8))
}

/** Analiza exclusivamente los datos locales; no conecta con Interactive Brokers. */
export function analizarPortafolio({ brokers = [], activos = [], movimientos = [] } = {}) {
  const porMoneda = new Map()
  const porActivo = new Map()
  const brokerPorId = new Map(brokers.map((broker) => [broker.id, broker.nombre_broker]))
  const casilla = (moneda) => {
    const clave = claveMoneda(moneda)
    if (!porMoneda.has(clave)) porMoneda.set(clave, { moneda: clave, valorActual: 0, invertido: 0, comisiones: 0, activos: 0, brokers: new Set() })
    return porMoneda.get(clave)
  }
  for (const activo of activos) {
    const moneda = claveMoneda(activo.moneda)
    const valorActual = numero(activo.valor_total) || numero(activo.valor_unitario) * numero(activo.cantidad)
    const fila = casilla(moneda)
    fila.valorActual += valorActual
    fila.activos += 1
    if (activo.broker_id) fila.brokers.add(brokerPorId.get(activo.broker_id) || 'Broker')
    const clave = `${moneda}:${String(activo.nombre_activo || 'Sin nombre').toUpperCase()}`
    const previo = porActivo.get(clave) || { nombre: activo.nombre_activo || 'Sin nombre', moneda, valorActual: 0, cantidad: 0, brokers: new Set() }
    previo.valorActual += valorActual
    previo.cantidad += numero(activo.cantidad)
    if (activo.broker_id) previo.brokers.add(brokerPorId.get(activo.broker_id) || 'Broker')
    porActivo.set(clave, previo)
  }
  for (const movimiento of movimientos) {
    const fila = casilla(movimiento.broker_moneda)
    if (movimiento.broker_id) fila.brokers.add(brokerPorId.get(movimiento.broker_id) || 'Broker')
    const monto = numero(movimiento.monto)
    if (movimiento.cantidad != null) fila.invertido += movimiento.tipo === 'egreso' ? monto : -monto
    else if (movimiento.tipo === 'egreso' && /comisi[oó]n|commission|\bfee\b|tarifa/i.test(String(movimiento.descripcion || ''))) fila.comisiones += monto
  }
  const monedas = [...porMoneda.values()].map((fila) => {
    const ganancia = fila.valorActual - fila.invertido
    return { ...fila, brokers: [...fila.brokers], valorActual: redondear(fila.valorActual), invertido: redondear(fila.invertido), comisiones: redondear(fila.comisiones), ganancia: redondear(ganancia), porcentaje: fila.invertido > 0 ? redondear((ganancia / fila.invertido) * 100) : null }
  }).sort((a, b) => b.valorActual - a.valorActual)
  const activosAnalizados = [...porActivo.values()].map((activo) => ({ ...activo, brokers: [...activo.brokers], valorActual: redondear(activo.valorActual) })).sort((a, b) => b.valorActual - a.valorActual)
  const valorTotal = monedas.reduce((total, fila) => total + fila.valorActual, 0)
  const invertidoTotal = monedas.reduce((total, fila) => total + fila.invertido, 0)
  const gananciaTotal = monedas.reduce((total, fila) => total + fila.ganancia, 0)
  const comisionesTotal = monedas.reduce((total, fila) => total + fila.comisiones, 0)
  const principal = activosAnalizados[0]
  const concentracion = principal && valorTotal > 0 ? (principal.valorActual / valorTotal) * 100 : 0
  const observaciones = []
  if (!activos.length) observaciones.push({ tipo: 'info', texto: 'Todavía no hay posiciones registradas para analizar.' })
  else if (concentracion >= 70) observaciones.push({ tipo: 'alerta', texto: `${principal.nombre} concentra ${concentracion.toFixed(1)} % del valor registrado. Revisa si coincide con tu objetivo.` })
  else if (concentracion >= 40) observaciones.push({ tipo: 'aviso', texto: `${principal.nombre} es la posición principal con ${concentracion.toFixed(1)} % del valor registrado.` })
  else observaciones.push({ tipo: 'ok', texto: 'No se observa una concentración superior al 40 % en una sola posición.' })
  if (gananciaTotal > 0) observaciones.push({ tipo: 'ok', texto: `El valor actual supera el costo de las operaciones en ${Math.abs(gananciaTotal).toFixed(2)} unidades monetarias.` })
  if (gananciaTotal < 0) observaciones.push({ tipo: 'alerta', texto: `El valor actual está por debajo del costo de las operaciones en ${Math.abs(gananciaTotal).toFixed(2)} unidades monetarias.` })
  if (monedas.length > 1) observaciones.push({ tipo: 'info', texto: `El portafolio está expresado en ${monedas.length} monedas y no se convierte entre divisas.` })
  if (comisionesTotal > 0) observaciones.push({ tipo: 'info', texto: `Se identificaron comisiones por ${comisionesTotal.toFixed(2)}. Se muestran aparte del costo de inversión.` })
  return { totalActivos: activos.length, totalBrokers: brokers.length, valorTotal: redondear(valorTotal), invertidoTotal: redondear(invertidoTotal), gananciaTotal: redondear(gananciaTotal), comisionesTotal: redondear(comisionesTotal), porcentajeTotal: invertidoTotal > 0 ? redondear((gananciaTotal / invertidoTotal) * 100) : null, monedas, activos: activosAnalizados, observaciones }
}

export function recomendacionInformativa(analisis) {
  if (!analisis.totalActivos) return 'Registra o importa una posición para que el asesor pueda analizarla.'
  if (analisis.gananciaTotal < 0) return 'Revisa si la caída corresponde a una variación temporal, a una concentración elevada o a un cambio en tu objetivo. Esto no constituye una orden de compra o venta.'
  if (analisis.monedas.length > 1) return 'Compara cada moneda por separado antes de sacar conclusiones; no se deben sumar divisas sin una tasa de conversión.'
  return 'Mantén actualizado el precio de tus activos y compara periódicamente la distribución real con tus objetivos de inversión.'
}
