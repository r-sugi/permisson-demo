import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PermissionProvider } from '@/providers/permission/permissionProvider'
import { usePermissionContext } from '@/providers/permission/permissionContext'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { CustomersPage } from '@/pages/Customers'
import { ShopsPage } from '@/pages/Shops'
import { Layout } from '@/pages/Layout'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = usePermissionContext()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中...</div>
  if (!me) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <PermissionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/shops" element={<ShopsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PermissionProvider>
    </BrowserRouter>
  )
}

export default App
