# Despliegue local con Coolify y PostgreSQL

Esta versión ya no requiere variables `VITE_SUPABASE_*`, token de Supabase ni despliegue de Edge Functions. El navegador y la API se sirven desde la misma aplicación; PostgreSQL queda privado dentro de Coolify.

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

Al terminar el despliegue, abre el dominio de la aplicación. Debe aparecer la pantalla de acceso sin pedir claves de Supabase. Inicia sesión con el correo y contraseña de `ADMIN_*`.

En esta versión funcionan con la API propia y PostgreSQL: inicio de sesión, sesión JWT, superusuario, empresas, usuarios, bancos, cuentas, brokers, wallets, movimientos, importación de PDFs y precios.

La autorización se valida en el backend y se aplica por empresa; no depende únicamente del frontend.

## 4. Contraseñas

Las contraseñas se guardan con hash bcrypt en PostgreSQL. El primer `ADMIN_PASSWORD` requiere mínimo 12 caracteres; las contraseñas creadas o restablecidas por un administrador desde la aplicación requieren mínimo 6 caracteres. Comunica las contraseñas iniciales por un canal seguro. La recuperación por correo se añadirá al configurar SMTP propio; no se envían correos mediante Supabase.
