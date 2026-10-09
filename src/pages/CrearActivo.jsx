import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { formatearMonto } from '@/lib/monedas'
import { TIPOS_ACTIVO } from '@/lib/brokers'
import { MONEDAS_FIAT, MONEDA_DEFECTO } from '@/lib/monedas'
import { obtenerBroker, listarActivos, crearActivo } from '@/lib/brokers-datos'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearActivo: alta de una posición en un broker (PRD §5).
 *
 * Columnas reales de `activos_broker` (migración 0003): `nombre_activo` (el
 * ticker), `tipo_activo` (enum de 7 valores), `cantidad`, `valor_unitario` y
 * `moneda`. Aquí NO se calcula `valor_total`: es una columna derivada de la
 * vista `activos_broker_view` (cantidad × valor_unitario), no de la tabla.
 *
 * El índice único `activos_broker_ticker_unico` es (broker_id,
 * lower(nombre_activo)): el mismo ticker no se repite en un broker, y «VOO» y
 * «voo» son el mismo activo. `crearActivo()` traduce el 23505 a un mensaje
 * entendible.
 *
 * `tipo_activo` es un enum cerrado: por eso las opciones salen de
 * `TIPOS_ACTIVO` y no de una lista escrita en la página.
 */
export default function CrearActivo() {
  const { empresaId, brokerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [nombreActivo, setNombreActivo] = useState('')
  const [tipoActivo, setTipoActivo] = useState('accion')
  const [cantidad, setCantidad] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [moneda, setMoneda] = useState(MONEDA_DEFECTO.activo)
  const [error, setError] = useState('')

  const { data: broker, isLoading } = useQuery({
    queryKey: ['broker', brokerId],
    queryFn: () => obtenerBroker(brokerId),
  })

  const { data: activos = [] } = useQuery({
    queryKey: ['activos-broker', brokerId],
    queryFn: () => listarActivos(brokerId),
  })

  // Vista previa del valor de la posición
  const valorTotal = (() => {
    const c = Number(cantidad)
    const v = Number(valorUnitario)
    if (!cantidad || !valorUnitario || Number.isNaN(c) || Number.isNaN(v)) return null
    return Number((c * v).toFixed(8))
  })()

  // Aviso de ticker ya existente, antes de intentar el insert
  const duplicado = activos.find(
    (a) => a.nombre_activo.trim().toLowerCase() === nombreActivo.trim().toLowerCase()
  )

  const { mutate: crear, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!nombreActivo.trim()) throw new Error('El nombre o ticker del activo es obligatorio.')

      const c = Number(cantidad)
      if (!cantidad || Number.isNaN(c) || c <= 0) {
        throw new Error('La cantidad debe ser mayor que cero.')
      }

      const v = Number(valorUnitario)
      if (!valorUnitario || Number.isNaN(v) || v < 0) {
        throw new Error('El valor unitario debe ser un número igual o mayor que cero.')
      }

      await crearActivo({
        empresaId,
        brokerId,
        nombreActivo: nombreActivo.trim(),
        tipoActivo,
        cantidad: c,
        valorUnitario: v,
        moneda,
        userId: user?.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activos-broker', brokerId] })
      navigate(`/empresa/${empresaId}/brokers/${brokerId}`)
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
            <h1 className="text-3xl font-bold">Nueva posición</h1>
            <p className="text-sm text-muted-foreground">
              {broker.nombre_broker} • caja en {broker.moneda}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ticker">Activo (ticker) *</Label>
                <p className="text-xs text-muted-foreground mb-2">Ej: VOO, AAPL, BTC</p>
                <Input
                  id="ticker"
                  placeholder="VOO"
                  value={nombreActivo}
                  onChange={(e) => setNombreActivo(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <Label htmlFor="tipo">Tipo de activo</Label>
                <Select value={tipoActivo} onValueChange={setTipoActivo}>
                  <SelectTrigger id="tipo" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ACTIVO.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {duplicado && (
              <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">
                  Ya tienes una posición en {duplicado.nombre_activo} con{' '}
                  {Number(duplicado.cantidad).toLocaleString('es-CO')} unidades. El índice único
                  de la base no admite dos filas para el mismo ticker: para añadir cantidad,
                  edítala en lugar de crear otra.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cantidad">Cantidad *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Admite hasta 10 decimales.
                </p>
                <Input
                  id="cantidad"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="valor">Valor unitario *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Precio de entrada. La FASE 18 lo actualizará desde la API de mercado.
                </p>
                <Input
                  id="valor"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={valorUnitario}
                  onChange={(e) => setValorUnitario(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="moneda">Moneda del activo</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Puede ser distinta de la moneda de la caja ({broker.moneda}): cada una manda en
                su ámbito. Ej: caja en COP y activo en USD.
              </p>
              <Select value={moneda} onValueChange={setMoneda}>
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
              {moneda !== broker.moneda && (
                <p className="text-xs text-amber-700 mt-2">
                  La posición quedará en {moneda} y la caja en {broker.moneda}. Los totales se
                  mostrarán en dos líneas separadas, sin convertir (D4).
                </p>
              )}
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">
                Valor de la posición (cantidad × valor unitario)
              </p>
              <p className="text-lg font-bold text-primary">
                {valorTotal == null ? '—' : formatearMonto(valorTotal, moneda)}
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
                onClick={() => navigate(`/empresa/${empresaId}/brokers/${brokerId}`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !nombreActivo.trim() || !cantidad || !valorUnitario}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Añadir posición
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
