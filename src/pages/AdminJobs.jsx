import { useEffect, useState } from 'react'
import { listAdminJobs } from '@/lib/admin-api'
import JobsTable from '@/components/admin/JobsTable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { RefreshCw, Download } from 'lucide-react'
import { exportarCSV } from '@/lib/admin-utils'

/**
 * Panel de monitoreo de jobs de precios
 */
export default function AdminJobs() {
  const [jobs, setJobs] = useState([])
  const [estadisticas, setEstadisticas] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    cargarJobs()
    
    // Auto-refresh cada 30 segundos
    const intervalo = setInterval(cargarJobs, 30000)
    return () => clearInterval(intervalo)
  }, [filtroEstado, limit, offset])

  const cargarJobs = async () => {
    try {
      setError(null)
      setLoading(true)
      const datos = await listAdminJobs({
        estado: filtroEstado || null,
        limit,
        offset
      })
      setJobs(datos.jobs || [])
      setEstadisticas(datos.estadisticas)
    } catch (err) {
      setError(err.message)
      console.error('Error cargando jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExportar = () => {
    exportarCSV(jobs, `jobs-${new Date().toISOString()}.csv`)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoreo de Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actualización de precios y tareas del sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportar}
            disabled={jobs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={cargarJobs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="space-y-3">
          <label className="text-sm font-medium">Filtrar por estado</label>
          <select
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value)
              setOffset(0)
            }}
            className="w-full px-3 py-2 border rounded-md text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="procesando">Procesando</option>
            <option value="completado">Completado</option>
            <option value="error">Error</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </Card>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Jobs</p>
            <p className="text-2xl font-bold mt-1">{estadisticas.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tasa de Éxito</p>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {estadisticas.exito_rate}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tasa de Error</p>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {estadisticas.error_rate}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tiempo Promedio</p>
            <p className="text-2xl font-bold mt-1">
              {estadisticas.tiempo_promedio_seg}s
            </p>
          </Card>
        </div>
      )}

      {/* Tabla */}
      <JobsTable jobs={jobs} loading={loading} />

      {/* Paginación */}
      {estadisticas && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {offset + 1} a {Math.min(offset + limit, estadisticas.total)} de {estadisticas.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= estadisticas.total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  )
}
