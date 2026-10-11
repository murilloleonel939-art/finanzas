import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
app.use(express.json({ limit: '200kb' }))

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
  if (creating && (!password || password.length < 12)) return 'La contraseña inicial debe tener al menos 12 caracteres.'
  if (!['super_admin', 'usuario'].includes(appRole)) return 'Rol global inválido.'
  if (!['activo', 'inactivo'].includes(estado)) return 'Estado inválido.'
  if (!Array.isArray(body.empresas)) return 'Empresas inválidas.'
  if (body.empresas.some((e) => !e?.empresa_id || !['contador', 'cliente'].includes(e.rol))) return 'Una empresa asignada no es válida.'
  return null
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
  if (!password || password.length < 12) return error(res, 400, 'La contraseña debe tener al menos 12 caracteres.')
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
