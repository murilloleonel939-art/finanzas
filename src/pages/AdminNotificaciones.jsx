import { useEffect, useState } from 'react'
import { enviarEmail, listNotificaciones, listPlantillas } from '@/lib/admin-api'
import { formatearFecha } from '@/lib/admin-utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Send, Mail } from 'lucide-react'

/**
 * Panel de notificaciones por email .
 *
 * Dos mitades: arriba el formulario de envío (probando o real), abajo el
 * historial. El historial es la fuente de verdad de si algo salió o no,
 * porque el error visible en pantalla se pierde al recargar.
 */
export default function AdminNotificaciones() {
  const [plantillas, setPlantillas] = useState([])
  const [historial, setHistorial] = useState([])
  const [total, setTotal] = useState(0)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)

  const [form, setForm] = useState({
    tipo: 'prueba',
    destinatario: '',
    asunto: '',
    cuerpo: '',
    variables: '{}'
  })

  useEffect(() => {
    cargarPlantillas()
  }, [])

  useEffect(() => {
    cargarHistorial()
  }, [filtroEstado])

  const cargarPlantillas = async () => {
    try {
      setPlantillas(await listPlantillas())
    } catch (err) {
      console.error('Error cargando plantillas:', err)
    }
  }

  const cargarHistorial = async () => {
    try {
      setError(null)
      setLoading(true)
      const datos = await listNotificaciones({ estado: filtroEstado || null })
      setHistorial(datos.notificaciones)
      setTotal(datos.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEnviar = async (e) => {
    e.preventDefault()
    setError(null)
    setMensaje(null)

    let variables = {}
    try {
      variables = JSON.parse(form.variables || '{}')
    } catch {
      setError('Las variables no son JSON válido. Ejemplo: {"nombre":"Ana"}')
      return
    }

    try {
      setEnviando(true)
      const r = await enviarEmail({
        tipo: form.tipo,
        destinatario: form.destinatario,
        asunto: form.asunto || undefined,
        cuerpo: form.cuerpo || undefined,
        variables
      })
      setMensaje(r.mensaje || 'Email enviado.')
      setForm((f) => ({ ...f, destinatario: '', asunto: '', cuerpo: '' }))
      await cargarHistorial()
    } catch (err) {
      setError(err.message)
      await cargarHistorial()
    } finally {
      setEnviando(false)
    }
  }

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envío de emails y su historial. El SMTP se configura en{' '}
          <span className="font-mono text-xs">/admin/config</span>.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {mensaje && (
        <div className="rounded-md border border-ingreso/30 bg-ingreso/5 px-4 py-3 text-sm">
          {mensaje}
        </div>
      )}

      {/* --- Formulario de envío --- */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Enviar email
        </h2>

        <form onSubmit={handleEnviar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Plantilla</Label>
              <select
                id="tipo"
                value={form.tipo}
                onChange={cambiar('tipo')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="personalizado">Personalizado (sin plantilla)</option>
                {plantillas.map((p) => (
                  <option key={p.clave} value={p.clave}>
                    {p.clave} — {p.descripcion || p.asunto}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Con una plantilla, asunto y cuerpo son opcionales; si los dejás
                vacíos se usan los de la plantilla.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="destinatario">Destinatario</Label>
              <Input
                id="destinatario"
                type="email"
                required
                placeholder="alguien@ejemplo.com"
                value={form.destinatario}
                onChange={cambiar('destinatario')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asunto">Asunto</Label>
            <Input
              id="asunto"
              placeholder={form.tipo === 'personalizado' ? 'Obligatorio' : 'Opcional con plantilla'}
              value={form.asunto}
              onChange={cambiar('asunto')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cuerpo">Cuerpo</Label>
            <textarea
              id="cuerpo"
              rows={5}
              placeholder={form.tipo === 'personalizado' ? 'Obligatorio' : 'Opcional con plantilla'}
              value={form.cuerpo}
              onChange={cambiar('cuerpo')}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variables">Variables (JSON)</Label>
            <Input
              id="variables"
              placeholder='{"nombre":"Ana","url":"https://..."}'
              value={form.variables}
              onChange={cambiar('variables')}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Se sustituyen los <span className="font-mono">{'{{clave}}'}</span> del
              asunto y el cuerpo.
            </p>
          </div>

          <Button type="submit" disabled={enviando}>
            <Send className="mr-2 h-4 w-4" />
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </Card>

      {/* --- Historial --- */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Historial ({total})
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="error">Error</option>
              <option value="pendiente">Pendiente</option>
            </select>
            <Button variant="outline" size="icon" onClick={cargarHistorial} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no se envió ningún email.
          </p>
        ) : (
          <ul>
            {historial.map((n) => (
              <li
                key={n.id}
                className="flex items-start justify-between gap-4 border-b px-1 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium">{n.asunto}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {n.destinatario} · {n.tipo} · {formatearFecha(n.created_at)}
                  </p>
                  {n.error_mensaje && (
                    <p className="mt-1 font-mono text-xs text-destructive">
                      {n.error_mensaje}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    n.estado === 'enviado'
                      ? 'activo'
                      : n.estado === 'error'
                        ? 'inactivo'
                        : 'outline'
                  }
                >
                  {n.estado}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
