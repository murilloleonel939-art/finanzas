-- =====================================================================
-- FinanzAdmin Pro — FASE 6: Row-Level Security
-- Archivo: supabase/migrations/0006_rls.sql
-- =====================================================================
-- Implementa D14: RLS real en todas las tablas.
--
-- CONTEXTO: el PRD original marcaba las 9 tablas financieras como
-- "Abierto" y delegaba el aislamiento al frontend. Eso NO protege nada,
-- porque la anon key viaja en el bundle del navegador: cualquiera puede
-- hacer `curl .../rest/v1/movimientos` y leer los datos bancarios de
-- todas las empresas. El RLS es la única frontera de seguridad real.
--
-- PRINCIPIO: toda tabla con empresa_id usa las mismas dos funciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funciones helper
-- ---------------------------------------------------------------------
-- CRÍTICO: todas son `security definer`. Esto hace dos cosas:
--   a) Rompen la RECURSIÓN INFINITA: una policy sobre `profiles` que
--      consulte `profiles` se llamaría a sí misma sin fin. Al ser definer,
--      la consulta interna salta el RLS.
--   b) Permiten que cualquier authenticated evalúe permisos sin tener
--      SELECT sobre user_empresa/profiles.
-- `stable` permite que Postgres cachee el resultado dentro de la consulta.
-- `set search_path` evita ataques de search_path hijacking.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and estado = 'activo'
  );
$$;

comment on function public.is_active_user() is
  'true si el usuario autenticado existe y está activo. Un usuario inactivo no pasa '
  'ninguna policy: el bloqueo deja de ser evitable desde el frontend.';


create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and app_role = 'super_admin'
      and estado = 'activo'
  );
$$;

comment on function public.is_super_admin() is
  'true si el usuario es super_admin y está activo.';


create or replace function public.has_empresa_access(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_empresa
    where empresa_id = p_empresa
      and user_id = auth.uid()
      and deleted_at is null
  );
$$;

comment on function public.has_empresa_access(uuid) is
  'true si el usuario puede LEER la empresa: es super_admin o está asignado a ella.';


create or replace function public.can_write_empresa(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and (
    public.is_super_admin() or exists (
      select 1 from public.user_empresa
      where empresa_id = p_empresa
        and user_id = auth.uid()
        and rol in ('contador', 'cliente')   -- D5/D6: ambos escriben
        and deleted_at is null
    )
  );
$$;

comment on function public.can_write_empresa(uuid) is
  'true si el usuario puede ESCRIBIR en la empresa. contador y cliente tienen los '
  'mismos permisos (D5/D6); super_admin siempre. Exige usuario activo.';


-- ---------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()          -- siempre puedo ver mi propio perfil
    or public.is_super_admin()
  );

-- El usuario puede editar su perfil, pero NO su app_role ni su estado:
-- eso solo lo hace el super_admin (UsuariosPage).
-- El trigger `profiles_proteger_campos` de abajo hace cumplir la restricción
-- de columnas, porque RLS no puede restringir por columna.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- Nadie inserta ni borra profiles desde el cliente: lo hace el trigger
-- handle_new_user() con privilegios elevados (FASE 7).
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_super_admin());


-- Impide que un usuario no-admin cambie su propio app_role o estado.
create or replace function public.proteger_campos_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin contexto de usuario (service_role, dashboard o trigger interno como
  -- sync_profile_email de la FASE 7) no hay nada que proteger: el llamante
  -- ya es de confianza.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_super_admin() then
    return new;                       -- el admin puede cambiar todo
  end if;

  if new.app_role is distinct from old.app_role then
    raise exception 'Solo un super_admin puede cambiar app_role';
  end if;
  if new.estado is distinct from old.estado then
    raise exception 'Solo un super_admin puede cambiar el estado del usuario';
  end if;
  if new.email is distinct from old.email then
    raise exception 'El email no se puede cambiar';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_profile on public.profiles;
create trigger trg_proteger_campos_profile
  before update on public.profiles
  for each row execute function public.proteger_campos_profile();


-- ---------------------------------------------------------------------
-- 3. empresas
-- ---------------------------------------------------------------------
alter table public.empresas enable row level security;

-- Un usuario ve las empresas a las que está asignado; el super_admin, todas.
-- (El PRD decía "lectura abierta"; se restringe porque no hay motivo para que
-- un usuario vea el nombre de una empresa que no es suya.)
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(id));

drop policy if exists empresas_insert on public.empresas;
create policy empresas_insert on public.empresas
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists empresas_delete on public.empresas;
create policy empresas_delete on public.empresas
  for delete to authenticated
  using (public.is_super_admin());


-- ---------------------------------------------------------------------
-- 4. user_empresa
-- ---------------------------------------------------------------------
alter table public.user_empresa enable row level security;

-- Lectura: el super_admin ve todos los vínculos; un usuario ve los suyos.
drop policy if exists user_empresa_select on public.user_empresa;
create policy user_empresa_select on public.user_empresa
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- Escritura: solo super_admin. Un usuario no se auto-asigna empresas.
drop policy if exists user_empresa_insert on public.user_empresa;
create policy user_empresa_insert on public.user_empresa
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists user_empresa_update on public.user_empresa;
create policy user_empresa_update on public.user_empresa
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists user_empresa_delete on public.user_empresa;
create policy user_empresa_delete on public.user_empresa
  for delete to authenticated
  using (public.is_super_admin());


-- ---------------------------------------------------------------------
-- 5. Tablas financieras
-- ---------------------------------------------------------------------
-- Patrón idéntico para las 9. Lectura: acceso a la empresa.
-- Escritura: contador o cliente de esa empresa (o super_admin).

-- --- bancos ---
alter table public.bancos enable row level security;

drop policy if exists bancos_select on public.bancos;
create policy bancos_select on public.bancos
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists bancos_insert on public.bancos;
create policy bancos_insert on public.bancos
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists bancos_update on public.bancos;
create policy bancos_update on public.bancos
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists bancos_delete on public.bancos;
create policy bancos_delete on public.bancos
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- cuentas ---
alter table public.cuentas enable row level security;

drop policy if exists cuentas_select on public.cuentas;
create policy cuentas_select on public.cuentas
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists cuentas_insert on public.cuentas;
create policy cuentas_insert on public.cuentas
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists cuentas_update on public.cuentas;
create policy cuentas_update on public.cuentas
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists cuentas_delete on public.cuentas;
create policy cuentas_delete on public.cuentas
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- movimientos ---
alter table public.movimientos enable row level security;

drop policy if exists movimientos_select on public.movimientos;
create policy movimientos_select on public.movimientos
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_update on public.movimientos;
create policy movimientos_update on public.movimientos
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_delete on public.movimientos;
create policy movimientos_delete on public.movimientos
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- brokers ---
alter table public.brokers enable row level security;

drop policy if exists brokers_select on public.brokers;
create policy brokers_select on public.brokers
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists brokers_insert on public.brokers;
create policy brokers_insert on public.brokers
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists brokers_update on public.brokers;
create policy brokers_update on public.brokers
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists brokers_delete on public.brokers;
create policy brokers_delete on public.brokers
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- movimientos_broker ---
alter table public.movimientos_broker enable row level security;

drop policy if exists movimientos_broker_select on public.movimientos_broker;
create policy movimientos_broker_select on public.movimientos_broker
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists movimientos_broker_insert on public.movimientos_broker;
create policy movimientos_broker_insert on public.movimientos_broker
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_broker_update on public.movimientos_broker;
create policy movimientos_broker_update on public.movimientos_broker
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_broker_delete on public.movimientos_broker;
create policy movimientos_broker_delete on public.movimientos_broker
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- activos_broker ---
alter table public.activos_broker enable row level security;

drop policy if exists activos_broker_select on public.activos_broker;
create policy activos_broker_select on public.activos_broker
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists activos_broker_insert on public.activos_broker;
create policy activos_broker_insert on public.activos_broker
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists activos_broker_update on public.activos_broker;
create policy activos_broker_update on public.activos_broker
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists activos_broker_delete on public.activos_broker;
create policy activos_broker_delete on public.activos_broker
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- precios_activo ---
-- Caso especial: el PRD §6.4 dice admin-only, pero §6.5 muestra la pestaña
-- "Precios" a todos los usuarios. Resolución: LECTURA para quien tenga
-- acceso a la empresa, ESCRITURA solo super_admin.
alter table public.precios_activo enable row level security;

drop policy if exists precios_activo_select on public.precios_activo;
create policy precios_activo_select on public.precios_activo
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists precios_activo_insert on public.precios_activo;
create policy precios_activo_insert on public.precios_activo
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists precios_activo_update on public.precios_activo;
create policy precios_activo_update on public.precios_activo
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists precios_activo_delete on public.precios_activo;
create policy precios_activo_delete on public.precios_activo
  for delete to authenticated
  using (public.is_super_admin());

-- --- wallet_providers ---
alter table public.wallet_providers enable row level security;

drop policy if exists wallet_providers_select on public.wallet_providers;
create policy wallet_providers_select on public.wallet_providers
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists wallet_providers_insert on public.wallet_providers;
create policy wallet_providers_insert on public.wallet_providers
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists wallet_providers_update on public.wallet_providers;
create policy wallet_providers_update on public.wallet_providers
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists wallet_providers_delete on public.wallet_providers;
create policy wallet_providers_delete on public.wallet_providers
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- wallets ---
alter table public.wallets enable row level security;

drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists wallets_insert on public.wallets;
create policy wallets_insert on public.wallets
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists wallets_update on public.wallets;
create policy wallets_update on public.wallets
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists wallets_delete on public.wallets;
create policy wallets_delete on public.wallets
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));

-- --- wallet_saldos ---
-- No tiene empresa_id (es una tabla de valores colgando de wallets).
-- El permiso se resuelve con un EXISTS contra wallets.
alter table public.wallet_saldos enable row level security;

drop policy if exists wallet_saldos_select on public.wallet_saldos;
create policy wallet_saldos_select on public.wallet_saldos
  for select to authenticated
  using (exists (
    select 1 from public.wallets w
    where w.id = wallet_saldos.wallet_id
      and public.has_empresa_access(w.empresa_id)
  ));

drop policy if exists wallet_saldos_write on public.wallet_saldos;
create policy wallet_saldos_write on public.wallet_saldos
  for all to authenticated
  using (exists (
    select 1 from public.wallets w
    where w.id = wallet_saldos.wallet_id
      and public.can_write_empresa(w.empresa_id)
  ))
  with check (exists (
    select 1 from public.wallets w
    where w.id = wallet_saldos.wallet_id
      and public.can_write_empresa(w.empresa_id)
  ));

-- --- movimientos_wallet ---
alter table public.movimientos_wallet enable row level security;

drop policy if exists movimientos_wallet_select on public.movimientos_wallet;
create policy movimientos_wallet_select on public.movimientos_wallet
  for select to authenticated
  using (deleted_at is null and public.has_empresa_access(empresa_id));

drop policy if exists movimientos_wallet_insert on public.movimientos_wallet;
create policy movimientos_wallet_insert on public.movimientos_wallet
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_wallet_update on public.movimientos_wallet;
create policy movimientos_wallet_update on public.movimientos_wallet
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists movimientos_wallet_delete on public.movimientos_wallet;
create policy movimientos_wallet_delete on public.movimientos_wallet
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));


-- ---------------------------------------------------------------------
-- 6. import_jobs
-- ---------------------------------------------------------------------
alter table public.import_jobs enable row level security;

-- El usuario ve el progreso de sus importaciones.
drop policy if exists import_jobs_select on public.import_jobs;
create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (public.has_empresa_access(empresa_id));

-- El usuario encola y cancela jobs de su empresa.
-- El worker los actualiza con service_role, que salta el RLS.
drop policy if exists import_jobs_insert on public.import_jobs;
create policy import_jobs_insert on public.import_jobs
  for insert to authenticated
  with check (public.can_write_empresa(empresa_id));

drop policy if exists import_jobs_update on public.import_jobs;
create policy import_jobs_update on public.import_jobs
  for update to authenticated
  using (public.can_write_empresa(empresa_id))
  with check (public.can_write_empresa(empresa_id));

drop policy if exists import_jobs_delete on public.import_jobs;
create policy import_jobs_delete on public.import_jobs
  for delete to authenticated
  using (public.can_write_empresa(empresa_id));


-- ---------------------------------------------------------------------
-- 7. Permisos sobre las vistas
-- ---------------------------------------------------------------------
-- Las vistas usan security_invoker, así que el RLS de las tablas base
-- sigue aplicándose. Solo hace falta el GRANT de SELECT.
grant select on public.cuentas_view            to authenticated;
grant select on public.movimientos_view        to authenticated;
grant select on public.movimientos_broker_view to authenticated;
grant select on public.activos_broker_view     to authenticated;
grant select on public.precios_activo_view     to authenticated;
grant select on public.wallets_view            to authenticated;
grant select on public.movimientos_wallet_view to authenticated;


-- ---------------------------------------------------------------------
-- 8. Verificación — ejecutar con DOS usuarios de empresas distintas
-- ---------------------------------------------------------------------
-- 1. Crear dos usuarios (A y B), cada uno asignado a una empresa diferente.
-- 2. Autenticarse como A.
-- 3. Comprobar que A NO ve nada de la empresa de B:
--
--    select count(*) from public.movimientos;       -- solo los de A
--    select count(*) from public.movimientos_view;  -- solo los de A
--    select * from public.empresas;                 -- solo la de A
--
-- 4. Intentar escribir en la empresa de B (debe fallar):
--
--    insert into public.bancos (empresa_id, pais, nombre_banco)
--    values ('<uuid-de-la-empresa-de-B>', 'CO', 'X');
--    -- ERROR: new row violates row-level security policy
--
-- 5. Desactivar a A (estado='inactivo') y comprobar que no ve NADA.
--
-- ESTA PRUEBA ES OBLIGATORIA antes de cargar datos reales.
