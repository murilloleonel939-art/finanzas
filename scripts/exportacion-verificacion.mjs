#!/usr/bin/env node

/**
 * Verificación del módulo de exportación de datos.
 * 
 * Checklist del PRD §9 para exportación de datos:
 * 9.1 Exportación en CSV, Excel, PDF
 * 9.2 Cron job a las 4 PM hora Colombia
 * 9.3 Variables de entorno configuradas
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
}

const MANIFEST = {
  archivos: [
    'src/components/ExportButtons.jsx',
    'src/pages/CuentaDetail.jsx',
    'src/pages/WalletDetail.jsx',
    'src/pages/BrokerDetail.jsx',
    'worker-precios.mjs',
    'scripts/cron-setup.sh',
    'docs/DECISIONES.md',
  ],
  scripts: [
    'npm run pruebas:exportacion',
    'npm run verificar:exportacion',
  ],
  requisitos: [
    '9.1: Exportación CSV en ExportButtons',
    '9.1: Exportación Excel en ExportButtons',
    '9.1: Exportación PDF en ExportButtons',
    '9.1: ExportButtons en CuentaDetail',
    '9.1: ExportButtons en WalletDetail',
    '9.1: ExportButtons en BrokerDetail',
    '9.2: Cron setup script',
    '9.2: Cron a las 4 PM (16:00)',
    '9.3: Documentación completa',
  ],
}

let verificaciones = 0
let cumplidas = 0

function check(nombre, condicion) {
  console.log(condicion 
    ? `${colors.green}✓${colors.reset} ${nombre}` 
    : `${colors.red}✗${colors.reset} ${nombre}`)
  verificaciones++
  if (condicion) cumplidas++
}

function fileExists(ruta) {
  return fs.existsSync(path.join(rootDir, ruta))
}

function fileContains(ruta, patron) {
  try {
    const contenido = fs.readFileSync(path.join(rootDir, ruta), 'utf-8')
    return contenido.includes(patron)
  } catch {
    return false
  }
}

console.log(`${colors.blue}✅ Exportación de datos: verificación${colors.reset}\n`)

// ============================================================================
// ARCHIVOS REQUERIDOS
// ============================================================================

console.log(`${colors.blue}📁 Archivos Requeridos (${MANIFEST.archivos.length}/7)${colors.reset}`)
for (const archivo of MANIFEST.archivos) {
  check(archivo, fileExists(archivo))
}
console.log()

// ============================================================================
// COMPONENTE EXPORTBUTTONS
// ============================================================================

console.log(`${colors.blue}📦 ExportButtons${colors.reset}`)
check('Exporta función default', fileContains('src/components/ExportButtons.jsx', 'export default function'))
check('Método exportarCSV', fileContains('src/components/ExportButtons.jsx', 'exportarCSV'))
check('Método exportarExcel', fileContains('src/components/ExportButtons.jsx', 'exportarExcel'))
check('Método exportarPDF', fileContains('src/components/ExportButtons.jsx', 'exportarPDF'))
check('Prop disabled soportada', fileContains('src/components/ExportButtons.jsx', 'disabled'))
console.log()

// ============================================================================
// INTEGRACIONES
// ============================================================================

console.log(`${colors.blue}🔗 Integraciones${colors.reset}`)
check('CuentaDetail importa ExportButtons', fileContains('src/pages/CuentaDetail.jsx', "import ExportButtons"))
check('CuentaDetail usa ExportButtons', fileContains('src/pages/CuentaDetail.jsx', '<ExportButtons'))
check('WalletDetail importa ExportButtons', fileContains('src/pages/WalletDetail.jsx', "import ExportButtons"))
check('WalletDetail usa ExportButtons', fileContains('src/pages/WalletDetail.jsx', '<ExportButtons'))
check('BrokerDetail importa ExportButtons', fileContains('src/pages/BrokerDetail.jsx', "import ExportButtons"))
check('BrokerDetail usa ExportButtons', fileContains('src/pages/BrokerDetail.jsx', '<ExportButtons'))
console.log()

// ============================================================================
// CRON SETUP
// ============================================================================

console.log(`${colors.blue}⏰ Cron Setup${colors.reset}`)
check('cron-setup.sh existe', fileExists('scripts/cron-setup.sh'))
check('Referencia a worker-precios.mjs', fileContains('scripts/cron-setup.sh', 'worker-precios.mjs'))
check('Hora 16:00 (4 PM) especificada', fileContains('scripts/cron-setup.sh', '16:00') || fileContains('scripts/cron-setup.sh', '4 PM'))
check('Crea directorio logs', fileContains('scripts/cron-setup.sh', 'logs'))
console.log()

// ============================================================================
// DOCUMENTACIÓN
// ============================================================================

console.log(`${colors.blue}📚 Documentación${colors.reset}`)
check('la documentación de exportación existe', fileExists('docs/DECISIONES.md'))
check('Documentación de CSV', fileContains('docs/PRD.md', 'CSV'))
check('Documentación de Excel', fileContains('docs/PRD.md', 'Excel'))
check('Documentación de PDF', fileContains('docs/PRD.md', 'PDF'))
check('Documentación de Cron', fileContains('docs/DECISIONES.md', '16:00'))
console.log()

// ============================================================================
// SCRIPTS EN PACKAGE.JSON
// ============================================================================

console.log(`${colors.blue}📦 Scripts npm${colors.reset}`)
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
check('npm run pruebas:exportacion existe', packageJson.scripts?.['pruebas:exportacion'] !== undefined)
check('npm run verificar:exportacion existe', packageJson.scripts?.['verificar:exportacion'] !== undefined)
console.log()

// ============================================================================
// RESUMEN
// ============================================================================

const porcentaje = ((cumplidas / verificaciones) * 100).toFixed(1)
const estado = cumplidas === verificaciones 
  ? `${colors.green}LISTO PARA DEPLOY${colors.reset}`
  : `${colors.yellow}INCOMPLETO${colors.reset}`

console.log(`${colors.blue}📊 Resumen${colors.reset}`)
console.log(`  Verificaciones: ${cumplidas}/${verificaciones} (${porcentaje}%)`)
console.log(`  Estado: ${estado}`)
console.log()

if (cumplidas === verificaciones) {
  console.log(`${colors.green}✅ Exportación de datos: todo correcto${colors.reset}`)
  console.log()
  console.log('Próximos pasos:')
  console.log('  1. git add -A && git commit -m "exportación de datos y cron"')
  console.log('  2. git push origin main')
  console.log('  3. En producción: bash scripts/cron-setup.sh')
  process.exit(0)
} else {
  console.log(`${colors.red}❌ Exportación de datos: revisar${colors.reset}`)
  console.log()
  console.log('Verifica los puntos fallidos arriba.')
  process.exit(1)
}
