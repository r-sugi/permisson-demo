import type { RelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '../types'

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
    const assignment = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, history.shopId)
    return assignment !== null
  }
