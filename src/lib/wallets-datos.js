/**
 * Capa de datos del módulo de wallets .
 *
 * COLUMNAS REALES — comprobadas contra server/schema.sql antes de escribir código:
 *
 *   wallet_providers   id, empresa_id, tipo, nombre_proveedor, created_by,
 *                      created_at, updated_at, deleted_at
 *   wallets            id, empresa_id, proveedor_id, tipo, nombre_wallet,
 *                      direccion, tipo_moneda, created_by, created_at,
 *                      updated_at, deleted_at
 *   wallet_saldos      wallet_id, moneda, monto, updated_at
 *                      → PK compuesta (wallet_id, moneda). **No tiene id**:
 *                        es una tabla de valores, no una entidad.
 *   movimientos_wallet id, empresa_id, proveedor_id, wallet_id, fecha,
 *                      descripcion, tipo, monto, tipo_moneda, external_id,
 *                      source_file, created_by, created_at, updated_at,
 *                      deleted_at
 *
 *   wallets_view              añade empresa_nombre, proveedor_nombre y el
 *                             agregado saldo_total + monedas_distintas
 *   movimientos_wallet_view   añade empresa_nombre, proveedor_nombre,
 *                             nombre_wallet y wallet_direccion
 *
 * Lo que NO existe y no se puede pedir:
 *   · `wallets.monto` — se eliminó a propósito (D12), el saldo vive en
 *     `wallet_saldos` y el agregado está en `wallets_view.saldo_total`.
 *   · `wallet_saldos_view` — la vista no se creó; el agregado va en
 *     `wallets_view`.
 *   · `wallets.proveedor_nombre` ni `wallets.empresa_nombre` — son columnas de
 *     la vista, no de la tabla (D8).
 *
 * El borrado es lógico. Las vistas ya filtran por dentro; las tablas no, y por
 * eso cada consulta a una tabla lleva su filtro de `deleted_at` cuando aplica.
 */
import { api, apiJson } from '@/lib/api'
import { esInteres } from '@/lib/earnConfig'

// ---------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------

/**
 * Proveedores de la empresa, con sus wallets y el saldo agregado (D8).
 *
 * `proveedor_nombre` sale de la vista: la tabla solo tiene
 * `nombre_proveedor`, y confundirlos es exactamente el error que una versión anterior
 * pagó caro.
 */
export async function listarProveedores(empresaId) {
  const { proveedores } = await api(`/api/empresas/${empresaId}/wallet-providers`)
  return proveedores
}

export async function obtenerProveedor(proveedorId) {
  const { proveedor } = await api(`/api/wallet-providers/${proveedorId}`)
  return proveedor
}

export function crearProveedor({ empresaId, tipo, nombreProveedor }) {
  return apiJson(`/api/empresas/${empresaId}/wallet-providers`, 'POST', { tipo, nombre_proveedor: nombreProveedor })
}

/**
 * Borra el proveedor lógicamente. Sus wallets y movimientos no se tocan: el
 * acceso ya se deriva del `deleted_at` del proveedor en las vistas, y una
 * cascada de borrados lógicos es justo lo que D19 descartó para las empresas.
 */
export function borrarProveedor(empresaId, proveedorId) {
  return api(`/api/empresas/${empresaId}/wallet-providers/${proveedorId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------

/**
 * Wallets de la empresa, desde la vista.
 *
 * `saldo_total` es un agregado de `wallet_saldos` que ya calcula la vista, pero
 * **sin desglose por moneda**: sumar BTC + USDT daría un número sin sentido
 * (D4). Sirve para ordenar y para el listado; el desglose real lo da
 * `listarSaldos()`.
 */
export async function listarWallets(empresaId) {
  const { wallets } = await api(`/api/empresas/${empresaId}/wallets`)
  return wallets
}

/** Wallets de un proveedor concreto (la tarjeta del proveedor en el listado). */
export async function listarWalletsDeProveedor(proveedorId) {
  const { wallets } = await api(`/api/wallet-providers/${proveedorId}/wallets`)
  return wallets
}

/** Una wallet desde la vista, ya con `proveedor_nombre` resuelto. */
export async function obtenerWallet(walletId) {
  const { wallet } = await api(`/api/wallets/${walletId}`)
  return wallet
}

/**
 * Crea una wallet y, si se indicó saldo inicial, su fila en `wallet_saldos`.
 *
 * El saldo inicial es **por moneda** porque un saldo escalar no existe (D12):
 * una wallet puede abrir con 0.5 BTC y 200 USDT a la vez. Se crea además un
 * movimiento de apertura por cada moneda con saldo, para que el saldo tenga
 * una fila que lo explique: un saldo sin movimiento es un descuadre imposible
 * de auditar después (mismo criterio que `CrearCuenta`).
 *
 * Va en dos pasos y usa endpoints separados de la API local; cada operación
 * cliente). Si falla el segundo, queda una wallet sin saldo —molesta pero
 * coherente— en vez de un saldo sin wallet, que no puede existir por la FK.
 *
 * `tipo` se copia del proveedor y se congela: es el único denormalizado que el
 * esquema conserva a propósito (0004), para que un cambio futuro en el
 * proveedor no reinterprete wallets históricas.
 */
export function crearWallet({ empresaId, proveedorId, tipoProveedor, nombreWallet, direccion, tipoMoneda, saldos = [], fechaApertura }) {
  return apiJson(`/api/empresas/${empresaId}/wallet-providers/${proveedorId}/wallets`, 'POST', {
    tipo: tipoProveedor, nombre_wallet: nombreWallet, direccion, tipo_moneda: tipoMoneda, saldos, fecha_apertura: fechaApertura,
  })
}


export function borrarWallet(empresaId, walletId) {
  return api(`/api/empresas/${empresaId}/wallets/${walletId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------
// Saldos por moneda (D12)
// ---------------------------------------------------------------------

/**
 * Saldos de una wallet, una fila por moneda.
 *
 * No filtra `deleted_at` porque `wallet_saldos` no tiene esa columna: es una
 * tabla de valores cuya fila desaparece con la wallet (ON DELETE CASCADE).
 */
export async function listarSaldos(walletId) {
  const { saldos } = await api(`/api/wallets/${walletId}/saldos`)
  return saldos
}

// ---------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------

/**
 * Movimientos de una wallet, del más reciente al más antiguo.
 *
 * `movimientos_wallet` **no tiene columna `orden`** (a diferencia de
 * `movimientos` bancarios): dos movimientos del mismo día se desempatan con
 * `created_at`, que es lo único que hay para hacerlo.
 */
export async function listarMovimientosWallet(walletId) {
  const { movimientos } = await api(`/api/wallets/${walletId}/movimientos`)
  return movimientos
}

export function crearMovimientoWallet({ empresaId, walletId, fecha, descripcion, tipo, monto, tipoMoneda }) {
  return apiJson(`/api/empresas/${empresaId}/wallets/${walletId}/movimientos`, 'POST', {
    fecha, descripcion, tipo, monto, tipo_moneda: tipoMoneda,
  })
}

export function borrarMovimientoWallet(empresaId, walletId, movimientoId) {
  return api(`/api/empresas/${empresaId}/wallets/${walletId}/movimientos/${movimientoId}`, { method: 'DELETE' })
}

export async function obtenerUltimaImportacionWallet(empresaId, walletId) {
  const { importacion } = await api(`/api/empresas/${empresaId}/wallets/${walletId}/ultima-importacion`)
  return importacion ?? null
}

export function borrarUltimaImportacionWallet(empresaId, walletId) {
  return api(`/api/empresas/${empresaId}/wallets/${walletId}/ultima-importacion`, { method: 'DELETE' })
}

/**
 * Borra TODOS los movimientos de la wallet, para volver a empezar.
 *
 * No borra la wallet: se conserva el proveedor, el nombre y la dirección. Lo
 * que queda en cero es el saldo, porque `wallet_saldos` se recalcula desde los
 * movimientos y ya no hay ninguno. Es irreversible desde la interfaz, así que se
 * confirma antes.
 */
export function borrarDatosWallet(empresaId, walletId) {
  return api(`/api/empresas/${empresaId}/wallets/${walletId}/datos`, { method: 'DELETE' })
}

/**
 * Recalcula los saldos de una wallet a partir de TODOS sus movimientos.
 *
 * Igual que `recalcularSaldoCuenta`: es un recálculo completo y no un
 * incremento, porque con un incremento cualquier borrado, edición o importación
 * por otra vía dejaría el saldo desviado sin que nadie lo note. En una app
 * financiera ese descuadre se arrastra para siempre.
 *
 * **La restricción no se puede inventar.** El CHECK `monto >= 0` de la 0004
 * impide un saldo negativo, pero un extracto real sí puede dejar una moneda en
 * negativo (una redención mayor que lo suscrito, un retiro que se registró
 * después del depósito). D25 dice que un CHECK es un contrato y que el cliente
 * puede adelantarse para dar mejor error, nunca satisfacerlo inventando los
 * datos que faltan. Aquí eso significa: **no se escribe nada en esa moneda** y
 * se informa del descuadre, en vez de recortar el saldo a cero —que mostraría
 * un saldo falso— o de dejar que Postgres devuelva un 23514 opaco.
 *
 * Devuelve `{ saldos, descuadres }`, donde `descuadres` son las monedas cuyo
 * cálculo no se pudo guardar y por qué.
 */
export function recalcularSaldosWallet(walletId) {
  return apiJson(`/api/wallets/${walletId}/recalcular-saldos`, 'POST')
}

// ---------------------------------------------------------------------
// Cálculos (puros)
// ---------------------------------------------------------------------

function redondear(n) {
  return Number(Number(n ?? 0).toFixed(8))
}

/**
 * Saldo por moneda a partir de los movimientos: ingreso suma, egreso resta.
 *
 * El monto es siempre positivo en la base (CHECK `monto >= 0` en la 0004) y la
 * dirección la da `tipo`. Una moneda que solo apareció en movimientos aparece
 * con su saldo real, y una con saldo cero se devuelve también: es información
 * (la moneda se usó y se vació), no ruido.
 */
export function saldosPorMoneda(movimientos = []) {
  const porMoneda = new Map()

  for (const m of movimientos) {
    const moneda = (m.tipo_moneda || '').toUpperCase()
    if (!moneda) continue
    const actual = porMoneda.get(moneda) ?? 0
    const monto = Number(m.monto ?? 0)
    porMoneda.set(moneda, actual + (m.tipo === 'ingreso' ? monto : -monto))
  }

  return [...porMoneda.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: redondear(monto) }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/**
 * Reconstruye el saldo por moneda y resume un período (PRD §6 y §7).
 *
 * POR QUÉ NO BASTA CON `saldosPorMoneda`: las tarjetas del PRD piden **saldo
 * inicial** y **saldo final**, y el esquema no guarda el saldo de cada fila (no
 * existe `saldo_resultante`, igual que en las cuentas). Hay que reconstruirlo.
 *
 * Y no vale anclar el período en el saldo actual como hace
 * `conSaldoResultante()` en las cuentas: si el usuario filtra por un mes que
 * **no es el último**, `saldoActual - netoDelMes` no es el saldo de entrada de
 * ese mes, es un número que no existe. Aquí sí se puede hacer bien, porque la
 * wallet ya trae **todos** sus movimientos a memoria: se parte del saldo
 * almacenado (`wallet_saldos`), se retrocede hasta la apertura y desde ahí se
 * avanza sumando, de modo que el saldo inicial de cualquier mes sale exacto.
 *
 * `apertura` es el saldo con el que la wallet nació: si sale distinto de cero,
 * es que `wallet_saldos` no cuadra con los movimientos —un descuadre real que
 * conviene enseñar en vez de esconder.
 *
 * Todo va **por moneda** (D4): una wallet con BTC y USDT son dos líneas sin
 * consolidado, y sumarlas daría un número sin significado.
 *
 * @param movimientos     TODOS los movimientos de la wallet, como llegan de la
 *                        vista (orden descendente por fecha)
 * @param saldosFinales   filas de `wallet_saldos`: [{ moneda, monto }]
 * @param esDelPeriodo    predicado para decidir si una fila entra en el resumen
 *                        (p. ej. el mes elegido en el MonthFilter)
 */
export function analizarWallet(movimientos = [], saldosFinales = [], esDelPeriodo = () => true, proveedorNombre = '') {
  const final = new Map()
  for (const s of saldosFinales) {
    final.set(String(s.moneda).toUpperCase(), Number(s.monto ?? 0))
  }

  const efecto = (m) => (m.tipo === 'ingreso' ? Number(m.monto ?? 0) : -Number(m.monto ?? 0))
  const moneda = (m) => (m.tipo_moneda || 'N/A').toUpperCase()

  // Trabajar en orden cronológico: la reconstrucción hacia atrás solo tiene
  // sentido si se avanza desde el principio.
  const ascendente = [...movimientos].reverse()

  // Apertura = saldo almacenado - la suma de todos los efectos. Si el saldo
  // guardado está al día, da cero.
  const sumaEfectos = new Map()
  for (const m of ascendente) {
    const k = moneda(m)
    sumaEfectos.set(k, (sumaEfectos.get(k) ?? 0) + efecto(m))
  }

  const saldo = new Map()
  for (const k of new Set([...final.keys(), ...sumaEfectos.keys()])) {
    saldo.set(k, redondear((final.get(k) ?? 0) - (sumaEfectos.get(k) ?? 0)))
  }
  const apertura = new Map(saldo)

  const filas = []
  const porMoneda = new Map()

  // `saldoInicial` es el saldo **al entrar en el período**, no el de apertura de
  // la wallet: si se filtra por un mes intermedio, lo que interesa es con cuánto
  // se empezó ese mes. Por eso la casilla se abre con el saldo que había justo
  // antes del primer movimiento del período (`previo`), y no con `apertura`.
  const casilla = (k, previo) => {
    if (!porMoneda.has(k)) {
      porMoneda.set(k, {
        moneda: k,
        saldoInicial: redondear(previo),
        ingresos: 0,
        egresos: 0,
        saldoFinal: redondear(previo),
        interesesGanados: 0,
        total: 0,
      })
    }
    return porMoneda.get(k)
  }

  for (const m of ascendente) {
    const k = moneda(m)
    const previo = saldo.get(k) ?? 0
    const nuevo = redondear(previo + efecto(m))
    saldo.set(k, nuevo)

    if (!esDelPeriodo(m)) continue

    const acc = casilla(k, previo)
    const monto = Number(m.monto ?? 0)
    if (m.tipo === 'ingreso') {
      acc.ingresos += monto
      if (esInteres(m.descripcion, proveedorNombre)) acc.interesesGanados += monto
    } else {
      acc.egresos += monto
    }
    acc.total += 1
    acc.saldoFinal = nuevo

    filas.push({ ...m, saldo_resultante: nuevo })
  }

  return {
    // El orden de salida es el de la entrada (descendente), como lo pinta la tabla.
    filas: filas.reverse(),
    porMoneda: [...porMoneda.values()]
      .map((a) => ({
        ...a,
        ingresos: redondear(a.ingresos),
        egresos: redondear(a.egresos),
        neto: redondear(a.ingresos - a.egresos),
        interesesGanados: redondear(a.interesesGanados),
      }))
      .sort((a, b) => a.moneda.localeCompare(b.moneda)),
    apertura: [...apertura.entries()]
      .map(([moneda, monto]) => ({ moneda, monto }))
      .sort((a, b) => a.moneda.localeCompare(b.moneda)),
  }
}
