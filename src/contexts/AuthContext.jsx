import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)          // usuario de auth.users
  const [profile, setProfile] = useState(null)    // fila de public.profiles
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  // Evita cargar el perfil dos veces cuando onAuthStateChange y el efecto
  // inicial se disparan casi a la vez (pasa en StrictMode y al recuperar sesión).
  const cargandoPerfil = useRef(false)

  const cargarPerfil = useCallback(async (authUser) => {
    if (!authUser) {
      setProfile(null)
      return
    }
    if (cargandoPerfil.current) return
    cargandoPerfil.current = true
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error) throw error
      setProfile(data)
      setProfileError(null)
    } catch (err) {
      setProfile(null)
      setProfileError(err.message ?? 'No se pudo cargar el perfil')
    } finally {
      cargandoPerfil.current = false
    }
  }, [])

  useEffect(() => {
    let activo = true

    // Sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!activo) return
      setUser(session?.user ?? null)
      await cargarPerfil(session?.user ?? null)
      if (activo) setLoading(false)
    })

    // Cambios posteriores (login, logout, refresh de token, OAuth)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!activo) return
        const u = session?.user ?? null
        setUser(u)
        await cargarPerfil(u)
        if (activo) setLoading(false)
      }
    )

    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }, [])

  // Un usuario inactivo no puede entrar. El RLS ya le niega todos los datos
  // (ver is_active_user() en la migración 0006), pero además se cierra la
  // sesión aquí para que no quede una app vacía y confusa en pantalla.
  const inactivo = profile?.estado === 'inactivo'

  useEffect(() => {
    if (inactivo) {
      supabase.auth.signOut()
    }
  }, [inactivo])

  const value = {
    user,
    profile,
    loading,
    profileError,
    inactivo,
    isSuperAdmin: profile?.app_role === 'super_admin',
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    recargarPerfil: () => cargarPerfil(user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
