import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'

/**
 * Panel de gestión de empresas 
 * Permite CRUD de empresas del sistema
 */
export default function AdminEmpresas() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crear, editar y gestionar empresas del sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Empresa
          </Button>
        </div>
      </div>

      <Card className="p-8 text-center">
        <p className="text-muted-foreground">
          Funcionalidad disponible en próximas versiones
        </p>
      </Card>
    </div>
  )
}
