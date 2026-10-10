import { supabase } from './supabase'

/**
 * APIs del panel admin
 * Todas requieren autenticación super_admin
 */

// Base URL para Edge Functions
const ADMIN_API_BASE = '/functions/v1'

/**
 * Obtener estadísticas del sistema
 */
export async function getAdminStats() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autenticado')

    const response = await fetch(`${ADMIN_API_BASE}/admin-get-stats`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error obteniendo estadísticas')
    }

    return await response.json()
  } catch (error) {
    console.error('getAdminStats error:', error)
    throw error
  }
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
 * Verificar si el usuario es super_admin
 */
export async function esAdmin(user) {
  try {
    if (!user) return false

    const { data: adminRole } = await supabase
      .from('admin_roles')
      .select('rol')
      .eq('user_id', user.id)
      .eq('rol', 'super_admin')
      .maybeSingle()

    return !!adminRole
  } catch (error) {
    console.error('esAdmin error:', error)
    return false
  }
}

/**
 * Obtener roles del usuario
 */
export async function getUserRoles(userId) {
  try {
    const { data: roles, error } = await supabase
      .from('admin_roles')
      .select('rol, empresa_id')
      .eq('user_id', userId)

    if (error) throw error

    return roles || []
  } catch (error) {
    console.error('getUserRoles error:', error)
    return []
  }
}
