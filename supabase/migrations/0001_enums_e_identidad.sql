-- =====================================================================
-- FinanzAdmin Pro — FASE 1: Enums + Identidad
-- Archivo: supabase/migrations/0001_enums_e_identidad.sql
-- =====================================================================
-- Crea: extensiones, todos los enums del sistema, y las 3 tablas de
-- identidad (profiles, empresas, user_empresa).
--
-- NOTA: este archivo es IDEMPOTENTE — se puede ejecutar varias veces sin
-- error. Los enums se crean con guardas porque `CREATE TYPE` no soporta
-- `IF NOT EXISTS`.
--
-- Decisión D6: app_role se reduce a ('super_admin','usuario').
--   El rol dentro de cada empresa vive en user_empresa.rol.
-- Decisión D7: borrado lógico con deleted_at.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensiones
-- ---------------------------------------------------------------------
-- gen_random_uuid() es nativo desde PG13, pero pgcrypto se declara por
-- claridad y porque otras migraciones pueden usarlo (digest para hashes
-- de deduplicación en la FASE 2).
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------
-- 1. Enums del sistema
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('super_admin', 'usuario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_usuario as enum ('activo', 'inactivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_empresa as enum ('activa', 'suspendida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rol_empresa as enum ('contador', 'cliente');
exception when duplicate_object then null; end $$;

-- Enums de los módulos financieros. Se declaran aquí, en la fase 1,
-- para que las migraciones 0002-0004 los referencien sin ALTER TYPE.
do $$ begin
  create type public.tipo_cuenta as enum ('ahorros', 'corriente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_movimiento as enum ('ingreso', 'egreso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_activo as enum
    ('accion', 'bono', 'fondo', 'etf', 'cripto', 'cdat', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_proveedor as enum ('cripto', 'fiat', 'ambos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_job as enum
    ('pendiente', 'procesando', 'hecho', 'error');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. Utilidad: trigger de updated_at
-- ---------------------------------------------------------------------
-- Se define aquí (en vez de la FASE 7) para que cada migración de tabla
-- pueda engancharlo de inmediato.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Tabla: profiles
-- ---------------------------------------------------------------------
-- Extiende auth.users (1:1). El registro lo crea el trigger de la FASE 7
-- a partir de raw_user_meta_data de la invitación.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  app_role    public.app_role     not null default 'usuario',
  estado      public.estado_usuario not null default 'activo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de usuario, 1:1 con auth.users. app_role solo distingue super_admin del resto; '
  'el rol por empresa vive en user_empresa.rol (decisión D6).';

-- Email único e insensible a mayúsculas.
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Tabla: empresas
-- ---------------------------------------------------------------------
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  estado      public.estado_empresa not null default 'activa',
  pais        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.empresas is
  'Tenant. Escritura solo para super_admin. Sin moneda_base: los resúmenes se muestran '
  'en subtotales por moneda, sin total consolidado (decisión D4).';

create index if not exists empresas_estado_idx
  on public.empresas (estado) where deleted_at is null;

drop trigger if exists trg_empresas_updated_at on public.empresas;
create trigger trg_empresas_updated_at
  before update on public.empresas
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 5. Tabla: user_empresa
-- ---------------------------------------------------------------------
-- Vínculo usuario↔empresa. FUENTE DE VERDAD de los permisos por empresa:
-- contador y cliente tienen los MISMOS permisos (decisiones D5, D6).
create table if not exists public.user_empresa (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  rol         public.rol_empresa not null default 'cliente',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint user_empresa_unico unique (user_id, empresa_id)
);

comment on table public.user_empresa is
  'Permisos por empresa. contador y cliente escriben igual (D5/D6). '
  'Base del RLS: has_empresa_access() y can_write_empresa().';

create index if not exists user_empresa_user_idx
  on public.user_empresa (user_id) where deleted_at is null;
create index if not exists user_empresa_empresa_idx
  on public.user_empresa (empresa_id) where deleted_at is null;

drop trigger if exists trg_user_empresa_updated_at on public.user_empresa;
create trigger trg_user_empresa_updated_at
  before update on public.user_empresa
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 6. Verificación rápida
-- ---------------------------------------------------------------------
-- Ejecutar aparte para confirmar que la fase quedó bien:
--
--   select tablename from pg_tables where schemaname = 'public' order by 1;
--   -- esperado: empresas, profiles, user_empresa
--
--   select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
--   where n.nspname = 'public' and t.typtype = 'e' order by 1;
--   -- esperado: los 9 enums
