import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Loader2, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { YearFilter, formatMes } from '@/components/shared/MonthFilter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { obtenerCuentaComisionistaFiducia } from '@/lib/comisionistas-fiducias'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { calcularHistoricoFiducia } from '@/lib/fiducia-historico'
import { formatearMonto } from '@/lib/monedas'

export default function CuentaFiduciaDetail() {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const archivoInput = useRef(null)
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [tab, setTab] = useState('activo')
  const [anoElegido, setAnoElegido] = useState('')
  const [corteElegido, setCorteElegido] = useState('all')
  const { data: cuenta, isLoading, error: errorCuenta } = useQuery({ queryKey: ['cuenta-fiducia', empresaId, cuentaId], queryFn: () => obtenerCuentaComisionistaFiducia(empresaId, cuentaId) })

  const importar = async (archivo) => {
    if (!archivo) return
    if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecciona un archivo PDF válido.')
      return
    }
    setSubiendo(true); setError(''); setEstado('subiendo')
    try {
      const coincidenciaPeriodo = archivo.name.match(/(20\d{2})[_-]?(0[1-9]|1[0-2])/)
      const periodo = coincidenciaPeriodo ? `${coincidenciaPeriodo[1]}-${coincidenciaPeriodo[2]}` : ''
      const respuesta = await crearImportJob({ empresaId, target: 'fiducia', destinoId: cuentaId, periodo, archivo, archivoNombre: archivo.name })
      setEstado('pendiente')
      const revisar = async () => {
        try {
          const job = await obtenerImportJob(respuesta.job.id)
          setEstado(job.estado)
          if (job.estado === 'hecho') { queryClient.invalidateQueries({ queryKey: ['cuenta-fiducia', empresaId, cuentaId] }); setSubiendo(false); return }
          if (job.estado === 'error') { setError(job.error_mensaje || 'No se pudo procesar el extracto.'); setSubiendo(false); return }
          window.setTimeout(revisar, 1500)
        } catch (err) {
          setError(err.message || 'No se pudo consultar el estado de la importación.')
          setSubiendo(false); setEstado('error')
        }
      }
      revisar()
    } catch (err) { setError(err.message); setSubiendo(false); setEstado('error') }
  }

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (errorCuenta) return <div className="p-8 text-destructive">{errorCuenta.message}</div>
  if (!cuenta) return <div className="p-8">Cuenta no encontrada.</div>
  const monto = (value) => value == null ? '—' : formatearMonto(value, 'COP')
  const activos = cuenta.activos ?? []
  const anos = [...new Set(activos.map((activo) => activo.periodo?.match(/^(\d{4})-(0[1-9]|1[0-2])$/)?.[1]).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const ano = anos.includes(anoElegido) ? anoElegido : anos[0]
  const mesesAno = activos.filter((activo) => activo.periodo?.startsWith(`${ano}-`)).map((activo) => activo.periodo).sort((a, b) => b.localeCompare(a))
  const corte = mesesAno.includes(corteElegido) ? corteElegido : 'all'
  const { registros, ganancias, porcentaje, faltantes, ajustes } = calcularHistoricoFiducia(activos, ano, corte)
  const ultimo = registros.at(-1)
  const porcentajeTexto = porcentaje == null ? '—' : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(porcentaje)} %`

  return <div className="flex-1 overflow-y-auto p-6 md:p-8"><div className="max-w-5xl">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><button type="button" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)} className="rounded-lg p-2 hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button><div><h1 className="text-3xl font-bold">{cuenta.nombre_cuenta}</h1><p className="text-sm text-muted-foreground">{cuenta.comisionista_nombre}</p></div></div>
      <input ref={archivoInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const seleccionado = event.target.files?.[0]; event.target.value = ''; if (seleccionado) importar(seleccionado) }} />
      <Button className="gap-2" onClick={() => archivoInput.current?.click()} disabled={subiendo}><Upload className="h-4 w-4" />{subiendo ? 'Procesando…' : 'Importar extracto'}</Button>
    </div>
    {(estado || error) && <div className="mb-5">{estado && <p className="mb-2 text-sm text-muted-foreground">Estado: {estado}</p>}{error && <div className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}</div>}
    <div className="mb-6 flex gap-2 border-b"><button type="button" onClick={() => setTab('activo')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'activo' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Activo</button><button type="button" onClick={() => setTab('movimientos')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'movimientos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Movimientos</button></div>
    {tab === 'activo' && <div className="space-y-5">
      <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Activo</h2>{cuenta.tipo_fiducia ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Tipo de fiducia</p><p className="font-medium">{cuenta.tipo_fiducia}</p></div><div><p className="text-xs text-muted-foreground">Saldo anterior</p><p className="font-medium">{monto(cuenta.saldo_anterior)}</p></div><div><p className="text-xs text-muted-foreground">Rendimientos netos</p><p className="font-medium">{monto(cuenta.rendimientos_netos)}</p></div><div><p className="text-xs text-muted-foreground">Nuevo saldo</p><p className="font-medium">{monto(cuenta.nuevo_saldo)}</p></div><div><p className="text-xs text-muted-foreground">Rentabilidad periodo (según PDF)</p><p className="font-medium">{cuenta.rentabilidad_periodo == null ? '—' : `${cuenta.rentabilidad_periodo}%`}</p></div><div><p className="text-xs text-muted-foreground">Último periodo cargado</p><p className="font-medium">{cuenta.activo_periodo || '—'}</p></div></div> : <p className="text-sm text-muted-foreground">Aún no hay un extracto importado.</p>}</Card>
      <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Histórico de activos</h2>{!anos.length ? <p className="text-sm text-muted-foreground">Aún no hay periodos cargados.</p> : <>
        <div className="mb-5 flex flex-wrap items-end gap-4"><YearFilter id="ano-fiducia" anos={anos} value={ano} onChange={(value) => { setAnoElegido(value); setCorteElegido('all') }} /><div className="flex flex-col gap-1.5"><Label htmlFor="corte-fiducia">Periodo</Label><Select value={corte} onValueChange={setCorteElegido}><SelectTrigger id="corte-fiducia" className="w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo lo transcurrido del año</SelectItem>{mesesAno.map((mes) => <SelectItem key={mes} value={mes}>Hasta {formatMes(mes)}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="mb-3 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Rendimientos netos acumulados</p><p className="text-lg font-semibold">{monto(ganancias)}</p></div><div><p className="text-xs text-muted-foreground">Rentabilidad acumulada estimada</p><p className="text-lg font-semibold">{porcentajeTexto}</p></div><div><p className="text-xs text-muted-foreground">Saldo final del último mes mostrado</p><p className="text-lg font-semibold">{monto(ultimo?.nuevo_saldo)}</p></div></div>
        <p className="mb-4 text-xs text-muted-foreground">Estimación: rendimientos netos de los meses cargados ÷ saldo anterior del primer mes cargado. No es la tasa «Rentabilidad periodo» del PDF; aportes, retiros u otros ajustes pueden cambiar la rentabilidad real.{faltantes.length ? ` Faltan meses desde enero: ${faltantes.map(formatMes).join(', ')}.` : ''}{ajustes ? ' Hay diferencias entre saldos y rendimientos; pueden existir movimientos o ajustes no desglosados.' : ''}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-4">Periodo</th><th className="py-2 pr-4 text-right">Saldo anterior</th><th className="py-2 pr-4 text-right">Rendimientos netos</th><th className="py-2 pr-4 text-right">Nuevo saldo</th><th className="py-2 text-right">Rentabilidad periodo (PDF)</th></tr></thead><tbody>{[...registros].reverse().map((activo) => <tr key={activo.id} className="border-b last:border-0"><td className="py-2 pr-4">{formatMes(activo.periodo)}</td><td className="py-2 pr-4 text-right">{monto(activo.saldo_anterior)}</td><td className="py-2 pr-4 text-right">{monto(activo.rendimientos_netos)}</td><td className="py-2 pr-4 text-right">{monto(activo.nuevo_saldo)}</td><td className="py-2 text-right">{activo.rentabilidad_periodo == null ? '—' : `${activo.rentabilidad_periodo}%`}</td></tr>)}</tbody></table></div>
      </>}</Card>
    </div>}
    {tab === 'movimientos' && <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Movimientos</h2><p className="text-sm text-muted-foreground">Pendiente de implementar: necesitamos un extracto que incluya el detalle de adiciones y retiros para identificar y guardar las operaciones reales. Por ahora, los resúmenes mensuales se muestran en Activo.</p></Card>}
  </div></div>
}
