import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { hoyLocal } from '@/lib/utils'
import { formatearMonto } from '@/lib/monedas'
import { obtenerBroker, crearMovimientoBroker } from '@/lib/brokers-datos'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearMovimientoBroker: alta de un movimiento en un broker (PRD §5).
 *
 * Dos naturalezas en la misma tabla `movimientos_broker` (migración 0003):
 *
 *   CAJA       → depósito (ingreso) o retiro (egreso). Solo monto.
 *   OPERACIÓN  → venta (ingreso) o compra (egreso). Monto + cantidad + valor_unitario.
 *
 * El CHECK `mov_broker_cantidad_valor_coherentes` exige que `cantidad` y
 * `valor_unitario` vengan **los dos** o **ninguno**: enviar solo uno hace
 * fallar el insert con un error de constraint que no explica nada. Por eso el
 * modo («caja» u «operación») es un campo explícito del formulario y no se
 * deduce de si el usuario rellenó un campo de más.
 *
 * `monto` es el absoluto en la divisa de la caja: en una operación es
 * cantidad × valor_unitario, y se calcula solo para no depender de que el
 * usuario lo escriba coherente.
 */
export default function CrearMovimientoBroker() {
  const { empresaId, brokerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const hoy = hoyLocal()

  const [modo, setModo] = useState('caja')
  const [operacion, setOperacion] = useState('compra')
  const [montoDireccion, setMontoDireccion] = useState('ingreso')
  const [fecha, setFecha] = useState(hoy)
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [error, setError] = useState('')

  const { data: broker, isLoading } = useQuery({
    queryKey: ['broker', brokerId],
    queryFn: () => obtenerBroker(brokerId),
  })

  // En una operación, el monto es el producto. Se calcula en vez de pedirlo:
  // dos campos que deben coincidir acaban discrepando.
  const montoOperacion = useMemo(() => {
    const c = Number(cantidad)
    const v = Number(valorUnitario)
    if (!cantidad || !valorUnitario || Number.isNaN(c) || Number.isNaN(v)) return null
    return Number((c * v).toFixed(8))
  }, [cantidad, valorUnitario])

  const esCaja = modo === 'caja'
  const tipo = esCaja
    ? (montoDireccion ?? 'ingreso')
    : operacion === 'venta'
      ? 'ingreso'
      : 'egreso'

  const { mutate: registrar, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!fecha) throw new Error('La fecha es obligatoria.')
      if (!descripcion.trim()) throw new Error('La descripción es obligatoria.')

      if (esCaja) {
        const m = Number(monto)
        if (!monto || Number.isNaN(m) || m <= 0) {
          throw new Error('El monto debe ser un número mayor que cero.')
        }
        await crearMovimientoBroker({
          empresaId,
          brokerId,
          fecha,
          descripcion: descripcion.trim(),
          tipo,
          monto: m,
          userId: user?.id,
        })
      } else {
        const c = Number(cantidad)
        const v = Number(valorUnitario)
        if (Number.isNaN(c) || c <= 0) throw new Error('La cantidad debe ser mayor que cero.')
        if (Number.isNaN(v) || v <= 0) {
          throw new Error('El valor unitario debe ser mayor que cero.')
        }
        await crearMovimientoBroker({
          empresaId,
          brokerId,
          fecha,
          descripcion: descripcion.trim(),
          tipo,
          monto: montoOperacion,
          cantidad: c,
          valorUnitario: v,
          userId: user?.id,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos-broker', brokerId] })
      navigate(`/empresa/${empresaId}/brokers/${brokerId}`)
    },
    onError: (err) => setError(err.message),
  })

  // Dirección del movimiento de caja (depósito o retiro)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!broker) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">Broker no encontrado</p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/brokers`)} variant="outline">
          Volver a brokers
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nuevo movimiento</h1>
            <p className="text-sm text-muted-foreground">
              {broker.nombre_broker} • caja en {broker.moneda}
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
            {/* Modo */}
            <div>
              <Label>Clase de movimiento *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { id: 'caja', titulo: 'Caja', detalle: 'Depósito o retiro de dinero' },
                  {
                    id: 'operacion',
                    titulo: 'Operación',
                    detalle: 'Compra o venta de un activo',
                  },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setModo(op.id)}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      modo === op.id
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <p className="text-sm font-medium">{op.titulo}</p>
                    <p className="text-xs text-muted-foreground">{op.detalle}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  id="fecha"
                  type="date"
                  className="mt-2"
                  value={fecha}
                  max={hoy}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              {/* Dirección: caja usa ingreso/egreso, operación usa compra/venta */}
              <div>
                <Label htmlFor="direccion">{esCaja ? 'Tipo' : 'Operación'} *</Label>
                {esCaja ? (
                  <Select value={montoDireccion} onValueChange={setMontoDireccion}>
                    <SelectTrigger id="direccion" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ingreso">Depósito (entra dinero)</SelectItem>
                      <SelectItem value="egreso">Retiro (sale dinero)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={operacion} onValueChange={setOperacion}>
                    <SelectTrigger id="direccion" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compra">Compra (sale dinero)</SelectItem>
                      <SelectItem value="venta">Venta (entra dinero)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="descripcion">Descripción *</Label>
              <Input
                id="descripcion"
                className="mt-2"
                placeholder={
                  esCaja ? 'Ej: Transferencia desde banco' : 'Ej: Compra de VOO'
                }
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            {/* Campos según el modo */}
            {esCaja ? (
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
                    step="0.01"
                    placeholder="0.00"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                  />
                  <span className="text-sm font-medium text-muted-foreground">
                    {broker.moneda}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cantidad">Cantidad *</Label>
                    <Input
                      id="cantidad"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="mt-2"
                      placeholder="0"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valor">Valor unitario *</Label>
                    <Input
                      id="valor"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="mt-2"
                      placeholder="0.00"
                      value={valorUnitario}
                      onChange={(e) => setValorUnitario(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">
                    Monto de la operación (cantidad × valor unitario)
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {montoOperacion == null
                      ? '—'
                      : formatearMonto(montoOperacion, broker.moneda)}
                  </p>
                </div>
              </>
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
                onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  isPending ||
                  !descripcion.trim() ||
                  (esCaja ? !monto : !montoOperacion)
                }
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
