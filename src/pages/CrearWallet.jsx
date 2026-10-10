import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { crearWallet } from '@/lib/wallets-datos'
import { MONEDAS_CRIPTO, MONEDAS_FIAT, MONEDA_DEFECTO, moneda as infoMoneda } from '@/lib/monedas'
import { obtenerProveedor } from '@/lib/wallets-datos'
import { hoyLocal } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft, Plus, Trash2 } from 'lucide-react'

/**
 * CrearWallet: alta de una wallet dentro de un proveedor (PRD §6).
 *
 * Columnas reales de `wallets` (migración 0004): `proveedor_id`, `tipo`
 * (denormalizado del proveedor), `nombre_wallet`, `direccion`, `tipo_moneda`.
 * **No hay `monto`**: el saldo no es escalar (D12), vive en `wallet_saldos` con
 * una fila por moneda. Por eso este formulario no pide «saldo inicial» sino una
 * lista de (moneda, monto): una wallet cripto puede abrir con 0.5 BTC y 200
 * USDT a la vez, y un campo escalar no lo puede expresar.
 *
 * `tipo` se copia del proveedor y se congela en la wallet. Es el único campo
 * denormalizado que el esquema conserva a propósito: si mañana el proveedor
 * cambiara de tipo, las wallets históricas no deberían reinterpretarse.
 *
 * El saldo inicial se guarda en `wallet_saldos` **y** se crea un movimiento de
 * apertura por moneda, para que el saldo tenga una fila que lo explique. Sin
 * ese movimiento, `recalcularSaldosWallet()` —que deriva el saldo de los
 * movimientos— borraría el saldo inicial en cuanto se tocara la wallet.
 */
export default function CrearWallet() {
  const { empresaId, proveedorId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tipoMoneda, setTipoMoneda] = useState(MONEDA_DEFECTO.wallet)
  // Filas de saldo inicial. Se arranca con una vacía para que el caso normal
  // (una sola moneda) no obligue a pulsar «añadir».
  const [saldos, setSaldos] = useState([{ moneda: MONEDA_DEFECTO.wallet, monto: '' }])
  const [error, setError] = useState('')

  const { data: proveedor, isLoading } = useQuery({
    queryKey: ['proveedor-wallet', proveedorId],
    queryFn: () => obtenerProveedor(proveedorId),
  })

  const { mutate: crear, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!nombre.trim()) throw new Error('La etiqueta de la wallet es obligatoria.')

      const limpias = saldos
        .filter((s) => s.moneda && String(s.monto).trim() !== '')
        .map((s) => ({ moneda: s.moneda, monto: Number(s.monto) }))

      for (const s of limpias) {
        if (Number.isNaN(s.monto) || s.monto < 0) {
          throw new Error(`El saldo inicial en ${s.moneda} debe ser un número igual o mayor que cero.`)
        }
      }

      // Dos filas con la misma moneda chocarían contra la PK (wallet_id,
      // moneda) con un 23505 opaco. Mejor decirlo antes.
      const monedas = limpias.map((s) => s.moneda)
      if (new Set(monedas).size !== monedas.length) {
        throw new Error('Hay dos filas con la misma moneda. Cada moneda solo puede aparecer una vez.')
      }

      await crearWallet({
        empresaId,
        proveedorId,
        // `tipo` de la wallet = el del proveedor, congelado (0004).
        tipoProveedor: proveedor.tipo,
        nombreWallet: nombre.trim(),
        direccion,
        tipoMoneda,
        saldos: limpias,
        // `hoyLocal()` y no `toISOString()`: en Colombia, un alta de después de
        // las 19:00 nacería con la fecha de mañana (D26).
        fechaApertura: hoyLocal(),
        userId: user?.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores-wallet', empresaId] })
      queryClient.invalidateQueries({ queryKey: ['wallets-empresa', empresaId] })
      queryClient.invalidateQueries({ queryKey: ['wallets-proveedor', proveedorId] })
      navigate(`/empresa/${empresaId}/wallets`)
    },
    onError: (err) => setError(err.message),
  })

  const actualizarFila = (indice, campo, valor) => {
    setSaldos((prev) => prev.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)))
  }

  const monedas = proveedor?.tipo === 'fiat' ? MONEDAS_FIAT : [...MONEDAS_CRIPTO, ...MONEDAS_FIAT]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!proveedor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">Proveedor no encontrado</p>
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
            onClick={() => navigate(`/empresa/${empresaId}/wallets`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nueva wallet</h1>
            <p className="text-sm text-muted-foreground">
              {proveedor.nombre_proveedor} • tipo {proveedor.tipo}
            </p>
          </div>
        </div>

        <Card className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              crear()
            }}
            className="space-y-6"
          >
            <div>
              <Label htmlFor="nombre">Etiqueta *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Cómo la reconoces tú. No es la dirección: puede haber varias wallets del
                mismo proveedor.
              </p>
              <Input
                id="nombre"
                placeholder="Ej: Wallet principal, Cuenta de ahorro, Spot"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="direccion">Dirección</Label>
              <p className="text-xs text-muted-foreground mb-2">
                La address cripto, o el email/número si el proveedor es fiat. Opcional.
              </p>
              <Input
                id="direccion"
                placeholder="0x… / usuario@correo.com / 3001234567"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="tipo-moneda">Moneda principal *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                La divisa con la que se lee esta wallet en los listados. Los movimientos
                llevan la suya propia, fila a fila: esta no la impone.
              </p>
              <Select value={tipoMoneda} onValueChange={setTipoMoneda}>
                <SelectTrigger id="tipo-moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monedas.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.codigo} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Saldo inicial, una fila por moneda (D12) */}
            <div>
              <Label>Saldo inicial</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Una fila por moneda, porque una wallet puede tener saldo en varias a la vez
                (BTC + USDT). Se crea un movimiento de apertura por cada una. Puedes dejar
                todo en cero y registrarlo después.
              </p>

              <div className="space-y-2">
                {saldos.map((fila, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={fila.moneda}
                      onValueChange={(v) => actualizarFila(i, 'moneda', v)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monedas.map((m) => (
                          <SelectItem key={m.codigo} value={m.codigo}>
                            {m.codigo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.00000001"
                      placeholder="0.00"
                      value={fila.monto}
                      onChange={(e) => actualizarFila(i, 'monto', e.target.value)}
                    />

                    <button
                      type="button"
                      onClick={() => setSaldos((prev) => prev.filter((_, j) => j !== i))}
                      disabled={saldos.length === 1}
                      className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Quitar moneda"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 gap-2 text-primary"
                onClick={() =>
                  setSaldos((prev) => [...prev, { moneda: MONEDA_DEFECTO.wallet, monto: '' }])
                }
              >
                <Plus className="w-3 h-3" />
                Añadir moneda
              </Button>
            </div>

            {/* Resumen de lo que se va a crear */}
            {nombre.trim() && (
              <div className="p-3 bg-muted/50 border rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Se creará</p>
                <p className="text-sm font-medium">
                  {nombre.trim()}{' '}
                  <span className="text-muted-foreground">
                    — {proveedor.nombre_proveedor} ({proveedor.tipo})
                  </span>
                </p>
                {saldos.some((s) => String(s.monto).trim() !== '' && Number(s.monto) > 0) && (
                  <ul className="mt-2 space-y-0.5">
                    {saldos
                      .filter((s) => Number(s.monto) > 0)
                      .map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          Saldo inicial: {s.monto} {s.moneda} (
                          {infoMoneda(s.moneda)?.nombre})
                        </li>
                      ))}
                  </ul>
                )}
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
                onClick={() => navigate(`/empresa/${empresaId}/wallets`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !nombre.trim()}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear wallet
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
