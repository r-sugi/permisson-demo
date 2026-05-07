import type { AuthContext, Role } from '@shared/permission/types'
import type { Context, Next } from 'hono'
import type { HonoEnv } from '../type'
import { AuthContextRepository } from '../repository/auth-context.repository'
import { NotFoundError, SubscriptionInactiveError } from '@shared/error/my-app-error'

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwt')

  const db = c.get('db')
  const repo = new AuthContextRepository(db)
  const response = await repo.tryAuthenticateUser(payload.sub, payload.tenantId)

  if (!response.result) {
    if (response.error === 'user_not_found') {
      throw new NotFoundError('User not found')
    }
    throw new SubscriptionInactiveError()
  }

  const { adminUserForAuth: u, plan } = response

  c.set('auth', {
    userId: u.sub,
    tenantId: u.tenantId,
    role: u.role,
    plan,
  } satisfies AuthContext)

  await next()
}
