import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { borrarBanco as borrarBancoApi, listarBancos, listarCuentas } from '@/lib/bancos'
import { formatearMonto } from '@/lib/monedas'
import { nombrePais } from '@/lib/paises'

const LOGOS_BANCOS = {
  bancolombia: '/logos-bancos/bancolombia.svg',
  bancodebogota: '/logos-bancos/banco-bogota.svg',
  davivienda: '/logos-bancos/davivienda.png',
  bbva: '/logos-bancos/bbva.png',
  bancodeoccidente: '/logos-bancos/banco-occidente.svg',
  bancopopular: '/logos-bancos/banco-popular.svg',
  scotiabankcolpatria: '/logos-bancos/scotiabank-colpatria.png',
  itaucolombia: '/logos-bancos/itau.png',
  bancoavvillas: '/logos-bancos/av-villas.svg',
  bancocajasocial: '/logos-bancos/caja-social.svg',
  bancamia: '/logos-bancos/bancamia.png',
  nequi: '/logos-bancos/nequi.svg',
  dale: '/logos-bancos/dale.png',
  plata: '/logos-bancos/plata.png',
  daviplata: '/logos-bancos/daviplata.png',
  nubank: '/logos-bancos/nubank.png',
}

const logoBanco = (nombre) => {
  const limpio = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const clave = Object.keys(LOGOS_BANCOS).find((banco) => limpio.includes(banco))
  return LOGOS_BANCOS[clave] || ''
}

function LogoBanco({ nombre }) {
  const [fallo, setFallo] = useState(false)
  const inicial = nombre?.trim()?.charAt(0)?.toUpperCase() || 'B'
  const logo = logoBanco(nombre || '')

  return (
    <div className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg bg-slate-50 px-2">
      {!fallo && logo ? (
        <img src={logo} alt={`Logo de ${nombre}`} className="max-h-9 max-w-full object-contain" onError={() => setFallo(true)} />
      ) : <span className="text-2xl font-bold text-blue-700">{inicial}</span>}
    </div>
  )
}
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Loader2, Plus, Trash2, AlertCircle } from 'lucide-react'

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
    queryFn: () => listarBancos(empresaId),
  })

  // Todas las cuentas de la empresa (para agrupar por banco y contar)
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-empresa', empresaId],
    queryFn: () => listarCuentas(empresaId),
  })

  const cuentasPorBanco = bancos.reduce((acc, banco) => {
    acc[banco.id] = cuentas.filter((c) => c.banco_id === banco.id)
    return acc
  }, {})

  const { mutate: borrarBanco, isPending: borrando } = useMutation({
    mutationFn: (bancoId) => borrarBancoApi(empresaId, bancoId),
    onSuccess: () => {
      setBancoABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] })
    },
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bancos.map((banco) => {
              const cuentasBanco = cuentasPorBanco[banco.id] ?? []

              return (
                <Card key={banco.id} className="overflow-hidden border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between p-4 pb-3">
                    <div>
                      <LogoBanco nombre={banco.nombre_banco} />
                      <h3 className="mt-3 text-sm font-semibold">{banco.nombre_banco}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {nombrePais(banco.pais) || banco.pais}
                      </p>
                    </div>
                    <button
                      onClick={() => setBancoABorrar(banco)}
                      className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50"
                      title="Borrar banco"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="px-4 pb-4">
                    {cuentasBanco.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-3 text-center">
                        <p className="mb-2 text-xs text-muted-foreground">Sin cuentas</p>
                        <Button onClick={() => navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)} size="sm" variant="outline" className="gap-1">
                          <Plus className="h-3 w-3" />Crear cuenta
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cuentasBanco.map((cuenta) => (
                          <button key={cuenta.id} onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuenta.id}`)} className="group w-full rounded-lg border bg-white p-3 text-left transition-colors hover:bg-slate-50">
                            <p className="text-sm font-medium">{cuenta.numero_cuenta} <span className="text-xs text-muted-foreground">({cuenta.tipo_cuenta})</span></p>
                            <p className="text-xs text-muted-foreground">Saldo: {formatearMonto(cuenta.monto, cuenta.tipo_moneda)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={() => navigate(`/empresa/${empresaId}/cuentas/crear?banco=${banco.id}`)} size="sm" variant="ghost" className="w-full rounded-none border-t py-3 text-primary">
                    <Plus className="mr-1 h-3 w-3" />Añadir cuenta
                  </Button>
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
