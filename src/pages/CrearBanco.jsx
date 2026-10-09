import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BANCOS_POR_PAIS, OTRO_BANCO, resolverNombreBanco, tieneCatalogo } from '@/lib/bancosPorPais'
import { PAISES, nombrePais } from '@/lib/paises'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearBanco: alta de un banco dentro de una empresa.
 *
 * Columnas reales (migración 0002): `bancos` tiene exactamente `empresa_id`,
 * `pais` y `nombre_banco`. No existen `nombre_oficial` ni `codigo`: el nombre
 * oficial completo se escribe directamente en `nombre_banco` si se quiere.
 *
 * El banco se elige del catálogo de `bancosPorPais.js` (D21) o se escribe a
 * mano con la opción «Otro»; `resolverNombreBanco()` es quien produce el valor
 * final y descarta el centinela.
 */
export default function CrearBanco() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [pais, setPais] = useState('')
  const [seleccion, setSeleccion] = useState('')
  const [escrito, setEscrito] = useState('')
  const [error, setError] = useState('')

  const catalogo = pais ? BANCOS_POR_PAIS[pais] ?? [] : []
  const hayCatalogo = tieneCatalogo(pais)

  // El valor que se guardará: del catálogo, o el texto libre si es «Otro».
  const nombreFinal = resolverNombreBanco(seleccion, escrito)
  // Un país sin catálogo exige escribir el nombre a mano.
  const nombreAMano = !hayCatalogo

  const { mutate: crearBanco, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      if (!pais) throw new Error('Selecciona un país.')
      if (!nombreFinal) throw new Error('Indica el nombre del banco.')

      const { error: err } = await supabase.from('bancos').insert({
        empresa_id: empresaId,
        pais,
        nombre_banco: nombreFinal,
        created_by: user?.id,
      })

      if (err) {
        // Índice único de 0002: (empresa_id, lower(nombre_banco))? No existe tal
        // índice, pero sí el de banco+numero en cuentas. Un duplicado de banco
        // no está impedido por el esquema: se avisa igual porque repetir el
        // mismo banco casi siempre es un descuido.
        if (err.code === '23505') {
          throw new Error('Ya existe un banco con ese nombre en esta empresa.')
        }
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] })
      navigate(`/empresa/${empresaId}/bancos`)
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Nuevo banco</h1>
            <p className="text-sm text-muted-foreground">Añade un banco a la empresa</p>
          </div>
        </div>

        <Card className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              crearBanco()
            }}
            className="space-y-6"
          >
            {/* País */}
            <div>
              <Label htmlFor="pais">País *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                El catálogo de bancos depende del país.
              </p>
              <Select
                value={pais}
                onValueChange={(v) => {
                  setPais(v)
                  // Cambiar de país invalida la selección anterior.
                  setSeleccion('')
                  setEscrito('')
                }}
              >
                <SelectTrigger id="pais">
                  <SelectValue placeholder="Selecciona un país" />
                </SelectTrigger>
                <SelectContent>
                  {PAISES.map((p) => (
                    <SelectItem key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Banco */}
            {pais && (
              <div>
                <Label htmlFor="banco">Banco *</Label>
                <div className="space-y-3 mt-2">
                  {hayCatalogo ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {catalogo.length} bancos en el catálogo de {nombrePais(pais)}.
                      </p>
                      <Select value={seleccion} onValueChange={setSeleccion}>
                        <SelectTrigger id="banco">
                          <SelectValue placeholder="Elige del catálogo" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogo.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                          <SelectItem value={OTRO_BANCO}>Otro (escribir a mano)</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {nombrePais(pais)} no tiene catálogo. Escribe el nombre del banco.
                    </p>
                  )}

                  {/* Campo manual: siempre visible si no hay catálogo, o si se eligió «Otro». */}
                  {(nombreAMano || seleccion === OTRO_BANCO) && (
                    <Input
                      placeholder="Nombre del banco"
                      value={escrito}
                      onChange={(e) => setEscrito(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || !nombreFinal} className="gap-2">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear banco
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
