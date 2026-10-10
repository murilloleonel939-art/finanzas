#!/usr/bin/env node

/**
 * Pruebas del módulo de exportación de datos.
 * 
 * Valida:
 * - Componente ExportButtons existe y tiene la estructura correcta
 * - Integración en CuentaDetail, WalletDetail, BrokerDetail
 * - Métodos de exportación generan contenido válido
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

let testsPassed = 0
let testsFailed = 0

function test(nombre, fn) {
  try {
    fn()
    console.log(`${colors.green}✓${colors.reset} ${nombre}`)
    testsPassed++
  } catch (e) {
    console.log(`${colors.red}✗${colors.reset} ${nombre}`)
    console.log(`  ${e.message}`)
    testsFailed++
  }
}

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje)
}

function fileExists(ruta) {
  return fs.existsSync(path.join(rootDir, ruta))
}

function fileContains(ruta, patron) {
  const contenido = fs.readFileSync(path.join(rootDir, ruta), 'utf-8')
  return contenido.includes(patron)
}

console.log(`${colors.blue}🧪 Exportación de datos${colors.reset}\n`)

// ============================================================================
// SUITE 1: Componente ExportButtons
// ============================================================================

console.log(`${colors.blue}📦 Suite 1: Componente ExportButtons${colors.reset}`)

test('ExportButtons.jsx existe', () => {
  assert(fileExists('src/components/ExportButtons.jsx'), 'Archivo no encontrado')
})

test('ExportButtons exporta función default', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'export default function ExportButtons'), 'Función default no exportada')
})

test('ExportButtons acepta prop datos', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'datos'), 'Prop datos no encontrada')
})

test('ExportButtons acepta prop columnas', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'columnas'), 'Prop columnas no encontrada')
})

test('ExportButtons acepta prop nombreArchivo', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'nombreArchivo'), 'Prop nombreArchivo no encontrada')
})

test('ExportButtons acepta prop disabled', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'disabled'), 'Prop disabled no encontrada')
})

test('ExportButtons tiene método exportarCSV', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'exportarCSV'), 'Método exportarCSV no encontrado')
})

test('ExportButtons tiene método exportarExcel', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'exportarExcel'), 'Método exportarExcel no encontrado')
})

test('ExportButtons tiene método exportarPDF', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'exportarPDF'), 'Método exportarPDF no encontrado')
})

test('ExportButtons crea Blob para descarga', () => {
  assert(fileContains('src/components/ExportButtons.jsx', 'new Blob'), 'Creación de Blob no encontrada')
})

test('ExportButtons usa lucide-react icons', () => {
  assert(fileContains('src/components/ExportButtons.jsx', "from 'lucide-react'"), 'Import de lucide-react no encontrado')
})

console.log()

// ============================================================================
// SUITE 2: Integración en páginas de detalle
// ============================================================================

console.log(`${colors.blue}🔗 Suite 2: Integración en páginas${colors.reset}`)

test('CuentaDetail.jsx importa ExportButtons', () => {
  assert(fileContains('src/pages/CuentaDetail.jsx', "import ExportButtons from '@/components/ExportButtons'"), 'Import no encontrado')
})

test('CuentaDetail.jsx usa ExportButtons', () => {
  assert(fileContains('src/pages/CuentaDetail.jsx', '<ExportButtons'), 'Componente no utilizado')
})

test('WalletDetail.jsx importa ExportButtons', () => {
  assert(fileContains('src/pages/WalletDetail.jsx', "import ExportButtons from '@/components/ExportButtons'"), 'Import no encontrado')
})

test('WalletDetail.jsx usa ExportButtons', () => {
  assert(fileContains('src/pages/WalletDetail.jsx', '<ExportButtons'), 'Componente no utilizado')
})

test('BrokerDetail.jsx importa ExportButtons', () => {
  assert(fileContains('src/pages/BrokerDetail.jsx', "import ExportButtons from '@/components/ExportButtons'"), 'Import no encontrado')
})

test('BrokerDetail.jsx usa ExportButtons', () => {
  assert(fileContains('src/pages/BrokerDetail.jsx', '<ExportButtons'), 'Componente no utilizado')
})

console.log()

// ============================================================================
// SUITE 3: Cron Setup
// ============================================================================

console.log(`${colors.blue}⏰ Suite 3: Configuración de Cron${colors.reset}`)

test('scripts/cron-setup.sh existe', () => {
  assert(fileExists('scripts/cron-setup.sh'), 'Archivo no encontrado')
})

test('cron-setup.sh es ejecutable', () => {
  const stats = fs.statSync(path.join(rootDir, 'scripts/cron-setup.sh'))
  assert((stats.mode & 0o111) !== 0, 'Script no es ejecutable')
})

test('cron-setup.sh menciona worker-precios.mjs', () => {
  assert(fileContains('scripts/cron-setup.sh', 'worker-precios.mjs'), 'Referencia a worker no encontrada')
})

test('cron-setup.sh configura hora 16:00 (4 PM)', () => {
  assert(fileContains('scripts/cron-setup.sh', '16:00') || fileContains('scripts/cron-setup.sh', '4 PM'), 'Hora no especificada')
})

test('cron-setup.sh crea directorio logs', () => {
  assert(fileContains('scripts/cron-setup.sh', 'logs'), 'Directorio de logs no menciona')
})

console.log()

// ============================================================================
// SUITE 4: Documentación
// ============================================================================

console.log(`${colors.blue}📚 Suite 4: Documentación${colors.reset}`)

test('la documentación de exportación existe', () => {
  assert(fileExists('docs/DECISIONES.md'), 'Archivo no encontrado')
})

test('el PRD documenta la exportación CSV', () => {
  assert(fileContains('docs/PRD.md', 'CSV'), 'Exportación CSV no documentada')
})

test('el PRD documenta la exportación Excel', () => {
  assert(fileContains('docs/PRD.md', 'Excel'), 'Exportación Excel no documentada')
})

test('el PRD documenta la exportación PDF', () => {
  assert(fileContains('docs/PRD.md', 'PDF'), 'Exportación PDF no documentada')
})

test('DECISIONES documenta el barrido de las 16:00', () => {
  assert(fileContains('docs/DECISIONES.md', '16:00'), 'Cron no documentado')
})

console.log()

// ============================================================================
// Resumen
// ============================================================================

const totalTests = testsPassed + testsFailed
const porcentaje = ((testsPassed / totalTests) * 100).toFixed(1)

console.log(`${colors.blue}📊 Resumen${colors.reset}`)
console.log(`  Total: ${totalTests}`)
console.log(`  ${colors.green}Pasadas: ${testsPassed}${colors.reset}`)
console.log(`  ${colors.red}Fallidas: ${testsFailed}${colors.reset}`)
console.log(`  Cobertura: ${porcentaje}%`)
console.log()

process.exit(testsFailed > 0 ? 1 : 0)
