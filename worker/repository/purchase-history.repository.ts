import type { PurchaseHistoryRepository as PurchaseHistoryRepositoryPort } from '@shared/permission/scope/resolver-types'
import { eq, inArray, sql } from 'drizzle-orm'
import { schema } from '../rdb/index'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'

export class PurchaseHistoryRepository implements PurchaseHistoryRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async insert(
    executor: DrizzleExecutor,
    values: { id: string; customerId: string; shopId: string; tenantId: string },
  ): Promise<void> {
    await executor
      .insert(schema.purchaseHistories)
      .values({
        id: values.id,
        customerId: values.customerId,
        shopId: values.shopId,
        tenantId: values.tenantId,
      })
      .run()
  }

  async findByCustomerId(customerId: string) {
    const row = await this.db
      .select()
      .from(schema.purchaseHistories)
      .where(eq(schema.purchaseHistories.customerId, customerId))
      .get()
    if (!row) return null
    return { shopId: row.shopId }
  }

  /** 店舗ごとのユニーク顧客数（purchase_histories 経由） */
  async countDistinctCustomersByShopIds(shopIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (shopIds.length === 0) return map
    const limit = 900
    for (let i = 0; i < shopIds.length; i += limit) {
      const chunk = shopIds.slice(i, i + limit)
      const rows = await this.db
        .select({
          shopId: schema.purchaseHistories.shopId,
          n: sql<number>`count(distinct ${schema.purchaseHistories.customerId})`.mapWith(Number),
        })
        .from(schema.purchaseHistories)
        .where(inArray(schema.purchaseHistories.shopId, chunk))
        .groupBy(schema.purchaseHistories.shopId)
        .all()
      for (const r of rows) {
        map.set(r.shopId, r.n)
      }
    }
    return map
  }

  async evaluateCustomerShopAccess(
    customerId: string,
    authTenantId: string,
    authShopIds: string[],
  ): Promise<{ allowedByTenant: boolean; allowedByShopAssignment: boolean } | null> {
    const rows =
      authShopIds.length === 0
        ? await this.db
            .select({
              tenantMatch:
                sql<number>`max(case when ${schema.purchaseHistories.tenantId} = ${authTenantId} then 1 else 0 end)`,
              shopMatch: sql<number>`0`,
            })
            .from(schema.purchaseHistories)
            .where(eq(schema.purchaseHistories.customerId, customerId))
            .all()
        : await this.db
            .select({
              tenantMatch:
                sql<number>`max(case when ${schema.purchaseHistories.tenantId} = ${authTenantId} then 1 else 0 end)`,
              shopMatch:
                sql<number>`max(case when ${inArray(schema.purchaseHistories.shopId, authShopIds)} then 1 else 0 end)`,
            })
            .from(schema.purchaseHistories)
            .where(eq(schema.purchaseHistories.customerId, customerId))
            .all()

    if (rows.length === 0) return null
    const row = rows[0]
    return {
      allowedByTenant: (row.tenantMatch ?? 0) === 1,
      allowedByShopAssignment: (row.shopMatch ?? 0) === 1,
    }
  }
}
