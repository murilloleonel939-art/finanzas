import { api, apiJson } from './api'

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el PDF.'))
    reader.readAsDataURL(file)
  })
}

export async function crearImportJob({ empresaId, target, destinoId, proveedor, periodo, archivo, archivoNombre }) {
  return apiJson(`/api/empresas/${empresaId}/import-jobs`, 'POST', {
    target,
    destino_id: destinoId,
    proveedor,
    periodo,
    archivo: await fileAsDataUrl(archivo),
    archivo_nombre: archivoNombre || archivo?.name || '',
  })
}

export async function obtenerImportJob(jobId) {
  const { job } = await api(`/api/import-jobs/${jobId}`)
  return job
}
