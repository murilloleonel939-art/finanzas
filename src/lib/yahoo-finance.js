/**
 * Cliente de Yahoo Finance.
 *
 * ---------------------------------------------------------------------
 * Por qué el endpoint `v8/finance/chart` y no `v7/finance/quote`
 * ---------------------------------------------------------------------
 * El `v7/quote` —el que sale en casi todos los tutoriales— devuelve
 * **401 Unauthorized** desde 2023. Yahoo empezó a exigir un `crumb` ligado a
 * una cookie de sesión, y ese baile (pedir cookie, extraer crumb, mandarlo en
 * cada petición) es frágil y se rompe cada pocos meses. El `v8/chart` sigue
 * siendo público y no necesita ni cookie ni API key.
 *
 * El precio es el mismo —`meta.regularMarketPrice`—, así que no se pierde
 * nada. Lo que sí se pierde es el **batch**: `v8/chart` es de un símbolo por
 * petición. Por eso `obtenerPreciosYahoo` itera con concurrencia limitada en
 * vez de mandar 50 símbolos en una sola URL.
 *
 * ---------------------------------------------------------------------
 * D29 — El ticker no basta: hay que saber QUÉ es el activo
 * ---------------------------------------------------------------------
 * En Yahoo, `BTC` **no es Bitcoin**: es el ETF «Grayscale Bitcoin Mini Trust»
 * de NYSEArca, que cotiza a ~36 USD. Bitcoin es `BTC-USD` (~82.000). Lo mismo
 * pasa con `ETH` (el ETF de Grayscale, ~23 USD) y con `LINK`, que en Yahoo es
 * *Interlink Electronics* (una acción de ~5 USD), no Chainlink.
 *
 * Un fallback ciego «pruebo el ticker pelado y, si falla, le añado -USD» **no
 * arregla esto**: `BTC` pelado *sí existe*, así que el fallback nunca se
 * dispara y el worker guardaría 36 USD como precio de Bitcoin. Como el worker
 * además copia ese valor a `activos_broker.valor_unitario`, el error no queda
 * en un log: **reescribe el valor de la posición**.
 *
 * Por eso cada consulta lleva el `tipo_activo` de la fila (el enum que ya
 * existe en `0001_enums_e_identidad.sql`) y se comprueba contra el
 * `instrumentType` que devuelve Yahoo:
 *
 *   tipo_activo = 'cripto'  →  el símbolo es `TICKER-USD` y Yahoo tiene que
 *                              decir `CRYPTOCURRENCY`
 *   cualquier otro          →  se usa el ticker tal cual y se **rechaza**
 *                              `CRYPTOCURRENCY`
 *
 * Así `LINK` como acción da Interlink y `LINK` como cripto da Chainlink, que
 * es lo que el usuario quiso decir en cada caso.
 *
 * ---------------------------------------------------------------------
 * La fecha sale del dato, no del reloj
 * ---------------------------------------------------------------------
 * Yahoo devuelve los `timestamp` de las velas diarias y un `gmtoffset` de la
 * bolsa. Se fecha el registro con la **última vela** y no con `new Date()`:
 * un sábado se guarda con el cierre del viernes, que es el último precio real,
 * en vez de inventar un cierre de fin de semana. Misma preocupación que D26.
 */

const ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart'

// Yahoo corta la conexión si se le mandan muchas a la vez. Cinco en paralelo
// mantiene un ciclo de 50 tickers por debajo de los ~15 segundos.
const CONCURRENCIA = 5

const CABECERAS = {
  // Sin User-Agent de navegador, Yahoo responde 429 con frecuencia.
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'application/json',
}

/** Sufijo de divisa para los pares de cripto en Yahoo (`BTC` → `BTC-USD`). */
const DIVISA_CRIPTO = 'USD'

/**
 * Clave de un activo dentro de un lote.
 *
 * Lleva el tipo porque **un mismo ticker puede ser dos cosas distintas**:
 * `LINK` es a la vez Chainlink (cripto) e Interlink Electronics (acción). Con
 * el ticker solo, una de las dos posiciones se quedaría con el precio de la
 * otra.
 *
 * @param {string} tipoActivo valor del enum `tipo_activo`
 * @param {string} ticker
 */
export function claveActivo(tipoActivo, ticker) {
  return `${tipoActivo ?? 'otro'}:${String(ticker ?? '').trim().toUpperCase()}`
}

/** Error con datos para distinguir «no existe» de «falló la red». */
export class ErrorTicker extends Error {
  constructor(mensaje, { ticker, noEncontrado = false, tipoInesperado = false } = {}) {
    super(mensaje)
    this.name = 'ErrorTicker'
    this.ticker = ticker
    this.noEncontrado = noEncontrado
    this.tipoInesperado = tipoInesperado
  }
}

/**
 * Símbolo que hay que pedirle a Yahoo para este activo.
 * Las cripto necesitan el par con divisa; el resto va tal cual.
 */
function simboloDeYahoo(tipoActivo, ticker) {
  const limpio = String(ticker ?? '').trim().toUpperCase()
  if (tipoActivo === 'cripto' && !limpio.includes('-')) {
    return `${limpio}-${DIVISA_CRIPTO}`
  }
  return limpio
}

/**
 * Convierte el timestamp de una vela + el desfase de la bolsa en 'YYYY-MM-DD'.
 *
 * `ts` viene en segundos UTC. Sumarle el `gmtoffset` y leer los componentes
 * **UTC** da la fecha local de la bolsa, que es la que el usuario espera ver.
 */
function fechaDeVela(ts, gmtoffset) {
  const d = new Date((ts + (gmtoffset ?? 0)) * 1000)
  const dosDigitos = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`
}

/** Redondea a 8 decimales, la escala de `numeric(20,8)` (D3). */
function a8Decimales(n) {
  return Math.round(Number(n) * 1e8) / 1e8
}

/** Redondea a 6 decimales, la escala de `variacion_pct numeric(12,6)` (D3). */
function a6Decimales(n) {
  return Math.round(Number(n) * 1e6) / 1e6
}

/**
 * Pide un símbolo a Yahoo. Una petición, sin reintentos.
 * @returns {Promise<Object>} cotización normalizada
 */
async function pedirSimbolo(simbolo) {
  const url = `${ENDPOINT}/${encodeURIComponent(simbolo)}?interval=1d&range=5d`

  let respuesta
  try {
    respuesta = await fetch(url, { headers: CABECERAS })
  } catch (err) {
    throw new ErrorTicker(`Fallo de red pidiendo ${simbolo}: ${err.message}`, {
      ticker: simbolo,
    })
  }

  // 404 es «ese símbolo no existe», no un fallo transitorio: reintentarlo no
  // sirve de nada y solo gasta cuota.
  if (respuesta.status === 404) {
    throw new ErrorTicker(`Símbolo ${simbolo} no encontrado en Yahoo Finance`, {
      ticker: simbolo,
      noEncontrado: true,
    })
  }

  if (respuesta.status === 429) {
    throw new ErrorTicker('Yahoo Finance limitó las peticiones (429)', {
      ticker: simbolo,
    })
  }

  if (!respuesta.ok) {
    throw new ErrorTicker(`Yahoo Finance devolvió ${respuesta.status} para ${simbolo}`, {
      ticker: simbolo,
    })
  }

  let json
  try {
    json = await respuesta.json()
  } catch {
    throw new ErrorTicker(`Respuesta ilegible de Yahoo para ${simbolo}`, { ticker: simbolo })
  }

  const resultado = json?.chart?.result?.[0]
  const meta = resultado?.meta

  if (!meta || meta.regularMarketPrice === undefined) {
    // Yahoo contesta 200 con `chart.error` para algunos símbolos raros.
    const detalle = json?.chart?.error?.description ?? 'sin datos'
    throw new ErrorTicker(`Sin precio para ${simbolo}: ${detalle}`, {
      ticker: simbolo,
      noEncontrado: true,
    })
  }

  const cierres = resultado?.indicators?.quote?.[0]?.close ?? []
  const timestamps = resultado?.timestamp ?? []
  const gmtoffset = meta.gmtoffset ?? 0

  // Los cierres traen null en velas incompletas o sin operación.
  const cierresValidos = cierres.filter((c) => typeof c === 'number' && !Number.isNaN(c))

  const precioCierre = a8Decimales(meta.regularMarketPrice)

  // El penúltimo cierre diario es el «precio anterior» que interesa.
  // `meta.chartPreviousClose` NO sirve como primera opción: es el cierre previo
  // al *rango* pedido (hace 5 días), no el del día anterior.
  let precioAnterior = null
  if (cierresValidos.length >= 2) {
    precioAnterior = a8Decimales(cierresValidos[cierresValidos.length - 2])
  } else if (typeof meta.chartPreviousClose === 'number') {
    precioAnterior = a8Decimales(meta.chartPreviousClose)
  }

  // `regularMarketChangePercent` ya viene en puntos porcentuales (−1.11 = −1.11 %).
  let variacionPct = null
  if (typeof meta.regularMarketChangePercent === 'number') {
    variacionPct = a6Decimales(meta.regularMarketChangePercent)
  } else if (precioAnterior) {
    variacionPct = a6Decimales(((precioCierre - precioAnterior) / precioAnterior) * 100)
  }

  // La fecha sale de la última vela, no del reloj del worker.
  let fecha = null
  if (timestamps.length > 0) {
    fecha = fechaDeVela(timestamps[timestamps.length - 1], gmtoffset)
  }

  return {
    ticker: meta.symbol ?? simbolo.toUpperCase(),
    simbologia: simbolo,
    instrumentType: meta.instrumentType ?? null,
    precio_cierre: precioCierre,
    precio_anterior: precioAnterior,
    variacion_pct: variacionPct,
    fecha,
    moneda: meta.currency ?? null,
    nombre: meta.longName ?? meta.shortName ?? null,
  }
}

/**
 * ¿El instrumento que devolvió Yahoo corresponde al tipo de activo?
 *
 * Esta comprobación es la que evita el desastre de D29: sin ella, pedir `BTC`
 * como cripto devolvería el ETF a 36 USD y se guardaría como precio de Bitcoin.
 *
 * Es deliberadamente asimétrica:
 *  - cripto → **exige** `CRYPTOCURRENCY`
 *  - el resto → **rechaza** `CRYPTOCURRENCY`, pero acepta cualquier otro tipo
 *    (EQUITY, ETF, MUTUALFUND, INDEX…) sin exigir coincidencia exacta, porque
 *    una acción puede llegar como ETF y no vale la pena rechazar el precio.
 */
function tipoCoincide(tipoActivo, instrumentType) {
  if (!instrumentType) return true // Yahoo no siempre lo manda; no se bloquea.

  const esCripto = instrumentType === 'CRYPTOCURRENCY'

  if (tipoActivo === 'cripto') return esCripto
  return !esCripto
}

/**
 * Precio actual de un activo.
 *
 * @param {string} ticker
 * @param {string} [tipoActivo] valor del enum `tipo_activo`. Decide si se pide
 *   como par de cripto (`BTC` → `BTC-USD`) y contra qué se valida el resultado.
 * @returns {Promise<Object>} cotización normalizada
 * @throws {ErrorTicker} si el símbolo no existe, no es del tipo esperado o
 *   Yahoo no responde
 */
export async function obtenerPrecioYahoo(ticker, tipoActivo = 'otro') {
  const limpio = String(ticker ?? '').trim().toUpperCase()

  if (!limpio) {
    throw new ErrorTicker('Ticker vacío', { ticker })
  }

  const simbolo = simboloDeYahoo(tipoActivo, limpio)

  let cotizacion
  try {
    cotizacion = await pedirSimbolo(simbolo)
  } catch (err) {
    // Una cripto puede venir como «BTC» en la posición y como «BTC-USD» en
    // Yahoo… pero también al revés: el usuario pudo escribir «BTC-USD» a mano.
    // Si el símbolo ya llevaba guion, no hay nada más que probar.
    const puedeProbarSinSufijo =
      tipoActivo === 'cripto' && err.noEncontrado && limpio.includes('-')

    if (puedeProbarSinSufijo) {
      try {
        cotizacion = await pedirSimbolo(limpio)
      } catch {
        throw err // El error útil es el del símbolo tal como se pidió.
      }
    } else {
      throw err
    }
  }

  if (!tipoCoincide(tipoActivo, cotizacion.instrumentType)) {
    throw new ErrorTicker(
      `${simbolo} existe en Yahoo pero es ${cotizacion.instrumentType}, no ${tipoActivo} ` +
        `(«${cotizacion.nombre ?? 'sin nombre'}»). Revisa el ticker o el tipo de activo.`,
      { ticker: limpio, tipoInesperado: true }
    )
  }

  return cotizacion
}

/**
 * Precios de varios activos, con concurrencia limitada.
 *
 * @param {Array<{nombre_activo: string, tipo_activo?: string}>|string[]} activos
 *   filas de `activos_broker` (o una lista de tickers, que se tratan como
 *   `tipo_activo: 'otro'`).
 * @returns {Promise<Object>} mapa `claveActivo(tipo, ticker)` → cotización.
 *   Los que fallan se omiten en vez de abortar: un ticker mal escrito no debe
 *   dejar al resto sin precio.
 */
export async function obtenerPreciosYahoo(activos) {
  const items = (activos ?? []).map((a) =>
    typeof a === 'string'
      ? { nombre_activo: a, tipo_activo: 'otro' }
      : { nombre_activo: a.nombre_activo, tipo_activo: a.tipo_activo ?? 'otro' }
  )

  // Se deduplica por (tipo, ticker): un ticker pedido dos veces con el mismo
  // tipo es una sola petición a Yahoo.
  const unicos = new Map()
  for (const item of items) {
    const ticker = String(item.nombre_activo ?? '').trim().toUpperCase()
    if (!ticker) continue
    const clave = claveActivo(item.tipo_activo, ticker)
    if (!unicos.has(clave)) unicos.set(clave, { ticker, tipoActivo: item.tipo_activo })
  }

  const entradas = [...unicos.entries()]
  const resultado = {}
  let siguiente = 0

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

  return resultado
}

/**
 * ¿Existe el activo y se puede consultar con ese tipo?
 * @param {string} ticker
 * @param {string} [tipoActivo]
 * @returns {Promise<boolean>}
 */
export async function validarTicker(ticker, tipoActivo = 'otro') {
  try {
    await obtenerPrecioYahoo(ticker, tipoActivo)
    return true
  } catch {
    return false
  }
}
