// Página temporal de la FASE 8. Cada ruta se reemplaza por su componente
// real en su fase correspondiente (9 a 16). Se centraliza aquí para que el
// mapa de rutas completo quede visible desde el principio.

export default function Placeholder({ nombre, fase, descripcion }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-lg rounded-lg border bg-card p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fase {fase}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{nombre}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{descripcion}</p>
        <p className="mt-6 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
          Scaffold de la FASE 8. Este componente se construye en la FASE {fase}.
        </p>
      </div>
    </div>
  )
}
