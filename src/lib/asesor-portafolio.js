const numero = (valor) => Number(valor || 0)

function claveMoneda(valor) {
  return String(valor || 'N/A').toUpperCase()
}

function redondear(valor) {
  return Number(Number(valor || 0).toFixed(8))
}

function hace12Meses() {
  const fecha = new Date()
  fecha.setMonth(fecha.getMonth() - 11, 1)
  fecha.setHours(0, 0, 0, 0)
  return fecha
}

function enUltimos12Meses(fecha) {
  if (!fecha) return false
  const valor = new Date(fecha)
  if (Number.isNaN(valor.getTime())) return false
  return valor >= hace12Meses()
}

function periodoEnUltimos12Meses(periodo) {
  const coincidencia = String(periodo || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  if (!coincidencia) return false
  return new Date(`${coincidencia[1]}-${coincidencia[2]}-01T00:00:00`) >= hace12Meses()
}

function textoRiesgo(valor) {
  return String(valor || '').trim() || 'Moderado'
}

function nivelRiesgo(valor) {
  const texto = textoRiesgo(valor).toLowerCase()
  if (/alto|agresivo|variable|cripto|crypto|acciones|renta variable/.test(texto)) return 'alto'
  if (/bajo|conservador|liquidez|fiducuenta|renta fija/.test(texto)) return 'bajo'
  return 'moderado'
}

function sumarMoneda(mapa, moneda, cambios) {
  const clave = claveMoneda(moneda)
  const actual = mapa.get(clave) || {
    moneda: clave,
    valorActual: 0,
    invertido: 0,
    ganancia: 0,
    rendimientos: 0,
    comisiones: 0,
    activos: 0,
    productos: 0,
    movimientos12m: 0,
    fuentes: new Set(),
  }
  for (const [campo, valor] of Object.entries(cambios)) {
    if (campo === 'fuente') actual.fuentes.add(valor)
    else actual[campo] += numero(valor)
  }
  mapa.set(clave, actual)
  return actual
}

/** Analiza exclusivamente los datos locales; no conecta con Interactive Brokers. */
export function analizarPortafolio({ brokers = [], activos = [], movimientos = [], wallets = [], fiducias = [] } = {}) {
  const porMoneda = new Map()
  const porActivo = new Map()
  const brokerPorId = new Map(brokers.map((broker) => [broker.id, broker.nombre_broker]))
  const productos = []

  const casilla = (moneda) => {
    const clave = claveMoneda(moneda)
    if (!porMoneda.has(clave)) porMoneda.set(clave, { moneda: clave, valorActual: 0, invertido: 0, comisiones: 0, rendimientos: 0, activos: 0, productos: 0, movimientos12m: 0, fuentes: new Set() })
    return porMoneda.get(clave)
  }

  for (const activo of activos) {
    const moneda = claveMoneda(activo.moneda)
    const valorActual = numero(activo.valor_total) || numero(activo.valor_unitario) * numero(activo.cantidad)
    const costo = numero(activo.valor_compra_total) || numero(activo.valor_unitario) * numero(activo.cantidad)
    const riesgo = textoRiesgo(activo.riesgo || activo.tipo_activo || 'Renta variable')
    const fila = casilla(moneda)
    fila.valorActual += valorActual
    fila.activos += 1
    fila.productos += 1
    fila.fuentes.add('Brokers')
    if (activo.broker_id) fila.fuentes.add(brokerPorId.get(activo.broker_id) || 'Broker')
    const clave = `${moneda}:${String(activo.nombre_activo || 'Sin nombre').toUpperCase()}`
    const previo = porActivo.get(clave) || { nombre: activo.nombre_activo || 'Sin nombre', moneda, valorActual: 0, cantidad: 0, fuente: 'Broker', riesgo, brokers: new Set() }
    previo.valorActual += valorActual
    previo.cantidad += numero(activo.cantidad)
    if (activo.broker_id) previo.brokers.add(brokerPorId.get(activo.broker_id) || 'Broker')
    porActivo.set(clave, previo)
    productos.push({ nombre: activo.nombre_activo || 'Sin nombre', fuente: brokerPorId.get(activo.broker_id) || 'Broker', moneda, valorActual: redondear(valorActual), invertido: redondear(costo), ganancia: redondear(valorActual - costo), rendimiento12m: 0, riesgo, nivelRiesgo: nivelRiesgo(riesgo) })
  }

  for (const movimiento of movimientos) {
    const fila = casilla(movimiento.broker_moneda)
    if (movimiento.broker_id) fila.fuentes.add(brokerPorId.get(movimiento.broker_id) || 'Broker')
    const monto = numero(movimiento.monto)
    if (movimiento.cantidad != null) fila.invertido += movimiento.tipo === 'egreso' ? monto : -monto
    else if (movimiento.tipo === 'egreso' && /comisi[oó]n|commission|\bfee\b|tarifa/i.test(String(movimiento.descripcion || ''))) fila.comisiones += monto
    if (enUltimos12Meses(movimiento.fecha)) fila.movimientos12m += 1
  }

  for (const wallet of wallets) {
    const fuente = wallet.proveedor_nombre || wallet.proveedor || 'Wallet'
    const nombre = wallet.nombre_wallet || 'Wallet'
    const movimientos12m = (wallet.movimientos || []).filter((movimiento) => enUltimos12Meses(movimiento.fecha))
    const saldos = wallet.saldos?.length ? wallet.saldos : []
    const rendimientosPorMoneda = new Map()
    for (const movimiento of movimientos12m) {
      const moneda = claveMoneda(movimiento.tipo_moneda || movimiento.moneda || wallet.tipo_moneda)
      const monto = numero(movimiento.monto)
      if (movimiento.esEarn || movimiento.esInteres) rendimientosPorMoneda.set(moneda, (rendimientosPorMoneda.get(moneda) || 0) + (movimiento.tipo === 'ingreso' ? monto : 0))
      if (/comisi[oó]n|commission|\bfee\b|tarifa/i.test(String(movimiento.descripcion || '')) && movimiento.tipo === 'egreso') sumarMoneda(porMoneda, moneda, { comisiones: monto })
      sumarMoneda(porMoneda, moneda, { movimientos12m: 1, fuente })
    }
    for (const saldo of saldos) {
      const moneda = claveMoneda(saldo.moneda || wallet.tipo_moneda)
      const valorActual = numero(saldo.monto)
      const rendimiento12m = rendimientosPorMoneda.get(moneda) || 0
      sumarMoneda(porMoneda, moneda, { valorActual, rendimientos: rendimiento12m, activos: 1, productos: 1, fuente })
      productos.push({ nombre, fuente, moneda, valorActual: redondear(valorActual), invertido: 0, ganancia: redondear(rendimiento12m), rendimiento12m: redondear(rendimiento12m), riesgo: 'Moderado', nivelRiesgo: 'moderado' })
    }
  }

  for (const fiducia of fiducias) {
    const fuente = fiducia.comisionista_nombre || fiducia.fuente || 'Fiducia'
    const cuenta = fiducia.nombre_cuenta || 'Cuenta fiduciaria'
    const registrosTodos = [...(fiducia.activos || []), ...(fiducia.activos_accival || [])]
    const registros = registrosTodos.filter((registro) => periodoEnUltimos12Meses(registro.periodo))
    const ultimo = [...registrosTodos].sort((a, b) => String(a.periodo || '').localeCompare(String(b.periodo || ''))).at(-1)
    if (ultimo?.fondos?.length) {
      for (const fondo of ultimo.fondos) {
        const historicoFondo = registros.flatMap((registro) => (registro.fondos || []).filter((item) => item.nombre === fondo.nombre))
        const rendimientos = historicoFondo.reduce((total, item) => total + numero(item.rendimientos), 0)
        const saldo = numero(fondo.nuevo_saldo)
        const riesgo = textoRiesgo(fondo.riesgo_fondo?.perfil_riesgo || 'Moderado')
        sumarMoneda(porMoneda, 'COP', { valorActual: saldo, rendimientos, activos: 1, productos: 1, movimientos12m: historicoFondo.length, fuente })
        productos.push({ nombre: fondo.nombre || cuenta, fuente, moneda: 'COP', valorActual: redondear(saldo), invertido: redondear(numero(fondo.saldo_anterior) || saldo), ganancia: redondear(rendimientos), rendimiento12m: redondear(rendimientos), riesgo, nivelRiesgo: nivelRiesgo(riesgo) })
      }
    } else if (ultimo) {
      const rendimientos = registros.reduce((total, registro) => total + numero(registro.rendimientos_netos), 0)
      const saldo = numero(ultimo.nuevo_saldo)
      const riesgo = textoRiesgo(ultimo.riesgo || (String(ultimo.tipo_fiducia || '').toUpperCase() === 'FIDUCUENTA' ? 'Conservador' : 'Moderado'))
      sumarMoneda(porMoneda, 'COP', { valorActual: saldo, rendimientos, activos: 1, productos: 1, movimientos12m: registros.length, fuente })
      productos.push({ nombre: cuenta, fuente, moneda: 'COP', valorActual: redondear(saldo), invertido: redondear(numero(ultimo.saldo_anterior) || saldo), ganancia: redondear(rendimientos), rendimiento12m: redondear(rendimientos), riesgo, nivelRiesgo: nivelRiesgo(riesgo) })
    }
  }

  const monedas = [...porMoneda.values()].map((fila) => {
    const ganancia = fila.ganancia || (fila.valorActual - fila.invertido)
    return { ...fila, fuentes: [...fila.fuentes], valorActual: redondear(fila.valorActual), invertido: redondear(fila.invertido), comisiones: redondear(fila.comisiones), rendimientos: redondear(fila.rendimientos), ganancia: redondear(ganancia), porcentaje: fila.invertido > 0 ? redondear((ganancia / fila.invertido) * 100) : null }
  }).sort((a, b) => b.valorActual - a.valorActual)
  const activosAnalizados = [...porActivo.values()].map((activo) => ({ ...activo, brokers: [...activo.brokers], valorActual: redondear(activo.valorActual) })).sort((a, b) => b.valorActual - a.valorActual)
  const productosAnalizados = productos.sort((a, b) => b.valorActual - a.valorActual)
  const valorTotal = monedas.reduce((total, fila) => total + fila.valorActual, 0)
  const invertidoTotal = monedas.reduce((total, fila) => total + fila.invertido, 0)
  const gananciaTotal = monedas.reduce((total, fila) => total + fila.ganancia, 0)
  const comisionesTotal = monedas.reduce((total, fila) => total + fila.comisiones, 0)
  const rendimientos12mTotal = monedas.reduce((total, fila) => total + fila.rendimientos, 0)
  const principal = productosAnalizados[0] || activosAnalizados[0]
  const concentracion = principal && valorTotal > 0 ? (principal.valorActual / valorTotal) * 100 : 0
  const observaciones = []
  if (!productosAnalizados.length && !activos.length) observaciones.push({ tipo: 'info', texto: 'Todavía no hay productos registrados para analizar en brokers, wallets o fiducias.' })
  else if (concentracion >= 70) observaciones.push({ tipo: 'alerta', texto: `${principal.nombre} concentra ${concentracion.toFixed(1)} % del valor registrado. Revisa si coincide con tu perfil moderado.` })
  else if (concentracion >= 40) observaciones.push({ tipo: 'aviso', texto: `${principal.nombre} es el producto principal con ${concentracion.toFixed(1)} % del valor registrado.` })
  else observaciones.push({ tipo: 'ok', texto: 'No se observa una concentración superior al 40 % en un solo producto.' })
  if (gananciaTotal > 0) observaciones.push({ tipo: 'ok', texto: `El valor actual supera el costo de las operaciones en ${Math.abs(gananciaTotal).toFixed(2)} unidades monetarias.` })
  if (gananciaTotal < 0) observaciones.push({ tipo: 'alerta', texto: `El valor actual está por debajo del costo de las operaciones en ${Math.abs(gananciaTotal).toFixed(2)} unidades monetarias.` })
  if (rendimientos12mTotal > 0) observaciones.push({ tipo: 'ok', texto: `En los últimos 12 meses se registraron rendimientos por ${rendimientos12mTotal.toFixed(2)} unidades monetarias, sin convertir divisas.` })
  if (productosAnalizados.some((producto) => producto.nivelRiesgo === 'alto')) observaciones.push({ tipo: 'aviso', texto: 'Hay productos clasificados como riesgo alto frente a un perfil objetivo moderado; revisa su peso y comportamiento.' })
  if (monedas.length > 1) observaciones.push({ tipo: 'info', texto: `El portafolio está expresado en ${monedas.length} monedas y no se convierte entre divisas.` })
  if (comisionesTotal > 0) observaciones.push({ tipo: 'info', texto: `Se identificaron comisiones por ${comisionesTotal.toFixed(2)}. Se muestran aparte del costo de inversión.` })
  return { totalActivos: activos.length + wallets.reduce((total, wallet) => total + (wallet.saldos?.length || 0), 0) + fiducias.length, totalBrokers: brokers.length, valorTotal: redondear(valorTotal), invertidoTotal: redondear(invertidoTotal), gananciaTotal: redondear(gananciaTotal), comisionesTotal: redondear(comisionesTotal), rendimientos12mTotal: redondear(rendimientos12mTotal), porcentajeTotal: invertidoTotal > 0 ? redondear((gananciaTotal / invertidoTotal) * 100) : null, monedas, activos: activosAnalizados, productos: productosAnalizados, observaciones }
}

export function recomendacionInformativa(analisis) {
  if (!analisis.totalActivos) return 'Registra o importa productos en brokers, wallets o fiducias para que el asesor pueda analizarlos.'
  if (analisis.productos?.some((producto) => producto.nivelRiesgo === 'alto')) return 'Para un perfil moderado, revisa el peso de los productos de riesgo alto y compáralo con tus objetivos. Esto no constituye una orden de compra o venta.'
  if (analisis.gananciaTotal < 0) return 'Revisa si la caída corresponde a una variación temporal, a una concentración elevada o a un cambio en tu objetivo. Esto no constituye una orden de compra o venta.'
  if (analisis.monedas.length > 1) return 'Compara cada moneda por separado antes de sacar conclusiones; no se deben sumar divisas sin una tasa de conversión.'
  return 'Mantén actualizados precios, saldos, extractos y rendimientos para comparar periódicamente el portafolio real con un perfil moderado.'
}
