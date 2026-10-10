// =====================================================================
// FASE 20: Leer y actualizar configuración (Edge Function `admin-config`)
// =====================================================================
// GET  /admin-config          -> todas las claves, agrupadas
// GET  /admin-config?clave=X  -> una sola
// POST /admin-config          -> { clave, valor } actualiza y audita
//
// Se usa service_role tras requireSuperAdmin porque admin_config tiene RLS:
// una escritura desde el navegador fallaría aunque el usuario sea admin.

import { requireSuperAdmin } from '../_shared/auth.ts'
import { json, corsHeaders } from '../_shared/cors.ts'

/** Comprueba que el valor encaja con el tipo declarado en la tabla. */
function validarTipo(valor: string, tipo: string): string | null {
  switch (tipo) {
    case 'integer':
      return Number.isInteger(Number(valor)) ? null : 'debe ser un número entero'
    case 'boolean':
      return valor === 'true' || valor === 'false' ? null : 'debe ser true o false'
    case 'json':
      try {
        JSON.parse(valor)
        return null
      } catch {
        return 'debe ser JSON válido'
      }
    case 'string':
      return valor.trim() === '' ? 'no puede estar vacío' : null
    default:
      return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin, userId } = auth.ctx

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const clave = url.searchParams.get('clave')

    // Dos consultas separadas y no una variable reasignada: `maybeSingle()`
    // cambia el tipo de retorno y TypeScript no admite la reasignación.
    const comun = admin
      .from('admin_config')
      .select('id, clave, valor, tipo, descripcion, grupo, editable, updated_at')

    const { data, error } = clave
      ? await comun.eq('clave', clave).maybeSingle()
      : await comun.order('grupo').order('clave')

    if (error) return json({ error: `No se pudo leer la configuración: ${error.message}` }, 500)
    if (clave && !data) return json({ error: `No existe la clave "${clave}".` }, 404)

    return json({ datos: data, timestamp: new Date().toISOString() })
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    let body: { clave?: string; valor?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'El cuerpo no es JSON válido.' }, 400)
    }

    const { clave } = body
    if (!clave || body.valor === undefined || body.valor === null) {
      return json({ error: 'Faltan "clave" y "valor".' }, 400)
    }

    const { data: actual, error: errLectura } = await admin
      .from('admin_config')
      .select('id, valor, tipo, editable')
      .eq('clave', clave)
      .maybeSingle()

    if (errLectura) return json({ error: errLectura.message }, 500)
    if (!actual) return json({ error: `No existe la clave "${clave}".` }, 404)
    if (!actual.editable) {
      return json({ error: `La clave "${clave}" es de solo lectura.` }, 400)
    }

    const valor = String(body.valor)
    const problema = validarTipo(valor, actual.tipo)
    if (problema) {
      return json({ error: `Valor inválido para "${clave}": ${problema}.` }, 400)
    }

    const { data: actualizado, error: errEscritura } = await admin
      .from('admin_config')
      .update({ valor, actualizado_por: userId, updated_at: new Date().toISOString() })
      .eq('clave', clave)
      .select('id, clave, valor, tipo, updated_at')
      .single()

    if (errEscritura) return json({ error: errEscritura.message }, 500)

    await admin.from('admin_logs').insert({
      admin_id: userId,
      accion: 'cambiar_config',
      entidad: 'admin_config',
      entidad_id: String(actualizado.id),
      detalles: { clave, valor_anterior: actual.valor, valor_nuevo: valor },
      estado: 'success',
    })

    return json({ mensaje: 'Configuración actualizada.', datos: actualizado })
  }

  return json({ error: `Método ${req.method} no permitido.` }, 405)
})
