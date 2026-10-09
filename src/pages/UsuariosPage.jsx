import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Mail, Pencil, Search, UserPlus, Users as UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import UsuarioDialog from '@/components/UsuarioDialog'
import { listarUsuarios, reenviarInvitacion } from '@/lib/usuarios'
import { formatFecha } from '@/lib/utils'

/**
 * Gestión de usuarios (FASE 10, §11.3 del PRD).
 *
 * La lista se trae completa y se filtra en memoria. Es deliberado: el panel
 * es de uso interno y tiene decenas de usuarios, no miles, y así el buscador
 * responde sin ida y vuelta al servidor ni parpadeo de la tabla.
 */
export default function UsuariosPage() {
  const [busqueda, setBusqueda] = useState('')
  const [dialogo, setDialogo] = useState({ abierto: false, usuario: null })
  const [mensaje, setMensaje] = useState(null)

  const { data: usuarios = [], isLoading, error } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => listarUsuarios(),
  })

  const stats = useMemo(() => {
    const total = usuarios.length
    const activos = usuarios.filter((u) => u.estado === 'activo').length
    const admins = usuarios.filter((u) => u.app_role === 'super_admin').length
    const sinEmpresa = usuarios.filter(
      (u) => u.app_role !== 'super_admin' && u.empresas.length === 0
    ).length
    return { total, activos, admins, sinEmpresa }
  }, [usuarios])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q) ||
        u.empresas.some((e) => e.nombre.toLowerCase().includes(q))
    )
  }, [usuarios, busqueda])

  const reenviar = useMutation({
    mutationFn: (userId) => reenviarInvitacion(userId),
    onSuccess: (data, userId) => {
      const u = usuarios.find((x) => x.id === userId)
      setMensaje({ tipo: 'ok', texto: data?.mensaje ?? `Enlace enviado a ${u?.email}.` })
    },
    onError: (err) => setMensaje({ tipo: 'error', texto: err.message }),
  })

  function abrirNuevo() {
    setMensaje(null)
    setDialogo({ abierto: true, usuario: null })
  }

  function abrirEdicion(usuario) {
    setMensaje(null)
    setDialogo({ abierto: true, usuario })
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invita usuarios y decide a qué empresas acceden.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <UserPlus className="h-4 w-4" />
          Invitar usuario
        </Button>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard titulo="Usuarios" valor={stats.total} />
        <StatCard titulo="Activos" valor={stats.activos} />
        <StatCard titulo="Super admins" valor={stats.admins} />
        <StatCard
          titulo="Sin empresa asignada"
          valor={stats.sinEmpresa}
          resaltar={stats.sinEmpresa > 0}
        />
      </div>

      {mensaje && (
        <div
          className={
            mensaje.tipo === 'error'
              ? 'mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
              : 'mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'
          }
        >
          {mensaje.texto}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, email o empresa…"
                className="pl-9"
              />
            </div>
          </div>

          {isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Cargando usuarios…</p>
          )}

          {error && (
            <p className="p-6 text-sm text-destructive">
              No se pudieron cargar los usuarios: {error.message}
            </p>
          )}

          {!isLoading && !error && filtrados.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <UsersIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {usuarios.length === 0
                  ? 'Todavía no hay usuarios invitados.'
                  : `Ningún usuario coincide con «${busqueda}».`}
              </p>
            </div>
          )}

          {!isLoading && !error && filtrados.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Usuario</th>
                    <th className="px-4 py-3 font-medium">Rol global</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Empresas</th>
                    <th className="px-4 py-3 font-medium">Alta</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => (
                    <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.full_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {u.app_role === 'super_admin' ? (
                          <Badge variant="admin">super_admin</Badge>
                        ) : (
                          <span className="text-muted-foreground">usuario</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.estado === 'activo' ? 'activo' : 'inactivo'}>
                          {u.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {u.empresas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {u.app_role === 'super_admin' ? 'acceso total' : 'ninguna'}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.empresas.map((e) => (
                              <Badge key={e.vinculo_id} variant="outline">
                                {e.nombre}
                                <span className="ml-1 text-muted-foreground">
                                  · {e.rol}
                                </span>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatFecha(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reenviar enlace de acceso"
                            disabled={reenviar.isPending}
                            onClick={() => reenviar.mutate(u.id)}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar usuario"
                            onClick={() => abrirEdicion(u)}
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
        Los usuarios se crean por invitación: no se puede asignar una contraseña
        desde aquí. Si el correo no llega, revisa el SMTP configurado en Supabase
        (ver <code>docs/04-SETUP-SUPABASE.md</code>, paso 6).
      </p>

      <UsuarioDialog
        abierto={dialogo.abierto}
        usuario={dialogo.usuario}
        onCerrar={() => setDialogo({ abierto: false, usuario: null })}
      />
    </div>
  )
}

function StatCard({ titulo, valor, resaltar = false }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p
          className={
            resaltar
              ? 'mt-1 text-2xl font-semibold text-destructive'
              : 'mt-1 text-2xl font-semibold'
          }
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  )
}
