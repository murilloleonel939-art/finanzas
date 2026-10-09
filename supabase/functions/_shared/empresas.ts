// =====================================================================
// Aplicación de la asignación de empresas a un usuario.
// =====================================================================
// Lo usan `invitar-usuario` y `actualizar-usuario`, para que la asignación
// se comporte igual en los dos caminos.
//
// DECISIÓN D15 — por qué el `rol` se escribe aquí y no en el trigger:
// el trigger `handle_new_user` de la migración 0007 inserta los vínculos
// con rol 'cliente' fijo. Es correcto para el caso por defecto, pero el
// `rol` es por empresa y puede ser `contador` en una y `cliente` en otra
// (D6), cosa que un solo valor de `raw_user_meta_data` no puede expresar.
// El trigger sigue siendo quien CREA los vínculos (atómico, sin carrera
// con el alta); aquí solo se corrige el rol y se completan altas/bajas.
//
// DECISIÓN D16 — por qué se usa borrado lógico y no DELETE:
// `user_empresa` tiene `deleted_at` (D7) y `has_empresa_access()` filtra
// `deleted_at is null`. Quitar el acceso es poner la fecha; devolverlo es
// ponerla a null. Se conserva el histórico de quién tuvo acceso a qué
// empresa, que es exactamente lo que hace falta para auditar un fraude.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface AsignacionEmpresa {
  empresa_id: string
  rol: 'contador' | 'cliente'
}

const ROLES_VALIDOS = ['contador', 'cliente']

/**
 * Normaliza y valida la lista de empresas que llega del cliente.
 * Rechaza ids que no existen (o están borrados) en vez de insertarlos y
 * dejar vínculos huérfanos que fallarían la FK con un error opaco.
 */
export async function validarEmpresas(
  admin: SupabaseClient,
  empresas: unknown
): Promise<{ ok: true; lista: AsignacionEmpresa[] } | { ok: false; mensaje: string }> {
  if (empresas === undefined || empresas === null) return { ok: true, lista: [] }
  if (!Array.isArray(empresas)) {
    return { ok: false, mensaje: '`empresas` debe ser una lista.' }
  }

  const lista: AsignacionEmpresa[] = []
  for (const e of empresas) {
    const empresa_id = typeof e?.empresa_id === 'string' ? e.empresa_id : null
    const rol = typeof e?.rol === 'string' ? e.rol : 'cliente'
    if (!empresa_id) {
      return { ok: false, mensaje: 'Cada empresa necesita su `empresa_id`.' }
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return { ok: false, mensaje: `Rol inválido: ${rol}. Use contador o cliente.` }
    }
    lista.push({ empresa_id, rol: rol as AsignacionEmpresa['rol'] })
  }

  // Sin duplicados: `user_empresa` tiene unique(user_id, empresa_id) y un
  // duplicado en el mismo payload haría fallar el upsert entero.
  const unicos = new Map(lista.map((e) => [e.empresa_id, e]))
  const ids = [...unicos.keys()]

  if (ids.length > 0) {
    const { data, error } = await admin
      .from('empresas')
      .select('id')
      .in('id', ids)
      .is('deleted_at', null)
    if (error) return { ok: false, mensaje: error.message }

    const existentes = new Set((data ?? []).map((r) => r.id))
    const faltantes = ids.filter((id) => !existentes.has(id))
    if (faltantes.length > 0) {
      return { ok: false, mensaje: `Empresa no encontrada: ${faltantes.join(', ')}` }
    }
  }

  return { ok: true, lista: [...unicos.values()] }
}

/**
 * Deja la asignación del usuario EXACTAMENTE como indica `lista`:
 * altas y reactivaciones, cambios de rol, y bajas por borrado lógico.
 *
 * Es idempotente: llamarla dos veces con la misma lista no cambia nada.
 */
export async function aplicarEmpresas(
  admin: SupabaseClient,
  userId: string,
  lista: AsignacionEmpresa[]
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { data: actuales, error: errLectura } = await admin
    .from('user_empresa')
    .select('id, empresa_id, rol, deleted_at')
    .eq('user_id', userId)
  if (errLectura) return { ok: false, mensaje: errLectura.message }

  const deseadas = new Map(lista.map((e) => [e.empresa_id, e]))

  // 1. Bajas: vínculos activos que ya no están en la lista.
  const aBorrar = (actuales ?? []).filter(
    (a) => a.deleted_at === null && !deseadas.has(a.empresa_id)
  )
  if (aBorrar.length > 0) {
    const { error } = await admin
      .from('user_empresa')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', aBorrar.map((a) => a.id))
    if (error) return { ok: false, mensaje: error.message }
  }

  // 2. Altas, reactivaciones y cambios de rol.
  const porEmpresa = new Map((actuales ?? []).map((a) => [a.empresa_id, a]))
  for (const deseadas_ of lista) {
    const previa = porEmpresa.get(deseadas_.empresa_id)
    if (previa) {
      if (previa.rol === deseadas_.rol && previa.deleted_at === null) continue
      const { error } = await admin
        .from('user_empresa')
        .update({ rol: deseadas_.rol, deleted_at: null })
        .eq('id', previa.id)
      if (error) return { ok: false, mensaje: error.message }
    } else {
      const { error } = await admin.from('user_empresa').insert({
        user_id: userId,
        empresa_id: deseadas_.empresa_id,
        rol: deseadas_.rol,
      })
      if (error) return { ok: false, mensaje: error.message }
    }
  }

  return { ok: true }
}

/**
 * Cuenta los super_admin ACTIVOS que quedarían si se aplicase un cambio.
 * Se usa para impedir que el panel se quede sin ningún administrador:
 * con service_role no hay `auth.uid()`, así que el trigger
 * `proteger_campos_profile` de la 0006 no protege este camino.
 */
export async function superAdminsRestantes(
  admin: SupabaseClient,
  excluyendoUserId: string
): Promise<number> {
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('app_role', 'super_admin')
    .eq('estado', 'activo')
    .neq('id', excluyendoUserId)
  return count ?? 0
}
