import { Link } from 'react-router-dom'
import { usePermissionContext } from '@/providers/permission/permissionContext'
import { SHOP_LIMIT_UNLIMITED } from 'shared/permission/types'

type PermissionRow = {
  category: string
  action: string
  label: string
  granted: boolean
  note?: string
  dependency: 'role' | 'plan'
}

export function DashboardPage() {
  const { me } = usePermissionContext()

  if (!me) return null

  const p = me.permissions

  const rows: PermissionRow[] = [
    // ロール依存
    { category: '顧客管理', action: 'read',      label: '顧客閲覧', granted: p.customer.read,          dependency: 'role' },
    { category: '顧客管理', action: 'create',    label: '顧客作成', granted: p.customer.create,        dependency: 'role' },
    { category: '顧客管理', action: 'update',    label: '顧客更新', granted: p.customer.update,        dependency: 'role' },
    { category: '顧客管理', action: 'delete',    label: '顧客削除', granted: p.customer.delete,        dependency: 'role' },
    { category: '店舗設定', action: 'createShop', label: '店舗作成', granted: p.settings.createShop,  dependency: 'role' },
    { category: '店舗設定', action: 'updateShop', label: '店舗更新', granted: p.settings.updateShop,  dependency: 'role' },
    { category: '店舗設定', action: 'deleteShop', label: '店舗削除', granted: p.settings.deleteShop,  dependency: 'role' },
    { category: '店舗',     action: 'read',      label: '店舗閲覧', granted: p.shop.read,              dependency: 'role' },
    // プラン依存
    {
      category: '顧客管理', action: 'exportCsv', label: 'CSV出力',
      granted: p.customer.exportCsv,
      note: p.customer.exportCsv ? '利用可' : undefined,
      dependency: 'plan',
    },
    {
      category: '店舗設定', action: 'createShopLimit', label: '店舗作成上限',
      granted: p.settings.createShop,
      note: p.settings.createShop
        ? p.settings.createShopLimit === SHOP_LIMIT_UNLIMITED ? '無制限' : `上限${p.settings.createShopLimit}店`
        : undefined,
      dependency: 'plan',
    },
  ]

  const sections: { dep: 'role' | 'plan'; title: string; badge: string }[] = [
    { dep: 'role', title: 'ロールによる操作権限', badge: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    { dep: 'plan', title: 'プランによる数量・機能', badge: 'bg-purple-50 text-purple-600 border-purple-200' },
  ]

  const roleLabel: Record<string, string> = {
    tenant_owner: 'テナントオーナー',
    tenant_staff: 'テナントスタッフ',
    shop_owner: '店舗オーナー',
    shop_staff: '店舗スタッフ',
    developer: 'デベロッパー',
    system: 'システム',
  }

  const planColor: Record<string, string> = {
    starter: 'bg-gray-100 text-gray-600 border-gray-200',
    basic: 'bg-blue-50 text-blue-700 border-blue-200',
    pro: 'bg-purple-50 text-purple-700 border-purple-200',
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>

      {/* ユーザー情報カード */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">現在のユーザー</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-gray-400">メール</p>
            <p className="font-medium text-gray-800">{me.email}</p>
          </div>
          {me.tenantName && (
            <div>
              <p className="text-xs text-gray-400">テナント</p>
              <p className="font-medium text-gray-800">{me.tenantName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">店舗</p>
            <p className="font-medium text-gray-800">{me.shopScope}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">ロール</p>
            <p className="font-medium text-gray-800">{roleLabel[me.role] ?? me.role}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">プラン</p>
            <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-bold border ${planColor[me.plan] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {me.plan.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 権限一覧 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">権限一覧</h2>
        <div className="space-y-6">
          {sections.map(({ dep, title, badge }) => {
            const depRows = rows.filter((r) => r.dependency === dep)
            const cats = [...new Set(depRows.map((r) => r.category))]
            return (
              <div key={dep}>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold mb-3 ${badge}`}>
                  <span>{dep === 'role' ? '👤' : '📋'}</span>
                  {title}
                </div>
                <div className="space-y-3">
                  {cats.map((cat) => (
                    <div key={cat}>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">{cat}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {depRows
                          .filter((r) => r.category === cat)
                          .map((r) => (
                            <div
                              key={r.action}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                r.granted
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-red-50 border-red-200 text-red-500'
                              }`}
                            >
                              <span>{r.granted ? '✅' : '❌'}</span>
                              <div>
                                <div className="font-medium">{r.label}</div>
                                {r.note && <div className="text-xs opacity-70">{r.note}</div>}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/customers"
          className="block bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-4 text-center font-medium transition-colors"
        >
          顧客管理へ →
        </Link>
        <Link
          to="/shops"
          className="block bg-slate-700 hover:bg-slate-800 text-white rounded-xl p-4 text-center font-medium transition-colors"
        >
          店舗管理へ →
        </Link>
      </div>
    </div>
  )
}
