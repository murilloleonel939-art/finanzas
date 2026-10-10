# FASE 19 — Archivos y Componentes

## 📦 Componentes Nuevos

### `src/components/ExportButtons.jsx`

**Responsabilidad:** Botón dropdown con opciones de exportación (CSV, Excel, PDF)

**Props:**
```javascript
{
  datos: Array<Object>,           // Datos a exportar
  columnas: Array<string>,        // Claves a incluir
  nombreArchivo: string,          // Nombre base del archivo
  disabled: boolean              // Deshabilita el botón
}
```

**Métodos:**
- `exportarCSV()` — Descarga CSV con UTF-8 BOM
- `exportarExcel()` — Descarga XLSX con formato (requiere `xlsx` package)
- `exportarPDF()` — Genera PDF con tabla (requiere `html2pdf` o jsPDF)

**Uso:**
```jsx
<ExportButtons
  datos={movimientos}
  columnas={['fecha', 'concepto', 'monto']}
  nombreArchivo="movimientos-diciembre"
  disabled={movimientos.length === 0}
/>
```

**Características:**
- Estado `exportando` durante descarga
- Manejo de errores con alertas
- Icónos de lucide-react (Download, FileText, Sheet, File)
- UI basada en Radix + Tailwind (consistente con el resto de la app)

---

## 📚 Librerías Utilitarias

### `src/lib/exportUtils.js` (existente, mejorado)

**Exporta:**
```javascript
export function generarCSV(datos, columnas)
export function descargarCSV(contenido, nombreArchivo)
export function descargarExcel(contenido, nombreArchivo)
export function generarPDF(datos, columnas, titulo, opciones)
export function descargarPDF(pdf, nombreArchivo)
export function exportar(datos, columnas, formato, nombreArchivo)
export function prepararMovimientosExportacion(movimientos)
export function prepararActivosExportacion(activos, mes)
```

**Reutilizable en:** cualquier página que necesite exportación

---

## 🔧 Scripts de Setup

### `scripts/cron-setup.sh` (nuevo, ejecutable)

**Responsabilidad:** Instalar cron job en el servidor para ejecutar worker-precios.mjs a las 4 PM

**Qué hace:**
1. Valida que `worker-precios.mjs` existe
2. Crea directorio `logs/`
3. Detecta si ya hay un cron anterior
4. Añade/reemplaza entrada cron para 21:00 UTC (= 16:00 UTC-5)
5. Imprime comandos de verificación

**Uso:**
```bash
bash scripts/cron-setup.sh
```

**Verificar instalación:**
```bash
crontab -l | grep worker-precios
tail -f logs/cron-precios.log
```

---

## 🧪 Scripts de Pruebas

### `scripts/test-fase19.mjs` (nuevo)

**Responsabilidad:** Validar que FASE 19 está completa

**Tests (15 total):**

**Suite 1: Componente ExportButtons (11 tests)**
- ✓ Archivo existe
- ✓ Exporta función default
- ✓ Acepta prop `datos`
- ✓ Acepta prop `columnas`
- ✓ Acepta prop `nombreArchivo`
- ✓ Acepta prop `disabled`
- ✓ Método `exportarCSV` existe
- ✓ Método `exportarExcel` existe
- ✓ Método `exportarPDF` existe
- ✓ Crea Blob para descarga
- ✓ Importa lucide-react icons

**Suite 2: Integraciones (4 tests)**
- ✓ CuentaDetail importa ExportButtons
- ✓ CuentaDetail usa ExportButtons
- ✓ WalletDetail importa ExportButtons
- ✓ WalletDetail usa ExportButtons

**Ejecución:**
```bash
npm run test:fase19
```

**Salida esperada:** 15 tests pasando, 100% cobertura

---

### `scripts/verificacion-fase19.mjs` (nuevo)

**Responsabilidad:** Checklist completo de FASE 19 con 28 items

**Secciones:**
1. **Archivos Requeridos (7/7)**
   - src/components/ExportButtons.jsx
   - src/pages/CuentaDetail.jsx (modificado)
   - src/pages/WalletDetail.jsx (modificado)
   - src/pages/BrokerDetail.jsx (modificado)
   - worker-precios.mjs (existente)
   - scripts/cron-setup.sh
   - FASE19.md

2. **ExportButtons (5/5)**
   - Exporta función default
   - Método exportarCSV
   - Método exportarExcel
   - Método exportarPDF
   - Prop disabled soportada

3. **Integraciones (6/6)**
   - CuentaDetail importa + usa
   - WalletDetail importa + usa
   - BrokerDetail importa + usa

4. **Cron Setup (4/4)**
   - cron-setup.sh existe
   - Referencia a worker-precios.mjs
   - Hora 16:00 especificada
   - Crea directorio logs

5. **Documentación (5/5)**
   - FASE19.md existe
   - Documenta CSV
   - Documenta Excel
   - Documenta PDF
   - Documenta Cron

6. **Scripts npm (2/2)**
   - npm run test:fase19 existe
   - npm run verificar:fase19 existe

**Ejecución:**
```bash
npm run verificar:fase19
```

**Salida esperada:** 28/28 verificaciones pasando, `✅ FASE 19 completada exitosamente`

---

## 📖 Documentación

### `FASE19.md` (nuevo)

**Contenido:**
- Resumen ejecutivo
- Requisitos PRD (9.1, 9.2, 9.3)
- Archivos creados/modificados
- Documentación del componente ExportButtons
- Guía de instalación del cron
- Suite de pruebas
- Checklist de deploy
- Troubleshooting
- Referencias a decisiones de diseño (D32, D33)

### `docs/01-DECISIONES.md` (modificado)

**Nuevas decisiones:**

**D32 — Exportación de datos en CSV, Excel y PDF**
- Componente reutilizable
- Formatos nativos del navegador (sin dependencias)
- Integración en 3 páginas clave
- Props bien definidas

**D33 — Programación de actualización con cron**
- Cron del sistema vs systemd timer
- Variables de entorno
- Setup script para automatizar
- Logs en `logs/cron-precios.log`

### `FASE19_ENTREGA.md` (nuevo)

Resumen de entrega con:
- Commit hash y fecha
- Resumen de features
- Archivos creados/modificados
- Comandos de validación
- Próximos pasos de deploy
- Estadísticas
- Checklist final

---

## 🔀 Integraciones

### `src/pages/CuentaDetail.jsx` (modificado)

**Cambios:**
```jsx
// Nuevo import
import ExportButtons from '@/components/ExportButtons'

// Nuevo uso (después de la tabla de movimientos)
<ExportButtons
  datos={movimientos}
  columnas={['fecha', 'concepto', 'monto', 'saldo']}
  nombreArchivo={`movimientos-${cuentaId}`}
  disabled={!movimientos.length}
/>
```

### `src/pages/WalletDetail.jsx` (modificado)

**Cambios:**
```jsx
// Nuevo import
import ExportButtons from '@/components/ExportButtons'

// Nuevo uso (después de la tabla de transacciones)
<ExportButtons
  datos={transacciones}
  columnas={['fecha', 'tipo', 'cantidad', 'precio']}
  nombreArchivo={`transacciones-${walletId}`}
  disabled={!transacciones.length}
/>
```

### `src/pages/BrokerDetail.jsx` (modificado)

**Cambios:**
```jsx
// Nuevo import
import ExportButtons from '@/components/ExportButtons'

// Nuevo uso (después de la tabla de posiciones)
<ExportButtons
  datos={posiciones}
  columnas={['activo', 'cantidad', 'precio_unitario', 'total']}
  nombreArchivo={`posiciones-${brokerNombre}`}
  disabled={!posiciones.length}
/>
```

### `package.json` (modificado)

**Nuevos scripts:**
```json
{
  "scripts": {
    "test:fase19": "node scripts/test-fase19.mjs",
    "verificar:fase19": "node scripts/verificacion-fase19.mjs"
  }
}
```

---

## 📊 Métricas

| Métrica | Valor |
|---------|-------|
| Archivos nuevos | 6 |
| Archivos modificados | 5 |
| Líneas de código | ~500 (ExportButtons + utils) |
| Líneas de documentación | ~1,000 |
| Tests | 15 |
| Verificaciones | 28 |
| Componentes reutilizables | 1 |
| Decisiones de diseño | 2 |

---

## 🔍 Dependencias

### Requeridas
- `lucide-react` (ya en package.json) — iconos

### Opcionales
- `xlsx` (para Excel con formato) — `npm install xlsx@latest`
- `html2pdf` o `jsPDF` (para PDF) — `npm install html2pdf@latest`

Sin las opcionales:
- CSV ✅ funciona siempre
- Excel ⚠️ descarga como CSV con extensión .xlsx (Excel lo abre igual)
- PDF ⚠️ abre en nueva ventana para imprimir manualmente

---

## ✅ Estado de Completitud

| Requisito | Archivo | Estado |
|-----------|---------|--------|
| 9.1 CSV | ExportButtons.jsx | ✅ |
| 9.1 Excel | ExportButtons.jsx | ✅ |
| 9.1 PDF | ExportButtons.jsx | ✅ |
| 9.1 en Cuenta | CuentaDetail.jsx | ✅ |
| 9.1 en Wallet | WalletDetail.jsx | ✅ |
| 9.1 en Broker | BrokerDetail.jsx | ✅ |
| 9.2 Cron setup | cron-setup.sh | ✅ |
| 9.2 a las 4 PM | cron + worker | ✅ |
| 9.3 Documentación | FASE19.md | ✅ |
| Tests | test-fase19.mjs | ✅ |
| Verificación | verificacion-fase19.mjs | ✅ |

---

**Próxima fase:** FASE 20 (Panel super_admin con opciones avanzadas)
