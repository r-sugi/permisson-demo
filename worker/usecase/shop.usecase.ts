import { buildPermissionsMap, policyContextFromAuth } from '@shared/permission/permissions'
import type { AuthContext } from '@shared/permission/types'
import { SHOP_LIMIT_UNLIMITED } from '@shared/permission/types'
import { ulid } from 'ulidx'
import type { PurchaseHistoryRepository } from '../repository/purchase-history.repository'
import type { ShopRepository } from '../repository/shop.repository'
import type { ShopAccessRepository } from '../repository/shop-access.repository'
import { ResourceNotFoundError, ShopCreationLimitExceededError } from '@shared/error/my-app-error'

export class ShopUseCase {
  constructor(
    private readonly shopRepo: ShopRepository,
    private readonly shopAccess: ShopAccessRepository,
    private readonly purchaseHistoryRepo: PurchaseHistoryRepository,
    private readonly auth: AuthContext,
  ) {}

  async listShops() {
    const shops = await this.shopAccess.listAccessible()
    const counts = await this.purchaseHistoryRepo.countDistinctCustomersByShopIds(
      shops.map((s) => s.id),
    )
    return shops.map((s) => ({ ...s, customerCount: counts.get(s.id) ?? 0 }))
  }

  async createShop(tenantId: string, name: string) {
    const { createShopLimit } = buildPermissionsMap(policyContextFromAuth(this.auth)).settings

    const currentCount = await this.shopRepo.countActiveByTenantId(tenantId)

    if (currentCount >= createShopLimit) {
      throw new ShopCreationLimitExceededError(
        `店舗作成上限（${createShopLimit === SHOP_LIMIT_UNLIMITED ? '無制限' : `${createShopLimit}件`}）に達しています（現在: ${currentCount}件）`,
      )
    }

    const id = ulid()
    return this.shopRepo.insertShop({ id, tenantId, name })
  }

  async deleteShop(shopId: string) {
    const shop = await this.shopRepo.findById(shopId)
    if (!shop || shop.tenantId !== this.auth.tenantId) {
      throw new ResourceNotFoundError('Not Found')
    }
    await this.shopRepo.deleteById(shopId)
    return { shopId }
  }

  async getShopCountByTenant(tenantId: string): Promise<number> {
    return this.shopRepo.countActiveByTenantId(tenantId)
  }
}
