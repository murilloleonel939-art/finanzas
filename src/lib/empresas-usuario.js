import { api } from './api'

export async function obtenerEmpresasUsuario() {
  const { empresas } = await api('/api/empresas')
  return empresas || []
}

export function suscribirseAEmpresasUsuario(callback) {
  return { unsubscribe() {} }
}

export async function obtenerEmpresa(empresaId) {
  const { empresas } = await api('/api/empresas')
  const empresa = (empresas || []).find((item) => item.id === empresaId)
  if (!empresa) throw new Error('Empresa no encontrada.')
  return empresa
}

export function obtenerRamas(empresaId) {
  return [
    { id: 'bancos', nombre: 'Bancos', icono: 'bank', ruta: `/empresa/${empresaId}/bancos` },
    { id: 'brokers', nombre: 'Brokers', icono: 'trending-up', ruta: `/empresa/${empresaId}/brokers` },
    { id: 'wallet-providers', nombre: 'Proveedores de Wallet', icono: 'wallet', ruta: `/empresa/${empresaId}/wallets` },
  ]
}

export function suscribirseAModulos(_empresaId, _callback) {
  return { unsubscribe() {} }
}

export async function obtenerResumenEmpresa(empresaId) {
  const { totales } = await api(`/api/empresas/${empresaId}/resumen`)
  return totales || []
}
