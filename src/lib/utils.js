import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind resolviendo conflictos. Helper estándar de shadcn. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Fecha de un timestamptz en formato corto local (dd/mm/aaaa).
 *
 * Se usa `toLocaleDateString` en vez de cortar el string ISO a propósito:
 * Supabase devuelve UTC, y en zonas como Colombia (UTC-5) un alta de las
 * 20:00 se mostraría con la fecha del día siguiente si se imprimiera el ISO.
 * `Intl` ya conoce la zona del navegador, así que no hay que codificarla.
 */
export function formatFecha(valor) {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Fecha de HOY en la zona del navegador, como 'YYYY-MM-DD'.
 *
 * Es el valor por defecto de los campos `fecha` de los formularios, así que
 * tiene que ser el día que ve el usuario, no el día UTC.
 *
 * **Por qué no `new Date().toISOString().slice(0, 10)`:** `toISOString()`
 * devuelve UTC. En Colombia (UTC-5), a las 20:30 locales ya es el día
 * siguiente en UTC, así que el formulario precargaba **mañana** como fecha del
 * movimiento y el atributo `max` dejaba además elegirla. Es el mismo error de
 * zona horaria que D22 evita en `MonthFilter` y que `formatFecha()` evita al
 * mostrar: aquí el sentido es el inverso (escribir en vez de leer) y el daño es
 * peor, porque un movimiento con la fecha equivocada queda en la base.
 *
 * Se construye con los componentes locales en vez de `toLocaleDateString`:
 * así no depende del locale del sistema ni de que exista una locale que
 * devuelva ISO.
 */
export function hoyLocal(ahora = new Date()) {
  const dosDigitos = (n) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`
}
