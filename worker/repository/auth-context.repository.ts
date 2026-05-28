import type { Plan, Role } from '@shared/permission/types'
import { and, eq, sql } from 'drizzle-orm'
import { TENANT_ASSIGNMENT_ROLES } from '@shared/permission/scope/types'
import { schema } from '../rdb/index'
import type { DrizzleDb } from '../services/database.service'

export type AuthBootstrapResult =
  | { result: false; error: 'user_not_found' | 'subscription_inactive' }
  | {
      result: true
      plan: Plan
      adminUserForAuth: { sub: string; tenantId: string; role: Role }
      shopIds: string[]
    }

/**
 * 認証ミドルウェア用: admin_users は登録時に必ず plan（既定 starter）を持ち、
 * API 利用可否はテナントに active な subscriptions があるかで判定する。
 */
export class AuthContextRepository {
  constructor(private readonly db: DrizzleDb) {}

  async tryAuthenticateUser(userId: string, tenantId: string): Promise<AuthBootstrapResult> {
    const tenantRolePred = TENANT_ASSIGNMENT_ROLES.reduce<ReturnType<typeof sql>>((acc, r) => {
      if (!acc) return sql`${schema.adminUsers.role} = ${r}`
      return sql`${acc} or ${schema.adminUsers.role} = ${r}`
    }, null as unknown as ReturnType<typeof sql>)

    const row = await this.db
      .select({
        sub: schema.adminUsers.id,
        tenantIdCol: schema.adminUsers.tenantId,
        role: schema.adminUsers.role,
        plan: schema.adminUsers.plan,
        subscriptionId: schema.subscriptions.id,
        shopIdsJson: sql<string | null>`
          case
            when ${tenantRolePred}
              then (
                select json_group_array(${schema.shops.id})
                from ${schema.shops}
                where ${schema.shops.tenantId} = ${schema.adminUsers.tenantId}
              )
            else (
              select json_group_array(${schema.shops.id})
              from ${schema.shopAssignments}
              inner join ${schema.shops} on ${schema.shops.id} = ${schema.shopAssignments.shopId}
              where ${schema.shopAssignments.userId} = ${schema.adminUsers.id}
                and ${schema.shops.tenantId} = ${schema.adminUsers.tenantId}
            )
          end
        `.as('shopIdsJson'),
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

    const role = row.role as Role
    const shopIds =
      row.shopIdsJson && row.shopIdsJson.length > 0
        ? (JSON.parse(row.shopIdsJson) as unknown[]).filter((v): v is string => typeof v === 'string')
        : []

    return {
      result: true,
      plan: row.plan as Plan,
      adminUserForAuth: {
        sub: row.sub,
        tenantId: row.tenantIdCol,
        role,
      },
      shopIds,
    }
  }
}
