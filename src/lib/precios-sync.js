/**
 * Motor de actualización de precios.
 *
 * Este módulo es el **único** sitio donde vive la lógica de «leer activos →
 * pedir precios → escribir `precios_activo` → copiar a `valor_unitario`». Lo
 * usan los dos consumidores:
 *
 *   - `worker-precios.mjs` (Node, EC2): barrido periódico y cola de jobs (D30)
 *   - `supabase/functions/actualizar-precios` (Deno): responde al botón del PRD §8
 *
 * **Por qué está separado de `precios-datos.js`:** aquella es la capa de datos
 * (habla con Postgres y nada más). Esta es la política —qué se considera un
 * fallo, qué se hace con un ticker desconocido, de dónde sale la fecha— y es lo
 * que las pruebas pueden comprobar sin tocar la red ni la base.
 *
 * No importa nada del navegador (`clsx`, `import.meta.env`, React): el worker y
 * Deno lo cargan tal cual. La única dependencia es `yahoo-finance.js`, que usa
 * `fetch` pelado — disponible en Node 18+ y en Deno.
 */

import { obtenerPreciosYahoo, claveActivo, ErrorTicker } from './yahoo-finance.js'

/**
 * Agrupa filas de `activos_broker` en activos únicos.
 *
 * La clave es `(tipo_activo, ticker)` y no el ticker solo (D29): `LINK` es
 * Chainlink como cripto e Interlink Electronics como acción, y agrupar por
 * ticker daría a una de las dos el precio de la otra.
 *
 * @param {Array<Object>} activos filas con `nombre_activo` y `tipo_activo`
 * @returns {Array<{nombre_activo: string, tipo_activo: string}>}
 */
export function agruparActivosUnicos(activos) {
  const unicos = new Map()

  for (const a of activos ?? []) {
    const ticker = String(a.nombre_activo ?? '').trim()
    if (!ticker) continue

    const clave = claveActivo(a.tipo_activo, ticker)
    if (!unicos.has(clave)) {
      unicos.set(clave, { nombre_activo: ticker, tipo_activo: a.tipo_activo ?? 'otro' })
    }
  }

  return [...unicos.values()]
}

/**
 * Fecha con la que se registra el precio.
 *
 * Se prefiere la fecha del **último cierre real** que reporta Yahoo: así un
 * sábado se guarda con el cierre del viernes y no se inventa un cierre de fin
 * de semana. Solo si Yahoo no mandó velas se cae a `fechaRespaldo` (hoy local).
 *
 * @param {Object} cotizacion
 * @param {string} fechaRespaldo 'YYYY-MM-DD'
 */
export function fechaDeCotizacion(cotizacion, fechaRespaldo) {
  return cotizacion?.fecha ?? fechaRespaldo
}

/**
 * Pide los precios y escribe el resultado en la base.
 *
 * Un fallo por activo **no aborta el resto**: se anota en `detalles` y se
 * sigue. Perder un ciclo entero porque un ticker está mal escrito dejaría sin
 * precio a todos los demás.
 *
 * @param {Object} params
 * @param {Object} params.datos resultado de `crearPreciosDatos(supabase)`
 * @param {Array<Object>} params.activos filas de `activos_broker`
 * @param {string} params.fechaRespaldo 'YYYY-MM-DD' (hoy local del que llama)
 * @param {(msg: string, nivel?: string) => void} [params.log]
 * @returns {Promise<{total: number, actualizados: number, errores: number,
 *                    detalles: Array<Object>}>}
 */
export async function sincronizarPrecios({ datos, activos, fechaRespaldo, log }) {
  const aviso = log ?? (() => {})

  const lista = activos ?? []
  const unicos = agruparActivosUnicos(lista)

  const resultado = {
    total: lista.length,
    actualizados: 0,
    errores: 0,
    detalles: [],
  }

  if (unicos.length === 0) {
    return resultado
  }

  // Una sola tanda de peticiones para todos los activos únicos.
  const cotizaciones = await obtenerPreciosYahoo(unicos)
  const fecha = fechaRespaldo

  for (const { nombre_activo, tipo_activo } of unicos) {
    const clave = claveActivo(tipo_activo, nombre_activo)
    const cotizacion = cotizaciones[clave]

    if (!cotizacion || cotizacion.precio_cierre === null) {
      // No vino en la respuesta: símbolo inexistente, tipo que no cuadra o
      // Yahoo caído. Se describe sin inventar la causa concreta.
      const detalle = {
        nombre_activo,
        tipo_activo,
        ok: false,
        motivo: 'Sin cotización (símbolo inexistente o no coincide el tipo de activo)',
      }
      resultado.detalles.push(detalle)
      aviso(`Sin cotización para ${nombre_activo} (${tipo_activo})`, 'warn')

      // Se cuentan los fallos por POSICIÓN, no por activo único, para que
      // `total` y `errores` cuadren en la UI.
      resultado.errores += lista.filter(
        (a) => claveActivo(a.tipo_activo, a.nombre_activo) === clave
      ).length
      continue
    }

    const fechaPrecio = fechaDeCotizacion(cotizacion, fecha)

    // Todas las posiciones que son ESE activo (el VOO en dos brokers, o en dos
    // empresas): un precio, N filas.
    const posiciones = lista.filter(
      (a) => claveActivo(a.tipo_activo, a.nombre_activo) === clave
    )

    for (const activo of posiciones) {
      try {
        await datos.registrarPrecio({
          empresa_id: activo.empresa_id,
          broker_id: activo.broker_id,
          activo_id: activo.id,
          fecha: fechaPrecio,
          precio_cierre: cotizacion.precio_cierre,
          precio_anterior: cotizacion.precio_anterior,
          variacion_pct: cotizacion.variacion_pct,
          moneda: activo.moneda,
          userId: null, // lo escribe el sistema, no una persona
        })

        await datos.actualizarValorUnitarioActivo(activo.id, cotizacion.precio_cierre)

        resultado.actualizados++
      } catch (err) {
        resultado.errores++
        resultado.detalles.push({
          nombre_activo,
          tipo_activo,
          ok: false,
          motivo: `Error al escribir: ${err.message}`,
        })
        aviso(`Error escribiendo ${nombre_activo}: ${err.message}`, 'error')
      }
    }

    resultado.detalles.push({
      nombre_activo,
      tipo_activo,
      ok: true,
      precio_cierre: cotizacion.precio_cierre,
      variacion_pct: cotizacion.variacion_pct,
      fecha: fechaPrecio,
      posiciones: posiciones.length,
    })
  }

  return resultado
}

/**
 * Traduce un error de la API de Yahoo a un mensaje para el usuario final.
 *
 * `ErrorTicker` ya trae mensajes escritos para leerse (D29), pero se distinguen
 * los tres casos que el usuario puede accionar: revisar el ticker, revisar el
 * tipo de activo, o esperar porque el problema es de Yahoo.
 */
export function mensajeDeError(err) {
  if (err instanceof ErrorTicker) {
    if (err.tipoInesperado) {
      return `El ticker no corresponde al tipo de activo: ${err.message}`
    }
    if (err.noEncontrado) {
      return `Ticker no encontrado: ${err.message}`
    }
    return err.message
  }
  return err?.message ?? 'Error desconocido consultando los precios'
}
