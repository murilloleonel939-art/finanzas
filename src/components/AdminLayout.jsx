import { NavLink, Outlet, Link } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, Wallet, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Marco del panel de administración.
 *
 * NOTA DE FASE: en la FASE 10 solo se construye lo mínimo para hospedar
 * UsuariosPage con navegación real. Las entradas Dashboard y Empresas
 * apuntan a las rutas que ya existen (con su Placeholder) y se completan
 * en la FASE 11, junto con el contenido del dashboard. Se hace así para no
 * entregar la gestión de usuarios como una página suelta sin forma de
 * volver a ningún sitio.
 */
const enlaces = [
  { to: '/admin', end: true, icono: LayoutDashboard, texto: 'Dashboard' },
  { to: '/admin/empresas', icono: Building2, texto: 'Empresas' },
  { to: '/admin/usuarios', icono: Users, texto: 'Usuarios' },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <Wallet className="h-5 w-5 text-primary" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">FinanzAdmin Pro</p>
            <p className="text-xs text-muted-foreground">Administración</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {enlaces.map(({ to, end, icono: Icono, texto }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icono className="h-4 w-4" />
              {texto}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <Link
            to="/workspace"
            className="mb-2 block rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
          >
            Ir a mis empresas
          </Link>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{profile?.full_name ?? 'Admin'}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
