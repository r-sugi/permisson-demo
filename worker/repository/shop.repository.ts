import { eq, inArray, or, type SQL } from 'drizzle-orm'
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

  /** shop_assignments と JOIN し、ユーザーに割り当てられた店舗のみ（一覧スコープ用） */
  listAssignedShopsForUser(userId: string): Promise<ShopRow[]> {
    return this.db
      .select({
        id: schema.shops.id,
        tenantId: schema.shops.tenantId,
        name: schema.shops.name,
        createdAt: schema.shops.createdAt,
      })
      .from(schema.shops)
      .innerJoin(schema.shopAssignments, eq(schema.shopAssignments.shopId, schema.shops.id))
      .where(eq(schema.shopAssignments.userId, userId))
      .all()
  }

  async listActiveByShopId(shopId: string): Promise<ShopRow[]> {
    const row = await this.db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).get()
    return row ? [row] : []
  }

  /** 複数店舗 ID（shop_assignments のユニオン）。SQLite の変数上限を避け inArray を分割 */
  async listActiveByShopIds(shopIds: string[]): Promise<ShopRow[]> {
    if (shopIds.length === 0) return []
    const limit = 900
    if (shopIds.length <= limit) {
      return this.db.select().from(schema.shops).where(inArray(schema.shops.id, shopIds)).all()
    }
    const parts: SQL[] = []
    for (let i = 0; i < shopIds.length; i += limit) {
      parts.push(inArray(schema.shops.id, shopIds.slice(i, i + limit)))
    }
    const condition = or(...parts)
    if (condition === undefined) {
      throw new Error('listActiveByShopIds: OR condition is undefined')
    }
    return this.db.select().from(schema.shops).where(condition).all()
  }

  async countActiveByTenantId(tenantId: string): Promise<number> {
    const rows = await this.listActiveByTenantId(tenantId)
    return rows.length
  }

  async insertShop(params: {
    id: string
    tenantId: string
    name: string
  }): Promise<ShopRow | undefined> {
    await this.db.insert(schema.shops).values(params).run()
    return this.db.select().from(schema.shops).where(eq(schema.shops.id, params.id)).get()
  }

  async deleteById(shopId: string): Promise<void> {
    await this.db
      .delete(schema.shopAssignments)
      .where(eq(schema.shopAssignments.shopId, shopId))
      .run()
    await this.db.delete(schema.shops).where(eq(schema.shops.id, shopId)).run()
  }
}
