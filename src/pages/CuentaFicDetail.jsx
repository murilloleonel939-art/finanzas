import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { actualizarClavePdfComisionista } from '@/lib/comisionistas-fiducias'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { formatMes } from '@/components/shared/MonthFilter'
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
  const [periodoElegido, setPeriodoElegido] = useState('')
  const [tab, setTab] = useState('activos')
  const archivoInput = useRef(null)
  const esExtractoUnificado = ['acciones y valores s.a.', 'trii'].includes(cuenta.comisionista_nombre?.trim().toLowerCase())
  const activos = cuenta.activos_accival ?? []
  const activo = activos.find((item) => item.periodo === periodoElegido) ?? activos[0]
  const movimientos = (activo?.fondos ?? []).flatMap((fondo) => fondo.movimientos ?? [])
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
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
    {esExtractoUnificado && activos.length > 0 && <div className="mb-5 flex items-center gap-3"><label htmlFor="periodo-accival" className="text-sm">Periodo</label><select id="periodo-accival" className="rounded-md border bg-background px-3 py-2 text-sm" value={activo?.periodo ?? ''} onChange={(event) => setPeriodoElegido(event.target.value)}>{activos.map((item) => <option key={item.periodo} value={item.periodo}>{formatMes(item.periodo)}</option>)}</select></div>}
    {tab === 'activos' && (esExtractoUnificado ? <div className="space-y-5">
      <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Activos</h2>{activo ? <><p className="mb-4 text-sm text-muted-foreground">Corte: {formatMes(activo.periodo)} · COP</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Efectivo', activo.resumen.efectivo], ['Fondos de inversión', activo.resumen.fondos_inversion], ['Renta variable', activo.resumen.renta_variable], ['Renta fija', activo.resumen.renta_fija], ['Repos activos', activo.resumen.repos_activos], ['Simultáneas activas', activo.resumen.simultaneas_activas], ['Total activos', activo.resumen.total_activos], ['Total pasivos', activo.resumen.total_pasivos], ['Total portafolio', activo.resumen.total_portafolio]].map(([nombre, valor]) => <div key={nombre}><p className="text-xs text-muted-foreground">{nombre}</p><p className="font-medium">{monto(valor)}</p></div>)}</div><p className="mt-4 text-xs text-muted-foreground">Los fondos ya están incluidos en el total de activos; no se suman dos veces.</p></> : <p className="text-sm text-muted-foreground">Aún no hay un extracto importado.</p>}</Card>
      {activo && <Card className="p-6"><h2 className="mb-4 text-lg font-semibold">Fondos de inversión colectiva</h2><div className="space-y-5">{activo.fondos.map((fondo) => <div className="rounded-md border p-4" key={fondo.nombre}><h3 className="font-semibold">{fondo.nombre}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Saldo anterior', fondo.saldo_anterior], ['Adiciones', fondo.adiciones], ['Retiros', fondo.retiros], ['Rendimientos', fondo.rendimientos], ['Pago de rendimientos', fondo.pago_rendimientos], ['Nuevo saldo', fondo.nuevo_saldo]].map(([nombre, valor]) => <div key={nombre}><p className="text-xs text-muted-foreground">{nombre}</p><p className="font-medium">{monto(valor)}</p></div>)}</div><div className="mt-3 flex flex-wrap gap-5 text-sm"><span>Unidades: {fondo.unidades ?? '—'}</span><span>Valor final de unidad: {monto(fondo.valor_unidad)}</span><span>Rentabilidad por valor unidad (E.A.): {fondo.rentabilidad_valor_unidad_ea == null ? '—' : `${fondo.rentabilidad_valor_unidad_ea} %`}</span></div></div>)}</div></Card>}
    </div> : <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Activos</h2><p className="text-sm text-muted-foreground">Este formato de extracto solo se acepta en cuentas de Acciones y Valores S.A. o trii.</p></Card>)}
    {tab === 'movimientos' && <Card className="p-6"><h2 className="mb-2 text-lg font-semibold">Movimientos</h2><p className="mb-4 text-sm text-muted-foreground">Adiciones, retiros e impuestos (GMF o retención) informados por cada fondo. Cuando el extracto solo presenta el total mensual, se indica sin fecha de transacción.</p>{movimientos.length ? <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Fondo</th><th className="py-2 pr-4">Concepto</th><th className="py-2 pr-4">Origen</th><th className="py-2 text-right">Valor</th></tr></thead><tbody>{movimientos.map((item, indice) => <tr key={`${item.fondo}-${item.tipo}-${item.fecha ?? 'mes'}-${indice}`} className="border-b last:border-0"><td className="py-2 pr-4">{item.fecha ?? formatMes(activo.periodo)}</td><td className="py-2 pr-4">{item.fondo}</td><td className="py-2 pr-4">{item.tipo}</td><td className="py-2 pr-4">{item.origen}</td><td className="py-2 text-right">{monto(item.valor)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">{activo ? 'No hay adiciones, retiros ni impuestos registrados en este periodo.' : 'Aún no hay un extracto importado.'}</p>}</Card>}
    <Card className="mt-5 p-6"><h2 className="font-semibold">Clave del extracto PDF</h2><p className="mt-1 text-sm text-muted-foreground">Se guarda cifrada por cuenta y no se muestra de nuevo. Se usa automáticamente al procesar extractos protegidos en esta cuenta de Acciones y Valores o trii.</p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setMensaje(''); guardarClave(clave) }}><input type="password" value={clave} onChange={(event) => setClave(event.target.value)} placeholder={cuenta.tiene_clave_pdf ? 'Clave guardada (escribe para reemplazar)' : 'Clave del PDF'} className="flex h-10 min-w-52 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" autoComplete="new-password" aria-label="Clave del extracto PDF" /><Button type="submit" disabled={isPending || !clave.trim()}>{isPending ? 'Guardando…' : 'Guardar clave'}</Button></form>
      <div className="mt-2 flex flex-wrap items-center gap-3">{cuenta.tiene_clave_pdf && <span className="text-xs text-emerald-600">Hay una clave guardada.</span>}{cuenta.tiene_clave_pdf && <button type="button" className="text-xs text-destructive underline" disabled={isPending} onClick={() => { setMensaje(''); guardarClave(null) }}>Eliminar clave</button>}{mensaje && <span className="text-xs text-muted-foreground" role="status">{mensaje}</span>}</div>
    </Card>
  </div></div>
}
