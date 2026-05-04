import type { PolicyContext } from '../types'
import { TenantOwnerCustomerPolicy } from './customer/roles/tenant-owner'
import { ShopOwnerCustomerPolicy } from './customer/roles/shop-owner'
import { ShopStaffCustomerPolicy } from './customer/roles/shop-staff'
import { TenantOwnerSettingsPolicy } from './settings/roles/tenant-owner'
import { ShopOwnerSettingsPolicy } from './settings/roles/shop-owner'
import { AllReadShopPolicy } from './shop/index'
import type { CustomerPermissions, CustomerPlanFeatures } from './customer/types'
import type { SettingsPermissions, SettingsPlanFeatures } from './settings/types'
import type { ShopPermissions } from './shop/types'

export const POLICY_MAP = {
  customer: {
    developer: (ctx: PolicyContext) => new TenantOwnerCustomerPolicy(ctx),
    tenant_owner: (ctx: PolicyContext) => new TenantOwnerCustomerPolicy(ctx),
    tenant_staff: (ctx: PolicyContext) => new TenantOwnerCustomerPolicy(ctx),
    shop_owner: (ctx: PolicyContext) => new ShopOwnerCustomerPolicy(ctx),
    shop_staff: (ctx: PolicyContext) => new ShopStaffCustomerPolicy(ctx),
    system: (ctx: PolicyContext) => new TenantOwnerCustomerPolicy(ctx),
  },
  settings: {
    developer: (ctx: PolicyContext) => new TenantOwnerSettingsPolicy(ctx),
    tenant_owner: (ctx: PolicyContext) => new TenantOwnerSettingsPolicy(ctx),
    tenant_staff: (ctx: PolicyContext) => new TenantOwnerSettingsPolicy(ctx),
    shop_owner: (ctx: PolicyContext) => new ShopOwnerSettingsPolicy(ctx),
    shop_staff: (ctx: PolicyContext) => new ShopOwnerSettingsPolicy(ctx),
    system: (ctx: PolicyContext) => new TenantOwnerSettingsPolicy(ctx),
  },
  shop: {
    developer: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
    tenant_owner: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
    tenant_staff: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
    shop_owner: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
    shop_staff: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
    system: (ctx: PolicyContext) => new AllReadShopPolicy(ctx),
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
