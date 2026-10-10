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

// Validar tipos de datos
function validarTipo(valor, tipo) {
  switch (tipo) {
    case 'string':
      return typeof valor === 'string'
    case 'integer':
      return Number.isInteger(Number(valor))
    case 'boolean':
      return valor === 'true' || valor === 'false' || typeof valor === 'boolean'
    case 'json':
      try {
        JSON.parse(typeof valor === 'string' ? valor : JSON.stringify(valor))
        return true
      } catch {
        return false
      }
    default:
      return true
  }
}

// Obtener configuración
async function getConfig(clave = null) {
  try {
    let query = supabase
      .from('admin_config')
      .select('id, clave, valor, tipo, descripcion, grupo, editable, updated_at')

    if (clave) {
      query = query.eq('clave', clave).single()
    } else {
      query = query.order('grupo').order('clave')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return data
  } catch (error) {
    console.error('Error obteniendo config:', error)
    throw error
  }
}

// Actualizar configuración
async function updateConfig(clave, valor, tipo, user) {
  try {
    // Obtener configuración actual
    const { data: configActual, error: getError } = await supabase
      .from('admin_config')
      .select('*')
      .eq('clave', clave)
      .single()

    if (getError && getError.code !== 'PGRST116') { // PGRST116 = no rows
      throw getError
    }

    // Si no existe, crear
    if (!configActual) {
      const { data: newConfig, error: insertError } = await supabase
        .from('admin_config')
        .insert({
          clave,
          valor: String(valor),
          tipo,
          actualizado_por: user.id
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Registrar en logs
      await supabase.from('admin_logs').insert({
        admin_id: user.id,
        accion: 'crear',
        entidad: 'admin_config',
        entidad_id: newConfig.id,
        detalles: { clave, valor_anterior: null, valor_nuevo: valor },
        estado: 'success'
      })

      return newConfig
    }

    // Si no es editable, error
    if (!configActual.editable) {
      throw new Error(`Configuración "${clave}" no es editable`)
    }

    // Actualizar
    const { data: updated, error: updateError } = await supabase
      .from('admin_config')
      .update({
        valor: String(valor),
        tipo: tipo || configActual.tipo,
        actualizado_por: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('clave', clave)
      .select()
      .single()

    if (updateError) throw updateError

    // Registrar en logs
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      accion: 'actualizar',
      entidad: 'admin_config',
      entidad_id: updated.id,
      detalles: { clave, valor_anterior: configActual.valor, valor_nuevo: valor },
      estado: 'success'
    })

    return updated
  } catch (error) {
    console.error('Error actualizando config:', error)
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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
    const url = new URL(req.url)

    // GET: Obtener configuración
    if (req.method === 'GET') {
      const clave = url.searchParams.get('clave')
      
      // Registrar acceso
      await supabase.from('admin_logs').insert({
        admin_id: user.id,
        accion: 'ver',
        entidad: 'admin_config',
        detalles: { clave },
        estado: 'success'
      })

      const config = await getConfig(clave)
      
      return new Response(JSON.stringify({
        datos: config,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // POST/PUT: Actualizar configuración
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.json()
      const { clave, valor, tipo } = body

      if (!clave || valor === undefined) {
        throw new Error('Parámetros requeridos: clave, valor')
      }

      if (!validarTipo(valor, tipo || 'string')) {
        throw new Error(`Valor inválido para tipo ${tipo || 'string'}`)
      }

      const actualizado = await updateConfig(clave, valor, tipo, user)

      return new Response(JSON.stringify({
        mensaje: 'Configuración actualizada',
        datos: actualizado,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    throw new Error(`Método ${req.method} no permitido`)
  } catch (error) {
    console.error('Error:', error.message)
    
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: error.message.includes('Acceso denegado') ? 403 
             : error.message.includes('no es editable') ? 400
             : error.message.includes('no permitido') ? 405
             : 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
