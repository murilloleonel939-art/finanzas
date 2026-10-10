/**
 * FASE 18: Capa de datos para precios
 * Operaciones en precios_activo y actualizaciones de activos_broker
 */

import { supabase } from './supabase.js'

// ============================================================================
// LECTURA DE PRECIOS
// ============================================================================

/**
 * Obtener el precio más reciente de un activo
 * @param {string} activoId - UUID del activo
 * @returns {Promise<Object|null>} Último precio registrado
 */
export async function obtenerPrecioActual(activoId) {
  const { data, error } = await supabase
    .from('precios_activo')
    .select('*')
    .eq('activo_id', activoId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Error obteniendo precio actual: ${error.message}`)
  return data ?? null
}

/**
 * Obtener historial de precios de un activo
 * @param {string} activoId - UUID del activo
 * @param {Object} [options]
 * @param {number} [options.limit] - Últimos N precios (default 30)
 * @returns {Promise<Array>}
 */
export async function obtenerHistorialPrecios(activoId, options = {}) {
  const { limit = 30 } = options

  const { data, error } = await supabase
    .from('precios_activo')
    .select('*')
    .eq('activo_id', activoId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Error obteniendo historial: ${error.message}`)
  return data ?? []
}

/**
 * Obtener precios de todos los activos de una empresa en una fecha
 * @param {string} empresaId - UUID
 * @param {string} [fecha] - ISO date (default: hoy)
 * @returns {Promise<Array>}
 */
export async function obtenerPreciosEmpresa(empresaId, fecha = null) {
  const fechaFiltro = fecha ?? new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('precios_activo')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('fecha', fechaFiltro)
    .is('deleted_at', null)
    .order('broker_id, activo_id')

  if (error) throw new Error(`Error obteniendo precios empresa: ${error.message}`)
  return data ?? []
}

// ============================================================================
// ESCRITURA DE PRECIOS
// ============================================================================

/**
 * Registrar un nuevo precio de cierre para un activo
 * Si ya existe un precio para ese activo en esa fecha, lo actualiza (upsert)
 *
 * @param {Object} params
 * @param {string} params.empresa_id - UUID
 * @param {string} params.broker_id - UUID
 * @param {string} params.activo_id - UUID
 * @param {string} params.fecha - ISO date
 * @param {number} params.precio_cierre - Precio de cierre
 * @param {number} [params.precio_anterior] - Precio del cierre anterior
 * @param {number} [params.variacion_pct] - Porcentaje de variación
 * @param {string} [params.moneda] - Moneda (default USD)
 * @param {string} [params.userId] - UUID de quién registra (sistema = null)
 * @returns {Promise<Object>} El registro creado/actualizado
 */
export async function registrarPrecio({
  empresa_id,
  broker_id,
  activo_id,
  fecha,
  precio_cierre,
  precio_anterior = null,
  variacion_pct = null,
  moneda = 'USD',
  userId = null,
}) {
  // Buscar si ya existe un precio para este activo en esta fecha
  const { data: existente } = await supabase
    .from('precios_activo')
    .select('id')
    .eq('activo_id', activo_id)
    .eq('fecha', fecha)
    .is('deleted_at', null)
    .maybeSingle()

  if (existente) {
    // UPDATE
    const { data, error } = await supabase
      .from('precios_activo')
      .update({
        precio_cierre,
        precio_anterior,
        variacion_pct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
      .select('*')
      .single()

    if (error) throw new Error(`Error actualizando precio: ${error.message}`)
    return data
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('precios_activo')
      .insert({
        empresa_id,
        broker_id,
        activo_id,
        fecha,
        precio_cierre,
        precio_anterior,
        variacion_pct,
        moneda,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) throw new Error(`Error insertando precio: ${error.message}`)
    return data
  }
}

/**
 * Actualizar el precio unitario de un activo (valor_unitario en activos_broker)
 * Se usa después de registrar un nuevo precio
 *
 * @param {string} activoId - UUID del activo
 * @param {number} valorUnitario - Nuevo valor unitario
 * @returns {Promise<void>}
 */
export async function actualizarValorUnitarioActivo(activoId, valorUnitario) {
  const { error } = await supabase
    .from('activos_broker')
    .update({
      valor_unitario: valorUnitario,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activoId)

  if (error) throw new Error(`Error actualizando valor_unitario: ${error.message}`)
}

// ============================================================================
// BATCH: MÚLTIPLES PRECIOS
// ============================================================================

/**
 * Registrar múltiples precios de una sola vez (transacción)
 * Útil cuando el worker actualiza todos los activos
 *
 * @param {Array<Object>} precios - Array de parámetros para registrarPrecio
 * @returns {Promise<Array>} Los registros creados/actualizados
 */
export async function registrarPreciosBatch(precios) {
  if (!precios || precios.length === 0) return []

  // Construir inserts y updates
  const inserts = []
  const updates = []

  for (const precio of precios) {
    // Buscar si existe
    const { data: existente } = await supabase
      .from('precios_activo')
      .select('id')
      .eq('activo_id', precio.activo_id)
      .eq('fecha', precio.fecha)
      .is('deleted_at', null)
      .maybeSingle()

    if (existente) {
      updates.push({
        id: existente.id,
        ...precio,
      })
    } else {
      inserts.push(precio)
    }
  }

  const results = []

  // Insertar nuevos
  if (inserts.length > 0) {
    const { data: insertados, error: errorInsert } = await supabase
      .from('precios_activo')
      .insert(inserts)
      .select('*')

    if (errorInsert) throw new Error(`Error batch insert: ${errorInsert.message}`)
    results.push(...(insertados ?? []))
  }

  // Actualizar existentes
  for (const upd of updates) {
    const { id, ...campos } = upd
    const { data: actualizado, error: errorUpd } = await supabase
      .from('precios_activo')
      .update(campos)
      .eq('id', id)
      .select('*')
      .single()

    if (errorUpd) throw new Error(`Error batch update: ${errorUpd.message}`)
    results.push(actualizado)
  }

  return results
}

// ============================================================================
// INFORMACIÓN PARA ACTUALIZACIÓN
// ============================================================================

/**
 * Obtener todos los activos que necesitan actualización de precios
 * Filtra: no borrados, con ticker (nombre_activo), de una empresa
 *
 * @param {string} empresaId - UUID
 * @returns {Promise<Array>} Activos con su broker
 */
export async function obtenerActivosParaActualizar(empresaId) {
  const { data, error } = await supabase
    .from('activos_broker')
    .select('id, empresa_id, broker_id, nombre_activo, moneda')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('nombre_activo')

  if (error) throw new Error(`Error obteniendo activos: ${error.message}`)
  return data ?? []
}

/**
 * Obtener todos los activos de todas las empresas (para worker global)
 * @returns {Promise<Array>}
 */
export async function obtenerTodosActivosParaActualizar() {
  const { data, error } = await supabase
    .from('activos_broker')
    .select('id, empresa_id, broker_id, nombre_activo, moneda')
    .is('deleted_at', null)
    .order('empresa_id, nombre_activo')

  if (error) throw new Error(`Error obteniendo todos activos: ${error.message}`)
  return data ?? []
}

/**
 * Obtener tickers únicos de una empresa (para batch API)
 * @param {string} empresaId - UUID
 * @returns {Promise<string[]>}
 */
export async function obtenerTickersUnicos(empresaId) {
  const activos = await obtenerActivosParaActualizar(empresaId)
  const tickers = [...new Set(activos.map((a) => a.nombre_activo))]
  return tickers
}
