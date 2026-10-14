import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import {
  obtenerWallet,
  listarMovimientosWallet,
  listarSaldos,
  borrarMovimientoWallet,
  analizarWallet,
  obtenerUltimaImportacionWallet,
  borrarUltimaImportacionWallet,
  borrarDatosWallet,
} from '@/lib/wallets-datos'
import { esProveedorEarn, esMovimientoEarn } from '@/lib/earnConfig'
import { getAnosDisponibles, getMesesDisponibles, filtrarPorAno, filtrarPorMes, formatMes, MES_TODOS, YearFilter } from '@/components/shared/MonthFilter'
import MonthFilter from '@/components/shared/MonthFilter'
import WalletEarn from '@/components/wallets/WalletEarn'
import ImportarWalletModal from '@/components/ImportarWalletModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Upload,
  Wallet as WalletIcon,
} from 'lucide-react'

const POR_PAGINA = 20

function formatearNumeroCompacto(valor, maxDecimales = 2) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDecimales }).format(numero)
}

function formatearPesos(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero)
}

function formatearValorTrm(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero)
}

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
  const [ano, setAno] = useState('')
  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const [descripcionesAbiertas, setDescripcionesAbiertas] = useState(() => new Set())
  const [aBorrar, setABorrar] = useState(null)
  const [descuadres, setDescuadres] = useState([])
  const [importarAbierto, setImportarAbierto] = useState(false)
  const [confirmarBorradoImport, setConfirmarBorradoImport] = useState(false)
  const [confirmarBorradoDatos, setConfirmarBorradoDatos] = useState(false)

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

  const { data: ultimaImportacion } = useQuery({
    queryKey: ['ultima-importacion-wallet', walletId],
    queryFn: () => obtenerUltimaImportacionWallet(empresaId, walletId),
  })

  const esPaypal = String(wallet?.proveedor_nombre || '').trim().toLowerCase() === 'paypal'
  const esBinance = String(wallet?.proveedor_nombre || '').trim().toLowerCase() === 'binance'
  const todoEarn = esProveedorEarn(wallet?.proveedor_nombre)
  const esDolarapp = String(wallet?.proveedor_nombre || '').trim().toLowerCase() === 'dolarapp'
  const esPlenti = String(wallet?.proveedor_nombre || '').trim().toLowerCase() === 'plenti'
  const mostrarDiferencialCambio = esDolarapp || esPlenti
  const mostrarEarn = !esPaypal

  const anos = useMemo(() => getAnosDisponibles(movimientos), [movimientos])
  const anoActivo = ano || anos[0] || ''
  const movimientosDelAno = useMemo(() => filtrarPorAno(movimientos, anoActivo), [movimientos, anoActivo])
  const meses = useMemo(() => getMesesDisponibles(movimientosDelAno), [movimientosDelAno])

  // Un solo recorrido para las tarjetas y para el saldo de cada fila. Se le
  // pasa el predicado del mes en curso en vez de filtrar antes, porque el saldo
  // inicial hay que calcularlo sobre TODOS los movimientos, no sobre el mes.
  const analisis = useMemo(
    () =>
      analizarWallet(movimientosDelAno, saldos, (m) => {
        if (mes === MES_TODOS) return true
        return String(m.fecha ?? '').startsWith(mes)
      }, wallet?.proveedor_nombre),
    [movimientosDelAno, saldos, mes, wallet?.proveedor_nombre]
  )

  const periodo = mes === MES_TODOS ? 'acumulado' : formatMes(mes)

  // Resumen acumulado del crédito desde los movimientos de Coindepo. Los montos
  // se guardan positivos y la dirección está en `tipo`: Loan Withdrawal ingreso
  // suma crédito; Loan Repayment egreso reduce el saldo pendiente.
  const creditosPorMoneda = useMemo(() => {
    if (!todoEarn) return []
    const porMoneda = new Map()
    for (const m of movimientos) {
      const descripcion = String(m.descripcion || '').trim().toLowerCase()
      const moneda = String(m.tipo_moneda || 'N/A').toUpperCase()
      if (!porMoneda.has(moneda)) porMoneda.set(moneda, { moneda, otorgado: 0, pagado: 0 })
      const credito = porMoneda.get(moneda)
      if (descripcion.startsWith('loan withdrawal') && m.tipo === 'ingreso') {
        credito.otorgado += Number(m.monto || 0)
      }
      if (descripcion.startsWith('loan repayment') && m.tipo === 'egreso') {
        credito.pagado += Number(m.monto || 0)
      }
    }
    return [...porMoneda.values()]
      .filter((c) => c.otorgado > 0 || c.pagado > 0)
      .map((c) => ({
        ...c,
        pendiente: Number(Math.abs(c.pagado - c.otorgado).toFixed(8)),
      }))
  }, [movimientos, todoEarn])

  const { mutate: eliminar, variables: borrandoId } = useMutation({
    // Borrar un movimiento desvía `wallet_saldos`, que es una tabla de valores
    // que mantiene el código: hay que recalcular en la misma operación. Si el
    // recálculo deja una moneda en negativo, la base no lo admite (CHECK
    // `monto >= 0`, 0004) y `recalcularSaldosWallet` no lo inventa: devuelve el
    // descuadre para enseñarlo (D25).
    mutationFn: async (id) => {
      return borrarMovimientoWallet(empresaId, walletId, id)
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
    () => filtrarPorMes(movimientosDelAno, mes),
    [movimientosDelAno, mes]
  )

  // Tras importar hay que refrescar movimientos y saldos: el worker inserta las
  // filas y el servidor recalcula `wallet_saldos` en la misma operación, así que
  // leer solo los movimientos dejaría el saldo desfasado.
  function alImportar() {
    queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
    queryClient.invalidateQueries({ queryKey: ['saldos-wallet', walletId] })
    queryClient.invalidateQueries({ queryKey: ['ultima-importacion-wallet', walletId] })
    queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
  }

  const { mutate: eliminarImportacion, isPending: borrandoImportacion } = useMutation({
    mutationFn: () => borrarUltimaImportacionWallet(empresaId, walletId),
    onSuccess: () => {
      setConfirmarBorradoImport(false)
      alImportar()
    },
  })

  // Deja la wallet vacía para repetir pruebas desde cero. No borra la wallet:
  // el proveedor, el nombre y la dirección se conservan. El saldo queda en cero
  // porque se recalcula y ya no hay movimientos que lo sostengan.
  const { mutate: eliminarDatos, isPending: borrandoDatos } = useMutation({
    mutationFn: () => borrarDatosWallet(empresaId, walletId),
    onSuccess: () => {
      setConfirmarBorradoDatos(false)
      setPagina(0)
      alImportar()
    },
  })

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
          <div className="flex flex-wrap gap-2 items-center">
            <ExportButtons
              datos={movsVisibles}
              columnas={[
                { key: 'fecha', label: 'Fecha' },
                { key: 'descripcion', label: 'Descripción' },
                { key: 'tipo_movimiento', label: 'Tipo' },
                { key: 'monto', label: 'Monto' },
                { key: 'moneda', label: 'Moneda' },
                ...(mostrarDiferencialCambio ? [
                  { key: 'trm', label: 'TRM' },
                  { key: 'monto_equivalente', label: 'M. de compra' },
                  { key: 'valor_trm', label: 'valorTrm' },
                  { key: 'diferencia_cambio', label: 'Diferencia cambio' },
                ] : []),
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
              onClick={() => setImportarAbierto(true)}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Importar extracto
            </Button>
            {/* Un solo botón destructivo para no llenar la cabecera: dentro
                caben las dos formas de deshacer, que son distintas. «Borrar
                última importación» es quirúrgico —solo lo que creó ese archivo,
                conservando los movimientos manuales— y «Borrar datos» deja la
                wallet vacía para volver a empezar. */}
            {movimientos.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                    Borrar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ultimaImportacion && (
                    <DropdownMenuItem onClick={() => setConfirmarBorradoImport(true)}>
                      Última importación ({ultimaImportacion.movimientos_vivos ?? 0})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setConfirmarBorradoDatos(true)}>
                    Todos los datos de la wallet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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

        {/* Resumen de crédito Coindepo: derivado exclusivamente del historial de movimientos. */}
        {todoEarn && creditosPorMoneda.length > 0 && (
          <Card className="p-4 mb-6 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-3">
              <WalletIcon className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-semibold">Crédito</h2>
              <span className="text-xs text-muted-foreground">acumulado de movimientos</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {creditosPorMoneda.map((c) => (
                <div key={c.moneda} className="rounded-md border p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{c.moneda}</p>
                  <div className="space-y-1">
                    <Fila etiqueta="Crédito otorgado" valor={c.otorgado} moneda={c.moneda} />
                    <Fila etiqueta="Pagos de Loan Repayment" valor={c.pagado} moneda={c.moneda} tono="negativo" />
                    <Fila etiqueta="Intereses del crédito" valor={c.pendiente} moneda={c.moneda} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Los intereses del crédito muestran la diferencia absoluta entre los pagos de Loan Repayment y el crédito otorgado.
            </p>
          </Card>
        )}

        {/* Diferencial cambiario por moneda */}
        {(analisis.diferencialCambio.positiva > 0 || analisis.diferencialCambio.negativa > 0) && (
          <Card className="p-4 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-semibold">Diferencial cambiario</p>
              <p className="text-xs text-muted-foreground">{periodo}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Fila etiqueta="Diferencia de cambio positiva" valor={analisis.diferencialCambio.positiva} moneda="COP" tono="positivo" />
              <Fila etiqueta="Diferencia de cambio negativa" valor={analisis.diferencialCambio.negativa} moneda="COP" tono="negativo" />
            </div>
          </Card>
        )}

        {!esBinance && (
          /* Tarjetas por moneda (D4: nada consolidado) */
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
                  <Fila
                    etiqueta="Comisiones"
                    valor={m.comisiones}
                    moneda={m.moneda}
                    tono="negativo"
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
        )}

        {/* Pestañas SOLO en la variante B */}
        {mostrarEarn && !todoEarn && (
          <div className="flex gap-1 border-b mb-6">
            {[
              ...(esBinance ? [{ id: 'activos', etiqueta: 'Activos' }] : []),
              { id: 'movimientos', etiqueta: 'Movimientos' },
              { id: 'earn', etiqueta: 'Earn' },
              ...(esBinance ? [{ id: 'p2p', etiqueta: 'P2P' }] : []),
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

        {esBinance && pestana === 'activos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {analisis.porMoneda.length === 0 ? (
              <Card className="p-6 col-span-full text-center">
                <p className="text-muted-foreground">Sin activos registrados.</p>
              </Card>
            ) : (
              analisis.porMoneda.map((m) => (
                <Card key={m.moneda} className="p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-sm font-semibold">{m.moneda}</p>
                    <p className="text-xs text-muted-foreground">acumulado</p>
                  </div>
                  <div className="space-y-2">
                    <Fila etiqueta="Total" valor={m.neto} moneda={m.moneda} />
                    <Fila etiqueta="Intereses ganados" valor={m.interesesGanados} moneda={m.moneda} tono="positivo" />
                    <Fila etiqueta="Comisiones" valor={m.comisiones} moneda={m.moneda} />
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ---- Variante B, pestaña Earn ---- */}
        {mostrarEarn && !todoEarn && pestana === 'earn' && (
          <WalletEarn
            empresaId={empresaId}
            walletId={walletId}
            movimientos={movimientosFiltrados}
            proveedorNombre={wallet.proveedor_nombre}
            monedaPrincipal={wallet.tipo_moneda}
            periodo={periodo}
            onImportar={() => setImportarAbierto(true)}
            onBorrar={() =>
              queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
            }
          />
        )}

        {/* ---- Movimientos (variante A siempre, variante B en su pestaña) ---- */}
        {(todoEarn || pestana === 'movimientos') && (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <YearFilter anos={anos} value={anoActivo} onChange={(v) => { setAno(v); setMes(MES_TODOS); setPagina(0) }} />
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
                  <div className="overflow-x-auto rounded-lg border bg-background">
                    <table className="w-full min-w-[1040px] text-sm table-fixed">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="w-[120px] text-left px-4 py-3 font-medium">Fecha</th>
                          <th className="w-[300px] text-left px-4 py-3 font-medium">Descripción</th>
                          <th className="w-[110px] text-left px-4 py-3 font-medium">Tipo</th>
                          <th className="w-[145px] text-right px-4 py-3 font-medium">Monto</th>
                           {mostrarDiferencialCambio && <>
                             <th className="text-right px-4 py-3 font-medium">TRM</th>
                             <th className="text-right px-4 py-3 font-medium">M. de compra</th>
                             <th className="text-right px-4 py-3 font-medium">valorTrm</th>
                             <th className="text-right px-4 py-3 font-medium">Diferencia cambio</th>
                           </>}
                          
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {movsVisibles.map((m) => (
                          <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {String(m.fecha).slice(0, 10)}
                            </td>
                            <td className="px-4 py-3">{(() => {
                                 const descripcion = String(m.descripcion || '')
                                 const abierta = descripcionesAbiertas.has(m.id)
                                 const larga = descripcion.length > 52
                                 const visible = abierta || !larga ? descripcion : `${descripcion.slice(0, 52).trimEnd()}…`
                                 return (
                                   <div className="flex items-start gap-1.5 max-w-[280px]">
                                     <span className={abierta ? 'break-words' : 'truncate'} title={abierta ? undefined : descripcion}>{visible}</span>
                                     {larga && <button type="button" className="shrink-0 text-xs font-semibold text-primary hover:underline" onClick={() => setDescripcionesAbiertas((actuales) => { const siguiente = new Set(actuales); if (siguiente.has(m.id)) siguiente.delete(m.id); else siguiente.add(m.id); return siguiente })} aria-label={abierta ? 'Contraer descripción' : 'Mostrar descripción completa'}>{abierta ? '−' : '+'}</button>}
                                   </div>
                                 )
                               })()}</td>
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
                              {formatearNumeroCompacto(m.monto, esBinance ? 8 : 2)} {m.tipo_moneda}
                            </td>
                            {mostrarDiferencialCambio && <>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{formatearValorTrm(m.trm)}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{m.monto_equivalente != null ? formatearPesos(m.monto_equivalente) : '—'}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{m.valor_trm != null ? formatearPesos(m.valor_trm) : '—'}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{m.diferencia_cambio != null ? formatearPesos(m.diferencia_cambio) : '—'}</td>
                            </>}
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

            <p className="text-xs text-muted-foreground mt-4">
              El saldo inicial de cada moneda se reconstruye desde su saldo almacenado, para que
              al filtrar por un mes intermedio sea el real y no un promedio con el saldo de hoy.
              El saldo por fila se deduce hacia atrás desde el saldo final.
            </p>
          </>
        )}
      </div>

      <ImportarWalletModal
        isOpen={importarAbierto}
        onClose={() => setImportarAbierto(false)}
        empresaId={empresaId}
        walletId={walletId}
        walletProveedor={wallet.proveedor_nombre}
        walletNombre={wallet.nombre_wallet}
        onSuccess={alImportar}
      />

      <ConfirmDialog
        open={confirmarBorradoImport}
        onOpenChange={(abierto) => !abierto && setConfirmarBorradoImport(false)}
        title="¿Borrar la última importación?"
        description={`Se eliminarán ${ultimaImportacion?.movimientos_vivos ?? 0} movimiento(s) creados por el último archivo importado. Los movimientos manuales y de otros archivos se conservarán.`}
        onConfirm={() => eliminarImportacion()}
        isLoading={borrandoImportacion}
        actionText="Borrar importación"
      />

      <ConfirmDialog
        open={confirmarBorradoDatos}
        onOpenChange={(abierto) => !abierto && setConfirmarBorradoDatos(false)}
        title="¿Borrar todos los datos de la wallet?"
        description={`Se eliminarán los ${movimientos.length} movimiento(s) de esta wallet, y el saldo quedará en cero. La wallet, su proveedor y su dirección se conservan. Úsalo para rehacer pruebas o reimportar un extracto desde cero; los archivos ya importados dejarán de estar enlazados, así que una reimportación futura volverá a crear sus movimientos como nuevos.`}
        onConfirm={() => eliminarDatos()}
        isLoading={borrandoDatos}
        actionText="Borrar todos los datos"
      />

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
