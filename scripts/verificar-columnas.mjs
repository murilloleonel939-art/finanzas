/**
 * Verificador de columnas.
 *
 * POR QUÉ EXISTE: `npm run build` solo valida sintaxis. Las columnas de
 * PostgREST son strings (`select('saldo_actual')`) y no hay tipos que las
 * comprueben, así que una columna inventada compila perfectamente y solo
 * revienta en el navegador con `column does not exist`.
 *
 * Este script lee las migraciones (fuente de verdad del esquema) y comprueba
 * contra ellas cada columna que el código menciona. No sustituye a probar la
 * app contra Supabase, pero cierra el agujero que dejó pasar una revisión anterior.
 *
 * Uso:  node scripts/verificar-columnas.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const RAIZ = process.cwd()
const MIGRACIONES = join(RAIZ, 'supabase/migrations')
const SRC = join(RAIZ, 'src')

// ---------------------------------------------------------------------
// 1. Esquema: qué columnas tiene cada tabla y cada vista
// ---------------------------------------------------------------------
const esquema = new Map() // nombre -> Set(columnas)

function registrar(nombre, columnas) {
  esquema.set(nombre, new Set(columnas))
}

/** Quita comentarios de línea para no confundir el parser con el texto. */
function sinComentarios(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

const TIPOS_SQL = /^(uuid|text|numeric|date|timestamptz|integer|boolean|smallint|bigint|jsonb|public\.)/

for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = sinComentarios(readFileSync(join(MIGRACIONES, archivo), 'utf8'))

  // --- Tablas: `create table [if not exists] public.X (`
  const reTabla = /create table (?:if not exists )?public\.(\w+)\s*\(/g
  let m
  while ((m = reTabla.exec(sql))) {
    const nombre = m[1]
    const resto = sql.slice(m.index + m[0].length)
    const columnas = []
    let profundidad = 0
    for (const linea of resto.split('\n')) {
      const limpia = linea.trim()
      if (profundidad === 0) {
        if (/^\)/.test(limpia)) break
        const col = /^([a-z_][a-z0-9_]*)\s+(.*)$/.exec(limpia)
        if (col && !/^(constraint|primary|unique|check|foreign)$/i.test(col[1])) {
          if (TIPOS_SQL.test(col[2])) columnas.push(col[1])
        }
      }
      // Seguir la profundidad para no leer los CHECK(...) anidados como columnas.
      for (const ch of linea) {
        if (ch === '(') profundidad++
        else if (ch === ')') profundidad--
      }
      // Un CHECK de varias líneas cierra y vuelve a 0; el break de arriba corta la tabla.
      if (profundidad < 0) break
    }
    registrar(nombre, columnas)
  }

  // --- Vistas: `create view public.X ... as select ... from`
  const reVista = /create view public\.(\w+)[\s\S]*?\bas\s+select([\s\S]*?)\bfrom\s/g
  while ((m = reVista.exec(sql))) {
    const nombre = m[1]
    const cuerpo = m[2]
    const columnas = []
    for (const linea of cuerpo.split('\n')) {
      const limpia = linea.trim().replace(/,$/, '')
      if (!limpia) continue
      // `x as alias` / `expr as alias` → alias
      const conAlias = /\bas\s+([a-z_][a-z0-9_]*)\s*$/i.exec(limpia)
      if (conAlias) {
        columnas.push(conAlias[1])
        continue
      }
      // `c.numero_cuenta` → numero_cuenta
      const simple = /(?:^|[,\s])?([a-z_][a-z0-9_]*)\s*$/.exec(limpia)
      if (simple && simple[1]) columnas.push(simple[1])
    }
    registrar(nombre, columnas)
  }
}

// ---------------------------------------------------------------------
// 2. Uso en el código: cada columna mencionada
// ---------------------------------------------------------------------
const problemas = []
const avisos = []

function archivosJs(dir) {
  const salida = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...archivosJs(ruta))
    else if (['.js', '.jsx'].includes(extname(ruta))) salida.push(ruta)
  }
  return salida
}

const CAMPOS_POSTGREST = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'order', 'filter', 'contains', 'match']

for (const ruta of archivosJs(SRC)) {
  const codigo = readFileSync(ruta, 'utf8')
  const corta = ruta.replace(RAIZ + '/', '')

  // Encadenar .from('x') ... .select('...') ... .eq('col', ...)
  // El cuerpo se corta en el siguiente `.from(` para no atribuir a una tabla
  // las columnas de otra: en un Promise.all hay varios `.from()` seguidos y sin
  // este corte se mezclan (falso positivo).
  //
  // Cuando el argumento NO es un literal (`.from(tabla)`, un helper que recibe
  // el nombre por parámetro) no hay forma de saber qué tabla es: se omite en
  // vez de inventar, porque el script existe para dar ceros falsos cero, no
  // falsos positivos.
  const reCadena = /\.from\(([^)]*)\)([\s\S]*?)(?=\.from\(|$)/g
  let m
  while ((m = reCadena.exec(codigo))) {
    const arg = m[1].trim()
    const literal = /^['"]([a-z_]+)['"]$/.exec(arg)
    if (!literal) continue

    const tabla = literal[1]
    const cuerpo = m[2]
    const columnas = esquema.get(tabla)
    if (!columnas) {
      problemas.push(`${corta}: tabla/vista desconocida "${tabla}"`)
      continue
    }

    // select('a, b, c') y select(`a, b`)
    const reSelect = /\.select\(\s*([`'"])([\s\S]*?)\1/g
    let s
    while ((s = reSelect.exec(cuerpo))) {
      for (const bruto of s[2].split(',')) {
        const campo = bruto.trim()
        if (!campo || campo === '*') continue
        // `alias: columna` (rename de PostgREST) → cuenta la columna original
        const mm = /(?:([a-z_][a-z0-9_]*)\s*:\s*)?([a-z_][a-z0-9_]*)/.exec(campo)
        if (!mm) continue
        const columna = mm[2]
        if (columna === 'count') continue
        if (!columnas.has(columna)) {
          problemas.push(`${corta}: ${tabla}.select → "${columna}" no existe`)
        }
      }
    }

    // .eq('col', ...) etc.
    for (const campo of CAMPOS_POSTGREST) {
      const re = new RegExp(`\\.${campo}\\(\\s*['"]([a-z_][a-z0-9_]*)['"]`, 'g')
      let c
      while ((c = re.exec(cuerpo))) {
        if (campo === 'select') continue
        if (!columnas.has(c[1])) {
          problemas.push(`${corta}: ${tabla}.${campo}("${c[1]}") → la columna no existe`)
        }
      }
    }

    // insert({ ... }) / update({ ... })
    for (const op of ['insert', 'update']) {
      const re = new RegExp(`\\.${op}\\(\\s*\\{([\\s\\S]{0,900}?)\\}\\)`, 'g')
      let o
      while ((o = re.exec(cuerpo))) {
        for (const linea of o[1].split('\n')) {
          const k = /^\s*([a-z_][a-z0-9_]*)\s*:/.exec(linea)
          if (k && !columnas.has(k[1])) {
            problemas.push(`${corta}: ${tabla}.${op} → clave "${k[1]}" no es una columna`)
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------
// 3. Informe
// ---------------------------------------------------------------------
console.log(`Esquema leído: ${esquema.size} tablas y vistas`)
console.log([...esquema.keys()].sort().join(', '))
console.log()

if (problemas.length === 0) {
  console.log('Sin problemas: todas las columnas mencionadas existen.')
} else {
  console.log(`${problemas.length} PROBLEMA(S):`)
  for (const p of problemas) console.log('  - ' + p)
  process.exitCode = 1
}
