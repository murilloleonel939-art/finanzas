import { useEffect, useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { obtenerEmpresa, obtenerRamas, suscribirseAModulos } from '@/lib/empresas-usuario'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { ChevronRight, Building2 } from 'lucide-react'

/**
 * EmpresaLayout: Layout principal para la navegación dentro de una empresa.
 * 
 * El PRD §11.3 define tres módulos fijos (no ramas variables):
 *   - Bancos (tabla `bancos`)
 *   - Brokers (tabla `brokers`)
 *   - Proveedores de Wallet (tabla `wallet_providers`)
 * 
 * Decidimos reemplazar la tabla `ramas` con esta abstracción de aplicación
 * para evitar una tabla que está siempre vacía (D8). Las suscripciones realtime
 * escuchan los tres tipos de cambios en las tablas de datos.
 */
export default function EmpresaLayout() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [, setRefresh] = useState(0)

  // Obtener empresa
  const { data: empresa, isLoading: cargandoEmpresa, error: errorEmpresa } = useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: () => obtenerEmpresa(empresaId),
    enabled: !!empresaId && !!user,
  })

  // Las tres ramas son constantes (no las consulta a BD)
  const ramas = obtenerRamas(empresaId)

  // Suscribirse a cambios en los módulos de datos
  useEffect(() => {
    if (!empresaId || !user) return

    const subscription = suscribirseAModulos(empresaId, () => {
      setRefresh(r => r + 1)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [empresaId, user])

  const isLoading = cargandoEmpresa
  const error = errorEmpresa

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div>Cargando empresa...</div>
      </div>
    )
  }

  if (error || !empresa) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="text-red-600">{error?.message || 'Empresa no encontrada'}</div>
        <Button onClick={() => navigate('/workspace')} variant="outline">
          Volver al workspace
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h1 className="font-bold text-gray-900">{empresa.nombre}</h1>
          </div>
          <p className="text-sm text-gray-500">{empresa.pais || 'N/A'}</p>
        </div>

        {/* Módulos (tres ramas fijas) */}
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase mb-4">
            Módulos
          </h2>

          <div className="space-y-2">
            {ramas.map((rama) => (
              <button
                key={rama.id}
                onClick={() => navigate(rama.ruta)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 text-gray-700 group"
              >
                <span className="font-medium">{rama.nombre}</span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>

        {/* Volver */}
        <div className="p-4 border-t border-gray-200 mt-auto">
          <Button
            onClick={() => navigate('/workspace')}
            variant="outline"
            className="w-full"
          >
            Volver al workspace
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ empresa, ramas }} />
      </div>
    </div>
  )
}
