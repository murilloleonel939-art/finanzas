import { useEffect, useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { obtenerEmpresa, obtenerRamas, suscribirseAModulos } from '@/lib/empresas-usuario'
import { listarBancos, listarCuentas } from '@/lib/bancos'
import { listarBrokers } from '@/lib/brokers-datos'
import { listarProveedores, listarWallets } from '@/lib/wallets-datos'
import { listarComisionistasFiducias, listarCuentasComisionistasFiducias } from '@/lib/comisionistas-fiducias'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Building2, Landmark, CreditCard, Plus, TrendingUp, Wallet, BriefcaseBusiness, Bot, PiggyBank } from 'lucide-react'

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
  const [bancosAbiertos, setBancosAbiertos] = useState({})

  // Obtener empresa
  const { data: empresa, isLoading: cargandoEmpresa, error: errorEmpresa } = useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: () => obtenerEmpresa(empresaId),
    enabled: !!empresaId && !!user,
  })

  // Las tres ramas son constantes (no las consulta a BD)
  const ramas = obtenerRamas(empresaId)
  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos', empresaId],
    queryFn: () => listarBancos(empresaId),
    enabled: !!empresaId && !!user,
  })
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-empresa', empresaId],
    queryFn: () => listarCuentas(empresaId),
    enabled: !!empresaId && !!user,
  })
  const cuentasPorBanco = bancos.reduce((resultado, banco) => {
    resultado[banco.id] = cuentas.filter((cuenta) => cuenta.banco_id === banco.id)
    return resultado
  }, {})
  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers', empresaId],
    queryFn: () => listarBrokers(empresaId),
    enabled: !!empresaId && !!user,
  })
  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores-wallet', empresaId],
    queryFn: () => listarProveedores(empresaId),
    enabled: !!empresaId && !!user,
  })
  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-empresa', empresaId],
    queryFn: () => listarWallets(empresaId),
    enabled: !!empresaId && !!user,
  })
  const { data: comisionistasFiducias = [] } = useQuery({
    queryKey: ['comisionistas-fiducias', empresaId],
    queryFn: () => listarComisionistasFiducias(empresaId),
    enabled: !!empresaId && !!user,
  })
  const { data: cuentasComisionistasFiducias = [] } = useQuery({
    queryKey: ['cuentas-comisionistas-fiducias', empresaId],
    queryFn: () => listarCuentasComisionistasFiducias(empresaId),
    enabled: !!empresaId && !!user,
  })
  const cuentasPorComisionistaFiducia = comisionistasFiducias.reduce((resultado, entidad) => {
    resultado[entidad.id] = cuentasComisionistasFiducias.filter((cuenta) => cuenta.comisionista_fiducia_id === entidad.id)
    return resultado
  }, {})
  const walletsPorProveedor = proveedores.reduce((resultado, proveedor) => {
    resultado[proveedor.id] = wallets.filter((wallet) => wallet.proveedor_id === proveedor.id)
    return resultado
  }, {})

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
          <button type="button" onClick={() => navigate(`/empresa/${empresaId}/asesor-portafolio`)} className="mb-4 flex w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-800 hover:bg-blue-100">
            <Bot className="h-4 w-4" /> Asesor del portafolio
          </button>
          <button type="button" onClick={() => navigate(`/empresa/${empresaId}/desafio-ahorro`)} className="mb-4 flex w-full items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100">
            <PiggyBank className="h-4 w-4" /> Desafío de ahorro
          </button>
          <h2 className="text-sm font-semibold text-gray-700 uppercase mb-4">
            Módulos
          </h2>

          <div className="space-y-2">
            {ramas.map((rama) => {
              const esBancos = rama.id === 'bancos'
              const esBrokers = rama.id === 'brokers'
              const esWallets = rama.id === 'wallet-providers'
              const esComisionistas = rama.id === 'comisionistas-fiducias'
              const elementos = esBancos ? bancos : esBrokers ? brokers : esWallets ? proveedores : comisionistasFiducias
              const abierto = bancosAbiertos[rama.id]
              const icono = esBancos ? <Landmark className="h-4 w-4" /> : esBrokers ? <TrendingUp className="h-4 w-4" /> : esWallets ? <Wallet className="h-4 w-4" /> : <BriefcaseBusiness className="h-4 w-4" />
              return (
                <div key={rama.id}>
                  <div className="flex items-center rounded-md hover:bg-gray-100">
                    <button type="button" onClick={() => navigate(rama.ruta)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-gray-700">
                      {icono}<span className="font-medium">{rama.nombre}</span>
                    </button>
                    {elementos.length > 0 ? (
                      <button type="button" aria-label={`Expandir ${rama.nombre}`} onClick={() => setBancosAbiertos((actual) => ({ ...actual, [rama.id]: !actual[rama.id] }))} className="mr-1 rounded p-1 hover:bg-gray-200">
                        {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    ) : <ChevronRight className="mr-3 h-4 w-4 text-gray-400" />}
                  </div>

                  {abierto && (
                    <div className="ml-3 space-y-1 border-l border-gray-200 pl-2">
                      {elementos.map((elemento) => {
                        const hijos = esBancos ? (cuentasPorBanco[elemento.id] ?? []) : esWallets ? (walletsPorProveedor[elemento.id] ?? []) : esComisionistas ? (cuentasPorComisionistaFiducia[elemento.id] ?? []) : []
                        const elementoAbierto = bancosAbiertos[elemento.id]
                        const nombre = esBancos ? elemento.nombre_banco : esBrokers ? elemento.nombre_broker : esWallets ? elemento.nombre_proveedor : elemento.nombre
                        return (
                          <div key={elemento.id}>
                            <button type="button" onClick={() => {
                              if (esBrokers) navigate(`/empresa/${empresaId}/brokers/${elemento.id}`)
                              else setBancosAbiertos((actual) => ({ ...actual, [elemento.id]: !actual[elemento.id] }))
                            }} className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100">
                              {esBrokers ? <TrendingUp className="h-3.5 w-3.5" /> : elementoAbierto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {esWallets ? <Wallet className="h-3.5 w-3.5" /> : esBancos ? <Landmark className="h-3.5 w-3.5" /> : null}
                              <span className="truncate">{nombre}</span>
                            </button>
                            {!esBrokers && elementoAbierto && (
                              <div className="ml-4 space-y-1">
                                {hijos.map((hijo) => (
                                  <button key={hijo.id} type="button" onClick={() => navigate(esBancos ? `/empresa/${empresaId}/cuentas/${hijo.id}` : esWallets ? `/empresa/${empresaId}/wallets/proveedor/${elemento.id}/wallet/${hijo.id}` : `/empresa/${empresaId}/comisionistas-fiducias`)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-100">
                                    {esBancos || esComisionistas ? <CreditCard className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}<span className="truncate">{esBancos ? hijo.numero_cuenta : esWallets ? hijo.nombre_wallet : hijo.nombre_cuenta}</span>
                                  </button>
                                ))}
                                <button type="button" onClick={() => navigate(esBancos ? `/empresa/${empresaId}/cuentas/crear?banco=${elemento.id}` : esWallets ? `/empresa/${empresaId}/wallets/proveedor/${elemento.id}/crear-wallet` : `/empresa/${empresaId}/comisionistas-fiducias/crear-cuenta?fiducia=${elemento.id}`)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50">
                                  <Plus className="h-3 w-3" /> {esBancos || esComisionistas ? 'Crear cuenta' : 'Crear wallet'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
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
