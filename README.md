# FinanzAdmin Pro

Aplicación web multiempresa para administrar finanzas empresariales: bancos, cuentas bancarias, movimientos, brokers, activos, wallets, importación de extractos y el catálogo de comisionistas y fiducias.

## Funcionalidades disponibles

### Acceso y empresas

- Inicio de sesión con JWT.
- Usuarios activos e inactivos y roles `super_admin` / `usuario`.
- Empresas aisladas por compañía con autorización en cada endpoint.
- Gestión administrativa de empresas, usuarios, asignaciones y estadísticas.
- Borrado lógico para conservar trazabilidad.

### Bancos y cuentas

- Bancos por empresa y país.
- Cuentas de ahorros y corriente, moneda y saldo inicial.
- Movimientos manuales de ingresos y egresos.
- Filtros por período, resumen de ingresos, egresos y saldo resultante.
- Eliminación de movimientos individuales o de un mes completo.
- Indicadores para IVA, 4x1000, retenciones, intereses y comisiones.
- Exportación de información a CSV, Excel y PDF.

### Claves de PDF e importaciones

- Importación de extractos en PDF, CSV, XLS y XLSX.
- Procesamiento asíncrono mediante jobs y worker.
- Extracción de texto PDF con Poppler (`pdfinfo` y `pdftotext`).
- Detección de duplicados y seguimiento del estado del job.
- La clave de un PDF se solicita desde el modal de importación cuando el archivo está protegido.
- La clave se guarda cifrada y asociada a la cuenta bancaria para usarla automáticamente en futuros extractos.
- La clave puede reemplazarse o eliminarse desde el detalle de la cuenta.
- `PDF_PASSWORD_SECRET` debe tener al menos 32 caracteres y debe mantenerse estable: cambiarlo impide descifrar claves ya guardadas.
- El worker soporta reglas específicas para proveedores como Nequi y extracción asistida por IA mediante Pateway.

### Brokers e inversiones

- Brokers por empresa y moneda.
- Movimientos de brokers con cantidades, valores unitarios y deduplicación.
- Activos de inversión: acciones, ETF, bonos, fondos, criptomonedas, opciones y otros.
- Precios históricos por activo.
- Jobs de actualización de precios y barridos automáticos.

### Wallets

- Proveedores de wallet de tipo cripto, fiat o ambos.
- Wallets por proveedor, dirección y moneda.
- Saldos por moneda y recálculo de saldos.
- Movimientos de wallet con deduplicación e importación.

### Comisionistas y fiducias

- Menú nuevo dentro de cada empresa: **Comisionistas y fiducias**.
- Creación obligatoria con selección de país.
- Nombre libre para cualquier país.
- Catálogo colombiano incluido:
  - Fiduciaria Bancolombia
  - Fiduciaria Bogotá
  - Fidudavivienda
  - Fiduciaria de Occidente (Fiduoccidente)
  - Fiduciaria Popular
  - BBVA Asset Management S.A. Sociedad Fiduciaria
  - Fiducolpatria
  - Servitrust GNB Sudameris
  - Alianza Fiduciaria
  - Acción Fiduciaria
  - Fiducentral
  - Fiducoomeva
  - Skandia Sociedad Fiduciaria
  - Credicorp Capital Fiduciaria
  - trii
  - acciones y valores S.A.
- Listado y borrado lógico.
- Prevención de duplicados activos por empresa, país y nombre.

## Arquitectura

- Frontend: React 18, Vite, React Router, TanStack React Query y Tailwind CSS.
- Backend: Node.js 22, Express y PostgreSQL.
- Autenticación: JWT y autorización por empresa.
- Persistencia: PostgreSQL con `pgcrypto`, índices y borrado lógico.
- Worker: proceso independiente para importaciones y jobs de precios.
- Producción: Docker con Node 22 Alpine y Poppler instalado.

## Requisitos

- Node.js 22 o compatible.
- PostgreSQL con una base de datos disponible.
- Para importaciones PDF, `poppler-utils` (`pdfinfo` y `pdftotext`). La imagen Docker ya lo instala.
- Una clave de proveedor de IA si se desea procesar extractos con el worker.

## Configuración

Copia `.env.example` a `.env` para ejecución local y completa los valores:

```env
DATABASE_URL=postgresql://usuario:contrasena@host:5432/finanzas
JWT_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
PDF_PASSWORD_SECRET=otra-clave-aleatoria-de-al-menos-32-caracteres
ADMIN_EMAIL=admin@tu-dominio.com
ADMIN_PASSWORD=una-contrasena-de-al-menos-12-caracteres
ADMIN_NAME=Administrador principal
```

`PDF_PASSWORD_SECRET` no es la clave del banco. Es la llave maestra usada para cifrar las claves de los PDFs almacenadas en la base de datos. No debe cambiarse después de guardar claves.

Para el worker de importación también configura la credencial y URL del proveedor de IA según el entorno. No guardes secretos reales en el repositorio.

## Ejecución local

```bash
npm install
npm run db:migrate
npm run dev:api
npm run dev
```

Para ejecutar el worker de importación en otro proceso:

```bash
npm run worker:import
```

La aplicación frontend de Vite se ejecuta normalmente en `http://localhost:5173` y la API en el puerto definido por `PORT` o `3000`.

## Docker y despliegue

El `Dockerfile` instala dependencias, compila el frontend, ejecuta la migración y levanta la API junto con el worker de importaciones. En Coolify u otro proveedor define como mínimo:

- `DATABASE_URL`
- `JWT_SECRET` con mínimo 32 caracteres
- `PDF_PASSWORD_SECRET` con mínimo 32 caracteres
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` con mínimo 12 caracteres
- Credenciales del proveedor de IA para importaciones, si se usarán

El contenedor expone el puerto `3000`. La migración es idempotente y el superusuario inicial solo se crea si aún no existe.

## Scripts principales

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desarrollo del frontend con Vite |
| `npm run dev:api` | API local |
| `npm run build` | Compilación de producción del frontend |
| `npm run start` | API en producción |
| `npm run db:migrate` | Aplicar esquema y migraciones |
| `npm run worker:import` | Worker de importaciones |
| `npm run worker:precios` | Worker de actualización de precios |
| `npm run verificar` | Verificar columnas esperadas |
| `npm run pruebas` | Suite de precios |
| `npm run pruebas:importacion` | Pruebas de importación |
| `npm run pruebas:exportacion` | Pruebas de exportación |
| `npm run verificar:admin` | Verificación administrativa |

## API principal

Todos los recursos empresariales requieren autenticación JWT y acceso a la empresa correspondiente.

- `/api/auth/login`, `/api/auth/me`
- `/api/empresas` y resumen empresarial
- `/api/empresas/:empresaId/bancos`
- `/api/empresas/:empresaId/cuentas`
- `/api/cuentas/:cuentaId/pdf-password`
- `/api/cuentas/:cuentaId/movimientos`
- `/api/empresas/:empresaId/brokers`
- `/api/brokers/:brokerId/movimientos`
- `/api/brokers/:brokerId/activos`
- `/api/brokers/:brokerId/precios`
- `/api/empresas/:empresaId/wallet-providers`
- `/api/empresas/:empresaId/wallets`
- `/api/wallets/:walletId/movimientos`
- `/api/empresas/:empresaId/comisionistas-fiducias`
- `/api/empresas/:empresaId/import-jobs`
- `/api/empresas/:empresaId/precios-jobs`
- `/api/health`

## Verificación

La compilación frontend se verifica con:

```bash
npm run build
git diff --check
node --check server/index.mjs
node --check server/migrate.mjs
```

## Seguridad

- No subas `.env`, tokens, claves bancarias ni credenciales de IA al repositorio.
- Revoca inmediatamente cualquier token compartido accidentalmente.
- Usa secretos aleatorios largos en producción.
- Conserva el mismo `PDF_PASSWORD_SECRET` durante toda la vida útil de las claves PDF cifradas.
- El acceso a empresas y recursos se valida en el backend, no solo en la interfaz.

## Licencia

No se ha definido una licencia pública para este proyecto.
