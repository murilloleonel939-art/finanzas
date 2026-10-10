/**
 * Capa de datos del módulo de wallets .
 *
 * COLUMNAS REALES (migraciones 0004 y 0005) — comprobadas contra las
 * migraciones antes de escribir una línea, que es lo que una revisión anterior no hizo:
 *
 *   wallet_providers   id, empresa_id, tipo, nombre_proveedor, created_by,
 *                      created_at, updated_at, deleted_at
 *   wallets            id, empresa_id, proveedor_id, tipo, nombre_wallet,
 *                      direccion, tipo_moneda, created_by, created_at,
 *                      updated_at, deleted_at
 *   wallet_saldos      wallet_id, moneda, monto, updated_at
 *                      → PK compuesta (wallet_id, moneda). **No tiene id**:
 *                        es una tabla de valores, no una entidad (D12).
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
 * El borrado es lógico (D7). Las vistas ya filtran por dentro; las tablas no, y
 * por eso cada consulta a una tabla lleva su `.is('deleted_at', null)`. Las de
 * `wallet_saldos` no lo llevan porque la tabla **no tiene** esa columna: su
 * visibilidad la decide el RLS con un EXISTS contra `wallets` (0006).
 */
import { supabase } from '@/lib/supabase'
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
  const { data, error } = await supabase
    .from('wallet_providers')
    .select('id, tipo, nombre_proveedor, created_at')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('nombre_proveedor')

  if (error) throw error
  return data ?? []
}

export async function obtenerProveedor(proveedorId) {
  const { data, error } = await supabase
    .from('wallet_providers')
    .select('id, empresa_id, tipo, nombre_proveedor')
    .eq('id', proveedorId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function crearProveedor({ empresaId, tipo, nombreProveedor, userId }) {
  const { data, error } = await supabase
    .from('wallet_providers')
    .insert({
      empresa_id: empresaId,
      tipo,
      nombre_proveedor: nombreProveedor,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

/**
 * Borra el proveedor lógicamente. Sus wallets y movimientos no se tocan: el
 * acceso ya se deriva del `deleted_at` del proveedor en las vistas, y una
 * cascada de borrados lógicos es justo lo que D19 descartó para las empresas.
 */
export async function borrarProveedor(proveedorId) {
  const { error } = await supabase
    .from('wallet_providers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', proveedorId)

  if (error) throw error
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
  const { data, error } = await supabase
    .from('wallets_view')
    .select(
      'id, proveedor_id, proveedor_nombre, tipo, nombre_wallet, direccion, tipo_moneda, saldo_total, monedas_distintas'
    )
    .eq('empresa_id', empresaId)
    .order('nombre_wallet')

  if (error) throw error
  return data ?? []
}

/** Wallets de un proveedor concreto (la tarjeta del proveedor en el listado). */
export async function listarWalletsDeProveedor(proveedorId) {
  const { data, error } = await supabase
    .from('wallets_view')
    .select(
      'id, proveedor_id, proveedor_nombre, tipo, nombre_wallet, direccion, tipo_moneda, saldo_total, monedas_distintas'
    )
    .eq('proveedor_id', proveedorId)
    .order('nombre_wallet')

  if (error) throw error
  return data ?? []
}

/** Una wallet desde la vista, ya con `proveedor_nombre` resuelto. */
export async function obtenerWallet(walletId) {
  const { data, error } = await supabase
    .from('wallets_view')
    .select(
      'id, empresa_id, proveedor_id, proveedor_nombre, tipo, nombre_wallet, direccion, tipo_moneda, saldo_total, monedas_distintas'
    )
    .eq('id', walletId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
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
 * Va en dos pasos y no en una transacción (PostgREST no las expone desde el
 * cliente). Si falla el segundo, queda una wallet sin saldo —molesta pero
 * coherente— en vez de un saldo sin wallet, que no puede existir por la FK.
 *
 * `tipo` se copia del proveedor y se congela: es el único denormalizado que el
 * esquema conserva a propósito (0004), para que un cambio futuro en el
 * proveedor no reinterprete wallets históricas.
 */
export async function crearWallet({
  empresaId,
  proveedorId,
  tipoProveedor,
  nombreWallet,
  direccion,
  tipoMoneda,
  saldos = [],
  fechaApertura,
  userId,
}) {
  const { data: wallet, error } = await supabase
    .from('wallets')
    .insert({
      empresa_id: empresaId,
      proveedor_id: proveedorId,
      tipo: tipoProveedor,
      nombre_wallet: nombreWallet,
      direccion: direccion?.trim() || null,
      tipo_moneda: tipoMoneda,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error

  const conSaldo = (saldos ?? []).filter((s) => Number(s.monto) > 0)
  if (conSaldo.length === 0) return wallet

  const { error: errSaldos } = await supabase.from('wallet_saldos').insert(
    conSaldo.map((s) => ({
      wallet_id: wallet.id,
      moneda: s.moneda,
      monto: Number(s.monto),
    }))
  )

  if (errSaldos) throw errSaldos

  const { error: errMovs } = await supabase.from('movimientos_wallet').insert(
    conSaldo.map((s) => ({
      empresa_id: empresaId,
      proveedor_id: proveedorId,
      wallet_id: wallet.id,
      fecha: fechaApertura,
      descripcion: 'Saldo inicial',
      tipo: 'ingreso',
      monto: Number(s.monto),
      tipo_moneda: s.moneda,
      created_by: userId,
    }))
  )

  if (errMovs) throw errMovs

  return wallet
}

export async function borrarWallet(walletId) {
  const { error } = await supabase
    .from('wallets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', walletId)

  if (error) throw error
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
  const { data, error } = await supabase
    .from('wallet_saldos')
    .select('wallet_id, moneda, monto, updated_at')
    .eq('wallet_id', walletId)
    .order('moneda')

  if (error) throw error
  return data ?? []
}

/**
 * Escribe el saldo de una moneda (upsert sobre la PK compuesta).
 *
 * `onConflict` tiene que nombrar las DOS columnas: la PK no es `id`, así que sin
 * esto PostgREST intentaría un `id` inexistente y fallaría. Se escribe el saldo
 * calculado, no un incremento, para que un alta repetida no lo duplique.
 */
export async function fijarSaldo(walletId, moneda, monto) {
  const { error } = await supabase
    .from('wallet_saldos')
    .upsert(
      { wallet_id: walletId, moneda, monto: Number(monto), updated_at: new Date().toISOString() },
      { onConflict: 'wallet_id,moneda' }
    )

  if (error) throw error
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
  const { data, error } = await supabase
    .from('movimientos_wallet_view')
    .select(
      'id, fecha, descripcion, tipo, monto, tipo_moneda, proveedor_nombre, external_id'
    )
    .eq('wallet_id', walletId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function crearMovimientoWallet({
  empresaId,
  proveedorId,
  walletId,
  fecha,
  descripcion,
  tipo,
  monto,
  tipoMoneda,
  userId,
}) {
  const { data, error } = await supabase
    .from('movimientos_wallet')
    .insert({
      empresa_id: empresaId,
      proveedor_id: proveedorId,
      wallet_id: walletId,
      fecha,
      descripcion,
      tipo,
      monto,
      tipo_moneda: tipoMoneda,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

export async function borrarMovimientoWallet(id) {
  const { error } = await supabase
    .from('movimientos_wallet')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
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
export async function recalcularSaldosWallet(walletId) {
  const { data, error } = await supabase
    .from('movimientos_wallet')
    .select('tipo, monto, tipo_moneda')
    .eq('wallet_id', walletId)
    .is('deleted_at', null)

  if (error) throw error

  const calculados = saldosPorMoneda(data ?? [])

  const saldos = []
  const descuadres = []

  for (const s of calculados) {
    if (s.monto < 0) {
      descuadres.push({
        moneda: s.moneda,
        monto: s.monto,
        motivo:
          `El saldo calculado en ${s.moneda} es negativo (${s.monto}). La base no ` +
          `admite un saldo negativo y no se ha recortado a cero: revisa los ` +
          `movimientos de esa moneda.`,
      })
      continue
    }
    await fijarSaldo(walletId, s.moneda, s.monto)
    saldos.push(s)
  }

  return { saldos, descuadres }
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
export function analizarWallet(movimientos = [], saldosFinales = [], esDelPeriodo = () => true) {
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
      if (esInteres(m.descripcion)) acc.interesesGanados += monto
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
