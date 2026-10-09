# PRD — FinanzAdmin Pro

> Versión **condensada** del PRD original (mismo contenido sustantivo, sin la prosa de
> visión/objetivo). Es la referencia de reglas de negocio para la construcción.

SaaS multi-tenant para gestión administrativa y financiera de múltiples empresas. Un super
administrador gestiona empresas y usuarios; cada empresa tiene bancos, cuentas, brokers con
activos y precios, y wallets cripto/fiat con movimientos. Todo se importa desde PDFs mediante
IA. **En esta versión se reconstruye sobre Supabase Cloud** (ver `01-DECISIONES.md`).

---

## 1. Roles y usuarios

### app_role (global)
| Valor | Significado |
|---|---|
| `super_admin` | Panel de administración completo: empresas, usuarios, todo |
| `usuario` | Acceso solo a las empresas asignadas vía `user_empresa` |

**`estado`:** `activo` / `inactivo`. Un usuario `inactivo` no puede ingresar.

> Nota: el PRD original tenía `app_role` con tres valores (`super_admin`/`contador`/`cliente`)
> más un campo `role` redundante. Según **D6**, se colapsa a dos valores y el rol dentro de
> cada empresa vive en `user_empresa.rol`.

### user_empresa.rol
`contador` / `cliente`. **Ambos tienen los mismos permisos dentro de la empresa** (D5, D6):
crear cuentas, importar PDFs, exportar, editar movimientos. El super admin ve todo.

### Flujo de invitación (rediseñado — D10)
1. Admin llama a la Edge Function `invitar-usuario`.
2. `auth.admin.inviteUserByEmail(email, { data: { full_name, app_role, estado, empresa_ids } })`.
3. Trigger `on auth.users insert` crea el `profile` y los vínculos `user_empresa`. **Atómico.**

Sin `PendingUser`, sin `checkInvitation`, sin `claimPendingUser`.

### Reglas
- No se puede cambiar el email de un usuario existente.
- Los usuarios se invitan; no se crean directamente.
- `super_admin` es el único que crea/edita/suspende **empresas**.

---

## 2. Entidad Empresa

`nombre` (req), `estado` (`activa`/`suspendida`), `pais`.
Lectura: quien tenga acceso. Escritura: solo `super_admin`.

---

## 3. Jerarquía financiera

```
Empresa
├── Cuentas      → Banco → Cuenta → Movimiento
├── Brokers      → Broker → MovimientoBroker | ActivoBroker → PrecioActivo
└── Wallets      → WalletProvider → Wallet → MovimientoWallet
                                  └── WalletSaldos (por moneda)
```

**Toda entidad financiera tiene `empresa_id`.** El aislamiento es por empresa vía RLS (D14).

---

## 4. Cuentas bancarias

### Banco
`empresa_id` (req), `pais` (req), `nombre_banco` (req).
Catálogo: `src/lib/bancosPorPais.js` — Colombia, México, Argentina, Chile, Perú, Ecuador,
España, Estados Unidos, Panamá. **Opción "Otro"** para nombres fuera del catálogo.

### Cuenta
`empresa_id` (req), `banco_id` (req), `monto` (default 0), `numero_cuenta` (req),
`tipo_cuenta` (`ahorros`/`corriente`, default `ahorros`), `tipo_moneda` (default `COP`).

### Movimiento
`empresa_id`, `banco_id`, `cuenta_id` (req), `fecha` (req), `descripcion` (req),
`tipo` (`ingreso`/`egreso`, req), `monto` (req, **siempre positivo**), `orden`.

### Vista CuentaDetail
Tarjetas: saldo actual, ingresos del periodo, egresos del periodo, intereses y
retenciones/impuestos. Filtro por mes. Alta manual de movimientos. Importación desde PDF.
Exportación CSV/Excel/PDF. Tabla paginada ordenada por `fecha` + `orden`.

---

## 5. Brokers

### Broker
`empresa_id` (req), `nombre_broker` (req), `moneda` (req — moneda base de la caja).

### MovimientoBroker
`empresa_id`, `broker_id` (req), `fecha` (req), `descripcion` (req),
`tipo` (req): `ingreso` (depósito o venta) / `egreso` (retiro o compra),
`monto` (req, absoluto en divisa base), `cantidad` (solo compras/ventas),
`valor_unitario` (solo compras/ventas).

### ActivoBroker
`empresa_id`, `broker_id` (req), `nombre_activo` (req — ticker),
`tipo_activo` (`accion`/`bono`/`fondo`/`etf`/`cripto`/`cdat`/`otro`, default `accion`),
`cantidad` (req), `valor_unitario` (req), `moneda` (default `USD`).

### PrecioActivo
`empresa_id`, `broker_id`, `activo_id` (req), `nombre_activo` (req), `tipo_activo`,
`fecha` (req), `precio_cierre` (req), `precio_anterior`, `variacion_pct`, `moneda` (default `USD`).

**Escritura solo `super_admin`**; **lectura abierta a quien tenga acceso a la empresa**
(resuelve la contradicción §6.4 vs §6.5 del PRD original).

### Vista BrokerDetail
Tres pestañas: **Movimientos** (filtrable por mes) / **Activos** (cantidad, valor unitario,
valor total) / **Precios** (historial con variación %).
Importación de extractos desde PDF. Botón de actualización de precios.

---

## 6. Wallets

### WalletProvider
`empresa_id` (req), `tipo` (`cripto`/`fiat`/`ambos`, req), `nombre_proveedor` (req).
Catálogo: `src/lib/walletProviders.js`. **Opción "Otro"**.

### Wallet
`empresa_id` (req), `proveedor_id` (req), `tipo` (denormalizado del proveedor),
`nombre_wallet` (req), `direccion`, `tipo_moneda` (req, default `USD`).

> **Cambio:** `monto` escalar eliminado → tabla `wallet_saldos` (una fila por moneda), porque
> una wallet puede tener saldo simultáneo en BTC, ETH y USDT (D12).

### MovimientoWallet
`empresa_id`, `proveedor_id`, `wallet_id` (req), `fecha` (req), `descripcion` (req),
`tipo` (`ingreso`/`egreso`, req), `monto` (req), `tipo_moneda` (default `USD`).

---

## 7. Productos Earn

### Clasificación
**Mecanismo 1 — palabras clave:** descripción contiene
`earn|subscription|interest|staking|savings|redemption|redeem`.
**Mecanismo 2 — proveedor "todo es Earn":** `EARN_ALL_MOVEMENTS_PROVIDERS = ["coindepo"]`.
Todos los movimientos de esos proveedores son Earn.

### Métricas del periodo
| Métrica | Cálculo |
|---|---|
| Total invertido | Suma de **egresos con "subscription"** |
| Total recompensas | Suma de **ingresos con "interest"** |
| Redimido | **Ingresos con "redemption"** |
| Salidas (neto) | `recompensas + redimido - invertido` |

> Resuelve la contradicción §8.2 vs §8.3 del PRD original (que definía "redimido" como
> "otros ingresos no interest", incluyendo depósitos normales). Se adopta la definición de §8.2.

### Activos Earn (agrupados por moneda)
- **Saldo** = `invertido - redimido`
- **Invertido** = suma de egresos
- **Rendimiento** = ingresos con "interest"
- **Redimido** = egresos... *(ver nota)*

Solo se muestran activos con algún valor distinto de cero.

### Vista WalletDetail — dos variantes
**A) Proveedores "todo es Earn" (Coindepo) — pantalla única, sin pestañas:**
tarjetas de resumen (saldo inicial, total ingresos, total egresos, **intereses ganados**,
saldo final), filtro por mes, tabla de movimientos con importar/exportar.
Sin pestaña Earn y sin desglose de activos.
**Intereses ganados:** ingresos cuyo concepto coincide con regex
`interes|interest|rendimiento|ganancia|yield` (`esInteres`).

**B) Resto de proveedores — con pestañas:**
1. **Movimientos:** tarjetas (saldo inicial, ingresos, egresos, saldo final), tabla por mes, importar.
2. **Earn:** resumen Earn, activos por moneda, tabla de movimientos Earn.

---

## 8. Importación desde PDF

### `importarMovimientos`
**Params:** `file_url` (req), `proveedor` (opcional, aplica reglas específicas).
**Flujo:** autentica → valida `file_url` → carga reglas del proveedor → construye prompt →
invoca LLM con PDF adjunto y JSON schema → filtra inválidos → **filtro de status** →
`saldo_calculado = saldo_anterior + neto`.
**Retorna:** `{ movimientos, saldo_anterior, saldo_actual_pdf, saldo_calculado }`.

**Reglas críticas del prompt:**
- Extraer solo filas que son movimientos reales (no encabezados, totales ni saldos).
- Incluir todas las filas de todas las páginas.
- Monto siempre positivo (valor absoluto); `tipo` indica dirección.
- Fecha en `YYYY-MM-DD`.
- Moneda individual de cada fila si hay columna de moneda.
- Status individual de cada fila si hay columna de status.
- No inventar movimientos.

**Filtro de status:** si el movimiento trae `status`, solo se aceptan `complete` o `completed`.
`pending`, `failed`, `processing` se descartan.

### Reglas por proveedor (`providerRules.ts`)
Objeto extensible `PROVIDER_RULES`, clave = nombre del proveedor en minúscula.
**Regla actual — Coindepo:** *"Este es un extracto de Coindepo, una plataforma de productos
Earn/Staking. Todos los movimientos corresponden a productos Earn (suscripciones, intereses,
redenciones, recompensas). Extrae TODOS los movimientos tal como aparecen, preservando el tipo
de producto Earn en la descripción. Las columnas pueden incluir: Date, Type, Amount, Coin,
Status, Product, etc."*

### `importarBrokerDatos`
**Params:** `file_url`, `broker_id`, `broker_nombre`, `empresa_id`, `empresa_nombre`, `moneda`.
Extrae movimientos de "Depósitos y retiradas" (depósito = ingreso, retirada = egreso) y de
"Operaciones" (compra = egreso, venta = ingreso); activos de "Posiciones abiertas".
Clasifica ETFs (VOO, VTI, SPY, QQQ, VEA, VWO, BND, BNDX) vs acciones, y CDATs.
**Retorna:** `{ movimientosCreados, activosCreados }`.

### `actualizarPreciosActivos`
**Params:** `broker_id` (opcional). **Solo `super_admin`.**
Obtiene activos → tickers únicos → busca precios → por cada uno: último precio anterior,
calcula `variacion_pct`, crea `PrecioActivo` con fecha de hoy, actualiza
`activos_broker.valor_unitario`.
**Retorna:** `{ actualizados, total, detalles }`.

> **Cambio (D13):** los precios vienen de una **API de mercado** (Finnhub/Alpha Vantage/Yahoo),
> no de un LLM con búsqueda web. El modelo `gemini_3_8_flash` del PRD original es un alias
> interno de Base44 y no existe fuera de ahí.

---

## 9. MonthFilter (compartido)

`src/components/shared/MonthFilter.jsx`. Usado en `WalletEarn`, `CuentaDetail`, `BrokerDetail`,
`WalletDetail`.
- `getMesesDisponibles(movimientos)` → meses únicos `YYYY-MM`, descendente.
- `formatMes(ym)` → `2026-10` → `Octubre 2026`.
- `filtrarPorMes(movimientos, mes)` → `"all"` devuelve todos.
UI: Select con "Acumulado (todos)" + cada mes.

---

## 10. Rutas

| Ruta | Componente |
|---|---|
| `/login` | Login (email + Google) |
| `/register` | Register (con OTP) |
| `/forgot-password` | ForgotPassword |
| `/reset-password` | ResetPassword |
| `/` | Home → redirect por rol (`/admin` o `/workspace`) |
| `/workspace` | Workspace |
| `/admin` | AdminLayout → AdminDashboard |
| `/admin/empresas` | EmpresasPage |
| `/admin/usuarios` | UsuariosPage |
| `/empresa/:empresaId` | EmpresaLayout → EmpresaOverview |
| `/empresa/:empresaId/cuentas/crear-banco` | CrearBanco |
| `/empresa/:empresaId/cuentas/banco/:bancoId/crear-cuenta` | CrearCuenta |
| `/empresa/:empresaId/cuentas/banco/:bancoId/cuenta/:cuentaId` | CuentaDetail |
| `/empresa/:empresaId/brokers/crear-broker` | CrearBroker |
| `/empresa/:empresaId/brokers/broker/:brokerId` | BrokerDetail |
| `/empresa/:empresaId/wallets/crear-proveedor` | CrearWalletProvider |
| `/empresa/:empresaId/wallets/proveedor/:proveedorId/crear-wallet` | CrearWallet |
| `/empresa/:empresaId/wallets/proveedor/:proveedorId/wallet/:walletId` | WalletDetail |

Rutas autenticadas tras `ProtectedRoute`; las de admin requieren `super_admin`.

### Sidebar de empresa (EmpresaLayout)
Tres secciones expandibles:
- **Cuentas:** "Crear banco" + bancos (→ cuentas + "Crear cuenta").
- **Brokers:** "Crear broker" + brokers.
- **Wallets:** "Crear proveedor" + proveedores (→ wallets + "Crear wallet").

Botón de papelera al hover sobre cada cuenta y broker → diálogo de confirmación → borrado.
Datos cargados con `Promise.all` + suscripciones realtime.

---

## 11. Panel de administración

- **AdminDashboard:** tarjetas de estadísticas (empresas registradas/activas, contadores,
  clientes) + lista de empresas recientes.
- **EmpresasPage:** CRUD completo (`EmpresaDialog`).
- **UsuariosPage:** lista con rol y estado, invitación, edición de `app_role`/`estado`,
  asignación de empresas (`UsuarioDialog`).

---

## 12. Exportación

`src/lib/exportUtils.js` → **CSV**, **Excel**, **PDF**. Usado en `CuentaDetail` y `WalletDetail`.

---

## 13. Eliminación (rediseñada — D7)

El PRD original borraba en cascada desde el frontend (frágil: si se cierra la pestaña a mitad
quedan huérfanos). **Ahora se usa borrado lógico** (`deleted_at`) más `ON DELETE CASCADE` en
las FKs, lo que además lo hace atómico.

Alcance de las cascadas:
- Eliminar banco → cuentas → movimientos.
- Eliminar cuenta → movimientos.
- Eliminar broker → movimientos, activos y precios.
- Eliminar proveedor de wallet → wallets → movimientos y saldos.

Todas requieren diálogo de confirmación.

**Importación desde la tarjeta del proveedor:** para proveedores con reglas específicas
(Coindepo), la importación se lanza desde la tarjeta del proveedor en `CrearWalletProvider`.
**Requiere elegir wallet destino antes de subir** (resuelve el hueco del §15.5 original).

---

## 14. Catálogos

**Bancos por país:** Colombia, México, Argentina, Chile, Perú, Ecuador, España, Estados
Unidos, Panamá.

**Proveedores de wallet:**
- **ambos:** PayPal, Wise, Payoneer, Revolut, Mercado Pago, N26, Crypto.com, Bitso, Buda,
  Nexo, Wirex, Coinbase, Binance, Coindepo.
- **cripto:** Binance, MetaMask, Trust Wallet, Coinbase, Kraken, Bybit, KuCoin, OKX, Ledger,
  Trezor, Phantom, Exodus, Electrum, Atomic Wallet, Guarda, Crypto.com, Bitfinex, Gate.io,
  Huobi, Bitso, Buda, Paxful.
- **fiat:** PayPal, Payoneer, Wise, Skrill, Neteller, Venmo, Zelle, Apple Pay, Google Pay,
  Samsung Pay, Mercado Pago, Revolut, N26, Paysera, EcoPayz, MuchBetter, Jeton, Stripe,
  Square, Adyen.

**Monedas cripto:** BTC, ETH, USDT, USDC, BNB, SOL, XRP, ADA, DOT, MATIC, LINK, AVAX, DOGE,
SHIB, LTC.
**Monedas fiat:** USD, EUR, COP, MXN, ARS, CLP, PEN, BRL, GBP.

**Proveedores Earn:** `EARN_ALL_MOVEMENTS_PROVIDERS = ["coindepo"]`.

---

## 15. Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui + lucide-react, react-router-dom v6,
  @tanstack/react-query.
- **Backend:** Supabase Cloud (Postgres + RLS + Auth + Storage + Realtime + Edge Functions).
- **IA:** API de extracción de PDFs (a elegir) para importación; API de mercado para precios.
- **Deploy:** frontend y worker en EC2 + Coolify.

---

## 16. Limitaciones conocidas

1. No se pueden cambiar emails de usuarios existentes.
2. ~~Cron no disponible en plan Free~~ → **resuelto**: `pg_cron` existe en Supabase Cloud.
3. Posibles retrasos en el correo de verificación.
4. ~~Archivos subidos públicos y permanentes~~ → **resuelto**: bucket privado con URLs firmadas.

---

## 17. Pendientes de decidir

- **Borrado destructivo:** ¿lo puede hacer `cliente` o solo `contador` + `super_admin`? (D6)
- **Proveedor de IA** para la extracción de PDFs (bloquea FASE 17).
- **API de mercado** para precios (bloquea FASE 18).
- **Plan de Supabase:** Free no tiene backups y pausa el proyecto por inactividad — inviable
  con datos financieros reales. Decidir antes de cargar datos.
