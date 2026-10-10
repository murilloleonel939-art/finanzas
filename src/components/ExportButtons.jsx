import { useState } from 'react'
import { Download, FileText, Sheet, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function ExportButtons({
  datos = [],
  columnas = [],
  nombreArchivo = 'export',
  disabled = false,
}) {
  const [exportando, setExportando] = useState(null)

  // Genera CSV con UTF-8 BOM
  const exportarCSV = () => {
    setExportando('csv')
    try {
      if (!datos.length || !columnas.length) {
        throw new Error('No hay datos para exportar')
      }

      // Encabezados
      const encabezados = columnas.join(',')

      // Filas
      const filas = datos.map(fila =>
        columnas
          .map(col => {
            const valor = fila[col]
            // Escapar comillas y envolver en comillas si contiene comas
            if (valor === null || valor === undefined) return ''
            const str = String(valor)
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      )

      // BOM UTF-8 para Excel
      const csv = '\ufeff' + encabezados + '\n' + filas.join('\n')

      // Descargar
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `${nombreArchivo}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exportando CSV:', error)
      alert('Error al exportar CSV: ' + error.message)
    } finally {
      setExportando(null)
    }
  }

  // Genera Excel (requiere xlsx)
  const exportarExcel = async () => {
    setExportando('excel')
    try {
      if (!datos.length || !columnas.length) {
        throw new Error('No hay datos para exportar')
      }

      // Intenta cargar xlsx dinámicamente
      const XLSX = await import('xlsx')

      // Construir datos: encabezados + filas
      const datosExcel = [
        columnas,
        ...datos.map(fila => columnas.map(col => fila[col] ?? '')),
      ]

      // Crear workbook
      const ws = XLSX.utils.aoa_to_sheet(datosExcel)

      // Formato: encabezados en negrita con fondo gris
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + '1'
        if (!ws[address]) continue
        ws[address].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'FFD3D3D3' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        }
      }

      // Ancho de columnas
      ws['!cols'] = columnas.map(() => ({ wch: 15 }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Datos')

      // Descargar
      XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
    } catch (error) {
      console.error('Error exportando Excel:', error)
      alert('Error al exportar Excel. Asegúrate de que xlsx está instalado: npm install xlsx')
    } finally {
      setExportando(null)
    }
  }

  // Genera PDF (requiere pdfkit o alternativa)
  const exportarPDF = async () => {
    setExportando('pdf')
    try {
      if (!datos.length || !columnas.length) {
        throw new Error('No hay datos para exportar')
      }

      // Genera PDF como HTML y lo convierte con html2pdf (más portátil que pdfkit en navegador)
      // Alternativa: usar @react-pdf/renderer o jsPDF + html2canvas

      // Aquí usamos una aproximación simple: generar tabla HTML en PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${nombreArchivo}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 20px; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          <h2>${nombreArchivo}</h2>
          <table>
            <thead>
              <tr>
                ${columnas.map(col => `<th>${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${datos
                .map(
                  fila => `
                <tr>
                  ${columnas.map(col => `<td>${fila[col] ?? ''}</td>`).join('')}
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          <div class="footer">
            <p>Exportado: ${new Date().toLocaleString('es-CO')}</p>
          </div>
        </body>
        </html>
      `

      // Intenta usar html2pdf si está disponible
      const html2pdf = window.html2pdf
      if (html2pdf) {
        html2pdf().set({ margin: 10, filename: `${nombreArchivo}.pdf` }).html(html).save()
      } else {
        // Fallback: abre en nueva ventana para que el usuario imprima a PDF
        const ventana = window.open('', '_blank')
        ventana.document.write(html)
        ventana.document.close()
        alert(
          'PDF: Se abrió una ventana con los datos. Usa Ctrl+P o Cmd+P para imprimir a PDF.'
        )
      }
    } catch (error) {
      console.error('Error exportando PDF:', error)
      alert('Error al exportar PDF: ' + error.message)
    } finally {
      setExportando(null)
    }
  }

  const tieneData = datos.length > 0 && columnas.length > 0
  const isDisabled = disabled || !tieneData || exportando !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isDisabled}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          {exportando ? `Exportando ${exportando}...` : 'Exportar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportarCSV} disabled={exportando !== null}>
          <FileText className="w-4 h-4 mr-2" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportarExcel} disabled={exportando !== null}>
          <Sheet className="w-4 h-4 mr-2" />
          Exportar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportarPDF} disabled={exportando !== null}>
          <File className="w-4 h-4 mr-2" />
          Exportar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
