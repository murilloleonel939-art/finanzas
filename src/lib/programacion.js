/**
 * Programación del barrido diario de precios.
 *
 * **Por qué existe este módulo:** el barrido tiene que caer a las 16:00 de
 * Colombia con independencia de la zona del servidor. El contenedor de EC2
 * corre en UTC, y `new Date().getHours()` devolvería 21 — no 16. Programar
 * contra la hora del proceso funciona hasta que alguien cambia la config del
 * servidor o mueve el contenedor de región, y entonces el barrido se dispara a
 * una hora cualquiera sin que nada avise.
 *
 * Se resuelve con `Intl` en vez de sumar un desfijo fijo de −5 h: Colombia no
 * aplica horario de verano, pero sí lo aplican las bolsas cuyos precios se
 * piden, y hardcodear el desfase es la clase de dato que caduca en silencio.
 *
 * **Por qué 16:00 y no la hora de cierre de las bolsas:** el mercado de EE. UU.
 * cierra a las 16:00 ET, que en Colombia (UTC−5) son las 15:00 en verano y las
 * 14:00 en invierno. A las 16:00 de Bogotá el cierre ya está publicado en todos
 * los casos, así que el precio que se guarda es el de cierre real y no uno a
 * mitad de sesión.
 *
 * Funciones puras: no leen variables de entorno ni tocan la red, para que el
 * worker pueda comprobarlas sin arrancar nada.
 */

/** Zona por defecto del negocio. */
export const TZ_COLOMBIA = 'America/Bogota'

/** Hora por defecto del barrido, en formato 'HH:MM' de 24 horas. */
export const HORA_BARRIDO = '16:00'

/**
 * Descompone un instante en la fecha y la hora de una zona concreta.
 *
 * `en-CA` se elige a propósito porque su formato corto es `YYYY-MM-DD`: así la
 * fecha sale ya ordenable y comparable como texto, sin reensamblarla a mano.
 *
 * @param {Date} [ahora]
 * @param {string} [tz] zona IANA, p. ej. 'America/Bogota'
 * @returns {{fecha: string, hora: string}} 'YYYY-MM-DD' y 'HH:MM'
 */
export function partesEnZona(ahora = new Date(), tz = TZ_COLOMBIA) {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // Sin `h23`, medianoche sale como '24:00' y la comparación de cadenas
    // mandaría las 00:30 al final del día en vez de al principio.
    hourCycle: 'h23',
  })

  const partes = {}
  for (const { type, value } of formato.formatToParts(ahora)) {
    if (type !== 'literal') partes[type] = value
  }

  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  }
}

/**
 * ¿Es válida esta zona para `Intl`?
 *
 * Sin esta comprobación, un `BARRIDO_TZ` mal escrito ('America/Bogata') no falla
 * al arrancar: revienta dentro de `partesEnZona` en cada vuelta, el worker se
 * queda sin barrer y el error se pierde entre los logs del ciclo.
 *
 * @param {string} tz
 */
export function zonaValida(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * ¿Es válida una hora 'HH:MM' de 24 horas?
 * @param {string} hora
 */
export function horaValida(hora) {
  if (typeof hora !== 'string' || !/^\d{2}:\d{2}$/.test(hora)) return false
  const [h, m] = hora.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/**
 * ¿Toca barrer ahora?
 *
 * La condición es «ya pasó la hora objetivo y hoy no se ha barrido», **no** «son
 * exactamente las 16:00». Un worker que solo reconociera el minuto exacto se
 * saltaría el día entero si estuviera reiniciándose justo entonces, o si una
 * vuelta tardara más de un minuto. Con esta condición, un worker caído a las
 * 16:00 barre en cuanto vuelve, y el `estado` del registro impide repetir.
 *
 * @param {Object} params
 * @param {string} params.fecha fecha de hoy en la zona del barrido
 * @param {string} params.hora hora actual en la zona del barrido
 * @param {string} params.horaObjetivo 'HH:MM'
 * @param {string|null} params.ultimaFechaBarrida fecha del último barrido hecho
 * @returns {boolean}
 */
export function tocaBarrer({ fecha, hora, horaObjetivo, ultimaFechaBarrida = null }) {
  if (ultimaFechaBarrida === fecha) return false
  // Comparación de cadenas: con 'HH:MM' de dos dígitos, el orden lexicográfico
  // es el cronológico.
  return hora >= horaObjetivo
}

/**
 * Minutos que faltan para el próximo barrido, para poder decirlo en el log.
 *
 * Es informativo; no decide nada. Sirve para que al arrancar quede claro en el
 * log cuándo va a caer el barrido, en vez de tener que deducirlo.
 *
 * @param {string} hora actual 'HH:MM'
 * @param {string} horaObjetivo 'HH:MM'
 * @returns {number} minutos hasta el objetivo (0 si ya pasó)
 */
export function minutosHastaBarrido(hora, horaObjetivo) {
  const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const diferencia = aMinutos(horaObjetivo) - aMinutos(hora)
  return diferencia > 0 ? diferencia : 0
}
