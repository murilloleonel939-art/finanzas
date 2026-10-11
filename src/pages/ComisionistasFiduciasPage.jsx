import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { borrarComisionistaFiducia, listarComisionistasFiducias, nombrePaisComisionista } from '@/lib/comisionistas-fiducias'

export default function ComisionistasFiduciasPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [porBorrar, setPorBorrar] = useState(null)
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['comisionistas-fiducias', empresaId],
    queryFn: () => listarComisionistasFiducias(empresaId),
  })
  const { mutate: borrar, isPending: borrando } = useMutation({
    mutationFn: (id) => borrarComisionistaFiducia(empresaId, id),
    onSuccess: () => {
      setPorBorrar(null)
      queryClient.invalidateQueries({ queryKey: ['comisionistas-fiducias', empresaId] })
    },
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Comisionistas y fiducias</h1>
            <p className="text-sm text-muted-foreground">Administra entidades por país</p>
          </div>
          <Button onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias/crear`)} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva entidad
          </Button>
        </div>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? (
          <Card className="p-6 border-l-4 border-l-destructive"><div className="flex gap-3"><AlertCircle className="w-5 h-5 text-destructive" /><p className="text-sm">{error.message}</p></div></Card>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center"><Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground mb-4">No hay comisionistas o fiducias creados aún.</p><Button onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias/crear`)}><Plus className="w-4 h-4 mr-2" />Crear el primero</Button></Card>
        ) : (
          <div className="space-y-3">{items.map((item) => <Card key={item.id} className="p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium">{item.nombre}</h3><p className="text-xs text-muted-foreground">{nombrePaisComisionista(item.pais)}</p></div><button type="button" className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive" title="Borrar" onClick={() => setPorBorrar(item)}><Trash2 className="w-4 h-4" /></button></div></Card>)}</div>
        )}
      </div>
      <ConfirmDialog open={!!porBorrar} onOpenChange={(open) => !open && setPorBorrar(null)} title={`¿Borrar ${porBorrar?.nombre}?`} description="Dejará de aparecer en el listado. Nada se borra físicamente de la base." actionText="Borrar" onConfirm={() => borrar(porBorrar.id)} isLoading={borrando} />
    </div>
  )
}
