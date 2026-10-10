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

// Listar jobs de precios
async function listJobs(estado = null, limit = 50, offset = 0) {
  try {
    let query = supabase
      .from('precio_jobs')
      .select('id, estado, empresa_id, simbolo, creado_en, completado_en, errores_count, detalles, procesado_en')
      .order('creado_en', { ascending: false })
      .range(offset, offset + limit - 1)

    if (estado) {
      query = query.eq('estado', estado)
    }

    const { data: jobs, error, count } = await query

    if (error) {
      throw error
    }

    // Enriquecer datos con información de empresa
    const jobsEnriquecidos = await Promise.all(
      (jobs || []).map(async (job) => {
        const { data: empresa } = await supabase
          .from('empresas')
          .select('nombre')
          .eq('id', job.empresa_id)
          .single()

        return {
          ...job,
          empresa_nombre: empresa?.nombre || 'Desconocida',
          duracion_segundos: job.completado_en 
            ? Math.round((new Date(job.completado_en) - new Date(job.creado_en)) / 1000)
            : null
        }
      })
    )

    // Calcular estadísticas de cobertura
    const estadisticas = {
      total: count || 0,
      por_estado: {},
      exito_rate: 0,
      error_rate: 0,
      tiempo_promedio_seg: 0,
      ultima_ejecucion: jobs?.[0]?.creado_en || null
    }

    // Contar por estado
    for (const job of jobs || []) {
      estadisticas.por_estado[job.estado] = (estadisticas.por_estado[job.estado] || 0) + 1
    }

    // Calcular tasas
    const completados = jobs?.filter(j => j.estado === 'completado') || []
    const conError = jobs?.filter(j => j.errores_count > 0) || []
    
    if (completados.length > 0) {
      estadisticas.exito_rate = Math.round((completados.length / (jobs?.length || 1)) * 100)
      estadisticas.error_rate = Math.round((conError.length / (jobs?.length || 1)) * 100)
      
      const tiemposSegundos = completados
        .map(j => j.duracion_segundos || 0)
        .filter(t => t > 0)
      
      if (tiemposSegundos.length > 0) {
        estadisticas.tiempo_promedio_seg = Math.round(
          tiemposSegundos.reduce((a, b) => a + b, 0) / tiemposSegundos.length
        )
      }
    }

    return {
      jobs: jobsEnriquecidos,
      estadisticas,
      paginacion: {
        limit,
        offset,
        total: count
      }
    }
  } catch (error) {
    console.error('Error listando jobs:', error)
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

    // Parsear query params
    const url = new URL(req.url)
    const estado = url.searchParams.get('estado')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Registrar acceso
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      accion: 'ver',
      entidad: 'precio_jobs',
      detalles: { estado, limit, offset },
      estado: 'success'
    })

    // Listar jobs
    const result = await listJobs(estado, limit, offset)

    return new Response(JSON.stringify(result), {
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
