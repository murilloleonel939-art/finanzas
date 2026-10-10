import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { requireSuperAdmin, type AdminCtx } from '../_shared/auth.ts'

/**
 * FASE 18: Edge Function `actualizar-precios`
 *
 * **Propósito (PRD §8):** botón de «actualizar precios ahora» en el frontend.
 * El usuario es un super_admin que quiere refrescar los precios de sus activos
 * sin esperar a que el barrido periódico lo haga.
 *
 * **Qué hace:**
 *   1. Verifica que quien llama es un super_admin activo.
 *   2. Encola un `precios_jobs` con estado `pendiente`.
 *   3. Devuelve el job para que el frontend lo pegue al poll de realtime.
 *
 * **Por qué no hace el trabajo aquí (D30):**
 *   - Supabase corta a ~150 s; una empresa grande no termina.
 *   - Yahoo devuelve un símbolo por petición; un batch no existe (v7 devuelve 401).
 *   - El worker en EC2 procesa sin límite de tiempo.
 *
 * POST /functions/v1/actualizar-precios
 * {
 *   "empresa_id": "uuid" (requerida),
 *   "broker_id": "uuid" (opcional — solo activos de ese broker)
 * }
 *
 * Respuesta (job encolado):
 * {
 *   "id": "uuid",
 *   "empresa_id": "uuid",
 *   "broker_id": "uuid|null",
 *   "estado": "pendiente",
 *   "created_at": "2024-01-15T10:30:00Z",
 *   ...
 * }
 */

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return respuesta(405, { error: 'Se requiere POST' })
  }

  // ===========================================================================
  // 1. AUTORIZACIÓN
  // ===========================================================================

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) {
    return respuesta(auth.status, { error: auth.mensaje })
  }

  const { admin } = auth.ctx

  // ===========================================================================
  // 2. PARÁMETROS
  // ===========================================================================

  let body: any
  try {
    body = await req.json()
  } catch {
    return respuesta(400, { error: 'Body JSON inválido' })
  }

  const empresaId = body.empresa_id
  const brokerId = body.broker_id ?? null

  if (!empresaId || typeof empresaId !== 'string') {
    return respuesta(400, { error: 'Falta empresa_id (uuid)' })
  }

  if (brokerId && typeof brokerId !== 'string') {
    return respuesta(400, { error: 'broker_id debe ser uuid o null' })
  }

  // ===========================================================================
  // 3. VALIDACIÓN: empresa existe y no está borrada
  // ===========================================================================

  const { data: empresa, error: errEmpresa } = await admin
    .from('empresas')
    .select('id')
    .eq('id', empresaId)
    .is('deleted_at', null)
    .maybeSingle()

  if (errEmpresa || !empresa) {
    return respuesta(404, { error: 'Empresa no encontrada o está borrada' })
  }

  // ===========================================================================
  // 4. VALIDACIÓN: si se especifica broker, pertenece a la empresa y existe
  // ===========================================================================

  if (brokerId) {
    const { data: broker, error: errBroker } = await admin
      .from('brokers')
      .select('id')
      .eq('id', brokerId)
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .maybeSingle()

    if (errBroker || !broker) {
      return respuesta(404, { error: 'Broker no pertenece a la empresa o está borrado' })
    }
  }

  // ===========================================================================
  // 5. ENCOLAR JOB
  // ===========================================================================

  const { data: job, error: errJob } = await admin
    .from('precios_jobs')
    .insert({
      empresa_id: empresaId,
      broker_id: brokerId,
      estado: 'pendiente',
      created_by: auth.ctx.userId,
    })
    .select()
    .single()

  if (errJob || !job) {
    console.error('[actualizar-precios] Error encolando job:', errJob?.message)
    return respuesta(500, {
      error: 'No se pudo encolar la actualización. Intenta de nuevo.',
    })
  }

  // ===========================================================================
  // 6. ÉXITO
  // ===========================================================================

  console.log('[actualizar-precios] Job encolado:', {
    id: job.id,
    empresa_id: job.empresa_id,
    broker_id: job.broker_id,
    created_by: auth.ctx.userId,
  })

  return respuesta(201, {
    ok: true,
    job,
    mensaje: brokerId
      ? `Actualización solicitada para el broker ${brokerId}`
      : 'Actualización solicitada para toda la empresa',
  })
})

/** Respuesta JSON estándar. */
function respuesta(status: number, datos: any) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
