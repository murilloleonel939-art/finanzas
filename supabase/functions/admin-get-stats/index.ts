import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

// Verificar si el usuario es super_admin
async function verificarSuperAdmin(authHeader) {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    throw new Error('No autenticado')
  }

  // Verificar rol en admin_roles
  const { data: adminRole, error: roleError } = await supabase
    .from('admin_roles')
    .select('rol')
    .eq('user_id', user.id)
    .eq('rol', 'super_admin')
    .single()

  if (roleError || !adminRole) {
    throw new Error('Acceso denegado: requiere super_admin')
  }

  return user
}

// Obtener estadísticas del sistema
async function getStats() {
  try {
    // Total de empresas
    const { count: totalEmpresas } = await supabase
      .from('empresas')
      .select('*', { count: 'exact', head: true })

    // Total de cuentas
    const { count: totalCuentas } = await supabase
      .from('cuentas')
      .select('*', { count: 'exact', head: true })

    // Total de movimientos
    const { count: totalMovimientos } = await supabase
      .from('movimientos')
      .select('*', { count: 'exact', head: true })

    // Total de activos únicos
    const { data: activos } = await supabase
      .from('activos')
      .select('id', { count: 'exact' })

    // Usuarios activos en último mes
    const { count: usuariosActivos } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    // Jobs ejecutados hoy
    const { count: jobsHoy } = await supabase
      .from('precio_jobs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    // Estado de último job
    const { data: ultimoJob } = await supabase
      .from('precio_jobs')
      .select('id, estado, completado_en, errores_count')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Salud del sistema
    const salud = {
      estado: ultimoJob?.estado === 'completado' ? 'ok' : 'warning',
      ultimoJobHace: ultimoJob ? Math.round((Date.now() - new Date(ultimoJob.completado_en).getTime()) / 60000) + ' minutos' : 'Nunca',
      erroresUltimo: ultimoJob?.errores_count || 0
    }

    return {
      timestamp: new Date().toISOString(),
      stats: {
        empresas: totalEmpresas || 0,
        cuentas: totalCuentas || 0,
        movimientos: totalMovimientos || 0,
        activos: activos?.length || 0,
        usuariosActivos: usuariosActivos || 0,
        jobsHoy: jobsHoy || 0
      },
      salud
    }
  } catch (error) {
    console.error('Error obteniendo stats:', error)
    throw error
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

    const user = await verificarSuperAdmin(authHeader)

    // Registrar acceso en logs
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      accion: 'ver',
      entidad: 'system_stats',
      estado: 'success'
    })

    // Obtener estadísticas
    const stats = await getStats()

    return new Response(JSON.stringify(stats), {
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
