-- =====================================================================
-- FinanzAdmin Pro — FASE 22: arreglo del INSERT de empresas (RETURNING)
-- Archivo: supabase/migrations/0014_empresas_select_sin_autoconsulta.sql
-- =====================================================================
-- SÍNTOMA: crear una empresa desde el panel devuelve
--
--   {"code":"42501","message":"new row violates row-level security policy
--    for table \"empresas\""}   (HTTP 403)
--
-- aunque el llamante sea super_admin ACTIVO y `empresas_insert` sea
-- `with check (public.is_super_admin())`.
--
-- CAUSA: la 0008 endureció `has_empresa_access()` para que exigiera que la
-- empresa existiera y no estuviera borrada:
--
--   select exists (
--     select 1 from public.empresas where id = p_empresa and deleted_at is null
--   ) and ( is_super_admin() or exists (user_empresa ...) )
--
-- Y `empresas_select` (0006) la usa sobre la PROPIA fila:
--
--   using (deleted_at is null and public.has_empresa_access(id))
--
-- El problema es la combinación de dos hechos:
--
--   1. `has_empresa_access()` es STABLE, así que consulta con el snapshot de
--      la sentencia que la llama.
--   2. En `INSERT ... RETURNING`, ese snapshot se toma ANTES de la inserción,
--      por lo que el `exists` contra `empresas` NO ve la fila recién creada.
--
-- Resultado: al devolver la fila insertada, Postgres aplica la policy de
-- SELECT, `has_empresa_access(<fila nueva>)` devuelve false, y la sentencia
-- entera aborta con 42501. El `with check` del INSERT sí había pasado; el
-- que rechaza es el SELECT del RETURNING. Por eso el mismo INSERT funciona
-- sin `return=representation` y falla con él, y por eso el bug no aparece en
-- los UPDATE sobre filas ya existentes (esas sí están en el snapshot).
--
-- ALCANCE: solo `empresas`. En las tablas hijas (bancos, cuentas, etc.) la
-- policy llama `has_empresa_access(empresa_id)`, y esa empresa ya existía
-- antes de la sentencia, así que la ve sin problema.
--
-- ARREGLO: en `empresas`, la comprobación "la empresa existe y no está
-- borrada" es redundante — la fila ES la empresa, y la policy ya filtra
-- `deleted_at is null`. Se escribe el predicado equivalente sin la
-- autoconsulta, de modo que el RETURNING evalúa la fila nueva directamente.
-- Las tablas hijas NO se tocan: ahí la 0008 sigue siendo necesaria.
--
-- SEMÁNTICA: idéntica a la anterior. Para una fila de `empresas` que se está
-- leyendo, `exists (... where id = <esa fila> and deleted_at is null)` es
-- equivalente a `deleted_at is null`, porque la fila está en el snapshot.
-- Se conserva el filtro de borrado lógico (D7) y el acceso por `user_empresa`.
-- =====================================================================

drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_super_admin() or exists (
        select 1 from public.user_empresa
        where empresa_id = empresas.id
          and user_id = auth.uid()
          and deleted_at is null
      )
    )
  );

comment on policy empresas_select on public.empresas is
  'Un usuario ve las empresas vivas a las que está asignado; el super_admin, todas. '
  'No usa has_empresa_access() a propósito: esa función es STABLE y su exists contra '
  'empresas no ve la fila recién insertada durante el RETURNING, lo que rompía el '
  'INSERT con 42501 (migración 0014).';


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
-- 1) El INSERT con RETURNING ya pasa. Como super_admin activo, con el JWT
--    real (no en el SQL Editor, donde auth.uid() es null):
--
--      POST /rest/v1/empresas?select=*   Prefer: return=representation
--      -> esperado: 201 y la fila devuelta
--      (antes: 403 con 42501)
--
-- 2) La lectura no cambia. Sigue devolviendo lo mismo que antes:
--
--      select id, nombre from public.empresas;         -- solo las vivas
--      select public.has_empresa_access('<uuid>');     -- true si toca
--
-- 3) El borrado lógico sigue retirando el acceso (no se ha relajado D7):
--
--      update public.empresas set deleted_at = now() where id = '<uuid>';
--      select public.has_empresa_access('<uuid>');     -- esperado: false
