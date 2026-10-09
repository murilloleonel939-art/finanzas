/**
 * Empaquetador de la prueba de humo de la FASE 15.
 *
 * POR QUÉ: la capa de datos importa `@/lib/supabase`, que lee
 * `import.meta.env` y exige una anon key real. En Node nada de eso existe. El
 * proyecto no tiene runner de tests, así que se sigue el patrón que ya se usó
 * en la FASE 13: esbuild compila el código REAL (sin copiarlo ni reescribirlo)
 * sustituyendo solo el cliente de Supabase por un doble, y el bundle se
 * ejecuta en Node.
 *
 * La alternativa —copiar `brokers-datos.js` a /tmp y parchear el import— fue lo
 * que se hizo en la FASE 13, y tiene el defecto de que la prueba puede quedarse
 * mirando una copia obsoleta del archivo. Aquí se compila el original.
 *
 * Uso:  node scripts/humo-brokers.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

// La prueba de `hoyLocal()` solo significa algo si el proceso corre en una zona
// con desplazamiento respecto a UTC: en UTC, "hoy local" y "hoy UTC" coinciden y
// el test pasaría aunque la función estuviera mal escrita. Se fija Bogotá
// (UTC-5) —la zona del proyecto— antes de que nada construya un `Date`.
process.env.TZ = 'America/Bogota'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const salida = join(mkdtempSync(join(tmpdir(), 'humo-')), 'humo.mjs')

await build({
  entryPoints: [join(AQUI, 'humo-fase15.mjs')],
  bundle: true,
  outfile: salida,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // `@/…` es el alias de vite.config.js. `alias` de esbuild lo resuelve, y así
  // el código se compila tal como lo ve el navegador.
  alias: {
    '@/lib/supabase': join(AQUI, 'stub-supabase.mjs'),
    '@/lib/brokers-datos': join(RAIZ, 'src/lib/brokers-datos.js'),
    '@/lib/brokers': join(RAIZ, 'src/lib/brokers.js'),
    '@/lib/monedas': join(RAIZ, 'src/lib/monedas.js'),
    '@/lib/utils': join(RAIZ, 'src/lib/utils.js'),
    'supabase-doble': join(AQUI, 'stub-supabase.mjs'),
    'brokers-datos': join(RAIZ, 'src/lib/brokers-datos.js'),
    'brokers-lib': join(RAIZ, 'src/lib/brokers.js'),
    'utils-lib': join(RAIZ, 'src/lib/utils.js'),
  },
  logLevel: 'warning',
})

// El bundle se importa desde un directorio temporal, no desde el repo: así no
// deja artefactos que `git status` tenga que ignorar.
console.log(`bundle: ${salida}\n`)

await import(salida)
