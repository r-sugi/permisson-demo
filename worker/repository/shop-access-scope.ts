import type { Relation } from '@shared/permission/scope/types'
import type { ShopRow } from '../rdb/models/shops'
import { ShopRepository } from './shop.repository'

// ─────────────────────────────────────────────
// Scope 実装（店舗一覧の解決）
// ─────────────────────────────────────────────

export interface ShopScope {
  listAccessible(): Promise<ShopRow[]>
}

class TenantShopScope implements ShopScope {
  constructor(
    private readonly tenantId: string,
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByTenantId(this.tenantId)
  }
}

class AssignedShopScope implements ShopScope {
  constructor(
    private readonly shopId: string,
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByShopId(this.shopId)
  }
}

export function createShopAccessScopeMap(
  shops: ShopRepository,
): Record<Relation, (resourceId: string) => ShopScope> {
  return {
    tenant_owner: (resourceId) => new TenantShopScope(resourceId, shops),
    tenant_staff: (resourceId) => new TenantShopScope(resourceId, shops),
    developer: (resourceId) => new TenantShopScope(resourceId, shops),
    shop_assigned: (resourceId) => new AssignedShopScope(resourceId, shops),
  }
}
