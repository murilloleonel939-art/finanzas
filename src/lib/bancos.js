import { api, apiJson } from '@/lib/api'

export async function listarBancos(empresaId) {
  const { bancos } = await api(`/api/empresas/${empresaId}/bancos`)
  return bancos
}

export async function listarCuentas(empresaId) {
  const { cuentas } = await api(`/api/empresas/${empresaId}/cuentas`)
  return cuentas
}

export function crearBanco(empresaId, datos) {
  return apiJson(`/api/empresas/${empresaId}/bancos`, 'POST', datos)
}

export function borrarBanco(empresaId, bancoId) {
  return api(`/api/empresas/${empresaId}/bancos/${bancoId}`, { method: 'DELETE' })
}

export function crearCuenta(empresaId, datos) {
  return apiJson(`/api/empresas/${empresaId}/cuentas`, 'POST', datos)
}
