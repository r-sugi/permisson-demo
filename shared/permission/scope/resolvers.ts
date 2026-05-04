import type { RelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '../types'

export const resolveTenantAssignment =
  (tenantId: TenantId): RelationResolver =>
  async (_repos, auth) =>
    auth.tenantId === tenantId

export const resolveShopAssignment =
  (shopId: ShopId): RelationResolver =>
  async (repos, auth) => {
    const row = await repos.shopAssignment.findByUserIdAndShopId(auth.userId, shopId)
    return row !== null
  }

export const resolveShopViaTenant =
  (shopId: ShopId): RelationResolver =>
  async (repos, auth) => {
    const shop = await repos.shop.findById(shopId)
    if (!shop || shop.deletedAt) return false
    return shop.tenantId === auth.tenantId
  }

export const resolveCustomerViaShop =
  (customerId: string): RelationResolver =>
  async (repos, auth) => {
    const history = await repos.purchaseHistory.findByCustomerId(customerId)
    if (!history) return false
    const assignment = await repos.shopAssignment.findByUserIdAndShopId(auth.userId, history.shopId)
    return assignment !== null
  }
