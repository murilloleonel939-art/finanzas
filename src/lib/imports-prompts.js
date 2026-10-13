/**
 * Prompts y reglas de proveedores para la importación de extractos.
 * Sistema extensible de instrucciones para extracción de PDFs con LLM
 */

// ============================================================================
// REGLAS POR PROVEEDOR
// ============================================================================

export const PROVIDER_RULES = {
  dolarapp: {
    displayName: 'DolarApp',
    description: 'Wallet de dólares y conversiones COP',
    instruction: `Este es un extracto de DolarApp. Estas reglas son exclusivas de DolarApp:
- Cuando la columna Tipo diga exactamente "Compra USDc" o "Compra EURc", clasifica el movimiento como ingreso. Cuando diga "Venta USDc" o "Venta EURc" y la moneda equivalente sea COP, aplica la misma lógica de análisis, pero clasifícalo como egreso/débito. Trata USDT y USDC como la misma moneda: guarda la moneda como USDC y conserva EURc como EUR.
- Para "Compra USDc", "Venta USDc", "Compra EURc" o "Venta EURc" cuya moneda equivalente sea COP, usa como monto principal el monto de la moneda de la operación, guarda la moneda equivalente en moneda_equivalente y conserva el valor de la columna "Monto Local Equivalente" en monto_equivalente. No confundas monto_equivalente COP con el monto USDC.
- Extrae la columna "TRM" del día en trm si aparece en el documento. La columna "Monto Local Equivalente" es el valor COP de la operación y debe guardarse en monto_equivalente, aunque en la descripción aparezca junto a un nombre o una dirección. Devuelve también valor_trm y diferencia_cambio cuando moneda_equivalente sea COP. Para USDc usa la TRM del dólar; para EURc usa la TRM histórica EUR/COP. valor_trm = monto de la moneda operada multiplicado por trm; en compras, diferencia_cambio = valor_trm menos monto_equivalente; en ventas, diferencia_cambio = monto_equivalente menos valor_trm.
- En cada fila devuelve explícitamente monto, moneda, moneda_equivalente, monto_equivalente, trm, valor_trm y diferencia_cambio aunque alguno sea null. No inventes el equivalente COP.
- Si la TRM no aparece en el documento, devuelve trm como null para que el sistema la consulte por la fecha de la operación.
- Para cada fila DolarApp devuelve tipo_movimiento con el texto literal de la columna Tipo (p. ej. "Compra USDc"), descripcion con la descripción/destino literal, monto con el valor numérico de la moneda principal de esa fila, moneda con la moneda que indique el extracto para esa fila, moneda_equivalente con COP solo cuando el PDF muestre COP en esa columna, monto_equivalente con el valor numérico que sigue a COP en esa misma fila (p. ej. "+ 3.05 COP + 10,000 ALEJANDRO" significa monto_equivalente=10000), y external_id con el hash si aparece. Una wallet DolarApp puede tener varias monedas: no fuerces USD ni USDC si el extracto indica otra moneda. Nunca interpretes el monto de la moneda principal como monto COP.
- Conserva la descripción y el tipo originales, y no uses reglas genéricas para estas filas.
- Lee primero el período del extracto. Para fechas abreviadas como "Jul 23" o "23 Jul", usa el año del período que aparece en el PDF. Nunca uses 2024 por defecto ni copies el año de un ejemplo. Todas las filas del período de julio de 2026 deben devolver fechas como 2026-07-23.`,
  },
  paypal: {
    displayName: 'PayPal',
    description: 'Extractos de transacciones PayPal',
    instruction: `Este es un extracto de PayPal. Aplica exclusivamente estas reglas usando las columnas literales Description, Currency y Gross:
- Mass Pay Payment: toda descripción que empiece por "Mass Pay Payment" es un ingreso; usa únicamente el valor de la columna Gross.
- Website Payment: toda descripción que empiece por "Website Payment" es un egreso; usa únicamente el valor de la columna Gross.
- General Currency Conversion con Currency USD: es un egreso; usa únicamente el valor de la columna Gross.
- General Currency Conversion con Currency COP: es un ingreso; usa únicamente el valor de la columna Gross.
- User Initiated Withdrawal con Currency COP: es un egreso; usa únicamente el valor de la columna Gross. Si la columna Fee tiene un valor distinto de cero, devuelve además el campo fee con ese importe para crear un movimiento separado de comisión.
- Nunca uses la columna Net como monto principal. Devuelve Gross en el campo monto, como número positivo, y usa tipo ingreso o egreso para indicar la dirección.
- La salida debe incluir gross, net y fee exactamente con los valores de sus columnas. En User Initiated Withdrawal COP, fee es obligatorio aunque sea 0; nunca omitas esa columna. Si fee es distinto de cero, debe viajar en el campo fee para crear un movimiento separado.
- Nunca uses net como monto principal. net solo sirve como dato de comprobación de gross y fee.
- Conserva la descripción literal y no clasifiques estas filas con reglas genéricas.`,
  },
  coindepo: {
    displayName: 'Coindepo',
    description: 'Plataforma de productos Earn/Staking',
    instruction: `Este es un extracto de Coindepo. Aplica estas reglas exclusivas de Coindepo usando literalmente la columna Type/Description cuando exista:
- Interest Payment = tipo "ingreso" y la descripcion debe empezar con "Interest Payment"; son los intereses generados.
- Deposit = tipo "ingreso" y la descripcion debe empezar con "Deposit"; es un depósito.
- Withdrawal = tipo "egreso" y la descripcion debe empezar con "Withdrawal"; es una salida.
- Loan Withdrawal = el monto del PDF conserva su signo: valor positivo, tipo "ingreso"; valor negativo, tipo "egreso".
- Loan Repayment = el monto del PDF conserva su signo: valor negativo, tipo "egreso"; valor positivo, tipo "ingreso".
- Para Coindepo, devuelve el monto firmado exactamente como aparece en el PDF, incluyendo el signo menos. No conviertas los importes a valor absoluto. TRES REGLAS QUE NO PUEDES ROMPER: (1) "Loan Withdrawal" y "Loan Repayment" NO son intereses generados y no deben describirse como intereses, rendimientos ni ganancias; solo "Interest Payment" lo es. (2) Conserva el nombre literal de la fila al inicio de la descripcion, sin traducirlo ni renombrarlo. (3) No clasifiques estas reglas como proveedor genérico.`,
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
  const esNequi = /nequi/i.test(`${banco || ''} ${proveedor || ''}`)
  const esDale = /\bdale\b/i.test(`${banco || ''}`)
  const esCoindepo = /coindepo/i.test(String(proveedor || banco || ''))
  const instruccionCoindepo = esCoindepo
    ? `\nREGLA CRÍTICA COINDEPO — PREVALECE SOBRE CUALQUIER REGLA GENERAL DE MONTO:\n- Copia el signo tal como aparece en el PDF. En particular, una fila "Loan Repayment" con monto -13.00865441 USDT debe salir con monto -13.00865441 y tipo "egreso", NUNCA como positivo/ingreso. No elimines el signo menos.\n- Loan Withdrawal positivo = ingreso; Loan Repayment negativo = egreso.\n`
    : ''
  const instruccionDale = esDale
    ? `\nREGLA ESPECIAL BANCO DALE:\n- El archivo contiene un saldo inicial y un saldo final. Extráelos como saldo_inicial y saldo_final.\n- No conviertas esos saldos en movimientos y no los sumes a ingresos o egresos.\n- Busca literalmente las etiquetas "Saldo inicial", "Saldo final", "Saldo de apertura", "Saldo de cierre" o equivalentes del extracto. No uses el saldo de una transacción ni un total de movimientos.\n- Conserva el valor numérico completo, incluyendo separadores de miles; no redondees ni lo conviertas a otra moneda.\n- Para los movimientos Dale: una fila marcada como "Abono", "Crédito" o "Ingreso" es tipo "ingreso"; una marcada como "Débito", "Debito", "Retiro", "Pago" o "Salida" es tipo "egreso". No inviertas el tipo por el signo visual ni clasifiques por el saldo de la fila.\n- Devuelve el monto como número positivo, sin símbolos de moneda y sin cambiar sus dígitos; por ejemplo, "1.234.567,89" debe ser "1234567.89".\n- Si un saldo no aparece en este lote, usa null.\n`
    : ''
  const formatoSalida = esDale
    ? `Retorna un objeto JSON con "saldo_inicial", "saldo_final" y "movimientos". Los saldos deben ser números positivos o null si no aparecen en este lote.\n{ "saldo_inicial": 1000000, "saldo_final": 1250000, "movimientos": [ ... ] }`
    : 'Retorna un array JSON válido de movimientos.'
  const ejemploSalida = esDale
    ? '{ "saldo_inicial": 1000000, "saldo_final": 1250000, "movimientos": [] }'
    : '[ { "fecha": "2024-01-15", "tipo": "ingreso", "monto": "1500.00", "descripcion": "Depósito cliente", "moneda": "USD", "external_id": null, "status": "completed" } ]'
  const instruccionNequi = esNequi
    ? `\nREGLA ESPECIAL NEQUI:\n- La fila o texto “Saldo anterior” representa el saldo inicial del período. Inclúyelo como el PRIMER movimiento, con fecha del primer día del período, tipo "ingreso", monto positivo y descripción exactamente "Saldo anterior". NUNCA lo cuentes como ingreso operativo ni lo sumes a los totales de ingresos.\n- Conserva el orden en que aparecen las filas del PDF.\n`
    : '';

  return `Eres un experto en extracción de datos de extractos bancarios.
Tu tarea es extraer movimientos de un extracto de ${banco}.

CONTEXTO:
- Número de cuenta: ${numero}
- Tipo: ${tipo_cuenta}
- Moneda: ${tipo_moneda}
- Proveedor: ${proveedor || 'Genérico'}

INSTRUCCIONES CRÍTICAS:
${providerInstruction}
${instruccionCoindepo}
${instruccionDale}
${instruccionNequi}
REGLAS OBLIGATORIAS:
1. Extrae SOLO filas que son movimientos reales. NO incluyas:
   - Encabezados o títulos
   - Totales o resúmenes
   - Saldos finales (excepto el saldo_final estructurado de Dale y "Saldo anterior" en extractos Nequi)
   - Líneas vacías o de separación

2. Para cada movimiento extrae:
   - fecha: YYYY-MM-DD (obligatorio). Conserva exactamente el día, mes y año que aparecen en el PDF; nunca completes, reemplaces o supongas el año a partir de ejemplos. Si el PDF muestra fechas como "23 Jul" y el período indica 2026, devuelve "2026-07-23".
   - tipo: 'ingreso' o 'egreso' (obligatorio)
   - monto: número positivo, sin signo (obligatorio)
   - descripcion: texto de la transacción (obligatorio)
   - moneda: la moneda del movimiento, ej. 'USD', 'COP' (obligatorio)
   - external_id: si hay ID de transacción, úsalo; si no, deja null (opcional)
   - status: si hay columna, extrae exactamente como aparece; si no, null (opcional)
   - orden: posición de la fila dentro del extracto, empezando en 0 (obligatorio para conservar el orden)

3. Incluye TODAS las filas de TODAS las páginas.
4. Los montos son siempre positivos. El 'tipo' indica la dirección.
5. Las fechas deben ser válidas en el rango del extracto.
6. Si una fila tiene múltiples monedas, créa un movimiento por moneda.
7. No inventes datos. Si falta información, déjalo null.

FORMATO DE SALIDA:
${formatoSalida}
Ejemplo:
${ejemploSalida}
/* Para otros bancos, las filas completas siguen el esquema: */
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

Retorna ${esDale ? 'SOLO el objeto JSON' : 'SOLO el JSON array'}, sin explicaciones adicionales.`;
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
  const esQuotex = String(nombre || '').trim().toLowerCase() === 'quotex'

  if (esQuotex) {
    return `Eres un experto en extracción de extractos de Quotex.
Extrae únicamente movimientos reales del extracto. Quotex no usa posiciones de activos en esta aplicación.

CONTEXTO:
- Broker: ${nombre}
- Moneda: ${moneda}

Para cada operación de trading, usa las columnas Información, Beneficio, ID, Tiempo de apertura, Cantidad e Ingreso. El resultado neto es Ingreso menos Cantidad: si es positivo usa tipo 'ganancia'; si es negativo usa tipo 'perdida' y monto absoluto. Usa ID como external_id y Tiempo de apertura como fecha. También identifica depósitos y retiros si aparecen en el archivo. Conserva el concepto original en descripcion y usa monto positivo. No inventes filas ni incluyas saldos, encabezados o totales.
Retorna SOLO este JSON:
{"movimientos":[{"fecha":"YYYY-MM-DD","tipo":"ganancia","monto":0,"descripcion":"texto original","external_id":null}],"activos":[]}`
  }

  return `Eres un experto en extracción de datos de extractos de Interactive Brokers.
Tu tarea es extraer movimientos y activos de un estado de cuenta de Interactive Brokers.
El formato esperado es el Activity Statement de Interactive Brokers; no inventes datos que no aparezcan en el extracto.

CONTEXTO:
- Broker: ${nombre}
- Moneda base: ${moneda}

SECCIONES A EXTRAER:
1. **Depósitos y retiradas** (o "Deposits & Withdrawals") → movimientos
   - Depósito / Deposit = ingreso
   - Retirada / Withdrawal = egreso

2. **Operaciones** (o "Trades") → movimientos
   - Compra / Buy = egreso  (monto = Cantidad × Precio trans.)
   - Venta / Sell = ingreso (monto = Cantidad × Precio trans.)
   - Si existe columna Tarifa/com. o Commission con valor distinto de cero, crear un movimiento adicional de tipo 'comision' (egreso) por ese importe, con descripcion "Comisión [símbolo]" y la misma fecha.

3. **Posiciones abiertas** (o "Open Positions") → activos
   - Usar el campo Cantidad (o Quantity) como cantidad.
   - Usar el precio actual de mercado/cierre del extracto como valor_unitario actual.
   - No usar el precio de transacción como valor actual si el extracto trae también precio de mercado o MTM.
   - El precio de transacción/Avg Price/Cost Basis se usa como valor de compra cuando no exista un precio actual separado.

REGLAS OBLIGATORIAS:
1. Para MOVIMIENTOS extrae:
   - fecha: YYYY-MM-DD (si viene con hora, usar solo la fecha)
   - tipo: 'deposito', 'retirada', 'compra', 'venta', 'comision'
   - monto: número positivo (valor absoluto)
   - descripcion: descripción del movimiento; para operaciones incluir símbolo y cantidad (ej. "Compra VOO 0.0018")
   - cantidad: número de unidades para compras/ventas; null para depósitos, retiradas y comisiones
   - valor_unitario: precio por unidad para compras/ventas; null para los demás
   - external_id: código de transacción si existe, null en caso contrario

2. Para ACTIVOS extrae:
   - ticker: símbolo bursátil (VOO, AAPL, etc.)
   - nombre: nombre completo del activo
   - tipo: 'accion', 'etf', 'cdat', 'otro'
   - cantidad: número de unidades (campo Cantidad / Quantity)
   - valor_unitario: precio actual de mercado/cierre/MTM (campo Precio trans. / Avg Price), usar el precio actual de mercado/cierre/MTM; el precio de entrada queda en valor_compra_unitario
   - moneda: moneda del activo

3. Clasifica automáticamente:
   - VOO, VTI, SPY, QQQ, VEA, VWO, BND, BNDX → 'etf'
   - Todo lo demás → 'accion'
   - Si es un CDA o certificado → 'cdat'

4. No inventes datos.
5. Ignora encabezados, subtotales, totales, saldos, filas de continuación y filas sin fecha, tipo, monto o descripción. Nunca las incluyas en movimientos.
6. Las posiciones abiertas solo van en activos; no las repitas como movimientos.
7. Si una fila no tiene todos los campos obligatorios, omítela y continúa con las demás filas válidas.
8. Los montos siempre son positivos; usa el campo tipo para indicar si es ingreso o egreso.

FORMATO DE SALIDA:
Retorna un objeto JSON con dos arrays:
{
  "movimientos": [
    { "fecha": "2026-08-26", "tipo": "compra", "monto": "1.27", "descripcion": "Compra VOO 0.0018", "cantidad": "0.0018", "valor_unitario": "703.7000", "external_id": null },
    { "fecha": "2026-08-26", "tipo": "comision", "monto": "0.01", "descripcion": "Comision VOO", "cantidad": null, "valor_unitario": null, "external_id": null },
    { "fecha": "2026-08-01", "tipo": "deposito", "monto": "5000", "descripcion": "Deposito inicial", "cantidad": null, "valor_unitario": null, "external_id": "DEP-001" }
  ],
  "activos": [
    { "ticker": "VOO", "nombre": "Vanguard S&P 500 ETF", "tipo": "etf", "cantidad": "0.0018", "valor_unitario": "703.7000", "valor_compra_unitario": "650.0000", "moneda": "USD" }
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
  const instruccionCoindepo = /coindepo/i.test(String(proveedor || ''))
    ? `\nREGLA CRÍTICA COINDEPO: conserva exactamente el signo del monto como figura en el PDF. Loan Repayment -13.00865441 USDT debe ser monto -13.00865441, tipo "egreso"; no lo conviertas a positivo. Loan Withdrawal positivo es ingreso.\n`
    : ''

  return `Eres un experto en extracción de transacciones de wallets cripto.
Tu tarea es extraer movimientos de un extracto de wallet ${proveedor}.

CONTEXTO:
- Dirección: ${direccion}
- Proveedor: ${proveedor}
- Moneda principal: ${tipo_moneda}

INSTRUCCIONES CRÍTICAS:
${providerInstruction}
${instruccionCoindepo}
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
   - tipo_original: valor literal de la columna Tipo cuando exista
   - moneda_equivalente: valor literal de la columna Moneda Local Equivalente cuando exista
   - monto_equivalente: valor numérico literal de la columna Monto Local Equivalente; en DolarApp representa "M. de compra" en COP, no el monto USDC
   - external_id: si existe, null en caso contrario
   - status: 'completed', 'pending', 'failed' si existe, null en caso contrario
   - Para DolarApp, incluye moneda_equivalente y monto_equivalente cuando aparezcan; incluye trm si aparece en el PDF, y deja trm como null si no aparece.
   - Para DolarApp, incluye valor_trm y diferencia_cambio cuando sea una Compra o Venta USDc o EURc con equivalente COP.

4. En swaps, crea dos movimientos (entrada y salida de diferentes monedas).
5. Los Earn incluyen el tipo de producto en la descripción.
6. Todas las fechas deben estar dentro del rango del extracto. Lee el período y el año del encabezado antes de convertir fechas abreviadas; si una fecha queda fuera de ese rango, corrígela usando el año del período.

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
    "status": "completed",
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
export function validarRespuestaExtraccion(response, opciones = {}) {
  const omitirFilasIncompletas = opciones.omitirFilasIncompletas === true
  const esMovimientoCompleto = (item) => Boolean(item?.fecha && item?.tipo && item?.monto != null && item?.descripcion)
  try {
    const texto = String(response || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    if (!texto) throw new Error('El LLM devolvió una respuesta vacía')
    const inicioArray = texto.indexOf('[')
    const inicioObjeto = texto.indexOf('{')
    const inicios = [inicioArray, inicioObjeto].filter((indice) => indice >= 0)
    const inicio = inicios.length ? Math.min(...inicios) : -1
    const json = inicio > 0 ? texto.slice(inicio) : texto
    const parsed = JSON.parse(json);
    
    // Validar estructura según si es array o objeto
    if (Array.isArray(parsed)) {
      // Validar cada elemento es un movimiento válido
      const movimientos = omitirFilasIncompletas ? parsed.filter(esMovimientoCompleto) : parsed
      for (const item of movimientos) {
        if (!esMovimientoCompleto(item)) {
          throw new Error('Movimiento incompleto: falta fecha, tipo, monto o descripcion');
        }
      }
      return movimientos;
    } else if (parsed.movimientos && Array.isArray(parsed.movimientos)) {
      // Estructura de Dale o broker { movimientos: [...], ... }
      const movimientos = omitirFilasIncompletas ? parsed.movimientos.filter(esMovimientoCompleto) : parsed.movimientos
      for (const item of movimientos) {
        if (!esMovimientoCompleto(item)) {
          throw new Error('Movimiento incompleto: falta fecha, tipo, monto o descripcion')
        }
      }
      return omitirFilasIncompletas ? { ...parsed, movimientos } : parsed;
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
  const { fecha, monto, tipo, descripcion, orden, moneda, tipo_moneda, tipo_original, tipo_movimiento, moneda_equivalente, monto_equivalente } = movimiento;
  // El orden forma parte de la identidad cuando el PDF no trae un ID propio.
  // Sin él, dos filas legítimas con los mismos datos visibles se deduplican.
  const key = [fecha, monto, tipo, descripcion, orden, moneda || tipo_moneda, tipo_original || tipo_movimiento, moneda_equivalente, monto_equivalente].map((valor) => String(valor ?? '')).join('|');
  
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
