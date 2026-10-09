import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, ArrowLeft, MailCheck } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setCargando(true)
    // No se muestra error si el email no existe: revelar qué correos están
    // registrados permitiría enumerar a los usuarios de la plataforma.
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    } finally {
      setEnviado(true)
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
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            Te enviaremos un enlace para establecer una nueva.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {enviado ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md bg-muted px-3 py-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">Revisa tu correo</p>
                  <p className="mt-1 text-muted-foreground">
                    Si <span className="font-medium">{email}</span> tiene una cuenta,
                    recibirá un enlace para restablecer la contraseña.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    El correo puede tardar unos minutos. Revisa también la carpeta
                    de spam.
                  </p>
                </div>
              </div>

              <Link to="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com" disabled={cargando} />
              </div>

              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? 'Enviando…' : 'Enviar enlace'}
              </Button>

              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
