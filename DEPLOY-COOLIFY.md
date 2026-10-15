# Guía detallada para instalar FinanzAdmin Pro en otro Coolify

Esta guía explica cómo desplegar FinanzAdmin Pro en una instancia nueva de Coolify, usando el repositorio de GitHub y el `Dockerfile` incluido en el proyecto.

## 1. Qué se necesita

Para una instalación funcional se necesitan:

- Una instancia de Coolify accesible desde Internet.
- Un servidor o servicio PostgreSQL accesible desde el contenedor de la aplicación.
- El repositorio de GitHub de FinanzAdmin Pro.
- Un dominio o subdominio para la aplicación, por ejemplo `finanzas.midominio.com`.
- Las variables de entorno de producción.
- Un volumen persistente para los archivos subidos durante las importaciones.
- Opcionalmente, una clave de Pateway para extraer movimientos mediante IA.

La aplicación se ejecuta como un contenedor único. El `Dockerfile` incluido hace lo siguiente:

1. Instala Node.js 22 y Poppler.
2. Instala las dependencias con `npm ci`.
3. Compila el frontend.
4. Ejecuta las migraciones de base de datos al iniciar.
5. Inicia los workers de importaciones, precios y riesgos.
6. Inicia la API en el puerto `3000`.

No es necesario crear servicios separados para los workers cuando se usa este `Dockerfile`.

## 2. Decidir si se usará una base de datos nueva o existente

Antes de crear el servicio en Coolify, decide una de estas opciones:

### Instalación nueva

Usa una base PostgreSQL vacía. La aplicación creará automáticamente las tablas, índices y el usuario administrador inicial durante el primer arranque.

### Traslado de una instalación existente

Usa una copia de la base de datos original. No basta con desplegar el código: también debes restaurar la base de datos para conservar usuarios, empresas, cuentas, movimientos, wallets, brokers, fiducias e importaciones.

Además de la base de datos, debes conservar:

- `JWT_SECRET`.
- `PDF_PASSWORD_SECRET`.
- Los archivos pendientes o históricos ubicados en `IMPORT_STORAGE_DIR`.

Es especialmente importante conservar `PDF_PASSWORD_SECRET`. Las claves de PDFs guardadas en la base están cifradas con ese secreto; si cambia, la aplicación no podrá descifrarlas.

## 3. Crear o preparar PostgreSQL

Puedes usar PostgreSQL administrado, PostgreSQL instalado en el mismo servidor o un recurso de base de datos creado desde Coolify.

Crea una base de datos y un usuario con permisos para:

- Crear y modificar tablas.
- Crear índices.
- Ejecutar migraciones.
- Leer y escribir todos los datos de la aplicación.

Ejemplo de URL:

```text
postgresql://usuario:CONTRASENA@host:5432/finanzas
```

Si el proveedor exige SSL, agrega:

```text
DATABASE_SSL=true
```

Antes del despliegue, verifica desde el servidor o desde un contenedor con acceso a la red que el host y el puerto de PostgreSQL sean accesibles.

## 4. Crear el recurso en Coolify

En Coolify:

1. Abre el proyecto donde quieres instalar la aplicación.
2. Crea un nuevo recurso de tipo **Application**.
3. Selecciona **Git Repository**.
4. Conecta GitHub y selecciona el repositorio de FinanzAdmin Pro.
5. Selecciona la rama `main`.
6. Elige el servidor y destino donde se ejecutará el contenedor.
7. Configura el método de construcción como **Dockerfile**.
8. Indica como ruta del Dockerfile:

```text
Dockerfile
```

9. Configura el puerto interno `3000`.
10. Guarda el recurso, pero configura las variables antes del primer despliegue.

Si el repositorio es privado, la integración de GitHub de Coolify debe tener permisos de lectura sobre el repositorio.

## 5. Variables obligatorias

En la sección **Environment Variables** de Coolify configura como mínimo:

```env
DATABASE_URL=postgresql://usuario:CONTRASENA@host:5432/finanzas
JWT_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
PDF_PASSWORD_SECRET=otra-clave-aleatoria-de-al-menos-32-caracteres
ADMIN_EMAIL=admin@tu-dominio.com
ADMIN_PASSWORD=una-contrasena-de-al-menos-12-caracteres
ADMIN_NAME=Administrador principal
```

Recomendaciones:

- Genera `JWT_SECRET` y `PDF_PASSWORD_SECRET` con valores aleatorios largos.
- No reutilices claves sencillas ni las pongas en el repositorio.
- Guarda una copia segura de ambas claves.
- En una migración, conserva exactamente los valores usados por la instalación original.
- `ADMIN_PASSWORD` solo se usa para crear el administrador inicial si ese correo todavía no existe.
- Si el usuario administrador ya existe, cambiar estas variables no modifica su contraseña.

## 6. Variables opcionales de la API

Si frontend y API se sirven desde el mismo dominio, normalmente no necesitas configurar `CORS_ORIGIN`.

Si necesitas permitir uno o varios orígenes concretos:

```env
CORS_ORIGIN=https://finanzas.midominio.com
```

Para varios orígenes, sepáralos por comas:

```env
CORS_ORIGIN=https://finanzas.midominio.com,https://admin.midominio.com
```

El puerto de producción normalmente no necesita configurarse porque la aplicación usa `3000` por defecto:

```env
PORT=3000
```

## 7. Variables para importación de archivos

El worker de importación requiere `PDF_PASSWORD_SECRET`, que debe ser exactamente igual al de la API.

Para habilitar la extracción asistida por IA configura:

```env
PATEWAY_API_KEY=tu-clave-de-pateway
```

Opcionalmente puedes definir:

```env
PATEWAY_BASE_URL=https://api.pateway.ai
PATEWAY_MESSAGES_URL=https://api.pateway.ai/v1/messages
IMPORT_MODEL=claude-haiku-4-5-20251001
IMPORT_REQUEST_TIMEOUT_MS=180000
IMPORT_MAX_TOKENS=12288
IMPORT_POLL_INTERVAL_MS=5000
IMPORT_CONCURRENCY=3
IMPORT_PDF_PAGES_PER_BATCH=1
IMPORT_ROWS_PER_BATCH=500
PDFTOTEXT_BIN=pdftotext
PDFINFO_BIN=pdfinfo
```

La imagen ya instala `poppler-utils`, por lo que incluye `pdftotext` y `pdfinfo`.

La aplicación limita los archivos importados a 10 MB por archivo.

## 8. Persistencia de archivos importados

La aplicación guarda archivos de importación en:

```text
/app/server/uploads
```

Configura un volumen persistente en Coolify con:

- **Destination path:** `/app/server/uploads`

También puedes usar otra ruta mediante:

```env
IMPORT_STORAGE_DIR=/app/server/uploads
```

El volumen es importante para que los workers puedan leer los archivos pendientes y para evitar perderlos cuando Coolify recrea el contenedor.

La base de datos conserva los registros de los jobs, pero los archivos físicos necesitan su propio almacenamiento persistente.

## 9. Primer despliegue

Después de configurar las variables y el volumen:

1. Guarda la configuración.
2. Ejecuta **Deploy** en Coolify.
3. Revisa los logs del build.
4. Revisa los logs del arranque.
5. Espera a ver que la migración termine correctamente.
6. Comprueba que la API escucha en el puerto `3000`.
7. Abre el dominio configurado.

Durante el arranque, el contenedor ejecuta:

```bash
npm run db:migrate
```

Después inicia los procesos de importación, precios, riesgos y la API. Las migraciones son idempotentes: pueden ejecutarse nuevamente sin crear duplicados de esquema.

Si faltan `ADMIN_EMAIL` o `ADMIN_PASSWORD`, la migración aplica el esquema, pero no crea el administrador inicial.

## 10. Configurar el dominio y HTTPS

En la configuración del recurso de Coolify:

1. Agrega el dominio o subdominio.
2. Usa el puerto interno `3000`.
3. Activa HTTPS mediante el certificado automático de Coolify.
4. Configura el DNS para que el dominio apunte al servidor de Coolify.
5. Espera la emisión del certificado.
6. Abre la URL usando `https://`.

La URL final puede ser, por ejemplo:

```text
https://finanzas.midominio.com
```

Si configuras `CORS_ORIGIN`, debe coincidir con el origen real, incluyendo `https://` y sin una barra final innecesaria.

## 11. Trasladar datos desde otro Coolify

Para mover una instalación existente:

### 11.1 Respaldar la base de datos original

Realiza un respaldo completo de PostgreSQL, por ejemplo:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > finanzas.backup
```

La forma exacta puede cambiar según el proveedor de PostgreSQL.

### 11.2 Restaurar la base de datos nueva

Restaura el respaldo en la base nueva antes de iniciar el contenedor, o detén temporalmente el primer despliegue mientras restauras los datos.

Ejemplo:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$DATABASE_URL" finanzas.backup
```

No ejecutes `--clean` contra una base que contenga datos que quieras conservar.

### 11.3 Copiar los archivos de importación

Copia el contenido de `server/uploads` de la instalación original al volumen que montaste en:

```text
/app/server/uploads
```

### 11.4 Conservar secretos

Configura en el nuevo Coolify los mismos valores de:

```env
JWT_SECRET=...
PDF_PASSWORD_SECRET=...
```

Si cambias `JWT_SECRET`, las sesiones existentes dejarán de ser válidas. Si cambias `PDF_PASSWORD_SECRET`, las claves de PDF cifradas previamente dejarán de poder descifrarse.

### 11.5 Verificar referencias

Después de restaurar:

- Revisa que `DATABASE_URL` apunte a la base nueva.
- Revisa que los archivos pendientes existan en el volumen.
- Verifica que el dominio nuevo esté en `CORS_ORIGIN` si esa variable se utiliza.
- Comprueba el acceso con un usuario existente.
- Comprueba el resumen de una empresa.
- Comprueba una cuenta, wallet o broker con datos históricos.

## 12. Verificaciones posteriores al despliegue

Después del primer arranque, verifica:

- La página de inicio de sesión abre correctamente.
- El administrador inicial puede iniciar sesión.
- Se puede crear o consultar una empresa.
- El resumen financiero carga saldos.
- El botón **Inicio** vuelve al resumen de la empresa.
- El botón **Cerrar sesión** elimina la sesión y vuelve al inicio.
- Los bancos, brokers, wallets y fiducias muestran sus catálogos.
- Las cuentas de comisionistas y fiducias abren su detalle.
- Una importación pequeña crea un job y el worker lo procesa.
- Los logs no muestran errores de conexión a PostgreSQL.
- El volumen conserva los archivos después de un redeploy.

## 13. Problemas frecuentes

### El contenedor se detiene al arrancar

Revisa primero:

- `DATABASE_URL`.
- Acceso de red a PostgreSQL.
- `JWT_SECRET` con al menos 32 caracteres.
- `PDF_PASSWORD_SECRET` con al menos 32 caracteres.
- Logs de `npm run db:migrate`.

La API no arranca si los secretos JWT o de PDFs no cumplen la longitud mínima.

### No se crea el administrador

Comprueba que `ADMIN_EMAIL` y `ADMIN_PASSWORD` estén configurados. La contraseña debe tener al menos 12 caracteres.

Si el correo ya existe, la migración no reemplaza ni modifica ese usuario.

### La importación queda pendiente

Revisa:

- Que el worker de importación aparezca iniciado en los logs.
- Que `DATABASE_URL` sea la misma para API y workers.
- Que `PDF_PASSWORD_SECRET` sea igual en todos los procesos.
- Que el volumen `/app/server/uploads` esté montado.
- Que `PATEWAY_API_KEY` exista si el flujo requiere extracción con IA.
- Que `pdftotext` y `pdfinfo` estén disponibles.

### Las claves de PDF no se pueden usar después del traslado

Esto casi siempre significa que `PDF_PASSWORD_SECRET` cambió. Restaura el valor original de la instalación anterior.

### El navegador muestra errores de CORS

Configura `CORS_ORIGIN` con el dominio exacto desde el que se abre la aplicación y vuelve a desplegar.

### Se pierden archivos después de desplegar

Configura un volumen persistente en `/app/server/uploads`. El sistema de archivos interno del contenedor no debe usarse como almacenamiento permanente.

## 14. Actualizaciones futuras

Para actualizar la aplicación:

1. Haz respaldo de PostgreSQL.
2. Confirma que los secretos no cambiaron.
3. Haz push de los cambios a la rama configurada en Coolify.
4. Ejecuta un nuevo deploy.
5. Revisa los logs de migración.
6. Comprueba una pantalla de resumen y una importación.

No borres el volumen de uploads ni cambies las variables secretas durante una actualización normal.

## 15. Lista final de comprobación

Antes de considerar terminada la instalación, confirma:

- [ ] Repositorio y rama correctos.
- [ ] Build configurado con `Dockerfile`.
- [ ] Puerto interno `3000` configurado.
- [ ] PostgreSQL accesible.
- [ ] `DATABASE_URL` configurada.
- [ ] `JWT_SECRET` configurado y guardado.
- [ ] `PDF_PASSWORD_SECRET` configurado y guardado.
- [ ] Administrador inicial configurado.
- [ ] Volumen `/app/server/uploads` creado.
- [ ] Dominio y HTTPS funcionando.
- [ ] `PATEWAY_API_KEY` configurada si se usarán importaciones asistidas por IA.
- [ ] Migraciones completadas.
- [ ] Inicio de sesión comprobado.
- [ ] Resumen financiero comprobado.
- [ ] Una importación comprobada.
- [ ] Respaldo de base de datos programado.

Con estos pasos, la aplicación puede instalarse en otro Coolify conservando los datos y las funciones de importación.
