import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatearMonto } from '@/lib/monedas'
import { listarBrokers, borrarBroker } from '@/lib/brokers-datos'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Loader2, Plus, ChevronRight, Trash2, AlertCircle, TrendingUp } from 'lucide-react'

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
    mutationFn: (id) => borrarBroker(id),
    onSuccess: () => {
      setBrokerABorrar(null)
      queryClient.invalidateQueries({ queryKey: ['brokers', empresaId] })
    },
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl">
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
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
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
          <div className="space-y-3">
            {brokers.map((broker) => (
              <Card
                key={broker.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/empresa/${empresaId}/brokers/${broker.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{broker.nombre_broker}</h3>
                      <p className="text-xs text-muted-foreground">
                        Moneda de caja: {broker.moneda}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        // Sin esto, el clic burbujearía a la tarjeta y navegaría.
                        e.stopPropagation()
                        setBrokerABorrar(broker)
                      }}
                      className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                      title="Borrar broker"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
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
