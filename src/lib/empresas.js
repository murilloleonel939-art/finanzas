/**
 * Capa de datos de empresas (FASE 11).
 *
 * Igual que `lib/usuarios.js` aísla las Edge Functions, aquí se aísla el
 * único sitio donde se decide qué es "borrar una empresa". Desde la FASE 11
 * (migración 0008) eso es un `deleted_at`, y el acceso a sus datos se deriva
 * de ahí: no hay que recorrer bancos, cuentas y movimientos.
 */
import { supabase } from '@/lib/supabase'

/**
 * Filtro de borrado aplicado a TODAS las consultas de este archivo.
 *
 * Está centralizado a propósito. El error clásico con borrado lógico es
 * olvidar el filtro en una consulta nueva y que los registros borrados
 * reaparezcan en un listado una fase después. Las policies del RLS ya
 * filtran, pero depender solo de eso para la capa de empresa (donde el
 * super_admin sí puede ver borrados si se lo propone) es frágil.
 */
const VIVAS = (q) => q.is('deleted_at', null)

export async function listarEmpresas({ busqueda = '', estado = 'todas' } = {}) {
  let q = supabase
    .from('empresas')
    .select('id, nombre, estado, pais, created_at, updated_at, deleted_at')
    .order('nombre')

  q = VIVAS(q)
  if (estado !== 'todas') q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let empresas = data ?? []
  const texto = busqueda.trim().toLowerCase()
  if (texto) {
    empresas = empresas.filter(
      (e) =>
        e.nombre.toLowerCase().includes(texto) ||
        (e.pais ?? '').toLowerCase().includes(texto)
    )
  }
  return empresas
}

/**
 * Empresas con sus conteos de usuarios y de ramas financieras.
 *
 * Los conteos son `count` con `head: true`: PostgREST devuelve solo el número
 * en la cabecera, sin filas. Traer los registros y contarlos en memoria
 * costaría mover todo el histórico financiero de todas las empresas para
 * mostrar un número en una tarjeta.
 *
 * Los conteos financieros solo salen distintos de cero para el `super_admin`
 * (el RLS filtra el resto a 0), que es justo quien entra a este dashboard.
 */
export async function listarEmpresasConConteos(opciones = {}) {
  const empresas = await listarEmpresas(opciones)
  if (empresas.length === 0) return []

  const ids = empresas.map((e) => e.id)

  const contar = (tabla) =>
    supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .in('empresa_id', ids)
      .is('deleted_at', null)

  const [usuarios, bancos, brokers, wallets] = await Promise.all([
    // `user_empresa` no se puede contar con `.in('empresa_id', ids)` igual que
    // las demás porque interesa saber cuántos usuarios hay por empresa, no el
    // total: se pide la lista y se agrupa. Es una tabla pequeña (un vínculo
    // por usuario y empresa), no crece con los datos financieros.
    supabase
      .from('user_empresa')
      .select('empresa_id')
      .in('empresa_id', ids)
      .is('deleted_at', null),
    contar('bancos'),
    contar('brokers'),
    contar('wallet_providers'),
  ])

  const error = usuarios.error ?? bancos.error ?? brokers.error ?? wallets.error
  if (error) throw new Error(error.message)

  const usuariosPorEmpresa = new Map()
  for (const u of usuarios.data ?? []) {
    usuariosPorEmpresa.set(u.empresa_id, (usuariosPorEmpresa.get(u.empresa_id) ?? 0) + 1)
  }

  return empresas.map((e) => ({
    ...e,
    usuarios: usuariosPorEmpresa.get(e.id) ?? 0,
    // Conteo por empresa de las tres ramas. Se hace en memoria sobre el total:
    // para saber cuántos bancos tiene CADA empresa haría falta una consulta
    // por empresa (1+N). Con decenas de empresas el total es más barato, y
    // como el dashboard no desglosa por empresa no se pierde nada.
    _conteos: { bancos: bancos.count ?? 0, brokers: brokers.count ?? 0, wallets: wallets.count ?? 0 },
  }))
}

export async function crearEmpresa({ nombre, pais, estado = 'activa' }) {
  const { data, error } = await supabase
    .from('empresas')
    .insert({ nombre: nombre.trim(), pais: pais?.trim() || null, estado })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function actualizarEmpresa(id, { nombre, pais, estado }) {
  const { data, error } = await supabase
    .from('empresas')
    .update({ nombre: nombre.trim(), pais: pais?.trim() || null, estado })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Borrado lógico (D7). Desde la 0008 esto es todo lo necesario: al poner
 * `deleted_at`, `has_empresa_access()` deja de dar acceso a la empresa y con
 * ella a sus bancos, cuentas, movimientos, brokers y wallets. No hay cascada
 * que ejecutar y por tanto no hay forma de dejarla a medias.
 */
export async function eliminarEmpresa(id) {
  const { error } = await supabase
    .from('empresas')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Deshace el borrado lógico. Recupera el acceso a todo el contenido. */
export async function restaurarEmpresa(id) {
  const { error } = await supabase.from('empresas').update({ deleted_at: null }).eq('id', id)
  if (error) throw new Error(error.message)
}
