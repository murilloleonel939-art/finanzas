import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { formatearMonto } from '@/lib/monedas'
import { obtenerCuenta, crearMovimiento, recalcularSaldoCuenta } from '@/lib/cuentas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearMovimiento: alta manual de un movimiento bancario (PRD §4).
 *
 * La columna de texto es `descripcion`, no `concepto`. Y no existe
 * `saldo_resultante`: el saldo se recalcula en `cuentas.monto` con
 * `recalcularSaldoCuenta()`, que suma todos los movimientos de la cuenta.
 *
 * Se recalcula en vez de incrementar porque con un incremento cualquier
 * borrado o edición posterior desviaría el saldo para siempre; recalcular
 * siempre converge y cuesta una consulta.
 *
 * El monto es siempre positivo (`CHECK monto >= 0` en la 0002): la dirección
 * la da `tipo`, nunca el signo.
 */
export default function CrearMovimiento() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const hoy = new Date().toISOString().slice(0, 10)

  const [fecha, setFecha] = useState(hoy)
  const [tipo, setTipo] = useState('ingreso')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')

  const { data: cuenta, isLoading } = useQuery({
    queryKey: ['cuenta', cuentaId],
    queryFn: () => obtenerCuenta(cuentaId),
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

      await crearMovimiento({
        empresaId,
        cuentaId,
        fecha,
        descripcion: descripcion.trim(),
        tipo,
        monto: montoNum,
        userId: user?.id,
      })

      // El saldo de la cuenta se deriva de sus movimientos.
      await recalcularSaldoCuenta(cuentaId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos', cuentaId] })
      queryClient.invalidateQueries({ queryKey: ['cuenta', cuentaId] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-empresa', empresaId] })
      navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)
    },
    onError: (err) => setError(err.message),
  })

  // Vista previa del saldo resultante
  const previsualizacion = (() => {
    if (!cuenta) return null
    const actual = Number(cuenta.monto ?? 0)
    const delta = Number(monto)
    if (!monto || Number.isNaN(delta)) return actual
    return tipo === 'ingreso' ? actual + delta : actual - delta
  })()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cuenta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">Cuenta no encontrada</p>
        <Button onClick={() => navigate(`/empresa/${empresaId}/bancos`)} variant="outline">
          Volver a bancos
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nuevo movimiento</h1>
            <p className="text-sm text-muted-foreground">
              {cuenta.banco_nombre} • {cuenta.numero_cuenta} ({cuenta.tipo_moneda})
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
                    <SelectItem value="ingreso">Ingreso (entra dinero)</SelectItem>
                    <SelectItem value="egreso">Egreso (sale dinero)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="descripcion">Descripción *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Es la columna que la importación de extractos también rellena.
              </p>
              <Input
                id="descripcion"
                placeholder="Ej: Transferencia recibida, Pago de servicios"
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
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {cuenta.tipo_moneda}
                </span>
              </div>
            </div>

            {/* Vista previa del saldo */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Saldo después del movimiento</p>
              <p className="text-lg font-bold text-primary">
                {formatearMonto(previsualizacion, cuenta.tipo_moneda)}
              </p>
            </div>

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
                onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)}
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
