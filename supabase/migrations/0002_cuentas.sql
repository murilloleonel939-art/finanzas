-- =====================================================================
-- FinanzAdmin Pro — FASE 2: Cuentas bancarias
-- Archivo: supabase/migrations/0002_cuentas.sql
-- =====================================================================
-- Crea: bancos, cuentas, movimientos.
--
-- Notas de diseño:
--  * D8 — SIN campos desnormalizados (empresa_nombre, banco_nombre,
--    cuenta_numero). Se resuelven con vistas en la FASE 5.
--  * empresa_id SÍ se conserva en las tres tablas, aunque sea derivable
--    por JOIN. Es la excepción a D8 y es deliberada: las policies de RLS
--    (FASE 6) lo necesitan para filtrar sin joins recursivos, y sin él
--    cada SELECT pagaría dos JOINs solo para evaluar permisos.
--  * banco_id NO se duplica en movimientos: es derivable vía cuenta_id.
--  * D9 — external_id + índice único para deduplicar importaciones.
--  * D3 — montos en numeric(20,8), nunca float.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: bancos
-- ---------------------------------------------------------------------
create table if not exists public.bancos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  pais         text not null,
  nombre_banco text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.bancos is
  'Banco de una empresa. nombre_banco sale del catálogo bancosPorPais.js, o texto libre '
  'si el usuario eligió la opción "Otro".';

create index if not exists bancos_empresa_idx
  on public.bancos (empresa_id) where deleted_at is null;

drop trigger if exists trg_bancos_updated_at on public.bancos;
create trigger trg_bancos_updated_at
  before update on public.bancos
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Tabla: cuentas
-- ---------------------------------------------------------------------
create table if not exists public.cuentas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  banco_id      uuid not null references public.bancos(id) on delete cascade,
  numero_cuenta text not null,
  tipo_cuenta   public.tipo_cuenta not null default 'ahorros',
  tipo_moneda   text not null default 'COP',
  monto         numeric(20,8) not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.cuentas is
  'Cuenta bancaria. Una sola moneda por cuenta (tipo_moneda). monto es el saldo actual. '
  'El número de cuenta NO es único globalmente: dos empresas pueden compartir uno.';

-- Unicidad de número de cuenta dentro del mismo banco, ignorando borradas.
create unique index if not exists cuentas_banco_numero_unico
  on public.cuentas (banco_id, numero_cuenta)
  where deleted_at is null;

create index if not exists cuentas_empresa_idx
  on public.cuentas (empresa_id) where deleted_at is null;
create index if not exists cuentas_banco_idx
  on public.cuentas (banco_id) where deleted_at is null;

drop trigger if exists trg_cuentas_updated_at on public.cuentas;
create trigger trg_cuentas_updated_at
  before update on public.cuentas
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. Tabla: movimientos
-- ---------------------------------------------------------------------
create table if not exists public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  fecha       date not null,
  descripcion text not null,
  tipo        public.tipo_movimiento not null,
  -- CHECK monto >= 0: la dirección la da `tipo`, no el signo (regla §15.1.3
  -- del PRD: "el monto siempre positivo").
  monto       numeric(20,8) not null check (monto >= 0),
  -- Posición dentro del día para desempatar movimientos de la misma fecha.
  -- Orden ascendente = orden de aparición.
  orden       integer not null default 0,
  -- D9 — ID de la transacción en el PDF de origen. Índice único parcial más
  -- abajo; si el PDF no lo trae, la importación deriva un hash.
  external_id text,
  -- Trazabilidad: de qué archivo salió este movimiento.
  source_file text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.movimientos is
  'Movimiento de cuenta bancaria. monto siempre positivo; tipo indica la dirección. '
  'external_id permite reimportar el mismo extracto sin duplicar (D9).';

-- D9 — el corazón de la deduplicación: mismo external_id en la misma cuenta
-- = misma transacción. Índice parcial: solo aplica cuando external_id existe.
create unique index if not exists movimientos_dedupe_idx
  on public.movimientos (cuenta_id, external_id)
  where external_id is not null and deleted_at is null;

-- Índice principal de consulta: movimientos de una cuenta ordenados por fecha.
-- Es el patrón que usa CuentaDetail (tabla paginada) y MonthFilter.
create index if not exists movimientos_cuenta_fecha_idx
  on public.movimientos (cuenta_id, fecha desc, orden desc)
  where deleted_at is null;
create index if not exists movimientos_empresa_fecha_idx
  on public.movimientos (empresa_id, fecha desc)
  where deleted_at is null;

drop trigger if exists trg_movimientos_updated_at on public.movimientos;
create trigger trg_movimientos_updated_at
  before update on public.movimientos
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------
--   select count(*) from public.bancos;
--   select count(*) from public.cuentas;
--   select count(*) from public.movimientos;
--
-- Probar el CHECK del monto (debe fallar):
--   insert into public.movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto)
--   values (gen_random_uuid(), gen_random_uuid(), now(), 'x', 'ingreso', -5);
