import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

function PantallaCargando({ mensaje = 'Cargando…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">{mensaje}</p>
      </div>
    </div>
  )
}

/**
 * Protege las rutas autenticadas.
 * @param {boolean} soloAdmin — además exige app_role = 'super_admin'.
 */
export default function ProtectedRoute({ children, soloAdmin = false }) {
  const { user, profile, loading, profileError } = useAuth()
  const location = useLocation()

  // Mientras se resuelve la sesión inicial no se puede decidir nada.
  if (loading) return <PantallaCargando />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Sesión válida pero sin perfil: la cuenta no quedó bien creada.
  // Es recuperable (el super_admin puede revisarla), así que se informa en
  // vez de dejar la pantalla en blanco.
  if (profileError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Tu cuenta no está configurada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No se encontró un perfil asociado a tu usuario. Pide a un administrador
            que revise tu cuenta.
          </p>
          {profileError && (
            <p className="mt-4 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              {profileError}
            </p>
          )}
        </div>
      </div>
    )
  }

  // El usuario inactivo ya se está deslogueando en el AuthContext.
  // El spinner evita el parpadeo del login mientras termina.
  if (profile.estado === 'inactivo') {
    return <PantallaCargando mensaje="Tu acceso está desactivado." />
  }

  if (soloAdmin && profile.app_role !== 'super_admin') {
    return <Navigate to="/workspace" replace />
  }

  return children
}

export { PantallaCargando }
