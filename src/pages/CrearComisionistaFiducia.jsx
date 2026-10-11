import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAISES, nombrePais } from '@/lib/paises'
import { catalogoComisionistasFiducias, crearComisionistaFiducia } from '@/lib/comisionistas-fiducias'

export default function CrearComisionistaFiducia() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pais, setPais] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const catalogo = catalogoComisionistasFiducias(pais)
  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => crearComisionistaFiducia(empresaId, { pais, nombre }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas-fiducias', empresaId] })
      navigate(`/empresa/${empresaId}/comisionistas-fiducias`)
    },
    onError: (err) => setError(err.message),
  })
  return <div className="flex-1 p-6 md:p-8 overflow-y-auto"><div className="max-w-2xl"><div className="flex items-center gap-3 mb-8"><button type="button" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)} className="p-2 hover:bg-muted rounded-lg" aria-label="Volver"><ChevronLeft className="w-5 h-5" /></button><div><h1 className="text-3xl font-bold">Nueva entidad</h1><p className="text-sm text-muted-foreground">Comisionista o fiducia por país</p></div></div><Card className="p-8"><form onSubmit={(event) => { event.preventDefault(); setError(''); if (!pais) return setError('Selecciona un país.'); if (!nombre.trim()) return setError('Indica el nombre.'); crear() }} className="space-y-6"><div><Label htmlFor="pais">País *</Label><Select value={pais} onValueChange={(value) => { setPais(value); setNombre('') }}><SelectTrigger id="pais"><SelectValue placeholder="Selecciona un país" /></SelectTrigger><SelectContent>{PAISES.map((item) => <SelectItem key={item.codigo} value={item.codigo}>{item.nombre}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="nombre">Comisionista o fiducia *</Label><p className="text-xs text-muted-foreground mb-2">En Colombia puedes escoger del catálogo o escribir otro.</p><Input id="nombre" list="comisionistas-fiducias" value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder={pais === 'CO' ? 'Escribe o busca una entidad' : 'Nombre de la entidad'} autoFocus /><datalist id="comisionistas-fiducias">{catalogo.map((item) => <option key={item} value={item} />)}</datalist></div>{error && <div className="flex gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md"><AlertCircle className="w-5 h-5 text-destructive" /><p className="text-sm text-destructive">{error}</p></div>}<div className="flex gap-3 justify-end pt-4"><Button type="button" variant="outline" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)}>Cancelar</Button><Button type="submit" disabled={isPending || !pais || !nombre.trim()} className="gap-2">{isPending && <Loader2 className="w-4 h-4 animate-spin" />}Crear entidad</Button></div></form></Card></div></div>
}
