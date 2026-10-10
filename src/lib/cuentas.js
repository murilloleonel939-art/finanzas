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
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export async function listarCuentas(empresaId) {
  const { data, error } = await supabase
    .from('cuentas_view')
    .select('id, banco_id, banco_nombre, banco_pais, numero_cuenta, tipo_cuenta, tipo_moneda, monto')
    .eq('empresa_id', empresaId)
    .order('banco_nombre')
    .order('numero_cuenta')

  if (error) throw error
  return data ?? []
}

export async function obtenerCuenta(cuentaId) {
  const { data, error } = await supabase
    .from('cuentas_view')
    .select('id, empresa_id, banco_id, banco_nombre, numero_cuenta, tipo_cuenta, tipo_moneda, monto')
    .eq('id', cuentaId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
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
  const { data, error } = await supabase
    .from('movimientos_view')
    .select('id, fecha, descripcion, tipo, monto, orden, external_id')
    .eq('cuenta_id', cuentaId)
    .order('fecha', { ascending: false })
    .order('orden', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function crearMovimiento({
  empresaId,
  cuentaId,
  fecha,
  descripcion,
  tipo,
  monto,
  userId,
}) {
  // `orden`: siguiente posición dentro del mismo día, para que dos altas
  // seguidas no queden empatadas. Se lee el máximo del día.
  const { data: ultimo } = await supabase
    .from('movimientos')
    .select('orden')
    .eq('cuenta_id', cuentaId)
    .eq('fecha', fecha)
    .is('deleted_at', null)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()

  const orden = (ultimo?.orden ?? -1) + 1

  const { data, error } = await supabase
    .from('movimientos')
    .insert({
      empresa_id: empresaId,
      cuenta_id: cuentaId,
      fecha,
      descripcion,
      tipo,
      monto,
      orden,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

/**
 * Actualiza `cuentas.monto` a partir de TODOS los movimientos de la cuenta.
 *
 * Es un recálculo completo, no un incremento. La razón: con un incremento,
 * cualquier movimiento borrado, editado o importado por otra vía dejaría el
 * saldo desviado sin que nadie lo note, y en una app financiera ese descuadre
 * se arrastra para siempre. Recalcular cuesta una consulta y siempre converge.
 *
 * Se ejecuta después de crear o borrar un movimiento.
 */
export async function recalcularSaldoCuenta(cuentaId) {
  const { data, error } = await supabase
    .from('movimientos')
    .select('tipo, monto')
    .eq('cuenta_id', cuentaId)
    .is('deleted_at', null)

  if (error) throw error

  const total = (data ?? []).reduce((acc, m) => {
    const monto = Number(m.monto ?? 0)
    return acc + (m.tipo === 'ingreso' ? monto : -monto)
  }, 0)

  const { error: errUpdate } = await supabase
    .from('cuentas')
    .update({ monto: Number(total.toFixed(8)) })
    .eq('id', cuentaId)

  if (errUpdate) throw errUpdate
  return Number(total.toFixed(8))
}

export async function borrarMovimiento(id, cuentaId) {
  const { error } = await supabase
    .from('movimientos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
  await recalcularSaldoCuenta(cuentaId)
}

// ---------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------

/** Efecto de un movimiento sobre el saldo: ingreso suma, egreso resta. */
export function efecto(movimiento) {
  const monto = Number(movimiento?.monto ?? 0)
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

  // Trabajar en orden cronológico ascendente.
  const ascendente = [...movimientos].reverse()

  const totalEfectos = ascendente.reduce((acc, m) => acc + efecto(m), 0)
  let saldo = Number(saldoActual) - totalEfectos

  const conSaldo = ascendente.map((m) => {
    saldo += efecto(m)
    return { ...m, saldo_resultante: Number(saldo.toFixed(8)) }
  })

  // Devolver en el orden original (descendente).
  return conSaldo.reverse()
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

  const esIngreso = (m) => m.tipo === 'ingreso'
  const esEgreso = (m) => m.tipo === 'egreso'
  const menciona = (palabras) => (m) => {
    const d = String(m.descripcion ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    return palabras.some((p) => d.includes(p))
  }

  const ingresos = suma(esIngreso)
  const egresos = suma(esEgreso)

  return {
    ingresos,
    egresos,
    neto: Number((ingresos - egresos).toFixed(8)),
    intereses: suma((m) => esIngreso(m) && menciona(['interes', 'interest', 'rendimiento'])(m)),
    retenciones: suma(
      (m) => esEgreso(m) && menciona(['retencion', 'retenc', 'impuesto', 'comision', 'gmf', '4x1000'])(m)
    ),
    total: movimientos.length,
  }
}
