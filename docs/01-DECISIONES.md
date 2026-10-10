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

## D15 — El `rol` por empresa se asigna en la Edge Function, no en el trigger

El trigger `handle_new_user` (0007) crea los vínculos `user_empresa` con `rol = 'cliente'`
fijo. La Edge Function `invitar-usuario` **corrige el rol después**, en la misma petición.

**Por qué:** D6 dice que un usuario puede ser `contador` en una empresa y `cliente` en otra.
`raw_user_meta_data` es un objeto plano: se le puede pasar `empresa_ids: [...]` (una lista de
ids), pero no un rol **por** empresa sin inventar un formato y parsearlo en plpgsql. El
trigger sigue siendo quien **crea** los vínculos — eso mantiene la atomicidad de D10 y evita
la carrera entre "usuario creado" y "asignación aplicada" —, y la función solo ajusta el rol
y completa altas y bajas.

**Consecuencia:** si el ajuste falla, el usuario queda invitado con rol `cliente`. No se
revierte la invitación: el correo con el enlace ya salió y borrar la cuenta dejaría el enlace
roto. La función devuelve `aviso` y el panel lo muestra.

**Alternativa descartada:** pasar `empresas: [{id, rol}]` en los metadatos y expandirlo en
plpgsql. Funciona, pero mete lógica de negocio en un trigger y hace que un formato de payload
del cliente sea un requisito del esquema.

## D16 — Quitar una empresa es borrado lógico, no `DELETE`

`aplicarEmpresas()` pone `deleted_at = now()` en `user_empresa` para dar de baja un acceso, y
lo vuelve a `null` para reactivarlo.

**Por qué:** `user_empresa` ya tiene `deleted_at` (D7) y `has_empresa_access()` filtra por él.
Se conserva el histórico de quién tuvo acceso a qué empresa y cuándo se le retiró, que es
justo lo que hace falta para auditar un fraude. Un `DELETE` real deja al usuario borrado sin
rastro y convierte "¿tuvo acceso?" en una pregunta sin respuesta.

**Efecto:** `unique (user_id, empresa_id)` se respeta siempre (reactivar es un `UPDATE`), así
que no hay que lidiar con conflictos de clave al reasignar.

## D17 — Las Edge Functions autorizan con el JWT del llamante, no con `verify_jwt`

`config.toml` pone `verify_jwt = false` en las dos funciones. Cada una ejecuta
`requireSuperAdmin()`, que lee el header `Authorization`, verifica el token con
`auth.getUser()`, y exige `app_role = 'super_admin'` **y** `estado = 'activo'` en `profiles`
antes de construir el cliente con `service_role`.

**Por qué no sirve confiar solo en `verify_jwt`:** exige un JWT válido, pero **cualquier**
usuario autenticado del proyecto tiene uno — incluido un `cliente` de una empresa. Como la
función necesita `service_role` (que ignora el RLS) para llamar a `auth.admin`, un `cliente`
autenticado podría invitarse a sí mismo como `super_admin`. La puerta de entrada es la
comprobación del rol, no la validez del token.

**Por qué `verify_jwt = false` y no `true`:** con `true`, Supabase rechaza antes de ejecutar
el código y solo puede devolver un 401 genérico. Aquí interesa distinguir "no eres admin"
(403) de "tu sesión caducó" (401) para que la interfaz pueda decir qué pasa.

## D18 — Guarda del último `super_admin` en `actualizar-usuario`

La función impide quitarle el rol a un `super_admin` o desactivarlo si es el último
`super_admin` **activo**, y también que un administrador se desactive o se baje el rol **a sí
mismo**. Devuelve `409` con `codigo: 'ULTIMO_ADMIN'`.

**Por qué:** el trigger `proteger_campos_profile` de la 0006 se sale sin comprobar nada
cuando `auth.uid()` es `null` — y con `service_role` siempre es `null`. Esa condición de
salida es correcta para el trigger (los triggers internos deben poder escribir) pero deja
descubierto este camino. Sin la guarda, el panel puede quedarse sin ningún administrador
activo y no hay forma de recuperarlo desde la interfaz: habría que entrar al SQL Editor.

**Nota:** el camino directo desde el frontend (`profiles_update`) sí lo cubre el trigger,
porque ahí `auth.uid()` existe. Es decir, la comprobación hace falta exactamente donde el
trigger no llega.

## D19 — El acceso a los datos se deriva del estado de la empresa

`has_empresa_access()` y `can_write_empresa()` (migración 0008) exigen que la empresa
exista y que `deleted_at is null`, además de comprobar `user_empresa`.

**El fallo que corrige:** la 0006 comprobaba solo la fila de `user_empresa`. Borrar una
empresa (D7) la ocultaba del panel —`empresas_select` filtra `deleted_at`— pero **no
retiraba el acceso a nada más**: el usuario asignado seguía leyendo y escribiendo bancos,
cuentas, movimientos, brokers, wallets y precios, y el bucket `extractos` le seguía
sirviendo los PDFs. Con el `empresa_id` en el historial del navegador, bastaba una llamada
directa a la API REST. Es el mismo agujero que D14 cierra para el aislamiento entre
empresas, pero en el eje temporal: "empresa borrada" no era una frontera.

**Por qué derivar en vez de cascada:** la alternativa era recorrer bancos → cuentas →
movimientos → brokers → activos → precios → wallets → saldos marcando `deleted_at` en cada
fila. Son ~9 tablas y una transacción larga que puede fallar a medias, dejando una empresa
medio borrada. Derivar el acceso de la empresa es una condición en una función, se evalúa
en un lookup de índice por fila, y **restaurar es gratis**: al poner `deleted_at = null`
vuelve todo, sin reconstruir nada.

**Consecuencia:** borrar una empresa es un `UPDATE` de una fila. Y no hay cascada que
pueda quedar a medias.

**Nota:** aplica también al `super_admin`. Es coherente con lo que `empresas_select` ya
hacía en la 0006 para todos. Si más adelante hace falta una papelera para restaurar
empresas borradas desde la interfaz, se añade una vista o una función específica — no se
relajan estas dos.

## D20 — `earnConfig` clasifica Earn en el cliente, no en la base

**Qué:** `src/lib/earnConfig.js`. Los dos mecanismos del PRD §7 (palabras clave en la
descripción y lista `EARN_ALL_MOVEMENTS_PROVIDERS`) se aplican en el frontend, sobre la
descripción tal como llegó del extracto. La base no guarda ninguna marca `es_earn`.

**Por qué:** `descripcion` es texto libre (decisión D8 quitó los campos derivados, y esto lo
sería). Añadir una columna obligaría a recalcularla cada vez que se mejore la detección —y
se va a mejorar, porque depende de cómo redacten los proveedores— con un `UPDATE` masivo
sobre el histórico.

**Consecuencias, aceptadas a propósito:**

1. Una descripción mal escrita deja el movimiento **fuera** de Earn y el número no cuadra
   con lo que muestra el proveedor. Por eso `categoriaEarn()` es pública: la UI puede
   explicar por qué una fila se clasificó como se clasificó en vez de mostrar un total
   inexplicable.
2. Se añadieron las variantes en español (`suscripcion`, `interes`, `redencion`, `ahorro`)
   a las palabras del PRD. No es una ampliación de alcance: los extractos de proveedores de
   la región están en español, y sin ellas "Suscripción a producto Earn" se leería como un
   egreso normal y **"Total invertido" daría cero**.
3. La coincidencia es **por palabra completa**. `earnings` no cuenta como `earn`; con un
   `includes()` a secas, cualquier "earnings" bancario entraría como producto Earn.

**Nota:** `esInteres()` (regex `interes|interest|rendimiento|ganancia|yield`) es **más
amplia** que la palabra clave `interest` de Earn e incluye ingresos que no son productos
Earn. Son dos métricas distintas del PRD ("intereses ganados" frente a "total recompensas")
y no se deben mezclar.

## D21 — Bancos y proveedores: catálogos de ayuda, con centinelas «Otro»

**Qué:** `bancosPorPais.js` y `walletProviders.js` exportan listas y funciones
(`bancosDePais`, `proveedoresPorTipo`, `resolverNombreBanco`…) más un centinela
`'__otro__'` que **nunca se guarda** en la base. El valor que va a la base lo produce
`resolver*()`, que devuelve `null` si «Otro» quedó vacío.

**Por qué:** `bancos.nombre_banco` y `wallet_providers.nombre_proveedor` son texto libre;
el catálogo no valida nada. El centinela es solo del selector — sin esta separación, un
banco escrito a mano se guardaría literalmente como `__otro__`.

**Detalle del PRD §14 resuelto:** al listar los proveedores, los bloques «ambos»,
«cripto» y «fiat» se solapan (Binance sale en dos, PayPal en dos). `WALLET_PROVIDERS`
guarda **una entrada por proveedor**, con el tipo más amplio (`ambos`), porque el enum
`tipo_proveedor` no admite dos filas para el mismo nombre y duplicarlo mostraría la misma
opción dos veces. `proveedoresPorTipo('cripto')` sigue devolviendo los `ambos`, que es lo
que se espera al crear una wallet cripto.

**Decisión menor:** `bancosPorPais.js` incluye Costa Rica, Guatemala, Honduras y El
Salvador, que no están en la lista de 9 países del PRD §14. Una empresa registrada en un
país puede operar cuentas en otro, y la lista de bancos por país es del *banco*, no de la
empresa.

## D22 — `MonthFilter` parte la fecha como texto, sin pasar por `Date`

**Qué:** `claveMes()` hace `regex` sobre el string ISO en vez de `new Date(fecha)`.

**Por qué:** `fecha` es una columna `date` y llega como `'2026-10-01'`. `new Date()` la
interpreta como medianoche **UTC**; en Colombia (UTC-5) `toLocaleDateString` devolvería el
**30 de septiembre** y el movimiento aparecería en el mes equivocado —el mismo problema que
`formatFecha()` de la FASE 8 evita en el otro sentido. Un `date` no tiene hora: cortarlo
como texto es exacto y no depende de la zona del navegador.

## D23 — `db.js`: adaptador que lanza y filtra el borrado por ti

**Qué:** `src/lib/db.js` implementa la segunda mitad de D8. Registra cada fuente con dos
banderas —`borrado` (¿la tabla tiene `deleted_at`?) y `soloLectura` (¿es una vista?)— y
ofrece `listar / obtener / crear / crearMuchos / actualizar / borrar / contar / suscribir`.

**Por qué lanza en vez de devolver `{ data, error }`:** el SDK que reemplaza lanzaba, y
`supabase-js` no. Un `error` que se ignora se convierte en `data` nulo y la UI lo pinta
como "sin movimientos": un saldo vacío indistinguible de un fallo de red. En una app
financiera, un fallo silencioso es peor que uno ruidoso.

**Por qué decide él el filtro de borrado:** es el error clásico del borrado lógico (D7) —
olvidar `.is('deleted_at', null)` en una consulta nueva y que los registros borrados
reaparezcan dos fases después. Aquí el llamador no puede olvidarlo. Las vistas ya filtran
por dentro, así que el adaptador pide `deleted_at` **solo** cuando la fuente es una tabla:
pedirlo a una vista fallaría.

**Consecuencias:**

- El adaptador **no** rellena `empresa_id` ni `created_by`. Inventar la sesión en la capa
  de datos escondería un fallo de RLS detrás de un error de constraint.
- `borrar()` es lógico por defecto; físico donde la tabla no tiene la columna
  (`wallet_saldos`, `import_jobs`).
- `suscribir()` **avisa por consola** si la tabla no está en la publicación
  `supabase_realtime`. Es el fallo exacto que tuvo la FASE 12 al suscribirse a `ramas`: un
  canal que nunca emite y no dice por qué.

## D24 — Las tres ramas no existen: son constantes en el sidebar

**Qué:** El PRD §11.3 define tres módulos fijos (Bancos, Brokers, Proveedores de Wallet).
`obtenerRamas()` de `empresas-usuario.js` devuelve un array constante con `id`, `nombre`,
`ruta`, sin consultar BD. El sidebar de `EmpresaLayout` los pinta igual.

**Por qué:** No hay una tabla `ramas`. Una tabla vacía que solo sirve para listar tres
filas hardcodeadas es un anti-pattern: hace falta un índice, un RLS, triggers, y toda la
infraestructura de BD para algo que es invariante. Los módulos se definen una sola vez en
el código.

**Suscripciones realtime:** en vez de escuchar `ramas`, `suscribirseAModulos()` escucha
los tres tipos de cambios en `bancos`, `brokers` y `wallet_providers` (y es la que usa
`EmpresaLayout`).

**Consecuencia:** no hay «crear rama nueva». Las ramas no se crean; existen. La FASE 14 empieza
a poblar las tres.

## D25 — Validar el CHECK en el cliente y lanzar; nunca "arreglar" el dato

**Qué:** donde una migración define un CHECK que obliga a que dos campos sean coherentes,
la capa de datos lo comprueba **antes** del insert y **lanza** un error que nombra el campo
que falta. No lo normaliza ni lo completa.

**El caso concreto:** `movimientos_broker` tiene dos naturalezas en la misma tabla (0003):
*caja* (solo `monto`) y *operación* (`monto` + `cantidad` + `valor_unitario`). El CHECK
`mov_broker_cantidad_valor_coherentes` exige que `cantidad` y `valor_unitario` vengan **los
dos o ninguno**. La primera versión de `crearMovimientoBroker()` hacía esto:

```js
const esOperacion = cantidad != null && valorUnitario != null
// …y si no lo era, mandaba los dos a null
```

Ese `&&` "arreglaba" en silencio una operación a la que le faltaba un campo: la guardaba
como si fuera un depósito o un retiro, **perdiendo la cantidad y el valor unitario**. El
razonamiento documentado era "así no deja que Postgres la rechace con un mensaje que no
explica nada", pero el resultado era peor que el fallo que evitaba: en una app financiera,
una operación incompleta es un fallo del llamante y debe ser ruidoso (es el mismo principio
que D23), no convertirse en un movimiento de caja que nadie puede auditar después.

**Por qué no dejar que Postgres lance el 23514:** funciona, pero el mensaje no dice qué
campo falta y llega después de un viaje de red. La validación es la misma condición que el
CHECK, escrita en el cliente, con un mensaje que nombra el campo.

**Regla general:** un CHECK de la base es un contrato, no una sugerencia. El cliente puede
adelantarse a él para dar mejor error; lo que no puede es **satisfacerlo inventando** los
datos que faltan.

## D26 — `hoyLocal()`: escribir fechas en la zona del navegador, no en UTC

**Qué:** `src/lib/utils.js` exporta `hoyLocal()`, que devuelve el día del navegador como
`'YYYY-MM-DD'` usando `getFullYear/getMonth/getDate`. Es el valor por defecto de todos los
campos `fecha` de los formularios.

**Por qué:** los formularios precargaban la fecha con
`new Date().toISOString().slice(0, 10)`. `toISOString()` devuelve **UTC**: en Colombia
(UTC-5), a partir de las 19:00 locales ya es el día siguiente en UTC, así que el formulario
abría con **la fecha de mañana** —y el atributo `max` también la permitía—. Un movimiento
dado de alta de noche quedaba guardado con la fecha equivocada. No es un problema de
presentación: se escribe en la base.

**Es el tercer caso del mismo error, en tres direcciones distintas.** Vale la pena verlo
junto porque el proyecto ya lo había resuelto dos veces y volvió a aparecer:

| Dónde | Sentido | Qué se rompía | Decisión |
|---|---|---|---|
| `formatFecha()` (FASE 8) | leer | un alta de las 20:00 se mostraba con la fecha del día siguiente | corta el ISO y usa `Intl` |
| `MonthFilter.claveMes()` (FASE 13) | agrupar | `new Date('2026-10-01')` es medianoche UTC; en Bogotá el movimiento caía en septiembre | D22: cortar el string, sin `Date` |
| `hoyLocal()` (FASE 15) | **escribir** | el formulario precargaba la fecha de mañana | D26: componentes locales |

**Por qué es el peor de los tres:** los dos primeros mostraban mal un dato correcto. Este
**guarda un dato incorrecto**, y una `date` sin hora no se puede corregir después sin saber
en qué zona se escribió.

**Por qué `getFullYear()` y no `toLocaleDateString('sv-SE')` o similar:** los componentes
locales no dependen del locale del sistema ni de que exista una locale que devuelva ISO.
`toISOString()` es exacto pero en UTC; los componentes locales son exactos y en la zona
correcta.

**La columna `fecha` es `date`, no `timestamptz`:** no lleva hora ni zona. Guardar el día
que ve el usuario es la única interpretación defendible, y es la que el PRD da por supuesta
(«el movimiento del 3 de octubre»).

## D27 — Importación de PDFs con GPT-6 Luna en worker separado

La importación de extractos bancarios corre en un **worker Node.js en EC2/Coolify**, no en la Edge Function.

**Por qué:**
- **Tiempo:** procesar PDF + llamar a GPT-6 Luna tarda >30s, límite de Deno en Supabase.
- **Escalabilidad:** el worker puede reintentrar con backoff, sin bloquear al usuario.
- **Arquitectura:** jobs en tabla `import_jobs` + polling en UI mantiene todo desacoplado.

**Flujo:**
1. Usuario sube PDF en UI → Edge Function crea job (estado: `pendiente`)
2. Worker Lee jobs pendientes cada 10s → procesa PDF → actualiza `estado: hecho` o `error`
3. UI polling muestra progreso en tiempo real

**Deduplicación:** por `external_id` (proveedor + número de movimiento), retorna conteo de duplicados evitados.

**Reglas por proveedor:** `PROVIDER_RULES` en `imports-prompts.js` permite adaptar el prompt a Coindepo, Nomina, etc.

## D28 — Precios de mercado: Yahoo Finance + worker polling

La actualización de precios (FASE 18) usa **Yahoo Finance API** con un **worker en Node.js en EC2/Coolify**.

**Por qué Yahoo Finance:**
- Acciones, ETFs y criptos en un solo endpoint
- Sin API key (público, rate limits generosos ~200 req/min)
- Alternativas evaluadas:
  - Finnhub: acciones y criptos, pero requiere API key ($)
  - Alpha Vantage: acciones y forex, limitado a 5 req/min (free tier)
  - Yahoo: mejor relación features/costo/disponibilidad

**Arquitectura:**
- **Worker Node.js:** corre en EC2/Coolify, polling cada 5 minutos (`worker-precios.mjs`)
- **Endpoint:** `https://query1.finance.yahoo.com/v8/finance/chart`
  - Se descarta `v7/finance/quote` (D29): exige `crumb` + cookie de sesión, se rompe cada pocos meses
  - **No hay batch:** `v8/chart` es un símbolo por petición. La concurrencia se limita a 5 con un pool propio
- **Normalización:** tickers sin moneda (BTC → BTC-USD), case-insensitive
- **Upsert:** registra precio por (activo_id, fecha); la fecha sale de la última vela de Yahoo, no del reloj
- **Actualización en cascada:** cada nuevo precio actualiza `activos_broker.valor_unitario`

**Cola de trabajos (D30):**
- La Edge Function no sincroniza: solo encola en `precios_jobs`
- El worker procesa la cola y el barrido periódico

**Tablas:**
- `precios_activo`: historial de cierre, anterior, variación %
- `activos_broker.valor_unitario`: el precio más reciente

**Edge Function:** `actualizar-precios` (POST)
- Exige JWT válido y `is_super_admin()` (via `_shared/auth.ts`)
- Valida que `empresa_id` exista y que `broker_id` pertenezca a la empresa
- Encola el trabajo y devuelve el job; no llama a Yahoo

**Recuperación de errores:**
- Si un ticker falla, continúa con los demás (sin transacción bloqueante)
- Logging de errores por ticker para diagnóstico
- Reintento automático cada 5 minutos (polling natural)

**Limitaciones conocidas:**
- No hay cron SQL en Supabase Cloud (D13). El worker es el reemplazo.
- Yahoo no documenta públicamente la API (ingeniería inversa), pero es estable en producción.
- Requiere `@supabase/supabase-js@2.43.4+` en el worker.

---

## D29 — El ticker no basta: hay que validar QUÉ es el activo

`LINK` es **a la vez** Interlink Electronics (acción, ~$5) y Chainlink (cripto, ~$18).
Un mismo ticker puede existir en dos mercados distintos, y Yahoo devuelve el que le
parezca si no se le dice cuál se quiere.

**La regla:** la clave de deduplicación es `(tipo_activo, ticker)`, nunca el ticker solo.
`claveActivo(tipoActivo, ticker)` construye esa clave, y `validarTicker()` comprueba el
`instrumentType` que devuelve Yahoo contra el `tipo_activo` guardado:

| `tipo_activo` | `instrumentType` aceptado |
|---|---|
| `accion` | `EQUITY`, `ETF` |
| `cripto` | `CRYPTOCURRENCY` |
| `bono` | `BOND`, `MUTUALFUND` |

Sin esta validación el sistema no falla: **escribe un precio equivocado** y la posición
aparece valorada con el precio de otro activo. Es el error más caro de detectar después,
porque nada avisa.

**Dónde vive:** `src/lib/yahoo-finance.js` (`claveActivo`, `validarTicker`, `ErrorTicker`).

---

## D30 — Cola de trabajos en lugar de sincronizar dentro de la Edge Function

El botón «actualizar precios ahora» **no actualiza nada**: encola un `precios_jobs` y
devuelve el job. El worker de EC2 hace el trabajo.

**Por qué:**
- Las Edge Functions de Supabase cortan a ~150 s. Una empresa con 100+ activos no termina.
- `v8/chart` es de un símbolo por petición (D28), así que el tiempo crece linealmente.
- El worker no tiene límite de tiempo y puede reintentar.

**Consecuencias:**
- El usuario ve el progreso por Realtime, no en la respuesta HTTP.
- El estado real vive en `precios_jobs.estado` (`pendiente` → `procesando` → `completado`/`error`).
- El worker recupera jobs que quedaron colgados en `procesando` si se reinició a mitad.

Reutiliza el patrón ya probado en D27 (`import_jobs`).

**Dónde vive:** `supabase/migrations/0009_precios_jobs.sql`, `supabase/functions/actualizar-precios/index.ts`, `worker-precios.mjs`.

## D31 — El barrido de precios es diario, no cada vuelta

El worker actualiza **todos los activos una sola vez al día** a las 16:00 de Colombia (después
del cierre de mercados de EE. UU., en cualquier horario de verano/invierno). La cola del botón
(D30) se atiende cada 5 minutos.

**Problema anterior:** El worker barría **cada 5 minutos** (~288 barridos al día), escribiendo casi
siempre el mismo precio. Desperdiciaba cuota de Yahoo Finance.

**Solución:**
1. **Nueva tabla `precios_barridos`** (migración 0010): Una fila por día con índice único por fecha.
   Si dos workers arrancan a la vez, el segundo choca con el índice y se retira.
2. **Funciones puras en `src/lib/programacion.js`**: Calculan la hora en `America/Bogota` usando
   `Intl` (no hardcodean desfase), y deciden si toca barrer: `partesEnZona()`, `tocaBarrer()`.
3. **Recuperación automática**: Si el worker está apagado a las 16:00, el barrido no se pierde. En
   la primera vuelta después, detecta que pasó la hora y que hoy no hay fila en `precios_barridos`,
   y retoma el trabajo.

**Variables de entorno nuevas:**
```bash
BARRIDO_HORA=16:00           # Hora del barrido (formato 24 h)
BARRIDO_TZ=America/Bogota    # Zona IANA (resuelta con Intl)
SIN_BARRIDO=1                # (Opcional) Solo atiende cola
SIN_COLA=1                   # (Opcional) Solo barre
```

**Deploy:**
- Systemd: `deploy/worker-precios.service` + `/etc/worker-precios.env` (recomendado).
- Cron: `deploy/worker-precios.cron` + `/etc/worker-precios.env` (alternativa).

**Importante:** El barrido lo decide el worker leyendo la hora en la zona correcta, **no el
scheduler (cron/systemd)**. Por eso no hay una línea «a las 16:00 barre» en el cron — evita
contradicciones si el servidor cambia de zona horaria. El cron solo despierta al worker cada 5
minutos; es el worker quien mira si toca barrer.

**Recuperación de fallos:** Un barrido que muere deja la fila en `procesando`. En la siguiente
vuelta (5 min después), `recuperarBarridosColgados()` borra filas de hace 30+ minutos en estado
`procesando`, liberando espacio para reintentar.

**Dónde vive:** `src/lib/programacion.js`, `src/lib/precios-datos.js` (métodos nuevos),
`worker-precios.mjs` (lógica de `intentarBarrido()` y guard en `vuelta()`),
`supabase/migrations/0010_precios_barridos.sql`, `deploy/worker-precios.{service,cron,env.example}`.

---

## D32 — Exportación de datos en CSV, Excel y PDF

El usuario necesita extraer sus datos en múltiples formatos sin salir de la app. Cada página
de detalle (cuentas, wallets, brokers) tiene un botón «Exportar» que abre un menú con tres
opciones: CSV, Excel, PDF.

**Componente `ExportButtons.jsx`:**
- Props: `datos` (array), `columnas` (array de keys), `nombreArchivo` (string), `disabled` (bool)
- Métodos:
  - `exportarCSV()`: genera UTF-8 con BOM, descarga `*.csv`
  - `exportarExcel()`: genera XLSX binario (con formato), descarga `*.xlsx`
  - `exportarPDF()`: genera PDF con tabla, descarga `*.pdf`
- Se deshabilita si no hay datos o si el usuario es `readonly`

**Integración:**
- `CuentaDetail.jsx`: exporta movimientos (columnas: fecha, concepto, monto, saldo)
- `WalletDetail.jsx`: exporta transacciones de la wallet (columnas: fecha, tipo, cantidad, precio)
- `BrokerDetail.jsx`: exporta posiciones (columnas: activo, cantidad, precio unitario, total)

**Librerías:**
- CSV: genera el contenido, no usa dependencias externas
- Excel: usa `xlsx` (ya en `package.json` si no, instalar `npm install xlsx@latest`)
- PDF: usa `pdfkit` o similar (alternativa: genera tabla HTML y usa `html2pdf`)

**Nota:** Los formatos no incluyen gráficos; son tablas. Si en el futuro se necesitan gráficos
en PDF, se añade una opción separada «Exportar informe» que incluye resúmenes y visuales.

**Dónde vive:** `src/components/ExportButtons.jsx`, integraciones en `src/pages/{Cuenta,Wallet,Broker}Detail.jsx`.

---

## D33 — Programación de actualización automática con cron

El barrido diario (D31) solo actualiza precios si el worker está corriendo. Para garantizar
que se ejecuta a las 16:00 (4 PM, hora Colombia) todos los días, se usa **cron del sistema**
(Linux) o **systemd timer** (alternativa moderna).

**Opción A: Cron del sistema (más simple):**
```
0 21 * * * /usr/bin/node /home/ec2-user/finanzas/worker-precios.mjs
```
- `0 21` = 21:00 UTC = 16:00 UTC-5 (Colombia)
- Se ejecuta **una sola vez al día**
- Si se pierde (servidor apagado), no se recupera hasta mañana
- Log a `/var/log/worker-precios.log` con `>>` redirect

**Opción B: Systemd timer (recomendado):**
- Archivo `deploy/worker-precios.service`: unidad que corre el worker
- Archivo `deploy/worker-precios.timer`: triggers diarios a las 16:00 Colombia
- `systemctl enable --now worker-precios.timer` lo deja permanente
- Si el servidor estaba apagado a las 16:00, systemd recupera el barrido dentro de 5 minutos

**Script setup:** `scripts/cron-setup.sh`
- Detecta si ya existe un cron para `worker-precios.mjs`
- Crea el directorio `logs/` si no existe
- Añade o reemplaza la entrada cron
- Imprime el comando para verificar: `crontab -l | grep worker-precios`

**Variables de entorno requeridas:**
```bash
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
POLL_INTERVAL_MS=300000        # 5 minutos entre intentos de cola
BARRIDO_HORA=16:00
BARRIDO_TZ=America/Bogota
```

**Dónde vive:** `scripts/cron-setup.sh`, `deploy/worker-precios.{service,timer}`, documentación
en `FASE19.md`.
