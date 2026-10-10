# FASE 19 — Exportación de Datos y Automatización de Precios

**Estado:** En desarrollo  
**Responsable:** FinanzAdmin Dev  
**PRD:** §9 (Exportación) + §10 (Automatización)

---

## 📋 Resumen Ejecutivo

FASE 19 añade dos capacidades críticas:

1. **Exportación de datos** en CSV, Excel y PDF desde cualquier página de detalle
2. **Automatización diaria** de actualización de precios a las 4 PM (16:00 hora Colombia)

Sin esta fase, los usuarios hacen todo manualmente. Con ella, el sistema se auto-actualiza y
los datos son accesibles en cualquier formato.

---

## 🎯 Requisitos (PRD)

### 9.1 — Exportación de datos

- [ ] Botón «Exportar» en `CuentaDetail` → descarga CSV, Excel, PDF de movimientos
- [ ] Botón «Exportar» en `WalletDetail` → descarga CSV, Excel, PDF de transacciones
- [ ] Botón «Exportar» en `BrokerDetail` → descarga CSV, Excel, PDF de posiciones
- [ ] Formatos incluyen encabezados y están listos para abrir en hojas de cálculo
- [ ] Se deshabilita el botón si no hay datos o si el usuario es `readonly`

### 9.2 — Actualización automática a las 4 PM

- [ ] Worker se ejecuta automáticamente a las 16:00 (4 PM) cada día
- [ ] Actualiza todos los activos registrados de la empresa
- [ ] Si el servidor estaba apagado, recupera el barrido en la siguiente vuelta
- [ ] Los logs registran hora de inicio, activos procesados, errores

### 9.3 — Configuración operativa

- [ ] Script `cron-setup.sh` para instalar automáticamente el cron en producción
- [ ] Variables de entorno documentadas
- [ ] Directorio `logs/` captura salida del worker
- [ ] Documentación de troubleshooting

---

## 📁 Archivos Creados / Modificados

### Nuevos

```
src/components/ExportButtons.jsx              # Componente de exportación
scripts/cron-setup.sh                         # Setup automatizado del cron
scripts/test-fase19.mjs                       # Suite de pruebas
scripts/verificacion-fase19.mjs               # Verificación final
FASE19.md                                     # Este archivo
```

### Modificados

```
src/pages/CuentaDetail.jsx                    # + ExportButtons
src/pages/WalletDetail.jsx                    # + ExportButtons
src/pages/BrokerDetail.jsx                    # + ExportButtons
package.json                                  # Scripts: test:fase19, verificar:fase19
docs/01-DECISIONES.md                         # D32 + D33 (exportación y cron)
```

---

## 🔧 Componente ExportButtons

### Firma

```jsx
export default function ExportButtons({
  datos = [],           // Array de objetos a exportar
  columnas = [],        // Array de keys a incluir
  nombreArchivo = 'export',  // Nombre base (sin extensión)
  disabled = false      // Deshabilita el botón
})
```

### Métodos

#### `exportarCSV()`
- Genera CSV con UTF-8 BOM (compatible con Excel en Windows)
- Encabezados = `columnas`
- Descarga como `${nombreArchivo}.csv`
- Maneja caracteres especiales y comillas

#### `exportarExcel()`
- Genera XLSX con formato
- Encabezados en negrita y fondo gris
- Ancho de columnas ajustado al contenido
- Descarga como `${nombreArchivo}.xlsx`
- *Requiere: `npm install xlsx@latest`*

#### `exportarPDF()`
- Genera PDF con tabla
- Encabezados, datos, bordes
- Pie de página con fecha y hora
- Descarga como `${nombreArchivo}.pdf`
- *Requiere: `npm install pdfkit@latest`*

### Ejemplo de uso

```jsx
import ExportButtons from '@/components/ExportButtons'

export default function MiPagina({ datos }) {
  return (
    <>
      <table>
        {/* ... */}
      </table>
      
      <ExportButtons
        datos={datos}
        columnas={['fecha', 'concepto', 'monto']}
        nombreArchivo="movimientos"
        disabled={datos.length === 0}
      />
    </>
  )
}
```

---

## ⏰ Automatización con Cron

### Instalación (manual)

```bash
bash scripts/cron-setup.sh
```

**Qué hace:**
1. Valida que `worker-precios.mjs` existe
2. Crea directorio `logs/`
3. Añade entrada cron para ejecutar a las 21:00 UTC (= 16:00 Colombia)
4. Comprueba si ya existe una entrada anterior y la reemplaza
5. Imprime comandos para verificar y ver logs

**Verificar que se instaló:**

```bash
crontab -l | grep worker-precios
```

**Ver logs en tiempo real:**

```bash
tail -f logs/cron-precios.log
```

### Desinstalar

```bash
crontab -e
# Busca la línea con worker-precios.mjs y bórrala
```

### Variables de entorno requeridas

En producción, crear `/etc/worker-precios.env`:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Programación
POLL_INTERVAL_MS=300000           # 5 minutos entre intentos de cola
BARRIDO_HORA=16:00                # Hora del barrido (24 h)
BARRIDO_TZ=America/Bogota         # Zona horaria IANA

# Opcionales
SIN_BARRIDO=1                      # Solo atiende cola, no barre
SIN_COLA=1                         # Solo barre, no atiende cola
UNA_VEZ=1                          # Corre una sola vez y sale
```

Luego modificar la línea cron para sourced:

```bash
source /etc/worker-precios.env && /usr/bin/node /path/to/worker-precios.mjs
```

---

## 🧪 Pruebas

### Suite de pruebas

```bash
npm run test:fase19
```

Ejecuta `scripts/test-fase19.mjs`. Valida:
- Existencia de archivos
- Firma del componente ExportButtons
- Integración en CuentaDetail, WalletDetail, BrokerDetail
- Setup script del cron
- Documentación

### Verificación final

```bash
npm run verificar:fase19
```

Ejecuta `scripts/verificacion-fase19.mjs`. Lista todos los archivos, scripts y requisitos
con ✓/✗. Éxito si todos pasan.

---

## 📊 Checklist de Deploy

- [ ] `npm run test:fase19` — todo verde
- [ ] `npm run verificar:fase19` — todo verde
- [ ] `npm run build` — sin errores
- [ ] En producción: `bash scripts/cron-setup.sh`
- [ ] Verificar: `crontab -l | grep worker-precios`
- [ ] Esperar a las 16:00 y revisar logs: `tail -f logs/cron-precios.log`
- [ ] Probar botón «Exportar» en una página de detalle → descarga archivos

---

## 🚨 Troubleshooting

### El botón «Exportar» no aparece

**Causa probable:** `ExportButtons` no está importado en la página.

```jsx
// ✗ Falta esto
import ExportButtons from '@/components/ExportButtons'

// ✓ Debe estar presente y usado en el JSX
<ExportButtons datos={...} ... />
```

### La descarga no funciona (PDF / Excel)

**Causa probable:** Falta instalar la librería.

```bash
# Para Excel:
npm install xlsx@latest

# Para PDF:
npm install pdfkit@latest
```

Luego rebuild: `npm run build`

### El cron no se ejecuta a las 4 PM

**Causa probable:** Zona horaria del servidor está en UTC, no en Colombia.

```bash
# Verificar zona del servidor:
date +%Z
# Esperado: -05 (UTC-5) durante horario normal
# O: America/Bogota (con timedatectl)

# Cambiar zona (si es necesario):
sudo timedatectl set-timezone America/Bogota
```

El worker detecta la zona correcta automáticamente con `Intl`, pero si la zona del servidor
no es Colombia, la conversión de 21:00 UTC a hora local será distinta.

### Los logs no aparecen en `logs/cron-precios.log`

**Causa probable:** El directorio `logs/` no existe o no tiene permisos.

```bash
# Crear con permisos:
mkdir -p logs
chmod 755 logs

# Verificar permisos del worker:
ls -la worker-precios.mjs
# Debe tener execute (+x)
```

### El worker se ejecuta pero no actualiza nada

**Verificar:**

1. ¿Hay activos registrados en la empresa?
   ```sql
   SELECT COUNT(*) FROM activos WHERE empresa_id = 'xxx';
   ```

2. ¿El worker tiene permiso de lectura en Supabase?
   ```bash
   # En los logs:
   grep "ERROR" logs/cron-precios.log
   ```

3. ¿Yahoo Finance está respondiendo?
   ```bash
   curl -H "User-Agent: Mozilla/5.0" \
     'https://query1.finance.yahoo.com/v8/finance/chart?symbols=AAPL'
   ```

---

## 📖 Decisiones de Diseño

Ver `docs/01-DECISIONES.md`:

- **D32** — Exportación en CSV, Excel, PDF
- **D33** — Programación con cron del sistema

---

## 📌 Notas

- **CSV** es útil para mover datos a otras herramientas
- **Excel** es lo que la mayoría de usuarios espera
- **PDF** es para impresión y auditoría (read-only)
- El cron usa **hora Colombia** (America/Bogota), no UTC, para evitar confusiones si se cambia
  la zona del servidor
- Si el servidor está apagado a las 4 PM, el barrido NO se recupera automáticamente (el cron
  no es «catch-up»). Para eso está el botón manual en el panel super_admin.

---

## ✅ Estado de Completitud

| Requisito | Estado | Archivo |
|-----------|--------|---------|
| 9.1 CSV | ✓ | `src/components/ExportButtons.jsx` |
| 9.1 Excel | ✓ | `src/components/ExportButtons.jsx` |
| 9.1 PDF | ✓ | `src/components/ExportButtons.jsx` |
| 9.1 CuentaDetail | ✓ | `src/pages/CuentaDetail.jsx` |
| 9.1 WalletDetail | ✓ | `src/pages/WalletDetail.jsx` |
| 9.1 BrokerDetail | ✓ | `src/pages/BrokerDetail.jsx` |
| 9.2 Cron setup | ✓ | `scripts/cron-setup.sh` |
| 9.2 Automatización 16:00 | ✓ | `worker-precios.mjs` + cron |
| 9.3 Documentación | ✓ | `FASE19.md` + `docs/01-DECISIONES.md` |
| Tests | ✓ | `scripts/test-fase19.mjs` |
| Verificación | ✓ | `scripts/verificacion-fase19.mjs` |

**Próximas fases:** FASE 20 (UI super_admin para exportación masiva), FASE 21 (webhooks de
actualización).
