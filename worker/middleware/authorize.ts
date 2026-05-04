import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import type { HonoEnv } from '../type'
import type { AuthContext, PolicyContext, Role } from 'shared/permission/types'
import type { Relation } from 'shared/permission/scope/types'
import type { RelationResolver } from 'shared/permission/scope/resolver-types'
import { POLICY_MAP, type PolicyTarget, buildPermissionDeniedMessage } from 'shared/permission/policy/context'
import { schema } from '../rdb/index'

type PolicyOption = {
  target: PolicyTarget
  action: string
}

type AuthorizeOptions = {
  policy?: PolicyOption
  /** リクエストごとに URL 等から Resolver を組み立てる（Hono の Context が必要なため） */
  relation?: {
    resolver: (c: Context<HonoEnv>) => RelationResolver
  }
}

export function authorize(options: AuthorizeOptions) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const auth = c.get('auth') as AuthContext

    // Gate 1: PBAC（role + plan でインメモリ評価・DBアクセスなし）
    if (options.policy) {
      const { target, action } = options.policy
      const context: PolicyContext = { role: auth.role, plan: auth.plan, shop_ids: [] }
      const policy = POLICY_MAP[target][auth.role](context)
      const permissions = policy.listPermissions() as Record<string, unknown>

      if (!permissions[action]) {
        throw new HTTPException(403, {
          message: buildPermissionDeniedMessage(target, action),
        })
      }
    }

    // Gate 2: ReBAC（repository 経由。authorize 本体は resolver の中身を知らない）
    if (options.relation) {
      const relationResolver = options.relation.resolver(c)
      const allowed = await relationResolver(c.get('repos'), auth)
      if (!allowed) {
        throw new HTTPException(404, { message: 'Not Found' })
      }
    }

    await next()
  })
}

// ユーザーのassignmentを引き、relationとresourceIdを返す
export async function resolveUserRelation(
  db: ReturnType<typeof import('../services/database.service').createDatabaseConnection>,
  userId: string,
): Promise<{ relation: Relation; resourceId: string }> {
  const user = await db
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, userId))
    .get()

  if (!user) throw new HTTPException(403, { message: 'User not found' })

  const role = user.role as Role
  if (role === 'tenant_owner' || role === 'tenant_staff' || role === 'developer') {
    return { relation: role as Relation, resourceId: user.tenantId }
  }

  const shopAssignment = await db
    .select()
    .from(schema.shopAssignments)
    .where(eq(schema.shopAssignments.userId, userId))
    .get()

  if (shopAssignment) {
    return { relation: 'shop_assigned', resourceId: shopAssignment.shopId }
  }

  throw new HTTPException(403, { message: 'User has no assignment' })
}
