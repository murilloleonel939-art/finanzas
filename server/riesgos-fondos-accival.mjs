// Solo consultar el catálogo oficial de Acciones & Valores; nunca abrir URLs del PDF.
// El resultado (incluyendo ausencia de coincidencia) se persiste en PostgreSQL.
const CATALOGO = 'https://www.accivalores.com/fondos-de-inversion-colectiva/'
const ORIGEN = 'https://www.accivalores.com'
const MAX_BYTES = 600_000

export function claveFondo(nombre) {
  return String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
}

function identidad(nombre) {
  return claveFondo(nombre).replace(/\b(fic|fondo|accival)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

function textoPlano(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
}

async function paginaOficial(url) {
  const destino = new URL(url)
  if (destino.origin !== ORIGEN || destino.protocol !== 'https:') throw new Error('La fuente no pertenece al sitio oficial.')
  const respuesta = await fetch(destino, { signal: AbortSignal.timeout(9000), redirect: 'manual', headers: { Accept: 'text/html' } })
  if (!respuesta.ok || !respuesta.headers.get('content-type')?.toLowerCase().includes('text/html')) throw new Error('No se pudo consultar la página oficial.')
  if (Number(respuesta.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Página oficial demasiado grande.')
  let html = ''
  for await (const parte of respuesta.body) {
    html += new TextDecoder().decode(parte)
    if (html.length > MAX_BYTES) throw new Error('Página oficial demasiado grande.')
  }
  return html
}

export async function consultarRiesgoOficial(nombre) {
  const objetivo = identidad(nombre)
  if (!objetivo || objetivo.length < 4 || objetivo.length > 140) return null
  const indice = await paginaOficial(CATALOGO)
  // Descubrir páginas nuevas solo desde el índice oficial; no aceptar entradas externas.
  const rutas = [...new Set([...indice.matchAll(/href=["'](https:\/\/www\.accivalores\.com\/fondo-de-inversion\/[a-z0-9-]+\/?)["']/gi)].map((coincidencia) => coincidencia[1]))]
  // Primero encontrar candidatos por la ruta; nunca inferir un riesgo del nombre.
  const candidatos = rutas.filter((url) => {
    const slug = claveFondo(new URL(url).pathname.split('/').filter(Boolean).at(-1).replace(/^fondo-/, ''))
    return slug.includes(objetivo) || objetivo.includes(slug) || objetivo.split(' ').every((palabra) => slug.includes(palabra))
  }).slice(0, 5)
  const confirmados = []
  for (const url of candidatos) {
    const pagina = await paginaOficial(url)
    const titulo = pagina.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    if (!titulo || identidad(textoPlano(titulo[1])) !== objetivo) continue
    const perfil = textoPlano(pagina).match(/Perfil de riesgo\s*:?\s*(Conservador|Moderado|Arriesgado|Agresivo|Alto|Bajo|Medio)\b/i)
    if (perfil) confirmados.push({ perfil_riesgo: perfil[1], fuente_url: url })
  }
  return confirmados.length === 1 ? confirmados[0] : null
}

export async function registrarFondosNuevos(client, fondos) {
  for (const fondo of fondos) {
    const nombre = String(fondo.nombre ?? '').trim()
    const clave = claveFondo(nombre)
    if (clave && clave.length <= 200) await client.query(`insert into riesgos_fondos_accival (nombre_clave, nombre)
      values ($1, $2) on conflict (nombre_clave) do nothing`, [clave, nombre])
  }
}

export async function procesarRiesgoPendiente(query) {
  const reclamado = await query(`update riesgos_fondos_accival set estado = 'consultando', intentos = intentos + 1,
    updated_at = now() where nombre_clave = (
      select nombre_clave from riesgos_fondos_accival
      where estado = 'pendiente' and (proximo_intento_at is null or proximo_intento_at <= now())
      order by updated_at limit 1 for update skip locked
    ) returning nombre_clave, nombre, intentos`)
  const fondo = reclamado.rows[0]
  if (!fondo) return false
  try {
    const resultado = await consultarRiesgoOficial(fondo.nombre)
    await query(`update riesgos_fondos_accival set estado = $2, perfil_riesgo = $3, fuente_url = $4,
      consultado_at = now(), updated_at = now() where nombre_clave = $1`,
    [fondo.nombre_clave, resultado ? 'confirmado' : 'no_encontrado', resultado?.perfil_riesgo ?? null, resultado?.fuente_url ?? null])
  } catch (error) {
    // Un fallo de red no se confunde con «no encontrado»; se reintenta hasta 3 veces.
    await query(`update riesgos_fondos_accival set estado = $2, proximo_intento_at = case when $2 = 'pendiente' then now() + interval '1 hour' else null end,
      updated_at = now() where nombre_clave = $1`, [fondo.nombre_clave, fondo.intentos < 3 ? 'pendiente' : 'error'])
    console.warn(`Consulta de riesgo pospuesta para fondo ${fondo.nombre_clave}: ${error.message}`)
  }
  return true
}
