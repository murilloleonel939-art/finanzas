#!/usr/bin/env node

/**
 * FASE 18: Worker de precios.
 *
 * Corre en EC2/Coolify como proceso aparte del frontend. Hace dos cosas en cada
 * vuelta:
 *
 *   1. **Cola** (D30): atiende los `precios_jobs` que encoló el botón del
 *      PRD §8 desde la UI.
 *   2. **Barrido**: refresca los precios de todos los activos, para que las
 *      posiciones no se queden con el precio de hace una semana.
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
 *   SIN_BARRIDO=1               (opcional: solo atiende la cola, sin refrescar todo)
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

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000', 10)
const UNA_VEZ = process.env.UNA_VEZ === '1'
const SIN_BARRIDO = process.env.SIN_BARRIDO === '1'

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
// BARRIDO PERIÓDICO
// ============================================================================

/**
 * Refresca los precios de todos los activos de todas las empresas.
 *
 * Es lo que mantiene `activos_broker.valor_unitario` al día sin que nadie
 * pulse nada. El botón del PRD §8 solo adelanta lo que este barrido ya hará.
 */
async function barrerTodo() {
  const activos = await datos.obtenerTodosActivosParaActualizar()

  if (activos.length === 0) {
    return
  }

  const r = await sincronizarPrecios({
    datos,
    activos,
    fechaRespaldo: hoyLocal(),
    log,
  })

  log(
    `Barrido: ${r.actualizados}/${r.total} posiciones, ${r.errores} errores`,
    r.errores === 0 ? 'ok' : 'warn'
  )
}

// ============================================================================
// CICLO
// ============================================================================

/** Una vuelta completa: recuperar colgados, atender la cola y barrer. */
async function vuelta() {
  const inicio = Date.now()

  try {
    await recuperarJobsColgados()
    await atenderCola()

    if (!SIN_BARRIDO) {
      await barrerTodo()
    }

    log(`Vuelta terminada en ${((Date.now() - inicio) / 1000).toFixed(2)}s`)
  } catch (err) {
    // Una vuelta que falla no debe matar al worker: el proceso sigue vivo y la
    // siguiente vuelta lo intenta otra vez.
    log(`Error en la vuelta: ${err.message}`, 'error')
  }
}

// ============================================================================
// ARRANQUE
// ============================================================================

let intervalo = null

async function main() {
  if (UNA_VEZ) {
    log('Modo UNA_VEZ: una vuelta y salir')
    await vuelta()
    return
  }

  log(`Worker de precios iniciado (cada ${POLL_INTERVAL_MS / 1000}s)`)
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
