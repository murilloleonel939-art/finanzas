// =====================================================================
// Visor de logs (Edge Function `admin-list-logs`)
// =====================================================================
// Los logs viven en admin_logs (migración 0011). Se leen con service_role
// tras requireSuperAdmin, que es la única forma de ver los de todos los
// administradores.

import { requireSuperAdmin } from '../_shared/auth.ts'
import { json, corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin, userId } = auth.ctx

  const url = new URL(req.url)
  const accion = url.searchParams.get('accion')
  const entidad = url.searchParams.get('entidad')
  const estado = url.searchParams.get('estado')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

  let query = admin
    .from('admin_logs')
    .select(
      'id, admin_id, accion, entidad, entidad_id, detalles, ip_address, estado, ' +
      'mensaje_error, duracion_ms, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (accion) query = query.eq('accion', accion)
  if (entidad) query = query.eq('entidad', entidad)
  if (estado) query = query.eq('estado', estado)
  if (desde) query = query.gte('created_at', desde)
  if (hasta) query = query.lte('created_at', hasta)

  const { data: logs, error, count } = await query
  if (error) return json({ error: `No se pudieron leer los logs: ${error.message}` }, 500)

  // El nombre del admin se resuelve aparte: profiles no tiene FK directa
  // desde admin_logs que PostgREST pueda incrustar de forma fiable.
  const ids = [...new Set((logs ?? []).map((l: any) => l.admin_id).filter(Boolean))]
  let perfiles: Record<string, { full_name: string | null; email: string }> = {}

  if (ids.length) {
    const { data: filas } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)

    perfiles = Object.fromEntries(
      (filas ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }])
    )
  }

  const enriquecidos = (logs ?? []).map((l: any) => ({
    ...l,
    admin_nombre: perfiles[l.admin_id]?.full_name ?? 'Desconocido',
    admin_email: perfiles[l.admin_id]?.email ?? '',
  }))

  const estadisticas = {
    total: count ?? 0,
    exitosos: enriquecidos.filter((l) => l.estado === 'success').length,
    errores: enriquecidos.filter((l) => l.estado === 'error').length,
    por_accion: enriquecidos.reduce((acc, l) => {
      acc[l.accion] = (acc[l.accion] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
    por_entidad: enriquecidos.reduce((acc, l) => {
      acc[l.entidad] = (acc[l.entidad] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
  }

  // Ver los logs también queda registrado: es la única forma de auditar
  // quién consultó la auditoría.
  await admin.from('admin_logs').insert({
    admin_id: userId,
    accion: 'ver',
    entidad: 'admin_logs',
    detalles: { accion, entidad, estado, desde, hasta },
    estado: 'success',
  })

  return json({ logs: enriquecidos, estadisticas, paginacion: { limit, offset, total: count ?? 0 } })
})
