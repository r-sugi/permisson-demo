import { and, eq } from 'drizzle-orm'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import type { ShopAssignmentRepository as ShopAssignmentRepositoryPort } from '@shared/permission/scope/resolver-types'

export class ShopAssignmentRepository implements ShopAssignmentRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async findByUserIdAndShopId(userId: string, shopId: string) {
    const row = await this.db
      .select()
      .from(schema.shopAssignments)
      .where(and(eq(schema.shopAssignments.userId, userId), eq(schema.shopAssignments.shopId, shopId)))
      .get()
    if (!row) return null
    return { userId: row.userId, shopId: row.shopId }
  }
}
