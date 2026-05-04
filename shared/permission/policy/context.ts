import type { PolicyContext } from '@shared/permission/types'
import { TenantOwnerCustomerPolicy } from './customer/roles/tenant-owner'
import { ShopOwnerCustomerPolicy } from './customer/roles/shop-owner'
import { ShopStaffCustomerPolicy } from './customer/roles/shop-staff'
import { TenantOwnerSettingsPolicy } from './settings/roles/tenant-owner'
import { ShopOwnerSettingsPolicy } from './settings/roles/shop-owner'
import { AllReadShopPolicy } from './shop/index'
import type { CustomerPermissions, CustomerPlanFeatures } from './customer/types'
import type { SettingsPermissions, SettingsPlanFeatures } from './settings/types'
import type { ShopPermissions } from './shop/types'

/**
 * PBAC の対象×ロール→ポリシークラスを一元管理する。
 *
 * - **developer / tenant_staff / system** は現仕様では **tenant_owner と同一の TenantOwner*Policy** にマッピングしている（意図的な共有）。
 *   将来ロールごとに差分が必要になったら、専用 Policy クラスへ分割するか、下記ファクトリだけ差し替える。
 * - **shop** ターゲットは全ロール **AllReadShopPolicy**（現仕様は閲覧のみ同一）。
 */
function tenantOwnerCustomerPolicy(ctx: PolicyContext) {
  return new TenantOwnerCustomerPolicy(ctx)
}

function tenantOwnerSettingsPolicy(ctx: PolicyContext) {
  return new TenantOwnerSettingsPolicy(ctx)
}

function allReadShopPolicy(ctx: PolicyContext) {
  return new AllReadShopPolicy(ctx)
}

export const POLICY_MAP = {
  customer: {
    developer: tenantOwnerCustomerPolicy,
    tenant_owner: tenantOwnerCustomerPolicy,
    tenant_staff: tenantOwnerCustomerPolicy,
    shop_owner: (ctx: PolicyContext) => new ShopOwnerCustomerPolicy(ctx),
    shop_staff: (ctx: PolicyContext) => new ShopStaffCustomerPolicy(ctx),
    system: tenantOwnerCustomerPolicy,
  },
  settings: {
    developer: tenantOwnerSettingsPolicy,
    tenant_owner: tenantOwnerSettingsPolicy,
    tenant_staff: tenantOwnerSettingsPolicy,
    shop_owner: (ctx: PolicyContext) => new ShopOwnerSettingsPolicy(ctx),
    shop_staff: (ctx: PolicyContext) => new ShopOwnerSettingsPolicy(ctx),
    system: tenantOwnerSettingsPolicy,
  },
  shop: {
    developer: allReadShopPolicy,
    tenant_owner: allReadShopPolicy,
    tenant_staff: allReadShopPolicy,
    shop_owner: allReadShopPolicy,
    shop_staff: allReadShopPolicy,
    system: allReadShopPolicy,
  },
} as const

export type PolicyTarget = keyof typeof POLICY_MAP

export type CustomerPolicyActionKey = keyof (CustomerPermissions & CustomerPlanFeatures)
export type SettingsPolicyActionKey = keyof (SettingsPermissions & SettingsPlanFeatures)
export type ShopPolicyActionKey = keyof ShopPermissions

export type PolicyOption =
  | { target: 'customer'; action: CustomerPolicyActionKey }
  | { target: 'settings'; action: SettingsPolicyActionKey }
  | { target: 'shop'; action: ShopPolicyActionKey }

export type Action = {
  customer: CustomerPolicyActionKey
  settings: SettingsPolicyActionKey
  shop: ShopPolicyActionKey
}

export function buildPermissionDeniedMessage(target: PolicyTarget, action: string): string {
  return `Permission denied: ${target}.${action}`
}
