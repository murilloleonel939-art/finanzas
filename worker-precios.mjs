#!/usr/bin/env node

/**
 * FASE 18: Worker de actualización de precios
 * Corre en EC2/Coolify, polling cada X segundos
 *
 * Uso:
 *   SUPABASE_URL=https://... SUPABASE_KEY=... node worker-precios.mjs
 *
 * Configuración:
 *   POLL_INTERVAL_MS = 300000 (5 minutos entre updates)
 *   MAX_TICKERS_POR_BATCH = 50 (Yahoo Finance límite recomendado)
 */

import { createClient } from '@supabase/supabase-js'
import { obtenerPreciosYahoo } from './src/lib/yahoo-finance.js'
import {
  obtenerTodosActivosParaActualizar,
  registrarPrecio,
  actualizarValorUnitarioActivo,
} from './src/lib/precios-datos.js'

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000', 10)
const MAX_TICKERS_POR_BATCH = 50

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL y SUPABASE_KEY son requeridas')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============================================================================
// LOGGING
// ============================================================================

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString()
  const prefix =
    level === 'error'
      ? '❌'
      : level === 'warn'
        ? '⚠️'
        : level === 'success'
          ? '✅'
          : 'ℹ️'
  console.log(`[${timestamp}] ${prefix} ${msg}`)
}

// ============================================================================
// ACTUALIZACIÓN DE PRECIOS
// ============================================================================

/**
 * Procesar un lote de tickers (batch)
 */
async function procesarBatchTickers(tickers, activos, fechaHoy) {
  if (tickers.length === 0) return { exitosos: 0, errores: 0 }

  try {
    log(`Consultando ${tickers.length} tickers...`)
    const precios = await obtenerPreciosYahoo(tickers)

    let exitosos = 0
    let errores = 0

    for (const ticker of tickers) {
      const datoPrecio = precios[ticker]
      if (!datoPrecio) {
        log(`⚠️ No se obtuvo dato para ${ticker}`, 'warn')
        errores++
        continue
      }

      // Encontrar todos los activos con este ticker
      const activosDelTicker = activos.filter(
        (a) => a.nombre_activo.toUpperCase() === ticker.toUpperCase()
      )

      for (const activo of activosDelTicker) {
        try {
          // Registrar el precio
          await registrarPrecio({
            empresa_id: activo.empresa_id,
            broker_id: activo.broker_id,
            activo_id: activo.id,
            fecha: fechaHoy,
            precio_cierre: datoPrecio.precio_cierre,
            precio_anterior: datoPrecio.precio_anterior,
            variacion_pct: datoPrecio.variacion_pct,
            moneda: activo.moneda,
            userId: null, // Sistema
          })

          // Actualizar el valor_unitario del activo
          if (datoPrecio.precio_cierre) {
            await actualizarValorUnitarioActivo(
              activo.id,
              datoPrecio.precio_cierre
            )
          }

          exitosos++
        } catch (err) {
          log(
            `Error procesando activo ${activo.id} (${ticker}): ${err.message}`,
            'error'
          )
          errores++
        }
      }
    }

    return { exitosos, errores }
  } catch (err) {
    log(`Error en batch de tickers: ${err.message}`, 'error')
    return { exitosos: 0, errores: tickers.length }
  }
}

/**
 * Ciclo principal: obtener activos, agrupar por ticker, consultar precios
 */
async function actualizarPrecios() {
  const fechaInicio = Date.now()

  try {
    log('Iniciando actualización de precios...')

    // Obtener todos los activos
    const activos = await obtenerTodosActivosParaActualizar()
    log(`Se encontraron ${activos.length} activos`)

    if (activos.length === 0) {
      log('Sin activos para actualizar')
      return
    }

    // Extraer tickers únicos
    const tickers = [...new Set(activos.map((a) => a.nombre_activo))]
    log(`Tickers únicos: ${tickers.length}`)

    // Procesar en batches
    let totalExitosos = 0
    let totalErrores = 0

    for (let i = 0; i < tickers.length; i += MAX_TICKERS_POR_BATCH) {
      const batch = tickers.slice(i, i + MAX_TICKERS_POR_BATCH)
      const fechaHoy = new Date().toISOString().split('T')[0]
      const { exitosos, errores } = await procesarBatchTickers(
        batch,
        activos,
        fechaHoy
      )
      totalExitosos += exitosos
      totalErrores += errores

      // Pequeña pausa entre batches para no saturar
      if (i + MAX_TICKERS_POR_BATCH < tickers.length) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    const duracion = ((Date.now() - fechaInicio) / 1000).toFixed(2)
    log(
      `Actualización completada: ${totalExitosos} exitosos, ${totalErrores} errores (${duracion}s)`,
      'success'
    )
  } catch (err) {
    log(`Error en ciclo de actualización: ${err.message}`, 'error')
  }
}

// ============================================================================
// POLLING
// ============================================================================

async function iniciarWorker() {
  log(`Worker iniciado. Polling cada ${POLL_INTERVAL_MS}ms`)

  // Ejecutar inmediatamente al iniciar
  await actualizarPrecios()

  // Luego cada X milisegundos
  setInterval(actualizarPrecios, POLL_INTERVAL_MS)
}

// ============================================================================
// ENTRADA
// ============================================================================

iniciarWorker().catch((err) => {
  log(`Fallo fatal: ${err.message}`, 'error')
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
  log('Recibido SIGINT, deteniendo...', 'info')
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('Recibido SIGTERM, deteniendo...', 'info')
  process.exit(0)
})
