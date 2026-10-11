/**
 * Adaptador histórico de datos.
 *
 * Las pantallas activas ya usan los endpoints locales de `src/lib/api.js`.
 * Se conserva la forma de exportación para evitar romper imports antiguos, pero
 * se rechaza explícitamente cualquier uso nuevo: este módulo no debe reabrir una
 * conexión de Supabase ni saltarse la autorización derivada del JWT.
 */

export const FUENTES_DISPONIBLES = [
  'empresas', 'perfiles', 'usuarios_empresa', 'bancos', 'cuentas', 'movimientos',
  'brokers', 'movimientos_broker', 'activos_broker', 'precios_activo',
  'wallet_providers', 'wallets', 'wallet_saldos', 'movimientos_wallet',
  'import_jobs', 'cuentas_detalle', 'movimientos_detalle',
  'movimientos_broker_detalle', 'activos_broker_detalle', 'precios_activo_detalle',
  'wallets_detalle', 'movimientos_wallet_detalle',
]

function migrado(accion, nombre) {
  throw new Error(
    `[db.${accion}] ${nombre}: el adaptador genérico heredado fue retirado; ` +
    'usa el endpoint local correspondiente mediante src/lib/api.js.'
  )
}

export function listar(nombre) { return migrado('listar', nombre) }
export function obtener(nombre) { return migrado('obtener', nombre) }
export function crear(nombre) { return migrado('crear', nombre) }
export function crearMuchos(nombre) { return migrado('crearMuchos', nombre) }
export function actualizar(nombre) { return migrado('actualizar', nombre) }
export function borrar(nombre) { return migrado('borrar', nombre) }
export function contar(nombre) { return migrado('contar', nombre) }

export function suscribir(nombre) {
  console.warn(`[db.suscribir] ${nombre}: realtime se gestiona mediante invalidación de React Query.`)
  return () => {}
}
