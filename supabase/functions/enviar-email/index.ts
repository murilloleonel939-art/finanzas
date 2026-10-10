// =====================================================================
// Envío de emails (Edge Function `enviar-email`)
// =====================================================================
// Lee la configuración SMTP desde admin_config, renderiza la plantilla y
// envía. Registra el resultado en `notificaciones` (éxito o error) para que
// el panel de logs tenga trazabilidad completa.
//
// Requiere las mismas variables que el resto: SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (inyectadas por Supabase).

import { requireSuperAdmin } from '../_shared/auth.ts'
import { json, corsHeaders } from '../_shared/cors.ts'
// Se fija la misma major que la de package.json (^10.1.0), que es la que se
// verificó contra un servidor SMTP real. Dejar un @6 aquí mientras el
// proyecto instala otra distinta hace que el comportamiento diverja sin aviso.
import nodemailer from 'npm:nodemailer@10'

interface EnvioBody {
  tipo?: string
  destinatario?: string
  asunto?: string
  cuerpo?: string
  variables?: Record<string, string>
}

/** Sustituye {{clave}} por su valor. Deja el placeholder si no hay valor. */
function renderizar(texto: string, variables: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, clave) =>
    Object.prototype.hasOwnProperty.call(variables, clave) ? variables[clave] : match
  )
}

/** Lee toda la configuración de email de una sola consulta. */
async function leerConfigEmail(admin: any): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from('admin_config')
    .select('clave, valor')
    .eq('grupo', 'email')

  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`)

  const mapa: Record<string, string> = {}
  for (const fila of data ?? []) mapa[fila.clave] = fila.valor
  return mapa
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)
  const { admin, userId } = auth.ctx

  let body: EnvioBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
  }

  const variables = body.variables ?? {}
  let tipo = body.tipo ?? 'personalizado'
  let asunto = body.asunto ?? ''
  let cuerpo = body.cuerpo ?? ''
  const destinatario = body.destinatario?.trim()

  if (!destinatario || !destinatario.includes('@')) {
    return json({ error: 'Falta un destinatario válido.' }, 400)
  }

  try {
    // Si se pidió una plantilla y no se mandó texto propio, la resolvemos.
    if (tipo !== 'personalizado' && (!asunto || !cuerpo)) {
      const { data: plantilla, error: errPlantilla } = await admin
        .from('notif_plantillas')
        .select('asunto, cuerpo')
        .eq('clave', tipo)
        .single()

      if (errPlantilla || !plantilla) {
        return json({ error: `No existe la plantilla "${tipo}".` }, 404)
      }
      asunto = asunto || plantilla.asunto
      cuerpo = cuerpo || plantilla.cuerpo
    }

    if (!asunto || !cuerpo) {
      return json({ error: 'Faltan asunto y cuerpo (o una plantilla válida).' }, 400)
    }

    asunto = renderizar(asunto, variables)
    cuerpo = renderizar(cuerpo, variables)

    const cfg = await leerConfigEmail(admin)

    if (cfg.EMAIL_ACTIVO !== 'true') {
      // No es un fallo de datos: es una decisión de configuración. Se registra
      // igual para que quede rastro de que alguien intentó enviar con el
      // módulo apagado.
      await admin.from('notificaciones').insert({
        tipo, destinatario, asunto, cuerpo,
        estado: 'error',
        error_mensaje: 'EMAIL_ACTIVO está en false; el envío está deshabilitado.',
        intentos: 0,
        creado_por: userId,
      })
      return json({ error: 'El envío de emails está deshabilitado (EMAIL_ACTIVO=false). Activalo en Configuración.' }, 409)
    }

    const host = cfg.EMAIL_SMTP_HOST
    const port = Number(cfg.EMAIL_SMTP_PORT ?? 587)
    const user = cfg.EMAIL_SMTP_USER
    const pass = cfg.EMAIL_SMTP_PASS
    const remitente = cfg.EMAIL_REMITENTE || 'noreply@finanzas.local'
    // EMAIL_SMTP_SECURE manda si está puesto; si no, se deduce del puerto.
    const secure = cfg.EMAIL_SMTP_SECURE === 'true' || port === 465

    if (!host) {
      return json({ error: 'Falta EMAIL_SMTP_HOST en la configuración.' }, 400)
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    })

    await transporter.sendMail({
      from: remitente,
      to: destinatario,
      subject: asunto,
      text: cuerpo,
    })

    const { data: registro } = await admin.from('notificaciones').insert({
      tipo, destinatario, asunto, cuerpo,
      estado: 'enviado',
      intentos: 1,
      enviado_en: new Date().toISOString(),
      creado_por: userId,
    }).select('id').single()

    await admin.from('admin_logs').insert({
      admin_id: userId,
      accion: 'ejecutar_job',
      entidad: 'notificaciones',
      entidad_id: registro?.id != null ? String(registro.id) : null,
      detalles: { tipo, destinatario, asunto },
      estado: 'success',
    })

    return json({ ok: true, id: registro?.id ?? null, mensaje: 'Email enviado.' })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)

    await admin.from('notificaciones').insert({
      tipo, destinatario: destinatario ?? 'desconocido',
      asunto: asunto || '(sin asunto)', cuerpo: cuerpo || '(sin cuerpo)',
      estado: 'error', error_mensaje: mensaje, intentos: 1, creado_por: userId,
    })

    await admin.from('admin_logs').insert({
      admin_id: userId,
      accion: 'ejecutar_job',
      entidad: 'notificaciones',
      detalles: { tipo, destinatario, error: mensaje },
      estado: 'error',
      mensaje_error: mensaje,
    })

    return json({ error: `No se pudo enviar: ${mensaje}` }, 502)
  }
})
