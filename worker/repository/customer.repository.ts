import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import { eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { schema } from '../rdb/index'
import type { CustomerRow } from '../rdb/models/customers'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'
import { createCustomerScope } from './customer-scope'
import { UserRelationRepository } from './user-relation.repository'
import { ResourceNotFoundError } from '@shared/error/my-app-error'

const EXPORT_PAGE_SIZE = 500

/** SQLite の変数上限対策（サブクエリ結合時にプレースホルダが重複しやすいため控えめに） */
const FETCH_DISPLAY_CHUNK = 80

/** 指定顧客 ID のみに対し、全履歴上の `min(id)` で代表 PH を選ぶ（一覧・単体取得で共通） */
function phFirstPickForCustomerIds(db: DrizzleDb, customerIds: string[]) {
  return db
    .select({
      customerId: schema.purchaseHistories.customerId,
      pickPhId: sql<string>`min(${schema.purchaseHistories.id})`.as('pickPhId'),
    })
    .from(schema.purchaseHistories)
    .where(inArray(schema.purchaseHistories.customerId, customerIds))
    .groupBy(schema.purchaseHistories.customerId)
    .as('ph_first')
}

export type CustomerRowWithDisplay = CustomerRow & {
  displayName: string
}

/** `{顧客名} {テナント名}-{店舗名}`（店舗名が `{テナント名} ` で始まる場合は重複を除く）を SELECT 時に算出 */
const customerWithDisplaySelection = {
  ...getTableColumns(schema.customers),
  displayName:
    sql<string>`${schema.customers.name} || ' ' || ${schema.tenants.name} || '-' || CASE WHEN ${
      schema.shops.name
    } LIKE ${schema.tenants.name} || ' %' THEN SUBSTR(${schema.shops.name}, LENGTH(${schema.tenants.name}) + 2) ELSE ${
      schema.shops.name
    } END`
      .mapWith(String)
      .as('displayName'),
} satisfies Record<string, unknown>

/** 顧客 ID 一覧に対し displayName 付き行を返す（入力順を維持） */
export async function fetchCustomersWithDisplayForIds(
  db: DrizzleDb,
  customerIds: string[],
): Promise<CustomerRowWithDisplay[]> {
  if (customerIds.length === 0) return []
  const orderMap = new Map(customerIds.map((id, i) => [id, i]))
  const rows: CustomerRowWithDisplay[] = []
  for (let i = 0; i < customerIds.length; i += FETCH_DISPLAY_CHUNK) {
    const chunk = customerIds.slice(i, i + FETCH_DISPLAY_CHUNK)
    const phFirst = phFirstPickForCustomerIds(db, chunk)
    const part = await db
      .select(customerWithDisplaySelection)
      .from(schema.customers)
      .innerJoin(phFirst, eq(schema.customers.id, phFirst.customerId))
      .innerJoin(schema.purchaseHistories, eq(schema.purchaseHistories.id, phFirst.pickPhId))
      .innerJoin(schema.shops, eq(schema.shops.id, schema.purchaseHistories.shopId))
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.shops.tenantId))
      .all()
    rows.push(...part)
  }
  rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
  return rows
}

async function getCustomerWithDisplayById(db: DrizzleDb, customerId: string) {
  const rows = await fetchCustomersWithDisplayForIds(db, [customerId])
  return rows[0]
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

  /** 一覧・CSV と同一スコープの顧客総件数 */
  async countInScope(): Promise<number> {
    const scope = await this.resolveScope()
    return scope.countCustomers()
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
      throw new ResourceNotFoundError('Not Found')
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
