import { formatearMonto } from '@/lib/monedas'
import { Card } from '@/components/ui/card'
import { Layers } from 'lucide-react'

/**
 * WalletEarnAssets: activos por moneda de una wallet (PRD §7).
 *
 * Una línea por moneda y **sin total consolidado** (D4): 0.5 BTC y 200 USDT no
 * se suman, porque el resultado no sería ninguna cantidad de nada. Es la razón
 * de que esta tabla exista en vez de una tarjeta con un número.
 *
 * Las cuatro cifras vienen de sitios distintos y por eso se etiquetan:
 *
 *   Saldo       `invertido - redimido`, o el saldo real si la wallet lo tiene
 *   Invertido   egresos clasificados como suscripción
 *   Rendimiento ingresos con interés — **no se suma al saldo**: lo reporta el
 *               proveedor y el extracto ya lo refleja en sus redenciones, así
 *               que sumarlo aquí duplicaría capital
 *   Redimido    ingresos clasificados como redención
 *
 * «Solo activos con algún valor distinto de cero» (PRD §7): una moneda por la
 * que solo pasaron ceros se filtra en `activosConSaldo()`.
 */
export default function WalletEarnAssets({ activos = [], monedaPrincipal }) {
  if (activos.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Sin activos Earn en este período</p>
        <p className="text-xs text-muted-foreground mt-2">
          Aparecerán aquí las monedas con suscripciones, intereses o redenciones registradas.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Moneda</th>
              <th className="text-right px-4 py-3 font-medium">Saldo</th>
              <th className="text-right px-4 py-3 font-medium">Invertido</th>
              <th className="text-right px-4 py-3 font-medium">Rendimiento</th>
              <th className="text-right px-4 py-3 font-medium">Redimido</th>
              <th className="text-right px-4 py-3 font-medium">Movs.</th>
            </tr>
          </thead>
          <tbody>
            {activos.map((a) => (
              <tr key={a.moneda} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span className="font-medium">{a.moneda}</span>
                  {a.moneda === monedaPrincipal && (
                    <span className="ml-2 text-xs text-muted-foreground">principal</span>
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                    a.saldo >= 0 ? 'text-foreground' : 'text-rose-600'
                  }`}
                >
                  {formatearMonto(a.saldo, a.moneda)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                  {formatearMonto(a.invertido, a.moneda)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600 whitespace-nowrap">
                  {formatearMonto(a.rendimiento, a.moneda)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                  {formatearMonto(a.redimido, a.moneda)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {a.movimientos}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t bg-muted/20">
        <p className="text-xs text-muted-foreground">
          Sin total consolidado: cada moneda va en la suya y no se convierten entre sí (D4).
          El rendimiento se informa aparte a propósito y no se suma al saldo — el extracto ya
          lo refleja en sus propias redenciones, y sumarlo duplicaría capital.
        </p>
      </div>
    </Card>
  )
}
