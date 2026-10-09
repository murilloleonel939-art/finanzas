# 02 — PLAN POR FASES

Construcción por fases **pequeñas y autocontenidas**, para poder cortar en cualquier momento
y continuar en un chat nuevo sin perder contexto.

**Regla:** al terminar una fase, marcar `[x]` aquí y hacer commit. Si se agota el presupuesto
de tokens a mitad de una fase, apuntar el estado exacto en la sección "En curso" al final.

---

## Estado global

- **Fase actual:** FASE 14 (arranca tras corregir la FASE 12)
- **Fases completadas:** 12 de 21 — backend + scaffold + auth + admin + catálogos
  (la FASE 12 quedó **incompleta** y sus correcciones son previas a la 14)
- **Verificado en Supabase (FASE 11):** 
  - 15 tablas con RLS activo ✓
  - 4 funciones helper ✓
  - 7 vistas con `security_invoker = true` ✓
  - 11 tablas publicadas para realtime ✓
  - Bucket `extractos` privado ✓
  - Migración 0008 aplicada ✓
  - Backend íntegramente verificado ✓
- **Bloqueante próximo:** las Edge Functions de la FASE 10 están escritas y el
  frontend compila, pero **falta desplegarlas** y tener SMTP propio para que las
  invitaciones lleguen. Ver `supabase/functions/README.md`.
- **Pendientes del usuario** (no bloquean hasta la fase indicada):
  - Desplegar las Edge Functions + SMTP propio → para probar invitaciones reales (FASE 10)
  - Proveedor de IA para extracción de PDFs → FASE 17
  - API de mercado para precios → FASE 18
  - Plan de Supabase (Pro, por los backups) → antes de datos reales
  - Recurso en Coolify con las variables `VITE_*` de build → FASE 20

---

## FASE 0 — Estructura y documentación ✅

- [x] Crear estructura de carpetas (`docs/`, `supabase/migrations/`)
- [x] `docs/00-CONTEXTO.md` — documento de handoff entre chats
- [x] `docs/01-DECISIONES.md` — registro de decisiones y razonamiento
- [x] `docs/02-PLAN.md` — este archivo
- [x] `docs/03-PROMPT-CONTINUACION.md` — texto para pegar en chat nuevo

**Entregable:** documentación base. Sin código todavía.

---

## FASE 1 — Esquema SQL: enums + identidad

**Archivo:** `supabase/migrations/0001_enums_e_identidad.sql`

- [x] Extensiones necesarias (`pgcrypto` para `gen_random_uuid()`)
- [x] Enums: `app_role`, `estado_usuario`, `estado_empresa`, `rol_empresa`,
      `tipo_cuenta`, `tipo_movimiento`, `tipo_activo`, `tipo_proveedor`, `estado_job`
- [x] Tabla `profiles` (1:1 con `auth.users`)
- [x] Tabla `empresas`
- [x] Tabla `user_empresa`
- [x] Índices y constraints

**Entregable:** 3 tablas + enums. Verificable creando registros a mano en el SQL Editor.

---

## FASE 2 — Esquema SQL: cuentas bancarias

**Archivo:** `supabase/migrations/0002_cuentas.sql`

- [x] Tabla `bancos`
- [x] Tabla `cuentas`
- [x] Tabla `movimientos`
- [x] `external_id` + índice único de deduplicación
- [x] `deleted_at` en las tres
- [x] `created_at`, `updated_at`, `created_by`

**Entregable:** rama de cuentas bancarias completa.

---

## FASE 3 — Esquema SQL: brokers

**Archivo:** `supabase/migrations/0003_brokers.sql`

- [x] Tabla `brokers`
- [x] Tabla `movimientos_broker`
- [x] Tabla `activos_broker`
- [x] Tabla `precios_activo`
- [x] Índices y constraints

**Entregable:** rama de brokers completa.

---

## FASE 4 — Esquema SQL: wallets

**Archivo:** `supabase/migrations/0004_wallets.sql`

- [x] Tabla `wallet_providers`
- [x] Tabla `wallets`
- [x] Tabla `wallet_saldos` (decisión D12)
- [x] Tabla `movimientos_wallet`
- [x] Índices y constraints

**Entregable:** rama de wallets completa.

---

## FASE 5 — Esquema SQL: jobs, vistas e índices

**Archivo:** `supabase/migrations/0005_jobs_vistas.sql`

- [x] Tabla `import_jobs` (decisión D11)
- [x] Vistas con JOIN que devuelven los campos desnormalizados (decisión D8):
      `movimientos_view`, `cuentas_view`, `movimientos_broker_view`, `activos_broker_view`,
      `movimientos_wallet_view`, `wallets_view`
- [x] Índices de rendimiento sobre `empresa_id`, `fecha`, FKs

**Entregable:** esquema completo. **Aquí ya se puede crear el proyecto Supabase.**

---

## FASE 6 — RLS

**Archivo:** `supabase/migrations/0006_rls.sql`

- [x] Funciones helper: `is_active_user()`, `is_super_admin()`, `has_empresa_access()`,
      `can_write_empresa()` (decisión D14)
- [x] `enable row level security` en todas las tablas
- [x] Policies de SELECT y escritura en las 13 tablas
- [x] Policy especial admin-only para `precios_activo` (lectura abierta a la empresa)
- [x] Policies de admin-only para `empresas`, `user_empresa`, `import_jobs`

**Entregable:** aislamiento por empresa real. **Test obligatorio** con dos usuarios de
empresas distintas verificando que no se ven datos cruzados.

---

## FASE 7 — Triggers y storage

**Archivo:** `supabase/migrations/0007_triggers_storage.sql`

- [x] Trigger `on auth.users insert` → crea `profiles` + `user_empresa` (decisión D10)
- [x] Trigger `updated_at` automático
- [x] Añadir tablas a la publicación `supabase_realtime`
- [x] Bucket `extractos` **privado** (ruta `{empresa_id}/{archivo}.pdf`)
- [x] Policies de `storage.objects` sobre el helper de acceso a empresa
- [x] `pg_cron` para actualización programada de precios

**Entregable:** backend completo y funcional.

---

## FASE 8 — Scaffold frontend

**Archivos:** `package.json`, `vite.config.js`, `tailwind.config.js`, `index.html`, `src/`

- [x] Vite + React 18 + Tailwind + shadcn/ui + lucide-react
- [x] react-router-dom v6 con todas las rutas del §11.1
- [x] `src/lib/supabase.js` — cliente Supabase
- [x] `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [x] Layout base y tema

**Entregable:** app que arranca en local con una ruta de prueba.

---

## FASE 9 — Auth

- [x] `AuthContext` con manejo de `estado: inactivo`
- [x] `Login`, `Register`, `ForgotPassword`, `ResetPassword`
- [x] `ProtectedRoute` (y variante admin)
- [x] `Home.jsx` con redirect según rol (§11.2)
- [x] Google OAuth

**Entregable:** login/logout funcional contra Supabase Auth.

---

## FASE 10 — Invitaciones y gestión de usuarios ✅

- [x] Edge Function `invitar-usuario` (usa `service_role`)
- [x] Edge Function para actualizar `app_role` / `estado`
- [x] `UsuariosPage` + `UsuarioDialog`
- [x] Asignación de empresas (crea/elimina `user_empresa`)

**Entregable:** el admin invita y el usuario entra con su asignación aplicada.

**Prerequisito:** SMTP propio configurado (decisión D10).
**Estado:** código entregado y compilando. **Falta desplegar** las funciones con
`supabase functions deploy` (requiere el login del CLI) y configurar el SMTP.

**Archivos:**

```
supabase/config.toml                        verify_jwt=false + por qué es seguro (D17)
supabase/functions/README.md                guía de despliegue y diagnóstico
supabase/functions/_shared/cors.ts          cabeceras CORS compartidas
supabase/functions/_shared/auth.ts          requireSuperAdmin() — la puerta de entrada
supabase/functions/_shared/empresas.ts      validar/asignar empresas + guarda del último admin
supabase/functions/invitar-usuario/index.ts
supabase/functions/actualizar-usuario/index.ts
src/lib/usuarios.js                         capa de datos (invoca las funciones)
src/pages/UsuariosPage.jsx                  lista, buscador, estadísticas, reenvío
src/components/UsuarioDialog.jsx            alta y edición + asignación por empresa
src/components/AdminLayout.jsx              marco de /admin (mínimo; FASE 11 lo completa)
src/components/ui/                          + dialog, select, checkbox, badge
```

**Decisiones nuevas:** D15 (el rol por empresa se ajusta en la función, no en el trigger),
D16 (quitar una empresa es borrado lógico), D17 (autorización propia en vez de
`verify_jwt`), D18 (guarda del último `super_admin`).

**Sin migración nueva.** Se revisó la 0006 y las policies de `profiles` y `user_empresa`
ya cubren todo lo que necesita la fase: el super_admin lee y escribe ambos, y el trigger
`proteger_campos_profile` impide que un no-admin se cambie el rol desde el frontend. No
hizo falta 0008.

---

## FASE 11 — Panel de administración ✅

- [x] `AdminLayout` + navegación
- [x] `AdminDashboard` con estadísticas (conteos, no sumas de dinero)
- [x] `EmpresasPage` + `EmpresaDialog` (CRUD completo)

**Entregable:** el super admin gestiona empresas y ve el dashboard.

**Archivos:**

```
supabase/migrations/0008_empresa_borrada_sin_acceso.sql   ← ver nota abajo
src/lib/admin.js               estadísticas (conteos) + empresas recientes
src/lib/empresas.js            CRUD de empresas con filtro de borrado centralizado
src/lib/paises.js              catálogo de países ISO + opción «Otro»
src/pages/AdminDashboard.jsx   tarjetas, aviso accionable, empresas recientes
src/pages/EmpresasPage.jsx     tabla, buscador, filtro por estado, 4 contadores
src/components/EmpresaDialog.jsx  alta/edición/borrado con confirmación
src/App.jsx                    las 3 rutas de /admin ya apuntan a componentes reales
```

**Decisión nueva:** D19 (el acceso se deriva del estado de la empresa).

**SÍ hace falta migración nueva: la 0008.** Al construir el borrado de empresas
apareció un hueco real en la 0006, no una preferencia:

`has_empresa_access()` y `can_write_empresa()` solo miraban la fila de `user_empresa`;
ninguna comprobaba si la **empresa** seguía viva. Con borrado lógico (D7), borrar una
empresa la ocultaba del panel (porque `empresas_select` sí filtra `deleted_at`) pero
**dejaba a sus usuarios leyendo y escribiendo todos sus datos financieros**, y con el
bucket `extractos` sirviéndoles los PDFs. Es decir: "borrar" una empresa no le quitaba
el acceso a nadie.

La 0008 añade la comprobación de la empresa a las dos funciones. Efecto deseado:
restaurar una empresa devuelve el acceso a todo su contenido sin tocar ninguna fila
hija, así que borrar una empresa **no necesita cascada** de borrados lógicos. La 0006
ya aplicada no se toca.


---

## FASE 12 — Workspace y sidebar de empresa ⚠️ INCOMPLETA

- [x] `Workspace` (lista de empresas asignadas) ← funciona
- [ ] `EmpresaLayout` con sidebar jerárquico (§11.3)
      ⚠️ construido sobre una tabla `ramas` que **no existe** en el esquema
      (ni en el PRD). Todos sus enlaces apuntan a rutas inexistentes.
- [ ] Suscripciones realtime
      ⚠️ se suscribe a `empresas` y `ramas`; ninguna está en la publicación
      `supabase_realtime` (la 0007 solo publica las 11 tablas financieras).
- [ ] Diálogos de confirmación para borrado
      ⚠️ `ConfirmDialog.jsx` existe pero no está usado en ningún sitio.
- [ ] `EmpresaOverview` con **subtotales por moneda** (decisión D4)
      ⚠️ consulta `wallet_saldos_view`, que no existe; y suma
      `valor_unitario` en vez de `valor_total`.

**Entregable:** no alcanzado. Ver correcciones pendientes antes de FASE 13.

> Nota: la verificación de esta fase destapó que la documentación generada
> bajo `docs/FASE-12-*.md` y `FASE-12-*.txt` describe archivos, hooks y rutas
> que no existen. Descartar esa documentación.

---

## FASE 13 — Catálogos y utilidades ✅

- [x] `src/lib/bancosPorPais.js` — 9 países del PRD + 4 de Centroamérica, opción «Otro»
- [x] `src/lib/walletProviders.js` — cripto / fiat / ambos, opción «Otro»
- [x] `src/lib/monedas.js` — cripto y fiat, defaults alineados con el esquema
- [x] `src/lib/earnConfig.js` — clasificación Earn, métricas y activos por moneda
- [x] `src/components/shared/MonthFilter.jsx` — Select + 3 funciones puras
- [x] `src/lib/db.js` — adaptador con forma del SDK de Base44 (decisión D8)

**Entregable:** alcanzado. Sin páginas nuevas: son piezas compartidas.

**Archivos:**

```
src/lib/bancosPorPais.js              bancosDePais, tieneCatalogo, resolverNombreBanco
src/lib/walletProviders.js            proveedoresPorTipo, tipoDeProveedor, claveProveedor
src/lib/monedas.js                    MONEDAS_CRIPTO/FIAT, formatearMonto, MONEDA_DEFECTO
src/lib/earnConfig.js                 esMovimientoEarn, esInteres, resumenEarn,
                                      activosEarnPorMoneda, categoriaEarn
src/components/shared/MonthFilter.jsx getMesesDisponibles, formatMes, filtrarPorMes
src/lib/db.js                         listar/obtener/crear/crearMuchos/actualizar/
                                      borrar/contar/suscribir
```

**Decisiones nuevas:** D20 (Earn se clasifica en el cliente), D21 (catálogos con centinela
«Otro», un proveedor por nombre), D22 (el mes se corta del string, no con `Date`),
D23 (`db.js` lanza y aplica el filtro de borrado por ti).

**Sin migración nueva.** La fase no toca el esquema: `pais`, `nombre_banco`,
`nombre_proveedor` y `tipo_moneda` ya son texto libre en las migraciones 0002-0004, y
`earnConfig` deriva todo de `descripcion`. El adaptador lee de las 7 vistas de la 0005 y
escribe en las tablas, todo ya cubierto por el RLS de la 0006.

**Verificado:** `npm run build` compila (627 KB, 183 KB gzip; +11 KB sobre la FASE 11). Se
añadió un bundle de comprobaciones (23 casos: bancos, monedas, proveedores, Earn con las
métricas del PRD §7, MonthFilter) y un doble del cliente de Supabase para `db.js` (filtro de
borrado automático, rango de fechas, paginación, rechazo de escritura en vistas, aviso de
realtime). **Los dos archivos de prueba son temporales (`/tmp`) y no se han añadido al
repo:** el proyecto no tiene runner de tests todavía.

**Nota sobre `db.js`:** está escrito y verificado, pero **ningún módulo lo usa aún**. Las
fases 14-16 son quienes deben llamarlo; si al construir `CuentaDetail` resulta que estorba
en vez de ayudar, hay que decirlo y ajustarlo entonces, no arrastrarlo.

---

## FASE 14 — Módulo cuentas bancarias

- [ ] `CrearBanco` (con opción "Otro")
- [ ] `CrearCuenta`
- [ ] `CuentaDetail` con tarjetas, MonthFilter, tabla paginada
- [ ] Formulario de movimiento manual
- [ ] Eliminación con confirmación

**Entregable:** rama de cuentas operable de punta a punta.

> **Antes de empezar la FASE 14:** las correcciones pendientes de la FASE 12
> (`EmpresaLayout` construido sobre una tabla `ramas` inexistente, `EmpresaOverview`
> consultando `wallet_saldos_view`, que no existe). La rama de cuentas se monta **dentro**
> de ese layout, así que si sigue roto, la FASE 14 hereda el problema.


---

## FASE 15 — Módulo brokers

- [ ] `CrearBroker` (con opción "Otro")
- [ ] `BrokerDetail` con 3 pestañas (Movimientos / Activos / Precios)
- [ ] Cálculo de valor total por posición
- [ ] Eliminación con confirmación

**Entregable:** rama de brokers operable.

---

## FASE 16 — Módulo wallets + Earn

- [ ] `CrearWalletProvider` (con opción "Otro")
- [ ] `CrearWallet`
- [ ] `WalletDetail` — **dos variantes** según proveedor (decisión del §8.4):
      pantalla única para "todo es Earn" (Coindepo), con pestañas para el resto
- [ ] `WalletEarn` — resumen, activos por moneda, tabla
- [ ] `WalletEarnAssets`
- [ ] Cálculo de intereses ganados (regex `esInteres`)

**Entregable:** rama de wallets con tratamiento Earn completo.

---

## FASE 17 — Importación de PDFs

- [ ] Worker en EC2/Coolify (decisión D11)
- [ ] Edge Function que crea el job y sube a Storage
- [ ] Prompt de extracción con reglas críticas (§9.1)
- [ ] `providerRules.ts` extensible
- [ ] Filtro de status (`complete`/`completed`)
- [ ] Deduplicación vía `external_id`
- [ ] Importación de brokers (`importarBrokerDatos`)
- [ ] UI de progreso con polling sobre `import_jobs`

**Entregable:** subir un PDF y ver los movimientos creados, sin duplicados.

**Bloqueante:** requiere elegir proveedor de IA (Anthropic / OpenAI / Gemini) y tener API key.

---

## FASE 18 — Actualización de precios

- [ ] Integración con API de mercado (decisión D13)
- [ ] Cálculo de `variacion_pct`
- [ ] Actualización de `activos_broker.valor_unitario`
- [ ] Historial en `precios_activo`
- [ ] Job programado con `pg_cron`

**Entregable:** precios actualizados automáticamente.

**Bloqueante:** requiere API key de market data (Finnhub / Alpha Vantage / Yahoo).

---

## FASE 19 — Exportación

- [ ] `src/lib/exportUtils.js` — CSV, Excel, PDF
- [ ] Integración en `CuentaDetail` y `WalletDetail`

**Entregable:** exportaciones funcionando.

---

## FASE 20 — Deploy en EC2/Coolify

- [ ] Dockerfile del frontend (build estático + nginx)
- [ ] Recurso en Coolify
- [ ] Variables de entorno en el build (`VITE_*` se incrustan en build time)
- [ ] Añadir dominio de EC2 a la config de Auth de Supabase (CORS)
- [ ] Verificar región alineada entre EC2 y Supabase
- [ ] Worker de IA como recurso aparte en Coolify
- [ ] Backups de Supabase activados

**Entregable:** app en producción.

---

## En curso (actualizar si se corta a mitad de fase)

**FASE 13 cerrada.** La siguiente es la **FASE 14** (módulo de cuentas bancarias:
`CrearBanco`, `CrearCuenta`, `CuentaDetail`, formulario de movimiento manual y borrado con
confirmación).

**Antes de la FASE 14 hay que cerrar la FASE 12**, que quedó a medias y es la que da el
marco donde vive el módulo de cuentas:

1. `EmpresaLayout` está construido sobre una tabla `ramas` que no existe. Hay que rehacerlo
   sobre `bancos` / `brokers` / `wallet_providers`, que son las tres ramas reales, y
   apuntar sus enlaces a las rutas del PRD §10 (ninguna de las actuales existe).
2. Las suscripciones realtime se hacen sobre `empresas` y `ramas`. Debe ser sobre las 11
   tablas de la publicación (mejor vía `db.suscribir()`, que avisa si la tabla no está
   publicada).
3. `EmpresaOverview` consulta `wallet_saldos_view`, que no existe, y suma
   `valor_unitario` en vez de `valor_total`. Lo correcto es `wallets_view` (que ya trae
   `saldo_total`) y `activos_broker_view` (que ya trae `valor_total`), y subtotales por
   moneda (D4).
4. `ConfirmDialog.jsx` existe sin usarse en ningún sitio. La FASE 14 lo necesita para el
   borrado de cuentas.

Nada de esto requiere migración nueva: las tablas y las vistas ya están aplicadas.

### Lo que le toca al usuario AHORA (no es bloqueante para FASE 12, pero lo es para probarla)

1. **Desplegar las Edge Functions** (necesarias para FASE 10). Requiere `supabase login`:
   ```bash
   supabase functions deploy invitar-usuario    --project-ref obxedjpnusceyizcdbvc
   supabase functions deploy actualizar-usuario --project-ref obxedjpnusceyizcdbvc
   ```
2. **Configurar SMTP propio** (Project Settings → Auth → SMTP). Sin esto el correo de
   invitación no llega.
3. **Datos de prueba:** crear dos empresas en `/admin/empresas` y un segundo usuario
   asignado solo a una, para validar que el RLS aisla correctamente.

FASE 12 se puede construir sin esto, pero sin SMTP y sin datos no se puede probar de
verdad (verías un workspace vacío).

### Entregado hasta ahora

```
docs/
  00-CONTEXTO.md              handoff entre chats — leer primero
  01-DECISIONES.md            D1-D18 con razonamiento
  02-PLAN.md                  este archivo
  03-PROMPT-CONTINUACION.md   texto para pegar en chat nuevo
  04-SETUP-SUPABASE.md        cómo aplicar el esquema, paso a paso
  PRD.md                      PRD condensado (reglas de negocio)

supabase/migrations/          (aplicadas y verificadas en Supabase)
  0001_enums_e_identidad.sql  9 enums, set_updated_at, profiles, empresas, user_empresa
  0002_cuentas.sql            bancos, cuentas, movimientos (+ dedupe external_id)
  0003_brokers.sql            brokers, movimientos_broker, activos_broker, precios_activo
  0004_wallets.sql            wallet_providers, wallets, wallet_saldos, movimientos_wallet
  0005_jobs_vistas.sql        import_jobs + 7 vistas (security_invoker)
  0006_rls.sql                4 funciones helper + policies de las 15 tablas
  0007_triggers_storage.sql   alta de usuario, realtime, bucket privado, cron
  0008_empresa_borrada_sin_acceso.sql  acceso derivado del estado de la empresa (D19)
                               ↑ PENDIENTE DE APLICAR en Supabase

supabase/                     (FASE 10 — escritas, PENDIENTES DE DESPLEGAR)
  config.toml                 verify_jwt=false en las dos funciones
  functions/README.md         despliegue y diagnóstico de errores
  functions/_shared/          cors.ts, auth.ts, empresas.ts
  functions/invitar-usuario/       inviteUserByEmail + asignación de empresas
  functions/actualizar-usuario/    rol, estado, empresas, reenvío de enlace

Frontend (FASE 8)
  package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html
  .env.example / .env.local   (la anon key es un marcador: hay que rellenarla)
  src/main.jsx                QueryClient + BrowserRouter
  src/App.jsx                 las 19 rutas del §11.1 (auth reales, resto Placeholder)
  src/index.css               tema Tailwind + variables shadcn + ingreso/egreso
  src/lib/supabase.js         cliente
  src/lib/utils.js            cn() + formatFecha()
  src/pages/Placeholder.jsx   página temporal, indica su fase en cada ruta

Auth (FASE 9)
  src/contexts/AuthContext.jsx        sesión, perfil, bloqueo de inactivos, Google OAuth
  src/components/ProtectedRoute.jsx   guardas de ruta + variante soloAdmin + spinner
  src/pages/Login.jsx                 email/contraseña + Google
  src/pages/Register.jsx              informativa: el acceso es por invitación
  src/pages/ForgotPassword.jsx        envío del enlace (sin filtrar si el email existe)
  src/pages/ResetPassword.jsx         doble uso: recuperación y aceptación de invitación
  src/pages/Home.jsx                  redirect por rol
  src/components/ui/                  button, input, label, card

Gestión de usuarios (FASE 10)
  src/lib/usuarios.js                 capa de datos: invoca las funciones y cruza
                                      profiles + user_empresa + empresas
  src/pages/UsuariosPage.jsx          tabla, buscador, 4 contadores, reenvío de enlace
  src/components/UsuarioDialog.jsx    alta/edición, casilla + rol POR EMPRESA
  src/components/AdminLayout.jsx      sidebar de /admin, guarda soloAdmin en el layout
  src/components/ui/                  + dialog, select, checkbox, badge

Panel de administración (FASE 11)
  src/lib/admin.js                    estadísticas (conteos) + empresas recientes
  src/lib/empresas.js                 CRUD, con el filtro de borrado centralizado
  src/lib/paises.js                   catálogo ISO + centinela «Otro»
  src/pages/AdminDashboard.jsx        tarjetas, aviso de usuarios sin empresa, recientes
  src/pages/EmpresasPage.jsx          tabla, buscador, filtro por estado
  src/components/EmpresaDialog.jsx    alta / edición / borrado con confirmación

Catálogos y utilidades (FASE 13)
  src/lib/bancosPorPais.js            bancos por país + «Otro»
  src/lib/walletProviders.js          proveedores cripto/fiat/ambos + «Otro»
  src/lib/monedas.js                  monedas cripto y fiat + formateo
  src/lib/earnConfig.js               clasificación y métricas Earn
  src/components/shared/MonthFilter.jsx  filtro de mes compartido
  src/lib/db.js                       adaptador de datos (D8)

Dependencias añadidas en la FASE 10 (antes no había ninguna de Radix):
  @radix-ui/react-dialog, @radix-ui/react-select, @radix-ui/react-checkbox
La FASE 11 no añade ninguna dependencia: reutiliza las de la FASE 10.
La FASE 13 tampoco: son módulos de JS puro y un componente sobre el Select ya instalado.
```

**Backend: 15 tablas, 7 vistas, 9 enums, RLS en todas.**
**Frontend: compila (`npm run build` verificado) — 627 KB de JS, 183 KB gzip.**

> El salto de 462 a 597 KB fue de la FASE 10 (Radix y sus primitivas de
> accesibilidad). La FASE 11 solo añade 19 KB: no mete dependencias nuevas. En la
> FASE 20, si preocupa el tamaño, la salida sigue siendo dividir el bundle por ruta
> con `React.lazy` — el panel `/admin` es el candidato ideal, porque un `cliente`
> nunca lo abre. No es urgente.

### Para continuar

1. Rellenar la anon key real en `.env.local` (Project Settings → API). Si queda el
   marcador, `src/lib/supabase.js` lanza un error explicando exactamente qué falta.
2. `npm run dev` y comprobar que carga `http://localhost:5173/login`.
3. Entrar con tu cuenta de super_admin → debe redirigir a `/admin`.
4. Ir a `/admin/usuarios` y probar la invitación (tras desplegar las funciones y el SMTP).
5. Corregir la FASE 12 (los 4 puntos de arriba) y después empezar la FASE 14.
