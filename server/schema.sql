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

create table if not exists bancos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  pais text not null,
  nombre_banco text not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, nombre_banco)
);

create index if not exists bancos_empresa_idx on bancos (empresa_id) where deleted_at is null;

create table if not exists cuentas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  banco_id uuid not null references bancos(id) on delete restrict,
  numero_cuenta text not null,
  tipo_cuenta text not null check (tipo_cuenta in ('ahorros', 'corriente')),
  tipo_moneda text not null,
  monto numeric(18, 2) not null default 0,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (banco_id, numero_cuenta)
);

create index if not exists cuentas_empresa_idx on cuentas (empresa_id) where deleted_at is null;

create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  fecha date not null,
  descripcion text not null,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(18, 2) not null check (monto >= 0),
  orden integer not null default 0,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists movimientos_cuenta_idx on movimientos (cuenta_id, fecha desc) where deleted_at is null;

create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre_broker text not null,
  moneda text not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists brokers_empresa_idx on brokers (empresa_id) where deleted_at is null;

create table if not exists movimientos_broker (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  broker_id uuid not null references brokers(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(20,8) not null check (monto >= 0),
  cantidad numeric(28,10) check (cantidad is null or cantidad >= 0),
  valor_unitario numeric(20,8) check (valor_unitario is null or valor_unitario >= 0),
  external_id text,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint mov_broker_cantidad_valor_coherentes check (
    (cantidad is null and valor_unitario is null)
    or (cantidad is not null and valor_unitario is not null)
  )
);
create unique index if not exists movimientos_broker_dedupe_idx on movimientos_broker (broker_id, external_id) where external_id is not null and deleted_at is null;
create index if not exists mov_broker_broker_fecha_idx on movimientos_broker (broker_id, fecha desc) where deleted_at is null;

create table if not exists activos_broker (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  broker_id uuid not null references brokers(id) on delete cascade,
  nombre_activo text not null,
  tipo_activo text not null default 'accion' check (tipo_activo in ('accion','etf','bono','fondo','criptomoneda','opcion','otro')),
  cantidad numeric(28,10) not null default 0 check (cantidad >= 0),
  valor_unitario numeric(20,8) not null default 0 check (valor_unitario >= 0),
  moneda text not null default 'USD',
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists activos_broker_ticker_unico on activos_broker (broker_id, lower(nombre_activo)) where deleted_at is null;
create index if not exists activos_broker_broker_idx on activos_broker (broker_id) where deleted_at is null;

create table if not exists precios_activo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  broker_id uuid not null references brokers(id) on delete cascade,
  activo_id uuid not null references activos_broker(id) on delete cascade,
  fecha date not null,
  precio_cierre numeric(20,8) not null check (precio_cierre >= 0),
  precio_anterior numeric(20,8) check (precio_anterior is null or precio_anterior >= 0),
  variacion_pct numeric(12,6),
  moneda text not null default 'USD',
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists precios_activo_unico on precios_activo (activo_id, fecha) where deleted_at is null;
create index if not exists precios_activo_broker_fecha_idx on precios_activo (broker_id, fecha desc) where deleted_at is null;

create table if not exists wallet_providers (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('cripto', 'fiat', 'ambos')),
  nombre_proveedor text not null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists wallet_providers_empresa_idx on wallet_providers (empresa_id) where deleted_at is null;

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references wallet_providers(id) on delete cascade,
  tipo text not null check (tipo in ('cripto', 'fiat', 'ambos')),
  nombre_wallet text not null,
  direccion text,
  tipo_moneda text not null default 'USD',
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists wallets_empresa_idx on wallets (empresa_id) where deleted_at is null;
create index if not exists wallets_proveedor_idx on wallets (proveedor_id) where deleted_at is null;

create table if not exists wallet_saldos (
  wallet_id uuid not null references wallets(id) on delete cascade,
  moneda text not null,
  monto numeric(20,8) not null default 0 check (monto >= 0),
  updated_at timestamptz not null default now(),
  primary key (wallet_id, moneda)
);

create table if not exists movimientos_wallet (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references wallet_providers(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(20,8) not null check (monto > 0),
  tipo_moneda text not null default 'USD',
  external_id text,
  source_file text,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists movimientos_wallet_dedupe_idx on movimientos_wallet (wallet_id, external_id) where external_id is not null and deleted_at is null;
create index if not exists mov_wallet_wallet_fecha_idx on movimientos_wallet (wallet_id, fecha desc) where deleted_at is null;
create index if not exists mov_wallet_empresa_fecha_idx on movimientos_wallet (empresa_id, fecha desc) where deleted_at is null;
create index if not exists mov_wallet_proveedor_idx on movimientos_wallet (proveedor_id) where deleted_at is null;

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

create table if not exists admin_logs (
  id bigserial primary key,
  admin_id uuid references usuarios(id) on delete set null,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalles jsonb,
  ip_address inet,
  user_agent text,
  estado text not null default 'success',
  mensaje_error text,
  duracion_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists admin_logs_created_idx on admin_logs (created_at desc);
create index if not exists admin_logs_filter_idx on admin_logs (accion, entidad, estado, created_at desc);

create table if not exists admin_config (
  id bigserial primary key,
  clave text not null unique,
  valor text not null,
  tipo text not null default 'string',
  descripcion text,
  grupo text,
  editable boolean not null default true,
  actualizado_por uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists notif_plantillas (
  id bigserial primary key,
  clave text not null unique,
  asunto text not null,
  cuerpo text not null,
  descripcion text,
  updated_at timestamptz not null default now()
);

create table if not exists notificaciones (
  id bigserial primary key,
  tipo text not null default 'personalizado',
  destinatario text not null,
  asunto text not null,
  cuerpo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  error_mensaje text,
  intentos integer not null default 0,
  enviado_en timestamptz,
  creado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists notificaciones_estado_idx on notificaciones (estado);
create index if not exists notificaciones_created_idx on notificaciones (created_at desc);

insert into admin_config (clave, valor, tipo, descripcion, grupo, editable) values
  ('SISTEMA_NOMBRE', 'FinanzAdmin Pro', 'string', 'Nombre del sistema', 'sistema', true),
  ('SISTEMA_VERSION', '2.0.0', 'string', 'Versión del sistema', 'sistema', false),
  ('SISTEMA_TIMEZONE', 'America/Buenos_Aires', 'string', 'Zona horaria del servidor', 'sistema', true),
  ('SISTEMA_MANTENIMIENTO', 'false', 'boolean', 'Modo de mantenimiento habilitado', 'sistema', true),
  ('EMAIL_ACTIVO', 'false', 'boolean', 'Envío de emails habilitado', 'email', true),
  ('EMAIL_REMITENTE', 'noreply@finanzas.local', 'string', 'Dirección de remitente', 'email', true),
  ('EMAIL_SMTP_HOST', 'localhost', 'string', 'Host SMTP', 'email', true),
  ('EMAIL_SMTP_PORT', '587', 'integer', 'Puerto SMTP', 'email', true),
  ('EMAIL_SMTP_USER', '', 'string', 'Usuario SMTP', 'email', true),
  ('EMAIL_SMTP_PASS', '', 'string', 'Contraseña SMTP', 'email', true),
  ('EMAIL_SMTP_SECURE', 'false', 'boolean', 'Forzar TLS implícito', 'email', true)
on conflict (clave) do nothing;

insert into notif_plantillas (clave, asunto, cuerpo, descripcion) values
  ('bienvenida', 'Bienvenido a FinanzAdmin Pro', E'Hola {{nombre}},\n\nTu cuenta ya está activa. Podés ingresar en {{url}}.\n\nSaludos.', 'Email de alta de usuario'),
  ('prueba', 'Prueba de configuración SMTP', E'Este es un email de prueba enviado desde FinanzAdmin Pro.', 'Verificar SMTP')
on conflict (clave) do nothing;

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
drop trigger if exists bancos_updated_at on bancos;
create trigger bancos_updated_at before update on bancos for each row execute function set_updated_at();
drop trigger if exists cuentas_updated_at on cuentas;
create trigger cuentas_updated_at before update on cuentas for each row execute function set_updated_at();
drop trigger if exists movimientos_updated_at on movimientos;
create trigger movimientos_updated_at before update on movimientos for each row execute function set_updated_at();
drop trigger if exists brokers_updated_at on brokers;
create trigger brokers_updated_at before update on brokers for each row execute function set_updated_at();
drop trigger if exists movimientos_broker_updated_at on movimientos_broker;
create trigger movimientos_broker_updated_at before update on movimientos_broker for each row execute function set_updated_at();
drop trigger if exists activos_broker_updated_at on activos_broker;
create trigger activos_broker_updated_at before update on activos_broker for each row execute function set_updated_at();
drop trigger if exists precios_activo_updated_at on precios_activo;
create trigger precios_activo_updated_at before update on precios_activo for each row execute function set_updated_at();
drop trigger if exists wallet_providers_updated_at on wallet_providers;
create trigger wallet_providers_updated_at before update on wallet_providers for each row execute function set_updated_at();
drop trigger if exists wallets_updated_at on wallets;
create trigger wallets_updated_at before update on wallets for each row execute function set_updated_at();
drop trigger if exists wallet_saldos_updated_at on wallet_saldos;
create trigger wallet_saldos_updated_at before update on wallet_saldos for each row execute function set_updated_at();
drop trigger if exists movimientos_wallet_updated_at on movimientos_wallet;
create trigger movimientos_wallet_updated_at before update on movimientos_wallet for each row execute function set_updated_at();
drop trigger if exists usuario_empresa_updated_at on usuario_empresa;
create trigger usuario_empresa_updated_at before update on usuario_empresa for each row execute function set_updated_at();
