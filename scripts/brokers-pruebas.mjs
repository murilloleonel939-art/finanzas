// Prueba de humo del módulo de brokers.
//
// Ejecuta la ruta REAL del navegador: `src/lib/brokers-datos.js` importa
// `@/lib/supabase` (que exige `import.meta.env` y una anon key real, cosas que
// no existen en Node), así que `scripts/brokers-humo.mjs` compila el código
// original con esbuild sustituyendo solo ese import por un doble.
//
// Lo que comprueba, y por qué `npm run build` no lo ve: las columnas de
// PostgREST son strings en runtime, así que una columna inventada compila sin
// queja y solo revienta en el navegador con `column does not exist`. La primera
// versión de una revisión anterior hizo exactamente eso.
import assert from 'node:assert/strict'

import {
  listarBrokers,
  obtenerBroker,
  crearBroker,
  borrarBroker,
  listarMovimientosBroker,
  crearMovimientoBroker,
  borrarMovimientoBroker,
  listarActivos,
  crearActivo,
  borrarActivo,
  listarPrecios,
  calcularTotalesBroker,
} from 'brokers-datos'
import {
  brokersPorTipo,
  brokerDelCatalogo,
  monedaSugerida,
  resolverNombreBroker,
  OTRO_BROKER,
  NOMBRES_BROKER,
  BROKERS,
  TIPOS_ACTIVO,
  etiquetaTipoActivo,
} from 'brokers-lib'
import { hoyLocal } from 'utils-lib'
import { consultas, responder, ultima } from 'supabase-doble'

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

/** Nº de consultas grabadas: permite medir "desde aquí" sin vaciar el log. */
const marca = () => consultas.length
const desde = (m) => consultas.slice(m)

// ---------------------------------------------------------------------
// Esquema esperado, leído a mano de supabase/migrations/0002, 0003 y 0005.
// Se declara aparte como fuente de verdad INDEPENDIENTE del código: si se
// dedujera de lo que el código consulta, la prueba no probaría nada.
// ---------------------------------------------------------------------
const COLUMNAS = {
  brokers: ['id', 'empresa_id', 'nombre_broker', 'moneda', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
  movimientos_broker: [
    'id', 'empresa_id', 'broker_id', 'fecha', 'descripcion', 'tipo', 'monto',
    'cantidad', 'valor_unitario', 'external_id', 'source_file', 'created_by',
    'created_at', 'updated_at', 'deleted_at',
  ],
  activos_broker: [
    'id', 'empresa_id', 'broker_id', 'nombre_activo', 'tipo_activo', 'cantidad',
    'valor_unitario', 'moneda', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  ],
  precios_activo: [
    'id', 'empresa_id', 'broker_id', 'activo_id', 'fecha', 'precio_cierre',
    'precio_anterior', 'variacion_pct', 'moneda', 'created_by', 'created_at',
    'updated_at', 'deleted_at',
  ],
  movimientos_broker_view: [
    'id', 'empresa_id', 'empresa_nombre', 'broker_id', 'broker_nombre', 'broker_moneda',
    'fecha', 'descripcion', 'tipo', 'monto', 'cantidad', 'valor_unitario',
    'external_id', 'created_at',
  ],
  activos_broker_view: [
    'id', 'empresa_id', 'empresa_nombre', 'broker_id', 'broker_nombre', 'nombre_activo',
    'tipo_activo', 'cantidad', 'valor_unitario', 'moneda', 'valor_total', 'created_at', 'updated_at',
  ],
  precios_activo_view: [
    'id', 'empresa_id', 'empresa_nombre', 'broker_id', 'broker_nombre', 'activo_id',
    'nombre_activo', 'tipo_activo', 'fecha', 'precio_cierre', 'precio_anterior',
    'variacion_pct', 'moneda', 'created_at',
  ],
}

// Nombres que NO existen en el esquema: los que inventó la primera versión de
// una revisión anterior. Si reaparecen, esto falla.
const INVENTADAS = [
  'saldo_actual',
  'saldo_resultante',
  'concepto',
  'nombre_oficial',
  'wallet_saldos_view',
  'api_key',
]

// Tablas con `deleted_at` propio: la capa de datos debe filtrarlo (D7).
const TABLAS_CON_BORRADO = ['brokers', 'movimientos_broker', 'activos_broker', 'precios_activo']

// ---------------------------------------------------------------------
// Bloque 1: catálogo puro
// ---------------------------------------------------------------------
console.log('\n-- catálogo de brokers (src/lib/brokers.js) --')

await t('el catálogo no tiene nombres duplicados', () => {
  assert.equal(new Set(BROKERS.map((b) => b.nombre)).size, BROKERS.length)
  assert.equal(NOMBRES_BROKER.length, BROKERS.length)
})

await t('brokerDelCatalogo ignora mayúsculas y acentos', () => {
  assert.equal(brokerDelCatalogo('INTERACTIVE BROKERS').nombre, 'Interactive Brokers')
  assert.equal(brokerDelCatalogo('eToro').nombre, 'eToro')
  assert.equal(brokerDelCatalogo('NoExiste'), null)
  assert.equal(brokerDelCatalogo(''), null)
})

await t('monedaSugerida devuelve la divisa de CAJA del broker', () => {
  assert.equal(monedaSugerida('Trii'), 'COP')
  assert.equal(monedaSugerida('Degiro'), 'EUR')
  assert.equal(monedaSugerida('Inventado'), null)
})

await t('brokersPorTipo filtra, y sin tipo devuelve el catálogo entero', () => {
  const regional = brokersPorTipo('regional')
  assert.ok(regional.length > 0)
  assert.ok(regional.every((b) => b.tipo === 'regional'))
  assert.ok(regional.some((b) => b.nombre === 'Trii'))
  assert.equal(brokersPorTipo().length, BROKERS.length)
})

await t('«Otro» vacío devuelve null y con texto recorta', () => {
  assert.equal(resolverNombreBroker(OTRO_BROKER, '   '), null)
  assert.equal(resolverNombreBroker(OTRO_BROKER, ' Mi Broker '), 'Mi Broker')
  assert.equal(resolverNombreBroker('Trii', ''), 'Trii')
  assert.equal(resolverNombreBroker('', ''), null)
})

await t('el centinela «Otro» nunca se guarda tal cual', () => {
  assert.equal(OTRO_BROKER, '__otro__')
  assert.notEqual(resolverNombreBroker(OTRO_BROKER, 'X'), OTRO_BROKER)
})

await t('los 7 valores del enum tipo_activo están, ni uno más', () => {
  assert.deepEqual(
    TIPOS_ACTIVO.map((x) => x.valor),
    ['accion', 'bono', 'fondo', 'etf', 'cripto', 'cdat', 'otro']
  )
})

await t('etiquetaTipoActivo tolera valores fuera del enum', () => {
  assert.equal(etiquetaTipoActivo('etf'), 'ETF')
  assert.equal(etiquetaTipoActivo('desconocido'), 'desconocido')
  assert.equal(etiquetaTipoActivo(null), '—')
})

// ---------------------------------------------------------------------
// Bloque 2: cálculos puros del PRD §5
// ---------------------------------------------------------------------
console.log('\n-- calcularTotalesBroker (PRD §5) --')

await t('caja: ingreso suma, egreso resta', () => {
  const [usd] = calcularTotalesBroker(
    [
      { tipo: 'ingreso', monto: 1000, broker_moneda: 'USD', cantidad: null },
      { tipo: 'egreso', monto: 300, broker_moneda: 'USD', cantidad: null },
    ],
    []
  )
  assert.equal(usd.caja, 700)
  assert.equal(usd.invertido, 0)
})

await t('una operación afecta a la caja Y a lo invertido', () => {
  const [usd] = calcularTotalesBroker(
    [
      { tipo: 'ingreso', monto: 5000, broker_moneda: 'USD', cantidad: null }, // depósito
      { tipo: 'egreso', monto: 1200, broker_moneda: 'USD', cantidad: 10 },    // compra
      { tipo: 'ingreso', monto: 300, broker_moneda: 'USD', cantidad: 2 },     // venta
    ],
    []
  )
  assert.equal(usd.caja, 5000 - 1200 + 300)
  assert.equal(usd.invertido, 1200 - 300)
})

await t('los activos no se suman a la caja (efectivo no es valor de mercado)', () => {
  const [usd] = calcularTotalesBroker(
    [{ tipo: 'ingreso', monto: 1000, broker_moneda: 'USD', cantidad: null }],
    [{ moneda: 'USD', valor_total: 3000 }]
  )
  assert.equal(usd.caja, 1000)
  assert.equal(usd.valorActivos, 3000)
})

await t('subtotales por moneda, sin consolidar (D4)', () => {
  const totales = calcularTotalesBroker(
    [
      { tipo: 'ingreso', monto: 1000, broker_moneda: 'COP', cantidad: null },
      { tipo: 'ingreso', monto: 500, broker_moneda: 'USD', cantidad: null },
    ],
    [
      { moneda: 'USD', valor_total: 2500 },
      { moneda: 'USD', valor_total: 500 },
      { moneda: 'COP', valor_total: 100 },
    ]
  )
  const cop = totales.find((x) => x.moneda === 'COP')
  const usd = totales.find((x) => x.moneda === 'USD')
  assert.equal(cop.caja, 1000)
  assert.equal(cop.valorActivos, 100)
  assert.equal(usd.caja, 500)
  assert.equal(usd.valorActivos, 3000)
  assert.deepEqual(totales.map((x) => x.moneda), ['COP', 'USD'])
})

await t('caja en una divisa y activos en otra: dos líneas separadas', () => {
  const totales = calcularTotalesBroker(
    [{ tipo: 'ingreso', monto: 4000000, broker_moneda: 'COP', cantidad: null }],
    [{ moneda: 'USD', valor_total: 1000 }]
  )
  assert.equal(totales.length, 2)
  assert.equal(totales.find((x) => x.moneda === 'COP').caja, 4000000)
  assert.equal(totales.find((x) => x.moneda === 'USD').valorActivos, 1000)
})

await t('moneda ausente cae en N/A sin reventar', () => {
  const [t0] = calcularTotalesBroker([{ tipo: 'ingreso', monto: 10, cantidad: null }], [])
  assert.equal(t0.moneda, 'N/A')
})

await t('el redondeo no arrastra colas binarias de coma flotante', () => {
  const [usd] = calcularTotalesBroker(
    [
      { tipo: 'ingreso', monto: 0.1, broker_moneda: 'USD', cantidad: null },
      { tipo: 'ingreso', monto: 0.2, broker_moneda: 'USD', cantidad: null },
    ],
    []
  )
  assert.equal(usd.caja, 0.3)
})

await t('sin argumentos devuelve []', () => {
  assert.deepEqual(calcularTotalesBroker(), [])
})

// ---------------------------------------------------------------------
// Bloque 3: fecha local frente a UTC
// ---------------------------------------------------------------------
console.log('\n-- fecha local (no UTC) --')

await t('hoyLocal devuelve el día del navegador, no el de UTC', () => {
  // 2026-10-01 20:30 en Bogotá (UTC-5) ya es 2026-10-02 en UTC. Es el bug que
  // hacía que los formularios precargaran la fecha de mañana.
  const bogota = new Date('2026-10-01T20:30:00-05:00')
  assert.equal(bogota.toISOString().slice(0, 10), '2026-10-02')
  assert.equal(hoyLocal(bogota), '2026-10-01')
})

await t('hoyLocal rellena mes y día a dos dígitos', () => {
  assert.equal(hoyLocal(new Date('2026-01-05T12:00:00-05:00')), '2026-01-05')
  assert.match(hoyLocal(), /^\d{4}-\d{2}-\d{2}$/)
})

// ---------------------------------------------------------------------
// Bloque 4: capa de datos contra el doble de Supabase
// ---------------------------------------------------------------------
console.log('\n-- capa de datos contra el doble de Supabase --')

await t('listarBrokers filtra por empresa y por borrado lógico', () => {
  listarBrokers('E1')
  const c = ultima()
  assert.equal(c.tabla, 'brokers')
  assert.equal(c.operacion, 'select')
  assert.ok(c.filtros.some((f) => f.columna === 'empresa_id' && f.valor === 'E1'))
  assert.ok(c.filtros.some((f) => f.columna === 'deleted_at' && f.valor === null))
})

await t('obtenerBroker usa maybeSingle (no revienta si no hay fila)', () => {
  obtenerBroker('B1')
  const c = ultima()
  assert.equal(c.tabla, 'brokers')
  assert.ok(c.filtros.some((f) => f.columna === 'id' && f.valor === 'B1'))
  assert.equal(c.single, 'maybe')
})

await t('crearBroker inserta solo columnas reales, sin api_key ni token', () => {
  crearBroker({ empresaId: 'E1', nombreBroker: 'Trii', moneda: 'COP', userId: 'U1' })
  const c = ultima()
  assert.equal(c.tabla, 'brokers')
  assert.equal(c.operacion, 'insert')
  assert.deepEqual(
    Object.keys(c.payload).sort(),
    ['created_by', 'empresa_id', 'moneda', 'nombre_broker']
  )
})

await t('borrarBroker es lógico: UPDATE de deleted_at, nunca DELETE físico', () => {
  borrarBroker('B1')
  const c = ultima()
  assert.equal(c.operacion, 'update')
  assert.deepEqual(Object.keys(c.payload), ['deleted_at'])
  assert.ok(typeof c.payload.deleted_at === 'string')
})

await t('borrarBroker no toca los hijos (D19: sin cascada de borrados)', () => {
  const m = marca()
  borrarBroker('B1')
  assert.equal(desde(m).length, 1, 'borrar un broker disparó más de una consulta')
})

await t('listarMovimientosBroker lee la vista, con descripcion y orden por fecha', () => {
  listarMovimientosBroker('B1')
  const c = ultima()
  assert.equal(c.tabla, 'movimientos_broker_view')
  assert.ok(c.filtros.some((f) => f.columna === 'broker_id' && f.valor === 'B1'))
  assert.ok(c.orden.some((o) => o.columna === 'fecha' && o.ascendente === false))
  assert.ok(c.select.includes('descripcion'), 'debe leer `descripcion`')
  assert.ok(!c.select.includes('concepto'), '`concepto` no existe en esta tabla')
})

// --- El CHECK `mov_broker_cantidad_valor_coherentes` de la 0003 ---

await t('caja: sin cantidad ni valor unitario, los dos van NULL', async () => {
  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01',
    descripcion: 'Depósito', tipo: 'ingreso', monto: 1000, userId: 'U1',
  })
  const c = ultima()
  assert.equal(c.tabla, 'movimientos_broker')
  assert.equal(c.payload.cantidad, null)
  assert.equal(c.payload.valor_unitario, null)
})

await t('operación: cantidad y valor unitario van los DOS', async () => {
  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'Compra VOO',
    tipo: 'egreso', monto: 1200, cantidad: 10, valorUnitario: 120, userId: 'U1',
  })
  const c = ultima()
  assert.equal(c.payload.cantidad, 10)
  assert.equal(c.payload.valor_unitario, 120)
})

await t('venta se guarda como ingreso; compra como egreso (PRD §5)', async () => {
  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'Venta',
    tipo: 'ingreso', monto: 300, cantidad: 2, valorUnitario: 150, userId: 'U1',
  })
  assert.equal(ultima().payload.tipo, 'ingreso')

  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'Compra',
    tipo: 'egreso', monto: 300, cantidad: 2, valorUnitario: 150, userId: 'U1',
  })
  assert.equal(ultima().payload.tipo, 'egreso')
})

await t('el monto puede ser 0 (el CHECK es monto >= 0, no > 0)', async () => {
  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'Ajuste',
    tipo: 'ingreso', monto: 0, userId: 'U1',
  })
  assert.equal(ultima().payload.monto, 0)
})

await t('operación con SOLO cantidad LANZA en vez de guardarse como caja', async () => {
  let lanzo = false
  try {
    await crearMovimientoBroker({
      empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'A medias',
      tipo: 'egreso', monto: 1200, cantidad: 10, userId: 'U1',
    })
  } catch (e) {
    lanzo = true
    assert.match(e.message, /valor unitario/i)
  }
  assert.ok(lanzo, 'una operación sin valor unitario se guardó en silencio')
})

await t('operación con SOLO valor unitario LANZA (caso simétrico)', async () => {
  let lanzo = false
  try {
    await crearMovimientoBroker({
      empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'A medias',
      tipo: 'egreso', monto: 1200, valorUnitario: 120, userId: 'U1',
    })
  } catch (e) {
    lanzo = true
    assert.match(e.message, /cantidad/i)
  }
  assert.ok(lanzo, 'una operación sin cantidad se guardó en silencio')
})

await t('una operación incompleta no llega a construir el INSERT', async () => {
  const m = marca()
  await crearMovimientoBroker({
    empresaId: 'E1', brokerId: 'B1', fecha: '2026-10-01', descripcion: 'X',
    tipo: 'egreso', monto: 1, cantidad: 1, valorUnitario: null, userId: 'U1',
  }).catch(() => {})
  assert.equal(desde(m).filter((c) => c.operacion === 'insert').length, 0)
})

await t('borrarMovimientoBroker es lógico', () => {
  borrarMovimientoBroker('M1')
  const c = ultima()
  assert.equal(c.tabla, 'movimientos_broker')
  assert.equal(c.operacion, 'update')
  assert.deepEqual(Object.keys(c.payload), ['deleted_at'])
})

await t('crearActivo NO escribe valor_total (es columna de la vista)', () => {
  crearActivo({
    empresaId: 'E1', brokerId: 'B1', nombreActivo: 'VOO', tipoActivo: 'etf',
    cantidad: 10, valorUnitario: 120, moneda: 'USD', userId: 'U1',
  })
  const c = ultima()
  assert.equal(c.tabla, 'activos_broker')
  assert.equal(c.payload.tipo_activo, 'etf')
  assert.ok(!('valor_total' in c.payload), 'valor_total no es columna de activos_broker')
})

await t('el 23505 de ticker duplicado se traduce a un mensaje legible', async () => {
  responder('activos_broker', 'insert', { code: '23505', message: 'duplicate key value' })
  let lanzo = false
  try {
    await crearActivo({
      empresaId: 'E1', brokerId: 'B1', nombreActivo: 'VOO', tipoActivo: 'etf',
      cantidad: 1, valorUnitario: 1, moneda: 'USD', userId: 'U1',
    })
  } catch (e) {
    lanzo = true
    assert.ok(!e.message.includes('duplicate key'), 'se filtró el error crudo de Postgres')
    assert.match(e.message, /VOO/)
  }
  assert.ok(lanzo, 'el 23505 no se tradujo')
})

await t('listarActivos pide valor_total a la VISTA', () => {
  listarActivos('B1')
  const c = ultima()
  assert.equal(c.tabla, 'activos_broker_view')
  assert.ok(c.select.includes('valor_total'))
})

await t('listarPrecios lee precios_activo_view, ordenado por fecha', () => {
  listarPrecios('B1')
  const c = ultima()
  assert.equal(c.tabla, 'precios_activo_view')
  assert.ok(c.orden.some((o) => o.columna === 'fecha' && o.ascendente === false))
})

await t('borrarActivo es lógico', () => {
  borrarActivo('A1')
  const c = ultima()
  assert.equal(c.tabla, 'activos_broker')
  assert.equal(c.operacion, 'update')
  assert.deepEqual(Object.keys(c.payload), ['deleted_at'])
})

// ---------------------------------------------------------------------
// Bloque 5: verificación estructural de TODO lo consultado
// (va al final: necesita que la capa de datos ya haya corrido)
// ---------------------------------------------------------------------
console.log('\n-- esquema: lo que el código consulta existe de verdad --')

await t('se grabaron consultas (el doble funciona)', () => {
  assert.ok(consultas.length > 0, 'el doble no grabó ninguna consulta')
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
    assert.ok(!texto.includes(invento), `la capa de datos usa "${invento}"`)
  }
})

await t('las tablas con deleted_at se filtran siempre (D7)', () => {
  for (const c of consultas) {
    if (c.operacion !== 'select') continue
    if (TABLAS_CON_BORRADO.includes(c.tabla)) {
      assert.ok(
        c.filtros.some((f) => f.columna === 'deleted_at'),
        `${c.tabla}: falta el filtro deleted_at (D7)`
      )
    }
  }
})

// ---------------------------------------------------------------------
console.log(
  `\n${ok} comprobaciones OK` + (fallos.length ? `, ${fallos.length} FALLOS` : '')
)
if (fallos.length) process.exitCode = 1
