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
await query(`create table if not exists cuentas_comisionistas_fiducias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comisionista_fiducia_id uuid not null references comisionistas_fiducias(id) on delete cascade,
  nombre_cuenta text not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
)`)
await query('alter table cuentas_comisionistas_fiducias add column if not exists pdf_password_encrypted text')
await query(`create table if not exists activos_accival (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id) on delete cascade,
  cuenta_id uuid not null references cuentas_comisionistas_fiducias(id) on delete cascade,
  periodo text not null check (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  resumen jsonb not null, fondos jsonb not null, import_job_id uuid,
  created_at timestamptz not null default now(), deleted_at timestamptz
)`)
await query('create unique index if not exists activos_accival_cuenta_periodo_idx on activos_accival (cuenta_id, periodo) where deleted_at is null')
// Ampliar las restricciones existentes sin cambiar el destino del importador Bancolombia.
await query('alter table import_jobs drop constraint if exists import_jobs_target_check')
await query("alter table import_jobs add constraint import_jobs_target_check check (target in ('cuenta', 'fiducia', 'accival', 'wallet', 'broker', 'binance_p2p'))")
await query('alter table import_jobs drop constraint if exists import_jobs_destino_coherente')
await query(`alter table import_jobs add constraint import_jobs_destino_coherente check (
  (target = 'cuenta' and cuenta_id is not null and fiducia_id is null and wallet_id is null and broker_id is null)
  or (target in ('fiducia', 'accival') and fiducia_id is not null and cuenta_id is null and wallet_id is null and broker_id is null)
  or (target in ('wallet', 'binance_p2p') and wallet_id is not null and cuenta_id is null and fiducia_id is null and broker_id is null)
  or (target = 'broker' and broker_id is not null and cuenta_id is null and fiducia_id is null and wallet_id is null)
)`)
await query('create unique index if not exists cuentas_comisionistas_fiducias_unique_active_idx on cuentas_comisionistas_fiducias (comisionista_fiducia_id, nombre_cuenta) where deleted_at is null')
await query('create index if not exists cuentas_comisionistas_fiducias_entidad_idx on cuentas_comisionistas_fiducias (comisionista_fiducia_id) where deleted_at is null')
await query(`create table if not exists activos_comisionistas_fiducias (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id) on delete cascade,
  cuenta_id uuid not null references cuentas_comisionistas_fiducias(id) on delete cascade, tipo_fiducia text not null,
  saldo_anterior numeric(20,2), rendimientos_netos numeric(20,2), nuevo_saldo numeric(20,2), rentabilidad_periodo numeric(12,6),
  periodo text, source_file text, import_job_id uuid, created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
)`)
await query('create unique index if not exists activos_comisionistas_fiducias_cuenta_periodo_idx on activos_comisionistas_fiducias (cuenta_id, periodo) where deleted_at is null')
await query('create index if not exists activos_comisionistas_fiducias_empresa_idx on activos_comisionistas_fiducias (empresa_id) where deleted_at is null')

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
// Los créditos de Coindepo se descartaron: un préstamo es un movimiento más, no
// una entidad aparte. Si una instalación anterior alcanzó a crear la tabla, se
// retira para que no quede una fuente de datos que ya nadie mantiene.
await query('drop table if exists wallet_creditos')
await query('update activos_broker set valor_compra_unitario = valor_unitario where valor_compra_unitario is null')
await query('create index if not exists mov_wallet_import_job_idx on movimientos_wallet (import_job_id) where import_job_id is not null and deleted_at is null')
await query(`create table if not exists binance_p2p_ordenes (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade, numero_pedido text not null,
  fecha date not null, hora_creacion timestamp not null, tipo_orden text not null, activo text not null,
  tipo_fiat text not null, precio_total numeric(20,8) not null, precio numeric(20,8), cantidad numeric(20,8) not null,
  tipo_cambio numeric(20,8), tarifa_creador numeric(20,8), comision_tomador numeric(20,8), contraparte text,
  estado text not null, trm numeric(20,8), valor_trm numeric(20,8), diferencia_cambio numeric(20,8),
  source_file text, import_job_id uuid, created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (wallet_id, numero_pedido)
)`)
await query('create index if not exists binance_p2p_wallet_fecha_idx on binance_p2p_ordenes (wallet_id, fecha desc)')
await query('create index if not exists binance_p2p_empresa_fecha_idx on binance_p2p_ordenes (empresa_id, fecha desc)')
await query("alter table import_jobs drop constraint if exists import_jobs_target_check")
await query('alter table import_jobs add column if not exists fiducia_id uuid references cuentas_comisionistas_fiducias(id) on delete cascade')
await query('alter table import_jobs drop constraint if exists import_jobs_target_check')
await query("alter table import_jobs add constraint import_jobs_target_check check (target in ('cuenta', 'fiducia', 'wallet', 'broker', 'binance_p2p'))")
await query('alter table import_jobs drop constraint if exists import_jobs_destino_coherente')
await query("alter table import_jobs add constraint import_jobs_destino_coherente check ((target = 'cuenta' and cuenta_id is not null and fiducia_id is null and wallet_id is null and broker_id is null) or (target = 'fiducia' and fiducia_id is not null and cuenta_id is null and wallet_id is null and broker_id is null) or (target in ('wallet', 'binance_p2p') and wallet_id is not null and cuenta_id is null and fiducia_id is null and broker_id is null) or (target = 'broker' and broker_id is not null and cuenta_id is null and fiducia_id is null and wallet_id is null))")
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
