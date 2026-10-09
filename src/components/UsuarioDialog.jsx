import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Mail, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  actualizarUsuario,
  invitarUsuario,
  listarEmpresas,
  reenviarInvitacion,
} from '@/lib/usuarios'

/**
 * Alta (invitación) y edición de un usuario.
 *
 * Un solo diálogo para los dos casos porque comparten el 80% del formulario
 * y las reglas son idénticas; lo único que cambia es el email (fijo al
 * editar) y el hecho de que al crear se envía una invitación.
 *
 * La asignación de empresas es una lista con casilla + rol por fila, en vez
 * de dos selectores separados: el `rol` es POR EMPRESA (D6), así que un
 * único selector de rol global sería incapaz de expresar "contador en A y
 * cliente en B", que es justo lo que el sistema permite.
 */
export default function UsuarioDialog({ abierto, onCerrar, usuario }) {
  const esEdicion = Boolean(usuario)
  const queryClient = useQueryClient()
  const { profile: perfilActual } = useAuth()

  // El backend rechaza estas dos acciones sobre uno mismo (y con razón:
  // desactivarse o bajarse el rol deja el panel sin administrador). Se
  // desactivan en la interfaz para que el usuario no descubra la regla
  // chocando con un error.
  const esUnoMismo = esEdicion && usuario?.id === perfilActual?.id

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [appRole, setAppRole] = useState('usuario')
  const [estado, setEstado] = useState('activo')
  // { [empresa_id]: 'contador' | 'cliente' } — la presencia de la clave es
  // la casilla marcada. Se guarda así en vez de una lista de ids + otro mapa
  // de roles para que marcar y elegir rol sea una sola escritura.
  const [asignadas, setAsignadas] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const { data: empresas = [], isLoading: cargandoEmpresas } = useQuery({
    queryKey: ['empresas', 'lista'],
    queryFn: listarEmpresas,
    enabled: abierto,
    staleTime: 30_000,
  })

  // Rehidrata el formulario cada vez que se abre, para que no arrastre los
  // datos del usuario anterior al abrir el diálogo de otro.
  useEffect(() => {
    if (!abierto) return
    setError('')
    setAviso('')
    setBusqueda('')
    if (usuario) {
      setFullName(usuario.full_name ?? '')
      setEmail(usuario.email ?? '')
      setAppRole(usuario.app_role ?? 'usuario')
      setEstado(usuario.estado ?? 'activo')
      setAsignadas(
        Object.fromEntries((usuario.empresas ?? []).map((e) => [e.empresa_id, e.rol]))
      )
    } else {
      setFullName('')
      setEmail('')
      setAppRole('usuario')
      setEstado('activo')
      setAsignadas({})
    }
  }, [abierto, usuario])

  const empresasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return empresas
    return empresas.filter((e) => e.nombre.toLowerCase().includes(q))
  }, [empresas, busqueda])

  const empresasPayload = useMemo(
    () =>
      Object.entries(asignadas).map(([empresa_id, rol]) => ({ empresa_id, rol })),
    [asignadas]
  )

  function alternarEmpresa(empresaId, marcada) {
    setAsignadas((prev) => {
      const copia = { ...prev }
      if (marcada) copia[empresaId] = copia[empresaId] ?? 'cliente'
      else delete copia[empresaId]
      return copia
    })
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (esEdicion) {
        return actualizarUsuario({
          userId: usuario.id,
          full_name: fullName,
          app_role: appRole,
          estado,
          empresas: empresasPayload,
        })
      }
      return invitarUsuario({
        email,
        full_name: fullName,
        app_role: appRole,
        estado,
        empresas: empresasPayload,
      })
    },
    onSuccess: (data) => {
      // El backend avisa de éxitos parciales (invitado pero roles sin
      // ajustar). Se muestran en vez de cerrar el diálogo como si todo
      // hubiera ido bien.
      if (data?.aviso) {
        setAviso(data.aviso)
      } else {
        onCerrar()
      }
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err) => setError(err.message),
  })

  const reenviar = useMutation({
    mutationFn: () => reenviarInvitacion(usuario.id),
    onSuccess: (data) => {
      setError('')
      setAviso(data?.mensaje ?? 'Enlace enviado.')
    },
    onError: (err) => {
      setAviso('')
      setError(err.message)
    },
  })

  function onSubmit(e) {
    e.preventDefault()
    setError('')
    setAviso('')

    if (!esEdicion && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Escribe un email válido.')
      return
    }
    // Asignar empresas es opcional: el super_admin puede invitar primero y
    // asignar después. Se avisa, pero no se bloquea, porque hay casos
    // legítimos (una cuenta de administración que no va a ninguna empresa).
    if (appRole === 'usuario' && empresasPayload.length === 0) {
      const seguir = window.confirm(
        'Este usuario no tiene ninguna empresa asignada: podrá entrar, pero no ' +
          'verá datos de ninguna empresa. ¿Continuar?'
      )
      if (!seguir) return
    }

    guardar.mutate()
  }

  const enviando = guardar.isPending || reenviar.isPending

  return (
    <Dialog open={abierto} onOpenChange={(v) => !enviando && !v && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar usuario' : 'Invitar usuario'}</DialogTitle>
          <DialogDescription>
            {esEdicion
              ? 'Cambia el rol global, el estado o las empresas asignadas.'
              : 'Se enviará un correo de invitación. El usuario elige su contraseña y entra con las empresas ya asignadas.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-nombre">Nombre completo</Label>
              <Input
                id="u-nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ana Gómez"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@empresa.com"
                disabled={esEdicion}
                required={!esEdicion}
                autoComplete="off"
              />
              {esEdicion && (
                <p className="text-xs text-muted-foreground">
                  El email de un usuario existente no se puede cambiar (limitación
                  de Supabase Auth). Para cambiarlo, crea otro usuario.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Rol global</Label>
              <Select value={appRole} onValueChange={setAppRole} disabled={esUnoMismo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usuario">
                    usuario — solo las empresas asignadas
                  </SelectItem>
                  <SelectItem value="super_admin">
                    super_admin — panel completo
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {esUnoMismo
                  ? 'No puedes cambiar tu propio rol global.'
                  : 'Es independiente del rol dentro de cada empresa (abajo).'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado} disabled={esUnoMismo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo — puede entrar</SelectItem>
                  <SelectItem value="inactivo">Inactivo — acceso bloqueado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {esUnoMismo
                  ? 'No puedes desactivar tu propia cuenta.'
                  : 'Un usuario inactivo no ve ningún dato: lo bloquea el RLS, no la interfaz.'}
              </p>
            </div>
          </div>

          {/* --- Asignación de empresas --- */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Empresas asignadas</Label>
              <span className="text-xs text-muted-foreground">
                {empresasPayload.length} seleccionada
                {empresasPayload.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="rounded-md border">
              {empresas.length > 5 && (
                <div className="relative border-b p-2">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar empresa…"
                    className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0"
                  />
                </div>
              )}

              <div className="max-h-56 overflow-y-auto">
                {cargandoEmpresas && (
                  <p className="p-4 text-sm text-muted-foreground">Cargando empresas…</p>
                )}

                {!cargandoEmpresas && empresas.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Todavía no hay empresas creadas. El usuario quedará sin
                    asignación hasta que existan.
                  </p>
                )}

                {!cargandoEmpresas && empresas.length > 0 && empresasFiltradas.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Ninguna empresa coincide con «{busqueda}».
                  </p>
                )}

                {empresasFiltradas.map((empresa) => {
                  const marcada = empresa.id in asignadas
                  return (
                    <div
                      key={empresa.id}
                      className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                    >
                      <Checkbox
                        id={`emp-${empresa.id}`}
                        checked={marcada}
                        onCheckedChange={(v) => alternarEmpresa(empresa.id, v === true)}
                      />
                      <label
                        htmlFor={`emp-${empresa.id}`}
                        className="flex flex-1 cursor-pointer items-center gap-2 text-sm"
                      >
                        <span className="truncate">{empresa.nombre}</span>
                        {empresa.estado === 'suspendida' && (
                          <Badge variant="inactivo">suspendida</Badge>
                        )}
                      </label>

                      {marcada && (
                        <Select
                          value={asignadas[empresa.id]}
                          onValueChange={(rol) =>
                            setAsignadas((prev) => ({ ...prev, [empresa.id]: rol }))
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cliente">cliente</SelectItem>
                            <SelectItem value="contador">contador</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>contador</strong> y <strong>cliente</strong> tienen los mismos
              permisos dentro de la empresa: crear cuentas, importar y editar. La
              etiqueta sirve para saber quién es quién.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {aviso && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {aviso}
            </div>
          )}

          <DialogFooter className="items-center gap-2">
            {esEdicion && (
              <Button
                type="button"
                variant="outline"
                onClick={() => reenviar.mutate()}
                disabled={enviando}
                className="sm:mr-auto"
              >
                <Mail className="h-4 w-4" />
                Reenviar enlace de acceso
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {guardar.isPending
                ? esEdicion
                  ? 'Guardando…'
                  : 'Enviando invitación…'
                : esEdicion
                  ? 'Guardar cambios'
                  : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
