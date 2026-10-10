/**
 * FASE 17: Modal de importación para WALLETS
 * Permite importar movimientos de wallets cripto
 */

import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '@radix-ui/react-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@radix-ui/react-dialog';
import { AlertCircle, Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export function ImportarWalletModal({ 
  isOpen, 
  onClose, 
  walletId, 
  empresaId,
  walletProveedor,
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
      if (file.type !== 'application/pdf') {
        setError('Solo se aceptan archivos PDF');
        return;
      }
      setArchivo(file);
      setError('');
    }
  };

  const handleSubir = async () => {
    if (!archivo) {
      setError('Selecciona un archivo PDF');
      return;
    }

    setCargando(true);
    setError('');
    setEstado('subiendo');

    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('empresa_id', empresaId);
      formData.append('destino', 'wallet'); // Especifica destino wallet
      formData.append('destino_id', walletId);
      if (walletProveedor) {
        formData.append('proveedor', walletProveedor);
      }

      const response = await fetch('/functions/v1/crear-import-job', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al crear el job');
      }

      const { job } = await response.json();
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
        const { data: job, error } = await supabase
          .from('import_jobs')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
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
          setError(job.error_msg || 'Error desconocido');
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
          <DialogTitle>Importar wallet</DialogTitle>
          <DialogDescription>Sube un extracto de transacciones para importar movimientos</DialogDescription>
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
                  {archivo ? archivo.name : 'Haz clic o arrastra un PDF aquí'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Solo archivos PDF</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleArchivoChange}
                className="hidden"
              />

              <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">Se extraerá:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                    <li>Depósitos y retiros</li>
                    <li>Swaps e intercambios</li>
                    <li>Staking e intereses Earn</li>
                    <li>Recompensas y comisiones</li>
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
                  {estado === 'procesando' && 'Procesando wallet...'}
                </p>
              </div>
            </div>
          )}

          {mostrarExito && (
            <div className="flex items-center justify-center gap-3 py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="font-medium text-gray-900">Completado</p>
                <p className="text-sm text-gray-600">Movimientos importados</p>
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

export default ImportarWalletModal;
