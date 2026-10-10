// =====================================================================
// FASE 20: Listar jobs de precios (Edge Function `admin-list-jobs`)
// =====================================================================
// Tabla real: precios_jobs (migración 0009). Estado del enum estado_job
// ('pendiente','procesando','hecho','error'), fechas started_at/finished_at
// y desglose activos_totales/activos_actualizados/errores.

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
  const estado = url.searchParams.get('estado')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

  let query = admin
    .from('precios_jobs')
    .select(
      'id, empresa_id, broker_id, estado, activos_totales, activos_actualizados, ' +
      'errores, error_mensaje, started_at, finished_at, created_at, empresas(nombre)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (estado) query = query.eq('estado', estado)

  const { data, error, count } = await query
  if (error) return json({ error: `No se pudieron leer los jobs: ${error.message}` }, 500)

  const jobs = (data ?? []).map((j: any) => ({
    id: j.id,
    empresa_id: j.empresa_id,
    empresa_nombre: j.empresas?.nombre ?? 'Desconocida',
    estado: j.estado,
    activos_totales: j.activos_totales,
    activos_actualizados: j.activos_actualizados,
    errores: j.errores,
    error_mensaje: j.error_mensaje,
    iniciado_en: j.started_at,
    terminado_en: j.finished_at,
    creado_en: j.created_at,
    duracion_segundos:
      j.started_at && j.finished_at
        ? Math.round((new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 1000)
        : null,
  }))

  // Las estadísticas se calculan sobre lo devuelto, no sobre toda la tabla:
  // son orientativas para el panel, y así la consulta no crece con el tiempo.
  const terminados = jobs.filter((j) => j.estado === 'hecho')
  const conError = jobs.filter((j) => j.errores > 0)
  // `duracion_segundos` es number | null; el filter no estrecha el tipo, así
  // que se acota explícitamente para que el reduce no reciba null.
  const tiempos: number[] = terminados
    .map((j) => j.duracion_segundos)
    .filter((t): t is number => typeof t === 'number' && t > 0)

  const estadisticas = {
    total: count ?? 0,
    por_estado: jobs.reduce((acc, j) => {
      acc[j.estado] = (acc[j.estado] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
    exito_rate: jobs.length ? Math.round((terminados.length / jobs.length) * 100) : 0,
    error_rate: jobs.length ? Math.round((conError.length / jobs.length) * 100) : 0,
    tiempo_promedio_seg: tiempos.length
      ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
      : 0,
    ultima_ejecucion: jobs[0]?.creado_en ?? null,
  }

  await admin.from('admin_logs').insert({
    admin_id: userId,
    accion: 'ver',
    entidad: 'precios_jobs',
    detalles: { estado, limit, offset },
    estado: 'success',
  })

  return json({ jobs, estadisticas, paginacion: { limit, offset, total: count ?? 0 } })
})
