# Despliegue local con Coolify y PostgreSQL

El navegador y la API se sirven desde la misma aplicación; PostgreSQL queda privado dentro de Coolify.

## 1. Variables del servicio de la aplicación

En el servicio de GitHub de FinanzAdmin, abre **Environment Variables** y crea estas variables como secretas:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Selecciona la referencia de la base PostgreSQL creada en Coolify. |
| `JWT_SECRET` | Una cadena aleatoria de al menos 32 caracteres. |
| `ADMIN_EMAIL` | El email del primer superadministrador. |
| `ADMIN_PASSWORD` | Contraseña inicial fuerte, mínimo 12 caracteres para el primer administrador. |
| `ADMIN_NAME` | Nombre mostrado del administrador (opcional). |

No pongas `DATABASE_URL` ni `JWT_SECRET` como variables `VITE_*`: nunca deben llegar al navegador.

## 2. Configurar el build

1. En **Build Pack**, selecciona **Dockerfile**.
2. Deja la ruta del Dockerfile como `Dockerfile`.
3. El puerto interno es `3000`.
4. Guarda y pulsa **Redeploy**.

El contenedor ejecuta la migración idempotente en cada arranque. Crea las tablas y, solo cuando aún no existe, el superusuario definido por `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## 3. Comprobar

Al terminar el despliegue, abre el dominio de la aplicación e inicia sesión con el correo y contraseña de `ADMIN_*`.

En esta versión funcionan con la API propia y PostgreSQL: inicio de sesión, sesión JWT, superusuario, empresas, usuarios, bancos, cuentas, brokers, wallets, movimientos, importación de PDFs/CSV/Excel y precios.

Para importar extractos grandes, el worker usa Pateway Claude Haiku por lotes. Configura estas variables en el servicio de la aplicación:

| Variable | Valor recomendado |
| --- | --- |
| `PATEWAY_API_KEY` | Clave de Pateway |
| `PATEWAY_BASE_URL` | `https://api.pateway.ai` |
| `IMPORT_MODEL` | `claude-haiku-4-5-20251001` |
| `IMPORT_MAX_TOKENS` | `8192` |
| `IMPORT_PDF_PAGES_PER_BATCH` | `5` |
| `IMPORT_ROWS_PER_BATCH` | `500` |
| `IMPORT_REQUEST_TIMEOUT_MS` | `180000` |

El worker procesa los PDF por páginas y CSV/Excel por filas, por lo que un extracto de 60 páginas no se envía en una sola solicitud.

La autorización se valida en el backend y se aplica por empresa; no depende únicamente del frontend.

## 4. Contraseñas

Las contraseñas se guardan con hash bcrypt en PostgreSQL. El primer `ADMIN_PASSWORD` requiere mínimo 12 caracteres; las contraseñas creadas o restablecidas por un administrador desde la aplicación requieren mínimo 6 caracteres. Comunica las contraseñas iniciales por un canal seguro. La recuperación por correo se añadirá al configurar SMTP propio.
