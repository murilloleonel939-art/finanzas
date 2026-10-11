import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, query } from './db.mjs'

const app = express()
const port = Number(process.env.PORT || 3000)
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')
}

app.disable('x-powered-by')
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map((v) => v.trim()).filter(Boolean) || true }))
app.use(express.json({ limit: '15mb' }))

const publicUserFields = `id, email, full_name, app_role, estado, created_at, updated_at`

function error(res, status, message) {
  return res.status(status).json({ error: message })
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.app_role, email: user.email },
    jwtSecret,
    { expiresIn: '8h', issuer: 'finanzadmin-api', audience: 'finanzadmin-web' }
  )
}

async function requireAuth(req, res, next) {
  const header = req.get('authorization')
  if (!header?.startsWith('Bearer ')) return error(res, 401, 'Sesión requerida.')
  try {
    const token = jwt.verify(header.slice(7), jwtSecret, {
      issuer: 'finanzadmin-api',
      audience: 'finanzadmin-web',
    })
    const user = await currentUser(token.sub)
    if (!user || user.estado !== 'activo') return error(res, 401, 'Tu acceso está desactivado.')
    // El rol se lee de PostgreSQL en cada petición: degradar o desactivar a un
    // usuario surte efecto de inmediato, incluso si aún conserva un JWT válido.
    req.auth = { ...token, role: user.app_role }
    next()
  } catch {
    return error(res, 401, 'Tu sesión venció. Inicia sesión de nuevo.')
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'super_admin') return error(res, 403, 'Solo el superusuario puede realizar esta acción.')
  next()
}

async function currentUser(id) {
  const result = await query(`select ${publicUserFields} from usuarios where id = $1`, [id])
  return result.rows[0] ?? null
}

function validateUserInput(body, { creating = false } = {}) {
  const email = body.email?.trim().toLowerCase()
  const fullName = body.full_name?.trim() || null
  const appRole = body.app_role || 'usuario'
  const estado = body.estado || 'activo'
  const password = body.password

  if (creating && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'Escribe un email válido.'
  if (creating && (!password || password.length < 6)) return 'La contraseña inicial debe tener al menos 6 caracteres.'
  if (!['super_admin', 'usuario'].includes(appRole)) return 'Rol global inválido.'
  if (!['activo', 'inactivo'].includes(estado)) return 'Estado inválido.'
  if (!Array.isArray(body.empresas)) return 'Empresas inválidas.'
  if (body.empresas.some((e) => !e?.empresa_id || !['contador', 'cliente'].includes(e.rol))) return 'Una empresa asignada no es válida.'
  return null
}

async function requireCompanyAccess(userId, role, empresaId) {
  if (role === 'super_admin') return true
  const access = await query(
    `select 1 from usuario_empresa ue
     join empresas e on e.id = ue.empresa_id
     where ue.usuario_id = $1 and ue.empresa_id = $2
       and ue.deleted_at is null and e.deleted_at is null and e.estado = 'activa'`,
    [userId, empresaId]
  )
  return access.rowCount > 0
}

async function replaceCompanies(client, userId, empresas) {
  await client.query('delete from usuario_empresa where usuario_id = $1', [userId])
  for (const empresa of empresas) {
    await client.query(
      'insert into usuario_empresa (usuario_id, empresa_id, rol) values ($1, $2, $3)',
      [userId, empresa.empresa_id, empresa.rol]
    )
  }
}

app.get('/api/health', async (_req, res) => {
  await query('select 1')
  res.json({ ok: true })
})

app.post('/api/auth/login', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase()
  const password = req.body.password
  if (!email || !password) return error(res, 400, 'Email y contraseña son obligatorios.')

  const result = await query('select * from usuarios where lower(email) = lower($1)', [email])
  const user = result.rows[0]
  const valid = user && user.estado === 'activo' && await bcrypt.compare(password, user.password_hash)
  if (!valid) return error(res, 401, 'Email o contraseña incorrectos.')

  res.json({ token: signToken(user), user: await currentUser(user.id) })
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await currentUser(req.auth.sub)
  if (!user || user.estado !== 'activo') return error(res, 401, 'Tu acceso está desactivado.')
  res.json({ user })
})

app.get('/api/empresas', requireAuth, async (req, res) => {
  const params = []
  let access = ''
  if (req.auth.role !== 'super_admin') {
    params.push(req.auth.sub)
    access = `and exists (
      select 1 from usuario_empresa ue
      where ue.empresa_id = e.id and ue.usuario_id = $${params.length} and ue.deleted_at is null
    )`
  }
  const result = await query(
    `select e.id, e.nombre, e.estado, e.pais, e.created_at, e.updated_at
     from empresas e where e.deleted_at is null ${access} order by e.nombre`,
    params
  )
  res.json({ empresas: result.rows })
})

app.post('/api/admin/empresas', requireAuth, requireAdmin, async (req, res) => {
  const nombre = req.body.nombre?.trim()
  const pais = req.body.pais?.trim() || null
  const estado = req.body.estado || 'activa'
  if (!nombre) return error(res, 400, 'El nombre de la empresa es obligatorio.')
  if (!['activa', 'suspendida'].includes(estado)) return error(res, 400, 'Estado inválido.')
  const created = await query(
    `insert into empresas (nombre, pais, estado, created_by)
     values ($1, $2, $3, $4)
     returning id, nombre, pais, estado, created_at, updated_at`,
    [nombre, pais, estado, req.auth.sub]
  )
  res.status(201).json({ empresa: created.rows[0] })
})

app.patch('/api/admin/empresas/:id', requireAuth, requireAdmin, async (req, res) => {
  const nombre = req.body.nombre?.trim()
  const pais = req.body.pais?.trim() || null
  const estado = req.body.estado
  if (!nombre) return error(res, 400, 'El nombre de la empresa es obligatorio.')
  if (!['activa', 'suspendida'].includes(estado)) return error(res, 400, 'Estado inválido.')
  const updated = await query(
    `update empresas set nombre = $2, pais = $3, estado = $4
     where id = $1 and deleted_at is null
     returning id, nombre, pais, estado, created_at, updated_at`,
    [req.params.id, nombre, pais, estado]
  )
  if (!updated.rowCount) return error(res, 404, 'Empresa no encontrada.')
  res.json({ empresa: updated.rows[0] })
})

app.delete('/api/admin/empresas/:id', requireAuth, requireAdmin, async (req, res) => {
  const deleted = await query(
    'update empresas set deleted_at = now() where id = $1 and deleted_at is null',
    [req.params.id]
  )
  if (!deleted.rowCount) return error(res, 404, 'Empresa no encontrada.')
  res.status(204).end()
})

app.post('/api/admin/empresas/:id/restaurar', requireAuth, requireAdmin, async (req, res) => {
  const restored = await query('update empresas set deleted_at = null where id = $1', [req.params.id])
  if (!restored.rowCount) return error(res, 404, 'Empresa no encontrada.')
  res.status(204).end()
})

app.get('/api/empresas/:empresaId/resumen', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const [cuentas, activos, wallets] = await Promise.all([
    query(`select tipo_moneda as moneda, coalesce(sum(monto), 0) as monto
      from cuentas where empresa_id = $1 and deleted_at is null group by tipo_moneda`, [req.params.empresaId]),
    query(`select moneda, coalesce(sum(cantidad * valor_unitario), 0) as monto
      from activos_broker where empresa_id = $1 and deleted_at is null group by moneda`, [req.params.empresaId]),
    query(`select s.moneda, coalesce(sum(s.monto), 0) as monto
      from wallet_saldos s join wallets w on w.id = s.wallet_id and w.deleted_at is null
      where w.empresa_id = $1 group by s.moneda`, [req.params.empresaId]),
  ])
  const totals = new Map()
  for (const row of [...cuentas.rows, ...activos.rows, ...wallets.rows]) {
    const moneda = String(row.moneda || 'N/A').trim().toUpperCase()
    totals.set(moneda, (totals.get(moneda) || 0) + Number(row.monto || 0))
  }
  res.json({ totales: [...totals.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: Number(monto.toFixed(8)) }))
    .filter((row) => row.monto !== 0)
    .sort((a, b) => a.moneda.localeCompare(b.moneda)) })
})

app.get('/api/empresas/:empresaId/bancos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const result = await query(
    `select id, empresa_id, pais, nombre_banco, created_at, updated_at
     from bancos where empresa_id = $1 and deleted_at is null order by nombre_banco`,
    [req.params.empresaId]
  )
  res.json({ bancos: result.rows })
})

app.get('/api/empresas/:empresaId/cuentas', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const result = await query(
    `select id, empresa_id, banco_id, numero_cuenta, tipo_cuenta, tipo_moneda, monto, created_at, updated_at
     from cuentas where empresa_id = $1 and deleted_at is null order by numero_cuenta`,
    [req.params.empresaId]
  )
  res.json({ cuentas: result.rows })
})

app.post('/api/empresas/:empresaId/bancos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const pais = req.body.pais?.trim()
  const nombre = req.body.nombre_banco?.trim()
  if (!pais || !nombre) return error(res, 400, 'País y nombre del banco son obligatorios.')
  try {
    const created = await query(
      `insert into bancos (empresa_id, pais, nombre_banco, created_by)
       values ($1, $2, $3, $4)
       returning id, empresa_id, pais, nombre_banco, created_at, updated_at`,
      [req.params.empresaId, pais, nombre, req.auth.sub]
    )
    res.status(201).json({ banco: created.rows[0] })
  } catch (err) {
    if (err.code === '23505') return error(res, 409, 'Ya existe un banco con ese nombre en esta empresa.')
    throw err
  }
})

app.delete('/api/empresas/:empresaId/bancos/:bancoId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const deleted = await query(
    'update bancos set deleted_at = now() where id = $1 and empresa_id = $2 and deleted_at is null',
    [req.params.bancoId, req.params.empresaId]
  )
  if (!deleted.rowCount) return error(res, 404, 'Banco no encontrado.')
  res.status(204).end()
})

app.post('/api/empresas/:empresaId/cuentas', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const { banco_id: bancoId, numero_cuenta: numeroCuenta, tipo_cuenta: tipoCuenta, tipo_moneda: tipoMoneda } = req.body
  const monto = Number(req.body.monto ?? 0)
  if (!bancoId || !numeroCuenta?.trim() || !tipoMoneda?.trim()) return error(res, 400, 'Completa los datos obligatorios de la cuenta.')
  if (!['ahorros', 'corriente'].includes(tipoCuenta)) return error(res, 400, 'Tipo de cuenta inválido.')
  if (!Number.isFinite(monto) || monto < 0) return error(res, 400, 'El saldo inicial debe ser un número igual o mayor que cero.')

  const client = await pool.connect()
  try {
    await client.query('begin')
    const bank = await client.query(
      'select id from bancos where id = $1 and empresa_id = $2 and deleted_at is null',
      [bancoId, req.params.empresaId]
    )
    if (!bank.rowCount) {
      await client.query('rollback')
      return error(res, 400, 'El banco seleccionado no pertenece a esta empresa.')
    }
    const created = await client.query(
      `insert into cuentas (empresa_id, banco_id, numero_cuenta, tipo_cuenta, tipo_moneda, monto, created_by)
       values ($1, $2, $3, $4, $5, 0, $6) returning id`,
      [req.params.empresaId, bancoId, numeroCuenta.trim(), tipoCuenta, tipoMoneda.trim(), req.auth.sub]
    )
    if (monto > 0) {
      await client.query(
        `insert into movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto, orden, created_by)
         values ($1, $2, current_date, 'Saldo inicial', 'ingreso', $3, 0, $4)`,
        [req.params.empresaId, created.rows[0].id, monto, req.auth.sub]
      )
    }
    await client.query('commit')
    res.status(201).json({ cuentaId: created.rows[0].id })
  } catch (err) {
    await client.query('rollback')
    if (err.code === '23505') return error(res, 409, 'Ese número de cuenta ya existe en este banco.')
    throw err
  } finally {
    client.release()
  }
})

app.get('/api/cuentas/:cuentaId', requireAuth, async (req, res) => {
  const result = await query(
    `select c.id, c.empresa_id, c.banco_id, b.nombre_banco as banco_nombre, b.pais as banco_pais,
            c.numero_cuenta, c.tipo_cuenta, c.tipo_moneda, c.monto
     from cuentas c join bancos b on b.id = c.banco_id and b.deleted_at is null
     where c.id = $1 and c.deleted_at is null`,
    [req.params.cuentaId]
  )
  const cuenta = result.rows[0]
  if (!cuenta) return error(res, 404, 'Cuenta no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, cuenta.empresa_id)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  res.json({ cuenta })
})

app.get('/api/cuentas/:cuentaId/movimientos', requireAuth, async (req, res) => {
  const account = await query(
    'select empresa_id from cuentas where id = $1 and deleted_at is null',
    [req.params.cuentaId]
  )
  if (!account.rowCount) return error(res, 404, 'Cuenta no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, account.rows[0].empresa_id)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const result = await query(
    `select id, fecha, descripcion, tipo, monto, orden
     from movimientos where cuenta_id = $1 and deleted_at is null
     order by fecha asc, orden asc, created_at asc`,
    [req.params.cuentaId]
  )
  res.json({ movimientos: result.rows })
})

app.post('/api/empresas/:empresaId/cuentas/:cuentaId/movimientos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const fecha = req.body.fecha
  const descripcion = req.body.descripcion?.trim()
  const tipo = req.body.tipo
  const monto = Number(req.body.monto)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return error(res, 400, 'La fecha no es válida.')
  if (!descripcion) return error(res, 400, 'La descripción es obligatoria.')
  if (!['ingreso', 'egreso'].includes(tipo)) return error(res, 400, 'Tipo de movimiento inválido.')
  if (!Number.isFinite(monto) || monto <= 0) return error(res, 400, 'El monto debe ser mayor que cero.')

  const client = await pool.connect()
  try {
    await client.query('begin')
    const account = await client.query(
      'select id from cuentas where id = $1 and empresa_id = $2 and deleted_at is null for update',
      [req.params.cuentaId, req.params.empresaId]
    )
    if (!account.rowCount) {
      await client.query('rollback')
      return error(res, 404, 'Cuenta no encontrada.')
    }
    const order = await client.query(
      'select coalesce(max(orden), -1) + 1 as siguiente from movimientos where cuenta_id = $1 and fecha = $2 and deleted_at is null',
      [req.params.cuentaId, fecha]
    )
    const created = await client.query(
      `insert into movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto, orden, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [req.params.empresaId, req.params.cuentaId, fecha, descripcion, tipo, monto, order.rows[0].siguiente, req.auth.sub]
    )
    await client.query(
      `update cuentas set monto = coalesce((
        select sum(case when tipo = 'ingreso' then monto else -monto end)
        from movimientos where cuenta_id = $1 and deleted_at is null
      ), 0) where id = $1`,
      [req.params.cuentaId]
    )
    await client.query('commit')
    res.status(201).json({ movimientoId: created.rows[0].id })
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
})

app.delete('/api/empresas/:empresaId/cuentas/:cuentaId/movimientos/:movimientoId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) {
    return error(res, 403, 'No tienes acceso a esta empresa.')
  }
  const client = await pool.connect()
  try {
    await client.query('begin')
    const account = await client.query(
      'select id from cuentas where id = $1 and empresa_id = $2 and deleted_at is null for update',
      [req.params.cuentaId, req.params.empresaId]
    )
    if (!account.rowCount) {
      await client.query('rollback')
      return error(res, 404, 'Cuenta no encontrada.')
    }
    const deleted = await client.query(
      `update movimientos set deleted_at = now()
       where id = $1 and cuenta_id = $2 and empresa_id = $3 and deleted_at is null`,
      [req.params.movimientoId, req.params.cuentaId, req.params.empresaId]
    )
    if (!deleted.rowCount) {
      await client.query('rollback')
      return error(res, 404, 'Movimiento no encontrado.')
    }
    await client.query(
      `update cuentas set monto = coalesce((
        select sum(case when tipo = 'ingreso' then monto else -monto end)
        from movimientos where cuenta_id = $1 and deleted_at is null
      ), 0) where id = $1`,
      [req.params.cuentaId]
    )
    await client.query('commit')
    res.status(204).end()
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
})

app.get('/api/empresas/:empresaId/brokers', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(
    'select id, empresa_id, nombre_broker, moneda, created_at from brokers where empresa_id = $1 and deleted_at is null order by nombre_broker',
    [req.params.empresaId]
  )
  res.json({ brokers: result.rows })
})

app.post('/api/empresas/:empresaId/brokers', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const nombre = req.body.nombre_broker?.trim()
  const moneda = req.body.moneda?.trim()
  if (!nombre || !moneda) return error(res, 400, 'Nombre y moneda son obligatorios.')
  const created = await query(
    'insert into brokers (empresa_id, nombre_broker, moneda, created_by) values ($1, $2, $3, $4) returning id, nombre_broker, moneda',
    [req.params.empresaId, nombre, moneda, req.auth.sub]
  )
  res.status(201).json({ broker: created.rows[0] })
})

app.get('/api/brokers/:brokerId', requireAuth, async (req, res) => {
  const result = await query('select id, empresa_id, nombre_broker, moneda from brokers where id = $1 and deleted_at is null', [req.params.brokerId])
  const broker = result.rows[0]
  if (!broker) return error(res, 404, 'Broker no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, broker.empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  res.json({ broker })
})

app.delete('/api/empresas/:empresaId/brokers/:brokerId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const deleted = await query('update brokers set deleted_at = now() where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.brokerId, req.params.empresaId])
  if (!deleted.rowCount) return error(res, 404, 'Broker no encontrado.')
  res.status(204).end()
})

app.get('/api/brokers/:brokerId/movimientos', requireAuth, async (req, res) => {
  const brokerResult = await query('select empresa_id, moneda from brokers where id = $1 and deleted_at is null', [req.params.brokerId])
  const broker = brokerResult.rows[0]
  if (!broker) return error(res, 404, 'Broker no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, broker.empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select id, fecha, descripcion, tipo, monto, cantidad, valor_unitario, $2::text as broker_moneda
    from movimientos_broker where broker_id = $1 and deleted_at is null order by fecha desc, created_at desc`, [req.params.brokerId, broker.moneda])
  res.json({ movimientos: result.rows })
})

app.post('/api/empresas/:empresaId/brokers/:brokerId/movimientos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const { fecha, descripcion, tipo } = req.body
  const monto = Number(req.body.monto)
  const cantidad = req.body.cantidad == null ? null : Number(req.body.cantidad)
  const valorUnitario = req.body.valor_unitario == null ? null : Number(req.body.valor_unitario)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !descripcion?.trim()) return error(res, 400, 'Fecha y descripción son obligatorias.')
  if (!['ingreso', 'egreso'].includes(tipo) || !Number.isFinite(monto) || monto <= 0) return error(res, 400, 'Movimiento inválido.')
  if ((cantidad === null) !== (valorUnitario === null) || (cantidad !== null && (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(valorUnitario) || valorUnitario < 0))) return error(res, 400, 'La operación necesita cantidad y valor unitario válidos.')
  const broker = await query('select id from brokers where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.brokerId, req.params.empresaId])
  if (!broker.rowCount) return error(res, 404, 'Broker no encontrado.')
  const created = await query(`insert into movimientos_broker (empresa_id, broker_id, fecha, descripcion, tipo, monto, cantidad, valor_unitario, created_by)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`, [req.params.empresaId, req.params.brokerId, fecha, descripcion.trim(), tipo, monto, cantidad, valorUnitario, req.auth.sub])
  res.status(201).json({ movimientoId: created.rows[0].id })
})

app.delete('/api/empresas/:empresaId/brokers/:brokerId/movimientos/:movimientoId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const deleted = await query('update movimientos_broker set deleted_at = now() where id = $1 and broker_id = $2 and empresa_id = $3 and deleted_at is null', [req.params.movimientoId, req.params.brokerId, req.params.empresaId])
  if (!deleted.rowCount) return error(res, 404, 'Movimiento no encontrado.')
  res.status(204).end()
})

app.get('/api/brokers/:brokerId/activos', requireAuth, async (req, res) => {
  const brokerResult = await query('select empresa_id from brokers where id = $1 and deleted_at is null', [req.params.brokerId])
  if (!brokerResult.rowCount) return error(res, 404, 'Broker no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, brokerResult.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select id, nombre_activo, tipo_activo, cantidad, valor_unitario, moneda, (cantidad * valor_unitario) as valor_total
    from activos_broker where broker_id = $1 and deleted_at is null order by nombre_activo`, [req.params.brokerId])
  res.json({ activos: result.rows })
})

app.post('/api/empresas/:empresaId/brokers/:brokerId/activos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const nombre = req.body.nombre_activo?.trim()
  const tipo = req.body.tipo_activo || 'accion'
  const cantidad = Number(req.body.cantidad)
  const valor = Number(req.body.valor_unitario)
  const moneda = req.body.moneda?.trim()
  if (!nombre || !['accion','etf','bono','fondo','criptomoneda','opcion','otro'].includes(tipo) || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(valor) || valor < 0 || !moneda) return error(res, 400, 'Los datos del activo no son válidos.')
  const broker = await query('select id from brokers where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.brokerId, req.params.empresaId])
  if (!broker.rowCount) return error(res, 404, 'Broker no encontrado.')
  try {
    const created = await query(`insert into activos_broker (empresa_id, broker_id, nombre_activo, tipo_activo, cantidad, valor_unitario, moneda, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [req.params.empresaId, req.params.brokerId, nombre, tipo, cantidad, valor, moneda, req.auth.sub])
    res.status(201).json({ activoId: created.rows[0].id })
  } catch (err) {
    if (err.code === '23505') return error(res, 409, `Ya existe una posición en ${nombre} para este broker.`)
    throw err
  }
})

app.delete('/api/empresas/:empresaId/brokers/:brokerId/activos/:activoId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const deleted = await query('update activos_broker set deleted_at = now() where id = $1 and broker_id = $2 and empresa_id = $3 and deleted_at is null', [req.params.activoId, req.params.brokerId, req.params.empresaId])
  if (!deleted.rowCount) return error(res, 404, 'Activo no encontrado.')
  res.status(204).end()
})

app.get('/api/brokers/:brokerId/precios', requireAuth, async (req, res) => {
  const broker = await query('select empresa_id from brokers where id = $1 and deleted_at is null', [req.params.brokerId])
  if (!broker.rowCount) return error(res, 404, 'Broker no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, broker.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select p.id, p.activo_id, a.nombre_activo, a.tipo_activo, p.fecha, p.precio_cierre, p.precio_anterior, p.variacion_pct, p.moneda
    from precios_activo p join activos_broker a on a.id = p.activo_id and a.deleted_at is null
    where p.broker_id = $1 and p.deleted_at is null order by p.fecha desc`, [req.params.brokerId])
  res.json({ precios: result.rows })
})

app.get('/api/empresas/:empresaId/wallet-providers', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select id, tipo, nombre_proveedor, created_at from wallet_providers
    where empresa_id = $1 and deleted_at is null order by nombre_proveedor`, [req.params.empresaId])
  res.json({ proveedores: result.rows })
})

app.post('/api/empresas/:empresaId/wallet-providers', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const tipo = req.body.tipo
  const nombre = req.body.nombre_proveedor?.trim()
  if (!['cripto', 'fiat', 'ambos'].includes(tipo) || !nombre) return error(res, 400, 'Tipo y nombre del proveedor son obligatorios.')
  const created = await query(`insert into wallet_providers (empresa_id, tipo, nombre_proveedor, created_by)
    values ($1, $2, $3, $4) returning id, tipo, nombre_proveedor`, [req.params.empresaId, tipo, nombre, req.auth.sub])
  res.status(201).json({ proveedor: created.rows[0] })
})

app.delete('/api/empresas/:empresaId/wallet-providers/:proveedorId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const deleted = await query(`update wallet_providers set deleted_at = now() where id = $1 and empresa_id = $2 and deleted_at is null`, [req.params.proveedorId, req.params.empresaId])
  if (!deleted.rowCount) return error(res, 404, 'Proveedor no encontrado.')
  res.status(204).end()
})

app.get('/api/wallet-providers/:proveedorId', requireAuth, async (req, res) => {
  const result = await query('select id, empresa_id, tipo, nombre_proveedor from wallet_providers where id = $1 and deleted_at is null', [req.params.proveedorId])
  const proveedor = result.rows[0]
  if (!proveedor) return error(res, 404, 'Proveedor no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, proveedor.empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  res.json({ proveedor })
})

const walletSelect = `w.id, w.empresa_id, w.proveedor_id, p.nombre_proveedor as proveedor_nombre, w.tipo,
  w.nombre_wallet, w.direccion, w.tipo_moneda,
  coalesce((select count(*) from wallet_saldos s where s.wallet_id = w.id), 0)::int as monedas_distintas,
  coalesce((select sum(s.monto) from wallet_saldos s where s.wallet_id = w.id), 0) as saldo_total`

app.get('/api/empresas/:empresaId/wallets', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select ${walletSelect} from wallets w join wallet_providers p on p.id = w.proveedor_id and p.deleted_at is null
    where w.empresa_id = $1 and w.deleted_at is null order by w.nombre_wallet`, [req.params.empresaId])
  res.json({ wallets: result.rows })
})

app.get('/api/wallet-providers/:proveedorId/wallets', requireAuth, async (req, res) => {
  const provider = await query('select empresa_id from wallet_providers where id = $1 and deleted_at is null', [req.params.proveedorId])
  if (!provider.rowCount) return error(res, 404, 'Proveedor no encontrado.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, provider.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select ${walletSelect} from wallets w join wallet_providers p on p.id = w.proveedor_id and p.deleted_at is null
    where w.proveedor_id = $1 and w.deleted_at is null order by w.nombre_wallet`, [req.params.proveedorId])
  res.json({ wallets: result.rows })
})

app.get('/api/wallets/:walletId', requireAuth, async (req, res) => {
  const result = await query(`select ${walletSelect} from wallets w join wallet_providers p on p.id = w.proveedor_id and p.deleted_at is null
    where w.id = $1 and w.deleted_at is null`, [req.params.walletId])
  const wallet = result.rows[0]
  if (!wallet) return error(res, 404, 'Wallet no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, wallet.empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  res.json({ wallet })
})

app.post('/api/empresas/:empresaId/wallet-providers/:proveedorId/wallets', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const { nombre_wallet: nombre, direccion, tipo_moneda: tipoMoneda, tipo, saldos = [], fecha_apertura: fecha } = req.body
  if (!nombre?.trim() || !['cripto', 'fiat', 'ambos'].includes(tipo) || !tipoMoneda?.trim()) return error(res, 400, 'Nombre, tipo y moneda son obligatorios.')
  if (!Array.isArray(saldos) || saldos.some((s) => !s?.moneda || !Number.isFinite(Number(s.monto)) || Number(s.monto) < 0)) return error(res, 400, 'Los saldos iniciales no son válidos.')
  if (new Set(saldos.map((s) => s.moneda)).size !== saldos.length) return error(res, 400, 'No puede repetirse una moneda.')
  const provider = await query('select id, tipo from wallet_providers where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.proveedorId, req.params.empresaId])
  if (!provider.rowCount || (provider.rows[0].tipo !== 'ambos' && provider.rows[0].tipo !== tipo)) return error(res, 400, 'El tipo de la wallet no coincide con el proveedor.')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const wallet = await client.query(`insert into wallets (empresa_id, proveedor_id, tipo, nombre_wallet, direccion, tipo_moneda, created_by)
      values ($1, $2, $3, $4, $5, $6, $7) returning id`, [req.params.empresaId, req.params.proveedorId, tipo, nombre.trim(), direccion?.trim() || null, tipoMoneda.trim(), req.auth.sub])
    for (const saldo of saldos.filter((s) => Number(s.monto) > 0)) {
      const moneda = String(saldo.moneda).trim().toUpperCase()
      await client.query('insert into wallet_saldos (wallet_id, moneda, monto) values ($1, $2, $3)', [wallet.rows[0].id, moneda, Number(saldo.monto)])
      await client.query(`insert into movimientos_wallet (empresa_id, proveedor_id, wallet_id, fecha, descripcion, tipo, monto, tipo_moneda, created_by)
        values ($1, $2, $3, $4, 'Saldo inicial', 'ingreso', $5, $6, $7)`, [req.params.empresaId, req.params.proveedorId, wallet.rows[0].id, fecha || new Date().toISOString().slice(0, 10), Number(saldo.monto), moneda, req.auth.sub])
    }
    await client.query('commit')
    res.status(201).json({ walletId: wallet.rows[0].id })
  } catch (err) { await client.query('rollback'); throw err } finally { client.release() }
})

app.delete('/api/empresas/:empresaId/wallets/:walletId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const deleted = await query('update wallets set deleted_at = now() where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.walletId, req.params.empresaId])
  if (!deleted.rowCount) return error(res, 404, 'Wallet no encontrada.')
  res.status(204).end()
})

app.get('/api/wallets/:walletId/saldos', requireAuth, async (req, res) => {
  const wallet = await query('select empresa_id from wallets where id = $1 and deleted_at is null', [req.params.walletId])
  if (!wallet.rowCount) return error(res, 404, 'Wallet no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, wallet.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query('select wallet_id, moneda, monto, updated_at from wallet_saldos where wallet_id = $1 order by moneda', [req.params.walletId])
  res.json({ saldos: result.rows })
})

app.get('/api/wallets/:walletId/movimientos', requireAuth, async (req, res) => {
  const wallet = await query('select empresa_id from wallets where id = $1 and deleted_at is null', [req.params.walletId])
  if (!wallet.rowCount) return error(res, 404, 'Wallet no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, wallet.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const result = await query(`select m.id, m.fecha, m.descripcion, m.tipo, m.monto, m.tipo_moneda, p.nombre_proveedor as proveedor_nombre, m.external_id, m.created_at
    from movimientos_wallet m join wallet_providers p on p.id = m.proveedor_id and p.deleted_at is null
    where m.wallet_id = $1 and m.deleted_at is null order by m.fecha desc, m.created_at desc`, [req.params.walletId])
  res.json({ movimientos: result.rows })
})

app.post('/api/empresas/:empresaId/wallets/:walletId/movimientos', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const { fecha, descripcion, tipo } = req.body
  const moneda = String(req.body.tipo_moneda || '').trim().toUpperCase()
  const monto = Number(req.body.monto)
  const wallet = await query('select proveedor_id from wallets where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.walletId, req.params.empresaId])
  if (!wallet.rowCount) return error(res, 404, 'Wallet no encontrada.')
  if (!fecha || !descripcion?.trim() || !['ingreso', 'egreso'].includes(tipo) || !moneda?.trim() || !Number.isFinite(monto) || monto <= 0) return error(res, 400, 'Los datos del movimiento no son válidos.')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const created = await client.query(`insert into movimientos_wallet (empresa_id, proveedor_id, wallet_id, fecha, descripcion, tipo, monto, tipo_moneda, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`, [req.params.empresaId, wallet.rows[0].proveedor_id, req.params.walletId, fecha, descripcion.trim(), tipo, monto, moneda.trim(), req.auth.sub])
    const descuadres = await recalcularWallet(req.params.walletId, client)
    if (descuadres.length) {
      await client.query('rollback')
      return error(res, 409, `El movimiento dejaría un saldo negativo en ${descuadres.map((d) => d.moneda).join(', ')}.`)
    }
    await client.query('commit')
    res.status(201).json({ movimientoId: created.rows[0].id })
  } catch (err) { await client.query('rollback'); throw err } finally { client.release() }
})

async function recalcularWallet(walletId, client = pool) {
  const result = await client.query(`select tipo, tipo_moneda, sum(case when tipo = 'ingreso' then monto else -monto end) as monto
    from movimientos_wallet where wallet_id = $1 and deleted_at is null group by tipo_moneda, tipo`, [walletId])
  const totals = new Map()
  for (const row of result.rows) {
    const moneda = String(row.tipo_moneda).trim().toUpperCase()
    totals.set(moneda, (totals.get(moneda) || 0) + Number(row.monto))
  }
  const descuadres = [...totals.entries()].filter(([, monto]) => monto < 0).map(([moneda, monto]) => ({ moneda, monto }))
  if (descuadres.length) return descuadres
  await client.query('delete from wallet_saldos where wallet_id = $1', [walletId])
  for (const [moneda, monto] of totals) {
    await client.query('insert into wallet_saldos (wallet_id, moneda, monto) values ($1, $2, $3)', [walletId, moneda, monto])
  }
  return []
}

app.post('/api/wallets/:walletId/recalcular-saldos', requireAuth, async (req, res) => {
  const wallet = await query('select empresa_id from wallets where id = $1 and deleted_at is null', [req.params.walletId])
  if (!wallet.rowCount) return error(res, 404, 'Wallet no encontrada.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, wallet.rows[0].empresa_id)) return error(res, 403, 'No tienes acceso a esta empresa.')
  res.json({ descuadres: await recalcularWallet(req.params.walletId) })
})

app.delete('/api/empresas/:empresaId/wallets/:walletId/movimientos/:movimientoId', requireAuth, async (req, res) => {
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, req.params.empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const wallet = await query('select id from wallets where id = $1 and empresa_id = $2 and deleted_at is null', [req.params.walletId, req.params.empresaId])
  if (!wallet.rowCount) return error(res, 404, 'Wallet no encontrada.')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const deleted = await client.query('update movimientos_wallet set deleted_at = now() where id = $1 and wallet_id = $2 and empresa_id = $3 and deleted_at is null', [req.params.movimientoId, req.params.walletId, req.params.empresaId])
    if (!deleted.rowCount) { await client.query('rollback'); return error(res, 404, 'Movimiento no encontrado.') }
    const descuadres = await recalcularWallet(req.params.walletId, client)
    if (descuadres.length) {
      await client.query('rollback')
      return error(res, 409, `El borrado dejaría un saldo negativo en ${descuadres.map((d) => d.moneda).join(', ')}.`)
    }
    await client.query('commit')
    res.json({ descuadres: [] })
  } catch (err) { await client.query('rollback'); throw err } finally { client.release() }
})

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req, res) => {
  const [empresas, usuarios, vinculos] = await Promise.all([
    query('select estado, pais from empresas where deleted_at is null'),
    query('select id, app_role, estado from usuarios'),
    query('select usuario_id, rol from usuario_empresa where deleted_at is null'),
  ])
  const usuariosConEmpresa = new Set(vinculos.rows.map((row) => row.usuario_id))
  res.json({
    empresas: {
      total: empresas.rowCount,
      activas: empresas.rows.filter((row) => row.estado === 'activa').length,
      suspendidas: empresas.rows.filter((row) => row.estado === 'suspendida').length,
      paises: new Set(empresas.rows.map((row) => row.pais).filter(Boolean)).size,
    },
    usuarios: {
      total: usuarios.rowCount,
      activos: usuarios.rows.filter((row) => row.estado === 'activo').length,
      superAdmins: usuarios.rows.filter((row) => row.app_role === 'super_admin').length,
      sinEmpresa: usuarios.rows.filter((row) => row.app_role !== 'super_admin' && row.estado === 'activo' && !usuariosConEmpresa.has(row.id)).length,
    },
    vinculos: {
      contadores: vinculos.rows.filter((row) => row.rol === 'contador').length,
      clientes: vinculos.rows.filter((row) => row.rol === 'cliente').length,
    },
  })
})

app.get('/api/admin/empresas-recientes', requireAuth, requireAdmin, async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 5, 1), 50)
  const result = await query(`select id, nombre, estado, pais, created_at
    from empresas where deleted_at is null order by created_at desc limit $1`, [limite])
  res.json({ empresas: result.rows })
})

app.post('/api/empresas/:empresaId/import-jobs', requireAuth, async (req, res) => {
  const empresaId = req.params.empresaId
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const target = String(req.body.target || '')
  const destinoId = String(req.body.destino_id || '')
  const archivo = req.body.archivo
  const archivoNombre = String(req.body.archivo_nombre || 'extracto.pdf').toLowerCase()
  const extension = path.extname(archivoNombre).replace('.', '')
  if (!['cuenta', 'wallet', 'broker'].includes(target) || !destinoId || typeof archivo !== 'string') return error(res, 400, 'Datos de importación inválidos.')
  if (!['pdf', 'csv', 'xls', 'xlsx'].includes(extension)) return error(res, 400, 'El archivo debe ser PDF, CSV o Excel.')
  const table = target === 'cuenta' ? 'cuentas' : target === 'wallet' ? 'wallets' : 'brokers'
  const destination = await query(`select id, empresa_id from ${table} where id = $1 and empresa_id = $2 and deleted_at is null`, [destinoId, empresaId])
  if (!destination.rowCount) return error(res, 404, 'Destino no encontrado.')
  const raw = archivo.replace(/^data:[^;]+;base64,/, '')
  const content = Buffer.from(raw, 'base64')
  if (content.length < 1) return error(res, 400, 'El archivo está vacío o es inválido.')
  if (content.length > 10 * 1024 * 1024) return error(res, 413, 'El archivo supera el límite de 10 MB.')
  const storageRoot = path.resolve(process.env.IMPORT_STORAGE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads'))
  const directory = path.join(storageRoot, empresaId)
  await mkdir(directory, { recursive: true })
  const jobId = crypto.randomUUID()
  const absolutePath = path.join(directory, `${jobId}.${extension}`)
  const storagePath = path.relative(storageRoot, absolutePath)
  await writeFile(absolutePath, content, { flag: 'wx' })
  const periodo = /^\d{4}-\d{2}$/.test(String(req.body.periodo || '')) ? String(req.body.periodo) : null
  const columns = target === 'cuenta' ? '(empresa_id, cuenta_id, target, storage_path, proveedor, periodo, created_by)' : target === 'wallet' ? '(empresa_id, wallet_id, target, storage_path, proveedor, periodo, created_by)' : '(empresa_id, broker_id, target, storage_path, proveedor, periodo, created_by)'
  const values = target === 'cuenta' ? [empresaId, destinoId, target, storagePath, req.body.proveedor || null, periodo, req.auth.sub] : target === 'wallet' ? [empresaId, destinoId, target, storagePath, req.body.proveedor || null, periodo, req.auth.sub] : [empresaId, destinoId, target, storagePath, null, periodo, req.auth.sub]
  const inserted = await query(`insert into import_jobs ${columns} values ($1, $2, $3, $4, $5, $6, $7) returning *`, values)
  res.status(201).json({ job: inserted.rows[0] })
})

app.get('/api/empresas/:empresaId/import-jobs', requireAuth, async (req, res) => {
  const empresaId = req.params.empresaId
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const estado = req.query.estado ? String(req.query.estado) : null
  const result = await query(`select * from import_jobs
    where empresa_id = $1 and ($2::text is null or estado = $2)
    order by created_at desc limit $3`, [empresaId, estado, limit])
  res.json({ jobs: result.rows })
})

app.get('/api/import-jobs/:jobId', requireAuth, async (req, res) => {
  const result = await query('select * from import_jobs where id = $1', [req.params.jobId])
  if (!result.rowCount || !await requireCompanyAccess(req.auth.sub, req.auth.role, result.rows[0].empresa_id)) return error(res, 404, 'Job no encontrado.')
  res.json({ job: result.rows[0] })
})

app.delete('/api/empresas/:empresaId/cuentas/:cuentaId/movimientos/mes/:periodo', requireAuth, async (req, res) => {
  const { empresaId, cuentaId, periodo } = req.params
  if (!/^\d{4}-\d{2}$/.test(periodo)) return error(res, 400, 'El período no es válido.')
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const account = await client.query('select id from cuentas where id = $1 and empresa_id = $2 and deleted_at is null for update', [cuentaId, empresaId])
    if (!account.rowCount) { await client.query('rollback'); return error(res, 404, 'Cuenta no encontrada.') }
    const deleted = await client.query(`update movimientos set deleted_at = now() where cuenta_id = $1 and empresa_id = $2 and deleted_at is null and to_char(fecha, 'YYYY-MM') = $3`, [cuentaId, empresaId, periodo])
    await client.query(`update cuentas set monto = coalesce((select sum(case when tipo = 'ingreso' then monto else -monto end) from movimientos where cuenta_id = $1 and deleted_at is null), 0) where id = $1`, [cuentaId])
    await client.query('commit')
    res.json({ eliminados: deleted.rowCount })
  } catch (err) { await client.query('rollback'); throw err } finally { client.release() }
})

app.post('/api/empresas/:empresaId/precios-jobs', requireAuth, async (req, res) => {
  const empresaId = req.params.empresaId
  if (!await requireCompanyAccess(req.auth.sub, req.auth.role, empresaId)) return error(res, 403, 'No tienes acceso a esta empresa.')
  const brokerId = req.body.broker_id || null
  if (brokerId) {
    const broker = await query('select id from brokers where id = $1 and empresa_id = $2 and deleted_at is null', [brokerId, empresaId])
    if (!broker.rowCount) return error(res, 404, 'Broker no encontrado.')
  }
  const inserted = await query(`insert into precios_jobs (empresa_id, broker_id, estado, created_by)
    values ($1, $2, 'pendiente', $3) returning *`, [empresaId, brokerId, req.auth.sub])
  res.status(201).json({ job: inserted.rows[0] })
})

app.get('/api/admin/jobs', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const estado = req.query.estado ? String(req.query.estado) : null
  const [items, stats, total] = await Promise.all([
    query(`select id, empresa_id, broker_id, estado, activos_totales, activos_actualizados,
      errores, detalles, error_mensaje, intentos, started_at, finished_at, created_by, created_at
      from precios_jobs where ($1::text is null or estado = $1)
      order by created_at desc limit $2 offset $3`, [estado, limit, offset]),
    query(`select estado, count(*)::integer as cantidad from precios_jobs
      where ($1::text is null or estado = $1) group by estado`, [estado]),
    query('select count(*)::integer as total from precios_jobs where ($1::text is null or estado = $1)', [estado]),
  ])
  res.json({
    jobs: items.rows,
    estadisticas: Object.fromEntries(stats.rows.map((row) => [row.estado, row.cantidad])),
    paginacion: { total: total.rows[0].total, limit, offset },
  })
})

app.get('/api/admin/logs', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const filters = [req.query.accion || null, req.query.entidad || null, req.query.estado || null, req.query.desde || null, req.query.hasta || null]
  const where = `where ($1::text is null or accion = $1)
    and ($2::text is null or entidad ilike '%' || $2 || '%')
    and ($3::text is null or estado = $3)
    and ($4::timestamptz is null or created_at >= $4)
    and ($5::timestamptz is null or created_at <= $5)`
  const [items, total, stats] = await Promise.all([
    query(`select id, admin_id, accion, entidad, entidad_id, detalles, ip_address, user_agent,
      estado, mensaje_error, duracion_ms, created_at from admin_logs ${where}
      order by created_at desc limit $6 offset $7`, [...filters, limit, offset]),
    query(`select count(*)::integer as total from admin_logs ${where}`, filters),
    query(`select estado, count(*)::integer as cantidad from admin_logs ${where} group by estado`, filters),
  ])
  res.json({
    logs: items.rows,
    estadisticas: Object.fromEntries(stats.rows.map((row) => [row.estado, row.cantidad])),
    paginacion: { total: total.rows[0].total, limit, offset },
  })
})

app.get('/api/admin/config', requireAuth, requireAdmin, async (req, res) => {
  const params = []
  let where = ''
  if (req.query.clave) { params.push(req.query.clave); where = 'where clave = $1' }
  const result = await query(`select id, clave, valor, tipo, descripcion, grupo, editable, updated_at
    from admin_config ${where} order by grupo nulls first, clave`, params)
  res.json({ datos: result.rows })
})

app.post('/api/admin/config', requireAuth, requireAdmin, async (req, res) => {
  const clave = String(req.body.clave || '').trim()
  const valor = req.body.valor
  const tipo = String(req.body.tipo || 'string').trim()
  if (!clave || !['string', 'integer', 'boolean', 'json'].includes(tipo) || valor === undefined || valor === null) {
    return error(res, 400, 'Configuración inválida.')
  }
  const updated = await query(`update admin_config set valor = $2, tipo = $3, actualizado_por = $4
    where clave = $1 and editable = true returning id, clave, valor, tipo, descripcion, grupo, editable, updated_at`,
  [clave, String(valor), tipo, req.auth.sub])
  if (!updated.rowCount) return error(res, 404, 'Configuración no encontrada o no editable.')
  res.json({ configuracion: updated.rows[0] })
})

app.post('/api/admin/notificaciones', requireAuth, requireAdmin, async (req, res) => {
  const tipo = String(req.body.tipo || 'personalizado')
  const destinatario = String(req.body.destinatario || '').trim()
  let asunto = req.body.asunto ? String(req.body.asunto) : ''
  let cuerpo = req.body.cuerpo ? String(req.body.cuerpo) : ''
  if (!destinatario || !destinatario.includes('@')) return error(res, 400, 'Destinatario inválido.')
  if (!asunto || !cuerpo) {
    const plantilla = await query('select asunto, cuerpo from notif_plantillas where clave = $1', [tipo])
    if (plantilla.rowCount) { asunto ||= plantilla.rows[0].asunto; cuerpo ||= plantilla.rows[0].cuerpo }
  }
  if (!asunto || !cuerpo) return error(res, 400, 'Asunto y cuerpo son obligatorios.')
  const variables = req.body.variables && typeof req.body.variables === 'object' ? req.body.variables : {}
  for (const [clave, valor] of Object.entries(variables)) {
    const reemplazo = String(valor)
    asunto = asunto.replaceAll(`{{${clave}}}`, reemplazo)
    cuerpo = cuerpo.replaceAll(`{{${clave}}}`, reemplazo)
  }
  const inserted = await query(`insert into notificaciones
    (tipo, destinatario, asunto, cuerpo, estado, creado_por) values ($1, $2, $3, $4, 'pendiente', $5)
    returning id, estado, created_at`, [tipo, destinatario, asunto, cuerpo, req.auth.sub])
  res.status(201).json({ mensaje: 'Email encolado.', notificacion: inserted.rows[0] })
})

app.get('/api/admin/notificaciones', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const estado = req.query.estado ? String(req.query.estado) : null
  if (estado && !['pendiente', 'enviado', 'error'].includes(estado)) return error(res, 400, 'Estado inválido.')
  const [items, total] = await Promise.all([
    query(`select id, tipo, destinatario, asunto, estado, error_mensaje, intentos, enviado_en, created_at
      from notificaciones where ($1::text is null or estado = $1) order by created_at desc limit $2 offset $3`, [estado, limit, offset]),
    query('select count(*)::integer as total from notificaciones where ($1::text is null or estado = $1)', [estado]),
  ])
  res.json({ notificaciones: items.rows, total: total.rows[0].total })
})

app.get('/api/admin/notificacion-plantillas', requireAuth, requireAdmin, async (_req, res) => {
  const result = await query('select id, clave, asunto, cuerpo, descripcion from notif_plantillas order by clave')
  res.json({ plantillas: result.rows })
})

app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (_req, res) => {
  const result = await query(
    `select u.id, u.email, u.full_name, u.app_role, u.estado, u.created_at, u.updated_at, coalesce(
      json_agg(json_build_object('vinculo_id', ue.id, 'empresa_id', e.id, 'nombre', e.nombre, 'rol', ue.rol))
      filter (where ue.id is not null and e.id is not null), '[]'::json
     ) as empresas
     from usuarios u
     left join usuario_empresa ue on ue.usuario_id = u.id and ue.deleted_at is null
     left join empresas e on e.id = ue.empresa_id and e.deleted_at is null
     group by u.id order by u.created_at desc`
  )
  res.json({ usuarios: result.rows })
})

app.post('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const invalid = validateUserInput(req.body, { creating: true })
  if (invalid) return error(res, 400, invalid)

  const client = await pool.connect()
  try {
    await client.query('begin')
    const passwordHash = await bcrypt.hash(req.body.password, 12)
    const created = await client.query(
      `insert into usuarios (email, password_hash, full_name, app_role, estado)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        req.body.email.trim().toLowerCase(),
        passwordHash,
        req.body.full_name?.trim() || null,
        req.body.app_role || 'usuario',
        req.body.estado || 'activo',
      ]
    )
    await replaceCompanies(client, created.rows[0].id, req.body.empresas)
    await client.query('commit')
    res.status(201).json({ mensaje: 'Usuario creado. Comparte la contraseña inicial de forma segura.', userId: created.rows[0].id })
  } catch (err) {
    await client.query('rollback')
    if (err.code === '23505') return error(res, 409, 'Ya existe un usuario con ese email.')
    throw err
  } finally {
    client.release()
  }
})

app.patch('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = req.params.id
  if (userId === req.auth.sub && (req.body.app_role !== 'super_admin' || req.body.estado !== 'activo')) {
    return error(res, 400, 'No puedes cambiar tu propio rol ni desactivar tu cuenta.')
  }
  const invalid = validateUserInput({ ...req.body, empresas: req.body.empresas ?? [] })
  if (invalid) return error(res, 400, invalid)

  const client = await pool.connect()
  try {
    await client.query('begin')
    const updated = await client.query(
      `update usuarios set full_name = $2, app_role = $3, estado = $4 where id = $1 returning id`,
      [userId, req.body.full_name?.trim() || null, req.body.app_role, req.body.estado]
    )
    if (!updated.rowCount) {
      await client.query('rollback')
      return error(res, 404, 'Usuario no encontrado.')
    }
    await replaceCompanies(client, userId, req.body.empresas)
    await client.query('commit')
    res.json({ mensaje: 'Usuario actualizado.' })
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
})

app.post('/api/admin/usuarios/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const password = req.body.password
  if (!password || password.length < 6) return error(res, 400, 'La contraseña debe tener al menos 6 caracteres.')
  const passwordHash = await bcrypt.hash(password, 12)
  const updated = await query('update usuarios set password_hash = $2 where id = $1', [req.params.id, passwordHash])
  if (!updated.rowCount) return error(res, 404, 'Usuario no encontrado.')
  res.json({ mensaje: 'Contraseña actualizada.' })
})

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
app.use(express.static(webRoot))
app.get('*', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')))

app.use((err, _req, res, _next) => {
  console.error(err)
  error(res, 500, 'Ocurrió un error interno.')
})

app.listen(port, () => console.log(`FinanzAdmin API escuchando en puerto ${port}`))
