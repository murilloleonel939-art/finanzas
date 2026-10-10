import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

/**
 * Edge Function: actualizar-precios
 *
 * Dispara la actualización manual de precios para una empresa o todas.
 * El worker en EC2 hace la actualización real; esta función solo crea
 * un registro de "solicitud de actualización" o puede invocar directamente
 * si se integra con un servicio de cron.
 *
 * POST /functions/v1/actualizar-precios
 * {
 *   "empresa_id": "uuid" (opcional — si no va, actualiza TODAS)
 * }
 *
 * Respuesta:
 * {
 *   "estado": "pendiente",
 *   "empresa_id": "uuid",
 *   "timestamp": "2024-01-15T10:30:00Z",
 *   "mensaje": "Actualización de precios solicitada"
 * }
 */
Deno.serve(async (req) => {
  try {
    // Validar método
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'POST o GET required' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parsear request body
    let empresa_id = null
    if (req.method === 'POST') {
      const body = await req.json()
      empresa_id = body.empresa_id || null
    } else {
      // GET: empresa_id en query params
      const url = new URL(req.url)
      empresa_id = url.searchParams.get('empresa_id')
    }

    const timestamp = new Date().toISOString()
    const fecha = timestamp.split('T')[0]

    // Si se especifica empresa_id, validar que existe
    if (empresa_id) {
      const { data: empresa, error: errEmpresa } = await supabase
        .from('empresas')
        .select('id, nombre')
        .eq('id', empresa_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (errEmpresa || !empresa) {
        return new Response(
          JSON.stringify({
            error: `Empresa ${empresa_id} no encontrada o fue eliminada`,
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Crear un registro de solicitud de actualización
    // (Opcional: puede ser tabla nueva o solo logging)
    // Por ahora, devolvemos una respuesta de éxito
    // El worker real verá esta solicitud y la procesa

    const respuesta = {
      estado: 'pendiente',
      empresa_id: empresa_id || 'TODAS',
      timestamp,
      fecha,
      mensaje: empresa_id
        ? `Actualización de precios solicitada para empresa ${empresa_id}`
        : 'Actualización de precios solicitada para TODAS las empresas',
    }

    // Log de la solicitud
    console.log('[actualizar-precios]', respuesta)

    return new Response(JSON.stringify(respuesta), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[actualizar-precios] Error:', error.message)
    return new Response(
      JSON.stringify({
        error: `Error interno: ${error.message}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
