import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, apiJson, getToken, setToken } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  const cargarPerfil = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setProfile(null)
      return null
    }
    try {
      const { user: perfil } = await api('/api/auth/me')
      setUser({ id: perfil.id, email: perfil.email })
      setProfile(perfil)
      setProfileError(null)
      return perfil
    } catch (err) {
      setToken(null)
      setUser(null)
      setProfile(null)
      setProfileError(err.message)
      return null
    }
  }, [])

  useEffect(() => {
    cargarPerfil().finally(() => setLoading(false))
  }, [cargarPerfil])

  const signIn = useCallback(async (email, password) => {
    const { token, user: perfil } = await apiJson('/api/auth/login', 'POST', { email, password })
    setToken(token)
    setUser({ id: perfil.id, email: perfil.email })
    setProfile(perfil)
    setProfileError(null)
    return perfil
  }, [])

  const signOut = useCallback(async () => {
    setToken(null)
    setUser(null)
    setProfile(null)
    setProfileError(null)
  }, [])

  const inactivo = profile?.estado === 'inactivo'

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      profileError,
      inactivo,
      isSuperAdmin: profile?.app_role === 'super_admin',
      signIn,
      signOut,
      recargarPerfil: cargarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
