# Arquitectura — FinanzAdmin Pro

## Qué se está construyendo

FinanzAdmin Pro es un SaaS multiempresa para gestión administrativa y financiera. Un superadministrador gestiona empresas y usuarios; cada empresa tiene cuentas bancarias, brokers, wallets, movimientos, importaciones de PDF y precios.

## Arquitectura actual

```text
React/Vite ──► Node/Express API ──► PostgreSQL
                         │
                         ├── worker-import  (PDF → texto → Pateway Claude Haiku)
                         └── worker-precios (cola y barrido de precios)
```

| Pieza | Implementación |
|---|---|
| Frontend | React 18, Vite, Tailwind y React Query |
| API | Node.js, Express, JWT |
| Base de datos | PostgreSQL privado en Coolify |
| Contraseñas | bcrypt |
| Importación | Worker Node.js, `pdftotext` y Pateway (Anthropic Messages) |
| Precios | Worker Node.js y APIs de mercado |
| Despliegue | Dockerfile y Coolify |

La aplicación principal sirve el frontend compilado y la API desde el mismo contenedor. `server/schema.sql` es la fuente de verdad del esquema y `server/migrate.mjs` aplica el esquema de forma idempotente.

## Reglas de diseño

1. Toda entidad financiera pertenece a una empresa mediante `empresa_id`.
2. El backend valida JWT y acceso a empresa en cada endpoint protegido.
3. El frontend nunca contiene secretos de base de datos, JWT o NVIDIA.
4. El dinero usa tipos `numeric` en PostgreSQL; no se usan floats para saldos.
5. Los borrados financieros son lógicos mediante `deleted_at` cuando corresponde.
6. Las importaciones se procesan asíncronamente mediante `import_jobs`.
7. Los PDFs se guardan en el almacenamiento local configurado por `IMPORT_STORAGE_DIR`.
8. La extracción de texto se ejecuta con `pdftotext`; Nemotron recibe texto, no el PDF binario.
9. Los workers comparten `DATABASE_URL` con la API.
10. PostgreSQL debe permanecer privado y contar con backups antes de cargar datos productivos.

## Estructura principal

- `src/`: frontend y cliente de la API.
- `server/index.mjs`: endpoints, autenticación y autorización.
- `server/schema.sql`: tablas, índices y vistas.
- `server/migrate.mjs`: migración y creación del administrador inicial.
- `worker-import.mjs`: procesamiento de PDFs con Pateway Claude Haiku.
- `worker-precios.mjs`: actualización de precios.
- `deploy/`: ejemplos de servicios y variables de workers.
- `scripts/`: verificadores y pruebas locales.

## Flujo de importación

1. El usuario selecciona empresa, destino y PDF.
2. La API valida JWT, permisos, destino, tamaño y firma `%PDF`.
3. La API guarda el archivo y crea un job `pendiente`.
4. El worker obtiene el job, convierte el PDF a texto y llama a Pateway (Anthropic Messages).
5. La respuesta se valida, se deduplican movimientos y se guarda el resultado.
6. La interfaz consulta el estado hasta `hecho` o `error`.

## Operación

Los cambios de esquema se realizan en `server/schema.sql`; después se ejecuta `npm run db:migrate`. Antes de publicar se ejecutan `npm run build`, `npm run verificar` y las suites de pruebas relevantes.
