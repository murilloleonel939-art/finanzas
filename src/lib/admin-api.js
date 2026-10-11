import { supabase } from './supabase'
import { api } from './api'

/**
 * APIs del panel admin
 * Todas requieren autenticación super_admin
 */

// Base URL para Edge Functions
const ADMIN_API_BASE = '/functions/v1'

/**
 * Obtener estadísticas del sistema
 */
export function getAdminStats() {
  return api('/api/admin/stats')
}

/**
 * Listar jobs de precios
 */
export async function listAdminJobs(options = {}) {
  try {
    const { 
      estado = null, 
      limit = 50, 
      offset = 0 
    } = options

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const params = new URLSearchParams()
    if (estado) params.append('estado', estado)
    params.append('limit', limit)
    params.append('offset', offset)

    const response = await fetch(
      `${ADMIN_API_BASE}/admin-list-jobs?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error listando jobs')
    }

    return await response.json()
  } catch (error) {
    console.error('listAdminJobs error:', error)
    throw error
  }
}

/**
 * Listar logs administrativos
 */
export async function listAdminLogs(options = {}) {
  try {
    const { 
      accion = null,
      entidad = null,
      estado = null,
      desde = null,
      hasta = null,
      formato = 'json',
      limit = 100, 
      offset = 0 
    } = options

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const params = new URLSearchParams()
    if (accion) params.append('accion', accion)
    if (entidad) params.append('entidad', entidad)
    if (estado) params.append('estado', estado)
    if (desde) params.append('desde', desde)
    if (hasta) params.append('hasta', hasta)
    params.append('formato', formato)
    params.append('limit', limit)
    params.append('offset', offset)

    const response = await fetch(
      `${ADMIN_API_BASE}/admin-list-logs?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error listando logs')
    }

    return await response.json()
  } catch (error) {
    console.error('listAdminLogs error:', error)
    throw error
  }
}

/**
 * Obtener configuración
 */
export async function getAdminConfig(clave = null) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const params = new URLSearchParams()
    if (clave) params.append('clave', clave)

    const response = await fetch(
      `${ADMIN_API_BASE}/admin-update-config?${params}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error obteniendo configuración')
    }

    return await response.json()
  } catch (error) {
    console.error('getAdminConfig error:', error)
    throw error
  }
}

/**
 * Actualizar configuración
 */
export async function updateAdminConfig(clave, valor, tipo = 'string') {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const response = await fetch(
      `${ADMIN_API_BASE}/admin-update-config`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clave, valor, tipo })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error actualizando configuración')
    }

    return await response.json()
  } catch (error) {
    console.error('updateAdminConfig error:', error)
    throw error
  }
}

/**
 * Enviar un email .
 * Si se pasa `tipo` con una plantilla conocida, no hace falta asunto ni cuerpo.
 */
export async function enviarEmail({ tipo, destinatario, asunto, cuerpo, variables }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const response = await fetch(`${ADMIN_API_BASE}/enviar-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tipo, destinatario, asunto, cuerpo, variables })
    })

    const datos = await response.json()
    if (!response.ok) {
      throw new Error(datos.error || 'Error enviando email')
    }

    return datos
  } catch (error) {
    console.error('enviarEmail error:', error)
    throw error
  }
}

/**
 * Historial de notificaciones enviadas .
 */
export async function listNotificaciones({ estado = null, limit = 50, offset = 0 } = {}) {
  try {
    let query = supabase
      .from('notificaciones')
      .select('id, tipo, destinatario, asunto, estado, error_mensaje, intentos, enviado_en, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (estado) query = query.eq('estado', estado)

    const { data, error, count } = await query
    if (error) throw error

    return { notificaciones: data || [], total: count || 0 }
  } catch (error) {
    console.error('listNotificaciones error:', error)
    throw error
  }
}

/**
 * Plantillas de email disponibles .
 */
export async function listPlantillas() {
  try {
    const { data, error } = await supabase
      .from('notif_plantillas')
      .select('id, clave, asunto, cuerpo, descripcion')
      .order('clave')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('listPlantillas error:', error)
    throw error
  }
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
