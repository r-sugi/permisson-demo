import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import type { HonoEnv } from '../type'
import type { AuthContext, Role, Plan } from '@shared/permission/types'
import { SubscriptionRepository } from '../repository/subscription.repository'
import { schema } from '../rdb/index'

type JwtPayload = {
  sub: string
  role: Role
  tenantId: string
  iat?: number
  exp?: number
}

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwtPayload') as JwtPayload

  // 現状は課金・解約の即時反映のため毎回 DB を参照する。
  // 将来的にキャッシュする場合はキーを tenantId とし、subscriptions.updatedAt（要スキーマ追加）などで世代判定するか、Webhook で無効化する想定。
  const db = c.get('db')
  const subscriptionRepo = new SubscriptionRepository(db)
  const subscription = await subscriptionRepo.findValidByTenantId(payload.tenantId)
  if (!subscription) {
    throw new HTTPException(401, { message: 'Subscription is not active' })
  }

  const userRow = await db
    .select({ plan: schema.adminUsers.plan })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, payload.sub))
    .get()
  if (!userRow) {
    throw new HTTPException(404, { message: 'User not found' })
  }

  c.set('auth', {
    userId: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role as Role,
    plan: userRow.plan as Plan,
  } satisfies AuthContext)

  await next()
}
