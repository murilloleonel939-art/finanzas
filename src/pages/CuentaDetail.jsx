import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatearMonto } from '@/lib/monedas'
import { getMesesDisponibles, formatMes, filtrarPorMes } from '@/components/shared/MonthFilter'
import MonthFilter from '@/components/shared/MonthFilter'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * CuentaDetail: vista de una cuenta con tabla paginada de movimientos.
 * 
 * Componentes:
 *   - Header con nombre de cuenta y moneda
 *   - Stats: saldo actual, total ingreso/egreso, filtrados por mes
 *   - MonthFilter: selector de mes + rango de fechas
 *   - Tabla: movimientos con paginación
 *   - Botones: crear movimiento manual, borrar cuenta
 */
export default function CuentaDetail() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()

  const [mesFiltro, setMesFiltro] = useState('')
  const [paginaActual, setPaginaActual] = useState(0)
  const ITEMS_POR_PAGINA = 20

  // Obtener cuenta
  const { data: cuenta, isLoading: cargandoCuenta } = useQuery({
    queryKey: ['cuenta', cuentaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, numero_cuenta, tipo_cuenta, tipo_moneda, saldo_actual, banco_id, empresa_id')
        .eq('id', cuentaId)
        .single()

      if (error) throw error
      return data
    },
  })

  // Obtener banco
  const { data: banco } = useQuery({
    queryKey: ['banco', cuenta?.banco_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, nombre_banco')
        .eq('id', cuenta.banco_id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!cuenta?.banco_id,
  })

  // Obtener todos los movimientos de la cuenta (sin paginación, para filtrar por mes)
  const { data: movimientosCompleto = [], isLoading: cargandoMovimientos } = useQuery({
    queryKey: ['movimientos-cuenta', cuentaId, mesFiltro],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos')
        .select('id, fecha, tipo, concepto, monto, saldo_resultante, descripcion')
        .eq('cuenta_id', cuentaId)
        .is('deleted_at', null)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!cuentaId,
  })

  // Obtener meses disponibles
  const mesesDisponibles = useMemo(() => {
    return getMesesDisponibles(movimientosCompleto, 'fecha')
  }, [movimientosCompleto])

  // Filtrar por mes
  const movimientosFiltrados = useMemo(() => {
    if (!mesFiltro) return movimientosCompleto
    return filtrarPorMes(movimientosCompleto, mesFiltro, 'fecha')
  }, [movimientosCompleto, mesFiltro])

  // Paginación
  const totalPaginas = Math.ceil(movimientosFiltrados.length / ITEMS_POR_PAGINA)
  const movimientosPaginados = movimientosFiltrados.slice(
    paginaActual * ITEMS_POR_PAGINA,
    (paginaActual + 1) * ITEMS_POR_PAGINA
  )

  // Stats (del mes filtrado)
  const stats = useMemo(() => {
    const ingresos = movimientosFiltrados
      .filter((m) => m.tipo === 'ingreso')
      .reduce((sum, m) => sum + parseFloat(m.monto || 0), 0)

    const egresos = movimientosFiltrados
      .filter((m) => m.tipo === 'egreso')
      .reduce((sum, m) => sum + parseFloat(m.monto || 0), 0)

    return {
      ingresos,
      egresos,
      neto: ingresos - egresos,
    }
  }, [movimientosFiltrados])

  const isLoading = cargandoCuenta || cargandoMovimientos

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cuenta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-600">Cuenta no encontrada</p>
        <Button onClick={() => navigate(`/empresa/${empresaId}`)} variant="outline">
          Volver
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}`)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold">{cuenta.numero_cuenta}</h1>
              <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded">
                {cuenta.tipo_moneda}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {banco?.nombre_banco || 'Banco'} • {cuenta.tipo_cuenta}
            </p>
          </div>
          <Button
            onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}/movimiento`)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Movimiento
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Saldo actual</p>
            <p className="text-2xl font-bold">
              {formatearMonto(cuenta.saldo_actual, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4 border-l-4 border-l-green-500">
            <p className="text-xs text-muted-foreground mb-1">Ingresos {mesFiltro ? `(${formatMes(mesFiltro)})` : ''}</p>
            <p className="text-2xl font-bold text-green-600">
              {formatearMonto(stats.ingresos, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4 border-l-4 border-l-red-500">
            <p className="text-xs text-muted-foreground mb-1">Egresos {mesFiltro ? `(${formatMes(mesFiltro)})` : ''}</p>
            <p className="text-2xl font-bold text-red-600">
              {formatearMonto(stats.egresos, cuenta.tipo_moneda)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Neto {mesFiltro ? `(${formatMes(mesFiltro)})` : ''}</p>
            <p className={`text-2xl font-bold ${stats.neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatearMonto(stats.neto, cuenta.tipo_moneda)}
            </p>
          </Card>
        </div>

        {/* MonthFilter */}
        <div className="mb-6">
          <MonthFilter
            meses={mesesDisponibles}
            mesFiltro={mesFiltro}
            onMesChange={setMesFiltro}
          />
        </div>

        {/* Tabla de movimientos */}
        <Card>
          {movimientosFiltrados.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">No hay movimientos en esta cuenta</p>
              <Button
                onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}/movimiento`)}
                variant="outline"
              >
                Crear movimiento
              </Button>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium">Concepto</th>
                      <th className="text-left px-4 py-3 font-medium">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium">Monto</th>
                      <th className="text-right px-4 py-3 font-medium">Saldo</th>
                      <th className="text-right px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosPaginados.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{m.fecha}</td>
                        <td className="px-4 py-3">{m.concepto || '-'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              m.tipo === 'ingreso'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {m.tipo === 'ingreso' ? '+' : '-'} {m.monto}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatearMonto(m.monto, cuenta.tipo_moneda)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatearMonto(m.saldo_resultante, cuenta.tipo_moneda)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="p-1 hover:bg-red-100 rounded text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Página {paginaActual + 1} de {totalPaginas} ({movimientosFiltrados.length} movimientos)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setPaginaActual(Math.max(0, paginaActual - 1))}
                      variant="outline"
                      size="sm"
                      disabled={paginaActual === 0}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => setPaginaActual(Math.min(totalPaginas - 1, paginaActual + 1))}
                      variant="outline"
                      size="sm"
                      disabled={paginaActual === totalPaginas - 1}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Botón borrar cuenta */}
        <div className="mt-8">
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm('¿Eliminar esta cuenta y todos sus movimientos?')) {
                // TODO: implementar borrado
              }
            }}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar cuenta
          </Button>
        </div>
      </div>
    </div>
  )
}
