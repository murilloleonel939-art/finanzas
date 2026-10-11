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
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'No se pudo comunicar con el servidor.')
  return body
}

export function apiJson(path, method, data) {
  return api(path, { method, body: data === undefined ? undefined : JSON.stringify(data) })
}
