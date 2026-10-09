import { supabase } from './supabase'

/**
 * Obtiene las empresas asignadas al usuario actual (no borradas).
 * Corre en el contexto de autenticación del usuario, así que el RLS filtra automáticamente.
 */
export async function obtenerEmpresasUsuario() {
  const { data, error } = await supabase
    .from('empresas')
    .select(`
      id,
      nombre,
      estado,
      pais,
      created_at
    `)
    .is('deleted_at', null)
    .order('nombre')

  if (error) throw error
  return data || []
}

/**
 * Suscribirse a cambios en las empresas del usuario.
 * Se ejecuta cada vez que una empresa cambia (via realtime).
 */
export function suscribirseAEmpresasUsuario(callback) {
  const subscription = supabase
    .channel('empresas_usuario')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'empresas',
        filter: 'deleted_at=is.null',
      },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()

  return subscription
}

/**
 * Obtiene una empresa específica por ID (con verificación de acceso vía RLS).
 */
export async function obtenerEmpresa(empresaId) {
  const { data, error } = await supabase
    .from('empresas')
    .select(`
      id,
      nombre,
      estado,
      pais,
      created_at,
      updated_at
    `)
    .eq('id', empresaId)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

/**
 * Obtiene las tres ramas reales de una empresa (bancos, brokers, wallets).
 * 
 * En vez de una tabla `ramas`, el PRD §11.3 define tres módulos fijos:
 *   - Bancos (tabla `bancos`, rutas POST /bancos, GET /empresa/{id}/bancos)
 *   - Brokers (tabla `brokers`, rutas POST /brokers, GET /empresa/{id}/brokers)
 *   - Proveedores de wallet (tabla `wallet_providers`, rutas POST, GET)
 * 
 * Esto devuelve un arreglo de tres objetos con `id`, `nombre`, `ícono` para que
 * el sidebar los pinte sin cambios. No hace queries: es una abstracción de nivel
 * de aplicación.
 */
export function obtenerRamas(empresaId) {
  // No es async: no necesita RED a la base.
  return [
    { 
      id: 'bancos', 
      nombre: 'Bancos', 
      icono: 'bank',
      ruta: `/empresa/${empresaId}/bancos`
    },
    { 
      id: 'brokers', 
      nombre: 'Brokers', 
      icono: 'trending-up',
      ruta: `/empresa/${empresaId}/brokers`
    },
    { 
      id: 'wallet-providers', 
      nombre: 'Proveedores de Wallet', 
      icono: 'wallet',
      ruta: `/empresa/${empresaId}/wallets`
    },
  ]
}

/**
 * Suscribirse a cambios en las tablas de datos de una empresa.
 * Escucha la publicación realtime en `bancos`, `brokers` y `wallet_providers`.
 */
export function suscribirseAModulos(empresaId, callback) {
  // Usar un canal compartido que escuche los tres tipos de cambios
  const subscription = supabase
    .channel(`modulos_${empresaId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bancos',
        filter: `empresa_id=eq.${empresaId}`,
      },
      (payload) => callback(payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'brokers',
        filter: `empresa_id=eq.${empresaId}`,
      },
      (payload) => callback(payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'wallet_providers',
        filter: `empresa_id=eq.${empresaId}`,
      },
      (payload) => callback(payload)
    )
    .subscribe()

  return subscription
}

/**
 * Obtiene el resumen financiero de una empresa: subtotales por moneda (D4).
 *
 * Las tres fuentes, con las columnas REALES de las vistas de la 0005:
 *   - cuentas_view       → `monto` (saldo de cada cuenta) + `tipo_moneda`
 *   - activos_broker_view → `valor_total` ya calculado (cantidad × valor_unitario)
 *   - wallets_view       → `saldo_total` y `tipo_moneda`
 *
 * Ojo: NO existe `wallet_saldos_view` (la primera versión la consultaba) ni
 * `cuentas_view.saldo_actual` (la columna es `monto`). Las dos cosas fallaban
 * en runtime con `column does not exist`.
 */
export async function obtenerResumenEmpresa(empresaId) {
  const [cuentas, activos, wallets] = await Promise.all([
    supabase
      .from('cuentas_view')
      .select('tipo_moneda, monto')
      .eq('empresa_id', empresaId),
    supabase
      .from('activos_broker_view')
      .select('moneda, valor_total')
      .eq('empresa_id', empresaId),
    supabase
      .from('wallets_view')
      .select('tipo_moneda, saldo_total')
      .eq('empresa_id', empresaId),
  ])

  const error = cuentas.error || activos.error || wallets.error
  if (error) throw error

  // Agregación por moneda. Sin conversión: cada moneda es su propia línea (D4).
  const totales = {}

  const acumular = (moneda, monto) => {
    const m = (moneda || 'N/A').toUpperCase()
    totales[m] = (totales[m] ?? 0) + Number(monto ?? 0)
  }

  for (const c of cuentas.data ?? []) acumular(c.tipo_moneda, c.monto)
  for (const a of activos.data ?? []) acumular(a.moneda, a.valor_total)
  for (const w of wallets.data ?? []) acumular(w.tipo_moneda, w.saldo_total)

  return Object.entries(totales)
    .map(([moneda, monto]) => ({ moneda, monto: Number(monto.toFixed(8)) }))
    .filter((t) => t.monto !== 0)
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}
