import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { isMyAppError } from '@shared/error'
import type { HonoEnv } from './type'
import { createDatabaseConnection } from './services/database.service'
import { authContextMiddleware } from './middleware/auth'
import { diMiddleware } from './middleware/di'
import { publicAuthRoutes, protectedAuthRoutes } from './routes/auth'
import { customerRoutes } from './routes/customers'
import { shopListRoutes, tenantShopRoutes } from './routes/shops'

export const app = new Hono<HonoEnv>()
  .onError((err, c) => {
    if (isMyAppError(err)) {
      return c.json({ message: err.message }, err.status as ContentfulStatusCode)
    }
    if (err instanceof HTTPException) {
      return err.getResponse()
    }
    console.error(err)
    return c.json({ message: 'Internal Server Error' }, 500)
  })

  // DB 接続ミドルウェア（全 /api/* に適用）
  .use('/api/*', async (c, next) => {
    const db = createDatabaseConnection(c.env.DB)
    await db.run(sql`PRAGMA foreign_keys = ON`)
    c.set('db', db)
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
