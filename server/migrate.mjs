import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { pool, query } from './db.mjs'

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
await pool.query(schema)
// Compatibilidad con instalaciones existentes: schema.sql usa IF NOT EXISTS
await query('alter table cuentas add column if not exists pdf_password_encrypted text')
await query('alter table cuentas add column if not exists saldo_inicial numeric(18, 2)')
await query('alter table cuentas add column if not exists saldo_final numeric(18, 2)')
await query(`create table if not exists comisionistas_fiducias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  pais text not null,
  nombre text not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
)`)
await query('alter table comisionistas_fiducias drop constraint if exists comisionistas_fiducias_empresa_id_pais_nombre_key')
await query('create unique index if not exists comisionistas_fiducias_unique_active_idx on comisionistas_fiducias (empresa_id, pais, nombre) where deleted_at is null')
await query('create index if not exists comisionistas_fiducias_empresa_idx on comisionistas_fiducias (empresa_id) where deleted_at is null')

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
