/**
 * Clasificación y métricas de productos Earn (FASE 13, PRD §7).
 *
 * El PRD define dos mecanismos para saber si un movimiento es Earn:
 *
 *   1. **Por palabras clave** en la descripción: `earn|subscription|interest|
 *      staking|savings|redemption|redeem`.
 *   2. **Por proveedor «todo es Earn»**: `EARN_ALL_MOVEMENTS_PROVIDERS`. Hoy
 *      solo Coindepo: sus extractos son íntegramente de productos Earn, así que
 *      no hay que buscar palabras clave en cada fila.
 *
 * Se aplican **en ese orden**: si el proveedor está en la lista, todos sus
 * movimientos son Earn aunque la descripción no diga nada (el caso real: un
 * extracto de Coindepo con la columna de descripción abreviada).
 *
 * Nada de esto vive en la base: se deriva en el cliente a partir de
 * `descripcion`, que es texto libre. Consecuencia aceptada: si una descripción
 * mal escrita no menciona la palabra clave, el movimiento queda fuera de Earn.
 * Por eso también se exporta `categoriaEarn()` — permite mostrar por qué una
 * fila se clasificó como se clasificó, en vez de que el número no cuadre.
 */
import { claveProveedor } from '@/lib/walletProviders'

/**
 * Proveedores cuyos movimientos son Earn por definición (mecanismo 2).
 * Se comparan con `claveProveedor()` para que "Coindepo", "coindepo" y
 * "COINDEPO" entren igual.
 */
export const EARN_ALL_MOVEMENTS_PROVIDERS = ['coindepo']

/** ¿Este proveedor tiene todos sus movimientos como Earn? */
export function esProveedorEarn(nombreProveedor) {
  const clave = claveProveedor(nombreProveedor)
  return EARN_ALL_MOVEMENTS_PROVIDERS.some((p) => claveProveedor(p) === clave)
}

/**
 * Palabras clave del mecanismo 1 (PRD §7).
 *
 * Se añaden las variantes en español de cada una porque la extracción de PDFs
 * (FASE 17) devuelve la descripción tal como está en el documento, y varios
 * proveedores de la región emiten extractos en español. Sin ellas, un extracto
 * que diga "Suscripción a producto Earn" se leería como un egreso normal y
 * «Total invertido» daría cero. Las variantes del PRD se mantienen literales.
 */
export const PALABRAS_EARN = [
  'earn',
  'subscription',
  'suscripcion',
  'interest',
  'interes',
  'staking',
  'savings',
  'ahorro',
  'redemption',
  'redeem',
  'redencion',
]

/**
 * Normaliza una descripción para buscar palabras clave: sin acentos, en
 * minúsculas y con los separadores raros de los extractos convertidos en
 * espacios. "Interest-Earn/Subscription" no debe fallar por los guiones.
 */
function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function contiene(textoNormalizado, palabra) {
  if (!textoNormalizado) return false
  // Límites por espacio: "earnings" NO coincide con "earn", pero "earn
  // subscription" sí. Un `includes()` a secas daría falsos positivos.
  return ` ${textoNormalizado} `.includes(` ${palabra} `)
}

/** ¿La descripción menciona alguna palabra clave Earn? (mecanismo 1) */
export function contienePalabraEarn(descripcion) {
  const norm = normalizarTexto(descripcion)
  return PALABRAS_EARN.some((p) => contiene(norm, p))
}

/** ¿Este movimiento es Earn? Aplica los dos mecanismos, en orden. */
export function esMovimientoEarn(movimiento, nombreProveedor) {
  if (!movimiento) return false
  if (esProveedorEarn(nombreProveedor ?? movimiento.proveedor_nombre)) return true
  return contienePalabraEarn(movimiento.descripcion)
}

/**
 * Regex de intereses (PRD §7, variante A).
 *
 * Ojo: **es más amplia** que la palabra clave `interest` de Earn. Incluye
 * `rendimiento`, `ganancia` y `yield`, que son ingresos que no son productos
 * Earn pero sí intereses devengados. Se usa para «Intereses ganados» en la
 * pantalla de proveedores "todo es Earn", que es una métrica distinta de
 * «Total recompensas»: no las mezcles.
 */
export const REGEX_INTERES = /(interes|interest|rendimiento|ganancia|yield)/

/**
 * `true` si el concepto es un interés.
 *
 * Opera sobre la descripción normalizada en lugar de con `.test()` directo
 * sobre el texto original, para que "Interés" (con tilde) y "INTERES" cuenten
 * igual. Es la implementación del `esInteres` que pide el PRD §8.4-A.
 */
export function esInteres(descripcion) {
  return REGEX_INTERES.test(normalizarTexto(descripcion))
}

// ---------------------------------------------------------------------
// Categorías internas
// ---------------------------------------------------------------------
// Las métricas del PRD cruzan dos ejes: tipo de movimiento (ingreso/egreso) y
// concepto (subscription / interest / redemption). Enumerar las categorías en
// un solo sitio evita que cada métrica invente su propia coincidencia de
// texto y que "Total invertido" y "Total recompensas" se calculen con reglas
// distintas.
export const CATEGORIA_EARN = {
  SUSCRIPCION: 'suscripcion',
  INTERES: 'interes',
  REDENCION: 'redencion',
  OTRO: 'otro',
}

/** Categoría Earn de una descripción, sin mirar el proveedor. */
export function categoriaEarn(descripcion) {
  const norm = normalizarTexto(descripcion)
  if (contiene(norm, 'subscription') || contiene(norm, 'suscripcion')) {
    return CATEGORIA_EARN.SUSCRIPCION
  }
  if (contiene(norm, 'redemption') || contiene(norm, 'redeem') || contiene(norm, 'redencion')) {
    return CATEGORIA_EARN.REDENCION
  }
  if (contiene(norm, 'interest') || contiene(norm, 'interes')) {
    return CATEGORIA_EARN.INTERES
  }
  return CATEGORIA_EARN.OTRO
}

// ---------------------------------------------------------------------
// Agregaciones
// ---------------------------------------------------------------------

/**
 * Suma importes ignorando el signo: `monto` ya es siempre positivo en la base
 * (CHECK `monto >= 0` en la 0002/0004) y la dirección la da `tipo`. Sumar con
 * signo daría un neto que no es ninguna de las métricas del PRD.
 *
 * Se redondea a 8 decimales — la precisión de `numeric(20,8)` (decisión D3) —
 * porque sumar en coma flotante acumula colas binarias (`0.1 + 0.2`). No
 * sustituye a `numeric` en la base: es solo para no mostrar `3.0000000000000004`.
 */
function sumaMonetaria(movimientos, filtro) {
  const total = movimientos.reduce((acc, m) => (filtro(m) ? acc + Number(m.monto || 0) : acc), 0)
  return Number(total.toFixed(8))
}

const esIngreso = (m) => m.tipo === 'ingreso'
const esEgreso = (m) => m.tipo === 'egreso'

/**
 * Métricas Earn de un período (PRD §7, tabla de métricas).
 *
 * Se define «invertido» como egresos con "subscription", «recompensas» como
 * ingresos con "interest" y «redimido» como ingresos con "redemption", que es
 * la definición que el PRD adopta al resolver su propia contradicción (§8.2
 * frente a §8.3: la otra versión incluía depósitos normales como "redimido" y
 * habría inflado el número).
 *
 * `salidasNetas = recompensas + redimido - invertido`. Puede ser negativo: no
 * es un error, significa que se suscribió más capital del que se rescató.
 */
export function resumenEarn(movimientos = []) {
  const invertido = sumaMonetaria(
    movimientos,
    (m) => esEgreso(m) && categoriaEarn(m.descripcion) === CATEGORIA_EARN.SUSCRIPCION
  )
  const recompensas = sumaMonetaria(
    movimientos,
    (m) => esIngreso(m) && categoriaEarn(m.descripcion) === CATEGORIA_EARN.INTERES
  )
  const redimido = sumaMonetaria(
    movimientos,
    (m) => esIngreso(m) && categoriaEarn(m.descripcion) === CATEGORIA_EARN.REDENCION
  )
  const totalIngresos = sumaMonetaria(movimientos, esIngreso)
  const totalEgresos = sumaMonetaria(movimientos, esEgreso)

  return {
    invertido,
    recompensas,
    redimido,
    totalIngresos,
    totalEgresos,
    salidasNetas: Number((recompensas + redimido - invertido).toFixed(8)),
    // Intereses ganados con el regex amplio: es la métrica que pide la
    // pantalla de proveedores "todo es Earn" (§8.4-A), distinta de `recompensas`.
    interesesGanados: sumaMonetaria(movimientos, (m) => esIngreso(m) && esInteres(m.descripcion)),
    total: movimientos.length,
  }
}

/**
 * Activos Earn agrupados por moneda (PRD §7).
 *
 * Agrupar por moneda es obligatorio por D4/D12: una wallet puede tener saldo
 * simultáneo en BTC y USDT y no se convierten entre sí. El PRD pide **solo**
 * los activos con algún valor distinto de cero, así que una moneda por la que
 * solo pasaron ceros no aparece (`activosConSaldo`).
 *
 * `saldo = invertido - redimido` (definición del PRD). El «rendimiento» se
 * informa aparte a propósito, **no** sumado al saldo: el interés devengado lo
 * reporta el proveedor y sumarlo aquí duplicaría capital, porque el extracto ya
 * lo refleja en sus propias redenciones.
 */
export function activosEarnPorMoneda(movimientos = []) {
  const porMoneda = new Map()

  for (const m of movimientos) {
    const moneda = (m.tipo_moneda || m.moneda || '').toUpperCase()
    if (!moneda) continue

    const actual = porMoneda.get(moneda) ?? {
      moneda,
      saldo: 0,
      invertido: 0,
      rendimiento: 0,
      redimido: 0,
      movimientos: 0,
    }
    actual.movimientos += 1

    const categoria = categoriaEarn(m.descripcion)
    const monto = Number(m.monto || 0)

    if (esEgreso(m) && categoria === CATEGORIA_EARN.SUSCRIPCION) actual.invertido += monto
    if (esIngreso(m) && categoria === CATEGORIA_EARN.INTERES) actual.rendimiento += monto
    if (esIngreso(m) && categoria === CATEGORIA_EARN.REDENCION) actual.redimido += monto

    porMoneda.set(moneda, actual)
  }

  return [...porMoneda.values()]
    .map((a) => ({
      ...a,
      // Redondeo a la precisión de numeric(20,8), igual que en las sumas.
      invertido: Number(a.invertido.toFixed(8)),
      rendimiento: Number(a.rendimiento.toFixed(8)),
      redimido: Number(a.redimido.toFixed(8)),
      saldo: Number((a.invertido - a.redimido).toFixed(8)),
    }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/** Solo los activos con algún valor distinto de cero (requisito del PRD §7). */
export function activosConSaldo(activos) {
  return activos.filter(
    (a) => a.saldo !== 0 || a.invertido !== 0 || a.rendimiento !== 0 || a.redimido !== 0
  )
}
