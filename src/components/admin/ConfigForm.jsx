import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Formulario para configuración del sistema
 */
export default function ConfigForm({ config, onGuardar, guardando }) {
  const [valores, setValores] = useState(
    config?.reduce((acc, item) => {
      acc[item.clave] = item.valor
      return acc
    }, {}) || {}
  )
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const handleCambio = (clave, valor) => {
    setValores(prev => ({
      ...prev,
      [clave]: valor
    }))
  }

  const handleGuardar = async (clave) => {
    try {
      setError('')
      setMensaje('')
      
      const configItem = config?.find(c => c.clave === clave)
      if (!configItem) return

      await onGuardar(clave, valores[clave], configItem.tipo)
      setMensaje(`${clave} actualizado correctamente`)
      
      setTimeout(() => setMensaje(''), 3000)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!config || config.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Sin configuración disponible</p>
      </div>
    )
  }

  // Agrupar por grupo
  const grupos = {}
  config.forEach(item => {
    const grupo = item.grupo || 'General'
    if (!grupos[grupo]) grupos[grupo] = []
    grupos[grupo].push(item)
  })

  return (
    <div className="space-y-6">
      {mensaje && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{mensaje}</AlertDescription>
        </Alert>
      )}
      
      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {Object.entries(grupos).map(([grupo, items]) => (
        <Card key={grupo} className="p-4">
          <h3 className="mb-4 text-sm font-semibold">{grupo}</h3>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.clave} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Label htmlFor={item.clave} className="text-sm font-medium">
                      {item.clave}
                    </Label>
                    {item.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.descripcion}
                      </p>
                    )}
                  </div>
                  {!item.editable && (
                    <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                      Solo lectura
                    </span>
                  )}
                </div>
                
                {item.tipo === 'boolean' ? (
                  <select
                    id={item.clave}
                    value={valores[item.clave] === 'true' ? 'true' : 'false'}
                    onChange={(e) => handleCambio(item.clave, e.target.value)}
                    disabled={!item.editable || guardando}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                ) : (
                  <Input
                    id={item.clave}
                    type={item.tipo === 'integer' ? 'number' : 'text'}
                    value={valores[item.clave] || ''}
                    onChange={(e) => handleCambio(item.clave, e.target.value)}
                    disabled={!item.editable || guardando}
                  />
                )}

                {item.editable && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGuardar(item.clave)}
                    disabled={guardando}
                  >
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
