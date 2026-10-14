import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Loader2, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { obtenerCuentaComisionistaFiducia } from '@/lib/comisionistas-fiducias'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { formatearMonto } from '@/lib/monedas'

export default function CuentaFiduciaDetail() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [archivo, setArchivo] = useState(null)
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [tab, setTab] = useState('activo')
  const { data: cuenta, isLoading } = useQuery({ queryKey: ['cuenta-fiducia', empresaId, cuentaId], queryFn: () => obtenerCuentaComisionistaFiducia(empresaId, cuentaId) })

  const importar = async () => {
    if (!archivo) return setError('Selecciona el extracto PDF.')
    setSubiendo(true); setError(''); setEstado('subiendo')
    try {
      const coincidenciaPeriodo = archivo.name.match(/(20\d{2})[_-]?(0[1-9]|1[0-2])/)
      const periodo = coincidenciaPeriodo ? `${coincidenciaPeriodo[1]}-${coincidenciaPeriodo[2]}` : ''
      const respuesta = await crearImportJob({ empresaId, target: 'fiducia', destinoId: cuentaId, periodo, archivo, archivoNombre: archivo.name })
      setEstado('pendiente')
      const revisar = async () => {
        const job = await obtenerImportJob(respuesta.job.id)
        setEstado(job.estado)
        if (job.estado === 'hecho') { queryClient.invalidateQueries({ queryKey: ['cuenta-fiducia', empresaId, cuentaId] }); setSubiendo(false); return }
        if (job.estado === 'error') { setError(job.error_mensaje || 'No se pudo procesar el extracto.'); setSubiendo(false); return }
        window.setTimeout(revisar, 1000)
      }
      revisar()
    } catch (err) { setError(err.message); setSubiendo(false); setEstado('error') }
  }

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (!cuenta) return <div className="p-8">Cuenta no encontrada.</div>
  const monto = (value) => value == null ? '—' : formatearMonto(value, 'COP')

  return <div className="flex-1 overflow-y-auto p-6 md:p-8"><div className="max-w-4xl">
    <div className="mb-8 flex items-center gap-3"><button type="button" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)} className="rounded-lg p-2 hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button><div><h1 className="text-3xl font-bold">{cuenta.nombre_cuenta}</h1><p className="text-sm text-muted-foreground">{cuenta.comisionista_nombre}</p></div></div>
    <div className="mb-6 flex gap-2 border-b"><button type="button" onClick={() => setTab('activo')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'activo' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Activo</button></div>
    {tab === 'activo' && <div className="space-y-6"><Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Activo</h2>{cuenta.tipo_fiducia ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Tipo de fiducia</p><p className="font-medium">{cuenta.tipo_fiducia}</p></div><div><p className="text-xs text-muted-foreground">Saldo anterior</p><p className="font-medium">{monto(cuenta.saldo_anterior)}</p></div><div><p className="text-xs text-muted-foreground">Rendimientos netos</p><p className="font-medium">{monto(cuenta.rendimientos_netos)}</p></div><div><p className="text-xs text-muted-foreground">Nuevo saldo</p><p className="font-medium">{monto(cuenta.nuevo_saldo)}</p></div><div><p className="text-xs text-muted-foreground">Rentabilidad periodo</p><p className="font-medium">{cuenta.rentabilidad_periodo == null ? '—' : `${cuenta.rentabilidad_periodo}%`}</p></div><div><p className="text-xs text-muted-foreground">Periodo</p><p className="font-medium">{cuenta.activo_periodo || '—'}</p></div></div> : <p className="text-sm text-muted-foreground">Aún no hay un extracto importado.</p>}</Card>
      <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Importar extracto PDF</h2><p className="mb-4 text-sm text-muted-foreground">Exclusivo para cuentas de Fiduciaria Bancolombia.</p><input type="file" accept="application/pdf,.pdf" onChange={(event) => { setArchivo(event.target.files?.[0] || null); setError('') }} /><Button className="mt-4 gap-2" onClick={importar} disabled={subiendo || !archivo}><Upload className="h-4 w-4" />{subiendo ? 'Procesando…' : 'Importar PDF'}</Button>{estado && <p className="mt-3 text-sm text-muted-foreground">Estado: {estado}</p>}{error && <div className="mt-3 flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}</Card>
    </div>}
  </div></div>
}
