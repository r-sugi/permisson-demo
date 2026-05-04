import { eq, isNull, and } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { ulid } from "ulidx"
import type { AuthContext } from 'shared/permission/types'
import { POLICY_MAP } from 'shared/permission/policy/context'
import { SHOP_LIMIT_UNLIMITED } from 'shared/permission/types'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import { resolveUserRelation } from '../middleware/authorize'

export class ShopUseCase {
  constructor(
    private readonly db: DrizzleDb,
    private readonly auth: AuthContext,
  ) {}

  async listShops() {
    const { relation, resourceId } = await resolveUserRelation(this.db, this.auth.userId)

    if (relation === 'tenant_owner' || relation === 'tenant_staff' || relation === 'developer') {
      return this.db
        .select()
        .from(schema.shops)
        .where(and(eq(schema.shops.tenantId, resourceId), isNull(schema.shops.deletedAt)))
        .all()
    }

    if (relation === 'shop_assigned') {
      return this.db
        .select()
        .from(schema.shops)
        .where(and(eq(schema.shops.id, resourceId), isNull(schema.shops.deletedAt)))
        .all()
    }

    return []
  }

  async createShop(tenantId: string, name: string) {
    const { createShopLimit } = POLICY_MAP.settings[this.auth.role]({
      role: this.auth.role,
      plan: this.auth.plan,
      shop_ids: [],
    }).listPermissions()

    const currentShops = await this.db
      .select()
      .from(schema.shops)
      .where(and(eq(schema.shops.tenantId, tenantId), isNull(schema.shops.deletedAt)))
      .all()
    const currentCount = currentShops.length

    if (currentCount >= createShopLimit) {
      throw new HTTPException(422, {
        message: `店舗作成上限（${createShopLimit === SHOP_LIMIT_UNLIMITED ? '無制限' : `${createShopLimit}件`}）に達しています（現在: ${currentCount}件）`,
      })
    }

    const id = ulid()
    await this.db.insert(schema.shops).values({ id, tenantId, name }).run()
    return this.db.select().from(schema.shops).where(eq(schema.shops.id, id)).get()
  }

  async deleteShop(shopId: string) {
    const now = new Date().toISOString()
    await this.db
      .update(schema.shops)
      .set({ deletedAt: now })
      .where(eq(schema.shops.id, shopId))
      .run()
    return { shopId, deletedAt: now }
  }

  async getShopCountByTenant(tenantId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.shops)
      .where(and(eq(schema.shops.tenantId, tenantId), isNull(schema.shops.deletedAt)))
      .all()
    return rows.length
  }
}
