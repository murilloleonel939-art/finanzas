#!/usr/bin/env node

/**
 * FASE 18: Verificación final de integridad.
 *
 * Valida que todos los archivos existan, el código sea legible,
 * y las pruebas pasen.
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

console.log('═'.repeat(80))
console.log('FASE 18: VERIFICACIÓN FINAL DE INTEGRIDAD')
console.log('═'.repeat(80))
console.log()

const archivos = [
  // Lógica
  { ruta: 'src/lib/precios-sync.js', tipo: 'Motor de sincronización' },
  {
    ruta: 'src/lib/yahoo-finance.js',
    tipo: 'Cliente de Yahoo Finance',
  },
  { ruta: 'src/lib/precios-datos.js', tipo: 'Capa de datos' },
  { ruta: 'worker-precios.mjs', tipo: 'Worker (cola + barrido)' },

  // API
  {
    ruta: 'supabase/functions/actualizar-precios/index.ts',
    tipo: 'Edge Function',
  },

  // BD
  {
    ruta: 'supabase/migrations/0009_precios_jobs.sql',
    tipo: 'Migración SQL',
  },

  // Pruebas
  { ruta: 'scripts/humo-fase18.mjs', tipo: 'Pruebas (humo)' },
  {
    ruta: 'scripts/integracion-fase18.mjs',
    tipo: 'Pruebas (integración)',
  },
  {
    ruta: 'scripts/suite-fase18.mjs',
    tipo: 'Suite orquestadora',
  },

  // Documentación
  { ruta: 'FASE18.md', tipo: 'Documentación técnica' },
]

console.log('📁 Verificando archivos:')
console.log()

let archivosOK = 0
let archivosFallo = 0

for (const { ruta, tipo } of archivos) {
  const existe = existsSync(ruta)
  const status = existe ? '✅' : '❌'

  if (existe) {
    const contenido = readFileSync(ruta, 'utf-8')
    const lineas = contenido.split('\n').length
    console.log(`${status} ${tipo.padEnd(30)} ${ruta} (${lineas} líneas)`)
    archivosOK++
  } else {
    console.log(`${status} ${tipo.padEnd(30)} ${ruta} [NO ENCONTRADO]`)
    archivosFallo++
  }
}

console.log()
console.log(`Archivos: ${archivosOK}/${archivos.length} OK`)
console.log()

// ============================================================================
// EJECUCIÓN DE PRUEBAS
// ============================================================================

console.log('═'.repeat(80))
console.log('🧪 Ejecutando pruebas:')
console.log('═'.repeat(80))
console.log()

const pruebas = [
  { script: 'scripts/humo-fase18.mjs', nombre: 'Humo' },
  {
    script: 'scripts/integracion-fase18.mjs',
    nombre: 'Integración',
  },
]

let pruebasOK = 0
let pruebasFallo = 0

for (const { script, nombre } of pruebas) {
  const resultado = spawnSync('node', [script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const ok = resultado.status === 0
  const status = ok ? '✅' : '❌'

  console.log(`${status} ${nombre}`)

  if (ok) {
    pruebasOK++
  } else {
    pruebasFallo++
    // Mostrar último error si falla
    const lineas = resultado.stderr.split('\n')
    for (const linea of lineas.slice(-5)) {
      if (linea.trim()) {
        console.log(`   ⚠️  ${linea}`)
      }
    }
  }
}

console.log()
console.log(`Pruebas: ${pruebasOK}/${pruebas.length} OK`)
console.log()

// ============================================================================
// BUILD
// ============================================================================

console.log('═'.repeat(80))
console.log('🔨 Verificando build:')
console.log('═'.repeat(80))
console.log()

const buildResult = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf-8',
  stdio: 'pipe',
})

const buildOK = buildResult.status === 0
const buildStatus = buildOK ? '✅' : '❌'

console.log(`${buildStatus} npm run build`)
if (!buildOK) {
  const lineas = buildResult.stderr.split('\n')
  for (const linea of lineas.slice(-10)) {
    if (linea.trim()) {
      console.log(`   ⚠️  ${linea}`)
    }
  }
}

console.log()

// ============================================================================
// RESUMEN FINAL
// ============================================================================

console.log('═'.repeat(80))
console.log('📊 RESUMEN FINAL')
console.log('═'.repeat(80))
console.log()

const todoBien = archivosOK === archivos.length && pruebasOK === pruebas.length && buildOK

if (todoBien) {
  console.log('✅ TODOS LOS VERIFICADORES PASAN')
  console.log()
  console.log('   Archivos:        ' + archivosOK + '/' + archivos.length)
  console.log('   Pruebas:         ' + pruebasOK + '/' + pruebas.length)
  console.log('   Build:           OK')
  console.log()
  console.log('🎉 FASE 18 LISTO PARA PRODUCCIÓN')
} else {
  console.log('❌ ALGUNOS VERIFICADORES FALLARON')
  console.log()
  console.log('   Archivos:        ' + archivosOK + '/' + archivos.length)
  console.log('   Pruebas:         ' + pruebasOK + '/' + pruebas.length)
  console.log('   Build:           ' + (buildOK ? 'OK' : 'FALLO'))
  console.log()
  console.log('⚠️  Revisa los errores arriba')
}

console.log()
console.log('═'.repeat(80))

process.exit(todoBien ? 0 : 1)
