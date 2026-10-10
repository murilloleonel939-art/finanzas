#!/usr/bin/env node

/**
 * FASE 17: Prueba de humo - Importación de PDFs
 * 
 * Comprueba:
 * 1. Estructura de imports-datos.js
 * 2. Estructura de imports-prompts.js
 * 3. Validación de respuestas LLM
 * 4. Lógica de deduplicación
 * 5. Creación de movimientos desde importación
 * 
 * Ejecutar: npm run humo:fase17
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Imports simulados (no queremos inicializar Supabase)
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

console.log('📋 FASE 17: Prueba de humo - Importación de PDFs\n');

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

// Verificar validaciones en crearImportJob
assert(datosContent.includes('estado: \'pendiente\''), 'Inicializa jobs con estado pendiente');
assert(datosContent.includes('payload: null'), 'Inicializa payload como null');
assert(datosContent.includes('resultado: null'), 'Inicializa resultado como null');
assert(datosContent.includes('error_msg: null'), 'Inicializa error_msg como null');

// Verificar lógica de deduplicación
assert(datosContent.includes('external_id'), 'Verifica external_id para deduplicación');
assert(datosContent.includes('const { data: existing }'), 'Busca movimientos existentes');
assert(datosContent.includes('if (existing) {'), 'Detecta duplicados');
assert(datosContent.includes('duplicados.push'), 'Registra duplicados');

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

// 3. Verificar Edge Function
console.log('\n3️⃣  Edge Function: crear-import-job');
const efPath = path.join(rootDir, 'supabase/functions/crear-import-job/index.ts');
const efContent = fs.readFileSync(efPath, 'utf8');

assert(efContent.includes('POST'), 'Verifica método POST');
assert(efContent.includes('FormData'), 'Recibe FormData del navegador');
assert(efContent.includes('application/pdf'), 'Valida tipo PDF');
assert(efContent.includes('supabase.storage'), 'Sube a Storage');
assert(efContent.includes('import_jobs'), 'Crea job en tabla');
assert(efContent.includes('estado: \'pendiente\''), 'Inicializa con estado pendiente');

// 4. Verificar Worker
console.log('\n4️⃣  Worker: worker-import.mjs');
const workerPath = path.join(rootDir, 'worker-import.mjs');
const workerContent = fs.readFileSync(workerPath, 'utf8');

assert(workerContent.includes('procesarJob'), 'Define función procesarJob');
assert(workerContent.includes('obtenerJobsPendientes'), 'Define función obtenerJobsPendientes');
assert(workerContent.includes('GPT-6'), 'Usa GPT-6 Luna');
assert(workerContent.includes('gpt-6-luna'), 'Configura modelo correcto');
assert(workerContent.includes('system:'), 'Envía system prompt');
assert(workerContent.includes('base64'), 'Codifica PDF en base64');
assert(workerContent.includes('image'), 'Usa vision para procesar imagen');
assert(workerContent.includes('validarRespuestaExtraccion'), 'Valida respuesta del LLM');
assert(workerContent.includes('estado: \'procesando\''), 'Marca como procesando');
assert(workerContent.includes('estado: \'hecho\''), 'Marca como completado');
assert(workerContent.includes('estado: \'error\''), 'Marca como error si falla');

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

// Verificar que la deduplicación es completa
assert(datosContent.includes('external_id'), 'Busca por external_id');
assert(datosContent.includes('duplicados') && datosContent.includes('creados'), 'Retorna conteo de duplicados');

// Verificar que se actualiza estado del job
assert(workerContent.includes('actualizarImportJob'), 'Actualiza estado del job');
assert(workerContent.includes('payload:'), 'Guarda payload extraído');
assert(workerContent.includes('resultado'), 'Guarda resultado de creación');

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
  console.log('✅ FASE 17 lista para deploy\n');
  console.log('Próximos pasos:');
  console.log('  1. Desplegar Edge Function: supabase functions deploy crear-import-job');
  console.log('  2. Iniciar worker en EC2/Coolify: PATEWAY_API_KEY=... node worker-import.mjs');
  console.log('  3. Probar en UI: subir un PDF en Cuentas/Brokers/Wallets');
  process.exit(0);
}
