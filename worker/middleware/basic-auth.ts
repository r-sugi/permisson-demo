import { basicAuth } from 'hono/basic-auth'
import type { MiddlewareHandler } from 'hono/types'
import type { HonoEnv } from '../type'

/** `/login` ページ用の Basic 認証 */
export function basicAuthMiddleware(): MiddlewareHandler<HonoEnv> {
  return basicAuth({
    verifyUser: (username, password, c) =>
      username === c.env.BASIC_AUTH_USERNAME && password === c.env.BASIC_AUTH_PASSWORD,
    realm: 'authz-sandbox',
  })
}
