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
 * Obtiene las ramas activas de una empresa.
 * Las ramas están ordenadas por nombre.
 */
export async function obtenerRamas(empresaId) {
  const { data, error } = await supabase
    .from('ramas')
    .select(`
      id,
      nombre,
      estado,
      created_at,
      updated_at
    `)
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .is('deleted_at', null)
    .order('nombre')

  if (error) throw error
  return data || []
}

/**
 * Obtiene una rama específica por ID.
 */
export async function obtenerRama(empresaId, ramaId) {
  const { data, error } = await supabase
    .from('ramas')
    .select(`
      id,
      nombre,
      estado,
      created_at,
      updated_at
    `)
    .eq('empresa_id', empresaId)
    .eq('id', ramaId)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

/**
 * Suscribirse a cambios en las ramas de una empresa.
 * Se ejecuta cada vez que una rama cambia (via realtime).
 */
export function suscribirseARamas(empresaId, callback) {
  const subscription = supabase
    .channel(`ramas_${empresaId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ramas',
        filter: `empresa_id=eq.${empresaId}`,
      },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()

  return subscription
}

/**
 * Obtiene el resumen financiero de una empresa: subtotales por moneda
 * desde las vistas publicadas (movimientos_view, activos_broker, wallet_saldos).
 */
export async function obtenerResumenEmpresa(empresaId) {
  // 1. Saldo total de cuentas por moneda
  const { data: cuentas, error: errorCuentas } = await supabase
    .from('cuentas_view')
    .select('tipo_moneda, monto')
    .eq('empresa_id', empresaId)

  if (errorCuentas) throw errorCuentas

  // 2. Valor total de activos en brokers por moneda
  const { data: activos, error: errorActivos } = await supabase
    .from('activos_broker_view')
    .select('moneda, valor_total: valor_unitario')
    .eq('empresa_id', empresaId)

  if (errorActivos) throw errorActivos

  // 3. Saldos de wallets por moneda
  const { data: wallets, error: errorWallets } = await supabase
    .from('wallet_saldos_view')
    .select('moneda, monto')
    .eq('empresa_id', empresaId)

  if (errorWallets) throw errorWallets

  // Agregar por moneda
  const totales = {}

  cuentas?.forEach(({ tipo_moneda, monto }) => {
    const moneda = tipo_moneda || 'N/A'
    totales[moneda] = (totales[moneda] || 0) + parseFloat(monto || 0)
  })

  activos?.forEach(({ moneda, valor_total }) => {
    const m = moneda || 'N/A'
    totales[m] = (totales[m] || 0) + parseFloat(valor_total || 0)
  })

  wallets?.forEach(({ moneda, monto }) => {
    const m = moneda || 'N/A'
    totales[m] = (totales[m] || 0) + parseFloat(monto || 0)
  })

  // Convertir a array y ordenar por moneda
  return Object.entries(totales)
    .map(([moneda, monto]) => ({ moneda, monto }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}
