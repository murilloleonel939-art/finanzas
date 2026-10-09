import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * ConfirmDialog: diálogo de confirmación para operaciones destructivas.
 * Usado para borrado en cascada de bancos, brokers, proveedores de wallet.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelText = 'Cancelar',
  actionText = 'Borrar',
  onConfirm,
  isLoading = false,
  variant = 'destructive', // 'default' o 'destructive'
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Procesando...' : actionText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
