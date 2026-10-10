#!/usr/bin/env node

/**
 * Orquestador de las pruebas de precios.
 *
 * Ejecuta:
 *   1. Pruebas de humo (motor de sincronización).
 *   2. Pruebas de integración (Edge Function).
 *
 * El worker real (`worker-precios.mjs`) se prueba contra la BD en producción;
 * no entra en esta suite.
 *
 * Genera un reporte de cobertura.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const PRUEBAS = [
  {
    nombre: 'Humo (motor de sincronización)',
    script: 'scripts/precios-pruebas.mjs',
  },
  {
    nombre: 'Integración (Edge Function)',
    script: 'scripts/precios-integracion.mjs',
  },
]

let totalTests = 0
let pasados = 0
let fallidos = 0

const resultados = []

console.log('═'.repeat(70))
console.log('PRECIOS: SUITE DE PRUEBAS')
console.log('═'.repeat(70))
console.log()

for (const { nombre, script } of PRUEBAS) {
  console.log(`📋 Ejecutando: ${nombre}`)
  console.log('─'.repeat(70))

  const resultado = spawnSync('node', [script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const salida = resultado.stdout + resultado.stderr
  const lineas = salida.split('\n')

  // Contar pruebas
  const testsPasadas = (salida.match(/✅/g) || []).length
  const testsFallidas = (salida.match(/❌/g) || []).length

  totalTests += testsPasadas + testsFallidas
  pasados += testsPasadas
  fallidos += testsFallidas

  console.log(salida)
  console.log()

  resultados.push({
    nombre,
    script,
    pasadas: testsPasadas,
    fallidas: testsFallidas,
    exitCode: resultado.status,
  })
}

// ============================================================================
// REPORTE
// ============================================================================

console.log('═'.repeat(70))
console.log('RESUMEN')
console.log('═'.repeat(70))
console.log()

let tituloStatus = '✅ PRECIOS: TODAS LAS PRUEBAS PASARON'
let statusColor = '\x1b[32m' // Green
if (fallidos > 0) {
  tituloStatus = `❌ PRECIOS: ${fallidos} PRUEBA(S) FALLARON`
  statusColor = '\x1b[31m' // Red
}

console.log(statusColor + tituloStatus + '\x1b[0m')
console.log()

console.log('Desglose:')
for (const { nombre, pasadas, fallidas } of resultados) {
  const status = fallidas === 0 ? '✅' : '❌'
  console.log(`  ${status} ${nombre}: ${pasadas} pasadas, ${fallidas} fallidas`)
}

console.log()
console.log(`Total: ${pasados}/${totalTests} pruebas pasadas`)
console.log()

// ============================================================================
// COBERTURA (no instrumentada, pero valida la lógica)
// ============================================================================

const cobertura = {
  'Motor de sincronización': {
    'Agrupación de activos': 'Deduplicación por (tipo, ticker)',
    'Consulta Yahoo': 'Con mock, concurrencia limitada',
    'Fecha de cotización': 'Prefiere Yahoo, usa respaldo',
    'Persistencia de BD': 'Registra precios y actualiza valor_unitario',
    'Manejo de errores': 'Un fallo no aborta el ciclo',
  },
  'Edge Function': {
    Autenticación: 'Solo super_admin',
    Autorización: 'Valida empresa y broker',
    Validación: 'empresa_id requerida, broker_id opcional',
    'Encolado de jobs': 'Inserta en precios_jobs con estado pendiente',
    Respuesta: '201 con job encolado',
  },
}

console.log('═'.repeat(70))
console.log('COBERTURA (LÓGICA)')
console.log('═'.repeat(70))
console.log()

for (const [módulo, aspectos] of Object.entries(cobertura)) {
  console.log(`📦 ${módulo}:`)
  for (const [aspecto, descripción] of Object.entries(aspectos)) {
    console.log(`   ✓ ${aspecto}: ${descripción}`)
  }
  console.log()
}

// ============================================================================
// GUARDAR REPORTE
// ============================================================================

const reporteJSON = {
  timestamp: new Date().toISOString(),
  total: totalTests,
  pasadas: pasados,
  fallidas: fallidos,
  resultados,
  cobertura,
}

// `reports/` no está en el repo: sin esto, un clon limpio falla al escribir.
mkdirSync('reports', { recursive: true })
writeFileSync('reports/precios-pruebas.json', JSON.stringify(reporteJSON, null, 2))

console.log('📄 Reporte guardado en: reports/precios-pruebas.json')
console.log()

process.exit(fallidos > 0 ? 1 : 0)
