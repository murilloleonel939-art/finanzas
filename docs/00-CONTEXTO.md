# CONTEXTO — FinanzAdmin Pro (handoff entre chats)

> **Este archivo es el punto de entrada.** Si abres un chat nuevo, pega este documento
> completo como primer mensaje. Contiene todo lo necesario para continuar sin releer
> el PRD ni reconstruir las decisiones ya tomadas.

---

## 1. Qué se está construyendo

**FinanzAdmin Pro** — SaaS multi-tenant para gestión administrativa y financiera de
múltiples empresas. El PRD completo está en `docs/PRD.md`.

Resumen: un super administrador gestiona empresas clientes y sus usuarios. Cada empresa
tiene tres ramas paralelas — **cuentas bancarias**, **brokers** y **wallets cripto/fiat**.
Los datos financieros se ingresan a mano o se **importan desde PDFs** mediante IA. Los
productos **Earn** (staking/savings) tienen tratamiento especial con reglas por proveedor.

## 2. Estado actual

**Se construye desde cero.** El workspace estaba vacío al iniciar. La app original descrita
en el PRD vive en Base44 (`https://fin-core-admin.base44.app`) y **no se migra**: se
reconstruye. No hay datos que preservar.

## 3. Arquitectura decidida

| Pieza | Dónde vive |
|---|---|
| Base de datos (Postgres + RLS) | **Supabase Cloud** — proyecto propio en supabase.com |
| Auth (email/password + Google OAuth) | Supabase Cloud |
| Storage (PDFs de extractos) | Supabase Cloud — bucket **privado** con URLs firmadas |
| Realtime | Supabase Cloud — requiere añadir tablas a la publicación |
| Edge Functions | Supabase Cloud — solo tareas cortas |
| **Frontend (React + Vite)** | **EC2 + Coolify** |
| **Worker de IA** (extracción PDFs) | **EC2 + Coolify** — NO en Edge Functions |

**Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui + lucide-react.
**Routing:** react-router-dom v6. **Data:** @tanstack/react-query + supabase-js.

## 4. Decisiones tomadas (no volver a preguntar)

Estas ya se discutieron y están cerradas. El detalle y el razonamiento están en
`docs/01-DECISIONES.md`.

1. **Se reconstruye desde cero**, no se migra Base44.
2. **Supabase Cloud** para datos/auth/storage. EC2/Coolify solo para frontend y worker IA.
3. **`numeric` para todo el dinero**, nunca float. `numeric(20,8)` montos, `numeric(28,10)` cantidades.
4. **Sin conversión de moneda.** La moneda es atributo de cada entidad (cuenta, broker, wallet).
   Los resúmenes muestran **subtotales por moneda**, una línea por moneda, **sin total
   consolidado**. No hay tabla `tipos_cambio` ni `empresas.moneda_base`.
5. **`cliente` es dueño de la empresa con acceso COMPLETO de escritura** — crear cuentas,
   importar, exportar, editar. Igual que `contador`.
6. **`cliente` y `contador` tienen los mismos permisos dentro de la empresa.** La única
   diferencia posible es en operaciones destructivas (ver decisión 7).
7. **Borrado lógico con `deleted_at`** en lugar de `DELETE` físico. Protege el histórico
   financiero y evita cascadas irreversibles.
8. **`UserEmpresa.rol` es la única fuente de verdad** de permisos por empresa. `app_role`
   queda reducido a `super_admin` vs `usuario` (sirve para redirect post-login y estadísticas).
9. **Se eliminan los campos desnormalizados** (`empresa_nombre`, `banco_nombre`,
   `broker_nombre`, `cuenta_numero`, `wallet_direccion`). Se resuelven con **vistas** que
   hacen JOIN, y un adaptador en el frontend para no tocar los componentes.
10. **`external_id` + índice único** para deduplicar importaciones de PDF.
11. **Se elimina `PendingUser`**. Las invitaciones usan `auth.admin.inviteUserByEmail` +
    trigger en `auth.users` que crea el profile y los vínculos `user_empresa` (atómico).
12. **La extracción de PDFs corre en un worker en EC2**, no en Edge Functions (límite de
    tiempo de reloj). Con tabla `import_jobs` para estado, historial y errores.
13. **`wallet_saldos`** como tabla aparte: una wallet puede tener saldo en varias monedas
    a la vez (BTC + ETH + USDT). `Wallet.monto` escalar no lo soporta.
14. **Precios desde una API de mercado real** (Finnhub / Alpha Vantage / Yahoo), NO pidiéndole
    precios a un LLM con búsqueda web como hace el PRD original.
15. **RDS no se usa** para la base — se descartó por incompatibilidad de extensiones.

## 5. Contradicciones del PRD ya resueltas

El PRD original tiene inconsistencias internas. Estas son las resoluciones adoptadas:

| Contradicción | Resolución |
|---|---|
| §8.2 vs §8.3: "invertido" = egresos con "subscription" vs "suma de egresos" | Usar **egresos con "subscription"** (§8.2) |
| §8.2 vs §8.3: "redimido" = ingresos con "redemption" vs "otros ingresos" | Usar **ingresos con "redemption"** (§8.2, confirmado por §15.2.3) |
| §6.4 `PrecioActivo` admin-only vs §6.5 pestaña Precios visible a todos | Abrir **lectura** a quien tenga acceso a la empresa; escritura solo admin |
| §15.5 importar desde tarjeta del proveedor sin wallet asignada | La importación **exige elegir wallet destino** antes de subir el PDF |
| §2.1 `role` y `app_role` redundantes | Colapsar en un campo: `app_role` |
| §5.3 `orden`: "menor = más reciente arriba" | Usar `orden` entero, ascendente = orden de aparición |

## 6. Reglas de negocio clave

- **Importación:** solo movimientos con status `complete`/`completed`. Monto siempre positivo,
  `tipo` indica dirección. Fecha `YYYY-MM-DD`. Moneda individual por fila.
- **Earn:** Coindepo = todos sus movimientos son Earn (`EARN_ALL_MOVEMENTS_PROVIDERS`).
  Otros proveedores: solo descripciones con `earn|subscription|interest|staking|savings|redemption|redeem`.
- **Intereses ganados:** ingresos cuyo concepto coincide con `interes|interest|rendimiento|ganancia|yield`.
- **Salidas (neto) Earn:** `recompensas + redimido - invertido`.
- **Opción "Otro"** en formularios de banco, broker y proveedor de wallet para nombres fuera de catálogo.

## 7. Cómo continuar

Ver `docs/02-PLAN.md` para la lista de fases y cuál es la siguiente.
Ver `docs/03-PROMPT-CONTINUACION.md` para el texto exacto que hay que pegar en un chat nuevo.

**Regla de trabajo:** construir por fases pequeñas. Al terminar cada fase, actualizar
`docs/02-PLAN.md` marcándola como completada, y añadir cualquier decisión nueva a
`docs/01-DECISIONES.md`.
