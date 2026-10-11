// Compatibilidad temporal durante la migración progresiva.
// Los módulos financieros que aún no han sido trasladados al API propio siguen
// mostrando un error explícito si se usan, pero su importación ya no impide que
// funcionen el login, usuarios y empresas locales.
const pendiente = () => Promise.reject(new Error(
  'Este módulo financiero todavía está conectado al respaldo de Supabase y no se ha migrado al PostgreSQL local.'
))

const clientePendiente = new Proxy(pendiente, {
  get: (_target, property) => (property === 'then' ? undefined : clientePendiente),
  apply: () => pendiente(),
})

export const supabase = clientePendiente
