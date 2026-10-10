import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { formatearMonto, MONEDA_DEFECTO } from '@/lib/monedas'
import { hoyLocal } from '@/lib/utils'
import { crearMovimientoWallet, recalcularSaldosWallet, obtenerWallet } from '@/lib/wallets-datos'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearMovimientoWallet: alta manual de un movimiento en una wallet (PRD §6).
 *
 * Diferencias respecto a `CrearMovimiento` (bancario):
 *
 *   - La moneda va por fila (`tipo_moneda`), no es la de la cuenta. Una wallet
 *     cripto puede recibir BTC en un movimiento y USDT en el siguiente.
 *   - No hay `orden` de desempate dentro del día: `movimientos_wallet` no tiene
 *     esa columna. El desempate es `created_at`, que ya asigna Supabase.
 *   - Después de guardar se recalculan los saldos (`recalcularSaldosWallet`):
 *     `wallet_saldos` no se actualiza sola — es una tabla de valores que el
 *     código mantiene, igual que `cuentas.monto` lo mantiene
 *     `recalcularSaldoCuenta`.
 *   - `monto` sigue siendo siempre positivo (CHECK en la 0004): la dirección la
 *     da `tipo`, no el signo.
 */
export default function CrearMovimientoWallet() {
  const { empresaId, proveedorId, walletId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const hoy = hoyLocal()

  const [fecha, setFecha] = useState(hoy)
  const [tipo, setTipo] = useState('ingreso')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [tipoMoneda, setTipoMoneda] = useState(MONEDA_DEFECTO.wallet)
  const [error, setError] = useState('')

  const { data: wallet, isLoading } = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => obtenerWallet(walletId),
  })

  const { mutate: registrar, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!fecha) throw new Error('La fecha es obligatoria.')
      if (!descripcion.trim()) throw new Error('La descripción es obligatoria.')

      const montoNum = Number(monto)
      if (!monto || Number.isNaN(montoNum) || montoNum <= 0) {
        throw new Error('El monto debe ser un número mayor que cero.')
      }

      await crearMovimientoWallet({
        empresaId,
        proveedorId,
        walletId,
        fecha,
        descripcion: descripcion.trim(),
        tipo,
        monto: montoNum,
        tipoMoneda,
        userId: user?.id,
      })

      // El saldo se recalcula completamente: un incremento quedaría desviado
      // ante cualquier borrado posterior, y en esta app los extractos se
      // importan y se pueden re-importar.
      await recalcularSaldosWallet(walletId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos-wallet', walletId] })
      queryClient.invalidateQueries({ queryKey: ['saldos-wallet', walletId] })
      queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
      navigate(`/empresa/${empresaId}/wallets/proveedor/${proveedorId}/wallet/${walletId}`)
    },
    onError: (err) => setError(err.message),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">Wallet no encontrada</p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/wallets`)} variant="outline">
          Volver a wallets
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() =>
              navigate(
                `/empresa/${empresaId}/wallets/proveedor/${proveedorId}/wallet/${walletId}`
              )
            }
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nuevo movimiento</h1>
            <p className="text-sm text-muted-foreground">
              {wallet.proveedor_nombre} • {wallet.nombre_wallet}
            </p>
          </div>
        </div>

        <Card className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              registrar()
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  max={hoy}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="tipo">Tipo *</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger id="tipo" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso (depósito / recompensa)</SelectItem>
                    <SelectItem value="egreso">Egreso (retiro / suscripción)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="descripcion">Descripción *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                La clasificación Earn se deduce de este texto: «subscription», «interest»,
                «staking», «savings», «redemption», «redeem» (y variantes en español).
              </p>
              <Input
                id="descripcion"
                placeholder="Ej: Deposit, Earn Interest, Subscription, Redemption"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="monto">Monto *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Siempre positivo. La dirección la marca el tipo.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  id="monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.00000001"
                  placeholder="0.00000000"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
                <Select value={tipoMoneda} onValueChange={setTipoMoneda}>
                  <SelectTrigger className="w-28 flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['USD', 'USDT', 'BTC', 'ETH', 'BNB', 'USDC', 'COP', 'EUR'].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {monto && Number(monto) > 0 && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Movimiento a registrar</p>
                <p className="text-lg font-bold text-primary">
                  {tipo === 'ingreso' ? '+' : '−'}
                  {formatearMonto(Number(monto), tipoMoneda)}
                </p>
              </div>
            )}

            {error && (
              <div className="flex gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigate(
                    `/empresa/${empresaId}/wallets/proveedor/${proveedorId}/wallet/${walletId}`
                  )
                }
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !descripcion.trim() || !monto}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar movimiento
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
