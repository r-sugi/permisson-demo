import { usePermissionContext } from '@/providers/permission/permissionContext'
import { usePermission } from '@/providers/permission/usePermission'
import type { PolicyTarget } from 'shared/permission/policy/context'

type BadgeItem = {
  label: string
  target: PolicyTarget
  action: string
  note?: string
}

type Props = {
  items: BadgeItem[]
  title?: string
}

function Badge({ granted, label, note }: { granted: boolean; label: string; note?: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${
        granted
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-600'
      }`}
      title={note}
    >
      <span>{granted ? '✅' : '❌'}</span>
      <span>{label}</span>
      {note && <span className="text-xs opacity-70">({note})</span>}
    </div>
  )
}

export function PermissionPanel({ items, title }: Props) {
  const { me } = usePermissionContext()
  const { hasPermission, createShopLimit, isCreateShopLimitUnlimited, exportCsvLimit, isExportCsvLimitUnlimited } =
    usePermission()

  if (!me) return null

  const roleLabelMap: Record<string, string> = {
    tenant_owner: 'テナントオーナー',
    tenant_staff: 'テナントスタッフ',
    shop_owner: '店舗オーナー',
    shop_staff: '店舗スタッフ',
    developer: 'デベロッパー',
    system: 'システム',
  }

  const planLabelMap: Record<string, string> = {
    starter: 'Starter',
    basic: 'Basic',
    pro: 'Pro',
  }

  const planColorMap: Record<string, string> = {
    starter: 'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    pro: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">ロール</span>
          <span className="font-semibold text-gray-800">{roleLabelMap[me.role] ?? me.role}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-bold ${planColorMap[me.plan] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {planLabelMap[me.plan] ?? me.plan}
        </span>
        <span className="text-gray-400 text-xs">{me.email}</span>
        {title && <span className="ml-auto text-gray-400 text-xs font-medium">{title}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          let note: string | undefined
          if (item.action === 'createShop' && hasPermission('settings', 'createShop')) {
            note = isCreateShopLimitUnlimited ? '無制限' : `上限 ${createShopLimit}店`
          }
          if (item.action === 'exportCsv' && hasPermission('customer', 'exportCsv')) {
            note = isExportCsvLimitUnlimited
              ? '無制限'
              : `月${exportCsvLimit}件`
          }
          return (
            <Badge
              key={`${item.target}.${item.action}`}
              granted={hasPermission(item.target, item.action)}
              label={item.label}
              note={note}
            />
          )
        })}
      </div>

      {/* 数量制限の詳細表示 */}
      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <span>
          店舗作成上限:{' '}
          <strong>{isCreateShopLimitUnlimited ? '無制限' : `${createShopLimit}店`}</strong>
        </span>
        <span>
          CSVエクスポート上限:{' '}
          <strong>
            {hasPermission('customer', 'exportCsv')
              ? isExportCsvLimitUnlimited
                ? '無制限'
                : `月${exportCsvLimit}件`
              : '利用不可'}
          </strong>
        </span>
      </div>
    </div>
  )
}
