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
