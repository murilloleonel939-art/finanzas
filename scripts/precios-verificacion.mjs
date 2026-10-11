#!/usr/bin/env node

/** Verificación final del módulo de precios local. */

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const archivos = [
  { ruta: 'src/lib/precios-sync.js', tipo: 'Motor de sincronización' },
  { ruta: 'src/lib/yahoo-finance.js', tipo: 'Cliente de Yahoo Finance' },
  { ruta: 'src/lib/precios-datos.js', tipo: 'Capa de datos' },
  { ruta: 'worker-precios.mjs', tipo: 'Worker de precios' },
  { ruta: 'server/schema.sql', tipo: 'Esquema PostgreSQL' },
  { ruta: 'scripts/precios-pruebas.mjs', tipo: 'Pruebas de humo' },
  { ruta: 'scripts/precios-suite.mjs', tipo: 'Suite de pruebas' },
]

console.log('═'.repeat(80))
console.log('PRECIOS: VERIFICACIÓN FINAL DE INTEGRIDAD')
console.log('═'.repeat(80))

let archivosOK = 0
for (const { ruta, tipo } of archivos) {
  if (existsSync(ruta)) {
    const lineas = readFileSync(ruta, 'utf8').split('\n').length
    console.log(`✅ ${tipo.padEnd(30)} ${ruta} (${lineas} líneas)`)
    archivosOK++
  } else {
    console.log(`❌ ${tipo.padEnd(30)} ${ruta} [NO ENCONTRADO]`)
  }
}

const pruebas = ['scripts/precios-pruebas.mjs']
let pruebasOK = 0
for (const script of pruebas) {
  const resultado = spawnSync('node', [script], { encoding: 'utf8', stdio: 'pipe' })
  if (resultado.status === 0) {
    console.log(`✅ Prueba: ${script}`)
    pruebasOK++
  } else {
    console.log(`❌ Prueba: ${script}`)
    console.log(resultado.stderr.split('\n').slice(-5).join('\n'))
  }
}

const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', stdio: 'pipe' })
console.log(build.status === 0 ? '✅ npm run build' : '❌ npm run build')

const todoBien = archivosOK === archivos.length && pruebasOK === pruebas.length && build.status === 0
console.log(`\n${todoBien ? '✅ TODOS LOS VERIFICADORES PASAN' : '❌ ALGUNOS VERIFICADORES FALLARON'}`)
process.exit(todoBien ? 0 : 1)
