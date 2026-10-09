import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PantallaCargando } from '@/components/ProtectedRoute'

/**
 * Redirect post-login (§11.2 del PRD).
 * super_admin → /admin ; cualquier otro → /workspace
 */
export default function Home() {
  const { user, profile, loading } = useAuth()

  if (loading) return <PantallaCargando />

  if (!user) return <Navigate to="/login" replace />

  // Sesión sin perfil: ProtectedRoute mostrará el aviso correspondiente.
  if (!profile) return <PantallaCargando mensaje="Cargando tu perfil…" />

  if (profile.app_role === 'super_admin') {
    return <Navigate to="/admin" replace />
  }

  return <Navigate to="/workspace" replace />
}
