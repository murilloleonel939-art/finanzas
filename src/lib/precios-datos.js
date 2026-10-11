/** Capa de datos de precios sobre una función query de PostgreSQL. */
export function crearPreciosDatos(db) {
  const q = (text, values) => db.query(text, values)

  async function obtenerPrecioActual(activoId) {
    const r = await q('select * from precios_activo where activo_id = $1 and deleted_at is null order by fecha desc limit 1', [activoId])
    return r.rows[0] ?? null
  }
  async function obtenerHistorialPrecios(activoId, { limit = 30 } = {}) {
    const r = await q('select * from precios_activo where activo_id = $1 and deleted_at is null order by fecha desc limit $2', [activoId, limit])
    return r.rows
  }
  async function obtenerPreciosEmpresa(empresaId, fecha = null) {
    const r = await q(`select * from precios_activo where empresa_id = $1 and deleted_at is null ${fecha ? 'and fecha = $2' : ''} order by fecha desc`, fecha ? [empresaId, fecha] : [empresaId])
    return r.rows
  }
  async function registrarPrecio({ empresa_id, broker_id, activo_id, fecha, precio_cierre, precio_anterior = null, variacion_pct = null, moneda = 'USD', userId = null }) {
    const r = await q(`insert into precios_activo (empresa_id, broker_id, activo_id, fecha, precio_cierre, precio_anterior, variacion_pct, moneda, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (activo_id, fecha) where deleted_at is null do update set precio_cierre = excluded.precio_cierre, precio_anterior = excluded.precio_anterior, variacion_pct = excluded.variacion_pct
      returning *`, [empresa_id, broker_id, activo_id, fecha, precio_cierre, precio_anterior, variacion_pct, moneda, userId])
    return r.rows[0]
  }
  async function actualizarValorUnitarioActivo(activoId, valorUnitario) {
    await q('update activos_broker set valor_unitario = $1 where id = $2 and deleted_at is null', [valorUnitario, activoId])
  }
  async function obtenerActivosParaActualizar(empresaId) {
    const r = await q(`select id, empresa_id, broker_id, nombre_activo, tipo_activo, moneda from activos_broker where empresa_id = $1 and deleted_at is null order by nombre_activo`, [empresaId])
    return r.rows
  }
  async function obtenerTodosActivosParaActualizar() {
    const r = await q('select id, empresa_id, broker_id, nombre_activo, tipo_activo, moneda from activos_broker where deleted_at is null order by nombre_activo')
    return r.rows
  }
  async function obtenerTickersUnicos(empresaId) {
    const activos = await obtenerActivosParaActualizar(empresaId)
    const vistos = new Set()
    return activos.filter((a) => {
      const clave = `${a.tipo_activo}:${a.nombre_activo.toUpperCase()}`
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    }).map(({ nombre_activo, tipo_activo }) => ({ nombre_activo, tipo_activo }))
  }
  async function obtenerUltimoBarridoHecho() {
    const r = await q("select fecha from precios_barridos where estado = 'hecho' order by fecha desc limit 1")
    return r.rows[0]?.fecha ?? null
  }
  async function apartarBarrido(fecha) {
    try { await q("insert into precios_barridos (fecha, estado) values ($1, 'procesando')", [fecha]); return true } catch (err) {
      if (err.code === '23505') return false
      throw err
    }
  }
  async function cerrarBarrido(fecha, campos) {
    const keys = Object.keys(campos)
    const values = [fecha, ...keys.map((key) => campos[key])]
    const sets = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
    await q(`update precios_barridos set ${sets}, finished_at = now() where fecha = $1`, values)
  }
  async function recuperarBarridosColgados(minutos = 30) {
    const r = await q("delete from precios_barridos where estado = 'procesando' and started_at < now() - ($1 * interval '1 minute') returning fecha", [minutos])
    return r.rowCount
  }
  return { obtenerPrecioActual, obtenerHistorialPrecios, obtenerPreciosEmpresa, registrarPrecio, actualizarValorUnitarioActivo, obtenerActivosParaActualizar, obtenerTodosActivosParaActualizar, obtenerTickersUnicos, obtenerUltimoBarridoHecho, apartarBarrido, cerrarBarrido, recuperarBarridosColgados }
}

export function hoyLocal(ahora = new Date()) {
  const dosDigitos = (n) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`
}
