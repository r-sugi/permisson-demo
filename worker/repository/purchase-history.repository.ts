import { eq } from 'drizzle-orm'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'
import { schema } from '../rdb/index'
import type { PurchaseHistoryRepository as PurchaseHistoryRepositoryPort } from '@shared/permission/scope/resolver-types'

export class PurchaseHistoryRepository implements PurchaseHistoryRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async insert(
    executor: DrizzleExecutor,
    values: { id: string; customerId: string; shopId: string },
  ): Promise<void> {
    await executor.insert(schema.purchaseHistories).values(values).run()
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
}
