# FinanzAdmin Pro

Plataforma SaaS multi-tenant para la gestión administrativa y financiera de múltiples
empresas. Un super administrador gestiona empresas y usuarios; cada empresa tiene bancos,
cuentas bancarias, brokers con activos y precios, y wallets cripto/fiat con movimientos.
Los datos se importan desde extractos en PDF mediante IA, y se visualizan con filtros por
mes, resúmenes y tablas.

## Stack

| Capa | Tecnología |
|---|---|
| Base de datos | Supabase Cloud (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/contraseña + Google OAuth) |
| Storage | Supabase Storage (bucket privado, URLs firmadas) |
| Realtime | Supabase Realtime |
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui |
| Routing | react-router-dom v6 |
| Datos | @tanstack/react-query + supabase-js |
| Deploy | EC2 + Coolify (frontend y worker de IA) |

## Puesta en marcha

### 1. Requisitos

- Node.js 18 o superior
- Un proyecto en [supabase.com](https://supabase.com)

### 2. Clonar e instalar

```bash
git clone <URL-DEL-REPO>
cd finanzas
npm install
```

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Rellena en `.env.local` los dos valores desde **Project Settings → API** de tu proyecto
Supabase. Sin la `anon key`, la app lanza un error al arrancar explicando qué falta.

> La `service_role` key **nunca** va aquí: se salta el RLS por completo y solo se usa en
> el servidor (Edge Functions y los workers).

### 4. Aplicar el esquema de la base de datos

Sigue [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md). Son 15 migraciones secuenciales en el
SQL Editor, más la creación del primer super_admin y el SMTP.

### 5. Arrancar

```bash
npm run dev
```

En `http://localhost:5173`.

## Estructura

```
docs/                      Documentación (empieza por ARQUITECTURA.md)
supabase/migrations/       Esquema SQL: 15 migraciones secuenciales
supabase/functions/        Edge Functions (invitaciones, admin, precios)
scripts/                   Verificadores y pruebas
src/
  components/ui/           Componentes shadcn (button, input, label, card)
  components/              Componentes compartidos y de cada módulo
  contexts/AuthContext.jsx Sesión, perfil y control de acceso
  lib/supabase.js          Cliente de Supabase
  lib/db.js                Adaptador de consultas (forma del SDK de Base44)
  pages/                   Pantallas, una por ruta
worker-import.mjs          Worker de importación de PDFs (EC2)
worker-precios.mjs         Worker de precios (cola + barrido diario)
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run verificar` | Columnas del código contra `supabase/migrations/` |
| `npm run pruebas` | Suite de precios (humo + integración + reporte) |
| `npm run pruebas:brokers` | Pruebas del módulo de brokers |
| `npm run pruebas:wallets` | Pruebas del módulo de wallets y Earn |
| `npm run pruebas:importacion` | Pruebas de importación de PDFs |
| `npm run pruebas:exportacion` | Pruebas de exportación de datos |
| `npm run verificar:precios` | Integridad del módulo de precios |
| `npm run verificar:exportacion` | Integridad de la exportación |
| `npm run verificar:admin` | Integridad del panel de administración |

`npm run verificar` es el más útil antes de subir un cambio: lee las migraciones como
fuente de verdad y avisa si el código consulta una columna que no existe. `npm run build`
no lo detecta, porque las columnas de PostgREST son strings.

## Edge Functions

La gestión de usuarios necesita la `service_role` key, que no puede estar en el navegador
porque el bundle es público. Vive en Edge Functions que verifican primero que quien llama
es `super_admin` activo:

- `invitar-usuario` — `auth.admin.inviteUserByEmail` + asignación de empresas.
- `actualizar-usuario` — rol global, estado, empresas y reenvío del enlace de acceso.
- `actualizar-precios` — encola la actualización de precios.
- `crear-import-job` — registra una importación de PDF.
- `admin-get-stats`, `admin-list-jobs`, `admin-list-logs`, `admin-update-config` — panel.
- `enviar-email` — notificaciones.

Para desplegarlas: [`supabase/functions/README.md`](supabase/functions/README.md). El
despliegue requiere tu login del CLI de Supabase.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Punto de entrada: arquitectura y decisiones cerradas |
| [`docs/DECISIONES.md`](docs/DECISIONES.md) | El razonamiento detrás de cada decisión (D1-D35) |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Guía paso a paso del esquema y la puesta en producción |
| [`docs/PRD.md`](docs/PRD.md) | Reglas de negocio |

## Seguridad

El aislamiento entre empresas **no depende del frontend**. La `anon key` viaja en el bundle
del navegador por diseño, así que cualquiera puede llamar a la API REST directamente. La
frontera real es el **Row-Level Security** de la migración `0006`:

- `is_super_admin()` — ¿el llamante es super_admin y está activo?
- `has_empresa_access(empresa_id)` — ¿el llamante está asignado a esa empresa, y la
  empresa sigue viva? Todas las tablas hijas (bancos, cuentas, movimientos, brokers,
  wallets) la usan, así que una empresa borrada pierde el acceso a sus datos.

Antes de cargar datos reales, ejecuta la prueba de dos usuarios de empresas distintas
descrita al final de [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
