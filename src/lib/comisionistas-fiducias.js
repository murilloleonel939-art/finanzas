import { api, apiJson } from '@/lib/api'

export const COMISIONISTAS_FIDUCIAS_CO = [
  'Fiduciaria Bancolombia',
  'Fiduciaria Bogotá',
  'Fidudavivienda',
  'Fiduciaria de Occidente (Fiduoccidente)',
  'Fiduciaria Popular',
  'BBVA Asset Management S.A. Sociedad Fiduciaria',
  'Fiducolpatria',
  'Servitrust GNB Sudameris',
  'Alianza Fiduciaria',
  'Acción Fiduciaria',
  'Fiducentral',
  'Fiducoomeva',
  'Skandia Sociedad Fiduciaria',
  'Credicorp Capital Fiduciaria',
  'trii',
  'acciones y valores S.A.',
]

export async function listarComisionistasFiducias(empresaId) {
  const { comisionistas = [] } = await api(`/api/empresas/${empresaId}/comisionistas-fiducias`)
  return comisionistas
}

export function crearComisionistaFiducia(empresaId, { pais, nombre }) {
  return apiJson(`/api/empresas/${empresaId}/comisionistas-fiducias`, 'POST', { pais, nombre })
}

export async function listarCuentasComisionistasFiducias(empresaId) {
  const { cuentas = [] } = await api(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas`)
  return cuentas
}

export async function obtenerCuentaComisionistaFiducia(empresaId, cuentaId) {
  const { cuenta } = await api(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas/${cuentaId}`)
  return cuenta
}

export function crearCuentaComisionistaFiducia(empresaId, datos) {
  return apiJson(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas`, 'POST', datos)
}

export function actualizarClavePdfComisionista(empresaId, cuentaId, clave) {
  return apiJson(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas/${cuentaId}/pdf-password`, 'PUT', { pdf_password: clave })
}

export function borrarCuentaComisionistaFiducia(empresaId, cuentaId) {
  return api(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas/${cuentaId}`, { method: 'DELETE' })
}

export function borrarDatosAccival(empresaId, cuentaId, alcance) {
  return apiJson(`/api/empresas/${empresaId}/comisionistas-fiducias/cuentas/${cuentaId}/extractos`, 'DELETE', { alcance })
}

export function borrarComisionistaFiducia(empresaId, id) {
  return api(`/api/empresas/${empresaId}/comisionistas-fiducias/${id}`, { method: 'DELETE' })
}

export function nombrePaisComisionista(pais) {
  return pais === 'CO' ? 'Colombia' : pais
}

export function catalogoComisionistasFiducias(pais) {
  return pais === 'CO' ? COMISIONISTAS_FIDUCIAS_CO : []
}
