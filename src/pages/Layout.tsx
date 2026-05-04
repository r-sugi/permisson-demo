import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { usePermissionContext } from '@/providers/permission/permissionContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
  }`

export function Layout() {
  const { me, logout } = usePermissionContext()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleLabel: Record<string, string> = {
    tenant_owner: 'テナントオーナー',
    tenant_staff: 'テナントスタッフ',
    shop_owner: '店舗オーナー',
    shop_staff: '店舗スタッフ',
    developer: 'デベロッパー',
  }

  const planColor: Record<string, string> = {
    starter: 'bg-gray-100 text-gray-500',
    basic: 'bg-cyan-100 text-cyan-700',
    pro: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <span className="font-bold text-gray-800">権限管理デモ</span>
        <nav className="flex items-center gap-1 ml-4">
          <NavLink to="/" end className={navLinkClass}>ダッシュボード</NavLink>
          <NavLink to="/customers" className={navLinkClass}>顧客管理</NavLink>
          <NavLink to="/shops" className={navLinkClass}>店舗管理</NavLink>
        </nav>
        {me && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500">{me.email}</span>
            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
              {roleLabel[me.role] ?? me.role}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${planColor[me.plan] ?? 'bg-gray-100 text-gray-500'}`}>
              {me.plan.toUpperCase()}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              ログアウト
            </button>
          </div>
        )}
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
