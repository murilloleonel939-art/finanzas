# 02 — PLAN POR FASES

Construcción por fases **pequeñas y autocontenidas**, para poder cortar en cualquier momento
y continuar en un chat nuevo sin perder contexto.

**Regla:** al terminar una fase, marcar `[x]` aquí y hacer commit. Si se agota el presupuesto
de tokens a mitad de una fase, apuntar el estado exacto en la sección "En curso" al final.

---

## Estado global

- **Fase actual:** FASE 10 (invitaciones)
- **Fases completadas:** 10 de 21 — backend + scaffold + auth
- **Verificado en Supabase:** las 15 tablas con RLS activo, las 4 funciones helper,
  las 7 vistas, las 11 tablas publicadas para realtime, y el bucket `extractos`
  creado como **privado**. Backend verificado por completo.
- **Bloqueante próximo:** la FASE 10 necesita SMTP propio configurado en Supabase
  y las Edge Functions instaladas en el proyecto.
- **Pendientes del usuario** (no bloquean hasta la fase indicada):
  - Proveedor de IA para extracción de PDFs → FASE 17
  - API de mercado para precios → FASE 18
  - Plan de Supabase (Pro, por los backups) → antes de datos reales
  - SMTP propio → antes de invitar clientes (FASE 10)

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

## FASE 10 — Invitaciones y gestión de usuarios

- [ ] Edge Function `invitar-usuario` (usa `service_role`)
- [ ] Edge Function para actualizar `app_role` / `estado`
- [ ] `UsuariosPage` + `UsuarioDialog`
- [ ] Asignación de empresas (crea/elimina `user_empresa`)

**Entregable:** el admin invita y el usuario entra con su asignación aplicada.

**Prerequisito:** SMTP propio configurado (decisión D10).

---

## FASE 11 — Panel de administración

- [ ] `AdminLayout` + navegación
- [ ] `AdminDashboard` con estadísticas (conteos, no sumas de dinero)
- [ ] `EmpresasPage` + `EmpresaDialog` (CRUD completo)

**Entregable:** el super admin gestiona empresas y ve el dashboard.

---

## FASE 12 — Workspace y sidebar de empresa

- [ ] `Workspace` (lista de empresas asignadas)
- [ ] `EmpresaLayout` con sidebar jerárquico (§11.3)
- [ ] Suscripciones realtime
- [ ] Diálogos de confirmación para borrado
- [ ] `EmpresaOverview` con **subtotales por moneda** (decisión D4)

**Entregable:** navegación completa entre empresas y sus ramas.

---

## FASE 13 — Catálogos y utilidades

- [ ] `src/lib/bancosPorPais.js`
- [ ] `src/lib/walletProviders.js`
- [ ] Monedas cripto y fiat
- [ ] `src/lib/earnConfig.js`
- [ ] `src/components/shared/MonthFilter.jsx`
- [ ] `src/lib/db.js` — adaptador con forma del SDK de Base44 (decisión D8)

**Entregable:** piezas compartidas listas para los módulos.

---

## FASE 14 — Módulo cuentas bancarias

- [ ] `CrearBanco` (con opción "Otro")
- [ ] `CrearCuenta`
- [ ] `CuentaDetail` con tarjetas, MonthFilter, tabla paginada
- [ ] Formulario de movimiento manual
- [ ] Eliminación con confirmación

**Entregable:** rama de cuentas operable de punta a punta.

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

**Nada en curso.** FASES 0-9 completadas. La siguiente es la FASE 10 (invitaciones).

### Entregado hasta ahora

```
docs/
  00-CONTEXTO.md              handoff entre chats — leer primero
  01-DECISIONES.md            D1-D14 con razonamiento
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

Frontend (FASE 8)
  package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html
  .env.example / .env.local   (la anon key es un marcador: hay que rellenarla)
  src/main.jsx                QueryClient + BrowserRouter
  src/App.jsx                 las 19 rutas del §11.1 (auth reales, resto Placeholder)
  src/index.css               tema Tailwind + variables shadcn + ingreso/egreso
  src/lib/supabase.js         cliente
  src/lib/utils.js            cn()
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
```

**Backend: 15 tablas, 7 vistas, 9 enums, RLS en todas.**
**Frontend: compila (`npm run build` verificado) — 462 KB de JS, 133 KB gzip.**

> El salto de 194 a 462 KB (una sola vez) es supabase-js + react-query. Es el coste
> fijo de las librerías base; a partir de aquí crece poco. Si en la FASE 20 preocupa
> el tamaño, la salida es dividir el bundle por ruta con `React.lazy`. No es urgente.

### Para continuar

1. Rellenar la anon key real en `.env.local` (Project Settings → API). Si queda el
   marcador, `src/lib/supabase.js` lanza un error explicando exactamente qué falta.
2. `npm run dev`, entrar a `http://localhost:5173/login` y comprobar que carga.
3. Probar: entrar con tu cuenta de super_admin → debe redirigir a `/admin`.
4. Empezar la FASE 10. **Antes hace falta:**
   - SMTP propio configurado (o las invitaciones no llegan).
   - Instalar las Edge Functions en el proyecto (`supabase functions` /
     el aviso "Edge functions not installed" del dashboard).
