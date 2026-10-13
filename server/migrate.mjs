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

// Trazabilidad de importaciones de broker: permite borrar lo que creó el último
// job. Las filas anteriores al cambio quedan con import_job_id null y no se
// tocan al revertir una importación.
await query('alter table movimientos_broker add column if not exists import_job_id uuid')
await query('alter table activos_broker add column if not exists import_job_id uuid')
await query('alter table activos_broker add column if not exists valor_compra_unitario numeric(20,8)')
await query('alter table movimientos_wallet add column if not exists import_job_id uuid')
await query('alter table movimientos_wallet add column if not exists trm numeric(20,8)')
await query('alter table movimientos_wallet add column if not exists monto_equivalente numeric(20,8)')
await query('alter table movimientos_wallet add column if not exists valor_trm numeric(20,8)')
await query('alter table movimientos_wallet add column if not exists diferencia_cambio numeric(20,8)')
await query('alter table movimientos_wallet add column if not exists orden bigint')
// Los créditos de Coindepo se descartaron: un préstamo es un movimiento más, no
// una entidad aparte. Si una instalación anterior alcanzó a crear la tabla, se
// retira para que no quede una fuente de datos que ya nadie mantiene.
await query('drop table if exists wallet_creditos')
await query('update activos_broker set valor_compra_unitario = valor_unitario where valor_compra_unitario is null')
await query('create index if not exists mov_wallet_import_job_idx on movimientos_wallet (import_job_id) where import_job_id is not null and deleted_at is null')
await query('create index if not exists mov_broker_import_job_idx on movimientos_broker (import_job_id) where import_job_id is not null and deleted_at is null')
await query('create index if not exists activos_broker_import_job_idx on activos_broker (import_job_id) where import_job_id is not null and deleted_at is null')

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
