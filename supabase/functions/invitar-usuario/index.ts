// =====================================================================
// Edge Function: invitar-usuario
// =====================================================================
// FASE 10. Implementa el paso 1-2 del flujo de D10:
//   1. Valida que quien llama es super_admin.
//   2. auth.admin.inviteUserByEmail(email, { data: {...} }).
//   3. El trigger `handle_new_user` (migración 0007) crea el profile y los
//      vínculos user_empresa EN LA MISMA TRANSACCIÓN del alta.
//   4. Se corrige el `rol` por empresa (el trigger siempre pone 'cliente').
//
// El paso 4 no se puede meter en el trigger: el rol es por empresa y una
// sola clave de raw_user_meta_data no puede expresar "contador en A y
// cliente en B" (ver D15 en _shared/empresas.ts).
//
// POR QUÉ ESTO ES UNA EDGE FUNCTION Y NO UN INSERT DESDE EL FRONTEND:
// crear un usuario exige la service_role key, que se salta el RLS por
// completo. Esa clave no puede estar en el bundle del navegador. La función
// es el único sitio donde vive, y solo la usa después de verificar el rol.

import { requireSuperAdmin } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { aplicarEmpresas, validarEmpresas } from '../_shared/empresas.ts'

interface Payload {
  email?: string
  full_name?: string
  app_role?: 'super_admin' | 'usuario'
  estado?: 'activo' | 'inactivo'
  empresas?: Array<{ empresa_id: string; rol: 'contador' | 'cliente' }>
  redirectTo?: string
}

// Validación deliberadamente laxa. La idea es descartar basura obvia antes
// de gastar una llamada al API de Auth, no reimplementar el RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405)
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin } = auth.ctx

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
  }

  const email = String(payload.email ?? '').trim().toLowerCase()
  const full_name = String(payload.full_name ?? '').trim() || null
  const app_role = payload.app_role ?? 'usuario'
  const estado = payload.estado ?? 'activo'

  if (!EMAIL_RE.test(email)) {
    return json({ error: 'El email no tiene un formato válido.' }, 400)
  }
  if (!['super_admin', 'usuario'].includes(app_role)) {
    return json({ error: 'app_role inválido.' }, 400)
  }
  if (!['activo', 'inactivo'].includes(estado)) {
    return json({ error: 'estado inválido.' }, 400)
  }

  // Quien invita no puede regalarse un igual por accidente: si ya existe el
  // email, el panel debe usar el diálogo de edición, no crear otro usuario.
  // `profiles.email` es único por índice lower(email), así que sin esta
  // comprobación el fallo llegaría como error opaco de Auth.
  const { data: existente } = await admin
    .from('profiles')
    .select('id, estado')
    .eq('email', email)
    .maybeSingle()

  if (existente) {
    return json(
      {
        error: 'Ya existe un usuario con ese email.',
        codigo: 'YA_EXISTE',
        userId: existente.id,
      },
      409
    )
  }

  const empresas = await validarEmpresas(admin, payload.empresas)
  if (!empresas.ok) return json({ error: empresas.mensaje }, 400)

  // Los metadatos NO llevan el rol por empresa (no se puede representar).
  // El trigger crea los vínculos con 'cliente'; el rol real se aplica abajo.
  const { data: invitado, error: errInvitacion } = await admin.auth.admin
    .inviteUserByEmail(email, {
      data: {
        full_name,
        app_role,
        estado,
        empresa_ids: empresas.lista.map((e) => e.empresa_id),
        invited_by: auth.ctx.userId,
      },
      redirectTo: payload.redirectTo,
    })

  if (errInvitacion) {
    return json({ error: errInvitacion.message, codigo: 'INVITACION_FALLIDA' }, 400)
  }

  const userId = invitado?.user?.id

  // El trigger es síncrono dentro de la transacción del alta, así que al
  // llegar aquí el profile existe. Si no, algo impidió el alta y se informa
  // en vez de dejar un usuario sin perfil (que el frontend mostraría como
  // "tu cuenta no está configurada").
  if (!userId) {
    return json({ error: 'Auth no devolvió el usuario creado.' }, 500)
  }

  // Corrección del rol por empresa. Si falla, el usuario YA está invitado:
  // se devuelve el aviso pero no se revierte la invitación, porque el correo
  // con el enlace ya salió y borrar la cuenta dejaría el enlace roto.
  const aplicado = await aplicarEmpresas(admin, userId, empresas.lista)
  if (!aplicado.ok) {
    return json(
      {
        ok: true,
        userId,
        email,
        aviso:
          'El usuario quedó invitado, pero no se pudieron ajustar los roles por ' +
          `empresa: ${aplicado.mensaje}. Corrígelos desde el panel.`,
      },
      200
    )
  }

  // Comprobación de que el trigger hizo su trabajo. Sirve para diagnosticar
  // al instante un trigger desactivado, en vez de descubrirlo cuando el
  // usuario entra y no ve nada.
  const { data: perfilCreado } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  return json({
    ok: true,
    userId,
    email,
    perfilCreado: Boolean(perfilCreado),
    empresas: empresas.lista,
    aviso: perfilCreado
      ? undefined
      : 'El usuario se creó pero su perfil no aparece. Revisa el trigger ' +
        'handle_new_user (migración 0007).',
  })
})
