import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearMovimiento: formulario para registrar un movimiento bancario manual.
 * 
 * Un movimiento tiene:
 *   - fecha (requerida)
 *   - tipo (ingreso/egreso)
 *   - concepto (requerido)
 *   - monto (requerido)
 *   - descripcion (opcional)
 * 
 * El saldo_resultante se calcula como: saldo_anterior ± monto, según tipo.
 * No hay reconciliación ni validación de extracto — es un registro manual.
 */
export default function CrearMovimiento() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [tipo, setTipo] = useState('ingreso')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState('')

  // Obtener cuenta actual
  const { data: cuenta, isLoading: cargandoCuenta } = useQuery({
    queryKey: ['cuenta', cuentaId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('cuentas')
        .select('id, numero_cuenta, tipo_moneda, saldo_actual, banco_id, empresa_id')
        .eq('id', cuentaId)
        .single()

      if (err) throw err
      return data
    },
  })

  // Obtener banco
  const { data: banco } = useQuery({
    queryKey: ['banco', cuenta?.banco_id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('bancos')
        .select('id, nombre_banco')
        .eq('id', cuenta.banco_id)
        .single()

      if (err) throw err
      return data
    },
    enabled: !!cuenta?.banco_id,
  })

  // Crear movimiento
  const { mutate: crearMovimiento, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      // Validar
      if (!fecha) throw new Error('La fecha es requerida')
      if (!concepto) throw new Error('El concepto es requerido')
      if (!monto) throw new Error('El monto es requerido')

      const montoNum = parseFloat(monto)
      if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a 0')

      // Calcular nuevo saldo
      const saldoAnterior = parseFloat(cuenta.saldo_actual || 0)
      const saldoResultante = tipo === 'ingreso' ? saldoAnterior + montoNum : saldoAnterior - montoNum

      // Insertar movimiento
      const { error: errMovimiento } = await supabase.from('movimientos').insert({
        cuenta_id: cuentaId,
        empresa_id: empresaId,
        fecha,
        tipo,
        concepto,
        monto: montoNum,
        saldo_resultante: saldoResultante,
        descripcion: descripcion || null,
        created_by: user?.id,
      })

      if (errMovimiento) throw errMovimiento

      // Actualizar saldo_actual de la cuenta
      const { error: errActualizar } = await supabase
        .from('cuentas')
        .update({ saldo_actual: saldoResultante })
        .eq('id', cuentaId)

      if (errActualizar) throw errActualizar
    },
    onSuccess: () => {
      navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    crearMovimiento()
  }

  if (cargandoCuenta) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin" />
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
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Registrar movimiento</h1>
            <p className="text-sm text-muted-foreground">
              {banco?.nombre_banco} • {cuenta.numero_cuenta} ({cuenta.tipo_moneda})
            </p>
          </div>
        </div>

        {/* Formulario */}
        <Card className="p-8 mb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Fecha */}
            <div>
              <Label htmlFor="fecha" className="text-sm font-medium">
                Fecha *
              </Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Tipo */}
            <div>
              <Label htmlFor="tipo" className="text-sm font-medium">
                Tipo *
              </Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">
                    <span className="text-green-600">+ Ingreso</span>
                  </SelectItem>
                  <SelectItem value="egreso">
                    <span className="text-red-600">- Egreso</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Concepto */}
            <div>
              <Label htmlFor="concepto" className="text-sm font-medium">
                Concepto *
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Ej: Transferencia recibida, Pago de servicios, Retiro en cajero
              </p>
              <Input
                id="concepto"
                placeholder="¿De qué fue este movimiento?"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Monto */}
            <div>
              <Label htmlFor="monto" className="text-sm font-medium">
                Monto *
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="monto"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  step="0.01"
                  className="text-sm"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {cuenta.tipo_moneda}
                </span>
              </div>
            </div>

            {/* Descripción opcional */}
            <div>
              <Label htmlFor="descripcion" className="text-sm font-medium">
                Descripción (opcional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Notas adicionales o detalles del movimiento.
              </p>
              <Input
                id="descripcion"
                placeholder="Ej: Referencia: TRF-2024-001"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Saldo resultante (preview) */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-900 mb-1">Saldo después de este movimiento</p>
              <p className="text-lg font-bold text-blue-700">
                {monto ? (
                  tipo === 'ingreso'
                    ? (parseFloat(cuenta.saldo_actual || 0) + parseFloat(monto)).toFixed(2)
                    : (parseFloat(cuenta.saldo_actual || 0) - parseFloat(monto)).toFixed(2)
                ) : (
                  cuenta.saldo_actual
                )}{' '}
                {cuenta.tipo_moneda}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Botones */}
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
                disabled={isPending || !fecha || !concepto || !monto}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar movimiento
              </Button>
            </div>
          </form>
        </Card>

        {/* Nota de ayuda */}
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <p className="text-xs text-yellow-900">
            <strong>Nota:</strong> Este es un registro manual. Los movimientos de extractos
            bancarios se importan automáticamente en una fase posterior. Este formulario es
            para ajustes, movimientos en efectivo o correcciones.
          </p>
        </Card>
      </div>
    </div>
  )
}
