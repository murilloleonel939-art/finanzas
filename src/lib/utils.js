import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind resolviendo conflictos. Helper estándar de shadcn. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
