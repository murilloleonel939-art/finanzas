import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { pool, query } from './db.mjs'

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
await pool.query(schema)

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const fullName = process.env.ADMIN_NAME?.trim() || 'Administrador principal'

if (!email || !password) {
  console.log('Esquema aplicado. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el superusuario inicial.')
  await pool.end()
  process.exit(0)
}

if (password.length < 12) {
  throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.')
}

const existing = await query('select id from usuarios where lower(email) = lower($1)', [email])
if (existing.rowCount === 0) {
  const passwordHash = await bcrypt.hash(password, 12)
  await query(
    `insert into usuarios (email, password_hash, full_name, app_role)
     values ($1, $2, $3, 'super_admin')`,
    [email, passwordHash, fullName]
  )
  console.log(`Superusuario inicial creado: ${email}`)
} else {
  console.log('El superusuario inicial ya existe; no se modificó.')
}

await pool.end()
