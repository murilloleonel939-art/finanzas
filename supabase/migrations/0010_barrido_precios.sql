-- =====================================================================
-- FinanzAdmin Pro — Registro del barrido diario de precios
-- Archivo: supabase/migrations/0010_barrido_precios.sql
-- =====================================================================
-- Crea: precios_barridos.
--
-- POR QUÉ ESTA TABLA EXISTE (D31):
-- el barrido completo de precios debe correr **una vez al día**, a las 16:00
-- de Colombia. Hasta ahora el worker barría en cada vuelta (cada 5 minutos),
-- lo que son ~288 barridos diarios contra Yahoo para escribir casi siempre los
-- mismos precios.
--
-- Para que sea diario hacen falta dos cosas: saber la hora de Bogotá con
-- independencia de la zona del servidor (lo resuelve `src/lib/programacion.js`)
-- y **recordar si ya se barrió hoy**. Ese segundo dato no puede vivir solo en
-- memoria del worker: un reinicio a las 16:05 dispararía un segundo barrido, y
-- con `UNA_VEZ=1` (cron externo cada 5 minutos) cada proceso arrancaría sin
-- memoria y barrería otra vez.
--
-- Con la fila en la tabla, la condición es «hoy no se ha barrido y ya pasó la
-- hora», que además hace que un worker caído a las 16:00 barra en cuanto
-- vuelva, en vez de saltarse el día entero.
--
-- El índice único por fecha es lo que garantiza «uno al día» incluso si dos
-- workers arrancan a la vez: el segundo choca y se retira.
--
-- Esta tabla es un registro operativo global (cubre todas las empresas), no un
-- dato financiero por empresa. Por eso no lleva `empresa_id` y la lee solo un
-- super_admin. El worker escribe con service_role, que salta el RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla: precios_barridos
-- ---------------------------------------------------------------------
create table if not exists public.precios_barridos (
  id         uuid primary key default gen_random_uuid(),

  -- Fecha del barrido **en la zona del negocio** (America/Bogota), no en UTC:
  -- un barrido de las 16:00 de Bogotá es todavía del mismo día local, y es el
  -- día con el que se compara para decidir si toca barrer.
  fecha      date not null,
  estado     public.estado_job not null default 'procesando',

  -- Resultado, con el mismo desglose que `precios_jobs` para que la UI pueda
  -- mostrar las dos cosas con el mismo componente.
  activos_totales      integer not null default 0,
  activos_actualizados integer not null default 0,
  errores              integer not null default 0,
  error_mensaje text,

  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.precios_barridos is
  'Registro del barrido diario de precios (D31). Una fila por día; el índice '
  'único por fecha impide barrer dos veces el mismo día.';

-- Un barrido por día. Es la garantía dura de «uno al día»: si dos workers
-- arrancan a la misma hora, el segundo no puede insertar y se retira.
create unique index if not exists precios_barridos_fecha_unico
  on public.precios_barridos (fecha);

create index if not exists precios_barridos_fecha_desc_idx
  on public.precios_barridos (fecha desc);

drop trigger if exists trg_precios_barridos_updated_at on public.precios_barridos;
create trigger trg_precios_barridos_updated_at
  before update on public.precios_barridos
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.precios_barridos enable row level security;

-- Es un registro operativo de toda la instalación, no un dato de una empresa:
-- un `cliente` no tiene nada que ver aquí. Solo el super_admin lo consulta.
drop policy if exists precios_barridos_select on public.precios_barridos;
create policy precios_barridos_select on public.precios_barridos
  for select to authenticated
  using (public.is_super_admin());

-- El worker escribe con service_role y salta el RLS. Un super_admin puede
-- reintentar un barrido fallido desde la UI.
drop policy if exists precios_barridos_insert on public.precios_barridos;
create policy precios_barridos_insert on public.precios_barridos
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists precios_barridos_update on public.precios_barridos;
create policy precios_barridos_update on public.precios_barridos
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Sin policy de DELETE a propósito: el histórico de barridos no se borra desde
-- la UI. Si hay que purgarlo, se hace con service_role y a conciencia.


-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
--   select count(*) from public.precios_barridos;
--
-- El worker deja una fila al día:
--   select fecha, estado, activos_totales, activos_actualizados, errores
--   from public.precios_barridos order by fecha desc limit 5;
--
-- Comprobar que solo un super_admin la ve (como `cliente` debe dar 0 filas):
--   select count(*) from public.precios_barridos;
