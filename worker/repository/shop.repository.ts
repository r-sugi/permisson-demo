import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import type { ShopRepository as ShopRepositoryPort } from 'shared/permission/scope/resolver-types'

export class ShopRepository implements ShopRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async findById(shopId: string) {
    const row = await this.db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).get()
    if (!row) return null
    return { tenantId: row.tenantId, deletedAt: row.deletedAt ?? null }
  }
}
