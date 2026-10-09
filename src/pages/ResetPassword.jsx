import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, ShieldCheck } from 'lucide-react'

/**
 * Pantalla de establecimiento de contraseña. Cubre dos casos, que en Supabase
 * llegan por el mismo mecanismo (un token en la URL que crea una sesión):
 *   - Recuperación: el usuario olvidó su contraseña.
 *   - Invitación: el usuario nuevo acepta y elige su contraseña por primera vez.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [listo, setListo] = useState(false)

  // Si no hay sesión, el enlace es inválido o ya caducó.
  const enlaceInvalido = !loading && !user

  useEffect(() => {
    if (listo) {
      const t = setTimeout(() => navigate('/', { replace: true }), 2000)
      return () => clearTimeout(t)
    }
  }, [listo, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setCargando(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setListo(true)
    } catch (err) {
      setError(err.message ?? 'No se pudo actualizar la contraseña.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">FinanzAdmin Pro</span>
          </div>
          <CardTitle className="text-xl">
            {listo ? 'Contraseña actualizada' : 'Nueva contraseña'}
          </CardTitle>
          {!listo && (
            <CardDescription>Elige una contraseña de al menos 8 caracteres.</CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {listo ? (
            <div className="flex items-start gap-3 rounded-md bg-muted px-3 py-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ingreso" />
              <div className="text-sm">
                <p className="font-medium">Todo listo</p>
                <p className="mt-1 text-muted-foreground">
                  Entrando a tu cuenta…
                </p>
              </div>
            </div>
          ) : enlaceInvalido ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Este enlace ya no es válido o ha caducado. Solicita uno nuevo
                desde la pantalla de recuperación.
              </p>
              <Button className="w-full" onClick={() => navigate('/forgot-password')}>
                Solicitar un enlace nuevo
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" autoComplete="new-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={cargando || loading} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmar">Repetir contraseña</Label>
                <Input id="confirmar" type="password" autoComplete="new-password" required
                  value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
                  disabled={cargando || loading} />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={cargando || loading}>
                {cargando ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
