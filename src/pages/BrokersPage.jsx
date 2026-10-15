import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { listarBrokers, borrarBroker } from '@/lib/brokers-datos'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Loader2, Plus, ChevronRight, Trash2, AlertCircle } from 'lucide-react'

const LOGOS_BROKERS = {
  interactivebrokers: 'interactive-brokers.png', quotex: 'quotex.png', charlesschwab: 'charles-schwab.png', fidelity: 'fidelity.png',
  tdameritrade: 'td-ameritrade.png', etrade: 'etrade.png', vanguard: 'vanguard.png', merrilledge: 'merrill-edge.png', degiro: 'degiro.png',
  traderepublic: 'trade-republic.png', scalablecapital: 'scalable-capital.png', trii: 'trii.png', tyba: 'tyba.png', renta4: 'renta4.png',
  daviviendacorredores: 'renta4.png', casadebolsa: 'casa-de-bolsa.png', gbm: 'gbm.png', actinver: 'actinver.png', kuspit: 'kuspit.png',
  balanz: 'balanz.png', iolinvertironline: 'iol.png', cocoscapital: 'cocos-capital.png', racional: 'racional.png', renta4chile: 'renta4-chile.png',
  larrainvial: 'larrainvial.png', fynsa: 'fynsa.png', renta4peru: 'renta4-peru.png', credicorpcapital: 'gbm.png', renta4espana: 'renta4-espana.png',
  etoro: 'etoro.png', robinhood: 'robinhood.png', hapi: 'hapi.png', bitso: 'bitso.png', buda: 'buda.png',
}

function LogoBroker({ nombre }) {
  const [fallo, setFallo] = useState(false)
  const clave = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const archivo = LOGOS_BROKERS[clave]
  return <div className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg bg-slate-50 px-2">
    {!fallo && archivo ? <img src={`/logos-brokers/${archivo}?v=2`} alt={`Logo de ${nombre}`} className="max-h-9 max-w-full object-contain" onError={() => setFallo(true)} /> : <span className="text-2xl font-bold text-blue-700">{nombre.trim().charAt(0).toUpperCase()}</span>}
  </div>
}

/**
 * BrokersPage: listado de brokers de la empresa.
 *
 * Columnas reales de `brokers` (migración 0003): `nombre_broker` y `moneda`.
 * La moneda es la divisa base de la CAJA (depósitos y retiros), no la de los
 * activos — pueden discrepar, y la 0003 dice que cada una manda en su ámbito.
 *
 * No se muestran totales aquí: exigirían traer movimientos y activos de todos
 * los brokers para pintar una lista. Eso vive en BrokerDetail, donde ya se
 * cargan.
 */
export default function BrokersPage() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [brokerABorrar, setBrokerABorrar] = useState(null)

  const { data: brokers = [], isLoading, error } = useQuery({
    queryKey: ['brokers', empresaId],
    queryFn: () => listarBrokers(empresaId),
  })

  const { mutate: eliminar, isPending: borrando } = useMutation({
    mutationFn: (id) => borrarBroker(empresaId, id),
    onSuccess: () => {
      setBrokerABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['brokers', empresaId] })
    },
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Brokers</h1>
            <p className="text-sm text-muted-foreground">
              Cajas, posiciones y precios de cada broker
            </p>
          </div>
          <Button
            onClick={() => navigate(`/empresa/${empresaId}/brokers/crear`)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo broker
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-6 border-l-4 border-l-destructive">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">No se pudieron cargar los brokers</p>
                <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
              </div>
            </div>
          </Card>
        ) : brokers.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl font-bold text-primary">$</div>
            <p className="text-muted-foreground mb-4">No hay brokers creados aún</p>
            <Button
              onClick={() => navigate(`/empresa/${empresaId}/brokers/crear`)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear el primer broker
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brokers.map((broker) => (
              <Card key={broker.id} className="group cursor-pointer overflow-hidden border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md" onClick={() => navigate(`/empresa/${empresaId}/brokers/${broker.id}`)}>
                <div className="flex items-start justify-between p-4 pb-3">
                  <div>
                    <LogoBroker nombre={broker.nombre_broker} />
                    <h3 className="mt-3 text-sm font-semibold">{broker.nombre_broker}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Moneda de caja: {broker.moneda}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setBrokerABorrar(broker) }} className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50" title="Borrar broker"><Trash2 className="h-4 w-4" /></button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
                <div className="border-t px-4 py-3 text-xs text-primary">Ver movimientos y posiciones</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!brokerABorrar}
        onOpenChange={(abierto) => !abierto && setBrokerABorrar(null)}
        title={`¿Borrar ${brokerABorrar?.nombre_broker}?`}
        description="Dejará de aparecer en los listados junto con sus movimientos, activos y precios. Nada se borra de la base."
        actionText="Borrar"
        onConfirm={() => eliminar(brokerABorrar.id)}
        isLoading={borrando}
      />
    </div>
  )
}
