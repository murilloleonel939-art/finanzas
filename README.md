# FinanzAdmin Pro

Plataforma SaaS multi-tenant para la gestión administrativa y financiera de múltiples
empresas. Un super administrador gestiona empresas y usuarios; cada empresa tiene bancos,
cuentas bancarias, brokers con activos y precios, y wallets cripto/fiat con movimientos.
Los datos se importan desde extractos en PDF mediante IA, y se visualizan con filtros por
mes, resúmenes y tablas.

> **Estado:** en construcción por fases. Backend desplegado y verificado; frontend en curso.
> Ver [`docs/02-PLAN.md`](docs/02-PLAN.md) para el avance exacto.

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
> el servidor (Edge Functions y el worker de IA).

### 4. Aplicar el esquema de la base de datos

Sigue [`docs/04-SETUP-SUPABASE.md`](docs/04-SETUP-SUPABASE.md). Son 7 migraciones
secuenciales en el SQL Editor, más la creación del primer super_admin.

### 5. Arrancar

```bash
npm run dev
```

En `http://localhost:5173`.

## Estructura

```
docs/                      Documentación del proyecto (leer 00-CONTEXTO.md primero)
supabase/migrations/       Esquema SQL: 7 migraciones secuenciales
src/
  components/ui/           Componentes shadcn (button, input, label, card)
  components/              Componentes compartidos
  contexts/AuthContext.jsx Sesión, perfil y control de acceso
  lib/supabase.js          Cliente de Supabase
  pages/                   Pantallas, una por ruta
```

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/00-CONTEXTO.md`](docs/00-CONTEXTO.md) | Punto de entrada: arquitectura y decisiones cerradas |
| [`docs/01-DECISIONES.md`](docs/01-DECISIONES.md) | El razonamiento detrás de cada decisión (D1-D14) |
| [`docs/02-PLAN.md`](docs/02-PLAN.md) | Las 21 fases y el estado de avance |
| [`docs/03-PROMPT-CONTINUACION.md`](docs/03-PROMPT-CONTINUACION.md) | Cómo retomar el trabajo en una sesión nueva |
| [`docs/04-SETUP-SUPABASE.md`](docs/04-SETUP-SUPABASE.md) | Guía paso a paso del esquema |
| [`docs/PRD.md`](docs/PRD.md) | Reglas de negocio |

## Seguridad

El aislamiento entre empresas **no depende del frontend**. La `anon key` viaja en el bundle
del navegador por diseño, así que cualquiera puede llamar a la API REST directamente. La
frontera real es el **Row-Level Security** definido en las migraciones `0006` y `0007`:
cada fila se filtra por la empresa a la que el usuario está asignado.

Antes de cargar datos reales, ejecuta la prueba de dos usuarios de empresas distintas
descrita al final de `docs/04-SETUP-SUPABASE.md`.
