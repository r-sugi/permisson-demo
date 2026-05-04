import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { DrizzleDb, DrizzleExecutor } from '../services/database.service'
import { schema } from '../rdb/index'
import type { CustomerScope } from '@shared/permission/scope/customer/scope'
import type { CustomerRow } from '../rdb/models/customers'
import { UserRelationRepository } from './user-relation.repository'
import { createCustomerScope } from './customer-scope'

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

  private async resolveScope(): Promise<CustomerScope> {
    if (!this.scopeCache) {
      const resolution = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache = createCustomerScope(resolution, this.db)
    }
    return this.scopeCache
  }

  async findAll(): Promise<CustomerRow[]> {
    const scope = await this.resolveScope()
    const rows = await scope.findAllCustomerRows()
    return rows as CustomerRow[]
  }

  async findById(customerId: string) {
    const scope = await this.resolveScope()
    const ok = await scope.isCustomerInScope(customerId)
    if (!ok) {
      throw new HTTPException(404, { message: 'Not Found' })
    }
    return this.db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get()
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
    return this.db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get()
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
