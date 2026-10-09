import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  actualizarEmpresa,
  crearEmpresa,
  eliminarEmpresa,
} from '@/lib/empresas'
import { OTRO_PAIS, PAISES, nombrePais } from '@/lib/paises'

/**
 * Alta y edición de una empresa (PRD §2 y §11.3).
 *
 * `pais` es texto libre en la base. El selector guarda el código ISO de dos
 * letras, pero si el usuario elige "Otro" se le pide el nombre y se guarda
 * tal cual: la columna es `text`, y bloquear un país que no esté en la lista
 * sería peor que aceptar un valor que no se pueda mapear después.
 */
export default function EmpresaDialog({ abierto, onCerrar, empresa }) {
  const esEdicion = Boolean(empresa)
  const queryClient = useQueryClient()

  const [nombre, setNombre] = useState('')
  const [pais, setPais] = useState('')
  const [paisOtro, setPaisOtro] = useState('')
  const [estado, setEstado] = useState('activa')
  const [error, setError] = useState('')

  // Se rehidrata al abrir para no arrastrar los datos de la empresa anterior.
  useEffect(() => {
    if (!abierto) return
    setError('')
    if (empresa) {
      setNombre(empresa.nombre ?? '')
      setEstado(empresa.estado ?? 'activa')
      // Si el país guardado no está en el catálogo, se abre como "Otro" con
      // el valor actual, para que editarlo no lo borre sin querer.
      const enCatalogo = PAISES.some((p) => p.codigo === empresa.pais)
      if (empresa.pais && !enCatalogo) {
        setPais(OTRO_PAIS)
        setPaisOtro(empresa.pais)
      } else {
        setPais(empresa.pais ?? '')
        setPaisOtro('')
      }
    } else {
      setNombre('')
      setPais('')
      setPaisOtro('')
      setEstado('activa')
    }
  }, [abierto, empresa])

  const guardar = useMutation({
    mutationFn: async () => {
      const paisFinal = pais === OTRO_PAIS ? paisOtro.trim() : pais
      const datos = { nombre, pais: paisFinal, estado }
      return esEdicion ? actualizarEmpresa(empresa.id, datos) : crearEmpresa(datos)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      onCerrar()
    },
    onError: (err) => setError(err.message),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarEmpresa(empresa.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      onCerrar()
    },
    onError: (err) => setError(err.message),
  })

  function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) {
      setError('La empresa necesita un nombre.')
      return
    }
    if (pais === OTRO_PAIS && !paisOtro.trim()) {
      setError('Escribe el nombre del país.')
      return
    }
    guardar.mutate()
  }

  function confirmarBorrado() {
    const ok = window.confirm(
      `¿Borrar «${empresa.nombre}»?\n\n` +
        'La empresa y todos sus datos financieros dejan de ser accesibles. ' +
        'Es un borrado lógico: nada se elimina de la base y se puede restaurar.'
    )
    if (ok) borrar.mutate()
  }

  const trabajando = guardar.isPending || borrar.isPending

  return (
    <Dialog open={abierto} onOpenChange={(v) => !trabajando && !v && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
          <DialogDescription>
            {esEdicion
              ? 'Cambia el nombre, el país o el estado de la empresa.'
              : 'La empresa se crea vacía: después se le asignan usuarios y se cargan sus cuentas, brokers y wallets.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="e-nombre">Nombre</Label>
            <Input
              id="e-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Inversiones del Caribe S.A.S."
              autoFocus
              required
            />
            {esEdicion && (
              <p className="text-xs text-muted-foreground">
                Cambiar el nombre no afecta a los datos: los movimientos guardan
                la relación con la empresa, no su nombre.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>País</Label>
            <Select value={pais} onValueChange={setPais}>
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                {PAISES.map((p) => (
                  <SelectItem key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </SelectItem>
                ))}
                <SelectItem value={OTRO_PAIS}>Otro…</SelectItem>
              </SelectContent>
            </Select>
            {pais === OTRO_PAIS && (
              <Input
                value={paisOtro}
                onChange={(e) => setPaisOtro(e.target.value)}
                placeholder="Nombre del país"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activa">Activa — operativa</SelectItem>
                <SelectItem value="suspendida">
                  Suspendida — los usuarios conservan el acceso
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Suspender es una marca de gestión: los usuarios de la empresa siguen
              viendo sus datos. Para retirarles el acceso hay que borrar la empresa.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="items-center gap-2">
            {esEdicion && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                onClick={confirmarBorrado}
                disabled={trabajando}
              >
                <Trash2 className="h-4 w-4" />
                Borrar
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onCerrar} disabled={trabajando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={trabajando}>
              {guardar.isPending
                ? 'Guardando…'
                : esEdicion
                  ? 'Guardar cambios'
                  : 'Crear empresa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { nombrePais }
