import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import EmpresaLayout from './layouts/EmpresaLayout.jsx'

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

// FASE 20: Super Admin Panel
import AdminEmpresas from './pages/AdminEmpresas.jsx'
import AdminBrokers from './pages/AdminBrokers.jsx'
import AdminJobs from './pages/AdminJobs.jsx'
import AdminLogs from './pages/AdminLogs.jsx'
import AdminConfig from './pages/AdminConfig.jsx'

// Workspace y empresa (FASE 12)
import Workspace from './pages/Workspace.jsx'
import EmpresaOverview from './pages/EmpresaOverview.jsx'

// Cuentas bancarias (FASE 14)
import CrearBanco from './pages/CrearBanco.jsx'
import CrearCuenta from './pages/CrearCuenta.jsx'
import CuentaDetail from './pages/CuentaDetail.jsx'
import CrearMovimiento from './pages/CrearMovimiento.jsx'
import BancosPage from './pages/BancosPage.jsx'

// Brokers (FASE 15)
import BrokersPage from './pages/BrokersPage.jsx'
import CrearBroker from './pages/CrearBroker.jsx'
import BrokerDetail from './pages/BrokerDetail.jsx'
import CrearMovimientoBroker from './pages/CrearMovimientoBroker.jsx'
import CrearActivo from './pages/CrearActivo.jsx'

// Wallets + Earn (FASE 16)
import WalletsPage from './pages/WalletsPage.jsx'
import CrearWalletProvider from './pages/CrearWalletProvider.jsx'
import CrearWallet from './pages/CrearWallet.jsx'
import WalletDetail from './pages/WalletDetail.jsx'
import CrearMovimientoWallet from './pages/CrearMovimientoWallet.jsx'

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
          <Workspace />
        </ProtectedRoute>
      } />

      {/* --- Panel de administración (FASES 10-11 + FASE 20) --- */}
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
        {/* FASE 20: Super Admin Routes */}
        <Route path="admin-empresas" element={<AdminEmpresas />} />
        <Route path="admin-brokers" element={<AdminBrokers />} />
        <Route path="jobs" element={<AdminJobs />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="config" element={<AdminConfig />} />
      </Route>

      {/* --- Empresa (FASES 12-16) --- */}
      <Route path="/empresa/:empresaId" element={
        <ProtectedRoute>
          <EmpresaLayout />
        </ProtectedRoute>
      }>
        <Route index element={<EmpresaOverview />} />

        {/* Cuentas bancarias (FASE 14) */}
        <Route path="bancos" element={<BancosPage />} />
        <Route path="bancos/crear" element={<CrearBanco />} />
        <Route path="cuentas/crear" element={<CrearCuenta />} />
        <Route path="cuentas/:cuentaId" element={<CuentaDetail />} />
        <Route path="cuentas/:cuentaId/movimiento" element={<CrearMovimiento />} />

        {/* Brokers (FASE 15) */}
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="brokers/crear" element={<CrearBroker />} />
        <Route path="brokers/:brokerId" element={<BrokerDetail />} />
        <Route path="brokers/:brokerId/movimiento" element={<CrearMovimientoBroker />} />
        <Route path="brokers/:brokerId/activo" element={<CrearActivo />} />

        {/* Wallets + Earn (FASE 16) */}
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="wallets/crear-proveedor" element={<CrearWalletProvider />} />
        <Route
          path="wallets/proveedor/:proveedorId/crear-wallet"
          element={<CrearWallet />}
        />
        <Route
          path="wallets/proveedor/:proveedorId/wallet/:walletId"
          element={<WalletDetail />}
        />
        <Route
          path="wallets/proveedor/:proveedorId/wallet/:walletId/movimiento"
          element={<CrearMovimientoWallet />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
