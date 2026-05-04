import { and, eq, exists, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import { BaseCustomerScope } from '@shared/permission/scope/customer/scope'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import type { CustomerRow } from '../rdb/models/customers'

const SQLITE_PARAM_LIMIT = 900

/** shop_id IN (大量) を SQLite 変数上限を避けて OR(inArray) に分割 */
function matchShopIdsPredicate(shopIds: string[]): SQL {
  if (shopIds.length === 0) return sql`0`
  if (shopIds.length <= SQLITE_PARAM_LIMIT) {
    return inArray(schema.purchaseHistories.shopId, shopIds)
  }
  const parts: SQL[] = []
  for (let i = 0; i < shopIds.length; i += SQLITE_PARAM_LIMIT) {
    parts.push(inArray(schema.purchaseHistories.shopId, shopIds.slice(i, i + SQLITE_PARAM_LIMIT)))
  }
  return or(...parts)!
}

function tenantScopeExists(db: DrizzleDb, tenantId: string) {
  return exists(
    db
      .select({ id: schema.purchaseHistories.id })
      .from(schema.purchaseHistories)
      .innerJoin(schema.shops, eq(schema.shops.id, schema.purchaseHistories.shopId))
      .where(
        and(
          eq(schema.purchaseHistories.customerId, schema.customers.id),
          eq(schema.shops.tenantId, tenantId),
        ),
      ),
  )
}

function shopsScopeExists(db: DrizzleDb, shopIds: string[]) {
  return exists(
    db
      .select({ id: schema.purchaseHistories.id })
      .from(schema.purchaseHistories)
      .where(
        and(eq(schema.purchaseHistories.customerId, schema.customers.id), matchShopIdsPredicate(shopIds)),
      ),
  )
}

class TenantCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly tenantId: string,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async findAllCustomerRows(): Promise<CustomerRow[]> {
    return this.db
      .select()
      .from(schema.customers)
      .where(tenantScopeExists(this.db, this.tenantId))
      .all()
  }

  async isCustomerInScope(customerId: string): Promise<boolean> {
    const row = await this.db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), tenantScopeExists(this.db, this.tenantId)))
      .get()
    return row !== undefined
  }

  async filterAccessibleIds(customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return []
    const chunks: string[][] = []
    for (let i = 0; i < customerIds.length; i += SQLITE_PARAM_LIMIT) {
      chunks.push(customerIds.slice(i, i + SQLITE_PARAM_LIMIT))
    }
    const out = new Set<string>()
    for (const chunk of chunks) {
      const rows = await this.db
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(and(inArray(schema.customers.id, chunk), tenantScopeExists(this.db, this.tenantId)))
        .all()
      for (const r of rows) out.add(r.id)
    }
    return [...out]
  }
}

class ShopsCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly shopIds: string[],
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async findAllCustomerRows(): Promise<CustomerRow[]> {
    if (this.shopIds.length === 0) return []
    return this.db
      .select()
      .from(schema.customers)
      .where(shopsScopeExists(this.db, this.shopIds))
      .all()
  }

  async isCustomerInScope(customerId: string): Promise<boolean> {
    if (this.shopIds.length === 0) return false
    const row = await this.db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), shopsScopeExists(this.db, this.shopIds)))
      .get()
    return row !== undefined
  }

  async filterAccessibleIds(customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return []
    if (this.shopIds.length === 0) return []
    const chunks: string[][] = []
    for (let i = 0; i < customerIds.length; i += SQLITE_PARAM_LIMIT) {
      chunks.push(customerIds.slice(i, i + SQLITE_PARAM_LIMIT))
    }
    const out = new Set<string>()
    for (const chunk of chunks) {
      const rows = await this.db
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(and(inArray(schema.customers.id, chunk), shopsScopeExists(this.db, this.shopIds)))
        .all()
      for (const r of rows) out.add(r.id)
    }
    return [...out]
  }
}

export function createCustomerScope(
  resolution: { kind: 'tenant'; tenantId: string } | { kind: 'shops'; shopIds: string[] },
  db: DrizzleDb,
): CustomerScope {
  if (resolution.kind === 'tenant') {
    return new TenantCustomerScope(resolution.tenantId, db)
  }
  return new ShopsCustomerScope(resolution.shopIds, db)
}
