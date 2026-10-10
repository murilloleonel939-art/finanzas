/**
 * Worker de importación
 * Procesa jobs de importación con GPT-6 Luna
 * 
 * Flujo:
 * 1. Buscar jobs en estado 'pendiente'
 * 2. Marcar como 'procesando'
 * 3. Descargar PDF de Storage
 * 4. Generar prompt según tipo (cuenta/broker/wallet)
 * 5. Llamar a GPT-6 Luna con el PDF
 * 6. Validar respuesta y crear movimientos
 * 7. Marcar job como 'hecho' o 'error'
 * 
 * Ejecutar con: node worker-import.mjs
 * En producción: supervisord o systemd service
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  generarPromptMovimientosCuenta,
  generarPromptMovimientosBroker,
  generarPromptMovimientosWallet,
  validarRespuestaExtraccion,
  derivarExternalId,
} from '../src/lib/imports-prompts.js';
import {
  actualizarImportJob,
  crearMovimientosDesdeImportacion,
  crearMovimientosBrokerDesdeImportacion,
  crearMovimientosWalletDesdeImportacion,
  obtenerCuentaParaImportacion,
  obtenerBrokerParaImportacion,
  obtenerWalletParaImportacion,
} from '../src/lib/imports-datos.js';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PATEWAY_API_KEY = process.env.PATEWAY_API_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000', 10); // 10s
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/finanzas-imports';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !PATEWAY_API_KEY) {
  console.error('Faltan variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PATEWAY_API_KEY');
  process.exit(1);
}

// Crear directorio temporal
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ============================================================================
// CLIENTES
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const openai = new OpenAI({
  apiKey: PATEWAY_API_KEY,
  baseURL: 'https://api.pateway.ai/v1',
});

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Procesar un job individual
 */
async function procesarJob(job) {
  try {
    console.log(`\n📥 Procesando job ${job.id} (${job.destino}/${job.destino_id})`);

    // Marcar como procesando
    await actualizarImportJob(job.id, { estado: 'procesando' });

    // Descargar PDF
    const pdfPath = await descargarPDF(job.archivo_url);

    // Obtener contexto según tipo
    let contexto;
    let prompt;

    switch (job.destino) {
      case 'cuenta':
        contexto = await obtenerCuentaParaImportacion(job.destino_id);
        prompt = generarPromptMovimientosCuenta({
          ...contexto,
          proveedor: job.proveedor,
        });
        break;

      case 'broker':
        contexto = await obtenerBrokerParaImportacion(job.destino_id);
        prompt = generarPromptMovimientosBroker(contexto);
        break;

      case 'wallet':
        contexto = await obtenerWalletParaImportacion(job.destino_id);
        prompt = generarPromptMovimientosWallet({
          ...contexto,
          proveedor: job.proveedor,
        });
        break;

      default:
        throw new Error(`Destino desconocido: ${job.destino}`);
    }

    // Leer PDF como base64
    const pdfData = fs.readFileSync(pdfPath);
    const base64Pdf = pdfData.toString('base64');

    // Llamar a GPT-6 Luna con vision
    console.log(`🤖 Extrayendo con GPT-6 Luna...`);
    const response = await openai.messages.create({
      model: 'gpt-6-luna',
      max_tokens: 4096,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              type: 'text',
              text: 'Extrae todos los movimientos del PDF. Retorna solo JSON, sin explicaciones.',
            },
          ],
        },
      ],
    });

    const extractedText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    console.log(`✅ Respuesta recibida (${extractedText.length} chars)`);

    // Validar y parsear respuesta
    const datos = validarRespuestaExtraccion(extractedText);

    // Derivar external_id si falta
    if (Array.isArray(datos)) {
      for (const mov of datos) {
        if (!mov.external_id) {
          mov.external_id = await derivarExternalId(mov);
        }
      }
    } else if (datos.movimientos) {
      for (const mov of datos.movimientos) {
        if (!mov.external_id) {
          mov.external_id = await derivarExternalId(mov);
        }
      }
      if (datos.activos) {
        for (const activo of datos.activos) {
          if (!activo.external_id) {
            activo.external_id = await derivarExternalId(activo);
          }
        }
      }
    }

    // Crear movimientos según tipo
    let resultado;

    switch (job.destino) {
      case 'cuenta':
        resultado = await crearMovimientosDesdeImportacion({
          cuenta_id: job.destino_id,
          movimientos: datos,
        });
        console.log(`📊 ${resultado.creados.length} movimientos creados, ${resultado.duplicados.length} duplicados`);
        break;

      case 'broker':
        resultado = await crearMovimientosBrokerDesdeImportacion({
          broker_id: job.destino_id,
          movimientos: datos.movimientos,
          activos: datos.activos,
        });
        console.log(`📊 ${resultado.movimientosCreados.length} movimientos, ${resultado.activosCreados.length} activos`);
        break;

      case 'wallet':
        resultado = await crearMovimientosWalletDesdeImportacion({
          wallet_id: job.destino_id,
          movimientos: datos,
        });
        console.log(`📊 ${resultado.creados.length} movimientos creados, ${resultado.duplicados.length} duplicados`);
        break;
    }

    // Marcar como hecho
    await actualizarImportJob(job.id, {
      estado: 'hecho',
      payload: { datos_extraidos: datos },
      resultado,
    });

    console.log(`✅ Job completado: ${job.id}`);

    // Limpiar PDF temporal
    fs.unlinkSync(pdfPath);

  } catch (error) {
    console.error(`❌ Error en job ${job.id}:`, error.message);

    try {
      await actualizarImportJob(job.id, {
        estado: 'error',
        error_msg: error.message,
      });
    } catch (updateError) {
      console.error(`No se pudo actualizar el job a error:`, updateError.message);
    }
  }
}

/**
 * Descargar PDF desde Storage
 */
async function descargarPDF(archivoUrl) {
  const { data, error } = await supabase.storage
    .from('extractos')
    .download(archivoUrl);

  if (error) throw new Error(`No se pudo descargar: ${error.message}`);

  const filename = path.basename(archivoUrl);
  const localPath = path.join(TEMP_DIR, filename);
  const buffer = await data.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buffer));

  return localPath;
}

/**
 * Buscar jobs pendientes
 */
async function obtenerJobsPendientes() {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(5); // Procesar máximo 5 por ciclo

  if (error) throw new Error(`No se pudieron obtener jobs: ${error.message}`);
  return data || [];
}

/**
 * Loop principal del worker
 */
async function workerLoop() {
  console.log(`\n⏰ ${new Date().toISOString()} - Buscando jobs pendientes...`);

  try {
    const jobs = await obtenerJobsPendientes();

    if (jobs.length === 0) {
      console.log('Ningún job pendiente.');
    } else {
      console.log(`Encontrados ${jobs.length} job(s) pendiente(s)`);

      for (const job of jobs) {
        await procesarJob(job);
      }
    }
  } catch (error) {
    console.error('Error en loop principal:', error.message);
  }

  // Siguiente iteración
  setTimeout(workerLoop, POLL_INTERVAL);
}

// ============================================================================
// INICIAR WORKER
// ============================================================================

console.log('🚀 Worker de importación iniciado');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   Intervalo de polling: ${POLL_INTERVAL}ms`);
console.log(`   Directorio temporal: ${TEMP_DIR}`);

workerLoop();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM recibido. Cerrando gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT recibido. Cerrando gracefully...');
  process.exit(0);
});
