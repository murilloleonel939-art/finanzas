# FinanzAdmin Pro

Aplicación SaaS multiempresa para administrar empresas, bancos, cuentas, brokers, activos, wallets y movimientos financieros. Incluye autenticación propia con JWT, PostgreSQL, importación de extractos PDF, CSV y Excel mediante Pateway Claude Haiku y sincronización de precios.

## Arquitectura actual

```text
Navegador React/Vite
        │
        ▼
API Node/Express ─────► PostgreSQL
        │
        ├── worker-import   (PDF → texto → Pateway Claude Haiku → movimientos)
        └── worker-precios  (cola y barrido de precios)
```

La aplicación principal sirve el frontend compilado y la API desde el mismo servicio. PostgreSQL es la fuente de verdad para usuarios, empresas y datos financieros; el flujo operativo usa únicamente la API propia y PostgreSQL.

## Stack

- React 18, Vite, Tailwind CSS y shadcn/ui.
- Node.js 22, Express y JWT.
- PostgreSQL mediante `pg`.
- Contraseñas con bcrypt.
- Pateway compatible con Anthropic Messages para extracción de PDFs.
- `pdftotext` de `poppler-utils` para convertir PDFs a texto.
- Coolify para despliegue.

## Requisitos

- Node.js 22 o superior.
- PostgreSQL 14 o superior.
- Para importar PDFs: `pdftotext`/`poppler-utils`.
- Una clave de NVIDIA NIM para el worker de importaciones.

## Instalación local

```bash
git clone https://github.com/murilloleonel939-art/finanzas.git
cd finanzas
npm install
cp .env.example .env
```

Configura `.env`:

```env
DATABASE_URL=postgresql://usuario:contrasena@host:5432/finanzadmin
JWT_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
PDF_PASSWORD_SECRET=otra-clave-aleatoria-larga-y-secreta
ADMIN_EMAIL=admin@ejemplo.com
ADMIN_PASSWORD=una-clave-inicial-de-al-menos-12-caracteres
ADMIN_NAME=Administrador principal
```

Aplica el esquema y crea el primer superadministrador:

```bash
npm run db:migrate
```

La migración ejecuta [`server/schema.sql`](server/schema.sql), crea tablas, índices y vistas, y crea el administrador inicial solo si todavía no existe. Es idempotente y no borra datos existentes.

Arranca la API y frontend compilado:

```bash
npm run build
npm start
```

Para desarrollo del frontend usa `npm run dev`; para ejecutar la API separadamente usa `npm run dev:api`.

## Despliegue en Coolify

1. Crea un recurso PostgreSQL.
2. Crea un servicio desde este repositorio de GitHub.
3. Usa el `Dockerfile` incluido, puerto interno `3000` y comando de inicio por defecto.
4. Configura estas variables secretas en la aplicación:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=clave-aleatoria-de-al-menos-32-caracteres
ADMIN_EMAIL=admin@tu-dominio.com
ADMIN_PASSWORD=clave-inicial-de-al-menos-12-caracteres
ADMIN_NAME=Administrador principal
```

El `Dockerfile` instala `poppler-utils`, compila la aplicación y ejecuta `node server/migrate.mjs` antes de iniciar la API. Por tanto, las tablas se crean automáticamente durante el arranque. También puedes ejecutar manualmente `npm run db:migrate` desde la terminal del contenedor.

El primer inicio puede mostrar `Superusuario inicial creado`. En reinicios posteriores indicará que ya existe y no lo modificará.

### Worker de importaciones

El contenedor principal inicia el worker junto con la API. Si usas un servicio separado en Coolify, comparte la misma `DATABASE_URL`, `IMPORT_STORAGE_DIR` persistente y ejecuta este comando:

```bash
npm run worker:import
```

Variables adicionales:

```env
PATEWAY_API_KEY=...
PATEWAY_BASE_URL=https://api.pateway.ai
IMPORT_MODEL=claude-haiku-4-5-20251001
IMPORT_MAX_TOKENS=12288
IMPORT_PDF_PAGES_PER_BATCH=1
IMPORT_ROWS_PER_BATCH=500
IMPORT_CONCURRENCY=3
IMPORT_REQUEST_TIMEOUT_MS=180000
IMPORT_STORAGE_DIR=/app/server/uploads
IMPORT_POLL_INTERVAL_MS=5000
```

El worker usa **Claude Haiku 4.5** mediante Pateway. Ejecuta `pdftotext` y procesa PDF por páginas, y CSV/Excel por filas. Las claves de PDF se configuran por cuenta, se almacenan cifradas con `PDF_PASSWORD_SECRET` y nunca se muestran; conserva esa variable igual en API y worker. La imagen del `Dockerfile` ya contiene `poppler-utils`.

### Worker de precios

Crea otro servicio con la misma `DATABASE_URL` y ejecuta:

```bash
npm run worker:precios
```

Los workers deben usar la misma base PostgreSQL que la API. Revisa sus logs en Coolify después de desplegarlos.

## Usuarios y contraseñas

- El primer superadministrador se crea con `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NAME`.
- Un administrador puede crear usuarios desde la aplicación.
- Las contraseñas de usuarios nuevos y las restablecidas requieren mínimo 6 caracteres.
- Las contraseñas se almacenan con hash bcrypt; nunca se guarda la contraseña en texto plano.
- Comparte las contraseñas iniciales por un canal seguro.

## Comandos

| Comando | Función |
|---|---|
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run dev:api` | API local |
| `npm run build` | Build de producción |
| `npm start` | Migración y API de producción |
| `npm run db:migrate` | Aplica el esquema PostgreSQL y crea el admin inicial |
| `npm run worker:import` | Procesa jobs de importación PDF |
| `npm run worker:precios` | Procesa cola y barrido de precios |
| `npm run verificar` | Verifica columnas contra el esquema local |
| `npm run pruebas` | Suite de precios |
| `npm run pruebas:importacion` | Smoke test de importación |
| `npm run pruebas:wallets` | Smoke test de wallets |
| `npm run pruebas:brokers` | Smoke test de brokers |
| `npm run pruebas:exportacion` | Pruebas de exportación |
| `npm run verificar:precios` | Verificación completa de precios |
| `npm run verificar:admin` | Verificación del panel administrativo |

## Estructura importante

```text
server/schema.sql                 Esquema PostgreSQL completo
server/migrate.mjs                Migración idempotente y admin inicial
server/index.mjs                  API Express, JWT y autorización por empresa
server/db.mjs                     Pool PostgreSQL
worker-import.mjs                 Importación PDF con Pateway Claude Haiku
worker-precios.mjs                Cola y sincronización de precios
deploy/                           Ejemplos de variables y servicio del worker
src/lib/api.js                    Cliente de la API propia
src/lib/imports-datos.js          Jobs y datos de importación
scripts/                          Verificadores y pruebas
docs/COOLIFY-POSTGRES.md          Guía adicional de Coolify
```

## Verificación antes de publicar

```bash
npm run build
npm run verificar
npm run pruebas:importacion
npm run pruebas:wallets
npm run pruebas:brokers
npm run pruebas:exportacion
npm run verificar:precios
git diff --check
```

## Seguridad y operación

- Nunca subas `.env`, `DATABASE_URL`, `JWT_SECRET`, `NVIDIA_API_KEY` ni tokens de GitHub al repositorio.
- Usa variables secretas de Coolify.
- Mantén PostgreSQL privado dentro de la red de Coolify.
- El backend valida el JWT y el acceso a cada empresa; no se confía solamente en el frontend.
- Configura backups de PostgreSQL antes de cargar datos productivos.
- Revisa los logs de la API y de ambos workers después de cada despliegue.

## Documentación adicional

- [`docs/COOLIFY-POSTGRES.md`](docs/COOLIFY-POSTGRES.md): despliegue de la aplicación con PostgreSQL.
- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): arquitectura y decisiones.
- [`docs/DECISIONES.md`](docs/DECISIONES.md): decisiones técnicas.
- [`docs/PRD.md`](docs/PRD.md): reglas de negocio.
- [`deploy/worker-import.env.example`](deploy/worker-import.env.example): variables del worker PDF.
- [`server/schema.sql`](server/schema.sql): tablas, índices y vistas PostgreSQL.

## Estado

La aplicación está preparada para operar con API propia y PostgreSQL en Coolify. El build y las suites locales de importación, precios, brokers, wallets y exportación deben ejecutarse antes de cada publicación.
