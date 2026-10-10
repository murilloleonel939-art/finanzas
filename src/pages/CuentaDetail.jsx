import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { nombrePais } from '@/lib/paises'
import {
  obtenerCuenta,
  listarMovimientos,
  borrarMovimiento,
  conSaldoResultante,
  resumenPeriodo,
} from '@/lib/cuentas'
import { getMesesDisponibles, filtrarPorMes, formatMes, MES_TODOS } from '@/components/shared/MonthFilter'
import MonthFilter from '@/components/shared/MonthFilter'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import ExportButtons from '@/components/ExportButtons'
import { prepararMovimientosExportacion } from '@/lib/exportUtils'
import {
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  ChevronLeft as Anterior,
  ChevronRight as Siguiente,
} from 'lucide-react'

const POR_PAGINA = 20

/**
 * CuentaDetail: detalle de una cuenta bancaria (PRD §4).
 *
 * Tarjetas: saldo actual, ingresos del período, egresos del período e
 * intereses/retenciones. Filtro por mes. Tabla paginada ordenada por `fecha` +
 * `orden`. Alta manual de movimientos y borrado con confirmación.
 *
 * El saldo por fila se reconstruye en `conSaldoResultante()`: el esquema no
 * guarda un saldo por movimiento (ojo: **no existe** la columna
 * `saldo_resultante`, la calcula el cliente a partir de `cuentas.monto`).
 */
export default function CuentaDetail() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const [movimientoABorrar, setMovimientoABorrar] = useState(null)

  const { data: cuenta, isLoading: cargandoCuenta, error: errorCuenta } = useQuery({
    queryKey: ['cuenta', cuentaId],
    queryFn: () => obtenerCuenta(cuentaId),
  })

  const { data: movimientos = [], isLoading: cargandoMovs, error: errorMovs } = useQuery({
    queryKey: ['movimientos', cuentaId],
    queryFn: () => listarMovimientos(cuentaId),
  })

  const meses = useMemo(() => getMesesDisponibles(movimientos), [movimientos])

  // Al cambiar de mes se vuelve a la primera página: si no, quedarse en la
  // página 5 de un mes de 3 movimientos mostraría una tabla vacía.
  const cambiarMes = (nuevo) => {
    setMes(nuevo)
    setPagina(0)
  }

  const filtrados = useMemo(() => filtrarPorMes(movimientos, mes), [movimientos, mes])

  const conSaldo = useMemo(
    () => conSaldoResultante(filtrados, cuenta?.monto ?? 0),
    [filtrados, cuenta?.monto]
  )

  const totalPaginas = Math.max(1, Math.ceil(conSaldo.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas - 1)
  const visibles = conSaldo.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA)

  const resumen = useMemo(() => resumenPeriodo(filtrados), [filtrados])

  const { mutate: eliminar, isPending: borrando } = useMutation({
    mutationFn: (mov) => borrarMovimiento(mov.id, cuentaId),
    onSuccess: () => {
      setMovimientoABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['movimientos', cuentaId] })
      queryClient.invalidateQueries({ queryKey: ['cuenta', cuentaId] })
    },
  })

  const cargando = cargandoCuenta || cargandoMovs
  const error = errorCuenta || errorMovs

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !cuenta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">
          {error?.message ?? 'Cuenta no encontrada'}
        </p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/bancos`)} variant="outline">
          Volver a bancos
        </Button>
      </div>
    )
  }

  const periodo = mes === MES_TODOS ? 'acumulado' : formatMes(mes)

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Volver"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{cuenta.numero_cuenta}</h1>
                <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded">
                  {cuenta.tipo_moneda}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {cuenta.banco_nombre}
                {cuenta.banco_pais ? ` • ${nombrePais(cuenta.banco_pais)}` : ''} •{' '}
                {cuenta.tipo_cuenta}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <ExportButtons
              datos={conSaldo}
              columnas={[
                { key: 'fecha', label: 'Fecha' },
                { key: 'descripcion', label: 'Descripción' },
                { key: 'tipo_movimiento', label: 'Tipo' },
                { key: 'monto', label: 'Monto' },
                { key: 'saldo_resultante', label: 'Saldo' },
              ]}
              nombreArchivo={`movimientos_${cuenta.numero_cuenta}_${periodo}`}
              titulo={`Movimientos - ${cuenta.numero_cuenta} (${periodo})`}
              disabled={conSaldo.length === 0}
            />
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}/movimiento`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Movimiento
            </Button>
          </div>
        </div>

        {/* Tarjetas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Saldo actual</p>
            <p className="text-2xl font-bold">
              {formatearMonto(cuenta.monto, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4 border-l-4 border-l-emerald-500">
            <p className="text-xs text-muted-foreground mb-1">Ingresos ({periodo})</p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatearMonto(resumen.ingresos, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4 border-l-4 border-l-rose-500">
            <p className="text-xs text-muted-foreground mb-1">Egresos ({periodo})</p>
            <p className="text-2xl font-bold text-rose-600">
              {formatearMonto(resumen.egresos, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Neto ({periodo})</p>
            <p
              className={`text-2xl font-bold ${
                resumen.neto >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatearMonto(resumen.neto, cuenta.tipo_moneda)}
            </p>
          </Card>
        </div>

        {/* Intereses y retenciones: el PRD §4 los pide aparte del neto. */}
        {(resumen.intereses > 0 || resumen.retenciones > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Intereses del período ({periodo})
              </p>
              <p className="text-lg font-semibold">
                {formatearMonto(resumen.intereses, cuenta.tipo_moneda)}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Retenciones e impuestos ({periodo})
              </p>
              <p className="text-lg font-semibold">
                {formatearMonto(resumen.retenciones, cuenta.tipo_moneda)}
              </p>
            </Card>
          </div>
        )}

        {/* Filtro de mes */}
        <div className="mb-6">
          <MonthFilter
            meses={meses}
            value={mes}
            onChange={cambiarMes}
            label="Período"
          />
        </div>

        {/* Tabla */}
        <Card>
          {conSaldo.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                {movimientos.length === 0
                  ? 'Esta cuenta todavía no tiene movimientos.'
                  : `Sin movimientos en ${periodo}.`}
              </p>
              <Button
                onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}/movimiento`)}
                variant="outline"
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
                    {visibles.map((m) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {m.fecha}
                        </td>
                        <td className="px-4 py-3">
                          {m.descripcion}
                          {m.external_id && (
                            <span className="ml-2 text-xs text-muted-foreground" title="Importado">
                              ⤓
                            </span>
                          )}
                        </td>
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
                          {formatearMonto(m.monto, cuenta.tipo_moneda)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatearMonto(m.saldo_resultante, cuenta.tipo_moneda)}
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setMovimientoABorrar(m)}
                            className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Borrar movimiento"
                          >
                            <Trash2 className="w-4 h-4" />
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
                    Página {paginaSegura + 1} de {totalPaginas} • {conSaldo.length} movimientos
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                      variant="outline"
                      size="sm"
                      disabled={paginaSegura === 0}
                      className="gap-1"
                    >
                      <Anterior className="w-4 h-4" />
                      Anterior
                    </Button>
                    <Button
                      onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                      variant="outline"
                      size="sm"
                      disabled={paginaSegura >= totalPaginas - 1}
                      className="gap-1"
                    >
                      Siguiente
                      <Siguiente className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!movimientoABorrar}
        onOpenChange={(abierto) => !abierto && setMovimientoABorrar(null)}
        title="¿Borrar este movimiento?"
        description={
          movimientoABorrar
            ? `«${movimientoABorrar.descripcion}» del ${movimientoABorrar.fecha}. El saldo de la cuenta se recalculará.`
            : ''
        }
        onConfirm={() => eliminar(movimientoABorrar)}
        isLoading={borrando}
      />
    </div>
  )
}
