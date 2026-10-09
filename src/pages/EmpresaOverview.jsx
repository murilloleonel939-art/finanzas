import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { obtenerEmpresa, obtenerResumenEmpresa } from '@/lib/empresas-usuario'
import { formatearMonto } from '@/lib/monedas'
import { Card } from '@/components/ui/card'
import { Building2, TrendingUp, Loader2 } from 'lucide-react'

/**
 * EmpresaOverview: resumen financiero de la empresa.
 * Muestra subtotales por moneda sin conversión (decisión D4).
 * Las vistas que se consultan traen los nombres resueltos (D8).
 */
export default function EmpresaOverview() {
  const { empresaId } = useParams()

  // Obtener empresa
  const { data: empresa, isLoading: cargandoEmpresa } = useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: () => obtenerEmpresa(empresaId),
  })

  // Obtener resumen financiero
  const { data: totales = [], isLoading: cargandoTotales } = useQuery({
    queryKey: ['resumen-empresa', empresaId],
    queryFn: () => obtenerResumenEmpresa(empresaId),
  })

  const isLoading = cargandoEmpresa || cargandoTotales

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">{empresa?.nombre}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Resumen financiero • {empresa?.pais || 'N/A'}
          </p>
        </div>

        {/* Subtotales por moneda */}
        {totales.length === 0 ? (
          <Card className="p-8 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No hay datos financieros registrados</p>
            <p className="text-xs text-muted-foreground">
              Comienza creando un banco, broker o proveedor de wallet e ingresa tus primeros movimientos.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {totales.map(({ moneda, monto }) => (
              <Card
                key={moneda}
                className="p-4 border-l-4"
                style={{
                  borderLeftColor: obtenerColorMoneda(moneda),
                }}
              >
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Saldo total
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {formatearMonto(monto, moneda)}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 bg-muted rounded">
                    {moneda}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Nota sobre no consolidación */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-900">
            <strong>Nota:</strong> Los totales se muestran por moneda sin conversión.
            No hay un total consolidado porque cada divisa tiene su propia tasa de cambio
            y no es posible sumarlas directamente (decisión D4).
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Retorna un color para cada moneda (para la barra lateral del card).
 */
function obtenerColorMoneda(moneda) {
  const colores = {
    USD: '#3b82f6', // azul
    EUR: '#8b5cf6', // púrpura
    COP: '#10b981', // verde
    MXN: '#f59e0b', // ámbar
    ARS: '#ef4444', // rojo
    BTC: '#f97316', // naranja
    ETH: '#6366f1', // índigo
    USDT: '#14b8a6', // teal
  }
  return colores[moneda] || '#6b7280' // gris por defecto
}
