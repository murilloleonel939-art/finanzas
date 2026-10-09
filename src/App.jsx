import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import Placeholder from './pages/Placeholder.jsx'

// Auth (FASE 9 — construidas)
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Home from './pages/Home.jsx'

// Panel de administración (FASES 10-11 — construido)
import AdminDashboard from './pages/AdminDashboard.jsx'
import EmpresasPage from './pages/EmpresasPage.jsx'
import UsuariosPage from './pages/UsuariosPage.jsx'

// Mapa completo de rutas (§11.1 del PRD).
// Las construidas apuntan a su componente real; las pendientes a un
// placeholder que indica en qué fase se harán.

export default function App() {
  return (
    <Routes>
      {/* --- Autenticación (FASE 9) --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* --- Redirect según rol (FASE 9) --- */}
      <Route path="/" element={<Home />} />

      {/* --- Workspace (FASE 12) --- */}
      <Route path="/workspace" element={
        <ProtectedRoute>
          <Placeholder nombre="Mis empresas" fase="12"
            descripcion="Lista de las empresas asignadas al usuario." />
        </ProtectedRoute>
      } />

      {/* --- Panel de administración (FASES 10-11) --- */}
      {/* La guarda soloAdmin va en el layout: así toda la sección /admin
          queda protegida de una vez y no ruta por ruta. */}
      <Route path="/admin" element={
        <ProtectedRoute soloAdmin>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="empresas" element={<EmpresasPage />} />
        <Route path="usuarios" element={<UsuariosPage />} />
      </Route>

      {/* --- Empresa (FASES 12-16) --- */}
      <Route path="/empresa/:empresaId">
        <Route index element={
          <ProtectedRoute>
            <Placeholder nombre="Resumen de la empresa" fase="12"
              descripcion="Subtotales por moneda, sin total consolidado (decisión D4)." />
          </ProtectedRoute>
        } />

        {/* Cuentas bancarias (FASE 14) */}
        <Route path="cuentas/crear-banco" element={
          <ProtectedRoute>
            <Placeholder nombre="Crear banco" fase="14"
              descripcion="Catálogo de bancos por país, con opción «Otro»." />
          </ProtectedRoute>
        } />
        <Route path="cuentas/banco/:bancoId/crear-cuenta" element={
          <ProtectedRoute>
            <Placeholder nombre="Crear cuenta" fase="14"
              descripcion="Número de cuenta, tipo y moneda." />
          </ProtectedRoute>
        } />
        <Route path="cuentas/banco/:bancoId/cuenta/:cuentaId" element={
          <ProtectedRoute>
            <Placeholder nombre="Detalle de cuenta" fase="14"
              descripcion="Resumen, filtro por mes, movimientos, importar y exportar." />
          </ProtectedRoute>
        } />

        {/* Brokers (FASE 15) */}
        <Route path="brokers/crear-broker" element={
          <ProtectedRoute>
            <Placeholder nombre="Crear broker" fase="15"
              descripcion="Nombre del broker y moneda base." />
          </ProtectedRoute>
        } />
        <Route path="brokers/broker/:brokerId" element={
          <ProtectedRoute>
            <Placeholder nombre="Detalle de broker" fase="15"
              descripcion="Pestañas: movimientos, activos y precios." />
          </ProtectedRoute>
        } />

        {/* Wallets (FASE 16) */}
        <Route path="wallets/crear-proveedor" element={
          <ProtectedRoute>
            <Placeholder nombre="Crear proveedor de wallet" fase="16"
              descripcion="Catálogo por tipo (cripto, fiat, ambos), con opción «Otro»." />
          </ProtectedRoute>
        } />
        <Route path="wallets/proveedor/:proveedorId/crear-wallet" element={
          <ProtectedRoute>
            <Placeholder nombre="Crear wallet" fase="16"
              descripcion="Etiqueta, dirección y moneda." />
          </ProtectedRoute>
        } />
        <Route path="wallets/proveedor/:proveedorId/wallet/:walletId" element={
          <ProtectedRoute>
            <Placeholder nombre="Detalle de wallet" fase="16"
              descripcion="Pantalla única para proveedores «todo es Earn»; pestañas para el resto." />
          </ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
