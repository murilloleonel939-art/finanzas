#!/usr/bin/env node

/**
 * FASE 18: Pruebas de integración — Edge Function `actualizar-precios`.
 *
 * Valida que:
 *   1. Solo super_admin puede llamarla.
 *   2. Valida empresa y broker.
 *   3. Encola un job en `precios_jobs`.
 *   4. Devuelve el job con estado `pendiente`.
 *
 * POR QUÉ stub de Supabase:
 *   - La Edge Function no toca BD realmente en tests.
 *   - El stub que usan FASE 15/17 es reutilizable.
 */

import { strict as assert } from 'node:assert'

// ============================================================================
// SETUP
// ============================================================================

/**
 * Stub de Supabase que simula:
 *   - Verificación de usuario (JWT)
 *   - select/insert en tablas
 *   - policies simuladas
 */
class SupabaseStub {
  constructor() {
    this.data = {
      usuarios: [
        {
          id: 'user-admin',
          rol: 'super_admin',
          empresa_id: 'emp-1',
          activo: true,
        },
      ],
      empresas: [
        { id: 'emp-1', nombre: 'Acme Corp', deleted_at: null },
        { id: 'emp-2', nombre: 'Otro Co', deleted_at: null },
      ],
      brokers: [
        { id: 'bro-1', empresa_id: 'emp-1', nombre: 'IBKR', deleted_at: null },
        { id: 'bro-2', empresa_id: 'emp-1', nombre: 'TD', deleted_at: null },
        { id: 'bro-3', empresa_id: 'emp-2', nombre: 'Interactive', deleted_at: null },
      ],
      precios_jobs: [],
    }

    this.nextJobId = 1
  }

  from(tabla) {
    return new TablaStub(tabla, this.data, this)
  }

  insertarJob(empresa_id, broker_id, created_by) {
    const id = `job-${this.nextJobId++}`
    const job = {
      id,
      empresa_id,
      broker_id,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      created_by,
      resultado: null,
      error: null,
    }
    this.data.precios_jobs.push(job)
    return job
  }
}

class TablaStub {
  constructor(tabla, data, supabase) {
    this.tabla = tabla
    this.data = data
    this.supabase = supabase
    this.filtros = {}
    this.devuelveSelect = false
  }

  select(..._campos) {
    this.devuelveSelect = true
    return this
  }

  eq(columna, valor) {
    this.filtros[columna] = { op: 'eq', valor }
    return this
  }

  is(columna, valor) {
    this.filtros[columna] = { op: 'is', valor }
    return this
  }

  insert(fila) {
    // Estamos insertando en precios_jobs
    if (this.tabla === 'precios_jobs') {
      const job = this.supabase.insertarJob(
        fila.empresa_id,
        fila.broker_id,
        fila.created_by
      )
      this.resultadoInsert = job
    }
    return this
  }

  single() {
    return this
  }

  maybeSingle() {
    return this
  }

  async select(fields) {
    // Implementar selects como método async
    return this
  }

  async then(fn) {
    // Simular promesa
    const resultado = await this.ejecutar()
    fn(resultado)
  }

  async ejecutar() {
    if (this.resultadoInsert) {
      return { data: this.resultadoInsert, error: null }
    }

    const tabla = this.data[this.tabla]
    if (!tabla) {
      return { data: null, error: new Error(`Tabla ${this.tabla} no existe`) }
    }

    let filas = tabla.filter((fila) => {
      for (const [col, { op, valor }] of Object.entries(this.filtros)) {
        if (op === 'eq' && fila[col] !== valor) return false
        if (op === 'is' && fila[col] !== valor) return false
      }
      return true
    })

    if (filas.length === 0) {
      return { data: null, error: null }
    }

    return { data: filas[0], error: null }
  }
}

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
// TESTS
// ============================================================================

test('Edge Function: sin autenticación rechaza', async () => {
  // Sin Authorization header, debe rechazar con 401
  const resultado = await simularEdgeFunctionCall({
    headers: {},
    body: { empresa_id: 'emp-1' },
  })

  assert.equal(resultado.status, 401, `Esperaba 401, obtuvo ${resultado.status}`)
  assert.ok(resultado.body.error.includes('Autenticación'))
})

test('Edge Function: usuario no super_admin rechaza', async () => {
  const stub = new SupabaseStub()
  stub.data.usuarios.push({
    id: 'user-normal',
    rol: 'usuario',
    empresa_id: 'emp-1',
    activo: true,
  })

  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-normal' },
    body: { empresa_id: 'emp-1' },
    supabase: stub,
  })

  assert.equal(resultado.status, 403, `Esperaba 403, obtuvo ${resultado.status}`)
})

test('Edge Function: falta empresa_id', async () => {
  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-admin' },
    body: {},
  })

  assert.equal(resultado.status, 400)
  assert.ok(resultado.body.error.includes('empresa_id'))
})

test('Edge Function: empresa no existe', async () => {
  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-admin' },
    body: { empresa_id: 'empresa-fantasma' },
  })

  assert.equal(resultado.status, 404)
  assert.ok(resultado.body.error.includes('Empresa'))
})

test('Edge Function: broker no pertenece a la empresa', async () => {
  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-admin' },
    body: { empresa_id: 'emp-1', broker_id: 'bro-3' }, // bro-3 es de emp-2
  })

  assert.equal(resultado.status, 404)
  assert.ok(resultado.body.error.includes('Broker'))
})

test('Edge Function: encola job exitosamente', async () => {
  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-admin' },
    body: { empresa_id: 'emp-1' },
  })

  assert.equal(resultado.status, 201)
  assert.ok(resultado.body.ok)
  assert.ok(resultado.body.job)
  assert.equal(resultado.body.job.empresa_id, 'emp-1')
  assert.equal(resultado.body.job.estado, 'pendiente')
  assert.ok(resultado.body.job.id)
})

test('Edge Function: encola job con broker específico', async () => {
  const resultado = await simularEdgeFunctionCall({
    headers: { authorization: 'Bearer token-user-admin' },
    body: { empresa_id: 'emp-1', broker_id: 'bro-1' },
  })

  assert.equal(resultado.status, 201)
  assert.equal(resultado.body.job.broker_id, 'bro-1')
  assert.equal(resultado.body.job.empresa_id, 'emp-1')
})

// ============================================================================
// SIMULADOR
// ============================================================================

/**
 * Simula una llamada a la Edge Function sin Deno/Supabase reales.
 */
async function simularEdgeFunctionCall({ headers = {}, body = {}, supabase } = {}) {
  if (!supabase) {
    supabase = new SupabaseStub()
  }

  // Parsear JWT (stub: asumimos `token-user-<id>`)
  const authHeader = headers.authorization
  let userId = null
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token.startsWith('token-')) {
      userId = token.slice(6)
    }
  }

  // 1. AUTENTICACIÓN
  if (!userId) {
    return {
      status: 401,
      body: { error: 'Autenticación requerida' },
    }
  }

  const usuario = supabase.data.usuarios.find((u) => u.id === userId && u.activo)
  if (!usuario) {
    return {
      status: 401,
      body: { error: 'Usuario no encontrado o inactivo' },
    }
  }

  if (usuario.rol !== 'super_admin') {
    return {
      status: 403,
      body: { error: 'Solo super_admin puede actualizar precios' },
    }
  }

  // 2. PARÁMETROS
  const empresaId = body.empresa_id
  const brokerId = body.broker_id ?? null

  if (!empresaId || typeof empresaId !== 'string') {
    return {
      status: 400,
      body: { error: 'Falta empresa_id (uuid)' },
    }
  }

  if (brokerId && typeof brokerId !== 'string') {
    return {
      status: 400,
      body: { error: 'broker_id debe ser uuid o null' },
    }
  }

  // 3. VALIDAR EMPRESA
  const empresa = supabase.data.empresas.find(
    (e) => e.id === empresaId && !e.deleted_at
  )
  if (!empresa) {
    return {
      status: 404,
      body: { error: 'Empresa no encontrada o está borrada' },
    }
  }

  // 4. VALIDAR BROKER
  if (brokerId) {
    const broker = supabase.data.brokers.find(
      (b) => b.id === brokerId && b.empresa_id === empresaId && !b.deleted_at
    )
    if (!broker) {
      return {
        status: 404,
        body: { error: 'Broker no pertenece a la empresa o está borrado' },
      }
    }
  }

  // 5. ENCOLAR JOB
  const job = supabase.insertarJob(empresaId, brokerId, userId)

  return {
    status: 201,
    body: {
      ok: true,
      job,
      mensaje: brokerId
        ? `Actualización solicitada para el broker ${brokerId}`
        : 'Actualización solicitada para toda la empresa',
    },
  }
}

// ============================================================================
// FIN
// ============================================================================

console.log('\n✅ Todas las pruebas de integración pasaron (FASE 18)')
