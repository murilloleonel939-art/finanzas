import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertCircle, Bot, CheckCircle2, Info, Loader2, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatearMonto } from '@/lib/monedas'
import { listarBrokers, listarActivos, listarMovimientosBroker } from '@/lib/brokers-datos'
import { listarWallets, listarSaldos, listarMovimientosWallet } from '@/lib/wallets-datos'
import { listarCuentasComisionistasFiducias, obtenerCuentaComisionistaFiducia } from '@/lib/comisionistas-fiducias'
import { esInteres, esMovimientoEarn } from '@/lib/earnConfig'
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
  const { data: wallets = [], isLoading: cargandoWallets, error: errorWallets } = useQuery({
    queryKey: ['wallets-empresa', empresaId],
    queryFn: () => listarWallets(empresaId),
    enabled: !!empresaId,
  })
  const { data: cuentasFiducia = [], isLoading: cargandoCuentasFiducia, error: errorCuentasFiducia } = useQuery({
    queryKey: ['cuentas-comisionistas-fiducias', empresaId],
    queryFn: () => listarCuentasComisionistasFiducias(empresaId),
    enabled: !!empresaId,
  })
  const resultadosBrokers = useQueries({
    queries: brokers.flatMap((broker) => [
      { queryKey: ['asesor-activos', broker.id], queryFn: () => listarActivos(broker.id), enabled: !!broker.id },
      { queryKey: ['asesor-movimientos', broker.id], queryFn: () => listarMovimientosBroker(broker.id), enabled: !!broker.id },
    ]),
  })
  const resultadosWallets = useQueries({
    queries: wallets.flatMap((wallet) => [
      { queryKey: ['asesor-saldos-wallet', wallet.id], queryFn: () => listarSaldos(wallet.id), enabled: !!wallet.id },
      { queryKey: ['asesor-movimientos-wallet', wallet.id], queryFn: () => listarMovimientosWallet(wallet.id), enabled: !!wallet.id },
    ]),
  })
  const resultadosFiducias = useQueries({
    queries: cuentasFiducia.map((cuenta) => ({
      queryKey: ['asesor-cuenta-fiducia', empresaId, cuenta.id],
      queryFn: () => obtenerCuentaComisionistaFiducia(empresaId, cuenta.id),
      enabled: !!empresaId && !!cuenta.id,
    })),
  })
  const cargandoDatos = cargandoBrokers || cargandoWallets || cargandoCuentasFiducia || resultadosBrokers.some((resultado) => resultado.isLoading) || resultadosWallets.some((resultado) => resultado.isLoading) || resultadosFiducias.some((resultado) => resultado.isLoading)
  const errorDatos = errorBrokers || errorWallets || errorCuentasFiducia || resultadosBrokers.find((resultado) => resultado.error)?.error || resultadosWallets.find((resultado) => resultado.error)?.error || resultadosFiducias.find((resultado) => resultado.error)?.error
  const datos = useMemo(() => {
    const porBroker = brokers.map((broker, indice) => ({
      broker,
      activos: resultadosBrokers[indice * 2]?.data || [],
      movimientos: resultadosBrokers[indice * 2 + 1]?.data || [],
    }))
    const porWallet = wallets.map((wallet, indice) => {
      const movimientos = resultadosWallets[indice * 2 + 1]?.data || []
      return {
        ...wallet,
        saldos: resultadosWallets[indice * 2]?.data || [],
        movimientos: movimientos.map((movimiento) => ({
          ...movimiento,
          esEarn: esMovimientoEarn(movimiento, wallet.proveedor_nombre),
          esInteres: esInteres(movimiento.descripcion, wallet.proveedor_nombre),
        })),
      }
    })
    const fiducias = cuentasFiducia.map((cuenta, indice) => resultadosFiducias[indice]?.data || cuenta)
    return analizarPortafolio({
      brokers: porBroker.map((fila) => fila.broker),
      activos: porBroker.flatMap((fila) => fila.activos.map((activo) => ({ ...activo, broker_id: fila.broker.id }))),
      movimientos: porBroker.flatMap((fila) => fila.movimientos.map((movimiento) => ({
        ...movimiento,
        broker_id: fila.broker.id,
        broker_moneda: movimiento.broker_moneda || fila.broker.moneda,
      }))),
      wallets: porWallet,
      fiducias,
    })
  }, [brokers, wallets, cuentasFiducia, resultadosBrokers, resultadosWallets, resultadosFiducias])

  if (cargandoDatos) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (errorDatos) return <div className="p-8 text-red-600">No se pudo cargar el portafolio: {errorDatos.message}</div>

  const iconos = { alerta: <AlertCircle className="h-5 w-5 text-red-600" />, aviso: <AlertCircle className="h-5 w-5 text-amber-600" />, ok: <CheckCircle2 className="h-5 w-5 text-green-600" />, info: <Info className="h-5 w-5 text-blue-600" /> }

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3"><Bot className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Asesor del portafolio</h1></div>
            <p className="text-sm text-muted-foreground">Análisis informativo de brokers, wallets Earn, comisionistas y fiducias, por moneda fiat (USD, EUR y COP) y con histórico de los últimos 12 meses.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800"><ShieldCheck className="h-4 w-4" /> Sin conexión a Interactive Brokers</div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Resumen titulo="Productos" valor={datos.productos.length} />
          <Resumen titulo="Valor actual" valor={datos.monedas.length === 1 ? dinero(datos.valorTotal, datos.monedas[0].moneda) : `${datos.monedas.length} monedas`} />
          <Resumen titulo="Rendimientos 12 meses" valor={datos.monedas.length === 1 ? dinero(datos.rendimientos12mTotal, datos.monedas[0].moneda) : 'Por moneda'} positivo={datos.rendimientos12mTotal >= 0} />
          <Resumen titulo="Perfil cliente" valor={datos.perfilCliente || 'Moderado'} />
        </div>

        <Card className="border-blue-200 bg-blue-50 p-5"><div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 className="font-semibold text-blue-900">Lectura informativa</h2><p className="mt-1 text-sm text-blue-900">{recomendacionInformativa(datos)}</p></div></div></Card>

        <section><h2 className="mb-3 text-xl font-semibold">Observaciones</h2><div className="grid gap-3 md:grid-cols-2">{datos.observaciones.map((observacion, indice) => <Card key={`${observacion.tipo}-${indice}`} className="flex items-start gap-3 p-4">{iconos[observacion.tipo]}<p className="text-sm">{observacion.texto}</p></Card>)}</div></section>

        <section><h2 className="mb-3 text-xl font-semibold">Distribución por moneda</h2>{datos.monedas.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No hay datos suficientes para mostrar distribución.</Card> : <div className="grid gap-4 md:grid-cols-2">{datos.monedas.map((fila) => <Card key={fila.moneda} className="p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{fila.moneda}</h3><span className="text-sm text-muted-foreground">{fila.productos} producto{fila.productos === 1 ? '' : 's'}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><Dato titulo="Valor actual" valor={dinero(fila.valorActual, fila.moneda)} /><Dato titulo="Invertido" valor={fila.invertido ? dinero(fila.invertido, fila.moneda) : '—'} /><Dato titulo="Resultado" valor={dinero(fila.ganancia, fila.moneda)} positivo={fila.ganancia >= 0} /><Dato titulo="Rendimientos 12m" valor={dinero(fila.rendimientos, fila.moneda)} positivo={fila.rendimientos >= 0} /><Dato titulo="Comisiones" valor={dinero(fila.comisiones, fila.moneda)} /><Dato titulo="Fuentes" valor={fila.fuentes.join(', ') || '—'} /></div></Card>)}</div>}</section>

        <section><h2 className="mb-3 text-xl font-semibold">Mejoramiento según perfil moderado</h2><div className="grid gap-3 md:grid-cols-2">{(datos.mejoras || []).map((mejora, indice) => <Card key={`${mejora.tipo}-${indice}`} className="flex items-start gap-3 p-4">{iconos[mejora.tipo]}<p className="text-sm">{mejora.texto}</p></Card>)}</div></section>

        <section><h2 className="mb-3 text-xl font-semibold">Riesgo por moneda</h2>{!datos.riesgos?.length ? <Card className="p-6 text-sm text-muted-foreground">No hay datos suficientes para mostrar riesgo.</Card> : <div className="grid gap-4 md:grid-cols-3">{datos.riesgos.map((fila) => <Card key={fila.moneda} className="p-5"><h3 className="mb-3 font-semibold">{fila.moneda}</h3><div className="space-y-2 text-sm"><Dato titulo="Riesgo bajo" valor={`${fila.bajoPct.toFixed(1)} %`} /><Dato titulo="Riesgo moderado" valor={`${fila.moderadoPct.toFixed(1)} %`} /><Dato titulo="Riesgo alto" valor={`${fila.altoPct.toFixed(1)} %`} positivo={fila.altoPct <= 30} /><Dato titulo="Sin clasificar" valor={`${fila.sinClasificarPct.toFixed(1)} %`} /></div></Card>)}</div>}</section>

        <section><h2 className="mb-3 text-xl font-semibold">Productos y riesgo propio</h2><Card className="overflow-hidden"><div className="divide-y">{datos.productos.slice(0, 12).map((producto, indice) => <div key={`${producto.fuente}-${producto.moneda}-${producto.nombre}-${indice}`} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{producto.nombre}</p><p className="text-xs text-muted-foreground">{producto.fuente} · {producto.moneda} · Riesgo producto: {producto.riesgo} · {producto.comparacionPerfil}</p></div><div className="text-right"><p className="font-semibold">{dinero(producto.valorActual, producto.moneda)}</p><p className={`text-xs ${producto.rendimiento12m >= 0 ? 'text-green-700' : 'text-red-700'}`}>12m: {dinero(producto.rendimiento12m, producto.moneda)}</p></div></div>)}{datos.productos.length === 0 && <p className="p-6 text-sm text-muted-foreground">No hay productos registrados.</p>}</div></Card></section>

        <p className="text-xs text-muted-foreground">Este módulo es informativo. No envía órdenes, no se conecta con Interactive Brokers y no sustituye asesoría financiera profesional. Los resultados dependen de que tus movimientos, saldos, extractos y precios estén actualizados.</p>
      </div>
    </div>
  )
}

function Resumen({ titulo, valor, positivo }) { return <Card className="p-4"><p className="text-xs text-muted-foreground">{titulo}</p><p className={`mt-2 text-xl font-bold ${positivo === undefined ? '' : positivo ? 'text-green-700' : 'text-red-700'}`}>{valor}</p></Card> }
function Dato({ titulo, valor, positivo }) { return <div><p className="text-xs text-muted-foreground">{titulo}</p><p className={`mt-1 font-medium ${positivo === undefined ? '' : positivo ? 'text-green-700' : 'text-red-700'}`}>{valor}</p></div> }
