import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import XLSX from 'xlsx'
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

const POLL_INTERVAL = Number(process.env.IMPORT_POLL_INTERVAL_MS || 5000)
const STORAGE_DIR = process.env.IMPORT_STORAGE_DIR || path.resolve('server/uploads')
const UNA_VEZ = process.env.IMPORT_UNA_VEZ === '1'
const IMPORT_MAX_TOKENS = Number(process.env.IMPORT_MAX_TOKENS || 12288)
// Una página por lote evita respuestas JSON enormes/truncadas en extractos densos.
const IMPORT_PDF_PAGES_PER_BATCH = Math.max(1, Number(process.env.IMPORT_PDF_PAGES_PER_BATCH || 1))
const IMPORT_ROWS_PER_BATCH = Math.max(25, Number(process.env.IMPORT_ROWS_PER_BATCH || 500))
const IMPORT_CONCURRENCY = Math.max(1, Number(process.env.IMPORT_CONCURRENCY || 3))
const PATEWAY_BASE_URL = (process.env.PATEWAY_BASE_URL || 'https://api.pateway.ai').replace(/\/$/, '')
const PATEWAY_MODEL = process.env.IMPORT_MODEL || 'claude-haiku-4-5-20251001'
const execFileAsync = promisify(execFile)
const pdfPasswordSecret = process.env.PDF_PASSWORD_SECRET
if (!pdfPasswordSecret || pdfPasswordSecret.length < 32) throw new Error('PDF_PASSWORD_SECRET debe tener al menos 32 caracteres.')

function descifrarClavePdf(valor) {
  if (!valor || !pdfPasswordSecret) return ''
  const [ivText, tagText, encryptedText] = String(valor).split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('La clave PDF guardada tiene un formato inválido.')
  const key = crypto.createHash('sha256').update(pdfPasswordSecret).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
}

function log(message, level = 'info') { console.log(`[${new Date().toISOString()}] ${level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'} ${message}`) }
function fileForJob(job) {
  const root = path.resolve(STORAGE_DIR)
  const stored = path.isAbsolute(job.storage_path) ? job.storage_path : path.join(root, job.storage_path)
  const candidate = path.resolve(stored)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error('Ruta de almacenamiento inválida.')
  return candidate
}
function asArray(value) { return Array.isArray(value) ? value : [] }
function parseMontoImportado(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const texto = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!texto) return NaN
  const ultimoPunto = texto.lastIndexOf('.')
  const ultimaComa = texto.lastIndexOf(',')
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    return Number(ultimoPunto < ultimaComa ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, ''))
  }
  if (ultimaComa >= 0) return Number(texto.replace(/\./g, '').replace(',', '.'))
  if ((texto.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(texto)) return Number(texto.replace(/\./g, ''))
  return Number(texto)
}
function extraerSaldosDaleDeTexto(lotes) {
  const resultado = { saldo_inicial: null, saldo_final: null }
  const monto = '[-$\\s]*([0-9][0-9.,]*)'
  const leerDespuesDe = (texto, etiqueta) => {
    const indice = texto.search(etiqueta)
    if (indice < 0) return NaN
    const despues = texto.slice(indice + texto.match(etiqueta)[0].length)
    return parseMontoImportado(despues.match(new RegExp(monto))?.[1])
  }
  for (const lote of lotes) {
    for (const linea of String(lote).split(/\\r?\\n/)) {
      const texto = linea.replace(/\\s+/g, ' ').trim()
      const etiquetaInicial = /\\bsaldo\\s+(?:inicial|de\\s+apertura|apertura)\\b/i
      const etiquetaFinal = /\\bsaldo\\s+(?:final|de\\s+cierre|cierre|al\\s+corte)\\b/i
      const inicial = leerDespuesDe(texto, etiquetaInicial)
      const final = leerDespuesDe(texto, etiquetaFinal)
      if (Number.isFinite(inicial)) resultado.saldo_inicial = inicial
      if (Number.isFinite(final)) resultado.saldo_final = final
    }
  }
  return resultado
}

async function lotesDelArchivo(filePath, pdfPassword = '') {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.pdf') {
    try {
      const total = Number((await execFileAsync(process.env.PDFINFO_BIN || 'pdfinfo', [...(pdfPassword ? ['-upw', pdfPassword] : []), filePath], { maxBuffer: 1024 * 1024 })).stdout.match(/Pages:\s+(\d+)/i)?.[1] || 1)
      const lotes = []
      for (let inicio = 1; inicio <= total; inicio += IMPORT_PDF_PAGES_PER_BATCH) {
        const fin = Math.min(total, inicio + IMPORT_PDF_PAGES_PER_BATCH - 1)
        const { stdout: texto } = await execFileAsync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', ...(pdfPassword ? ['-upw', pdfPassword] : []), '-f', String(inicio), '-l', String(fin), filePath, '-'], { maxBuffer: 16 * 1024 * 1024 })
        if (texto.trim()) lotes.push(`PÁGINAS ${inicio}-${fin}\n${texto.trim()}`)
      }
      if (!lotes.length) throw new Error('El PDF no contiene texto extraíble.')
      return lotes
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Falta pdftotext/pdfinfo en la imagen del worker.')
      if (/password|encrypted|incorrect password|not authorized/i.test(`${error.message} ${error.stderr || ''}`)) throw new Error('La clave del PDF no es correcta. Actualízala en la configuración de la cuenta.')
      throw new Error(`No se pudo extraer texto del PDF: ${error.message}`)
    }
  }
  let texto
  if (extension === '.csv') texto = fs.readFileSync(filePath, 'utf8')
  else if (extension === '.xls' || extension === '.xlsx') {
    const workbook = XLSX.readFile(filePath, { cellDates: true })
    texto = workbook.SheetNames.map((name) => `HOJA: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n')
  } else throw new Error('Formato de archivo no soportado.')
  const lineas = texto.split(/\r?\n/).filter((linea) => linea.trim())
  const lotes = []
  for (let i = 0; i < lineas.length; i += IMPORT_ROWS_PER_BATCH) lotes.push(lineas.slice(i, i + IMPORT_ROWS_PER_BATCH).join('\n'))
  return lotes
}

async function extraerLote(texto, prompt, esBroker, esDale, indice, total) {
  const apiKey = process.env.PATEWAY_API_KEY
  if (!apiKey) throw new Error('Falta PATEWAY_API_KEY para extraer movimientos.')
  const timeoutMs = Number(process.env.IMPORT_REQUEST_TIMEOUT_MS || 180000)
  for (let intento = 1; intento <= 2; intento += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(process.env.PATEWAY_MESSAGES_URL || `${PATEWAY_BASE_URL}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: PATEWAY_MODEL,
          max_tokens: IMPORT_MAX_TOKENS,
          system: 'Eres un extractor preciso. Devuelve únicamente JSON válido, sin markdown ni explicaciones. Si no hay movimientos, devuelve []. Nunca cortes el JSON.',
          messages: [{ role: 'user', content: `${prompt}\n\nLOTE ${indice}/${total} DEL EXTRACTO:\n${texto}\n\nExtrae únicamente las filas reales de este lote. Retorna solo JSON válido y compacto.` }],
        }),
      })
      if (!response.ok) throw new Error(`Falló extracción Pateway (${response.status}): ${await response.text()}`)
      const payload = await response.json()
      const text = payload.content?.filter((part) => part.type === 'text').map((part) => part.text).join('') || ''
      if (!text) throw new Error(`Pateway devolvió contenido vacío (stop_reason: ${payload.stop_reason || 'desconocido'})`)
      try {
        const datos = validarRespuestaExtraccion(text)
        return esBroker
          ? { movimientos: asArray(datos.movimientos), activos: asArray(datos.activos) }
          : esDale
            ? { saldo_inicial: datos?.saldo_inicial ?? null, saldo_final: datos?.saldo_final ?? null, movimientos: asArray(datos?.movimientos) }
            : asArray(datos)
      } catch (error) {
        if (intento === 2) throw error
        log(`JSON truncado en lote ${indice}/${total}; reintentando con una salida más compacta.`, 'warn')
      }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`Pateway superó el tiempo límite del lote ${indice}/${total}.`)
      if (intento === 2) throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(`No se pudo extraer el lote ${indice}/${total}.`)
}

async function extraerDatos(filePath, job, contexto) {
  const nombreBanco = contexto.banco || contexto.nombre_banco || ''
  const esDale = job.target === 'cuenta' && /\bdale\b/i.test(nombreBanco)
  const prompt = job.target === 'cuenta'
    ? generarPromptMovimientosCuenta({ ...contexto, banco: nombreBanco, proveedor: job.proveedor })
    : job.target === 'broker'
      ? generarPromptMovimientosBroker(contexto)
      : generarPromptMovimientosWallet({ ...contexto, proveedor: job.proveedor })
  const lotes = await lotesDelArchivo(filePath, job.target === 'cuenta' ? descifrarClavePdf(contexto.pdf_password_encrypted) : '')
  const saldosDaleTexto = esDale ? extraerSaldosDaleDeTexto(lotes) : { saldo_inicial: null, saldo_final: null }
  const acumulado = job.target === 'broker' ? { movimientos: [], activos: [] } : esDale ? { ...saldosDaleTexto, movimientos: [] } : []
  for (let inicio = 0; inicio < lotes.length; inicio += IMPORT_CONCURRENCY) {
    const indices = Array.from({ length: Math.min(IMPORT_CONCURRENCY, lotes.length - inicio) }, (_, offset) => inicio + offset)
    indices.forEach((indice) => log(`Procesando lote ${indice + 1}/${lotes.length} del job ${job.id}`))
    const resultados = await Promise.all(indices.map((indice) => extraerLote(lotes[indice], prompt, job.target === 'broker', esDale, indice + 1, lotes.length)))
    resultados.forEach((datos, resultadoIndex) => {
      if (job.target !== 'broker') {
        const offsetOrden = indices[resultadoIndex] * 1000000
        const filas = esDale ? datos.movimientos : datos
        filas.forEach((item, itemIndex) => { item.orden = Number.isInteger(Number(item.orden)) ? offsetOrden + Number(item.orden) : offsetOrden + itemIndex })
      }
      if (job.target === 'broker') {
        acumulado.movimientos.push(...datos.movimientos)
        acumulado.activos.push(...datos.activos)
      } else if (esDale) {
        const saldoInicialLote = parseMontoImportado(datos.saldo_inicial)
        const saldoFinalLote = parseMontoImportado(datos.saldo_final)
        if (saldosDaleTexto.saldo_inicial === null && Number.isFinite(saldoInicialLote)) acumulado.saldo_inicial = saldoInicialLote
        if (saldosDaleTexto.saldo_final === null && Number.isFinite(saldoFinalLote)) acumulado.saldo_final = saldoFinalLote
        acumulado.movimientos.push(...datos.movimientos)
      } else acumulado.push(...datos)
    })
  }
  if (job.target !== 'broker') {
    const filas = esDale ? acumulado.movimientos : acumulado
    filas.sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
  }
  const items = job.target === 'broker' ? [...acumulado.movimientos, ...acumulado.activos] : esDale ? acumulado.movimientos : acumulado
  for (const item of items) if (!item.external_id && item.fecha) item.external_id = await derivarExternalId(item)
  return acumulado
}

async function contextoDestino(client, job) {
  const table = job.target === 'cuenta' ? 'cuentas' : job.target === 'wallet' ? 'wallets' : 'brokers'
  const id = job[`${job.target}_id`]
  const result = table === 'cuentas'
    ? await client.query(`select c.*, b.nombre_banco as banco from cuentas c join bancos b on b.id = c.banco_id and b.deleted_at is null where c.id = $1 and c.empresa_id = $2 and c.deleted_at is null`, [id, job.empresa_id])
    : await client.query(`select * from ${table} where id = $1 and empresa_id = $2 and deleted_at is null`, [id, job.empresa_id])
  if (!result.rowCount) throw new Error('Destino de importación no encontrado.')
  return result.rows[0]
}

async function procesarCuenta(client, job, datos) {
  let creados = 0; let duplicados = 0
  const movimientos = Array.isArray(datos) ? datos : datos?.movimientos
  const saldoInicial = Number(datos?.saldo_inicial)
  const saldoFinal = Number(datos?.saldo_final)
  for (const item of asArray(movimientos)) {
    const fecha = String(item.fecha || '').slice(0, 10); const monto = Number(item.monto)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(monto) || monto < 0 || !item.descripcion || !['ingreso', 'egreso'].includes(item.tipo)) continue
    const orden = Number.isInteger(Number(item.orden)) ? Number(item.orden) : creados
    const r = await client.query(`insert into movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto, orden, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [job.empresa_id, job.cuenta_id, fecha, String(item.descripcion).trim(), item.tipo, monto, orden, job.created_by])
    if (r.rowCount) creados++
  }
  await client.query(`update cuentas set
    saldo_inicial = case when $2::numeric is not null and $2::numeric >= 0 then $2::numeric else saldo_inicial end,
    saldo_final = case when $3::numeric is not null and $3::numeric >= 0 then $3::numeric else saldo_final end,
    monto = case when $3::numeric is not null and $3::numeric >= 0 then $3::numeric else coalesce((
    select coalesce((select monto from movimientos where cuenta_id = $1 and deleted_at is null and descripcion ~* 'saldo[[:space:]]+anterior' order by fecha desc, orden desc, created_at desc limit 1), 0)
      + coalesce((select sum(case when tipo = 'ingreso' then monto else -monto end) from movimientos m where m.cuenta_id = $1 and m.deleted_at is null and m.descripcion !~* 'saldo[[:space:]]+anterior' and m.fecha >= coalesce((select fecha from movimientos where cuenta_id = $1 and deleted_at is null and descripcion ~* 'saldo[[:space:]]+anterior' order by fecha desc, orden desc, created_at desc limit 1), '0001-01-01'::date)), 0)
  ), 0) end where id = $1`, [job.cuenta_id, Number.isFinite(saldoInicial) && saldoInicial >= 0 ? saldoInicial : null, Number.isFinite(saldoFinal) && saldoFinal >= 0 ? saldoFinal : null])
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
  const claimed = await query(`update import_jobs set estado = 'procesando', started_at = now(), intentos = intentos + 1, updated_at = now() where id = $1 and estado = 'pendiente' returning *`, [job.id])
  if (!claimed.rowCount) return
  const current = claimed.rows[0]
  let client
  try {
    const filePath = fileForJob(current)
    if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${current.storage_path}`)
    client = await pool.connect()
    const contexto = await contextoDestino(client, current)
    client.release(); client = null
    const datos = await extraerDatos(filePath, current, contexto)
    client = await pool.connect()
    await client.query('begin')
    const result = current.target === 'cuenta' ? await procesarCuenta(client, current, datos) : current.target === 'wallet' ? await procesarWallet(client, current, datos) : await procesarBroker(client, current, datos)
    await client.query(`update import_jobs set estado = 'hecho', movimientos_creados = $2, activos_creados = $3, duplicados_omitidos = $4, finished_at = now(), updated_at = now() where id = $1`, [current.id, result.creados ?? 0, result.activos ?? 0, result.duplicados ?? 0])
    await client.query('commit'); log(`Job ${current.id} completado`)
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {})
    await query(`update import_jobs set estado = 'error', error_mensaje = $2, finished_at = now(), updated_at = now() where id = $1`, [job.id, error.message])
    log(`Job ${job.id} falló: ${error.message}`, 'error')
  } finally { if (client) client.release() }
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
