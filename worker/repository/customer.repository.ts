import { eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'
import { schema } from '../rdb/index'
import type { Relation } from 'shared/permission/scope/types'
import type { CustomerScope } from 'shared/permission/scope/customer/scope'
import { BaseCustomerScope } from 'shared/permission/scope/customer/scope'
import { UserRelationRepository } from './user-relation.repository'

// ─────────────────────────────────────────────
// Scope 実装（DB アクセスが必要なためWorker層に配置）
// ─────────────────────────────────────────────

class TenantCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly tenantId: string,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async resolveIds(): Promise<string[]> {
    const shopRows = await this.db
      .select({ id: schema.shops.id })
      .from(schema.shops)
      .where(eq(schema.shops.tenantId, this.tenantId))
      .all()
    const shopIds = shopRows.map((s) => s.id)
    if (shopIds.length === 0) return []

    const rows = await this.db
      .select({ customerId: schema.purchaseHistories.customerId })
      .from(schema.purchaseHistories)
      .where(inArray(schema.purchaseHistories.shopId, shopIds))
      .all()
    return [...new Set(rows.map((r) => r.customerId))]
  }
}

class ShopCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly shopId: string,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async resolveIds(): Promise<string[]> {
    const rows = await this.db
      .select({ customerId: schema.purchaseHistories.customerId })
      .from(schema.purchaseHistories)
      .where(eq(schema.purchaseHistories.shopId, this.shopId))
      .all()
    return [...new Set(rows.map((r) => r.customerId))]
  }
}

const scopeMap: Record<Relation, (resourceId: string, db: DrizzleDb) => CustomerScope> = {
  tenant_owner: (resourceId, db) => new TenantCustomerScope(resourceId, db),
  tenant_staff: (resourceId, db) => new TenantCustomerScope(resourceId, db),
  developer: (resourceId, db) => new TenantCustomerScope(resourceId, db),
  shop_assigned: (resourceId, db) => new ShopCustomerScope(resourceId, db),
}

// ─────────────────────────────────────────────
// CustomerRepository
// ─────────────────────────────────────────────

export class CustomerRepository {
  private scopeCache?: CustomerScope

  private constructor(
    private readonly userId: string,
    private readonly db: DrizzleDb,
    private readonly userRelations: UserRelationRepository,
  ) {}

  static create(userId: string, db: DrizzleDb, userRelations = new UserRelationRepository(db)): CustomerRepository {
    return new CustomerRepository(userId, db, userRelations)
  }

  // scope 解決
  private async resolveScope(): Promise<CustomerScope> {
    if (!this.scopeCache) {
      const { relation, resourceId } = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache = scopeMap[relation](resourceId, this.db)
    }
    return this.scopeCache
  }

  async findAll() {
    const scope = await this.resolveScope()
    const accessibleIds = await scope.resolveIds()
    if (accessibleIds.length === 0) return []
    return this.db
      .select()
      .from(schema.customers)
      .where(inArray(schema.customers.id, accessibleIds))
      .all()
  }

  async findById(customerId: string) {
    const scope = await this.resolveScope()
    const accessibleIds = await scope.resolveIds()
    if (!accessibleIds.includes(customerId)) {
      throw new HTTPException(404, { message: 'Not Found' })
    }
    return this.db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .get()
  }

  async validateIds(customerIds: string[]): Promise<string[]> {
    const scope = await this.resolveScope()
    return scope.validateIds(customerIds)
  }

  async insert(
    executor: DrizzleExecutor,
    values: { id: string; name: string; email: string; tag?: string; memo?: string },
  ): Promise<void> {
    await executor.insert(schema.customers).values(values).run()
  }

  /** 作成直後の応答など、スコープ解決なしで1件取得する */
  async findRowById(customerId: string) {
    return this.db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .get()
  }

  async update(customerId: string, data: { name?: string; tag?: string | null; memo?: string | null }) {
    await this.findById(customerId)
    await this.db
      .update(schema.customers)
      .set(data)
      .where(eq(schema.customers.id, customerId))
      .run()
    return this.db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get()
  }

  async delete(customerId: string) {
    await this.findById(customerId)
    await this.db.delete(schema.customers).where(eq(schema.customers.id, customerId)).run()
    return { customerId, deleted: true }
  }

  async exportAll() {
    return this.findAll()
  }
}
