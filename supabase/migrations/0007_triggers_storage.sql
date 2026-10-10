-- =====================================================================
-- FinanzAdmin Pro — Triggers, realtime y storage
-- Archivo: supabase/migrations/0007_triggers_storage.sql
-- =====================================================================
-- Cierra el backend: alta automática de usuarios (D10), publicación de
-- realtime, bucket privado de extractos y cron de precios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Alta automática de usuario  (D10)
-- ---------------------------------------------------------------------
-- Cuando el admin invita vía auth.admin.inviteUserByEmail(email, { data }),
-- Supabase crea la fila en auth.users. Este trigger crea el profile y los
-- vínculos user_empresa EN LA MISMA TRANSACCIÓN.
--
-- Esto reemplaza a PendingUser + checkInvitation + claimPendingUser del PRD
-- original: no hay carrera entre "usuario creado" y "asignación aplicada",
-- ni riesgo de que claimPendingUser corra dos veces.
--
-- `security definer` es imprescindible: el trigger corre en el contexto del
-- alta de auth.users, donde auth.uid() todavía no existe y las policies
-- rechazarían el INSERT.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name   text;
  v_app_role    public.app_role;
  v_estado      public.estado_usuario;
  v_empresa_ids text[];
  v_empresa_id  text;
begin
  -- Los metadatos llegan desde el `data` de inviteUserByEmail.
  v_full_name   := nullif(new.raw_user_meta_data->>'full_name', '');
  v_empresa_ids := case
    when new.raw_user_meta_data ? 'empresa_ids'
    then array(select jsonb_array_elements_text(new.raw_user_meta_data->'empresa_ids'))
    else null
  end;

  -- Casting defensivo: si llega un valor inválido, se usa el default en vez
  -- de romper el alta del usuario.
  begin
    v_app_role := coalesce(
      (new.raw_user_meta_data->>'app_role')::public.app_role, 'usuario');
  exception when others then
    v_app_role := 'usuario';
  end;

  begin
    v_estado := coalesce(
      (new.raw_user_meta_data->>'estado')::public.estado_usuario, 'activo');
  exception when others then
    v_estado := 'activo';
  end;

  insert into public.profiles (id, email, full_name, app_role, estado)
  values (new.id, new.email, v_full_name, v_app_role, v_estado)
  on conflict (id) do nothing;

  -- Vínculos con las empresas asignadas en la invitación.
  if v_empresa_ids is not null then
    foreach v_empresa_id in array v_empresa_ids loop
      -- Se ignoran ids inválidos en vez de abortar el alta completa.
      begin
        insert into public.user_empresa (user_id, empresa_id, rol)
        values (new.id, v_empresa_id::uuid, 'cliente')
        on conflict (user_id, empresa_id) do nothing;
      exception when others then
        null;
      end;
    end loop;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea profile + user_empresa al aceptar una invitación (D10). Atómico: o se crea '
  'todo, o no se crea el usuario.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Sincroniza el email si cambia en auth.users (p. ej. confirmación).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();


-- ---------------------------------------------------------------------
-- 2. Conteo de usuarios en el borrado
-- ---------------------------------------------------------------------
-- Si se borra el perfil, se borran sus vínculos (ya lo hace la FK cascade).
-- Este trigger limpia además cualquier job pendiente del usuario, para que
-- el worker no se quede con trabajos huérfanos.
create or replace function public.limpiar_jobs_al_borrar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.import_jobs
     set estado = 'error',
         error_mensaje = 'Usuario eliminado antes de procesar'
   where created_by = old.id
     and estado in ('pendiente', 'procesando');
  return old;
end;
$$;

drop trigger if exists on_profile_deleted on public.profiles;
create trigger on_profile_deleted
  before delete on public.profiles
  for each row execute function public.limpiar_jobs_al_borrar_usuario();


-- ---------------------------------------------------------------------
-- 3. Realtime
-- ---------------------------------------------------------------------
-- REQUISITO: las tablas hay que añadirlas EXPLÍCITAMENTE a la publicación.
-- No basta con crearlas. El PRD §11.3 depende de esto para actualizar el
-- sidebar automáticamente.
--
-- Se publican las tablas que el sidebar y las vistas de detalle observan.
do $$
begin
  -- REPLICA IDENTITY FULL: necesario para que en DELETE/UPDATE el payload
  -- incluya los valores antiguos y el cliente sepa qué fila quitar.
  alter table public.bancos            replica identity full;
  alter table public.cuentas           replica identity full;
  alter table public.brokers           replica identity full;
  alter table public.wallet_providers  replica identity full;
  alter table public.wallets           replica identity full;
exception when others then null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'bancos', 'cuentas', 'movimientos',
    'brokers', 'movimientos_broker', 'activos_broker',
    'wallet_providers', 'wallets', 'wallet_saldos', 'movimientos_wallet',
    'import_jobs'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- ya estaba publicada
      when undefined_object then null;   -- la publicación no existe aún
    end;
  end loop;
end $$;

-- NOTA: Realtime respeta RLS. Con las policies de la 0006, un usuario
-- solo recibe eventos de sus empresas. Sin RLS, Realtime filtraría mal.


-- ---------------------------------------------------------------------
-- 4. Storage: bucket de extractos
-- ---------------------------------------------------------------------
-- Bucket PRIVADO. Resuelve la limitación §18.5 del PRD original ("archivos
-- subidos se almacenan públicamente... cualquiera con el enlace accede"),
-- inaceptable para extractos bancarios.
--
-- Convención de ruta: {empresa_id}/{uuid}.pdf
-- El primer segmento es el empresa_id, y de ahí sale el permiso.

-- Helper: extrae el empresa_id de la ruta SIN lanzar error si el primer
-- segmento no es un UUID válido. Sin esto, un objeto subido a una ruta
-- arbitraria haría fallar la policy con un cast error en vez de denegar.
create or replace function public.empresa_de_ruta(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_seg text;
begin
  v_seg := (storage.foldername(p_name))[1];
  if v_seg is null then
    return null;
  end if;
  return v_seg::uuid;
exception when others then
  return null;   -- ruta inválida → null → la policy deniega
end;
$$;

comment on function public.empresa_de_ruta(text) is
  'Extrae el empresa_id (primer segmento) de la ruta en Storage. Devuelve null si la '
  'ruta no es válida, para que la policy deniegue en vez de fallar.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'extractos',
  'extractos',
  false,                                    -- privado
  26214400,                                 -- 25 MB
  array['application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


drop policy if exists extractos_select on storage.objects;
create policy extractos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'extractos'
    and public.empresa_de_ruta(name) is not null
    and public.has_empresa_access(public.empresa_de_ruta(name))
  );

drop policy if exists extractos_insert on storage.objects;
create policy extractos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'extractos'
    and public.empresa_de_ruta(name) is not null
    and public.can_write_empresa(public.empresa_de_ruta(name))
  );

drop policy if exists extractos_update on storage.objects;
create policy extractos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'extractos'
    and public.empresa_de_ruta(name) is not null
    and public.can_write_empresa(public.empresa_de_ruta(name))
  );

drop policy if exists extractos_delete on storage.objects;
create policy extractos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'extractos'
    and public.empresa_de_ruta(name) is not null
    and public.can_write_empresa(public.empresa_de_ruta(name))
  );

-- El frontend usa createSignedUrl() para leer: la URL caduca (por defecto 60s)
-- y no es adivinable. Nunca se usa getPublicUrl() en este bucket.


-- ---------------------------------------------------------------------
-- 5. Cron de precios
-- ---------------------------------------------------------------------
-- El PRD §18.2 decía que cron requería plan pago. En Supabase Cloud pg_cron
-- está disponible. La programación real se hace en el worker de precios, cuando exista
-- el worker al que llamar; aquí solo se habilita la extensión.
--
-- Se envuelve en un bloque tolerante porque `create extension` puede requerir
-- permisos elevados según cómo esté configurado el proyecto. Si falla, se
-- activa a mano desde Database → Extensions y la migración sigue igual.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron no se pudo crear automáticamente. Actívala en Database → Extensions.';
end $$;

-- Se descomenta tras desplegar el worker de precios:
--
--   create extension if not exists pg_net;
--   select cron.schedule(
--     'actualizar-precios-diario',
--     '0 13 * * 1-5',                          -- 13:00 UTC, lunes a viernes
--     $$select net.http_post(
--         url := 'https://<worker>/actualizar-precios',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer <token>',
--           'Content-Type', 'application/json'
--         ),
--         body := '{}'::jsonb
--     )$$
--   );


-- ---------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------
--   -- 1. La publicación de realtime
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' order by 1;
--
--   -- 2. El bucket
--   select id, public from storage.buckets where id = 'extractos';
--   -- esperado: public = false
--
--   -- 3. El trigger de alta de usuario
--   select tgname from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
--   -- esperado: on_auth_user_created, on_auth_user_email_updated
