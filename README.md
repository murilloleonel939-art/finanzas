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
- Filtros por año y período mensual; el año más reciente se selecciona inicialmente y cada año conserva su historial sin mezclar cálculos.
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
- Los detalles de brokers separan movimientos y cálculos por año, manteniendo el historial de años anteriores disponible mediante el selector anual.

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

### Resumen financiero de empresa

- El resumen muestra las monedas fiat disponibles con saldo total positivo, incluyendo COP, USD y cualquier otra divisa fiat registrada.
- Las monedas se presentan separadas, sin conversiones entre divisas, en patrimonio, concentración del dinero y rendimientos.

### Wallets y Earn

- Proveedores de wallet de tipo cripto, fiat o ambos.
- Wallets por proveedor, dirección y moneda.
- Las wallets DolarApp pueden contener dos o más monedas; cada movimiento conserva la moneda y la regla que indique el extracto importado.
- En DolarApp, el extracto define las monedas disponibles y sus reglas de interpretación; la wallet no fuerza USD ni una moneda única.
- El selector de moneda principal sincroniza el saldo inicial de la primera fila, permitiendo crear correctamente wallets en EUR y otras divisas.
- Saldos por moneda y recálculo de saldos.
- Movimientos de wallet con deduplicación e importación.
- Importación de extractos desde PDF, CSV, XLS y XLSX con reglas por proveedor; los proveedores sin reglas propias usan la extracción genérica.
- Regla específica de DolarApp: normaliza USDT y USDC como USDC, interpreta `Compra USDc` y `Compra EURc` como ingresos, y `Venta USDc` y `Venta EURc` como egresos/débitos.
- Para operaciones DolarApp con moneda equivalente `COP`, conserva `TRM`, `M. de compra`, `valorTrm` y `Diferencia cambio` como datos de análisis separados del saldo de la wallet.
- Regla específica de Plenti: la moneda se guarda como `USDT` aunque el extracto la relacione con `USD`; `Recarga` se importa como ingreso, y `Compra` y `Transferencia` como egresos.
- En Plenti, solo las transacciones `Transferencia` llenan `TRM`, `M. de compra`, `valorTrm` y `Diferencia cambio`: consulta la TRM del día, toma `valor en pesos` del PDF como `M. de compra`, calcula `valorTrm = TRM * monto` y `Diferencia cambio = valorTrm - M. de compra`.
- Regla específica de Binance: el historial usa columnas `Hora`, `Cuenta`, `Operación`, `Moneda`, `Cambiar` y `Comentario`; conserva el orden exacto del archivo. El valor de `Cambiar` se guarda sin conversiones ni cálculos adicionales, incluida su precisión (por ejemplo, `0.00000002`), y solo su signo define la dirección: positivo es ingreso y negativo es egreso. Para Binance no se registran ni resumen comisiones aunque la descripción incluya `fee`; todos los movimientos se tratan exclusivamente como entradas o salidas.
- Operaciones observadas en el ejemplo Binance: `Simple Earn Flexible Interest`, `Simple Earn Flexible Subscription`, `Transfer Funds to Spot`, `Transfer Funds to Funding Wallet`, `Withdraw`, `P2P Trading`, `Merchant Acquiring`, `Merchant Payment`, `Card - Transaction`, `Binance Convert`, `Deposit`, `Flexible Loan` y movimientos de equities.
- La importación Binance lee directamente todos los registros de Excel, CSV y tablas PDF compatibles, sin depender de extracción asistida para esas filas.
- En el resumen **Earn** de Binance, el saldo por moneda es `suscripciones - redenciones` y nunca se presenta negativo: cuando el historial parcial deja más redenciones que suscripciones, se muestra `0` sin modificar los movimientos.
- En **Activos** de Binance, el total por moneda tampoco se presenta negativo. Los residuos negativos producidos por historial parcial o transferencias internas entre Spot y Funding se muestran como `0`, conservando los importes originales de ingresos y egresos.
- **P2P de Binance** se importa por separado desde la pestaña **P2P** de una wallet Binance, usando el archivo Excel de historial C2C (`.xls` o `.xlsx`). Solo se guardan órdenes con estado `Completed` y los pedidos se deduplican por número de orden dentro de la wallet.
- El historial P2P conserva fecha, tipo de orden, activo, tipo fiat, precio, cantidad, tipo de cambio, tarifa de creador, comisión de tomador y contraparte. Permite filtrar por año, período y tipo fiat, y consolida la diferencia de cambio positiva y negativa del filtro activo.
- Las órdenes P2P permanecen aisladas de `movimientos_wallet` y `wallet_saldos`: no modifican movimientos, saldos, **Total** de activos ni **Intereses ganados**. En Activos, **Comisiones P2P (informativo)** solo complementa activos ya existentes y se presenta por moneda.
- Monedas observadas en el ejemplo Binance: principalmente `USDT`, además de `SHELL`, `USDC`, `EQ_VZ`, `BTC`, `COS`, `TON`, `GRAM`, `FUN` y `DENT`.
- El detalle de movimientos muestra esas columnas de diferencial cambiario para DolarApp y Plenti, y también las incluye en la exportación.
- El importador reconoce también la fila literal completa, por ejemplo `Venta EURc - 4.99 COP - 18,001 ALE*** MUN***`, extrayendo el monto EUR y su equivalente COP.
- Para compras, la diferencia de cambio es `valorTrm - M. de compra`; para ventas, es `M. de compra - valorTrm`. En EURc, la TRM EUR/COP se obtiene combinando EUR/USD con la TRM oficial USD/COP del día.
- Las transferencias P2P y otros movimientos EURc que no indiquen explícitamente compra o venta no reciben cálculo de diferencial cambiario.
- El resumen muestra un único cuadro de **Diferencial cambiario** en COP, separado en diferencias positivas y negativas, con dos decimales.
- El detalle de movimientos DolarApp muestra fechas y montos compactos, recorta descripciones largas con opción para desplegarlas y omite la columna Saldo.
- Cada movimiento importado se vincula con el job que lo creó, lo que permite borrar la última importación desde el detalle de la wallet sin afectar los movimientos manuales ni los de otros archivos.
- El detalle de la wallet concentra todas las acciones en la cabecera: **Exportar**, **Registrar movimiento**, **Importar extracto** y un menú **Borrar** con las dos formas de deshacer.
- **Borrar última importación** elimina solo lo que creó el último archivo, conservando los movimientos manuales y los de otros archivos.
- **Borrar todos los datos** vacía la wallet —todos sus movimientos— y deja el saldo en cero, para rehacer pruebas o reimportar un extracto desde cero. La wallet, su proveedor y su dirección se conservan; el borrado es lógico, así que nada desaparece de la base.
- **Reglas exclusivas de Coindepo** al importar: `Interest Payment` entra como ingreso y es el único concepto que cuenta como interés generado; `Deposit` como ingreso; `Withdrawal` como egreso; `Loan Withdrawal` con valor positivo entra a la cuenta (y con valor negativo sale); `Loan Repayment` con valor negativo sale de la cuenta (y con valor positivo entra).
- Para préstamos Coindepo se conserva el signo indicado en el PDF durante la extracción. Por ejemplo, `Loan Repayment -13.00865441 USDT` se importa como egreso por `13.00865441 USDT`; si el extractor devuelve el monto positivo por error, el worker usa el tipo extraído como respaldo. La base guarda el monto positivo y representa la salida mediante `tipo = egreso`.
- Los movimientos de préstamo (`Loan Withdrawal`, `Loan Repayment`) **nunca cuentan como intereses generados**: entra dinero que hay que devolver, no un rendimiento del capital. Por eso se excluyen explícitamente de «Intereses ganados» y de «Total recompensas».
- La casilla **Crédito** se muestra únicamente en wallets del proveedor **Coindepo**. Se calcula por moneda usando los movimientos: suma `Loan Withdrawal` positivos como crédito otorgado, suma los `Loan Repayment` negativos como pagos y muestra **Intereses del crédito** como la diferencia absoluta entre pagos y crédito otorgado.
- Configuración y consulta de activos Earn.
- El detalle de wallets separa movimientos, activos y Earn por año; el filtro mensual se aplica dentro del año elegido.
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
- Listado y borrado lógico de comisionistas y fiducias.
- Creación de cuentas asociadas a cada fiducia usando únicamente nombre o número de cuenta.
- Visualización jerárquica en el menú lateral: fiducia y sus cuentas, con opción para crear una cuenta.
- Borrado lógico individual de cuentas y borrado de la fiducia con sus cuentas asociadas.
- Prevención de duplicados activos por empresa, país y nombre.
- Las cuentas de **Fiduciaria Bancolombia** tienen detalle propio con pestañas **Activo** y **Movimientos**. En **Activo** se selecciona un año y, dentro de él, un mes específico o **Todo lo transcurrido del año**. La tarjeta y la tabla histórica responden a esa selección: para un mes muestran su saldo anterior, rendimientos netos, nuevo saldo y rentabilidad del periodo tal como se importó del extracto; para el acumulado muestran el saldo anterior del primer mes cargado, el nuevo saldo del último mes cargado y la suma de los rendimientos netos de los meses cargados.
- La **rentabilidad del periodo** en la vista acumulada es una **estimación**: rendimientos netos sumados ÷ saldo anterior del primer mes cargado × 100. No se suman ni se capitalizan las tasas indicadas en los PDF. Se advierte si faltan meses desde enero o si los saldos sugieren ajustes no desglosados; aportes y retiros pueden hacer que el porcentaje estimado difiera de la rentabilidad real.
- La pestaña Movimientos queda pendiente del extracto con adiciones y retiros reales para poder implementar y verificar su importación.
- El detalle importa exclusivamente extractos PDF Bancolombia y extrae tipo de fondo, saldo anterior, rendimientos netos, nuevo saldo y rentabilidad del periodo.
- Para extractos **Fiducuenta** de Fiduciaria Bancolombia, el worker usa `pdftotext -layout` y lee los saldos según las columnas de cada bloque del PDF, aunque los encabezados se extraigan con espacios entre letras. Esto corrige el error «No se pudo leer el saldo anterior» y evita confundir los rendimientos con el nuevo saldo.
- En el extracto de enero de 2026 comprobado, los valores son: saldo anterior **447,61 COP**, rendimientos netos **2,53 COP**, nuevo saldo **450,14 COP** y rentabilidad del periodo **6,87 %**. La importación de ese PDF también fue confirmada como funcional en la aplicación.
- Para extractos unificados de **Acciones y Valores / trii**, la cuenta permite importar PDF protegido con clave guardada cifrada. El importador extrae el resumen de activos y el detalle de fondos, y valida la conciliación de saldos.
- Los extractos sin saldo en fondos se aceptan si informan saldo FIC de cero; el efectivo se conserva como efectivo y no se registra como adición ficticia a un fondo. Si el resumen reporta saldo FIC distinto de cero sin detalle, la importación se rechaza.
- El detalle de cuenta permite elegir un corte mensual o **Todo lo transcurrido del año**. En el acumulado, el saldo anterior y el nuevo saldo corresponden a los extremos del periodo; adiciones, retiros, rendimientos, pagos de rendimientos e impuestos se suman entre los extractos cargados. Los fondos conservan el mismo orden alfabético en cada vista.
- El resumen anual muestra los activos del último corte disponible, sin sumar saldos mensuales repetidos, y agrega rendimientos de fondos e impuestos (GMF y retenciones) del periodo seleccionado.
- La rentabilidad anual estimada se calcula a partir de los rendimientos cargados respecto del saldo inicial o la primera adición; no se suman tasas mensuales del extracto.
- La clasificación de riesgo de los fondos puede consultarse desde su ficha junto con el enlace a la fuente oficial, cuando está disponible.
- Las demás fiducias no aceptan este importador.

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

El `Dockerfile` instala dependencias, compila el frontend y ejecuta `npm run db:migrate` al arrancar el contenedor, antes de iniciar la API y ambos workers (importaciones y precios). Si la migración falla, no arranca el servicio. En Coolify selecciona el despliegue con este `Dockerfile` y define como mínimo:

- `DATABASE_URL`
- `JWT_SECRET` con mínimo 32 caracteres
- `PDF_PASSWORD_SECRET` con mínimo 32 caracteres
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` con mínimo 12 caracteres
- Credenciales del proveedor de IA para importaciones, si se usarán

El contenedor expone el puerto `3000`. Coolify aplica la migración en cada despliegue o reinicio del contenedor; no hay que ejecutarla manualmente allí. La migración es idempotente y el superusuario inicial solo se crea si aún no existe.

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
- `/api/wallets/:walletId/saldos`
- `/api/wallets/:walletId/p2p-binance`
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
