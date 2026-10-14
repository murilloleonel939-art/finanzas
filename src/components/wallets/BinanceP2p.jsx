import { useMemo, useState } from 'react'
import { ArrowUpDown, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import MonthFilter, { MES_TODOS, YearFilter, filtrarPorAno, filtrarPorMes, formatMes, getAnosDisponibles, getMesesDisponibles } from '@/components/shared/MonthFilter'

const POR_PAGINA = 20
const numero = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fechaLocal(fecha) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''))
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}
function valor(valor, formato = numero) {
  const n = Number(valor)
  return Number.isFinite(n) ? formato.format(n) : '—'
}

export default function BinanceP2p({ ordenes = [], cargando, onImportar }) {
  const [ano, setAno] = useState('')
  const [mes, setMes] = useState(MES_TODOS)
  const [pagina, setPagina] = useState(0)
  const anos = useMemo(() => getAnosDisponibles(ordenes), [ordenes])
  const anoActivo = ano || anos[0] || ''
  const ordenesAno = useMemo(() => filtrarPorAno(ordenes, anoActivo), [ordenes, anoActivo])
  const meses = useMemo(() => getMesesDisponibles(ordenesAno), [ordenesAno])
  const filtradas = useMemo(() => filtrarPorMes(ordenesAno, mes), [ordenesAno, mes])
  const resumen = useMemo(() => filtradas.reduce((acumulado, orden) => {
    const diferencia = Number(orden.diferencia_cambio)
    if (Number.isFinite(diferencia)) {
      if (diferencia >= 0) acumulado.positivo += diferencia
      else acumulado.negativo += diferencia
    }
    return acumulado
  }, { positivo: 0, negativo: 0 }), [filtradas])
  const totalPaginas = Math.ceil(filtradas.length / POR_PAGINA)
  const paginaSegura = Math.min(pagina, Math.max(0, totalPaginas - 1))
  const visibles = filtradas.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA)
  const periodo = mes === MES_TODOS ? `Año ${anoActivo || 'actual'}` : formatMes(mes)

  return <>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3"><YearFilter id="p2p-year-filter" anos={anos} value={anoActivo} onChange={(v) => { setAno(v); setMes(MES_TODOS); setPagina(0) }} /><MonthFilter id="p2p-month-filter" meses={meses} value={mes} onChange={(v) => { setMes(v); setPagina(0) }} label="Período" /></div>
      <Button onClick={onImportar} className="gap-2"><Upload className="w-4 h-4" />Importar P2P</Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card className="p-4"><p className="text-sm text-muted-foreground">Diferencia positiva</p><p className="text-xl font-semibold text-emerald-600">{pesos.format(resumen.positivo)}</p><p className="text-xs text-muted-foreground mt-1">{periodo}</p></Card>
      <Card className="p-4"><p className="text-sm text-muted-foreground">Diferencia negativa</p><p className="text-xl font-semibold text-rose-600">{pesos.format(resumen.negativo)}</p><p className="text-xs text-muted-foreground mt-1">{periodo}</p></Card>
    </div>
    <Card>
      {cargando ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        : filtradas.length === 0 ? <div className="p-8 text-center"><ArrowUpDown className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground mb-4">Sin órdenes P2P en {periodo}.</p><Button variant="outline" onClick={onImportar} className="gap-2"><Upload className="w-4 h-4" />Importar historial P2P</Button></div>
        : <><div className="overflow-x-auto rounded-lg border bg-background"><table className="w-full min-w-[1450px] text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-4 py-3 text-left font-medium">Fecha</th><th className="px-4 py-3 text-left font-medium">Tipo</th><th className="px-4 py-3 text-left font-medium">Moneda</th><th className="px-4 py-3 text-right font-medium">Monto</th><th className="px-4 py-3 text-right font-medium">comision</th><th className="px-4 py-3 text-left font-medium">tipo fiat</th><th className="px-4 py-3 text-right font-medium">TRM</th><th className="px-4 py-3 text-right font-medium">M. de compra</th><th className="px-4 py-3 text-right font-medium">Valor Trm</th><th className="px-4 py-3 text-right font-medium">Diferencia de cambio</th></tr></thead><tbody>{visibles.map((orden) => { const comision = Number(orden.tarifa_creador || 0) + Number(orden.comision_tomador || 0); const diferencia = Number(orden.diferencia_cambio); return <tr key={orden.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-4 py-3 whitespace-nowrap">{fechaLocal(orden.fecha)}</td><td className="px-4 py-3">{orden.tipo_orden}</td><td className="px-4 py-3">{orden.activo}</td><td className="px-4 py-3 text-right whitespace-nowrap">{valor(orden.cantidad)} {orden.activo}</td><td className="px-4 py-3 text-right whitespace-nowrap">{valor(comision)}</td><td className="px-4 py-3">{orden.tipo_fiat}</td><td className="px-4 py-3 text-right whitespace-nowrap">{valor(orden.trm)}</td><td className="px-4 py-3 text-right whitespace-nowrap">{orden.tipo_fiat === 'COP' ? valor(orden.precio_total, pesos) : valor(orden.precio_total)}</td><td className="px-4 py-3 text-right whitespace-nowrap">{orden.tipo_fiat === 'COP' ? valor(orden.valor_trm, pesos) : valor(orden.valor_trm)}</td><td className={`px-4 py-3 text-right whitespace-nowrap ${diferencia > 0 ? 'text-emerald-600' : diferencia < 0 ? 'text-rose-600' : ''}`}>{orden.tipo_fiat === 'COP' ? valor(orden.diferencia_cambio, pesos) : valor(orden.diferencia_cambio)}</td></tr> })}</tbody></table></div>{totalPaginas > 1 && <div className="flex justify-between items-center px-4 py-3 border-t"><p className="text-xs text-muted-foreground">Página {paginaSegura + 1} de {totalPaginas} · {filtradas.length} órdenes</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={paginaSegura === 0}>Anterior</Button><Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={paginaSegura >= totalPaginas - 1}>Siguiente</Button></div></div>}</>}
    </Card>
  </>
}
