import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { actualizarClavePdfComisionista } from '@/lib/comisionistas-fiducias'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { YearFilter, formatMes } from '@/components/shared/MonthFilter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { formatearMonto } from '@/lib/monedas'

// Acciones y Valores y trii comparten el formato unificado; sus cuentas permanecen separadas.
export default function CuentaFicDetail({ cuenta }) {
  const { empresaId, cuentaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [clave, setClave] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [estado, setEstado] = useState('')
  const [errorImportacion, setErrorImportacion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [anoElegido, setAnoElegido] = useState('')
  const [corteElegido, setCorteElegido] = useState('all')
  const [tab, setTab] = useState('activos')
  const archivoInput = useRef(null)
  const esExtractoUnificado = ['acciones y valores s.a.', 'trii'].includes(cuenta.comisionista_nombre?.trim().toLowerCase())
  const activos = cuenta.activos_accival ?? []
  const hayRiesgosPendientes = activos.some((registro) => registro.fondos.some((fondo) => !fondo.riesgo_fondo || ['pendiente', 'consultando'].includes(fondo.riesgo_fondo.estado)))
  useEffect(() => {
    if (!hayRiesgosPendientes) return undefined
    const intervalo = window.setInterval(() => queryClient.invalidateQueries({ queryKey: ['cuenta-fiducia', empresaId, cuentaId] }), 15000)
    return () => window.clearInterval(intervalo)
  }, [hayRiesgosPendientes, queryClient, empresaId, cuentaId])
  const anos = [...new Set(activos.map((item) => item.periodo?.match(/^(\d{4})-(0[1-9]|1[0-2])$/)?.[1]).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const ano = anos.includes(anoElegido) ? anoElegido : anos[0]
  const mesesAno = activos.filter((item) => item.periodo?.startsWith(`${ano}-`)).sort((a, b) => a.periodo.localeCompare(b.periodo))
  const corte = mesesAno.some((item) => item.periodo === corteElegido) ? corteElegido : 'all'
  const registros = corte === 'all' ? mesesAno : mesesAno.filter((item) => item.periodo === corte)
  const activo = registros.at(-1)
  const acumuladoFondo = (nombre) => registros.reduce((acumulado, registro) => {
    const fondo = registro.fondos.find((item) => item.nombre === nombre)
    if (!fondo) return acumulado
    return {
      adiciones: acumulado.adiciones + Number(fondo.adiciones ?? 0),
      retiros: acumulado.retiros + Number(fondo.retiros ?? 0),
      rendimientos: acumulado.rendimientos + Number(fondo.rendimientos ?? 0),
      pago_rendimientos: acumulado.pago_rendimientos + Number(fondo.pago_rendimientos ?? 0),
    }
  }, { adiciones: 0, retiros: 0, rendimientos: 0, pago_rendimientos: 0 })
  const redondearMonto = (valor) => Math.round(valor * 100) / 100
  const fondosActivos = [...(activo?.fondos ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  const rendimientosFondosPeriodo = Math.round(registros.reduce((total, registro) => total + registro.fondos.reduce((suma, fondo) => suma + Number(fondo.rendimientos ?? 0), 0), 0) * 100) / 100
  const impuestosPeriodo = Math.round(registros.reduce((total, registro) => total + registro.fondos.reduce((suma, fondo) => suma + (fondo.movimientos ?? []).filter((movimiento) => ['GMF', 'Retención en la fuente'].includes(movimiento.tipo)).reduce((subtotal, movimiento) => subtotal + Number(movimiento.valor ?? 0), 0), 0), 0) * 100) / 100
  // El portafolio es una foto del último corte; sumar saldos de varios meses duplicaría los activos.
  // No acumular tasas E.A. del PDF: estimar la rentabilidad con los rendimientos
  // efectivamente informados y el capital inicial del primer extracto disponible.
  const rentabilidadAnual = (nombre) => {
    const historico = registros.flatMap((registro) => registro.fondos.filter((fondo) => fondo.nombre === nombre))
    const inicial = Number(historico[0]?.saldo_anterior)
    const base = inicial > 0 ? inicial : Number(historico[0]?.adiciones)
    if (!Number.isFinite(base) || base <= 0) return null
    const rendimientos = historico.reduce((total, fondo) => total + Number(fondo.rendimientos ?? 0), 0)
    return { rendimientos, porcentaje: rendimientos / base * 100 }
  }
  const movimientos = registros.flatMap((registro) => registro.fondos.flatMap((fondo) => (fondo.movimientos ?? []).map((item) => ({ ...item, periodo: registro.periodo }))))
    .sort((a, b) => (b.fecha ?? `${b.periodo}-00`).localeCompare(a.fecha ?? `${a.periodo}-00`))
  const monto = (valor) => valor == null ? '—' : formatearMonto(valor, 'COP')
  const importar = async (archivo) => {
    if (!archivo) return
    if (!archivo.name.toLowerCase().endsWith('.pdf')) { setErrorImportacion('Selecciona un PDF.'); return }
    setSubiendo(true); setErrorImportacion(''); setEstado('subiendo')
    try {
      const respuesta = await crearImportJob({ empresaId, target: 'accival', destinoId: cuentaId, archivo, archivoNombre: archivo.name })
      setEstado('pendiente')
      const revisar = async () => {
        try {
          const job = await obtenerImportJob(respuesta.job.id)
          setEstado(job.estado)
          if (job.estado === 'hecho') { await queryClient.invalidateQueries({ queryKey: ['cuenta-fiducia', empresaId, cuentaId] }); setSubiendo(false); return }
          if (job.estado === 'error') { setErrorImportacion(job.error_mensaje || 'No se pudo procesar el extracto.'); setSubiendo(false); return }
          window.setTimeout(revisar, 1500)
        } catch (err) { setErrorImportacion(err.message); setSubiendo(false); setEstado('error') }
      }
      revisar()
    } catch (err) { setErrorImportacion(err.message); setSubiendo(false); setEstado('error') }
  }
  const { mutate: guardarClave, isPending } = useMutation({
    mutationFn: (valor) => actualizarClavePdfComisionista(empresaId, cuentaId, valor),
    onSuccess: (resultado) => {
      setClave('')
      setMensaje(resultado.tiene_clave_pdf ? 'Clave guardada de forma segura.' : 'Clave eliminada.')
      queryClient.invalidateQueries({ queryKey: ['cuenta-fiducia', empresaId, cuentaId] })
    },
    onError: (err) => setMensaje(err.message),
  })

  return <div className="flex-1 overflow-y-auto p-6 md:p-8"><div className="max-w-5xl">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><button type="button" onClick={() => navigate(`/empresa/${empresaId}/comisionistas-fiducias`)} className="rounded-lg p-2 hover:bg-muted" aria-label="Volver"><ChevronLeft className="h-5 w-5" /></button><div><h1 className="text-3xl font-bold">{cuenta.nombre_cuenta}</h1><p className="text-sm text-muted-foreground">{cuenta.comisionista_nombre}</p></div></div>
      {esExtractoUnificado && <input ref={archivoInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const archivo = event.target.files?.[0]; event.target.value = ''; if (archivo) importar(archivo) }} />}
      <Button className="gap-2" disabled={!esExtractoUnificado || subiendo || !cuenta.tiene_clave_pdf} title={!cuenta.tiene_clave_pdf ? 'Primero guarda la clave del PDF' : undefined} onClick={() => archivoInput.current?.click()}><Upload className="h-4 w-4" />{subiendo ? 'Procesando…' : 'Importar'}</Button>
    </div>
    <div className="mb-6 flex gap-2 border-b"><button type="button" onClick={() => setTab('activos')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'activos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Activos</button><button type="button" onClick={() => setTab('movimientos')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'movimientos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Movimientos</button></div>
    {(estado || errorImportacion) && <div className="mb-4 text-sm">{estado && <p>Estado: {estado}</p>}{errorImportacion && <p className="text-destructive" role="alert">{errorImportacion}</p>}</div>}
    {esExtractoUnificado && anos.length > 0 && <div className="mb-5 flex flex-wrap items-end gap-4"><YearFilter id="ano-accival" anos={anos} value={ano} onChange={(value) => { setAnoElegido(value); setCorteElegido('all') }} /><div className="flex flex-col gap-1.5"><Label htmlFor="corte-accival">Periodo</Label><Select value={corte} onValueChange={setCorteElegido}><SelectTrigger id="corte-accival" className="w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo lo transcurrido del año</SelectItem>{[...mesesAno].reverse().map((item) => <SelectItem key={item.periodo} value={item.periodo}>{formatMes(item.periodo)}</SelectItem>)}</SelectContent></Select></div></div>}
    {tab === 'activos' && (esExtractoUnificado ? <div className="space-y-5">
      <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Activos</h2>{activo ? <><p className="mb-4 text-sm text-muted-foreground">{corte === 'all' ? `Año ${ano} · último corte: ${formatMes(activo.periodo)}` : `Corte: ${formatMes(activo.periodo)}`} · COP</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Efectivo', activo.resumen.efectivo], ['Fondos de inversión', activo.resumen.fondos_inversion], ['Rendimientos de fondos', corte === 'all' ? rendimientosFondosPeriodo : activo.fondos.reduce((total, fondo) => total + Number(fondo.rendimientos ?? 0), 0)], ['Impuestos', impuestosPeriodo], ['Renta variable', activo.resumen.renta_variable], ['Renta fija', activo.resumen.renta_fija], ['Repos activos', activo.resumen.repos_activos], ['Simultáneas activas', activo.resumen.simultaneas_activas], ['Total activos', activo.resumen.total_activos], ['Total pasivos', activo.resumen.total_pasivos], ['Total portafolio', activo.resumen.total_portafolio]].map(([nombre, valor]) => <div key={nombre}><p className="text-xs text-muted-foreground">{nombre}</p><p className="font-medium">{monto(valor)}</p></div>)}</div><p className="mt-4 text-xs text-muted-foreground">{corte === 'all' ? 'Los saldos y fondos corresponden al último corte cargado del año; no se suman los saldos de distintos meses. ' : ''}Los fondos ya están incluidos en el total de activos; no se suman dos veces.</p></> : <p className="text-sm text-muted-foreground">Aún no hay un extracto importado.</p>}</Card>
      {activo && <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Fondos de inversión colectiva</h2><div className="space-y-5">{fondosActivos.map((fondo) => <div className="rounded-md border p-4" key={fondo.nombre}><h3 className="font-semibold">{fondo.nombre}</h3><p className="mt-1 text-sm text-muted-foreground">Riesgo: {fondo.riesgo_fondo?.estado === 'confirmado' ? fondo.riesgo_fondo.perfil_riesgo : fondo.riesgo_fondo?.estado === 'no_encontrado' ? 'Sin dato oficial disponible' : fondo.riesgo_fondo?.estado === 'error' ? 'No se pudo consultar el riesgo' : 'Consultando fuente oficial…'}{fondo.riesgo_fondo?.estado === 'confirmado' && fondo.riesgo_fondo.fuente_url && <> · <a href={fondo.riesgo_fondo.fuente_url} target="_blank" rel="noreferrer" className="underline">Fuente oficial</a></>}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Saldo anterior', fondo.saldo_anterior], ['Adiciones', corte === 'all' ? redondearMonto(acumuladoFondo(fondo.nombre).adiciones) : fondo.adiciones], ['Retiros', corte === 'all' ? redondearMonto(acumuladoFondo(fondo.nombre).retiros) : fondo.retiros], ['Rendimientos', corte === 'all' ? redondearMonto(acumuladoFondo(fondo.nombre).rendimientos) : fondo.rendimientos], ['Pago de rendimientos', corte === 'all' ? redondearMonto(acumuladoFondo(fondo.nombre).pago_rendimientos) : fondo.pago_rendimientos], ['Nuevo saldo', fondo.nuevo_saldo]].map(([nombre, valor]) => <div key={nombre}><p className="text-xs text-muted-foreground">{nombre}</p><p className="font-medium">{monto(valor)}</p></div>)}</div><div className="mt-3 text-sm">{corte === 'all' ? <><span>Rentabilidad acumulada estimada: {rentabilidadAnual(fondo.nombre)?.porcentaje == null ? '—' : `${rentabilidadAnual(fondo.nombre).porcentaje.toFixed(2)} %`}</span><p className="mt-1 text-xs text-muted-foreground">Rendimientos de los meses cargados: {monto(rentabilidadAnual(fondo.nombre)?.rendimientos)}. Estimación sobre el saldo inicial (o la primera adición); aportes, retiros o meses faltantes pueden alterar la rentabilidad real.</p></> : <span>Rentabilidad: {fondo.rentabilidad_valor_unidad_ea == null ? '—' : `${fondo.rentabilidad_valor_unidad_ea} %`}</span>}</div></div>)}</div></Card>}
    </div> : <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Activos</h2><p className="text-sm text-muted-foreground">Este formato de extracto solo se acepta en cuentas de Acciones y Valores S.A. o trii.</p></Card>)}
    {tab === 'movimientos' && <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Movimientos</h2><p className="mb-4 text-sm text-muted-foreground">Adiciones, retiros e impuestos (GMF o retención) informados por cada fondo. Cuando el extracto solo presenta el total mensual, se indica sin fecha de transacción.</p>{movimientos.length ? <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Fondo</th><th className="py-2 pr-4">Concepto</th><th className="py-2 pr-4">Origen</th><th className="py-2 text-right">Valor</th></tr></thead><tbody>{movimientos.map((item, indice) => <tr key={`${item.fondo}-${item.tipo}-${item.fecha ?? 'mes'}-${indice}`} className="border-b last:border-0"><td className="py-2 pr-4">{item.fecha ?? formatMes(item.periodo)}</td><td className="py-2 pr-4">{item.fondo}</td><td className="py-2 pr-4">{item.tipo}</td><td className="py-2 pr-4">{item.origen}</td><td className="py-2 text-right">{monto(item.valor)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">{activo ? 'No hay adiciones, retiros ni impuestos registrados en este periodo.' : 'Aún no hay un extracto importado.'}</p>}</Card>}
    <Card className="mt-5 p-6"><h2 className="font-semibold">Clave del extracto PDF</h2><p className="mt-1 text-sm text-muted-foreground">Se guarda cifrada por cuenta y no se muestra de nuevo</p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setMensaje(''); guardarClave(clave) }}><input type="password" value={clave} onChange={(event) => setClave(event.target.value)} placeholder={cuenta.tiene_clave_pdf ? 'Clave guardada (escribe para reemplazar)' : 'Clave del PDF'} className="flex h-10 min-w-52 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" autoComplete="new-password" aria-label="Clave del extracto PDF" /><Button type="submit" disabled={isPending || !clave.trim()}>{isPending ? 'Guardando…' : 'Guardar clave'}</Button></form>
      <div className="mt-2 flex flex-wrap items-center gap-3">{cuenta.tiene_clave_pdf && <span className="text-xs text-emerald-600">Hay una clave guardada.</span>}{cuenta.tiene_clave_pdf && <button type="button" className="text-xs text-destructive underline" disabled={isPending} onClick={() => { setMensaje(''); guardarClave(null) }}>Eliminar clave</button>}{mensaje && <span className="text-xs text-muted-foreground" role="status">{mensaje}</span>}</div>
    </Card>
  </div></div>
}
