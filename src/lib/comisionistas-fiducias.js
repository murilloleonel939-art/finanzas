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
  'Trii',
  'Acciones y Valores S.A.',
]

export async function listarComisionistasFiducias(empresaId) {
  const { comisionistas = [] } = await api(`/api/empresas/${empresaId}/comisionistas-fiducias`)
  return comisionistas
}

export function crearComisionistaFiducia(empresaId, { pais, nombre }) {
  return apiJson(`/api/empresas/${empresaId}/comisionistas-fiducias`, 'POST', { pais, nombre })
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
