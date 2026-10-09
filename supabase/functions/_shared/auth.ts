// =====================================================================
// Verificación de que quien llama es un super_admin activo.
// =====================================================================
// POR QUÉ ESTO ES OBLIGATORIO Y NO OPCIONAL:
// una Edge Function con `verify_jwt = false` (o incluso con verificación de
// JWT activa) es alcanzable por CUALQUIER usuario autenticado del proyecto,
// incluido un `cliente` de una empresa. La service_role key que usa después
// se salta el RLS por completo. Sin esta comprobación, un cliente podría
// invitarse a sí mismo como super_admin y leer las finanzas de todos.
//
// La comprobación se hace con el JWT del llamante contra la tabla profiles,
// no con un valor del body: el body lo controla el atacante.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface AdminCtx {
  /** Cliente con el JWT del llamante: respeta RLS. */
  comoUsuario: SupabaseClient
  /** Cliente con service_role: se salta RLS. Usar solo tras autorizar. */
  admin: SupabaseClient
  /** id del super_admin que hace la petición. */
  userId: string
}

export type ResultadoAuth =
  | { ok: true; ctx: AdminCtx }
  | { ok: false; status: number; mensaje: string }

export async function requireSuperAdmin(req: Request): Promise<ResultadoAuth> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, mensaje: 'Falta el token de sesión.' }
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !anonKey || !serviceKey) {
    // Error de despliegue, no del cliente. Los secretos los inyecta Supabase
    // automáticamente; si faltan es que la función no está bien desplegada.
    return {
      ok: false,
      status: 500,
      mensaje: 'La función no tiene configurados sus secretos de Supabase.',
    }
  }

  // Cliente que actúa COMO el usuario que llama (respeta RLS).
  const comoUsuario = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await comoUsuario.auth.getUser()
  if (userError || !userData?.user) {
    return { ok: false, status: 401, mensaje: 'Sesión inválida o caducada.' }
  }

  // La lectura del propio perfil siempre pasa el RLS (profiles_select incluye
  // `id = auth.uid()`), así que un fallo aquí es un usuario sin perfil.
  const { data: perfil, error: perfilError } = await comoUsuario
    .from('profiles')
    .select('app_role, estado')
    .eq('id', userData.user.id)
    .single()

  if (perfilError || !perfil) {
    return { ok: false, status: 403, mensaje: 'No se encontró tu perfil.' }
  }
  if (perfil.app_role !== 'super_admin' || perfil.estado !== 'activo') {
    return {
      ok: false,
      status: 403,
      mensaje: 'Solo un super administrador activo puede hacer esto.',
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return { ok: true, ctx: { comoUsuario, admin, userId: userData.user.id } }
}
