import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import type { SQL } from 'drizzle-orm'
import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { schema } from '../rdb/index'
import type { CustomerRow } from '../rdb/models/customers'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'
import { createCustomerScope } from './customer-scope'
import { UserRelationRepository } from './user-relation.repository'

const EXPORT_PAGE_SIZE = 500

/** PH が複数あるときは `min(id)` で代表行を 1 件に寄せる（シード・作成フローでは実質 1 件） */
function phFirstPickSubquery(db: DrizzleDb) {
  return db
    .select({
      customerId: schema.purchaseHistories.customerId,
      pickPhId: sql<string>`min(${schema.purchaseHistories.id})`.as('pickPhId'),
    })
    .from(schema.purchaseHistories)
    .groupBy(schema.purchaseHistories.customerId)
    .as('ph_first')
}

export type CustomerRowWithDisplay = CustomerRow & {
  displayName: string
}

/** `{顧客名} {テナント名}-{店舗名}`（店舗名が `{テナント名} ` で始まる場合は重複を除く）を SELECT 時に算出 */
const customerWithDisplaySelection = {
  ...getTableColumns(schema.customers),
  displayName: sql<string>`${schema.customers.name} || ' ' || ${schema.tenants.name} || '-' || CASE WHEN ${
    schema.shops.name
  } LIKE ${schema.tenants.name} || ' %' THEN SUBSTR(${schema.shops.name}, LENGTH(${schema.tenants.name}) + 2) ELSE ${
    schema.shops.name
  } END`
    .mapWith(String)
    .as('displayName'),
} satisfies Record<string, unknown>

/** スコープ WHERE 付きの一覧用クエリ（customer-scope から利用） */
export function customerRowsWithDisplayQuery(db: DrizzleDb, whereClause: SQL, limit: number) {
  const phFirst = phFirstPickSubquery(db)
  return db
    .select(customerWithDisplaySelection)
    .from(schema.customers)
    .innerJoin(phFirst, eq(schema.customers.id, phFirst.customerId))
    .innerJoin(schema.purchaseHistories, eq(schema.purchaseHistories.id, phFirst.pickPhId))
    .innerJoin(schema.shops, eq(schema.shops.id, schema.purchaseHistories.shopId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.shops.tenantId))
    .where(whereClause)
    .orderBy(asc(schema.customers.id))
    .limit(limit)
}

function getCustomerWithDisplayById(db: DrizzleDb, customerId: string) {
  const phFirst = phFirstPickSubquery(db)
  return db
    .select(customerWithDisplaySelection)
    .from(schema.customers)
    .innerJoin(phFirst, eq(schema.customers.id, phFirst.customerId))
    .innerJoin(schema.purchaseHistories, eq(schema.purchaseHistories.id, phFirst.pickPhId))
    .innerJoin(schema.shops, eq(schema.shops.id, schema.purchaseHistories.shopId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.shops.tenantId))
    .where(eq(schema.customers.id, customerId))
    .get()
}

export class CustomerRepository {
  private scopeCache?: CustomerScope

  private constructor(
    private readonly userId: string,
    private readonly db: DrizzleDb,
    private readonly userRelations: UserRelationRepository,
  ) {}

  static create(
    userId: string,
    db: DrizzleDb,
    userRelations = new UserRelationRepository(db),
  ): CustomerRepository {
    return new CustomerRepository(userId, db, userRelations)
  }

  private async resolveScope(): Promise<CustomerScope> {
    if (!this.scopeCache) {
      const resolution = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache = createCustomerScope(resolution, this.db)
    }
    return this.scopeCache
  }

  /**
   * カーソルベースの1ページ。`pageLimit` 件まで返し、次ページがあるとき `nextCursor` に最終行の id を入れる。
   * 内部で `pageLimit + 1` 件取得して有無を判定する。
   */
  async findPage(
    cursor: string | null,
    pageLimit: number,
  ): Promise<{ items: CustomerRowWithDisplay[]; nextCursor: string | null }> {
    const scope = await this.resolveScope()
    const rows = (await scope.findCustomerRows(cursor, pageLimit + 1)) as CustomerRowWithDisplay[]
    const hasMore = rows.length > pageLimit
    const items = hasMore ? rows.slice(0, pageLimit) : rows
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.id : null
    return { items, nextCursor }
  }

  async findById(customerId: string) {
    const scope = await this.resolveScope()
    const ok = await scope.isCustomerInScope(customerId)
    if (!ok) {
      throw new HTTPException(404, { message: 'Not Found' })
    }
    return getCustomerWithDisplayById(this.db, customerId)
  }

  async validateIds(customerIds: string[]): Promise<string[]> {
    const scope = await this.resolveScope()
    return scope.validateCustomerIds(customerIds)
  }

  async insert(
    executor: DrizzleExecutor,
    values: { id: string; name: string; email: string; tag?: string; memo?: string },
  ): Promise<void> {
    await executor.insert(schema.customers).values(values).run()
  }

  /** 作成直後の応答など、スコープ解決なしで1件取得する */
  async findRowById(customerId: string) {
    return getCustomerWithDisplayById(this.db, customerId)
  }

  async update(
    customerId: string,
    data: { name?: string; tag?: string | null; memo?: string | null },
  ) {
    await this.findById(customerId)
    await this.db
      .update(schema.customers)
      .set(data)
      .where(eq(schema.customers.id, customerId))
      .run()
    return getCustomerWithDisplayById(this.db, customerId)
  }

  async delete(customerId: string) {
    await this.findById(customerId)
    await this.db.delete(schema.customers).where(eq(schema.customers.id, customerId)).run()
    return { customerId, deleted: true }
  }

  async exportAll() {
    const all: CustomerRowWithDisplay[] = []
    let cursor: string | null = null
    for (;;) {
      const { items, nextCursor } = await this.findPage(cursor, EXPORT_PAGE_SIZE)
      all.push(...items)
      if (nextCursor === null) break
      cursor = nextCursor
    }
    return all
  }
}
