import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import EmpresaLayout from './layouts/EmpresaLayout.jsx'

// Autenticación
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Home from './pages/Home.jsx'

// Panel de administración
import AdminDashboard from './pages/AdminDashboard.jsx'
import EmpresasPage from './pages/EmpresasPage.jsx'
import UsuariosPage from './pages/UsuariosPage.jsx'

// Panel de super administrador
import AdminEmpresas from './pages/AdminEmpresas.jsx'
import AdminBrokers from './pages/AdminBrokers.jsx'
import AdminJobs from './pages/AdminJobs.jsx'
import AdminLogs from './pages/AdminLogs.jsx'
import AdminConfig from './pages/AdminConfig.jsx'

// Notificaciones por email
import AdminNotificaciones from './pages/AdminNotificaciones.jsx'

// Workspace y empresa
import Workspace from './pages/Workspace.jsx'
import EmpresaOverview from './pages/EmpresaOverview.jsx'

// Cuentas bancarias
import CrearBanco from './pages/CrearBanco.jsx'
import CrearCuenta from './pages/CrearCuenta.jsx'
import CuentaDetail from './pages/CuentaDetail.jsx'
import CrearMovimiento from './pages/CrearMovimiento.jsx'
import BancosPage from './pages/BancosPage.jsx'

// Brokers
import BrokersPage from './pages/BrokersPage.jsx'
import CrearBroker from './pages/CrearBroker.jsx'
import BrokerDetail from './pages/BrokerDetail.jsx'
import CrearMovimientoBroker from './pages/CrearMovimientoBroker.jsx'
import CrearActivo from './pages/CrearActivo.jsx'

// Wallets + Earn
import WalletsPage from './pages/WalletsPage.jsx'
import CrearWalletProvider from './pages/CrearWalletProvider.jsx'
import CrearWallet from './pages/CrearWallet.jsx'
import WalletDetail from './pages/WalletDetail.jsx'
import CrearMovimientoWallet from './pages/CrearMovimientoWallet.jsx'

// Mapa de rutas (§11.1 del PRD).

export default function App() {
  return (
    <Routes>
      {/* --- Autenticación --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* --- Redirect según rol --- */}
      <Route path="/" element={<Home />} />

      {/* --- Workspace --- */}
      <Route path="/workspace" element={
        <ProtectedRoute>
          <Workspace />
        </ProtectedRoute>
      } />

      {/* --- Panel de administración --- */}
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
        {/* Super administrador */}
        <Route path="admin-empresas" element={<AdminEmpresas />} />
        <Route path="admin-brokers" element={<AdminBrokers />} />
        <Route path="jobs" element={<AdminJobs />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="config" element={<AdminConfig />} />
        {/* Notificaciones */}
        <Route path="notificaciones" element={<AdminNotificaciones />} />
      </Route>

      {/* --- Empresa --- */}
      <Route path="/empresa/:empresaId" element={
        <ProtectedRoute>
          <EmpresaLayout />
        </ProtectedRoute>
      }>
        <Route index element={<EmpresaOverview />} />

        {/* Cuentas bancarias */}
        <Route path="bancos" element={<BancosPage />} />
        <Route path="bancos/crear" element={<CrearBanco />} />
        <Route path="cuentas/crear" element={<CrearCuenta />} />
        <Route path="cuentas/:cuentaId" element={<CuentaDetail />} />
        <Route path="cuentas/:cuentaId/movimiento" element={<CrearMovimiento />} />

        {/* Brokers */}
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="brokers/crear" element={<CrearBroker />} />
        <Route path="brokers/:brokerId" element={<BrokerDetail />} />
        <Route path="brokers/:brokerId/movimiento" element={<CrearMovimientoBroker />} />
        <Route path="brokers/:brokerId/activo" element={<CrearActivo />} />

        {/* Wallets + Earn */}
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
