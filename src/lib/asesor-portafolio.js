const numero = (valor) => Number(valor || 0)
const PERFIL_CLIENTE = { nombre: 'Moderado', nivel: 'moderado', maximoAltoPct: 30 }

function claveMoneda(valor) {
  const clave = String(valor || '').trim().toUpperCase()
  if (clave === 'USDT' || clave === 'USDC') return 'USD'
  if (clave === 'EURC') return 'EUR'
  if (['USD', 'EUR', 'COP'].includes(clave)) return clave
  return null
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

function textoRiesgo(...valores) {
  const valor = valores.find((item) => String(item || '').trim() && !['pendiente', 'consultando'].includes(String(item).trim().toLowerCase()))
  return String(valor || 'Sin clasificar').trim()
}

function nivelRiesgo(valor) {
  const texto = textoRiesgo(valor).toLowerCase()
  if (/sin clasificar|no registrado|pendiente|consultando/.test(texto)) return 'sin_clasificar'
  if (/alto|agresivo|variable|cripto|crypto|acciones|renta variable/.test(texto)) return 'alto'
  if (/bajo|conservador|liquidez|fiducuenta|renta fija/.test(texto)) return 'bajo'
  return 'moderado'
}

function compararConPerfil(nivel) {
  if (nivel === 'alto') return 'supera el perfil moderado'
  if (nivel === 'bajo') return 'por debajo del perfil moderado'
  if (nivel === 'sin_clasificar') return 'sin riesgo registrado'
  return 'alineado al perfil moderado'
}

function sumarMoneda(mapa, moneda, cambios) {
  const clave = claveMoneda(moneda)
  if (!clave) return null
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

function resumenRiesgoPorMoneda(productos = []) {
  const porMoneda = new Map()
  for (const producto of productos) {
    const moneda = producto.moneda
    if (!porMoneda.has(moneda)) porMoneda.set(moneda, { moneda, total: 0, bajo: 0, moderado: 0, alto: 0, sin_clasificar: 0 })
    const fila = porMoneda.get(moneda)
    const valor = numero(producto.valorActual)
    fila.total += valor
    fila[producto.nivelRiesgo] += valor
  }
  return [...porMoneda.values()].map((fila) => ({
    ...fila,
    total: redondear(fila.total),
    bajo: redondear(fila.bajo),
    moderado: redondear(fila.moderado),
    alto: redondear(fila.alto),
    sin_clasificar: redondear(fila.sin_clasificar),
    bajoPct: fila.total > 0 ? redondear((fila.bajo / fila.total) * 100) : 0,
    moderadoPct: fila.total > 0 ? redondear((fila.moderado / fila.total) * 100) : 0,
    altoPct: fila.total > 0 ? redondear((fila.alto / fila.total) * 100) : 0,
    sinClasificarPct: fila.total > 0 ? redondear((fila.sin_clasificar / fila.total) * 100) : 0,
  })).sort((a, b) => a.moneda.localeCompare(b.moneda))
}

function sugerenciasMejoramiento(productos = [], riesgos = []) {
  const mejoras = []
  if (!productos.length) return mejoras
  for (const riesgo of riesgos) {
    if (riesgo.altoPct > PERFIL_CLIENTE.maximoAltoPct) mejoras.push({ tipo: 'aviso', texto: `En ${riesgo.moneda}, el ${riesgo.altoPct.toFixed(1)} % está en productos de riesgo alto. Para un perfil moderado conviene revisar si ese peso está compensado por rentabilidad y reducir concentración si no aporta.` })
    if (riesgo.sinClasificarPct > 0) mejoras.push({ tipo: 'info', texto: `En ${riesgo.moneda}, el ${riesgo.sinClasificarPct.toFixed(1)} % está sin riesgo registrado. Completar ese dato mejora la calidad del análisis.` })
  }
  const altoSinRentabilidad = productos.filter((producto) => producto.nivelRiesgo === 'alto' && producto.rendimiento12m <= 0).slice(0, 3)
  if (altoSinRentabilidad.length) mejoras.push({ tipo: 'alerta', texto: `Productos de riesgo alto sin rendimiento positivo en 12 meses: ${altoSinRentabilidad.map((producto) => producto.nombre).join(', ')}. Revisa si justifican su riesgo frente al perfil moderado.` })
  const mejorAlineados = productos.filter((producto) => ['bajo', 'moderado'].includes(producto.nivelRiesgo) && producto.rendimiento12m > 0).sort((a, b) => b.rendimiento12m - a.rendimiento12m).slice(0, 3)
  if (mejorAlineados.length) mejoras.push({ tipo: 'ok', texto: `Productos alineados o defensivos con rendimiento positivo: ${mejorAlineados.map((producto) => producto.nombre).join(', ')}. Úsalos como referencia para comparar alternativas similares.` })
  if (!mejoras.length) mejoras.push({ tipo: 'info', texto: 'El portafolio no muestra alertas fuertes frente al perfil moderado. La mejora principal es mantener precios, saldos, riesgos y rendimientos actualizados para comparar productos equivalentes.' })
  return mejoras
}

/** Analiza exclusivamente los datos locales; no conecta con Interactive Brokers. */
export function analizarPortafolio({ brokers = [], activos = [], movimientos = [], wallets = [], fiducias = [] } = {}) {
  const porMoneda = new Map()
  const porActivo = new Map()
  const brokerPorId = new Map(brokers.map((broker) => [broker.id, broker.nombre_broker]))
  const productos = []

  const casilla = (moneda) => {
    const clave = claveMoneda(moneda)
    if (!clave) return null
    if (!porMoneda.has(clave)) porMoneda.set(clave, { moneda: clave, valorActual: 0, invertido: 0, comisiones: 0, rendimientos: 0, activos: 0, productos: 0, movimientos12m: 0, fuentes: new Set() })
    return porMoneda.get(clave)
  }

  for (const activo of activos) {
    const moneda = claveMoneda(activo.moneda)
    if (!moneda) continue
    const valorActual = numero(activo.valor_total) || numero(activo.valor_unitario) * numero(activo.cantidad)
    const costo = numero(activo.valor_compra_total) || numero(activo.valor_unitario) * numero(activo.cantidad)
    const riesgo = textoRiesgo(activo.riesgo_producto, activo.riesgo, activo.tipo_riesgo, activo.tipo_activo)
    const nivel = nivelRiesgo(riesgo)
    const fila = casilla(moneda)
    fila.valorActual += valorActual
    fila.activos += 1
    fila.productos += 1
    fila.fuentes.add('Brokers')
    if (activo.broker_id) fila.fuentes.add(brokerPorId.get(activo.broker_id) || 'Broker')
    const clave = `${moneda}:${String(activo.nombre_activo || 'Sin nombre').toUpperCase()}`
    const previo = porActivo.get(clave) || { nombre: activo.nombre_activo || 'Sin nombre', moneda, valorActual: 0, cantidad: 0, fuente: 'Broker', riesgo, nivelRiesgo: nivel, comparacionPerfil: compararConPerfil(nivel), brokers: new Set() }
    previo.valorActual += valorActual
    previo.cantidad += numero(activo.cantidad)
    if (activo.broker_id) previo.brokers.add(brokerPorId.get(activo.broker_id) || 'Broker')
    porActivo.set(clave, previo)
    productos.push({ nombre: activo.nombre_activo || 'Sin nombre', fuente: brokerPorId.get(activo.broker_id) || 'Broker', moneda, valorActual: redondear(valorActual), invertido: redondear(costo), ganancia: redondear(valorActual - costo), rendimiento12m: 0, riesgo, nivelRiesgo: nivel, comparacionPerfil: compararConPerfil(nivel) })
  }

  for (const movimiento of movimientos) {
    const fila = casilla(movimiento.broker_moneda)
    if (!fila) continue
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
      if (!moneda) continue
      const monto = numero(movimiento.monto)
      if (movimiento.esEarn || movimiento.esInteres) rendimientosPorMoneda.set(moneda, (rendimientosPorMoneda.get(moneda) || 0) + (movimiento.tipo === 'ingreso' ? monto : 0))
      if (/comisi[oó]n|commission|\bfee\b|tarifa/i.test(String(movimiento.descripcion || '')) && movimiento.tipo === 'egreso') sumarMoneda(porMoneda, moneda, { comisiones: monto })
      sumarMoneda(porMoneda, moneda, { movimientos12m: 1, fuente })
    }
    for (const saldo of saldos) {
      const moneda = claveMoneda(saldo.moneda || wallet.tipo_moneda)
      if (!moneda) continue
      const valorActual = numero(saldo.monto)
      const rendimiento12m = rendimientosPorMoneda.get(moneda) || 0
      const riesgo = textoRiesgo(saldo.riesgo_producto, saldo.riesgo, wallet.riesgo_producto, wallet.riesgo, wallet.tipo)
      const nivel = nivelRiesgo(riesgo)
      sumarMoneda(porMoneda, moneda, { valorActual, rendimientos: rendimiento12m, activos: 1, productos: 1, fuente })
      productos.push({ nombre, fuente, moneda, valorActual: redondear(valorActual), invertido: 0, ganancia: redondear(rendimiento12m), rendimiento12m: redondear(rendimiento12m), riesgo, nivelRiesgo: nivel, comparacionPerfil: compararConPerfil(nivel) })
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
        const riesgo = textoRiesgo(fondo.riesgo_fondo?.perfil_riesgo, fondo.riesgo_fondo?.nivel, fondo.riesgo)
        const nivel = nivelRiesgo(riesgo)
        sumarMoneda(porMoneda, 'COP', { valorActual: saldo, rendimientos, activos: 1, productos: 1, movimientos12m: historicoFondo.length, fuente })
        productos.push({ nombre: fondo.nombre || cuenta, fuente, moneda: 'COP', valorActual: redondear(saldo), invertido: redondear(numero(fondo.saldo_anterior) || saldo), ganancia: redondear(rendimientos), rendimiento12m: redondear(rendimientos), riesgo, nivelRiesgo: nivel, comparacionPerfil: compararConPerfil(nivel) })
      }
    } else if (ultimo) {
      const rendimientos = registros.reduce((total, registro) => total + numero(registro.rendimientos_netos), 0)
      const saldo = numero(ultimo.nuevo_saldo)
      const riesgo = textoRiesgo(ultimo.riesgo_producto, ultimo.riesgo, String(ultimo.tipo_fiducia || '').toUpperCase() === 'FIDUCUENTA' ? 'Conservador' : null)
      const nivel = nivelRiesgo(riesgo)
      sumarMoneda(porMoneda, 'COP', { valorActual: saldo, rendimientos, activos: 1, productos: 1, movimientos12m: registros.length, fuente })
      productos.push({ nombre: cuenta, fuente, moneda: 'COP', valorActual: redondear(saldo), invertido: redondear(numero(ultimo.saldo_anterior) || saldo), ganancia: redondear(rendimientos), rendimiento12m: redondear(rendimientos), riesgo, nivelRiesgo: nivel, comparacionPerfil: compararConPerfil(nivel) })
    }
  }

  const monedas = [...porMoneda.values()].map((fila) => {
    const ganancia = fila.ganancia || (fila.valorActual - fila.invertido)
    return { ...fila, fuentes: [...fila.fuentes], valorActual: redondear(fila.valorActual), invertido: redondear(fila.invertido), comisiones: redondear(fila.comisiones), rendimientos: redondear(fila.rendimientos), ganancia: redondear(ganancia), porcentaje: fila.invertido > 0 ? redondear((ganancia / fila.invertido) * 100) : null }
  }).sort((a, b) => b.valorActual - a.valorActual)
  const activosAnalizados = [...porActivo.values()].map((activo) => ({ ...activo, brokers: [...activo.brokers], valorActual: redondear(activo.valorActual) })).sort((a, b) => b.valorActual - a.valorActual)
  const productosAnalizados = productos.sort((a, b) => b.valorActual - a.valorActual)
  const riesgos = resumenRiesgoPorMoneda(productosAnalizados)
  const mejoras = sugerenciasMejoramiento(productosAnalizados, riesgos)
  const valorTotal = monedas.reduce((total, fila) => total + fila.valorActual, 0)
  const invertidoTotal = monedas.reduce((total, fila) => total + fila.invertido, 0)
  const gananciaTotal = monedas.reduce((total, fila) => total + fila.ganancia, 0)
  const comisionesTotal = monedas.reduce((total, fila) => total + fila.comisiones, 0)
  const rendimientos12mTotal = monedas.reduce((total, fila) => total + fila.rendimientos, 0)
  const principal = productosAnalizados[0] || activosAnalizados[0]
  const concentracion = principal && valorTotal > 0 ? (principal.valorActual / valorTotal) * 100 : 0
  const observaciones = []
  if (!productosAnalizados.length) observaciones.push({ tipo: 'info', texto: 'Todavía no hay productos registrados en monedas fiat para analizar en brokers, wallets o fiducias.' })
  else if (concentracion >= 70) observaciones.push({ tipo: 'alerta', texto: `${principal.nombre} concentra ${concentracion.toFixed(1)} % del valor registrado. Revisa si coincide con tu perfil moderado y con el riesgo propio del producto.` })
  else if (concentracion >= 40) observaciones.push({ tipo: 'aviso', texto: `${principal.nombre} es el producto principal con ${concentracion.toFixed(1)} % del valor registrado.` })
  else observaciones.push({ tipo: 'ok', texto: 'No se observa una concentración superior al 40 % en un solo producto.' })
  for (const fila of monedas) {
    if (fila.ganancia > 0) observaciones.push({ tipo: 'ok', texto: `En ${fila.moneda}, el valor actual supera el costo de las operaciones en ${Math.abs(fila.ganancia).toFixed(2)} ${fila.moneda}.` })
    if (fila.ganancia < 0) observaciones.push({ tipo: 'alerta', texto: `En ${fila.moneda}, el valor actual está por debajo del costo de las operaciones en ${Math.abs(fila.ganancia).toFixed(2)} ${fila.moneda}.` })
    if (fila.rendimientos > 0) observaciones.push({ tipo: 'ok', texto: `En ${fila.moneda}, los últimos 12 meses registran rendimientos por ${fila.rendimientos.toFixed(2)} ${fila.moneda}.` })
  }
  if (productosAnalizados.some((producto) => producto.nivelRiesgo === 'alto')) observaciones.push({ tipo: 'aviso', texto: 'Hay productos cuyo riesgo propio supera el perfil moderado del cliente; revisa si la rentabilidad compensa ese riesgo.' })
  if (productosAnalizados.some((producto) => producto.nivelRiesgo === 'sin_clasificar')) observaciones.push({ tipo: 'info', texto: 'Hay productos sin nivel de riesgo registrado; el asesor los marca aparte para no confundirlos con el perfil moderado del cliente.' })
  if (monedas.length > 1) observaciones.push({ tipo: 'info', texto: `El portafolio está expresado en ${monedas.length} monedas fiat y no se convierte entre divisas.` })
  for (const fila of monedas.filter((item) => item.comisiones > 0)) observaciones.push({ tipo: 'info', texto: `En ${fila.moneda}, se identificaron comisiones por ${fila.comisiones.toFixed(2)} ${fila.moneda}. Se muestran aparte del costo de inversión.` })
  return { perfilCliente: PERFIL_CLIENTE.nombre, totalActivos: productosAnalizados.length, totalBrokers: brokers.length, valorTotal: redondear(valorTotal), invertidoTotal: redondear(invertidoTotal), gananciaTotal: redondear(gananciaTotal), comisionesTotal: redondear(comisionesTotal), rendimientos12mTotal: redondear(rendimientos12mTotal), porcentajeTotal: invertidoTotal > 0 ? redondear((gananciaTotal / invertidoTotal) * 100) : null, monedas, activos: activosAnalizados, productos: productosAnalizados, riesgos, mejoras, observaciones }
}

export function recomendacionInformativa(analisis) {
  if (!analisis.totalActivos) return 'Registra o importa productos en brokers, wallets o fiducias para que el asesor pueda analizarlos.'
  if (analisis.productos?.some((producto) => producto.nivelRiesgo === 'alto' && producto.rendimiento12m <= 0)) return 'Para un perfil moderado, prioriza revisar productos de riesgo alto que no estén aportando rendimiento en los últimos 12 meses. Esto no constituye una orden de compra o venta.'
  if (analisis.productos?.some((producto) => producto.nivelRiesgo === 'alto')) return 'Para un perfil moderado, revisa el peso de los productos de riesgo alto y compáralo con la rentabilidad que aportan. Esto no constituye una orden de compra o venta.'
  if (analisis.gananciaTotal < 0) return 'Revisa si la caída corresponde a una variación temporal, a una concentración elevada o a un cambio en tu objetivo. Esto no constituye una orden de compra o venta.'
  if (analisis.monedas.length > 1) return 'Compara cada moneda fiat por separado antes de sacar conclusiones; no se deben sumar divisas sin una tasa de conversión.'
  return 'Mantén actualizados precios, saldos, riesgos de producto y rendimientos para mejorar el portafolio respetando tu perfil moderado.'
}
