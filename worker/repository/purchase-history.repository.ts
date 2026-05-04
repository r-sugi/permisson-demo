import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import type { PurchaseHistoryRepository as PurchaseHistoryRepositoryPort } from 'shared/permission/scope/resolver-types'

export class PurchaseHistoryRepository implements PurchaseHistoryRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async findByCustomerId(customerId: string) {
    const row = await this.db
      .select()
      .from(schema.purchaseHistories)
      .where(eq(schema.purchaseHistories.customerId, customerId))
      .get()
    if (!row) return null
    return { shopId: row.shopId }
  }
}
