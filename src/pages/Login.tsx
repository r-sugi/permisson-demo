import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, parseJson } from '@/lib/apiClient'
import { usePermissionContext } from '@/providers/permission/permissionContext'
import type { DemoUser } from '@worker/routes/auth'

const ROLE_ORDER = ['tenant_owner', 'tenant_staff', 'shop_owner', 'shop_staff'] as const
const PLAN_ORDER = ['pro', 'basic', 'starter'] as const

function getGroupKey(u: DemoUser): string {
  return u.shopName ? (u.shopName.split(' ')[0] ?? u.tenantName) : u.tenantName
}

function groupAndSort(users: DemoUser[]): Record<string, DemoUser[]> {
  const grouped: Record<string, DemoUser[]> = {}
  for (const u of users) {
    const key = getGroupKey(u)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(u)
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => {
      const roleDiff =
        ROLE_ORDER.indexOf(a.role as (typeof ROLE_ORDER)[number]) -
        ROLE_ORDER.indexOf(b.role as (typeof ROLE_ORDER)[number])
      if (roleDiff !== 0) return roleDiff
      return (
        PLAN_ORDER.indexOf(a.plan as (typeof PLAN_ORDER)[number]) -
        PLAN_ORDER.indexOf(b.plan as (typeof PLAN_ORDER)[number])
      )
    })
  }
  return grouped
}

function labelFromEmail(email: string): string {
  const prefix = email.split('@')[0] ?? email
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

const roleColorMap: Record<string, string> = {
  tenant_owner: 'bg-emerald-100 text-emerald-700',
  tenant_staff: 'bg-blue-100 text-blue-700',
  shop_owner: 'bg-amber-100 text-amber-700',
  shop_staff: 'bg-gray-100 text-gray-600',
}

const planColorMap: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-500',
  basic: 'bg-cyan-100 text-cyan-700',
  pro: 'bg-purple-100 text-purple-700',
}

/** 権限マトリクス早見表の列見出し（React key 用、thead と順序一致） */
const ROLE_MATRIX_COLUMNS = [
  '顧客閲覧',
  '顧客作成',
  '顧客更新',
  '顧客削除',
  '店舗作成',
  '店舗更新',
  '店舗削除',
  '店舗閲覧',
] as const

const PLAN_FEATURE_COLUMNS = ['CSV出力', '店舗作成上限'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const { me, loading, refetchMe } = usePermissionContext()
  const [error, setError] = useState('')
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [grouped, setGrouped] = useState<Record<string, DemoUser[]>>({})
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState('')

  useEffect(() => {
    if (!loading && me) navigate('/', { replace: true })
  }, [loading, me, navigate])

  useEffect(() => {
    apiClient.api.auth['demo-users']
      .$get()
      .then((res) => parseJson<DemoUser[]>(res))
      .then((users) => setGrouped(groupAndSort(users)))
      .catch((err: unknown) =>
        setUsersError((err as Error).message ?? 'ユーザー一覧の取得に失敗しました'),
      )
      .finally(() => setUsersLoading(false))
  }, [])

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
            <p className="text-xs text-gray-500 mb-3">
              クリックで即座にログインできます。
            </p>
            {usersLoading && (
              <p className="text-sm text-gray-400 py-4 text-center">ユーザー一覧を読み込み中...</p>
            )}
            {usersError && (
              <p className="text-red-600 text-xs bg-red-50 rounded px-3 py-2 mb-3">{usersError}</p>
            )}
            {!usersLoading && !usersError && (
              <div className="grid grid-cols-2 gap-4 mb-3">
                {Object.entries(grouped).map(([group, users]) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">
                      {group}
                    </p>
                    <div className="space-y-1">
                      {users.map((u) => (
                        <button
                          type="button"
                          key={u.email}
                          onClick={() => quickLogin(u.email)}
                          disabled={loadingEmail !== null}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-gray-800">
                                {labelFromEmail(u.email)}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColorMap[u.role]}`}
                              >
                                {u.role}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${planColorMap[u.plan]}`}
                              >
                                {u.plan}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {u.shopName ? `${u.shopName} · ` : ''}
                              {u.email}
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
            )}
            {error && (
              <p className="mt-2 text-red-600 text-xs bg-red-50 rounded px-3 py-2">{error}</p>
            )}
          </div>
        </div>

        {/* 権限マトリクス早見表 */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">権限マトリクス早見表</h2>

          {/* ロールによる操作権限 */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold mb-3 bg-indigo-50 text-indigo-600 border-indigo-200">
              <span>👤</span> ロールによる操作権限
            </div>
            <p className="text-xs text-gray-400 mb-2">
              プランに関わらず、ロールで固定される true/false
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-gray-600 font-medium border border-gray-200">
                      ロール
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      顧客閲覧
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      顧客作成
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      顧客更新
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      顧客削除
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      店舗作成
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      店舗更新
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      店舗削除
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      店舗閲覧
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'tenant_owner / tenant_staff',
                      row: ['✅', '✅', '✅', '✅', '✅', '✅', '✅', '✅'],
                    },
                    {
                      label: 'shop_owner',
                      row: ['✅(自店のみ)', '❌', '✅', '❌', '❌', '❌', '❌', '✅'],
                    },
                    { label: 'shop_staff', row: ['❌', '❌', '❌', '❌', '❌', '❌', '❌', '✅'] },
                  ].map(({ label, row }) => (
                    <tr key={label} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-200 whitespace-nowrap">
                        {label}
                      </td>
                      {row.map((cell, i) => (
                        <td
                          key={`${label}-${ROLE_MATRIX_COLUMNS[i]}`}
                          className={`px-3 py-2 border border-gray-200 ${cell.startsWith('❌') ? 'text-red-500' : 'text-emerald-600'}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ※ 店舗閲覧は全ロール共通で ✅（表示範囲はスコープで制御）
            </p>
          </div>

          {/* プランによる数量・機能 */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold mb-3 bg-purple-50 text-purple-600 border-purple-200">
              <span>📋</span> プランによる数量・機能
            </div>
            <p className="text-xs text-gray-400 mb-2">
              ロールが同じでも、プランによって変わる上限・可否
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-gray-600 font-medium border border-gray-200">
                      プラン
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      CSV出力
                    </th>
                    <th className="px-3 py-2 text-gray-600 font-medium border border-gray-200">
                      店舗作成上限
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'pro', row: ['✅', '無制限'] },
                    { label: 'basic', row: ['✅', '30店'] },
                    { label: 'starter', row: ['❌', '5店'] },
                  ].map(({ label, row }) => (
                    <tr key={label} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-200">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${planColorMap[label]}`}
                        >
                          {label}
                        </span>
                      </td>
                      {row.map((cell, i) => (
                        <td
                          key={`${label}-${PLAN_FEATURE_COLUMNS[i]}`}
                          className={`px-3 py-2 border border-gray-200 ${cell.startsWith('❌') ? 'text-red-500' : 'text-emerald-600'}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ※ shop_staff は CSV 出力不可（プラン以前にロールで制限）。店舗作成上限は tenant_owner
              のみ対象
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
