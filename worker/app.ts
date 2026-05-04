import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { cors } from 'hono/cors'
import type { HonoEnv } from './type'
import { createDatabaseConnection } from './services/database.service'
import { authContextMiddleware } from './middleware/auth'
import { diMiddleware } from './middleware/di'
import { publicAuthRoutes, protectedAuthRoutes } from './routes/auth'
import { customerRoutes } from './routes/customers'
import { shopListRoutes, tenantShopRoutes } from './routes/shops'

export const app = new Hono<HonoEnv>()

  // DB 接続ミドルウェア（全 /api/* に適用）
  .use('/api/*', async (c, next) => {
    c.set('db', createDatabaseConnection(c.env.DB))
    await next()
  })

  // CORS
  .use('/api/*', cors())

  // ─── 認証不要なルート（JWT ミドルウェア適用前）───
  .route('/api/auth', publicAuthRoutes)

  // ─── JWT 検証 ───
  .use('/api/*', (c, next) => jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next))

  // ─── AuthContext 注入（plan を DB から取得）───
  .use('/api/*', authContextMiddleware)

  // ─── UseCase・Repository の DI ───
  .use('/api/*', diMiddleware)

  // ─── 保護されたルート ───
  .route('/api/auth', protectedAuthRoutes)
  .route('/api/customers', customerRoutes)
  .route('/api/shops', shopListRoutes)
  .route('/api/tenants', tenantShopRoutes)

export type AppType = typeof app
