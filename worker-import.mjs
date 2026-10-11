import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { query, pool } from './server/db.mjs'
import {
  generarPromptMovimientosCuenta,
  generarPromptMovimientosBroker,
  generarPromptMovimientosWallet,
  validarRespuestaExtraccion,
  derivarExternalId,
} from './src/lib/imports-prompts.js'

const POLL_INTERVAL = Number(process.env.IMPORT_POLL_INTERVAL_MS || 30000)
const STORAGE_DIR = process.env.IMPORT_STORAGE_DIR || path.resolve('server/uploads')
const UNA_VEZ = process.env.IMPORT_UNA_VEZ === '1'
const execFileAsync = promisify(execFile)

function log(message, level = 'info') { console.log(`[${new Date().toISOString()}] ${level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'} ${message}`) }
function fileForJob(job) {
  const root = path.resolve(STORAGE_DIR)
  const stored = path.isAbsolute(job.storage_path) ? job.storage_path : path.join(root, job.storage_path)
  const candidate = path.resolve(stored)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error('Ruta de almacenamiento inválida.')
  return candidate
}
function asArray(value) { return Array.isArray(value) ? value : [] }

async function textoDelPdf(pdfPath) {
  try {
    const { stdout } = await execFileAsync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 16 * 1024 * 1024 })
    const texto = stdout.trim()
    if (!texto) throw new Error('El PDF no contiene texto extraíble.')
    return texto
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Falta pdftotext en la imagen del worker NVIDIA.')
    throw new Error(`No se pudo extraer texto del PDF: ${error.message}`)
  }
}

async function extraerDatos(pdfPath, job, contexto) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('Falta NVIDIA_API_KEY para extraer el PDF.')
  const prompt = job.target === 'cuenta'
    ? generarPromptMovimientosCuenta({ ...contexto, proveedor: job.proveedor })
    : job.target === 'broker'
      ? generarPromptMovimientosBroker(contexto)
      : generarPromptMovimientosWallet({ ...contexto, proveedor: job.proveedor })
  const contenido = `${prompt}\n\nEXTRACTO PDF (texto extraído):\n${await textoDelPdf(pdfPath)}\n\nExtrae todos los datos. Retorna solo JSON válido.`
  const response = await fetch(process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.IMPORT_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
      max_tokens: Number(process.env.IMPORT_MAX_TOKENS || 4096),
      messages: [{ role: 'system', content: 'Eres un extractor preciso. Devuelve únicamente JSON válido.' }, { role: 'user', content: contenido }],
    }),
  })
  if (!response.ok) throw new Error(`Falló extracción NVIDIA (${response.status}).`)
  const payload = await response.json()
  const text = payload.choices?.[0]?.message?.content || ''
  const datos = validarRespuestaExtraccion(text)
  const items = Array.isArray(datos) ? datos : [...asArray(datos.movimientos), ...asArray(datos.activos)]
  for (const item of items) if (!item.external_id && item.fecha) item.external_id = await derivarExternalId(item)
  return datos
}

async function contextoDestino(client, job) {
  const table = job.target === 'cuenta' ? 'cuentas' : job.target === 'wallet' ? 'wallets' : 'brokers'
  const id = job[`${job.target}_id`]
  const result = await client.query(`select * from ${table} where id = $1 and empresa_id = $2 and deleted_at is null`, [id, job.empresa_id])
  if (!result.rowCount) throw new Error('Destino de importación no encontrado.')
  return result.rows[0]
}

async function procesarCuenta(client, job, datos) {
  let creados = 0; let duplicados = 0
  for (const item of asArray(datos)) {
    const fecha = item.fecha; const monto = Number(item.monto)
    if (!fecha || !Number.isFinite(monto) || monto < 0 || !item.descripcion || !['ingreso', 'egreso'].includes(item.tipo)) continue
    const r = await client.query(`insert into movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto, created_by)
      values ($1,$2,$3,$4,$5,$6,$7) returning id`, [job.empresa_id, job.cuenta_id, fecha, String(item.descripcion).trim(), item.tipo, monto, job.created_by])
    if (r.rowCount) creados++
  }
  return { creados, duplicados }
}

async function procesarWallet(client, job, datos) {
  let creados = 0; let duplicados = 0
  const wallet = (await client.query('select empresa_id, proveedor_id from wallets where id = $1 and deleted_at is null', [job.wallet_id])).rows[0]
  if (!wallet) throw new Error('Wallet destino no encontrada.')
  for (const item of asArray(datos)) {
    const monto = Number(item.monto)
    if (!item.fecha || !Number.isFinite(monto) || monto <= 0 || !item.descripcion || !['ingreso', 'egreso'].includes(item.tipo)) continue
    const r = await client.query(`insert into movimientos_wallet (empresa_id, proveedor_id, wallet_id, fecha, descripcion, tipo, monto, tipo_moneda, external_id, source_file, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (wallet_id, external_id) where external_id is not null and deleted_at is null do nothing returning id`,
      [job.empresa_id, wallet.proveedor_id, job.wallet_id, item.fecha, String(item.descripcion).trim(), item.tipo, monto, item.moneda || 'USD', item.external_id || null, job.storage_path, job.created_by])
    if (r.rowCount) creados++; else duplicados++
  }
  return { creados, duplicados }
}

async function procesarBroker(client, job, datos) {
  let movimientos = 0; let activos = 0; let duplicados = 0
  const broker = (await client.query('select empresa_id from brokers where id = $1 and deleted_at is null', [job.broker_id])).rows[0]
  if (!broker) throw new Error('Broker destino no encontrado.')
  for (const item of asArray(datos?.movimientos)) {
    const monto = Number(item.monto)
    const tipo = ['deposito', 'venta', 'ingreso'].includes(item.tipo) ? 'ingreso' : 'egreso'
    if (!item.fecha || !Number.isFinite(monto) || monto < 0 || !item.descripcion) continue
    const r = await client.query(`insert into movimientos_broker (empresa_id, broker_id, fecha, descripcion, tipo, monto, external_id, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (broker_id, external_id) where external_id is not null and deleted_at is null do nothing returning id`,
      [job.empresa_id, job.broker_id, item.fecha, String(item.descripcion).trim(), tipo, monto, item.external_id || null, job.created_by])
    if (r.rowCount) movimientos++; else duplicados++
  }
  for (const item of asArray(datos?.activos)) {
    const cantidad = Number(item.cantidad); const valor = Number(item.valor_unitario)
    if (!item.nombre && !item.ticker || !Number.isFinite(cantidad) || cantidad < 0 || !Number.isFinite(valor) || valor < 0) continue
    const nombre = String(item.ticker || item.nombre).trim(); const tipo = item.tipo === 'etf' ? 'etf' : item.tipo === 'bono' ? 'bono' : item.tipo === 'fondo' ? 'fondo' : item.tipo === 'criptomoneda' ? 'criptomoneda' : 'accion'
    const r = await client.query(`insert into activos_broker (empresa_id, broker_id, nombre_activo, tipo_activo, cantidad, valor_unitario, moneda, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (broker_id, lower(nombre_activo)) where deleted_at is null do update set cantidad = excluded.cantidad, valor_unitario = excluded.valor_unitario, moneda = excluded.moneda, updated_at = now() returning id`,
      [job.empresa_id, job.broker_id, nombre, tipo, cantidad, valor, item.moneda || 'USD', job.created_by])
    if (r.rowCount) activos++
  }
  return { creados: movimientos, activos, duplicados }
}

async function procesarJob(job) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const claimed = await client.query(`update import_jobs set estado = 'procesando', started_at = now(), intentos = intentos + 1, updated_at = now() where id = $1 and estado = 'pendiente' returning *`, [job.id])
    if (!claimed.rowCount) { await client.query('rollback'); return }
    const current = claimed.rows[0]
    const pdfPath = fileForJob(current)
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF no encontrado: ${current.storage_path}`)
    const contexto = await contextoDestino(client, current)
    const datos = await extraerDatos(pdfPath, current, contexto)
    const result = current.target === 'cuenta' ? await procesarCuenta(client, current, datos) : current.target === 'wallet' ? await procesarWallet(client, current, datos) : await procesarBroker(client, current, datos)
    await client.query(`update import_jobs set estado = 'hecho', movimientos_creados = $2, activos_creados = $3, duplicados_omitidos = $4, finished_at = now(), updated_at = now() where id = $1`, [current.id, result.creados ?? 0, result.activos ?? 0, result.duplicados ?? 0])
    await client.query('commit'); log(`Job ${current.id} completado`)
  } catch (error) {
    await client.query('rollback').catch(() => {})
    await query(`update import_jobs set estado = 'error', error_mensaje = $2, finished_at = now(), updated_at = now() where id = $1`, [job.id, error.message])
    log(`Job ${job.id} falló: ${error.message}`, 'error')
  } finally { client.release() }
}
async function vuelta() {
  const recovered = await query("update import_jobs set estado = 'pendiente', updated_at = now() where estado = 'procesando' and started_at < now() - interval '30 minutes'")
  if (recovered.rowCount) log(`Recuperados ${recovered.rowCount} job(s) colgado(s)`, 'warn')
  const jobs = (await query("select * from import_jobs where estado = 'pendiente' order by created_at asc limit 5")).rows
  for (const job of jobs) await procesarJob(job)
}
async function main() { log(`Worker de importación local iniciado (intervalo ${POLL_INTERVAL}ms)`); await vuelta(); if (!UNA_VEZ) setInterval(() => vuelta().catch((e) => log(e.message, 'error')), POLL_INTERVAL) }
process.on('SIGTERM', async () => { await pool.end(); process.exit(0) }); process.on('SIGINT', async () => { await pool.end(); process.exit(0) })
main().catch(async (error) => { log(`Fallo fatal: ${error.message}`, 'error'); await pool.end(); process.exit(1) })
