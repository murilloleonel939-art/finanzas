import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearCuentaComisionistaFiducia, listarComisionistasFiducias } from '@/lib/comisionistas-fiducias'

export default function CrearCuentaComisionistaFiducia() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [entidadId, setEntidadId] = useState(searchParams.get('fiducia') ?? '')
  const [nombreCuenta, setNombreCuenta] = useState('')
  const [error, setError] = useState('')

  const { data: entidades = [], isLoading } = useQuery({
    queryKey: ['comisionistas-fiducias', empresaId],
    queryFn: () => listarComisionistasFiducias(empresaId),
  })

  const { mutate: crearCuenta, isPending } = useMutation({
    mutationFn: () => {
      setError('')
      if (!entidadId) throw new Error('Selecciona una entidad.')
      if (!nombreCuenta.trim()) throw new Error('El nombre o número de cuenta es obligatorio.')
      return crearCuentaComisionistaFiducia(empresaId, {
        comisionista_fiducia_id: entidadId,
        nombre_cuenta: nombreCuenta.trim(),
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cuentas-comisionistas-fiducias', empresaId] })
      navigate(`/empresa/${empresaId}/comisionistas-fiducias/cuentas/${data.cuenta.id}`)
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <button type="button" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)} className="rounded-lg p-2 hover:bg-muted" aria-label="Volver">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nueva cuenta</h1>
            <p className="text-sm text-muted-foreground">Añade una cuenta a una comisionista o fiducia</p>
          </div>
        </div>

        <Card className="p-8">
          <form onSubmit={(event) => { event.preventDefault(); crearCuenta() }} className="space-y-6">
            <div>
              <Label htmlFor="entidad">Comisionista o fiducia *</Label>
              {isLoading ? (
                <div className="mt-2 flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>
              ) : (
                <Select value={entidadId} onValueChange={setEntidadId}>
                  <SelectTrigger id="entidad" className="mt-2"><SelectValue placeholder="Selecciona una entidad" /></SelectTrigger>
                  <SelectContent>{entidades.map((entidad) => <SelectItem key={entidad.id} value={entidad.id}>{entidad.nombre}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label htmlFor="nombre-cuenta">Nombre o número de cuenta *</Label>
              <Input id="nombre-cuenta" className="mt-2" placeholder="Ej: FIC Renta Fija o 123456789" value={nombreCuenta} onChange={(event) => setNombreCuenta(event.target.value)} autoFocus />
            </div>

            {error && <div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3"><AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" /><p className="text-sm text-destructive">{error}</p></div>}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)}>Cancelar</Button>
              <Button type="submit" disabled={isPending || isLoading || !entidadId || !nombreCuenta.trim()} className="gap-2">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}Crear cuenta</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
