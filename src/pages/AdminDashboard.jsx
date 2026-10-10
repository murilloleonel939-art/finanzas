import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ShieldCheck,
  UserCog,
  Users,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants, Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { estadisticasAdmin, empresasRecientes } from '@/lib/admin'
import { nombrePais } from '@/lib/paises'
import { formatFecha, cn } from '@/lib/utils'
import { getAdminStats } from '@/lib/admin-api'
import { formatearTiempoRelativo } from '@/lib/admin-utils'

/**
 * Dashboard del panel de administración .
 *
 * Muestra CUENTOS, no sumas de dinero (el plan lo pedía explícitamente: "conteos,
 * no sumas de dinero"). No es una limitación técnica, es D4: sumar el saldo de
 * una cuenta en COP con una wallet en USDT daría un número sin significado.
 * 
 * panel de administración: Se agregan estadísticas de super admin con stats de sistema.
 */
export default function AdminDashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['admin', 'estadisticas'],
    queryFn: estadisticasAdmin,
  })

  const { data: recientes = [] } = useQuery({
    queryKey: ['admin', 'empresas-recientes'],
    queryFn: () => empresasRecientes(5),
  })

  // panel de administración: Stats de super admin
  const [superAdminStats, setSuperAdminStats] = useState(null)
  const [loadingSuperAdmin, setLoadingSuperAdmin] = useState(false)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

  useEffect(() => {
    cargarSuperAdminStats()
    const intervalo = setInterval(cargarSuperAdminStats, 30000)
    return () => clearInterval(intervalo)
  }, [])

  const cargarSuperAdminStats = async () => {
    try {
      setLoadingSuperAdmin(true)
      const datos = await getAdminStats()
      setSuperAdminStats(datos)
      setUltimaActualizacion(new Date())
    } catch (err) {
      console.error('Error cargando super admin stats:', err)
    } finally {
      setLoadingSuperAdmin(false)
    }
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Cargando panel…</p>
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">
          No se pudo cargar el panel: {error.message}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado general de la plataforma. Los importes no se consolidan entre
            monedas (decisión D4), por eso aquí solo hay recuentos.
          </p>
        </div>
        {ultimaActualizacion && (
          <Button
            variant="outline"
            size="sm"
            onClick={cargarSuperAdminStats}
            disabled={loadingSuperAdmin}
          >
            <RefreshCw className={`h-4 w-4 ${loadingSuperAdmin ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </header>

      {/* panel de administración: Salud del sistema */}
      {superAdminStats?.salud && (
        <div className="mb-6">
          <Card className={`p-4 border-l-4 ${
            superAdminStats.salud.estado === 'ok' 
              ? 'border-l-green-500 bg-green-50' 
              : 'border-l-yellow-500 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">
                  {superAdminStats.salud.estado === 'ok' ? '✅ Sistema OK' : '⚠️ Revisar'}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Último job: {superAdminStats.salud.ultimoJobHace}
                  {superAdminStats.salud.erroresUltimo > 0 && ` • Errores: ${superAdminStats.salud.erroresUltimo}`}
                </p>
              </div>
              <Zap className="h-6 w-6 text-yellow-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Aviso accionable: es la única tarjeta que exige hacer algo. */}
      {stats.usuarios.sinEmpresa > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">
              {stats.usuarios.sinEmpresa}{' '}
              {stats.usuarios.sinEmpresa === 1 ? 'usuario activo no tiene' : 'usuarios activos no tienen'}{' '}
              ninguna empresa asignada
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Pueden entrar, pero verán la aplicación vacía. Asígnales una empresa
              para que el acceso sirva de algo.
            </p>
            <Link
              to="/admin/usuarios"
              className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'mt-1 h-auto p-0')}
            >
              Ir a Usuarios
            </Link>
          </div>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Empresas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            titulo="Registradas"
            valor={stats.empresas.total}
            icono={Building2}
          />
          <Stat
            titulo="Activas"
            valor={stats.empresas.activas}
            icono={CheckCircle2}
            tono="ok"
          />
          <Stat
            titulo="Suspendidas"
            valor={stats.empresas.suspendidas}
            icono={AlertTriangle}
            tono={stats.empresas.suspendidas > 0 ? 'alerta' : undefined}
          />
          <Stat titulo="Países" valor={stats.empresas.paises} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Usuarios
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat titulo="Totales" valor={stats.usuarios.total} icono={Users} />
          <Stat
            titulo="Activos"
            valor={stats.usuarios.activos}
            icono={CheckCircle2}
            tono="ok"
          />
          <Stat
            titulo="Super admins"
            valor={stats.usuarios.superAdmins}
            icono={ShieldCheck}
          />
          <Stat
            titulo="Sin empresa"
            valor={stats.usuarios.sinEmpresa}
            icono={AlertTriangle}
            tono={stats.usuarios.sinEmpresa > 0 ? 'alerta' : undefined}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Roles dentro de las empresas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            titulo="Contadores"
            valor={stats.vinculos.contadores}
            icono={UserCog}
            descripcion="Asignaciones con rol contador"
          />
          <Stat
            titulo="Clientes"
            valor={stats.vinculos.clientes}
            icono={Users}
            descripcion="Asignaciones con rol cliente"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Es el número de asignaciones, no de personas: un mismo usuario puede ser
          contador en una empresa y cliente en otra (D6). Ambos roles tienen los
          mismos permisos dentro de la empresa.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Empresas recientes
          </h2>
          <Link
            to="/admin/empresas"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Ver todas
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {recientes.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Todavía no hay empresas. Crea la primera para empezar.
              </p>
            ) : (
              <ul>
                {recientes.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {nombrePais(e.pais) || 'País sin especificar'} ·{' '}
                        {formatFecha(e.created_at)}
                      </p>
                    </div>
                    <Badge variant={e.estado === 'activa' ? 'activo' : 'inactivo'}>
                      {e.estado}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function Stat({ titulo, valor, icono: Icono, tono, descripcion }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </CardTitle>
        {Icono && (
          <Icono
            className={
              tono === 'alerta'
                ? 'h-4 w-4 text-destructive'
                : tono === 'ok'
                  ? 'h-4 w-4 text-ingreso'
                  : 'h-4 w-4 text-muted-foreground'
            }
          />
        )}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p
          className={
            tono === 'alerta'
              ? 'text-2xl font-semibold text-destructive'
              : 'text-2xl font-semibold'
          }
        >
          {valor}
        </p>
        {descripcion && (
          <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
        )}
      </CardContent>
    </Card>
  )
}
