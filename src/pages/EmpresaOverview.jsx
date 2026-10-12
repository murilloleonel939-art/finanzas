import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { obtenerEmpresa, obtenerResumenEmpresa } from '@/lib/empresas-usuario'
import { formatearMonto } from '@/lib/monedas'
import { Card } from '@/components/ui/card'
import { Building2, TrendingUp, Wallet, BriefcaseBusiness, Landmark, PieChart, Loader2 } from 'lucide-react'

export default function EmpresaOverview() {
  const { empresaId } = useParams()
  const { data: empresa, isLoading: cargandoEmpresa } = useQuery({
    queryKey: ['empresa', empresaId], queryFn: () => obtenerEmpresa(empresaId),
  })
  const { data: resumen = { totales: [], por_categoria: [], rendimientos: [] }, isLoading: cargandoResumen } = useQuery({
    queryKey: ['resumen-empresa', empresaId], queryFn: () => obtenerResumenEmpresa(empresaId),
  })

  if (cargandoEmpresa || cargandoResumen) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const porCategoria = resumen.por_categoria || []
  const rendimientos = resumen.rendimientos || []
  const categorias = [
    { id: 'cuentas', label: 'Cuentas bancarias', icon: Landmark, color: '#10b981' },
    { id: 'brokers', label: 'Brokers', icon: BriefcaseBusiness, color: '#3b82f6' },
    { id: 'wallets', label: 'Wallets', icon: Wallet, color: '#8b5cf6' },
  ]
  const obtenerMonto = (categoria, moneda) => porCategoria.find((item) => item.categoria === categoria && item.moneda === moneda)?.monto || 0
  const obtenerRendimiento = (moneda) => rendimientos.find((item) => item.moneda === moneda)?.monto || 0

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2"><Building2 className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold text-foreground">{empresa?.nombre}</h1></div>
          <p className="text-sm text-muted-foreground">Resumen financiero • {empresa?.pais || 'N/A'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {['COP', 'USD'].map((moneda) => {
            const total = resumen.totales?.find((item) => item.moneda === moneda)?.monto || 0
            return <Card key={moneda} className="p-5 border-l-4" style={{ borderLeftColor: obtenerColorMoneda(moneda) }}>
              <p className="text-sm text-muted-foreground">Patrimonio total en {moneda}</p>
              <p className="text-3xl font-bold mt-1">{formatearMonto(total, moneda)}</p>
              <p className="text-xs text-muted-foreground mt-2">Cuentas, brokers y wallets</p>
            </Card>
          })}
        </div>

        <div className="flex items-center gap-2 mb-3"><PieChart className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Dónde está concentrado el dinero</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {categorias.map(({ id, label, icon: Icon, color }) => <Card key={id} className="p-4 border-t-4" style={{ borderTopColor: color }}>
            <div className="flex items-center gap-2 mb-3"><Icon className="h-5 w-5" style={{ color }} /><span className="font-medium">{label}</span></div>
            {['COP', 'USD'].map((moneda) => {
              const monto = obtenerMonto(id, moneda)
              const totalMoneda = resumen.totales?.find((item) => item.moneda === moneda)?.monto || 0
              const porcentaje = totalMoneda > 0 ? Math.min(100, Math.max(0, (monto / totalMoneda) * 100)) : 0
              return <div key={moneda} className="py-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{moneda}</span><span className="font-semibold">{formatearMonto(monto, moneda)}</span></div>
                <div className="h-1.5 bg-muted rounded-full mt-1"><div className="h-1.5 rounded-full" style={{ width: `${porcentaje}%`, backgroundColor: color }} /></div>
              </div>
            })}
          </Card>)}
        </div>

        <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-semibold">Rendimientos e intereses acumulados</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {['COP', 'USD'].map((moneda) => <Card key={moneda} className="p-4"><p className="text-sm text-muted-foreground">Rendimientos en {moneda}</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatearMonto(obtenerRendimiento(moneda), moneda)}</p></Card>)}
        </div>

        {resumen.totales?.length === 0 && <Card className="p-8 text-center"><TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">No hay datos financieros registrados.</p></Card>}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md"><p className="text-xs text-blue-900"><strong>Nota:</strong> Los valores se muestran separados por moneda, sin conversión entre divisas.</p></div>
      </div>
    </div>
  )
}

function obtenerColorMoneda(moneda) {
  return { USD: '#3b82f6', COP: '#10b981' }[moneda] || '#6b7280'
}
