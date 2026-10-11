/**
 * Capa de datos y cálculos del módulo de cuentas .
 *
 * COLUMNAS REALES (migraciones 0002 y 0005) — esto es lo que corrigió la
 * una revisión de este módulo, que inventó `saldo_actual`:
 *
 *   cuentas        id, empresa_id, banco_id, numero_cuenta, tipo_cuenta,
 *                  tipo_moneda, monto, created_by, created_at, updated_at,
 *                  deleted_at
 *   movimientos    id, empresa_id, cuenta_id, fecha, descripcion, tipo,
 *                  monto, orden, external_id, source_file, ...
 *   movimientos_view  añade cuenta_numero, banco_nombre, tipo_moneda
 *
 * No existe `saldo_resultante`: el saldo de la cuenta vive en `cuentas.monto`
 * y el historial no guarda el saldo de cada fila. Se reconstruye aquí.
 */
import { api, apiJson } from '@/lib/api'

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export async function listarCuentas(empresaId) {
  const { cuentas } = await api(`/api/empresas/${empresaId}/cuentas`)
  return cuentas
}

export async function obtenerCuenta(cuentaId) {
  const { cuenta } = await api(`/api/cuentas/${cuentaId}`)
  return cuenta
}

/**
 * Movimientos de una cuenta, del más reciente al más antiguo.
 *
 * Se ordena por `fecha` y luego por `orden` descendente: dos movimientos del
 * mismo día se desempatan con `orden`, que es para lo que existe la columna
 * (migración 0002). Sin el segundo criterio, la tabla mostraría las filas del
 * mismo día en un orden arbitrario en cada recarga.
 */
export async function listarMovimientos(cuentaId) {
  const { movimientos } = await api(`/api/cuentas/${cuentaId}/movimientos`)
  return movimientos
}

export function crearMovimiento({ empresaId, cuentaId, fecha, descripcion, tipo, monto }) {
  return apiJson(`/api/empresas/${empresaId}/cuentas/${cuentaId}/movimientos`, 'POST', {
    fecha,
    descripcion,
    tipo,
    monto,
  })
}

export function borrarMovimiento(empresaId, cuentaId, movimientoId) {
  return api(`/api/empresas/${empresaId}/cuentas/${cuentaId}/movimientos/${movimientoId}`, {
    method: 'DELETE',
  })
}

export function borrarMes(empresaId, cuentaId, periodo) {
  return api(`/api/empresas/${empresaId}/cuentas/${cuentaId}/movimientos/mes/${periodo}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------

/** Efecto de un movimiento sobre el saldo: ingreso suma, egreso resta. */
export function esSaldoInicial(movimiento) {
  return /saldo\s+anterior/i.test(String(movimiento?.descripcion || ''))
}

export function efecto(movimiento) {
  const monto = Number(movimiento?.monto ?? 0)
  if (esSaldoInicial(movimiento) || movimiento?.tipo === 'saldo_inicial') return 0
  return movimiento?.tipo === 'ingreso' ? monto : -monto
}

/**
 * Reconstruye el saldo después de cada movimiento.
 *
 * El esquema no guarda un saldo por fila (no hay `saldo_resultante`), pero sí
 * el saldo final de la cuenta en `cuentas.monto`. Así que se calcula hacia
 * atrás: si el saldo actual es S y la suma de todos los efectos es E, el saldo
 * antes del primer movimiento era S - E; y desde ahí se avanza.
 *
 * Devuelve una copia de `movimientos` (en el orden recibido, típicamente
 * descendente) con un campo `saldo_resultante` añadido, para que la tabla
 * pueda mostrarlo.
 *
 * Se redondea a 8 decimales — la precisión de `numeric(20,8)` (D3) — porque
 * sumar en coma flotante en el cliente arrastra colas binarias.
 */
export function conSaldoResultante(movimientos = [], saldoActual = 0) {
  if (movimientos.length === 0) return []

  // El backend entrega el orden cronológico original del extracto.
  const ascendente = [...movimientos].sort((a, b) => {
    const fecha = String(a.fecha || '').localeCompare(String(b.fecha || ''))
    return fecha || Number(a.orden ?? 0) - Number(b.orden ?? 0)
  })

  const saldosIniciales = ascendente.filter((m) => esSaldoInicial(m))
  const saldoInicial = saldosIniciales.at(-1)
  const movimientosReales = ascendente.filter((m) => !esSaldoInicial(m) && (!saldoInicial || String(m.fecha) >= String(saldoInicial.fecha)))
  const saldoBase = saldoInicial ? Number(saldoInicial.monto || 0) : Number(saldoActual) - movimientosReales.reduce((acc, m) => acc + efecto(m), 0)
  let saldo = saldoBase

  const conSaldo = ascendente.map((m) => {
    if (esSaldoInicial(m)) {
      const esUltimoSaldo = m === saldoInicial
      return { ...m, saldo_resultante: esUltimoSaldo ? Number(saldo.toFixed(8)) : null }
    }
    if (saldoInicial && String(m.fecha) < String(saldoInicial.fecha)) return { ...m, saldo_resultante: null }

    saldo += efecto(m)
    return { ...m, saldo_resultante: Number(saldo.toFixed(8)) }
  })

  // Devolver en el orden original del extracto (ascendente).
  return conSaldo
}

/**
 * Totales del período visible.
 *
 * `intereses` y `retenciones` salen de la descripción, no de una columna: el
 * PRD §4 los pide en las tarjetas, pero el esquema no distingue un interés de
 * un ingreso cualquiera (D8 quitó los campos derivados). La coincidencia es
 * deliberadamente simple y está aquí, en un solo sitio, en vez de repartida
 * por la página.
 */
export function resumenPeriodo(movimientos = []) {
  const suma = (filtro) =>
    Number(
      movimientos.reduce((acc, m) => (filtro(m) ? acc + Number(m.monto ?? 0) : acc), 0).toFixed(8)
    )

  const esIngreso = (m) => m.tipo === 'ingreso' && !esSaldoInicial(m)
  const esEgreso = (m) => m.tipo === 'egreso' && !esSaldoInicial(m)
  const menciona = (palabras) => (m) => {
    const d = String(m.descripcion ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    return palabras.some((p) => d.includes(p))
  }

  const ingresos = suma(esIngreso)
  const egresos = suma(esEgreso)

  const saldoInicial = movimientos.filter(esSaldoInicial).sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))).at(-1)

  return {
    ingresos,
    egresos,
    saldoInicial: saldoInicial ? Number(saldoInicial.monto ?? 0) : null,
    neto: Number((ingresos - egresos).toFixed(8)),
    intereses: suma((m) => esIngreso(m) && menciona(['interes', 'interest', 'rendimiento'])(m)),
    retenciones: suma(
      (m) => esEgreso(m) && menciona(['retencion', 'retenc', 'impuesto', 'comision', 'gmf', '4x1000'])(m)
    ),
    total: movimientos.length,
  }
}
