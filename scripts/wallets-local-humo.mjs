import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..')
const salida = join(mkdtempSync(join(tmpdir(), 'wallets-local-')), 'test.mjs')
await build({
  entryPoints: [join(aqui, 'wallets-local-pruebas.mjs')],
  bundle: true,
  outfile: salida,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  alias: {
    '@/lib/api': join(aqui, 'stub-api.mjs'),
    '@/lib/earnConfig': join(raiz, 'src/lib/earnConfig.js'),
    '@/lib/walletProviders': join(raiz, 'src/lib/walletProviders.js'),
  },
})
await import(salida)
