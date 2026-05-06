import { useCallback, useEffect, useState } from 'react'
import { Permission } from '@/components/Permission'
import { PermissionPanel } from '@/components/PermissionPanel'
import { apiClient, parseJson } from '@/lib/apiClient'
import { usePermission } from '@/providers/permission/usePermission'

type Shop = {
  id: string
  tenantId: string
  name: string
  createdAt: string
  customerCount: number
}

const PANEL_ITEMS = [
  { label: '店舗閲覧', target: 'shop' as const, action: 'read' },
  { label: '店舗作成', target: 'settings' as const, action: 'createShop' },
  { label: '店舗更新', target: 'settings' as const, action: 'updateShop' },
  { label: '店舗削除', target: 'settings' as const, action: 'deleteShop' },
]

export function ShopsPage() {
  const { createShopLimit, isCreateShopLimitUnlimited } = usePermission()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [_refreshKey, setRefreshKey] = useState(0)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newShopName, setNewShopName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const fetchShops = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.api.shops.$get()
      const data = await parseJson<Shop[]>(res)
      setShops(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchShops()
  }, [fetchShops])

  const handleDelete = async (shop: Shop) => {
    if (!confirm(`「${shop.name}」を削除しますか？（元に戻せません）`)) return
    try {
      const delRes = await apiClient.api.tenants[':tenantId'].shops[':shopId'].$delete({
        param: { tenantId: shop.tenantId, shopId: shop.id },
      })
      await parseJson(delRes)
      setRefreshKey((k) => k + 1) // mutation 後リフェッチ
    } catch (err) {
      alert((err as Error).message)
    }
  }

  // 店舗作成用の tenantId を取得（tenant_owner/tenant_staff のみ）
  const getTenantIdForCreate = () => {
    // shops が1件以上あれば最初の tenantId を使う
    if (shops.length > 0) return shops[0].tenantId
    return null
  }

  const handleCreateWithTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    const tenantId = getTenantIdForCreate()
    if (!tenantId) {
      setCreateError('テナントIDが見つかりません。先に店舗一覧を確認してください。')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const postRes = await apiClient.api.tenants[':tenantId'].shops.$post({
        param: { tenantId },
        json: { name: newShopName },
      })
      await parseJson(postRes)
      setNewShopName('')
      setShowCreateForm(false)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      const e = err as Error & { status?: number }
      const suffix =
        e.status === 422
          ? '（UseCase: 422 上限超過）'
          : e.status === 403
            ? '（Gate1: 403）'
            : e.status === 404
              ? '（Gate2: ReBAC 404）'
              : ''
      setCreateError(`${e.message} ${suffix}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">店舗管理</h1>

      <PermissionPanel items={PANEL_ITEMS} title="settings.* 権限" />

      {/* 上限情報バナー */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-sm">
        <div className="flex flex-wrap gap-4">
          <span>
            店舗作成上限:{' '}
            <strong className="text-slate-700">
              {isCreateShopLimitUnlimited ? '無制限' : `${createShopLimit}店`}
            </strong>
          </span>
          <span>
            現在の店舗数: <strong className="text-slate-700">{shops.length}店</strong>
          </span>
          {!isCreateShopLimitUnlimited && (
            <span>
              残り作成可能数:{' '}
              <strong
                className={shops.length >= createShopLimit ? 'text-red-600' : 'text-emerald-600'}
              >
                {Math.max(0, createShopLimit - shops.length)}店
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ツールバー */}
      <div className="flex items-center gap-3 mb-4">
        <Permission
          target="settings"
          action="createShop"
          fallback={
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
              店舗の追加権限がありません
            </span>
          }
        >
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + 店舗を追加
          </button>
        </Permission>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="ml-auto text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          ↻ 再読み込み
        </button>
      </div>

      {/* 作成フォーム */}
      {showCreateForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">新規店舗作成</h3>
          <form
            onSubmit={(e) => {
              void handleCreateWithTenant(e)
            }}
            className="flex gap-2 items-end"
          >
            <input
              type="text"
              placeholder="店舗名"
              required
              value={newShopName}
              onChange={(e) => setNewShopName(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56"
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
            >
              {creating ? '作成中...' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false)
                setCreateError(null)
              }}
              className="text-gray-500 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              キャンセル
            </button>
          </form>
          {createError && (
            <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
              {createError}
            </p>
          )}
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 店舗テーブル */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : shops.length === 0 && !error ? (
        <div className="text-center py-12 text-gray-400">店舗データがありません</div>
      ) : !error ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">店舗名</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">テナントID</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">顧客数</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">作成日時</th>
                <th className="px-4 py-3 text-center text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shops.map((shop) => (
                <tr key={shop.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{shop.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                    {shop.tenantId.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">
                    {shop.customerCount.toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{shop.createdAt}</td>
                  <td className="px-4 py-3 text-center">
                    <Permission
                      target="settings"
                      action="deleteShop"
                      fallback={
                        <button
                          type="button"
                          disabled
                          className="text-gray-300 text-xs px-3 py-1 rounded border border-gray-200"
                          title="削除権限なし"
                        >
                          削除
                        </button>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(shop)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded border border-red-200"
                      >
                        削除
                      </button>
                    </Permission>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
            {shops.length}店舗（スコープ内のみ表示）
          </div>
        </div>
      ) : null}
    </div>
  )
}
