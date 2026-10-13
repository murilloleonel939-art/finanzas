/**
 * Modal de importación de extractos para WALLETS (PRD §6).
 *
 * Estaba escrito contra `@radix-ui/react-button` —un paquete que no está en
 * `package.json`— y contra el `Dialog` crudo de Radix, así que nunca se pudo
 * montar en ninguna página. Aquí se reescribe sobre los mismos componentes que
 * usan cuentas y brokers (`@/components/ui/dialog` y `@/components/ui/button`),
 * que es lo que hace que el botón funcione para cualquier proveedor.
 *
 * Se admiten PDF, CSV y Excel igual que en cuentas: el worker decide cómo
 * extraer según el archivo y `esTabular()`, no el cliente.
 *
 * El saldo no se toca aquí: el worker inserta los movimientos y el recálculo de
 * `wallet_saldos` lo hace el servidor. Este modal solo lanza el job y lo vigila.
 */
import { useState, useRef } from 'react'
import { crearImportJob, obtenerImportJob } from '@/lib/import-jobs'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AlertCircle, Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

const EXTENSIONES = ['pdf', 'csv', 'xls', 'xlsx']

export function ImportarWalletModal({
  isOpen,
  onClose,
  walletId,
  empresaId,
  walletProveedor = '',
  walletNombre = '',
  onSuccess,
}) {
  const [archivo, setArchivo] = useState(null)
  const [proveedor, setProveedor] = useState(walletProveedor || '')
  const [periodo, setPeriodo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [estado, setEstado] = useState('')
  const [resultado, setResultado] = useState(null)
  const fileInputRef = useRef(null)

  const handleArchivoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!EXTENSIONES.includes(extension)) {
      setError('Solo se aceptan archivos PDF, CSV o Excel')
      return
    }
    setArchivo(file)
    setError('')
  }

  const handleSubir = async () => {
    if (!archivo) {
      setError('Selecciona un archivo PDF, CSV o Excel')
      return
    }

    setCargando(true)
    setError('')
    setEstado('subiendo')

    try {
      const { job } = await crearImportJob({
        empresaId,
        target: 'wallet',
        destinoId: walletId,
        proveedor,
        periodo,
        archivo,
        archivoNombre: archivo.name,
      })
      setEstado('pendiente')
      monitorearJob(job.id)
    } catch (err) {
      setError(err.message)
      setEstado('error')
      setCargando(false)
    }
  }

  const monitorearJob = (id) => {
    let intentos = 0
    const maxIntentos = 120

    const verificar = async () => {
      try {
        const job = await obtenerImportJob(id)
        setEstado(job.estado)

        if (job.estado === 'hecho') {
          setResultado({ creados: job.movimientos_creados ?? 0, omitidos: job.duplicados_omitidos ?? 0 })
          setCargando(false)
          onSuccess?.()
          return
        }

        if (job.estado === 'error') {
          setError(job.error_mensaje || 'Error desconocido en la importación')
          setCargando(false)
          return
        }

        intentos++
        if (intentos < maxIntentos) setTimeout(verificar, 1000)
        else {
          setError('Tiempo de espera agotado')
          setCargando(false)
        }
      } catch (err) {
        setError(err.message)
        setCargando(false)
      }
    }

    verificar()
  }

  const handleCerrar = () => {
    setArchivo(null)
    setResultado(null)
    setProveedor(walletProveedor || '')
    setPeriodo('')
    setError('')
    setEstado('')
    setCargando(false)
    onClose()
  }

  const mostrarSpinner = ['procesando', 'subiendo', 'pendiente'].includes(estado)
  const mostrarExito = estado === 'hecho'
  const mostrarError = estado === 'error' || (error && !mostrarSpinner && !mostrarExito)

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && handleCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar extracto</DialogTitle>
          <DialogDescription>
            {walletNombre ? `Extracto de ${walletNombre}. ` : ''}
            Sube el archivo del proveedor para importar sus movimientos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!mostrarSpinner && !mostrarExito && (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-input p-8 text-center transition hover:border-primary"
              >
                <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {archivo ? archivo.name : 'Haz clic o arrastra un PDF, CSV o Excel aquí'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">PDF, CSV o Excel</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.xls,.xlsx"
                onChange={handleArchivoChange}
                className="hidden"
              />

              <div>
                <label className="mb-2 block text-sm font-medium">Proveedor (opcional)</label>
                <Input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Se usa el nombre del proveedor de la wallet"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Un proveedor conocido (Coindepo) aplica sus reglas de extracción.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Mes del extracto (opcional)
                </label>
                <Input
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                />
              </div>
            </>
          )}

          {mostrarSpinner && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">
                  {estado === 'subiendo' && 'Subiendo archivo...'}
                  {estado === 'pendiente' && 'Esperando procesamiento...'}
                  {estado === 'procesando' && 'Extrayendo movimientos...'}
                </p>
                <p className="text-xs text-muted-foreground">No cierres esta ventana</p>
              </div>
            </div>
          )}

          {mostrarExito && (
            <div className="flex items-center justify-center gap-3 py-8">
              <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">Importación completada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Se crearon {resultado?.creados ?? 0} movimientos y se omitieron {resultado?.omitidos ?? 0} filas duplicadas o inválidas. Los saldos se recalcularon.
                </p>
              </div>
            </div>
          )}

          {mostrarError && (
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <XCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Error</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          )}

          {!mostrarSpinner && !mostrarExito && (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/50 p-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Se extraen depósitos, retiros, swaps, staking, recompensas y comisiones.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Los duplicados se detectan automáticamente. El proceso puede tardar entre 10 y 60
                  segundos.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          {mostrarSpinner || mostrarExito ? (
            <Button variant="outline" onClick={handleCerrar}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleCerrar}>
                Cancelar
              </Button>
              <Button onClick={handleSubir} disabled={!archivo || cargando}>
                {cargando ? 'Importando...' : 'Importar'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ImportarWalletModal
