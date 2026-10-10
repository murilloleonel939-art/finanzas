#!/usr/bin/env node

/**
 * Worker de precios.
 *
 * Corre en EC2/Coolify como proceso aparte del frontend. Hace dos cosas, en
 * dos ritmos distintos:
 *
 *   1. **Cola** (D30): atiende los `precios_jobs` que encoló el botón del
 *      PRD §8 desde la UI. Se revisa en cada vuelta (5 min): es lo que hace que
 *      el botón responda rápido.
 *   2. **Barrido** (D31): refresca los precios de todos los activos **una vez
 *      al día**, a las 16:00 de Colombia, y deja constancia en
 *      `precios_barridos`. Es lo que mantiene los precios al día sin que nadie
 *      pulse nada.
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node worker-precios.mjs
 *
 * Variables:
 *   SUPABASE_URL                (requerida)
 *   SUPABASE_SERVICE_ROLE_KEY   (requerida — escribe sin sesión de usuario)
 *   POLL_INTERVAL_MS            (opcional, 300000 = 5 min)
 *   UNA_VEZ=1                   (opcional: una vuelta y salir — para cron externo)
 *   SIN_COLA=1                  (opcional: no atiende la cola, solo el barrido)
 *   SIN_BARRIDO=1               (opcional: solo atiende la cola, sin barrer)
 *   BARRIDO_HORA                (opcional, '16:00' — hora de Colombia)
 *   BARRIDO_TZ                  (opcional, 'America/Bogota')
 *
 * **Por qué el barrido es diario y no en cada vuelta (D31):** Yahoo devuelve un
 * símbolo por petición, así que un barrido completo son N peticiones. Hacerlo
 * cada 5 minutos son ~288 barridos al día para reescribir casi siempre el mismo
 * cierre. Con el mercado cerrado, entre las 17:00 y las 09:00 del día siguiente
 * el precio no cambia: repetirlo solo gasta cuota y arriesga un 429.
 *
 * **Por qué service_role y no la anon key:** el worker no tiene sesión de
 * usuario, y las policies de `precios_activo` y `activos_broker` exigen
 * `has_empresa_access()`. Con la anon key no escribiría ni una fila. La
 * service_role se salta el RLS y por eso nunca sale del servidor.
 *
 * **Por qué un worker y no pg_cron:** ver D28/D30. El cron de Supabase ejecuta
 * SQL dentro de Postgres; no puede llamar a la API de Yahoo ni leer su JSON.
 */

import { createClient } from '@supabase/supabase-js'
import { crearPreciosDatos, hoyLocal } from './src/lib/precios-datos.js'
import { sincronizarPrecios, mensajeDeError } from './src/lib/precios-sync.js'
import {
  partesEnZona,
  zonaValida,
  horaValida,
  tocaBarrer,
  minutosHastaBarrido,
  TZ_COLOMBIA,
  HORA_BARRIDO,
} from './src/lib/programacion.js'

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000', 10)
const UNA_VEZ = process.env.UNA_VEZ === '1'
const SIN_BARRIDO = process.env.SIN_BARRIDO === '1'
const SIN_COLA = process.env.SIN_COLA === '1'

const BARRIDO_TZ = process.env.BARRIDO_TZ || TZ_COLOMBIA
const BARRIDO_HORA = process.env.BARRIDO_HORA || HORA_BARRIDO

const faltantes = []
if (!SUPABASE_URL) faltantes.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) faltantes.push('SUPABASE_SERVICE_ROLE_KEY')

if (faltantes.length > 0) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}`)
  console.error(
    '   El worker necesita la service_role key: escribe sin sesión de usuario,\n' +
      '   así que el RLS lo bloquearía con la anon key.'
  )
  process.exit(1)
}

if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 1000) {
  console.error('❌ POLL_INTERVAL_MS debe ser un número >= 1000')
  process.exit(1)
}

// Se validan al arrancar, no en cada vuelta: una zona mal escrita ('America/
// Bogata') haría reventar el cálculo cada 5 minutos, y el worker se quedaría
// sin barrer con el error perdido entre los logs del ciclo.
if (!zonaValida(BARRIDO_TZ)) {
  console.error(`❌ BARRIDO_TZ no es una zona horaria válida: ${BARRIDO_TZ}`)
  process.exit(1)
}
if (!horaValida(BARRIDO_HORA)) {
  console.error(`❌ BARRIDO_HORA debe ser 'HH:MM' (24 h), no: ${BARRIDO_HORA}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const datos = crearPreciosDatos(supabase)

// ============================================================================
// LOGGING
// ============================================================================

function log(msg, nivel = 'info') {
  const icono =
    nivel === 'error' ? '❌' : nivel === 'warn' ? '⚠️' : nivel === 'ok' ? '✅' : 'ℹ️'
  console.log(`[${new Date().toISOString()}] ${icono} ${msg}`)
}

// ============================================================================
// COLA DE JOBS (D30)
// ============================================================================

/**
 * Activos de un job: toda la empresa, o solo los de un broker.
 *
 * Si el job apunta a un broker, se filtran sus activos en memoria. La capa de
 * datos ya trae los de la empresa y una empresa tiene decenas de activos, no
 * millones: una consulta más específica no compensa el método extra.
 */
async function activosDelJob(job) {
  const todos = await datos.obtenerActivosParaActualizar(job.empresa_id)
  if (!job.broker_id) return todos
  return todos.filter((a) => a.broker_id === job.broker_id)
}

/**
 * Procesa un job de la cola.
 *
 * El estado se marca `procesando` ANTES de trabajar, para que un segundo
 * worker (o una vuelta siguiente) no lo tome a la vez. Si el proceso muere a
 * mitad, el job queda en `procesando` y lo recupera `recuperarJobsColgados()`.
 */
async function procesarJob(job) {
  log(`Job ${job.id}: actualizando ${job.broker_id ? `broker ${job.broker_id}` : 'toda la empresa'}`)

  const { error: errTomar } = await supabase
    .from('precios_jobs')
    .update({
      estado: 'procesando',
      started_at: new Date().toISOString(),
      intentos: (job.intentos ?? 0) + 1,
    })
    .eq('id', job.id)

  if (errTomar) {
    log(`Job ${job.id}: no se pudo marcar como procesando: ${errTomar.message}`, 'error')
    return
  }

  try {
    const activos = await activosDelJob(job)

    if (activos.length === 0) {
      await cerrarJob(job.id, {
        estado: 'hecho',
        activos_totales: 0,
        activos_actualizados: 0,
        errores: 0,
        detalles: [],
        error_mensaje: 'No hay activos que actualizar.',
      })
      log(`Job ${job.id}: sin activos`, 'warn')
      return
    }

    const r = await sincronizarPrecios({
      datos,
      activos,
      fechaRespaldo: hoyLocal(),
      log,
    })

    await cerrarJob(job.id, {
      estado: 'hecho',
      activos_totales: r.total,
      activos_actualizados: r.actualizados,
      errores: r.errores,
      // Se recorta por si una empresa enorme llenara la fila: el detalle
      // completo no aporta más que los primeros fallos.
      detalles: r.detalles.slice(0, 200),
      error_mensaje: null,
    })

    log(
      `Job ${job.id}: ${r.actualizados}/${r.total} actualizados, ${r.errores} errores`,
      r.errores === 0 ? 'ok' : 'warn'
    )
  } catch (err) {
    await cerrarJob(job.id, {
      estado: 'error',
      error_mensaje: mensajeDeError(err),
    })
    log(`Job ${job.id} falló: ${err.message}`, 'error')
  }
}

/** Escribe el desenlace del job. Nunca tumba el ciclo si falla. */
async function cerrarJob(id, campos) {
  const { error } = await supabase
    .from('precios_jobs')
    .update({ ...campos, finished_at: new Date().toISOString() })
    .eq('id', id)

  if (error) log(`No se pudo cerrar el job ${id}: ${error.message}`, 'error')
}

/**
 * Devuelve a `pendiente` los jobs que llevan demasiado en `procesando`.
 *
 * Sin esto, un worker que muere a mitad deja el job colgado para siempre y el
 * botón de la UI se queda en «procesando» indefinidamente.
 */
async function recuperarJobsColgados() {
  const hace30min = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('precios_jobs')
    .update({ estado: 'pendiente' })
    .eq('estado', 'procesando')
    .lt('started_at', hace30min)
    .select('id')

  if (error) {
    log(`No se pudieron recuperar jobs colgados: ${error.message}`, 'warn')
    return
  }
  if (data?.length) {
    log(`Recuperados ${data.length} job(s) colgado(s)`, 'warn')
  }
}

/** Atiende los jobs pendientes. Devuelve cuántos procesó. */
async function atenderCola() {
  const { data: jobs, error } = await supabase
    .from('precios_jobs')
    .select('id, empresa_id, broker_id, intentos')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    log(`No se pudo leer la cola: ${error.message}`, 'error')
    return 0
  }
  if (!jobs?.length) return 0

  log(`Cola: ${jobs.length} job(s) pendiente(s)`)
  for (const job of jobs) {
    await procesarJob(job)
  }
  return jobs.length
}

// ============================================================================
// BARRIDO DIARIO (D31)
// ============================================================================

/**
 * Refresca los precios de todos los activos de todas las empresas.
 *
 * Es lo que mantiene `activos_broker.valor_unitario` al día sin que nadie
 * pulse nada. El botón del PRD §8 solo adelanta lo que este barrido ya hará.
 *
 * Se aparta la fecha **antes** de barrer: si este proceso muere a mitad, la
 * fila queda en `procesando` y `recuperarBarridos()` la libera en la siguiente
 * vuelta. Si en cambio se marcara al final, un worker que muere barrería de
 * nuevo al reiniciarse, que es justo lo que la tabla existe para evitar.
 */
async function barrerTodo(fecha) {
  let apartado = false

  try {
    apartado = await datos.apartarBarrido(fecha)
  } catch (err) {
    log(`No se pudo apartar el barrido de ${fecha}: ${err.message}`, 'error')
    return
  }

  if (!apartado) {
    log(`El barrido de ${fecha} ya está en marcha en otro proceso; se omite`, 'warn')
    return
  }

  try {
    const activos = await datos.obtenerTodosActivosParaActualizar()

    if (activos.length === 0) {
      await datos.cerrarBarrido(fecha, {
        estado: 'hecho',
        activos_totales: 0,
        activos_actualizados: 0,
        errores: 0,
      })
      log('Barrido: no hay activos que actualizar', 'warn')
      return
    }

    const r = await sincronizarPrecios({
      datos,
      activos,
      fechaRespaldo: hoyLocal(),
      log,
    })

    // Se cierra como 'hecho' aunque haya errores por activo: un ticker mal
    // escrito no debe hacer que el barrido del día se reintente en bucle. Los
    // fallos quedan contados en `errores` y en los logs.
    await datos.cerrarBarrido(fecha, {
      estado: 'hecho',
      activos_totales: r.total,
      activos_actualizados: r.actualizados,
      errores: r.errores,
      error_mensaje: null,
    })

    log(
      `Barrido ${fecha}: ${r.actualizados}/${r.total} posiciones, ${r.errores} errores`,
      r.errores === 0 ? 'ok' : 'warn'
    )
  } catch (err) {
    try {
      await datos.cerrarBarrido(fecha, {
        estado: 'error',
        error_mensaje: mensajeDeError(err),
      })
    } catch (errCierre) {
      log(`No se pudo marcar el barrido como fallido: ${errCierre.message}`, 'error')
    }
    log(`Barrido ${fecha} falló: ${err.message}`, 'error')
  }
}

/**
 * Libera los barridos que quedaron a medias y decide si toca barrer hoy.
 *
 * Devuelve sin barrer si no toca: es el caso normal en casi todas las vueltas
 * (una cada 5 minutos, el barrido es uno al día).
 */
async function intentarBarrido() {
  if (SIN_BARRIDO) return

  const { fecha, hora } = partesEnZona(new Date(), BARRIDO_TZ)

  // Un barrido anterior que murió a mitad deja la fila en `procesando`, y el
  // índice único por fecha impediría apartar el de hoy para siempre. Se libera
  // antes de consultar, no después: si se hiciera al revés, la fila colgada
  // haría creer que el barrido de hoy ya está en marcha y no se reintentaría.
  try {
    const liberados = await datos.recuperarBarridosColgados()
    if (liberados > 0) {
      log(`Liberados ${liberados} barrido(s) colgado(s)`, 'warn')
    }
  } catch (err) {
    log(`No se pudieron liberar barridos colgados: ${err.message}`, 'warn')
    return
  }

  let ultimaFechaBarrida = null
  try {
    ultimaFechaBarrida = await datos.obtenerUltimoBarridoHecho()
  } catch (err) {
    log(`No se pudo leer el último barrido: ${err.message}`, 'error')
    return
  }

  if (
    !tocaBarrer({
      fecha,
      hora,
      horaObjetivo: BARRIDO_HORA,
      ultimaFechaBarrida,
    })
  ) {
    return
  }

  log(`Toca barrido (${hora} en ${BARRIDO_TZ}, objetivo ${BARRIDO_HORA})`)
  await barrerTodo(fecha)
}

// ============================================================================
// CICLO
// ============================================================================

let enVuelta = false

/**
 * Una vuelta completa: recuperar colgados, atender la cola y, si toca, barrer.
 *
 * La guarda `enVuelta` evita que dos vueltas se solapen: `setInterval` no
 * espera a que la anterior termine, y un barrido de cientos de activos puede
 * tardar más que el intervalo. Sin la guarda, el mismo barrido arrancaría dos
 * veces y las dos peticiones a Yahoo se sumarían.
 */
async function vuelta() {
  if (enVuelta) {
    log('La vuelta anterior sigue en curso; se omite esta', 'warn')
    return
  }

  enVuelta = true
  const inicio = Date.now()

  try {
    if (!SIN_COLA) {
      await recuperarJobsColgados()
      await atenderCola()
    }

    await intentarBarrido()

    log(`Vuelta terminada en ${((Date.now() - inicio) / 1000).toFixed(2)}s`)
  } catch (err) {
    // Una vuelta que falla no debe matar al worker: el proceso sigue vivo y la
    // siguiente vuelta lo intenta otra vez.
    log(`Error en la vuelta: ${err.message}`, 'error')
  } finally {
    enVuelta = false
  }
}

// ============================================================================
// ARRANQUE
// ============================================================================

let intervalo = null

async function main() {
  const { hora } = partesEnZona(new Date(), BARRIDO_TZ)
  const faltan = minutosHastaBarrido(hora, BARRIDO_HORA)

  if (UNA_VEZ) {
    log('Modo UNA_VEZ: una vuelta y salir')
    await vuelta()
    return
  }

  log(`Worker de precios iniciado (cola cada ${POLL_INTERVAL_MS / 1000}s)`)
  log(
    faltan > 0
      ? `Barrido diario: hoy a las ${BARRIDO_HORA} de ${BARRIDO_TZ} (en ${faltan} min)`
      : `Barrido diario: ${BARRIDO_HORA} de ${BARRIDO_TZ}`
  )

  await vuelta()
  intervalo = setInterval(vuelta, POLL_INTERVAL_MS)
}

function detener(senal) {
  log(`Recibido ${senal}, deteniendo…`)
  if (intervalo) clearInterval(intervalo)
  process.exit(0)
}

process.on('SIGINT', () => detener('SIGINT'))
process.on('SIGTERM', () => detener('SIGTERM'))

main().catch((err) => {
  log(`Fallo fatal: ${err.message}`, 'error')
  process.exit(1)
})
