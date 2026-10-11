/**
 * Compatibilidad de datos para importaciones.
 * Los modales activos usan `import-jobs.js`; este módulo conserva la API
 * histórica sobre los endpoints locales.
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

export async function crearMovimientosDesdeImportacion() {
  throw new Error('La creación de movimientos importados debe ejecutarse dentro del worker/backend local.')
}

export async function crearMovimientosBrokerDesdeImportacion() {
  throw new Error('La creación de movimientos de broker debe ejecutarse dentro del worker/backend local.')
}

export async function crearMovimientosWalletDesdeImportacion() {
  throw new Error('La creación de movimientos de wallet debe ejecutarse dentro del worker/backend local.')
}

export async function subirExtractoPDF() {
  throw new Error('La carga del PDF se realiza al crear el job mediante la API local.')
}

export async function obtenerCuentaParaImportacion(cuenta_id) {
  const { cuenta } = await api(`/api/cuentas/${cuenta_id}`)
  return cuenta
}

export async function obtenerBrokerParaImportacion(broker_id) {
  const { broker } = await api(`/api/brokers/${broker_id}`)
  return broker
}

export async function obtenerWalletParaImportacion(wallet_id) {
  const { wallet } = await api(`/api/wallets/${wallet_id}`)
  return wallet
}

async function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el PDF.'))
    reader.readAsDataURL(file)
  })
}
