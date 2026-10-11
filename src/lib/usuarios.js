import { api, apiJson } from '@/lib/api'

export async function listarUsuarios() {
  const { usuarios } = await api('/api/admin/usuarios')
  return usuarios
}

export async function listarEmpresas() {
  const { empresas } = await api('/api/empresas')
  return empresas
}

export function crearUsuario(datos) {
  return apiJson('/api/admin/usuarios', 'POST', datos)
}

// Alias temporal para mantener compatibilidad con el componente durante la migración.
export const invitarUsuario = crearUsuario

export function actualizarUsuario({ userId, ...datos }) {
  return apiJson(`/api/admin/usuarios/${userId}`, 'PATCH', datos)
}

export function actualizarContrasena(userId, password) {
  return apiJson(`/api/admin/usuarios/${userId}/password`, 'POST', { password })
}

// El stack local no envía invitaciones por correo todavía. Esta operación abre
// la gestión de contraseña en una etapa posterior, sin fingir que se envió mail.
export async function reenviarInvitacion() {
  return { mensaje: 'Entrega la contraseña inicial mediante un canal seguro.' }
}
