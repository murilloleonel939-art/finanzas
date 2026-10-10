import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet } from 'lucide-react'

/**
 * Registro público DESACTIVADO.
 *
 * En este proyecto los usuarios solo entran por invitación (decisión D10):
 * el super_admin invita, Supabase manda el correo, y el trigger
 * handle_new_user() crea el profile y asigna las empresas.
 *
 * Requisito de configuración: en Auth → Providers → Email debe estar
 * desactivado "Enable email signups". Si esa opción sigue activa, alguien
 * podría registrarse solo y quedaría con un perfil sin ninguna empresa.
 *
 * El enlace de la invitación llega con un token; al abrirlo Supabase crea la
 * sesión y el usuario establece su contraseña. Ese flujo se construye en la
 * La Edge Function de invitación hace el alta real.
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
