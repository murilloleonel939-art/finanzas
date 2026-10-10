import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatearFecha, getEtiquetaEstado, getColorEstado } from '@/lib/admin-utils'

/**
 * Tabla de jobs de precios
 */
export default function JobsTable({ jobs, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Cargando jobs...</p>
      </div>
    )
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Sin jobs</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Símbolo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead>Completado</TableHead>
            <TableHead>Errores</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-mono text-xs">{job.id}</TableCell>
              <TableCell className="text-sm">{job.empresa_nombre}</TableCell>
              <TableCell className="font-mono text-sm">{job.simbolo}</TableCell>
              <TableCell>
                <Badge className={getColorEstado(job.estado)}>
                  {getEtiquetaEstado(job.estado)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatearFecha(job.creado_en)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {job.completado_en ? formatearFecha(job.completado_en) : '-'}
              </TableCell>
              <TableCell>
                {job.errores_count > 0 ? (
                  <span className="font-semibold text-red-600">{job.errores_count}</span>
                ) : (
                  <span className="text-green-600">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
