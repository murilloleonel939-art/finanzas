// =====================================================================
// Edge Function: actualizar-usuario
// =====================================================================
// Cambia `app_role`, `estado`, `full_name` y la asignación de
// empresas de un usuario ya existente, y permite reenviar la invitación.
//
// POR QUÉ NO LO HACE EL FRONTEND DIRECTAMENTE:
//   - `profiles`: el frontend SÍ podría (la policy profiles_update permite
//     al super_admin) y de hecho lo hace para el nombre. Pero `estado` y
//     `app_role` son la frontera de seguridad del sistema: pasarlos por
//     aquí deja un único sitio auditables donde se comprueban.
//   - `user_empresa`: la policy de UPDATE exige super_admin, pero asignar y
//     quitar empresas son varias filas; hacerlo desde el navegador obliga a
//     una transacción que el cliente REST no da. Aquí es una llamada.
//   - Reenviar la invitación necesita `auth.admin`, es decir service_role.
//
// GUARDA ANTI-BLOQUEO: con service_role no hay `auth.uid()`, así que el
// trigger `proteger_campos_profile` de la migración 0006 no se activa (esa
// era justo su condición de salida). Sin un chequeo explícito, el panel
// podría quedarse sin ningún super_admin activo y no habría forma de
// recuperarlo desde la interfaz.

import { requireSuperAdmin } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  aplicarEmpresas,
  superAdminsRestantes,
  validarEmpresas,
} from '../_shared/empresas.ts'

interface Payload {
  accion?: 'actualizar' | 'reenviar-invitacion' | 'enviar-recuperacion'
  userId?: string
  full_name?: string
  app_role?: 'super_admin' | 'usuario'
  estado?: 'activo' | 'inactivo'
  empresas?: Array<{ empresa_id: string; rol: 'contador' | 'cliente' }>
  redirectTo?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405)
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin, userId: llamanteId } = auth.ctx

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
  }

  const accion = payload.accion ?? 'actualizar'
  const userId = String(payload.userId ?? '')
  if (!userId) return json({ error: 'Falta el `userId`.' }, 400)

  const { data: objetivo, error: errObjetivo } = await admin
    .from('profiles')
    .select('id, email, full_name, app_role, estado')
    .eq('id', userId)
    .maybeSingle()

  if (errObjetivo) return json({ error: errObjetivo.message }, 400)
  if (!objetivo) return json({ error: 'Usuario no encontrado.' }, 404)

  // -------------------------------------------------------------------
  // Reenviar invitación / enviar recuperación
  // -------------------------------------------------------------------
  // Las dos acciones hacen lo mismo y es deliberado: `inviteUserByEmail`
  // sobre un usuario que YA existe devuelve error ("user already
  // registered"), así que el enlace nuevo para alguien que no llegó a
  // establecer su contraseña sale por el camino de recuperación. Se
  // mantienen como dos acciones distintas porque significan cosas distintas
  // en la interfaz, aunque compartan implementación.
  if (accion === 'reenviar-invitacion' || accion === 'enviar-recuperacion') {
    const { error } = await admin.auth.resetPasswordForEmail(objetivo.email, {
      redirectTo: payload.redirectTo,
    })
    if (error) return json({ error: error.message }, 400)
    return json({
      ok: true,
      mensaje: `Enlace enviado a ${objetivo.email}.`,
    })
  }

  // -------------------------------------------------------------------
  // Actualización
  // -------------------------------------------------------------------
  const cambios: Record<string, unknown> = {}

  if (payload.full_name !== undefined) {
    cambios.full_name = String(payload.full_name).trim() || null
  }

  if (payload.app_role !== undefined) {
    if (!['super_admin', 'usuario'].includes(payload.app_role)) {
      return json({ error: 'app_role inválido.' }, 400)
    }
    if (payload.app_role !== objetivo.app_role) {
      if (payload.app_role === 'usuario' && objetivo.id === llamanteId) {
        return json(
          { error: 'No puedes quitarte a ti mismo el rol de super administrador.' },
          400
        )
      }
      // Solo hay que verificar el "último admin" al BAJAR de rol. Subir a
      // otro usuario nunca deja el sistema sin administrador.
      if (payload.app_role === 'usuario') {
        const restantes = await superAdminsRestantes(admin, objetivo.id)
        if (restantes === 0) {
          return json(
            {
              error:
                'Es el último super administrador activo. Nombra a otro antes ' +
                'de quitarle el rol.',
              codigo: 'ULTIMO_ADMIN',
            },
            409
          )
        }
      }
      cambios.app_role = payload.app_role
    }
  }

  if (payload.estado !== undefined) {
    if (!['activo', 'inactivo'].includes(payload.estado)) {
      return json({ error: 'estado inválido.' }, 400)
    }
    if (payload.estado !== objetivo.estado) {
      if (payload.estado === 'inactivo' && objetivo.id === llamanteId) {
        return json({ error: 'No puedes desactivar tu propia cuenta.' }, 400)
      }
      // Desactivar al último super_admin activo tiene el mismo efecto que
      // quitarle el rol: nadie puede volver a entrar al panel.
      if (
        payload.estado === 'inactivo' &&
        objetivo.app_role === 'super_admin' &&
        objetivo.estado === 'activo'
      ) {
        const restantes = await superAdminsRestantes(admin, objetivo.id)
        if (restantes === 0) {
          return json(
            {
              error:
                'Es el último super administrador activo. Activa o nombra a otro ' +
                'antes de desactivar a este.',
              codigo: 'ULTIMO_ADMIN',
            },
            409
          )
        }
      }
      cambios.estado = payload.estado
    }
  }

  if (Object.keys(cambios).length > 0) {
    const { error } = await admin.from('profiles').update(cambios).eq('id', objetivo.id)
    if (error) return json({ error: error.message }, 400)
  }

  // -------------------------------------------------------------------
  // Asignación de empresas (solo si viene el campo)
  // -------------------------------------------------------------------
  // `empresas: undefined` = no tocar la asignación.
  // `empresas: []`          = quitar todas.
  if (payload.empresas !== undefined) {
    const validado = await validarEmpresas(admin, payload.empresas)
    if (!validado.ok) return json({ error: validado.mensaje }, 400)

    const aplicado = await aplicarEmpresas(admin, objetivo.id, validado.lista)
    if (!aplicado.ok) {
      return json(
        {
          error: `Los datos del perfil se guardaron, pero falló la asignación de empresas: ${aplicado.mensaje}`,
          codigo: 'EMPRESAS_FALLIDAS',
        },
        400
      )
    }
  }

  return json({ ok: true, userId: objetivo.id, email: objetivo.email })
})
