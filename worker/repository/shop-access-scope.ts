import type { ShopRow } from '../rdb/models/shops'
import { ShopRepository } from './shop.repository'

export interface ShopScope {
  listAccessible(): Promise<ShopRow[]>
}

export class TenantShopScope implements ShopScope {
  constructor(
    private readonly tenantId: string,
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByTenantId(this.tenantId)
  }
}

/** shop_owner / shop_staff など複数 shop_assignments に対応 */
export class AssignedShopsScope implements ShopScope {
  constructor(
    private readonly shopIds: string[],
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByShopIds(this.shopIds)
  }
}
