import { Badge } from '@/components/ui/badge'
import { formatearFecha, getEtiquetaEstado, getColorEstado } from '@/lib/admin-utils'

/**
 * Tabla de jobs de precios.
 *
 * Los campos son los de `precios_jobs` (migración 0009): `creado_en` /
 * `terminado_en` vienen ya normalizados por la Edge Function `admin-list-jobs`,
 * que traduce `created_at` / `finished_at`.
 *
 * Se usa una tabla HTML plana y no el componente `Table` de ui/: aquí hacen
 * falta columnas de desglose (actualizados / total) y el wrapper añadía más
 * ruido que ayuda.
 */
export default function JobsTable({ jobs, loading }) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cargando jobs…</p>
  }

  if (!jobs || jobs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin jobs.</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Empresa</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Actualizados</th>
            <th className="px-3 py-2 font-medium">Errores</th>
            <th className="px-3 py-2 font-medium">Creado</th>
            <th className="px-3 py-2 font-medium">Terminado</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">{job.empresa_nombre}</td>
              <td className="px-3 py-2">
                <Badge className={getColorEstado(job.estado)}>
                  {getEtiquetaEstado(job.estado)}
                </Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {job.activos_actualizados} / {job.activos_totales}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {job.errores > 0 ? (
                  <span className="font-medium text-destructive">{job.errores}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {formatearFecha(job.creado_en)}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {job.terminado_en ? formatearFecha(job.terminado_en) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
