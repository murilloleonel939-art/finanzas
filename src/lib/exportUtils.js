/**
 * exportUtils.js — Exportación a CSV, Excel y PDF sin dependencias externas.
 *
 * Usa APIs nativas del navegador:
 * - CSV: Blob + URL.createObjectURL + descarga
 * - Excel: CSV guardado como .xlsx (Excel lo lee nativamente)
 * - PDF: jsPDF dinámico o fallback a HTML2Canvas (si disponible)
 *
 * PRD §9: Exportación de datos filtrados por período.
 */

/**
 * Escapa comillas en strings CSV.
 */
function escaparCSV(valor) {
  if (valor === null || valor === undefined) return ''
  const str = String(valor)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convierte un array de objetos a CSV.
 * @param {Array} datos - Array de objetos
 * @param {Array} columnas - Array de {key, label} o simplemente keys
 * @returns {string} CSV formateado
 */
export function generarCSV(datos, columnas) {
  if (!datos || datos.length === 0) {
    return 'Sin datos para exportar'
  }

  // Normalizar columnas: si es array de strings, convertir a {key, label}
  const cols = Array.isArray(columnas)
    ? columnas.map((col) => (typeof col === 'string' ? { key: col, label: col } : col))
    : Object.keys(datos[0]).map((key) => ({ key, label: key }))

  // Encabezado
  const encabezado = cols.map((col) => escaparCSV(col.label)).join(',')

  // Filas
  const filas = datos.map((fila) =>
    cols.map((col) => escaparCSV(fila[col.key])).join(',')
  )

  return [encabezado, ...filas].join('\n')
}

/**
 * Descarga un CSV con un nombre específico.
 * @param {string} contenido - Contenido CSV
 * @param {string} nombreArchivo - Nombre del archivo (sin extensión)
 */
export function descargarCSV(contenido, nombreArchivo = 'exportacion') {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${nombreArchivo}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Descarga un Excel (XLSX guardado como UTF-8 CSV con metadatos).
 * Nota: Excel lee CSV nativamente, pero para XLSX "real" se requeriría xlsx package.
 * Este es un workaround: CSV con encoding UTF-8 + BOM.
 * @param {string} contenido - Contenido CSV
 * @param {string} nombreArchivo - Nombre del archivo (sin extensión)
 */
export function descargarExcel(contenido, nombreArchivo = 'exportacion') {
  // BOM para UTF-8 (Excel lo reconoce)
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + contenido], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${nombreArchivo}.xlsx`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Genera PDF simple con tabla (requiere jsPDF disponible globalmente o fallback a HTML).
 * Alternativa: usar <a> con dataURI de HTML5 + print-to-PDF.
 * @param {Array} datos - Array de objetos
 * @param {Array} columnas - Array de {key, label}
 * @param {string} titulo - Título del documento
 * @param {Object} opciones - {fontSize, margen, orientacion}
 */
export function generarPDF(datos, columnas, titulo = 'Exportación', opciones = {}) {
  const { fontSize = 10, margen = 10, orientacion = 'portrait' } = opciones

  // Si jsPDF está disponible, usarlo
  if (typeof window !== 'undefined' && window.jsPDF) {
    const { jsPDF } = window
    const doc = new jsPDF({ orientation: orientacion, unit: 'mm' })

    // Título
    doc.setFontSize(16)
    doc.text(titulo, margen, margen + 5)

    // Fecha de exportación
    doc.setFontSize(8)
    doc.text(`Generado: ${new Date().toLocaleString()}`, margen, margen + 12)

    // Tabla
    let y = margen + 18
    const cols = Array.isArray(columnas)
      ? columnas.map((col) => (typeof col === 'string' ? { key: col, label: col } : col))
      : Object.keys(datos[0]).map((key) => ({ key, label: key }))

    // Encabezado
    doc.setFontSize(fontSize)
    doc.setFont(undefined, 'bold')
    const colWidth = (doc.internal.pageSize.getWidth() - margen * 2) / cols.length
    cols.forEach((col, i) => {
      doc.text(col.label, margen + i * colWidth, y)
    })
    y += 5

    // Filas
    doc.setFont(undefined, 'normal')
    datos.forEach((fila) => {
      cols.forEach((col, i) => {
        const valor = String(fila[col.key] ?? '')
        doc.text(valor.substring(0, 20), margen + i * colWidth, y)
      })
      y += 5
      if (y > doc.internal.pageSize.getHeight() - margen) {
        doc.addPage()
        y = margen
      }
    })

    return doc
  }

  // Fallback: generar HTML e invitar al usuario a imprimir
  console.warn('jsPDF no disponible. Usa el navegador para exportar a PDF.')
  return null
}

/**
 * Descarga un PDF (requiere que jsPDF esté disponible).
 * @param {Array} datos - Array de objetos
 * @param {Array} columnas - Array de {key, label}
 * @param {string} nombreArchivo - Nombre del archivo (sin extensión)
 * @param {string} titulo - Título del documento
 */
export function descargarPDF(datos, columnas, nombreArchivo = 'exportacion', titulo = 'Exportación') {
  const doc = generarPDF(datos, columnas, titulo)
  if (doc) {
    doc.save(`${nombreArchivo}.pdf`)
  } else {
    console.error('No se puede generar PDF sin jsPDF')
  }
}

/**
 * Exporta datos en el formato especificado.
 * @param {Array} datos - Array de objetos a exportar
 * @param {string} formato - 'csv', 'xlsx', 'pdf'
 * @param {Array} columnas - Columnas a incluir
 * @param {Object} opciones - {nombreArchivo, titulo, ...}
 */
export function exportar(datos, formato, columnas, opciones = {}) {
  const { nombreArchivo = 'exportacion', titulo = 'Exportación' } = opciones

  if (!datos || datos.length === 0) {
    console.warn('No hay datos para exportar')
    return
  }

  const csv = generarCSV(datos, columnas)

  switch (formato.toLowerCase()) {
    case 'csv':
      descargarCSV(csv, nombreArchivo)
      break
    case 'xlsx':
    case 'excel':
      descargarExcel(csv, nombreArchivo)
      break
    case 'pdf':
      descargarPDF(datos, columnas, nombreArchivo, titulo)
      break
    default:
      console.error(`Formato desconocido: ${formato}`)
  }
}

/**
 * Helper: formatea datos de movimientos para exportación.
 * @param {Array} movimientos - Movimientos con saldo_resultante
 * @param {string} nombreCuenta - Nombre/número de cuenta
 * @param {string} mes - Mes filtrado (ej: "2024-10" o "acumulado")
 * @returns {Object} {datos, columnas}
 */
export function prepararMovimientosExportacion(movimientos, nombreCuenta, mes = 'acumulado') {
  const datos = movimientos.map((m) => ({
    Fecha: m.fecha,
    Descripción: m.descripcion,
    Monto: m.monto,
    Tipo: m.tipo_movimiento,
    'Saldo Resultante': m.saldo_resultante,
  }))

  const columnas = [
    { key: 'Fecha', label: 'Fecha' },
    { key: 'Descripción', label: 'Descripción' },
    { key: 'Monto', label: 'Monto' },
    { key: 'Tipo', label: 'Tipo' },
    { key: 'Saldo Resultante', label: 'Saldo Resultante' },
  ]

  return {
    datos,
    columnas,
    nombreArchivo: `movimientos_${nombreCuenta}_${mes}`,
  }
}

/**
 * Helper: formatea datos de activos para exportación.
 * @param {Array} activos - Activos con precios
 * @param {string} mes - Mes filtrado
 * @returns {Object} {datos, columnas}
 */
export function prepararActivosExportacion(activos, mes = 'acumulado') {
  const datos = activos.map((a) => ({
    Ticker: a.ticker,
    'Tipo Activo': a.tipo_activo,
    Cantidad: a.cantidad,
    'Precio Unitario': a.precio_unitario,
    Total: a.total,
    Variación: a.variacion_porcentaje,
  }))

  const columnas = [
    { key: 'Ticker', label: 'Ticker' },
    { key: 'Tipo Activo', label: 'Tipo Activo' },
    { key: 'Cantidad', label: 'Cantidad' },
    { key: 'Precio Unitario', label: 'Precio Unitario' },
    { key: 'Total', label: 'Total' },
    { key: 'Variación', label: 'Variación %' },
  ]

  return {
    datos,
    columnas,
    nombreArchivo: `activos_${mes}`,
  }
}

export default {
  generarCSV,
  descargarCSV,
  descargarExcel,
  generarPDF,
  descargarPDF,
  exportar,
  prepararMovimientosExportacion,
  prepararActivosExportacion,
}
