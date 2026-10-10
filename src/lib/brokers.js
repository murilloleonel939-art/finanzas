/**
 * Catálogo de brokers .
 *
 * Igual que `bancosPorPais.js` : `brokers.nombre_broker` es texto
 * libre en la base, así que esto solo alimenta el selector. Un broker que no
 * esté aquí se guarda escribiendo el nombre, o eligiendo «Otro».
 *
 * `monedaSugerida` es la divisa base de la CAJA (depósitos y retiros), no la
 * del activo: la migración 0003 deja claro que pueden discrepar y que cada una
 * manda en su ámbito. Es una sugerencia para precargar el formulario, nunca una
 * validación.
 *
 * El campo `tipo` sirve para agrupar el selector y para elegir el icono. Solo
 * distingue la naturaleza del broker, no cambia el comportamiento del módulo.
 */
export const BROKERS = [
  // --- Brokers internacionales de acciones y ETFs ---
  { nombre: 'Interactive Brokers', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'Charles Schwab', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'Fidelity', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'TD Ameritrade', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'E*TRADE', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'Vanguard', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'Merrill Edge', tipo: 'internacional', monedaSugerida: 'USD' },
  { nombre: 'Degiro', tipo: 'internacional', monedaSugerida: 'EUR' },
  { nombre: 'Trade Republic', tipo: 'internacional', monedaSugerida: 'EUR' },
  { nombre: 'Scalable Capital', tipo: 'internacional', monedaSugerida: 'EUR' },

  // --- Brokers de la región (Latinoamérica y España) ---
  { nombre: 'Trii', tipo: 'regional', monedaSugerida: 'COP' },
  { nombre: 'Tyba', tipo: 'regional', monedaSugerida: 'COP' },
  { nombre: 'Renta4', tipo: 'regional', monedaSugerida: 'COP' },
  { nombre: 'Davivienda Corredores', tipo: 'regional', monedaSugerida: 'COP' },
  { nombre: 'Casa de Bolsa', tipo: 'regional', monedaSugerida: 'MXN' },
  { nombre: 'GBM', tipo: 'regional', monedaSugerida: 'MXN' },
  { nombre: 'Actinver', tipo: 'regional', monedaSugerida: 'MXN' },
  { nombre: 'Kuspit', tipo: 'regional', monedaSugerida: 'MXN' },
  { nombre: 'Balanz', tipo: 'regional', monedaSugerida: 'ARS' },
  { nombre: 'IOL (Invertir Online)', tipo: 'regional', monedaSugerida: 'ARS' },
  { nombre: 'Cocos Capital', tipo: 'regional', monedaSugerida: 'ARS' },
  { nombre: 'Racional', tipo: 'regional', monedaSugerida: 'ARS' },
  { nombre: 'Renta4 Chile', tipo: 'regional', monedaSugerida: 'CLP' },
  { nombre: 'LarrainVial', tipo: 'regional', monedaSugerida: 'CLP' },
  { nombre: 'Fynsa', tipo: 'regional', monedaSugerida: 'CLP' },
  { nombre: 'Renta4 Perú', tipo: 'regional', monedaSugerida: 'PEN' },
  { nombre: 'Credicorp Capital', tipo: 'regional', monedaSugerida: 'PEN' },
  { nombre: 'Renta4 España', tipo: 'regional', monedaSugerida: 'EUR' },

  // --- Cripto (aunque el módulo de wallets cubre cripto, hay brokers
  //      que operan productos cripto con caja fiat) ---
  { nombre: 'eToro', tipo: 'mixto', monedaSugerida: 'USD' },
  { nombre: 'Robinhood', tipo: 'mixto', monedaSugerida: 'USD' },
  { nombre: 'Hapi', tipo: 'mixto', monedaSugerida: 'USD' },
  { nombre: 'Bitso', tipo: 'mixto', monedaSugerida: 'MXN' },
  { nombre: 'Buda', tipo: 'mixto', monedaSugerida: 'COP' },
]

/** Centinela para un broker fuera del catálogo. Nunca se guarda en la base. */
export const OTRO_BROKER = '__otro__'

/** Etiquetas del campo `tipo`, para agrupar el selector. */
export const TIPOS_BROKER = [
  { valor: 'internacional', etiqueta: 'Internacional' },
  { valor: 'regional', etiqueta: 'Latinoamérica y España' },
  { valor: 'mixto', etiqueta: 'Acciones y cripto' },
]

/** Nombres ordenados alfabéticamente, para el selector. */
export const NOMBRES_BROKER = [...BROKERS]
  .map((b) => b.nombre)
  .sort((a, b) => a.localeCompare(b, 'es'))

/** Brokers de un tipo. Sin tipo devuelve el catálogo completo. */
export function brokersPorTipo(tipo) {
  if (!tipo) return BROKERS
  return BROKERS.filter((b) => b.tipo === tipo)
}

/**
 * Ficha del catálogo por nombre, comparando sin acentos ni mayúsculas.
 * Devuelve `null` si no está: el llamador debe seguir permitiendo el broker
 * escrito a mano.
 */
export function brokerDelCatalogo(nombre) {
  if (!nombre) return null
  const clave = normalizar(nombre)
  return BROKERS.find((b) => normalizar(b.nombre) === clave) ?? null
}

/** Divisa de caja sugerida para un broker del catálogo, o `null`. */
export function monedaSugerida(nombre) {
  return brokerDelCatalogo(nombre)?.monedaSugerida ?? null
}

/**
 * Valor que debe enviarse a `brokers.nombre_broker`.
 * Devuelve `null` cuando no hay nada que guardar, y el formulario lo trata
 * como "campo vacío" en vez de guardar literalmente el centinela.
 */
export function resolverNombreBroker(seleccion, escritoAMano) {
  if (seleccion === OTRO_BROKER) {
    const limpio = (escritoAMano ?? '').trim()
    return limpio || null
  }
  return seleccion || null
}

function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Tipos de activo del enum `tipo_activo` (migración 0001), con su etiqueta.
 * Se declaran aquí y no en la página para que BrokerDetail y el formulario de
 * activos no acaben con dos listas distintas — el enum es uno solo y la base
 * rechazaría cualquier valor que no esté en él.
 */
export const TIPOS_ACTIVO = [
  { valor: 'accion', etiqueta: 'Acción' },
  { valor: 'bono', etiqueta: 'Bono' },
  { valor: 'fondo', etiqueta: 'Fondo' },
  { valor: 'etf', etiqueta: 'ETF' },
  { valor: 'cripto', etiqueta: 'Cripto' },
  { valor: 'cdat', etiqueta: 'CDAT' },
  { valor: 'otro', etiqueta: 'Otro' },
]

/** Etiqueta legible de un `tipo_activo`. */
export function etiquetaTipoActivo(valor) {
  return TIPOS_ACTIVO.find((t) => t.valor === valor)?.etiqueta ?? valor ?? '—'
}
