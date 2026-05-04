import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import type { HonoEnv } from '../type'
import type { AuthContext, PolicyContext, TenantId, ShopId, Role } from 'shared/permission/types'
import type { RelationMap, ResourceIdMap, Relation } from 'shared/permission/scope/types'
import { registry } from 'shared/permission/scope/registry'
import { POLICY_MAP, type PolicyTarget, buildPermissionDeniedMessage } from 'shared/permission/policy/context'
import { schema } from '../rdb/index'

type PolicyOption = {
  target: PolicyTarget
  action: string
}

type ReBACOption<K extends keyof RelationMap> = {
  resourceTable: K
  anyOfRoles?: RelationMap[K] | RelationMap[K][]
  getId: (c: Context<HonoEnv>) => ResourceIdMap[K]
}

type AuthorizeOptions<K extends keyof RelationMap = keyof RelationMap> = {
  policy?: PolicyOption
  relation?: ReBACOption<K>
}

export function authorize<K extends keyof RelationMap = keyof RelationMap>(
  options: AuthorizeOptions<K>,
) {
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

    // Gate 2: ReBAC（DBアクセス）
    if (options.relation) {
      const db = c.get('db')
      const resourceId = options.relation.getId(c)
      let relation: Relation | null = null

      if (options.relation.resourceTable === 'tenant_assignment') {
        // JWT の tenantId と URL の tenantId を照合するだけ（DBアクセス不要）
        const tenantId = resourceId as TenantId
        if (auth.tenantId === tenantId) {
          relation = registry.tenant_assignment(auth.userId, { role: auth.role })
        }
      } else if (options.relation.resourceTable === 'shop_assignment') {
        const shopId = resourceId as ShopId
        const row = await db
          .select()
          .from(schema.shopAssignments)
          .where(eq(schema.shopAssignments.userId, auth.userId))
          .all()
          .then((rows) => rows.find((r) => r.shopId === shopId) ?? null)
        if (row) {
          relation = registry.shop_assignment(auth.userId, {
            adminUserId: row.userId,
            shopId: row.shopId as ShopId,
          })
        }
      }

      const required = options.relation.anyOfRoles
      const allowed = !required
        ? relation !== null
        : Array.isArray(required)
          ? (required as Relation[]).includes(relation as Relation)
          : relation === required

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

  // shop_owner / shop_staff → shop_assignments から shopId を取得
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
