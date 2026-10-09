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
 * Obtiene el resumen financiero de una empresa: subtotales por moneda
 * desde las vistas publicadas. Los nombres están resueltos en las vistas (D8).
 * 
 * Las tres fuentes son:
 *   - movimientos_view: saldos de cuentas bancarias por tipo_moneda
 *   - activos_broker_view: valor_total de activos por moneda
 *   - wallets_view: saldo_total de wallets por moneda
 */
export async function obtenerResumenEmpresa(empresaId) {
  // 1. Saldo total de cuentas bancarias por moneda
  const { data: cuentas, error: errorCuentas } = await supabase
    .from('movimientos_view')
    .select('tipo_moneda, monto: saldo_actual')
    .eq('empresa_id', empresaId)

  if (errorCuentas) throw errorCuentas

  // 2. Valor total de activos en brokers por moneda
  const { data: activos, error: errorActivos } = await supabase
    .from('activos_broker_view')
    .select('moneda, valor_total')
    .eq('empresa_id', empresaId)

  if (errorActivos) throw errorActivos

  // 3. Saldos totales de wallets por moneda
  const { data: wallets, error: errorWallets } = await supabase
    .from('wallets_view')
    .select('moneda, saldo_total')
    .eq('empresa_id', empresaId)

  if (errorWallets) throw errorWallets

  // Agregar por moneda (D4: sin conversión)
  const totales = {}

  cuentas?.forEach(({ tipo_moneda, monto }) => {
    const moneda = tipo_moneda || 'N/A'
    totales[moneda] = (totales[moneda] || 0) + parseFloat(monto || 0)
  })

  activos?.forEach(({ moneda, valor_total }) => {
    const m = moneda || 'N/A'
    totales[m] = (totales[m] || 0) + parseFloat(valor_total || 0)
  })

  wallets?.forEach(({ moneda, saldo_total }) => {
    const m = moneda || 'N/A'
    totales[m] = (totales[m] || 0) + parseFloat(saldo_total || 0)
  })

  // Convertir a array, ordenar alfabético por moneda y devolver
  return Object.entries(totales)
    .map(([moneda, monto]) => ({ moneda, monto }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}
