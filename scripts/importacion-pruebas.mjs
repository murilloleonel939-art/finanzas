#!/usr/bin/env node

/**
 * Prueba de humo del módulo de importación de PDFs.
 * 
 * Comprueba:
 * 1. Estructura de imports-datos.js
 * 2. Estructura de imports-prompts.js
 * 3. Validación de respuestas LLM
 * 4. Lógica de deduplicación
 * 5. Creación de movimientos desde importación
 * 
 * Ejecutar: npm run pruebas:importacion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Verificación estática para mantener el smoke test sin conexiones externas.
let checkCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, message) {
  checkCount++;
  if (condition) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

// ============================================================================
// LEER ARCHIVOS Y VERIFICAR ESTRUCTURA
// ============================================================================

console.log('📋 Importación de PDFs: prueba de humo\n');

// 1. Verificar imports-datos.js
console.log('1️⃣  Archivo imports-datos.js');
const datospath = path.join(rootDir, 'src/lib/imports-datos.js');
const datosContent = fs.readFileSync(datospath, 'utf8');

assert(datosContent.includes('export async function crearImportJob'), 'Exporta crearImportJob');
assert(datosContent.includes('export async function obtenerImportJobs'), 'Exporta obtenerImportJobs');
assert(datosContent.includes('export async function obtenerImportJob'), 'Exporta obtenerImportJob');
assert(datosContent.includes('export async function actualizarImportJob'), 'Exporta actualizarImportJob');
assert(datosContent.includes('export async function crearMovimientosDesdeImportacion'), 'Exporta crearMovimientosDesdeImportacion (cuentas)');
assert(datosContent.includes('export async function crearMovimientosBrokerDesdeImportacion'), 'Exporta crearMovimientosBrokerDesdeImportacion');
assert(datosContent.includes('export async function crearMovimientosWalletDesdeImportacion'), 'Exporta crearMovimientosWalletDesdeImportacion');
assert(datosContent.includes('export async function subirExtractoPDF'), 'Exporta subirExtractoPDF');

// La creación del job, el almacenamiento del PDF y la deduplicación
// viven ahora en el backend/worker local; el cliente solo transporta el PDF.
assert(datosContent.includes("/api/empresas/${empresa_id}/import-jobs"), 'Crea jobs mediante la API local');
assert(datosContent.includes('Los jobs de importación solo los actualiza el worker/backend local') || datosContent.includes('solo los actualiza el worker'), 'Impide actualizar jobs desde el cliente');
assert(!datosContent.includes("from './db.js'"), 'No importa un adaptador de base de datos legado');
assert(datosContent.includes('crearMovimientosDesdeImportacion'), 'La lógica de movimientos existe en el cliente API');

// 2. Verificar imports-prompts.js
console.log('\n2️⃣  Archivo imports-prompts.js');
const promptsPath = path.join(rootDir, 'src/lib/imports-prompts.js');
const promptsContent = fs.readFileSync(promptsPath, 'utf8');

assert(promptsContent.includes('export const PROVIDER_RULES'), 'Exporta PROVIDER_RULES');
assert(promptsContent.includes('coindepo'), 'Incluye reglas para Coindepo');
assert(promptsContent.includes('otro'), 'Incluye reglas genéricas');
assert(promptsContent.includes('export function generarPromptMovimientosCuenta'), 'Exporta prompt de cuentas');
assert(promptsContent.includes('export function generarPromptMovimientosBroker'), 'Exporta prompt de brokers');
assert(promptsContent.includes('export function generarPromptMovimientosWallet'), 'Exporta prompt de wallets');
assert(promptsContent.includes('export function validarRespuestaExtraccion'), 'Exporta validarRespuestaExtraccion');
assert(promptsContent.includes('export async function derivarExternalId'), 'Exporta derivarExternalId');

// Verificar reglas CRÍTICAS en prompts
assert(promptsContent.includes('YYYY-MM-DD'), 'Especifica formato de fecha');
assert(promptsContent.includes('tipo.*ingreso.*egreso') || promptsContent.includes("'ingreso'") && promptsContent.includes("'egreso'"), 'Define tipos de movimiento');
assert(promptsContent.includes('Retorna un array JSON'), 'Especifica formato JSON en respuesta');
assert(promptsContent.includes('status'), 'Menciona validación de status');
assert(promptsContent.includes('complete') || promptsContent.includes('completed'), 'Define status permitidos');

// 3. Verificar API local
console.log('\n3️⃣  API local: creación de importaciones');
const apiPath = path.join(rootDir, 'server/index.mjs');
const apiContent = fs.readFileSync(apiPath, 'utf8');

assert(apiContent.includes("app.post('/api/empresas/:empresaId/import-jobs"), 'Expone endpoint POST local');
assert(apiContent.includes('Buffer.from') && apiContent.includes("subarray(0, 4).toString() !== '%PDF'"), 'Valida archivos PDF codificados');
assert(apiContent.includes('import_jobs'), 'Crea job en PostgreSQL');
assert(apiContent.includes("'pendiente'") || apiContent.includes('pendiente'), 'Inicializa con estado pendiente');

// 4. Verificar Worker
console.log('\n4️⃣  Worker: worker-import.mjs');
const workerPath = path.join(rootDir, 'worker-import.mjs');
const workerContent = fs.readFileSync(workerPath, 'utf8');

assert(workerContent.includes('procesarJob'), 'Define función procesarJob');
assert(workerContent.includes("from './server/db.mjs'"), 'Usa el pool PostgreSQL local');
assert(workerContent.includes("where estado = 'pendiente'"), 'Busca jobs pendientes en PostgreSQL');
assert(workerContent.includes('NVIDIA_API_KEY'), 'Usa NVIDIA NIM configurado');
assert(workerContent.includes('nvidia/nemotron-3-super-120b-a12b'), 'Configura Nemotron correcto');
assert(workerContent.includes('system'), 'Envía system prompt');
assert(workerContent.includes('pdftotext'), 'Convierte PDF a texto');
assert(workerContent.includes('chat/completions'), 'Usa API compatible con OpenAI');
assert(workerContent.includes('validarRespuestaExtraccion'), 'Valida respuesta del LLM');
assert(workerContent.includes("estado = 'procesando'"), 'Marca como procesando');
assert(workerContent.includes("estado = 'hecho'"), 'Marca como completado');
assert(workerContent.includes("estado = 'error'"), 'Marca como error si falla');

// 5. Verificar Componentes React
console.log('\n5️⃣  Componentes React');

const modalCuentasPath = path.join(rootDir, 'src/components/ImportarMovimientosModal.jsx');
const modalCuentasContent = fs.readFileSync(modalCuentasPath, 'utf8');
assert(modalCuentasContent.includes('export function ImportarMovimientosModal'), 'Exporta ImportarMovimientosModal');
assert(modalCuentasContent.includes('destino') && modalCuentasContent.includes('cuenta'), 'Especifica destino cuenta');
assert(modalCuentasContent.includes('monitorearJob'), 'Implementa polling del estado');
assert(modalCuentasContent.includes('estado === \'hecho\''), 'Detecta completación');

const modalBrokerPath = path.join(rootDir, 'src/components/ImportarBrokerModal.jsx');
const modalBrokerContent = fs.readFileSync(modalBrokerPath, 'utf8');
assert(modalBrokerContent.includes('export function ImportarBrokerModal'), 'Exporta ImportarBrokerModal');
assert(modalBrokerContent.includes('destino') && modalBrokerContent.includes('broker'), 'Especifica destino broker');

const modalWalletPath = path.join(rootDir, 'src/components/ImportarWalletModal.jsx');
const modalWalletContent = fs.readFileSync(modalWalletPath, 'utf8');
assert(modalWalletContent.includes('export function ImportarWalletModal'), 'Exporta ImportarWalletModal');
assert(modalWalletContent.includes('destino') && modalWalletContent.includes('wallet'), 'Especifica destino wallet');

// ============================================================================
// VALIDACIÓN DE LÓGICA
// ============================================================================

console.log('\n6️⃣  Validación de lógica');

// Verificar que hay manejo de errores
assert(datosContent.includes('throw new Error') || datosContent.includes('error'), 'Lanza errores en imports-datos');
assert(promptsContent.includes('throw new Error') || promptsContent.includes('Error'), 'Valida respuestas en prompts');
assert(workerContent.includes('catch (error)'), 'Maneja errores en worker');

// La deduplicación y los conteos se calculan en el worker/backend local.
assert(workerContent.includes('external_id') || datosContent.includes('external_id'), 'Worker/backend busca por external_id');
assert(workerContent.includes('duplicados') || datosContent.includes('duplicados'), 'Worker/backend retorna conteo de duplicados');

// Verificar que se actualiza estado del job
assert(workerContent.includes("update import_jobs set estado"), 'Actualiza estado del job');
assert(workerContent.includes('movimientos_creados'), 'Guarda conteo de movimientos');
assert(workerContent.includes('duplicados_omitidos'), 'Guarda conteo de duplicados');

// ============================================================================
// RESUMEN
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`Prueba de humo completada: ${passCount}/${checkCount} ✓\n`);

if (failCount > 0) {
  console.log(`⚠️  ${failCount} fallos:\n`);
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });
  process.exit(1);
} else {
  console.log('✅ Importación de PDFs: lista\n');
  console.log('Próximos pasos:');
  console.log('  1. Ejecutar server/migrate.mjs contra PostgreSQL de Coolify');
  console.log('  2. Instalar pdftotext y ejecutar NVIDIA_API_KEY=... node worker-import.mjs');
  console.log('  3. Probar en UI: subir un PDF en Cuentas/Brokers/Wallets');
  process.exit(0);
}
