# 01 — DECISIONES

Registro de decisiones de diseño y su razonamiento. **Añadir aquí cualquier decisión nueva**
que se tome en fases posteriores, para que sobreviva al cambio de chat.

---

## D1 — Se reconstruye desde cero, no se migra

La app original está publicada en Base44. Se reconstruye sobre Supabase.

**Por qué:** Base44 no permite "apuntar la base de datos a otro sitio". Su SDK de entidades
*es* el acceso a datos, y las funciones usan primitivas propias (`InvokeLLM`,
`ExtractDataFromUploadedFile`, `users.inviteUser`). No hay una capa que se pueda repuntar.
Además el usuario confirmó que se construye todo desde cero y no hay datos que preservar.

## D2 — Supabase Cloud para datos, EC2/Coolify para la app

**Por qué:** el usuario quiere explícitamente la base en la página de Supabase. EC2/Coolify
aloja el frontend y el worker de IA. Nota: se evaluó Supabase self-hosted en EC2 y se
descartó, pero el razonamiento queda en `99-NOTAS-DESCARTADAS.md` por si cambia de opinión.

## D3 — `numeric`, nunca float, para dinero

```sql
monto          numeric(20,8)
cantidad       numeric(28,10)
valor_unitario numeric(20,8)
precio_cierre  numeric(20,8)
variacion_pct  numeric(12,6)
```

**Por qué:** con `float`, `0.1 + 0.2 = 0.30000000000000004`. En una app financiera eso
acumula descuadres de centavos en los saldos. `numeric` es exacto. `numeric(20,8)` da 8
decimales, suficiente para satoshi (BTC tiene 8).

## D4 — Sin conversión de moneda; subtotales por moneda

La moneda es atributo de cada entidad (`cuentas.tipo_moneda`, `brokers.moneda`,
`wallets.tipo_moneda`). **Los resúmenes muestran una línea por moneda, sin total consolidado.**

**Por qué:** una cuenta en COP y una wallet en USDT no se pueden sumar. Un total único
exigiría una tabla `tipos_cambio`, una fuente externa de tasas, y decidir si se usa la tasa
del día o la del movimiento. El usuario confirmó que prefiere Opción A (subtotales).

**Consecuencia:** no existe `empresas.moneda_base` ni tabla `tipos_cambio`. Si algún día se
quiere un total consolidado, hay que añadir ambos y decidir la fecha de tasa.

## D5 — `cliente` es dueño con acceso completo

`cliente` puede crear cuentas, importar PDFs, exportar y editar movimientos. **No es solo
lectura.** El PRD lo describía ambiguamente como "dueño/visualizador"; el usuario confirmó
que es dueño con control operativo total.

## D6 — `cliente` y `contador` con los mismos permisos dentro de la empresa

Ambos roles escriben. `UserEmpresa.rol` es la única fuente de verdad de permisos por empresa,
lo que permite ser contador en una empresa y cliente en otra.

**Por qué:** mantener permisos distintos por rol hace el RLS difícil de razonar y auditar.
`app_role` queda reducido a `super_admin` vs `usuario`, y sirve solo para redirect post-login
(§11.2 del PRD) y las estadísticas del panel admin.

**Pendiente de confirmar:** si las operaciones destructivas (borrado en cascada de broker/banco)
se restringen a `contador` + `super_admin`, o las puede hacer también `cliente`. Por ahora,
con `deleted_at` (D7) el riesgo es menor.

## D7 — Borrado lógico con `deleted_at`

No se hace `DELETE` físico. Se marca `deleted_at = now()`, y un filtro por defecto en las
vistas/policies oculta las filas borradas.

**Por qué:** el PRD §15.4 borra en cascada un broker con todos sus movimientos, activos y
precios. Un clic equivocado en el sidebar del §11.3 destruye el histórico financiero sin
vuelta atrás. Con borrado lógico se recupera. Además deja el terreno listo para auditoría.

## D8 — Se eliminan los campos desnormalizados

Fuera: `empresa_nombre`, `banco_nombre`, `broker_nombre`, `cuenta_numero`, `wallet_direccion`.

**Por qué:** existen porque Base44 (Mongo) no hace joins. Postgres sí. Mantenerlos obliga a
`UPDATE` masivo sobre 8 tablas al renombrar una empresa, y cualquier fallo deja datos
incoherentes — en una app financiera, un reporte con totales mal.

**Cómo no romper el frontend:** **vistas** (`movimientos_view`, etc.) que hacen el JOIN y
devuelven los nombres que los componentes ya esperan, más un **adaptador** (`src/lib/db.js`)
que expone la misma forma que el SDK de Base44.

## D9 — `external_id` + índice único para deduplicar importaciones

```sql
create unique index movimientos_dedupe
  on public.movimientos (cuenta_id, external_id)
  where external_id is not null;
```

**Por qué:** el PRD no tiene nada que evite subir dos veces el mismo extracto. Hoy eso
duplicaría movimientos e inflaría saldos. Si el PDF no trae ID de transacción, se deriva un
hash de `(fecha, monto, tipo, descripcion)`.

## D10 — Se elimina `PendingUser`; invitaciones por trigger

Flujo nuevo:
1. Admin llama a una Edge Function `invitar-usuario`.
2. La función llama `auth.admin.inviteUserByEmail(email, { data: { full_name, app_role, estado, empresa_ids } })`.
3. Un trigger `on auth.users insert` crea el `profile` y las filas de `user_empresa`.

**Por qué:** desaparecen `PendingUser`, `checkInvitation` y `claimPendingUser` del PRD, y con
ellos el riesgo de que `claimPendingUser` corra dos veces o deje un `PendingUser` huérfano.
El trigger es **atómico**: no hay carrera entre "usuario creado" y "asignación aplicada".

**Requisito:** SMTP propio configurado en Supabase. El correo integrado está limitado a ~2/hora
y solo entrega de forma fiable a miembros del equipo — inservible para invitar clientes reales.

## D11 — Worker de IA en EC2, no Edge Functions

**Por qué:** las Edge Functions tienen tope de tiempo de reloj (~150s). Un extracto de 40
páginas puede acercarse o pasarlo, y no hay cola, ni reintentos, ni progreso. El worker en
EC2 lee de `import_jobs` (estado `pendiente`/`procesando`/`hecho`/`error`), reintenta solo,
escribe los movimientos y marca el job. El frontend hace polling.

**Beneficio extra:** historial de importaciones y visibilidad de errores, que el PRD no tiene.

## D12 — `wallet_saldos` como tabla aparte

```sql
create table wallet_saldos (
  wallet_id uuid references wallets(id),
  moneda    text not null,
  monto     numeric(20,8) not null default 0,
  primary key (wallet_id, moneda)
);
```

**Por qué:** `WalletEarnAssets` (§8.3) agrupa posiciones **por moneda** y calcula saldo por
cada una. Eso implica que una wallet (ej. Binance, proveedor `ambos`) tiene saldo simultáneo
en BTC, ETH y USDT. Un `wallets.monto` escalar no puede guardarlo.

## D13 — Precios desde API de mercado, no desde un LLM

**Por qué:** el PRD §9.4 pide a un LLM con `add_context_from_internet` que busque precios.
Es no determinista, más caro, y un precio equivocado corrompe `activos_broker.valor_unitario`
y todo el patrimonio del cliente. Una API de market data devuelve lo mismo, verificable.

**Nota:** el modelo `gemini_3_8_flash` que menciona el PRD **no es un modelo de Google** —
es un alias interno de Base44 y no existe fuera de ahí.

## D14 — RLS real en las 9 tablas financieras

El §14 del PRD marca "Abierto" para Banco, Cuenta, Movimiento, Broker, MovimientoBroker,
ActivoBroker, WalletProvider, Wallet, MovimientoWallet, y delega el aislamiento al frontend.

**Por qué no sirve:** la `anon key` de Supabase es pública por diseño (viaja en el bundle del
navegador). "Abierto" significa que cualquiera con la key lee los movimientos bancarios de
todas las empresas vía `curl` a `/rest/v1/movimientos`, ignorando el React. El filtrado en
frontend no protege nada.

**Implementación:** cuatro funciones `security definer` (`is_active_user`, `is_super_admin`,
`has_empresa_access`, `can_write_empresa`) que además rompen la recursión infinita de una
policy sobre `profiles` que consulte `profiles`.

**Efecto colateral positivo:** `estado: inactivo` deja de ser un bloqueo evitable en
`AuthContext` y pasa a ser innegociable en la base.
