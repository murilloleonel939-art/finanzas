/**
 * FASE 18: Capa de datos para precios.
 *
 * **Por qué es una fábrica y no un módulo con el cliente incrustado:**
 * el worker de precios corre en Node (`worker-precios.mjs`), donde
 * `src/lib/supabase.js` **no se puede importar** — usa `import.meta.env`, que
 * solo existe cuando Vite compila. Si este módulo importara el cliente del
 * navegador, importarlo desde Node reventaría en la primera línea con
 * `Cannot read properties of undefined (reading 'VITE_SUPABASE_URL')`.
 *
 * Con la fábrica, el navegador pasa el cliente normal y el worker pasa uno
 * creado con `createClient(url, service_role)`. El mismo código sirve en los
 * dos sitios.
 *
 * Uso en el navegador:
 *   import { supabase } from '@/lib/supabase'
 *   import { crearPreciosDatos } from '@/lib/precios-datos'
 *   const precios = crearPreciosDatos(supabase)
 *
 * Uso en el worker:
 *   const supabase = createClient(url, serviceKey)
 *   const precios = crearPreciosDatos(supabase)
 */

/**
 * Construye la capa de datos de precios sobre un cliente de Supabase.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function crearPreciosDatos(supabase) {
  // ========================================================================
  // LECTURA
  // ========================================================================

  /**
   * Precio más reciente de un activo.
   * @param {string} activoId
   * @returns {Promise<Object|null>}
   */
  async function obtenerPrecioActual(activoId) {
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
   * Historial de precios de un activo, del más reciente al más antiguo.
   * @param {string} activoId
   * @param {{limit?: number}} [options]
   */
  async function obtenerHistorialPrecios(activoId, options = {}) {
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
   * Precios de todos los activos de una empresa en una fecha.
   * @param {string} empresaId
   * @param {string} [fecha] ISO date 'YYYY-MM-DD' (por defecto: hoy local)
   */
  async function obtenerPreciosEmpresa(empresaId, fecha = null) {
    const fechaFiltro = fecha ?? hoyLocal()

    const { data, error } = await supabase
      .from('precios_activo')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('fecha', fechaFiltro)
      .is('deleted_at', null)
      .order('fecha', { ascending: false })

    if (error) throw new Error(`Error obteniendo precios de la empresa: ${error.message}`)
    return data ?? []
  }

  // ========================================================================
  // ESCRITURA
  // ========================================================================

  /**
   * Registra (o actualiza) el precio de cierre de un activo en una fecha.
   *
   * El índice único `precios_activo_unico` es por (activo_id, fecha), así que
   * volver a correr el worker el mismo día debe actualizar, no duplicar.
   *
   * @param {Object} params
   * @param {string} params.empresa_id
   * @param {string} params.broker_id
   * @param {string} params.activo_id
   * @param {string} params.fecha ISO date
   * @param {number} params.precio_cierre
   * @param {number|null} [params.precio_anterior]
   * @param {number|null} [params.variacion_pct]
   * @param {string} [params.moneda]
   * @param {string|null} [params.userId] null = lo escribió el sistema
   * @returns {Promise<Object>} el registro resultante
   */
  async function registrarPrecio({
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
    const { data: existente, error: errBusqueda } = await supabase
      .from('precios_activo')
      .select('id')
      .eq('activo_id', activo_id)
      .eq('fecha', fecha)
      .is('deleted_at', null)
      .maybeSingle()

    if (errBusqueda) {
      throw new Error(`Error buscando precio existente: ${errBusqueda.message}`)
    }

    if (existente) {
      const { data, error } = await supabase
        .from('precios_activo')
        .update({
          precio_cierre,
          precio_anterior,
          variacion_pct,
        })
        .eq('id', existente.id)
        .select('*')
        .single()

      if (error) throw new Error(`Error actualizando precio: ${error.message}`)
      return data
    }

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

  /**
   * Copia el precio de cierre al `valor_unitario` del activo.
   *
   * Es lo que hace que la posición muestre el valor de mercado: `activos_broker`
   * guarda la cantidad y el último precio conocido, no el precio en vivo.
   *
   * `updated_at` lo pone el trigger `trg_activos_broker_updated_at` de la
   * migración 0003; mandarlo desde aquí sería redundante.
   *
   * @param {string} activoId
   * @param {number} valorUnitario
   */
  async function actualizarValorUnitarioActivo(activoId, valorUnitario) {
    const { error } = await supabase
      .from('activos_broker')
      .update({ valor_unitario: valorUnitario })
      .eq('id', activoId)

    if (error) throw new Error(`Error actualizando valor_unitario: ${error.message}`)
  }

  // ========================================================================
  // ACTIVOS A ACTUALIZAR
  // ========================================================================

  /**
   * Activos de una empresa que necesitan precio.
   * @param {string} empresaId
   */
  async function obtenerActivosParaActualizar(empresaId) {
    const { data, error } = await supabase
      .from('activos_broker')
      .select('id, empresa_id, broker_id, nombre_activo, tipo_activo, moneda')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .order('nombre_activo')

    if (error) throw new Error(`Error obteniendo activos: ${error.message}`)
    return data ?? []
  }

  /**
   * Todos los activos de todas las empresas. Es lo que usa el worker, que no
   * trabaja por empresa sino por ticker (más barato: un ticker se pide una vez
   * aunque esté en cinco brokers).
   */
  async function obtenerTodosActivosParaActualizar() {
    const { data, error } = await supabase
      .from('activos_broker')
      .select('id, empresa_id, broker_id, nombre_activo, tipo_activo, moneda')
      .is('deleted_at', null)
      .order('nombre_activo')

    if (error) throw new Error(`Error obteniendo activos: ${error.message}`)
    return data ?? []
  }

  /**
   * Activos únicos de una empresa, listos para pedir en un lote.
   *
   * Devuelve `{nombre_activo, tipo_activo}` y no solo los tickers: el tipo es
   * necesario para desambiguar (D29) — `LINK` es Chainlink como cripto e
   * Interlink Electronics como acción.
   *
   * @param {string} empresaId
   */
  async function obtenerTickersUnicos(empresaId) {
    const activos = await obtenerActivosParaActualizar(empresaId)

    const vistos = new Set()
    const unicos = []
    for (const a of activos) {
      const clave = `${a.tipo_activo}:${a.nombre_activo.toUpperCase()}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      unicos.push({ nombre_activo: a.nombre_activo, tipo_activo: a.tipo_activo })
    }
    return unicos
  }

  return {
    obtenerPrecioActual,
    obtenerHistorialPrecios,
    obtenerPreciosEmpresa,
    registrarPrecio,
    actualizarValorUnitarioActivo,
    obtenerActivosParaActualizar,
    obtenerTodosActivosParaActualizar,
    obtenerTickersUnicos,
  }
}

/**
 * Fecha de hoy en la zona local, como 'YYYY-MM-DD'.
 *
 * Se replica aquí (en vez de importar `src/lib/utils.js`) para que este módulo
 * no arrastre dependencias del navegador: `utils.js` importa `clsx` y
 * `tailwind-merge`, que el worker no necesita. Es la misma lógica de D26 —
 * `toISOString()` daría la fecha UTC, que en Colombia ya es mañana a partir de
 * las 19:00.
 */
export function hoyLocal(ahora = new Date()) {
  const dosDigitos = (n) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`
}
