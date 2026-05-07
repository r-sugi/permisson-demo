import { eq } from 'drizzle-orm'
import type { Role } from '@shared/permission/types'
import { isTenantAssignmentRole } from '@shared/permission/scope/types'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'
import { ResourceNotFoundError, ForbiddenError } from '@shared/error/my-app-error'

/** テナント紐付け or 店舗割当（複数行可）に基づくスコープ解決 */
export type UserScopeResolution =
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'shops'; userId: string }

/** admin_users / shop_assignments を参照してユーザの ReBAC スコープを返す。 */
export class UserRelationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async resolveForUser(userId: string): Promise<UserScopeResolution> {
    const user = await this.db
      .select()
      .from(schema.adminUsers)
      .where(eq(schema.adminUsers.id, userId))
      .get()

    if (!user) throw new ResourceNotFoundError('User not found')

    const role = user.role as Role
    if (isTenantAssignmentRole(role)) {
      return { kind: 'tenant', tenantId: user.tenantId }
    }

    const hasAssignment = await this.db
      .select({ shopId: schema.shopAssignments.shopId })
      .from(schema.shopAssignments)
      .where(eq(schema.shopAssignments.userId, userId))
      .limit(1)
      .get()

    if (!hasAssignment) {
      throw new ForbiddenError('User has no assignment')
    }

    return { kind: 'shops', userId }
  }
}
