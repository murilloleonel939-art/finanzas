import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet } from 'lucide-react'

/**
 * Registro público DESACTIVADO.
 *
 * En este proyecto los usuarios solo entran por invitación.
 * El super_admin crea la cuenta, asigna las empresas y comunica las credenciales
 * por un canal seguro.

 */
export default function Register() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">FinanzAdmin Pro</span>
          </div>
          <CardTitle className="text-xl">Acceso por invitación</CardTitle>
          <CardDescription>
            Las cuentas se crean desde el panel de administración.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si recibiste una invitación por correo, abre el enlace del mensaje y
            establece tu contraseña desde ahí. No hace falta registrarse aquí.
          </p>

          <Link to="/login" className="block">
            <Button variant="outline" className="w-full">
              Volver al inicio de sesión
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
