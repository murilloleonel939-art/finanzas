// Prueba de humo del módulo de wallets (módulo wallets + Earn).
//
// Ejecuta la ruta REAL del navegador: `src/lib/wallets-datos.js` importa
// `@/lib/supabase` (que exige `import.meta.env` y una anon key real), así que
// `scripts/wallets-humo.mjs` compila el código original con esbuild sustituyendo
// solo ese import por un doble.
//
// Lo que comprueba, y por qué `npm run build` no lo ve: igual que en el módulo de brokers,
// las columnas de PostgREST son strings en runtime, así que una columna inventada
// compila sin queja y solo revienta en el navegador.
import assert from 'node:assert/strict'

import {
  listarProveedores,
  obtenerProveedor,
  crearProveedor,
  borrarProveedor,
  listarWallets,
  listarWalletsDeProveedor,
  obtenerWallet,
  crearWallet,
  borrarWallet,
  listarSaldos,
  fijarSaldo,
  listarMovimientosWallet,
  crearMovimientoWallet,
  borrarMovimientoWallet,
  recalcularSaldosWallet,
  saldosPorMoneda,
  analizarWallet,
} from 'wallets-datos'
import {
  proveedoresPorTipo,
  tipoDeProveedor,
  resolverNombreProveedor,
  resolverTipoProveedor,
  claveProveedor,
  WALLET_PROVIDERS,
  OTRO_PROVEEDOR,
} from 'wallet-providers'
import {
  esMovimientoEarn,
  esProveedorEarn,
  contienePalabraEarn,
  esInteres,
  resumenEarn,
  activosEarnPorMoneda,
  activosConSaldo,
  categoriaEarn,
  EARN_ALL_MOVEMENTS_PROVIDERS,
  CATEGORIA_EARN,
} from 'earn-config'
import { hoyLocal } from 'utils-lib'
import { consultas, responder, responderConDatos, ultima, limpiarRespuestas } from 'supabase-doble'

let ok = 0
const fallos = []

async function t(nombre, fn) {
  try {
    await fn()
    ok++
    console.log('  ok  ' + nombre)
  } catch (e) {
    fallos.push({ nombre, e })
    console.log('  XX  ' + nombre + '\n        ' + e.message)
  }
}

const marca = () => consultas.length
const desde = (m) => consultas.slice(m)

// =====================================================================
// Esquema esperado de la base
// =====================================================================
const COLUMNAS = {
  wallet_providers: [
    'id', 'empresa_id', 'tipo', 'nombre_proveedor', 'created_by',
    'created_at', 'updated_at', 'deleted_at',
  ],
  wallets: [
    'id', 'empresa_id', 'proveedor_id', 'tipo', 'nombre_wallet',
    'direccion', 'tipo_moneda', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  ],
  wallet_saldos: ['wallet_id', 'moneda', 'monto', 'updated_at'],
  movimientos_wallet: [
    'id', 'empresa_id', 'proveedor_id', 'wallet_id', 'fecha', 'descripcion',
    'tipo', 'monto', 'tipo_moneda', 'external_id', 'source_file', 'created_by',
    'created_at', 'updated_at', 'deleted_at',
  ],
  wallets_view: [
    'id', 'empresa_id', 'empresa_nombre', 'proveedor_id', 'proveedor_nombre',
    'tipo', 'nombre_wallet', 'direccion', 'tipo_moneda', 'saldo_total',
    'monedas_distintas', 'created_at', 'updated_at',
  ],
  movimientos_wallet_view: [
    'id', 'empresa_id', 'empresa_nombre', 'proveedor_id', 'proveedor_nombre',
    'wallet_id', 'nombre_wallet', 'wallet_direccion', 'fecha', 'descripcion',
    'tipo', 'monto', 'tipo_moneda', 'external_id', 'created_at',
  ],
}

// Columnas inventadas que una revisión anterior dejó pasar. Si reaparecen, esto falla.
const INVENTADAS = [
  'saldo_actual',
  'saldo_resultante',
  'concepto',
  'wallet_saldos_view',  // esta vista no existe
  'valor_total',         // es de activos_broker_view, no de wallets
]

// Tablas con `deleted_at` propio: la capa de datos debe filtrarlo (D7).
const TABLAS_CON_BORRADO = [
  'wallet_providers', 'wallets', 'movimientos_wallet',
]

// =====================================================================
// Bloque 1: catálogos puros
// =====================================================================
console.log('\n-- catálogos de wallets (src/lib/walletProviders.js) --')

await t('hay ~45 proveedores en el catálogo', () => {
  assert.ok(WALLET_PROVIDERS.length > 40)
  assert.ok(WALLET_PROVIDERS.length < 50)
})

await t('cada proveedor tiene nombre y tipo', () => {
  for (const p of WALLET_PROVIDERS) {
    assert.ok(p.nombre && ['cripto', 'fiat', 'ambos'].includes(p.tipo))
  }
})

await t('no hay nombres duplicados en el catálogo', () => {
  const nombres = WALLET_PROVIDERS.map((p) => p.nombre)
  assert.equal(new Set(nombres).size, nombres.length)
})

await t('proveedoresPorTipo filtra, sin tipo devuelve todo', () => {
  const cripto = proveedoresPorTipo('cripto')
  assert.ok(cripto.length > 0)
  assert.ok(cripto.every((p) => ['cripto', 'ambos'].includes(p.tipo)))
  assert.equal(proveedoresPorTipo().length, WALLET_PROVIDERS.length)
})

await t('tipoDeProveedor ignora mayúsculas y acentos', () => {
  assert.equal(tipoDeProveedor('BINANCE'), 'ambos')
  assert.equal(tipoDeProveedor('binance'), 'ambos')
  assert.equal(tipoDeProveedor('NoExiste'), null)
})

await t('resolverNombreProveedor: «Otro» vacío da null, con texto recorta', () => {
  assert.equal(resolverNombreProveedor(OTRO_PROVEEDOR, '  '), null)
  assert.equal(resolverNombreProveedor(OTRO_PROVEEDOR, ' Cripto Inc '), 'Cripto Inc')
  assert.equal(resolverNombreProveedor('Binance', ''), 'Binance')
})

await t('resolverTipoProveedor: del catálogo se deduce, de «Otro» se elige', () => {
  assert.equal(resolverTipoProveedor('Binance', null), 'ambos')
  assert.equal(resolverTipoProveedor(OTRO_PROVEEDOR, 'cripto'), 'cripto')
  assert.equal(resolverTipoProveedor(OTRO_PROVEEDOR, null), null)
})

await t('el centinela «Otro» nunca se guarda tal cual', () => {
  assert.equal(OTRO_PROVEEDOR, '__otro__')
  assert.notEqual(resolverNombreProveedor(OTRO_PROVEEDOR, 'X'), OTRO_PROVEEDOR)
})

// =====================================================================
// Bloque 2: Earn (PRD §7)
// =====================================================================
console.log('\n-- clasificación Earn (src/lib/earnConfig.js) --')

await t('Coindepo es «todo es Earn» (mecanismo 2)', () => {
  assert.ok(esProveedorEarn('coindepo'))
  assert.ok(esProveedorEarn('COINDEPO'))
  assert.ok(esProveedorEarn('Coindepo'))
  assert.ok(!esProveedorEarn('Binance'))
})

await t('contienePalabraEarn busca palabras clave en la descripción', () => {
  assert.ok(contienePalabraEarn('Interés devengado'))
  assert.ok(contienePalabraEarn('subscription-plan'))
  assert.ok(contienePalabraEarn('Staking Rewards'))
  assert.ok(!contienePalabraEarn('Depósito normal'))
})

await t('esInteres es más amplio: interés, rendimiento, ganancia, yield', () => {
  assert.ok(esInteres('Interés'))
  assert.ok(esInteres('Rendimiento'))
  assert.ok(esInteres('ganancia'))
  assert.ok(esInteres('YIELD'))
  assert.ok(!esInteres('Depósito'))
})

await t('esMovimientoEarn aplica los dos mecanismos en orden (proveedor primero)', () => {
  const m1 = { descripcion: 'Depósito normal', proveedor_nombre: 'Coindepo' }
  assert.ok(esMovimientoEarn(m1))  // mecanismo 2

  const m2 = { descripcion: 'Interés', proveedor_nombre: 'Binance' }
  assert.ok(esMovimientoEarn(m2))  // mecanismo 1

  const m3 = { descripcion: 'Transferencia', proveedor_nombre: 'Binance' }
  assert.ok(!esMovimientoEarn(m3))  // ni uno ni otro
})

await t('categoriaEarn clasifica por palabras clave', () => {
  assert.equal(categoriaEarn('Suscripción'), CATEGORIA_EARN.SUSCRIPCION)
  assert.equal(categoriaEarn('Interest Income'), CATEGORIA_EARN.INTERES)
  assert.equal(categoriaEarn('Redención'), CATEGORIA_EARN.REDENCION)
  assert.equal(categoriaEarn('Transferencia'), CATEGORIA_EARN.OTRO)
})

await t('resumenEarn suma egresos de suscripción, ingresos de interés y redención', () => {
  const movs = [
    { tipo: 'egreso', monto: 100, descripcion: 'Suscripción', tipo_moneda: 'USD' },
    { tipo: 'ingreso', monto: 5, descripcion: 'Interés', tipo_moneda: 'USD' },
    { tipo: 'ingreso', monto: 50, descripcion: 'Redención', tipo_moneda: 'USD' },
  ]
  const r = resumenEarn(movs)
  assert.equal(r.invertido, 100)
  assert.equal(r.recompensas, 5)
  assert.equal(r.redimido, 50)
  assert.equal(r.salidasNetas, 5 + 50 - 100)
})

await t('activosEarnPorMoneda agrupa por moneda sin consolidar (D4)', () => {
  const movs = [
    { tipo: 'egreso', monto: 100, descripcion: 'Suscripción', tipo_moneda: 'BTC' },
    { tipo: 'ingreso', monto: 5, descripcion: 'Interés', tipo_moneda: 'BTC' },
    { tipo: 'egreso', monto: 200, descripcion: 'Suscripción', tipo_moneda: 'USDT' },
  ]
  const activos = activosEarnPorMoneda(movs)
  assert.equal(activos.length, 2)
  const btc = activos.find((a) => a.moneda === 'BTC')
  assert.equal(btc.invertido, 100)
  assert.equal(btc.rendimiento, 5)
})

await t('activosConSaldo filtra solo los con algún valor distinto de cero', () => {
  const activos = [
    { moneda: 'BTC', saldo: 0, invertido: 0, rendimiento: 0, redimido: 0 },
    { moneda: 'ETH', saldo: 1, invertido: 0, rendimiento: 0, redimido: 0 },
  ]
  const filtrados = activosConSaldo(activos)
  assert.equal(filtrados.length, 1)
  assert.equal(filtrados[0].moneda, 'ETH')
})

// =====================================================================
// Bloque 3: cálculos puros
// =====================================================================
console.log('\n-- cálculos puros (wallets-datos.js) --')

await t('saldosPorMoneda agrupa y ordena alfabéticamente', () => {
  const movs = [
    { tipo_moneda: 'USDT', tipo: 'ingreso', monto: 100 },
    { tipo_moneda: 'BTC', tipo: 'egreso', monto: 0.5 },
    { tipo_moneda: 'USDT', tipo: 'egreso', monto: 30 },
  ]
  const saldos = saldosPorMoneda(movs)
  assert.equal(saldos.length, 2)
  assert.deepEqual(saldos[0].moneda, 'BTC')
  assert.deepEqual(saldos[0].monto, -0.5)
  assert.deepEqual(saldos[1].moneda, 'USDT')
  assert.deepEqual(saldos[1].monto, 70)
})

await t('analizarWallet reconstruye saldos iniciales por moneda', () => {
  const movs = [
    { fecha: '2026-01-15', tipo_moneda: 'BTC', tipo: 'ingreso', monto: 1 },
    { fecha: '2026-01-10', tipo_moneda: 'BTC', tipo: 'egreso', monto: 0.2 },
  ]
  const saldosFinales = [{ moneda: 'BTC', monto: 0.8 }]
  const analisis = analizarWallet(movs, saldosFinales, () => true)
  assert.equal(analisis.apertura.length, 1)
  assert.equal(analisis.apertura[0].moneda, 'BTC')
  assert.equal(analisis.apertura[0].monto, 0)  // apertura = 0.8 - 1 + 0.2
})

await t('analizarWallet filtra por período sin perder el saldo inicial real', () => {
  const movs = [
    { fecha: '2026-02-01', tipo_moneda: 'BTC', tipo: 'ingreso', monto: 0.5 },
    { fecha: '2026-01-10', tipo_moneda: 'BTC', tipo: 'ingreso', monto: 1 },
  ]
  const saldosFinales = [{ moneda: 'BTC', monto: 1.5 }]
  const analisis = analizarWallet(movs, saldosFinales, (m) => m.fecha.startsWith('2026-02'))
  // Solo entra el de febrero, pero el saldo inicial debe ser 1 (lo que había en enero)
  assert.equal(analisis.porMoneda[0].saldoInicial, 1)
  assert.equal(analisis.porMoneda[0].saldoFinal, 1.5)
})

// =====================================================================
// Bloque 4: capa de datos contra el doble de Supabase
// =====================================================================
console.log('\n-- capa de datos contra el doble de Supabase --')

limpiarRespuestas()

await t('listarProveedores filtra por empresa y deleted_at (D7)', () => {
  listarProveedores('E1')
  const c = ultima()
  assert.equal(c.tabla, 'wallet_providers')
  assert.ok(c.filtros.some((f) => f.columna === 'empresa_id' && f.valor === 'E1'))
  assert.ok(c.filtros.some((f) => f.columna === 'deleted_at' && f.valor === null))
})

await t('obtenerProveedor usa maybeSingle', () => {
  obtenerProveedor('P1')
  const c = ultima()
  assert.equal(c.tabla, 'wallet_providers')
  assert.equal(c.single, 'maybe')
})

await t('crearProveedor inserta solo columnas reales', () => {
  crearProveedor({ empresaId: 'E1', tipo: 'cripto', nombreProveedor: 'Binance', userId: 'U1' })
  const c = ultima()
  assert.equal(c.tabla, 'wallet_providers')
  assert.equal(c.operacion, 'insert')
  assert.deepEqual(Object.keys(c.payload).sort(), [
    'created_by', 'empresa_id', 'nombre_proveedor', 'tipo',
  ])
})

await t('borrarProveedor es lógico: UPDATE deleted_at, nunca DELETE físico', () => {
  borrarProveedor('P1')
  const c = ultima()
  assert.equal(c.operacion, 'update')
  assert.deepEqual(Object.keys(c.payload), ['deleted_at'])
})

await t('listarWallets lee desde la vista con saldo_total y monedas_distintas', () => {
  listarWallets('E1')
  const c = ultima()
  assert.equal(c.tabla, 'wallets_view')
  assert.ok(c.select.includes('saldo_total'))
  assert.ok(c.select.includes('monedas_distintas'))
})

await t('obtenerWallet lee desde la vista', () => {
  obtenerWallet('W1')
  const c = ultima()
  assert.equal(c.tabla, 'wallets_view')
  assert.equal(c.single, 'maybe')
})

await t('crearWallet copia el tipo del proveedor (congelado, D12)', async () => {
  await crearWallet({
    empresaId: 'E1', proveedorId: 'P1', tipoProveedor: 'cripto',
    nombreWallet: 'Mi Wallet', direccion: null, tipoMoneda: 'BTC',
    saldos: [], fechaApertura: '2026-01-01', userId: 'U1',
  })
  const c = ultima()
  assert.equal(c.tabla, 'wallets')
  assert.equal(c.operacion, 'insert')
  assert.equal(c.payload.tipo, 'cripto')
})

await t('crearWallet crea wallet_saldos y movimientos si hay saldo inicial', async () => {
  const m = marca()
  await crearWallet({
    empresaId: 'E1', proveedorId: 'P1', tipoProveedor: 'cripto',
    nombreWallet: 'Mi Wallet', direccion: null, tipoMoneda: 'BTC',
    saldos: [{ moneda: 'BTC', monto: 0.5 }], fechaApertura: '2026-01-01', userId: 'U1',
  })
  const ops = desde(m).map((c) => ({ tabla: c.tabla, op: c.operacion }))
  assert.ok(ops.some((o) => o.tabla === 'wallets' && o.op === 'insert'))
  assert.ok(ops.some((o) => o.tabla === 'wallet_saldos' && o.op === 'insert'))
  assert.ok(ops.some((o) => o.tabla === 'movimientos_wallet' && o.op === 'insert'))
})

await t('listarSaldos no filtra deleted_at porque wallet_saldos no lo tiene', () => {
  listarSaldos('W1')
  const c = ultima()
  assert.equal(c.tabla, 'wallet_saldos')
  assert.ok(!c.filtros.some((f) => f.columna === 'deleted_at'))
})

await t('fijarSaldo usa upsert con PK compuesta (wallet_id,moneda)', async () => {
  await fijarSaldo('W1', 'BTC', 0.8)
  const c = ultima()
  assert.equal(c.operacion, 'upsert')
  assert.equal(c.onConflict, 'wallet_id,moneda')
})

await t('listarMovimientosWallet lee la vista, ordenado por fecha DESC', () => {
  listarMovimientosWallet('W1')
  const c = ultima()
  assert.equal(c.tabla, 'movimientos_wallet_view')
  assert.ok(c.orden.some((o) => o.columna === 'fecha' && !o.ascendente))
})

await t('crearMovimientoWallet inserta tipo, monto y tipo_moneda', async () => {
  await crearMovimientoWallet({
    empresaId: 'E1', proveedorId: 'P1', walletId: 'W1',
    fecha: '2026-01-15', descripcion: 'Depósito', tipo: 'ingreso',
    monto: 0.5, tipoMoneda: 'BTC', userId: 'U1',
  })
  const c = ultima()
  assert.equal(c.tabla, 'movimientos_wallet')
  assert.equal(c.payload.tipo, 'ingreso')
  assert.equal(c.payload.monto, 0.5)
  assert.equal(c.payload.tipo_moneda, 'BTC')
})

await t('borrarMovimientoWallet es lógico', () => {
  borrarMovimientoWallet('M1')
  const c = ultima()
  assert.equal(c.operacion, 'update')
  assert.deepEqual(Object.keys(c.payload), ['deleted_at'])
})

await t('recalcularSaldosWallet lee TODOS los movimientos y recalcula', async () => {
  responderConDatos('movimientos_wallet', 'select', [
    { tipo_moneda: 'BTC', tipo: 'ingreso', monto: 1 },
    { tipo_moneda: 'BTC', tipo: 'egreso', monto: 0.2 },
  ])
  const { saldos, descuadres } = await recalcularSaldosWallet('W1')
  assert.equal(saldos.length, 1)
  assert.equal(saldos[0].moneda, 'BTC')
  assert.equal(saldos[0].monto, 0.8)
  assert.equal(descuadres.length, 0)
})

await t('recalcularSaldosWallet detecta saldos negativos sin inventar ceros', async () => {
  responderConDatos('movimientos_wallet', 'select', [
    { tipo_moneda: 'BTC', tipo: 'egreso', monto: 1 },  // sale -1
  ])
  const { saldos, descuadres } = await recalcularSaldosWallet('W1')
  assert.equal(saldos.length, 0, 'no debe guardar el saldo negativo')
  assert.equal(descuadres.length, 1)
  assert.ok(descuadres[0].motivo.includes('negativo'))
})

// =====================================================================
// Bloque 5: verificación estructural
// =====================================================================
console.log('\n-- esquema: lo que el código consulta existe de verdad --')

await t('se grabaron consultas (el doble funciona)', () => {
  assert.ok(consultas.length > 0)
})

await t('cada consulta apunta a una tabla o vista conocida', () => {
  for (const c of consultas) {
    assert.ok(COLUMNAS[c.tabla], `fuente desconocida: ${c.tabla}`)
  }
})

await t('cada columna de cada select existe en su fuente', () => {
  for (const c of consultas) {
    if (!c.select || c.select === '*') continue
    for (const bruto of c.select.split(',')) {
      const col = bruto.trim().split(':').pop().trim()
      if (!col) continue
      assert.ok(
        COLUMNAS[c.tabla].includes(col),
        `${c.tabla}.select pide "${col}", que no existe en el esquema`
      )
    }
  }
})

await t('ninguna consulta ni payload usa columnas inventadas', () => {
  const texto = JSON.stringify(consultas)
  for (const invento of INVENTADAS) {
    assert.ok(
      !texto.includes(invento),
      `la capa de datos usa "${invento}"`,
    )
  }
})

await t('las tablas con deleted_at se filtran siempre (D7)', () => {
  for (const c of consultas) {
    if (c.operacion !== 'select') continue
    if (TABLAS_CON_BORRADO.includes(c.tabla)) {
      assert.ok(
        c.filtros.some((f) => f.columna === 'deleted_at'),
        `${c.tabla}: falta el filtro deleted_at (D7)`,
      )
    }
  }
})

// =====================================================================
console.log(
  `\n${ok} comprobaciones OK` + (fallos.length ? `, ${fallos.length} FALLOS` : '')
)
if (fallos.length) process.exitCode = 1
