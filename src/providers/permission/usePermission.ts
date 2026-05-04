import { usePermissionContext } from './permissionContext'
import { hasPermissionInMap } from 'shared/permission/permissions'
import { SHOP_LIMIT_UNLIMITED, EXPORT_LIMIT_UNLIMITED } from 'shared/permission/types'
import type { PolicyTarget } from 'shared/permission/policy/context'

export function usePermission() {
  const { me } = usePermissionContext()
  const permissions = me?.permissions ?? null

  const hasPermission = (target: PolicyTarget, action: string): boolean =>
    hasPermissionInMap(permissions, target, action)

  const createShopLimit = permissions?.settings.createShopLimit ?? 0
  const isCreateShopLimitUnlimited = createShopLimit === SHOP_LIMIT_UNLIMITED

  const exportCsvLimit = permissions?.customer.exportCsvLimit ?? 0
  const isExportCsvLimitUnlimited = exportCsvLimit === EXPORT_LIMIT_UNLIMITED

  return {
    permissions,
    hasPermission,
    createShopLimit,
    isCreateShopLimitUnlimited,
    exportCsvLimit,
    isExportCsvLimitUnlimited,
  }
}
