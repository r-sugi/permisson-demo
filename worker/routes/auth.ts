import { zValidator } from '@hono/zod-validator'
import { buildPermissionsMap, policyContextFromAuth } from '@shared/permission/permissions'
import { isTenantAssignmentRole } from '@shared/permission/scope/types'
import type { Role } from '@shared/permission/types'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { ulid } from 'ulidx'
import { z } from 'zod'
import { schema } from '../rdb/index'
import type { HonoEnv } from '../type'
import { ResourceNotFoundError, UnauthorizedError } from '@shared/error/my-app-error'

export type DemoUser = {
  email: string
  role: string
  plan: string
  tenantName: string
  shopName: string | null
}

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

/** 既定: A社・B社あわせて約10万件（インデックス前半／後半で店舗側を振り分け） */
const DEFAULT_SEED_CUSTOMERS = 100_000

function seedCustomerTargetFromEnv(countBinding: string | undefined): number {
  if (countBinding === undefined || countBinding === '') return DEFAULT_SEED_CUSTOMERS
  const n = Number.parseInt(countBinding, 10)
  if (!Number.isFinite(n) || n < 14) return DEFAULT_SEED_CUSTOMERS
  return n
}

// ─────────────────────────────────────────────
// JWTペイロード型
// ─────────────────────────────────────────────
type JwtPayload = {
  sub: string
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

  if (!user?.tenantId) return null
  return { role: user.role as Role, tenantId: user.tenantId }
}

// ─────────────────────────────────────────────
// Public Auth Routes
// ─────────────────────────────────────────────

export const publicAuthRoutes = new Hono<HonoEnv>()

  // POST /api/auth/login
  .post(
    '/login',
    zValidator('json', z.object({ email: z.string().email(), password: z.string().min(1) })),
    async (c) => {
      const { email, password } = c.req.valid('json')
      const db = c.get('db')

      const user = await db
        .select()
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.email, email))
        .get()

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません')
      }

      const meta = await resolveUserMeta(db, user.id)
      if (!meta) {
        throw new UnauthorizedError('ユーザーにアサインメントがありません')
      }

      const payload: JwtPayload = { sub: user.id, tenantId: meta.tenantId }
      const token = await sign(payload, c.env.JWT_SECRET, 'HS256')

      return c.json({ token, role: meta.role, tenantId: meta.tenantId })
    },
  )

  // POST /api/auth/seed（開発用シードデータリセット）
  .post('/seed', async (c) => {
    const db = c.get('db')
    const TARGET_CUSTOMERS = seedCustomerTargetFromEnv(c.env.SEED_CUSTOMER_COUNT)

    // 既存データクリア（FK順）
    await db.delete(schema.purchaseHistories).run()
    await db.delete(schema.shopAssignments).run()
    await db.delete(schema.customers).run()
    await db.delete(schema.shops).run()
    await db.delete(schema.subscriptions).run()
    await db.delete(schema.tenants).run()
    await db.delete(schema.adminUsers).run()

    const pw = await hashPassword('password')

    // ─── テナント（社名単位で 1 行。プランは admin_users.plan および課金レコードで表現）───
    const tenantA = ulid()
    const tenantB = ulid()

    await db
      .insert(schema.tenants)
      .values([
        { id: tenantA, name: 'A社' },
        { id: tenantB, name: 'B社' },
      ])
      .run()

    await db
      .insert(schema.subscriptions)
      .values([
        { id: ulid(), tenantId: tenantA, plan: 'pro', status: 'active' },
        { id: ulid(), tenantId: tenantB, plan: 'pro', status: 'active' },
      ])
      .run()

    const shopA1 = ulid() // A社 渋谷店
    const shopA2 = ulid() // A社 新宿店
    const shopB1 = ulid() // B社 梅田店
    const shopB2 = ulid() // B社 難波店

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
    // A社(pro)
    const userAlice = ulid() // tenant_owner
    const userBob = ulid() // tenant_staff
    const userGrace = ulid() // shop_owner
    const userHenry = ulid() // shop_staff
    // A社(basic)
    const userEve = ulid() // tenant_owner
    const userFrank = ulid() // tenant_staff
    const userNora = ulid() // shop_owner
    const userOliver = ulid() // shop_staff
    // A社(starter)
    const userPaul = ulid() // tenant_owner
    const userQuinn = ulid() // tenant_staff
    const userRachel = ulid() // shop_owner
    const userSam = ulid() // shop_staff
    // B社(basic)
    const userCharlie = ulid() // tenant_owner
    const userDiana = ulid() // tenant_staff
    const userIris = ulid() // shop_owner
    const userJack = ulid() // shop_staff
    // B社(pro)
    const userTom = ulid() // tenant_owner
    const userUma = ulid() // tenant_staff
    const userVictor = ulid() // shop_owner
    const userWendy = ulid() // shop_staff
    // B社(starter)
    const userXavier = ulid() // tenant_owner
    const userYara = ulid() // tenant_staff
    const userZoe = ulid() // shop_owner
    const userAlex = ulid() // shop_staff

    // D1 のSQL変数上限を避けるため、8件ずつ分割してinsert
    await db
      .insert(schema.adminUsers)
      .values([
        {
          id: userAlice,
          email: 'alice@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_owner',
          plan: 'pro',
        },
        {
          id: userBob,
          email: 'bob@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_staff',
          plan: 'pro',
        },
        {
          id: userGrace,
          email: 'grace@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_owner',
          plan: 'pro',
        },
        {
          id: userHenry,
          email: 'henry@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_staff',
          plan: 'pro',
        },
        {
          id: userEve,
          email: 'eve@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_owner',
          plan: 'basic',
        },
        {
          id: userFrank,
          email: 'frank@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_staff',
          plan: 'basic',
        },
        {
          id: userNora,
          email: 'nora@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_owner',
          plan: 'basic',
        },
        {
          id: userOliver,
          email: 'oliver@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_staff',
          plan: 'basic',
        },
      ])
      .run()
    await db
      .insert(schema.adminUsers)
      .values([
        {
          id: userPaul,
          email: 'paul@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_owner',
          plan: 'starter',
        },
        {
          id: userQuinn,
          email: 'quinn@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'tenant_staff',
          plan: 'starter',
        },
        {
          id: userRachel,
          email: 'rachel@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_owner',
          plan: 'starter',
        },
        {
          id: userSam,
          email: 'sam@example.com',
          passwordHash: pw,
          tenantId: tenantA,
          role: 'shop_staff',
          plan: 'starter',
        },
        {
          id: userCharlie,
          email: 'charlie@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_owner',
          plan: 'basic',
        },
        {
          id: userDiana,
          email: 'diana@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_staff',
          plan: 'basic',
        },
        {
          id: userIris,
          email: 'iris@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_owner',
          plan: 'basic',
        },
        {
          id: userJack,
          email: 'jack@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_staff',
          plan: 'basic',
        },
      ])
      .run()
    await db
      .insert(schema.adminUsers)
      .values([
        {
          id: userTom,
          email: 'tom@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_owner',
          plan: 'pro',
        },
        {
          id: userUma,
          email: 'uma@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_staff',
          plan: 'pro',
        },
        {
          id: userVictor,
          email: 'victor@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_owner',
          plan: 'pro',
        },
        {
          id: userWendy,
          email: 'wendy@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_staff',
          plan: 'pro',
        },
        {
          id: userXavier,
          email: 'xavier@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_owner',
          plan: 'starter',
        },
        {
          id: userYara,
          email: 'yara@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'tenant_staff',
          plan: 'starter',
        },
        {
          id: userZoe,
          email: 'zoe@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_owner',
          plan: 'starter',
        },
        {
          id: userAlex,
          email: 'alex@example.com',
          passwordHash: pw,
          tenantId: tenantB,
          role: 'shop_staff',
          plan: 'starter',
        },
      ])
      .run()

    // ─── Shop Assignments ───
    await db
      .insert(schema.shopAssignments)
      .values([
        { id: ulid(), userId: userGrace, shopId: shopA1 },
        { id: ulid(), userId: userHenry, shopId: shopA1 },
        { id: ulid(), userId: userNora, shopId: shopA2 },
        { id: ulid(), userId: userOliver, shopId: shopA2 },
        { id: ulid(), userId: userRachel, shopId: shopA1 },
        { id: ulid(), userId: userSam, shopId: shopA1 },
        { id: ulid(), userId: userIris, shopId: shopB1 },
        { id: ulid(), userId: userJack, shopId: shopB1 },
        { id: ulid(), userId: userVictor, shopId: shopB1 },
        { id: ulid(), userId: userWendy, shopId: shopB1 },
        { id: ulid(), userId: userZoe, shopId: shopB1 },
        { id: ulid(), userId: userAlex, shopId: shopB1 },
      ])
      .run()

    // ─── 顧客（既定 100,000 件・顧客インデックス前半は A 社店舗、後半は B 社店舗）───
    const namedTemplates = [
      { name: '田中 一郎', email: 'tanaka1@example.com', tag: 'VIP', memo: 'A社常連' },
      { name: '佐藤 花子', email: 'sato@example.com', tag: null, memo: null },
      { name: '鈴木 太郎', email: 'suzuki@example.com', tag: 'リピーター', memo: null },
      { name: '高橋 美咲', email: 'takahashi@example.com', tag: null, memo: 'クーポン利用済み' },
      { name: '伊藤 さくら', email: 'ito@example.com', tag: 'VIP', memo: null },
      { name: '山本 浩介', email: 'yamamoto@example.com', tag: null, memo: null },
      { name: '中村 麻衣', email: 'nakamura@example.com', tag: null, memo: null },
      { name: '小林 悠介', email: 'kobayashi@example.com', tag: 'VIP', memo: 'B社常連' },
      { name: '加藤 のぞみ', email: 'kato@example.com', tag: null, memo: null },
      { name: '吉田 隼人', email: 'yoshida@example.com', tag: 'リピーター', memo: null },
      { name: '山田 あかり', email: 'yamada@example.com', tag: null, memo: null },
      { name: '松本 大輝', email: 'matsumoto@example.com', tag: null, memo: null },
      { name: '井上 莉奈', email: 'inoue@example.com', tag: null, memo: null },
      { name: '木村 直樹', email: 'kimura@example.com', tag: null, memo: null },
    ] as const

    const namedCustomers = namedTemplates.map((row) => ({
      id: ulid(),
      name: row.name,
      email: row.email,
      tag: row.tag,
      memo: row.memo,
    }))

    const aShops = [shopA1, shopA2] as const
    const bShops = [shopB1, shopB2] as const
    const halfPoint = Math.floor(TARGET_CUSTOMERS / 2)

    const shopIdForCustomerIndex = (index: number): string => {
      const pool = index < halfPoint ? aShops : bShops
      const shopId = pool[index % 2]
      if (shopId === undefined) throw new Error('shop pool is empty')
      return shopId
    }

    // D1 はステートメントあたりの変数数に厳しい上限がある（100 行×列だと too many SQL variables）
    const CUSTOMER_SEED_CHUNK = 20
    await db.insert(schema.customers).values(namedCustomers).run()
    await db
      .insert(schema.purchaseHistories)
      .values(
        namedCustomers.map((row, index) => ({
          id: ulid(),
          customerId: row.id,
          shopId: shopIdForCustomerIndex(index),
          tenantId: index < halfPoint ? tenantA : tenantB,
        })),
      )
      .run()

    for (
      let start = namedCustomers.length;
      start < TARGET_CUSTOMERS;
      start += CUSTOMER_SEED_CHUNK
    ) {
      const end = Math.min(start + CUSTOMER_SEED_CHUNK, TARGET_CUSTOMERS)
      const customerChunk: {
        id: string
        name: string
        email: string
        tag: string | null
        memo: string | null
      }[] = []
      const phChunk: { id: string; customerId: string; shopId: string; tenantId: string }[] = []
      for (let i = start; i < end; i++) {
        const id = ulid()
        customerChunk.push({
          id,
          name: `顧客 ${i}`,
          email: `customer-${i}@example.com`,
          tag: null,
          memo: null,
        })
        phChunk.push({
          id: ulid(),
          customerId: id,
          shopId: shopIdForCustomerIndex(i),
          tenantId: i < halfPoint ? tenantA : tenantB,
        })
      }
      await db.insert(schema.customers).values(customerChunk).run()
      await db.insert(schema.purchaseHistories).values(phChunk).run()
    }

    return c.json({
      message: 'Seed data reset successfully' as const,
      users: [
        // A社(pro)
        { email: 'alice@example.com', role: 'tenant_owner', tenant: 'A社', plan: 'pro' },
        { email: 'bob@example.com', role: 'tenant_staff', tenant: 'A社', plan: 'pro' },
        { email: 'grace@example.com', role: 'shop_owner', shop: 'A社 渋谷店', plan: 'pro' },
        { email: 'henry@example.com', role: 'shop_staff', shop: 'A社 渋谷店', plan: 'pro' },
        // A社(basic)
        { email: 'eve@example.com', role: 'tenant_owner', tenant: 'A社', plan: 'basic' },
        { email: 'frank@example.com', role: 'tenant_staff', tenant: 'A社', plan: 'basic' },
        { email: 'nora@example.com', role: 'shop_owner', shop: 'A社 新宿店', plan: 'basic' },
        { email: 'oliver@example.com', role: 'shop_staff', shop: 'A社 新宿店', plan: 'basic' },
        // A社(starter)
        { email: 'paul@example.com', role: 'tenant_owner', tenant: 'A社', plan: 'starter' },
        { email: 'quinn@example.com', role: 'tenant_staff', tenant: 'A社', plan: 'starter' },
        { email: 'rachel@example.com', role: 'shop_owner', shop: 'A社 渋谷店', plan: 'starter' },
        { email: 'sam@example.com', role: 'shop_staff', shop: 'A社 渋谷店', plan: 'starter' },
        // B社(basic)
        { email: 'charlie@example.com', role: 'tenant_owner', tenant: 'B社', plan: 'basic' },
        { email: 'diana@example.com', role: 'tenant_staff', tenant: 'B社', plan: 'basic' },
        { email: 'iris@example.com', role: 'shop_owner', shop: 'B社 梅田店', plan: 'basic' },
        { email: 'jack@example.com', role: 'shop_staff', shop: 'B社 梅田店', plan: 'basic' },
        // B社(pro)
        { email: 'tom@example.com', role: 'tenant_owner', tenant: 'B社', plan: 'pro' },
        { email: 'uma@example.com', role: 'tenant_staff', tenant: 'B社', plan: 'pro' },
        { email: 'victor@example.com', role: 'shop_owner', shop: 'B社 梅田店', plan: 'pro' },
        { email: 'wendy@example.com', role: 'shop_staff', shop: 'B社 梅田店', plan: 'pro' },
        // B社(starter)
        { email: 'xavier@example.com', role: 'tenant_owner', tenant: 'B社', plan: 'starter' },
        { email: 'yara@example.com', role: 'tenant_staff', tenant: 'B社', plan: 'starter' },
        { email: 'zoe@example.com', role: 'shop_owner', shop: 'B社 梅田店', plan: 'starter' },
        { email: 'alex@example.com', role: 'shop_staff', shop: 'B社 梅田店', plan: 'starter' },
      ],
      password: 'password',
    })
  })

  // GET /api/auth/demo-users（開発用：ログイン画面のユーザー一覧）
  .get('/demo-users', async (c) => {
    const db = c.get('db')

    const rows = await db
      .select({
        email: schema.adminUsers.email,
        role: schema.adminUsers.role,
        plan: schema.adminUsers.plan,
        tenantName: schema.tenants.name,
        shopName: schema.shops.name,
      })
      .from(schema.adminUsers)
      .innerJoin(schema.tenants, eq(schema.adminUsers.tenantId, schema.tenants.id))
      .innerJoin(schema.subscriptions, eq(schema.subscriptions.tenantId, schema.tenants.id))
      .leftJoin(schema.shopAssignments, eq(schema.shopAssignments.userId, schema.adminUsers.id))
      .leftJoin(schema.shops, eq(schema.shops.id, schema.shopAssignments.shopId))
      .all()

    return c.json(rows satisfies DemoUser[])
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

    if (!user) throw new ResourceNotFoundError('User not found')

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
      shopScope =
        assignedShops
          .map((s) => s.name)
          .filter(Boolean)
          .join(', ') || '-'
    }

    const permissions = buildPermissionsMap(policyContextFromAuth(auth))

    return c.json({ ...user, role: auth.role, plan: auth.plan, shopScope, permissions })
  })
