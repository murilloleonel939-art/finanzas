const tokenKey = 'finanzadmin_token'

export function getToken() {
  return localStorage.getItem(tokenKey)
}

export function setToken(token) {
  if (token) localStorage.setItem(tokenKey, token)
  else localStorage.removeItem(tokenKey)
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, { ...options, headers })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null
  if (!response.ok) {
    if (body?.error) throw new Error(body.error)
    throw new Error(`El servidor respondió HTTP ${response.status}. Revisa los registros del despliegue en Coolify.`)
  }
  if (!body) throw new Error('El servidor respondió un formato inesperado. Revisa los registros del despliegue en Coolify.')
  return body
}

export function apiJson(path, method, data) {
  return api(path, { method, body: data === undefined ? undefined : JSON.stringify(data) })
}
