#!/usr/bin/env node

/**
 * FASE 20: Script de verificación
 * Valida que todas las migraciones, Edge Functions y componentes estén en su lugar
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

console.log('🔍 FASE 20: Verificación de integridad\n')

let testsPasados = 0
let testsFallidos = 0

// Utilidades
function verificarArchivo(ruta, nombre) {
  const rutaCompleta = path.join(rootDir, ruta)
  if (fs.existsSync(rutaCompleta)) {
    console.log(`✅ ${nombre}`)
    testsPasados++
    return true
  } else {
    console.log(`❌ ${nombre} — NO ENCONTRADO: ${ruta}`)
    testsFallidos++
    return false
  }
}

function verificarDirectorio(ruta, nombre) {
  const rutaCompleta = path.join(rootDir, ruta)
  if (fs.existsSync(rutaCompleta) && fs.statSync(rutaCompleta).isDirectory()) {
    console.log(`✅ ${nombre}`)
    testsPasados++
    return true
  } else {
    console.log(`❌ ${nombre} — NO ENCONTRADO: ${ruta}`)
    testsFallidos++
    return false
  }
}

// Suite 1: Migraciones SQL
console.log('📊 Suite 1: Migraciones SQL (3 tests)\n')
verificarArchivo('supabase/migrations/0011_admin_roles.sql', 'Migración 0011: admin_roles')
verificarArchivo('supabase/migrations/0012_admin_logs.sql', 'Migración 0012: admin_logs')
verificarArchivo('supabase/migrations/0013_admin_config.sql', 'Migración 0013: admin_config')

// Suite 2: Edge Functions
console.log('\n⚡ Suite 2: Edge Functions (4 tests)\n')
verificarArchivo('supabase/functions/admin-get-stats/index.ts', 'Edge Function: admin-get-stats')
verificarArchivo('supabase/functions/admin-list-jobs/index.ts', 'Edge Function: admin-list-jobs')
verificarArchivo('supabase/functions/admin-list-logs/index.ts', 'Edge Function: admin-list-logs')
verificarArchivo('supabase/functions/admin-update-config/index.ts', 'Edge Function: admin-update-config')

// Suite 3: Librerías JavaScript
console.log('\n📚 Suite 3: Librerías JavaScript (2 tests)\n')
verificarArchivo('src/lib/admin-api.js', 'Librería: admin-api.js')
verificarArchivo('src/lib/admin-utils.js', 'Librería: admin-utils.js')

// Suite 4: Componentes compartidos
console.log('\n🎨 Suite 4: Componentes compartidos (4 tests)\n')
verificarArchivo('src/components/admin/ConfigForm.jsx', 'Componente: ConfigForm')
verificarArchivo('src/components/admin/StatsCard.jsx', 'Componente: StatsCard')
verificarArchivo('src/components/admin/LogsViewer.jsx', 'Componente: LogsViewer')
verificarArchivo('src/components/admin/JobsTable.jsx', 'Componente: JobsTable')

// Suite 5: Páginas admin
console.log('\n📄 Suite 5: Páginas admin (5 tests)\n')
verificarArchivo('src/pages/AdminDashboard.jsx', 'Página: AdminDashboard (actualizado)')
verificarArchivo('src/pages/AdminJobs.jsx', 'Página: AdminJobs')
verificarArchivo('src/pages/AdminLogs.jsx', 'Página: AdminLogs')
verificarArchivo('src/pages/AdminConfig.jsx', 'Página: AdminConfig')
verificarArchivo('src/pages/AdminEmpresas.jsx', 'Página: AdminEmpresas (placeholder)')
verificarArchivo('src/pages/AdminBrokers.jsx', 'Página: AdminBrokers (placeholder)')

// Suite 6: Configuración de ruteo
console.log('\n🗺️ Suite 6: Configuración (2 tests)\n')
verificarArchivo('src/App.jsx', 'App.jsx (rutas actualizadas)')
verificarArchivo('src/components/AdminLayout.jsx', 'AdminLayout.jsx (navegación actualizada)')

// Resumen
console.log('\n' + '='.repeat(50))
console.log(`\n📈 RESULTADOS:\n`)
console.log(`✅ Tests pasados: ${testsPasados}`)
console.log(`❌ Tests fallidos: ${testsFallidos}`)
console.log(`📊 Total: ${testsPasados + testsFallidos}`)

if (testsFallidos > 0) {
  console.log('\n⚠️ Algunos archivos no se encontraron. Revisa los errores arriba.')
  process.exit(1)
} else {
  console.log('\n✅ ¡FASE 20 verificación completada correctamente!')
  console.log('\n🚀 Próximos pasos:')
  console.log('1. Revisar migraciones SQL en supabase/migrations/')
  console.log('2. Testear Edge Functions en local o staging')
  console.log('3. Verificar componentes en navegador')
  console.log('4. Probar flujos administrativos completos')
  process.exit(0)
}
