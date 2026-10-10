import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import {
  obtenerWallet,
  listarMovimientosWallet,
  listarSaldos,
  borrarMovimientoWallet,
  recalcularSaldosWallet,
  analizarWallet,
} from '@/lib/wallets-datos'
import { esProveedorEarn, esMovimientoEarn } from '@/lib/earnConfig'
import { getMesesDisponibles, filtrarPorMes, formatMes, MES_TODOS } from '@/components/shared/MonthFilter'
import MonthFilter from '@/components/shared/MonthFilter'
import WalletEarn from '@/components/wallets/WalletEarn'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ConfirmDialog from '@/components/ConfirmDialog'
import ExportButtons from '@/components/ExportButtons'
import {
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  ArrowUpDown,
  Sparkles,
  Wallet as WalletIcon,
} from 'lucide-react'

const POR_PAGINA = 20

/**
 * WalletDetail: detalle de una wallet, con DOS variantes (PRD §7).
 *
 * La variante no la elige el usuario ni la fase: la decide el **proveedor**.
 * Si `esProveedorEarn()` lo reconoce (Coindepo), todos sus movimientos son
 * Earn por definición y el detalle muestra una pantalla única sin pestañas —
 * con «intereses ganados» entre las tarjetas y sin desglose de activos. Para el
 * resto, pestañas Movimientos / Earn.
 *
 * POR QUÉ UNA PANTALLA ÚNICA NO ES SOLO ESTÉTICA: en un proveedor «todo es
 * Earn» la pestaña Earn contendría exactamente los mismos movimientos que la de
 * Movimientos, porque el mecanismo 2 clasifica el 100%. Dos pestañas con el
 * mismo contenido hacen dudar de si una está vacía por error.
 *
 * EL SALDO NO SE RECONSTRUYE COMO EN LAS CUENTAS. Ahí el saldo actual vive en
 * `cuentas.monto` y el de cada fila se deduce hacia atrás. Aquí no hay saldo
 * escalar en absoluto (D12): `wallet_saldos` tiene una fila **por moneda**, y
 * por eso `analizarWallet()` reconstruye el saldo inicial de cada moneda desde
 * su saldo almacenado, de modo que el «saldo inicial» de un mes intermedio es
 * el real y no `saldoActual − netoDelMes`.
 *
 * Los saldos se leen en una consulta aparte de los movimientos, no de
 * `wallets_view.saldo_total`: ese agregado suma monedas distintas (BTC + USDT),
 * que es un número sin significado (D4). El desglose real es una línea por
 * moneda.
 */
export default function WalletDetail() {
  const { empresaId, proveedorId, walletId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pestana, setPestana] = useState('movimientos')
  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const [aBorrar, setABorrar] = useState(null)
  const [descuadres, setDescuadres] = useState([])

  const { data: wallet, isLoading: cargandoWallet, error: errorWallet } = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => obtenerWallet(walletId),
  })

  const { data: movimientos = [], isLoading: cargandoMovs } = useQuery({
    queryKey: ['movimientos-wallet', walletId],
    queryFn: () => listarMovimientosWallet(walletId),
  })

  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos-wallet', walletId],
    queryFn: () => listarSaldos(walletId),
  })

  const todoEarn = esProveedorEarn(wallet?.proveedor_nombre)

  const meses = useMemo(() => getMesesDisponibles(movimientos), [movimientos])

  // Un solo recorrido para las tarjetas y para el saldo de cada fila. Se le
  // pasa el predicado del mes en curso en vez de filtrar antes, porque el saldo
  // inicial hay que calcularlo sobre TODOS los movimientos, no sobre el mes.
  const analisis = useMemo(
    () =>
      analizarWallet(movimientos, saldos, (m) => {
        if (mes === MES_TODOS) return true
        return String(m.fecha ?? '').startsWith(mes)
      }),
    [movimientos, saldos, mes]
  )

  const periodo = mes === MES_TODOS ? 'acumulado' : formatMes(mes)

  const { mutate: eliminar, variables: borrandoId } = useMutation({
    // Borrar un movimiento desvía `wallet_saldos`, que es una tabla de valores
    // que mantiene el código: hay que recalcular en la misma operación. Si el
    // recálculo deja una moneda en negativo, la base no lo admite (CHECK
    // `monto >= 0`, 0004) y `recalcularSaldosWallet` no lo inventa: devuelve el
    // descuadre para enseñarlo (D25).
    mutationFn: async (id) => {
      await borrarMovimientoWallet(id)
      return recalcularSaldosWallet(walletId)
    },
    onSuccess: (resultado) => {
      setDescuadres(resultado?.descuadres ?? [])
      setABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
      queryClient.invalidateQueries({ queryKey: ['saldos-wallet', walletId] })
      queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
    },
  })

  const movimientosFiltrados = useMemo(
    () => filtrarPorMes(movimientos, mes),
    [movimientos, mes]
  )

  const totalPaginas = Math.ceil(movimientosFiltrados.length / POR_PAGINA)
  const paginaSegura = Math.min(pagina, Math.max(0, totalPaginas - 1))
  const movsVisibles = movimientosFiltrados.slice(
    paginaSegura * POR_PAGINA,
    (paginaSegura + 1) * POR_PAGINA
  )

  if (cargandoWallet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (errorWallet || !wallet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">
          {errorWallet ? 'No se pudo cargar la wallet' : 'Wallet no encontrada'}
        </p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/wallets`)} variant="outline">
          Volver a wallets
        </Button>
      </div>
    )
  }

  const rutaMovimiento = `/empresa/${empresaId}/wallets/proveedor/${proveedorId}/wallet/${walletId}/movimiento`

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-5xl">
        {/* Cabecera */}
        <div className="flex items-start gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/wallets`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors mt-1"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">{wallet.nombre_wallet}</h1>
              <Badge variant="outline">{wallet.tipo}</Badge>
              {todoEarn && (
                <Badge variant="admin" className="gap-1">
                  <Sparkles className="w-3 h-3" />
                  Todo es Earn
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {wallet.proveedor_nombre} • moneda principal {wallet.tipo_moneda}
              {wallet.direccion ? ` • ${wallet.direccion}` : ''}
            </p>
          </div>
        </div>

        {/* Aviso de descuadre: el recálculo no pudo guardar una moneda */}
        {descuadres.length > 0 && (
          <Card className="p-4 mb-6 border-l-4 border-l-destructive">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm mb-1">
                  Descuadre de saldo: no se guardó nada en {descuadres.length} moneda(s)
                </p>
                <ul className="space-y-1">
                  {descuadres.map((d) => (
                    <li key={d.moneda} className="text-xs text-muted-foreground">
                      {d.motivo}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  El saldo de esas monedas sigue siendo el anterior. No se ha recortado a cero
                  para no mostrar un saldo falso.
                </p>
              </div>
              <button
                onClick={() => setDescuadres([])}
                className="text-muted-foreground hover:text-foreground text-sm"
                aria-label="Descartar aviso"
              >
                ×
              </button>
            </div>
          </Card>
        )}

        {/* Tarjetas por moneda (D4: nada consolidado) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {analisis.porMoneda.length === 0 ? (
            <Card className="p-6 col-span-full text-center">
              <WalletIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Sin movimientos en {periodo}.
              </p>
            </Card>
          ) : (
            analisis.porMoneda.map((m) => (
              <Card key={m.moneda} className="p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-sm font-semibold">
                    {m.moneda}
                    {m.moneda === wallet.tipo_moneda && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        principal
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{periodo}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Fila etiqueta="Saldo inicial" valor={m.saldoInicial} moneda={m.moneda} />
                  <Fila etiqueta="Ingresos" valor={m.ingresos} moneda={m.moneda} tono="positivo" />
                  <Fila etiqueta="Egresos" valor={m.egresos} moneda={m.moneda} tono="negativo" />
                  {/* Intereses ganados: en la variante A es una de las
                      tarjetas que el PRD pide explícitamente. Se muestra en
                      las dos, porque el dato existe en ambas y esconderlo en
                      la B no tendría motivo. */}
                  <Fila
                    etiqueta="Intereses ganados"
                    valor={m.interesesGanados}
                    moneda={m.moneda}
                    tono="positivo"
                  />
                </div>

                <div className="flex items-baseline justify-between border-t mt-3 pt-3">
                  <span className="text-xs text-muted-foreground">Saldo final</span>
                  <span
                    className={`text-xl font-bold ${
                      m.saldoFinal >= 0 ? 'text-foreground' : 'text-rose-600'
                    }`}
                  >
                    {formatearMonto(m.saldoFinal, m.moneda)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {m.total} movimiento(s) en el período
                </p>
              </Card>
            ))
          )}
        </div>

        {/* Pestañas SOLO en la variante B */}
        {!todoEarn && (
          <div className="flex gap-1 border-b mb-6">
            {[
              { id: 'movimientos', etiqueta: 'Movimientos' },
              { id: 'earn', etiqueta: 'Earn' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPestana(p.id)
                  setPagina(0)
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  pestana === p.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.etiqueta}
                {p.id === 'earn' && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({movimientos.filter((m) => esMovimientoEarn(m, wallet.proveedor_nombre)).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ---- Variante B, pestaña Earn ---- */}
        {!todoEarn && pestana === 'earn' && (
          <WalletEarn
            empresaId={empresaId}
            walletId={walletId}
            movimientos={movimientosFiltrados}
            proveedorNombre={wallet.proveedor_nombre}
            monedaPrincipal={wallet.tipo_moneda}
            periodo={periodo}
            onBorrar={() =>
              queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
            }
          />
        )}

        {/* ---- Movimientos (variante A siempre, variante B en su pestaña) ---- */}
        {(todoEarn || pestana === 'movimientos') && (
          <>
            <div className="mb-4">
              <MonthFilter
                meses={meses}
                value={mes}
                onChange={(v) => {
                  setMes(v)
                  setPagina(0)
                }}
                label="Período"
              />
            </div>

            <Card>
              {cargandoMovs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : movimientosFiltrados.length === 0 ? (
                <div className="p-8 text-center">
                  <ArrowUpDown className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">
                    {movimientos.length === 0
                      ? 'Sin movimientos. Registra un depósito, un retiro o una recompensa.'
                      : `Sin movimientos en ${periodo}.`}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate(rutaMovimiento)}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Registrar movimiento
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Fecha</th>
                          <th className="text-left px-4 py-3 font-medium">Descripción</th>
                          <th className="text-left px-4 py-3 font-medium">Tipo</th>
                          <th className="text-right px-4 py-3 font-medium">Monto</th>
                          <th className="text-right px-4 py-3 font-medium">Saldo</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {movsVisibles.map((m) => (
                          <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {m.fecha}
                            </td>
                            <td className="px-4 py-3">{m.descripcion}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ${
                                  m.tipo === 'ingreso'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                              </span>
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                                m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {m.tipo === 'ingreso' ? '+' : '−'}
                              {formatearMonto(m.monto, m.tipo_moneda)}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                              {formatearMonto(m.saldo_resultante, m.tipo_moneda)}
                            </td>
                            <td className="px-2 py-3">
                              <button
                                onClick={() => setABorrar(m)}
                                disabled={borrandoId === m.id}
                                className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                title="Borrar movimiento"
                              >
                                {borrandoId === m.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPaginas > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        Página {paginaSegura + 1} de {totalPaginas} •{' '}
                        {movimientosFiltrados.length} movimientos
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPagina((p) => Math.max(0, p - 1))}
                          disabled={paginaSegura === 0}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPagina((p) => Math.min(totalPaginas - 1, p + 1))
                          }
                          disabled={paginaSegura >= totalPaginas - 1}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            <div className="flex gap-3 mt-4 flex-wrap">
              <ExportButtons
                datos={movsVisibles}
                columnas={[
                  { key: 'fecha', label: 'Fecha' },
                  { key: 'descripcion', label: 'Descripción' },
                  { key: 'tipo_movimiento', label: 'Tipo' },
                  { key: 'monto', label: 'Monto' },
                  { key: 'moneda', label: 'Moneda' },
                ]}
                nombreArchivo={`movimientos_${wallet.nombre_wallet}_${periodo}`}
                titulo={`Movimientos - ${wallet.nombre_wallet} (${periodo})`}
                disabled={movsVisibles.length === 0}
              />
              <Button onClick={() => navigate(rutaMovimiento)} className="gap-2">
                <Plus className="w-4 h-4" />
                Registrar movimiento
              </Button>
              <Button
                variant="outline"
                disabled
                className="gap-2"
                title="La importación de extractos desde PDF llega en la FASE 17"
              >
                Importar extracto (FASE 17)
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              El saldo inicial de cada moneda se reconstruye desde su saldo almacenado, para que
              al filtrar por un mes intermedio sea el real y no un promedio con el saldo de hoy.
              El saldo por fila se deduce hacia atrás desde el saldo final.
            </p>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="¿Borrar este movimiento?"
        description="Dejará de aparecer en el listado y los saldos de la wallet se recalcularán. Nada se borra de la base."
        actionText="Borrar"
        onConfirm={() => eliminar(aBorrar.id)}
        isLoading={borrandoId === aBorrar?.id}
      />
    </div>
  )
}

/** Una cifra del resumen, con su color por signo semántico (no por valor). */
function Fila({ etiqueta, valor, moneda, tono }) {
  const color =
    tono === 'positivo' && valor !== 0
      ? 'text-emerald-600'
      : tono === 'negativo' && valor !== 0
        ? 'text-rose-600'
        : 'text-foreground'
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className={`text-sm font-medium whitespace-nowrap ${color}`}>
        {formatearMonto(valor, moneda)}
      </span>
    </div>
  )
}
