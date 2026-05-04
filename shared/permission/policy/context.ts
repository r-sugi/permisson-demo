import type { PolicyContext, Role } from '../types'
import { TenantOwnerCustomerPolicy } from './customer/roles/tenant-owner'
import { ShopOwnerCustomerPolicy } from './customer/roles/shop-owner'
import { ShopStaffCustomerPolicy } from './customer/roles/shop-staff'
import { TenantOwnerSettingsPolicy } from './settings/roles/tenant-owner'
import { ShopOwnerSettingsPolicy } from './settings/roles/shop-owner'
import { AllReadShopPolicy } from './shop/index'

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
export type Action = {
  customer: keyof ReturnType<(typeof POLICY_MAP)['customer'][Role]>['listPermissions'] extends never
    ? string
    : string
  settings: string
  shop: string
}

export function buildPermissionDeniedMessage(target: PolicyTarget, action: string): string {
  return `Permission denied: ${target}.${action}`
}
