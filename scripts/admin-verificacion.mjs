#!/usr/bin/env node

/**
 * Verificación del panel super admin y notificaciones.
 *
 * Comprueba que los archivos existen Y que su contenido apunta al esquema
 * real del proyecto. Lo segundo importa más: una primera versión de este panel
 * pasaba un chequeo de existencia dando por buenas referencias a una tabla
 * `admin_roles` que no existe y a columnas que no están en el esquema.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let ok = 0
let fallos = 0

function existe(ruta, nombre) {
  if (fs.existsSync(path.join(rootDir, ruta))) {
    console.log(`  ✅ ${nombre}`)
    ok++
    return true
  }
  console.log(`  ❌ ${nombre} — falta: ${ruta}`)
  fallos++
  return false
}

/** Quita los comentarios SQL para no confundir prosa con código real. */
function sinComentarios(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

/** Falla si algún archivo contiene `aguja` (referencia a algo inexistente). */
function ausente(archivos, aguja, nombre) {
  const culpables = archivos.filter((a) => {
    const p = path.join(rootDir, a)
    if (!fs.existsSync(p)) return false
    // En .sql solo cuenta el código, no los comentarios que explican por qué
    // se descartó algo: mencionar `admin_roles` al justificar su ausencia es
    // correcto y no debe marcar el chequeo como fallo.
    const texto = a.endsWith('.sql')
      ? sinComentarios(fs.readFileSync(p, 'utf8'))
      : fs.readFileSync(p, 'utf8')
    return texto.includes(aguja)
  })
  if (culpables.length === 0) {
    console.log(`  ✅ ${nombre}`)
    ok++
  } else {
    console.log(`  ❌ ${nombre} — aparece en: ${culpables.join(', ')}`)
    fallos++
  }
}

console.log('\n🗄️  Migraciones ')
existe('supabase/migrations/0011_admin_logs.sql', '0011 admin_logs')
existe('supabase/migrations/0012_admin_config.sql', '0012 admin_config')
existe('supabase/migrations/0013_notificaciones.sql', '0013 notificaciones')
existe('supabase/migrations/0014_empresas_select_sin_autoconsulta.sql', '0014 empresas_select sin autoconsulta')
existe('supabase/migrations/0015_empresas_select_permite_borradas.sql', '0015 empresas_select permite borradas')
ausente(
  ['supabase/migrations/0014_empresas_select_sin_autoconsulta.sql',
   'supabase/migrations/0015_empresas_select_permite_borradas.sql'],
  'has_empresa_access(id)',
  'empresas_select no autoconsulta la fila (rompia el RETURNING del INSERT)'
)
ausente(
  ['supabase/migrations/0011_admin_logs.sql', 'supabase/migrations/0012_admin_config.sql',
   'supabase/migrations/0013_notificaciones.sql'],
  'admin_roles',
  'sin referencias a la tabla inexistente admin_roles'
)

console.log('\n⚡ Edge Functions ')
for (const [dir, nombre] of [
  ['admin-get-stats', 'admin-get-stats'],
  ['admin-list-jobs', 'admin-list-jobs'],
  ['admin-list-logs', 'admin-list-logs'],
  ['admin-update-config', 'admin-update-config'],
  ['enviar-email', 'enviar-email'],
]) {
  existe(`supabase/functions/${dir}/index.ts`, nombre)
}
ausente(
  ['supabase/functions/admin-get-stats/index.ts',
   'supabase/functions/admin-list-jobs/index.ts',
   'supabase/functions/admin-list-logs/index.ts',
   'supabase/functions/admin-update-config/index.ts'],
  'verificarSuperAdmin',
  'las Edge Functions usan el requireSuperAdmin compartido'
)
ausente(
  ['supabase/functions/admin-list-jobs/index.ts'],
  "'completado'",
  'admin-list-jobs usa el enum estado_job real (hecho, no completado)'
)

console.log('\n📚 Librerías del cliente')
existe('src/lib/admin-api.js', 'admin-api.js')
existe('src/lib/admin-utils.js', 'admin-utils.js')

console.log('\n🧩 Componentes')
for (const c of ['ConfigForm', 'StatsCard', 'LogsViewer', 'JobsTable']) {
  existe(`src/components/admin/${c}.jsx`, c)
}
existe('src/components/ui/dropdown-menu.jsx', 'dropdown-menu')

console.log('\n📄 Páginas')
for (const p of ['AdminDashboard', 'AdminJobs', 'AdminLogs', 'AdminConfig',
                 'AdminEmpresas', 'AdminBrokers', 'AdminNotificaciones']) {
  existe(`src/pages/${p}.jsx`, p)
}

console.log('\n🔌 Dependencias declaradas')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
for (const dep of ['xlsx', '@radix-ui/react-dropdown-menu', 'nodemailer']) {
  if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) {
    console.log(`  ✅ ${dep} en package.json`)
    ok++
  } else {
    console.log(`  ❌ ${dep} NO está en package.json`)
    fallos++
  }
}

console.log('\n🧭 Ruteo y navegación')
ausente(['src/lib/admin-api.js'], "from('admin_roles')",
        'admin-api.js lee el rol de profiles (fuente de verdad real)')

const app = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8')
for (const ruta of ['jobs', 'logs', 'config', 'notificaciones']) {
  if (app.includes(`path="${ruta}"`)) {
    console.log(`  ✅ ruta /admin/${ruta}`)
    ok++
  } else {
    console.log(`  ❌ falta la ruta /admin/${ruta}`)
    fallos++
  }
}

const layout = fs.readFileSync(path.join(rootDir, 'src/components/AdminLayout.jsx'), 'utf8')
for (const ruta of ['/admin/jobs', '/admin/logs', '/admin/config', '/admin/notificaciones']) {
  if (layout.includes(ruta)) {
    console.log(`  ✅ enlace a ${ruta}`)
    ok++
  } else {
    console.log(`  ❌ falta el enlace a ${ruta}`)
    fallos++
  }
}

console.log('\n' + '─'.repeat(56))
console.log(`\n✅ ${ok} comprobaciones correctas`)
if (fallos) console.log(`❌ ${fallos} fallos`)
console.log(`   Total: ${ok + fallos}\n`)
process.exit(fallos ? 1 : 0)
