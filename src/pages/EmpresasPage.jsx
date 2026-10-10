import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import EmpresaDialog from '@/components/EmpresaDialog'
import { listarEmpresas } from '@/lib/empresas'
import { nombrePais } from '@/lib/paises'
import { formatFecha } from '@/lib/utils'

/**
 * CRUD de empresas .
 * Escritura solo para super_admin — lo garantiza el RLS (0006), no esta página.
 */
export default function EmpresasPage() {
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('todas')
  const [dialogo, setDialogo] = useState({ abierto: false, empresa: null })

  const { data: empresas = [], isLoading, error } = useQuery({
    queryKey: ['empresas', { busqueda, estado }],
    queryFn: () => listarEmpresas({ busqueda, estado }),
  })

  // Se pide un conjunto estable para los contadores: si se calcularan sobre
  // el resultado ya filtrado, "4 activas" cambiaría al escribir en el
  // buscador y el número dejaría de significar lo que dice.
  const { data: todas = [] } = useQuery({
    queryKey: ['empresas', 'todas'],
    queryFn: () => listarEmpresas({ estado: 'todas' }),
  })

  const stats = useMemo(
    () => ({
      total: todas.length,
      activas: todas.filter((e) => e.estado === 'activa').length,
      suspendidas: todas.filter((e) => e.estado === 'suspendida').length,
      paises: new Set(todas.map((e) => e.pais).filter(Boolean)).size,
    }),
    [todas]
  )

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada empresa es un espacio aislado: sus datos no se cruzan con los de otra.
          </p>
        </div>
        <Button onClick={() => setDialogo({ abierto: true, empresa: null })}>
          <Plus className="h-4 w-4" />
          Nueva empresa
        </Button>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat titulo="Empresas" valor={stats.total} />
        <Stat titulo="Activas" valor={stats.activas} />
        <Stat titulo="Suspendidas" valor={stats.suspendidas} />
        <Stat titulo="Países" valor={stats.paises} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o país…"
                className="pl-9"
              />
            </div>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="activa">Solo activas</SelectItem>
                <SelectItem value="suspendida">Solo suspendidas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando empresas…</p>}

          {error && (
            <p className="p-6 text-sm text-destructive">
              No se pudieron cargar las empresas: {error.message}
            </p>
          )}

          {!isLoading && !error && empresas.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {todas.length === 0
                  ? 'Todavía no hay empresas. Crea la primera para empezar.'
                  : `Ninguna empresa coincide con los filtros.`}
              </p>
            </div>
          )}

          {!isLoading && !error && empresas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Empresa</th>
                    <th className="px-4 py-3 font-medium">País</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Creada</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{e.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {nombrePais(e.pais) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={e.estado === 'activa' ? 'activo' : 'inactivo'}>
                          {e.estado}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatFecha(e.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar empresa"
                            onClick={() => setDialogo({ abierto: true, empresa: e })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Borrar una empresa es lógico: deja de ser accesible para todos, incluidos
        sus usuarios, pero nada se elimina de la base. Se puede restaurar.
      </p>

      <EmpresaDialog
        abierto={dialogo.abierto}
        empresa={dialogo.empresa}
        onCerrar={() => setDialogo({ abierto: false, empresa: null })}
      />
    </div>
  )
}

function Stat({ titulo, valor }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-2xl font-semibold">{valor}</p>
      </CardContent>
    </Card>
  )
}
