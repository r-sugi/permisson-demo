import type { AuthContext } from '@shared/permission/types'

export interface ShopAssignmentRepository {
  findByUserIdAndShopId(
    userId: string,
    shopId: string,
  ): Promise<{ userId: string; shopId: string } | null>
}

export interface ShopRepository {
  findById(shopId: string): Promise<{ tenantId: string } | null>
}

export interface PurchaseHistoryRepository {
  findByCustomerId(customerId: string): Promise<{ shopId: string } | null>

  /** 顧客に紐づく全 purchase_histories を踏まえ、1クエリで Gate2 判定に必要なフラグを返す。履歴が無ければ null */
  evaluateCustomerShopAccess(
    customerId: string,
    userId: string,
    authTenantId: string,
  ): Promise<{ allowedByTenant: boolean; allowedByShopAssignment: boolean } | null>
}

export type Repositories = {
  shopAssignment: ShopAssignmentRepository
  shop: ShopRepository
  purchaseHistory: PurchaseHistoryRepository
}

/** Gate 2（ReBAC）で評価する `(repo, auth) => Promise<boolean>`。`scope/types.ts` のスコープ用型と混同しないこと。 */
export type GateRelationResolver = (repo: Repositories, auth: AuthContext) => Promise<boolean>
