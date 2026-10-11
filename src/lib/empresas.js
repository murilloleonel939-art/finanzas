import { api, apiJson } from '@/lib/api'

export async function listarEmpresas({ busqueda = '', estado = 'todas' } = {}) {
  const { empresas } = await api('/api/empresas')
  const texto = busqueda.trim().toLowerCase()
  return empresas.filter((empresa) => {
    const coincideTexto = !texto || empresa.nombre.toLowerCase().includes(texto) || (empresa.pais ?? '').toLowerCase().includes(texto)
    const coincideEstado = estado === 'todas' || empresa.estado === estado
    return coincideTexto && coincideEstado
  })
}

export async function listarEmpresasConConteos(opciones = {}) {
  return listarEmpresas(opciones)
}

export async function crearEmpresa(datos) {
  const { empresa } = await apiJson('/api/admin/empresas', 'POST', datos)
  return empresa
}

export async function actualizarEmpresa(id, datos) {
  const { empresa } = await apiJson(`/api/admin/empresas/${id}`, 'PATCH', datos)
  return empresa
}

export async function eliminarEmpresa(id) {
  await api(`/api/admin/empresas/${id}`, { method: 'DELETE' })
}

export async function restaurarEmpresa(id) {
  await api(`/api/admin/empresas/${id}/restaurar`, { method: 'POST' })
}
