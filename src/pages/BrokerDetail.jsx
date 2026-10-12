import { useState, useMemo, useEffect } from 'react'
import ImportarBrokerModal from '@/components/ImportarBrokerModal'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { etiquetaTipoActivo } from '@/lib/brokers'
import {
  obtenerBroker,
  listarMovimientosBroker,
  listarActivos,
  listarPrecios,
  solicitarActualizacionPrecios,
  obtenerEstadoActualizacionPrecios,
  borrarMovimientoBroker,
  borrarActivo,
  calcularTotalesBroker,
  obtenerUltimaImportacion,
  borrarUltimaImportacion,
} from '@/lib/brokers-datos'
import { getMesesDisponibles, filtrarPorMes, formatMes, MES_TODOS } from '@/components/shared/MonthFilter'
import MonthFilter from '@/components/shared/MonthFilter'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import ExportButtons from '@/components/ExportButtons'
import {
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react'

const PESTANAS = [
  { id: 'movimientos', etiqueta: 'Movimientos' },
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'precios', etiqueta: 'Precios' },
  { id: 'asesor', etiqueta: 'Asesor' },
]

function esQuotex(broker) {
  return broker?.nombre_broker?.trim().toLowerCase() === 'quotex'
}

function clasificarMovimientoQuotex(movimiento) {
  const texto = String(movimiento.descripcion ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(ganancia|ganancias|ganancia neta|profit|winning|win|resultado positivo)\b/.test(texto)) return 'ganancias'
  if (/\b(perdida|perdidas|loss|losing|resultado negativo)\b/.test(texto)) return 'perdidas'
  if (/\b(retiro|retiros|retirada|withdrawal|withdraw|cash out|payout)\b/.test(texto)) return 'retiros'
  if (/\b(deposito|depositos|deposit|recarga|recarg|funding|deposited)\b/.test(texto)) return 'depositos'
  return null
}

const POR_PAGINA = 20

/**
 * Fecha en 'YYYY-MM-DD' para mostrar.
 *
 * PostgreSQL devuelve las columnas `date` y `timestamptz` como objetos `Date`
 * (o como ISO con hora), así que no basta un `slice`: hay que leer los
 * componentes y quedarse solo con el día. Se usan los getters UTC porque el
 * driver serializa en UTC y usar los locales desplazaría un día en zonas al
 * oeste de Greenwich (Colombia, UTC−5).
 */
function formatearFecha(fecha) {
  if (!fecha) return '—'

  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return '—'
    const dosDigitos = (n) => String(n).padStart(2, '0')
    return `${fecha.getUTCFullYear()}-${dosDigitos(fecha.getUTCMonth() + 1)}-${dosDigitos(fecha.getUTCDate())}`
  }

  const texto = String(fecha)
  // 'YYYY-MM-DD...' → se queda con los diez primeros caracteres.
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10)

  const parseada = new Date(texto)
  if (Number.isNaN(parseada.getTime())) return texto

  const dosDigitos = (n) => String(n).padStart(2, '0')
  return `${parseada.getFullYear()}-${dosDigitos(parseada.getMonth() + 1)}-${dosDigitos(parseada.getDate())}`
}

/**
 * BrokerDetail: detalle de un broker con tres pestañas (PRD §5).
 *
 *   Movimientos → caja (depósito/retiro) y operaciones (compra/venta)
 *   Activos     → posiciones con su valor total
 *   Precios     → historial de `precios_activo`
 *
 * Semántica del PRD §5: `ingreso` es depósito **o venta**, y `egreso` es
 * retiro **o compra**. El signo del monto nunca distingue: el monto es siempre
 * positivo y lo que separa una caja de una operación es si trae `cantidad` y
 * `valor_unitario` (el CHECK de la 0003 obliga a que vengan juntos).
 *
 * La pestaña de precios no se autoactualiza: `precios_activo` no está en la
 * API local, y en esta versión la escribe la
 * worker de precios.
 */
export default function BrokerDetail() {
  const { empresaId, brokerId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pestana, setPestana] = useState('movimientos')
  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const [aBorrar, setABorrar] = useState(null) // { tipo, fila }
  const [importarAbierto, setImportarAbierto] = useState(false)
  const [confirmarBorradoImport, setConfirmarBorradoImport] = useState(false)
  const [actualizandoPrecios, setActualizandoPrecios] = useState(false)
  const [errorPrecios, setErrorPrecios] = useState('')

  const { data: broker, isLoading: cargandoBroker, error: errorBroker } = useQuery({
    queryKey: ['broker', brokerId],
    queryFn: () => obtenerBroker(brokerId),
  })

  const { data: movimientos = [], isLoading: cargandoMovs } = useQuery({
    queryKey: ['movimientos-broker', brokerId],
    queryFn: () => listarMovimientosBroker(brokerId),
  })

  const quotex = esQuotex(broker)

  // Si se cambia de broker en la misma vista, Quotex siempre empieza en Movimientos.
  useEffect(() => {
    if (quotex && pestana !== 'movimientos') setPestana('movimientos')
  }, [quotex, pestana])

  const { data: activos = [], isLoading: cargandoActivos } = useQuery({
    queryKey: ['activos-broker', brokerId],
    queryFn: () => listarActivos(brokerId),
    enabled: !quotex,
  })

  const { data: precios = [], isLoading: cargandoPrecios } = useQuery({
    queryKey: ['precios-broker', brokerId],
    queryFn: () => listarPrecios(brokerId),
    // Solo se carga al abrir la pestaña: es un historial que crece sin límite
    // y no hace falta para pintar las otras dos.
    enabled: !quotex && pestana === 'precios',
  })

  // Última importación con filas vivas: habilita «Borrar última importación».
  const { data: ultimaImportacion } = useQuery({
    queryKey: ['ultima-importacion-broker', brokerId],
    queryFn: () => obtenerUltimaImportacion(empresaId, brokerId),
  })

  const meses = useMemo(() => getMesesDisponibles(movimientos), [movimientos])
  const movimientosFiltrados = useMemo(
    () => filtrarPorMes(movimientos, mes),
    [movimientos, mes]
  )

  const totalPaginas = Math.max(1, Math.ceil(movimientosFiltrados.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas - 1)
  const movsVisibles = movimientosFiltrados.slice(
    paginaSegura * POR_PAGINA,
    (paginaSegura + 1) * POR_PAGINA
  )

  // Quotex usa los movimientos como una cuenta de saldo: ingresos suman y egresos restan.
  const saldoQuotex = useMemo(() => {
    if (!quotex) return { porMovimiento: new Map(), actual: 0 }
    const ordenados = [...movimientos].sort((a, b) => {
      const fechaA = new Date(a.fecha).getTime()
      const fechaB = new Date(b.fecha).getTime()
      return fechaA - fechaB || Number(a.id || 0) - Number(b.id || 0)
    })
    let saldo = 0
    const porMovimiento = new Map()
    for (const movimiento of ordenados) {
      saldo += movimiento.tipo === 'ingreso' ? Number(movimiento.monto || 0) : -Number(movimiento.monto || 0)
      porMovimiento.set(movimiento.id, saldo)
    }
    return { porMovimiento, actual: saldo }
  }, [movimientos, quotex])

  // Caja y cartera del período elegido: es lo que responde «cuánto tengo»
  // mirando el mes seleccionado.
  const totales = useMemo(
    () => calcularTotalesBroker(movimientosFiltrados, activos),
    [movimientosFiltrados, activos]
  )

  // El rendimiento se calcula con TODOS los movimientos, no con los del mes.
  // Las posiciones son acumuladas: comparar el valor actual de la cartera
  // contra las compras de un solo mes daría una ganancia falsa (y enorme) en
  // cuanto el usuario filtra por mes.
  const rendimiento = useMemo(
    () => calcularTotalesBroker(movimientos, activos),
    [movimientos, activos]
  )

  const rendimientoPorMoneda = useMemo(
    () => new Map(rendimiento.map((r) => [r.moneda, r])),
    [rendimiento]
  )

  const quotexResumen = useMemo(() => {
    if (!quotex) return []
    const porMoneda = new Map([[String(broker?.moneda || 'N/A').toUpperCase(), {
      moneda: String(broker?.moneda || 'N/A').toUpperCase(), ganancias: 0, perdidas: 0, retiros: 0, depositos: 0,
    }]])
    for (const movimiento of movimientos) {
      const categoria = clasificarMovimientoQuotex(movimiento)
      if (!categoria) continue
      const moneda = String(movimiento.broker_moneda || broker?.moneda || 'N/A').toUpperCase()
      if (!porMoneda.has(moneda)) porMoneda.set(moneda, { moneda, ganancias: 0, perdidas: 0, retiros: 0, depositos: 0 })
      porMoneda.get(moneda)[categoria] += Number(movimiento.monto || 0)
    }
    return [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda))
  }, [broker, movimientos, quotex])

  const refrescarImportacion = () => {
    queryClient.invalidateQueries({ queryKey: ['movimientos-broker', brokerId] })
    queryClient.invalidateQueries({ queryKey: ['activos-broker', brokerId] })
    queryClient.invalidateQueries({ queryKey: ['ultima-importacion-broker', brokerId] })
  }

  const { mutate: eliminar, isPending: borrando } = useMutation({
    mutationFn: async ({ tipo, fila }) => {
      if (tipo === 'movimiento') await borrarMovimientoBroker(empresaId, brokerId, fila.id)
      else await borrarActivo(empresaId, brokerId, fila.id)
    },
    onSuccess: () => {
      setABorrar(null)
      refrescarImportacion()
    },
  })

  const { mutate: eliminarImportacion, isPending: borrandoImportacion } = useMutation({
    mutationFn: () => borrarUltimaImportacion(empresaId, brokerId),
    onSuccess: () => {
      setConfirmarBorradoImport(false)
      refrescarImportacion()
    },
  })

  const actualizarPreciosAhora = async () => {
    if (actualizandoPrecios) return
    setActualizandoPrecios(true)
    setErrorPrecios('')
    try {
      const { job } = await solicitarActualizacionPrecios(empresaId, brokerId)
      let intentos = 0
      while (intentos < 120) {
        const estado = await obtenerEstadoActualizacionPrecios(empresaId, job.id)
        if (estado.estado === 'hecho') {
          await queryClient.invalidateQueries({ queryKey: ['precios-broker', brokerId] })
          await queryClient.invalidateQueries({ queryKey: ['activos-broker', brokerId] })
          return
        }
        if (estado.estado === 'error') throw new Error(estado.error_mensaje || 'No se pudieron actualizar los precios.')
        intentos += 1
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      throw new Error('La actualización está tardando más de lo esperado. Puedes revisar los precios en unos minutos.')
    } catch (error) {
      setErrorPrecios(error.message || 'No se pudieron actualizar los precios.')
    } finally {
      setActualizandoPrecios(false)
    }
  }

  if (cargandoBroker) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (errorBroker || !broker) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">{errorBroker?.message ?? 'Broker no encontrado'}</p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/brokers`)} variant="outline">
          Volver a brokers
        </Button>
      </div>
    )
  }

  const periodo = mes === MES_TODOS ? 'acumulado' : formatMes(mes)

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/empresa/${empresaId}/brokers`)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Volver"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{broker.nombre_broker}</h1>
                <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded">
                  caja {broker.moneda}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {quotex ? 'Solo movimientos • ' : `${activos.length} posición(es) • `}{movimientos.length} movimiento(s)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(broker.nombre_broker.trim().toLowerCase() === 'interactive brokers' || quotex) && (
              <Button
                variant="outline"
                onClick={() => setImportarAbierto(true)}
                className="gap-2"
              >
                Importar archivo
              </Button>
            )}
            {ultimaImportacion && (
              <Button
                variant="outline"
                onClick={() => setConfirmarBorradoImport(true)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Borrar última importación
              </Button>
            )}
            {!quotex && (
              <Button
                variant="outline"
                onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/activo`)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Activo
              </Button>
            )}
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/movimiento`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Movimiento
            </Button>
          </div>
        </div>

        {quotex && quotexResumen.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              ['ganancias', 'Ganancias', 'text-emerald-600'],
              ['perdidas', 'Pérdidas', 'text-rose-600'],
              ['retiros', 'Retiros', 'text-amber-600'],
              ['depositos', 'Depósitos', 'text-sky-600'],
            ].map(([clave, etiqueta, color]) => (
              <Card key={clave} className="p-4">
                <p className="text-xs text-muted-foreground">{etiqueta}</p>
                {quotexResumen.map((resumen) => (
                  <div key={resumen.moneda} className="mt-2 flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{resumen.moneda}</span>
                    <span className={`font-semibold ${color}`}>
                      {formatearMonto(resumen[clave], resumen.moneda)}
                    </span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}

        {/* Totales por moneda (D4: sin consolidar).
            La caja/cartera van en una tarjeta y el rendimiento en otra: son
            preguntas distintas («cuánto tengo» frente a «cuánto he ganado») y
            mezclarlas hacía que el número de ganancia pareciera salir de la
            resta equivocada. */}
        {!quotex && totales.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {totales.map((t) => {
              const r = rendimientoPorMoneda.get(t.moneda) ?? t
              return (
              <div key={t.moneda} className="space-y-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    {t.moneda} <span className="text-muted-foreground/70">({periodo})</span>
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Caja</span>
                      <span
                        className={`text-lg font-bold ${
                          t.caja >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatearMonto(t.caja, t.moneda)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Valor en activos</span>
                      <span className="text-sm font-medium">
                        {formatearMonto(t.valorActivos, t.moneda)}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Ganancia / Pérdida <span className="text-muted-foreground/70">(acumulado)</span>
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Invertido</span>
                      <span className="text-sm font-medium">
                        {formatearMonto(r.invertido, r.moneda)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Valor actual</span>
                      <span className="text-sm font-medium">
                        {formatearMonto(r.valorActivos, r.moneda)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between border-t pt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {r.ganancia >= 0 ? 'Ganancia' : 'Pérdida'}
                      </span>
                      <span
                        className={`text-lg font-bold ${
                          r.ganancia >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {r.ganancia >= 0 ? '▲' : '▼'} {formatearMonto(Math.abs(r.ganancia), r.moneda)}
                        {r.gananciaPct != null && (
                          <span className="ml-1 text-sm font-medium">
                            ({r.gananciaPct >= 0 ? '+' : ''}
                            {r.gananciaPct.toFixed(2)} %)
                          </span>
                        )}
                      </span>
                    </div>
                    {r.comisiones > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Comisiones</span>
                        <span className="text-sm font-medium text-rose-600">
                          −{formatearMonto(r.comisiones, r.moneda)}
                        </span>
                      </div>
                    )}
                    {r.comisiones > 0 && (
                      <div className="flex items-baseline justify-between border-t pt-1.5">
                        <span className="text-xs text-muted-foreground">Resultado neto</span>
                        <span
                          className={`text-sm font-bold ${
                            r.gananciaConComisiones >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {formatearMonto(r.gananciaConComisiones, r.moneda)}
                          {r.gananciaConComisionesPct != null && (
                            <span className="ml-1 font-medium">
                              ({r.gananciaConComisionesPct >= 0 ? '+' : ''}
                              {r.gananciaConComisionesPct.toFixed(2)} %)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
              )
            })}
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-1 border-b mb-6">
          {PESTANAS.filter((p) => !quotex || p.id === 'movimientos').map((p) => (
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
              {p.id === 'activos' && activos.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({activos.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* ---- Movimientos ---- */}
        {pestana === 'movimientos' && (
          <>
            {quotex && quotexResumen.length > 0 && (
              <div className="mb-4 text-sm text-muted-foreground">
                Movimientos clasificados por descripción del extracto de Quotex.
              </div>
            )}
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

            {quotex && (
               <Card className="mb-4">
                 <div className="p-4 flex items-center justify-between">
                   <span className="text-sm text-muted-foreground">Saldo actual</span>
                   <span className={`text-xl font-bold ${saldoQuotex.actual >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {formatearMonto(saldoQuotex.actual, broker?.moneda)}
                   </span>
                 </div>
               </Card>
             )}
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
                      ? 'Sin movimientos. Registra un depósito, retiro, compra o venta.'
                      : `Sin movimientos en ${periodo}.`}
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <ExportButtons
                      datos={movsVisibles}
                      columnas={[
                        { key: 'fecha', label: 'Fecha' },
                        { key: 'descripcion', label: 'Descripción' },
                        { key: 'tipo_movimiento', label: 'Clase' },
                        { key: 'monto', label: 'Monto' },
                        { key: 'cantidad', label: 'Cantidad' },
                        { key: 'valor_unitario', label: 'Valor unit.' },
                      ]}
                      nombreArchivo={`movimientos_${broker.nombre_broker}`}
                      titulo={`Movimientos - ${broker.nombre_broker}`}
                      disabled={movsVisibles.length === 0}
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(`/empresa/${empresaId}/brokers/${brokerId}/movimiento`)
                      }
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Registrar movimiento
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Fecha</th>
                          <th className="text-left px-4 py-3 font-medium">Descripción</th>
                          <th className="text-left px-4 py-3 font-medium">Clase</th>
                          <th className="text-right px-4 py-3 font-medium">Monto</th>
                          <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                          {quotex
                             ? <th className="text-right px-4 py-3 font-medium">Saldo</th>
                             : <th className="text-right px-4 py-3 font-medium">Valor unit.</th>}
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {movsVisibles.map((m) => {
                          const esOperacion = m.cantidad != null
                          return (
                            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                {formatearFecha(m.fecha)}
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
                                  {m.tipo === 'ingreso'
                                    ? esOperacion
                                      ? (quotex ? 'Operación' : 'Venta')
                                      : 'Depósito'
                                    : esOperacion
                                      ? (quotex ? 'Operación' : 'Compra')
                                      : 'Retiro'}
                                </span>
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                                  m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {m.tipo === 'ingreso' ? '+' : '−'}
                                {formatearMonto(m.monto, m.broker_moneda)}
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                                {esOperacion ? Number(m.cantidad).toLocaleString('es-CO') : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                                {esOperacion
                                  ? (quotex ? formatearMonto(saldoQuotex.porMovimiento.get(m.id) || 0, m.broker_moneda) : formatearMonto(m.valor_unitario, m.broker_moneda))
                                  : '—'}
                              </td>
                              <td className="px-2 py-3">
                                <button
                                  onClick={() =>
                                    setABorrar({ tipo: 'movimiento', fila: m })
                                  }
                                  className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                                  title="Borrar movimiento"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
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
          </>
        )}

        {/* ---- Activos ---- */}
        {pestana === 'activos' && (
          <Card>
            {cargandoActivos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activos.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-4">Sin posiciones registradas</p>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/activo`)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Añadir activo
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-left px-4 py-3 font-medium">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                      <th className="text-right px-4 py-3 font-medium">Compra unit.</th>
                      <th className="text-right px-4 py-3 font-medium">Actual unit.</th>
                      <th className="text-right px-4 py-3 font-medium">Variación</th>
                      <th className="text-right px-4 py-3 font-medium">Valor actual</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {activos.map((a) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{a.nombre_activo}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-1 bg-muted rounded">
                            {etiquetaTipoActivo(a.tipo_activo)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {Number(a.cantidad).toLocaleString('es-CO')}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatearMonto(a.valor_compra_unitario, a.moneda)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatearMonto(a.valor_unitario, a.moneda)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${Number(a.variacion_unitaria) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {a.variacion_pct == null ? '—' : `${Number(a.variacion_unitaria) >= 0 ? '▲' : '▼'} ${Number(a.variacion_pct).toFixed(2)} % (${formatearMonto(a.variacion_total, a.moneda)})`}
                        </td>
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                          {formatearMonto(a.valor_total, a.moneda)}
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setABorrar({ tipo: 'activo', fila: a })}
                            className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Borrar posición"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    {Object.entries(
                      activos.reduce((acc, a) => {
                        const m = a.moneda
                        acc[m] = (acc[m] ?? 0) + Number(a.valor_total ?? 0)
                        return acc
                      }, {})
                    ).map(([moneda, total]) => (
                      <tr key={moneda}>
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-medium">
                          Total en {moneda} (sin convertir)
                        </td>
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                          {formatearMonto(total, moneda)}
                        </td>
                        <td />
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-3 border-t flex gap-2 flex-wrap">
                <ExportButtons
                  datos={activos}
                  columnas={[
                    { key: 'nombre_activo', label: 'Activo' },
                    { key: 'tipo_activo', label: 'Tipo' },
                    { key: 'cantidad', label: 'Cantidad' },
                    { key: 'valor_unitario', label: 'Valor unit.' },
                    { key: 'valor_total', label: 'Valor total' },
                  ]}
                  nombreArchivo={`posiciones_${broker.nombre_broker}`}
                  titulo={`Posiciones - ${broker.nombre_broker}`}
                  disabled={activos.length === 0}
                />
                <Button
                  onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/activo`)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Añadir activo
                </Button>
                </div>
              </>
            )}
          </Card>
        )}

        {/* ---- Precios ---- */}
        {pestana === 'precios' && (
          <Card>
            {cargandoPrecios ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : precios.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-2">Sin historial de precios</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Puedes solicitar una actualización manual sin esperar al proceso diario.
                </p>
                <Button onClick={actualizarPreciosAhora} disabled={actualizandoPrecios} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${actualizandoPrecios ? 'animate-spin' : ''}`} />
                  {actualizandoPrecios ? 'Actualizando...' : 'Actualizar precios ahora'}
                </Button>
                {errorPrecios && <p className="text-sm text-destructive mt-3">{errorPrecios}</p>}
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Precios de mercado</p>
                    <p className="text-xs text-muted-foreground">Actualización manual disponible en cualquier momento.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {errorPrecios && <p className="text-sm text-destructive">{errorPrecios}</p>}
                    <Button variant="outline" onClick={actualizarPreciosAhora} disabled={actualizandoPrecios} className="gap-2">
                      <RefreshCw className={`w-4 h-4 ${actualizandoPrecios ? 'animate-spin' : ''}`} />
                      {actualizandoPrecios ? 'Actualizando...' : 'Actualizar precios'}
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-left px-4 py-3 font-medium">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium">Cierre</th>
                      <th className="text-right px-4 py-3 font-medium">Anterior</th>
                      <th className="text-right px-4 py-3 font-medium">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {precios.map((p) => {
                      const v = p.variacion_pct == null ? null : Number(p.variacion_pct)
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatearFecha(p.fecha)}
                          </td>
                          <td className="px-4 py-3 font-medium">{p.nombre_activo}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {etiquetaTipoActivo(p.tipo_activo)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {formatearMonto(p.precio_cierre, p.moneda)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {p.precio_anterior == null
                              ? '—'
                              : formatearMonto(p.precio_anterior, p.moneda)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                              v == null
                                ? 'text-muted-foreground'
                                : v >= 0
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                            }`}
                          >
                            {v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)} %`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t flex gap-2">
                <ExportButtons
                  datos={precios}
                  columnas={[
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'nombre_activo', label: 'Activo' },
                    { key: 'tipo_activo', label: 'Tipo' },
                    { key: 'precio_cierre', label: 'Cierre' },
                    { key: 'precio_anterior', label: 'Anterior' },
                    { key: 'variacion_pct', label: 'Variación %' },
                  ]}
                  nombreArchivo={`precios_${broker.nombre_broker}`}
                  titulo={`Histórico de precios - ${broker.nombre_broker}`}
                  disabled={precios.length === 0}
                />
              </div>
              </>
            )}
          </Card>
        )}

        {/* ---- Asesor ---- */}
        {pestana === 'asesor' && (
          <div className="space-y-4">
            <Card className="border-blue-200 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-900">Asesor informativo</h2>
              <p className="mt-1 text-sm text-blue-900">
                Análisis basado únicamente en los movimientos, activos y precios registrados en este broker. No envía órdenes ni se conecta a Interactive Brokers.
              </p>
            </Card>

            {rendimiento.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Aún no hay datos suficientes para generar un análisis.</p>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {rendimiento.map((r) => (
                  <Card key={r.moneda} className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold">Resumen {r.moneda}</h3>
                      <span className={`text-sm font-medium ${r.ganancia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {r.ganancia >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><p className="text-muted-foreground">Invertido</p><p className="mt-1 font-medium">{formatearMonto(r.invertido, r.moneda)}</p></div>
                      <div><p className="text-muted-foreground">Valor actual</p><p className="mt-1 font-medium">{formatearMonto(r.valorActivos, r.moneda)}</p></div>
                      <div><p className="text-muted-foreground">Ganancia / pérdida</p><p className={`mt-1 font-medium ${r.ganancia >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatearMonto(r.ganancia, r.moneda)}</p></div>
                      <div><p className="text-muted-foreground">Rentabilidad</p><p className={`mt-1 font-medium ${r.gananciaPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>{r.gananciaPct == null ? '—' : `${r.gananciaPct.toFixed(2)} %`}</p></div>
                    </div>
                    {r.comisiones > 0 && <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Comisiones registradas: {formatearMonto(r.comisiones, r.moneda)}. Se mantienen separadas del costo de inversión.</p>}
                  </Card>
                ))}
              </div>
            )}

            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Lectura del portafolio</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {activos.length === 0 && <li>No hay posiciones abiertas registradas.</li>}
                {activos.length > 0 && <li>Hay {activos.length} posición{activos.length === 1 ? '' : 'es'} abierta{activos.length === 1 ? '' : 's'} en este broker.</li>}
                {rendimiento.some((r) => r.ganancia < 0) && <li>Al menos una moneda presenta un resultado negativo frente al costo de las operaciones registradas.</li>}
                {rendimiento.every((r) => r.ganancia >= 0) && <li>Las monedas analizadas presentan un resultado no negativo frente al costo de las operaciones registradas.</li>}
                <li>Revisa periódicamente la distribución y actualiza los precios antes de tomar decisiones.</li>
              </ul>
            </Card>
          </div>
        )}
      </div>

      <ImportarBrokerModal
        isOpen={importarAbierto}
        onClose={() => setImportarAbierto(false)}
        brokerId={brokerId}
        empresaId={empresaId}
        nombreBroker={broker.nombre_broker}
        onSuccess={refrescarImportacion}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title={
          aBorrar?.tipo === 'activo'
            ? `¿Borrar la posición en ${aBorrar?.fila?.nombre_activo}?`
            : '¿Borrar este movimiento?'
        }
        description={
          aBorrar?.tipo === 'activo'
            ? 'Dejará de contar en el valor de la cartera. El historial de precios no se toca.'
            : `«${aBorrar?.fila?.descripcion}» del ${formatearFecha(aBorrar?.fila?.fecha)}.`
        }
        onConfirm={() => eliminar(aBorrar)}
        isLoading={borrando}
      />

      <ConfirmDialog
        open={confirmarBorradoImport}
        onOpenChange={(abierto) => !abierto && setConfirmarBorradoImport(false)}
        title="¿Borrar la última importación?"
        description={`Se eliminarán los ${ultimaImportacion?.movimientos_vivos ?? 0} movimiento(s) y ${ultimaImportacion?.activos_vivos ?? 0} posición(es) creados por la última importación. El historial de precios no se toca.`}
        onConfirm={() => eliminarImportacion()}
        isLoading={borrandoImportacion}
        actionText="Borrar importación"
      />
    </div>
  )
}
