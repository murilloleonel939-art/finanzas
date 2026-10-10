# Despliegue — esquema de Supabase

Guía para aplicar el esquema en un proyecto de Supabase nuevo, paso a paso.

## Requisitos

- El proyecto de Supabase Cloud creado (ya lo tienes).
- La extensión `pg_cron` disponible (viene por defecto en Supabase Cloud).
- Un usuario `super_admin` (se crea en el paso 5).

## Orden de ejecución

Las migraciones son **secuenciales**. Hay que ejecutarlas en orden:

| # | Archivo | Qué crea | Verificado |
|---|---|---|---|
| 1 | `0001_enums_e_identidad.sql` | 9 enums + `profiles`, `empresas`, `user_empresa` | ✓ |
| 2 | `0002_cuentas.sql` | `bancos`, `cuentas`, `movimientos` | ✓ |
| 3 | `0003_brokers.sql` | `brokers`, `movimientos_broker`, `activos_broker`, `precios_activo` | ✓ |
| 4 | `0004_wallets.sql` | `wallet_providers`, `wallets`, `wallet_saldos`, `movimientos_wallet` | ✓ |
| 5 | `0005_jobs_vistas.sql` | `import_jobs` + 7 vistas | ✓ |
| 6 | `0006_rls.sql` | Funciones helper + policies | ✓ |
| 7 | `0007_triggers_storage.sql` | Triggers, realtime, bucket, cron | ✓ |
| 8 | `0008_empresa_borrada_sin_acceso.sql` | El acceso se deriva del estado de la empresa (D19) | ✓ |
| 9 | `0009_precios_jobs.sql` | `precios_jobs` — cola de actualización de precios | ✓ |
| 10 | `0010_barrido_precios.sql` | `precios_barridos` — registro del barrido diario | ✓ |
| 11 | `0011_admin_logs.sql` | `admin_logs` + enum `admin_accion` | ✓ |
| 12 | `0012_admin_config.sql` | `admin_config` — configuración del sistema | ✓ |
| 13 | `0013_notificaciones.sql` | `notificaciones`, `notif_plantillas` y sus enums | ✓ |
| 14 | `0014_empresas_select_sin_autoconsulta.sql` | Arreglo: crear empresa fallaba con 42501 | ✓ |
| 15 | `0015_empresas_select_permite_borradas.sql` | Arreglo: borrar empresa fallaba con 42501 | revisar tras aplicar* |

> Las migraciones **0014** y **0015** corrigen dos fallos de RLS que solo aparecen con
> PostgREST. PostgREST evalúa la policy de SELECT sobre la fila resultante de un INSERT
> o UPDATE; si esa policy consulta la propia tabla, la fila que se está escribiendo aún
> no es visible y la sentencia aborta con `42501`. Al crear una empresa, la policy la
> consultaba a través de `has_empresa_access(id)` (0014); al borrarla, exigía
> `deleted_at is null` sobre la fila que el propio borrado acababa de marcar (0015).
> Ejecútalas en orden, después de la 0013.
>
> \* La 0015 está escrita y razonada a partir de la misma causa que la 0014 (medida en producción variando el cuerpo del PATCH), pero el borrado real con la policy nueva todavía no se ha ejecutado para confirmarlo: hazlo contra una empresa de prueba antes de darlo por cerrado.

### Verificación de integridad

```sql
select count(*) as tablas from pg_tables where schemaname = 'public';
-- Resultado: 15 ✓

select count(*) as vistas from information_schema.views where table_schema = 'public';
-- Resultado: 7 ✓

select count(*) as enums from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e';
-- Resultado: 9 ✓

select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by 1;
-- Resultado: todas con rowsecurity = true ✓
```

> Sin la **0008**, borrar una empresa la ocultaba del panel pero no retiraba el acceso a
> sus datos financieros a los usuarios asignados. Es un `create or replace function` de
> dos funciones, sin riesgo.

Todos los archivos son **idempotentes** donde es posible: se pueden volver a ejecutar sin
romper nada (`create table if not exists`, `drop policy if exists`, guardas en los enums).

## Paso a paso

### 1. Abrir el SQL Editor

En el dashboard de Supabase: **SQL Editor → New query**.

### 2. Ejecutar las migraciones 0001 a 0015

Una por una, en orden, pegando el contenido completo de cada archivo y pulsando **Run**.
No las ejecutes todas de golpe en un solo query: si una falla, quieres saber cuál.

Las migraciones **0014** y **0015** redefinen la policy `empresas_select`; la 0015 es la
que sustituye a la 0014, así que hay que ejecutar ambas y en ese orden.

### 3. Verificar que el esquema quedó bien

```sql
-- Deben aparecer 15 tablas
select tablename from pg_tables
where schemaname = 'public' order by 1;

-- Deben aparecer 7 vistas
select table_name from information_schema.views
where table_schema = 'public' order by 1;

-- Deben aparecer 9 enums
select typname from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e' order by 1;

-- Comprobar que TODAS las tablas tienen RLS activo (todas deben dar true)
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by 1;
```

### 4. Desactivar el registro público

**Auth → Providers → Email**: desactiva **"Enable email signups"**.

Motivo: según D10, los usuarios solo entran por invitación. Sin esto, cualquiera puede
registrarse. El trigger `handle_new_user` les crearía un profile sin ninguna empresa asignada;
no verían datos, pero es ruido innecesario y una superficie de ataque.

### 5. Crear el primer super_admin

**Paso 5a — Invítate a ti mismo.** En el dashboard: **Authentication → Users → Invite user**,
con tu email.

**Paso 5b — Acepta la invitación** y establece tu contraseña.

**Paso 5c — Elévate a super_admin.** Vuelve al SQL Editor:

```sql
update public.profiles
set app_role = 'super_admin'
where email = 'tu-email@dominio.com';

-- Verificar
select id, email, app_role, estado from public.profiles;
```

> El primer super_admin hay que crearlo así porque no existe todavía nadie que pueda
> invitar con ese rol. A partir de ahí, el panel de administración lo hace todo.

### 6. Configurar SMTP (obligatorio antes de invitar clientes)

**Requisito de D10.** El correo integrado de Supabase está limitado a ~2 por hora y solo
entrega de forma fiable a miembros del equipo. Con eso no se invita a un cliente real.

**Project Settings → Auth → SMTP Settings**: configura un proveedor transaccional
(Resend, Amazon SES, Postmark) con las credenciales y el remitente verificado.

Recuerda añadir los registros **SPF** y **DKIM** del dominio, o los correos caen en spam.

### 7. Configurar las URLs de Auth

**Project Settings → Auth → URL Configuration**:

- **Site URL:** `https://tu-dominio` (el de EC2/Coolify)
- **Redirect URLs:** añade `http://localhost:5173/**` (desarrollo) y
  `https://tu-dominio/**` (producción)

Sin esto, el login con Google y los enlaces de recuperación fallan.

### 8. Google OAuth (opcional, §11.1 del PRD)

**Auth → Providers → Google**: activa y pega Client ID y Secret de Google Cloud Console.
El redirect URI que hay que registrar en Google es el que muestra Supabase en esa pantalla.

### 9. Activar backups

El plan Free **no tiene backups** y **pausa el proyecto por inactividad**. Con datos
financieros reales eso no es defendible. Sube a Pro antes de cargar el primer dato real.

## Prueba de seguridad obligatoria

**No cargues datos reales sin hacer esto.** Es la verificación del RLS (D14).

1. Crea dos empresas: `Empresa A` y `Empresa B`.
2. Crea un usuario A asignado solo a A, y un usuario B asignado solo a B.
3. Como usuario A, inserta un banco y un movimiento en la empresa A.
4. Autentícate como usuario A y ejecuta:

```sql
select count(*) from public.movimientos;        -- solo los de A
select count(*) from public.movimientos_view;   -- solo los de A
select * from public.empresas;                  -- solo la empresa A
```

5. Intenta escribir en la empresa de B (debe **fallar**):

```sql
insert into public.bancos (empresa_id, pais, nombre_banco)
values ('<uuid-de-empresa-B>', 'CO', 'Prueba');
-- ERROR: new row violates row-level security policy for table "bancos"
```

6. Marca al usuario A como `inactivo` y comprueba que **no ve absolutamente nada**.

Si el paso 5 no falla, el RLS está mal y hay que revisarlo antes de seguir.

## Notas sobre las decisiones aplicadas

- **D8** — no hay columnas `empresa_nombre`, `banco_nombre`, etc. Las vistas de la migración
  0005 las devuelven por JOIN. El frontend lee de las vistas, no de las tablas base.
- **D7** — el borrado es lógico: se pone `deleted_at`. Las policies de SELECT ya filtran
  `deleted_at is null`, así que un registro borrado desaparece de la vista del usuario.
- **D12** — `wallets` no tiene `monto`; el saldo está en `wallet_saldos`, una fila por moneda.
- **D3** — todos los montos son `numeric`, nunca float.
