import { isMyAppError } from '@shared/error'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { jwt } from 'hono/jwt'
import { logger } from 'hono/logger'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { authContextMiddleware } from './middleware/auth'
import { basicAuthMiddleware } from './middleware/basic-auth'
import { diMiddleware } from './middleware/di'
import { protectedAuthRoutes, publicAuthRoutes } from './routes/auth'
import { customerRoutes } from './routes/customers'
import { shopListRoutes, tenantShopRoutes } from './routes/shops'
import { createDatabaseConnection } from './services/database.service'
import type { HonoEnv } from './type'

export const app = new Hono<HonoEnv>()
  .onError((err, c) => {
    // カスタムエラー
    if (isMyAppError(err)) {
      return c.json({ message: err.message }, err.status as ContentfulStatusCode)
    }
    // Hono の HTTPException（Basic 認証 401 等は res に WWW-Authenticate を含む）
    if (err instanceof HTTPException) {
      return err.getResponse()
    }
    // 予期せぬエラー
    console.error(err)
    return c.json({ message: 'Internal Server Error' }, 500)
  })

  .use('/api/*', logger())

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

  // /login のみ Basic 認証（SPA は index を返す）
  .use('/login', basicAuthMiddleware())
  .get('/login', async (c) => {
    const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
    try {
      return await c.env.ASSETS.fetch(indexRequest)
    } catch {
      // dev: ASSETS が未構築の場合は Vite へフォールバック
      return fetch(indexRequest)
    }
  })

export type AppType = typeof app
