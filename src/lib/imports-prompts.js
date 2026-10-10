/**
 * Prompts y reglas de proveedores para la importación de extractos.
 * Sistema extensible de instrucciones para extracción de PDFs con LLM
 */

// ============================================================================
// REGLAS POR PROVEEDOR
// ============================================================================

export const PROVIDER_RULES = {
  coindepo: {
    displayName: 'Coindepo',
    description: 'Plataforma de productos Earn/Staking',
    instruction: `Este es un extracto de Coindepo, una plataforma de productos Earn/Staking. 
Todos los movimientos corresponden a productos Earn (suscripciones, intereses, redenciones, recompensas). 
Extrae TODOS los movimientos tal como aparecen, preservando el tipo de producto Earn en la descripción. 
Las columnas pueden incluir: Date, Type, Amount, Coin, Status, Product, etc.
Clasifica cada movimiento según su Type (Subscription, Interest, Redemption, Reward, etc.).`,
  },
  'otro': {
    displayName: 'Otro',
    description: 'Extracto genérico de transacciones',
    instruction: `Este es un extracto genérico de transacciones. 
Extrae movimientos de depósitos, retiros, transferencias y otras transacciones.
Las columnas típicas son: Date, Type, Amount, Currency, Description, Status.`,
  },
};

// ============================================================================
// PROMPTS PARA EXTRACCIÓN
// ============================================================================

/**
 * Generar prompt para extracción de movimientos de CUENTA
 * @param {Object} context
 * @param {string} context.numero - Número de cuenta
 * @param {string} context.banco - Nombre del banco
 * @param {string} context.tipo_cuenta - 'corriente', 'ahorro', etc.
 * @param {string} context.tipo_moneda - 'COP', 'USD', etc.
 * @param {string} [context.proveedor] - Nombre del proveedor (Coindepo, etc.)
 * @returns {string} Prompt system para el LLM
 */
export function generarPromptMovimientosCuenta(context) {
  const { numero, banco, tipo_cuenta, tipo_moneda, proveedor } = context;
  const providerInstruction = proveedor
    ? (PROVIDER_RULES[proveedor.toLowerCase()]?.instruction || PROVIDER_RULES.otro.instruction)
    : PROVIDER_RULES.otro.instruction;

  return `Eres un experto en extracción de datos de extractos bancarios.
Tu tarea es extraer movimientos de un extracto de ${banco}.

CONTEXTO:
- Número de cuenta: ${numero}
- Tipo: ${tipo_cuenta}
- Moneda: ${tipo_moneda}
- Proveedor: ${proveedor || 'Genérico'}

INSTRUCCIONES CRÍTICAS:
${providerInstruction}

REGLAS OBLIGATORIAS:
1. Extrae SOLO filas que son movimientos reales. NO incluyas:
   - Encabezados o títulos
   - Totales o resúmenes
   - Saldos iniciales/finales
   - Líneas vacías o de separación

2. Para cada movimiento extrae:
   - fecha: YYYY-MM-DD (obligatorio)
   - tipo: 'ingreso' o 'egreso' (obligatorio)
   - monto: número positivo, sin signo (obligatorio)
   - descripcion: texto de la transacción (obligatorio)
   - moneda: la moneda del movimiento, ej. 'USD', 'COP' (obligatorio)
   - external_id: si hay ID de transacción, úsalo; si no, deja null (opcional)
   - status: si hay columna, extrae exactamente como aparece; si no, null (opcional)

3. Incluye TODAS las filas de TODAS las páginas.
4. Los montos son siempre positivos. El 'tipo' indica la dirección.
5. Las fechas deben ser válidas en el rango del extracto.
6. Si una fila tiene múltiples monedas, créa un movimiento por moneda.
7. No inventes datos. Si falta información, déjalo null.

FORMATO DE SALIDA:
Retorna un array JSON válido de movimientos. Ejemplo:
[
  {
    "fecha": "2024-01-15",
    "tipo": "ingreso",
    "monto": "1500.00",
    "descripcion": "Depósito cliente",
    "moneda": "USD",
    "external_id": "TXN-12345",
    "status": "completed"
  },
  {
    "fecha": "2024-01-16",
    "tipo": "egreso",
    "monto": "250.50",
    "descripcion": "Pago servicios",
    "moneda": "USD",
    "external_id": null,
    "status": null
  }
]

Retorna SOLO el JSON array, sin explicaciones adicionales.`;
}

/**
 * Generar prompt para extracción de datos de BROKER
 * @param {Object} context
 * @param {string} context.nombre - Nombre del broker
 * @param {string} context.moneda - Moneda del broker
 * @returns {string} Prompt system para el LLM
 */
export function generarPromptMovimientosBroker(context) {
  const { nombre, moneda } = context;

  return `Eres un experto en extracción de datos de extractos de brokers.
Tu tarea es extraer movimientos y activos de un estado de cuenta de ${nombre}.

CONTEXTO:
- Broker: ${nombre}
- Moneda base: ${moneda}

SECCIONES A EXTRAER:
1. **Depósitos y retiradas** → movimientos
   - Depósito = ingreso
   - Retirada = egreso

2. **Operaciones** → movimientos
   - Compra = egreso
   - Venta = ingreso

3. **Posiciones abiertas** → activos
   - Ticker, cantidad, valor unitario, moneda

REGLAS OBLIGATORIAS:
1. Para MOVIMIENTOS extrae:
   - fecha: YYYY-MM-DD
   - tipo: 'deposito', 'retirada', 'compra', 'venta'
   - monto: número positivo
   - descripcion: del movimiento
   - external_id: si existe, null en caso contrario

2. Para ACTIVOS extrae:
   - ticker: símbolo bursátil (VOO, AAPL, etc.)
   - nombre: nombre completo del activo
   - tipo: 'accion', 'etf', 'cdat', 'otro'
   - cantidad: número de unidades
   - valor_unitario: precio por unidad
   - moneda: moneda del activo

3. Clasifica automáticamente:
   - VOO, VTI, SPY, QQQ, VEA, VWO, BND, BNDX → 'etf'
   - Todo lo demás → 'accion'
   - Si es un CDA o certificado → 'cdat'

4. No inventes datos.

FORMATO DE SALIDA:
Retorna un objeto JSON con dos arrays:
{
  "movimientos": [
    { "fecha": "2024-01-10", "tipo": "deposito", "monto": "5000", "descripcion": "Depósito inicial", "external_id": "DEP-001" },
    { "fecha": "2024-01-12", "tipo": "compra", "monto": "2500", "descripcion": "Compra VOO 50 acciones", "external_id": "BUY-001" }
  ],
  "activos": [
    { "ticker": "VOO", "nombre": "Vanguard S&P 500 ETF", "tipo": "etf", "cantidad": "50", "valor_unitario": "500.00", "moneda": "USD" },
    { "ticker": "AAPL", "nombre": "Apple Inc.", "tipo": "accion", "cantidad": "10", "valor_unitario": "190.50", "moneda": "USD" }
  ]
}

Retorna SOLO el JSON, sin explicaciones.`;
}

/**
 * Generar prompt para extracción de movimientos de WALLET CRIPTO
 * @param {Object} context
 * @param {string} context.direccion - Dirección del wallet
 * @param {string} context.proveedor - 'Coindepo', 'Binance', etc.
 * @param {string} context.tipo_moneda - Moneda principal, ej. 'BTC'
 * @returns {string} Prompt system para el LLM
 */
export function generarPromptMovimientosWallet(context) {
  const { direccion, proveedor, tipo_moneda } = context;
  const providerInstruction = proveedor
    ? (PROVIDER_RULES[proveedor.toLowerCase()]?.instruction || PROVIDER_RULES.otro.instruction)
    : PROVIDER_RULES.otro.instruction;

  return `Eres un experto en extracción de transacciones de wallets cripto.
Tu tarea es extraer movimientos de un extracto de wallet ${proveedor}.

CONTEXTO:
- Dirección: ${direccion}
- Proveedor: ${proveedor}
- Moneda principal: ${tipo_moneda}

INSTRUCCIONES CRÍTICAS:
${providerInstruction}

REGLAS OBLIGATORIAS:
1. Extrae SOLO transacciones reales:
   - Depósitos (transfer in)
   - Retiros (transfer out)
   - Swaps (intercambios)
   - Staking/Earn (ingresos, redenciones)
   - Compras/ventas
   - Recompensas/intereses

2. No incluyas:
   - Encabezados
   - Totales o resúmenes
   - Líneas vacías

3. Para cada movimiento extrae:
   - fecha: YYYY-MM-DD
   - tipo: 'ingreso', 'egreso', 'swap', 'earn' (según corresponda)
   - monto: número positivo
   - descripcion: detalle de la transacción
   - moneda: moneda del movimiento (BTC, ETH, USDT, etc.)
   - external_id: si existe, null en caso contrario
   - status: 'completed', 'pending', 'failed' si existe, null en caso contrario

4. En swaps, crea dos movimientos (entrada y salida de diferentes monedas).
5. Los Earn incluyen el tipo de producto en la descripción.
6. Todas las fechas válidas en el rango del extracto.

FORMATO DE SALIDA:
Retorna un array JSON de movimientos:
[
  {
    "fecha": "2024-01-15",
    "tipo": "ingreso",
    "monto": "0.05",
    "descripcion": "Depósito BTC desde Kraken",
    "moneda": "BTC",
    "external_id": "HASH-abc123...",
    "status": "completed"
  },
  {
    "fecha": "2024-01-16",
    "tipo": "earn",
    "monto": "0.0002",
    "descripcion": "Interés Staking ETH",
    "moneda": "ETH",
    "external_id": null,
    "status": "completed"
  }
]

Retorna SOLO el JSON array, sin explicaciones.`;
}

// ============================================================================
// VALIDACIÓN DE RESPUESTAS
// ============================================================================

/**
 * Validar que la respuesta del LLM es un JSON válido
 * @param {string} response - Respuesta del LLM
 * @returns {Array} Array de movimientos/activos
 * @throws {Error} Si no es JSON válido o estructura incorrecta
 */
export function validarRespuestaExtraccion(response) {
  try {
    const parsed = JSON.parse(response);
    
    // Validar estructura según si es array o objeto
    if (Array.isArray(parsed)) {
      // Validar cada elemento es un movimiento válido
      for (const item of parsed) {
        if (!item.fecha || !item.tipo || !item.monto || !item.descripcion) {
          throw new Error('Movimiento incompleto: falta fecha, tipo, monto o descripcion');
        }
      }
      return parsed;
    } else if (parsed.movimientos && Array.isArray(parsed.movimientos)) {
      // Estructura de broker { movimientos: [...], activos: [...] }
      return parsed;
    } else {
      throw new Error('Respuesta no es array ni estructura de broker');
    }
  } catch (err) {
    throw new Error(`Respuesta inválida del LLM: ${err.message}`);
  }
}

/**
 * Derivar external_id como hash si no existe
 * @param {Object} movimiento - { fecha, monto, tipo, descripcion, ... }
 * @returns {string} Hash SHA-256 en hex
 */
export async function derivarExternalId(movimiento) {
  const { fecha, monto, tipo, descripcion } = movimiento;
  const key = `${fecha}|${monto}|${tipo}|${descripcion}`;
  
  // Usar SubtleCrypto si está disponible (browser/Node 15+)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(key));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback: simple hash (no es SHA-256 pero funciona para deduplicación)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
