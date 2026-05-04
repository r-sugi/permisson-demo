import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermissionContext } from '@/providers/permission/permissionContext'
import { apiClient, parseJson } from '@/lib/apiClient'

const SEED_USERS = [
  { email: 'alice@example.com',   label: 'Alice',   role: 'tenant_owner', tenant: 'A社', plan: 'pro' },
  { email: 'bob@example.com',     label: 'Bob',     role: 'tenant_staff', tenant: 'A社', plan: 'pro' },
  { email: 'grace@example.com',   label: 'Grace',   role: 'shop_owner',   shop: 'A社 渋谷店', plan: 'pro' },
  { email: 'henry@example.com',   label: 'Henry',   role: 'shop_staff',   shop: 'A社 渋谷店', plan: 'pro' },
  { email: 'charlie@example.com', label: 'Charlie', role: 'tenant_owner', tenant: 'B社', plan: 'basic' },
  { email: 'diana@example.com',   label: 'Diana',   role: 'tenant_staff', tenant: 'B社', plan: 'basic' },
  { email: 'iris@example.com',    label: 'Iris',    role: 'shop_owner',   shop: 'B社 梅田店', plan: 'basic' },
  { email: 'jack@example.com',    label: 'Jack',    role: 'shop_staff',   shop: 'B社 梅田店', plan: 'basic' },
]

const ROLE_ORDER = ['tenant_owner', 'tenant_staff', 'shop_owner', 'shop_staff'] as const
const PLAN_ORDER = ['pro', 'basic', 'starter'] as const

type SeedUser = typeof SEED_USERS[number]

function getTenant(u: SeedUser): string {
  if ('tenant' in u) return u.tenant
  return u.shop.split(' ')[0]
}

const grouped: Record<string, SeedUser[]> = {}
for (const u of SEED_USERS) {
  const tenant = getTenant(u)
  if (!grouped[tenant]) grouped[tenant] = []
  grouped[tenant].push(u)
}
for (const users of Object.values(grouped)) {
  users.sort((a, b) => {
    const roleDiff = ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number])
    if (roleDiff !== 0) return roleDiff
    return PLAN_ORDER.indexOf(a.plan as typeof PLAN_ORDER[number]) - PLAN_ORDER.indexOf(b.plan as typeof PLAN_ORDER[number])
  })
}

const roleColorMap: Record<string, string> = {
  tenant_owner: 'bg-indigo-100 text-indigo-700',
  tenant_staff: 'bg-blue-100 text-blue-700',
  shop_owner: 'bg-amber-100 text-amber-700',
  shop_staff: 'bg-gray-100 text-gray-600',
}

const planColorMap: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-500',
  basic: 'bg-cyan-100 text-cyan-700',
  pro: 'bg-purple-100 text-purple-700',
}

export function LoginPage() {
  const navigate = useNavigate()
  const { refetchMe } = usePermissionContext()
  const [error, setError] = useState('')
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedMessage, setSeedMessage] = useState('')

  const handleSeed = async () => {
    setSeeding(true)
    setSeedMessage('')
    try {
      const seedRes = await apiClient.api.auth.seed.$post()
      await parseJson(seedRes)
      setSeedMessage('シードデータをリセットしました。')
    } catch (err) {
      setSeedMessage(`エラー: ${(err as Error).message}`)
    } finally {
      setSeeding(false)
    }
  }

  const quickLogin = async (userEmail: string) => {
    setLoadingEmail(userEmail)
    setError('')
    try {
      const loginRes = await apiClient.api.auth.login.$post({
        json: { email: userEmail, password: 'password' },
      })
      const res = await parseJson<{ token: string }>(loginRes)
      localStorage.setItem('jwt_token', res.token)
      await refetchMe()
      navigate('/')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingEmail(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-start justify-center pt-12 px-4">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">権限管理デモ</h1>
          <p className="text-slate-500 mt-2">RBAC + ReBAC + PBAC サンプルアプリケーション</p>
        </div>

        <div>
          {/* クイックログインパネル */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">ユーザーを選択してログイン</h2>
            <p className="text-xs text-gray-500 mb-3">クリックで即座にログインします（パスワード: password）</p>
            <div className="grid grid-cols-2 gap-4 mb-3">
              {Object.entries(grouped).map(([tenant, users]) => (
                <div key={tenant}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">{tenant}</p>
                  <div className="space-y-1">
                    {users.map((u) => (
                      <button
                        key={u.email}
                        onClick={() => quickLogin(u.email)}
                        disabled={loadingEmail !== null}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-800">{u.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColorMap[u.role]}`}>
                              {u.role}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${planColorMap[u.plan]}`}>
                              {u.plan}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {'shop' in u ? `${u.shop} · ` : ''}{u.email}
                          </div>
                        </div>
                        <span className="text-gray-300 group-hover:text-indigo-400 text-sm">
                          {loadingEmail === u.email ? '...' : '→'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {seeding ? 'リセット中...' : '🔄 シードデータをリセットする'}
              </button>
              {seedMessage && (
                <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">{seedMessage}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                ユーザーをクリックすると即座にログインします。データが壊れた場合は上のボタンでリセットしてください。
              </p>
              {error && <p className="mt-2 text-red-600 text-xs bg-red-50 rounded px-3 py-2">{error}</p>}
            </div>
          </div>
        </div>

        {/* 権限マトリクス早見表 */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">権限マトリクス早見表</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-gray-600 font-medium border border-gray-200">ロール × プラン</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">顧客閲覧</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">顧客作成</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">顧客削除</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">CSV出力</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">店舗作成</th>
                  <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">店舗削除</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'tenant_owner / pro', row: ['✅', '✅', '✅', '✅(無制限)', '✅(無制限)', '✅'] },
                  { label: 'tenant_owner / basic', row: ['✅', '✅', '✅', '✅(月100件)', '✅(30店)', '✅'] },
                  { label: 'tenant_owner / starter', row: ['✅', '✅', '✅', '❌', '✅(5店)', '✅'] },
                  { label: 'tenant_staff / pro', row: ['✅', '✅', '✅', '✅(無制限)', '✅(無制限)', '✅'] },
                  { label: 'tenant_staff / starter', row: ['✅', '✅', '✅', '❌', '✅(5店)', '✅'] },
                  { label: 'shop_owner / pro', row: ['✅(自店のみ)', '❌', '❌', '✅(無制限)', '❌', '❌'] },
                  { label: 'shop_owner / basic', row: ['✅(自店のみ)', '❌', '❌', '✅(月100件)', '❌', '❌'] },
                  { label: 'shop_owner / starter', row: ['✅(自店のみ)', '❌', '❌', '❌', '❌', '❌'] },
                  { label: 'shop_staff / *', row: ['❌', '❌', '❌', '❌', '❌', '❌'] },
                ].map(({ label, row }) => (
                  <tr key={label} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-200 whitespace-nowrap">{label}</td>
                    {row.map((cell, i) => (
                      <td key={i} className={`px-3 py-2 border border-gray-200 ${cell.startsWith('❌') ? 'text-red-500' : 'text-emerald-600'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
