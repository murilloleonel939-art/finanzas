/**
 * Consultas de agregación del panel de administración .
 *
 * PRINCIPIO: el dashboard cuenta, no suma dinero. Nunca cruza montos entre
 * empresas — hacerlo exigiría convertir monedas y D4 lo prohíbe. Un "total
 * consolidado" en la portada del panel sería precisamente el número que D4
 * decidió no tener.
 */
import { supabase } from '@/lib/supabase'

/**
 * Contadores globales del panel.
 *
 * Se piden solo las columnas necesarias, nunca `select *`: para pintar unos
 * números no se mueve el histórico financiero. Las tres tablas que se leen
 * son de identidad (empresas, profiles, user_empresa), que no crecen con los
 * movimientos — a diferencia de `movimientos`, que sí.
 */
export async function estadisticasAdmin() {
  const [empresas, usuarios, vinculos] = await Promise.all([
    supabase.from('empresas').select('estado, pais').is('deleted_at', null),
    // `id` hace falta para poder cruzar con los vínculos y saber quién no
    // tiene ninguna empresa.
    supabase.from('profiles').select('id, app_role, estado'),
    supabase.from('user_empresa').select('user_id, rol').is('deleted_at', null),
  ])

  const error = empresas.error ?? usuarios.error ?? vinculos.error
  if (error) throw new Error(error.message)

  const listaEmpresas = empresas.data ?? []
  const listaUsuarios = usuarios.data ?? []
  const listaVinculos = vinculos.data ?? []

  const usuariosConEmpresa = new Set(listaVinculos.map((v) => v.user_id))

  return {
    empresas: {
      total: listaEmpresas.length,
      activas: listaEmpresas.filter((e) => e.estado === 'activa').length,
      suspendidas: listaEmpresas.filter((e) => e.estado === 'suspendida').length,
      // País distinto, no empresa por país. Las que no tienen país no cuentan:
      // "0 países" es más honesto que contar un valor vacío como uno más.
      paises: new Set(listaEmpresas.map((e) => e.pais).filter(Boolean)).size,
    },
    usuarios: {
      total: listaUsuarios.length,
      activos: listaUsuarios.filter((u) => u.estado === 'activo').length,
      superAdmins: listaUsuarios.filter((u) => u.app_role === 'super_admin').length,
      // Usuario activo, no admin y sin ninguna empresa: puede entrar pero no
      // ve absolutamente nada. Es el estado que más despista ("me invitaron y
      // la app está vacía"), así que se cuenta y se muestra destacado.
      sinEmpresa: listaUsuarios.filter(
        (u) =>
          u.app_role !== 'super_admin' &&
          u.estado === 'activo' &&
          !usuariosConEmpresa.has(u.id)
      ).length,
    },
    // Los roles por empresa son lo que de verdad reparte el trabajo, y no se
    // pueden deducir de `app_role`: un `usuario` puede ser contador en una
    // empresa y cliente en otra (D6).
    vinculos: {
      contadores: listaVinculos.filter((v) => v.rol === 'contador').length,
      clientes: listaVinculos.filter((v) => v.rol === 'cliente').length,
    },
  }
}

/** Las N empresas creadas más recientemente. */
export async function empresasRecientes(limite = 5) {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, estado, pais, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw new Error(error.message)
  return data ?? []
}
