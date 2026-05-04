import type { AuthContext } from '../types'

export interface ShopAssignmentRepository {
  findByUserIdAndShopId(
    userId: string,
    shopId: string,
  ): Promise<{ userId: string; shopId: string } | null>
}

export interface ShopRepository {
  findById(shopId: string): Promise<{ tenantId: string; deletedAt: string | null } | null>
}

export interface PurchaseHistoryRepository {
  findByCustomerId(customerId: string): Promise<{ shopId: string } | null>
}

export type Repositories = {
  shopAssignment: ShopAssignmentRepository
  shop: ShopRepository
  purchaseHistory: PurchaseHistoryRepository
}

export type RelationResolver = (repos: Repositories, auth: AuthContext) => Promise<boolean>
