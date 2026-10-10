-- =====================================================================
-- FinanzAdmin Pro — Brokers
-- Archivo: supabase/migrations/0003_brokers.sql
-- =====================================================================
-- Crea: brokers, movimientos_broker, activos_broker, precios_activo.
--
-- Notas de diseño:
--  * D8 — sin broker_nombre/empresa_nombre; se resuelven con vistas (0005).
--    empresa_id sí se conserva por RLS. broker_id también se conserva en
--    activos y precios porque el JOIN es menos directo que en cuentas.
--  * D3 — precios y cantidades en numeric.
--  * brokers.moneda  = divisa de la CAJA (depósitos/retiros).
--    activos_broker.moneda = divisa del ACTIVO. Pueden discrepar: el PRD no
--    lo resuelve y se adopta que cada uno manda en su ámbito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: brokers
-- ---------------------------------------------------------------------
create table if not exists public.brokers (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  nombre_broker text not null,
  moneda        text not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.brokers is
  'Broker de una empresa. moneda = divisa base de la caja (depósitos y retiros).';

create index if not exists brokers_empresa_idx
  on public.brokers (empresa_id) where deleted_at is null;

drop trigger if exists trg_brokers_updated_at on public.brokers;
create trigger trg_brokers_updated_at
  before update on public.brokers
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Tabla: movimientos_broker
-- ---------------------------------------------------------------------
-- Dos naturalezas conviven en esta tabla:
--   a) Caja: depósito (ingreso) / retiro (egreso). cantidad y valor_unitario NULL.
--   b) Operación: venta (ingreso) / compra (egreso). cantidad y valor_unitario set.
-- El CHECK de abajo obliga a que sean coherentes: o los dos NULL, o los dos set.
create table if not exists public.movimientos_broker (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  broker_id       uuid not null references public.brokers(id) on delete cascade,
  fecha           date not null,
  descripcion     text not null,
  tipo            public.tipo_movimiento not null,
  monto           numeric(20,8) not null check (monto >= 0),
  cantidad        numeric(28,10) check (cantidad is null or cantidad >= 0),
  valor_unitario  numeric(20,8)  check (valor_unitario is null or valor_unitario >= 0),
  external_id     text,
  source_file     text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- O es caja (ambos NULL) o es operación (ambos set).
  constraint mov_broker_cantidad_valor_coherentes check (
    (cantidad is null and valor_unitario is null)
    or (cantidad is not null and valor_unitario is not null)
  )
);

comment on table public.movimientos_broker is
  'ingreso = depósito o venta; egreso = retiro o compra. monto es el absoluto en divisa '
  'base del broker. cantidad/valor_unitario solo en compras y ventas.';

create unique index if not exists movimientos_broker_dedupe_idx
  on public.movimientos_broker (broker_id, external_id)
  where external_id is not null and deleted_at is null;

create index if not exists mov_broker_broker_fecha_idx
  on public.movimientos_broker (broker_id, fecha desc)
  where deleted_at is null;
create index if not exists mov_broker_empresa_fecha_idx
  on public.movimientos_broker (empresa_id, fecha desc)
  where deleted_at is null;

drop trigger if exists trg_mov_broker_updated_at on public.movimientos_broker;
create trigger trg_mov_broker_updated_at
  before update on public.movimientos_broker
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. Tabla: activos_broker
-- ---------------------------------------------------------------------
create table if not exists public.activos_broker (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  broker_id      uuid not null references public.brokers(id) on delete cascade,
  nombre_activo  text not null,
  tipo_activo    public.tipo_activo not null default 'accion',
  cantidad       numeric(28,10) not null default 0,
  valor_unitario numeric(20,8)  not null default 0,
  moneda         text not null default 'USD',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.activos_broker is
  'Posición abierta. valor_unitario lo actualiza el worker de precios. '
  'moneda es la del activo y puede diferir de brokers.moneda (la de la caja).';

-- El mismo ticker no se repite dentro de un broker (case-insensitive:
-- "VOO" y "voo" son el mismo activo).
create unique index if not exists activos_broker_ticker_unico
  on public.activos_broker (broker_id, lower(nombre_activo))
  where deleted_at is null;

create index if not exists activos_broker_empresa_idx
  on public.activos_broker (empresa_id) where deleted_at is null;
create index if not exists activos_broker_broker_idx
  on public.activos_broker (broker_id) where deleted_at is null;

drop trigger if exists trg_activos_broker_updated_at on public.activos_broker;
create trigger trg_activos_broker_updated_at
  before update on public.activos_broker
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Tabla: precios_activo
-- ---------------------------------------------------------------------
-- Historial de precios. Escritura solo super_admin (0006), lectura abierta
-- a quien tenga acceso a la empresa — resuelve la contradicción del PRD
-- original entre §6.4 (admin-only) y §6.5 (pestaña visible a todos).
create table if not exists public.precios_activo (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  broker_id       uuid not null references public.brokers(id) on delete cascade,
  activo_id       uuid not null references public.activos_broker(id) on delete cascade,
  fecha           date not null,
  precio_cierre   numeric(20,8) not null check (precio_cierre >= 0),
  precio_anterior numeric(20,8) check (precio_anterior is null or precio_anterior >= 0),
  variacion_pct   numeric(12,6),
  moneda          text not null default 'USD',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.precios_activo is
  'Historial de precios de cierre por activo y fecha. Alimenta la pestaña "Precios" '
  'de BrokerDetail y el cálculo de variacion_pct.';

-- Un solo precio por activo y fecha. Evita duplicar el registro si la
-- actualización de precios corre dos veces el mismo día.
create unique index if not exists precios_activo_unico
  on public.precios_activo (activo_id, fecha)
  where deleted_at is null;

create index if not exists precios_activo_activo_fecha_idx
  on public.precios_activo (activo_id, fecha desc)
  where deleted_at is null;
create index if not exists precios_activo_empresa_idx
  on public.precios_activo (empresa_id) where deleted_at is null;

drop trigger if exists trg_precios_activo_updated_at on public.precios_activo;
create trigger trg_precios_activo_updated_at
  before update on public.precios_activo
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
--   select count(*) from public.brokers;
--   select count(*) from public.movimientos_broker;
--   select count(*) from public.activos_broker;
--   select count(*) from public.precios_activo;
--
-- Probar el CHECK de coherencia (debe fallar por cantidad sin valor_unitario):
--   insert into public.movimientos_broker
--     (empresa_id, broker_id, fecha, descripcion, tipo, monto, cantidad)
--   values (gen_random_uuid(), gen_random_uuid(), now(), 'x', 'egreso', 10, 5);
