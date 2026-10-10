-- =====================================================================
-- FinanzAdmin Pro — Cola de actualización de precios
-- Archivo: supabase/migrations/0009_precios_jobs.sql
-- =====================================================================
-- Crea: precios_jobs.
--
-- POR QUÉ ESTA TABLA EXISTE (D30):
-- el PRD §8 pide un botón «actualizar precios» que solo puede pulsar un
-- super_admin. La tentación es hacer el trabajo dentro de la Edge Function,
-- pero Supabase corta una Edge Function a los ~150 s de reloj y el cliente de
-- Yahoo pide **un símbolo por petición** (v8/chart; el v7 sí era batch pero
-- devuelve 401 desde 2023 — ver D28). Una empresa con más de ~100 activos no
-- termina a tiempo.
--
-- Es exactamente el problema que D27 ya resolvió para la importación de PDFs:
-- la Edge Function **encola** y el worker de Node (EC2/Coolify) procesa, sin
-- límite de tiempo. Se reutiliza ese patrón en vez de inventar otro.
--
-- El worker de precios ya barre todos los activos cada 5 minutos; esta tabla
-- solo sirve para el «ahora mismo» del botón, que el worker atiende en su
-- siguiente vuelta (10 s).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: precios_jobs
-- ---------------------------------------------------------------------
create table if not exists public.precios_jobs (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  -- null = toda la empresa; con valor = solo los activos de ese broker.
  broker_id   uuid references public.brokers(id) on delete cascade,
  estado      public.estado_job not null default 'pendiente',

  -- Resultado. Se desglosa en vez de guardar solo un total porque el PRD §8
  -- pide `{actualizados, total, detalles}`: saber que 40 de 42 se actualizaron
  -- es más útil que saber que «falló».
  activos_totales      integer not null default 0,
  activos_actualizados integer not null default 0,
  errores              integer not null default 0,
  -- [{ nombre_activo, tipo_activo, ok, motivo }] — por qué falló cada uno.
  detalles    jsonb,
  error_mensaje text,

  -- Control del worker (mismo esquema que import_jobs, D27).
  intentos    integer not null default 0,
  started_at  timestamptz,
  finished_at timestamptz,

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.precios_jobs is
  'Cola de actualizaciones de precios bajo demanda (D30). La Edge Function encola '
  'y el worker de precios procesa; el frontend hace polling sobre `estado`.';

-- El worker busca pendientes en cada vuelta; el índice parcial evita escanear
-- el historial ya terminado.
create index if not exists precios_jobs_pendientes_idx
  on public.precios_jobs (estado, created_at)
  where estado in ('pendiente', 'procesando');

create index if not exists precios_jobs_empresa_idx
  on public.precios_jobs (empresa_id, created_at desc);

drop trigger if exists trg_precios_jobs_updated_at on public.precios_jobs;
create trigger trg_precios_jobs_updated_at
  before update on public.precios_jobs
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.precios_jobs enable row level security;

-- El usuario ve el progreso de las actualizaciones que pidió.
drop policy if exists precios_jobs_select on public.precios_jobs;
create policy precios_jobs_select on public.precios_jobs
  for select to authenticated
  using (public.has_empresa_access(empresa_id));

-- Solo un super_admin encola: el PRD §8 lo dice explícitamente para
-- `actualizarPreciosActivos`. Se comprueba con `is_super_admin()` y **no** con
-- `can_write_empresa`, que dejaría a cualquier `cliente` disparar peticiones
-- contra la API externa para toda su empresa.
drop policy if exists precios_jobs_insert on public.precios_jobs;
create policy precios_jobs_insert on public.precios_jobs
  for insert to authenticated
  with check (public.is_super_admin() and public.has_empresa_access(empresa_id));

-- El worker actualiza con service_role, que salta el RLS. Un super_admin puede
-- cancelar o reintentar desde la UI.
drop policy if exists precios_jobs_update on public.precios_jobs;
create policy precios_jobs_update on public.precios_jobs
  for update to authenticated
  using (public.is_super_admin() and public.has_empresa_access(empresa_id))
  with check (public.is_super_admin() and public.has_empresa_access(empresa_id));

drop policy if exists precios_jobs_delete on public.precios_jobs;
create policy precios_jobs_delete on public.precios_jobs
  for delete to authenticated
  using (public.is_super_admin() and public.has_empresa_access(empresa_id));


-- ---------------------------------------------------------------------
-- 3. Realtime
-- ---------------------------------------------------------------------
-- Para que la UI vea el paso de 'pendiente' a 'hecho' sin recargar, igual que
-- la importación de PDFs.
do $$ begin
  alter publication supabase_realtime add table public.precios_jobs;
exception
  when duplicate_object then null;
  when undefined_object then null;   -- la publicación no existe en un Postgres local
end $$;


-- ---------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------
--   select count(*) from public.precios_jobs;
--
-- Encolar a mano (como super_admin, desde el SQL Editor):
--   insert into public.precios_jobs (empresa_id) values ('<uuid-empresa>');
--
-- El worker debe tomarlo y dejarlo en 'hecho':
--   select estado, activos_totales, activos_actualizados, errores, detalles
--   from public.precios_jobs order by created_at desc limit 1;
--
-- Comprobar que un `cliente` NO puede encolar (debe dar error de RLS):
--   insert into public.precios_jobs (empresa_id) values ('<uuid-empresa>');
