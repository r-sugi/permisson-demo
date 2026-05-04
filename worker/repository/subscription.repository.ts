import { eq, and } from 'drizzle-orm'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'

export class SubscriptionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findValidByTenantId(tenantId: string) {
    return this.db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.tenantId, tenantId),
          eq(schema.subscriptions.status, 'active'),
        ),
      )
      .get()
  }
}
