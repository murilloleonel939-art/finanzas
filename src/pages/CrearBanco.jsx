import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BANCOS_POR_PAIS, resolverNombreBanco } from '@/lib/bancosPorPais'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react'

/**
 * CrearBanco: formulario para crear un banco dentro de una empresa.
 * 
 * Paso 1: seleccionar país (del catálogo que sacamos de la empresa)
 * Paso 2: seleccionar banco del catálogo por país, o escribir uno manual
 * Paso 3: llenar el resto (nombre_oficial, código)
 * 
 * El nombre_banco que se guarda es el que resuelve resolverNombreBanco() (D21).
 */
export default function CrearBanco() {
  const { empresaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Formulario: paso a paso
  const [pais, setPais] = useState('')
  const [bancoPrecargado, setBancoPrecargado] = useState('')
  const [nombreBanco, setNombreBanco] = useState('')
  const [nombreOficial, setNombreOficial] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')

  // Crear banco en BD
  const { mutate: crearBanco, isPending } = useMutation({
    mutationFn: async () => {
      setError('')

      // Validar
      if (!pais) throw new Error('Selecciona un país')
      if (!nombreBanco) throw new Error('El nombre del banco es requerido')

      // Resolver el nombre final (D21: si es «__otro__» vacío, devuelve null)
      const nombre = resolverNombreBanco(pais, nombreBanco)
      if (!nombre) throw new Error('El nombre del banco no puede estar vacío')

      // Insertar
      const { error: err } = await supabase.from('bancos').insert({
        empresa_id: empresaId,
        pais,
        nombre_banco: nombre,
        nombre_oficial: nombreOficial || null,
        codigo: codigo || null,
        created_by: user?.id,
      })

      if (err) throw err
    },
    onSuccess: () => {
      navigate(`/empresa/${empresaId}/bancos`)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  // Cuando selecciona un banco del catálogo, rellena el input
  const handleSeleccionarBanco = (nombre) => {
    setNombreBanco(nombre === '__otro__' ? '' : nombre)
    setBancoPrecargado(nombre)
  }

  // Bancos disponibles para el país seleccionado
  const bancosDelPais = pais ? BANCOS_POR_PAIS[pais] || [] : []
  const hayBancos = bancosDelPais.length > 0

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Crear banco</h1>
            <p className="text-sm text-muted-foreground">Añade un nuevo banco a tu empresa</p>
          </div>
        </div>

        {/* Formulario */}
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
              <Label htmlFor="pais" className="text-sm font-medium">
                País *
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                El catálogo de bancos varía según el país.
              </p>
              <Select value={pais} onValueChange={setPais}>
                <SelectTrigger id="pais">
                  <SelectValue placeholder="Selecciona un país" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(BANCOS_POR_PAIS)
                    .sort()
                    .map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Banco (si hay país) */}
            {pais && (
              <div>
                <Label htmlFor="banco" className="text-sm font-medium">
                  Banco *
                </Label>
                {hayBancos && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Selecciona de la lista o escribe uno manual.
                  </p>
                )}
                <div className="space-y-3">
                  {hayBancos && (
                    <Select value={bancoPrecargado} onValueChange={handleSeleccionarBanco}>
                      <SelectTrigger id="banco">
                        <SelectValue placeholder="O elige del catálogo" />
                      </SelectTrigger>
                      <SelectContent>
                        {bancosDelPais.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                        <SelectItem value="__otro__">Otro (escribir manual)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    id="nombre-banco"
                    placeholder={hayBancos ? 'O escribe aquí' : 'Nombre del banco'}
                    value={nombreBanco}
                    onChange={(e) => setNombreBanco(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* Nombre oficial (opcional) */}
            <div>
              <Label htmlFor="nombre-oficial" className="text-sm font-medium">
                Nombre oficial (opcional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                El nombre completo o razón social del banco.
              </p>
              <Input
                id="nombre-oficial"
                placeholder="Ej: Banco de Bogotá S.A."
                value={nombreOficial}
                onChange={(e) => setNombreOficial(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Código (opcional) */}
            <div>
              <Label htmlFor="codigo" className="text-sm font-medium">
                Código (opcional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Código interno o Swift del banco.
              </p>
              <Input
                id="codigo"
                placeholder="Ej: BOGOTACO"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/empresa/${empresaId}/bancos`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending || !pais || !nombreBanco}
                className="gap-2"
              >
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
