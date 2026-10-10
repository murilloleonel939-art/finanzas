import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { etiquetaTipoActivo } from '@/lib/brokers'
import {
  obtenerBroker,
  listarMovimientosBroker,
  listarActivos,
  listarPrecios,
  borrarMovimientoBroker,
  borrarActivo,
  calcularTotalesBroker,
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
} from 'lucide-react'

const PESTANAS = [
  { id: 'movimientos', etiqueta: 'Movimientos' },
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'precios', etiqueta: 'Precios' },
]

const POR_PAGINA = 20

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
 * publicación de realtime (migración 0007), y en esta fase la escribe la
 * función de la FASE 18.
 */
export default function BrokerDetail() {
  const { empresaId, brokerId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pestana, setPestana] = useState('movimientos')
  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const [aBorrar, setABorrar] = useState(null) // { tipo, fila }

  const { data: broker, isLoading: cargandoBroker, error: errorBroker } = useQuery({
    queryKey: ['broker', brokerId],
    queryFn: () => obtenerBroker(brokerId),
  })

  const { data: movimientos = [], isLoading: cargandoMovs } = useQuery({
    queryKey: ['movimientos-broker', brokerId],
    queryFn: () => listarMovimientosBroker(brokerId),
  })

  const { data: activos = [], isLoading: cargandoActivos } = useQuery({
    queryKey: ['activos-broker', brokerId],
    queryFn: () => listarActivos(brokerId),
  })

  const { data: precios = [], isLoading: cargandoPrecios } = useQuery({
    queryKey: ['precios-broker', brokerId],
    queryFn: () => listarPrecios(brokerId),
    // Solo se carga al abrir la pestaña: es un historial que crece sin límite
    // y no hace falta para pintar las otras dos.
    enabled: pestana === 'precios',
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

  const totales = useMemo(
    () => calcularTotalesBroker(movimientosFiltrados, activos),
    [movimientosFiltrados, activos]
  )

  const { mutate: eliminar, isPending: borrando } = useMutation({
    mutationFn: async ({ tipo, fila }) => {
      if (tipo === 'movimiento') await borrarMovimientoBroker(fila.id)
      else await borrarActivo(fila.id)
    },
    onSuccess: () => {
      setABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['movimientos-broker', brokerId] })
      queryClient.invalidateQueries({ queryKey: ['activos-broker', brokerId] })
    },
  })

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
                {activos.length} posición(es) • {movimientos.length} movimiento(s)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/activo`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Activo
            </Button>
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}/movimiento`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Movimiento
            </Button>
          </div>
        </div>

        {/* Totales por moneda (D4: sin consolidar) */}
        {totales.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {totales.map((t) => (
              <Card key={t.moneda} className="p-4">
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
                  <div className="flex items-baseline justify-between border-t pt-1.5">
                    <span className="text-xs text-muted-foreground">Invertido</span>
                    <span className="text-sm font-medium">
                      {formatearMonto(t.invertido, t.moneda)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-1 border-b mb-6">
          {PESTANAS.map((p) => (
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
                          <th className="text-right px-4 py-3 font-medium">Valor unit.</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {movsVisibles.map((m) => {
                          const esOperacion = m.cantidad != null
                          return (
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
                                  {m.tipo === 'ingreso'
                                    ? esOperacion
                                      ? 'Venta'
                                      : 'Depósito'
                                    : esOperacion
                                      ? 'Compra'
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
                                  ? formatearMonto(m.valor_unitario, m.broker_moneda)
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-left px-4 py-3 font-medium">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                      <th className="text-right px-4 py-3 font-medium">Valor unit.</th>
                      <th className="text-right px-4 py-3 font-medium">Valor total</th>
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
                          {formatearMonto(a.valor_unitario, a.moneda)}
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
                <p className="text-xs text-muted-foreground">
                  Los precios los actualiza la función programada de la FASE 18.
                </p>
              </div>
            ) : (
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
                            {p.fecha}
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
      </div>

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
            : `«${aBorrar?.fila?.descripcion}» del ${aBorrar?.fila?.fecha}.`
        }
        onConfirm={() => eliminar(aBorrar)}
        isLoading={borrando}
      />
    </div>
  )
}
