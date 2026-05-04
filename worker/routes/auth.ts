import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { zValidator } from '@hono/zod-validator'
import { ulid } from "ulidx"
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { HonoEnv } from '../type'
import { schema } from '../rdb/index'
import type { Role } from '@shared/permission/types'
import { isTenantAssignmentRole } from '@shared/permission/scope/types'
import { buildPermissionsMap } from '@shared/permission/permissions'
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
    const tenantA         = ulid() // A社 (pro)
    const tenantA_basic   = ulid() // A社 (basic)
    const tenantA_starter = ulid() // A社 (starter)
    const tenantB         = ulid() // B社 (basic)
    const tenantB_pro     = ulid() // B社 (pro)
    const tenantB_starter = ulid() // B社 (starter)

    await db
      .insert(schema.tenants)
      .values([
        { id: tenantA,         name: 'A社' },
        { id: tenantA_basic,   name: 'A社' },
        { id: tenantA_starter, name: 'A社' },
        { id: tenantB,         name: 'B社' },
        { id: tenantB_pro,     name: 'B社' },
        { id: tenantB_starter, name: 'B社' },
      ])
      .run()

    // ─── サブスクリプション ───
    await db
      .insert(schema.subscriptions)
      .values([
        { id: ulid(), tenantId: tenantA,         plan: 'pro',     status: 'active' },
        { id: ulid(), tenantId: tenantA_basic,   plan: 'basic',   status: 'active' },
        { id: ulid(), tenantId: tenantA_starter, plan: 'starter', status: 'active' },
        { id: ulid(), tenantId: tenantB,         plan: 'basic',   status: 'active' },
        { id: ulid(), tenantId: tenantB_pro,     plan: 'pro',     status: 'active' },
        { id: ulid(), tenantId: tenantB_starter, plan: 'starter', status: 'active' },
      ])
      .run()

    // ─── 店舗 ───
    const shopA1         = ulid() // A社(pro) 渋谷店
    const shopA2         = ulid() // A社(pro) 新宿店
    const shopA_basic1   = ulid() // A社(basic) 渋谷店
    const shopA_starter1 = ulid() // A社(starter) 渋谷店
    const shopB1         = ulid() // B社(basic) 梅田店
    const shopB2         = ulid() // B社(basic) 難波店
    const shopB_pro1     = ulid() // B社(pro) 梅田店
    const shopB_starter1 = ulid() // B社(starter) 梅田店

    await db
      .insert(schema.shops)
      .values([
        { id: shopA1,         tenantId: tenantA,         name: 'A社 渋谷店' },
        { id: shopA2,         tenantId: tenantA,         name: 'A社 新宿店' },
        { id: shopA_basic1,   tenantId: tenantA_basic,   name: 'A社 渋谷店' },
        { id: shopA_starter1, tenantId: tenantA_starter, name: 'A社 渋谷店' },
        { id: shopB1,         tenantId: tenantB,         name: 'B社 梅田店' },
        { id: shopB2,         tenantId: tenantB,         name: 'B社 難波店' },
        { id: shopB_pro1,     tenantId: tenantB_pro,     name: 'B社 梅田店' },
        { id: shopB_starter1, tenantId: tenantB_starter, name: 'B社 梅田店' },
      ])
      .run()

    // ─── ユーザー ───
    // A社(pro)
    const userAlice   = ulid() // tenant_owner
    const userBob     = ulid() // tenant_staff
    const userGrace   = ulid() // shop_owner
    const userHenry   = ulid() // shop_staff
    // A社(basic)
    const userEve     = ulid() // tenant_owner
    const userFrank   = ulid() // tenant_staff
    const userNora    = ulid() // shop_owner
    const userOliver  = ulid() // shop_staff
    // A社(starter)
    const userPaul    = ulid() // tenant_owner
    const userQuinn   = ulid() // tenant_staff
    const userRachel  = ulid() // shop_owner
    const userSam     = ulid() // shop_staff
    // B社(basic)
    const userCharlie = ulid() // tenant_owner
    const userDiana   = ulid() // tenant_staff
    const userIris    = ulid() // shop_owner
    const userJack    = ulid() // shop_staff
    // B社(pro)
    const userTom     = ulid() // tenant_owner
    const userUma     = ulid() // tenant_staff
    const userVictor  = ulid() // shop_owner
    const userWendy   = ulid() // shop_staff
    // B社(starter)
    const userXavier  = ulid() // tenant_owner
    const userYara    = ulid() // tenant_staff
    const userZoe     = ulid() // shop_owner
    const userAlex    = ulid() // shop_staff

    // D1 のSQL変数上限を避けるため、8件ずつ分割してinsert
    await db.insert(schema.adminUsers).values([
      { id: userAlice,   email: 'alice@example.com',   passwordHash: pw, tenantId: tenantA,         role: 'tenant_owner' },
      { id: userBob,     email: 'bob@example.com',     passwordHash: pw, tenantId: tenantA,         role: 'tenant_staff' },
      { id: userGrace,   email: 'grace@example.com',   passwordHash: pw, tenantId: tenantA,         role: 'shop_owner' },
      { id: userHenry,   email: 'henry@example.com',   passwordHash: pw, tenantId: tenantA,         role: 'shop_staff' },
      { id: userEve,     email: 'eve@example.com',     passwordHash: pw, tenantId: tenantA_basic,   role: 'tenant_owner' },
      { id: userFrank,   email: 'frank@example.com',   passwordHash: pw, tenantId: tenantA_basic,   role: 'tenant_staff' },
      { id: userNora,    email: 'nora@example.com',    passwordHash: pw, tenantId: tenantA_basic,   role: 'shop_owner' },
      { id: userOliver,  email: 'oliver@example.com',  passwordHash: pw, tenantId: tenantA_basic,   role: 'shop_staff' },
    ]).run()
    await db.insert(schema.adminUsers).values([
      { id: userPaul,    email: 'paul@example.com',    passwordHash: pw, tenantId: tenantA_starter, role: 'tenant_owner' },
      { id: userQuinn,   email: 'quinn@example.com',   passwordHash: pw, tenantId: tenantA_starter, role: 'tenant_staff' },
      { id: userRachel,  email: 'rachel@example.com',  passwordHash: pw, tenantId: tenantA_starter, role: 'shop_owner' },
      { id: userSam,     email: 'sam@example.com',     passwordHash: pw, tenantId: tenantA_starter, role: 'shop_staff' },
      { id: userCharlie, email: 'charlie@example.com', passwordHash: pw, tenantId: tenantB,         role: 'tenant_owner' },
      { id: userDiana,   email: 'diana@example.com',   passwordHash: pw, tenantId: tenantB,         role: 'tenant_staff' },
      { id: userIris,    email: 'iris@example.com',    passwordHash: pw, tenantId: tenantB,         role: 'shop_owner' },
      { id: userJack,    email: 'jack@example.com',    passwordHash: pw, tenantId: tenantB,         role: 'shop_staff' },
    ]).run()
    await db.insert(schema.adminUsers).values([
      { id: userTom,     email: 'tom@example.com',     passwordHash: pw, tenantId: tenantB_pro,     role: 'tenant_owner' },
      { id: userUma,     email: 'uma@example.com',     passwordHash: pw, tenantId: tenantB_pro,     role: 'tenant_staff' },
      { id: userVictor,  email: 'victor@example.com',  passwordHash: pw, tenantId: tenantB_pro,     role: 'shop_owner' },
      { id: userWendy,   email: 'wendy@example.com',   passwordHash: pw, tenantId: tenantB_pro,     role: 'shop_staff' },
      { id: userXavier,  email: 'xavier@example.com',  passwordHash: pw, tenantId: tenantB_starter, role: 'tenant_owner' },
      { id: userYara,    email: 'yara@example.com',    passwordHash: pw, tenantId: tenantB_starter, role: 'tenant_staff' },
      { id: userZoe,     email: 'zoe@example.com',     passwordHash: pw, tenantId: tenantB_starter, role: 'shop_owner' },
      { id: userAlex,    email: 'alex@example.com',    passwordHash: pw, tenantId: tenantB_starter, role: 'shop_staff' },
    ]).run()

    // ─── Shop Assignments ───
    await db
      .insert(schema.shopAssignments)
      .values([
        // A社(pro)
        { id: ulid(), userId: userGrace,  shopId: shopA1 },
        { id: ulid(), userId: userHenry,  shopId: shopA1 },
        // A社(basic)
        { id: ulid(), userId: userNora,   shopId: shopA_basic1 },
        { id: ulid(), userId: userOliver, shopId: shopA_basic1 },
        // A社(starter)
        { id: ulid(), userId: userRachel, shopId: shopA_starter1 },
        { id: ulid(), userId: userSam,    shopId: shopA_starter1 },
        // B社(basic)
        { id: ulid(), userId: userIris,   shopId: shopB1 },
        { id: ulid(), userId: userJack,   shopId: shopB1 },
        // B社(pro)
        { id: ulid(), userId: userVictor, shopId: shopB_pro1 },
        { id: ulid(), userId: userWendy,  shopId: shopB_pro1 },
        // B社(starter)
        { id: ulid(), userId: userZoe,    shopId: shopB_starter1 },
        { id: ulid(), userId: userAlex,   shopId: shopB_starter1 },
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
        // A社(pro)
        { email: 'alice@example.com',   role: 'tenant_owner', tenant: 'A社', plan: 'pro' },
        { email: 'bob@example.com',     role: 'tenant_staff', tenant: 'A社', plan: 'pro' },
        { email: 'grace@example.com',   role: 'shop_owner',   shop: 'A社 渋谷店', plan: 'pro' },
        { email: 'henry@example.com',   role: 'shop_staff',   shop: 'A社 渋谷店', plan: 'pro' },
        // A社(basic)
        { email: 'eve@example.com',     role: 'tenant_owner', tenant: 'A社', plan: 'basic' },
        { email: 'frank@example.com',   role: 'tenant_staff', tenant: 'A社', plan: 'basic' },
        { email: 'nora@example.com',    role: 'shop_owner',   shop: 'A社 渋谷店', plan: 'basic' },
        { email: 'oliver@example.com',  role: 'shop_staff',   shop: 'A社 渋谷店', plan: 'basic' },
        // A社(starter)
        { email: 'paul@example.com',    role: 'tenant_owner', tenant: 'A社', plan: 'starter' },
        { email: 'quinn@example.com',   role: 'tenant_staff', tenant: 'A社', plan: 'starter' },
        { email: 'rachel@example.com',  role: 'shop_owner',   shop: 'A社 渋谷店', plan: 'starter' },
        { email: 'sam@example.com',     role: 'shop_staff',   shop: 'A社 渋谷店', plan: 'starter' },
        // B社(basic)
        { email: 'charlie@example.com', role: 'tenant_owner', tenant: 'B社', plan: 'basic' },
        { email: 'diana@example.com',   role: 'tenant_staff', tenant: 'B社', plan: 'basic' },
        { email: 'iris@example.com',    role: 'shop_owner',   shop: 'B社 梅田店', plan: 'basic' },
        { email: 'jack@example.com',    role: 'shop_staff',   shop: 'B社 梅田店', plan: 'basic' },
        // B社(pro)
        { email: 'tom@example.com',     role: 'tenant_owner', tenant: 'B社', plan: 'pro' },
        { email: 'uma@example.com',     role: 'tenant_staff', tenant: 'B社', plan: 'pro' },
        { email: 'victor@example.com',  role: 'shop_owner',   shop: 'B社 梅田店', plan: 'pro' },
        { email: 'wendy@example.com',   role: 'shop_staff',   shop: 'B社 梅田店', plan: 'pro' },
        // B社(starter)
        { email: 'xavier@example.com',  role: 'tenant_owner', tenant: 'B社', plan: 'starter' },
        { email: 'yara@example.com',    role: 'tenant_staff', tenant: 'B社', plan: 'starter' },
        { email: 'zoe@example.com',     role: 'shop_owner',   shop: 'B社 梅田店', plan: 'starter' },
        { email: 'alex@example.com',    role: 'shop_staff',   shop: 'B社 梅田店', plan: 'starter' },
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

    const isTenantLevel = isTenantAssignmentRole(auth.role)
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
