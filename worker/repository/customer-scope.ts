import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import { BaseCustomerScope } from '@shared/permission/scope/customer/scope'
import type { AuthContext } from '@shared/permission/types'
import { and, asc, eq, exists, gt, inArray, sql } from 'drizzle-orm'
import { schema } from '../rdb/index'
import type { DrizzleDb } from '../services/database.service'
import { type CustomerRowWithDisplay, fetchCustomersWithDisplayForIds } from './customer.repository'

const SQLITE_PARAM_LIMIT = 900

export type CustomerScopeAuth = Pick<AuthContext, 'tenantId' | 'shopIds'>

function purchaseHistoryScopeWhere(auth: CustomerScopeAuth) {
  if (auth.shopIds.length === 0) {
    return sql`1 = 0`
  }
  return and(
    eq(schema.purchaseHistories.tenantId, auth.tenantId),
    inArray(schema.purchaseHistories.shopId, auth.shopIds),
  )
}

function purchaseHistoryScopeExists(db: DrizzleDb, auth: CustomerScopeAuth) {
  return exists(
    db
      .select({ x: schema.purchaseHistories.customerId })
      .from(schema.purchaseHistories)
      .where(
        and(
          purchaseHistoryScopeWhere(auth),
          eq(schema.purchaseHistories.customerId, schema.customers.id),
        ),
      ),
  )
}

class UnifiedCustomerScope extends BaseCustomerScope {
  constructor(
    private readonly auth: CustomerScopeAuth,
    private readonly db: DrizzleDb,
  ) {
    super()
  }

  async findCustomerRows(cursor: string | null, limit: number): Promise<CustomerRowWithDisplay[]> {
    const scopeWhere = purchaseHistoryScopeWhere(this.auth)
    const whereClause = cursor
      ? and(scopeWhere, gt(schema.purchaseHistories.customerId, cursor))
      : scopeWhere
    const idRows = await this.db
      .select({ id: schema.purchaseHistories.customerId })
      .from(schema.purchaseHistories)
      .where(whereClause)
      .groupBy(schema.purchaseHistories.customerId)
      .orderBy(asc(schema.purchaseHistories.customerId))
      .limit(limit)
      .all()
    const ids = idRows.map((r) => r.id)
    return fetchCustomersWithDisplayForIds(this.db, ids)
  }

  async isCustomerInScope(customerId: string): Promise<boolean> {
    const row = await this.db
      .select()
      .from(schema.customers)
      .where(
        and(eq(schema.customers.id, customerId), purchaseHistoryScopeExists(this.db, this.auth)),
      )
      .get()
    return row !== undefined
  }

  async filterAccessibleIds(customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return []
    const chunks: string[][] = []
    for (let i = 0; i < customerIds.length; i += SQLITE_PARAM_LIMIT) {
      chunks.push(customerIds.slice(i, i + SQLITE_PARAM_LIMIT))
    }
    const scopePred = purchaseHistoryScopeExists(this.db, this.auth)
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

  async countCustomers(): Promise<number> {
    const row = await this.db
      .select({
        n: sql<number>`count(distinct ${schema.purchaseHistories.customerId})`.mapWith(Number),
      })
      .from(schema.purchaseHistories)
      .where(purchaseHistoryScopeWhere(this.auth))
      .get()
    return row?.n ?? 0
  }
}

export function createCustomerScope(auth: CustomerScopeAuth, db: DrizzleDb): CustomerScope {
  return new UnifiedCustomerScope(auth, db)
}
