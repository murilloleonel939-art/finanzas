// =====================================================================
// Estadísticas del sistema (Edge Function `admin-get-stats`)
// =====================================================================
// Los nombres salen del esquema real (migraciones 0001-0010), no de un
// supuesto: precios_jobs usa `estado` del enum estado_job
// ('pendiente','procesando','hecho','error') y `finished_at`, no
// `completado_en`. Equivocarse aquí devuelve ceros silenciosos.

import { requireSuperAdmin } from '../_shared/auth.ts'
import { json, corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin, userId } = auth.ctx

  // Cuenta filas de una tabla sin traerlas. `head: true` evita el payload.
  const contar = async (tabla: string, filtro?: (q: any) => any) => {
    let q = admin.from(tabla).select('*', { count: 'exact', head: true })
    if (filtro) q = filtro(q)
    const { count } = await q
    return count ?? 0
  }

  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    empresas,
    cuentas,
    movimientos,
    activos,
    usuariosActivos,
    jobsHoy,
  ] = await Promise.all([
    contar('empresas'),
    contar('cuentas'),
    contar('movimientos'),
    contar('activos_broker'),
    contar('profiles', (q) => q.gte('updated_at', hace30dias)),
    contar('precios_jobs', (q) => q.gte('created_at', hace24h)),
  ])

  // Último job terminado, para el indicador de salud.
  const { data: ultimoJob } = await admin
    .from('precios_jobs')
    .select('id, estado, finished_at, errores, activos_totales')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const minutos = ultimoJob?.finished_at
    ? Math.round((Date.now() - new Date(ultimoJob.finished_at).getTime()) / 60000)
    : null

  const salud = {
    estado: ultimoJob && ultimoJob.errores === 0 ? 'ok' : 'warning',
    ultimoJobHace: minutos === null ? 'Nunca' : `hace ${minutos} min`,
    ultimoJobEstado: ultimoJob?.estado ?? null,
    erroresUltimo: ultimoJob?.errores ?? 0,
  }

  await admin.from('admin_logs').insert({
    admin_id: userId,
    accion: 'ver',
    entidad: 'system_stats',
    estado: 'success',
  })

  return json({
    timestamp: new Date().toISOString(),
    stats: {
      empresas,
      cuentas,
      movimientos,
      activos,
      usuariosActivos,
      jobsHoy,
    },
    salud,
  })
})
