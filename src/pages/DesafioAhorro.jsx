import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Check, CircleDollarSign, RotateCcw, Save, FolderOpen, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'

const RETOS = [
  { cantidad: 12, frecuencia: 'Mensual', titulo: '12 depósitos' },
  { cantidad: 26, frecuencia: 'Quincenal', titulo: '26 depósitos' },
  { cantidad: 52, frecuencia: 'Semanal', titulo: '52 depósitos' },
  { cantidad: 100, frecuencia: 'Diaria', titulo: '100 depósitos' },
]
const CLAVE = (empresaId) => `desafio-ahorro-v1-${empresaId}`
const CLAVE_METAS = (empresaId) => `desafio-ahorro-metas-v1-${empresaId}`
const fechaLocal = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}
const estadoInicial = () => ({ nombre: 'Mi desafío', cantidad: 30, incremento: 3500, inicio: fechaLocal(), frecuencia: 'Diaria', completados: {} })

function cargarMetas(empresaId) {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_METAS(empresaId)) || '[]')
  } catch {
    return []
  }
}
const moneda = (valor) => `$ ${Number(valor || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

function cargarEstado(empresaId) {
  try {
    const guardado = localStorage.getItem(CLAVE(empresaId))
    return guardado ? { ...estadoInicial(), ...JSON.parse(guardado) } : estadoInicial()
  } catch {
    return estadoInicial()
  }
}

export default function DesafioAhorro() {
  const { empresaId } = useParams()
  const [reto, setReto] = useState(() => cargarEstado(empresaId))
  const [metas, setMetas] = useState(() => cargarMetas(empresaId))
  const [metaSeleccionada, setMetaSeleccionada] = useState('')
  const [aviso, setAviso] = useState('')
  const [mostrarAvisoReinicio, setMostrarAvisoReinicio] = useState(false)
  const fechaRef = useRef(null)

  useEffect(() => {
    setReto(cargarEstado(empresaId))
    setMetas(cargarMetas(empresaId))
    setMetaSeleccionada('')
  }, [empresaId])

  useEffect(() => {
    localStorage.setItem(CLAVE(empresaId), JSON.stringify(reto))
  }, [empresaId, reto])

  useEffect(() => {
    localStorage.setItem(CLAVE_METAS(empresaId), JSON.stringify(metas))
  }, [empresaId, metas])

  useEffect(() => {
    if (!metaSeleccionada) return
    setMetas((actuales) => actuales.map((meta) => meta.id === metaSeleccionada ? { ...reto, id: meta.id } : meta))
  }, [reto, metaSeleccionada])

  const montos = useMemo(() => Array.from({ length: Math.max(1, Math.min(500, Number(reto.cantidad) || 1)) }, (_, i) => (i + 1) * Math.max(0, Number(reto.incremento) || 0)), [reto.cantidad, reto.incremento])
  const depositosHechos = Object.keys(reto.completados || {}).filter((id) => reto.completados[id]).length
  const ahorrado = montos.reduce((suma, monto, index) => suma + (reto.completados[index + 1] ? monto : 0), 0)
  const meta = montos.reduce((suma, monto) => suma + monto, 0)
  const progreso = meta ? Math.min(100, (ahorrado / meta) * 100) : 0
  const pendiente = Math.max(0, meta - ahorrado)
  const siguiente = montos.find((_, i) => !reto.completados[i + 1]) || 0
  const orden = useMemo(() => montos.map((_, i) => i + 1), [montos])
  const completadosSemana = Object.values(reto.completados || {}).filter((fecha) => {
    if (!fecha) return false
    const antiguedad = Date.now() - new Date(`${fecha}T00:00:00`).getTime()
    return antiguedad >= 0 && antiguedad <= 7 * 86400000
  }).length

  function actualizar(cambios) {
    setReto((actual) => ({ ...actual, ...cambios }))
  }

  function marcarDeposito(numero, forzar) {
    setReto((actual) => {
      const completados = { ...actual.completados }
      if (forzar || !completados[numero]) completados[numero] = fechaLocal()
      else delete completados[numero]
      return { ...actual, completados }
    })
  }

  function marcarSiguiente() {
    const numero = montos.findIndex((_, i) => !reto.completados[i + 1]) + 1
    if (numero > 0) marcarDeposito(numero, true)
    else setAviso('¡Completaste todos los depósitos de este desafío!')
  }

  function guardarMeta() {
    const nombre = String(reto.nombre || '').trim()
    if (!nombre) {
      setAviso('Escribe un nombre para guardar esta meta.')
      return
    }
    const metaGuardada = { ...reto, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`, nombre }
    setMetas((actuales) => [...actuales, metaGuardada])
    setMetaSeleccionada(metaGuardada.id)
    setAviso(`Meta «${nombre}» guardada. Tu progreso queda asociado a ella.`)
  }

  function cargarMeta(id) {
    const guardada = metas.find((meta) => meta.id === id)
    if (!guardada) return
    const { id: _id, ...datosMeta } = guardada
    setReto(datosMeta)
    setMetaSeleccionada(id)
    setAviso(`Meta «${guardada.nombre}» cargada. Puedes seguir alimentando su progreso.`)
  }

  function eliminarMeta() {
    const guardada = metas.find((meta) => meta.id === metaSeleccionada)
    if (!guardada) return
    setMetas((actuales) => actuales.filter((meta) => meta.id !== metaSeleccionada))
    setMetaSeleccionada('')
    setAviso(`Meta «${guardada.nombre}» eliminada de las metas guardadas.`)
  }

  function reiniciar() {
    setMostrarAvisoReinicio(true)
  }

  function confirmarReinicio() {
    setMetaSeleccionada('')
    setReto(estadoInicial())
    setMostrarAvisoReinicio(false)
    setAviso('Progreso reiniciado. Elige una meta guardada cuando quieras continuarla.')
  }

  const fechaFinal = new Date(`${reto.inicio}T12:00:00`)
  const diasPorFrecuencia = { Diaria: 1, Semanal: 7, Quincenal: 15, Mensual: 30 }
  fechaFinal.setDate(fechaFinal.getDate() + Math.max(0, montos.length - 1) * (diasPorFrecuencia[reto.frecuencia] || 1))
  const fechaFinTexto = fechaFinal.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-full bg-white p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center gap-3">
          <CircleDollarSign className="h-7 w-7 text-blue-600" />
          <div><h1 className="text-2xl font-bold">Desafío de ahorro</h1></div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="border-slate-200 bg-white shadow-sm p-5 text-slate-900">
              <SectionTitle>Configura tu meta</SectionTitle>
              <label className="mt-4 block text-xs font-medium text-slate-600">Nombre de la meta<input type="text" maxLength="60" value={reto.nombre || ''} onChange={(e) => actualizar({ nombre: e.target.value })} placeholder="Ej. Viaje, emergencia, matrícula" className="mt-1 w-full rounded-lg border border-[#29372d] bg-white px-3 py-2 text-sm text-slate-900" /></label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {RETOS.map((opcion) => <button key={opcion.cantidad} type="button" onClick={() => actualizar({ cantidad: opcion.cantidad, frecuencia: opcion.frecuencia })} className={`rounded-lg border p-3 text-left text-sm transition ${Number(reto.cantidad) === opcion.cantidad && reto.frecuencia === opcion.frecuencia ? 'border-[#dcb650] bg-amber-50' : 'border-[#29372d] bg-slate-50 hover:border-[#69806b]'}`}><strong className="block">{opcion.titulo}</strong><span className="text-xs text-slate-500">{opcion.frecuencia}</span></button>)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-600">Número de depósitos<input type="number" min="1" max="500" value={reto.cantidad} onChange={(e) => actualizar({ cantidad: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} className="mt-1 w-full rounded-lg border border-[#29372d] bg-white px-3 py-2 text-sm text-slate-900" /></label>
                <label className="text-xs font-medium text-slate-600">Incremento<input type="number" min="0" step="500" value={reto.incremento} onChange={(e) => actualizar({ incremento: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-[#29372d] bg-white px-3 py-2 text-sm text-slate-900" /></label>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_110px] gap-3">
                <label className="text-xs font-medium text-slate-600">Fecha de inicio<div className="relative mt-1"><input ref={fechaRef} type="date" value={reto.inicio} onChange={(e) => actualizar({ inicio: e.target.value })} className="w-full rounded-lg border border-[#29372d] bg-white px-3 py-2 pr-10 text-sm text-slate-900" /><button type="button" aria-label="Abrir calendario" onClick={() => fechaRef.current?.showPicker?.()} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-black hover:text-blue-600"><CalendarDays className="h-4 w-4" /></button></div></label>
                <label className="text-xs font-medium text-slate-600">Frecuencia<select value={reto.frecuencia} onChange={(e) => actualizar({ frecuencia: e.target.value })} className="mt-1 w-full rounded-lg border border-[#29372d] bg-white px-3 py-2 text-sm text-slate-900"><option>Diaria</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option></select></label>
              </div>
              <div className="mt-4 rounded-xl border border-[#193421] bg-emerald-50 p-4"><p className="text-lg font-bold text-black">{moneda(meta)}</p><p className="text-sm text-slate-500">meta total · termina alrededor de {fechaFinTexto}</p></div>
              <button type="button" onClick={guardarMeta} className="mt-3 w-full rounded-full bg-[#e6b84f] px-3 py-2 text-xs font-bold text-[#1b2015] hover:bg-[#f0c961]"><Save className="mr-1 inline h-3.5 w-3.5" />Guardar esta meta</button>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm p-5 text-slate-900">
              <SectionTitle>Mis metas guardadas</SectionTitle>
              {metas.length === 0 ? <p className="mt-3 text-xs text-slate-500">Guarda una meta para poder cargarla y continuar más adelante.</p> : <div className="mt-3 space-y-2">{metas.map((metaGuardada) => <button key={metaGuardada.id} type="button" onClick={() => cargarMeta(metaGuardada.id)} className={`w-full rounded-lg border p-3 text-left ${metaSeleccionada === metaGuardada.id ? 'border-[#dcb650] bg-amber-50' : 'border-[#29372d] bg-slate-50 hover:border-[#69806b]'}`}><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{metaGuardada.nombre}</strong><FolderOpen className="h-4 w-4 shrink-0 text-black" /></span><span className="mt-1 block text-xs text-slate-500">{metaGuardada.cantidad} depósitos · {moneda(metaGuardada.incremento)} de incremento · {(Object.keys(metaGuardada.completados || {}).length)} completados</span></button>)}</div>}
              {metaSeleccionada && <button type="button" onClick={eliminarMeta} className="mt-3 rounded-full border border-[#472721] px-3 py-2 text-xs font-semibold text-[#f28e7d] hover:bg-red-50"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Eliminar meta guardada</button>}
              {mostrarAvisoReinicio ? <div className="mt-4 rounded-lg border border-[#755238] bg-amber-50 p-3"><p className="text-xs text-blue-600">¿Borrar todos los depósitos marcados y reiniciar este desafío?</p><div className="mt-2 flex gap-2"><button type="button" onClick={confirmarReinicio} className="rounded-full bg-[#e6b84f] px-3 py-1.5 text-xs font-bold text-[#1b2015]">Sí, reiniciar</button><button type="button" onClick={() => setMostrarAvisoReinicio(false)} className="rounded-full border border-[#53604e] px-3 py-1.5 text-xs">Cancelar</button></div></div> : <button type="button" onClick={reiniciar} className="mt-4 w-full rounded-full border border-[#472721] px-3 py-2 text-xs font-semibold text-[#f28e7d] hover:bg-red-50"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Reiniciar progreso</button>}
            </Card>
          </aside>

          <main className="space-y-4">
            <Card className="grid gap-5 border-slate-200 bg-white shadow-sm p-6 text-slate-900 md:grid-cols-[170px_1fr] md:items-center">
              <div className="mx-auto grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#58a96c ${progreso}%, #26372a ${progreso}% 100%)` }}><div className="grid h-[118px] w-[118px] place-items-center rounded-full bg-white shadow-sm text-center"><div><p className="text-3xl font-bold">{progreso.toFixed(0)}%</p><p className="text-xs text-slate-500">completado</p></div></div></div>
              <div>
                <p className="text-3xl font-bold text-blue-600">{moneda(ahorrado)} <span className="text-sm font-normal text-slate-500">ahorrados hasta ahora</span></p>
                <p className="mt-2 text-sm text-slate-600">Te faltan <strong className="text-slate-900">{moneda(pendiente)}</strong> para llegar a tu meta de <strong className="text-slate-900">{moneda(meta)}</strong></p>
                <div className="my-4 grid grid-cols-3 gap-3 text-sm">
                  <Metric value={`${depositosHechos}/${montos.length}`} label="depósitos hechos" />
                  <Metric value={moneda(siguiente)} label="siguiente sugerido" />
                  <Metric value={completadosSemana} label="seguidos esta semana" />
                </div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={marcarSiguiente} className="rounded-full bg-[#e6b84f] px-4 py-2.5 text-sm font-bold text-[#1b2015] hover:bg-[#f0c961]"><CircleDollarSign className="mr-1 inline h-4 w-4" />Ya ahorré este depósito</button></div>
                {aviso && <p role="status" className="mt-2 text-xs text-black">{aviso}</p>}
              </div>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm p-5 text-slate-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-lg font-bold text-blue-600">Grilla de depósitos</h2><span className="text-xs text-slate-500">{montos.length} casillas · toca una para marcarla</span></div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-10">
                {orden.map((numero) => {
                  const hecho = Boolean(reto.completados[numero])
                  return <button key={numero} type="button" aria-pressed={hecho} onClick={() => marcarDeposito(numero)} className={`flex min-h-[76px] flex-col items-center justify-center rounded-xl border p-2 text-center transition hover:-translate-y-0.5 ${hecho ? 'border-[#529b5e] bg-emerald-50 text-black' : 'border-[#29372d] bg-slate-50 hover:border-[#536b56]'}`}><span className="text-[10px] text-black">#{numero}</span><strong className="text-xs">{moneda(montos[numero - 1])}</strong>{hecho && <Check className="mt-1 h-3 w-3" />}</button>
                })}
              </div>
              <div className="mt-4 flex gap-4 text-xs text-slate-500"><span>□ Pendiente</span><span className="text-black">▣ Completado</span></div>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm p-5 text-slate-900"><h2 className="mb-3 font-serif text-lg font-bold text-blue-600">Últimos depósitos marcados</h2>
              {depositosHechos === 0 ? <p className="text-sm text-slate-500">Aún no has marcado ningún depósito.</p> : <div className="space-y-2">{Object.entries(reto.completados).filter(([, fecha]) => fecha).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 5).map(([numero, fecha]) => <div key={numero} className="flex justify-between border-b border-[#29372d] pb-2 text-sm"><span>Depósito #{numero} · {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO')}</span><strong>{moneda(montos[Number(numero) - 1] || 0)}</strong></div>)}</div>}
            </Card>
          </main>
        </div>
      </div>
      <style>{'@media print { body * { visibility: hidden !important; } .print-area, .print-area * { visibility: visible !important; } }'}</style>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="flex items-center gap-2 text-sm font-bold text-black"><span className="h-2 w-2 rounded-full bg-[#58a96c]" />{children}</h2>
}

function Metric({ value, label }) {
  return <div><p className="text-xl font-bold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
}

