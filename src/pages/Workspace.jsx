import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { obtenerEmpresasUsuario, suscribirseAEmpresasUsuario } from '@/lib/empresas-usuario'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Building2, ChevronRight, LogOut, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Workspace() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [, setRefresh] = useState(0)

  // Obtener empresas
  const { data: empresas = [], isLoading, error } = useQuery({
    queryKey: ['empresas-usuario'],
    queryFn: obtenerEmpresasUsuario,
  })

  // Suscribirse a cambios realtime
  useEffect(() => {
    const subscription = suscribirseAEmpresasUsuario(() => {
      // Forzar refetch al cambiar algo
      setRefresh(r => r + 1)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleEntrarEmpresa = (empresaId) => {
    navigate(`/empresa/${empresaId}`)
  }

  const handleIrAlAdmin = () => {
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">FinanzAdmin Pro</h1>
              <p className="text-sm text-muted-foreground">Mis empresas</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Botón admin si es super_admin */}
        {profile?.app_role === 'super_admin' && (
          <div className="mb-8">
            <Button
              onClick={handleIrAlAdmin}
              variant="outline"
              className="gap-2"
            >
              Panel de administración
            </Button>
          </div>
        )}

        {/* Lista de empresas */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Cargando empresas...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive">Error al cargar las empresas</p>
          </div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No tienes empresas asignadas</p>
            {profile?.app_role === 'super_admin' && (
              <Button
                onClick={handleIrAlAdmin}
                variant="default"
              >
                Crear una empresa
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresas.map((empresa) => (
              <Card
                key={empresa.id}
                className="flex flex-col p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => handleEntrarEmpresa(empresa.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-medium text-foreground">{empresa.nombre}</h3>
                      <p className="text-xs text-muted-foreground">{empresa.pais || 'N/A'}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>

                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-1 rounded',
                      empresa.estado === 'activa'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    )}
                  >
                    {empresa.estado === 'activa' ? 'Activa' : 'Suspendida'}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {new Date(empresa.created_at).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
