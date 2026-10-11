/**
 * Compatibilidad de datos para importaciones.
 * Los modales activos usan `import-jobs.js`; este módulo conserva la API
 * histórica sin volver a depender del cliente de Supabase.
 */
import { api, apiJson } from './api'

export async function crearImportJob({ empresa_id, destino, destino_id, archivo, proveedor = null }) {
  if (!archivo) throw new Error('Se requiere el PDF para crear el job.')
  const { job } = await apiJson(`/api/empresas/${empresa_id}/import-jobs`, 'POST', {
    target: destino,
    destino_id,
    proveedor,
    archivo: typeof archivo === 'string' ? archivo : await fileAsDataUrl(archivo),
  })
  return job
}

export async function obtenerImportJobs(empresa_id, options = {}) {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) })
  if (options.estado) params.set('estado', options.estado)
  const { jobs } = await api(`/api/empresas/${empresa_id}/import-jobs?${params}`)
  return jobs ?? []
}

export async function obtenerImportJob(job_id) {
  try {
    const { job } = await api(`/api/import-jobs/${job_id}`)
    return job
  } catch (error) {
    if (/no encontrado/i.test(error.message)) return null
    throw error
  }
}

export async function actualizarImportJob() {
  throw new Error('Los jobs de importación solo los actualiza el worker del backend.')
}

export async function subirExtractoPDF() {
  throw new Error('La carga del PDF se realiza al crear el job mediante la API local.')
}

export function obtenerCuentaParaImportacion(cuenta_id) {
  return api(`/api/cuentas/${cuenta_id}`)
}

export function obtenerBrokerParaImportacion(broker_id) {
  return api(`/api/brokers/${broker_id}`)
}

export function obtenerWalletParaImportacion(wallet_id) {
  return api(`/api/wallets/${wallet_id}`)
}

async function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el PDF.'))
    reader.readAsDataURL(file)
  })
}
