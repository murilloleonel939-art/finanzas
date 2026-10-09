import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { MONEDAS_FIAT } from '@/lib/monedas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearCuenta: formulario para crear una cuenta bancaria dentro de un banco.
 * 
 * Una cuenta se caracteriza por:
 *   - banco_id (requerido)
 *   - tipo_cuenta (ahorros, corriente, etc.)
 *   - numero_cuenta (texto libre, para que el usuario lo maneje como quiera)
 *   - tipo_moneda (del catálogo MONEDAS_FIAT)
 *   - saldo_inicial (opcional, pero recomendado)
 * 
 * El saldo_inicial es un movimiento de ajuste con concepto «Saldo inicial importado»
 * que se crea en paralelo (misma transacción ideal, pero lo haremos por separado
 * para que sea más simple).
 */
export default function CrearCuenta() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [bancoId, setBancoId] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState('ahorros')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [tipoMoneda, setTipoMoneda] = useState('USD')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [error, setError] = useState('')

  // Obtener bancos de la empresa
  const { data: bancos = [], isLoading: cargandoBancos } = useQuery({
    queryKey: ['bancos', empresaId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('bancos')
        .select('id, nombre_banco')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre_banco')

      if (err) throw err
      return data || []
    },
  })

  // Crear cuenta
  const { mutate: crearCuenta, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      // Validar
      if (!bancoId) throw new Error('Selecciona un banco')
      if (!numeroCuenta) throw new Error('El número de cuenta es requerido')
      if (!tipoMoneda) throw new Error('Selecciona una moneda')

      // Insertar cuenta
      const { data: cuentaInsertada, error: errCuenta } = await supabase
        .from('cuentas')
        .insert({
          banco_id: bancoId,
          empresa_id: empresaId,
          tipo_cuenta: tipoCuenta,
          numero_cuenta: numeroCuenta,
          tipo_moneda: tipoMoneda,
          saldo_actual: parseFloat(saldoInicial) || 0,
          created_by: user?.id,
        })
        .select('id')
        .single()

      if (errCuenta) throw errCuenta

      // Si hay saldo inicial, crear movimiento de ajuste
      if (saldoInicial && parseFloat(saldoInicial) !== 0) {
        const monto = parseFloat(saldoInicial)
        const { error: errMovimiento } = await supabase.from('movimientos').insert({
          cuenta_id: cuentaInsertada.id,
          empresa_id: empresaId,
          fecha: new Date().toISOString().split('T')[0],
          tipo: monto > 0 ? 'ingreso' : 'egreso',
          concepto: 'Saldo inicial importado',
          monto: Math.abs(monto),
          saldo_resultante: monto,
          created_by: user?.id,
        })

        if (errMovimiento) throw errMovimiento
      }

      return cuentaInsertada.id
    },
    onSuccess: () => {
      navigate(`/empresa/${empresaId}/cuentas`)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    crearCuenta()
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/cuentas`)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Crear cuenta</h1>
            <p className="text-sm text-muted-foreground">Añade una nueva cuenta bancaria</p>
          </div>
        </div>

        {/* Formulario */}
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Banco */}
            <div>
              <Label htmlFor="banco" className="text-sm font-medium">
                Banco *
              </Label>
              {cargandoBancos ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando...
                </div>
              ) : bancos.length === 0 ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
                  No hay bancos creados. <a href={`/empresa/${empresaId}/bancos/crear`} className="font-medium underline">Crear uno primero</a>.
                </div>
              ) : (
                <Select value={bancoId} onValueChange={setBancoId}>
                  <SelectTrigger id="banco">
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {bancos.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nombre_banco}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Tipo de cuenta */}
            <div>
              <Label htmlFor="tipo" className="text-sm font-medium">
                Tipo de cuenta
              </Label>
              <Select value={tipoCuenta} onValueChange={setTipoCuenta}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ahorros">Ahorros</SelectItem>
                  <SelectItem value="corriente">Corriente</SelectItem>
                  <SelectItem value="nomina">Nómina</SelectItem>
                  <SelectItem value="plazo">Plazo fijo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Número de cuenta */}
            <div>
              <Label htmlFor="numero" className="text-sm font-medium">
                Número de cuenta *
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Puede ser el número completo, parcial o un alias tuyo.
              </p>
              <Input
                id="numero"
                placeholder="Ej: ****1234 o Mi cuenta principal"
                value={numeroCuenta}
                onChange={(e) => setNumeroCuenta(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Moneda */}
            <div>
              <Label htmlFor="moneda" className="text-sm font-medium">
                Moneda *
              </Label>
              <Select value={tipoMoneda} onValueChange={setTipoMoneda}>
                <SelectTrigger id="moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONEDAS_FIAT.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Saldo inicial */}
            <div>
              <Label htmlFor="saldo" className="text-sm font-medium">
                Saldo inicial (opcional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Si la dejas vacía, el saldo comenzará en 0. Se genera un movimiento de «Saldo inicial importado».
              </p>
              <Input
                id="saldo"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                step="0.01"
                className="text-sm"
              />
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
                onClick={() => navigate(`/empresa/${empresaId}/cuentas`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !bancoId || !numeroCuenta}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear cuenta
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
