-- =====================================================================
-- FinanzAdmin Pro — FASE 23: el borrado lógico ya no se autorrechaza
-- Archivo: supabase/migrations/0015_empresas_select_permite_borradas.sql
-- =====================================================================
-- SÍNTOMA: borrar una empresa desde el panel devuelve
--
--   {"code":"42501","message":"new row violates row-level security policy
--    for table \"empresas\""}   (HTTP 403)
--
-- Es el MISMO mecanismo que la 0014 arregló para el INSERT, ahora en el
-- UPDATE del borrado lógico. Medido contra el proyecto real, con el mismo
-- token y la misma fila, cambiando solo el valor del PATCH:
--
--   PATCH {nombre}                        -> 204
--   PATCH {estado}                        -> 204
--   PATCH {deleted_at: null}  (no-op)     -> 204
--   PATCH {deleted_at: <fecha>}           -> 403 42501
--   PATCH {deleted_at: <fecha>} sin Prefer-> 403 42501
--
-- CAUSA: `empresas_update` es `using (is_super_admin()) with check
-- (is_super_admin())`, que NO depende del valor; y los dos primeros casos
-- pasan, luego esa policy está bien y el `with check` del UPDATE se cumple.
-- Lo que rechaza es la policy de SELECT, que PostgREST evalúa sobre la fila
-- resultante para poder devolverla:
--
--   using (deleted_at is null and (...))
--
-- Al poner `deleted_at` en la fila, la fila nueva deja de cumplir
-- `deleted_at is null` — que es justo lo que la sentencia pretende escribir —
-- así que la comprobación se contradice a sí misma y aborta la sentencia.
--
-- El quinto caso demuestra que NO se arregla desde el cliente: falla incluso
-- sin cabecera `Prefer`, así que quitar `.select()` no sirve de nada.
-- (`eliminarEmpresa` ya no la usa y fallaba igual.)
--
-- ARREGLO: el `deleted_at is null` sobra para el `super_admin`. Quien decide
-- si una empresa está viva es `has_empresa_access()`, que la 0008 usa en
-- TODAS las tablas hijas (bancos, cuentas, movimientos, brokers, wallets) y
-- que sigue exigiendo que la empresa exista y no esté borrada. Es decir: el
-- borrado lógico retira el acceso a los datos financieros igual que antes,
-- porque esa puerta no se toca. Lo único que cambia es que el super_admin
-- puede leer la fila de una empresa borrada — necesario para poder restaurarla
-- y para que el propio UPDATE del borrado no se autorrechace.
--
-- Un usuario normal NO gana nada: su rama sigue exigiendo `deleted_at is null`
-- y estar asignado. Y el panel sigue ocultando las borradas porque el
-- frontend filtra explícitamente con `.is('deleted_at', null)` en
-- listarEmpresas, en el panel de admin y en el selector de usuarios.
--
-- SEMÁNTICA: idéntica a la de la 0014 para los usuarios; para el super_admin,
-- ahora puede ver (no tocar: eso lo decide el UPDATE/DELETE) las borradas.
-- =====================================================================

drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select to authenticated
  using (
    public.is_super_admin() or (
      deleted_at is null
      and exists (
        select 1 from public.user_empresa
        where empresa_id = empresas.id
          and user_id = auth.uid()
          and deleted_at is null
      )
    )
  );

comment on policy empresas_select on public.empresas is
  'El super_admin ve todas las empresas, incluidas las borradas lógicamente: lo necesita '
  'para que el UPDATE que pone deleted_at no se autorrechace (la policy se evalúa sobre la '
  'fila resultante) y para poder restaurarlas. Un usuario normal solo ve las vivas a las que '
  'está asignado. El acceso a los DATOS de una empresa borrada lo sigue cortando '
  'has_empresa_access(), que la 0008 aplica en todas las tablas hijas (migraciones 0014-0015).';


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
-- 1) El borrado ya pasa (mismo PATCH que daba 403). Como super_admin:
--
--      PATCH /rest/v1/empresas?id=eq.<uuid>   {"deleted_at": "<fecha>"}
--      -> esperado: 204
--
-- 2) La empresa borrada desaparece del panel (el frontend filtra), pero
--    sus datos quedan fuera de alcance, que es el objetivo de D7:
--
--      select public.has_empresa_access('<uuid-empresa-borrada>');  -- false
--      select count(*) from public.bancos where empresa_id = '<uuid>'; -- 0
--
-- 3) Restaurar sigue funcionando y devuelve el acceso:
--
--      PATCH /rest/v1/empresas?id=eq.<uuid>   {"deleted_at": null}
--      select public.has_empresa_access('<uuid>');                  -- true
--
-- 4) Un usuario NO super_admin sigue sin ver empresas ajenas ni borradas:
--      (repetir la prueba de dos usuarios de docs/04-SETUP-SUPABASE.md)
