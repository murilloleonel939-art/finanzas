/**
 * Importación de extractos en PDF.
 * Capa de datos para jobs de importación y movimientos extraídos
 */

import { supabase } from './supabase.js';

// ============================================================================
// JOBS DE IMPORTACIÓN
// ============================================================================

/**
 * Crear un job de importación (CUENTAS, BROKERS o WALLETS)
 * @param {Object} params
 * @param {string} params.empresa_id - UUID de la empresa
 * @param {string} params.destino - 'cuenta' | 'broker' | 'wallet'
 * @param {string} params.destino_id - UUID de la cuenta/broker/wallet
 * @param {string} params.archivo_url - URL del PDF en Storage (extractos/...)
 * @param {string} [params.proveedor] - Opcional: nombre del proveedor (Coindepo, etc.)
 * @returns {Promise<Object>} El job creado
 */
export async function crearImportJob({
  empresa_id,
  destino,
  destino_id,
  archivo_url,
  proveedor = null,
}) {
  const { data, error } = await supabase
    .from('import_jobs')
    .insert({
      empresa_id,
      destino,
      destino_id,
      archivo_url,
      proveedor,
      estado: 'pendiente',
      payload: null,
      resultado: null,
      error_msg: null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`No se pudo crear el job: ${error.message}`);
  return data;
}

/**
 * Obtener jobs por empresa
 * @param {string} empresa_id - UUID
 * @param {Object} [options]
 * @param {string} [options.estado] - Filtrar por estado ('pendiente', 'procesando', etc.)
 * @param {number} [options.limit] - Límite de resultados (default 50)
 * @returns {Promise<Array>}
 */
export async function obtenerImportJobs(empresa_id, options = {}) {
  const { estado, limit = 50 } = options;

  let query = supabase
    .from('import_jobs')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (estado) {
    query = query.eq('estado', estado);
  }

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron obtener jobs: ${error.message}`);
  return data;
}

/**
 * Obtener un job por ID
 * @param {string} job_id - UUID
 * @returns {Promise<Object>}
 */
export async function obtenerImportJob(job_id) {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', job_id)
    .single();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw new Error(`No se pudo obtener el job: ${error.message}`);
  return data;
}

/**
 * Actualizar estado de un job (solo para worker)
 * @param {string} job_id - UUID
 * @param {Object} updates
 * @param {string} [updates.estado] - Nuevo estado
 * @param {Object} [updates.payload] - Payload con movimientos extraídos
 * @param {Object} [updates.resultado] - Resultado final
 * @param {string} [updates.error_msg] - Mensaje de error
 * @returns {Promise<Object>}
 */
export async function actualizarImportJob(job_id, updates) {
  const { data, error } = await supabase
    .from('import_jobs')
    .update(updates)
    .eq('id', job_id)
    .select('*')
    .single();

  if (error) throw new Error(`No se pudo actualizar el job: ${error.message}`);
  return data;
}

// ============================================================================
// CREAR MOVIMIENTOS DESDE IMPORTACIÓN
// ============================================================================

/**
 * Crear movimientos para una cuenta desde importación
 * @param {Object} params
 * @param {string} params.cuenta_id - UUID
 * @param {Array} params.movimientos - Array de { fecha, tipo, monto, descripcion, external_id, moneda, status }
 * @returns {Promise<Object>} { creados, duplicados, saldoAnterior, saldoCalculado }
 */
export async function crearMovimientosDesdeImportacion({
  cuenta_id,
  movimientos,
}) {
  // 1. Obtener saldo anterior
  const { data: cuentaData, error: cuentaError } = await supabase
    .from('cuentas')
    .select('saldo, tipo_moneda')
    .eq('id', cuenta_id)
    .single();

  if (cuentaError) throw new Error(`Cuenta no encontrada: ${cuentaError.message}`);

  const saldoAnterior = parseFloat(cuentaData.saldo) || 0;
  let saldoCalculado = saldoAnterior;

  // 2. Insertar movimientos, ignorando duplicados (external_id)
  const creados = [];
  const duplicados = [];

  for (const mov of movimientos) {
    // Validar status si existe
    if (mov.status && !['complete', 'completed'].includes(mov.status.toLowerCase())) {
      continue; // Filtro de status: descartar pending, failed, processing
    }

    const { data: existing } = await supabase
      .from('movimientos')
      .select('id')
      .eq('cuenta_id', cuenta_id)
      .eq('external_id', mov.external_id)
      .single();

    if (existing) {
      duplicados.push(mov);
      continue;
    }

    // Crear el movimiento
    const neto = mov.tipo === 'ingreso'
      ? parseFloat(mov.monto)
      : -parseFloat(mov.monto);

    saldoCalculado += neto;

    const { data: newMov, error: movError } = await supabase
      .from('movimientos')
      .insert({
        cuenta_id,
        fecha: mov.fecha,
        tipo: mov.tipo,
        monto: mov.monto,
        descripcion: mov.descripcion,
        external_id: mov.external_id || null,
        moneda: mov.moneda || cuentaData.tipo_moneda,
      })
      .select('*')
      .single();

    if (movError) {
      console.error('Error creando movimiento:', movError);
      continue;
    }

    creados.push(newMov);
  }

  return {
    creados,
    duplicados,
    saldoAnterior,
    saldoCalculado,
  };
}

/**
 * Crear movimientos para un broker desde importación
 * @param {Object} params
 * @param {string} params.broker_id - UUID
 * @param {Array} params.movimientos - Array de depósitos/retiradas/operaciones
 * @param {Array} params.activos - Array de posiciones abiertas
 * @returns {Promise<Object>} { movimientosCreados, activosCreados }
 */
export async function crearMovimientosBrokerDesdeImportacion({
  broker_id,
  movimientos,
  activos,
}) {
  const movimientosCreados = [];
  const activosCreados = [];

  // Crear movimientos
  for (const mov of movimientos) {
    const { data: existing } = await supabase
      .from('movimientos_broker')
      .select('id')
      .eq('broker_id', broker_id)
      .eq('external_id', mov.external_id)
      .single();

    if (existing) continue;

    const { data: newMov, error: movError } = await supabase
      .from('movimientos_broker')
      .insert({
        broker_id,
        fecha: mov.fecha,
        tipo: mov.tipo, // 'deposito', 'retirada', 'compra', 'venta'
        monto: mov.monto,
        descripcion: mov.descripcion,
        external_id: mov.external_id || null,
      })
      .select('*')
      .single();

    if (!movError && newMov) {
      movimientosCreados.push(newMov);
    }
  }

  // Crear activos
  for (const activo of activos) {
    const { data: existing } = await supabase
      .from('activos_broker')
      .select('id')
      .eq('broker_id', broker_id)
      .eq('ticker', activo.ticker)
      .single();

    if (existing) continue;

    const { data: newActivo, error: activoError } = await supabase
      .from('activos_broker')
      .insert({
        broker_id,
        ticker: activo.ticker,
        nombre: activo.nombre,
        tipo: activo.tipo, // 'accion', 'etf', 'cdat'
        cantidad: activo.cantidad,
        valor_unitario: activo.valor_unitario || 0,
        moneda: activo.moneda,
      })
      .select('*')
      .single();

    if (!activoError && newActivo) {
      activosCreados.push(newActivo);
    }
  }

  return { movimientosCreados, activosCreados };
}

/**
 * Crear movimientos para un wallet desde importación
 * @param {Object} params
 * @param {string} params.wallet_id - UUID
 * @param {Array} params.movimientos - Array de { fecha, tipo, monto, descripcion, moneda, external_id }
 * @returns {Promise<Object>} { creados, duplicados }
 */
export async function crearMovimientosWalletDesdeImportacion({
  wallet_id,
  movimientos,
}) {
  const creados = [];
  const duplicados = [];

  for (const mov of movimientos) {
    if (mov.status && !['complete', 'completed'].includes(mov.status.toLowerCase())) {
      continue;
    }

    const { data: existing } = await supabase
      .from('movimientos_wallet')
      .select('id')
      .eq('wallet_id', wallet_id)
      .eq('external_id', mov.external_id)
      .single();

    if (existing) {
      duplicados.push(mov);
      continue;
    }

    const { data: newMov, error: movError } = await supabase
      .from('movimientos_wallet')
      .insert({
        wallet_id,
        fecha: mov.fecha,
        tipo: mov.tipo,
        monto: mov.monto,
        descripcion: mov.descripcion,
        moneda: mov.moneda,
        external_id: mov.external_id || null,
      })
      .select('*')
      .single();

    if (movError) {
      console.error('Error creando movimiento wallet:', movError);
      continue;
    }

    creados.push(newMov);
  }

  return { creados, duplicados };
}

// ============================================================================
// SUBIR PDF A STORAGE
// ============================================================================

/**
 * Subir un PDF a Storage (bucket 'extractos')
 * @param {File} file - Objeto File del input
 * @param {string} empresa_id - UUID para organizar en carpeta
 * @returns {Promise<string>} URL pública del archivo
 */
export async function subirExtractoPDF(file, empresa_id) {
  const timestamp = Date.now();
  const filename = `${timestamp}-${file.name}`;
  const path = `${empresa_id}/${filename}`;

  const { error } = await supabase.storage
    .from('extractos')
    .upload(path, file);

  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);

  // Retornar la URL pública (el bucket es privado, pero el job puede leerlo con auth)
  return `extractos/${path}`;
}

// ============================================================================
// OBTENER DATOS PARA IMPORTACIÓN
// ============================================================================

/**
 * Obtener detalles de la cuenta para contexto de importación
 * @param {string} cuenta_id - UUID
 * @returns {Promise<Object>}
 */
export async function obtenerCuentaParaImportacion(cuenta_id) {
  const { data, error } = await supabase
    .from('cuentas')
    .select('id, numero, banco, tipo_moneda, saldo, tipo_cuenta')
    .eq('id', cuenta_id)
    .single();

  if (error) throw new Error(`Cuenta no encontrada: ${error.message}`);
  return data;
}

/**
 * Obtener detalles del broker para contexto de importación
 * @param {string} broker_id - UUID
 * @returns {Promise<Object>}
 */
export async function obtenerBrokerParaImportacion(broker_id) {
  const { data, error } = await supabase
    .from('brokers')
    .select('id, nombre, proveedor, moneda')
    .eq('id', broker_id)
    .single();

  if (error) throw new Error(`Broker no encontrado: ${error.message}`);
  return data;
}

/**
 * Obtener detalles del wallet para contexto de importación
 * @param {string} wallet_id - UUID
 * @returns {Promise<Object>}
 */
export async function obtenerWalletParaImportacion(wallet_id) {
  const { data, error } = await supabase
    .from('wallets')
    .select('id, direccion, proveedor, tipo_moneda')
    .eq('id', wallet_id)
    .single();

  if (error) throw new Error(`Wallet no encontrada: ${error.message}`);
  return data;
}
