import { useEffect, useState } from 'react'
import { listAdminLogs } from '@/lib/admin-api'
import LogsViewer from '@/components/admin/LogsViewer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Download, RefreshCw } from 'lucide-react'
import { exportarJSON } from '@/lib/admin-utils'

/**
 * Panel de visualización de logs administrativos
 */
export default function AdminLogs() {
  const [logs, setLogs] = useState([])
  const [estadisticas, setEstadisticas] = useState(null)
  const [paginacion, setPaginacion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtros, setFiltros] = useState({
    accion: '',
    entidad: '',
    estado: '',
    limit: 100,
    offset: 0
  })

  useEffect(() => {
    cargarLogs()
  }, [filtros])

  const cargarLogs = async () => {
    try {
      setError(null)
      setLoading(true)
      const datos = await listAdminLogs(filtros)
      setLogs(datos.logs || [])
      setEstadisticas(datos.estadisticas)
      setPaginacion(datos.paginacion)
    } catch (err) {
      setError(err.message)
      console.error('Error cargando logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExportar = async () => {
    try {
      const datos = await listAdminLogs({
        ...filtros,
        limit: 1000,
        offset: 0,
        formato: 'export'
      })
      exportarJSON(datos, `logs-${new Date().toISOString()}.json`)
    } catch (err) {
      console.error('Error exportando:', err)
    }
  }

  const handleFiltrar = (nuevosFiltros) => {
    setFiltros(prev => ({
      ...prev,
      ...nuevosFiltros
    }))
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logs del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auditoría completa de acciones administrativas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportar}
            disabled={logs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={cargarLogs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filtros avanzados */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-medium">Acción</label>
            <select
              value={filtros.accion}
              onChange={(e) => handleFiltrar({ accion: e.target.value, offset: 0 })}
              className="w-full px-2 py-1.5 border rounded text-sm mt-1"
            >
              <option value="">Todas</option>
              <option value="crear">Crear</option>
              <option value="actualizar">Actualizar</option>
              <option value="eliminar">Eliminar</option>
              <option value="ver">Ver</option>
              <option value="exportar">Exportar</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Entidad</label>
            <input
              type="text"
              placeholder="ej: empresas"
              value={filtros.entidad}
              onChange={(e) => handleFiltrar({ entidad: e.target.value, offset: 0 })}
              className="w-full px-2 py-1.5 border rounded text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Estado</label>
            <select
              value={filtros.estado}
              onChange={(e) => handleFiltrar({ estado: e.target.value, offset: 0 })}
              className="w-full px-2 py-1.5 border rounded text-sm mt-1"
            >
              <option value="">Todos</option>
              <option value="success">Éxito</option>
              <option value="error">Error</option>
              <option value="pending">Pendiente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Por página</label>
            <select
              value={filtros.limit}
              onChange={(e) => handleFiltrar({ limit: parseInt(e.target.value), offset: 0 })}
              className="w-full px-2 py-1.5 border rounded text-sm mt-1"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Visor de logs */}
      <LogsViewer
        logs={logs}
        estadisticas={estadisticas}
        paginacion={paginacion}
        onFiltrar={handleFiltrar}
        loading={loading}
      />

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  )
}
