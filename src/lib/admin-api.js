import { api, apiJson } from './api'

/**
 * APIs del panel admin
 * Todas requieren autenticación super_admin
 */

/**
 * Obtener estadísticas del sistema
 */
export function getAdminStats() {
  return api('/api/admin/stats')
}

/**
 * Listar jobs de precios
 */
export function listAdminJobs(options = {}) {
  const params = new URLSearchParams()
  for (const key of ['estado', 'limit', 'offset']) {
    if (options[key] !== null && options[key] !== undefined && options[key] !== '') params.set(key, options[key])
  }
  return api(`/api/admin/jobs?${params}`)
}

/**
 * Listar logs administrativos
 */
export function listAdminLogs(options = {}) {
  const params = new URLSearchParams()
  for (const key of ['accion', 'entidad', 'estado', 'desde', 'hasta', 'formato', 'limit', 'offset']) {
    if (options[key] !== null && options[key] !== undefined && options[key] !== '') params.set(key, options[key])
  }
  return api(`/api/admin/logs?${params}`)
}

/**
 * Obtener configuración
 */
export async function getAdminConfig(clave = null) {
  return api(`/api/admin/config${clave ? `?clave=${encodeURIComponent(clave)}` : ''}`)
}

/**
 * Actualizar configuración
 */
export function updateAdminConfig(clave, valor, tipo = 'string') {
  return apiJson('/api/admin/config', 'POST', { clave, valor, tipo })
}

/**
 * Enviar un email .
 * Si se pasa `tipo` con una plantilla conocida, no hace falta asunto ni cuerpo.
 */
export function enviarEmail({ tipo, destinatario, asunto, cuerpo, variables }) {
  return apiJson('/api/admin/notificaciones', 'POST', { tipo, destinatario, asunto, cuerpo, variables })
}

/**
 * Historial de notificaciones enviadas .
 */
export function listNotificaciones({ estado = null, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (estado) params.set('estado', estado)
  return api(`/api/admin/notificaciones?${params}`)
}

/**
 * Plantillas de email disponibles .
 */
export async function listPlantillas() {
  const { plantillas } = await api('/api/admin/notificacion-plantillas')
  return plantillas || []
}

/**
 * Verificar si el usuario es super_admin.
 *
 * Se lee de `profiles.app_role`, que es la fuente de verdad del proyecto
 * (decisión D6), no de una tabla de roles aparte.
 */
export async function esAdmin(user) {
  return user?.app_role === 'super_admin' && user?.estado === 'activo'
}

/**
 * Roles del usuario según el modelo real del proyecto (D6):
 * `profiles.app_role` para el rol global y `user_empresa.rol` para el rol
 * dentro de cada empresa.
 */
export async function getUserRoles(userId) {
  try {
    const { usuarios } = await api('/api/admin/usuarios')
    const usuario = (usuarios || []).find((item) => item.id === userId)
    if (!usuario) return []
    return [
      ...(usuario.app_role ? [{ rol: usuario.app_role, empresa_id: null }] : []),
      ...(usuario.empresas || []).map((empresa) => ({ rol: empresa.rol, empresa_id: empresa.empresa_id })),
    ]
  } catch (error) {
    console.error('getUserRoles error:', error)
    return []
  }
}
