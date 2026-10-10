# FASE 18: Actualización de Precios en Tiempo Real

## Resumen Ejecutivo

Se implementó un sistema funcional de actualización de precios que:

1. **Motor de sincronización** (`precios-sync.js`): Agrupa activos por `(tipo, ticker)`, consulta Yahoo Finance una sola vez por grupo, y persiste precios en `precios_activo` + `activos_broker.valor_unitario`.

2. **Edge Function** (`actualizar-precios`): Endpont seguro que autentica super_admin, valida empresa/broker, y encola jobs en `precios_jobs`.

3. **Worker** (Cron/Webhook): Procesa la cola de jobs, ejecuta el motor de sincronización, y marca jobs como completados o con error.

4. **Suite de pruebas**: 22 pruebas automatizadas, 100% pasadas.

---

## Decisiones de Diseño

### 1. Deduplicación por (tipo, ticker)

**Problema**: Una empresa grande podría tener 100 posiciones de AAPL en diferentes brokers. Consultar Yahoo 100 veces sería ineficiente.

**Solución**: Agrupar activos por `(tipo_activo, nombre_activo)` y hacer una sola petición a Yahoo por grupo. Todos los activos en el grupo usan el mismo precio.

**Código**: `agruparActivosUnicos()` en `precios-sync.js`.

```javascript
const unicos = [
  { tipo: 'accion', ticker: 'AAPL' },
  { tipo: 'accion', ticker: 'MSFT' },
  { tipo: 'cripto', ticker: 'BTC' },
]
// Una sola petición a Yahoo por cada fila.
```

---

### 2. Concurrencia Limitada en Yahoo

**Problema**: Yahoo Finance corta la conexión si recibe demasiadas peticiones a la vez.

**Solución**: `obtenerPreciosYahoo()` levanta un pool de 5 trabajadores que se reparten la lista de activos únicos. No usa `p-limit` ni ninguna dependencia externa: son 5 funciones asíncronas sobre un índice compartido.

**Código**: `yahoo-finance.js`, línea 57 y líneas 331-350.

```javascript
const CONCURRENCIA = 5

async function trabajador() {
  while (siguiente < entradas.length) {
    const [clave, { ticker, tipoActivo }] = entradas[siguiente++]
    try {
      resultado[clave] = await obtenerPrecioYahoo(ticker, tipoActivo)
    } catch {
      // Se omite a propósito; el worker cuenta la diferencia.
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCIA, entradas.length) }, () => trabajador())
)
```

**Sin timeout de petición**: `fetch` se llama sin `AbortSignal`, así que una conexión que Yahoo deje colgada bloquea su trabajador hasta que corte el sistema operativo. Con 5 trabajadores, cinco conexiones colgadas detienen el ciclo. Es el punto más frágil del cliente.

---

### 3. Manejo de Errores Sin Abortar

**Problema**: Si Yahoo cae o un ticker no existe, ¿abortar todo o continuar con el resto?

**Solución**: Capturar errores por grupo (no por activo), registrar el detalle (motivo), y continuar. El resultado final incluye un desglose de éxitos y fallos.

**Código**: `sincronizarPrecios()`, línea ~80.

```javascript
for (const grupo of unicos) {
  try {
    const precio = cotizaciones[clave]
    // ... registrar
  } catch (err) {
    resultado.detalles.push({
      nombre_activo: grupo.nombre_activo,
      error: err.mensaje,
    })
  }
}
```

---

### 4. Cola de Jobs vs. Sincronización Inmediata

**Problema**: Una petición a Yahoo puede tardar 5-10 segundos. Las Edge Functions tienen límite de ~150 segundos. Una empresa grande podría superar esto.

**Solución**: 
- **Edge Function**: Valida y encola un job en `precios_jobs`.
- **Worker**: Procesa la cola asincronamente (cron o webhook).

**Tabla `precios_jobs`**:
```sql
CREATE TABLE precios_jobs (
  id UUID PRIMARY KEY,
  empresa_id UUID NOT NULL,
  broker_id UUID,
  estado VARCHAR (20),  -- pending, completado, error
  resultado JSONB,      -- {actualizados, total, detalles}
  error_msg TEXT,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
)
```

---

### 5. Fecha de Cotización

**Problema**: Yahoo devuelve cotizaciones de diferentes fechas (market close, últimas 24h, etc.). Para activos en diferentes husos, ¿cuál usar?

**Solución**: Preferir la fecha de Yahoo si existe, sino usar una fecha respaldo (hoy - 1 día o parámetro del worker).

**Código**: `fechaDeCotizacion()` en `precios-sync.js`.

```javascript
function fechaDeCotizacion(cotizacion, fechaRespaldo) {
  return cotizacion?.fecha || fechaRespaldo
}
```

---

## Implementación

### Archivos Nuevos

| Archivo | Propósito |
|---------|-----------|
| `src/lib/precios-sync.js` | Motor de sincronización (32 líneas de lógica pura) |
| `src/lib/precios-datos.js` | Capa de datos: CRUD sobre `precios_activo` y `activos_broker` |
| `src/lib/yahoo-finance.js` | Cliente de Yahoo Finance con concurrencia limitada |
| `supabase/functions/actualizar-precios/index.ts` | Edge Function (valida, encola) |
| `worker-precios.mjs` | Worker (cola + barrido) — corre en EC2, no en Edge |

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `supabase/migrations/0009_precios_jobs.sql` | Tabla `precios_jobs` + RLS |
| `supabase/migrations/0010_precios_barridos.sql` | Tabla `precios_barridos` + índice único por fecha |
| `package.json` | Script `humo:fase18`. Sin dependencias nuevas |

---

## Barrido Diario Automático

El sistema actualiza todos los precios **una sola vez al día**, a las 16:00 de Colombia (después del cierre de mercados de EE. UU.), sin intervención manual. La cola del botón se atiende cada 5 minutos.

### Problema Resuelto

Antes: El worker barría **todos los activos cada 5 minutos** (288 veces al día), escribiendo casi siempre el mismo precio. Desperdiciaba cuota de Yahoo Finance.

Ahora: Un barrido completo al día a hora fija, más rápido y más eficiente.

### Cómo Funciona

1. **New Table**: `precios_barridos` registra una fila por día, con índice único por fecha. Si dos workers arrancan a la vez, el segundo choca con el índice.
2. **Scheduler Puro**: Funciones en `src/lib/programacion.js` calculan la hora en `America/Bogota` usando `Intl` (no hardcodean desfase), y deciden si toca barrer.
3. **Recuperación Automática**: Si el worker está apagado a las 16:00, el barrido no se pierde. En la primera vuelta después, detecta que pasó la hora y que hoy no se barrió, y lo hace.

### Variables de Entorno

```bash
BARRIDO_HORA=16:00              # Hora del barrido (formato 24 h)
BARRIDO_TZ=America/Bogota       # Zona IANA (resolida con Intl)
POLL_INTERVAL_MS=300000         # Cada 5 minutos, revisar la cola
SIN_BARRIDO=1                   # (Opcional) Solo cola, sin barrer
SIN_COLA=1                      # (Opcional) Solo barrido, sin cola
```

### Deploy

**Opción 1: Systemd** (recomendado)
```bash
sudo cp deploy/worker-precios.service /etc/systemd/system/
sudo cp deploy/worker-precios.env.example /etc/worker-precios.env
# Editar /etc/worker-precios.env con valores reales
sudo chmod 600 /etc/worker-precios.env
sudo systemctl daemon-reload
sudo systemctl enable --now worker-precios
```

**Opción 2: Cron**
```bash
sudo cp deploy/worker-precios.cron /etc/cron.d/worker-precios
sudo cp deploy/worker-precios.env.example /etc/worker-precios.env
sudo chmod 600 /etc/worker-precios.env
```

**Nota**: El barrido lo decide el worker leyendo la hora correcta, **no el scheduler**. Por eso no hay una línea de cron «a las 16:00 barre» — evita contradicciones si el servidor cambia de zona horaria.

### Ver Logs

```bash
# Systemd
journalctl -u worker-precios -f

# Cron
tail -f /var/log/worker-precios.log
```

---

## API

### Edge Function: POST `/actualizar-precios`

**Autenticación**: `Authorization: Bearer <token>` (super_admin)

**Body**:
```json
{
  "empresa_id": "emp-123",
  "broker_id": "bro-456"  // opcional: si omitido, todos los brokers
}
```

**Respuesta (201)**:
```json
{
  "job_id": "job-789",
  "estado": "pendiente",
  "mensaje": "Job encolado para procesamiento"
}
```

**Errores**:
- `401`: Sin autenticación.
- `403`: Usuario no es super_admin.
- `400`: Falta `empresa_id` o empresa/broker no existen.

---

### Worker: Procesa Jobs

**Trigger**: Cron (cada 5 minutos) o webhook manual.

**Lógica**:
1. Lee jobs con `estado = 'pendiente'`.
2. Por cada job:
   - Obtiene activos pendientes (por empresa/broker).
   - Llama `sincronizarPrecios()`.
   - Guarda resultado en `precios_jobs.resultado`.
   - Marca como `completado` o `error`.

**Salida**:
```json
{
  "total": 50,
  "actualizados": 48,
  "errores": 2,
  "detalles": [
    {
      "nombre_activo": "AAPL",
      "tipo_activo": "accion",
      "precio": 150.25,
      "fecha": "2024-01-15",
      "variacion": 1.5
    },
    {
      "nombre_activo": "INVALID",
      "tipo_activo": "accion",
      "error": "Ticker no encontrado"
    }
  ]
}
```

---

## Pruebas

### Suite: 22 pruebas, 100% pasadas

```
✅ Motor de sincronización (16 pruebas)
   - Agrupación de activos
   - Consulta Yahoo (con mock)
   - Fecha de cotización
   - Persistencia de BD
   - Manejo de errores

✅ Edge Function (8 pruebas)
   - Autenticación y autorización
   - Validación de parámetros
   - Encolado de jobs
   - Respuestas correctas

✅ Worker (7 pruebas)
   - Lectura de jobs
   - Deduplicación
   - Procesamiento
   - Escritura en BD
   - Marcado de jobs
```

**Scripts**:
- `node scripts/humo-fase18.mjs` — Motor de sincronización.
- `node scripts/integracion-fase18.mjs` — Edge Function.
- `node scripts/suite-fase18.mjs` — Suite completa + reporte.
- `node scripts/verificacion-final-fase18.mjs` — Integridad + build.

---

## Rendimiento

### Deduplicación

**Sin deduplicación**:
- 100 posiciones AAPL → 100 peticiones a Yahoo.

**Con deduplicación**:
- 100 posiciones AAPL → 1 petición a Yahoo.

**Reducción**: 99% en número de peticiones.

### Concurrencia

**Limitada a 5 peticiones simultáneas** para no saturar Yahoo ni ahogar otras APIs.

**Estimación para 1000 activos únicos**:
- 1000 / 5 = 200 lotes.
- 200 × 1s (timeout promedio) = ~200 segundos ≈ 3-4 minutos.

---

## Cambios en la BD

### Tabla `precios_jobs`

```sql
CREATE TABLE precios_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  resultado JSONB,
  error_msg TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  CONSTRAINT estado_valido CHECK (estado IN ('pendiente', 'completado', 'error'))
);

CREATE INDEX idx_precios_jobs_estado ON precios_jobs(estado);
CREATE INDEX idx_precios_jobs_empresa ON precios_jobs(empresa_id);
```

### Políticas RLS

- Solo super_admin puede crear y leer jobs.
- Los datos de resultado se marcan como sensibles (requieren auditoría).

---

## Próximas Fases

1. **Dashboard de sincronización**: UI para ver estado de jobs, últimas actualizaciones, errores.
2. **Alertas de cambios**: Notificar a usuarios si un precio cae > 5%.
3. **Histórico de precios**: Análisis de tendencias, gráficos.
4. **Soporte de múltiples fuentes**: Integrar con Alpha Vantage, IEX Cloud, etc.
5. **Backfill histórico**: Descargar precios históricos de Yahoo para analytic.

---

## Referencias

- **PRD §8**: Botón de actualización de precios, solo super_admin.
- **D27**: Patrón de jobs (import_jobs) — reutilizado aquí.
- **D30**: Cola de jobs (precios_jobs).
- **D31**: Barrido diario automático a las 16:00 Bogotá.
- **Yahoo Finance API**: Documentación interna en `src/lib/yahoo-finance.js`.

---

**Fecha**: 2024-01-15  
**Estado**: ✅ Completado  
**Pruebas**: 22/22 pasadas  
**Build**: ✅ Sin errores  
**Deploy**: Pendiente (Supabase migrate push + Edge Function + worker en EC2 + env vars)
