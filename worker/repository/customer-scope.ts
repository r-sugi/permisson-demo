import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import { BaseCustomerScope } from '@shared/permission/scope/customer/scope'
import { and, eq, exists, gt, inArray, type SQL } from 'drizzle-orm'
import { schema } from '../rdb/index'
import type { DrizzleDb } from '../services/database.service'
import { type CustomerRowWithDisplay, customerRowsWithDisplayQuery } from './customer.repository'

const SQLITE_PARAM_LIMIT = 900

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

function shopsScopeExists(db: DrizzleDb, userId: string) {
  return exists(
    db
      .select({ id: schema.purchaseHistories.id })
      .from(schema.purchaseHistories)
      .innerJoin(
        schema.shopAssignments,
        and(
          eq(schema.shopAssignments.shopId, schema.purchaseHistories.shopId),
          eq(schema.shopAssignments.userId, userId),
        ),
      )
      .where(eq(schema.purchaseHistories.customerId, schema.customers.id)),
  )
}

function customerWhere(scopeSql: SQL, cursor: string | null): SQL {
  if (!cursor) return scopeSql
  const combined = and(scopeSql, gt(schema.customers.id, cursor))
  if (combined === undefined) throw new Error('customerWhere: combined predicate is undefined')
  return combined
}

class TenantCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly tenantId: string,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async findCustomerRows(cursor: string | null, limit: number): Promise<CustomerRowWithDisplay[]> {
    const scopePred = tenantScopeExists(this.db, this.tenantId)
    return customerRowsWithDisplayQuery(this.db, customerWhere(scopePred, cursor), limit).all()
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
    const scopePred = tenantScopeExists(this.db, this.tenantId)
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        this.db
          .select({ id: schema.customers.id })
          .from(schema.customers)
          .where(and(inArray(schema.customers.id, chunk), scopePred))
          .all(),
      ),
    )
    const out = new Set<string>()
    for (const rows of chunkResults) {
      for (const r of rows) out.add(r.id)
    }
    return [...out]
  }
}

class ShopsCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly userId: string,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async findCustomerRows(cursor: string | null, limit: number): Promise<CustomerRowWithDisplay[]> {
    const scopePred = shopsScopeExists(this.db, this.userId)
    return customerRowsWithDisplayQuery(this.db, customerWhere(scopePred, cursor), limit).all()
  }

  async isCustomerInScope(customerId: string): Promise<boolean> {
    const row = await this.db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), shopsScopeExists(this.db, this.userId)))
      .get()
    return row !== undefined
  }

  async filterAccessibleIds(customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return []
    const chunks: string[][] = []
    for (let i = 0; i < customerIds.length; i += SQLITE_PARAM_LIMIT) {
      chunks.push(customerIds.slice(i, i + SQLITE_PARAM_LIMIT))
    }
    const scopePred = shopsScopeExists(this.db, this.userId)
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        this.db
          .select({ id: schema.customers.id })
          .from(schema.customers)
          .where(and(inArray(schema.customers.id, chunk), scopePred))
          .all(),
      ),
    )
    const out = new Set<string>()
    for (const rows of chunkResults) {
      for (const r of rows) out.add(r.id)
    }
    return [...out]
  }
}

export function createCustomerScope(
  resolution: { kind: 'tenant'; tenantId: string } | { kind: 'shops'; userId: string },
  db: DrizzleDb,
): CustomerScope {
  if (resolution.kind === 'tenant') {
    return new TenantCustomerScope(resolution.tenantId, db)
  }
  return new ShopsCustomerScope(resolution.userId, db)
}
