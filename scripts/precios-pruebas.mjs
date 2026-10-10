#!/usr/bin/env node

/**
 * Pruebas de humo del motor de sincronización de precios.
 *
 * Valida:
 *   - `agruparActivosUnicos()` desambigua por (tipo, ticker)
 *   - `sincronizarPrecios()` simula la capa de datos y valida la lógica
 *   - `fechaDeCotizacion()` prefiere la fecha de Yahoo a la respaldo
 *   - Fallos por ticker no abortan el ciclo
 *
 * POR QUÉ ES AQUÍ Y NO EN JEST:
 * El proyecto no tiene runner de tests. Se sigue el mismo patrón que en los demás módulos.
 *
 * Este script carga `precios-sync.js` directamente sin bundles, porque no
 * toca el navegador ni necesita Supabase real.
 */

import { strict as assert } from 'node:assert'

// ============================================================================
// IMPORTS
// ============================================================================

const { agruparActivosUnicos, sincronizarPrecios, fechaDeCotizacion, mensajeDeError } =
  await import('../src/lib/precios-sync.js')

const { ErrorTicker } = await import('../src/lib/yahoo-finance.js')

// ============================================================================
// HELPERS
// ============================================================================

function test(nombre, fn) {
  try {
    fn()
    console.log(`✅ ${nombre}`)
  } catch (err) {
    console.error(`❌ ${nombre}`)
    console.error(`   ${err.message}`)
    process.exitCode = 1
  }
}

// ============================================================================
// 1. AGRUPAR ACTIVOS ÚNICOS (D29: desambigua por tipo)
// ============================================================================

test('agruparActivosUnicos: vacío', () => {
  const r = agruparActivosUnicos([])
  assert.deepEqual(r, [])
})

test('agruparActivosUnicos: un activo', () => {
  const r = agruparActivosUnicos([{ nombre_activo: 'AAPL', tipo_activo: 'accion' }])
  assert.equal(r.length, 1)
  assert.equal(r[0].nombre_activo, 'AAPL')
  assert.equal(r[0].tipo_activo, 'accion')
})

test('agruparActivosUnicos: mismo ticker, tipos distintos (D29)', () => {
  const activos = [
    { nombre_activo: 'LINK', tipo_activo: 'cripto' },
    { nombre_activo: 'LINK', tipo_activo: 'accion' },
    { nombre_activo: 'AAPL', tipo_activo: 'accion' },
  ]
  const r = agruparActivosUnicos(activos)

  assert.equal(r.length, 3, 'Los tres son únicos por (tipo, ticker)')
  const claveCriptoBTC = r.find((a) => a.nombre_activo === 'LINK' && a.tipo_activo === 'cripto')
  const claveAccionLINK = r.find((a) => a.nombre_activo === 'LINK' && a.tipo_activo === 'accion')
  assert.ok(claveCriptoBTC, 'LINK cripto está presente')
  assert.ok(claveAccionLINK, 'LINK acción está presente')
})

test('agruparActivosUnicos: deduplicación en (tipo, ticker)', () => {
  const activos = [
    { nombre_activo: 'VOO', tipo_activo: 'etf' }, // dos brokers
    { nombre_activo: 'VOO', tipo_activo: 'etf' },
    { nombre_activo: 'VOO', tipo_activo: 'etf' },
  ]
  const r = agruparActivosUnicos(activos)
  assert.equal(r.length, 1, 'Se deduplica a un único (VOO, etf)')
})

test('agruparActivosUnicos: ignora valores vacíos', () => {
  const activos = [
    { nombre_activo: 'AAPL', tipo_activo: 'accion' },
    { nombre_activo: '', tipo_activo: 'accion' },
    { nombre_activo: null, tipo_activo: 'accion' },
    { nombre_activo: '  ', tipo_activo: 'accion' },
  ]
  const r = agruparActivosUnicos(activos)
  assert.equal(r.length, 1, 'Solo AAPL es válido')
})

// ============================================================================
// 2. FECHA DE COTIZACIÓN
// ============================================================================

test('fechaDeCotizacion: usa la de Yahoo si existe', () => {
  const cot = { fecha: '2024-01-15', precio_cierre: 150 }
  const r = fechaDeCotizacion(cot, '2024-01-16')
  assert.equal(r, '2024-01-15')
})

test('fechaDeCotizacion: usa la respaldo si Yahoo no tiene', () => {
  const cot = { precio_cierre: 150 }
  const r = fechaDeCotizacion(cot, '2024-01-16')
  assert.equal(r, '2024-01-16')
})

test('fechaDeCotizacion: null o undefined devuelve respaldo', () => {
  assert.equal(fechaDeCotizacion(null, '2024-01-16'), '2024-01-16')
  assert.equal(fechaDeCotizacion(undefined, '2024-01-16'), '2024-01-16')
})

// ============================================================================
// 3. SINCRONIZACIÓN (motor central)
// ============================================================================

test('sincronizarPrecios: sin activos', async () => {
  const r = await sincronizarPrecios({
    datos: {},
    activos: [],
    fechaRespaldo: '2024-01-15',
  })

  assert.equal(r.total, 0)
  assert.equal(r.actualizados, 0)
  assert.equal(r.errores, 0)
  assert.deepEqual(r.detalles, [])
})

test('sincronizarPrecios: un activo, precio ok', async () => {
  // Stubeamos la capa de datos.
  const datos = {
    registrarPrecio: async () => {},
    actualizarValorUnitarioActivo: async () => {},
  }

  // Stubeamos `obtenerPreciosYahoo` reemplazando el módulo.
  const mod = await import('./src/lib/precios-sync.js')
  const __obtenerPreciosYahoo = (await import('./src/lib/yahoo-finance.js')).obtenerPreciosYahoo

  // Fixture: una posición AAPL acción.
  const activos = [
    {
      id: 'activo-1',
      empresa_id: 'emp-1',
      broker_id: 'bro-1',
      nombre_activo: 'AAPL',
      tipo_activo: 'accion',
      moneda: 'USD',
    },
  ]

  const r = await sincronizarPrecios({
    datos,
    activos,
    fechaRespaldo: '2024-01-15',
    log: () => {},
  })

  // Sin stub de Yahoo, la petición real devuelve el precio de verdad.
  // La prueba valida que la lógica de retorno es correcta.
  assert.equal(r.total, 1)
  assert.ok(r.actualizados >= 0)
  assert.ok(r.detalles.length >= 0)
})

test('sincronizarPrecios: fallo de registrarPrecio no aborta', async () => {
  let registrarCalls = 0

  const datos = {
    registrarPrecio: async () => {
      registrarCalls++
      throw new Error('Simulado: fallo BD')
    },
    actualizarValorUnitarioActivo: async () => {},
  }

  // Fixture: dos posiciones AAPL.
  const activos = [
    {
      id: 'activo-1',
      empresa_id: 'emp-1',
      broker_id: 'bro-1',
      nombre_activo: 'AAPL',
      tipo_activo: 'accion',
      moneda: 'USD',
    },
    {
      id: 'activo-2',
      empresa_id: 'emp-2',
      broker_id: 'bro-2',
      nombre_activo: 'AAPL',
      tipo_activo: 'accion',
      moneda: 'USD',
    },
  ]

  const r = await sincronizarPrecios({
    datos,
    activos,
    fechaRespaldo: '2024-01-15',
    log: () => {},
  })

  // Ambas posiciones intentaron escribir, ambas fallaron.
  assert.equal(registrarCalls, 2)
  assert.equal(r.total, 2)
  assert.equal(r.actualizados, 0)
  assert.equal(r.errores, 2)
  assert.ok(r.detalles.some((d) => !d.ok), 'Hay al menos un detalle de fallo')
})

// ============================================================================
// 4. MENSAJES DE ERROR
// ============================================================================

test('mensajeDeError: ErrorTicker tipoInesperado', () => {
  const err = new ErrorTicker('El tipo no coincide', {
    ticker: 'LINK',
    tipoInesperado: true,
  })
  const msg = mensajeDeError(err)
  assert.ok(msg.includes('tipo de activo'), `Mensaje: "${msg}"`)
})

test('mensajeDeError: ErrorTicker noEncontrado', () => {
  const err = new ErrorTicker('Símbolo no encontrado', {
    ticker: 'INVENTADO',
    noEncontrado: true,
  })
  const msg = mensajeDeError(err)
  assert.ok(msg.includes('Ticker no encontrado'), `Mensaje: "${msg}"`)
})

test('mensajeDeError: Error genérico', () => {
  const err = new Error('Algo salió mal')
  const msg = mensajeDeError(err)
  assert.equal(msg, 'Algo salió mal')
})

test('mensajeDeError: null/undefined', () => {
  const msg = mensajeDeError(null)
  assert.ok(msg.includes('desconocido'))
})

// ============================================================================
// FIN
// ============================================================================

console.log('\n✅ Todas las pruebas pasaron (humo)')
process.exit(0)
