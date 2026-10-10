import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { crearBroker } from '@/lib/brokers-datos'
import {
  BROKERS,
  TIPOS_BROKER,
  OTRO_BROKER,
  brokerDelCatalogo,
  resolverNombreBroker,
} from '@/lib/brokers'
import { MONEDAS_FIAT, MONEDA_DEFECTO } from '@/lib/monedas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearBroker: alta de un broker (PRD §5).
 *
 * Columnas reales de `brokers` (migración 0003): `nombre_broker` y `moneda`.
 * No hay `api_key`, `token` ni `url`: el PRD no los pide y el esquema no los
 * tiene — la conexión con APIs de mercado es el worker de precios y vive en el servidor
 * (decisión D11/D13), no como credencial por broker en el navegador.
 *
 * La moneda es la divisa base de la CAJA. Al elegir un broker del catálogo se
 * precarga la suya (`monedaSugerida`), porque casi siempre es la correcta; se
 * puede cambiar.
 */
export default function CrearBroker() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const [seleccion, setSeleccion] = useState('')
  const [escrito, setEscrito] = useState('')
  const [moneda, setMoneda] = useState(searchParams.get('moneda') || MONEDA_DEFECTO.broker)
  const [error, setError] = useState('')

  const delCatalogo = brokerDelCatalogo(seleccion)
  const nombreFinal = resolverNombreBroker(seleccion, escrito)
  const esOtro = seleccion === OTRO_BROKER

  const { mutate: crear, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!nombreFinal) throw new Error('Indica el nombre del broker.')
      if (!moneda) throw new Error('Selecciona la moneda de la caja.')

      await crearBroker({
        empresaId,
        nombreBroker: nombreFinal,
        moneda,
        userId: user?.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers', empresaId] })
      navigate(`/empresa/${empresaId}/brokers`)
    },
    onError: (err) => setError(err.message),
  })

  // Agrupar el catálogo por tipo para el selector
  const porTipo = TIPOS_BROKER.map((t) => ({
    ...t,
    brokers: BROKERS.filter((b) => b.tipo === t.valor),
  }))

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/brokers`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nuevo broker</h1>
            <p className="text-sm text-muted-foreground">
              Nombre y moneda base de la caja
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
              <Label htmlFor="broker">Broker *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Elige del catálogo o escribe uno que no esté.
              </p>
              <Select value={seleccion} onValueChange={setSeleccion}>
                <SelectTrigger id="broker">
                  <SelectValue placeholder="Selecciona un broker" />
                </SelectTrigger>
                <SelectContent>
                  {porTipo.map((grupo) => (
                    <div key={grupo.valor}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {grupo.etiqueta}
                      </div>
                      {grupo.brokers.map((b) => (
                        <SelectItem key={b.nombre} value={b.nombre}>
                          {b.nombre}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                  <SelectItem value={OTRO_BROKER}>Otro (escribir a mano)</SelectItem>
                </SelectContent>
              </Select>

              {esOtro && (
                <Input
                  className="mt-3"
                  placeholder="Nombre del broker"
                  value={escrito}
                  onChange={(e) => setEscrito(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            <div>
              <Label htmlFor="moneda">Moneda de la caja *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                La divisa de los depósitos y retiros. Puede no coincidir con la de los
                activos que compres: cada una manda en su ámbito.
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

              {delCatalogo?.monedaSugerida && delCatalogo.monedaSugerida !== moneda && (
                <button
                  type="button"
                  onClick={() => setMoneda(delCatalogo.monedaSugerida)}
                  className="mt-2 text-xs text-primary underline"
                >
                  Usar {delCatalogo.monedaSugerida} (la habitual en {delCatalogo.nombre})
                </button>
              )}
            </div>

            {nombreFinal && (
              <div className="p-3 bg-muted/50 border rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Se creará</p>
                <p className="text-sm font-medium">
                  {nombreFinal} <span className="text-muted-foreground">— caja en {moneda}</span>
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
                onClick={() => navigate(`/empresa/${empresaId}/brokers`)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || !nombreFinal} className="gap-2">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear broker
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
