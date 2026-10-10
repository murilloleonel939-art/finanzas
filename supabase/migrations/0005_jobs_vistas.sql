-- =====================================================================
-- FinanzAdmin Pro — Import jobs y vistas
-- Archivo: supabase/migrations/0005_jobs_vistas.sql
-- =====================================================================
-- Crea: import_jobs y las vistas que resuelven D8 (devolver los campos
-- desnormalizados que el frontend espera, sin almacenarlos).
--
-- Las vistas son el contrato con el frontend: los componentes siguen
-- leyendo `empresa_nombre`, `banco_nombre`, `cuenta_numero`, etc. como si
-- fueran columnas. El adaptador src/lib/db.js apunta aquí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: import_jobs  (D11)
-- ---------------------------------------------------------------------
-- Cola de trabajo del worker de IA. El frontend inserta un job y hace
-- polling; el worker en EC2 lo procesa sin el límite de tiempo de las
-- Edge Functions, y deja historial y errores visibles.
create table if not exists public.import_jobs (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  -- Destino de los movimientos. Puede ser una cuenta o una wallet.
  -- exactamente uno de los dos debe estar set (CHECK más abajo).
  cuenta_id      uuid references public.cuentas(id) on delete cascade,
  wallet_id      uuid references public.wallets(id) on delete cascade,
  broker_id      uuid references public.brokers(id) on delete cascade,
  -- Tipo de importación: distingue el parser y el destino.
  target         text not null check (target in ('cuenta', 'wallet', 'broker')),
  -- Ruta en el bucket privado `extractos`: {empresa_id}/{uuid}.pdf
  storage_path   text not null,
  proveedor      text,                    -- activa providerRules si existe
  estado         public.estado_job not null default 'pendiente',
  -- Resultado
  movimientos_creados integer not null default 0,
  activos_creados     integer not null default 0,
  duplicados_omitidos integer not null default 0,
  error_mensaje  text,
  -- Saldos reportados por el PDF, para conciliar (los devuelve importarMovimientos)
  saldo_anterior  numeric(20,8),
  saldo_actual_pdf numeric(20,8),
  saldo_calculado  numeric(20,8),
  -- Control del worker
  intentos       integer not null default 0,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint import_jobs_destino_coherente check (
    (target = 'cuenta' and cuenta_id is not null and wallet_id is null and broker_id is null)
    or (target = 'wallet' and wallet_id is not null and cuenta_id is null and broker_id is null)
    or (target = 'broker' and broker_id is not null and cuenta_id is null and wallet_id is null)
  )
);

comment on table public.import_jobs is
  'Cola de importación de PDFs. El worker en EC2 (D11) toma los pendientes, extrae con IA '
  'y escribe los movimientos. El frontend hace polling sobre `estado`.';

-- El worker busca por estado; el índice parcial evita escanear los ya hechos.
create index if not exists import_jobs_pendientes_idx
  on public.import_jobs (estado, created_at)
  where estado in ('pendiente', 'procesando');
create index if not exists import_jobs_empresa_idx
  on public.import_jobs (empresa_id, created_at desc);

drop trigger if exists trg_import_jobs_updated_at on public.import_jobs;
create trigger trg_import_jobs_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Vistas — resuelven D8
-- ---------------------------------------------------------------------
-- Todas usan `security_invoker = true` para que el RLS de las tablas base
-- siga aplicándose a través de la vista. Sin esto, la vista correría con
-- permisos del owner y se saltaría el aislamiento por empresa.

-- --- Cuentas -------------------------------------------------------
drop view if exists public.cuentas_view;
create view public.cuentas_view
with (security_invoker = true) as
select
  c.id,
  c.empresa_id,
  e.nombre  as empresa_nombre,
  c.banco_id,
  b.nombre_banco as banco_nombre,
  b.pais    as banco_pais,
  c.numero_cuenta,
  c.tipo_cuenta,
  c.tipo_moneda,
  c.monto,
  c.created_at,
  c.updated_at
from public.cuentas c
join public.empresas e on e.id = c.empresa_id
join public.bancos   b on b.id = c.banco_id
where c.deleted_at is null;


-- --- Movimientos de cuenta ----------------------------------------
drop view if exists public.movimientos_view;
create view public.movimientos_view
with (security_invoker = true) as
select
  m.id,
  m.empresa_id,
  e.nombre as empresa_nombre,
  m.cuenta_id,
  c.numero_cuenta,
  c.banco_id,
  b.nombre_banco as banco_nombre,
  c.tipo_moneda,
  m.fecha,
  m.descripcion,
  m.tipo,
  m.monto,
  m.orden,
  m.external_id,
  m.created_at
from public.movimientos m
join public.empresas e on e.id = m.empresa_id
join public.cuentas  c on c.id = m.cuenta_id
join public.bancos   b on b.id = c.banco_id
where m.deleted_at is null;


-- --- Movimientos de broker ----------------------------------------
drop view if exists public.movimientos_broker_view;
create view public.movimientos_broker_view
with (security_invoker = true) as
select
  m.id,
  m.empresa_id,
  e.nombre as empresa_nombre,
  m.broker_id,
  br.nombre_broker as broker_nombre,
  br.moneda as broker_moneda,
  m.fecha,
  m.descripcion,
  m.tipo,
  m.monto,
  m.cantidad,
  m.valor_unitario,
  m.external_id,
  m.created_at
from public.movimientos_broker m
join public.empresas e  on e.id = m.empresa_id
join public.brokers  br on br.id = m.broker_id
where m.deleted_at is null;


-- --- Activos de broker --------------------------------------------
-- Incluye valor_total calculado, que BrokerDetail muestra en la
-- pestaña "Activos" y que de otro modo habría que calcular en el frontend.
drop view if exists public.activos_broker_view;
create view public.activos_broker_view
with (security_invoker = true) as
select
  a.id,
  a.empresa_id,
  e.nombre as empresa_nombre,
  a.broker_id,
  br.nombre_broker as broker_nombre,
  a.nombre_activo,
  a.tipo_activo,
  a.cantidad,
  a.valor_unitario,
  a.moneda,
  (a.cantidad * a.valor_unitario) as valor_total,
  a.created_at,
  a.updated_at
from public.activos_broker a
join public.empresas e  on e.id = a.empresa_id
join public.brokers  br on br.id = a.broker_id
where a.deleted_at is null;


-- --- Precios de activo --------------------------------------------
drop view if exists public.precios_activo_view;
create view public.precios_activo_view
with (security_invoker = true) as
select
  p.id,
  p.empresa_id,
  e.nombre as empresa_nombre,
  p.broker_id,
  br.nombre_broker as broker_nombre,
  p.activo_id,
  a.nombre_activo,
  a.tipo_activo,
  p.fecha,
  p.precio_cierre,
  p.precio_anterior,
  p.variacion_pct,
  p.moneda,
  p.created_at
from public.precios_activo p
join public.empresas e       on e.id = p.empresa_id
join public.brokers  br      on br.id = p.broker_id
join public.activos_broker a on a.id = p.activo_id
where p.deleted_at is null;


-- --- Wallets -------------------------------------------------------
-- Incluye el saldo total y el número de monedas distintas, para que el
-- listado del sidebar no tenga que agregar wallet_saldos en el cliente.
drop view if exists public.wallets_view;
create view public.wallets_view
with (security_invoker = true) as
select
  w.id,
  w.empresa_id,
  e.nombre as empresa_nombre,
  w.proveedor_id,
  wp.nombre_proveedor as proveedor_nombre,
  w.tipo,
  w.nombre_wallet,
  w.direccion,
  w.tipo_moneda,
  coalesce(sum(s.monto), 0)          as saldo_total,
  count(s.moneda)                    as monedas_distintas,
  w.created_at,
  w.updated_at
from public.wallets w
join public.empresas e on e.id = w.empresa_id
join public.wallet_providers wp on wp.id = w.proveedor_id
left join public.wallet_saldos s on s.wallet_id = w.id
where w.deleted_at is null
group by w.id, e.nombre, wp.nombre_proveedor;


-- --- Movimientos de wallet ----------------------------------------
drop view if exists public.movimientos_wallet_view;
create view public.movimientos_wallet_view
with (security_invoker = true) as
select
  m.id,
  m.empresa_id,
  e.nombre as empresa_nombre,
  m.proveedor_id,
  wp.nombre_proveedor as proveedor_nombre,
  m.wallet_id,
  w.nombre_wallet,
  w.direccion as wallet_direccion,
  m.fecha,
  m.descripcion,
  m.tipo,
  m.monto,
  m.tipo_moneda,
  m.external_id,
  m.created_at
from public.movimientos_wallet m
join public.empresas e         on e.id = m.empresa_id
join public.wallet_providers wp on wp.id = m.proveedor_id
join public.wallets w          on w.id = m.wallet_id
where m.deleted_at is null;


-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
--   select table_name from information_schema.views
--   where table_schema = 'public' order by 1;
--   -- esperado: activos_broker_view, cuentas_view, movimientos_broker_view,
--   --           movimientos_view, movimientos_wallet_view,
--   --           precios_activo_view, wallets_view
