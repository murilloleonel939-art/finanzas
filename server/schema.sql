create extension if not exists pgcrypto;

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text,
  app_role text not null default 'usuario' check (app_role in ('super_admin', 'usuario')),
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists usuarios_email_lower_idx on usuarios (lower(email));

create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'activa' check (estado in ('activa', 'suspendida')),
  pais text,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists usuario_empresa (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('contador', 'cliente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (usuario_id, empresa_id)
);

create index if not exists usuario_empresa_usuario_idx on usuario_empresa (usuario_id) where deleted_at is null;
create index if not exists usuario_empresa_empresa_idx on usuario_empresa (empresa_id) where deleted_at is null;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists usuarios_updated_at on usuarios;
create trigger usuarios_updated_at before update on usuarios for each row execute function set_updated_at();
drop trigger if exists empresas_updated_at on empresas;
create trigger empresas_updated_at before update on empresas for each row execute function set_updated_at();
drop trigger if exists usuario_empresa_updated_at on usuario_empresa;
create trigger usuario_empresa_updated_at before update on usuario_empresa for each row execute function set_updated_at();
