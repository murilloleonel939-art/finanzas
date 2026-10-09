-- =====================================================================
-- FinanzAdmin Pro — FASE 11: acceso derivado del estado de la empresa
-- Archivo: supabase/migrations/0008_empresa_borrada_sin_acceso.sql
-- =====================================================================
-- CORRIGE UN HUECO DE LA 0006, no cambia ninguna decisión.
--
-- PROBLEMA: `has_empresa_access()` y `can_write_empresa()` comprobaban
-- únicamente la fila de `user_empresa`. Ninguna miraba si la EMPRESA seguía
-- viva. Consecuencia con D7 (borrado lógico):
--
--   1. El super_admin borra una empresa → `empresas.deleted_at = now()`.
--   2. `empresas_select` la oculta (filtra `deleted_at is null`): desaparece
--      del panel. Correcto.
--   3. Pero `bancos`, `cuentas`, `movimientos`, `brokers`, `wallets`… siguen
--      comprobando solo `user_empresa`. El usuario asignado SIGUE LEYENDO y
--      ESCRIBIENDO todos los datos financieros de la empresa borrada, y el
--      bucket `extractos` le sigue sirviendo los PDFs.
--
-- Es decir: "borrar" una empresa no le quitaba el acceso a nadie. Bastaba
-- conocer el `empresa_id` (que el usuario ya tiene en su historial) para
-- seguir operando sobre ella.
--
-- ARREGLO: las dos funciones exigen ahora que la empresa exista y no esté
-- borrada. Es un `exists` contra la primary key, así que el coste por fila
-- es un lookup de índice.
--
-- EFECTO SECUNDARIO DESEADO: restaurar una empresa (`deleted_at = null`)
-- devuelve el acceso a todo su contenido sin tocar ninguna fila hija. Por eso
-- borrar una empresa NO necesita cascada de borrados lógicos sobre bancos,
-- cuentas y movimientos: el acceso se deriva de la empresa.
--
-- NOTA: se aplica también al `super_admin`. Es coherente con lo que ya hacía
-- `empresas_select` en la 0006, que filtra `deleted_at is null` para todos.
-- Si algún día hace falta una papelera para restaurar, se resolverá con una
-- vista o una función específica, no relajando estas dos.
-- =====================================================================

create or replace function public.has_empresa_access(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empresas
    where id = p_empresa
      and deleted_at is null
  ) and (
    public.is_super_admin() or exists (
      select 1 from public.user_empresa
      where empresa_id = p_empresa
        and user_id = auth.uid()
        and deleted_at is null
    )
  );
$$;

comment on function public.has_empresa_access(uuid) is
  'true si el usuario puede LEER la empresa: la empresa no está borrada y el usuario '
  'es super_admin o está asignado a ella. La comprobación del borrado es lo que hace '
  'que el borrado lógico de una empresa (D7) retire de verdad el acceso a sus datos '
  '(migración 0008).';


create or replace function public.can_write_empresa(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.empresas
    where id = p_empresa
      and deleted_at is null
  ) and (
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
  'mismos permisos (D5/D6); super_admin siempre. Exige usuario activo y empresa viva.';


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
-- Con una empresa borrada (deleted_at no nulo) y un usuario asignado a ella:
--
--   select public.has_empresa_access('<uuid-empresa-borrada>');
--   -- esperado: false  (antes: true)
--
--   select count(*) from public.bancos where empresa_id = '<uuid-empresa-borrada>';
--   -- esperado: 0      (antes: los bancos de la empresa borrada)
--
-- Y tras restaurarla (update public.empresas set deleted_at = null where id = ...):
-- el acceso y los datos vuelven sin tocar ninguna fila hija.
