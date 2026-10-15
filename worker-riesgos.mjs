import 'dotenv/config'
import { pool, query } from './server/db.mjs'
import { procesarRiesgoPendiente } from './server/riesgos-fondos-accival.mjs'

let trabajando = false
async function vuelta() {
  if (trabajando) return
  trabajando = true
  try {
    // Recuperar consultas interrumpidas también tras caídas parciales del proceso.
    await query(`update riesgos_fondos_accival set estado = 'pendiente', updated_at = now()
      where estado = 'consultando' and updated_at < now() - interval '2 minutes'`)
    for (let i = 0; i < 5; i++) {
      if (!await procesarRiesgoPendiente(query)) break
    }
  } catch (error) { console.warn(`Catálogo de riesgo: ${error.message}`) }
  finally { trabajando = false }
}
await vuelta()
setInterval(vuelta, 15_000)
process.on('SIGTERM', async () => { await pool.end(); process.exit(0) })
process.on('SIGINT', async () => { await pool.end(); process.exit(0) })
