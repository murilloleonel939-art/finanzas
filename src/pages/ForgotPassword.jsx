import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, ArrowLeft, ShieldCheck } from 'lucide-react'

export default function ForgotPassword() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">FinanzAdmin Pro</span>
          </div>
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>La recuperación por correo estará disponible al configurar el SMTP propio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-muted px-3 py-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Por ahora pide a un superadministrador que actualice tu contraseña y te la comparta por un canal seguro.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login"><ArrowLeft className="h-4 w-4" />Volver al inicio de sesión</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
