import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { borrarComisionistaFiducia, borrarCuentaComisionistaFiducia, listarCuentasComisionistasFiducias, listarComisionistasFiducias, nombrePaisComisionista } from '@/lib/comisionistas-fiducias'

const LOGOS_ENTIDADES = {
  fiduciariabancolombia: 'fiduciaria-bancolombia.png', fiduciariabogota: 'fiduciaria-bogota.svg', fidudavivienda: 'fidudavivienda.png',
  fiduciariadeoccidentefiduoccidente: 'fiduoccidente.svg', fiduciariapopular: 'fiduciaria-popular.svg', bbvaassetmanagementsasociedadfiduciaria: 'bbva-asset-management.png',
  fiducolpatria: 'fiducolpatria.png', servitrustgnbsudameris: 'servitrust.png', alianzafiduciaria: 'alianza-fiduciaria.png', accionfiduciaria: 'accion-fiduciaria.png',
  fiducentral: 'fiducentral.png', fiducoomeva: 'fiducoomeva.png', skandiasociedadfiduciaria: 'skandia.png', credicorpcapitalfiduciaria: 'credicorp-capital.png', trii: 'trii.png', accionesyvaloressa: 'acciones-y-valores.png',
}

function LogoEntidad({ nombre }) {
  const [fallo, setFallo] = useState(false)
  const clave = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const archivo = LOGOS_ENTIDADES[clave]
  return <div className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg bg-slate-50 px-2">
    {!fallo && archivo ? <img src={`/logos-comisionistas-fiducias/${archivo}?v=2`} alt={`Logo de ${nombre}`} className="max-h-9 max-w-full object-contain" onError={() => setFallo(true)} /> : <span className="text-2xl font-bold text-blue-700">{nombre.trim().charAt(0).toUpperCase()}</span>}
  </div>
}

export default function ComisionistasFiduciasPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [porBorrar, setPorBorrar] = useState(null)
  const [cuentaPorBorrar, setCuentaPorBorrar] = useState(null)
  const [errorBorrado, setErrorBorrado] = useState('')
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['comisionistas-fiducias', empresaId],
    queryFn: () => listarComisionistasFiducias(empresaId),
  })
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-comisionistas-fiducias', empresaId],
    queryFn: () => listarCuentasComisionistasFiducias(empresaId),
  })
  const cuentasPorEntidad = cuentas.reduce((resultado, cuenta) => {
    resultado[cuenta.comisionista_fiducia_id] ??= []
    resultado[cuenta.comisionista_fiducia_id].push(cuenta)
    return resultado
  }, {})
  const { mutate: borrarCuenta, isPending: borrandoCuenta } = useMutation({
    mutationFn: (cuentaId) => borrarCuentaComisionistaFiducia(empresaId, cuentaId),
    onSuccess: () => {
      setCuentaPorBorrar(null)
      queryClient.invalidateQueries({ queryKey: ['cuentas-comisionistas-fiducias', empresaId] })
    },
    onError: (err) => setErrorBorrado(err.message),
  })
  const { mutate: borrar, isPending: borrando } = useMutation({
    mutationFn: (id) => borrarComisionistaFiducia(empresaId, id),
    onSuccess: () => {
      setPorBorrar(null)
      queryClient.invalidateQueries({ queryKey: ['comisionistas-fiducias', empresaId] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-comisionistas-fiducias', empresaId] })
    },
    onError: (err) => setErrorBorrado(err.message),
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Comisionistas y fiducias</h1>
            <p className="text-sm text-muted-foreground">Administra entidades por país</p>
          </div>
          <Button onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias/crear`)} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva entidad
          </Button>
        </div>
        {errorBorrado && <Card className="mb-4 border-l-4 border-l-destructive p-4"><p className="text-sm text-destructive">{errorBorrado}</p></Card>}
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? (
          <Card className="p-6 border-l-4 border-l-destructive"><div className="flex gap-3"><AlertCircle className="w-5 h-5 text-destructive" /><p className="text-sm">{error.message}</p></div></Card>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center"><Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground mb-4">No hay comisionistas o fiducias creados aún.</p><Button onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias/crear`)}><Plus className="w-4 h-4 mr-2" />Crear el primero</Button></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Card key={item.id} className="overflow-hidden border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"><div className="flex items-start justify-between p-4 pb-3"><div><LogoEntidad nombre={item.nombre} /><h3 className="mt-3 text-sm font-semibold">{item.nombre}</h3><p className="text-xs text-muted-foreground">{nombrePaisComisionista(item.pais)}</p><div className="mt-2 space-y-1">{(cuentasPorEntidad[item.id] ?? []).map((cuenta) => <div key={cuenta.id} className="flex items-center gap-2"><p className="text-sm text-muted-foreground">Cuenta: {cuenta.nombre_cuenta}</p><button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title={`Borrar cuenta ${cuenta.nombre_cuenta}`} onClick={() => { setErrorBorrado(''); setCuentaPorBorrar(cuenta) }}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias/crear-cuenta?fiducia=${item.id}`)}><Plus className="mr-1 h-4 w-4" />Crear cuenta</Button><button type="button" className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive" title="Borrar" onClick={() => { setErrorBorrado(''); setPorBorrar(item) }}><Trash2 className="w-4 h-4" /></button></div></div></Card>)}</div>
        )}
      </div>
      <ConfirmDialog open={!!porBorrar} onOpenChange={(open) => !open && setPorBorrar(null)} title={`¿Borrar ${porBorrar?.nombre}?`} description="La fiducia y sus cuentas dejarán de aparecer en el listado." actionText="Borrar" onConfirm={() => borrar(porBorrar.id)} isLoading={borrando} />
      <ConfirmDialog open={!!cuentaPorBorrar} onOpenChange={(open) => !open && setCuentaPorBorrar(null)} title={`¿Borrar la cuenta ${cuentaPorBorrar?.nombre_cuenta}?`} description="La cuenta dejará de aparecer en el listado." actionText="Borrar cuenta" onConfirm={() => borrarCuenta(cuentaPorBorrar.id)} isLoading={borrandoCuenta} />
    </div>
  )
}
