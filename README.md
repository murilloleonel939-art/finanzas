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
- Regla específica para el banco Dale: extrae y guarda el saldo inicial y el saldo final del archivo sin convertirlos en movimientos. También clasifica correctamente los movimientos según el extracto: abonos/créditos/ingresos suman y débitos/retiros/pagos/salidas restan.
- Los importes de Dale admiten formatos colombianos como `1.234.567,89` y se normalizan conservando su valor numérico completo.
- Los saldos de Dale se detectan mediante etiquetas como `Saldo inicial`, `Saldo final`, `Saldo de apertura` y `Saldo de cierre`, incluso cuando el monto aparece en la línea siguiente.
- Las reglas especiales de Nequi se conservan sin cambios: `Saldo anterior` permanece como movimiento inicial y no se suma como ingreso operativo.
- La lógica específica de saldos y clasificación solo se aplica cuando el banco es Dale; los demás bancos mantienen su flujo normal.
- Las cuentas bancarias y wallets conservan validación estricta: si un movimiento no tiene fecha, tipo, monto o descripción, la importación se rechaza.
- Los brokers usan una validación tolerante para extractos tabulares: se ignoran encabezados, subtotales, totales, saldos y filas de continuación incompletas, conservando los movimientos válidos.
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
- Movimientos de caja y operaciones de compra o venta con cantidades y valores unitarios.
- Cálculo de caja, valor de activos, inversión, costo de posiciones y comisiones por moneda.
- Ganancia o pérdida bruta y resultado después de comisiones.
- Importación de extractos del broker desde PDF, CSV, XLS y XLSX, con procesamiento asíncrono de movimientos y posiciones/activos.
- Cada fila importada se vincula con el job que la creó, lo que permite borrar la última importación completa desde el detalle del broker (movimientos y activos) sin afectar el historial de precios.
- Configuración específica para el broker `quotex`: muestra únicamente movimientos, oculta activos, precios y asesor, y permite importar extractos y borrar la última importación.
- Los archivos tabulares de Quotex se leen usando sus columnas reales (`Información`, `Beneficio`, `ID`, `Tiempo de apertura`, `Cantidad` e `Ingreso`). El resultado se calcula como `Ingreso - Cantidad` y el `ID` evita duplicados.
- En Quotex, las operaciones importadas muestran par, dirección y beneficio; la inversión aparece en **Cantidad**, la clase es **Operación** y se calcula un saldo acumulado por movimiento.
- Quotex incluye un cuadro independiente de **Saldo actual** y una columna **Saldo** en la tabla de movimientos. Los depósitos y retiros se reservan para entradas y salidas de dinero del broker.
- Activos de inversión: acciones, ETF, bonos, fondos, criptomonedas, opciones y otros.
- Precios históricos por activo.
- Actualización manual y automática de precios mediante jobs y workers.
- Pestañas de **Movimientos**, **Activos**, **Precios** y **Asesor** en el detalle de los brokers compatibles; `quotex` muestra exclusivamente **Movimientos**.
- El **Asesor** funciona únicamente con los datos locales registrados y no se conecta con Interactive Brokers.

### Dashboard financiero de empresa

- Resumen visual en `/empresa/:empresaId` con el patrimonio total separado en COP y USD.
- Consolidación de saldos provenientes de cuentas bancarias, brokers y wallets.
- Desglose por categoría para identificar dónde está concentrado el dinero.
- Barras visuales de concentración por categoría y moneda.
- Rendimientos e intereses acumulados separados en COP y USD.
- Las ganancias de operaciones de brokers se incluyen en el resumen de rendimientos.
- No se convierten ni se suman directamente monedas diferentes.

### Asesor informativo de portafolio

- Vista consolidada por empresa en `/empresa/:empresaId/asesor-portafolio`.
- Pestaña **Asesor** junto a **Precios** en `/empresa/:empresaId/brokers/:brokerId`.
- Usa exclusivamente brokers, activos, movimientos y precios ya registrados en Finanzas.
- Analiza únicamente brokers que tengan activos registrados; los brokers sin posiciones, como Quotex, quedan fuera del análisis.
- Muestra posiciones, valor actual, capital invertido, ganancia o pérdida y rentabilidad.
- Separa los resultados por moneda y no convierte ni suma divisas diferentes.
- Identifica la concentración de la posición principal.
- Presenta observaciones sobre concentración, resultados, monedas y comisiones.
- Mantiene las comisiones separadas del costo bruto de inversión.
- Incluye recomendaciones de carácter informativo basadas en los datos disponibles.
- No se conecta con la API de Interactive Brokers.
- No envía órdenes ni ejecuta operaciones.
- No reemplaza la asesoría financiera profesional.

### Desafío de ahorro

- Módulo disponible en `/empresa/:empresaId/desafio-ahorro`.
- Permite configurar una meta con nombre, cantidad de depósitos, incremento, frecuencia y fecha de inicio.
- Permite marcar depósitos, consultar el progreso y seguir el ahorro acumulado.
- Permite guardar varias metas personalizadas, cargarlas cuando sea necesario y continuar alimentando su progreso.
- Las metas y el progreso se guardan localmente en el navegador, separados por empresa.

### Wallets y Earn

- Proveedores de wallet de tipo cripto, fiat o ambos.
- Wallets por proveedor, dirección y moneda.
- Saldos por moneda y recálculo de saldos.
- Movimientos de wallet con deduplicación e importación.
- Importación de extractos desde PDF, CSV, XLS y XLSX con reglas por proveedor; los proveedores sin reglas propias usan la extracción genérica.
- Cada movimiento importado se vincula con el job que lo creó, lo que permite borrar la última importación desde el detalle de la wallet sin afectar los movimientos manuales ni los de otros archivos.
- El detalle de la wallet concentra todas las acciones en la cabecera: **Exportar**, **Registrar movimiento**, **Importar extracto** y un menú **Borrar** con las dos formas de deshacer.
- **Borrar última importación** elimina solo lo que creó el último archivo, conservando los movimientos manuales y los de otros archivos.
- **Borrar todos los datos** vacía la wallet —todos sus movimientos— y deja el saldo en cero, para rehacer pruebas o reimportar un extracto desde cero. La wallet, su proveedor y su dirección se conservan; el borrado es lógico, así que nada desaparece de la base.
- **Reglas exclusivas de Coindepo** al importar: `Interest Payment` entra como ingreso y es el único concepto que cuenta como interés generado; `Deposit` como ingreso; `Withdrawal` como egreso; `Loan Withdrawal` con valor positivo entra a la cuenta (y con valor negativo sale); `Loan Repayment` con valor negativo sale de la cuenta (y con valor positivo entra).
- Los movimientos de préstamo (`Loan Withdrawal`, `Loan Repayment`) **nunca cuentan como intereses generados**: entra dinero que hay que devolver, no un rendimiento del capital. Por eso se excluyen explícitamente de «Intereses ganados» y de «Total recompensas».
- Configuración y consulta de activos Earn.
- Catálogo de monedas fiat y cripto con precisión específica por moneda.
- No se realiza conversión automática entre divisas.

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
| `npm run pruebas:importacion` | Pruebas de importación, incluido el flujo específico de Dale |
| `npm run pruebas:exportacion` | Pruebas de exportación |
| `npm run verificar:admin` | Verificación administrativa |

## Rutas principales de la interfaz

| Ruta | Función |
| --- | --- |
| `/login` | Inicio de sesión. |
| `/register` | Registro de usuario. |
| `/workspace` | Empresas disponibles. |
| `/admin` | Panel de superadministración. |
| `/empresa/:empresaId` | Resumen de empresa. |
| `/empresa/:empresaId/bancos` | Bancos y cuentas. |
| `/empresa/:empresaId/brokers` | Lista de brokers. |
| `/empresa/:empresaId/brokers/:brokerId` | Movimientos, activos, precios y asesor del broker. |
| `/empresa/:empresaId/asesor-portafolio` | Asesor consolidado de portafolio. |
| `/empresa/:empresaId/desafio-ahorro` | Metas y seguimiento del desafío de ahorro. |
| `/empresa/:empresaId/wallets` | Proveedores y wallets. |
| `/empresa/:empresaId/comisionistas-fiducias` | Comisionistas y fiducias. |

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
