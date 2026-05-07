import { POLICY_MAP, type PolicyTarget } from './policy/context'
import type { CustomerPermissions, CustomerPlanFeatures } from './policy/customer/types'
import type { SettingsPermissions, SettingsPlanFeatures } from './policy/settings/types'
import type { ShopPermissions } from './policy/shop/types'
import type { AuthContext, PolicyContext, Role } from './types'

export interface PermissionsMap {
  customer: CustomerPermissions & CustomerPlanFeatures
  settings: SettingsPermissions & SettingsPlanFeatures
  shop: ShopPermissions
}

export type {
  CustomerPermissions,
  CustomerPlanFeatures,
  SettingsPermissions,
  SettingsPlanFeatures,
  ShopPermissions,
}

/** AuthContext から PBAC 用の PolicyContext を構築する。 */
export function policyContextFromAuth(auth: AuthContext): PolicyContext {
  return { role: auth.role, plan: auth.plan }
}

export function buildPermissionsMap(context: PolicyContext): PermissionsMap {
  return Object.fromEntries(
    Object.entries(POLICY_MAP).map(([target, roles]) => [
      target,
      (roles as Record<Role, (ctx: PolicyContext) => { listPermissions: () => unknown }>)
        [context.role](context)
        .listPermissions(),
    ]),
  ) as unknown as PermissionsMap
}

export function hasPermissionInMap(
  permissions: PermissionsMap | null,
  target: PolicyTarget,
  action: string,
): boolean {
  if (!permissions) return false
  const targetPerms = permissions[target] as Record<string, unknown>
  return targetPerms?.[action] === true
}
