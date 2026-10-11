/**
 * Capa de datos del módulo de brokers .
 *
 * Todas las lecturas pasan por las vistas de la migración 0005, que resuelven
 * los nombres desnormalizados (D8): `movimientos_broker_view` trae
 * `broker_nombre`, `activos_broker_view` trae `valor_total` ya calculado y
 * `precios_activo_view` trae `nombre_activo`.
 *
 * El borrado es lógico (D7) y se filtra aquí, como en el resto de la capa de
 * datos: las vistas ya filtran por dentro, las tablas no.
 */
import { api, apiJson } from '@/lib/api'

// ---------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------

export async function listarBrokers(empresaId) {
  const { brokers } = await api(`/api/empresas/${empresaId}/brokers`)
  return brokers
}

export async function obtenerBroker(brokerId) {
  const { broker } = await api(`/api/brokers/${brokerId}`)
  return broker
}

export function crearBroker({ empresaId, nombreBroker, moneda }) {
  return apiJson(`/api/empresas/${empresaId}/brokers`, 'POST', { nombre_broker: nombreBroker, moneda })
}

/**
 * Borra el broker lógicamente. Sus movimientos, activos y precios NO se tocan:
 * el acceso ya se deriva del `deleted_at` del broker en las vistas, y una
 * cascada de borrados lógicos es justo lo que D19 descartó para las empresas.
 */
export function borrarBroker(empresaId, brokerId) {
  return api(`/api/empresas/${empresaId}/brokers/${brokerId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------
// Movimientos (caja y operaciones)
// ---------------------------------------------------------------------

/**
 * Movimientos de un broker, de la vista (ya con `broker_moneda` resuelta).
 *
 * Se lee el campo `descripcion` — no `concepto`, que es el nombre que usa el
 * módulo de cuentas — porque es el que define la tabla `movimientos_broker`.
 */
export async function listarMovimientosBroker(brokerId) {
  const { movimientos } = await api(`/api/brokers/${brokerId}/movimientos`)
  return movimientos
}

/**
 * Crea un movimiento. Distingue los dos tipos que conviven en la tabla:
 *
 *   caja       → solo monto (cantidad y valor_unitario NULL)
 *   operación  → monto + cantidad + valor_unitario
 *
 * El CHECK `mov_broker_cantidad_valor_coherentes` de la 0003 exige que
 * `cantidad` y `valor_unitario` vengan **los dos o ninguno**. Aquí se exige lo
 * mismo por adelantado y se **lanza** si solo llega uno: mandarlo a la base
 * daría un 23514 que no dice qué falta, y "arreglarlo" enviándolo como caja
 * —que es lo que hacía la primera versión de esta función— guardaría la fila
 * perdiendo la cantidad en silencio. En una app financiera, una operación
 * incompleta es un fallo del llamante, no un movimiento de caja.
 *
 * Ojo con la semántica del PRD §5: `ingreso` es depósito **o venta**, y
 * `egreso` es retiro **o compra**. El signo del monto nunca se usa para
 * distinguirlos (el monto es siempre positivo).
 */
export function crearMovimientoBroker({ empresaId, brokerId, fecha, descripcion, tipo, monto, cantidad, valorUnitario }) {
  return apiJson(`/api/empresas/${empresaId}/brokers/${brokerId}/movimientos`, 'POST', {
    fecha, descripcion, tipo, monto, cantidad, valor_unitario: valorUnitario,
  })
}

export function borrarMovimientoBroker(empresaId, brokerId, movimientoId) {
  return api(`/api/empresas/${empresaId}/brokers/${brokerId}/movimientos/${movimientoId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------
// Activos (posiciones)
// ---------------------------------------------------------------------

export async function listarActivos(brokerId) {
  const { activos } = await api(`/api/brokers/${brokerId}/activos`)
  return activos
}

/**
 * Crea una posición. `valor_unitario` es el precio de entrada: lo actualizará
 * la función de precios, no este formulario.
 */
export function crearActivo({ empresaId, brokerId, nombreActivo, tipoActivo, cantidad, valorUnitario, moneda }) {
  return apiJson(`/api/empresas/${empresaId}/brokers/${brokerId}/activos`, 'POST', {
    nombre_activo: nombreActivo, tipo_activo: tipoActivo, cantidad, valor_unitario: valorUnitario, moneda,
  })
}

export function borrarActivo(empresaId, brokerId, activoId) {
  return api(`/api/empresas/${empresaId}/brokers/${brokerId}/activos/${activoId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------

/**
 * Historial de precios de un broker (pestaña «Precios»).
 *
 * Solo lectura: los precios los escribe el worker de precios.
 * A diferencia de las otras tres, la tabla `precios_activo` no está en la
 * publicación de realtime (0007), así que la pestaña no se autoactualiza.
 */
export async function listarPrecios(brokerId) {
  const { precios } = await api(`/api/brokers/${brokerId}/precios`)
  return precios
}

/**
 * Totales del broker para las tarjetas de cabecera.
 *
 * Se calcula en el cliente a partir de las filas que la página ya tiene: el
 * PRD no pide totales consolidados entre monedas (D4), solo por moneda, y una
 * vista extra o una función RPC para esto sería más infraestructura que la
 * suma de un array.
 *
 * `caja` sale de los movimientos (ingreso suma, egreso resta). `valorActivos`
 * sale de los activos y **no se suma a la caja**: son dos cosas distintas —
 * efectivo disponible frente a valor de mercado de las posiciones—, y mezclarlas
 * daría un número que no es ni lo uno ni lo otro.
 */
export function calcularTotalesBroker(movimientos = [], activos = []) {
  const porMoneda = new Map()

  const casilla = (moneda) => {
    const clave = (moneda || 'N/A').toUpperCase()
    if (!porMoneda.has(clave)) {
      porMoneda.set(clave, { moneda: clave, caja: 0, valorActivos: 0, invertido: 0 })
    }
    return porMoneda.get(clave)
  }

  for (const m of movimientos) {
    const acc = casilla(m.broker_moneda)
    const monto = Number(m.monto || 0)
    acc.caja += m.tipo === 'ingreso' ? monto : -monto
    // «Invertido» son las operaciones, no la caja: compras menos ventas.
    if (m.cantidad != null) {
      acc.invertido += m.tipo === 'egreso' ? monto : -monto
    }
  }

  for (const a of activos) {
    const acc = casilla(a.moneda)
    acc.valorActivos += Number(a.valor_total || 0)
  }

  // Redondeo a 8 decimales: la precisión de numeric(20,8) (D3). Es solo para
  // no arrastrar las colas binarias de sumar en coma flotante en el cliente.
  return [...porMoneda.values()]
    .map((acc) => ({
      moneda: acc.moneda,
      caja: redondear(acc.caja),
      invertido: redondear(acc.invertido),
      valorActivos: redondear(acc.valorActivos),
    }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

function redondear(n) {
  return Number(n.toFixed(8))
}
