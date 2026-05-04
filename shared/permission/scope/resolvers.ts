import type { GateRelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '@shared/permission/types'
import { isTenantAssignmentRole } from './types'

export const resolveTenantAssignment =
  (tenantId: TenantId): GateRelationResolver =>
  async (_repo, auth) =>
    auth.tenantId === tenantId

export const resolveShopAssignment =
  (shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    const row = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, shopId)
    return row !== null
  }

export const resolveShopViaTenant =
  (shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    const shop = await repo.shop.findById(shopId)
    if (!shop) return false
    return shop.tenantId === auth.tenantId
  }

export const resolveCustomerViaShop =
  (customerId: string): GateRelationResolver =>
  async (repo, auth) => {
    const ev = await repo.purchaseHistory.evaluateCustomerShopAccess(
      customerId,
      auth.userId,
      auth.tenantId,
    )
    if (ev === null) return false
    if (isTenantAssignmentRole(auth.role)) {
      return ev.allowedByTenant
    }
    return ev.allowedByShopAssignment
  }

/** URL の tenantId・JWT・shopId が一致し、店舗が当該テナントに属することを検証する（DELETE 店舗など）。 */
export const resolveShopInTenantContext =
  (tenantId: TenantId, shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    if (auth.tenantId !== tenantId) return false
    const shop = await repo.shop.findById(shopId)
    if (!shop) return false
    return shop.tenantId === auth.tenantId
  }
