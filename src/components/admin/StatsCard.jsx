import { Card } from '@/components/ui/card'
import { formatearNumero, formatearPorcentaje } from '@/lib/admin-utils'

/**
 * Tarjeta de estadísticas para el dashboard admin
 */
export default function StatsCard({ icono: Icono, label, valor, subtexto, trending }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{formatearNumero(valor)}</p>
          {subtexto && (
            <p className="text-xs text-muted-foreground">{subtexto}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {Icono && (
            <div className="rounded-lg bg-primary/10 p-2">
              <Icono className="h-5 w-5 text-primary" />
            </div>
          )}
          {trending && (
            <div className={`text-xs font-medium ${trending > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trending > 0 ? '↑' : '↓'} {formatearPorcentaje(Math.abs(trending))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
