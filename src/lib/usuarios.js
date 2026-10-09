/**
 * Capa de datos de la gestión de usuarios (FASE 10).
 *
 * Aísla aquí las dos cosas que el resto de la app no debería saber:
 *   1. Que invitar y editar usuarios pasa por Edge Functions (necesitan la
 *      service_role key, que no puede estar en el navegador).
 *   2. Cómo se compone el listado: `profiles` + `user_empresa` + `empresas`
 *      son tres consultas porque RLS no permite un JOIN embebido fiable
 *      entre profiles y empresas de otro usuario.
 *
 * Las páginas usan estas funciones, nunca `supabase.functions.invoke`
 * directo, para que un cambio en el contrato de las funciones sea un solo
 * archivo.
 */
import { supabase } from '@/lib/supabase'

/**
 * Invoca una Edge Function y convierte su respuesta en un error legible.
 *
 * `supabase.functions.invoke` NO lanza en respuestas 4xx/5xx: devuelve el
 * error del transporte en `error` y deja el cuerpo en `data`. Sin desenvolver
 * el cuerpo aquí, un 409 "ya existe ese email" se mostraría al usuario como
 * un genérico "non-2xx status code", que no dice nada.
 */
async function invocar(nombre, body) {
  const { data, error } = await supabase.functions.invoke(nombre, { body })

  if (error) {
    // `error.context` es la Response; de ahí sale el mensaje real de la función.
    let mensaje = error.message ?? 'Error al llamar al servidor'
    let codigo
    try {
      const detalle = await error.context?.json?.()
      if (detalle?.error) mensaje = detalle.error
      codigo = detalle?.codigo
    } catch {
      // La respuesta no traía JSON (red caída, 502 del proxy...). Se queda
      // el mensaje genérico, que ya es informativo.
    }

    // Distingue "la función no está desplegada" de "la función dijo que no".
    // Es el fallo más probable en un proyecto nuevo y el más confuso.
    if (/failed to send|not found|404/i.test(mensaje)) {
      mensaje =
        'No se pudo contactar con la función. Comprueba que está desplegada ' +
        '(ver supabase/functions/README.md).'
    }

    const e = new Error(mensaje)
    e.codigo = codigo
    throw e
  }

  // La función puede devolver 200 con un `aviso` (ej. el usuario se invitó
  // pero no se pudieron ajustar los roles). Se propaga para que la interfaz
  // lo muestre en vez de dar por bueno un éxito parcial.
  return data
}

/** Devuelve la URL de reset/invitación a la que apuntan los correos. */
function redirectTo() {
  return `${window.location.origin}/reset-password`
}

export async function invitarUsuario({ email, full_name, app_role, estado, empresas }) {
  return invocar('invitar-usuario', {
    email,
    full_name,
    app_role,
    estado,
    empresas,
    redirectTo: redirectTo(),
  })
}

export async function actualizarUsuario({
  userId,
  full_name,
  app_role,
  estado,
  empresas,
}) {
  return invocar('actualizar-usuario', {
    accion: 'actualizar',
    userId,
    full_name,
    app_role,
    estado,
    empresas,
    redirectTo: redirectTo(),
  })
}

/** Reenvía el enlace de acceso a quien no llegó a establecer su contraseña. */
export async function reenviarInvitacion(userId) {
  return invocar('actualizar-usuario', {
    accion: 'reenviar-invitacion',
    userId,
    redirectTo: redirectTo(),
  })
}

/**
 * Lista de usuarios con sus empresas asignadas.
 *
 * Se trae todo de una vez y se cruza en memoria en lugar de hacer una
 * consulta por usuario: para un panel de administración con decenas de
 * usuarios eso es 3 consultas en total frente a 1+N, y el tiempo de ida y
 * vuelta pesa más que el ancho de banda.
 */
export async function listarUsuarios({ busqueda = '', soloActivos = false } = {}) {
  const [profilesRes, vinculosRes, empresasRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, app_role, estado, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('user_empresa')
      .select('id, user_id, empresa_id, rol, deleted_at')
      .is('deleted_at', null),
    supabase.from('empresas').select('id, nombre, estado').is('deleted_at', null).order('nombre'),
  ])

  // El primer error se propaga: si falla `empresas`, el cruce daría usuarios
  // sin empresa y parecería un problema de datos, no de permisos.
  const error = profilesRes.error ?? vinculosRes.error ?? empresasRes.error
  if (error) throw new Error(error.message)

  const empresasPorId = new Map((empresasRes.data ?? []).map((e) => [e.id, e]))

  const vinculosPorUsuario = new Map()
  for (const v of vinculosRes.data ?? []) {
    const lista = vinculosPorUsuario.get(v.user_id) ?? []
    lista.push({
      vinculo_id: v.id,
      empresa_id: v.empresa_id,
      rol: v.rol,
      nombre: empresasPorId.get(v.empresa_id)?.nombre ?? '(empresa eliminada)',
    })
    vinculosPorUsuario.set(v.user_id, lista)
  }

  let usuarios = (profilesRes.data ?? []).map((p) => ({
    ...p,
    empresas: (vinculosPorUsuario.get(p.id) ?? []).sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    ),
  }))

  if (soloActivos) usuarios = usuarios.filter((u) => u.estado === 'activo')

  const q = busqueda.trim().toLowerCase()
  if (q) {
    usuarios = usuarios.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q)
    )
  }

  return usuarios
}

/** Empresas disponibles para asignar. Reutilizable en otras fases. */
export async function listarEmpresas() {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, estado')
    .is('deleted_at', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data ?? []
}
