/**
 * Catálogo de proveedores de wallet .
 *
 * `wallet_providers.nombre_proveedor` es texto libre y `tipo` es un enum
 * (`cripto` / `fiat` / `ambos`). Este archivo solo alimenta el selector:
 * escribir un proveedor que no esté aquí es válido (opción «Otro»).
 *
 * El PRD §14 lista los proveedores en tres bloques que **se solapan**: Binance
 * aparece en «ambos» y en «cripto»; PayPal en «ambos» y en «fiat». Aquí se
 * guarda una sola entrada por proveedor, con el tipo más amplio (`ambos`),
 * porque el enum de la base tampoco admite varias filas para el mismo nombre y
 * duplicarlo en el selector mostraría la misma opción dos veces.
 */

/** Tipo con el que se guarda cada proveedor en `wallet_providers.tipo`. */
export const TIPOS_PROVEEDOR = [
  { valor: 'cripto', etiqueta: 'Cripto' },
  { valor: 'fiat', etiqueta: 'Fiat' },
  { valor: 'ambos', etiqueta: 'Ambos (cripto y fiat)' },
]

const PROVEEDORES_AMBOS = [
  'PayPal',
  'Wise',
  'Payoneer',
  'Revolut',
  'Mercado Pago',
  'N26',
  'Crypto.com',
  'Bitso',
  'Buda',
  'Nexo',
  'Wirex',
  'Coinbase',
  'Binance',
  'Coindepo',
]

const PROVEEDORES_CRIPTO = [
  'MetaMask',
  'Trust Wallet',
  'Kraken',
  'Bybit',
  'KuCoin',
  'OKX',
  'Ledger',
  'Trezor',
  'Phantom',
  'Exodus',
  'Electrum',
  'Atomic Wallet',
  'Guarda',
  'Bitfinex',
  'Gate.io',
  'Huobi',
  'Paxful',
]

const PROVEEDORES_FIAT = [
  'Skrill',
  'Neteller',
  'Venmo',
  'Zelle',
  'Apple Pay',
  'Google Pay',
  'Samsung Pay',
  'Paysera',
  'EcoPayz',
  'MuchBetter',
  'Jeton',
  'Stripe',
  'Square',
  'Adyen',
]

/** Los ~45 proveedores con su tipo, ordenados alfabéticamente por nombre. */
export const WALLET_PROVIDERS = [
  ...PROVEEDORES_AMBOS.map((nombre) => ({ nombre, tipo: 'ambos' })),
  ...PROVEEDORES_CRIPTO.map((nombre) => ({ nombre, tipo: 'cripto' })),
  ...PROVEEDORES_FIAT.map((nombre) => ({ nombre, tipo: 'fiat' })),
].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

/** Centinela para un proveedor fuera del catálogo. Nunca se guarda en la base. */
export const OTRO_PROVEEDOR = '__otro__'

/**
 * Clave de comparación de nombres de proveedor.
 *
 * Sin acentos y en minúsculas porque el nombre es texto libre y llega escrito
 * de mil formas ("Coinbase", "coinbase", "Cóinbase"). La usan este archivo y
 * `earnConfig.js` para decidir si un proveedor está en
 * `EARN_ALL_MOVEMENTS_PROVIDERS` o si un movimiento es Earn: si cada uno
 * normalizara a su manera, un mismo proveedor entraría en una lista y no en la
 * otra.
 */
export function claveProveedor(nombre) {
  if (!nombre) return ''
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Proveedores compatibles con el tipo pedido.
 *
 * Un proveedor `ambos` sirve para wallets cripto **y** fiat (por eso aparece en
 * las dos consultas); uno `cripto` solo para cripto. Sin tipo devuelve todo el
 * catálogo.
 */
export function proveedoresPorTipo(tipo) {
  if (!tipo) return WALLET_PROVIDERS
  return WALLET_PROVIDERS.filter((p) => p.tipo === 'ambos' || p.tipo === tipo)
}

/** Tipo declarado en el catálogo, o `null` si el nombre no está en él. */
export function tipoDeProveedor(nombre) {
  const clave = claveProveedor(nombre)
  return WALLET_PROVIDERS.find((p) => claveProveedor(p.nombre) === clave)?.tipo ?? null
}

/** Valor a enviar a la base a partir de lo elegido en el formulario. */
export function resolverNombreProveedor(seleccion, escritoAMano) {
  if (seleccion === OTRO_PROVEEDOR) {
    const limpio = (escritoAMano ?? '').trim()
    return limpio || null
  }
  return seleccion || null
}

/**
 * `tipo` que debe guardarse para un proveedor (columna NOT NULL del enum).
 *
 * Con un proveedor del catálogo se usa su tipo. Con «Otro» el usuario elige el
 * tipo en el formulario, porque la base no puede adivinarlo: sin esta
 * validación, crear un proveedor «Otro» fallaría con un error de constraint en
 * vez de decir qué falta.
 */
export function resolverTipoProveedor(seleccion, tipoElegido) {
  if (seleccion === OTRO_PROVEEDOR) return tipoElegido || null
  return tipoDeProveedor(seleccion) ?? tipoElegido ?? null
}
