import { useEffect, useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { obtenerEmpresa, obtenerRamas, suscribirseARamas } from '@/lib/empresas-usuario'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Building2, Plus } from 'lucide-react'

/**
 * EmpresaLayout: Layout principal para la navegación dentro de una empresa.
 * Estructura jerárquica: Empresa > Ramas > Módulos (Bancos, Brokers, Wallets)
 */
export default function EmpresaLayout() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [expandedRamas, setExpandedRamas] = useState(new Set())
  const [, setRefresh] = useState(0)

  // Obtener empresa
  const { data: empresa, isLoading: cargandoEmpresa, error: errorEmpresa } = useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: () => obtenerEmpresa(empresaId),
    enabled: !!empresaId && !!user,
  })

  // Obtener ramas
  const { data: ramas = [], isLoading: cargandoRamas, error: errorRamas } = useQuery({
    queryKey: ['ramas', empresaId],
    queryFn: () => obtenerRamas(empresaId),
    enabled: !!empresaId && !!user,
  })

  // Suscribirse a cambios en ramas
  useEffect(() => {
    if (!empresaId || !user) return

    const subscription = suscribirseARamas(empresaId, () => {
      // Forzar refetch al cambiar algo
      setRefresh(r => r + 1)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [empresaId, user])

  const isLoading = cargandoEmpresa || cargandoRamas
  const error = errorEmpresa || errorRamas

  const toggleRama = (ramaId) => {
    const newExpanded = new Set(expandedRamas)
    if (newExpanded.has(ramaId)) {
      newExpanded.delete(ramaId)
    } else {
      newExpanded.add(ramaId)
    }
    setExpandedRamas(newExpanded)
  }

  const navigateTo = (path) => {
    navigate(path)
  }

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

        {/* Ramas */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase">
              Ramas
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/empresa/${empresaId}/new-rama`)}
              className="h-6 w-6 p-0"
              title="Nueva rama"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1">
            {ramas.length === 0 ? (
              <p className="text-sm text-gray-500 px-2 py-4">
                Sin ramas creadas
              </p>
            ) : (
              ramas.map((rama) => (
                <div key={rama.id}>
                  {/* Rama Header */}
                  <button
                    onClick={() => toggleRama(rama.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-gray-100 text-gray-700"
                  >
                    {expandedRamas.has(rama.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="font-medium">{rama.nombre}</span>
                  </button>

                  {/* Submódulos */}
                  {expandedRamas.has(rama.id) && (
                    <div className="ml-4 space-y-1">
                      <button
                        onClick={() =>
                          navigateTo(
                            `/empresa/${empresaId}/rama/${rama.id}/bancos`
                          )
                        }
                        className="w-full text-left px-2 py-1 text-sm rounded-md hover:bg-gray-100 text-gray-600"
                      >
                        Bancos
                      </button>
                      <button
                        onClick={() =>
                          navigateTo(
                            `/empresa/${empresaId}/rama/${rama.id}/brokers`
                          )
                        }
                        className="w-full text-left px-2 py-1 text-sm rounded-md hover:bg-gray-100 text-gray-600"
                      >
                        Brokers
                      </button>
                      <button
                        onClick={() =>
                          navigateTo(
                            `/empresa/${empresaId}/rama/${rama.id}/wallets`
                          )
                        }
                        className="w-full text-left px-2 py-1 text-sm rounded-md hover:bg-gray-100 text-gray-600"
                      >
                        Proveedores de Wallet
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
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
