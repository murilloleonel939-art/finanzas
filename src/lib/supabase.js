import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.\n' +
    'Copia .env.example a .env.local y rellena los valores ' +
    '(Project Settings → API en el dashboard de Supabase).'
  )
}

// El scaffold se entregó con un marcador en la clave. Sin esta comprobación,
// la app arrancaría y fallaría más tarde con errores confusos de red en cada
// llamada; así el problema se ve de inmediato y con la instrucción exacta.
if (supabaseAnonKey.includes('placeholder') || supabaseAnonKey.length < 40) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY sigue siendo el marcador del scaffold.\n' +
    'Pega la clave real (Project Settings → API → Project API keys → anon public) ' +
    'en .env.local y reinicia el servidor de desarrollo.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // necesario para los enlaces de recuperación
  },
})

// NOTA: aquí solo va la anon key. La service_role se salta el RLS por
// completo y vive únicamente en el servidor (Edge Functions y worker de IA).
