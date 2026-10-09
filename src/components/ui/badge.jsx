import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Etiqueta de estado. Los colores no son decorativos: distinguen de un
// vistazo un usuario activo de uno suspendido en una tabla de decenas de
// filas, donde el texto solo se lee mal.
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        activo: 'border-transparent bg-ingreso/15 text-ingreso',
        inactivo: 'border-transparent bg-destructive/15 text-destructive',
        admin: 'border-transparent bg-primary/15 text-primary',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

const Badge = forwardRef(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
