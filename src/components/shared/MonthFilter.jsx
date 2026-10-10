/**
 * MonthFilter — filtro de mes compartido .
 *
 * Lo usan CuentaDetail, WalletDetail, WalletEarn y BrokerDetail. Por eso vive
 * en `components/shared/` y no dentro de una página: con cuatro copias, cada
 * una acabaría formateando los meses a su manera.
 *
 * Resuelve tres cosas y exporta las tres por separado para poder testearlas o
 * reutilizarlas sin renderizar nada:
 *
 *   getMesesDisponibles(movimientos)  → meses únicos 'YYYY-MM', descendente
 *   formatMes('2026-10')              → 'Octubre 2026'
 *   filtrarPorMes(movimientos, mes)   → 'all' devuelve todos
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Valor del Select para "sin filtro". No puede ser `''`: Radix reserva la
 * cadena vacía y lanza al montar el `SelectItem` con ese valor. */
export const MES_TODOS = 'all'

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/**
 * 'YYYY-MM' de una fecha del backend.
 *
 * Se corta el string en vez de construir un `Date` a propósito. `fecha` es una
 * columna `date` (no `timestamptz`), así que llega como '2026-10-01'; si se
 * pasara por `new Date('2026-10-01')` se interpretaría como medianoche UTC y en
 * Colombia (UTC-5) el `toLocaleDateString` devolvería el 30 de septiembre. El
 * movimiento aparecería en el mes equivocado. Cortar el string no tiene zona
 * horaria y no puede fallar.
 */
export function claveMes(fecha) {
  if (!fecha) return null
  const texto = String(fecha)
  const match = /^(\d{4})-(\d{2})/.exec(texto)
  if (match) return `${match[1]}-${match[2]}`
  // Un valor que no sea ISO (dato viejo o inventado) se intenta interpretar.
  const d = new Date(texto)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Meses presentes en los movimientos, más reciente primero.
 *
 * Ordena por la clave 'YYYY-MM' como texto: en ese formato el orden
 * lexicográfico coincide con el cronológico, sin convertir a fechas.
 */
export function getMesesDisponibles(movimientos = []) {
  const meses = new Set()
  for (const m of movimientos) {
    const clave = claveMes(m?.fecha)
    if (clave) meses.add(clave)
  }
  return [...meses].sort((a, b) => b.localeCompare(a))
}

/** Etiqueta legible: '2026-10' → 'Octubre 2026'. */
export function formatMes(ym) {
  if (!ym) return ''
  const match = /^(\d{4})-(\d{2})$/.exec(String(ym))
  if (!match) return String(ym)
  const indice = Number(match[2]) - 1
  if (indice < 0 || indice > 11) return String(ym)
  return `${NOMBRES_MES[indice]} ${match[1]}`
}

/**
 * Filtra por mes. `mes` en formato 'YYYY-MM', o `MES_TODOS`/vacío para todos.
 *
 * Recibe la lista de movimientos como se lee de las vistas, donde `fecha` es
 * 'YYYY-MM-DD'; la comparación es por prefijo, así que también funciona si
 * algún día llega un timestamp completo.
 */
export function filtrarPorMes(movimientos = [], mes = MES_TODOS) {
  if (!mes || mes === MES_TODOS) return movimientos
  return movimientos.filter((m) => claveMes(m?.fecha) === mes)
}

export default function MonthFilter({
  movimientos = [],
  meses,
  value = MES_TODOS,
  onChange,
  label = 'Período',
  className,
  id = 'month-filter',
}) {
  // `meses` permite pasar la lista ya calculada cuando la página ya la tiene
  // (por ejemplo si la necesita para otra cosa) y evita recorrer de nuevo los
  // movimientos en cada render.
  const opciones = meses ?? getMesesDisponibles(movimientos)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-56">
          <SelectValue placeholder="Acumulado (todos)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MES_TODOS}>Acumulado (todos)</SelectItem>
          {opciones.map((mes) => (
            <SelectItem key={mes} value={mes}>
              {formatMes(mes)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
