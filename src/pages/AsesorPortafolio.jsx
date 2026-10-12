import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertCircle, Bot, CheckCircle2, Info, Loader2, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatearMonto } from '@/lib/monedas'
import { listarBrokers, listarActivos, listarMovimientosBroker } from '@/lib/brokers-datos'
import { analizarPortafolio, recomendacionInformativa } from '@/lib/asesor-portafolio'

function dinero(valor, moneda) {
  return formatearMonto(valor, moneda || 'USD')
}

export default function AsesorPortafolio() {
  const { empresaId } = useParams()
  const { data: brokers = [], isLoading: cargandoBrokers, error: errorBrokers } = useQuery({
    queryKey: ['brokers', empresaId],
    queryFn: () => listarBrokers(empresaId),
    enabled: !!empresaId,
  })
  const resultados = useQueries({
    queries: brokers.flatMap((broker) => [
      { queryKey: ['asesor-activos', broker.id], queryFn: () => listarActivos(broker.id), enabled: !!broker.id },
      { queryKey: ['asesor-movimientos', broker.id], queryFn: () => listarMovimientosBroker(broker.id), enabled: !!broker.id },
    ]),
  })
  const cargandoDatos = cargandoBrokers || resultados.some((resultado) => resultado.isLoading)
  const errorDatos = errorBrokers || resultados.find((resultado) => resultado.error)?.error
  const datos = useMemo(() => {
    const porBroker = brokers.map((broker, indice) => ({
      broker,
      activos: resultados[indice * 2]?.data || [],
      movimientos: resultados[indice * 2 + 1]?.data || [],
    }))
    return analizarPortafolio({
      brokers,
      activos: porBroker.flatMap((fila) => fila.activos.map((activo) => ({ ...activo, broker_id: fila.broker.id }))),
      movimientos: porBroker.flatMap((fila) => fila.movimientos.map((movimiento) => ({
        ...movimiento,
        broker_id: fila.broker.id,
        broker_moneda: movimiento.broker_moneda || fila.broker.moneda,
      }))),
    })
  }, [brokers, resultados])

  if (cargandoDatos) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (errorDatos) return <div className="p-8 text-red-600">No se pudo cargar el portafolio: {errorDatos.message}</div>

  const iconos = { alerta: <AlertCircle className="h-5 w-5 text-red-600" />, aviso: <AlertCircle className="h-5 w-5 text-amber-600" />, ok: <CheckCircle2 className="h-5 w-5 text-green-600" />, info: <Info className="h-5 w-5 text-blue-600" /> }

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3"><Bot className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Asesor del portafolio</h1></div>
            <p className="text-sm text-muted-foreground">Análisis informativo basado exclusivamente en los datos registrados en Finanzas.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800"><ShieldCheck className="h-4 w-4" /> Sin conexión a Interactive Brokers</div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Resumen titulo="Posiciones" valor={datos.totalActivos} />
          <Resumen titulo="Valor actual" valor={datos.monedas.length === 1 ? dinero(datos.valorTotal, datos.monedas[0].moneda) : `${datos.monedas.length} monedas`} />
          <Resumen titulo="Invertido" valor={datos.monedas.length === 1 ? dinero(datos.invertidoTotal, datos.monedas[0].moneda) : 'Por moneda'} />
          <Resumen titulo="Ganancia / pérdida" valor={datos.monedas.length === 1 ? dinero(datos.gananciaTotal, datos.monedas[0].moneda) : 'Por moneda'} positivo={datos.gananciaTotal >= 0} />
        </div>

        <Card className="border-blue-200 bg-blue-50 p-5"><div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 className="font-semibold text-blue-900">Lectura informativa</h2><p className="mt-1 text-sm text-blue-900">{recomendacionInformativa(datos)}</p></div></div></Card>

        <section><h2 className="mb-3 text-xl font-semibold">Observaciones</h2><div className="grid gap-3 md:grid-cols-2">{datos.observaciones.map((observacion, indice) => <Card key={`${observacion.tipo}-${indice}`} className="flex items-start gap-3 p-4">{iconos[observacion.tipo]}<p className="text-sm">{observacion.texto}</p></Card>)}</div></section>

        <section><h2 className="mb-3 text-xl font-semibold">Distribución por moneda</h2>{datos.monedas.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No hay datos suficientes para mostrar distribución.</Card> : <div className="grid gap-4 md:grid-cols-2">{datos.monedas.map((fila) => <Card key={fila.moneda} className="p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{fila.moneda}</h3><span className="text-sm text-muted-foreground">{fila.activos} posición{fila.activos === 1 ? '' : 'es'}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><Dato titulo="Valor actual" valor={dinero(fila.valorActual, fila.moneda)} /><Dato titulo="Invertido" valor={dinero(fila.invertido, fila.moneda)} /><Dato titulo="Resultado" valor={dinero(fila.ganancia, fila.moneda)} positivo={fila.ganancia >= 0} /><Dato titulo="Rentabilidad" valor={fila.porcentaje == null ? '—' : `${fila.porcentaje.toFixed(2)} %`} positivo={fila.ganancia >= 0} /></div></Card>)}</div>}</section>

        <section><h2 className="mb-3 text-xl font-semibold">Posiciones principales</h2><Card className="overflow-hidden"><div className="divide-y">{datos.activos.slice(0, 10).map((activo) => <div key={`${activo.moneda}-${activo.nombre}`} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><p className="font-medium">{activo.nombre}</p><p className="text-xs text-muted-foreground">{activo.cantidad} unidades · {activo.moneda}</p></div><p className="font-semibold">{dinero(activo.valorActual, activo.moneda)}</p></div>)}{datos.activos.length === 0 && <p className="p-6 text-sm text-muted-foreground">No hay posiciones registradas.</p>}</div></Card></section>

        <p className="text-xs text-muted-foreground">Este módulo es informativo. No envía órdenes, no se conecta con Interactive Brokers y no sustituye asesoría financiera profesional. Los resultados dependen de que tus movimientos y precios estén actualizados.</p>
      </div>
    </div>
  )
}

function Resumen({ titulo, valor, positivo }) { return <Card className="p-4"><p className="text-xs text-muted-foreground">{titulo}</p><p className={`mt-2 text-xl font-bold ${positivo === undefined ? '' : positivo ? 'text-green-700' : 'text-red-700'}`}>{valor}</p></Card> }
function Dato({ titulo, valor, positivo }) { return <div><p className="text-xs text-muted-foreground">{titulo}</p><p className={`mt-1 font-medium ${positivo === undefined ? '' : positivo ? 'text-green-700' : 'text-red-700'}`}>{valor}</p></div> }

