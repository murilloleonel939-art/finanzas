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
function normalizarTipoDale(item) {
  const etiqueta = String(item?.descripcion || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(abono|credito|ingreso)\b/.test(etiqueta)) return 'ingreso'
  if (/\b(debito|retiro|pago|salida)\b/.test(etiqueta)) return 'egreso'
  return item?.tipo
}
function normalizarTextoClave(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function esCoindepo(job) {
  return normalizarTextoClave(job?.proveedor) === 'coindepo'
}
function esPaypal(job) {
  return normalizarTextoClave(job?.proveedor) === 'paypal'
}
function esDolarapp(job) {
  return normalizarTextoClave(job?.proveedor) === 'dolarapp'
}
const trmCache = new Map()
async function obtenerTrmOficial(fecha) {
  const clave = String(fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return NaN
  if (trmCache.has(clave)) return trmCache.get(clave)
  try {
    const url = `https://www.datos.gov.co/resource/32sa-8pi3.json?$where=vigenciadesde%20%3C%3D%20%27${clave}T00%3A00%3A00.000%27%20and%20vigenciahasta%20%3E%3D%20%27${clave}T00%3A00%3A00.000%27&$limit=1`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`TRM HTTP ${response.status}`)
    const rows = await response.json()
    const valor = parseMontoImportado(rows?.[0]?.valor)
    trmCache.set(clave, valor)
    return valor
  } catch (err) {
    log(`No se pudo consultar la TRM oficial para ${clave}: ${err.message}`, 'warn')
    return NaN
  }
}
function normalizarMovimientoDolarapp(item) {
  const descripcionOriginal = String(item?.descripcion || '').trim()
  const tipoOperacion = String(item?.tipo_original || item?.tipo_movimiento || item?.tipo_operacion || item?.operacion || item?.tipo || '').trim()
  const etiqueta = normalizarTextoClave(`${tipoOperacion} ${descripcionOriginal}`)
  const monedaEquivalente = String(item?.moneda_equivalente || item?.monedaLocalEquivalente || item?.moneda_local_equivalente || '').trim().toUpperCase()
  const esOperacionUsdCCop = (etiqueta.includes('compra usdc') || etiqueta.includes('venta usdc')) && monedaEquivalente === 'COP'
  const descripcion = esOperacionUsdCCop
    ? [descripcionOriginal, tipoOperacion].filter(Boolean).filter((valor, indice, valores) => valores.findIndex((otro) => normalizarTextoClave(otro) === normalizarTextoClave(valor)) === indice).join(' - ')
    : descripcionOriginal || tipoOperacion
  if (esOperacionUsdCCop || etiqueta.includes('compra usdc')) return { tipo: 'ingreso', descripcion }
  return { tipo: item?.tipo, descripcion }
}
function normalizarMovimientoPaypal(item) {
  const descripcion = String(item?.descripcion || '').trim()
  const etiqueta = normalizarTextoClave(descripcion)
  const moneda = String(item?.moneda || '').trim().toUpperCase()
  if (etiqueta.startsWith('mass pay payment')) return { tipo: 'ingreso', descripcion }
  if (etiqueta.startsWith('website payment')) return { tipo: 'egreso', descripcion }
  if (etiqueta.startsWith('general currency conversion')) {
    return { tipo: moneda === 'COP' ? 'ingreso' : 'egreso', descripcion }
  }
  if (etiqueta.startsWith('user initiated withdrawal') && moneda === 'COP') {
    return { tipo: 'egreso', descripcion }
  }
  return null
}
// Reglas EXCLUSIVAS de Coindepo. El signo decide la dirección en los eventos de
// préstamo: «Loan Withdrawal» positivo entra a la cuenta; «Loan Repayment»
// negativo sale de ella. El monto que se guarda siempre es positivo (CHECK
// monto > 0), la dirección va en `tipo`.
//
// Un préstamo NO es un interés generado, y por eso la descripción conserva el
// nombre literal de la fila («Loan Withdrawal», «Loan Repayment»): es lo que
// `esInteres()` mira para dejar estas líneas fuera de «Intereses ganados».
function normalizarMovimientoCoindepo(item, montoBruto) {
  const etiqueta = normalizarTextoClave(`${item?.tipo || ''} ${item?.descripcion || ''}`)
  const positivo = !Number.isFinite(montoBruto) || montoBruto > 0
  const tipoExtraido = normalizarTextoClave(item?.tipo || '')
  const indicaEgreso = ['egreso', 'retiro', 'salida', 'debit', 'debito', 'withdrawal'].some((t) => tipoExtraido.includes(t))
  const indicaIngreso = ['ingreso', 'deposito', 'abono', 'credit'].some((t) => tipoExtraido.includes(t))
  if (etiqueta.includes('loan withdrawal')) {
    const tipo = montoBruto < 0 || indicaEgreso ? 'egreso' : 'ingreso'
    return { tipo, descripcion: prefijarDescripcion(item.descripcion, 'Loan Withdrawal') }
  }
  if (etiqueta.includes('loan repayment')) {
    // El modelo puede devolver monto absoluto pese al PDF negativo. En tal caso,
    // respeta el tipo extraído como segunda señal; el valor firmado es fuente primaria.
    const tipo = montoBruto < 0 || (montoBruto >= 0 && indicaEgreso && !indicaIngreso) ? 'egreso' : 'ingreso'
    return { tipo, descripcion: prefijarDescripcion(item.descripcion, 'Loan Repayment') }
  }
  if (etiqueta.includes('interest payment')) return { tipo: 'ingreso', descripcion: prefijarDescripcion(item.descripcion, 'Interest Payment') }
  if (etiqueta.includes('withdrawal')) return { tipo: 'egreso', descripcion: prefijarDescripcion(item.descripcion, 'Withdrawal') }
  if (etiqueta.includes('deposit')) return { tipo: 'ingreso', descripcion: prefijarDescripcion(item.descripcion, 'Deposit') }
  return { tipo: item?.tipo, descripcion: item?.descripcion }
}
function prefijarDescripcion(descripcion, prefijo) {
  const texto = String(descripcion || '').trim()
  return texto.toLowerCase().startsWith(prefijo.toLowerCase()) ? texto : `${prefijo}${texto ? ` - ${texto}` : ''}`
}
function extraerSaldosDaleDeTexto(lotes) {
  const resultado = { saldo_inicial: null, saldo_final: null }
  const monto = '[-$\\s]*([0-9][0-9.,]*)'
  const etiquetaInicial = /\\bsaldo\\s+(?:inicial|de\\s+apertura|apertura)\\b/i
  const etiquetaFinal = /\\bsaldo\\s+(?:final|de\\s+cierre|cierre|al\\s+corte)\\b/i
  const leerDespuesDe = (texto, etiqueta) => {
    const indice = texto.search(etiqueta)
    if (indice < 0) return NaN
    const despues = texto.slice(indice + texto.match(etiqueta)[0].length)
    return parseMontoImportado(despues.match(new RegExp(monto))?.[1])
  }
  const textoCompleto = lotes.join('\\n').replace(/\\s+/g, ' ').trim()
  const inicialCompleto = leerDespuesDe(textoCompleto, etiquetaInicial)
  const finalCompleto = leerDespuesDe(textoCompleto, etiquetaFinal)
  if (Number.isFinite(inicialCompleto)) resultado.saldo_inicial = inicialCompleto
  if (Number.isFinite(finalCompleto)) resultado.saldo_final = finalCompleto
  return resultado
}

function normalizarEncabezadoQuotex(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function numeroQuotex(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN
  const texto = String(valor ?? '').replace('%', '').trim()
  return parseMontoImportado(texto)
}

function fechaQuotex(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10)
  const texto = String(valor ?? '').trim()
  const iso = texto.match(/(\d{4}-\d{2}-\d{2})/)
  return iso?.[1] || ''
}

function extraerOperacionesQuotex(filePath, moneda) {
  const extension = path.extname(filePath).toLowerCase()
  if (!['.csv', '.xls', '.xlsx'].includes(extension)) return null
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const filas = workbook.SheetNames.flatMap((nombre) => XLSX.utils.sheet_to_json(workbook.Sheets[nombre], { defval: null }))
  if (!filas.length) return { movimientos: [], activos: [] }
  const primera = new Set(Object.keys(filas[0]).map(normalizarEncabezadoQuotex))
  const encabezadosQuotex = ['informacion', 'beneficio', 'id', 'tiempo de apertura', 'cantidad', 'ingreso']
  if (!encabezadosQuotex.every((encabezado) => primera.has(encabezado))) return null

  const movimientos = []
  for (const fila of filas) {
    const campos = new Map(Object.entries(fila).map(([clave, valor]) => [normalizarEncabezadoQuotex(clave), valor]))
    const fecha = fechaQuotex(campos.get('tiempo de apertura'))
    const cantidad = numeroQuotex(campos.get('cantidad'))
    const ingreso = numeroQuotex(campos.get('ingreso'))
    const descripcionBase = String(campos.get('informacion') ?? '').trim()
    const externalId = String(campos.get('id') ?? '').trim() || null
    if (!fecha || !descripcionBase || !Number.isFinite(cantidad) || cantidad < 0 || !Number.isFinite(ingreso)) continue

    // En Quotex «Ingreso» incluye la devolución de la inversión cuando se gana.
    // Por eso el resultado de la operación es Ingreso - Cantidad.
    const resultado = ingreso - cantidad
    if (resultado === 0) continue
    const categoria = resultado > 0 ? 'ganancia' : 'perdida'
    const beneficio = String(campos.get('beneficio') ?? '').trim()
    const tipo = String(campos.get('tipo') ?? '').trim()
    const descripcion = `${descripcionBase}${tipo ? ` • ${tipo}` : ''}${beneficio ? ` • beneficio ${beneficio}` : ''}`
    movimientos.push({
      fecha,
      tipo: categoria,
      monto: Math.abs(resultado),
      cantidad,
      descripcion,
      external_id: externalId,
      moneda,
    })
  }
  return { movimientos, activos: [] }
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
        const datos = validarRespuestaExtraccion(text, { omitirFilasIncompletas: esBroker })
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
  const nombreBroker = String(contexto.nombre_broker || '').trim().toLowerCase()
  if (job.target === 'broker' && nombreBroker === 'quotex') {
    const datosQuotex = extraerOperacionesQuotex(filePath, contexto.moneda || 'USD')
    if (datosQuotex) return datosQuotex
  }
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
  // Solo Dale devuelve el objeto estructurado con saldos. Sus extractos usan
  // formatos COP como 1.234.567,89, que Number() interpreta incorrectamente.
  const esDale = !Array.isArray(datos) && Array.isArray(datos?.movimientos)
  const movimientos = Array.isArray(datos) ? datos : datos?.movimientos
  const saldoInicial = esDale ? parseMontoImportado(datos?.saldo_inicial) : Number(datos?.saldo_inicial)
  const saldoFinal = esDale ? parseMontoImportado(datos?.saldo_final) : Number(datos?.saldo_final)
  for (const item of asArray(movimientos)) {
    const fecha = String(item.fecha || '').slice(0, 10); const monto = esDale ? parseMontoImportado(item.monto) : Number(item.monto)
    const tipo = esDale ? normalizarTipoDale(item) : item.tipo
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(monto) || monto < 0 || !item.descripcion || !['ingreso', 'egreso'].includes(tipo)) continue
    const orden = Number.isInteger(Number(item.orden)) ? Number(item.orden) : creados
    const r = await client.query(`insert into movimientos (empresa_id, cuenta_id, fecha, descripcion, tipo, monto, orden, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [job.empresa_id, job.cuenta_id, fecha, String(item.descripcion).trim(), tipo, monto, orden, job.created_by])
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
    const montoBruto = Number(item.monto)
    const monto = Math.abs(montoBruto)
    const regla = esCoindepo(job)
      ? normalizarMovimientoCoindepo(item, montoBruto)
      : esPaypal(job)
        ? normalizarMovimientoPaypal(item)
        : esDolarapp(job)
          ? normalizarMovimientoDolarapp(item)
          : { tipo: item.tipo, descripcion: item.descripcion }
    const grossImportado = esPaypal(job) ? parseMontoImportado(item.gross) : NaN
    const montoPrincipal = esPaypal(job) && Number.isFinite(grossImportado) ? Math.abs(grossImportado) : monto
    if (!item.fecha || !Number.isFinite(montoPrincipal) || montoPrincipal <= 0 || !regla?.descripcion || !['ingreso', 'egreso'].includes(regla.tipo)) continue
    const dolarapp = esDolarapp(job)
    const moneda = dolarapp ? 'USDC' : String(item.moneda || 'USD').trim().toUpperCase()
    const descripcionClave = normalizarTextoClave(`${item.tipo_original || ''} ${item.tipo_movimiento || ''} ${item.tipo_operacion || ''} ${item.operacion || ''} ${item.tipo || ''} ${item.descripcion || ''} ${regla.descripcion || ''}`)
    const monedaEquivalenteTexto = `${item.moneda_equivalente || item.monedaLocalEquivalente || item.moneda_local_equivalente || ''} ${item.descripcion || ''} ${regla.descripcion || ''}`
    const monedaEquivalente = normalizarTextoClave(monedaEquivalenteTexto)
    const esVentaUsdCCop = dolarapp && descripcionClave.includes('venta usdc') && monedaEquivalente.includes('cop')
    const esOperacionUsdCCop = dolarapp && (descripcionClave.includes('compra usdc') || esVentaUsdCCop) && monedaEquivalente.includes('cop')
    const montoDesdeDescripcion = String(item.descripcion || '').match(/[+-]\s*[\d.,]+\s+cop\s+[+-]\s*([$\d.,]+)/i)?.[1]
    const montoEquivalente = esOperacionUsdCCop
      ? [item.monto_equivalente, item.monto_local_equivalente, item.montoLocalEquivalente, item.equivalente, item.valor_equivalente, montoDesdeDescripcion]
        .map(parseMontoImportado)
        .find(Number.isFinite)
      : NaN
    let trm = esOperacionUsdCCop
      ? [item.trm, item.valor_trm, item.trm_dia, item.trm_del_dia]
        .map(parseMontoImportado)
        .find(Number.isFinite)
      : NaN
    if (esOperacionUsdCCop && !Number.isFinite(trm)) trm = await obtenerTrmOficial(item.fecha)
    const valorTrm = esOperacionUsdCCop && Number.isFinite(trm) ? montoPrincipal * trm : NaN
    const diferenciaCambio = esOperacionUsdCCop && Number.isFinite(montoEquivalente) && Number.isFinite(valorTrm)
      ? esVentaUsdCCop ? montoEquivalente - valorTrm : valorTrm - montoEquivalente
      : NaN
    const r = await client.query(`insert into movimientos_wallet (empresa_id, proveedor_id, wallet_id, fecha, descripcion, tipo, monto, tipo_moneda, trm, monto_equivalente, valor_trm, diferencia_cambio, external_id, source_file, import_job_id, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (wallet_id, external_id) where external_id is not null and deleted_at is null do nothing returning id`,
      [job.empresa_id, wallet.proveedor_id, job.wallet_id, item.fecha, String(regla.descripcion).trim(), esOperacionUsdCCop ? 'ingreso' : regla.tipo, montoPrincipal, moneda,
        Number.isFinite(trm) ? trm : null, Number.isFinite(montoEquivalente) ? montoEquivalente : null,
        Number.isFinite(valorTrm) ? valorTrm : null, Number.isFinite(diferenciaCambio) ? diferenciaCambio : null,
        item.external_id || null, job.storage_path, job.id, job.created_by])
    if (r.rowCount) creados++; else duplicados++
    const esRetiroPaypalCop = esPaypal(job)
      && regla.tipo === 'egreso'
      && normalizarTextoClave(item?.descripcion).startsWith('user initiated withdrawal')
      && String(item?.moneda || '').trim().toUpperCase() === 'COP'
    const feeDirecto = parseMontoImportado(item.fee)
    const grossNumero = parseMontoImportado(item.gross)
    const netNumero = parseMontoImportado(item.net)
    const feeCalculado = Number.isFinite(grossNumero) && Number.isFinite(netNumero)
      ? Math.abs(grossNumero - netNumero)
      : 0
    const fee = esRetiroPaypalCop ? Math.abs(Number.isFinite(feeDirecto) ? feeDirecto : feeCalculado) : 0
    if (fee > 0) {
      const feeId = item.external_id ? `${item.external_id}-fee` : null
      const feeResult = await client.query(`insert into movimientos_wallet (empresa_id, proveedor_id, wallet_id, fecha, descripcion, tipo, monto, tipo_moneda, external_id, source_file, import_job_id, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (wallet_id, external_id) where external_id is not null and deleted_at is null do nothing returning id`,
        [job.empresa_id, wallet.proveedor_id, job.wallet_id, item.fecha, `Fee - ${String(regla.descripcion).trim()}`, 'egreso', fee, moneda, feeId, job.storage_path, job.id, job.created_by])
      if (feeResult.rowCount) creados++; else duplicados++
    }
  }
  return { creados, duplicados }
}

async function recalcularSaldoWalletImportada(client, walletId) {
  const result = await client.query(`select tipo_moneda, sum(case when tipo = 'ingreso' then monto else -monto end) as monto
    from movimientos_wallet where wallet_id = $1 and deleted_at is null group by tipo_moneda`, [walletId])
  await client.query('delete from wallet_saldos where wallet_id = $1', [walletId])
  for (const row of result.rows) {
    const monto = Number(row.monto)
    // wallet_saldos no admite saldos negativos. Se conserva el historial completo
    // de movimientos y se registra cero hasta que exista un ingreso que cubra el egreso.
    await client.query('insert into wallet_saldos (wallet_id, moneda, monto) values ($1, $2, $3)', [walletId, String(row.tipo_moneda).trim().toUpperCase(), Number.isFinite(monto) ? Math.max(0, monto) : 0])
  }
}

async function procesarBroker(client, job, datos) {
  const broker = (await client.query('select nombre_broker from brokers where id = $1 and empresa_id = $2 and deleted_at is null', [job.broker_id, job.empresa_id])).rows[0]
  const nombreBroker = broker?.nombre_broker?.trim().toLowerCase()
  if (!broker || !['interactive brokers', 'quotex'].includes(nombreBroker)) {
    throw new Error('La importación de extractos está disponible únicamente para Interactive Brokers y Quotex.')
  }
  let movimientos = 0; let activos = 0; let duplicados = 0
  if (!broker) throw new Error('Broker destino no encontrado.')
  for (const item of asArray(datos?.movimientos)) {
    const monto = Number(item.monto)
    const esQuotex = nombreBroker === 'quotex'
    const tiposQuotex = ['ganancia', 'perdida', 'deposito', 'retiro']
    const tipo = esQuotex
      ? (['ganancia', 'deposito'].includes(item.tipo) ? 'ingreso' : 'egreso')
      : (['deposito', 'venta', 'ingreso'].includes(item.tipo) ? 'ingreso' : 'egreso')
    if (!item.fecha || !Number.isFinite(monto) || monto < 0 || !item.descripcion) continue
    if (esQuotex && !tiposQuotex.includes(item.tipo)) continue
    const descripcion = esQuotex
      ? `[${item.tipo}] ${String(item.descripcion).trim()}`
      : String(item.descripcion).trim()
    // Para compras y ventas, guardar cantidad y valor_unitario si los trae el LLM
    const esOperacion = esQuotex || ['compra', 'venta'].includes(item.tipo)
    const cantidad = esOperacion && item.cantidad != null ? Number(item.cantidad) : null
    // La tabla exige cantidad y valor_unitario juntos. Quotex no usa valor
    // unitario, pero guardamos 0 internamente para conservar la inversión.
    const valorUnitario = esQuotex
      ? (cantidad != null ? 0 : null)
      : (esOperacion && item.valor_unitario != null ? Number(item.valor_unitario) : null)
    const cantidadOk = cantidad === null || (Number.isFinite(cantidad) && cantidad >= 0)
    const valorOk = valorUnitario === null || (Number.isFinite(valorUnitario) && valorUnitario >= 0)
    const cantidadFinal = cantidadOk ? cantidad : null
    const valorFinal = valorOk ? valorUnitario : null
    // Ambos deben estar presentes o ambos null (restricción de la tabla)
    const usarDetalle = cantidadFinal !== null && valorFinal !== null
    const r = await client.query(`insert into movimientos_broker (empresa_id, broker_id, fecha, descripcion, tipo, monto, cantidad, valor_unitario, external_id, import_job_id, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (broker_id, external_id) where external_id is not null and deleted_at is null do nothing returning id`,
      [job.empresa_id, job.broker_id, item.fecha, descripcion, tipo, monto, usarDetalle ? cantidadFinal : null, usarDetalle ? valorFinal : null, item.external_id || null, job.id, job.created_by])
    if (r.rowCount) movimientos++; else duplicados++
  }
  if (nombreBroker === 'quotex') return { creados: movimientos, activos: 0, duplicados }
  for (const item of asArray(datos?.activos)) {
    const cantidad = Number(item.cantidad); const valor = Number(item.valor_unitario)
    const valorCompra = item.valor_compra_unitario == null ? valor : Number(item.valor_compra_unitario)
    if (!item.nombre && !item.ticker || !Number.isFinite(cantidad) || cantidad < 0 || !Number.isFinite(valor) || valor < 0 || !Number.isFinite(valorCompra) || valorCompra < 0) continue
    const nombre = String(item.ticker || item.nombre).trim(); const tipo = item.tipo === 'etf' ? 'etf' : item.tipo === 'bono' ? 'bono' : item.tipo === 'fondo' ? 'fondo' : item.tipo === 'criptomoneda' ? 'criptomoneda' : 'accion'
    // En conflicto no se reasigna `import_job_id`: una posición que ya existía
    // antes del job no debe desaparecer al revertir esa importación.
    const r = await client.query(`insert into activos_broker (empresa_id, broker_id, nombre_activo, tipo_activo, cantidad, valor_unitario, valor_compra_unitario, moneda, import_job_id, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (broker_id, lower(nombre_activo)) where deleted_at is null do update set cantidad = excluded.cantidad, valor_unitario = excluded.valor_unitario, moneda = excluded.moneda, updated_at = now() returning id`,
      [job.empresa_id, job.broker_id, nombre, tipo, cantidad, valor, valorCompra, item.moneda || 'USD', job.id, job.created_by])
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
    if (current.target === 'wallet') await recalcularSaldoWalletImportada(client, current.wallet_id)
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
