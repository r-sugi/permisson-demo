import type { RelationResolver } from './resolver-types'
import type { Role, TenantId, ShopId } from '../types'

function isTenantWideRole(role: Role): boolean {
  return role === 'tenant_owner' || role === 'tenant_staff' || role === 'developer'
}

export const resolveTenantAssignment =
  (tenantId: TenantId): RelationResolver =>
  async (_repo, auth) =>
    auth.tenantId === tenantId

export const resolveShopAssignment =
  (shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    const row = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, shopId)
    return row !== null
  }

export const resolveShopViaTenant =
  (shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    const shop = await repo.shop.findById(shopId)
    if (!shop || shop.deletedAt) return false
    return shop.tenantId === auth.tenantId
  }

export const resolveCustomerViaShop =
  (customerId: string): RelationResolver =>
  async (repo, auth) => {
    const history = await repo.purchaseHistory.findByCustomerId(customerId)
    if (!history) return false
    const shop = await repo.shop.findById(history.shopId)
    if (!shop || shop.deletedAt) return false

    if (isTenantWideRole(auth.role)) {
      return shop.tenantId === auth.tenantId
    }

    const assignment = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, history.shopId)
    return assignment !== null
  }

/** URL の tenantId・JWT・shopId が一致し、店舗が当該テナントに属することを検証する（DELETE 店舗など）。 */
export const resolveShopInTenantContext =
  (tenantId: TenantId, shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    if (auth.tenantId !== tenantId) return false
    const shop = await repo.shop.findById(shopId)
    if (!shop || shop.deletedAt) return false
    return shop.tenantId === auth.tenantId
  }
