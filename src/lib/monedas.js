/**
 * Catálogo de monedas cripto y fiat (FASE 13, PRD §14).
 *
 * La moneda es un atributo de cada entidad y **no se convierte** entre
 * monedas: los resúmenes muestran una línea por moneda (decisión D4). Por eso
 * este archivo solo describe monedas, no tasas de cambio.
 *
 * En la base la moneda es texto libre (`cuentas.tipo_moneda`,
 * `wallets.tipo_moneda`, `activos_broker.moneda`), así que la lista es una
 * ayuda para el selector, no una restricción. Códigos en MAYÚSCULAS.
 */

export const MONEDAS_CRIPTO = [
  { codigo: 'BTC', nombre: 'Bitcoin', decimales: 8 },
  { codigo: 'ETH', nombre: 'Ethereum', decimales: 8 },
  { codigo: 'USDT', nombre: 'Tether', decimales: 8 },
  { codigo: 'USDC', nombre: 'USD Coin', decimales: 8 },
  { codigo: 'BNB', nombre: 'BNB', decimales: 8 },
  { codigo: 'SOL', nombre: 'Solana', decimales: 8 },
  { codigo: 'XRP', nombre: 'XRP', decimales: 8 },
  { codigo: 'ADA', nombre: 'Cardano', decimales: 8 },
  { codigo: 'DOT', nombre: 'Polkadot', decimales: 8 },
  { codigo: 'MATIC', nombre: 'Polygon', decimales: 8 },
  { codigo: 'LINK', nombre: 'Chainlink', decimales: 8 },
  { codigo: 'AVAX', nombre: 'Avalanche', decimales: 8 },
  { codigo: 'DOGE', nombre: 'Dogecoin', decimales: 8 },
  { codigo: 'SHIB', nombre: 'Shiba Inu', decimales: 8 },
  { codigo: 'LTC', nombre: 'Litecoin', decimales: 8 },
]

export const MONEDAS_FIAT = [
  { codigo: 'USD', nombre: 'Dólar estadounidense', decimales: 2 },
  { codigo: 'EUR', nombre: 'Euro', decimales: 2 },
  { codigo: 'COP', nombre: 'Peso colombiano', decimales: 2 },
  { codigo: 'MXN', nombre: 'Peso mexicano', decimales: 2 },
  { codigo: 'ARS', nombre: 'Peso argentino', decimales: 2 },
  { codigo: 'CLP', nombre: 'Peso chileno', decimales: 0 },
  { codigo: 'PEN', nombre: 'Sol peruano', decimales: 2 },
  { codigo: 'BRL', nombre: 'Real brasileño', decimales: 2 },
  { codigo: 'GBP', nombre: 'Libra esterlina', decimales: 2 },
]

/**
 * Moneda por defecto de cada tipo de entidad, tal como está en el esquema:
 * `cuentas.tipo_moneda` default COP, `wallets.tipo_moneda` y
 * `activos_broker.moneda` default USD. Tenerlas en un solo sitio evita que la
 * UI proponga una distinta de la que aplicará la base.
 */
export const MONEDA_DEFECTO = {
  cuenta: 'COP',
  wallet: 'USD',
  activo: 'USD',
  broker: 'USD',
}

const TODAS = [...MONEDAS_CRIPTO, ...MONEDAS_FIAT]
const POR_CODIGO = new Map(TODAS.map((m) => [m.codigo, m]))

/** Códigos en orden: primero cripto, luego fiat. */
export const CODIGOS_MONEDA = TODAS.map((m) => m.codigo)

export function esCripto(codigo) {
  return MONEDAS_CRIPTO.some((m) => m.codigo === codigo?.toUpperCase())
}

/**
 * Metadatos de una moneda. Un código desconocido (texto libre en la base)
 * devuelve una entrada sintética en vez de `undefined`, para que la UI pueda
 * pintar la fila sin comprobaciones: el RLS y el PRD permiten cualquier
 * código, no solo los del catálogo.
 */
export function moneda(codigo) {
  if (!codigo) return null
  const cod = codigo.toUpperCase()
  return (
    POR_CODIGO.get(cod) ?? {
      codigo: cod,
      nombre: cod,
      decimales: esCripto(cod) ? 8 : 2,
    }
  )
}

/** Nombre largo para tooltips y textos de ayuda. */
export function nombreMoneda(codigo) {
  return moneda(codigo)?.nombre ?? ''
}

/**
 * Formatea un importe con la moneda. Sin conversión (D4): solo presentación.
 *
 * Se usa la API `Intl` y no un formateo manual porque el número de decimales
 * importa: 0.00012345 BTC con dos decimales mostraría "0,00" y parecería un
 * saldo vacío. Para cripto se fuerzan los 8 decimales de `numeric(20,8)`.
 */
export function formatearMonto(valor, codigo) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (Number.isNaN(n)) return '—'

  const info = moneda(codigo)
  const decimales = info?.decimales ?? 2
  const esFiatConocida = MONEDAS_FIAT.some((m) => m.codigo === info?.codigo)

  try {
    const texto = new Intl.NumberFormat(esFiatConocida ? 'es-CO' : 'en-US', {
      style: esFiatConocida ? 'currency' : 'decimal',
      currency: esFiatConocida ? info.codigo : undefined,
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(n)
    // Para cripto se añade el código delante del número: el símbolo no existe.
    return esFiatConocida ? texto : `${texto} ${info.codigo}`
  } catch {
    return `${n.toFixed(decimales)} ${codigo ?? ''}`.trim()
  }
}
