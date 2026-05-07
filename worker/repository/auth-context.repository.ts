import type { Plan, Role } from '@shared/permission/types'
import { and, eq } from 'drizzle-orm'
import { schema } from '../rdb/index'
import type { DrizzleDb } from '../services/database.service'

export type AuthBootstrapResult =
  | { result: false; error: 'user_not_found' | 'subscription_inactive' }
  | {
      result: true
      plan: Plan
      adminUserForAuth: { sub: string; tenantId: string; role: Role }
    }

/**
 * 認証ミドルウェア用: admin_users は登録時に必ず plan（既定 starter）を持ち、
 * API 利用可否はテナントに active な subscriptions があるかで判定する。
 */
export class AuthContextRepository {
  constructor(private readonly db: DrizzleDb) {}

  async tryAuthenticateUser(userId: string, tenantId: string): Promise<AuthBootstrapResult> {
    const row = await this.db
      .select({
        sub: schema.adminUsers.id,
        tenantIdCol: schema.adminUsers.tenantId,
        role: schema.adminUsers.role,
        plan: schema.adminUsers.plan,
        subscriptionId: schema.subscriptions.id,
      })
      .from(schema.adminUsers)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.subscriptions.tenantId, schema.adminUsers.tenantId),
          eq(schema.subscriptions.status, 'active'),
        ),
      )
      .where(and(eq(schema.adminUsers.id, userId), eq(schema.adminUsers.tenantId, tenantId)))
      .get()

    if (!row) {
      return { result: false, error: 'user_not_found' }
    }

    if (!row.subscriptionId) {
      return { result: false, error: 'subscription_inactive' }
    }

    return {
      result: true,
      plan: row.plan as Plan,
      adminUserForAuth: {
        sub: row.sub,
        tenantId: row.tenantIdCol,
        role: row.role as Role,
      },
    }
  }
}
