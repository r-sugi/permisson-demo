import { useCallback, useEffect, useState } from 'react'
import { Permission } from '@/components/Permission'
import { PermissionPanel } from '@/components/PermissionPanel'
import { apiClient, parseJson } from '@/lib/apiClient'
import { usePermissionContext } from '@/providers/permission/permissionContext'

type Customer = {
  id: string
  name: string
  displayName: string
  email: string
  tag: string | null
  memo: string | null
  createdAt: string
}

type Shop = {
  id: string
  name: string
}

const PANEL_ITEMS = [
  { label: '閲覧', target: 'customer' as const, action: 'read' },
  { label: '作成', target: 'customer' as const, action: 'create' },
  { label: '更新', target: 'customer' as const, action: 'update' },
  { label: '削除', target: 'customer' as const, action: 'delete' },
  { label: 'CSV出力', target: 'customer' as const, action: 'exportCsv' },
]

/** API の既定と揃えた 1 ページあたり件数（カーソルページネーション） */
const PAGE_SIZE = 20

type CustomerPage = {
  items: Customer[]
  nextCursor: string | null
}

export function CustomersPage() {
  const { me } = usePermissionContext()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  /** 現在のページ取得時にクエリへ渡した cursor（先頭ページは null） */
  const [pageRequestCursor, setPageRequestCursor] = useState<string | null>(null)
  /** 「戻る」用：各ページのリクエスト cursor を積む */
  const [cursorBackStack, setCursorBackStack] = useState<(string | null)[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [scopeCustomerTotal, setScopeCustomerTotal] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    shopId: '',
    tag: '',
    memo: '',
  })
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ name: '', tag: '', memo: '' })
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)

  const fetchPage = useCallback(async (requestCursor: string | null, resetPagination: boolean) => {
    setLoading(true)
    setError(null)
    setErrorStatus(null)
    try {
      const res = await apiClient.api.customers.$get({
        query: {
          limit: String(PAGE_SIZE),
          ...(requestCursor ? { cursor: requestCursor } : {}),
        },
      })
      const data = await parseJson<CustomerPage>(res)
      setCustomers(data.items)
      setNextCursor(data.nextCursor)
      setPageRequestCursor(requestCursor)
      if (resetPagination) {
        setCursorBackStack([])
      }
    } catch (err) {
      const e = err as Error & { status?: number }
      setError(e.message)
      setErrorStatus(e.status ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadListAndSummary = useCallback(async () => {
    await fetchPage(null, true)
    try {
      const res = await apiClient.api.customers.summary.$get()
      const data = await parseJson<{ totalInScope: number }>(res)
      setScopeCustomerTotal(data.totalInScope)
    } catch {
      setScopeCustomerTotal(null)
    }
  }, [fetchPage])

  useEffect(() => {
    void reloadListAndSummary()
  }, [reloadListAndSummary])

  const handleNextPage = async () => {
    if (!nextCursor) return
    setCursorBackStack((s) => [...s, pageRequestCursor])
    await fetchPage(nextCursor, false)
  }

  const handlePrevPage = async () => {
    if (cursorBackStack.length === 0) return
    const prevRequestCursor = cursorBackStack.at(-1)
    if (prevRequestCursor === undefined) return
    setCursorBackStack((s) => s.slice(0, -1))
    await fetchPage(prevRequestCursor, false)
  }

  const handleFirstPage = async () => {
    await fetchPage(null, true)
  }

  useEffect(() => {
    apiClient.api.shops
      .$get()
      .then(async (res) => {
        const data = await parseJson<Shop[]>(res)
        setShops(data)
      })
      .catch(() => {})
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const postRes = await apiClient.api.customers.$post({
        json: {
          name: newCustomer.name,
          email: newCustomer.email,
          shopId: newCustomer.shopId,
          tag: newCustomer.tag || undefined,
          memo: newCustomer.memo || undefined,
        },
      })
      await parseJson(postRes)
      setNewCustomer({ name: '', email: '', shopId: '', tag: '', memo: '' })
      setShowCreateForm(false)
      await reloadListAndSummary()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (customerId: string) => {
    if (!confirm('この顧客を削除しますか？')) return
    try {
      const delRes = await apiClient.api.customers[':id'].$delete({
        param: { id: customerId },
      })
      await parseJson(delRes)
      await reloadListAndSummary()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditId(customer.id)
    setEditData({ name: customer.name, tag: customer.tag ?? '', memo: customer.memo ?? '' })
  }

  const handleUpdate = async (customerId: string) => {
    try {
      const patchRes = await apiClient.api.customers[':id'].$patch({
        param: { id: customerId },
        json: {
          name: editData.name,
          tag: editData.tag || null,
          memo: editData.memo || null,
        },
      })
      await parseJson(patchRes)
      setEditId(null)
      await reloadListAndSummary()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setExportResult(null)
    try {
      const exportRes = await apiClient.api.customers.export.$get()
      const res = await parseJson<{ customers: Customer[]; exportedAt: string; count: number }>(
        exportRes,
      )
      setExportResult(`${res.count}件のデータをエクスポートしました（${res.exportedAt}）`)
    } catch (err) {
      const e = err as Error & { status?: number }
      const suffix =
        e.status === 403
          ? '（Gate1: PBAC 403）'
          : e.status === 422
            ? '（UseCase: 422 上限超過）'
            : ''
      setExportResult(`エラー: ${e.message} ${suffix}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">顧客管理</h1>

      <PermissionPanel items={PANEL_ITEMS} title="customer.* 権限" />

      {scopeCustomerTotal !== null && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
          <span className="font-medium text-slate-800">{me?.tenantName ?? 'テナント'}</span>
          のスコープ内の顧客は{' '}
          <strong className="tabular-nums text-slate-900">
            {scopeCustomerTotal.toLocaleString('ja-JP')}
          </strong>{' '}
          件です。
        </div>
      )}

      {/* ツールバー */}
      <div className="flex items-center gap-3 mb-4">
        <Permission target="customer" action="create">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + 顧客を追加
          </button>
        </Permission>

        <Permission
          target="customer"
          action="exportCsv"
          fallback={
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
              CSVエクスポートは Basic プラン以上
            </span>
          }
        >
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {exporting ? 'エクスポート中...' : 'CSV エクスポート'}
          </button>
        </Permission>

        <button
          type="button"
          onClick={() => void reloadListAndSummary()}
          className="ml-auto text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          ↻ 再読み込み
        </button>
      </div>

      {exportResult && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${exportResult.startsWith('エラー') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
        >
          {exportResult}
        </div>
      )}

      {/* 作成フォーム */}
      {showCreateForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">新規顧客作成</h3>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end">
            <select
              required
              value={newCustomer.shopId}
              onChange={(e) => setNewCustomer((p) => ({ ...p, shopId: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            >
              <option value="">店舗を選択</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="名前"
              required
              value={newCustomer.name}
              onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            />
            <input
              type="email"
              placeholder="メール"
              required
              value={newCustomer.email}
              onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52"
            />
            <input
              type="text"
              placeholder="タグ（任意）"
              value={newCustomer.tag}
              onChange={(e) => setNewCustomer((p) => ({ ...p, tag: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32"
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
            >
              {creating ? '作成中...' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-gray-500 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              キャンセル
            </button>
          </form>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          <strong>
            {errorStatus === 403
              ? 'Gate1: PBAC 403 – '
              : errorStatus === 404
                ? 'Gate2: ReBAC 404 – '
                : ''}
          </strong>
          {error}
          {errorStatus === 403 && (
            <p className="mt-1 text-red-500">
              このロールでは顧客情報にアクセスできません（shop_staff は customer.read = false）
            </p>
          )}
        </div>
      )}

      {/* テーブル */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : customers.length === 0 && !error ? (
        <div className="text-center py-12 text-gray-400">顧客データがありません</div>
      ) : !error ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">表示名</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">メール</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">タグ</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">メモ</th>
                <th className="px-4 py-3 text-center text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) =>
                editId === c.id ? (
                  <tr key={c.id} className="bg-yellow-50">
                    <td className="px-4 py-2">
                      <input
                        value={editData.name}
                        onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-500">{c.email}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editData.tag}
                        onChange={(e) => setEditData((p) => ({ ...p, tag: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editData.memo}
                        onChange={(e) => setEditData((p) => ({ ...p, memo: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          type="button"
                          onClick={() => handleUpdate(c.id)}
                          className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 py-1 rounded"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="text-gray-500 text-xs px-3 py-1 rounded hover:bg-gray-100"
                        >
                          キャンセル
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.displayName}</td>
                    <td className="px-4 py-3 text-gray-500">{c.email}</td>
                    <td className="px-4 py-3">
                      {c.tag ? (
                        <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                          {c.tag}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-xs">
                      {c.memo ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <Permission
                          target="customer"
                          action="update"
                          fallback={
                            <button
                              type="button"
                              disabled
                              className="text-gray-300 text-xs px-3 py-1 rounded border border-gray-200"
                              title="更新権限なし"
                            >
                              編集
                            </button>
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs px-3 py-1 rounded border border-amber-200"
                          >
                            編集
                          </button>
                        </Permission>
                        <Permission
                          target="customer"
                          action="delete"
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
                            onClick={() => handleDelete(c.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded border border-red-200"
                          >
                            削除
                          </button>
                        </Permission>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>
              本ページ <strong className="text-gray-800">{customers.length}</strong> 件
              {customers.length > 0 && ' （スコープ内・カーソル順）'}
            </span>
            {nextCursor !== null && <span className="text-indigo-600">次のページがあります</span>}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => void handleFirstPage()}
                disabled={loading || (pageRequestCursor === null && cursorBackStack.length === 0)}
                className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                先頭へ
              </button>
              <button
                type="button"
                onClick={() => void handlePrevPage()}
                disabled={loading || cursorBackStack.length === 0}
                className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                前へ
              </button>
              <button
                type="button"
                onClick={() => void handleNextPage()}
                disabled={loading || nextCursor === null}
                className="px-3 py-1 rounded border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-40 disabled:hover:bg-indigo-50"
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
