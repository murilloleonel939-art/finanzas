/**
 * Capa de datos del módulo de brokers (FASE 15, PRD §5).
 *
 * Todas las lecturas pasan por las vistas de la migración 0005, que resuelven
 * los nombres desnormalizados (D8): `movimientos_broker_view` trae
 * `broker_nombre`, `activos_broker_view` trae `valor_total` ya calculado y
 * `precios_activo_view` trae `nombre_activo`.
 *
 * El borrado es lógico (D7) y se filtra aquí, como en el resto de la capa de
 * datos: las vistas ya filtran por dentro, las tablas no.
 */
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------

export async function listarBrokers(empresaId) {
  const { data, error } = await supabase
    .from('brokers')
    .select('id, nombre_broker, moneda, created_at')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('nombre_broker')

  if (error) throw error
  return data ?? []
}

export async function obtenerBroker(brokerId) {
  const { data, error } = await supabase
    .from('brokers')
    .select('id, empresa_id, nombre_broker, moneda')
    .eq('id', brokerId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function crearBroker({ empresaId, nombreBroker, moneda, userId }) {
  const { data, error } = await supabase
    .from('brokers')
    .insert({
      empresa_id: empresaId,
      nombre_broker: nombreBroker,
      moneda,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

/**
 * Borra el broker lógicamente. Sus movimientos, activos y precios NO se tocan:
 * el acceso ya se deriva del `deleted_at` del broker en las vistas, y una
 * cascada de borrados lógicos es justo lo que D19 descartó para las empresas.
 */
export async function borrarBroker(brokerId) {
  const { error } = await supabase
    .from('brokers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', brokerId)

  if (error) throw error
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
  const { data, error } = await supabase
    .from('movimientos_broker_view')
    .select(
      'id, fecha, descripcion, tipo, monto, cantidad, valor_unitario, broker_moneda, external_id'
    )
    .eq('broker_id', brokerId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Crea un movimiento. Distingue los dos tipos que conviven en la tabla:
 *
 *   caja       → solo monto (cantidad y valor_unitario NULL)
 *   operación  → monto + cantidad + valor_unitario
 *
 * El CHECK `mov_broker_cantidad_valor_coherentes` de la 0003 rechaza una
 * operación a la que le falte uno de los dos, así que se normalizan aquí: si
 * llega una operación incompleta se envía como caja, en vez de dejar que
 * Postgres la rechace con un mensaje que no explica nada.
 *
 * Ojo con la semántica del PRD §5: `ingreso` es depósito **o venta**, y
 * `egreso` es retiro **o compra**. El signo del monto nunca se usa para
 * distinguirlos (el monto es siempre positivo).
 */
export async function crearMovimientoBroker({
  empresaId,
  brokerId,
  fecha,
  descripcion,
  tipo,
  monto,
  cantidad,
  valorUnitario,
  userId,
}) {
  const esOperacion = cantidad != null && valorUnitario != null

  const fila = {
    empresa_id: empresaId,
    broker_id: brokerId,
    fecha,
    descripcion,
    tipo,
    monto,
    cantidad: esOperacion ? cantidad : null,
    valor_unitario: esOperacion ? valorUnitario : null,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from('movimientos_broker')
    .insert(fila)
    .select('id')
    .single()

  if (error) throw error
  return data
}

export async function borrarMovimientoBroker(id) {
  const { error } = await supabase
    .from('movimientos_broker')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// ---------------------------------------------------------------------
// Activos (posiciones)
// ---------------------------------------------------------------------

export async function listarActivos(brokerId) {
  const { data, error } = await supabase
    .from('activos_broker_view')
    .select(
      'id, nombre_activo, tipo_activo, cantidad, valor_unitario, moneda, valor_total'
    )
    .eq('broker_id', brokerId)
    .order('nombre_activo')

  if (error) throw error
  return data ?? []
}

/**
 * Crea una posición. `valor_unitario` es el precio de entrada: lo actualizará
 * la función de precios de la FASE 18, no este formulario.
 */
export async function crearActivo({
  empresaId,
  brokerId,
  nombreActivo,
  tipoActivo,
  cantidad,
  valorUnitario,
  moneda,
  userId,
}) {
  const { data, error } = await supabase
    .from('activos_broker')
    .insert({
      empresa_id: empresaId,
      broker_id: brokerId,
      nombre_activo: nombreActivo,
      tipo_activo: tipoActivo,
      cantidad,
      valor_unitario: valorUnitario,
      moneda,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    // El índice único de la 0003 es (broker_id, lower(nombre_activo)): el mismo
    // ticker no se repite. Postgres devuelve un 23505 que sin traducir no dice
    // nada al usuario.
    if (error.code === '23505') {
      throw new Error(`Ya existe una posición en ${nombreActivo} para este broker.`)
    }
    throw error
  }
  return data
}

export async function actualizarActivo(id, cambios) {
  const { data, error } = await supabase
    .from('activos_broker')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function borrarActivo(id) {
  const { error } = await supabase
    .from('activos_broker')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// ---------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------

/**
 * Historial de precios de un broker (pestaña «Precios»).
 *
 * Solo lectura: en esta fase los precios los escribe la función de la FASE 18.
 * A diferencia de las otras tres, la tabla `precios_activo` no está en la
 * publicación de realtime (0007), así que la pestaña no se autoactualiza.
 */
export async function listarPrecios(brokerId) {
  const { data, error } = await supabase
    .from('precios_activo_view')
    .select(
      'id, activo_id, nombre_activo, tipo_activo, fecha, precio_cierre, precio_anterior, variacion_pct, moneda'
    )
    .eq('broker_id', brokerId)
    .order('fecha', { ascending: false })

  if (error) throw error
  return data ?? []
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
