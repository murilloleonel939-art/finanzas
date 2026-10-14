import { useRef, useState } from 'react'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Loader2, Upload, XCircle } from 'lucide-react'

export default function ImportarBinanceP2pModal({ isOpen, onClose, empresaId, walletId, onSuccess }) {
  const [archivo, setArchivo] = useState(null)
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef(null)

  function cerrar() {
    if (cargando) return
    setArchivo(null); setEstado(''); setError('')
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  async function importar() {
    if (!archivo) return setError('Selecciona el archivo Excel de historial C2C.')
    setCargando(true); setEstado('subiendo'); setError('')
    try {
      const { job } = await crearImportJob({ empresaId, target: 'binance_p2p', destinoId: walletId, proveedor: 'Binance', periodo: '', archivo, archivoNombre: archivo.name })
      setEstado('pendiente')
      let intentos = 0
      const revisar = async () => {
        try {
          const actual = await obtenerImportJob(job.id)
          setEstado(actual.estado)
          if (actual.estado === 'hecho') {
            setCargando(false)
            onSuccess?.()
            return
          }
          if (actual.estado === 'error') {
            setCargando(false); setError(actual.error_mensaje || 'No se pudo importar el historial P2P.')
            return
          }
          if (++intentos >= 120) {
            setCargando(false); setError('Tiempo de espera agotado.')
            return
          }
          setTimeout(revisar, 1000)
        } catch (err) { setCargando(false); setError(err.message) }
      }
      revisar()
    } catch (err) { setCargando(false); setEstado('error'); setError(err.message) }
  }

  const esperando = ['subiendo', 'pendiente', 'procesando'].includes(estado)
  return <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && cerrar()}>
    <DialogContent>
      <DialogHeader><DialogTitle>Importar historial P2P</DialogTitle><DialogDescription>Solo se importan órdenes Completed. Este historial no modifica los movimientos ni los saldos de la wallet.</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <Input ref={inputRef} type="file" accept=".xlsx,.xls" disabled={cargando} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (!/\.xlsx?$/i.test(file.name)) { setArchivo(null); setError('Selecciona un archivo Excel (.xls o .xlsx).'); return }; setArchivo(file); setError('') }} />
        {archivo && <p className="text-sm text-muted-foreground truncate">{archivo.name}</p>}
        {esperando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Importando historial P2P...</div>}
        {estado === 'hecho' && <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />Importación completada.</div>}
        {error && <div className="flex items-start gap-2 text-sm text-destructive"><XCircle className="w-4 h-4 mt-0.5" />{error}</div>}
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar} disabled={cargando}>Cerrar</Button><Button onClick={importar} disabled={!archivo || cargando} className="gap-2"><Upload className="w-4 h-4" />Importar</Button></div>
    </DialogContent>
  </Dialog>
}
