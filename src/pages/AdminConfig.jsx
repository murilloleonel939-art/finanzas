import { useEffect, useState } from 'react'
import { getAdminConfig, updateAdminConfig } from '@/lib/admin-api'
import ConfigForm from '@/components/admin/ConfigForm'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

/**
 * Panel de configuración del sistema
 */
export default function AdminConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    cargarConfig()
  }, [])

  const cargarConfig = async () => {
    try {
      setError(null)
      setLoading(true)
      const datos = await getAdminConfig()
      setConfig(datos.datos || [])
    } catch (err) {
      setError(err.message)
      console.error('Error cargando config:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleGuardar = async (clave, valor, tipo) => {
    try {
      setGuardando(true)
      setError(null)
      await updateAdminConfig(clave, valor, tipo)
      
      // Recargar config
      await cargarConfig()
    } catch (err) {
      setError(err.message)
      console.error('Error guardando config:', err)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Variables de entorno y configuración global
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={cargarConfig}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Cargando configuración...</p>
        </div>
      ) : (
        <ConfigForm
          config={config}
          onGuardar={handleGuardar}
          guardando={guardando}
        />
      )}
    </div>
  )
}
