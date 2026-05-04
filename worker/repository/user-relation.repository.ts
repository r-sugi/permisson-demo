import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Role } from 'shared/permission/types'
import type { Relation } from 'shared/permission/scope/types'
import type { DrizzleDb } from '../services/database.service'
import { schema } from '../rdb/index'

/** admin_users / shop_assignments を参照してユーザの ReBAC relation を返す。 */
export class UserRelationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async resolveForUser(userId: string): Promise<{ relation: Relation; resourceId: string }> {
    const user = await this.db
      .select()
      .from(schema.adminUsers)
      .where(eq(schema.adminUsers.id, userId))
      .get()

    if (!user) throw new HTTPException(403, { message: 'User not found' })

    const role = user.role as Role
    if (role === 'tenant_owner' || role === 'tenant_staff' || role === 'developer') {
      return { relation: role as Relation, resourceId: user.tenantId }
    }

    const shopAssignment = await this.db
      .select()
      .from(schema.shopAssignments)
      .where(eq(schema.shopAssignments.userId, userId))
      .get()

    if (shopAssignment) {
      return { relation: 'shop_assigned', resourceId: shopAssignment.shopId }
    }

    throw new HTTPException(403, { message: 'User has no assignment' })
  }
}
