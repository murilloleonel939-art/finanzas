/**
 * Doble del cliente de Supabase para las pruebas de humo (FASE 15).
 *
 * `src/lib/brokers-datos.js` importa `@/lib/supabase`, que exige
 * `import.meta.env` (no existe en Node) y una anon key real. El empaquetador
 * sustituye ese módulo por este doble (ver `scripts/humo-brokers.mjs`).
 *
 * El doble no es un mock de comportamiento: es un **espía**. Graba cada
 * consulta que la capa de datos construye —tabla, operación, columnas del
 * select, filtros y orden— para poder afirmar sobre ellas. Eso es justo lo que
 * `npm run build` no puede comprobar: las columnas de PostgREST son strings en
 * runtime, y una columna inventada compila sin queja y solo revienta en el
 * navegador.
 *
 * Devuelve `{ data, error }` como el SDK de verdad, y no lanza: es la capa de
 * datos la que decide lanzar (D23).
 */

export const consultas = []

/** Respuestas forzadas por tabla+operación, para simular errores de Postgres. */
const respuestasForzadas = new Map()

export function responder(tabla, operacion, error) {
  respuestasForzadas.set(`${tabla}:${operacion}`, error)
}

export function limpiarRespuestas() {
  respuestasForzadas.clear()
}

/** Última consulta grabada. */
export function ultima() {
  return consultas[consultas.length - 1]
}

function nuevaConsulta(tabla, operacion) {
  const c = {
    tabla,
    operacion,
    select: null,
    filtros: [],
    orden: [],
    payload: null,
    single: null,
  }
  consultas.push(c)
  return c
}

function resolver(c) {
  const forzado = respuestasForzadas.get(`${c.tabla}:${c.operacion}`)
  if (forzado) return { data: null, error: forzado }

  // Una fila mínima para que `.single()`/`.maybeSingle()` no fallen; el valor
  // no importa, lo que se afirma es la consulta, no la fila.
  if (c.operacion === 'insert') return { data: { id: 'nuevo-id' }, error: null }
  if (c.single === 'single') return { data: { id: 'fila' }, error: null }
  if (c.single === 'maybe') return { data: { id: 'fila' }, error: null }
  return { data: [], error: null }
}

/**
 * Constructor encadenable con la forma del SDK: `.from(x).select(y).eq(...)`.
 * Cada método devuelve el mismo objeto y la consulta se cierra al esperarlo
 * (es `thenable`), que es como lo usa la capa de datos.
 */
function cadena(c) {
  const api = {
    select(columnas) {
      c.select = c.select ?? columnas
      return api
    },
    insert(payload) {
      c.operacion = 'insert'
      c.payload = payload
      return api
    },
    update(payload) {
      c.operacion = 'update'
      c.payload = payload
      return api
    },
    delete() {
      c.operacion = 'delete'
      return api
    },
    eq(columna, valor) {
      c.filtros.push({ tipo: 'eq', columna, valor })
      return api
    },
    is(columna, valor) {
      c.filtros.push({ tipo: 'is', columna, valor })
      return api
    },
    order(columna, opciones = {}) {
      c.orden.push({ columna, ascendente: opciones.ascending !== false })
      return api
    },
    limit() {
      return api
    },
    single() {
      c.single = 'single'
      return api
    },
    maybeSingle() {
      c.single = 'maybe'
      return api
    },
    then(resolve, rechazar) {
      return Promise.resolve(resolver(c)).then(resolve, rechazar)
    },
    catch(fn) {
      return Promise.resolve(resolver(c)).catch(fn)
    },
  }
  return api
}

export const supabase = {
  from(tabla) {
    const c = nuevaConsulta(tabla, 'select')
    return cadena(c)
  },
  // `suscribir()` de db.js usa channel(); la FASE 15 no lo necesita, pero sin
  // esto un import futuro reventaría con un TypeError confuso.
  channel() {
    return {
      on() {
        return this
      },
      subscribe() {
        return this
      },
      unsubscribe() {},
    }
  },
}
