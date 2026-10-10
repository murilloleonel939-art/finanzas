import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import {
  listarProveedores,
  listarWallets,
  borrarProveedor,
  borrarWallet,
} from '@/lib/wallets-datos'
import { esProveedorEarn } from '@/lib/earnConfig'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Loader2, Plus, ChevronRight, Trash2, AlertCircle, Wallet, Sparkles } from 'lucide-react'

/**
 * WalletsPage: proveedores de wallet con sus wallets (PRD §6 y §11.3).
 *
 * Es el equivalente de `BancosPage` para la tercera rama: la unidad de nivel
 * superior es el **proveedor**, y las wallets cuelgan de él, igual que las
 * cuentas cuelgan de un banco.
 *
 * Sobre el saldo que se muestra: `wallets_view.saldo_total` es un agregado que
 * **suma monedas distintas** (0.5 BTC + 200 USDT). Sumarlas da un número sin
 * significado monetario (D4), así que aquí no se pinta como un saldo: lo que se
 * muestra es el número de monedas y la moneda principal de la wallet. El
 * desglose real, una línea por moneda, está en `WalletDetail`.
 */
export default function WalletsPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [proveedorABorrar, setProveedorABorrar] = useState(null)
  const [walletABorrar, setWalletABorrar] = useState(null)

  const { data: proveedores = [], isLoading, error } = useQuery({
    queryKey: ['proveedores-wallet', empresaId],
    queryFn: () => listarProveedores(empresaId),
  })

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-empresa', empresaId],
    queryFn: () => listarWallets(empresaId),
  })

  const walletsPorProveedor = wallets.reduce((acc, w) => {
    ;(acc[w.proveedor_id] ??= []).push(w)
    return acc
  }, {})

  const { mutate: eliminarProveedor, isPending: borrandoProveedor } = useMutation({
    mutationFn: (id) => borrarProveedor(id),
    onSuccess: () => {
      setProveedorABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['proveedores-wallet', empresaId] })
      queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
    },
  })

  const { mutate: eliminarWallet, isPending: borrandoWallet } = useMutation({
    mutationFn: (id) => borrarWallet(id),
    onSuccess: () => {
      setWalletABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
    },
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Proveedores de wallet</h1>
            <p className="text-sm text-muted-foreground">
              Wallets cripto y fiat, con sus saldos por moneda
            </p>
          </div>
          <Button
            onClick={() => navigate(`/empresa/${empresaId}/wallets/crear-proveedor`)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo proveedor
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-6 border-l-4 border-l-destructive">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">No se pudieron cargar los proveedores</p>
                <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
              </div>
            </div>
          </Card>
        ) : proveedores.length === 0 ? (
          <Card className="p-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No hay proveedores creados aún</p>
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/wallets/crear-proveedor`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear el primer proveedor
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {proveedores.map((proveedor) => {
              const suyas = walletsPorProveedor[proveedor.id] ?? []
              const todoEarn = esProveedorEarn(proveedor.nombre_proveedor)

              return (
                <Card key={proveedor.id} className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold">{proveedor.nombre_proveedor}</h3>
                        <Badge variant="outline">{proveedor.tipo}</Badge>
                        {todoEarn && (
                          <Badge variant="admin" className="gap-1">
                            <Sparkles className="w-3 h-3" />
                            Todo es Earn
                          </Badge>
                        )}
                      </div>
                      {todoEarn && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Todos sus movimientos son de productos Earn, sin mirar la descripción.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setProveedorABorrar(proveedor)}
                      className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                      title="Borrar proveedor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {suyas.length === 0 ? (
                    <div className="p-3 bg-muted/50 rounded border border-dashed text-center">
                      <p className="text-xs text-muted-foreground mb-2">Sin wallets</p>
                      <Button
                        onClick={() =>
                          navigate(
                            `/empresa/${empresaId}/wallets/proveedor/${proveedor.id}/crear-wallet`
                          )
                        }
                        size="sm"
                        variant="outline"
                        className="gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Crear wallet
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suyas.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center gap-2 p-1 bg-muted/50 hover:bg-muted rounded border transition-colors group"
                        >
                          <button
                            onClick={() =>
                              navigate(
                                `/empresa/${empresaId}/wallets/proveedor/${w.proveedor_id}/wallet/${w.id}`
                              )
                            }
                            className="flex-1 flex items-center justify-between p-2 text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{w.nombre_wallet}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {w.monedas_distintas > 0
                                  ? `${w.monedas_distintas} moneda(s) · ${w.tipo_moneda}`
                                  : `Sin saldos · ${w.tipo_moneda}`}
                                {w.direccion ? ` · ${w.direccion}` : ''}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                          </button>
                          <button
                            onClick={() => setWalletABorrar(w)}
                            className="p-1.5 mr-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            title="Borrar wallet"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <Button
                        onClick={() =>
                          navigate(
                            `/empresa/${empresaId}/wallets/proveedor/${proveedor.id}/crear-wallet`
                          )
                        }
                        size="sm"
                        variant="ghost"
                        className="w-full gap-2 text-primary"
                      >
                        <Plus className="w-3 h-3" />
                        Añadir wallet
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
        open={!!proveedorABorrar}
        onOpenChange={(abierto) => !abierto && setProveedorABorrar(null)}
        title={`¿Borrar ${proveedorABorrar?.nombre_proveedor}?`}
        description={
          (walletsPorProveedor[proveedorABorrar?.id]?.length ?? 0) > 0
            ? `Sus ${walletsPorProveedor[proveedorABorrar.id].length} wallet(s) dejarán de aparecer en los listados junto con sus movimientos. Nada se borra de la base.`
            : 'Este proveedor no tiene wallets asociadas.'
        }
        actionText="Borrar"
        onConfirm={() => eliminarProveedor(proveedorABorrar.id)}
        isLoading={borrandoProveedor}
      />

      <ConfirmDialog
        open={!!walletABorrar}
        onOpenChange={(abierto) => !abierto && setWalletABorrar(null)}
        title={`¿Borrar ${walletABorrar?.nombre_wallet}?`}
        description="Dejará de aparecer en los listados junto con sus movimientos y saldos. Nada se borra de la base."
        actionText="Borrar"
        onConfirm={() => eliminarWallet(walletABorrar.id)}
        isLoading={borrandoWallet}
      />
    </div>
  )
}
