/**
 * Adaptador de datos con forma del SDK de Base44 (FASE 13, decisión D8).
 *
 * D8 eliminó los campos desnormalizados (`empresa_nombre`, `banco_nombre`,
 * `cuenta_numero`, `wallet_direccion`…) y los reemplazó por vistas que hacen el
 * JOIN. Este archivo es la otra mitad de esa decisión: los módulos de las fases
 * 14-16 llaman aquí y escriben una sola forma de acceso, en vez de repetir
 * `supabase.from(...).select(...).is('deleted_at', null)` en cada pantalla.
 *
 * QUÉ RESUELVE, en concreto:
 *
 * 1. **El filtro de borrado lógico.** Con `deleted_at` (D7), olvidar
 *    `.is('deleted_at', null)` en una consulta nueva hace reaparecer registros
 *    borrados. Aquí el filtro lo aplica el adaptador según la fuente, no cada
 *    llamador: es imposible olvidarlo.
 * 2. **Errores.** El SDK que se está reemplazando lanzaba; `supabase-js`
 *    devuelve `{ data, error }`. Este adaptador lanza, para que un fallo no se
 *    convierta en un `data` nulo silencioso que la UI pinta como "sin datos".
 * 3. **Los nombres de vista.** `movimientos` es la tabla; lo que se lee es
 *    `movimientos_view`, que trae `empresa_nombre`, `banco_nombre` y
 *    `cuenta_numero` ya resueltos.
 *
 * NO es un ORM ni un reemplazo de las vistas: no hace joins por su cuenta, no
 * convierte monedas (D4) y no decide permisos — eso es del RLS.
 */
import { supabase } from '@/lib/supabase'

/**
 * Registro de fuentes: qué hay detrás de cada nombre y cómo se filtra.
 *
 * `borrado: true` significa que la tabla tiene `deleted_at` y el adaptador debe
 * filtrar. Las vistas ya filtran por dentro (`where ... deleted_at is null`), así
 * que ahí se pone `false` para no pedir una columna que la vista no expone.
 *
 * `soloLectura: true` en las vistas: escribir en `movimientos_view` fallaría en
 * Postgres con un error opaco. Mejor rechazarlo aquí con un mensaje claro.
 */
const FUENTES = {
  empresas: { tabla: 'empresas', borrado: true, escritura: true },
  perfiles: { tabla: 'profiles', borrado: false, escritura: true },
  usuarios_empresa: { tabla: 'user_empresa', borrado: true, escritura: true },

  bancos: { tabla: 'bancos', borrado: true, escritura: true },
  cuentas: { tabla: 'cuentas', borrado: true, escritura: true },
  movimientos: { tabla: 'movimientos', borrado: true, escritura: true },

  brokers: { tabla: 'brokers', borrado: true, escritura: true },
  movimientos_broker: { tabla: 'movimientos_broker', borrado: true, escritura: true },
  activos_broker: { tabla: 'activos_broker', borrado: true, escritura: true },
  precios_activo: { tabla: 'precios_activo', borrado: true, escritura: true },

  wallet_providers: { tabla: 'wallet_providers', borrado: true, escritura: true },
  wallets: { tabla: 'wallets', borrado: true, escritura: true },
  wallet_saldos: { tabla: 'wallet_saldos', borrado: false, escritura: true },
  movimientos_wallet: { tabla: 'movimientos_wallet', borrado: true, escritura: true },

  import_jobs: { tabla: 'import_jobs', borrado: false, escritura: true },

  // Vistas (D8): traen los nombres desnormalizados ya resueltos.
  cuentas_detalle: { tabla: 'cuentas_view', borrado: false, soloLectura: true },
  movimientos_detalle: { tabla: 'movimientos_view', borrado: false, soloLectura: true },
  movimientos_broker_detalle: { tabla: 'movimientos_broker_view', borrado: false, soloLectura: true },
  activos_broker_detalle: { tabla: 'activos_broker_view', borrado: false, soloLectura: true },
  precios_activo_detalle: { tabla: 'precios_activo_view', borrado: false, soloLectura: true },
  wallets_detalle: { tabla: 'wallets_view', borrado: false, soloLectura: true },
  movimientos_wallet_detalle: { tabla: 'movimientos_wallet_view', borrado: false, soloLectura: true },
}

/** Tablas publicadas para realtime (migración 0007). Suscribirse a otra cosa
 * devuelve un canal que nunca emite, así que se avisa en vez de fallar mudo. */
const EN_REALTIME = new Set([
  'bancos',
  'cuentas',
  'movimientos',
  'brokers',
  'movimientos_broker',
  'activos_broker',
  'precios_activo',
  'wallet_providers',
  'wallets',
  'wallet_saldos',
  'movimientos_wallet',
])

function fuente(nombre) {
  const f = FUENTES[nombre]
  if (!f) {
    throw new Error(
      `Fuente desconocida: "${nombre}". ` +
        `Las definidas están en FUENTES (src/lib/db.js).`
    )
  }
  return f
}

/** Error uniforme: incluye la fuente y el mensaje original de Postgres/PostgREST. */
function fallo(nombre, accion, error) {
  const err = new Error(`[db.${accion}] ${nombre}: ${error?.message ?? 'error desconocido'}`)
  err.fuente = nombre
  err.accion = accion
  err.causa = error
  return err
}

function exigirEscritura(nombre, f) {
  if (f.soloLectura) {
    throw new Error(
      `"${nombre}" es una vista de solo lectura: escribe en la tabla ` +
        `correspondiente (la vista existe para leer los nombres ya resueltos, D8).`
    )
  }
}

/**
 * Aplica los filtros al query builder.
 *
 * Valores admitidos por filtro (los que necesitan las fases 14-16):
 *   valor suelto        → igualdad (`eq`)
 *   null                → `is null`
 *   `{ in: [...] }`     → `in`
 *   `{ gte, lte }`      → rango (para el MonthFilter: fecha entre dos extremos)
 *   `{ ilike: '%txt%' }`→ búsqueda de texto (buscador de las tablas)
 *   `{ neq: v }`        → distinto
 *
 * El `eq` sin lista blanca de campos es deliberado: los filtros los escribe el
 * código de la aplicación, nunca llegan de la URL. Si algún día llegan del
 * usuario, hay que validar el nombre de columna aquí.
 */
function aplicarFiltros(query, filtros) {
  let q = query
  for (const [campo, valor] of Object.entries(filtros ?? {})) {
    if (valor === undefined) continue

    if (valor === null) {
      q = q.is(campo, null)
    } else if (Array.isArray(valor)) {
      q = q.in(campo, valor)
    } else if (valor && typeof valor === 'object') {
      if ('in' in valor) q = q.in(campo, valor.in)
      if ('neq' in valor) q = q.neq(campo, valor.neq)
      if ('gte' in valor) q = q.gte(campo, valor.gte)
      if ('lte' in valor) q = q.lte(campo, valor.lte)
      if ('ilike' in valor) q = q.ilike(campo, valor.ilike)
      if ('is' in valor) q = q.is(campo, valor.is)
    } else {
      q = q.eq(campo, valor)
    }
  }
  return q
}

/**
 * Lista registros de una fuente.
 *
 * @param {string} nombre   clave de FUENTES ('movimientos', 'cuentas_detalle'…)
 * @param {object} opciones
 * @param {object} opciones.filtros  ver `aplicarFiltros`
 * @param {string} opciones.orden    columna; por defecto `created_at` descendente
 * @param {boolean} opciones.ascendente
 * @param {number} opciones.limite
 * @param {number} opciones.desde    para la tabla paginada (rango `range`)
 * @param {string} opciones.columnas proyección; por defecto todas
 */
export async function listar(nombre, opciones = {}) {
  const f = fuente(nombre)
  const { filtros, orden = 'created_at', ascendente = false, limite, desde, columnas = '*' } = opciones

  let q = supabase.from(f.tabla).select(columnas)
  if (f.borrado) q = q.is('deleted_at', null)
  q = aplicarFiltros(q, filtros)
  q = q.order(orden, { ascending: ascendente })
  if (typeof desde === 'number' && typeof limite === 'number') {
    q = q.range(desde, desde + limite - 1)
  } else if (typeof limite === 'number') {
    q = q.limit(limite)
  }

  const { data, error } = await q
  if (error) throw fallo(nombre, 'listar', error)
  return data ?? []
}

/** Un registro por id. Devuelve `null` si no existe o el RLS no lo deja ver. */
export async function obtener(nombre, id, { columnas = '*' } = {}) {
  const f = fuente(nombre)
  if (!id) return null

  let q = supabase.from(f.tabla).select(columnas).eq('id', id)
  if (f.borrado) q = q.is('deleted_at', null)

  const { data, error } = await q.maybeSingle()
  if (error) throw fallo(nombre, 'obtener', error)
  return data ?? null
}

/**
 * Crea un registro y devuelve la fila creada.
 *
 * `empresa_id` y `created_by` **no** se rellenan aquí: los pone el llamador
 * (o el default del esquema). Inventarlos desde el adaptador metería una
 * suposición de sesión en la capa de datos y rompería el RLS de forma difícil
 * de diagnosticar.
 */
export async function crear(nombre, datos) {
  const f = fuente(nombre)
  exigirEscritura(nombre, f)

  const { data, error } = await supabase.from(f.tabla).insert(datos).select().single()
  if (error) throw fallo(nombre, 'crear', error)
  return data
}

/**
 * Inserta varios registros de una vez. Es lo que usa la importación de PDFs
 * (FASE 17), donde una sola llamada por movimiento multiplicaría la latencia
 * por el número de filas del extracto.
 */
export async function crearMuchos(nombre, filas) {
  const f = fuente(nombre)
  exigirEscritura(nombre, f)
  if (!filas?.length) return []

  const { data, error } = await supabase.from(f.tabla).insert(filas).select()
  if (error) throw fallo(nombre, 'crearMuchos', error)
  return data ?? []
}

/** Actualiza por id y devuelve la fila resultante. */
export async function actualizar(nombre, id, cambios) {
  const f = fuente(nombre)
  exigirEscritura(nombre, f)

  const { data, error } = await supabase
    .from(f.tabla)
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw fallo(nombre, 'actualizar', error)
  return data
}

/**
 * Borra por id.
 *
 * Por defecto `logico: true` → `deleted_at = now()`, que es lo que manda D7. El
 * borrado físico existe porque algunas tablas no tienen la columna
 * (`wallet_saldos`, `import_jobs`) y porque las FKs ya están en `on delete
 * cascade`; úsalo solo donde corresponda.
 */
export async function borrar(nombre, id, { logico } = {}) {
  const f = fuente(nombre)
  exigirEscritura(nombre, f)
  const usarLogico = logico ?? f.borrado

  const q = usarLogico
    ? supabase.from(f.tabla).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    : supabase.from(f.tabla).delete().eq('id', id)

  const { error } = await q
  if (error) throw fallo(nombre, 'borrar', error)
  return true
}

/** Cuenta filas sin traerlas. Para tarjetas y contadores. */
export async function contar(nombre, filtros) {
  const f = fuente(nombre)
  let q = supabase.from(f.tabla).select('id', { count: 'exact', head: true })
  if (f.borrado) q = q.is('deleted_at', null)
  q = aplicarFiltros(q, filtros)

  const { count, error } = await q
  if (error) throw fallo(nombre, 'contar', error)
  return count ?? 0
}

/**
 * Suscripción realtime a una tabla.
 *
 * Devuelve una función para desuscribirse y **hay que llamarla** al desmontar:
 * sin eso, cada visita a la pantalla deja un canal Postgres abierto hasta que se
 * cierra la pestaña.
 *
 * Avisa si la tabla no está en la publicación `supabase_realtime`, en vez de
 * devolver un canal que nunca emite (es el fallo que tuvo la FASE 12 al
 * suscribirse a `ramas`, una tabla que ni existe).
 */
export function suscribir(nombre, callback) {
  const f = fuente(nombre)
  if (!EN_REALTIME.has(f.tabla)) {
    console.warn(
      `[db.suscribir] "${f.tabla}" no está en la publicación supabase_realtime ` +
        `(migración 0007): el canal no emitirá nada.`
    )
  }

  const canal = supabase
    .channel(`db:${f.tabla}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: f.tabla }, (payload) => {
      callback?.(payload)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}

/** Nombres disponibles, para autocompletado mental y para diagnóstico. */
export const FUENTES_DISPONIBLES = Object.keys(FUENTES)

/** Acceso al cliente crudo, para lo que el adaptador no cubre (Storage, Auth,
 * RPC). Es una escotilla de salida, no la vía normal. */
export { supabase }
