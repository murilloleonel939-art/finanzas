import { api } from './api'

export async function estadisticasAdmin() {
  return api('/api/admin/stats')
}

export async function empresasRecientes(limite = 5) {
  const { empresas } = await api(`/api/admin/empresas-recientes?limite=${encodeURIComponent(limite)}`)
  return empresas || []
}
