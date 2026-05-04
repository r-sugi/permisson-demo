import { eq, inArray } from 'drizzle-orm'
import type { Relation } from 'shared/permission/scope/types'
import type { CustomerScope } from 'shared/permission/scope/customer/scope'
import { BaseCustomerScope } from 'shared/permission/scope/customer/scope'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'

// ─────────────────────────────────────────────
// Scope 実装（DB アクセスが必要なため Worker 層に配置）
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

export function createCustomerScopeMap(
  db: DrizzleDb,
): Record<Relation, (resourceId: string) => CustomerScope> {
  return {
    tenant_owner: (resourceId) => new TenantCustomerScope(resourceId, db),
    tenant_staff: (resourceId) => new TenantCustomerScope(resourceId, db),
    developer: (resourceId) => new TenantCustomerScope(resourceId, db),
    shop_assigned: (resourceId) => new ShopCustomerScope(resourceId, db),
  }
}
