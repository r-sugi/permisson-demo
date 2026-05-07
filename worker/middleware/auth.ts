import type { AuthContext, Role } from '@shared/permission/types'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { HonoEnv } from '../type'
import { AuthContextRepository } from '../repository/auth-context.repository'

type JwtPayload = {
  sub: string
  role: Role
  tenantId: string
  iat?: number
  exp?: number
}

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwtPayload') as JwtPayload

  const db = c.get('db')
  const repo = new AuthContextRepository(db)
  const response = await repo.tryAuthenticateUser(payload.sub, payload.tenantId)

  if (!response.result) {
    if (response.error === 'user_not_found') {
      throw new HTTPException(404, { message: 'User not found' })
    }
    throw new HTTPException(401, { message: 'Subscription is not active' })
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
