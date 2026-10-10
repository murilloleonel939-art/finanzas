/**
 * FASE 18: Cliente de Yahoo Finance
 * Obtiene precios actuales para acciones, ETFs y criptos
 *
 * API: https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}
 * Alternativa simplificada: https://query2.finance.yahoo.com/v7/finance/quote
 */

/**
 * Obtener el precio actual de un ticker desde Yahoo Finance
 * @param {string} ticker - Ticker (ej: AAPL, VOO, BTC-USD, DOGE-USD)
 * @returns {Promise<Object>} { precio_cierre, precio_anterior, variacion_pct }
 * @throws {Error} Si la consulta falla o el ticker no existe
 */
export async function obtenerPrecioYahoo(ticker) {
  // Normalizar el ticker: agregar -USD si es cripto sin moneda
  let normalizado = ticker.toUpperCase().trim()

  // Detectar criptos comunes y agregar -USD si no tienen moneda
  const criptos = ['BTC', 'ETH', 'DOGE', 'XRP', 'ADA', 'SOL', 'MATIC', 'LINK']
  if (
    criptos.includes(normalizado) &&
    !normalizado.includes('-')
  ) {
    normalizado = `${normalizado}-USD`
  }

  try {
    // Endpoint de Yahoo Finance v7
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${normalizado}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Yahoo Finance retornó ${response.status}: ${response.statusText}`
      )
    }

    const json = await response.json()

    // Validar que llegó la respuesta
    if (!json.quoteResponse || !json.quoteResponse.result) {
      throw new Error(
        `Respuesta vacía de Yahoo Finance para ${normalizado}`
      )
    }

    const quotes = json.quoteResponse.result
    if (!quotes || quotes.length === 0) {
      throw new Error(
        `Ticker ${normalizado} no encontrado en Yahoo Finance`
      )
    }

    const quote = quotes[0]

    // Extraer precios
    const precio_cierre = quote.regularMarketPrice
    const precio_anterior = quote.regularMarketPreviousClose
    const variacion_pct = quote.regularMarketChangePercent

    // Validaciones
    if (
      precio_cierre === null ||
      precio_cierre === undefined
    ) {
      throw new Error(
        `Precio nulo para ${normalizado} en Yahoo Finance`
      )
    }

    return {
      ticker: normalizado,
      precio_cierre: parseFloat(precio_cierre.toFixed(8)),
      precio_anterior: precio_anterior
        ? parseFloat(precio_anterior.toFixed(8))
        : null,
      variacion_pct: variacion_pct
        ? parseFloat(variacion_pct.toFixed(6))
        : null,
    }
  } catch (error) {
    throw new Error(
      `Error consultando Yahoo Finance para ${ticker}: ${error.message}`
    )
  }
}

/**
 * Obtener precios para múltiples tickers (batch)
 * Yahoo Finance permite consultar múltiples símbolos separados por coma
 * @param {string[]} tickers - Array de tickers
 * @returns {Promise<Object>} { [ticker]: { precio_cierre, ... } }
 */
export async function obtenerPreciosYahoo(tickers) {
  if (!tickers || tickers.length === 0) {
    return {}
  }

  // Normalizar tickers
  const normalizados = tickers.map((t) => {
    let n = t.toUpperCase().trim()
    const criptos = ['BTC', 'ETH', 'DOGE', 'XRP', 'ADA', 'SOL', 'MATIC', 'LINK']
    if (criptos.includes(n) && !n.includes('-')) {
      n = `${n}-USD`
    }
    return n
  })

  const symbolsStr = normalizados.join(',')

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbolsStr}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Yahoo Finance retornó ${response.status}: ${response.statusText}`
      )
    }

    const json = await response.json()

    const quotes = json.quoteResponse?.result ?? []
    const result = {}

    for (const quote of quotes) {
      const ticker = quote.symbol
      result[ticker] = {
        ticker,
        precio_cierre: quote.regularMarketPrice
          ? parseFloat(quote.regularMarketPrice.toFixed(8))
          : null,
        precio_anterior: quote.regularMarketPreviousClose
          ? parseFloat(quote.regularMarketPreviousClose.toFixed(8))
          : null,
        variacion_pct: quote.regularMarketChangePercent
          ? parseFloat(quote.regularMarketChangePercent.toFixed(6))
          : null,
      }
    }

    return result
  } catch (error) {
    throw new Error(
      `Error consultando Yahoo Finance para batch ${symbolsStr}: ${error.message}`
    )
  }
}

/**
 * Validar que un ticker existe y es consultable
 * @param {string} ticker
 * @returns {Promise<boolean>}
 */
export async function validarTicker(ticker) {
  try {
    await obtenerPrecioYahoo(ticker)
    return true
  } catch {
    return false
  }
}
