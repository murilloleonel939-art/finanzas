import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { formatearFecha, getEtiquetaAccion, getIconoAccion, debounce } from '@/lib/admin-utils'

/**
 * Visor de logs administrativos
 */
export default function LogsViewer({ logs, estadisticas, paginacion, onFiltrar, loading }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')

  const handleBusqueda = debounce((texto) => {
    onFiltrar?.({ busqueda: texto, accion: filtroAccion })
  }, 500)

  const handleCambiarBusqueda = (e) => {
    const valor = e.target.value
    setBusqueda(valor)
    handleBusqueda(valor)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Cargando logs...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en logs..."
            className="pl-8"
            value={busqueda}
            onChange={handleCambiarBusqueda}
          />
        </div>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded border p-2 text-center">
            <p className="text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{estadisticas.total}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-muted-foreground">Exitosos</p>
            <p className="text-lg font-semibold text-green-600">{estadisticas.exitosos}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-muted-foreground">Errores</p>
            <p className="text-lg font-semibold text-red-600">{estadisticas.errores}</p>
          </div>
          <div className="rounded border p-2 text-center">
            <p className="text-muted-foreground">Acciones</p>
            <p className="text-lg font-semibold">{Object.keys(estadisticas.por_accion || {}).length}</p>
          </div>
        </div>
      )}

      {/* Tabla de logs */}
      {logs && logs.length > 0 ? (
        <div className="space-y-2 rounded border">
          {logs.map((log) => (
            <div key={log.id} className="border-b p-3 last:border-b-0 hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getIconoAccion(log.accion)}</span>
                    <span className="font-mono text-xs text-muted-foreground">ID: {log.id}</span>
                    <Badge variant="outline" className="text-xs">
                      {log.admin_nombre}
                    </Badge>
                    {log.estado === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        Error
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">{getEtiquetaAccion(log.accion)}</span>
                    {' en '}
                    <span className="text-muted-foreground">{log.entidad}</span>
                    {log.entidad_id && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (ID: {log.entidad_id})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFecha(log.created_at)}
                    {log.ip_address && ` • IP: ${log.ip_address}`}
                    {log.duracion_ms && ` • ${log.duracion_ms}ms`}
                  </p>
                  {log.mensaje_error && (
                    <p className="text-xs text-red-600 font-mono">
                      {log.mensaje_error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">Sin logs</p>
        </div>
      )}

      {/* Paginación */}
      {paginacion && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {paginacion.offset + 1} a {Math.min(paginacion.offset + paginacion.limit, paginacion.total)} de {paginacion.total}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={paginacion.offset === 0}
              onClick={() => onFiltrar?.({ offset: Math.max(0, paginacion.offset - paginacion.limit) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={paginacion.offset + paginacion.limit >= paginacion.total}
              onClick={() => onFiltrar?.({ offset: paginacion.offset + paginacion.limit })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
