import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatearMonto } from '@/lib/monedas'
import { nombrePais } from '@/lib/paises'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Loader2, Plus, ChevronRight, Trash2, AlertCircle } from 'lucide-react'

/**
 * BancosPage: listado de bancos con sus cuentas asociadas.
 *
 * Columnas reales (migración 0002): `bancos` solo tiene `pais` y `nombre_banco`
 * — no hay `codigo` ni `nombre_oficial`. El saldo de una cuenta es
 * `cuentas.monto`, no `saldo_actual`.
 *
 * El borrado es lógico (D7) y usa ConfirmDialog: borrar un banco esconde sus
 * cuentas de todos los listados, porque las vistas hacen el JOIN contra
 * `bancos` sin filtrar el `deleted_at` del banco... por eso se exige
 * confirmación explícita con el número de cuentas afectadas a la vista.
 */
export default function BancosPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [bancoABorrar, setBancoABorrar] = useState(null)

  // Bancos de la empresa
  const { data: bancos = [], isLoading: cargandoBancos, error: errorBancos } = useQuery({
    queryKey: ['bancos', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, nombre_banco, pais')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre_banco')

      if (error) throw error
      return data ?? []
    },
  })

  // Todas las cuentas de la empresa (para agrupar por banco y contar)
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-empresa', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, banco_id, numero_cuenta, tipo_moneda, monto, tipo_cuenta')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('numero_cuenta')

      if (error) throw error
      return data ?? []
    },
  })

  const cuentasPorBanco = bancos.reduce((acc, banco) => {
    acc[banco.id] = cuentas.filter((c) => c.banco_id === banco.id)
    return acc
  }, {})

  const { mutate: borrarBanco, isPending: borrando } = useMutation({
    mutationFn: async (bancoId) => {
      const { error } = await supabase
        .from('bancos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', bancoId)

      if (error) throw error
    },
    onSuccess: () => {
      setBancoABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] })
    },
  })

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

        {cargandoBancos ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : errorBancos ? (
          <Card className="p-6 border-l-4 border-l-red-500">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">No se pudieron cargar los bancos</p>
                <p className="text-xs text-muted-foreground mt-1">{errorBancos.message}</p>
              </div>
            </div>
          </Card>
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
              const cuentasBanco = cuentasPorBanco[banco.id] ?? []

              return (
                <Card key={banco.id} className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{banco.nombre_banco}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {nombrePais(banco.pais) || banco.pais}
                      </p>
                    </div>
                    <button
                      onClick={() => setBancoABorrar(banco)}
                      className="p-2 hover:bg-red-100 rounded text-red-600 transition-colors"
                      title="Borrar banco"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Cuentas del banco */}
                  {cuentasBanco.length === 0 ? (
                    <div className="p-3 bg-muted/50 rounded border border-dashed text-center">
                      <p className="text-xs text-muted-foreground mb-2">Sin cuentas</p>
                      <Button
                        onClick={() =>
                          navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)
                        }
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
                          onClick={() =>
                            navigate(`/empresa/${empresaId}/cuentas/${cuenta.id}`)
                          }
                          className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded border transition-colors text-left group"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {cuenta.numero_cuenta}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({cuenta.tipo_cuenta})
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saldo: {formatearMonto(cuenta.monto, cuenta.tipo_moneda)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                      <Button
                        onClick={() =>
                          navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)
                        }
                        size="sm"
                        variant="ghost"
                        className="w-full gap-2 text-primary"
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

      <ConfirmDialog
        open={!!bancoABorrar}
        onOpenChange={(abierto) => !abierto && setBancoABorrar(null)}
        title={`¿Borrar ${bancoABorrar?.nombre_banco}?`}
        description={
          cuentasPorBanco[bancoABorrar?.id]?.length
            ? `Sus ${cuentasPorBanco[bancoABorrar.id].length} cuenta(s) dejarán de aparecer en los listados. Los movimientos no se borran.`
            : 'Este banco no tiene cuentas asociadas.'
        }
        onConfirm={() => borrarBanco(bancoABorrar.id)}
        isLoading={borrando}
      />
    </div>
  )
}
