/**
 * Modal de importación de extractos para BROKERS.
 * Permite importar movimientos y activos desde PDF, CSV y Excel.
 */

import React, { useState, useRef } from 'react';
import { crearImportJob, obtenerImportJob } from '../lib/import-jobs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export function ImportarBrokerModal({ 
  isOpen, 
  onClose, 
  brokerId, 
  empresaId,
  nombreBroker = 'Interactive Brokers',
  onSuccess 
}) {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [estado, setEstado] = useState('');
  const fileInputRef = useRef(null);

  const handleArchivoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const extension = file.name.toLowerCase().split('.').pop();
      if (!['pdf', 'csv', 'xls', 'xlsx'].includes(extension)) {
        setError('Solo se aceptan archivos PDF, CSV o Excel');
        return;
      }
      setArchivo(file);
      setError('');
    }
  };

  const handleSubir = async () => {
    if (!archivo) {
      setError('Selecciona un archivo PDF, CSV o Excel');
      return;
    }

    setCargando(true);
    setError('');
    setEstado('subiendo');

    try {
      const { job } = await crearImportJob({ empresaId, target: 'broker', destinoId: brokerId, archivo });
      setJobId(job.id);
      setEstado('pendiente');
      monitorearJob(job.id);

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setEstado('error');
      setCargando(false);
    }
  };

  const monitorearJob = async (id) => {
    let intentos = 0;
    const maxIntentos = 120;

    const verificar = async () => {
      try {
        const job = await obtenerImportJob(id);
        setEstado(job.estado);

        if (job.estado === 'hecho') {
          setCargando(false);
          setTimeout(() => {
            onSuccess?.();
            handleCerrar();
          }, 2000);
          return;
        }

        if (job.estado === 'error') {
          setError(job.error_mensaje || 'Error desconocido');
          setCargando(false);
          return;
        }

        intentos++;
        if (intentos < maxIntentos) {
          setTimeout(verificar, 1000);
        } else {
          setError('Tiempo de espera agotado');
          setCargando(false);
        }
      } catch (err) {
        console.error('Error:', err);
        setError(err.message);
        setCargando(false);
      }
    };

    verificar();
  };

  const handleCerrar = () => {
    setArchivo(null);
    setError('');
    setJobId('');
    setEstado('');
    setCargando(false);
    onClose();
  };

  const mostrarSpinner = estado === 'procesando' || estado === 'subiendo' || estado === 'pendiente';
  const mostrarExito = estado === 'hecho';
  const mostrarError = estado === 'error' || (error && !mostrarSpinner && !mostrarExito);

  return (
    <Dialog open={isOpen} onOpenChange={handleCerrar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar extracto de {nombreBroker}</DialogTitle>
          <DialogDescription>
            {nombreBroker.trim().toLowerCase() === 'quotex'
              ? 'Sube un extracto de Quotex para importar ganancias, pérdidas, retiros y depósitos.'
              : 'Sube un extracto de Interactive Brokers para importar movimientos y activos'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!mostrarSpinner && !mostrarExito && (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition"
              >
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-700">
                  {archivo ? archivo.name : 'Haz clic o arrastra un archivo aquí'}
                </p>
                <p className="text-xs text-gray-500 mt-1">PDF, CSV, XLS o XLSX (máximo 10 MB)</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.xls,.xlsx"
                onChange={handleArchivoChange}
                className="hidden"
              />

              <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">Se extraerá:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                    {nombreBroker.trim().toLowerCase() === 'quotex' ? (
                      <>
                        <li>Ganancias y pérdidas</li>
                        <li>Retiros y depósitos</li>
                      </>
                    ) : (
                      <>
                        <li>Depósitos y retiradas (D&amp;R)</li>
                        <li>Compras y ventas (operaciones)</li>
                        <li>Posiciones abiertas (activos)</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </>
          )}

          {mostrarSpinner && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <div>
                <p className="font-medium text-gray-900">
                  {estado === 'subiendo' && 'Subiendo...'}
                  {estado === 'pendiente' && 'Esperando...'}
                  {estado === 'procesando' && 'Extrayendo datos...'}
                </p>
              </div>
            </div>
          )}

          {mostrarExito && (
            <div className="flex items-center justify-center gap-3 py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="font-medium text-gray-900">Completado</p>
                <p className="text-sm text-gray-600">Movimientos y activos importados</p>
              </div>
            </div>
          )}

          {mostrarError && (
            <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          {(mostrarSpinner || mostrarExito) ? (
            <Button variant="outline" onClick={handleCerrar}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleCerrar}>Cancelar</Button>
              <Button onClick={handleSubir} disabled={!archivo || cargando}>
                Importar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportarBrokerModal;
