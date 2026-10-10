-- =====================================================================
-- FinanzAdmin Pro — Wallets
-- Archivo: supabase/migrations/0004_wallets.sql
-- =====================================================================
-- Crea: wallet_providers, wallets, wallet_saldos, movimientos_wallet.
--
-- Notas de diseño:
--  * D12 — `monto` escalar de wallets ELIMINADO. Una wallet puede tener
--    saldo simultáneo en varias monedas (BTC + ETH + USDT), y WalletEarnAssets
--    agrupa posiciones por moneda. Se resuelve con `wallet_saldos`
--    (una fila por moneda).
--  * D8 — sin proveedor_nombre/wallet_direccion; se resuelven con vistas.
--  * El filtro de proveedores "todo es Earn" (Coindepo) NO se modela en la
--    base: vive en src/lib/earnConfig.js porque es una regla de
--    presentación que cambia sin migración.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: wallet_providers
-- ---------------------------------------------------------------------
create table if not exists public.wallet_providers (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  tipo             public.tipo_proveedor not null,
  nombre_proveedor text not null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.wallet_providers is
  'Proveedor de wallet (Binance, MetaMask, Coindepo...). nombre_proveedor sale del '
  'catálogo walletProviders.js o es texto libre si el usuario eligió "Otro".';

create index if not exists wallet_providers_empresa_idx
  on public.wallet_providers (empresa_id) where deleted_at is null;

drop trigger if exists trg_wallet_providers_updated_at on public.wallet_providers;
create trigger trg_wallet_providers_updated_at
  before update on public.wallet_providers
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Tabla: wallets
-- ---------------------------------------------------------------------
create table if not exists public.wallets (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  proveedor_id   uuid not null references public.wallet_providers(id) on delete cascade,
  -- Denormalizado a propósito: `tipo` viene del proveedor, pero se congela
  -- aquí para que un cambio futuro en el proveedor no reinterprete wallets
  -- históricas. Es el único denormalizado que se conserva (excepción a D8).
  tipo           public.tipo_proveedor not null,
  nombre_wallet  text not null,
  direccion      text,
  tipo_moneda    text not null default 'USD',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.wallets is
  'Wallet de un proveedor. Sin campo monto: el saldo vive en wallet_saldos, '
  'una fila por moneda (D12). direccion es la address cripto o el email/número en fiat.';

create index if not exists wallets_empresa_idx
  on public.wallets (empresa_id) where deleted_at is null;
create index if not exists wallets_proveedor_idx
  on public.wallets (proveedor_id) where deleted_at is null;

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. Tabla: wallet_saldos  (D12)
-- ---------------------------------------------------------------------
create table if not exists public.wallet_saldos (
  wallet_id  uuid not null references public.wallets(id) on delete cascade,
  moneda     text not null,
  monto      numeric(20,8) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (wallet_id, moneda)
);

comment on table public.wallet_saldos is
  'Saldo por moneda de una wallet. PK compuesta (wallet_id, moneda), sin id propio: '
  'es una tabla de valores, no una entidad. Resuelve que una wallet tenga BTC+ETH+USDT.';

-- Nota: NO lleva empresa_id. El RLS lo resuelve con un EXISTS contra wallets
-- (ver 0006), que es aceptable aquí porque la tabla es pequeña y la PK ya
-- la mantiene acotada.

drop trigger if exists trg_wallet_saldos_updated_at on public.wallet_saldos;
create trigger trg_wallet_saldos_updated_at
  before update on public.wallet_saldos
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Tabla: movimientos_wallet
-- ---------------------------------------------------------------------
create table if not exists public.movimientos_wallet (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  proveedor_id uuid not null references public.wallet_providers(id) on delete cascade,
  wallet_id    uuid not null references public.wallets(id) on delete cascade,
  fecha        date not null,
  descripcion  text not null,
  tipo         public.tipo_movimiento not null,
  monto        numeric(20,8) not null check (monto >= 0),
  -- Moneda POR FILA (regla §15.1.2): un mismo extracto puede traer filas en
  -- monedas distintas, así que no se hereda de la wallet.
  tipo_moneda  text not null default 'USD',
  -- D9 — deduplicación de importaciones.
  external_id  text,
  source_file  text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.movimientos_wallet is
  'Movimiento de wallet. tipo_moneda es por fila, no heredada de la wallet. '
  'La clasificación Earn se hace por descripción en el frontend.';

create unique index if not exists movimientos_wallet_dedupe_idx
  on public.movimientos_wallet (wallet_id, external_id)
  where external_id is not null and deleted_at is null;

create index if not exists mov_wallet_wallet_fecha_idx
  on public.movimientos_wallet (wallet_id, fecha desc)
  where deleted_at is null;
create index if not exists mov_wallet_empresa_fecha_idx
  on public.movimientos_wallet (empresa_id, fecha desc)
  where deleted_at is null;
create index if not exists mov_wallet_proveedor_idx
  on public.movimientos_wallet (proveedor_id) where deleted_at is null;

drop trigger if exists trg_mov_wallet_updated_at on public.movimientos_wallet;
create trigger trg_mov_wallet_updated_at
  before update on public.movimientos_wallet
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
--   select count(*) from public.wallet_providers;
--   select count(*) from public.wallets;
--   select count(*) from public.wallet_saldos;
--   select count(*) from public.movimientos_wallet;
