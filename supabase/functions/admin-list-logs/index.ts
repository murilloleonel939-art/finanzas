import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

// Verificar si el usuario es super_admin o auditor
async function verificarAcceso(authHeader) {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    throw new Error('No autenticado')
  }

  const { data: adminRole, error: roleError } = await supabase
    .from('admin_roles')
    .select('rol')
    .eq('user_id', user.id)
    .in('rol', ['super_admin', 'auditor'])
    .single()

  if (roleError || !adminRole) {
    throw new Error('Acceso denegado: requiere super_admin o auditor')
  }

  return user
}

// Listar logs administrativos
async function listLogs(accion = null, entidad = null, estado = null, desde = null, hasta = null, limit = 100, offset = 0) {
  try {
    let query = supabase
      .from('admin_logs')
      .select('id, admin_id, accion, entidad, entidad_id, detalles, ip_address, estado, mensaje_error, duracion_ms, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (accion) {
      query = query.eq('accion', accion)
    }
    if (entidad) {
      query = query.eq('entidad', entidad)
    }
    if (estado) {
      query = query.eq('estado', estado)
    }
    if (desde) {
      query = query.gte('created_at', desde)
    }
    if (hasta) {
      query = query.lte('created_at', hasta)
    }

    const { data: logs, error, count } = await query

    if (error) {
      throw error
    }

    // Enriquecer logs con nombre de usuario
    const logsEnriquecidos = await Promise.all(
      (logs || []).map(async (log) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', log.admin_id)
          .single()

        return {
          ...log,
          admin_nombre: profile?.full_name || 'Desconocido',
          admin_email: profile?.email || ''
        }
      })
    )

    // Calcular estadísticas
    const estadisticas = {
      total: count || 0,
      exitosos: logs?.filter(l => l.estado === 'success').length || 0,
      errores: logs?.filter(l => l.estado === 'error').length || 0,
      por_accion: {},
      por_entidad: {}
    }

    // Agrupar por acción y entidad
    for (const log of logs || []) {
      estadisticas.por_accion[log.accion] = (estadisticas.por_accion[log.accion] || 0) + 1
      estadisticas.por_entidad[log.entidad] = (estadisticas.por_entidad[log.entidad] || 0) + 1
    }

    return {
      logs: logsEnriquecidos,
      estadisticas,
      paginacion: {
        limit,
        offset,
        total: count
      }
    }
  } catch (error) {
    console.error('Error listando logs:', error)
    throw error
  }
}

// Exportar logs a JSON
async function exportarLogs(filtros) {
  const { data: logs, error } = await supabase
    .from('admin_logs')
    .select('*')
    .eq('accion', filtros.accion)
    .gte('created_at', filtros.desde)
    .lte('created_at', filtros.hasta)
    .order('created_at', { ascending: true })

  if (error) throw error

  return {
    exportado_en: new Date().toISOString(),
    total_registros: logs?.length || 0,
    filtros,
    datos: logs
  }
}

// Handler principal
Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    // Verificar autenticación
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header requerido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const user = await verificarAcceso(authHeader)

    // Parsear query params
    const url = new URL(req.url)
    const accion = url.searchParams.get('accion')
    const entidad = url.searchParams.get('entidad')
    const estado = url.searchParams.get('estado')
    const desde = url.searchParams.get('desde')
    const hasta = url.searchParams.get('hasta')
    const formato = url.searchParams.get('formato') // 'json' (default) o 'export'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Registrar acceso
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      accion: 'ver',
      entidad: 'admin_logs',
      detalles: { accion, entidad, estado, desde, hasta },
      estado: 'success'
    })

    let resultado

    if (formato === 'export') {
      resultado = await exportarLogs({
        accion,
        desde: desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        hasta: hasta || new Date().toISOString()
      })
    } else {
      resultado = await listLogs(accion, entidad, estado, desde, hasta, limit, offset)
    }

    return new Response(JSON.stringify(resultado), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error:', error.message)
    
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: error.message.includes('Acceso denegado') ? 403 : 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
