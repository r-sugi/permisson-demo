import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import type { ShopRow } from '../rdb/models/shops'
import type { ShopRepository as ShopRepositoryPort } from '@shared/permission/scope/resolver-types'

export class ShopRepository implements ShopRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async findById(shopId: string) {
    const row = await this.db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).get()
    if (!row) return null
    return { tenantId: row.tenantId }
  }

  listActiveByTenantId(tenantId: string): Promise<ShopRow[]> {
    return this.db.select().from(schema.shops).where(eq(schema.shops.tenantId, tenantId)).all()
  }

  async listActiveByShopId(shopId: string): Promise<ShopRow[]> {
    const row = await this.db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).get()
    return row ? [row] : []
  }

  async countActiveByTenantId(tenantId: string): Promise<number> {
    const rows = await this.listActiveByTenantId(tenantId)
    return rows.length
  }

  async insertShop(params: { id: string; tenantId: string; name: string }): Promise<ShopRow | undefined> {
    await this.db.insert(schema.shops).values(params).run()
    return this.db.select().from(schema.shops).where(eq(schema.shops.id, params.id)).get()
  }

  async deleteById(shopId: string): Promise<void> {
    await this.db.delete(schema.shopAssignments).where(eq(schema.shopAssignments.shopId, shopId)).run()
    await this.db.delete(schema.shops).where(eq(schema.shops.id, shopId)).run()
  }
}
