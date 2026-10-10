/**
 * Funciones auxiliares para el panel admin
 */

/**
 * Formatear número de instancia
 */
export function formatearNumero(num) {
  return new Intl.NumberFormat('es-AR').format(num || 0)
}

/**
 * Formatear porcentaje
 */
export function formatearPorcentaje(valor, decimales = 1) {
  return `${(valor || 0).toFixed(decimales)}%`
}

/**
 * Formatear fecha y hora
 */
export function formatearFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Formatear solo fecha
 */
export function formatearSoloFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Formatear tiempo relativo (hace X minutos)
 */
export function formatearTiempoRelativo(fecha) {
  if (!fecha) return '-'
  
  const ahora = new Date()
  const entonces = new Date(fecha)
  const diferencia = Math.floor((ahora - entonces) / 1000) // segundos

  if (diferencia < 60) return `hace ${diferencia}s`
  if (diferencia < 3600) return `hace ${Math.floor(diferencia / 60)}m`
  if (diferencia < 86400) return `hace ${Math.floor(diferencia / 3600)}h`
  if (diferencia < 604800) return `hace ${Math.floor(diferencia / 86400)}d`
  
  return formatearFecha(fecha)
}

/**
 * Mapeo de estados de jobs
 */
// Estados reales del enum estado_job (migración 0001). 'hecho' es el que
// usa el worker al terminar bien; no existe un 'completado'.
export const ESTADOS_JOB = {
  pendiente: { label: 'Pendiente', clase: 'bg-yellow-100 text-yellow-800' },
  procesando: { label: 'Procesando', clase: 'bg-blue-100 text-blue-800' },
  hecho: { label: 'Hecho', clase: 'bg-green-100 text-green-800' },
  error: { label: 'Error', clase: 'bg-red-100 text-red-800' },
}

/**
 * Mapeo de acciones administrativas
 */
export const ACCIONES_ADMIN = {
  crear: { label: 'Crear', icono: '➕' },
  actualizar: { label: 'Actualizar', icono: '✏️' },
  eliminar: { label: 'Eliminar', icono: '🗑️' },
  ver: { label: 'Ver', icono: '👁️' },
  exportar: { label: 'Exportar', icono: '📤' },
  importar: { label: 'Importar', icono: '📥' },
  login: { label: 'Login', icono: '🔓' },
  logout: { label: 'Logout', icono: '🔒' },
  cambiar_config: { label: 'Cambiar config', icono: '⚙️' },
  ejecutar_job: { label: 'Ejecutar job', icono: '▶️' },
  cancelar_job: { label: 'Cancelar job', icono: '⏹️' },
  cambiar_rol: { label: 'Cambiar rol', icono: '👤' },
  acceso_denegado: { label: 'Acceso denegado', icono: '🚫' }
}

/**
 * Obtener color para estado de job
 */
export function getColorEstado(estado) {
  const config = ESTADOS_JOB[estado] || { clase: 'bg-gray-100 text-gray-800' }
  return config.clase
}

/**
 * Obtener etiqueta para estado de job
 */
export function getEtiquetaEstado(estado) {
  const config = ESTADOS_JOB[estado] || { label: 'Desconocido' }
  return config.label
}

/**
 * Obtener icono para acción
 */
export function getIconoAccion(accion) {
  const config = ACCIONES_ADMIN[accion] || { icono: '❓' }
  return config.icono
}

/**
 * Obtener etiqueta para acción
 */
export function getEtiquetaAccion(accion) {
  const config = ACCIONES_ADMIN[accion] || { label: 'Desconocida' }
  return config.label
}

/**
 * Calcular porcentaje de éxito
 */
export function calcularPorcentajeExito(exitosos, total) {
  if (total === 0) return 0
  return Math.round((exitosos / total) * 100)
}

/**
 * Formatear duración en segundos
 */
export function formatearDuracion(segundos) {
  if (!segundos) return '-'
  if (segundos < 60) return `${Math.round(segundos)}s`
  if (segundos < 3600) return `${(segundos / 60).toFixed(1)}m`
  return `${(segundos / 3600).toFixed(1)}h`
}

/**
 * Generar resumen de estadísticas
 */
export function generarResumenStats(stats) {
  return [
    { label: 'Empresas', valor: stats.empresas, icono: '🏢' },
    { label: 'Cuentas', valor: stats.cuentas, icono: '🏦' },
    { label: 'Movimientos', valor: stats.movimientos, icono: '📊' },
    { label: 'Activos', valor: stats.activos, icono: '💰' },
    { label: 'Usuarios activos', valor: stats.usuariosActivos, icono: '👥' },
    { label: 'Jobs hoy', valor: stats.jobsHoy, icono: '⚡' }
  ]
}

/**
 * Validar configuración antes de guardar
 */
export function validarConfig(clave, valor, tipo) {
  switch (tipo) {
    case 'integer':
      if (isNaN(valor)) {
        throw new Error(`${clave} debe ser un número entero`)
      }
      break
    case 'boolean':
      if (valor !== 'true' && valor !== 'false') {
        throw new Error(`${clave} debe ser true o false`)
      }
      break
    case 'string':
      if (typeof valor !== 'string' || valor.trim() === '') {
        throw new Error(`${clave} no puede estar vacío`)
      }
      break
    case 'json':
      try {
        JSON.parse(valor)
      } catch {
        throw new Error(`${clave} debe ser JSON válido`)
      }
      break
  }
  return true
}

/**
 * Exportar datos a CSV
 */
export function exportarCSV(datos, nombre = 'export.csv') {
  if (!datos || datos.length === 0) return

  // Obtener headers
  const headers = Object.keys(datos[0])
  
  // Crear contenido CSV
  let csv = headers.join(',') + '\n'
  datos.forEach(fila => {
    const valores = headers.map(header => {
      const valor = fila[header]
      if (valor === null || valor === undefined) return ''
      if (typeof valor === 'string' && valor.includes(',')) {
        return `"${valor.replace(/"/g, '""')}"`
      }
      return valor
    })
    csv += valores.join(',') + '\n'
  })

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', nombre)
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Exportar datos a JSON
 */
export function exportarJSON(datos, nombre = 'export.json') {
  if (!datos) return

  const json = JSON.stringify(datos, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', nombre)
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Copiar texto al portapapeles
 */
export async function copiarAlPortapapeles(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch (error) {
    console.error('Error copiando:', error)
    return false
  }
}

/**
 * Debounce para búsqueda
 */
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
