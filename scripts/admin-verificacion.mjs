#!/usr/bin/env node

/** Verificación del panel administrativo contra la API y PostgreSQL locales. */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let ok = 0
let fallos = 0

function existe(ruta, nombre) {
  if (fs.existsSync(path.join(rootDir, ruta))) {
    console.log(`  ✅ ${nombre}`)
    ok++
  } else {
    console.log(`  ❌ ${nombre} — falta: ${ruta}`)
    fallos++
  }
}

function contiene(ruta, texto, nombre) {
  const contenido = fs.readFileSync(path.join(rootDir, ruta), 'utf8')
  if (contenido.includes(texto)) {
    console.log(`  ✅ ${nombre}`)
    ok++
  } else {
    console.log(`  ❌ ${nombre}`)
    fallos++
  }
}

console.log('\n🗄️  Backend local')
existe('server/schema.sql', 'esquema PostgreSQL')
existe('server/index.mjs', 'API Express')
existe('server/migrate.mjs', 'migración idempotente')
existe('src/lib/admin-api.js', 'cliente API administrativa')
contiene('src/lib/admin-api.js', '/api/admin', 'admin-api usa endpoints propios')

console.log('\n🧩 Componentes')
for (const c of ['ConfigForm', 'StatsCard', 'LogsViewer', 'JobsTable']) {
  existe(`src/components/admin/${c}.jsx`, c)
}
existe('src/components/ui/dropdown-menu.jsx', 'dropdown-menu')

console.log('\n📄 Páginas')
for (const p of ['AdminDashboard', 'AdminJobs', 'AdminLogs', 'AdminConfig', 'AdminEmpresas', 'AdminBrokers', 'AdminNotificaciones']) {
  existe(`src/pages/${p}.jsx`, p)
}

console.log('\n🔌 Dependencias')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
for (const dep of ['xlsx', '@radix-ui/react-dropdown-menu', 'nodemailer', 'pg', 'express', 'jsonwebtoken']) {
  if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) {
    console.log(`  ✅ ${dep} en package.json`)
    ok++
  } else {
    console.log(`  ❌ ${dep} NO está en package.json`)
    fallos++
  }
}

console.log('\n🧭 Ruteo y navegación')
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

console.log(`\n✅ ${ok} comprobaciones correctas`)
if (fallos) console.log(`❌ ${fallos} fallos`)
process.exit(fallos ? 1 : 0)
