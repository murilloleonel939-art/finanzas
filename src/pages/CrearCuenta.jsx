import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 * CrearCuenta: alta de una cuenta bancaria dentro de un banco.
 *
 * Columnas reales (migración 0002): `cuentas` tiene `numero_cuenta`,
 * `tipo_cuenta`, `tipo_moneda` y `monto` (el saldo actual). **No hay
 * `saldo_actual`**: ese nombre no existe y PostgREST lo rechazaría.
 *
 * `tipo_cuenta` es el enum `tipo_cuenta` con **dos** valores, `ahorros` y
 * `corriente`, no una lista abierta. Ofrecer «nómina» o «plazo fijo» daría un
 * error de Postgres al guardar.
 *
 * El saldo inicial se escribe en `cuentas.monto` y además se crea un
 * movimiento de apertura, para que el saldo tenga una fila que lo explique:
 * un saldo sin movimiento es un descuadre imposible de auditar después.
 */
export default function CrearCuenta() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  // `?banco=<id>` permite entrar desde la tarjeta de un banco concreto.
  const bancoPreseleccionado = searchParams.get('banco') ?? ''

  const [bancoId, setBancoId] = useState(bancoPreseleccionado)
  const [tipoCuenta, setTipoCuenta] = useState('ahorros')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [tipoMoneda, setTipoMoneda] = useState('COP')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [error, setError] = useState('')

  const { data: bancos = [], isLoading: cargandoBancos } = useQuery({
    queryKey: ['bancos', empresaId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('bancos')
        .select('id, nombre_banco, pais')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre_banco')

      if (err) throw err
      return data ?? []
    },
  })

  const { mutate: crearCuenta, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!bancoId) throw new Error('Selecciona un banco.')
      if (!numeroCuenta.trim()) throw new Error('El número de cuenta es obligatorio.')

      const saldo = saldoInicial === '' ? 0 : Number(saldoInicial)
      if (Number.isNaN(saldo) || saldo < 0) {
        throw new Error('El saldo inicial debe ser un número igual o mayor que cero.')
      }

      // 1. La cuenta
      const { data: cuenta, error: errCuenta } = await supabase
        .from('cuentas')
        .insert({
          empresa_id: empresaId,
          banco_id: bancoId,
          numero_cuenta: numeroCuenta.trim(),
          tipo_cuenta: tipoCuenta,
          tipo_moneda: tipoMoneda,
          monto: saldo,
          created_by: user?.id,
        })
        .select('id')
        .single()

      if (errCuenta) {
        // Índice único `cuentas_banco_numero_unico` de la 0002.
        if (errCuenta.code === '23505') {
          throw new Error('Ese número de cuenta ya existe en este banco.')
        }
        throw errCuenta
      }

      // 2. Movimiento de apertura, solo si hay saldo. Sin él, el `monto` de la
      //    cuenta sería un número sin respaldo en el historial.
      if (saldo > 0) {
        const { error: errMov } = await supabase.from('movimientos').insert({
          empresa_id: empresaId,
          cuenta_id: cuenta.id,
          fecha: new Date().toISOString().slice(0, 10),
          descripcion: 'Saldo inicial',
          tipo: 'ingreso',
          monto: saldo,
          orden: 0,
          created_by: user?.id,
        })

        if (errMov) throw errMov
      }

      return cuenta.id
    },
    onSuccess: (cuentaId) => {
      queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-empresa', empresaId] })
      navigate(`/empresa/${empresaId}/cuentas/${cuentaId}`)
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nueva cuenta</h1>
            <p className="text-sm text-muted-foreground">Añade una cuenta a un banco</p>
          </div>
        </div>

        <Card className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              crearCuenta()
            }}
            className="space-y-6"
          >
            {/* Banco */}
            <div>
              <Label htmlFor="banco">Banco *</Label>
              {cargandoBancos ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 mt-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando...
                </div>
              ) : bancos.length === 0 ? (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                  Esta empresa no tiene bancos todavía.{' '}
                  <button
                    type="button"
                    onClick={() => navigate(`/empresa/${empresaId}/bancos/crear`)}
                    className="font-medium underline"
                  >
                    Crear un banco primero
                  </button>
                  .
                </div>
              ) : (
                <Select value={bancoId} onValueChange={setBancoId}>
                  <SelectTrigger id="banco" className="mt-2">
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

            {/* Número de cuenta */}
            <div>
              <Label htmlFor="numero">Número de cuenta *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Debe ser único dentro del banco. Puede ser el número real o un alias.
              </p>
              <Input
                id="numero"
                placeholder="Ej: 1234-5678 o Cuenta operativa"
                value={numeroCuenta}
                onChange={(e) => setNumeroCuenta(e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div>
              <Label htmlFor="tipo">Tipo de cuenta</Label>
              <p className="text-xs text-muted-foreground mb-2">
                El esquema solo admite ahorros y corriente.
              </p>
              <Select value={tipoCuenta} onValueChange={setTipoCuenta}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ahorros">Ahorros</SelectItem>
                  <SelectItem value="corriente">Corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Moneda */}
            <div>
              <Label htmlFor="moneda">Moneda *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Una cuenta tiene una sola moneda y no se convierte (D4).
              </p>
              <Select value={tipoMoneda} onValueChange={setTipoMoneda}>
                <SelectTrigger id="moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONEDAS_FIAT.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.codigo} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Saldo inicial */}
            <div>
              <Label htmlFor="saldo">Saldo inicial</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Si lo dejas vacío, la cuenta empieza en cero. Con un saldo mayor que cero se
                crea además un movimiento «Saldo inicial».
              </p>
              <Input
                id="saldo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
              />
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
                onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !bancoId || !numeroCuenta.trim()}
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
