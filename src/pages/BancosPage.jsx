import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Plus, ChevronRight, Trash2 } from 'lucide-react'

/**
 * BancosPage: listado de bancos con sus cuentas asociadas.
 * 
 * Cada banco muestra:
 *   - nombre_banco
 *   - código (si existe)
 *   - lista de cuentas (con moneda y saldo)
 *   - opción de borrar
 */
export default function BancosPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()

  // Obtener bancos
  const { data: bancos = [], isLoading: cargandoBancos } = useQuery({
    queryKey: ['bancos', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, nombre_banco, codigo, nombre_oficial')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre_banco')

      if (error) throw error
      return data || []
    },
  })

  // Obtener cuentas para cada banco
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-empresa', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, banco_id, numero_cuenta, tipo_moneda, saldo_actual, tipo_cuenta')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('numero_cuenta')

      if (error) throw error
      return data || []
    },
  })

  // Agrupar cuentas por banco
  const cuentasPorBanco = bancos.reduce((acc, banco) => {
    acc[banco.id] = cuentas.filter((c) => c.banco_id === banco.id)
    return acc
  }, {})

  const isLoading = cargandoBancos

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Bancos</h1>
            <p className="text-sm text-muted-foreground">Gestiona tus cuentas bancarias</p>
          </div>
          <Button
            onClick={() => navigate(`/empresa/${empresaId}/bancos/crear`)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo banco
          </Button>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : bancos.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No hay bancos creados aún</p>
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/bancos/crear`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear el primer banco
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {bancos.map((banco) => {
              const cuentasBanco = cuentasPorBanco[banco.id] || []

              return (
                <Card key={banco.id} className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{banco.nombre_banco}</h3>
                      <div className="flex gap-3 mt-1">
                        {banco.nombre_oficial && (
                          <p className="text-xs text-muted-foreground">{banco.nombre_oficial}</p>
                        )}
                        {banco.codigo && (
                          <p className="text-xs text-muted-foreground">Código: {banco.codigo}</p>
                        )}
                      </div>
                    </div>
                    <button className="p-2 hover:bg-red-100 rounded text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Cuentas del banco */}
                  {cuentasBanco.length === 0 ? (
                    <div className="p-3 bg-gray-50 rounded border border-dashed text-center">
                      <p className="text-xs text-muted-foreground mb-2">Sin cuentas</p>
                      <Button
                        onClick={() => navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Crear cuenta
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cuentasBanco.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuenta.id}`)}
                          className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded border transition-colors text-left group"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {cuenta.numero_cuenta}
                              <span className="text-xs text-muted-foreground ml-2">({cuenta.tipo_cuenta})</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saldo: {parseFloat(cuenta.saldo_actual || 0).toFixed(2)} {cuenta.tipo_moneda}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                      <Button
                        onClick={() => navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)}
                        size="sm"
                        variant="ghost"
                        className="w-full gap-2 text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="w-3 h-3" />
                        Añadir cuenta
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
