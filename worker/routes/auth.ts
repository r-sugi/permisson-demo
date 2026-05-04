import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { zValidator } from '@hono/zod-validator'
import { ulid } from "ulidx"
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { HonoEnv } from '../type'
import { schema } from '../rdb/index'
import type { Role } from 'shared/permission/types'
import { buildPermissionsMap } from 'shared/permission/permissions'
// ─────────────────────────────────────────────
// パスワードハッシュ（Web Crypto API）
// ─────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash
}

// ─────────────────────────────────────────────
// JWTペイロード型
// ─────────────────────────────────────────────
type JwtPayload = {
  sub: string
  role: Role
  tenantId: string
}

// ─────────────────────────────────────────────
// tenantId・role の解決（ログイン時）
// ─────────────────────────────────────────────
async function resolveUserMeta(
  db: ReturnType<typeof import('../services/database.service').createDatabaseConnection>,
  userId: string,
): Promise<{ role: Role; tenantId: string } | null> {
  const user = await db
    .select({ role: schema.adminUsers.role, tenantId: schema.adminUsers.tenantId })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, userId))
    .get()

  if (!user || !user.tenantId) return null
  return { role: user.role as Role, tenantId: user.tenantId }
}

// ─────────────────────────────────────────────
// Public Auth Routes
// ─────────────────────────────────────────────

export const publicAuthRoutes = new Hono<HonoEnv>()

  // POST /api/auth/login
  .post(
    '/login',
    zValidator(
      'json',
      z.object({ email: z.string().email(), password: z.string().min(1) }),
    ),
    async (c) => {
      const { email, password } = c.req.valid('json')
      const db = c.get('db')

      const user = await db
        .select()
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.email, email))
        .get()

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new HTTPException(401, { message: 'メールアドレスまたはパスワードが正しくありません' })
      }

      const meta = await resolveUserMeta(db, user.id)
      if (!meta) {
        throw new HTTPException(401, { message: 'ユーザーにアサインメントがありません' })
      }

      const payload: JwtPayload = { sub: user.id, role: meta.role, tenantId: meta.tenantId }
      const token = await sign(payload, c.env.JWT_SECRET, 'HS256')

      return c.json({ token, role: meta.role, tenantId: meta.tenantId })
    },
  )

  // POST /api/auth/seed（開発用シードデータリセット）
  .post('/seed', async (c) => {
    const db = c.get('db')

    // 既存データクリア（FK順）
    await db.delete(schema.purchaseHistories).run()
    await db.delete(schema.shopAssignments).run()
    await db.delete(schema.customers).run()
    await db.delete(schema.shops).run()
    await db.delete(schema.subscriptions).run()
    await db.delete(schema.tenants).run()
    await db.delete(schema.adminUsers).run()

    const pw = await hashPassword('password')

    // ─── テナント ───
    const tenantA = ulid()
    const tenantB = ulid()

    await db
      .insert(schema.tenants)
      .values([
        { id: tenantA, name: 'A社' },
        { id: tenantB, name: 'B社' },
      ])
      .run()

    // ─── サブスクリプション ───
    await db
      .insert(schema.subscriptions)
      .values([
        { id: ulid(), tenantId: tenantA, plan: 'pro', status: 'active' },
        { id: ulid(), tenantId: tenantB, plan: 'basic', status: 'active' },
      ])
      .run()

    // ─── 店舗 ───
    const shopA1 = ulid()
    const shopA2 = ulid()
    const shopB1 = ulid()
    const shopB2 = ulid()

    await db
      .insert(schema.shops)
      .values([
        { id: shopA1, tenantId: tenantA, name: 'A社 渋谷店' },
        { id: shopA2, tenantId: tenantA, name: 'A社 新宿店' },
        { id: shopB1, tenantId: tenantB, name: 'B社 梅田店' },
        { id: shopB2, tenantId: tenantB, name: 'B社 難波店' },
      ])
      .run()

    // ─── ユーザー ───
    const userAlice   = ulid() // tenant_owner × A社 (pro)
    const userBob     = ulid() // tenant_staff × A社 (pro)
    const userCharlie = ulid() // tenant_owner × B社 (basic)
    const userDiana   = ulid() // tenant_staff × B社 (basic)
    const userGrace   = ulid() // shop_owner × A社/shopA1 (pro)
    const userHenry   = ulid() // shop_staff × A社/shopA1 (pro)
    const userIris    = ulid() // shop_owner × B社/shopB1 (basic)
    const userJack    = ulid() // shop_staff × B社/shopB1 (basic)

    await db
      .insert(schema.adminUsers)
      .values([
        { id: userAlice,   email: 'alice@example.com',   passwordHash: pw, tenantId: tenantA, role: 'tenant_owner' },
        { id: userBob,     email: 'bob@example.com',     passwordHash: pw, tenantId: tenantA, role: 'tenant_staff' },
        { id: userCharlie, email: 'charlie@example.com', passwordHash: pw, tenantId: tenantB, role: 'tenant_owner' },
        { id: userDiana,   email: 'diana@example.com',   passwordHash: pw, tenantId: tenantB, role: 'tenant_staff' },
        { id: userGrace,   email: 'grace@example.com',   passwordHash: pw, tenantId: tenantA, role: 'shop_owner' },
        { id: userHenry,   email: 'henry@example.com',   passwordHash: pw, tenantId: tenantA, role: 'shop_staff' },
        { id: userIris,    email: 'iris@example.com',    passwordHash: pw, tenantId: tenantB, role: 'shop_owner' },
        { id: userJack,    email: 'jack@example.com',    passwordHash: pw, tenantId: tenantB, role: 'shop_staff' },
      ])
      .run()

    // ─── Shop Assignments ───
    await db
      .insert(schema.shopAssignments)
      .values([
        { id: ulid(), userId: userGrace, shopId: shopA1 },
        { id: ulid(), userId: userHenry, shopId: shopA1 },
        { id: ulid(), userId: userIris,  shopId: shopB1 },
        { id: ulid(), userId: userJack,  shopId: shopB1 },
      ])
      .run()

    // ─── 顧客 ───
    const customers = [
      // A社 shopA1 (4件)
      { id: ulid(), name: '田中 一郎', email: 'tanaka1@example.com', tag: 'VIP', memo: 'A社常連' },
      { id: ulid(), name: '佐藤 花子', email: 'sato@example.com', tag: null, memo: null },
      { id: ulid(), name: '鈴木 太郎', email: 'suzuki@example.com', tag: 'リピーター', memo: null },
      { id: ulid(), name: '高橋 美咲', email: 'takahashi@example.com', tag: null, memo: 'クーポン利用済み' },
      // A社 shopA2 (3件)
      { id: ulid(), name: '伊藤 さくら', email: 'ito@example.com', tag: 'VIP', memo: null },
      { id: ulid(), name: '山本 浩介', email: 'yamamoto@example.com', tag: null, memo: null },
      { id: ulid(), name: '中村 麻衣', email: 'nakamura@example.com', tag: null, memo: null },
      // B社 shopB1 (4件)
      { id: ulid(), name: '小林 悠介', email: 'kobayashi@example.com', tag: 'VIP', memo: 'B社常連' },
      { id: ulid(), name: '加藤 のぞみ', email: 'kato@example.com', tag: null, memo: null },
      { id: ulid(), name: '吉田 隼人', email: 'yoshida@example.com', tag: 'リピーター', memo: null },
      { id: ulid(), name: '山田 あかり', email: 'yamada@example.com', tag: null, memo: null },
      // B社 shopB2 (3件)
      { id: ulid(), name: '松本 大輝', email: 'matsumoto@example.com', tag: null, memo: null },
      { id: ulid(), name: '井上 莉奈', email: 'inoue@example.com', tag: null, memo: null },
      { id: ulid(), name: '木村 直樹', email: 'kimura@example.com', tag: null, memo: null },
    ]

    await db.insert(schema.customers).values(customers).run()

    // ─── purchase_histories ───
    const shopCustomerMap: Array<[string, number[]]> = [
      [shopA1, [0, 1, 2, 3]],
      [shopA2, [4, 5, 6]],
      [shopB1, [7, 8, 9, 10]],
      [shopB2, [11, 12, 13]],
    ]

    const purchaseValues = shopCustomerMap.flatMap(([shopId, customerIndices]) =>
      customerIndices.map((i) => ({
        id: ulid(),
        customerId: customers[i].id,
        shopId,
      })),
    )
    await db.insert(schema.purchaseHistories).values(purchaseValues).run()

    return c.json({
      message: 'Seed data reset successfully',
      users: [
        { email: 'alice@example.com',   role: 'tenant_owner', tenant: 'A社', plan: 'pro' },
        { email: 'bob@example.com',     role: 'tenant_staff', tenant: 'A社', plan: 'pro' },
        { email: 'charlie@example.com', role: 'tenant_owner', tenant: 'B社', plan: 'basic' },
        { email: 'diana@example.com',   role: 'tenant_staff', tenant: 'B社', plan: 'basic' },
        { email: 'grace@example.com',   role: 'shop_owner',   shop: 'A社 渋谷店', plan: 'pro' },
        { email: 'henry@example.com',   role: 'shop_staff',   shop: 'A社 渋谷店', plan: 'pro' },
        { email: 'iris@example.com',    role: 'shop_owner',   shop: 'B社 梅田店', plan: 'basic' },
        { email: 'jack@example.com',    role: 'shop_staff',   shop: 'B社 梅田店', plan: 'basic' },
      ],
      password: 'password',
    })
  })

// ─────────────────────────────────────────────
// Protected Auth Routes
// ─────────────────────────────────────────────

export const protectedAuthRoutes = new Hono<HonoEnv>()

  // GET /api/auth/me
  .get('/me', async (c) => {
    const auth = c.get('auth')
    const db = c.get('db')

    const user = await db
      .select({
        id: schema.adminUsers.id,
        email: schema.adminUsers.email,
        tenantName: schema.tenants.name,
      })
      .from(schema.adminUsers)
      .leftJoin(schema.tenants, eq(schema.adminUsers.tenantId, schema.tenants.id))
      .where(eq(schema.adminUsers.id, auth.userId))
      .get()

    if (!user) throw new HTTPException(404, { message: 'User not found' })

    const isTenantLevel = ['tenant_owner', 'tenant_staff', 'developer'].includes(auth.role)
    let shopScope: string
    if (isTenantLevel) {
      shopScope = '全て'
    } else {
      const assignedShops = await db
        .select({ name: schema.shops.name })
        .from(schema.shopAssignments)
        .leftJoin(schema.shops, eq(schema.shopAssignments.shopId, schema.shops.id))
        .where(eq(schema.shopAssignments.userId, auth.userId))
        .all()
      shopScope = assignedShops.map((s) => s.name).filter(Boolean).join(', ') || '-'
    }

    const permissions = buildPermissionsMap({
      role: auth.role,
      plan: auth.plan,
      shop_ids: [],
    })

    return c.json({ ...user, role: auth.role, plan: auth.plan, shopScope, permissions })
  })
