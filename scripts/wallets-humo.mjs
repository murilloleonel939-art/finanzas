/**
 * Empaquetador de la prueba de humo del módulo de wallets (módulo wallets + Earn).
 *
 * Mismo motivo y mismo patrón que `brokers-humo.mjs` (módulo de brokers), y la misma
 * advertencia: **es un archivo aparte y no una copia**. `wallets-datos.js`
 * importa `@/lib/supabase`, que lee `import.meta.env` y exige una anon key real;
 * en Node no existe ninguna de las dos cosas. esbuild compila el código REAL
 * sustituyendo solo ese import por un doble, y el bundle se ejecuta en Node.
 *
 * La alternativa —copiar la capa de datos a /tmp y parchear el import— deja la
 * prueba mirando una copia que se queda obsoleta sin avisar. Aquí se compila el
 * original, así que si `wallets-datos.js` cambia, la prueba cambia con él.
 *
 * Uso:  node scripts/wallets-humo.mjs   (o `npm run pruebas:wallets`)
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Igual que en el módulo de brokers: en UTC, "hoy local" y "hoy UTC" coinciden y una
// prueba de fecha mal escrita pasaría sin que nadie lo note. Se fija Bogotá
// (UTC-5), la zona del proyecto, antes de que nada construya un `Date`.
process.env.TZ = 'America/Bogota'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const salida = join(mkdtempSync(join(tmpdir(), 'humo16-')), 'humo.mjs')

await build({
  entryPoints: [join(AQUI, 'wallets-pruebas.mjs')],
  bundle: true,
  outfile: salida,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // `@/…` es el alias de vite.config.js. `alias` de esbuild lo resuelve, y así
  // el código se compila tal como lo ve el navegador.
  //
  // `earnConfig.js` importa `@/lib/walletProviders` por dentro, así que si ese
  // alias faltara el bundle fallaría al construirse: la cadena de imports del
  // módulo de wallets queda cubierta entera.
  alias: {
    '@/lib/supabase': join(AQUI, 'stub-supabase.mjs'),
    '@/lib/wallets-datos': join(RAIZ, 'src/lib/wallets-datos.js'),
    '@/lib/earnConfig': join(RAIZ, 'src/lib/earnConfig.js'),
    '@/lib/walletProviders': join(RAIZ, 'src/lib/walletProviders.js'),
    '@/lib/utils': join(RAIZ, 'src/lib/utils.js'),
    'supabase-doble': join(AQUI, 'stub-supabase.mjs'),
    'wallets-datos': join(RAIZ, 'src/lib/wallets-datos.js'),
    'earn-config': join(RAIZ, 'src/lib/earnConfig.js'),
    'wallet-providers': join(RAIZ, 'src/lib/walletProviders.js'),
    'utils-lib': join(RAIZ, 'src/lib/utils.js'),
  },
  logLevel: 'warning',
})

// El bundle se importa desde un directorio temporal, no desde el repo: así no
// deja artefactos que `git status` tenga que ignorar.
console.log(`bundle: ${salida}\n`)

await import(salida)
