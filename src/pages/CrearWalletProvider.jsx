import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { crearProveedor } from '@/lib/wallets-datos'
import {
  proveedoresPorTipo,
  tipoDeProveedor,
  resolverNombreProveedor,
  resolverTipoProveedor,
  TIPOS_PROVEEDOR,
  OTRO_PROVEEDOR,
} from '@/lib/walletProviders'
import { esProveedorEarn } from '@/lib/earnConfig'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft, Sparkles } from 'lucide-react'

/**
 * CrearWalletProvider: alta de un proveedor de wallet (PRD §6).
 *
 * Columnas reales de `wallet_providers` (migración 0004): `tipo` y
 * `nombre_proveedor`. **No existe `proveedor_nombre`** — ese nombre es el alias
 * que la vista `wallets_view` le pone a `nombre_proveedor`, no una columna de la
 * tabla. Es justo el tipo de confusión que costó una versión anterior.
 *
 * `tipo` es el enum `tipo_proveedor` con **tres** valores (`cripto` / `fiat` /
 * `ambos`), no una lista abierta. Con un proveedor del catálogo se deduce solo;
 * con «Otro» hay que elegirlo, porque la base no puede adivinarlo y el campo es
 * NOT NULL: sin esto, el alta fallaría con un error de constraint en vez de
 * decir qué falta.
 */
export default function CrearWalletProvider() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const [seleccion, setSeleccion] = useState('')
  const [escrito, setEscrito] = useState('')
  // `?tipo=cripto` permite entrar desde un filtro del listado.
  const [tipoOtro, setTipoOtro] = useState(searchParams.get('tipo') ?? '')
  const [error, setError] = useState('')

  const esOtro = seleccion === OTRO_PROVEEDOR
  const nombreFinal = resolverNombreProveedor(seleccion, escrito)
  const tipoFinal = resolverTipoProveedor(seleccion, tipoOtro)
  const seraTodoEarn = esProveedorEarn(nombreFinal)

  const { mutate: crear, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!nombreFinal) throw new Error('Indica el nombre del proveedor.')
      if (!tipoFinal) {
        throw new Error(
          'Selecciona el tipo del proveedor. Con un proveedor fuera del catálogo la base no puede deducirlo.'
        )
      }

      await crearProveedor({
        empresaId,
        tipo: tipoFinal,
        nombreProveedor: nombreFinal,
        userId: user?.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores-wallet', empresaId] })
      navigate(`/empresa/${empresaId}/wallets`)
    },
    onError: (err) => setError(err.message),
  })

  // El catálogo agrupado por tipo, igual que en CrearBroker. Ojo: un proveedor
  // «ambos» aparece en los dos primeros grupos a propósito — es compatible con
  // las dos clases de wallet, y esconderlo de uno de los dos confundiría.
  const grupos = [
    { tipo: 'cripto', etiqueta: 'Cripto', lista: proveedoresPorTipo('cripto') },
    { tipo: 'fiat', etiqueta: 'Fiat', lista: proveedoresPorTipo('fiat') },
  ]

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
            <h1 className="text-3xl font-bold">Nuevo proveedor de wallet</h1>
            <p className="text-sm text-muted-foreground">
              Binance, MetaMask, PayPal, Coindepo… o uno que no esté en el catálogo
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
              <Label htmlFor="proveedor">Proveedor *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Elige del catálogo o escribe uno que no esté.
              </p>
              <Select value={seleccion} onValueChange={setSeleccion}>
                <SelectTrigger id="proveedor">
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map((grupo) => (
                    <div key={grupo.tipo}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {grupo.etiqueta}
                      </div>
                      {grupo.lista.map((p) => (
                        <SelectItem key={`${grupo.tipo}-${p.nombre}`} value={p.nombre}>
                          {p.nombre}
                          {p.tipo === 'ambos' ? ' (cripto y fiat)' : ''}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                  <SelectItem value={OTRO_PROVEEDOR}>Otro (escribir a mano)</SelectItem>
                </SelectContent>
              </Select>

              {esOtro && (
                <Input
                  className="mt-3"
                  placeholder="Nombre del proveedor"
                  value={escrito}
                  onChange={(e) => setEscrito(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* El tipo solo se pregunta cuando la base no puede deducirlo. */}
            {(esOtro || !seleccion) && (
              <div>
                <Label htmlFor="tipo">Tipo *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {esOtro
                    ? 'Con un proveedor fuera del catálogo hay que indicarlo: es obligatorio en la base.'
                    : 'Se deduce del catálogo; aquí solo hace falta si escribes uno a mano.'}
                </p>
                <Select value={tipoOtro} onValueChange={setTipoOtro} disabled={!esOtro}>
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Selecciona el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PROVEEDOR.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!esOtro && seleccion && (
              <div className="p-3 bg-muted/50 border rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Tipo del catálogo</p>
                <p className="text-sm font-medium">{tipoDeProveedor(seleccion)}</p>
              </div>
            )}

            {seraTodoEarn && (
              <div className="flex gap-3 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Proveedor «todo es Earn»</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sus wallets se abrirán con la pantalla única de Earn (sin pestañas): todos
                    sus movimientos cuentan como Earn sin mirar la descripción.
                  </p>
                </div>
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
                disabled={isPending || !nombreFinal || !tipoFinal}
                className="gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear proveedor
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
