import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { HonoEnv } from '../type'
import type { AuthContext, Role, Plan } from 'shared/permission/types'
import { SubscriptionRepository } from '../repository/subscription.repository'

type JwtPayload = {
  sub: string
  role: Role
  tenantId: string
  iat?: number
  exp?: number
}

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwtPayload') as JwtPayload

  const subscriptionRepo = new SubscriptionRepository(c.get('db'))
  const subscription = await subscriptionRepo.findValidByTenantId(payload.tenantId)
  if (!subscription) {
    throw new HTTPException(401, { message: 'Subscription is not active' })
  }

  c.set('auth', {
    userId: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role as Role,
    plan: subscription.plan as Plan,
  } satisfies AuthContext)

  await next()
}
