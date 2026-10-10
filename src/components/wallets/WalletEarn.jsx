import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { resumenEarn, activosEarnPorMoneda, activosConSaldo, esMovimientoEarn } from '@/lib/earnConfig'
import { borrarMovimientoWallet, recalcularSaldosWallet } from '@/lib/wallets-datos'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import WalletEarnAssets from '@/components/wallets/WalletEarnAssets'
import { Loader2, Plus, Trash2, Sparkles, TrendingUp } from 'lucide-react'

/**
 * WalletEarn: pestaña Earn de una wallet (PRD §7 y §8.4-B.2).
 *
 * Solo se usa en la **variante B** (proveedores que NO son «todo es Earn»),
 * porque en la variante A la pantalla entera ya es Earn y una pestaña homónima
 * sería el mismo contenido dos veces.
 *
 * Las métricas salen de `resumenEarn()` (FASE 13), que aplica las definiciones
 * del PRD tal como quedaron al resolver su propia contradicción §8.2/§8.3:
 * invertido = egresos con «subscription», recompensas = ingresos con
 * «interest», redimido = ingresos con «redemption». «Intereses ganados» es una
 * métrica **distinta** de «recompensas»: usa el regex amplio (`esInteres`), que
 * incluye rendimiento/ganancia/yield. No son intercambiables y por eso las dos
 * aparecen etiquetadas.
 *
 * La tabla muestra **solo** los movimientos clasificados como Earn: un depósito
 * normal de la misma wallet no es una operación Earn y no debe contarse en
 * «Total invertido».
 */
export default function WalletEarn({
  empresaId,
  walletId,
  movimientos = [],
  proveedorNombre,
  monedaPrincipal,
  onBorrar,
  periodo,
}) {
  const queryClient = useQueryClient()

  // El clasificador aplica los dos mecanismos del PRD en orden: proveedor
  // «todo es Earn» primero, palabras clave después.
  const earn = useMemo(
    () => movimientos.filter((m) => esMovimientoEarn(m, proveedorNombre)),
    [movimientos, proveedorNombre]
  )

  const resumen = useMemo(() => resumenEarn(earn), [earn])

  const activos = useMemo(
    () => activosConSaldo(activosEarnPorMoneda(earn)),
    [earn]
  )

  const { mutate: eliminar, variables: borrandoId } = useMutation({
    // Borrar un movimiento deja `wallet_saldos` desviado: el saldo se deriva de
    // los movimientos, así que hay que recalcularlo en la misma operación. Es
    // el mismo orden que usa el módulo de cuentas (borrar → recalcular).
    mutationFn: async (id) => {
      await borrarMovimientoWallet(id)
      await recalcularSaldosWallet(walletId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
      queryClient.invalidateQueries({ queryKey: ['saldos-wallet', walletId] })
      onBorrar?.()
    },
  })

  return (
    <div className="space-y-6">
      {/* Métricas Earn del PRD §7 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total invertido</p>
          <p className="text-2xl font-bold">
            {formatearMonto(resumen.invertido, monedaPrincipal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Egresos con «subscription»</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total recompensas</p>
          <p className="text-2xl font-bold text-emerald-600">
            {formatearMonto(resumen.recompensas, monedaPrincipal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ingresos con «interest»</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Redimido</p>
          <p className="text-2xl font-bold">
            {formatearMonto(resumen.redimido, monedaPrincipal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ingresos con «redemption»</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-primary">
          <p className="text-xs text-muted-foreground mb-1">Salidas (neto)</p>
          <p
            className={`text-2xl font-bold ${
              resumen.salidasNetas >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {formatearMonto(resumen.salidasNetas, monedaPrincipal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            recompensas + redimido − invertido
          </p>
        </Card>
      </div>

      {/* Intereses ganados: métrica distinta de «recompensas» (regex amplio) */}
      <Card className="p-4 border-l-4 border-l-emerald-500">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">
              Intereses ganados ({periodo})
            </p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatearMonto(resumen.interesesGanados, monedaPrincipal)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Ingresos cuyo concepto coincide con interés, rendimiento, ganancia o yield. No es
              lo mismo que «Total recompensas»: aquel solo cuenta la palabra «interest».
            </p>
          </div>
        </div>
      </Card>

      {/* Activos por moneda */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Activos por moneda</h2>
        </div>
        <WalletEarnAssets activos={activos} monedaPrincipal={monedaPrincipal} />
      </div>

      {/* Movimientos Earn del período */}
      <Card>
        {earn.length === 0 ? (
          <div className="p-8 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">
              {movimientos.length === 0
                ? 'Esta wallet todavía no tiene movimientos.'
                : `Sin movimientos Earn en ${periodo}.`}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Un movimiento es Earn si el proveedor lo es por definición, o si su descripción
              menciona earn, subscription, interest, staking, savings, redemption o redeem.
            </p>
            <Button
              variant="outline"
              disabled
              className="gap-2"
              title="La importación de extractos llega en la FASE 17"
            >
              <Plus className="w-4 h-4" />
              Importar extracto (FASE 17)
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
                    <th className="text-left px-4 py-3 font-medium">Categoría</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-right px-4 py-3 font-medium">Monto</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {earn.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {m.fecha}
                      </td>
                      <td className="px-4 py-3">{m.descripcion}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary whitespace-nowrap">
                          {etiquetaCategoria(m.descripcion)}
                        </span>
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
                        {formatearMonto(m.monto, m.tipo_moneda)}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() => eliminar(m.id)}
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

            <div className="px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {resumen.total} movimiento(s) Earn de {movimientos.length} en {periodo}.
                {proveedorNombre && (
                  <> Clasificados con las reglas de Earn de «{proveedorNombre}».</>
                )}
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

/**
 * Etiqueta de la categoría Earn de una fila.
 *
 * Se muestra por qué una fila se clasificó como se clasificó (D20): si el
 * número de «Total invertido» no cuadra con lo que el usuario espera, la causa
 * más probable es una descripción que no menciona la palabra clave, y eso se ve
 * aquí en vez de tener que adivinarlo.
 */
function etiquetaCategoria(descripcion) {
  const d = String(descripcion ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (d.includes('subscription') || d.includes('suscripcion')) return 'Suscripción'
  if (d.includes('redemption') || d.includes('redeem') || d.includes('redencion')) return 'Redención'
  if (d.includes('interest') || d.includes('interes')) return 'Interés'
  if (d.includes('staking')) return 'Staking'
  if (d.includes('savings') || d.includes('ahorro')) return 'Savings'
  return 'Earn (otro)'
}
